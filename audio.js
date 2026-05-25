import { _el } from './ui.js';

let _audCtx = null;
let _musicSrc = null;
let _musicGainNode = null;
let _sfxGainNode = null;
let _reverbNode = null;
let _reverbGain = null;
let _musicOn = true;
let _sfxOn = true;
let _audioUnlocked = false;

export function initAudio() {
  if (_audCtx) {
    if (_audCtx.state === 'suspended') {
      _audCtx.resume().then(() => {
        if (_musicOn && !_musicSrc) _startMusic();
      });
    }
    return;
  }

  try {
    _audCtx = new (window.AudioContext || window.webkitAudioContext)();
    _musicGainNode = _audCtx.createGain(); _musicGainNode.gain.value = 0.32;
    _sfxGainNode = _audCtx.createGain(); _sfxGainNode.gain.value = 0.6;
    _musicGainNode.connect(_audCtx.destination);
    _sfxGainNode.connect(_audCtx.destination);

    const SR = _audCtx.sampleRate;
    const irLen = Math.floor(2.2 * SR);
    const ir = _audCtx.createBuffer(2, irLen, SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.2);
    }

    _reverbNode = _audCtx.createConvolver();
    _reverbNode.buffer = ir;
    _reverbGain = _audCtx.createGain();
    _reverbGain.gain.value = 0.22;
    _reverbNode.connect(_reverbGain);
    _reverbGain.connect(_audCtx.destination);

    _audCtx.resume().then(() => {
      if (_musicOn) _startMusic();
    });
  } catch (e) {
    console.error('Audio init failed', e);
  }
}

export function unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  initAudio();
  document.removeEventListener('touchstart', _unlockAudio, true);
  document.removeEventListener('touchend', _unlockAudio, true);
  document.removeEventListener('click', _unlockAudio, true);
}

function _unlockAudio() {
  unlockAudio();
}

typeof window !== 'undefined' && document.addEventListener('touchstart', _unlockAudio, true);
typeof window !== 'undefined' && document.addEventListener('touchend', _unlockAudio, true);
typeof window !== 'undefined' && document.addEventListener('click', _unlockAudio, true);

