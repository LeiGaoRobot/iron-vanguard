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


def patch_html(src):
    html = open(src, encoding='utf-8').read()
    # Google Fonts -> bundled Rajdhani (the APK is offline; a blocked stylesheet would also stall first paint)
    html = re.sub(r'<link rel="preconnect" href="https://fonts\.g[^>]*>\s*', '', html)
    html = re.sub(r'<link href="https://fonts\.googleapis\.com[^>]*>\s*', '', html)
    fonts = open(os.path.join(HERE, 'fonts', 'rajdhani.local.css'), encoding='utf-8').read()
    html = html.replace('</head>', '<style>\n' + fonts + MOBILE_CSS + '</style>\n' + MOBILE_JS + '</head>', 1)
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
