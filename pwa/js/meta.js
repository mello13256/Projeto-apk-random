// Telas da versão 4.0: Desafio do Dia, conquistas, build do ranking, conjuntos na loja
// e o HUD das classes novas. Entra no Ui como "mixin" (igual ao art.js e community.js).
'use strict';

/** Hora que falta pro próximo desafio (o dia vira à meia-noite UTC). */
function dailyTimeLeft() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const m = Math.max(0, Math.floor((next - now.getTime()) / 60000));
  return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
}

const MetaUi = {
  // ------------------------------------------------------------------
  // Desafio do Dia
  // ------------------------------------------------------------------

  openDaily() {
    this.newUnlocks = '';
    this.game.state = 'DAILY';
    this.loadDailyRank();
  },

  loadDailyRank() {
    const ch = dailyChallenge();
    const r = this.dailyRank = { date: ch.date, loading: true, entries: null, error: '' };
    Ranking.topAt(Ranking.dailyUrl(ch.date)).then((list) => {
      if (this.dailyRank !== r) return;
      r.entries = list; r.loading = false;
    }).catch(() => {
      if (this.dailyRank !== r) return;
      r.loading = false;
      r.error = navigator.onLine === false ? 'Sem internet.' : 'Não deu pra carregar o ranking de hoje.';
    });
  },

  startDaily() {
    const ch = dailyChallenge();
    this.prefs.clearRun();
    this.game.newRun(CHARS[ch.char], ch.diff, ch);
    this.joy = null;
  },

  drawDaily() {
    const vw = this.vw, cx = vw / 2, d = this.prefs.data;
    const ch = dailyChallenge(), cd = CHARS[ch.char];
    this.drawMenuBackground();
    this.text('📅 DESAFIO DO DIA', cx, 60, 46, C.GOLD, 'center');
    this.text('Todo mundo joga o mesmo desafio hoje (' + ch.date.split('-').reverse().join('/') + ')  •  novo desafio em ' + dailyTimeLeft(), cx, 94, 20, '#E8F5D0', 'center');
    const lw = Math.min(520, (vw - 90) / 2), lx = 30, top = 116, h = 470;
    this.panel(lx, top, lw, h);
    this.drawHero(cd, lx + 90, top + 96, 120, { lookX: Math.cos(this.time), lookY: 0.2, bob: Math.sin(this.time * 3) * 0.03 });
    this.textFit(cd.name, lx + 170 + (lw - 190) / 2, top + 64, 30, lw - 190, C.GOLD);
    this.textFit(cd.tagline, lx + 170 + (lw - 190) / 2, top + 96, 18, lw - 190, '#CFE3B8');
    this.textFit(DIFF_ICONS[ch.diff] + ' ' + DIFF_NAMES[ch.diff] + '  •  ' + DAILY_WAVES + ' ondas', lx + 170 + (lw - 190) / 2, top + 134, 22, lw - 190, DIFF_COLORS[ch.diff]);
    if (!isUnlocked(cd, d)) this.textFit('🔓 Hoje dá pra jogar com ele mesmo bloqueado!', lx + lw / 2, top + 190, 19, lw - 30, '#9FE8FF');
    this.roundRect(lx + 20, top + 206, lw - 40, 92, 14, 'rgba(255,120,60,0.18)', 'rgba(255,170,90,0.6)', 2);
    this.text('⚡ Regra de hoje', lx + lw / 2, top + 236, 20, '#FFC870', 'center');
    this.textFit(ch.mod.text, lx + lw / 2, top + 274, 22, lw - 70, '#FFFFFF');
    this.wrapped('⭐ ' + cd.ability, lx + 26, top + 330, lw - 52, 17, '#E8F5D0', 'left');
    const b = d.dailyBest && d.dailyBest.date === ch.date ? d.dailyBest : null;
    this.textFit(b ? 'Seu melhor hoje: ' + (b.won ? '🏆 venceu' : 'onda ' + b.wave) + ', ' + b.kills + ' insetos' : 'Você ainda não jogou hoje. Pode tentar quantas vezes quiser!',
      lx + lw / 2, top + h - 96, 19, lw - 30, b ? C.GOLD : '#CFE3B8');
    this.button(lx + 20, top + h - 80, lw - 40, 66, b ? 'TENTAR DE NOVO' : 'JOGAR O DESAFIO', 'DAILY_START', 0, C.GREEN, true, 30);
    // ranking de hoje
    const rx = lx + lw + 30, rw = vw - 30 - rx, r = this.dailyRank || {};
    this.panel(rx, top, rw, h);
    this.text('🏆 Ranking de hoje', rx + rw / 2, top + 42, 26, C.GOLD, 'center');
    this.drawRankRows(r, rx + 14, top + 62, rw - 28, 10, 38, 'daily');
    this.button(30, VH - 96, 200, 74, 'Voltar', 'MENU', 0, C.GRAY, true, 30);
    this.button(vw - 230, VH - 96, 200, 74, 'Atualizar', 'DAILY_REFRESH', 0, C.GRAY, !r.loading, 28);
    this.text('Jogar em dias diferentes libera o Pêssego Apostador e conquistas.', cx, VH - 50, 17, 'rgba(255,255,255,0.6)', 'center');
    if (!this.touch) this.text('Enter: jogar  •  Esc: voltar', cx, VH - 24, 16, 'rgba(255,255,255,0.45)', 'center');
    if (this.rankView) this.drawRankView();
  },

  /** Linhas de um ranking (usado na tela de ranking e no Desafio do Dia). */
  drawRankRows(r, x, y, w, n, rowH, src) {
    if (r.loading) { this.text('Carregando...', x + w / 2, y + 120, 26, '#E8F5D0', 'center'); return; }
    if (r.error) { this.textFit(r.error, x + w / 2, y + 120, 22, w - 20, '#FF9A8A'); return; }
    if (!r.entries || !r.entries.length) {
      this.text('Ninguém ainda.', x + w / 2, y + 110, 26, '#E8F5D0', 'center');
      this.text('Seja o primeiro!', x + w / 2, y + 146, 22, '#CFE3B8', 'center');
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    r.entries.slice(0, n).forEach((e, i) => {
      const ry = y + i * rowH;
      const mine = e.id === this.rank.myId;
      const hov = this.isHover(x, ry, w, rowH - 4);
      if (mine) this.roundRect(x - 4, ry, w + 8, rowH - 4, 10, 'rgba(255,216,74,0.25)', C.GOLD, 2);
      else if (hov) this.roundRect(x - 4, ry, w + 8, rowH - 4, 10, 'rgba(255,255,255,0.08)');
      if (i < 3) this.emoji(medals[i], x + 18, ry + rowH / 2 - 2, rowH * 0.7);
      else this.text((i + 1) + 'º', x + 18, ry + rowH / 2 + 6, 18, '#CFE3B8', 'center');
      const ch = CHARS[e.character];
      if (ch) this.emoji(ch.icon, x + 52, ry + rowH / 2 - 2, rowH * 0.7);
      const right = x + w - (e.b ? 34 : 6);
      this.text(e.won ? '🏆' : 'Onda ' + e.wave, right - 70, ry + rowH / 2 + 6, 17, e.won ? C.GOLD : '#E8F5D0', 'right');
      this.text(shortNum(e.kills) + ' 🐛', right, ry + rowH / 2 + 6, 16, '#CFE3B8', 'right');
      this.textFit(String(e.name || '?').slice(0, 16), x + 74 + (right - 150 - x - 74) / 2, ry + rowH / 2 + 7, 19, right - 150 - x - 74, mine ? C.GOLD : '#FFFFFF');
      if (e.b) this.emoji('🔍', x + w - 14, ry + rowH / 2 - 2, 20);
      this.register(x, ry, w, rowH - 4, 'RANK_VIEW', (src === 'daily' ? 100 : 0) + i, true);
    });
  },

  // ------------------------------------------------------------------
  // Build de uma partida do ranking
  // ------------------------------------------------------------------

  drawRankView() {
    const e = this.rankView, b = Ranking.parseBuild(e.b);
    this.backdrop('RANK_CLOSE');
    const w = Math.min(760, this.vw - 40), h = 500, x = this.vw / 2 - w / 2, y = VH / 2 - h / 2;
    this.panel(x, y, w, h);
    const ch = CHARS[e.character];
    if (ch) this.drawHero(ch, x + 70, y + 74, 84, { lookX: 0.5, lookY: 0.2 });
    this.textFit(String(e.name || '?'), x + 130 + (w - 160) / 2, y + 54, 32, w - 160, C.GOLD);
    this.textFit((ch ? ch.name + '  •  ' : '') + (e.won ? '🏆 Venceu' : 'Onda ' + e.wave) + '  •  ' + e.kills + ' insetos' + (e.level ? '  •  nível ' + e.level : ''),
      x + 130 + (w - 160) / 2, y + 90, 20, w - 160, '#E8F5D0');
    if (!b) {
      this.wrapped('Essa partida é de uma versão antiga do jogo e não guardou a build.', x + w / 2, y + 200, w - 80, 22, '#CFE3B8', 'center');
    } else {
      this.text('Armas', x + 30, y + 146, 22, '#FFFFFF', 'left');
      b.weapons.forEach((wp, i) => {
        const s = 70, sx = x + 30 + i * (s + 10), sy = y + 158;
        this.card(sx, sy, s, s, wp.tier, false);
        this.emoji(wp.def.icon, sx + s / 2, sy + s / 2 - 6, s * 0.55);
        this.text(TIER_NAMES[wp.tier], sx + s / 2, sy + s - 6, 15, TIER_COLOR[wp.tier], 'center');
      });
      if (!b.weapons.length) this.text('—', x + 40, y + 200, 22, '#CFE3B8', 'left');
      const total = b.items.reduce((a, q) => a + q.n, 0);
      this.text('Itens (' + total + ')', x + 30, y + 262, 22, '#FFFFFF', 'left');
      const s = 46, per = Math.floor((w - 60 + 6) / (s + 6));
      b.items.slice(0, per * 4).forEach((q, i) => {
        const ix = x + 30 + (i % per) * (s + 6), iy = y + 274 + Math.floor(i / per) * (s + 6);
        this.card(ix, iy, s, s, q.it.tier, false);
        this.itemIcon(q.it, ix + s / 2, iy + s / 2, s * 0.7);
        if (q.n > 1) this.text('x' + q.n, ix + s - 3, iy + s - 3, 15, '#FFFFFF', 'right');
        this.register(ix, iy, s, s, 'ITEM', q.it, true);
        const pinned = this.tipItem === q.it && this.tipTime > 0;
        if (pinned || (!this.touch && this.isHover(ix, iy, s, s))) this.tooltip(q.it, ix, iy + s + 6);
      });
      // conjuntos ativos dessa build
      const counts = {};
      for (const q of b.items) for (const t of q.it.tags || []) counts[t] = (counts[t] || 0) + q.n;
      for (const wp of b.weapons) { const t = WEAPON_TAGS.get(wp.def); if (t) counts[t] = (counts[t] || 0) + 1; }
      const act = SET_KEYS.filter((k) => counts[k] >= 3).map((k) => SETS[k].icon + ' ' + SETS[k].name + ' ' + (counts[k] >= 5 ? 'II' : 'I'));
      if (act.length) this.textFit('Conjuntos: ' + act.join('  •  '), x + w / 2, y + h - 84, 18, w - 40, '#FFE08A');
    }
    this.button(x + w / 2 - 100, y + h - 70, 200, 56, 'Fechar', 'RANK_CLOSE', 0, C.GRAY, true, 24);
  },

  // ------------------------------------------------------------------
  // Conquistas
  // ------------------------------------------------------------------

  drawAchievements() {
    const vw = this.vw, cx = vw / 2, d = this.prefs.data;
    this.drawMenuBackground();
    const done = ACHIEVEMENTS.filter((a) => achDone(a, d) || d.achDone[a.id]).length;
    this.text('🏅 CONQUISTAS', cx, 58, 46, C.GOLD, 'center');
    const bw = Math.min(520, vw - 80);
    this.bar(cx - bw / 2, 76, bw, 22, done / ACHIEVEMENTS.length, C.GOLD, 'rgba(0,0,0,0.45)');
    this.text(done + ' / ' + ACHIEVEMENTS.length + ' concluídas', cx, 94, 17, '#FFFFFF', 'center');
    const per = 14, pages = Math.ceil(ACHIEVEMENTS.length / per);
    this.achPage = Math.max(0, Math.min(pages - 1, this.achPage || 0));
    const list = ACHIEVEMENTS.slice(this.achPage * per, this.achPage * per + per);
    const gap = 14, colW = (vw - 60 - gap) / 2, rowH = 66, y0 = 112;
    list.forEach((a, i) => {
      const x = 30 + Math.floor(i / 7) * (colW + gap), y = y0 + (i % 7) * (rowH + 6);
      const v = achValue(a, d), ok = v >= a.goal || d.achDone[a.id];
      this.roundRect(x, y, colW, rowH, 14, ok ? 'rgba(80,110,30,0.75)' : 'rgba(0,0,0,0.42)', ok ? C.GOLD : 'rgba(255,255,255,0.18)', ok ? 3 : 2);
      this.ctx.globalAlpha = ok ? 1 : 0.55;
      this.emoji(a.icon, x + 36, y + rowH / 2, 40);
      this.ctx.globalAlpha = 1;
      const tx = x + 68, tw = colW - 68 - 14, barW = Math.min(200, tw * 0.4);
      this.textFit(a.name, tx + (tw - barW - 12) / 2, y + 28, 21, tw - barW - 12, ok ? C.GOLD : '#FFFFFF');
      this.textFit(a.desc, tx + (tw - barW - 12) / 2, y + 52, 15, tw - barW - 12, '#CFE3B8');
      const bx = x + colW - 14 - barW;
      this.bar(bx, y + 18, barW, 20, (ok ? a.goal : v) / a.goal, ok ? '#8CF08C' : '#E8B04A', 'rgba(0,0,0,0.5)');
      this.text(ok ? '✔ feito' : shortNum(v) + ' / ' + shortNum(a.goal), bx + barW / 2, y + 56, 15, ok ? '#8CF08C' : '#FFFFFF', 'center');
    });
    this.button(30, VH - 96, 200, 74, 'Voltar', 'MENU', 0, C.GRAY, true, 30);
    if (pages > 1) {
      this.button(vw - 330, VH - 96, 140, 74, '◀', 'ACH_PAGE', -1, C.GRAY, this.achPage > 0, 30);
      this.button(vw - 170, VH - 96, 140, 74, '▶', 'ACH_PAGE', 1, C.GRAY, this.achPage < pages - 1, 30);
    }
    this.textFit((pages > 1 ? 'Página ' + (this.achPage + 1) + '/' + pages + '   •   ' : '') + 'Vitórias na grade (legume × dificuldade): ' + gridWins(d) + ' / ' + CHARS.length * 5,
      (250 + vw - 350) / 2, VH - 52, 19, vw - 620, '#E8F5D0');
  },

  /** Fim de partida: conquistas que acabaram de sair (ou as mais perto de sair). */
  drawEndAchievements(x, y, w) {
    const d = this.prefs.data, fresh = this.newAch || [];
    if (fresh.length) {
      this.text('🏅 Conquista' + (fresh.length > 1 ? 's' : '') + ' nova' + (fresh.length > 1 ? 's' : '') + '!', x, y, 22, C.GOLD, 'left');
      fresh.slice(0, 3).forEach((a, i) => {
        const ry = y + 14 + i * 40;
        this.roundRect(x, ry, w, 34, 10, 'rgba(80,110,30,0.75)', C.GOLD, 2);
        this.emoji(a.icon, x + 20, ry + 17, 24);
        this.textFit(a.name + ' — ' + a.desc, x + 38 + (w - 46) / 2, ry + 24, 17, w - 46, '#FFFFFF');
      });
      return;
    }
    const next = ACHIEVEMENTS.filter((a) => !achDone(a, d) && !d.achDone[a.id])
      .sort((a, b) => achValue(b, d) / b.goal - achValue(a, d) / a.goal).slice(0, 3);
    if (!next.length) return;
    this.text('🏅 Quase lá', x, y, 20, '#E8F5D0', 'left');
    next.forEach((a, i) => {
      const ry = y + 14 + i * 40, v = achValue(a, d);
      this.roundRect(x, ry, w, 34, 10, 'rgba(0,0,0,0.4)');
      this.emoji(a.icon, x + 20, ry + 17, 22);
      this.textFit(a.name, x + 38 + (w - 170) / 2, ry + 23, 16, w - 170, '#FFFFFF');
      this.bar(x + w - 124, ry + 9, 114, 16, v / a.goal, '#E8B04A', 'rgba(0,0,0,0.5)');
      this.text(shortNum(v) + '/' + shortNum(a.goal), x + w - 67, ry + 22, 12, '#FFFFFF', 'center');
    });
  },

  // ------------------------------------------------------------------
  // Grade de vitórias (legume × dificuldade)
  // ------------------------------------------------------------------

  winDots(ci, cx, y, r) {
    const mask = (this.prefs.data.winsByChar || {})[ci] || 0;
    const n = DIFF_INFERNO + 1, step = r * 2 + 3;
    for (let k = 0; k < n; k++) {
      const x = cx + (k - (n - 1) / 2) * step;
      if (mask & (1 << k)) this.circle(x, y, r, DIFF_COLORS[k]);
      else { this.circle(x, y, r, 'rgba(0,0,0,0.5)'); this.ctx.strokeStyle = 'rgba(255,255,255,0.25)'; this.ctx.lineWidth = 1; this.ctx.stroke(); }
    }
  },

  // ------------------------------------------------------------------
  // Conjuntos (sinergias) na loja
  // ------------------------------------------------------------------

  /** Quantos itens/armas de cada família o jogador tem. */
  tagCountsOf(p) { return p.tagCounts || {}; },

  /** Etiquetas de família numa oferta da loja, com quanto falta pro próximo bônus. */
  drawOfferTags(o, x, y, w) {
    const p = this.game.player, counts = this.tagCountsOf(p);
    const tags = o.item ? o.item.tags || [] : o.weapon && WEAPON_TAGS.get(o.weapon) ? [WEAPON_TAGS.get(o.weapon)] : [];
    let cx = x;
    for (const t of tags) {
      const set = SETS[t], have = counts[t] || 0, after = have + 1;
      const hits = after === 3 || after === 5;
      const label = set.icon + ' ' + have + '→' + after + (after <= 5 ? '/' + (after <= 3 ? 3 : 5) : '');
      const tw = this.measure(label, 15) + 14;
      if (cx + tw > x + w) break;
      const pulse = hits ? 0.6 + 0.4 * Math.sin(this.time * 6) : 1;
      this.roundRect(cx, y, tw, 24, 10, hits ? `rgba(255,200,40,${(0.45 * pulse).toFixed(2)})` : 'rgba(0,0,0,0.4)', hits ? C.GOLD : 'rgba(255,255,255,0.25)', hits ? 2 : 1);
      this.text(label, cx + 7, y + 18, 15, hits ? '#FFFFFF' : '#E8F5D0', 'left');
      this.register(cx, y, tw, 24, 'SET_TIP', t, true);
      if (!this.touch && this.isHover(cx, y, tw, 24)) this.setTooltip(t, cx, y + 30);
      cx += tw + 6;
    }
    return tags.length ? 30 : 0;
  },

  setTooltip(t, x, y) {
    const set = SETS[t], have = this.tagCountsOf(this.game.player)[t] || 0;
    const lines = [[set.icon + ' Conjunto ' + set.name + ' (' + have + ' agora)', C.GOLD],
      ['3 coisas: ' + setBonusText(set.b3), have >= 3 ? '#8CF08C' : '#E0E0E0'],
      ['5 coisas: ' + setBonusText(set.b5), have >= 5 ? '#8CF08C' : '#E0E0E0']];
    const w = Math.max(...lines.map((l) => this.measure(l[0], 17))) + 24, h = lines.length * 24 + 14;
    x = Math.max(10, Math.min(x, this.vw - w - 10));
    if (y + h > VH) y -= h + 40;
    this.deferred = () => {
      this.roundRect(x, y, w, h, 10, 'rgba(15,15,15,0.95)', C.GOLD, 2);
      lines.forEach(([l, c], i) => this.text(l, x + 12, y + 28 + i * 24, 17, c, 'left'));
    };
  },

  /** Conjuntos que o jogador já tem (ou está perto de ter), em cima da lista de itens. */
  drawActiveSets(x, y, w) {
    const p = this.game.player, counts = this.tagCountsOf(p);
    const keys = SET_KEYS.filter((k) => counts[k] >= 2).sort((a, b) => counts[b] - counts[a]);
    let cx = x;
    for (const k of keys) {
      const n = counts[k], lvl = n >= 5 ? 'II' : n >= 3 ? 'I' : '';
      const label = SETS[k].icon + ' ' + (lvl ? SETS[k].name + ' ' + lvl : n + '/3');
      const tw = this.measure(label, 15) + 14;
      if (cx + tw > x + w) break;
      this.roundRect(cx, y - 19, tw, 24, 10, lvl ? 'rgba(90,130,30,0.85)' : 'rgba(0,0,0,0.4)', lvl ? C.GOLD : 'rgba(255,255,255,0.25)', lvl ? 2 : 1);
      this.text(label, cx + 7, y - 1, 15, '#FFFFFF', 'left');
      this.register(cx, y - 19, tw, 24, 'SET_TIP', k, true);
      if ((!this.touch && this.isHover(cx, y - 19, tw, 24)) || (this.tipSet === k && this.tipTime > 0)) this.setTooltip(k, cx, y + 10);
      cx += tw + 6;
    }
  },

  // ------------------------------------------------------------------
  // HUD das classes novas
  // ------------------------------------------------------------------

  dashButton() {
    const s = 110;
    return { x: this.vw - s - 40, y: VH - s - 70, s };
  },

  drawClassHud(p) {
    const g = this.game, vw = this.vw;
    let line = '', color = '#FFE08A';
    switch (p.kind) {
      case 'dash': {
        const ready = p.dashCd <= 0;
        if (this.touch) {
          const b = this.dashButton();
          this.circle(b.x + b.s / 2, b.y + b.s / 2, b.s / 2, ready ? 'rgba(120,220,140,0.45)' : 'rgba(60,60,60,0.45)');
          this.emoji('💨', b.x + b.s / 2, b.y + b.s / 2, b.s * 0.5);
          if (!ready) this.text(p.dashCd.toFixed(1), b.x + b.s / 2, b.y + b.s / 2 + 44, 22, '#FFFFFF', 'center');
          this.register(b.x, b.y, b.s, b.s, 'DASH', 0, true);
        }
        line = ready ? '💨 Dash pronto' + (this.touch ? '' : ' (Espaço)') : '💨 ' + p.dashCd.toFixed(1) + ' s';
        color = ready ? '#8CF08C' : '#CFCFCF';
        break;
      }
      case 'roulette':
        if (p.roulette >= 0) { line = '🎲 ' + ROULETTE[p.roulette].text; color = ROULETTE[p.roulette].text.includes('azar') ? '#FF8A7A' : '#FFE14A'; }
        break;
      case 'elements': {
        const el = g.elementOf(p), left = 5 - (p.elemT % 5);
        line = ['🔥 Fogo', '❄️ Gelo', '⚡ Raio'][el] + ' (' + Math.ceil(left) + ' s)';
        color = ['#FF9A5A', '#9FE8FF', '#FFF07A'][el];
        break;
      }
      case 'barrier': line = p.shieldCd <= 0 ? '🛡️ Escudo pronto' : '🛡️ ' + p.shieldCd.toFixed(1) + ' s'; color = p.shieldCd <= 0 ? '#8CF08C' : '#CFCFCF'; break;
      case 'phoenix': line = p.revive ? '🔥 Renascer pronto' : '🔥 Renascer volta em ' + (p.reviveWait + 1) + (p.reviveWait ? ' ondas' : ' onda'); color = p.revive ? '#FFB060' : '#9A9A9A'; break;
      case 'grow': line = '🥦 +' + Math.round(p.growth * 100) + '% de dano e tamanho'; break;
      case 'berserk': { const b = Math.round(Math.max(0, 1 - p.hp / p.maxHp()) * 150); line = '🍊 Fúria +' + b + '%'; color = b > 75 ? '#FF7A50' : '#FFC870'; break; }
      case 'mirror': line = p.mirrorCd <= 0 ? '🪞 Espelho pronto' : '🪞 recarregando'; color = p.mirrorCd <= 0 ? '#9FE8FF' : '#9A9A9A'; break;
      case 'interest': line = '🥜 Juros no fim da onda: +' + Math.min(Math.floor(p.materials * 0.12), 8 + g.wave * 2); break;
      default: return;
    }
    if (line) this.textFit(line, vw / 2, 132, 20, 420, color);
  },
};

if (typeof Ui !== 'undefined') Object.assign(Ui.prototype, MetaUi);
