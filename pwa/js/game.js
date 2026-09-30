// Lógica do jogo (tradução da versão Java). Não desenha nada: só regras.
'use strict';

const WORLD_W = 1800, WORLD_H = 1200;
const MAX_WAVE = 20;
const START_MATERIALS = 30;
const MAX_WEAPONS = 6;
const BUY_OK = 0, BUY_NO_MONEY = 1, BUY_FULL = 2, BUY_EMPTY = 3;
const SHOP_SLOTS = 4;
const ITEM_BASE_PRICE = [18, 40, 75, 120];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Gerador de números aleatórios (com semente opcional, útil para testes). */
function makeRng(seed) {
  if (seed === undefined) {
    return { float: () => Math.random(), int: (n) => Math.floor(Math.random() * n) };
  }
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { float, int: (n) => Math.floor(float() * n) };
}

const NO_FX = { sound() {}, vibrate() {}, runEnded() {} };

// ---------------------------------------------------------------------------
// Jogador e armas
// ---------------------------------------------------------------------------

class Weapon {
  constructor(def, tier) {
    this.def = def;
    this.tier = tier;
    this.x = 0; this.y = 0; this.angle = 0; this.cd = 0;
    this.attackT = -1; this.attackDur = 0; this.dirX = 0; this.dirY = 0; this.reach = 0;
    this.tipX = 0; this.tipY = 0;
    this.hitList = [];
  }
  attacking() { return this.attackT >= 0; }
  cooldown(p) {
    const speed = Math.max(0.2, 1 + p.stats[Stat.ATK_SPEED] / 100);
    return Math.max(0.08, this.def.cooldown * TIER_CD[this.tier] / speed);
  }
  range(p) {
    const melee = this.def.type === MELEE;
    const bonus = melee ? p.stats[Stat.RANGE] * 0.5 : p.stats[Stat.RANGE];
    return Math.max(melee ? 50 : 80, this.def.range + bonus);
  }
  baseDamage(p) {
    let d = this.def.baseDamage * TIER_DMG[this.tier]
      + p.stats[this.def.scaleStat] * this.def.scale * TIER_SCALE[this.tier];
    d *= p.damageMult();
    return Math.max(1, d);
  }
  critChance(p) { return this.def.critBonus + p.stats[Stat.CRIT]; }
  burnDamage(p) {
    if (this.def.burn <= 0) return 0;
    const b = (this.def.burn + p.stats[Stat.ELEMENTAL] * 0.8) * TIER_SCALE[this.tier] * p.damageMult();
    return Math.max(1, Math.round(b));
  }
  sellPrice(wave) { return Math.max(1, Math.round(weaponPrice(this.def, this.tier, wave) * 0.3)); }
  title() { return this.def.name + ' ' + TIER_NAMES[this.tier]; }
}

class Player {
  constructor(c) {
    this.character = c;
    this.stats = new Array(Stat.COUNT).fill(0);
    this.stats[Stat.HP] = 10;
    for (let i = 0; i < c.mods.length; i += 2) this.stats[c.mods[i]] += c.mods[i + 1];
    this.weapons = [new Weapon(c.startWeapon, 0)];
    this.items = [];
    this.x = 0; this.y = 0; this.radius = 26;
    this.hp = this.maxHp();
    this.iframes = 0; this.regenAcc = 0;
    this.facingLeft = false; this.moveAnim = 0; this.lookX = 1; this.lookY = 0; this.moving = false;
    this.level = 1; this.xp = 0; this.materials = 0;
  }
  maxHp() { return Math.max(1, this.stats[Stat.HP]); }
  speed() { return 240 * Math.max(0.3, 1 + this.stats[Stat.SPEED] / 100); }
  damageMult() { return Math.max(0.1, 1 + this.stats[Stat.DAMAGE] / 100); }
  dodgeChance() { return Math.min(60, Math.max(0, this.stats[Stat.DODGE])); }
  armorFactor() {
    const a = this.stats[Stat.ARMOR];
    return a >= 0 ? 1 / (1 + a / 15) : 1 + (-a) / 15;
  }
  xpToNext() { return (this.level + 3) * (this.level + 3); }
  pickupRange() { return 110; }
  heal(v) { this.hp = Math.min(this.maxHp(), this.hp + v); }
}

// ---------------------------------------------------------------------------
// Loja
// ---------------------------------------------------------------------------

function inflation(wave) { return 1 + 0.08 * Math.max(0, wave - 1); }
function weaponPrice(def, tier, wave) { return Math.max(1, Math.round(def.price * TIER_PRICE[tier] * inflation(wave))); }
function itemPrice(it, wave) { return Math.max(1, Math.round(ITEM_BASE_PRICE[it.tier] * inflation(wave))); }

