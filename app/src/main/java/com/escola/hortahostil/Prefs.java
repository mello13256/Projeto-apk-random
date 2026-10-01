package com.escola.hortahostil;

import android.content.Context;
import android.content.SharedPreferences;

/** Configuracoes, recordes e a partida salva, guardados no celular. */
final class Prefs {
    private final SharedPreferences sp;
    private volatile boolean sound;
    private volatile boolean music;
    private volatile boolean vibration;

    Prefs(Context ctx) {
        sp = ctx.getSharedPreferences("horta_hostil", Context.MODE_PRIVATE);
        sound = sp.getBoolean("sound", true);
        music = sp.getBoolean("music", true);
        vibration = sp.getBoolean("vibration", true);
    }

    boolean sound() {
        return sound;
    }

    void setSound(boolean on) {
        sound = on;
        sp.edit().putBoolean("sound", on).apply();
    }

    boolean music() {
        return music;
    }

    void setMusic(boolean on) {
        music = on;
        sp.edit().putBoolean("music", on).apply();
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

    int totalKills() {
        return sp.getInt("total_kills", 0);
    }

    /** Melhor dificuldade vencida (-1 = nenhuma). */
    int bestDifficultyWon() {
        return sp.getInt("best_diff_won", -1);
    }

    int lastDifficulty() {
        return sp.getInt("last_diff", 1);
    }

    int lastChar() {
        return sp.getInt("last_char", 0);
    }

    void setLastChoice(int charIndex, int difficulty) {
        sp.edit().putInt("last_char", charIndex).putInt("last_diff", difficulty).apply();
    }

    void recordRun(boolean won, int wave, int kills, int difficulty) {
        SharedPreferences.Editor e = sp.edit();
        if (wave > bestWave()) e.putInt("best_wave", wave);
        if (won) {
            e.putInt("wins", wins() + 1);
            if (difficulty > bestDifficultyWon()) e.putInt("best_diff_won", difficulty);
        }
        e.putInt("total_kills", totalKills() + kills);
        e.remove("saved_run");
        e.apply();
    }

    String playerName() {
        return sp.getString("player_name", "");
    }

    void setPlayerName(String name) {
        sp.edit().putString("player_name", name).apply();
    }

    // --- Partida salva ---

    String savedRun() {
        return sp.getString("saved_run", null);
    }

    void saveRun(String data) {
        if (data != null) sp.edit().putString("saved_run", data).apply();
    }

    void clearRun() {
        sp.edit().remove("saved_run").apply();
    }
}
