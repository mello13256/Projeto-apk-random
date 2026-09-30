package com.escola.hortahostil.game;

import java.util.ArrayList;

public final class Bullet {
    public float x, y, vx, vy;
    public float radius;
    public float life;
    public int damage;
    public boolean crit;
    public int pierce;
    public int bounce;
    public float explosion;
    public int burn;
    public float knockback;
    public int color;
    public boolean enemy;
    public boolean lightning;
    public boolean dead;
    public float prevX, prevY;
    public Weapon source;
    final ArrayList<Enemy> hit = new ArrayList<>(2);
}
