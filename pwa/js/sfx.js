// Efeitos sonoros sintetizados com a Web Audio API (sem arquivos de áudio).
'use strict';

class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = false;
    this.musicSrc = null;
    this.musicBuf = null;
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
    if (this.musicOn) this.startMusic();
  }

  /** Liga/desliga a música de fundo. */
  setMusic(on) {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  startMusic() {
    if (!this.ctx || this.musicSrc) return;
    if (!this.musicBuf) this.musicBuf = this.buildMusic();
    const src = this.ctx.createBufferSource();
    src.buffer = this.musicBuf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(this.master);
    src.start();
    this.musicSrc = src;
  }

  stopMusic() {
    if (this.musicSrc) {
      try { this.musicSrc.stop(); } catch (e) { /* já parou */ }
      this.musicSrc = null;
    }
  }

  /** Loop de 8 s (120 BPM): Lá menor, Fá, Dó, Sol. Baixo, arpejo, bumbo e chimbal. */
  buildMusic() {
    const rate = this.ctx.sampleRate;
    const per = Math.floor(0.125 * rate);
    const steps = 64;
    const buf = this.ctx.createBuffer(1, per * steps, rate);
    const s = buf.getChannelData(0);
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const arp = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 4, 3, 2, 1];
    const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const tone = (start, len, f, square, vol, decay) => {
      let ph = 0;
      for (let i = 0; i < len && start + i < s.length; i++) {
        ph += f / rate;
        const p = ph - Math.floor(ph);
        const v = square ? (p < 0.5 ? 1 : -1) : 1 - 4 * Math.abs(p - 0.5);
        s[start + i] += v * vol * Math.min(1, i / 60) * Math.exp(-(i / rate) * decay);
      }
    };
    let seed = 3;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let step = 0; step < steps; step++) {
      const ch = chords[Math.floor(step / 16)];
      const start = step * per;
      const idx = arp[step % 16];
      tone(start, per, freq(ch[idx % 3] + 12 * Math.floor(idx / 3) + 12), true, 0.10, 6);
      if (step % 4 === 0) tone(start, per * 3, freq(ch[0] - 24), false, 0.32, 2.5);
      if (step % 4 === 2) tone(start, per, freq(ch[0] - 12), false, 0.18, 6);
      if (step % 8 === 0) {
        for (let i = 0; i < per * 2 && start + i < s.length; i++) {
          const t = i / rate;
          const f = 110 * Math.exp(-t * 18) + 40;
          s[start + i] += Math.sin(2 * Math.PI * f * t) * 0.45 * Math.exp(-t * 12);
        }
      }
      if (step % 2 === 1) {
        let y = 0;
        const n = Math.floor(per / 3);
        for (let i = 0; i < n; i++) {
          y = (rnd() * 2 - 1) - y * 0.5;
          s[start + i] += y * 0.05 * (1 - i / n);
        }
      }
    }
    let peak = 0;
    for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i]));
    if (peak > 0) for (let i = 0; i < s.length; i++) s[i] = s[i] / peak * 0.8;
    return buf;
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
