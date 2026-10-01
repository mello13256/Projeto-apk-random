package com.escola.hortahostil;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;

/**
 * Ranking online (Firebase Realtime Database pela API REST, sem bibliotecas).
 * Cada dificuldade tem sua lista: /ranking/d0 (Fácil) ... /ranking/d3 (Pesadelo).
 * Tudo roda numa thread separada; o resultado volta pelo Callback.
 */
final class Ranking {
    static final String URL_BASE =
            "https://horta-hostil-default-rtdb.europe-west1.firebasedatabase.app/ranking";

    interface Callback<T> {
        void done(T result, String error);
    }

    private Ranking() {
    }

    static long scoreOf(boolean won, int wave, int kills) {
        return (won ? 100000000L : 0L) + wave * 1000000L + kills;
    }

    /** Mesmas regras do banco: 2 a 16 caracteres, sem símbolos perigosos. */
    static boolean validName(String n) {
        if (n == null || n.length() < 2 || n.length() > 16 || !n.equals(n.trim())) return false;
        for (int i = 0; i < n.length(); i++) {
            if ("<>&{}\"\\".indexOf(n.charAt(i)) >= 0) return false;
        }
        return true;
    }

    /** Busca os 20 melhores de uma dificuldade (ordem decrescente). */
    static void top(final int diff, final Callback<ArrayList<Ui.RankEntry>> cb) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String body = request("GET", URL_BASE + "/d" + diff
                            + ".json?orderBy=%22score%22&limitToLast=20", null);
                    ArrayList<Ui.RankEntry> list = new ArrayList<>();
                    if (body != null && !body.trim().equals("null")) {
                        JSONObject all = new JSONObject(body);
                        Iterator<String> keys = all.keys();
                        while (keys.hasNext()) {
                            String id = keys.next();
                            JSONObject o = all.getJSONObject(id);
                            Ui.RankEntry e = new Ui.RankEntry();
                            e.id = id;
                            e.name = o.optString("name", "?");
                            e.character = o.optInt("character", -1);
                            e.wave = o.optInt("wave", 0);
                            e.won = o.optBoolean("won", false);
                            e.kills = o.optInt("kills", 0);
                            e.platform = o.optString("platform", "web");
                            e.score = o.optLong("score", 0);
                            e.createdAt = o.optLong("createdAt", 0);
                            list.add(e);
                        }
                    }
                    Collections.sort(list, new Comparator<Ui.RankEntry>() {
                        @Override
                        public int compare(Ui.RankEntry a, Ui.RankEntry b) {
                            if (a.score != b.score) return a.score > b.score ? -1 : 1;
                            return Long.compare(a.createdAt, b.createdAt);
                        }
                    });
                    cb.done(list, null);
                } catch (Exception ex) {
                    cb.done(null, "Não deu pra falar com o ranking. Confira a internet e toque em Atualizar.");
                }
            }
        }, "ranking-get").start();
    }

    /** Envia uma partida; devolve o id criado. */
    static void submit(final int diff, final String name, final int character, final int wave,
                       final boolean won, final int kills, final int level, final Callback<String> cb) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject o = new JSONObject();
                    o.put("name", name);
                    o.put("character", character);
                    o.put("wave", wave);
                    o.put("won", won);
                    o.put("kills", kills);
                    o.put("level", level);
                    o.put("platform", "android");
                    o.put("score", scoreOf(won, wave, kills));
                    o.put("createdAt", new JSONObject().put(".sv", "timestamp")); // hora do servidor
                    String body = request("POST", URL_BASE + "/d" + diff + ".json", o.toString());
                    cb.done(new JSONObject(body).getString("name"), null);
                } catch (Exception ex) {
                    cb.done(null, "Não deu pra enviar. Confira a internet e tente de novo.");
                }
            }
        }, "ranking-post").start();
    }

    private static String request(String method, String url, String json) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setRequestMethod(method);
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            if (json != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                OutputStream out = c.getOutputStream();
                out.write(json.getBytes("UTF-8"));
                out.close();
            }
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[4096];
            int n;
            while ((n = in.read(b)) > 0) buf.write(b, 0, n);
            in.close();
            return buf.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }
}
