// Canvas HUD + touch input for the WeChat build. main.js still writes its HUD into (fake) DOM elements;
// this draws a compact HUD into a 2D canvas, uploads it as a texture and composites it over the 3D frame,
// and feeds wx touches straight into main.js's touch state (__iv.touch).
/* global wx */
import * as THREE from 'three';
import { explodeAt } from '../../site/combat.js';
import { GAME_NAME } from './config.js';
import { initAds, adMode, adBusy, showRewarded, initShare, shareMission, takeJump } from './ads.js';

const iv = () => window.__iv;

// ---------------------------------------------------------------- Chinese-only text (review rejects English in the UI)
// main.js banners carry English titles / subtitles ('WAVE 2', 'SYSTEM DOWN'); translate the common ones and drop the rest.
const ZH = [
  [/\bFINAL WAVE\b/g, '最终波'], [/\bWAVE CLEAR\b/g, '本波肃清'], [/\bROUND CLEAR\b/g, '本轮肃清'], [/\bAREA CLEAR\b/g, '区域肃清'],
  [/\bOBJECTIVE CLEAR\b/g, '目标达成'], [/\bMISSION COMPLETE\b/g, '任务完成'], [/\bMISSION FAILED\b/g, '任务失败'],
  [/\bWAVE (\d+)\b/g, '第 $1 波'], [/\bROUND (\d+)\b/g, '第 $1 轮'], [/\bAMBUSH\b/g, '遭遇伏击'], [/\bCOUNTERATTACK\b/g, '敌方反攻'],
  [/\bOVERDRIVE\b/g, '超载'], [/\bECM\b/g, '电子干扰'],
];
const CJK = /[㐀-鿿＀-￯　-〿]/;
export function zh(s) {
  if (!s) return '';
  let t = String(s);
  for (const [r, v] of ZH) t = t.replace(r, v);
  // keep only ' · ' segments that have Chinese in them ('CONVOY LOST', 'SYSTEM DOWN' go)
  return t.split(' · ').map((x) => x.trim()).filter((x) => CJK.test(x)).join(' · ');
}
// 'LZ-1 光束炮' -> '光束炮' (model codes read as English to reviewers)
const wName = (n) => { const p = String(n).split(' '); return p.length > 1 && !CJK.test(p[0]) ? p.slice(1).join('') : n; };
const el = (id) => document.getElementById(id);
const PAL = { ink: '#e8f4ff', dim: 'rgba(200,220,235,0.72)', cyan: '#5fe3ff', amber: '#ffbe50', red: '#ff5a4a', bg: 'rgba(8,14,20,0.62)', line: 'rgba(95,227,255,0.45)' };
const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';

let cv, g, tex, scene, cam, mesh, K = 1, frameN = 0, lastState = '', misIdx = 0;
const held = {};   // touch identifier -> button key
const BTN = [
  { k: 'b0', t: '右臂', s: '开火', x: -2.3, y: -2.3, r: 1.25, c: PAL.red },
  { k: 'b2', t: '左臂', x: -4.75, y: -1.45, r: 0.85, c: PAL.red },
  { k: 'e', t: '肩部', x: -1.45, y: -4.75, r: 0.8, c: PAL.amber },
  { k: 'jump', t: '跳跃', s: '悬浮', x: -4.3, y: -3.75, r: 0.8, c: PAL.cyan },
  { k: 'boost', t: '推进', s: '急闪', x: -6.9, y: -1.25, r: 0.8, c: PAL.cyan },
  { k: 'reload', t: '装填', x: -6.55, y: -3.35, r: 0.6, c: PAL.dim },
  { k: 'od', t: '超载', x: -1.25, y: -6.8, r: 0.6, c: PAL.amber },
];
const unit = () => Math.min(innerWidth, innerHeight) / 10;
function btnPos(b) { const u = unit(); return { x: innerWidth + b.x * u, y: innerHeight + b.y * u, r: b.r * u }; }
const pausePos = () => { const u = unit(); return { x: innerWidth - 0.75 * u, y: 0.75 * u, r: 0.45 * u }; };
const hit = (p, x, y, pad = 1.15) => Math.hypot(x - p.x, y - p.y) < p.r * pad;
const STICK_R = 52;

