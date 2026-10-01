package com.escola.hortahostil;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffColorFilter;
import android.graphics.RectF;
import android.graphics.Typeface;

import com.escola.hortahostil.game.Bullet;
import com.escola.hortahostil.game.CharDef;
import com.escola.hortahostil.game.Enemy;
import com.escola.hortahostil.game.EnemyDef;
import com.escola.hortahostil.game.FloatText;
import com.escola.hortahostil.game.Game;
import com.escola.hortahostil.game.ItemDef;
import com.escola.hortahostil.game.Particle;
import com.escola.hortahostil.game.Pickup;
import com.escola.hortahostil.game.Player;
import com.escola.hortahostil.game.Shop;
import com.escola.hortahostil.game.Stat;
import com.escola.hortahostil.game.Telegraph;
import com.escola.hortahostil.game.Weapon;
import com.escola.hortahostil.game.WeaponDef;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;

/**
 * Desenha o jogo e trata os toques. Usa "UI imediata": a cada quadro os
 * botoes sao desenhados e registrados; o toque seguinte e testado contra eles.
 * Coordenadas "virtuais": a tela sempre tem 720 de altura.
 */
final class Ui {
    static final float VH = 720f;
    /** Versão online do jogo (publicada pelo GitHub Pages). */
    static final String WEBSITE = "https://mello13256.github.io/Projeto-apk-random/";
    /** O multiplayer roda no site: o app abre direto na tela de multiplayer. */
    static final String MULTIPLAYER_URL = WEBSITE + "#mp";

    // Acoes dos botoes
    private static final int A_PLAY = 1, A_SOUND = 2, A_VIBRA = 3, A_CHAR = 4, A_START = 5,
            A_MENU = 6, A_PAUSE = 7, A_RESUME = 8, A_QUIT = 9, A_LEVEL = 10, A_LEVEL_REROLL = 11,
            A_BUY = 12, A_LOCK = 13, A_REROLL = 14, A_NEXT = 15, A_WEAPON = 16, A_SELL = 17,
            A_COMBINE = 18, A_CLOSE = 19, A_AGAIN = 20, A_HELP = 21, A_MUSIC = 22,
            A_CONTINUE = 23, A_DIFF = 24, A_CRATE_TAKE = 25, A_CRATE_RECYCLE = 26, A_ITEM = 27,
            A_RANDOM = 28, A_ONLINE = 29, A_RANKING = 30, A_RANK_TAB = 31, A_RANK_REFRESH = 32,
            A_SUBMIT = 33;
    private static final int RANDOM_CHAR = -1;

    private static final int[] TIER_COLOR = {0xFFD7D7D7, 0xFF4AA3FF, 0xFFB76BFF, 0xFFFF5A4A};
    private static final int[] TIER_BG = {0xFF3A3A3A, 0xFF1C3552, 0xFF3A2358, 0xFF55221C};

    private static final int C_BG = 0xFF1B2414;
    private static final int C_PANEL = 0xE62A2116;
    private static final int C_PANEL_BORDER = 0xFF7A5A30;
    private static final int C_GREEN = 0xFF4CAF50;
    private static final int C_ORANGE = 0xFFF08A24;
    private static final int C_GRAY = 0xFF5A5A5A;
    private static final int C_RED = 0xFFD9443A;
    private static final int C_SEED = 0xFF8EE05A;

    private final Game game;
    private final Sprites sprites = new Sprites();
    private final Prefs prefs;
    private final Random rng = new Random();

    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textOutline = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bmpPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint flashPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint burnPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint chargePaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final RectF rect = new RectF();

    float vw = 1280f;
    float scale = 1f;
    private float time;

    // Botoes do ultimo quadro
    private static final class Btn {
        float x, y, w, h;
        int action, arg;
        boolean enabled;
    }

    private final ArrayList<Btn> buttons = new ArrayList<>();
    private int buttonCount;
    private final int[] downAction = new int[16];
    private final int[] downArg = new int[16];

    // Joystick virtual
    private int joyId = -1;
    private float joyOx, joyOy, joyX, joyY;
    private static final float JOY_RADIUS = 75f;

    // Estado da interface
    private int selectedChar = 0;
    private int popupWeapon = -1;
    private boolean showHelp;
    private String toast = "";
    private float toastTime;
    private int difficulty = 1;
    private int tipItem = -1;
    private float tipTime;
    private String newUnlocks = "";
    private Game.State lastState;
    private Runnable onMusicChanged;
    private Runnable onOpenWebsite;

    // --- Ranking online ---

    /** Uma linha do ranking. */
    static final class RankEntry {
        String id, name, platform;
        int character, wave, kills;
        boolean won;
        long score, createdAt;
    }

    /** Quem fala com a internet (o GameView). */
    interface Net {
        void loadRanking(int diff);

        /** Pergunta o nome e envia a partida que acabou de terminar. */
        void submitScore(int diff, int character, int wave, boolean won, int kills, int level);
    }

    private Net net;
    private int rankDiff = 1;
    private boolean rankLoading;
    private String rankError = "";
    private ArrayList<RankEntry> rankEntries;
    private String rankMyId;
    /** "" = ainda não enviou, "sending" = enviando, "sent" = enviado. */
    private String submitState = "";
    /** Resultados que chegam de outras threads e são aplicados na thread do jogo. */
    private final ArrayList<Runnable> inbox = new ArrayList<>();
    private final Paint vignettePaint = new Paint();
    private final Paint slowPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint elitePaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

    // Arena pre-desenhada
    private Bitmap arena;

    Ui(Game game, Prefs prefs) {
        this.game = game;
        this.prefs = prefs;
        Typeface tf = Typeface.create(Typeface.DEFAULT, Typeface.BOLD);
        textPaint.setTypeface(tf);
        textOutline.setTypeface(tf);
        textOutline.setStyle(Paint.Style.STROKE);
        textOutline.setStrokeJoin(Paint.Join.ROUND);
        textOutline.setColor(0xFF000000);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        flashPaint.setColorFilter(new PorterDuffColorFilter(0xFFFFFFFF, PorterDuff.Mode.SRC_ATOP));
        burnPaint.setColorFilter(new PorterDuffColorFilter(0x88FF6A00, PorterDuff.Mode.SRC_ATOP));
        chargePaint.setColorFilter(new PorterDuffColorFilter(0x99FF2020, PorterDuff.Mode.SRC_ATOP));
        slowPaint.setColorFilter(new PorterDuffColorFilter(0x7780D8FF, PorterDuff.Mode.SRC_ATOP));
        elitePaint.setColorFilter(new PorterDuffColorFilter(0x55FFC400, PorterDuff.Mode.SRC_ATOP));
        selectedChar = prefs.lastChar();
        difficulty = prefs.lastDifficulty();
    }

    void setNet(Net n) {
        net = n;
    }

    /** Executa r na thread do jogo, no próximo quadro (seguro chamar de qualquer thread). */
    void runLater(Runnable r) {
        synchronized (inbox) {
            inbox.add(r);
        }
    }

    private void openRanking(int diff) {
        game.state = Game.State.RANKING;
        rankDiff = diff;
        rankLoading = true;
        rankError = "";
        rankEntries = null;
        if (net != null) net.loadRanking(diff);
        else {
            rankLoading = false;
            rankError = "Ranking indisponível.";
        }
    }

    /** Chamado (via runLater) quando o ranking chega da internet. */
    void rankingLoaded(int diff, ArrayList<RankEntry> list, String error) {
        if (diff != rankDiff) return;
        rankLoading = false;
        rankEntries = list;
        rankError = error == null ? "" : error;
    }

    /** Chamado (via runLater) depois de tentar enviar a pontuação. */
    void scoreSubmitted(int diff, String id, String error, ArrayList<RankEntry> top) {
        if (error != null) {
            submitState = "";
            showToast(error);
            return;
        }
        if (id == null) { // o jogador cancelou
            submitState = "";
            return;
        }
        submitState = "sent";
        rankMyId = id;
        int pos = -1;
        if (top != null) {
            for (int i = 0; i < top.size(); i++) if (id.equals(top.get(i).id)) pos = i;
        }
        showToast(pos >= 0 ? "Enviado! Você está em " + (pos + 1) + "º lugar no " + Game.DIFF_NAMES[diff] + "!"
                : "Enviado pro ranking!");
    }

    /** Abre o multiplayer no site (GitHub Pages). */
    void setOnOpenWebsite(Runnable r) {
        onOpenWebsite = r;
    }

    /** Chamado quando o jogador liga/desliga a música no menu. */
    void setOnMusicChanged(Runnable r) {
        onMusicChanged = r;
    }

    /** Quais personagens já estão liberados (pelos recordes salvos). */
    boolean[] unlockedChars() {
        boolean[] u = new boolean[CharDef.ALL.length];
        for (int i = 0; i < u.length; i++) {
            u[i] = CharDef.ALL[i].isUnlocked(prefs.bestWave(), prefs.wins(), prefs.totalKills());
        }
        return u;
    }

    void setNewUnlocks(String names) {
        newUnlocks = names;
    }

    /** Salva a partida se estiver na loja (chamado ao sair do app). */
    void saveIfPossible() {
        if (game.state == Game.State.SHOP) prefs.saveRun(game.saveToString());
    }

    void setSize(int w, int h) {
        scale = h / VH;
        vw = w / scale;
    }

    float joyX() {
        if (joyId < 0) return 0f;
        return clampJoy(joyX - joyOx) / JOY_RADIUS;
    }

    float joyY() {
        if (joyId < 0) return 0f;
        return clampJoy(joyY - joyOy) / JOY_RADIUS;
    }

    private float clampJoy(float v) {
        return Math.max(-JOY_RADIUS, Math.min(JOY_RADIUS, v));
    }

    // ------------------------------------------------------------------
    // Entrada
    // ------------------------------------------------------------------

    void onDown(int id, float x, float y) {
        if (id < 0 || id >= downAction.length) return;
        Btn b = hit(x, y);
        downAction[id] = b != null ? b.action : 0;
        downArg[id] = b != null ? b.arg : 0;
        if (b == null && game.state == Game.State.PLAYING && !game.paused && joyId < 0) {
            joyId = id;
            joyOx = joyX = x;
            joyOy = joyY = y;
        }
    }

    void onMove(int id, float x, float y) {
        if (id == joyId) {
            joyX = x;
            joyY = y;
            // A base do joystick acompanha o dedo se ele for longe demais.
            float dx = joyX - joyOx, dy = joyY - joyOy;
            float d = (float) Math.sqrt(dx * dx + dy * dy);
            if (d > JOY_RADIUS * 1.6f) {
                float k = (d - JOY_RADIUS * 1.6f) / d;
                joyOx += dx * k;
                joyOy += dy * k;
            }
        }
    }

