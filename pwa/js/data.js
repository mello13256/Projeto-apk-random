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
const SP_MAGNET = 0, SP_BOOM = 1, SP_THORNS = 2, SP_CRATE = 3, SP_FRUIT = 4;
const SP_EXECUTE = 5, SP_SHIELD = 6, SP_FREEZE = 7, SP_COUNT = 8; // novos na 4.0
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
const OLD_ITEM_COUNT = ITEMS.length; // 38 (os índices antigos não mudam: partidas salvas continuam valendo)

// Itens novos (versão 4.0): o dobro de itens
ITEMS.push(
  item('Pavio', '🧨', 0, S.ELEMENTAL, 2, S.HP, -1),
  item('Floco de Neve', '🌨️', 0, S.ATK_SPEED, 4, S.ELEMENTAL, 1),
  item('Dado', '🎲', 0, S.LUCK, 10, S.DAMAGE, -2),
  item('Luvas', '🧤', 0, S.MELEE, 1, S.ARMOR, 1),
  item('Bumerangue de Brinquedo', '🪃', 0, S.RANGED, 1, S.RANGE, 15),
  item('Meias', '🧦', 0, S.SPEED, 6, S.DODGE, 1),
  item('Vaso', '🪴', 0, S.HARVEST, 6, S.HP, 1),
  item('Curativo', '🩹', 0, S.REGEN, 2, S.HP, 1),
  item('Lupa', '🔎', 0, S.CRIT, 4),
  item('Mel', '🍯', 0, S.REGEN, 1, S.LIFESTEAL, 1),
  item('Cachecol', '🧣', 0, S.ARMOR, 1, S.SPEED, 2),
  item('Pena', '🪶', 0, S.DODGE, 4, S.SPEED, 2),
  item('Sino', '🔔', 0, S.LUCK, 6, S.HARVEST, 3),
  item('Lanterna Vermelha', '🏮', 1, S.ELEMENTAL, 2, S.RANGE, 20),
  item('Boneco de Neve', '⛄', 1, S.ARMOR, 2, S.ELEMENTAL, 1, S.SPEED, -2),
  sp(item('Ímã', '🧲', 1, S.LUCK, 3), SP_MAGNET, 100, '+100% alcance de coleta'),
  item('Machadinha', '🪓', 1, S.MELEE, 3, S.DAMAGE, 3, S.ATK_SPEED, -4),
  item('Radar', '📡', 1, S.RANGE, 30, S.RANGED, 1),
  sp(item('Balança da Justiça', '⚖️', 1, S.DAMAGE, 2), SP_EXECUTE, 8, 'Insetos com menos de 8% de vida morrem na hora'),
  sp(item('Casca de Ovo', '🥚', 1, S.HP, 2), SP_SHIELD, 10, 'Absorve 10 de dano no começo de cada onda'),
  sp(item('Gelo Seco', '🧪', 1, S.ATK_SPEED, 3), SP_FREEZE, 10, '10% de chance de congelar ao acertar'),
  item('Arco-íris', '🌈', 1, S.LUCK, 12, S.CRIT, 3),
  item('Cometa', '☄️', 2, S.ELEMENTAL, 4, S.DAMAGE, 4, S.HP, -2),
  item('Montanha Gelada', '🏔️', 2, S.ARMOR, 3, S.REGEN, 2, S.ATK_SPEED, 5),
  item('Águia', '🦅', 2, S.RANGED, 3, S.CRIT, 5, S.RANGE, 20),
  item('Gorila', '🦍', 2, S.MELEE, 4, S.HP, 5, S.SPEED, -3),
  item('Gota de Sangue', '🩸', 2, S.LIFESTEAL, 4, S.DAMAGE, 3, S.HP, -2),
  item('Skate', '🛹', 2, S.SPEED, 10, S.DODGE, 3, S.ARMOR, -1),
  item('Cesta', '🧺', 2, S.HARVEST, 15, S.LUCK, 5),
  item('Espadas Cruzadas', '⚔️', 2, S.MELEE, 3, S.RANGED, 3, S.ATK_SPEED, -3),
  item('Sol', '🌞', 3, S.ELEMENTAL, 6, S.DAMAGE, 8, S.REGEN, 2),
  sp(item('Galáxia', '🌌', 3, S.ELEMENTAL, 3), SP_FREEZE, 25, '25% de chance de congelar ao acertar'),
  item('Castelo', '🏰', 3, S.ARMOR, 7, S.HP, 15, S.SPEED, -6),
  item('Caça-níquel', '🎰', 3, S.LUCK, 35, S.HARVEST, 8),
  item('Olho Grego', '🧿', 3, S.DODGE, 10, S.CRIT, 8),
  item('Máscara de Oni', '👹', 3, S.MELEE, 7, S.DAMAGE, 8, S.ARMOR, -2),
  item('Disco Voador', '🛸', 3, S.RANGED, 6, S.RANGE, 50, S.ATK_SPEED, 8),
  item('Coração Pulsante', '🫀', 3, S.LIFESTEAL, 6, S.REGEN, 5, S.HP, 5),
);

