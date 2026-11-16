// Weapons, projectiles, enemies, damage.  Shared state lives in G.
import * as THREE from 'three';
import { barrels, raySolids, clearLine, collideCyl, groundAt, removeSolid, pointInSolid, ARENA } from './world.js';
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
};

export const WEAPONS = {
  rifle: { slot: 'arm', name: 'AR-77 突击步枪', en: 'AR-77 Rifle', desc: '全自动 · 精准 · 均衡', type: 'bullet', rate: 0.1, dmg: 17, speed: 320, spread: 0.005, mag: 40, reload: 1.7, color: 0xffd27a, w: 0.22, len: 7, sfx: 'rifle', recoil: 0.18 },
  gatling: { slot: 'arm', name: 'GX-6 加特林', en: 'GX-6 Gatling', desc: '需预转 · 高射速 · 散布大', type: 'bullet', rate: 0.042, spinUp: 0.45, dmg: 8.5, speed: 290, spread: 0.022, mag: 200, reload: 3.0, color: 0xffb860, w: 0.18, len: 6, sfx: 'gatling', recoil: 0.08 },
  coil: { slot: 'arm', name: 'LC-3 闪电线圈', en: 'LC-3 Arc Coil', desc: '自动索敌 · 连锁 3 个目标', type: 'chain', rate: 0.5, dmg: 44, range: 60, chains: 3, chainR: 18, mag: 14, reload: 2.2, sfx: 'coil', recoil: 0.3 },
  rail: { slot: 'arm', name: 'RG-9 磁轨炮', en: 'RG-9 Railgun', desc: '按住蓄力 · 松开贯穿', type: 'charge', charge: 1.1, dmg: [45, 280], rate: 0.6, mag: 6, reload: 2.6, sfx: 'rail', recoil: 0.9 },
  missile: { slot: 'shoulder', name: 'MS-6 飞弹巢', en: 'MS-6 Missile Pods', desc: '多重锁定 · 6 发追踪', type: 'missile', count: 6, dmg: 40, splash: 5, cd: 6.5, sfx: 'missile' },
  cannon: { slot: 'shoulder', name: 'PC-2 等离子炮', en: 'PC-2 Plasma Cannon', desc: '大范围爆炸 · 弹速慢', type: 'plasma', dmg: 165, splash: 9, speed: 105, cd: 3.4, sfx: 'cannon' },
  laser: { slot: 'shoulder', name: 'LZ-1 光束炮', en: 'LZ-1 Beam Laser', desc: '持续照射 2.2 秒', type: 'beam', dps: 135, dur: 2.2, range: 150, cd: 7.5, sfx: 'laser' },
};
export const ARM_KEYS = ['rifle', 'gatling', 'coil', 'rail'];
export const SHOULDER_KEYS = ['missile', 'cannon', 'laser'];

export function weaponState(key) {
  const d = WEAPONS[key];
  return { key, d, ammo: d.mag || 0, reloadT: 0, cd: 0, spin: 0, chargeT: 0, wasHeld: false, beamT: 0, sndT: 0, fired: 0 };
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
  if (team === 'P' && !ent.isBarrel) { G.stats.hits++; G.stats.dmgDealt += dmg; G.hud.hit = 0.14; }
}

