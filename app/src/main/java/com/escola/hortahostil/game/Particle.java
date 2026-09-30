package com.escola.hortahostil.game;

public final class Particle {
    public float x, y, vx, vy;
    public float life, maxLife;
    public float size;
    public int color;
    public boolean ring; // anel de explosao

    public float alpha() {
        return Math.max(0f, life / maxLife);
    }
}
