// Blackwater Dock — sound: everything is synthesized with WebAudio.
// No audio files, no network: gunshots are filtered noise, the rest are
// short oscillator blips. The context is created on the first user gesture.

let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  } catch {
    return false;
  }
}

export function unlockAudio() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function setMuted(m) { if (master) master.gain.value = m ? 0 : 0.4; }

function blip(freq, dur, type, gain, slideTo) {
  if (!ensure() || !ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, filterFreq, gain, type) {
  if (!ensure() || !ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type || 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain || 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

export const sfx = {
  shot(weaponId) {
    if (weaponId === 'shotgun') { noise(0.22, 900, 0.7); blip(120, 0.12, 'square', 0.25, 50); }
    else if (weaponId === 'rifle') { noise(0.12, 1600, 0.5); blip(190, 0.07, 'square', 0.16, 70); }
    else if (weaponId === 'smg') { noise(0.08, 2200, 0.35); blip(240, 0.05, 'square', 0.12, 90); }
    else { noise(0.1, 1400, 0.45); blip(160, 0.07, 'square', 0.15, 60); }
  },
  enemyShot() { noise(0.09, 1100, 0.22); },
  dryFire() { blip(1200, 0.04, 'square', 0.12); },
  reload() { blip(500, 0.05, 'square', 0.12); setTimeout(() => blip(700, 0.05, 'square', 0.12), 160); },
  hit() { blip(1800, 0.05, 'sine', 0.22); },
  headshot() { blip(2400, 0.08, 'sine', 0.25); setTimeout(() => blip(3000, 0.06, 'sine', 0.2), 60); },
  hurt() { blip(140, 0.18, 'sawtooth', 0.25, 70); },
  kill() { blip(520, 0.09, 'sine', 0.2); setTimeout(() => blip(780, 0.12, 'sine', 0.2), 90); },
  grenade() { noise(0.5, 300, 0.9); blip(60, 0.45, 'sine', 0.6, 28); },
  buy() { blip(880, 0.07, 'sine', 0.18); setTimeout(() => blip(1320, 0.1, 'sine', 0.18), 70); },
  capture() { blip(660, 0.12, 'sine', 0.2); setTimeout(() => blip(990, 0.16, 'sine', 0.2), 110); },
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'sine', 0.22), i * 120)); },
  roundLoss() { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'sine', 0.2), i * 130)); },
  click() { blip(900, 0.04, 'square', 0.1); },
};