function rollTier(rng, wave, luck) {
  const l = Math.max(0.2, 1 + luck / 100);
  const t4 = clamp((wave - 7) * 0.015 * l, 0, 0.15);
  const t3 = clamp((wave - 4) * 0.03 * l, 0, 0.35);
  const t2 = clamp((wave - 1) * 0.06 * l, 0, 0.6);
  const r = rng.float();
  if (r < t4) return 3;
  if (r < t4 + t3) return 2;
  if (r < t4 + t3 + t2) return 1;
  return 0;
}

function varied(rng, price) { return Math.max(1, Math.round(price * (0.9 + rng.float() * 0.2))); }

function randomOffer(rng, p, wave) {
  const o = { weapon: null, item: null, tier: rollTier(rng, wave, p.stats[Stat.LUCK]), price: 0, locked: false };
  if (rng.float() < 0.35) {
    if (p.weapons.length && rng.float() < 0.35) o.weapon = p.weapons[rng.int(p.weapons.length)].def;
    else o.weapon = WEAPONS[rng.int(WEAPONS.length)];
    o.price = varied(rng, weaponPrice(o.weapon, o.tier, wave));
  } else {
    const pool = ITEMS.filter((it) => it.tier === o.tier);
    o.item = pool[rng.int(pool.length)];
    o.price = varied(rng, itemPrice(o.item, wave));
  }
  return o;
}
const offerName = (o) => (o.weapon ? o.weapon.name + ' ' + TIER_NAMES[o.tier] : o.item.name);
const offerIcon = (o) => (o.weapon ? o.weapon.icon : o.item.icon);

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------

class Game {
  constructor(seed) {
    this.rng = makeRng(seed);
    this.fx = NO_FX;
    this.state = 'MENU'; // MENU, CHAR_SELECT, PLAYING, LEVEL_UP, SHOP, GAME_OVER, VICTORY
    this.paused = false;
    this.player = null;
    this.wave = 0; this.waveTime = 0; this.waveDuration = 0; this.spawnTimer = 0;
    this.kills = 0; this.levelsPending = 0; this.lastHarvest = 0; this.boss = null;
    this.enemies = []; this.telegraphs = []; this.bullets = []; this.enemyBullets = [];
    this.pickups = []; this.particles = []; this.texts = [];
    this.offers = new Array(SHOP_SLOTS).fill(null);
    this.shopRerolls = 0;
    this.levelChoices = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this.levelRerolls = 0;
    this.shake = 0; this.banner = ''; this.bannerTime = 0;
    this.lastCrit = false;
  }

  // --- Fluxo ---

  newRun(c) {
    this.player = new Player(c);
    this.player.materials = START_MATERIALS;
    this.kills = 0; this.levelsPending = 0;
    this.offers.fill(null);
    this.paused = false;
    this.startWave(1);
  }

  startWave(n) {
    this.wave = n;
    this.waveTime = 0;
    this.waveDuration = n === MAX_WAVE ? 90 : Math.min(60, 20 + (n - 1) * 5);
    this.enemies = []; this.telegraphs = []; this.bullets = []; this.enemyBullets = [];
    this.pickups = []; this.particles = []; this.texts = [];
    this.boss = null;
    const p = this.player;
    p.x = WORLD_W / 2; p.y = WORLD_H / 2;
    p.hp = p.maxHp(); p.iframes = 1; p.regenAcc = 0;
    for (const w of p.weapons) { w.cd = this.rng.float() * 0.5; w.attackT = -1; w.x = p.x; w.y = p.y; }
    this.spawnTimer = 0.6;
    if (n === 10) {
      const pos = this.randomSpawnPos(450);
      this.telegraphs.push({ def: E.LESMA_RAINHA, x: pos[0], y: pos[1], time: 2 });
      this.showBanner('ONDA 10 - CHEFÃO!');
    } else if (n === MAX_WAVE) {
      const pos = this.randomSpawnPos(450);
      this.telegraphs.push({ def: E.FORMIGA_IMPERATRIZ, x: pos[0], y: pos[1], time: 2 });
      this.showBanner('ONDA FINAL - CHEFONA!');
    } else {
      this.showBanner('ONDA ' + n);
    }
    this.state = 'PLAYING';
  }

  nextWave() { if (this.state === 'SHOP') this.startWave(this.wave + 1); }

  endWave() {
    const p = this.player;
    let collected = 0;
    for (const pk of this.pickups) if (pk.type === 0 && !pk.dead) collected += pk.value;
    this.lastHarvest = Math.max(0, p.stats[Stat.HARVEST]);
    const gain = collected + this.lastHarvest;
    p.materials += gain;
    this.addXp(gain);
    this.enemies = []; this.telegraphs = []; this.bullets = []; this.enemyBullets = []; this.pickups = [];
    this.boss = null;
    this.fx.sound('WAVE_END');
    if (this.wave >= MAX_WAVE) {
      this.state = 'VICTORY';
      this.fx.runEnded(true, this.wave);
      return;
    }
    if (this.levelsPending > 0) {
      this.state = 'LEVEL_UP';
      this.levelRerolls = 0;
      this.rollLevelChoices();
    } else {
      this.openShop();
    }
  }

