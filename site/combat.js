// Weapons, projectiles, enemies, damage.  Shared state lives in G.
import * as THREE from 'three';
import { barrels, raySolids, clearLine, collideCyl, groundAt, removeSolid, pointInSolid, addSolid, ARENA } from './world.js';
import { cloneKit, nodes } from './kit.js';
import { Mech, angDiff } from './mech.js';
import { sfx } from './audio.js';

const V3 = THREE.Vector3;
export const G = {
  scene: null, fx: null, camera: null, player: null, boss: null,
  enemies: [], shots: [], pickups: [], beams: [], queue: [],
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
  missile: { slot: 'shoulder', name: 'MS-6 飞弹巢', en: 'MS-6 Missile Pods', desc: '多重锁定 · 6 发追踪', type: 'missile', count: 6, dmg: 40, splash: 5, cd: 6.5, sfx: 'missile' },
  cannon: { slot: 'shoulder', name: 'PC-2 等离子炮', en: 'PC-2 Plasma Cannon', desc: '大范围爆炸 · 弹速慢', type: 'plasma', dmg: 165, splash: 9, speed: 105, cd: 3.4, sfx: 'cannon' },
  laser: { slot: 'shoulder', name: 'LZ-1 光束炮', en: 'LZ-1 Beam Laser', desc: '持续照射 2.2 秒', type: 'beam', dps: 135, dur: 2.2, range: 150, cd: 7.5, sfx: 'laser' },
  shield: { slot: 'shoulder', name: 'AS-3 能量护盾', en: 'AS-3 Aegis Shield', desc: '展开 3 秒 · 正面伤害 −85%', type: 'shield', dur: 3, cd: 9, block: 0.85, arc: 0.15, sfx: 'shield' },
};
export const ARM_KEYS = ['rifle', 'gatling', 'shotgun', 'coil', 'rail', 'blade'];
export const SHOULDER_KEYS = ['missile', 'cannon', 'laser', 'shield'];

export function weaponState(key) {
  const d = WEAPONS[key];
  return { key, d, ammo: d.mag || 0, reloadT: 0, cd: 0, spin: 0, chargeT: 0, wasHeld: false, beamT: 0, sndT: 0, fired: 0, windT: 0, side: 1 };
}

const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3();

