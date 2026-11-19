// Phone quality tiers + automatic step-down. The site build renders at desktop settings
// (4x MSAA HalfFloat targets, Bloom, 2048 shadows, thousands of rain / snow particles); phones get a tier.
/* global wx */
import { WX, saveWX } from './store.js';

export const TIERS = [
  { name: '高', dpr: 1.5, msaa: 4, bloom: true, shadow: 2048, fx: 1 },
  { name: '中', dpr: 1.25, msaa: 0, bloom: true, shadow: 1024, fx: 0.55 },
  { name: '低', dpr: 1.0, msaa: 0, bloom: false, shadow: 0, fx: 0.3 },
];
export const Q = { tier: 1, mode: 'auto', fps: 0, changed: '' };

// first guess before any frame is measured: Android exposes benchmarkLevel (1-50, higher is faster)
function guessTier() {
  let info = {};
  try { info = wx.getSystemInfoSync(); } catch (e) { /* no info */ }
  if (info.platform === 'devtools') return 0;
  const b = info.benchmarkLevel;
  if (typeof b === 'number' && b > 0) return b >= 30 ? 0 : b >= 15 ? 1 : 2;
  return 1;
}

function sceneOf(G) { let o = G.player && G.player.root; while (o && o.parent) o = o.parent; return o; }

export function applyTier(t) {
  const I = window.__iv, G = I && I.G; if (!G || !G.renderer) return false;
  const T = TIERS[t]; Q.tier = t;
  const r = G.renderer;
  r.setPixelRatio(Math.min(devicePixelRatio || 1, T.dpr));
  r.setSize(innerWidth, innerHeight);
  if (G.composer) {
    for (const rt of [G.composer.renderTarget1, G.composer.renderTarget2]) if (rt && rt.samples !== T.msaa) { rt.samples = T.msaa; rt.dispose(); }
    if (G.composer.setPixelRatio) G.composer.setPixelRatio(r.getPixelRatio());
    G.composer.setSize(innerWidth, innerHeight);
  }
  if (G.bloom) G.bloom.enabled = T.bloom;
  if (G.atmo) G.atmo.enabled = T.bloom;   // light shafts + aerial perspective + grade: off on the low tier
  const sc = sceneOf(G);
  if (sc) sc.traverse((o) => {
    if (o.isDirectionalLight && (o.castShadow || o.userData.wxShadow)) {
      o.userData.wxShadow = true;
      o.castShadow = T.shadow > 0;
      if (T.shadow > 0 && o.shadow.mapSize.x !== T.shadow) { o.shadow.mapSize.set(T.shadow, T.shadow); if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } }
    }
  });
  thinParticles(G);
  return true;
}
// rain, snow, dust, embers: big Points / LineSegments pools get a shorter draw range
export function thinParticles(G = window.__iv && window.__iv.G) {
  const sc = G && sceneOf(G), k = TIERS[Q.tier].fx; if (!sc) return;
  sc.traverse((o) => {
    if (!(o.isPoints || o.isLineSegments) || !o.geometry || !o.geometry.attributes.position) return;
    const n = o.userData.wxN || o.geometry.attributes.position.count; if (n < 800) return;
    o.userData.wxN = n;
    o.geometry.setDrawRange(0, Math.floor(n * k / 2) * 2);   // keep line pairs whole
  });
}

export function initQuality() {
  Q.mode = WX.quality || 'auto';
  const t = Q.mode === 'auto' ? (WX.tier >= 0 ? WX.tier : guessTier()) : +Q.mode;
  const go = () => { if (!applyTier(t)) setTimeout(go, 50); };
  go();
}
export function setMode(m) {
  Q.mode = m; WX.quality = m; saveWX();
  applyTier(m === 'auto' ? (WX.tier >= 0 ? WX.tier : guessTier()) : +m);
}

// automatic step-down while playing: measure real frame time (not the clamped game dt)
const M = { t0: 0, last: 0, n: 0, acc: 0, playT: 0 };
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
export function resetMonitor() { M.last = 0; M.n = 0; M.acc = 0; M.playT = 0; }
// returns a message when the tier changed
export function monitor() {
  const t = now(), d = M.last ? (t - M.last) / 1000 : 0; M.last = t;
  if (!d || d > 0.5) return '';            // first frame / app was in the background
  M.playT += d;
  if (M.playT < 4) return '';              // skip loading hitches at the start of a mission
  M.acc += d; M.n++;
  if (M.acc < 3) return '';
  Q.fps = M.n / M.acc; M.acc = 0; M.n = 0;
  if (Q.mode !== 'auto' || Q.fps >= 38 || Q.tier >= TIERS.length - 1) return '';
  applyTier(Q.tier + 1); WX.tier = Q.tier; saveWX(); M.playT = 2;   // give the new tier a moment before judging it
  return `帧率偏低（${Math.round(Q.fps)}），画质已自动调为「${TIERS[Q.tier].name}」`;
}