    void onUp(int id, float x, float y) {
        if (id == joyId) {
            joyId = -1;
            return;
        }
        if (id < 0 || id >= downAction.length) return;
        Btn b = hit(x, y);
        if (b != null && b.enabled && b.action == downAction[id] && b.arg == downArg[id]) {
            doAction(b.action, b.arg);
        } else if (b != null && !b.enabled && b.action == downAction[id]) {
            disabledTap(b.action, b.arg);
        }
        downAction[id] = 0;
    }

    void releaseAll() {
        joyId = -1;
    }

    /** Botao voltar do Android. Retorna false se o app deve fechar. */
    boolean onBack() {
        if (popupWeapon >= 0) {
            popupWeapon = -1;
            return true;
        }
        if (showHelp) {
            showHelp = false;
            return true;
        }
        switch (game.state) {
            case MENU:
                return false;
            case PLAYING:
                game.paused = !game.paused;
                joyId = -1;
                return true;
            case CHAR_SELECT:
            case GAME_OVER:
            case VICTORY:
            case RANKING:
                game.state = Game.State.MENU;
                return true;
            default:
                return true;
        }
    }

    void pauseIfPlaying() {
        if (game.state == Game.State.PLAYING) game.paused = true;
        joyId = -1;
    }

    private Btn hit(float x, float y) {
        for (int i = buttonCount - 1; i >= 0; i--) {
            Btn b = buttons.get(i);
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
        }
        return null;
    }

    private void doAction(int action, int arg) {
        Player p = game.player;
        switch (action) {
            case A_PLAY:
                newUnlocks = "";
                game.state = Game.State.CHAR_SELECT;
                break;
            case A_CONTINUE:
                if (game.loadFromString(prefs.savedRun())) {
                    showToast("Partida carregada: onda " + game.wave + " concluída");
                } else {
                    prefs.clearRun();
                    showToast("Não deu pra carregar a partida salva.");
                }
                break;
            case A_SOUND:
                prefs.setSound(!prefs.sound());
                break;
            case A_MUSIC:
                prefs.setMusic(!prefs.music());
                if (onMusicChanged != null) onMusicChanged.run();
                break;
            case A_VIBRA:
                prefs.setVibration(!prefs.vibration());
                break;
            case A_HELP:
                showHelp = !showHelp;
                break;
            case A_ONLINE:
                if (onOpenWebsite != null) onOpenWebsite.run();
                break;
            case A_RANKING:
                openRanking(difficulty);
                break;
            case A_RANK_TAB:
                openRanking(arg);
                break;
            case A_RANK_REFRESH:
                openRanking(rankDiff);
                break;
            case A_SUBMIT:
                if (p != null && submitState.isEmpty() && net != null) {
                    submitState = "sending";
                    net.submitScore(game.difficulty, indexOfChar(p.character), game.wave,
                            game.state == Game.State.VICTORY, game.kills, p.level);
                }
                break;
            case A_CHAR:
                selectedChar = arg;
                break;
            case A_RANDOM:
                selectedChar = RANDOM_CHAR;
                break;
            case A_DIFF:
                difficulty = (difficulty + arg + Game.DIFF_NAMES.length) % Game.DIFF_NAMES.length;
                break;
            case A_START: {
                boolean[] unlocked = unlockedChars();
                int idx = selectedChar;
                if (idx == RANDOM_CHAR) {
                    int count = 0;
                    for (boolean b : unlocked) if (b) count++;
                    int pick = rng.nextInt(count);
                    for (int i = 0; i < unlocked.length; i++) {
                        if (unlocked[i] && pick-- == 0) {
                            idx = i;
                            break;
                        }
                    }
                } else if (!unlocked[idx]) {
                    showToast("Personagem bloqueado: " + CharDef.ALL[idx].unlockText());
                    break;
                }
                prefs.setLastChoice(selectedChar == RANDOM_CHAR ? 0 : selectedChar, difficulty);
                prefs.clearRun();
                game.newRun(CharDef.ALL[idx], difficulty);
                joyId = -1;
                break;
            }
            case A_AGAIN:
                newUnlocks = "";
                prefs.clearRun();
                game.newRun(p != null ? p.character : CharDef.ALL[0], game.difficulty);
                joyId = -1;
                break;
            case A_MENU:
                game.state = Game.State.MENU;
                game.paused = false;
                break;
            case A_PAUSE:
                game.paused = true;
                joyId = -1;
                break;
            case A_RESUME:
                game.paused = false;
                break;
            case A_QUIT:
                game.paused = false;
                game.state = Game.State.GAME_OVER;
                game.fx.runEnded(false, game.wave);
                break;
            case A_LEVEL:
                game.chooseLevel(arg);
                break;
            case A_LEVEL_REROLL:
                if (!game.rerollLevel()) showToast("Sementes insuficientes!");
                break;
            case A_CRATE_TAKE:
                game.resolveCrate(true);
                break;
            case A_CRATE_RECYCLE:
                game.resolveCrate(false);
                break;
            case A_BUY: {
                int r = game.buy(arg);
                if (r == Game.BUY_NO_MONEY) showToast("Sementes insuficientes!");
                else if (r == Game.BUY_FULL) showToast("Armas cheias! Venda ou combine uma.");
                break;
            }
            case A_LOCK:
                game.toggleLock(arg);
                break;
            case A_REROLL:
                if (!game.rerollShop()) showToast("Sementes insuficientes!");
                break;
            case A_NEXT:
                popupWeapon = -1;
                tipItem = -1;
                game.nextWave();
                joyId = -1;
                break;
            case A_WEAPON:
                popupWeapon = arg;
                break;
            case A_ITEM:
                if (tipItem == arg && tipTime > 0) tipTime = 0;
                else {
                    tipItem = arg;
                    tipTime = 3f;
                }
                break;
            case A_SELL:
                if (game.sellWeapon(popupWeapon)) popupWeapon = -1;
                else showToast("Você precisa de pelo menos 1 arma!");
                break;
            case A_COMBINE:
                if (game.combineWeapon(popupWeapon)) {
                    popupWeapon = -1;
                    showToast("Arma melhorada!");
                }
                break;
            case A_CLOSE:
                popupWeapon = -1;
                break;
            default:
                break;
        }
        // Na loja, qualquer mudança já fica salva (pra continuar depois).
        if (game.state == Game.State.SHOP) prefs.saveRun(game.saveToString());
    }

    private void disabledTap(int action, int arg) {
        if (action == A_BUY) {
            int r = game.checkBuy(arg);
            if (r == Game.BUY_NO_MONEY) showToast("Sementes insuficientes!");
            else if (r == Game.BUY_FULL) showToast("Armas cheias! Venda ou combine uma.");
        } else if (action == A_REROLL || action == A_LEVEL_REROLL) {
            showToast("Sementes insuficientes!");
        } else if (action == A_SELL) {
            showToast("Você precisa de pelo menos 1 arma!");
        } else if (action == A_COMBINE) {
            showToast("Precisa de outra arma igual (mesmo nível).");
        }
    }

    private void showToast(String s) {
        toast = s;
        toastTime = 2f;
    }

    // ------------------------------------------------------------------
    // Desenho
    // ------------------------------------------------------------------

    void draw(Canvas c, float dt) {
        time += dt;
        if (tipTime > 0f) tipTime -= dt;
        synchronized (inbox) {
            for (Runnable r : inbox) r.run();
            inbox.clear();
        }
        if (game.state != lastState) {
            if (game.state == Game.State.SHOP) prefs.saveRun(game.saveToString());
            if (game.state == Game.State.GAME_OVER || game.state == Game.State.VICTORY) submitState = "";
            lastState = game.state;
        }
        if (toastTime > 0f) toastTime -= dt;
        buttonCount = 0;
        c.save();
        c.scale(scale, scale);
        c.drawColor(C_BG);
        switch (game.state) {
            case MENU:
                drawMenu(c);
                break;
            case CHAR_SELECT:
                drawCharSelect(c);
                break;
            case PLAYING:
                drawWorld(c);
                if (game.paused) drawPause(c);
                else drawHud(c);
                break;
            case LEVEL_UP:
                drawLevelUp(c);
                break;
            case CRATE:
                drawCrate(c);
                break;
            case SHOP:
                drawShop(c);
                break;
            case GAME_OVER:
            case VICTORY:
                drawEnd(c);
                break;
            case RANKING:
                drawRanking(c);
                break;
        }
        if (toastTime > 0f && !toast.isEmpty()) {
            float a = Math.min(1f, toastTime * 3f);
            float w = measure(toast, 26) + 48;
            fill.setColor(Color.argb((int) (220 * a), 20, 20, 20));
            rect.set(vw / 2 - w / 2, VH - 205, vw / 2 + w / 2, VH - 155);
            c.drawRoundRect(rect, 16, 16, fill);
            text(c, toast, vw / 2, VH - 171, 26, Color.argb((int) (255 * a), 255, 230, 120),
                    Paint.Align.CENTER);
        }
        c.restore();
    }

    // --- Menu ---

    private void drawMenu(Canvas c) {
        drawMenuBackground(c);
        float cx = vw / 2;
        for (int i = 0; i < CharDef.ALL.length; i++) {
            float x = cx + (i - (CharDef.ALL.length - 1) / 2f) * 88;
            float y = 112 + (float) Math.sin(time * 3 + i) * 10;
            emoji(c, CharDef.ALL[i].icon, x, y, 68, bmpPaint);
        }
        text(c, "HORTA HOSTIL", cx, 250, 92, 0xFFFFD84A, Paint.Align.CENTER);
        text(c, "Os insetos invadiram a horta. Só os legumes podem salvá-la!", cx, 298, 26,
                0xFFE8F5D0, Paint.Align.CENTER);

        String saved = prefs.savedRun();
        if (saved != null) {
            String wave = "";
            int i = saved.indexOf("wave=");
            if (i >= 0) wave = saved.substring(i + 5, saved.indexOf('\n', i));
            float mw = Math.min(300, (vw - 80) / 3), mx = cx - (mw * 3 + 40) / 2;
            button(c, mx, 335, mw, 90, "CONTINUAR", A_CONTINUE, 0, C_GREEN, true, 38);
            text(c, "depois da onda " + wave, mx + mw / 2, 446, 20, 0xFFCFE3B8, Paint.Align.CENTER);
            button(c, mx + mw + 20, 335, mw, 90, "NOVO JOGO", A_PLAY, 0, C_ORANGE, true, 38);
            button(c, mx + (mw + 20) * 2, 335, mw, 90, "🏆 RANKING", A_RANKING, 0, 0xFFB8860B, true, 38);
        } else {
            button(c, cx - 350, 335, 340, 90, "JOGAR", A_PLAY, 0, C_GREEN, true, 44);
            button(c, cx + 10, 335, 340, 90, "🏆 RANKING", A_RANKING, 0, 0xFFB8860B, true, 40);
        }

        float gap = 14, bw = Math.min(196, (vw - 60 - gap * 4) / 5), bx = cx - (bw * 5 + gap * 4) / 2;
        button(c, bx, 465, bw, 62, prefs.sound() ? "Som: SIM" : "Som: NÃO", A_SOUND, 0, C_GRAY, true, 24);
        button(c, bx + (bw + gap), 465, bw, 62, prefs.music() ? "Música: SIM" : "Música: NÃO", A_MUSIC, 0,
                C_GRAY, true, 24);
        button(c, bx + (bw + gap) * 2, 465, bw, 62, prefs.vibration() ? "Vibrar: SIM" : "Vibrar: NÃO", A_VIBRA,
                0, C_GRAY, true, 24);
        button(c, bx + (bw + gap) * 3, 465, bw, 62, "Como jogar", A_HELP, 0, C_GRAY, true, 24);
        button(c, bx + (bw + gap) * 4, 465, bw, 62, "👥 Multiplayer", A_ONLINE, 0, 0xFF2E7D9A, true, 24);

        String rec = "Melhor onda: " + prefs.bestWave() + "   •   Vitórias: " + prefs.wins()
                + "   •   Insetos derrotados: " + prefs.totalKills();
        text(c, rec, cx, 580, 24, 0xFFCFE3B8, Paint.Align.CENTER);
        int unlocked = 0;
        for (boolean b : unlockedChars()) if (b) unlocked++;
        text(c, "Personagens liberados: " + unlocked + "/" + CharDef.ALL.length, cx, 618, 22,
                0xFFB8CFA0, Paint.Align.CENTER);
        text(c, "Multiplayer e versão online: " + WEBSITE.replace("https://", ""), cx, 656, 18, 0x88CFE3B8,
                Paint.Align.CENTER);
        text(c, "Projeto escolar • feito com Java puro • v2.3", cx, 692, 20, 0x99FFFFFF,
                Paint.Align.CENTER);
        if (showHelp) drawHelp(c);
    }

