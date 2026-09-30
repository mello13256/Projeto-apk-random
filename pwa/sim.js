// Simulador: o robô joga sozinho para testar a lógica.  Uso: node pwa/sim.js [partidas]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['data.js', 'game.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'js', f), 'utf8'), { filename: f });
vm.runInThisContext(`
function bot(g) {
  const p = g.player;
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
function runSim(runs) {
  let wins = 0, total = 0;
  for (let r = 0; r < runs; r++) {
    const c = CHARS[r % CHARS.length];
    const pick = makeRng(1000 + r);
    const g = new Game(r + 1);
    g.newRun(c);
    let guard = 0;
    while (g.state !== 'GAME_OVER' && g.state !== 'VICTORY' && guard++ < 2e6) {
      if (g.state === 'PLAYING') { const j = bot(g); g.update(1 / 60, j[0], j[1]); }
      else if (g.state === 'LEVEL_UP') g.chooseLevel(pick.int(4));
      else if (g.state === 'SHOP') {
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 0; i < SHOP_SLOTS; i++) if (g.checkBuy(i) === BUY_OK) g.buy(i);
          for (let i = 0; i < g.player.weapons.length; i++) if (g.canCombine(i)) g.combineWeapon(i);
          if (g.player.materials > g.shopRerollCost() + 30) g.rerollShop();
        }
        if (pick.int(10) === 0 && g.offers[0]) g.toggleLock(0);
        if (pick.int(20) === 0 && g.canSell(0)) g.sellWeapon(0);
        g.nextWave();
      } else throw new Error('estado inesperado ' + g.state);
    }
    const won = g.state === 'VICTORY';
    if (won) wins++;
    total += g.wave;
    console.log(c.name.padEnd(18) + ' -> ' + (won ? 'VENCEU' : 'morreu') + ' na onda ' + g.wave + ' (abates ' + g.kills + ')');
  }
  console.log('Vitorias: ' + wins + '/' + runs + '  onda media: ' + (total / runs).toFixed(1));
}
`);
runSim(Number(process.argv[2] || 12));
