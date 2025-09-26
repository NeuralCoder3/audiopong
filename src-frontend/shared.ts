export type GameConfig = {
  courtWidth: number;
  courtHeight: number;
  paddleWidth: number;
  paddleHeight: number;
  ballSpeed: number;
  ballAccelOnBounce: number;
  heartsPerPlayer: number;
};

export type Vector = { x: number; y: number };

export type GameState = {
  ballPos: Vector;
  ballVel: Vector;
  leftPaddleY: number;
  rightPaddleY: number;
  heartsLeft: number;
  heartsRight: number;
  running: boolean;
  leftVolume: number;
  rightVolume: number;
  leftMaxRef: number;
  rightMaxRef: number;
  leftVolumeRaw: number;
  rightVolumeRaw: number;
  leftConnected: boolean;
  rightConnected: boolean;
};

export type ServerToClientMessage =
  | { type: 'state'; state: GameState; config: GameConfig }
  | { type: 'assign'; side: 'left' | 'right' | 'spectator' };

export type ClientToServerMessage =
  | { type: 'hello'; name?: string }
  | { type: 'volumeRaw'; value: number }
  | { type: 'maxRef'; value: number }
  | { type: 'setMaxRef'; side: 'left' | 'right'; value: number };

export function connectSocket(): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}`;
  return new WebSocket(url);
}


