// IRON VANGUARD — main loop, camera, input, aiming, waves, HUD, hangar.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadKit } from './kit.js';
import { buildArena, ARENA, solids, raySolids, groundAt, pointInSolid, clearLine, relaySites } from './world.js';
import { FX, TEX } from './fx.js';
import { initAudio, sfx, thrust, musicTick, setVolume } from './audio.js';
import { Mech, PALETTES, FRAMES, angDiff } from './mech.js';
import { Wingman, Reactor, WING } from './ally.js';
import { G, WEAPONS, ARM_KEYS, SHOULDER_KEYS, weaponState, weaponTick, updateCombat, Turret, Drone, Walker, Bulwark, Gunship, Relay, Boss, BOSSES, RAIDERS, dropRepair, enemyEnts, rayEnts } from './combat.js';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const DIFFS = {
  easy: { name: '新兵', desc: '受到伤害 ×0.5 · 敌方耐久 ×0.8 · 报酬 ×0.7', dmg: 0.5, hp: 0.8, cr: 0.7 },
  normal: { name: '正规', desc: '标准 · 报酬 ×1', dmg: 0.8, hp: 1, cr: 1 },
  hard: { name: '王牌', desc: '受到伤害 ×1.6 · 敌方耐久 ×1.25 · 报酬 ×1.5', dmg: 1.25, hp: 1.25, cr: 1.5 },
};
const MISSIONS = {
  drill: { name: '演习场', en: 'PROVING GROUND', desc: '白天 · 炮台 / 无人机 / 步行机 · 头目「暴君」', seed: 3, env: 'day', reward: 2000, waves: [
    { title: 'WAVE 1', sub: '清除外围炮台与无人机', spawn: { turret: 5, drone: 6 } },
    { title: 'WAVE 2', sub: '装甲步行机接近', spawn: { walker: 3, drone: 6, turret: 3 } },
    { title: 'WAVE 3', sub: '全面进攻', spawn: { walker: 4, drone: 8, turret: 4 } },
    { title: 'FINAL WAVE', sub: '击破重装指挥机「暴君」', spawn: { boss: 'tyrant', drone: 3 } },
  ] },
  harbor: { name: '夜袭 · 港湾区', en: 'NIGHT RAID', desc: '夜间 · 护盾坦克 / 武装直升机 · 头目「幻影」', seed: 11, env: 'night', reward: 3200, waves: [
    { title: 'WAVE 1', sub: '护盾坦克推进 · 从侧面、背后、上方攻击，或用光束剑斩开', spawn: { bulwark: 2, drone: 5, turret: 3 } },
    { title: 'WAVE 2', sub: '武装直升机来袭 · 导弹警报时急闪躲避', spawn: { gunship: 1, walker: 2, drone: 4 } },
    { title: 'WAVE 3', sub: '全面进攻', spawn: { gunship: 2, bulwark: 2, turret: 3, drone: 3 } },
    { title: 'FINAL WAVE', sub: '击破强袭机「幻影」 · 注意它的光束剑', spawn: { boss: 'phantom', drone: 2 } },
  ] },
  snow: { name: '雪原 · 中继站强袭', en: 'SNOWFIELD STRIKE', desc: '暴雪 · 摧毁 3 座中继塔 · 双头目「暴君」与「幻影」', seed: 21, env: 'snow', reward: 4400, waves: [
    { title: 'OBJECTIVE', sub: '摧毁 3 座通讯中继塔 · 塔会持续呼叫增援，贴近会遭电磁脉冲', spawn: { relay: 3, turret: 4, walker: 2, drone: 3 } },
    { title: 'WAVE 2', sub: '敌军反扑', spawn: { bulwark: 2, gunship: 1, walker: 2, drone: 4 } },
    { title: 'FINAL WAVE', sub: '双头目来袭：「暴君」与「幻影」', spawn: { boss: 'tyrant', boss2: 'phantom', bossHp: 0.62 } },
  ] },
  defense: { name: '要塞 · 反应堆防卫', en: 'REACTOR DEFENSE', desc: '黄昏 · 守住中央反应堆 · 敌军四面合围', seed: 31, env: 'dusk', reward: 3800, defense: true, coreHp: 7000, waves: [
    { title: 'WAVE 1', sub: '敌军接近反应堆 · 守住它', spawn: { walker: 4, drone: 6 }, late: { walker: 2, drone: 4 } },
    { title: 'WAVE 2', sub: '护盾坦克推进 · 迫击炮会轰击反应堆', spawn: { bulwark: 2, walker: 3, drone: 4 }, late: { bulwark: 1, walker: 2, drone: 3 } },
    { title: 'WAVE 3', sub: '空中突击', spawn: { gunship: 2, drone: 6, walker: 2 }, late: { gunship: 1, drone: 5 } },
    { title: 'WAVE 4', sub: '全面合围', spawn: { bulwark: 2, walker: 3, gunship: 1, drone: 4 }, late: { gunship: 1, walker: 2, drone: 4 } },
    { title: 'FINAL WAVE', sub: '击破「暴君」 · 它会直扑反应堆', spawn: { boss: 'tyrant', walker: 3, drone: 4, bossHp: 0.85 }, late: { bulwark: 2, drone: 4 } },
  ] },
  storm: { name: '暴雨 · 机甲猎杀', en: 'STORM HUNT', desc: '雷暴夜雨 · 敌方机甲小队「掠夺者」「枪骑兵」 · 头目「幻影」', seed: 41, env: 'storm', reward: 4200, waves: [
    { title: 'WAVE 1', sub: '掠夺者小队接近 · 它们和你一样会推进、急闪', spawn: { raider: 2, drone: 4, turret: 3 } },
    { title: 'WAVE 2', sub: '枪骑兵加入 · 光束剑冲刺前会红光预警', spawn: { raider: 2, lancer: 1, walker: 2, drone: 3 } },
    { title: 'WAVE 3', sub: '机甲猎杀队', spawn: { lancer: 1, raider: 2, gunship: 1 }, late: { lancer: 1, drone: 3 } },
    { title: 'FINAL WAVE', sub: '猎杀队队长「幻影」亲自出击', spawn: { boss: 'phantom' } },
  ] },
  endless: { name: '无尽防线', en: 'ENDLESS', desc: '黄昏 · 无限波次，越来越强 · 每 5 波一个头目', seed: 5, env: 'dusk', endless: true, reward: 0 },
};
const ENVS = {
  day: { top: 0x6f98bf, hor: 0xc4cfd8, fog: [90, 560], hemi: [0xdfe9f2, 0x6a6660, 0.6], sun: [0xfff1de, 2.2], env: 0.42, exp: 0.9, dir: [0.45, 0.55, 0.7], disc: 1 },
  dusk: { top: 0x3c4f7c, hor: 0xd99a74, fog: [80, 520], hemi: [0xffd6b8, 0x4c4240, 0.5], sun: [0xffb47a, 2.5], env: 0.34, exp: 0.95, dir: [-0.62, 0.2, 0.46], disc: 1.4 },
  snow: { top: 0x8ea3b8, hor: 0xd6dee6, fog: [40, 300], hemi: [0xeef4ff, 0x8f99a6, 0.72], sun: [0xf2f6ff, 1.5], env: 0.36, exp: 0.82, dir: [0.35, 0.42, 0.65], disc: 0.35, snow: true },
  storm: { top: 0x1c232c, hor: 0x46505c, fog: [30, 230], hemi: [0x9aacc0, 0x26282c, 0.42], sun: [0xc0cce0, 0.8], env: 0.2, exp: 1.02, dir: [0.25, 0.7, 0.4], disc: 0.05, rain: true },
  night: { top: 0x060b18, hor: 0x18223a, fog: [45, 340], hemi: [0x6880b8, 0x141419, 0.22], sun: [0xa8bcff, 0.55], env: 0.1, exp: 1.08, dir: [0.3, 0.62, -0.5], disc: 0.45 },
};
const KILL_CR = { drone: 40, turret: 60, walker: 120, bulwark: 150, gunship: 220, raider: 300, relay: 450, boss: 1200 };
const UPGRADES = {
  armor: { name: '装甲强化', desc: 'AP +8%' },
  gen: { name: '发电机', desc: 'EN 上限与回复 +8%' },
  thr: { name: '推进器', desc: '推进与急闪速度 +4%' },
  fcs: { name: '火控系统', desc: '全武器伤害 +6%' },
};
const UP_COST = [600, 1200, 2000, 3000, 4200];
const SAVE_KEY = 'ironvanguard.save.v1';
const save = { cr: 0, up: { armor: 0, gen: 0, thr: 0, fcs: 0 }, best: {}, bestWave: 0, earned: 0, wing: false };
const WING_COST = 2500, WING_CR = 0.85;
try { const o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (o) { Object.assign(save, o); save.up = { armor: 0, gen: 0, thr: 0, fcs: 0, ...(o.up || {}) }; } } catch (e) { /* storage unavailable */ }
const writeSave = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const playerMods = () => { const u = save.up; return { hp: 1 + 0.08 * u.armor, en: 1 + 0.08 * u.gen, regen: 1 + 0.08 * u.gen, boost: 1 + 0.04 * u.thr, speed: 1 + 0.02 * u.thr }; };
const dmgMul = () => 1 + 0.06 * save.up.fcs;

