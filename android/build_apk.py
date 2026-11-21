"""Package the single-file web build into a signed Android APK (no Gradle, no Android Studio).

  python android/build_apk.py                     # packs docs/index.html (the released build)
  python android/build_apk.py --src dist/index.html
  python android/build_apk.py --code 2 --name 1.0.1

Needs: JDK 17+ on PATH, Android SDK with build-tools 36.1.0 + platforms/android-36
(default D:/AI/tools/android-sdk, override with ANDROID_HOME).
Output: android/out/IronVanguard-<versionName>.apk
The release keystore is created on first run in android/keystore/ (git-ignored).
BACK IT UP: TapTap only accepts updates signed with the same key.
"""
import argparse, glob, json, os, re, secrets, shutil, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SDK = os.environ.get('ANDROID_HOME') or 'D:/AI/tools/android-sdk'
BT = os.path.join(SDK, 'build-tools', '36.1.0')
ANDROID_JAR = os.path.join(SDK, 'platforms', 'android-36', 'android.jar')
MIN_SDK, TARGET_SDK = 26, 35
BUILD = os.path.join(HERE, 'build'); OUT = os.path.join(HERE, 'out'); KEYDIR = os.path.join(HERE, 'keystore')
ALIAS = 'ironvanguard'


def run(*cmd, **kw):
    print('>', ' '.join(os.path.basename(c) if i == 0 else c for i, c in enumerate(cmd))[:200])
    r = subprocess.run(list(cmd), capture_output=True, text=True, **kw)
    if r.returncode:
        print(r.stdout, r.stderr); sys.exit('failed: ' + cmd[0])
    return r.stdout


def tool(name):
    for ext in ('.exe', '.bat', ''):
        p = os.path.join(BT, name + ext)
        if os.path.exists(p): return p
    sys.exit('missing build tool ' + name + ' in ' + BT)


# The menus (title / garage / medals / pause / result) are laid out for a 1280x720 desktop.
# A phone in landscape is ~360-430 CSS px tall, so each visible overlay card is zoomed down
# to fit the screen, and the keyboard/mouse help block is hidden (touch controls are shown in-game).
MOBILE_CSS = """
html.apk #title .keys, html.apk #title .keys + div { display: none; }
"""
MOBILE_JS = """<script>
document.documentElement.classList.add('apk');
(function () {
  function fit() {
    var ov = document.querySelectorAll('.overlay');
    for (var i = 0; i < ov.length; i++) {
      var o = ov[i], c = o.firstElementChild;
      if (!c || o.classList.contains('hidden')) continue;
      if (o.id === 'garage' || o.id === 'medals') {   // long pages that scroll anyway: just scale them down
        c.style.zoom = Math.max(0.6, Math.min(1, innerHeight / 640, innerWidth / 1280 * 1.4)).toFixed(3);
        continue;
      }
      c.style.zoom = 1;   // measure at natural size, then zoom in the same task (no flicker)
      var s = getComputedStyle(o);
      var ah = innerHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) - 4;
      var aw = innerWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - 4;
      var z = Math.min(1, ah / c.scrollHeight, aw / c.scrollWidth);
      c.style.zoom = z.toFixed(3);
    }
  }
  addEventListener('resize', fit);
  setInterval(fit, 400);
  addEventListener('DOMContentLoaded', fit);
})();
</script>
"""


