// Mech: model assembly (paint + weapon mounts), movement physics, procedural animation, thrusters.
import * as THREE from 'three';
import { KIT, cloneKit, recolor, nodes, find } from './kit.js';
import { groundAt, collideCyl, ARENA, PLAT, WATER } from './world.js';
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
  // ace paints: worn by the ace pilots (combat.js ACES), unlocked for the player by the first kill of that ace
  ace_fox: { name: '赤狐', en: 'Red Fox', ace: 'ace_fox', Armor: '#b8261c', Armor2: '#2a2426', Accent: '#ffb020', Visor: '#ffd060', VisorEmit: '#ffb020' },
  ace_bastion: { name: '铁壁', en: 'Bastion', ace: 'ace_bastion', Armor: '#7d8288', Armor2: '#3d4247', Accent: '#ffd21a' },
  ace_white: { name: '白夜', en: 'White Night', ace: 'ace_white', Armor: '#f4f6f8', Armor2: '#2c3440', Accent: '#30e0ff', Visor: '#80f0ff', VisorEmit: '#20d8ff' },
  ace_viper: { name: '毒蛇', en: 'Viper', ace: 'ace_viper', Armor: '#2f5a2a', Armor2: '#141814', Accent: '#b0ff30', Visor: '#c0ff40', VisorEmit: '#90ff10' },
  ace_meteor: { name: '流星', en: 'Meteor', ace: 'ace_meteor', Armor: '#c9a03a', Armor2: '#1c1a17', Accent: '#ff5a1a' },
  ace_thunder: { name: '雷鸣', en: 'Thunder', ace: 'ace_thunder', Armor: '#4a2f78', Armor2: '#1d1a26', Accent: '#ffe020', Visor: '#ffe860', VisorEmit: '#ffd000' },
  tyrant: { name: '暴君', en: 'Tyrant', Armor: '#3b2627', Armor2: '#1d1e22', Accent: '#ff3a20', Visor: '#ff5a3a', VisorEmit: '#ff2a10', NozzleGlow: '#ffb070', NozzleGlowEmit: '#ff6a20' },
};
// en = energy (the English name is e); cost: bought once in the hangar (save.frames). Traits: dodge (quick boost is
// invulnerable while qbT > 0), bulk (the part of a single hit above bulk is halved)
export const FRAMES = {
  light: { name: '轻型', e: 'Light', hp: 900, speed: 1.15, en: 125, boost: 1.12, regen: 1.15, armor: 1.1, scale: 0.94 },
  std: { name: '标准', e: 'Standard', hp: 1200, speed: 1.0, en: 100, boost: 1.0, regen: 1.0, armor: 1.0, scale: 1.0 },
  heavy: { name: '重型', e: 'Heavy', hp: 1650, speed: 0.86, en: 90, boost: 0.9, regen: 0.9, armor: 0.85, scale: 1.07 },
  wraith: { name: '迅影', e: 'Wraith', hp: 760, speed: 1.24, en: 130, boost: 1.18, regen: 1.25, armor: 1.15, scale: 0.9, cost: 4500, dodge: true, d: '急闪的 0.28 秒内完全无敌 · 最快 · 装甲最低', de: 'quick boost: 0.28 s invulnerable · fastest · lowest AP' },
  titan: { name: '泰坦', e: 'Titan', hp: 2100, speed: 0.74, en: 85, boost: 0.8, regen: 0.85, armor: 0.84, scale: 1.15, cost: 5000, bulk: 40, d: '单次伤害超过 40 的部分减半 · 装甲最高 · 最慢', de: 'single hits above 40: the excess is halved · most AP · slowest' },
};

