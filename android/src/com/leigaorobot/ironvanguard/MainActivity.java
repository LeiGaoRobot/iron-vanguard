package com.leigaorobot.ironvanguard;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Full-screen WebView shell for the single-file web build.
 *
 * The page is served from the APK's assets/www/ under a fake https origin
 * (https://appassets.androidplatform.net/) so ES modules, localStorage and WebGL2
 * behave like on a normal secure site. Every other request is blocked: the game
 * is fully offline and the APK has no INTERNET permission.
 */
public class MainActivity extends Activity {
    private static final String TAG = "IronVanguard";
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";

    private WebView web;
    private long lastBackAt = 0;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        w.setBackgroundDrawableResource(android.R.color.black);

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);   // everything is local; no stale copies after an update

        web.addJavascriptInterface(new Shell(), "IVShell");   // only local assets are ever loaded
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                Log.println(m.messageLevel() == ConsoleMessage.MessageLevel.ERROR ? Log.ERROR : Log.INFO,
                        TAG, m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });

        setContentView(web);
        if (state != null) web.restoreState(state);
        if (web.getUrl() == null) web.loadUrl(START_URL);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    /** Back: pause in a mission, close panels elsewhere, double-press on the title screen to quit. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(function(){try{return window.__iv?__iv.state():'loading'}catch(e){return 'error'}})()", (v) -> {
            String st = v == null ? "" : v.replace("\"", "");
            if (st.equals("play")) {
                web.evaluateJavascript("__iv.setState('pause')", null);
            } else if (st.equals("title") || st.equals("loading") || st.equals("error") || st.isEmpty()) {
                long now = System.currentTimeMillis();
                if (now - lastBackAt < 2000) { finish(); return; }
                lastBackAt = now;
                Toast.makeText(this, isZh() ? "再按一次退出" : "Press back again to quit", Toast.LENGTH_SHORT).show();
            } else {
                // pause -> resume (Escape), other screens -> press the page's own back button
                web.evaluateJavascript("(function(){var s=__iv.state();"
                        + "var b={medals:'mBack',garage:'gBack',result:'rGarage'}[s];"
                        + "if(b){var e=document.getElementById(b);if(e)e.click();return;}"
                        + "var o={key:'Escape',code:'Escape',bubbles:true};"
                        + "dispatchEvent(new KeyboardEvent('keydown',o));dispatchEvent(new KeyboardEvent('keyup',o));})()", null);
            }
        });
    }

    private boolean isZh() {
        return getResources().getConfiguration().getLocales().get(0).getLanguage().startsWith("zh");
    }

    @Override protected void onPause() { super.onPause(); if (web != null) { web.onPause(); web.pauseTimers(); } }
    @Override protected void onResume() { super.onResume(); if (web != null) { web.resumeTimers(); web.onResume(); } hideSystemBars(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); if (web != null) web.saveState(out); }
    @Override protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }

    /** Called by the page's start-up check (build_apk.py) when the system WebView is too old. */
    private class Shell {
        @JavascriptInterface
        public String webViewVersion() {
            PackageInfo p = WebView.getCurrentWebViewPackage();
            return p == null ? "" : p.packageName + " " + p.versionName;
        }

        @JavascriptInterface
        public void openWebViewUpdate() {
            runOnUiThread(() -> {
                PackageInfo p = WebView.getCurrentWebViewPackage();
                String pkg = p != null ? p.packageName : "com.google.android.webview";
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
                } catch (ActivityNotFoundException e) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
                    } catch (ActivityNotFoundException e2) {
                        Toast.makeText(MainActivity.this, isZh() ? "请在应用商店中更新 Android System WebView" : "Update Android System WebView from your app store", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }
    }

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html"); MIME.put("js", "text/javascript"); MIME.put("css", "text/css");
        MIME.put("json", "application/json"); MIME.put("glb", "model/gltf-binary"); MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg"); MIME.put("woff2", "font/woff2"); MIME.put("wasm", "application/wasm");
        MIME.put("svg", "image/svg+xml");
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            return !HOST.equals(r.getUrl().getHost());   // never navigate away from the game
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            String scheme = u.getScheme();
            if (scheme == null || scheme.equals("data") || scheme.equals("blob")) return null;   // handled by WebView itself
            if (!HOST.equals(u.getHost())) {
                Log.w(TAG, "blocked " + u);
                return blocked();
            }
            String path = u.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            if (path.contains("..")) return blocked();
            try {
                InputStream in = getAssets().open("www" + path);
                int dot = path.lastIndexOf('.');
                String mime = MIME.get(dot < 0 ? "" : path.substring(dot + 1).toLowerCase());
                if (mime == null) mime = "application/octet-stream";
                String enc = mime.startsWith("text/") || mime.endsWith("json") ? "utf-8" : null;
                WebResourceResponse res = new WebResourceResponse(mime, enc, in);
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-store");
                h.put("Access-Control-Allow-Origin", "*");
                res.setResponseHeaders(h);
                return res;
            } catch (IOException e) {
                Log.w(TAG, "missing asset " + path);
                return blocked();
            }
        }

        private WebResourceResponse blocked() {
            WebResourceResponse res = new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            res.setStatusCodeAndReasonPhrase(404, "Not Found");
            return res;
        }

        @Override
        public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
            // The GPU-heavy renderer can be killed under memory pressure; rebuild instead of crashing the app.
            Log.e(TAG, "renderer gone, crashed=" + d.didCrash());
            if (web != null) { ((android.view.ViewGroup) web.getParent()).removeView(web); web.destroy(); web = null; }
            recreate();
            return true;
        }
    }
}
