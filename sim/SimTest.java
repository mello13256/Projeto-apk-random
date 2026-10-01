import com.escola.hortahostil.game.CharDef;
import com.escola.hortahostil.game.Enemy;
import com.escola.hortahostil.game.Game;
import com.escola.hortahostil.game.Player;
import com.escola.hortahostil.game.Shop;

import java.util.Random;

/**
 * Simulador que joga partidas sozinho (sem Android) para achar erros e
 * ter uma nocao do balanceamento. Rode com: ./build.sh sim
 */
public class SimTest {
    public static void main(String[] args) {
        int runs = args.length > 0 ? Integer.parseInt(args[0]) : 12;
        int diff = Integer.getInteger("diff", 1);
        int saves = 0, crates = 0, elites = 0;
        int wins = 0;
        long totalWave = 0;
        for (int r = 0; r < runs; r++) {
            CharDef c = CharDef.ALL[r % CharDef.ALL.length];
            Random rng = new Random(1000 + r);
            Game g = new Game(new Random(r));
            g.newRun(c, diff);
            int guard = 0;
            float bossTime = 0;
            StringBuilder log = new StringBuilder();
            while (g.state != Game.State.GAME_OVER && g.state != Game.State.VICTORY && guard++ < 2_000_000) {
                switch (g.state) {
                    case PLAYING: {
                        float[] j = bot(g);
                        g.update(1f / 60f, j[0], j[1]);
                        if (g.boss != null) bossTime += 1f / 60f;
                        break;
                    }
                    case CRATE:
                        crates++;
                        g.resolveCrate(rng.nextInt(3) != 0);
                        break;
                    case LEVEL_UP:
                        if (rng.nextInt(5) == 0 && g.player.materials > g.levelRerollCost() + 20) g.rerollLevel();
                        g.chooseLevel(rng.nextInt(4));
                        break;
                    case SHOP: {
                        // salvar e carregar tem que dar o mesmo resultado
                        String saved = g.saveToString();
                        Game copy = new Game(new Random(1));
                        if (!copy.loadFromString(saved) || !saved.equals(copy.saveToString())) {
                            throw new IllegalStateException("save/load falhou:\n" + saved);
                        }
                        saves++;
                        shop(g, rng);
                    }
                        log.append(String.format("  onda %2d: nv %2d, armas %d, itens %2d, mat %4d, hp %d, abates %d%n",
                                g.wave, g.player.level, g.player.weapons.size(), g.player.items.size(),
                                g.player.materials, g.player.maxHp(), g.kills));
                        g.nextWave();
                        break;
                    default:
                        throw new IllegalStateException("estado inesperado " + g.state);
                }
            }
            boolean won = g.state == Game.State.VICTORY;
            if (won) wins++;
            totalWave += g.wave;
            System.out.printf("%-18s -> %s na onda %d (abates %d, tempo c/ chefao %.1fs)%n",
                    c.name, won ? "VENCEU" : "morreu", g.wave, g.kills, bossTime);
            if (args.length > 1) System.out.print(log);
        }
        System.out.printf("Vitorias: %d/%d  onda media: %.1f  (dificuldade %s, %d saves testados, %d caixas)%n",
                wins, runs, totalWave / (float) runs, Game.DIFF_NAMES[diff], saves, crates);
    }

    /**
     * Jogador automatico simples: foge do que esta perto, vai atras de
     * sementes e, se nao ha perigo, se aproxima dos inimigos pra atacar.
     */
    static float[] bot(Game g) {
        Player p = g.player;
        float fx = 0, fy = 0;
        float danger = 0;
        Enemy nearest = null;
        float nearestD = Float.MAX_VALUE;
        for (Enemy e : g.enemies) {
            float dx = p.x - e.x, dy = p.y - e.y;
            float d = (float) Math.sqrt(dx * dx + dy * dy) + 0.1f;
            if (d < nearestD) {
                nearestD = d;
                nearest = e;
            }
            float safe = e.radius + p.radius + 70f;
            if (d < safe) {
                float w = (safe - d) / safe * 3f;
                fx += dx / d * w;
                fy += dy / d * w;
                danger += w;
            }
        }
        if (danger < 0.5f) {
            // Sem perigo: pega sementes ou chega perto do inimigo mais proximo.
            float bestD = Float.MAX_VALUE, tx = 0, ty = 0;
            for (var pk : g.pickups) {
                float dx = pk.x - p.x, dy = pk.y - p.y;
                float d = dx * dx + dy * dy;
                if (d < bestD) {
                    bestD = d;
                    tx = dx;
                    ty = dy;
                }
            }
            if (bestD < 400f * 400f) {
                float d = (float) Math.sqrt(bestD) + 0.1f;
                fx += tx / d;
                fy += ty / d;
            } else if (nearest != null) {
                float want = p.weapons.get(0).range(p) * 0.6f + nearest.radius;
                float dx = nearest.x - p.x, dy = nearest.y - p.y;
                if (nearestD > want) {
                    fx += dx / nearestD;
                    fy += dy / nearestD;
                }
            }
        }
        for (int i = 0; i < g.enemyBullets.size(); i++) {
            var b = g.enemyBullets.get(i);
            float dx = p.x - b.x, dy = p.y - b.y;
            float d2 = dx * dx + dy * dy + 1f;
            float w = 6000f / d2;
            fx += dx / (float) Math.sqrt(d2) * w;
            fy += dy / (float) Math.sqrt(d2) * w;
        }
        fx += (Game.WORLD_W / 2 - p.x) / 900f;
        fy += (Game.WORLD_H / 2 - p.y) / 900f;
        return new float[]{fx, fy};
    }

    static void shop(Game g, Random rng) {
        for (int pass = 0; pass < 3; pass++) {
            for (int i = 0; i < Shop.SLOTS; i++) {
                if (g.checkBuy(i) == Game.BUY_OK) g.buy(i);
            }
            for (int i = 0; i < g.player.weapons.size(); i++) {
                if (g.canCombine(i)) g.combineWeapon(i);
            }
            if (g.player.materials > g.shopRerollCost() + 30) g.rerollShop();
        }
        if (rng.nextInt(10) == 0 && g.offers[0] != null) g.toggleLock(0);
        if (rng.nextInt(20) == 0 && g.canSell(0)) g.sellWeapon(0);
    }
}
