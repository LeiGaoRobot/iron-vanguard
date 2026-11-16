// Friendly units: the AI wingman mech and the reactor core (defense mission).
// Both register in G.friends so enemies can pick them as targets (see pickTarget in combat.js).
import * as THREE from 'three';
import { G, weaponState, weaponTick, explodeAt } from './combat.js';
import { Mech } from './mech.js';
import { clearLine, addSolid, removeSolid } from './world.js';
import { cloneKit, nodes } from './kit.js';
import { sfx } from './audio.js';

const V3 = THREE.Vector3;
const _a = new V3(), _b = new V3();

// ------------------------------------------------------------------ wingman
export const WING = { loadout: { R: 'rifle', L: 'coil', S: 'missile' }, hpMul: 0.8, dmgMul: 0.5, armor: 0.75, respawn: 30 };

export class Wingman {
  constructor(scene, ctx, palette) {
    this.scene = scene; this.ctx = ctx; this.palette = palette;
    this.foeW = 0.95;   // enemies pick it about as often as the player
    this.spawn(G.player.pos);
  }
  spawn(near) {
    if (this.mech) this.mech.dispose();
    this.mech = new Mech(this.scene, this.ctx, { palette: this.palette, frame: 'std', loadout: WING.loadout, yaw: G.player ? G.player.aimYaw : 0, hpMul: WING.hpMul });
    this.mech.isAlly = true;
    this.mech.pos.set(near.x + 10, near.y, near.z + 6);
    this.pos = this.mech.pos; this.vel = this.mech.vel;
    this.ws = { R: weaponState(WING.loadout.R), L: weaponState(WING.loadout.L), S: weaponState(WING.loadout.S) };
    this.ai = { tgt: null, tgT: 0, los: false, losT: 0, strafe: 1, sT: 2, jT: 3, hover: 0, side: Math.random() < 0.5 ? 1 : -1, last: new V3().copy(this.pos), stuckT: 0 };
    this.downT = 0;
    this._ent = { isAlly: true, c: new V3(), r: 2.1, get alive() { return !!this.w && this.w.alive; }, w: this, hit: (d) => this.damage(d) };
  }
  get alive() { return !!this.mech && this.mech.alive && this.downT <= 0; }
  get hp() { return this.mech ? this.mech.hp : 0; }
  get maxHp() { return this.mech ? this.mech.maxHp : 1; }
  center(out) { return this.mech.center(out); }
  damage(d) {
    if (!this.alive || G.godMode) return;
    this.mech.hit(d * G.diff.dmg * WING.armor);
    if (!this.mech.alive) {
      this.downT = WING.respawn;
      G.fx.explosion(this.mech.center(_a), 2.2, 0xff8040); sfx('bigboom', G.player.pos.distanceTo(this.pos));
      this.mech.root.visible = false;
      G.onAllyDown && G.onAllyDown(this);
    }
  }
  repair(k) { if (this.alive) this.mech.hp = Math.min(this.mech.maxHp, this.mech.hp + this.mech.maxHp * k); }
  pickTarget() {
    const A = this.ai, p = G.player;
    if (A.tgt && A.tgt.alive && !A.tgt.dying && G.time < A.tgT) return A.tgt;
    A.tgT = G.time + 1.2;
    let best = null, bs = 1e9;
    for (const e of G.enemies) {
      if (!e.alive || e.dying) continue;
      const d = e.c.distanceTo(this.pos);
      if (d > 150) continue;
      // stay useful: favour what is near the player (and near the core when there is one)
      let sc = d + 0.5 * e.c.distanceTo(p.pos) + (e.kind === 'boss' ? 20 : 0);
      if (G.core && G.core.alive) sc = Math.min(sc, d + 0.6 * e.c.distanceTo(G.core.pos));
      if (sc < bs) { bs = sc; best = e; }
    }
    A.tgt = best; A.losT = 0;
    return best;
  }
  update(dt) {
    if (!this.mech) return;
    if (this.downT > 0) {
      this.downT -= dt;
      if (this.downT <= 0 && G.player.alive) { this.spawn(G.player.pos); G.onAllyBack && G.onAllyBack(this); }
      return;
    }
    const m = this.mech, A = this.ai, p = G.player;
    const t = this.pickTarget();
    const c = m.center(_a).clone();
    // formation point: beside and a little behind the player
    const pf = new V3(-Math.sin(p.aimYaw), 0, -Math.cos(p.aimYaw)), pr = new V3(Math.cos(p.aimYaw), 0, -Math.sin(p.aimYaw));
    const home = p.pos.clone().addScaledVector(pr, 13 * A.side).addScaledVector(pf, -6);
    const toHome = new V3(home.x - m.pos.x, 0, home.z - m.pos.z), dHome = toHome.length();
    let mx = 0, mz = 0, boost = false;
    let aimYaw = m.aimYaw, aimPitch = 0;
    if (t) {
      A.losT -= dt; if (A.losT <= 0) { A.losT = 0.35; A.los = clearLine(c, t.c); }
      const dx = t.c.x - c.x, dz = t.c.z - c.z, h = Math.hypot(dx, dz) || 1;
      aimYaw = Math.atan2(-dx, -dz); aimPitch = Math.atan2(t.c.y - c.y, h);
      A.sT -= dt; if (A.sT <= 0) { A.sT = 1.8 + Math.random() * 2; A.strafe = Math.random() < 0.5 ? 1 : -1; }
      const fwd = h > 55 ? 1 : h < 24 ? -1 : 0;
      mx = dx / h * fwd - dz / h * A.strafe * 0.8; mz = dz / h * fwd + dx / h * A.strafe * 0.8;
      if (!A.los) { mx += -dz / h * A.strafe; mz += dx / h * A.strafe; }   // sidestep to find a firing line
    }
    // leash to the player
    if (dHome > 34 || !t) { const k = dHome > 6 ? 1 : 0; mx = toHome.x / (dHome || 1) * k; mz = toHome.z / (dHome || 1) * k; boost = dHome > 40; }
    else if (dHome > 22) { mx = mx * 0.4 + toHome.x / dHome * 0.8; mz = mz * 0.4 + toHome.z / dHome * 0.8; }
    const L = Math.hypot(mx, mz); if (L > 1) { mx /= L; mz /= L; }
    // jumps: periodic, to reach high targets, and when stuck on a wall
    A.jT -= dt; let jump = false;
    if (A.jT <= 0 && m.grounded) { A.jT = 5 + Math.random() * 5; jump = true; A.hover = 0.6 + Math.random() * 0.8; }
    if (t && t.c.y - m.pos.y > 8 && m.en > 30 && A.los === false) { if (m.grounded) jump = true; A.hover = 0.4; }
    A.stuckT += dt;
    if (A.stuckT > 1.2) { if (L > 0.5 && m.pos.distanceTo(A.last) < 1.2 && m.grounded) { jump = true; A.hover = 1; A.side = -A.side; } A.last.copy(m.pos); A.stuckT = 0; }
    A.hover -= dt;
    m.update(dt, { mx, mz, boost: boost && m.en > 30, qboost: false, jump, hover: A.hover > 0, aimYaw, aimPitch });
    // weapons (at half strength so the player still carries the fight)
    if (!t) { for (const k of ['R', 'L', 'S']) { G.curLabel = 'ally-' + this.ws[k].key; weaponTick(dt, m, k, this.ws[k], false, _b.copy(c), null, 'P', null, WING.dmgMul); } G.curLabel = null; return; }
    const d = t.c.distanceTo(c);
    const aim = _b.copy(t.c); aim.x += (Math.random() - 0.5) * 1.6; aim.y += (Math.random() - 0.5) * 1.2; aim.z += (Math.random() - 0.5) * 1.6;
    const fire = A.los && d < 120;
    const trig = { R: fire, L: fire && d < 55, S: fire && this.ws.S.cd <= 0 && Math.random() < 0.03 };
    for (const k of ['R', 'L', 'S']) {
      G.curLabel = 'ally-' + this.ws[k].key;
      weaponTick(dt, m, k, this.ws[k], trig[k], aim, t, 'P', [t], WING.dmgMul);
    }
    G.curLabel = null;
  }
  dispose() { if (this.mech) this.mech.dispose(); this.mech = null; this.downT = 0; }
}