    private void drawMenuBackground(Canvas c) {
        // Insetinhos passeando no fundo
        for (int i = 0; i < 9; i++) {
            float speed = 40 + (i * 37) % 60;
            float x = ((time * speed + i * 211) % (vw + 200)) - 100;
            float y = 60 + (i * 97) % 620;
            String icon = EnemyDef.SPAWNABLE[i % EnemyDef.SPAWNABLE.length].icon;
            bmpPaint.setAlpha(60);
            c.save();
            c.translate(x, y);
            c.scale(-1, 1);
            emoji(c, icon, 0, 0, 50, bmpPaint);
            c.restore();
            bmpPaint.setAlpha(255);
        }
    }

    private void drawHelp(Canvas c) {
        float w = Math.min(900, vw - 60), h = 520;
        float x = vw / 2 - w / 2, y = VH / 2 - h / 2;
        backdrop(c, A_HELP);
        panel(c, x, y, w, h);
        text(c, "COMO JOGAR", vw / 2, y + 60, 40, 0xFFFFD84A, Paint.Align.CENTER);
        String[] lines = {
                "• Arraste o dedo para andar. As armas atacam SOZINHAS.",
                "• Inimigos soltam sementes 🌱: dão experiência e dinheiro.",
                "• Elites 👑 são fortes, mas sempre deixam uma caixa 📦.",
                "• Cada caixa vira um item grátis no fim da onda.",
                "• Entre as ondas: escolha melhorias e compre na loja.",
                "• Duas armas iguais do mesmo nível viram uma mais forte.",
                "• Toque num item para ver o que ele faz.",
                "• A partida é salva na loja: dá pra continuar depois!",
        };
        for (int i = 0; i < lines.length; i++) {
            text(c, lines[i], x + 40, y + 120 + i * 44, 25, 0xFFFFFFFF, Paint.Align.LEFT);
        }
        button(c, vw / 2 - 110, y + h - 20 - 60 + 10, 220, 56, "Entendi!", A_HELP, 0, C_GREEN, true, 26);
    }

    // --- Selecao de personagem ---

    private static final String[] DIFF_DESC = {
            "Inimigos mais fracos. Bom pra aprender.",
            "O jogo como ele deve ser.",
            "Inimigos mais fortes e mais numerosos.",
            "Mais elites e muito mais dano. Boa sorte!",
    };

    private void drawCharSelect(Canvas c) {
        text(c, "ESCOLHA SEU LEGUME", vw / 2, 58, 44, 0xFFFFD84A, Paint.Align.CENTER);
        boolean[] unlocked = unlockedChars();
        int cols = 5;
        float gap = 14;
        float cw = (vw - 60 - gap * (cols - 1)) / cols;
        float ch = 252;
        int total = CharDef.ALL.length + 1; // + aleatório
        for (int i = 0; i < total; i++) {
            float x = 30 + (i % cols) * (cw + gap);
            float y = 82 + (i / cols) * (ch + gap);
            boolean random = i == CharDef.ALL.length;
            boolean sel = random ? selectedChar == RANDOM_CHAR : i == selectedChar;
            boolean open = random || unlocked[i];
            fill.setColor(sel ? 0xFF3F5A26 : open ? 0xFF2A2116 : 0xFF1E1A14);
            rect.set(x, y, x + cw, y + ch);
            c.drawRoundRect(rect, 18, 18, fill);
            stroke.setStrokeWidth(sel ? 5 : 3);
            stroke.setColor(sel ? 0xFFFFD84A : open ? C_PANEL_BORDER : 0xFF4A4038);
            c.drawRoundRect(rect, 18, 18, stroke);
            registerButton(x, y, cw, ch, random ? A_RANDOM : A_CHAR, i, true);
            float cx = x + cw / 2;
            float bob = sel ? (float) Math.sin(time * 6) * 4 : 0;
            if (random) {
                emoji(c, "🎲", cx, y + 52 + bob, 62, bmpPaint);
                text(c, "Aleatório", cx, y + 112, 21, 0xFFFFFFFF, Paint.Align.CENTER);
                wrapped(c, "Um legume liberado surpresa!", cx, y + 144, cw - 20, 17, 0xFFBFD6A6,
                        Paint.Align.CENTER);
                continue;
            }
            CharDef cd = CharDef.ALL[i];
            if (!open) {
                bmpPaint.setAlpha(70);
                emoji(c, cd.icon, cx, y + 52, 62, bmpPaint);
                bmpPaint.setAlpha(255);
                emoji(c, "🔒", cx + 26, y + 70, 32, bmpPaint);
                float ny = wrapped(c, cd.name, cx, y + 112, cw - 16, 20, 0xFF9A9A9A, Paint.Align.CENTER);
                wrapped(c, cd.unlockText(), cx, ny + 8, cw - 20, 17, 0xFFFFC870, Paint.Align.CENTER);
                continue;
            }
            emoji(c, cd.icon, cx, y + 52 + bob, 62, bmpPaint);
            if (sel) drawEyes(c, cx, y + 50 + bob, 0.8f, 1f, 0f, false);
            float ny = wrapped(c, cd.name, cx, y + 112, cw - 16, 20, 0xFFFFFFFF, Paint.Align.CENTER);
            textFit(c, "Arma: " + cd.startWeapon.name, cx, ny + 2, 16, cw - 14, 0xFFFFE08A);
            float ly = ny + 26;
            for (int m = 0; m < cd.mods.length; m += 2) {
                int v = cd.mods[m + 1];
                textFit(c, Stat.format(cd.mods[m], v), cx, ly, 16, cw - 14, v >= 0 ? 0xFF8CF08C : 0xFFFF8080);
                ly += 20;
            }
        }

        // linha de baixo: voltar, dificuldade, começar
        float by = VH - 98;
        boolean narrow = vw < 1200;
        float backW = narrow ? 150 : 190, startW = narrow ? 220 : 270;
        button(c, 30, by + 8, backW, 72, "Voltar", A_MENU, 0, C_GRAY, true, 30);
        float left = 30 + backW + 14, right = vw - 30 - startW - 14;
        float cx = (left + right) / 2;
        float half = Math.min(300, (right - left) / 2);
        button(c, cx - half, by + 8, 56, 72, "◀", A_DIFF, -1, C_GRAY, true, 30);
        button(c, cx + half - 56, by + 8, 56, 72, "▶", A_DIFF, 1, C_GRAY, true, 30);
        float pw = half - 64;
        fill.setColor(0x66000000);
        rect.set(cx - pw, by + 4, cx + pw, by + 84);
        c.drawRoundRect(rect, 16, 16, fill);
        int[] diffColor = {0xFF8CF08C, 0xFFFFFFFF, 0xFFFFA040, 0xFFFF5A5A};
        String title = Game.DIFF_ICONS[difficulty] + " " + Game.DIFF_NAMES[difficulty];
        if (prefs.bestDifficultyWon() >= difficulty) title += "  ✔";
        textFit(c, title, cx, by + 38, 28, pw * 2 - 16, diffColor[difficulty]);
        textFit(c, DIFF_DESC[difficulty], cx, by + 68, 17, pw * 2 - 16, 0xFFCFE3B8);
        boolean canStart = selectedChar == RANDOM_CHAR || unlocked[selectedChar];
        button(c, vw - 30 - startW, by + 4, startW, 80, "COMEÇAR!", A_START, 0, C_GREEN, canStart, 36);
    }

    // --- Ranking online ---

    private static int indexOfChar(CharDef cd) {
        for (int i = 0; i < CharDef.ALL.length; i++) if (CharDef.ALL[i] == cd) return i;
        return 0;
    }

