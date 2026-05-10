'use strict';

// ─── AudioSystem – Web Audio API sound synthesis ──────────────────────────
// All sounds are procedurally generated so no external audio files are needed.

class AudioSystem {
  constructor() {
    this._ctx      = null;
    this._music    = null;
    this._musicGain= null;
    this._sfxGain  = null;
    this._enabled  = { sfx: true, music: true };
    this._started  = false;
  }

  init() {
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._sfxGain   = this._ctx.createGain(); this._sfxGain.gain.value   = 0.6;
      this._musicGain = this._ctx.createGain(); this._musicGain.gain.value = 0.25;
      this._sfxGain.connect(this._ctx.destination);
      this._musicGain.connect(this._ctx.destination);
    } catch (_) { /* audio not available */ }
  }

  _resume() {
    if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
  }

  toggle(kind, on) {
    this._enabled[kind] = on;
    if (kind === 'music' && this._musicGain) {
      this._musicGain.gain.value = on ? 0.25 : 0;
    }
    if (kind === 'sfx' && this._sfxGain) {
      this._sfxGain.gain.value = on ? 0.6 : 0;
    }
  }

  // ── Music ─────────────────────────────────────────────────────────────────
  startBattleMusic() {
    if (!this._ctx || !this._enabled.music) return;
    this._resume();
    this._stopMusic();

    // Simple driving bass + arpeggiated melody using oscillators
    const bpm  = 140;
    const beat = 60 / bpm;

    // Bass line
    const bassNotes = [55, 55, 62, 58]; // A1, A1, D2, Bb1 in Hz — approx
    const bassFreqs = [110, 110, 146.8, 123.5];
    let t = this._ctx.currentTime;
    const bassLoop = () => {
      if (!this._ctx || !this._enabled.music) return;
      bassFreqs.forEach((freq, i) => {
        const osc  = this._ctx.createOscillator();
        const gain = this._ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t + i * beat);
        gain.gain.setValueAtTime(0, t + i * beat);
        gain.gain.linearRampToValueAtTime(0.3, t + i * beat + 0.02);
        gain.gain.linearRampToValueAtTime(0,   t + i * beat + beat * 0.85);
        osc.connect(gain);
        gain.connect(this._musicGain);
        osc.start(t + i * beat);
        osc.stop( t + i * beat + beat);
      });
      t += beat * 4;
      this._musicTimer = setTimeout(bassLoop, beat * 4 * 1000 - 50);
    };
    bassLoop();
  }

  stopBattleMusic() { this._stopMusic(); }

  _stopMusic() {
    clearTimeout(this._musicTimer);
    this._musicTimer = null;
  }

  // ── SFX helpers ──────────────────────────────────────────────────────────
  _tone(freq, type, dur, vol, when) {
    if (!this._ctx || !this._enabled.sfx) return;
    this._resume();
    const t   = when ?? this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const env = this._ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env);
    env.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + dur);
  }

  _noise(dur, vol, when) {
    if (!this._ctx || !this._enabled.sfx) return;
    this._resume();
    const t    = when ?? this._ctx.currentTime;
    const size = Math.floor(this._ctx.sampleRate * dur);
    const buf  = this._ctx.createBuffer(1, size, this._ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1);
    const src  = this._ctx.createBufferSource();
    const env  = this._ctx.createGain();
    src.buffer = buf;
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(env);
    env.connect(this._sfxGain);
    src.start(t);
  }

  // ── Named effects ────────────────────────────────────────────────────────
  cardPlace() {
    this._tone(440, 'sine',     0.12, 0.4);
    this._tone(660, 'triangle', 0.08, 0.25, this._ctx?.currentTime + 0.05);
  }

  hit() {
    this._tone(200, 'square',  0.08, 0.3);
    this._noise(0.05, 0.15);
  }

  troopDeath() {
    this._tone(120, 'sawtooth', 0.2, 0.4);
    this._noise(0.12, 0.2);
  }

  towerHit() {
    this._tone(90,  'sawtooth', 0.15, 0.5);
    this._tone(180, 'square',   0.10, 0.3);
    this._noise(0.1, 0.3);
  }

  towerDestroy() {
    // Dramatic boom
    for (let i = 0; i < 5; i++) {
      const t = (this._ctx?.currentTime || 0) + i * 0.07;
      this._tone(60 + i * 10, 'sawtooth', 0.4, 0.6, t);
    }
    this._noise(0.5, 0.5);
    // Victory/defeat sting
    setTimeout(() => {
      this._tone(523, 'sine', 0.2, 0.4);
      this._tone(659, 'sine', 0.2, 0.3, (this._ctx?.currentTime || 0) + 0.2);
    }, 300);
  }

  fireball() {
    this._tone(80, 'sawtooth', 0.5, 0.6);
    this._noise(0.3, 0.4);
    setTimeout(() => this._noise(0.2, 0.3), 200);
  }

  lightning() {
    this._noise(0.08, 0.7);
    this._tone(1000, 'sawtooth', 0.15, 0.5);
    this._tone(500,  'square',   0.15, 0.3, (this._ctx?.currentTime || 0) + 0.06);
  }

  freeze() {
    [523, 622, 698, 784].forEach((f, i) => {
      this._tone(f, 'sine', 0.25, 0.25, (this._ctx?.currentTime || 0) + i * 0.05);
    });
  }

  elixirFull() {
    this._tone(880, 'sine', 0.12, 0.2);
    this._tone(1100,'sine', 0.10, 0.15, (this._ctx?.currentTime || 0) + 0.08);
  }

  victory() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this._tone(f, 'sine', 0.35, 0.4, (this._ctx?.currentTime || 0) + i * 0.15);
    });
  }

  defeat() {
    const notes = [440, 349, 294, 220];
    notes.forEach((f, i) => {
      this._tone(f, 'sine', 0.4, 0.35, (this._ctx?.currentTime || 0) + i * 0.2);
    });
  }

  buttonClick() {
    this._tone(600, 'sine', 0.06, 0.2);
  }

  matchFound() {
    this._tone(440, 'sine', 0.1, 0.3);
    this._tone(550, 'sine', 0.1, 0.3, (this._ctx?.currentTime || 0) + 0.1);
    this._tone(660, 'sine', 0.2, 0.4, (this._ctx?.currentTime || 0) + 0.2);
  }
}
