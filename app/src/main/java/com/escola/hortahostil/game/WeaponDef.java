package com.escola.hortahostil.game;

/** Definicao (fixa) de um tipo de arma. */
public final class WeaponDef {
    public static final int MELEE = 0;
    public static final int RANGED = 1;
    public static final int ELEMENTAL = 2;

    // Formatos usados para desenhar a arma na tela.
    public static final int SHAPE_FIST = 0;
    public static final int SHAPE_BLADE = 1;
    public static final int SHAPE_GUN = 2;
    public static final int SHAPE_STAFF = 3;
    public static final int SHAPE_TUBE = 4;

    public static final float[] TIER_DMG = {1f, 1.7f, 2.6f, 3.8f};
    public static final float[] TIER_SCALE = {1f, 1.2f, 1.45f, 1.8f};
    public static final float[] TIER_CD = {1f, 0.92f, 0.84f, 0.76f};
    public static final float[] TIER_PRICE = {1f, 2f, 3.8f, 6.5f};
    public static final String[] TIER_NAMES = {"I", "II", "III", "IV"};

    public final String name;
    public final String icon;
    public final int type;
    public final int baseDamage;
    public final float cooldown;
    public final float range;
    public final int scaleStat;
    public final float scale;
    public int critBonus = 0;
    public float critMult = 2f;
    public float knockback = 12f;
    public int pellets = 1;
    public float spread = 0.08f;
    public int pierce = 0;
    public int bounce = 0;
    public float projSpeed = 700f;
    public float explosion = 0f;
    public int burn = 0;
    public float hitRadius = 22f;
    public int shape;
    public int color;
    public int price;
    public String desc = "";

    WeaponDef(String name, String icon, int type, int baseDamage, float cooldown, float range,
              int scaleStat, float scale, int shape, int color, int price) {
        this.name = name;
        this.icon = icon;
        this.type = type;
        this.baseDamage = baseDamage;
        this.cooldown = cooldown;
        this.range = range;
        this.scaleStat = scaleStat;
        this.scale = scale;
        this.shape = shape;
        this.color = color;
        this.price = price;
    }

    public boolean isMelee() {
        return type == MELEE;
    }

    public String typeName() {
        switch (type) {
            case MELEE: return "Corpo a corpo";
            case RANGED: return "À distância";
            default: return "Elemental";
        }
    }

    public static final WeaponDef[] ALL;
    public static final WeaponDef SOCO, FACA, ESPADA, LANCA, ESTILINGUE, PISTOLA,
            SEMENTEIRA, ESCOPETA, CAJADO, BAZUCA, RAIO;

    static {
        SOCO = new WeaponDef("Soco", "👊", MELEE, 8, 0.9f, 110, Stat.MELEE, 1f,
                SHAPE_FIST, 0xFFF2C38B, 12);
        SOCO.knockback = 22;
        SOCO.desc = "Clássico e confiável.";

        FACA = new WeaponDef("Faca", "🔪", MELEE, 6, 0.55f, 100, Stat.MELEE, 0.8f,
                SHAPE_BLADE, 0xFFD8DEE6, 15);
        FACA.critBonus = 20;
        FACA.critMult = 2.5f;
        FACA.knockback = 4;
        FACA.desc = "Rápida, +20% crítico.";

        ESPADA = new WeaponDef("Espada", "🗡", MELEE, 14, 1.1f, 140, Stat.MELEE, 1.2f,
                SHAPE_BLADE, 0xFFB8C7D9, 22);
        ESPADA.hitRadius = 34;
        ESPADA.knockback = 26;
        ESPADA.desc = "Golpe largo e forte.";

        LANCA = new WeaponDef("Lança", "🔱", MELEE, 11, 1.0f, 215, Stat.MELEE, 1f,
                SHAPE_BLADE, 0xFFE0B04A, 20);
        LANCA.knockback = 16;
        LANCA.desc = "Alcance enorme.";

        ESTILINGUE = new WeaponDef("Estilingue", "🎯", RANGED, 9, 1.0f, 360, Stat.RANGED, 1f,
                SHAPE_GUN, 0xFF9C6B3C, 13);
        ESTILINGUE.bounce = 1;
        ESTILINGUE.projSpeed = 620;
        ESTILINGUE.desc = "A pedra ricocheteia 1x.";

        PISTOLA = new WeaponDef("Pistola", "🔫", RANGED, 12, 0.85f, 400, Stat.RANGED, 1f,
                SHAPE_GUN, 0xFF5A6270, 18);
        PISTOLA.pierce = 1;
        PISTOLA.projSpeed = 850;
        PISTOLA.desc = "Atravessa 1 inimigo.";

        SEMENTEIRA = new WeaponDef("Metralha-Semente", "🌰", RANGED, 4, 0.2f, 330, Stat.RANGED, 0.5f,
                SHAPE_TUBE, 0xFF7A9A3A, 20);
        SEMENTEIRA.spread = 0.3f;
        SEMENTEIRA.knockback = 3;
        SEMENTEIRA.projSpeed = 750;
        SEMENTEIRA.desc = "Chuva de sementes!";

        ESCOPETA = new WeaponDef("Escopeta", "💥", RANGED, 5, 1.3f, 280, Stat.RANGED, 0.6f,
                SHAPE_TUBE, 0xFF6B4A33, 24);
        ESCOPETA.pellets = 5;
        ESCOPETA.spread = 0.6f;
        ESCOPETA.pierce = 1;
        ESCOPETA.knockback = 14;
        ESCOPETA.desc = "5 projéteis em leque.";

        CAJADO = new WeaponDef("Cajado de Fogo", "🔥", ELEMENTAL, 5, 1.0f, 380, Stat.ELEMENTAL, 1f,
                SHAPE_STAFF, 0xFFFF7A1A, 20);
        CAJADO.burn = 3;
        CAJADO.projSpeed = 520;
        CAJADO.desc = "Queima os inimigos.";

        BAZUCA = new WeaponDef("Bazuca", "🚀", ELEMENTAL, 18, 1.9f, 450, Stat.ELEMENTAL, 1.3f,
                SHAPE_TUBE, 0xFF4F7A45, 30);
        BAZUCA.explosion = 85;
        BAZUCA.projSpeed = 480;
        BAZUCA.knockback = 30;
        BAZUCA.desc = "Explode em área.";

        RAIO = new WeaponDef("Bastão Elétrico", "⚡", ELEMENTAL, 7, 0.9f, 340, Stat.ELEMENTAL, 1f,
                SHAPE_STAFF, 0xFFFFE14A, 25);
        RAIO.bounce = 3;
        RAIO.projSpeed = 1300;
        RAIO.knockback = 2;
        RAIO.desc = "Raio pula entre 4 alvos.";

        ALL = new WeaponDef[]{SOCO, FACA, ESPADA, LANCA, ESTILINGUE, PISTOLA,
                SEMENTEIRA, ESCOPETA, CAJADO, BAZUCA, RAIO};
    }
}
