// Minimal browser shim for the WeChat mini-game runtime (no DOM, no window).
// Only what Iron Vanguard + three.js touch: a fake DOM tree whose elements keep their text / classes
// (so the canvas HUD can mirror what main.js writes into them), canvases backed by wx.createCanvas,
// localStorage over wx storage, Web Audio over wx.createWebAudioContext, and the kit GLB from a subpackage.
/* global wx, GameGlobal */
const GG = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
const sys = wx.getSystemInfoSync();
let W = sys.windowWidth, H = sys.windowHeight;
const DPR = sys.pixelRatio || 1;

class Emitter {
  addEventListener(t, f) { (this._l || (this._l = {}))[t] = ((this._l && this._l[t]) || []).concat(f); }
  removeEventListener(t, f) { if (this._l && this._l[t]) this._l[t] = this._l[t].filter((x) => x !== f); }
  dispatchEvent(e) { for (const f of (this._l && this._l[e.type]) || []) { try { f.call(this, e); } catch (err) { console.error(err); } } return true; }
}
class ClassList {
  constructor() { this.s = new Set(); }
  add(...a) { for (const x of a) this.s.add(x); }
  remove(...a) { for (const x of a) this.s.delete(x); }
  toggle(c, force) { const on = force === undefined ? !this.s.has(c) : !!force; if (on) this.s.add(c); else this.s.delete(c); return on; }
  contains(c) { return this.s.has(c); }
}
const noop = () => {};
// a 2D context that swallows everything (the DOM radar canvas is not shown in this build)
function fakeCtx() {
  const store = {};
  return new Proxy(store, {
    get: (t, k) => (k in t ? t[k] : (t[k] = () => ({ width: 0, addColorStop: noop, data: new Uint8ClampedArray(4) }))),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
class Element extends Emitter {
  constructor(tag = 'div', id = '') {
    super();
    this.tagName = String(tag).toUpperCase(); this.nodeName = this.tagName; this.id = id;
    this.classList = new ClassList(); this.style = { setProperty: noop, removeProperty: noop }; this.dataset = {};
    this.children = []; this.parentNode = null; this.attributes = {};
    this._text = ''; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this.type = '';
    this.width = 300; this.height = 150; this._q = {};
  }
  get className() { return [...this.classList.s].join(' '); }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children.length = 0; }
  get innerText() { return this._text; }
  set innerText(v) { this.textContent = v; }
  get innerHTML() { return this._text; }
  set innerHTML(v) { this._text = String(v); this.children.length = 0; }
  get childNodes() { return this.children; }
  // index.html markup does not exist here: main.js reaches into it through first/last child (wind tag arrow, bar fills)
  get firstChild() { return this.children[0] || this.appendChild(new Element('div')); }
  get lastChild() { return this.children[this.children.length - 1] || this.appendChild(new Element('div')); }
  // main.js writes bar fills through firstElementChild (markup from index.html that doesn't exist here)
  get firstElementChild() { return this.children[0] || this.appendChild(new Element('div')); }
  get lastElementChild() { return this.children[this.children.length - 1] || this.appendChild(new Element('div')); }
  get nextElementSibling() { return null; }
  get previousElementSibling() { return null; }
  get offsetWidth() { return 0; } get offsetHeight() { return 0; }
  get clientWidth() { return 0; } get clientHeight() { return 0; }
  get scrollHeight() { return 0; } get scrollWidth() { return 0; }
  appendChild(c) { if (c && typeof c === 'object') { this.children.push(c); c.parentNode = this; } return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  prepend(...cs) { for (const c of cs) if (c && typeof c === 'object') { this.children.unshift(c); c.parentNode = this; } }
  insertBefore(c) { return this.appendChild(c); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); if (c) c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceChildren(...cs) { this.children.length = 0; this.append(...cs); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  hasAttribute(k) { return k in this.attributes; }
  removeAttribute(k) { delete this.attributes[k]; }
  querySelector(sel) { return this._q[sel] || (this._q[sel] = new Element('div')); }
  querySelectorAll() { return []; }
  getElementsByTagName() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
  getContext() { return this._ctx || (this._ctx = fakeCtx()); }
  closest() { return null; }
  contains() { return false; }
  focus() {} blur() {} scrollIntoView() {}
  click() { if (this.onclick) this.onclick({ type: 'click', target: this }); this.dispatchEvent({ type: 'click', target: this }); }
  requestPointerLock() {}
}

// ---- canvases: the first wx.createCanvas() is the on-screen one
function upgradeCanvas(c) {
  const add = (k, v) => { if (!(k in c)) { try { c[k] = v; } catch (e) { /* host object */ } } };
  const em = new Emitter();
  add('style', { width: '', height: '' });
  add('addEventListener', em.addEventListener.bind(em));
  add('removeEventListener', em.removeEventListener.bind(em));
  add('dispatchEvent', em.dispatchEvent.bind(em));
  add('getBoundingClientRect', () => ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 }));
  add('requestPointerLock', noop);
  add('focus', noop);
  add('tagName', 'CANVAS');
  add('nodeName', 'CANVAS');
  return c;
}
const screenCanvas = upgradeCanvas(wx.createCanvas());
screenCanvas.width = Math.round(W * DPR); screenCanvas.height = Math.round(H * DPR);
const makeCanvas = () => upgradeCanvas(wx.createCanvas());

// ---- document
const byId = { c: screenCanvas };
const documentElement = new Element('html'), body = new Element('body'), head = new Element('head');
const document = new Element('#document');
Object.assign(document, {
  documentElement, body, head, hidden: false, visibilityState: 'visible', readyState: 'complete', pointerLockElement: null,
  fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]) },
  getElementById: (id) => byId[id] || (byId[id] = new Element('div', id)),
  createElement: (tag) => {
    const t = String(tag).toLowerCase();
    if (t === 'canvas') return makeCanvas();
    if (t === 'img') return wx.createImage();
    return new Element(t);
  },
  createElementNS: (ns, tag) => document.createElement(tag),
  createTextNode: (t) => { const e = new Element('#text'); e.textContent = t; return e; },
  exitPointerLock: noop,
});
document.querySelector = (sel) => (sel === 'canvas' || sel === '#c' ? screenCanvas : Element.prototype.querySelector.call(document, sel));

