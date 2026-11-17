// Weapons, projectiles, enemies, damage.  Shared state lives in G.
import * as THREE from 'three';
import { barrels, raySolids, clearLine, collideCyl, groundAt, removeSolid, pointInSolid, addSolid, ARENA, LAVA, lavaAt, lavaD } from './world.js';
import { cloneKit, nodes, find, recolor } from './kit.js';
import { Mech, angDiff, PALETTES } from './mech.js';
import { sfx } from './audio.js';

const V3 = THREE.Vector3;
export const G = {
  scene: null, fx: null, camera: null, player: null, boss: null,
  enemies: [], shots: [], pickups: [], beams: [], queue: [], minis: [], mines: [], burning: new Set(), chilled: new Set(),
  time: 0, diff: { key: 'normal', dmg: 1, hp: 1 },
  stats: { shots: 0, hits: 0, kills: 0, dmgTaken: 0, dmgDealt: 0 },
  hud: { hit: 0, hurt: 0, kill: 0 },
  aimPoint: new V3(), lockTarget: null, locks: [], onKill: null, onPlayerHit: null,
  pw: {},      // player weapon states by slot
  friends: [],  // other things enemies may shoot: wingman, reactor core ({pos, vel, center(), alive, _ent, foeW})
};

export const WEAPONS = {
  rifle: { slot: 'arm', name: 'AR-77 突击步枪', en: 'AR-77 Rifle', desc: '全自动 · 精准 · 均衡', type: 'bullet', rate: 0.1, dmg: 17, speed: 320, spread: 0.005, mag: 40, reload: 1.7, color: 0xffd27a, w: 0.22, len: 7, sfx: 'rifle', recoil: 0.18 },
  gatling: { slot: 'arm', name: 'GX-6 加特林', en: 'GX-6 Gatling', desc: '需预转 · 高射速 · 散布大', type: 'bullet', rate: 0.042, spinUp: 0.45, dmg: 8.5, speed: 290, spread: 0.022, mag: 200, reload: 3.0, color: 0xffb860, w: 0.18, len: 6, sfx: 'gatling', recoil: 0.08 },
  coil: { slot: 'arm', name: 'LC-3 闪电线圈', en: 'LC-3 Arc Coil', desc: '自动索敌 · 连锁 3 个目标', type: 'chain', rate: 0.5, dmg: 44, range: 60, chains: 3, chainR: 18, mag: 14, reload: 2.2, sfx: 'coil', recoil: 0.3 },
  rail: { slot: 'arm', name: 'RG-9 磁轨炮', en: 'RG-9 Railgun', desc: '按住蓄力 · 松开贯穿', type: 'charge', charge: 1.1, dmg: [45, 280], rate: 0.6, mag: 6, reload: 2.6, sfx: 'rail', recoil: 0.9 },
  blade: { slot: 'arm', name: 'LB-0 光束剑', en: 'LB-0 Pulse Blade', desc: '近战 · 锁定时冲刺斩击 · 耗 EN', type: 'blade', dmg: 310, range: 7.5, lunge: 38, cd: 0.95, cost: 16, sfx: 'blade' },
  shotgun: { slot: 'arm', name: 'SG-12 霰弹炮', en: 'SG-12 Scattergun', desc: '近距离 · 一发 9 颗弹丸 · 射程短', type: 'bullet', pellets: 9, rate: 0.72, dmg: 13, speed: 250, spread: 0.075, life: 0.42, mag: 6, reload: 2.3, color: 0xffc890, w: 0.2, len: 4, sfx: 'cannon', recoil: 0.7 },
  grenade: { slot: 'arm', name: 'GL-4 榴弹发射器', en: 'GL-4 Grenade Launcher', desc: '抛物线弹道 · 范围爆炸 · 可越过掩体', type: 'bullet', grenade: true, rate: 0.55, dmg: 78, splash: 6.5, speed: 88, grav: 30, spread: 0.004, mag: 8, reload: 2.5, color: 0xffa050, sfx: 'grenade', recoil: 0.55 },
  flamer: { slot: 'arm', name: 'FT-2 火焰喷射器', en: 'FT-2 Flamethrower', desc: '近距离持续喷射 · 点燃敌人持续灼烧 · 燃烧中的敌人伤害 −25%', type: 'flame', rate: 0.04, dmg: 8, speed: 60, spread: 0.08, life: 0.42, mag: 120, reload: 2, burn: 22, burnT: 2.5, sfx: 'flame' },
  cryo: { slot: 'arm', name: 'CR-3 冷冻枪', en: 'CR-3 Cryo Lance', desc: '冰晶连射 · 射程 70 m · 命中累积寒冷让敌人变慢 · 冻满后冰封 1.5 秒（瘫痪、受伤 +30%）', type: 'bullet', rate: 0.085, dmg: 8.5, speed: 230, spread: 0.007, life: 0.3, mag: 60, reload: 2.2, color: 0x9fe8ff, w: 0.26, len: 5, sfx: 'cryo', recoil: 0.1, chill: 5.5 },
  pile: { slot: 'arm', name: 'PB-9 打桩机', en: 'PB-9 Pile Bunker', desc: '近战 · 锁定时冲刺 · 单体重击 · 贯穿护盾', type: 'pile', dmg: 430, range: 5.5, lunge: 26, cd: 1.3, cost: 20, sfx: 'pile' },
  missile: { slot: 'shoulder', name: 'MS-6 飞弹巢', en: 'MS-6 Missile Pods', desc: '多重锁定 · 6 发追踪', type: 'missile', count: 6, dmg: 40, splash: 5, cd: 6.5, sfx: 'missile' },
  cannon: { slot: 'shoulder', name: 'PC-2 等离子炮', en: 'PC-2 Plasma Cannon', desc: '大范围爆炸 · 弹速慢', type: 'plasma', dmg: 165, splash: 9, speed: 105, cd: 3.4, sfx: 'cannon' },
  laser: { slot: 'shoulder', name: 'LZ-1 光束炮', en: 'LZ-1 Beam Laser', desc: '持续照射 2.2 秒', type: 'beam', dps: 135, dur: 2.2, range: 150, cd: 7.5, sfx: 'laser' },
  drones: { slot: 'shoulder', name: 'DP-4 攻击无人机', en: 'DP-4 Drone Pod', desc: '放出 2 架无人机 · 自动攻击 14 秒', type: 'drones', count: 2, dur: 14, dmg: 6, rate: 0.17, range: 80, cd: 18, sfx: 'drone' },
  emp: { slot: 'shoulder', name: 'EP-5 电磁脉冲', en: 'EP-5 EMP Burst', desc: '周围 26 m 敌机瘫痪 2.5 秒（头目 0.8 秒）· 瘫痪中受伤 +30% · 清除来袭弹药与地雷', type: 'emp', radius: 26, dmg: 85, stun: 2.5, bossStun: 0.8, cd: 11, sfx: 'emp' },
  grav: { slot: 'shoulder', name: 'GW-1 重力井', en: 'GW-1 Gravity Well', desc: '发射奇点 · 3 秒内把周围敌机拖向中心并吞掉敌弹 · 结束时坍缩爆炸', type: 'grav', speed: 75, range: 95, R: 20, pull: 15, dur: 3, dps: 26, burst: 150, burstR: 11, cd: 14, sfx: 'grav' },
  decoy: { slot: 'shoulder', name: 'HD-1 全息诱饵', en: 'HD-1 Holo Decoy', desc: '投射机体全息影像 6 秒 · 吸引敌方火力（头目不易上当）· 被打碎时放出电磁冲击', type: 'decoy', hp: 380, dur: 6, cd: 20, burst: 70, burstR: 11, sfx: 'decoy' },
  orbital: { slot: 'shoulder', name: 'OS-1 轨道打击', en: 'OS-1 Orbital Strike', desc: '标记落点 · 1.4 秒后卫星光柱从天而降 · 半径 9 m 重击 · 落点灼烧 2 秒 · 锁定时卫星跟踪目标直到落下前 0.4 秒', type: 'orbital', dmg: 360, R: 9, delay: 1.4, dps: 40, burnT: 2, range: 170, cd: 13, sfx: 'orbital' },
  shield: { slot: 'shoulder', name: 'AS-3 能量护盾', en: 'AS-3 Aegis Shield', desc: '展开 3 秒 · 正面伤害 −85%', type: 'shield', dur: 3, cd: 9, block: 0.85, arc: 0.15, sfx: 'shield' },
};
export const ARM_KEYS = ['rifle', 'gatling', 'shotgun', 'flamer', 'cryo', 'grenade', 'coil', 'rail', 'blade', 'pile'];
export const SHOULDER_KEYS = ['missile', 'cannon', 'laser', 'shield', 'drones', 'emp', 'decoy', 'grav', 'orbital'];

export function weaponState(key) {
  const d = WEAPONS[key];
  return { key, d, ammo: d.mag || 0, reloadT: 0, cd: 0, spin: 0, chargeT: 0, wasHeld: false, beamT: 0, sndT: 0, fired: 0, windT: 0, side: 1 };
}

const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3();

// ------------------------------------------------------------------ entities for hit tests
function entsFor(team) {
  const out = [];
  if (team === 'P') {
    for (const e of G.enemies) if (e.alive && !e.dying) { if (e.parts) { for (const pt of e.parts) if (pt.alive) out.push(pt); } else out.push(e); }
    for (const b of barrels) if (!b.dead) out.push(b.ent || (b.ent = { isBarrel: true, b, c: b.pos, r: 1.5, get alive() { return !b.dead; }, hit: (dmg) => hitBarrel(b, dmg) }));
    for (const m of G.mines) if (m.alive) out.push(m);
  } else {
    const p = G.player;
    if (p && p.alive) { p._ent = p._ent || { isPlayer: true, c: new V3(), r: 2.1 * p.scale, get alive() { return p.alive; }, hit: (dmg, src, label) => damagePlayer(dmg, src, label) }; p.center(p._ent.c); out.push(p._ent); }
    for (const f of G.friends) if (f.alive && f._ent) { f.center(f._ent.c); out.push(f._ent); }
    for (const b of barrels) if (!b.dead) out.push(b.ent || (b.ent = { isBarrel: true, b, c: b.pos, r: 1.5, get alive() { return !b.dead; }, hit: (dmg) => hitBarrel(b, dmg) }));
  }
  return out;
}

// segment a->b vs spheres; returns {ent, t} with t in [0,1]
function segHit(a, b, ents, pad = 0) {
  let best = null, bt = 2;
  _d.subVectors(b, a); const L2 = _d.lengthSq();
  for (const e of ents) {
    _c.subVectors(e.c, a);
    let t = L2 > 0 ? _c.dot(_d) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const dx = a.x + _d.x * t - e.c.x, dy = a.y + _d.y * t - e.c.y, dz = a.z + _d.z * t - e.c.z;
    const r = e.r + pad;
    if (dx * dx + dy * dy + dz * dz < r * r && t < bt) { bt = t; best = e; }
  }
  return best ? { ent: best, t: bt } : null;
}

// ray vs entity spheres (returns all hits sorted, or nearest)
export function rayEnts(o, d, maxT, ents, all = false) {
  const hits = [];
  for (const e of ents) {
    _c.subVectors(e.c, o); const tc = _c.dot(d);
    if (tc < 0) continue;
    const d2 = _c.lengthSq() - tc * tc; if (d2 > e.r * e.r) continue;
    const t = tc - Math.sqrt(e.r * e.r - d2);
    if (t < maxT) hits.push({ ent: e, t: Math.max(0, t) });
  }
  hits.sort((a, b) => a.t - b.t);
  return all ? hits : hits[0] || null;
}
export function enemyEnts() { return entsFor('P').filter((e) => !e.isBarrel && !e.isMine); }

// overdrive: the meter fills from damage dealt; while active: damage x1.4, damage taken x0.65, free energy, fast reloads
export const OD = { fill: 2600, dur: 10, dmg: 1.4, armor: 0.65 };

// ------------------------------------------------------------------ damage
function dealDamage(ent, dmg, team, at, label) {
  if (!ent.alive) return;
  if (team === 'P') { const h = ent.kind === 'cpart' ? ent.owner : ent; if (h.stunT > 0) dmg *= STUN_VULN; }   // EMP-stunned targets take extra damage
  if ((team === 'P' || team === 'X') && !G.pierce && !ent.isBarrel && !ent.isMine && !ent.isPlayer && !ent.isAlly && G.player) {   // warden dome: hits from outside are absorbed
    const w = domeAt(ent.c);
    if (w && G.player.pos.distanceTo(w.pos) > w.R) { w.absorb(dmg, domeEntry(w, G.player.center(_c), ent.c, new V3())); if (team === 'P' && !isAlly(label || G.curLabel)) G.stats.hits++; return; }
  }
  ent.hit(dmg, at, label || G.curLabel);
  if (team === 'P' && !ent.isBarrel && !isAlly(label || G.curLabel)) { G.stats.hits++; G.stats.dmgDealt += dmg; G.hud.hit = 0.14; if (G.od && !(G.od.t > 0) && !ent.isCore) G.od.k = Math.min(1, G.od.k + dmg / OD.fill * (G.odGain || 1)); }
}

const BURN_WEAK = 0.75, STUN_VULN = 1.3;
const isAlly = (l) => !!l && l.startsWith('ally');
function damagePlayer(dmg, src, label) {
  const p = G.player; if (!p || !p.alive || G.godMode) return;
  const blk = shieldBlock(p, src || G.curSrc);
  if (blk) { G.stats.blocked = (G.stats.blocked || 0) + dmg * blk; if (Math.random() < 0.3) sfx('shield', 0); }
  if (G.curShooter && G.curShooter.burnT > 0) dmg *= BURN_WEAK;   // direct hits (melee, beams) from a burning enemy
  const d = dmg * G.diff.dmg * p.frame.armor * (1 - blk) * (G.od && G.od.t > 0 ? OD.armor : 1);
  G.dmgLog = G.dmgLog || {}; G.dmgLog[label || '?'] = (G.dmgLog[label || '?'] || 0) + d;
  p.hit(d); G.stats.dmgTaken += d; G.hud.hurt = Math.min(1, G.hud.hurt + d / 120); G.hurtAt = G.time;
  if (src) G.hud.hurtDir = Math.atan2(src.x - p.pos.x, src.z - p.pos.z);
  G.onPlayerHit && G.onPlayerHit(d);
}

function hitBarrel(b, dmg) {
  if (b.dead) return;
  b.hp -= dmg;
  if (b.hp <= 0) {
    b.dead = true; removeSolid(b.solid); b.obj.visible = false;
    setTimeout(() => explodeAt(b.pos, 9, 170, 'X', 1.8), 60);
  }
}

// splash: team 'P' hurts enemies, 'E' hurts player, 'X' hurts everyone
export function explodeAt(pos, radius, dmg, team, size = 1, color) {
  G.fx.explosion(pos, size, color);
  if (pos.y < 2) G.fx.decal(pos, radius * 0.9);
  const d = G.player ? G.player.pos.distanceTo(pos) : 50;
  sfx(size > 1.5 ? 'bigboom' : 'boom', d);
  const lists = team === 'P' ? [entsFor('P')] : team === 'E' ? [entsFor('E')] : [entsFor('P'), entsFor('E').filter((e) => e.isPlayer)];
  for (const ents of lists) for (const e of ents) {
    const dist = e.c.distanceTo(pos) - e.r * 0.6;
    if (dist < radius) dealDamage(e, dmg * (1 - Math.max(0, dist) / radius * 0.6), team === 'X' ? 'X' : team, pos, G.curLabel);
  }
}

// ------------------------------------------------------------------ shots
// kind: bullet | ebullet | shell | missile | plasma
export function spawnShot(o) {
  const s = { x: o.p.x, y: o.p.y, z: o.p.z, v: o.v.clone(), life: o.life ?? 2.5, dmg: o.dmg, team: o.team, kind: o.kind, splash: o.splash || 0,
    burn: o.burn || 0, burnT: o.burnT || 0, chill: o.chill || 0, label: o.label || G.curLabel || o.kind, color: o.color ?? 0xffd27a, w: o.w ?? 0.2, len: o.len ?? 6, target: o.target || null, aim: o.aim ? o.aim.clone() : null, age: 0, speed: o.v.length(), maxSpeed: o.maxSpeed || 0, size: o.size || 1, turn: o.turn || 5.5, grav: o.grav ?? 6 };
  if (s.team === 'E' && G.curShooter && G.curShooter.burnT > 0) s.dmg *= BURN_WEAK;   // burning enemies fire weakened shots
  G.shots.push(s);
  return s;
}

function impact(s, at, ent) {
  const fx = G.fx; G.curLabel = s.label;
  if (s.kind === 'missile') explodeAt(at, s.splash, s.dmg, s.team, 0.7);
  else if (s.kind === 'plasma') explodeAt(at, s.splash, s.dmg, s.team, 1.5, 0xff8a30);
  else if (s.kind === 'shell') explodeAt(at, s.splash, s.dmg, s.team, 0.55, 0xff7040);
  else if (s.kind === 'grenade') explodeAt(at, s.splash, s.dmg, s.team, 0.95, 0xffa040);
  else if (s.kind === 'flame') {
    if (ent) { dealDamage(ent, s.dmg, s.team, at); if (s.burn && ent.alive && !ent.isBarrel && !ent.isPlayer && !ent.isMine) ignite(ent, s.burn, s.burnT, s.label); }
    fx.emit('add', { x: at.x, y: at.y, z: at.z, vy: 1.5, life: 0.25, s0: 1.4, s1: 2.4, c0: 0xffa040, c1: 0xff3010 });
  }
  else {
    if (ent) dealDamage(ent, s.dmg, s.team, at);
    if (s.chill && ent && ent.alive && !ent.isBarrel && !ent.isPlayer && !ent.isMine && !ent.isAlly) { chillAdd(ent.kind === 'cpart' ? ent.owner : ent, s.chill); fx.sparks(at, null, 3, 0xd8f6ff, 6, 0.8, 0.3, 0.2); }
    fx.sparks(at, _a.copy(s.v).normalize().multiplyScalar(-1), ent ? 6 : 4, s.team === 'P' ? 0xffd27a : 0xff7a50, 14, 0.8, 0.25, 0.22);
    fx.emit('add', { x: at.x, y: at.y, z: at.z, life: 0.08, s0: ent ? 1.4 : 0.9, c0: s.color });
    if (ent && ent.isPlayer) sfx('hurt');
  }
}

function updateShots(dt) {
  const fx = G.fx;
  const entsP = entsFor('P'), entsE = entsFor('E');
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.age += dt; s.life -= dt;
    if (s.kind === 'missile') {
      const tgt = s.target && s.target.alive && !s.target.dying ? s.target.c : s.aim;
      if (s.age > 0.18 && tgt) {
        _a.set(tgt.x - s.x, tgt.y - s.y, tgt.z - s.z).normalize();
        _b.copy(s.v).normalize();
        const ang = Math.acos(Math.max(-1, Math.min(1, _a.dot(_b))));
        const turn = Math.min(1, (s.turn * dt) / Math.max(ang, 1e-3));
        _b.lerp(_a, turn).normalize();
        s.speed = Math.min(s.maxSpeed, s.speed + 120 * dt);
        s.v.copy(_b).multiplyScalar(s.speed);
      } else s.v.y -= 12 * dt;
      fx.emit('smoke', { x: s.x, y: s.y, z: s.z, vx: (Math.random() - 0.5), vy: 0.5, vz: (Math.random() - 0.5), life: 0.9, s0: 0.6, s1: 2.2, c0: 0xc8c6c0, c1: 0xa09e98, a0: 0.5, drag: 2 });
      fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.05, s0: s.team === 'E' ? 1.8 : 1.3, c0: s.team === 'E' ? 0xff5030 : 0xffc070 });
    } else if (s.kind === 'flame') {
      s.v.multiplyScalar(1 - Math.min(0.5, 1.3 * dt)); s.v.y += 4 * dt;
      const a = s.age;
      fx.emit('add', { x: s.x, y: s.y, z: s.z, vx: s.v.x * 0.25, vy: s.v.y * 0.25 + 0.8, vz: s.v.z * 0.25, life: 0.11, s0: 0.5 + a * 6, s1: 0.8 + a * 7.5, c0: a < 0.12 ? 0xffe6a8 : 0xffa040, c1: 0xff3a10 });
      if (a > 0.25 && Math.random() < 0.18) fx.emit('smoke', { x: s.x, y: s.y, z: s.z, vx: 0, vy: 1.6, vz: 0, life: 0.8, s0: 1.2, s1: 3, c0: 0x4a4440, c1: 0x2a2624, a0: 0.35, drag: 1.5 });
    } else if (s.kind === 'grenade') {
      s.v.y -= s.grav * dt;
      fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.1, s0: 1.0, s1: 0.3, c0: 0xffb060 });
      if (Math.random() < 0.5) fx.emit('smoke', { x: s.x, y: s.y, z: s.z, vx: 0, vy: 0.3, vz: 0, life: 0.6, s0: 0.4, s1: 1.4, c0: 0xb8b4ac, c1: 0x98948c, a0: 0.35, drag: 2 });
    } else if (s.kind === 'shell') {
      s.v.y -= s.grav * dt;
      fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.12, s0: 1.2, s1: 0.4, c0: 0xff8050 });
    } else if (s.kind === 'plasma') {
      fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.06, s0: 4.2, c0: 0xffb060 });
      fx.emit('add', { x: s.x, y: s.y, z: s.z, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, life: 0.35, s0: 1.6, s1: 0.2, c0: 0xff9040 });
    }
    _a.set(s.x, s.y, s.z);
    _b.set(s.x + s.v.x * dt, s.y + s.v.y * dt, s.z + s.v.z * dt);
    if (s.team === 'P') {   // warden domes stop player shots coming in from outside
      const wd = domeAt(_b);
      if (wd && _a.distanceTo(wd.pos) >= wd.R) {
        const at = domeEntry(wd, _a, _b, new V3());
        wd.absorb(s.dmg * (s.splash ? 1.3 : 1), at);
        if (s.splash) G.fx.explosion(at, 0.6, 0xffb050);
        if (!isAlly(s.label)) G.stats.hits++;
        G.shots.splice(i, 1); continue;
      }
    }
    // vs entities
    const h = segHit(_a, _b, s.team === 'P' ? entsP : entsE, s.kind === 'plasma' ? 0.6 : s.kind === 'flame' ? 0.4 + s.age * 2.5 : 0);
    // vs world
    const L = _a.distanceTo(_b); _d.subVectors(_b, _a).divideScalar(L || 1);
    const w = raySolids(_a, _d, L);
    if (h && h.t * L <= w.t) {
      _c.lerpVectors(_a, _b, h.t);
      impact(s, _c.clone(), h.ent); G.shots.splice(i, 1); continue;
    }
    if (w.solid) {
      _c.copy(_a).addScaledVector(_d, w.t);
      impact(s, _c.clone(), null);
      if (w.solid.isBarrel === undefined && w.solid.ref && w.solid.kind === 'barrel') hitBarrel(w.solid.ref, s.dmg);
      G.shots.splice(i, 1); continue;
    }
    s.x = _b.x; s.y = _b.y; s.z = _b.z;
    if (s.life <= 0 || Math.abs(s.x) > 400 || Math.abs(s.z) > 400) {
      if (s.kind === 'missile' || s.kind === 'plasma' || s.kind === 'grenade') impact(s, _b.clone(), null);
      G.shots.splice(i, 1); continue;
    }
    // draw
    if (s.kind === 'bullet' || s.kind === 'ebullet') {
      _c.copy(s.v).normalize();
      const len = Math.min(s.len, s.age * s.speed);
      fx.streak(_a.set(s.x - _c.x * len, s.y - _c.y * len, s.z - _c.z * len), _b.set(s.x, s.y, s.z), s.w, s.color);
    } else if (s.kind === 'missile') {
      _c.copy(s.v).normalize();
      fx.streak(_a.set(s.x - _c.x * 1.2, s.y - _c.y * 1.2, s.z - _c.z * 1.2), _b.set(s.x, s.y, s.z), 0.35, 0xfff0d0);
    }
  }
}