// Swappable parts (parts.glb). Multipliers stack onto the frame: hp / speed / en / boost / regen / armor (damage
// taken), plus lock (lock-on radius), reload (arm weapons), jump, qb (quick-boost energy), hover (hover drain), grip
// (ignores icy ground; jump scales take-off speed, so height goes with its square), radar (radar range), od (overdrive
// charge), lift (hover climb), float (no wading slowdown), spread / pspd (arm weapon spread and projectile speed),
// scd (shoulder cooldown), melee (blade / pile damage). id 'std' = the frame's own part, always owned.
export const PART_SLOTS = ['head', 'core', 'arms', 'legs', 'pack'];
export const SLOT_NAMES = { head: ['头部', 'Head'], core: ['躯干', 'Core'], arms: ['手臂', 'Arms'], legs: ['腿部', 'Legs'], pack: ['背包', 'Pack'] };
export const PARTS = {
  head: {
    std: { name: '标准', e: 'Standard' },
    hawk: { name: '鹰眼', e: 'Hawk', cost: 1800, lock: 1.3, d: '锁定范围 +30%', de: 'lock-on +30%' },
    mono: { name: '独眼', e: 'Mono-eye', cost: 1500, hp: 1.05, d: '装甲 +5%', de: 'AP +5%' },
    crest: { name: '角冠', e: 'Crest', cost: 1500, regen: 1.12, d: '能量回复 +12%', de: 'EN regen +12%' },
    radar: { name: '雷达头', e: 'Radar', cost: 2000, radar: 1.6, lock: 1.1, d: '雷达范围 +60% · 锁定范围 +10%', de: 'radar range +60% · lock-on +10%' },
    ew: { name: '电战头', e: 'EW suite', cost: 2600, ew: true, lock: 1.1, hp: 0.96, d: '免疫电子干扰 · 致盲 / 扰频时长 −60% · 锁定范围 +10% · 装甲 −4%', de: 'immune to jamming · blind / scramble −60% · lock-on +10% · AP −4%' },
  },
  core: {
    std: { name: '标准', e: 'Standard' },
    bulwark: { name: '重甲胸', e: 'Bulwark', cost: 2200, armor: 0.92, speed: 0.97, d: '受伤 −8% · 速度 −3%', de: 'dmg taken −8% · speed −3%' },
    sleek: { name: '流线胸', e: 'Sleek', cost: 2000, speed: 1.05, hp: 0.95, d: '速度 +5% · 装甲 −5%', de: 'speed +5% · AP −5%' },
    reactor: { name: '反应堆胸', e: 'Reactor', cost: 2400, od: 1.35, regen: 1.06, hp: 0.97, d: '超载充能 +35% · 能量回复 +6% · 装甲 −3%', de: 'overdrive charge +35% · EN regen +6% · AP −3%' },
    nanite: { name: '纳米核心', e: 'Nanite', cost: 2800, nanite: 0.25, hp: 0.96, d: '受到伤害的 25% 随后由纳米修复回来 · 装甲 −4%', de: '25% of damage taken is repaired back over the next seconds · AP −4%' },
  },
  arms: {
    std: { name: '标准', e: 'Standard' },
    brace: { name: '炮击臂', e: 'Brace', cost: 2000, reload: 0.85, d: '臂武器装填 −15%', de: 'arm reload −15%' },
    guard: { name: '护盾臂', e: 'Guard', cost: 2000, armor: 0.95, boost: 0.98, d: '受伤 −5% · 推进 −2%', de: 'dmg taken −5% · boost −2%' },
    stab: { name: '稳定臂', e: 'Stabilizer', cost: 2200, spread: 0.55, pspd: 1.15, d: '臂武器散布 −45% · 弹速 +15%', de: 'arm weapon spread −45% · projectile speed +15%' },
    pod: { name: '挂舱臂', e: 'Pod', cost: 2400, scd: 0.85, hp: 0.97, d: '肩武器冷却 −15% · 装甲 −3%', de: 'shoulder cooldown −15% · AP −3%' },
    fist: { name: '格斗臂', e: 'Brawler', cost: 2400, melee: 1.3, armor: 0.97, reload: 1.08, d: '近战伤害 +30% · 受伤 −3% · 臂武器装填 +8%', de: 'melee damage +30% · dmg taken −3% · arm reload +8%' },
  },
  legs: {
    std: { name: '标准', e: 'Standard' },
    heavy: { name: '重装腿', e: 'Heavy', cost: 2200, hp: 1.1, speed: 0.95, d: '装甲 +10% · 速度 −5%', de: 'AP +10% · speed −5%' },
    rev: { name: '逆关节', e: 'Reverse joint', cost: 2600, jump: 1.2, qb: 0.7, hp: 0.94, d: '跳跃高度 +44% · 急闪耗能 −30% · 装甲 −6%', de: 'jump height +44% · quick boost −30% EN · AP −6%' },
    tread: { name: '履带', e: 'Treads', cost: 3000, hp: 1.15, armor: 0.92, speed: 0.86, jump: 0.75, grip: true, d: '装甲 +15% · 受伤 −8% · 冰面不打滑 · 速度 −14% · 跳跃高度 −44%', de: 'AP +15% · dmg −8% · no ice slide · speed −14% · jump height −44%' },
    hover: { name: '悬浮裙', e: 'Hover skirt', cost: 2800, speed: 1.12, hover: 0.85, float: true, hp: 0.88, d: '速度 +12% · 悬停耗能 −15% · 涉水不减速 · 装甲 −12%', de: 'speed +12% · hover drain −15% · no wading slowdown · AP −12%' },
    quad: { name: '四足', e: 'Quad', cost: 3200, hp: 1.12, armor: 0.94, reload: 0.92, grip: true, speed: 0.9, d: '装甲 +12% · 受伤 −6% · 臂武器装填 −8% · 冰面不打滑 · 速度 −10%', de: 'AP +12% · dmg −6% · arm reload −8% · no ice slide · speed −10%' },
    wheel: { name: '轮足', e: 'Wheels', cost: 3000, speed: 1.2, boost: 1.06, jump: 0.85, hp: 0.92, d: '速度 +20% · 推进 +6% · 跳跃高度 −28% · 装甲 −8%', de: 'speed +20% · boost +6% · jump height −28% · AP −8%' },
  },
  pack: {
    std: { name: '标准', e: 'Standard' },
    sprint: { name: '高机动', e: 'Sprint', cost: 2000, boost: 1.08, en: 0.92, d: '推进 +8% · 能量 −8%', de: 'boost +8% · EN −8%' },
    tank: { name: '大容量', e: 'Tank', cost: 1800, en: 1.18, boost: 0.95, d: '能量 +18% · 推进 −5%', de: 'EN +18% · boost −5%' },
    glide: { name: '滑翔翼', e: 'Glide', cost: 2200, hover: 0.7, d: '悬停耗能 −30%', de: 'hover drain −30%' },
    jumpjet: { name: '跳跃背包', e: 'Jump jet', cost: 2400, jump: 1.25, lift: 1.3, boost: 0.95, d: '跳跃高度 +56% · 悬停爬升 +30% · 推进 −5%', de: 'jump height +56% · hover climb +30% · boost −5%' },
    aegis: { name: '神盾背包', e: 'Aegis', cost: 3200, aegis: 220, en: 0.9, d: '220 点护盾先于装甲受伤 · 6 秒未受伤后每秒回 30 · 能量 −10%', de: '220-point shield takes hits before armour · regenerates 30/s after 6 s unhurt · EN −10%' },
  },
};
// named builds for the garage / enemies (slot -> id; missing slots = std)
export const BUILDS = {
  std: { name: '标准型', en: 'Standard', parts: {} },
  striker: { name: '突击型', en: 'Striker', parts: { head: 'crest', core: 'sleek', legs: 'rev', pack: 'sprint' } },
  juggernaut: { name: '重战车', en: 'Juggernaut', parts: { head: 'mono', core: 'bulwark', arms: 'brace', legs: 'tread', pack: 'tank' } },
  recon: { name: '侦察型', en: 'Recon', parts: { head: 'hawk', arms: 'guard', legs: 'heavy', pack: 'glide' } },
  gale: { name: '疾风型', en: 'Gale', parts: { head: 'crest', core: 'sleek', arms: 'guard', legs: 'hover', pack: 'jumpjet' } },
  siege: { name: '堡垒型', en: 'Siege', parts: { head: 'radar', core: 'reactor', arms: 'brace', legs: 'quad', pack: 'tank' } },
  brawler: { name: '格斗型', en: 'Brawler', parts: { head: 'mono', core: 'bulwark', arms: 'fist', legs: 'heavy', pack: 'sprint' } },
  marksman: { name: '狙击型', en: 'Marksman', parts: { head: 'hawk', arms: 'stab', legs: 'quad', pack: 'glide' } },
  barrage: { name: '火力型', en: 'Barrage', parts: { head: 'radar', core: 'reactor', arms: 'pod', legs: 'tread', pack: 'tank' } },
  racer: { name: '飙车型', en: 'Racer', parts: { head: 'ew', core: 'sleek', arms: 'stab', legs: 'wheel', pack: 'sprint' } },
  aegis: { name: '神盾型', en: 'Aegis', parts: { head: 'ew', core: 'nanite', arms: 'guard', legs: 'heavy', pack: 'aegis' } },
};
// camouflage over the primary armour (kit.js CAMO_FRAG); the tones come from the palette, so each paint gets its own
export const PATTERNS = {
  none: { name: '纯色', e: 'Solid', id: 0 },
  digital: { name: '数码迷彩', e: 'Digital', id: 1, cost: 800 },
  tiger: { name: '虎纹', e: 'Tiger', id: 2, cost: 800 },
  splinter: { name: '碎片迷彩', e: 'Splinter', id: 3, cost: 1000 },
  hex: { name: '蜂巢', e: 'Hex', id: 4, cost: 1000 },
};
export function partStats(parts) {
  const r = { hp: 1, speed: 1, en: 1, boost: 1, regen: 1, armor: 1, lock: 1, reload: 1, jump: 1, qb: 1, hover: 1, radar: 1, od: 1, lift: 1, spread: 1, pspd: 1, scd: 1, melee: 1, grip: false, float: false, ew: false, nanite: 0, aegis: 0 };
  const ADD = { nanite: 1, aegis: 1 };   // additive: nanite (share of damage repaired back), aegis (shield points)
  for (const slot of PART_SLOTS) {
    const p = PARTS[slot][(parts || {})[slot]]; if (!p) continue;
    for (const k in r) if (p[k] !== undefined) r[k] = typeof r[k] === 'boolean' ? r[k] || p[k] : ADD[k] ? r[k] + p[k] : r[k] * p[k];
  }
  return r;
}
export const partsReady = () => !!KIT.P_legs_tread;
export const partsV2 = () => !!KIT.P_legs_quad;   // v61.1 parts in parts.glb
export const partAvail = (slot, id) => id === 'std' || !!KIT[`P_${slot}_${id}`];   // an older parts.glb (WeChat build) lacks the newest parts
// swap the standard meshes for the part kits: PT_<pid>__<Node> groups replace <Node>'s own meshes, PV_ moves a
// pivot, PH_ hides a node (tread legs hide the thighs). Missing part kits (WeChat build) leave the standard part.
function applyParts(body, n, parts) {
  const wheels = [], spin = [], quad = [];
  for (const slot of PART_SLOTS) {
    const id = (parts || {})[slot]; if (!id || id === 'std') continue;
    const K = KIT[`P_${slot}_${id}`]; if (!K) continue;
    for (const c of K.children) {
      const m = /^(PT|PV|PH)_[a-z]+__(\w+)$/.exec(c.name); if (!m) continue;
      const node = n[m[2]]; if (!node) continue;
      if (m[1] === 'PV') node.position.copy(c.position);
      else if (m[1] === 'PH') node.visible = false;
      else {
        for (const o of [...node.children]) if (o.isMesh) node.remove(o);
        const g = c.clone(true); g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
        node.add(g);
        g.traverse((o) => {
          if (o.isMesh && o.name.startsWith('TRW')) wheels.push(o);
          else if (o.name.startsWith('SPN_')) spin.push(o);   // radar dish etc: spins about its own vertical
          else if (/^QH_[FB][LR]$/.test(o.name)) { o.userData.p0 = o.position.clone(); o.userData.diag = o.name === 'QH_FL' || o.name === 'QH_BR' ? 0 : Math.PI; o.userData.sy = o.name[3] === 'F' ? 1 : -1; o.userData.sx = o.name[4] === 'L' ? 1 : -1; quad.push(o); }
        });
      }
    }
  }
  return { wheels, spin, quad };
}

