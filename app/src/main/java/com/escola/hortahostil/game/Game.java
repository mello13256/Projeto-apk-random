package com.escola.hortahostil.game;

import java.util.ArrayList;
import java.util.Random;

/**
 * Toda a logica do jogo. Nao usa nada do Android, entao pode ser testada
 * no computador (veja sim/SimTest.java).
 */
public final class Game {
    public static final float WORLD_W = 1800f;
    public static final float WORLD_H = 1200f;
    public static final int MAX_WAVE = 20;
    public static final int START_MATERIALS = 30;

    public static final int BUY_OK = 0;
    public static final int BUY_NO_MONEY = 1;
    public static final int BUY_FULL = 2;
    public static final int BUY_EMPTY = 3;

    public enum State { MENU, CHAR_SELECT, PLAYING, LEVEL_UP, SHOP, GAME_OVER, VICTORY }

    public State state = State.MENU;
    public boolean paused;
    public final Random rng;
    public Fx fx = Fx.NONE;

    public Player player;
    public int wave;
    public float waveTime;
    public float waveDuration;
    public float spawnTimer;
    public int kills;
    public int levelsPending;
    public int lastHarvest;
    public Enemy boss;

    public final ArrayList<Enemy> enemies = new ArrayList<>();
    public final ArrayList<Telegraph> telegraphs = new ArrayList<>();
    public final ArrayList<Bullet> bullets = new ArrayList<>();
    public final ArrayList<Bullet> enemyBullets = new ArrayList<>();
    public final ArrayList<Pickup> pickups = new ArrayList<>();
    public final ArrayList<Particle> particles = new ArrayList<>();
    public final ArrayList<FloatText> texts = new ArrayList<>();

    public final Shop.Offer[] offers = new Shop.Offer[Shop.SLOTS];
    public int shopRerolls;
    /** Opcoes de level up: {atributo, quantidade, raridade}. */
    public final int[][] levelChoices = new int[4][3];
    public int levelRerolls;

    public float shake;
    public String banner = "";
    public float bannerTime;

    private boolean lastCrit;

    public Game() {
        this(new Random());
    }

    public Game(Random rng) {
        this.rng = rng;
    }

    // ------------------------------------------------------------------
    // Fluxo da partida
    // ------------------------------------------------------------------

    public void newRun(CharDef c) {
        player = new Player(c);
        player.materials = START_MATERIALS;
        kills = 0;
        levelsPending = 0;
        for (int i = 0; i < offers.length; i++) offers[i] = null;
        paused = false;
        startWave(1);
    }

    public void startWave(int n) {
        wave = n;
        waveTime = 0f;
        if (n == MAX_WAVE) waveDuration = 90f;
        else waveDuration = Math.min(60f, 20f + (n - 1) * 5f);
        enemies.clear();
        telegraphs.clear();
        bullets.clear();
        enemyBullets.clear();
        pickups.clear();
        particles.clear();
        texts.clear();
        boss = null;
        Player p = player;
        p.x = WORLD_W / 2f;
        p.y = WORLD_H / 2f;
        p.hp = p.maxHp();
        p.iframes = 1f;
        p.regenAcc = 0f;
        for (Weapon w : p.weapons) {
            w.cd = rng.nextFloat() * 0.5f;
            w.attackT = -1f;
        }
        spawnTimer = 0.6f;
        if (n == 10) {
            float[] pos = randomSpawnPos(450f);
            telegraphs.add(new Telegraph(EnemyDef.LESMA_RAINHA, pos[0], pos[1], 2f));
            showBanner("ONDA 10 - CHEFÃO!");
        } else if (n == MAX_WAVE) {
            float[] pos = randomSpawnPos(450f);
            telegraphs.add(new Telegraph(EnemyDef.FORMIGA_IMPERATRIZ, pos[0], pos[1], 2f));
            showBanner("ONDA FINAL - CHEFONA!");
        } else {
            showBanner("ONDA " + n);
        }
        state = State.PLAYING;
    }

    public void nextWave() {
        if (state != State.SHOP) return;
        startWave(wave + 1);
    }

    void endWave() {
        Player p = player;
        int collected = 0;
        for (Pickup pk : pickups) {
            if (pk.type == Pickup.MATERIAL && !pk.dead) collected += pk.value;
        }
        lastHarvest = Math.max(0, p.stats[Stat.HARVEST]);
        int gain = collected + lastHarvest;
        p.materials += gain;
        addXp(gain);
        enemies.clear();
        telegraphs.clear();
        bullets.clear();
        enemyBullets.clear();
        pickups.clear();
        boss = null;
        fx.sound(Fx.WAVE_END);
        if (wave >= MAX_WAVE) {
            state = State.VICTORY;
            fx.runEnded(true, wave);
            return;
        }
        if (levelsPending > 0) {
            state = State.LEVEL_UP;
            levelRerolls = 0;
            rollLevelChoices();
        } else {
            openShop();
        }
    }

    void gameOver() {
        state = State.GAME_OVER;
        player.hp = 0;
        fx.sound(Fx.HURT);
        fx.vibrate(300);
        fx.runEnded(false, wave);
    }

    void showBanner(String s) {
        banner = s;
        bannerTime = 2.2f;
    }

    // ------------------------------------------------------------------
    // Level up
    // ------------------------------------------------------------------