// ---------------------------------------------------------------- title / pause / result menus
function missions() { return Object.keys(iv().MISSIONS).filter((k) => !iv().MISSIONS[k].endless && !iv().MISSIONS[k].daily); }
function menuRects() {
  const W = innerWidth, H = innerHeight, u = unit();
  return {
    prev: { x: W / 2 - 4.6 * u, y: H * 0.52, r: 0.7 * u },
    next: { x: W / 2 + 4.6 * u, y: H * 0.52, r: 0.7 * u },
    go: { x: W / 2 - 2.2 * u, y: H * 0.68, w: 4.4 * u, h: 1.15 * u },
    quit: { x: W / 2 - 2.2 * u, y: H * 0.68, w: 4.4 * u, h: 1.15 * u },
  };
}
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
// two-by-two button grid under a panel (revive / result screens)
function gridRects() {
  const W = innerWidth, H = innerHeight, u = unit(), w = 4.4 * u, h = 1.1 * u, y0 = H * 0.54, x0 = W / 2 - w - 0.2 * u, x1 = W / 2 + 0.2 * u;
  return { a: { x: x0, y: y0, w, h }, b: { x: x1, y: y0, w, h }, c: { x: x0, y: y0 + h + 0.35 * u, w, h }, d: { x: x1, y: y0 + h + 0.35 * u, w, h } };
}

// ---------------------------------------------------------------- per-run rewards (rewarded video)
const RW = { revived: false, doubled: false, earned: 0, rank: '', toast: '', toastT: 0 };
function newRun() { RW.revived = false; RW.doubled = false; RW.earned = 0; RW.rank = ''; }
// the death countdown is running and the mech is down: offer one revive per run
function canRevive(I) {
  const p = I.G.player, run = I.run;
  return p && !p.alive && !run.over && !run.won && run.deathT > 0 && run.deathT < 2.2 && !RW.revived && !run.coreLost && !run.trainLost;
}
function doRevive() {
  const I = iv(), G = I.G, p = G.player;
  p.alive = true; p.hp = Math.round(p.maxHp * 0.5); p.en = p.maxEn; p.root.visible = true;
  I.run.deathT = 0; G.blinkInv = 2.5;                       // 2.5 s of invulnerability to get your bearings
  for (const s of G.shots) if (s.team === 'E') s.life = 0;  // clear incoming fire
  explodeAt(p.center(new THREE.Vector3()), 16, 140, 'P', 1.6, 0x9fe8ff);
  toast('已复活 · 装甲修复 50%');
  I.setState('play');
}
function giveUp() { iv().setState('play'); }   // the death countdown resumes and the mission fails as usual
// result screen: read this run's pay from the result panel main.js just filled in
function readEarned(I) {
  const h = (document.getElementById('rStats') || {}).innerHTML || '';
  const n = (re) => { const m = h.match(re); return m ? +m[1] : 0; };
  RW.earned = n(/击毁报酬<\/span><b class="cr">(\d+) C/) + n(/任务报酬[^<]*<\/span><b class="cr">(\d+) C/);
  RW.rank = (document.getElementById('rRank') || {}).textContent || '';
}
function doubleReward() {
  const I = iv();
  if (RW.doubled || RW.earned <= 0) return;
  showRewarded((ok) => {
    if (!ok) { toast('视频未看完，报酬未翻倍'); return; }
    RW.doubled = true;
    I.save.cr += RW.earned; I.save.earned = (I.save.earned || 0) + RW.earned; I.writeSave();
    toast(`报酬翻倍 · 额外获得 ${RW.earned} 资金`);
  });
}
function toast(s) { RW.toast = s; RW.toastT = 2.6; }
const curMission = () => {
  const I = iv(); if (!I) return null;
  const st = I.state(), k = st === 'title' ? missions()[misIdx % missions().length] : I.cfg.mission, M = I.MISSIONS[k];
  return M ? { key: k, name: M.name } : null;
};

