// Lightweight WebAudio SFX. All synthesized – no asset files.

let ctxRef = null;
let muted = localStorage.getItem('gradebattle.mute') === '1';
const persistedVol = parseFloat(localStorage.getItem('gradebattle.volume'));
let volume = Number.isFinite(persistedVol) ? Math.max(0, Math.min(1, persistedVol)) : 0.5;

function ctx() {
  if (!ctxRef) {
    try {
      ctxRef = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ctxRef = null;
    }
  }
  // Resume on first call (autoplay policy).
  if (ctxRef && ctxRef.state === 'suspended') ctxRef.resume().catch(() => {});
  return ctxRef;
}

export function setMuted(m) {
  muted = !!m;
  localStorage.setItem('gradebattle.mute', muted ? '1' : '0');
}
export function isMuted() { return muted; }
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  localStorage.setItem('gradebattle.volume', String(volume));
}
export function getVolume() { return volume; }

function tone({ freq = 440, type = 'sine', dur = 0.15, attack = 0.005, decay = 0.1, gain = 0.4, freqEnd, filter }) {
  const ac = ctx();
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * volume, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (filter) {
    const f = ac.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.value = filter.freq || 800;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, gain = 0.4, freq = 1500, type = 'lowpass' }) {
  const ac = ctx();
  if (!ac || muted) return;
  const t0 = ac.currentTime;
  const bufferSize = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain * volume, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

// Pitch jitter so identical actions don't sound robotic. Returns 0.88..1.12.
function jitter(min = 0.92, max = 1.1) { return min + Math.random() * (max - min); }

export function playSound(id, opts = {}) {
  if (muted) return;
  switch (id) {
    case 'throw': {
      const j = jitter(0.85, 1.15);
      tone({ freq: 480 * j, freqEnd: 240 * j, type: 'triangle', dur: 0.15, gain: 0.25 });
      break;
    }
    case 'explode': {
      const j = jitter(0.85, 1.15);
      const big = opts.radius && opts.radius > 50;
      noise({ dur: big ? 0.55 : 0.4, gain: big ? 0.55 : 0.5, freq: 600 * j, type: 'lowpass' });
      tone({ freq: 120 * j, freqEnd: 40, type: 'sawtooth', dur: big ? 0.4 : 0.3, gain: 0.3 });
      if (big) tone({ freq: 60, freqEnd: 30, type: 'sine', dur: 0.5, gain: 0.25 });
      break;
    }
    case 'splash': {
      // Wasserbombe: high-freq splash + low gulp.
      noise({ dur: 0.35, gain: 0.45, freq: 2200, type: 'bandpass' });
      tone({ freq: 200, freqEnd: 90, type: 'sine', dur: 0.25, gain: 0.25 });
      break;
    }
    case 'chalk': {
      // Soft puff for kreide / stinkekaese.
      noise({ dur: 0.45, gain: 0.25, freq: 1400, type: 'lowpass' });
      break;
    }
    case 'paper': {
      // Light flutter for book / paper.
      const j = jitter();
      noise({ dur: 0.15, gain: 0.2, freq: 3000, type: 'highpass' });
      tone({ freq: 300 * j, freqEnd: 180 * j, type: 'triangle', dur: 0.18, gain: 0.18 });
      break;
    }
    case 'heavy': {
      // Laptop / megaphon thud.
      noise({ dur: 0.5, gain: 0.55, freq: 280, type: 'lowpass' });
      tone({ freq: 90, freqEnd: 30, type: 'square', dur: 0.4, gain: 0.4 });
      break;
    }
    case 'jump':
      tone({ freq: 320 * jitter(), freqEnd: 560 * jitter(), type: 'square', dur: 0.12, gain: 0.2 });
      break;
    case 'click':
      tone({ freq: 800, type: 'square', dur: 0.05, gain: 0.15 });
      break;
    case 'turn':
      tone({ freq: 660, type: 'triangle', dur: 0.12, gain: 0.25 });
      setTimeout(() => tone({ freq: 880, type: 'triangle', dur: 0.12, gain: 0.25 }), 90);
      break;
    case 'bell':
      tone({ freq: 1320, type: 'sine', dur: 0.6, gain: 0.4, decay: 0.5 });
      setTimeout(() => tone({ freq: 880, type: 'sine', dur: 0.6, gain: 0.3 }), 80);
      break;
    case 'win':
      tone({ freq: 523, type: 'square', dur: 0.15, gain: 0.3 });
      setTimeout(() => tone({ freq: 659, type: 'square', dur: 0.15, gain: 0.3 }), 140);
      setTimeout(() => tone({ freq: 784, type: 'square', dur: 0.15, gain: 0.3 }), 280);
      setTimeout(() => tone({ freq: 1047, type: 'square', dur: 0.3, gain: 0.3 }), 420);
      break;
    case 'lose':
      tone({ freq: 330, freqEnd: 110, type: 'sawtooth', dur: 0.5, gain: 0.35 });
      break;
    case 'fail':
      tone({ freq: 220, freqEnd: 110, type: 'triangle', dur: 0.4, gain: 0.3 });
      break;
    case 'area':
      tone({ freq: 220, freqEnd: 880, type: 'sawtooth', dur: 0.5, gain: 0.3 });
      break;
    case 'airstrike':
      tone({ freq: 880, freqEnd: 220, type: 'square', dur: 0.4, gain: 0.25 });
      break;
    case 'soft':
      noise({ dur: 0.3, gain: 0.2, freq: 300, type: 'lowpass' });
      break;
    case 'drink':
      tone({ freq: 220, freqEnd: 880, type: 'square', dur: 0.2, gain: 0.25 });
      break;
    case 'heal':
      tone({ freq: 660, freqEnd: 1320, type: 'sine', dur: 0.3, gain: 0.3 });
      break;
    case 'teleport':
      tone({ freq: 1200, freqEnd: 200, type: 'square', dur: 0.2, gain: 0.25 });
      setTimeout(() => tone({ freq: 200, freqEnd: 1200, type: 'square', dur: 0.2, gain: 0.25 }), 100);
      break;
  }
}