    void addXp(int v) {
        Player p = player;
        p.xp += v;
        while (p.xp >= p.xpToNext()) {
            p.xp -= p.xpToNext();
            p.level++;
            p.stats[Stat.HP] += 1;
            p.hp += 1;
            levelsPending++;
            if (state == State.PLAYING) {
                addText(p.x, p.y - 50, "NÍVEL " + p.level + "!", 0xFF7CFF6B, 34);
                fx.sound(Fx.LEVEL_UP);
            }
        }
    }

    void rollLevelChoices() {
        int[] order = new int[Stat.COUNT];
        for (int i = 0; i < order.length; i++) order[i] = i;
        for (int i = order.length - 1; i > 0; i--) {
            int j = rng.nextInt(i + 1);
            int t = order[i];
            order[i] = order[j];
            order[j] = t;
        }
        float l = Math.max(0.2f, 1f + player.stats[Stat.LUCK] / 100f);
        int lv = player.level;
        for (int i = 0; i < 4; i++) {
            float t4 = lv >= 10 ? Math.min(0.1f, (lv - 9) * 0.01f * l) : 0f;
            float t3 = lv >= 5 ? Math.min(0.25f, (lv - 4) * 0.025f * l) : 0f;
            float t2 = Math.min(0.5f, (lv - 1) * 0.04f * l);
            float r = rng.nextFloat();
            int tier = r < t4 ? 3 : r < t4 + t3 ? 2 : r < t4 + t3 + t2 ? 1 : 0;
            int stat = order[i];
            levelChoices[i][0] = stat;
            levelChoices[i][1] = Stat.LEVEL_UP_BASE[stat] * (tier + 1);
            levelChoices[i][2] = tier;
        }
    }

    public void chooseLevel(int i) {
        if (state != State.LEVEL_UP) return;
        Player p = player;
        int stat = levelChoices[i][0];
        int amount = levelChoices[i][1];
        p.stats[stat] += amount;
        if (stat == Stat.HP) p.hp += amount;
        p.hp = Math.min(p.hp, p.maxHp());
        levelsPending--;
        fx.sound(Fx.BUY);
        if (levelsPending > 0) {
            levelRerolls = 0;
            rollLevelChoices();
        } else {
            openShop();
        }
    }

    public int levelRerollCost() {
        return 1 + wave / 2 + levelRerolls * (1 + wave / 4);
    }

    public boolean rerollLevel() {
        int cost = levelRerollCost();
        if (player.materials < cost) {
            fx.sound(Fx.ERROR);
            return false;
        }
        player.materials -= cost;
        levelRerolls++;
        rollLevelChoices();
        fx.sound(Fx.PICKUP);
        return true;
    }

    // ------------------------------------------------------------------
    // Loja
    // ------------------------------------------------------------------

    void openShop() {
        state = State.SHOP;
        shopRerolls = 0;
        for (int i = 0; i < offers.length; i++) {
            if (offers[i] == null || !offers[i].locked) offers[i] = Shop.randomOffer(rng, player, wave + 1);
        }
    }

    public int shopRerollCost() {
        return Math.max(1, Math.round(wave * 0.75f)) + shopRerolls * Math.max(1, wave / 2);
    }

    public boolean rerollShop() {
        int cost = shopRerollCost();
        if (player.materials < cost) {
            fx.sound(Fx.ERROR);
            return false;
        }
        player.materials -= cost;
        shopRerolls++;
        for (int i = 0; i < offers.length; i++) {
            if (offers[i] == null || !offers[i].locked) offers[i] = Shop.randomOffer(rng, player, wave + 1);
        }
        fx.sound(Fx.PICKUP);
        return true;
    }

    public void toggleLock(int i) {
        if (offers[i] != null) offers[i].locked = !offers[i].locked;
    }

    public int checkBuy(int i) {
        Shop.Offer o = offers[i];
        if (o == null) return BUY_EMPTY;
        if (player.materials < o.price) return BUY_NO_MONEY;
        if (o.weapon != null && player.weapons.size() >= Player.MAX_WEAPONS
                && findMergeTarget(o.weapon, o.tier, -1) < 0) return BUY_FULL;
        return BUY_OK;
    }

    public int buy(int i) {
        int check = checkBuy(i);
        if (check != BUY_OK) {
            fx.sound(Fx.ERROR);
            return check;
        }
        Shop.Offer o = offers[i];
        Player p = player;
        if (o.weapon != null) {
            if (p.weapons.size() < Player.MAX_WEAPONS) {
                p.weapons.add(new Weapon(o.weapon, o.tier));
            } else {
                p.weapons.get(findMergeTarget(o.weapon, o.tier, -1)).tier++;
            }
        } else {
            p.items.add(o.item);
            o.item.applyTo(p.stats);
            p.hp = Math.min(p.maxHp(), Math.max(p.hp, 1));
        }
        p.materials -= o.price;
        offers[i] = null;
        fx.sound(Fx.BUY);
        return BUY_OK;
    }

    /** Indice de uma arma igual (mesmo tipo e nivel) que pode ser combinada. */
    public int findMergeTarget(WeaponDef def, int tier, int exclude) {
        if (tier >= 3) return -1;
        ArrayList<Weapon> ws = player.weapons;
        for (int j = 0; j < ws.size(); j++) {
            if (j == exclude) continue;
            Weapon w = ws.get(j);
            if (w.def == def && w.tier == tier) return j;
        }
        return -1;
    }