    private void drawRanking(Canvas c) {
        float cx = vw / 2;
        drawMenuBackground(c);
        text(c, "🏆 RANKING ONLINE", cx, 62, 46, 0xFFFFD84A, Paint.Align.CENTER);
        float tw = Math.min(220, (vw - 80 - 36) / 4), tx = cx - (tw * 4 + 36) / 2;
        for (int i = 0; i < Game.DIFF_NAMES.length; i++) {
            boolean sel = i == rankDiff;
            button(c, tx + i * (tw + 12), 88, tw, 58, Game.DIFF_ICONS[i] + " " + Game.DIFF_NAMES[i], A_RANK_TAB, i,
                    sel ? C_GREEN : C_GRAY, true, 24);
            if (sel) {
                stroke.setColor(0xFFFFD84A);
                stroke.setStrokeWidth(4);
                rect.set(tx + i * (tw + 12), 88, tx + i * (tw + 12) + tw, 141);
                c.drawRoundRect(rect, 16, 16, stroke);
            }
        }
        float top = 168, rowH = 42, colW = Math.min(560, (vw - 90) / 2), x0 = cx - colW - 15;
        fill.setColor(0x59000000);
        rect.set(x0 - 10, top - 8, x0 - 10 + colW * 2 + 50, top + rowH * 10 + 8);
        c.drawRoundRect(rect, 16, 16, fill);
        if (rankLoading) {
            text(c, "Carregando...", cx, top + 200, 30, 0xFFE8F5D0, Paint.Align.CENTER);
        } else if (!rankError.isEmpty()) {
            textFit(c, rankError, cx, top + 200, 26, colW * 2, 0xFFFF9A8A);
        } else if (rankEntries != null && rankEntries.isEmpty()) {
            text(c, "Ninguém no ranking do " + Game.DIFF_NAMES[rankDiff] + " ainda.", cx, top + 185, 28,
                    0xFFE8F5D0, Paint.Align.CENTER);
            text(c, "Jogue e seja o primeiro!", cx, top + 225, 24, 0xFFCFE3B8, Paint.Align.CENTER);
        } else if (rankEntries != null) {
            String[] medals = {"🥇", "🥈", "🥉"};
            for (int i = 0; i < Math.min(20, rankEntries.size()); i++) {
                RankEntry e = rankEntries.get(i);
                float x = x0 + (i / 10) * (colW + 30), y = top + (i % 10) * rowH;
                boolean mine = e.id.equals(rankMyId);
                if (mine) {
                    fill.setColor(0x40FFD84A);
                    rect.set(x - 4, y, x - 4 + colW, y + rowH - 4);
                    c.drawRoundRect(rect, 10, 10, fill);
                }
                if (i < 3) emoji(c, medals[i], x + 20, y + 19, 30, bmpPaint);
                else text(c, (i + 1) + "º", x + 20, y + 28, 20, 0xFFCFE3B8, Paint.Align.CENTER);
                if (e.character >= 0 && e.character < CharDef.ALL.length) {
                    emoji(c, CharDef.ALL[e.character].icon, x + 58, y + 19, 30, bmpPaint);
                }
                String name = e.name.length() > 16 ? e.name.substring(0, 16) : e.name;
                text(c, name, x + 82, y + 28, 21, mine ? 0xFFFFD84A : 0xFFFFFFFF, Paint.Align.LEFT);
                text(c, e.won ? "🏆 Venceu" : "Onda " + e.wave, x + colW - 150, y + 28, 19,
                        e.won ? 0xFFFFD84A : 0xFFE8F5D0, Paint.Align.RIGHT);
                text(c, shortNum(e.kills) + " 🐛", x + colW - 58, y + 28, 18, 0xFFCFE3B8, Paint.Align.RIGHT);
                emoji(c, "android".equals(e.platform) ? "📱" : "💻", x + colW - 30, y + 18, 22, bmpPaint);
            }
        }
        button(c, 30, VH - 96, 200, 74, "Voltar", A_MENU, 0, C_GRAY, true, 30);
        button(c, vw - 230, VH - 96, 200, 74, "Atualizar", A_RANK_REFRESH, 0, C_GRAY, !rankLoading, 28);
        text(c, "Ordem: quem venceu, depois a onda alcançada e os insetos derrotados.", cx, VH - 50, 18,
                0x99FFFFFF, Paint.Align.CENTER);
    }

    // --- Caixa ---

    private void drawCrate(Canvas c) {
        Player p = game.player;
        ItemDef it = game.crateItem;
        float statsW = vw < 1200 ? 250 : 300;
        float areaW = vw - statsW - 48;
        float cx = 24 + areaW / 2;
        float tw = measure("CAIXA ENCONTRADA!", 46);
        emoji(c, "📦", cx - tw / 2 - 12, 66, 60, bmpPaint);
        text(c, "CAIXA ENCONTRADA!", cx + 28, 82, 46, 0xFFFFD84A, Paint.Align.CENTER);
        if (p.crates > 1) {
            text(c, "Mais " + (p.crates - 1) + (p.crates == 2 ? " caixa" : " caixas") + " depois desta",
                    cx, 124, 22, 0xFFE8F5D0, Paint.Align.CENTER);
        }
        if (it != null) {
            float w = Math.min(420, areaW - 40), h = 360;
            float x = cx - w / 2, y = 150;
            card(c, x, y, w, h, it.tier);
            emoji(c, it.icon, cx, y + 80, 110, bmpPaint);
            text(c, it.name, cx, y + 178, 34, TIER_COLOR[it.tier], Paint.Align.CENTER);
            text(c, "Item • Raridade " + WeaponDef.TIER_NAMES[it.tier], cx, y + 208, 18, 0xFFB0B0B0,
                    Paint.Align.CENTER);
            float ly = y + 248;
            for (int m = 0; m < it.mods.length; m += 2) {
                int v = it.mods[m + 1];
                text(c, Stat.format(it.mods[m], v), cx, ly, 22, v >= 0 ? 0xFF8CF08C : 0xFFFF8080,
                        Paint.Align.CENTER);
                ly += 28;
            }
            if (it.special != ItemDef.SP_NONE) {
                wrapped(c, it.specialText, cx, ly, w - 30, 20, 0xFFFFE08A, Paint.Align.CENTER);
            }
            float bw = Math.min(260, (areaW - 60) / 2);
            button(c, cx - bw - 10, VH - 120, bw, 84, "Pegar", A_CRATE_TAKE, 0, C_GREEN, true, 36);
            buttonSeed(c, cx + 10, VH - 120, bw, 84, game.crateRecyclePrice(), A_CRATE_RECYCLE, 0,
                    C_ORANGE, true, "Reciclar +");
        }
        drawStatsPanel(c, vw - statsW - 16, 16, statsW, VH - 32);
    }

    // --- Mundo ---

    private void buildArena() {
        int w = (int) Game.WORLD_W, h = (int) Game.WORLD_H;
        arena = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
        Canvas c = new Canvas(arena);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        int tile = 100;
        for (int ty = 0; ty < h; ty += tile) {
            for (int tx = 0; tx < w; tx += tile) {
                boolean odd = ((tx + ty) / tile) % 2 == 0;
                p.setColor(odd ? 0xFF5E8A3A : 0xFF577F36);
                c.drawRect(tx, ty, tx + tile, ty + tile, p);
            }
        }
        Random r = new Random(42);
        // tufos de grama, pedrinhas e flores
        for (int i = 0; i < 260; i++) {
            float x = r.nextFloat() * w, y = r.nextFloat() * h;
            int kind = r.nextInt(10);
            if (kind < 6) {
                p.setColor(0xFF4A7030);
                p.setStrokeWidth(3);
                c.drawLine(x, y, x - 4, y - 10, p);
                c.drawLine(x, y, x, y - 13, p);
                c.drawLine(x, y, x + 4, y - 10, p);
            } else if (kind < 8) {
                p.setColor(0xFF7D7A6A);
                c.drawCircle(x, y, 4 + r.nextFloat() * 4, p);
            } else {
                int[] colors = {0xFFFFE066, 0xFFFF8FB1, 0xFFFFFFFF, 0xFFB38BFF};
                p.setColor(colors[r.nextInt(colors.length)]);
                for (int k = 0; k < 5; k++) {
                    double a = k * Math.PI * 2 / 5;
                    c.drawCircle(x + (float) Math.cos(a) * 5, y + (float) Math.sin(a) * 5, 4, p);
                }
                p.setColor(0xFFFFB02E);
                c.drawCircle(x, y, 3.5f, p);
            }
        }
    }

    private void drawWorld(Canvas c) {
        if (arena == null) buildArena();
        Player p = game.player;
        float margin = 70;
        float camX, camY;
        if (Game.WORLD_W + margin * 2 <= vw) camX = (Game.WORLD_W - vw) / 2;
        else camX = clamp(p.x - vw / 2, -margin, Game.WORLD_W - vw + margin);
        camY = clamp(p.y - VH / 2, -margin, Game.WORLD_H - VH + margin);
        if (game.shake > 0 && !game.paused) {
            camX += (rng.nextFloat() - 0.5f) * game.shake;
            camY += (rng.nextFloat() - 0.5f) * game.shake;
        }
        c.drawColor(0xFF22301A);
        c.save();
        c.translate(-camX, -camY);
        c.drawBitmap(arena, 0, 0, bmpPaint);

        // cerca
        stroke.setColor(0xFF6B4A26);
        stroke.setStrokeWidth(16);
        c.drawRect(-8, -8, Game.WORLD_W + 8, Game.WORLD_H + 8, stroke);
        stroke.setColor(0xFF8A6234);
        stroke.setStrokeWidth(6);
        c.drawRect(-8, -8, Game.WORLD_W + 8, Game.WORLD_H + 8, stroke);

        // avisos de nascimento
        for (Telegraph t : game.telegraphs) {
            float pulse = (float) Math.abs(Math.sin(t.time * 12));
            float s = t.def.boss ? 42 : 14;
            stroke.setColor(Color.argb((int) (120 + 135 * pulse), 255, 50, 40));
            stroke.setStrokeWidth(t.def.boss ? 10 : 5);
            c.drawLine(t.x - s, t.y - s, t.x + s, t.y + s, stroke);
            c.drawLine(t.x - s, t.y + s, t.x + s, t.y - s, stroke);
        }

        // coletaveis
        for (Pickup pk : game.pickups) {
            float bob = (float) Math.sin(pk.bob * 5) * 3;
            if (pk.type == Pickup.MATERIAL) {
                float r = pk.value > 1 ? 10 : 7;
                fill.setColor(0x40000000);
                c.drawCircle(pk.x, pk.y + 6, r, fill);
                fill.setColor(C_SEED);
                c.drawCircle(pk.x, pk.y + bob, r, fill);
                fill.setColor(0xFFD6FFB0);
                c.drawCircle(pk.x - r * 0.3f, pk.y + bob - r * 0.3f, r * 0.4f, fill);
            } else if (pk.type == Pickup.CRATE) {
                fill.setColor(0x40000000);
                rect.set(pk.x - 18, pk.y + 12, pk.x + 18, pk.y + 22);
                c.drawOval(rect, fill);
                fill.setColor(0x55FFD84A);
                c.drawCircle(pk.x, pk.y + bob, 26 + (float) Math.sin(time * 6) * 3, fill);
                emoji(c, "📦", pk.x, pk.y + bob, 40, bmpPaint);
            } else {
                emoji(c, "🍎", pk.x, pk.y + bob, 34, bmpPaint);
            }
        }

        // sombras
        fill.setColor(0x38000000);
        for (Enemy e : game.enemies) {
            rect.set(e.x - e.radius * 0.9f, e.y + e.radius * 0.55f, e.x + e.radius * 0.9f,
                    e.y + e.radius * 1.0f);
            c.drawOval(rect, fill);
        }
        rect.set(p.x - 24, p.y + 16, p.x + 24, p.y + 30);
        c.drawOval(rect, fill);

        // inimigos
        for (Enemy e : game.enemies) if (!e.dead) drawEnemy(c, e);

        // jogador e armas
        drawPlayer(c, p);
        for (Weapon w : p.weapons) drawWeapon(c, w);

        // projeteis
        for (Bullet b : game.bullets) {
            if (b.lightning) {
                stroke.setColor(0xFFFFE14A);
                stroke.setStrokeWidth(7);
                c.drawLine(b.x - b.vx * 0.03f, b.y - b.vy * 0.03f, b.x, b.y, stroke);
                stroke.setColor(0xFFFFFFFF);
                stroke.setStrokeWidth(3);
                c.drawLine(b.x - b.vx * 0.03f, b.y - b.vy * 0.03f, b.x, b.y, stroke);
            } else if (b.slow > 0) {
                fill.setColor(0x6680D8FF);
                c.drawCircle(b.x, b.y, b.radius * 1.7f, fill);
                fill.setColor(0xFFE6FAFF);
                c.drawCircle(b.x, b.y, b.radius, fill);
            } else if (b.burn > 0) {
                fill.setColor(0x66FF6A00);
                c.drawCircle(b.x, b.y, b.radius * 1.7f, fill);
                fill.setColor(0xFFFFB040);
                c.drawCircle(b.x, b.y, b.radius, fill);
            } else {
                fill.setColor(0xFF1A1A1A);
                c.drawCircle(b.x, b.y, b.radius + 2, fill);
                fill.setColor(b.explosion > 0 ? 0xFFFF7A2A : 0xFFFFF3C4);
                c.drawCircle(b.x, b.y, b.radius, fill);
            }
        }
        for (Bullet b : game.enemyBullets) {
            fill.setColor(0xFF3A0A4A);
            c.drawCircle(b.x, b.y, b.radius + 3, fill);
            fill.setColor(b.color);
            c.drawCircle(b.x, b.y, b.radius, fill);
            fill.setColor(0xFFF5D6FF);
            c.drawCircle(b.x, b.y, b.radius * 0.4f, fill);
        }

        // particulas
        for (Particle pt : game.particles) {
            int a = (int) (255 * pt.alpha());
            if (pt.ring) {
                stroke.setColor((pt.color & 0x00FFFFFF) | (a << 24));
                stroke.setStrokeWidth(8 * pt.alpha() + 2);
                c.drawCircle(pt.x, pt.y, pt.size * (1.1f - pt.alpha() * 0.6f), stroke);
            } else {
                fill.setColor((pt.color & 0x00FFFFFF) | (a << 24));
                c.drawCircle(pt.x, pt.y, pt.size * (0.4f + 0.6f * pt.alpha()), fill);
            }
        }

        // numeros de dano
        for (FloatText t : game.texts) {
            float a = Math.min(1f, t.life / t.maxLife * 2f);
            int color = (t.color & 0x00FFFFFF) | ((int) (255 * a) << 24);
            text(c, t.text, t.x, t.y, t.size, color, Paint.Align.CENTER);
        }
        c.restore();
    }

