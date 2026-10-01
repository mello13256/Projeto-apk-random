// Dados do jogo (mesmos valores da versão Android).
'use strict';

const Stat = {
  HP: 0, REGEN: 1, LIFESTEAL: 2, DAMAGE: 3, MELEE: 4, RANGED: 5, ELEMENTAL: 6,
  ATK_SPEED: 7, CRIT: 8, RANGE: 9, ARMOR: 10, DODGE: 11, SPEED: 12, LUCK: 13, HARVEST: 14,
  COUNT: 15,
  NAMES: ['Vida Máx.', 'Regeneração', 'Roubo de Vida', 'Dano', 'Corpo a Corpo',
    'À Distância', 'Elemental', 'Vel. Ataque', 'Crítico', 'Alcance',
    'Armadura', 'Esquiva', 'Velocidade', 'Sorte', 'Colheita'],
  ICONS: ['❤️', '💚', '🦇', '💪', '👊', '🎯', '🔥', '⚡', '💥', '🔭', '🛡️', '🍃', '👟', '🍀', '🌾'],
  PERCENT: [false, false, true, true, false, false, false, true, true, false, false, true, true, false, false],
  LEVEL_UP_BASE: [3, 2, 1, 5, 2, 1, 1, 5, 3, 15, 1, 3, 3, 5, 5],
  format(stat, value) {
    return (value >= 0 ? '+' : '') + value + (Stat.PERCENT[stat] ? '% ' : ' ') + Stat.NAMES[stat];
  },
};

const MELEE = 0, RANGED = 1, ELEMENTAL = 2;
const SHAPE_FIST = 0, SHAPE_BLADE = 1, SHAPE_GUN = 2, SHAPE_STAFF = 3, SHAPE_TUBE = 4, SHAPE_BOW = 5, SHAPE_HAMMER = 6, SHAPE_LASER = 7;
const TIER_DMG = [1, 1.7, 2.6, 3.8];
const TIER_SCALE = [1, 1.2, 1.45, 1.8];
const TIER_CD = [1, 0.92, 0.84, 0.76];
const TIER_PRICE = [1, 2, 3.8, 6.5];
const TIER_NAMES = ['I', 'II', 'III', 'IV'];
const TYPE_NAMES = ['Corpo a corpo', 'À distância', 'Elemental'];

function weaponDef(name, icon, type, baseDamage, cooldown, range, scaleStat, scale, shape, color, price, extra) {
  return Object.assign({
    name, icon, type, baseDamage, cooldown, range, scaleStat, scale, shape, color, price,
    critBonus: 0, critMult: 2, knockback: 12, pellets: 1, spread: 0.08, pierce: 0, bounce: 0,
    projSpeed: 700, explosion: 0, burn: 0, slow: 0, hitRadius: 22, desc: '',
  }, extra);
}

