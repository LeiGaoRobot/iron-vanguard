// Fake WeChat mini-game runtime inside a Web Worker (no DOM). Loads ../minigame/game.js unchanged.
/* eslint-env worker */
const store = new Map();
const cbs = { touchstart: [], touchmove: [], touchend: [], touchcancel: [] };
let resizeCb = null, screen = null, info = null;

const post = (text) => self.postMessage({ type: 'log', text: String(text).slice(0, 300) });
const cerr = console.error.bind(console);
console.error = (...a) => { cerr(...a); post('console.error: ' + a.map((x) => (x && x.stack) || x).join(' ')); };
self.addEventListener('error', (e) => post('error: ' + e.message + ' @' + e.lineno));
self.addEventListener('unhandledrejection', (e) => post('rejection: ' + ((e.reason && e.reason.stack) || e.reason)));

function makeWx(m) {
  let first = m.canvas;
  return {
    getSystemInfoSync: () => ({ ...info, platform: 'devtools', language: 'zh_CN', SDKVersion: 'sim' }),
    createCanvas: () => { if (first) { const c = first; first = null; screen = c; return c; } return new OffscreenCanvas(1, 1); },
    createImage: () => ({ set src(v) { this._src = v; } }),
    getStorageSync: (k) => (store.has(k) ? store.get(k) : ''),
    setStorageSync: (k, v) => { store.set(k, v); },
    removeStorageSync: (k) => { store.delete(k); },
    clearStorageSync: () => store.clear(),
    getFileSystemManager: () => ({ readFileSync: (p) => { if (p === 'assets/kit.glb') return m.glb; throw new Error('no such file ' + p); } }),
    loadSubpackage: ({ name, success, fail }) => { setTimeout(() => (name === 'assets' ? success() : fail({ errMsg: 'no subpackage ' + name })), 30); return { onProgressUpdate() {} }; },
    onTouchStart: (f) => cbs.touchstart.push(f),
    onTouchMove: (f) => cbs.touchmove.push(f),
    onTouchEnd: (f) => cbs.touchend.push(f),
    onTouchCancel: (f) => cbs.touchcancel.push(f),
    onWindowResize: (f) => { resizeCb = f; },
    onHide() {}, onShow() {},
    // no createWebAudioContext: workers have no Web Audio, so the game runs silent here
  };
}

// test helper: render one frame (HUD included) and POST it to the screenshot server
self.shot = async (name) => {
  self.__iv.step(1);
  const blob = await screen.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
  const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  return fetch('http://127.0.0.1:8212/', { method: 'POST', body: JSON.stringify({ name, data }) }).then((r) => r.text()).catch((e) => 'ERR ' + e);
};
self.tap = (ev, pts) => { const t = pts.map(([x, y], i) => ({ identifier: 200 + i, clientX: x, clientY: y })); for (const f of cbs[ev]) f({ touches: ev === 'touchend' ? [] : t, changedTouches: t }); };

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'boot') {
    info = { windowWidth: m.w, windowHeight: m.h, pixelRatio: m.dpr };
    self.GameGlobal = self; self.wx = makeWx(m);
    try { importScripts('../minigame/game.js?t=' + Date.now()); post('game.js loaded'); } catch (err) { post('boot failed: ' + (err.stack || err)); }
  } else if (m.type === 'touch') {
    for (const f of cbs[m.ev]) f({ touches: m.touches, changedTouches: m.changedTouches });
  } else if (m.type === 'resize') {
    info.windowWidth = m.w; info.windowHeight = m.h;
    if (resizeCb) resizeCb({ windowWidth: m.w, windowHeight: m.h });
  } else if (m.type === 'eval') {
    let value;
    try { value = await new Function('return (async () => {' + m.code + '\n})()')(); value = JSON.parse(JSON.stringify(value === undefined ? null : value)); }
    catch (err) { value = { error: String((err && err.stack) || err) }; }
    self.postMessage({ type: 'reply', id: m.id, value });
  }
};
