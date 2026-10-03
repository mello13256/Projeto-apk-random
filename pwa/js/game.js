// Lógica do jogo (tradução da versão Java). Não desenha nada: só regras.
'use strict';

const WORLD_W = 1800, WORLD_H = 1200;
const MAX_WAVE = 20;          // ondas no modo normal (Inferno: 35, Infinito: sem fim)
const START_MATERIALS = 30;
const MAX_WEAPONS = 6;        // o Alien Hala segura 8
const PVP_PREP_WAVES = 15;    // rodadas de preparação do PvP
const DUEL_DMG = 0.1;         // no duelo, o dano entre jogadores é reduzido (senão acaba num piscar)
const DUEL_HP = 5;            // e todo mundo tem 5x mais vida
const LASER_FIRE_TIME = 5;    // segundos de tiro contínuo até superaquecer
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
const DAILY_WAVES = 15;
// Modificadores do Desafio do Dia
const DAILY_MODS = [
  { text: 'Insetos 25% mais rápidos', foeSpeed: 1.25 },
  { text: 'Sementes valem o dobro', seedMul: 2 },
  { text: 'Começa com 150 sementes', startSeeds: 120 },
  { text: 'Loja só com coisas raras (nível II ou mais)', minTier: 1 },
  { text: 'Elites por todo lado', elites: 4 },
  { text: 'Insetos explodem ao morrer', boom: 20 },
  { text: 'Ondas 30% mais curtas e 30% mais insetos', short: 0.7, spawn: 1.3 },
  { text: 'Vida em dobro, dano pela metade', hp2: true },
];