  gameOver() {
    this.state = 'GAME_OVER';
    this.player.hp = 0;
    this.fx.sound('HURT');
    this.fx.vibrate(300);
    this.fx.runEnded(false, this.wave);
  }

  showBanner(s) { this.banner = s; this.bannerTime = 2.2; }

  // --- Level up ---

  addXp(v) {
    const p = this.player;
    p.xp += v;
    while (p.xp >= p.xpToNext()) {
      p.xp -= p.xpToNext();
      p.level++;
      p.stats[Stat.HP] += 1;
      p.hp += 1;
      this.levelsPending++;
      if (this.state === 'PLAYING') {
        this.addText(p.x, p.y - 50, 'NÍVEL ' + p.level + '!', '#7CFF6B', 34);
        this.fx.sound('LEVEL_UP');
      }
    }
  }

  rollLevelChoices() {
    const order = [...Array(Stat.COUNT).keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const l = Math.max(0.2, 1 + this.player.stats[Stat.LUCK] / 100);
    const lv = this.player.level;
    for (let i = 0; i < 4; i++) {
      const t4 = lv >= 10 ? Math.min(0.1, (lv - 9) * 0.01 * l) : 0;
      const t3 = lv >= 5 ? Math.min(0.25, (lv - 4) * 0.025 * l) : 0;
      const t2 = Math.min(0.5, (lv - 1) * 0.04 * l);
      const r = this.rng.float();
      const tier = r < t4 ? 3 : r < t4 + t3 ? 2 : r < t4 + t3 + t2 ? 1 : 0;
      const stat = order[i];
      this.levelChoices[i] = [stat, Stat.LEVEL_UP_BASE[stat] * (tier + 1), tier];
    }
  }

  chooseLevel(i) {
    if (this.state !== 'LEVEL_UP') return;
    const p = this.player;
    const [stat, amount] = this.levelChoices[i];
    p.stats[stat] += amount;
    if (stat === Stat.HP) p.hp += amount;
    p.hp = Math.min(p.hp, p.maxHp());
    this.levelsPending--;
    this.fx.sound('BUY');
    if (this.levelsPending > 0) { this.levelRerolls = 0; this.rollLevelChoices(); }
    else this.openShop();
  }

  levelRerollCost() { return 1 + Math.floor(this.wave / 2) + this.levelRerolls * (1 + Math.floor(this.wave / 4)); }

  rerollLevel() {
    const cost = this.levelRerollCost();
    if (this.player.materials < cost) { this.fx.sound('ERROR'); return false; }
    this.player.materials -= cost;
    this.levelRerolls++;
    this.rollLevelChoices();
    this.fx.sound('PICKUP');
    return true;
  }

  // --- Loja ---

  openShop() {
    this.state = 'SHOP';
    this.shopRerolls = 0;
    for (let i = 0; i < SHOP_SLOTS; i++) {
      if (!this.offers[i] || !this.offers[i].locked) this.offers[i] = randomOffer(this.rng, this.player, this.wave + 1);
    }
  }

  shopRerollCost() { return Math.max(1, Math.round(this.wave * 0.75)) + this.shopRerolls * Math.max(1, Math.floor(this.wave / 2)); }

  rerollShop() {
    const cost = this.shopRerollCost();
    if (this.player.materials < cost) { this.fx.sound('ERROR'); return false; }
    this.player.materials -= cost;
    this.shopRerolls++;
    for (let i = 0; i < SHOP_SLOTS; i++) {
      if (!this.offers[i] || !this.offers[i].locked) this.offers[i] = randomOffer(this.rng, this.player, this.wave + 1);
    }
    this.fx.sound('PICKUP');
    return true;
  }

  toggleLock(i) { if (this.offers[i]) this.offers[i].locked = !this.offers[i].locked; }

  checkBuy(i) {
    const o = this.offers[i];
    if (!o) return BUY_EMPTY;
    if (this.player.materials < o.price) return BUY_NO_MONEY;
    if (o.weapon && this.player.weapons.length >= MAX_WEAPONS && this.findMergeTarget(o.weapon, o.tier, -1) < 0) return BUY_FULL;
    return BUY_OK;
  }

  buy(i) {
    const check = this.checkBuy(i);
    if (check !== BUY_OK) { this.fx.sound('ERROR'); return check; }
    const o = this.offers[i];
    const p = this.player;
    if (o.weapon) {
      if (p.weapons.length < MAX_WEAPONS) p.weapons.push(new Weapon(o.weapon, o.tier));
      else p.weapons[this.findMergeTarget(o.weapon, o.tier, -1)].tier++;
    } else {
      p.items.push(o.item);
      for (let m = 0; m < o.item.mods.length; m += 2) p.stats[o.item.mods[m]] += o.item.mods[m + 1];
      p.hp = Math.min(p.maxHp(), Math.max(p.hp, 1));
    }
    p.materials -= o.price;
    this.offers[i] = null;
    this.fx.sound('BUY');
    return BUY_OK;
  }

  findMergeTarget(def, tier, exclude) {
    if (tier >= 3) return -1;
    const ws = this.player.weapons;
    for (let j = 0; j < ws.length; j++) {
      if (j !== exclude && ws[j].def === def && ws[j].tier === tier) return j;
    }
    return -1;
  }

  canCombine(idx) {
    const ws = this.player.weapons;
    if (idx < 0 || idx >= ws.length) return false;
    return this.findMergeTarget(ws[idx].def, ws[idx].tier, idx) >= 0;
  }

  combineWeapon(idx) {
    if (!this.canCombine(idx)) return false;
    const w = this.player.weapons[idx];
    const other = this.findMergeTarget(w.def, w.tier, idx);
    w.tier++;
    this.player.weapons.splice(other, 1);
    this.fx.sound('LEVEL_UP');
    return true;
  }

  canSell(idx) { return idx >= 0 && idx < this.player.weapons.length && this.player.weapons.length > 1; }

  sellWeapon(idx) {
    if (!this.canSell(idx)) { this.fx.sound('ERROR'); return false; }
    const w = this.player.weapons.splice(idx, 1)[0];
    this.player.materials += w.sellPrice(this.wave + 1);
    this.fx.sound('BUY');
    return true;
  }

  // --- Atualização ---

  update(dt, jx, jy) {
    if (this.bannerTime > 0) this.bannerTime -= dt;
    if (this.state !== 'PLAYING' || this.paused) return;
    this.waveTime += dt;
    this.shake = Math.max(0, this.shake - dt * 25);
    this.updatePlayer(dt, jx, jy);
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.separateEnemies();
    this.updateWeapons(dt);
    this.updateBullets(dt);
    this.updateEnemyBullets(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
    this.cleanup();
    if (this.player.hp <= 0) { this.gameOver(); return; }
    if (this.waveTime >= this.waveDuration) this.endWave();
  }

  updatePlayer(dt, jx, jy) {
    const p = this.player;
    let len = Math.hypot(jx, jy);
    if (len > 1) { jx /= len; jy /= len; len = 1; }
    p.moving = len > 0.1;
    if (p.moving) {
      const sp = p.speed();
      p.x += jx * sp * dt;
      p.y += jy * sp * dt;
      p.lookX = jx / len; p.lookY = jy / len;
      if (Math.abs(jx) > 0.15) p.facingLeft = jx < 0;
      p.moveAnim += dt * 12;
    }
    p.x = clamp(p.x, p.radius, WORLD_W - p.radius);
    p.y = clamp(p.y, p.radius, WORLD_H - p.radius);
    if (p.iframes > 0) p.iframes -= dt;
    const regen = p.stats[Stat.REGEN];
    if (regen > 0 && p.hp < p.maxHp()) {
      p.regenAcc += dt * regen * 0.12;
      while (p.regenAcc >= 1) { p.regenAcc -= 1; p.heal(1); }
    }
  }

  // --- Inimigos ---

  hpMult() { const w = this.wave - 1; return 1 + 0.25 * w + 0.028 * w * w; }
  spawnInterval() { return Math.max(0.3, 1.6 - this.wave * 0.065); }
  enemyCap() { return Math.min(175, 70 + this.wave * 5); }

  updateSpawns(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.waveTime < this.waveDuration - 1.5) {
      this.spawnTimer = this.spawnInterval();
      const group = 1 + this.rng.int(1 + Math.floor(this.wave / 3));
      const pos = this.randomSpawnPos(300);
      for (let g = 0; g < group; g++) {
        if (this.enemies.length + this.telegraphs.length >= this.enemyCap()) break;
        const d = this.pickEnemy();
        const x = clamp(pos[0] + (this.rng.float() - 0.5) * 140, 40, WORLD_W - 40);
        const y = clamp(pos[1] + (this.rng.float() - 0.5) * 140, 40, WORLD_H - 40);
        this.telegraphs.push({ def: d, x, y, time: 0.8 });
      }
    }
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.time -= dt;
      if (t.time <= 0) {
        this.telegraphs.splice(i, 1);
        this.spawnEnemy(t.def, t.x, t.y);
      }
    }
  }

