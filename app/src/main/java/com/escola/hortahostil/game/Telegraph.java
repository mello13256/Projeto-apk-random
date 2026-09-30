package com.escola.hortahostil.game;

/** Marca vermelha que aparece antes de um inimigo nascer. */
public final class Telegraph {
    public final EnemyDef def;
    public final float x, y;
    public float time;

    public Telegraph(EnemyDef def, float x, float y, float time) {
        this.def = def;
        this.x = x;
        this.y = y;
        this.time = time;
    }
}