const W = {
  SOCO: weaponDef('Soco', '👊', MELEE, 8, 0.9, 110, Stat.MELEE, 1, SHAPE_FIST, '#F2C38B', 12,
    { knockback: 22, desc: 'Clássico e confiável.' }),
  FACA: weaponDef('Faca', '🔪', MELEE, 6, 0.55, 100, Stat.MELEE, 0.8, SHAPE_BLADE, '#D8DEE6', 15,
    { critBonus: 20, critMult: 2.5, knockback: 4, desc: 'Rápida, +20% crítico.' }),
  ESPADA: weaponDef('Espada', '🗡️', MELEE, 14, 1.1, 140, Stat.MELEE, 1.2, SHAPE_BLADE, '#B8C7D9', 22,
    { hitRadius: 34, knockback: 26, desc: 'Golpe largo e forte.' }),
  LANCA: weaponDef('Lança', '🔱', MELEE, 11, 1.0, 215, Stat.MELEE, 1, SHAPE_BLADE, '#E0B04A', 20,
    { knockback: 16, desc: 'Alcance enorme.' }),
  ESTILINGUE: weaponDef('Estilingue', '🎯', RANGED, 9, 1.0, 360, Stat.RANGED, 1, SHAPE_GUN, '#9C6B3C', 13,
    { bounce: 1, projSpeed: 620, desc: 'A pedra ricocheteia 1x.' }),
  PISTOLA: weaponDef('Pistola', '🔫', RANGED, 12, 0.85, 400, Stat.RANGED, 1, SHAPE_GUN, '#5A6270', 18,
    { pierce: 1, projSpeed: 850, desc: 'Atravessa 1 inimigo.' }),
  SEMENTEIRA: weaponDef('Metralha-Semente', '🌰', RANGED, 4, 0.2, 330, Stat.RANGED, 0.5, SHAPE_TUBE, '#7A9A3A', 20,
    { spread: 0.3, knockback: 3, projSpeed: 750, desc: 'Chuva de sementes!' }),
  ESCOPETA: weaponDef('Escopeta', '💥', RANGED, 5, 1.3, 280, Stat.RANGED, 0.6, SHAPE_TUBE, '#6B4A33', 24,
    { pellets: 5, spread: 0.6, pierce: 1, knockback: 14, desc: '5 projéteis em leque.' }),
  CAJADO: weaponDef('Cajado de Fogo', '🔥', ELEMENTAL, 5, 1.0, 380, Stat.ELEMENTAL, 1, SHAPE_STAFF, '#FF7A1A', 20,
    { burn: 3, projSpeed: 520, desc: 'Queima os inimigos.' }),
  BAZUCA: weaponDef('Bazuca', '🚀', ELEMENTAL, 18, 1.9, 450, Stat.ELEMENTAL, 1.3, SHAPE_TUBE, '#4F7A45', 30,
    { explosion: 85, projSpeed: 480, knockback: 30, desc: 'Explode em área.' }),
  RAIO: weaponDef('Bastão Elétrico', '⚡', ELEMENTAL, 7, 0.9, 340, Stat.ELEMENTAL, 1, SHAPE_STAFF, '#FFE14A', 25,
    { bounce: 3, projSpeed: 1300, knockback: 2, lightning: true, desc: 'Raio pula entre 4 alvos.' }),
  MARTELO: weaponDef('Martelo', '🔨', MELEE, 20, 1.5, 120, Stat.MELEE, 1.5, SHAPE_HAMMER, '#8A8F99', 25,
    { hitRadius: 42, knockback: 42, desc: 'Esmaga e arremessa longe.' }),
  ARCO: weaponDef('Arco', '🏹', RANGED, 14, 1.15, 480, Stat.RANGED, 1.2, SHAPE_BOW, '#B5793A', 22,
    { pierce: 2, critBonus: 10, projSpeed: 950, desc: 'Flecha atravessa 2, +10% crítico.' }),
  GELO: weaponDef('Varinha de Gelo', '❄️', ELEMENTAL, 6, 0.9, 380, Stat.ELEMENTAL, 1, SHAPE_STAFF, '#8FE3FF', 22,
    { slow: 2, projSpeed: 600, desc: 'Congela: inimigo fica lento.' }),
};
const WEAPONS = Object.values(W);
// Arma exclusiva do Cyborg Cebola (não aparece na loja): mira e tiro manuais.
const W_LASER = weaponDef('Canhão Laser', '🔴', ELEMENTAL, 22, 0.1, 460, Stat.RANGED, 2, SHAPE_LASER, '#FF2E4D', 0,
  { laser: true, knockback: 3, desc: 'Manual: mire e segure pra atirar. 5 s seguidos e superaquece.' });
const ALL_WEAPONS = WEAPONS.concat([W_LASER]);