    public boolean canCombine(int idx) {
        if (idx < 0 || idx >= player.weapons.size()) return false;
        Weapon w = player.weapons.get(idx);
        return findMergeTarget(w.def, w.tier, idx) >= 0;
    }

    public boolean combineWeapon(int idx) {
        if (!canCombine(idx)) return false;
        Weapon w = player.weapons.get(idx);
        int other = findMergeTarget(w.def, w.tier, idx);
        w.tier++;
        player.weapons.remove(other);
        fx.sound(Fx.LEVEL_UP);
        return true;
    }

    public boolean canSell(int idx) {
        return idx >= 0 && idx < player.weapons.size() && player.weapons.size() > 1;
    }

    public boolean sellWeapon(int idx) {
        if (!canSell(idx)) {
            fx.sound(Fx.ERROR);
            return false;
        }
        Weapon w = player.weapons.remove(idx);
        player.materials += w.sellPrice(wave + 1);
        fx.sound(Fx.BUY);
        return true;
    }

    // ------------------------------------------------------------------
    // Atualizacao da partida
    // ------------------------------------------------------------------

    public void update(float dt, float jx, float jy) {
        if (bannerTime > 0f) bannerTime -= dt;
        if (state != State.PLAYING || paused) return;
        waveTime += dt;
        shake = Math.max(0f, shake - dt * 25f);
        updatePlayer(dt, jx, jy);
        updateSpawns(dt);
        updateEnemies(dt);
        separateEnemies();
        updateWeapons(dt);
        updateBullets(dt);
        updateEnemyBullets(dt);
        updatePickups(dt);
        updateEffects(dt);
        cleanup();
        if (player.hp <= 0f) {
            gameOver();
            return;
        }
        if (waveTime >= waveDuration) endWave();
    }

    private void updatePlayer(float dt, float jx, float jy) {
        Player p = player;
        float len = (float) Math.sqrt(jx * jx + jy * jy);
        if (len > 1f) {
            jx /= len;
            jy /= len;
            len = 1f;
        }
        p.moving = len > 0.1f;
        if (p.moving) {
            float sp = p.speed();
            p.x += jx * sp * dt;
            p.y += jy * sp * dt;
            p.lookX = jx / len;
            p.lookY = jy / len;
            if (Math.abs(jx) > 0.15f) p.facingLeft = jx < 0f;
            p.moveAnim += dt * 12f;
        }
        p.x = clamp(p.x, p.radius, WORLD_W - p.radius);
        p.y = clamp(p.y, p.radius, WORLD_H - p.radius);
        if (p.iframes > 0f) p.iframes -= dt;

        int regen = p.stats[Stat.REGEN];
        if (regen > 0 && p.hp < p.maxHp()) {
            p.regenAcc += dt * regen * 0.12f;
            while (p.regenAcc >= 1f) {
                p.regenAcc -= 1f;
                p.heal(1f);
            }
        }
    }

    // --- Inimigos ---

    static float hpMult(int wave) {
        int w = wave - 1;
        return 1f + 0.25f * w + 0.028f * w * w;
    }

    private float spawnInterval() {
        return Math.max(0.3f, 1.6f - wave * 0.065f);
    }

    private int enemyCap() {
        return Math.min(175, 70 + wave * 5);
    }

    private void updateSpawns(float dt) {
        spawnTimer -= dt;
        if (spawnTimer <= 0f && waveTime < waveDuration - 1.5f) {
            spawnTimer = spawnInterval();
            int group = 1 + rng.nextInt(1 + wave / 3);
            float[] pos = randomSpawnPos(300f);
            for (int g = 0; g < group; g++) {
                if (enemies.size() + telegraphs.size() >= enemyCap()) break;
                EnemyDef d = pickEnemy();
                float x = clamp(pos[0] + (rng.nextFloat() - 0.5f) * 140f, 40f, WORLD_W - 40f);
                float y = clamp(pos[1] + (rng.nextFloat() - 0.5f) * 140f, 40f, WORLD_H - 40f);
                telegraphs.add(new Telegraph(d, x, y, 0.8f));
            }
        }
        for (int i = telegraphs.size() - 1; i >= 0; i--) {
            Telegraph t = telegraphs.get(i);
            t.time -= dt;
            if (t.time <= 0f) {
                telegraphs.remove(i);
                spawnEnemy(t.def, t.x, t.y);
            }
        }
    }

    private EnemyDef pickEnemy() {
        int total = 0;
        int[] weights = new int[EnemyDef.SPAWNABLE.length];
        for (int i = 0; i < weights.length; i++) {
            EnemyDef d = EnemyDef.SPAWNABLE[i];
            int w;
            if (wave < d.minWave) w = 0;
            else if (d == EnemyDef.LAGARTA) w = 10;
            else if (d == EnemyDef.VESPA) w = 4 + wave / 3;
            else if (d == EnemyDef.ARANHA) w = 3 + wave / 4;
            else w = 2 + wave / 5;
            weights[i] = w;
            total += w;
        }
        int r = rng.nextInt(total);
        for (int i = 0; i < weights.length; i++) {
            r -= weights[i];
            if (r < 0) return EnemyDef.SPAWNABLE[i];
        }
        return EnemyDef.LAGARTA;
    }