// ------------------------------------------------------------------ weapon firing (player + boss share this)
// owner: Mech; team 'P'|'E'; held: trigger; aim: world point; target: entity or null; locks: entities for missiles
export function weaponTick(dt, owner, slot, ws, held, aim, target, team, locks, dmgMul = 1) {
  const d = ws.d, fx = G.fx, mslot = owner.slots[slot];
  G.curSrc = owner.pos;
  const isP = team === 'P', me = isP && owner === G.player;
  const dist = G.player ? G.player.pos.distanceTo(owner.pos) : 0;
  ws.cd = Math.max(0, ws.cd - dt);
  if (ws.reloadT > 0) {
    ws.reloadT -= dt;
    if (ws.reloadT <= 0) { ws.ammo = d.mag; if (me) sfx('reload'); }
  }
  const pressed = held && !ws.wasHeld, released = !held && ws.wasHeld;
  ws.wasHeld = held;
  const enemyTeam = isP ? 'P' : 'E';
  const startReload = () => { if (d.mag && ws.reloadT <= 0) ws.reloadT = d.reload; };

  if (d.type === 'bullet') {
    if (d.spinUp) {
      ws.spin = Math.max(0, Math.min(1, ws.spin + (held && ws.reloadT <= 0 ? dt / d.spinUp : -dt / 0.8)));
      mslot.spinV = ws.spin * 32;
      if (pressed && me) sfx('spin');
    }
    if (held && ws.reloadT <= 0 && (!d.spinUp || ws.spin >= 1)) {
      while (ws.cd <= 0 && ws.ammo > 0) {
        ws.cd += d.rate; ws.ammo--;
        const mp = owner.muzzlePos(slot, _a);
        const n = d.pellets || 1;
        if (d.grenade) {
          const hx = aim.x - mp.x, hz = aim.z - mp.z, h = Math.max(1, Math.hypot(hx, hz)), dy = aim.y - mp.y, v = d.speed, g = d.grav;
          const disc = v ** 4 - g * (g * h * h + 2 * dy * v * v);
          const th = disc > 0 ? Math.atan((v * v - Math.sqrt(disc)) / (g * h)) : Math.PI / 4;
          _d.set(hx / h * Math.cos(th), Math.sin(th), hz / h * Math.cos(th));
          _d.x += (Math.random() - 0.5) * d.spread; _d.z += (Math.random() - 0.5) * d.spread;
          spawnShot({ p: mp, v: _d.clone().normalize().multiplyScalar(v), dmg: d.dmg * dmgMul, team, kind: 'grenade', splash: d.splash, grav: g, life: 5, color: d.color });
          fx.muzzle(mp, _d, 0xffb060, 1.5); mslot.recoil = Math.min(0.6, (mslot.recoil || 0) + d.recoil);
          if (me) { G.stats.shots++; fx.trauma = Math.min(1, fx.trauma + 0.08); }
          sfx(d.sfx, dist); continue;
        }
        for (let k = 0; k < n; k++) {
          _d.subVectors(aim, mp).normalize();
          const spr = n > 1 ? d.spread * (isP ? 1 : 1.3) : d.spread * (isP ? 2 : 6);
          _d.x += (Math.random() - 0.5) * spr; _d.y += (Math.random() - 0.5) * spr; _d.z += (Math.random() - 0.5) * spr;
          _d.normalize();
          spawnShot({ p: mp, v: _d.clone().multiplyScalar(d.speed * (n > 1 ? 0.9 + Math.random() * 0.2 : 1)), dmg: d.dmg * dmgMul, team, kind: isP ? 'bullet' : 'ebullet', color: isP ? d.color : 0xff6a40, w: d.w, len: d.len, life: d.life || 1.6, chill: isP && team === 'P' ? d.chill : 0 });
        }
        if (n > 1 && me) fx.trauma = Math.min(1, fx.trauma + 0.12);
        fx.muzzle(mp, _d, d.chill ? 0x9fe8ff : isP ? 0xffd27a : 0xff8a50, n > 1 ? 1.9 : d.spinUp ? 0.9 : 1.1);
        mslot.recoil = Math.min(0.5, (mslot.recoil || 0) + d.recoil);
        if (me) G.stats.shots += n;
        if (Math.random() < 0.6 || !d.spinUp) sfx(d.sfx, dist);
      }
      if (ws.ammo <= 0) startReload();
    }
    if (!held && ws.cd < 0) ws.cd = 0;
  } else if (d.type === 'chain') {
    if (held && ws.cd <= 0 && ws.reloadT <= 0 && ws.ammo > 0) {
      ws.cd = d.rate; ws.ammo--;
      const mp = owner.muzzlePos(slot, _a).clone();
      const ents = entsFor(enemyTeam).filter((e) => !e.isBarrel || isP);
      // primary: lock target if close to the aim line, else whatever the aim ray hits
      let prim = null;
      if (target && target.alive && target.c.distanceTo(mp) < d.range) prim = target;
      if (!prim) { _d.subVectors(aim, mp).normalize(); const h = rayEnts(mp, _d, d.range, ents); if (h) prim = h.ent; }
      let from = mp, end;
      const hit = new Set();
      if (prim && clearLine(mp, prim.c)) {
        let cur = prim;
        for (let k = 0; k < d.chains && cur; k++) {
          hit.add(cur);
          fx.lightning(from, cur.c, 0x9ff6ff, k === 0 ? 0.4 : 0.3);
          dealDamage(cur, d.dmg * dmgMul * (k === 0 ? 1 : 0.7), team, cur.c);
          fx.sparks(cur.c, null, 10, 0x9ff6ff, 16, 1, 0.3, 0.3);
          fx.flash(cur.c, 0x6fe8ff, 10, 14, 0.12);
          from = cur.c;
          let nx = null, nd = d.chainR;
          for (const e of ents) { if (hit.has(e)) continue; const dd = e.c.distanceTo(from); if (dd < nd) { nd = dd; nx = e; } }
          cur = nx;
        }
      } else {
        _d.subVectors(aim, mp); const L = Math.min(d.range, _d.length()); _d.normalize();
        end = mp.clone().addScaledVector(_d, L);
        fx.lightning(mp, end, 0x9ff6ff, 0.35);
        fx.sparks(end, null, 6, 0x9ff6ff, 10, 1, 0.25, 0.25);
      }
      fx.muzzle(mp, _d.subVectors(aim, mp).normalize(), 0x9ff6ff, 1.0);
      mslot.recoil = Math.min(0.6, (mslot.recoil || 0) + d.recoil);
      if (me) G.stats.shots++;
      sfx('coil', dist);
      if (ws.ammo <= 0) startReload();
    }
  } else if (d.type === 'charge') {
    if (held && ws.cd <= 0 && ws.reloadT <= 0 && ws.ammo > 0) {
      if (ws.chargeT === 0 && me) sfx('charge');
      ws.chargeT = Math.min(d.charge, ws.chargeT + dt);
      const mp = owner.muzzlePos(slot, _a), k = ws.chargeT / d.charge;
      fx.emit('add', { x: mp.x, y: mp.y, z: mp.z, life: 0.05, s0: 0.6 + k * 2.4, c0: 0xc890ff });
      if (Math.random() < 0.6) {
        const a = Math.random() * 6.28, r = 1.5 * (1 - k * 0.5);
        fx.emit('add', { x: mp.x + Math.cos(a) * r, y: mp.y + Math.sin(a) * r, z: mp.z, vx: -Math.cos(a) * r * 4, vy: -Math.sin(a) * r * 4, vz: 0, life: 0.25, s0: 0.3, s1: 0.1, c0: 0xd0a0ff });
      }
    }
    if ((released || (!isP && ws.chargeT >= d.charge)) && ws.chargeT > 0.12) {
      const k = ws.chargeT / d.charge;
      ws.chargeT = 0; ws.cd = d.rate; ws.ammo--;
      const mp = owner.muzzlePos(slot, _a).clone();
      _d.subVectors(aim, mp).normalize();
      const w = raySolids(mp, _d, 400);
      const end = mp.clone().addScaledVector(_d, w.t);
      const hits = rayEnts(mp, _d, w.t, entsFor(enemyTeam), true);
      const dmg = (d.dmg[0] + (d.dmg[1] - d.dmg[0]) * k * k) * dmgMul;
      for (const h of hits) { dealDamage(h.ent, dmg, team, h.ent.c); fx.sparks(h.ent.c, null, 16, 0xd0a0ff, 22, 1, 0.4, 0.35); }
      const wd = 0.4 + k * 1.1;
      fx.streak(mp, end, wd * 2.6, 0x6a2cff, 0.35);
      fx.streak(mp, end, wd, 0xf0e0ff, 0.25);
      fx.ring(mp, _d, 0.3, 2 + k * 3, 0.3, 0xc890ff);
      fx.sparks(end, null, 20, 0xd0a0ff, 18, 1, 0.5, 0.35);
      fx.flash(mp, 0xb070ff, 30 * k + 6, 20, 0.2); fx.flash(end, 0xb070ff, 30 * k + 6, 20, 0.25);
      if (w.solid && w.solid !== 'floor' && w.solid.kind === 'barrel') hitBarrel(w.solid.ref, dmg);
      if (w.solid === 'floor' || (w.solid && end.y < 1)) fx.decal(end, 1.5 + k * 1.5);
      mslot.recoil = 0.6 + k * 0.6;
      if (me) { G.stats.shots++; fx.trauma = Math.min(1, fx.trauma + 0.15 + k * 0.25); }
      sfx('rail', dist);
      if (ws.ammo <= 0) startReload();
    }
    if (!held && ws.chargeT > 0 && ws.chargeT <= 0.12) ws.chargeT = 0;
  } else if (d.type === 'blade') {
    if (ws.windT > 0) { ws.windT -= dt; if (ws.windT <= 0) bladeLunge(owner, slot, ws, team, dmgMul); }
    else if (held && ws.cd <= 0 && owner.en >= d.cost * 0.5) {
      ws.cd = d.cd; owner.en = Math.max(0, owner.en - d.cost); owner.drainT = 0;
      const c = owner.center(_b);
      ws.tgt = target && target.alive && !target.isBarrel && !target.dying && target.c.distanceTo(c) < d.lunge && clearLine(c, target.c) ? target : null;
      if (isP) bladeLunge(owner, slot, ws, team, dmgMul);
      else {   // enemies telegraph the slash
        ws.windT = 0.45; mslot.bladeOn = 0.6; sfx('charge', dist);
        fx.flash(owner.center(_c), 0xff3020, 30, 18, 0.45);
        fx.ring(owner.pos, null, 6, 1.5, 0.45, 0xff4020);
      }
    }
  } else if (d.type === 'flame') {
    if (held && ws.reloadT <= 0 && ws.ammo > 0) {
      while (ws.cd <= 0 && ws.ammo > 0) {
        ws.cd += d.rate; ws.ammo--;
        const mp = owner.muzzlePos(slot, _a);
        _d.subVectors(aim, mp).normalize();
        _d.x += (Math.random() - 0.5) * d.spread * 2; _d.y += (Math.random() - 0.5) * d.spread * 1.4; _d.z += (Math.random() - 0.5) * d.spread * 2; _d.normalize();
        const v = _d.clone().multiplyScalar(d.speed).addScaledVector(owner.vel, 0.6);
        spawnShot({ p: mp, v, dmg: d.dmg * dmgMul, team, kind: 'flame', life: d.life * (0.85 + Math.random() * 0.3), burn: d.burn * dmgMul, burnT: d.burnT });
        if (me) G.stats.shots++;
      }
      ws.sndT -= dt; if (ws.sndT <= 0) { ws.sndT = 0.11; sfx('flame', dist); }
      mslot.recoil = Math.min(0.12, (mslot.recoil || 0) + dt * 0.6);
      if (ws.ammo <= 0) startReload();
    } else if (pressed && ws.ammo <= 0) startReload();
    if (!held && ws.cd < 0) ws.cd = 0;
  } else if (d.type === 'pile') {
    if (held && ws.cd <= 0 && owner.en >= d.cost * 0.5) {
      ws.cd = d.cd; owner.en = Math.max(0, owner.en - d.cost); owner.drainT = 0;
      const c = owner.center(_b);
      ws.tgt = target && target.alive && !target.isBarrel && !target.dying && target.c.distanceTo(c) < d.lunge && clearLine(c, target.c) ? target : null;
      pileLunge(owner, slot, ws, team, dmgMul);
    }
  } else if (d.type === 'missile') {
    if (pressed && ws.cd <= 0) {
      ws.cd = d.cd;
      const tg = locks && locks.length ? locks : (target ? [target] : []);
      for (let i = 0; i < d.count; i++) G.queue.push({ label: G.curLabel, t: i * 0.07, fn: () => {
        if (!owner.alive) return;
        const k = i % 2; const mp = owner.muzzlePos(slot, _a, k).clone();
        const fwd = new V3(-Math.sin(owner.aimYaw), 0, -Math.cos(owner.aimYaw));
        const v = fwd.multiplyScalar(26).add(new V3((Math.random() - 0.5) * 10, 14 + Math.random() * 6, (Math.random() - 0.5) * 10));
        spawnShot({ p: mp, v, dmg: d.dmg * dmgMul, team, kind: 'missile', splash: d.splash, target: tg.length ? tg[i % tg.length] : null, aim, life: isP ? 4 : 6, maxSpeed: isP ? 95 : 62, turn: isP ? 5.5 : 1.9 });
        fx.muzzle(mp, v.clone().normalize(), 0xffc070, 0.8);
        owner.slots.S.recoil = 0.4;
        sfx('missile', dist);
      } });
      if (me) G.stats.shots += d.count;
    }
  } else if (d.type === 'plasma') {
    if (pressed && ws.cd <= 0) {
      ws.cd = d.cd;
      for (let k = 0; k < 2; k++) G.queue.push({ label: G.curLabel, t: k * 0.18, fn: () => {
        if (!owner.alive) return;
        const mp = owner.muzzlePos(slot, _a, k).clone();
        _d.subVectors(aim, mp).normalize();
        spawnShot({ p: mp, v: _d.clone().multiplyScalar(d.speed), dmg: d.dmg * dmgMul * 0.5, team, kind: 'plasma', splash: d.splash, life: 3, size: 1 });
        fx.muzzle(mp, _d, 0xffa040, 2.2);
        fx.ring(mp, _d, 0.3, 2.5, 0.25, 0xffa040);
        owner.slots.S.recoil = 1;
        if (owner === G.player) { fx.trauma = Math.min(1, fx.trauma + 0.2); owner.vel.addScaledVector(_d, -4); }
        sfx('cannon', dist);
      } });
      if (me) G.stats.shots += 2;
    }
  } else if (d.type === 'drones') {
    if (pressed && ws.cd <= 0) {
      ws.cd = d.cd;
      for (let k = 0; k < d.count; k++) spawnMini(owner, slot, k, d, dmgMul, team);
      sfx('drone', dist); if (me) G.stats.shots++;
    }
    const out = G.minis.some((m) => m.owner === owner);
    for (const m of mslot.models) { const dk = m._dock || (m._dock = find(m, 'D_Dock')); if (dk) dk.visible = !out; }
  } else if (d.type === 'decoy') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; new Decoy(owner, slot, d, dmgMul); sfx('decoy', dist); if (me) G.stats.shots++; }
  } else if (d.type === 'grav') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; launchWell(owner, slot, d, dmgMul, aim); sfx('cannon', dist); if (me) G.stats.shots++; }
  } else if (d.type === 'orbital') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; launchStrike(owner, slot, d, dmgMul, aim, target); if (me) G.stats.shots++; }
  } else if (d.type === 'emp') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; empPulse(owner, d, dmgMul); if (me) G.stats.shots++; }
  } else if (d.type === 'shield') {
    if (pressed && ws.cd <= 0) { ws.cd = d.cd; ws.beamT = d.dur; sfx('shield', dist); if (me) G.stats.shots++; }
    if (ws.beamT > 0) ws.beamT = Math.max(0, ws.beamT - dt);
    shieldVisual(owner, ws.beamT > 0 ? Math.min(1, ws.beamT * 4) : 0, dt);
    owner.shieldT = ws.beamT; owner.shieldD = d;
  } else if (d.type === 'beam') {
    if (pressed && ws.cd <= 0) { ws.cd = d.cd; ws.beamT = d.dur; if (me) G.stats.shots++; }
    if (ws.beamT > 0) {
      ws.beamT -= dt;
      for (let k = 0; k < 2; k++) {
        const mp = owner.muzzlePos(slot, _a, k).clone();
        _d.subVectors(aim, mp).normalize();
        const w = raySolids(mp, _d, d.range);
        const h = rayEnts(mp, _d, w.t, entsFor(enemyTeam));
        const L = h ? h.t : w.t;
        const end = mp.clone().addScaledVector(_d, L);
        const fl = 0.85 + Math.random() * 0.3;
        fx.streak(mp, end, 1.3 * fl, 0xb02aa0);
        fx.streak(mp, end, 0.45 * fl, 0xffd8f8);
        fx.emit('add', { x: mp.x, y: mp.y, z: mp.z, life: 0.05, s0: 1.8, c0: 0xff70e0 });
        fx.emit('add', { x: end.x, y: end.y, z: end.z, life: 0.06, s0: 2.6 * fl, c0: 0xff90f0 });
        if (Math.random() < 0.5) fx.sparks(end, _d.clone().multiplyScalar(-1), 2, 0xff90f0, 14, 0.9, 0.3, 0.25);
        if (h) dealDamage(h.ent, d.dps * dmgMul * dt * 0.5, team, end);
        else if (w.solid && w.solid !== 'floor' && w.solid.kind === 'barrel') hitBarrel(w.solid.ref, d.dps * dt);
        if (k === 0 && (w.solid === 'floor') && Math.random() < 0.1) fx.decal(end, 1.2);
        if (k === 0) fx.flash(end, 0xff60e0, 8, 12, 0.08);
      }
      ws.sndT -= dt; if (ws.sndT <= 0) { ws.sndT = 0.11; sfx('laser', dist); }
    }
  }
}

// ------------------------------------------------------------------ EP-5 EMP: damage + stun everything nearby, wipe incoming shots and mines
function empPulse(owner, d, dmgMul) {
  const fx = G.fx, c = owner.center(new V3()), R = d.radius;
  fx.ring(new V3(owner.pos.x, owner.pos.y + 0.4, owner.pos.z), null, 1, R, 0.5, 0x78c8ff);
  fx.ring(c, null, 1, R * 0.7, 0.3, 0x6fb8e8);
  fx.flash(c, 0x78c8ff, 30, R * 1.4, 0.18);
  for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283; fx.sparks(new V3(c.x + Math.cos(a) * R * 0.6, c.y, c.z + Math.sin(a) * R * 0.6), { x: Math.cos(a), y: 0.2, z: Math.sin(a) }, 2, 0x9fe0ff, 14, 0.9, 0.35, 0.2); }
  G.fx.trauma = Math.min(1, G.fx.trauma + 0.3);
  sfx('emp', 0);
  let n = 0;
  const prev = G.curLabel; G.curLabel = 'p-emp';
  for (const e of entsFor('P')) {
    if (e.isBarrel || e.isPlayer) continue;
    const dist = e.c.distanceTo(c) - (e.r || 1) * 0.6;
    if (dist > R) continue;
    if (e.isMine) { e.alive = false; e.obj.parent && e.obj.parent.remove(e.obj); fx.sparks(e.c, null, 6, 0x9fe0ff, 8, 1, 0.4, 0.2); continue; }
    dealDamage(e, d.dmg * dmgMul, 'P', e.c, 'p-emp');
    const host = e.kind === 'cpart' ? e.owner : e;   // colossus parts stun the whole colossus
    if (!host.alive || host.dying || host.kind === 'relay') continue;
    const big = host.kind === 'boss' || host.kind === 'raider';
    host.stunT = Math.max(host.stunT || 0, big ? d.bossStun : d.stun); host.stunMax = host.stunT; n++;
  }
  G.curLabel = prev;
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const sh = G.shots[i];
    if (sh.team !== 'E' || Math.hypot(sh.x - c.x, sh.y - c.y, sh.z - c.z) > R + 4) continue;
    fx.emit('add', { x: sh.x, y: sh.y, z: sh.z, life: 0.2, s0: 1.6, c0: 0x9fe0ff });
    G.shots.splice(i, 1);
  }
  G.empHits = (G.empHits || 0) + n;
}

// ------------------------------------------------------------------ HD-1 holo decoy: a hologram of the mech that enemies prefer as a target
const holoMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3ab4ec).multiplyScalar(0.75), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const holoWire = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff0ff).multiplyScalar(1.3), wireframe: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
export class Decoy {
  constructor(owner, slot, d, dmgMul) {
    this.isDecoyObj = true; this.d = d; this.dmgMul = dmgMul; this.t = d.dur; this.maxHp = d.hp; this.hp = d.hp; this.alive = true;
    this.foeW = 0.55; this.foeWAir = 0.6; this.foeWBoss = 0.95;   // enemies weigh its distance at ~half the player's; bosses barely fall for it
    this.vel = new V3();
    const a = owner.aimYaw, side = owner.slots[slot] && owner.slots[slot].side === 'L' ? -1 : 1;
    const p = new V3(owner.pos.x - Math.sin(a) * 9 + Math.cos(a) * 5 * side, 0, owner.pos.z - Math.cos(a) * 9 - Math.sin(a) * 5 * side);
    if (pointInSolid(new V3(p.x, 1, p.z), 2.5)) p.set(owner.pos.x, 0, owner.pos.z);
    p.y = groundAt(p.x, p.z, owner.pos.y + 2);
    this.pos = p;
    this.obj = cloneKit('Mech'); this.obj.scale.setScalar(owner.scale); this.obj.position.copy(p); this.obj.rotation.y = a;
    const ms = []; this.obj.traverse((m) => { if (m.isMesh) ms.push(m); });
    for (const m of ms) { m.material = holoMat; m.castShadow = false; m.receiveShadow = false; m.add(new THREE.Mesh(m.geometry, holoWire)); }
    this.n = nodes(this.obj); this.ph = Math.random() * 6; this.sc = owner.scale;
    G.scene.add(this.obj);
    this._ent = { isAlly: true, isDecoy: true, c: new V3(), r: 2.2 * owner.scale, get alive() { return this.w.alive; }, w: this, hit: (dmg) => this.damage(dmg) };
    G.friends.push(this); G.decoys = (G.decoys || 0) + 1;
    const src = owner.muzzlePos(slot, new V3(), 0).clone();
    G.fx.streak(src, this.center(new V3()), 0.6, 0x58d8ff);
    G.fx.ring(new V3(p.x, p.y + 0.3, p.z), null, 1, 6, 0.4, 0x58d8ff);
    for (const e of G.enemies) if (e.foe === G.player && e.c && e.c.distanceTo(p) < 120) e.tgT = 0;   // nearby enemies re-pick right away
  }
  center(out) { return out.set(this.pos.x, this.pos.y + 2.6 * this.sc, this.pos.z); }
  damage(dmg) {
    if (!this.alive) return;
    this.hp -= dmg * G.diff.dmg; this.flash = 0.1;
    G.decoyDmg = (G.decoyDmg || 0) + dmg * G.diff.dmg;
    if (this.hp <= 0) this.end(true);
  }
  end(broken) {
    if (!this.alive) return;
    this.alive = false;
    const c = this.center(new V3());
    G.fx.sparks(c, null, 18, 0x9fe8ff, 14, 1.2, 0.5, 0.25); G.fx.ring(new V3(this.pos.x, this.pos.y + 0.3, this.pos.z), null, 1, broken ? this.d.burstR : 5, 0.35, 0x58d8ff);
    if (broken) {   // shattered: an EMP-like shock hits everything close by
      G.fx.flash(c, 0x78c8ff, 24, 18, 0.15); sfx('emp', G.player.pos.distanceTo(c));
      const prev = G.curLabel; G.curLabel = 'p-decoy';
      for (const e of entsFor('P')) {
        if (e.isBarrel || e.isMine) continue;
        if (e.c.distanceTo(c) - (e.r || 1) * 0.6 > this.d.burstR) continue;
        dealDamage(e, this.d.burst * this.dmgMul, 'P', e.c, 'p-decoy');
        const host = e.kind === 'cpart' ? e.owner : e;
        if (host.alive && !host.dying && host.kind !== 'relay') { const big = host.kind === 'boss' || host.kind === 'raider'; host.stunT = Math.max(host.stunT || 0, big ? 0.4 : 1.2); host.stunMax = host.stunT; }
      }
      G.curLabel = prev;
    }
    this.obj.parent && this.obj.parent.remove(this.obj);
    const i = G.friends.indexOf(this); if (i >= 0) G.friends.splice(i, 1);
    for (const e of G.enemies) if (e.foe === this) e.tgT = 0;
  }
  update(dt) {
    this.t -= dt; this.ph += dt;
    if (this.t <= 0) { this.end(false); return; }
    const fl = (Math.random() < 0.06 ? 0.3 : 1) * (this.t < 1.5 ? 0.5 + 0.5 * Math.sin(this.ph * 30) : 1);
    holoMat.opacity = (0.26 + 0.06 * Math.sin(this.ph * 9)) * fl + (this.flash > 0 ? 0.3 : 0);
    this.flash = Math.max(0, (this.flash || 0) - dt);
    this.obj.position.y = this.pos.y + Math.sin(this.ph * 2) * 0.08;
    if (Math.random() < 0.25) G.fx.emit('add', { x: this.pos.x + (Math.random() - 0.5) * 3, y: this.pos.y + Math.random() * 5 * this.sc, z: this.pos.z + (Math.random() - 0.5) * 3, vy: 1.5, life: 0.4, s0: 0.5, c0: 0x58d8ff });
  }
}