// Efeitos especiais dos itens
const SP_MAGNET = 0, SP_BOOM = 1, SP_THORNS = 2, SP_CRATE = 3, SP_FRUIT = 4, SP_COUNT = 5;
function item(name, icon, tier, ...mods) { return { name, icon, tier, mods, special: -1, specialValue: 0, specialText: '' }; }
function sp(it, special, value, text) { return Object.assign(it, { special, specialValue: value, specialText: text }); }
const S = Stat;
/** Item exclusivo do Cyborg Cebola: melhora o canhão laser (cy) e o corpo (mods). */
function cyItem(name, icon, tier, cy, text, ...mods) {
  return Object.assign(item(name, icon, tier, ...mods), { cy, only: 'laser', specialText: text });
}
const ITEMS = [
  item('Adubo', '🌱', 0, S.HP, 3),
  item('Regador', '🚿', 0, S.REGEN, 2),
  item('Luva de Boxe', '🥊', 0, S.MELEE, 2),
  item('Mira', '🎯', 0, S.RANGED, 1, S.RANGE, 10),
  item('Vela', '🕯️', 0, S.ELEMENTAL, 1),
  item('Tênis', '👟', 0, S.SPEED, 5),
  item('Óculos Escuros', '🕶️', 0, S.CRIT, 3),
  item('Trevo', '🍀', 0, S.LUCK, 8),
  item('Feixe de Trigo', '🌾', 0, S.HARVEST, 5),
  item('Café', '☕', 0, S.ATK_SPEED, 8, S.HP, -1),
  item('Capacete', '⛑️', 0, S.ARMOR, 1),
  item('Folha Leve', '🍃', 0, S.DODGE, 3),
  item('Seringa', '💉', 0, S.LIFESTEAL, 2),
  item('Cabeça de Pedra', '🗿', 1, S.HP, 8, S.SPEED, -3),
  item('Haltere', '🏋️', 1, S.DAMAGE, 5, S.MELEE, 1),
  item('Manual de Tiro', '📘', 1, S.RANGED, 2, S.MELEE, -1),
  item('Pilha', '🔋', 1, S.ATK_SPEED, 12, S.DAMAGE, -2),
  item('Escudo', '🛡️', 1, S.ARMOR, 3, S.SPEED, -3),
  item('Luneta', '🔭', 1, S.RANGE, 40),
  item('Saco de Moedas', '💰', 1, S.LUCK, 10, S.HARVEST, 3),
  item('Pomba', '🕊️', 1, S.DODGE, 6, S.HP, -2),
  item('Morango', '🍓', 1, S.HP, 5, S.REGEN, 1),
  item('Bomba', '💣', 2, S.DAMAGE, 15, S.ARMOR, -2),
  item('Coroa', '👑', 2, S.LUCK, 15, S.DAMAGE, 5, S.HP, 3),
  item('Cacto', '🌵', 2, S.ARMOR, 4, S.MELEE, 2),
  item('Nuvem de Raios', '🌩️', 2, S.ELEMENTAL, 3, S.ATK_SPEED, 10),
  item('Lua de Sangue', '🌙', 2, S.LIFESTEAL, 5, S.REGEN, 2),
  item('Bicicleta', '🚲', 2, S.SPEED, 12, S.DODGE, 5),
  item('Diamante', '💎', 3, S.DAMAGE, 10, S.ATK_SPEED, 10, S.CRIT, 5, S.RANGE, 10),
  item('Dragão', '🐉', 3, S.MELEE, 5, S.RANGED, 5, S.ELEMENTAL, 5, S.HP, -10),
  item('Estrela', '⭐', 3, S.HP, 20, S.ARMOR, 5, S.REGEN, 5),
  item('Coração de Ouro', '💛', 3, S.LUCK, 25, S.HARVEST, 10, S.CRIT, 10),
  sp(item('Redemoinho', '🌀', 0, S.SPEED, 2), SP_MAGNET, 60, '+60% alcance de coleta'),
  sp(item('Banana', '🍌', 0, S.HP, 1), SP_FRUIT, 3, 'Frutas curam +3'),
  sp(item('Rosa', '🌹', 1, S.ARMOR, 1), SP_THORNS, 6, 'Espinhos: 6 de dano em quem encosta'),
  sp(item('Mapa do Tesouro', '🗺️', 1, S.LUCK, 5), SP_CRATE, 100, '+100% chance de caixas'),
  sp(item('Fogos', '🎆', 2, S.ELEMENTAL, 1), SP_BOOM, 15, '15% dos inimigos explodem ao morrer'),
  sp(item('Vulcão', '🌋', 3, S.DAMAGE, 5), SP_BOOM, 35, '35% dos inimigos explodem ao morrer'),
];

