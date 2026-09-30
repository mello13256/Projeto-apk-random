package com.escola.hortahostil.game;

import java.util.Random;

/** Regras de preco e raridade da loja. */
public final class Shop {
    public static final int SLOTS = 4;
    static final int[] ITEM_BASE_PRICE = {18, 40, 75, 120};

    /** Uma oferta na loja: arma OU item. */
    public static final class Offer {
        public WeaponDef weapon;
        public ItemDef item;
        public int tier;
        public int price;
        public boolean locked;

        public String name() {
            return weapon != null ? weapon.name + " " + WeaponDef.TIER_NAMES[tier] : item.name;
        }

        public String icon() {
            return weapon != null ? weapon.icon : item.icon;
        }
    }

    private Shop() {
    }

    static float inflation(int wave) {
        return 1f + 0.08f * Math.max(0, wave - 1);
    }

    public static int weaponPrice(WeaponDef def, int tier, int wave) {
        return Math.max(1, Math.round(def.price * WeaponDef.TIER_PRICE[tier] * inflation(wave)));
    }

    public static int itemPrice(ItemDef item, int wave) {
        return Math.max(1, Math.round(ITEM_BASE_PRICE[item.tier] * inflation(wave)));
    }

    /** Sorteia a raridade (0..3) conforme a onda e a sorte. */
    public static int rollTier(Random rng, int wave, int luck) {
        float l = Math.max(0.2f, 1f + luck / 100f);
        float t4 = clamp((wave - 7) * 0.015f * l, 0f, 0.15f);
        float t3 = clamp((wave - 4) * 0.03f * l, 0f, 0.35f);
        float t2 = clamp((wave - 1) * 0.06f * l, 0f, 0.6f);
        float r = rng.nextFloat();
        if (r < t4) return 3;
        if (r < t4 + t3) return 2;
        if (r < t4 + t3 + t2) return 1;
        return 0;
    }

    static float clamp(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    public static Offer randomOffer(Random rng, Player p, int wave) {
        Offer o = new Offer();
        o.tier = rollTier(rng, wave, p.stats[Stat.LUCK]);
        if (rng.nextFloat() < 0.35f) {
            // Prefere armas que o jogador ja tem (facilita combinar).
            if (!p.weapons.isEmpty() && rng.nextFloat() < 0.35f) {
                o.weapon = p.weapons.get(rng.nextInt(p.weapons.size())).def;
            } else {
                o.weapon = WeaponDef.ALL[rng.nextInt(WeaponDef.ALL.length)];
            }
            o.price = varied(rng, weaponPrice(o.weapon, o.tier, wave));
        } else {
            int count = 0;
            for (ItemDef it : ItemDef.ALL) if (it.tier == o.tier) count++;
            int pick = rng.nextInt(count);
            for (ItemDef it : ItemDef.ALL) {
                if (it.tier != o.tier) continue;
                if (pick-- == 0) {
                    o.item = it;
                    break;
                }
            }
            o.price = varied(rng, itemPrice(o.item, wave));
        }
        return o;
    }

    static int varied(Random rng, int price) {
        float v = 0.9f + rng.nextFloat() * 0.2f;
        return Math.max(1, Math.round(price * v));
    }
}
