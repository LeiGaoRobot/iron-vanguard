// Canvas HUD + touch input for the WeChat build. main.js still writes its HUD into (fake) DOM elements;
// this draws a compact HUD into a 2D canvas, uploads it as a texture and composites it over the 3D frame,
// and feeds wx touches straight into main.js's touch state (__iv.touch).
/* global wx */
import * as THREE from 'three';
import { explodeAt, WIND } from '../../site/combat.js';
import { GAME_NAME } from './config.js';
import { initAds, adMode, adBusy, showRewarded, initShare, shareMission, takeJump } from './ads.js';
import { S, PAL, FONT, unit, inRect, el, zh, wName, stripTags, money, clock, text, flat, bar, circle, panel, button } from './ui.js';
import { initGarage, drawGarage, garageStart, garageMove, garageEnd } from './garage.js';
import { initQuality, monitor, resetMonitor, thinParticles } from './quality.js';
import { WX, saveWX } from './store.js';
import { INTRO, INTRO_KEY, STEPS, OD_STEP } from './intro.js';
import { snapRun, topSources } from './recap.js';
import * as stats from './stats.js';

const iv = () => window.__iv;
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
function btnPos(b) { const u = unit(); return { x: innerWidth + b.x * u, y: innerHeight + b.y * u, r: b.r * u }; }
const pausePos = () => { const u = unit(); return { x: innerWidth - 0.75 * u, y: 0.75 * u, r: 0.45 * u }; };
const hit = (p, x, y, pad = 1.15) => Math.hypot(x - p.x, y - p.y) < p.r * pad;
const STICK_R = 52;
const stickHome = () => ({ x: unit() * 2.3, y: innerHeight - unit() * 2.4 });

// ---------------------------------------------------------------- missions / menus
// story missions in main.js order, with the tutorial first
function missions() {
  const M = iv().MISSIONS;
  const ks = Object.keys(M).filter((k) => !M[k].endless && !M[k].daily && k !== INTRO_KEY);
  return M[INTRO_KEY] ? [INTRO_KEY, ...ks] : ks;
}
function menuRects() {
  const W = innerWidth, H = innerHeight, u = unit();
  return {
    prev: { x: W / 2 - 4.6 * u, y: H * 0.52, r: 0.7 * u },
    next: { x: W / 2 + 4.6 * u, y: H * 0.52, r: 0.7 * u },
    garage: { x: W / 2 - 4.1 * u, y: H * 0.68, w: 3.9 * u, h: 1.15 * u },
    go: { x: W / 2 + 0.2 * u, y: H * 0.68, w: 3.9 * u, h: 1.15 * u },
    quit: { x: W / 2 - 2.2 * u, y: H * 0.68, w: 4.4 * u, h: 1.15 * u },
  };
}
// two-by-two button grid under a panel (revive / result screens)
function gridRects() {
  const W = innerWidth, H = innerHeight, u = unit(), w = 4.4 * u, h = 1.1 * u, y0 = H * 0.56, x0 = W / 2 - w - 0.2 * u, x1 = W / 2 + 0.2 * u;
  return { a: { x: x0, y: y0, w, h }, b: { x: x1, y: y0, w, h }, c: { x: x0, y: y0 + h + 0.35 * u, w, h }, d: { x: x1, y: y0 + h + 0.35 * u, w, h } };
}