# Start-up check, plain ES5 so it runs on any WebView. The game needs import maps (Chrome 89),
# DecompressionStream (80, for the gzip-embedded GLBs) and WebGL2. If any is missing, a full-screen
# notice replaces the black screen and offers to open the WebView page in the app store
# (through the IVShell bridge in MainActivity). Add ?ivcheck=1 to the URL to force it for testing.
MIN_CHROME = 89
CHECK_JS = """<script>
(function () {
  var m = /Chrome\/(\d+)/.exec(navigator.userAgent), ver = m ? +m[1] : 0, why = [];
  if (ver && ver < MINV) why.push('v');
  if (typeof DecompressionStream === 'undefined') why.push('v');
  var gl = null;
  try { gl = document.createElement('canvas').getContext('webgl2'); } catch (e) {}
  if (!gl) why.push('gl');
  else { var x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
  var force = /[?&]ivcheck=(\w+)/.exec(location.search);
  if (force) why = [force[1] === 'gl' ? 'gl' : 'v'];
  if (!why.length) return;
  window.__ivUnsupported = why;
  var zh = /^zh/i.test(navigator.language || ''), sh = window.IVShell, old = why.indexOf('v') >= 0;
  var wv = ''; try { wv = sh ? sh.webViewVersion() : ''; } catch (e) {}
  var t = zh ? {
    h: old ? '系统 WebView 版本过旧' : '设备不支持 WebGL2',
    p: old ? '《钢翼先锋》需要 Android System WebView MINV 或更高版本。请在应用商店中更新后重新打开游戏。'
           : '这台设备的图形驱动无法创建 WebGL2 画面。更新 Android System WebView 有时能解决，否则这台设备暂时无法运行本游戏。',
    c: '当前：', b: '去应用商店更新', k: '仍然尝试'
  } : {
    h: old ? 'System WebView is too old' : 'WebGL2 is not available',
    p: old ? 'Iron Vanguard needs Android System WebView MINV or newer. Update it from your app store, then reopen the game.'
           : 'The graphics driver on this device could not create a WebGL2 context. Updating Android System WebView sometimes helps; otherwise this device cannot run the game yet.',
    c: 'Current: ', b: 'Update in app store', k: 'Try anyway'
  };
  function show() {
    var d = document.createElement('div');
    d.id = 'ivUnsupported';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#0b0f14;color:#dfe8f0;display:flex;'
      + 'align-items:center;justify-content:center;font:15px/1.5 Rajdhani,system-ui,sans-serif;padding:16px;box-sizing:border-box';
    d.innerHTML = '<div style="max-width:520px;text-align:center">'
      + '<div class="h" style="font-size:22px;font-weight:700;color:#ffb347;margin-bottom:8px"></div><div class="p"></div>'
      + '<div class="c" style="opacity:.55;font-size:12px;margin-top:8px"></div>'
      + '<div style="margin-top:16px">'
      + '<button class="b" style="margin:4px;padding:10px 18px;border:0;border-radius:6px;background:#2f8fff;color:#fff;font:inherit;font-weight:700"></button>'
      + '<button class="k" style="margin:4px;padding:10px 18px;border:1px solid #4a5866;border-radius:6px;background:none;color:#9fb0c0;font:inherit"></button>'
      + '</div></div>';
    d.querySelector('.h').textContent = t.h;
    d.querySelector('.p').textContent = t.p;
    d.querySelector('.c').textContent = t.c + (wv || (ver ? 'Chrome ' + ver : '?'));
    var b = d.querySelector('.b'), k = d.querySelector('.k');
    b.textContent = t.b; k.textContent = t.k;
    if (!sh) b.style.display = 'none';
    b.onclick = function () { try { sh.openWebViewUpdate(); } catch (e) {} };
    k.onclick = function () { d.parentNode.removeChild(d); };
    document.body.appendChild(d);
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
</script>
""".replace('MINV', str(MIN_CHROME))


def patch_html(src):
    html = open(src, encoding='utf-8').read()
    # Google Fonts -> bundled Rajdhani (the APK is offline; a blocked stylesheet would also stall first paint)
    html = re.sub(r'<link rel="preconnect" href="https://fonts\.g[^>]*>\s*', '', html)
    html = re.sub(r'<link href="https://fonts\.googleapis\.com[^>]*>\s*', '', html)
    fonts = open(os.path.join(HERE, 'fonts', 'rajdhani.local.css'), encoding='utf-8').read()
    html = html.replace('</head>', CHECK_JS + '<style>\n' + fonts + MOBILE_CSS + '</style>\n' + MOBILE_JS + '</head>', 1)
    html = html.replace('content="width=device-width, initial-scale=1"',
                        'content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"', 1)
    left = sorted(set(u for u in re.findall(r'https?://[\w.-]+', html) if '127.0.0.1' not in u))
    if left: print('WARNING: external hosts still referenced (blocked at runtime):', left)
    return html


def make_icons(res):
    from PIL import Image
    src = Image.open(os.path.join(ROOT, 'wechat', 'icon', 'icon_512.png')).convert('RGBA')
    for d, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        os.makedirs(os.path.join(res, 'mipmap-' + d), exist_ok=True)
        src.resize((px, px), Image.LANCZOS).save(os.path.join(res, 'mipmap-' + d, 'ic_launcher.png'))