// ------------------------------------------------------------------ config (per-viewer convenience only)
const CFG_KEY = 'ironvanguard.cfg.v1';
const cfg = { palette: 'vanguard', frame: 'std', R: 'rifle', L: 'gatling', S: 'missile', diff: 'normal', mission: 'drill', sens: 1, vol: 0.7, invY: false, wing: true };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } };
// migrate the v1 per-difficulty best times (proving ground only)
try { const old = JSON.parse(localStorage.getItem('ironvanguard.best') || '{}'); for (const k in old) if (!save.best['drill.' + k]) save.best['drill.' + k] = old[k]; } catch (e) { /* ignore */ }
if (!MISSIONS[cfg.mission]) cfg.mission = 'drill';

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
  uniforms: { top: { value: new THREE.Color(0x6f98bf) }, hor: { value: HORIZON }, sun: { value: new V3(0.45, 0.55, 0.7).normalize() }, disc: { value: 1 } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
  fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sun; uniform float disc; varying vec3 vD;
    void main(){ float h = clamp(vD.y, 0.0, 1.0); vec3 c = mix(hor, top, pow(h, 0.55));
      float s = max(dot(vD, sun), 0.0); c += vec3(1.0, 0.92, 0.8) * (pow(s, 600.0) * 4.0 + pow(s, 8.0) * 0.15 * disc);
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
function applyEnv(key) {
  const E = ENVS[key] || ENVS.day, U = sky.material.uniforms;
  U.top.value.set(E.top); HORIZON.set(E.hor); scene.fog.color.copy(HORIZON); scene.fog.near = E.fog[0]; scene.fog.far = E.fog[1];
  SUN_DIR.set(...E.dir).normalize(); U.sun.value.copy(SUN_DIR); U.disc.value = E.disc;
  hemi.color.set(E.hemi[0]); hemi.groundColor.set(E.hemi[1]); hemi.intensity = E.hemi[2];
  sun.color.set(E.sun[0]); sun.intensity = E.sun[1];
  scene.environmentIntensity = E.env; renderer.toneMappingExposure = E.exp;
  snowFx.visible = !!E.snow; rainFx.visible = !!E.rain;
  storm.on = !!E.rain; storm.hemi = E.hemi[2]; storm.top.set(E.top); storm.k = 0; storm.t = 4 + Math.random() * 6;
}
let arenaKey = '';
function ensureArena() {
  const M = MISSIONS[cfg.mission], key = M.seed + M.env;
  if (key === arenaKey && arenaGroup) return;
  if (arenaGroup) scene.remove(arenaGroup);
  arenaGroup = buildArena(scene, M.seed, M.env); arenaKey = key;
  applyEnv(M.env);
}

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 2000);
// falling snow: a box of flakes that follows the camera and wraps around it
const SNOW_N = 3200, SNOW_BOX = 70;
const snowFx = (() => {
  const g = new THREE.BufferGeometry(), a = new Float32Array(SNOW_N * 3);
  for (let i = 0; i < SNOW_N * 3; i++) a[i] = (Math.random() - 0.5) * SNOW_BOX;
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, map: TEX.softTex, alphaTest: 0.02, transparent: true, opacity: 0.9, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  pts.userData.ph = new Float32Array(SNOW_N).map(() => Math.random() * 6.28);
  return pts;
})();
// rain: line streaks in a box that follows the camera; lightning flashes the hemisphere light and sky
const RAIN_N = 2400, RAIN_BOX = 60;
const rainFx = (() => {
  const g = new THREE.BufferGeometry(), a = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) { const x = (Math.random() - 0.5) * RAIN_BOX, y = (Math.random() - 0.5) * RAIN_BOX, z = (Math.random() - 0.5) * RAIN_BOX; a.set([x, y, z, x, y, z], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xa8bcd0, transparent: true, opacity: 0.32, depthWrite: false }));
  l.frustumCulled = false; l.visible = false; scene.add(l);
  return l;
})();
const storm = { on: false, k: 0, t: 6, hemi: 0.4, top: new THREE.Color(), flashTop: new THREE.Color(0xb8c8e8) };
function updateRain(dt) {
  if (!rainFx.visible) return;
  const a = rainFx.geometry.attributes.position.array, c = camera.position, H = RAIN_BOX / 2, vx = 3, vy = -34, L = 0.045;
  for (let i = 0; i < RAIN_N; i++) {
    const j = i * 6;
    let x = a[j] + vx * dt, y = a[j + 1] + vy * dt, z = a[j + 2];
    if (y - c.y < -H) y += RAIN_BOX; if (x - c.x > H) x -= RAIN_BOX; else if (x - c.x < -H) x += RAIN_BOX; if (z - c.z > H) z -= RAIN_BOX; else if (z - c.z < -H) z += RAIN_BOX;
    if (y - c.y > H) y -= RAIN_BOX;
    a[j] = x; a[j + 1] = y; a[j + 2] = z; a[j + 3] = x - vx * L; a[j + 4] = y - vy * L; a[j + 5] = z;
  }
  rainFx.geometry.attributes.position.needsUpdate = true;
  // lightning
  storm.t -= dt;
  if (storm.t <= 0) {
    storm.t = 7 + Math.random() * 9; storm.k = 1; storm.second = Math.random() < 0.6 ? 0.18 : 0;
    const d = 120 + Math.random() * 260; G.queue.push({ label: 'thunder', t: d / 340, fn: () => sfx('thunder', d * 0.25) });
  }
  if (storm.second > 0) { storm.second -= dt; if (storm.second <= 0) storm.k = 0.8; }
  storm.k = Math.max(0, storm.k - dt * 4.5);
  hemi.intensity = storm.hemi + storm.k * 2.6;
  sky.material.uniforms.top.value.copy(storm.top).lerp(storm.flashTop, storm.k * 0.8);
}
function updateSnow(dt) {
  if (!snowFx.visible) return;
  const a = snowFx.geometry.attributes.position.array, ph = snowFx.userData.ph, c = camera.position, H = SNOW_BOX / 2, t = G.time;
  const cc = [c.x, c.y, c.z];
  for (let i = 0; i < SNOW_N; i++) {
    const j = i * 3;
    a[j] += (Math.sin(t * 0.9 + ph[i]) * 0.6 + 2.2) * dt; a[j + 1] -= (2.6 + (ph[i] % 1.3)) * dt; a[j + 2] += Math.cos(t * 0.7 + ph[i]) * 0.5 * dt;
    for (let k = 0; k < 3; k++) { const d = a[j + k] - cc[k]; if (d > H) a[j + k] -= SNOW_BOX; else if (d < -H) a[j + k] += SNOW_BOX; }
  }
  snowFx.geometry.attributes.position.needsUpdate = true;
}
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
  if (pad.active) { pad.moveAcc += Math.abs(e.movementX) + Math.abs(e.movementY); if (pad.moveAcc > 40) { pad.moveAcc = 0; setPadActive(false); } }
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
  if (!pointerLocked && state === 'play' && !freeMouse && !pad.active && !touch.active) setState('pause');
});