// ---------------------------------------------------------------- per-run state: rewards, tutorial, stats
const RW = { revived: false, didRevive: false, doubled: false, earned: 0, rank: '', toast: '', toastT: 0, recap: [], logged: false };
const TU = { on: false, i: 0, stepT: 0, p0: new THREE.Vector3(), od: false, odT: 0 };
function newRun(I) {
  Object.assign(RW, { revived: false, didRevive: false, doubled: false, earned: 0, rank: '', recap: [], logged: false });
  snapRun(I.G); resetMonitor(); thinParticles(I.G);
  stats.missionStart(I.cfg.mission);
  TU.on = I.cfg.mission === INTRO_KEY; TU.i = 0; TU.stepT = 0; TU.od = false; TU.odT = 0; TU.p0.copy(I.G.player.pos);
}
function logEnd(I, result) {
  if (RW.logged) return; RW.logged = true;
  const top = topSources(I.G, I.run.coreLost ? 'core' : 'player', 1)[0];
  stats.missionEnd(I.cfg.mission, { result, wave: Math.max(0, I.run.wave) + 1, seconds: I.run.t, killer: result === 'win' ? '' : top ? top.kind : '', revived: RW.didRevive });
  if (I.cfg.mission === INTRO_KEY && !WX.introDone) { WX.introDone = true; saveWX(); }
}
// the death countdown is running and the mech is down: offer one revive per run
function canRevive(I) {
  const p = I.G.player, run = I.run;
  return p && !p.alive && !run.over && !run.won && run.deathT > 0 && run.deathT < 2.2 && !RW.revived && !run.coreLost && !run.trainLost;
}
function doRevive() {
  const I = iv(), G = I.G, p = G.player;
  p.alive = true; p.hp = Math.round(p.maxHp * 0.5); p.en = p.maxEn; p.root.visible = true;
  I.run.deathT = 0; G.blinkInv = 2.5; RW.didRevive = true;                      // 2.5 s of invulnerability to get your bearings
  for (const s of G.shots) if (s.team === 'E') s.life = 0;  // clear incoming fire
  explodeAt(p.center(new THREE.Vector3()), 16, 140, 'P', 1.6, 0x9fe8ff);
  toast('已复活 · 装甲修复 50%');
  I.setState('play');
}
function giveUp() { iv().setState('play'); }   // the death countdown resumes and the mission fails as usual
const adOutcome = (ok) => (adMode() === 'free' ? 'free' : ok ? 'ended' : 'skipped');
const onAd = (kind, ok) => stats.adReward(kind === 'supply' ? 'garage' : iv().cfg.mission, kind, adOutcome(ok));
// result screen: read this run's pay from the result panel main.js just filled in
function readResult(I) {
  const h = el('rStats').innerHTML || '';
  const n = (re) => { const m = h.match(re); return m ? +m[1] : 0; };
  RW.earned = n(/击毁报酬<\/span><b class="cr">(\d+) C/) + n(/任务报酬[^<]*<\/span><b class="cr">(\d+) C/);
  RW.rank = el('rRank').textContent || '';
  RW.recap = I.run.won ? [] : topSources(I.G, I.run.coreLost ? 'core' : 'player', 2);
  logEnd(I, I.run.won ? 'win' : 'fail');
}
function doubleReward() {
  const I = iv();
  if (RW.doubled || RW.earned <= 0) return;
  showRewarded((ok) => {
    onAd('double', ok);
    if (!ok) { toast('视频未看完，报酬未翻倍'); return; }
    RW.doubled = true;
    I.save.cr += RW.earned; I.save.earned = (I.save.earned || 0) + RW.earned; I.writeSave();
    toast(`报酬翻倍 · 额外获得 ${RW.earned} 资金`);
  });
}
function toast(s) { RW.toast = s; RW.toastT = 2.6; }
const curMission = () => {
  const I = iv(); if (!I) return null;
  const st = I.state(), k = st === 'title' || st === 'garage' ? missions()[misIdx % missions().length] : I.cfg.mission, M = I.MISSIONS[k];
  return M ? { key: k, name: M.name } : null;
};