// Itens do Alien Hala: versões alienígenas, um pouco melhores (bônus maiores, penalidades menores).
const ALIEN_ITEMS = ITEMS.map((it) => {
  const mods = [];
  for (let m = 0; m < it.mods.length; m += 2) {
    const v = it.mods[m + 1] > 0 ? Math.ceil(it.mods[m + 1] * 1.3) : Math.trunc(it.mods[m + 1] * 0.6);
    if (v !== 0) mods.push(it.mods[m], v);
  }
  const a = Object.assign({}, it, { name: it.name + ' Alien', mods, alien: true, only: 'alien' });
  if (it.special >= 0) {
    a.specialValue = Math.ceil(it.specialValue * 1.3);
    a.specialText = it.specialText.replace(/\d+/, String(a.specialValue));
  }
  return a;
});

// Itens exclusivos do Cyborg Cebola
const CYBORG_ITEMS = [
  cyItem('Bobina de Plasma', '🔌', 0, { dmg: 15 }, '+15% dano do laser'),
  cyItem('Dissipador de Calor', '🧊', 0, { cool: 30 }, 'O laser esfria 30% mais rápido'),
  cyItem('Perna Biônica', '🦿', 0, {}, 'Pernas de metal', S.SPEED, 8, S.DODGE, 3),
  cyItem('Célula de Energia', '⚛️', 1, { time: 30 }, '+30% tempo de tiro antes de superaquecer'),
  cyItem('Lente de Foco', '🔍', 1, { dmg: 25, range: 60 }, '+25% dano e +60 alcance do laser'),
  cyItem('Feixe Largo', '🔦', 1, { width: 8, dmg: 10 }, 'Feixe mais grosso (+8) e +10% dano'),
  cyItem('Braço Biônico', '🦾', 1, {}, 'Corpo reforçado', S.HP, 6, S.ARMOR, 2),
  cyItem('Prisma', '💠', 2, { split: 1 }, 'O laser se divide: +2 feixes laterais (40% do dano)'),
  cyItem('Núcleo de Fusão', '☢️', 2, { boom: 1 }, 'Ao superaquecer, solta uma explosão enorme em volta'),
  cyItem('Refrigeração Líquida', '💧', 2, { cool: 40, time: 20 }, 'Esfria 40% mais rápido e +20% tempo de tiro'),
  cyItem('Chip de Mira', '🧠', 3, { dmg: 40, crit: 15 }, '+40% dano e +15% crítico do laser'),
  cyItem('Satélite', '🛰️', 3, { time: 50, cool: 50, range: 80 }, '+50% tempo de tiro, +50% esfriamento, +80 alcance'),
];
const ALL_ITEMS = ITEMS.concat(ALIEN_ITEMS, CYBORG_ITEMS);

