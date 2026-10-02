// Multiplayer cooperativo (2 a 4 jogadores): salas com código, sala de espera e a partida.
//
// Como funciona:
//  - Quem cria a sala é o ANFITRIÃO: o computador dele roda a partida de verdade.
//  - Os CONVIDADOS mandam a própria posição e recebem a arena (insetos, tiros, sementes)
//    várias vezes por segundo. O movimento do próprio legume é calculado na hora, sem atraso.
//  - Entre as ondas, cada um faz as melhorias e a loja no próprio aparelho; quando todos
//    ficam prontos, o anfitrião começa a próxima onda.
//
// Modo PvP: cada um joga 15 rodadas sozinho no próprio aparelho para se preparar; depois todos
// entram numa arena (rodada pelo anfitrião) que vai fechando, com 2 atributos trocados entre eles.
//
// No banco (Firebase): rooms/CODIGO/h = escrito pelo anfitrião, rooms/CODIGO/g/ID = por cada convidado.
'use strict';

const MP_MAX = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SLOT_COLORS = ['#4FC3F7', '#FF8A65', '#CE93D8', '#FFD54F'];
const ENEMY_DEFS = Object.values(E);
const HOST_TIMEOUT = 25000, GUEST_TIMEOUT = 25000;
const PH = 28; // campos fixos de cada jogador na foto da arena (depois vêm as armas, 5 números cada)
// Atributos que podem ser trocados no duelo (sorte e colheita não fazem diferença na arena)
const SWAP_STATS = [Stat.HP, Stat.REGEN, Stat.LIFESTEAL, Stat.DAMAGE, Stat.MELEE, Stat.RANGED, Stat.ELEMENTAL,
  Stat.ATK_SPEED, Stat.CRIT, Stat.RANGE, Stat.ARMOR, Stat.DODGE, Stat.SPEED];

function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
function randomId() { return 'p' + Math.random().toString(36).slice(2, 10); }
function validCode(c) { return typeof c === 'string' && /^[A-Z0-9]{4}$/.test(c); }
function now() { return performance.now(); }

/** Mensagem de erro amigável para falhas de rede/permissão. */
function netError(e, fallback) {
  if (e && (e.status === 401 || e.status === 403)) return 'O banco do jogo não liberou as salas: falta publicar as regras novas do Firebase.';
  if (navigator.onLine === false) return 'Sem internet.';
  return fallback;
}

