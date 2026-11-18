// Canvas HUD + touch input for the WeChat build. main.js still writes its HUD into (fake) DOM elements;
// this draws a compact HUD into a 2D canvas, uploads it as a texture and composites it over the 3D frame,
// and feeds wx touches straight into main.js's touch state (__iv.touch).
/* global wx */
import * as THREE from 'three';
import { explodeAt, WIND } from '../../site/combat.js';
import { GAME_NAME, AGE, AGE_TEXT, HEALTH, GAME_CLUB } from './config.js';
import { initAds, adMode, adBusy, showRewarded, initShare, shareMission, takeJump } from './ads.js';
import { S, PAL, FONT, unit, inRect, el, zh, wName, stripTags, money, clock, text, flat, bar, box, circle, panel, button } from './ui.js';
import { initGarage, drawGarage, garageStart, garageMove, garageEnd, garageEnter } from './garage.js';
import { initQuality, monitor, resetMonitor, thinParticles } from './quality.js';
import { WX, saveWX } from './store.js';
import { INTRO, INTRO_KEY, STEPS, OD_STEP } from './intro.js';
import { snapRun, topSources } from './recap.js';
import * as stats from './stats.js';

const iv = () => window.__iv;
let cv, g, tex, scene, cam, mesh, K = 1, frameN = 0, lastState = '', misIdx = 0, redraw = false;
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
    daily: { x: W / 2 - 4.1 * u, y: H * 0.68 + 1.4 * u, w: 8.2 * u, h: 0.9 * u },
    quit: { x: W / 2 - 2.2 * u, y: H * 0.68, w: 4.4 * u, h: 1.15 * u },
    age: { x: 0.5 * u, y: 1.0 * u, w: 2.4 * u, h: 0.62 * u },
  };
}
// ---------------------------------------------------------------- progression: a mission opens once one of the two before it is cleared
const DIFF_CN = { easy: '新兵', normal: '正规', hard: '王牌' };
const cleared = (k) => { const M = iv().MISSIONS[k], b = iv().save.best, p = ((M && M.bestKey) || k) + '.'; return Object.keys(b).some((x) => x.startsWith(p)); };
function frontier() { let f = -1; missions().forEach((k, i) => { if (cleared(k)) f = i; }); return f; }
const AHEAD = 2;
const isOpen = (i) => i <= frontier() + AHEAD;
// how many more clears (each opening AHEAD further) until mission i opens
const clearsToOpen = (i) => Math.ceil((i - AHEAD - frontier()) / AHEAD);
const dailyOpen = () => frontier() >= 1;   // after the tutorial and the proving ground
function goCurrent() {
  const ks = missions(), i = misIdx % ks.length;
  if (!isOpen(i)) { toast(`尚未解锁 · 再通关 ${clearsToOpen(i)} 场前面的任务`); return; }
  startMission();
}
// two-by-two button grid under a panel (revive / result screens)
function gridRects() {
  const W = innerWidth, H = innerHeight, u = unit(), w = 4.4 * u, h = 1.1 * u, y0 = H * 0.56, x0 = W / 2 - w - 0.2 * u, x1 = W / 2 + 0.2 * u;
  return { a: { x: x0, y: y0, w, h }, b: { x: x1, y: y0, w, h }, c: { x: x0, y: y0 + h + 0.35 * u, w, h }, d: { x: x1, y: y0 + h + 0.35 * u, w, h } };
}