// ---- window
const winEm = new Emitter();
const def = (k, v) => { if (typeof GG[k] === 'undefined') GG[k] = v; };
def('window', GG);
def('self', GG);
GG.document = document;
Object.defineProperty(GG, 'innerWidth', { get: () => W, configurable: true });
Object.defineProperty(GG, 'innerHeight', { get: () => H, configurable: true });
GG.devicePixelRatio = DPR;
def('addEventListener', winEm.addEventListener.bind(winEm));
def('removeEventListener', winEm.removeEventListener.bind(winEm));
def('dispatchEvent', winEm.dispatchEvent.bind(winEm));
const nav = { userAgent: 'Mozilla/5.0 WeChatMiniGame', platform: sys.platform || '', language: sys.language || 'zh_CN', maxTouchPoints: 5, getGamepads: () => [], vibrate: noop };
try { if (typeof GG.navigator === 'undefined' || !GG.navigator.getGamepads) Object.defineProperty(GG, 'navigator', { value: Object.assign(Object.create(GG.navigator || null), nav), configurable: true }); } catch (e) { GG.navigator = nav; }
def('location', { href: 'game.js', search: '', hash: '', reload: noop });
def('performance', { now: () => Date.now() });
def('requestAnimationFrame', (f) => setTimeout(() => f(GG.performance.now()), 16));
def('cancelAnimationFrame', (id) => clearTimeout(id));
def('HTMLCanvasElement', function HTMLCanvasElement() {});
def('HTMLElement', Element);
def('Element', Element);
def('localStorage', {
  getItem: (k) => { try { const v = wx.getStorageSync(k); return v === '' || v == null ? null : String(v); } catch (e) { return null; } },
  setItem: (k, v) => { try { wx.setStorageSync(k, String(v)); } catch (e) { /* quota */ } },
  removeItem: (k) => { try { wx.removeStorageSync(k); } catch (e) { /* ignore */ } },
  clear: () => { try { wx.clearStorageSync(); } catch (e) { /* ignore */ } },
});
if (typeof GG.TextDecoder === 'undefined') {
  GG.TextDecoder = class { decode(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf);
    let s = '', i = 0;
    while (i < b.length) {
      let c = b[i++];
      if (c > 127) {
        if (c > 239) { c = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63); c -= 0x10000; s += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023)); continue; }
        else if (c > 223) c = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
        else c = ((c & 31) << 6) | (b[i++] & 63);
      }
      s += String.fromCharCode(c);
    }
    return s;
  } };
}

// ---- Web Audio: wx.createWebAudioContext + fallbacks for nodes it may not have
function fakeParam(v = 0) { return { value: v, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop, setTargetAtTime: noop, cancelScheduledValues: noop }; }
function WxAudioContext() {
  const c = wx.createWebAudioContext ? wx.createWebAudioContext() : null;
  if (!c) throw new Error('no web audio');
  if (!c.createStereoPanner) c.createStereoPanner = () => { const g = c.createGain(); g.pan = fakeParam(0); return g; };
  if (!c.createDynamicsCompressor) c.createDynamicsCompressor = () => { const g = c.createGain(); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) g[k] = fakeParam(0); return g; };
  if (!c.resume) c.resume = () => Promise.resolve();
  return c;
}
GG.AudioContext = WxAudioContext; GG.webkitAudioContext = WxAudioContext;

// ---- kit GLB lives in the "assets" subpackage (keeps the main package under 4 MB)
// download progress for the boot screen (hud.js draws it while main.js is still in its 'loading' state)
GG.__MA_LOAD = { p: 0, phase: '下载资源' };
GG.__MA_KIT_LOAD = () => new Promise((resolve, reject) => {
  const L = GG.__MA_LOAD;
  const read = () => { L.p = 1; L.phase = '解析模型'; try { resolve(wx.getFileSystemManager().readFileSync('assets/kit.glb')); } catch (e) { reject(e); } };
  if (wx.loadSubpackage) {
    const task = wx.loadSubpackage({ name: 'assets', success: read, fail: (e) => reject(new Error('subpackage: ' + (e && e.errMsg))) });
    if (task && task.onProgressUpdate) task.onProgressUpdate((r) => { L.p = Math.min(1, (r && r.progress || 0) / 100); });
  } else read();
});

// ---- host events
if (wx.onWindowResize) wx.onWindowResize((r) => { W = r.windowWidth; H = r.windowHeight; GG.dispatchEvent({ type: 'resize' }); });
if (wx.onHide) wx.onHide(() => { document.hidden = true; document.dispatchEvent({ type: 'visibilitychange' }); });
if (wx.onShow) wx.onShow(() => { document.hidden = false; });

export { screenCanvas, W as initialW, H as initialH, DPR };
