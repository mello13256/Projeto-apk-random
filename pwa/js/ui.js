// Desenho de todas as telas + botões ("UI imediata"), igual à versão Android.
// Coordenadas virtuais: a tela sempre tem 720 de altura.
'use strict';

const VH = 720;
const TIER_COLOR = ['#D7D7D7', '#4AA3FF', '#B76BFF', '#FF5A4A'];
const TIER_BG = ['#3A3A3A', '#1C3552', '#3A2358', '#55221C'];
const C = {
  BG: '#1B2414', PANEL: 'rgba(42,33,22,0.92)', PANEL_BORDER: '#7A5A30', GREEN: '#4CAF50',
  ORANGE: '#F08A24', GRAY: '#5A5A5A', RED: '#D9443A', SEED: '#8EE05A', GOLD: '#FFD84A',
};
const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

/** Guarda configurações e recordes no navegador. */
class Prefs {
  constructor() {
    this.data = { sound: true, bestWave: 0, wins: 0 };
    try { Object.assign(this.data, JSON.parse(localStorage.getItem('horta_hostil') || '{}')); } catch (e) { /* sem armazenamento */ }
  }
  save() { try { localStorage.setItem('horta_hostil', JSON.stringify(this.data)); } catch (e) { /* ignora */ } }
  recordRun(won, wave) {
    if (wave > this.data.bestWave) this.data.bestWave = wave;
    if (won) this.data.wins++;
    this.save();
  }
}