/** Desafio do Dia de hoje (igual pra todo mundo): legume, dificuldade e modificador. */
function dailyChallenge(dateStr) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  let h = 2166136261;
  for (const ch of 'horta|' + date) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const r = makeRng(h);
  return { date, seed: h, char: r.int(CHARS.length), diff: 1 + r.int(3), mod: DAILY_MODS[r.int(DAILY_MODS.length)] };
}

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
    this.waveDamage = 0; this.totalDamage = 0;
  }
  attacking() { return this.attackT >= 0; }
  cooldown(p) {
    let speed = Math.max(0.2, 1 + p.stats[Stat.ATK_SPEED] / 100) * p.rmod('atk');
    if (p.kind === 'berserk') speed *= 1 + Math.max(0, 1 - p.hp / p.maxHp()) * 0.6; // Laranja: fúria também acelera
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
  /** id/nome/slot só importam no multiplayer (no modo solo ficam no padrão). */
  constructor(c, id, name, slot) {
    this.character = c;
    this.id = id || 'solo'; this.name = name || ''; this.slot = slot || 0;
    this.alive = true;          // no multiplayer, quem cai vira fantasma até a próxima onda
    this.levelsPending = 0;
    this.remote = false;        // controlado por outro computador (a posição chega pela rede)
    this.tx = 0; this.ty = 0;   // última posição recebida pela rede
    this.shots = 0; this.lastHarvest = 0;
    this.peakLs = 0;            // maior roubo de vida que teve na partida (desbloqueia o Vampiro)
    // Canhão laser (Cyborg Cebola): mira e tiro manuais
    this.cy = { dmg: 0, cool: 0, time: 0, width: 0, range: 0, split: 0, boom: 0, crit: 0 };
    this.aimAng = 0; this.wantFire = false;
    this.laser = { heat: 0, over: false, on: false, tick: 0 };
    this.mineTimer = 0; this.minionAng = 0; this.minionCd = [];
    // "armas" invisíveis para contar o dano das minas, dos mirtilinhos e do atropelamento
    this.extraSrc = { waveDamage: 0, totalDamage: 0, owner: this, def: null };
    // Conjuntos (sinergias) já aplicados: família -> 0, 1 (3 peças) ou 2 (5 peças)
    this.setApplied = {}; this.tagCounts = {};
    // Estado das mecânicas das classes da versão 4.0
    this.growth = 0; this.shieldCd = 0; this.fearCd = 3; this.decoyCd = 4; this.gravCd = 3; this.mirrorCd = 0;
    this.elemT = 0; this.revive = true; this.reviveWait = 0; this.roulette = -1; this.rhealT = 0;
    this.dashCd = 0; this.dashT = 0; this.dashX = 1; this.dashY = 0; this.dashHit = [];
    this.auraT = 0; this.shellHp = 0; this.lastInterest = 0;
    this.stats = new Array(Stat.COUNT).fill(0);
    this.stats[Stat.HP] = 10;
    for (let i = 0; i < c.mods.length; i += 2) this.stats[c.mods[i]] += c.mods[i + 1];
    this.weapons = [new Weapon(c.startWeapon, 0)];
    this.items = [];
    this.specials = new Array(SP_COUNT).fill(0);
    this.crates = 0;
    this.x = 0; this.y = 0; this.radius = 26;
    this.hp = this.maxHp();
    this.iframes = 0; this.regenAcc = 0;
    this.facingLeft = false; this.moveAnim = 0; this.lookX = 1; this.lookY = 0; this.moving = false;
    this.level = 1; this.xp = 0; this.materials = 0;
    this.notePeaks();
  }
  get kind() { return this.character.kind; }
  maxWeapons() { return this.kind === 'alien' ? 8 : MAX_WEAPONS; }
  notePeaks() { this.peakLs = Math.max(this.peakLs, this.stats[Stat.LIFESTEAL]); }
  addCy(it) { if (it.cy) for (const k of Object.keys(it.cy)) this.cy[k] += it.cy[k]; }
  maxHp() { return Math.max(1, this.stats[Stat.HP]) * (this.hpMult || 1); }
  /** Modificador da roleta do Pêssego (1 = nenhum). */
  rmod(k) { const r = this.roulette >= 0 ? ROULETTE[this.roulette] : null; return r && r[k] ? r[k] : 1; }
  /** Valor do atributo que vale de verdade (respeita o limite de Stat.CAP). */
  stat(i) { const c = Stat.CAP[i], v = this.stats[i]; return c && v > c ? c : v; }
  speed() { return 240 * Math.max(0.3, 1 + this.stat(Stat.SPEED) / 100) * this.rmod('speed') * (this.dashT > 0 ? 4 : 1); }
  damageMult() {
    let m = Math.max(0.1, 1 + this.stats[Stat.DAMAGE] / 100) * (1 + this.growth) * this.rmod('dmg');
    if (this.kind === 'berserk') m *= 1 + Math.max(0, 1 - this.hp / this.maxHp()) * 1.5; // Laranja: fúria
    if (this.dmgHalf) m *= 0.5;
    return m;
  }
  /** Recalcula os conjuntos (3 ou 5 coisas da mesma família) e aplica/remove os bônus. */
  applySets() {
    const counts = {};
    for (const it of this.items) for (const t of it.tags || []) counts[t] = (counts[t] || 0) + 1;
    for (const w of this.weapons) { const t = WEAPON_TAGS.get(w.def); if (t) counts[t] = (counts[t] || 0) + 1; }
    for (const k of SET_KEYS) {
      const want = counts[k] >= 5 ? 2 : counts[k] >= 3 ? 1 : 0;
      const have = this.setApplied[k] || 0;
      if (want === have) continue;
      if (have) this.applyBonus(have === 2 ? SETS[k].b5 : SETS[k].b3, -1);
      if (want) this.applyBonus(want === 2 ? SETS[k].b5 : SETS[k].b3, 1);
      this.setApplied[k] = want;
    }
    this.tagCounts = counts;
    this.hp = Math.min(this.hp, this.maxHp());
  }
  applyBonus(list, sign) {
    for (const [k, i, v] of list) { if (k === 'S') this.stats[i] += sign * v; else this.specials[i] += sign * v; }
  }
  dodgeChance() { return Math.max(0, this.stat(Stat.DODGE)); }
  armorFactor() {
    const a = this.stat(Stat.ARMOR);
    return a >= 0 ? 1 / (1 + a / 15) : 1 + (-a) / 15;
  }
  xpToNext() { return (this.level + 3) * (this.level + 3); }
  pickupRange() { return 110 * (1 + this.specials[SP_MAGNET] / 100); }
  addItem(it) {
    this.items.push(it);
    for (let m = 0; m < it.mods.length; m += 2) this.stats[it.mods[m]] += it.mods[m + 1];
    if (it.special >= 0) this.specials[it.special] += it.specialValue;
    this.addCy(it);
    this.applySets();
    this.hp = Math.min(this.maxHp(), Math.max(this.hp, 1));
    this.notePeaks();
  }
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

/** Itens que este personagem encontra (o Alien só acha os Alien; o Cyborg também acha os dele). */
function itemPool(p, tier) {
  if (p.kind === 'alien') return ALIEN_ITEMS.filter((it) => it.tier === tier);
  const pool = ITEMS.filter((it) => it.tier === tier);
  if (p.kind === 'laser') for (const it of CYBORG_ITEMS) if (it.tier === tier) pool.push(it, it, it);
  return pool;
}

function randomOffer(rng, p, wave, minTier) {
  const o = { weapon: null, item: null, tier: Math.max(minTier || 0, rollTier(rng, wave, p.stats[Stat.LUCK])), price: 0, locked: false };
  if (p.kind !== 'laser' && rng.float() < 0.35) { // o Cyborg só usa o canhão: nada de armas na loja
    if (p.weapons.length && rng.float() < 0.35) o.weapon = p.weapons[rng.int(p.weapons.length)].def;
    else o.weapon = WEAPONS[rng.int(WEAPONS.length)];
    o.price = varied(rng, weaponPrice(o.weapon, o.tier, wave));
  } else {
    const pool = itemPool(p, o.tier);
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
    this.state = 'MENU'; // MENU, CHAR_SELECT, PLAYING, LEVEL_UP, CRATE, SHOP, GAME_OVER, VICTORY
    this.difficulty = 1;
    this.ending = false; this.endTimer = 0;   // animação do fim da onda
    this.crateItem = null;
    this.cratesDroppedThisWave = 0; this.elitesThisWave = 0;
    this.explosionDepth = 0;
    this.paused = false;
    this.player = null;   // o jogador deste computador
    this.players = [];    // todos os jogadores (no modo solo, só um)
    this.coop = false;    // partida multiplayer (não pausa, não salva)
    this.pvp = '';        // PvP: 'prep' (as 15 rodadas de preparação) ou 'duel' (a arena)
    this.zone = null;     // duelo: círculo que vai fechando
    this.duelTime = 0; this.countdown = 0; this.duelWinner = null; this.zoneTick = 0;
    this.mines = [];
    this.decoys = []; this.wells = []; this.echoes = []; // uvas falsas, buracos negros, tiros-eco
    this.input = { aimAng: 0, fire: false, dash: false }; // mira manual (laser) e dash (Alface)
    this.daily = null;    // Desafio do Dia: {date, mod}
    this.runStats = { bosses: 0, elites: 0, bought: 0 };
    this.foeSlow = 1;
    this.seedsCollected = 0; // sementes ganhas na partida (recordes)
    this.prepDowned = false;
    this.rec = null;      // quando é uma lista, guarda efeitos/sons para mandar pela rede
    this.onWaveEnd = null;
    this.nextEnemyId = 1;
    this.wave = 0; this.waveTime = 0; this.waveDuration = 0; this.spawnTimer = 0;
    this.kills = 0; this.lastHarvest = 0; this.boss = null;
    this.enemies = []; this.telegraphs = []; this.bullets = []; this.enemyBullets = [];
    this.pickups = []; this.particles = []; this.texts = [];
    this.offers = new Array(SHOP_SLOTS).fill(null);
    this.shopRerolls = 0;
    this.levelChoices = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    this.levelRerolls = 0;
    this.shake = 0; this.banner = ''; this.bannerTime = 0;
    this.lastCrit = false;
  }

  /** Melhorias que o jogador deste computador ainda vai escolher. */
  get levelsPending() { return this.player ? this.player.levelsPending : 0; }

  alivePlayers() { return this.players.filter((p) => p.alive); }

  /** Quem o inseto persegue: uma uva falsa por perto (Uva Ilusionista) ou o jogador mais perto. */
  targetFor(e) {
    let best = null, bestD = 500 * 500;
    for (const dc of this.decoys) {
      const d = (dc.x - e.x) * (dc.x - e.x) + (dc.y - e.y) * (dc.y - e.y);
      if (d < bestD) { bestD = d; best = dc; }
    }
    return best || this.nearestPlayer(e.x, e.y);
  }

  /** Jogador vivo mais perto do ponto (ou null). */
  nearestPlayer(x, y) {
    let best = null, bestD = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // Sons, vibração e tremida: "p" = só para esse jogador (se for o deste computador).
  snd(id, p) {
    if (!p || p === this.player) this.fx.sound(id);
    if (this.rec) this.rec.push(['s', id, p ? p.id : '']);
  }
  vib(ms, p) {
    if (!p || p === this.player) this.fx.vibrate(ms);
    if (this.rec) this.rec.push(['v', ms, p ? p.id : '']);
  }
  shakeAt(v, p) {
    if (!p || p === this.player) this.shake = Math.max(this.shake, v);
    if (this.rec) this.rec.push(['k', v, p ? p.id : '']);
  }

  /** Última onda da partida (Infinity no modo Infinito). */
  maxWave() {
    if (this.pvp === 'prep') return PVP_PREP_WAVES;
    if (this.daily) return DAILY_WAVES;
    return DIFF_WAVES[this.difficulty] || Infinity;
  }
  isFinalWave(n) { return n === this.maxWave(); }

  /** Chefe que aparece no começo da onda n (ou null). */
  bossFor(n) {
    if (this.daily) return n === 10 ? E.LESMA_RAINHA : n === DAILY_WAVES ? E.FORMIGA_IMPERATRIZ : null;
    if (this.difficulty === DIFF_ENDLESS && this.pvp !== 'prep') return n % 10 === 0 ? BOSSES[(n / 10 - 1) % 3] : null;
    if (this.difficulty === DIFF_INFERNO && this.pvp !== 'prep') {
      return n === 10 ? E.LESMA_RAINHA : n === 20 || n === 30 ? E.FORMIGA_IMPERATRIZ : n === 35 ? E.BESOURO_INFERNAL : null;
    }
    return n === 10 ? E.LESMA_RAINHA : n === MAX_WAVE && this.pvp !== 'prep' ? E.FORMIGA_IMPERATRIZ : null;
  }

  waveBanner(n) {
    if (this.isFinalWave(n) && this.bossFor(n)) return 'ONDA FINAL - CHEFONA!';
    if (this.bossFor(n)) return 'ONDA ' + n + ' - CHEFÃO!';
    if (this.isFinalWave(n)) return this.pvp === 'prep' ? 'ÚLTIMA RODADA!' : 'ONDA FINAL!';
    return (this.pvp === 'prep' ? 'RODADA ' : 'ONDA ') + n;
  }

  // --- Fluxo ---

  resetRunStats() {
    this.kills = 0; this.seedsCollected = 0;
    this.offers.fill(null);
    this.paused = false;
    this.mines = []; this.decoys = []; this.wells = []; this.echoes = [];
    this.runStats = { bosses: 0, elites: 0, bought: 0 };
    this.zone = null; this.duelWinner = null;
  }

  newRun(c, diff, daily) {
    if (diff !== undefined) this.difficulty = clamp(diff, 0, DIFF_NAMES.length - 1);
    this.coop = false; this.pvp = '';
    this.daily = daily || null;
    if (daily) this.rng = makeRng(daily.seed); // a mesma sorte pra todo mundo no dia
    this.player = new Player(c);
    this.player.materials = START_MATERIALS + (c.kind === 'interest' ? 20 : 0) + (this.dmod('startSeeds') || 0);
    if (this.dmod('boom')) this.player.specials[SP_BOOM] += this.dmod('boom');
    if (this.dmod('hp2')) { this.player.hpMult = 2; this.player.dmgHalf = true; }
    this.players = [this.player];
    this.resetRunStats();
    this.startWave(1);
  }

  /** Modificador do Desafio do Dia (ou undefined). */
  dmod(k) { return this.daily && this.daily.mod ? this.daily.mod[k] : undefined; }

  /** PvP: as 15 rodadas de preparação (cada um joga sozinho no próprio aparelho). */
  newPvpPrep(c, diff) {
    this.newRun(c, diff, null);
    this.coop = true; this.pvp = 'prep';
    this.startWave(1);
  }

  /** Partida multiplayer. list = [{id, name, char}], localId = quem joga neste computador. */
  newCoopRun(list, localId, diff) {
    if (diff !== undefined) this.difficulty = clamp(diff, 0, DIFF_NAMES.length - 1);
    this.coop = true;
    this.players = list.map((d, i) => {
      const p = new Player(CHARS[d.char] || CHARS[0], d.id, d.name, i);
      p.materials = START_MATERIALS + (p.kind === 'interest' ? 20 : 0);
      p.remote = d.id !== localId;
      return p;
    });
    this.player = this.players.find((p) => !p.remote) || this.players[0];
    this.pvp = ''; this.daily = null;
    this.resetRunStats();
    this.startWave(1);
  }

  /**
   * PvP: a arena do duelo. list = [{id, name, data}] (data = jogador já com a troca de atributos).
   * Sem insetos; o círculo vai fechando e quem fica fora perde vida.
   */
  newDuel(list, localId, diff) {
    if (diff !== undefined) this.difficulty = diff;
    this.coop = true; this.pvp = 'duel'; this.daily = null;
    this.players = list.map((d, i) => {
      const p = playerFromData(d.data, d.id, d.name, i) || new Player(CHARS[0], d.id, d.name, i);
      p.remote = d.id !== localId;
      p.hpMult = DUEL_HP;
      return p;
    });
    this.player = this.players.find((p) => !p.remote) || this.players[0];
    this.resetRunStats();
    this.wave = PVP_PREP_WAVES;
    this.waveTime = 0; this.waveDuration = 9999;
    this.enemies = []; this.telegraphs = []; this.bullets = []; this.enemyBullets = [];
    this.pickups = []; this.particles = []; this.texts = [];
    this.boss = null; this.ending = false;
    this.zone = { x: WORLD_W / 2, y: WORLD_H / 2, r: 760, min: 120 };
    this.duelTime = 0; this.countdown = 3; this.zoneTick = 0;
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const a = Math.PI * 2 * i / n + Math.PI;
      p.x = this.zone.x + Math.cos(a) * 430; p.y = this.zone.y + Math.sin(a) * 330;
      p.tx = p.x; p.ty = p.y; p.alive = true; p.hp = p.maxHp(); p.iframes = 0; p.regenAcc = 0;
      p.facingLeft = Math.cos(a) > 0;
      p.revive = true; p.growth = 0; p.shieldCd = 0; p.roulette = -1;
      for (const w of p.weapons) { w.cd = 0.5; w.attackT = -1; w.x = p.x; w.y = p.y; w.waveDamage = 0; w.owner = p; }
    });
    this.showBanner('DUELO!');
    this.state = 'PLAYING';
  }

  startWave(n) {
    this.wave = n;
    this.waveTime = 0;
    this.waveDuration = this.isFinalWave(n) && this.pvp !== 'prep' ? 90 : Math.min(60, 20 + (n - 1) * 5);
    if (this.pvp === 'prep') this.waveDuration = Math.round(this.waveDuration * 0.75);
    if (this.dmod('short')) this.waveDuration = Math.round(this.waveDuration * this.dmod('short'));
    this.mines = []; this.decoys = []; this.wells = []; this.echoes = [];
    this.foeSlow = 1;
    this.prepDowned = false;
    this.enemies = []; this.telegraphs = []; this.bullets = []; this.enemyBullets = [];
    this.pickups = []; this.particles = []; this.texts = [];
    this.boss = null;
    this.ending = false;
    this.cratesDroppedThisWave = 0; this.elitesThisWave = 0;
    const count = this.players.length;
    this.players.forEach((p, i) => {
      const a = Math.PI * 2 * i / count + Math.PI;
      p.crates = 0;
      p.x = WORLD_W / 2 + (count > 1 ? Math.cos(a) * 90 : 0);
      p.y = WORLD_H / 2 + (count > 1 ? Math.sin(a) * 90 : 0);
      p.tx = p.x; p.ty = p.y;
      p.alive = true;
      p.hp = p.maxHp(); p.iframes = 1; p.regenAcc = 0;
      p.laser.heat = 0; p.laser.over = false; p.laser.on = false;
      // classes novas: tudo recomeça a cada onda
      p.growth = 0; p.shieldCd = 0; p.dashT = 0;
      if (p.reviveWait > 0) p.reviveWait--; else p.revive = true; // Fênix: recarrega a cada 2 ondas
      p.dashCd = 0; p.fearCd = 3; p.decoyCd = 4; p.gravCd = 3;
      p.shellHp = Math.min(SP_CAP_SHIELD, p.specials[SP_SHIELD]);
      if (p.kind === 'roulette') {
        p.roulette = this.rng.int(ROULETTE.length);
        if (ROULETTE[p.roulette].slowFoes) this.foeSlow *= ROULETTE[p.roulette].slowFoes;
      }
      for (const w of p.weapons) { w.cd = this.rng.float() * 0.5; w.attackT = -1; w.x = p.x; w.y = p.y; w.waveDamage = 0; w.owner = p; }
    });
    this.spawnTimer = 0.6;
    const boss = this.bossFor(n);
    if (boss) {
      const pos = this.randomSpawnPos(450);
      this.telegraphs.push({ def: boss, x: pos[0], y: pos[1], time: 2 });
    }
    this.showBanner(this.waveBanner(n));
    const me = this.player;
    if (me && me.kind === 'roulette' && me.roulette >= 0) {
      this.addText(me.x, me.y - 70, '🎲 ' + ROULETTE[me.roulette].text, ROULETTE[me.roulette].text.includes('azar') ? '#FF8A7A' : '#FFE14A', 26);
    }
    this.state = 'PLAYING';
  }

  nextWave() { if (this.state === 'SHOP') this.startWave(this.wave + 1); }

  endWave() {
    let collected = 0;
    for (const pk of this.pickups) if (pk.type === 0 && !pk.dead) collected += pk.value * (this.dmod('seedMul') || 1);
    // As sementes são do time: cada um ganha as que sobraram + a própria colheita.
    for (const p of this.players) {
      p.lastHarvest = Math.max(0, p.stats[Stat.HARVEST]);
      const gain = collected * p.rmod('seeds') + p.lastHarvest;
      p.materials += gain;
      if (p.kind === 'interest') { // Amendoim: juros das sementes guardadas
        p.lastInterest = Math.min(Math.floor(p.materials * 0.12), 8 + this.wave * 2);
        p.materials += p.lastInterest;
      }
      if (p === this.player) this.seedsCollected += gain;
      this.addXp(p, gain);
      p.notePeaks();
    }
    this.lastHarvest = this.player.lastHarvest;
    this.enemies = []; this.telegraphs = []; this.bullets = []; this.enemyBullets = []; this.pickups = [];
    this.boss = null;
    this.ending = false;
    if (this.onWaveEnd) this.onWaveEnd();
    if (this.wave >= this.maxWave() && this.pvp !== 'prep') {
      this.state = 'VICTORY';
      this.fx.runEnded(true, this.wave);
      return;
    }
    this.enterBetweenWaves();
  }

  /** PvP: terminou as 15 rodadas (a loja mostra "Ir pro duelo"). */
  prepFinished() { return this.pvp === 'prep' && this.wave >= PVP_PREP_WAVES; }

  /** Dados da partida para os recordes e desbloqueios (chamado no fim). */
  runInfo(won) {
    const p = this.player;
    const full = p.weapons.length >= p.maxWeapons() && p.weapons.every((w) => w.tier >= 3);
    return {
      won, wave: this.wave, kills: this.kills, seeds: this.seedsCollected, diff: this.difficulty,
      vamp: won && p.peakLs >= 50,
      alien: won && full && p.stats[Stat.RANGE] > 100,
      char: CHARS.indexOf(p.character), daily: this.daily ? this.daily.date : null,
      bosses: this.runStats.bosses, elites: this.runStats.elites, bought: this.runStats.bought,
    };
  }

  /** Começa o intervalo entre ondas do jogador deste computador: melhorias, caixas e loja. */
  enterBetweenWaves() {
    if (this.levelsPending > 0) {
      this.state = 'LEVEL_UP';
      this.levelRerolls = 0;
      this.rollLevelChoices();
    } else {
      this.afterLevelUps();
    }
  }

  /** Depois das melhorias: abre as caixas (se houver) e depois a loja. */
  afterLevelUps() {
    if (this.player.crates > 0) this.openCrate();
    else this.openShop();
  }

  /** Fim da onda animado: insetos somem e as sementes voam até os jogadores. */
  beginEnding() {
    this.ending = true;
    this.decoys = []; this.wells = []; this.echoes = [];
    this.endTimer = 1.3;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.dead = true;
      this.burst(e.x, e.y, 6, '139,107,74', 140, 5, 0.4);
    }
    this.telegraphs = []; this.bullets = []; this.enemyBullets = [];
    this.boss = null;
    for (const pk of this.pickups) pk.attracted = true;
    this.showBanner(this.prepDowned ? 'VOCÊ CAIU! FIM DA RODADA' : this.pvp === 'prep' ? 'RODADA CONCLUÍDA!' : 'ONDA CONCLUÍDA!');
    this.snd('WAVE_END');
  }

  // --- Multiplayer: troca de dados entre os computadores ---

  /** Troca os dados de um jogador (vindos da rede), mantendo id, nome, cor e posição. */
  replacePlayer(id, data) {
    const i = this.players.findIndex((p) => p.id === id);
    if (i < 0) return null;
    const old = this.players[i];
    const p = playerFromData(data, old.id, old.name, old.slot);
    if (!p) return null;
    p.remote = old.remote;
    p.x = old.x; p.y = old.y; p.tx = old.tx; p.ty = old.ty; p.alive = old.alive;
    p.facingLeft = old.facingLeft;
    this.players[i] = p;
    if (old === this.player) this.player = p;
    return p;
  }

  /** Convidado: começa o intervalo entre ondas com os dados que o anfitrião mandou. */
  beginRemoteBreak(data, wave) {
    const p = this.replacePlayer(this.player.id, data);
    if (!p) return false;
    this.wave = wave;
    this.lastHarvest = p.lastHarvest;
    this.ending = false;
    this.enemies = []; this.telegraphs = []; this.bullets = []; this.enemyBullets = []; this.pickups = [];
    this.boss = null;
    this.enterBetweenWaves();
    return true;
  }

  // --- Caixas ---

  openCrate() {
    this.state = 'CRATE';
    const tier = rollTier(this.rng, this.wave + 3, this.player.stats[Stat.LUCK]);
    const pool = itemPool(this.player, tier);
    this.crateItem = pool[this.rng.int(pool.length)];
  }

  crateRecyclePrice() {
    return this.crateItem ? Math.max(1, Math.round(itemPrice(this.crateItem, this.wave + 1) * 0.35)) : 0;
  }

  /** Pega (true) ou recicla (false) o item da caixa. */
  resolveCrate(take) {
    if (this.state !== 'CRATE' || !this.crateItem) return;
    if (take) { this.player.addItem(this.crateItem); this.fx.sound('LEVEL_UP'); }
    else { this.player.materials += this.crateRecyclePrice(); this.fx.sound('BUY'); }
    this.crateItem = null;
    this.player.crates--;
    if (this.player.crates > 0) this.openCrate();
    else this.openShop();
  }

  /** Vida chegou a zero: a Batata-Doce Fênix renasce uma vez por onda; os outros caem. */
  checkDown(p) {
    if (p.kind === 'phoenix' && p.revive) {
      p.revive = false; p.reviveWait = this.pvp === 'duel' ? 0 : 2;
      p.hp = Math.ceil(p.maxHp() * 0.4);
      p.iframes = 1.5;
      this.addText(p.x, p.y - 60, 'RENASCEU! 🔥', '#FFB040', 34);
      this.burst(p.x, p.y, 40, '255,140,30', 320, 9, 0.8);
      this.explodeAt(p.x, p.y, 190, Math.round((25 + p.stats[Stat.ELEMENTAL] * 4 + this.wave * 3) * p.damageMult()), false, 40, 6, p.extraSrc, p);
      this.snd('LEVEL_UP', p); this.vib(150, p);
      return;
    }
    this.playerDown(p);
  }

  /** Um jogador caiu (no modo solo, isso é o fim da partida). */
  playerDown(p) {
    p.alive = false;
    p.hp = 0;
    p.iframes = 0;
    p.laser.on = false;
    for (const w of p.weapons) w.attackT = -1;
    if (this.pvp === 'prep') {
      // PvP: cair na preparação só acaba a rodada (as sementes no chão se perdem)
      this.prepDowned = true;
      this.pickups = [];
      this.burst(p.x, p.y, 24, '255,90,74', 220, 7, 0.6);
      this.snd('HURT'); this.vib(300);
      this.beginEnding();
      return;
    }
    if (this.pvp === 'duel') {
      this.burst(p.x, p.y, 40, '255,90,74', 300, 8, 0.8);
      this.addText(p.x, p.y - 50, (p === this.player ? 'Você' : p.name) + ' perdeu!', '#FF8A7A', 32);
      this.snd('HURT', p); this.vib(300, p); this.shakeAt(10);
      return;
    }
    if (this.players.length > 1) {
      this.burst(p.x, p.y, 24, '255,90,74', 220, 7, 0.6);
      this.addText(p.x, p.y - 50, (p === this.player ? 'Você' : p.name) + ' caiu!', '#FF8A7A', 30);
      this.snd('HURT', p);
      this.vib(300, p);
    }
  }

  gameOver() {
    this.state = 'GAME_OVER';
    this.player.hp = 0;
    this.player.alive = false;
    this.fx.sound('HURT');
    this.fx.vibrate(300);
    this.fx.runEnded(false, this.wave);
  }

  showBanner(s) { this.banner = s; this.bannerTime = 2.2; }

  // --- Level up ---

  addXp(p, v) {
    p.xp += v;
    while (p.xp >= p.xpToNext()) {
      p.xp -= p.xpToNext();
      p.level++;
      p.stats[Stat.HP] += 1;
      if (p.alive) p.hp += 1;
      p.levelsPending++;
      if (this.state === 'PLAYING' && p.alive) {
        this.addText(p.x, p.y - 50, 'NÍVEL ' + p.level + '!', '#7CFF6B', 34);
        this.snd('LEVEL_UP', p);
      }
    }
  }

  rollLevelChoices() {
    // atributos que já estão no limite não aparecem
    const order = [...Array(Stat.COUNT).keys()].filter((i) => !Stat.CAP[i] || this.player.stats[i] < Stat.CAP[i]);
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
    p.notePeaks();
    if (stat === Stat.HP) p.hp += amount;
    p.hp = Math.min(p.hp, p.maxHp());
    p.levelsPending--;
    this.fx.sound('BUY');
    if (this.levelsPending > 0) { this.levelRerolls = 0; this.rollLevelChoices(); }
    else this.afterLevelUps();
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
      if (!this.offers[i] || !this.offers[i].locked) this.offers[i] = randomOffer(this.rng, this.player, this.wave + 1, this.dmod('minTier'));
    }
  }

  shopRerollCost() { return Math.max(1, Math.round(this.wave * 0.75)) + this.shopRerolls * Math.max(1, Math.floor(this.wave / 2)); }

  rerollShop() {
    const cost = this.shopRerollCost();
    if (this.player.materials < cost) { this.fx.sound('ERROR'); return false; }
    this.player.materials -= cost;
    this.shopRerolls++;
    for (let i = 0; i < SHOP_SLOTS; i++) {
      if (!this.offers[i] || !this.offers[i].locked) this.offers[i] = randomOffer(this.rng, this.player, this.wave + 1, this.dmod('minTier'));
    }
    this.fx.sound('PICKUP');
    return true;
  }

  toggleLock(i) { if (this.offers[i]) this.offers[i].locked = !this.offers[i].locked; }

  checkBuy(i) {
    const o = this.offers[i];
    if (!o) return BUY_EMPTY;
    if (this.player.materials < o.price) return BUY_NO_MONEY;
    if (o.weapon && this.player.weapons.length >= this.player.maxWeapons() && this.findMergeTarget(o.weapon, o.tier, -1) < 0) return BUY_FULL;
    return BUY_OK;
  }

  buy(i) {
    const check = this.checkBuy(i);
    if (check !== BUY_OK) { this.fx.sound('ERROR'); return check; }
    const o = this.offers[i];
    const p = this.player;
    if (o.weapon) {
      if (p.weapons.length < p.maxWeapons()) p.weapons.push(new Weapon(o.weapon, o.tier));
      else p.weapons[this.findMergeTarget(o.weapon, o.tier, -1)].tier++;
    } else {
      p.addItem(o.item);
    }
    p.materials -= o.price;
    p.applySets();
    this.runStats.bought++;
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
    this.player.applySets();
    this.fx.sound('LEVEL_UP');
    return true;
  }

  canSell(idx) { return idx >= 0 && idx < this.player.weapons.length && this.player.weapons.length > 1; }

  sellWeapon(idx) {
    if (!this.canSell(idx)) { this.fx.sound('ERROR'); return false; }
    const w = this.player.weapons.splice(idx, 1)[0];
    this.player.applySets();
    this.player.materials += w.sellPrice(this.wave + 1);
    this.fx.sound('BUY');
    return true;
  }

  // --- Atualização ---

  update(dt, jx, jy) {
    if (this.bannerTime > 0) this.bannerTime -= dt;
    if (this.state !== 'PLAYING' || this.paused) return;
    this.clock = (this.clock || 0) + dt; // relógio que nunca volta (limite do roubo de vida)
    this.shake = Math.max(0, this.shake - dt * 25);
    const me = this.player;
    if (me && !me.remote) {
      me.aimAng = this.input.aimAng; me.wantFire = !!this.input.fire;
      if (this.input.dash) { this.input.dash = false; if (me.kind === 'dash') this.tryDash(me); }
    }
    if (this.pvp === 'duel') { this.updateDuel(dt, jx, jy); return; }
    if (this.ending) {
      this.updatePlayer(dt, jx, jy);
      this.updateWeapons(dt, true); // as armas acompanham o legume (antes ficavam paradas pra trás)
      for (const p of this.players) { p.laser.on = false; if (p.kind === 'minions') p.minionAng += dt * 1.8; }
      this.updatePickups(dt);
      this.updateEffects(dt);
      this.cleanup();
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.endWave();
      return;
    }
    this.waveTime += dt;
    this.updatePlayer(dt, jx, jy);
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.separateEnemies();
    this.updateWeapons(dt);
    this.updateAbilities(dt);
    this.updateBullets(dt);
    this.updateEnemyBullets(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
    this.cleanup();
    for (const p of this.players) if (p.alive && p.hp <= 0) this.checkDown(p);
    if (this.ending) return; // PvP: cair na preparação já encerrou a rodada
    if (!this.players.some((p) => p.alive)) { this.gameOver(); return; }
    if (this.waveTime >= this.waveDuration) this.beginEnding();
  }

  // --- Duelo (PvP) ---

  updateDuel(dt, jx, jy) {
    this.updatePlayer(dt, jx, jy);
    if (this.countdown > 0) {
      this.countdown -= dt;
      this.updateWeapons(dt, true);
      this.updateEffects(dt);
      if (this.countdown <= 0) { this.showBanner('LUTEM!'); this.snd('LEVEL_UP'); }
      return;
    }
    this.duelTime += dt;
    this.waveTime = this.duelTime;
    const z = this.zone;
    z.r = Math.max(z.min, 760 - this.duelTime * 8);
    this.zoneTick -= dt;
    if (this.zoneTick <= 0) {
      this.zoneTick = 0.5;
      const dmg = 2 + Math.floor(this.duelTime / 12);
      for (const p of this.players) {
        if (!p.alive || Math.hypot(p.x - z.x, p.y - z.y) <= z.r) continue;
        p.hp -= dmg;
        this.addText(p.x, p.y - 40, '-' + dmg, '#FF5A2A', 26);
        this.snd('HURT', p);
      }
    }
    this.updateWeapons(dt);
    this.updateAbilities(dt);
    this.updateBullets(dt);
    this.updateEffects(dt);
    this.cleanup();
    for (const p of this.players) if (p.alive && p.hp <= 0) this.checkDown(p);
    const alive = this.players.filter((p) => p.alive);
    if (alive.length <= 1) {
      this.duelWinner = alive.length ? alive[0].id : '';
      this.state = 'DUEL_END';
      this.snd(alive[0] === this.player ? 'LEVEL_UP' : 'HURT');
    }
  }

  /** Inimigos de um jogador: os insetos, ou (no duelo) os outros jogadores. */
  foesOf(p) {
    if (this.pvp === 'duel') return this.players.filter((q) => q !== p && q.alive);
    return this.enemies;
  }

  /** Alvo mais perto para as armas de "owner". */
  nearestFoe(owner, x, y, range, exclude) {
    if (this.pvp !== 'duel') return this.nearestEnemy(x, y, range, exclude);
    let best = null, bestD = Infinity;
    for (const q of this.players) {
      if (q === owner || !q.alive || (exclude && exclude.includes(q))) continue;
      const d = Math.hypot(q.x - x, q.y - y) - q.radius;
      if (d < range && d < bestD) { bestD = d; best = q; }
    }
    return best;
  }

  /** Acerta um inseto ou (no duelo) outro jogador. */
  hitFoe(t, dmg, crit, kx, ky, kb, burn, color, src, owner) {
    if (t instanceof Player) this.hitPlayer(t, dmg, crit, kx, ky, kb, src, owner || (src && src.owner));
    else this.damageEnemy(t, dmg, crit, kx, ky, kb, burn, color, src, owner);
  }

  /** Dano de um jogador em outro (duelo): reduzido, com armadura e esquiva. */
  hitPlayer(q, dmg, crit, kx, ky, kb, src, owner) {
    if (!q.alive || q.iframes > 0) return;
    const real = Math.max(1, Math.round(dmg * DUEL_DMG));
    const before = q.hp;
    this.damagePlayer(q, real, null, 0.22);
    const done = before - q.hp;
    if (src && done > 0) { src.waveDamage += done; src.totalDamage += done; }
    if (!q.remote && kb > 0 && done > 0) {
      q.x = clamp(q.x + kx * kb * 0.8, q.radius, WORLD_W - q.radius);
      q.y = clamp(q.y + ky * kb * 0.8, q.radius, WORLD_H - q.radius);
    }
    if (owner && done > 0) this.tryLifesteal(owner, src);
  }

  tryLifesteal(p, src) {
    let ls = p.stat(Stat.LIFESTEAL);
    if (p.kind === 'vampire' && src && src.def && src.def.type === MELEE) ls += 30; // Vampiro Kiwi
    // no máximo 1 de vida a cada 0,15 s pelo roubo de vida (senão armas rápidas deixam imortal)
    if (p.alive && ls > 0 && p.hp < p.maxHp() && (this.clock || 0) - (p.lsAt === undefined ? -1 : p.lsAt) >= 0.15 && this.rng.int(100) < ls) { p.lsAt = this.clock || 0; p.heal(1); }
  }

  // --- Habilidades das classes ---

  updateAbilities(dt) {
    for (const p of this.players) {
      if (!p.alive) continue;
      const k = p.kind;
      if (k === 'laser') this.updateLaser(p, dt);
      else if (k === 'mines') this.updateMineDrop(p, dt);
      else if (k === 'minions') this.updateMinions(p, dt);
      else if (k === 'ram') this.updateRam(p, dt);
      else if (k === 'aura') this.updateAura(p, dt);
      else if (k === 'decoy') this.updateDecoyDrop(p, dt);
      else if (k === 'barrier') p.shieldCd -= dt;
      else if (k === 'fear') this.updateFear(p, dt);
      else if (k === 'grow') {
        p.growth = Math.min(0.75, Math.floor((this.pvp === 'duel' ? this.duelTime : this.waveTime) / 4) * 0.05);
        p.radius = 26 * (1 + p.growth * 0.5);
      }
      else if (k === 'dash') this.updateDash(p, dt);
      else if (k === 'gravity') this.updateGravity(p, dt);
      else if (k === 'mirror') this.updateMirror(p, dt);
      else if (k === 'elements') p.elemT += dt;
      if (p.roulette >= 0 && ROULETTE[p.roulette].heal) { // roleta: cura total de tempos em tempos
        p.rhealT += dt;
        if (p.rhealT >= ROULETTE[p.roulette].heal) { p.rhealT = 0; p.hp = p.maxHp(); this.addText(p.x, p.y - 50, 'CURA!', '#6BFF7A', 26); }
      }
    }
    if (this.mines.length) this.updateMines(dt);
    if (this.decoys.length) this.updateDecoys(dt);
    if (this.wells.length) this.updateWells(dt);
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const ec = this.echoes[i];
      ec.t -= dt;
      if (ec.t > 0) continue;
      this.echoes.splice(i, 1);
      if (ec.w.owner && ec.w.owner.alive && !this.ending) this.fireWeapon(ec.w, ec.ang, 0.35, true);
    }
  }

  /** Dano de habilidade, que cresce com a onda e com o elemental. */
  abilityDamage(p, base, perWave, elem) {
    return Math.max(1, Math.round((base + this.wave * perWave + p.stats[Stat.ELEMENTAL] * elem) * p.damageMult()));
  }

  /** Limão Azedo: aura ácida. */
  auraRadius(p) { return 100 + Math.max(0, p.stats[Stat.RANGE]) * 0.25 + p.stats[Stat.ELEMENTAL] * 2; }
  updateAura(p, dt) {
    p.auraT -= dt;
    if (p.auraT > 0 || this.ending) return;
    p.auraT = 0.6;
    const r = this.auraRadius(p), dmg = this.abilityDamage(p, 2, 0.45, 1.2);
    for (const f of this.foesOf(p)) {
      if (f.dead) continue;
      const rr = r + f.radius;
      if ((f.x - p.x) * (f.x - p.x) + (f.y - p.y) * (f.y - p.y) > rr * rr) continue;
      if (!(f instanceof Player)) f.acid = 0.7;
      this.hitFoe(f, dmg, false, 0, 0, 0, 0, '#D4FF4A', p.extraSrc, p);
    }
  }

  /** Uva Ilusionista: deixa uma uva falsa que atrai os insetos e explode. */
  updateDecoyDrop(p, dt) {
    p.decoyCd -= dt;
    if (p.decoyCd > 0 || this.ending) return;
    p.decoyCd = 12 / Math.sqrt(this.atkFactor(p));
    this.decoys.push({ x: p.x, y: p.y, t: 4, owner: p, radius: 22 });
    this.snd('PICKUP', p);
  }
  updateDecoys(dt) {
    for (const dc of this.decoys) {
      dc.t -= dt;
      if (dc.t > 0 || this.ending) continue;
      const p = dc.owner;
      this.explodeAt(dc.x, dc.y, 140 + p.stats[Stat.ELEMENTAL] * 3, this.abilityDamage(p, 18, 2.2, 3), false, 30, 0, p.extraSrc, p);
      this.burst(dc.x, dc.y, 20, '150,80,200', 220, 7, 0.6);
    }
    this.decoys = this.decoys.filter((dc) => dc.t > 0 && !this.ending);
  }

  /** Alho Exorcista: bafo que assusta e machuca. */
  updateFear(p, dt) {
    p.fearCd -= dt;
    if (p.fearCd > 0 || this.ending) return;
    p.fearCd = 6 / Math.sqrt(this.atkFactor(p));
    const r = 230;
    this.ring(p.x, p.y, r);
    this.burst(p.x, p.y, 16, '230,230,200', 260, 6, 0.6);
    const dmg = this.abilityDamage(p, 5, 1, 2);
    for (const f of this.foesOf(p)) {
      if (f.dead) continue;
      const rr = r + f.radius;
      if ((f.x - p.x) * (f.x - p.x) + (f.y - p.y) * (f.y - p.y) > rr * rr) continue;
      if (!(f instanceof Player)) f.fear = 2;
      this.hitFoe(f, dmg, false, 0, 0, 20, 0, '#F0F4C3', p.extraSrc, p);
    }
  }

  /** Alface Ventania: dash. */
  tryDash(p) {
    if (p.dashCd > 0 || p.dashT > 0 || !p.alive) return;
    const len = Math.hypot(p.lookX, p.lookY) || 1;
    p.dashX = p.lookX / len; p.dashY = p.lookY / len;
    p.dashT = 0.2; p.dashCd = 2.5; p.dashHit = [];
    p.iframes = Math.max(p.iframes, 0.3);
    this.burst(p.x, p.y, 10, '200,255,200', 200, 6, 0.4);
    this.snd('SHOOT', p);
  }
  updateDash(p, dt) {
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.dashT <= 0) return;
    p.dashT -= dt;
    if (this.particles.length < 450) this.burst(p.x, p.y, 1, '200,255,200', 40, 6, 0.3);
    const dmg = this.abilityDamage(p, 10, 1.2, 0) + Math.round(p.stats[Stat.MELEE] * 2 * p.damageMult());
    for (const f of this.foesOf(p)) {
      if (f.dead || p.dashHit.includes(f)) continue;
      const rr = f.radius + p.radius + 10;
      if ((f.x - p.x) * (f.x - p.x) + (f.y - p.y) * (f.y - p.y) > rr * rr) continue;
      p.dashHit.push(f);
      this.hitFoe(f, dmg, false, p.dashX, p.dashY, 25, 0, '#C8FFC8', p.extraSrc, p);
    }
  }

  /** Azeitona Gravitacional: buraco negro que puxa e implode. */
  updateGravity(p, dt) {
    p.gravCd -= dt;
    if (p.gravCd > 0 || this.ending) return;
    const t = this.nearestFoe(p, p.x, p.y, 450, null);
    if (!t) return;
    p.gravCd = 7 / Math.sqrt(this.atkFactor(p));
    this.wells.push({ x: t.x, y: t.y, t: 2, owner: p });
  }
  updateWells(dt) {
    for (const wl of this.wells) {
      wl.t -= dt;
      for (const e of this.enemies) {
        if (e.dead || e.def.boss) continue;
        const dx = wl.x - e.x, dy = wl.y - e.y, d = Math.hypot(dx, dy);
        if (d > 270 || d < 6) continue;
        const pull = 220 * dt * (1 - d / 300);
        e.x += dx / d * pull; e.y += dy / d * pull;
      }
      if (wl.t <= 0 && !this.ending) {
        const p = wl.owner;
        this.explodeAt(wl.x, wl.y, 170, this.abilityDamage(p, 15, 2, 3), false, 10, 0, p.extraSrc, p);
        this.burst(wl.x, wl.y, 24, '120,60,200', 260, 7, 0.6);
      }
    }
    this.wells = this.wells.filter((wl) => wl.t > 0 && !this.ending);
  }

  /** Pera Espelho: devolve um tiro inimigo, bem mais forte. */
  updateMirror(p, dt) {
    if (p.mirrorCd > 0) { p.mirrorCd -= dt; return; }
    if (this.ending) return;
    const list = this.pvp === 'duel' ? this.bullets.filter((b) => b.owner && b.owner !== p && !b.dead) : this.enemyBullets;
    for (const b of list) {
      if (b.dead) continue;
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy > 90 * 90) continue;
      b.dead = true;
      p.mirrorCd = 1 / Math.sqrt(this.atkFactor(p));
      const t = this.nearestFoe(p, p.x, p.y, 700, null);
      const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(-dy, -dx) + Math.PI;
      const dmg = Math.max(1, Math.round(((b.damage || 3) * 4 + p.stats[Stat.RANGED] * 2 + this.wave * 1.5) * p.damageMult()));
      this.bullets.push({
        x: p.x, y: p.y, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, life: 1.2, damage: dmg, crit: false,
        pierce: 1, bounce: 0, explosion: 0, burn: 0, slow: 0, source: p.extraSrc, owner: p,
        knockback: 10, color: '#E1F5FE', lightning: false, mirror: true, radius: 9, dead: false, hit: [],
      });
      this.ring(p.x, p.y, 40);
      this.snd('HIT', p);
      return;
    }
  }

  /** Manga Elementar: 0 = fogo, 1 = gelo, 2 = raio (troca a cada 5 s). */
  elementOf(p) { return Math.floor(p.elemT / 5) % 3; }
  elementHit(p, e, dmg) {
    const el = this.elementOf(p);
    if (el === 0) {
      e.burnTime = 2.1;
      e.burnDamage = Math.max(e.burnDamage || 0, Math.round((3 + p.stats[Stat.ELEMENTAL] * 1.2) * p.damageMult()));
      e.burnSource = p.extraSrc;
      if (!(e.burnTick > 0)) e.burnTick = 0.5;
    } else if (el === 1) {
      e.slowTime = Math.max(e.slowTime || 0, 1.5);
    } else {
      const n = this.nearestEnemy(e.x, e.y, 170, [e]);
      if (n) {
        this.damageEnemy(n, Math.max(1, Math.round(dmg * 0.4)), false, 0, 0, 0, 0, '#FFF59D', p.extraSrc, p);
        this.burst(n.x, n.y, 4, '255,242,122', 140, 3, 0.25);
      }
    }
  }

  atkFactor(p) { return Math.max(0.2, 1 + p.stats[Stat.ATK_SPEED] / 100); }

  /** Números do canhão laser do Cyborg Cebola. */
  laserStats(p) {
    const cy = p.cy;
    return {
      dps: (W_LASER.baseDamage + p.stats[Stat.RANGED] * 2 + p.stats[Stat.ELEMENTAL] * 1.5)
        * p.damageMult() * (1 + cy.dmg / 100) * (1 + 0.035 * (p.level - 1)) * Math.sqrt(this.atkFactor(p)),
      range: Math.max(150, W_LASER.range + p.stats[Stat.RANGE] + cy.range),
      width: 14 + cy.width,
      fireTime: LASER_FIRE_TIME * (1 + cy.time / 100),
      cool: 1 + cy.cool / 100,
      crit: p.stats[Stat.CRIT] + cy.crit,
    };
  }

  updateLaser(p, dt) {
    const L = p.laser, st = this.laserStats(p);
    const can = !this.ending && !(this.pvp === 'duel' && this.countdown > 0);
    if (L.over) {
      // superaquecido: o tempo pra esfriar é proporcional ao tempo de tiro (80% dele)
      L.on = false;
      L.heat -= dt / (st.fireTime * 0.8) * st.cool;
      if (L.heat <= 0) { L.heat = 0; L.over = false; this.snd('PICKUP', p); }
    } else if (p.wantFire && can) {
      L.on = true;
      L.heat += dt / st.fireTime;
      if (L.heat >= 1) {
        L.heat = 1; L.over = true; L.on = false;
        this.addText(p.x, p.y - 56, 'SUPERAQUECEU!', '#FF6A3A', 28);
        this.snd('ERROR', p);
        this.burst(p.x + Math.cos(p.aimAng) * 34, p.y + Math.sin(p.aimAng) * 34, 16, '200,200,200', 120, 7, 0.8);
        if (p.cy.boom > 0) this.explodeAt(p.x, p.y, 170 + p.cy.boom * 30, st.dps * 1.4 * p.cy.boom, false, 30, 0, p.weapons[0], p);
      }
    } else {
      L.on = false;
      L.heat = Math.max(0, L.heat - dt / 2.5 * st.cool);
    }
    if (!L.on) { L.tick = 0; return; }
    L.tick -= dt;
    if (L.tick > 0) return;
    L.tick += 0.1;
    L.n = (L.n || 0) + 1;
    const w = p.weapons[0];
    this.fireLaser(p, p.aimAng, st, 1, w);
    for (let k = 1; k <= p.cy.split; k++) {
      this.fireLaser(p, p.aimAng + 0.22 * k, st, 0.4, w);
      this.fireLaser(p, p.aimAng - 0.22 * k, st, 0.4, w);
    }
    p.shots++;
    if (p === this.player && L.n % 2 === 0) this.fx.sound('SHOOT');
  }

  /** Um "tique" do feixe (10 por segundo): acerta tudo que estiver na linha. */
  fireLaser(p, ang, st, mult, w) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const x0 = p.x + c * 30, y0 = p.y + s * 30 + 4, len = st.range * (mult < 1 ? 0.8 : 1);
    const quiet = p.laser.n % 3 !== 0; // número de dano só a cada 3 tiques (senão vira bagunça)
    for (const f of this.foesOf(p)) {
      if (f.dead) continue;
      const dx = f.x - x0, dy = f.y - y0;
      const t = clamp(dx * c + dy * s, 0, len);
      const px = x0 + c * t - f.x, py = y0 + s * t - f.y;
      const r = f.radius + st.width / 2;
      if (px * px + py * py >= r * r) continue;
      const crit = this.rng.int(100) < st.crit;
      const dmg = st.dps * 0.1 * mult * (crit ? 2 : 1);
      this.hitFoe(f, dmg, crit, c, s, W_LASER.knockback, 0, quiet ? 'none' : crit ? '#FFE14A' : '#FF9AA8', w, p);
      if (!quiet && this.particles.length < 400) this.burst(f.x - c * f.radius, f.y - s * f.radius, 2, '255,90,110', 120, 4, 0.2);
    }
  }

  /** Melancia Minadora: planta minas enquanto anda. */
  updateMineDrop(p, dt) {
    p.mineTimer -= dt;
    if (p.mineTimer > 0 || !p.moving || this.ending) return;
    const max = 5 + Math.floor(p.level / 4);
    if (this.mines.filter((m) => m.owner === p).length >= max) return;
    this.mines.push({ x: p.x, y: p.y + 12, owner: p, arm: 0.7, t: 0, dead: false });
    p.mineTimer = 1.4 / this.atkFactor(p);
  }

  updateMines(dt) {
    for (const m of this.mines) {
      m.t += dt;
      if (m.arm > 0) { m.arm -= dt; continue; }
      const p = m.owner;
      if (this.ending) continue;
      let hit = false;
      for (const f of this.foesOf(p)) {
        if (f.dead) continue;
        const r = f.radius + 40;
        if ((f.x - m.x) * (f.x - m.x) + (f.y - m.y) * (f.y - m.y) < r * r) { hit = true; break; }
      }
      if (!hit) continue;
      m.dead = true;
      const dmg = (10 + p.stats[Stat.ELEMENTAL] * 3 + this.wave * 1.6) * p.damageMult();
      this.explodeAt(m.x, m.y, 85 + p.stats[Stat.ELEMENTAL] * 2.5, Math.round(dmg), false, 20, 0, p.extraSrc, p);
    }
    this.mines = this.mines.filter((m) => !m.dead && m.owner.alive !== undefined);
  }

  minionCount(p) { return Math.min(6, 2 + Math.floor((p.level - 1) / 4)); }
  minionPos(p, i, n) {
    const a = p.minionAng + Math.PI * 2 * i / n;
    return [p.x + Math.cos(a) * 66, p.y + Math.sin(a) * 50 - 6];
  }

  /** Mirtilo Invocador: mirtilinhos que voam em volta e atiram sozinhos. */
  updateMinions(p, dt) {
    p.minionAng += dt * 1.8;
    const n = this.minionCount(p);
    while (p.minionCd.length < n) p.minionCd.push(this.rng.float() * 0.6);
    if (this.ending || (this.pvp === 'duel' && this.countdown > 0)) return;
    for (let i = 0; i < n; i++) {
      p.minionCd[i] -= dt;
      if (p.minionCd[i] > 0) continue;
      const [x, y] = this.minionPos(p, i, n);
      const t = this.nearestFoe(p, x, y, 330, null);
      if (!t) continue;
      p.minionCd[i] = 1.1 / this.atkFactor(p);
      const a = Math.atan2(t.y - y, t.x - x), sp = 620;
      const crit = this.rng.int(100) < p.stats[Stat.CRIT];
      const dmg = Math.max(1, Math.round((4 + p.stats[Stat.ELEMENTAL] + p.stats[Stat.RANGED] * 0.6 + this.wave * 0.35) * p.damageMult() * (crit ? 2 : 1)));
      this.bullets.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 400 / sp, damage: dmg, crit,
        pierce: 0, bounce: 0, explosion: 0, burn: 0, slow: 0, source: p.extraSrc, owner: p,
        knockback: 4, color: '#6A7BFF', lightning: false, minion: true, radius: 6, dead: false, hit: [],
      });
    }
  }

  /** Coco Rolante: atropela quem encosta enquanto anda. */
  updateRam(p, dt) {
    const foes = this.foesOf(p);
    for (const f of foes) if (f.ramCd > 0) f.ramCd -= dt;
    if (!p.moving || this.ending || (this.pvp === 'duel' && this.countdown > 0)) return;
    const sp = p.speed() / 240;
    const dmg = (6 + p.stats[Stat.ARMOR] * 1.5 + p.stats[Stat.MELEE] * 1.5 + this.wave * 0.9) * sp * p.damageMult();
    for (const f of foes) {
      if (f.dead || f.ramCd > 0) continue;
      const r = f.radius + p.radius + 6;
      const dx = f.x - p.x, dy = f.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2) + 0.001;
      f.ramCd = 0.4;
      this.hitFoe(f, Math.round(dmg), false, dx / d, dy / d, 26, 0, '#FFD27A', p.extraSrc, p);
      this.burst(f.x, f.y, 4, '230,200,150', 140, 4, 0.3);
    }
  }

  updatePlayer(dt, jx, jy) {
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.remote) this.followNet(p, dt);
      else if (p === this.player) this.movePlayer(p, dt, jx, jy);
      if (p.iframes > 0) p.iframes -= dt;
      const regen = p.stat(Stat.REGEN);
      if (regen > 0 && p.hp < p.maxHp()) {
        p.regenAcc += dt * regen * 0.12;
        while (p.regenAcc >= 1) { p.regenAcc -= 1; p.heal(1); }
      }
    }
  }

  /** Anda com o joystick/teclado. */
  movePlayer(p, dt, jx, jy) {
    if (p.dashT > 0) { jx = p.dashX; jy = p.dashY; } // dash: vai reto pra frente
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
  }

  /** Jogador de outro computador: segue a posição recebida, prevendo o movimento enquanto a próxima não chega. */
  followNet(p, dt) {
    netStep(p, dt, 0.15, 18);
    p.x = clamp(p.x, p.radius, WORLD_W - p.radius);
    p.y = clamp(p.y, p.radius, WORLD_H - p.radius);
    if (p.moving) p.moveAnim += dt * 12;
  }

  // --- Inimigos ---

  /** Com mais jogadores, os insetos têm mais vida e aparecem mais rápido. */
  coopHp() { return 1 + 0.6 * (this.players.length - 1); }
  coopSpawn() { return 1 + 0.25 * (this.players.length - 1); }
  /** Vida dos insetos por onda: cresce rápido até a onda 20 e depois em linha reta (Inferno/Infinito). */
  static rawHp(w) {
    if (w <= 19) return 1 + 0.25 * w + 0.028 * w * w;
    return 1 + 0.25 * 19 + 0.028 * 361 + (0.25 + 0.056 * 19) * (w - 19);
  }
  hpMult() { return Game.rawHp(this.wave - 1) * this.coopHp(); }
  /** Chefe numa onda depois da "dele" (Infinito, Inferno) fica mais forte. */
  bossScale(d) { return Math.max(1, Game.rawHp(this.wave - 1) / Game.rawHp(d.minWave - 1)); }
  spawnInterval() { return Math.max(0.3, 1.6 - this.wave * 0.065) * DIFF_SPAWN[this.difficulty] / this.coopSpawn() / (this.dmod('spawn') || 1); }
  enemyCap() { return Math.min(175 + 15 * (this.players.length - 1), 70 + this.wave * 5 + 15 * (this.players.length - 1)); }

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
      if (d === E.ARANHA || d === E.MARIPOSA) return 3 + Math.floor(w / 4);
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
    // Infinito: depois da onda 20 os insetos ficam cada vez mais fortes (senão nunca acaba)
    const extra = this.difficulty === DIFF_ENDLESS && this.pvp !== 'prep' ? Math.max(0, this.wave - 20) : 0;
    const maxHp = d.hp * (d.boss ? this.coopHp() * this.bossScale(d) : this.hpMult()) * DIFF_HP[this.difficulty] * Math.pow(1.09, extra);
    const baseDmg = Math.max(1, Math.round((d.damage + d.damagePerWave * (this.wave - 1)) * Math.pow(1.07, extra)));
    const e = {
      id: this.nextEnemyId++, def: d, x, y, vx: 0, vy: 0, hp: maxHp, maxHp, radius: d.radius,
      speed: d.speed * (0.9 + this.rng.float() * 0.2) * (this.dmod('foeSpeed') || 1),
      damage: Math.max(1, Math.round(baseDmg * DIFF_DMG[this.difficulty])),
      flash: 0, dead: false, facingLeft: true, anim: 0,
      burnTime: 0, burnTick: 0, burnDamage: 0, burnSource: null, slowTime: 0, elite: false,
      aiState: 0, aiTimer: 1 + this.rng.float() * 1.5, aiTimer2: d.boss ? 6 : 0, dashX: 0, dashY: 0,
      spiral: d.boss ? 0 : this.rng.float() * 6.28,
    };
    // Poucos elites por onda: 1 a partir da onda 5, 2 a partir da 10, 3 a partir da 15.
    const maxElites = this.wave < 5 ? 0 : 1 + Math.floor((this.wave - 5) / 5) + (this.difficulty >= 3 ? 1 : 0) + (this.dmod('elites') ? 3 : 0);
    const eliteChance = (0.012 + 0.004 * this.difficulty) * (this.dmod('elites') || 1);
    if (!d.boss && this.elitesThisWave < maxElites && d !== E.VESPA && this.rng.float() < eliteChance) {
      this.elitesThisWave++;
      e.elite = true;
      e.maxHp *= 4; e.hp = e.maxHp;
      e.radius *= 1.35;
      e.damage = Math.round(e.damage * 1.5);
      e.speed *= 0.9;
    }
    this.enemies.push(e);
    this.burst(x, y, d.boss ? 30 : 6, '139,107,74', 120, 5, 0.4);
    if (d.boss) { this.boss = e; this.shakeAt(10); this.vib(120); }
    return e;
  }

  randomSpawnPos(minDist) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 30; tries++) {
      x = 60 + this.rng.float() * (WORLD_W - 120);
      y = 60 + this.rng.float() * (WORLD_H - 120);
      if (this.players.every((p) => !p.alive || Math.hypot(x - p.x, y - p.y) >= minDist)) break;
    }
    return [x, y];
  }

  updateEnemies(dt) {
    const ps = this.players;
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
          this.damageEnemy(e, e.burnDamage, false, 0, 0, 0, 0, '#FFA040', e.burnSource);
          if (e.dead) continue;
        }
        if (e.burnTime <= 0) e.burnDamage = 0;
      }

      if (e.acid > 0) e.acid -= dt;
      if (e.ramCd > 0) e.ramCd -= dt;
      const p = this.targetFor(e) || ps[0]; // persegue o jogador vivo mais perto (ou a uva falsa)
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy);
      let nx = d > 0.001 ? dx / d : 0, ny = d > 0.001 ? dy / d : 0;
      if (e.fear > 0) { e.fear -= dt; if (!e.def.boss) { nx = -nx; ny = -ny; } } // Alho: foge com medo
      let mx = 0, my = 0, sp = e.speed * this.foeSlow;

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
        case AI_BOSS_BEETLE:
          this.updateBeetleBoss(e, dt, nx, ny);
          if (e.aiState === 0) { mx = nx; my = ny; } else if (e.aiState === 1) { mx = nx * 0.2; my = ny * 0.2; } else if (e.aiState === 3) { mx = e.dashX; my = e.dashY; sp = 720; }
          break;
        case AI_BOSS_ANT:
          this.updateAntBoss(e, dt, nx, ny);
          if (e.aiState === 0) { mx = nx; my = ny; } else if (e.aiState === 1) { mx = nx * 0.3; my = ny * 0.3; } else if (e.aiState === 3) { mx = e.dashX; my = e.dashY; sp = 650; }
          break;
      }

      if (e.def.ai === AI_ZIGZAG) {
        const wob = Math.sin(e.anim * 5 + e.spiral) * 1.1;
        mx = nx - ny * wob; my = ny + nx * wob;
        const len = Math.hypot(mx, my) + 0.0001;
        mx /= len; my /= len;
      }
      if (e.slowTime > 0) { e.slowTime -= dt; sp *= 0.5; }
      if (e.freezeCd > 0) e.freezeCd -= dt;
      if (e.freeze > 0) { e.freeze -= dt; sp = 0; }
      e.x += mx * sp * dt;
      e.y += my * sp * dt;
      if (Math.abs(mx) > 0.05) e.facingLeft = mx < 0;
      e.x = clamp(e.x, e.radius * 0.5, WORLD_W - e.radius * 0.5);
      e.y = clamp(e.y, e.radius * 0.5, WORLD_H - e.radius * 0.5);
      for (const q of ps) {
        if (!q.alive) continue;
        const r = e.radius + q.radius - (q.remote ? 16 : 8); // quem está longe tem um pouco de folga (atraso da rede)
        if ((q.x - e.x) * (q.x - e.x) + (q.y - e.y) * (q.y - e.y) < r * r) this.damagePlayer(q, e.damage, e);
      }
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

  /** Besouro Infernal: anéis de fogo, investidas e chama escorpiões. */
  updateBeetleBoss(e, dt, nx, ny) {
    e.aiTimer -= dt;
    switch (e.aiState) {
      case 0:
        if (e.aiTimer <= 0) { e.aiState = 1; e.aiTimer = 2.2; e.aiTimer2 = 0; }
        break;
      case 1:
        e.aiTimer2 -= dt;
        if (e.aiTimer2 <= 0) {
          e.aiTimer2 = 0.55;
          e.spiral += 0.3;
          for (let k = 0; k < 18; k++) this.fireEnemyBullet(e.x, e.y, e.spiral + Math.PI * 2 * k / 18, 240, e.damage);
        }
        if (e.aiTimer <= 0) { e.aiState = 2; e.aiTimer = 0.6; e.dashX = nx; e.dashY = ny; }
        break;
      case 2:
        if (e.aiTimer <= 0) { e.aiState = 3; e.aiTimer = 0.7; }
        break;
      default:
        if (e.aiTimer <= 0) {
          e.aiState = 0;
          e.aiTimer = 2.6;
          for (let k = 0; k < 3; k++) {
            const a = Math.PI * 2 * k / 3 + e.spiral;
            this.telegraphs.push({ def: E.ESCORPIAO, x: clamp(e.x + Math.cos(a) * 140, 40, WORLD_W - 40), y: clamp(e.y + Math.sin(a) * 140, 40, WORLD_H - 40), time: 0.7 });
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

  damagePlayer(p, dmg, source, iframes) {
    if (p.iframes > 0 || !p.alive || this.state !== 'PLAYING' || this.ending) return;
    if (p.kind === 'barrier' && p.shieldCd <= 0) { // Abacate: o escudo bloqueia o golpe inteiro
      p.shieldCd = 6;
      p.iframes = 0.4;
      this.addText(p.x, p.y - 44, 'BLOQUEOU!', '#B2FF59', 26);
      this.explodeAt(p.x, p.y, 120, Math.round((8 + p.stats[Stat.ARMOR] * 2.5 + this.wave * 1.5) * p.damageMult()), false, 45, 0, p.extraSrc, p);
      return;
    }
    const thorns = p.specials[SP_THORNS];
    if (source && thorns > 0 && !source.dead) this.damageEnemy(source, thorns, false, 0, 0, 0, 0, '#FF7AB0', null, p);
    if (this.rng.int(100) < p.dodgeChance()) {
      this.addText(p.x, p.y - 40, 'Esquivou!', '#BFE8FF', 24);
      p.iframes = 0.25;
      return;
    }
    let d = Math.max(1, Math.round(dmg * p.armorFactor()));
    if (p.shellHp > 0) { // Casca de Ovo: escudo que absorve dano no começo da onda
      const a = Math.min(p.shellHp, d);
      p.shellHp -= a; d -= a;
      if (d <= 0) { p.iframes = 0.3; this.addText(p.x, p.y - 40, 'casca', '#FFF3C4', 20); return; }
    }
    p.hp -= d;
    p.iframes = iframes || 0.4;
    this.shakeAt(7, p);
    this.addText(p.x, p.y - 40, '-' + d, '#FF4A4A', 30);
    this.snd('HURT', p);
    this.vib(30, p);
  }

  // --- Armas ---

  /** idle = só acompanham o legume (fim da onda / contagem do duelo), sem atacar. */
  updateWeapons(dt, idle) {
    for (const p of this.players) if (p.alive) this.updatePlayerWeapons(p, dt, idle);
  }

  /** Onde fica a arma i (de n) em volta do legume. O Alien segura mais longe, com os tentáculos. */
  weaponSpot(p, i, n) {
    if (p.kind === 'laser') {
      const a = p.aimAng;
      return [p.x + Math.cos(a) * 34, p.y + Math.sin(a) * 28 + 8];
    }
    const a = n === 1 ? (p.facingLeft ? Math.PI : 0) : Math.PI * 2 * i / n - Math.PI / 2;
    const rx = p.kind === 'alien' ? 62 : 44, ry = p.kind === 'alien' ? 50 : 36;
    return [p.x + Math.cos(a) * rx, p.y + Math.sin(a) * ry + 6];
  }

  updatePlayerWeapons(p, dt, idle) {
    const n = p.weapons.length;
    for (let i = 0; i < n; i++) {
      const w = p.weapons[i];
      w.owner = p;
      const [hx, hy] = this.weaponSpot(p, i, n);
      const k = Math.min(1, dt * 20);
      w.x += (hx - w.x) * k;
      w.y += (hy - w.y) * k;
      if (w.def.laser) { w.angle = p.aimAng; w.tipX = w.x; w.tipY = w.y; continue; } // canhão manual
      if (idle) {
        w.attackT = -1; w.tipX = w.x; w.tipY = w.y;
        w.angle = lerpAngle(w.angle, p.facingLeft ? Math.PI : 0, Math.min(1, dt * 8));
        continue;
      }
      w.cd -= dt;
      if (w.attacking()) { this.updateMelee(w, dt); continue; }
      w.tipX = w.x; w.tipY = w.y;
      const t = this.nearestFoe(p, w.x, w.y, w.range(p), null);
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
    const p = w.owner;
    w.dirX = Math.cos(ang); w.dirY = Math.sin(ang);
    w.reach = clamp(Math.hypot(t.x - w.x, t.y - w.y), 30, w.range(p));
    w.attackDur = clamp(w.cooldown(p) * 0.45, 0.12, 0.28);
    w.attackT = 0;
    w.hitList.length = 0;
    this.shotSound(p);
  }

  /** Som de ataque só para as armas do jogador deste computador (os outros recebem pela rede). */
  shotSound(p) {
    p.shots++;
    if (p === this.player) this.fx.sound('SHOOT');
  }

  updateMelee(w, dt) {
    w.attackT += dt;
    const ph = w.attackT / w.attackDur;
    if (ph >= 1) { w.attackT = -1; w.tipX = w.x; w.tipY = w.y; return; }
    const ext = Math.sin(Math.PI * ph) * w.reach;
    w.tipX = w.x + w.dirX * ext;
    w.tipY = w.y + w.dirY * ext;
    const hr = w.def.hitRadius;
    for (const e of this.foesOf(w.owner)) {
      if (e.dead || w.hitList.includes(e)) continue;
      const r = e.radius + hr;
      const dx = e.x - w.tipX, dy = e.y - w.tipY;
      if (dx * dx + dy * dy < r * r) {
        w.hitList.push(e);
        const dmg = this.rollDamage(w);
        this.hitFoe(e, dmg, this.lastCrit, w.dirX, w.dirY, w.def.knockback, 0, null, w, w.owner);
        if (w.owner.kind === 'echo' && !e.dead) this.hitFoe(e, Math.max(1, Math.round(dmg * 0.35)), false, 0, 0, 0, 0, '#FF8FB1', w, w.owner);
      }
    }
  }

  fireWeapon(w, ang, mult, isEcho) {
    const def = w.def, p = w.owner;
    mult = mult || 1;
    if (p.kind === 'echo' && !isEcho) this.echoes.push({ w, ang, t: 0.18 }); // Cereja: o tiro se repete
    const range = w.range(p);
    const burn = w.burnDamage(p);
    for (let k = 0; k < def.pellets; k++) {
      let a = ang;
      if (def.pellets > 1) a += def.spread * (k / (def.pellets - 1) - 0.5);
      else a += (this.rng.float() - 0.5) * def.spread;
      const c = Math.cos(a), s = Math.sin(a);
      const dmg = Math.max(1, Math.round(this.rollDamage(w) * mult));
      this.bullets.push({
        x: w.x + c * 16, y: w.y + s * 16, vx: c * def.projSpeed, vy: s * def.projSpeed,
        life: (range + 40) / def.projSpeed, damage: dmg, crit: this.lastCrit,
        pierce: def.pierce, bounce: def.bounce, explosion: def.explosion, burn, slow: def.slow, source: w, owner: p,
        knockback: def.knockback, color: def.color, lightning: !!def.lightning,
        radius: def.explosion > 0 || def.burn > 0 || def.slow > 0 ? 10 : 7, dead: false, hit: [],
        boom: p.kind === 'boomerang', back: false, life0: (range + 40) / def.projSpeed,
      });
      const nb = this.bullets[this.bullets.length - 1];
      if (nb.boom) { nb.pierce = 99; nb.bounce = 0; } // Banana: atravessa tudo e volta
      if (isEcho) nb.echo = true;
    }
    if (!isEcho) this.shotSound(p);
  }

  rollDamage(w) {
    let d = w.baseDamage(w.owner);
    this.lastCrit = this.rng.int(100) < w.critChance(w.owner);
    if (this.lastCrit) d *= w.def.critMult;
    return Math.max(1, Math.round(d));
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (b.boom && b.owner) { // Banana: na metade do caminho, volta pro dono
        if (!b.back && b.life <= b.life0 * 0.5) { b.back = true; b.hit = []; b.life = 3; }
        if (b.back) {
          const dx = b.owner.x - b.x, dy = b.owner.y - b.y, d = Math.hypot(dx, dy) + 0.01;
          const sp = Math.hypot(b.vx, b.vy);
          b.vx += (dx / d * sp - b.vx) * Math.min(1, dt * 8); b.vy += (dy / d * sp - b.vy) * Math.min(1, dt * 8);
          if (d < 30) { b.dead = true; continue; }
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -50 || b.y < -50 || b.x > WORLD_W + 50 || b.y > WORLD_H + 50) {
        if (b.explosion > 0) this.explode(b);
        b.dead = true;
        continue;
      }
      for (const e of this.foesOf(b.owner)) {
        if (e.dead || b.hit.includes(e)) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        const r = e.radius + b.radius;
        if (dx * dx + dy * dy >= r * r) continue;
        if (b.explosion > 0) { this.explode(b); b.dead = true; break; }
        const sp = Math.hypot(b.vx, b.vy);
        if (b.slow > 0 && !(e instanceof Player)) e.slowTime = Math.max(e.slowTime, b.slow);
        this.hitFoe(e, b.damage, b.crit, b.vx / sp, b.vy / sp, b.knockback, b.burn, null, b.source, b.owner);
        b.hit.push(e);
        if (b.lightning) this.burst(e.x, e.y, 5, '255,242,122', 160, 3, 0.25);
        if (b.bounce > 0) {
          const nt = this.nearestFoe(b.owner, e.x, e.y, 320, b.hit);
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
    this.explodeAt(b.x, b.y, b.explosion, b.damage, b.crit, b.knockback, b.burn, b.source, b.owner);
  }

  explodeAt(x, y, r, damage, crit, kb, burn, src, owner) {
    if (this.explosionDepth > 6) return; // evita reação em cadeia infinita
    this.explosionDepth++;
    const who = owner || (src && src.owner) || null;
    const foes = this.pvp === 'duel' ? this.players.filter((q) => q !== who && q.alive) : this.enemies;
    for (const e of foes) {
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y;
      const rr = r + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) + 0.001;
        this.hitFoe(e, damage, crit, dx / d, dy / d, kb, burn, null, src, who);
      }
    }
    this.explosionDepth--;
    this.ring(x, y, r);
    this.burst(x, y, 14, '255,154,42', 260, 7, 0.45);
    this.shakeAt(4);
    this.snd('EXPLODE');
  }

  updateEnemyBullets(dt) {
    for (const b of this.enemyBullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.y < -30 || b.x > WORLD_W + 30 || b.y > WORLD_H + 30) { b.dead = true; continue; }
      for (const p of this.players) {
        if (!p.alive) continue;
        const r = p.radius * (p.remote ? 0.6 : 0.8) + b.radius;
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy < r * r) { b.dead = true; this.damagePlayer(p, b.damage); break; }
      }
    }
  }

  /** owner = jogador que causou o dano (roubo de vida, sorte...); se faltar, vem da arma. */
  damageEnemy(e, dmg, crit, kx, ky, kb, burn, textColor, src, owner) {
    if (e.dead) return;
    if (e.acid > 0) dmg = dmg * 1.15; // Limão: ácido amolece o inseto
    const who = owner || (src && src.owner) || null;
    if (src) {
      const real = Math.round(Math.min(dmg, Math.max(0, e.hp)));
      src.waveDamage += real;
      src.totalDamage += real;
    }
    e.hp -= dmg;
    e.flash = 0.08;
    if (who) {
      // Balança da Justiça: executa quem está quase morto
      const ex = Math.min(SP_CAP_EXECUTE, who.specials[SP_EXECUTE]);
      if (ex > 0 && !e.def.boss && e.hp > 0 && e.hp < e.maxHp * ex / 100) { e.hp = 0; this.addText(e.x, e.y - e.radius - 14, 'EXECUTADO', '#E0E0E0', 18); }
      // congelar (Gelo Seco, Galáxia, conjunto Glacial)
      // (no máximo 30% de chance, e quem descongela fica 1,5 s sem poder congelar de novo)
      const fr = Math.min(SP_CAP_FREEZE, who.specials[SP_FREEZE]);
      if (fr > 0 && e.hp > 0 && !e.def.boss && !(e.freezeCd > 0) && this.rng.int(100) < fr) { e.freeze = 1.2; e.freezeCd = 2.7; }
      // Manga Elementar: fogo, gelo ou choque
      if (who.kind === 'elements' && src && src.def && e.hp > 0) this.elementHit(who, e, dmg);
    }
    if (!e.def.boss && kb > 0) {
      const resist = e.def === E.JOANINHA || e.elite ? 0.4 : 1;
      e.vx += kx * kb * 12 * resist;
      e.vy += ky * kb * 12 * resist;
    }
    const color = textColor || (crit ? '#FFE14A' : '#FFFFFF');
    if (color !== 'none') this.addText(e.x + (this.rng.float() - 0.5) * 20, e.y - e.radius, String(Math.max(1, Math.round(dmg))), color, crit ? 30 : 22);
    if (burn > 0) {
      e.burnTime = 2.1;
      if (e.burnDamage < burn) e.burnDamage = burn;
      e.burnSource = src || null;
      if (e.burnTick <= 0) e.burnTick = 0.5;
    }
    const p = owner || (src && src.owner) || this.players[0];
    this.tryLifesteal(p, src);
    if (e.hp <= 0) this.killEnemy(e, p);
    else this.snd('HIT');
  }

  killEnemy(e, owner) {
    e.dead = true;
    this.kills++;
    if (e.def.boss) this.runStats.bosses++;
    if (e.elite) this.runStats.elites++;
    const drops = e.elite ? e.def.drops * 4 : e.def.drops;
    for (let i = 0; i < drops; i++) {
      const a = this.rng.float() * Math.PI * 2;
      const s = drops > 1 ? 60 + this.rng.float() * 180 : 20;
      this.dropMaterial(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s);
    }
    const p = owner || this.players[0];
    const luck = Math.max(0.2, 1 + p.stats[Stat.LUCK] / 100);
    if (!e.def.boss && this.rng.float() < 0.025 * luck) {
      this.pickups.push({ type: 1, x: e.x, y: e.y, vx: 0, vy: 0, value: 3 + p.specials[SP_FRUIT], attracted: false, dead: false, bob: 0 });
    }
    const crateChance = 0.004 * luck * (1 + p.specials[SP_CRATE] / 100);
    if (e.elite || e.def.boss || (this.cratesDroppedThisWave < 2 && this.rng.float() < crateChance)) {
      this.cratesDroppedThisWave++;
      this.pickups.push({ type: 2, x: e.x, y: e.y, vx: (this.rng.float() - 0.5) * 200, vy: (this.rng.float() - 0.5) * 200, value: 1, attracted: false, dead: false, bob: 0 });
    }
    const boom = p.specials[SP_BOOM];
    if (boom > 0 && !e.def.boss && this.rng.int(100) < boom) {
      const dmg = Math.max(1, Math.round((4 + this.wave * 1.5) * p.damageMult()));
      this.explodeAt(e.x, e.y, 70, dmg, false, 15, 0, null, p);
    }
    if (e.elite) {
      this.shakeAt(6);
      this.addText(e.x, e.y - 30, 'ELITE!', '#FFD84A', 30);
    }
    this.burst(e.x, e.y, e.def.boss ? 60 : 10, '155,211,58', e.def.boss ? 400 : 180, e.def.boss ? 10 : 6, 0.5);
    this.snd('KILL');
    if (e.def.boss) {
      if (this.boss === e) this.boss = null;
      this.shakeAt(16);
      this.showBanner('CHEFÃO DERROTADO!');
      if (this.rec) this.rec.push(['n', 'CHEFÃO DERROTADO!']);
      this.vib(200);
    }
  }

  dropMaterial(x, y, vx, vy) {
    // No multiplayer nascem mais insetos e as sementes são de todos: algumas não caem, pra renda ficar parecida.
    if (this.players.length > 1 && this.rng.float() * Math.sqrt(this.coopSpawn()) > 1) return;
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
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.bob += dt;
      const p = this.nearestPlayer(pk.x, pk.y); // voa até o jogador vivo mais perto
      if (!p) continue;
      const dx = p.x - pk.x, dy = p.y - pk.y;
      const d = Math.hypot(dx, dy);
      if (!pk.attracted) {
        for (const q of this.players) {
          if (q.alive && Math.hypot(q.x - pk.x, q.y - pk.y) < q.pickupRange()) { pk.attracted = true; break; }
        }
      }
      if (pk.attracted && d > 0.01) {
        const spd = this.ending ? 1300 : 700;
        pk.vx = dx / d * spd; pk.vy = dy / d * spd;
      } else {
        const decay = Math.max(0, 1 - dt * 6);
        pk.vx *= decay; pk.vy *= decay;
      }
      pk.x = clamp(pk.x + pk.vx * dt, 10, WORLD_W - 10);
      pk.y = clamp(pk.y + pk.vy * dt, 10, WORLD_H - 10);
      if (d < p.radius + 12) {
        pk.dead = true;
        if (pk.type === 0) {
          // sementes são do time: todo mundo ganha
          const v = pk.value * (this.dmod('seedMul') || 1);
          for (const q of this.players) { const g2 = v * q.rmod('seeds'); q.materials += g2; this.addXp(q, g2); }
          this.seedsCollected += v * this.player.rmod('seeds');
          this.snd('PICKUP');
        } else if (pk.type === 2) {
          p.crates++;
          this.addText(p.x, p.y - 40, '+1 CAIXA!', '#FFD84A', 30);
          this.snd('LEVEL_UP', p);
        } else {
          p.heal(pk.value);
          this.addText(p.x, p.y - 40, '+' + pk.value, '#6BFF7A', 28);
          this.snd('LEVEL_UP', p);
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
    if (this.rec) this.rec.push(['b', Math.round(x), Math.round(y), count, color, speed, size, life]);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 500) return;
      const a = this.rng.float() * Math.PI * 2;
      const s = speed * (0.3 + this.rng.float() * 0.7);
      const l = life * (0.6 + this.rng.float() * 0.6);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: size * (0.6 + this.rng.float() * 0.6), life: l, maxLife: l, color, ring: false });
    }
  }

  /** Anel de explosão. */
  ring(x, y, r) {
    if (this.rec) this.rec.push(['r', Math.round(x), Math.round(y), r]);
    if (this.particles.length < 500) {
      this.particles.push({ x, y, vx: 0, vy: 0, ring: true, size: r, life: 0.3, maxLife: 0.3, color: '255,176,64' });
    }
  }

  addText(x, y, text, color, size) {
    if (this.rec) this.rec.push(['t', Math.round(x), Math.round(y), text, color, size]);
    if (this.texts.length >= 60) this.texts.shift();
    this.texts.push({ x, y, text, color, size, life: 0.7, maxLife: 0.7 });
  }

  cleanup() {
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  // --- Salvar e continuar (a partida é salva na loja) ---

  saveToString() {
    if (this.state !== 'SHOP' || !this.player || this.coop || this.daily) return null;
    return JSON.stringify(Object.assign({
      v: 2, diff: this.difficulty, wave: this.wave, kills: this.kills, harvest: this.lastHarvest, rerolls: this.shopRerolls,
      seeds: this.seedsCollected,
    }, playerToData(this.player), {
      offers: this.offers.map((o) => (!o ? null : o.weapon
        ? ['W', ALL_WEAPONS.indexOf(o.weapon), o.tier, o.price, o.locked ? 1 : 0]
        : ['I', ALL_ITEMS.indexOf(o.item), o.price, o.locked ? 1 : 0])),
    }));
  }

  loadFromString(data) {
    try {
      const d = JSON.parse(data);
      if (!d || d.v !== 2) return false;
      const p = playerFromData(d);
      if (!p) return false;
      this.offers = d.offers.map((o) => {
        if (!o) return null;
        if (o[0] === 'W') return ALL_WEAPONS[o[1]] ? { weapon: ALL_WEAPONS[o[1]], item: null, tier: o[2], price: o[3], locked: !!o[4] } : null;
        return ALL_ITEMS[o[1]] ? { weapon: null, item: ALL_ITEMS[o[1]], tier: ALL_ITEMS[o[1]].tier, price: o[2], locked: !!o[3] } : null;
      });
      this.player = p;
      this.players = [p];
      this.coop = false; this.pvp = ''; this.mines = []; this.zone = null;
      this.seedsCollected = d.seeds | 0;
      this.difficulty = d.diff; this.wave = d.wave; this.kills = d.kills;
      this.lastHarvest = d.harvest; this.shopRerolls = d.rerolls;
      this.paused = false; this.ending = false;
      this.enemies = []; this.telegraphs = []; this.bullets = []; this.enemyBullets = [];
      this.pickups = []; this.particles = []; this.texts = [];
      this.boss = null;
      this.state = 'SHOP';
      return true;
    } catch (e) {
      return false;
    }
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

/**
 * Posição que chegou pela rede (tm = relógio de quem mandou, em ms).
 * Guarda a velocidade para prever o movimento até a próxima mensagem.
 */
function netTrack(o, x, y, tm) {
  const gap = (tm - o.ntm) / 1000;
  if (o.ntm !== undefined && gap > 0.005 && gap < 0.6) {
    o.nvx = clamp((x - o.nx) / gap, -900, 900);
    o.nvy = clamp((y - o.ny) / gap, -900, 900);
  } else if (!(gap > 0)) {
    o.nvx = o.nvx || 0; o.nvy = o.nvy || 0;
  } else {
    o.nvx = 0; o.nvy = 0;
  }
  if (Math.abs(x - o.nx) > 300 || Math.abs(y - o.ny) > 300) { o.nvx = 0; o.nvy = 0; }
  o.nx = x; o.ny = y; o.ntm = tm;
  o.tx = x; o.ty = y; o.nAge = 0;
}

/** Avança a previsão (no máximo "ahead" segundos) e desliza o desenho até ela. */
function netStep(o, dt, ahead, speed) {
  if (o.nAge === undefined) o.nAge = 0;
  if (o.nAge < ahead && o.nvx !== undefined) {
    const s = Math.min(dt, ahead - o.nAge);
    o.tx += o.nvx * s; o.ty += o.nvy * s;
  }
  o.nAge += dt;
  const k = Math.min(1, dt * speed);
  o.x += (o.tx - o.x) * k;
  o.y += (o.ty - o.y) * k;
}

function waveBanner(n) { return 'ONDA ' + n; }

/** Jogador -> dados simples (para salvar a partida ou mandar pela rede). */
function playerToData(p) {
  return {
    char: CHARS.indexOf(p.character), level: p.level, xp: p.xp, materials: p.materials,
    stats: p.stats.slice(),
    weapons: p.weapons.map((w) => [ALL_WEAPONS.indexOf(w.def), w.tier, w.totalDamage, w.waveDamage]),
    items: p.items.map((it) => ALL_ITEMS.indexOf(it)),
    lp: p.levelsPending, cr: p.crates, hv: p.lastHarvest, pk: p.peakLs,
    sa: SET_KEYS.reduce((o, k) => { if (p.setApplied[k]) o[k] = p.setApplied[k]; return o; }, {}),
  };
}

/** Dados -> jogador novo (ou null se os dados estiverem estragados). */
function playerFromData(d, id, name, slot) {
  if (!d || !CHARS[d.char] || !Array.isArray(d.weapons) || !Array.isArray(d.items) || !Array.isArray(d.stats)) return null;
  const p = new Player(CHARS[d.char], id, name, slot);
  p.weapons = d.weapons.map(([wi, tier, total, wave]) => {
    const w = new Weapon(ALL_WEAPONS[wi], clamp(tier | 0, 0, 3));
    w.totalDamage = total || 0; w.waveDamage = wave || 0;
    w.owner = p;
    return w;
  });
  if (!p.weapons.length || p.weapons.length > p.maxWeapons() || p.weapons.some((w) => !w.def)) return null;
  p.stats = d.stats.slice(0, Stat.COUNT).map((v) => Number(v) || 0);
  while (p.stats.length < Stat.COUNT) p.stats.push(0);
  for (const ii of d.items) {
    const it = ALL_ITEMS[ii];
    if (!it) return null;
    p.items.push(it); // os atributos já estão em "stats"
    if (it.special >= 0) p.specials[it.special] += it.specialValue;
    p.addCy(it);
  }
  p.peakLs = Math.max(p.peakLs, +d.pk || 0);
  // conjuntos: os atributos já vêm somados em "stats"; os efeitos especiais são refeitos aqui
  if (d.sa && typeof d.sa === 'object') {
    for (const k of SET_KEYS) {
      const lv = d.sa[k] | 0;
      if (!lv) continue;
      p.setApplied[k] = lv;
      for (const [kk, i, v] of lv === 2 ? SETS[k].b5 : SETS[k].b3) if (kk === 'P') p.specials[i] += v;
    }
  }
  p.applySets();
  p.level = d.level | 0 || 1; p.xp = d.xp | 0; p.materials = d.materials | 0;
  p.levelsPending = d.lp | 0; p.crates = d.cr | 0; p.lastHarvest = d.hv | 0;
  p.hp = p.maxHp();
  return p;
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