// ------------------------------------------------------------------ GW-1 gravity well: a slow singularity that opens where it lands,
// drags enemies (and their shots) in for a few seconds, then collapses in a blast
G.wells = [];
const wellCore = new THREE.MeshBasicMaterial({ color: 0x050308 });
const wellGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a6cff).multiplyScalar(1.6), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const PULL_RES = { boss: 0.15, raider: 0.3, bulwark: 0.45, howitzer: 0.45, walker: 0.75, warden: 0.6 };
const NO_PULL = new Set(['turret', 'relay', 'dropship']);
function launchWell(owner, slot, d, dmgMul, aim) {
  const mp = owner.muzzlePos(slot, new V3(), 0).clone();
  _d.subVectors(aim, mp); let L = Math.min(d.range, _d.length()); _d.normalize();
  const w = raySolids(mp, _d, L); if (w.t < L) L = Math.max(2, w.t - 1.5);
  const end = mp.clone().addScaledVector(_d, L);
  const o = new THREE.Group();
  o.add(new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10), wellCore));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.45, 16, 10), wellGlow.clone()); o.add(halo);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.12, 6, 48), wellGlow.clone()); ring.rotation.x = Math.PI / 2; o.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 6, 48), wellGlow.clone()); ring2.rotation.x = 1.0; o.add(ring2);
  const area = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14), wellGlow.clone()); area.material.opacity = 0; area.visible = false; G.scene.add(area);
  o.position.copy(mp); G.scene.add(o);
  G.wells.push({ o, halo, ring, ring2, area, from: mp, end, fly: L / d.speed, flyT: 0, t: d.dur, d, dmgMul, open: false, owner });
}
function updateWells(dt) {
  const fx = G.fx;
  for (let i = G.wells.length - 1; i >= 0; i--) {
    const w = G.wells[i], d = w.d, P = w.o.position;
    if (!w.open) {
      w.flyT += dt; P.lerpVectors(w.from, w.end, Math.min(1, w.flyT / w.fly));
      fx.emit('add', { x: P.x, y: P.y, z: P.z, life: 0.2, s0: 1.6, s1: 0.3, c0: 0x8a6cff });
      if (w.flyT >= w.fly) { w.open = true; w.age = 0; sfx('grav', G.player.pos.distanceTo(P)); fx.flash(P, 0x8a6cff, 20, 24, 0.2); G.wellsOpened = (G.wellsOpened || 0) + 1; }
      continue;
    }
    w.age += dt; w.t -= dt;
    const grow = Math.min(1, w.age * 3), s = 1 + Math.sin(w.age * 20) * 0.08;
    w.o.scale.setScalar(grow * 1.9 * s); w.ring.rotation.z += dt * 6; w.ring.scale.setScalar(1 + 0.15 * Math.sin(w.age * 9));
    w.halo.material.opacity = 0.35 + 0.15 * Math.sin(w.age * 13); w.ring2.rotation.y += dt * 4;
    w.area.visible = true; w.area.position.copy(P); w.area.scale.setScalar(d.R * 0.7 * grow * (1 - 0.06 * Math.sin(w.age * 6))); w.area.material.opacity = (0.045 + 0.02 * Math.sin(w.age * 11)) * Math.min(1, w.t * 2);
    for (let k = 0; k < 3; k++) {   // dust streaming inward
      const a = Math.random() * 6.283, r = d.R * (0.6 + Math.random() * 0.4), h = (Math.random() - 0.3) * 6;
      fx.emit('add', { x: P.x + Math.cos(a) * r, y: P.y + h, z: P.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.4, vy: -h * 1.4, vz: -Math.sin(a) * r * 1.4, life: 0.6, s0: 0.5, s1: 0.15, c0: 0xb8a0ff, drag: 0 });
    }
    const prev = G.curLabel; G.curLabel = 'p-grav';
    for (const e of G.enemies) {
      if (!e.alive || e.dying || NO_PULL.has(e.kind) || e.isColossus || e.isTrain) continue;
      const dx = P.x - e.pos.x, dz = P.z - e.pos.z, dist = Math.hypot(dx, dz, (P.y - e.c.y) * 0.5);
      if (dist > d.R || dist < 1.5) continue;
      const k = (PULL_RES[e.kind] ?? 1) * d.pull * (1 - dist / d.R * 0.45);
      const m = Math.min(dist - 1.5, k * dt), hd = Math.hypot(dx, dz) || 1;
      _a.set(e.pos.x + dx / hd * m, e.pos.y, e.pos.z + dz / hd * m);
      if (!pointInSolid(_a.clone().setY(e.pos.y + 1.5), (e.r || 2) * 0.6)) { e.pos.x = _a.x; e.pos.z = _a.z; }
      if (e.kind === 'drone' || e.kind === 'gunship' || e.kind === 'sapper' || e.kind === 'jammer' || e.kind === 'mender' || e.kind === 'stalker') e.pos.y += (P.y - e.pos.y) * Math.min(1, dt * (PULL_RES[e.kind] ?? 1) * 1.5);
      if (e.vel) e.vel.multiplyScalar(1 - Math.min(1, dt * 3));
    }
    for (const e of entsFor('P')) {
      if (e.isBarrel || e.isMine) continue;
      if (e.c.distanceTo(P) - (e.r || 1) * 0.6 < d.R * 0.7) dealDamage(e, d.dps * w.dmgMul * dt, 'P', e.c, 'p-grav');
    }
    G.curLabel = prev;
    for (let j = G.shots.length - 1; j >= 0; j--) {   // swallows enemy shots that pass close
      const sh = G.shots[j];
      if (sh.team === 'E' && Math.hypot(sh.x - P.x, sh.y - P.y, sh.z - P.z) < 7) { fx.emit('add', { x: sh.x, y: sh.y, z: sh.z, life: 0.2, s0: 1.4, c0: 0xb8a0ff }); G.shots.splice(j, 1); }
    }
    if (w.t <= 0) {
      G.curLabel = 'p-grav';
      explodeAt(P.clone(), d.burstR, d.burst * w.dmgMul, 'P', 1.6, 0x9a7cff);
      fx.ring(P.clone(), null, 1, d.burstR * 1.4, 0.45, 0xb8a0ff);
      G.curLabel = prev;
      w.o.parent && w.o.parent.remove(w.o); w.area.parent && w.area.parent.remove(w.area); G.wells.splice(i, 1);
    }
  }
}
// orbital strike: mark a point (leading a locked target by the delay), a thin designator beam flickers from the sky,
// then a wide column slams down: heavy splash to everything under it (air included) and a short burning patch on the ground
G.strikes = [];
const strikeMat = (c, op) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const strikeGeo = { col: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), ring: new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), disc: new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2) };
function launchStrike(owner, slot, d, dmgMul, aim, target) {
  const P = new V3();
  const host = target && (target.kind === 'cpart' ? target : target);
  if (host && host.c) {
    const v = host.vel || (host.owner && host.owner.vel) || null;
    P.copy(host.c); if (v) P.addScaledVector(v, d.delay);
  } else P.copy(aim);
  _d.set(P.x - owner.pos.x, 0, P.z - owner.pos.z); const L = _d.length();
  if (L > d.range) P.set(owner.pos.x + _d.x / L * d.range, P.y, owner.pos.z + _d.z / L * d.range);
  P.x = Math.max(-ARENA + 2, Math.min(ARENA - 2, P.x)); P.z = Math.max(-ARENA + 2, Math.min(ARENA - 2, P.z));
  P.y = groundAt(P.x, P.z, 200);
  const o = new THREE.Group(); o.position.copy(P); G.scene.add(o);
  const ring = new THREE.Mesh(strikeGeo.ring, strikeMat(0x7fe8ff, 0.9)); ring.scale.setScalar(d.R); ring.position.y = 0.15;
  const disc = new THREE.Mesh(strikeGeo.disc, strikeMat(0x7fe8ff, 0.12)); disc.scale.setScalar(d.R); disc.position.y = 0.12;
  const beam = new THREE.Mesh(strikeGeo.col, strikeMat(0xaff4ff, 0.5)); beam.scale.set(0.25, 260, 0.25);
  const col = new THREE.Mesh(strikeGeo.col, strikeMat(0x8fe4ff, 0)); col.scale.set(d.R * 0.5, 260, d.R * 0.5); col.visible = false;
  o.add(ring, disc, beam, col);
  G.strikes.push({ o, ring, disc, beam, col, t: d.delay, d, mul: dmgMul, hit: false, age: 0, burn: d.burnT, tgt: host && host.c && !host.isBarrel ? host : null, from: owner.pos });
  sfx('orbital', G.player ? G.player.pos.distanceTo(P) * 0.5 : 0);
  G.fx.muzzle(owner.muzzlePos(slot, _a, 0).clone(), _b.set(0, 1, 0), 0x9fe8ff, 1.4);
}
function updateStrikes(dt) {
  const fx = G.fx;
  for (let i = G.strikes.length - 1; i >= 0; i--) {
    const S = G.strikes[i], d = S.d, P = S.o.position;
    if (!S.hit) {
      S.t -= dt; const k = 1 - Math.max(0, S.t) / d.delay;
      if (S.tgt && S.tgt.alive && S.t > 0.4) {   // the satellite keeps tracking a locked target until the last 0.4 s
        const v = S.tgt.vel || (S.tgt.owner && S.tgt.owner.vel); _a.copy(S.tgt.c); if (v) _a.addScaledVector(v, S.t);
        P.x += (_a.x - P.x) * Math.min(1, dt * 8); P.z += (_a.z - P.z) * Math.min(1, dt * 8);
        P.x = Math.max(-ARENA + 2, Math.min(ARENA - 2, P.x)); P.z = Math.max(-ARENA + 2, Math.min(ARENA - 2, P.z)); P.y = groundAt(P.x, P.z, 200);
      }
      S.ring.rotation.y += dt * 2; S.disc.material.opacity = 0.08 + 0.22 * k; S.disc.scale.setScalar(d.R * (0.25 + 0.75 * k));
      S.beam.material.opacity = (0.25 + 0.4 * k) * (0.7 + 0.3 * Math.sin(G.time * 60));
      if (Math.random() < 0.5) fx.emit('add', { x: P.x + (Math.random() - 0.5) * d.R, y: P.y + 0.3, z: P.z + (Math.random() - 0.5) * d.R, vy: 6 + 10 * k, life: 0.4, s0: 0.4, s1: 0.1, c0: 0x9fe8ff });
      if (S.t > 0) continue;
      S.hit = true; S.beam.visible = false; S.col.visible = true; S.ring.material.opacity = 0;
      const prev = G.curLabel; G.curLabel = 'p-orbital';
      for (const e of entsFor('P')) {
        const hd = Math.hypot(e.c.x - P.x, e.c.z - P.z) - (e.r || 1) * 0.5;
        if (hd < d.R) { const dm = d.dmg * S.mul * (1 - 0.45 * Math.max(0, hd) / d.R); if (!e.isBarrel && e.alive) { G.strikeDmg = (G.strikeDmg || 0) + dm; S.landed = true; } dealDamage(e, dm, 'P', e.c, 'p-orbital'); }
      }
      G.curLabel = prev;
      fx.explosion(P.clone().setY(P.y + 1), 2.4, 0x9fe8ff); fx.flash(P.clone().setY(P.y + 6), 0xaff0ff, 90, 70, 0.5);
      fx.ring(P.clone(), null, 1, d.R * 1.6, 0.5, 0x9fe8ff); fx.ring(P.clone(), null, 1, d.R * 0.9, 0.35, 0xffffff); fx.dust(P.clone(), 3, 3, 12);
      fx.decal(P, d.R * 0.8);
      const pd = G.player ? G.player.pos.distanceTo(P) : 99;
      fx.trauma = Math.min(1, (fx.trauma || 0) + Math.max(0.15, 0.6 - pd / 150));
      sfx('bigboom', pd); G.strikeHits = (G.strikeHits || 0) + 1; if (S.landed) G.strikeLanded = (G.strikeLanded || 0) + 1;
      continue;
    }
    S.age += dt; S.burn -= dt;
    const a = Math.max(0, 1 - S.age / 0.7);
    S.col.material.opacity = 0.5 * a * a; S.col.scale.set(d.R * (0.5 + 0.25 * (1 - a)) * a + 0.01, 260, d.R * (0.5 + 0.25 * (1 - a)) * a + 0.01);
    S.disc.material.color.set(0xff9040).multiplyScalar(2); S.disc.material.opacity = 0.18 * Math.min(1, S.burn * 2); S.disc.scale.setScalar(d.R * 0.75);
    if (S.burn > 0) {
      for (let k = 0; k < 2; k++) { const r = Math.random() * d.R * 0.75, an = Math.random() * 6.283; fx.emit('add', { x: P.x + Math.cos(an) * r, y: P.y + 0.3, z: P.z + Math.sin(an) * r, vy: 3 + Math.random() * 3, life: 0.5, s0: 0.9, s1: 0.2, c0: 0xffa040, c1: 0xff4010 }); }
      const prev = G.curLabel; G.curLabel = 'p-orbital';
      for (const e of entsFor('P')) {
        if (e.isBarrel || e.isMine) continue;
        if (Math.hypot(e.c.x - P.x, e.c.z - P.z) < d.R * 0.75 && e.c.y - P.y < 7) { G.strikeDmg = (G.strikeDmg || 0) + d.dps * S.mul * dt; dealDamage(e, d.dps * S.mul * dt, 'P', e.c, 'p-orbital'); }
      }
      G.curLabel = prev;
    }
    if (S.burn <= 0 && S.age > 0.7) { S.o.parent && S.o.parent.remove(S.o); G.strikes.splice(i, 1); }
  }
}
export function clearStrikes() { for (const S of G.strikes) S.o.parent && S.o.parent.remove(S.o); G.strikes.length = 0; }
export function clearWells() { for (const w of G.wells) { w.o.parent && w.o.parent.remove(w.o); w.area.parent && w.area.parent.remove(w.area); } G.wells.length = 0; }
export function updateDecoys(dt) { for (const f of G.friends.slice()) if (f instanceof Decoy) f.update(dt); }
export function clearDecoys() { for (const f of G.friends.slice()) if (f instanceof Decoy) { f.alive = false; f.obj.parent && f.obj.parent.remove(f.obj); G.friends.splice(G.friends.indexOf(f), 1); } }

// ------------------------------------------------------------------ DP-4 attack drones (shoulder weapon)
function spawnMini(owner, slot, k, d, dmgMul, team) {
  const obj = cloneKit('D_Mini');
  if (owner.paletteKey) recolor(obj, PALETTES[owner.paletteKey], owner.paletteKey);
  owner.muzzlePos(slot, obj.position, k % owner.slots[slot].muzzles.length);
  G.scene.add(obj);
  G.minis.push({ obj, n: nodes(obj), owner, t: d.dur, side: k ? -1 : 1, fireT: 0.4 + k * 0.08, team, dmg: d.dmg * dmgMul, rate: d.rate, range: d.range, tgt: null, tgtT: 0, ph: Math.random() * 6, label: owner === G.player ? 'drone-pod' : 'ally-drone' });
  G.fx.ring(obj.position, null, 0.2, 1.6, 0.25, 0x9fe8ff);
}
export function clearMinis() { for (const m of G.minis) m.obj.parent && m.obj.parent.remove(m.obj); G.minis.length = 0; }
const _md = new V3();
function updateMinis(dt) {
  for (let i = G.minis.length - 1; i >= 0; i--) {
    const m = G.minis[i], o = m.owner, P = m.obj.position;
    m.t -= dt;
    if (m.t <= 0 || !o.alive) { G.fx.sparks(P, null, 6, 0x9fe8ff, 8, 0.6, 0.25, 0.2); G.fx.ring(P, null, 0.2, 1.4, 0.2, 0x9fe8ff); m.obj.parent && m.obj.parent.remove(m.obj); G.minis.splice(i, 1); continue; }
    m.ph += dt;
    const a = G.time * 0.8 + (m.side > 0 ? 0 : Math.PI);
    _md.set(o.pos.x + Math.cos(a) * 4.6, o.pos.y + 5.2 + Math.sin(m.ph * 2.1) * 0.5, o.pos.z + Math.sin(a) * 4.6);
    P.lerp(_md, 1 - Math.exp(-3.5 * dt));
    for (let r = 1; r <= 4; r++) { const rr = m.n['D_Rotor' + r]; if (rr) rr.rotation.z += dt * 40; }
    // target: closest visible enemy in range, re-picked a few times a second
    m.tgtT -= dt;
    if (m.tgtT <= 0) {
      m.tgtT = 0.35; m.tgt = null; let bd = m.range;
      for (const e of entsFor(m.team)) {
        if (e.isBarrel || e.cloaked) continue;
        const dd = e.c.distanceTo(P); if (dd < bd && clearLine(P, e.c)) { bd = dd; m.tgt = e; }
      }
    }
    const t = m.tgt && m.tgt.alive ? m.tgt : null;
    if (t) { m.obj.rotation.y += angDiff(Math.atan2(-(t.c.x - P.x), -(t.c.z - P.z)), m.obj.rotation.y) * Math.min(1, dt * 8); }
    else m.obj.rotation.y += angDiff(o.aimYaw ?? m.obj.rotation.y, m.obj.rotation.y) * Math.min(1, dt * 3);
    m.obj.rotation.x = Math.sin(m.ph * 1.7) * 0.08;
    m.fireT -= dt;
    if (t && m.fireT <= 0) {
      m.fireT = m.rate * (0.9 + Math.random() * 0.2);
      const mp = (m.n.Muzzle_Mini ? m.n.Muzzle_Mini.getWorldPosition(_a) : _a.copy(P)).clone();
      _d.subVectors(t.c, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.02; _d.y += (Math.random() - 0.5) * 0.02; _d.z += (Math.random() - 0.5) * 0.02;
      spawnShot({ p: mp, v: _d.normalize().multiplyScalar(260), dmg: m.dmg, team: m.team, kind: m.team === 'P' ? 'bullet' : 'ebullet', color: 0x9fe8ff, w: 0.14, len: 4, life: 0.6, label: m.label });
      G.fx.muzzle(mp, _d, 0x9fe8ff, 0.5);
      if (o === G.player) G.stats.shots++;
      if (Math.random() < 0.35) sfx('dronefire', G.player ? G.player.pos.distanceTo(P) : 0);
    }
  }
}

// curved hex panel in front of the torso; fades in/out with the shield timer, flashes when it blocks
const shieldGeo = new THREE.CylinderGeometry(3.4, 3.4, 4.6, 24, 3, true, Math.PI - 0.95, 1.9);
function shieldVisual(owner, k, dt) {
  let sv = owner._shield;
  if (!sv && k <= 0) return;
  if (!sv) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5fe0ff).multiplyScalar(1.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const wire = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x58d8ff).multiplyScalar(0.9), wireframe: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    sv = owner._shield = new THREE.Group(); sv.add(new THREE.Mesh(shieldGeo, mat), new THREE.Mesh(shieldGeo, wire)); sv.mats = [mat, wire]; sv.hitT = 0;
    owner.root.add(sv);
  }
  sv.hitT = Math.max(0, sv.hitT - dt);
  sv.visible = k > 0;
  sv.position.set(0, 3.0 * owner.scale, 0); sv.rotation.y = owner.aimYaw - owner.root.rotation.y; sv.scale.setScalar(owner.scale);
  sv.mats[0].opacity = k * (0.14 + 0.05 * Math.sin(G.time * 9)) + sv.hitT * 2;
  sv.mats[1].opacity = k * 0.16 + sv.hitT * 2;
}
// shield block: fraction of damage removed when the hit comes from in front
export function shieldBlock(m, src) {
  if (!(m.shieldT > 0) || !src) return 0;
  _a.set(src.x - m.pos.x, 0, src.z - m.pos.z); const L = _a.length(); if (L < 0.5) return 0;
  const f = (-Math.sin(m.aimYaw) * _a.x - Math.cos(m.aimYaw) * _a.z) / L;
  if (f < m.shieldD.arc) return 0;
  if (m._shield) m._shield.hitT = 0.1;
  return m.shieldD.block;
}

// ------------------------------------------------------------------ blade: dash to the target, then a wide slash
function bladeLunge(owner, slot, ws, team, dmgMul) {
  const d = ws.d, mslot = owner.slots[slot], isP = team === 'P';
  const c = owner.center(new V3());
  const tgt = ws.tgt && ws.tgt.alive && !ws.tgt.dying ? ws.tgt : null;
  const dir = new V3();
  if (tgt) dir.subVectors(tgt.c, c); else dir.set(-Math.sin(owner.aimYaw), 0, -Math.cos(owner.aimYaw));
  const dist = dir.length(); dir.normalize();
  const travel = tgt ? Math.max(0, dist - 3.2 - tgt.r * 0.6) : 6;
  const T = Math.max(0.1, travel / 120);
  owner.vel.copy(dir).multiplyScalar(travel / T);
  if (owner.grounded && dir.y < 0.15) owner.vel.y = 0; else owner.grounded = false;
  owner.lungeT = T;
  ws.side = -ws.side; mslot.slashT = 0.5; mslot.slashSide = ws.side; mslot.bladeOn = 0.9;
  ws.tgt = null;
  const dist2 = G.player ? G.player.pos.distanceTo(owner.pos) : 0;
  sfx('blade', owner === G.player ? 0 : dist2);
  owner.ctx.onQuickBoost && travel > 4 && owner.ctx.onQuickBoost(owner);
  G.queue.push({ label: G.curLabel, t: T * 0.85, fn: () => {
    if (!owner.alive) return;
    const fwd = new V3(-Math.sin(owner.aimYaw), 0, -Math.cos(owner.aimYaw));
    const oc = owner.center(new V3());
    const hc = oc.clone().addScaledVector(fwd, 3.2 * owner.scale);
    if (tgt) hc.lerp(tgt.c, 0.5);
    const R = d.range * owner.scale;
    let hits = 0;
    for (const e of entsFor(team === 'P' ? 'P' : 'E')) {
      if (e.c.distanceTo(hc) > R + e.r) continue;
      G.curSrc = owner.pos; G.pierce = true;
      dealDamage(e, d.dmg * dmgMul, team, e.c.clone().lerp(oc, 0.3));
      G.pierce = false;
      G.fx.sparks(e.c, fwd, 26, 0xbff8ff, 26, 1.1, 0.45, 0.32);
      G.fx.flash(e.c, 0x80f0ff, 40, 20, 0.15);
      hits++;
    }
    // the slash arc: a fan of streaks sweeping across the front
    const up = new V3(0, 1, 0), right = new V3().crossVectors(fwd, up).normalize();
    const tilt = mslot.slashSide * 0.45;
    let prev = null;
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10 - 0.5) * 2.6;
      const p = oc.clone().addScaledVector(fwd, Math.cos(a) * R * 0.85).addScaledVector(right, Math.sin(a) * R * 0.85 * mslot.slashSide).addScaledVector(up, Math.sin(a) * tilt * R * 0.5 + 0.3);
      if (prev) { G.fx.streak(prev, p, 1.1, 0x48d8ff, 0.16); G.fx.streak(prev, p, 0.35, 0xf0ffff, 0.12); }
      prev = p;
    }
    if (hits) { sfx('bladehit', owner === G.player ? 0 : dist2); if (owner === G.player) { G.fx.trauma = Math.min(1, G.fx.trauma + 0.3); G.hitStop = 0.07; } }
  } });
}

// ------------------------------------------------------------------ pile bunker: short dash, then one heavy piercing punch with a shockwave and knockback
function pileLunge(owner, slot, ws, team, dmgMul) {
  const d = ws.d, mslot = owner.slots[slot];
  const c = owner.center(new V3());
  const tgt = ws.tgt; ws.tgt = null;
  const dir = new V3();
  if (tgt) dir.subVectors(tgt.c, c); else dir.set(-Math.sin(owner.aimYaw), 0, -Math.cos(owner.aimYaw));
  const dist = dir.length(); dir.normalize();
  const travel = tgt ? Math.max(0, dist - 2.6 - tgt.r * 0.6) : 4;
  const T = Math.max(0.08, travel / 110);
  owner.vel.copy(dir).multiplyScalar(travel / T);
  if (owner.grounded && dir.y < 0.15) owner.vel.y = 0; else owner.grounded = false;
  owner.lungeT = T;
  owner.ctx.onQuickBoost && travel > 4 && owner.ctx.onQuickBoost(owner);
  const dist2 = G.player ? G.player.pos.distanceTo(owner.pos) : 0;
  G.queue.push({ label: G.curLabel, t: T, fn: () => {
    if (!owner.alive) return;
    const oc = owner.center(new V3());
    const fwd = tgt && tgt.alive ? new V3().subVectors(tgt.c, oc).normalize() : new V3(-Math.sin(owner.aimYaw), 0, -Math.cos(owner.aimYaw));
    const tip = oc.clone().addScaledVector(fwd, 3.0 * owner.scale);
    const ents = entsFor(team === 'P' ? 'P' : 'E');
    let hit = tgt && tgt.alive && tgt.c.distanceTo(oc) < d.range + tgt.r + 2.5 ? tgt : null;
    if (!hit) { let bd = 1e9; for (const e of ents) { const dd = e.c.distanceTo(tip) - e.r; if (dd < d.range && dd < bd) { bd = dd; hit = e; } } }
    mslot.pileT = 0.34; mslot.recoil = 0.9;
    sfx('pile', owner === G.player ? 0 : dist2);
    if (!hit) { G.fx.sparks(tip, fwd, 8, 0xffd0a0, 10, 0.6, 0.3, 0.2); return; }
    const at = hit.c.clone().lerp(oc, 0.35);
    G.curSrc = owner.pos; G.pierce = true;
    dealDamage(hit, d.dmg * dmgMul, team, at);
    for (const e of ents) if (e !== hit && e.alive && e.c.distanceTo(hit.c) < 5 + e.r) dealDamage(e, d.dmg * 0.16 * dmgMul, team, e.c);
    G.pierce = false;
    const kv = !hit.parts && (hit.vel || (hit.m && hit.m.vel));
    if (kv) { const big = hit.kind === 'boss' || hit.kind === 'raider'; kv.addScaledVector(fwd, big ? 9 : 18); if (big) kv.y += 4; }
    G.fx.sparks(at, fwd, 34, 0xffe0a0, 30, 1.2, 0.5, 0.34);
    G.fx.flash(at, 0xffc080, 55, 24, 0.18);
    G.fx.ring(at, fwd, 0.6, 7, 0.32, 0xffb060);
    G.fx.streak(oc.clone().addScaledVector(fwd, 1.5), at.clone().addScaledVector(fwd, 4), 0.6, 0xfff0d0, 0.12);
    sfx('pilehit', owner === G.player ? 0 : dist2);
    if (owner === G.player) { G.fx.trauma = Math.min(1, G.fx.trauma + 0.55); G.hitStop = 0.13; }
  } });
}

