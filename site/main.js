// IRON VANGUARD — main loop, camera, input, aiming, waves, HUD, hangar.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadKit } from './kit.js';
import { buildArena, ARENA, solids, raySolids, groundAt, pointInSolid, clearLine } from './world.js';
import { FX } from './fx.js';
import { initAudio, sfx, thrust, musicTick, setVolume } from './audio.js';
import { Mech, PALETTES, FRAMES, angDiff } from './mech.js';
import { G, WEAPONS, ARM_KEYS, SHOULDER_KEYS, weaponState, weaponTick, updateCombat, Turret, Drone, Walker, Boss, dropRepair, enemyEnts, rayEnts } from './combat.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const DIFFS = {
  easy: { name: '新兵', desc: '受到伤害 ×0.5 · 敌方耐久 ×0.8', dmg: 0.5, hp: 0.8 },
  normal: { name: '正规', desc: '标准', dmg: 0.8, hp: 1 },
  hard: { name: '王牌', desc: '受到伤害 ×1.6 · 敌方耐久 ×1.25', dmg: 1.25, hp: 1.25 },
};

// ------------------------------------------------------------------ config (per-viewer convenience only)
const CFG_KEY = 'ironvanguard.cfg.v1';
const cfg = { palette: 'vanguard', frame: 'std', R: 'rifle', L: 'gatling', S: 'missile', diff: 'normal', sens: 1, vol: 0.7, invY: false };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } };
let best = {};
try { best = JSON.parse(localStorage.getItem('ironvanguard.best') || '{}'); } catch (e) { /* ignore */ }

