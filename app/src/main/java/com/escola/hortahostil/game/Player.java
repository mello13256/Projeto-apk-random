package com.escola.hortahostil.game;

import java.util.ArrayList;

public final class Player {
    public static final int MAX_WEAPONS = 6;
    public static final float BASE_SPEED = 240f;

    public final CharDef character;
    public final int[] stats = new int[Stat.COUNT];
    public final ArrayList<Weapon> weapons = new ArrayList<>();
    public final ArrayList<ItemDef> items = new ArrayList<>();
    /** Soma dos efeitos especiais dos itens (índice = ItemDef.SP_*). */
    public final int[] specials = new int[ItemDef.SP_COUNT];
    /** Caixas coletadas nesta onda (abertas no fim da onda). */
    public int crates;

    public float x, y;
    public final float radius = 26f;
    public float hp;
    public float iframes;
    public float regenAcc;
    public boolean facingLeft;
    public float moveAnim;
    public float lookX = 1f, lookY = 0f;
    public boolean moving;

    public int level = 1;
    public int xp;
    public int materials;

    public Player(CharDef c) {
        character = c;
        stats[Stat.HP] = 10;
        for (int i = 0; i < c.mods.length; i += 2) stats[c.mods[i]] += c.mods[i + 1];
        weapons.add(new Weapon(c.startWeapon, 0));
        hp = maxHp();
    }

    public int maxHp() {
        return Math.max(1, stats[Stat.HP]);
    }

    public float speed() {
        return BASE_SPEED * Math.max(0.3f, 1f + stats[Stat.SPEED] / 100f);
    }

    public float damageMult() {
        return Math.max(0.1f, 1f + stats[Stat.DAMAGE] / 100f);
    }

    public int dodgeChance() {
        return Math.min(60, Math.max(0, stats[Stat.DODGE]));
    }

    /** Multiplicador de dano recebido pela armadura. */
    public float armorFactor() {
        int a = stats[Stat.ARMOR];
        if (a >= 0) return 1f / (1f + a / 15f);
        return 1f + (-a) / 15f;
    }

    public int xpToNext() {
        return (level + 3) * (level + 3);
    }

    public float pickupRange() {
        return 110f * (1f + specials[ItemDef.SP_MAGNET] / 100f);
    }

    public void addItem(ItemDef it) {
        items.add(it);
        it.applyTo(stats);
        if (it.special != ItemDef.SP_NONE) specials[it.special] += it.specialValue;
        hp = Math.min(maxHp(), Math.max(hp, 1));
    }

    public void heal(float amount) {
        hp = Math.min(maxHp(), hp + amount);
    }
}