// ------------------------------------------------------------------ enemies
const playerC = new V3();
// pick who to shoot: distance x weight (player 1, wingman ~1.15, core per mission); re-picked every ~1.2 s
export function pickTarget(self) {
  const cur = self.foe;
  if (cur && cur.alive && G.time < (self.tgT || 0)) return cur;
  self.tgT = G.time + 1 + Math.random() * 0.5;
  let best = G.player, bs = 1e9;
  const from = self.pos || self.c;
  for (const f of [G.player, ...G.friends]) {
    if (!f || !f.alive) continue;
    const w = f === G.player ? 1 : f.foeWBoss && (self.kind === 'boss' || self.kind === 'raider' || self.isColossus || self.isTrain) ? f.foeWBoss : (self.kind === 'drone' || self.kind === 'gunship' ? f.foeWAir ?? f.foeW : f.foeW) ?? 1.15;
    const sc = Math.hypot(f.pos.x - from.x, f.pos.z - from.z) * w;
    if (sc < bs) { bs = sc; best = f; }
  }
  self.foe = best;
  return best;
}
function lead(from, speed, out, p = G.player) {
  p.center(playerC);
  const t = from.distanceTo(playerC) / speed;
  return out.copy(playerC).addScaledVector(p.vel, t * 0.7);
}

class Enemy {
  constructor(kind, kit, pos, hp, r) {
    this.kind = kind; this.obj = cloneKit(kit); this.obj.position.copy(pos); G.scene.add(this.obj);
    this.n = nodes(this.obj); this.pos = this.obj.position; this.maxHp = hp * G.diff.hp; this.hp = this.maxHp; this.r = r;
    this.c = new V3(); this.alive = true; this.dying = false; this.flash = 0; this.losT = 0; this.los = false; this.fireT = 1 + Math.random() * 2;
    G.enemies.push(this);
  }
  hit(dmg) {
    if (!this.alive || this.dying) return;
    this.hp -= dmg; this.flash = 0.08;
    if (this.hp <= 0) this.die();
  }
  die() { this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this); this.explode(); }
  explode() { explodeAt(this.c, 5, 30, 'P', this.boom || 1); this.remove(); }
  remove() { this.obj.parent && this.obj.parent.remove(this.obj); this.gone = true; }
  tg() { return pickTarget(this); }
  checkLos(dt) {
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.3 + Math.random() * 0.2; this.los = clearLine(this.c, this.tg().center(playerC)); }
    return this.los;
  }
}

export class Turret extends Enemy {
  constructor(pos) { super('turret', 'E_Turret', pos, 240, 2.1); this.boom = 1.1; this.burst = 0; this.burstT = 0; this.c.set(pos.x, pos.y + 1.8, pos.z); }
  update(dt) {
    const p = this.tg(); const pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);   // kit fronts point down -Z
    const Y = this.n.E_TYaw; Y.rotation.y += angDiff(yaw, Y.rotation.y) * Math.min(1, dt * 2.4);
    const pitch = Math.atan2(pc.y - this.c.y, dist);
    this.n.E_TPitch.rotation.x = pitch;
    if (dist < 125 && this.checkLos(dt)) {
      this.fireT -= dt;
      if (this.fireT <= 0) { this.burst = 5; this.burstT = 0; this.fireT = 2.2 + Math.random(); }
    }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burst--; this.burstT = 0.12;
        const mp = this.n.Muzzle_Turret.getWorldPosition(_a).clone();
        const aim = lead(mp, 140, _b, this.tg());
        _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.04; _d.y += (Math.random() - 0.5) * 0.03; _d.z += (Math.random() - 0.5) * 0.04;
        spawnShot({ p: mp, v: _d.normalize().multiplyScalar(140), dmg: 12, team: 'E', kind: 'ebullet', color: 0xff6040, w: 0.32, len: 6 });
        G.fx.muzzle(mp, _d, 0xff8a50, 1.2); sfx('eshot', dist);
      }
    }
  }
}

export class Drone extends Enemy {
  constructor(pos) {
    super('drone', 'E_Drone', pos, 80, 1.6); this.boom = 0.7;
    this.vel = new V3(); this.orbit = Math.random() < 0.5 ? 1 : -1; this.alt = 8 + Math.random() * 9; this.radius = 26 + Math.random() * 16; this.ph = Math.random() * 6;
    this.fall = false;
  }
  die() {
    this.alive = false; this.dying = true; G.stats.kills++; G.onKill && G.onKill(this);
    this.fall = true; this.vel.y = 2; this.spinV = (Math.random() - 0.5) * 10;
    G.fx.explosion(this.c, 0.45); sfx('boom', G.player.pos.distanceTo(this.pos));
  }
  update(dt) {
    for (let i = 1; i <= 4; i++) this.n['E_Rotor' + i].rotation.y += dt * (this.fall ? 8 : 40);
    if (this.fall) {
      this.vel.y -= 22 * dt; this.pos.addScaledVector(this.vel, dt);
      this.obj.rotation.z += this.spinV * dt; this.obj.rotation.x += this.spinV * 0.5 * dt;
      G.fx.smoke(this.pos, 1, 1.2, 1.0, 0x3a3836, 1, 0.6);
      if (Math.random() < 0.4) G.fx.emit('add', { x: this.pos.x, y: this.pos.y, z: this.pos.z, life: 0.2, s0: 1.4, c0: 0xff8040 });
      if (this.pos.y <= groundAt(this.pos.x, this.pos.z, this.pos.y) + 0.5 || pointInSolid(this.pos)) {
        this.c.copy(this.pos); explodeAt(this.c, 5, 35, 'P', 0.9); this.remove();
      }
      return;
    }
    const p = this.tg(), pc = p.center(playerC);
    this.ph += dt;
    const ang = Math.atan2(this.pos.z - p.pos.z, this.pos.x - p.pos.x) + this.orbit * dt * 0.45;
    const tx = p.pos.x + Math.cos(ang) * this.radius, tz = p.pos.z + Math.sin(ang) * this.radius;
    const ty = Math.max(groundAt(this.pos.x, this.pos.z, 99) + 4, p.pos.y + this.alt) + Math.sin(this.ph * 1.3) * 1.5;
    _a.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
    const L = _a.length(); if (L > 0) _a.multiplyScalar(Math.min(20, L * 1.2) / L);
    this.vel.lerp(_a, 1 - Math.exp(-2 * dt));
    this.pos.addScaledVector(this.vel, dt);
    // keep out of buildings
    const s = pointInSolid(this.pos, 1.5); if (s) { this.pos.y = s.max.y + 2.5; this.vel.y = Math.max(this.vel.y, 2); }
    this.pos.x = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.x)); this.pos.z = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.z));
    this.obj.rotation.y = Math.atan2(this.pos.x - pc.x, this.pos.z - pc.z);
    this.obj.rotation.x = -this.vel.z * 0.01; this.obj.rotation.z = this.vel.x * 0.01;
    this.c.copy(this.pos);
    if (this.checkLos(dt) && this.pos.distanceTo(pc) < 90) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 1.6 + Math.random() * 0.8;
        for (let k = 0; k < 2; k++) G.queue.push({ label: G.curLabel, t: k * 0.14, fn: () => {
          if (!this.alive) return;
          const mp = this.n.Muzzle_Drone.getWorldPosition(_a).clone();
          const aim = lead(mp, 150, _b, this.tg());
          _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.05; _d.z += (Math.random() - 0.5) * 0.05;
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(150), dmg: 6, team: 'E', kind: 'ebullet', color: 0xff5040, w: 0.26, len: 5 });
          G.fx.muzzle(mp, _d, 0xff7050, 0.7); sfx('eshot', this.pos.distanceTo(G.player.pos));
        } });
      }
    }
  }
}

// capture zones: ground units with a goalP walk there first; inside goalR they fight normally
function goalDir(e, pos) {
  const g = e.goalP; if (!g) return null;
  const dx = g.x - pos.x, dz = g.z - pos.z, d = Math.hypot(dx, dz);
  return d < (e.goalR || 8) ? null : { x: dx / d, z: dz / d };
}
// ground units that bump into a building slide sideways along it for a while; if a slide made no progress, the next one goes the other way
function blockedSlide(e) {
  if (e.slideT > 0) return;
  if (e.slideFrom && e.slideFrom.distanceTo(e.pos) < 4) e.strafe *= -1;
  e.slideT = 2.5; e.stT = 3; (e.slideFrom || (e.slideFrom = new V3())).copy(e.pos);
}

export class Walker extends Enemy {
  constructor(pos) {
    super('walker', 'E_Walker', pos, 700, 2.8); this.boom = 1.4;
    this.vel = new V3(); this.ph = Math.random() * 6; this.strafe = Math.random() < 0.5 ? 1 : -1; this.stT = 3; this.yaw = 0;
  }
  update(dt) {
    const p = this.tg(), pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.blindT = this.los ? 0 : (this.blindT || 0) + dt;   // no firing line for a while: close in instead of idling behind a building
    let toward = dist > 42 || this.blindT > 4 ? 1 : dist < 26 ? -0.7 : 0;
    this.slideT = Math.max(0, (this.slideT || 0) - dt); if (this.slideT > 0) toward *= 0.15;   // blocked: slide along the wall
    this.stT -= dt; if (this.stT <= 0) { this.stT = 3 + Math.random() * 3; this.strafe *= -1; }
    let fx_ = dx / dist, fz = dz / dist;
    const gl = goalDir(this, this.pos); if (gl) { fx_ = gl.x; fz = gl.z; toward = this.slideT > 0 ? 0.15 : 1; }
    const sw = this.slideT > 0 ? 1.2 : gl ? 0.2 : 0.6;
    const tx = (fx_ * toward + -fz * this.strafe * sw) * 5.5, tz = (fz * toward + fx_ * this.strafe * sw) * 5.5;
    this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-2 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-2 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 2.8, 4)) blockedSlide(this);
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 2);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.ph += dt * (1.5 + sp * 0.9);
    const body = this.n.E_WBody;
    this.yaw += angDiff(Math.atan2(-this.vel.x, -this.vel.z) || this.yaw, this.yaw) * Math.min(1, dt * 1.5) * (sp > 0.5 ? 1 : 0);
    this.obj.rotation.y = this.yaw;
    body.position.y = 2.2 + Math.sin(this.ph * 2) * 0.08 * Math.min(1, sp / 3);
    for (let i = 1; i <= 4; i++) {
      const o = (i === 1 || i === 4) ? 0 : Math.PI, s = Math.sin(this.ph + o);
      this.n['E_Leg' + i].rotation.y = s * 0.25 * Math.min(1, sp / 3);
      this.n['E_Knee' + i].rotation.z = Math.max(0, Math.cos(this.ph + o)) * 0.25 * Math.min(1, sp / 3);
    }
    const gy = Math.atan2(-dx, -dz) - this.yaw;
    const gun = this.n.E_WGun; gun.rotation.y += angDiff(gy, gun.rotation.y) * Math.min(1, dt * 2);
    this.c.set(this.pos.x, this.pos.y + 2.4, this.pos.z);
    if (dist < 110 && this.checkLos(dt)) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 2.1 + Math.random() * 0.8;
        for (let k = 0; k < 3; k++) G.queue.push({ label: G.curLabel, t: k * 0.3, fn: () => {
          if (!this.alive) return;
          const mp = this.n.Muzzle_Walker.getWorldPosition(_a).clone();
          const aim = lead(mp, 95, _b, this.tg());
          const dd = mp.distanceTo(aim);
          _d.subVectors(aim, mp).normalize(); _d.y += dd * 0.00055 * 4.5; _d.x += (Math.random() - 0.5) * 0.03; _d.z += (Math.random() - 0.5) * 0.03;
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(95), dmg: 30, team: 'E', kind: 'shell', splash: 5.5, life: 3.5 });
          G.fx.muzzle(mp, _d, 0xff9050, 1.6); sfx('eshell', dist);
        } });
      }
    }
  }
}

// Bulwark: slow shielded tank. The shield in front of the turret blocks hits from the front (attack from the side, above or behind).
export class Bulwark extends Enemy {
  constructor(pos) {
    super('bulwark', 'E_Bulwark', pos, 900, 3.3); this.boom = 1.5;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.obj.rotation.y = this.yaw; this.stT = 2; this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.maxShp = 560 * G.diff.hp; this.shp = this.maxShp; this.down = 0; this.sflash = 0; this.fwd = new V3(0, 0, -1); this.ph0 = Math.random() * 6;
    const g = new THREE.CylinderGeometry(4.1, 4.1, 3.8, 28, 4, true, Math.PI - 1.05, 2.1);
    this.shMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3cc8ff).multiplyScalar(1.4), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    this.shWire = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff0ff).multiplyScalar(1.6), wireframe: true, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.shield = new THREE.Group(); this.shield.add(new THREE.Mesh(g, this.shMat), new THREE.Mesh(g, this.shWire));
    this.shield.position.set(0, 0.8, 0); this.n.E_BTurret.add(this.shield);
    this.c.set(pos.x, pos.y + 2, pos.z);
  }
  hit(dmg, at) {
    if (!this.alive || this.dying) return;
    if (this.down <= 0 && !G.pierce) {   // the blade cuts straight through
      const src = at && at.distanceTo(this.c) > 0.6 ? at : G.curSrc;
      if (src) {
        _a.set(src.x - this.c.x, (src.y - this.c.y) * 1.6, src.z - this.c.z).normalize();
        if (_a.dot(this.fwd) > 0.32) {   // blocked
          this.shp -= dmg; this.sflash = 0.12;
          if (Math.random() < 0.5) G.fx.sparks(_b.copy(this.c).addScaledVector(this.fwd, 4).setY(this.c.y + (Math.random() - 0.3) * 2), this.fwd, 4, 0x8ff0ff, 12, 1, 0.25, 0.25);
          if (Math.random() < 0.25) sfx('shield', G.player.pos.distanceTo(this.pos));
          if (this.shp <= 0) {
            this.down = 7; this.shield.visible = false; sfx('shieldbreak', G.player.pos.distanceTo(this.pos));
            G.fx.sparks(this.c, this.fwd, 40, 0x8ff0ff, 30, 1.2, 0.6, 0.35); G.fx.flash(this.c, 0x60e0ff, 40, 24, 0.3);
          }
          G.stats.blocked = (G.stats.blocked || 0) + dmg;
          return;
        }
      }
    }
    super.hit(dmg);
  }
  update(dt) {
    const p = this.tg(), pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz);
    // slow advance to mid range, turning the hull toward the player
    this.blindT = this.los ? 0 : (this.blindT || 0) + dt;
    let toward = dist > 55 || this.blindT > 4 ? 1 : dist < 30 ? -0.6 : 0;
    this.slideT = Math.max(0, (this.slideT || 0) - dt); if (this.slideT > 0) toward *= 0.15;
    this.stT -= dt; if (this.stT <= 0) { this.stT = 4 + Math.random() * 3; this.strafe *= -1; }
    let fx_ = dx / dist, fz = dz / dist;
    const gl = goalDir(this, this.pos); if (gl) { fx_ = gl.x; fz = gl.z; toward = this.slideT > 0 ? 0.15 : 1; }
    const sw = this.slideT > 0 ? 1.2 : gl ? 0.15 : 0.4;
    const tx = (fx_ * toward - fz * this.strafe * sw) * 3.6, tz = (fz * toward + fx_ * this.strafe * sw) * 3.6;
    this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-1.5 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-1.5 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 3.0, 3)) blockedSlide(this);
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 2.5);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.4) this.yaw += angDiff(Math.atan2(-this.vel.x, -this.vel.z), this.yaw) * Math.min(1, dt * 0.9);
    this.obj.rotation.y = this.yaw;
    const T = this.n.E_BTurret; const ty = angDiff(Math.atan2(-dx, -dz), this.yaw);
    T.rotation.y += angDiff(ty, T.rotation.y) * Math.min(1, dt * 1.6);
    this.fwd.set(-Math.sin(this.yaw + T.rotation.y), 0, -Math.cos(this.yaw + T.rotation.y));
    this.c.set(this.pos.x, this.pos.y + 2, this.pos.z);
    // shield
    if (this.down > 0) { this.down -= dt; if (this.down <= 0) { this.shp = this.maxShp; this.shield.visible = true; } }
    else this.shp = Math.min(this.maxShp, this.shp + this.maxShp * 0.05 * dt);
    this.sflash = Math.max(0, this.sflash - dt);
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 3 + this.ph0);
    this.shMat.opacity = 0.1 + pulse * 0.05 + this.sflash * 2.2;
    this.shWire.opacity = 0.18 + this.sflash * 3 + (1 - this.shp / this.maxShp) * 0.2 * pulse;
    // mortar: two lobbed shells; the landing spot is marked on the ground
    if (dist < 130 && this.checkLos(dt)) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 3.6 + Math.random() * 1.2;
        for (let k = 0; k < 2; k++) G.queue.push({ label: 'bulwark-mortar', t: k * 0.45, fn: () => {
          if (!this.alive) return;
          const mp = this.n.Muzzle_Bulwark.getWorldPosition(_a).clone();
          const f = this.tg(), D = Math.hypot(f.pos.x - mp.x, f.pos.z - mp.z), Tf = 1.5 + D / 70, g = 22;
          const aim = new V3().copy(f.pos).addScaledVector(f.vel, Tf * 0.55);
          aim.x += (Math.random() - 0.5) * 5; aim.z += (Math.random() - 0.5) * 5; aim.y = groundAt(aim.x, aim.z, aim.y + 1);
          const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
          spawnShot({ p: mp, v, dmg: 30, team: 'E', kind: 'shell', splash: 6.5, life: Tf + 1, grav: g, label: 'bulwark-mortar' });
          G.fx.warn(aim, 6.5, Tf);
          G.fx.muzzle(mp, _d.copy(v).normalize(), 0xff9050, 1.8); sfx('eshell', dist);
        } });
      }
    }
  }
}

// Gunship: heavy flyer that circles high, strafes with a chin gun and fires slow homing missile salvos (quick boost to dodge).
export class Gunship extends Enemy {
  constructor(pos) {
    super('gunship', 'E_Gunship', pos, 1400, 4.2); this.boom = 2;
    this.vel = new V3(); this.orbit = Math.random() < 0.5 ? 1 : -1; this.alt = 22 + Math.random() * 8; this.radius = 50 + Math.random() * 20;
    this.ph = Math.random() * 6; this.fall = false; this.msT = 3 + Math.random() * 2; this.gunT = 2; this.burst = 0; this.burstT = 0; this.sndT = 0;
    this.obj.scale.setScalar(1.15);
  }
  die() {
    this.alive = false; this.dying = true; G.stats.kills++; G.onKill && G.onKill(this);
    this.fall = true; this.vel.y = 1; this.spinV = (Math.random() < 0.5 ? -1 : 1) * 2.5;
    G.fx.explosion(this.c, 1.2); sfx('bigboom', G.player.pos.distanceTo(this.pos));
  }
  update(dt) {
    for (const s of ['L', 'R']) this.n['E_GRotor' + s].rotation.y += dt * (this.fall ? 6 : 26) * (s === 'L' ? 1 : -1);
    const p = this.tg(), pc = p.center(playerC);
    const dist = this.pos.distanceTo(pc);
    this.sndT -= dt; if (this.sndT <= 0) { this.sndT = 0.12; if (dist < 90 && !this.fall) sfx('rotor', dist); }
    if (this.fall) {
      this.vel.y -= 16 * dt; this.pos.addScaledVector(this.vel, dt);
      this.obj.rotation.y += this.spinV * dt; this.obj.rotation.z += 0.4 * dt;
      G.fx.smoke(this.pos, 2, 2.2, 1.4, 0x2e2c2a, 1, 0.7);
      if (Math.random() < 0.5) G.fx.emit('add', { x: this.pos.x + (Math.random() - 0.5) * 3, y: this.pos.y, z: this.pos.z + (Math.random() - 0.5) * 3, life: 0.25, s0: 2.4, c0: 0xff8040 });
      if (this.pos.y <= groundAt(this.pos.x, this.pos.z, this.pos.y) + 1 || pointInSolid(this.pos)) {
        this.c.copy(this.pos); explodeAt(this.c, 9, 60, 'P', 2.2); this.remove();
      }
      return;
    }
    this.ph += dt;
    const ang = Math.atan2(this.pos.z - p.pos.z, this.pos.x - p.pos.x) + this.orbit * dt * 0.16;
    const tx = p.pos.x + Math.cos(ang) * this.radius, tz = p.pos.z + Math.sin(ang) * this.radius;
    const ty = Math.max(groundAt(this.pos.x, this.pos.z, 99) + 8, p.pos.y + this.alt) + Math.sin(this.ph * 0.7) * 2;
    _a.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
    const L = _a.length(); if (L > 0) _a.multiplyScalar(Math.min(13, L * 0.8) / L);
    this.vel.lerp(_a, 1 - Math.exp(-1.2 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const s = pointInSolid(this.pos, 3); if (s) { this.pos.y = s.max.y + 4; this.vel.y = Math.max(this.vel.y, 3); }
    this.pos.x = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.x)); this.pos.z = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.z));
    const face = Math.atan2(this.pos.x - pc.x, this.pos.z - pc.z);
    this.obj.rotation.y += angDiff(face, this.obj.rotation.y) * Math.min(1, dt * 1.2);
    this.obj.rotation.x = -0.12; this.obj.rotation.z = this.orbit * 0.1;
    this.c.copy(this.pos);
    if (!this.checkLos(dt) || dist > 140) return;
    // missile salvo
    this.msT -= dt;
    if (this.msT <= 0) {
      this.msT = 7 + Math.random() * 2;
      if (this.tg() === G.player) G.onEnemyMissile && G.onEnemyMissile();
      for (let k = 0; k < 4; k++) G.queue.push({ label: 'gunship-missile', t: k * 0.22, fn: () => {
        if (!this.alive) return;
        const mp = this.n[k % 2 ? 'Muzzle_GunshipR' : 'Muzzle_GunshipL'].getWorldPosition(_a).clone();
        const fwd = _d.set(-Math.sin(this.obj.rotation.y), -0.2, -Math.cos(this.obj.rotation.y));
        const v = fwd.clone().multiplyScalar(22).add(new V3((Math.random() - 0.5) * 8, 6 + Math.random() * 4, (Math.random() - 0.5) * 8));
        spawnShot({ p: mp, v, dmg: 28, team: 'E', kind: 'missile', splash: 4, target: this.tg()._ent, aim: this.tg().center(new V3()), life: 6, maxSpeed: 56, turn: 1.55, label: 'gunship-missile' });
        G.fx.muzzle(mp, v.clone().normalize(), 0xff7040, 1); sfx('missile', dist);
      } });
    }
    // chin gun bursts
    this.gunT -= dt;
    if (this.gunT <= 0 && this.burst <= 0) { this.gunT = 2.6 + Math.random(); this.burst = 8; }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burst--; this.burstT = 0.08;
        const mp = this.n.Muzzle_GunshipC.getWorldPosition(_a).clone();
        const aim = lead(mp, 160, _b, this.tg());
        _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.07; _d.y += (Math.random() - 0.5) * 0.05; _d.z += (Math.random() - 0.5) * 0.07;
        spawnShot({ p: mp, v: _d.normalize().multiplyScalar(160), dmg: 5.5, team: 'E', kind: 'ebullet', color: 0xff6040, w: 0.3, len: 6, label: 'gunship-gun' });
        G.fx.muzzle(mp, _d, 0xff8a50, 1); sfx('eshot', dist);
      }
    }
  }
}

// Relay: static objective tower. Calls in drones while it stands; an EMP pulse punishes standing next to it.
export class Relay extends Enemy {
  constructor(pos) {
    super('relay', 'E_Relay', pos, 2500, 3.3); this.boom = 2.6; this.isObjective = true;
    this.c.set(pos.x, pos.y + 3.3, pos.z);
    this.solids = [addSolid(pos.x, pos.z, 6, 6, 1.4, 0, 'relay'), addSolid(pos.x, pos.z, 1.6, 1.6, 6.6, 6.8, 'relay')]   // the mast only: the core (hit sphere) must stay outside any solid or shots stop on the box;
    this.callT = 10 + Math.random() * 6; this.empT = 3; this.empArm = 0; this.ph = Math.random() * 6;
  }
  die() {
    for (const s of this.solids) removeSolid(s);
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c, 10, 40, 'P', 2.8, 0xff7040);
    G.fx.flash(this.c, 0xff8040, 60, 30, 0.5);
    for (let k = 0; k < 4; k++) G.queue.push({ label: 'relay', t: 0.25 + k * 0.3, fn: () => explodeAt(new V3(this.pos.x + (Math.random() - 0.5) * 3, 5 + k * 2.5, this.pos.z + (Math.random() - 0.5) * 3), 0, 0, 'P', 1.2) });
    this.remove();
  }
  update(dt) {
    this.ph += dt;
    this.n.E_RDish.rotation.y += dt * 0.7;
    const p = G.player, dist = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    // reinforcements
    this.callT -= dt;
    if (this.callT <= 0) {
      this.callT = 20 + Math.random() * 6;
      G.onRelayCall && G.onRelayCall(this);
    }
    // EMP pulse when the player hugs the tower: warning ring, then a burst
    if (this.empArm > 0) {
      this.empArm -= dt;
      if (this.empArm <= 0) {
        G.fx.ring(new V3(this.pos.x, 1, this.pos.z), null, 2, 16, 0.5, 0x7fd8ff); G.fx.flash(this.c, 0x60c8ff, 30, 20, 0.25);
        sfx('shieldbreak', dist);
        if (dist < 15 && p.pos.y < 14) { G.curLabel = 'relay-emp'; p._ent && p._ent.hit(22, this.c, 'relay-emp'); p.en = Math.max(0, p.en - 30); }
      }
    } else {
      this.empT -= dt;
      if (this.empT <= 0 && dist < 15) { this.empT = 5.5; this.empArm = 1.1; G.fx.warn(new V3(this.pos.x, groundAt(this.pos.x, this.pos.z, 2), this.pos.z), 15, 1.1); sfx('warn', dist); }
    }
  }
}