class Multiplayer {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.timers = [];
    this.reset();
  }

  reset() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.active = false;     // numa sala
    this.role = null;        // 'host' ou 'guest'
    this.code = ''; this.pid = ''; this.name = '';
    this.busy = '';          // texto enquanto cria/entra na sala
    this.mirror = null;
    this.roster = [];        // [{id, name, char, ready, conn}] na ordem de entrada
    this.diff = 1; this.myChar = 0; this.myReady = false;
    this.hostPeer = null; this.offerSeen = '';
    this.inGame = false; this.gid = 0; this.startSeen = '';
    this.seq = 0; this.lastQ = -1; this.sendAcc = 0; this.inSeq = 0;
    this.ready = false;          // pronto no intervalo entre ondas
    this.readyMap = new Map();   // anfitrião: id -> onda em que ficou pronto
    this.readySlots = [];        // convidado: quem está pronto (vem do anfitrião)
    this.breakWave = 0;          // convidado: última onda cujo intervalo já começou
    this.psSeen = '';
    this.relayBusy = {};         // escritas no Firebase em andamento (por caminho)
    this.relayAcc = 0; this.relayEv = [];
    this.sentAt = new Map(); this.ping = 0;
    this.rosterBusy = false; this.rosterDirty = false;
    this.lastSnapAt = 0; this.hostSeenAt = 0; this.hostHb = null;
    this.enemyMap = new Map();
    this.lastShots = 0;
    this.ended = false;
    this.mode = 'coop';          // 'coop' ou 'pvp' (escolhido pelo anfitrião na sala)
    this.phase = '';             // PvP: 'prep' (15 rodadas), 'duel' (arena)
    this.pvpReadySent = false;   // já mandei meus dados pro duelo
    this.duelData = new Map();   // anfitrião: id -> dados do jogador pronto pro duelo
    this.duelSeen = '';
    this.swapInfo = null;        // {stats:[a,b], rows:[{name, before:[..], after:[..]}]}
    this.myStatus = '';
  }

  isHost() { return this.active && this.role === 'host'; }
  /** Convidado com a arena vindo do anfitrião (no PvP, a preparação é local). */
  guestDriven() { return this.isGuest() && this.inGame && this.phase !== 'prep'; }
  isGuest() { return this.active && this.role === 'guest'; }
  path(p) { return 'rooms/' + this.code + (p ? '/' + p : ''); }
  inviteLink() { return (location.protocol === 'file:' ? WEBSITE_URL : location.origin + location.pathname) + '?sala=' + this.code; }
  /** Conexão com o anfitrião (convidado) ou com todos os convidados (anfitrião). */
  connText(open) { return open ? 'direto ⚡' : 'via servidor 🌐'; }

  every(ms, fn) { this.timers.push(setInterval(fn, ms)); }

  // ------------------------------------------------------------------
  // Criar / entrar / sair
  // ------------------------------------------------------------------

  async create(name, char, diff) {
    this.leave(null, true);
    this.role = 'host';
    this.pid = randomId();
    this.name = name; this.myChar = char; this.diff = diff;
    this.busy = 'Criando a sala...';
    try {
      this.cleanupOldRooms();
      let code = '';
      for (let i = 0; i < 6 && !code; i++) {
        const c = randomCode();
        const meta = await Fb.get('rooms/' + c + '/h/meta');
        if (!meta) code = c;
      }
      if (!code) throw new Error('sem código');
      this.code = code;
      this.roster = [{ id: this.pid, name, char, ready: true, conn: 1, host: true }];
      await Fb.put(this.path(), {
        h: {
          meta: { host: this.pid, diff, st: 'lobby', ts: SERVER_TIME, hb: Date.now(), v: 1, mode: this.mode },
          roster: this.rosterData(),
        },
      });
    } catch (e) {
      this.busy = '';
      this.role = null;
      throw new Error(netError(e, 'Não deu pra criar a sala. Tente de novo.'));
    }
    this.busy = '';
    this.active = true;
    this.mirror = new Mirror(this.path('g'), (p, v) => this.onGuestData(p, v), () => this.leave('A sala foi fechada pelo servidor.'));
    this.every(5000, () => { Fb.patch(this.path('h/meta'), { hb: Date.now() }).catch(() => {}); });
    this.game.state = 'LOBBY';
  }

  async join(code, name, char) {
    this.leave(null, true);
    this.role = 'guest';
    this.pid = randomId();
    this.name = name; this.myChar = char; this.code = code;
    this.busy = 'Entrando na sala ' + code + '...';
    try {
      const h = await Fb.get('rooms/' + code + '/h/meta');
      if (!h || h.st === 'closed') throw new Error('Sala ' + code + ' não encontrada. Confira o código.');
      if (h.st !== 'lobby') throw new Error('A partida dessa sala já começou.');
      const roster = (await Fb.get('rooms/' + code + '/h/roster')) || {};
      if (Object.keys(roster).length >= MP_MAX) throw new Error('A sala ' + code + ' está cheia (máximo ' + MP_MAX + ').');
      this.diff = h.diff | 0;
      await Fb.put(this.path('g/' + this.pid), { n: name, c: char, r: false, hb: Date.now() });
    } catch (e) {
      this.busy = '';
      this.role = null;
      throw new Error(e.status || e.name === 'TypeError' ? netError(e, 'Não deu pra entrar na sala. Tente de novo.') : e.message);
    }
    this.busy = '';
    this.active = true;
    this.joinedAt = now();
    this.hostSeenAt = now();
    this.mirror = new Mirror(this.path('h'), (p, v) => this.onHostData(p, v), () => this.leave('A sala foi fechada.'));
    this.every(5000, () => { Fb.patch(this.path('g/' + this.pid), { hb: Date.now() }).catch(() => {}); });
    this.game.state = 'LOBBY';
  }

  /** Sai da sala (o anfitrião fecha a sala para todos). msg = aviso para mostrar. */
  leave(msg, silent) {
    const wasActive = this.active || this.role;
    if (this.mirror) this.mirror.close();
    if (this.hostPeer) this.hostPeer.close();
    for (const r of this.roster) if (r.peer) r.peer.close();
    if (this.active && this.code) {
      if (this.role === 'host') {
        const room = this.path();
        Fb.patch(room + '/h/meta', { st: 'closed' }, true).catch(() => {}).then(() => Fb.del(room, true).catch(() => {}));
      } else if (this.role === 'guest') {
        Fb.del(this.path('g/' + this.pid), true).catch(() => {});
      }
    }
    const g = this.game;
    this.reset();
    g.rec = null; g.onWaveEnd = null;
    if (wasActive && !silent) {
      if (['LOBBY', 'PLAYING', 'LEVEL_UP', 'CRATE', 'SHOP', 'GAME_OVER', 'VICTORY', 'DUEL_END'].includes(g.state)) {
        g.state = 'MP_MENU';
      }
      g.coop = false; g.pvp = ''; g.zone = null;
      if (msg) this.ui.showToast(msg, 4);
    }
  }

  /** Apaga algumas salas esquecidas (de mais de 6 horas), para o banco não encher. */
  async cleanupOldRooms() {
    try {
      const res = await fetch(Fb.url('rooms') + '?shallow=true', { cache: 'no-store' });
      if (!res.ok) return;
      const codes = Object.keys((await res.json()) || {}).filter(validCode).slice(0, 12);
      for (const c of codes) {
        const ts = await Fb.get('rooms/' + c + '/h/meta/ts');
        if (!ts || ts < Date.now() - 6 * 3600 * 1000) await Fb.del('rooms/' + c);
      }
    } catch (e) { /* tanto faz */ }
  }

  // ------------------------------------------------------------------
  // Sala de espera
  // ------------------------------------------------------------------

  rosterData() {
    const o = {};
    this.roster.forEach((r, i) => {
      o[r.id] = { n: r.name, c: r.char, r: !!r.ready, o: i, k: r.conn ? 1 : 0 };
      if (r.pv) o[r.id].p = r.pv; // PvP: rodada e situação de cada um ("12|1")
    });
    return o;
  }

  /** Anfitrião publica a lista de jogadores (sem mandar duas ao mesmo tempo). */
  pushRoster() {
    if (!this.isHost()) return;
    if (this.rosterBusy) { this.rosterDirty = true; return; }
    this.rosterBusy = true;
    Fb.put(this.path('h/roster'), this.rosterData()).catch(() => {}).then(() => {
      this.rosterBusy = false;
      if (this.rosterDirty) { this.rosterDirty = false; this.pushRoster(); }
    });
  }

  setChar(c) {
    this.myChar = c;
    const me = this.roster.find((r) => r.id === this.pid);
    if (me) me.char = c;
    if (this.isHost()) this.pushRoster();
    else Fb.patch(this.path('g/' + this.pid), { c }).catch(() => {});
  }

  setLobbyReady(on) {
    this.myReady = on;
    const me = this.roster.find((r) => r.id === this.pid);
    if (me) me.ready = on;
    Fb.patch(this.path('g/' + this.pid), { r: on }).catch(() => {});
  }

  setDiff(d) {
    if (!this.isHost()) return;
    this.diff = d;
    Fb.patch(this.path('h/meta'), { diff: d }).catch(() => {});
  }

  setMode(m) {
    if (!this.isHost()) return;
    this.mode = m;
    Fb.patch(this.path('h/meta'), { mode: m }).catch(() => {});
  }

  canStart() {
    return this.isHost() && !this.inGame && this.roster.length >= 2 && this.roster.every((r) => r.host || r.ready);
  }

  /** O que falta para começar (texto para a tela). */
  lobbyHint() {
    if (this.roster.length < 2) return 'Esperando amigos entrarem com o código...';
    const notReady = this.roster.filter((r) => !r.host && !r.ready).map((r) => r.name);
    if (notReady.length) return 'Esperando ficar pronto: ' + notReady.join(', ');
    return this.isHost() ? 'Todos prontos! Pode começar.' : 'Todos prontos! Esperando o anfitrião começar.';
  }

  // ------------------------------------------------------------------
  // Anfitrião: dados que chegam dos convidados
  // ------------------------------------------------------------------

  onGuestData(path, value) {
    const parts = path.split('/').filter((s) => s);
    if (parts.length >= 2 && parts[1] === 'in') { this.onInput(parts[0], value); return; }
    if (parts.length >= 2 && parts[1] === 'rd') { this.onReadyMsg(parts[0], value); return; }
    this.syncGuests();
  }

  syncGuests() {
    const all = (this.mirror && this.mirror.data) || {};
    let changed = false;
    for (const r of this.roster.slice()) {
      if (!r.host && !all[r.id]) { this.dropGuest(r.id, r.name + ' saiu da sala.'); changed = true; }
    }
    for (const id of Object.keys(all)) {
      const d = all[id];
      if (!d || typeof d !== 'object') continue;
      let r = this.roster.find((x) => x.id === id);
      if (!r) {
        if (this.inGame || this.roster.length >= MP_MAX) continue; // sala cheia ou partida rolando
        r = { id, name: '', char: 0, ready: false, conn: 0, seenAt: now(), hb: null, answer: '', lastInQ: -1 };
        this.roster.push(r);
        this.connectGuest(r);
        this.ui.showToast((typeof d.n === 'string' ? d.n.slice(0, 16) : 'Alguém') + ' entrou na sala!');
        this.ui.sfx.play('LEVEL_UP');
        changed = true;
      }
      const name = typeof d.n === 'string' && Ranking.validName(d.n) ? d.n : 'Jogador';
      const char = CHARS[d.c] ? d.c | 0 : 0;
      if (name !== r.name || char !== r.char) { r.name = name; r.char = char; changed = true; }
      if (!this.inGame && !!d.r !== r.ready) { r.ready = !!d.r; changed = true; }
      if (d.hb !== r.hb) { r.hb = d.hb; r.seenAt = now(); }
      if (typeof d.pv === 'string' && d.pv !== r.pv) { r.pv = d.pv.slice(0, 20); changed = true; }
      if (typeof d.a === 'string' && d.a !== r.answer && r.peer) {
        r.answer = d.a;
        r.peer.acceptAnswer(d.a).catch(() => {});
      }
    }
    if (changed) this.pushRoster();
  }

  async connectGuest(r) {
    if (!HAS_RTC) return;
    try {
      r.peer = new Peer(true, (msg) => this.onPeerMessage(r.id, msg));
      const offer = await r.peer.makeOffer();
      if (!this.isHost() || !this.roster.includes(r)) return;
      await Fb.put(this.path('h/o/' + r.id), offer);
    } catch (e) { /* fica pelo servidor */ }
  }

  dropGuest(id, msg) {
    const i = this.roster.findIndex((r) => r.id === id);
    if (i < 0) return;
    const r = this.roster[i];
    if (r.peer) r.peer.close();
    this.roster.splice(i, 1);
    this.readyMap.delete(id);
    Fb.del(this.path('g/' + id)).catch(() => {});
    Fb.del(this.path('h/o/' + id)).catch(() => {});
    const g = this.game;
    if (this.inGame) {
      const k = g.players.findIndex((p) => p.id === id);
      if (k >= 0) g.players.splice(k, 1);
    }
    this.pushRoster();
    if (msg) this.ui.showToast(msg, 3);
  }

  onPeerMessage(id, msg) {
    const r = this.roster.find((x) => x.id === id);
    if (r) r.seenAt = now();
    const kind = msg[0];
    let d;
    try { d = JSON.parse(msg.slice(1)); } catch (e) { return; }
    if (kind === 'i') this.onInput(id, d);
    else if (kind === 'r') this.onReadyMsg(id, d);
  }

  /** Guarda a situação de um jogador na preparação do PvP ("rodada|0 jogando,1 loja,2 pronto,3 caiu"). */
  pvStatus() {
    const g = this.game;
    const st = this.pvpReadySent ? 2 : g.state === 'PLAYING' ? (g.prepDowned ? 3 : 0) : 1;
    return g.wave + '|' + st;
  }

  sendPvStatus() {
    const s = this.pvStatus();
    if (s === this.myStatus) return;
    this.myStatus = s;
    if (this.isHost()) {
      const me = this.roster.find((r) => r.id === this.pid);
      if (me) { me.pv = s; this.pushRoster(); }
    } else Fb.patch(this.path('g/' + this.pid), { pv: s }).catch(() => {});
  }

  /** Posição de um convidado. */
  onInput(id, d) {
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    const g = this.game;
    const r = this.roster.find((x) => x.id === id);
    if (!d || !r || !this.inGame || d.gid !== this.gid || g.state !== 'PLAYING' || d.w !== g.wave) return;
    r.seenAt = now();
    if (d.q <= r.lastInQ) return;
    r.lastInQ = d.q;
    const p = g.players.find((x) => x.id === id);
    r.ping = d.pg | 0;
    if (!p || !p.alive) return;
    netTrack(p, clamp(+d.x || 0, p.radius, WORLD_W - p.radius), clamp(+d.y || 0, p.radius, WORLD_H - p.radius), +d.tm || now());
    p.facingLeft = !!(d.f & 1);
    p.moving = !!(d.f & 2);
    p.wantFire = !!(d.f & 4);
    p.aimAng = (d.a | 0) / 100;
    p.lookX = (d.lx | 0) / 100; p.lookY = (d.ly | 0) / 100;
    if (d.f & 8 && p.kind === 'dash') g.tryDash(p); // Alface: dash do convidado (o dano é do anfitrião)
  }

  /** Convidado terminou (ou desfez) a loja. */
  onReadyMsg(id, d) {
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
    const g = this.game;
    if (d && d.pvp && d.gid === this.gid && this.phase === 'prep') { // pronto pro duelo
      if (d.d && playerFromData(d.d)) this.duelData.set(id, d.d);
      this.tryStartDuel();
      return;
    }
    if (!d || !this.inGame || d.gid !== this.gid || g.state === 'PLAYING' || d.w !== g.wave) return;
    if (d.d) {
      if (g.replacePlayer(id, d.d)) this.readyMap.set(id, d.w);
    } else {
      this.readyMap.delete(id);
    }
  }

  // ------------------------------------------------------------------
  // Convidado: dados que chegam do anfitrião
  // ------------------------------------------------------------------

  onHostData(path, value) {
    const data = (this.mirror && this.mirror.data) || {};
    if (path === '/' && !data.meta) { this.leave('O anfitrião fechou a sala.'); return; }
    const meta = data.meta || {};
    if (meta.st === 'closed') { this.leave('O anfitrião fechou a sala.'); return; }
    if (meta.hb !== this.hostHb) { this.hostHb = meta.hb; this.hostSeenAt = now(); }
    this.diff = meta.diff | 0;
    this.mode = meta.mode === 'pvp' ? 'pvp' : 'coop';
    if (path === '/snap') { this.onSnap(value); return; }
    // lista de jogadores
    const ro = data.roster || {};
    this.roster = Object.keys(ro).map((id) => {
      const x = ro[id] || {};
      return { id, name: String(x.n || '?').slice(0, 16), char: CHARS[x.c] ? x.c | 0 : 0, ready: !!x.r, conn: x.k ? 1 : 0, o: x.o | 0, host: id === meta.host, pv: typeof x.p === 'string' ? x.p : '' };
    }).sort((a, b) => a.o - b.o);
    // conexão direta: o anfitrião mandou uma oferta para mim
    const offer = data.o && data.o[this.pid];
    if (typeof offer === 'string' && offer !== this.offerSeen && HAS_RTC) {
      this.offerSeen = offer;
      this.answerOffer(offer);
    }
    // começo de partida
    if (typeof data.start === 'string' && data.start !== this.startSeen && meta.st === 'game') {
      this.startSeen = data.start;
      try {
        const s = JSON.parse(data.start);
        if (s && s.gid !== this.gid && s.list.some((x) => x.id === this.pid)) this.beginGame(s);
      } catch (e) { /* ignora */ }
    }
    // dados do intervalo entre ondas
    const ps = data.ps && data.ps[this.pid];
    if (typeof ps === 'string' && ps !== this.psSeen) { this.psSeen = ps; this.onPs(ps); }
    if (typeof data.duel === 'string' && data.duel !== this.duelSeen) { this.duelSeen = data.duel; this.onDuel(data.duel); }
    if (meta.st === 'lobby' && this.inGame && this.ended) this.inGame = false;
  }

  async answerOffer(offer) {
    try {
      if (this.hostPeer) this.hostPeer.close();
      const peer = new Peer(false, (msg) => this.onHostMessage(msg));
      this.hostPeer = peer;
      const answer = await peer.acceptOffer(offer);
      if (this.hostPeer !== peer) return;
      await Fb.patch(this.path('g/' + this.pid), { a: answer });
    } catch (e) { /* fica pelo servidor */ }
  }

  onHostMessage(msg) {
    this.hostSeenAt = now();
    const kind = msg[0], body = msg.slice(1);
    if (kind === 's') this.onSnap(body);
    else if (kind === 'p') this.onPs(body);
    else if (kind === 'd' && body !== this.duelSeen) { this.duelSeen = body; this.onDuel(body); }
  }

  // ------------------------------------------------------------------
  // Começar a partida
  // ------------------------------------------------------------------

  startGame() {
    if (!this.canStart()) return false;
    const s = { gid: Date.now(), diff: this.diff, mode: this.mode, list: this.roster.map((r) => ({ id: r.id, name: r.name, char: r.char })) };
    const str = JSON.stringify(s);
    Fb.put(this.path('h/start'), str).then(() => Fb.patch(this.path('h/meta'), { st: 'game' })).catch(() => {});
    this.beginGame(s);
    return true;
  }

  beginGame(s) {
    const g = this.game;
    this.gid = s.gid;
    this.inGame = true; this.ended = false;
    this.seq = 0; this.lastQ = -1; this.sendAcc = 1;
    this.ready = false; this.readyMap.clear(); this.readySlots = [];
    this.breakWave = 0; this.enemyMap.clear();
    this.lastSnapAt = 0; this.placeMe = true;
    this.phase = ''; this.pvpReadySent = false; this.duelData.clear(); this.swapInfo = null; this.myStatus = '';
    for (const r of this.roster) r.pv = '';
    this.lastShots = 0;
    if (s.mode === 'pvp') { this.beginPvpPrep(s); return; }
    g.newCoopRun(s.list, this.pid, s.diff);
    if (this.isHost()) {
      g.rec = [];
      g.onWaveEnd = () => this.hostWaveEnd();
    } else {
      g.rec = null;
      g.onWaveEnd = null;
      g.enemies = []; g.telegraphs = [];
      // o próximo "pronto" da sala de espera tem que ser marcado de novo
      this.myReady = false;
      Fb.patch(this.path('g/' + this.pid), { r: false }).catch(() => {});
    }
    this.ui.newUnlocks = '';
    this.ui.joy = null;
  }

  // ------------------------------------------------------------------
  // PvP
  // ------------------------------------------------------------------

  /** Cada um joga as 15 rodadas de preparação sozinho, no próprio aparelho. */
  beginPvpPrep(s) {
    const g = this.game;
    const me = s.list.find((x) => x.id === this.pid) || s.list[0];
    this.phase = 'prep';
    g.rec = null;
    g.onWaveEnd = null;
    g.newPvpPrep(CHARS[me.char] || CHARS[0], s.diff);
    g.player.name = this.name;
    if (this.isGuest()) { this.myReady = false; Fb.patch(this.path('g/' + this.pid), { r: false }).catch(() => {}); }
    this.ui.newUnlocks = '';
    this.ui.joy = null;
    this.sendPvStatus();
  }

  /** Terminou as 15 rodadas: manda o legume pronto pro duelo. */
  pvpReady() {
    const g = this.game;
    if (this.phase !== 'prep' || this.pvpReadySent || !g.prepFinished()) return;
    this.pvpReadySent = true;
    const data = playerToData(g.player);
    if (this.isHost()) {
      this.duelData.set(this.pid, data);
      this.tryStartDuel();
    } else {
      const msg = JSON.stringify({ gid: this.gid, pvp: 1, d: data });
      if (this.hostPeer) this.hostPeer.send('r' + msg, true);
      Fb.patch(this.path('g/' + this.pid), { rd: msg }).catch(() => {});
    }
    this.sendPvStatus();
  }

  /** Quem ainda está se preparando (nome e rodada). */
  pvpWaiting() {
    return this.roster.filter((r) => {
      if (r.id === this.pid) return !this.pvpReadySent;
      return !(r.pv && r.pv.split('|')[1] === '2');
    }).map((r) => r.name + (r.pv ? ' (rodada ' + r.pv.split('|')[0] + '/' + PVP_PREP_WAVES + ')' : ''));
  }

  /** Anfitrião: todos prontos -> sorteia a troca de atributos e abre a arena. */
  tryStartDuel() {
    if (!this.isHost() || this.phase !== 'prep') return;
    const ids = this.roster.map((r) => r.id);
    if (!ids.every((id) => this.duelData.has(id)) || ids.length < 2) return;
    const list = this.roster.map((r) => ({ id: r.id, name: r.name, data: JSON.parse(JSON.stringify(this.duelData.get(r.id))) }));
    // 2 atributos sorteados: cada um recebe os valores do próximo da lista (com 2 jogadores, é uma troca)
    const pool = SWAP_STATS.slice();
    const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const before = list.map((x) => [x.data.stats[a], x.data.stats[b]]);
    list.forEach((x, i) => {
      const from = before[(i + 1) % list.length];
      x.data.stats[a] = from[0]; x.data.stats[b] = from[1];
    });
    const msg = JSON.stringify({ gid: this.gid, diff: this.diff, swap: [a, b], before, list });
    this.duelSeen = msg;
    for (const r of this.roster) if (r.peer && r.conn) r.peer.send('d' + msg, true);
    Fb.put(this.path('h/duel'), msg).catch(() => {});
    this.onDuel(msg);
  }

  /** Todos: começa o duelo com os dados (já trocados) que o anfitrião mandou. */
  onDuel(str) {
    let d;
    try { d = JSON.parse(str); } catch (e) { return; }
    if (!d || d.gid !== this.gid || this.phase === 'duel' || !Array.isArray(d.list)) return;
    if (!d.list.some((x) => x.id === this.pid)) return;
    const g = this.game;
    this.phase = 'duel';
    this.ready = false;
    this.seq = 0; this.lastQ = -1; this.sendAcc = 1; this.placeMe = true; this.lastSnapAt = 0;
    g.newDuel(d.list, this.pid, d.diff);
    g.countdown = 6; // 3 s mostrando a troca de atributos + 3, 2, 1
    this.swapInfo = {
      stats: d.swap,
      rows: d.list.map((x, i) => ({ name: x.name, char: x.data.char, slot: i, before: d.before[i], after: [x.data.stats[d.swap[0]], x.data.stats[d.swap[1]]] })),
    };
    if (this.isHost()) { g.rec = []; g.onWaveEnd = null; } else g.rec = null;
    this.ui.popupWeapon = -1; this.ui.joy = null;
  }

  /** Depois do fim da partida: todos voltam para a sala de espera. */
  backToLobby() {
    const g = this.game;
    this.inGame = false;
    this.phase = ''; this.pvpReadySent = false; this.swapInfo = null;
    g.rec = null; g.onWaveEnd = null; g.pvp = ''; g.zone = null;
    g.state = 'LOBBY';
    if (this.isHost()) {
      // os convidados desmarcam o "pronto" quando a partida começa; vale o que está no banco
      const all = (this.mirror && this.mirror.data) || {};
      for (const r of this.roster) if (!r.host) r.ready = !!(all[r.id] && all[r.id].r);
      Fb.patch(this.path('h/meta'), { st: 'lobby' }).catch(() => {});
      this.pushRoster();
    } else {
      this.setLobbyReady(false);
    }
  }

  // ------------------------------------------------------------------
  // Intervalo entre ondas
  // ------------------------------------------------------------------

  /** Anfitrião: fim da onda, manda para cada convidado os dados dele. */
  hostWaveEnd() {
    const g = this.game;
    this.ready = false;
    this.readyMap.clear();
    for (const p of g.players) {
      if (!p.remote) continue;
      const msg = JSON.stringify({ gid: this.gid, w: g.wave, d: playerToData(p) });
      const r = this.roster.find((x) => x.id === p.id);
      if (r && r.peer) r.peer.send('p' + msg, true);
      Fb.put(this.path('h/ps/' + p.id), msg).catch(() => {});
    }
    this.sendAcc = 1;
  }

  /** Convidado: chegaram meus dados do fim da onda -> melhorias, caixas e loja. */
  onPs(str) {
    let d;
    try { d = JSON.parse(str); } catch (e) { return; }
    const g = this.game;
    if (!d || d.gid !== this.gid || !this.inGame || d.w <= this.breakWave) return;
    if (g.state === 'GAME_OVER' || g.state === 'VICTORY') return;
    if (!g.beginRemoteBreak(d.d, d.w)) { this.ui.showToast('Erro nos dados da loja.'); return; }
    this.breakWave = d.w;
    this.ready = false;
    this.ui.popupWeapon = -1;
  }

  /** Botão "Pronto" da loja (ou desfazer). */
  setReady(on) {
    const g = this.game;
    if (g.state !== 'SHOP') return;
    this.ready = on;
    this.ui.popupWeapon = -1;
    if (this.isHost()) { this.tryNextWave(); return; }
    const msg = JSON.stringify({ gid: this.gid, w: g.wave, d: on ? playerToData(g.player) : null });
    if (this.hostPeer) this.hostPeer.send('r' + msg, true);
    Fb.patch(this.path('g/' + this.pid), { rd: msg }).catch(() => {});
  }

  /** Nomes de quem ainda está escolhendo no intervalo. */
  waitingFor() {
    const g = this.game;
    if (this.isHost()) {
      const names = g.players.filter((p) => p.remote && this.readyMap.get(p.id) !== g.wave).map((p) => p.name);
      if (!this.ready) names.unshift('você');
      return names;
    }
    return g.players.filter((p) => !this.readySlots.includes(p.slot)).map((p) => (p === g.player ? 'você' : p.name));
  }

  tryNextWave() {
    const g = this.game;
    if (!this.isHost() || !this.inGame || g.state !== 'SHOP' || !this.ready) return;
    if (g.players.some((p) => p.remote && this.readyMap.get(p.id) !== g.wave)) return;
    this.ready = false;
    this.readyMap.clear();
    g.startWave(g.wave + 1);
    this.sendAcc = 1;
  }

  // ------------------------------------------------------------------
  // A cada quadro
  // ------------------------------------------------------------------

  /** Chamado pelo laço do jogo depois de atualizar a lógica. */
  tick(dt) {
    if (!this.active) return;
    const g = this.game, t = now();
    if (this.isHost()) {
      for (const r of this.roster.slice()) {
        if (r.host) continue;
        const open = !!(r.peer && r.peer.isOpen());
        if (open !== !!r.conn) { r.conn = open ? 1 : 0; this.pushRoster(); }
        if (t - r.seenAt > GUEST_TIMEOUT) this.dropGuest(r.id, r.name + ' perdeu a conexão.');
      }
      if (!this.inGame) return;
      if (this.phase === 'prep') { this.sendPvStatus(); return; }
      if (g.state === 'SHOP') this.tryNextWave();
      const relay = this.roster.some((r) => !r.host && !r.conn);
      const playing = g.state === 'PLAYING';
      this.sendAcc += dt;
      this.relayAcc += dt;
      if (this.sendAcc >= (playing ? 1 / 20 : 0.5)) {
        this.sendAcc = 0;
        const relayNow = relay && this.relayAcc >= (playing ? 1 / 10 : 0.5);
        if (relayNow) this.relayAcc = 0;
        this.sendSnap(relay, relayNow);
      }
    } else {
      if (t - this.hostSeenAt > HOST_TIMEOUT && t - this.lastSnapAt > HOST_TIMEOUT && this.phase !== 'prep') {
        this.leave('Perdemos a conexão com o anfitrião.');
        return;
      }
      if (!this.inGame && t - this.joinedAt > 12000 && !this.roster.some((r) => r.id === this.pid) && this.mirror && this.mirror.ready) {
        this.leave('Não deu pra entrar: a sala está cheia ou a partida já começou.');
        return;
      }
      if (this.phase === 'prep') { this.sendPvStatus(); return; }
      if (this.inGame && g.state === 'PLAYING') {
        const direct = !!(this.hostPeer && this.hostPeer.isOpen());
        this.sendAcc += dt;
        if (this.sendAcc >= (direct ? 1 / 20 : 1 / 10)) { this.sendAcc = 0; this.sendInput(direct); }
      }
    }
  }

  /** O anfitrião parou de mandar a arena (minimizou o jogo?). */
  hostStalled() {
    return this.isGuest() && this.inGame && this.game.state === 'PLAYING' && this.lastSnapAt > 0 && now() - this.lastSnapAt > 3000;
  }

  sendInput(direct) {
    const g = this.game, p = g.player, t = now();
    const q = ++this.inSeq;
    this.sentAt.set(q, t);
    if (this.sentAt.size > 80) this.sentAt.delete(this.sentAt.keys().next().value);
    const s = JSON.stringify({
      gid: this.gid, w: g.wave, q, tm: Math.round(t), pg: Math.round(this.ping), x: Math.round(p.x), y: Math.round(p.y),
      f: (p.facingLeft ? 1 : 0) | (p.moving ? 2 : 0) | (g.input.fire ? 4 : 0) | (this.dashSend > 0 ? 8 : 0), a: Math.round((g.input.aimAng || 0) * 100),
      lx: Math.round(p.lookX * 100), ly: Math.round(p.lookY * 100),
    });
    if (this.dashSend > 0) this.dashSend--;
    if (direct && this.hostPeer.send('i' + s, false)) return;
    this.relayPut('g/' + this.pid + '/in', s);
  }

  /** Escreve no Firebase; até 3 pedidos ao mesmo tempo (quem recebe ignora os velhos pelo número). */
  relayPut(p, value) {
    if ((this.relayBusy[p] || 0) >= 3) return;
    this.relayBusy[p] = (this.relayBusy[p] || 0) + 1;
    Fb.put(this.path(p), value).catch(() => {}).then(() => { this.relayBusy[p]--; });
  }

  /** Manda a arena: direto 20x/s; pelo servidor 10x/s (juntando os efeitos do meio). */
  sendSnap(relay, relayNow) {
    const o = this.buildSnap();
    const direct = this.roster.filter((r) => r.peer && r.conn);
    if (direct.length) {
      const s = JSON.stringify(o);
      for (const r of direct) r.peer.send('s' + s, false);
    }
    if (!relay) { this.relayEv.length = 0; return; }
    if (o.ev) for (const ev of o.ev) this.relayEv.push(ev);
    if (!relayNow) return;
    if (o.ev) o.ev = this.relayEv.length > 200 ? this.relayEv.slice(-200) : this.relayEv;
    this.relayPut('h/snap', JSON.stringify(o));
    this.relayEv = [];
  }

  /** Foto da arena, em números inteiros para ficar pequena. */
  buildSnap() {
    const g = this.game, R = Math.round;
    const ph = g.state === 'PLAYING' ? 'P' : g.state === 'VICTORY' ? 'V' : g.state === 'GAME_OVER' ? 'O' : g.state === 'DUEL_END' ? 'X' : 'B';
    const o = { gid: this.gid, q: ++this.seq, w: g.wave, ph, k: g.kills, tm: Math.round(now()) };
    // última posição recebida de cada convidado (para medir o ping)
    o.ak = this.roster.filter((r) => !r.host && r.lastInQ > 0).map((r) => {
      const p = g.players.find((x) => x.id === r.id);
      return [p ? p.slot : -1, r.lastInQ];
    });
    o.p = g.players.map((p) => {
      const a = [p.slot, R(p.x), R(p.y), Math.max(0, Math.ceil(p.hp)), p.maxHp(),
        (p.alive ? 1 : 0) | (p.iframes > 0 ? 2 : 0) | (p.facingLeft ? 4 : 0) | (p.moving ? 8 : 0),
        p.level, p.xp, p.materials, p.crates, p.shots, R(p.lookX * 100), R(p.lookY * 100)];
      // classes novas: laser (ângulo, calor, ligado, alcance, largura, feixes extras) e mirtilinhos
      let lr = 0, lw = 0;
      if (p.kind === 'laser') { const st = g.laserStats(p); lr = R(st.range); lw = R(st.width); }
      a.push(R(p.aimAng * 100), R(p.laser.heat * 100) + (p.laser.over ? 1000 : 0), p.laser.on ? 1 : 0, R(p.minionAng * 100) % 100000, lr, lw, p.cy.split);
      // classes da 4.0: crescimento, roleta, estado (renascer/dash/espelho), recargas, elemento e direção do dash
      a.push(R(p.growth * 100), p.roulette, (p.revive ? 1 : 0) | (p.dashT > 0 ? 2 : 0) | (p.mirrorCd > 0 ? 4 : 0),
        R(Math.max(0, p.shieldCd) * 10), R(Math.max(0, p.dashCd) * 10), R(p.elemT * 10) % 1500, R(p.dashX * 100), R(p.dashY * 100));
      for (const w of p.weapons) {
        const ang = w.attacking() ? Math.atan2(w.dirY, w.dirX) : w.angle;
        a.push(ALL_WEAPONS.indexOf(w.def), w.tier, R(ang * 100), R(w.tipX - p.x), R(w.tipY - p.y));
      }
      return a;
    });
    if (ph === 'X') { const w = g.players.find((p) => p.id === g.duelWinner); o.win = w ? w.slot : -1; }
    if (ph === 'P') {
      o.t = R(g.waveTime * 10); o.d = g.waveDuration; o.en = g.ending ? 1 : 0; o.bs = g.boss && !g.boss.dead ? g.boss.id : 0;
      if (g.zone) { o.z = [R(g.zone.x), R(g.zone.y), R(g.zone.r)]; o.cd = R(g.countdown * 10); }
      if (g.mines.length) { const mi = []; for (const m of g.mines) mi.push(R(m.x), R(m.y), m.arm <= 0 ? 1 : 0); o.mi = mi; }
      if (g.decoys.length) { const dc = []; for (const d of g.decoys) dc.push(R(d.x), R(d.y), R(d.t * 10)); o.dc = dc; }
      if (g.wells.length) { const gw = []; for (const w of g.wells) gw.push(R(w.x), R(w.y), R(w.t * 10)); o.gw = gw; }
      const e = [];
      for (const en of g.enemies) {
        if (en.dead) continue;
        const red = (en.def.ai === AI_CHARGE && en.aiState === 1) || ((en.def.ai === AI_BOSS_ANT || en.def.ai === AI_BOSS_BEETLE) && en.aiState === 2);
        e.push(en.id, ENEMY_DEFS.indexOf(en.def), R(en.x), R(en.y), R(1000 * Math.max(0, en.hp) / en.maxHp),
          (en.elite ? 1 : 0) | (en.facingLeft ? 2 : 0) | (en.flash > 0 ? 4 : 0) | (en.burnTime > 0 ? 8 : 0) | (en.slowTime > 0 ? 16 : 0) | (red ? 32 : 0) |
          (en.fear > 0 ? 64 : 0) | (en.freeze > 0 ? 128 : 0) | (en.acid > 0 ? 256 : 0));
      }
      o.e = e;
      const b = [];
      for (const x of g.bullets) {
        if (x.dead) continue;
        let kind = x.minion ? 99 : x.mirror ? 98 : x.source && x.source.def ? ALL_WEAPONS.indexOf(x.source.def) : -1;
        if (x.boom) kind += 200; // bumerangue da Banana
        b.push(R(x.x), R(x.y), R(x.vx / 10), R(x.vy / 10), kind);
      }
      o.b = b;
      const eb = [];
      for (const x of g.enemyBullets) if (!x.dead) eb.push(R(x.x), R(x.y), R(x.vx / 10), R(x.vy / 10));
      o.eb = eb;
      const pk = [];
      for (const x of g.pickups) if (!x.dead) pk.push(R(x.x), R(x.y), x.type * 2 + (x.value > 1 ? 1 : 0));
      o.pk = pk;
      const tg = [];
      for (const x of g.telegraphs) tg.push(R(x.x), R(x.y), ENEMY_DEFS.indexOf(x.def), R(x.time * 10));
      o.tg = tg;
      const ev = g.rec || [];
      o.ev = ev.length > 150 ? ev.slice(ev.length - 150) : ev.slice();
    } else {
      const rd = [];
      if (this.ready) rd.push(g.player.slot);
      for (const p of g.players) if (p.remote && this.readyMap.get(p.id) === g.wave) rd.push(p.slot);
      o.rd = rd;
    }
    if (g.rec) g.rec.length = 0;
    return o;
  }

  // ------------------------------------------------------------------
  // Convidado: aplica a foto da arena
  // ------------------------------------------------------------------

  onSnap(str) {
    if (!this.isGuest() || !this.inGame || typeof str !== 'string') return;
    let o;
    try { o = JSON.parse(str); } catch (e) { return; }
    if (!o || o.gid !== this.gid || o.q <= this.lastQ) return;
    this.lastQ = o.q;
    this.lastSnapAt = now();
    this.hostSeenAt = now();
    const g = this.game;
    // ping: tempo até o anfitrião confirmar a última posição que mandei
    const me = g.player;
    for (const a of o.ak || []) {
      if (!me || a[0] !== me.slot) continue;
      const sent = this.sentAt.get(a[1]);
      if (sent !== undefined) {
        const rtt = now() - sent;
        this.ping = this.ping ? this.ping * 0.85 + rtt * 0.15 : rtt;
        this.sentAt.delete(a[1]);
      }
    }
    if (o.ph === 'X') {
      if (g.state !== 'DUEL_END') {
        this.applyPlayers(o, false);
        const w = g.players.find((p) => p.slot === o.win);
        g.duelWinner = w ? w.id : '';
        g.state = 'DUEL_END';
        this.ended = true;
        g.fx.sound(w === g.player ? 'LEVEL_UP' : 'HURT');
      }
      return;
    }
    if (o.ph === 'O' || o.ph === 'V') {
      if (g.state !== 'GAME_OVER' && g.state !== 'VICTORY') {
        g.wave = o.w; g.kills = o.k;
        this.applyPlayers(o, false);
        g.state = o.ph === 'V' ? 'VICTORY' : 'GAME_OVER';
        this.ended = true;
        this.ready = false;
        g.fx.runEnded(o.ph === 'V', o.w);
      }
      return;
    }
    if (o.ph === 'B') {
      this.readySlots = o.rd || [];
      this.applyPlayers(o, false);
      return;
    }
    // onda rolando
    if (this.phase !== 'duel' && o.w > this.breakWave && (g.state !== 'PLAYING' || g.wave !== o.w)) this.enterWave(o.w);
    if (g.state !== 'PLAYING' || g.wave !== o.w) return;
    g.waveTime = o.t / 10; g.waveDuration = o.d; g.ending = !!o.en; g.kills = o.k;
    if (o.z && g.zone) { g.zone.x = o.z[0]; g.zone.y = o.z[1]; g.zone.r = o.z[2]; g.countdown = o.cd / 10; }
    g.mines = [];
    const mi = o.mi || [];
    for (let i = 0; i + 2 < mi.length; i += 3) g.mines.push({ x: mi[i], y: mi[i + 1], arm: mi[i + 2] ? 0 : 1, owner: g.player });
    g.decoys = [];
    const dc = o.dc || [];
    for (let i = 0; i + 2 < dc.length; i += 3) g.decoys.push({ x: dc[i], y: dc[i + 1], t: dc[i + 2] / 10, owner: g.player, radius: 22 });
    g.wells = [];
    const gw = o.gw || [];
    for (let i = 0; i + 2 < gw.length; i += 3) g.wells.push({ x: gw[i], y: gw[i + 1], t: gw[i + 2] / 10, owner: g.player });
    this.applyPlayers(o, true);
    this.applyWorld(o);
  }

  enterWave(n) {
    const g = this.game;
    g.wave = n;
    g.state = 'PLAYING';
    g.ending = false; g.waveTime = 0;
    g.enemies = []; g.telegraphs = []; g.bullets = []; g.enemyBullets = []; g.pickups = [];
    g.particles = []; g.texts = [];
    g.boss = null;
    this.enemyMap.clear();
    this.ready = false;
    this.placeMe = true;
    g.showBanner(g.waveBanner(n));
    this.ui.popupWeapon = -1;
    this.ui.joy = null;
  }

  applyPlayers(o, playing) {
    const g = this.game, me = g.player;
    const seen = new Set();
    for (const a of o.p || []) {
      const p = g.players.find((x) => x.slot === a[0]);
      if (!p) continue;
      seen.add(p);
      // No intervalo entre ondas, meus dados (sementes, armas, atributos) são os da MINHA loja:
      // o anfitrião só fica sabendo quando eu aperto "Pronto". Não deixa a foto dele desfazer as compras.
      if (p === me && o.ph === 'B') continue;
      const wasAlive = p.alive;
      p.hp = a[3];
      p.alive = !!(a[5] & 1);
      p.iframes = a[5] & 2 ? 0.2 : 0;
      p.level = a[6]; p.xp = a[7]; p.materials = a[8]; p.crates = a[9];
      if (p === me) {
        if (playing && (this.placeMe || (!wasAlive && p.alive))) { p.x = a[1]; p.y = a[2]; this.placeMe = false; }
        if (a[10] > this.lastShots && playing) this.game.fx.sound('SHOOT');
        this.lastShots = a[10];
      } else {
        netTrack(p, a[1], a[2], o.tm || now());
        if (playing && (Math.abs(p.x - p.tx) > 400 || Math.abs(p.y - p.ty) > 400 || this.placeMe)) { p.x = p.tx; p.y = p.ty; }
        p.facingLeft = !!(a[5] & 4); p.moving = !!(a[5] & 8);
        p.lookX = a[11] / 100; p.lookY = a[12] / 100;
      }
      p.stats[Stat.HP] = a[4] / (p.hpMult || 1); // vida máxima (sobe ao passar de nível durante a onda)
      // laser e mirtilinhos
      p.laser.heat = (a[14] % 1000) / 100; p.laser.over = a[14] >= 1000;
      if (p !== me) { p.aimAng = a[13] / 100; p.laser.on = !!a[15]; }
      p.minionAng = a[16] / 100;
      p.laserView = { range: a[17], width: a[18], split: a[19] };
      p.growth = a[20] / 100; p.radius = 26 * (1 + (p.kind === 'grow' ? p.growth * 0.5 : 0));
      p.roulette = a[21];
      p.revive = !!(a[22] & 1); p.mirrorCd = a[22] & 4 ? 1 : 0;
      p.shieldCd = a[23] / 10;
      if (p !== me) { p.dashT = a[22] & 2 ? 0.1 : 0; p.dashCd = a[24] / 10; p.dashX = a[26] / 100; p.dashY = a[27] / 100; }
      else if (!(me.dashT > 0)) me.dashCd = Math.min(me.dashCd, a[24] / 10);
      p.elemT = a[25] / 10;
      // armas (para desenhar)
      const nw = Math.floor((a.length - PH) / 5);
      if (p.weapons.length !== nw) p.weapons.length = Math.min(p.weapons.length, nw);
      for (let i = 0; i < nw; i++) {
        const k = PH + i * 5, def = ALL_WEAPONS[a[k]];
        if (!def) continue;
        let w = p.weapons[i];
        if (!w || w.def !== def) { w = new Weapon(def, a[k + 1]); w.owner = p; p.weapons[i] = w; }
        w.tier = a[k + 1];
        w.angle = a[k + 2] / 100;
        w.attackT = -1;
        w.ox = a[k + 3]; w.oy = a[k + 4];
        w.tipX = p.x + w.ox; w.tipY = p.y + w.oy;
      }
    }
    // quem saiu da partida
    if (o.p) {
      for (let i = g.players.length - 1; i >= 0; i--) {
        const p = g.players[i];
        if (!seen.has(p) && p !== me) g.players.splice(i, 1);
      }
    }
  }

  applyWorld(o) {
    const g = this.game;
    // insetos: mesmos ids deslizam até a nova posição
    const map = new Map();
    const e = o.e || [];
    g.enemies = [];
    g.boss = null;
    for (let i = 0; i + 5 < e.length; i += 6) {
      const id = e[i], def = ENEMY_DEFS[e[i + 1]];
      if (!def) continue;
      let en = this.enemyMap.get(id);
      const elite = !!(e[i + 5] & 1);
      if (!en) {
        en = { id, def, x: e[i + 2], y: e[i + 3], vx: 0, vy: 0, maxHp: 1000, hp: 1000, radius: def.radius * (elite ? 1.35 : 1),
          anim: Math.random() * 3, flash: 0, dead: false, burnTime: 0, slowTime: 0, aiState: 0, elite, facingLeft: true };
      }
      netTrack(en, e[i + 2], e[i + 3], o.tm || now());
      en.hp = e[i + 4];
      const f = e[i + 5];
      en.elite = elite;
      en.facingLeft = !!(f & 2);
      if (f & 4) en.flash = 0.08;
      en.burnTime = f & 8 ? 1 : 0;
      en.slowTime = f & 16 ? 1 : 0;
      en.aiState = f & 32 ? (def.ai === AI_CHARGE ? 1 : 2) : 0;
      en.fear = f & 64 ? 1 : 0; en.freeze = f & 128 ? 1 : 0; en.acid = f & 256 ? 1 : 0;
      map.set(id, en);
      g.enemies.push(en);
      if (id === o.bs) g.boss = en;
    }
    this.enemyMap = map;
    const b = o.b || [];
    g.bullets = [];
    for (let i = 0; i + 4 < b.length; i += 5) {
      const boom = b[i + 4] >= 150, kind = boom ? b[i + 4] - 200 : b[i + 4], wd = ALL_WEAPONS[kind] || null;
      g.bullets.push({ x: b[i], y: b[i + 1], vx: b[i + 2] * 10, vy: b[i + 3] * 10, wd, minion: kind === 99, mirror: kind === 98, boom,
        lightning: !!(wd && wd.lightning), slow: wd ? wd.slow : 0, burn: wd ? wd.burn : 0, explosion: wd ? wd.explosion : 0,
        radius: kind === 99 ? 6 : wd && (wd.explosion || wd.burn || wd.slow) ? 10 : 7, dead: false });
    }
    const eb = o.eb || [];
    g.enemyBullets = [];
    for (let i = 0; i + 3 < eb.length; i += 4) {
      g.enemyBullets.push({ x: eb[i], y: eb[i + 1], vx: eb[i + 2] * 10, vy: eb[i + 3] * 10, radius: 9, dead: false });
    }
    const pk = o.pk || [];
    g.pickups = [];
    for (let i = 0; i + 2 < pk.length; i += 3) {
      g.pickups.push({ x: pk[i], y: pk[i + 1], type: pk[i + 2] >> 1, value: pk[i + 2] & 1 ? 2 : 1, bob: (pk[i] * 7 + pk[i + 1] * 13) % 6, dead: false });
    }
    const tg = o.tg || [];
    g.telegraphs = [];
    for (let i = 0; i + 3 < tg.length; i += 4) {
      const def = ENEMY_DEFS[tg[i + 2]];
      if (def) g.telegraphs.push({ x: tg[i], y: tg[i + 1], def, time: tg[i + 3] / 10 });
    }
    // efeitos, textos e sons que aconteceram no anfitrião
    const me = g.player;
    for (const ev of o.ev || []) {
      if (!Array.isArray(ev)) continue;
      switch (ev[0]) {
        case 'b': g.burst(ev[1], ev[2], Math.min(60, ev[3] | 0), String(ev[4]), ev[5], ev[6], ev[7]); break;
        case 't': g.addText(ev[1], ev[2], String(ev[3]), String(ev[4]), ev[5]); break;
        case 'r': g.ring(ev[1], ev[2], ev[3]); break;
        case 's': if (!ev[2] || ev[2] === me.id) g.fx.sound(ev[1]); break;
        case 'v': if (!ev[2] || ev[2] === me.id) g.fx.vibrate(ev[1]); break;
        case 'k': if (!ev[2] || ev[2] === me.id) g.shake = Math.max(g.shake, ev[1]); break;
        case 'n': g.showBanner(String(ev[1])); break;
      }
    }
  }

  /** Convidado: anima tudo entre uma foto e outra (o próprio legume anda na hora). */
  guestStep(dt, jx, jy) {
    const g = this.game;
    if (g.bannerTime > 0) g.bannerTime -= dt;
    if (g.state !== 'PLAYING') return;
    g.shake = Math.max(0, g.shake - dt * 25);
    if (!g.ending && g.waveTime < g.waveDuration) g.waveTime += dt;
    const me = g.player;
    if (me.alive && !this.placeMe) g.movePlayer(me, dt, jx, jy);
    if (me.iframes > 0) me.iframes -= dt;
    me.aimAng = g.input.aimAng; me.wantFire = !!g.input.fire;
    if (me.kind === 'dash') { // Alface: o dash anda na hora aqui; o anfitrião faz o dano
      if (me.dashCd > 0) me.dashCd -= dt;
      if (me.dashT > 0) me.dashT -= dt;
      if (g.input.dash && me.alive && me.dashCd <= 0 && me.dashT <= 0) {
        const len = Math.hypot(me.lookX, me.lookY) || 1;
        me.dashX = me.lookX / len; me.dashY = me.lookY / len; me.dashT = 0.2; me.dashCd = 2.5;
        this.dashSend = 3; // manda nos próximos envios (se um se perder, outro chega)
      }
      g.input.dash = false;
    }
    if (me.kind === 'laser') me.laser.on = me.alive && me.wantFire && !me.laser.over && !g.ending && !(g.zone && g.countdown > 0);
    if (g.zone && g.countdown > 0) g.countdown -= dt;
    for (const p of g.players) {
      if (p !== me) g.followNet(p, dt);
      if (p.kind === 'minions') p.minionAng += dt * 1.8;
      for (const w of p.weapons) {
        if (w.ox === undefined) continue;
        w.tipX = p.x + w.ox; w.tipY = p.y + w.oy;
      }
    }
    for (const e of g.enemies) {
      netStep(e, dt, 0.12, 20); // prevê o movimento até a próxima foto
      e.anim += dt;
      if (e.flash > 0) e.flash -= dt;
    }
    for (const b of g.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const b of g.enemyBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const pk of g.pickups) pk.bob += dt;
    for (const t of g.telegraphs) t.time = Math.max(0, t.time - dt);
    g.updateEffects(dt);
  }
}
