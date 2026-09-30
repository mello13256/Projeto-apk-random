package com.escola.hortahostil.game;

/** Personagem jogavel. */
public final class CharDef {
    public final String name;
    public final String icon;
    public final String tagline;
    public final WeaponDef startWeapon;
    public final int[] mods;

    CharDef(String name, String icon, String tagline, WeaponDef startWeapon, int... mods) {
        this.name = name;
        this.icon = icon;
        this.tagline = tagline;
        this.startWeapon = startWeapon;
        this.mods = mods;
    }

    public static final CharDef[] ALL = {
            new CharDef("Batata Básica", "🥔", "Sem frescura. Equilibrada.", WeaponDef.SOCO,
                    Stat.HP, 2, Stat.HARVEST, 2),
            new CharDef("Tomatão", "🍅", "Grandão e brigão.", WeaponDef.ESPADA,
                    Stat.HP, 5, Stat.MELEE, 3, Stat.ATK_SPEED, -5, Stat.SPEED, -5),
            new CharDef("Cenoura Ninja", "🥕", "Rápida e esquiva.", WeaponDef.FACA,
                    Stat.SPEED, 10, Stat.DODGE, 10, Stat.CRIT, 5, Stat.HP, -3),
            new CharDef("Milho Atirador", "🌽", "Pipoca à distância!", WeaponDef.PISTOLA,
                    Stat.RANGED, 2, Stat.RANGE, 40, Stat.MELEE, -2),
            new CharDef("Pimenta Ardida", "🌶", "Tudo pega fogo.", WeaponDef.CAJADO,
                    Stat.ELEMENTAL, 2, Stat.ATK_SPEED, 10, Stat.ARMOR, -2),
            new CharDef("Berinjela Sortuda", "🍆", "Nasceu virada pra lua.", WeaponDef.ESTILINGUE,
                    Stat.LUCK, 25, Stat.HARVEST, 8, Stat.DAMAGE, -8),
    };
}