// Boss mechs: enemy Mech run by the same physics + weapons as the player.
export const BOSSES = {
  tyrant: { name: '暴君 TYRANT · 重装指挥机', palette: 'tyrant', frame: 'heavy', scale: 1.35, hp: 5200, want: [45, 32],
    phases: [{ R: 'gatling', L: 'rifle', S: 'cannon' }, { R: 'gatling', L: 'coil', S: 'laser' }], mul: { gatling: 0.32, rifle: 0.35, coil: 0.3, cannon: 0.6, laser: 0.45 },
    phase2: ['暴君 · 第二形态', '武装切换：光束炮 / 闪电线圈'] },
  phantom: { name: '幻影 PHANTOM · 强袭机', palette: 'phantom', frame: 'light', scale: 1.22, hp: 4300, want: [34, 20], agile: true,
    phases: [{ R: 'rail', L: 'blade', S: 'missile' }, { R: 'gatling', L: 'blade', S: 'laser' }], mul: { rail: 0.25, blade: 0.34, missile: 0.5, gatling: 0.3, laser: 0.42 },
    phase2: ['幻影 · 解除限制', '机动全开：光束炮 / 加特林'] },
};
// Raiders: squad mechs, same AI and weapons as the bosses, no phases, no boss bar
export const RAIDERS = {
  raider: { name: '掠夺者 RAIDER', palette: 'raider', frame: 'std', scale: 1.0, hp: 900, want: [36, 36], phases: [{ R: 'rifle', L: 'shotgun', S: 'missile' }], mul: { rifle: 0.1, shotgun: 0.15, missile: 0.14 } },
  lancer: { name: '枪骑兵 LANCER', palette: 'lancer', frame: 'light', scale: 0.96, hp: 700, want: [24, 24], agile: true, phases: [{ R: 'blade', L: 'gatling', S: 'cannon' }], mul: { blade: 0.13, gatling: 0.1, cannon: 0.2 } },
};
export class Boss {
  constructor(pos, ctx, type = 'tyrant', hpMul = 1) {
    const B = this.B = BOSSES[type] || RAIDERS[type];
    this.kind = 'boss'; this.type = type; this.r = 2.5 * B.scale; this.c = new V3(); this.alive = true; this.dying = false; this.flash = 0;
    this.mech = new Mech(G.scene, ctx, { palette: B.palette, frame: B.frame, scale: B.scale, isBoss: true, loadout: B.phases[0], yaw: Math.PI });
    if (RAIDERS[type]) { this.kind = 'raider'; this.r = 2.2 * B.scale; }
    this.mech.pos.copy(pos);
    this.maxHp = B.hp * G.diff.hp * hpMul; this.hp = this.maxHp; this.phase = 1;
    this.ws = { R: weaponState(B.phases[0].R), L: weaponState(B.phases[0].L), S: weaponState(B.phases[0].S) };
    this.ai = { t: 0, strafe: 1, qbT: 2, jumpT: 4, hover: 0, burst: 0, burstT: 0, sT: 3, railT: 0 };
    this.pos = this.mech.pos;
    G.enemies.push(this);
  }
  hit(dmg) {
    if (!this.alive) return;
    this.hp -= dmg; this.mech.flinch = Math.min(1, this.mech.flinch + dmg / 300);
    if (this.phase === 1 && this.B.phases.length > 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2; const L = this.B.phases[1]; this.mech.mount(L);
      for (const k of ['R', 'L', 'S']) if (this.ws[k].key !== L[k]) this.ws[k] = weaponState(L[k]);
      this.ws.S.cd = 2;
      G.onBossPhase && G.onBossPhase(this);
    }
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.dying = true; this.deathT = this.kind === 'raider' ? 0.7 : 2.2; G.stats.kills++; G.onKill && G.onKill(this); }
  }
  update(dt) {
    const m = this.mech, p = pickTarget(this), A = this.ai, B = this.B;
    this.c.set(m.pos.x, m.pos.y + 2.7 * B.scale, m.pos.z);
    if (this.dying) {
      this.deathT -= dt;
      if (Math.random() < 0.25) explodeAt(_a.set(this.c.x + (Math.random() - 0.5) * 5, this.c.y + (Math.random() - 0.5) * 5, this.c.z + (Math.random() - 0.5) * 5).clone(), 0, 0, 'P', 0.6);
      m.update(dt, { mx: 0, mz: 0, aimYaw: m.aimYaw, aimPitch: -0.4 });
      if (this.deathT <= 0) { explodeAt(this.c.clone(), this.kind === 'raider' ? 7 : 14, this.kind === 'raider' ? 40 : 0, 'P', this.kind === 'raider' ? 1.8 : 3.2); m.dispose(); this.gone = true; }
      return;
    }
    const pc = p.center(playerC);
    const dx = pc.x - m.pos.x, dz = pc.z - m.pos.z, dist = Math.hypot(dx, dz);
    const aimYaw = Math.atan2(-dx, -dz);
    const aimPitch = Math.atan2(pc.y - this.c.y, dist);
    A.sT -= dt; if (A.sT <= 0) { A.sT = (B.agile ? 1.2 : 2) + Math.random() * 2.5; A.strafe = Math.random() < 0.5 ? 1 : -1; }
    const want = B.want[this.phase - 1];
    const fwd = dist > want + 12 ? 1 : dist < want - 12 ? -1 : 0;
    const fx_ = dx / dist, fz = dz / dist;
    let mx = fx_ * fwd + -fz * A.strafe, mz = fz * fwd + fx_ * A.strafe;
    const gl = goalDir(this, m.pos); if (gl) { mx = gl.x + -gl.z * A.strafe * 0.3; mz = gl.z + gl.x * A.strafe * 0.3; }
    A.qbT -= dt; const qb = A.qbT <= 0 && m.en > 40; if (qb) A.qbT = (this.phase === 1 ? 2.8 : 1.8) * (B.agile ? 0.6 : 1) + Math.random() * 2;
    A.jumpT -= dt; let jump = false;
    if (A.jumpT <= 0 && m.grounded) { A.jumpT = (B.agile ? 3 : 5) + Math.random() * 4; jump = true; A.hover = 1.2 + Math.random(); }
    A.hover -= dt;
    m.update(dt, { mx, mz, boost: m.en > 30 && (dist > want + 20 || this.phase === 2 || !!B.agile), qboost: qb, jump, hover: A.hover > 0, aimYaw, aimPitch });
    // weapons
    if (!p._ent) p.center(playerC);
    const ent = p._ent; const aim = lead(this.c, 200, _c, p).clone();
    aim.x += (Math.random() - 0.5) * 2.5; aim.y += (Math.random() - 0.5) * 2; aim.z += (Math.random() - 0.5) * 2.5;
    const los = clearLine(this.c, pc) && dist < 140;
    A.burstT -= dt; if (A.burstT <= 0) { A.burst = A.burst > 0 ? 0 : 1; A.burstT = A.burst ? 1.4 + Math.random() : 1 + Math.random() * 1.5; }
    const trig = (k) => {
      const t = this.ws[k].d.type;
      if (!los) return false;
      if (t === 'blade') return dist < 30 && Math.random() < 0.04;
      if (this.ws[k].d.pellets) return dist < 40;
      if (t === 'charge') return true;            // enemies release automatically at full charge
      if (k === 'S') return this.ws.S.cd <= 0 && Math.random() < 0.02;
      return k === 'R' ? A.burst > 0 : A.burst === 0 && Math.random() < 0.6;
    };
    for (const k of ['R', 'L', 'S']) {
      G.curLabel = (this.kind === 'raider' ? this.B.palette + '-' : 'boss-') + this.ws[k].key;
      weaponTick(dt, m, k, this.ws[k], trig(k), aim, ent, 'E', ent ? [ent] : null, B.mul[this.ws[k].key] ?? 0.4);
    }
  }
  remove() { this.mech.dispose(); this.gone = true; }
}

// ------------------------------------------------------------------ pickups
// Colossus: 25 m quadruped siege walker. Three breakable parts — missile pod, cannon pod, belly core. The core is armoured
// (damage x0.12) until both pods are gone. Stomps anyone standing under it (jump to avoid); in phase 2 the core fires plasma.
export class Colossus {
  constructor(pos, hpMul = 1) {
    const S = this.scale = 1.4;
    this.kind = 'boss'; this.isColossus = true;
    this.B = { name: '巨像 COLOSSUS', palette: 'tyrant', phase2: ['巨像核心暴露', '两座武器舱已毁 · 攻击腹部发光核心'] };
    this.obj = cloneKit('E_Colossus'); this.obj.scale.setScalar(S); this.obj.position.copy(pos); G.scene.add(this.obj);
    this.n = nodes(this.obj); this.pos = this.obj.position; this.vel = new V3();
    this.yaw = Math.atan2(pos.x - G.player.pos.x, pos.z - G.player.pos.z); this.obj.rotation.y = this.yaw;
    const H = G.diff.hp * hpMul;
    const mk = (key, node, hp, r) => {
      const pt = { kind: 'cpart', key, node: this.n[node], owner: this, c: new V3(), r, hp, maxHp: hp, alive: true };
      pt.hit = (dmg, at) => this.hitPart(pt, dmg, at);
      return pt;
    };
    this.parts = [mk('podL', 'E_CPodL', 3800 * H, 2.7 * S), mk('podR', 'E_CPodR', 3800 * H, 2.7 * S), mk('core', 'E_CCore', 7600 * H, 2.3 * S)];
    this.core = this.parts[2];
    this.maxHp = this.parts.reduce((a, p) => a + p.maxHp, 0); this.hp = this.maxHp;
    this.c = new V3(); this.r = 4; this.alive = true; this.dying = false; this.phase = 1;
    this.msT = 5; this.cnT = 3; this.stompT = 4; this.windT = 0; this.plT = 2; this.stepPh = 0; this.armorSaid = 0; this.losT = 0; this.los = true;
    this.legs = [0, 1, 2, 3].map((i) => this.n['E_CLeg' + i]);
    this.updateParts();
    G.enemies.push(this);
  }
  tg() { return pickTarget(this); }
  updateParts() {
    this.obj.updateMatrixWorld(true);
    for (const pt of this.parts) if (pt.node) pt.node.getWorldPosition(pt.c);
    const lead = this.parts.find((p) => p.alive && p.key !== 'core') || this.core;
    this.c.copy(lead.c);
  }
  hitPart(pt, dmg) {
    if (!pt.alive || !this.alive) return;
    if (pt.key === 'core' && this.phase === 1) {
      dmg *= 0.12;
      if (Math.random() < 0.3) G.fx.sparks(pt.c, null, 4, 0xffd080, 14, 1, 0.25, 0.25);
      if (G.time - this.armorSaid > 12) { this.armorSaid = G.time; G.onHint && G.onHint('核心有装甲 · 先摧毁两座武器舱', 2.4); }
    }
    pt.hp -= dmg;
    this.hp = this.parts.reduce((a, p) => a + Math.max(0, p.hp), 0);
    if (pt.hp > 0) return;
    pt.alive = false; pt.hp = 0;
    if (pt.key === 'core') { this.die(); return; }
    G.fx.explosion(pt.c, 2.6); G.fx.flash(pt.c, 0xff8040, 60, 40, 0.4); sfx('bigboom', G.player.pos.distanceTo(pt.c));
    G.fx.trauma = Math.min(1, (G.fx.trauma || 0) + 0.5);
    if (pt.node) pt.node.visible = false;
    G.onHint && G.onHint(pt.key === 'podL' ? '导弹舱已摧毁' : '炮舱已摧毁', 2);
    if (this.parts.every((p) => p.key === 'core' || !p.alive)) { this.phase = 2; G.onBossPhase && G.onBossPhase(this); }
  }
  die() {
    this.alive = false; this.dying = true; this.deathT = 3.2; this.hp = 0;
    G.stats.kills++; G.onKill && G.onKill(this);
  }
  remove() { this.obj.parent && this.obj.parent.remove(this.obj); this.gone = true; }
  update(dt) {
    const S = this.scale;
    if (this.dying) {
      this.deathT -= dt;
      if (Math.random() < 0.18) { _a.copy(this.pos).add(_b.set((Math.random() - 0.5) * 16, 12 + Math.random() * 12, (Math.random() - 0.5) * 16)); G.fx.explosion(_a, 1.4 + Math.random()); if (Math.random() < 0.5) sfx('boom', G.player.pos.distanceTo(_a)); }
      this.obj.rotation.z += dt * 0.08; this.obj.position.y -= dt * 1.2;
      if (this.deathT <= 0) { explodeAt(this.core.c.clone(), 18, 0, 'P', 4, 0xff7030); G.fx.flash(this.core.c, 0xffa060, 120, 80, 0.8); this.remove(); }
      return;
    }
    const t = this.tg(), tc = t.center(playerC);
    const dx = tc.x - this.pos.x, dz = tc.z - this.pos.z, dist = Math.hypot(dx, dz);
    // slow tank-like walk: turn toward the target, keep it at 30–60 m
    const want = Math.atan2(-dx, -dz);
    this.yaw += Math.max(-0.4 * dt, Math.min(0.4 * dt, angDiff(want, this.yaw)));
    const sp = (this.phase === 2 ? 3.4 : 2.4) * (dist > 60 ? 1 : dist < 30 ? -0.5 : 0.2);
    this.vel.set(-Math.sin(this.yaw) * sp, 0, -Math.cos(this.yaw) * sp);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    collideCyl(this.pos, 7, 4);
    this.pos.x = Math.max(-ARENA + 14, Math.min(ARENA - 14, this.pos.x)); this.pos.z = Math.max(-ARENA + 14, Math.min(ARENA - 14, this.pos.z));
    this.obj.rotation.y = this.yaw;
    this.stepPh += Math.abs(sp) * dt * 0.55 + dt * 0.15;
    for (let i = 0; i < 4; i++) if (this.legs[i]) this.legs[i].rotation.x = Math.sin(this.stepPh + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.16;
    const bob = Math.abs(Math.sin(this.stepPh)) * 0.35;
    this.obj.position.y = bob;
    if (Math.abs(sp) > 0.5 && Math.sin(this.stepPh) * Math.sin(this.stepPh - dt) < 0) { sfx('land', G.player.pos.distanceTo(this.pos) * 0.6); G.fx.trauma = Math.min(1, (G.fx.trauma || 0) + Math.max(0, 0.25 - dist / 400)); }
    this.updateParts();
    this.losT -= dt; if (this.losT <= 0) { this.losT = 0.4; this.los = clearLine(_c.copy(this.pos).setY(22 * S * 0.9), tc); }
    const pod = (k) => this.parts.find((p) => p.key === k && p.alive);
    // missile pod: 8 homing missiles
    if (pod('podL') && dist < 170) {
      this.msT -= dt;
      if (this.msT <= 0) {
        this.msT = 7 + Math.random() * 2;
        if (t === G.player) G.onEnemyMissile && G.onEnemyMissile();
        for (let k = 0; k < 10; k++) G.queue.push({ label: 'colossus-missile', t: k * 0.14, fn: () => {
          const pl = pod('podL'); if (!pl || !this.alive) return;
          const mp = this.n.Muzzle_CPodL.getWorldPosition(_a).clone(), f = this.tg();
          const v = new V3((Math.random() - 0.5) * 10, 20 + Math.random() * 6, (Math.random() - 0.5) * 10).addScaledVector(_d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 10);
          spawnShot({ p: mp, v, dmg: 20, team: 'E', kind: 'missile', splash: 4, target: f._ent, aim: f.center(new V3()), life: 7, maxSpeed: 52, turn: 1.6, label: 'colossus-missile' });
          G.fx.muzzle(mp, v.clone().normalize(), 0xff7040, 1.2); sfx('missile', dist);
        } });
      }
    }
    // cannon pod: 4 lobbed shells around the target, landing spots marked
    if (pod('podR') && dist < 150 && this.los) {
      this.cnT -= dt;
      if (this.cnT <= 0) {
        this.cnT = 4.2 + Math.random() * 1.2;
        for (let k = 0; k < 6; k++) G.queue.push({ label: 'colossus-cannon', t: k * 0.3, fn: () => {
          if (!pod('podR') || !this.alive) return;
          const mp = this.n.Muzzle_CPodR.getWorldPosition(_a).clone(), f = this.tg();
          const D = Math.hypot(f.pos.x - mp.x, f.pos.z - mp.z), Tf = 1.6 + D / 80, g = 22;
          const aim = new V3().copy(f.pos).addScaledVector(f.vel, Tf * 0.6);
          if (k) { aim.x += (Math.random() - 0.5) * 16; aim.z += (Math.random() - 0.5) * 16; }
          aim.y = groundAt(aim.x, aim.z, aim.y + 1);
          const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
          spawnShot({ p: mp, v, dmg: 32, team: 'E', kind: 'shell', splash: 7, life: Tf + 1, grav: g, label: 'colossus-cannon' });
          G.fx.warn(aim, 7, Tf); G.fx.muzzle(mp, _d.copy(v).normalize(), 0xff9050, 2.4); sfx('cannon', dist);
        } });
      }
    }
    // chin gun: bursts from the sensor head, always active
    this.gunT = (this.gunT ?? 2) - dt;
    if (this.gunT <= 0 && dist < 90 && this.los) {
      this.gunT = 3.4;
      for (let k = 0; k < 6; k++) G.queue.push({ label: 'colossus-gun', t: k * 0.07, fn: () => {
        if (!this.alive) return;
        const mp = this.obj.localToWorld(new V3(0, 16.4, -10.4)), f = this.tg(), aim = lead(mp, 150, _b, f);
        _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.06; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.06;
        spawnShot({ p: mp, v: _d.normalize().multiplyScalar(150), dmg: 4.5, team: 'E', kind: 'ebullet', color: 0xff6040, w: 0.32, len: 6, label: 'colossus-gun' });
        G.fx.muzzle(mp, _d, 0xff8a50, 1.2); sfx('eshot', dist);
      } });
    }
    // stomp: anyone under or right next to it gets a ground shockwave (jump / hover to avoid)
    this.stompT -= dt;
    let near = false;
    for (const f of [G.player, ...G.friends]) if (f && f.alive && Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z) < 20 * S * 0.8) near = true;
    if (this.windT > 0) {
      this.windT -= dt;
      for (const l of this.legs) if (l) l.rotation.x *= 0.9;
      this.obj.position.y = 1.4 * (1 - this.windT / 1.3);
      if (this.windT <= 0) {
        const R = 22, gp = new V3(this.pos.x, 0.4, this.pos.z);
        G.fx.ring(gp, null, 2, R + 4, 0.6, 0xff8a40); G.fx.ring(gp, null, 1, R * 0.6, 0.4, 0xffc080); G.fx.dust(gp, 8, 6, 20);
        G.fx.trauma = 1; sfx('bigboom', G.player.pos.distanceTo(this.pos));
        G.curLabel = 'colossus-stomp';
        for (const e of entsFor('E')) {
          if (e.isBarrel) continue;
          const hd = Math.hypot(e.c.x - this.pos.x, e.c.z - this.pos.z), gy = groundAt(e.c.x, e.c.z, e.c.y);
          if (hd < R && e.c.y - gy < 4.2) dealDamage(e, 70 * (1 - hd / R * 0.4), 'E', gp, 'colossus-stomp');
        }
        this.stompT = 7;
      }
    } else if (near && this.stompT <= 0) {
      this.windT = 1.3; G.fx.warn(new V3(this.pos.x, groundAt(this.pos.x, this.pos.z, 1), this.pos.z), 22, 1.3); sfx('warn', 0);
    }
    // phase 2: the exposed core fires plasma bursts
    if (this.phase === 2 && dist < 140 && this.los) {
      this.plT -= dt;
      if (this.plT <= 0) {
        this.plT = 2.1;
        for (let k = 0; k < 4; k++) G.queue.push({ label: 'colossus-plasma', t: k * 0.25, fn: () => {
          if (!this.alive) return;
          const mp = this.core.c.clone(), f = this.tg(), aim = lead(mp, 75, _b, f);
          _d.subVectors(aim, mp).normalize();
          spawnShot({ p: mp, v: _d.clone().multiplyScalar(75), dmg: 24, team: 'E', kind: 'plasma', splash: 6, life: 3, size: 1.2, label: 'colossus-plasma' });
          G.fx.muzzle(mp, _d, 0xff8a30, 2); sfx('cannon', dist);
        } });
      }
    }
  }
}

