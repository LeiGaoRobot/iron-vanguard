// Mech: model assembly (paint + weapon mounts), movement physics, procedural animation, thrusters.
import * as THREE from 'three';
import { cloneKit, recolor, nodes, find } from './kit.js';
import { groundAt, collideCyl, ARENA, PLAT } from './world.js';
import { TEX } from './fx.js';

export const PALETTES = {
  vanguard: { name: '先锋 白', en: 'Vanguard', Armor: '#e6e4df', Armor2: '#a9adb3', Accent: '#cf3a2b' },
  kestrel: { name: '隼 蓝', en: 'Kestrel', Armor: '#33507a', Armor2: '#a3adba', Accent: '#f2b134' },
  ronin: { name: '浪人 绿', en: 'Ronin', Armor: '#6d7350', Armor2: '#40453a', Accent: '#e07a2a' },
  specter: { name: '幽灵 黑', en: 'Specter', Armor: '#2b2e34', Armor2: '#585d66', Accent: '#2fd0ff' },
  sakura: { name: '樱 粉', en: 'Sakura', Armor: '#f1e4e9', Armor2: '#c595a6', Accent: '#7a3cc8' },
  phantom: { name: '幻影', en: 'Phantom', Armor: '#1e2026', Armor2: '#3c3f48', Accent: '#d01840', Visor: '#ff3a5a', VisorEmit: '#ff1030', NozzleGlow: '#ff8aa0', NozzleGlowEmit: '#ff2050' },
  raider: { name: '掠夺者', en: 'Raider', enemy: true, Armor: '#8a6a44', Armor2: '#3a3430', Accent: '#ff7a1a', Visor: '#ffb040', VisorEmit: '#ff8a10', NozzleGlow: '#ffc080', NozzleGlowEmit: '#ff8a30' },
  lancer: { name: '枪骑兵', en: 'Lancer', enemy: true, Armor: '#5a2a4a', Armor2: '#241c24', Accent: '#ff3ac0', Visor: '#ff70e0', VisorEmit: '#ff30c8', NozzleGlow: '#ff9ae8', NozzleGlowEmit: '#ff40c0' },
  echo: { name: '镜像', en: 'Echo', enemy: true, Armor: '#3a3e52', Armor2: '#16171f', Accent: '#ff2ad8', Visor: '#7ff4ff', VisorEmit: '#20e0ff', NozzleGlow: '#ff8af0', NozzleGlowEmit: '#ff30d0' },
  tyrant: { name: '暴君', en: 'Tyrant', Armor: '#3b2627', Armor2: '#1d1e22', Accent: '#ff3a20', Visor: '#ff5a3a', VisorEmit: '#ff2a10', NozzleGlow: '#ffb070', NozzleGlowEmit: '#ff6a20' },
};
export const FRAMES = {
  light: { name: '轻型', en: 'Light', hp: 900, speed: 1.15, en: 125, boost: 1.12, regen: 1.15, armor: 1.1, scale: 0.94 },
  std: { name: '标准', en: 'Standard', hp: 1200, speed: 1.0, en: 100, boost: 1.0, regen: 1.0, armor: 1.0, scale: 1.0 },
  heavy: { name: '重型', en: 'Heavy', hp: 1650, speed: 0.86, en: 90, boost: 0.9, regen: 0.9, armor: 0.85, scale: 1.07 },
};

const WALK = 10, BOOST = 25, GRAV = 27, JUMP = 13;
export const PHYS = { g: 1 };   // gravity multiplier (lunar mission 0.4)
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };


// wide end at the nozzle (origin), tip at y = -1.6
const flameGeo = new THREE.ConeGeometry(0.2, 1.6, 10, 1, true).rotateX(Math.PI).translate(0, -0.8, 0);
const flameTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0);   // uv.y 0 (nozzle) = canvas bottom
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const flameMat = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.7), map: flameTex, side: THREE.DoubleSide, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

