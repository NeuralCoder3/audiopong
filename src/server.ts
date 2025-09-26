import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

type PlayerId = string;

type GameConfig = {
  courtWidth: number;
  courtHeight: number;
  paddleWidth: number;
  paddleHeight: number;
  ballSpeed: number;
  ballAccelOnBounce: number; // multiplicative factor on each bounce
  heartsPerPlayer: number;
  ballRadius: number; // in court units
};

type Vector = { x: number; y: number };

type PlayerState = {
  id: PlayerId;
  name?: string;
  volumeRaw: number; // raw RMS ~0..1
  maxRef: number; // normalization reference
  paddleY: number; // center position
};

type GameState = {
  ballPos: Vector;
  ballVel: Vector;
  leftPaddleY: number;
  rightPaddleY: number;
  heartsLeft: number;
  heartsRight: number;
  running: boolean;
  leftVolume: number; // normalized 0..1
  rightVolume: number; // normalized 0..1
  leftMaxRef: number;
  rightMaxRef: number;
  leftVolumeRaw: number;
  rightVolumeRaw: number;
  leftConnected: boolean;
  rightConnected: boolean;
};

type ServerToClientMessage =
  | { type: 'state'; state: GameState; config: GameConfig }
  | { type: 'assign'; side: 'left' | 'right' | 'spectator' };

type ClientRole = 'player' | 'board' | 'calibrate' | 'spectator';

type ClientToServerMessage =
  | { type: 'hello'; name?: string; role?: ClientRole }
  | { type: 'volumeRaw'; value: number }
  | { type: 'maxRef'; value: number }
  | { type: 'setMaxRef'; side: 'left' | 'right'; value: number };

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const __dirnameResolved = path.resolve('.');
const publicDir = path.join(__dirnameResolved, 'public');

// In-memory config and state
let config: GameConfig = {
  courtWidth: 1000,
  courtHeight: 600,
  paddleWidth: 16,
  paddleHeight: 120,
  ballSpeed: 380,
  ballAccelOnBounce: 1.05,
  heartsPerPlayer: 5,
  ballRadius: 8,
};

let state: GameState = {
  ballPos: { x: config.courtWidth / 2, y: config.courtHeight / 2 },
  ballVel: { x: config.ballSpeed, y: config.ballSpeed * 0.3 },
  leftPaddleY: config.courtHeight / 2,
  rightPaddleY: config.courtHeight / 2,
  heartsLeft: config.heartsPerPlayer,
  heartsRight: config.heartsPerPlayer,
  running: false,
  leftVolume: 0,
  rightVolume: 0,
  leftMaxRef: 0.6,
  rightMaxRef: 0.6,
  leftVolumeRaw: 0,
  rightVolumeRaw: 0,
  leftConnected: false,
  rightConnected: false,
};

// Track players
const playerSockets = new Map<PlayerId, WebSocket>();
const playerStates = new Map<PlayerId, PlayerState>();
const clientRoles = new Map<PlayerId, ClientRole>();
let leftPlayerId: PlayerId | null = null;
let rightPlayerId: PlayerId | null = null;

app.use(express.json());
app.use(express.static(publicDir));

// REST API for config
app.get('/api/config', (_req: Request, res: Response) => {
  res.json(config);
});

app.post('/api/config', (req: Request, res: Response) => {
  const body = req.body as Partial<GameConfig>;
  config = { ...config, ...sanitizeConfig(body) };
  res.json(config);
});

// Game controls
app.post('/api/game/start', (_req: Request, res: Response) => {
  if (!state.running) state.running = true;
  res.json({ running: state.running });
});

app.post('/api/game/pause', (_req: Request, res: Response) => {
  state.running = false;
  res.json({ running: state.running });
});

app.post('/api/game/reset', (_req: Request, res: Response) => {
  resetMatch();
  res.json({ ok: true });
});

function sanitizeConfig(input: Partial<GameConfig>): Partial<GameConfig> {
  const output: Partial<GameConfig> = {};
  if (typeof input.courtWidth === 'number' && input.courtWidth >= 200)
    output.courtWidth = Math.min(input.courtWidth, 4000);
  if (typeof input.courtHeight === 'number' && input.courtHeight >= 200)
    output.courtHeight = Math.min(input.courtHeight, 3000);
  if (typeof input.paddleWidth === 'number' && input.paddleWidth >= 4)
    output.paddleWidth = Math.min(input.paddleWidth, 100);
  if (typeof input.paddleHeight === 'number' && input.paddleHeight >= 20)
    output.paddleHeight = Math.min(input.paddleHeight, 600);
  if (typeof input.ballSpeed === 'number' && input.ballSpeed >= 50)
    output.ballSpeed = Math.min(input.ballSpeed, 2000);
  if (typeof input.ballAccelOnBounce === 'number' && input.ballAccelOnBounce >= 1)
    output.ballAccelOnBounce = Math.min(input.ballAccelOnBounce, 1.5);
  if (typeof input.heartsPerPlayer === 'number' && input.heartsPerPlayer >= 1)
    output.heartsPerPlayer = Math.min(Math.floor(input.heartsPerPlayer), 20);
  if (typeof input.ballRadius === 'number' && input.ballRadius >= 2)
    output.ballRadius = Math.min(input.ballRadius, 40);
  return output;
}