/** Emojis viram imagens (com cache) para desenhar rápido. */
class Sprites {
  constructor() { this.cache = new Map(); }
  get(emoji, px, tint) {
    let size = Math.max(16, Math.min(192, Math.round(px)));
    size = Math.ceil(size / 8) * 8;
    const key = emoji + '#' + size + '#' + (tint || '');
    let c = this.cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (tint) {
      g.drawImage(this.get(emoji, size, null), 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = tint;
      g.fillRect(0, 0, size, size);
    } else {
      g.font = `${Math.round(size * 0.8)}px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(emoji, size / 2, size / 2 + size * 0.04);
    }
    this.cache.set(key, c);
    return c;
  }
}

class Ui {
  constructor(game, prefs, sfx) {
    this.game = game;
    this.prefs = prefs;
    this.sfx = sfx;
    this.sprites = new Sprites();
    this.vw = 1280;
    this.scale = 1;
    this.time = 0;
    this.buttons = [];
    this.down = new Map(); // pointerId -> {action,arg}
    this.joy = null; // {id, ox, oy, x, y}
    this.keys = new Set();
    this.mouseX = -1; this.mouseY = -1;
    this.hovering = false;
    this.selectedChar = 0;
    this.popupWeapon = -1;
    this.showHelp = false;
    this.toast = ''; this.toastTime = 0;
    this.arena = null;
  }

  setSize(w, h) { this.scale = h / VH; this.vw = w / this.scale; }

  // ------------------------------------------------------------------
  // Entrada
  // ------------------------------------------------------------------

  moveVector() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (this.joy) {
      const R = 75;
      x += clamp(this.joy.x - this.joy.ox, -R, R) / R;
      y += clamp(this.joy.y - this.joy.oy, -R, R) / R;
    }
    return [x, y];
  }

  onDown(id, x, y) {
    const b = this.hit(x, y);
    this.down.set(id, b ? { action: b.action, arg: b.arg } : null);
    const g = this.game;
    if (!b && g.state === 'PLAYING' && !g.paused && !this.joy) this.joy = { id, ox: x, oy: y, x, y };
  }

  onMove(id, x, y) {
    if (id === 'mouse' || id === 1) { this.mouseX = x; this.mouseY = y; }
    const j = this.joy;
    if (j && j.id === id) {
      j.x = x; j.y = y;
      const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy), max = 75 * 1.6;
      if (d > max) { const k = (d - max) / d; j.ox += dx * k; j.oy += dy * k; }
    }
  }

  onUp(id, x, y) {
    if (this.joy && this.joy.id === id) { this.joy = null; return; }
    const d = this.down.get(id);
    this.down.delete(id);
    const b = this.hit(x, y);
    if (!b || !d || b.action !== d.action || b.arg !== d.arg) return;
    if (b.enabled) this.doAction(b.action, b.arg);
    else this.disabledTap(b.action, b.arg);
  }

  releaseAll() { this.joy = null; this.down.clear(); this.keys.clear(); }

  onKey(code) {
    const g = this.game;
    if (this.showHelp && (code === 'Escape' || code === 'Enter' || code === 'Space')) { this.showHelp = false; return; }
    if (this.popupWeapon >= 0 && code === 'Escape') { this.popupWeapon = -1; return; }
    const num = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[code];
    const ok = code === 'Enter' || code === 'Space';
    switch (g.state) {
      case 'MENU':
        if (ok) this.doAction('PLAY');
        else if (code === 'KeyH') this.doAction('HELP');
        break;
      case 'CHAR_SELECT':
        if (code === 'ArrowLeft' || code === 'KeyA') this.selectedChar = (this.selectedChar + CHARS.length - 1) % CHARS.length;
        else if (code === 'ArrowRight' || code === 'KeyD') this.selectedChar = (this.selectedChar + 1) % CHARS.length;
        else if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowDown' || code === 'KeyS') this.selectedChar = (this.selectedChar + 3) % CHARS.length;
        else if (ok) this.doAction('START');
        else if (code === 'Escape') this.doAction('MENU');
        break;
      case 'PLAYING':
        if (code === 'Escape' || code === 'KeyP') { g.paused = !g.paused; this.joy = null; }
        else if (g.paused && code === 'KeyQ') this.doAction('QUIT');
        break;
      case 'LEVEL_UP':
        if (num !== undefined) this.doAction('LEVEL', num);
        else if (code === 'KeyR') this.doAction('LEVEL_REROLL');
        break;
      case 'SHOP':
        if (num !== undefined) this.doAction('BUY', num);
        else if (code === 'KeyR') this.doAction('REROLL');
        else if (ok) this.doAction('NEXT');
        break;
      case 'GAME_OVER':
      case 'VICTORY':
        if (ok) this.doAction('AGAIN');
        else if (code === 'Escape') this.doAction('MENU');
        break;
    }
  }

  hit(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  doAction(action, arg) {
    const g = this.game, p = g.player;
    switch (action) {
      case 'PLAY': g.state = 'CHAR_SELECT'; break;
      case 'SOUND': this.prefs.data.sound = !this.prefs.data.sound; this.prefs.save(); this.sfx.enabled = this.prefs.data.sound; break;
      case 'FULLSCREEN': toggleFullscreen(); break;
      case 'HELP': this.showHelp = !this.showHelp; break;
      case 'CHAR': this.selectedChar = arg; break;
      case 'START': g.newRun(CHARS[this.selectedChar]); this.joy = null; break;
      case 'AGAIN': g.newRun(p ? p.character : CHARS[this.selectedChar]); this.joy = null; break;
      case 'MENU': g.state = 'MENU'; g.paused = false; break;
      case 'PAUSE': g.paused = true; this.joy = null; break;
      case 'RESUME': g.paused = false; break;
      case 'QUIT': g.paused = false; g.state = 'GAME_OVER'; this.prefs.recordRun(false, g.wave); break;
      case 'LEVEL': g.chooseLevel(arg); break;
      case 'LEVEL_REROLL': if (!g.rerollLevel()) this.showToast('Sementes insuficientes!'); break;
      case 'BUY': {
        const r = g.buy(arg);
        if (r === BUY_NO_MONEY) this.showToast('Sementes insuficientes!');
        else if (r === BUY_FULL) this.showToast('Armas cheias! Venda ou combine uma.');
        break;
      }
      case 'LOCK': g.toggleLock(arg); break;
      case 'REROLL': if (!g.rerollShop()) this.showToast('Sementes insuficientes!'); break;
      case 'NEXT': this.popupWeapon = -1; g.nextWave(); this.joy = null; break;
      case 'WEAPON': this.popupWeapon = arg; break;
      case 'SELL':
        if (g.sellWeapon(this.popupWeapon)) this.popupWeapon = -1;
        else this.showToast('Você precisa de pelo menos 1 arma!');
        break;
      case 'COMBINE':
        if (g.combineWeapon(this.popupWeapon)) { this.popupWeapon = -1; this.showToast('Arma melhorada!'); }
        break;
      case 'CLOSE': this.popupWeapon = -1; break;
    }
  }

  disabledTap(action, arg) {
    if (action === 'BUY') {
      const r = this.game.checkBuy(arg);
      if (r === BUY_NO_MONEY) this.showToast('Sementes insuficientes!');
      else if (r === BUY_FULL) this.showToast('Armas cheias! Venda ou combine uma.');
    } else if (action === 'REROLL' || action === 'LEVEL_REROLL') this.showToast('Sementes insuficientes!');
    else if (action === 'SELL') this.showToast('Você precisa de pelo menos 1 arma!');
    else if (action === 'COMBINE') this.showToast('Precisa de outra arma igual (mesmo nível).');
  }

  showToast(s) { this.toast = s; this.toastTime = 2; }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------

  draw(ctx, dt) {
    this.ctx = ctx;
    this.time += dt;
    if (this.toastTime > 0) this.toastTime -= dt;
    this.buttons = [];
    this.hovering = false;
    this.deferred = null;
    ctx.save();
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, this.vw, VH);
    const g = this.game;
    switch (g.state) {
      case 'MENU': this.drawMenu(); break;
      case 'CHAR_SELECT': this.drawCharSelect(); break;
      case 'PLAYING':
        this.drawWorld();
        if (g.paused) this.drawPause(); else this.drawHud();
        break;
      case 'LEVEL_UP': this.drawLevelUp(); break;
      case 'SHOP': this.drawShop(); break;
      default: this.drawEnd();
    }
    if (this.deferred) this.deferred();
    if (this.toastTime > 0 && this.toast) {
      const a = Math.min(1, this.toastTime * 3);
      const w = this.measure(this.toast, 26) + 48;
      ctx.globalAlpha = a;
      this.roundRect(this.vw / 2 - w / 2, VH - 120, w, 50, 16, 'rgba(20,20,20,0.86)');
      this.text(this.toast, this.vw / 2, VH - 86, 26, '#FFE678', 'center');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    return this.hovering;
  }

  // --- Menu ---

  drawMenu() {
    this.drawMenuBackground();
    const cx = this.vw / 2;
    CHARS.forEach((c, i) => {
      const x = cx + (i - (CHARS.length - 1) / 2) * 96;
      this.emoji(c.icon, x, 120 + Math.sin(this.time * 3 + i) * 10, 76);
    });
    this.text('HORTA HOSTIL', cx, 265, 92, C.GOLD, 'center');
    this.text('Os insetos invadiram a horta. Só os legumes podem salvá-la!', cx, 315, 26, '#E8F5D0', 'center');
    this.button(cx - 170, 360, 340, 90, 'JOGAR', 'PLAY', 0, C.GREEN, true, 44);
    this.button(cx - 340, 470, 210, 66, this.prefs.data.sound ? 'Som: SIM' : 'Som: NÃO', 'SOUND', 0, C.GRAY, true, 26);
    this.button(cx - 105, 470, 210, 66, 'Tela cheia', 'FULLSCREEN', 0, C.GRAY, true, 26);
    this.button(cx + 130, 470, 210, 66, 'Como jogar', 'HELP', 0, C.GRAY, true, 26);
    this.text('Melhor onda: ' + this.prefs.data.bestWave + '   •   Vitórias: ' + this.prefs.data.wins, cx, 590, 26, '#CFE3B8', 'center');
    this.text('Enter: jogar  •  H: ajuda', cx, 635, 20, 'rgba(255,255,255,0.55)', 'center');
    this.text('Projeto escolar • feito com JavaScript puro', cx, 690, 20, 'rgba(255,255,255,0.6)', 'center');
    if (this.showHelp) this.drawHelp();
  }

  drawMenuBackground() {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.24;
    for (let i = 0; i < 9; i++) {
      const speed = 40 + (i * 37) % 60;
      const x = ((this.time * speed + i * 211) % (this.vw + 200)) - 100;
      const y = 60 + (i * 97) % 620;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      this.emoji(SPAWNABLE[i % SPAWNABLE.length].icon, 0, 0, 50);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawHelp() {
    const w = Math.min(920, this.vw - 60), h = 540;
    const x = this.vw / 2 - w / 2, y = VH / 2 - h / 2;
    this.backdrop('HELP');
    this.panel(x, y, w, h);
    this.text('COMO JOGAR', this.vw / 2, y + 60, 40, C.GOLD, 'center');
    const lines = [
      '• Ande com W A S D ou as setas (no celular: arraste o dedo).',
      '• Suas armas atacam SOZINHAS o inimigo mais próximo.',
      '• Inimigos derrotados soltam sementes 🌱: pegue-as!',
      '• Sementes dão experiência e compram coisas na loja.',
      '• Sobreviva até o tempo da onda acabar. Esc ou P = pausa.',
      '• Entre as ondas: escolha melhorias (teclas 1-4) e compre na loja.',
      '• Duas armas iguais do mesmo nível viram uma mais forte.',
      '• Sobreviva às 20 ondas para salvar a horta!',
    ];
    lines.forEach((l, i) => this.text(l, x + 40, y + 120 + i * 44, 24, '#FFFFFF', 'left'));
    this.button(this.vw / 2 - 110, y + h - 74, 220, 56, 'Entendi!', 'HELP', 0, C.GREEN, true, 26);
  }

  // --- Personagens ---

  drawCharSelect() {
    this.text('ESCOLHA SEU LEGUME', this.vw / 2, 62, 46, C.GOLD, 'center');
    const cols = 3, gap = 18;
    const cw = (this.vw - 60 - gap * (cols - 1)) / cols, ch = 238;
    CHARS.forEach((cd, i) => {
      const x = 30 + (i % cols) * (cw + gap), y = 95 + Math.floor(i / cols) * (ch + gap);
      const sel = i === this.selectedChar;
      const hov = this.isHover(x, y, cw, ch);
      this.roundRect(x, y, cw, ch, 18, sel ? '#3F5A26' : hov ? '#3A2E1E' : '#2A2116', sel ? C.GOLD : C.PANEL_BORDER, sel ? 5 : 3);
      this.register(x, y, cw, ch, 'CHAR', i, true);
      const bob = sel ? Math.sin(this.time * 6) * 5 : 0;
      this.emoji(cd.icon, x + 62, y + 70 + bob, 88);
      if (sel) this.drawEyes(x + 62, y + 70 + bob, 1, 1, 0);
      this.text(cd.name, x + 120, y + 48, 28, '#FFFFFF', 'left');
      this.text(cd.tagline, x + 120, y + 80, 20, '#BFD6A6', 'left');
      this.text('Arma: ' + cd.startWeapon.name, x + 22, y + 138, 21, '#FFE08A', 'left');
      for (let m = 0; m < cd.mods.length; m += 2) {
        const v = cd.mods[m + 1];
        const colX = x + 22 + ((m / 2) % 2) * (cw / 2 - 8);
        this.text(Stat.format(cd.mods[m], v), colX, y + 165 + Math.floor(m / 4) * 26, 19, v >= 0 ? '#8CF08C' : '#FF8080', 'left');
      }
    });
    this.button(30, VH - 92, 220, 70, 'Voltar', 'MENU', 0, C.GRAY, true, 30);
    this.text('Setas: escolher  •  Enter: começar', this.vw / 2, VH - 48, 20, 'rgba(255,255,255,0.55)', 'center');
    this.button(this.vw - 330, VH - 96, 300, 78, 'COMEÇAR!', 'START', 0, C.GREEN, true, 38);
  }

  // --- Mundo ---

  buildArena() {
    const c = document.createElement('canvas');
    c.width = WORLD_W; c.height = WORLD_H;
    const g = c.getContext('2d');
    const tile = 100;
    for (let ty = 0; ty < WORLD_H; ty += tile) {
      for (let tx = 0; tx < WORLD_W; tx += tile) {
        g.fillStyle = ((tx + ty) / tile) % 2 === 0 ? '#5E8A3A' : '#577F36';
        g.fillRect(tx, ty, tile, tile);
      }
    }
    const r = makeRng(42);
    const colors = ['#FFE066', '#FF8FB1', '#FFFFFF', '#B38BFF'];
    for (let i = 0; i < 260; i++) {
      const x = r.float() * WORLD_W, y = r.float() * WORLD_H, kind = r.int(10);
      if (kind < 6) {
        g.strokeStyle = '#4A7030'; g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x - 4, y - 10);
        g.moveTo(x, y); g.lineTo(x, y - 13);
        g.moveTo(x, y); g.lineTo(x + 4, y - 10);
        g.stroke();
      } else if (kind < 8) {
        g.fillStyle = '#7D7A6A';
        g.beginPath(); g.arc(x, y, 4 + r.float() * 4, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = colors[r.int(colors.length)];
        for (let k = 0; k < 5; k++) {
          const a = k * Math.PI * 2 / 5;
          g.beginPath(); g.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#FFB02E';
        g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
      }
    }
    this.arena = c;
  }

  drawWorld() {
    if (!this.arena) this.buildArena();
    const ctx = this.ctx, g = this.game, p = g.player, vw = this.vw;
    const margin = 70;
    let camX = WORLD_W + margin * 2 <= vw ? (WORLD_W - vw) / 2 : clamp(p.x - vw / 2, -margin, WORLD_W - vw + margin);
    let camY = clamp(p.y - VH / 2, -margin, WORLD_H - VH + margin);
    if (g.shake > 0 && !g.paused) {
      camX += (Math.random() - 0.5) * g.shake;
      camY += (Math.random() - 0.5) * g.shake;
    }
    ctx.fillStyle = '#22301A';
    ctx.fillRect(0, 0, vw, VH);
    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.drawImage(this.arena, 0, 0);

    // cerca
    ctx.lineWidth = 16; ctx.strokeStyle = '#6B4A26';
    ctx.strokeRect(-8, -8, WORLD_W + 16, WORLD_H + 16);
    ctx.lineWidth = 6; ctx.strokeStyle = '#8A6234';
    ctx.strokeRect(-8, -8, WORLD_W + 16, WORLD_H + 16);

    // avisos de nascimento
    ctx.lineCap = 'round';
    for (const t of g.telegraphs) {
      const pulse = Math.abs(Math.sin(t.time * 12));
      const s = t.def.boss ? 42 : 14;
      ctx.strokeStyle = `rgba(255,50,40,${(120 + 135 * pulse) / 255})`;
      ctx.lineWidth = t.def.boss ? 10 : 5;
      ctx.beginPath();
      ctx.moveTo(t.x - s, t.y - s); ctx.lineTo(t.x + s, t.y + s);
      ctx.moveTo(t.x - s, t.y + s); ctx.lineTo(t.x + s, t.y - s);
      ctx.stroke();
    }

    // coletáveis
    for (const pk of g.pickups) {
      const bob = Math.sin(pk.bob * 5) * 3;
      if (pk.type === 0) {
        const r = pk.value > 1 ? 10 : 7;
        this.circle(pk.x, pk.y + 6, r, 'rgba(0,0,0,0.25)');
        this.circle(pk.x, pk.y + bob, r, C.SEED);
        this.circle(pk.x - r * 0.3, pk.y + bob - r * 0.3, r * 0.4, '#D6FFB0');
      } else {
        this.emoji('🍎', pk.x, pk.y + bob, 34);
      }
    }

    // sombras
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const e of g.enemies) {
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius * 0.78, e.radius * 0.9, e.radius * 0.23, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 23, 24, 7, 0, 0, Math.PI * 2); ctx.fill();

    for (const e of g.enemies) this.drawEnemy(e);
    this.drawPlayer(p);
    for (const w of p.weapons) this.drawWeapon(w);

    // projéteis
    for (const b of g.bullets) {
      if (b.lightning) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#FFE14A'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.stroke();
      } else if (b.burn > 0) {
        this.circle(b.x, b.y, b.radius * 1.7, 'rgba(255,106,0,0.4)');
        this.circle(b.x, b.y, b.radius, '#FFB040');
      } else {
        this.circle(b.x, b.y, b.radius + 2, '#1A1A1A');
        this.circle(b.x, b.y, b.radius, b.explosion > 0 ? '#FF7A2A' : '#FFF3C4');
      }
    }
    for (const b of g.enemyBullets) {
      this.circle(b.x, b.y, b.radius + 3, '#3A0A4A');
      this.circle(b.x, b.y, b.radius, '#C24BFF');
      this.circle(b.x, b.y, b.radius * 0.4, '#F5D6FF');
    }

    // partículas
    for (const pt of g.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      if (pt.ring) {
        ctx.strokeStyle = `rgba(${pt.color},${a})`;
        ctx.lineWidth = 8 * a + 2;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1.1 - a * 0.6), 0, Math.PI * 2); ctx.stroke();
      } else {
        this.circle(pt.x, pt.y, pt.size * (0.4 + 0.6 * a), `rgba(${pt.color},${a})`);
      }
    }

    // números de dano
    for (const t of g.texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.maxLife * 2);
      this.text(t.text, t.x, t.y, t.size, t.color, 'center');
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawEnemy(e) {
    const ctx = this.ctx;
    const size = e.radius * 2.5;
    const squash = Math.sin(e.anim * 10) * 0.06;
    let tint = null, ox = 0;
    if (e.flash > 0) tint = '#FFFFFF';
    else if ((e.def.ai === AI_CHARGE && e.aiState === 1) || (e.def.ai === AI_BOSS_ANT && e.aiState === 2)) {
      tint = 'rgba(255,32,32,0.6)';
      ox = (Math.random() - 0.5) * 6;
    } else if (e.burnTime > 0) tint = 'rgba(255,106,0,0.53)';
    ctx.save();
    ctx.translate(e.x + ox, e.y);
    if (!e.facingLeft) ctx.scale(-1, 1);
    ctx.scale(1 + squash, 1 - squash);
    this.emoji(e.def.icon, 0, 0, size, tint);
    ctx.restore();
    if (!e.def.boss && e.hp < e.maxHp) {
      const w = e.radius * 1.6, y = e.y - e.radius * 1.25;
      ctx.fillStyle = 'rgba(0,0,0,0.67)';
      ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 6);
      ctx.fillStyle = '#FF5040';
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  drawPlayer(p) {
    const g = this.game, ctx = this.ctx;
    if (p.iframes > 0 && g.waveTime > 1 && Math.floor(p.iframes * 20) % 2 === 0) return;
    const bob = p.moving ? Math.sin(p.moveAnim) * 0.07 : Math.sin(this.time * 3) * 0.03;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1 - bob * 0.5, 1 + bob);
    ctx.save();
    if (!p.facingLeft) ctx.scale(-1, 1);
    this.emoji(p.character.icon, 0, 0, 68);
    ctx.restore();
    this.drawEyes(0, -4, 1, p.lookX, p.lookY);
    ctx.restore();
  }

  /** Olhinhos esbugalhados (tipo Brotato!). */
  drawEyes(x, y, s, lx, ly) {
    const r = 8 * s, ex = 10 * s;
    const len = Math.hypot(lx, ly);
    if (len > 0.01) { lx /= len; ly /= len; }
    for (const i of [-1, 1]) {
      const cx = x + i * ex;
      this.circle(cx, y, r + 2 * s, '#000000');
      this.circle(cx, y, r, '#FFFFFF');
      this.circle(cx + lx * r * 0.4, y + ly * r * 0.4, r * 0.48, '#111111');
    }
  }

  drawWeapon(w) {
    const ctx = this.ctx, d = w.def;
    const ang = w.attacking() ? Math.atan2(w.dirY, w.dirX) : w.angle;
    ctx.save();
    ctx.translate(w.tipX, w.tipY);
    ctx.rotate(ang);
    if (Math.cos(ang) < 0) ctx.scale(1, -1);
    const tc = TIER_COLOR[w.tier];
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1A1A1A';
    switch (d.shape) {
      case SHAPE_FIST:
        this.circle(4, 0, 11, d.color); ctx.stroke();
        this.circle(-6, 0, 4, tc);
        break;
      case SHAPE_BLADE: {
        const len = d === W.LANCA ? 46 : d === W.ESPADA ? 38 : 26;
        this.roundRect(-12, -3.5, 14, 7, 2, '#6B4423');
        ctx.fillStyle = tc; ctx.fillRect(0, -6, 4, 12);
        ctx.beginPath();
        ctx.moveTo(4, -4); ctx.lineTo(4 + len - 8, -4); ctx.lineTo(4 + len, 0); ctx.lineTo(4 + len - 8, 4); ctx.lineTo(4, 4);
        ctx.closePath();
        ctx.fillStyle = d.color; ctx.fill();
        ctx.strokeStyle = '#1A1A1A'; ctx.lineWidth = 3; ctx.stroke();
        break;
      }
      case SHAPE_GUN:
        this.roundRect(-6, 0, 8, 12, 2, '#3A2A1A');
        this.roundRect(-8, -6, 28, 10, 3, d.color, '#1A1A1A', 3);
        this.circle(0, -1, 3, tc);
        break;
      case SHAPE_STAFF:
        ctx.strokeStyle = '#6B4423'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(14, 0); ctx.stroke();
        ctx.globalAlpha = 0.4;
        this.circle(18, 0, 11 + Math.sin(this.time * 8) * 2, d.color);
        ctx.globalAlpha = 1;
        this.circle(18, 0, 7, d.color);
        this.circle(-12, 0, 3, tc);
        break;
      default:
        this.roundRect(-12, -8, 36, 15, 4, d.color, '#1A1A1A', 3);
        this.roundRect(20, -9, 7, 17, 2, '#222222');
        this.circle(-4, 0, 3.5, tc);
    }
    ctx.restore();
  }

  // --- HUD ---

  drawHud() {
    const g = this.game, p = g.player, vw = this.vw;
    this.bar(18, 16, 320, 34, p.hp / p.maxHp(), '#E0413A', '#3A1210');
    this.text(Math.max(0, Math.ceil(p.hp)) + ' / ' + p.maxHp(), 178, 42, 24, '#FFFFFF', 'center');
    this.bar(18, 56, 320, 22, p.xp / p.xpToNext(), '#5FD35F', '#12301A');
    this.text('NV ' + p.level, 178, 74, 18, '#FFFFFF', 'center');
    this.seedIcon(34, 104, 12);
    this.text(String(p.materials), 56, 115, 32, '#FFFFFF', 'left');

    this.text('ONDA ' + g.wave, vw / 2, 40, 28, '#FFFFFF', 'center');
    const left = Math.ceil(Math.max(0, g.waveDuration - g.waveTime));
    this.text(String(left), vw / 2, 96, 56, left <= 5 ? '#FF6A5A' : '#FFFFFF', 'center');

    this.button(vw - 86, 16, 68, 68, 'II', 'PAUSE', 0, 'rgba(51,51,51,0.67)', true, 30);

    const boss = g.boss;
    if (boss && !boss.dead) {
      const w = Math.min(700, vw * 0.55);
      this.bar(vw / 2 - w / 2, VH - 52, w, 26, boss.hp / boss.maxHp, '#B03AFF', '#26102E');
      this.text(boss.def.name, vw / 2, VH - 62, 24, '#FFFFFF', 'center');
    }

    if (g.bannerTime > 0) {
      const a = Math.min(1, g.bannerTime * 2);
      const s = 1 + Math.max(0, g.bannerTime - 1.8) * 1.5;
      this.ctx.globalAlpha = a;
      this.text(g.banner, vw / 2, VH * 0.36, 58 * s, C.GOLD, 'center');
      this.ctx.globalAlpha = 1;
    }

    const j = this.joy;
    if (j) {
      const R = 75;
      this.circle(j.ox, j.oy, R, 'rgba(255,255,255,0.2)');
      this.ctx.strokeStyle = 'rgba(255,255,255,0.4)'; this.ctx.lineWidth = 3; this.ctx.stroke();
      this.circle(j.ox + clamp(j.x - j.ox, -R, R), j.oy + clamp(j.y - j.oy, -R, R), 32, 'rgba(255,255,255,0.6)');
    } else if (g.wave === 1 && g.waveTime < 6) {
      this.text('Use W A S D ou as setas para andar', vw / 2, VH - 110, 30, 'rgba(255,255,255,0.8)', 'center');
    }
  }

  drawPause() {
    const ctx = this.ctx, vw = this.vw;
    ctx.fillStyle = 'rgba(0,0,0,0.69)';
    ctx.fillRect(0, 0, vw, VH);
    this.register(0, 0, vw, VH, 'NONE', -1, false);
    const statsW = vw < 1200 ? 250 : 300;
    const cx = (vw - statsW) / 2;
    this.text('PAUSADO', cx, 120, 64, C.GOLD, 'center');
    this.button(cx - 170, 180, 340, 84, 'Continuar (Esc)', 'RESUME', 0, C.GREEN, true, 34);
    this.button(cx - 170, 285, 340, 70, 'Desistir', 'QUIT', 0, C.RED, true, 30);
    this.drawWeaponRow(40, 420, cx * 2 - 80, false);
    this.drawItemsGrid(40, 570, cx * 2 - 80, 130);
    this.drawStatsPanel(vw - statsW - 16, 16, statsW, VH - 32);
  }

  // --- Level up ---

  drawLevelUp() {
    const g = this.game, p = g.player;
    const statsW = this.vw < 1200 ? 250 : 300;
    const areaW = this.vw - statsW - 48;
    this.text('SUBIU DE NÍVEL!', 24 + areaW / 2, 70, 52, '#7CFF6B', 'center');
    let sub = 'Nível ' + (p.level - g.levelsPending + 1) + ' • escolha uma melhoria (1-4)';
    if (g.levelsPending > 1) sub += ' (+' + (g.levelsPending - 1) + ' depois)';
    this.text(sub, 24 + areaW / 2, 112, 24, '#E8F5D0', 'center');
    const gap = 16, cw = (areaW - gap * 3) / 4, ch = 330;
    for (let i = 0; i < 4; i++) {
      const [stat, amount, tier] = g.levelChoices[i];
      const x = 24 + i * (cw + gap), y = 150;
      this.card(x, y, cw, ch, tier, this.isHover(x, y, cw, ch));
      this.register(x, y, cw, ch, 'LEVEL', i, true);
      this.keyBadge(String(i + 1), x + 10, y + 10);
      this.emoji(Stat.ICONS[stat], x + cw / 2, y + 90, 90);
      this.text((amount >= 0 ? '+' : '') + amount + (Stat.PERCENT[stat] ? '%' : ''), x + cw / 2, y + 200, 50, TIER_COLOR[tier], 'center');
      this.wrapped(Stat.NAMES[stat], x + cw / 2, y + 250, cw - 20, 26, '#FFFFFF', 'center');
      this.text('Atual: ' + p.stats[stat], x + cw / 2, y + ch - 20, 20, '#B0B0B0', 'center');
    }
    const cost = g.levelRerollCost();
    this.seedCounter(24, VH - 70, p.materials);
    this.buttonSeed(24 + areaW / 2 - 150, VH - 110, 300, 76, cost, 'LEVEL_REROLL', 0, C.ORANGE, p.materials >= cost, 'Rolar (R) ');
    this.drawStatsPanel(this.vw - statsW - 16, 16, statsW, VH - 32);
  }

  // --- Loja ---

  drawShop() {
    const g = this.game, p = g.player, vw = this.vw;
    const narrow = vw < 1200;
    const statsW = narrow ? 250 : 300;
    const areaW = vw - statsW - 48;
    this.text('LOJA', 24, 58, 46, C.GOLD, 'left');
    let sub = 'Onda ' + g.wave + ' concluída!';
    if (g.lastHarvest > 0 && !narrow) sub += '  Colheita: +' + g.lastHarvest;
    this.text(sub, 150, 56, 24, '#E8F5D0', 'left');
    this.seedCounter(24 + areaW - 140, 30, p.materials);

    const gap = 14, cw = (areaW - gap * 3) / 4, ch = 330, y = 78;
    for (let i = 0; i < SHOP_SLOTS; i++) {
      const x = 24 + i * (cw + gap);
      const o = g.offers[i];
      if (!o) {
        this.roundRect(x, y, cw, ch, 16, 'rgba(0,0,0,0.2)');
        this.text('Vendido!', x + cw / 2, y + ch / 2, 26, 'rgba(255,255,255,0.53)', 'center');
        continue;
      }
      const tier = o.weapon ? o.tier : o.item.tier;
      this.card(x, y, cw, ch, tier, false);
      this.emoji(offerIcon(o), x + 46, y + 48, 62);
      if (!narrow) {
        this.text(o.weapon ? 'ARMA' : 'ITEM', x + 86, y + 42, 18, '#B0B0B0', 'left');
        if (o.weapon) this.text(TYPE_NAMES[o.weapon.type], x + 86, y + 64, 16, '#B0B0B0', 'left');
      }
      let ly = this.wrapped(offerName(o), x + 14, y + 112, cw - 28, 23, TIER_COLOR[tier], 'left') + 6;
      if (o.weapon) {
        this.weaponStats(new Weapon(o.weapon, o.tier), x + 14, ly, cw - 28, !narrow);
      } else {
        for (let m = 0; m < o.item.mods.length; m += 2) {
          const v = o.item.mods[m + 1];
          this.text(Stat.format(o.item.mods[m], v), x + 14, ly, narrow ? 16 : 19, v >= 0 ? '#8CF08C' : '#FF8080', 'left');
          ly += 24;
        }
      }
      // cadeado
      const lx = x + cw - 50, lyy = y + 8;
      this.roundRect(lx, lyy, 42, 42, 10, o.locked ? '#B88A2A' : 'rgba(0,0,0,0.27)');
      this.emoji(o.locked ? '🔒' : '🔓', lx + 21, lyy + 21, 28);
      this.register(lx - 6, lyy - 6, 54, 54, 'LOCK', i, true);

      const check = g.checkBuy(i);
      this.buttonSeed(x + 12, y + ch - 64, cw - 24, 52, o.price, 'BUY', i, check === BUY_OK ? C.GREEN : C.GRAY, check === BUY_OK, '');
      this.keyBadge(String(i + 1), x + 6, y + ch - 70);
    }

    this.drawWeaponRow(24, 440, areaW, true);
    this.drawItemsGrid(24, 565, areaW, VH - 565 - 10);

    const sx = vw - statsW - 16;
    this.drawStatsPanel(sx, 16, statsW, VH - 32 - 170);
    const cost = g.shopRerollCost();
    this.buttonSeed(sx, VH - 172, statsW, 66, cost, 'REROLL', 0, C.ORANGE, p.materials >= cost, 'Rolar (R) ');
    this.button(sx, VH - 96, statsW, 80, 'Próxima onda ▶', 'NEXT', 0, C.GREEN, true, 30);

    if (this.popupWeapon >= 0 && this.popupWeapon < p.weapons.length) this.drawWeaponPopup();
  }

  weaponStats(w, x, y, maxW, full) {
    const p = this.game.player;
    let dmgText = 'Dano: ' + Math.round(w.baseDamage(p));
    if (w.def.pellets > 1) dmgText += ' x' + w.def.pellets;
    if (w.burnDamage(p) > 0) dmgText += ' +' + w.burnDamage(p) + ' fogo';
    this.text(dmgText, x, y, full ? 19 : 16, '#FFFFFF', 'left');
    y += 24;
    const line = 'Recarga ' + w.cooldown(p).toFixed(2) + 's • Alc. ' + Math.round(w.range(p));
    if (!full || this.measure(line, 17) > maxW) {
      this.text('Recarga ' + w.cooldown(p).toFixed(2) + 's', x, y, 16, '#E0E0E0', 'left');
      y += 22;
      this.text('Alcance ' + Math.round(w.range(p)), x, y, 16, '#E0E0E0', 'left');
      y += 22;
      return full ? this.wrapped(w.def.desc, x, y, maxW, 18, '#FFE08A', 'left') : y;
    }
    this.text(line, x, y, 17, '#E0E0E0', 'left');
    y += 24;
    return this.wrapped(w.def.desc, x, y, maxW, 18, '#FFE08A', 'left');
  }

  drawWeaponRow(x, y, w, clickable) {
    const g = this.game, p = g.player;
    this.text('Armas (' + p.weapons.length + '/' + MAX_WEAPONS + ')', x, y - 10, 22, '#FFFFFF', 'left');
    const s = Math.min(92, (w - 50) / 6);
    for (let i = 0; i < MAX_WEAPONS; i++) {
      const sx = x + i * (s + 10);
      if (i < p.weapons.length) {
        const wp = p.weapons[i];
        this.card(sx, y, s, s, wp.tier, clickable && this.isHover(sx, y, s, s));
        this.emoji(wp.def.icon, sx + s / 2, y + s / 2 - 6, s * 0.55);
        this.text(TIER_NAMES[wp.tier], sx + s / 2, y + s - 8, 18, TIER_COLOR[wp.tier], 'center');
        if (clickable) {
          this.register(sx, y, s, s, 'WEAPON', i, true);
          if (g.canCombine(i)) {
            this.circle(sx + s - 8, y + 8, 9, C.GOLD);
            this.text('+', sx + s - 8, y + 15, 20, '#000000', 'center');
          }
        }
      } else {
        this.roundRect(sx, y, s, s, 12, 'rgba(0,0,0,0.2)');
      }
    }
    if (clickable && w > 1000) {
      this.text('(clique numa arma para vender ou combinar)', x + 190, y - 10, 17, 'rgba(255,255,255,0.6)', 'left');
    }
  }

  drawItemsGrid(x, y, w, h) {
    const p = this.game.player;
    this.text('Itens (' + p.items.length + ')', x, y - 10, 22, '#FFFFFF', 'left');
    const counts = new Map();
    for (const it of p.items) counts.set(it, (counts.get(it) || 0) + 1);
    const s = 50;
    const perRow = Math.max(1, Math.floor((w + 6) / (s + 6)));
    const rows = Math.max(1, Math.floor((h + 6) / (s + 6)));
    let i = 0;
    for (const [it, n] of counts) {
      if (i >= perRow * rows) break;
      const ix = x + (i % perRow) * (s + 6), iy = y + Math.floor(i / perRow) * (s + 6);
      this.card(ix, iy, s, s, it.tier, false);
      this.emoji(it.icon, ix + s / 2, iy + s / 2, s * 0.7);
      if (n > 1) this.text('x' + n, ix + s - 3, iy + s - 3, 16, '#FFFFFF', 'right');
      if (this.isHover(ix, iy, s, s)) this.tooltip(it, ix, iy + s + 6);
      i++;
    }
  }

  tooltip(it, x, y) {
    const lines = [it.name];
    for (let m = 0; m < it.mods.length; m += 2) lines.push(Stat.format(it.mods[m], it.mods[m + 1]));
    const w = Math.max(...lines.map((l) => this.measure(l, 18))) + 24;
    const h = lines.length * 24 + 14;
    if (y + h > VH) y -= h + 62;
    this.deferred = () => {
      this.roundRect(x, y, w, h, 10, 'rgba(15,15,15,0.95)', TIER_COLOR[it.tier], 2);
      lines.forEach((l, i) => this.text(l, x + 12, y + 28 + i * 24, 18, i === 0 ? TIER_COLOR[it.tier] : '#E8E8E8', 'left'));
    };
  }

  drawWeaponPopup() {
    const g = this.game, p = g.player;
    const w = p.weapons[this.popupWeapon];
    this.backdrop('CLOSE');
    const pw = 520, ph = 400, x = this.vw / 2 - pw / 2, y = VH / 2 - ph / 2;
    this.panel(x, y, pw, ph);
    this.emoji(w.def.icon, x + 70, y + 70, 80);
    this.text(w.title(), x + 130, y + 66, 34, TIER_COLOR[w.tier], 'left');
    this.text(TYPE_NAMES[w.def.type], x + 130, y + 98, 20, '#B0B0B0', 'left');
    this.weaponStats(w, x + 30, y + 160, pw - 60, true);
    const bw = (pw - 80) / 2;
    this.buttonSeed(x + 30, y + ph - 150, bw, 64, w.sellPrice(g.wave + 1), 'SELL', 0, C.RED, g.canSell(this.popupWeapon), 'Vender +');
    this.button(x + 50 + bw, y + ph - 150, bw, 64, w.tier >= 3 ? 'Nível máx.' : 'Combinar', 'COMBINE', 0, C.ORANGE, g.canCombine(this.popupWeapon), 26);
    this.button(x + pw / 2 - 100, y + ph - 76, 200, 56, 'Fechar', 'CLOSE', 0, C.GRAY, true, 24);
  }

  drawStatsPanel(x, y, w, h) {
    const p = this.game.player;
    this.panel(x, y, w, h);
    this.text(p.character.name, x + w / 2, y + 36, 24, C.GOLD, 'center');
    const rowH = Math.min(34, (h - 56) / Stat.COUNT);
    const size = Math.min(21, rowH * 0.66, w / 14);
    for (let i = 0; i < Stat.COUNT; i++) {
      const ry = y + 56 + i * rowH + rowH * 0.7;
      const v = p.stats[i];
      const val = (i === Stat.HP ? p.maxHp() : v) + (Stat.PERCENT[i] ? '%' : '');
      const color = i === Stat.HP ? '#FFFFFF' : v > 0 ? '#8CF08C' : v < 0 ? '#FF8080' : '#DDDDDD';
      this.emoji(Stat.ICONS[i], x + 26, ry - size * 0.35, size * 1.1);
      this.text(Stat.NAMES[i], x + 46, ry, size, '#E0E0E0', 'left');
      this.text(String(val), x + w - 16, ry, size, color, 'right');
    }
  }

  // --- Fim de jogo ---

  drawEnd() {
    const g = this.game, p = g.player, won = g.state === 'VICTORY', cx = this.vw / 2;
    this.drawMenuBackground();
    if (won) {
      this.text('A HORTA ESTÁ SALVA!', cx, 120, 72, C.GOLD, 'center');
      this.text('Você sobreviveu às 20 ondas. Parabéns!', cx, 170, 28, '#E8F5D0', 'center');
    } else {
      this.text('VIROU SALADA!', cx, 120, 76, '#FF6A5A', 'center');
      this.text('Os insetos venceram desta vez...', cx, 170, 28, '#E8F5D0', 'center');
    }
    if (p) {
      const by = 215;
      this.emoji(p.character.icon, cx, by + 60, 110);
      this.drawEyes(cx, by + 56, 1.4, 0, won ? -1 : 1);
      ['Onda alcançada: ' + g.wave, 'Nível: ' + p.level, 'Insetos derrotados: ' + g.kills, 'Melhor onda: ' + this.prefs.data.bestWave]
        .forEach((l, i) => this.text(l, cx, by + 170 + i * 40, 30, '#FFFFFF', 'center'));
    }
    this.button(cx - 360, VH - 120, 340, 84, 'Jogar de novo', 'AGAIN', 0, C.GREEN, true, 34);
    this.button(cx + 20, VH - 120, 340, 84, 'Menu', 'MENU', 0, C.GRAY, true, 34);
  }

  // ------------------------------------------------------------------
  // Ajudantes de desenho
  // ------------------------------------------------------------------

  isHover(x, y, w, h) {
    return this.mouseX >= x && this.mouseX <= x + w && this.mouseY >= y && this.mouseY <= y + h;
  }

  register(x, y, w, h, action, arg, enabled) {
    this.buttons.push({ x, y, w, h, action, arg, enabled });
    if (enabled && action !== 'NONE' && arg !== -99 && this.isHover(x, y, w, h)) this.hovering = true;
  }

  backdrop(action) {
    this.ctx.fillStyle = 'rgba(0,0,0,0.67)';
    this.ctx.fillRect(0, 0, this.vw, VH);
    this.buttons.push({ x: 0, y: 0, w: this.vw, h: VH, action, arg: -99, enabled: true });
  }

  button(x, y, w, h, label, action, arg, color, enabled, size) {
    this.drawButtonBase(x, y, w, h, enabled ? color : C.GRAY, enabled && this.isHover(x, y, w, h));
    while (size > 12 && this.measure(label, size) > w - 20) size -= 1;
    this.text(label, x + w / 2, y + h / 2 + size * 0.36, size, enabled ? '#FFFFFF' : '#AAAAAA', 'center');
    this.register(x, y, w, h, action, arg, enabled);
  }

  /** Botão com "prefixo + ícone de semente + número". */
  buttonSeed(x, y, w, h, amount, action, arg, color, enabled, prefix) {
    this.drawButtonBase(x, y, w, h, enabled ? color : C.GRAY, enabled && this.isHover(x, y, w, h));
    let size = Math.min(30, h * 0.5);
    const num = String(amount);
    const width = (s) => this.measure(prefix, s) + this.measure(num, s) + s + 6;
    while (width(size) > w - 24 && size > 12) size -= 1;
    let tx = x + w / 2 - width(size) / 2;
    const ty = y + h / 2 + size * 0.36;
    const tc = enabled ? '#FFFFFF' : '#AAAAAA';
    if (prefix) { this.text(prefix, tx, ty, size, tc, 'left'); tx += this.measure(prefix, size); }
    this.seedIcon(tx + size * 0.45, y + h / 2, size * 0.36);
    this.text(num, tx + size + 4, ty, size, tc, 'left');
    this.register(x, y, w, h, action, arg, enabled);
  }

  drawButtonBase(x, y, w, h, color, hover) {
    const ctx = this.ctx;
    this.roundRect(x, y + 5, w, h - 5, 16, '#00000066');
    ctx.save();
    ctx.filter = 'brightness(0.6)';
    this.roundRect(x, y + 5, w, h - 5, 16, color);
    ctx.restore();
    const lift = hover ? -2 : 0;
    this.roundRect(x, y + lift, w, h - 5, 16, color);
    if (hover) this.roundRect(x, y + lift, w, h - 5, 16, 'rgba(255,255,255,0.15)');
    this.roundRect(x, y, w, h, 16, null, 'rgba(0,0,0,0.33)', 2);
  }

  keyBadge(k, x, y) {
    this.roundRect(x, y, 26, 26, 6, 'rgba(0,0,0,0.55)', 'rgba(255,255,255,0.4)', 1.5);
    this.text(k, x + 13, y + 19, 16, '#FFFFFF', 'center');
  }

  seedCounter(x, y, amount) {
    this.roundRect(x, y, 140, 46, 23, 'rgba(0,0,0,0.4)');
    this.seedIcon(x + 26, y + 23, 11);
    this.text(String(amount), x + 46, y + 34, 28, '#FFFFFF', 'left');
  }

  seedIcon(x, y, r) {
    this.circle(x, y, r + 2.5, '#2E5A1A');
    this.circle(x, y, r, C.SEED);
    this.circle(x - r * 0.3, y - r * 0.3, r * 0.4, '#D6FFB0');
  }

  panel(x, y, w, h) { this.roundRect(x, y, w, h, 18, C.PANEL, C.PANEL_BORDER, 3); }

  card(x, y, w, h, tier, hover) {
    this.roundRect(x, y, w, h, 14, TIER_BG[tier], TIER_COLOR[tier], hover ? 5 : 3);
    if (hover) this.roundRect(x, y, w, h, 14, 'rgba(255,255,255,0.08)');
  }

  bar(x, y, w, h, frac, color, bg) {
    frac = clamp(frac, 0, 1);
    this.roundRect(x - 3, y - 3, w + 6, h + 6, 10, '#000000');
    this.roundRect(x, y, w, h, 8, bg);
    if (frac > 0) this.roundRect(x, y, Math.max(w * frac, 1), h, Math.min(8, w * frac / 2), color);
  }

  roundRect(x, y, w, h, r, fill, stroke, lw) {
    const ctx = this.ctx;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
    else ctx.rect(x, y, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }

  circle(x, y, r, fill) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  emoji(icon, x, y, size, tint) {
    const img = this.sprites.get(icon, size * this.scale, tint);
    this.ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  }

  text(s, x, y, size, color, align) {
    const ctx = this.ctx;
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.strokeStyle = '#000000';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  measure(s, size) {
    this.ctx.font = `bold ${size}px ${FONT}`;
    return this.ctx.measureText(s).width;
  }

  /** Texto com quebra de linha; devolve o y da próxima linha. */
  wrapped(s, x, y, maxW, size, color, align) {
    let line = '', ly = y;
    for (const word of s.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (this.measure(test, size) > maxW && line) {
        this.text(line, x, ly, size, color, align);
        ly += size * 1.2;
        line = word;
      } else line = test;
    }
    if (line) this.text(line, x, ly, size, color, align);
    return ly + size * 1.2;
  }
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  } else if (document.exitFullscreen) document.exitFullscreen();
}