// --- Conjuntos (sinergias): juntar 3 ou 5 coisas da mesma família dá bônus ---
const SETS = {
  fogo: { name: 'Incendiário', icon: '🔥', b3: [['S', S.ELEMENTAL, 3]], b5: [['S', S.ELEMENTAL, 5], ['S', S.DAMAGE, 6]] },
  gelo: { name: 'Glacial', icon: '❄️', b3: [['P', SP_FREEZE, 10]], b5: [['P', SP_FREEZE, 15], ['S', S.ATK_SPEED, 6]] },
  sorte: { name: 'Sortudo', icon: '🍀', b3: [['S', S.LUCK, 15]], b5: [['S', S.LUCK, 25], ['S', S.CRIT, 3]] },
  defesa: { name: 'Fortaleza', icon: '🛡️', b3: [['S', S.ARMOR, 3]], b5: [['S', S.ARMOR, 5], ['S', S.HP, 6]] },
  ligeiro: { name: 'Ligeiro', icon: '👟', b3: [['S', S.SPEED, 8]], b5: [['S', S.SPEED, 12], ['S', S.DODGE, 5]] },
  fazenda: { name: 'Fazendeiro', icon: '🌾', b3: [['S', S.HARVEST, 8]], b5: [['S', S.HARVEST, 20], ['P', SP_MAGNET, 50]] },
  destruidor: { name: 'Destruidor', icon: '💥', b3: [['S', S.DAMAGE, 5]], b5: [['S', S.DAMAGE, 10], ['S', S.CRIT, 5]] },
  sangue: { name: 'Sanguinário', icon: '🦇', b3: [['S', S.LIFESTEAL, 2]], b5: [['S', S.LIFESTEAL, 5], ['S', S.REGEN, 2]] },
  atirador: { name: 'Atirador', icon: '🎯', b3: [['S', S.RANGED, 2], ['S', S.RANGE, 30]], b5: [['S', S.RANGED, 4], ['S', S.RANGE, 50]] },
  brigao: { name: 'Brigão', icon: '👊', b3: [['S', S.MELEE, 3]], b5: [['S', S.MELEE, 5], ['S', S.ATK_SPEED, 6]] },
};
const SET_KEYS = Object.keys(SETS);
function setBonusText(b) {
  return b.map(([k, i, v]) => (k === 'S' ? Stat.format(i, v) : i === SP_FREEZE ? '+' + v + '% congelar' : '+' + v + '% coleta')).join(', ');
}
// famílias de cada item (por nome)
const ITEM_TAGS = {
  'Adubo': ['defesa'], 'Regador': ['sangue'], 'Luva de Boxe': ['brigao'], 'Mira': ['atirador'], 'Vela': ['fogo'],
  'Tênis': ['ligeiro'], 'Óculos Escuros': ['destruidor'], 'Trevo': ['sorte'], 'Feixe de Trigo': ['fazenda'], 'Café': ['ligeiro'],
  'Capacete': ['defesa'], 'Folha Leve': ['ligeiro'], 'Seringa': ['sangue'], 'Cabeça de Pedra': ['defesa'], 'Haltere': ['brigao', 'destruidor'],
  'Manual de Tiro': ['atirador'], 'Pilha': ['destruidor'], 'Escudo': ['defesa'], 'Luneta': ['atirador'], 'Saco de Moedas': ['sorte', 'fazenda'],
  'Pomba': ['ligeiro'], 'Morango': ['sangue'], 'Bomba': ['destruidor'], 'Coroa': ['sorte'], 'Cacto': ['defesa', 'brigao'],
  'Nuvem de Raios': ['gelo'], 'Lua de Sangue': ['sangue'], 'Bicicleta': ['ligeiro'], 'Diamante': ['destruidor'], 'Dragão': ['fogo', 'brigao'],
  'Estrela': ['defesa', 'sangue'], 'Coração de Ouro': ['sorte', 'fazenda'], 'Redemoinho': ['fazenda', 'ligeiro'], 'Banana': ['sangue'],
  'Rosa': ['defesa'], 'Mapa do Tesouro': ['sorte'], 'Fogos': ['fogo'], 'Vulcão': ['fogo'],
  'Pavio': ['fogo'], 'Floco de Neve': ['gelo'], 'Dado': ['sorte'], 'Luvas': ['brigao', 'defesa'], 'Bumerangue de Brinquedo': ['atirador'],
  'Meias': ['ligeiro'], 'Vaso': ['fazenda'], 'Curativo': ['sangue'], 'Lupa': ['destruidor'], 'Mel': ['sangue'], 'Cachecol': ['defesa'],
  'Pena': ['ligeiro'], 'Sino': ['sorte', 'fazenda'], 'Lanterna Vermelha': ['fogo'], 'Boneco de Neve': ['gelo', 'defesa'], 'Ímã': ['fazenda'],
  'Machadinha': ['brigao'], 'Radar': ['atirador'], 'Balança da Justiça': ['destruidor'], 'Casca de Ovo': ['defesa'], 'Gelo Seco': ['gelo'],
  'Arco-íris': ['sorte'], 'Cometa': ['fogo', 'destruidor'], 'Montanha Gelada': ['gelo', 'defesa'], 'Águia': ['atirador'], 'Gorila': ['brigao'],
  'Gota de Sangue': ['sangue'], 'Skate': ['ligeiro'], 'Cesta': ['fazenda'], 'Espadas Cruzadas': ['brigao', 'atirador'], 'Sol': ['fogo'],
  'Galáxia': ['gelo'], 'Castelo': ['defesa'], 'Caça-níquel': ['sorte', 'fazenda'], 'Olho Grego': ['ligeiro', 'destruidor'],
  'Máscara de Oni': ['brigao', 'destruidor'], 'Disco Voador': ['atirador'], 'Coração Pulsante': ['sangue'],
};
for (const it of ITEMS) it.tags = ITEM_TAGS[it.name] || [];

