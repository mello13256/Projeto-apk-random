package com.escola.hortahostil.game;

import java.util.ArrayList;

/** Uma arma que o jogador carrega (tipo + nivel). */
public final class Weapon {
    public final WeaponDef def;
    public int tier; // 0..3

    // Estado em jogo
    public float x, y;
    public float angle;
    public float cd;
    public boolean hasTarget;

    // Ataque corpo a corpo (estocada)
    public float attackT = -1f;
    public float attackDur;
    public float dirX, dirY;
    public float reach;
    public float tipX, tipY;
    final ArrayList<Enemy> hitList = new ArrayList<>();

    public Weapon(WeaponDef def, int tier) {
        this.def = def;
        this.tier = tier;
    }

    public boolean attacking() {
        return attackT >= 0f;
    }

    public float cooldown(Player p) {
        float speed = 1f + p.stats[Stat.ATK_SPEED] / 100f;
        if (speed < 0.2f) speed = 0.2f;
        return Math.max(0.08f, def.cooldown * WeaponDef.TIER_CD[tier] / speed);
    }

    public float range(Player p) {
        float bonus = def.isMelee() ? p.stats[Stat.RANGE] * 0.5f : p.stats[Stat.RANGE];
        return Math.max(def.isMelee() ? 50f : 80f, def.range + bonus);
    }

    /** Dano antes do critico. */
    public float baseDamage(Player p) {
        float d = def.baseDamage * WeaponDef.TIER_DMG[tier]
                + p.stats[def.scaleStat] * def.scale * WeaponDef.TIER_SCALE[tier];
        d *= p.damageMult();
        return Math.max(1f, d);
    }

    public int critChance(Player p) {
        return def.critBonus + p.stats[Stat.CRIT];
    }

    public int burnDamage(Player p) {
        if (def.burn <= 0) return 0;
        float b = (def.burn + p.stats[Stat.ELEMENTAL] * 0.8f) * WeaponDef.TIER_SCALE[tier];
        b *= p.damageMult();
        return Math.max(1, Math.round(b));
    }

    public int sellPrice(int wave) {
        return Math.max(1, Math.round(Shop.weaponPrice(def, tier, wave) * 0.3f));
    }

    public String title() {
        return def.name + " " + WeaponDef.TIER_NAMES[tier];
    }
}
