package com.escola.hortahostil.game;

/** Personagem jogavel. */
public final class CharDef {
    public final String name;
    public final String icon;
    public final String tagline;
    public final WeaponDef startWeapon;
    public final int[] mods;
    /** Como desbloquear (UNLOCK_*) e o valor necessário. */
    public int unlockType = UNLOCK_NONE;
    public int unlockValue;

    public static final int UNLOCK_NONE = 0;
    public static final int UNLOCK_WAVE = 1;   // chegar na onda X
    public static final int UNLOCK_WINS = 2;   // vencer X vezes
    public static final int UNLOCK_KILLS = 3;  // derrotar X insetos no total

    CharDef(String name, String icon, String tagline, WeaponDef startWeapon, int... mods) {
        this.name = name;
        this.icon = icon;
        this.tagline = tagline;
        this.startWeapon = startWeapon;
        this.mods = mods;
    }

    private CharDef locked(int type, int value) {
        unlockType = type;
        unlockValue = value;
        return this;
    }

    public boolean isUnlocked(int bestWave, int wins, int totalKills) {
        switch (unlockType) {
            case UNLOCK_WAVE: return bestWave >= unlockValue;
            case UNLOCK_WINS: return wins >= unlockValue;
            case UNLOCK_KILLS: return totalKills >= unlockValue;
            default: return true;
        }
    }

    public String unlockText() {
        switch (unlockType) {
            case UNLOCK_WAVE: return "Chegue na onda " + unlockValue;
            case UNLOCK_WINS: return "Vença " + unlockValue + (unlockValue == 1 ? " partida" : " partidas");
            case UNLOCK_KILLS: return "Derrote " + unlockValue + " insetos (no total)";
            default: return "";
        }
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
            new CharDef("Abóbora Blindada", "🎃", "Lenta, mas aguenta tudo.", WeaponDef.MARTELO,
                    Stat.HP, 8, Stat.ARMOR, 4, Stat.SPEED, -10, Stat.ATK_SPEED, -10)
                    .locked(UNLOCK_WAVE, 10),
            new CharDef("Pepino Arqueiro", "🥒", "Mira de longe, foge de perto.", WeaponDef.ARCO,
                    Stat.CRIT, 10, Stat.RANGE, 60, Stat.HP, -4)
                    .locked(UNLOCK_KILLS, 2000),
            new CharDef("Cogumelo Místico", "🍄", "Magia gelada da floresta.", WeaponDef.GELO,
                    Stat.ELEMENTAL, 3, Stat.REGEN, 3, Stat.LUCK, 10, Stat.HP, -2)
                    .locked(UNLOCK_WINS, 1),
    };
}
