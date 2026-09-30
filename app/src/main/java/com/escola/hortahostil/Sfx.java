package com.escola.hortahostil;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.os.SystemClock;

import com.escola.hortahostil.game.Fx;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Random;

/**
 * Efeitos sonoros gerados por codigo (sem arquivos de audio!).
 * Cada som e sintetizado uma vez, salvo como .wav no cache e tocado pelo SoundPool.
 */
final class Sfx {
    private static final int RATE = 22050;
    private static final int COUNT = 10;
    private static final long[] MIN_GAP = {70, 45, 35, 120, 120, 60, 90, 200, 45, 120};
    private static final float[] VOLUME = {0.35f, 0.4f, 0.45f, 0.8f, 0.6f, 0.6f, 0.7f, 0.6f, 0.4f, 0.5f};

    private final SoundPool pool;
    private final int[] ids = new int[COUNT];
    private final long[] last = new long[COUNT];
    volatile boolean enabled = true;

    Sfx(Context ctx) {
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        pool = new SoundPool.Builder().setMaxStreams(8).setAudioAttributes(attrs).build();
        File dir = ctx.getCacheDir();
        for (int i = 0; i < COUNT; i++) {
            try {
                File f = new File(dir, "sfx_v1_" + i + ".wav");
                if (!f.exists()) {
                    FileOutputStream out = new FileOutputStream(f);
                    out.write(wav(synth(i)));
                    out.close();
                }
                ids[i] = pool.load(f.getAbsolutePath(), 1);
            } catch (Exception e) {
                ids[i] = 0;
            }
        }
    }

    void play(int id) {
        if (!enabled || id < 0 || id >= COUNT || ids[id] == 0) return;
        long now = SystemClock.uptimeMillis();
        if (now - last[id] < MIN_GAP[id]) return;
        last[id] = now;
        float v = VOLUME[id];
        pool.play(ids[id], v, v, 1, 0, 1f);
    }

    void release() {
        pool.release();
    }

    // ------------------------------------------------------------------
    // Sintetizador bem simples
    // ------------------------------------------------------------------

    private static float[] synth(int id) {
        switch (id) {
            case Fx.SHOOT: return sweep(0.05f, 720, 360, 1);
            case Fx.HIT: return noise(0.04f, 0.5f);
            case Fx.PICKUP: return sweep(0.07f, 900, 1500, 0);
            case Fx.HURT: return sweep(0.22f, 320, 70, 2);
            case Fx.LEVEL_UP: return arpeggio(new float[]{523, 659, 784, 1047}, 0.075f, 1);
            case Fx.BUY: return arpeggio(new float[]{988, 1319}, 0.08f, 0);
            case Fx.EXPLODE: return noise(0.35f, 0.08f);
            case Fx.WAVE_END: return arpeggio(new float[]{392, 523, 659, 784, 1047}, 0.09f, 0);
            case Fx.KILL: return sweep(0.08f, 420, 900, 1);
            default: return sweep(0.16f, 160, 130, 1); // ERROR
        }
    }

    /** Onda que desliza de uma frequencia pra outra. shape: 0 seno, 1 quadrada, 2 serra. */
    private static float[] sweep(float dur, float f0, float f1, int shape) {
        int n = (int) (dur * RATE);
        float[] s = new float[n];
        double phase = 0;
        for (int i = 0; i < n; i++) {
            float t = i / (float) n;
            double f = f0 + (f1 - f0) * t;
            phase += f / RATE;
            double ph = phase - Math.floor(phase);
            float v;
            if (shape == 0) v = (float) Math.sin(ph * Math.PI * 2);
            else if (shape == 1) v = ph < 0.5 ? 0.6f : -0.6f;
            else v = (float) (ph * 2 - 1) * 0.8f;
            s[i] = v * envelope(t);
        }
        return s;
    }

    private static float[] arpeggio(float[] notes, float noteDur, int shape) {
        int per = (int) (noteDur * RATE);
        float[] s = new float[per * notes.length + per];
        for (int k = 0; k < notes.length; k++) {
            float[] part = sweep(noteDur * 2f, notes[k], notes[k], shape);
            for (int i = 0; i < part.length && k * per + i < s.length; i++) s[k * per + i] += part[i] * 0.7f;
        }
        return s;
    }

    /** Ruido filtrado (quanto menor o "cut", mais grave). */
    private static float[] noise(float dur, float cut) {
        Random r = new Random(7);
        int n = (int) (dur * RATE);
        float[] s = new float[n];
        float y = 0;
        for (int i = 0; i < n; i++) {
            float x = r.nextFloat() * 2 - 1;
            y += (x - y) * cut;
            float t = i / (float) n;
            s[i] = y * envelope(t) * (cut < 0.2f ? 3f : 1f);
        }
        return s;
    }

    private static float envelope(float t) {
        float attack = Math.min(1f, t * 40f);
        return attack * (1f - t) * (1f - t);
    }

    private static byte[] wav(float[] samples) {
        int dataLen = samples.length * 2;
        byte[] b = new byte[44 + dataLen];
        writeStr(b, 0, "RIFF");
        writeInt(b, 4, 36 + dataLen);
        writeStr(b, 8, "WAVE");
        writeStr(b, 12, "fmt ");
        writeInt(b, 16, 16);
        writeShort(b, 20, 1); // PCM
        writeShort(b, 22, 1); // mono
        writeInt(b, 24, RATE);
        writeInt(b, 28, RATE * 2);
        writeShort(b, 32, 2);
        writeShort(b, 34, 16);
        writeStr(b, 36, "data");
        writeInt(b, 40, dataLen);
        for (int i = 0; i < samples.length; i++) {
            float v = Math.max(-1f, Math.min(1f, samples[i]));
            writeShort(b, 44 + i * 2, (int) (v * 32000));
        }
        return b;
    }

    private static void writeStr(byte[] b, int off, String s) {
        for (int i = 0; i < s.length(); i++) b[off + i] = (byte) s.charAt(i);
    }

    private static void writeInt(byte[] b, int off, int v) {
        b[off] = (byte) v;
        b[off + 1] = (byte) (v >> 8);
        b[off + 2] = (byte) (v >> 16);
        b[off + 3] = (byte) (v >> 24);
    }

    private static void writeShort(byte[] b, int off, int v) {
        b[off] = (byte) v;
        b[off + 1] = (byte) (v >> 8);
    }
}