// ------------------------------------------------------------------ gamepad (standard mapping)
// LS move · RS look · RT / LT arm weapons · RB shoulder · A jump / hover · B or LB boost (tap = quick boost) · X reload · Start pause
const pad = { active: false, b: [], prev: [], lx: 0, ly: 0, rx: 0, ry: 0, moveAcc: 0 };
const padDz = (v, d) => { const a = Math.abs(v); return a < d ? 0 : Math.sign(v) * Math.pow((a - d) / (1 - d), 1.6); };
const padHit = (i) => !!pad.b[i] && !pad.prev[i];
function setPadActive(on) {
  if (pad.active === on) return;
  pad.active = on;
  if (G.pw && G.pw.R) buildWeaponPanel();
  $('keyHints') && $('keyHints').classList.toggle('pad', on);
  if (on && state === 'play') showHint('手柄：左摇杆移动 · 右摇杆视角 · RT/LT 双臂 · RB 肩部 · A 跳跃 · B 推进 · X 装填', 4);
}
function pollPad() {
  let gp = null;
  try { for (const g of (navigator.getGamepads ? navigator.getGamepads() : [])) if (g && g.connected) { gp = g; break; } } catch (e) { /* blocked by permissions policy */ }
  pad.prev = pad.b;
  if (!gp) { pad.b = []; pad.lx = pad.ly = pad.rx = pad.ry = 0; return; }
  pad.b = gp.buttons.map((x) => x.value > 0.4);
  const ax = gp.axes;
  pad.lx = padDz(ax[0] || 0, 0.2); pad.ly = padDz(ax[1] || 0, 0.2); pad.rx = padDz(ax[2] || 0, 0.12); pad.ry = padDz(ax[3] || 0, 0.12);
  if (!pad.active && (pad.b.some(Boolean) || Math.abs(pad.lx) + Math.abs(pad.ly) + Math.abs(pad.rx) + Math.abs(pad.ry) > 0.2)) setPadActive(true);
  // menu buttons
  if (state === 'title' && padHit(0)) sortie();
  else if (state === 'title' && padHit(3)) { initAudio(); setState('garage'); }
  else if (state === 'garage' && padHit(0)) sortie();
  else if (state === 'garage' && padHit(1)) { saveCfg(); setState('title'); }
  else if (state === 'pause' && (padHit(9) || padHit(0))) resume();
  else if (state === 'pause' && padHit(1)) { clearWorld(); makePlayer(); setState('garage'); }
  else if (state === 'result' && padHit(0)) sortie();
  else if (state === 'result' && padHit(1)) { clearWorld(); makePlayer(); setState('garage'); }
  else if (state === 'play' && padHit(9)) setState('pause');
  if (state === 'play' && padHit(2)) manualReload();
}
addEventListener('gamepadconnected', () => { pollPad(); });

// ------------------------------------------------------------------ touch (left: move stick · right: drag to look · buttons)
const touch = { active: false, stick: null, ox: 0, oy: 0, mx: 0, my: 0, look: null, lx: 0, ly: 0, dx: 0, dy: 0, b: {} };
function setTouch(on) {
  if (touch.active === on) return;
  touch.active = on; document.body.classList.toggle('touchmode', on);
  $('touch').classList.toggle('hidden', !(on && state === 'play'));
  if (on) { freeMouse = true; layoutTouch(); }
}
function layoutTouch() { const k = Math.max(0.62, Math.min(1, (innerHeight - 40) / 330)); $('tBtns').style.transform = `scale(${k.toFixed(3)})`; }
addEventListener('resize', layoutTouch);
addEventListener('touchstart', () => { if (!touch.active) setTouch(true); initAudio(); }, { capture: true, passive: true });
const stickEl = $('tStick'), knob = $('tKnob'), base = $('tBase');
stickEl.addEventListener('touchstart', (e) => {
  e.preventDefault(); if (touch.stick !== null) return;
  const t = e.changedTouches[0], r = stickEl.getBoundingClientRect();
  touch.stick = t.identifier; touch.ox = t.clientX; touch.oy = t.clientY;
  base.style.left = (t.clientX - r.left) + 'px'; base.style.top = (t.clientY - r.top) + 'px';
}, { passive: false });
const STICK_R = 52;
function stickMove(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.stick) {
      let dx = t.clientX - touch.ox, dy = t.clientY - touch.oy; const L = Math.hypot(dx, dy);
      if (L > STICK_R) { dx *= STICK_R / L; dy *= STICK_R / L; }
      touch.mx = dx / STICK_R; touch.my = dy / STICK_R;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (t.identifier === touch.look) {
      touch.dx += t.clientX - touch.lx; touch.dy += t.clientY - touch.ly; touch.lx = t.clientX; touch.ly = t.clientY;
    }
  }
}
function stickEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.stick) { touch.stick = null; touch.mx = touch.my = 0; knob.style.transform = ''; }
    if (t.identifier === touch.look) touch.look = null;
  }
}
addEventListener('touchmove', (e) => { stickMove(e); if (state === 'play') e.preventDefault(); }, { passive: false });
addEventListener('touchend', stickEnd); addEventListener('touchcancel', stickEnd);
canvas.addEventListener('touchstart', (e) => {   // drag anywhere else on the screen to look
  if (state !== 'play') return;
  e.preventDefault();
  if (touch.look !== null) return;
  const t = e.changedTouches[0]; touch.look = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY;
}, { passive: false });
for (const b of document.querySelectorAll('#tBtns button')) {
  const k = b.dataset.k;
  const down = (e) => { e.preventDefault(); e.stopPropagation(); touch.b[k] = true; b.classList.add('on'); if (k === 'reload' && state === 'play') manualReload(); };
  const up = (e) => { e.preventDefault(); touch.b[k] = false; b.classList.remove('on'); };
  b.addEventListener('touchstart', down, { passive: false }); b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
}
$('tPause').addEventListener('touchstart', (e) => { e.preventDefault(); if (state === 'play') setState('pause'); }, { passive: false });
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
function reticlePx() { return freeMouse && !pad.active && !touch.active && state === 'play' ? { x: mouse.x, y: mouse.y } : { x: innerWidth / 2, y: innerHeight / 2 }; }
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
const run = { wave: -1, breakT: 0, t: 0, over: false, deathT: 0, won: false, bossPhaseT: 0, droneT: 0, waves: [], cr: 0, msslT: 0 };

