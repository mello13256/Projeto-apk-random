// Efeitos sonoros sintetizados com a Web Audio API (sem arquivos de áudio).
'use strict';

class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.last = {};
    this.gap = { SHOOT: 70, HIT: 45, PICKUP: 35, HURT: 120, LEVEL_UP: 120, BUY: 60, EXPLODE: 90, WAVE_END: 200, KILL: 45, ERROR: 120 };
  }

  /** O navegador só libera o áudio depois de um clique/tecla do jogador. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(id) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.last[id] || 0) < (this.gap[id] || 50)) return;
    this.last[id] = now;
    switch (id) {
      case 'SHOOT': this.sweep(0.05, 720, 360, 'square', 0.25); break;
      case 'HIT': this.noise(0.04, 3000, 0.3); break;
      case 'PICKUP': this.sweep(0.07, 900, 1500, 'sine', 0.4); break;
      case 'HURT': this.sweep(0.22, 320, 70, 'sawtooth', 0.6); break;
      case 'LEVEL_UP': this.arpeggio([523, 659, 784, 1047], 0.075, 'square', 0.3); break;
      case 'BUY': this.arpeggio([988, 1319], 0.08, 'sine', 0.5); break;
      case 'EXPLODE': this.noise(0.35, 500, 0.9); break;
      case 'WAVE_END': this.arpeggio([392, 523, 659, 784, 1047], 0.09, 'sine', 0.45); break;
      case 'KILL': this.sweep(0.08, 420, 900, 'square', 0.2); break;
      default: this.sweep(0.16, 160, 130, 'square', 0.35); // ERROR
    }
  }

  envelope(g, t0, dur, vol) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  sweep(dur, f0, f1, type, vol, start = 0) {
    const t0 = this.ctx.currentTime + start;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    this.envelope(g, t0, dur, vol);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  arpeggio(notes, step, type, vol) {
    notes.forEach((f, i) => this.sweep(step * 2, f, f, type, vol * 0.7, i * step));
  }

  noise(dur, cutoff, vol) {
    const t0 = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    this.envelope(g, t0, dur, vol);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }
}