    private void drawEnemy(Canvas c, Enemy e) {
        float size = e.radius * 2.5f;
        float squash = (float) Math.sin(e.anim * 10) * 0.06f;
        Paint pnt = bmpPaint;
        float ox = 0;
        if (e.flash > 0) pnt = flashPaint;
        else if ((e.def.ai == EnemyDef.AI_CHARGE && e.aiState == 1)
                || (e.def.ai == EnemyDef.AI_BOSS_ANT && e.aiState == 2)) {
            pnt = chargePaint;
            ox = (rng.nextFloat() - 0.5f) * 6;
        } else if (e.slowTime > 0) pnt = slowPaint;
        else if (e.burnTime > 0) pnt = burnPaint;
        else if (e.elite) pnt = elitePaint;
        if (e.elite) {
            fill.setColor(0x55FFC400);
            c.drawCircle(e.x, e.y, e.radius * 1.25f + (float) Math.sin(time * 8) * 3, fill);
        }
        c.save();
        c.translate(e.x + ox, e.y);
        if (!e.facingLeft) c.scale(-1, 1);
        c.scale(1 + squash, 1 - squash);
        emoji(c, e.def.icon, 0, 0, size, pnt);
        c.restore();
        if (e.elite) emoji(c, "👑", e.x, e.y - e.radius * 1.2f, 30, bmpPaint);
        if (!e.def.boss && e.hp < e.maxHp) {
            float w = e.radius * 1.6f;
            float y = e.y - e.radius * (e.elite ? 1.6f : 1.25f);
            fill.setColor(0xAA000000);
            c.drawRect(e.x - w / 2 - 1, y - 1, e.x + w / 2 + 1, y + 5, fill);
            fill.setColor(e.elite ? 0xFFFFC400 : 0xFFFF5040);
            c.drawRect(e.x - w / 2, y, e.x - w / 2 + w * Math.max(0, e.hp / e.maxHp), y + 4, fill);
        }
    }

    private void drawPlayer(Canvas c, Player p) {
        if (p.iframes > 0 && game.waveTime > 1f && ((int) (p.iframes * 20)) % 2 == 0) return;
        float bob = p.moving ? (float) Math.sin(p.moveAnim) * 0.07f : (float) Math.sin(time * 3) * 0.03f;
        c.save();
        c.translate(p.x, p.y);
        c.scale(1 - bob * 0.5f, 1 + bob);
        c.save();
        if (!p.facingLeft) c.scale(-1, 1);
        emoji(c, p.character.icon, 0, 0, 68, bmpPaint);
        c.restore();
        drawEyes(c, 0, -4, 1f, p.lookX, p.lookY, true);
        c.restore();
    }

    /** Olhinhos esbugalhados (tipo Brotato!). */
    private void drawEyes(Canvas c, float x, float y, float s, float lx, float ly, boolean outline) {
        float r = 8 * s;
        float ex = 10 * s;
        float len = (float) Math.sqrt(lx * lx + ly * ly);
        if (len > 0.01f) {
            lx /= len;
            ly /= len;
        }
        for (int i = -1; i <= 1; i += 2) {
            float cx = x + i * ex;
            fill.setColor(0xFF000000);
            c.drawCircle(cx, y, r + 2 * s, fill);
            fill.setColor(0xFFFFFFFF);
            c.drawCircle(cx, y, r, fill);
            fill.setColor(0xFF111111);
            c.drawCircle(cx + lx * r * 0.4f, y + ly * r * 0.4f, r * 0.48f, fill);
        }
    }

    private void drawWeapon(Canvas c, Weapon w) {
        WeaponDef d = w.def;
        float ang = w.attacking() ? (float) Math.atan2(w.dirY, w.dirX) : w.angle;
        c.save();
        c.translate(w.tipX, w.tipY);
        c.rotate((float) Math.toDegrees(ang));
        if (Math.cos(ang) < 0) c.scale(1, -1);
        int tierColor = TIER_COLOR[w.tier];
        stroke.setStrokeWidth(3);
        stroke.setColor(0xFF1A1A1A);
        switch (d.shape) {
            case WeaponDef.SHAPE_FIST:
                fill.setColor(d.color);
                c.drawCircle(4, 0, 11, fill);
                c.drawCircle(4, 0, 11, stroke);
                fill.setColor(tierColor);
                c.drawCircle(-6, 0, 4, fill);
                break;
            case WeaponDef.SHAPE_BLADE: {
                float len = d == WeaponDef.LANCA ? 46 : d == WeaponDef.ESPADA ? 38 : 26;
                fill.setColor(0xFF6B4423);
                rect.set(-12, -3.5f, 2, 3.5f);
                c.drawRoundRect(rect, 2, 2, fill);
                fill.setColor(tierColor);
                rect.set(0, -6, 4, 6);
                c.drawRect(rect, fill);
                fill.setColor(d.color);
                android.graphics.Path path = new android.graphics.Path();
                path.moveTo(4, -4);
                path.lineTo(4 + len - 8, -4);
                path.lineTo(4 + len, 0);
                path.lineTo(4 + len - 8, 4);
                path.lineTo(4, 4);
                path.close();
                c.drawPath(path, fill);
                c.drawPath(path, stroke);
                break;
            }
            case WeaponDef.SHAPE_GUN:
                fill.setColor(0xFF3A2A1A);
                rect.set(-6, 0, 2, 12);
                c.drawRoundRect(rect, 2, 2, fill);
                fill.setColor(d.color);
                rect.set(-8, -6, 20, 4);
                c.drawRoundRect(rect, 3, 3, fill);
                c.drawRoundRect(rect, 3, 3, stroke);
                fill.setColor(tierColor);
                c.drawCircle(0, -1, 3, fill);
                break;
            case WeaponDef.SHAPE_STAFF:
                stroke.setColor(0xFF6B4423);
                stroke.setStrokeWidth(5);
                c.drawLine(-16, 0, 14, 0, stroke);
                fill.setColor(0x66000000 | (d.color & 0x00FFFFFF));
                c.drawCircle(18, 0, 11 + (float) Math.sin(time * 8) * 2, fill);
                fill.setColor(d.color);
                c.drawCircle(18, 0, 7, fill);
                fill.setColor(tierColor);
                c.drawCircle(-12, 0, 3, fill);
                break;
            case WeaponDef.SHAPE_BOW:
                stroke.setColor(d.color);
                stroke.setStrokeWidth(5);
                rect.set(-10, -18, 10, 18);
                c.drawArc(rect, -90, 180, false, stroke);
                stroke.setColor(0xFFEEEEEE);
                stroke.setStrokeWidth(1.5f);
                c.drawLine(0, -18, 0, 18, stroke);
                stroke.setColor(0xFF6B4423);
                stroke.setStrokeWidth(3);
                c.drawLine(-4, 0, 16, 0, stroke);
                fill.setColor(tierColor);
                c.drawCircle(10, 0, 3, fill);
                break;
            case WeaponDef.SHAPE_HAMMER:
                fill.setColor(0xFF6B4423);
                rect.set(-14, -3.5f, 16, 3.5f);
                c.drawRoundRect(rect, 2, 2, fill);
                fill.setColor(d.color);
                rect.set(12, -14, 30, 14);
                c.drawRoundRect(rect, 4, 4, fill);
                c.drawRoundRect(rect, 4, 4, stroke);
                fill.setColor(tierColor);
                c.drawCircle(-10, 0, 3.5f, fill);
                break;
            default: // TUBE
                fill.setColor(d.color);
                rect.set(-12, -8, 24, 7);
                c.drawRoundRect(rect, 4, 4, fill);
                c.drawRoundRect(rect, 4, 4, stroke);
                fill.setColor(0xFF222222);
                rect.set(20, -9, 27, 8);
                c.drawRoundRect(rect, 2, 2, fill);
                fill.setColor(tierColor);
                c.drawCircle(-4, 0, 3.5f, fill);
                break;
        }
        c.restore();
    }

    // --- HUD ---