// ------------------------------------------------------------------ entities for hit tests
function entsFor(team) {
  const out = [];
  if (team === 'P') {
    for (const e of G.enemies) if (e.alive && !e.dying) out.push(e);
    for (const b of barrels) if (!b.dead) out.push(b.ent || (b.ent = { isBarrel: true, b, c: b.pos, r: 1.5, get alive() { return !b.dead; }, hit: (dmg) => hitBarrel(b, dmg) }));
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
export function enemyEnts() { return entsFor('P').filter((e) => !e.isBarrel); }

// ------------------------------------------------------------------ damage
function dealDamage(ent, dmg, team, at, label) {
  if (!ent.alive) return;
  ent.hit(dmg, at, label || G.curLabel);
  if (team === 'P' && !ent.isBarrel && !isAlly(label || G.curLabel)) { G.stats.hits++; G.stats.dmgDealt += dmg; G.hud.hit = 0.14; }
}

const isAlly = (l) => !!l && l.startsWith('ally');
function damagePlayer(dmg, src, label) {
  const p = G.player; if (!p || !p.alive || G.godMode) return;
  const blk = shieldBlock(p, src || G.curSrc);
  if (blk) { G.stats.blocked = (G.stats.blocked || 0) + dmg * blk; if (Math.random() < 0.3) sfx('shield', 0); }
  const d = dmg * G.diff.dmg * p.frame.armor * (1 - blk);
  G.dmgLog = G.dmgLog || {}; G.dmgLog[label || '?'] = (G.dmgLog[label || '?'] || 0) + d;
  p.hit(d); G.stats.dmgTaken += d; G.hud.hurt = Math.min(1, G.hud.hurt + d / 120);
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
    label: o.label || G.curLabel || o.kind, color: o.color ?? 0xffd27a, w: o.w ?? 0.2, len: o.len ?? 6, target: o.target || null, aim: o.aim ? o.aim.clone() : null, age: 0, speed: o.v.length(), maxSpeed: o.maxSpeed || 0, size: o.size || 1, turn: o.turn || 5.5, grav: o.grav ?? 6 };
  G.shots.push(s);
  return s;
}

function impact(s, at, ent) {
  const fx = G.fx; G.curLabel = s.label;
  if (s.kind === 'missile') explodeAt(at, s.splash, s.dmg, s.team, 0.7);
  else if (s.kind === 'plasma') explodeAt(at, s.splash, s.dmg, s.team, 1.5, 0xff8a30);
  else if (s.kind === 'shell') explodeAt(at, s.splash, s.dmg, s.team, 0.55, 0xff7040);
  else {
    if (ent) dealDamage(ent, s.dmg, s.team, at);
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
    } else if (s.kind === 'shell') {
      s.v.y -= s.grav * dt;
      fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.12, s0: 1.2, s1: 0.4, c0: 0xff8050 });
    } else if (s.kind === 'plasma') {
      fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.06, s0: 4.2, c0: 0xffb060 });
      fx.emit('add', { x: s.x, y: s.y, z: s.z, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, life: 0.35, s0: 1.6, s1: 0.2, c0: 0xff9040 });
    }
    _a.set(s.x, s.y, s.z);
    _b.set(s.x + s.v.x * dt, s.y + s.v.y * dt, s.z + s.v.z * dt);
    // vs entities
    const h = segHit(_a, _b, s.team === 'P' ? entsP : entsE, s.kind === 'plasma' ? 0.6 : 0);
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
      if (s.kind === 'missile' || s.kind === 'plasma') impact(s, _b.clone(), null);
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
        for (let k = 0; k < n; k++) {
          _d.subVectors(aim, mp).normalize();
          const spr = n > 1 ? d.spread * (isP ? 1 : 1.3) : d.spread * (isP ? 2 : 6);
          _d.x += (Math.random() - 0.5) * spr; _d.y += (Math.random() - 0.5) * spr; _d.z += (Math.random() - 0.5) * spr;
          _d.normalize();
          spawnShot({ p: mp, v: _d.clone().multiplyScalar(d.speed * (n > 1 ? 0.9 + Math.random() * 0.2 : 1)), dmg: d.dmg * dmgMul, team, kind: isP ? 'bullet' : 'ebullet', color: isP ? d.color : 0xff6a40, w: d.w, len: d.len, life: d.life || 1.6 });
        }
        if (n > 1 && me) fx.trauma = Math.min(1, fx.trauma + 0.12);
        fx.muzzle(mp, _d, isP ? 0xffd27a : 0xff8a50, n > 1 ? 1.9 : d.spinUp ? 0.9 : 1.1);
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
    const w = f === G.player ? 1 : (self.kind === 'drone' || self.kind === 'gunship' ? f.foeWAir ?? f.foeW : f.foeW) ?? 1.15;
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
    const fx_ = dx / dist, fz = dz / dist;
    const sw = this.slideT > 0 ? 1.2 : 0.6;
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
    const fx_ = dx / dist, fz = dz / dist;
    const sw = this.slideT > 0 ? 1.2 : 0.4;
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
    const mx = fx_ * fwd + -fz * A.strafe, mz = fz * fwd + fx_ * A.strafe;
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
export function dropRepair(pos) {
  const o = cloneKit('P_Repair'); o.position.copy(pos); o.position.y = Math.max(1.5, groundAt(pos.x, pos.z, pos.y) + 1.5);
  G.scene.add(o);
  G.pickups.push({ o, t: 0 });
}

export function updateCombat(dt) {
  for (let i = G.queue.length - 1; i >= 0; i--) { const q = G.queue[i]; q.t -= dt; if (q.t <= 0) { G.queue.splice(i, 1); G.curLabel = q.label; q.fn(); } }
  for (const e of G.enemies) {
    G.curLabel = e.kind;
    e.update(dt);
    if (e.flash > 0) e.flash -= dt;
  }
  for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].gone) G.enemies.splice(i, 1);
  G.curLabel = null;
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
