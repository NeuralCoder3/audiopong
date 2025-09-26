type GameConfig = {
  courtWidth: number;
  courtHeight: number;
  paddleWidth: number;
  paddleHeight: number;
  ballSpeed: number;
  ballAccelOnBounce: number;
  heartsPerPlayer: number;
  ballRadius: number;
};

async function loadConfig(): Promise<GameConfig> {
  const res = await fetch('/api/config');
  return await res.json();
}

async function saveConfig(cfg: Partial<GameConfig>): Promise<GameConfig> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  return await res.json();
}

function assignValue(id: string, value: number | string) {
  const el = document.getElementById(id) as HTMLInputElement;
  el.value = String(value);
}

function readNumber(id: string): number {
  const el = document.getElementById(id) as HTMLInputElement;
  return Number(el.value);
}

async function init() {
  const cfg = await loadConfig();
  assignValue('courtWidth', cfg.courtWidth);
  assignValue('courtHeight', cfg.courtHeight);
  assignValue('paddleWidth', cfg.paddleWidth);
  assignValue('paddleHeight', cfg.paddleHeight);
  assignValue('ballSpeed', cfg.ballSpeed);
  assignValue('ballAccelOnBounce', cfg.ballAccelOnBounce);
  assignValue('heartsPerPlayer', cfg.heartsPerPlayer);
  assignValue('ballRadius', cfg.ballRadius);

  document.getElementById('save')!.addEventListener('click', async () => {
    const updated = await saveConfig({
      courtWidth: readNumber('courtWidth'),
      courtHeight: readNumber('courtHeight'),
      paddleWidth: readNumber('paddleWidth'),
      paddleHeight: readNumber('paddleHeight'),
      ballSpeed: readNumber('ballSpeed'),
      ballAccelOnBounce: Number((document.getElementById('ballAccelOnBounce') as HTMLInputElement).value),
      heartsPerPlayer: readNumber('heartsPerPlayer'),
      ballRadius: readNumber('ballRadius'),
    });
    const status = document.getElementById('status')!;
    status.textContent = 'Saved!';
    setTimeout(() => (status.textContent = ''), 1200);
    assignValue('courtWidth', updated.courtWidth);
    assignValue('courtHeight', updated.courtHeight);
    assignValue('paddleWidth', updated.paddleWidth);
    assignValue('paddleHeight', updated.paddleHeight);
    assignValue('ballSpeed', updated.ballSpeed);
    assignValue('ballAccelOnBounce', updated.ballAccelOnBounce);
    assignValue('heartsPerPlayer', updated.heartsPerPlayer);
    assignValue('ballRadius', updated.ballRadius);
  });
}

document.addEventListener('DOMContentLoaded', init);