  pickEnemy() {
    const w = this.wave;
    const weights = SPAWNABLE.map((d) => {
      if (w < d.minWave) return 0;
      if (d === E.LAGARTA) return 10;
      if (d === E.VESPA) return 4 + Math.floor(w / 3);
      if (d === E.ARANHA) return 3 + Math.floor(w / 4);
      return 2 + Math.floor(w / 5);
    });
    let r = this.rng.int(weights.reduce((a, b) => a + b, 0));
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return SPAWNABLE[i];
    }
    return E.LAGARTA;
  }

  spawnEnemy(d, x, y) {
    const maxHp = d.hp * (d.boss ? 1 : this.hpMult());
    const e = {
      def: d, x, y, vx: 0, vy: 0, hp: maxHp, maxHp, radius: d.radius,
      speed: d.speed * (0.9 + this.rng.float() * 0.2),
      damage: Math.max(1, Math.round(d.damage + d.damagePerWave * (this.wave - 1))),
      flash: 0, dead: false, facingLeft: true, anim: 0,
      burnTime: 0, burnTick: 0, burnDamage: 0,
      aiState: 0, aiTimer: 1 + this.rng.float() * 1.5, aiTimer2: d.boss ? 6 : 0, dashX: 0, dashY: 0, spiral: 0,
    };
    this.enemies.push(e);
    this.burst(x, y, d.boss ? 30 : 6, '139,107,74', 120, 5, 0.4);
    if (d.boss) { this.boss = e; this.shake = 10; this.fx.vibrate(120); }
    return e;
  }

  randomSpawnPos(minDist) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 30; tries++) {
      x = 60 + this.rng.float() * (WORLD_W - 120);
      y = 60 + this.rng.float() * (WORLD_H - 120);
      if (Math.hypot(x - this.player.x, y - this.player.y) >= minDist) break;
    }
    return [x, y];
  }

  updateEnemies(dt) {
    const p = this.player;
    const n = this.enemies.length;
    for (let i = 0; i < n; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      e.anim += dt;
      if (e.flash > 0) e.flash -= dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      const decay = Math.max(0, 1 - dt * 10);
      e.vx *= decay; e.vy *= decay;

      if (e.burnTime > 0) {
        e.burnTime -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          this.burst(e.x, e.y - e.radius * 0.5, 3, '255,138,26', 60, 4, 0.4);
          this.damageEnemy(e, e.burnDamage, false, 0, 0, 0, 0, '#FFA040');
          if (e.dead) continue;
        }
        if (e.burnTime <= 0) e.burnDamage = 0;
      }

      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy);
      const nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : 0;
      let mx = 0, my = 0, sp = e.speed;

      switch (e.def.ai) {
        case AI_CHASE:
          mx = nx; my = ny;
          break;
        case AI_SHOOT:
          if (d > 330) { mx = nx; my = ny; } else if (d < 230) { mx = -nx * 0.8; my = -ny * 0.8; }
          e.aiTimer -= dt;
          if (e.aiTimer <= 0 && d < 520) {
            e.aiTimer = 2.4 + this.rng.float() * 0.8;
            this.fireEnemyBullet(e.x, e.y, Math.atan2(dy, dx), 270, e.damage);
          }
          break;
        case AI_CHARGE:
          this.updateCharger(e, dt, d, nx, ny);
          if (e.aiState === 0) { mx = nx; my = ny; } else if (e.aiState === 1) { mx = 0; my = 0; } else { mx = e.dashX; my = e.dashY; sp = 580; }
          break;
        case AI_BOSS_SNAIL:
          mx = nx; my = ny;
          e.aiTimer -= dt;
          if (e.aiTimer <= 0) {
            e.aiTimer = 2.8;
            const off = this.rng.float();
            for (let k = 0; k < 16; k++) this.fireEnemyBullet(e.x, e.y, Math.PI * 2 * (k + off) / 16, 210, e.damage);
          }
          e.aiTimer2 -= dt;
          if (e.aiTimer2 <= 0) {
            e.aiTimer2 = 7;
            for (let k = 0; k < 4; k++) {
              const a = Math.PI * 0.5 * k;
              this.telegraphs.push({ def: E.LAGARTA, x: clamp(e.x + Math.cos(a) * 110, 40, WORLD_W - 40), y: clamp(e.y + Math.sin(a) * 110, 40, WORLD_H - 40), time: 0.6 });
            }
          }
          break;
        case AI_BOSS_ANT:
          this.updateAntBoss(e, dt, nx, ny);
          if (e.aiState === 0) { mx = nx; my = ny; } else if (e.aiState === 1) { mx = nx * 0.3; my = ny * 0.3; } else if (e.aiState === 3) { mx = e.dashX; my = e.dashY; sp = 650; }
          break;
      }

      e.x += mx * sp * dt;
      e.y += my * sp * dt;
      if (Math.abs(mx) > 0.05) e.facingLeft = mx < 0;
      e.x = clamp(e.x, e.radius * 0.5, WORLD_W - e.radius * 0.5);
      e.y = clamp(e.y, e.radius * 0.5, WORLD_H - e.radius * 0.5);
      if (d < e.radius + p.radius - 8) this.damagePlayer(e.damage);
    }
  }

  updateCharger(e, dt, d, nx, ny) {
    if (e.aiState === 0) {
      e.aiTimer -= dt;
      if (d < 340 && e.aiTimer <= 0) { e.aiState = 1; e.aiTimer2 = 0.6; e.dashX = nx; e.dashY = ny; }
    } else if (e.aiState === 1) {
      e.aiTimer2 -= dt;
      if (e.aiTimer2 <= 0) { e.aiState = 2; e.aiTimer2 = 0.45; }
    } else {
      e.aiTimer2 -= dt;
      if (e.aiTimer2 <= 0) { e.aiState = 0; e.aiTimer = 1.8; }
    }
  }

  updateAntBoss(e, dt, nx, ny) {
    e.aiTimer -= dt;
    switch (e.aiState) {
      case 0:
        if (e.aiTimer <= 0) { e.aiState = 1; e.aiTimer = 2.5; e.aiTimer2 = 0; }
        break;
      case 1:
        e.aiTimer2 -= dt;
        if (e.aiTimer2 <= 0) {
          e.aiTimer2 = 0.1;
          e.spiral += 0.37;
          for (let k = 0; k < 3; k++) this.fireEnemyBullet(e.x, e.y, e.spiral + Math.PI * 2 * k / 3, 230, e.damage);
        }
        if (e.aiTimer <= 0) { e.aiState = 2; e.aiTimer = 0.7; e.dashX = nx; e.dashY = ny; }
        break;
      case 2:
        if (e.aiTimer <= 0) { e.aiState = 3; e.aiTimer = 0.6; }
        break;
      default:
        if (e.aiTimer <= 0) {
          e.aiState = 0;
          e.aiTimer = 3;
          for (let k = 0; k < 5; k++) {
            const a = Math.PI * 2 * k / 5;
            this.telegraphs.push({ def: E.VESPA, x: clamp(e.x + Math.cos(a) * 130, 40, WORLD_W - 40), y: clamp(e.y + Math.sin(a) * 130, 40, WORLD_H - 40), time: 0.6 });
          }
        }
    }
  }

  separateEnemies() {
    const es = this.enemies, n = es.length;
    for (let i = 0; i < n; i++) {
      const a = es[i];
      if (a.dead) continue;
      for (let j = i + 1; j < n; j++) {
        const b = es[j];
        if (b.dead) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const min = (a.radius + b.radius) * 0.85;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d < 0.01) { dx = this.rng.float() - 0.5; dy = this.rng.float() - 0.5; d = Math.hypot(dx, dy) + 0.001; }
        const push = (min - d) * 0.5;
        const px = dx / d * push, py = dy / d * push;
        const wa = a.def.boss ? 0.1 : 1, wb = b.def.boss ? 0.1 : 1;
        a.x -= px * wa; a.y -= py * wa;
        b.x += px * wb; b.y += py * wb;
      }
    }
  }

  fireEnemyBullet(x, y, angle, speed, damage) {
    this.enemyBullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 9, life: 4, damage, dead: false });
  }

  damagePlayer(dmg) {
    const p = this.player;
    if (p.iframes > 0 || this.state !== 'PLAYING') return;
    if (this.rng.int(100) < p.dodgeChance()) {
      this.addText(p.x, p.y - 40, 'Esquivou!', '#BFE8FF', 24);
      p.iframes = 0.25;
      return;
    }
    const d = Math.max(1, Math.round(dmg * p.armorFactor()));
    p.hp -= d;
    p.iframes = 0.4;
    this.shake = Math.max(this.shake, 7);
    this.addText(p.x, p.y - 40, '-' + d, '#FF4A4A', 30);
    this.fx.sound('HURT');
    this.fx.vibrate(30);
  }

  // --- Armas ---

  updateWeapons(dt) {
    const p = this.player;
    const n = p.weapons.length;
    for (let i = 0; i < n; i++) {
      const w = p.weapons[i];
      const a = n === 1 ? (p.facingLeft ? Math.PI : 0) : Math.PI * 2 * i / n - Math.PI / 2;
      const hx = p.x + Math.cos(a) * 44, hy = p.y + Math.sin(a) * 36 + 6;
      const k = Math.min(1, dt * 20);
      w.x += (hx - w.x) * k;
      w.y += (hy - w.y) * k;
      w.cd -= dt;
      if (w.attacking()) { this.updateMelee(w, dt); continue; }
      w.tipX = w.x; w.tipY = w.y;
      const t = this.nearestEnemy(w.x, w.y, w.range(p), null);
      if (!t) {
        w.angle = lerpAngle(w.angle, p.facingLeft ? Math.PI : 0, Math.min(1, dt * 8));
        continue;
      }
      const ang = Math.atan2(t.y - w.y, t.x - w.x);
      w.angle = ang;
      if (w.cd <= 0) {
        w.cd = w.cooldown(p);
        if (w.def.type === MELEE) this.startMelee(w, t, ang);
        else this.fireWeapon(w, ang);
      }
    }
  }

  startMelee(w, t, ang) {
    w.dirX = Math.cos(ang); w.dirY = Math.sin(ang);
    w.reach = clamp(Math.hypot(t.x - w.x, t.y - w.y), 30, w.range(this.player));
    w.attackDur = clamp(w.cooldown(this.player) * 0.45, 0.12, 0.28);
    w.attackT = 0;
    w.hitList.length = 0;
    this.fx.sound('SHOOT');
  }

  updateMelee(w, dt) {
    w.attackT += dt;
    const ph = w.attackT / w.attackDur;
    if (ph >= 1) { w.attackT = -1; w.tipX = w.x; w.tipY = w.y; return; }
    const ext = Math.sin(Math.PI * ph) * w.reach;
    w.tipX = w.x + w.dirX * ext;
    w.tipY = w.y + w.dirY * ext;
    const hr = w.def.hitRadius;
    for (const e of this.enemies) {
      if (e.dead || w.hitList.includes(e)) continue;
      const r = e.radius + hr;
      const dx = e.x - w.tipX, dy = e.y - w.tipY;
      if (dx * dx + dy * dy < r * r) {
        w.hitList.push(e);
        const dmg = this.rollDamage(w);
        this.damageEnemy(e, dmg, this.lastCrit, w.dirX, w.dirY, w.def.knockback, 0, null);
      }
    }
  }

  fireWeapon(w, ang) {
    const def = w.def, p = this.player;
    const range = w.range(p);
    const burn = w.burnDamage(p);
    for (let k = 0; k < def.pellets; k++) {
      let a = ang;
      if (def.pellets > 1) a += def.spread * (k / (def.pellets - 1) - 0.5);
      else a += (this.rng.float() - 0.5) * def.spread;
      const c = Math.cos(a), s = Math.sin(a);
      const dmg = this.rollDamage(w);
      this.bullets.push({
        x: w.x + c * 16, y: w.y + s * 16, vx: c * def.projSpeed, vy: s * def.projSpeed,
        life: (range + 40) / def.projSpeed, damage: dmg, crit: this.lastCrit,
        pierce: def.pierce, bounce: def.bounce, explosion: def.explosion, burn,
        knockback: def.knockback, color: def.color, lightning: !!def.lightning,
        radius: def.explosion > 0 ? 10 : def.burn > 0 ? 10 : 7, dead: false, hit: [],
      });
    }
    this.fx.sound('SHOOT');
  }

  rollDamage(w) {
    let d = w.baseDamage(this.player);
    this.lastCrit = this.rng.int(100) < w.critChance(this.player);
    if (this.lastCrit) d *= w.def.critMult;
    return Math.max(1, Math.round(d));
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -50 || b.y < -50 || b.x > WORLD_W + 50 || b.y > WORLD_H + 50) {
        if (b.explosion > 0) this.explode(b);
        b.dead = true;
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead || b.hit.includes(e)) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        const r = e.radius + b.radius;
        if (dx * dx + dy * dy >= r * r) continue;
        if (b.explosion > 0) { this.explode(b); b.dead = true; break; }
        const sp = Math.hypot(b.vx, b.vy);
        this.damageEnemy(e, b.damage, b.crit, b.vx / sp, b.vy / sp, b.knockback, b.burn, null);
        b.hit.push(e);
        if (b.lightning) this.burst(e.x, e.y, 5, '255,242,122', 160, 3, 0.25);
        if (b.bounce > 0) {
          const nt = this.nearestEnemy(e.x, e.y, 320, b.hit);
          if (nt) {
            b.bounce--;
            const a = Math.atan2(nt.y - b.y, nt.x - b.x);
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
            b.life = Math.max(b.life, 380 / sp + 0.1);
            break;
          }
          b.bounce = 0;
        }
        if (b.pierce > 0) { b.pierce--; continue; }
        b.dead = true;
        break;
      }
    }
  }

  explode(b) {
    const r = b.explosion;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - b.x, dy = e.y - b.y;
      const rr = r + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) + 0.001;
        this.damageEnemy(e, b.damage, b.crit, dx / d, dy / d, b.knockback, b.burn, null);
      }
    }
    if (this.particles.length < 500) {
      this.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, ring: true, size: r, life: 0.3, maxLife: 0.3, color: '255,176,64' });
    }
    this.burst(b.x, b.y, 14, '255,154,42', 260, 7, 0.45);
    this.shake = Math.max(this.shake, 4);
    this.fx.sound('EXPLODE');
  }

  updateEnemyBullets(dt) {
    const p = this.player;
    for (const b of this.enemyBullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.y < -30 || b.x > WORLD_W + 30 || b.y > WORLD_H + 30) { b.dead = true; continue; }
      const r = p.radius * 0.8 + b.radius;
      const dx = p.x - b.x, dy = p.y - b.y;
      if (dx * dx + dy * dy < r * r) { b.dead = true; this.damagePlayer(b.damage); }
    }
  }

  damageEnemy(e, dmg, crit, kx, ky, kb, burn, textColor) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.08;
    if (!e.def.boss && kb > 0) {
      const resist = e.def === E.JOANINHA ? 0.4 : 1;
      e.vx += kx * kb * 12 * resist;
      e.vy += ky * kb * 12 * resist;
    }
    const color = textColor || (crit ? '#FFE14A' : '#FFFFFF');
    this.addText(e.x + (this.rng.float() - 0.5) * 20, e.y - e.radius, String(dmg), color, crit ? 30 : 22);
    if (burn > 0) {
      e.burnTime = 2.1;
      if (e.burnDamage < burn) e.burnDamage = burn;
      if (e.burnTick <= 0) e.burnTick = 0.5;
    }
    const p = this.player;
    if (p.stats[Stat.LIFESTEAL] > 0 && p.hp < p.maxHp() && this.rng.int(100) < p.stats[Stat.LIFESTEAL]) p.heal(1);
    if (e.hp <= 0) this.killEnemy(e);
    else this.fx.sound('HIT');
  }

  killEnemy(e) {
    e.dead = true;
    this.kills++;
    for (let i = 0; i < e.def.drops; i++) {
      const a = this.rng.float() * Math.PI * 2;
      const s = e.def.drops > 1 ? 60 + this.rng.float() * 180 : 20;
      this.dropMaterial(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s);
    }
    const fruitChance = 0.025 * Math.max(0.2, 1 + this.player.stats[Stat.LUCK] / 100);
    if (!e.def.boss && this.rng.float() < fruitChance) {
      this.pickups.push({ type: 1, x: e.x, y: e.y, vx: 0, vy: 0, value: 3, attracted: false, dead: false, bob: 0 });
    }
    this.burst(e.x, e.y, e.def.boss ? 60 : 10, '155,211,58', e.def.boss ? 400 : 180, e.def.boss ? 10 : 6, 0.5);
    this.fx.sound('KILL');
    if (e.def.boss) {
      if (this.boss === e) this.boss = null;
      this.shake = 16;
      this.showBanner('CHEFÃO DERROTADO!');
      this.fx.vibrate(200);
    }
  }

  dropMaterial(x, y, vx, vy) {
    let count = 0;
    for (const pk of this.pickups) if (!pk.dead) count++;
    if (count > 260) {
      for (let tries = 0; tries < 10; tries++) {
        const other = this.pickups[this.rng.int(this.pickups.length)];
        if (!other.dead && other.type === 0) { other.value++; return; }
      }
    }
    this.pickups.push({ type: 0, x, y, vx, vy, value: 1, attracted: false, dead: false, bob: this.rng.float() * 6 });
  }

  updatePickups(dt) {
    const p = this.player;
    const range = p.pickupRange();
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.bob += dt;
      const dx = p.x - pk.x, dy = p.y - pk.y;
      const d = Math.hypot(dx, dy);
      if (!pk.attracted && d < range) pk.attracted = true;
      if (pk.attracted && d > 0.01) {
        pk.vx = dx / d * 700; pk.vy = dy / d * 700;
      } else {
        const decay = Math.max(0, 1 - dt * 6);
        pk.vx *= decay; pk.vy *= decay;
      }
      pk.x = clamp(pk.x + pk.vx * dt, 10, WORLD_W - 10);
      pk.y = clamp(pk.y + pk.vy * dt, 10, WORLD_H - 10);
      if (d < p.radius + 12) {
        pk.dead = true;
        if (pk.type === 0) {
          p.materials += pk.value;
          this.addXp(pk.value);
          this.fx.sound('PICKUP');
        } else {
          p.heal(pk.value);
          this.addText(p.x, p.y - 40, '+' + pk.value, '#6BFF7A', 28);
          this.fx.sound('LEVEL_UP');
        }
      }
    }
  }

  // --- Efeitos ---

  updateEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { this.particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      const decay = Math.max(0, 1 - dt * 4);
      pt.vx *= decay; pt.vy *= decay;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y -= 50 * dt;
    }
  }

  /** color: "r,g,b" (a transparência é aplicada no desenho). */
  burst(x, y, count, color, speed, size, life) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 500) return;
      const a = this.rng.float() * Math.PI * 2;
      const s = speed * (0.3 + this.rng.float() * 0.7);
      const l = life * (0.6 + this.rng.float() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: size * (0.6 + this.rng.float() * 0.6), life: l, maxLife: l, color, ring: false });
    }
  }

  addText(x, y, text, color, size) {
    if (this.texts.length >= 60) this.texts.shift();
    this.texts.push({ x, y, text, color, size, life: 0.7, maxLife: 0.7 });
  }

  cleanup() {
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  nearestEnemy(x, y, range, exclude) {
    let best = null, bestD = Infinity;
    for (const e of this.enemies) {
      if (e.dead || (exclude && exclude.includes(e))) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.radius;
      if (d < range && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