export class Mech {
  constructor(scene, ctx, opts) {
    this.ctx = ctx;
    const M = opts.mods || {};
    this.frame = { ...FRAMES[opts.frame || 'std'] };
    this.frame.hp *= M.hp || 1; this.frame.en *= M.en || 1; this.frame.regen *= M.regen || 1; this.frame.boost *= M.boost || 1; this.frame.speed *= M.speed || 1;
    this.scale = (opts.scale || 1) * this.frame.scale;
    this.isBoss = !!opts.isBoss;
    this.root = new THREE.Group(); scene.add(this.root);
    this.body = cloneKit('Mech'); this.body.scale.setScalar(this.scale);
    this.root.add(this.body);
    this.n = nodes(this.body);
    this.setPalette(opts.palette || 'vanguard');
    this.slots = {};
    this.mount(opts.loadout || { R: 'rifle', L: 'gatling', S: 'missile' });
    // thrusters
    const fc = this.isBoss ? 0xffa060 : 0x8fd0ff;
    this.flames = [];
    for (const [nm, size] of [['T_Back1', 1.25], ['T_Back2', 1.25], ['T_LegL', 0.85], ['T_LegR', 0.85]]) {
      const holder = this.n[nm]; if (!holder) continue;
      const f = new THREE.Group();
      const outer = new THREE.Mesh(flameGeo, flameMat(fc)); const inner = new THREE.Mesh(flameGeo, flameMat(0xffffff));
      inner.scale.set(0.45, 0.7, 0.45);
      f.add(outer, inner); f.scale.setScalar(0.001); f.rotation.x = nm.startsWith('T_Back') ? -0.5 : -0.25;
      holder.add(f);
      this.flames.push({ f, holder, size, back: nm.startsWith('T_Back'), lv: 0 });
    }
    this.light = new THREE.PointLight(fc, 0, 14 * this.scale, 1.5); this.light.position.set(0, 3.2, 1.6); this.root.add(this.light);
    // state
    this.pos = this.root.position; this.vel = new THREE.Vector3();
    this.legYaw = opts.yaw || 0; this.aimYaw = this.legYaw; this.aimPitch = 0; this.torsoYaw = 0;
    this.grounded = true; this.maxHp = Math.round(this.frame.hp * (opts.hpMul || 1)); this.hp = this.maxHp;
    this.maxEn = this.frame.en; this.en = this.maxEn; this.overheat = 0; this.drainT = 0;
    this.qbT = 0; this.lungeT = 0; this.landC = 0; this.phase = 0; this.backward = false; this.thrustLv = 0; this.hoverLv = 0; this.boosting = false;
    this.alive = true; this.flinch = 0; this.lastStep = 0;
    this.pose = {};
    this.root.rotation.y = this.legYaw;
    this.radius = 1.5 * this.scale; this.height = 5.6 * this.scale;
  }

  setPalette(key) {
    this.paletteKey = key;
    recolor(this.body, PALETTES[key], key);
    for (const s of Object.values(this.slots || {})) for (const m of s.models) recolor(m, PALETTES[key], key);
  }

  mount(loadout) {
    for (const s of Object.values(this.slots)) for (const m of s.models) m.parent && m.parent.remove(m);
    this.slots = {};
    this.loadout = { ...loadout };
    const kitOf = { rifle: 'W_Rifle', gatling: 'W_Gatling', coil: 'W_Coil', rail: 'W_Rail', missile: 'S_Missile', cannon: 'S_Cannon', laser: 'S_Laser', blade: 'W_Blade', shotgun: 'W_Shotgun', grenade: 'W_Grenade', pile: 'W_Pile', flamer: 'W_Flamer', cryo: 'W_Cryo', shield: 'S_Shield', drones: 'S_Drones', emp: 'S_Emp', decoy: 'S_Decoy', grav: 'S_Grav', orbital: 'S_Orbital', disc: 'W_Disc', blink: 'S_Blink', sonar: 'S_Sonar', sentry: 'S_Sentry' };
    const mk = (slot, key, mounts) => {
      const models = [], muzzles = [];
      for (const mt of mounts) {
        const m = cloneKit(kitOf[key]);
        this.n[mt].add(m); recolor(m, PALETTES[this.paletteKey], this.paletteKey);
        models.push(m); muzzles.push(find(m, 'Muzzle'));
      }
      this.slots[slot] = { key, models, muzzles, spin: find(models[0], 'G_Spin'), blade: find(models[0], 'B_Blade'), pile: find(models[0], 'P_Spike'), pileT: 0, alt: 0, slashT: 0, slashSide: 1, bladeOn: 0, bladeLv: 0 };
    };
    mk('R', loadout.R, ['W_HandR']);
    mk('L', loadout.L, ['W_HandL']);
    mk('S', loadout.S, ['W_BackL', 'W_BackR']);
  }

  center(out) { return out.set(this.pos.x, this.pos.y + 3.0 * this.scale, this.pos.z); }

  muzzlePos(slot, out, i) {
    const s = this.slots[slot]; const k = i ?? (s.alt % s.muzzles.length);
    return s.muzzles[k].getWorldPosition(out);
  }

