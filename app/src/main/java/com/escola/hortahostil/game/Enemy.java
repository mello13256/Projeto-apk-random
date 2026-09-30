package com.escola.hortahostil.game;

public final class Enemy {
    public final EnemyDef def;
    public float x, y;
    public float vx, vy; // empurrao (knockback)
    public float hp, maxHp;
    public float radius;
    public float speed;
    public int damage;
    public float flash;
    public boolean dead;
    public boolean facingLeft = true;
    public float anim;

    // Queimadura
    public float burnTime;
    public float burnTick;
    public int burnDamage;

    // IA
    public int aiState;
    public float aiTimer;
    public float aiTimer2;
    public float dashX, dashY;
    public float spiral;

    public Enemy(EnemyDef def, float x, float y, float hpMult, int wave, float speedVar) {
        this.def = def;
        this.x = x;
        this.y = y;
        this.maxHp = def.hp * hpMult;
        this.hp = maxHp;
        this.radius = def.radius;
        this.speed = def.speed * speedVar;
        this.damage = Math.max(1, Math.round(def.damage + def.damagePerWave * (wave - 1)));
    }
}