// endless: each wave spends a growing budget on a random mix; every 5th wave brings a boss
function endlessWave(i) {
  const n = i + 1;
  if (n % 5 === 0) {
    const type = (n / 5) % 2 ? 'tyrant' : 'phantom';
    return { title: `WAVE ${n}`, sub: `头目来袭：${BOSSES[type].name}`, boss: true, spawn: { boss: type, bossHp: 0.75 + 0.15 * (n / 5 - 1), drone: Math.min(6, 1 + n / 5), turret: n >= 10 ? 2 : 0 } };
  }
  const pool = [['drone', 1, 99], ['turret', 1.5, 8]];
  if (n >= 2) pool.push(['walker', 3, 6]);
  if (n >= 3) pool.push(['bulwark', 3.5, 4]);
  if (n >= 4) pool.push(['gunship', 5, 3]);
  if (n >= 6) pool.push(['raider', 4.5, 3], ['lancer', 4.5, 2]);
  const sp = {}; let budget = 5 + n * 2.6, total = 0;
  while (budget > 0.9 && total < 24) {
    const [k, c, max] = pool[Math.floor(Math.random() * pool.length)];
    if ((sp[k] || 0) >= max || c > budget + 0.5) { if (pool.every(([kk, cc, mm]) => (sp[kk] || 0) >= mm || cc > budget + 0.5)) break; continue; }
    sp[k] = (sp[k] || 0) + 1; budget -= c; total++;
  }
  const subs = ['敌军增援抵达', '更多敌机接近', '防线承压', '坚守阵地'];
  return { title: `WAVE ${n}`, sub: subs[i % subs.length] + ` · 敌方耐久 +${Math.round(i * 5)}%`, spawn: sp };
}
const curWave = () => run.waves[run.wave];

function makePlayer() {
  if (G.player) G.player.dispose();
  G.player = new Mech(scene, mctx, { palette: cfg.palette, frame: cfg.frame, loadout: { R: cfg.R, L: cfg.L, S: cfg.S }, yaw: 0, mods: playerMods() });
  G.player.pos.set(0, 0, 128);
  G.pw = { R: weaponState(cfg.R), L: weaponState(cfg.L), S: weaponState(cfg.S) };
  cam.yaw = 0; cam.pitch = -0.05;
  buildWeaponPanel();
}

const wingOn = () => !!(save.wing && cfg.wing);
function clearWorld() {
  if (G.wing) G.wing.dispose(); if (G.core) G.core.dispose();
  G.wing = null; G.core = null; G.friends.length = 0;
  for (const e of G.enemies) e.remove ? e.remove() : null;
  G.enemies.length = 0; G.shots.length = 0; G.queue.length = 0;
  for (const k of G.pickups) scene.remove(k.o);
  G.pickups.length = 0;
}

function newGame() {
  run.late = null;
  clearWorld();
  arenaKey = ''; ensureArena();   // rebuild so barrels and props are fresh
  G.diff = { key: cfg.diff, ...DIFFS[cfg.diff] };
  makePlayer();
  Object.assign(G.stats, { shots: 0, hits: 0, kills: 0, dmgTaken: 0, dmgDealt: 0, blocked: 0 });
  const M = MISSIONS[cfg.mission];
  if (M.defense) {
    G.core = new Reactor(scene, new V3(0, 0, 0), M.coreHp); G.friends.push(G.core);
    G.player.pos.set(0, 0, 22);
  }
  if (wingOn()) { G.wing = new Wingman(scene, mctx, cfg.palette === 'kestrel' ? 'vanguard' : 'kestrel'); G.friends.push(G.wing); }
  run.coreLost = false;
  Object.assign(run, { wave: -1, defense: !!M.defense, coreWarnT: -99, coreLowSaid: false, breakT: 1.5, t: 0, over: false, deathT: 0, won: false, droneT: 0, cr: 0, msslT: 0, boss2: null, relayHintT: 0, waves: M.endless ? [] : M.waves, endless: !!M.endless });
  G.boss = null; G.bosses = [];
  $('bossBox').classList.add('hidden');
}