  // ------------------------------------------------------------------ physics
  // intent: {mx, mz (world dir, |m|<=1), boost, qboost, jump, hover, aimYaw, aimPitch}
  update(dt, I) {
    if (!this.alive) return;
    const F = this.frame;
    this.aimYaw = I.aimYaw; this.aimPitch = I.aimPitch;
    const mlen = Math.min(1, Math.hypot(I.mx, I.mz));
    const dx = mlen > 0.01 ? I.mx / Math.hypot(I.mx, I.mz) : 0, dz = mlen > 0.01 ? I.mz / Math.hypot(I.mx, I.mz) : 0;
    const canBoost = this.overheat <= 0 && this.en > 0;
    let drain = 0;
    this.boosting = I.boost && canBoost && mlen > 0.1;
    // quick boost
    if (I.qboost && this.overheat <= 0 && this.en >= 18) {
      const qx = mlen > 0.1 ? dx : -Math.sin(this.aimYaw), qz = mlen > 0.1 ? dz : -Math.cos(this.aimYaw);
      const q = 32 * F.boost;
      this.vel.x = qx * q; this.vel.z = qz * q; if (!this.grounded) this.vel.y = Math.max(this.vel.y, 1);
      this.en -= 18; this.qbT = 0.28; this.drainT = 0;
      this.ctx.onQuickBoost && this.ctx.onQuickBoost(this);
    }
    if (this.lungeT > 0) {
      this.lungeT -= dt;
      if (this.lungeT <= 0) { this.vel.multiplyScalar(0.2); }
      this.boosting = true;
    }
    const lunging = this.lungeT > 0;
    const top = (this.boosting ? BOOST * F.boost : WALK * F.speed) * mlen;
    const acc = this.grounded ? (this.boosting ? 70 : 55) : (this.boosting ? 32 : 12);
    const tx = dx * top, tz = dz * top;
    const k = this.qbT > 0 ? 1 - Math.exp(-2.2 * dt) : 1 - Math.exp(-acc / Math.max(6, top + 6) * dt * 1.6);
    if (!lunging) { this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k; }
    if (this.boosting) drain += this.grounded ? 14 : 20;
    this.qbT = Math.max(0, this.qbT - dt);
    // vertical
    let hovering = false;
    if (I.jump && this.grounded) { this.vel.y = JUMP; this.grounded = false; this.ctx.onJump && this.ctx.onJump(this); }
    if (!this.grounded && I.hover && canBoost) {
      hovering = true; drain += 26;
      this.vel.y += (GRAV * PHYS.g + 20) * dt; if (this.vel.y > 9) this.vel.y = 9;
    }
    if (!lunging) this.vel.y -= GRAV * PHYS.g * dt;
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    // energy
    if (drain > 0) { this.en -= drain * dt; this.drainT = 0; }
    else { this.drainT += dt; if (this.drainT > 0.55) this.en += (this.grounded ? 48 : 30) * F.regen * dt; }
    if (this.overheat > 0) { this.overheat -= dt; this.en += 22 * dt; }
    if (this.en <= 0 && this.overheat <= 0) { this.en = 0; this.overheat = 2.2; this.ctx.onOverheat && this.ctx.onOverheat(this); }
    this.en = Math.min(this.maxEn, Math.max(0, this.en));
    // integrate + collide
    const p = this.pos, prevY = p.y;
    p.x += this.vel.x * dt; p.z += this.vel.z * dt; p.y += this.vel.y * dt;
    if (collideCyl(p, this.radius, this.height)) {
      // kill velocity into walls a bit so we don't grind
      this.vel.x *= 0.92; this.vel.z *= 0.92;
    }
    const lim = ARENA - 2;
    p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
    if (PLAT.R) { const pr = Math.hypot(p.x, p.z), pl = PLAT.R - 2.5; if (pr > pl) { p.x *= pl / pr; p.z *= pl / pr; const vr = (this.vel.x * p.x + this.vel.z * p.z) / pl; if (vr > 0) { this.vel.x -= p.x / pl * vr; this.vel.z -= p.z / pl * vr; } } }
    const g = groundAt(p.x, p.z, Math.max(prevY, p.y), this.radius);
    if (p.y <= g + 0.001) {
      if (!this.grounded) {
        const impact = -this.vel.y;
        this.grounded = true;
        if (impact > 6) { this.landC = Math.min(1, impact / 22); this.ctx.onLand && this.ctx.onLand(this, impact); }
      }
      p.y = g; this.vel.y = 0;
    } else if (this.grounded && p.y > g + 0.05) {
      if (p.y - g < 0.8 && this.vel.y <= 0) p.y = g;    // step down small ledges
      else this.grounded = false;
    }
    if (p.y > 60) { p.y = 60; this.vel.y = Math.min(0, this.vel.y); }
    // thrust levels for visuals / audio
    const thr = this.qbT > 0 || lunging ? 1 : (this.boosting ? 0.85 : hovering ? 0.7 : 0);
    this.thrustLv += (thr - this.thrustLv) * (1 - Math.exp(-14 * dt));
    this.hoverLv += ((hovering ? 1 : 0) - this.hoverLv) * (1 - Math.exp(-12 * dt));
    this.hovering = hovering;
    // legs face the movement direction; walk backwards rather than turning round
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let target = this.legYaw;
    if (hs > 1.5) {
      const mv = Math.atan2(-this.vel.x, -this.vel.z);
      const d = angDiff(mv, this.aimYaw);
      this.backward = Math.abs(d) > 1.75;
      target = this.backward ? mv + Math.PI : mv;
      if (Math.abs(angDiff(target, this.aimYaw)) > 1.2) target = this.aimYaw + Math.sign(angDiff(target, this.aimYaw)) * 1.2;
    } else if (Math.abs(angDiff(this.aimYaw, this.legYaw)) > 0.9) target = this.aimYaw;
    this.legYaw += angDiff(target, this.legYaw) * (1 - Math.exp(-(hs > 1.5 ? 9 : 5) * dt));
    this.root.rotation.y = this.legYaw;
    this.torsoYaw = Math.max(-1.5, Math.min(1.5, angDiff(this.aimYaw, this.legYaw)));
    this.flinch = Math.max(0, this.flinch - dt * 4);
    this.landC = Math.max(0, this.landC - dt * 2.4);
    this.animate(dt, hs);
  }