function startMission(key) {
  const I = iv(), ks = missions();
  if (key) { const i = ks.indexOf(key); if (i >= 0) misIdx = i; }
  setGarageView(false);
  I.setTouch(true);
  I.start({ mission: key || ks[misIdx % ks.length] });
}
function manualReload() {
  const G = iv().G;
  for (const k of ['R', 'L']) { const w = G.pw[k]; if (w.d.mag && w.ammo < w.d.mag && w.reloadT <= 0) w.reloadT = w.d.reload; }
}
// garage: push the preview mech into the left part of the screen (the list panel covers the right)
function setGarageView(on) {
  const G = iv().G, pass = G.composer && G.composer.passes[0], c = pass && pass.camera; if (!c) return;
  // a sub-view k times the frame zooms out; the offsets put the mech's chest at (0.24 W, 0.42 H)
  const W = innerWidth, H = innerHeight, k = 1.3;
  if (on) c.setViewOffset(W, H, W * (0.5 - 0.24 * k), H * (0.5 - 0.42 * k), W * k, H * k); else if (c.view && c.view.enabled) c.clearViewOffset();
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
      else if (inRect(R.garage, x, y)) I.setState('garage');
      continue;
    }
    if (st === 'garage') { if (!adBusy()) garageStart(t); continue; }
    if (st === 'pause') {
      if (inRect(menuRects().quit, x, y - unit() * 1.6)) { logEnd(I, 'quit'); I.setState('title'); } else I.setState('play');
      continue;
    }
    if (st === 'revive') {
      if (adBusy()) continue;
      const Q = gridRects();
      if (inRect(Q.a, x, y)) { RW.revived = true; showRewarded((ok) => { onAd('revive', ok); if (ok) doRevive(); else { toast('视频未看完，未能复活'); giveUp(); } }); }
      else if (inRect(Q.b, x, y)) { RW.revived = true; giveUp(); }
      continue;
    }
    if (st === 'result') {
      if (adBusy()) continue;
      const Q = gridRects();
      if (inRect(Q.a, x, y)) doubleReward();
      else if (inRect(Q.b, x, y)) shareMission(curMission());
      else if (inRect(Q.c, x, y)) { I.setTouch(true); I.start({}); }   // same mission again, no interstitial
      else if (inRect(Q.d, x, y)) I.setState(RW.earned > 0 ? 'garage' : 'title');   // money to spend -> hangar
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
  const I = iv(); if (!I) return;
  if (I.state() === 'garage') { for (const t of res.changedTouches) garageMove(t); return; }
  if (I.state() !== 'play') return;
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
  if (I.state() === 'garage') { for (const t of res.changedTouches) garageEnd(t); return; }
  const T = I.touch;
  for (const t of res.changedTouches) {
    if (held[t.identifier]) { T.b[held[t.identifier]] = false; delete held[t.identifier]; }
    if (t.identifier === T.stick) { T.stick = null; T.mx = T.my = 0; }
    if (t.identifier === T.look) T.look = null;
  }
}

// ---------------------------------------------------------------- tutorial (新兵训练)
function tutorStep(I, dt) {
  if (!TU.on || I.run.over || !I.G.player.alive) return;
  TU.stepT += dt;
  if (!TU.od && I.G.od && I.G.od.k >= 1 && TU.i >= 2) { TU.od = true; TU.odT = 6; }
  if (TU.odT > 0) { TU.odT -= dt; if (I.G.od && I.G.od.t > 0) TU.odT = 0; }
  const s = STEPS[TU.i];
  if (s && s.done(I, TU)) { TU.i++; TU.stepT = 0; }
}
function drawTutor() {
  const I = iv(); if (!TU.on || I.run.over) return;
  const s = TU.odT > 0 ? OD_STEP : STEPS[TU.i]; if (!s) return;
  const W = innerWidth, H = innerHeight, u = unit(), pulse = 0.5 + 0.5 * Math.sin(frameN * 0.15);
  const bx = W * 0.2, bw = W * 0.6, by = u * 2.05;   // under the vitals / wave counter, clear of the touch controls
  g.fillStyle = 'rgba(6,14,22,0.72)'; g.fillRect(bx, by - u * 0.42, bw, u * 0.84);
  g.strokeStyle = PAL.cyan; g.lineWidth = 1.5; g.strokeRect(bx, by - u * 0.42, bw, u * 0.84);
  flat(`训练 ${Math.min(TU.i + 1, STEPS.length)}/${STEPS.length}`, bx + u * 0.3, by, u * 0.28, PAL.amber, 'left', 700);
  flat(s.t, bx + u * 2.0, by, u * 0.32, PAL.ink, 'left', 600, bw - u * 2.3);
  // ring the control this step is about
  let q = null;
  if (s.btn === 'stick') { const h0 = stickHome(); q = { x: h0.x, y: h0.y, r: STICK_R }; }
  else if (s.btn) { const b = BTN.find((bb) => bb.k === s.btn); if (b) q = btnPos(b); }
  if (q) circle(q.x, q.y, q.r * (1.12 + 0.12 * pulse), null, `rgba(255,190,80,${0.5 + 0.5 * pulse})`, 3);
}