// Desbloqueio: cada personagem bloqueado tem um texto e um teste sobre os recordes salvos (rec).
// rec: bestWave, wins, totalKills, bestDiffWon, gamesPlayed, totalSeeds, ach {vamp, alien}
function charDef(name, icon, tagline, startWeapon, ...mods) {
  return { name, icon, tagline, startWeapon, mods, unlock: null, kind: '', look: '', ability: '' };
}
function hero(c, look, ability, kind) { return Object.assign(c, { look, ability, kind: kind || '' }); }
function locked(c, text, test) { return Object.assign(c, { unlock: { text, test } }); }
function isUnlocked(c, rec) {
  if (!c.unlock) return true;
  try { return !!c.unlock.test(rec || {}); } catch (e) { return false; }
}
function unlockText(c) { return c.unlock ? c.unlock.text : ''; }
const CHARS = [
  hero(charDef('Batata Básica', '🥔', 'Sem frescura. Equilibrada.', W.SOCO, S.HP, 2, S.HARVEST, 2), 'potato', 'Um pouco de tudo.'),
  hero(charDef('Tomatão', '🍅', 'Grandão e brigão.', W.ESPADA, S.HP, 5, S.MELEE, 3, S.ATK_SPEED, -5, S.SPEED, -5), 'viking', 'Muita vida e força corpo a corpo.'),
  hero(charDef('Cenoura Ninja', '🥕', 'Rápida e esquiva.', W.FACA, S.SPEED, 10, S.DODGE, 10, S.CRIT, 5, S.HP, -3), 'ninja', 'Velocidade, esquiva e crítico.'),
  hero(charDef('Milho Atirador', '🌽', 'Pipoca à distância!', W.PISTOLA, S.RANGED, 2, S.RANGE, 40, S.MELEE, -2), 'cowboy', 'Dano e alcance à distância.'),
  hero(charDef('Pimenta Ardida', '🌶️', 'Tudo pega fogo.', W.CAJADO, S.ELEMENTAL, 2, S.ATK_SPEED, 10, S.ARMOR, -2), 'flame', 'Dano elemental: queima tudo.'),
  hero(charDef('Berinjela Sortuda', '🍆', 'Nasceu virada pra lua.', W.ESTILINGUE, S.LUCK, 25, S.HARVEST, 8, S.DAMAGE, -8), 'lucky', 'Sorte e colheita, menos dano.'),
  locked(hero(charDef('Abóbora Blindada', '🎃', 'Lenta, mas aguenta tudo.', W.MARTELO, S.HP, 8, S.ARMOR, 4, S.SPEED, -10, S.ATK_SPEED, -10), 'knight', 'Armadura e vida, bem lenta.'),
    'Chegue na onda 10', (r) => r.bestWave >= 10),
  locked(hero(charDef('Pepino Arqueiro', '🥒', 'Mira de longe, foge de perto.', W.ARCO, S.CRIT, 10, S.RANGE, 60, S.HP, -4), 'archer', 'Crítico e alcance, pouca vida.'),
    'Derrote 2000 insetos (no total)', (r) => r.totalKills >= 2000),
  locked(hero(charDef('Cogumelo Místico', '🍄', 'Magia gelada da floresta.', W.GELO, S.ELEMENTAL, 3, S.REGEN, 3, S.LUCK, 10, S.HP, -2), 'wizard', 'Elemental, regeneração e sorte.'),
    'Vença 1 partida', (r) => r.wins >= 1),
  locked(hero(charDef('Cyborg Cebola', '🧅', 'Metade cebola, metade máquina.', W_LASER, S.HP, 4, S.ARMOR, 2, S.RANGED, 3),
    'cyborg', 'Só o Canhão Laser, com mira e tiro MANUAIS. Atire até 5 s seguidos; depois superaquece e esfria (quanto mais atirou, mais demora). Itens exclusivos melhoram o canhão e o corpo.', 'laser'),
    'Derrote 10000 insetos e vença no Pesadelo', (r) => r.totalKills >= 10000 && r.bestDiffWon >= 3),
  locked(hero(charDef('Vampiro Kiwi', '🥝', 'Bebe o suco dos insetos.', W.FACA, S.DODGE, 10, S.LIFESTEAL, 2, S.HP, -2),
    'vampire', 'Ataques corpo a corpo têm +30% de roubo de vida. +10% de esquiva.', 'vampire'),
    'Chegue a 50% de roubo de vida numa partida e vença', (r) => !!(r.ach && r.ach.vamp)),
  locked(hero(charDef('Alien Hala', '🍍', 'Veio de outra horta... de outro planeta.', W.RAIO, S.RANGE, 50),
    'alien', 'Segura 8 armas com tentáculos tecnológicos, +50 de alcance e só encontra itens Alien (melhores).', 'alien'),
    'Vença com todas as armas no nível IV e mais de 100 de alcance', (r) => !!(r.ach && r.ach.alien)),
  locked(hero(charDef('Melancia Minadora', '🍉', 'Deixa um rastro explosivo.', W.ESTILINGUE, S.HP, 4, S.ELEMENTAL, 2, S.SPEED, -5),
    'miner', 'Planta minas de semente enquanto anda. Elas explodem quando um inseto chega perto.', 'mines'),
    'Vença no Difícil (ou mais)', (r) => r.bestDiffWon >= 2),
  locked(hero(charDef('Mirtilo Invocador', '🫐', 'Nunca luta sozinho.', W.GELO, S.ELEMENTAL, 1, S.LUCK, 5, S.HP, -2, S.MELEE, -2),
    'summoner', 'Mirtilinhos voam em volta e atiram sozinhos. Ganha mais um a cada 4 níveis (até 6).', 'minions'),
    'Jogue 10 partidas', (r) => r.gamesPlayed >= 10),
  locked(hero(charDef('Coco Rolante', '🥥', 'Casca dura, sem freio.', W.SOCO, S.HP, 4, S.ARMOR, 5, S.SPEED, 10, S.ATK_SPEED, -15),
    'racer', 'Atropela os insetos: andando, quem encosta leva dano (mais rápido = mais dano, armadura também ajuda).', 'ram'),
    'Colete 20000 sementes (no total)', (r) => r.totalSeeds >= 20000),
];