// Armoured train: locomotive + gun / carrier / missile cars running laps of a closed rail loop. Every car is a breakable
// part; the locomotive's roof reactor is armoured (x0.15) until all three weapon cars are wrecked. Anything standing on the
// track gets rammed. If it is not stopped within TRAIN.laps laps it escapes and the mission is lost.
export const TRAIN = { speed: 11, fast: 14, gap: 12.4, laps: 3, ram: 55 };
export class Train {
  constructor(track, hpMul = 1, d0 = null) {
    this.kind = 'boss'; this.isTrain = true;
    this.B = { name: '装甲列车 IRONCLAD', phase2: ['列车核心暴露', '武装车厢全毁 · 攻击车头顶部的反应堆'] };
    this.pts = track.map(([x, z]) => new V3(x, 0, z)); this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.total = this.cum[this.cum.length - 1];
    const H = G.diff.hp * hpMul;
    const defs = [['loco', 'E_TrainLoco', 7000, 3.6, 'E_TLCore'], ['gun', 'E_TrainGun', 4000, 4.4], ['carrier', 'E_TrainCarrier', 3400, 4.4], ['missile', 'E_TrainMsl', 4000, 4.4]];
    this.cars = defs.map(([key, kn, hp, r, node], i) => {
      const obj = cloneKit(kn); G.scene.add(obj); const n = nodes(obj);
      const pt = { kind: 'cpart', key, node: node ? n[node] : null, owner: this, c: new V3(), r, hp: hp * H, maxHp: hp * H, alive: true, vel: new V3() };
      pt.hit = (dmg) => this.hitPart(pt, dmg);
      return { key, obj, n, pt, pos: new V3(), tan: new V3(), len: i ? 11 : 12, smokeT: 0, tilt: 0 };
    });
    this.parts = this.cars.map((c) => c.pt); this.core = this.parts[0];
    this.maxHp = this.parts.reduce((a, p) => a + p.maxHp, 0); this.hp = this.maxHp;
    this.c = new V3(); this.r = 4; this.alive = true; this.dying = false; this.phase = 1;
    // start on the stretch of track farthest from the player
    if (d0 === null) { let best = -1; d0 = 0; for (let i = 0; i < this.pts.length - 1; i++) { const q = this.pts[i].distanceTo(G.player.pos); if (q > best) { best = q; d0 = this.cum[i]; } } }
    this.d = d0 + this.total; this.d0 = this.d; this.v = TRAIN.speed;
    this.pos = this.cars[0].pos; this.vel = new V3();
    this.gunT = 3; this.gunSide = 0; this.mslT = 6; this.carT = 5; this.hatch = 0; this.hatchT = 0; this.plT = 2; this.ramCD = 0; this.hornT = 0; this.armorSaid = 0; this.rams = 0;
    this.place(0);
    G.enemies.push(this);
  }
  sample(d, out, tan) {
    d = ((d % this.total) + this.total) % this.total;
    let lo = 1, hi = this.cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.cum[m] < d) lo = m + 1; else hi = m; }
    const a = this.pts[lo - 1], b = this.pts[lo], k = (d - this.cum[lo - 1]) / Math.max(1e-6, this.cum[lo] - this.cum[lo - 1]);
    out.copy(a).lerp(b, k); if (tan) tan.subVectors(b, a).normalize();
    return out;
  }
  lapsLeft() { return TRAIN.laps - (this.d - this.d0) / this.total; }
  timeLeft() { return this.lapsLeft() * this.total / Math.max(1, this.v); }
  place(dt) {
    for (let i = 0; i < this.cars.length; i++) {
      const C = this.cars[i];
      // sample the car's two bogies so it sits on the curve instead of hanging off it
      this.sample(this.d - i * TRAIN.gap + C.len * 0.32, _a, null); this.sample(this.d - i * TRAIN.gap - C.len * 0.32, _b, null);
      C.pos.addVectors(_a, _b).multiplyScalar(0.5); C.tan.subVectors(_a, _b).normalize();
      C.obj.position.copy(C.pos); C.obj.rotation.set(0, Math.atan2(-C.tan.x, -C.tan.z), 0);
      if (C.tilt) { C.obj.rotateZ(C.tilt); }
      C.pt.vel.copy(C.tan).multiplyScalar(this.v);
    }
    this.vel.copy(this.cars[0].pt.vel);
    for (const C of this.cars) C.obj.updateMatrixWorld(true);
    for (const C of this.cars) {
      if (C.pt.node) C.pt.node.getWorldPosition(C.pt.c); else C.pt.c.set(C.pos.x, 2.9, C.pos.z);
    }
    const lead = this.parts.find((p) => p.alive && p.key !== 'loco') || this.core;
    this.c.copy(lead.c);
  }
  hitPart(pt, dmg) {
    if (!pt.alive || !this.alive) return;
    if (pt.key === 'loco' && this.phase === 1) {
      dmg *= 0.15;
      if (Math.random() < 0.3) G.fx.sparks(pt.c, null, 4, 0xffd080, 14, 1, 0.25, 0.25);
      if (G.time - this.armorSaid > 12) { this.armorSaid = G.time; G.onHint && G.onHint('车头反应堆有装甲 · 先摧毁三节武装车厢', 2.4); }
    }
    pt.hp -= dmg;
    this.hp = this.parts.reduce((a, p) => a + Math.max(0, p.hp), 0);
    if (pt.hp > 0) return;
    pt.alive = false; pt.hp = 0;
    if (pt.key === 'loco') { this.die(); return; }
    const C = this.cars.find((c) => c.pt === pt);
    G.fx.explosion(pt.c, 2.4); G.fx.flash(pt.c, 0xff8040, 60, 40, 0.4); sfx('bigboom', G.player.pos.distanceTo(pt.c));
    G.fx.trauma = Math.min(1, (G.fx.trauma || 0) + 0.4);
    C.tilt = (Math.random() < 0.5 ? -1 : 1) * 0.06; C.wreck = true;
    for (const nn of ['E_TGTurret', 'E_TMPod', 'E_TCHatchL', 'E_TCHatchR']) if (C.n[nn]) C.n[nn].visible = false;
    G.onHint && G.onHint({ gun: '炮塔车已摧毁', carrier: '无人机母车已摧毁', missile: '导弹车已摧毁' }[pt.key], 2);
    if (this.parts.every((p) => p.key === 'loco' || !p.alive)) { this.phase = 2; G.onBossPhase && G.onBossPhase(this); }
  }
  die() {
    this.alive = false; this.dying = true; this.deathT = 3.6; this.hp = 0;
    G.stats.kills++; G.onKill && G.onKill(this);
  }
  remove() { for (const C of this.cars) C.obj.parent && C.obj.parent.remove(C.obj); this.gone = true; }
  tg() { return pickTarget(this); }
  update(dt) {
    const fx = G.fx, p = G.player;
    if (this.escaped) { this.d += this.v * dt; this.place(dt); return; }   // gone: keeps running, can no longer be hit
    if (this.dying) {   // derails: brakes hard, cars buckle, explosions run down the train
      this.deathT -= dt; this.v = Math.max(0, this.v - 7 * dt); this.d += this.v * dt;
      this.cars.forEach((C, i) => { C.tilt += (i % 2 ? 1 : -1) * dt * 0.12; });
      this.place(dt);
      if (Math.random() < 0.25) { const C = this.cars[Math.floor(Math.random() * 4)]; _a.copy(C.pos).add(_b.set((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6)); fx.explosion(_a, 1.3 + Math.random()); if (Math.random() < 0.5) sfx('boom', p.pos.distanceTo(_a)); }
      if (this.deathT <= 0) { for (const C of this.cars) explodeAt(C.pos.clone().setY(2.5), 12, 0, 'P', 2.6, 0xff7030); fx.flash(this.core.c, 0xffa060, 120, 90, 0.8); fx.trauma = 1; this.remove(); }
      return;
    }
    const tv = this.phase === 2 ? TRAIN.fast : TRAIN.speed;
    this.v += (tv - this.v) * Math.min(1, dt * 0.4);
    this.d += this.v * dt;
    this.place(dt);
    if (!this.warnSaid && this.timeLeft() < 30) { this.warnSaid = true; G.onHint && G.onHint('列车 30 秒后逃脱 · 集中火力打车头！', 3); sfx('warn', 0); }
    if (this.lapsLeft() <= 0) { this.escaped = true; this.alive = false; for (const q of this.parts) q.alive = false; return; }
    // smoke from wrecked cars, steam from the loco
    for (const C of this.cars) {
      C.smokeT -= dt;
      if (C.smokeT <= 0) { C.smokeT = C.wreck ? 0.08 : 0.25; if (C.wreck || C.key === 'loco') fx.emit('smoke', { x: C.pos.x + (Math.random() - 0.5) * 2, y: C.wreck ? 4 : 5.6, z: C.pos.z + (Math.random() - 0.5) * 2, vy: 3, vx: -C.tan.x * 2, vz: -C.tan.z * 2, life: C.wreck ? 2.2 : 1.4, s0: 1.6, s1: C.wreck ? 5 : 3.5, c0: C.wreck ? 0x2a2624 : 0x8a8680, a0: 0.55 }); }
      if (C.wreck && Math.random() < 0.15) fx.emit('add', { x: C.pos.x + (Math.random() - 0.5) * 3, y: 3.2, z: C.pos.z + (Math.random() - 0.5) * 3, vy: 3, life: 0.4, s0: 1, s1: 0.2, c0: 0xff8a30 });
    }
    // ram: anything inside a car's footprint is thrown clear
    this.ramCD -= dt;
    for (const f of [p, ...G.friends]) {
      if (!f || !f.alive || !f.vel || f.isCore) continue;
      for (const C of this.cars) {
        const dx = f.pos.x - C.pos.x, dz = f.pos.z - C.pos.z, al = dx * C.tan.x + dz * C.tan.z, sd = dx * -C.tan.z + dz * C.tan.x;
        if (Math.abs(al) > C.len / 2 + 0.6 || Math.abs(sd) > 3.0 || f.pos.y > 4.4) continue;
        const sg = sd >= 0 ? 1 : -1;
        f.pos.x += -C.tan.z * sg * (3.05 - Math.abs(sd)); f.pos.z += C.tan.x * sg * (3.05 - Math.abs(sd));
        if (f === p && this.ramCD <= 0 && this.v > 3) {
          this.ramCD = 1.1; this.rams++;
          f.vel.x += -C.tan.z * sg * 16 + C.tan.x * this.v * 0.8; f.vel.z += C.tan.x * sg * 16 + C.tan.z * this.v * 0.8; f.vel.y = Math.max(f.vel.y, 8);
          G.curSrc = C.pos; damagePlayer(TRAIN.ram, C.pos, 'train-ram');
          fx.sparks(f.center(_a), null, 16, 0xffc070, 18, 1, 0.4, 0.3); fx.trauma = Math.min(1, fx.trauma + 0.6); sfx('pile', 0);
        }
      }
    }
    // horn when the player stands on the track ahead
    this.hornT -= dt;
    const L = this.cars[0];
    { const dx = p.pos.x - L.pos.x, dz = p.pos.z - L.pos.z, al = dx * L.tan.x + dz * L.tan.z, sd = Math.abs(dx * -L.tan.z + dz * L.tan.x);
      if (al > 4 && al < 70 && sd < 4 && p.pos.y < 6 && this.hornT <= 0) { this.hornT = 5; sfx('horn', p.pos.distanceTo(L.pos) * 0.4); if (!G.hornSaid) { G.hornSaid = true; G.onHint && G.onHint('列车驶来 · 离开铁轨！', 2.2); } } }
    const t = this.tg(), tc = t.center(playerC);
    const car = (k) => this.cars.find((c) => c.key === k && c.pt.alive);
    // gun car: the turret tracks the target and fires bursts of twin cannon rounds
    const G1 = car('gun');
    if (G1) {
      const tur = G1.n.E_TGTurret, tp = tur.getWorldPosition(_c), dist = tp.distanceTo(tc);
      const want = Math.atan2(-(tc.x - tp.x), -(tc.z - tp.z)) - G1.obj.rotation.y;
      tur.rotation.y += Math.max(-1.6 * dt, Math.min(1.6 * dt, angDiff(want, tur.rotation.y)));
      this.gunT -= dt;
      if (this.gunT <= 0 && dist < 130 && Math.abs(angDiff(want, tur.rotation.y)) < 0.25 && clearLine(tp, tc)) {
        this.gunT = 2.3 + Math.random() * 0.6;
        for (let k = 0; k < 8; k++) G.queue.push({ label: 'train-gun', t: k * 0.09, fn: () => {
          if (!G1.pt.alive || !this.alive) return;
          const mp = G1.n.Muzzle_TGun.getWorldPosition(new V3()), f = this.tg(), aim = lead(mp, 170, _b, f);
          _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.03; _d.z += (Math.random() - 0.5) * 0.05;
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(170), dmg: 7, team: 'E', kind: 'ebullet', color: 0xffa050, w: 0.34, len: 6, label: 'train-gun' });
          G.fx.muzzle(mp, _d, 0xffa050, 1.4); sfx('eshot', p.pos.distanceTo(mp));
        } });
      }
    }
    // missile car: homing salvo
    const M1 = car('missile');
    if (M1) {
      this.mslT -= dt;
      if (this.mslT <= 0 && M1.pos.distanceTo(tc) < 170) {
        this.mslT = 8 + Math.random() * 2;
        if (t === p) G.onEnemyMissile && G.onEnemyMissile();
        for (let k = 0; k < 6; k++) G.queue.push({ label: 'train-missile', t: k * 0.16, fn: () => {
          if (!M1.pt.alive || !this.alive) return;
          const mp = M1.n.Muzzle_TMsl.getWorldPosition(new V3()), f = this.tg();
          const v = new V3((Math.random() - 0.5) * 8, 18 + Math.random() * 5, (Math.random() - 0.5) * 8).addScaledVector(M1.tan, this.v);
          spawnShot({ p: mp, v, dmg: 18, team: 'E', kind: 'missile', splash: 4, target: f._ent, aim: f.center(new V3()), life: 7, maxSpeed: 50, turn: 1.6, label: 'train-missile' });
          G.fx.muzzle(mp, v.clone().normalize(), 0xff7040, 1.2); sfx('missile', p.pos.distanceTo(mp));
        } });
      }
    }
    // carrier: opens its roof and launches a pair of drones
    const C1 = car('carrier');
    if (C1) {
      this.carT -= dt;
      if (this.carT <= 0) {
        this.carT = 15 + Math.random() * 3;
        if (G.enemies.filter((e) => e.kind === 'drone' && e.alive).length < 4) {
          this.hatchT = 2.2;
          for (let k = 0; k < 2; k++) G.queue.push({ label: 'train-carrier', t: 0.5 + k * 0.4, fn: () => {
            if (!C1.pt.alive || !this.alive) return;
            const mp = C1.n.Muzzle_TCar.getWorldPosition(new V3()); mp.y += 1.5;
            const dr = new Drone(mp); dr.alt = 9 + Math.random() * 6;
            G.fx.ring(mp, null, 0.5, 4, 0.3, 0xff8a50); sfx('drone', p.pos.distanceTo(mp));
          } });
        }
      }
      this.hatchT -= dt; const ho = this.hatchT > 0 ? 1 : 0;
      this.hatch += (ho - this.hatch) * Math.min(1, dt * 5);
      if (C1.n.E_TCHatchL) C1.n.E_TCHatchL.rotation.z = this.hatch * 1.5;
      if (C1.n.E_TCHatchR) C1.n.E_TCHatchR.rotation.z = -this.hatch * 1.5;
    }
    // phase 2: the exposed reactor fires plasma while the loco runs for it
    if (this.phase === 2) {
      this.plT -= dt;
      const mp0 = L.n.Muzzle_TLoco.getWorldPosition(_c);
      if (this.plT <= 0 && mp0.distanceTo(tc) < 140 && clearLine(mp0, tc)) {
        this.plT = 2.4;
        for (let k = 0; k < 3; k++) G.queue.push({ label: 'train-plasma', t: k * 0.22, fn: () => {
          if (!this.alive) return;
          const mp = L.n.Muzzle_TLoco.getWorldPosition(new V3()), f = this.tg(), aim = lead(mp, 75, _b, f);
          _d.subVectors(aim, mp).normalize();
          spawnShot({ p: mp, v: _d.clone().multiplyScalar(75), dmg: 22, team: 'E', kind: 'plasma', splash: 5, life: 3, size: 1.1, label: 'train-plasma' });
          G.fx.muzzle(mp, _d, 0xff8a30, 2); sfx('cannon', p.pos.distanceTo(mp));
        } });
      }
    }
  }
}

// Stalker: cloaked sniper. Moves invisibly to a firing spot, decloaks, paints the target with a red laser
// (tracks for 1.2 s, then freezes for 0.45 s), fires a hitscan rail shot along the frozen line, then cloaks and relocates.
// Hits reveal it; ~90 damage while it is aiming interrupts the shot.
export class Stalker extends Enemy {
  constructor(pos) {
    super('stalker', 'E_Stalker', pos, 520, 1.6); this.boom = 1;
    this.mats = [];
    this.obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; this.mats.push(o); } });
    this.alpha = 0.06; this.st = 'move'; this.stT = 0; this.dest = null; this.reveal = 0; this.vel = new V3(); this.yaw = 0; this.ph = 0;
    this.aimPt = new V3(); this.stag = 0; this.cloaked = true; this.lockOn = null; this.setAlpha(0.06);
  }
  setAlpha(a) {
    for (const o of this.mats) { o.material.opacity = a; o.material.depthWrite = a > 0.9; o.castShadow = a > 0.5; o.visible = a > 0.02; }
  }
  hit(dmg, at, label) {
    if (!this.alive || this.dying) return;
    super.hit(dmg);
    this.reveal = 2.5;
    if (this.st === 'aim') { this.stag += dmg; if (this.stag > 90 * G.diff.hp) { this.st = 'cool'; this.stT = 1.6; G.fx.sparks(this.c, null, 10, 0xff6040, 14, 0.8, 0.3, 0.25); } }
  }
  pickDest(pc) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = 65 + Math.random() * 40;
      const x = pc.x + Math.cos(a) * r, z = pc.z + Math.sin(a) * r;
      if (Math.abs(x) > ARENA - 12 || Math.abs(z) > ARENA - 12) continue;
      if (Math.hypot(x - this.pos.x, z - this.pos.z) < 25) continue;   // always relocate after a shot
      const q = new V3(x, 1, z); if (pointInSolid(q, 3)) continue;
      q.y = groundAt(x, z, 99) + 4; if (i < 12 && !clearLine(q, pc)) continue;
      q.y -= 4; return q;
    }
    return new V3(pc.x + (Math.random() - 0.5) * 80, 0, pc.z + (Math.random() - 0.5) * 80);
  }
  update(dt) {
    const p = this.tg(), pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.reveal = Math.max(0, this.reveal - dt); this.stT -= dt;
    let want = 0, moving = false;
    if (this.st === 'move') {
      if (!this.dest || this.stT < -8) { this.dest = this.pickDest(pc); this.stT = 0; }
      const ex = this.dest.x - this.pos.x, ez = this.dest.z - this.pos.z, ed = Math.hypot(ex, ez);
      if (ed < 3 || this.stT < -7.5) {
        if (dist < 135 && clearLine(_a.set(this.pos.x, this.pos.y + 3.6, this.pos.z), pc)) { this.st = 'aim'; this.stT = 1.65; this.stag = 0; this.lockOn = p; this.aimPt.copy(pc); sfx('snipe', dist); G.onSnipe && G.onSnipe(this, p); }
        else { this.dest = null; }
      } else {
        const sp = 10;
        this.vel.x += (ex / ed * sp - this.vel.x) * (1 - Math.exp(-3 * dt)); this.vel.z += (ez / ed * sp - this.vel.z) * (1 - Math.exp(-3 * dt));
        moving = true;
      }
      want = this.reveal > 0 ? 1 : 0.06;
    } else if (this.st === 'aim') {
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      // track the spot the target will be in when the shot goes off (straight-line movers get hit; changing direction dodges)
      if (this.stT > 0.3) { const lt = Math.min(1, this.stT), v = p.vel || _c.set(0, 0, 0); _b.set(pc.x + v.x * lt, pc.y + Math.max(-2, Math.min(2, v.y * lt * 0.5)), pc.z + v.z * lt); this.aimPt.lerp(_b, 1 - Math.exp(-9 * dt)); }
      const mp = this.n.Muzzle_Stalker.getWorldPosition(_a).clone();
      const frozen = this.stT <= 0.3;
      _d.subVectors(this.aimPt, mp).normalize();
      const w = raySolids(mp, _d, 320); const h0 = rayEnts(mp, _d, w.t, entsFor('E')); const end = mp.clone().addScaledVector(_d, h0 ? h0.t : w.t);
      const fl = frozen ? (Math.sin(G.time * 60) > 0 ? 1 : 0.5) : 1;
      G.fx.streak(mp, end, (frozen ? 0.16 : 0.07) * fl, frozen ? 0xff3020 : 0xff2a1a);
      G.fx.emit('add', { x: end.x, y: end.y, z: end.z, life: 0.05, s0: frozen ? 1.6 : 0.8, c0: 0xff4030 });
      if (this.stT <= 0) {
        const h = rayEnts(mp, _d, w.t, entsFor('E'));
        const L = h ? h.t : w.t, hit = mp.clone().addScaledVector(_d, L);
        G.curLabel = 'stalker';
        if (h) dealDamage(h.ent, 70, 'E', hit, 'stalker');
        G.fx.streak(mp, hit, 0.5, 0xffd0c0, 0.12);
        G.fx.streak(mp, hit, 1.4, 0xff3a20, 0.18);
        G.fx.muzzle(mp, _d, 0xff6040, 2.2);
        G.fx.sparks(hit, _d.clone().multiplyScalar(-1), 10, 0xff8060, 18, 0.8, 0.3, 0.25);
        sfx('rail', dist);
        this.st = 'cool'; this.stT = 1.4; this.lockOn = null;
      }
      want = 0.55;
    } else {
      this.vel.multiplyScalar(Math.exp(-4 * dt)); want = 1; this.lockOn = null;
      if (this.stT <= 0) { this.st = 'move'; this.dest = null; this.stT = 0; sfx('cloak', dist); }
    }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 1.3, 4) && this.st === 'move') this.stT -= dt * 3;
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 1);
    // visibility: cloaked units shimmer a little so a sharp eye can spot them
    const tgtA = want < 0.1 ? 0.05 + (Math.sin(G.time * 7 + this.ph) > 0.92 ? 0.12 : 0) : want;
    this.alpha += (tgtA - this.alpha) * (1 - Math.exp(-6 * dt));
    this.setAlpha(this.alpha); this.cloaked = this.alpha < 0.35;
    // pose
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.ph += dt * (2 + sp * 1.1);
    const face = this.st === 'move' && sp > 1 ? Math.atan2(-this.vel.x, -this.vel.z) : Math.atan2(-dx, -dz);
    this.yaw += angDiff(face, this.yaw) * Math.min(1, dt * 5); this.obj.rotation.y = this.yaw;
    const k = Math.min(1, sp / 6);
    this.n.E_SLeg1.rotation.x = Math.sin(this.ph) * 0.6 * k; this.n.E_SLeg2.rotation.x = -Math.sin(this.ph) * 0.6 * k;
    this.n.E_SBody.position.y = 2.55 + Math.abs(Math.cos(this.ph)) * 0.1 * k;
    this.n.E_SBody.rotation.x = -0.18 * k;
    const g = this.n.E_SGun; const pt = this.st === 'aim' ? this.aimPt : pc;
    g.rotation.x += (Math.atan2(pt.y - (this.pos.y + 3.5), Math.max(1, dist)) - g.rotation.x) * Math.min(1, dt * 6);
    this.c.set(this.pos.x, this.pos.y + 3.2, this.pos.z);
  }
}

// Mender: field repair drone. Hangs back behind its allies and beams repairs into the most damaged one (bulwark shields too).
export class Mender extends Enemy {
  constructor(pos) {
    super('mender', 'E_Mender', pos, 170, 1.5); this.boom = 0.6;
    this.vel = new V3(); this.ph = Math.random() * 6; this.patT = 0; this.pat = null; this.beam = 0; this.sndT = 0; this.c.copy(pos);
  }
  pickPatient() {
    let best = null, bs = 0.03;
    for (const e of G.enemies) {
      if (e === this || !e.alive || e.dying || e.kind === 'mender' || e.kind === 'relay' || e.parts || !e.maxHp) continue;
      const d = e.c.distanceTo(this.c); if (d > 110) continue;
      const lack = 1 - e.hp / e.maxHp + (e.maxShp ? (1 - e.shp / e.maxShp) * 0.5 : 0);
      const sc = lack - d * 0.002 + (e.kind === 'boss' || e.kind === 'raider' ? 0.06 : 0);
      if (sc > bs) { bs = sc; best = e; }
    }
    return best;
  }
  update(dt) {
    for (let i = 1; i <= 3; i++) this.n['E_MRotor' + i].rotation.y += dt * 38;
    this.ph += dt;
    this.patT -= dt;
    if (this.patT <= 0 || (this.pat && (!this.pat.alive || this.pat.dying))) { this.patT = 0.8; this.pat = this.pickPatient(); }
    const p = G.player, pc = p.center(playerC);
    // stay behind the patient (or behind the pack) as seen from the player
    let ax, az, ay;
    const anchor = this.pat ? this.pat.c : null;
    if (anchor) {
      _a.set(anchor.x - pc.x, 0, anchor.z - pc.z); const L = _a.length() || 1; _a.multiplyScalar(1 / L);
      ax = anchor.x + _a.x * 11 + -_a.z * Math.sin(this.ph * 0.6) * 5; az = anchor.z + _a.z * 11 + _a.x * Math.sin(this.ph * 0.6) * 5; ay = anchor.y + 6;
    } else {
      _a.set(this.pos.x - pc.x, 0, this.pos.z - pc.z); const L = _a.length() || 1; _a.multiplyScalar(1 / L);
      const want = 70; ax = pc.x + _a.x * want; az = pc.z + _a.z * want; ay = pc.y + 10;
    }
    ay = Math.max(ay, groundAt(this.pos.x, this.pos.z, 99) + 4) + Math.sin(this.ph * 1.7) * 0.8;
    _b.set(ax - this.pos.x, ay - this.pos.y, az - this.pos.z);
    const Lb = _b.length(); if (Lb > 0) _b.multiplyScalar(Math.min(15, Lb * 1.1) / Lb);
    // shy: back off if the player gets close
    const pd = this.pos.distanceTo(pc);
    if (pd < 30) { _a.subVectors(this.pos, pc).setY(0.3).normalize(); _b.addScaledVector(_a, 10 * (1 - pd / 30)); }
    this.vel.lerp(_b, 1 - Math.exp(-2 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const s = pointInSolid(this.pos, 1.5); if (s) { this.pos.y = s.max.y + 2.5; this.vel.y = Math.max(this.vel.y, 2); }
    this.pos.x = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.x)); this.pos.z = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.z));
    this.c.copy(this.pos);
    const look = anchor || pc;
    this.obj.rotation.y = Math.atan2(this.pos.x - look.x, this.pos.z - look.z);
    this.obj.rotation.x = -this.vel.z * 0.01; this.obj.rotation.z = this.vel.x * 0.01;
    // repair beam
    this.beam = 0;
    if (this.pat && this.pat.c.distanceTo(this.c) < 30 && clearLine(this.c, this.pat.c)) {
      const e = this.pat, rate = Math.min(60, 12 + e.maxHp * 0.03);
      e.hp = Math.min(e.maxHp, e.hp + rate * dt);
      if (e.maxShp && e.shp > 0) e.shp = Math.min(e.maxShp, e.shp + rate * 0.8 * dt);
      this.beam = 1;
      const mp = this.n.Muzzle_Mender.getWorldPosition(_a);
      G.fx.streak(mp, e.c, 0.22 + Math.sin(this.ph * 18) * 0.05, 0x6dff9a);
      if (Math.random() < 0.3) G.fx.sparks(e.c, null, 2, 0x7dffa8, 5, 1, 0.4, 0.2);
      this.sndT -= dt; if (this.sndT <= 0) { this.sndT = 1.4; sfx('mend', pd); }
      if (!G.mendSaid) { G.mendSaid = true; G.onHint && G.onHint('维修无人机正在修复敌机 · 绿色光束 · 优先击落它', 3.5); }
    }
  }
}