// Itens do Alien Hala: versões alienígenas, um pouco melhores (bônus maiores, penalidades menores).
const ALIEN_ITEMS = ITEMS.map((it) => {
  const mods = [];
  for (let m = 0; m < it.mods.length; m += 2) {
    const v = it.mods[m + 1] > 0 ? Math.ceil(it.mods[m + 1] * 1.3) : Math.trunc(it.mods[m + 1] * 0.6);
    if (v !== 0) mods.push(it.mods[m], v);
  }
  const a = Object.assign({}, it, { name: it.name + ' Alien', mods, alien: true, only: 'alien', tags: it.tags });
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
for (const it of CYBORG_ITEMS) it.tags = [];
// A ordem respeita as versões antigas (itens velhos, Alien velhos, Cyborg) e depois vêm os novos.
const ALL_ITEMS = ITEMS.slice(0, OLD_ITEM_COUNT).concat(ALIEN_ITEMS.slice(0, OLD_ITEM_COUNT), CYBORG_ITEMS,
  ITEMS.slice(OLD_ITEM_COUNT), ALIEN_ITEMS.slice(OLD_ITEM_COUNT));
// famílias das armas
const WEAPON_TAGS = new Map([[W.SOCO, 'brigao'], [W.FACA, 'brigao'], [W.ESPADA, 'brigao'], [W.LANCA, 'brigao'], [W.MARTELO, 'brigao'],
  [W.ESTILINGUE, 'atirador'], [W.PISTOLA, 'atirador'], [W.SEMENTEIRA, 'atirador'], [W.ESCOPETA, 'atirador'], [W.ARCO, 'atirador'],
  [W.CAJADO, 'fogo'], [W.BAZUCA, 'fogo'], [W.GELO, 'gelo'], [W.RAIO, 'destruidor']]);

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
  // --- versão 4.0: 15 classes novas, cada uma com uma mecânica própria ---
  hero(charDef('Banana Bumerangue', '🍌', 'Tudo que vai, volta.', W.ESTILINGUE, S.RANGED, 2, S.RANGE, 20, S.HP, -1),
    'boomerang', 'Os projéteis voltam como bumerangue: acertam na ida e na volta (e atravessam tudo).', 'boomerang'),
  hero(charDef('Limão Azedo', '🍋', 'Ácido demais pra chegar perto.', W.CAJADO, S.ELEMENTAL, 1, S.ARMOR, 1, S.SPEED, -4),
    'acid', 'Aura ácida em volta: queima quem está dentro e esses insetos levam +15% de dano de tudo.', 'aura'),
  hero(charDef('Cereja Gêmea', '🍒', 'Sempre em dobro.', W.PISTOLA, S.DAMAGE, -5),
    'twin', 'Eco: cada tiro se repete logo depois com 35% do dano, e cada golpe acerta de novo (35%).', 'echo'),
  locked(hero(charDef('Uva Ilusionista', '🍇', 'Qual delas é a verdadeira?', W.GELO, S.DODGE, 6, S.ELEMENTAL, 1, S.HP, -2),
    'grape', 'A cada 12 s deixa uma uva falsa: os insetos correm atrás dela e ela explode depois de 4 s.', 'decoy'),
    'Derrote 25 elites (no total)', (r) => (r.eliteKills || 0) >= 25),
  locked(hero(charDef('Abacate Blindado', '🥑', 'O caroço aguenta tudo.', W.MARTELO, S.HP, 4, S.ARMOR, 1, S.SPEED, -6),
    'pit', 'Um escudo que bloqueia um golpe inteiro a cada 6 s e solta uma onda de choque ao bloquear.', 'barrier'),
    'Derrote 5 chefões (no total)', (r) => (r.bossKills || 0) >= 5),
  locked(hero(charDef('Alho Exorcista', '🧄', 'Nenhum inseto aguenta o cheiro.', W.LANCA, S.HP, 4, S.ELEMENTAL, 1, S.ARMOR, 1),
    'garlic', 'A cada 6 s solta um bafo: os insetos perto levam dano e fogem com medo por 2 s.', 'fear'),
    'Derrote 5000 insetos (no total)', (r) => r.totalKills >= 5000),
  locked(hero(charDef('Brócolis Crescente', '🥦', 'Quanto mais a onda dura, maior ele fica.', W.ESPADA, S.HP, 4, S.DAMAGE, -4),
    'grow', 'Cresce durante a onda: +5% de dano e de tamanho a cada 4 s (até +75%). Volta ao normal na onda seguinte.', 'grow'),
    'Chegue na onda 15', (r) => r.bestWave >= 15),
  locked(hero(charDef('Alface Ventania', '🥬', 'Some num piscar de olhos.', W.FACA, S.SPEED, 8, S.DODGE, 4, S.HP, -2),
    'wind', 'Dá um DASH (Espaço / botão 💨): voa pra frente sem levar dano e machuca quem atravessar. Recarga de 2,5 s.', 'dash'),
    'Jogue 20 partidas', (r) => r.gamesPlayed >= 20),
  locked(hero(charDef('Pêssego Apostador', '🍑', 'Tudo ou nada.', W.ESCOPETA, S.LUCK, 15),
    'dice', 'Roleta: no começo de cada onda sorteia um efeito forte (bom ou ruim) que vale só naquela onda.', 'roulette'),
    'Jogue o Desafio do Dia em 3 dias', (r) => (r.dailyDays || 0) >= 3),
  locked(hero(charDef('Amendoim Banqueiro', '🥜', 'Dinheiro guardado rende.', W.SOCO, S.HARVEST, 3, S.LUCK, 5),
    'bank', 'Juros: no fim de cada onda ganha 12% das sementes guardadas (até um limite). Começa com +20 sementes.', 'interest'),
    'Colete 10000 sementes (no total)', (r) => r.totalSeeds >= 10000),
  locked(hero(charDef('Batata-Doce Fênix', '🍠', 'Renasce das cinzas.', W.CAJADO, S.ELEMENTAL, 2),
    'phoenix', 'Ao cair, renasce com 40% da vida numa explosão de fogo. Depois descansa por 2 ondas.', 'phoenix'),
    'Vença 3 partidas', (r) => r.wins >= 3),
  locked(hero(charDef('Laranja Espremida', '🍊', 'Quanto mais apertam, mais suco sai.', W.ESPADA, S.HP, 8, S.LIFESTEAL, 3),
    'squeeze', 'Fúria: quanto menos vida, mais dano e velocidade de ataque (até +150% de dano quase morrendo).', 'berserk'),
    'Vença com 3 legumes diferentes', (r) => Object.keys(r.winsByChar || {}).length >= 3),
  locked(hero(charDef('Azeitona Gravitacional', '🫒', 'Pesada como um buraco negro.', W.RAIO, S.ELEMENTAL, 2, S.SPEED, -4),
    'gravity', 'A cada 7 s cria um buraco negro que puxa os insetos pro centro e implode.', 'gravity'),
    'Chegue na onda 25 no Infinito', (r) => (r.bestEndless || 0) >= 25),
  locked(hero(charDef('Pera Espelho', '🍐', 'Devolve tudo que recebe.', W.ARCO, S.RANGED, 2, S.ARMOR, 1),
    'mirror', 'Espelho: tiros inimigos que chegam perto são refletidos de volta, bem mais fortes (1 por segundo).', 'mirror'),
    'Compre 150 coisas na loja (no total)', (r) => (r.itemsBought || 0) >= 150),
  locked(hero(charDef('Manga Elementar', '🥭', 'Fogo, gelo e raio. Nessa ordem.', W.ESTILINGUE, S.ELEMENTAL, 3, S.ATK_SPEED, 5),
    'elements', 'Troca de elemento a cada 5 s: 🔥 queima, ❄️ congela e ⚡ dá choque no inseto vizinho.', 'elements'),
    'Vença com 6 legumes diferentes', (r) => Object.keys(r.winsByChar || {}).length >= 6),
];
// Roleta do Pêssego Apostador
const ROULETTE = [
  { text: '+60% de dano', dmg: 1.6 },
  { text: 'sementes valem o dobro', seeds: 2 },
  { text: '+40% de velocidade', speed: 1.4 },
  { text: '+50% de velocidade de ataque', atk: 1.5 },
  { text: 'cura total a cada 10 s', heal: 10 },
  { text: 'insetos 30% mais lentos', slowFoes: 0.7 },
  { text: '-30% de dano (azar!)', dmg: 0.7 },
  { text: '-25% de velocidade (azar!)', speed: 0.75 },
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

// --- Conquistas (com barra de progresso). rec = recordes salvos ---
function countBits(n) { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; }
const winsChars = (r) => Object.keys(r.winsByChar || {}).length;
const gridWins = (r) => Object.values(r.winsByChar || {}).reduce((a, m) => a + countBits(m), 0);
function ach(id, icon, name, desc, goal, value) { return { id, icon, name, desc, goal, value }; }
const ACHIEVEMENTS = [
  ach('kills1', '🐛', 'Dedetizador', 'Derrote 1.000 insetos', 1000, (r) => r.totalKills),
  ach('kills2', '🪲', 'Exterminador', 'Derrote 10.000 insetos', 10000, (r) => r.totalKills),
  ach('kills3', '☠️', 'Pesadelo dos Insetos', 'Derrote 50.000 insetos', 50000, (r) => r.totalKills),
  ach('seeds1', '🌱', 'Agricultor', 'Colete 5.000 sementes', 5000, (r) => r.totalSeeds),
  ach('seeds2', '🌾', 'Latifundiário', 'Colete 50.000 sementes', 50000, (r) => r.totalSeeds),
  ach('games1', '🎮', 'Jogador', 'Jogue 10 partidas', 10, (r) => r.gamesPlayed),
  ach('games2', '🕹️', 'Viciado em Horta', 'Jogue 50 partidas', 50, (r) => r.gamesPlayed),
  ach('wins1', '🏆', 'Primeira Vitória', 'Vença 1 partida', 1, (r) => r.wins),
  ach('wins2', '🥇', 'Campeão', 'Vença 10 partidas', 10, (r) => r.wins),
  ach('wins3', '👑', 'Lenda da Horta', 'Vença 50 partidas', 50, (r) => r.wins),
  ach('boss1', '🐌', 'Caçador de Chefões', 'Derrote 5 chefões', 5, (r) => r.bossKills || 0),
  ach('boss2', '🐜', 'Matador de Rainhas', 'Derrote 25 chefões', 25, (r) => r.bossKills || 0),
  ach('elite1', '⭐', 'Caçador de Elites', 'Derrote 25 elites', 25, (r) => r.eliteKills || 0),
  ach('elite2', '🌟', 'Terror das Elites', 'Derrote 150 elites', 150, (r) => r.eliteKills || 0),
  ach('chars1', '🥗', 'Salada Mista', 'Vença com 5 legumes diferentes', 5, winsChars),
  ach('chars2', '🧺', 'Feira Completa', 'Vença com 15 legumes diferentes', 15, winsChars),
  ach('chars3', '🌍', 'Horta do Mundo', 'Vença com todos os 30 legumes', 30, winsChars),
  ach('grid', '🔲', 'Colecionador de Vitórias', 'Marque 50 vitórias na grade (legume × dificuldade)', 50, gridWins),
  ach('night', '💀', 'Sobrevivente do Pesadelo', 'Vença no Pesadelo', 1, (r) => (r.bestDiffWon >= 3 ? 1 : 0)),
  ach('hell', '😈', 'Rei do Inferno', 'Vença no Inferno', 1, (r) => (r.bestDiffWon >= 4 ? 1 : 0)),
  ach('endless1', '♾️', 'Sem Fim', 'Chegue na onda 25 do Infinito', 25, (r) => r.bestEndless || 0),
  ach('endless2', '🌀', 'Eterno', 'Chegue na onda 50 do Infinito', 50, (r) => r.bestEndless || 0),
  ach('daily1', '📅', 'Desafiante', 'Jogue o Desafio do Dia em 7 dias', 7, (r) => r.dailyDays || 0),
  ach('shop1', '🛒', 'Cliente Fiel', 'Compre 200 coisas na loja', 200, (r) => r.itemsBought || 0),
  ach('shop2', '💸', 'Consumista', 'Compre 1.000 coisas na loja', 1000, (r) => r.itemsBought || 0),
  ach('unlock', '🔓', 'Horta Completa', 'Libere todos os 30 legumes', 30, (r) => CHARS.filter((c) => isUnlocked(c, r)).length),
];