  // ------------------------------------------------------------------ animation
  animate(dt, hs) {
    const n = this.n, P = this.pose, F = this.frame;
    const T = { hipY: 2.75, hipX: 0, tl: 0, tr: 0, sl: 0, sr: 0, fl: 0, fr: 0, torX: 0 };
    // local velocity in leg frame
    const c = Math.cos(this.legYaw), s = Math.sin(this.legYaw);
    const vf = -(this.vel.x * s + this.vel.z * c);     // forward speed
    const vr = this.vel.x * c - this.vel.z * s;        // right speed
    if (this.grounded && !this.boosting && this.qbT <= 0) {
      const amp = Math.min(1, hs / (WALK * F.speed));
      this.phase += dt * (2.2 + hs * 0.42) * (this.backward ? -1 : 1);
      const sp = Math.sin(this.phase);
      T.tl = sp * 0.55 * amp; T.tr = -sp * 0.55 * amp;
      T.sl = -Math.max(0, Math.cos(this.phase)) * 0.9 * amp - 0.05; T.sr = -Math.max(0, -Math.cos(this.phase)) * 0.9 * amp - 0.05;
      T.fl = -T.tl * 0.6 - T.sl * 0.5; T.fr = -T.tr * 0.6 - T.sr * 0.5;
      T.hipY = 2.75 - Math.abs(Math.cos(this.phase)) * 0.14 * amp - 0.05 * amp;
      T.torX = -0.06 * amp;
      // footstep on each contact
      const st = Math.floor(this.phase / Math.PI);
      if (st !== this.lastStep && amp > 0.25) { this.lastStep = st; this.ctx.onStep && this.ctx.onStep(this, st & 1); }
    } else if (this.grounded) {   // skating boost
      T.hipY = 2.45; T.tl = 0.35; T.tr = 0.1; T.sl = -0.75; T.sr = -0.45; T.fl = 0.35; T.fr = 0.3;
      T.torX = -Math.max(-0.25, Math.min(0.3, vf * 0.012));
    } else {   // airborne
      T.hipY = 2.75; T.tl = 0.55; T.tr = -0.15; T.sl = -0.95; T.sr = -0.35; T.fl = 0.45; T.fr = 0.2;
      T.torX = -Math.max(-0.2, Math.min(0.25, vf * 0.01));
    }
    // landing crouch
    const lc = this.landC * this.landC * 1.2;
    T.hipY -= lc * 0.75; T.tl += lc * 0.9; T.tr += lc * 0.9; T.sl -= lc * 1.6; T.sr -= lc * 1.6; T.fl += lc * 0.7; T.fr += lc * 0.7; T.torX -= lc * 0.25;
    const k = 1 - Math.exp(-14 * dt);
    for (const key in T) P[key] = P[key] === undefined ? T[key] : P[key] + (T[key] - P[key]) * k;
    n.M_Hips.position.y = P.hipY + Math.sin(performance.now() * 0.002) * 0.02;
    n.M_Hips.rotation.z = -vr * 0.006;
    n.M_ThighL.rotation.x = P.tl; n.M_ThighR.rotation.x = P.tr;
    n.M_ShinL.rotation.x = P.sl; n.M_ShinR.rotation.x = P.sr;
    n.M_FootL.rotation.x = P.fl; n.M_FootR.rotation.x = P.fr;
    n.M_Torso.rotation.set(P.torX - this.flinch * 0.2, this.torsoYaw, 0, 'YXZ');
    const pitch = this.aimPitch - P.torX;
    let twist = 0;
    for (const side of ['L', 'R']) {
      const slot = this.slots[side];
      const A = n['M_Arm' + side];
      if (slot.slashT > 0) {
        // wind up high to the outside, sweep down and across the body
        const k = 1 - slot.slashT / 0.5, e = k < 0.25 ? k / 0.25 * 0.15 : 0.15 + (1 - Math.pow(1 - (k - 0.25) / 0.75, 3)) * 0.85;
        const out = side === 'L' ? 1 : -1, sd = slot.slashSide;
        A.rotation.x = 1.5 - e * 2.3;
        A.rotation.z = out * (0.9 - e * 1.7) * (sd > 0 ? 1 : 0.6);
        n['M_Fore' + side].rotation.x = 0.5 - e * 0.4;
        twist += out * (0.55 - e * 1.1);
        slot.slashT = Math.max(0, slot.slashT - dt);
      } else {
        A.rotation.x = Math.max(-0.9, Math.min(1.2, pitch + (slot.recoil || 0) * 0.5));
        A.rotation.z = 0;
        n['M_Fore' + side].rotation.x = (slot.recoil || 0);
      }
      slot.recoil = Math.max(0, (slot.recoil || 0) - dt * 3);
      if (slot.pile) {
        const sp = slot.pile;
        if (!slot.pileP0) { slot.pileP0 = sp.position.clone(); const mz = find(slot.models[0], 'Muzzle'); slot.pileDir = mz ? mz.position.clone().sub(sp.position).normalize() : new THREE.Vector3(0, 1, 0); }
        slot.pileT = Math.max(0, slot.pileT - dt);
        const e = slot.pileT > 0.24 ? 1 : slot.pileT / 0.24;
        sp.position.copy(slot.pileP0).addScaledVector(slot.pileDir, e * 1.3);
      }
      if (slot.blade) {
        const on = slot.slashT > 0 || slot.bladeOn > 0 ? 1 : 0.14;
        slot.bladeOn = Math.max(0, slot.bladeOn - dt);
        slot.bladeLv += (on - slot.bladeLv) * (1 - Math.exp(-(on > slot.bladeLv ? 30 : 8) * dt));
        slot.blade.scale.set(1 + slot.bladeLv * 0.5, slot.bladeLv, 1 + slot.bladeLv * 0.5);
      }
    }
    if (twist) n.M_Torso.rotation.y = this.torsoYaw + twist;
    n.M_Head.rotation.x = Math.max(-0.4, Math.min(0.5, pitch * 0.6));
    const ss = this.slots.S; if (ss) { ss.recoil = Math.max(0, (ss.recoil || 0) - dt * 3); for (const m of ss.models) m.position.z = (ss.recoil || 0) * 0.4; }
    // weapon spin
    for (const side of ['L', 'R']) { const sl = this.slots[side]; if (sl.spin) sl.spin.rotation.y += (sl.spinV || 0) * dt; }
    // flames
    for (const fl of this.flames) {
      const lv = fl.back ? this.thrustLv : Math.max(this.hoverLv, this.thrustLv * 0.4);
      fl.lv = lv;
      const j = 0.85 + Math.random() * 0.3;
      if (lv < 0.03) { fl.f.visible = false; continue; }
      fl.f.visible = true;
      fl.f.scale.set(fl.size * (0.7 + lv * 0.5), fl.size * lv * j * 1.6, fl.size * (0.7 + lv * 0.5));
    }
    this.light.intensity = this.thrustLv * 14 + this.hoverLv * 8;
  }

  hit(dmg) {
    if (!this.alive) return;
    this.hp -= dmg; this.flinch = Math.min(1, this.flinch + Math.min(0.6, dmg / 60));
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }

  dispose() { this.root.parent && this.root.parent.remove(this.root); }
}