    private Enemy spawnEnemy(EnemyDef d, float x, float y) {
        float mult = d.boss ? 1f : hpMult(wave);
        Enemy e = new Enemy(d, x, y, mult, wave, 0.9f + rng.nextFloat() * 0.2f);
        e.aiTimer = 1f + rng.nextFloat() * 1.5f;
        e.aiTimer2 = d.boss ? 6f : 0f;
        enemies.add(e);
        burst(x, y, d.boss ? 30 : 6, 0xFF8B6B4A, 120f, 5f, 0.4f);
        if (d.boss) {
            boss = e;
            shake = 10f;
            fx.vibrate(120);
        }
        return e;
    }

    private float[] randomSpawnPos(float minDist) {
        float x = 0, y = 0;
        for (int tries = 0; tries < 30; tries++) {
            x = 60f + rng.nextFloat() * (WORLD_W - 120f);
            y = 60f + rng.nextFloat() * (WORLD_H - 120f);
            float dx = x - player.x, dy = y - player.y;
            if (dx * dx + dy * dy >= minDist * minDist) break;
        }
        return new float[]{x, y};
    }

    private void updateEnemies(float dt) {
        Player p = player;
        int n = enemies.size();
        for (int i = 0; i < n; i++) {
            Enemy e = enemies.get(i);
            if (e.dead) continue;
            e.anim += dt;
            if (e.flash > 0f) e.flash -= dt;

            // empurrao
            e.x += e.vx * dt;
            e.y += e.vy * dt;
            float decay = Math.max(0f, 1f - dt * 10f);
            e.vx *= decay;
            e.vy *= decay;

            // queimadura
            if (e.burnTime > 0f) {
                e.burnTime -= dt;
                e.burnTick -= dt;
                if (e.burnTick <= 0f) {
                    e.burnTick = 0.5f;
                    burst(e.x, e.y - e.radius * 0.5f, 3, 0xFFFF8A1A, 60f, 4f, 0.4f);
                    damageEnemy(e, e.burnDamage, false, 0f, 0f, 0f, 0, 0xFFFFA040);
                    if (e.dead) continue;
                }
                if (e.burnTime <= 0f) e.burnDamage = 0;
            }

            float dx = p.x - e.x, dy = p.y - e.y;
            float d = (float) Math.sqrt(dx * dx + dy * dy);
            float nx = d > 0.001f ? dx / d : 0f, ny = d > 0.001f ? dy / d : 0f;
            float mx = 0f, my = 0f; // direcao de movimento
            float sp = e.speed;

            switch (e.def.ai) {
                case EnemyDef.AI_CHASE:
                    mx = nx;
                    my = ny;
                    break;
                case EnemyDef.AI_SHOOT:
                    if (d > 330f) {
                        mx = nx;
                        my = ny;
                    } else if (d < 230f) {
                        mx = -nx * 0.8f;
                        my = -ny * 0.8f;
                    }
                    e.aiTimer -= dt;
                    if (e.aiTimer <= 0f && d < 520f) {
                        e.aiTimer = 2.4f + rng.nextFloat() * 0.8f;
                        fireEnemyBullet(e.x, e.y, (float) Math.atan2(dy, dx), 270f, e.damage);
                    }
                    break;
                case EnemyDef.AI_CHARGE:
                    updateCharger(e, dt, d, nx, ny);
                    mx = e.dashX;
                    my = e.dashY;
                    if (e.aiState == 0) {
                        mx = nx;
                        my = ny;
                    } else if (e.aiState == 1) {
                        mx = 0f;
                        my = 0f;
                    } else {
                        sp = 580f;
                    }
                    break;
                case EnemyDef.AI_BOSS_SNAIL:
                    mx = nx;
                    my = ny;
                    e.aiTimer -= dt;
                    if (e.aiTimer <= 0f) {
                        e.aiTimer = 2.8f;
                        int shots = 16;
                        float off = rng.nextFloat();
                        for (int k = 0; k < shots; k++) {
                            float a = (float) (Math.PI * 2 * (k + off) / shots);
                            fireEnemyBullet(e.x, e.y, a, 210f, e.damage);
                        }
                    }
                    e.aiTimer2 -= dt;
                    if (e.aiTimer2 <= 0f) {
                        e.aiTimer2 = 7f;
                        for (int k = 0; k < 4; k++) {
                            float a = (float) (Math.PI * 0.5 * k);
                            telegraphs.add(new Telegraph(EnemyDef.LAGARTA,
                                    clamp(e.x + (float) Math.cos(a) * 110f, 40f, WORLD_W - 40f),
                                    clamp(e.y + (float) Math.sin(a) * 110f, 40f, WORLD_H - 40f), 0.6f));
                        }
                    }
                    break;
                case EnemyDef.AI_BOSS_ANT:
                    updateAntBoss(e, dt, d, nx, ny);
                    if (e.aiState == 0) {
                        mx = nx;
                        my = ny;
                    } else if (e.aiState == 1) {
                        mx = nx * 0.3f;
                        my = ny * 0.3f;
                    } else if (e.aiState == 3) {
                        mx = e.dashX;
                        my = e.dashY;
                        sp = 650f;
                    }
                    break;
                default:
                    break;
            }

            e.x += mx * sp * dt;
            e.y += my * sp * dt;
            if (Math.abs(mx) > 0.05f) e.facingLeft = mx < 0f;
            e.x = clamp(e.x, e.radius * 0.5f, WORLD_W - e.radius * 0.5f);
            e.y = clamp(e.y, e.radius * 0.5f, WORLD_H - e.radius * 0.5f);

            // contato com o jogador
            float hit = e.radius + p.radius - 8f;
            if (d < hit) damagePlayer(e.damage);
        }
    }