// ---------------------------------------------------------------- per-run state: rewards, tutorial, stats
const RW = { revived: false, didRevive: false, doubled: false, earned: 0, rank: '', toast: '', toastT: 0, recap: [], logged: false, addCard: false };
const UI = { age: false };   // the 适龄提示 panel is open over the title
const TU = { on: false, i: 0, stepT: 0, p0: new THREE.Vector3(), od: false, odT: 0 };
function newRun(I) {
  Object.assign(RW, { revived: false, didRevive: false, doubled: false, earned: 0, rank: '', recap: [], logged: false, addCard: false });
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
  // first real win: ask once to add the game to 我的小程序 (it is how players find it again tomorrow)
  if (I.run.won && I.cfg.mission !== INTRO_KEY && !WX.addTip) { RW.addCard = true; WX.addTip = true; saveWX(); }
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
// rebuild main.js's hangar lists in place (setState('garage') also resets main.js's own view offset)
function regarage() { iv().setState('garage'); setGarageView(true); }

// ---------------------------------------------------------------- 游戏圈 button: a native button, shown on the title only
let club = null, clubOn = false;
function initClub() {
  if (!GAME_CLUB || typeof wx.createGameClubButton !== 'function') return;
  const u = unit();
  try {
    club = wx.createGameClubButton({ icon: 'white', style: { left: Math.round(0.55 * u), top: Math.round(innerHeight - 1.75 * u), width: 36, height: 36 } });
    club.hide();
  } catch (e) { club = null; }
}
function showClub(on) { if (!club || on === clubOn) return; clubOn = on; if (on) club.show(); else club.hide(); }
const clubPos = () => { const u = unit(); return { x: 0.55 * u + 18, y: innerHeight - 1.75 * u + 18 }; };

// ---------------------------------------------------------------- touch
function onStart(res) {
  const I = iv(); if (!I) return;
  redraw = true;   // the title redraws at 2 Hz when idle; a tap must show at once
  const st = I.state(), T = I.touch;
  for (const t of res.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (st === 'title') {
      if (splashOn()) continue;
      if (UI.age) { UI.age = false; continue; }   // any tap closes the 适龄提示 panel
      const R = menuRects(), n = missions().length;
      if (hit(R.prev, x, y, 1.6)) misIdx = (misIdx + n - 1) % n;
      else if (hit(R.next, x, y, 1.6)) misIdx = (misIdx + 1) % n;
      else if (inRect(R.go, x, y)) goCurrent();
      else if (inRect(R.garage, x, y)) I.setState('garage');
      else if (inRect(R.daily, x, y)) { if (dailyOpen()) startMission('daily'); else toast('通关「演习场」后开放每日挑战'); }
      else if (inRect(R.age, x, y)) UI.age = true;
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
      if (RW.addCard) { RW.addCard = false; continue; }   // first tap dismisses the add-to-My-Mini-Programs card
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
// extra touch aim assist while a fire button is held: main.js already drifts the view toward the primary lock;
// a thumb on the fire button cannot also fine-aim, so pull harder, most of all while the other thumb is off the view
function aimAssist(I, dt) {
  const T = I.touch, lt = I.G.lockTarget;
  if (!T.active || !lt || lt.sx === undefined || !(T.b.b0 || T.b.b2)) return;
  const ox = (lt.sx - innerWidth / 2) / innerHeight, oy = (lt.sy - innerHeight / 2) / innerHeight;
  const k = T.look === null ? 2.4 : 1.0;
  I.cam.yaw -= ox * 2.2 * k * dt; I.cam.pitch -= oy * 1.6 * k * dt;
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
  const R = menuRects(), i = misIdx % ks.length, open = isOpen(i), done = cleared(k);
  text(`${M.name}${done ? ' ✓' : ''}`, W / 2, H * 0.48, u * 0.6, open ? PAL.amber : PAL.dim, 'center', 700);
  circle(R.prev.x, R.prev.y, R.prev.r, 'rgba(10,20,28,0.8)', PAL.line); text('‹', R.prev.x, R.prev.y - 2, R.prev.r * 1.3);
  circle(R.next.x, R.next.y, R.next.r, 'rgba(10,20,28,0.8)', PAL.line); text('›', R.next.x, R.next.y - 2, R.next.r * 1.3);
  const sub = !open ? `再通关 ${clearsToOpen(i)} 场前面的任务解锁` : k === INTRO_KEY ? '新手先打这一关' : `难度 ${DIFF_CN[I.cfg.diff] || ''} · 可在机库更改`;
  text(`${i + 1} / ${ks.length} · ${sub}`, W / 2, H * 0.6, u * 0.28, open ? PAL.dim : PAL.red);
  button(R.garage, '机库', PAL.amber);
  button(R.go, open ? '出击' : '未解锁', open ? PAL.cyan : PAL.off);
  // daily challenge: today's seeded map / enemies / boss
  const D = I.MISSIONS.daily, dk = D && D.bestKey ? Object.keys(I.save.best).some((x) => x.startsWith(D.bestKey + '.')) : false;
  const dEnv = D ? (D.desc.split(' · ')[1] || '') : '';
  button(R.daily, dailyOpen() ? `每日挑战 · ${dEnv}${dk ? ' · 今日已完成 ✓' : ' · 今日新地图与头目'}` : '每日挑战 · 通关「演习场」后开放', dailyOpen() ? PAL.amber : PAL.off, 0.38);
  text(money(I.save.cr), u * 0.5, u * 0.6, u * 0.34, PAL.amber, 'left', 700);
  const mc = (el('btnMedals').textContent || '').replace(/^\S+\s*/, '');
  if (mc) text(`勋章 ${mc}`, W - 0.5 * u, H - 0.5 * u, u * 0.28, PAL.dim, 'right');
  drawAgeBadge(R.age);
  if (club) { const c = clubPos(); text('游戏圈', c.x, c.y + 26, u * 0.24, PAL.dim); }
  if (UI.age) drawAgePanel();
}
// 适龄提示: a badge on the title and boot screens; tapping it opens the full text
function drawAgeBadge(r) {
  const u = unit();
  box(r, 'rgba(20,60,30,0.85)', '#6fdc8c', 2);
  text(`${AGE}+`, r.x + 0.5 * u, r.y + r.h / 2, r.h * 0.5, '#e8ffe8', 'center', 800);
  text('适龄提示', r.x + 1.55 * u, r.y + r.h / 2, u * 0.24, '#bff0c8', 'center', 600);
}
// greedy line wrap by measured width (CJK text has no spaces to break at)
function wrap(s, maxW, size, weight = 500) {
  g.font = `${weight} ${Math.round(size)}px ${FONT}`;
  const out = []; let cur = '';
  for (const ch of s) { if (cur && g.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch.trim(); } else cur += ch; }
  if (cur) out.push(cur);
  return out;
}
function drawAgePanel() {
  const W = innerWidth, H = innerHeight, u = unit(), w = Math.min(W * 0.84, 17 * u), fs = u * 0.27, lh = u * 0.44;
  const lines = AGE_TEXT.flatMap((s, j) => wrap(`${j + 1}. ${s}`, w - u, fs).map((t, k) => (k ? `    ${t}` : t)));
  const h = 1.5 * u + lines.length * lh + 0.9 * u, x = (W - w) / 2, y = Math.max(4, (H - h) / 2);
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, W, H);
  box({ x, y, w, h }, 'rgba(8,16,22,0.96)', '#6fdc8c', 2);
  text(`适龄提示 · ${AGE} 周岁以上`, W / 2, y + 0.65 * u, u * 0.42, PAL.ink, 'center', 800);
  lines.forEach((t, j) => flat(t, x + 0.5 * u, y + 1.45 * u + j * lh, fs, PAL.dim, 'left', 500));
  text('点击任意位置关闭', W / 2, y + h - 0.45 * u, u * 0.24, PAL.dim);
}
// ---------------------------------------------------------------- boot screen: 健康游戏忠告, 适龄提示, download progress
const SPL = { t0: Date.now(), min: 3000 };   // the notice stays up at least 3 s even when the package is cached
const splashOn = () => Date.now() - SPL.t0 < SPL.min;
function drawSplash() {
  const W = innerWidth, H = innerHeight, u = unit(), I = window.__iv, L = window.__MA_LOAD || { p: 0, phase: '载入中' };
  const ready = I && I.state && I.state() !== 'loading', le = el('loading'), err = le && /载入失败/.test(le.innerHTML || '');
  g.fillStyle = '#070c12'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(95,227,255,0.06)'; for (let x = 0; x < W; x += u) g.fillRect(x, 0, 1, H);
  text(GAME_NAME, W / 2, H * 0.3, u * 1.1, PAL.ink, 'center', 800);
  text('科幻机甲动作射击', W / 2, H * 0.3 + u * 0.95, u * 0.34, PAL.dim);
  const p = ready ? 1 : L.p, bw = Math.min(W * 0.46, 14 * u);
  bar((W - bw) / 2, H * 0.53, bw, u * 0.2, p, err ? PAL.red : PAL.cyan, '');
  const ph = err ? '载入失败，请检查网络后重新打开' : ready ? '准备就绪' : L.p >= 1 ? '解析模型与场景' : `${L.phase} ${Math.round(L.p * 100)}%`;
  text(ph, W / 2, H * 0.53 + u * 0.6, u * 0.3, err ? PAL.red : PAL.dim);
  text('健康游戏忠告', W / 2, H - 1.75 * u, u * 0.3, PAL.ink, 'center', 700);
  HEALTH.forEach((s, j) => text(s, W / 2, H - (1.15 - j * 0.5) * u, u * 0.28, PAL.dim));
  drawAgeBadge(menuRects().age);
}
// before main.js reaches the title there is no game frame (and so no afterRender): draw the boot screen ourselves
function splashLoop() {
  const I = window.__iv;
  if (I && I.G && I.G.renderer && I.state() !== 'loading') return;   // afterRender takes over
  if (I && I.G && I.G.renderer) {
    g.setTransform(K, 0, 0, K, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    drawSplash(); tex.needsUpdate = true;
    const r = I.G.renderer; r.setRenderTarget(null); r.render(scene, cam);
  }
  requestAnimationFrame(splashLoop);
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
  if (RW.addCard) drawAddCard();
}
// points at the top-right capsule (···) where 添加到我的小程序 lives
function drawAddCard() {
  const W = innerWidth, H = innerHeight, u = unit();
  let mb = null; try { mb = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect(); } catch (e) { mb = null; }
  const ax = mb && mb.width ? mb.left + mb.width * 0.3 : W - 2.2 * u, ay = mb && mb.height ? mb.bottom + 4 : 1.3 * u;
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, W, H);
  const w = Math.min(W * 0.5, 12 * u), h = 2.6 * u, x = Math.min(W - w - 0.4 * u, ax - w * 0.75), y = ay + 0.9 * u;
  box({ x, y, w, h }, 'rgba(8,16,22,0.97)', PAL.amber, 2);
  g.strokeStyle = PAL.amber; g.lineWidth = 3; g.beginPath(); g.moveTo(ax, y); g.lineTo(ax, ay + 6); g.moveTo(ax - 8, ay + 16); g.lineTo(ax, ay + 6); g.lineTo(ax + 8, ay + 16); g.stroke();
  text(`首胜！把「${GAME_NAME}」添加到我的小程序`, x + w / 2, y + 0.55 * u, u * 0.36, PAL.ink, 'center', 700);
  text('点右上角「···」→「添加到我的小程序」', x + w / 2, y + 1.2 * u, u * 0.3, PAL.amber);
  text('下次在微信首页下拉就能找到，每日挑战天天换新', x + w / 2, y + 1.7 * u, u * 0.26, PAL.dim);
  text('点击任意位置继续', x + w / 2, y + h - 0.32 * u, u * 0.22, PAL.dim);
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
function boot(I) {   // once main.js is up: tutorial mission, quality tier, first-launch difficulty, where the title opens
  booted = true;
  if (!I.MISSIONS[INTRO_KEY]) I.MISSIONS[INTRO_KEY] = INTRO;
  initQuality();
  if (!WX.diffInit) {   // brand-new players start on 新兵 (half damage taken); returning web-save players keep theirs
    if (!Object.keys(I.save.best).length && !(I.save.earned > 0)) I.cfg.diff = 'easy';
    WX.diffInit = true; saveWX();
  }
  const ks = missions(), f = frontier();
  misIdx = Math.min(ks.length - 1, Math.max(0, f + 1));   // open on the next mission to play
}
function afterRender(dt = 1 / 60) {
  const I = iv();
  let st = I.state();
  if (st === 'loading') { prevSt = st; return; }
  if (!booted) boot(I);
  const splash = splashOn() && st === 'title';
  showClub(st === 'title' && !splash && !UI.age);
  if (st === 'title' && !splash) {
    const m = takeJump(), ks = missions();
    if (m && I.MISSIONS[m]) { const i = ks.indexOf(m); if (i >= 0) misIdx = i; startMission(m); st = I.state(); }   // opened from a share card
    else if (!WX.introDone && !(I.save.earned > 0) && !stats.summary().length) { startMission(INTRO_KEY); st = I.state(); }               // first launch: tutorial
  }
  // state transitions
  if (st === 'play' && !['play', 'pause', 'revive'].includes(prevSt)) newRun(I);
  if (st === 'result' && prevSt !== 'result') readResult(I);
  if ((st === 'garage') !== (prevSt === 'garage')) { setGarageView(st === 'garage'); if (st === 'garage') garageEnter(); }
  if (st === 'play') {
    if (canRevive(I)) { I.setState('revive'); st = 'revive'; }
    else { tutorStep(I, dt); aimAssist(I, dt); const m = monitor(); if (m) toast(m); }
  }
  prevSt = st;
  frameN++;
  const dirty = st !== lastState || st !== 'title' || splash || redraw || frameN % 30 === 0 || RW.toastT > 0;
  if (dirty && (frameN % 2 === 0 || st !== lastState || redraw)) {
    redraw = false;   // redraw at ~30 Hz, the texture upload is the cost
    lastState = st;
    g.setTransform(K, 0, 0, K, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    if (st === 'play') drawPlay();
    else if (st === 'pause') { drawPlay(); drawPause(); }
    else if (st === 'revive') { drawPlay(); drawRevive(); }
    else if (splash) drawSplash();
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
  requestAnimationFrame(splashLoop);
  initAds(); initShare(curMission); initClub();
  initGarage({ iv, g: () => g, startMission, goCurrent, regarage, missionName: () => (curMission() || {}).name || '', toast, showRewarded, adMode, onAd });
  window.__ivwx = { stats, WX, RW, TU, UI, SPL, frontier, isOpen, club: () => club };   // test / DevTools hooks
  wx.onTouchStart(onStart); wx.onTouchMove(onMove); wx.onTouchEnd(onEnd); wx.onTouchCancel(onEnd);
  addEventListener('resize', resize);
}
