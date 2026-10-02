// Comunidade: contas (salvar o progresso na nuvem), enquetes e "relatar bug".
// Tudo no mesmo Firebase Realtime Database do ranking (API REST, sem bibliotecas).
//
// Contas (sistema simples, sem e-mail):
//   users/{nome}   -> marca que o nome já tem dono (só pode ser criado uma vez)
//   saves/{chave}  -> o progresso. chave = SHA-256 de "nome + senha": só quem sabe a senha
//                     consegue calcular o endereço (e o banco não deixa listar as chaves).
// Enquetes: polls/{id} (criadas pelo dono do jogo no console) e votes/{id}/{quem} = opção.
// Relatórios: reports/{id} (só dá pra criar; quem lê é o dono do jogo, no console do Firebase).
'use strict';

/** SHA-256 em JavaScript puro (funciona até onde crypto.subtle não existe, como no app). */
function sha256(str) {
  const bytes = new TextEncoder().encode(str);
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const len = bytes.length, total = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total);
  m.set(bytes); m[len] = 0x80;
  const bits = len * 8;
  m[total - 4] = (bits >>> 24) & 255; m[total - 3] = (bits >>> 16) & 255; m[total - 2] = (bits >>> 8) & 255; m[total - 1] = bits & 255;
  m[total - 5] = Math.floor(bits / 0x100000000) & 255;
  const w = new Array(64);
  const rot = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (m[off + i * 4] << 24) | (m[off + i * 4 + 1] << 16) | (m[off + i * 4 + 2] << 8) | m[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rot(e, 6) ^ rot(e, 11) ^ rot(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const S0 = rot(a, 2) ^ rot(a, 13) ^ rot(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

const GAME_VERSION = '3.0';
const PROGRESS_KEYS = ['bestWave', 'wins', 'totalKills', 'bestDiffWon', 'gamesPlayed', 'totalSeeds', 'bestEndless'];

/** Junta o progresso de dois aparelhos: fica o maior de cada recorde. */
function mergeProgress(local, remote) {
  const out = Object.assign({}, local);
  if (!remote) return out;
  for (const k of PROGRESS_KEYS) {
    const a = Number(local[k]), b = Number(remote[k]);
    out[k] = Math.max(isNaN(a) ? -1 : a, isNaN(b) ? -1 : b);
    if (k !== 'bestDiffWon' && out[k] < 0) out[k] = 0;
  }
  out.ach = Object.assign({}, remote.ach || {}, local.ach || {});
  for (const k of Object.keys(remote.ach || {})) if (remote.ach[k]) out.ach[k] = true;
  if (!local.savedRun && typeof remote.savedRun === 'string') out.savedRun = remote.savedRun;
  return out;
}

function progressOf(d) {
  const p = {};
  for (const k of PROGRESS_KEYS) p[k] = d[k] || 0;
  p.bestDiffWon = d.bestDiffWon === undefined ? -1 : d.bestDiffWon;
  p.ach = d.ach || {};
  p.savedRun = d.savedRun || null;
  return p;
}

function validAccountName(n) { return /^[A-Za-z0-9_]{3,16}$/.test(n); }

class Account {
  constructor(prefs) {
    this.prefs = prefs;
    this.user = null;     // {name, key}
    this.status = '';     // texto curto: 'salvando...', 'salvo', 'offline'
    this.timer = null;
    try { const u = JSON.parse(localStorage.getItem('horta_conta') || 'null'); if (u && u.name && /^[0-9a-f]{64}$/.test(u.key)) this.user = u; } catch (e) { /* sem conta */ }
    prefs.onProgress = () => this.scheduleSave();
    if (this.user) this.pull().catch(() => { this.status = 'offline'; });
  }

  keyFor(name, pass) { return sha256('horta-hostil|' + name.toLowerCase() + '|' + pass); }

  remember() { try { localStorage.setItem('horta_conta', JSON.stringify(this.user)); } catch (e) { /* ignora */ } }

  netError(e, fallback) {
    if (e && (e.status === 401 || e.status === 403)) return 'O banco ainda não liberou as contas: falta publicar as regras novas do Firebase.';
    if (navigator.onLine === false) return 'Sem internet.';
    return fallback;
  }

  async register(name, pass) {
    if (!validAccountName(name)) throw new Error('Nome: 3 a 16 letras, números ou _ (sem espaço nem acento).');
    if (pass.length < 4) throw new Error('A senha precisa de pelo menos 4 caracteres.');
    const id = name.toLowerCase();
    let taken;
    try { taken = await Fb.get('users/' + id); } catch (e) { throw new Error(this.netError(e, 'Não deu pra falar com o servidor.')); }
    if (taken) throw new Error('Esse nome já tem dono. Escolha outro (ou entre na conta).');
    try {
      await Fb.put('users/' + id, { n: name, c: SERVER_TIME });
    } catch (e) {
      throw new Error(e.status === 401 ? 'Esse nome já tem dono (ou faltam as regras novas do Firebase).' : this.netError(e, 'Não deu pra criar a conta.'));
    }
    this.user = { name, key: this.keyFor(name, pass) };
    this.remember();
    this.prefs.data.playerName = name;
    this.prefs.save();
    await this.push();
  }

  async login(name, pass) {
    if (!validAccountName(name)) throw new Error('Nome ou senha incorretos.');
    const key = this.keyFor(name, pass);
    let save;
    try { save = await Fb.get('saves/' + key); } catch (e) { throw new Error(this.netError(e, 'Não deu pra falar com o servidor.')); }
    if (!save) throw new Error('Nome ou senha incorretos.');
    const real = (save.n && String(save.n)) || name;
    this.user = { name: real, key };
    this.remember();
    this.applyRemote(save);
    this.prefs.data.playerName = real;
    this.prefs.save();
    await this.push();
  }

  logout() {
    this.user = null;
    this.status = '';
    try { localStorage.removeItem('horta_conta'); } catch (e) { /* ignora */ }
  }

  applyRemote(save) {
    let remote = null;
    try { remote = JSON.parse(save.p); } catch (e) { /* estragado */ }
    if (!remote) return;
    Object.assign(this.prefs.data, mergeProgress(this.prefs.data, remote));
    this.prefs.save();
  }

  /** Baixa o progresso da nuvem e junta com o deste aparelho. */
  async pull() {
    if (!this.user) return;
    const save = await Fb.get('saves/' + this.user.key);
    if (save) this.applyRemote(save);
    this.status = 'sincronizado';
  }

  /** Envia o progresso deste aparelho. */
  async push() {
    if (!this.user) return;
    this.status = 'salvando...';
    try {
      await Fb.put('saves/' + this.user.key, { p: JSON.stringify(progressOf(this.prefs.data)), u: SERVER_TIME, n: this.user.name });
      this.status = 'salvo';
    } catch (e) {
      this.status = 'offline';
      throw e;
    }
  }

  scheduleSave() {
    if (!this.user) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push().catch(() => {}), 1500);
  }

  /** Quem está votando: a conta, ou um código aleatório deste aparelho. */
  voterId() {
    if (this.user) return 'u' + sha256('voto|' + this.user.key).slice(0, 31);
    return this.deviceId();
  }

  /** Lugar do jogador no ranking: o da conta (vale em qualquer aparelho) ou o deste aparelho. */
  rankId() {
    if (this.user) return 'a' + sha256('ranking|' + this.user.key).slice(0, 24);
    return this.deviceId();
  }

  deviceId() {
    let id = '';
    try { id = localStorage.getItem('horta_votante') || ''; } catch (e) { /* ignora */ }
    if (!/^d[a-z0-9]{15}$/.test(id)) {
      id = 'd' + Array.from({ length: 15 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
      try { localStorage.setItem('horta_votante', id); } catch (e) { /* ignora */ }
    }
    return id;
  }
}

// ---------------------------------------------------------------------------
// Enquetes
// ---------------------------------------------------------------------------

/** Enquetes que já vêm no jogo. O dono do jogo pode criar outras no Firebase (pasta "polls"). */
const DEFAULT_POLLS = [
  { id: 'proxima_novidade', q: 'Qual deve ser a próxima novidade?', o: ['Mais personagens', 'Mais chefões', 'Mapas novos', 'Mais armas', 'Modo história'] },
  { id: 'classe_nova_favorita', q: 'Qual classe nova é a melhor?', o: ['Cyborg Cebola', 'Vampiro Kiwi', 'Alien Hala', 'Melancia Minadora', 'Mirtilo Invocador', 'Coco Rolante'] },
  { id: 'dificuldade', q: 'O que você acha da dificuldade?', o: ['Fácil demais', 'No ponto certo', 'Difícil demais'] },
  { id: 'modo_favorito', q: 'Qual modo você mais joga?', o: ['Sozinho', 'Cooperativo', 'PvP', 'Infinito'] },
];

const Polls = {
  /** Lista de enquetes abertas, com a contagem de votos. */
  async load(voter) {
    let remote = null;
    try { remote = await Fb.get('polls'); } catch (e) { /* usa as que vêm no jogo */ }
    const byId = new Map(DEFAULT_POLLS.map((p) => [p.id, Object.assign({}, p)]));
    if (remote && typeof remote === 'object') {
      for (const id of Object.keys(remote)) {
        const r = remote[id];
        if (!r || typeof r.q !== 'string' || !Array.isArray(r.o)) continue;
        if (r.open === false) { byId.delete(id); continue; }
        byId.set(id, { id, q: r.q.slice(0, 120), o: r.o.slice(0, 8).map((x) => String(x).slice(0, 40)) });
      }
    }
    const list = Array.from(byId.values());
    await Promise.all(list.map(async (p) => {
      p.counts = new Array(p.o.length).fill(0);
      p.mine = -1;
      try {
        const votes = (await Fb.get('votes/' + p.id)) || {};
        for (const [who, v] of Object.entries(votes)) {
          if (v >= 0 && v < p.o.length) p.counts[v]++;
          if (who === voter) p.mine = v;
        }
      } catch (e) { p.error = true; }
    }));
    return list;
  },

  async vote(pollId, voter, option) {
    await Fb.put('votes/' + pollId + '/' + voter, option);
  },
};

// ---------------------------------------------------------------------------
// Relatar bug / sugerir melhoria
// ---------------------------------------------------------------------------

const Reports = {
  lastSent: 0,
  async send(type, message, ctxInfo, name) {
    if (Date.now() - this.lastSent < 30000) throw new Error('Espere um pouquinho antes de mandar outro.');
    const body = {
      t: type === 'ideia' ? 'ideia' : 'bug',
      m: message.slice(0, 1000),
      n: (name || '').slice(0, 16),
      v: GAME_VERSION,
      pf: IS_APP ? 'android' : 'web',
      ctx: ctxInfo.slice(0, 300),
      ua: navigator.userAgent.slice(0, 200),
      ts: SERVER_TIME,
    };
    try {
      const res = await fetch(Fb.url('reports'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    } catch (e) {
      if (e.status === 401) throw new Error('O banco ainda não liberou os relatórios: falta publicar as regras novas do Firebase.');
      throw new Error(navigator.onLine === false ? 'Sem internet.' : 'Não deu pra enviar. Tente de novo.');
    }
    this.lastSent = Date.now();
  },
};

// ---------------------------------------------------------------------------
// Telas (entram na classe Ui)
// ---------------------------------------------------------------------------

const CommunityUi = {
  openAccount() { this.game.state = 'ACCOUNT'; },

  accountCreate() {
    openForm({
      title: '👤 Criar conta', submit: 'Criar',
      fields: [
        { id: 'name', label: 'Nome (3 a 16 letras, números ou _):', maxLength: 16, value: validAccountName(this.prefs.data.playerName || '') ? this.prefs.data.playerName : '' },
        { id: 'pass', label: 'Senha (pelo menos 4 caracteres):', type: 'password', maxLength: 40, newPassword: true },
        { id: 'pass2', label: 'Repita a senha:', type: 'password', maxLength: 40, newPassword: true },
        { id: 'n', type: 'note', label: 'Anote sua senha: sem e-mail, não dá pra recuperar. O progresso deste aparelho vai junto pra conta.' },
      ],
      check: (v) => (!validAccountName(v.name) ? 'Nome: 3 a 16 letras, números ou _ (sem espaço nem acento).'
        : v.pass.length < 4 ? 'A senha precisa de pelo menos 4 caracteres.' : v.pass !== v.pass2 ? 'As senhas não são iguais.' : ''),
    }, (v) => this.account.register(v.name, v.pass).then(() => this.showToast('Conta criada! Progresso salvo na nuvem ☁️', 3)));
  },

  accountLogin() {
    openForm({
      title: '👤 Entrar na conta', submit: 'Entrar',
      fields: [
        { id: 'name', label: 'Nome da conta:', maxLength: 16 },
        { id: 'pass', label: 'Senha:', type: 'password', maxLength: 40 },
        { id: 'n', type: 'note', label: 'O progresso deste aparelho e o da conta são juntados (fica o melhor de cada).' },
      ],
      check: (v) => (!v.name || !v.pass ? 'Preencha o nome e a senha.' : ''),
    }, (v) => this.account.login(v.name.trim(), v.pass).then(() => this.showToast('Bem-vindo de volta, ' + this.account.user.name + '!', 3)));
  },

  drawAccount() {
    const cx = this.vw / 2, a = this.account, d = this.prefs.data;
    this.drawMenuBackground();
    this.text('👤 CONTA', cx, 80, 54, C.GOLD, 'center');
    const w = Math.min(820, this.vw - 60);
    this.panel(cx - w / 2, 110, w, 380);
    if (!a.user) {
      const lines = [
        'Com uma conta, seu progresso fica salvo na nuvem:',
        'recordes, personagens liberados e a partida em andamento.',
        'Dá pra continuar em outro celular ou computador (e no app).',
        'Seu nome da conta também aparece no ranking e no multiplayer.',
      ];
      lines.forEach((l, i) => this.textFit(l, cx, 170 + i * 40, 24, w - 40, i ? '#E8F5D0' : '#FFFFFF'));
      const bw = Math.min(300, (w - 80) / 2);
      this.button(cx - bw - 10, 360, bw, 88, 'Criar conta', 'ACC_CREATE', 0, C.GREEN, true, 34);
      this.button(cx + 10, 360, bw, 88, 'Entrar', 'ACC_LOGIN', 0, C.BLUE, true, 34);
    } else {
      this.text('Conectado como', cx, 165, 24, '#CFE3B8', 'center');
      this.text(a.user.name, cx, 215, 46, '#9FE8FF', 'center');
      this.text('☁️ ' + (a.status || '...'), cx, 255, 22, a.status === 'offline' ? '#FF9A8A' : '#8CF08C', 'center');
      const unlocked = this.unlockedChars().filter((u) => u).length;
      const stats = ['Melhor onda: ' + d.bestWave, 'Vitórias: ' + d.wins, 'Partidas: ' + d.gamesPlayed,
        'Insetos: ' + shortNum(d.totalKills), 'Sementes: ' + shortNum(d.totalSeeds), 'Personagens: ' + unlocked + '/' + CHARS.length];
      stats.forEach((t, i) => this.text(t, cx - w / 2 + 60 + (i % 3) * ((w - 120) / 3) + (w - 120) / 6, 305 + Math.floor(i / 3) * 34, 22, '#FFFFFF', 'center'));
      const bw = Math.min(300, (w - 80) / 2);
      this.button(cx - bw - 10, 390, bw, 76, 'Sincronizar agora', 'ACC_SYNC', 0, C.BLUE, true, 28);
      this.button(cx + 10, 390, bw, 76, 'Sair da conta', 'ACC_LOGOUT', 0, C.RED, true, 28);
    }
    this.text('Sistema simples (sem e-mail): guarde bem sua senha.', cx, 530, 19, 'rgba(255,255,255,0.6)', 'center');
    this.button(30, VH - 96, 200, 74, 'Voltar', 'MENU', 0, C.GRAY, true, 30);
  },

  // --- Enquetes ---

  openPolls() {
    this.game.state = 'POLLS';
    this.polls = { list: null, loading: true, error: '', page: 0 };
    const token = (this.pollToken = (this.pollToken || 0) + 1);
    Polls.load(this.account.voterId()).then((list) => {
      if (token !== this.pollToken) return;
      this.polls.list = list; this.polls.loading = false;
      if (list.every((p) => p.error)) this.polls.error = 'O banco ainda não liberou as enquetes (faltam as regras novas do Firebase).';
    }).catch(() => {
      this.polls.loading = false;
      this.polls.error = navigator.onLine === false ? 'Sem internet.' : 'Não deu pra carregar as enquetes.';
    });
  },

  votePoll(pi, oi) {
    const P = this.polls, p = P.list && P.list[pi];
    if (!p || p.mine === oi || p.sending) return;
    p.sending = true;
    Polls.vote(p.id, this.account.voterId(), oi).then(() => {
      if (p.mine >= 0) p.counts[p.mine]--;
      p.counts[oi]++;
      p.mine = oi;
      p.sending = false;
      this.showToast('Voto registrado! Obrigado 🗳️');
    }).catch((e) => {
      p.sending = false;
      this.showToast(e && e.status === 401 ? 'Faltam as regras novas do Firebase.' : 'Não deu pra votar. Tente de novo.', 3);
    });
  },

  drawPolls() {
    const cx = this.vw / 2, P = this.polls, vw = this.vw;
    this.drawMenuBackground();
    this.text('🗳️ ENQUETES DA COMUNIDADE', cx, 58, 42, C.GOLD, 'center');
    this.text('Vote nas melhorias que você quer ver no jogo!', cx, 92, 21, '#E8F5D0', 'center');
    if (P.loading) this.text('Carregando...', cx, 300, 30, '#E8F5D0', 'center');
    else if (P.error) this.text(P.error, cx, 300, 24, '#FF9A8A', 'center');
    else if (P.list) {
      const per = 2, pages = Math.ceil(P.list.length / per);
      P.page = clamp(P.page, 0, pages - 1);
      const w = Math.min(1100, vw - 60), x = cx - w / 2;
      P.list.slice(P.page * per, P.page * per + per).forEach((p, k) => {
        const pi = P.page * per + k;
        const y = 116 + k * 250, h = 238;
        this.panel(x, y, w, h);
        this.text(p.q, x + 24, y + 40, 26, '#FFFFFF', 'left');
        const total = p.counts.reduce((a, b) => a + b, 0);
        this.text(total + (total === 1 ? ' voto' : ' votos'), x + w - 24, y + 40, 19, '#CFE3B8', 'right');
        const cols = p.o.length > 4 ? 2 : 1, rows = Math.ceil(p.o.length / cols);
        const ow = (w - 48 - (cols - 1) * 16) / cols, oh = Math.min(42, (h - 70) / rows - 6);
        p.o.forEach((opt, oi) => {
          const ox = x + 24 + (oi % cols) * (ow + 16), oy = y + 60 + Math.floor(oi / cols) * (oh + 6);
          const frac = total ? p.counts[oi] / total : 0, mine = p.mine === oi;
          const hov = this.isHover(ox, oy, ow, oh);
          this.roundRect(ox, oy, ow, oh, 10, hov ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.35)', mine ? C.GOLD : 'rgba(255,255,255,0.2)', mine ? 3 : 1.5);
          if (frac > 0) this.roundRect(ox, oy, Math.max(12, ow * frac), oh, 10, mine ? 'rgba(255,216,74,0.35)' : 'rgba(76,175,80,0.35)');
          this.register(ox, oy, ow, oh, 'VOTE', pi * 100 + oi, true);
          this.textFit((mine ? '✔ ' : '') + opt, ox + ow / 2 - 30, oy + oh / 2 + 7, 19, ow - 100, '#FFFFFF');
          this.text(Math.round(frac * 100) + '%', ox + ow - 12, oy + oh / 2 + 7, 18, mine ? C.GOLD : '#CFE3B8', 'right');
        });
      });
      if (pages > 1) {
        this.button(cx - 150, VH - 96, 80, 74, '◀', 'POLL_PAGE', -1, C.GRAY, P.page > 0, 30);
        this.text((P.page + 1) + '/' + pages, cx, VH - 50, 24, '#FFFFFF', 'center');
        this.button(cx + 70, VH - 96, 80, 74, '▶', 'POLL_PAGE', 1, C.GRAY, P.page < pages - 1, 30);
      }
    }
    this.button(30, VH - 96, 200, 74, 'Voltar', 'MENU', 0, C.GRAY, true, 30);
    this.button(vw - 290, VH - 96, 260, 74, '💡 Sugerir ideia', 'REPORT', 1, '#7B4FB0', true, 26);
  },

  // --- Relatar bug ---

  openReport(idea) {
    const g = this.game, p = g.player;
    const where = 'estado ' + g.state + ' | ' + DIFF_NAMES[g.difficulty] + ' | onda ' + g.wave + ' | ' + (p ? p.character.name : '-') +
      (g.coop ? ' | multiplayer' + (g.pvp ? ' ' + g.pvp : '') : '') + ' | tela ' + Math.round(this.vw) + 'x' + VH + (this.touch ? ' toque' : ' mouse');
    openForm({
      title: idea ? '💡 Sugerir uma melhoria' : '🐞 Relatar um bug', submit: 'Enviar',
      fields: [
        { id: 't', label: 'Tipo:', type: 'select', options: [['bug', '🐞 Bug (algo deu errado)'], ['ideia', '💡 Ideia de melhoria']], value: idea ? 'ideia' : 'bug' },
        { id: 'm', label: 'Conte o que aconteceu (ou a sua ideia):', type: 'textarea', maxLength: 1000 },
        { id: 'n', type: 'note', label: 'Junto vão a versão do jogo e onde você estava (' + where + '). Nada de dados pessoais.' },
      ],
      check: (v) => (v.m.trim().length < 5 ? 'Escreva um pouquinho mais (pelo menos 5 letras).' : ''),
    }, (v) => Reports.send(v.t, v.m.trim(), where, this.prefs.data.playerName).then(() => this.showToast('Enviado! Valeu pela ajuda 💚', 3)));
  },
};

if (typeof Ui !== 'undefined') Object.assign(Ui.prototype, CommunityUi);