function _buildMusicBuffer() {
  const SR = _audCtx.sampleRate;
  const BPM = 138;
  const beat = 60 / BPM;
  const bars = 8;
  const N = Math.ceil(bars * 4 * beat * SR);
  const buf = _audCtx.createBuffer(2, N, SR);
  const dL = buf.getChannelData(0);
  const dR = buf.getChannelData(1);
  const b = beat;
  const e = beat / 2;
  const s = beat / 4;

  function wL(i, v) { if (i < N) dL[i] = Math.max(-1, Math.min(1, dL[i] + v)); }
  function wR(i, v) { if (i < N) dR[i] = Math.max(-1, Math.min(1, dR[i] + v)); }
  function wLR(i, v) { wL(i, v); wR(i, v); }

  function kick(t0, amp) {
    const i0 = Math.floor(t0 * SR);
    const len = Math.floor(0.55 * SR);
    for (let i = 0; i < len && i0 + i < N; i++) {
      const t = i / SR;
      const sub = Math.sin(2 * Math.PI * (180 * Math.exp(-t * 40) + 38) * t) * Math.exp(-t * 9);
      const click = i < SR * 0.004 ? (Math.random() * 2 - 1) * 0.3 : 0;
      wLR(i0 + i, (sub * 0.9 + click) * (amp || 0.82));
    }
  }

  function snare(t0, amp) {
    const i0 = Math.floor(t0 * SR);
    const len = Math.floor(0.25 * SR);
    for (let i = 0; i < len && i0 + i < N; i++) {
      const t = i / SR;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.42;
      const body = Math.sin(2 * Math.PI * 175 * t) * Math.exp(-t * 25) * 0.28;
      const crack = Math.sin(2 * Math.PI * 280 * t) * Math.exp(-t * 70) * 0.2;
      wLR(i0 + i, (noise + body + crack) * (amp || 0.7));
    }
  }

  function hihat(t0, amp, open) {
    const i0 = Math.floor(t0 * SR);
    const len = Math.floor((open ? 0.18 : 0.02) * SR);
    for (let i = 0; i < len && i0 + i < N; i++) {
      const t = i / SR;
      const v = (Math.random() * 2 - 1) * Math.exp(-t * (open ? 10 : 60)) * amp * 0.18;
      wL(i0 + i, v * 0.5);
      wR(i0 + i, v * 1.0);
    }
  }

  function tom(t0, freq, amp) {
    const i0 = Math.floor(t0 * SR);
    const len = Math.floor(0.3 * SR);
    for (let i = 0; i < len && i0 + i < N; i++) {
      const t = i / SR;
      const f = freq * Math.exp(-t * 12) + freq * 0.4;
      wLR(i0 + i, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 14) * (amp || 0.45));
    }
  }

  function pad(freq, t0, dur, amp) {
    const i0 = Math.floor(t0 * SR);
    const iN = Math.min(N, i0 + Math.floor(dur * SR));
    const atk = Math.floor(0.22 * SR);
    const partials = [1, 1.5, 2, 2.5, 3, 4];
    const pAmps = [1, 0.5, 0.35, 0.15, 0.12, 0.06];
    const detunes = [0, 0.003, -0.002, 0.005, -0.004, 0.006];
    for (let i = i0; i < iN; i++) {
      const fi = i - i0;
      const t = fi / SR;
      const progA = Math.min(1, fi / atk);
      const progR = Math.min(1, (iN - 1 - i) / Math.floor(0.3 * SR));
      const env = progA * progR * amp * 0.065;
      let vL = 0;
      let vR = 0;
      for (let h = 0; h < partials.length; h++) {
        const fL = freq * partials[h] * (1 - detunes[h]);
        const fR = freq * partials[h] * (1 + detunes[h]);
        vL += Math.sin(2 * Math.PI * fL * t) * pAmps[h];
        vR += Math.sin(2 * Math.PI * fR * t) * pAmps[h];
      }
      wL(i, vL * env);
      wR(i, vR * env);
    }
  }

  function bass(freq, t0, dur, amp) {
    const i0 = Math.floor(t0 * SR);
    const iN = Math.min(N, i0 + Math.floor(dur * SR));
    for (let i = i0; i < iN; i++) {
      const t = (i - i0) / SR;
      const env = Math.min(1, t / 0.008) * Math.exp(-t * 1.8 / dur);
      const saw = (2 * ((freq * t) % 1) - 1) * 0.5;
      const sub = Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.7;
      const raw = (saw + sub) * amp * env;
      const clipped = raw / (1 + Math.abs(raw) * 0.6);
      wLR(i, clipped * 1.1);
    }
  }

  function lead(freq, t0, dur, amp) {
    const i0 = Math.floor(t0 * SR);
    const iN = Math.min(N, i0 + Math.floor(dur * SR));
    for (let i = i0; i < iN; i++) {
      const t = (i - i0) / SR;
      const env = Math.min(1, t / 0.006) * Math.exp(-t * 5 / dur);
      const tri = (Math.abs(2 * (freq * t % 1) - 1) * 2 - 1);
      const h2 = Math.sin(2 * Math.PI * freq * 2 * t) * 0.18;
      const v = (tri * 0.82 + h2) * amp * env * 0.14;
      wL(i, v * 0.9);
      wR(i, v * 1.1);
    }
  }

  const chords = [
    [146.83, 174.61, 220],
    [116.54, 146.83, 174.61],
    [87.31, 110, 130.81],
    [130.81, 164.81, 196],
  ];
  const bassRoots = [73.42, 58.27, 43.65, 65.41];
  const leadSeq = [
    [146.83, e], [0, s], [220, s], [0, e], [174.61, e],
    [0, e], [196, s], [146.83, s], [174.61, e], [0, e],
  ];
  const leadSeq2 = [
    [233.08, e], [0, s], [174.61, s], [220, e], [0, e],
    [196, s], [220, s], [233.08, e], [220, s], [196, s],
  ];

  for (let bar = 0; bar < bars; bar++) {
    const bt = bar * 4 * b;
    const ci = bar % 4;
    kick(bt);
    kick(bt + 2 * b);
    snare(bt + b);
    snare(bt + 3 * b);
    if (bar >= 1) {
      for (let h = 0; h < 8; h++) hihat(bt + h * e, h % 2 === 0 ? 1.2 : 0.7, h === 4 || h === 6);
    }
    if (bar >= 3) {
      kick(bt + 1.5 * b, 0.55);
      kick(bt + 3.5 * b, 0.6);
    }
    if (bar >= 5) {
      tom(bt + 3.75 * b, 110, 0.38);
      tom(bt + 3.875 * b, 92, 0.32);
    }
    if (bar >= 1) chords[ci].forEach(f => pad(f, bt, 4 * b, 1));
    const bn = bassRoots[ci];
    bass(bn, bt, e * 0.88, 0.3);
    bass(bn, bt + e, s * 0.7, 0.22);
    bass(bn * 1.5, bt + e + s, s * 0.75, 0.22);
    bass(bn, bt + 2 * e, e * 0.88, 0.28);
    bass(bn, bt + 3 * e, s * 0.7, 0.22);
    if (bar >= 2) {
      bass(bn * 2, bt + 3 * e + s, s * 0.65, 0.2);
      bass(bn, bt + 4 * e, e * 0.88, 0.28);
      bass(bn * 1.5, bt + 5 * e, s * 0.7, 0.2);
      bass(bn, bt + 5 * e + s, s * 0.65, 0.18);
      bass(bn, bt + 6 * e, e * 0.88, 0.26);
      bass(bn, bt + 7 * e, e * 0.85, 0.28);
    }
    if (bar >= 2) {
      const seq = bar >= 4 ? leadSeq2 : leadSeq;
      let off = 0;
      seq.forEach(([f, dur]) => {
        if (f > 0) lead(f, bt + off, dur * 0.85, 1);
        off += dur;
      });
    }
  }

  let mx = 0;
  for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(dL[i]), Math.abs(dR[i]));
  if (mx > 0.86) {
    const sc = 0.86 / mx;
    for (let i = 0; i < N; i++) {
      dL[i] *= sc;
      dR[i] *= sc;
    }
  }
  return buf;
}