    private void updateCharger(Enemy e, float dt, float d, float nx, float ny) {
        if (e.aiState == 0) {
            e.aiTimer -= dt;
            if (d < 340f && e.aiTimer <= 0f) {
                e.aiState = 1;
                e.aiTimer2 = 0.6f;
                e.dashX = nx;
                e.dashY = ny;
            }
        } else if (e.aiState == 1) {
            e.aiTimer2 -= dt;
            if (e.aiTimer2 <= 0f) {
                e.aiState = 2;
                e.aiTimer2 = 0.45f;
            }
        } else {
            e.aiTimer2 -= dt;
            if (e.aiTimer2 <= 0f) {
                e.aiState = 0;
                e.aiTimer = 1.8f;
            }
        }
    }

    private void updateAntBoss(Enemy e, float dt, float d, float nx, float ny) {
        e.aiTimer -= dt;
        switch (e.aiState) {
            case 0: // persegue
                if (e.aiTimer <= 0f) {
                    e.aiState = 1;
                    e.aiTimer = 2.5f;
                    e.aiTimer2 = 0f;
                }
                break;
            case 1: // espiral de tiros
                e.aiTimer2 -= dt;
                if (e.aiTimer2 <= 0f) {
                    e.aiTimer2 = 0.1f;
                    e.spiral += 0.37f;
                    for (int k = 0; k < 3; k++) {
                        float a = e.spiral + (float) (Math.PI * 2 * k / 3);
                        fireEnemyBullet(e.x, e.y, a, 230f, e.damage);
                    }
                }
                if (e.aiTimer <= 0f) {
                    e.aiState = 2;
                    e.aiTimer = 0.7f;
                    e.dashX = nx;
                    e.dashY = ny;
                }
                break;
            case 2: // prepara investida
                if (e.aiTimer <= 0f) {
                    e.aiState = 3;
                    e.aiTimer = 0.6f;
                }
                break;
            default: // investida
                if (e.aiTimer <= 0f) {
                    e.aiState = 0;
                    e.aiTimer = 3f;
                    // chama reforcos
                    for (int k = 0; k < 5; k++) {
                        float a = (float) (Math.PI * 2 * k / 5);
                        telegraphs.add(new Telegraph(EnemyDef.VESPA,
                                clamp(e.x + (float) Math.cos(a) * 130f, 40f, WORLD_W - 40f),
                                clamp(e.y + (float) Math.sin(a) * 130f, 40f, WORLD_H - 40f), 0.6f));
                    }
                }
                break;
        }
    }

    private void separateEnemies() {
        int n = enemies.size();
        for (int i = 0; i < n; i++) {
            Enemy a = enemies.get(i);
            if (a.dead) continue;
            for (int j = i + 1; j < n; j++) {
                Enemy b = enemies.get(j);
                if (b.dead) continue;
                float dx = b.x - a.x, dy = b.y - a.y;
                float min = (a.radius + b.radius) * 0.85f;
                float d2 = dx * dx + dy * dy;
                if (d2 >= min * min) continue;
                float d = (float) Math.sqrt(d2);
                if (d < 0.01f) {
                    dx = rng.nextFloat() - 0.5f;
                    dy = rng.nextFloat() - 0.5f;
                    d = (float) Math.sqrt(dx * dx + dy * dy) + 0.001f;
                }
                float push = (min - d) * 0.5f;
                float px = dx / d * push, py = dy / d * push;
                float wa = a.def.boss ? 0.1f : 1f, wb = b.def.boss ? 0.1f : 1f;
                a.x -= px * wa;
                a.y -= py * wa;
                b.x += px * wb;
                b.y += py * wb;
            }
        }
    }

    private void fireEnemyBullet(float x, float y, float angle, float speed, int damage) {
        Bullet b = new Bullet();
        b.x = x;
        b.y = y;
        b.vx = (float) Math.cos(angle) * speed;
        b.vy = (float) Math.sin(angle) * speed;
        b.radius = 9f;
        b.life = 4f;
        b.damage = damage;
        b.enemy = true;
        b.color = 0xFFC24BFF;
        enemyBullets.add(b);
    }

    public void damagePlayer(int dmg) {
        Player p = player;
        if (p.iframes > 0f || state != State.PLAYING) return;
        if (rng.nextInt(100) < p.dodgeChance()) {
            addText(p.x, p.y - 40, "Esquivou!", 0xFFBFE8FF, 24);
            p.iframes = 0.25f;
            return;
        }
        int d = Math.max(1, Math.round(dmg * p.armorFactor()));
        p.hp -= d;
        p.iframes = 0.4f;
        shake = Math.max(shake, 7f);
        addText(p.x, p.y - 40, "-" + d, 0xFFFF4A4A, 30);
        fx.sound(Fx.HURT);
        fx.vibrate(30);
    }

    // --- Armas ---