function damagePlayer(dmg, src, label) {
  const p = G.player; if (!p || !p.alive || G.godMode) return;
  const d = dmg * G.diff.dmg * p.frame.armor;
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
    label: o.label || G.curLabel || o.kind, color: o.color ?? 0xffd27a, w: o.w ?? 0.2, len: o.len ?? 6, target: o.target || null, aim: o.aim ? o.aim.clone() : null, age: 0, speed: o.v.length(), maxSpeed: o.maxSpeed || 0, size: o.size || 1 };
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
        const turn = Math.min(1, (5.5 * dt) / Math.max(ang, 1e-3));
        _b.lerp(_a, turn).normalize();
        s.speed = Math.min(s.maxSpeed, s.speed + 120 * dt);
        s.v.copy(_b).multiplyScalar(s.speed);
      } else s.v.y -= 12 * dt;
      fx.emit('smoke', { x: s.x, y: s.y, z: s.z, vx: (Math.random() - 0.5), vy: 0.5, vz: (Math.random() - 0.5), life: 0.9, s0: 0.6, s1: 2.2, c0: 0xc8c6c0, c1: 0xa09e98, a0: 0.5, drag: 2 });
      fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.05, s0: 1.3, c0: 0xffc070 });
    } else if (s.kind === 'shell') {
      s.v.y -= 6 * dt;
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
  const isP = team === 'P';
  const dist = G.player ? G.player.pos.distanceTo(owner.pos) : 0;
  ws.cd = Math.max(0, ws.cd - dt);
  if (ws.reloadT > 0) {
    ws.reloadT -= dt;
    if (ws.reloadT <= 0) { ws.ammo = d.mag; if (isP) sfx('reload'); }
  }
  const pressed = held && !ws.wasHeld, released = !held && ws.wasHeld;
  ws.wasHeld = held;
  const enemyTeam = isP ? 'P' : 'E';
  const startReload = () => { if (d.mag && ws.reloadT <= 0) ws.reloadT = d.reload; };

  if (d.type === 'bullet') {
    if (d.spinUp) {
      ws.spin = Math.max(0, Math.min(1, ws.spin + (held && ws.reloadT <= 0 ? dt / d.spinUp : -dt / 0.8)));
      mslot.spinV = ws.spin * 32;
      if (pressed && isP) sfx('spin');
    }
    if (held && ws.reloadT <= 0 && (!d.spinUp || ws.spin >= 1)) {
      while (ws.cd <= 0 && ws.ammo > 0) {
        ws.cd += d.rate; ws.ammo--;
        const mp = owner.muzzlePos(slot, _a);
        _d.subVectors(aim, mp).normalize();
        const spr = d.spread * (isP ? 2 : 6);
        _d.x += (Math.random() - 0.5) * spr; _d.y += (Math.random() - 0.5) * spr; _d.z += (Math.random() - 0.5) * spr;
        _d.normalize();
        spawnShot({ p: mp, v: _d.clone().multiplyScalar(d.speed), dmg: d.dmg * dmgMul, team, kind: isP ? 'bullet' : 'ebullet', color: isP ? d.color : 0xff6a40, w: d.w, len: d.len, life: 1.6 });
        fx.muzzle(mp, _d, isP ? 0xffd27a : 0xff8a50, d.spinUp ? 0.9 : 1.1);
        mslot.recoil = Math.min(0.5, (mslot.recoil || 0) + d.recoil);
        if (isP) G.stats.shots++;
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
      if (isP) G.stats.shots++;
      sfx('coil', dist);
      if (ws.ammo <= 0) startReload();
    }
  } else if (d.type === 'charge') {
    if (held && ws.cd <= 0 && ws.reloadT <= 0 && ws.ammo > 0) {
      if (ws.chargeT === 0 && isP) sfx('charge');
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
      if (isP) { G.stats.shots++; fx.trauma = Math.min(1, fx.trauma + 0.15 + k * 0.25); }
      sfx('rail', dist);
      if (ws.ammo <= 0) startReload();
    }
    if (!held && ws.chargeT > 0 && ws.chargeT <= 0.12) ws.chargeT = 0;
  } else if (d.type === 'missile') {
    if (pressed && ws.cd <= 0) {
      ws.cd = d.cd;
      const tg = locks && locks.length ? locks : (target ? [target] : []);
      for (let i = 0; i < d.count; i++) G.queue.push({ label: G.curLabel, t: i * 0.07, fn: () => {
        if (!owner.alive) return;
        const k = i % 2; const mp = owner.muzzlePos(slot, _a, k).clone();
        const fwd = new V3(-Math.sin(owner.aimYaw), 0, -Math.cos(owner.aimYaw));
        const v = fwd.multiplyScalar(26).add(new V3((Math.random() - 0.5) * 10, 14 + Math.random() * 6, (Math.random() - 0.5) * 10));
        spawnShot({ p: mp, v, dmg: d.dmg * dmgMul, team, kind: 'missile', splash: d.splash, target: tg.length ? tg[i % tg.length] : null, aim, life: 4, maxSpeed: 95 });
        fx.muzzle(mp, v.clone().normalize(), 0xffc070, 0.8);
        owner.slots.S.recoil = 0.4;
        sfx('missile', dist);
      } });
      if (isP) G.stats.shots += d.count;
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
      if (isP) G.stats.shots += 2;
    }
  } else if (d.type === 'beam') {
    if (pressed && ws.cd <= 0) { ws.cd = d.cd; ws.beamT = d.dur; if (isP) G.stats.shots++; }
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

// ------------------------------------------------------------------ enemies
const playerC = new V3();
function lead(from, speed, out) {
  const p = G.player; p.center(playerC);
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
  checkLos(dt) {
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.3 + Math.random() * 0.2; this.los = clearLine(this.c, G.player.center(playerC)); }
    return this.los;
  }
}

export class Turret extends Enemy {
  constructor(pos) { super('turret', 'E_Turret', pos, 240, 2.1); this.boom = 1.1; this.burst = 0; this.burstT = 0; this.c.set(pos.x, pos.y + 1.8, pos.z); }
  update(dt) {
    const p = G.player; const pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const Y = this.n.E_TYaw; Y.rotation.y += angDiff(yaw, Y.rotation.y) * Math.min(1, dt * 2.4);
    const pitch = Math.atan2(pc.y - this.c.y, dist);
    this.n.E_TPitch.rotation.x = -pitch;
    if (dist < 125 && this.checkLos(dt)) {
      this.fireT -= dt;
      if (this.fireT <= 0) { this.burst = 5; this.burstT = 0; this.fireT = 2.2 + Math.random(); }
    }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burst--; this.burstT = 0.12;
        const mp = this.n.Muzzle_Turret.getWorldPosition(_a).clone();
        const aim = lead(mp, 140, _b);
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
    const p = G.player, pc = p.center(playerC);
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
    this.obj.rotation.y = Math.atan2(pc.x - this.pos.x, pc.z - this.pos.z);
    this.obj.rotation.x = this.vel.z * 0.01; this.obj.rotation.z = -this.vel.x * 0.01;
    this.c.copy(this.pos);
    if (this.checkLos(dt) && this.pos.distanceTo(pc) < 90) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 1.6 + Math.random() * 0.8;
        for (let k = 0; k < 2; k++) G.queue.push({ label: G.curLabel, t: k * 0.14, fn: () => {
          if (!this.alive) return;
          const mp = this.n.Muzzle_Drone.getWorldPosition(_a).clone();
          const aim = lead(mp, 150, _b);
          _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.05; _d.z += (Math.random() - 0.5) * 0.05;
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(150), dmg: 6, team: 'E', kind: 'ebullet', color: 0xff5040, w: 0.26, len: 5 });
          G.fx.muzzle(mp, _d, 0xff7050, 0.7); sfx('eshot', this.pos.distanceTo(G.player.pos));
        } });
      }
    }
  }
}