// WebSocket handling
wss.on('connection', (ws: WebSocket) => {
  const id = generateId();
  playerSockets.set(id, ws);
  playerStates.set(id, { id, volumeRaw: 0, maxRef: 0.6, paddleY: config.courtHeight / 2 });
  clientRoles.set(id, 'spectator');

  // Default to spectator until client declares role
  const assignMsg: ServerToClientMessage = { type: 'assign', side: 'spectator' };
  ws.send(JSON.stringify(assignMsg));

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientToServerMessage;
      handleClientMessage(id, msg);
    } catch (err) {
      // ignore invalid
    }
  });

  ws.on('close', () => {
    playerSockets.delete(id);
    playerStates.delete(id);
    clientRoles.delete(id);
    if (leftPlayerId === id) leftPlayerId = null;
    if (rightPlayerId === id) rightPlayerId = null;
    // Reassign only real players deterministically if a slot frees up
    if (!leftPlayerId) {
      for (const [pid] of playerSockets) {
        if (clientRoles.get(pid) === 'player' && pid !== rightPlayerId) {
          leftPlayerId = pid;
          const ws2 = playerSockets.get(pid);
          if (ws2 && ws2.readyState === ws2.OPEN) ws2.send(JSON.stringify({ type: 'assign', side: 'left' }));
          break;
        }
      }
    }
    if (!rightPlayerId) {
      for (const [pid] of playerSockets) {
        if (clientRoles.get(pid) === 'player' && pid !== leftPlayerId) {
          rightPlayerId = pid;
          const ws2 = playerSockets.get(pid);
          if (ws2 && ws2.readyState === ws2.OPEN) ws2.send(JSON.stringify({ type: 'assign', side: 'right' }));
          break;
        }
      }
    }
  });
});

function handleClientMessage(id: PlayerId, msg: ClientToServerMessage) {
  const ps = playerStates.get(id);
  if (!ps) return;
  if (msg.type === 'hello') {
    ps.name = msg.name;
    // Assign sides only for player role
    const role = msg.role ?? 'spectator';
    clientRoles.set(id, role);
    // If a non-player somehow occupied a slot, free it
    if (role !== 'player') {
      if (leftPlayerId === id) leftPlayerId = null;
      if (rightPlayerId === id) rightPlayerId = null;
    }
    if (role === 'player') {
      let side: 'left' | 'right' | 'spectator' = 'spectator';
      if (!leftPlayerId) {
        leftPlayerId = id;
        side = 'left';
        state.leftMaxRef = ps.maxRef;
      } else if (!rightPlayerId) {
        rightPlayerId = id;
        side = 'right';
        state.rightMaxRef = ps.maxRef;
      }
      const ws = playerSockets.get(id);
      if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'assign', side } satisfies ServerToClientMessage));
    }
  } else if (msg.type === 'volumeRaw') {
    const vol = Math.max(0, Math.min(1.5, msg.value));
    ps.volumeRaw = vol;
    // Reflect in public state immediately
    if (leftPlayerId === id) {
      state.leftVolumeRaw = vol;
      const norm = clamp(vol / (playerStates.get(id)?.maxRef ?? state.leftMaxRef), 0, 1);
      state.leftVolume = norm;
    } else if (rightPlayerId === id) {
      state.rightVolumeRaw = vol;
      const norm = clamp(vol / (playerStates.get(id)?.maxRef ?? state.rightMaxRef), 0, 1);
      state.rightVolume = norm;
    }
  } else if (msg.type === 'maxRef') {
    const v = clamp(msg.value, 0.02, 1.5);
    ps.maxRef = v;
    if (leftPlayerId === id) {
      state.leftMaxRef = v;
      state.leftVolume = clamp(state.leftVolumeRaw / v, 0, 1);
    } else if (rightPlayerId === id) {
      state.rightMaxRef = v;
      state.rightVolume = clamp(state.rightVolumeRaw / v, 0, 1);
    }
    // Let spectators sync promptly
    broadcast({ type: 'state', state, config });
  } else if (msg.type === 'setMaxRef') {
    const v = clamp(msg.value, 0.02, 1.5);
    if (msg.side === 'left' && leftPlayerId) {
      const p = playerStates.get(leftPlayerId);
      if (p) p.maxRef = v;
      state.leftMaxRef = v;
      state.leftVolume = clamp(state.leftVolumeRaw / v, 0, 1);
    } else if (msg.side === 'right' && rightPlayerId) {
      const p = playerStates.get(rightPlayerId);
      if (p) p.maxRef = v;
      state.rightMaxRef = v;
      state.rightVolume = clamp(state.rightVolumeRaw / v, 0, 1);
    }
    broadcast({ type: 'state', state, config });
  }
}

