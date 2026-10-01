package com.escola.hortahostil;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/**
 * O app Android roda o MESMO jogo do site (pasta pwa/), embutido no APK e funcionando sem
 * internet. Assim o app tem tudo: classes novas, multiplayer, PvP, ranking, contas e enquetes.
 * O Java só cuida da janela, do botão voltar, da vibração e de abrir links no navegador.
 */
public final class MainActivity extends Activity {
    private static final String START_URL = "file:///android_asset/www/index.html";
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        web = new WebView(this);
        web.setBackgroundColor(0xFF121A0D);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                    // localStorage: recordes e partida salva
        s.setMediaPlaybackRequiresUserGesture(false);    // sons e música
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);     // ranking/multiplayer no Firebase a partir do arquivo local
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(), "HortaAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) return false;
                openUrl(u.toString());
                return true;
            }
        });
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
        hideSystemUi();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    /** Voltar: o jogo decide (fecha janelas, pausa, volta ao menu); no menu, sai do app. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("window.hortaBack ? hortaBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"true".equals(handled)) finish();
            }
        });
    }

    private void openUrl(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
            // nenhum navegador instalado
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    /** Funções que o JavaScript do jogo pode chamar (window.HortaAndroid). */
    private final class Bridge {
        @JavascriptInterface
        public void openUrl(final String url) {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.openUrl(url);
                }
            });
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) v.vibrate(Math.max(1, Math.min(ms, 1000)));
            } catch (Exception ignored) {
                // sem vibração
            }
        }

        /** Recordes do app antigo (versão em Java), para não perder o progresso ao atualizar. */
        @JavascriptInterface
        public String legacy() {
            try {
                SharedPreferences sp = getSharedPreferences("horta_hostil", Context.MODE_PRIVATE);
                if (!sp.contains("best_wave") && !sp.contains("total_kills")) return "";
                JSONObject o = new JSONObject();
                o.put("bestWave", sp.getInt("best_wave", 0));
                o.put("wins", sp.getInt("wins", 0));
                o.put("totalKills", sp.getInt("total_kills", 0));
                o.put("bestDiffWon", sp.getInt("best_diff_won", -1));
                o.put("playerName", sp.getString("player_name", ""));
                o.put("sound", sp.getBoolean("sound", true));
                o.put("music", sp.getBoolean("music", true));
                return o.toString();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }
    }
}