export class Walker extends Enemy {
  constructor(pos) {
    super('walker', 'E_Walker', pos, 700, 2.8); this.boom = 1.4;
    this.vel = new V3(); this.ph = Math.random() * 6; this.strafe = Math.random() < 0.5 ? 1 : -1; this.stT = 3; this.yaw = 0;
  }
  update(dt) {
    const p = G.player, pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz);
    const toward = dist > 42 ? 1 : dist < 26 ? -0.7 : 0;
    this.stT -= dt; if (this.stT <= 0) { this.stT = 3 + Math.random() * 3; this.strafe *= -1; }
    const fx_ = dx / dist, fz = dz / dist;
    const tx = (fx_ * toward + -fz * this.strafe * 0.6) * 5.5, tz = (fz * toward + fx_ * this.strafe * 0.6) * 5.5;
    this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-2 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-2 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 2.8, 4)) this.strafe *= -1, this.stT = 2;
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 2);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.ph += dt * (1.5 + sp * 0.9);
    const body = this.n.E_WBody;
    this.yaw += angDiff(Math.atan2(this.vel.x, this.vel.z) || this.yaw, this.yaw) * Math.min(1, dt * 1.5) * (sp > 0.5 ? 1 : 0);
    this.obj.rotation.y = this.yaw;
    body.position.y = 2.2 + Math.sin(this.ph * 2) * 0.08 * Math.min(1, sp / 3);
    for (let i = 1; i <= 4; i++) {
      const o = (i === 1 || i === 4) ? 0 : Math.PI, s = Math.sin(this.ph + o);
      this.n['E_Leg' + i].rotation.y = s * 0.25 * Math.min(1, sp / 3);
      this.n['E_Knee' + i].rotation.z = Math.max(0, Math.cos(this.ph + o)) * 0.25 * Math.min(1, sp / 3);
    }
    const gy = Math.atan2(dx, dz) - this.yaw;
    const gun = this.n.E_WGun; gun.rotation.y += angDiff(gy, gun.rotation.y) * Math.min(1, dt * 2);
    this.c.set(this.pos.x, this.pos.y + 2.4, this.pos.z);
    if (dist < 110 && this.checkLos(dt)) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 2.1 + Math.random() * 0.8;
        for (let k = 0; k < 3; k++) G.queue.push({ label: G.curLabel, t: k * 0.3, fn: () => {
          if (!this.alive) return;
          const mp = this.n.Muzzle_Walker.getWorldPosition(_a).clone();
          const aim = lead(mp, 95, _b);
          const dd = mp.distanceTo(aim);
          _d.subVectors(aim, mp).normalize(); _d.y += dd * 0.00055 * 4.5; _d.x += (Math.random() - 0.5) * 0.03; _d.z += (Math.random() - 0.5) * 0.03;
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(95), dmg: 30, team: 'E', kind: 'shell', splash: 5.5, life: 3.5 });
          G.fx.muzzle(mp, _d, 0xff9050, 1.6); sfx('eshell', dist);
        } });
      }
    }
  }
}

