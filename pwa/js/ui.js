// Desenho de todas as telas + botões ("UI imediata"), igual à versão Android.
// Coordenadas virtuais: a tela sempre tem 720 de altura.
'use strict';

const VH = 720;
const TIER_COLOR = ['#D7D7D7', '#4AA3FF', '#B76BFF', '#FF5A4A'];
const TIER_BG = ['#3A3A3A', '#1C3552', '#3A2358', '#55221C'];
const C = {
  BG: '#1B2414', PANEL: 'rgba(42,33,22,0.92)', PANEL_BORDER: '#7A5A30', GREEN: '#4CAF50',
  ORANGE: '#F08A24', GRAY: '#5A5A5A', RED: '#D9443A', SEED: '#8EE05A', GOLD: '#FFD84A', BLUE: '#2E7D9A',
};
const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

/** Guarda configurações, recordes e a partida salva no navegador. */
class Prefs {
  constructor() {
    this.data = {
      sound: true, music: true, bestWave: 0, wins: 0, totalKills: 0, bestDiffWon: -1, lastChar: 0, lastDiff: 1, savedRun: null,
      gamesPlayed: 0, totalSeeds: 0, ach: {}, bestEndless: 0,
    };
    try { Object.assign(this.data, JSON.parse(localStorage.getItem('horta_hostil') || '{}')); } catch (e) { /* sem armazenamento */ }
    if (!this.data.ach || typeof this.data.ach !== 'object') this.data.ach = {};
    this.onProgress = null; // a conta online é avisada quando o progresso muda
  }
  save() { try { localStorage.setItem('horta_hostil', JSON.stringify(this.data)); } catch (e) { /* ignora */ } }
  /** info = game.runInfo(won) */
  recordRun(info) {
    const d = this.data;
    if (info.wave > d.bestWave) d.bestWave = info.wave;
    if (info.diff === DIFF_ENDLESS && info.wave > d.bestEndless) d.bestEndless = info.wave;
    if (info.won) { d.wins++; if (info.diff > d.bestDiffWon) d.bestDiffWon = info.diff; }
    d.totalKills += info.kills || 0;
    d.totalSeeds += info.seeds || 0;
    d.gamesPlayed++;
    if (info.vamp) d.ach.vamp = true;
    if (info.alien) d.ach.alien = true;
    d.savedRun = null;
    this.save();
    if (this.onProgress) this.onProgress();
  }
  saveRun(str) { if (str && str !== this.data.savedRun) { this.data.savedRun = str; this.save(); if (this.onProgress) this.onProgress(); } }
  clearRun() { if (this.data.savedRun) { this.data.savedRun = null; this.save(); if (this.onProgress) this.onProgress(); } }
}

