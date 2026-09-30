package com.escola.hortahostil;

import android.content.Context;
import android.graphics.Canvas;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;

import com.escola.hortahostil.game.Fx;
import com.escola.hortahostil.game.Game;

import java.util.ArrayList;

/**
 * Superficie de desenho + laco principal do jogo (roda numa thread separada).
 * Os toques chegam na thread da interface e sao enfileirados para a thread do jogo.
 */
public final class GameView extends SurfaceView implements SurfaceHolder.Callback, Runnable, Fx {
    private static final float STEP = 1f / 60f;

    private static final int EV_DOWN = 0, EV_MOVE = 1, EV_UP = 2, EV_BACK = 3, EV_CANCEL = 4;

    private final Game game = new Game();
    private final Prefs prefs;
    private final Ui ui;
    private final Sfx sfx;
    private final Vibrator vibrator;

    private Thread thread;
    private volatile boolean running;
    private volatile boolean surfaceReady;
    private volatile int surfaceW, surfaceH;
    private volatile float touchScale = 1f;

    private final ArrayList<float[]> events = new ArrayList<>();
    private final ArrayList<float[]> eventsCopy = new ArrayList<>();
    private Runnable onExit;

    public GameView(Context ctx) {
        super(ctx);
        prefs = new Prefs(ctx);
        ui = new Ui(game, prefs);
        sfx = new Sfx(ctx);
        vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        game.fx = this;
        getHolder().addCallback(this);
        setFocusable(true);
        setKeepScreenOn(true);
    }

    void setOnExit(Runnable r) {
        onExit = r;
    }

    // --- Ciclo de vida ---

    void resume() {
        if (running) return;
        running = true;
        thread = new Thread(this, "horta-loop");
        thread.start();
    }

    void pause() {
        running = false;
        if (thread != null) {
            try {
                thread.join(1000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            thread = null;
        }
        synchronized (events) {
            events.add(new float[]{EV_CANCEL, 0, 0, 0});
        }
        ui.pauseIfPlaying();
    }

    void destroy() {
        sfx.release();
    }

    void back() {
        synchronized (events) {
            events.add(new float[]{EV_BACK, 0, 0, 0});
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        surfaceReady = true;
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        surfaceW = width;
        surfaceH = height;
        touchScale = height / Ui.VH;
        surfaceReady = true;
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceReady = false;
    }

    // --- Toque ---

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        int action = e.getActionMasked();
        float s = touchScale;
        synchronized (events) {
            switch (action) {
                case MotionEvent.ACTION_DOWN:
                case MotionEvent.ACTION_POINTER_DOWN: {
                    int i = e.getActionIndex();
                    events.add(new float[]{EV_DOWN, e.getPointerId(i), e.getX(i) / s, e.getY(i) / s});
                    break;
                }
                case MotionEvent.ACTION_MOVE:
                    for (int i = 0; i < e.getPointerCount(); i++) {
                        events.add(new float[]{EV_MOVE, e.getPointerId(i), e.getX(i) / s, e.getY(i) / s});
                    }
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_POINTER_UP: {
                    int i = e.getActionIndex();
                    events.add(new float[]{EV_UP, e.getPointerId(i), e.getX(i) / s, e.getY(i) / s});
                    break;
                }
                case MotionEvent.ACTION_CANCEL:
                    events.add(new float[]{EV_CANCEL, 0, 0, 0});
                    break;
                default:
                    break;
            }
        }
        return true;
    }

    private void processEvents() {
        synchronized (events) {
            eventsCopy.addAll(events);
            events.clear();
        }
        for (float[] ev : eventsCopy) {
            int id = (int) ev[1];
            switch ((int) ev[0]) {
                case EV_DOWN: ui.onDown(id, ev[2], ev[3]); break;
                case EV_MOVE: ui.onMove(id, ev[2], ev[3]); break;
                case EV_UP: ui.onUp(id, ev[2], ev[3]); break;
                case EV_CANCEL: ui.releaseAll(); break;
                case EV_BACK:
                    if (!ui.onBack() && onExit != null) post(onExit);
                    break;
                default: break;
            }
        }
        eventsCopy.clear();
    }

    // --- Laco principal ---

    @Override
    public void run() {
        long last = System.nanoTime();
        float acc = 0f;
        while (running) {
            if (!surfaceReady || surfaceW == 0) {
                sleep(16);
                last = System.nanoTime();
                continue;
            }
            processEvents();
            long now = System.nanoTime();
            float dt = Math.min(0.1f, (now - last) / 1e9f);
            last = now;
            acc += dt;
            int steps = 0;
            while (acc >= STEP && steps < 5) {
                game.update(STEP, ui.joyX(), ui.joyY());
                acc -= STEP;
                steps++;
            }
            if (steps == 5) acc = 0f;

            SurfaceHolder holder = getHolder();
            Canvas c = null;
            try {
                c = lockCanvas(holder);
                if (c != null) {
                    ui.setSize(c.getWidth(), c.getHeight());
                    ui.draw(c, dt);
                }
            } catch (Exception ex) {
                android.util.Log.e("HortaHostil", "erro ao desenhar", ex);
            } finally {
                if (c != null) {
                    try {
                        holder.unlockCanvasAndPost(c);
                    } catch (Exception ignored) {
                    }
                }
            }
            if (c == null) sleep(16);
        }
    }

    private boolean hardwareFailed;

    private Canvas lockCanvas(SurfaceHolder holder) {
        if (!holder.getSurface().isValid()) return null;
        if (Build.VERSION.SDK_INT >= 26 && !hardwareFailed) {
            try {
                return holder.lockHardwareCanvas();
            } catch (Exception e) {
                hardwareFailed = true;
            }
        }
        return holder.lockCanvas();
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    // --- Fx (chamado pela logica do jogo) ---

    @Override
    public void sound(int id) {
        sfx.enabled = prefs.sound();
        sfx.play(id);
    }

    @Override
    public void vibrate(int ms) {
        if (!prefs.vibration() || vibrator == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(ms);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void runEnded(boolean won, int wave) {
        prefs.recordRun(won, wave);
    }
}