def keystore():
    os.makedirs(KEYDIR, exist_ok=True)
    jks, props = os.path.join(KEYDIR, 'release.jks'), os.path.join(KEYDIR, 'keystore.properties')
    if not os.path.exists(jks):
        pw = secrets.token_urlsafe(24)
        run('keytool', '-genkeypair', '-keystore', jks, '-storetype', 'PKCS12', '-alias', ALIAS,
            '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
            '-dname', 'CN=Iron Vanguard, O=Iron Vanguard', '-storepass:env', 'IV_KS_PASS', '-keypass:env', 'IV_KS_PASS',
            env={**os.environ, 'IV_KS_PASS': pw})
        with open(props, 'w') as f: f.write(f'storeFile=release.jks\nkeyAlias={ALIAS}\nstorePassword={pw}\n')
        print('created release keystore at', jks, '- back up the whole keystore/ folder')
    pw = re.search(r'storePassword=(\S+)', open(props).read()).group(1)
    return jks, pw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.join(ROOT, 'docs', 'index.html'))
    ap.add_argument('--code', type=int); ap.add_argument('--name')
    a = ap.parse_args()
    ver = json.load(open(os.path.join(HERE, 'version.json')))
    code, name = a.code or ver['versionCode'], a.name or ver['versionName']
    for p in (BT, ANDROID_JAR): assert os.path.exists(p), 'Android SDK piece missing: ' + p

    shutil.rmtree(BUILD, ignore_errors=True)
    www = os.path.join(BUILD, 'assets', 'www'); os.makedirs(os.path.join(www, 'fonts'))
    with open(os.path.join(www, 'index.html'), 'w', encoding='utf-8') as f: f.write(patch_html(a.src))
    for w in glob.glob(os.path.join(HERE, 'fonts', '*.woff2')): shutil.copy(w, os.path.join(www, 'fonts'))
    res = os.path.join(BUILD, 'res'); shutil.copytree(os.path.join(HERE, 'res'), res); make_icons(res)

    aapt2 = tool('aapt2')
    run(aapt2, 'compile', '--dir', res, '-o', os.path.join(BUILD, 'res.zip'))
    base = os.path.join(BUILD, 'base.apk')
    run(aapt2, 'link', '-o', base, '-I', ANDROID_JAR, '--manifest', os.path.join(HERE, 'AndroidManifest.xml'),
        '--min-sdk-version', str(MIN_SDK), '--target-sdk-version', str(TARGET_SDK),
        '--version-code', str(code), '--version-name', name, '-A', os.path.join(BUILD, 'assets'),
        os.path.join(BUILD, 'res.zip'))

    classes = os.path.join(BUILD, 'classes'); os.makedirs(classes)
    javas = glob.glob(os.path.join(HERE, 'src', '**', '*.java'), recursive=True)
    run('javac', '--release', '11', '-Xlint:-options', '-encoding', 'utf-8', '-cp', ANDROID_JAR, '-d', classes, *javas)
    dex = os.path.join(BUILD, 'dex'); os.makedirs(dex)
    run(tool('d8'), '--release', '--min-api', str(MIN_SDK), '--lib', ANDROID_JAR, '--output', dex,
        *glob.glob(os.path.join(classes, '**', '*.class'), recursive=True))
    with zipfile.ZipFile(base, 'a', zipfile.ZIP_DEFLATED) as z: z.write(os.path.join(dex, 'classes.dex'), 'classes.dex')

    aligned = os.path.join(BUILD, 'aligned.apk')
    run(tool('zipalign'), '-f', '-p', '4', base, aligned)
    jks, pw = keystore()
    os.makedirs(OUT, exist_ok=True)
    final = os.path.join(OUT, f'IronVanguard-{name}.apk')
    run(tool('apksigner'), 'sign', '--ks', jks, '--ks-key-alias', ALIAS, '--ks-pass', 'env:IV_KS_PASS',
        '--out', final, aligned, env={**os.environ, 'IV_KS_PASS': pw})
    print(run(tool('apksigner'), 'verify', '--print-certs', final).strip().splitlines()[0])
    print('%s  %.2f MB  versionCode %d' % (final, os.path.getsize(final) / 1e6, code))


if __name__ == '__main__':
    main()