// Boss: an enemy mech run by the same Mech physics + weapons as the player.
export class Boss {
  constructor(pos, ctx) {
    this.kind = 'boss'; this.r = 3.3; this.c = new V3(); this.alive = true; this.dying = false; this.flash = 0;
    this.mech = new Mech(G.scene, ctx, { palette: 'tyrant', frame: 'heavy', scale: 1.35, isBoss: true, loadout: { R: 'gatling', L: 'rifle', S: 'cannon' }, yaw: Math.PI });
    this.mech.pos.copy(pos);
    this.maxHp = 5200 * G.diff.hp; this.hp = this.maxHp; this.phase = 1;
    this.ws = { R: weaponState('gatling'), L: weaponState('rifle'), S: weaponState('cannon') };
    this.ai = { t: 0, strafe: 1, qbT: 2, jumpT: 4, hover: 0, burst: 0, burstT: 0, sT: 3, railT: 0 };
    this.pos = this.mech.pos;
    G.enemies.push(this);
  }
  hit(dmg) {
    if (!this.alive) return;
    this.hp -= dmg; this.mech.flinch = Math.min(1, this.mech.flinch + dmg / 300);
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2; this.mech.mount({ R: 'gatling', L: 'coil', S: 'laser' });
      this.ws.L = weaponState('coil'); this.ws.S = weaponState('laser'); this.ws.S.cd = 2;
      G.onBossPhase && G.onBossPhase(this);
    }
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.dying = true; this.deathT = 2.2; G.stats.kills++; G.onKill && G.onKill(this); }
  }
  update(dt) {
    const m = this.mech, p = G.player, A = this.ai;
    this.c.set(m.pos.x, m.pos.y + 3.6, m.pos.z);
    if (this.dying) {
      this.deathT -= dt;
      if (Math.random() < 0.25) explodeAt(_a.set(this.c.x + (Math.random() - 0.5) * 5, this.c.y + (Math.random() - 0.5) * 5, this.c.z + (Math.random() - 0.5) * 5).clone(), 0, 0, 'P', 0.6);
      m.update(dt, { mx: 0, mz: 0, aimYaw: m.aimYaw, aimPitch: -0.4 });
      if (this.deathT <= 0) { explodeAt(this.c.clone(), 14, 0, 'P', 3.2); m.dispose(); this.gone = true; }
      return;
    }
    const pc = p.center(playerC);
    const dx = pc.x - m.pos.x, dz = pc.z - m.pos.z, dist = Math.hypot(dx, dz);
    const aimYaw = Math.atan2(-dx, -dz);
    const aimPitch = Math.atan2(pc.y - this.c.y, dist);
    A.sT -= dt; if (A.sT <= 0) { A.sT = 2 + Math.random() * 3; A.strafe = Math.random() < 0.5 ? 1 : -1; }
    const want = this.phase === 1 ? 45 : 32;
    const fwd = dist > want + 12 ? 1 : dist < want - 12 ? -1 : 0;
    const fx_ = dx / dist, fz = dz / dist;
    let mx = fx_ * fwd + -fz * A.strafe, mz = fz * fwd + fx_ * A.strafe;
    A.qbT -= dt; const qb = A.qbT <= 0 && m.en > 40; if (qb) A.qbT = (this.phase === 1 ? 2.8 : 1.8) + Math.random() * 2;
    A.jumpT -= dt; let jump = false;
    if (A.jumpT <= 0 && m.grounded) { A.jumpT = 5 + Math.random() * 4; jump = true; A.hover = 1.2 + Math.random(); }
    A.hover -= dt;
    m.update(dt, { mx, mz, boost: m.en > 30 && (dist > want + 20 || this.phase === 2), qboost: qb, jump, hover: A.hover > 0, aimYaw, aimPitch });
    // weapons
    const ent = p._ent; const aim = lead(this.c, 200, _c).clone();
    aim.x += (Math.random() - 0.5) * 2.5; aim.y += (Math.random() - 0.5) * 2; aim.z += (Math.random() - 0.5) * 2.5;
    const los = clearLine(this.c, pc) && dist < 140;
    A.burstT -= dt; if (A.burstT <= 0) { A.burst = A.burst > 0 ? 0 : 1; A.burstT = A.burst ? 1.4 + Math.random() : 1 + Math.random() * 1.5; }
    const mul = 0.32;
    G.curLabel = 'boss-' + this.ws.R.key;
    weaponTick(dt, m, 'R', this.ws.R, los && A.burst > 0, aim, ent, 'E', null, mul);
    G.curLabel = 'boss-' + this.ws.L.key;
    weaponTick(dt, m, 'L', this.ws.L, los && A.burst === 0 && Math.random() < 0.6, aim, ent, 'E', null, this.phase === 2 ? 0.3 : 0.35);
    G.curLabel = 'boss-' + this.ws.S.key;
    weaponTick(dt, m, 'S', this.ws.S, los && this.ws.S.cd <= 0 && Math.random() < 0.02, aim, ent, 'E', null, this.phase === 2 ? 0.45 : 0.6);
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