function spot(minD, maxD, air, bearing) {
  const p = run.defense && G.core ? G.core.pos : G.player.pos;
  for (let i = 0; i < 300; i++) {
    const a = bearing === undefined || i > 200 ? Math.random() * Math.PI * 2 : bearing + (Math.random() - 0.5) * 2.1, r = minD + Math.random() * (maxD - minD);
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
  if (run.endless && !run.waves[i]) run.waves[i] = endlessWave(i);
  run.wave = i; const W = run.waves[i];
  if (run.endless) G.diff.hp = DIFFS[cfg.diff].hp * (1 + 0.05 * i);
  const S = W.spawn, R = run.defense ? 1.15 : 1;
  banner(W.title, W.sub, !!S.boss);
  sfx(S.boss ? 'alarm' : 'wave');
  // defense: the first group comes from one side; a second group follows from the opposite side
  const b0 = run.defense ? Math.atan2(G.player.pos.z, G.player.pos.x) + Math.PI * (0.5 + Math.random()) : undefined;
  spawnGroup(S, R, b0);
  run.late = W.late || null; run.lateT = run.t + 20; run.lateB = b0 === undefined ? undefined : b0 + Math.PI;
  for (let k = 0; k < (S.relay || 0); k++) new Relay(relaySites[k].clone());
  G.bosses = [];
  if (S.boss) {
    G.boss = new Boss(spot(90 * R, 120 * R), mctx, S.boss, S.bossHp || 1); G.bosses.push(G.boss);
    run.boss2 = S.boss2 ? { type: S.boss2, hp: S.bossHp || 1, t: 0 } : null;   // the second boss drops in mid-fight
    $('bossName').textContent = BOSSES[S.boss].name;
    $('bossBox').classList.remove('hidden');
  }
}

function spawnGroup(S, R = 1, b) {
  for (let k = 0; k < (S.turret || 0); k++) new Turret((Math.random() < 0.45 && roofSpot(50, 150)) || spot(55, 140));
  for (let k = 0; k < (S.drone || 0); k++) new Drone(spot(70 * R, 140 * R, true, b));
  for (let k = 0; k < (S.walker || 0); k++) new Walker(spot(95 * R, 140 * R, false, b));
  for (let k = 0; k < (S.bulwark || 0); k++) new Bulwark(spot(95 * R, 130 * R, false, b));
  for (let k = 0; k < (S.gunship || 0); k++) new Gunship(spot(110 * R, 150 * R, true, b));
  for (const t of Object.keys(RAIDERS)) for (let k = 0; k < (S[t] || 0); k++) new Boss(spot(85 * R, 130 * R, false, b), mctx, t, 1);
}

G.onKill = (e) => {
  G.hud.kill = 0.3;
  const cr = Math.round((KILL_CR[e.kind] || 50) * DIFFS[cfg.diff].cr);
  run.cr += cr; G.hud.cr = 1.2; G.hud.crLast = cr;
  if (e.kind === 'bulwark' && Math.random() < 0.5) dropRepair(e.c);
  if (e.kind === 'gunship') dropRepair(e.c);
  if (e.kind === 'walker' && Math.random() < 0.6) dropRepair(e.c);
  else if (e.kind === 'drone' && Math.random() < 0.12) dropRepair(e.c);
  else if (e.kind === 'turret' && Math.random() < 0.2) dropRepair(e.c);
  if (e.kind === 'boss') { fx.trauma = 1; timeScaleT = 1.6; }
  if (e.kind === 'relay') { fx.trauma = Math.min(1, fx.trauma + 0.6); const n = G.enemies.filter((x) => x.kind === 'relay' && x.alive).length; banner('中继塔已摧毁', n ? `剩余 ${n} 座` : '全部中继塔已摧毁 · 清除残敌', false); }
};
G.onBossPhase = (b) => { banner(b.B.phase2[0], b.B.phase2[1], true); sfx('alarm'); for (let k = 0; k < 3; k++) new Drone(spot(50, 90, true)); };
G.onRelayCall = (r) => {
  if (G.enemies.filter((e) => e.kind === 'drone' && e.alive).length >= 7) return;
  for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28; new Drone(new V3(r.pos.x + Math.cos(a) * 8, 15 + Math.random() * 4, r.pos.z + Math.sin(a) * 8)); }
  G.fx.ring(new V3(r.pos.x, 13.5, r.pos.z), null, 1, 10, 0.6, 0xff6040);
  if (!run.relayHintT || run.t - run.relayHintT > 40) { run.relayHintT = run.t; showHint('中继塔正在呼叫增援 · 优先摧毁中继塔', 2.5); }
};
G.onEnemyMissile = () => { if (run.msslT <= 0) { sfx('warn'); run.msslT = 1; } };
G.onPlayerHit = () => {};
G.onAllyDown = () => { showHint(`僚机被击毁 · ${WING.respawn} 秒后重新空投`, 3); };
G.onAllyBack = () => { showHint('僚机已重新空投', 2.5); sfx('repair'); };
G.onCoreHit = () => {
  const c = G.core; if (!c) return;
  if (run.t - run.coreWarnT > 9) { run.coreWarnT = run.t; showHint(`反应堆遭受攻击 · 剩余 ${Math.ceil(c.hp / c.maxHp * 100)}%`, 2.2); sfx('warn'); }
  if (!run.coreLowSaid && c.hp < c.maxHp * 0.3) { run.coreLowSaid = true; banner('反应堆危急', '耐久低于 30%', true); sfx('alarm'); }
};
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
  if (G.core && !G.core.alive) {
    if (!run.deathT) { run.deathT = 3.2; run.coreLost = true; fx.trauma = 1; sfx('bigboom'); banner('反应堆被摧毁', 'REACTOR LOST', true); }
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
  run.msslT -= dt;
  if (run.late && (run.t > run.lateT || alive <= 2)) {
    spawnGroup(run.late, run.defense ? 1.15 : 1, run.lateB); run.late = null;
    banner('敌军增援', run.defense ? '从反应堆另一侧逼近' : '更多敌机接近', true); sfx('warn');
    return;
  }
  if (run.boss2 && G.boss) {
    run.boss2.t += dt;
    if (run.boss2.t > 45 || G.boss.hp < G.boss.maxHp * 0.5 || !G.boss.alive) {
      const T = run.boss2.type; run.boss2 = null;
      G.bosses.push(new Boss(spot(70, 100), mctx, T, curWave().spawn.bossHp || 1));
      $('bossName').textContent = G.bosses.map((b) => b.B.name.split(' · ')[0]).join(' ＆ ');
      $('bossBox').classList.remove('hidden');
      banner('增援头目出现', BOSSES[T].name, true); sfx('alarm');
      return;
    }
  }
  if (G.bosses && G.bosses.some((b) => b.phase === 2 && b.alive)) {
    run.droneT -= dt;
    if (run.droneT <= 0) { run.droneT = 22; if (G.enemies.filter((e) => e.kind === 'drone' && e.alive).length < 3) for (let k = 0; k < 2; k++) new Drone(spot(60, 100, true)); }
  }
  if (alive === 0) {
    if (!run.endless && run.wave >= run.waves.length - 1) { if (!run.won) { run.won = true; banner('MISSION COMPLETE', '头目已击破', false); run.deathT = 3.5; } run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
    if (run.endless) { const b = Math.round(150 * (run.wave + 1) * DIFFS[cfg.diff].cr); run.cr += b; }
    G.boss = null; G.bosses = [];
    banner(run.waves[run.wave].spawn.relay ? 'OBJECTIVE CLEAR' : 'WAVE CLEAR', run.endless ? `第 ${run.wave + 1} 波完成 · 弹药补满 · 修复 25% 装甲` : '短暂整备 · 弹药补满 · 修复 25% 装甲', false);
    sfx('repair');
    for (const k of ['R', 'L', 'S']) { const w = G.pw[k]; w.ammo = w.d.mag || 0; w.reloadT = 0; w.cd = 0; }
    const nx = run.waves[run.wave + 1], big = nx && nx.spawn.boss2;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (big ? 0.5 : 0.25));
    if (big) showHint('下一波是双头目 · 已额外修复装甲', 3);
    if (G.wing) G.wing.repair(0.4);
    if (G.core && G.core.alive) { G.core.hp = Math.min(G.core.maxHp, G.core.hp + G.core.maxHp * 0.15); if (G.core.hp > G.core.maxHp * 0.3) run.coreLowSaid = false; }
    run.breakT = 4.5;
  }
}