function _startMusic() {
  if (!_audCtx || !_musicOn) return;
  if (_musicSrc) {
    try { _musicSrc.stop(); } catch (e) {}
    _musicSrc = null;
  }
  const buf = _buildMusicBuffer();
  _musicSrc = _audCtx.createBufferSource();
  _musicSrc.buffer = buf;
  _musicSrc.loop = true;
  _musicSrc.connect(_musicGainNode);
  if (_reverbNode) _musicSrc.connect(_reverbNode);
  _musicSrc.start();
}

function _stopMusic() {
  if (_musicSrc) {
    try { _musicSrc.stop(); } catch (e) {}
    _musicSrc = null;
  }
}

export function stopMusic() {
  _stopMusic();
}

function _syncAudioButtons() {
  const pp = _el('btn-playpause');
  if (pp) pp.textContent = _musicOn ? '⏸' : '▶';
  ['btn-sfx', 'hud-btn-sfx', 'mp-hud-btn-sfx'].forEach(id => {
    const el = _el(id);
    if (el) el.textContent = _sfxOn ? '🔊' : '🔈';
  });
  const tSfx = _el('tog-sfx'); if (tSfx) tSfx.classList.toggle('on', _sfxOn);
  const tMus = _el('tog-music'); if (tMus) tMus.classList.toggle('on', _musicOn);
}

export function togglePlayPause() {
  initAudio();
  _musicOn = !_musicOn;
  if (_musicOn) _startMusic(); else _stopMusic();
  _syncAudioButtons();
}

export function toggleSfx() {
  initAudio();
  _sfxOn = !_sfxOn;
  _syncAudioButtons();
}