function broadcast(message: ServerToClientMessage) {
  const text = JSON.stringify(message);
  for (const ws of playerSockets.values()) {
    if (ws.readyState === ws.OPEN) ws.send(text);
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2);
}

// Game loop
let lastTime = Date.now();
const TICK_MS = 1000 / 60;
setInterval(() => {
  // Always broadcast at tick end, but skip physics when not running
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (!state.running) {
    state.leftConnected = !!(leftPlayerId && clientRoles.get(leftPlayerId) === 'player' && playerSockets.get(leftPlayerId)?.readyState === WebSocket.OPEN);
    state.rightConnected = !!(rightPlayerId && clientRoles.get(rightPlayerId) === 'player' && playerSockets.get(rightPlayerId)?.readyState === WebSocket.OPEN);
    broadcast({ type: 'state', state, config });
    return;
  }

  // Update paddle targets from volumes
  const leftRaw = leftPlayerId ? playerStates.get(leftPlayerId)?.volumeRaw ?? 0 : 0;
  const rightRaw = rightPlayerId ? playerStates.get(rightPlayerId)?.volumeRaw ?? 0 : 0;
  const leftRef = leftPlayerId ? playerStates.get(leftPlayerId)?.maxRef ?? 0.6 : 0.6;
  const rightRef = rightPlayerId ? playerStates.get(rightPlayerId)?.maxRef ?? 0.6 : 0.6;
  const leftVol = clamp(leftRaw / leftRef, 0, 1);
  const rightVol = clamp(rightRaw / rightRef, 0, 1);

  state.leftVolume = leftVol;
  state.rightVolume = rightVol;
  state.leftMaxRef = leftRef;
  state.rightMaxRef = rightRef;
  state.leftVolumeRaw = leftRaw;
  state.rightVolumeRaw = rightRaw;

  state.leftPaddleY = (1 - leftVol) * (config.courtHeight - config.paddleHeight) + config.paddleHeight / 2;
  state.rightPaddleY = (1 - rightVol) * (config.courtHeight - config.paddleHeight) + config.paddleHeight / 2;

  // Move ball
  state.ballPos.x += state.ballVel.x * dt;
  state.ballPos.y += state.ballVel.y * dt;

  // Top/bottom collision
  const r = config.ballRadius;
  if (state.ballPos.y <= r) {
    state.ballPos.y = r;
    state.ballVel.y = Math.abs(state.ballVel.y);
  } else if (state.ballPos.y >= config.courtHeight - r) {
    state.ballPos.y = config.courtHeight - r;
    state.ballVel.y = -Math.abs(state.ballVel.y);
  }

  // Paddle collision
  const halfPaddle = config.paddleHeight / 2;
  const paddleXLeft = 40;
  const paddleXRight = config.courtWidth - 40;

  // Left paddle
  if (
    state.ballPos.x <= paddleXLeft + config.paddleWidth + r &&
    state.ballPos.x >= paddleXLeft - r &&
    Math.abs(state.ballPos.y - state.leftPaddleY) <= halfPaddle
  ) {
    state.ballPos.x = paddleXLeft + config.paddleWidth + 1;
    state.ballVel.x = Math.abs(state.ballVel.x) * config.ballAccelOnBounce;
    state.ballVel.y *= config.ballAccelOnBounce;
  }

  // Right paddle
  if (
    state.ballPos.x >= paddleXRight - config.paddleWidth - r &&
    state.ballPos.x <= paddleXRight + r &&
    Math.abs(state.ballPos.y - state.rightPaddleY) <= halfPaddle
  ) {
    state.ballPos.x = paddleXRight - config.paddleWidth - 1;
    state.ballVel.x = -Math.abs(state.ballVel.x) * config.ballAccelOnBounce;
    state.ballVel.y *= config.ballAccelOnBounce;
  }

  // Scoring
  if (state.ballPos.x < 0) {
    // Right scores, left loses a heart
    state.heartsLeft = Math.max(0, state.heartsLeft - 1);
    if (state.heartsLeft === 0) {
      state.running = false;
    }
    resetBall(-1);
  } else if (state.ballPos.x > config.courtWidth) {
    state.heartsRight = Math.max(0, state.heartsRight - 1);
    if (state.heartsRight === 0) {
      state.running = false;
    }
    resetBall(1);
  }

  broadcast({ type: 'state', state, config });
}, TICK_MS);

function resetBall(direction: 1 | -1) {
  state.ballPos = { x: config.courtWidth / 2, y: config.courtHeight / 2 };
  const speed = config.ballSpeed;
  state.ballVel = { x: speed * direction, y: speed * (Math.random() * 0.6 - 0.3) };
}

function resetMatch() {
  state.heartsLeft = config.heartsPerPlayer;
  state.heartsRight = config.heartsPerPlayer;
  state.leftPaddleY = config.courtHeight / 2;
  state.rightPaddleY = config.courtHeight / 2;
  resetBall(Math.random() < 0.5 ? 1 : -1);
  state.running = false;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`AudioPong server running on http://localhost:${PORT}`);
});