function finish(win) {
  run.over = true;
  const p = G.player, s = G.stats;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const tm = run.t;
  const M = MISSIONS[cfg.mission], D = DIFFS[cfg.diff], bk = cfg.mission + '.' + cfg.diff;
  let rank = 'C', bonus = 0, newBest = false;
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  if (run.endless) {
    const cleared = Math.max(0, run.wave);   // the wave you died on does not count
    rank = cleared >= 15 ? 'S' : cleared >= 10 ? 'A' : cleared >= 5 ? 'B' : 'C';
    if (cleared > (save.best[bk] || 0)) { save.best[bk] = cleared; newBest = true; }
  } else if (win) {
    const dmgK = s.dmgTaken / p.maxHp;
    rank = dmgK < 0.6 && tm < 420 ? 'S' : dmgK < 1.4 && tm < 600 ? 'A' : 'B';
    if (G.core) { const ck = G.core.hp / G.core.maxHp; rank = ck > 0.7 && dmgK < 1.2 ? 'S' : ck > 0.35 ? 'A' : 'B'; }
    bonus = Math.round(M.reward * D.cr * ({ S: 1.5, A: 1.2, B: 1 }[rank]) * (G.wing ? WING_CR : 1));
    if (!save.best[bk] || tm < save.best[bk]) { save.best[bk] = Math.round(tm); newBest = true; }
  }
  if (G.wing) run.cr = Math.round(run.cr * WING_CR);
  const earned = run.cr + bonus;
  save.cr += earned; save.earned = (save.earned || 0) + earned; writeSave();
  $('rRank').textContent = rank;
  $('rTitle').textContent = run.endless ? 'LINE BROKEN' : win ? 'MISSION COMPLETE' : 'MISSION FAILED';
  $('rSub').textContent = `${M.name} · ${D.name} · ` + (run.endless ? `坚守 ${Math.max(0, run.wave)} 波` : win ? (G.core ? `任务完成 · 反应堆剩余 ${Math.ceil(G.core.hp / G.core.maxHp * 100)}%` : '任务完成') : run.coreLost ? `反应堆在第 ${run.wave + 1} 波被摧毁` : `在第 ${run.wave + 1} 波被击毁`) + (G.wing ? ' · 僚机随行（报酬 ×0.85）' : '');
  const bestTxt = run.endless ? (save.best[bk] ? `${save.best[bk]} 波` : '—') : (save.best[bk] ? fmt(save.best[bk]) : '—');
  $('rStats').innerHTML = `<span>用时</span><b>${fmt(tm)}</b><span>击毁</span><b>${s.kills}</b><span>命中率</span><b>${acc}%</b><span>造成伤害</span><b>${Math.round(s.dmgDealt)}</b><span>承受伤害</span><b>${Math.round(s.dmgTaken)}</b><span>${run.endless ? '最佳波数' : '最佳用时'}</span><b>${bestTxt}${newBest ? ' <em>NEW</em>' : ''}</b>`
    + `<span class="cr">击毁报酬</span><b class="cr">${run.cr} C</b>` + (bonus ? `<span class="cr">任务报酬 · 评级 ${rank}</span><b class="cr">${bonus} C</b>` : '') + `<span class="cr">持有资金</span><b class="cr">${save.cr} C</b>`;
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
  $('touch').classList.toggle('hidden', !(touch.active && s === 'play'));
  if (s !== 'play') { touch.b = {}; touch.mx = touch.my = 0; touch.stick = touch.look = null; for (const b of document.querySelectorAll('#tBtns button')) b.classList.remove('on'); }
  if (s !== 'play' && document.pointerLockElement) document.exitPointerLock();
  if (s !== 'play') { mouse.b0 = mouse.b2 = false; thrust(0); }
  if (s === 'garage') buildGarage();
  if (s === 'title') buildTitle();
  if (s === 'garage' || s === 'title') camera.setViewOffset(innerWidth, innerHeight, s === 'garage' && innerWidth > 760 ? innerWidth * 0.2 : 0, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
}
function sortie() {
  initAudio(); saveCfg();
  newGame();
  setState('play');
  if (touch.active) { freeMouse = true; showHint('左侧拖动移动 · 右侧拖动转视角 · 准星靠近敌人会自动锁定', 4); }
  else if (!pad.active) requestLock(); else { freeMouse = true; showHint('手柄：左摇杆移动 · 右摇杆视角 · RT/LT 双臂 · RB 肩部 · A 跳跃 · B 推进 · X 装填', 4); }
}
function resume() { setState('play'); if (!freeMouse && !touch.active) requestLock(); }
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

// ------------------------------------------------------------------ title: mission select
function bestLine(mk) {
  const parts = [];
  for (const dk of Object.keys(DIFFS)) {
    const v = save.best[mk + '.' + dk]; if (!v) continue;
    parts.push(`${DIFFS[dk].name} ${MISSIONS[mk].endless ? v + ' 波' : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`}`);
  }
  return parts.join(' · ');
}
function buildTitle() {
  const el = $('tMission'); el.innerHTML = '';
  for (const [k, M] of Object.entries(MISSIONS)) {
    const d = document.createElement('button'); d.type = 'button'; d.className = 'mis' + (cfg.mission === k ? ' on' : '');
    const b = bestLine(k);
    d.innerHTML = `<b>${M.name}</b><span class="en">${M.en}</span><small>${M.desc}</small>${b ? `<small class="best">最佳 ${b}</small>` : ''}`;
    d.onclick = () => { initAudio(); sfx('ui'); cfg.mission = k; saveCfg(); ensureArena(); buildTitle(); };
    el.appendChild(d);
  }
  $('bestTxt').textContent = `资金 ${save.cr} C` + (Object.values(save.up).some((v) => v) ? ' · 机库强化 ' + Object.entries(save.up).filter(([, v]) => v).map(([k, v]) => `${UPGRADES[k].name} ${v}`).join(' / ') : '');
}

// ------------------------------------------------------------------ hangar
function buildUpgrades() {
  $('gCr').textContent = `${save.cr} C`;
  const el = $('gUp'); el.innerHTML = '';
  for (const [k, U] of Object.entries(UPGRADES)) {
    const lv = save.up[k], cost = UP_COST[lv];
    const row = document.createElement('div'); row.className = 'uprow';
    row.innerHTML = `<div class="un"><b>${U.name}</b><small>${U.desc} / 级</small></div><div class="pips">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>`;
    const btn = document.createElement('button'); btn.type = 'button';
    if (lv >= 5) { btn.textContent = 'MAX'; btn.disabled = true; }
    else { btn.textContent = `${cost} C`; btn.disabled = save.cr < cost; }
    btn.onclick = () => {
      if (lv >= 5 || save.cr < cost) return;
      save.cr -= cost; save.up[k]++; writeSave(); sfx('coin'); makePlayer(); buildGarage();
    };
    row.appendChild(btn); el.appendChild(row);
  }
}
function buildGarage() {
  buildUpgrades();
  const opt = (html, on, fn, cls = '') => { const d = document.createElement('div'); d.className = 'opt ' + cls + (on ? ' on' : ''); d.innerHTML = html; d.onclick = () => { sfx('ui'); fn(); saveCfg(); buildGarage(); }; return d; };
  const fill = (id, items) => { const el = $(id); el.innerHTML = ''; items.forEach((i) => el.appendChild(i)); };
  fill('gPaint', Object.entries(PALETTES).filter(([k, p]) => k !== 'tyrant' && !p.enemy).map(([k, p]) =>
    opt(`<i style="background:linear-gradient(135deg, ${p.Armor} 0 55%, ${p.Accent} 55% 75%, ${p.Armor2} 75%)"></i>`, cfg.palette === k, () => { cfg.palette = k; G.player.setPalette(k); }, 'sw')));
  fill('gFrame', Object.entries(FRAMES).map(([k, f]) => opt(`${f.name}<small>${f.en}</small>`, cfg.frame === k, () => { cfg.frame = k; rebuildPreview(); })));
  const F = G.player.frame;
  $('gStats').innerHTML = `AP <b>${Math.round(F.hp)}</b> · 速度 <b>×${F.speed.toFixed(2)}</b> · EN <b>${Math.round(F.en)}</b> · 推进 <b>×${F.boost.toFixed(2)}</b> · 受伤 <b>×${F.armor}</b>` + (save.up.fcs ? ` · 伤害 <b>×${dmgMul().toFixed(2)}</b>` : '');
  const wopt = (slot, k) => opt(`${WEAPONS[k].name}<small>${WEAPONS[k].desc}</small>`, cfg[slot] === k, () => { cfg[slot] = k; G.player.mount({ R: cfg.R, L: cfg.L, S: cfg.S }); G.pw = { R: weaponState(cfg.R), L: weaponState(cfg.L), S: weaponState(cfg.S) }; buildWeaponPanel(); });
  fill('gR', ARM_KEYS.map((k) => wopt('R', k)));
  fill('gL', ARM_KEYS.map((k) => wopt('L', k)));
  fill('gS', SHOULDER_KEYS.map((k) => wopt('S', k)));
  const gw = $('gWing'); gw.innerHTML = '';
  if (!save.wing) {
    const row = document.createElement('div'); row.className = 'uprow';
    row.innerHTML = `<div class="un"><b>雇佣僚机</b><small>AI 僚机随行：突击步枪 + 闪电线圈 + 飞弹，伤害为你的一半，击毁后 ${WING.respawn} 秒重新空投 · 随行时报酬 ×0.85</small></div><div></div>`;
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = `${WING_COST} C`; btn.disabled = save.cr < WING_COST;
    btn.onclick = () => { if (save.cr < WING_COST) return; save.cr -= WING_COST; save.wing = true; cfg.wing = true; writeSave(); saveCfg(); sfx('coin'); buildGarage(); };
    row.appendChild(btn); gw.appendChild(row);
  } else {
    const o = document.createElement('div'); o.className = 'opts';
    o.appendChild(opt('随行<small>AI 僚机 · 报酬 ×0.85</small>', cfg.wing, () => { cfg.wing = true; }));
    o.appendChild(opt('单机出击<small>报酬 ×1</small>', !cfg.wing, () => { cfg.wing = false; }));
    gw.appendChild(o);
  }
  fill('gDiff', Object.entries(DIFFS).map(([k, d]) => opt(`${d.name}<small>${d.desc}</small>`, cfg.diff === k, () => { cfg.diff = k; })));
}
function rebuildPreview() { makePlayer(); }

// ------------------------------------------------------------------ HUD
const wrows = {};
function buildWeaponPanel() {
  const el = $('weapons'); el.innerHTML = '';
  for (const [slot, key] of pad.active ? [['R', 'RT'], ['L', 'LT'], ['S', 'RB']] : [['R', 'LMB'], ['L', 'RMB'], ['S', 'E']]) {
    const w = G.pw[slot];
    const d = document.createElement('div'); d.className = 'wrow';
    d.innerHTML = `<div class="top"><span class="key">${key}</span><span class="nm">${w.d.name}</span><span class="am"></span></div><div class="wb"><i></i></div>`;
    el.appendChild(d);
    wrows[slot] = { d, am: d.querySelector('.am'), bar: d.querySelector('.wb i') };
  }
}
const lockPool = [], markPool = [], objPool = [];
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
      if (w.beamT > 0) { txt = w.d.type === 'shield' ? 'ACTIVE' : 'FIRE'; k = w.beamT / w.d.dur; }
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
    d.style.display = ''; d.className = 'mark' + (e.kind === 'boss' ? ' boss' : e.kind === 'relay' ? ' obj' : '');
    d.style.left = (cx + Math.cos(ang) * k) + 'px'; d.style.top = (cy + Math.sin(ang) * k) + 'px';
    d.style.transform = `rotate(${ang + Math.PI / 2}rad)`;
  }
  if (G.core && G.core.alive) {   // the core always has an arrow when off-screen
    _sp.copy(G.core.c).project(camera);
    const behind = _sp.z > 1; let x = _sp.x, y = _sp.y; if (behind) { x = -x; y = -y; }
    if (behind || Math.abs(x) > 0.95 || Math.abs(y) > 0.92) {
      const ang = Math.atan2(-y, x), k = Math.min((innerWidth / 2 - 30) / Math.abs(Math.cos(ang) || 1e-6), (innerHeight / 2 - 30) / Math.abs(Math.sin(ang) || 1e-6));
      const d = markPool[mi] || poolEl(markPool, M, 'mark'); mi++;
      d.style.display = ''; d.className = 'mark core'; d.style.left = (cx + Math.cos(ang) * k) + 'px'; d.style.top = (cy + Math.sin(ang) * k) + 'px'; d.style.transform = `rotate(${ang + Math.PI / 2}rad)`;
    }
  }
  for (; mi < markPool.length; mi++) markPool[mi].style.display = 'none';
  let oi = 0;
  for (const e of G.enemies) {
    if (e.kind !== 'relay' || !e.alive) continue;
    _sp.set(e.pos.x, e.pos.y + 15.5, e.pos.z).project(camera);
    if (_sp.z > 1 || Math.abs(_sp.x) > 1 || Math.abs(_sp.y) > 1) continue;
    const d = objPool[oi] || poolEl(objPool, M, 'objm'); oi++;
    d.style.display = ''; d.className = 'objm'; d.style.left = ((_sp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - _sp.y) / 2 * innerHeight) + 'px';
    d.textContent = `◆ 中继塔 ${Math.round(e.pos.distanceTo(p.pos))}m`;
  }
  if (G.core && G.core.alive) {
    _sp.set(G.core.pos.x, 17.5, G.core.pos.z).project(camera);
    const dd = G.core.pos.distanceTo(p.pos);
    if (_sp.z < 1 && Math.abs(_sp.x) < 1 && Math.abs(_sp.y) < 1 && dd > 18) {
      const d = objPool[oi] || poolEl(objPool, M, 'objm'); oi++;
      d.style.display = ''; d.className = 'objm core'; d.style.left = ((_sp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - _sp.y) / 2 * innerHeight) + 'px';
      d.textContent = `◆ 反应堆 ${Math.round(dd)}m`;
    }
  }
  for (; oi < objPool.length; oi++) objPool[oi].style.display = 'none';
  // hurt vignette
  G.hud.hurt = Math.max(0, G.hud.hurt - dt * 1.2);
  $('hurt').style.opacity = Math.min(0.9, G.hud.hurt + (hpK < 0.25 ? 0.25 + Math.sin(performance.now() / 180) * 0.1 : 0)).toFixed(2);
  // waves / boss
  if (run.wave >= 0) {
    $('waveTitle').textContent = curWave().title;
    const left = G.enemies.filter((e) => e.alive).length;
    const rl = G.enemies.filter((e) => e.kind === 'relay' && e.alive).length;
    $('waveSub').textContent = run.breakT > 0 ? '整备中…' : (rl ? `中继塔 ${rl} · 敌机 ${left - rl}` : `剩余敌机 ${left}`);
  } else { $('waveTitle').textContent = 'STANDBY'; $('waveSub').textContent = ''; }
  const cb = $('coreBox'); cb.classList.toggle('hidden', !G.core);
  if (G.core) { const ck = G.core.hp / G.core.maxHp; $('coreBar').firstElementChild.style.width = (ck * 100).toFixed(1) + '%'; $('coreBar').classList.toggle('low', ck < 0.3); $('corePct').textContent = Math.ceil(ck * 100) + '%'; cb.classList.toggle('hit', G.core.flash > 0); }
  const wt = $('wingTxt'); wt.classList.toggle('hidden', !G.wing);
  if (G.wing) wt.innerHTML = G.wing.alive ? `僚机 <b>${Math.ceil(G.wing.hp / G.wing.maxHp * 100)}%</b>` : `僚机 <em>重新空投 ${Math.ceil(G.wing.downT)}s</em>`;
  const bl = (G.bosses || []).filter((b) => !b.gone);
  if (bl.length) $('bossBar').firstElementChild.style.width = (bl.reduce((a, b) => a + b.hp, 0) / G.bosses.reduce((a, b) => a + b.maxHp, 0) * 100).toFixed(1) + '%';
  else $('bossBox').classList.add('hidden');
  // incoming enemy missiles + credits ticker
  let inc = 0;
  for (const sh of G.shots) if (sh.team === 'E' && sh.kind === 'missile' && sh.target && sh.target.isPlayer && Math.hypot(sh.x - p.pos.x, sh.z - p.pos.z) < 90) inc++;
  const ma = $('mAlert'); ma.classList.toggle('hidden', !inc); if (inc) ma.textContent = `MISSILE ×${inc} · SHIFT 急闪`;
  G.hud.cr = Math.max(0, (G.hud.cr || 0) - dt);
  $('crTxt').innerHTML = `${run.cr} C` + (G.hud.cr > 0 ? ` <em>+${G.hud.crLast}</em>` : '');
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
    if (e.kind === 'relay') { rctx.fillStyle = '#ffd23a'; rctx.save(); rctx.translate(x, z); rctx.rotate(Math.PI / 4); rctx.fillRect(-6, -6, 12, 12); rctx.restore(); continue; }
    rctx.fillStyle = e.kind === 'boss' ? '#ff8a1a' : '#ff4a3a';
    if (e.kind === 'raider') rctx.fillStyle = '#ff9a5a';
    const s = e.kind === 'boss' ? 9 : e.kind === 'gunship' || e.kind === 'raider' ? 8 : e.kind === 'walker' || e.kind === 'bulwark' ? 7 : 5;
    rctx.fillRect(x - s / 2, z - s / 2, s, s);
  }
  if (G.core && G.core.alive) { rctx.fillStyle = '#5fe3ff'; const x = (G.core.pos.x - p.pos.x) * K, z = (G.core.pos.z - p.pos.z) * K; rctx.beginPath(); rctx.arc(x, z, 9, 0, Math.PI * 2); rctx.fill(); rctx.strokeStyle = '#e8fbff'; rctx.lineWidth = 2; rctx.stroke(); }
  if (G.wing && G.wing.alive) { rctx.fillStyle = '#9fffd0'; const x = (G.wing.pos.x - p.pos.x) * K, z = (G.wing.pos.z - p.pos.z) * K; rctx.beginPath(); rctx.moveTo(x, z - 8); rctx.lineTo(x - 6, z + 6); rctx.lineTo(x + 6, z + 6); rctx.fill(); }
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
  for (const e of G.enemies) { if (!e.alive || e.dying) continue; let d = e.c.distanceTo(p.pos) + (e.kind === 'boss' ? -30 : e.kind === 'relay' ? -25 : 0); if (G.core) d = d * 0.5 + e.c.distanceTo(G.core.pos) * 0.7; if (d < bd) { bd = d; tgt = e; } }
  // pick up repairs when hurt
  let goal = null;
  if (p.hp < p.maxHp * 0.6) for (const k of G.pickups) { const d = k.o.position.distanceTo(p.pos); if (d < 70) { goal = k.o.position; break; } }
  if (!goal && G.core && G.core.alive && Math.hypot(p.pos.x - G.core.pos.x, p.pos.z - G.core.pos.z) > 70) goal = G.core.pos;
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
  const melee = G.pw.R.d.type === 'blade' || G.pw.L.d.type === 'blade';
  let f = tgt ? (melee ? (d > 24 ? 1 : 0) : (d > 45 ? 1 : d < 22 ? -1 : 0)) : 0, s = tgt ? auto.st : 0;
  if (goal) { const gx = goal.x - p.pos.x, gz = goal.z - p.pos.z; const yaw = cam.yaw; const fw = [-Math.sin(yaw), -Math.cos(yaw)], rt = [Math.cos(yaw), -Math.sin(yaw)]; f = Math.sign(gx * fw[0] + gz * fw[1]); s = Math.sign(gx * rt[0] + gz * rt[1]); }
  const los = tgt && clearLine(p.center(new V3()), tgt.c);
  auto.sT -= dt; const sPress = auto.sT <= 0 && los; if (sPress) auto.sT = 0.6;
  const incoming = G.shots.some((sh) => sh.team === 'E' && sh.kind === 'missile' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 22);
  const fire = (slot) => !!los && (G.pw[slot].d.type !== 'blade' || d < 36) && (G.pw[slot].d.type !== 'charge' || Math.random() < 0.985);
  return { f, s, boost: d > 70 || !!goal, qboost: (G.hud.hurt > 0.35 && Math.random() < 0.05) || (incoming && Math.random() < 0.25), jump, hover: auto.hover > 0, b0: fire('R'), b2: fire('L'), e: sPress };
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
  if (G.hitStop > 0) { G.hitStop -= dt; dt *= 0.12; }
  G.time += dt; simTime += dt;
  // look
  if (pointerLocked) {
    cam.yaw -= mouse.dx * 0.0022 * cfg.sens; cam.pitch -= mouse.dy * 0.0022 * cfg.sens * (cfg.invY ? -1 : 1);
  } else if (freeMouse && !pad.active && !touch.active && innerWidth > 0 && innerHeight > 0) {
    const ex = (mouse.x / innerWidth - 0.5) * 2, ey = (mouse.y / innerHeight - 0.5) * 2;
    const band = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.55) / 0.45;
    cam.yaw -= band(ex) * 2.4 * cfg.sens * dt; cam.pitch -= band(ey) * 1.4 * cfg.sens * dt * (cfg.invY ? -1 : 1);
  }
  mouse.dx = mouse.dy = 0;
  if (touch.active) {
    cam.yaw -= touch.dx * 0.0062 * cfg.sens; cam.pitch -= touch.dy * 0.0048 * cfg.sens * (cfg.invY ? -1 : 1);
    touch.dx = touch.dy = 0;
  }
  if (pad.active || touch.active) {
    if (pad.active) { cam.yaw -= pad.rx * 2.7 * cfg.sens * dt; cam.pitch -= pad.ry * 1.7 * cfg.sens * dt * (cfg.invY ? -1 : 1); }
    // light aim assist: drift toward the primary lock while the right stick is gentle
    const lt = G.lockTarget;
    if (lt && lt.sx !== undefined && Math.abs(pad.rx) + Math.abs(pad.ry) < 0.6) {
      const ox = (lt.sx - innerWidth / 2) / innerHeight, oy = (lt.sy - innerHeight / 2) / innerHeight;
      const k = touch.active ? 1.4 : 1;   // a finger is less precise than a stick
      cam.yaw -= ox * 2.2 * k * dt; cam.pitch -= oy * 1.6 * k * dt;
    }
  }
  let A;
  if (auto.on) A = autoIntent(dt);
  else {
    const B = pad.b, T = touch.b;
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight') || !!B[1] || !!B[4] || !!B[10] || !!T.boost, space = keys.has('Space') || !!B[0] || !!T.jump;
    const cl = (v) => Math.max(-1, Math.min(1, v));
    A = { f: cl((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - pad.ly - touch.my), s: cl((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + pad.lx + touch.mx),
      boost: shift, qboost: shift && !lastShift, jump: space && !lastSpace, hover: space, b0: mouse.b0 || !!B[7] || !!T.b0, b2: mouse.b2 || !!B[6] || !!T.b2, e: ePressed || !!B[5] || !!T.e };
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
    const dm = dmgMul();
    G.curLabel = 'p-' + G.pw.R.key; weaponTick(dt, p, 'R', G.pw.R, A.b0, G.aimPoint, G.lockTarget, 'P', G.locks, dm);
    G.curLabel = 'p-' + G.pw.L.key; weaponTick(dt, p, 'L', G.pw.L, A.b2, G.aimPoint, G.lockTarget, 'P', G.locks, dm);
    G.curLabel = 'p-' + G.pw.S.key; weaponTick(dt, p, 'S', G.pw.S, A.e, G.aimPoint, G.lockTarget, 'P', G.locks, dm);
    G.curLabel = null;
    if (G.pw.S.d.type !== 'beam' && G.pw.S.cd > 0 && A.e && G.pw.S.cd < G.pw.S.d.cd - 0.3 && !auto.on && Math.random() < 0.02) sfx('empty');
  }
  if (G.core) G.core.update(dt);
  if (G.wing && !run.won) G.wing.update(dt);
  updateCombat(dt);
  // boost dust trail
  if (p.alive && p.grounded && p.thrustLv > 0.5 && Math.random() < 0.6) fx.dust(p.pos, 1, 1.8, 3);
  if (p.alive && !p.grounded && p.hoverLv > 0.3 && p.pos.y - groundAt(p.pos.x, p.pos.z, p.pos.y) < 6 && Math.random() < 0.5) fx.dust(new V3(p.pos.x, groundAt(p.pos.x, p.pos.z, p.pos.y), p.pos.z), 1, 2.2, 6);
  fx.update(dt, camera);
  updateSnow(dt); updateRain(dt);
  waveLogic(dt);
  thrust(p.alive ? Math.max(p.thrustLv, p.hoverLv * 0.7) : 0);
  const inten = run.wave < 0 ? 0 : (G.bosses && G.bosses.some((b) => b.alive)) ? 1 : Math.min(0.9, 0.45 + run.wave * 0.15);
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
  pollPad();
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
  save, MISSIONS, ensureArena, applyEnv, writeSave,
  mouse, pad, setPadActive, pollPad, touch, setTouch,
};

// ------------------------------------------------------------------ boot
(async () => {
  try {
    await loadKit('./assets/kit.glb?v=5');
    ensureArena();
    makePlayer();
    setState('title');
    camera.position.set(10, 6, 140);
    requestAnimationFrame(frame);
  } catch (e) {
    $('loading').innerHTML = `<div style="color:#ff8a7a; max-width: 600px">载入失败：${e && e.message ? e.message : e}</div>`;
    console.error(e);
  }
})();