const AI_CHASE = 0, AI_SHOOT = 1, AI_CHARGE = 2, AI_BOSS_SNAIL = 3, AI_BOSS_ANT = 4, AI_ZIGZAG = 5, AI_BOSS_BEETLE = 6;
function enemyDef(name, icon, ai, hp, speed, damage, damagePerWave, radius, drops, minWave, boss) {
  return { name, icon, ai, hp, speed, damage, damagePerWave, radius, drops, minWave, boss };
}
const E = {
  LAGARTA: enemyDef('Lagarta', '🐛', AI_CHASE, 5, 105, 1, 0.6, 20, 1, 1, false),
  VESPA: enemyDef('Vespa', '🐝', AI_CHASE, 3, 185, 1, 0.45, 16, 1, 3, false),
  ARANHA: enemyDef('Aranha Cuspideira', '🕷️', AI_SHOOT, 8, 80, 1, 0.5, 20, 1, 5, false),
  JOANINHA: enemyDef('Joaninha Blindada', '🐞', AI_CHASE, 28, 70, 2, 0.8, 30, 3, 7, false),
  ESCORPIAO: enemyDef('Escorpião', '🦂', AI_CHARGE, 12, 95, 2, 0.7, 22, 2, 9, false),
  LESMA_RAINHA: enemyDef('Lesma Rainha', '🐌', AI_BOSS_SNAIL, 900, 60, 4, 0, 64, 40, 10, true),
  FORMIGA_IMPERATRIZ: enemyDef('Formiga Imperatriz', '🐜', AI_BOSS_ANT, 5000, 95, 8, 0, 70, 80, 20, true),
};
E.MARIPOSA = enemyDef('Mariposa', '🦋', AI_ZIGZAG, 4, 150, 1, 0.5, 17, 1, 4, false);
E.BESOURO_INFERNAL = enemyDef('Besouro Infernal', '🪲', AI_BOSS_BEETLE, 9000, 105, 10, 0, 76, 120, 35, true);
const BOSSES = [E.LESMA_RAINHA, E.FORMIGA_IMPERATRIZ, E.BESOURO_INFERNAL];
const SPAWNABLE = [E.LAGARTA, E.VESPA, E.ARANHA, E.JOANINHA, E.ESCORPIAO, E.MARIPOSA];

// Dificuldades (as duas últimas são novas: Inferno tem 35 ondas e visual infernal; Infinito não acaba)
const DIFF_NAMES = ['Fácil', 'Normal', 'Difícil', 'Pesadelo', 'Inferno', 'Infinito'];
const DIFF_ICONS = ['🌱', '🌿', '🔥', '💀', '😈', '♾️'];
const DIFF_DESC = [
  'Inimigos mais fracos. Bom pra aprender.',
  'O jogo como ele deve ser.',
  'Inimigos mais fortes e mais numerosos.',
  'Mais elites e muito mais dano. Boa sorte!',
  'A dificuldade máxima: 35 ondas numa horta em chamas.',
  'Pesadelo sem fim: até onde você chega?',
];
const DIFF_HP = [0.6, 1.15, 1.4, 1.7, 2.0, 1.7];
const DIFF_DMG = [0.6, 1.15, 1.45, 1.8, 2.1, 1.8];
const DIFF_SPAWN = [1.15, 1, 0.9, 0.8, 0.72, 0.8];
const DIFF_WAVES = [20, 20, 20, 20, 35, 0]; // 0 = infinito
const DIFF_INFERNO = 4, DIFF_ENDLESS = 5;