const RANDOM_CHAR = -1;
const WEBSITE_URL = 'https://mello13256.github.io/Projeto-apk-random/';
/** Abre um link fora do jogo (no app Android, abre o navegador). */
function openExternal(url) {
  if (typeof window !== 'undefined' && window.HortaAndroid && window.HortaAndroid.openUrl) window.HortaAndroid.openUrl(url);
  else window.open(url, '_blank');
}
const DIFF_COLORS = ['#8CF08C', '#FFFFFF', '#FFA040', '#FF5A5A', '#FF3D00', '#C77DFF'];
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const IS_APP = typeof window !== 'undefined' && !!window.HortaAndroid; // rodando dentro do APK
const IS_STANDALONE = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

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
    this.touch = false;      // true = celular/tablet (toque); false = teclado e mouse
    this.rotated = false;    // tela em pé: o jogo é desenhado deitado (girado 90°)
    this.matrix = [1, 0, 0, 1, 0, 0];
    this.canvasW = 1280; this.canvasH = 720; this.offY = 0;
    this.tipItem = null; this.tipTime = 0;
    this.selectedChar = prefs.data.lastChar;
    this.difficulty = prefs.data.lastDiff;
    this.newUnlocks = '';
    this.lastState = null;
    // Ranking online
    this.rank = { diff: this.difficulty, loading: false, error: '', entries: null, myId: null };
    this.submitState = ''; // '', 'sending' ou 'sent'
    this.mp = null;        // multiplayer (criado no main.js)
    this.mpMenu = false;   // menu aberto durante uma partida multiplayer (o jogo não pausa)
    this.cam = { x: 0, y: 0 };
  }

  /** Pausa (solo) ou menu aberto (multiplayer): o joystick não funciona. */
  menuOpen() { return this.game.paused || this.mpMenu; }

  /** Pede o nome do multiplayer (se ainda não tiver) e depois chama next(nome). */
  withMpName(force, next) {
    const d = this.prefs.data;
    if (!force && d.playerName && Ranking.validName(d.playerName)) { next(d.playerName); return; }
    askText({
      title: '👥 Seu nome no multiplayer', label: 'Como os amigos vão te ver (2 a 16 letras):', submit: 'OK',
      initial: d.playerName || '', maxLength: 16,
      clean: (v) => v.replace(/\s+/g, ' ').trim(),
      check: (v) => (Ranking.validName(v) ? '' : 'Use de 2 a 16 letras ou números (sem < > & { } " \\).'),
    }, (name) => { d.playerName = name; this.prefs.save(); next(name); });
  }

  /** Personagem para o multiplayer: o último escolhido, se estiver liberado. */
  mpChar() {
    const c = this.selectedChar;
    return c >= 0 && this.unlockedChars()[c] ? c : 0;
  }

  mpCreate() {
    if (this.mp.busy) return;
    this.withMpName(false, (name) => {
      this.mp.create(name, this.mpChar(), this.difficulty).catch((e) => this.showToast(e.message, 6));
    });
  }

  /** Entrar numa sala: pergunta o código (se não veio no link) e o nome. */
  mpJoin(code) {
    if (this.mp.busy) return;
    const go = (c) => this.withMpName(false, (name) => {
      this.game.state = 'MP_MENU';
      this.mp.join(c, name, this.mpChar()).catch((e) => this.showToast(e.message, 6));
    });
    if (code) { go(code); return; }
    askText({
      title: '🔑 Entrar numa sala', label: 'Código da sala (4 letras ou números):', submit: 'Entrar',
      initial: '', maxLength: 4, upper: true,
      clean: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      check: (v) => (validCode(v) ? '' : 'O código tem 4 letras ou números (ex.: K7QX).'),
    }, go);
  }

  /** Compartilha o link da sala (celular) ou copia (computador). */
  invite() {
    const url = this.mp.inviteLink();
    const text = 'Bora jogar Horta Hostil comigo! Sala ' + this.mp.code;
    if (navigator.share && this.touch) {
      navigator.share({ title: 'Horta Hostil', text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => this.showToast('Link copiado! Mande pros amigos.'), () => this.showToast('Código da sala: ' + this.mp.code));
    } else {
      this.showToast('Código da sala: ' + this.mp.code);
    }
  }

  loadRanking(diff) {
    const r = this.rank;
    r.diff = diff;
    r.loading = true;
    r.error = '';
    r.entries = null;
    const token = (r.token = (r.token || 0) + 1);
    Ranking.top(diff).then((list) => {
      if (token !== r.token) return;
      r.entries = list;
      r.loading = false;
    }).catch(() => {
      if (token !== r.token) return;
      r.loading = false;
      r.error = navigator.onLine === false ? 'Sem internet. Conecte e toque em Atualizar.' : 'Não deu pra falar com o ranking. Tente Atualizar.';
    });
  }

  /** Pergunta o nome e envia a partida que acabou de terminar. */
  submitScore() {
    const g = this.game, p = g.player;
    if (!p || this.submitState) return;
    askName(this.prefs.data.playerName || '', (name) => {
      this.prefs.data.playerName = name;
      this.prefs.save();
      this.submitState = 'sending';
      const diff = g.difficulty;
      Ranking.submit(diff, {
        name, character: CHARS.indexOf(p.character), wave: g.wave, won: g.state === 'VICTORY',
        kills: g.kills, level: p.level, platform: IS_APP ? 'android' : 'web',
      }).then((id) => {
        this.submitState = 'sent';
        this.rank.myId = id;
        return Ranking.top(diff).then((list) => {
          const pos = list.findIndex((e) => e.id === id);
          this.showToast(pos >= 0 ? 'Enviado! Você está em ' + (pos + 1) + 'º lugar no ' + DIFF_NAMES[diff] + '!' : 'Enviado pro ranking!');
        }, () => this.showToast('Enviado pro ranking!'));
      }).catch(() => {
        this.submitState = '';
        this.showToast(navigator.onLine === false ? 'Sem internet: não deu pra enviar.' : 'Não deu pra enviar. Tente de novo.');
      });
    });
  }

  unlockedChars() { return CHARS.map((c) => isUnlocked(c, this.prefs.data)); }

  /** Chamado pelo jogo no fim da partida (vitória, derrota ou desistência). */
  runEnded(won, wave) {
    const g = this.game;
    const before = this.unlockedChars();
    this.prefs.recordRun(g.runInfo(won));
    void wave;
    const after = this.unlockedChars();
    this.newUnlocks = CHARS.filter((c, i) => !before[i] && after[i]).map((c) => c.name).join(', ');
  }

  saveIfPossible() { if (this.game.state === 'SHOP') this.prefs.saveRun(this.game.saveToString()); }

  /**
   * Ajusta o jogo ao tamanho do canvas (em pixels). Se rotate = true (celular em pé),
   * o jogo é desenhado girado 90° para continuar na horizontal.
   * A área do jogo nunca fica mais estreita que 4:3; o que sobra vira faixa.
   */
  setSize(w, h, rotate) {
    this.canvasW = w; this.canvasH = h;
    this.rotated = !!rotate;
    const lw = rotate ? h : w, lh = rotate ? w : h; // tamanho "deitado"
    this.scale = Math.min(lh / VH, lw / 960);
    this.vw = lw / this.scale;
    this.offY = (lh - VH * this.scale) / 2;
    const s = this.scale;
    this.matrix = rotate ? [0, s, -s, 0, w - this.offY, 0] : [s, 0, 0, s, 0, this.offY];
  }

  /** Pixels do canvas -> coordenadas virtuais do jogo. */
  toVirtual(px, py) {
    if (this.rotated) return [py / this.scale, (this.canvasW - this.offY - px) / this.scale];
    return [px / this.scale, (py - this.offY) / this.scale];
  }

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

  /** O jogador deste computador usa mira manual (Cyborg Cebola)? */
  manualAim() { const p = this.game.player; return !!p && p.kind === 'laser' && this.game.state === 'PLAYING'; }

  onDown(id, x, y) {
    const b = this.hit(x, y);
    this.down.set(id, b ? { action: b.action, arg: b.arg } : null);
    const g = this.game;
    if (b || g.state !== 'PLAYING' || this.menuOpen()) return;
    if (this.manualAim()) {
      // Cyborg: mouse = mira e tiro; no toque, o lado direito da tela é o "analógico" da mira
      if (id === 'mouse') { this.mouseHeld = true; return; }
      if (x > this.vw / 2 && !this.aimJoy) { this.aimJoy = { id, ox: x, oy: y, x, y }; return; }
    }
    if (!this.joy) this.joy = { id, ox: x, oy: y, x, y };
  }

  /** Mira manual: {aimAng, fire}. Chamado a cada passo do jogo. */
  aimInput() {
    const p = this.game.player;
    if (!this.manualAim() || this.menuOpen() || !p.alive) return { aimAng: p ? p.aimAng : 0, fire: false };
    const aj = this.aimJoy;
    if (aj) {
      const dx = aj.x - aj.ox, dy = aj.y - aj.oy;
      if (Math.hypot(dx, dy) > 12) this.aimAng = Math.atan2(dy, dx);
      return { aimAng: this.aimAng || 0, fire: true };
    }
    if (!this.touch && this.mouseX >= 0) {
      this.aimAng = Math.atan2(this.mouseY + this.cam.y - p.y, this.mouseX + this.cam.x - p.x);
    }
    return { aimAng: this.aimAng || 0, fire: !!this.mouseHeld || this.keys.has('Space') };
  }

  onMove(id, x, y) {
    if (id === 'mouse') { this.mouseX = x; this.mouseY = y; }
    const aj = this.aimJoy;
    if (aj && aj.id === id) {
      aj.x = x; aj.y = y;
      const dx = aj.x - aj.ox, dy = aj.y - aj.oy, d = Math.hypot(dx, dy), max = 90;
      if (d > max) { const k = (d - max) / d; aj.ox += dx * k; aj.oy += dy * k; }
    }
    const j = this.joy;
    if (j && j.id === id) {
      j.x = x; j.y = y;
      const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy), max = 75 * 1.6;
      if (d > max) { const k = (d - max) / d; j.ox += dx * k; j.oy += dy * k; }
    }
  }

  onUp(id, x, y) {
    if (id === 'mouse') this.mouseHeld = false;
    if (this.aimJoy && this.aimJoy.id === id) { this.aimJoy = null; return; }
    if (this.joy && this.joy.id === id) { this.joy = null; return; }
    const d = this.down.get(id);
    this.down.delete(id);
    const b = this.hit(x, y);
    if (!b || !d || b.action !== d.action || b.arg !== d.arg) return;
    if (b.enabled) this.doAction(b.action, b.arg);
    else this.disabledTap(b.action, b.arg);
  }

  releaseAll() { this.joy = null; this.aimJoy = null; this.mouseHeld = false; this.down.clear(); this.keys.clear(); }

  onKey(code) {
    const g = this.game;
    if (this.showHelp && (code === 'Escape' || code === 'Enter' || code === 'Space')) { this.showHelp = false; return; }
    if (this.popupWeapon >= 0 && code === 'Escape') { this.popupWeapon = -1; return; }
    const num = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[code];
    const ok = code === 'Enter' || code === 'Space';
    const slots = CHARS.length + 1;
    const sel = this.selectedChar === RANDOM_CHAR ? CHARS.length : this.selectedChar;
    const pickSlot = (i) => { this.selectedChar = i === CHARS.length ? RANDOM_CHAR : i; };
    switch (g.state) {
      case 'MENU':
        if (ok) this.doAction(this.prefs.data.savedRun ? 'CONTINUE' : 'PLAY');
        else if (code === 'KeyN') this.doAction('PLAY');
        else if (code === 'KeyH') this.doAction('HELP');
        else if (code === 'KeyM') this.doAction('MUSIC');
        else if (code === 'KeyR') this.doAction('RANKING');
        else if (code === 'KeyO') this.doAction('MP');
        break;
      case 'ACCOUNT':
      case 'POLLS':
        if (code === 'Escape' || code === 'Backspace') this.doAction('MENU');
        break;
      case 'MP_MENU':
        if (code === 'Escape' || code === 'Backspace') this.doAction('MENU');
        else if (code === 'KeyC') this.doAction('MP_CREATE');
        else if (ok || code === 'KeyE') this.doAction('MP_JOIN');
        break;
      case 'LOBBY':
        if (code === 'Escape') this.doAction('LOBBY_LEAVE');
        else if (code === 'ArrowLeft' || code === 'KeyA') this.doAction('LOBBY_STEP', -1);
        else if (code === 'ArrowRight' || code === 'KeyD') this.doAction('LOBBY_STEP', 1);
        else if (code === 'KeyQ') this.doAction('LOBBY_DIFF', -1);
        else if (code === 'KeyE') this.doAction('LOBBY_DIFF', 1);
        else if (ok) this.doAction(this.mp.isHost() ? 'LOBBY_START' : 'LOBBY_READY');
        break;
      case 'RANKING':
        if (code === 'Escape' || code === 'Backspace') this.doAction('MENU');
        else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ') this.doAction('RANK_DIFF', -1);
        else if (code === 'ArrowRight' || code === 'KeyD' || code === 'KeyE') this.doAction('RANK_DIFF', 1);
        else if (code === 'KeyR') this.doAction('RANK_REFRESH');
        break;
      case 'CHAR_SELECT':
        if (code === 'ArrowLeft' || code === 'KeyA') pickSlot((sel + slots - 1) % slots);
        else if (code === 'ArrowRight' || code === 'KeyD') pickSlot((sel + 1) % slots);
        else if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowDown' || code === 'KeyS') pickSlot((sel + 8) % slots);
        else if (code === 'KeyQ') this.doAction('DIFF', -1);
        else if (code === 'KeyE') this.doAction('DIFF', 1);
        else if (ok) this.doAction('START');
        else if (code === 'Escape') this.doAction('MENU');
        break;
      case 'PLAYING':
        if (code === 'Escape' || code === 'KeyP') this.doAction(this.menuOpen() ? 'RESUME' : 'PAUSE');
        else if (this.menuOpen() && code === 'KeyQ') this.doAction('QUIT');
        break;
      case 'LEVEL_UP':
        if (num !== undefined) this.doAction('LEVEL', num);
        else if (code === 'KeyR') this.doAction('LEVEL_REROLL');
        break;
      case 'CRATE':
        if (ok || num === 0) this.doAction('CRATE_TAKE');
        else if (code === 'KeyR' || num === 1) this.doAction('CRATE_RECYCLE');
        break;
      case 'SHOP':
        if (g.coop && this.mp.ready) { if (ok || code === 'Escape') this.doAction('UNREADY'); }
        else if (num !== undefined) this.doAction('BUY', num);
        else if (code === 'KeyR') this.doAction('REROLL');
        else if (ok) this.doAction('NEXT');
        break;
      case 'DUEL_END':
        if (ok) this.doAction('MP_BACK_LOBBY');
        else if (code === 'Escape') this.doAction('QUIT');
        break;
      case 'GAME_OVER':
      case 'VICTORY':
        if (g.coop) {
          if (ok) this.doAction('MP_BACK_LOBBY');
          else if (code === 'Escape') this.doAction('QUIT');
        } else if (ok) this.doAction('AGAIN');
        else if (code === 'Escape') this.doAction('MENU');
        else if (code === 'KeyE') this.doAction('SUBMIT');
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
      case 'PLAY':
        this.newUnlocks = '';
        g.state = 'CHAR_SELECT';
        if (this.touch) enterMobileFullscreen();
        break;
      case 'CONTINUE':
        if (g.loadFromString(this.prefs.data.savedRun)) this.showToast('Partida carregada: onda ' + g.wave + ' concluída');
        else { this.prefs.clearRun(); this.showToast('Não deu pra carregar a partida salva.'); }
        if (this.touch) enterMobileFullscreen();
        break;
      case 'APK': location.href = 'HortaHostil.apk'; break;
      case 'SITE': openExternal(WEBSITE_URL); break;
      case 'POLLS': this.openPolls(); break;
      case 'POLL_PAGE': this.polls.page += arg; break;
      case 'VOTE': this.votePoll(Math.floor(arg / 100), arg % 100); break;
      case 'ACCOUNT': this.openAccount(); break;
      case 'ACC_CREATE': this.accountCreate(); break;
      case 'ACC_LOGIN': this.accountLogin(); break;
      case 'ACC_SYNC':
        this.account.pull().then(() => this.account.push()).then(() => this.showToast('Progresso sincronizado ☁️'), () => this.showToast('Não deu pra sincronizar agora.'));
        break;
      case 'ACC_LOGOUT': this.account.logout(); this.showToast('Você saiu da conta. O progresso continua neste aparelho.', 3); break;
      case 'REPORT': this.openReport(arg === 1); break;
      case 'MP': this.newUnlocks = ''; g.state = 'MP_MENU'; if (this.touch) enterMobileFullscreen(); break;
      case 'MP_CREATE': this.mpCreate(); break;
      case 'MP_JOIN': this.mpJoin(null); break;
      case 'MP_NAME': this.withMpName(true, () => {}); break;
      case 'INVITE': this.invite(); break;
      case 'LOBBY_CHAR':
        if (this.unlockedChars()[arg]) { this.selectedChar = arg; this.prefs.data.lastChar = arg; this.prefs.save(); this.mp.setChar(arg); }
        else this.showToast('Personagem bloqueado: ' + unlockText(CHARS[arg]));
        break;
      case 'LOBBY_STEP': {
        const open = this.unlockedChars().map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
        const k = open.indexOf(this.mp.myChar);
        this.doAction('LOBBY_CHAR', open[(k + arg + open.length) % open.length]);
        break;
      }
      case 'LOBBY_READY': this.mp.setLobbyReady(!this.mp.myReady); break;
      case 'LOBBY_DIFF':
        if (this.mp.isHost()) { this.difficulty = (this.mp.diff + arg + DIFF_NAMES.length) % DIFF_NAMES.length; this.mp.setDiff(this.difficulty); }
        break;
      case 'LOBBY_START': if (!this.mp.startGame()) this.showToast(this.mp.lobbyHint()); break;
      case 'LOBBY_MODE': this.mp.setMode(this.mp.mode === 'pvp' ? 'coop' : 'pvp'); break;
      case 'LOBBY_LEAVE': this.mp.leave(); g.state = 'MP_MENU'; break;
      case 'MP_BACK_LOBBY': this.newUnlocks = ''; this.mp.backToLobby(); break;
      case 'UNREADY': this.mp.setReady(false); break;
      case 'RANKING': g.state = 'RANKING'; this.loadRanking(this.difficulty); break;
      case 'RANK_DIFF': this.loadRanking((this.rank.diff + arg + DIFF_NAMES.length) % DIFF_NAMES.length); break;
      case 'RANK_TAB': this.loadRanking(arg); break;
      case 'RANK_REFRESH': this.loadRanking(this.rank.diff); break;
      case 'SUBMIT': this.submitScore(); break;
      case 'ITEM':
        if (this.tipItem === arg && this.tipTime > 0) this.tipTime = 0;
        else { this.tipItem = arg; this.tipTime = 3; }
        break;
      case 'SOUND': this.prefs.data.sound = !this.prefs.data.sound; this.prefs.save(); this.sfx.enabled = this.prefs.data.sound; break;
      case 'MUSIC': this.prefs.data.music = !this.prefs.data.music; this.prefs.save(); this.sfx.setMusic(this.prefs.data.music); break;
      case 'FULLSCREEN': toggleFullscreen(); break;
      case 'HELP': this.showHelp = !this.showHelp; break;
      case 'CHAR': this.selectedChar = arg; break;
      case 'RANDOM': this.selectedChar = RANDOM_CHAR; break;
      case 'DIFF': this.difficulty = (this.difficulty + arg + DIFF_NAMES.length) % DIFF_NAMES.length; break;
      case 'START': {
        const unlocked = this.unlockedChars();
        let idx = this.selectedChar;
        if (idx === RANDOM_CHAR) {
          const open = unlocked.map((u, i) => (u ? i : -1)).filter((i) => i >= 0);
          idx = open[Math.floor(Math.random() * open.length)];
        } else if (!unlocked[idx]) {
          this.showToast('Personagem bloqueado: ' + unlockText(CHARS[idx]));
          break;
        }
        this.prefs.data.lastChar = this.selectedChar === RANDOM_CHAR ? 0 : this.selectedChar;
        this.prefs.data.lastDiff = this.difficulty;
        this.prefs.clearRun();
        g.newRun(CHARS[idx], this.difficulty);
        this.joy = null;
        break;
      }
      case 'AGAIN':
        this.newUnlocks = '';
        this.prefs.clearRun();
        g.newRun(p ? p.character : CHARS[0], g.difficulty);
        this.joy = null;
        break;
      case 'MENU': g.state = 'MENU'; g.paused = false; break;
      case 'PAUSE': if (g.coop) this.mpMenu = true; else g.paused = true; this.joy = null; break;
      case 'RESUME': g.paused = false; this.mpMenu = false; break;
      case 'QUIT':
        this.mpMenu = false;
        if (g.coop || this.mp.active) { this.mp.leave(); g.state = 'MENU'; break; }
        g.paused = false; g.state = 'GAME_OVER'; g.fx.runEnded(false, g.wave);
        break;
      case 'LEVEL': g.chooseLevel(arg); break;
      case 'LEVEL_REROLL': if (!g.rerollLevel()) this.showToast('Sementes insuficientes!'); break;
      case 'CRATE_TAKE': g.resolveCrate(true); break;
      case 'CRATE_RECYCLE': g.resolveCrate(false); break;
      case 'BUY': {
        const r = g.buy(arg);
        if (r === BUY_NO_MONEY) this.showToast('Sementes insuficientes!');
        else if (r === BUY_FULL) this.showToast('Armas cheias! Venda ou combine uma.');
        break;
      }
      case 'LOCK': g.toggleLock(arg); break;
      case 'REROLL': if (!g.rerollShop()) this.showToast('Sementes insuficientes!'); break;
      case 'NEXT':
        this.popupWeapon = -1; this.tipItem = null; this.joy = null;
        if (g.pvp === 'prep') { if (g.prepFinished()) this.mp.pvpReady(); else g.nextWave(); }
        else if (g.coop) this.mp.setReady(true); else g.nextWave();
        break;
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
    // Na loja, qualquer mudança já fica salva (pra continuar depois).
    if (g.state === 'SHOP' && !g.coop) this.prefs.saveRun(g.saveToString());
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

  showToast(s, secs) { this.toast = s; this.toastTime = secs || 2; }

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
    if (this.tipTime > 0) this.tipTime -= dt;
    if (this.game.state !== this.lastState) {
      if (this.game.state === 'SHOP' && !this.game.coop) this.prefs.saveRun(this.game.saveToString());
      if (this.game.state !== 'PLAYING') this.mpMenu = false;
      if (this.game.state === 'GAME_OVER' || this.game.state === 'VICTORY') this.submitState = '';
      this.lastState = this.game.state;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#121A0D';
    ctx.fillRect(0, 0, this.canvasW, this.canvasH);
    ctx.setTransform(...this.matrix);
    ctx.beginPath();
    ctx.rect(0, 0, this.vw, VH);
    ctx.clip();
    ctx.fillStyle = C.BG;
    ctx.fillRect(0, 0, this.vw, VH);
    const g = this.game;
    switch (g.state) {
      case 'MENU': this.drawMenu(); break;
      case 'CHAR_SELECT': this.drawCharSelect(); break;
      case 'PLAYING':
        this.drawWorld();
        if (this.menuOpen()) this.drawPause(); else this.drawHud();
        break;
      case 'MP_MENU': this.drawMpMenu(); break;
      case 'ACCOUNT': this.drawAccount(); break;
      case 'POLLS': this.drawPolls(); break;
      case 'LOBBY': this.drawLobby(); break;
      case 'DUEL_END': this.drawDuelEnd(); break;
      case 'LEVEL_UP': this.drawLevelUp(); break;
      case 'CRATE': this.drawCrate(); break;
      case 'RANKING': this.drawRanking(); break;
      case 'SHOP': this.drawShop(); break;
      default: this.drawEnd();
    }
    if (this.deferred) this.deferred();
    if (this.toastTime > 0 && this.toast) {
      const a = Math.min(1, this.toastTime * 3);
      const w = this.measure(this.toast, 26) + 48;
      ctx.globalAlpha = a;
      this.roundRect(this.vw / 2 - w / 2, VH - 205, w, 50, 16, 'rgba(20,20,20,0.9)', 'rgba(255,230,120,0.5)', 2);
      this.text(this.toast, this.vw / 2, VH - 171, 26, '#FFE678', 'center');
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    return this.hovering;
  }

  // --- Menu ---

  drawMenu() {
    this.drawMenuBackground();
    const cx = this.vw / 2, d = this.prefs.data;
    const n = CHARS.length, step = Math.min(78, (this.vw - 80) / n);
    CHARS.forEach((c, i) => {
      const x = cx + (i - (n - 1) / 2) * step;
      this.drawHero(c, x, 74 + Math.sin(this.time * 3 + i) * 8, Math.min(58, step * 0.85), { facingLeft: i < n / 2, lookX: 0, lookY: 0.3 });
    });
    this.text('HORTA HOSTIL', cx, 182, 84, C.GOLD, 'center');
    this.text('Os insetos invadiram a horta. Só os legumes podem salvá-la!', cx, 222, 24, '#E8F5D0', 'center');
    const big = d.savedRun
      ? [['CONTINUAR', 'CONTINUE', C.GREEN], ['NOVO JOGO', 'PLAY', C.ORANGE], ['👥 MULTIPLAYER', 'MP', C.BLUE]]
      : [['JOGAR', 'PLAY', C.GREEN], ['👥 MULTIPLAYER', 'MP', C.BLUE]];
    const bg = 20, bbw = Math.min(340, (this.vw - 80 - bg * (big.length - 1)) / big.length);
    const bbx = cx - (bbw * big.length + bg * (big.length - 1)) / 2;
    big.forEach(([label, action, color], i) => this.button(bbx + i * (bbw + bg), 245, bbw, 84, label, action, 0, color, true, 38));
    if (d.savedRun) {
      let wave = '?';
      try { wave = JSON.parse(d.savedRun).wave; } catch (e) { /* ignora */ }
      this.text('depois da onda ' + wave, bbx + bbw / 2, 348, 19, '#CFE3B8', 'center');
    }
    const fsOk = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    const showApk = IS_ANDROID && !IS_STANDALONE && !IS_APP;
    const acc = this.account && this.account.user;
    const row1 = [
      ['🏆 Ranking', 'RANKING', true, '#B8860B'],
      ['🗳️ Enquetes', 'POLLS', true, '#7B4FB0'],
      [acc ? '👤 ' + acc.name : '👤 Entrar / Conta', 'ACCOUNT', true, '#2E7D9A'],
      ['🐞 Relatar bug', 'REPORT', true, '#A0522D'],
    ];
    const row2 = [
      [d.sound ? 'Som: SIM' : 'Som: NÃO', 'SOUND', true],
      [d.music ? 'Música: SIM' : 'Música: NÃO', 'MUSIC', true],
      IS_APP ? ['Abrir o site', 'SITE', true] : showApk ? ['Baixar app Android', 'APK', true] : ['Tela cheia', 'FULLSCREEN', fsOk],
      ['Como jogar', 'HELP', true],
    ];
    const gap = 14, bw = Math.min(250, (this.vw - 60 - gap * 3) / 4), bx = cx - (bw * 4 + gap * 3) / 2;
    row1.forEach(([label, action, en, col], i) => this.button(bx + i * (bw + gap), 362, bw, 62, label, action, 0, col, en, 24));
    row2.forEach(([label, action, en], i) => this.button(bx + i * (bw + gap), 436, bw, 56, label, action, 0, action === 'APK' ? C.BLUE : C.GRAY, en, 22));
    this.text('Melhor onda: ' + d.bestWave + '   •   Vitórias: ' + d.wins + '   •   Insetos derrotados: ' + d.totalKills, cx, 540, 23, '#CFE3B8', 'center');
    const unlocked = this.unlockedChars().filter((u) => u).length;
    this.text('Personagens liberados: ' + unlocked + '/' + CHARS.length + (d.bestEndless ? '   •   Recorde no Infinito: onda ' + d.bestEndless : ''), cx, 574, 21, '#B8CFA0', 'center');
    this.text(acc ? '☁️ Progresso salvo na conta ' + acc.name + (this.account.status ? ' (' + this.account.status + ')' : '')
      : 'Crie uma conta para salvar seu progresso e jogar em outro aparelho.', cx, 608, 18, acc ? '#9FE8FF' : 'rgba(255,255,255,0.55)', 'center');
    if (!this.touch) this.text('Enter: ' + (d.savedRun ? 'continuar  •  N: novo jogo' : 'jogar') + '  •  O: multiplayer  •  R: ranking  •  M: música  •  H: ajuda  •  F: tela cheia', cx, 652, 18, 'rgba(255,255,255,0.5)', 'center');
    this.text('Projeto escolar • feito com JavaScript puro • v3.0', cx, 692, 20, 'rgba(255,255,255,0.6)', 'center');
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
      this.touch ? '• Arraste o dedo para andar. As armas atacam SOZINHAS.' : '• W A S D ou setas para andar. As armas atacam SOZINHAS.',
      '• Inimigos soltam sementes 🌱: dão experiência e dinheiro.',
      '• Elites 👑 são fortes, mas sempre deixam uma caixa 📦.',
      '• Cada caixa vira um item grátis no fim da onda.',
      this.touch ? '• Entre as ondas: escolha melhorias e compre na loja.' : '• Entre as ondas: melhorias e loja (teclas 1-4, R = rolar).',
      '• Duas armas iguais do mesmo nível viram uma mais forte.',
      this.touch ? '• Toque num item para ver o que ele faz.' : '• Passe o mouse num item para ver o que ele faz. Esc = pausa.',
      '• A partida é salva na loja: dá pra continuar depois!',
    ];
    lines.forEach((l, i) => this.text(l, x + 40, y + 120 + i * 44, 24, '#FFFFFF', 'left'));
    this.button(this.vw / 2 - 110, y + h - 74, 220, 56, 'Entendi!', 'HELP', 0, C.GREEN, true, 26);
  }

  // --- Multiplayer: menu ---

  drawMpMenu() {
    const cx = this.vw / 2, mp = this.mp, d = this.prefs.data;
    this.drawMenuBackground();
    this.text('👥 MULTIPLAYER', cx, 92, 62, C.GOLD, 'center');
    this.text('Joguem juntos na mesma horta: de 2 a 4 jogadores, cada um no seu celular ou computador.', cx, 140, 23, '#E8F5D0', 'center');
    const lines = [
      '1. Um de vocês toca em Criar sala e passa o código pros amigos.',
      '2. Os amigos tocam em Entrar numa sala e digitam o código.',
      '3. Cada um escolhe o legume, e o dono da sala começa a partida!',
    ];
    const w = Math.min(860, this.vw - 60);
    this.roundRect(cx - w / 2, 168, w, 150, 16, 'rgba(0,0,0,0.35)');
    lines.forEach((l, i) => this.textFit(l, cx, 208 + i * 40, 22, w - 30, '#FFFFFF'));
    const busy = !!mp.busy;
    const bw = Math.min(330, (this.vw - 100) / 2);
    this.button(cx - bw - 15, 345, bw, 96, 'Criar sala', 'MP_CREATE', 0, C.GREEN, !busy, 38);
    this.button(cx + 15, 345, bw, 96, 'Entrar numa sala', 'MP_JOIN', 0, C.BLUE, !busy, 34);
    if (busy) this.text(mp.busy, cx, 485, 26, C.GOLD, 'center');
    else this.text('Seu nome: ' + (d.playerName || '(ainda não escolhido)'), cx, 485, 24, '#CFE3B8', 'center');
    this.button(cx - 120, 505, 240, 54, 'Trocar nome', 'MP_NAME', 0, C.GRAY, !busy, 22);
    this.textFit('No multiplayer as sementes são do time, quem cai volta na onda seguinte e os insetos ficam mais fortes.', cx, 600, 19, this.vw - 60, '#B8CFA0');
    this.text('Precisa de internet. A partida não fica salva.', cx, 628, 19, '#B8CFA0', 'center');
    this.button(30, VH - 96, 200, 74, 'Voltar', 'MENU', 0, C.GRAY, !busy, 30);
    if (!this.touch) this.text('C: criar sala  •  Enter: entrar numa sala  •  Esc: voltar', cx, VH - 26, 16, 'rgba(255,255,255,0.45)', 'center');
  }

  // --- Multiplayer: sala de espera ---

  drawLobby() {
    const vw = this.vw, cx = vw / 2, mp = this.mp, host = mp.isHost();
    this.text('SALA', 30, 66, 34, '#E8F5D0', 'left');
    const tw = this.measure('SALA ', 34);
    this.text(mp.code, 30 + tw, 70, 54, C.GOLD, 'left');
    const hx = 30 + tw + this.measure(mp.code, 54) + 24, hw = vw - 270 - hx;
    let hs = 20;
    const hint = 'Passe o código pros amigos (até ' + MP_MAX + ' jogadores)';
    while (hs > 12 && this.measure(hint, hs) > hw) hs--;
    if (hw > 80) this.text(hint, hx, 62, hs, '#CFE3B8', 'left');
    this.button(vw - 250, 18, 220, 62, '🔗 Convidar', 'INVITE', 0, C.BLUE, true, 26);
    // jogadores
    const gap = 14, cw = (vw - 60 - gap * 3) / 4, ch = 196, y0 = 98;
    for (let i = 0; i < MP_MAX; i++) {
      const x = 30 + i * (cw + gap), r = mp.roster[i];
      if (!r) {
        this.roundRect(x, y0, cw, ch, 18, 'rgba(0,0,0,0.22)', 'rgba(255,255,255,0.15)', 2);
        this.text('vaga livre', x + cw / 2, y0 + ch / 2 + 8, 22, 'rgba(255,255,255,0.35)', 'center');
        continue;
      }
      const mine = r.id === mp.pid;
      this.roundRect(x, y0, cw, ch, 18, mine ? '#33442A' : '#2A2116', SLOT_COLORS[i], mine ? 5 : 3);
      this.drawHero(CHARS[r.char], x + cw / 2, y0 + 54, 64, { lookX: 0, lookY: 0.3, facingLeft: i % 2 === 1 });
      this.textFit(r.name + (mine ? ' (você)' : ''), x + cw / 2, y0 + 112, 22, cw - 16, '#FFFFFF');
      this.textFit(CHARS[r.char].name, x + cw / 2, y0 + 138, 17, cw - 16, '#FFE08A');
      const st = r.host ? '👑 Dono da sala' : r.ready ? '✔ Pronto' : '⏳ Escolhendo...';
      this.textFit(st, x + cw / 2, y0 + 166, 19, cw - 16, r.host ? C.GOLD : r.ready ? '#8CF08C' : '#FFC870');
      if (!r.host) this.textFit(mp.connText(r.conn), x + cw / 2, y0 + 188, 14, cw - 16, 'rgba(255,255,255,0.55)');
    }
    // escolha do legume
    const unlocked = this.unlockedChars();
    this.text('Seu legume:', 30, 334, 24, '#FFFFFF', 'left');
    const n = CHARS.length, s = Math.min(86, (vw - 60 - (n - 1) * 8) / n), rowX = cx - (s * n + 8 * (n - 1)) / 2;
    for (let i = 0; i < n; i++) {
      const x = rowX + i * (s + 8), y = 348, sel = mp.myChar === i;
      this.roundRect(x, y, s, s, 14, sel ? '#3F5A26' : unlocked[i] ? '#2A2116' : '#1E1A14', sel ? C.GOLD : unlocked[i] ? C.PANEL_BORDER : '#4A4038', sel ? 4 : 2);
      this.register(x, y, s, s, 'LOBBY_CHAR', i, true);
      this.ctx.globalAlpha = unlocked[i] ? 1 : 0.3;
      this.emoji(CHARS[i].icon, x + s / 2, y + s / 2, s * 0.7);
      this.ctx.globalAlpha = 1;
      if (!unlocked[i]) this.emoji('🔒', x + s - 16, y + s - 16, 24);
    }
    const cd = CHARS[mp.myChar];
    let info = cd.name + ' • Arma: ' + cd.startWeapon.name;
    for (let m = 0; m < cd.mods.length; m += 2) info += ' • ' + Stat.format(cd.mods[m], cd.mods[m + 1]);
    this.textFit(info, cx, 470, 20, vw - 60, '#E8F5D0');
    // modo (cooperativo ou PvP) e dificuldade
    const half = (vw - 80) / 2, mx = 30, dx = 50 + half;
    const pvp = mp.mode === 'pvp';
    if (host) this.button(mx, 488, half, 74, '', 'LOBBY_MODE', 0, pvp ? '#8E2B2B' : '#2E6B3A', true, 20);
    else this.roundRect(mx, 488, half, 74, 16, pvp ? 'rgba(142,43,43,0.6)' : 'rgba(46,107,58,0.6)');
    this.textFit('Modo: ' + (pvp ? '⚔️ PvP (todos contra todos)' : '🤝 Cooperativo') + (host ? '  (toque pra trocar)' : ''), mx + half / 2, 518, 23, half - 20, '#FFFFFF');
    this.textFit(pvp ? '15 rodadas pra se preparar, depois duelo numa arena que fecha' : 'Todos juntos contra os insetos', mx + half / 2, 546, 16, half - 20, '#FFE0D0');
    const diffColor = DIFF_COLORS;
    const dtx = DIFF_ICONS[mp.diff] + ' ' + DIFF_NAMES[mp.diff];
    this.roundRect(dx, 488, half, 74, 16, 'rgba(0,0,0,0.4)');
    if (host) {
      this.button(dx, 488, 50, 74, '◀', 'LOBBY_DIFF', -1, C.GRAY, true, 26);
      this.button(dx + half - 50, 488, 50, 74, '▶', 'LOBBY_DIFF', 1, C.GRAY, true, 26);
    }
    this.textFit('Dificuldade: ' + dtx, dx + half / 2, 520, 24, half - 120, diffColor[mp.diff]);
    this.textFit(DIFF_DESC[mp.diff], dx + half / 2, 546, 15, half - 120, '#CFE3B8');
    // rodapé
    const by = VH - 104;
    this.button(30, by + 8, 180, 76, 'Sair', 'LOBBY_LEAVE', 0, C.GRAY, true, 30);
    const bw = vw < 1200 ? 250 : 300;
    if (host) this.button(vw - 30 - bw, by + 4, bw, 84, 'COMEÇAR!', 'LOBBY_START', 0, C.GREEN, mp.canStart(), 36);
    else this.button(vw - 30 - bw, by + 4, bw, 84, mp.myReady ? 'Cancelar pronto' : 'PRONTO!', 'LOBBY_READY', 0, mp.myReady ? C.ORANGE : C.GREEN, true, mp.myReady ? 28 : 36);
    const hintW = vw - 60 - 180 - bw - 40;
    this.textFit(mp.lobbyHint(), 30 + 180 + 20 + hintW / 2, by + 44, 22, hintW, '#FFE678');
    if (!this.touch) this.textFit('Setas: legume  •  ' + (host ? 'Q/E: dificuldade  •  Enter: começar' : 'Enter: pronto') + '  •  Esc: sair', 30 + 180 + 20 + hintW / 2, by + 76, 16, hintW, 'rgba(255,255,255,0.45)');
  }

  // --- Personagens ---

  drawCharSelect() {
    this.text('ESCOLHA SEU LEGUME', this.vw / 2, 50, 40, C.GOLD, 'center');
    const unlocked = this.unlockedChars();
    const cols = 8, gap = 10, vw = this.vw;
    const cw = (vw - 60 - gap * (cols - 1)) / cols, ch = 128;
    for (let i = 0; i <= CHARS.length; i++) {
      const x = 30 + (i % cols) * (cw + gap), y = 70 + Math.floor(i / cols) * (ch + gap);
      const random = i === CHARS.length;
      const sel = random ? this.selectedChar === RANDOM_CHAR : i === this.selectedChar;
      const open = random || unlocked[i];
      const hov = this.isHover(x, y, cw, ch);
      this.roundRect(x, y, cw, ch, 16, sel ? '#3F5A26' : !open ? '#1E1A14' : hov ? '#3A2E1E' : '#2A2116',
        sel ? C.GOLD : open ? C.PANEL_BORDER : '#4A4038', sel ? 5 : 3);
      this.register(x, y, cw, ch, random ? 'RANDOM' : 'CHAR', i, true);
      const cx = x + cw / 2;
      const bob = sel ? Math.sin(this.time * 6) * 3 : 0;
      if (random) {
        this.emoji('🎲', cx, y + 52 + bob, 56);
        this.textFit('Aleatório', cx, y + 112, 18, cw - 10, '#FFFFFF');
        continue;
      }
      const cd = CHARS[i];
      if (!open) {
        this.ctx.globalAlpha = 0.3;
        this.emoji(cd.icon, cx, y + 52, 56);
        this.ctx.globalAlpha = 1;
        this.emoji('🔒', cx + 24, y + 70, 28);
        this.textFit(cd.name, cx, y + 112, 16, cw - 10, '#9A9A9A');
        continue;
      }
      this.drawHero(cd, cx, y + 54 + bob, 60, { facingLeft: false, lookX: sel ? 1 : 0, lookY: sel ? 0 : 0.3 });
      this.textFit(cd.name, cx, y + 116, 16, cw - 10, '#FFFFFF');
    }
    // detalhes do escolhido
    const py = 352, ph = 256;
    this.panel(30, py, vw - 60, ph);
    const idx = this.selectedChar;
    if (idx === RANDOM_CHAR) {
      this.emoji('🎲', 120, py + 120, 120);
      this.text('Aleatório', 230, py + 70, 34, '#FFFFFF', 'left');
      this.wrapped('Começa com um dos legumes que você já liberou, escolhido na sorte!', 230, py + 112, vw - 300, 22, '#E8F5D0', 'left');
    } else {
      const cd = CHARS[idx], open = unlocked[idx];
      if (open) this.drawHero(cd, 120, py + 128, 140, { facingLeft: false, lookX: Math.cos(this.time), lookY: 0.2, bob: Math.sin(this.time * 3) * 0.03 });
      else { this.ctx.globalAlpha = 0.35; this.emoji(cd.icon, 120, py + 128, 130); this.ctx.globalAlpha = 1; this.emoji('🔒', 160, py + 170, 50); }
      const tx = 230, tw = vw - 60 - 220;
      this.text(cd.name, tx, py + 48, 32, open ? C.GOLD : '#BBBBBB', 'left');
      this.text(cd.tagline, tx + this.measure(cd.name, 32) + 16, py + 46, 20, '#CFE3B8', 'left');
      this.text('Arma: ' + cd.startWeapon.icon + ' ' + cd.startWeapon.name, tx, py + 82, 20, '#FFE08A', 'left');
      let mx = tx, my = py + 114;
      for (let m = 0; m < cd.mods.length; m += 2) {
        const v = cd.mods[m + 1], t = Stat.format(cd.mods[m], v);
        const w = this.measure(t, 18) + 26;
        if (mx + w > tx + tw) { mx = tx; my += 26; }
        this.roundRect(mx, my - 19, w - 8, 26, 10, 'rgba(0,0,0,0.3)');
        this.text(t, mx + 9, my, 18, v >= 0 ? '#8CF08C' : '#FF8080', 'left');
        mx += w;
      }
      const ay = this.wrapped('⭐ ' + cd.ability, tx, my + 34, tw - 10, 19, '#FFFFFF', 'left');
      if (!open) this.wrapped('🔒 Para liberar: ' + unlockText(cd), tx, ay + 6, tw - 10, 20, '#FFC870', 'left');
    }
    // linha de baixo: voltar, dificuldade, começar
    const by = VH - 98, narrow = vw < 1200;
    const backW = narrow ? 150 : 190, startW = narrow ? 220 : 270;
    this.button(30, by + 8, backW, 72, 'Voltar', 'MENU', 0, C.GRAY, true, 30);
    const left = 30 + backW + 14, right = vw - 30 - startW - 14;
    const cx = (left + right) / 2, half = Math.min(300, (right - left) / 2);
    this.button(cx - half, by + 8, 56, 72, '◀', 'DIFF', -1, C.GRAY, true, 30);
    this.button(cx + half - 56, by + 8, 56, 72, '▶', 'DIFF', 1, C.GRAY, true, 30);
    const pw = half - 64;
    this.roundRect(cx - pw, by + 4, pw * 2, 80, 16, 'rgba(0,0,0,0.4)');
    const diffColor = DIFF_COLORS;
    let title = DIFF_ICONS[this.difficulty] + ' ' + DIFF_NAMES[this.difficulty];
    if (this.prefs.data.bestDiffWon >= this.difficulty) title += '  ✔';
    this.textFit(title, cx, by + 38, 28, pw * 2 - 16, diffColor[this.difficulty]);
    this.textFit(DIFF_DESC[this.difficulty] + (this.touch ? '' : '  (Q/E)'), cx, by + 68, 17, pw * 2 - 16, '#CFE3B8');
    const canStart = this.selectedChar === RANDOM_CHAR || unlocked[this.selectedChar];
    this.button(vw - 30 - startW, by + 4, startW, 80, 'COMEÇAR!', 'START', 0, C.GREEN, canStart, 36);
  }

  // --- Ranking online ---

  drawRanking() {
    const vw = this.vw, cx = vw / 2, r = this.rank;
    this.drawMenuBackground();
    this.text('🏆 RANKING ONLINE', cx, 62, 46, C.GOLD, 'center');
    // abas de dificuldade
    const nt = DIFF_NAMES.length, tw = Math.min(200, (vw - 60 - (nt - 1) * 10) / nt), tx = cx - (tw * nt + (nt - 1) * 10) / 2;
    for (let i = 0; i < DIFF_NAMES.length; i++) {
      const sel = i === r.diff;
      this.button(tx + i * (tw + 10), 88, tw, 58, DIFF_ICONS[i] + ' ' + DIFF_NAMES[i], 'RANK_TAB', i, sel ? '#4CAF50' : C.GRAY, true, 22);
      if (sel) this.roundRect(tx + i * (tw + 10), 88, tw, 53, 16, null, C.GOLD, 4);
    }
    // lista (2 colunas de 10)
    const top = 168, rowH = 42, colW = Math.min(560, (vw - 90) / 2), x0 = cx - colW - 15;
    this.roundRect(x0 - 10, top - 8, colW * 2 + 50, rowH * 10 + 16, 16, 'rgba(0,0,0,0.35)');
    if (r.loading) {
      this.text('Carregando...', cx, top + 200, 30, '#E8F5D0', 'center');
    } else if (r.error) {
      this.text(r.error, cx, top + 200, 26, '#FF9A8A', 'center');
    } else if (r.entries && r.entries.length === 0) {
      this.text('Ninguém no ranking do ' + DIFF_NAMES[r.diff] + ' ainda.', cx, top + 185, 28, '#E8F5D0', 'center');
      this.text('Jogue e seja o primeiro!', cx, top + 225, 24, '#CFE3B8', 'center');
    } else if (r.entries) {
      const medals = ['🥇', '🥈', '🥉'];
      r.entries.slice(0, 20).forEach((e, i) => {
        const x = x0 + Math.floor(i / 10) * (colW + 30), y = top + (i % 10) * rowH;
        const mine = e.id === r.myId;
        if (mine) this.roundRect(x - 4, y, colW, rowH - 4, 10, 'rgba(255,216,74,0.25)', C.GOLD, 2);
        if (i < 3) this.emoji(medals[i], x + 20, y + 19, 30);
        else this.text((i + 1) + 'º', x + 20, y + 28, 20, '#CFE3B8', 'center');
        const ch = CHARS[e.character];
        if (ch) this.emoji(ch.icon, x + 58, y + 19, 30);
        this.text(String(e.name || '?').slice(0, 16), x + 82, y + 28, 21, mine ? C.GOLD : '#FFFFFF', 'left');
        const res = e.won ? '🏆 Venceu' : 'Onda ' + e.wave;
        this.text(res, x + colW - 150, y + 28, 19, e.won ? C.GOLD : '#E8F5D0', 'right');
        this.text(shortNum(e.kills) + ' 🐛', x + colW - 58, y + 28, 18, '#CFE3B8', 'right');
        this.emoji(e.platform === 'android' ? '📱' : '💻', x + colW - 30, y + 18, 22);
      });
    }
    this.button(30, VH - 96, 200, 74, 'Voltar', 'MENU', 0, C.GRAY, true, 30);
    this.button(vw - 230, VH - 96, 200, 74, 'Atualizar', 'RANK_REFRESH', 0, C.GRAY, !r.loading, 28);
    this.text('Ordem: quem venceu, depois a onda alcançada e os insetos derrotados.', cx, VH - 54, 18, 'rgba(255,255,255,0.6)', 'center');
    if (!this.touch) this.text('Setas: dificuldade  •  R: atualizar  •  Esc: voltar', cx, VH - 26, 16, 'rgba(255,255,255,0.45)', 'center');
  }

  // --- Caixa ---

  drawCrate() {
    const g = this.game, p = g.player, it = g.crateItem;
    const statsW = this.vw < 1200 ? 250 : 300;
    const areaW = this.vw - statsW - 48, cx = 24 + areaW / 2;
    const tw = this.measure('CAIXA ENCONTRADA!', 46);
    this.emoji('📦', cx - tw / 2 - 12, 66, 60);
    this.text('CAIXA ENCONTRADA!', cx + 28, 82, 46, C.GOLD, 'center');
    if (p.crates > 1) this.text('Mais ' + (p.crates - 1) + (p.crates === 2 ? ' caixa' : ' caixas') + ' depois desta', cx, 124, 22, '#E8F5D0', 'center');
    if (it) {
      const w = Math.min(420, areaW - 40), h = 360, x = cx - w / 2, y = 150;
      this.card(x, y, w, h, it.tier, false);
      this.itemIcon(it, cx, y + 80, 110);
      this.text(it.name, cx, y + 178, 34, TIER_COLOR[it.tier], 'center');
      this.text('Item • Raridade ' + TIER_NAMES[it.tier], cx, y + 208, 18, '#B0B0B0', 'center');
      let ly = y + 248;
      for (let m = 0; m < it.mods.length; m += 2) {
        const v = it.mods[m + 1];
        this.text(Stat.format(it.mods[m], v), cx, ly, 22, v >= 0 ? '#8CF08C' : '#FF8080', 'center');
        ly += 28;
      }
      if (it.specialText) this.wrapped(it.specialText, cx, ly, w - 30, 20, '#FFE08A', 'center');
      const bw = Math.min(260, (areaW - 60) / 2);
      this.button(cx - bw - 10, VH - 120, bw, 84, this.touch ? 'Pegar' : 'Pegar (Enter)', 'CRATE_TAKE', 0, C.GREEN, true, 34);
      this.buttonSeed(cx + 10, VH - 120, bw, 84, g.crateRecyclePrice(), 'CRATE_RECYCLE', 0, C.ORANGE, true, this.touch ? 'Reciclar +' : 'Reciclar (R) +');
    }
    this.drawStatsPanel(this.vw - statsW - 16, 16, statsW, VH - 32);
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
    return c;
  }

  /** O mapa muda no Inferno. */
  isInferno() { const g = this.game; return g.difficulty === DIFF_INFERNO && !g.pvp; }

  arenaFor() {
    this.arenas = this.arenas || {};
    const key = this.isInferno() ? 'inferno' : 'normal';
    if (!this.arenas[key]) this.arenas[key] = key === 'inferno' ? this.buildInfernoArena() : this.buildArena();
    return this.arenas[key];
  }

  /** Câmera (sem a tremida): usada também para a mira com o mouse. */
  updateCamera() {
    const g = this.game, me = g.player, vw = this.vw;
    const focus = me.alive ? me : (g.nearestPlayer(me.x, me.y) || me);
    const margin = 70;
    let camX = WORLD_W + margin * 2 <= vw ? (WORLD_W - vw) / 2 : clamp(focus.x - vw / 2, -margin, WORLD_W - vw + margin);
    let camY = clamp(focus.y - VH / 2, -margin, WORLD_H - VH + margin);
    if (focus !== me) {
      const c = this.cam, k = 0.12;
      camX = c.x + (camX - c.x) * k; camY = c.y + (camY - c.y) * k;
    }
    this.cam.x = camX; this.cam.y = camY;
  }

  drawWorld() {
    const ctx = this.ctx, g = this.game, me = g.player, vw = this.vw;
    const inferno = this.isInferno();
    this.updateCamera();
    let camX = this.cam.x, camY = this.cam.y;
    if (g.shake > 0 && !g.paused) {
      camX += (Math.random() - 0.5) * g.shake;
      camY += (Math.random() - 0.5) * g.shake;
    }
    ctx.fillStyle = inferno ? '#140605' : '#22301A';
    ctx.fillRect(0, 0, vw, VH);
    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.drawImage(this.arenaFor(), 0, 0);

    // cerca (no Inferno: muro de obsidiana em chamas)
    if (inferno) {
      ctx.lineWidth = 18; ctx.strokeStyle = '#1A0A0A';
      ctx.strokeRect(-9, -9, WORLD_W + 18, WORLD_H + 18);
      ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,${100 + Math.round(60 * Math.sin(this.time * 3))},0,0.9)`;
      ctx.strokeRect(-1, -1, WORLD_W + 2, WORLD_H + 2);
    } else {
      ctx.lineWidth = 16; ctx.strokeStyle = '#6B4A26';
      ctx.strokeRect(-8, -8, WORLD_W + 16, WORLD_H + 16);
      ctx.lineWidth = 6; ctx.strokeStyle = '#8A6234';
      ctx.strokeRect(-8, -8, WORLD_W + 16, WORLD_H + 16);
    }

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

    // minas da Melancia
    for (const m of g.mines) {
      const armed = m.arm <= 0;
      this.circle(m.x, m.y + 4, 11, 'rgba(0,0,0,0.3)');
      this.circle(m.x, m.y, 10, '#2E7D32');
      ctx.strokeStyle = '#A5D6A7'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(m.x, m.y, 7, -2.4, -0.6); ctx.stroke();
      const blink = armed && Math.sin(this.time * 10 + m.x) > 0;
      this.circle(m.x, m.y - 1, 3.5, blink ? '#FF3030' : armed ? '#7A1010' : '#555');
    }

    // coletáveis
    for (const pk of g.pickups) {
      const bob = Math.sin(pk.bob * 5) * 3;
      if (pk.type === 0) {
        const r = pk.value > 1 ? 10 : 7;
        this.circle(pk.x, pk.y + 6, r, 'rgba(0,0,0,0.25)');
        this.circle(pk.x, pk.y + bob, r, C.SEED);
        this.circle(pk.x - r * 0.3, pk.y + bob - r * 0.3, r * 0.4, '#D6FFB0');
      } else if (pk.type === 2) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.25)';
        this.ctx.beginPath(); this.ctx.ellipse(pk.x, pk.y + 17, 18, 5, 0, 0, Math.PI * 2); this.ctx.fill();
        this.circle(pk.x, pk.y + bob, 26 + Math.sin(this.time * 6) * 3, 'rgba(255,216,74,0.33)');
        this.emoji('📦', pk.x, pk.y + bob, 40);
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
    for (const p of g.players) {
      if (!p.alive) continue;
      if (g.coop) { // anel colorido: cada jogador tem uma cor
        ctx.strokeStyle = SLOT_COLORS[p.slot % SLOT_COLORS.length]; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 23, 30, 10, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 23, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
    }

    for (const e of g.enemies) if (!e.dead) this.drawEnemy(e, inferno);
    for (const p of g.players) {
      if (!p.alive) { this.drawGhost(p); continue; }
      if (p.kind === 'alien') this.drawTentacles(p);
      this.drawPlayer(p);
      for (const w of p.weapons) this.drawWeapon(w, p.laser.heat);
      if (p.kind === 'minions') this.drawMinions(p);
    }
    for (const p of g.players) if (p.alive && p.kind === 'laser') this.drawLaser(p);
    if (g.coop) {
      for (const p of g.players) {
        if (p === me) continue;
        this.text(p.name, p.x, p.y - 46, 18, SLOT_COLORS[p.slot % SLOT_COLORS.length], 'center');
        if (p.alive && p.hp < p.maxHp()) {
          ctx.fillStyle = 'rgba(0,0,0,0.67)'; ctx.fillRect(p.x - 25, p.y - 40, 50, 6);
          ctx.fillStyle = '#E0413A'; ctx.fillRect(p.x - 24, p.y - 39, 48 * clamp(p.hp / p.maxHp(), 0, 1), 4);
        }
      }
    }

    // projéteis
    for (const b of g.bullets) {
      if (!b.wd && b.source && b.source.def) b.wd = b.source.def;
      this.drawBullet(b);
    }
    for (const b of g.enemyBullets) {
      if (inferno) {
        this.circle(b.x, b.y, b.radius + 4, 'rgba(255,80,0,0.35)');
        this.circle(b.x, b.y, b.radius, '#FF6D00');
        this.circle(b.x, b.y, b.radius * 0.45, '#FFF59D');
      } else {
        this.circle(b.x, b.y, b.radius + 3, '#3A0A4A');
        this.circle(b.x, b.y, b.radius, '#C24BFF');
        this.circle(b.x, b.y, b.radius * 0.4, '#F5D6FF');
      }
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

    // duelo: a zona que fecha (fora dela é perigoso)
    if (g.zone) this.drawZone(g.zone);

    // números de dano
    for (const t of g.texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.maxLife * 2);
      this.text(t.text, t.x, t.y, t.size, t.color, 'center');
    }
    ctx.globalAlpha = 1;

    // mira do laser com o mouse
    if (me.alive && me.kind === 'laser' && !this.touch && this.mouseX >= 0) {
      const mx = this.mouseX + this.cam.x, my = this.mouseY + this.cam.y;
      ctx.strokeStyle = me.laser.over ? 'rgba(160,160,160,0.8)' : 'rgba(255,60,80,0.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(mx, my, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 22, my); ctx.lineTo(mx - 8, my); ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 22, my);
      ctx.moveTo(mx, my - 22); ctx.lineTo(mx, my - 8); ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my + 22); ctx.stroke();
    }
    ctx.restore();
    if (inferno) this.drawEmbers(camX, camY);
  }

  /** O feixe do canhão laser (com os feixes extras do Prisma). */
  drawLaser(p) {
    const g = this.game, L = p.laser;
    if (!L.on) return;
    const st = p.laserView || g.laserStats(p);
    const beams = [[0, 1]];
    for (let k = 1; k <= (p.laserView ? p.laserView.split : p.cy.split); k++) beams.push([0.22 * k, 0.8], [-0.22 * k, 0.8]);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [off, lm] of beams) {
      const a = p.aimAng + off, c = Math.cos(a), s = Math.sin(a);
      const x0 = p.x + c * 30, y0 = p.y + s * 30 + 4, len = st.range * lm;
      const x1 = x0 + c * len, y1 = y0 + s * len;
      const w = st.width * (off ? 0.6 : 1) * (1 + 0.15 * Math.sin(this.time * 40));
      for (const [lw, col] of [[w * 2.4, 'rgba(255,30,60,0.18)'], [w * 1.3, 'rgba(255,60,90,0.55)'], [w * 0.45, 'rgba(255,230,235,0.95)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      this.circle(x0, y0, w * 0.9, 'rgba(255,200,210,0.8)');
      this.circle(x1, y1, w * 0.7 + Math.random() * 4, 'rgba(255,120,140,0.6)');
    }
    ctx.restore();
  }

  drawMinions(p) {
    const g = this.game, n = g.minionCount(p);
    for (let i = 0; i < n; i++) {
      const [x, y] = g.minionPos(p, i, n);
      const bob = Math.sin(this.time * 6 + i) * 2;
      this.circle(x, y + 16, 7, 'rgba(0,0,0,0.2)');
      const glow = this.ctx.createRadialGradient(x, y + bob, 2, x, y + bob, 18);
      glow.addColorStop(0, 'rgba(124,140,255,0.5)'); glow.addColorStop(1, 'rgba(124,140,255,0)');
      this.ctx.fillStyle = glow; this.ctx.beginPath(); this.ctx.arc(x, y + bob, 18, 0, Math.PI * 2); this.ctx.fill();
      this.emoji('🫐', x, y + bob, 26);
      this.drawEyes(x, y + bob - 1, 0.35, 0, 0);
    }
  }

  drawZone(z) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-200, -200, WORLD_W + 400, WORLD_H + 400);
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(120,0,20,0.42)';
    ctx.fill('evenodd');
    ctx.lineWidth = 8;
    ctx.strokeStyle = `rgba(255,${80 + Math.round(60 * Math.sin(this.time * 6))},80,0.9)`;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.setLineDash([18, 14]); ctx.lineDashOffset = -this.time * 40;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r - 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawEnemy(e, inferno) {
    const ctx = this.ctx;
    const size = e.radius * 2.5;
    const squash = Math.sin(e.anim * 10) * 0.06;
    let tint = null, ox = 0;
    if (e.flash > 0) tint = '#FFFFFF';
    else if ((e.def.ai === AI_CHARGE && e.aiState === 1) || ((e.def.ai === AI_BOSS_ANT || e.def.ai === AI_BOSS_BEETLE) && e.aiState === 2)) {
      tint = 'rgba(255,32,32,0.6)';
      ox = (Math.random() - 0.5) * 6;
    } else if (e.slowTime > 0) tint = 'rgba(128,216,255,0.47)';
    else if (e.burnTime > 0) tint = 'rgba(255,106,0,0.53)';
    else if (e.elite) tint = 'rgba(255,196,0,0.33)';
    else if (inferno) tint = 'rgba(220,30,0,0.3)';
    if (inferno) { // aura de fogo
      const g = ctx.createRadialGradient(e.x, e.y, e.radius * 0.4, e.x, e.y, e.radius * 1.6);
      g.addColorStop(0, 'rgba(255,90,0,0.35)'); g.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    if (e.elite) this.circle(e.x, e.y, e.radius * 1.25 + Math.sin(this.time * 8) * 3, 'rgba(255,196,0,0.33)');
    ctx.save();
    ctx.translate(e.x + ox, e.y);
    if (!e.facingLeft) ctx.scale(-1, 1);
    ctx.scale(1 + squash, 1 - squash);
    this.emoji(e.def.icon, 0, 0, size, tint);
    if (inferno && !e.elite) { // chifrinhos
      const r = e.radius;
      ctx.fillStyle = '#2A0505';
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(d * r * 0.25, -r * 0.75); ctx.quadraticCurveTo(d * r * 0.6, -r * 1.25, d * r * 0.62, -r * 1.35);
        ctx.lineTo(d * r * 0.45, -r * 0.7); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
    if (e.elite) this.emoji('👑', e.x, e.y - e.radius * 1.2, 30);
    if (!e.def.boss && e.hp < e.maxHp) {
      const w = e.radius * 1.6, y = e.y - e.radius * (e.elite ? 1.6 : 1.25);
      ctx.fillStyle = 'rgba(0,0,0,0.67)';
      ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 6);
      ctx.fillStyle = e.elite ? '#FFC400' : '#FF5040';
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  drawPlayer(p) {
    const g = this.game;
    if (p.iframes > 0.15 && g.waveTime > 1 && Math.floor(p.iframes * 20) % 2 === 0) return;
    const bob = p.moving ? Math.sin(p.moveAnim) * 0.07 : Math.sin(this.time * 3) * 0.03;
    this.drawHero(p.character, p.x, p.y, 68, { facingLeft: p.facingLeft, lookX: p.lookX, lookY: p.lookY, bob, moving: p.moving });
  }

  /** Jogador que caiu (multiplayer): fantasminha transparente até a próxima onda. */
  drawGhost(p) {
    const ctx = this.ctx;
    this.drawHero(p.character, p.x, p.y + Math.sin(this.time * 3 + p.slot) * 4, 60, { alpha: 0.35, facingLeft: p.facingLeft });
    ctx.globalAlpha = 0.85;
    this.emoji('👻', p.x + 22, p.y - 26 + Math.sin(this.time * 4) * 3, 30);
    ctx.globalAlpha = 1;
  }

  /** Setinhas na borda da tela apontando para os amigos que estão fora de vista. */
  drawTeamArrows() {
    const g = this.game, vw = this.vw;
    for (const p of g.players) {
      if (p === g.player) continue;
      const sx = p.x - this.cam.x, sy = p.y - this.cam.y;
      if (sx > -10 && sx < vw + 10 && sy > -10 && sy < VH + 10) continue;
      const x = clamp(sx, 40, vw - 40), y = clamp(sy, 120, VH - 40);
      const a = Math.atan2(sy - y, sx - x), color = SLOT_COLORS[p.slot % SLOT_COLORS.length];
      const ctx = this.ctx;
      this.circle(x, y, 26, 'rgba(0,0,0,0.55)');
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = p.alive ? 1 : 0.5;
      this.emoji(p.alive ? p.character.icon : '👻', x, y, 34);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 40, y + Math.sin(a) * 40);
      ctx.lineTo(x + Math.cos(a + 0.4) * 29, y + Math.sin(a + 0.4) * 29);
      ctx.lineTo(x + Math.cos(a - 0.4) * 29, y + Math.sin(a - 0.4) * 29);
      ctx.fill();
    }
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

  // --- HUD ---

  drawHud() {
    const g = this.game, p = g.player, vw = this.vw;
    if (g.coop) this.drawTeamArrows();
    // aviso de vida baixa: bordas vermelhas pulsando
    const frac = p.hp / p.maxHp();
    if (frac < 0.3 && !g.ending && p.alive) {
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 7);
      const a = 0.6 * pulse * (1 - frac / 0.3 * 0.5);
      const grad = this.ctx.createRadialGradient(vw / 2, VH / 2, vw * 0.25, vw / 2, VH / 2, vw * 0.62);
      grad.addColorStop(0, 'rgba(200,0,0,0)');
      grad.addColorStop(1, 'rgba(200,0,0,' + a.toFixed(3) + ')');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, vw, VH);
    }
    this.bar(18, 16, 320, 34, p.hp / p.maxHp(), '#E0413A', '#3A1210');
    this.text(Math.max(0, Math.ceil(p.hp)) + ' / ' + p.maxHp(), 178, 42, 24, '#FFFFFF', 'center');
    this.bar(18, 56, 320, 22, p.xp / p.xpToNext(), '#5FD35F', '#12301A');
    this.text('NV ' + p.level, 178, 74, 18, '#FFFFFF', 'center');
    this.seedIcon(34, 104, 12);
    this.text(String(p.materials), 56, 115, 32, '#FFFFFF', 'left');
    if (p.crates > 0) {
      this.emoji('📦', 34, 148, 30);
      this.text('x' + p.crates, 56, 158, 26, C.GOLD, 'left');
    }
    if (g.pvp === 'prep') this.drawRivals(18, p.crates > 0 ? 190 : 150);
    else if (g.coop) this.drawTeamList(18, p.crates > 0 ? 190 : 150);

    const mw = g.maxWave();
    if (g.pvp === 'duel') {
      this.text('⚔️ DUELO', vw / 2, 40, 30, '#FF8A7A', 'center');
      const t = Math.floor(g.duelTime);
      this.text(Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), vw / 2, 92, 46, '#FFFFFF', 'center');
      if (p.kind === 'laser') this.drawHeatBar(p);
    } else {
    const wl = (g.pvp === 'prep' ? 'RODADA ' : 'ONDA ') + g.wave + (mw !== Infinity && mw !== MAX_WAVE || g.pvp ? '/' + mw : '');
    this.text(wl + (g.difficulty !== 1 && !g.pvp ? '  •  ' + DIFF_NAMES[g.difficulty] : g.pvp ? '  •  PvP' : ''), vw / 2, 40, 28, '#FFFFFF', 'center');
    if (p.kind === 'laser') this.drawHeatBar(p);
    const left = g.ending ? 0 : Math.ceil(Math.max(0, g.waveDuration - g.waveTime));
    this.text(String(left), vw / 2, 96, 56, left <= 5 ? '#FF6A5A' : '#FFFFFF', 'center');
    }

    this.button(vw - 86, 16, 68, 68, 'II', 'PAUSE', 0, 'rgba(51,51,51,0.67)', true, 30);
    if (g.coop && this.mp.isGuest() && g.pvp !== 'prep') {
      // ping: tempo de ida e volta até o dono da sala
      const ms = Math.round(this.mp.ping), direct = !!(this.mp.hostPeer && this.mp.hostPeer.isOpen());
      const color = !ms ? '#CFCFCF' : ms < 120 ? '#8CF08C' : ms < 250 ? '#FFE678' : '#FF8A7A';
      this.text((ms ? ms + ' ms' : '...') + (direct ? ' ⚡' : ' 🌐'), vw - 100, 60, 22, color, 'right');
    }

    if (g.pvp === 'duel') this.drawDuelHud();
    const boss = g.boss;
    if (boss && !boss.dead) {
      const w = Math.min(700, vw * 0.55);
      this.bar(vw / 2 - w / 2, VH - 52, w, 26, boss.hp / boss.maxHp, '#B03AFF', '#26102E');
      this.text(boss.def.name, vw / 2, VH - 62, 24, '#FFFFFF', 'center');
    }

    if (g.bannerTime > 0 && g.pvp !== 'duel') {
      const a = Math.min(1, g.bannerTime * 2);
      const s = 1 + Math.max(0, g.bannerTime - 1.8) * 1.5;
      this.ctx.globalAlpha = a;
      this.text(g.banner, vw / 2, VH * 0.36, 58 * s, C.GOLD, 'center');
      this.ctx.globalAlpha = 1;
    }

    if (g.coop && !p.alive && !g.ending && !g.pvp) {
      this.text('Você caiu! 👻', vw / 2, VH * 0.62, 46, '#FF8A7A', 'center');
      this.text('Você volta na próxima onda. Torça pelos amigos!', vw / 2, VH * 0.62 + 40, 24, '#FFFFFF', 'center');
    }
    if (this.mp.hostStalled()) {
      this.roundRect(vw / 2 - 330, VH * 0.45 - 40, 660, 60, 16, 'rgba(0,0,0,0.7)');
      this.text('Esperando o dono da sala... (ele minimizou o jogo?)', vw / 2, VH * 0.45, 24, C.GOLD, 'center');
    }

    const j = this.joy;
    if (j) {
      const R = 75;
      this.circle(j.ox, j.oy, R, 'rgba(255,255,255,0.2)');
      this.ctx.strokeStyle = 'rgba(255,255,255,0.4)'; this.ctx.lineWidth = 3; this.ctx.stroke();
      this.circle(j.ox + clamp(j.x - j.ox, -R, R), j.oy + clamp(j.y - j.oy, -R, R), 32, 'rgba(255,255,255,0.6)');
    }
    const aj = this.aimJoy;
    if (aj) {
      const R = 75;
      this.circle(aj.ox, aj.oy, R, 'rgba(255,60,80,0.2)');
      this.ctx.strokeStyle = 'rgba(255,90,110,0.6)'; this.ctx.lineWidth = 3; this.ctx.stroke();
      this.circle(aj.ox + clamp(aj.x - aj.ox, -R, R), aj.oy + clamp(aj.y - aj.oy, -R, R), 32, 'rgba(255,90,110,0.7)');
    }
    if (!j && !aj && g.wave === 1 && g.waveTime < 7 && !g.pvp) {
      let hint = this.touch ? 'Arraste o dedo para andar' : 'Use W A S D ou as setas para andar';
      if (p.kind === 'laser') hint = this.touch ? 'Esquerda: andar  •  Direita: mirar e ATIRAR' : 'W A S D: andar  •  Mouse: mirar  •  Clique (ou Espaço): ATIRAR';
      this.text(hint, vw / 2, VH - 110, 30, 'rgba(255,255,255,0.8)', 'center');
    }
  }

  /** PvP (preparação): em que rodada estão os outros. */
  drawRivals(x, y) {
    for (const r of this.mp.roster) {
      if (r.id === this.mp.pid) continue;
      const [w, st] = (r.pv || '1|0').split('|');
      this.emoji(CHARS[r.char].icon, x + 16, y + 14, 28);
      this.text(r.name, x + 38, y + 12, 17, '#FFD0C0', 'left');
      const label = st === '2' ? '⚔️ pronto' : st === '3' ? 'caiu na rodada ' + w : st === '1' ? 'loja da rodada ' + w : 'rodada ' + w + '/' + PVP_PREP_WAVES;
      this.text(label, x + 38, y + 32, 15, st === '2' ? '#8CF08C' : '#E0E0E0', 'left');
      y += 44;
    }
  }

  /** Duelo: tempo, zona, contagem e a troca de atributos. */
  drawDuelHud() {
    const g = this.game, vw = this.vw, p = g.player;
    const z = g.zone;
    if (g.countdown > 3 && this.mp.swapInfo) this.drawSwapReveal();
    else if (g.countdown > 0) {
      const n = Math.ceil(g.countdown);
      this.text(String(n), vw / 2, VH * 0.45, 120 + (g.countdown % 1) * 40, '#FFFFFF', 'center');
    }
    if (p.alive && z && Math.hypot(p.x - z.x, p.y - z.y) > z.r && g.countdown <= 0) {
      this.text('⚠️ Volte pra dentro do círculo!', vw / 2, VH - 70, 30, '#FF6A5A', 'center');
    }
    if (!p.alive && g.state === 'PLAYING') this.text('Você caiu! Assista o fim do duelo 👻', vw / 2, VH * 0.62, 34, '#FF8A7A', 'center');
    if (g.bannerTime > 0 && g.countdown <= 0) {
      this.ctx.globalAlpha = Math.min(1, g.bannerTime * 2);
      this.text(g.banner, vw / 2, VH * 0.36, 64, '#FF8A7A', 'center');
      this.ctx.globalAlpha = 1;
    }
  }

  drawSwapReveal() {
    const info = this.mp.swapInfo, vw = this.vw;
    const w = Math.min(760, vw - 60), h = 120 + info.rows.length * 46, x = vw / 2 - w / 2, y = 150;
    this.panel(x, y, w, h);
    const [a, b] = info.stats;
    this.text('🔀 TROCA DE ATRIBUTOS!', vw / 2, y + 48, 36, C.GOLD, 'center');
    this.text(Stat.ICONS[a] + ' ' + Stat.NAMES[a] + '   e   ' + Stat.ICONS[b] + ' ' + Stat.NAMES[b], vw / 2, y + 86, 24, '#FFFFFF', 'center');
    const fmt = (s, v) => v + (Stat.PERCENT[s] ? '%' : '');
    info.rows.forEach((r, i) => {
      const ry = y + 126 + i * 46;
      this.emoji(CHARS[r.char] ? CHARS[r.char].icon : '❓', x + 40, ry - 8, 34);
      this.text(r.name, x + 66, ry, 22, SLOT_COLORS[r.slot % SLOT_COLORS.length], 'left');
      const t = Stat.NAMES[a] + ' ' + fmt(a, r.before[0]) + ' → ' + fmt(a, r.after[0]) + '   •   ' + Stat.NAMES[b] + ' ' + fmt(b, r.before[1]) + ' → ' + fmt(b, r.after[1]);
      this.textFit(t, x + w / 2 + 90, ry, 19, w - 260, '#E8F5D0');
    });
  }

  /** Fim do duelo. */
  drawDuelEnd() {
    const g = this.game, cx = this.vw / 2;
    this.drawMenuBackground();
    const w = g.players.find((p) => p.id === g.duelWinner);
    const mine = w === g.player;
    this.text(mine ? '🏆 VOCÊ VENCEU O DUELO!' : w ? w.name + ' venceu o duelo!' : 'Empate!', cx, 110, mine ? 58 : 50, mine ? C.GOLD : '#FF8A7A', 'center');
    if (w) {
      this.drawHero(w.character, cx, 260, 150, { lookX: 0, lookY: -0.6, bob: Math.sin(this.time * 4) * 0.04 });
      this.emoji('👑', cx, 160, 60);
      this.text(w.character.name, cx, 370, 26, '#FFFFFF', 'center');
    }
    let tx = cx - (g.players.length * 170) / 2 + 85;
    for (const q of g.players) {
      const dmg = q.weapons.reduce((a, wp) => a + wp.totalDamage, 0) + q.extraSrc.totalDamage;
      this.drawHero(q.character, tx, 450, 56, { lookX: 0, lookY: 0.3, alpha: q === w ? 1 : 0.6 });
      this.textFit(q.name + (q === g.player ? ' (você)' : ''), tx, 500, 18, 160, SLOT_COLORS[q.slot % SLOT_COLORS.length]);
      this.text('Dano: ' + shortNum(Math.round(dmg)), tx, 524, 16, '#E0E0E0', 'center');
      tx += 170;
    }
    const bw = Math.min(360, (this.vw - 100) / 2);
    this.button(cx - bw - 10, VH - 120, bw, 84, this.touch ? 'Voltar pra sala' : 'Voltar pra sala (Enter)', 'MP_BACK_LOBBY', 0, C.GREEN, true, 30);
    this.button(cx + 10, VH - 120, bw, 84, 'Sair da sala', 'QUIT', 0, C.GRAY, true, 30);
  }

  /** Calor do canhão laser (Cyborg). */
  drawHeatBar(p) {
    const vw = this.vw, L = p.laser, w = 260, x = vw / 2 - w / 2, y = 116;
    const col = L.over ? '#9E9E9E' : L.heat > 0.75 ? '#FF3D00' : L.heat > 0.45 ? '#FFA000' : '#4FC3F7';
    this.bar(x, y, w, 14, L.heat, col, '#1A1A22');
    const label = L.over ? 'SUPERAQUECIDO! esfriando...' : L.on ? 'LASER ' + Math.round(L.heat * 100) + '%' : 'LASER pronto';
    this.text(label, vw / 2, y + 36, 18, L.over ? '#FF8A65' : '#E0F7FA', 'center');
  }

  /** Time no canto da tela: ícone, nome e vida de cada amigo. */
  drawTeamList(x, y) {
    const g = this.game;
    for (const p of g.players) {
      if (p === g.player) continue;
      const color = SLOT_COLORS[p.slot % SLOT_COLORS.length];
      this.ctx.globalAlpha = p.alive ? 1 : 0.5;
      this.emoji(p.alive ? p.character.icon : '👻', x + 16, y + 14, 30);
      this.ctx.globalAlpha = 1;
      this.text(p.name, x + 38, y + 12, 17, color, 'left');
      if (this.mp.isHost()) {
        const r = this.mp.roster.find((q) => q.id === p.id);
        if (r && r.ping) this.text(r.ping + ' ms' + (r.conn ? ' ⚡' : ' 🌐'), x + 154, y + 12, 14, r.ping < 120 ? '#8CF08C' : r.ping < 250 ? '#FFE678' : '#FF8A7A', 'right');
      }
      if (p.alive) this.bar(x + 40, y + 19, 110, 8, p.hp / p.maxHp(), '#E0413A', '#3A1210');
      else this.text('caiu', x + 40, y + 31, 15, '#FF8A7A', 'left');
      y += 42;
    }
  }

  drawPause() {
    const ctx = this.ctx, vw = this.vw, coop = this.game.coop;
    ctx.fillStyle = 'rgba(0,0,0,0.69)';
    ctx.fillRect(0, 0, vw, VH);
    this.register(0, 0, vw, VH, 'NONE', -1, false);
    const statsW = vw < 1200 ? 250 : 300;
    const cx = (vw - statsW) / 2;
    this.text(coop ? 'MENU' : 'PAUSADO', cx, 110, 64, C.GOLD, 'center');
    if (coop) this.text('A partida continua rolando!', cx, 150, 22, '#FF8A7A', 'center');
    this.button(cx - 170, 180, 340, 84, this.touch ? 'Continuar' : 'Continuar (Esc)', 'RESUME', 0, C.GREEN, true, 34);
    this.button(cx - 170, 285, 340, 70, coop ? 'Sair da sala' : 'Desistir', 'QUIT', 0, C.RED, true, 30);
    this.button(cx + 190, 285, 190, 70, '🐞 Bug', 'REPORT', 0, '#A0522D', true, 26);
    this.drawWeaponRow(40, 420, cx * 2 - 80, false);
    this.drawItemsGrid(40, 590, cx * 2 - 80, 110);
    this.drawStatsPanel(vw - statsW - 16, 16, statsW, VH - 32);
  }

  // --- Level up ---

  drawLevelUp() {
    const g = this.game, p = g.player;
    const statsW = this.vw < 1200 ? 250 : 300;
    const areaW = this.vw - statsW - 48;
    this.text('SUBIU DE NÍVEL!', 24 + areaW / 2, 70, 52, '#7CFF6B', 'center');
    let sub = 'Nível ' + (p.level - g.levelsPending + 1) + ' • escolha uma melhoria' + (this.touch ? '' : ' (1-4)');
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
    this.buttonSeed(24 + areaW / 2 - 150, VH - 110, 300, 76, cost, 'LEVEL_REROLL', 0, C.ORANGE, p.materials >= cost, this.touch ? 'Rolar ' : 'Rolar (R) ');
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
    if (g.pvp === 'prep') sub = 'Rodada ' + g.wave + '/' + PVP_PREP_WAVES + ' concluída!' + (g.prepFinished() ? '  Prepare-se pro duelo!' : '');
    else if (g.coop) sub += '  Prontos: ' + (g.players.length - this.mp.waitingFor().length) + '/' + g.players.length;
    else if (g.lastHarvest > 0 && !narrow) sub += '  Colheita: +' + g.lastHarvest;
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
      if (o.item) this.itemIcon(o.item, x + 46, y + 48, 62); else this.emoji(offerIcon(o), x + 46, y + 48, 62);
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
        if (o.item.specialText) this.wrapped(o.item.specialText, x + 14, ly, cw - 28, narrow ? 15 : 17, o.item.only === 'laser' ? '#FF9AA8' : '#FFE08A', 'left');
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
    this.drawItemsGrid(24, 592, areaW, VH - 592 - 8);

    const sx = vw - statsW - 16;
    this.drawStatsPanel(sx, 16, statsW, VH - 32 - 170);
    const cost = g.shopRerollCost();
    this.buttonSeed(sx, VH - 172, statsW, 66, cost, 'REROLL', 0, C.ORANGE, p.materials >= cost, this.touch ? 'Rolar ' : 'Rolar (R) ');
    const nextLabel = g.pvp === 'prep' ? (g.prepFinished() ? '⚔️ Ir pro duelo' : 'Próxima rodada ▶') : g.coop ? 'Pronto ✔' : 'Próxima onda ▶';
    this.button(sx, VH - 96, statsW, 80, nextLabel, 'NEXT', 0, g.prepFinished() ? C.RED : C.GREEN, true, 30);

    if (this.popupWeapon >= 0 && this.popupWeapon < p.weapons.length) this.drawWeaponPopup();
    if (g.coop && this.mp.ready) this.drawWaiting();
    if (g.pvp === 'prep' && this.mp.pvpReadySent) this.drawPvpWaiting();
  }

  /** PvP: pronto pro duelo, esperando os outros terminarem as rodadas. */
  drawPvpWaiting() {
    this.backdrop('NONE');
    const w = Math.min(680, this.vw - 60), h = 300, x = this.vw / 2 - w / 2, y = VH / 2 - h / 2;
    this.panel(x, y, w, h);
    this.text('⚔️ Pronto pro duelo!', this.vw / 2, y + 62, 44, '#FF8A7A', 'center');
    const names = this.mp.pvpWaiting();
    const dots = '.'.repeat(1 + Math.floor(this.time * 2) % 3);
    this.textFit(names.length ? 'Esperando: ' + names.join(', ') + dots : 'Abrindo a arena' + dots, this.vw / 2, y + 125, 24, w - 40, '#FFFFFF');
    this.wrapped('Na arena, 2 atributos sorteados de cada um são trocados com os de outro jogador. A arena vai fechando: fique dentro do círculo!', this.vw / 2, y + 175, w - 60, 19, '#CFE3B8', 'center');
  }

  /** Multiplayer: esperando os outros terminarem a loja. */
  drawWaiting() {
    this.backdrop('NONE');
    const w = Math.min(640, this.vw - 60), h = 300, x = this.vw / 2 - w / 2, y = VH / 2 - h / 2;
    this.panel(x, y, w, h);
    this.text('Pronto! ✔', this.vw / 2, y + 62, 46, '#8CF08C', 'center');
    const names = this.mp.waitingFor().filter((n) => n !== 'você');
    const dots = '.'.repeat(1 + Math.floor(this.time * 2) % 3);
    this.textFit(names.length ? 'Esperando: ' + names.join(', ') + dots : 'Começando a próxima onda' + dots, this.vw / 2, y + 120, 26, w - 40, '#FFFFFF');
    this.text('A próxima onda começa quando todos ficarem prontos.', this.vw / 2, y + 160, 20, '#CFE3B8', 'center');
    this.button(this.vw / 2 - 150, y + h - 100, 300, 72, 'Voltar pra loja', 'UNREADY', 0, C.ORANGE, true, 28);
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
    const slots = p.maxWeapons();
    if (p.kind === 'laser') { this.drawLaserCard(x, y, w); return; }
    this.text('Armas (' + p.weapons.length + '/' + slots + ')', x, y - 10, 22, '#FFFFFF', 'left');
    const s = Math.min(92, (w - 10 * slots) / slots);
    for (let i = 0; i < slots; i++) {
      const sx = x + i * (s + 10);
      if (i < p.weapons.length) {
        const wp = p.weapons[i];
        this.card(sx, y, s, s, wp.tier, clickable && this.isHover(sx, y, s, s));
        this.emoji(wp.def.icon, sx + s / 2, y + s / 2 - 6, s * 0.55);
        this.text(TIER_NAMES[wp.tier], sx + s / 2, y + s - 8, 18, TIER_COLOR[wp.tier], 'center');
        if (wp.waveDamage > 0) this.text(shortNum(wp.waveDamage), sx + s / 2, y + s + 22, 17, '#FFB0A0', 'center');
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
      this.text((this.touch ? '(toque' : '(clique') + ' numa arma para vender ou combinar • número = dano na última onda)', x + 190, y - 10, 16, 'rgba(255,255,255,0.6)', 'left');
    }
  }

  /** Cyborg: no lugar das armas, os números do canhão laser. */
  drawLaserCard(x, y, w) {
    const g = this.game, p = g.player, st = g.laserStats(p);
    this.text('Canhão Laser (mira e tiro manuais)', x, y - 10, 22, '#FFFFFF', 'left');
    this.roundRect(x, y, w, 96, 14, '#2A1A22', '#FF5A70', 3);
    this.emoji('🔴', x + 46, y + 48, 52);
    const lines = [
      'Dano: ' + Math.round(st.dps) + '/s  •  Crítico ' + Math.round(st.crit) + '%  •  Alcance ' + Math.round(st.range) + '  •  Largura ' + Math.round(st.width),
      'Atira ' + st.fireTime.toFixed(1) + ' s seguidos  •  Esfria ' + Math.round((st.cool - 1) * 100) + '% mais rápido' + (p.cy.split ? '  •  +' + p.cy.split * 2 + ' feixes' : '') + (p.cy.boom ? '  •  Explode ao superaquecer' : ''),
    ];
    lines.forEach((l, i) => this.textFit(l, x + 90 + (w - 100) / 2, y + 38 + i * 32, 18, w - 100, i ? '#FFE08A' : '#FFFFFF'));
    const wp = p.weapons[0];
    if (wp && wp.waveDamage > 0) this.text('Dano na última onda: ' + shortNum(wp.waveDamage), x + w - 10, y + 118, 17, '#FFB0A0', 'right');
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
      this.itemIcon(it, ix + s / 2, iy + s / 2, s * 0.7);
      if (n > 1) this.text('x' + n, ix + s - 3, iy + s - 3, 16, '#FFFFFF', 'right');
      this.register(ix, iy, s, s, 'ITEM', it, true);
      const pinned = this.tipItem === it && this.tipTime > 0;
      if (pinned || (!this.touch && this.isHover(ix, iy, s, s))) this.tooltip(it, ix, iy + s + 6);
      i++;
    }
  }

  tooltip(it, x, y) {
    const lines = [[it.name, TIER_COLOR[it.tier]]];
    for (let m = 0; m < it.mods.length; m += 2) lines.push([Stat.format(it.mods[m], it.mods[m + 1]), it.mods[m + 1] >= 0 ? '#8CF08C' : '#FF8080']);
    if (it.specialText) lines.push([it.specialText, '#FFE08A']);
    const w = Math.max(...lines.map((l) => this.measure(l[0], 18))) + 24;
    const h = lines.length * 24 + 14;
    if (y + h > VH) y -= h + 62;
    x = Math.min(x, this.vw - w - 10);
    this.deferred = () => {
      this.roundRect(x, y, w, h, 10, 'rgba(15,15,15,0.95)', TIER_COLOR[it.tier], 2);
      lines.forEach(([l, c], i) => this.text(l, x + 12, y + 28 + i * 24, 18, c, 'left'));
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
    const ly = this.weaponStats(w, x + 30, y + 150, pw - 60, true);
    this.text('Dano na última onda: ' + w.waveDamage + '   •   Total: ' + w.totalDamage, x + 30, ly + 4, 18, '#FFB0A0', 'left');
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
      this.text('A HORTA ESTÁ SALVA!', cx, 100, 68, C.GOLD, 'center');
      this.text((g.coop ? 'O time sobreviveu' : 'Você sobreviveu') + ' às ' + g.wave + ' ondas no ' + DIFF_NAMES[g.difficulty] + '. Parabéns!', cx, 145, 26, '#E8F5D0', 'center');
    } else {
      this.text('VIROU SALADA!', cx, 100, 72, '#FF6A5A', 'center');
      this.text(g.coop ? 'O time inteiro caiu... os insetos venceram desta vez.' : 'Os insetos venceram desta vez...', cx, 145, 26, '#E8F5D0', 'center');
    }
    if (p) {
      const lx = cx - 250;
      this.drawHero(p.character, lx, 244, 100, { lookX: 0, lookY: won ? -1 : 1 });
      ['Onda alcançada: ' + g.wave, 'Dificuldade: ' + DIFF_NAMES[g.difficulty], 'Nível: ' + p.level,
        'Insetos derrotados: ' + g.kills, 'Melhor onda: ' + this.prefs.data.bestWave]
        .forEach((l, i) => this.text(l, lx, 330 + i * 36, 25, '#FFFFFF', 'center'));
      const rx = cx + 40, ry = 200;
      this.text('Dano das armas', rx, ry, 26, C.GOLD, 'left');
      const best = Math.max(1, ...p.weapons.map((w) => w.totalDamage));
      p.weapons.forEach((w, i) => {
        const y = ry + 22 + i * 46;
        this.emoji(w.def.icon, rx + 18, y + 18, 34);
        this.roundRect(rx + 44, y + 6, 300, 24, 8, 'rgba(0,0,0,0.33)');
        if (w.totalDamage > 0) this.roundRect(rx + 44, y + 6, Math.max(8, 300 * w.totalDamage / best), 24, 8, TIER_COLOR[w.tier]);
        this.text(shortNum(w.totalDamage), rx + 352, y + 27, 20, '#FFFFFF', 'left');
      });
    }
    if (this.newUnlocks) {
      this.ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 5);
      this.text('🔓 Novo personagem liberado: ' + this.newUnlocks + '!', cx, VH - 150, 28, C.GOLD, 'center');
      this.ctx.globalAlpha = 1;
    }
    if (g.coop) {
      // o time
      let tx = cx - (g.players.length * 150) / 2 + 75;
      for (const q of g.players) {
        this.drawHero(q.character, tx, VH - 222, 46, { lookX: 0, lookY: 0.4 });
        this.textFit(q.name, tx, VH - 182, 18, 140, SLOT_COLORS[q.slot % SLOT_COLORS.length]);
        tx += 150;
      }
      const bw2 = Math.min(360, (this.vw - 100) / 2);
      this.button(cx - bw2 - 10, VH - 120, bw2, 84, this.touch ? 'Voltar pra sala' : 'Voltar pra sala (Enter)', 'MP_BACK_LOBBY', 0, C.GREEN, true, 30);
      this.button(cx + 10, VH - 120, bw2, 84, 'Sair da sala', 'QUIT', 0, C.GRAY, true, 30);
      return;
    }
    const bw = Math.min(330, (this.vw - 100) / 3), gap = 20, bx = cx - (bw * 3 + gap * 2) / 2;
    this.button(bx, VH - 120, bw, 84, 'Jogar de novo', 'AGAIN', 0, C.GREEN, true, 32);
    const label = this.submitState === 'sending' ? 'Enviando...' : this.submitState === 'sent' ? 'Enviado ✔' : '🏆 Enviar pro ranking';
    this.button(bx + bw + gap, VH - 120, bw, 84, label + (this.submitState || this.touch ? '' : ' (E)'), 'SUBMIT', 0, '#B8860B', !this.submitState, 30);
    this.button(bx + (bw + gap) * 2, VH - 120, bw, 84, 'Menu', 'MENU', 0, C.GRAY, true, 32);
  }

  // ------------------------------------------------------------------
  // Ajudantes de desenho
  // ------------------------------------------------------------------

  isHover(x, y, w, h) {
    if (this.touch) return false;
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
    this.roundRect(x, y + 5, w, h - 5, 16, color);
    this.roundRect(x, y + 5, w, h - 5, 16, 'rgba(0,0,0,0.4)');
    const lift = hover ? -2 : 0;
    this.roundRect(x, y + lift, w, h - 5, 16, color);
    if (hover) this.roundRect(x, y + lift, w, h - 5, 16, 'rgba(255,255,255,0.15)');
    this.roundRect(x, y, w, h, 16, null, 'rgba(0,0,0,0.33)', 2);
  }

  keyBadge(k, x, y) {
    if (this.touch) return;
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

  /** Ícone de item; os do Alien brilham verde e os do Cyborg, vermelho. */
  itemIcon(it, x, y, size) {
    if (it.alien || it.only === 'laser') {
      const col = it.alien ? '92,255,138' : '255,70,90';
      const g = this.ctx.createRadialGradient(x, y, size * 0.1, x, y, size * 0.7);
      g.addColorStop(0, `rgba(${col},0.55)`); g.addColorStop(1, `rgba(${col},0)`);
      this.ctx.fillStyle = g; this.ctx.beginPath(); this.ctx.arc(x, y, size * 0.7, 0, Math.PI * 2); this.ctx.fill();
    }
    this.emoji(it.icon, x, y, size);
    if (it.alien) this.emoji('👽', x + size * 0.38, y - size * 0.38, size * 0.38);
    else if (it.only === 'laser') this.emoji('⚙️', x + size * 0.38, y - size * 0.38, size * 0.36);
  }

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

  /** Texto centralizado que diminui a fonte até caber na largura. */
  textFit(s, x, y, size, maxW, color) {
    while (size > 10 && this.measure(s, size) > maxW) size -= 1;
    this.text(s, x, y, size, color, 'center');
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

/** No celular: tela cheia e trava na horizontal (quando o navegador deixa). */
function enterMobileFullscreen() {
  if (IS_APP) return; // o app já é tela cheia
  const el = document.documentElement;
  const lock = () => {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignora */ }
  };
  if (document.fullscreenElement) { lock(); return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    const r = req.call(el, { navigationUI: 'hide' });
    if (r && r.then) r.then(lock).catch(() => {});
  } catch (e) { /* ignora */ }
}

/**
 * Formulário HTML por cima do jogo (o canvas não tem campo de texto).
 * o = {title, submit, fields: [{id, label, type ('text'|'password'|'textarea'|'select'|'note'), value, maxLength, options, upper}],
 *      check(values) -> mensagem de erro ou ''}
 * onOk(values) recebe os valores; se devolver uma Promise que falha com Error, a mensagem aparece e a caixa fica aberta.
 */
function openForm(o, onOk) {
  const box = document.getElementById('nameBox');
  const form = document.getElementById('nameForm');
  const holder = document.getElementById('formFields');
  const err = document.getElementById('nameErr');
  const okBtn = document.getElementById('nameOk');
  if (!box) return;
  document.getElementById('nameTitle').textContent = o.title;
  okBtn.textContent = o.submit || 'OK';
  okBtn.disabled = false;
  holder.textContent = '';
  const inputs = {};
  for (const f of o.fields) {
    if (f.type === 'note') {
      const p = document.createElement('p');
      p.className = 'note'; p.textContent = f.label;
      holder.appendChild(p);
      continue;
    }
    const label = document.createElement('label');
    label.textContent = f.label;
    label.htmlFor = 'fld_' + f.id;
    holder.appendChild(label);
    let el;
    if (f.type === 'textarea') el = document.createElement('textarea');
    else if (f.type === 'select') {
      el = document.createElement('select');
      for (const [v, t] of f.options) { const op = document.createElement('option'); op.value = v; op.textContent = t; el.appendChild(op); }
    } else {
      el = document.createElement('input');
      el.type = f.type || 'text';
      el.spellcheck = false;
      el.setAttribute('autocapitalize', f.upper ? 'characters' : 'off');
      if (f.upper) el.style.textTransform = 'uppercase';
      if (f.type === 'password') el.autocomplete = f.newPassword ? 'new-password' : 'current-password';
    }
    el.id = 'fld_' + f.id;
    if (f.maxLength) el.maxLength = f.maxLength;
    if (f.value !== undefined) el.value = f.value;
    holder.appendChild(el);
    inputs[f.id] = el;
  }
  err.textContent = '';
  box.hidden = false;
  const first = o.fields.find((f) => f.type !== 'note' && f.type !== 'select' && !f.value) || o.fields.find((f) => inputs[f.id]);
  setTimeout(() => { if (first && inputs[first.id]) { inputs[first.id].focus(); if (inputs[first.id].select) inputs[first.id].select(); } }, 30);
  const close = () => { box.hidden = true; form.onsubmit = null; document.getElementById('nameCancel').onclick = null; };
  document.getElementById('nameCancel').onclick = () => { close(); if (o.onCancel) o.onCancel(); };
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const values = {};
    for (const f of o.fields) if (inputs[f.id]) values[f.id] = f.clean ? f.clean(inputs[f.id].value) : inputs[f.id].value;
    const e = o.check ? o.check(values) : '';
    if (e) { err.textContent = e; return; }
    const r = onOk(values);
    if (r && r.then) {
      okBtn.disabled = true;
      err.textContent = 'Aguarde...';
      r.then(() => close(), (ex) => { okBtn.disabled = false; err.textContent = ex && ex.message ? ex.message : 'Deu erro. Tente de novo.'; });
    } else close();
  };
}

/** Uma pergunta de texto só (nome, código da sala...). */
function askText(o, onOk) {
  openForm({
    title: o.title, submit: o.submit,
    fields: [{ id: 'v', label: o.label, value: o.initial || '', maxLength: o.maxLength || 16, upper: o.upper, clean: o.clean }],
    check: (v) => (o.check ? o.check(v.v) : ''),
  }, (v) => onOk(v.v));
}

/** Nome para o ranking. */
function askName(initial, onOk) {
  askText({
    title: '🏆 Enviar pro ranking', label: 'Seu nome (aparece pra todo mundo):', submit: 'Enviar', initial, maxLength: 16,
    clean: (v) => v.replace(/\s+/g, ' ').trim(),
    check: (v) => (Ranking.validName(v) ? '' : 'Use de 2 a 16 letras ou números (sem < > & { } " \\).'),
  }, onOk);
}

function shortNum(v) {
  if (v >= 10000) return Math.floor(v / 1000) + 'k';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
  return String(v);
}

function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  } else if (document.exitFullscreen) document.exitFullscreen();
}
