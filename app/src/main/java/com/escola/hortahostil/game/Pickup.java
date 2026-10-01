package com.escola.hortahostil.game;

public final class Pickup {
    public static final int MATERIAL = 0;
    public static final int FRUIT = 1;
    public static final int CRATE = 2;

    public final int type;
    public float x, y, vx, vy;
    public int value;
    public boolean attracted;
    public boolean dead;
    public float bob;

    public Pickup(int type, float x, float y, int value) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.value = value;
    }
}
