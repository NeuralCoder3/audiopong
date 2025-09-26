import type { ServerToClientMessage } from './shared.js';
import { connectSocket } from './shared.js';

const deviceSelect = document.getElementById('mic') as HTMLSelectElement;
const levelBar = document.getElementById('level') as HTMLDivElement;
const maxSlider = document.getElementById('maxSlider') as HTMLInputElement;

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaStream: MediaStream | null = null;
let ws = connectSocket();
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'hello', role: 'player' }));
});


ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data) as ServerToClientMessage;
  if (msg.type === 'assign') {
    const sideLabel = document.getElementById('side')!;
    sideLabel.textContent = `You are: ${msg.side}`;
  }
});

async function listMics() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  deviceSelect.innerHTML = '';
  for (const d of devices) {
    if (d.kind === 'audioinput') {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Mic ${deviceSelect.length + 1}`;
      deviceSelect.appendChild(opt);
    }
  }
}

async function startMic(deviceId?: string) {
  if (!audioContext) audioContext = new AudioContext();
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
  }
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  });
  const source = audioContext.createMediaStreamSource(mediaStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
}

function computeRms(): number {
  if (!analyser) return 0;
  const buffer = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buffer);
  // Compute RMS
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = (buffer[i] - 128) / 128;
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / buffer.length);
  return rms;
}

function loop() {
  const rms = computeRms();
  // Display raw level (cap at 1 for bar)
  const rawForBar = Math.min(1, rms);
  levelBar.style.width = `${Math.round(rawForBar * 100)}%`;
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'volumeRaw', value: rms }));
  }
  requestAnimationFrame(loop);
}

deviceSelect.addEventListener('change', async () => {
  await startMic(deviceSelect.value);
});

document.getElementById('start')!.addEventListener('click', async () => {
  await startMic(deviceSelect.value || undefined);
  loop();
});

// Only send maxRef when the user moves the slider
maxSlider.addEventListener('input', () => {
  if (ws.readyState === WebSocket.OPEN) {
    const maxRef = Number(maxSlider.value || '0.6');
    ws.send(JSON.stringify({ type: 'maxRef', value: maxRef }));
  }
});

// Initial mic permission prompt to populate labels
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {}
  await listMics();
});