    private void drawHud(Canvas c) {
        Player p = game.player;
        // aviso de vida baixa: bordas vermelhas pulsando
        float frac = p.hp / p.maxHp();
        if (frac < 0.3f && !game.ending) {
            float pulse = 0.55f + 0.45f * (float) Math.sin(time * 7);
            int a = (int) (150 * pulse * (1f - frac / 0.3f * 0.5f));
            vignettePaint.setShader(new android.graphics.RadialGradient(vw / 2, VH / 2, vw * 0.62f,
                    new int[]{0x00FF0000, 0x00FF0000, Color.argb(a, 200, 0, 0)},
                    new float[]{0f, 0.6f, 1f}, android.graphics.Shader.TileMode.CLAMP));
            c.drawRect(0, 0, vw, VH, vignettePaint);
        }
        // vida
        bar(c, 18, 16, 320, 34, p.hp / p.maxHp(), 0xFFE0413A, 0xFF3A1210);
        text(c, Math.max(0, (int) Math.ceil(p.hp)) + " / " + p.maxHp(), 178, 42, 24, 0xFFFFFFFF,
                Paint.Align.CENTER);
        // experiencia
        bar(c, 18, 56, 320, 22, p.xp / (float) p.xpToNext(), 0xFF5FD35F, 0xFF12301A);
        text(c, "NV " + p.level, 178, 74, 18, 0xFFFFFFFF, Paint.Align.CENTER);
        // sementes
        seedIcon(c, 34, 104, 12);
        text(c, String.valueOf(p.materials), 56, 115, 32, 0xFFFFFFFF, Paint.Align.LEFT);
        if (p.crates > 0) {
            emoji(c, "📦", 34, 148, 30, bmpPaint);
            text(c, "x" + p.crates, 56, 158, 26, 0xFFFFD84A, Paint.Align.LEFT);
        }

        // onda e tempo
        text(c, "ONDA " + game.wave + (game.difficulty != 1 ? "  •  " + Game.DIFF_NAMES[game.difficulty] : ""),
                vw / 2, 40, 28, 0xFFFFFFFF, Paint.Align.CENTER);
        int left = game.ending ? 0 : (int) Math.ceil(Math.max(0, game.waveDuration - game.waveTime));
        text(c, String.valueOf(left), vw / 2, 96, 56, left <= 5 ? 0xFFFF6A5A : 0xFFFFFFFF,
                Paint.Align.CENTER);

        // pausa
        float bx = vw - 86;
        button(c, bx, 16, 68, 68, "II", A_PAUSE, 0, 0xAA333333, true, 30);

        // chefao
        Enemy boss = game.boss;
        if (boss != null && !boss.dead) {
            float w = Math.min(700, vw * 0.55f);
            bar(c, vw / 2 - w / 2, VH - 52, w, 26, boss.hp / boss.maxHp, 0xFFB03AFF, 0xFF26102E);
            text(c, boss.def.name, vw / 2, VH - 62, 24, 0xFFFFFFFF, Paint.Align.CENTER);
        }

        // faixa de aviso
        if (game.bannerTime > 0) {
            float a = Math.min(1f, game.bannerTime * 2f);
            float s = 1f + Math.max(0, game.bannerTime - 1.8f) * 1.5f;
            text(c, game.banner, vw / 2, VH * 0.36f, 58 * s,
                    Color.argb((int) (255 * a), 255, 216, 74), Paint.Align.CENTER);
        }

        // joystick
        if (joyId >= 0 && !game.paused) {
            fill.setColor(0x33FFFFFF);
            c.drawCircle(joyOx, joyOy, JOY_RADIUS, fill);
            stroke.setColor(0x66FFFFFF);
            stroke.setStrokeWidth(3);
            c.drawCircle(joyOx, joyOy, JOY_RADIUS, stroke);
            fill.setColor(0x99FFFFFF);
            c.drawCircle(joyOx + clampJoy(joyX - joyOx), joyOy + clampJoy(joyY - joyOy), 32, fill);
        } else if (game.wave == 1 && game.waveTime < 5f && !game.paused) {
            text(c, "Arraste o dedo para andar", vw / 2, VH - 110, 30, 0xCCFFFFFF, Paint.Align.CENTER);
        }
    }

    private void drawPause(Canvas c) {
        fill.setColor(0xB0000000);
        c.drawRect(0, 0, vw, VH, fill);
        registerButton(0, 0, vw, VH, A_RESUME, -1, false);
        float statsW = 300;
        text(c, "PAUSADO", (vw - statsW) / 2, 120, 64, 0xFFFFD84A, Paint.Align.CENTER);
        float cx = (vw - statsW) / 2;
        button(c, cx - 170, 180, 340, 84, "Continuar", A_RESUME, 0, C_GREEN, true, 36);
        button(c, cx - 170, 285, 340, 70, "Desistir", A_QUIT, 0, C_RED, true, 30);
        drawWeaponRow(c, 40, 420, cx * 2 - 80, false);
        drawItemsGrid(c, 40, 590, cx * 2 - 80, 110);
        if (popupWeapon < 0 && tipItem >= 0 && tipTime > 0) drawTooltip(c);
        drawStatsPanel(c, vw - statsW - 16, 16, statsW, VH - 32);
    }

    // --- Level up ---

    private void drawLevelUp(Canvas c) {
        Player p = game.player;
        float statsW = 300;
        float areaW = vw - statsW - 48;
        text(c, "SUBIU DE NÍVEL!", 24 + areaW / 2, 70, 52, 0xFF7CFF6B, Paint.Align.CENTER);
        String sub = "Nível " + (p.level - game.levelsPending + 1) + " • escolha uma melhoria";
        if (game.levelsPending > 1) sub += " (+" + (game.levelsPending - 1) + " depois)";
        text(c, sub, 24 + areaW / 2, 112, 24, 0xFFE8F5D0, Paint.Align.CENTER);
        float gap = 16;
        float cw = (areaW - gap * 3) / 4;
        float ch = 330;
        for (int i = 0; i < 4; i++) {
            int stat = game.levelChoices[i][0];
            int amount = game.levelChoices[i][1];
            int tier = game.levelChoices[i][2];
            float x = 24 + i * (cw + gap), y = 150;
            card(c, x, y, cw, ch, tier);
            registerButton(x, y, cw, ch, A_LEVEL, i, true);
            emoji(c, Stat.ICONS[stat], x + cw / 2, y + 90, 90, bmpPaint);
            text(c, (amount >= 0 ? "+" : "") + amount + (Stat.PERCENT[stat] ? "%" : ""),
                    x + cw / 2, y + 200, 50, TIER_COLOR[tier], Paint.Align.CENTER);
            wrapped(c, Stat.NAMES[stat], x + cw / 2, y + 250, cw - 20, 26, 0xFFFFFFFF,
                    Paint.Align.CENTER);
            text(c, "Atual: " + p.stats[stat], x + cw / 2, y + ch - 20, 20, 0xFFB0B0B0,
                    Paint.Align.CENTER);
        }
        int cost = game.levelRerollCost();
        seedCounter(c, 24, VH - 70, p.materials);
        buttonSeed(c, 24 + areaW / 2 - 150, VH - 110, 300, 76, cost, A_LEVEL_REROLL, 0,
                C_ORANGE, p.materials >= cost, "Rolar ");
        drawStatsPanel(c, vw - statsW - 16, 16, statsW, VH - 32);
    }

    // --- Loja ---

    private void drawShop(Canvas c) {
        Player p = game.player;
        boolean narrow = vw < 1200;
        float statsW = narrow ? 250 : 300;
        float areaW = vw - statsW - 48;
        text(c, "LOJA", 24, 58, 46, 0xFFFFD84A, Paint.Align.LEFT);
        String sub = "Onda " + game.wave + " concluída!";
        if (game.lastHarvest > 0 && !narrow) sub += "  Colheita: +" + game.lastHarvest;
        text(c, sub, 150, 56, 24, 0xFFE8F5D0, Paint.Align.LEFT);
        seedCounter(c, 24 + areaW - 140, 30, p.materials);

        float gap = 14;
        float cw = (areaW - gap * 3) / 4;
        float ch = 330;
        float y = 78;
        for (int i = 0; i < Shop.SLOTS; i++) {
            float x = 24 + i * (cw + gap);
            Shop.Offer o = game.offers[i];
            if (o == null) {
                fill.setColor(0x33000000);
                rect.set(x, y, x + cw, y + ch);
                c.drawRoundRect(rect, 16, 16, fill);
                text(c, "Vendido!", x + cw / 2, y + ch / 2, 26, 0x88FFFFFF, Paint.Align.CENTER);
                continue;
            }
            int tier = o.weapon != null ? o.tier : o.item.tier;
            card(c, x, y, cw, ch, tier);
            emoji(c, o.icon(), x + 46, y + 48, 62, bmpPaint);
            if (!narrow) {
                text(c, o.weapon != null ? "ARMA" : "ITEM", x + 86, y + 42, 18, 0xFFB0B0B0,
                        Paint.Align.LEFT);
            }
            if (o.weapon != null && !narrow) {
                text(c, o.weapon.typeName(), x + 86, y + 64, 16, 0xFFB0B0B0, Paint.Align.LEFT);
            }
            float ly = wrapped(c, o.name(), x + 14, y + 112, cw - 28, 23, TIER_COLOR[tier],
                    Paint.Align.LEFT) + 6;
            if (o.weapon != null) {
                Weapon preview = new Weapon(o.weapon, o.tier);
                weaponStats(c, preview, x + 14, ly, cw - 28, !narrow);
            } else {
                for (int m = 0; m < o.item.mods.length; m += 2) {
                    int v = o.item.mods[m + 1];
                    text(c, Stat.format(o.item.mods[m], v), x + 14, ly, narrow ? 16 : 19,
                            v >= 0 ? 0xFF8CF08C : 0xFFFF8080, Paint.Align.LEFT);
                    ly += 24;
                }
                if (o.item.special != ItemDef.SP_NONE) {
                    wrapped(c, o.item.specialText, x + 14, ly, cw - 28, narrow ? 15 : 17, 0xFFFFE08A,
                            Paint.Align.LEFT);
                }
            }
            // cadeado
            float lx = x + cw - 50, lyy = y + 8;
            fill.setColor(o.locked ? 0xFFB88A2A : 0x44000000);
            rect.set(lx, lyy, lx + 42, lyy + 42);
            c.drawRoundRect(rect, 10, 10, fill);
            emoji(c, o.locked ? "🔒" : "🔓", lx + 21, lyy + 21, 28, bmpPaint);
            registerButton(lx - 6, lyy - 6, 54, 54, A_LOCK, i, true);

            int check = game.checkBuy(i);
            int color = check == Game.BUY_OK ? C_GREEN : C_GRAY;
            float bw = cw - 24;
            buttonSeed(c, x + 12, y + ch - 64, bw, 52, o.price, A_BUY, i, color, check == Game.BUY_OK);
        }

        // armas e itens
        drawWeaponRow(c, 24, 440, areaW, true);
        drawItemsGrid(c, 24, 592, areaW, VH - 592 - 8);

        // botoes da direita
        float sx = vw - statsW - 16;
        drawStatsPanel(c, sx, 16, statsW, VH - 32 - 170);
        int cost = game.shopRerollCost();
        buttonSeed(c, sx, VH - 172, statsW, 66, cost, A_REROLL, 0, C_ORANGE, p.materials >= cost,
                "Rolar ");
        button(c, sx, VH - 96, statsW, 80, "Próxima onda ▶", A_NEXT, 0, C_GREEN, true, 30);

        if (popupWeapon < 0 && tipItem >= 0 && tipTime > 0) drawTooltip(c);
        if (popupWeapon >= 0 && popupWeapon < p.weapons.size()) drawWeaponPopup(c);
    }

