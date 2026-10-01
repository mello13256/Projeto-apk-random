// Ranking online (Firebase Realtime Database, pela API REST — sem bibliotecas).
// Cada dificuldade tem sua lista: /ranking/d0 (Fácil) ... /ranking/d3 (Pesadelo).
// As regras de segurança do banco só deixam LER e CRIAR pontuações válidas.
'use strict';

const RANKING_URL = 'https://horta-hostil-default-rtdb.europe-west1.firebasedatabase.app/ranking';

const Ranking = {
  /** Pontuação usada para ordenar: vitória > onda > insetos derrotados. */
  scoreOf(won, wave, kills) {
    return (won ? 100000000 : 0) + wave * 1000000 + kills;
  },

  /** Mesmas regras do banco: 2 a 16 letras, sem símbolos perigosos. */
  validName(n) {
    return typeof n === 'string' && n.length >= 2 && n.length <= 16 && n === n.trim() && !/[<>&{}"\\]/.test(n);
  },

  /** Os 20 melhores de uma dificuldade, do maior para o menor. */
  async top(diff) {
    const res = await fetch(`${RANKING_URL}/d${diff}.json?orderBy=%22score%22&limitToLast=20`, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = (await res.json()) || {};
    return Object.entries(data)
      .map(([id, e]) => Object.assign({ id }, e))
      .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  },

  /** Envia uma partida. Retorna o id criado. */
  async submit(diff, entry) {
    const body = Object.assign({}, entry, {
      score: this.scoreOf(entry.won, entry.wave, entry.kills),
      createdAt: { '.sv': 'timestamp' }, // o servidor coloca a hora certa
    });
    const res = await fetch(`${RANKING_URL}/d${diff}.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return (await res.json()).name;
  },
};