export function suspendAudio() {
  if (_audCtx && _audCtx.state === 'running') _audCtx.suspend();
}

export function resumeAudio() {
  if (_audCtx && _audCtx.state === 'suspended') _audCtx.resume();
}

export function startMusicIfEnabled() {
  if (_audCtx && _musicOn) _startMusic();
}

export function playSfx(type) {
  if (!_audCtx || !_sfxOn) return;
  if (_audCtx.state === 'suspended') { _audCtx.resume(); return; }
  const SR = _audCtx.sampleRate;
  const now = _audCtx.currentTime;

  function osc(freq, t, dur, amp, wave, freqEnd) {
    const o = _audCtx.createOscillator();
    const g = _audCtx.createGain();
    o.type = wave || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(_sfxGainNode);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, amp, lpFreq, hpFreq, decayRate) {
    const len = Math.floor(dur * SR);
    const nb = _audCtx.createBuffer(1, len, SR);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / len * (decayRate || 4));
    const ns = _audCtx.createBufferSource();
    ns.buffer = nb;
    let last = ns;
    if (lpFreq) {
      const f = _audCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpFreq;
      last.connect(f);
      last = f;
    }
    if (hpFreq) {
      const f = _audCtx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hpFreq;
      last.connect(f);
      last = f;
    }
    const g = _audCtx.createGain();
    g.gain.value = amp;
    last.connect(g);
    g.connect(_sfxGainNode);
    ns.start(now);
  }

  if (type === 'boom') {
    const boomOut = _audCtx.createDynamicsCompressor();
    boomOut.threshold.value = -3; boomOut.knee.value = 2;
    boomOut.ratio.value = 12; boomOut.attack.value = 0.001; boomOut.release.value = 0.15;
    boomOut.connect(_audCtx.destination);
    // Katman 1: derin alt-bas darbe (lowpass 400→50 Hz sweep)
    (() => {
      const len = Math.floor(2.1 * SR);
      const nb = _audCtx.createBuffer(1, len, SR);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = (Math.random() * 2 - 1);
      const ns = _audCtx.createBufferSource(); ns.buffer = nb;
      const lp = _audCtx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, now);
      lp.frequency.exponentialRampToValueAtTime(50, now + 2.1);
      const g = _audCtx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(1.8, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
      ns.connect(lp); lp.connect(g); g.connect(boomOut); ns.start(now);
    })();
    // Katman 2: orta gövde (lowpass 200→60 Hz sweep, gecikmeli)
    (() => {
      const len = Math.floor(2.7 * SR);
      const nb = _audCtx.createBuffer(1, len, SR);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < len; i++) nd[i] = (Math.random() * 2 - 1);
      const ns = _audCtx.createBufferSource(); ns.buffer = nb;
      const lp = _audCtx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(200, now + 0.04);
      lp.frequency.exponentialRampToValueAtTime(60, now + 2.7);
      const g = _audCtx.createGain();
      g.gain.setValueAtTime(0.0001, now + 0.04);
      g.gain.linearRampToValueAtTime(1.5, now + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.7);
      ns.connect(lp); lp.connect(g); g.connect(boomOut); ns.start(now + 0.04);
    })();
    // Katman 3: sub-bass osilatör sweep (55→28 Hz)
    (() => {
      const o = _audCtx.createOscillator();
      const g = _audCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(55, now);
      o.frequency.exponentialRampToValueAtTime(28, now + 1.2);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(1.4, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      o.connect(g); g.connect(boomOut);
      o.start(now); o.stop(now + 1.25);
    })();
  } else if (type === 'bone') {
    noise(0.07, 0.55, null, 2200, 2);
    noise(0.12, 0.4, 1400, 400, 5);
    osc(95, now, 0.06, 0.35, 'sine');
  } else if (type === 'whoosh') {
    const len = Math.floor(0.22 * SR);
    const nb = _audCtx.createBuffer(1, len, SR);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = (Math.random() * 2 - 1);
    const ns = _audCtx.createBufferSource(); ns.buffer = nb;
    const hp = _audCtx.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.setValueAtTime(1800, now);
    hp.frequency.exponentialRampToValueAtTime(600, now + 0.22);
    const g = _audCtx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.32, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    ns.connect(hp);
    hp.connect(g);
    g.connect(_sfxGainNode);
    ns.start(now);
  } else if (type === 'zap') {
    const dur = 1.0;
    const g = _audCtx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.35, now + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    const o = _audCtx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, now);
    o.frequency.exponentialRampToValueAtTime(180, now + dur);
    const t = _audCtx.createOscillator(); t.type = 'square'; t.frequency.value = 45;
    const tG = _audCtx.createGain(); tG.gain.value = 0.6;
    const tBase = _audCtx.createGain(); tBase.gain.value = 0.4;
    t.connect(tG);
    const f = _audCtx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 18;
    f.frequency.setValueAtTime(100, now);
    f.frequency.exponentialRampToValueAtTime(800, now + dur);
    o.connect(f);
    f.connect(g);
    g.connect(_sfxGainNode);
    o.start(now); o.stop(now + dur);
    t.start(now); t.stop(now + dur);
    osc(45, now, 0.4, 0.4, 'sine');
  } else if (type === 'die') {
    osc(380, now, 0.5, 0.38, 'sine', 48);
    noise(0.3, 0.28, 600, null, 5);
    osc(220, now + 0.05, 0.3, 0.2, 'sine', 55);
  } else if (type === 'win') {
    [[261.63, 0], [329.63, 0.1], [392, 0.2], [523.25, 0.3], [659.26, 0.42]].forEach(([f, dt]) => {
      osc(f, now + dt, 0.45, 0.22, 'triangle');
      osc(f * 2, now + dt, 0.22, 0.08, 'sine');
    });
  } else if (type === 'pickup') {
    [880, 1108.73, 1318.51, 1760].forEach((f, i) => {
      osc(f, now + i * 0.06, 0.28, 0.16, 'sine');
      osc(f * 1.5, now + i * 0.06, 0.14, 0.07, 'triangle');
    });
  } else if (type === 'wire') {
    osc(380, now, 0.07, 0.16, 'sawtooth', 120);
    noise(0.06, 0.12, null, 900, 4);
  } else if (type === 'shield') {
    osc(880, now, 0.18, 0.26, 'sine');
    osc(1320, now, 0.12, 0.14, 'sine');
    osc(660, now + 0.08, 0.2, 0.18, 'triangle', 440);
  } else if (type === 'wood') {
    for (let i = 0; i < 20; i++) {
      const dt = i * 0.02 + Math.random() * 0.03;
      const dur = 0.05 + Math.random() * 0.15;
      const amp = (0.2 + Math.random() * 0.35) * (1 - i / 22);
      osc(100 + Math.random() * 120, now + dt, dur, amp, 'sine', 50);
      osc(350 + Math.random() * 400, now + dt, 0.02, amp * 0.6, 'triangle');
      noise(dur, amp * 0.5, 1400, 350, 10);
    }
  } else if (type === 'step') {
    const len = Math.floor(0.08 * SR);
    const nb = _audCtx.createBuffer(1, len, SR);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / len * 18);
    const ns = _audCtx.createBufferSource(); ns.buffer = nb;
    const lp = _audCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = _audCtx.createGain(); g.gain.value = 0.18;
    ns.connect(lp);
    lp.connect(g);
    g.connect(_sfxGainNode);
    ns.start(now);
    osc(90, now, 0.06, 0.12, 'sine', 40);
  } else if (type === 'scream') {
    const dur = 1.0;
    const g = _audCtx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.2, now + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    const o = _audCtx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(40, now);
    o.frequency.exponentialRampToValueAtTime(220, now + dur);
    const lp = _audCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    o.connect(lp);
    lp.connect(g);
    g.connect(_sfxGainNode);
    o.start(now);
    o.stop(now + dur);
  }
}