// Crawler: suicide spider bomb. Runs at its target in packs, leaps from ~9 m and detonates on contact or when the fuse runs out.
// Shot down, it pops with a smaller blast that hurts nearby enemies, so packs chain-react.
export class Crawler extends Enemy {
  constructor(pos) {
    super('crawler', 'E_Crawler', pos, 75, 1.1); this.boom = 0.5;
    this.vel = new V3(); this.ph = Math.random() * 6; this.weave = Math.random() * 6; this.st = 'run'; this.fuse = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.spd = 12 + Math.random() * 3; this.wake = 0.3 + Math.random() * 0.9;
    this.legY = [1, 2, 3, 4].map((i) => this.n['E_KLeg' + i].rotation.y); this.bodyY = this.n.E_CBody.position.y;
    this.c.set(pos.x, pos.y + 0.75, pos.z); this.skT = Math.random();
  }
  explode() {
    const c = this.c.clone(); this.remove();
    G.fx.explosion(c, 0.45, 0xffa040);
    G.queue.push({ label: 'crawler-chain', t: 0.07, fn: () => explodeAt(c, 5.5, 45, 'P', 0.6, 0xffa040) });
  }
  detonate() {
    if (this.gone) return;
    this.alive = false; this.dying = true;
    G.curLabel = 'crawler'; G.curSrc = this.pos;
    explodeAt(this.c, 6, 42, 'E', 0.85, 0xff6030);
    this.remove();
  }
  update(dt) {
    const n = this.n, p = this.tg(), pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    this.ph += dt; this.wake -= dt;
    if (this.st === 'leap') {
      this.vel.y -= 26 * dt; this.pos.addScaledVector(this.vel, dt);
      const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
      if (this.pos.y < gy) { this.pos.y = gy; this.vel.x *= 0.3; this.vel.z *= 0.3; this.vel.y = 0; }
      this.fuse -= dt;
      this.c.set(this.pos.x, this.pos.y + 0.75, this.pos.z);
      this.obj.rotation.x = -0.5;
      n.E_CBlink.scale.setScalar(Math.sin(this.ph * 40) > 0 ? 2.2 : 1);
      if (this.fuse <= 0 || this.c.distanceTo(pc) < 3.1) this.detonate();
      return;
    }
    // run: straight at the target with a weave; slide along buildings
    let fx_ = dx / dist, fz = dz / dist;
    const gl = goalDir(this, this.pos); if (gl) { fx_ = gl.x; fz = gl.z; }
    const w = Math.sin(this.ph * 2.2 + this.weave) * 0.45 * Math.min(1, dist / 20);
    let tx = fx_ + -fz * w, tz = fz + fx_ * w;
    this.slideT = Math.max(0, (this.slideT || 0) - dt);
    if (this.slideT > 0) { tx = fx_ * 0.2 + -fz * this.strafe; tz = fz * 0.2 + fx_ * this.strafe; }
    const L = Math.hypot(tx, tz) || 1, sp0 = this.wake > 0 ? 0 : this.spd;
    tx = tx / L * sp0; tz = tz / L * sp0;
    const k = 1 - Math.exp(-6 * dt);
    this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 1.0, 1.5)) blockedSlide(this);
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 2);
    this.pos.x = Math.max(-ARENA + 2, Math.min(ARENA - 2, this.pos.x)); this.pos.z = Math.max(-ARENA + 2, Math.min(ARENA - 2, this.pos.z));
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.5) this.obj.rotation.y = Math.atan2(-this.vel.x, -this.vel.z);
    const g = Math.min(1, sp / 6);
    for (let i = 0; i < 4; i++) n['E_KLeg' + (i + 1)].rotation.y = this.legY[i] + Math.sin(this.ph * 22 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35 * g;
    n.E_CBody.position.y = this.bodyY + Math.abs(Math.sin(this.ph * 22)) * 0.07 * g;
    n.E_CBlink.scale.setScalar(Math.sin(this.ph * (dist < 25 ? 18 : 5)) > 0.3 ? 1.5 : 1);
    this.c.set(this.pos.x, this.pos.y + 0.75, this.pos.z);
    this.skT -= dt; if (this.skT <= 0 && dist < 45) { this.skT = 0.5 + Math.random() * 0.4; sfx('skitter', Math.hypot(this.pos.x - G.player.pos.x, this.pos.z - G.player.pos.z)); }
    // leap from close range (the target's vertical offset decides the arc)
    if (this.wake <= 0 && dist < 9 && Math.abs(pc.y - this.c.y) < 12 && this.checkLos(dt)) {
      const t = 0.5, tv = p.vel || _a.set(0, 0, 0);
      const ax = pc.x + tv.x * t * 0.6 - this.pos.x, az = pc.z + tv.z * t * 0.6 - this.pos.z;
      this.vel.set(ax / t, (pc.y - 0.8 - this.pos.y + 0.5 * 26 * t * t) / t, az / t);
      this.st = 'leap'; this.fuse = 0.85;
      G.fx.flash(this.c, 0xff4020, 18, 10, 0.3);
      sfx('crawl', dist);
    }
  }
}

// burning: flamethrower hits set ents alight for a few seconds (stacks refresh the timer, the strongest burn wins)
function ignite(e, dps, t, label) {
  e.burnT = Math.max(e.burnT || 0, t); e.burnDps = Math.max(e.burnT > t ? e.burnDps || 0 : 0, dps); e.burnLabel = label;
  G.burning.add(e);
}
function updateBurning(dt) {
  for (const e of G.burning) {
    if (!e.alive || e.dying || !(e.burnT > 0)) { e.burnT = 0; G.burning.delete(e); continue; }
    e.burnT -= dt;
    const dmg = e.burnDps * dt;
    G.pierce = true; e.hit(dmg, e.c, e.burnLabel); G.pierce = false;
    if (!isAlly(e.burnLabel)) { G.stats.dmgDealt += dmg; if (G.od && !(G.od.t > 0)) G.od.k = Math.min(1, G.od.k + dmg / OD.fill * (G.odGain || 1)); }
    if (Math.random() < 0.55) { const r = (e.r || 1.5) * 0.7; G.fx.emit('add', { x: e.c.x + (Math.random() - 0.5) * r, y: e.c.y + (Math.random() - 0.3) * r, z: e.c.z + (Math.random() - 0.5) * r, vy: 3, life: 0.35, s0: 0.9, s1: 1.6, c0: 0xffa040, c1: 0xff3010 }); }
    if (Math.random() < 0.08) G.fx.emit('smoke', { x: e.c.x, y: e.c.y + 1, z: e.c.z, vx: 0, vy: 2, vz: 0, life: 1.2, s0: 1.2, s1: 3.2, c0: 0x3a3634, c1: 0x222020, a0: 0.4, drag: 1 });
  }
}

// chill: cryo hits build up cold (0-100) that slows the enemy's whole update by up to half; at 100 it freezes solid
// (reuses the EMP stun: no update, +30 % damage taken) for 1.8 s (bosses 0.6 s), then it can't be re-frozen for a moment
const iceGeo = new THREE.IcosahedronGeometry(1, 1), iceMat = new THREE.MeshStandardMaterial({ color: 0xc8f2ff, emissive: 0x3aa8e0, emissiveIntensity: 0.7, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false });
const FREEZE = { t: 1.5, big: 0.5, bigK: 0.35, cd: 2 };
function chillAdd(e, v) {
  if (!e || !e.alive || e.dying || e.frozen || (e.frozeCD > 0)) return;
  const big = e.kind === 'boss' || e.kind === 'raider' || e.isColossus || e.isTrain;
  e.chill = Math.min(100, (e.chill || 0) + v * (big ? FREEZE.bigK : 1)); e.chillQ = 0.6; G.chilled.add(e);
  if (e.chill >= 100) {
    e.chill = 0; e.frozen = true; e.stunT = Math.max(e.stunT || 0, big ? FREEZE.big : FREEZE.t); e.stunMax = e.stunT;
    G.freezes = (G.freezes || 0) + 1;
    if (!e.ice) { e.ice = new THREE.Mesh(iceGeo, iceMat); e.ice.renderOrder = 1; G.scene.add(e.ice); }
    const r = (e.r || 2) * (big ? 1.25 : 1.15); e.ice.scale.set(r, r * 1.15, r); e.ice.rotation.set(Math.random(), Math.random() * 6, 0); e.ice.visible = true;
    G.fx.ring(e.c, null, 1, (e.r || 2) * 3, 0.45, 0x9fe8ff); G.fx.sparks(e.c, null, 14, 0xd8f6ff, 12, 1, 0.5, 0.3);
    sfx('freeze', G.player ? G.player.pos.distanceTo(e.c) : 30);
    if (!G.freezeSaid) { G.freezeSaid = true; G.onHint && G.onHint('冰封 · 被冻住的敌人无法行动，受到的伤害 +30%', 3); }
  }
}
function unfreeze(e) {
  e.frozen = false; e.frozeCD = FREEZE.cd;
  if (e.ice) { e.ice.visible = false; G.fx.sparks(e.c, null, 16, 0xd8f6ff, 14, 1, 0.6, 0.3); G.fx.emit('add', { x: e.c.x, y: e.c.y, z: e.c.z, life: 0.2, s0: (e.r || 2) * 2.5, c0: 0x9fe8ff }); }
}
function updateChill(dt) {
  for (const e of G.chilled) {
    if (!e.alive || e.dying || e.gone) { if (e.ice) { e.ice.parent && e.ice.parent.remove(e.ice); e.ice = null; } e.chill = 0; e.frozen = false; G.chilled.delete(e); continue; }
    if (e.frozen) { if (e.ice) e.ice.position.copy(e.c); if (!(e.stunT > 0)) unfreeze(e); continue; }
    e.frozeCD = (e.frozeCD || 0) - dt; e.chillQ -= dt;
    if (e.chillQ <= 0) e.chill = Math.max(0, e.chill - 30 * dt);
    if (e.chill > 15 && Math.random() < e.chill / 140) { const r = (e.r || 1.5) * 0.8; G.fx.emit('add', { x: e.c.x + (Math.random() - 0.5) * r, y: e.c.y + (Math.random() - 0.3) * r, z: e.c.z + (Math.random() - 0.5) * r, vy: -0.6, life: 0.4, s0: 0.5, s1: 1.2, c0: 0xc8f2ff, c1: 0x4aa8e0 }); }
    if (e.chill <= 0 && e.frozeCD <= 0) { if (e.ice) { e.ice.parent && e.ice.parent.remove(e.ice); e.ice = null; } G.chilled.delete(e); }
  }
}
export function clearChill() { for (const e of G.chilled) if (e.ice) { e.ice.parent && e.ice.parent.remove(e.ice); e.ice = null; } G.chilled.clear(); }

// forge: standing on lava burns the player; eruptions from the river nearest the player lob lava bombs at them
const LAVA_DPS = 40;
function updateForge(dt) {
  const p = G.player; if (!p || !p.alive) return;
  LAVA.uT.value = G.time;
  if (p.grounded && lavaAt(p.pos.x, p.pos.z)) {
    G.curSrc = null; damagePlayer(LAVA_DPS * dt, null, 'lava'); G.lavaT = (G.lavaT || 0) + dt;
    if (Math.random() < 0.5) G.fx.emit('add', { x: p.pos.x + (Math.random() - 0.5) * 3, y: p.pos.y + 0.4, z: p.pos.z + (Math.random() - 0.5) * 3, vy: 3, life: 0.4, s0: 0.8, s1: 1.6, c0: 0xffb060, c1: 0xff3010 });
    if (!G.lavaSaid) { G.lavaSaid = true; G.onHint && G.onHint('熔岩 · 站在岩浆上持续受伤 · 跳起或悬停越过熔岩河', 3.5); }
  }
  G.eruptT = (G.eruptT ?? 8) - dt;
  if (G.eruptT > 0) return;
  G.eruptT = 7 + Math.random() * 3;
  let src = null;
  for (let k = 0; k < 40 && !src; k++) {
    const a = Math.random() * 6.28, r = 25 + Math.random() * 45, x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
    if (Math.abs(x) < ARENA && Math.abs(z) < ARENA && lavaD(x, z) < 3) src = new V3(x, 0.3, z);
  }
  if (!src) return;
  G.fx.explosion(src, 0.9, 0xff7020); G.fx.smoke(src, 6, 4, 4, 0x3a2a24, 2.5, 1.6); sfx('erupt', p.pos.distanceTo(src));
  G.eruptions = (G.eruptions || 0) + 1;
  for (let k = 0; k < 5; k++) G.queue.push({ label: 'eruption', t: k * 0.18, fn: () => {
    const Tf = 1.6 + Math.random() * 0.5, g = 24;
    const aim = new V3(p.pos.x + p.vel.x * Tf * 0.4 + (Math.random() - 0.5) * 14, 0, p.pos.z + p.vel.z * Tf * 0.4 + (Math.random() - 0.5) * 14);
    aim.y = groundAt(aim.x, aim.z, 30);
    const v = new V3((aim.x - src.x) / Tf, (aim.y - src.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - src.z) / Tf);
    spawnShot({ p: src, v, dmg: 34, team: 'E', kind: 'shell', splash: 6, life: Tf + 1, grav: g, label: 'eruption' });
    G.fx.warn(aim, 6, Tf);
  } });
  if (!G.eruptSaid) { G.eruptSaid = true; G.onHint && G.onHint('熔岩喷发 · 火山弹落向红圈 · 移动躲开', 3); }
}

// Burrower: drill-worm that tunnels underground (untargetable, leaves a dust trail), surfaces under its target after a
// 0.9 s red-circle warning (55 dmg + knock-up), spits magma globs for ~5.5 s while exposed, then dives and relocates
export class Burrower extends Enemy {
  constructor(pos) {
    super('burrower', 'E_Burrower', pos, 520, 2.1); this.boom = 1.2;
    this.st = 'under'; this.stT = 2 + Math.random() * 2; this.cloaked = true; this.obj.visible = false; this.rise = 0;
    this.trailT = 0; this.rumbleT = 0; this.spitT = 1; this.spdK = 0.8 + Math.random() * 0.4; this.ph = Math.random() * 6; this.underT = 0; this.away = null;
    this.spot = new V3(); this.jaws = [1, 2, 3].map((i) => this.n['E_BJaw' + i]); this.jawZ = this.jaws.map((j) => j.rotation.z);
    this.c.set(pos.x, pos.y - 8, pos.z);
  }
  hit(dmg) { if (this.st === 'under' || this.st === 'warn') return; super.hit(dmg); }
  update(dt) {
    const f = this.tg(), pc = f.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1, pd = Math.hypot(this.pos.x - G.player.pos.x, this.pos.z - G.player.pos.z);
    this.ph += dt; this.stT -= dt;
    const n = this.n;
    if (this.st === 'under') {
      this.underT += dt;
      let gx = dx, gz = dz, gd = dist;
      if (this.away) { gx = this.away.x - this.pos.x; gz = this.away.z - this.pos.z; gd = Math.hypot(gx, gz) || 1; if (gd < 4 || this.stT <= 0) this.away = null; }
      const sp = (this.away ? 15 : Math.min(14, 6 + gd * 0.25)) * this.spdK;
      this.pos.x += gx / gd * sp * dt; this.pos.z += gz / gd * sp * dt;
      for (const o of G.enemies) if (o !== this && o.kind === 'burrower' && o.alive) { const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, od = Math.hypot(ox, oz); if (od < 9 && od > 0.01) { this.pos.x += ox / od * 6 * dt; this.pos.z += oz / od * 6 * dt; } }
      this.pos.x = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.x)); this.pos.z = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.z));
      this.c.set(this.pos.x, -8, this.pos.z);
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.07;
        const y = groundAt(this.pos.x, this.pos.z, 2);
        G.fx.emit('smoke', { x: this.pos.x + (Math.random() - 0.5) * 2, y: y + 0.3, z: this.pos.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 2, vy: 1.6, vz: (Math.random() - 0.5) * 2, life: 1.1, s0: 1.0, s1: 2.6, c0: 0x6a5444, c1: 0x4a3a30, a0: 0.6, drag: 1.5 });
        if (Math.random() < 0.4) G.fx.sparks(_a.set(this.pos.x, y + 0.3, this.pos.z), _b.set(0, 1, 0), 2, 0x7a6048, 6, 1, 0.5, 0.25);
      }
      this.rumbleT -= dt; if (this.rumbleT <= 0 && pd < 60) { this.rumbleT = 0.7; sfx('rumble', pd); }
      if (!this.away && this.stT <= 0 && (dist < 3.5 || this.underT > 12)) {
        this.st = 'warn'; this.stT = 0.9; this.spot.set(this.pos.x, groundAt(this.pos.x, this.pos.z, 2), this.pos.z);
        G.fx.warn(this.spot, 5.5, 0.9);
        if (!G.burrowSaid) { G.burrowSaid = true; G.onHint && G.onHint('钻地虫 · 地面尘土在追你 · 红圈出现立刻离开 · 它钻出地面后才能被击中', 4); }
      }
      return;
    }
    if (this.st === 'warn') {
      if (Math.random() < 0.6) G.fx.emit('smoke', { x: this.spot.x + (Math.random() - 0.5) * 6, y: this.spot.y + 0.3, z: this.spot.z + (Math.random() - 0.5) * 6, vx: 0, vy: 2.5, vz: 0, life: 0.8, s0: 1.2, s1: 2.8, c0: 0x7a6250, c1: 0x4a3a30, a0: 0.6, drag: 1.5 });
      if (this.stT <= 0) {
        this.st = 'up'; this.stT = 5.5; this.rise = 0; this.cloaked = false; this.obj.visible = true; this.underT = 0; this.spitT = 1.2;
        this.pos.copy(this.spot); this.pos.y = this.spot.y - 6;
        G.curLabel = 'burrower'; G.curSrc = this.spot;
        explodeAt(_c.copy(this.spot).setY(this.spot.y + 1.2), 5.5, 70, 'E', 0.9, 0xff7030);
        const P = G.player; if (P.alive && Math.hypot(P.pos.x - this.spot.x, P.pos.z - this.spot.z) < 6 && P.pos.y - this.spot.y < 3) { P.vel.y = Math.max(P.vel.y, 13); P.grounded = false; }
        G.fx.smoke(this.spot, 8, 5, 5, 0x6a5444, 2.6, 1.6); G.fx.sparks(this.spot, _b.set(0, 1, 0), 22, 0x8a6a50, 18, 1.4, 0.8, 0.35); G.fx.trauma = Math.min(1, G.fx.trauma + 0.5 * Math.max(0, 1 - pd / 40));
        sfx('erupt', pd); G.burrowUps = (G.burrowUps || 0) + 1;
      }
      return;
    }
    // surfaced / diving
    const tgtY = this.spot.y;
    if (this.st === 'up') this.rise = Math.min(1, this.rise + dt / 0.35);
    else this.rise = Math.max(0, this.rise - dt / 0.6);
    this.pos.y = tgtY - 6 * (1 - this.rise) * (1 - this.rise);
    this.obj.rotation.y += angDiff(Math.atan2(-dx, -dz), this.obj.rotation.y) * Math.min(1, dt * 3);
    const open = this.st === 'up' ? Math.min(1, this.rise * 1.3) : this.rise;
    this.jaws.forEach((j, i) => { j.rotation.z = this.jawZ[i] - open * 0.55 + Math.sin(this.ph * 6 + i) * 0.04; });
    n.E_BDrill.rotation.y += dt * (this.st === 'up' ? 4 : 14);
    n.E_BBody.rotation.x = Math.sin(this.ph * 1.7) * 0.06; n.E_BBody.rotation.z = Math.cos(this.ph * 1.3) * 0.06;
    this.c.set(this.pos.x, this.pos.y + 2.6, this.pos.z);
    if (this.st === 'up') {
      if (this.rise >= 1 && this.checkLos(dt)) {
        this.spitT -= dt;
        if (this.spitT <= 0) {
          this.spitT = 1.3;
          const mp = _a.set(this.pos.x, this.pos.y + 5.4, this.pos.z).clone();
          for (let k = 0; k < 3; k++) {
            const D = Math.hypot(f.pos.x - mp.x, f.pos.z - mp.z), Tf = 0.8 + D / 45, g = 24;
            const aim = new V3().copy(f.pos).addScaledVector(f.vel, Tf * 0.6); aim.x += (Math.random() - 0.5) * 7; aim.z += (Math.random() - 0.5) * 7; aim.y = groundAt(aim.x, aim.z, aim.y + 1);
            const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
            spawnShot({ p: mp, v, dmg: 26, team: 'E', kind: 'shell', splash: 5, life: Tf + 1, grav: g, label: 'burrower-spit' });
          }
          G.fx.muzzle(mp, _d.set(0, 1, 0), 0xff7030, 2.5); sfx('cannon', pd);
        }
      }
      if (this.stT <= 0) { this.st = 'dive'; this.stT = 0.6; sfx('rumble', pd); }
    } else if (this.stT <= 0) {   // dive done: tunnel away a little, then come back
      this.st = 'under'; this.cloaked = true; this.obj.visible = false; this.stT = 2.5;
      const a = Math.random() * 6.28; this.away = new V3(f.pos.x + Math.cos(a) * 32, 0, f.pos.z + Math.sin(a) * 32);
    }
  }
}

// Sapper: twin-rotor drone that circles its target at ~11 m and drops proximity mines on the ground around it
export class Sapper extends Enemy {
  constructor(pos) {
    super('sapper', 'E_Sapper', pos, 300, 2.0); this.boom = 1;
    this.vel = new V3(); this.ph = Math.random() * 6; this.dropT = 3 + Math.random() * 2; this.orbit = Math.random() < 0.5 ? 1 : -1; this.c.copy(pos);
  }
  update(dt) {
    this.n.E_BRotor1.rotation.y += dt * 36; this.n.E_BRotor2.rotation.y -= dt * 36;
    const p = this.tg(); this.ph += dt;
    const ang = Math.atan2(this.pos.z - p.pos.z, this.pos.x - p.pos.x) + this.orbit * dt * 0.55;
    const rad = 15 + 9 * Math.sin(this.ph * 0.45);
    const tx = p.pos.x + Math.cos(ang) * rad, tz = p.pos.z + Math.sin(ang) * rad;
    const ty = Math.max(groundAt(this.pos.x, this.pos.z, 99), groundAt(tx, tz, 99)) + 11 + Math.sin(this.ph) * 0.8;
    _a.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
    const L = _a.length(); if (L > 0) _a.multiplyScalar(Math.min(15, L * 1.1) / L);
    this.vel.lerp(_a, 1 - Math.exp(-1.6 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const s = pointInSolid(this.pos, 2); if (s) { this.pos.y = s.max.y + 3; this.vel.y = Math.max(this.vel.y, 2); }
    this.pos.x = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.x)); this.pos.z = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.z));
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 1) this.obj.rotation.y += angDiff(Math.atan2(-this.vel.x, -this.vel.z), this.obj.rotation.y) * Math.min(1, dt * 3);
    this.obj.rotation.z = Math.max(-0.3, Math.min(0.3, -this.orbit * sp * 0.012));
    this.c.copy(this.pos);
    this.dropT -= dt;
    if (this.dropT <= 0 && Math.hypot(this.pos.x - p.pos.x, this.pos.z - p.pos.z) < 32) {
      this.dropT = 2.2 + Math.random() * 0.8;
      if (G.mines.filter((m) => m.alive && m.owner === this).length < 6) { new Mine(this.pos.clone().addScaledVector(this.vel, 0.4).setY(this.pos.y - 0.9), this); sfx('minedrop', Math.hypot(this.pos.x - G.player.pos.x, this.pos.z - G.player.pos.z)); }
    }
  }
}

// proximity mine: falls, arms after 1.2 s, beeps for 0.5 s when a ground target comes within 4.5 m, then blows (6.5 m, 55).
// Shoot it to set it off early (it hurts anyone nearby, you included). Lives in G.mines, not G.enemies, so waves don't wait for it.
class Mine {
  constructor(pos, owner) {
    this.obj = cloneKit('E_Mine'); this.obj.position.copy(pos); this.obj.rotation.y = Math.random() * 6.28; G.scene.add(this.obj);
    this.pos = this.obj.position; this.light = find(this.obj, 'E_MineLight'); this.owner = owner;
    this.c = new V3(); this.r = 1.1; this.hp = 24; this.alive = true; this.isMine = true; this.kind = 'mine';
    this.armT = 1.2; this.trigT = -1; this.life = 45; this.vy = -2; this.ph = Math.random() * 6; this.landed = false;
    G.mines.push(this);
  }
  hit(dmg) { if (!this.alive) return; this.hp -= dmg; if (this.hp <= 0) this.blow(false); }
  blow(trap) {
    if (!this.alive) return;
    this.alive = false; this.obj.parent && this.obj.parent.remove(this.obj);
    const c = this.c.clone();
    const prev = G.curLabel; G.curLabel = trap ? 'mine' : 'mine-shot'; G.curSrc = c;
    explodeAt(c, trap ? 6.5 : 6, trap ? 55 : 40, trap ? 'E' : 'X', 0.8, 0xff7040);
    G.curLabel = prev;
  }
  update(dt) {
    this.ph += dt;
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3);
    if (!this.landed) {
      this.vy -= 22 * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= gy) { this.pos.y = gy; this.landed = true; G.fx.emit('smoke', { x: this.pos.x, y: gy + 0.3, z: this.pos.z, vx: 0, vy: 0.5, vz: 0, life: 0.6, s0: 0.8, s1: 2, c0: 0x9a948c, c1: 0x7a746c, a0: 0.4, drag: 2 }); }
    }
    this.c.set(this.pos.x, this.pos.y + 0.35, this.pos.z);
    this.life -= dt; if (this.life <= 0) { this.alive = false; this.obj.parent && this.obj.parent.remove(this.obj); return; }
    if (this.landed) this.armT -= dt;
    const blink = this.trigT >= 0 ? Math.sin(this.ph * 50) > 0 : this.armT <= 0 && Math.sin(this.ph * 4) > 0.6;
    this.light.scale.setScalar(blink ? 2.4 : this.armT > 0 ? 0.5 : 1);
    if (this.trigT >= 0) { this.trigT -= dt; if (this.trigT <= 0) this.blow(true); return; }
    if (this.armT > 0) return;
    for (const f of [G.player, ...G.friends]) {
      if (!f || !f.alive || !f.pos) continue;
      if (Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z) < 4.5 && f.pos.y - this.pos.y < 3) {
        this.trigT = 0.5; sfx('minebeep', Math.hypot(this.pos.x - G.player.pos.x, this.pos.z - G.player.pos.z));
        if (f === G.player && !G.mineSaid) { G.mineSaid = true; G.onHint && G.onHint('踩到地雷 · 立刻急闪或跳起 · 也可以远远射爆地雷', 3); }
        break;
      }
    }
  }
}
export function clearMines() { for (const m of G.mines) m.obj.parent && m.obj.parent.remove(m.obj); G.mines.length = 0; G.burning.clear(); }

