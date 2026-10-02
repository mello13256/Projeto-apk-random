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
  async top(diff) {
    const res = await fetch(`${RANKING_URL}/d${diff}.json?orderBy=%22score%22&limitToLast=80`, { cache: 'no-store' });
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
  async postBest(diff, playerId, entry) {
    const url = `${RANKING_URL}/d${diff}/${playerId}.json`;
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
