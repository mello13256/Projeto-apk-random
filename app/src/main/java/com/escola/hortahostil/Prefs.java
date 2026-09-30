package com.escola.hortahostil;

import android.content.Context;
import android.content.SharedPreferences;

/** Configuracoes e recordes salvos no celular. */
final class Prefs {
    private final SharedPreferences sp;
    private volatile boolean sound;
    private volatile boolean vibration;

    Prefs(Context ctx) {
        sp = ctx.getSharedPreferences("horta_hostil", Context.MODE_PRIVATE);
        sound = sp.getBoolean("sound", true);
        vibration = sp.getBoolean("vibration", true);
    }

    boolean sound() {
        return sound;
    }

    void setSound(boolean on) {
        sound = on;
        sp.edit().putBoolean("sound", on).apply();
    }

    boolean vibration() {
        return vibration;
    }

    void setVibration(boolean on) {
        vibration = on;
        sp.edit().putBoolean("vibration", on).apply();
    }

    int bestWave() {
        return sp.getInt("best_wave", 0);
    }

    int wins() {
        return sp.getInt("wins", 0);
    }

    void recordRun(boolean won, int wave) {
        SharedPreferences.Editor e = sp.edit();
        if (wave > bestWave()) e.putInt("best_wave", wave);
        if (won) e.putInt("wins", wins() + 1);
        e.apply();
    }
}