// Jammer: hovering ECM platform. Keeps ~34 m from the player; while the player is within JAM_R, lock-on, missile
// homing and the radar's enemy dots stop working. Unarmed, 380 HP. Stunned (EMP) jammers stop jamming.
export const JAM_R = 50;
export class Jammer extends Enemy {
  constructor(pos) {
    super('jammer', 'E_Jammer', pos, 380, 2.8); this.boom = 1; this.obj.scale.setScalar(1.3);
    this.vel = new V3(); this.ph = Math.random() * 6; this.orbit = Math.random() < 0.5 ? 1 : -1; this.ringT = 0; this.c.copy(pos);
  }
  update(dt) {
    this.ph += dt;
    this.n.E_JDish.rotation.y += dt * 1.8;
    this.n.E_JCore.scale.setScalar(1 + 0.25 * Math.sin(this.ph * 7));
    const p = G.player, pc = p.center(playerC);
    _a.set(this.pos.x - pc.x, 0, this.pos.z - pc.z); const L = _a.length() || 1;
    const ang = Math.atan2(_a.z, _a.x) + this.orbit * dt * 0.2;
    const want = 34, tx = pc.x + Math.cos(ang) * want, tz = pc.z + Math.sin(ang) * want;
    const ty = Math.max(groundAt(this.pos.x, this.pos.z, 99), groundAt(tx, tz, 99)) + 7 + Math.sin(this.ph * 1.3) * 0.7;
    _b.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
    const Lb = _b.length(); if (Lb > 0) _b.multiplyScalar(Math.min(9, Lb * 0.8) / Lb);
    if (L < 20) { _a.multiplyScalar(1 / L); _b.addScaledVector(_a, 8 * (1 - L / 20)); }
    this.vel.lerp(_b, 1 - Math.exp(-1.5 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const s = pointInSolid(this.pos, 2.2); if (s) { this.pos.y = s.max.y + 3; this.vel.y = Math.max(this.vel.y, 2); }
    this.pos.x = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.x)); this.pos.z = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.z));
    this.c.set(this.pos.x, this.pos.y + 0.4, this.pos.z);
    this.obj.rotation.y = Math.atan2(this.pos.x - pc.x, this.pos.z - pc.z);
    this.obj.rotation.x = -this.vel.z * 0.01; this.obj.rotation.z = this.vel.x * 0.01;
    this.ringT -= dt;
    if (this.ringT <= 0) { this.ringT = 1.3; G.fx.ring(new V3(this.pos.x, this.pos.y - 0.4, this.pos.z), null, 1.5, 12, 0.9, 0xb060ff); if (G.jammed === this) sfx('jam', 0); }
  }
}

// Howitzer: tracked artillery that sits 75-120 m back and lobs 4-shell salvos at its target without needing a firing line.
// Each shell's landing spot is marked on the ground. Accuracy depends on spotting: own line of sight > another enemy
// seeing the target > nobody (wide spread). Backs off when something closes in.
export class Howitzer extends Enemy {
  constructor(pos) {
    super('howitzer', 'E_Howitzer', pos, 650, 3.1); this.boom = 1.5;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.obj.rotation.y = this.yaw; this.fireT = 4 + Math.random() * 3; this.recoil = 0; this.pitch = 0.3; this.aimT = 0;
  }
  spotted(f) {
    if (this.los) return 1;
    for (const e of G.enemies) if (e !== this && e.alive && !e.dying && e.los && e.foe === f && e.kind !== 'howitzer') return 2;
    return 3;
  }
  update(dt) {
    const f = this.tg(), pc = f.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.checkLos(dt);
    // keep at range: back off when close, close in when out of reach
    const toward = dist < 60 ? -1 : dist > 125 ? 1 : 0;
    const tx = dx / dist * toward * 6, tz = dz / dist * toward * 6;
    this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-1.5 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-1.5 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.x)); this.pos.z = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.z));
    if (collideCyl(this.pos, 3.1, 3)) { this.vel.multiplyScalar(0.3); }
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 2);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.6) this.yaw += angDiff(Math.atan2(-this.vel.x, -this.vel.z) + (toward < 0 ? Math.PI : 0), this.yaw) * Math.min(1, dt * 1.2);   // reverses away, gun still forward-ish
    this.obj.rotation.y = this.yaw;
    const T = this.n.E_HTurret; T.rotation.y += angDiff(Math.atan2(-dx, -dz) - this.yaw, T.rotation.y) * Math.min(1, dt * 1.4);
    const wantP = this.aimT > 0 || this.salvo > 0 ? 0.55 + Math.min(0.35, dist / 400) : 0.18;
    this.pitch += (wantP - this.pitch) * Math.min(1, dt * 2);
    this.recoil = Math.max(0, this.recoil - dt * 3);
    this.n.E_HBarrel.rotation.x = this.pitch;
    this.c.set(this.pos.x, this.pos.y + 2.2, this.pos.z);
    if (dist > 165) return;
    this.fireT -= dt;
    if (this.fireT <= 0 && !(this.salvo > 0)) { this.fireT = 7 + Math.random() * 2; this.aimT = 1.1; }
    if (this.aimT > 0) {
      this.aimT -= dt;
      if (this.aimT <= 0) {
        // creeping barrage along the target's path: from just behind it to well ahead, so running straight on gets hit
        const spr = [0, 3, 4, 9][this.spotted(f)];
        const mv = new V3(f.vel.x, 0, f.vel.z); const L = mv.length();
        const side = L > 1 ? mv.multiplyScalar(1 / L) : new V3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        const step_ = Math.min(9, 4 + L * 0.35);
        this.salvo = 5;
        for (let k = 0; k < 5; k++) G.queue.push({ label: 'howitzer', t: k * 0.36, fn: () => {
          if (!this.alive) { this.salvo = 0; return; }
          this.salvo--;
          const mp = this.n.Muzzle_Howitzer.getWorldPosition(_a).clone();
          const D = Math.hypot(f.pos.x - mp.x, f.pos.z - mp.z), Tf = 1.4 + D / 80, g = 26;
          const aim = new V3().copy(f.pos).addScaledVector(f.vel, Tf * 0.3).addScaledVector(side, (k - 1) * step_);
          aim.x += (Math.random() - 0.5) * spr * 2; aim.z += (Math.random() - 0.5) * spr * 2; aim.y = groundAt(aim.x, aim.z, aim.y + 1);
          const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
          spawnShot({ p: mp, v, dmg: 40, team: 'E', kind: 'shell', splash: 8, life: Tf + 1, grav: g, label: 'howitzer' });
          G.fx.warn(aim, 8, Tf);
          G.fx.muzzle(mp, _d.copy(v).normalize(), 0xffa060, 3); G.fx.smoke(mp, 3, 2, 2, 0x8a8478, 1, 0.8);
          this.recoil = 1; G.artFired = (G.artFired || 0) + 1; sfx('artillery', G.player.pos.distanceTo(this.pos));
          if (!G.artSaid) { G.artSaid = true; G.onHint && G.onHint('远程炮击 · 地面红圈是落点 · 自走炮不需要视线，找到并摧毁它', 4); }
        } });
      }
    }
  }
}


// ------------------------------------------------------------------ Warden: tripod dome projector. Its dome stops everything the player fires
// from outside (shots break on the surface, other damage is absorbed); step inside, break the dome, or EMP the warden.
const _w1 = new V3(), _w2 = new V3();
const domeVS = 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vP = position; gl_Position = projectionMatrix * mv; }';
const domeFS = `uniform float t; uniform float fl; uniform float k; uniform vec3 col; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = pow(f, 2.2);
    float band = smoothstep(0.82, 1.0, fract(vP.y * 0.22 - t * 0.35));
    vec2 hx = vec2(atan(vP.z, vP.x) * 9.0, vP.y * 0.9); float grid = max(smoothstep(0.9, 1.0, abs(fract(hx.x) * 2.0 - 1.0)), smoothstep(0.9, 1.0, abs(fract(hx.y) * 2.0 - 1.0)));
    float base = smoothstep(1.2, 0.0, vP.y);
    float a = (0.035 + f * 0.5 + band * 0.12 + grid * 0.06 + base * 0.3) * (0.55 + 0.45 * k) + fl;
    gl_FragColor = vec4(col * a, 1.0); }`;
export function domeAt(p) {   // a live dome that contains point p
  for (const e of G.enemies) if (e.kind === 'warden' && e.domeOn() && p.distanceTo(e.pos) < e.R) return e;
  return null;
}
function domeEntry(w, a, b, out) {   // where segment a->b crosses the dome sphere (fallback: surface point toward b)
  _w1.subVectors(b, a); const L = _w1.length() || 1; _w1.divideScalar(L);
  _w2.subVectors(a, w.pos); const B = _w2.dot(_w1), C = _w2.lengthSq() - w.R * w.R, D = B * B - C;
  if (D >= 0) { const t = -B - Math.sqrt(D); if (t >= 0 && t <= L) return out.copy(a).addScaledVector(_w1, t); }
  return out.subVectors(b, w.pos).normalize().multiplyScalar(w.R).add(w.pos);
}
export class Warden extends Enemy {
  constructor(pos) {
    super('warden', 'E_Warden', pos, 620, 2.4); this.boom = 1.3;
    this.vel = new V3(); this.R = 15; this.maxDp = 1600 * G.diff.hp; this.dp = this.maxDp; this.down = 0; this.quiet = 0; this.pulseT = 2.5; this.warnT = 0; this.goalT = 0; this.goal = pos.clone();
    this.mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, fl: { value: 0 }, k: { value: 1 }, col: { value: new THREE.Color(0xffa63a).multiplyScalar(1.3) } },
      vertexShader: domeVS, fragmentShader: domeFS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(this.R, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), this.mat);
    this.dome.renderOrder = 2; this.dome.position.copy(pos); G.scene.add(this.dome);
    this.obj.scale.setScalar(1.3); this.c.set(pos.x, pos.y + 4, pos.z);
  }
  domeOn() { return this.alive && !this.dying && this.down <= 0 && !(this.stunT > 0); }
  absorb(dmg, at) {
    this.dp -= dmg; this.quiet = 0; this.mat.uniforms.fl.value = Math.min(0.5, this.mat.uniforms.fl.value + 0.12);
    G.stats.blocked = (G.stats.blocked || 0) + dmg; G.domeAbs = (G.domeAbs || 0) + dmg;
    if (at && Math.random() < 0.6) G.fx.sparks(at, _w1.subVectors(at, this.pos).normalize(), 4, 0xffc070, 12, 1, 0.25, 0.25);
    if (Math.random() < 0.2) sfx('shield', G.player.pos.distanceTo(this.pos));
    if (!G.domeSaid) { G.domeSaid = true; G.onHint && G.onHint('穹盾 · 从外面打不进去 · 冲进护罩内部，或击破护罩 / 用电磁脉冲瘫痪发生器', 4.5); }
    if (this.dp <= 0) {
      this.down = 8; this.dome.visible = false; sfx('shieldbreak', G.player.pos.distanceTo(this.pos));
      G.fx.flash(this.c, 0xffa040, 50, 40, 0.35); G.fx.ring(new V3(this.pos.x, this.pos.y + 0.4, this.pos.z), null, this.R, this.R + 6, 0.5, 0xffb050);
      for (let k = 0; k < 30; k++) { const a = Math.random() * 6.283, b = Math.random() * 1.4; G.fx.sparks(_w2.set(this.pos.x + Math.cos(a) * Math.cos(b) * this.R, this.pos.y + Math.sin(b) * this.R, this.pos.z + Math.sin(a) * Math.cos(b) * this.R), null, 2, 0xffc070, 8, 1, 0.5, 0.25); }
      G.domeBroken = (G.domeBroken || 0) + 1;
    }
  }
  remove() { super.remove(); this.dome.parent && this.dome.parent.remove(this.dome); }
  update(dt) {
    const pl = G.player, pc = pl.center(playerC);
    // drift toward the middle of the ground units it protects
    this.goalT -= dt;
    if (this.goalT <= 0) {
      this.goalT = 1.2; let n = 0, sx = 0, sz = 0, near = null, nd = 1e9;
      for (const e of G.enemies) {
        if (e === this || !e.alive || e.dying || e.kind === 'warden' || e.kind === 'drone' || e.kind === 'gunship' || e.kind === 'crawler' || e.kind === 'sapper' || e.kind === 'jammer' || e.kind === 'dropship' || e.kind === 'mender' || e.cloaked) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d < nd) { nd = d; near = e; }
        if (d < 70) { sx += e.pos.x; sz += e.pos.z; n++; }
      }
      if (n) this.goal.set(sx / n, 0, sz / n); else if (near) this.goal.set(near.pos.x, 0, near.pos.z);
    }
    let gx = this.goal.x - this.pos.x, gz = this.goal.z - this.pos.z; const gd = Math.hypot(gx, gz);
    let tx = 0, tz = 0;
    if (gd > 5) { tx = gx / gd * 4; tz = gz / gd * 4; }
    const dpx = this.pos.x - pl.pos.x, dpz = this.pos.z - pl.pos.z, pd = Math.hypot(dpx, dpz) || 1;
    if (pd < 9) { tx += dpx / pd * 3; tz += dpz / pd * 3; }   // shy of the player at point blank
    this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-1.5 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-1.5 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.x)); this.pos.z = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.z));
    if (collideCyl(this.pos, 2.4, 3)) this.vel.multiplyScalar(0.3);
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 2);
    this.c.set(this.pos.x, this.pos.y + 4, this.pos.z);
    this.n.E_WdRing.rotation.z += dt * (this.domeOn() ? 2.4 : 0.5);
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 4);
    this.n.E_WdCore.scale.setScalar(this.domeOn() ? 0.9 + pulse * 0.2 : 0.7);
    // dome: follows, regenerates after 2.5 s without hits, down for 8 s when broken
    this.dome.position.copy(this.pos);
    this.quiet += dt;
    if (this.down > 0) { this.down -= dt; if (this.down <= 0) { this.dp = this.maxDp * 0.6; G.fx.ring(new V3(this.pos.x, this.pos.y + 0.4, this.pos.z), null, 2, this.R, 0.5, 0xffb050); } }
    else if (this.quiet > 2.5) this.dp = Math.min(this.maxDp, this.dp + this.maxDp * 0.08 * dt);
    this.dome.visible = this.domeOn();
    const U = this.mat.uniforms; U.t.value = G.time; U.fl.value = Math.max(0, U.fl.value - dt * 1.6); U.k.value = this.dp / this.maxDp;
    // repulse pulse when the player stands inside its dome
    const inside = this.domeOn() && pl.alive && pl.pos.distanceTo(this.pos) < this.R;
    if (this.warnT > 0) {
      this.warnT -= dt;
      if (this.warnT <= 0 && this.alive) {
        G.fx.ring(new V3(this.pos.x, this.pos.y + 0.5, this.pos.z), null, 2, 13, 0.4, 0xffb050); G.fx.flash(this.c, 0xffa040, 20, 22, 0.15);
        sfx('emp', pd);
        for (const f of [pl, ...G.friends]) {
          if (!f || !f.alive) continue;
          const fx_ = f.pos.x - this.pos.x, fz = f.pos.z - this.pos.z, d = Math.hypot(fx_, fz) || 1;
          if (d > 13) continue;
          if (f === pl) { damagePlayer(26, this.c, 'warden-pulse'); pl.vel.x += fx_ / d * 26; pl.vel.z += fz / d * 26; pl.vel.y = Math.max(pl.vel.y, 7); }
          else if (f._ent) f._ent.hit(26, this.c, 'warden-pulse');
        }
      }
    } else if (inside && pd < 13) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) { this.pulseT = 3.2; this.warnT = 0.8; G.fx.warn(new V3(this.pos.x, this.pos.y, this.pos.z), 13, 0.8); }
    } else this.pulseT = Math.min(this.pulseT, 1.2);
  }
}

// Dropship: twin-fan VTOL. Flies in from outside the arena, picks a landing zone ~30 m from its target, descends,
// hovers 2.6 s with the bay open and releases its cargo (G.onDrop(pos, cargo, ds) spawns it), then climbs out and leaves
// (removed without a kill). Shot down with the cargo aboard, the cargo is lost, except a boss, who walks out of the wreck.
export class Dropship extends Enemy {
  constructor(pos, cargo, heavy) {
    super('dropship', 'E_Dropship', pos, heavy ? 3200 : 1500, 5.2); this.boom = 2;
    this.cargo = cargo; this.heavy = !!heavy; this.obj.scale.setScalar(heavy ? 1.9 : 1.55);
    this.vel = new V3(); this.st = 'in'; this.stT = 0; this.lz = null; this.ph = Math.random() * 6; this.sndT = 0; this.fall = false; this.gunT = 2;
    this.yaw = Math.atan2(pos.x, pos.z); this.c.copy(pos);
    if (heavy) recolor(this.obj, { EArmor: 0x5a4038, EArmor2: 0x342824 }, 'heavyDropship');
  }
  hit(dmg) {
    if (!this.alive || this.dying) return;
    this.hp -= dmg * (this.st === 'out' ? 0.5 : 1); this.flash = 0.08;
    if (this.hp <= 0) this.die();
  }
  die() {
    this.alive = false; this.dying = true; G.stats.kills++;
    this.full = !!this.cargo; G.onKill && G.onKill(this);
    this.fall = true; this.vel.y = Math.min(this.vel.y, 0); this.spinV = (Math.random() < 0.5 ? -1 : 1) * 1.6;
    G.fx.explosion(this.c, 1.6); sfx('bigboom', G.player.pos.distanceTo(this.pos));
  }
  pickLZ() {
    const f = this.tg(), b = f.pos;
    for (let i = 0; i < 40; i++) {
      const a = Math.atan2(this.pos.z - b.z, this.pos.x - b.x) + (Math.random() - 0.5) * 1.6, r = 26 + Math.random() * 16;
      const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
      if (Math.abs(x) > ARENA - 12 || Math.abs(z) > ARENA - 12) continue;
      if (pointInSolid(new V3(x, 1, z), 6) || groundAt(x, z, 99) > 0.5) continue;
      return new V3(x, 0, z);
    }
    return new V3(b.x * 0.8, 0, b.z * 0.8);
  }
  update(dt) {
    for (const k of ['L', 'R']) this.n['E_DFan' + k].rotation.y += dt * (this.fall ? 5 : 30) * (k === 'L' ? 1 : -1);
    const dist = G.player.pos.distanceTo(this.pos);
    this.sndT -= dt; if (this.sndT <= 0) { this.sndT = 0.13; if (dist < 110 && !this.fall) sfx('rotor', dist); }
    if (this.fall) {
      this.vel.y -= 14 * dt; this.pos.addScaledVector(this.vel, dt);
      this.obj.rotation.y += this.spinV * dt; this.obj.rotation.x += 0.25 * dt;
      G.fx.smoke(this.pos, 2, 2.6, 1.6, 0x2e2c2a, 1, 0.7);
      if (Math.random() < 0.5) G.fx.emit('add', { x: this.pos.x + (Math.random() - 0.5) * 4, y: this.pos.y, z: this.pos.z + (Math.random() - 0.5) * 4, life: 0.25, s0: 2.8, c0: 0xff8040 });
      if (this.pos.y <= groundAt(this.pos.x, this.pos.z, this.pos.y) + 1.5 || pointInSolid(this.pos)) {
        this.c.copy(this.pos); explodeAt(this.c, 11, 70, 'P', 2.6);
        if (this.cargo && this.cargo.boss) { const at = this.pos.clone(); at.y = 0; G.onDrop && G.onDrop(at, this.cargo, this, true); }
        this.remove();
      }
      return;
    }
    const spd = this.heavy ? 20 : 24;
    if (this.st === 'in') {
      if (!this.lz && Math.hypot(this.pos.x, this.pos.z) < ARENA + 20) this.lz = this.pickLZ();
      const tgt = this.lz || new V3(0, 0, 0);
      _a.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z); const L = _a.length();
      const ty = Math.max(38, groundAt(this.pos.x, this.pos.z, 99) + 22);
      _a.multiplyScalar(Math.min(spd, L * 0.6) / (L || 1)); _a.y = (ty - this.pos.y) * 0.8;
      this.vel.lerp(_a, 1 - Math.exp(-1.0 * dt));
      if (this.lz && L < 4) { this.st = 'down'; G.fx.warn(this.lz, 9, 5); G.onDropWarn && G.onDropWarn(this); }
    } else if (this.st === 'down') {
      const ty = this.lz.y + 13;
      _a.set((this.lz.x - this.pos.x) * 0.8, (ty - this.pos.y) * 1.1, (this.lz.z - this.pos.z) * 0.8);
      if (_a.y < -9) _a.y = -9;
      this.vel.lerp(_a, 1 - Math.exp(-2 * dt));
      if (Math.abs(this.pos.y - ty) < 1) { this.st = 'drop'; this.stT = 2.6; }
    } else if (this.st === 'drop') {
      _a.set((this.lz.x - this.pos.x) * 0.8, (this.lz.y + 13 - this.pos.y), (this.lz.z - this.pos.z) * 0.8);
      this.vel.lerp(_a, 1 - Math.exp(-3 * dt));
      this.stT -= dt;
      if (Math.random() < 0.6) G.fx.emit('smoke', { x: this.lz.x + (Math.random() - 0.5) * 10, y: 0.4, z: this.lz.z + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 8, vy: 0.5, vz: (Math.random() - 0.5) * 8, life: 0.9, s0: 1.5, s1: 4, c0: 0xb0a898, c1: 0x908878, a0: 0.35, drag: 2 });
      if (this.stT <= 0) {
        const at = this.lz.clone(); G.onDrop && G.onDrop(at, this.cargo, this, false); this.cargo = null;
        this.n.E_DPod.visible = false; this.st = 'out'; this.exitA = Math.atan2(this.pos.z, this.pos.x);
        G.fx.ring(new V3(at.x, 0.3, at.z), null, 2, 12, 0.6, 0xd8cfc0); sfx('land', G.player.pos.distanceTo(at));
      }
    } else {   // out: climb and leave
      _a.set(Math.cos(this.exitA) * spd * 1.2, 10, Math.sin(this.exitA) * spd * 1.2);
      this.vel.lerp(_a, 1 - Math.exp(-0.8 * dt));
      if (Math.hypot(this.pos.x, this.pos.z) > ARENA + 60) { this.alive = false; this.remove(); return; }
    }
    this.pos.addScaledVector(this.vel, dt);
    if (this.st !== 'out') { const s_ = pointInSolid(this.pos, 4); if (s_) { this.pos.y = s_.max.y + 5; this.vel.y = Math.max(this.vel.y, 4); } }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 2) this.yaw += angDiff(Math.atan2(-this.vel.x, -this.vel.z), this.yaw) * Math.min(1, dt * 1.2);
    this.obj.rotation.y = this.yaw;
    this.obj.rotation.x = -Math.min(0.25, sp * 0.01);
    this.c.set(this.pos.x, this.pos.y - (this.cargo ? 1 : 0), this.pos.z);
    // door gun while hovering
    if ((this.st === 'drop' || this.st === 'down') && dist < 90) {
      this.gunT -= dt;
      if (this.gunT <= 0 && this.checkLos(dt)) {
        this.gunT = 0.5;
        const mp = this.c.clone().setY(this.pos.y - 1.5);
        const aim = lead(mp, 160, new V3());
        const v = aim.sub(mp).normalize().add(new V3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05)).normalize().multiplyScalar(160);
        spawnShot({ p: mp, v, dmg: 7, team: 'E', kind: 'ebullet', color: 0xff8a50, w: 0.25, len: 6, label: 'dropship-gun' });
        sfx('eshot', dist);
      }
    }
  }
}

export function dropRepair(pos) {
  if (G.noRepair) return;
  const o = cloneKit('P_Repair'); o.position.copy(pos); o.position.y = Math.max(1.5, groundAt(pos.x, pos.z, pos.y) + 1.5);
  G.scene.add(o);
  G.pickups.push({ o, t: 0 });
}

export function updateCombat(dt) {
  for (let i = G.queue.length - 1; i >= 0; i--) { const q = G.queue[i]; q.t -= dt; if (q.t <= 0) { G.queue.splice(i, 1); G.curLabel = q.label; q.fn(); } }
  for (const e of G.enemies) {
    G.curLabel = e.kind;
    if (e.stunT > 0 && e.alive && !e.dying) {
      e.stunT -= dt;
      if (Math.random() < 0.3) G.fx.sparks(_a.copy(e.c).add(_b.set((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 3)), null, 2, 0x9fe0ff, 7, 0.9, 0.3, 0.18);
      if (e.flash > 0) e.flash -= dt;
      continue;
    }
    G.curShooter = e; e.update(e.chill > 0 ? dt * (1 - 0.4 * e.chill / 100) : dt); G.curShooter = null;
    if (e.flash > 0) e.flash -= dt;
  }
  const pp = G.player; G.jammed = null;
  if (pp && pp.alive) for (const e of G.enemies) if (e.kind === 'jammer' && e.alive && !e.dying && !(e.stunT > 0) && e.c.distanceTo(pp.pos) < JAM_R) { G.jammed = e; break; }
  if (G.jammed && !G.jamSaid) { G.jamSaid = true; G.onHint && G.onHint('电子干扰 · 锁定与雷达失效 · 击落紫色的干扰机，或用电磁脉冲瘫痪它', 4); }
  for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].gone) G.enemies.splice(i, 1);
  G.curLabel = null;
  updateBurning(dt);
  updateChill(dt);
  if (LAVA.on) updateForge(dt);
  for (const m of G.mines) if (m.alive) m.update(dt);
  for (let i = G.mines.length - 1; i >= 0; i--) if (!G.mines[i].alive) G.mines.splice(i, 1);
  G.curLabel = null;
  updateMinis(dt);
  updateDecoys(dt);
  updateWells(dt);
  updateStrikes(dt);
  updateShots(dt);
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i]; k.t += dt;
    k.o.rotation.y += dt * 2; k.o.position.y += Math.sin(k.t * 3) * dt * 0.5;
    if (k.t > 25) { G.scene.remove(k.o); G.pickups.splice(i, 1); continue; }
    const p = G.player;
    if (p && p.alive && Math.hypot(k.o.position.x - p.pos.x, k.o.position.z - p.pos.z) < 4 && Math.abs(k.o.position.y - p.pos.y - 2) < 5) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); sfx('repair');
      G.fx.ring(p.pos, null, 1, 6, 0.4, 0x50ff90);
      G.scene.remove(k.o); G.pickups.splice(i, 1);
      G.onPickup && G.onPickup();
    }
  }
}