    private void updateWeapons(float dt) {
        Player p = player;
        int n = p.weapons.size();
        for (int i = 0; i < n; i++) {
            Weapon w = p.weapons.get(i);
            double a = n == 1 ? (p.facingLeft ? Math.PI : 0) : Math.PI * 2 * i / n - Math.PI / 2;
            float hx = p.x + (float) Math.cos(a) * 44f;
            float hy = p.y + (float) Math.sin(a) * 36f + 6f;
            w.x += (hx - w.x) * Math.min(1f, dt * 20f);
            w.y += (hy - w.y) * Math.min(1f, dt * 20f);
            w.cd -= dt;

            if (w.attacking()) {
                updateMelee(w, dt);
                continue;
            }
            w.tipX = w.x;
            w.tipY = w.y;
            float range = w.range(p);
            Enemy t = nearestEnemy(w.x, w.y, range, null);
            w.hasTarget = t != null;
            if (t == null) {
                float idle = p.facingLeft ? (float) Math.PI : 0f;
                w.angle = lerpAngle(w.angle, idle, Math.min(1f, dt * 8f));
                continue;
            }
            float ang = (float) Math.atan2(t.y - w.y, t.x - w.x);
            w.angle = ang;
            if (w.cd <= 0f) {
                w.cd = w.cooldown(p);
                if (w.def.isMelee()) startMelee(w, t, ang);
                else fireWeapon(w, ang);
            }
        }
    }

    private void startMelee(Weapon w, Enemy t, float ang) {
        float dx = t.x - w.x, dy = t.y - w.y;
        float d = (float) Math.sqrt(dx * dx + dy * dy);
        w.dirX = (float) Math.cos(ang);
        w.dirY = (float) Math.sin(ang);
        w.reach = clamp(d, 30f, w.range(player));
        w.attackDur = clamp(w.cooldown(player) * 0.45f, 0.12f, 0.28f);
        w.attackT = 0f;
        w.hitList.clear();
        fx.sound(Fx.SHOOT);
    }

    private void updateMelee(Weapon w, float dt) {
        w.attackT += dt;
        float ph = w.attackT / w.attackDur;
        if (ph >= 1f) {
            w.attackT = -1f;
            w.tipX = w.x;
            w.tipY = w.y;
            return;
        }
        float ext = (float) Math.sin(Math.PI * ph) * w.reach;
        w.tipX = w.x + w.dirX * ext;
        w.tipY = w.y + w.dirY * ext;
        float hr = w.def.hitRadius;
        for (int i = 0, n = enemies.size(); i < n; i++) {
            Enemy e = enemies.get(i);
            if (e.dead || w.hitList.contains(e)) continue;
            float dx = e.x - w.tipX, dy = e.y - w.tipY;
            float r = e.radius + hr;
            if (dx * dx + dy * dy < r * r) {
                w.hitList.add(e);
                int dmg = rollDamage(w);
                damageEnemy(e, dmg, lastCrit, w.dirX, w.dirY, w.def.knockback, 0, 0);
            }
        }
    }

    private void fireWeapon(Weapon w, float ang) {
        WeaponDef def = w.def;
        float range = w.range(player);
        int burn = w.burnDamage(player);
        for (int k = 0; k < def.pellets; k++) {
            float a = ang;
            if (def.pellets > 1) a += def.spread * ((float) k / (def.pellets - 1) - 0.5f);
            else a += (rng.nextFloat() - 0.5f) * def.spread;
            Bullet b = new Bullet();
            float c = (float) Math.cos(a), s = (float) Math.sin(a);
            b.x = w.x + c * 16f;
            b.y = w.y + s * 16f;
            b.prevX = b.x;
            b.prevY = b.y;
            b.vx = c * def.projSpeed;
            b.vy = s * def.projSpeed;
            b.life = (range + 40f) / def.projSpeed;
            b.damage = rollDamage(w);
            b.crit = lastCrit;
            b.pierce = def.pierce;
            b.bounce = def.bounce;
            b.explosion = def.explosion;
            b.burn = burn;
            b.knockback = def.knockback;
            b.color = def.color;
            b.lightning = def == WeaponDef.RAIO;
            b.radius = def.explosion > 0 ? 10f : def.burn > 0 ? 10f : 7f;
            b.source = w;
            bullets.add(b);
        }
        fx.sound(Fx.SHOOT);
    }

    private int rollDamage(Weapon w) {
        float d = w.baseDamage(player);
        lastCrit = rng.nextInt(100) < w.critChance(player);
        if (lastCrit) d *= w.def.critMult;
        return Math.max(1, Math.round(d));
    }

    private void updateBullets(float dt) {
        for (int i = 0, n = bullets.size(); i < n; i++) {
            Bullet b = bullets.get(i);
            if (b.dead) continue;
            b.prevX = b.x;
            b.prevY = b.y;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            if (b.life <= 0f || b.x < -50 || b.y < -50 || b.x > WORLD_W + 50 || b.y > WORLD_H + 50) {
                if (b.explosion > 0f) explode(b);
                b.dead = true;
                continue;
            }
            for (int j = 0, m = enemies.size(); j < m; j++) {
                Enemy e = enemies.get(j);
                if (e.dead || b.hit.contains(e)) continue;
                float dx = e.x - b.x, dy = e.y - b.y;
                float r = e.radius + b.radius;
                if (dx * dx + dy * dy >= r * r) continue;

                if (b.explosion > 0f) {
                    explode(b);
                    b.dead = true;
                    break;
                }
                float sp = (float) Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                damageEnemy(e, b.damage, b.crit, b.vx / sp, b.vy / sp, b.knockback, b.burn, 0);
                b.hit.add(e);
                if (b.lightning) burst(e.x, e.y, 5, 0xFFFFF27A, 160f, 3f, 0.25f);
                if (b.bounce > 0) {
                    Enemy nt = nearestEnemy(e.x, e.y, 320f, b.hit);
                    if (nt != null) {
                        b.bounce--;
                        float a = (float) Math.atan2(nt.y - b.y, nt.x - b.x);
                        b.vx = (float) Math.cos(a) * sp;
                        b.vy = (float) Math.sin(a) * sp;
                        b.life = Math.max(b.life, 380f / sp + 0.1f);
                        break;
                    }
                    b.bounce = 0;
                }
                if (b.pierce > 0) {
                    b.pierce--;
                    continue;
                }
                b.dead = true;
                break;
            }
        }
    }