function startMission() {
  const I = iv(), ks = missions();
  I.setTouch(true);
  I.start({ mission: ks[misIdx % ks.length] });
}
function manualReload() {
  const G = iv().G;
  for (const k of ['R', 'L']) { const w = G.pw[k]; if (w.d.mag && w.ammo < w.d.mag && w.reloadT <= 0) w.reloadT = w.d.reload; }
}

// ---------------------------------------------------------------- touch
function onStart(res) {
  const I = iv(); if (!I) return;
  const st = I.state(), T = I.touch;
  for (const t of res.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (st === 'title') {
      const R = menuRects(), n = missions().length;
      if (hit(R.prev, x, y, 1.6)) misIdx = (misIdx + n - 1) % n;
      else if (hit(R.next, x, y, 1.6)) misIdx = (misIdx + 1) % n;
      else if (inRect(R.go, x, y)) startMission();
      continue;
    }
    if (st === 'pause') { if (inRect(menuRects().quit, x, y - unit() * 1.6)) I.setState('title'); else I.setState('play'); continue; }
    if (st === 'revive') {
      if (adBusy()) continue;
      const Q = gridRects();
      if (inRect(Q.a, x, y)) { RW.revived = true; showRewarded((ok) => (ok ? doRevive() : (toast('视频未看完，未能复活'), giveUp()))); }
      else if (inRect(Q.b, x, y)) { RW.revived = true; giveUp(); }
      continue;
    }
    if (st === 'result') {
      if (adBusy()) continue;
      const Q = gridRects();
      if (inRect(Q.a, x, y)) doubleReward();
      else if (inRect(Q.b, x, y)) shareMission(curMission());
      else if (inRect(Q.c, x, y)) { I.setTouch(true); I.start({}); }   // same mission again, no interstitial
      else if (inRect(Q.d, x, y)) I.setState('title');
      continue;
    }
    if (st !== 'play') continue;
    if (hit(pausePos(), x, y, 1.5)) { I.setState('pause'); continue; }
    const b = BTN.find((bb) => hit(btnPos(bb), x, y));
    if (b) { held[t.identifier] = b.k; T.b[b.k] = true; if (b.k === 'reload') manualReload(); continue; }
    if (x < innerWidth * 0.42 && T.stick === null) { T.stick = t.identifier; T.ox = x; T.oy = y; T.mx = T.my = 0; }
    else if (T.look === null) { T.look = t.identifier; T.lx = x; T.ly = y; }
  }
}
function onMove(res) {
  const I = iv(); if (!I || I.state() !== 'play') return;
  const T = I.touch;
  for (const t of res.changedTouches) {
    if (t.identifier === T.stick) {
      let dx = t.clientX - T.ox, dy = t.clientY - T.oy; const L = Math.hypot(dx, dy);
      if (L > STICK_R) { dx *= STICK_R / L; dy *= STICK_R / L; }
      T.mx = dx / STICK_R; T.my = dy / STICK_R;
    } else if (t.identifier === T.look) {
      T.dx += t.clientX - T.lx; T.dy += t.clientY - T.ly; T.lx = t.clientX; T.ly = t.clientY;
    }
  }
}
function onEnd(res) {
  const I = iv(); if (!I) return;
  const T = I.touch;
  for (const t of res.changedTouches) {
    if (held[t.identifier]) { T.b[held[t.identifier]] = false; delete held[t.identifier]; }
    if (t.identifier === T.stick) { T.stick = null; T.mx = T.my = 0; }
    if (t.identifier === T.look) T.look = null;
  }
}

