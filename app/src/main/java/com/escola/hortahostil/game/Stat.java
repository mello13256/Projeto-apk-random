package com.escola.hortahostil.game;

/** Atributos do jogador. Todos os valores sao inteiros guardados num vetor. */
public final class Stat {
    public static final int HP = 0;
    public static final int REGEN = 1;
    public static final int LIFESTEAL = 2;
    public static final int DAMAGE = 3;
    public static final int MELEE = 4;
    public static final int RANGED = 5;
    public static final int ELEMENTAL = 6;
    public static final int ATK_SPEED = 7;
    public static final int CRIT = 8;
    public static final int RANGE = 9;
    public static final int ARMOR = 10;
    public static final int DODGE = 11;
    public static final int SPEED = 12;
    public static final int LUCK = 13;
    public static final int HARVEST = 14;
    public static final int COUNT = 15;

    public static final String[] NAMES = {
            "Vida Máx.", "Regeneração", "Roubo de Vida", "Dano", "Corpo a Corpo",
            "À Distância", "Elemental", "Vel. Ataque", "Crítico", "Alcance",
            "Armadura", "Esquiva", "Velocidade", "Sorte", "Colheita"
    };

    public static final String[] ICONS = {
            "❤", "💚", "🦇", "💪", "👊",
            "🎯", "🔥", "⚡", "💥", "🔭",
            "🛡", "🍃", "👟", "🍀", "🌾"
    };

    public static final boolean[] PERCENT = {
            false, false, true, true, false,
            false, false, true, true, false,
            false, true, true, false, false
    };

    /** Quanto cada atributo sobe num level up de raridade 1. */
    public static final int[] LEVEL_UP_BASE = {
            3, 2, 1, 5, 2,
            1, 1, 5, 3, 15,
            1, 3, 3, 5, 5
    };

    private Stat() {
    }

    public static String format(int stat, int value) {
        String sign = value >= 0 ? "+" : "";
        return sign + value + (PERCENT[stat] ? "% " : " ") + NAMES[stat];
    }
}