    private float weaponStats(Canvas c, Weapon w, float x, float y, float maxW, boolean full) {
        Player p = game.player;
        int dmg = Math.round(w.baseDamage(p));
        String dmgText = "Dano: " + dmg;
        if (w.def.pellets > 1) dmgText += " x" + w.def.pellets;
        if (w.burnDamage(p) > 0) dmgText += " +" + w.burnDamage(p) + " fogo";
        text(c, dmgText, x, y, full ? 19 : 16, 0xFFFFFFFF, Paint.Align.LEFT);
        y += 24;
        if (!full) {
            text(c, String.format(java.util.Locale.US, "Recarga %.2fs", w.cooldown(p)), x, y, 16,
                    0xFFE0E0E0, Paint.Align.LEFT);
            y += 22;
            text(c, "Alcance " + Math.round(w.range(p)), x, y, 16, 0xFFE0E0E0, Paint.Align.LEFT);
            return y + 22;
        }
        text(c, String.format(java.util.Locale.US, "Recarga %.2fs • Alc. %d", w.cooldown(p),
                Math.round(w.range(p))), x, y, 17, 0xFFE0E0E0, Paint.Align.LEFT);
        y += 24;
        return wrapped(c, w.def.desc, x, y, maxW, 18, 0xFFFFE08A, Paint.Align.LEFT);
    }

    private void drawWeaponRow(Canvas c, float x, float y, float w, boolean clickable) {
        Player p = game.player;
        text(c, "Armas (" + p.weapons.size() + "/" + Player.MAX_WEAPONS + ")", x, y - 10, 22,
                0xFFFFFFFF, Paint.Align.LEFT);
        float s = Math.min(92, (w - 5 * 10) / 6);
        for (int i = 0; i < Player.MAX_WEAPONS; i++) {
            float sx = x + i * (s + 10);
            if (i < p.weapons.size()) {
                Weapon wp = p.weapons.get(i);
                card(c, sx, y, s, s, wp.tier);
                emoji(c, wp.def.icon, sx + s / 2, y + s / 2 - 6, s * 0.55f, bmpPaint);
                text(c, WeaponDef.TIER_NAMES[wp.tier], sx + s / 2, y + s - 8, 18, TIER_COLOR[wp.tier],
                        Paint.Align.CENTER);
                if (wp.waveDamage > 0) {
                    text(c, shortNum(wp.waveDamage), sx + s / 2, y + s + 22, 17, 0xFFFFB0A0,
                            Paint.Align.CENTER);
                }
                if (clickable) {
                    registerButton(sx, y, s, s, A_WEAPON, i, true);
                    if (game.canCombine(i)) {
                        fill.setColor(0xFFFFD84A);
                        c.drawCircle(sx + s - 8, y + 8, 9, fill);
                        text(c, "+", sx + s - 8, y + 15, 20, 0xFF000000, Paint.Align.CENTER);
                    }
                }
            } else {
                fill.setColor(0x33000000);
                rect.set(sx, y, sx + s, y + s);
                c.drawRoundRect(rect, 12, 12, fill);
            }
        }
        if (clickable && w > 1000) {
            text(c, "(toque numa arma para vender ou combinar • número = dano na última onda)", x + 190,
                    y - 10, 16, 0x99FFFFFF, Paint.Align.LEFT);
        }
    }

    private void drawItemsGrid(Canvas c, float x, float y, float w, float h) {
        Player p = game.player;
        text(c, "Itens (" + p.items.size() + ")", x, y - 10, 22, 0xFFFFFFFF, Paint.Align.LEFT);
        LinkedHashMap<ItemDef, Integer> counts = new LinkedHashMap<>();
        for (ItemDef it : p.items) {
            Integer n = counts.get(it);
            counts.put(it, n == null ? 1 : n + 1);
        }
        float s = 50;
        tipX = x;
        tipY = y;
        int perRow = Math.max(1, (int) ((w + 6) / (s + 6)));
        int rows = Math.max(1, (int) ((h + 6) / (s + 6)));
        int i = 0;
        for (Map.Entry<ItemDef, Integer> e : counts.entrySet()) {
            if (i >= perRow * rows) break;
            float ix = x + (i % perRow) * (s + 6);
            float iy = y + (i / perRow) * (s + 6);
            card(c, ix, iy, s, s, e.getKey().tier);
            emoji(c, e.getKey().icon, ix + s / 2, iy + s / 2, s * 0.7f, bmpPaint);
            if (e.getValue() > 1) {
                text(c, "x" + e.getValue(), ix + s - 3, iy + s - 3, 16, 0xFFFFFFFF, Paint.Align.RIGHT);
            }
            int idx = indexOfItem(e.getKey());
            registerButton(ix, iy, s, s, A_ITEM, idx, true);
            if (idx == tipItem && tipTime > 0) {
                tipX = ix;
                tipY = iy;
                stroke.setColor(0xFFFFFFFF);
                stroke.setStrokeWidth(3);
                rect.set(ix, iy, ix + s, iy + s);
                c.drawRoundRect(rect, 14, 14, stroke);
            }
            i++;
        }
    }

    private float tipX, tipY;

    private static int indexOfItem(ItemDef it) {
        for (int i = 0; i < ItemDef.ALL.length; i++) if (ItemDef.ALL[i] == it) return i;
        return -1;
    }

    private static String shortNum(int v) {
        if (v >= 10000) return (v / 1000) + "k";
        if (v >= 1000) return String.format(java.util.Locale.US, "%.1fk", v / 1000f);
        return String.valueOf(v);
    }

    /** Caixinha com o que o item faz (aparece ao tocar no item). */
    private void drawTooltip(Canvas c) {
        ItemDef it = ItemDef.ALL[tipItem];
        ArrayList<String> lines = new ArrayList<>();
        ArrayList<Integer> colors = new ArrayList<>();
        lines.add(it.name);
        colors.add(TIER_COLOR[it.tier]);
        for (int m = 0; m < it.mods.length; m += 2) {
            lines.add(Stat.format(it.mods[m], it.mods[m + 1]));
            colors.add(it.mods[m + 1] >= 0 ? 0xFF8CF08C : 0xFFFF8080);
        }
        if (it.special != ItemDef.SP_NONE) {
            lines.add(it.specialText);
            colors.add(0xFFFFE08A);
        }
        float w = 0;
        for (String l : lines) w = Math.max(w, measure(l, 20));
        w += 28;
        float h = lines.size() * 27 + 16;
        float x = Math.min(tipX, vw - w - 10);
        float y = tipY - h - 10;
        if (y < 10) y = tipY + 60;
        fill.setColor(0xF0121212);
        rect.set(x, y, x + w, y + h);
        c.drawRoundRect(rect, 12, 12, fill);
        stroke.setColor(TIER_COLOR[it.tier]);
        stroke.setStrokeWidth(2);
        c.drawRoundRect(rect, 12, 12, stroke);
        for (int i = 0; i < lines.size(); i++) {
            text(c, lines.get(i), x + 14, y + 32 + i * 27, 20, colors.get(i), Paint.Align.LEFT);
        }
    }

    private void drawWeaponPopup(Canvas c) {
        Player p = game.player;
        Weapon w = p.weapons.get(popupWeapon);
        backdrop(c, A_CLOSE);
        float pw = 520, ph = 400;
        float x = vw / 2 - pw / 2, y = VH / 2 - ph / 2;
        panel(c, x, y, pw, ph);
        emoji(c, w.def.icon, x + 70, y + 70, 80, bmpPaint);
        text(c, w.title(), x + 130, y + 66, 34, TIER_COLOR[w.tier], Paint.Align.LEFT);
        text(c, w.def.typeName(), x + 130, y + 98, 20, 0xFFB0B0B0, Paint.Align.LEFT);
        float ly = weaponStats(c, w, x + 30, y + 150, pw - 60, true);
        text(c, "Dano na última onda: " + w.waveDamage + "   •   Total: " + w.totalDamage, x + 30, ly + 4,
                18, 0xFFFFB0A0, Paint.Align.LEFT);
        boolean canCombine = game.canCombine(popupWeapon);
        float bw = (pw - 60 - 20) / 2;
        buttonSeed(c, x + 30, y + ph - 150, bw, 64, w.sellPrice(game.wave + 1), A_SELL, 0, C_RED,
                game.canSell(popupWeapon), "Vender +");
        button(c, x + 30 + bw + 20, y + ph - 150, bw, 64,
                w.tier >= 3 ? "Nível máx." : "Combinar", A_COMBINE, 0, C_ORANGE, canCombine, 26);
        button(c, x + pw / 2 - 100, y + ph - 76, 200, 56, "Fechar", A_CLOSE, 0, C_GRAY, true, 24);
    }

    private void drawStatsPanel(Canvas c, float x, float y, float w, float h) {
        Player p = game.player;
        panel(c, x, y, w, h);
        text(c, p.character.name, x + w / 2, y + 36, 24, 0xFFFFD84A, Paint.Align.CENTER);
        float rowH = Math.min(34, (h - 56) / Stat.COUNT);
        float size = Math.min(Math.min(21, rowH * 0.66f), w / 14f);
        for (int i = 0; i < Stat.COUNT; i++) {
            float ry = y + 56 + i * rowH + rowH * 0.7f;
            int v = p.stats[i];
            String val = (i == Stat.HP ? String.valueOf(p.maxHp()) : String.valueOf(v))
                    + (Stat.PERCENT[i] ? "%" : "");
            int color = i == Stat.HP ? 0xFFFFFFFF : v > 0 ? 0xFF8CF08C : v < 0 ? 0xFFFF8080 : 0xFFDDDDDD;
            emoji(c, Stat.ICONS[i], x + 26, ry - size * 0.35f, size * 1.1f, bmpPaint);
            text(c, Stat.NAMES[i], x + 46, ry, size, 0xFFE0E0E0, Paint.Align.LEFT);
            text(c, val, x + w - 16, ry, size, color, Paint.Align.RIGHT);
        }
    }

    // --- Fim de jogo ---

