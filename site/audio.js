// Synthesised sound: no audio files.  Every call is cheap and failure-safe.
let ctx = null, master = null, noiseBuf = null, thr = null, music = null;
export const AUDIO = { volume: 0.7, muted: false };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = AUDIO.muted ? 0 : AUDIO.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // thruster loop
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    thr = { f, g };
  } catch (e) { ctx = null; }
}
export function setVolume(v) { AUDIO.volume = v; if (master) master.gain.value = AUDIO.muted ? 0 : v; }
export function setMuted(m) { AUDIO.muted = m; if (master) master.gain.value = m ? 0 : AUDIO.volume; }

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function noise(t, dur, type, freq, q, peak, dec, pan = 0, freqEnd) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain(); env(g, t, 0.003, peak, dec);
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  s.connect(f); f.connect(g); g.connect(p); p.connect(master);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function tone(t, type, f0, f1, peak, dec, a = 0.004) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + dec);
  const g = ctx.createGain(); env(g, t, a, peak, dec);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + a + dec + 0.05);
}

// distance attenuation helper: d in metres
const att = (d = 0) => Math.max(0.05, 1 / (1 + d / 35));

export function sfx(name, d = 0, pan = 0) {
  if (!ctx || AUDIO.muted) return;
  try {
    const t = ctx.currentTime, k = att(d);
    switch (name) {
      case 'rifle': noise(t, 0.12, 'lowpass', 2600, 0.8, 0.5 * k, 0.1, pan, 600); tone(t, 'square', 180, 60, 0.12 * k, 0.07); break;
      case 'gatling': noise(t, 0.06, 'bandpass', 1800, 1.2, 0.32 * k, 0.05, pan); tone(t, 'square', 120, 70, 0.06 * k, 0.04); break;
      case 'spin': tone(t, 'sawtooth', 90, 260, 0.05, 0.35, 0.02); break;
      case 'coil': noise(t, 0.3, 'highpass', 3000, 0.5, 0.35 * k, 0.25, pan); tone(t, 'sawtooth', 900, 120, 0.12 * k, 0.25); tone(t, 'square', 1400, 300, 0.05 * k, 0.15); break;
      case 'charge': tone(t, 'sawtooth', 120, 900, 0.07, 1.1, 0.05); tone(t, 'sine', 240, 1800, 0.05, 1.1, 0.05); break;
      case 'rail': noise(t, 0.6, 'lowpass', 5000, 0.6, 0.6 * k, 0.5, pan, 200); tone(t, 'sawtooth', 600, 50, 0.3 * k, 0.5); tone(t, 'sine', 90, 30, 0.5 * k, 0.6); break;
      case 'missile': noise(t, 0.4, 'bandpass', 900, 0.8, 0.3 * k, 0.35, pan, 3000); break;
      case 'cannon': noise(t, 0.5, 'lowpass', 1800, 0.7, 0.7 * k, 0.45, pan, 200); tone(t, 'sine', 110, 35, 0.6 * k, 0.45); break;
      case 'laser': tone(t, 'sawtooth', 520, 500, 0.06 * k, 0.12, 0.01); tone(t, 'square', 1040, 1000, 0.03 * k, 0.12, 0.01); break;
      case 'eshot': noise(t, 0.1, 'bandpass', 1300, 1, 0.22 * k, 0.08, pan); tone(t, 'square', 320, 120, 0.05 * k, 0.07); break;
      case 'eshell': noise(t, 0.25, 'lowpass', 1200, 0.8, 0.4 * k, 0.2, pan, 300); tone(t, 'sine', 140, 60, 0.25 * k, 0.2); break;
      case 'boom': noise(t, 1.1, 'lowpass', 1400, 0.6, 0.9 * k, 1.0, pan, 120); tone(t, 'sine', 80, 28, 0.8 * k, 0.9); break;
      case 'bigboom': noise(t, 2.0, 'lowpass', 1000, 0.6, 1.0, 1.8, 0, 80); tone(t, 'sine', 60, 20, 1.0, 1.6); noise(t + 0.15, 1.0, 'bandpass', 400, 0.5, 0.6, 0.9); break;
      case 'thunder': noise(t, 0.25, 'highpass', 2500, 0.5, 0.35 * k, 0.2); noise(t + 0.05, 3.2, 'lowpass', 600, 0.4, 0.9 * k, 2.8, 0, 60); noise(t + 0.6, 2.4, 'lowpass', 300, 0.5, 0.6 * k, 2.2, 0, 40); break;
      case 'hit': tone(t, 'square', 1800, 1500, 0.05, 0.04); break;
      case 'ping': noise(t, 0.08, 'highpass', 4000, 1, 0.15 * k, 0.06, pan); tone(t, 'triangle', 2400, 1800, 0.05 * k, 0.05); break;
      case 'hurt': noise(t, 0.25, 'bandpass', 500, 1.5, 0.5, 0.22, 0, 200); tone(t, 'square', 140, 70, 0.15, 0.18); break;
      case 'step': tone(t, 'sine', 70, 38, 0.35 * k, 0.16); noise(t, 0.1, 'lowpass', 400, 1, 0.18 * k, 0.08); break;
      case 'land': tone(t, 'sine', 80, 30, 0.6, 0.3); noise(t, 0.3, 'lowpass', 600, 0.7, 0.5, 0.28, 0, 100); break;
      case 'qboost': noise(t, 0.35, 'bandpass', 700, 0.6, 0.5, 0.3, 0, 2400); tone(t, 'sawtooth', 160, 420, 0.05, 0.2); break;
      case 'reload': tone(t, 'square', 600, 600, 0.05, 0.03); tone(t + 0.12, 'square', 900, 900, 0.05, 0.03); break;
      case 'empty': tone(t, 'square', 300, 200, 0.06, 0.05); break;
      case 'repair': [523, 659, 784].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, 0.12, 0.2)); break;
      case 'lock': tone(t, 'square', 1500, 1500, 0.04, 0.04); break;
      case 'drone': [660, 880, 1100].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, f * 1.2, 0.1 * k, 0.12)); noise(t, 0.3, 'bandpass', 2400, 2, 0.2 * k, 0.3, pan, 2400); break;
      case 'dronefire': tone(t, 'square', 1400, 700, 0.05 * k, 0.03); break;
      case 'snipe': for (let i = 0; i < 2; i++) tone(t + i * 0.16, 'sine', 1900, 1900, 0.09 * Math.max(0.4, k), 0.1); break;
      case 'mend': tone(t, 'sine', 520, 780, 0.05 * k, 0.5); tone(t + 0.12, 'sine', 780, 1040, 0.04 * k, 0.4); break;
      case 'grenade': tone(t, 'square', 140, 60, 0.18 * k, 0.16); noise(t, 0.18, 'lowpass', 900, 1, 0.35 * k, 0.15, pan, 300); break;
      case 'pile': noise(t, 0.12, 'lowpass', 3000, 0.8, 0.5 * k, 0.1, pan, 300); tone(t, 'square', 240, 90, 0.18 * k, 0.12); break;
      case 'pilehit': noise(t, 0.5, 'lowpass', 1600, 0.6, 0.9 * k, 0.45, pan, 120); tone(t, 'sine', 70, 24, 0.9 * k, 0.5); tone(t, 'square', 1200, 300, 0.12 * k, 0.1); break;
      case 'crawl': for (let i = 0; i < 3; i++) tone(t + i * 0.08, 'square', 2200, 2200, 0.06 * k, 0.05); break;
      case 'skitter': noise(t, 0.08, 'highpass', 3500, 1, 0.07 * k, 0.06, pan); break;
      case 'flame': noise(t, 0.16, 'lowpass', 900, 0.6, 0.22 * k, 0.15, pan, 500); break;
      case 'minedrop': tone(t, 'sine', 300, 120, 0.12 * k, 0.15); noise(t, 0.1, 'bandpass', 1200, 1, 0.12 * k, 0.08, pan); break;
      case 'minebeep': for (let i = 0; i < 4; i++) tone(t + i * 0.11, 'square', 2600, 2600, 0.08 * Math.max(0.5, k), 0.05); break;
      case 'artillery': { const q = Math.max(0.4, k); tone(t, 'sine', 75, 28, 0.7 * q, 0.9); noise(t, 0.9, 'lowpass', 500, 0.8, 0.8 * q, 0.9, pan); tone(t, 'square', 140, 40, 0.15 * q, 0.25); break; }
      case 'decoy': tone(t, 'sine', 500, 1500, 0.16, 0.45); tone(t + 0.06, 'triangle', 800, 2200, 0.1, 0.4); noise(t, 0.3, 'highpass', 3000, 0.5, 0.15, 0.3); break;
      case 'orbital': for (let i = 0; i < 4; i++) tone(t + i * 0.12, 'sine', 900 + i * 260, 1400 + i * 260, 0.07 * k, 0.12); noise(t + 0.4, 1.0, 'bandpass', 2200, 3, 0.12 * k, 0.9, pan, 5000); break;
      case 'horn': tone(t, 'sawtooth', 233, 228, 0.16 * k, 1.1, 0.06); tone(t, 'sawtooth', 294, 290, 0.13 * k, 1.1, 0.06); tone(t, 'square', 117, 115, 0.05 * k, 1.1, 0.06); break;
      case 'harpoon': noise(t, 0.25, 'bandpass', 900, 1.5, 0.3 * k, 0.2, pan, 2400); tone(t, 'square', 180, 60, 0.12 * k, 0.2); break;
      case 'hookhit': tone(t, 'square', 320, 90, 0.18 * k, 0.18); noise(t, 0.12, 'lowpass', 1400, 1, 0.3 * k, 0.1, pan); break;
      case 'reel': tone(t, 'sawtooth', 140 + Math.random() * 30, 110, 0.05 * k, 0.25); break;
      case 'snap': tone(t, 'triangle', 1800, 300, 0.14 * k, 0.15); noise(t, 0.08, 'highpass', 3000, 1, 0.2 * k, 0.06, pan); break;
      case 'blink': tone(t, 'sine', 300, 1600, 0.16 * k, 0.16); tone(t + 0.05, 'sine', 1800, 600, 0.08 * k, 0.2); noise(t, 0.2, 'bandpass', 2600, 3, 0.14 * k, 0.18, pan); break;
      case 'eelcoil': tone(t, 'sawtooth', 90, 420, 0.07 * k, 0.8); noise(t, 0.8, 'bandpass', 3000, 4, 0.06 * k, 0.7, pan, 5000); break;
      case 'eellunge': noise(t, 0.4, 'bandpass', 700, 1.2, 0.3 * k, 0.35, pan, 2200); tone(t, 'square', 600, 120, 0.08 * k, 0.3); break;
      case 'zap': noise(t, 0.15, 'highpass', 2500, 1, 0.3 * k, 0.12, pan); tone(t, 'square', 1400, 200, 0.1 * k, 0.12); break;
      case 'sonar': tone(t, 'sine', 1250, 1180, 0.22 * k, 0.9); tone(t + 0.02, 'sine', 2500, 2400, 0.05 * k, 0.5); tone(t + 0.35, 'sine', 1250, 1200, 0.07 * k, 0.8); break;
      case 'jetdive': noise(t, 1.4, 'bandpass', 600, 0.8, 0.22 * k, 1.2, pan, 2400); tone(t, 'sawtooth', 220, 520, 0.05 * k, 1.2); break;
      case 'meteor': noise(t, 2.2, 'bandpass', 900, 1.2, 0.16 * k, 2.1, pan, 260); tone(t, 'sine', 1300, 320, 0.05 * k, 2.1); break;
      case 'sentry': tone(t, 'square', 180, 90, 0.12, 0.18); noise(t + 0.4, 0.2, 'lowpass', 900, 1, 0.3, 0.2); tone(t + 0.5, 'sine', 900, 1800, 0.08, 0.25); break;
      case 'hook': noise(t, 0.12, 'highpass', 2000, 1, 0.35 * k, 0.1, pan); tone(t, 'sawtooth', 300, 900, 0.08 * k, 0.15); for (let i = 1; i < 6; i++) tone(t + i * 0.04, 'square', 1800, 1700, 0.03 * k, 0.02); break;
      case 'sonic': tone(t, 'sine', 90, 40, 0.5 * k, 0.35); noise(t, 0.25, 'bandpass', 700, 1.2, 0.4 * k, 0.2, pan); tone(t, 'square', 220, 110, 0.08 * k, 0.18); tone(t + 0.04, 'sine', 440, 300, 0.06 * k, 0.2); break;
      case 'hive': tone(t, 'sawtooth', 180, 320, 0.05 * k, 0.5); noise(t, 0.4, 'bandpass', 900, 3, 0.12 * k, 0.4, pan); break;
      case 'fence': tone(t, 'sawtooth', 110, 260, 0.07 * k, 0.9); tone(t, 'square', 55, 130, 0.05 * k, 0.9); tone(t + 0.85, 'sawtooth', 260, 240, 0.08 * k, 0.6); break;
      case 'stasis': tone(t, 'sine', 1400, 140, 0.12 * k, 1.1); tone(t + 0.05, 'triangle', 2200, 300, 0.05 * k, 0.9); noise(t, 0.6, 'lowpass', 700, 1, 0.2 * k, 0.4, pan); break;
      case 'prism': tone(t, 'sine', 1800, 2600, 0.06 * k, 0.5); tone(t + 0.05, 'triangle', 3200, 3600, 0.04 * k, 0.35); break;
      case 'smoke': noise(t, 0.6, 'lowpass', 1200, 0.8, 0.35, 0.6); tone(t, 'sine', 160, 60, 0.15, 0.25); noise(t + 0.15, 1.2, 'bandpass', 2400, 0.6, 0.12, 1.1); break;
      case 'spit': noise(t, 0.35, 'bandpass', 700, 1.4, 0.25 * k, 0.3, pan); tone(t, 'sawtooth', 240, 90, 0.08 * k, 0.3); break;
      case 'jetgun': for (let i = 0; i < 10; i++) noise(t + i * 0.07, 0.05, 'lowpass', 1800, 1, 0.22 * k, 0.04, pan); break;
      case 'stormz': noise(t, 0.6, 'bandpass', 500, 1.2, 0.08 * k, 0.5, pan, 900); break;
      case 'disc': noise(t, 0.18, 'bandpass', 1800, 2, 0.22 * k, 0.15, pan, 3200); tone(t, 'sawtooth', 520, 900, 0.05 * k, 0.12); break;
      case 'whirr': tone(t, 'sawtooth', 300 + Math.random() * 60, 340, 0.025 * k, 0.12); break;
      case 'ric': tone(t, 'triangle', 2600, 1400, 0.09 * k, 0.12); noise(t, 0.06, 'highpass', 4000, 1, 0.12 * k, 0.05, pan); break;
      case 'catch': tone(t, 'square', 880, 1320, 0.05 * k, 0.06); noise(t, 0.05, 'bandpass', 2400, 2, 0.1 * k, 0.04, pan); break;
      case 'cryo': noise(t, 0.09, 'highpass', 3500, 1, 0.14 * k, 0.08, pan); tone(t, 'triangle', 2400, 1600, 0.04 * k, 0.06); break;
      case 'freeze': noise(t, 0.5, 'highpass', 2500, 2, 0.3 * k, 0.45, pan, 6000); for (let i = 0; i < 5; i++) tone(t + i * 0.04, 'sine', 2600 + i * 400, 1800 + i * 300, 0.06 * k, 0.15); break;
      case 'rumble': noise(t, 0.7, 'lowpass', 140, 1, 0.3 * k, 0.6, pan, 90); tone(t, 'sine', 48, 36, 0.14 * k, 0.6, 0.08); break;
      case 'erupt': noise(t, 1.0, 'lowpass', 600, 1, 0.55 * k, 0.9, pan, 120); tone(t, 'sawtooth', 70, 30, 0.2 * k, 0.8); break;
      case 'grav': tone(t, 'sine', 220, 38, 0.32 * k, 1.1); tone(t, 'sawtooth', 110, 30, 0.08 * k, 1.0); noise(t, 1.0, 'lowpass', 400, 1, 0.25 * k, 0.9, pan, 80); for (let i = 0; i < 4; i++) tone(t + 0.15 + i * 0.12, 'triangle', 900 - i * 160, 300 - i * 50, 0.05 * k, 0.12); break;
      case 'emp': tone(t, 'sawtooth', 1600, 60, 0.22, 0.5); noise(t, 0.7, 'bandpass', 1800, 0.5, 0.6, 0.6, 0, 200); tone(t + 0.04, 'sine', 90, 30, 0.7, 0.6); for (let i = 0; i < 5; i++) tone(t + 0.1 + i * 0.05, 'square', 2400 - i * 300, 2400 - i * 300, 0.04, 0.04); break;
      case 'jam': for (let i = 0; i < 4; i++) tone(t + i * 0.05, 'square', 300 + Math.random() * 1500, 200 + Math.random() * 900, 0.03, 0.05); noise(t, 0.25, 'bandpass', 2600, 3, 0.05, 0.2, 0); break;
      case 'medal': [659, 784, 988, 1319].forEach((f, i) => tone(t + i * 0.08, 'triangle', f, f, 0.1, 0.25)); break;
      case 'cloak': noise(t, 0.5, 'highpass', 3000, 0.5, 0.12 * k, 0.4, pan, 600); tone(t, 'sine', 900, 200, 0.06 * k, 0.4); break;
      case 'alarm': for (let i = 0; i < 3; i++) { tone(t + i * 0.5, 'sawtooth', 440, 440, 0.12, 0.3, 0.02); tone(t + i * 0.5 + 0.25, 'sawtooth', 330, 330, 0.12, 0.2, 0.02); } break;
      case 'ui': tone(t, 'triangle', 880, 990, 0.08, 0.06); break;
      case 'wave': [392, 523, 659, 784].forEach((f, i) => tone(t + i * 0.09, 'square', f, f, 0.06, 0.18)); break;
      case 'blade': noise(t, 0.28, 'bandpass', 2200, 0.7, 0.45 * k, 0.25, pan, 5000); tone(t, 'sawtooth', 300, 1400, 0.08 * k, 0.2); tone(t, 'sine', 180, 90, 0.2 * k, 0.25); break;
      case 'bladehit': noise(t, 0.2, 'highpass', 2500, 0.8, 0.5 * k, 0.18, pan); tone(t, 'square', 900, 200, 0.15 * k, 0.18); tone(t, 'sine', 70, 30, 0.6 * k, 0.3); break;
      case 'shield': tone(t, 'sine', 1300, 900, 0.07 * k, 0.12); tone(t, 'triangle', 2600, 2000, 0.03 * k, 0.08); break;
      case 'shieldbreak': noise(t, 0.6, 'highpass', 1800, 0.6, 0.5 * k, 0.5, pan); tone(t, 'sawtooth', 1200, 100, 0.2 * k, 0.5); break;
      case 'warn': tone(t, 'square', 1700, 1700, 0.05, 0.06); tone(t + 0.09, 'square', 1700, 1700, 0.05, 0.06); break;
      case 'rotor': noise(t, 0.12, 'lowpass', 220, 1.5, 0.35 * k, 0.1, pan); break;
      case 'coin': tone(t, 'triangle', 1320, 1760, 0.06, 0.08); break;
      case 'od': tone(t, 'sawtooth', 90, 900, 0.2, 0.7, 0.02); tone(t + 0.05, 'square', 180, 1800, 0.07, 0.6, 0.02); noise(t, 0.9, 'bandpass', 600, 0.6, 0.5, 0.8, 0, 4000); tone(t + 0.45, 'sine', 70, 30, 0.8, 0.9); break;
      case 'odend': tone(t, 'sawtooth', 700, 120, 0.08, 0.5); break;
      case 'overheat': tone(t, 'sawtooth', 300, 120, 0.12, 0.4); break;
    }
  } catch (e) { /* ignore */ }
}

