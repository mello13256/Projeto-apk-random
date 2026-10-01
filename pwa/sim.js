// Simulador: o robô joga sozinho para testar a lógica.
// Uso: node pwa/sim.js [partidas] [dificuldade]        (modo solo)
//      node pwa/sim.js coop [partidas] [jogadores]       (multiplayer, tudo num computador só)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['data.js', 'game.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'js', f), 'utf8'), { filename: f });
vm.runInThisContext(`
function bot(g, p) {
  let fx = 0, fy = 0, danger = 0, nearest = null, nearestD = Infinity;
  for (const e of g.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) + 0.1;
    if (d < nearestD) { nearestD = d; nearest = e; }
    const safe = e.radius + p.radius + 70;
    if (d < safe) { const w = (safe - d) / safe * 3; fx += dx / d * w; fy += dy / d * w; danger += w; }
  }
  if (danger < 0.5) {
    let bestD = Infinity, tx = 0, ty = 0;
    for (const pk of g.pickups) {
      const dx = pk.x - p.x, dy = pk.y - p.y, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; tx = dx; ty = dy; }
    }
    if (bestD < 400 * 400) { const d = Math.sqrt(bestD) + 0.1; fx += tx / d; fy += ty / d; }
    else if (nearest) {
      const want = p.weapons[0].range(p) * 0.6 + nearest.radius;
      if (nearestD > want) { fx += (nearest.x - p.x) / nearestD; fy += (nearest.y - p.y) / nearestD; }
    }
  }
  for (const b of g.enemyBullets) {
    const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy + 1, w = 6000 / d2;
    fx += dx / Math.sqrt(d2) * w; fy += dy / Math.sqrt(d2) * w;
  }
  fx += (WORLD_W / 2 - p.x) / 900; fy += (WORLD_H / 2 - p.y) / 900;
  return [fx, fy];
}

/** Melhorias, caixas e loja do jogador deste "computador". Devolve quando chega na loja e terminou de comprar. */
function botBreak(g, pick, stats) {
  let guard = 0;
  while (g.state === 'LEVEL_UP' || g.state === 'CRATE') {
    if (guard++ > 1000) throw new Error('intervalo travado');
    if (g.state === 'LEVEL_UP') g.chooseLevel(pick.int(4));
    else g.resolveCrate(pick.int(3) !== 0);
  }
  if (g.state !== 'SHOP') throw new Error('estado inesperado ' + g.state);
  if (stats) {
    const saved = g.saveToString();
    if (saved !== null) {
      const copy = new Game(1);
      if (!copy.loadFromString(saved) || copy.saveToString() !== saved) throw new Error('save/load falhou');
      stats.saves++;
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < SHOP_SLOTS; i++) if (g.checkBuy(i) === BUY_OK) g.buy(i);
    for (let i = 0; i < g.player.weapons.length; i++) if (g.canCombine(i)) g.combineWeapon(i);
    if (g.player.materials > g.shopRerollCost() + 30) g.rerollShop();
  }
  if (pick.int(10) === 0 && g.offers[0]) g.toggleLock(0);
  if (pick.int(20) === 0 && g.canSell(0)) g.sellWeapon(0);
}

function runSim(runs, diff) {
  let wins = 0, total = 0;
  const stats = { saves: 0 };
  for (let r = 0; r < runs; r++) {
    const c = CHARS[r % CHARS.length];
    const pick = makeRng(1000 + r);
    const g = new Game(r + 1);
    g.newRun(c, diff);
    let guard = 0;
    while (g.state !== 'GAME_OVER' && g.state !== 'VICTORY' && guard++ < 2e6) {
      if (g.state === 'PLAYING') { const j = bot(g, g.player); g.update(1 / 60, j[0], j[1]); }
      else { botBreak(g, pick, stats); g.nextWave(); }
    }
    if (g.state === 'VICTORY') wins++;
    total += g.wave;
  }
  console.log(DIFF_NAMES[diff].padEnd(9) + ' vitorias: ' + wins + '/' + runs + '  onda media: ' + (total / runs).toFixed(1) + '  (' + stats.saves + ' saves testados)');
}

/**
 * Multiplayer: um Game "anfitrião" simula a arena; cada convidado tem o próprio Game
 * só para o intervalo (melhorias/caixas/loja), e os dados vão e voltam como pela rede.
 */
function runCoop(runs, n, diff) {
  let wins = 0, total = 0, downs = 0, transfers = 0;
  for (let r = 0; r < runs; r++) {
    const pick = makeRng(5000 + r);
    const host = new Game(r + 7);
    const list = [];
    for (let i = 0; i < n; i++) list.push({ id: 'p' + i, name: 'Bot' + i, char: (r + i * 2) % CHARS.length });
    host.newCoopRun(list, 'p0', diff);
    const guests = list.slice(1).map((d, i) => {
      const g = new Game(100 + r * 10 + i);
      g.newCoopRun(list, d.id, diff); // o convidado só usa o próprio jogador e a loja
      g.state = 'MENU';
      return g;
    });
    let guard = 0;
    while (host.state !== 'GAME_OVER' && host.state !== 'VICTORY' && guard++ < 2e6) {
      if (host.state === 'PLAYING') {
        for (const p of host.players) {
          if (!p.remote || !p.alive) continue;
          const j = bot(host, p), len = Math.hypot(j[0], j[1]);
          const k = len > 1 ? 1 / len : 1;
          p.tx = clamp(p.tx + j[0] * k * p.speed() / 60, p.radius, WORLD_W - p.radius);
          p.ty = clamp(p.ty + j[1] * k * p.speed() / 60, p.radius, WORLD_H - p.radius);
          p.moving = len > 0.1;
        }
        const alive = host.players.filter((p) => p.alive).length;
        const j = bot(host, host.player);
        host.update(1 / 60, j[0], j[1]);
        downs += Math.max(0, alive - host.players.filter((p) => p.alive).length);
        continue;
      }
      // intervalo: manda os dados de cada convidado, ele faz a loja dele e devolve
      guests.forEach((g) => {
        const me = host.players.find((p) => p.id === g.player.id);
        const sent = JSON.parse(JSON.stringify(playerToData(me)));
        if (!g.beginRemoteBreak(sent, host.wave)) throw new Error('beginRemoteBreak falhou');
        botBreak(g, pick, null);
        const back = JSON.parse(JSON.stringify(playerToData(g.player)));
        if (!host.replacePlayer(g.player.id, back)) throw new Error('replacePlayer falhou');
        transfers += 2;
      });
      botBreak(host, pick, null);
      if (host.saveToString() !== null) throw new Error('multiplayer nao deve salvar');
      host.nextWave();
    }
    if (host.state === 'VICTORY') wins++;
    total += host.wave;
  }
  console.log('Coop x' + n + ' ' + DIFF_NAMES[diff].padEnd(9) + ' vitorias: ' + wins + '/' + runs + '  onda media: ' + (total / runs).toFixed(1) + '  quedas: ' + downs + '  (' + transfers + ' trocas de dados)');
}
`);
if (process.argv[2] === 'coop') {
  const runs = Number(process.argv[3] || 6);
  const ns = process.argv[4] !== undefined ? [Number(process.argv[4])] : [2, 3, 4];
  const diffs = process.argv[5] !== undefined ? [Number(process.argv[5])] : [1, 3];
  for (const n of ns) for (const d of diffs) runCoop(runs, n, d);
} else {
  const runs = Number(process.argv[2] || 12);
  const diffs = process.argv[3] !== undefined ? [Number(process.argv[3])] : [0, 1, 2, 3];
  for (const d of diffs) runSim(runs, d);
}