    private void drawEnd(Canvas c) {
        boolean won = game.state == Game.State.VICTORY;
        Player p = game.player;
        drawMenuBackground(c);
        float cx = vw / 2;
        if (won) {
            text(c, "A HORTA ESTÁ SALVA!", cx, 100, 68, 0xFFFFD84A, Paint.Align.CENTER);
            text(c, "Você sobreviveu às 20 ondas no " + Game.DIFF_NAMES[game.difficulty] + ". Parabéns!",
                    cx, 145, 26, 0xFFE8F5D0, Paint.Align.CENTER);
        } else {
            text(c, "VIROU SALADA!", cx, 100, 72, 0xFFFF6A5A, Paint.Align.CENTER);
            text(c, "Os insetos venceram desta vez...", cx, 145, 26, 0xFFE8F5D0, Paint.Align.CENTER);
        }
        if (p != null) {
            // lado esquerdo: personagem e números
            float lx = cx - 250;
            emoji(c, p.character.icon, lx, 240, 100, bmpPaint);
            drawEyes(c, lx, 236, 1.3f, 0, won ? -1 : 1, true);
            String[] lines = {
                    "Onda alcançada: " + game.wave,
                    "Dificuldade: " + Game.DIFF_NAMES[game.difficulty],
                    "Nível: " + p.level,
                    "Insetos derrotados: " + game.kills,
                    "Melhor onda: " + prefs.bestWave(),
            };
            for (int i = 0; i < lines.length; i++) {
                text(c, lines[i], lx, 330 + i * 36, 25, 0xFFFFFFFF, Paint.Align.CENTER);
            }
            // lado direito: dano de cada arma na partida
            float rx = cx + 40, ry = 200;
            text(c, "Dano das armas", rx, ry, 26, 0xFFFFD84A, Paint.Align.LEFT);
            int best = 1;
            for (Weapon w : p.weapons) best = Math.max(best, w.totalDamage);
            for (int i = 0; i < p.weapons.size(); i++) {
                Weapon w = p.weapons.get(i);
                float y = ry + 22 + i * 46;
                emoji(c, w.def.icon, rx + 18, y + 18, 34, bmpPaint);
                fill.setColor(0x55000000);
                rect.set(rx + 44, y + 6, rx + 344, y + 30);
                c.drawRoundRect(rect, 8, 8, fill);
                fill.setColor(TIER_COLOR[w.tier]);
                rect.set(rx + 44, y + 6, rx + 44 + 300f * w.totalDamage / best, y + 30);
                c.drawRoundRect(rect, 8, 8, fill);
                text(c, shortNum(w.totalDamage), rx + 352, y + 27, 20, 0xFFFFFFFF, Paint.Align.LEFT);
            }
        }
        if (!newUnlocks.isEmpty()) {
            float a = 0.75f + 0.25f * (float) Math.sin(time * 5);
            text(c, "🔓 Novo personagem liberado: " + newUnlocks + "!", cx, VH - 150, 28,
                    Color.argb((int) (255 * a), 255, 216, 74), Paint.Align.CENTER);
        }
        float bw = Math.min(330, (vw - 100) / 3), bx = cx - (bw * 3 + 40) / 2;
        button(c, bx, VH - 120, bw, 84, "Jogar de novo", A_AGAIN, 0, C_GREEN, true, 32);
        String label = submitState.equals("sending") ? "Enviando..." : submitState.equals("sent") ? "Enviado ✔"
                : "🏆 Enviar pro ranking";
        button(c, bx + bw + 20, VH - 120, bw, 84, label, A_SUBMIT, 0, 0xFFB8860B, submitState.isEmpty(), 30);
        button(c, bx + (bw + 20) * 2, VH - 120, bw, 84, "Menu", A_MENU, 0, C_GRAY, true, 32);
    }

    // ------------------------------------------------------------------
    // Ajudantes de desenho
    // ------------------------------------------------------------------

    private void registerButton(float x, float y, float w, float h, int action, int arg, boolean enabled) {
        Btn b;
        if (buttonCount < buttons.size()) {
            b = buttons.get(buttonCount);
        } else {
            b = new Btn();
            buttons.add(b);
        }
        buttonCount++;
        b.x = x;
        b.y = y;
        b.w = w;
        b.h = h;
        b.action = action;
        b.arg = arg;
        b.enabled = enabled;
    }

    private void backdrop(Canvas c, int action) {
        fill.setColor(0xAA000000);
        c.drawRect(0, 0, vw, VH, fill);
        registerButton(0, 0, vw, VH, action, -99, true);
    }

    private void button(Canvas c, float x, float y, float w, float h, String label, int action,
                        int arg, int color, boolean enabled, float textSize) {
        drawButtonBase(c, x, y, w, h, enabled ? color : C_GRAY);
        while (textSize > 12 && measure(label, textSize) > w - 20) textSize -= 1;
        text(c, label, x + w / 2, y + h / 2 + textSize * 0.36f, textSize,
                enabled ? 0xFFFFFFFF : 0xFFAAAAAA, Paint.Align.CENTER);
        registerButton(x, y, w, h, action, arg, enabled);
    }

    private void buttonSeed(Canvas c, float x, float y, float w, float h, int amount, int action,
                            int arg, int color, boolean enabled) {
        buttonSeed(c, x, y, w, h, amount, action, arg, color, enabled, "");
    }

    /** Botao com "prefixo + icone de semente + numero". */
    private void buttonSeed(Canvas c, float x, float y, float w, float h, int amount, int action,
                            int arg, int color, boolean enabled, String prefix) {
        drawButtonBase(c, x, y, w, h, enabled ? color : C_GRAY);
        float size = Math.min(30, h * 0.5f);
        String num = String.valueOf(amount);
        float tw = measure(prefix, size) + measure(num, size) + size + 6;
        while (tw > w - 24 && size > 12) {
            size -= 1;
            tw = measure(prefix, size) + measure(num, size) + size + 6;
        }
        float tx = x + w / 2 - tw / 2;
        float ty = y + h / 2 + size * 0.36f;
        int tc = enabled ? 0xFFFFFFFF : 0xFFAAAAAA;
        if (!prefix.isEmpty()) {
            text(c, prefix, tx, ty, size, tc, Paint.Align.LEFT);
            tx += measure(prefix, size);
        }
        seedIcon(c, tx + size * 0.45f, y + h / 2, size * 0.36f);
        text(c, num, tx + size + 4, ty, size, tc, Paint.Align.LEFT);
        registerButton(x, y, w, h, action, arg, enabled);
    }

    private void drawButtonBase(Canvas c, float x, float y, float w, float h, int color) {
        fill.setColor(darker(color));
        rect.set(x, y + 5, x + w, y + h);
        c.drawRoundRect(rect, 16, 16, fill);
        fill.setColor(color);
        rect.set(x, y, x + w, y + h - 5);
        c.drawRoundRect(rect, 16, 16, fill);
        stroke.setColor(0x55000000);
        stroke.setStrokeWidth(2);
        rect.set(x, y, x + w, y + h);
        c.drawRoundRect(rect, 16, 16, stroke);
    }

    private void seedCounter(Canvas c, float x, float y, int amount) {
        fill.setColor(0x66000000);
        rect.set(x, y, x + 140, y + 46);
        c.drawRoundRect(rect, 23, 23, fill);
        seedIcon(c, x + 26, y + 23, 11);
        text(c, String.valueOf(amount), x + 46, y + 34, 28, 0xFFFFFFFF, Paint.Align.LEFT);
    }

    private void seedIcon(Canvas c, float x, float y, float r) {
        fill.setColor(0xFF2E5A1A);
        c.drawCircle(x, y, r + 2.5f, fill);
        fill.setColor(C_SEED);
        c.drawCircle(x, y, r, fill);
        fill.setColor(0xFFD6FFB0);
        c.drawCircle(x - r * 0.3f, y - r * 0.3f, r * 0.4f, fill);
    }

    private void panel(Canvas c, float x, float y, float w, float h) {
        fill.setColor(C_PANEL);
        rect.set(x, y, x + w, y + h);
        c.drawRoundRect(rect, 18, 18, fill);
        stroke.setColor(C_PANEL_BORDER);
        stroke.setStrokeWidth(3);
        c.drawRoundRect(rect, 18, 18, stroke);
    }

    private void card(Canvas c, float x, float y, float w, float h, int tier) {
        fill.setColor(TIER_BG[tier]);
        rect.set(x, y, x + w, y + h);
        c.drawRoundRect(rect, 14, 14, fill);
        stroke.setColor(TIER_COLOR[tier]);
        stroke.setStrokeWidth(3);
        c.drawRoundRect(rect, 14, 14, stroke);
    }

    private void bar(Canvas c, float x, float y, float w, float h, float frac, int color, int bg) {
        frac = Math.max(0f, Math.min(1f, frac));
        fill.setColor(0xFF000000);
        rect.set(x - 3, y - 3, x + w + 3, y + h + 3);
        c.drawRoundRect(rect, 10, 10, fill);
        fill.setColor(bg);
        rect.set(x, y, x + w, y + h);
        c.drawRoundRect(rect, 8, 8, fill);
        if (frac > 0) {
            fill.setColor(color);
            rect.set(x, y, x + w * frac, y + h);
            c.drawRoundRect(rect, 8, 8, fill);
        }
    }

    /** Desenha um emoji centrado em (x, y) com {@code size} unidades virtuais. */
    private void emoji(Canvas c, String icon, float x, float y, float size, Paint p) {
        Bitmap b = sprites.get(icon, (int) (size * scale));
        rect.set(x - size / 2, y - size / 2, x + size / 2, y + size / 2);
        c.drawBitmap(b, null, rect, p);
    }

    private void text(Canvas c, String s, float x, float y, float size, int color, Paint.Align align) {
        textPaint.setTextSize(size);
        textPaint.setTextAlign(align);
        textPaint.setColor(color);
        textOutline.setTextSize(size);
        textOutline.setTextAlign(align);
        textOutline.setStrokeWidth(Math.max(2f, size * 0.14f));
        textOutline.setAlpha(Color.alpha(color));
        c.drawText(s, x, y, textOutline);
        c.drawText(s, x, y, textPaint);
    }

    /** Texto centralizado que diminui a fonte até caber na largura. */
    private void textFit(Canvas c, String s, float x, float y, float size, float maxW, int color) {
        while (size > 10 && measure(s, size) > maxW) size -= 1;
        text(c, s, x, y, size, color, Paint.Align.CENTER);
    }

    private float measure(String s, float size) {
        textPaint.setTextSize(size);
        return textPaint.measureText(s);
    }

    /** Texto com quebra de linha simples. */
    private float wrapped(Canvas c, String s, float x, float y, float maxW, float size, int color,
                          Paint.Align align) {
        String[] words = s.split(" ");
        StringBuilder line = new StringBuilder();
        float ly = y;
        for (String word : words) {
            String test = line.length() == 0 ? word : line + " " + word;
            if (measure(test, size) > maxW && line.length() > 0) {
                text(c, line.toString(), x, ly, size, color, align);
                ly += size * 1.2f;
                line = new StringBuilder(word);
            } else {
                line = new StringBuilder(test);
            }
        }
        if (line.length() > 0) text(c, line.toString(), x, ly, size, color, align);
        return ly + size * 1.2f;
    }

    private static int darker(int color) {
        int a = Color.alpha(color);
        int r = (int) (Color.red(color) * 0.6f);
        int g = (int) (Color.green(color) * 0.6f);
        int b = (int) (Color.blue(color) * 0.6f);
        return Color.argb(a, r, g, b);
    }

    private static float clamp(float v, float lo, float hi) {
        if (hi < lo) return (lo + hi) / 2;
        return v < lo ? lo : (v > hi ? hi : v);
    }
}