// ------------------------------------------------------------------ renderer / scene
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xc4cfd8);
scene.fog = new THREE.Fog(HORIZON, 90, 560);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;
// sky dome
const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x6f98bf) }, hor: { value: HORIZON }, sun: { value: new V3(0.45, 0.55, 0.7).normalize() } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
  fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sun; varying vec3 vD;
    void main(){ float h = clamp(vD.y, 0.0, 1.0); vec3 c = mix(hor, top, pow(h, 0.55));
      float s = max(dot(vD, sun), 0.0); c += vec3(1.0, 0.92, 0.8) * (pow(s, 600.0) * 4.0 + pow(s, 8.0) * 0.15);
      if (vD.y < 0.0) c = hor; gl_FragColor = vec4(c, 1.0); }`,
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
const hemi = new THREE.HemisphereLight(0xdfe9f2, 0x6a6660, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1de, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const SC = sun.shadow.camera; SC.left = -70; SC.right = 70; SC.top = 70; SC.bottom = -70; SC.near = 10; SC.far = 400; SC.updateProjectionMatrix();
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const SUN_DIR = new V3(0.45, 0.55, 0.7).normalize();

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 2000);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.45, 2.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

G.scene = scene; G.camera = camera;
const fx = new FX(scene); G.fx = fx;

// ------------------------------------------------------------------ mech callbacks (sounds, dust, shake)
const mctx = {
  onStep(m) { const d = m.pos.distanceTo(G.player ? G.player.pos : m.pos); sfx('step', d * (m === G.player ? 1 : 0.8)); if (m.scale > 1.2 || m === G.player) fx.dust(m.pos, 2, 1.6 * m.scale, 3); if (m === G.player) fx.trauma = Math.min(1, fx.trauma + 0.03); },
  onLand(m, imp) { fx.dust(m.pos, 10, 2.6 * m.scale, 9); fx.ring(m.pos, null, 1, 5 * m.scale, 0.4, 0xd8d0c0); if (m === G.player) { sfx('land'); fx.trauma = Math.min(1, fx.trauma + imp / 60); } else sfx('step', m.pos.distanceTo(G.player.pos)); },
  onQuickBoost(m) {
    sfx('qboost', m === G.player ? 0 : m.pos.distanceTo(G.player.pos));
    for (const fl of m.flames) if (fl.back) { const p = fl.holder.getWorldPosition(new V3()); fx.sparks(p, new V3(-m.vel.x, -6, -m.vel.z).normalize(), 10, m.isBoss ? 0xffa060 : 0x9fdcff, 16, 0.5, 0.3, 0.3); fx.smoke(p, 2, 1.6, 0.8, 0xcfd6dc, 0.5, 0.35); }
    if (m.grounded) fx.dust(m.pos, 6, 2, 6);
  },
  onJump(m) { fx.dust(m.pos, 6, 2, 5); },
  onOverheat(m) { if (m === G.player) { sfx('overheat'); showHint('能量过热！停止推进 2 秒', 1.6); } },
};

// ------------------------------------------------------------------ input
const keys = new Set();
const mouse = { b0: false, b2: false, dx: 0, dy: 0, x: innerWidth / 2, y: innerHeight / 2 };
let pointerLocked = false, freeMouse = false, ePressed = false;
addEventListener('keydown', (e) => {
  if (e.repeat) { return; }
  keys.add(e.code);
  if (e.code === 'KeyE') ePressed = true;
  if (e.code === 'KeyR' && state === 'play') manualReload();
  if (e.code === 'Escape' && state === 'play' && !pointerLocked) setState('pause');
  else if (e.code === 'Escape' && state === 'pause') resume();
  if (['Space', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(e.code) && state === 'play') e.preventDefault();
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyE') ePressed = false; });
addEventListener('blur', () => { keys.clear(); mouse.b0 = mouse.b2 = false; ePressed = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  initAudio();
  if (state === 'play') {
    if (!pointerLocked && !freeMouse) requestLock();
    if (e.button === 0) mouse.b0 = true; if (e.button === 2) mouse.b2 = true;
  } else if (state === 'garage' || state === 'title') { gDrag = true; }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.b0 = false; if (e.button === 2) mouse.b2 = false; gDrag = false; });
addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (pointerLocked) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  if (gDrag && (state === 'garage' || state === 'title')) gYaw -= e.movementX * 0.008;
});
function requestLock() {
  try {
    const r = canvas.requestPointerLock && canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => { freeMouse = true; showHint('浏览器不允许锁定鼠标：准星跟随光标，光标靠近屏幕边缘会转动视角', 4); });
  } catch (e) { freeMouse = true; }
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked && state === 'play' && !freeMouse) setState('pause');
});
document.addEventListener('pointerlockerror', () => { freeMouse = true; showHint('浏览器不允许锁定鼠标：准星跟随光标，光标靠近屏幕边缘会转动视角', 4); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setState('pause'); });

// ------------------------------------------------------------------ camera
const cam = { yaw: 0, pitch: -0.05, dist: 11, fov: 68 };
let gYaw = 0.6, gDrag = false;
const _p = new V3(), _q = new V3(), _r = new V3();
function updateCamera(dt) {
  const p = G.player; if (!p) return;
  const s = p.scale;
  const right = _r.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const pivot = _p.set(p.pos.x, p.pos.y + 4.6 * s, p.pos.z).addScaledVector(right, 3.1 * s);
  const dir = _q.set(-Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch));
  const back = dir.clone().negate();
  const w = raySolids(pivot, back, cam.dist * s + 0.6, true);   // the floor never pushes the camera in (it just stays above it)
  let d = Math.min(cam.dist * s, w.t - 0.6);
  d = Math.max(2.5, d);
  camera.position.copy(pivot).addScaledVector(back, d);
  if (camera.position.y < 0.6) camera.position.y = 0.6;
  const tr = fx.trauma * fx.trauma;
  camera.position.x += (Math.random() - 0.5) * tr * 0.9; camera.position.y += (Math.random() - 0.5) * tr * 0.9; camera.position.z += (Math.random() - 0.5) * tr * 0.9;
  camera.lookAt(pivot.x + dir.x * 20, pivot.y + dir.y * 20, pivot.z + dir.z * 20);
  camera.rotation.z += (Math.random() - 0.5) * tr * 0.05;
  const fovT = 68 + (p.thrustLv > 0.5 ? 9 * p.thrustLv : 0);
  cam.fov += (fovT - cam.fov) * (1 - Math.exp(-6 * dt));
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
}
function garageCamera(dt, auto) {
  const p = G.player; if (!p) return;
  if (auto && !gDrag) gYaw += dt * 0.18;
  const c = new V3(p.pos.x, p.pos.y + 3.2 * p.scale, p.pos.z);
  const r = 11.5 * p.scale;
  camera.position.set(c.x + Math.sin(gYaw) * r, c.y + 1.6, c.z + Math.cos(gYaw) * r);
  camera.lookAt(c);
  if (camera.fov !== 50) { camera.fov = 50; cam.fov = 68; camera.updateProjectionMatrix(); }
}

// ------------------------------------------------------------------ aiming + locks
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _sp = new V3();
const lockR = () => innerHeight * 0.16, mslR = () => innerHeight * 0.3;
function reticlePx() { return freeMouse && state === 'play' ? { x: mouse.x, y: mouse.y } : { x: innerWidth / 2, y: innerHeight / 2 }; }
function updateAim() {
  const p = G.player; const rp = reticlePx();
  ndc.set(rp.x / innerWidth * 2 - 1, -(rp.y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  const skip = camera.position.distanceTo(p.center(_sp)) * 0.9;
  const o2 = o.clone().addScaledVector(d, skip);
  const w = raySolids(o2, d, 500);
  const ents = enemyEnts();
  const h = rayEnts(o2, d, w.t, ents);
  G.aimPoint.copy(o2).addScaledVector(d, h ? h.t : w.t);
  // locks
  const locks = [];
  for (const e of ents) {
    _sp.copy(e.c).project(camera);
    if (_sp.z > 1 || _sp.z < -1) continue;
    const sx = (_sp.x + 1) / 2 * innerWidth, sy = (1 - _sp.y) / 2 * innerHeight;
    const sd = Math.hypot(sx - rp.x, sy - rp.y), wd = e.c.distanceTo(p.pos);
    e.sx = sx; e.sy = sy;
    if (wd > 240 || sd > mslR()) continue;
    e.plosT = (e.plosT || 0) - 1;
    if (e.plosT <= 0) { e.plosT = 12; e.plos = clearLine(p.center(_q).clone(), e.c); }
    if (!e.plos) continue;
    locks.push({ e, sd });
  }
  locks.sort((a, b) => a.sd - b.sd);
  const prevPrim = G.lockTarget;
  G.lockTarget = locks.length && locks[0].sd < lockR() ? locks[0].e : null;
  G.locks = locks.slice(0, 6).map((l) => l.e);
  if (G.lockTarget && G.lockTarget !== prevPrim) sfx('lock');
  // when the reticle is on a locked target, pull the aim point onto it (small assist)
  if (G.lockTarget && !h) {
    const lt = G.lockTarget; const sd = Math.hypot(lt.sx - rp.x, lt.sy - rp.y);
    if (sd < innerHeight * 0.05) G.aimPoint.copy(lt.c);
  }
}

// ------------------------------------------------------------------ game flow
let state = 'loading', arenaGroup = null;
const run = { wave: -1, breakT: 0, t: 0, over: false, deathT: 0, won: false, bossPhaseT: 0, droneT: 0 };
const WAVES = [
  { title: 'WAVE 1', sub: '清除外围炮台与无人机', spawn: { turret: 5, drone: 6 } },
  { title: 'WAVE 2', sub: '装甲步行机接近', spawn: { walker: 3, drone: 6, turret: 3 } },
  { title: 'WAVE 3', sub: '全面进攻', spawn: { walker: 4, drone: 8, turret: 4 } },
  { title: 'FINAL WAVE', sub: '击破重装指挥机「暴君」', spawn: { boss: 1, drone: 3 } },
];

function makePlayer() {
  if (G.player) G.player.dispose();
  G.player = new Mech(scene, mctx, { palette: cfg.palette, frame: cfg.frame, loadout: { R: cfg.R, L: cfg.L, S: cfg.S }, yaw: 0 });
  G.player.pos.set(0, 0, 128);
  G.pw = { R: weaponState(cfg.R), L: weaponState(cfg.L), S: weaponState(cfg.S) };
  cam.yaw = 0; cam.pitch = -0.05;
  buildWeaponPanel();
}

function clearWorld() {
  for (const e of G.enemies) e.remove ? e.remove() : null;
  G.enemies.length = 0; G.shots.length = 0; G.queue.length = 0;
  for (const k of G.pickups) scene.remove(k.o);
  G.pickups.length = 0;
}

function newGame() {
  clearWorld();
  if (arenaGroup) scene.remove(arenaGroup);
  arenaGroup = buildArena(scene, 3);
  G.diff = { key: cfg.diff, ...DIFFS[cfg.diff] };
  makePlayer();
  Object.assign(G.stats, { shots: 0, hits: 0, kills: 0, dmgTaken: 0, dmgDealt: 0 });
  Object.assign(run, { wave: -1, breakT: 1.5, t: 0, over: false, deathT: 0, won: false, droneT: 0 });
  $('bossBox').classList.add('hidden');
}

function spot(minD, maxD, air) {
  const p = G.player.pos;
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2, r = minD + Math.random() * (maxD - minD);
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (Math.abs(x) > ARENA - 10 || Math.abs(z) > ARENA - 10) continue;
    if (!air && pointInSolid(new V3(x, 1, z), 4)) continue;
    if (air) { const y = groundAt(x, z, 99) + 10 + Math.random() * 6; return new V3(x, y, z); }
    return new V3(x, 0, z);
  }
  return new V3((Math.random() - 0.5) * 100, air ? 15 : 0, (Math.random() - 0.5) * 100);
}
function roofSpot(minD, maxD) {
  const p = G.player.pos;
  const roofs = solids.filter((s) => s.kind === 'building' && s.max.y > 6 && s.max.y <= 15 && s.max.x - s.min.x >= 8 && !solids.some((o) => o !== s && o.min.y >= s.max.y - 0.1 && o.max.x > s.min.x && o.min.x < s.max.x && o.max.z > s.min.z && o.min.z < s.max.z));
  const ok = roofs.filter((s) => { const d = Math.hypot((s.min.x + s.max.x) / 2 - p.x, (s.min.z + s.max.z) / 2 - p.z); return d > minD && d < maxD; });
  if (!ok.length) return null;
  const s = ok[Math.floor(Math.random() * ok.length)];
  return new V3((s.min.x + s.max.x) / 2, s.max.y, (s.min.z + s.max.z) / 2);
}

function startWave(i) {
  run.wave = i; const W = WAVES[i];
  banner(W.title, W.sub, i === 3);
  sfx(i === 3 ? 'alarm' : 'wave');
  const S = W.spawn;
  for (let k = 0; k < (S.turret || 0); k++) new Turret((Math.random() < 0.45 && roofSpot(50, 150)) || spot(55, 140));
  for (let k = 0; k < (S.drone || 0); k++) new Drone(spot(70, 140, true));
  for (let k = 0; k < (S.walker || 0); k++) new Walker(spot(80, 140));
  if (S.boss) {
    G.boss = new Boss(spot(90, 120), mctx);
    $('bossBox').classList.remove('hidden');
  }
}

G.onKill = (e) => {
  G.hud.kill = 0.3;
  if (e.kind === 'walker' && Math.random() < 0.6) dropRepair(e.c);
  else if (e.kind === 'drone' && Math.random() < 0.12) dropRepair(e.c);
  else if (e.kind === 'turret' && Math.random() < 0.2) dropRepair(e.c);
  if (e.kind === 'boss') { fx.trauma = 1; timeScaleT = 1.6; }
};
G.onBossPhase = () => { banner('暴君 · 第二形态', '武装切换：光束炮 / 闪电线圈', true); sfx('alarm'); for (let k = 0; k < 3; k++) new Drone(spot(50, 90, true)); };
G.onPlayerHit = () => {};
let timeScaleT = 0;

function waveLogic(dt) {
  const p = G.player;
  if (run.over) return;
  run.t += dt;
  if (!p.alive) {
    if (!run.deathT) { run.deathT = 2.8; fx.explosion(p.center(new V3()), 2.6, 0xff8040); sfx('bigboom'); p.root.visible = false; banner('机体损毁', 'SYSTEM DOWN', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (run.breakT > 0) {
    run.breakT -= dt;
    if (run.breakT <= 0) startWave(run.wave + 1);
    return;
  }
  const alive = G.enemies.filter((e) => !e.gone).length;
  if (run.wave === 3 && G.boss && G.boss.phase === 2 && G.boss.alive) {
    run.droneT -= dt;
    if (run.droneT <= 0) { run.droneT = 22; if (G.enemies.filter((e) => e.kind === 'drone' && e.alive).length < 3) for (let k = 0; k < 2; k++) new Drone(spot(60, 100, true)); }
  }
  if (alive === 0) {
    if (run.wave >= WAVES.length - 1) { if (!run.won) { run.won = true; banner('MISSION COMPLETE', '指挥机已击破', false); run.deathT = 3.5; } run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
    banner('WAVE CLEAR', '短暂整备 · 弹药补满 · 修复 25% 装甲', false);
    sfx('repair');
    for (const k of ['R', 'L', 'S']) { const w = G.pw[k]; w.ammo = w.d.mag || 0; w.reloadT = 0; w.cd = 0; }
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
    run.breakT = 4.5;
  }
}

function finish(win) {
  run.over = true;
  const p = G.player, s = G.stats;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const tm = run.t;
  let rank = 'C';
  if (win) {
    const dmgK = s.dmgTaken / p.maxHp;
    rank = dmgK < 0.6 && tm < 420 ? 'S' : dmgK < 1.4 && tm < 600 ? 'A' : 'B';
    const k = cfg.diff;
    if (!best[k] || tm < best[k]) { best[k] = Math.round(tm); try { localStorage.setItem('ironvanguard.best', JSON.stringify(best)); } catch (e) { /* ignore */ } }
  }
  $('rRank').textContent = rank;
  $('rTitle').textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
  $('rSub').textContent = win ? `演习完成 · ${DIFFS[cfg.diff].name}` : `在第 ${run.wave + 1} 波被击毁 · ${DIFFS[cfg.diff].name}`;
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  $('rStats').innerHTML = `<span>用时</span><b>${fmt(tm)}</b><span>击毁</span><b>${s.kills}</b><span>命中率</span><b>${acc}%</b><span>造成伤害</span><b>${Math.round(s.dmgDealt)}</b><span>承受伤害</span><b>${Math.round(s.dmgTaken)}</b><span>最佳用时</span><b>${best[cfg.diff] ? fmt(best[cfg.diff]) : '—'}</b>`;
  setState('result');
}

function manualReload() {
  for (const k of ['R', 'L']) { const w = G.pw[k]; if (w.d.mag && w.ammo < w.d.mag && w.reloadT <= 0) { w.reloadT = w.d.reload; sfx('reload'); } }
}

// ------------------------------------------------------------------ states / overlays
const overlays = ['title', 'garage', 'pause', 'result', 'loading'];
function setState(s) {
  state = s;
  for (const o of overlays) $(o).classList.toggle('hidden', o !== s);
  $('hud').classList.toggle('hidden', !(s === 'play' || s === 'pause'));
  if (s !== 'play' && document.pointerLockElement) document.exitPointerLock();
  if (s !== 'play') { mouse.b0 = mouse.b2 = false; thrust(0); }
  if (s === 'garage') buildGarage();
  if (s === 'title') $('bestTxt').textContent = Object.keys(best).length ? '最佳用时 ' + Object.entries(best).map(([k, v]) => `${DIFFS[k].name} ${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`).join(' · ') : '';
  if (s === 'garage' || s === 'title') camera.setViewOffset(innerWidth, innerHeight, s === 'garage' && innerWidth > 760 ? innerWidth * 0.2 : 0, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
}
function sortie() {
  initAudio(); saveCfg();
  newGame();
  setState('play');
  requestLock();
}
function resume() { setState('play'); if (!freeMouse) requestLock(); }
$('btnSortie').onclick = sortie;
$('btnGarage').onclick = () => { initAudio(); sfx('ui'); setState('garage'); };
$('gGo').onclick = sortie;
$('gBack').onclick = () => { sfx('ui'); saveCfg(); setState('title'); };
$('pResume').onclick = resume;
$('pRestart').onclick = sortie;
$('pGarage').onclick = () => { clearWorld(); makePlayer(); setState('garage'); };
$('rAgain').onclick = sortie;
$('rGarage').onclick = () => { clearWorld(); makePlayer(); setState('garage'); };
$('sens').value = cfg.sens; $('vol').value = cfg.vol; $('invY').checked = cfg.invY;
$('sens').oninput = (e) => { cfg.sens = +e.target.value; saveCfg(); };
$('vol').oninput = (e) => { cfg.vol = +e.target.value; setVolume(cfg.vol); saveCfg(); };
$('invY').onchange = (e) => { cfg.invY = e.target.checked; saveCfg(); };
setVolume(cfg.vol);

// ------------------------------------------------------------------ hangar
function buildGarage() {
  const opt = (html, on, fn, cls = '') => { const d = document.createElement('div'); d.className = 'opt ' + cls + (on ? ' on' : ''); d.innerHTML = html; d.onclick = () => { sfx('ui'); fn(); saveCfg(); buildGarage(); }; return d; };
  const fill = (id, items) => { const el = $(id); el.innerHTML = ''; items.forEach((i) => el.appendChild(i)); };
  fill('gPaint', Object.entries(PALETTES).filter(([k]) => k !== 'tyrant').map(([k, p]) =>
    opt(`<i style="background:linear-gradient(135deg, ${p.Armor} 0 55%, ${p.Accent} 55% 75%, ${p.Armor2} 75%)"></i>`, cfg.palette === k, () => { cfg.palette = k; G.player.setPalette(k); }, 'sw')));
  fill('gFrame', Object.entries(FRAMES).map(([k, f]) => opt(`${f.name}<small>${f.en}</small>`, cfg.frame === k, () => { cfg.frame = k; rebuildPreview(); })));
  const F = FRAMES[cfg.frame];
  $('gStats').innerHTML = `AP <b>${F.hp}</b> · 速度 <b>×${F.speed}</b> · EN <b>${F.en}</b> · 推进 <b>×${F.boost}</b> · 受伤 <b>×${F.armor}</b>`;
  const wopt = (slot, k) => opt(`${WEAPONS[k].name}<small>${WEAPONS[k].desc}</small>`, cfg[slot] === k, () => { cfg[slot] = k; G.player.mount({ R: cfg.R, L: cfg.L, S: cfg.S }); G.pw = { R: weaponState(cfg.R), L: weaponState(cfg.L), S: weaponState(cfg.S) }; buildWeaponPanel(); });
  fill('gR', ARM_KEYS.map((k) => wopt('R', k)));
  fill('gL', ARM_KEYS.map((k) => wopt('L', k)));
  fill('gS', SHOULDER_KEYS.map((k) => wopt('S', k)));
  fill('gDiff', Object.entries(DIFFS).map(([k, d]) => opt(`${d.name}<small>${d.desc}</small>`, cfg.diff === k, () => { cfg.diff = k; })));
}
function rebuildPreview() { makePlayer(); }

// ------------------------------------------------------------------ HUD
const wrows = {};
function buildWeaponPanel() {
  const el = $('weapons'); el.innerHTML = '';
  for (const [slot, key] of [['R', 'LMB'], ['L', 'RMB'], ['S', 'E']]) {
    const w = G.pw[slot];
    const d = document.createElement('div'); d.className = 'wrow';
    d.innerHTML = `<div class="top"><span class="key">${key}</span><span class="nm">${w.d.name}</span><span class="am"></span></div><div class="wb"><i></i></div>`;
    el.appendChild(d);
    wrows[slot] = { d, am: d.querySelector('.am'), bar: d.querySelector('.wb i') };
  }
}
const lockPool = [], markPool = [];
function poolEl(pool, parent, cls) { const d = document.createElement('div'); d.className = cls; parent.appendChild(d); pool.push(d); return d; }
let bannerT = 0, hintT = 0;
function banner(t, sub, warn) { const b = $('banner'); b.innerHTML = `${t}<small>${sub || ''}</small>`; b.classList.toggle('warn', !!warn); b.classList.add('show'); bannerT = 2.8; }
function showHint(t, dur = 3) { const h = $('hint'); h.textContent = t; h.classList.remove('hidden'); hintT = dur; }

const radar = $('radar'), rctx = radar.getContext('2d');
function drawHUD(dt) {
  const p = G.player;
  // bars
  const hpK = p.hp / p.maxHp;
  $('hpBar').firstElementChild.style.width = (hpK * 100).toFixed(1) + '%';
  $('hpBar').classList.toggle('low', hpK < 0.3);
  $('hpTxt').textContent = Math.ceil(p.hp);
  $('enBar').firstElementChild.style.width = (p.en / p.maxEn * 100).toFixed(1) + '%';
  $('enBar').classList.toggle('heat', p.overheat > 0);
  $('enTxt').textContent = p.overheat > 0 ? 'OVERHEAT' : '';
  $('spd').textContent = Math.round(Math.hypot(p.vel.x, p.vel.z) * 3.6);
  $('alt').textContent = p.pos.y.toFixed(1);
  // weapons
  for (const slot of ['R', 'L', 'S']) {
    const w = G.pw[slot], r = wrows[slot]; if (!r) continue;
    let txt = '', k = 0, cls = '';
    if (w.d.mag) {
      if (w.reloadT > 0) { txt = 'RELOAD'; k = 1 - w.reloadT / w.d.reload; cls = 'reloading'; }
      else { txt = w.ammo; k = w.d.type === 'charge' ? w.chargeT / w.d.charge : w.ammo / w.d.mag; }
    } else {
      if (w.beamT > 0) { txt = 'FIRE'; k = w.beamT / w.d.dur; }
      else if (w.cd > 0) { txt = w.cd.toFixed(1); k = 1 - w.cd / w.d.cd; cls = 'reloading'; }
      else { txt = 'READY'; k = 1; cls = 'ready'; }
      if (slot === 'S' && w.d.type === 'missile' && w.cd <= 0) txt = `READY ×${Math.max(1, G.locks.length)}`;
    }
    r.am.textContent = txt; r.bar.style.width = (k * 100).toFixed(0) + '%';
    r.d.className = 'wrow ' + cls;
  }
  // rail charge ring
  let ch = 0; for (const s of ['R', 'L']) if (G.pw[s].d.type === 'charge') ch = Math.max(ch, G.pw[s].chargeT / G.pw[s].d.charge);
  $('chargeArc').setAttribute('stroke-dasharray', `${(ch * 188.5).toFixed(1)} 999`);
  // reticle
  const rp = reticlePx(), ret = $('reticle'), cr = $('chargeRing');
  ret.style.left = cr.style.left = rp.x + 'px'; ret.style.top = cr.style.top = rp.y + 'px';
  G.hud.hit = Math.max(0, G.hud.hit - dt); G.hud.kill = Math.max(0, G.hud.kill - dt);
  ret.classList.toggle('hit', G.hud.hit > 0 || G.hud.kill > 0); ret.classList.toggle('kill', G.hud.kill > 0);
  // lock boxes
  const L = $('locks'); let li = 0;
  for (const e of G.locks) {
    const d = lockPool[li] || poolEl(lockPool, L, 'lock'); li++;
    d.style.display = ''; d.className = 'lock' + (e === G.lockTarget ? ' primary' : '');
    d.style.left = e.sx + 'px'; d.style.top = e.sy + 'px';
  }
  for (; li < lockPool.length; li++) lockPool[li].style.display = 'none';
  // off-screen markers
  const M = $('marks'); let mi = 0;
  const cx = innerWidth / 2, cy = innerHeight / 2;
  for (const e of G.enemies) {
    if (!e.alive || e.dying) continue;
    _sp.copy(e.c).project(camera);
    const behind = _sp.z > 1;
    let x = _sp.x, y = _sp.y; if (behind) { x = -x; y = -y; }
    if (!behind && Math.abs(x) < 0.95 && Math.abs(y) < 0.92) continue;
    const ang = Math.atan2(-y, x);
    const k = Math.min((innerWidth / 2 - 30) / Math.abs(Math.cos(ang) || 1e-6), (innerHeight / 2 - 30) / Math.abs(Math.sin(ang) || 1e-6));
    const d = markPool[mi] || poolEl(markPool, M, 'mark'); mi++;
    d.style.display = ''; d.className = 'mark' + (e.kind === 'boss' ? ' boss' : '');
    d.style.left = (cx + Math.cos(ang) * k) + 'px'; d.style.top = (cy + Math.sin(ang) * k) + 'px';
    d.style.transform = `rotate(${ang + Math.PI / 2}rad)`;
  }
  for (; mi < markPool.length; mi++) markPool[mi].style.display = 'none';
  // hurt vignette
  G.hud.hurt = Math.max(0, G.hud.hurt - dt * 1.2);
  $('hurt').style.opacity = Math.min(0.9, G.hud.hurt + (hpK < 0.25 ? 0.25 + Math.sin(performance.now() / 180) * 0.1 : 0)).toFixed(2);
  // waves / boss
  if (run.wave >= 0) {
    $('waveTitle').textContent = WAVES[run.wave].title;
    const left = G.enemies.filter((e) => e.alive).length;
    $('waveSub').textContent = run.breakT > 0 ? '整备中…' : `剩余敌机 ${left}`;
  } else { $('waveTitle').textContent = 'STANDBY'; $('waveSub').textContent = ''; }
  if (G.boss && !G.boss.gone) $('bossBar').firstElementChild.style.width = (G.boss.hp / G.boss.maxHp * 100).toFixed(1) + '%';
  else $('bossBox').classList.add('hidden');
  bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('show');
  hintT -= dt; if (hintT <= 0) $('hint').classList.add('hidden');
  // radar
  const W = radar.width, R = W / 2, K = R / 140;
  rctx.clearRect(0, 0, W, W);
  rctx.save(); rctx.beginPath(); rctx.arc(R, R, R - 2, 0, Math.PI * 2); rctx.clip();
  rctx.translate(R, R); rctx.rotate(cam.yaw);
  rctx.fillStyle = 'rgba(140, 170, 190, 0.28)';
  for (const s of solids) {
    if (s.kind === 'wall') continue;
    const x0 = (s.min.x - p.pos.x) * K, z0 = (s.min.z - p.pos.z) * K;
    if (Math.abs(x0) > R * 1.6 || Math.abs(z0) > R * 1.6) continue;
    rctx.fillRect(x0, z0, (s.max.x - s.min.x) * K, (s.max.z - s.min.z) * K);
  }
  rctx.strokeStyle = 'rgba(255, 200, 60, 0.6)'; rctx.lineWidth = 3;
  rctx.strokeRect((-ARENA - p.pos.x) * K, (-ARENA - p.pos.z) * K, ARENA * 2 * K, ARENA * 2 * K);
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const x = (e.c.x - p.pos.x) * K, z = (e.c.z - p.pos.z) * K;
    rctx.fillStyle = e.kind === 'boss' ? '#ff8a1a' : '#ff4a3a';
    const s = e.kind === 'boss' ? 9 : e.kind === 'walker' ? 7 : 5;
    rctx.fillRect(x - s / 2, z - s / 2, s, s);
  }
  rctx.fillStyle = '#5dff9a';
  for (const k of G.pickups) rctx.fillRect((k.o.position.x - p.pos.x) * K - 3, (k.o.position.z - p.pos.z) * K - 3, 6, 6);
  rctx.restore();
  rctx.strokeStyle = 'rgba(95, 227, 255, 0.25)'; rctx.lineWidth = 2;
  for (const rr of [R * 0.33, R * 0.66]) { rctx.beginPath(); rctx.arc(R, R, rr, 0, Math.PI * 2); rctx.stroke(); }
  rctx.fillStyle = '#e8f8ff'; rctx.beginPath(); rctx.moveTo(R, R - 10); rctx.lineTo(R - 7, R + 8); rctx.lineTo(R + 7, R + 8); rctx.fill();
  rctx.strokeStyle = 'rgba(95,227,255,0.35)'; rctx.beginPath(); rctx.moveTo(R, R); rctx.lineTo(R - R * 0.6, R - R * 0.8); rctx.moveTo(R, R); rctx.lineTo(R + R * 0.6, R - R * 0.8); rctx.stroke();
}

// ------------------------------------------------------------------ autopilot (test hook)
const auto = { on: false, st: 1, stT: 0, jT: 3, hover: 0, sT: 0 };
function autoIntent(dt) {
  const p = G.player; let tgt = null, bd = 1e9;
  for (const e of G.enemies) { if (!e.alive || e.dying) continue; const d = e.c.distanceTo(p.pos) + (e.kind === 'boss' ? -30 : 0); if (d < bd) { bd = d; tgt = e; } }
  // pick up repairs when hurt
  let goal = null;
  if (p.hp < p.maxHp * 0.6) for (const k of G.pickups) { const d = k.o.position.distanceTo(p.pos); if (d < 70) { goal = k.o.position; break; } }
  if (tgt) {
    const pc = p.center(new V3());
    const dx = tgt.c.x - pc.x, dz = tgt.c.z - pc.z, h = Math.hypot(dx, dz);
    const camRight = 3.1 * p.scale;
    cam.yaw = Math.atan2(-dx, -dz) + Math.atan2(camRight, h) * 0.9;
    cam.pitch = Math.max(-0.6, Math.min(0.8, Math.atan2(tgt.c.y - pc.y - 1.0, h)));
  }
  auto.stT -= dt; if (auto.stT <= 0) { auto.stT = 2 + Math.random() * 2.5; auto.st = Math.random() < 0.5 ? 1 : -1; }
  auto.jT -= dt; let jump = false; if (auto.jT <= 0 && p.grounded) { auto.jT = 4 + Math.random() * 4; jump = true; auto.hover = 0.8 + Math.random(); }
  auto.hover -= dt;
  if (tgt && tgt.c.y - p.pos.y > 7 && tgt.c.distanceTo(p.pos) < 70 && p.en > 25) { if (p.grounded) jump = true; auto.hover = 0.3; }
  const d = tgt ? tgt.c.distanceTo(p.pos) : 0;
  let f = tgt ? (d > 45 ? 1 : d < 22 ? -1 : 0) : 0, s = tgt ? auto.st : 0;
  if (goal) { const gx = goal.x - p.pos.x, gz = goal.z - p.pos.z; const yaw = cam.yaw; const fw = [-Math.sin(yaw), -Math.cos(yaw)], rt = [Math.cos(yaw), -Math.sin(yaw)]; f = Math.sign(gx * fw[0] + gz * fw[1]); s = Math.sign(gx * rt[0] + gz * rt[1]); }
  const los = tgt && clearLine(p.center(new V3()), tgt.c);
  auto.sT -= dt; const sPress = auto.sT <= 0 && los; if (sPress) auto.sT = 0.6;
  return { f, s, boost: d > 70 || !!goal, qboost: G.hud.hurt > 0.35 && Math.random() < 0.05, jump, hover: auto.hover > 0, b0: !!los, b2: !!los && (G.pw.L.d.type !== 'charge' || Math.random() < 0.985), e: sPress };
}

// ------------------------------------------------------------------ simulation step
let lastShift = false, lastSpace = false, simTime = 0;
function step(dt) {
  const p = G.player;
  if (state === 'garage' || state === 'title') {
    p.update(dt, { mx: 0, mz: 0, aimYaw: p.aimYaw, aimPitch: 0 });
    fx.update(dt, camera);
    garageCamera(dt, state === 'title');
    return;
  }
  if (state !== 'play') return;
  if (timeScaleT > 0) { timeScaleT -= dt; dt *= 0.35; }
  G.time += dt; simTime += dt;
  // look
  if (pointerLocked) {
    cam.yaw -= mouse.dx * 0.0022 * cfg.sens; cam.pitch -= mouse.dy * 0.0022 * cfg.sens * (cfg.invY ? -1 : 1);
  } else if (freeMouse) {
    const ex = (mouse.x / innerWidth - 0.5) * 2, ey = (mouse.y / innerHeight - 0.5) * 2;
    const band = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.55) / 0.45;
    cam.yaw -= band(ex) * 2.4 * cfg.sens * dt; cam.pitch -= band(ey) * 1.4 * cfg.sens * dt * (cfg.invY ? -1 : 1);
  }
  mouse.dx = mouse.dy = 0;
  let A;
  if (auto.on) A = autoIntent(dt);
  else {
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight'), space = keys.has('Space');
    A = { f: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      boost: shift, qboost: shift && !lastShift, jump: space && !lastSpace, hover: space, b0: mouse.b0, b2: mouse.b2, e: ePressed };
    lastShift = shift; lastSpace = space;
  }
  cam.pitch = Math.max(-0.75, Math.min(0.95, cam.pitch));
  const fw = [-Math.sin(cam.yaw), -Math.cos(cam.yaw)], rt = [Math.cos(cam.yaw), -Math.sin(cam.yaw)];
  const mx = fw[0] * A.f + rt[0] * A.s, mz = fw[1] * A.f + rt[1] * A.s;
  // aim pitch from the chest to the aim point
  const chest = p.center(new V3());
  const ad = G.aimPoint.clone().sub(chest);
  const aimPitch = Math.atan2(ad.y, Math.hypot(ad.x, ad.z) || 1);
  const aimYaw = Math.hypot(ad.x, ad.z) > 6 ? Math.atan2(-ad.x, -ad.z) : cam.yaw;
  p.update(dt, { mx, mz, boost: A.boost, qboost: A.qboost, jump: A.jump, hover: A.hover, aimYaw, aimPitch });
  updateCamera(dt);
  camera.updateMatrixWorld();
  updateAim();
  if (p.alive && !run.won) {
    weaponTick(dt, p, 'R', G.pw.R, A.b0, G.aimPoint, G.lockTarget, 'P', G.locks);
    weaponTick(dt, p, 'L', G.pw.L, A.b2, G.aimPoint, G.lockTarget, 'P', G.locks);
    weaponTick(dt, p, 'S', G.pw.S, A.e, G.aimPoint, G.lockTarget, 'P', G.locks);
    if (G.pw.S.d.type !== 'beam' && G.pw.S.cd > 0 && A.e && G.pw.S.cd < G.pw.S.d.cd - 0.3 && !auto.on && Math.random() < 0.02) sfx('empty');
  }
  updateCombat(dt);
  // boost dust trail
  if (p.alive && p.grounded && p.thrustLv > 0.5 && Math.random() < 0.6) fx.dust(p.pos, 1, 1.8, 3);
  if (p.alive && !p.grounded && p.hoverLv > 0.3 && p.pos.y - groundAt(p.pos.x, p.pos.z, p.pos.y) < 6 && Math.random() < 0.5) fx.dust(new V3(p.pos.x, groundAt(p.pos.x, p.pos.z, p.pos.y), p.pos.z), 1, 2.2, 6);
  fx.update(dt, camera);
  waveLogic(dt);
  thrust(p.alive ? Math.max(p.thrustLv, p.hoverLv * 0.7) : 0);
  const inten = run.wave < 0 ? 0 : run.wave === 3 ? 1 : 0.45 + run.wave * 0.15;
  musicTick(run.over ? 0 : inten);
  // shadow camera follows the player
  sun.position.copy(p.pos).addScaledVector(SUN_DIR, 200); sun.target.position.copy(p.pos); sun.target.updateMatrixWorld();
}

// ------------------------------------------------------------------ loop
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (state === 'loading') return;
  acc += dt;
  const STEP = 1 / 60;
  let n = 0;
  while (acc >= STEP && n < 6) { step(STEP); acc -= STEP; n++; }
  if (n === 6) acc = 0;
  render(dt);
}
function render(dt) {
  if (state === 'play' || state === 'pause') drawHUD(dt);
  composer.render();
}

// ------------------------------------------------------------------ test hooks
window.__iv = {
  G, cam, cfg, auto, run, fx,
  state: () => state,
  start: (o = {}) => { Object.assign(cfg, o); sortie(); if (!pointerLocked) freeMouse = true; mouse.x = innerWidth / 2; mouse.y = innerHeight / 2; },
  step: (n = 1) => { for (let i = 0; i < n; i++) step(1 / 60); render(1 / 60); },
  sim: (sec) => { auto.on = true; const n = Math.round(sec * 60); for (let i = 0; i < n && !run.over; i++) step(1 / 60); render(1 / 60); return { t: run.t.toFixed(1), wave: run.wave, hp: Math.round(G.player.hp), kills: G.stats.kills, alive: G.enemies.filter((e) => e.alive).length, over: run.over, state }; },
  capture: (name = 'shot.jpg', w = 1280, h = 720) => {
    renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.render();
    const data = canvas.toDataURL('image/jpeg', 0.88);
    resize();
    return fetch('http://127.0.0.1:8212/', { method: 'POST', body: JSON.stringify({ name, data }) }).then((r) => r.text()).catch((e) => 'ERR ' + e);
  },
  setState,
  wave: (i) => { clearWorld(); run.breakT = 0; startWave(i); },
  mouse,
};

// ------------------------------------------------------------------ boot
(async () => {
  try {
    await loadKit('./assets/kit.glb?v=1');
    arenaGroup = buildArena(scene, 3);
    makePlayer();
    setState('title');
    camera.position.set(10, 6, 140);
    requestAnimationFrame(frame);
  } catch (e) {
    $('loading').innerHTML = `<div style="color:#ff8a7a; max-width: 600px">载入失败：${e && e.message ? e.message : e}</div>`;
    console.error(e);
  }
})();
