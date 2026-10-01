package com.escola.hortahostil.game;

/** Item passivo: so mexe nos atributos do jogador. */
public final class ItemDef {
    public final String name;
    public final String icon;
    public final int tier; // 0..3
    public final int[] mods; // pares (atributo, valor)
    /** Efeito especial (veja SP_*) e sua força. */
    public int special = SP_NONE;
    public int specialValue;
    public String specialText = "";

    public static final int SP_NONE = -1;
    /** % a mais de alcance para pegar sementes. */
    public static final int SP_MAGNET = 0;
    /** Chance (%) do inimigo explodir ao morrer. */
    public static final int SP_BOOM = 1;
    /** Dano devolvido a quem encosta em você. */
    public static final int SP_THORNS = 2;
    /** % a mais de chance de achar caixas. */
    public static final int SP_CRATE = 3;
    /** Cura extra das frutas. */
    public static final int SP_FRUIT = 4;
    public static final int SP_COUNT = 5;

    ItemDef(String name, String icon, int tier, int... mods) {
        this.name = name;
        this.icon = icon;
        this.tier = tier;
        this.mods = mods;
    }

    private ItemDef sp(int special, int value, String text) {
        this.special = special;
        this.specialValue = value;
        this.specialText = text;
        return this;
    }

    public void applyTo(int[] stats) {
        for (int i = 0; i < mods.length; i += 2) stats[mods[i]] += mods[i + 1];
    }

    public static final ItemDef[] ALL = {
            // Raridade I
            new ItemDef("Adubo", "🌱", 0, Stat.HP, 3),
            new ItemDef("Regador", "🚿", 0, Stat.REGEN, 2),
            new ItemDef("Luva de Boxe", "🥊", 0, Stat.MELEE, 2),
            new ItemDef("Mira", "🎯", 0, Stat.RANGED, 1, Stat.RANGE, 10),
            new ItemDef("Vela", "🕯", 0, Stat.ELEMENTAL, 1),
            new ItemDef("Tênis", "👟", 0, Stat.SPEED, 5),
            new ItemDef("Óculos Escuros", "🕶", 0, Stat.CRIT, 3),
            new ItemDef("Trevo", "🍀", 0, Stat.LUCK, 8),
            new ItemDef("Feixe de Trigo", "🌾", 0, Stat.HARVEST, 5),
            new ItemDef("Café", "☕", 0, Stat.ATK_SPEED, 8, Stat.HP, -1),
            new ItemDef("Capacete", "⛑", 0, Stat.ARMOR, 1),
            new ItemDef("Folha Leve", "🍃", 0, Stat.DODGE, 3),
            new ItemDef("Seringa", "💉", 0, Stat.LIFESTEAL, 2),
            // Raridade II
            new ItemDef("Cabeça de Pedra", "🗿", 1, Stat.HP, 8, Stat.SPEED, -3),
            new ItemDef("Haltere", "🏋", 1, Stat.DAMAGE, 5, Stat.MELEE, 1),
            new ItemDef("Manual de Tiro", "📘", 1, Stat.RANGED, 2, Stat.MELEE, -1),
            new ItemDef("Pilha", "🔋", 1, Stat.ATK_SPEED, 12, Stat.DAMAGE, -2),
            new ItemDef("Escudo", "🛡", 1, Stat.ARMOR, 3, Stat.SPEED, -3),
            new ItemDef("Luneta", "🔭", 1, Stat.RANGE, 40),
            new ItemDef("Saco de Moedas", "💰", 1, Stat.LUCK, 10, Stat.HARVEST, 3),
            new ItemDef("Pomba", "🕊", 1, Stat.DODGE, 6, Stat.HP, -2),
            new ItemDef("Morango", "🍓", 1, Stat.HP, 5, Stat.REGEN, 1),
            // Raridade III
            new ItemDef("Bomba", "💣", 2, Stat.DAMAGE, 15, Stat.ARMOR, -2),
            new ItemDef("Coroa", "👑", 2, Stat.LUCK, 15, Stat.DAMAGE, 5, Stat.HP, 3),
            new ItemDef("Cacto", "🌵", 2, Stat.ARMOR, 4, Stat.MELEE, 2),
            new ItemDef("Nuvem de Raios", "🌩", 2, Stat.ELEMENTAL, 3, Stat.ATK_SPEED, 10),
            new ItemDef("Lua de Sangue", "🌙", 2, Stat.LIFESTEAL, 5, Stat.REGEN, 2),
            new ItemDef("Bicicleta", "🚲", 2, Stat.SPEED, 12, Stat.DODGE, 5),
            // Raridade IV
            new ItemDef("Diamante", "💎", 3, Stat.DAMAGE, 10, Stat.ATK_SPEED, 10, Stat.CRIT, 5, Stat.RANGE, 10),
            new ItemDef("Dragão", "🐉", 3, Stat.MELEE, 5, Stat.RANGED, 5, Stat.ELEMENTAL, 5, Stat.HP, -10),
            new ItemDef("Estrela", "⭐", 3, Stat.HP, 20, Stat.ARMOR, 5, Stat.REGEN, 5),
            new ItemDef("Coração de Ouro", "💛", 3, Stat.LUCK, 25, Stat.HARVEST, 10, Stat.CRIT, 10),
            // Itens com efeito especial
            new ItemDef("Redemoinho", "🌀", 0, Stat.SPEED, 2).sp(SP_MAGNET, 60, "+60% alcance de coleta"),
            new ItemDef("Banana", "🍌", 0, Stat.HP, 1).sp(SP_FRUIT, 3, "Frutas curam +3"),
            new ItemDef("Rosa", "🌹", 1, Stat.ARMOR, 1).sp(SP_THORNS, 6, "Espinhos: 6 de dano em quem encosta"),
            new ItemDef("Mapa do Tesouro", "🗺", 1, Stat.LUCK, 5).sp(SP_CRATE, 100, "+100% chance de caixas"),
            new ItemDef("Fogos", "🎆", 2, Stat.ELEMENTAL, 1).sp(SP_BOOM, 15, "15% dos inimigos explodem ao morrer"),
            new ItemDef("Vulcão", "🌋", 3, Stat.DAMAGE, 5).sp(SP_BOOM, 35, "35% dos inimigos explodem ao morrer"),
    };
}