    private void explode(Bullet b) {
        float r = b.explosion;
        for (int i = 0, n = enemies.size(); i < n; i++) {
            Enemy e = enemies.get(i);
            if (e.dead) continue;
            float dx = e.x - b.x, dy = e.y - b.y;
            float rr = r + e.radius;
            float d2 = dx * dx + dy * dy;
            if (d2 < rr * rr) {
                float d = (float) Math.sqrt(d2) + 0.001f;
                damageEnemy(e, b.damage, b.crit, dx / d, dy / d, b.knockback, b.burn, 0);
            }
        }
        Particle ring = newParticle();
        if (ring != null) {
            ring.x = b.x;
            ring.y = b.y;
            ring.ring = true;
            ring.size = r;
            ring.life = ring.maxLife = 0.3f;
            ring.color = 0xFFFFB040;
        }
        burst(b.x, b.y, 14, 0xFFFF9A2A, 260f, 7f, 0.45f);
        shake = Math.max(shake, 4f);
        fx.sound(Fx.EXPLODE);
    }

    private void updateEnemyBullets(float dt) {
        Player p = player;
        for (int i = 0, n = enemyBullets.size(); i < n; i++) {
            Bullet b = enemyBullets.get(i);
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            if (b.life <= 0f || b.x < -30 || b.y < -30 || b.x > WORLD_W + 30 || b.y > WORLD_H + 30) {
                b.dead = true;
                continue;
            }
            float dx = p.x - b.x, dy = p.y - b.y;
            float r = p.radius * 0.8f + b.radius;
            if (dx * dx + dy * dy < r * r) {
                b.dead = true;
                damagePlayer(b.damage);
            }
        }
    }

    public void damageEnemy(Enemy e, int dmg, boolean crit, float kx, float ky, float kb,
                            int burn, int textColor) {
        if (e.dead) return;
        e.hp -= dmg;
        e.flash = 0.08f;
        if (!e.def.boss && kb > 0f) {
            float resist = e.def == EnemyDef.JOANINHA ? 0.4f : 1f;
            e.vx += kx * kb * 12f * resist;
            e.vy += ky * kb * 12f * resist;
        }
        int color = textColor != 0 ? textColor : crit ? 0xFFFFE14A : 0xFFFFFFFF;
        addText(e.x + (rng.nextFloat() - 0.5f) * 20f, e.y - e.radius, String.valueOf(dmg), color,
                crit ? 30 : 22);
        if (burn > 0) {
            e.burnTime = 2.1f;
            if (e.burnDamage < burn) e.burnDamage = burn;
            if (e.burnTick <= 0f) e.burnTick = 0.5f;
        }
        Player p = player;
        if (p.stats[Stat.LIFESTEAL] > 0 && p.hp < p.maxHp()
                && rng.nextInt(100) < p.stats[Stat.LIFESTEAL]) {
            p.heal(1f);
        }
        if (e.hp <= 0f) killEnemy(e);
        else fx.sound(Fx.HIT);
    }

    private void killEnemy(Enemy e) {
        e.dead = true;
        kills++;
        for (int i = 0; i < e.def.drops; i++) {
            float a = rng.nextFloat() * 6.2832f;
            float s = e.def.drops > 1 ? 60f + rng.nextFloat() * 180f : 20f;
            dropMaterial(e.x, e.y, (float) Math.cos(a) * s, (float) Math.sin(a) * s);
        }
        float fruitChance = 0.025f * Math.max(0.2f, 1f + player.stats[Stat.LUCK] / 100f);
        if (!e.def.boss && rng.nextFloat() < fruitChance) {
            Pickup f = new Pickup(Pickup.FRUIT, e.x, e.y, 3);
            pickups.add(f);
        }
        burst(e.x, e.y, e.def.boss ? 60 : 10, 0xFF9BD33A, e.def.boss ? 400f : 180f,
                e.def.boss ? 10f : 6f, 0.5f);
        fx.sound(Fx.KILL);
        if (e.def.boss) {
            if (boss == e) boss = null;
            shake = 16f;
            showBanner("CHEFÃO DERROTADO!");
            fx.vibrate(200);
        }
    }

    private void dropMaterial(float x, float y, float vx, float vy) {
        int count = 0;
        for (int i = 0, n = pickups.size(); i < n; i++) if (!pickups.get(i).dead) count++;
        if (count > 260) {
            // Muitas sementes no chao: junta o valor numa que ja existe.
            for (int tries = 0; tries < 10; tries++) {
                Pickup other = pickups.get(rng.nextInt(pickups.size()));
                if (!other.dead && other.type == Pickup.MATERIAL) {
                    other.value++;
                    return;
                }
            }
        }
        Pickup pk = new Pickup(Pickup.MATERIAL, x, y, 1);
        pk.vx = vx;
        pk.vy = vy;
        pk.bob = rng.nextFloat() * 6f;
        pickups.add(pk);
    }

