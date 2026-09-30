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
const SHAPE_FIST = 0, SHAPE_BLADE = 1, SHAPE_GUN = 2, SHAPE_STAFF = 3, SHAPE_TUBE = 4;
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
    projSpeed: 700, explosion: 0, burn: 0, hitRadius: 22, desc: '',
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
};
const WEAPONS = Object.values(W);

function item(name, icon, tier, ...mods) { return { name, icon, tier, mods }; }
const S = Stat;
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
];

function charDef(name, icon, tagline, startWeapon, ...mods) { return { name, icon, tagline, startWeapon, mods }; }
const CHARS = [
  charDef('Batata Básica', '🥔', 'Sem frescura. Equilibrada.', W.SOCO, S.HP, 2, S.HARVEST, 2),
  charDef('Tomatão', '🍅', 'Grandão e brigão.', W.ESPADA, S.HP, 5, S.MELEE, 3, S.ATK_SPEED, -5, S.SPEED, -5),
  charDef('Cenoura Ninja', '🥕', 'Rápida e esquiva.', W.FACA, S.SPEED, 10, S.DODGE, 10, S.CRIT, 5, S.HP, -3),
  charDef('Milho Atirador', '🌽', 'Pipoca à distância!', W.PISTOLA, S.RANGED, 2, S.RANGE, 40, S.MELEE, -2),
  charDef('Pimenta Ardida', '🌶️', 'Tudo pega fogo.', W.CAJADO, S.ELEMENTAL, 2, S.ATK_SPEED, 10, S.ARMOR, -2),
  charDef('Berinjela Sortuda', '🍆', 'Nasceu virada pra lua.', W.ESTILINGUE, S.LUCK, 25, S.HARVEST, 8, S.DAMAGE, -8),
];

const AI_CHASE = 0, AI_SHOOT = 1, AI_CHARGE = 2, AI_BOSS_SNAIL = 3, AI_BOSS_ANT = 4;
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
const SPAWNABLE = [E.LAGARTA, E.VESPA, E.ARANHA, E.JOANINHA, E.ESCORPIAO];
