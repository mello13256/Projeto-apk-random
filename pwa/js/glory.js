// Versão 5.1: glória e castigo.
// - Quem está em 1º lugar em TODOS os rankings 2D ganha um brilho dourado na tela e, uma vez só, o envelope do desejo.
// - Quem vence a Ascensão é desafiado ("Achas que o meu jogo é fácil?"). Se disser "Sim", libera a Ascensão Divina:
//   uma chance só. Venceu = título de Imperador pra sempre; perdeu = 7 dias sem jogar.
'use strict';

const WISH_PHONE = '910 052 169';
const BAN_DAYS = 7;
/** Ações que um jogador de castigo não pode fazer (todas as que começam uma partida). */
const BANNED_ACTIONS = ['PLAY', 'CONTINUE', 'START', 'AGAIN', 'DAILY_START', 'MP', 'MP_CREATE', 'MP_JOIN'];

const Glory = {
  // ------------------------------------------------------------------
  // Ascensão Divina
  // ------------------------------------------------------------------

  /** A Ascensão Divina aparece na lista de dificuldades (liberada e ainda não usada)? */
  divineOpen() { const d = this.prefs.data; return !!d.divineUnlocked && !d.divineUsed; },
  /** Quantas dificuldades dá pra escolher no "Novo jogo". */
  diffCount() { return RANKED_DIFFS + (this.divineOpen() ? 1 : 0); },

  /** Milissegundos de castigo que faltam (0 = pode jogar). */
  bannedLeft() { return Math.max(0, (Number(this.prefs.data.banUntil) || 0) - Date.now()); },
  banText() {
    const hours = Math.ceil(this.bannedLeft() / 3600000), d = Math.floor(hours / 24), h = hours % 24;
    return d > 0 ? d + (d > 1 ? ' dias' : ' dia') + (h > 0 ? ' e ' + h + ' h' : '') : h + (h > 1 ? ' horas' : ' hora');
  },
  /** true = a ação foi barrada pelo castigo. */
  blockedByBan(action) {
    if (!BANNED_ACTIONS.includes(action) || !this.bannedLeft()) return false;
    this.showToast('🔒 Você perdeu na Ascensão Divina. Volte a jogar em ' + this.banText() + '.', 4);
    this.sfx.play('ERROR');
    return true;
  },

  /** Começou a Ascensão Divina: a chance já foi gasta (fechar o jogo no meio conta como derrota). */
  beginDivine() {
    const d = this.prefs.data;
    d.divineUsed = 1; d.divineActive = 1;
    this.prefs.save();
    this.toastTime = 0;
    if (this.prefs.onProgress) this.prefs.onProgress();
  },

  /** Fim da Ascensão Divina (chamado antes de gravar os recordes). */
  endDivine(won) {
    const d = this.prefs.data;
    d.divineActive = 0; d.divineUsed = 1;
    if (this.difficulty === DIFF_DIVINE) this.difficulty = DIFF_ASCENT; // a Divina some da lista
    if (won) { d.emperor = 1; this.postCrown(); }
    else d.banUntil = Date.now() + BAN_DAYS * 86400000;
    this.prefs.save();
  },

  /** Imperador: grava no servidor (as regras só aceitam com o bilhete da Divina de 20 ondas atrás). */
  postCrown() {
    const d = this.prefs.data, id = this.account.rankId(), name = d.playerName && Ranking.validName(d.playerName) ? d.playerName : 'Imperador';
    if (!this.emperors) this.emperors = new Set();
    this.emperors.add(id);
    Ranking.crown(id, name).then(() => { d.emperorPosted = 1; this.prefs.save(); }, () => {});
  },

  // ------------------------------------------------------------------
  // Começo do jogo: castigo pendente, imperadores e "1º em tudo"
  // ------------------------------------------------------------------

  startGlory() {
    const d = this.prefs.data;
    if (d.divineActive) this.endDivine(false); // fechou o jogo no meio da Divina: perdeu
    if (d.emperor && !d.emperorPosted) this.postCrown();
    this.gloryAt = this.time;
    this.loadEmperors();
    this.checkTopAll();
  },

  loadEmperors() {
    Ranking.emperors().then((ids) => {
      this.emperors = new Set(ids);
      if (this.prefs.data.emperor) this.emperors.add(this.account.rankId());
    }, () => {});
  },
  isEmp(id) { return !!(id && this.emperors && this.emperors.has(id)); },
  /** Eu sou Imperador? */
  meEmp() { return !!this.prefs.data.emperor; },

  /** Confere se este jogador é o 1º de todos os rankings 2D (Fácil até Ascensão). */
  checkTopAll() {
    const id = this.account.rankId(), d = this.prefs.data;
    const lists = [];
    for (let k = 0; k < RANKED_DIFFS; k++) lists.push(Ranking.top(k, false));
    Promise.all(lists).then((all) => {
      const top = all.every((l) => l.length && l[0].id === id) ? 1 : 0;
      if (top !== (d.topAll | 0)) { d.topAll = top; this.prefs.save(); }
      if (top) this.gloryAt = this.time;
    }, () => { /* sem internet: fica o que estava guardado */ });
  },

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------

  /** Brilho dourado em volta da tela (1º em todos os rankings). */
  drawGlow() {
    const ctx = this.ctx, vw = this.vw, t = this.time;
    const fresh = Math.max(0, 1 - (t - (this.gloryAt || 0)) / 4); // mais forte logo que entra
    const a = 0.32 + 0.12 * Math.sin(t * 2.2) + fresh * 0.35, w = 54 + fresh * 30;
    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(255,210,60,${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(255,210,60,0)');
      ctx.fillStyle = gr; ctx.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, 0, w, 0, 0, vw, w);
    edge(0, VH, 0, VH - w, 0, VH - w, vw, w);
    edge(0, 0, w, 0, 0, 0, w, VH);
    edge(vw, 0, vw - w, 0, vw - w, 0, w, VH);
    for (let i = 0; i < 10; i++) { // brilhinhos passeando pela borda
      const p = ((t * 0.07 + i / 10) % 1) * 2 * (vw + VH), x = p < vw ? p : p < vw + VH ? vw : p < 2 * vw + VH ? 2 * vw + VH - p : 0;
      const y = p < vw ? 0 : p < vw + VH ? p - vw : p < 2 * vw + VH ? VH : 2 * (vw + VH) - p;
      this.sparkle(clamp(x, 14, vw - 14), clamp(y, 14, VH - 14), 9 + 4 * Math.sin(t * 6 + i), 'rgba(255,240,150,0.9)');
    }
  },

  /** Janelas do menu: o envelope do desejo e o desafio de quem venceu a Ascensão. */
  menuModal() {
    const d = this.prefs.data;
    if (d.topAll && !d.wishShown) return 'wish';
    if (d.ascentWon && !d.askedEasy) return 'easy';
    return '';
  },
  drawMenuModal() {
    const m = this.menuModal();
    if (!m) return;
    const vw = this.vw, cx = vw / 2, t = this.time;
    this.backdrop('NOOP');
    if (m === 'wish') {
      const w = Math.min(760, vw - 60), h = 520, x = cx - w / 2, y = VH / 2 - h / 2;
      this.roundRect(x, y, w, h, 26, '#FFF6DA', C.GOLD, 6);
      this.roundRect(x + 14, y + 14, w - 28, h - 28, 20, null, 'rgba(184,134,11,0.5)', 2);
      this.emoji(Math.floor(t * 1.5) % 2 ? '💌' : '✉️', cx, y + 92 + Math.sin(t * 3) * 6, 120);
      this.text('🏆 PARABÉNS! 🏆', cx, y + 196, 46, '#B8860B', 'center');
      this.textFit('Você está em 1º lugar em TODOS os rankings do jogo!', cx, y + 246, 26, w - 60, '#5A3A10');
      this.textFit('Por isso, você tem direito a um DESEJO.', cx, y + 290, 28, w - 60, '#8B2E00');
      this.textFit('Basta mandar o seu desejo pelo WhatsApp para o número:', cx, y + 336, 22, w - 60, '#5A3A10');
      this.text('📱 ' + WISH_PHONE, cx, y + 398, 48, '#1B7A3A', 'center');
      this.button(cx - 120, y + h - 86, 240, 64, 'Guardar no coração', 'WISH_OK', 0, C.GREEN, true, 24);
      return;
    }
    const w = Math.min(720, vw - 60), h = 360, x = cx - w / 2, y = VH / 2 - h / 2;
    this.roundRect(x, y, w, h, 26, 'rgba(20,14,30,0.97)', '#C77DFF', 5);
    this.emoji('😏', cx, y + 74, 80);
    this.textFit('Achas que o meu jogo é fácil?', cx, y + 170, 44, w - 50, '#FFFFFF');
    this.text('(você venceu a Ascensão...)', cx, y + 206, 20, 'rgba(255,255,255,0.6)', 'center');
    this.button(cx - 250, y + h - 110, 230, 80, 'Sim', 'EASY_YES', 0, C.RED, true, 36);
    this.button(cx + 20, y + h - 110, 230, 80, 'Não', 'EASY_NO', 0, C.GREEN, true, 36);
  },

  /** Ações das janelas (chamado no doAction). */
  gloryAction(action) {
    const d = this.prefs.data;
    switch (action) {
      case 'NOOP': return true;
      case 'WISH_OK': d.wishShown = 1; this.prefs.save(); return true;
      case 'EASY_YES':
        d.askedEasy = 1; d.divineUnlocked = 1; this.prefs.save();
        if (this.prefs.onProgress) this.prefs.onProgress();
        this.sfx.play('LEVEL_UP');
        this.showToast('☀️ Então prove: a ASCENSÃO DIVINA foi liberada (Novo jogo → dificuldade). Uma chance só!', 7);
        return true;
      case 'EASY_NO':
        d.askedEasy = 1; this.prefs.save();
        if (this.prefs.onProgress) this.prefs.onProgress();
        this.showToast('Ainda bem que você sabe. 😄', 3);
        return true;
    }
    return false;
  },

  /** Faixa no menu: castigo ou saudação ao Imperador (no lugar da frase de baixo do título). */
  menuSubtitle() {
    if (this.bannedLeft()) return ['🔒 Você perdeu na Ascensão Divina: volte a jogar em ' + this.banText() + '.', '#FF8A7A'];
    if (this.meEmp()) return ['👑 Salve, ' + (this.prefs.data.playerName || 'Imperador') + ', Imperador da Horta!', C.GOLD];
    return null;
  },

  /** Aviso na escolha do legume quando a Ascensão Divina está selecionada. */
  drawDivineWarning(x, y, w) {
    const a = 0.75 + 0.25 * Math.sin(this.time * 6);
    this.roundRect(x, y, w, 46, 14, `rgba(120,0,0,${(0.85 * a).toFixed(2)})`, '#FF5A5A', 3);
    this.textFit('⚠️ SE VOCÊ PERDER AQUI A SUA CONTA SERÁ APAGADA ⚠️  •  uma chance só, sem salvar', x + w / 2, y + 31, 22, w - 30, '#FFFFFF');
  },

  /** Nome + título (Imperador) para placares e multiplayer. */
  titled(name, emp) { return emp ? name + ' 👑' : name; },
  /** Nome alinhado à esquerda + o título "👑 Imperador" depois dele (encurta se não couber até maxRight). */
  nameTag(name, x, y, size, maxRight, color, emp) {
    let s = size;
    while (s > 12 && x + this.measure(name, s) > maxRight) s--;
    this.text(name, x, y, s, color, 'left');
    if (!emp) return;
    const nx = x + this.measure(name, s) + 8, ts = Math.round(s * 0.75);
    const tag = nx + this.measure('👑 Imperador', ts) <= maxRight ? '👑 Imperador' : '👑';
    this.text(tag, nx, y, ts, C.GOLD, 'left');
  },
};

if (typeof Ui !== 'undefined') Object.assign(Ui.prototype, Glory);
