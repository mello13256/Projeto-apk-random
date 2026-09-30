package com.escola.hortahostil.game;

/** Tipos de inimigos (insetos invasores da horta). */
public final class EnemyDef {
    public static final int AI_CHASE = 0;
    public static final int AI_SHOOT = 1;
    public static final int AI_CHARGE = 2;
    public static final int AI_BOSS_SNAIL = 3;
    public static final int AI_BOSS_ANT = 4;

    public final String name;
    public final String icon;
    public final int ai;
    public final float hp;
    public final float speed;
    public final float damage;
    public final float damagePerWave;
    public final float radius;
    public final int drops;
    public final int minWave;
    public final boolean boss;

    EnemyDef(String name, String icon, int ai, float hp, float speed, float damage,
             float damagePerWave, float radius, int drops, int minWave, boolean boss) {
        this.name = name;
        this.icon = icon;
        this.ai = ai;
        this.hp = hp;
        this.speed = speed;
        this.damage = damage;
        this.damagePerWave = damagePerWave;
        this.radius = radius;
        this.drops = drops;
        this.minWave = minWave;
        this.boss = boss;
    }

    public static final EnemyDef LAGARTA = new EnemyDef("Lagarta", "🐛", AI_CHASE,
            5, 105, 1, 0.6f, 20, 1, 1, false);
    public static final EnemyDef VESPA = new EnemyDef("Vespa", "🐝", AI_CHASE,
            3, 185, 1, 0.45f, 16, 1, 3, false);
    public static final EnemyDef ARANHA = new EnemyDef("Aranha Cuspideira", "🕷", AI_SHOOT,
            8, 80, 1, 0.5f, 20, 1, 5, false);
    public static final EnemyDef JOANINHA = new EnemyDef("Joaninha Blindada", "🐞", AI_CHASE,
            28, 70, 2, 0.8f, 30, 3, 7, false);
    public static final EnemyDef ESCORPIAO = new EnemyDef("Escorpião", "🦂", AI_CHARGE,
            12, 95, 2, 0.7f, 22, 2, 9, false);

    public static final EnemyDef LESMA_RAINHA = new EnemyDef("Lesma Rainha", "🐌", AI_BOSS_SNAIL,
            900, 60, 4, 0f, 64, 40, 10, true);
    public static final EnemyDef FORMIGA_IMPERATRIZ = new EnemyDef("Formiga Imperatriz", "🐜", AI_BOSS_ANT,
            5000, 95, 8, 0f, 70, 80, 20, true);

    public static final EnemyDef[] SPAWNABLE = {LAGARTA, VESPA, ARANHA, JOANINHA, ESCORPIAO};
}
