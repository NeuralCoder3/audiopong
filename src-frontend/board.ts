import type { GameConfig, GameState, ServerToClientMessage } from './shared.js';
import { connectSocket } from './shared.js';

const canvas = document.getElementById('board') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const heartsLeft = document.getElementById('hearts-left') as HTMLDivElement;
const heartsRight = document.getElementById('hearts-right') as HTMLDivElement;
const btnStart = document.getElementById('start') as HTMLButtonElement;
const btnPause = document.getElementById('pause') as HTMLButtonElement;
const btnReset = document.getElementById('reset') as HTMLButtonElement;

let config: GameConfig | null = null;
let lastState: GameState | null = null;

function resizeCanvas() {
  if (!config) return;
  const maxW = window.innerWidth;
  const topbar = document.querySelector('.topbar') as HTMLElement | null;
  const topbarH = topbar ? topbar.offsetHeight : 0;
  const maxH = Math.max(100, window.innerHeight - topbarH);
  const aspect = config.courtWidth / config.courtHeight;
  let w = maxW;
  let h = Math.round(w / aspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h * aspect);
  }
  canvas.width = w;
  canvas.height = h;
  // Also set CSS size to match, so the browser paints exactly within viewport
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

function draw(state: GameState, cfg: GameConfig) {
  const scaleX = canvas.width / cfg.courtWidth;
  const scaleY = canvas.height / cfg.courtHeight;

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // center line
  ctx.strokeStyle = '#333';
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  // paddles
  ctx.fillStyle = '#fff';
  const paddleW = cfg.paddleWidth * scaleX;
  const paddleH = cfg.paddleHeight * scaleY;
  const leftX = 40 * scaleX;
  const rightX = (cfg.courtWidth - 40 - cfg.paddleWidth) * scaleX;
  ctx.fillRect(leftX, (state.leftPaddleY - cfg.paddleHeight / 2) * scaleY, paddleW, paddleH);
  ctx.fillRect(rightX, (state.rightPaddleY - cfg.paddleHeight / 2) * scaleY, paddleW, paddleH);

  // ball
  const ballX = state.ballPos.x * scaleX;
  const ballY = state.ballPos.y * scaleY;
  const radius = (config.ballRadius ?? 8) * ((scaleX + scaleY) / 2);
  ctx.beginPath();
  ctx.arc(ballX, ballY, radius, 0, Math.PI * 2);
  ctx.fill();

  // hearts are handled in DOM header
}

const ws = connectSocket();
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'hello', role: 'board' }));
});
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data) as ServerToClientMessage;
  if (msg.type === 'state') {
    config = msg.config;
    lastState = msg.state;
    resizeCanvas();
    draw(msg.state, msg.config);
    renderHearts(msg.state, msg.config);
  }
});

window.addEventListener('resize', resizeCanvas);

function renderHearts(state: GameState, cfg: GameConfig) {
  const makeHeart = (filled: boolean) => {
    const div = document.createElement('div');
    div.className = 'heart';
    div.innerHTML = filled
      ? '<svg viewBox="0 0 24 24" fill="#ff4d6d" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-6.716-4.35-9.428-7.062C.86 12.226 0 10.79 0 9.214 0 6.367 2.338 4 5.214 4c1.69 0 3.2.82 4.143 2.08C10.586 4.82 12.096 4 13.786 4 16.662 4 19 6.367 19 9.214c0 1.576-.86 3.012-2.572 4.724C18.716 16.65 12 21 12 21z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="#ff4d6d" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-6.716-4.35-9.428-7.062C.86 12.226 0 10.79 0 9.214 0 6.367 2.338 4 5.214 4c1.69 0 3.2.82 4.143 2.08C10.586 4.82 12.096 4 13.786 4 16.662 4 19 6.367 19 9.214c0 1.576-.86 3.012-2.572 4.724C18.716 16.65 12 21 12 21z"/></svg>';
    return div;
  };
  heartsLeft.innerHTML = '';
  heartsRight.innerHTML = '';
  // Connection dots
  const leftDot = document.createElement('span');
  leftDot.className = 'dot' + (state.leftConnected ? ' on' : '');
  heartsLeft.appendChild(leftDot);
  for (let i = 0; i < cfg.heartsPerPlayer; i++) {
    heartsLeft.appendChild(makeHeart(i < state.heartsLeft));
  }
  const rightDot = document.createElement('span');
  rightDot.className = 'dot' + (state.rightConnected ? ' on' : '');
  heartsRight.appendChild(rightDot);
  for (let i = 0; i < cfg.heartsPerPlayer; i++) {
    heartsRight.appendChild(makeHeart(i < state.heartsRight));
  }
}

async function post(path: string) {
  await fetch(path, { method: 'POST' });
}

btnStart.addEventListener('click', () => post('/api/game/start'));
btnPause.addEventListener('click', () => post('/api/game/pause'));
btnReset.addEventListener('click', () => post('/api/game/reset'));