// ---------------------------------------------------------------- drawing helpers
function bar(x, y, w, h, k, col, label, val) {
  g.fillStyle = PAL.bg; g.fillRect(x, y, w, h);
  g.fillStyle = col; g.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, k)), h - 2);
  g.strokeStyle = PAL.line; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) { g.fillStyle = PAL.ink; g.font = `600 ${Math.round(h * 0.78)}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(label, x + 6, y + h / 2 + 0.5); }
  if (val) { g.textAlign = 'right'; g.fillText(val, x + w - 6, y + h / 2 + 0.5); }
}
function text(s, x, y, size, col = PAL.ink, align = 'center', weight = 600) {
  g.font = `${weight} ${Math.round(size)}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle';
  g.lineWidth = Math.max(2, size / 6); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(s, x, y);
  g.fillStyle = col; g.fillText(s, x, y);
}
function circle(x, y, r, fill, stroke, lw = 2) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } }
const stripTags = (s) => String(s).replace(/<small>/g, '\n').replace(/<[^>]*>/g, '');

function drawPlay() {
  const I = iv(), G = I.G, run = I.run, W = innerWidth, H = innerHeight, u = unit(), p = G.player, T = I.touch;
  if (!p) return;
  // vitals
  const bw = Math.min(260, W * 0.3), bh = Math.max(14, u * 0.42);
  bar(u * 0.5, u * 0.45, bw, bh, p.hp / p.maxHp, p.hp / p.maxHp < 0.3 ? PAL.red : '#7fe08a', '装甲', String(Math.ceil(p.hp)));
  bar(u * 0.5, u * 0.45 + bh + 4, bw, bh * 0.75, p.en / p.maxEn, p.overheat > 0 ? PAL.red : PAL.cyan, p.overheat > 0 ? '过热' : '能量');
  if (G.od) bar(u * 0.5, u * 0.45 + bh * 1.75 + 8, bw * 0.6, bh * 0.6, G.od.k, G.od.t > 0 ? '#fff' : PAL.amber, '');
  // wave / time
  const M = I.MISSIONS[I.cfg.mission];
  const nW = M && M.waves ? M.waves.length : 0;
  text(`${run.wave >= 0 ? (nW ? `第 ${run.wave + 1}/${nW} 波` : `第 ${run.wave + 1} 波`) : ''}   击毁 ${G.stats.kills}   ${Math.floor(run.t / 60)}:${String(Math.floor(run.t % 60)).padStart(2, '0')}`, W - 1.5 * u, u * 0.75, u * 0.36, PAL.ink, 'right');
  // boss
  if (!el('bossBox').classList.contains('hidden') && G.boss && G.boss.alive) {
    const w = Math.min(520, W * 0.46), x = (W - w) / 2, y = u * 1.35;
    text(el('bossName').textContent, W / 2, y - u * 0.32, u * 0.34, PAL.amber);
    bar(x, y, w, u * 0.26, G.boss.hp / G.boss.maxHp, PAL.red, '');
  }
  // banner / hint (mirrors main.js's DOM text)
  const bn = el('banner');
  if (bn.classList.contains('show') && iv().state() !== 'revive') {   // the revive panel has its own title
    let [t1, t2] = stripTags(bn.innerHTML).split('\n').map(zh);
    if (!t1) { t1 = t2; t2 = ''; }
    if (t1) text(t1, W / 2, H * 0.3, u * 0.8, bn.classList.contains('warn') ? PAL.red : PAL.ink, 'center', 700);
    if (t2) text(t2, W / 2, H * 0.3 + u * 0.75, u * 0.36, PAL.dim);
  }
  const hn = el('hint'), ht = zh(hn.textContent);
  if (!hn.classList.contains('hidden') && ht) text(ht, W / 2, H * 0.78, u * 0.32, PAL.amber);
  // weapons
  const wl = ['R', 'L', 'S'].map((k) => { const w = G.pw[k]; if (!w) return ''; const am = w.reloadT > 0 ? '装填中' : w.d.mag ? `${w.ammo}/${w.d.mag}` : w.cd > 0 ? `${w.cd.toFixed(1)} 秒` : '就绪'; return `${wName(w.d.name)} ${am}`; });
  text(wl.join('   ·   '), W / 2, H - u * 0.4, u * 0.3, PAL.dim);
  // reticle
  circle(W / 2, H / 2, u * 0.22, null, 'rgba(255,255,255,0.75)', 1.5);
  g.fillStyle = '#fff'; g.fillRect(W / 2 - 1, H / 2 - 1, 2, 2);
  // stick
  if (T.stick !== null) { circle(T.ox, T.oy, STICK_R, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.35)'); circle(T.ox + T.mx * STICK_R, T.oy + T.my * STICK_R, STICK_R * 0.42, 'rgba(95,227,255,0.45)', '#fff', 1.5); }
  else { circle(u * 2.3, H - u * 2.4, STICK_R, null, 'rgba(255,255,255,0.18)'); text('移动', u * 2.3, H - u * 2.4, u * 0.3, PAL.dim); }
  // buttons
  for (const b of BTN) {
    const q = btnPos(b), on = !!T.b[b.k];
    const ready = b.k !== 'od' || (G.od && G.od.k >= 1);
    circle(q.x, q.y, q.r, on ? 'rgba(255,255,255,0.35)' : 'rgba(10,16,24,0.45)', ready ? b.c : 'rgba(255,255,255,0.2)', on ? 3 : 2);
    text(b.t, q.x, q.y - (b.s ? q.r * 0.16 : 0), Math.max(11, q.r * 0.42), ready ? PAL.ink : PAL.dim);
    if (b.s) text(b.s, q.x, q.y + q.r * 0.34, Math.max(9, q.r * 0.24), PAL.dim);
  }
  const pp = pausePos(); circle(pp.x, pp.y, pp.r, 'rgba(10,16,24,0.5)', PAL.line); text('II', pp.x, pp.y, pp.r * 0.8);
}
function panel(title, sub) {
  const W = innerWidth, H = innerHeight, u = unit();
  g.fillStyle = 'rgba(4,8,12,0.55)'; g.fillRect(0, 0, W, H);
  text(title, W / 2, H * 0.24, u * 1.0, PAL.ink, 'center', 800);
  if (sub) text(sub, W / 2, H * 0.24 + u * 0.95, u * 0.36, PAL.dim);
}
function button(r, label, col = PAL.cyan) {
  g.fillStyle = 'rgba(10,20,28,0.8)'; g.fillRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  text(label, r.x + r.w / 2, r.y + r.h / 2, r.h * 0.42, PAL.ink, 'center', 700);
}
function drawTitle() {
  const I = iv(), W = innerWidth, H = innerHeight, u = unit(), ks = missions(), M = I.MISSIONS[ks[misIdx % ks.length]];
  panel(GAME_NAME, '横屏操作 · 左侧摇杆移动 · 右侧拖动转视角');
  const R = menuRects();
  text(M.name, W / 2, H * 0.48, u * 0.6, PAL.amber, 'center', 700);
  circle(R.prev.x, R.prev.y, R.prev.r, 'rgba(10,20,28,0.8)', PAL.line); text('‹', R.prev.x, R.prev.y - 2, R.prev.r * 1.3);
  circle(R.next.x, R.next.y, R.next.r, 'rgba(10,20,28,0.8)', PAL.line); text('›', R.next.x, R.next.y - 2, R.next.r * 1.3);
  text(`${misIdx % ks.length + 1} / ${ks.length}`, W / 2, H * 0.6, u * 0.28, PAL.dim);
  button(R.go, '出击');
}
function drawPause() {
  panel('已暂停', '点击任意位置继续');
  const r = menuRects().quit; button({ ...r, y: r.y + unit() * 1.6 }, '返回标题', PAL.amber);
}
const VID = () => (adMode() === 'video' ? '▶ ' : '');   // the ▶ mark means "this button plays a video"
function drawRevive() {
  panel('机体损毁', adMode() === 'video' ? '看一段视频，原地复活并修复 50% 装甲（每局一次）' : '原地复活并修复 50% 装甲（每局一次）');
  const Q = gridRects();
  button(Q.a, `${VID()}复活`, PAL.cyan);
  button(Q.b, '放弃', PAL.dim);
}
function drawResult() {
  const I = iv(), W = innerWidth, H = innerHeight, u = unit(), Q = gridRects();
  panel(I.run.won ? '任务完成' : '任务失败', `用时 ${Math.floor(I.run.t / 60)}:${String(Math.floor(I.run.t % 60)).padStart(2, '0')} · 击毁 ${I.G.stats.kills}`);
  const got = RW.earned * (RW.doubled ? 2 : 1);
  text(`${RW.rank && I.run.won ? `评级 ${RW.rank} · ` : ''}获得 ${got} 资金${RW.doubled ? '（已翻倍）' : ''} · 持有 ${I.save.cr}`, W / 2, H * 0.43, u * 0.42, PAL.amber);
  const canDouble = !RW.doubled && RW.earned > 0;
  button(Q.a, canDouble ? `${VID()}报酬翻倍` : '报酬翻倍', canDouble ? PAL.amber : 'rgba(255,255,255,0.2)');
  button(Q.b, '分享给好友', PAL.cyan);
  button(Q.c, '再来一次', PAL.cyan);
  button(Q.d, '返回标题', PAL.dim);
}
function drawToast(dt) {
  if (RW.toastT <= 0) return;
  RW.toastT -= dt;
  const W = innerWidth, H = innerHeight, u = unit();
  g.globalAlpha = Math.min(1, RW.toastT * 2);
  g.fillStyle = 'rgba(8,14,20,0.8)'; const w = Math.min(W * 0.8, RW.toast.length * u * 0.42 + u * 1.2); g.fillRect((W - w) / 2, H * 0.12 - u * 0.4, w, u * 0.8);
  text(RW.toast, W / 2, H * 0.12, u * 0.36, PAL.ink);
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- per-frame composite
let prevSt = 'loading';
function afterRender(dt = 1 / 60) {
  const I = iv();
  let st = I.state();
  if (st === 'loading') { prevSt = st; return; }
  // state transitions: a fresh sortie resets the per-run rewards; the result screen reads this run's pay
  if (st === 'play' && !['play', 'pause', 'revive'].includes(prevSt)) newRun();
  if (st === 'result' && prevSt !== 'result') readEarned(I);
  if (st === 'play' && canRevive(I)) { I.setState('revive'); st = 'revive'; }
  if (st === 'title') {   // opened from a share card: go straight into that mission
    const m = takeJump(), ks = missions();
    if (m && I.MISSIONS[m]) { const i = ks.indexOf(m); if (i >= 0) misIdx = i; I.setTouch(true); I.start({ mission: m }); st = I.state(); }
  }
  prevSt = st;
  frameN++;
  const dirty = st !== lastState || st !== 'title' || frameN % 30 === 0 || RW.toastT > 0;
  if (dirty && (frameN % 2 === 0 || st !== lastState)) {   // redraw at ~30 Hz, the texture upload is the cost
    lastState = st;
    g.setTransform(K, 0, 0, K, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    if (st === 'play') drawPlay();
    else if (st === 'pause') { drawPlay(); drawPause(); }
    else if (st === 'revive') { drawPlay(); drawRevive(); }
    else if (st === 'title') drawTitle();
    else if (st === 'result') drawResult();
    else panel(st === 'loading' ? '加载中' : '');
    drawToast(dt * 2);   // drawn every other frame
    tex.needsUpdate = true;
  }
  const r = I.G.renderer, ac = r.autoClear;
  r.autoClear = false; r.setRenderTarget(null); r.render(scene, cam); r.autoClear = ac;
}

function resize() {
  K = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(innerWidth * K); cv.height = Math.round(innerHeight * K);
  if (tex) { tex.dispose(); tex.image = cv; tex.needsUpdate = true; }
}

export function initHud() {
  cv = document.createElement('canvas'); g = cv.getContext('2d'); resize();
  tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  scene = new THREE.Scene(); cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  scene.add(mesh);
  const wait = () => { if (window.__iv && window.__iv.G) { window.__iv.G.afterRender = afterRender; } else setTimeout(wait, 50); };
  wait();
  initAds(); initShare(curMission);
  wx.onTouchStart(onStart); wx.onTouchMove(onMove); wx.onTouchEnd(onEnd); wx.onTouchCancel(onEnd);
  addEventListener('resize', resize);
}