// ------------------------------------------------------------------ reactor core
export class Reactor {
  constructor(scene, pos, hp) {
    const S = 1.5;   // the kit is ~10 m; scaled so it reads as the centrepiece next to 6 m mechs
    this.obj = cloneKit('F_Reactor'); this.obj.position.copy(pos); this.obj.scale.setScalar(S); scene.add(this.obj);
    // the shared Coil glow is tuned for small parts; at this size it blooms out, so give the core its own dimmer copies
    const dim = new Map();
    this.obj.traverse((m) => { if (!m.isMesh || !m.material || !(m.material.emissiveIntensity > 0)) return; if (!dim.has(m.material)) { const c = m.material.clone(); c.emissiveIntensity *= 0.32; dim.set(m.material, c); } m.material = dim.get(m.material); });
    this.n = nodes(this.obj); this.pos = this.obj.position; this.vel = new V3();
    this.maxHp = hp; this.hp = hp; this.alive = true; this.flash = 0; this.smokeT = 0;
    this.foeW = 0.5; this.foeWAir = 0.85;   // ground units go for the core, flyers split between core and mechs
    this.c = new V3(pos.x, pos.y + 6 * S, pos.z);
    this._ent = { isCore: true, c: this.c, r: 3.6, get alive() { return this.w.alive; }, w: this, hit: (d) => this.damage(d) };
    // collision: base + lower housing + top cap only; the hit sphere sits in the open gap so line-of-sight reaches it
    this.solids = [addSolid(pos.x, pos.z, 11 * S, 11 * S, 1.0 * S, 0, 'core'), addSolid(pos.x, pos.z, 5.2 * S, 5.2 * S, 2.4 * S, 1.0 * S, 'core'), addSolid(pos.x, pos.z, 4.6 * S, 4.6 * S, 1.2 * S, 8.6 * S, 'core')];
  }
  center(out) { return out.copy(this.c); }
  damage(d) {
    if (!this.alive || G.godMode) return;
    const x = d * G.diff.dmg;
    this.hp -= x; this.flash = 0.12;
    G.dmgLog = G.dmgLog || {}; G.dmgLog['core<-' + (G.curLabel || '?')] = (G.dmgLog['core<-' + (G.curLabel || '?')] || 0) + x;
    G.onCoreHit && G.onCoreHit(x);
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false;
      explodeAt(this.c.clone(), 16, 0, 'P', 3.6, 0x80e0ff);
      G.fx.flash(this.c, 0x80e8ff, 80, 40, 0.8);
      this.obj.visible = false;
      for (const s of this.solids) removeSolid(s);
    }
  }
  update(dt) {
    if (!this.alive) return;
    this.n.F_RRing.rotation.y += dt * (0.6 + (1 - this.hp / this.maxHp) * 2.5);
    this.flash = Math.max(0, this.flash - dt);
    const k = this.hp / this.maxHp;
    if (k < 0.5) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smokeT = k < 0.25 ? 0.08 : 0.2; G.fx.smoke(_a.set(this.pos.x + (Math.random() - 0.5) * 6, 14.5, this.pos.z + (Math.random() - 0.5) * 4), 1, 2.2, 1.6, 0x3a3836, 1, 0.7); if (k < 0.25 && Math.random() < 0.3) G.fx.sparks(this.c, null, 6, 0x9ff6ff, 14, 1, 0.3, 0.3); }
    }
  }
  dispose() { this.obj.parent && this.obj.parent.remove(this.obj); for (const s of this.solids) removeSolid(s); this.alive = false; }
}
