package com.escola.hortahostil.game;

/** Efeitos que dependem do Android (som, vibracao, recordes). */
public interface Fx {
    int SHOOT = 0;
    int HIT = 1;
    int PICKUP = 2;
    int HURT = 3;
    int LEVEL_UP = 4;
    int BUY = 5;
    int EXPLODE = 6;
    int WAVE_END = 7;
    int KILL = 8;
    int ERROR = 9;

    void sound(int id);

    void vibrate(int ms);

    void runEnded(boolean won, int wave);

    Fx NONE = new Fx() {
        @Override public void sound(int id) { }
        @Override public void vibrate(int ms) { }
        @Override public void runEnded(boolean won, int wave) { }
    };
}
