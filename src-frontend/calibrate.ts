import type { ServerToClientMessage } from './shared.js';
import { connectSocket } from './shared.js';

const levelLeft = document.getElementById('level-left') as HTMLDivElement;
const levelRight = document.getElementById('level-right') as HTMLDivElement;
const levelTextLeft = document.getElementById('level-text-left') as HTMLSpanElement;
const levelTextRight = document.getElementById('level-text-right') as HTMLSpanElement;
const maxSliderLeft = document.getElementById('maxSliderLeft') as HTMLInputElement;
const maxSliderRight = document.getElementById('maxSliderRight') as HTMLInputElement;
const dotLeft = document.getElementById('dot-left') as HTMLSpanElement;
const dotRight = document.getElementById('dot-right') as HTMLSpanElement;

const ws = connectSocket();
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'hello', role: 'calibrate' }));
});

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data) as ServerToClientMessage;
  if (msg.type === 'state') {
    const leftNorm = msg.state.leftVolume;
    const rightNorm = msg.state.rightVolume;
    // Display RAW levels for calibration
    const leftRaw = Math.min(1, msg.state.leftVolumeRaw ?? leftNorm);
    const rightRaw = Math.min(1, msg.state.rightVolumeRaw ?? rightNorm);
    levelLeft.style.width = `${Math.round(leftRaw * 100)}%`;
    levelRight.style.width = `${Math.round(rightRaw * 100)}%`;
    levelTextLeft.textContent = leftRaw.toFixed(3);
    levelTextRight.textContent = rightRaw.toFixed(3);
    maxSliderLeft.value = String(msg.state.leftMaxRef);
    maxSliderRight.value = String(msg.state.rightMaxRef);
    dotLeft.classList.toggle('on', !!msg.state.leftConnected);
    dotRight.classList.toggle('on', !!msg.state.rightConnected);
  }
});

maxSliderLeft.addEventListener('input', () => {
  const value = Number(maxSliderLeft.value || '0.6');
  ws.send(JSON.stringify({ type: 'setMaxRef', side: 'left', value }));
});
maxSliderRight.addEventListener('input', () => {
  const value = Number(maxSliderRight.value || '0.6');
  ws.send(JSON.stringify({ type: 'setMaxRef', side: 'right', value }));
});

// Also send on change end, to ensure low values propagate
maxSliderLeft.addEventListener('change', () => {
  const value = Number(maxSliderLeft.value || '0.6');
  ws.send(JSON.stringify({ type: 'setMaxRef', side: 'left', value }));
});
maxSliderRight.addEventListener('change', () => {
  const value = Number(maxSliderRight.value || '0.6');
  ws.send(JSON.stringify({ type: 'setMaxRef', side: 'right', value }));
});