const WALK = 10, BOOST = 25, GRAV = 27, JUMP = 13;
export const PHYS = { g: 1, grip: 1, wx: 0, wz: 0 };   // wx/wz: wind (gale ridge) added to every mech's target velocity   // grip: ground traction (frozen lake 0.3: you slide)   // gravity multiplier (lunar mission 0.4)
export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };


// wide end at the nozzle (origin), tip at y = -1.6
const flameGeo = new THREE.ConeGeometry(0.2, 1.6, 10, 1, true).rotateX(Math.PI).translate(0, -0.8, 0);
// thruster plume: soft view-facing falloff instead of a hard cone edge, scrolling turbulence, shock diamonds near the
// nozzle; colour runs from the tint at the tip to a hot core at the nozzle (only the core crosses the bloom threshold)
const FLAME_T = { value: 0 };
export const MECHS = new Set();   // live mechs (heat haze); main prunes the ones whose root has left the scene
const _hp = new THREE.Vector3();
const flameMat = (c, core, kc, kk) => new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Color(c).multiplyScalar(kc) }, uCore: { value: new THREE.Color(core).multiplyScalar(kk) }, uT: FLAME_T },
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uC; uniform vec3 uCore; uniform float uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main(){
      float u = vUv.y;   // 0 at the nozzle, 1 at the tip
      float face = abs(dot(normalize(vN), normalize(vV)));
      float body = smoothstep(0.0, 0.75, face);
      float n = n2(vec2(vUv.x * 7.0, u * 5.0 - uT * 22.0)) * 0.6 + n2(vec2(vUv.x * 15.0, u * 11.0 - uT * 37.0)) * 0.4;
      float fall = pow(1.0 - u, 1.5) * (0.65 + 0.7 * n) * (1.0 - smoothstep(0.6, 1.0, u + n * 0.3));
      float diam = pow(0.5 + 0.5 * cos(u * 34.0), 8.0) * (1.0 - smoothstep(0.06, 0.5, u));
      vec3 col = mix(uC, uCore, pow(1.0 - u, 4.0) * face) + uCore * diam * 0.8 * face;
      gl_FragColor = vec4(col, body * fall * 0.75);
    }`,
  side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});

export class Mech {
  constructor(scene, ctx, opts) {
    this.ctx = ctx;
    const M = opts.mods || {};
    this.frame = { ...FRAMES[opts.frame || 'std'] };
    this.frame.hp *= M.hp || 1; this.frame.en *= M.en || 1; this.frame.regen *= M.regen || 1; this.frame.boost *= M.boost || 1; this.frame.speed *= M.speed || 1;
    this.parts = { ...(opts.parts || {}) };
    const PS = partStats(opts.cosmetic ? {} : this.parts), F0 = this.frame;   // cosmetic: enemy mechs keep their tuned stats
    for (const k of ['hp', 'speed', 'en', 'boost', 'regen', 'armor']) F0[k] *= PS[k];
    F0.lock = PS.lock; F0.reload = PS.reload; F0.jump = PS.jump; F0.qb = PS.qb; F0.hover = PS.hover; F0.grip = PS.grip;
    F0.radar = PS.radar; F0.od = PS.od; F0.lift = PS.lift; F0.float = PS.float;
    F0.spread = PS.spread; F0.pspd = PS.pspd; F0.scd = PS.scd; F0.melee = PS.melee;
    F0.ew = PS.ew; F0.nanite = PS.nanite; F0.aegis = PS.aegis; this.aegis = PS.aegis;
    this.legKind = KIT['P_legs_' + this.parts.legs] ? this.parts.legs : 'std';
    this.scale = (opts.scale || 1) * this.frame.scale;
    this.isBoss = !!opts.isBoss;
    this.root = new THREE.Group(); scene.add(this.root);
    this.body = cloneKit('Mech'); this.body.scale.setScalar(this.scale);
    this.root.add(this.body);
    this.n = nodes(this.body);
    const AP = applyParts(this.body, this.n, this.parts); this.wheels = AP.wheels; this.spinners = AP.spin; this.quadLegs = AP.quad;
    this.pattern = opts.pattern || 'none';
    this.setPalette(opts.palette || 'vanguard');
    this.slots = {};
    this.mount(opts.loadout || { R: 'rifle', L: 'gatling', S: 'missile' });
    // thrusters
    const fc = this.isBoss ? 0xffa060 : 0x8fd0ff;
    this.flames = [];
    for (const [nm, size] of [['T_Back1', 1.25], ['T_Back2', 1.25], ['T_LegL', 0.85], ['T_LegR', 0.85]]) {
      const holder = this.n[nm]; if (!holder) continue;
      const f = new THREE.Group();
      const outer = new THREE.Mesh(flameGeo, flameMat(fc, this.isBoss ? 0xffe0b0 : 0xd0ecff, 0.7, 1.1)); const inner = new THREE.Mesh(flameGeo, flameMat(fc, 0xffffff, 0.9, 1.9));
      inner.scale.set(0.45, 0.7, 0.45);
      f.add(outer, inner); f.scale.setScalar(0.001); f.rotation.x = nm.startsWith('T_Back') ? -0.5 : -0.25;
      holder.add(f);
      this.flames.push({ f, holder, size, back: nm.startsWith('T_Back'), lv: 0 });
    }
    this.light = new THREE.PointLight(fc, 0, 14 * this.scale, 1.5); this.light.position.set(0, 3.2, 1.6); this.root.add(this.light);
    MECHS.add(this);
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

  setPalette(key, pattern) {
    if (pattern !== undefined) this.pattern = pattern;
    this.paletteKey = key;
    recolor(this.body, PALETTES[key], key, true, (PATTERNS[this.pattern] || PATTERNS.none).id);   // camo on the body, not the weapons
    for (const s of Object.values(this.slots || {})) for (const m of s.models) recolor(m, PALETTES[key], key, true);
  }

  mount(loadout) {
    for (const s of Object.values(this.slots)) for (const m of s.models) m.parent && m.parent.remove(m);
    this.slots = {};
    this.loadout = { ...loadout };
    const kitOf = { rifle: 'W_Rifle', gatling: 'W_Gatling', coil: 'W_Coil', rail: 'W_Rail', missile: 'S_Missile', cannon: 'S_Cannon', laser: 'S_Laser', blade: 'W_Blade', shotgun: 'W_Shotgun', grenade: 'W_Grenade', pile: 'W_Pile', flamer: 'W_Flamer', cryo: 'W_Cryo', shield: 'S_Shield', drones: 'S_Drones', emp: 'S_Emp', decoy: 'S_Decoy', grav: 'S_Grav', orbital: 'S_Orbital', disc: 'W_Disc', blink: 'S_Blink', sonar: 'S_Sonar', sentry: 'S_Sentry', hook: 'W_Hook', smoke: 'S_Smoke', sonic: 'W_Sonic', stasis: 'S_Stasis', flak: 'W_Flak', cluster: 'S_Cluster', chaff: 'S_Chaff', icewall: 'S_IceWall', rockets: 'S_Rockets', sticky: 'W_Sticky', pmines: 'S_Mines', ricochet: 'W_Ricochet', needler: 'W_Needler', rod: 'S_Rod', acid: 'W_Acid', siphon: 'W_Siphon', pound: 'S_Pound', rewind: 'S_Rewind', melter: 'W_Melter', frag: 'W_Frag', reflect: 'S_Reflect', repair: 'S_Repair', bwall: 'S_Barrier', chainb: 'S_Link', camo: 'S_Camo', hack: 'S_Hack', ciws: 'S_CIWS', net: 'S_Net', burner: 'S_Burner', drill: 'W_Drill', tractor: 'W_Tractor', nanocloud: 'S_NanoCloud', plorb: 'W_PlOrb', splat: 'W_Splat', bubble: 'W_Bubble', javelin: 'W_Javelin', arc: 'W_Arc', ecan: 'W_Charge', antigrav: 'S_AntiGrav', xswap: 'S_XSwap', trip: 'S_Trip', halt: 'W_Halt', isotope: 'W_Isotope', saws: 'S_Saws' };
    const mk = (slot, key, mounts) => {
      const models = [], muzzles = [];
      for (const mt of mounts) {
        const m = cloneKit(kitOf[key]);
        this.n[mt].add(m); recolor(m, PALETTES[this.paletteKey], this.paletteKey, true);
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
    if (this.slamT > 0) this.slamT -= dt;   // v63 swatter slam: no boost / hover for a moment
    const canBoost = this.overheat <= 0 && this.en > 0 && !(this.slamT > 0);
    let drain = 0;
    this.boosting = I.boost && canBoost && mlen > 0.1;
    // quick boost
    const qbE = 18 * (F.qb || 1);
    if (I.qboost && this.overheat <= 0 && this.en >= qbE) {
      const qx = mlen > 0.1 ? dx : -Math.sin(this.aimYaw), qz = mlen > 0.1 ? dz : -Math.cos(this.aimYaw);
      const q = 32 * F.boost;
      this.vel.x = qx * q; this.vel.z = qz * q; if (!this.grounded) this.vel.y = Math.max(this.vel.y, 1);
      this.en -= qbE; this.qbT = 0.28; this.drainT = 0;
      this.ctx.onQuickBoost && this.ctx.onQuickBoost(this);
    }
    if (this.lungeT > 0) {
      this.lungeT -= dt;
      if (this.lungeT <= 0) { this.vel.multiplyScalar(0.2); }
      this.boosting = true;
    }
    const lunging = this.lungeT > 0;
    const wade = WATER.on && !F.float ? Math.max(0, Math.min(1, (WATER.y - this.pos.y) / 3)) : 0; this.wade = wade;   // hover skirts skim the water
    const top = (this.boosting ? BOOST * F.boost * (1 - 0.25 * wade) : WALK * F.speed * (1 - 0.4 * wade)) * mlen * (this.slowMul ?? 1) * (this.burnMul ?? 1) * (this.webMul ?? 1) * (this.creepMul ?? 1) * (this.turfMul ?? 1) * (this.lagMul ?? 1) * (this.boosting ? (this.gravBoost ?? 1) * (this.boostMul ?? 1) : 1);
    const acc = this.grounded ? (this.boosting ? 70 : 55) * (F.grip ? 1 : PHYS.grip) : (this.boosting ? 32 : 12);
    const wk = this.grounded ? 0.22 : 0.62;   // the wind shoves you, much harder in the air
    const tx = dx * top + PHYS.wx * wk, tz = dz * top + PHYS.wz * wk;
    const k = this.qbT > 0 ? 1 - Math.exp(-2.2 * dt) : 1 - Math.exp(-acc / Math.max(6, top + 6) * dt * 1.6);
    if (!lunging) { this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k; }
    if (this.boosting) drain += this.grounded ? 14 : 20;
    this.qbT = Math.max(0, this.qbT - dt);
    // vertical
    let hovering = false;
    if (I.jump && this.grounded) { this.vel.y = JUMP * (F.jump || 1); this.grounded = false; this.ctx.onJump && this.ctx.onJump(this); }
    if (!this.grounded && I.hover && canBoost) {
      hovering = true; drain += 26 * (F.hover || 1);
      this.vel.y += (GRAV * PHYS.g + 20 * (F.lift || 1)) * dt; const vc = 9 * (F.lift || 1); if (this.vel.y > vc) this.vel.y = vc;
    }
    if (!lunging) this.vel.y -= GRAV * PHYS.g * (this.gravMul ?? 1) * (this.webG ?? 1) * dt;   // grav-lock dome: the hover lift no longer beats gravity
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    // energy
    if (drain > 0) { this.en -= drain * dt; this.drainT = 0; }
    else { this.drainT += dt; if (this.drainT > 0.55) this.en += (this.grounded ? 48 : 30) * F.regen * (this.turfEn ?? 1) * dt; }
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
    if (this.legKind === 'tread' || this.legKind === 'hover') {   // treads / hover skirt: no gait, the hull just leans into acceleration
      T.torX = -Math.max(-0.12, Math.min(0.15, vf * 0.006));
      if (this.legKind === 'hover') T.hipY = 2.6 + (this.grounded ? 0 : 0.15);
    } else if (this.legKind === 'quad') {   // quad: diagonal trot driven by phase, body stays level
      const amp = this.grounded && this.qbT <= 0 ? Math.min(1, hs / (WALK * F.speed)) : 0;
      this.phase += dt * (2.6 + hs * 0.38) * (this.backward ? -1 : 1);
      T.hipY = 2.95 - Math.abs(Math.sin(this.phase)) * 0.06 * amp; T.torX = -0.04 * amp;
      this.quadAmp = amp;
      const st = Math.floor(this.phase / Math.PI);
      if (st !== this.lastStep && amp > 0.25) { this.lastStep = st; this.ctx.onStep && this.ctx.onStep(this, st & 1); }
    } else if (this.legKind === 'wheel') {   // wheel legs: a skating crouch (deeper when boosting or airborne), feet kept level, no steps
      const b = this.boosting && this.grounded ? 1 : 0, air = this.grounded ? 0 : 1;
      const t = 0.2 + 0.14 * b + 0.22 * air, sh = -(0.4 + 0.28 * b + 0.5 * air);
      T.tl = t; T.tr = t; T.sl = sh; T.sr = sh; T.fl = -(t + sh); T.fr = T.fl;
      T.hipY = 2.75 - 1.15 * (1 - Math.cos(t)) - 1.2 * (1 - Math.cos(t + sh));
      T.torX = -Math.max(-0.2, Math.min(0.25, vf * 0.01));
    } else if (this.grounded && !this.boosting && this.qbT <= 0) {
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
    if (this.legKind === 'tread' || this.legKind === 'hover' || this.legKind === 'quad') { T.hipY -= lc * (this.legKind === 'quad' ? 0.5 : 0.25); T.torX -= lc * 0.15; }
    else { T.hipY -= lc * 0.75; T.tl += lc * 0.9; T.tr += lc * 0.9; T.sl -= lc * 1.6; T.sr -= lc * 1.6; T.fl += lc * 0.7; T.fr += lc * 0.7; T.torX -= lc * 0.25; }
    if (this.legKind === 'rev') {   // reverse joint: the knee folds the other way, the long foot stays level
      T.sl *= -0.85; T.sr *= -0.85; T.fl = -(T.tl + T.sl) * 0.7; T.fr = -(T.tr + T.sr) * 0.7;
    }
    const k = 1 - Math.exp(-14 * dt);
    for (const key in T) P[key] = P[key] === undefined ? T[key] : P[key] + (T[key] - P[key]) * k;
    const now = performance.now();
    n.M_Hips.position.y = P.hipY + Math.sin(now * (this.legKind === 'hover' ? 0.0035 : 0.002)) * (this.legKind === 'hover' ? 0.09 : 0.02);
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
    for (const w of this.wheels) w.rotateY(vf / 0.3 * dt);   // tread road wheels roll with forward speed
    for (const o of this.spinners) o.rotation.y += dt * 2.4;   // glTF export: an unrotated empty's local y is up
    if (this.quadLegs.length) {   // diagonal pairs swing fore/aft about the hip and lift during the swing; airborne: tuck
      const a = this.quadAmp || 0, air = this.grounded ? 0 : 1;
      for (const q of this.quadLegs) {
        const ph = this.phase + q.userData.diag, sw = Math.sin(ph) * a;
        q.rotation.y += ((sw * 0.3 * q.userData.sx) - q.rotation.y) * k;
        q.position.y = q.userData.p0.y + Math.max(0, Math.cos(ph)) * 0.32 * a;
        q.rotation.x += (-air * 0.35 * q.userData.sy - q.rotation.x) * k;
      }
    }
    // weapon spin
    for (const side of ['L', 'R']) { const sl = this.slots[side]; if (sl.spin) sl.spin.rotation.y += (sl.spinV || 0) * dt; }
    // flames
    FLAME_T.value = performance.now() / 1000;
    for (const fl of this.flames) {
      const lv = fl.back ? this.thrustLv : Math.max(this.hoverLv, this.thrustLv * 0.4);
      fl.lv = lv;
      const j = 0.85 + Math.random() * 0.3;
      if (lv < 0.03) { fl.f.visible = false; continue; }
      fl.f.visible = true;
      fl.f.scale.set(fl.size * (0.7 + lv * 0.5), fl.size * lv * j * 1.6, fl.size * (0.7 + lv * 0.5));
    }
    this.light.intensity = this.thrustLv * 6 + this.hoverLv * 3.5;
  }

  // heat-haze sources just past each lit nozzle's plume tip (matrixWorld is last frame's, close enough)
  heat(out) {
    for (const fl of this.flames) {
      if (fl.lv < 0.08 || !fl.f.visible) continue;
      _hp.set(0, -1.9, 0).applyMatrix4(fl.f.matrixWorld);
      out.push({ x: _hp.x, y: _hp.y, z: _hp.z, r: (0.9 + fl.lv * 1.6) * fl.size * this.scale, s: 0.085 * fl.lv * fl.size * this.scale });
    }
  }

  hit(dmg) {
    if (!this.alive) return;
    this.hp -= dmg; this.flinch = Math.min(1, this.flinch + Math.min(0.6, dmg / 60));
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }

  dispose() { this.root.parent && this.root.parent.remove(this.root); }
}
