"""Bundle site/ into single-file builds.

  python build_dist.py

  dist/index.html     standalone: inline import map (three + addons as data: URLs) + inline modules + kit.glb data URI
  dist/artifact.html  body-only variant for claude.ai Artifacts (three + addons from jsDelivr +esm bundles)
"""
import base64, os, re, json, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, 'site'); DIST = os.path.join(ROOT, 'dist'); VENDOR = os.path.join(ROOT, 'vendor')
os.makedirs(DIST, exist_ok=True); os.makedirs(VENDOR, exist_ok=True)
THREE = 'https://cdn.jsdelivr.net/npm/three@0.184.0'
MODULES = ['kit.js', 'fx.js', 'audio.js', 'world.js', 'mech.js', 'combat.js']   # dependency order; main.js last

def read(p):
    with open(p, encoding='utf-8') as f: return f.read()

html = read(os.path.join(SITE, 'index.html'))
srcs = {m: read(os.path.join(SITE, m)) for m in MODULES + ['main.js']}
glb = open(os.path.join(SITE, 'assets', 'kit.glb'), 'rb').read()
glb_uri = 'data:model/gltf-binary;base64,' + base64.b64encode(glb).decode('ascii')

def strip_imports(src): return re.sub(r"^import [^;]*?;\s*$", '', src, flags=re.M | re.S)
def exported_names(src): return re.findall(r"^export (?:const|let|async function|function|class) (\w+)", src, flags=re.M)
def as_iife(src, label):
    assert not re.search(r"^export \{", src, flags=re.M), 'unsupported export list in ' + label
    names = exported_names(src)
    body = re.sub(r"^export (?=(?:const|let|async function|function|class) )", '', strip_imports(src), flags=re.M)
    return f"// ---------------- {label} ----------------\nconst {{ {', '.join(names)} }} = (() => {{\n{body}\nreturn {{ {', '.join(names)} }};\n}})();\n"

ADDONS = list(dict.fromkeys(re.findall(r"^import (.+?) from 'three/addons/(.+?)';", '\n'.join(srcs.values()), flags=re.M)))
for m, s in srcs.items():   # local imports must only be ./x.js modules we bundle
    for path in re.findall(r"from '\./([\w.]+?)(?:\?[^']*)?';", s): assert path in MODULES, (m, path)

def bundle(esm):
    lines = [f"import * as THREE from '{THREE}/+esm';" if esm else "import * as THREE from 'three';"]
    seen = set()
    for what, path in ADDONS:
        key = (what, path)
        if key in seen: continue
        seen.add(key)
        lines.append(f"import {what} from '{THREE}/examples/jsm/{path}/+esm';" if esm else f"import {what} from 'three/addons/{path}';")
    head = '\n'.join(lines) + f"\nwindow.__MA_KIT = '{glb_uri}';\n"
    return head + ''.join(as_iife(srcs[m], m) for m in MODULES) + "// ---------------- main.js ----------------\n" + strip_imports(srcs['main.js'])

def fetch(url, name):
    path = os.path.join(VENDOR, name)
    if not os.path.exists(path):
        print('fetching', url)
        with open(path, 'wb') as f: f.write(urllib.request.urlopen(url, timeout=60).read())
    return read(path)
def data_url(js): return 'data:text/javascript;base64,' + base64.b64encode(js.encode('utf-8')).decode('ascii')

three_src = fetch(THREE + '/+esm', 'three.esm.js')
imports = {'three': data_url(three_src)}
for _, path in ADDONS:
    src = fetch(THREE + '/examples/jsm/' + path + '/+esm', path.replace('/', '__') + '.esm.js')
    src = src.replace('"/npm/three@0.184.0/+esm"', '"three"').replace("'/npm/three@0.184.0/+esm'", "'three'")
    assert not re.search(r"from\s*[\"']/npm/", src), 'unexpected external import in ' + path
    imports['three/addons/' + path] = data_url(src)
inline_importmap = '<script type="importmap">\n' + json.dumps({'imports': imports}) + '\n</script>\n'

main_tag = re.search(r'<script type="module" src="\./main\.js[^"]*"></script>', html).group(0)
im_block = re.search(r'<script type="importmap">.*?</script>\s*', html, flags=re.S).group(0)
full = html.replace(im_block, inline_importmap).replace(main_tag, '<script type="module">\n' + bundle(False) + '\n</script>')
with open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8') as f: f.write(full)

body = re.search(r'<body>(.*)</body>', html, flags=re.S).group(1).replace(main_tag, '<script type="module">\n' + bundle(True) + '\n</script>')
head_bits = re.search(r'<head>(.*)</head>', html, flags=re.S).group(1)
title = re.search(r'<title>.*?</title>', head_bits).group(0)
style = re.search(r'<style>.*?</style>', head_bits, flags=re.S).group(0)
fonts = '\n'.join(re.findall(r'<link rel="preconnect"[^>]*>|<link href="https://fonts.googleapis.com[^>]*>', head_bits))
style = style.replace('html, body { margin: 0; height: 100%;', 'html, body { margin: 0; height: 100%; min-height: 100vh;')
with open(os.path.join(DIST, 'artifact.html'), 'w', encoding='utf-8') as f: f.write(f"{title}\n{fonts}\n{style}\n{body}")
print('addons:', [p for _, p in ADDONS])
for n in ('index.html', 'artifact.html'): print('dist/%s %.2f MB' % (n, os.path.getsize(os.path.join(DIST, n)) / 1e6))