// ---------------------------------------------------------------- drawing
function drawPlay() {
  const I = iv(), G = I.G, run = I.run, W = innerWidth, H = innerHeight, u = unit(), p = G.player, T = I.touch;
  if (!p) return;
  // vitals
  const bw = Math.min(260, W * 0.3), bh = Math.max(14, u * 0.42);
  bar(u * 0.5, u * 0.45, bw, bh, p.hp / p.maxHp, p.hp / p.maxHp < 0.3 ? PAL.red : PAL.green, '装甲', String(Math.ceil(p.hp)));
  bar(u * 0.5, u * 0.45 + bh + 4, bw, bh * 0.75, p.en / p.maxEn, p.overheat > 0 ? PAL.red : PAL.cyan, p.overheat > 0 ? '过热' : '能量');
  if (G.od) bar(u * 0.5, u * 0.45 + bh * 1.75 + 8, bw * 0.6, bh * 0.6, G.od.k, G.od.t > 0 ? '#fff' : PAL.amber, '');
  // wave / time
  const M = I.MISSIONS[I.cfg.mission];
  const nW = M && M.waves ? M.waves.length : 0;
  text(`${run.wave >= 0 ? (nW ? `第 ${run.wave + 1}/${nW} 波` : `第 ${run.wave + 1} 波`) : ''}   击毁 ${G.stats.kills}   ${clock(run.t)}`, W - 1.5 * u, u * 0.75, u * 0.36, PAL.ink, 'right');
  // wind (gale mission): arrow = where the wind blows, in screen space
  if (WIND && WIND.on) {
    const sh = G.windShiftT > 0, a = sh ? WIND.next : WIND.a, yaw = I.cam.yaw;
    const wx = Math.cos(a), wz = Math.sin(a), sx = wx * Math.cos(yaw) - wz * Math.sin(yaw), sy = wx * Math.sin(yaw) + wz * Math.cos(yaw);
    const cx = W - 2.2 * u, cy = 1.75 * u, L = 0.45 * u, n = Math.hypot(sx, sy) || 1, dx = sx / n, dy = sy / n;
    circle(cx, cy, 0.62 * u, 'rgba(10,16,24,0.5)', sh ? PAL.amber : PAL.line);
    g.strokeStyle = sh ? PAL.amber : PAL.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - dx * L, cy - dy * L); g.lineTo(cx + dx * L, cy + dy * L);
    g.lineTo(cx + dx * L * 0.35 - dy * L * 0.45, cy + dy * L * 0.35 + dx * L * 0.45); g.moveTo(cx + dx * L, cy + dy * L); g.lineTo(cx + dx * L * 0.35 + dy * L * 0.45, cy + dy * L * 0.35 - dx * L * 0.45); g.stroke();
    text(sh ? '风向将变' : '风向', cx - 0.85 * u, cy, u * 0.28, sh ? PAL.amber : PAL.dim, 'right');
  }
  // boss
  if (!el('bossBox').classList.contains('hidden') && G.boss && G.boss.alive) {
    const w = Math.min(520, W * 0.46), x = (W - w) / 2, y = u * 1.35;
    text(el('bossName').textContent, W / 2, y - u * 0.32, u * 0.34, PAL.amber);
    bar(x, y, w, u * 0.26, G.boss.hp / G.boss.maxHp, PAL.red, '');
  }
  // banner / hint (mirrors main.js's DOM text)
  const bn = el('banner');
  if (bn.classList.contains('show') && I.state() !== 'revive') {   // the revive panel has its own title
    let [t1, t2] = stripTags(bn.innerHTML).split('\n').map(zh);
    if (!t1) { t1 = t2; t2 = ''; }
    const by = TU.on ? H * 0.36 : H * 0.3;
    if (t1) text(t1, W / 2, by, u * 0.8, bn.classList.contains('warn') ? PAL.red : PAL.ink, 'center', 700);
    if (t2) text(t2, W / 2, by + u * 0.75, u * 0.36, PAL.dim);
  }
  const hn = el('hint'), ht = zh(hn.textContent);
  if (!hn.classList.contains('hidden') && ht && !TU.on) text(ht, W / 2, H * 0.78, u * 0.32, PAL.amber);
  // weapons
  const wl = ['R', 'L', 'S'].map((k) => { const w = G.pw[k]; if (!w) return ''; const am = w.reloadT > 0 ? '装填中' : w.d.mag ? `${w.ammo}/${w.d.mag}` : w.cd > 0 ? `${w.cd.toFixed(1)} 秒` : '就绪'; return `${wName(w.d.name)} ${am}`; });
  text(wl.join('   ·   '), W / 2, H - u * 0.4, u * 0.3, PAL.dim);
  // reticle
  circle(W / 2, H / 2, u * 0.22, null, 'rgba(255,255,255,0.75)', 1.5);
  g.fillStyle = '#fff'; g.fillRect(W / 2 - 1, H / 2 - 1, 2, 2);
  // stick
  const sh = stickHome();
  if (T.stick !== null) { circle(T.ox, T.oy, STICK_R, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.35)'); circle(T.ox + T.mx * STICK_R, T.oy + T.my * STICK_R, STICK_R * 0.42, 'rgba(95,227,255,0.45)', '#fff', 1.5); }
  else { circle(sh.x, sh.y, STICK_R, null, 'rgba(255,255,255,0.18)'); text('移动', sh.x, sh.y, u * 0.3, PAL.dim); }
  // buttons
  for (const b of BTN) {
    const q = btnPos(b), on = !!T.b[b.k];
    const ready = b.k !== 'od' || (G.od && G.od.k >= 1);
    circle(q.x, q.y, q.r, on ? 'rgba(255,255,255,0.35)' : 'rgba(10,16,24,0.45)', ready ? b.c : PAL.off, on ? 3 : 2);
    text(b.t, q.x, q.y - (b.s ? q.r * 0.16 : 0), Math.max(11, q.r * 0.42), ready ? PAL.ink : PAL.dim);
    if (b.s) text(b.s, q.x, q.y + q.r * 0.34, Math.max(9, q.r * 0.24), PAL.dim);
  }
  const pp = pausePos(); circle(pp.x, pp.y, pp.r, 'rgba(10,16,24,0.5)', PAL.line); text('II', pp.x, pp.y, pp.r * 0.8);
  if (I.state() === 'play') drawTutor();
}
function drawTitle() {
  const I = iv(), W = innerWidth, H = innerHeight, u = unit(), ks = missions(), k = ks[misIdx % ks.length], M = I.MISSIONS[k];
  panel(GAME_NAME, '横屏操作 · 左侧摇杆移动 · 右侧拖动转视角');
  const R = menuRects();
  text(M.name, W / 2, H * 0.48, u * 0.6, PAL.amber, 'center', 700);
  circle(R.prev.x, R.prev.y, R.prev.r, 'rgba(10,20,28,0.8)', PAL.line); text('‹', R.prev.x, R.prev.y - 2, R.prev.r * 1.3);
  circle(R.next.x, R.next.y, R.next.r, 'rgba(10,20,28,0.8)', PAL.line); text('›', R.next.x, R.next.y - 2, R.next.r * 1.3);
  text(`${misIdx % ks.length + 1} / ${ks.length}${k === INTRO_KEY ? ' · 新手先打这一关' : ''}`, W / 2, H * 0.6, u * 0.28, PAL.dim);
  button(R.garage, '机库', PAL.amber);
  button(R.go, '出击');
  text(money(I.save.cr), u * 0.5, u * 0.6, u * 0.34, PAL.amber, 'left', 700);
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
  panel(I.run.won ? '任务完成' : '任务失败', `用时 ${clock(I.run.t)} · 击毁 ${I.G.stats.kills}`);
  const got = RW.earned * (RW.doubled ? 2 : 1);
  text(`${RW.rank && I.run.won ? `评级 ${RW.rank} · ` : ''}获得 ${got} 资金${RW.doubled ? '（已翻倍）' : ''} · 持有 ${I.save.cr}`, W / 2, H * 0.42, u * 0.4, PAL.amber);
  if (RW.recap.length) {   // how you lost
    const who = I.run.coreLost ? `${(I.G.core && I.G.core.label) || '目标'}主要被` : '主要伤害来自';
    text(`${who}：${RW.recap.map((r) => `${r.name} ${r.dmg}`).join(' · ')}`, W / 2, H * 0.49, u * 0.32, PAL.red);
  }
  const canDouble = !RW.doubled && RW.earned > 0;
  button(Q.a, canDouble ? `${VID()}报酬翻倍` : '报酬翻倍', canDouble ? PAL.amber : PAL.off);
  button(Q.b, '分享给好友', PAL.cyan);
  button(Q.c, '再来一次', PAL.cyan);
  button(Q.d, RW.earned > 0 ? '去机库' : '返回标题', PAL.dim);
}
function drawToast(dt) {
  if (RW.toastT <= 0) return;
  RW.toastT -= dt;
  const W = innerWidth, H = innerHeight, u = unit();
  g.globalAlpha = Math.min(1, RW.toastT * 2);
  g.font = `600 ${Math.round(u * 0.34)}px ${FONT}`;
  const w = Math.min(W * 0.9, g.measureText(RW.toast).width + u * 1.2);
  g.fillStyle = 'rgba(8,14,20,0.9)'; g.fillRect((W - w) / 2, H * 0.12 - u * 0.4, w, u * 0.8);
  text(RW.toast, W / 2, H * 0.12, u * 0.34, PAL.ink);
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- per-frame composite
let prevSt = 'loading', booted = false;
function boot(I) {   // once main.js is up: tutorial mission, quality tier
  booted = true;
  if (!I.MISSIONS[INTRO_KEY]) I.MISSIONS[INTRO_KEY] = INTRO;
  initQuality();
}
function afterRender(dt = 1 / 60) {
  const I = iv();
  let st = I.state();
  if (st === 'loading') { prevSt = st; return; }
  if (!booted) boot(I);
  if (st === 'title') {
    const m = takeJump(), ks = missions();
    if (m && I.MISSIONS[m]) { const i = ks.indexOf(m); if (i >= 0) misIdx = i; startMission(m); st = I.state(); }   // opened from a share card
    else if (!WX.introDone && !(I.save.earned > 0) && !stats.summary().length) { startMission(INTRO_KEY); st = I.state(); }               // first launch: tutorial
  }
  // state transitions
  if (st === 'play' && !['play', 'pause', 'revive'].includes(prevSt)) newRun(I);
  if (st === 'result' && prevSt !== 'result') readResult(I);
  if ((st === 'garage') !== (prevSt === 'garage')) setGarageView(st === 'garage');
  if (st === 'play') {
    if (canRevive(I)) { I.setState('revive'); st = 'revive'; }
    else { tutorStep(I, dt); const m = monitor(); if (m) toast(m); }
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
    else if (st === 'garage') drawGarage();
    else if (st === 'result') drawResult();
    else panel('加载中');
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
  cv = document.createElement('canvas'); g = cv.getContext('2d'); S.g = g; resize();
  tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  scene = new THREE.Scene(); cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  scene.add(mesh);
  const wait = () => { if (window.__iv && window.__iv.G) { window.__iv.G.afterRender = afterRender; } else setTimeout(wait, 50); };
  wait();
  initAds(); initShare(curMission);
  initGarage({ iv, g: () => g, startMission, missionName: () => (curMission() || {}).name || '', toast, showRewarded, adMode, onAd });
  window.__ivwx = { stats, WX, RW, TU };   // test / DevTools hooks
  wx.onTouchStart(onStart); wx.onTouchMove(onMove); wx.onTouchEnd(onEnd); wx.onTouchCancel(onEnd);
  addEventListener('resize', resize);
}
