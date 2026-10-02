// Ranking online (Firebase Realtime Database, pela API REST — sem bibliotecas).
// Cada dificuldade tem sua lista: /ranking/d0 (Fácil) ... /ranking/d3 (Pesadelo).
// Cada jogador tem UM lugar por dificuldade; as regras só deixam trocar por uma partida melhor.
'use strict';

const RANKING_URL = (typeof DB_URL !== 'undefined' ? DB_URL : 'https://horta-hostil-default-rtdb.europe-west1.firebasedatabase.app') + '/ranking';

const Ranking = {
  /** Pontuação usada para ordenar: vitória > onda > insetos derrotados. */
  scoreOf(won, wave, kills) {
    return (won ? 100000000 : 0) + wave * 1000000 + kills;
  },

  /** Mesmas regras do banco: 2 a 16 letras, sem símbolos perigosos. */
  validName(n) {
    return typeof n === 'string' && n.length >= 2 && n.length <= 16 && n === n.trim() && !/[<>&{}"\\]/.test(n);
  },

  /**
   * Os 20 melhores de uma dificuldade, do maior para o menor.
   * Cada jogador aparece uma vez só (a melhor partida dele), mesmo que existam registros antigos repetidos.
   */
  async top(diff) { return this.topAt(`${RANKING_URL}/d${diff}`); },

  /** Ranking do Desafio do Dia (date = AAAA-MM-DD). */
  dailyUrl(date) { return RANKING_URL.replace(/\/ranking$/, '/daily/') + date; },

  async topAt(base) {
    const res = await fetch(`${base}.json?orderBy=%22score%22&limitToLast=80`, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = (await res.json()) || {};
    const seen = new Set();
    return Object.entries(data)
      .map(([id, e]) => Object.assign({ id }, e))
      .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)
      .filter((e) => {
        const k = String(e.name || '').toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 20);
  },

  /**
   * Posta a partida automaticamente, mas só se for a MELHOR do jogador nessa dificuldade:
   * cada jogador tem um lugar só (ranking/dN/<id do jogador>) e a partida nova substitui a anterior.
   * Ordem: vitória > onda > insetos derrotados (se o resto empatar, quem matou mais fica).
   * Devolve {posted: true} ou {posted: false, best} (a anterior era melhor ou igual).
   */
  async postBest(diff, playerId, entry) { return this.postBestAt(`${RANKING_URL}/d${diff}`, playerId, entry); },

  /** Build compacta (armas e itens) pra mostrar no ranking: "arma.nível,..|item*qtd,..". */
  buildOf(p) {
    const counts = new Map();
    for (const it of p.items) counts.set(it, (counts.get(it) || 0) + 1);
    const items = [...counts].map(([it, n]) => ALL_ITEMS.indexOf(it) + (n > 1 ? '*' + n : ''));
    return (p.weapons.map((w) => ALL_WEAPONS.indexOf(w.def) + '.' + w.tier).join(',') + '|' + items.join(',')).slice(0, 900);
  },

  parseBuild(b) {
    if (typeof b !== 'string') return null;
    const [ws, is] = b.split('|');
    const weapons = (ws || '').split(',').filter(Boolean).map((x) => { const [i, t] = x.split('.'); return { def: ALL_WEAPONS[+i], tier: +t || 0 }; }).filter((w) => w.def);
    const items = (is || '').split(',').filter(Boolean).map((x) => { const [i, n] = x.split('*'); return { it: ALL_ITEMS[+i], n: +n || 1 }; }).filter((x) => x.it);
    return { weapons, items };
  },

  async postBestAt(base, playerId, entry) {
    const url = `${base}/${playerId}.json`;
    const score = this.scoreOf(entry.won, entry.wave, entry.kills);
    const cur = await fetch(url, { cache: 'no-store' });
    if (!cur.ok) { const e = new Error('HTTP ' + cur.status); e.status = cur.status; throw e; }
    const old = await cur.json();
    if (old && old.score >= score) return { posted: false, best: old };
    const body = Object.assign({}, entry, { score, createdAt: { '.sv': 'timestamp' } });
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return { posted: true, best: old };
  },
};