// continuous thruster level 0..1
export function thrust(level) {
  if (!ctx || !thr) return;
  const t = ctx.currentTime;
  thr.g.gain.setTargetAtTime(AUDIO.muted ? 0 : level * 0.28, t, 0.05);
  thr.f.frequency.setTargetAtTime(500 + level * 900, t, 0.08);
}

// minimal driving music: bass pulse + hats, intensity 0..1
let musicT = 0, step = 0;
export function musicTick(intensity) {
  if (!ctx || AUDIO.muted || intensity <= 0) return;
  const now = ctx.currentTime;
  if (musicT < now) musicT = now + 0.05;
  const BEAT = 60 / 128 / 2;
  const roots = [55, 55, 65.4, 49];
  while (musicT < now + 0.25) {
    const bar = Math.floor(step / 16) % 4, s = step % 16, r = roots[bar];
    const t = musicT;
    if (s % 2 === 0) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = (s % 8 === 6 ? r * 2 : r);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 280 + intensity * 500;
      const g = ctx.createGain(); env(g, t, 0.005, 0.09 * intensity, 0.16);
      o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
    }
    if (s % 4 === 0) tone(t, 'sine', 120, 40, 0.22 * intensity, 0.14);
    if (s % 2 === 1 && intensity > 0.4) noise(t, 0.04, 'highpass', 7000, 1, 0.05 * intensity, 0.03);
    if (s === 12 && intensity > 0.6) noise(t, 0.15, 'bandpass', 1800, 0.8, 0.12 * intensity, 0.12);
    musicT += BEAT; step++;
  }
}