    private void updatePickups(float dt) {
        Player p = player;
        float range = p.pickupRange();
        for (int i = 0, n = pickups.size(); i < n; i++) {
            Pickup pk = pickups.get(i);
            if (pk.dead) continue;
            pk.bob += dt;
            float dx = p.x - pk.x, dy = p.y - pk.y;
            float d = (float) Math.sqrt(dx * dx + dy * dy);
            if (!pk.attracted && d < range) pk.attracted = true;
            if (pk.attracted && d > 0.01f) {
                float sp = 700f;
                pk.vx = dx / d * sp;
                pk.vy = dy / d * sp;
            } else {
                float decay = Math.max(0f, 1f - dt * 6f);
                pk.vx *= decay;
                pk.vy *= decay;
            }
            pk.x = clamp(pk.x + pk.vx * dt, 10f, WORLD_W - 10f);
            pk.y = clamp(pk.y + pk.vy * dt, 10f, WORLD_H - 10f);
            if (d < p.radius + 12f) {
                pk.dead = true;
                if (pk.type == Pickup.MATERIAL) {
                    p.materials += pk.value;
                    addXp(pk.value);
                    fx.sound(Fx.PICKUP);
                } else {
                    p.heal(pk.value);
                    addText(p.x, p.y - 40, "+" + pk.value, 0xFF6BFF7A, 28);
                    fx.sound(Fx.LEVEL_UP);
                }
            }
        }
    }

    // --- Efeitos visuais ---

    private void updateEffects(float dt) {
        for (int i = particles.size() - 1; i >= 0; i--) {
            Particle pt = particles.get(i);
            pt.life -= dt;
            if (pt.life <= 0f) {
                particles.remove(i);
                continue;
            }
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            float decay = Math.max(0f, 1f - dt * 4f);
            pt.vx *= decay;
            pt.vy *= decay;
        }
        for (int i = texts.size() - 1; i >= 0; i--) {
            FloatText t = texts.get(i);
            t.life -= dt;
            if (t.life <= 0f) {
                texts.remove(i);
                continue;
            }
            t.y -= 50f * dt;
        }
    }

    private Particle newParticle() {
        if (particles.size() >= 500) return null;
        Particle p = new Particle();
        particles.add(p);
        return p;
    }

    void burst(float x, float y, int count, int color, float speed, float size, float life) {
        for (int i = 0; i < count; i++) {
            Particle p = newParticle();
            if (p == null) return;
            float a = rng.nextFloat() * 6.2832f;
            float s = speed * (0.3f + rng.nextFloat() * 0.7f);
            p.x = x;
            p.y = y;
            p.vx = (float) Math.cos(a) * s;
            p.vy = (float) Math.sin(a) * s;
            p.size = size * (0.6f + rng.nextFloat() * 0.6f);
            p.life = p.maxLife = life * (0.6f + rng.nextFloat() * 0.6f);
            p.color = color;
        }
    }

    void addText(float x, float y, String s, int color, float size) {
        if (texts.size() >= 60) texts.remove(0);
        FloatText t = new FloatText();
        t.x = x;
        t.y = y;
        t.text = s;
        t.color = color;
        t.size = size;
        t.life = t.maxLife = 0.7f;
        texts.add(t);
    }

    private void cleanup() {
        compactEnemies();
        compactBullets(bullets);
        compactBullets(enemyBullets);
        int j = 0;
        for (int i = 0, n = pickups.size(); i < n; i++) {
            Pickup p = pickups.get(i);
            if (!p.dead) pickups.set(j++, p);
        }
        trim(pickups, j);
    }

    private void compactEnemies() {
        int j = 0;
        for (int i = 0, n = enemies.size(); i < n; i++) {
            Enemy e = enemies.get(i);
            if (!e.dead) enemies.set(j++, e);
        }
        trim(enemies, j);
    }

    private static void compactBullets(ArrayList<Bullet> list) {
        int j = 0;
        for (int i = 0, n = list.size(); i < n; i++) {
            Bullet b = list.get(i);
            if (!b.dead) list.set(j++, b);
        }
        trim(list, j);
    }

    private static <T> void trim(ArrayList<T> list, int size) {
        for (int i = list.size() - 1; i >= size; i--) list.remove(i);
    }

    // --- Utilidades ---

    private Enemy nearestEnemy(float x, float y, float range, ArrayList<Enemy> exclude) {
        Enemy best = null;
        float bestD = Float.MAX_VALUE;
        for (int i = 0, n = enemies.size(); i < n; i++) {
            Enemy e = enemies.get(i);
            if (e.dead || (exclude != null && exclude.contains(e))) continue;
            float dx = e.x - x, dy = e.y - y;
            float d = (float) Math.sqrt(dx * dx + dy * dy) - e.radius;
            if (d < range && d < bestD) {
                bestD = d;
                best = e;
            }
        }
        return best;
    }

    static float clamp(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    static float lerpAngle(float a, float b, float t) {
        float diff = b - a;
        while (diff > Math.PI) diff -= (float) (Math.PI * 2);
        while (diff < -Math.PI) diff += (float) (Math.PI * 2);
        return a + diff * t;
    }
}
