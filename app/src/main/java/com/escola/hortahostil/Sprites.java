package com.escola.hortahostil;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;

import java.util.HashMap;

/** Transforma emojis em bitmaps (e guarda em cache) para desenhar rapido. */
final class Sprites {
    private static final int MAX_FONT_PX = 160;
    private final HashMap<String, Bitmap> cache = new HashMap<>();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    Sprites() {
        paint.setTextAlign(Paint.Align.CENTER);
    }

    /** Bitmap quadrado do emoji com aproximadamente {@code px} pixels de lado. */
    Bitmap get(String emoji, int px) {
        int size = Math.max(16, Math.min(MAX_FONT_PX, px));
        // Arredonda o tamanho pra nao criar bitmaps demais.
        size = (size + 7) / 8 * 8;
        String key = emoji + '#' + size;
        Bitmap b = cache.get(key);
        if (b != null) return b;
        String text = emoji.endsWith("️") ? emoji : emoji + "️";
        b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        paint.setTextSize(size * 0.8f);
        Paint.FontMetrics fm = paint.getFontMetrics();
        float y = size / 2f - (fm.ascent + fm.descent) / 2f;
        c.drawText(text, size / 2f, y, paint);
        cache.put(key, b);
        return b;
    }
}
