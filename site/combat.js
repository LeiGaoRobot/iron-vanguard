// Weapons, projectiles, enemies, damage.  Shared state lives in G.
import * as THREE from 'three';
import { RAYF, barrels, raySolids, clearLine, collideCyl, groundAt, removeSolid, pointInSolid, addSolid, ARENA, PLAT, WATER, LAVA, lavaAt, lavaD, GRID } from './world.js';
import { cloneKit, nodes, find, recolor } from './kit.js';
import { Mech, angDiff, PALETTES, PHYS } from './mech.js';
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
  rods: [],
  jam: { R: 0, L: 0, S: 0 },
  pound: null,   // GP-2 ground pound in progress   // seconds each of your weapon slots stays locked by a Disarmer orb     // planted LR-1 lightning rods
  friends: [],  // other things enemies may shoot: wingman, reactor core ({pos, vel, center(), alive, _ent, foeW})
};

export const WEAPONS = {
  siphon: { slot: 'arm', name: 'VB-1 汲能枪', en: 'VB-1 Siphon Gun', desc: '高速红色能量弹 · 每发命中敌机为你回复 12% 伤害量的装甲 · 持续输出也是持续回血', type: 'bullet', siphon: 0.12, rate: 0.12, dmg: 13, speed: 210, spread: 0.014, mag: 36, reload: 2.2, color: 0xff3050, w: 0.28, len: 4, life: 0.6, sfx: 'rifle', recoil: 0.1 },
  acid: { slot: 'arm', name: 'AC-2 酸液喷枪', en: 'AC-2 Acid Sprayer', desc: '抛射酸液团（有下坠）· 溅射 3 m · 命中叠加腐蚀：每层受伤 +7%，最多 5 层，4 秒不补就消退', type: 'bullet', acid: true, rate: 0.15, dmg: 15, speed: 90, spread: 0.02, mag: 30, reload: 2.0, color: 0x90ff30, w: 0.45, len: 1.6, life: 1.1, sfx: 'rifle', recoil: 0.12 },
  needler: { slot: 'arm', name: 'NX-8 针刺枪', en: 'NX-8 Needler', desc: '追踪锁定目标的钢针 · 扎在敌机上 · 同一目标扎满 8 根一起引爆（100 / 4.5 m）· 3 秒没补针就脱落', type: 'bullet', needle: true, rate: 0.085, dmg: 5, speed: 150, spread: 0.02, mag: 48, reload: 2.2, color: 0xff70e0, w: 0.16, len: 3, life: 1.6, sfx: 'rifle', recoil: 0.08 },
  ricochet: { slot: 'arm', name: 'RB-4 跳弹枪', en: 'RB-4 Ricochet', desc: '撞墙反弹 3 次 · 反弹后转向附近敌机 · 每弹一次 +25%', type: 'bullet', rate: 0.11, dmg: 14, speed: 240, spread: 0.008, mag: 36, reload: 2.0, color: 0x80ffd0, w: 0.22, len: 6, life: 1.8, bounce: 3, sfx: 'rifle', recoil: 0.15 },
  rifle: { slot: 'arm', name: 'AR-77 突击步枪', en: 'AR-77 Rifle', desc: '全自动 · 精准 · 均衡', type: 'bullet', rate: 0.1, dmg: 17, speed: 320, spread: 0.005, mag: 40, reload: 1.7, color: 0xffd27a, w: 0.22, len: 7, sfx: 'rifle', recoil: 0.18 },
  gatling: { slot: 'arm', name: 'GX-6 加特林', en: 'GX-6 Gatling', desc: '需预转 · 高射速 · 散布大', type: 'bullet', rate: 0.042, spinUp: 0.45, dmg: 8.5, speed: 290, spread: 0.022, mag: 200, reload: 3.0, color: 0xffb860, w: 0.18, len: 6, sfx: 'gatling', recoil: 0.08 },
  coil: { slot: 'arm', name: 'LC-3 闪电线圈', en: 'LC-3 Arc Coil', desc: '自动索敌 · 连锁 3 个目标', type: 'chain', rate: 0.5, dmg: 44, range: 60, chains: 3, chainR: 18, mag: 14, reload: 2.2, sfx: 'coil', recoil: 0.3 },
  rail: { slot: 'arm', name: 'RG-9 磁轨炮', en: 'RG-9 Railgun', desc: '按住蓄力 · 松开贯穿', type: 'charge', charge: 1.1, dmg: [45, 280], rate: 0.6, mag: 6, reload: 2.6, sfx: 'rail', recoil: 0.9 },
  blade: { slot: 'arm', name: 'LB-0 光束剑', en: 'LB-0 Pulse Blade', desc: '近战 · 锁定时冲刺斩击 · 耗 EN', type: 'blade', dmg: 310, range: 7.5, lunge: 38, cd: 0.95, cost: 16, sfx: 'blade' },
  flak: { slot: 'arm', name: 'FL-8 高射炮', en: 'FL-8 Flak Cannon', desc: '近炸引信炮弹 · 飞近敌机 4 m 内自动空爆 · 6 m 破片 · 射程尽头也会空爆 · 专克蜂群和无人机', type: 'bullet', flak: 4, rate: 0.3, dmg: 44, splash: 6, speed: 150, spread: 0.01, life: 0.7, mag: 12, reload: 2.6, color: 0xffc070, w: 0.32, len: 3, sfx: 'cannon', recoil: 0.45 },
  shotgun: { slot: 'arm', name: 'SG-12 霰弹炮', en: 'SG-12 Scattergun', desc: '近距离 · 一发 9 颗弹丸 · 射程短', type: 'bullet', pellets: 9, rate: 0.72, dmg: 13, speed: 250, spread: 0.075, life: 0.42, mag: 6, reload: 2.3, color: 0xffc890, w: 0.2, len: 4, sfx: 'cannon', recoil: 0.7 },
  grenade: { slot: 'arm', name: 'GL-4 榴弹发射器', en: 'GL-4 Grenade Launcher', desc: '抛物线弹道 · 范围爆炸 · 可越过掩体', type: 'bullet', grenade: true, rate: 0.55, dmg: 78, splash: 6.5, speed: 88, grav: 30, spread: 0.004, mag: 8, reload: 2.5, color: 0xffa050, sfx: 'grenade', recoil: 0.55 },
  flamer: { slot: 'arm', name: 'FT-2 火焰喷射器', en: 'FT-2 Flamethrower', desc: '近距离持续喷射 · 点燃敌人持续灼烧 · 燃烧中的敌人伤害 −25%', type: 'flame', rate: 0.04, dmg: 8, speed: 60, spread: 0.08, life: 0.42, mag: 120, reload: 2, burn: 22, burnT: 2.5, sfx: 'flame' },
  cryo: { slot: 'arm', name: 'CR-3 冷冻枪', en: 'CR-3 Cryo Lance', desc: '冰晶连射 · 射程 70 m · 命中累积寒冷让敌人变慢 · 冻满后冰封 1.5 秒（瘫痪、受伤 +30%）', type: 'bullet', rate: 0.085, dmg: 8.5, speed: 230, spread: 0.007, life: 0.3, mag: 60, reload: 2.2, color: 0x9fe8ff, w: 0.26, len: 5, sfx: 'cryo', recoil: 0.1, chill: 5.5 },
  disc: { slot: 'arm', name: 'DS-7 回旋刃', en: 'DS-7 Ripper Disc', desc: '掷出贯穿锯刃 · 飞到 48 m 或撞墙后飞回手中 · 去程回程各命中一次 · 同时最多 2 片', type: 'disc', rate: 0.32, dmg: 56, speed: 72, range: 48, mag: 2, reload: 0, sfx: 'disc', recoil: 0.25 },
  pile: { slot: 'arm', name: 'PB-9 打桩机', en: 'PB-9 Pile Bunker', desc: '近战 · 锁定时冲刺 · 单体重击 · 贯穿护盾', type: 'pile', dmg: 430, range: 5.5, lunge: 26, cd: 1.3, cost: 20, sfx: 'pile' },
  sticky: { slot: 'arm', name: 'SB-5 粘性炸弹', en: 'SB-5 Sticky Launcher', desc: '低弧线粘弹 · 粘在敌机或地面上 1.2 秒后引爆 · 同一目标上每多一颗伤害 +25%', type: 'bullet', grenade: true, sticky: true, rate: 0.4, dmg: 60, splash: 5, speed: 95, grav: 14, spread: 0.006, mag: 6, reload: 2.4, color: 0xff5040, sfx: 'grenade', recoil: 0.45 },
  hook: { slot: 'arm', name: 'GH-2 钩爪发射器', en: 'GH-2 Grapple Hook', desc: '射出钩爪 70 m · 钩中小型敌机拖到面前并瘫痪 1.2 秒 · 钩中大型目标或墙体则把自己拉过去', type: 'hook', dmg: 110, range: 70, speed: 150, rate: 0.85, mag: 1, reload: 0, sfx: 'hook', recoil: 0.4 },
  sonic: { slot: 'arm', name: 'SW-6 音波炮', en: 'SW-6 Sonic Cannon', desc: '前方 32 m 扇形冲击波 · 击退并震慑敌机 0.35 秒 · 震散来袭子弹 · 镜面反射不了声波', type: 'sonic', rate: 0.75, dmg: 62, range: 32, cone: 0.5, push: 12, stun: 0.35, mag: 6, reload: 2.4, sfx: 'sonic', recoil: 0.7 },
  missile: { slot: 'shoulder', name: 'MS-6 飞弹巢', en: 'MS-6 Missile Pods', desc: '多重锁定 · 6 发追踪', type: 'missile', count: 6, dmg: 40, splash: 5, cd: 6.5, sfx: 'missile' },
  cannon: { slot: 'shoulder', name: 'PC-2 等离子炮', en: 'PC-2 Plasma Cannon', desc: '大范围爆炸 · 弹速慢', type: 'plasma', dmg: 165, splash: 9, speed: 105, cd: 3.4, sfx: 'cannon' },
  laser: { slot: 'shoulder', name: 'LZ-1 光束炮', en: 'LZ-1 Beam Laser', desc: '持续照射 2.2 秒', type: 'beam', dps: 135, dur: 2.2, range: 150, cd: 7.5, sfx: 'laser' },
  drones: { slot: 'shoulder', name: 'DP-4 攻击无人机', en: 'DP-4 Drone Pod', desc: '放出 2 架无人机 · 自动攻击 14 秒', type: 'drones', count: 2, dur: 14, dmg: 6, rate: 0.17, range: 80, cd: 18, sfx: 'drone' },
  emp: { slot: 'shoulder', name: 'EP-5 电磁脉冲', en: 'EP-5 EMP Burst', desc: '周围 26 m 敌机瘫痪 2.5 秒（头目 0.8 秒）· 瘫痪中受伤 +30% · 清除来袭弹药与地雷', type: 'emp', radius: 26, dmg: 85, stun: 2.5, bossStun: 0.8, cd: 11, sfx: 'emp' },
  rockets: { slot: 'shoulder', name: 'RP-12 火箭巢', en: 'RP-12 Rocket Pod', desc: '一次齐射 12 枚无制导火箭 · 扇形覆盖 · 会被风吹偏 · 每枚 30 / 4.5 m 溅射', type: 'rockets', n: 12, gap: 0.045, speed: 110, dmg: 30, splash: 4.5, spread: 0.14, cd: 8, sfx: 'missile' },
  icewall: { slot: 'shoulder', name: 'IW-1 冰墙', en: 'IW-1 Ice Wall', desc: '在身前 9 m 立起一排冰柱 · 挡住敌方子弹与视线，你的射击可以穿过 · 700 耐久 · 10 秒', type: 'icewall', hp: 700, dur: 10, cd: 15, sfx: 'freeze' },
  chaff: { slot: 'shoulder', name: 'CF-3 干扰弹', en: 'CF-3 Chaff', desc: '抛出一圈热焰弹 · 80 m 内来袭导弹全部转向 · 4 秒内探照灯看不见你', type: 'chaff', R: 80, dur: 4, cd: 11, sfx: 'decoy' },
  cluster: { slot: 'shoulder', name: 'CM-6 集束迫击炮', en: 'CM-6 Cluster Mortar', desc: '高抛弹道 · 下落时分裂成 10 枚子弹药 · 覆盖 11 m · 可越过掩体', type: 'cluster', range: 130, speed: 62, grav: 30, n: 10, R: 11, dmg: 42, splash: 4, cd: 9, sfx: 'grenade' },
  grav: { slot: 'shoulder', name: 'GW-1 重力井', en: 'GW-1 Gravity Well', desc: '发射奇点 · 3 秒内把周围敌机拖向中心并吞掉敌弹 · 结束时坍缩爆炸', type: 'grav', speed: 75, range: 95, R: 20, pull: 15, dur: 3, dps: 26, burst: 150, burstR: 11, cd: 14, sfx: 'grav' },
  blink: { slot: 'shoulder', name: 'BL-2 跃迁推进器', en: 'BL-2 Blink Drive', desc: '向移动方向瞬移 22 m · 0.35 秒无敌 · 挣断钩锁 · 原地残影 0.3 秒后爆裂 · 2 次充能（各 5.5 秒）', type: 'blink', dist: 22, inv: 0.35, burst: 110, burstR: 9, mag: 2, rech: 5.5, sfx: 'blink' },
  decoy: { slot: 'shoulder', name: 'HD-1 全息诱饵', en: 'HD-1 Holo Decoy', desc: '投射机体全息影像 6 秒 · 吸引敌方火力（头目不易上当）· 被打碎时放出电磁冲击', type: 'decoy', hp: 380, dur: 6, cd: 20, burst: 70, burstR: 11, sfx: 'decoy' },
  orbital: { slot: 'shoulder', name: 'OS-1 轨道打击', en: 'OS-1 Orbital Strike', desc: '标记落点 · 1.4 秒后卫星光柱从天而降 · 半径 9 m 重击 · 落点灼烧 2 秒 · 锁定时卫星跟踪目标直到落下前 0.4 秒', type: 'orbital', dmg: 360, R: 9, delay: 1.4, dps: 40, burnT: 2, range: 170, cd: 13, sfx: 'orbital' },
  pmines: { slot: 'shoulder', name: 'LM-3 跳雷', en: 'LM-3 Bounding Mines', desc: '在身边撒下 4 枚跳雷 · 0.6 秒后布防 · 敌机进入 9 m 水平范围（20 m 高度内）即弹起追击引爆 · 90 伤害 / 6 m · 存在 25 秒', type: 'pmines', n: 4, arm: 0.6, trig: 9, hmax: 20, dmg: 90, R: 6, life: 25, cd: 9, max: 12, sfx: 'minedrop' },
  rewind: { slot: 'shoulder', name: 'RW-3 时间回溯', en: 'RW-3 Rewind', desc: '按下：机体回到 3 秒前的位置，并找回这 3 秒内损失的装甲（最多 30%）· 0.4 秒无敌 · 原地留下的残影 0.5 秒后炸开 60 伤害 / 6 m · 冷却 15 秒', type: 'rewind', cd: 15, back: 3, cap: 0.3, inv: 0.4, burst: 60, burstR: 6 },
  pound: { slot: 'shoulder', name: 'GP-2 俯冲重击', en: 'GP-2 Ground Pound', desc: '空中按下：以 70 m/s 垂直砸向地面 · 落地冲击波的伤害和半径随下落高度增长（20 m 高约 190 伤害 / 11 m），震慑 0.6 秒并击退 · 下砸中受伤减半 · 在地面按下先跃起再砸', type: 'pound', cd: 6, base: 70, per: 6, r0: 6, rPer: 0.25, hMax: 40, hop: 30, hopT: 0.5, dive: 70, stun: 0.6, knock: 18 },
  rod: { slot: 'shoulder', name: 'LR-1 避雷针', en: 'LR-1 Lightning Rod', desc: '在前方 6 m 插下避雷针 14 秒 · 每 0.9 秒放电打 22 m 内最近的敌机（36，再连锁 1 个）· 雷暴里 14 m 内不会被雷劈 · 同时只能有 1 根', type: 'rod', dur: 14, zap: 0.9, dmg: 36, R: 22, chains: 2, cover: 14, cd: 18, sfx: 'sentry' },
  sentry: { slot: 'shoulder', name: 'TR-3 哨戒炮塔', en: 'TR-3 Sentry Turret', desc: '在前方架设自动炮塔 15 秒 · 双管速射 75 m 内敌机 · 吸引部分火力 · 耐久 400 · 同时只能有 1 座', type: 'sentry', hp: 400, dur: 15, dmg: 10, rate: 0.11, range: 75, cd: 22, sfx: 'sentry' },
  stasis: { slot: 'shoulder', name: 'TS-1 时滞场', en: 'TS-1 Stasis Field', desc: '在准星处展开 14 m 时滞球 5 秒 · 球内敌机动作放慢到三成、敌弹几乎停在空中 · 头目只放慢一半', type: 'stasis', range: 60, R: 14, dur: 5, k: 0.3, bossK: 0.6, shotK: 0.12, cd: 17, sfx: 'stasis' },
  smoke: { slot: 'shoulder', name: 'SM-2 烟幕弹', en: 'SM-2 Smoke Screen', desc: '在身前炸开 12 m 烟幕 8 秒 · 烟幕外的敌人看不穿它，无法瞄准烟里的你 · 已发射的导弹照样追踪', type: 'smoke', R: 12, dur: 8, cd: 16, sfx: 'smoke' },
  sonar: { slot: 'shoulder', name: 'SN-1 声呐脉冲', en: 'SN-1 Sonar Pulse', desc: '向四周发出声呐波 · 75 m 内敌机标记 7 秒（受伤 +25%、隐身失效、干扰机停摆）· 近身 10 m 冲击', type: 'sonar', R: 75, mark: 7, vuln: 1.25, bossVuln: 1.12, burst: 45, burstR: 10, cd: 11, sfx: 'sonar' },
  shield: { slot: 'shoulder', name: 'AS-3 能量护盾', en: 'AS-3 Aegis Shield', desc: '展开 3 秒 · 正面伤害 −85%', type: 'shield', dur: 3, cd: 9, block: 0.85, arc: 0.15, sfx: 'shield' },
};
export const ARM_KEYS = ['siphon', 'acid', 'needler', 'ricochet', 'rifle', 'gatling', 'shotgun', 'flamer', 'cryo', 'grenade', 'sticky', 'coil', 'disc', 'hook', 'sonic', 'flak', 'rail', 'blade', 'pile'];
export const SHOULDER_KEYS = ['rewind', 'pound', 'rod', 'pmines', 'missile', 'cannon', 'laser', 'shield', 'drones', 'emp', 'decoy', 'grav', 'orbital', 'blink', 'sonar', 'sentry', 'smoke', 'stasis', 'cluster', 'chaff', 'icewall', 'rockets'];

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
  if (team === 'P' && G.pBoostT > 0) dmg *= SUPPLY.dmg;
  if (team === 'P') { const h = ent.kind === 'cpart' ? ent.owner : ent; if (h.stunT > 0) dmg *= STUN_VULN; if (h.markT > 0) dmg *= h.maxHp > 3000 ? WEAPONS.sonar.bossVuln : WEAPONS.sonar.vuln; if (h.corr > 0) { G.corrBonus = (G.corrBonus || 0) + dmg * CORR.per * h.corr; dmg *= 1 + CORR.per * h.corr; } if (h.hornT > 0) { G.hornBlocked = (G.hornBlocked || 0) + dmg * (1 - HERALD.hornK); dmg *= HERALD.hornK; } }   // EMP-stunned targets take extra damage
  if ((team === 'P' || team === 'X') && !G.pierce && !ent.isBarrel && !ent.isMine && !ent.isPlayer && !ent.isAlly && G.player) {   // warden dome: hits from outside are absorbed
    const w = domeAt(ent.c);
    if (w && G.player.pos.distanceTo(w.pos) > w.R) { w.absorb(dmg, domeEntry(w, G.player.center(_c), ent.c, new V3())); if (team === 'P' && !isAlly(label || G.curLabel)) G.stats.hits++; return; }
  }
  ent.hit(dmg, at, label || G.curLabel);
  if (team === 'P' && !ent.isBarrel && !isAlly(label || G.curLabel)) { G.stats.hits++; G.stats.dmgDealt += dmg; G.hud.hit = 0.14; if (G.od && !(G.od.t > 0) && !ent.isCore) G.od.k = Math.min(1, G.od.k + dmg / OD.fill * (G.odGain || 1)); }
}

const BURN_WEAK = 0.75, STUN_VULN = 1.3;
const isAlly = (l) => !!l && l.startsWith('ally');
export function hurtPlayer(dmg, label) { G.curSrc = null; damagePlayer(dmg, null, label); }
function damagePlayer(dmg, src, label) {
  const p = G.player; if (!p || !p.alive || G.godMode || G.blinkInv > 0) return;
  const blk = shieldBlock(p, src || G.curSrc);
  if (blk) { G.stats.blocked = (G.stats.blocked || 0) + dmg * blk; if (Math.random() < 0.3) sfx('shield', 0); }
  if (G.curShooter && G.curShooter.rally) { dmg *= HERALD.dmg; G.rallyHits = (G.rallyHits || 0) + 1; }   // rallied by a herald
  if (G.curShooter && G.curShooter.emp) dmg *= SUPPLY.empDmg;   // empowered by a supply crate
  if (G.pound && G.pound.st === 'dive') dmg *= 0.5;
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
  if (o.flak) s.flak = o.flak; if (o.sticky) s.sticky = true;
  if (s.team === 'E' && G.curShooter) G.curShooter.pingT = FOG.ping;   // fog harbour: firing shows you on the radar
  if (s.team === 'E' && G.curShooter && G.curShooter.rally) s.dmg *= HERALD.dmg;
  if (s.team === 'E' && G.curShooter && G.curShooter.emp) s.dmg *= SUPPLY.empDmg;
  if (s.team === 'E' && G.curShooter && G.curShooter.burnT > 0) s.dmg *= BURN_WEAK;   // burning enemies fire weakened shots
  G.shots.push(s);
  return s;
}

function impact(s, at, ent) {
  const fx = G.fx; G.curLabel = s.label;
  if (s.sticky) { stickAt(s, at, ent); return; }
  if (s.cluster) { splitCluster(s, at.clone().setY(at.y + 2)); return; }
  if (s.bomblet) { explodeAt(at, s.splash, s.dmg, s.team, 0.45, 0xffb050); return; }
  if (s.flak && s.team === 'P') {   // flak shell: airburst
    explodeAt(at, s.splash, s.dmg, 'P', 0.36, 0xffc060); G.flakBursts = (G.flakBursts || 0) + 1;
    fx.sparks(at, null, 14, 0xffd090, 18, 0.7, 0.3, 0.18); fx.emit('smoke', { x: at.x, y: at.y, z: at.z, vy: 0.4, life: 1.2, s0: 1.5, s1: 3.5, c0: 0x4a4440, c1: 0x2a2624, a0: 0.55, drag: 1.5 });
    return;
  }
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
    if (s.needle && ent && !ent.isBarrel && !ent.isPlayer && !ent.isMine && !ent.isAlly) embedNeedle(ent, at);
    if (s.acid) acidSplash(ent, at, s.dmg);
    if (s.siphon && ent && ent.alive !== false && !ent.isBarrel && !ent.isPlayer && !ent.isMine && !ent.isAlly && !ent.holo && G.player && G.player.alive) { const P = G.player, h = Math.min(P.maxHp - P.hp, s.dmg * s.siphon); if (h > 0) { P.hp += h; G.siphonHeal = (G.siphonHeal || 0) + h; } }
    if (s.jamOrb && ent && ent.isPlayer) jamPlayer();
    if (s.chill && ent && ent.alive && !ent.isBarrel && !ent.isPlayer && !ent.isMine && !ent.isAlly) { chillAdd(ent.kind === 'cpart' ? ent.owner : ent, s.chill); fx.sparks(at, null, 3, 0xd8f6ff, 6, 0.8, 0.3, 0.2); }
    fx.sparks(at, _a.copy(s.v).normalize().multiplyScalar(-1), ent ? 6 : 4, s.team === 'P' ? 0xffd27a : 0xff7a50, 14, 0.8, 0.25, 0.22);
    fx.emit('add', { x: at.x, y: at.y, z: at.z, life: 0.08, s0: ent ? 1.4 : 0.9, c0: s.color });
    if (ent && ent.isPlayer) sfx('hurt');
    if (s.frostP && ent && ent.isPlayer) addPChill(s.frostP);
    if (s.frostP) fx.emit('add', { x: at.x, y: at.y, z: at.z, life: 0.25, s0: 2.2, s1: 0.4, c0: 0xc8f2ff });
  }
}

function updateShots(DT) {
  const fx = G.fx;
  const entsP = entsFor('P'), entsE = entsFor('E');
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i]; RAYF.skipIce = s.team === 'P';
    const dt = s.team === 'E' && G.stasis.length ? DT * stasisShotK(s.x, s.y, s.z) : DT;   // enemy shots crawl inside a stasis field
    s.age += dt; s.life -= dt;
    if (s.frostP && s.age > 0.12 && G.player && G.player.alive) {   // frost orbs bend gently toward you: a sideways boost still beats them
      const sp = s.v.length(), pc = G.player.center(_c); _a.set(pc.x - s.x, pc.y - s.y, pc.z - s.z).normalize(); _b.copy(s.v).divideScalar(sp || 1);
      if (_a.dot(_b) > 0.2) { _b.lerp(_a, Math.min(1, 0.9 * dt)).normalize(); s.v.copy(_b).multiplyScalar(sp); }
      if (Math.random() < 0.5) fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.25, s0: 0.9, s1: 0.2, c0: 0xc8f2ff });
    }
    if (s.team === 'P' && s.kind === 'bullet' && G.defl && G.defl.length) deflectShot(s, dt);
    if (s.needle && s.target && s.target.alive && !s.target.dying && s.target.c && s.age > 0.04) {   // needles curve toward the locked target
      const sp = s.v.length(); _a.subVectors(s.target.c, _c.set(s.x, s.y, s.z)).normalize(); _b.copy(s.v).divideScalar(sp || 1);
      if (_a.dot(_b) > 0.3) { _b.lerp(_a, Math.min(1, 3.2 * dt)).normalize(); s.v.copy(_b).multiplyScalar(sp); }
    }
    if (G.rift) riftShot(s);
    if (s.jamOrb && s.age > 0.1 && G.player && G.player.alive) {   // violet orbs bend slowly toward you: a sideways boost beats them
      const sp = s.v.length(), pc = G.player.center(_c); _a.set(pc.x - s.x, pc.y - s.y, pc.z - s.z).normalize(); _b.copy(s.v).divideScalar(sp || 1);
      if (_a.dot(_b) > 0.3) { _b.lerp(_a, Math.min(1, DISARM.turn * dt)).normalize(); s.v.copy(_b).multiplyScalar(sp); }
      if (Math.random() < 0.6) fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.25, s0: 1.2, s1: 0.2, c0: 0xd080ff });
    }
    if (s.acid) { s.v.y -= CORR.grav * dt; if (Math.random() < 0.5) fx.emit('add', { x: s.x, y: s.y, z: s.z, life: 0.12, s0: 0.9, s1: 0.3, c0: 0xa0ff40, c1: 0x408010 }); }
    if (WIND.on && s.kind !== 'flame') { const wk = s.kind === 'bullet' || s.kind === 'ebullet' ? 0.25 : 0.9; s.v.x += WIND.x * wk * dt; s.v.z += WIND.z * wk * dt; }
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
      if (s.cluster && s.v.y < 0 && (s.y - groundAt(s.x, s.z, s.y) < 18 || Math.hypot(s.x - s.cluster.aim.x, s.z - s.cluster.aim.z) < 5)) { splitCluster(s, new V3(s.x, s.y, s.z)); G.shots.splice(i, 1); continue; }
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
    if (s.flak) {   // proximity fuse (player flak; airship bombs)
      let near = null;
      for (const e of (s.team === 'P' ? entsP : entsE)) if (!e.isBarrel && !e.isMine && e.alive && e.c.distanceTo(_b) < s.flak + (e.r || 1) * 0.5) { near = e; break; }
      if (near) { impact(s, _b.clone(), null); G.shots.splice(i, 1); continue; }
    }
    // vs entities
    const h = segHit(_a, _b, s.team === 'P' ? entsP : entsE, s.kind === 'plasma' ? 0.6 : s.frostP ? 1.1 : s.kind === 'flame' ? 0.4 + s.age * 2.5 : 0);
    // vs world
    const L = _a.distanceTo(_b); _d.subVectors(_b, _a).divideScalar(L || 1);
    const w = raySolids(_a, _d, L);
    if (h && h.t * L <= w.t) {
      _c.lerpVectors(_a, _b, h.t);
      if (h.ent.kind === 'prism' && s.team === 'P' && (s.kind === 'bullet' || s.kind === 'missile') && h.ent.reflects(s, _a)) {
        const pr = h.ent; G.prismRefl = (G.prismRefl || 0) + 1; pr.glint = 0.12;
        if (isAlly(s.label) || !G.player || !G.player.alive) { G.fx.sparks(_c, null, 5, 0x9ff6ff, 10, 1, 0.2, 0.2); G.shots.splice(i, 1); continue; }
        const tc = G.player.center(new V3());
        const sp = s.v.length();
        s.v.subVectors(tc, _c).normalize(); s.v.x += (Math.random() - 0.5) * 0.04; s.v.y += (Math.random() - 0.5) * 0.04; s.v.z += (Math.random() - 0.5) * 0.04;
        s.v.normalize().multiplyScalar(Math.min(sp, s.kind === 'missile' ? 70 : 220));
        s.x = _c.x + s.v.x * 0.02; s.y = _c.y + s.v.y * 0.02; s.z = _c.z + s.v.z * 0.02;
        s.team = 'E'; s.dmg *= PRISM.refl; s.label = 'prism-reflect'; s.color = 0x80f0ff; s.age = 0; s.life = Math.max(s.life, 1.4); s.chill = 0;
        if (s.kind === 'bullet') s.kind = 'ebullet';
        else { s.target = null; s.aim = tc; s.turn = 1.2; }
        if (Math.random() < 0.5) G.fx.sparks(_c, s.v.clone().normalize(), 4, 0xb0f8ff, 12, 0.6, 0.2, 0.2);
        if (Math.random() < 0.15) sfx('prism', G.player.pos.distanceTo(pr.pos));
        continue;
      }
      impact(s, _c.clone(), h.ent); G.shots.splice(i, 1); continue;
    }
    if (w.solid) {
      _c.copy(_a).addScaledVector(_d, w.t);
      if (s.bounce > 0 && w.solid.kind !== 'icewall' && w.solid.kind !== 'barrel') { ricochet(s, _c.clone(), w.solid); continue; }
      impact(s, _c.clone(), null);
      if (w.solid.isBarrel === undefined && w.solid.ref && w.solid.kind === 'barrel') hitBarrel(w.solid.ref, s.dmg);
      if (w.solid.kind === 'icewall') hitIceWall(w.solid.ref, s.dmg, _c);
      G.shots.splice(i, 1); continue;
    }
    s.x = _b.x; s.y = _b.y; s.z = _b.z;
    if (s.life <= 0 || Math.abs(s.x) > 400 || Math.abs(s.z) > 400) {
      if (s.kind === 'missile' || s.kind === 'plasma' || s.kind === 'grenade' || s.flak) impact(s, _b.clone(), null);
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
  RAYF.skipIce = team === 'P';
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
          spawnShot({ p: mp, v: _d.clone().normalize().multiplyScalar(v), dmg: d.dmg * dmgMul, team, kind: 'grenade', splash: d.splash, grav: g, life: 5, color: d.color, sticky: d.sticky && team === 'P' });
          fx.muzzle(mp, _d, 0xffb060, 1.5); mslot.recoil = Math.min(0.6, (mslot.recoil || 0) + d.recoil);
          if (me) { G.stats.shots++; fx.trauma = Math.min(1, fx.trauma + 0.08); }
          sfx(d.sfx, dist); continue;
        }
        for (let k = 0; k < n; k++) {
          _d.subVectors(aim, mp).normalize();
          const spr = n > 1 ? d.spread * (isP ? 1 : 1.3) : d.spread * (isP ? 2 : 6);
          _d.x += (Math.random() - 0.5) * spr; _d.y += (Math.random() - 0.5) * spr; _d.z += (Math.random() - 0.5) * spr;
          _d.normalize();
          const sh = spawnShot({ p: mp, v: _d.clone().multiplyScalar(d.speed * (n > 1 ? 0.9 + Math.random() * 0.2 : 1)), dmg: d.dmg * dmgMul, team, kind: isP ? 'bullet' : 'ebullet', color: isP ? d.color : 0xff6a40, w: d.w, len: d.len, life: d.life || 1.6, chill: isP && team === 'P' ? d.chill : 0 });
          if (d.flak && team === 'P') { sh.flak = d.flak; sh.splash = d.splash; }
          if (d.bounce && team === 'P') sh.bounce = d.bounce;
          if (d.acid && team === 'P') sh.acid = true;
          if (d.siphon && me) sh.siphon = d.siphon;
          if (d.needle && team === 'P') { sh.needle = true; sh.target = target && target.alive ? target : null; }
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
  } else if (d.type === 'sonic') {
    if (held && ws.cd <= 0 && ws.reloadT <= 0 && ws.ammo > 0) {
      ws.cd = d.rate; ws.ammo--;
      const mp = owner.muzzlePos(slot, _a).clone();
      const dir = new V3().subVectors(aim, mp); dir.y *= 0.5; dir.normalize();
      const cc = Math.cos(d.cone);
      const ents = entsFor(enemyTeam).filter((e) => !e.isBarrel || isP);
      const done = new Set();
      for (const e of ents) {
        const host = e.kind === 'cpart' ? e.owner : e;
        if (done.has(host)) continue;
        _c.subVectors(e.c, mp); const dd = _c.length(); if (dd > d.range + e.r) continue;
        const cs = _c.dot(dir) / Math.max(dd, 0.01);
        if (cs < cc && !(dd < 7 && cs > 0)) continue;
        if (!clearLine(mp, e.c)) continue;
        done.add(host);
        const k = 1 - 0.5 * Math.min(1, dd / d.range);
        dealDamage(e, d.dmg * dmgMul * k, team, e.c);
        fx.sparks(e.c, dir, 8, 0xffc060, 14, 1, 0.3, 0.3);
        const big = host.maxHp > 3000 || host.kind === 'boss' || host.kind === 'raider' || host.isPlayer;
        if (!big && host.alive && host.pos && !host.isBarrel && !host.isMine) {
          const push = d.push * (1 - Math.min(1, dd / d.range) * 0.6);
          const ox = host.pos.x, oz = host.pos.z;
          _b.set(e.c.x - mp.x, 0, e.c.z - mp.z).normalize();
          host.pos.x += _b.x * push; host.pos.z += _b.z * push;
          if (pointInSolid(new V3(host.pos.x, host.pos.y + 1, host.pos.z), host.r || 2)) { host.pos.x = ox + _b.x * push * 0.3; host.pos.z = oz + _b.z * push * 0.3; if (pointInSolid(new V3(host.pos.x, host.pos.y + 1, host.pos.z), host.r || 2)) { host.pos.x = ox; host.pos.z = oz; } }
          if (host.vel) host.vel.multiplyScalar(0.2);
          host.stunT = Math.max(host.stunT || 0, d.stun); host.stunMax = host.stunT;
        }
      }
      // shatter incoming fire inside the cone
      for (let i = G.shots.length - 1; i >= 0; i--) {
        const q = G.shots[i]; if (q.team === team) continue;
        _c.set(q.x - mp.x, q.y - mp.y, q.z - mp.z); const dd = _c.length(); if (dd > d.range) continue;
        if (_c.dot(dir) / Math.max(dd, 0.01) < cc - 0.08) continue;
        fx.sparks(_b.set(q.x, q.y, q.z), null, 4, 0xffd080, 8, 1, 0.2, 0.2); G.shots.splice(i, 1); if (me) G.sonicEat = (G.sonicEat || 0) + 1;
      }
      for (let r = 0; r < 4; r++) fx.ring(_b.copy(mp).addScaledVector(dir, 3 + r * 7), dir, 0.8 + r * 2.4, 2.5 + r * 3.6, 0.22 + r * 0.05, r % 2 ? 0xffd890 : 0xffa040);
      fx.muzzle(mp, dir, 0xffc060, 2.2); fx.flash(mp, 0xffb050, 14, 18, 0.1);
      mslot.recoil = Math.min(0.8, (mslot.recoil || 0) + d.recoil);
      if (me) { G.stats.shots++; fx.trauma = Math.min(1, fx.trauma + 0.12); }
      sfx('sonic', dist);
      if (ws.ammo <= 0) startReload();
    }
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
  } else if (d.type === 'rockets') {
    if (pressed && ws.cd <= 0) { ws.cd = d.cd; fireRockets(owner, slot, d, aim, dmgMul, team); if (me) G.stats.shots += d.n; }
  } else if (d.type === 'icewall') {
    if (pressed && ws.cd <= 0 && isP) { if (raiseIceWall(owner, d)) { ws.cd = d.cd; if (me) G.stats.shots++; } else ws.cd = 0.5; }
  } else if (d.type === 'chaff') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; popChaff(owner, slot, d); if (me) G.stats.shots++; }
  } else if (d.type === 'cluster') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; fireCluster(owner, slot, d, aim, dmgMul, team); if (me) G.stats.shots++; }
  } else if (d.type === 'stasis') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; castStasis(owner, slot, d, aim); if (me) G.stats.shots++; }
  } else if (d.type === 'smoke') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; popSmoke(owner, slot, d); if (me) G.stats.shots++; }
  } else if (d.type === 'pmines') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; dropPMines(owner, d, dmgMul); sfx('minedrop', dist); if (me) G.stats.shots += d.n; }
  } else if (d.type === 'rod') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; new Rod(owner, slot, d, dmgMul); sfx('sentry', dist); if (me) G.stats.shots++; }
  } else if (d.type === 'sentry') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; new Sentry(owner, slot, d, dmgMul); sfx('sentry', dist); if (me) G.stats.shots++; }
  } else if (d.type === 'decoy') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; new Decoy(owner, slot, d, dmgMul); sfx('decoy', dist); if (me) G.stats.shots++; }
  } else if (d.type === 'grav') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; launchWell(owner, slot, d, dmgMul, aim); sfx('cannon', dist); if (me) G.stats.shots++; }
  } else if (d.type === 'hook') {
    const out = G.hooks.some((h) => h.owner === owner && h.slot === slot);
    if (held && ws.cd <= 0 && !out && isP && owner.alive) { ws.cd = d.rate; fireHook(owner, slot, d, dmgMul, aim); if (me) G.stats.shots++; mslot.recoil = 1; }
    for (const m of mslot.models) { const hk = m._hook || (m._hook = find(m, 'HK_Head')); if (hk) hk.visible = !out; }
  } else if (d.type === 'disc') {
    if (held && ws.cd <= 0 && ws.ammo > 0 && isP) { ws.cd = d.rate; ws.ammo--; throwDisc(owner, slot, ws, d, dmgMul, aim); if (me) G.stats.shots++; mslot.recoil = 1; }
    for (const m of mslot.models) { const dk = m._disc || (m._disc = find(m, 'DS_Disc')); if (dk) { dk.visible = ws.ammo > 0; dk.rotation.y += dt * 8; } }
  } else if (d.type === 'rewind') {
    if (pressed && ws.cd <= 0 && me && owner.alive && doRewind(owner, d, dmgMul)) { ws.cd = d.cd; G.stats.shots++; }
  } else if (d.type === 'pound') {
    if (pressed && ws.cd <= 0 && me && owner.alive && !G.pound) { ws.cd = d.cd; startPound(owner, d, dmgMul); G.stats.shots++; }
  } else if (d.type === 'blink') {
    if (ws.ammo < d.mag) { ws.rechT = (ws.rechT ?? d.rech) - dt; if (ws.rechT <= 0) { ws.ammo++; ws.rechT = d.rech; } } else ws.rechT = d.rech;
    if (pressed && ws.cd <= 0 && ws.ammo > 0 && isP && owner.alive) { ws.cd = 0.4; ws.ammo--; blinkJump(owner, d, dmgMul); if (me) G.stats.shots++; }
  } else if (d.type === 'orbital') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; launchStrike(owner, slot, d, dmgMul, aim, target); if (me) G.stats.shots++; }
  } else if (d.type === 'emp') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; empPulse(owner, d, dmgMul); if (me) G.stats.shots++; }
  } else if (d.type === 'sonar') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; sonarPulse(owner, slot, d, dmgMul); if (me) G.stats.shots++; }
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

// ------------------------------------------------------------------ SN-1 sonar: mark every enemy in range (no line of sight needed)
function sonarPulse(owner, slot, d, mul) {
  const fx = G.fx, c = owner.center(new V3()), g = new V3(owner.pos.x, owner.pos.y + 0.5, owner.pos.z);
  fx.ring(g, null, 2, d.R, 0.9, 0x40f0e0); fx.ring(g, null, 1, d.R * 0.6, 0.6, 0xa8fff4); fx.ring(c, null, 1, d.burstR * 1.3, 0.3, 0xffffff);
  fx.flash(c, 0x40f0e0, 26, 30, 0.2);
  G.queue.push({ label: 'p-sonar', t: 0.25, fn: () => fx.ring(g, null, 2, d.R * 0.85, 0.7, 0x40f0e0) });
  sfx('sonar', 0);
  let n = 0;
  for (const e of G.enemies) {
    if (!e.alive || e.dying || e.c.distanceTo(c) > d.R) continue;
    e.markT = d.mark; n++;
    if (e.c.distanceTo(c) < d.burstR + (e.r || 1) * 0.6) { G.curLabel = 'p-sonar'; dealDamage(e.parts ? e.parts[0] : e, d.burst * mul, 'P', e.c, 'p-sonar'); }
  }
  for (const m of G.mines) if (m.alive && m.pos.distanceTo(c) < d.R) m.markT = d.mark;
  G.marks = (G.marks || 0) + n; G.pings = (G.pings || 0) + 1;
}
function updateMarks(dt) {
  for (const e of G.enemies) {
    if (!(e.markT > 0)) continue;
    e.markT -= dt; if (!e.alive || e.dying) continue;
    e._mk = (e._mk || 0) - dt;
    if (e._mk <= 0) { e._mk = 0.12; G.fx.emit('add', { x: e.c.x, y: e.c.y + (e.r || 2) + 1.4, z: e.c.z, vy: 0.6, life: 0.22, s0: 2.0, s1: 0.7, c0: e.markT < 1.5 && Math.sin(G.time * 20) > 0 ? 0xffffff : 0x40f0e0 }); }
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

// ------------------------------------------------------------------ TR-3 sentry: a turret dropped a few metres ahead that tracks and
// shoots the nearest visible enemy for 18 s. Enemies weigh it a little below the player, so it soaks some fire; one at a time.
export class Sentry {
  constructor(owner, slot, d, dmgMul) {
    for (const f of G.friends.slice()) if (f instanceof Sentry) f.end(false);
    this.isSentry = true; this.d = d; this.dmg = d.dmg * dmgMul; this.t = d.dur; this.maxHp = d.hp; this.hp = d.hp; this.alive = true;
    this.foeW = 1.0; this.foeWAir = 0.95; this.foeWBoss = 1.2;
    this.vel = new V3(); this.fireT = 0.6; this.tgt = null; this.tgtT = 0; this.ph = 0; this.owner = owner; this.drop = 0.45;
    const a = owner.aimYaw;
    const p = new V3(owner.pos.x - Math.sin(a) * 6, 0, owner.pos.z - Math.cos(a) * 6);
    if (pointInSolid(new V3(p.x, 1, p.z), 2) || (PLAT.R && Math.hypot(p.x, p.z) > PLAT.R - 4)) p.set(owner.pos.x, 0, owner.pos.z);
    p.y = groundAt(p.x, p.z, owner.pos.y + 2);
    this.pos = p;
    this.obj = cloneKit('D_Sentry'); if (owner.paletteKey) recolor(this.obj, PALETTES[owner.paletteKey], owner.paletteKey);
    this.obj.scale.setScalar(1.35); this.obj.position.copy(p).setY(p.y + 6); this.obj.rotation.y = a;
    this.n = nodes(this.obj); this.head = this.n.SY_Head;
    G.scene.add(this.obj);
    this._ent = { isAlly: true, isSentry: true, c: new V3(), r: 1.6, get alive() { return this.w.alive; }, w: this, hit: (dmg) => this.damage(dmg) };
    G.friends.push(this); G.sentries = (G.sentries || 0) + 1;
    G.fx.streak(owner.muzzlePos(slot, new V3(), 0).clone(), this.obj.position, 0.4, 0x9fe8ff);
    for (const e of G.enemies) if (e.foe === G.player && e.c && e.c.distanceTo(p) < 90) e.tgT = 0;
  }
  center(out) { return out.set(this.pos.x, this.pos.y + 1.8, this.pos.z); }
  damage(dmg) {
    if (!this.alive) return;
    this.hp -= dmg * G.diff.dmg; this.flash = 0.1;
    G.sentryDmg = (G.sentryDmg || 0) + dmg * G.diff.dmg;
    if (this.hp <= 0) this.end(true);
  }
  end(broken) {
    if (!this.alive) return;
    this.alive = false;
    const c = this.center(new V3());
    if (broken) { G.fx.explosion(c, 0.6, 0xffb060); sfx('boom', G.player.pos.distanceTo(c)); }
    else { G.fx.sparks(c, null, 12, 0x9fe8ff, 10, 1, 0.4, 0.22); G.fx.ring(new V3(this.pos.x, this.pos.y + 0.3, this.pos.z), null, 1, 4, 0.3, 0x9fe8ff); }
    this.obj.parent && this.obj.parent.remove(this.obj);
    const i = G.friends.indexOf(this); if (i >= 0) G.friends.splice(i, 1);
    for (const e of G.enemies) if (e.foe === this) e.tgT = 0;
  }
  update(dt) {
    this.t -= dt; this.ph += dt;
    if (this.t <= 0) { this.end(false); return; }
    if (this.drop > 0) {   // falls into place from the shoulder rack
      this.drop -= dt; const k = Math.max(0, this.drop / 0.45);
      this.obj.position.y = this.pos.y + 6 * k * k;
      if (this.drop <= 0) { G.fx.ring(new V3(this.pos.x, this.pos.y + 0.3, this.pos.z), null, 1, 5, 0.35, 0x9fe8ff); G.fx.smoke(this.pos, 4, 2, 2, 0x8a8a8a, 1.2, 0.8); sfx('pile', G.player.pos.distanceTo(this.pos) * 0.6); }
      return;
    }
    const P = this.center(_a).clone();
    this.tgtT -= dt;
    if (this.tgtT <= 0) {
      this.tgtT = 0.3; this.tgt = null; let bd = this.d.range;
      for (const e of entsFor('P')) {
        if (e.isBarrel || e.isMine || e.cloaked) continue;
        const dd = e.c.distanceTo(P); if (dd < bd && clearLine(P, e.c)) { bd = dd; this.tgt = e; }
      }
    }
    const t = this.tgt && this.tgt.alive ? this.tgt : null;
    const want = t ? Math.atan2(-(t.c.x - P.x), -(t.c.z - P.z)) - this.obj.rotation.y : Math.sin(this.ph * 0.6) * 0.9;
    this.head.rotation.y += angDiff(want, this.head.rotation.y) * Math.min(1, dt * (t ? 9 : 2));
    if (this.flash > 0) this.flash -= dt;
    this.fireT -= dt;
    if (t && this.fireT <= 0 && Math.abs(angDiff(want, this.head.rotation.y)) < 0.25) {
      this.fireT = this.d.rate * (0.9 + Math.random() * 0.2);
      const mp = this.n.Muzzle_Sentry.getWorldPosition(new V3());
      _d.subVectors(t.c, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.025; _d.y += (Math.random() - 0.5) * 0.02; _d.z += (Math.random() - 0.5) * 0.025;
      spawnShot({ p: mp, v: _d.normalize().multiplyScalar(270), dmg: this.dmg, team: 'P', kind: 'bullet', color: 0x9fe8ff, w: 0.16, len: 4.5, life: 0.6, label: 'sentry' });
      G.fx.muzzle(mp, _d, 0x9fe8ff, 0.6);
      G.stats.shots++;
      if (Math.random() < 0.4) sfx('dronefire', G.player.pos.distanceTo(mp));
    }
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
// ripper disc: a spinning blade thrown along the aim; it flies out to `range` (or the first wall), then homes back to the
// launcher. Pierces everything on the way, hitting each target once going out and once coming back. Ammo returns on catch.
G.discs = [];
const discGeo = { body: new THREE.CylinderGeometry(0.72, 0.72, 0.08, 20), edge: new THREE.TorusGeometry(0.74, 0.07, 6, 28).rotateX(Math.PI / 2), hub: new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10) };
const discMat = { body: new THREE.MeshStandardMaterial({ color: 0x8a8f9a, metalness: 0.8, roughness: 0.3 }), edge: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4ad8).multiplyScalar(2.4), toneMapped: false }) };
function throwDisc(owner, slot, ws, d, mul, aim) {
  const mp = owner.muzzlePos(slot, new V3(), 0).clone();
  _d.subVectors(aim, mp); const L = Math.max(16, Math.min(d.range, _d.length() + 6)); _d.normalize();
  const o = new THREE.Group();
  o.add(new THREE.Mesh(discGeo.body, discMat.body), new THREE.Mesh(discGeo.edge, discMat.edge), new THREE.Mesh(discGeo.hub, discMat.edge));
  o.rotation.z = (Math.random() - 0.5) * 0.4; o.position.copy(mp); G.scene.add(o);
  G.discs.push({ o, owner, slot, ws, d, mul, dir: _d.clone(), left: L, back: false, hit: new Set(), t: 0, prev: mp.clone(), sndT: 0 });
  sfx('disc', G.player ? G.player.pos.distanceTo(mp) : 0);
}
function updateDiscs(dt) {
  const fx = G.fx;
  for (let i = G.discs.length - 1; i >= 0; i--) {
    const D = G.discs[i], P = D.o.position, d = D.d;
    D.t += dt; D.prev.copy(P); D.o.rotateY(dt * 32);
    let done = false;
    if (!D.back) {
      const st = d.speed * dt, w = raySolids(P, D.dir, st + 0.6);
      if (w.t < st + 0.6) { P.addScaledVector(D.dir, Math.max(0, w.t - 0.6)); D.back = true; D.hit.clear(); fx.sparks(P, null, 10, 0xff9ae8, 14, 1, 0.3, 0.2); sfx('ric', G.player.pos.distanceTo(P)); }
      else { P.addScaledVector(D.dir, st); D.left -= st; if (D.left <= 0) { D.back = true; D.hit.clear(); } }
    } else {
      if (!D.owner.alive || D.t > 5) done = true;
      else {
        const tg = D.owner.muzzlePos(D.slot, _a, 0); _b.subVectors(tg, P);
        const dist = _b.length(), st = d.speed * (1 + Math.min(0.7, D.t * 0.35)) * dt;
        if (dist < Math.max(1.6, st)) { done = true; if (D.owner === G.player) sfx('catch', 0); }
        else P.addScaledVector(_b.multiplyScalar(1 / dist), st);
      }
    }
    if (!done) {
      _c.subVectors(P, D.prev); const L2 = _c.lengthSq();
      const prev = G.curLabel; G.curLabel = 'p-disc';
      for (const e of entsFor('P')) {
        if (D.hit.has(e) || e.isMine) continue;
        _d.subVectors(e.c, D.prev); let k = L2 > 0 ? _d.dot(_c) / L2 : 0; k = Math.max(0, Math.min(1, k));
        const dx = D.prev.x + _c.x * k - e.c.x, dy = D.prev.y + _c.y * k - e.c.y, dz = D.prev.z + _c.z * k - e.c.z;
        const r = (e.r || 1) + 0.8;
        if (dx * dx + dy * dy + dz * dz < r * r) {
          D.hit.add(e); dealDamage(e, d.dmg * D.mul, 'P', e.c, 'p-disc');
          fx.sparks(_a.set(e.c.x + dx * 0.5, e.c.y + dy * 0.5, e.c.z + dz * 0.5), null, 7, 0xffb0f0, 12, 1, 0.25, 0.2);
          G.discHits = (G.discHits || 0) + 1;
        }
      }
      G.curLabel = prev;
      fx.emit('add', { x: P.x, y: P.y, z: P.z, life: 0.16, s0: 1.3, s1: 0.2, c0: 0xff5ae0 });
      D.sndT -= dt; if (D.sndT <= 0) { D.sndT = 0.16; if (Math.random() < 0.5) sfx('whirr', G.player.pos.distanceTo(P)); }
      continue;
    }
    D.ws.ammo = Math.min(d.mag, D.ws.ammo + 1);
    D.o.parent && D.o.parent.remove(D.o); G.discs.splice(i, 1);
  }
}
// blink drive: hop up to `dist` along the move direction (aim direction when standing), stopping short of walls.
// Brief invulnerability, snaps any tether, and the afterimage left behind bursts after 0.3 s.
function blinkJump(owner, d, mul) {
  const p = owner.pos, h = Math.hypot(owner.vel.x, owner.vel.z);
  let dx, dz; if (h > 4) { dx = owner.vel.x / h; dz = owner.vel.z / h; } else { dx = -Math.sin(owner.aimYaw); dz = -Math.cos(owner.aimYaw); }
  const from = p.clone(); _d.set(dx, 0, dz);
  let L = d.dist;
  for (const y of [1.2, 3.4]) { const w = raySolids(_a.set(p.x, p.y + y, p.z), _d, d.dist + 3); L = Math.min(L, w.t - 3); }
  L = Math.max(0, L);
  const lim = ARENA - 3;
  p.x = Math.max(-lim, Math.min(lim, p.x + dx * L)); p.z = Math.max(-lim, Math.min(lim, p.z + dz * L));
  owner.vel.x = dx * 16; owner.vel.z = dz * 16; owner.vel.y = Math.max(owner.vel.y, 0);
  G.blinkInv = d.inv; owner.blinkAt = G.time; G.blinks = (G.blinks || 0) + 1;
  const fx = G.fx, a = from.clone().setY(from.y + 2.5), b = p.clone().setY(p.y + 2.5);
  fx.streak(a, b, 2.2, 0x7a9cff, 0.18); fx.streak(a, b, 0.7, 0xe0f0ff, 0.18);
  fx.flash(a, 0x7a9cff, 30, 26, 0.25); fx.ring(from, null, 1, 7, 0.35, 0x7a9cff); fx.ring(p, null, 1, 5, 0.3, 0xc0d4ff);
  fx.sparks(b, _b.set(dx, 0.2, dz), 14, 0xb8ccff, 16, 1, 0.35, 0.25);
  sfx('blink', 0);
  G.queue.push({ label: 'p-blink', t: 0.3, fn: () => { G.fx.flash(a, 0x9ab4ff, 40, 30, 0.3); explodeAt(a, d.burstR, d.burst * mul, 'P', 0.8, 0x7a9cff); } });
}
// GH-2 grapple hook: the claw flies out on a cable. Small enemies are reeled in in front of the owner and stunned;
// anything big (or a wall / roof) pulls the owner to it instead. Floor hits and misses just reel the cable back.
G.hooks = [];
const PULLABLE = new Set(['drone', 'crawler', 'walker', 'splitter', 'sapper', 'mender', 'jammer', 'grappler', 'stalker', 'skimmer']);
const FLYERS = new Set(['drone', 'sapper', 'mender', 'jammer', 'grappler']);
const clawMat = new THREE.MeshStandardMaterial({ color: 0xc0c8d0, metalness: 0.85, roughness: 0.3, emissive: 0xffa040, emissiveIntensity: 0.25 });
const clawGeo = new THREE.ConeGeometry(0.32, 1.1, 6).rotateX(Math.PI / 2);
function fireHook(owner, slot, d, mul, aim) {
  const mp = owner.muzzlePos(slot, new V3(), 0).clone();
  const dir = new V3().subVectors(aim, mp).normalize();
  const o = new THREE.Mesh(clawGeo, clawMat); o.position.copy(mp); G.scene.add(o);
  G.hooks.push({ o, owner, slot, d, mul, dir, P: mp.clone(), st: 'fly', left: d.range, t: 0, host: null, at: new V3(), zipT: 0 });
  sfx('hook', G.player ? G.player.pos.distanceTo(mp) : 0); G.hookShots = (G.hookShots || 0) + 1;
}
function updateHooks(dt) {
  const fx = G.fx;
  for (let i = G.hooks.length - 1; i >= 0; i--) {
    const H = G.hooks[i], d = H.d, own = H.owner, P = H.P;
    H.t += dt;
    const mp = own.muzzlePos(H.slot, new V3(), 0);
    let done = !own.alive;
    if (!done && H.st === 'fly') {
      const st = d.speed * dt, nx = _a.copy(P).addScaledVector(H.dir, st).clone();
      const w = raySolids(P, H.dir, st + 0.4);
      const prev = G.curLabel; G.curLabel = 'p-hook';
      const ents = entsFor('P').filter((e) => !e.isBarrel && !e.isMine && !e.cloaked);
      const h = segHit(P, nx, ents, 0.6);
      if (h && h.t * st < w.t) {
        const e = h.ent, host = e.kind === 'cpart' ? e.owner : e;
        dealDamage(e, d.dmg * H.mul, 'P', e.c, 'p-hook');
        P.copy(e.c); fx.sparks(P, null, 12, 0xffc070, 14, 1, 0.3, 0.2); sfx('ric', G.player.pos.distanceTo(P));
        if (host.alive && !host.dying && PULLABLE.has(host.kind) && host.pos) {
          H.st = 'pull'; H.host = host; H.T = 0.45; host.stunT = Math.max(host.stunT || 0, 1.2); host.stunMax = host.stunT; G.hookPulls = (G.hookPulls || 0) + 1;
          if (host.st === 'leap' || host.st === 'dash') host.st = host.kind === 'crawler' ? 'run' : 'roll';
        } else { H.st = 'zip'; H.at.copy(e.c); H.host = host.alive ? host : null; G.hookZips = (G.hookZips || 0) + 1; }
      } else if (w.t < st + 0.4) {
        P.addScaledVector(H.dir, Math.max(0, w.t - 0.3));
        fx.sparks(P, null, 8, 0xffc070, 12, 1, 0.25, 0.2); sfx('ric', G.player.pos.distanceTo(P));
        if (w.solid === 'floor') H.st = 'back';
        else { H.st = 'zip'; H.at.copy(P); G.hookZips = (G.hookZips || 0) + 1; }
      } else { P.copy(nx); H.left -= st; if (H.left <= 0) H.st = 'back'; }
      G.curLabel = prev;
    } else if (!done && H.st === 'pull') {
      const e = H.host;
      if (!e.alive || e.dying || e.gone) H.st = 'back';
      else {
        H.T -= dt;
        const fw = _b.set(-Math.sin(own.aimYaw), 0, -Math.cos(own.aimYaw));
        const tx = own.pos.x + fw.x * 7.5, tz = own.pos.z + fw.z * 7.5;
        const ty = FLYERS.has(e.kind) ? own.pos.y + 4 : Math.max(groundAt(tx, tz, own.pos.y + 3), WATER.on && e.kind === 'skimmer' ? WATER.y + 1 : -99) + (e.kind === 'splitter' ? e.T.r : 0);
        const k = 1 - Math.exp(-9 * dt), ox = e.pos.x, oy = e.pos.y, oz = e.pos.z;
        e.pos.x += (tx - e.pos.x) * k; e.pos.y += (ty - e.pos.y) * k; e.pos.z += (tz - e.pos.z) * k;
        if (e.c && e.c !== e.pos) e.c.add(_c.set(e.pos.x - ox, e.pos.y - oy, e.pos.z - oz));
        if (e.vel) e.vel.set(0, 0, 0);
        P.copy(e.c);
        if (H.T <= 0 || Math.hypot(tx - e.pos.x, tz - e.pos.z) < 1.5) { H.st = 'back'; fx.ring(new V3(e.pos.x, e.pos.y + 0.3, e.pos.z), null, 1, 4, 0.3, 0xffc070); }
      }
    } else if (!done && H.st === 'zip') {
      if (H.host && H.host.c) H.at.copy(H.host.c);
      H.zipT += dt;
      const c = own.center(_a); _b.subVectors(H.at, c); const L = _b.length();
      if (L < 5.5 || H.zipT > 1.1) { own.lungeT = 0.0001; own.vel.multiplyScalar(0.35); own.vel.y = Math.max(own.vel.y, 3); H.st = 'back'; }
      else { own.lungeT = 0.12; own.vel.copy(_b.multiplyScalar(54 / L)); if (Math.random() < 0.5) fx.emit('add', { x: c.x, y: c.y, z: c.z, life: 0.25, s0: 1.6, s1: 0.3, c0: 0xffc070 }); }
      P.copy(H.at);
    } else if (!done && H.st === 'back') {
      _b.subVectors(mp, P); const L = _b.length(), st = 170 * dt;
      if (L < Math.max(1.2, st)) done = true; else P.addScaledVector(_b.multiplyScalar(1 / L), st);
    }
    if (done) { H.o.parent && H.o.parent.remove(H.o); G.hooks.splice(i, 1); continue; }
    H.o.position.copy(P); _c.subVectors(P, mp); if (_c.lengthSq() > 0.01) H.o.lookAt(_d.copy(P).add(_c)); else H.o.lookAt(_d.copy(P).add(H.dir));
    fx.streak(mp, P, 0.09, 0x8a929a); fx.streak(mp, P, 0.03, 0xffd8a0);
  }
}
// SM-2 smoke screen: a cloud that blocks enemy line of sight through it (an enemy inside the cloud still sees out / in)
G.smokes = [];
function popSmoke(owner, slot, d) {
  const a = owner.aimYaw, p = new V3(owner.pos.x - Math.sin(a) * 4, 0, owner.pos.z - Math.cos(a) * 4);
  p.y = groundAt(p.x, p.z, owner.pos.y + 2) + d.R * 0.42;
  G.smokes.push({ c: p, R: d.R, t: d.dur, T: d.dur, puffT: 0 });
  const mp = owner.muzzlePos(slot, new V3(), 0);
  G.fx.streak(mp, p, 0.3, 0xc8ccd0); G.fx.flash(p, 0xd0d4d8, 20, 14, 0.2);
  sfx('smoke', G.player ? G.player.pos.distanceTo(p) : 0);
  G.smokeN = (G.smokeN || 0) + 1;
  for (const e of G.enemies) if (e.losT !== undefined) e.losT = 0;
  for (let k = 0; k < 60; k++) G.fx.emit('smoke', { x: p.x + (Math.random() - 0.5) * 6, y: p.y - 3 + Math.random() * 5, z: p.z + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 20, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 20, life: d.dur * (0.5 + Math.random() * 0.4), s0: 6, s1: 16, c0: 0xa4a8ac, c1: 0x8c9094, a0: 0.9, a1: 0, drag: 2.2 });
}
export function smokeBlocks(a, b) {
  for (const s of G.smokes) {
    const R = s.R * Math.min(1, s.t / 1.2, (s.T - s.t) / 0.4 + 0.3);
    if (a.distanceTo(s.c) < R * 0.9) continue;   // the viewer is inside this cloud
    _d.subVectors(b, a); const L2 = _d.lengthSq(); let k = L2 > 0 ? _c.subVectors(s.c, a).dot(_d) / L2 : 0; k = Math.max(0, Math.min(1, k));
    const dx = a.x + _d.x * k - s.c.x, dy = a.y + _d.y * k - s.c.y, dz = a.z + _d.z * k - s.c.z;
    if (dx * dx + dy * dy + dz * dz < R * R) return true;
  }
  return false;
}
function updateSmokes(dt) {
  for (let i = G.smokes.length - 1; i >= 0; i--) {
    const s = G.smokes[i]; s.t -= dt; s.puffT -= dt;
    if (s.t <= 0) { G.smokes.splice(i, 1); continue; }
    if (s.puffT <= 0 && s.t > 1.5) {
      s.puffT = 0.05;
      const a = Math.random() * 6.28, r = Math.random() * s.R * 0.8;
      G.fx.emit('smoke', { x: s.c.x + Math.cos(a) * r, y: s.c.y - s.R * 0.4 + Math.random() * s.R * 0.9, z: s.c.z + Math.sin(a) * r, vx: (Math.random() - 0.5) * 1.5, vy: 0.4, vz: (Math.random() - 0.5) * 1.5, life: 3.2, s0: 9, s1: 16, c0: 0xa4a8ac, c1: 0x8c9094, a0: 0.75, a1: 0, drag: 1 });
    }
  }
}
export function clearSmokes() { G.smokes.length = 0; }
export function clearHooks() { for (const H of G.hooks) H.o.parent && H.o.parent.remove(H.o); G.hooks.length = 0; }
export function clearDiscs() { for (const D of G.discs) D.o.parent && D.o.parent.remove(D.o); G.discs.length = 0; }
export function clearStrikes() { for (const S of G.strikes) S.o.parent && S.o.parent.remove(S.o); G.strikes.length = 0; }
export function clearWells() { for (const w of G.wells) { w.o.parent && w.o.parent.remove(w.o); w.area.parent && w.area.parent.remove(w.area); } G.wells.length = 0; }
export function updateDecoys(dt) { for (const f of G.friends.slice()) if (f instanceof Decoy || f instanceof Sentry) f.update(dt); }
export function clearDecoys() { for (const f of G.friends.slice()) if (f instanceof Decoy || f instanceof Sentry) { f.alive = false; f.obj.parent && f.obj.parent.remove(f.obj); G.friends.splice(G.friends.indexOf(f), 1); } }

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
    if (this.losT <= 0) { this.losT = 0.3 + Math.random() * 0.2; const tc = this.tg().center(playerC); this.los = clearLine(this.c, tc) && !smokeBlocks(this.c, tc); }
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
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(150), dmg: this.holo ? 0 : 6, team: 'E', kind: 'ebullet', color: 0xff5040, w: 0.26, len: 5, label: this.holo ? 'holo' : undefined });
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
// Prism: tripod walker behind a big hexagonal mirror. Bullets and missiles that hit the mirror side bounce back at the player
// (half damage). It turns slowly, so flank it, shoot from above, or use what a mirror can't return (beams, blasts, arcs, blades, sound).
const _pe = new V3();
export const PRISM = { hp: 560, refl: 0.4, arc: 0.42, turn: 0.8, dmg: 34, cd: 3.6, aim: 0.85, vent: 1.8 };
export class Prism extends Enemy {
  constructor(pos) {
    super('prism', 'E_Prism', pos, PRISM.hp, 3.0); this.boom = 1.4; this.obj.scale.setScalar(1.3);
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.obj.rotation.y = this.yaw; this.ph = Math.random() * 6;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.stT = 2.5; this.st = 'move'; this.aimT = 0; this.fireT = 2 + Math.random() * 2; this.glint = 0;
    this.aimPt = new V3(); this.fwd = new V3(0, 0, -1);
    this.c.set(pos.x, pos.y + 3.4, pos.z);
  }
  reflects(s, from) {   // shot came in from the mirror side and not steeply from above
    if (this.stunT > 0 || this.frozen || this.vent > 0) return false;
    _pe.set(from.x - this.c.x, 0, from.z - this.c.z); const L = _pe.length(); if (L < 0.01) return false; _pe.divideScalar(L);
    const vl = s.v.length() || 1;
    if (-s.v.y / vl > 0.62) return false;
    return _pe.dot(this.fwd) > PRISM.arc;
  }
  update(dt) {
    const p = this.tg(), pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    this.glint = Math.max(0, this.glint - dt); this.vent = Math.max(0, (this.vent || 0) - dt);
    // turn the mirror toward the target, slowly
    const want = Math.atan2(-dx, -dz);
    const dy = angDiff(want, this.yaw), mx = PRISM.turn * dt * (this.st === 'aim' ? 0.35 : 1);
    this.yaw += Math.max(-mx, Math.min(mx, dy));
    this.obj.rotation.y = this.yaw; this.fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    // keep 22-40 m, sidestep
    this.blindT = this.los ? 0 : (this.blindT || 0) + dt;
    let toward = dist > 40 || this.blindT > 4 ? 1 : dist < 22 ? -0.8 : 0;
    this.slideT = Math.max(0, (this.slideT || 0) - dt); if (this.slideT > 0) toward *= 0.15;
    this.stT -= dt; if (this.stT <= 0) { this.stT = 2.5 + Math.random() * 3; this.strafe *= -1; }
    let fx_ = dx / dist, fz = dz / dist;
    const gl = goalDir(this, this.pos); if (gl) { fx_ = gl.x; fz = gl.z; toward = this.slideT > 0 ? 0.15 : 1; }
    const sw = this.st === 'aim' ? 0.15 : this.slideT > 0 ? 1.2 : gl ? 0.2 : 0.55;
    const spd = this.st === 'aim' ? 2 : 4.6;
    const tx = (fx_ * toward + -fz * this.strafe * sw) * spd, tz = (fz * toward + fx_ * this.strafe * sw) * spd;
    this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-2 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-2 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 2.8, 5)) blockedSlide(this);
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 2);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.ph += dt * (2 + sp * 1.1);
    const body = this.n.E_PBody; body.position.y = 2.6 + Math.sin(this.ph * 1.5) * 0.08 * Math.min(1, sp / 3);
    for (let i = 1; i <= 3; i++) {
      const s = Math.sin(this.ph + i * 2.09);
      this.n['E_PLeg' + i].rotation.y = s * 0.22 * Math.min(1, sp / 3) + Math.max(0, s) * 0.08;
      this.n['E_PKnee' + i].rotation.y = Math.max(0, Math.cos(this.ph + i * 2.09)) * 0.3 * Math.min(1, sp / 3);
    }
    const mir = this.n.PR_Mirror; if (mir) { mir.rotation.y = Math.sin(this.ph * 0.5) * 0.05; mir.rotation.x += ((this.vent > 0 ? -1.0 : 0) - mir.rotation.x) * Math.min(1, dt * 10); }   // after a shot the mirror tips down to vent heat
    if (this.vent > 0.2 && Math.random() < 0.4) { const q = this.n.PR_Mirror.getWorldPosition(_b); G.fx.emit('smoke', { x: q.x, y: q.y + 1, z: q.z, vx: 0, vy: 2.2, vz: 0, life: 0.7, s0: 0.6, s1: 1.8, c0: 0xd8f4ff, c1: 0xa0b8c0, a0: 0.3, drag: 1.5 }); }
    this.c.set(this.pos.x, this.pos.y + 3.4, this.pos.z);
    // beam: telegraph line, then a hitscan shot from the crystal
    const mp = this.n.Muzzle_Prism.getWorldPosition(_a).clone();
    if (this.st === 'move') {
      if (dist < 95 && this.checkLos(dt)) { this.fireT -= dt; if (this.fireT <= 0) { this.st = 'aim'; this.aimT = PRISM.aim; this.aimPt.copy(pc); sfx('prism', dist); } }
    } else {
      this.aimT -= dt;
      if (this.aimT > 0.22) { const v = p.vel || _c.set(0, 0, 0), lt = Math.min(0.5, this.aimT); _b.set(pc.x + v.x * lt, pc.y, pc.z + v.z * lt); this.aimPt.lerp(_b, 1 - Math.exp(-8 * dt)); }
      _d.subVectors(this.aimPt, mp).normalize();
      const w = raySolids(mp, _d, 200), h0 = rayEnts(mp, _d, w.t, entsFor('E')), end = mp.clone().addScaledVector(_d, h0 ? h0.t : w.t);
      const fr = this.aimT <= 0.22;
      G.fx.streak(mp, end, fr ? 0.13 : 0.05, fr ? 0x9ff6ff : 0x50c8ff);
      G.fx.emit('add', { x: mp.x, y: mp.y, z: mp.z, life: 0.05, s0: 1 + (1 - this.aimT / PRISM.aim) * 2.5, c0: 0x9ff6ff });
      if (this.aimT <= 0) {
        this.st = 'move'; this.fireT = PRISM.cd + Math.random() * 1.2; this.vent = PRISM.vent;
        G.curLabel = 'prism-beam'; G.curSrc = this.pos;
        if (h0 && !smokeBlocks(mp, end)) dealDamage(h0.ent, PRISM.dmg, 'E', end, 'prism-beam');
        G.fx.streak(mp, end, 0.45, 0xc8fbff, 0.12); G.fx.streak(mp, end, 0.18, 0xffffff, 0.08);
        G.fx.sparks(end, null, 10, 0x9ff6ff, 14, 1, 0.3, 0.25); G.fx.flash(mp, 0x60e8ff, 18, 20, 0.12);
        sfx('rail', dist);
      }
    }
  }
}

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
// Echo: the mirror boss copies the player's loadout (player-only gear is swapped for the nearest enemy-capable weapon).
// Phase 2 splits off two weak Shards with the same weapons.
const ECHO_SUB = { rewind: 'missile', pound: 'missile', siphon: 'rifle', needler: 'rifle', acid: 'rifle', rod: 'missile', ricochet: 'rifle', pmines: 'missile', sticky: 'grenade', rockets: 'missile', icewall: 'missile', chaff: 'missile', cluster: 'cannon', flak: 'gatling', stasis: 'missile', sonic: 'shotgun', smoke: 'missile', hook: 'rifle', pile: 'blade', disc: 'rifle', decoy: 'missile', sentry: 'drones', grav: 'cannon', orbital: 'cannon', emp: 'missile' };
const ECHO_MUL = { rifle: 0.22, gatling: 0.26, shotgun: 0.3, flamer: 0.3, cryo: 0.3, grenade: 0.4, coil: 0.3, rail: 0.25, blade: 0.34, missile: 0.5, cannon: 0.6, laser: 0.45, drones: 0.4, shield: 0 };
export function setEcho(L) {
  const f = (k) => ECHO_SUB[k] || k, lo = { R: f(L.R), L: f(L.L), S: f(L.S) };
  BOSSES.echo = { name: '镜像 ECHO · 复制体', palette: 'echo', frame: L.frame || 'std', scale: 1.15, hp: 6000, want: [32, 26], agile: true, phases: [lo, lo], mul: ECHO_MUL, phase2: ['镜像 · 分裂', '两台镜像碎片加入战斗'] };
  RAIDERS.shard = { name: '镜像碎片 SHARD', palette: 'echo', frame: 'light', scale: 0.85, hp: 500, want: [28, 28], agile: true, phases: [lo], mul: Object.fromEntries(Object.entries(ECHO_MUL).map(([k, v]) => [k, v * 0.35])) };
  return lo;
}
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
    const los = clearLine(this.c, pc) && dist < 140 && !smokeBlocks(this.c, pc);
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
        if (dist < 135 && clearLine(_a.set(this.pos.x, this.pos.y + 3.6, this.pos.z), pc) && !smokeBlocks(_a, pc)) { this.st = 'aim'; this.stT = 1.65; this.stag = 0; this.lockOn = p; this.aimPt.copy(pc); sfx('snipe', dist); G.onSnipe && G.onSnipe(this, p); }
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
    if (this.markT > 0) this.alpha = Math.max(this.alpha, 0.62);   // sonar-marked: the cloak fails
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
// Grappler: heavy hover craft. Holds 26-40 m off (just outside the storm wall when a storm is up), aims its harpoon
// for 0.8 s (green line), then fires a fast hook. A hit (22) reels the player toward it for up to 2.6 s (8 dps).
// A quick boost, a blink, an EMP stun, or 160 damage to the grappler while it reels snaps the cable.
const cableGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
const cableMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30ffc8).multiplyScalar(1.6), toneMapped: false });
const hookGeo = new THREE.ConeGeometry(0.32, 1.1, 8).rotateX(Math.PI / 2);
export const GRAP = { aim: 0.8, speed: 100, range: 66, hit: 26, tow: 2.6, dps: 10, pull: 13, snap: 160 };
export class Grappler extends Enemy {
  constructor(pos) {
    super('grappler', 'E_Grappler', pos, 760, 3.0); this.boom = 1.3; this.obj.scale.setScalar(1.15);
    this.vel = new V3(); this.ph = Math.random() * 6; this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.st = 'move'; this.stT = 4 + Math.random() * 3; this.gunT = 2 + Math.random() * 2; this.aimP = new V3(); this.hp0 = 0;
    this.cable = new THREE.Mesh(cableGeo, cableMat); this.cable.visible = false; this.cable.frustumCulled = false; G.scene.add(this.cable);
    this.hk = new THREE.Mesh(hookGeo, cableMat); this.hk.visible = false; G.scene.add(this.hk);
    this.hkP = new V3(); this.hkD = new V3(); this.hkL = 0; this.mp = new V3(); this.c.copy(pos);
  }
  remove() { super.remove(); this.cable.parent && this.cable.parent.remove(this.cable); this.hk.parent && this.hk.parent.remove(this.hk); if (G.tether === this) G.tether = null; }
  hit(dmg) { super.hit(dmg); if (this.st === 'tow' && this.hp0 - this.hp >= GRAP.snap * G.diff.hp) this.snap(true); }
  snap(hard) {
    if (this.st !== 'tow' && this.st !== 'fire') return;
    this.st = 'reel'; this.stT = 0.45; if (G.tether === this) G.tether = null;
    if (hard) { G.fx.sparks(this.hkP, null, 16, 0x80ffd8, 16, 1, 0.4, 0.25); sfx('snap', G.player.pos.distanceTo(this.pos)); G.snaps = (G.snaps || 0) + 1; }
  }
  update(dt) {
    this.ph += dt; this.stT -= dt;
    const P = G.player, tg = this.tg(), pc = tg.center(playerC);
    const n = this.n; n.E_GWinch.rotation.x += dt * (this.st === 'tow' ? 9 : this.st === 'reel' ? -14 : 0.4);
    // hover station
    _a.set(this.pos.x - pc.x, 0, this.pos.z - pc.z); const L = _a.length() || 1;
    let tx, tz;
    const R = G.ring;
    if (R && Math.hypot(pc.x - R.x, pc.z - R.z) < R.r) {   // wait just outside the storm wall, on the near side
      let ux = pc.x - R.x, uz = pc.z - R.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const a0 = Math.atan2(uz, ux) + this.orbit * 0.5 + Math.sin(this.ph * 0.15) * 0.4;
      tx = R.x + Math.cos(a0) * (R.r + 9); tz = R.z + Math.sin(a0) * (R.r + 9);
      if (Math.hypot(tx - pc.x, tz - pc.z) > 50) { const ang = Math.atan2(_a.z, _a.x) + this.orbit * dt * 0.2; tx = pc.x + Math.cos(ang) * 36; tz = pc.z + Math.sin(ang) * 36; }
    } else { const ang = Math.atan2(_a.z, _a.x) + this.orbit * dt * 0.25; tx = pc.x + Math.cos(ang) * 33; tz = pc.z + Math.sin(ang) * 33; }
    const hold = this.st !== 'move';
    const ty = Math.max(groundAt(this.pos.x, this.pos.z, 99), groundAt(tx, tz, 99)) + 8.5 + Math.sin(this.ph * 1.1) * 0.5;
    _b.set(hold ? 0 : tx - this.pos.x, ty - this.pos.y, hold ? 0 : tz - this.pos.z);
    const Lb = _b.length(); if (Lb > 0) _b.multiplyScalar(Math.min(10, Lb * 0.7) / Lb);
    if (L < 18 && !hold) { _a.multiplyScalar(1 / L); _b.addScaledVector(_a, 8 * (1 - L / 18)); }
    this.vel.lerp(_b, 1 - Math.exp(-1.4 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const sd = pointInSolid(this.pos, 2.6); if (sd) { this.pos.y = sd.max.y + 3.2; this.vel.y = Math.max(this.vel.y, 2); }
    this.pos.x = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.x)); this.pos.z = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.z));
    this.c.set(this.pos.x, this.pos.y, this.pos.z);
    this.obj.rotation.y += angDiff(Math.atan2(this.pos.x - pc.x, this.pos.z - pc.z), this.obj.rotation.y) * Math.min(1, dt * 3);
    this.obj.rotation.x = -this.vel.z * 0.012; this.obj.rotation.z = this.vel.x * 0.012;
    const mp = n.Muzzle_Grap.getWorldPosition(this.mp);
    const dist = Math.hypot(pc.x - this.pos.x, pc.z - this.pos.z), los = this.checkLos(dt);
    n.E_GHook.visible = this.st === 'move' || this.st === 'aim';
    // sidearm: short bursts at whatever it is watching
    if (this.st === 'move' && los && dist < 70) {
      this.gunT -= dt;
      if (this.gunT <= 0) {
        this.gunT = 2.4 + Math.random();
        for (let k = 0; k < 3; k++) G.queue.push({ label: 'grappler', t: k * 0.12, fn: () => {
          if (!this.alive) return;
          const q = this.n.Muzzle_Grap.getWorldPosition(new V3()); const aim = lead(q, 120, _b, this.tg());
          _d.subVectors(aim, q).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.05; _d.z += (Math.random() - 0.5) * 0.05;
          spawnShot({ p: q, v: _d.normalize().multiplyScalar(120), dmg: 5, team: 'E', kind: 'ebullet', color: 0x60ffd0, life: 1.5 });
          G.fx.muzzle(q, _d, 0x60ffd0, 0.8); sfx('eshot', dist);
        } });
      }
    }
    if (this.st === 'move') {
      this.cable.visible = this.hk.visible = false;
      if (this.stT <= 0 && tg === P && P.alive && los && dist < 60 && !G.tether) { this.st = 'aim'; this.stT = GRAP.aim; sfx('lock', dist * 0.5); if (G.onGrapAim) G.onGrapAim(this); }
      else if (this.stT <= 0) this.stT = 0.6;
      return;
    }
    if (this.st === 'aim') {
      const tf = mp.distanceTo(pc) / GRAP.speed;
      this.aimP.set(pc.x + P.vel.x * tf, pc.y, pc.z + P.vel.z * tf);
      const fl = this.stT < 0.25 ? (Math.sin(G.time * 60) > 0 ? 1 : 0.2) : 0.6;
      G.fx.streak(mp, this.aimP, 0.1 * fl + 0.04, 0x30ffc8);
      if (this.stT <= 0) {
        this.st = 'fire'; this.hkP.copy(mp); this.hkD.subVectors(this.aimP, mp).normalize(); this.hkL = 0;
        sfx('harpoon', dist); G.fx.muzzle(mp, this.hkD, 0x60ffd0, 1.4); G.grapShots = (G.grapShots || 0) + 1;
      }
      return;
    }
    if (this.st === 'fire') {
      const st = GRAP.speed * dt, w = raySolids(this.hkP, this.hkD, st);
      _c.copy(this.hkP).addScaledVector(this.hkD, Math.min(st, w.t));
      // segment vs the player's body
      const pcc = P.center(_b); _d.subVectors(_c, this.hkP); const l2 = _d.lengthSq();
      let k = l2 > 0 ? _a.subVectors(pcc, this.hkP).dot(_d) / l2 : 0; k = Math.max(0, Math.min(1, k));
      const hitP = P.alive && !(G.blinkInv > 0) && _a.copy(this.hkP).addScaledVector(_d, k).distanceTo(pcc) < 3.2;
      this.hkP.copy(_c); this.hkL += st;
      if (hitP) {
        this.st = 'tow'; this.stT = GRAP.tow; this.hp0 = this.hp; this.towAt = G.time; G.tether = this;
        G.curSrc = this.pos; damagePlayer(GRAP.hit, this.pos, 'grappler-hook');
        G.fx.sparks(pcc, null, 12, 0x80ffd8, 14, 1, 0.3, 0.25); sfx('hookhit', 0); G.grapHits = (G.grapHits || 0) + 1;
        G.onTether && G.onTether(this);
      } else if (w.t < st || this.hkL > GRAP.range) { this.st = 'reel'; this.stT = 0.5; G.fx.sparks(this.hkP, null, 6, 0x80ffd8, 10, 1, 0.3, 0.2); }
    } else if (this.st === 'tow') {
      const pcc = P.center(_b); this.hkP.copy(pcc);
      const broke = !P.alive || this.stT <= 0 || (P.qbAt || -9) > this.towAt + 0.12 || (P.blinkAt || -9) > this.towAt;
      if (broke) this.snap(this.stT > 0);
      else {
        let dx = this.pos.x - P.pos.x, dz = this.pos.z - P.pos.z; const dd = Math.hypot(dx, dz) || 1;
        if (dd > 7) { P.pos.x += dx / dd * GRAP.pull * dt; P.pos.z += dz / dd * GRAP.pull * dt; collideCyl(P.pos, P.radius, P.height); }
        G.curSrc = this.pos; damagePlayer(GRAP.dps * dt, this.pos, 'grappler-tow');
        if (Math.random() < 0.3) G.fx.sparks(pcc, null, 1, 0x80ffd8, 6, 0.8, 0.3, 0.15);
        this.reelT = (this.reelT || 0) - dt; if (this.reelT <= 0) { this.reelT = 0.3; sfx('reel', 0); }
      }
    } else if (this.st === 'reel') {
      this.hkP.lerp(mp, 1 - Math.exp(-10 * dt));
      if (this.stT <= 0) { this.st = 'move'; this.stT = 5 + Math.random() * 2; }
    }
    // cable + hook head
    this.cable.visible = this.hk.visible = this.st !== 'move' && this.st !== 'aim';
    if (this.cable.visible) {
      this.cable.position.copy(mp); const cl = mp.distanceTo(this.hkP);
      this.cable.lookAt(this.hkP); this.cable.scale.set(1, 1, Math.max(0.01, cl));
      this.hk.position.copy(this.hkP); _d.subVectors(this.hkP, mp); if (_d.lengthSq() > 0.01) this.hk.lookAt(_a.copy(this.hkP).add(_d));
    }
  }
}

// Eel: armoured serpent drone (abyss). Swims a sinuous orbit around its target, coils for 0.85 s (blue streak shows the line),
// then lunges straight through at 50 m/s; a body that brushes the player discharges. Head + two body segments are hittable parts.
export const EEL = { n: 9, gap: 1.55, swim: 15, coil: 0.85, lunge: 50, lungeT: 1.0, bite: 42, shock: 14, shockR: 5.5 };
export class Eel extends Enemy {
  constructor(pos) {
    super('eel', 'E_EelHead', pos, 640, 2.0); this.boom = 1.1;
    this.vel = new V3(0, 0, -EEL.swim); this.ph = Math.random() * 6; this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.st = 'swim'; this.stT = 1 + Math.random() * 2; this.dir = new V3(); this.aimP = new V3(); this.shockT = 2; this.bit = false;
    this.trail = []; const TN = Math.ceil(EEL.n * EEL.gap / 0.3) + 8;
    for (let i = 0; i < TN; i++) this.trail.push(new V3(pos.x, pos.y, pos.z + i * 0.3));
    this.segs = [];
    for (let i = 0; i < EEL.n; i++) { const o = cloneKit('E_EelSeg'); o.scale.setScalar(1 - i * 0.055); o.position.set(pos.x, pos.y, pos.z + (i + 1) * EEL.gap); G.scene.add(o); this.segs.push(o); }
    this.c.copy(pos);
    const self = this;
    const mk = (key, c, r, mul) => { const pt = { kind: 'cpart', key, owner: self, c, r, mul, get alive() { return self.alive && !self.dying; } }; pt.hit = (dmg, at, label) => self.hitPart(pt, dmg, label); return pt; };
    this.parts = [mk('head', this.c, 2.0, 1), mk('body', this.segs[2].position, 1.5, 0.85), mk('tail', this.segs[5].position, 1.3, 0.85)];
  }
  hitPart(pt, dmg, label) {
    // one splash / pierce event must not count once per segment: same label in the same frame only lands on the first part it touches
    const key = (label || '?') + '|' + G.time;
    if (this.hitKey === key && this.hitPt !== pt) return;
    this.hitKey = key; this.hitPt = pt;
    this.hit(dmg * pt.mul);
  }
  remove() { super.remove(); for (const o of this.segs) o.parent && o.parent.remove(o); }
  explode() {
    const ps = this.segs.map((o) => o.position.clone());
    super.explode();
    ps.forEach((q, i) => G.queue.push({ label: 'eel', t: 0.05 + i * 0.07, fn: () => { G.fx.explosion(q, 0.45 - i * 0.02, 0x60d8ff); G.fx.sparks(q, null, 5, 0x9fe8ff, 10, 1, 0.3, 0.2); } }));
  }
  update(dt) {
    this.ph += dt; this.stT -= dt; this.shockT -= dt;
    const P = G.player, tg = this.tg(), pc = tg.center(playerC);
    const dist = this.c.distanceTo(pc), gy = groundAt(this.pos.x, this.pos.z, 99);
    const los = this.checkLos(dt);
    if (this.st === 'swim') {
      _a.set(this.pos.x - pc.x, 0, this.pos.z - pc.z);
      const ang = Math.atan2(_a.z, _a.x) + this.orbit * 0.55, R = 24 + Math.sin(this.ph * 0.4) * 5;
      const tx = pc.x + Math.cos(ang) * R, tz = pc.z + Math.sin(ang) * R;
      const ty = Math.max(gy, groundAt(tx, tz, 99)) + 4.5 + Math.sin(this.ph * 0.7) * 2.5;
      _b.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z); if (_b.lengthSq() > 0) _b.normalize(); _b.multiplyScalar(EEL.swim);
      _c.set(-_b.z, 0, _b.x); if (_c.lengthSq() > 0) _c.normalize(); _b.addScaledVector(_c, Math.sin(this.ph * 3.2) * 5);
      this.vel.lerp(_b, 1 - Math.exp(-1.6 * dt));
      if (this.stT <= 0 && tg.alive !== false && dist < 50 && los) { this.st = 'coil'; this.stT = EEL.coil; sfx('eelcoil', dist); if (!G.eelSaid && tg === P) { G.eelSaid = true; G.onHint && G.onHint('雷鳗蓄力 · 蓝线是它的冲刺路线 · 横向闪开', 3.5); } }
      else if (this.stT <= 0) this.stT = 0.5;
    } else if (this.st === 'coil') {
      this.vel.multiplyScalar(Math.exp(-4 * dt));
      const tf = dist / EEL.lunge, tv = tg === P ? P.vel : null;
      this.aimP.set(pc.x + (tv ? tv.x * tf : 0), pc.y, pc.z + (tv ? tv.z * tf : 0));
      _b.subVectors(this.aimP, this.pos); if (_b.lengthSq() > 0) this.vel.addScaledVector(_b.normalize(), 0.5);   // swing the head round to face the line
      const fl = this.stT < 0.25 ? (Math.sin(G.time * 60) > 0 ? 1 : 0.25) : 0.5;
      G.fx.streak(this.c, this.aimP, 0.09 * fl + 0.03, 0x30c8ff);
      if (Math.random() < 0.6) G.fx.sparks(this.c, null, 2, 0x9fe8ff, 8, 0.9, 0.25, 0.18);
      if (this.stT <= 0) {
        this.st = 'lunge'; this.stT = EEL.lungeT; this.bit = false;
        this.dir.subVectors(this.aimP, this.pos); if (this.dir.lengthSq() < 0.01) this.dir.set(0, 0, -1); this.dir.normalize();
        sfx('eellunge', dist); G.lunges = (G.lunges || 0) + 1;
      }
    } else if (this.st === 'lunge') {
      this.vel.copy(this.dir).multiplyScalar(EEL.lunge);
      if (Math.random() < 0.5) G.fx.emit('add', { x: this.c.x, y: this.c.y, z: this.c.z, life: 0.18, s0: 2.2, s1: 0.4, c0: 0x40c8ff });
      if (!this.bit) for (const e of entsFor('E')) {
        if (e.isBarrel || e.c.distanceTo(this.c) > e.r + 3.0) continue;
        this.bit = true; G.curSrc = this.pos; G.curLabel = 'eel-bite'; dealDamage(e, EEL.bite, 'E', this.c, 'eel-bite');
        if (e.isPlayer) { P.vel.addScaledVector(this.dir, 12); P.vel.y += 5; G.bites = (G.bites || 0) + 1; }
        G.fx.sparks(this.c, null, 14, 0x9fe8ff, 16, 1.1, 0.35, 0.25); G.fx.flash(this.c, 0x40c8ff, 20, 16, 0.12); sfx('zap', 0);
        break;
      }
      if (this.stT <= 0) { this.st = 'swim'; this.stT = 4 + Math.random() * 2; }
    }
    this.pos.addScaledVector(this.vel, dt);
    const fy = Math.max(gy, groundAt(this.pos.x, this.pos.z, 99)) + 1.4;
    if (this.pos.y < fy) { this.pos.y = fy; this.vel.y = Math.max(this.vel.y, 0); if (this.st === 'lunge') this.stT = Math.min(this.stT, 0.12); }
    const sd = pointInSolid(this.pos, 1.8);
    if (sd) { this.pos.y = sd.max.y + 2.2; this.vel.y = Math.max(this.vel.y, 3); if (this.st === 'lunge') { this.stT = 0; G.fx.sparks(this.pos, null, 8, 0x9fe8ff, 12, 1, 0.3, 0.2); } }
    this.pos.x = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.x)); this.pos.z = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.z));
    this.c.copy(this.pos);
    if (this.vel.lengthSq() > 0.5) this.obj.lookAt(_a.copy(this.pos).sub(this.vel));   // kit front is -Z: point +Z backwards
    // body: segments ride the head's path at fixed arc-length spacing
    const tr = this.trail;
    if (tr[0].distanceToSquared(this.pos) > 0.09) { const q = tr.pop(); q.copy(this.pos); tr.unshift(q); }
    let acc = 0, si = 0, prev = this.pos, ps = this.pos;
    for (let k = 0; k < tr.length && si < EEL.n; k++) {
      const q = tr[k], l = prev.distanceTo(q);
      while (si < EEL.n && acc + l >= (si + 1) * EEL.gap) {
        const f = l > 1e-4 ? ((si + 1) * EEL.gap - acc) / l : 0, o = this.segs[si];
        o.position.lerpVectors(prev, q, f);
        o.lookAt(_a.copy(o.position).multiplyScalar(2).sub(ps)); ps = o.position; si++;
      }
      acc += l; prev = q;
    }
    for (; si < EEL.n; si++) { this.segs[si].position.copy(prev); }
    // brushing the body discharges
    if (this.shockT <= 0 && P.alive) {
      const pcc = P.center(_b); let near = null;
      if (this.c.distanceTo(pcc) < EEL.shockR) near = this.c; else for (const o of this.segs) if (o.position.distanceTo(pcc) < EEL.shockR) { near = o.position; break; }
      if (near) { this.shockT = 2.4; G.curSrc = near; damagePlayer(EEL.shock, near, 'eel-shock'); G.fx.streak(near, pcc, 0.2, 0x9fe8ff); G.fx.sparks(pcc, null, 6, 0x9fe8ff, 10, 0.9, 0.3, 0.2); sfx('zap', 0); }
      else this.shockT = 0.2;
    }
  }
}

// Jet (Striker): circles high around its target, then lines up a strafing run. The run is shown 1.5 s ahead as a red line on
// the ground; the jet dives along it at 60 m/s and its cannon walks a row of blasts down the line. Only reachable up close.
export const JET = { hp: 340, cruise: 46, strafe: 60, tele: 1.5, len: 72, step: 3.5, blast: 24, blastR: 4.2, side: 2.6, alt: 16 };
export class Jet extends Enemy {
  constructor(pos) {
    super('jet', 'E_Jet', pos, JET.hp, 2.8); this.boom = 1.4; this.obj.scale.setScalar(1.25);
    this.vel = new V3(); this.ph = Math.random() * 6; this.orbit = Math.random() < 0.5 ? 1 : -1;
    this.st = 'loop'; this.stT = 3 + Math.random() * 3; this.A = new V3(); this.B = new V3(); this.dir = new V3(); this.prog = 0; this.nextD = 0; this.bank = 0; this.av = true;
    this.c.copy(pos);
  }
  update(dt) {
    this.stT -= dt; this.ph += dt;
    const tg = this.tg(), pc = tg.center(playerC), P = G.player;
    const air = _a.set(this.A.x, JET.alt, this.A.z);
    if (this.st === 'loop' || this.st === 'climb') {
      _c.set(this.pos.x - pc.x, 0, this.pos.z - pc.z);
      const ang = Math.atan2(_c.z, _c.x) + this.orbit * 0.4, R = 115 + Math.sin(this.ph * 0.3) * 20;
      _b.set(pc.x + Math.cos(ang) * R - this.pos.x, 40 + Math.sin(this.ph * 0.5) * 6 - this.pos.y, pc.z + Math.sin(ang) * R - this.pos.z);
      _b.normalize().multiplyScalar(JET.cruise);
      this.vel.lerp(_b, 1 - Math.exp(-(this.st === 'climb' ? 1.2 : 0.9) * dt));
      this.bank += (this.orbit * 0.6 - this.bank) * Math.min(1, dt * 2);
      this.msT = (this.msT ?? 3 + Math.random() * 3) - dt;   // while circling: a pair of slow homing missiles now and then
      if (this.st === 'loop' && this.msT <= 0 && tg.alive !== false && this.c.distanceTo(pc) < 130 && this.checkLos(dt)) {
        this.msT = 6 + Math.random() * 2; if (tg === P) G.onEnemyMissile && G.onEnemyMissile();
        for (let k = 0; k < 2; k++) G.queue.push({ label: 'jet-missile', t: k * 0.25, fn: () => {
          if (!this.alive) return;
          const mp = this.n.Muzzle_Jet.getWorldPosition(new V3()), v = this.vel.clone().setLength(30).add(new V3((Math.random() - 0.5) * 10, -4, (Math.random() - 0.5) * 10));
          spawnShot({ p: mp, v, dmg: 22, team: 'E', kind: 'missile', splash: 4, target: this.tg()._ent, aim: this.tg().center(new V3()), life: 6, maxSpeed: 54, turn: 1.5, label: 'jet-missile' });
          sfx('missile', this.pos.distanceTo(P.pos));
        } });
      }
      if (this.st === 'climb' && this.stT <= 0) { this.st = 'loop'; this.stT = 5 + Math.random() * 3; }
      else if (this.st === 'loop' && this.stT <= 0) {
        if (tg.alive === false) this.stT = 1;
        else {   // plan the run: a ground line through the target (with a little lead), approached from the jet's side
          const tv = tg === P ? P.vel : null;
          const tx = pc.x + (tv ? tv.x * 0.8 : 0), tz = pc.z + (tv ? tv.z * 0.8 : 0);
          this.dir.set(tx - this.pos.x, 0, tz - this.pos.z); if (this.dir.lengthSq() < 1) this.dir.set(1, 0, 0); this.dir.normalize();
          this.A.set(tx - this.dir.x * JET.len / 2, 0.3, tz - this.dir.z * JET.len / 2); this.B.set(tx + this.dir.x * JET.len / 2, 0.3, tz + this.dir.z * JET.len / 2);
          this.st = 'tele'; this.stT = JET.tele; this.av = Math.random() < 0.65; sfx('jetdive', this.pos.distanceTo(P.pos) * 0.5);
          G.jetRuns = (G.jetRuns || 0) + 1;
          if (!G.jetSaid && tg === P) { G.jetSaid = true; G.onHint && G.onHint('攻击机俯冲扫射 · 地面红线就是弹道 · 横向离开那条线', 3.5); }
        }
      }
    } else if (this.st === 'tele') {   // race to the start of the line; the line tracks the target until 0.5 s before the dive
      if (this.stT > 0.4) {
        const tv = tg === P ? P.vel : null, lt = this.stT + JET.len / 2 / JET.strafe;
        const tx = pc.x + (tv ? tv.x * lt : 0), tz = pc.z + (tv ? tv.z * lt : 0);
        this.A.set(tx - this.dir.x * JET.len / 2, 0.3, tz - this.dir.z * JET.len / 2); this.B.set(tx + this.dir.x * JET.len / 2, 0.3, tz + this.dir.z * JET.len / 2);
      }
      air.set(this.A.x, JET.alt, this.A.z);
      _b.subVectors(air, this.pos); const L = _b.length();
      const sp = Math.max(40, Math.min(130, L / Math.max(0.1, this.stT)));
      this.vel.lerp(_b.multiplyScalar(sp / Math.max(0.01, L)), 1 - Math.exp(-5 * dt));
      this.bank *= Math.exp(-3 * dt);
      if (this.stT <= 0) { this.st = 'strafe'; this.prog = 0; this.nextD = 0; this.pos.set(this.A.x, JET.alt, this.A.z); this.vel.copy(this.dir).multiplyScalar(JET.strafe); sfx('jetgun', this.pos.distanceTo(P.pos) * 0.5); }
    } else if (this.st === 'strafe') {
      this.vel.copy(this.dir).multiplyScalar(JET.strafe); this.vel.y = 0;
      this.prog += JET.strafe * dt;
      while (this.nextD <= Math.min(this.prog + 6, JET.len)) {   // the cannon leads the jet by ~6 m
        const d = this.nextD, sd = (Math.round(d / JET.step) % 2 ? 1 : -1) * JET.side; this.nextD += JET.step;   // twin cannons: alternate either side of the line
        const qx = this.A.x + this.dir.x * d - this.dir.z * sd, qz = this.A.z + this.dir.z * d + this.dir.x * sd;
        const q = new V3(qx, groundAt(qx, qz, 99), qz);
        const mp = this.n.Muzzle_Jet.getWorldPosition(new V3());
        G.fx.streak(mp, q, 0.25, 0xffb060);
        G.queue.push({ label: 'jet', t: 0.08, fn: () => { G.curSrc = q; explodeAt(q, JET.blastR, JET.blast, 'E', 0.55, 0xff8040); } });
      }
      if (this.prog > JET.len + 4) { this.st = 'climb'; this.stT = 2.2; this.vel.y = 18; }
    }
    // telegraph: a flickering red line on the ground until the cannon has passed
    if (this.st === 'tele' || this.st === 'strafe') {
      const k0 = this.st === 'strafe' ? Math.min(1, this.nextD / JET.len) : 0;
      _c.copy(this.A).lerp(this.B, k0);
      const fl = this.st === 'tele' && this.stT < 0.4 ? (Math.sin(G.time * 50) > 0 ? 1 : 0.35) : 0.75;
      for (const sd of [-JET.side, JET.side]) G.fx.streak(_d.set(_c.x - this.dir.z * sd, 0.3, _c.z + this.dir.x * sd), _b.set(this.B.x - this.dir.z * sd, 0.3, this.B.z + this.dir.x * sd), 0.42 * fl, 0xff3020);
    }
    this.pos.addScaledVector(this.vel, dt);
    const gy = groundAt(this.pos.x, this.pos.z, 999) + 6; if (this.pos.y < gy) { this.pos.y = gy; this.vel.y = Math.max(this.vel.y, 0); }
    this.c.copy(this.pos);
    if (this.vel.lengthSq() > 1) { this.obj.lookAt(_b.copy(this.pos).sub(this.vel)); this.obj.rotateZ(this.bank); }
  }
}

// Splitter: an armoured ball that rolls at its target. Destroying it bursts it into two smaller ones (big -> medium -> small).
// Big: keeps ~22 m away and fires a 5-shard fan. Medium: coils, then dashes through. Small: fast, weaving, zaps on contact.
export const SPLIT = [
  { r: 2.2, sc: 2.2, hp: 460, spd: 8, touch: 30 },
  { r: 1.4, sc: 1.4, hp: 170, spd: 12.5, touch: 24 },
  { r: 0.85, sc: 0.85, hp: 60, spd: 17, touch: 14 },
];
const _q = new THREE.Quaternion(), _ax = new V3();
export class Splitter extends Enemy {
  constructor(pos, tier = 0, vel = null) {
    const T = SPLIT[tier];
    super('splitter', 'E_Split', pos, T.hp, T.r); this.tier = tier; this.T = T; this.boom = 0.4 + (2 - tier) * 0.35;
    this.obj.scale.setScalar(T.sc); this.obj.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    this.vel = vel ? vel.clone() : new V3(); this.vy = vel ? 7 : 0; this.ph = Math.random() * 6; this.weave = Math.random() * 6;
    this.wake = vel ? 0.45 : 0.3 + Math.random() * 0.6; this.st = 'roll'; this.stT = 0; this.touchT = 0;
    this.fireT = 1.5 + Math.random() * 1.5; this.dashT = 1.5 + Math.random() * 2; this.dash = new V3(); this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.pos.y = Math.max(pos.y, groundAt(pos.x, pos.z, pos.y + 2) + T.r); this.c.copy(this.pos);
    this.glow = []; this.obj.traverse((m) => { if (m.isMesh && m.material && m.material.name === 'SplitGlow') this.glow.push(m); });
  }
  explode() {
    const c = this.c.clone();
    G.fx.explosion(c, 0.35 + (2 - this.tier) * 0.3, 0xff60d0); G.fx.sparks(c, null, 14, 0xff80e0, 14, 1, 0.4, 0.25);
    sfx('boom', G.player ? G.player.pos.distanceTo(c) : 50);
    this.remove();
    if (this.tier < 2) {
      const a = Math.random() * 6.28;
      for (const s of [0, Math.PI]) {
        const v = new V3(Math.cos(a + s) * 10, 0, Math.sin(a + s) * 10);
        new Splitter(new V3(c.x + v.x * 0.12, c.y, c.z + v.z * 0.12), this.tier + 1, v);
      }
      G.splits = (G.splits || 0) + 1;
    }
  }
  touch(p, pc, dmg, kx, kz) {
    this.touchT = 0.9;
    G.curSrc = this.pos;
    if (p === G.player) { damagePlayer(dmg, this.pos, 'splitter' + this.tier); p.vel.x += kx * 9; p.vel.z += kz * 9; p.vel.y = Math.max(p.vel.y, 4); }
    else if (p._ent) p._ent.hit(dmg);
    G.fx.sparks(_a.copy(this.c).lerp(pc, 0.5), null, 10, 0xff80e0, 12, 1, 0.3, 0.2);
    sfx('zap', G.player.pos.distanceTo(this.c));
    this.vel.x *= -0.6; this.vel.z *= -0.6;
  }
  update(dt) {
    const T = this.T, p = this.tg(), pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    this.ph += dt; this.wake -= dt; this.touchT -= dt;
    let fx_ = dx / dist, fz = dz / dist, sp = this.wake > 0 ? 0 : T.spd;
    const gl = goalDir(this, this.pos); if (gl) { fx_ = gl.x; fz = gl.z; }
    let glowK = 1;
    if (this.tier === 0) {
      if (dist < 22) { const s = this.strafe; const tx = -fz * s - fx_ * 0.45, tz = fx_ * s - fz * 0.45; fx_ = tx; fz = tz; }
      this.fireT -= dt;
      if (this.fireT < 0.5) glowK = 1 + (Math.sin(this.ph * 30) > 0 ? 1.2 : 0);
      if (this.fireT <= 0 && dist < 70 && this.checkLos(dt)) {
        this.fireT = 2.8 + Math.random() * 1.2;
        const o = new V3(this.c.x, this.c.y + T.r * 0.4, this.c.z);
        lead(o, 62, _b, p === G.player ? p : G.player);
        if (p !== G.player) _b.copy(pc);
        const base = Math.atan2(_b.x - o.x, _b.z - o.z), dy = (_b.y - o.y) / Math.max(1, o.distanceTo(_b));
        for (let k = -2; k <= 2; k++) {
          const a = base + k * 0.11;
          spawnShot({ p: o.clone(), v: new V3(Math.sin(a), dy, Math.cos(a)).normalize().multiplyScalar(62), dmg: 11, team: 'E', kind: 'ebullet', color: 0xff60d0, w: 0.42, len: 3, life: 1.6, label: 'splitter-shard' });
        }
        G.fx.flash(o, 0xff60d0, 12, 8, 0.15); sfx('coil', G.player.pos.distanceTo(o) * 0.8);
      }
    } else if (this.tier === 1) {
      this.dashT -= dt;
      if (this.st === 'roll' && this.dashT <= 0 && this.wake <= 0 && dist < 32 && this.checkLos(dt)) { this.st = 'coil'; this.stT = 0.55; sfx('crawl', G.player.pos.distanceTo(this.c)); }
      if (this.st === 'coil') {
        sp = 0; this.stT -= dt; glowK = 1 + (Math.sin(this.ph * 40) > 0 ? 1.5 : 0.3);
        if (this.stT <= 0) {
          const tv = p.vel || _a.set(0, 0, 0), lt = Math.min(1, dist / 30);
          this.dash.set(pc.x + tv.x * lt * 0.6 - this.pos.x, 0, pc.z + tv.z * lt * 0.6 - this.pos.z).normalize();
          this.st = 'dash'; this.stT = 0.75; this.touchT = 0;
        }
      } else if (this.st === 'dash') {
        this.stT -= dt; this.vel.set(this.dash.x * 34, 0, this.dash.z * 34); glowK = 2;
        if (Math.random() < 0.6) G.fx.emit('add', { x: this.c.x, y: this.c.y, z: this.c.z, vy: 0, life: 0.3, s0: 1.4, s1: 0.2, c0: 0xff80e0 });
        if (this.stT <= 0) { this.st = 'roll'; this.dashT = 2.4 + Math.random() * 1.6; }
      }
    } else {
      const w = Math.sin(this.ph * 3 + this.weave) * 0.6 * Math.min(1, dist / 12);
      const tx = fx_ - fz * w, tz = fz + fx_ * w; fx_ = tx; fz = tz;
    }
    if (this.st !== 'dash') {
      const L = Math.hypot(fx_, fz) || 1, k = 1 - Math.exp(-3 * dt);
      this.vel.x += (fx_ / L * sp - this.vel.x) * k; this.vel.z += (fz / L * sp - this.vel.z) * k;
    }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    _c.set(this.pos.x, this.pos.y - T.r, this.pos.z);
    if (collideCyl(_c, T.r * 0.9, T.r * 2)) { this.pos.x = _c.x; this.pos.z = _c.z; if (this.st === 'dash') { this.st = 'roll'; this.dashT = 2; } }
    this.pos.x = Math.max(-ARENA + 2, Math.min(ARENA - 2, this.pos.x)); this.pos.z = Math.max(-ARENA + 2, Math.min(ARENA - 2, this.pos.z));
    this.vy -= 30 * dt; this.pos.y += this.vy * dt;
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y - T.r + 0.8, 2) + T.r * 0.95;
    if (this.pos.y < gy) { this.pos.y = gy; this.vy = this.vy < -6 ? -this.vy * 0.35 : 0; }
    // roll: rotate about the axis perpendicular to travel by distance / radius
    const v = Math.hypot(this.vel.x, this.vel.z);
    if (v > 0.2) { _ax.set(this.vel.z / v, 0, -this.vel.x / v); _q.setFromAxisAngle(_ax, v * dt / T.r); this.obj.quaternion.premultiply(_q); }
    for (const m of this.glow) m.scale.setScalar(glowK > 1.5 ? 1.12 : 1);
    this.c.copy(this.pos);
    // contact
    if (this.touchT <= 0 && this.wake <= 0 && Math.hypot(pc.x - this.c.x, pc.z - this.c.z) < T.r + 1.9 && Math.abs(pc.y - this.c.y) < T.r + 3.2) this.touch(p, pc, this.st === 'dash' ? 32 : T.touch, dx / dist, dz / dist);
  }
}

// meteor shower: every few seconds a meteor (sometimes two) falls on a red circle, half the time near the player; it hits
// everything in 8 m (enemies too) and some carry a big splitter that rolls out of the crater
G.meteors = [];
const meteorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc080).multiplyScalar(2.4), toneMapped: false });
const meteorGeo = new THREE.IcosahedronGeometry(1.5, 1);
export const METEOR = { R: 8, dmg: 70, fall: 2.2, gap: [5.5, 8.5], split: 0.25 };
function dropMeteor(at, split) {
  const d = G.meteorDir || (G.meteorDir = new V3(0.55, 0, 0.35));
  const from = new V3(at.x - d.x * 200, 240, at.z - d.z * 200);
  const o = new THREE.Mesh(meteorGeo, meteorMat); o.position.copy(from); G.scene.add(o);
  G.fx.warn(at, METEOR.R, METEOR.fall);
  G.meteors.push({ o, from, to: at.clone(), t: 0, split });
  if (G.player) sfx('meteor', G.player.pos.distanceTo(at) * 0.6);
  G.meteorN = (G.meteorN || 0) + 1;
}
function updateMeteors(dt) {
  const p = G.player; if (!p) return;
  G.starT = (G.starT ?? 0) - dt;
  if (G.starT <= 0) {   // decorative shooting stars far out in the sky
    G.starT = 0.15 + Math.random() * 0.45;
    const a = Math.random() * 6.28, r = 260 + Math.random() * 200, d = G.meteorDir || (G.meteorDir = new V3(0.55, 0, 0.35));
    const s0 = new V3(p.pos.x + Math.cos(a) * r, 150 + Math.random() * 180, p.pos.z + Math.sin(a) * r), L = 30 + Math.random() * 50;
    G.fx.streak(s0, new V3(s0.x + d.x * L, s0.y - L * 0.45, s0.z + d.z * L), 0.5 + Math.random() * 0.6, Math.random() < 0.5 ? 0xffe0b0 : 0xc8b0ff, 0.25 + Math.random() * 0.2);
  }
  G.meteorT = (G.meteorT ?? 5) - dt;
  if (G.meteorT <= 0 && p.alive) {
    G.meteorT = (METEOR.gap[0] + Math.random() * (METEOR.gap[1] - METEOR.gap[0])) / (G.meteorRate || 1);
    const n = Math.random() < 0.4 ? 2 : 1, big = G.enemies.filter((e) => e.kind === 'splitter' && e.alive).length + (G.enemies.some((e) => e.alive && e.kind !== 'splitter') ? 0 : 99);   // no new splitters once only splitters remain, so the wave can end
    for (let k = 0; k < n; k++) {
      let at = null;
      for (let tries = 0; tries < 20 && !at; tries++) {
        const near = k === 0 && Math.random() < 0.55;
        const a = Math.random() * 6.28, r = near ? Math.random() * 7 : 14 + Math.random() * 50;
        const x = p.pos.x + (near ? p.vel.x * 1.4 : 0) + Math.cos(a) * r, z = p.pos.z + (near ? p.vel.z * 1.4 : 0) + Math.sin(a) * r;
        if (Math.abs(x) > ARENA - 8 || Math.abs(z) > ARENA - 8 || pointInSolid(new V3(x, 1, z), 3)) continue;
        at = new V3(x, groundAt(x, z, 60) + 0.2, z);
      }
      if (at) dropMeteor(at, big < 4 && Math.random() < METEOR.split);
    }
    if (!G.meteorSaid) { G.meteorSaid = true; G.onHint && G.onHint('流星雨 · 红圈是陨石落点 · 敌人也会被砸中 · 有的陨石里滚出分裂球', 4); }
  }
  for (let i = G.meteors.length - 1; i >= 0; i--) {
    const m = G.meteors[i]; m.t += dt;
    const k = Math.min(1, m.t / METEOR.fall);
    m.o.position.lerpVectors(m.from, m.to, k); m.o.rotation.x += dt * 3; m.o.rotation.z += dt * 2;
    if (Math.random() < 0.9) G.fx.emit('add', { x: m.o.position.x, y: m.o.position.y, z: m.o.position.z, vy: 2, life: 0.55, s0: 3.2, s1: 0.6, c0: 0xffd090, c1: 0xff4010 });
    if (k < 1) continue;
    m.o.parent && m.o.parent.remove(m.o); G.meteors.splice(i, 1);
    const c = m.to.clone().setY(m.to.y + 0.6);
    G.curLabel = 'meteor'; G.curSrc = c;
    explodeAt(c, METEOR.R, METEOR.dmg, 'X', 1.7, 0xff8040);
    G.fx.smoke(c, 8, 5, 5, 0x3a2a30, 2.8, 1.8);
    G.fx.sparks(c, null, 24, 0xffc070, 22, 1.4, 0.6, 0.3);
    G.curLabel = null;
    if (m.split) { const s = new Splitter(c.clone().setY(c.y + 2), 0); s.vy = 9; s.wake = 0.8; G.meteorSplits = (G.meteorSplits || 0) + 1; }
  }
}
export function clearMeteors() { for (const m of G.meteors) m.o.parent && m.o.parent.remove(m.o); G.meteors.length = 0; G.meteorT = 5; }

// Skimmer: hover gunboat that circles its target fast at 34-52 m, skimming water (or ground). Fires 8-round gun bursts
// and pairs of slow homing torpedoes. Banks into its turns; flips its circling direction when it scrapes a building.
export class Skimmer extends Enemy {
  constructor(pos) {
    super('skimmer', 'E_Skimmer', pos, 380, 2.6); this.boom = 1.1; this.obj.scale.setScalar(1.1); this.obj.rotation.order = 'YXZ';
    this.vel = new V3(); this.ph = Math.random() * 6; this.orbit = Math.random() < 0.5 ? 1 : -1; this.R = 34 + Math.random() * 18;
    this.gunT = 2 + Math.random() * 2; this.burst = 0; this.burstT = 0; this.torpT = 4 + Math.random() * 3; this.flipT = 0;
    this.pos.y = this.surf(pos.x, pos.z, pos.y); this.c.set(this.pos.x, this.pos.y + 1, this.pos.z);
  }
  surf(x, z, y) { return Math.max(WATER.on ? WATER.y : -99, groundAt(x, z, y + 2.5, 2)) + 0.9; }
  update(dt) {
    this.ph += dt; this.flipT -= dt;
    const p = this.tg(), pc = p.center(playerC);
    _c.set(this.pos.x - pc.x, 0, this.pos.z - pc.z); const dist = _c.length() || 1;
    const ang = Math.atan2(_c.z, _c.x) + this.orbit * 0.55, R = this.R + Math.sin(this.ph * 0.35) * 10;
    _b.set(pc.x + Math.cos(ang) * R - this.pos.x, 0, pc.z + Math.sin(ang) * R - this.pos.z);
    const L = _b.length() || 1, sp = 22 + Math.sin(this.ph * 0.7) * 4; _b.multiplyScalar(sp / L);
    const k = 1 - Math.exp(-1.6 * dt); this.vel.x += (_b.x - this.vel.x) * k; this.vel.z += (_b.z - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    _a.set(this.pos.x, this.pos.y - 1, this.pos.z);
    if (collideCyl(_a, 2.4, 3)) { this.pos.x = _a.x; this.pos.z = _a.z; if (this.flipT <= 0) { this.orbit *= -1; this.flipT = 1.5; } }
    this.pos.x = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.x)); this.pos.z = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.z));
    const sy = this.surf(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y += (sy - this.pos.y) * (1 - Math.exp(-6 * dt)); this.obj.position.y = this.pos.y + Math.sin(this.ph * 2.6) * 0.12;
    const yaw = Math.atan2(-this.vel.x, -this.vel.z), dy = angDiff(yaw, this.obj.rotation.y);
    this.obj.rotation.y += dy * Math.min(1, dt * 5);
    this.obj.rotation.z += (Math.max(-0.45, Math.min(0.45, -dy * 2.2)) - this.obj.rotation.z) * Math.min(1, dt * 4);
    this.obj.rotation.x = 0.05;
    this.c.set(this.pos.x, this.pos.y + 1, this.pos.z);
    if (WATER.on && this.pos.y - 1.2 <= WATER.y && Math.random() < 0.6) G.fx.emit('add', { x: this.pos.x - this.vel.x * 0.1 + (Math.random() - 0.5) * 2, y: WATER.y + 0.2, z: this.pos.z - this.vel.z * 0.1 + (Math.random() - 0.5) * 2, vy: 2.5, life: 0.5, s0: 1.2, s1: 2.6, c0: 0xc8e8f0 });
    const los = this.checkLos(dt);
    this.gunT -= dt;
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = 0.09; this.burst--;
        const mp = this.n.Muzzle_Skim.getWorldPosition(new V3());
        if (p === G.player) lead(mp, 210, _d); else _d.copy(pc);
        _d.sub(mp).normalize(); _d.x += (Math.random() - 0.5) * 0.07; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.07;
        spawnShot({ p: mp, v: _d.normalize().multiplyScalar(210), dmg: 4, team: 'E', kind: 'ebullet', life: 1, label: 'skimmer-gun' });
        G.fx.muzzle(mp, _d, 0xffb060, 0.6);
        if (this.burst % 2) sfx('rifle', G.player.pos.distanceTo(mp) * 1.3);
      }
    } else if (this.gunT <= 0 && los && dist < 62) { this.gunT = 3.4 + Math.random(); this.burst = 5; this.burstT = 0; }
    this.torpT -= dt;
    if (this.torpT <= 0 && los && dist < 90) {
      this.torpT = 5.5 + Math.random() * 2;
      for (let s = -1; s <= 1; s += 2) {
        const mp = this.n.Muzzle_SkimT.getWorldPosition(new V3()), fw = new V3(-Math.sin(this.obj.rotation.y), 0.5, -Math.cos(this.obj.rotation.y));
        const v = fw.multiplyScalar(16).add(new V3(Math.cos(this.obj.rotation.y) * s * 6, 0, -Math.sin(this.obj.rotation.y) * s * 6));
        spawnShot({ p: mp, v, dmg: 24, team: 'E', kind: 'missile', splash: 4.5, target: p._ent, aim: pc.clone(), life: 6, maxSpeed: 40, turn: 1.3, label: 'skimmer-torpedo' });
      }
      sfx('missile', G.player.pos.distanceTo(this.pos));
    }
  }
}

// Leviathan: giant sandworm boss. Hunts underground (only a sand wake shows), marks a red circle under its target,
// then breaches in a huge arc and dives back in; sometimes (more often below half health) it swims along the surface
// half-exposed, spitting acid. Only the parts above ground can be hit; the head takes extra damage.
export const LEV = { hp: 9000, n: 14, gap: 5.0, depth: -12, hunt: 24, swim: 14, warn: 1.05, breach: 80, breachR: 11 };
export class Leviathan extends Enemy {
  constructor(pos, hpMul = 1) {
    super('boss', 'E_LevHead', new V3(pos.x, LEV.depth, pos.z), LEV.hp * hpMul, 4.2);
    this.isLev = true; this.boom = 3; this.B = { name: '沙海巨虫 LEVIATHAN', phase2: ['巨虫狂暴', '它开始在沙面上游动、喷吐酸液 · 身体露出时集中火力'] };
    this.obj.scale.setScalar(2.4);
    this.phase = 1; this.st = 'hunt'; this.stT = 4; this.vel = new V3(0, 0, -LEV.hunt); this.spot = new V3(); this.ph = 0; this.touchT = 0; this.spitT = 2; this.rumT = 0; this.weave = Math.random() * 6;
    this.trail = []; for (let i = 0; i < Math.ceil(LEV.n * LEV.gap / 0.5) + 12; i++) this.trail.push(new V3(pos.x, LEV.depth, pos.z + i * 0.5));
    this.segs = [];
    for (let i = 0; i < LEV.n; i++) { const o = cloneKit('E_LevSeg'); o.scale.setScalar(2.2 * (1 - i * 0.035)); o.position.set(pos.x, LEV.depth, pos.z + (i + 1) * LEV.gap); G.scene.add(o); this.segs.push(o); }
    const self = this;
    const mk = (key, c, r, mul) => { const pt = { kind: 'cpart', key, owner: self, c, r, mul, get alive() { return self.alive && !self.dying && c.y > -1.5; } }; pt.hit = (dmg, at, label) => self.hitPart(pt, dmg, label); return pt; };
    this.parts = [mk('head', this.c, 4.4, 1.4)];
    for (let i = 0; i < LEV.n; i += 1) this.parts.push(mk('seg' + i, this.segs[i].position, 3.0 * (1 - i * 0.03), 1));
    this.c.copy(this.pos);
  }
  hitPart(pt, dmg, label) {
    const key = (label || '?') + '|' + G.time;
    if (this.hitKey === key && this.hitPt !== pt) return;
    this.hitKey = key; this.hitPt = pt;
    this.hit(dmg * pt.mul);
  }
  hit(dmg) {
    super.hit(dmg);
    if (this.phase === 1 && this.alive && this.hp < this.maxHp * 0.5) { this.phase = 2; G.onBossPhase && G.onBossPhase(this); }
  }
  die() { this.dying = true; this.alive = false; this.deathT = 3.2; this.hp = 0; G.stats.kills++; G.onKill && G.onKill(this); }
  remove() { super.remove(); for (const o of this.segs) o.parent && o.parent.remove(o); }
  surfaceFx(x, z, n = 1, big = 1) {
    const y = groundAt(x, z, 2) + 0.4;
    G.fx.smoke(_a.set(x, y, z), n, 3 * big, 1.4, 0xc8a070, 2.5, 0.5);
  }
  update(dt) {
    const P = this.pos;
    if (this.dying) {
      this.deathT -= dt;
      if (Math.random() < 0.25) { const o = this.segs[Math.floor(Math.random() * this.segs.length)].position; if (o.y > -2) { G.fx.explosion(o, 1.2, 0xffa050); sfx('boom', G.player.pos.distanceTo(o)); } }
      P.y -= dt * 4; for (const o of this.segs) o.position.y -= dt * 3;
      if (this.deathT <= 0) { G.fx.flash(this.c, 0xffa060, 100, 70, 0.6); this.remove(); }
      return;
    }
    const t = this.tg(), tc = t.center(playerC), tv = t.vel || _b.set(0, 0, 0);
    this.ph += dt; this.stT -= dt; this.touchT -= dt;
    const dx = tc.x - P.x, dz = tc.z - P.z, hd = Math.hypot(dx, dz) || 1;
    const fast = this.phase === 2 ? 1.25 : 1;
    if (this.st === 'hunt') {
      const sp = LEV.hunt * fast, k = 1 - Math.exp(-1.5 * dt);
      this.vel.x += (dx / hd * sp - this.vel.x) * k; this.vel.z += (dz / hd * sp - this.vel.z) * k;
      this.vel.y = (LEV.depth - P.y) * 2;
      this.rumT -= dt; if (this.rumT <= 0) { this.rumT = 0.08; if (P.y > LEV.depth - 2) this.surfaceFx(P.x, P.z, 1, 0.8); }
      if (this.stT <= 0 && hd < 34) {
        if (Math.random() < (this.phase === 2 ? 0.55 : 0.35)) { this.st = 'rise'; this.stT = 1.0; }
        else {
          this.spot.set(tc.x + tv.x * 0.9, 0, tc.z + tv.z * 0.9);
          if (pointInSolid(_a.set(this.spot.x, 1, this.spot.z), 4)) this.spot.set(tc.x, 0, tc.z);
          this.spot.y = groundAt(this.spot.x, this.spot.z, 2);
          G.fx.warn(this.spot, LEV.breachR, LEV.warn); this.st = 'warn'; this.stT = LEV.warn; sfx('erupt', G.player.pos.distanceTo(this.spot));
          if (!G.levSaid) { G.levSaid = true; G.onHint && G.onHint('巨虫靠震动追踪 · 红圈就是它破土的位置 · 冲出红圈，等它露出身体再打', 4); }
        }
      }
    } else if (this.st === 'warn') {
      this.vel.set((this.spot.x - P.x) * 4, (-7 - P.y) * 3, (this.spot.z - P.z) * 4);
      if (Math.random() < 0.7) this.surfaceFx(this.spot.x + (Math.random() - 0.5) * 12, this.spot.z + (Math.random() - 0.5) * 12, 1, 1.2);
      G.fx.trauma = Math.min(1, (G.fx.trauma || 0) + dt * 0.4 * Math.max(0, 1 - G.player.pos.distanceTo(this.spot) / 60));
      if (this.stT <= 0) {
        P.set(this.spot.x, -3, this.spot.z);
        let ax = tc.x - P.x, az = tc.z - P.z, al = Math.hypot(ax, az);
        if (al < 4) { const a = Math.random() * 6.28; ax = Math.cos(a); az = Math.sin(a); al = 1; }
        this.vel.set(ax / al * 15, 34, az / al * 15);
        this.st = 'air';
        G.curLabel = 'lev-breach'; G.curSrc = this.spot;
        explodeAt(_a.copy(this.spot).setY(this.spot.y + 1), LEV.breachR, LEV.breach, 'E', 2.4, 0xd8b070);
        const pp = G.player; if (pp && pp.alive && Math.hypot(pp.pos.x - this.spot.x, pp.pos.z - this.spot.z) < LEV.breachR && pp.pos.y < this.spot.y + 4) pp.vel.y = Math.max(pp.vel.y, 15);
        this.surfaceFx(this.spot.x, this.spot.z, 14, 3.5); G.fx.trauma = Math.min(1, (G.fx.trauma || 0) + 0.6); sfx('bigboom', G.player.pos.distanceTo(this.spot));
        G.levBreaches = (G.levBreaches || 0) + 1;
      }
    } else if (this.st === 'air') {
      this.vel.y -= 30 * dt;
      if (P.y < -3 && this.vel.y < 0) {
        this.surfaceFx(P.x, P.z, 10, 3); G.curLabel = 'lev-dive'; explodeAt(_a.set(P.x, groundAt(P.x, P.z, 2) + 1, P.z), 7, 30, 'E', 1.6, 0xd8b070);
        this.st = 'hunt'; this.stT = (this.phase === 2 ? 1.4 : 2.2) + Math.random() * 1.5;
      }
    } else if (this.st === 'rise' || this.st === 'swim') {
      if (this.st === 'rise' && this.stT <= 0) { this.st = 'swim'; this.stT = 7; G.onHint && !G.levSwimSaid && (G.levSwimSaid = true, G.onHint('巨虫浮上沙面游动 · 全身都能打', 2.5)); }
      const w = Math.sin(this.ph * 1.3 + this.weave) * 0.7;
      const ox = dx / hd, oz = dz / hd, orb = hd < 26 ? -0.6 : hd > 45 ? 0.6 : 0;
      const tx = ox * orb - oz * (1 - Math.abs(orb)) + -oz * w, tz = oz * orb + ox * (1 - Math.abs(orb)) + ox * w, tl = Math.hypot(tx, tz) || 1;
      const sp = LEV.swim * fast, k = 1 - Math.exp(-1.2 * dt);
      this.vel.x += (tx / tl * sp - this.vel.x) * k; this.vel.z += (tz / tl * sp - this.vel.z) * k;
      this.vel.y = ((this.st === 'rise' ? -1.2 : -0.4) + groundAt(P.x, P.z, 2) - P.y) * 3;
      this.rumT -= dt; if (this.rumT <= 0) { this.rumT = 0.1; this.surfaceFx(P.x, P.z, 1, 1.2); }
      if (this.st === 'swim') {
        this.spitT -= dt;
        if (this.spitT <= 0 && hd < 90) {
          this.spitT = this.phase === 2 ? 0.9 : 1.3;
          for (let k2 = 0; k2 < (this.phase === 2 ? 4 : 3); k2++) {
            const Tf = 1.3 + Math.random() * 0.4, g = 24;
            const aim = new V3(tc.x + tv.x * Tf * 0.5 + (Math.random() - 0.5) * 8, 0, tc.z + tv.z * Tf * 0.5 + (Math.random() - 0.5) * 8); aim.y = groundAt(aim.x, aim.z, tc.y);
            const src = _a.set(P.x, P.y + 3, P.z).clone();
            spawnShot({ p: src, v: new V3((aim.x - src.x) / Tf, (aim.y - src.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - src.z) / Tf), dmg: 26, team: 'E', kind: 'shell', splash: 5, life: Tf + 1, grav: g, label: 'lev-acid', color: 0xb0ff60 });
          }
          sfx('spit', G.player.pos.distanceTo(P));
        }
        if (this.stT <= 0) { this.st = 'hunt'; this.stT = 3 + Math.random() * 2; }
      }
    }
    P.addScaledVector(this.vel, dt);
    P.x = Math.max(-ARENA + 12, Math.min(ARENA - 12, P.x)); P.z = Math.max(-ARENA + 12, Math.min(ARENA - 12, P.z));
    // trail + segments
    if (this.trail[0].distanceTo(P) > 0.5) { const q = this.trail.pop(); q.copy(P); this.trail.unshift(q); }
    let idx = 0, acc = 0, prev = this.trail[0];
    for (let i = 0; i < this.segs.length; i++) {
      const want = (i + 1) * LEV.gap;
      while (idx < this.trail.length - 1) { const sl = this.trail[idx].distanceTo(this.trail[idx + 1]); if (acc + sl >= want) break; acc += sl; idx++; }
      const a = this.trail[idx], b = this.trail[Math.min(idx + 1, this.trail.length - 1)], sl = a.distanceTo(b) || 1;
      const o = this.segs[i];
      o.position.copy(a).lerp(b, Math.min(1, (want - acc) / sl));
      o.lookAt(_c.copy(o.position).add(_d.subVectors(o.position, i ? this.segs[i - 1].position : P)));
      prev = o.position;
    }
    if (this.vel.lengthSq() > 1) this.obj.lookAt(_c.copy(P).sub(this.vel));
    for (let j = 0; j < 3; j++) { const jw = this.n['LV_Jaw' + j]; if (jw) jw.rotation.y = Math.sin(this.ph * (this.st === 'air' ? 10 : 3) + j) * 0.25; }
    this.c.copy(P);
    // body contact with exposed parts
    const pp = G.player;
    if (this.touchT <= 0 && pp && pp.alive) {
      const pc = pp.center(_a);
      for (const pt of this.parts) {
        if (pt.c.y < -1) continue;
        if (Math.hypot(pc.x - pt.c.x, pc.z - pt.c.z) < pt.r + 1.8 && Math.abs(pc.y - pt.c.y) < pt.r + 3) {
          this.touchT = 1; G.curSrc = pt.c; damagePlayer(this.st === 'air' ? 40 : 26, pt.c, 'lev-body');
          const kx = pc.x - pt.c.x, kz = pc.z - pt.c.z, kl = Math.hypot(kx, kz) || 1; pp.vel.x += kx / kl * 14; pp.vel.z += kz / kl * 14; pp.vel.y = Math.max(pp.vel.y, 6);
          break;
        }
      }
    }
  }
}

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
      if (PLAT.R && Math.hypot(x, z) > PLAT.R - 14) continue;
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

// Fencer: hover pylons that work in pairs. The leader plans a sweep: both pylons fly to a start line ~27 m short of the target
// (tracking it while they get there), a thin red line flickers for 1 s, then a laser fence switches on between them and the
// pair sweeps across at 18 m/s for 52 m. The pair hovers at the target's height until the sweep starts: then change height, run round an end, or kill
// (or stun) one pylon to cut it. A pylon whose partner dies goes lone (circles, short bursts) until another lone one links up.
export const FENCE = { hp: 420, guard: 0.4, guardOn: 0.7, len: 28, slide: 9, speed: 18, sweep: 52, arm: 1.0, rest: 2.4, dmg: 46, knock: 14, w: 1.6, hover: 2.5 };
const _fa = new V3(), _fb = new V3();
function segDist(p, a, b) { _fa.subVectors(b, a); const L2 = _fa.lengthSq() || 1; const t = Math.max(0, Math.min(1, _fb.subVectors(p, a).dot(_fa) / L2)); return _fb.copy(a).addScaledVector(_fa, t).distanceTo(p); }
export class Fencer extends Enemy {
  constructor(pos, mate) {
    super('fencer', 'E_Fencer', pos, FENCE.hp, 1.7); this.boom = 0.9; this.obj.scale.setScalar(1.25);
    this.vel = new V3(); this.ph = Math.random() * 6; this.slot = pos.clone(); this.slotD = 99; this.mate = null; this.lead = false; this.plan = null;
    this.orbit = Math.random() < 0.5 ? 1 : -1; this.fireT = 2 + Math.random() * 2; this.burst = 0; this.burstT = 0; this.linkT = 1;
    this.c.set(pos.x, pos.y + 0.12, pos.z);
    if (mate) this.link(mate);
  }
  link(m) { this.mate = m; m.mate = this; m.lead = true; this.lead = false; m.plan = null; this.plan = null; }
  pairPlan() { return this.lead ? this.plan : this.mate ? this.mate.plan : null; }
  hit(dmg, at, label) {   // shielded; the shield weakens while the fence is sweeping (it draws the shield's power)
    const P = this.pairPlan();
    if (P && P.st === 'sweep') dmg *= FENCE.guardOn;
    else { dmg *= FENCE.guard; if (Math.random() < 0.25) G.fx.sparks(this.c, null, 3, 0x8ad8ff, 8, 0.6, 0.2, 0.2); }
    super.hit(dmg);
  }
  update(dt) {
    this.ph += dt;
    const m = this.mate;
    if (m && (!m.alive || m.dying)) { this.mate = null; this.lead = false; this.plan = null; }
    if (!this.mate) this.loneLogic(dt); else if (this.lead) this.leadLogic(dt);
    const P = this.pairPlan(), tight = !!P && (P.st === 'arm' || P.st === 'sweep');
    const ring = this.n.FN_Ring; if (ring) ring.rotation.y += dt * (tight ? 10 : 2);
    // fly to the slot the leader set (or the lone orbit point)
    const gy = Math.max(groundAt(this.slot.x, this.slot.z, 99), groundAt(this.pos.x, this.pos.z, 99));
    const ty = (this.mate ? Math.max(gy + FENCE.hover, P && P.y ? Math.min(P.y, gy + 30) : 0) : gy + 6) + Math.sin(this.ph * 2) * 0.12;   // the pair hovers at the target's height (fixed once the sweep starts)
    _b.set(this.slot.x - this.pos.x, ty - this.pos.y, this.slot.z - this.pos.z);
    this.slotD = Math.hypot(_b.x, _b.z);
    if (tight) { this.pos.addScaledVector(_b, Math.min(1, dt * 8)); this.vel.multiplyScalar(0.8); }
    else {
      const L = _b.length(); if (L > 0) _b.multiplyScalar(Math.min(22, L * 1.3) / L);
      this.vel.lerp(_b, 1 - Math.exp(-3.5 * dt)); this.pos.addScaledVector(this.vel, dt);
    }
    const s = pointInSolid(this.pos, 1.0); if (s) this.pos.y = s.max.y + FENCE.hover;
    this.pos.x = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.x)); this.pos.z = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.z));
    this.c.set(this.pos.x, this.pos.y + 0.12, this.pos.z);
    this.obj.rotation.z = -this.vel.x * 0.02; this.obj.rotation.x = this.vel.z * 0.02;
  }
  leadLogic(dt) {
    const m = this.mate, tg = this.tg(), tp = tg.pos;
    let P = this.plan;
    if (!P) {
      const mx = (this.pos.x + m.pos.x) / 2, mz = (this.pos.z + m.pos.z) / 2;
      const a = Math.atan2(tp.z - mz, tp.x - mx) + (Math.random() - 0.5) * 1.1;
      const D = new V3(Math.cos(a), 0, Math.sin(a)), N = new V3(-D.z, 0, D.x);
      P = this.plan = { C: new V3(), D, N, sgn: 1, st: 'move', t: 7, go: 0, hit: new Set() };
    }
    P.t -= dt;
    if (P.st === 'move' || P.st === 'arm') P.y = tg.center(playerC).y - 0.12;
    if (P.st === 'move') {   // the start line tracks the target until the pylons are in place
      P.C.set(tp.x - P.D.x * FENCE.sweep / 2, 0, tp.z - P.D.z * FENCE.sweep / 2);
      const lim = ARENA - 12; P.C.x = Math.max(-lim, Math.min(lim, P.C.x)); P.C.z = Math.max(-lim, Math.min(lim, P.C.z));
      P.sgn = (this.pos.x - P.C.x) * P.N.x + (this.pos.z - P.C.z) * P.N.z >= 0 ? 1 : -1;
    }
    else if (P.st === 'arm' || P.st === 'sweep') {   // slide sideways to keep the target inside the fence's span
      const lat = (tp.x - P.C.x) * P.N.x + (tp.z - P.C.z) * P.N.z, mv = Math.max(-FENCE.slide * dt, Math.min(FENCE.slide * dt, lat));
      P.C.addScaledVector(P.N, mv);
    }
    const h = FENCE.len / 2;
    this.slot.set(P.C.x + P.N.x * h * P.sgn, 0, P.C.z + P.N.z * h * P.sgn);
    m.slot.set(P.C.x - P.N.x * h * P.sgn, 0, P.C.z - P.N.z * h * P.sgn);
    const dist = G.player ? G.player.pos.distanceTo(this.pos) : 0;
    if (P.st === 'move') {
      if ((this.slotD < 3 && m.slotD < 3) || P.t <= 0) { P.st = 'arm'; P.t = FENCE.arm; sfx('fence', dist); G.onFence && G.onFence(this); }
    } else if (P.st === 'arm') {
      if (P.t <= 0) { P.st = 'sweep'; P.go = 0; G.fenceSweeps = (G.fenceSweeps || 0) + 1; }
    } else if (P.st === 'sweep') {
      const v = FENCE.speed * dt; P.C.addScaledVector(P.D, v); P.go += v;
      if (P.go >= FENCE.sweep) { P.st = 'rest'; P.t = FENCE.rest; }
    } else if (P.t <= 0) this.plan = null;
    if ((P.st === 'arm' || P.st === 'sweep') && !(m.stunT > 0)) this.fence(P);
  }
  fence(P) {
    const a = this.c, b = this.mate.c;
    if (P.st === 'arm') { if (Math.sin(G.time * 38) > -0.3) G.fx.streak(a, b, 0.05, 0xff5030); return; }
    G.fx.streak(a, b, 0.26, 0xff3020); G.fx.streak(a, b, 0.07, 0xffe8d8);
    if (Math.random() < 0.8) { _fa.lerpVectors(a, b, Math.random()); G.fx.emit('add', { x: _fa.x, y: _fa.y, z: _fa.z, vy: 1.2, life: 0.25, s0: 0.9, s1: 0.2, c0: 0xff5a30 }); }
    for (const e of entsFor('E')) {
      if (e.isBarrel || P.hit.has(e)) continue;
      if (segDist(e.c, a, b) < FENCE.w + (e.r || 1) * 0.25) {
        P.hit.add(e); G.curLabel = 'fence'; G.curSrc = e.c; dealDamage(e, FENCE.dmg, 'E', e.c, 'fence'); G.curLabel = null;
        G.fenceHits = (G.fenceHits || 0) + 1;
        G.fx.sparks(e.c, P.D, 14, 0xff6040, 14, 1, 0.3, 0.25);
        if (e.isPlayer) { const pp = G.player; pp.vel.x += P.D.x * FENCE.knock; pp.vel.z += P.D.z * FENCE.knock; pp.vel.y = Math.max(pp.vel.y, 6); G.fx.trauma = Math.min(1, G.fx.trauma + 0.4); sfx('zap', 0); }
      }
    }
  }
  loneLogic(dt) {
    const p = this.tg(), pc = p.center(playerC);
    _a.set(this.pos.x - pc.x, 0, this.pos.z - pc.z);
    const ang = Math.atan2(_a.z, _a.x) + this.orbit * dt * 0.35;
    this.slot.set(pc.x + Math.cos(ang) * 28, 0, pc.z + Math.sin(ang) * 28);
    this.linkT -= dt;
    if (this.linkT <= 0) {
      this.linkT = 1;
      for (const e of G.enemies) if (e !== this && e.kind === 'fencer' && e.alive && !e.dying && !e.mate && e.c.distanceTo(this.c) < 140) { this.link(e); G.fenceLinks = (G.fenceLinks || 0) + 1; G.onFenceLink && G.onFenceLink(); return; }
    }
    const dist = _a.length();
    if (this.checkLos(dt) && dist < 80) { this.fireT -= dt; if (this.fireT <= 0) { this.fireT = 2.6 + Math.random(); this.burst = 3; this.burstT = 0; } }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstT = 0.12; this.burst--;
        if (p === G.player) lead(this.c, 95, _b); else _b.copy(pc);
        _d.subVectors(_b, this.c).normalize();
        G.curLabel = 'fencer'; spawnShot({ p: this.c.clone(), v: _d.clone().multiplyScalar(95), dmg: 8, team: 'E', kind: 'ebullet', color: 0xff5030, w: 0.2, len: 4, life: 1.6 }); G.curLabel = null;
        G.fx.muzzle(this.c, _d, 0xff7050, 0.8); sfx('eshot', dist);
      }
    }
  }
}

// TS-1 stasis field: a bubble at the aim point where enemies run at a fraction of normal time and enemy shots crawl
G.stasis = [];
const stasisMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd8ff).multiplyScalar(1.3), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const stasisWire = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8ecff).multiplyScalar(1.5), wireframe: true, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const stasisGeo = { sh: new THREE.SphereGeometry(1, 32, 16), wf: new THREE.IcosahedronGeometry(1, 2), ring: new THREE.TorusGeometry(1, 0.008, 4, 72) };
function castStasis(owner, slot, d, aim) {
  const mp = owner.muzzlePos(slot, new V3(), 0).clone();
  _d.subVectors(aim, mp); let L = Math.min(d.range, _d.length()); _d.normalize();
  const w = raySolids(mp, _d, L); if (w.t < L) L = Math.max(2, w.t - 1);
  const c = mp.clone().addScaledVector(_d, L); c.y = Math.max(c.y, groundAt(c.x, c.z, c.y + 1) + 3);
  const o = new THREE.Group();
  const sh = new THREE.Mesh(stasisGeo.sh, stasisMat.clone()), wf = new THREE.Mesh(stasisGeo.wf, stasisWire.clone()); o.add(sh, wf);
  const rings = [];
  for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(stasisGeo.ring, stasisWire.clone()); r.rotation.set(k * 1.05, k * 0.7, 0); o.add(r); rings.push(r); }
  o.position.copy(c); o.scale.setScalar(0.1); G.scene.add(o);
  G.stasis.push({ c, R: d.R, t: d.dur, d, o, sh, wf, rings, age: 0 });
  G.stasisN = (G.stasisN || 0) + 1;
  sfx('stasis', G.player ? G.player.pos.distanceTo(c) : 0);
  G.fx.flash(c, 0x9fd8ff, 22, 26, 0.2); G.fx.ring(c.clone(), null, 1, d.R * 1.2, 0.5, 0xc8ecff);
}
export function stasisK(p, big) {   // time scale inside a field at point p (1 = normal)
  let k = 1;
  for (const s of G.stasis) if (s.age > 0.15 && p.distanceTo(s.c) < s.R) k = Math.min(k, big ? s.d.bossK : s.d.k);
  return k;
}
function stasisShotK(x, y, z) {
  let k = 1;
  for (const s of G.stasis) if (s.age > 0.15 && Math.hypot(x - s.c.x, y - s.c.y, z - s.c.z) < s.R) k = Math.min(k, s.d.shotK);
  return k;
}
function updateStasis(dt) {
  for (let i = G.stasis.length - 1; i >= 0; i--) {
    const s = G.stasis[i]; s.age += dt; s.t -= dt;
    if (s.t <= 0) { s.o.parent && s.o.parent.remove(s.o); G.stasis.splice(i, 1); continue; }
    const grow = Math.min(1, s.age * 5), fade = Math.min(1, s.t * 2);
    s.o.scale.setScalar(s.R * grow * (1 + 0.01 * Math.sin(s.age * 5)));
    s.sh.material.opacity = 0.07 * fade; s.wf.material.opacity = 0.1 * fade; s.wf.rotation.y += dt * 0.15;
    s.rings.forEach((r, k) => { r.rotation.z += dt * (0.3 + k * 0.2) * (k % 2 ? -1 : 1); r.material.opacity = 0.16 * fade; });
    if (Math.random() < 0.6) { const a = Math.random() * 6.28, b = Math.acos(Math.random() * 2 - 1), r = s.R * Math.cbrt(Math.random()); G.fx.emit('add', { x: s.c.x + Math.sin(b) * Math.cos(a) * r, y: s.c.y + Math.cos(b) * r, z: s.c.z + Math.sin(b) * Math.sin(a) * r, vy: 0.15, life: 1.6, s0: 0.35, s1: 0.1, c0: 0xd8f0ff }); }
  }
}
export function clearStasis() { for (const s of G.stasis) s.o.parent && s.o.parent.remove(s.o); G.stasis.length = 0; }

// toxic works: drifting clouds of corrosive acid fog. Anything inside a cloud and below 8 m corrodes: the player 14 AP/s,
// ordinary enemies 10 HP/s (bosses and things flying above the fog are immune). The wind slowly turns, so the clouds wander.
export const ACID = { on: false, dps: 14, edps: 10, h: 8 };
G.acid = [];
let acidTex = null;
function acidDecalTex() {
  if (acidTex) return acidTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); acidTex = new THREE.CanvasTexture(cv); return acidTex;
}
export function clearAcid() { for (const c of G.acid) c.o.parent && c.o.parent.remove(c.o); G.acid.length = 0; ACID.on = false; G.inAcid = false; }
export function startAcid(n) {
  clearAcid(); ACID.on = true; G.windA = Math.random() * 6.28; G.acidT = 0;
  const geo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.283 + 0.5, r = 55 + Math.random() * 45;
    const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: acidDecalTex(), color: 0x7aa838, transparent: true, opacity: 0.17, depthWrite: false }));
    o.renderOrder = 2; G.scene.add(o);
    G.acid.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, R: 12 + Math.random() * 4, ph: Math.random() * 6, o });
  }
}
function updateAcid(dt) {
  G.windA += dt * 0.05;
  const wx = Math.cos(G.windA) * 1.8, wz = Math.sin(G.windA) * 1.8, p = G.player;
  let inP = false;
  for (const c of G.acid) {
    c.ph += dt;
    c.x += (wx + Math.sin(c.ph * 0.3) * 0.9) * dt; c.z += (wz + Math.cos(c.ph * 0.27) * 0.9) * dt;
    const lim = ARENA - c.R * 0.6; c.x = Math.max(-lim, Math.min(lim, c.x)); c.z = Math.max(-lim, Math.min(lim, c.z));
    c.o.position.set(c.x, 0.14, c.z); c.o.scale.setScalar(c.R * 1.15);
    for (let q = Math.random() < 0.6 ? 2 : 1; q > 0; q--) {
      const a = Math.random() * 6.283, r = c.R * Math.sqrt(Math.random()) * 0.9;
      G.fx.emit('smoke', { x: c.x + Math.cos(a) * r, y: 0.6 + Math.random() * 4.5, z: c.z + Math.sin(a) * r, vx: wx * 0.6, vy: 0.35, vz: wz * 0.6, life: 3.2, s0: 5, s1: 11, c0: 0xa8c850, c1: 0x7a9438, a0: 0.3, a1: 0, drag: 0.4 });
    }
    if (p && p.alive && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < c.R && p.pos.y < groundAt(c.x, c.z, 99) + ACID.h) inP = true;
    for (const e of G.enemies) {
      if (!(e instanceof Enemy) || !e.alive || e.dying || e.maxHp > 1500 || e.cloaked) continue;
      if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < c.R && e.c.y < ACID.h + 1) { e.hp -= ACID.edps * dt; G.acidDmgE = (G.acidDmgE || 0) + ACID.edps * dt; if (e.hp <= 0) e.die(); }
    }
  }
  G.inAcid = inP;
  if (inP) { hurtPlayer(ACID.dps * dt, 'acid'); G.acidT += dt; }
}

// Hive: a slow carrier that hovers ~22 m up, 45-70 m from its target. Every 8 s it opens its bays and drops a swarm of six
// swarmlings (kamikaze micro-drones), keeping at most 14 of its own alive. The amber core underneath takes x1.6 damage.
export const HIVE = { hp: 1300, cd: 8, n: 6, cap: 14, swarmHp: 36, swarmDmg: 14, swarmSpd: 26, life: 20 };
export class Hive extends Enemy {
  constructor(pos) {
    super('hive', 'E_Hive', pos, HIVE.hp, 3.8); this.boom = 2.2; this.obj.scale.setScalar(1.3);
    this.vel = new V3(); this.ph = Math.random() * 6; this.orbit = Math.random() < 0.5 ? 1 : -1; this.relT = 3 + Math.random() * 2; this.open = 0; this.kids = [];
    this.c.copy(pos);
  }
  hit(dmg, at, label) { if (at && at.y < this.c.y - 0.8) dmg *= 1.6; super.hit(dmg); }   // the core under the hull
  update(dt) {
    this.ph += dt;
    for (let i = 1; i <= 4; i++) { const r = this.n['HV_Rotor' + i]; if (r) r.rotation.z += dt * 26; }
    const core = this.n.HV_Core; if (core) core.scale.setScalar(1 + 0.15 * Math.sin(this.ph * 5) + this.open * 0.4);
    const p = this.tg(), pc = p.center(playerC);
    _a.set(this.pos.x - pc.x, 0, this.pos.z - pc.z); const L = _a.length() || 1;
    const ang = Math.atan2(_a.z, _a.x) + this.orbit * dt * 0.12;
    const want = 58, tx = pc.x + Math.cos(ang) * want, tz = pc.z + Math.sin(ang) * want;
    const ty = Math.max(groundAt(this.pos.x, this.pos.z, 99), groundAt(tx, tz, 99)) + 22 + Math.sin(this.ph * 0.9) * 1.2;
    _b.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z);
    const Lb = _b.length(); if (Lb > 0) _b.multiplyScalar(Math.min(6, Lb * 0.6) / Lb);
    this.vel.lerp(_b, 1 - Math.exp(-1.2 * dt)); this.pos.addScaledVector(this.vel, dt);
    const s = pointInSolid(this.pos, 3); if (s) { this.pos.y = s.max.y + 5; this.vel.y = Math.max(this.vel.y, 2); }
    this.pos.x = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.x)); this.pos.z = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.z));
    this.c.set(this.pos.x, this.pos.y, this.pos.z);
    this.obj.rotation.y = Math.atan2(this.pos.x - pc.x, this.pos.z - pc.z);
    this.obj.rotation.x = -this.vel.z * 0.02; this.obj.rotation.z = this.vel.x * 0.02;
    this.open = Math.max(0, this.open - dt);
    this.kids = this.kids.filter((k) => k.alive);
    this.relT -= dt;
    if (this.relT <= 0 && L < 120) {
      this.relT = HIVE.cd + Math.random();
      const n = Math.min(HIVE.n, HIVE.cap - this.kids.length);
      if (n > 0) {
        this.open = 1.4; sfx('hive', G.player ? G.player.pos.distanceTo(this.pos) : 0); G.hiveRel = (G.hiveRel || 0) + n;
        for (let k = 0; k < n; k++) G.queue.push({ label: 'swarm', t: k * 0.12, fn: () => { if (this.alive) new Swarm(new V3(this.pos.x + (Math.random() - 0.5) * 2, this.pos.y - 2, this.pos.z + (Math.random() - 0.5) * 2), this); } });
        G.onHive && G.onHive(this);
      }
    }
    if (this.open > 0 && Math.random() < 0.6) G.fx.emit('add', { x: this.pos.x, y: this.pos.y - 1.6, z: this.pos.z, vy: -3, life: 0.3, s0: 1.4, s1: 0.4, c0: 0xffb040 });
  }
}
// swarmling: drifts out of the bay, then homes in on its target with a weave and bursts on contact (12). 14 HP; dies after 20 s.
export class Swarm extends Enemy {
  constructor(pos, hive) {
    super('swarm', 'E_Swarm', pos, HIVE.swarmHp, 0.9); this.obj.scale.setScalar(1.7);
    const a = Math.random() * 6.28; this.vel = new V3(Math.cos(a) * 7, -3, Math.sin(a) * 7);
    this.ph = Math.random() * 6; this.wob = (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6); this.age = 0; this.spd = HIVE.swarmSpd * (0.85 + Math.random() * 0.3);
    this.c.copy(pos); if (hive) hive.kids.push(this);
  }
  explode() { G.fx.explosion(this.c, 0.28, 0xffa040); G.fx.sparks(this.c, null, 6, 0xffb050, 10, 0.6, 0.25, 0.18); this.remove(); }
  pop() { this.dying = true; this.alive = false; this.explode(); }
  update(dt) {
    this.age += dt; this.ph += dt;
    if (this.age > HIVE.life) { this.pop(); return; }
    const p = this.tg(), pc = p.center(playerC);
    _a.subVectors(pc, this.c); const d = _a.length() || 1; _a.divideScalar(d);
    if (this.age > 0.6) {
      _b.set(-_a.z, 0, _a.x).multiplyScalar(Math.sin(this.ph * 3.2) * this.wob * Math.min(1, d / 12));
      _c.copy(_a).add(_b).normalize().multiplyScalar(this.spd);
      this.vel.lerp(_c, 1 - Math.exp(-2.6 * dt));
    } else this.vel.multiplyScalar(1 - Math.min(1, dt * 1.5));
    this.pos.addScaledVector(this.vel, dt);
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1); if (this.pos.y < gy + 0.8) { this.pos.y = gy + 0.8; this.vel.y = Math.abs(this.vel.y) * 0.5; }
    this.c.copy(this.pos);
    this.obj.rotation.y = Math.atan2(-this.vel.x, -this.vel.z); this.obj.rotation.x = Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z)) * 0.8;
    const w1 = this.n.SW_Wing1, w2 = this.n.SW_Wing2, fl = Math.sin(this.ph * 50) * 0.6; if (w1) w1.rotation.y = fl; if (w2) w2.rotation.y = -fl;
    if (d < 2.6) {   // burst on contact
      for (const e of entsFor('E')) if (!e.isBarrel && e.c.distanceTo(this.c) < 3.2) { G.curSrc = this.c; dealDamage(e, HIVE.swarmDmg, 'E', this.c, 'swarm'); G.swarmHits = (G.swarmHits || 0) + 1; break; }
      this.pop();
    }
  }
}

// power plant: the floor is split into 40 m sectors. Every ~8 s two or three sectors near the player charge for 2 s (yellow),
// then discharge for 3 s (blue arcs): anything standing on a live sector is shocked (grounded player 26 AP/s, ground enemies
// 20 HP/s). Jump or hover to ride it out, or get off the sector during the warning.
export const GRIDZ = { S: 40, dps: 26, edps: 20, warn: 2, live: 3 };
G.zones = [];
export function clearGrid() { G.zones.length = 0; for (const v of GRID.uZ.value) v.set(0, 0, 0, 0); G.gridT = 6; }
function updateGrid(dt) {
  const p = G.player; if (!p) return;
  const S = GRIDZ.S;
  for (let i = G.zones.length - 1; i >= 0; i--) {
    const z = G.zones[i]; z.t -= dt;
    if (z.st === 'warn' && z.t <= 0) { z.st = 'live'; z.t = GRIDZ.live; sfx('zap', Math.hypot(p.pos.x - z.x, p.pos.z - z.z)); G.gridShocks = (G.gridShocks || 0) + 1; }
    else if (z.st === 'live' && z.t <= 0) G.zones.splice(i, 1);
  }
  G.gridT = (G.gridT ?? 6) - dt;
  if (G.gridT <= 0 && p.alive) {
    G.gridT = 6.5 + Math.random() * 2;
    const ci = Math.floor(p.pos.x / S), cj = Math.floor(p.pos.z / S), want = 3, lim = Math.floor(ARENA / S);
    const picks = [];
    if (Math.random() < 0.75) picks.push([ci, cj]);
    for (let k = 0; k < 30 && picks.length < want; k++) {
      const a = ci + Math.round((Math.random() - 0.5) * 4), b = cj + Math.round((Math.random() - 0.5) * 4);
      if (a < -lim || a >= lim || b < -lim || b >= lim || picks.some(([x, y]) => x === a && y === b)) continue;
      picks.push([a, b]);
    }
    for (const [a, b] of picks) if (G.zones.length < 4) G.zones.push({ x: a * S + S / 2, z: b * S + S / 2, st: 'warn', t: GRIDZ.warn });
    sfx('warn', 0);
  }
  let shocked = false;
  for (const z of G.zones) {
    if (z.st !== 'live') continue;
    const h = S / 2;
    if (p.alive && p.grounded && Math.abs(p.pos.x - z.x) < h && Math.abs(p.pos.z - z.z) < h) shocked = true;
    for (const e of G.enemies) {
      if (!(e instanceof Enemy) || !e.alive || e.dying || e.maxHp > 1500 || Math.abs(e.pos.x - z.x) > h || Math.abs(e.pos.z - z.z) > h) continue;
      if (e.c.y - groundAt(e.pos.x, e.pos.z, e.c.y) > 5) continue;
      e.hp -= GRIDZ.edps * dt; G.gridDmgE = (G.gridDmgE || 0) + GRIDZ.edps * dt; if (e.hp <= 0) e.die();
    }
    if (Math.random() < 0.5) {   // arcs crawling over the sector
      const ax = z.x + (Math.random() - 0.5) * S * 0.9, az = z.z + (Math.random() - 0.5) * S * 0.9;
      G.fx.lightning(new V3(ax, 0.3, az), new V3(ax + (Math.random() - 0.5) * 9, 0.3, az + (Math.random() - 0.5) * 9), 0x9fd8ff, 0.22, 0.1, 1.2);
    }
  }
  G.inGrid = shocked;
  if (shocked) {
    G.curSrc = null; damagePlayer(GRIDZ.dps * dt, null, 'grid'); G.gridT_ = (G.gridT_ || 0) + dt;
    if (Math.random() < 0.3) G.fx.lightning(new V3(p.pos.x, 0.3, p.pos.z), p.center(new V3()), 0x9fd8ff, 0.3, 0.08, 1);
    if (!G.gridSaid) { G.gridSaid = true; G.onHint && G.onHint('通电 · 蓝色的地块正在放电 · 起跳悬停躲过去，或在黄色预警时离开那一格', 4); }
  }
  for (let k = 0; k < 4; k++) { const z = G.zones[k], v = GRID.uZ.value[k]; if (z) v.set(z.x, z.z, z.st === 'live' ? 2 : 1, z.t); else v.set(0, 0, 0, 0); }
}

// ---- tornadoes (prairie): a few funnels wander the map. Inside 30 m they drag you toward the core; in the 7 m core you are
// lifted, spun and battered (10 AP/s), then flung out. Enemies under 1500 HP get dragged and shredded too (24 HP/s).
export const TWIST = { pull: 34, core: 8, pullV: 9, swirl: 6, dps: 14, edps: 14, hold: 1.6, fling: 30, speed: 6.5 };
G.twisters = [];
let twTex = null;
function twisterTex() {
  if (twTex) return twTex;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  for (let k = 0; k < 70; k++) {
    const x = Math.random() * 128, w = 2 + Math.random() * 10, a = 0.15 + Math.random() * 0.5;
    const gr = g.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.save(); g.translate(0, 0); g.transform(1, 0, -0.6, 1, 0, 0); g.fillRect(x - w, 0, w * 2 + 40, 64); g.restore();
  }
  g.globalCompositeOperation = 'destination-in'; const fv = g.createLinearGradient(0, 0, 0, 64); fv.addColorStop(0, 'rgba(0,0,0,0)'); fv.addColorStop(0.25, 'rgba(0,0,0,1)'); fv.addColorStop(0.75, 'rgba(0,0,0,1)'); fv.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fv; g.fillRect(0, 0, 128, 64);
  twTex = new THREE.CanvasTexture(cv); twTex.wrapS = THREE.RepeatWrapping; twTex.wrapT = THREE.ClampToEdgeWrapping; return twTex;
}
export function clearTwisters() { for (const t of G.twisters) t.o.parent && t.o.parent.remove(t.o); G.twisters.length = 0; G.inTwist = false; G.twistHold = 0; }
export function startTwisters(n) {
  clearTwisters();
  for (let k = 0; k < n; k++) {
    const o = new THREE.Group(), segs = [];
    for (let j = 0; j < 9; j++) {
      const y0 = j * 8, r0 = 2.4 + Math.pow(j / 9, 1.6) * 22, r1 = 2.4 + Math.pow((j + 1) / 9, 1.6) * 22;
      const tex = twisterTex().clone(); tex.needsUpdate = true; tex.repeat.set(2 + j * 0.4, 1);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1 * 1.08, r0 * 0.94, 12, 28, 1, true), new THREE.MeshBasicMaterial({ map: tex, color: 0x6e604c, transparent: true, opacity: 0.85 - j * 0.04, side: THREE.DoubleSide, depthWrite: false }));
      m.position.y = y0 + 4.2; m.renderOrder = 3; o.add(m); segs.push(m);
    }
    G.scene.add(o);
    const a = k / n * 6.283 + 0.7, r = 70 + Math.random() * 50;
    G.twisters.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, tx: 0, tz: 0, reT: 0, ph: Math.random() * 6, o, segs, cool: 0 });
  }
}
function updateTwisters(dt) {
  const p = G.player, T = TWIST; let inP = false;
  for (const t of G.twisters) {
    t.ph += dt; t.reT -= dt; t.cool = Math.max(0, t.cool - dt);
    if (t.reT <= 0) {   // pick a new heading; drift toward the player a fair share of the time
      t.reT = 7 + Math.random() * 5;
      if (p && Math.random() < 0.45) { t.tx = p.pos.x + (Math.random() - 0.5) * 50; t.tz = p.pos.z + (Math.random() - 0.5) * 50; }
      else { const lim = ARENA - 30; t.tx = (Math.random() * 2 - 1) * lim; t.tz = (Math.random() * 2 - 1) * lim; }
    }
    const dx = t.tx - t.x, dz = t.tz - t.z, L = Math.hypot(dx, dz) || 1, v = Math.min(T.speed, L);
    t.x += dx / L * v * dt + Math.sin(t.ph * 0.7) * 1.2 * dt; t.z += dz / L * v * dt + Math.cos(t.ph * 0.6) * 1.2 * dt;
    t.o.position.set(t.x, groundAt(t.x, t.z, 0) , t.z);
    for (let j = 0; j < t.segs.length; j++) {
      const s = t.segs[j]; s.rotation.y = -t.ph * (3.2 - j * 0.18); s.position.x = Math.sin(t.ph * 0.9 + j * 0.45) * j * 0.55; s.position.z = Math.cos(t.ph * 0.8 + j * 0.4) * j * 0.55;
      s.material.map.offset.x = t.ph * (0.25 + j * 0.03);
    }
    if (Math.random() < 0.9) {   // dust skirt and debris
      const a = Math.random() * 6.283, r = 3 + Math.random() * 9;
      G.fx.emit('smoke', { x: t.x + Math.cos(a) * r, y: 0.6, z: t.z + Math.sin(a) * r, vx: -Math.sin(a) * 9, vy: 2 + Math.random() * 3, vz: Math.cos(a) * 9, life: 1.6, s0: 3, s1: 8, c0: 0x9a8a6a, c1: 0x7a6c54, a0: 0.4, a1: 0, drag: 0.6 });
    }
    if (Math.random() < 0.35) { const a = Math.random() * 6.283; G.fx.sparks(new V3(t.x + Math.cos(a) * 4, 1 + Math.random() * 14, t.z + Math.sin(a) * 4), new V3(-Math.sin(a), 0.6, Math.cos(a)), 1, 0x5a4a38, 16, 1.2, 0.25, 0.9); }
    // the player
    if (p && p.alive && !(G.blinkInv > 0)) {
      const ex = p.pos.x - t.x, ez = p.pos.z - t.z, d = Math.hypot(ex, ez) || 0.01, hy = p.pos.y - groundAt(t.x, t.z, 0);
      if (d < T.pull && hy < 40) {
        const k = 1 - d / T.pull, nx = ex / d, nz = ez / d;
        const pv = (T.pullV * k + 1.5) * dt, sv = T.swirl * k * dt;
        p.pos.x += -nx * pv - nz * sv; p.pos.z += -nz * pv + nx * sv;
        if (d < 12) G.fx.trauma = Math.min(1, G.fx.trauma + dt * 0.6);
        if (d < T.core && t.cool <= 0) {
          inP = true; G.twistHold = (G.twistHold || 0) + dt; G.twistT_ = (G.twistT_ || 0) + dt;
          p.grounded = false; p.vel.y = Math.max(p.vel.y, Math.max(2, 12 - hy * 0.6));
          p.pos.x += -nz * 10 * dt; p.pos.z += nx * 10 * dt;
          hurtPlayer(T.dps * dt, 'twister');
          if (G.twistHold > T.hold) {   // flung out
            G.twistHold = 0; t.cool = 3; G.twistFlings = (G.twistFlings || 0) + 1;
            p.vel.x = nx * T.fling - nz * 10; p.vel.z = nz * T.fling + nx * 10; p.vel.y = 9;
            G.fx.trauma = Math.min(1, G.fx.trauma + 0.5); sfx('boom', 0);
          }
          if (!G.twistSaid) { G.twistSaid = true; G.onHint && G.onHint('被龙卷卷住了 · 每秒掉装甲 · 推进或急闪逃出漏斗，或者等它把你甩出去', 4); }
        }
      }
    }
    for (const e of G.enemies) {
      if (!(e instanceof Enemy) || !e.alive || e.dying || e.maxHp > 1500 || e.kind === 'boss' || e.cloaked) continue;
      const ex = e.pos.x - t.x, ez = e.pos.z - t.z, d = Math.hypot(ex, ez) || 0.01;
      if (d > T.pull || e.c.y - groundAt(t.x, t.z, 0) > 40) continue;
      const k = 1 - d / T.pull;
      e.pos.x -= ex / d * (T.pullV * 0.7 * k) * dt + ez / d * T.swirl * k * dt; e.pos.z -= ez / d * (T.pullV * 0.7 * k) * dt - ex / d * T.swirl * k * dt;
      if (d < T.core) { e.hp -= T.edps * dt; G.twistDmgE = (G.twistDmgE || 0) + T.edps * dt; e.flash = 0.05; if (e.hp <= 0) e.die(); }
    }
  }
  if (!inP) G.twistHold = Math.max(0, (G.twistHold || 0) - dt * 2);
  G.inTwist = inP;
}

// Blinker: a phase-shift assault drone. It circles at range plinking, then marks a spot behind its target (red ring, 0.75 s),
// blinks there and fires a shotgun burst, then sits exposed for 1.3 s (takes x1.6 damage) before blinking back out.
export const BLINK = { hp: 420, mark: 0.75, pellets: 7, dmg: 7, cd: [6, 9], exposed: 1.3, behind: 10 };
export class Blinker extends Enemy {
  constructor(pos) {
    super('blinker', 'E_Blinker', pos, BLINK.hp, 1.7); this.boom = 0.8; this.obj.scale.setScalar(1.4);
    this.vel = new V3(); this.orbit = Math.random() < 0.5 ? 1 : -1; this.ph = Math.random() * 6; this.st = 'hover'; this.stT = 2 + Math.random() * 3;
    this.spot = new V3(); this.lockOn = null; this.c.copy(pos);
  }
  hit(dmg, at, label) { if (this.st === 'exposed') dmg *= 1.6; super.hit(dmg); }
  jump(to) {
    G.fx.flash(this.c, 0xc060ff, 18, 20, 0.2); G.fx.ring(this.c.clone(), null, 1, 5, 0.3, 0xd080ff);
    G.fx.lightning(this.c.clone(), to.clone(), 0xc080ff, 0.18, 0.12, 0.6);
    this.pos.copy(to); this.c.copy(to); this.vel.set(0, 0, 0);
    G.fx.flash(this.c, 0xc060ff, 22, 24, 0.25); G.fx.ring(this.c.clone(), null, 1, 6, 0.35, 0xd080ff);
    sfx('blink', G.player ? G.player.pos.distanceTo(this.pos) : 0);
  }
  update(dt) {
    this.ph += dt; this.stT -= dt;
    const ring = this.n.BL_Ring; if (ring) { ring.rotation.y += dt * (this.st === 'mark' ? 30 : 6); ring.scale.setScalar(this.st === 'exposed' ? 1.4 + Math.sin(this.ph * 20) * 0.2 : 1); }
    const p = this.tg(), pc = p.center(playerC);
    if (this.st === 'hover') {
      const ang = Math.atan2(this.pos.z - pc.z, this.pos.x - pc.x) + this.orbit * dt * 0.5;
      const tx = pc.x + Math.cos(ang) * 34, tz = pc.z + Math.sin(ang) * 34, ty = groundAt(this.pos.x, this.pos.z, 99) + 7 + Math.sin(this.ph) * 1.5;
      _a.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z); const L = _a.length(); if (L > 0) _a.multiplyScalar(Math.min(16, L * 1.2) / L);
      this.vel.lerp(_a, 1 - Math.exp(-2 * dt)); this.pos.addScaledVector(this.vel, dt);
      const s = pointInSolid(this.pos, 1.5); if (s) { this.pos.y = s.max.y + 2.5; this.vel.y = Math.max(this.vel.y, 2); }
      this.pos.x = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.x)); this.pos.z = Math.max(-ARENA + 3, Math.min(ARENA - 3, this.pos.z));
      this.c.copy(this.pos);
      if (this.checkLos(dt) && this.c.distanceTo(pc) < 70) {
        this.fireT -= dt;
        if (this.fireT <= 0) { this.fireT = 1.4 + Math.random(); this.volley(pc, 2, 5, 0.05, 'blinker-gun'); }
      }
      if (this.stT <= 0 && this.c.distanceTo(pc) < 80) {   // mark a spot behind the target
        let bx, bz;
        if (p === G.player) { const ya = p.aimYaw + (Math.random() < 0.5 ? 1 : -1) * (1.4 + Math.random() * 0.45); bx = Math.sin(ya); bz = Math.cos(ya); }   // behind-left or behind-right: the ring lands at the edge of the screen, not under the camera else { const a = Math.random() * 6.28; bx = Math.cos(a); bz = Math.sin(a); }
        const sp = new V3(p.pos.x + bx * BLINK.behind + (Math.random() - 0.5) * 4, 0, p.pos.z + bz * BLINK.behind + (Math.random() - 0.5) * 4);
        sp.x = Math.max(-ARENA + 6, Math.min(ARENA - 6, sp.x)); sp.z = Math.max(-ARENA + 6, Math.min(ARENA - 6, sp.z));
        sp.y = groundAt(sp.x, sp.z, p.pos.y + 6) + 3.5; if (pointInSolid(sp, 1.5)) sp.y += 5;
        this.spot.copy(sp); this.st = 'mark'; this.stT = BLINK.mark; this.lockOn = p; G.blinkMarks = (G.blinkMarks || 0) + 1;
        G.fx.warn(new V3(sp.x, groundAt(sp.x, sp.z, sp.y), sp.z), 3, BLINK.mark);
        { const g0 = groundAt(sp.x, sp.z, sp.y); G.fx.streak(new V3(sp.x, g0, sp.z), new V3(sp.x, g0 + 14, sp.z), 0.5, 0xc060ff, BLINK.mark + 0.1); }
        sfx('warn', p === G.player ? 0 : 30); G.onBlink && G.onBlink(this);
      }
    } else if (this.st === 'mark') {
      if (Math.random() < 0.4) G.fx.emit('add', { x: this.spot.x + (Math.random() - 0.5) * 1.6, y: this.spot.y + (Math.random() - 0.5) * 1.6, z: this.spot.z + (Math.random() - 0.5) * 1.6, life: 0.2, s0: 0.35, s1: 0.05, c0: 0xc060ff });
      this.c.copy(this.pos);
      if (this.stT <= 0) { this.jump(this.spot); this.st = 'strike'; this.stT = 0.22; }
    } else if (this.st === 'strike') {
      this.c.copy(this.pos);
      if (this.stT <= 0) { this.volley(pc, BLINK.pellets, BLINK.dmg, 0.11, 'blinker-burst'); this.st = 'exposed'; this.stT = BLINK.exposed; }
    } else if (this.st === 'exposed') {
      this.pos.y += Math.sin(this.ph * 3) * 0.3 * dt; this.c.copy(this.pos);
      if (this.stT <= 0) {
        const a = Math.random() * 6.283, to = new V3(pc.x + Math.cos(a) * 36, 0, pc.z + Math.sin(a) * 36);
        to.x = Math.max(-ARENA + 6, Math.min(ARENA - 6, to.x)); to.z = Math.max(-ARENA + 6, Math.min(ARENA - 6, to.z)); to.y = groundAt(to.x, to.z, 99) + 8;
        this.jump(to); this.st = 'hover'; this.stT = BLINK.cd[0] + Math.random() * (BLINK.cd[1] - BLINK.cd[0]); this.lockOn = null;
      }
    }
    this.obj.rotation.y = Math.atan2(this.pos.x - pc.x, this.pos.z - pc.z);
    this.obj.rotation.z = this.vel.x * 0.015;
  }
  volley(pc, n, dmg, spread, label) {
    G.curLabel = label; G.curShooter = this;
    for (let k = 0; k < n; k++) {
      const mp = this.n['Muzzle_BK' + (1 + (k & 1))].getWorldPosition(_a).clone();
      const aim = n > 2 ? pc : lead(mp, 140, _b, this.tg());
      _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * spread; _d.y += (Math.random() - 0.5) * spread * 0.6; _d.z += (Math.random() - 0.5) * spread;
      spawnShot({ p: mp, v: _d.normalize().multiplyScalar(130), dmg, team: 'E', kind: 'ebullet', color: 0xd070ff, w: n > 2 ? 0.32 : 0.24, len: 4, life: 1.2, label });
    }
    G.curShooter = null;
    G.fx.muzzle(this.c, _d, 0xd080ff, n > 2 ? 1.6 : 0.7); sfx(n > 2 ? 'cannon' : 'eshot', this.pos.distanceTo(G.player.pos));
  }
}

// CM-6 cluster mortar: lobs a carrier shell at the aim point; on the way down it splits into ten bomblets that blanket ~11 m.
function fireCluster(owner, slot, d, aim, dmgMul, team) {
  const mp = owner.muzzlePos(slot, new V3(), 0).clone();
  const hx = aim.x - mp.x, hz = aim.z - mp.z, h0 = Math.hypot(hx, hz), h = Math.max(4, Math.min(d.range, h0)), dy = aim.y - mp.y, v = d.speed, g = d.grav;
  const disc = v ** 4 - g * (g * h * h + 2 * dy * v * v);
  const th = disc > 0 ? Math.atan((v * v + Math.sqrt(disc)) / (g * h)) : Math.PI / 4;   // high arc: the bomblets rain down
  const dir = new V3(hx / (h0 || 1) * Math.cos(th), Math.sin(th), hz / (h0 || 1) * Math.cos(th)).normalize();
  const end = h0 > d.range ? new V3(mp.x + hx / h0 * d.range, aim.y, mp.z + hz / h0 * d.range) : aim.clone();
  const s = spawnShot({ p: mp, v: dir.multiplyScalar(v), dmg: 0, team, kind: 'grenade', grav: g, life: 9, color: 0xffd080, label: team === 'P' ? 'p-cluster' : 'cluster' });
  s.cluster = { n: d.n, R: d.R, dmg: d.dmg * dmgMul, splash: d.splash, aim: end };
  G.fx.muzzle(mp, dir, 0xffc070, 2); sfx('grenade', G.player ? G.player.pos.distanceTo(mp) : 0);
}
function splitCluster(s, at) {
  const C = s.cluster, g = s.grav, vy = -Math.min(0, s.v.y), hgt = Math.max(1, at.y - groundAt(at.x, at.z, at.y));
  const tf = (vy * 0 + Math.sqrt(vy * vy + 2 * g * hgt) - vy) / g + 0.0001;
  const cx = C.aim.x, cz = C.aim.z;
  for (let k = 0; k < C.n; k++) {
    const a = k / C.n * 6.283 + Math.random() * 0.5, r = C.R * Math.sqrt((k + 0.5) / C.n);
    const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
    const b = spawnShot({ p: at, v: new V3((tx - at.x) / tf, s.v.y * 0.6, (tz - at.z) / tf), dmg: C.dmg, team: s.team, kind: 'grenade', splash: C.splash, grav: g, life: 4, color: 0xffb050, label: s.label });
    b.bomblet = true;
  }
  G.clusterSplits = (G.clusterSplits || 0) + 1;
  G.fx.flash(at, 0xffd090, 16, 18, 0.15); G.fx.sparks(at, null, 10, 0xffd090, 14, 0.6, 0.3, 0.2);
}

// ---- lockdown: searchlight watchtowers. Each tower sweeps a 62 m light cone across the ground. If it catches you (in the
// cone, line of sight) you are SPOTTED for 2.5 s and every lit tower keeps its beam on you; while spotted, artillery walks
// in on your position (3 shells every 3.6 s, red rings 1.2 s ahead, 40 each). Break line of sight, pop chaff or kill the
// towers. The hit sphere is the lamp head, above the solid legs.
export const WATCH = { hp: 900, range: 66, half: 0.26, spot: 3.5, every: 3.4, first: 1.4, shells: 5, warn: 1.2, dmg: 48, R: 6, sweep: 1.1, rate: 0.42 };
G.barrage = [];
const beamGeo = (() => { const h = WATCH.range, r = h * Math.tan(WATCH.half); return new THREE.ConeGeometry(r, h, 28, 1, true).translate(0, -h / 2, 0).rotateX(-Math.PI / 2); })();
const beamTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#b0b0b0'); gr.addColorStop(0.85, '#505050'); gr.addColorStop(1, '#202020'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();   // bright at the lamp, gone by the far end (additive: black = invisible)
const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#808080'); gr.addColorStop(1, '#000000'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
export class Watchtower extends Enemy {
  constructor(pos) {
    super('watch', 'E_Watch', pos, WATCH.hp, 2.4); this.boom = 2.4; this.obj.scale.setScalar(1.1);
    this.pos.y = groundAt(pos.x, pos.z, 50);
    this.c.set(this.pos.x, this.pos.y + 9.8, this.pos.z);
    this.solid = addSolid(this.pos.x, this.pos.z, 3.0, 3.0, 7.0, 0, 'watch');
    this.yaw0 = Math.random() * 6.28; this.ph = Math.random() * 6; this.reT = 0; this.lock = 0; this.yaw = this.yaw0; this.pitch = 0.22;
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c0, map: beamTex, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.beam.renderOrder = 4; G.scene.add(this.beam);
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c0, map: poolTex, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.pool.renderOrder = 3; G.scene.add(this.pool);
  }
  remove() { super.remove(); removeSolid(this.solid); this.beam.parent && this.beam.parent.remove(this.beam); this.pool.parent && this.pool.parent.remove(this.pool); }
  die() { super.die(); this.beam.visible = false; this.pool.visible = false; }
  update(dt) {
    this.ph += dt; this.reT -= dt;
    const p = G.player, pc = p.center(playerC);
    const head = this.n.WH_Head;
    const lamp = (this.n.WH_Lamp || head).getWorldPosition(_a).clone();
    const dx = pc.x - lamp.x, dz = pc.z - lamp.z, hd = Math.hypot(dx, dz) || 1;
    if (this.reT <= 0) { this.reT = 4 + Math.random() * 3; this.yaw0 = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.8; }   // swing the sweep toward the player now and then
    let wantYaw, wantPitch;
    const stun = G.chaffT > 0;
    if (this.lock > 0 && !stun) { this.lock -= dt; wantYaw = Math.atan2(-dx, -dz); wantPitch = Math.atan2(lamp.y - pc.y, hd); }
    else { wantYaw = this.yaw0 + Math.sin(this.ph * WATCH.rate) * WATCH.sweep; wantPitch = 0.12 + Math.sin(this.ph * 0.55) * 0.16; }
    this.yaw += angDiff(wantYaw, this.yaw) * Math.min(1, dt * (this.lock > 0 ? 3 : 1.5)); this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 2);
    if (head) head.rotation.y = this.yaw; if (head) head.rotation.x = -this.pitch;
    const dir = _d.set(-Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    this.beam.position.copy(lamp); _b.copy(lamp).add(dir); this.beam.lookAt(_b);
    // seen from inside the cone (the beam is on you) the double-sided additive surface washes out the whole screen: fade it
    const cp = G.camera.position; _c.set(cp.x - lamp.x, cp.y - lamp.y, cp.z - lamp.z); const cl = _c.length() || 1, ca = _c.dot(dir) / cl, inC = cl < WATCH.range * 1.1 ? THREE.MathUtils.clamp((ca - Math.cos(WATCH.half * 2.6)) / (Math.cos(WATCH.half * 1.1) - Math.cos(WATCH.half * 2.6)), 0, 1) : 0;
    this.beam.material.opacity = (this.lock > 0 ? 0.55 : 0.36) * (stun ? 0.3 : 1) * (1 - 0.9 * inC) * (0.9 + 0.1 * Math.sin(this.ph * 30));
    this.beam.material.color.setHex(this.lock > 0 ? 0xffd0a0 : 0xfff0c0);
    // light pool where the beam meets the ground
    const tg = dir.y < -0.02 ? Math.min(WATCH.range, (lamp.y - groundAt(lamp.x, lamp.z, 0)) / -dir.y) : WATCH.range;
    const gx = lamp.x + dir.x * tg, gz = lamp.z + dir.z * tg;
    this.pool.position.set(gx, groundAt(gx, gz, lamp.y) + 0.15, gz); this.pool.scale.setScalar(Math.max(2, tg * Math.tan(WATCH.half) * 1.2)); this.pool.visible = tg < WATCH.range;
    this.pool.material.opacity = (this.lock > 0 ? 0.45 : 0.28) * (stun ? 0.3 : 1);
    // detection
    if (!stun && p.alive) {
      _c.set(pc.x - lamp.x, pc.y - lamp.y, pc.z - lamp.z); const L = _c.length();
      if (L < WATCH.range && _c.dot(dir) / L > Math.cos(WATCH.half) && clearLine(lamp, pc)) {
        if (!(G.spotT > 0)) { G.barrageT = Math.max(G.barrageT || 0, WATCH.first); G.spots = (G.spots || 0) + 1; sfx('alarm', 0); G.onSpot && G.onSpot(this); }
        G.spotT = WATCH.spot; this.lock = WATCH.spot;
        for (const e of G.enemies) if (e.kind === 'watch' && e.alive && e !== this && e.c.distanceTo(pc) < WATCH.range + 10) e.lock = Math.max(e.lock, 1.2);   // the others swing over
      }
    }
  }
}
export function clearBarrage() { G.barrage.length = 0; G.spotT = 0; G.barrageT = 0; G.chaffT = 0; G.spots = G.spotTime = G.shellsFired = G.shellHits = G.chaffN = G.chaffBroke = G.chaffDiverted = 0; }
function updateBarrage(dt) {
  const p = G.player;
  if (G.chaffT > 0) G.chaffT -= dt;
  for (let i = G.barrage.length - 1; i >= 0; i--) {
    const b = G.barrage[i]; b.t -= dt;
    if (b.t < 0.5 && !b.fell) { b.fell = true; G.fx.streak(new V3(b.p.x + 6, b.p.y + 60, b.p.z - 4), b.p.clone(), 0.5, 0xffa070, 0.5); }
    if (b.t <= 0) {   // the blast throws up a 12 m column: hovering low over the ring does not save you
      G.barrage.splice(i, 1); G.shellsFired = (G.shellsFired || 0) + 1;
      G.fx.explosion(b.p, 1.1, 0xffa050); G.fx.decal(b.p, WATCH.R * 0.9); sfx('boom', p ? p.pos.distanceTo(b.p) : 50);
      G.fx.emit('add', { x: b.p.x, y: b.p.y + 5, z: b.p.z, vy: 6, life: 0.35, s0: 7, s1: 3, c0: 0xffb060 });
      if (p && p.alive) { const h = Math.hypot(p.pos.x - b.p.x, p.pos.z - b.p.z), hy = p.pos.y - b.p.y; if (h < WATCH.R + 1 && hy < 12) { hurtPlayer(WATCH.dmg * (1 - 0.5 * Math.min(1, h / (WATCH.R + 1))), 'watch-shell'); G.shellHits = (G.shellHits || 0) + 1; } }
    }
  }
  if (G.spotT > 0) {
    G.spotT -= dt; G.spotTime = (G.spotTime || 0) + dt;
    G.barrageT -= dt;
    if (G.barrageT <= 0 && p.alive) {
      G.barrageT = WATCH.every; G.volley = { autoD: Math.random() < 0.5 };   // the autopilot's reaction roll is per volley, not per shell
      for (let k = 0; k < WATCH.shells; k++) {
        const lead = (WATCH.warn + k * 0.25) * (0.15 + k * 0.24), a = Math.random() * 6.28, r = 1 + Math.random() * 2.5;   // shells walk from where you are to where you will be when they land   // walk the shells along the line you are moving on
        const x = p.pos.x + p.vel.x * lead + Math.cos(a) * r, z = p.pos.z + p.vel.z * lead + Math.sin(a) * r;
        const pt = new V3(x, groundAt(x, z, p.pos.y + 3) + 0.2, z);
        G.barrage.push({ p: pt, t: WATCH.warn + k * 0.25, vol: G.volley }); G.fx.warn(pt.clone(), WATCH.R, WATCH.warn + k * 0.25);
      }
      sfx('artillery', 0);
    }
  }
}

// CF-3 chaff: a burst of flares. Enemy missiles within 80 m chase the flares instead, and for 4 s searchlights cannot see
// you (a lit beam loses you at once).
function popChaff(owner, slot, d) {
  const mp = owner.muzzlePos(slot, new V3(), 0).clone();
  const flares = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * 6.283 + Math.random() * 0.4, v = new V3(Math.cos(a) * 9, 10 + Math.random() * 6, Math.sin(a) * 9);
    const f = mp.clone().addScaledVector(v, 0.6); flares.push(f);
    G.fx.sparks(mp, v.clone().normalize(), 4, 0xffc070, 16, 1.2, 0.5, 0.25);
    G.fx.emit('add', { x: f.x, y: f.y, z: f.z, vx: v.x * 0.6, vy: v.y * 0.4, vz: v.z * 0.6, life: 1.8, s0: 1.6, s1: 0.4, c0: 0xffd090 });
  }
  let n = 0;
  for (const s of G.shots) if (s.team === 'E' && s.kind === 'missile' && Math.hypot(s.x - mp.x, s.y - mp.y, s.z - mp.z) < d.R) { s.target = null; s.aim = flares[n % flares.length].clone().add(new V3(0, 6, 0)); n++; }
  G.chaffDiverted = (G.chaffDiverted || 0) + n; G.chaffN = (G.chaffN || 0) + 1;
  if (G.spotT > 0) G.chaffBroke = (G.chaffBroke || 0) + 1;
  G.chaffT = d.dur; G.spotT = 0; for (const e of G.enemies) if (e.kind === 'watch') e.lock = 0;
  sfx('decoy', 0);
}

// ---- frozen lake: slick ice (PHYS.grip), ice holes that crack open under you, frost sleds whose orbs chill you.
export const ICE = { every: [4, 6.5], warn: 1.5, open: 11, R: 6.5, max: 5, dps: 26, edps: 16 };
export const FROST = { hp: 720, range: 40, cd: [2.2, 2.9], burst: 4, gap: 0.2, speed: 62, dmg: 9, chill: 0.22, freeze: 1.1, decay: 0.16 };
G.holes = []; G.icewalls = []; G.pChill = 0; G.frozenT = 0;
const crackTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  for (let k = 0; k < 9; k++) { let x = 64, y = 64, a = k / 9 * 6.283 + Math.random() * 0.5; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 7; j++) { a += (Math.random() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); g.lineWidth = 2.6 - j * 0.3; }
    g.stroke(); }
  g.lineWidth = 1.5; g.beginPath(); g.arc(64, 64, 30 + Math.random() * 8, 0, 6.283); g.stroke();
  return new THREE.CanvasTexture(c); })();
const holeGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), rimGeo = new THREE.RingGeometry(0.9, 1.12, 32).rotateX(-Math.PI / 2);
const holeMat = new THREE.MeshStandardMaterial({ color: 0x0a2534, roughness: 0.04, metalness: 0.4, emissive: 0x041824, transparent: true, opacity: 0.96 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.4, transparent: true });
export function startIce() { G.iceOn = true; G.iceT = 6; }
export function clearIce() {
  for (const h of G.holes) for (const m of h.meshes) m.parent && m.parent.remove(m);
  for (const w of G.icewalls) shatterWall(w, true);
  G.holes.length = 0; G.icewalls.length = 0; G.iceOn = false; if (G.iceShell) G.iceShell.visible = false; G.pChill = 0; G.frozenT = 0; G.freezeN = 0; G.holeN = 0; G.holeTime = 0; G.wallBlocked = 0; G.wallN = 0; G.frostFired = 0; G.frostHits = 0;
  if (G.player) G.player.slowMul = 1;
}
export function addPChill(v) {
  if (G.frozenT > 0 || !G.player || !G.player.alive) return;
  G.pChill = Math.min(1, G.pChill + v); G.pChillT = 1.4; G.frostHits = (G.frostHits || 0) + 1;
  if (G.pChill >= 1) { G.frozenT = FROST.freeze; G.pChill = 0.35; G.freezeN = (G.freezeN || 0) + 1; sfx('freeze', 0); G.fx.ring(G.player.center(new V3()), null, 1, 5, 0.4, 0xc8f2ff); G.onFrozen && G.onFrozen(); }
}
function openHole() {
  const p = G.player; if (!p) return;
  for (let tries = 0; tries < 8; tries++) {
    const lead = 0.6 + Math.random() * 0.8, a = Math.random() * 6.283, r = tries < 4 ? Math.random() * 6 : 6 + Math.random() * 14;
    const x = p.pos.x + p.vel.x * lead + Math.cos(a) * r, z = p.pos.z + p.vel.z * lead + Math.sin(a) * r;
    if (Math.abs(x) > ARENA - 10 || Math.abs(z) > ARENA - 10) continue;
    if (pointInSolid(_a.set(x, 1, z), ICE.R * 0.7)) continue;
    if (G.holes.some((h) => Math.hypot(h.x - x, h.z - z) < h.R + ICE.R + 2)) continue;
    const y = groundAt(x, z, 1) + 0.05, R = ICE.R * (0.85 + Math.random() * 0.3);
    const crack = new THREE.Mesh(holeGeo, new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false, color: 0xf4fbff }));
    crack.position.set(x, y + 0.03, z); crack.scale.setScalar(R * 1.25); crack.rotation.y = Math.random() * 6.28; G.scene.add(crack);
    G.holes.push({ x, z, y, R, st: 'crack', t: ICE.warn, meshes: [crack], crack });
    G.fx.warn(new V3(x, y, z), R, ICE.warn); sfx('snap', Math.hypot(x - p.pos.x, z - p.pos.z)); G.holeN = (G.holeN || 0) + 1;
    return;
  }
}
function updateIce(dt) {
  const p = G.player;
  if (G.pChillT > 0) G.pChillT -= dt; else G.pChill = Math.max(0, G.pChill - FROST.decay * dt);
  let slow = 1 - 0.5 * G.pChill;
  if (!G.iceShell) { const g = new THREE.IcosahedronGeometry(1, 1); const pa = g.attributes.position; for (let q = 0; q < pa.count; q++) { const k = 0.85 + Math.random() * 0.3; pa.setXYZ(q, pa.getX(q) * k, pa.getY(q) * k * 1.6, pa.getZ(q) * k); } g.computeVertexNormals();
    G.iceShell = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xcdeeff, roughness: 0.1, metalness: 0.1, emissive: 0x3a8ab0, emissiveIntensity: 0.4, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false })); G.iceShell.visible = false; G.scene.add(G.iceShell); }
  G.iceShell.visible = G.frozenT > 0 && !!p;
  if (G.iceShell.visible) { const c = p.center(_b); G.iceShell.position.copy(c); G.iceShell.scale.setScalar(2.6); }
  if (G.frozenT > 0) {
    G.frozenT -= dt; slow = 0;
    if (p && Math.random() < 0.4) { const c = p.center(_a); G.fx.emit('add', { x: c.x + (Math.random() - 0.5) * 3, y: c.y + (Math.random() - 0.5) * 4, z: c.z + (Math.random() - 0.5) * 3, life: 0.35, s0: 0.5, s1: 0.1, c0: 0xd8f6ff }); }
    if (G.frozenT <= 0 && p) { G.fx.sparks(p.center(_a).clone(), null, 18, 0xe0f6ff, 14, 1.2, 0.4, 0.25); sfx('snap', 0); }
  }
  // holes
  if (G.iceOn && p && p.alive) {
    G.iceT -= dt;
    if (G.iceT <= 0) { G.iceT = ICE.every[0] + Math.random() * (ICE.every[1] - ICE.every[0]); if (G.holes.filter((h) => h.st === 'open').length < ICE.max) openHole(); }
  }
  let inHole = false;
  for (let i = G.holes.length - 1; i >= 0; i--) {
    const h = G.holes[i]; h.t -= dt;
    if (h.st === 'crack') {
      h.crack.material.opacity = Math.min(0.9, (1 - h.t / ICE.warn) * 1.1);
      if (h.t <= 0) {
        h.st = 'open'; h.t = ICE.open; h.crack.material.opacity = 0.35;
        const w = new THREE.Mesh(holeGeo, holeMat.clone()); w.position.set(h.x, h.y + 0.02, h.z); w.scale.setScalar(h.R); G.scene.add(w);
        const rim = new THREE.Mesh(rimGeo, rimMat.clone()); rim.position.set(h.x, h.y + 0.05, h.z); rim.scale.setScalar(h.R); G.scene.add(rim);
        h.meshes.push(w, rim); h.water = w; h.rim = rim;
        for (let k = 0; k < 14; k++) { const a = Math.random() * 6.283, r = h.R * Math.sqrt(Math.random()); G.fx.emit('add', { x: h.x + Math.cos(a) * r, y: h.y + 0.5, z: h.z + Math.sin(a) * r, vy: 4 + Math.random() * 4, life: 0.6, s0: 1.2, s1: 0.3, c0: 0xe8f8ff }); }
        G.fx.sparks(new V3(h.x, h.y + 0.5, h.z), new V3(0, 1, 0), 16, 0xe8f8ff, 12, 1, 0.5, 0.3);
        sfx('boom', p ? Math.hypot(h.x - p.pos.x, h.z - p.pos.z) + 20 : 50);
      }
    } else {
      if (h.t < 1.5) { const k = Math.max(0, h.t / 1.5); h.water.material.opacity = 0.96 * k; h.rim.material.opacity = k; h.crack.material.opacity = 0.35 * k; }
      if (h.t <= 0) { for (const m of h.meshes) m.parent && m.parent.remove(m); G.holes.splice(i, 1); continue; }
      const live = h.t > 0.6;
      if (live && p && p.alive) {
        const d = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
        if (d < h.R - 0.6 && p.pos.y - h.y < 0.9) {
          inHole = true; hurtPlayer(ICE.dps * dt, 'icehole'); G.holeTime = (G.holeTime || 0) + dt;
          if (Math.random() < 0.3) G.fx.emit('add', { x: p.pos.x + (Math.random() - 0.5) * 3, y: h.y + 0.4, z: p.pos.z + (Math.random() - 0.5) * 3, vy: 3, life: 0.4, s0: 1, s1: 0.2, c0: 0xcfeeff });
          G.onHole && G.onHole();
        }
      }
      if (live) for (const e of G.enemies) {
        if (!e.alive || e.dying || e.kind === 'watch' || e.kind === 'frost' || e.maxHp > 3000) continue;
        if (Math.hypot(e.pos.x - h.x, e.pos.z - h.z) < h.R - 0.6 && e.pos.y - h.y < 0.9) { G.curLabel = 'p-icehole'; e.hit(ICE.edps * dt); if (e.hp <= 0 && !e.dying) e.die(); }
      }
    }
  }
  if (inHole) slow *= 0.45;
  if (p) p.slowMul = slow;
}

export class Frostcaster extends Enemy {
  constructor(pos) {
    super('frost', 'E_Frost', pos, FROST.hp, 2.2); this.boom = 1.2; this.obj.scale.setScalar(1.25);
    this.vel = new V3(); this.orbit = Math.random() < 0.5 ? 1 : -1; this.ph = Math.random() * 6; this.burst = 0; this.bT = 0; this.fireT = 1.5 + Math.random() * 2; this.flipT = 4 + Math.random() * 4;
    this.pos.y = groundAt(pos.x, pos.z, 50) + 1.1; this.c.set(this.pos.x, this.pos.y + 1.4, this.pos.z); this.head = 0;
  }
  update(dt) {
    this.ph += dt; this.flipT -= dt; if (this.flipT <= 0) { this.flipT = 5 + Math.random() * 5; this.orbit *= -1; }
    const p = this.tg(), pc = p.center(playerC);
    const dx = this.pos.x - pc.x, dz = this.pos.z - pc.z, dist = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dz, dx) + this.orbit * dt * 0.35, rr = dist + (FROST.range - dist) * Math.min(1, dt * 0.8);
    const tx = pc.x + Math.cos(ang) * rr, tz = pc.z + Math.sin(ang) * rr;
    _a.set(tx - this.pos.x, 0, tz - this.pos.z); const L = _a.length(); if (L > 0) _a.multiplyScalar(Math.min(11, L * 1.5) / L);
    this.vel.lerp(_a, 1 - Math.exp(-1.2 * dt));   // a sled: it carves wide arcs
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (pointInSolid(_b.set(nx, this.pos.y + 1, nz), 2.2)) { this.vel.multiplyScalar(-0.5); this.orbit *= -1; }
    else { this.pos.x = nx; this.pos.z = nz; }
    this.pos.x = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.x)); this.pos.z = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.z));
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 3) + 1.1 + Math.sin(this.ph * 2.2) * 0.12;
    this.c.set(this.pos.x, this.pos.y + 1.4, this.pos.z);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.8) this.head += angDiff(Math.atan2(-this.vel.x, -this.vel.z), this.head) * Math.min(1, dt * 3);
    this.obj.rotation.y = this.head; this.obj.rotation.z = -this.orbit * Math.min(0.18, sp * 0.015);
    const aimYaw = Math.atan2(-(pc.x - this.pos.x), -(pc.z - this.pos.z));
    const tur = this.n.FR_Turret; if (tur) tur.rotation.y += angDiff(aimYaw - this.head, tur.rotation.y) * Math.min(1, dt * 4);
    if (Math.random() < 0.25) G.fx.emit('add', { x: this.pos.x + (Math.random() - 0.5) * 2, y: this.pos.y - 0.9, z: this.pos.z + (Math.random() - 0.5) * 2, vy: 0.4, life: 0.5, s0: 0.9, s1: 0.2, c0: 0xbfe8ff });
    if (this.burst > 0) {
      this.bT -= dt;
      if (this.bT <= 0) { this.bT = FROST.gap; this.burst--; this.shoot(); }
    } else if (dist < 90 && this.checkLos(dt)) {
      this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT = FROST.cd[0] + Math.random() * (FROST.cd[1] - FROST.cd[0]); this.burst = FROST.burst; this.bT = 0.35; sfx('charge', this.pos.distanceTo(G.player.pos)); }
    }
  }
  shoot() {
    const m = this.n.Muzzle_FR; if (!m) return;
    const mp = m.getWorldPosition(_a).clone(), aim = lead(mp, FROST.speed, _b, this.tg());
    _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.04; _d.y += (Math.random() - 0.5) * 0.03; _d.z += (Math.random() - 0.5) * 0.04;
    G.curLabel = 'frost-orb'; G.curShooter = this;
    const s = spawnShot({ p: mp, v: _d.normalize().multiplyScalar(FROST.speed), dmg: FROST.dmg, team: 'E', kind: 'ebullet', color: 0xa8e8ff, w: 0.8, len: 2.4, life: 2.6, label: 'frost-orb' });
    s.frostP = FROST.chill; G.curShooter = null; G.frostFired = (G.frostFired || 0) + 1;
    G.fx.muzzle(mp, _d, 0xa8e8ff, 1.2); sfx('eshot', this.pos.distanceTo(G.player.pos));
  }
}

// IW-1 ice wall: five ice pillars in a row 9 m ahead, square to your aim. They stop enemy shots and block enemy sight
// (your own fire passes through: player-side rays skip `icewall` solids), share 700 HP and melt after 10 s.
const iceBlockMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.12, metalness: 0.1, emissive: 0x2a6a90, emissiveIntensity: 0.35, transparent: true, opacity: 0.8, flatShading: true });
function raiseIceWall(owner, d) {
  const yaw = owner.aimYaw, fx_ = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const cx = owner.pos.x + fx_ * 9, cz = owner.pos.z + fz * 9;
  const w = { hp: d.hp, maxHp: d.hp, t: d.dur, blocks: [], grow: 0 };
  for (let k = -2; k <= 2; k++) {
    const x = cx + rx * k * 2.3, z = cz + rz * k * 2.3;
    if (Math.abs(x) > ARENA - 2 || Math.abs(z) > ARENA - 2 || pointInSolid(_a.set(x, 1, z), 0.5)) continue;
    const y = groundAt(x, z, owner.pos.y + 2), h = 5.6 + Math.random() * 1.2;
    const geo = new THREE.CylinderGeometry(0.95, 1.3, h, 6, 3); const pa = geo.attributes.position;   // a rough hexagonal ice column
    for (let q = 0; q < pa.count; q++) { const yy = pa.getY(q); if (Math.abs(yy) < h / 2 - 0.01) { pa.setX(q, pa.getX(q) * (0.85 + Math.random() * 0.3)); pa.setZ(q, pa.getZ(q) * (0.85 + Math.random() * 0.3)); } }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, iceBlockMat.clone());
    m.position.set(x, y + h / 2, z); m.rotation.set((Math.random() - 0.5) * 0.08, yaw + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.08);
    m.castShadow = true; m.scale.y = 0.05; G.scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 5), m.material); cap.position.set(0, h / 2 + 0.5, (Math.random() - 0.5) * 0.4); cap.rotation.y = Math.random(); m.add(cap);
    const sol = addSolid(x, z, 2.4, 2.4, h, y, 'icewall', w);
    w.blocks.push({ m, sol, h, y });
    G.fx.emit('add', { x, y: y + 0.5, z, vy: 5, life: 0.5, s0: 2, s1: 0.4, c0: 0xd8f6ff });
  }
  if (!w.blocks.length) return false;
  G.icewalls.push(w); G.wallN = (G.wallN || 0) + 1; sfx('freeze', 0);
  return true;
}
function shatterWall(w, quiet) {
  for (const b of w.blocks) {
    b.m.parent && b.m.parent.remove(b.m); removeSolid(b.sol);
    if (!quiet) { G.fx.sparks(new V3(b.m.position.x, b.y + b.h * 0.5, b.m.position.z), null, 10, 0xd8f6ff, 14, 1.2, 0.5, 0.3); G.fx.emit('add', { x: b.m.position.x, y: b.y + b.h * 0.4, z: b.m.position.z, vy: 1, life: 0.6, s0: 3, s1: 1, c0: 0xc8eeff }); }
  }
  w.blocks.length = 0; w.dead = true;
  if (!quiet) sfx('snap', G.player ? 10 : 0);
}
function hitIceWall(w, dmg, at) {
  if (w.dead) return; w.hp -= dmg; G.wallBlocked = (G.wallBlocked || 0) + dmg;
  if (at && Math.random() < 0.5) G.fx.sparks(at, null, 3, 0xd8f6ff, 8, 0.6, 0.25, 0.2);
  if (w.hp <= 0) { shatterWall(w); const i = G.icewalls.indexOf(w); if (i >= 0) G.icewalls.splice(i, 1); }
}
function updateIceWalls(dt) {
  for (let i = G.icewalls.length - 1; i >= 0; i--) {
    const w = G.icewalls[i]; w.t -= dt; w.grow = Math.min(1, w.grow + dt * 4);
    const k = w.hp / w.maxHp;
    for (const b of w.blocks) { b.m.scale.y = 0.05 + 0.95 * (1 - (1 - w.grow) ** 3); b.m.position.y = b.y + b.h * b.m.scale.y / 2; b.m.material.opacity = 0.5 + 0.3 * k; b.m.material.emissiveIntensity = 0.2 + 0.25 * k; }
    if (w.t < 1) for (const b of w.blocks) b.m.material.opacity *= Math.max(0.1, w.t);
    if (w.t <= 0) { shatterWall(w); G.icewalls.splice(i, 1); }
  }
}

// ---- gale ridge: a strong wind that swings round every 14-20 s (3 s warning). It is added to every mech's target
// velocity (PHYS.wx/wz, x0.22 on the ground, x0.62 in the air) and bends projectiles (x0.25 for bullets, x0.9 for the rest).
export const WIND = { on: false, x: 0, z: 0, a: 0, str: 0, ta: 0, tstr: 0, t: 0, next: 0, nstr: 0, warned: false };
export function startWind() { WIND.on = true; WIND.a = WIND.ta = Math.random() * 6.283; WIND.str = WIND.tstr = 9; WIND.t = 16; WIND.next = 0; WIND.warned = false; G.windShifts = 0; }
export function clearWind() { WIND.on = false; WIND.x = WIND.z = 0; PHYS.wx = PHYS.wz = 0; }
function updateWind(dt) {
  if (!WIND.on) return;
  WIND.t -= dt;
  if (WIND.t < 3 && !WIND.warned) { WIND.warned = true; WIND.next = WIND.ta + (Math.random() < 0.5 ? 1 : -1) * (1.0 + Math.random() * 1.6); WIND.nstr = 8 + Math.random() * 4; G.onWindShift && G.onWindShift(WIND.next); }
  if (WIND.t <= 0) { WIND.t = 14 + Math.random() * 6; WIND.warned = false; WIND.ta = WIND.next; WIND.tstr = WIND.nstr; G.windShifts = (G.windShifts || 0) + 1; sfx('rumble', 0); }
  WIND.a += angDiff(WIND.ta, WIND.a) * Math.min(1, dt * 1.2); WIND.str += (WIND.tstr - WIND.str) * Math.min(1, dt * 0.8);
  const gust = WIND.str * (1 + 0.22 * Math.sin(G.time * 1.3) + 0.12 * Math.sin(G.time * 3.7));
  WIND.x = Math.cos(WIND.a) * gust; WIND.z = Math.sin(WIND.a) * gust; PHYS.wx = WIND.x; PHYS.wz = WIND.z;
  const cp = G.camera.position;   // blown dust round the camera
  for (let k = 0; k < 2; k++) {
    const x = cp.x + (Math.random() - 0.5) * 70 - WIND.x * 2, z = cp.z + (Math.random() - 0.5) * 70 - WIND.z * 2;
    G.fx.emit('smoke', { x, y: 0.5 + Math.random() * 6, z, vx: WIND.x * 1.8, vy: 0.2, vz: WIND.z * 1.8, life: 1.6, s0: 1.2, s1: 3.2, c0: 0xb8ae98, c1: 0x9a927e, a0: 0.22, drag: 0.1 });
  }
}

// Airship: a slow armoured blimp 30 m up. It holds a point upwind of its target so the gale carries it over, drops a stick of
// six bombs when it passes overhead (red rings where each will land), and its gondola guns fire two-round bursts.
export const BLIMP = { hp: 2600, alt: 30, speed: 8, bombs: 8, gap: 0.42, cd: [6, 8], dmg: 42, R: 6, gunCd: [2.4, 3.2], gunDmg: 5 };
export class Airship extends Enemy {
  constructor(pos) {
    super('blimp', 'E_Blimp', pos, BLIMP.hp, 6.5); this.boom = 3.2; this.obj.scale.setScalar(1.15);
    this.vel = new V3(); this.head = Math.random() * 6.28; this.bombT = 4 + Math.random() * 3; this.stick = 0; this.sT = 0; this.gunT = 2;
    this.pos.y = groundAt(pos.x, pos.z, 99) + BLIMP.alt; this.c.copy(this.pos); this.ph = Math.random() * 6;
  }
  update(dt) {
    this.ph += dt;
    const p = this.tg(), pc = p.center(playerC);
    const wl = Math.hypot(WIND.x, WIND.z) || 1, ux = WIND.on ? WIND.x / wl : 0, uz = WIND.on ? WIND.z / wl : 0;
    const ax = pc.x - ux * 18, az = pc.z - uz * 18;   // hold upwind of the target: the drift brings it over
    _a.set(ax - this.pos.x, 0, az - this.pos.z); const L = _a.length(); if (L > 0) _a.multiplyScalar(Math.min(BLIMP.speed, L * 0.4) / L);
    this.vel.lerp(_a, 1 - Math.exp(-0.6 * dt));
    this.pos.x += (this.vel.x + WIND.x * 0.75) * dt; this.pos.z += (this.vel.z + WIND.z * 0.75) * dt;
    this.pos.x = Math.max(-ARENA + 8, Math.min(ARENA - 8, this.pos.x)); this.pos.z = Math.max(-ARENA + 8, Math.min(ARENA - 8, this.pos.z));
    let ty = groundAt(this.pos.x, this.pos.z, 99) + BLIMP.alt + Math.sin(this.ph * 0.5) * 1.2;
    const s = pointInSolid(_b.set(this.pos.x, ty - 6, this.pos.z), 6); if (s) ty = Math.max(ty, s.max.y + 12);
    this.pos.y += (ty - this.pos.y) * Math.min(1, dt * 0.8); this.c.copy(this.pos);
    const mvx = this.vel.x + WIND.x * 0.75, mvz = this.vel.z + WIND.z * 0.75;
    if (Math.hypot(mvx, mvz) > 0.5) this.head += angDiff(Math.atan2(-this.vel.x - 0.001, -this.vel.z), this.head) * Math.min(1, dt * 0.5);
    this.obj.rotation.y = this.head; this.obj.rotation.z = Math.sin(this.ph * 0.7) * 0.03;
    for (const k of ['AS_Prop1', 'AS_Prop2']) if (this.n[k]) this.n[k].rotation.z += dt * 18;
    // bombing run
    const hd = Math.hypot(pc.x - this.pos.x, pc.z - this.pos.z);
    this.bombT -= dt;
    if (this.stick > 0) {
      this.sT -= dt;
      if (this.sT <= 0) { this.sT = BLIMP.gap; this.stick--; this.drop(); }
    } else if (this.bombT <= 0 && hd < 30) { this.stick = BLIMP.bombs; this.sT = 0; this.bombT = BLIMP.cd[0] + Math.random() * (BLIMP.cd[1] - BLIMP.cd[0]); sfx('warn', hd); G.onBombRun && G.onBombRun(this); }
    // gondola guns
    if (this.c.distanceTo(pc) < 95 && this.checkLos(dt)) {
      this.gunT -= dt;
      if (this.gunT <= 0) {
        this.gunT = BLIMP.gunCd[0] + Math.random() * (BLIMP.gunCd[1] - BLIMP.gunCd[0]); G.curLabel = 'blimp-gun'; G.curShooter = this;
        for (const k of [1, 2]) { const m = this.n['Muzzle_AS' + k]; if (!m) continue; const mp = m.getWorldPosition(_a).clone(), aim = lead(mp, 140, _b, p);
          _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.z += (Math.random() - 0.5) * 0.05;
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(140), dmg: BLIMP.gunDmg, team: 'E', kind: 'ebullet', color: 0xffa060, w: 0.24, len: 4, life: 1.2, label: 'blimp-gun' }); }
        G.curShooter = null; sfx('eshot', this.pos.distanceTo(G.player.pos));
      }
    }
  }
  drop() {
    const fx_ = -Math.sin(this.head), fz = -Math.cos(this.head);
    const bp = new V3(this.pos.x - fx_ * 0.7, this.pos.y - 4.6, this.pos.z - fz * 0.7);
    const vy = -4, g = 20, h = bp.y - groundAt(bp.x, bp.z, bp.y), t = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
    // aimed stick: each bomb is tossed toward where the target will be, the stick walking along the target's path
    const tp = this.tg(), tv = tp.vel || _c.set(0, 0, 0), k = BLIMP.bombs - 1 - this.stick, off = (k - (BLIMP.bombs - 1) / 2) * 2.2;
    const tl = Math.hypot(tv.x, tv.z) || 1, ox = Math.abs(tl) > 1 ? tv.x / tl : fx_, oz = Math.abs(tl) > 1 ? tv.z / tl : fz;
    const gx = tp.pos.x + tv.x * t + ox * off, gz = tp.pos.z + tv.z * t + oz * off;
    let vx = (gx - bp.x - 0.45 * WIND.x * t * t) / t, vz = (gz - bp.z - 0.45 * WIND.z * t * t) / t;
    const hv = Math.hypot(vx, vz); if (hv > 16) { vx *= 16 / hv; vz *= 16 / hv; }
    const lx = bp.x + vx * t + 0.45 * WIND.x * t * t, lz = bp.z + vz * t + 0.45 * WIND.z * t * t;
    G.fx.warn(new V3(lx, groundAt(lx, lz, 1), lz), BLIMP.R, t);
    G.curLabel = 'blimp-bomb';
    spawnShot({ p: bp, v: new V3(vx, vy, vz), dmg: BLIMP.dmg, team: 'E', kind: 'grenade', grav: g, splash: BLIMP.R, flak: 4.5, life: 8, color: 0x505048, label: 'blimp-bomb' });
    G.bombsDropped = (G.bombsDropped || 0) + 1;
  }
}

// RP-12 rocket pod: a salvo of 12 unguided rockets in a flat fan toward the aim point. They drop a little and the wind bends them.
function fireRockets(owner, slot, d, aim, dmgMul, team) {
  for (let i = 0; i < d.n; i++) G.queue.push({ label: G.curLabel, t: i * d.gap, fn: () => {
    if (!owner.alive) return;
    const mp = owner.muzzlePos(slot, new V3(), 0).clone();
    _d.subVectors(aim, mp).normalize();
    const yaw = Math.atan2(_d.x, _d.z) + ((i / (d.n - 1)) - 0.5) * d.spread * 2 + (Math.random() - 0.5) * 0.03, pit = Math.asin(Math.max(-1, Math.min(1, _d.y))) + 0.02 + (Math.random() - 0.5) * 0.03;
    const v = new V3(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)).multiplyScalar(d.speed);
    spawnShot({ p: mp, v, dmg: d.dmg * dmgMul, team, kind: 'missile', splash: d.splash, target: null, aim: null, life: 2.4, maxSpeed: d.speed, turn: 0 });
    G.fx.muzzle(mp, v.clone().normalize(), 0xffc070, 0.7); owner.slots.S.recoil = 0.3;
    if (i % 3 === 0) sfx('missile', owner === G.player ? 0 : 40);
  } });
}

// ---- SB-5 sticky charges ---------------------------------------------------------------------------------
const STICK = { fuse: 1.2, stack: 0.25 };
const stickGeo = new THREE.SphereGeometry(0.45, 10, 8);
export function clearStickies() { for (const k of (G.stickies || [])) k.mesh.parent && k.mesh.parent.remove(k.mesh); G.stickies = []; }
function stickAt(s, at, ent) {
  G.stickies = G.stickies || [];
  const host = ent && !ent.isBarrel && !ent.isMine && !ent.isPlayer && ent.alive ? ent : null;
  const mesh = new THREE.Mesh(stickGeo, new THREE.MeshBasicMaterial({ color: 0xff4030 })); mesh.position.copy(at); G.scene.add(mesh);
  const off = host ? at.clone().sub(host.c) : null;
  G.stickies.push({ mesh, host, off, t: STICK.fuse, dmg: s.dmg, splash: s.splash, label: s.label, team: s.team });
  G.fx.sparks(at, null, 4, 0xff7050, 6, 0.6, 0.2, 0.15); sfx('minebeep', G.player ? G.player.pos.distanceTo(at) : 0);
  G.stuckN = (G.stuckN || 0) + (host ? 1 : 0);
}
function updateStickies(dt) {
  const L = G.stickies; if (!L || !L.length) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const k = L[i]; k.t -= dt;
    if (k.host && k.host.alive && !k.host.gone) k.mesh.position.copy(k.host.c).add(k.off); else k.host = null;
    const blink = k.t < 0.4 ? 30 : 9; k.mesh.visible = Math.sin(k.t * blink) > -0.3; k.mesh.scale.setScalar(1 + (1.2 - k.t) * 0.3);
    if (k.t > 0) continue;
    // every other charge stuck to the same host when this one blows adds 25 %
    let n = 0; if (k.host) for (const o of L) if (o !== k && o.host === k.host) n++;
    const mul = 1 + STICK.stack * n;
    G.curLabel = k.label;
    if (k.host) dealDamage(k.host, k.dmg * 0.5 * mul, k.team, k.mesh.position);
    explodeAt(k.mesh.position.clone(), k.splash, k.dmg * 0.5 * mul, k.team, 0.75, 0xff6040);
    k.mesh.parent && k.mesh.parent.remove(k.mesh); L.splice(i, 1);
  }
}

// ---- Mirage projector: a hover disc with two mirror images and swarms of holographic drones -------------------
export const MIRAGE = { hp: 950, alt: 15, img: 2, imgR: 9, imgRe: 3.5, holoEvery: [9, 12], holoN: 3, holoCap: 6, holoLife: 18, cd: [2.2, 3.0], burst: 3, gap: 0.16, dmg: 11, speed: 120 };
function glitchOut(e) {
  if (e.gone) return;
  e.alive = false; e.dying = true;
  G.fx.sparks(e.c, null, 12, 0xc8a0ff, 12, 0.8, 0.35, 0.2); G.fx.emit('add', { x: e.c.x, y: e.c.y, z: e.c.z, life: 0.25, s0: 3.5, s1: 0.5, c0: 0xb080ff });
  sfx('prism', G.player ? G.player.pos.distanceTo(e.pos) : 0);
  G.holoPopped = (G.holoPopped || 0) + 1; e.remove();
}
export class HoloDrone extends Drone {
  constructor(pos, owner) { super(pos); this.kind = 'holo'; this.holo = true; this.maxHp = this.hp = 1; this.owner = owner; this.life = MIRAGE.holoLife + Math.random() * 3; this.flk = 0; }
  die() { glitchOut(this); }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0 || !this.owner.alive || this.markT > 0) { glitchOut(this); return; }
    super.update(dt);
    if (this.flk > 0) { this.flk -= dt; this.obj.visible = this.flk < 0.03; } else if (Math.random() < dt * 0.25) this.flk = 0.08;
  }
}
class MirageImage extends Enemy {
  constructor(owner, k) { super('mimage', 'E_Mirage', owner.pos, 1, 2.6); this.maxHp = this.hp = 1; this.owner = owner; this.k = k; this.holo = true; this.c.copy(owner.pos); }
  die() { glitchOut(this); this.owner.reimg.push({ k: this.k, t: MIRAGE.imgRe }); }
  update(dt) {
    const o = this.owner; if (!o.alive) { glitchOut(this); return; }
    if (this.markT > 0) { this.die(); return; }
    const tp = o.tg().pos, a = Math.atan2(o.pos.z - tp.z, o.pos.x - tp.x) + (this.k ? 1 : -1) * Math.PI / 2 + Math.sin(o.ph * 0.6 + this.k * 2) * 0.35;   // side by side as seen by the target
    this.pos.set(o.pos.x + Math.cos(a) * MIRAGE.imgR, o.pos.y + Math.sin(o.ph * 1.7 + this.k) * 0.8, o.pos.z + Math.sin(a) * MIRAGE.imgR);
    this.obj.rotation.copy(o.obj.rotation); if (this.n.MR_Ring && o.n.MR_Ring) this.n.MR_Ring.rotation.z = o.n.MR_Ring.rotation.z;
    this.c.copy(this.pos);
  }
  fake(p) {   // mirrors the real gun's burst with harmless pulses
    const m = this.n.Muzzle_MR; if (!m) return; const mp = m.getWorldPosition(_a).clone(), aim = lead(mp, MIRAGE.speed, _b, p);
    _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.06; _d.z += (Math.random() - 0.5) * 0.06;
    spawnShot({ p: mp, v: _d.normalize().multiplyScalar(MIRAGE.speed), dmg: 0, team: 'E', kind: 'ebullet', color: 0xc890ff, w: 0.34, len: 5, life: 1.2, label: 'holo' });
  }
}
export class Mirage extends Enemy {
  constructor(pos) {
    super('mirage', 'E_Mirage', pos, MIRAGE.hp, 2.6); this.boom = 1.3;
    this.vel = new V3(); this.orbit = Math.random() < 0.5 ? 1 : -1; this.radius = 38 + Math.random() * 20; this.ph = Math.random() * 6;
    this.holoT = 3 + Math.random() * 3; this.fireT = 2 + Math.random() * 2; this.burst = 0; this.bT = 0; this.reimg = []; this.imgs = [];
    this.pos.y = groundAt(pos.x, pos.z, 99) + MIRAGE.alt; this.c.copy(this.pos);
    for (let k = 0; k < MIRAGE.img; k++) this.imgs.push(new MirageImage(this, k));
  }
  update(dt) {
    this.ph += dt;
    const p = this.tg(), pc = p.center(playerC);
    if (this.markT > 0) this.reimg.length = 0;
    // orbit the target at range, drifting
    let ang = Math.atan2(this.pos.z - p.pos.z, this.pos.x - p.pos.x) + this.orbit * dt * 0.3;
    if (G.glare && G.sunDir) { const sa = Math.atan2(G.sunDir.z, G.sunDir.x) + Math.sin(this.ph * 0.25 + this.radius) * 0.3; ang += angDiff(sa, ang) * 0.6; }   // keep the sun at its back
    const tx = p.pos.x + Math.cos(ang) * this.radius, tz = p.pos.z + Math.sin(ang) * this.radius;
    const ty = groundAt(this.pos.x, this.pos.z, 99) + MIRAGE.alt + Math.sin(this.ph * 0.9) * 1.5;
    _a.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z); const L = _a.length(); if (L > 0) _a.multiplyScalar(Math.min(11, L * 0.8) / L);
    this.vel.lerp(_a, 1 - Math.exp(-1.2 * dt)); this.pos.addScaledVector(this.vel, dt);
    const s = pointInSolid(this.pos, 3); if (s) { this.pos.y = s.max.y + 4; this.vel.y = Math.max(this.vel.y, 2); }
    this.pos.x = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.x)); this.pos.z = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.z));
    this.obj.rotation.y = Math.atan2(this.pos.x - pc.x, this.pos.z - pc.z); this.c.copy(this.pos);
    if (this.n.MR_Ring) this.n.MR_Ring.rotation.z += dt * 0.9;
    // images come back after being popped
    for (let i = this.reimg.length - 1; i >= 0; i--) { const r = this.reimg[i]; r.t -= dt; if (r.t <= 0 && !(this.markT > 0)) { this.reimg.splice(i, 1); const im = new MirageImage(this, r.k); this.imgs.push(im); G.fx.sparks(im.c, null, 8, 0xc8a0ff, 8, 0.6, 0.3, 0.2); } }
    // holographic drones
    this.holoT -= dt;
    if (this.holoT <= 0 && !(this.markT > 0)) {
      this.holoT = MIRAGE.holoEvery[0] + Math.random() * (MIRAGE.holoEvery[1] - MIRAGE.holoEvery[0]);
      let n = 0; for (const e of G.enemies) if (e.kind === 'holo' && e.owner === this && e.alive) n++;
      for (let k = 0; k < Math.min(MIRAGE.holoN, MIRAGE.holoCap - n); k++) {
        const a = Math.random() * 6.28, r = 20 + Math.random() * 15;
        const h = new HoloDrone(new V3(p.pos.x + Math.cos(a) * r, p.pos.y + 10 + Math.random() * 6, p.pos.z + Math.sin(a) * r), this);
        G.fx.sparks(h.pos, null, 6, 0xc8a0ff, 8, 0.5, 0.3, 0.2);
      }
      G.holoSpawned = (G.holoSpawned || 0) + 1; G.onHolo && G.onHolo(this);
    }
    // pulse gun: the real one hurts, the images copy it
    if (this.burst > 0) {
      this.bT -= dt;
      if (this.bT <= 0) {
        this.bT = MIRAGE.gap; this.burst--;
        const m = this.n.Muzzle_MR, mp = m.getWorldPosition(_a).clone(), aim = lead(mp, MIRAGE.speed, _b, p);
        _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.04;
        G.curLabel = 'mirage'; spawnShot({ p: mp, v: _d.normalize().multiplyScalar(MIRAGE.speed), dmg: MIRAGE.dmg, team: 'E', kind: 'ebullet', color: 0xc890ff, w: 0.34, len: 5, life: 1.2, label: 'mirage' });
        for (const im of this.imgs) if (im.alive) im.fake(p);
        G.fx.muzzle(mp, _d, 0xc890ff, 1); sfx('eshot', this.pos.distanceTo(G.player.pos));
      }
    } else if (this.c.distanceTo(pc) < 95 && this.checkLos(dt)) {
      this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT = MIRAGE.cd[0] + Math.random() * (MIRAGE.cd[1] - MIRAGE.cd[0]); this.burst = MIRAGE.burst; this.bT = 0; }
    }
    this.imgs = this.imgs.filter((im) => im.alive);
  }
}

// ---- Scrapyard electromagnet cranes ---------------------------------------------------------------------------
export const MAGNET = { idle: [9, 13], charge: 1.6, on: 4.5, R: 38, pullV: 8, drop: 1.25, dropR: 7, dmg: 70, edmg: 140 };
export function clearCranes() { for (const c of (G.cranes || [])) { c.o.parent && c.o.parent.remove(c.o); for (const s of c.sol) removeSolid(s); } G.cranes = []; }
export function startCranes(list) {
  clearCranes();
  G.cranes = list.map(([x, z, a], i) => {
    const o = cloneKit('P_Crane'); o.position.set(x, groundAt(x, z, 0), z); o.rotation.y = a; G.scene.add(o);
    const n = nodes(o), glow = [];
    (n.CR_Mag || o).traverse((m) => { if (m.material && m.material.name === 'MagGlow') { m.material = m.material.clone(); glow.push(m.material); } });
    const sol = [-8, 8].map((s) => addSolid(x + Math.cos(a) * s, z - Math.sin(a) * s, 3.6, 3.6, 19, 0, 'crane'));
    sol.push(addSolid(x, z, 4.6, 4.6, 2.2, 9.8, 'crane'));   // the magnet itself
    return { o, x, z, mag: n.CR_Mag, glow, base: glow.length ? glow[0].emissiveIntensity : 1, st: 'idle', t: 3 + i * 4 + Math.random() * 4, sol, ph: 0 };
  });
}
function setGlow(c, k) { for (const m of c.glow) m.emissiveIntensity = c.base * k; }
function updateCranes(dt) {
  const L = G.cranes; if (!L || !L.length) return;
  const p = G.player;
  for (const c of L) {
    c.t -= dt; c.ph += dt;
    const gy = groundAt(c.x, c.z, 0), mp = _a.set(c.x, gy + 10.4, c.z);
    if (c.st === 'idle') {
      setGlow(c, 0.25);
      if (c.t <= 0) { c.st = 'charge'; c.t = MAGNET.charge; sfx('charge', p ? p.pos.distanceTo(mp) : 0); G.onMagnet && G.onMagnet(c); }
    } else if (c.st === 'charge') {
      setGlow(c, 0.4 + (1 - c.t / MAGNET.charge) * 1.4);
      if (Math.random() < 0.5) G.fx.sparks(mp.clone().add(_b.set((Math.random() - 0.5) * 4, -0.6, (Math.random() - 0.5) * 4)), null, 2, 0x8fd0ff, 6, 0.6, 0.25, 0.15);
      if (c.t <= 0) { c.st = 'on'; c.t = MAGNET.on; c.autoD = Math.random() < 0.6; G.magnetOn = (G.magnetOn || 0) + 1; }
    } else if (c.st === 'on') {
      setGlow(c, 2 + Math.sin(c.ph * 30) * 0.4);
      if (c.mag) c.mag.rotation.z += dt * 0.6;
      const pull = (ent, pos, isP) => {
        const ex = pos.x - c.x, ez = pos.z - c.z, d = Math.hypot(ex, ez) || 0.01, hy = pos.y - gy;
        if (d > MAGNET.R || hy > 24 || d < 1.2) return false;
        const k = 1 - d / MAGNET.R, v = (MAGNET.pullV * k + 1.2) * dt;
        pos.x -= ex / d * v; pos.z -= ez / d * v;
        if (isP && Math.random() < 0.25) G.fx.streak(mp.clone(), ent.center(_c).clone(), 0.12, 0x9fd8ff);
        return true;
      };
      if (p && p.alive && !(G.blinkInv > 0) && pull(p, p.pos, true)) { G.magPull = (G.magPull || 0) + dt; G.fx.trauma = Math.min(1, G.fx.trauma + dt * 0.25); }
      for (const e of G.enemies) if (e instanceof Enemy && e.alive && !e.dying && e.maxHp <= 1500 && e.kind !== 'boss' && e.pos) { if (pull(e, e.pos, false) && e.c) e.c.copy(e.pos); }
      if (c.t <= 0) {   // power cut: the load comes down
        c.st = 'fall'; c.t = MAGNET.drop; setGlow(c, 0.3);
        G.fx.warn(new V3(c.x, gy + 0.05, c.z), MAGNET.dropR, MAGNET.drop); sfx('warn', p ? p.pos.distanceTo(mp) : 0);
      }
    } else if (c.st === 'fall') {
      if (c.t <= 0) {
        const at = new V3(c.x, gy + 0.6, c.z);
        G.curLabel = 'scrap'; explodeAt(at, MAGNET.dropR, MAGNET.dmg, 'E', 1.3, 0xffa060);
        for (const e of G.enemies) if (e.alive && !e.dying && e.c && e.kind !== 'boss' && Math.hypot(e.c.x - c.x, e.c.z - c.z) < MAGNET.dropR && e.c.y - gy < 8) { e.hit(MAGNET.edmg); G.scrapKills = (G.scrapKills || 0) + (e.alive ? 0 : 1); }
        for (let k = 0; k < 14; k++) { const a = Math.random() * 6.28; G.fx.sparks(at.clone(), new V3(Math.cos(a), 0.6 + Math.random(), Math.sin(a)), 1, 0x5a4434, 14, 1.4, 0.3, 0.6); }
        G.fx.emit('smoke', { x: at.x, y: at.y + 1, z: at.z, vy: 1, life: 2.4, s0: 6, s1: 14, c0: 0x6a5a48, c1: 0x4a4038, a0: 0.55, drag: 1.2 });
        G.fx.trauma = Math.min(1, G.fx.trauma + 0.35 * Math.max(0, 1 - (p ? p.pos.distanceTo(at) : 99) / 60)); sfx('bigboom', p ? p.pos.distanceTo(at) : 0);
        c.st = 'idle'; c.t = MAGNET.idle[0] + Math.random() * (MAGNET.idle[1] - MAGNET.idle[0]); G.scrapDrops = (G.scrapDrops || 0) + 1;
      }
    }
  }
}

// ---- Deflector: a hover escort whose magnetic field bends the player's bullets away -----------------------------
export const DEFL = { hp: 650, R: 15, k: 24, load: 55, decay: 9, down: 3.5, alt: 4, cd: [3.2, 4.0], n: 3, dmg: 14, splash: 3.5, speed: 14 };
const fieldGeo = new THREE.SphereGeometry(1, 24, 16);
function deflectShot(s, dt) {
  for (const f of G.defl) {
    if (!f.alive || f.downT > 0) continue;
    const dx = s.x - f.c.x, dy = s.y - f.c.y, dz = s.z - f.c.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > DEFL.R * DEFL.R) continue;
    if (s.age < 0.05 && !s.defl) s.inF = true;   // fired from inside the field: it can't bend what starts in it
    if (s.inF) continue;
    const d = Math.sqrt(d2) || 0.01, sp = s.v.length() || 1;
    _c.copy(s.v).divideScalar(sp); _d.set(dx / d, dy / d, dz / d);
    _d.addScaledVector(_c, -_d.dot(_c));   // the part of "away from the core" that is sideways to the bullet
    if (_d.lengthSq() < 0.04) _d.set(-_c.z, 0.3, _c.x);
    _d.normalize();
    s.v.addScaledVector(_d, DEFL.k * (1.15 - d / DEFL.R) * sp * dt).setLength(sp);
    if (!s.defl) { s.defl = true; G.deflected = (G.deflected || 0) + 1; f.fk = 0.25; f.load += 1;
      if (f.load > DEFL.load) { f.downT = DEFL.down; f.load = 0; G.deflDown = (G.deflDown || 0) + 1; G.fx.sparks(f.c.clone(), null, 24, 0x9fd8ff, 16, 1, 0.4, 0.25); sfx('shieldbreak', G.player.pos.distanceTo(f.pos)); G.onDeflDown && G.onDeflDown(f); } if (Math.random() < 0.3) G.fx.sparks(new V3(s.x, s.y, s.z), null, 2, 0x9fd8ff, 6, 0.4, 0.2, 0.15); }
  }
}
export class Deflector extends Enemy {
  constructor(pos) {
    super('deflector', 'E_Deflector', pos, DEFL.hp, 2.2); this.boom = 1.0;
    this.vel = new V3(); this.ph = Math.random() * 6; this.tossT = 2 + Math.random() * 2; this.reT = 0; this.ward = null; this.fk = 0; this.load = 0; this.downT = 0;
    this.pos.y = groundAt(pos.x, pos.z, 99) + DEFL.alt + 3; this.c.copy(this.pos);
    this.field = new THREE.Mesh(fieldGeo, new THREE.MeshBasicMaterial({ color: 0x6ab8ff, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.field.scale.setScalar(DEFL.R); G.scene.add(this.field);
    (G.defl = G.defl || []).push(this);
  }
  remove() { this.field.parent && this.field.parent.remove(this.field); G.defl = (G.defl || []).filter((f) => f !== this); super.remove(); }
  update(dt) {
    this.ph += dt; this.reT -= dt;
    const p = this.tg(), pc = p.center(playerC);
    if (this.reT <= 0 || (this.ward && !this.ward.alive)) {   // pick the nearest friend to shield
      this.reT = 2; this.ward = null; let bd = 70;
      for (const e of G.enemies) { if (!e.alive || e.dying || e === this || e.kind === 'deflector' || e.holo || e.kind === 'boss' || e.cloaked || !e.c) continue; const dd = e.c.distanceTo(this.c); if (dd < bd) { bd = dd; this.ward = e; } }
    }
    let tx, ty, tz;
    if (this.ward) {
      const w = this.ward.c, dx = pc.x - w.x, dz = pc.z - w.z, L = Math.hypot(dx, dz) || 1;
      tx = w.x + dx / L * 6; tz = w.z + dz / L * 6; ty = Math.max(groundAt(tx, tz, 99) + DEFL.alt, w.y + 2.5);
    } else {
      const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z, L = Math.hypot(dx, dz) || 1;
      tx = p.pos.x + dx / L * 28; tz = p.pos.z + dz / L * 28; ty = groundAt(tx, tz, 99) + 8;
    }
    ty += Math.sin(this.ph * 1.1) * 0.8;
    _a.set(tx - this.pos.x, ty - this.pos.y, tz - this.pos.z); const L = _a.length(); if (L > 0) _a.multiplyScalar(Math.min(DEFL.speed, L * 1.2) / L);
    this.vel.lerp(_a, 1 - Math.exp(-1.8 * dt)); this.pos.addScaledVector(this.vel, dt);
    const s = pointInSolid(this.pos, 2.2); if (s) { this.pos.y = s.max.y + 3; this.vel.y = Math.max(this.vel.y, 2); }
    this.pos.x = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.x)); this.pos.z = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.z));
    this.obj.rotation.y = Math.atan2(this.pos.x - pc.x, this.pos.z - pc.z); this.c.copy(this.pos);
    if (this.n.DF_Ring) this.n.DF_Ring.rotation.x += dt * 3;
    this.fk = Math.max(0, this.fk - dt); this.load = Math.max(0, this.load - DEFL.decay * dt);
    if (this.downT > 0) { this.downT -= dt; if (Math.random() < 0.3) G.fx.sparks(this.c.clone(), null, 1, 0x9fd8ff, 6, 0.5, 0.2, 0.15); }
    this.field.visible = !(this.downT > 0); this.field.position.copy(this.c); this.field.material.opacity = 0.05 + Math.sin(this.ph * 3) * 0.015 + this.fk * 0.5 + this.load / DEFL.load * 0.08;
    // scrap toss: three lobbed chunks
    if (this.c.distanceTo(pc) < 75 && this.checkLos(dt)) {
      this.tossT -= dt;
      if (this.tossT <= 0) {
        this.tossT = DEFL.cd[0] + Math.random() * (DEFL.cd[1] - DEFL.cd[0]);
        for (let k = 0; k < DEFL.n; k++) G.queue.push({ label: 'deflector', t: k * 0.22, fn: () => {
          if (!this.alive) return;
          const m = this.n.Muzzle_DF, mp = m ? m.getWorldPosition(new V3()) : this.c.clone(), tg = this.tg(), tp = tg.center(new V3()), tv = tg.vel || _c.set(0, 0, 0), T = 1.1, g = 18;
          const ax = tp.x + tv.x * T * 0.8 + (Math.random() - 0.5) * 4, az = tp.z + tv.z * T * 0.8 + (Math.random() - 0.5) * 4, ay = tp.y - 1;
          spawnShot({ p: mp, v: new V3((ax - mp.x) / T, (ay - mp.y) / T + 0.5 * g * T, (az - mp.z) / T), dmg: DEFL.dmg, team: 'E', kind: 'shell', grav: g, splash: DEFL.splash, life: 4, color: 0x8a6a4a, label: 'deflector' });
          sfx('artillery', this.pos.distanceTo(G.player.pos));
        } });
      }
    }
  }
}


// ---- Rammer: a ram-plowed assault tank. Armoured in front; it aims (red lane), then charges in a straight line.
// Hitting a wall stuns it for a few seconds, and while stunned (or from behind) it takes extra damage.
export const RAM = { hp: 1250, r: 3.2, walk: 5.5, want: 40, aim: 1.15, lock: 0.35, speed: 31, len: 74, hitW: 4.2, dmg: 62, push: 24, stun: 2.8, rec: 1.3, cd: [3.6, 5.6], front: 0.2, back: 1.6, gunCd: [2.0, 2.6], gunDmg: 7 };
export class Rammer extends Enemy {
  constructor(pos) {
    super('rammer', 'E_Rammer', pos, RAM.hp, RAM.r); this.boom = 1.9; this.obj.scale.setScalar(1.35);
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.st = 'walk'; this.stT = RAM.cd[0] + Math.random() * 2; this.dir = new V3(1, 0, 0);
    this.fwd = new V3(0, 0, -1); this.gunT = 1.5; this.strafe = Math.random() < 0.5 ? 1 : -1; this.swT = 3; this.prog = 0; this.hitDone = false; this.autoD = false;
    this.c.set(pos.x, pos.y + 1.8, pos.z);
  }
  hit(dmg, at, label) {
    if (!this.alive || this.dying) return;
    if (this.st === 'stun') dmg *= RAM.back;
    else if (!G.pierce) {
      const src = at && at.distanceTo(this.c) > 0.6 ? at : G.curSrc;
      if (src) {
        _a.set(src.x - this.c.x, 0, src.z - this.c.z).normalize(); const d = _a.dot(this.fwd);
        if (d > 0.35) { dmg *= RAM.front; G.ramBlocked = (G.ramBlocked || 0) + 1; if (Math.random() < 0.3) G.fx.sparks(_b.copy(this.c).addScaledVector(this.fwd, 3.4), this.fwd, 3, 0xffd090, 10, 1, 0.2, 0.2); }
        else if (d < -0.35) dmg *= RAM.back;
      }
    }
    super.hit(dmg);
  }
  update(dt) {
    const P = G.player, tg = this.tg(), pc = tg.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    this.stT -= dt; let spin = 0;
    if (this.st === 'walk') {
      this.swT -= dt; if (this.swT <= 0) { this.swT = 3 + Math.random() * 3; this.strafe *= -1; }
      this.slideT = Math.max(0, (this.slideT || 0) - dt);
      let toward = dist > RAM.want + 8 ? 1 : dist < RAM.want - 16 ? -0.6 : 0.15; if (this.slideT > 0) toward *= 0.15;
      const sw = this.slideT > 0 ? 1.2 : 0.5;
      const tx = (dx / dist * toward - dz / dist * this.strafe * sw) * RAM.walk, tz = (dz / dist * toward + dx / dist * this.strafe * sw) * RAM.walk;
      this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-1.6 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-1.6 * dt));
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      if (collideCyl(this.pos, 3.0, 3)) blockedSlide(this);
      this.yaw += angDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 1.4);
      spin = Math.hypot(this.vel.x, this.vel.z);
      if (this.stT <= 0 && dist < 90 && this.checkLos(dt)) {
        this.st = 'aim'; this.stT = RAM.aim; this.autoD = Math.random() < 0.62; G.ramCharges = (G.ramCharges || 0) + 1;
        sfx('jetdive', dist * 0.6);
        if (!G.ramSaid && tg === P) { G.ramSaid = true; G.onHint && G.onHint('破城锤要冲锋 · 地面红线就是冲锋路线 · 横向闪开；它撞墙后会瘫痪几秒，正面装甲只吃两成伤害，绕到背后打', 4.5); }
      }
    } else if (this.st === 'aim') {
      if (this.stT > RAM.lock) {   // the lane tracks the target (with lead) until just before the charge
        const tv = tg === P ? P.vel : (tg.vel || _c.set(0, 0, 0)), lt = dist / RAM.speed;
        this.dir.set(pc.x + tv.x * lt * 0.85 - this.pos.x, 0, pc.z + tv.z * lt * 0.85 - this.pos.z); if (this.dir.lengthSq() < 1) this.dir.set(dx, 0, dz); this.dir.normalize();
      }
      this.yaw += angDiff(Math.atan2(-this.dir.x, -this.dir.z), this.yaw) * Math.min(1, dt * 8);
      this.vel.multiplyScalar(Math.exp(-5 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      spin = 6 + Math.sin(G.time * 30) * 3;
      if (Math.random() < 0.5) G.fx.emit('smoke', { x: this.pos.x - this.fwd.x * 3, y: this.pos.y + 2.4, z: this.pos.z - this.fwd.z * 3, vy: 2, life: 0.8, s0: 1, s1: 2.4, c0: 0x4a4440, c1: 0x2a2624, a0: 0.5, drag: 1.5 });
      const fl = this.stT < RAM.lock ? (Math.sin(G.time * 50) > 0 ? 1 : 0.35) : 0.7;
      for (const sd of [-RAM.hitW * 0.7, RAM.hitW * 0.7]) G.fx.streak(_d.set(this.pos.x - this.dir.z * sd, 0.3, this.pos.z + this.dir.x * sd), _b.set(this.pos.x + this.dir.x * RAM.len - this.dir.z * sd, 0.3, this.pos.z + this.dir.z * RAM.len + this.dir.x * sd), 0.45 * fl, 0xff3020);
      if (this.stT <= 0) { this.st = 'charge'; this.prog = 0; this.hitDone = false; sfx('bigboom', dist * 0.5); }
    } else if (this.st === 'charge') {
      this.vel.copy(this.dir).multiplyScalar(RAM.speed); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.prog += RAM.speed * dt;
      this.yaw = Math.atan2(-this.dir.x, -this.dir.z); spin = RAM.speed;
      if (Math.random() < 0.7) G.fx.dust(_d.set(this.pos.x, this.pos.y + 0.3, this.pos.z), 1, 2.2, 4);
      if (!this.hitDone) for (const e of entsFor('E')) {
        if (e.isBarrel || e.isMine || Math.hypot(e.c.x - this.c.x, e.c.z - this.c.z) > (e.r || 1) + RAM.hitW || e.c.y - this.c.y > 8 || e.c.y < this.c.y - 4) continue;   // the plow flings debris up: hovering low over it is not safe
        this.hitDone = true; G.curSrc = this.pos; G.curLabel = 'rammer'; dealDamage(e, RAM.dmg, 'E', this.c, 'rammer');
        if (e.isPlayer) { P.vel.x = this.dir.x * RAM.push; P.vel.z = this.dir.z * RAM.push; P.vel.y = Math.max(P.vel.y, 9); P.grounded = false; G.ramHits = (G.ramHits || 0) + 1; }
        G.fx.sparks(this.c.clone().addScaledVector(this.fwd, 3), this.fwd, 18, 0xffc080, 18, 1.2, 0.35, 0.25); G.fx.trauma = Math.min(1, G.fx.trauma + 0.5); sfx('bigboom', 0);
        break;
      }
      // bowl smaller enemies aside
      for (const e of G.enemies) if (e !== this && e.alive && e.pos && e.kind !== 'boss' && e.maxHp < 1500 && e.c && Math.hypot(e.c.x - this.c.x, e.c.z - this.c.z) < (e.r || 1) + 2.8 && e.c.y - this.pos.y < 4) { const sx = -this.dir.z, sz = this.dir.x, sg = (e.c.x - this.c.x) * sx + (e.c.z - this.c.z) * sz > 0 ? 1 : -1; e.pos.x += sx * sg * 8 * dt; e.pos.z += sz * sg * 8 * dt; }
      _d.copy(this.pos); _d.y += 2.6; const tall = collideCyl(_d, 3.0, 1);   // low barriers and crates are ploughed through; only real walls stop it
      if (tall) { this.pos.x = _d.x; this.pos.z = _d.z; }
      else if (collideCyl(_c.copy(this.pos), 3.0, 2.6) && Math.random() < 0.5) G.fx.sparks(_b.copy(this.c).addScaledVector(this.fwd, 3.2), this.fwd, 3, 0xffc080, 12, 1, 0.25, 0.2);
      const wall = tall || Math.abs(this.pos.x) > ARENA - 5 || Math.abs(this.pos.z) > ARENA - 5;
      if (wall) {
        this.st = 'stun'; this.stT = RAM.stun; G.ramStuns = (G.ramStuns || 0) + 1; this.vel.set(0, 0, 0);
        const at = this.c.clone().addScaledVector(this.fwd, 3.5);
        G.fx.sparks(at, this.fwd.clone().multiplyScalar(-1), 30, 0xffd090, 22, 1.4, 0.45, 0.3); G.fx.emit('smoke', { x: at.x, y: at.y, z: at.z, vy: 1, life: 2, s0: 4, s1: 9, c0: 0x6a5a48, c1: 0x4a4038, a0: 0.5, drag: 1.2 });
        G.fx.trauma = Math.min(1, G.fx.trauma + 0.4 * Math.max(0, 1 - this.pos.distanceTo(P.pos) / 70)); sfx('bigboom', this.pos.distanceTo(P.pos));
        if (!G.ramStunSaid) { G.ramStunSaid = true; G.onHint && G.onHint('破城锤撞墙瘫痪 · 2.8 秒内全方位 ×1.6 伤害', 3); }
      } else if (this.prog > RAM.len) { this.st = 'rec'; this.stT = RAM.rec; }
    } else if (this.st === 'stun') {
      spin = 0; if (Math.random() < 0.35) G.fx.sparks(_d.copy(this.c).setY(this.c.y + 1.5), null, 1, 0xffb060, 8, 0.8, 0.3, 0.18);
      if (this.stT <= 0) { this.st = 'walk'; this.stT = RAM.cd[0] + Math.random() * (RAM.cd[1] - RAM.cd[0]); }
    } else {   // recover after a miss
      this.vel.multiplyScalar(Math.exp(-3 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; collideCyl(this.pos, 3.0, 3);
      spin = this.vel.length();
      if (this.stT <= 0) { this.st = 'walk'; this.stT = RAM.cd[0] + Math.random() * (RAM.cd[1] - RAM.cd[0]); }
    }
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 2.5);
    this.obj.rotation.y = this.yaw; this.fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    for (let k = 1; k <= 6; k++) { const w = this.n['RM_Wheel' + k]; if (w) w.rotation.x -= spin * dt / 0.75; }
    if (this.n.RM_Gun) this.n.RM_Gun.rotation.y += angDiff(angDiff(Math.atan2(-dx, -dz), this.yaw), this.n.RM_Gun.rotation.y) * Math.min(1, dt * 3);
    this.c.set(this.pos.x, this.pos.y + 1.8, this.pos.z);
    // roof gun: short bursts while it isn't charging
    if ((this.st === 'walk' || this.st === 'rec') && dist < 90 && this.checkLos(dt)) {
      this.gunT -= dt;
      if (this.gunT <= 0) {
        this.gunT = RAM.gunCd[0] + Math.random() * (RAM.gunCd[1] - RAM.gunCd[0]);
        for (let k = 0; k < 3; k++) G.queue.push({ label: 'rammer-gun', t: k * 0.13, fn: () => {
          if (!this.alive) return;
          const m = this.n.Muzzle_RM, mp = m ? m.getWorldPosition(new V3()) : this.c.clone().setY(this.c.y + 1.5);
          const aim = lead(mp, 150, _b, this.tg()); _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.05;
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(150), dmg: RAM.gunDmg, team: 'E', kind: 'ebullet', color: 0xff6a40, w: 0.28, len: 5, label: 'rammer-gun' });
          G.fx.muzzle(mp, _d, 0xff8a50, 0.9); sfx('eshot', this.pos.distanceTo(G.player.pos));
        } });
      }
    }
  }
}

// ---- Earthquakes: every ~20 s the ground shakes; fissures (warned lanes) erupt and rocks fall around the player
export const QUAKE = { every: [17, 23], first: 14, warn: 2.4, dur: 7, fis: 3, fgap: 1.9, fwarn: 1.6, ferupt: 2.6, fW: 2.6, fLen: 66, fDmg: 30, eDmg: 26, rocks: 6, rockR: 4.5, rockDmg: 34, rockT: 1.3 };
export function startQuakes() { G.quake = { st: 'calm', t: QUAKE.first, fis: [], n: 0 }; }
export function clearQuakes() { G.quake = null; }
function fissureAt(P, lead) {
  const a = Math.random() * Math.PI, ox = (Math.random() - 0.5) * 2 * (lead ? 2 : 10), oz = (Math.random() - 0.5) * 2 * (lead ? 2 : 10);
  const cx = P.pos.x + P.vel.x * (lead ? 1.4 : 0.6) + ox, cz = P.pos.z + P.vel.z * (lead ? 1.4 : 0.6) + oz, ux = Math.cos(a), uz = Math.sin(a);
  return { ax: cx - ux * QUAKE.fLen / 2, az: cz - uz * QUAKE.fLen / 2, ux, uz, st: 'warn', t: QUAKE.fwarn, autoD: Math.random() < 0.65 };
}
export function fissureDist(f, x, z) {   // distance from a point to the fissure segment
  const px = x - f.ax, pz = z - f.az, t = Math.max(0, Math.min(QUAKE.fLen, px * f.ux + pz * f.uz));
  return Math.hypot(px - f.ux * t, pz - f.uz * t);
}
function updateQuakes(dt) {
  const Q = G.quake, P = G.player; if (!Q || !P) return;
  Q.t -= dt;
  if (Q.st === 'calm') {
    if (Q.t <= 0) { Q.st = 'rumble'; Q.t = QUAKE.warn; G.onQuake && G.onQuake(); sfx('rumble', 0); }
  } else if (Q.st === 'rumble') {
    G.fx.trauma = Math.max(G.fx.trauma, 0.12 + 0.1 * (1 - Q.t / QUAKE.warn));
    if (Q.t <= 0) {
      Q.st = 'quake'; Q.t = QUAKE.dur; Q.n++; G.quakes = (G.quakes || 0) + 1;
      for (let k = 0; k < QUAKE.fis; k++) G.queue.push({ label: 'fissure', t: k * QUAKE.fgap, fn: () => { if (G.quake && G.player) G.quake.fis.push(fissureAt(G.player, k === 0)); } });
      for (let k = 0; k < QUAKE.rocks; k++) G.queue.push({ label: 'quake-rock', t: 0.6 + k * (QUAKE.dur - 1.6) / QUAKE.rocks, fn: () => {
        const p = G.player; if (!p || !G.quake) return;
        const lead = Math.random() < 0.5, r = lead ? 1.5 : 5 + Math.random() * 12, a = Math.random() * 6.28;
        const x = p.pos.x + (lead ? p.vel.x * QUAKE.rockT : 0) + Math.cos(a) * r, z = p.pos.z + (lead ? p.vel.z * QUAKE.rockT : 0) + Math.sin(a) * r, y = groundAt(x, z, 99);
        const T = QUAKE.rockT, g = 22, h = 42, v0 = (h - 0.5 * g * T * T) / T;
        spawnShot({ p: new V3(x, y + h, z), v: new V3(0, -v0, 0), dmg: QUAKE.rockDmg, team: 'E', kind: 'shell', grav: g, splash: QUAKE.rockR, life: T + 1, color: 0x8a7a60, label: 'quake-rock' });
        G.fx.warn(new V3(x, y, z), QUAKE.rockR, T);
      } });
    }
  } else if (Q.st === 'quake') {
    G.fx.trauma = Math.max(G.fx.trauma, 0.22);
    if (Q.t <= 0 && !Q.fis.length) { Q.st = 'calm'; Q.t = QUAKE.every[0] + Math.random() * (QUAKE.every[1] - QUAKE.every[0]); }
  }
  for (let i = Q.fis.length - 1; i >= 0; i--) {
    const f = Q.fis[i]; f.t -= dt;
    const L = QUAKE.fLen, bx = f.ax + f.ux * L, bz = f.az + f.uz * L;
    if (f.st === 'warn') {
      const fl = f.t < 0.4 ? (Math.sin(G.time * 50) > 0 ? 1 : 0.4) : 0.75;
      G.fx.streak(_d.set(f.ax, 0.25, f.az), _b.set(bx, 0.25, bz), 0.5 * fl, 0xff7020);
      if (Math.random() < 0.6) { const t = Math.random() * L; G.fx.dust(_d.set(f.ax + f.ux * t, 0.4, f.az + f.uz * t), 1, 1.6, 3); }
      if (f.t <= 0) { f.st = 'erupt'; f.t = QUAKE.ferupt; sfx('bigboom', fissureDist(f, P.pos.x, P.pos.z)); G.fx.trauma = Math.min(1, G.fx.trauma + 0.25); }
    } else {
      G.fx.streak(_d.set(f.ax, 0.3, f.az), _b.set(bx, 0.3, bz), QUAKE.fW * 0.9, 0xff5a18);
      for (let k = 0; k < 3; k++) {
        const t = Math.random() * L, x = f.ax + f.uz * 0 + f.ux * t, z = f.az + f.uz * t;
        G.fx.emit('add', { x, y: 0.5, z, vy: 6 + Math.random() * 6, life: 0.5, s0: 2.2, s1: 0.6, c0: 0xffa040, c1: 0xff3010 });
        if (Math.random() < 0.3) G.fx.emit('smoke', { x, y: 1, z, vy: 3, life: 1.4, s0: 2, s1: 5, c0: 0x5a4a3e, c1: 0x3a302a, a0: 0.45, drag: 1.2 });
      }
      if (P.alive && P.pos.y - groundAt(P.pos.x, P.pos.z, P.pos.y + 1) < 1.6 && fissureDist(f, P.pos.x, P.pos.z) < QUAKE.fW) { hurtPlayer(QUAKE.fDmg * dt, 'fissure'); G.fisT = (G.fisT || 0) + dt; }
      for (const e of G.enemies) if (e.alive && !e.dying && e.pos && e.kind !== 'boss' && e.pos.y - groundAt(e.pos.x, e.pos.z, 99) < 1.6 && fissureDist(f, e.pos.x, e.pos.z) < QUAKE.fW + (e.r || 1) * 0.4) e.hit(QUAKE.eDmg * dt);
      if (f.t <= 0) Q.fis.splice(i, 1);
    }
  }
}

// ---- RB-4 ricochet rounds: bounce off walls and the floor, turn toward a nearby enemy and hit harder each bounce
export const RICO = { mul: 1.25, seek: 32, home: 0.75 };
const _rn = new V3();
function ricochet(s, at, so) {
  let nx = 0, ny = 0, nz = 0;
  if (so === 'floor') ny = 1;
  else {
    const ds = [at.x - so.min.x, so.max.x - at.x, at.y - so.min.y, so.max.y - at.y, at.z - so.min.z, so.max.z - at.z].map(Math.abs), m = Math.min(...ds), i = ds.indexOf(m);
    if (i === 0) nx = -1; else if (i === 1) nx = 1; else if (i === 2) ny = -1; else if (i === 3) ny = 1; else if (i === 4) nz = -1; else nz = 1;
  }
  const vn = s.v.x * nx + s.v.y * ny + s.v.z * nz;
  if (vn < 0) { s.v.x -= 2 * vn * nx; s.v.y -= 2 * vn * ny; s.v.z -= 2 * vn * nz; }
  s.bounce--; s.dmg *= RICO.mul; s.life = Math.max(s.life, 0.7); s.color = 0x60ffc8; s.age = Math.min(s.age, 0.02); s.len = 4;
  let best = null, bd = RICO.seek;
  for (const e of entsFor('P')) { if (e.isBarrel || e.isMine || !e.alive || e.holo) continue; const dd = e.c.distanceTo(at); if (dd < bd && clearLine(at, e.c)) { bd = dd; best = e; } }
  const sp = s.v.length() * 0.92;
  if (best) { _rn.subVectors(best.c, at).normalize(); s.v.normalize().lerp(_rn, RICO.home).normalize().multiplyScalar(sp); G.ricoSeek = (G.ricoSeek || 0) + 1; }
  else s.v.multiplyScalar(0.92);
  s.x = at.x + nx * 0.08; s.y = at.y + ny * 0.08; s.z = at.z + nz * 0.08;
  G.ricochets = (G.ricochets || 0) + 1;
  G.fx.sparks(at, _rn.set(nx, ny, nz), 3, 0x9fffe0, 10, 0.6, 0.18, 0.16);
  if (Math.random() < 0.12) sfx('ricochet', G.player ? G.player.pos.distanceTo(at) : 0);
}


// ---- Leaper: a biped that leaps onto where you are going (red ring), slams down with a shockwave and recovers.
// In the air it takes x1.5 damage, and a quarter of its HP taken mid-leap knocks it out of the sky (no slam, stunned).
export const LEAP = { hp: 820, r: 2.4, walk: 9, want: [20, 36], cd: [3.4, 5.0], crouch: 0.65, T: 1.25, apex: 13, R: 7.5, dmg: 46, up: 11, lag: 1.0, airMul: 1.5, knock: 0.25, stun: 2.4, gunCd: [1.9, 2.5], pel: 5, pdmg: 6, spread: 0.09 };
export class Leaper extends Enemy {
  constructor(pos) {
    super('leaper', 'E_Leaper', pos, LEAP.hp, LEAP.r); this.boom = 1.3;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.st = 'stalk'; this.stT = 2 + Math.random() * 2.5; this.gunT = 1.5;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.swT = 2; this.A = new V3(); this.B = new V3(); this.ft = 0; this.airDmg = 0; this.downed = false; this.cr = 0;
    this.c.set(pos.x, pos.y + 3.6, pos.z);
  }
  hit(dmg, at, label) {
    if (!this.alive || this.dying) return;
    if (this.st === 'air') {
      dmg *= LEAP.airMul; this.airDmg += dmg;
      if (!this.downed && this.airDmg >= this.maxHp * LEAP.knock && this.hp - dmg > 0) {
        this.downed = true; this.st = 'fall'; G.leapDowned = (G.leapDowned || 0) + 1; G.onTally && G.onTally('leapDown');
        this.vel.set((this.B.x - this.A.x) / LEAP.T * 0.35, 2, (this.B.z - this.A.z) / LEAP.T * 0.35);
        G.fx.sparks(this.c, null, 20, 0xffc080, 16, 1.2, 0.35, 0.25); sfx('shieldbreak', G.player.pos.distanceTo(this.pos));
        if (!G.leapDownSaid) { G.leapDownSaid = true; G.onHint && G.onHint('跃击者被打下来了 · 它在空中受伤 ×1.5，摔落后瘫痪 2.4 秒', 3); }
      }
    } else if (this.st === 'lag' || this.st === 'down') dmg *= 1.25;
    super.hit(dmg);
  }
  update(dt) {
    const P = G.player, tg = this.tg(), pc = tg.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    this.stT -= dt; let crouch = 0, tuck = 0;
    if (this.st === 'stalk') {
      this.swT -= dt; if (this.swT <= 0) { this.swT = 1.5 + Math.random() * 2; this.strafe *= -1; }
      this.slideT = Math.max(0, (this.slideT || 0) - dt);
      let toward = dist > LEAP.want[1] ? 1 : dist < LEAP.want[0] ? -0.7 : 0; if (this.slideT > 0) toward *= 0.15;
      const sw = this.slideT > 0 ? 1.2 : 0.8;
      const tx = (dx / dist * toward - dz / dist * this.strafe * sw) * LEAP.walk, tz = (dz / dist * toward + dx / dist * this.strafe * sw) * LEAP.walk;
      this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-3 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-3 * dt));
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      if (collideCyl(this.pos, 2.2, 4)) blockedSlide(this);
      this.yaw += angDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 4);
      crouch = 0.15 + 0.12 * Math.abs(Math.sin(G.time * 9));
      if (dist < 60 && this.checkLos(dt)) {
        this.gunT -= dt;
        if (this.gunT <= 0) {
          this.gunT = LEAP.gunCd[0] + Math.random() * (LEAP.gunCd[1] - LEAP.gunCd[0]);
          const m = this.n.Muzzle_LP, mp = m ? m.getWorldPosition(new V3()) : this.c.clone(); const aim = lead(mp, 160, _b, tg);
          for (let k = 0; k < LEAP.pel; k++) {
            _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * LEAP.spread; _d.y += (Math.random() - 0.5) * LEAP.spread * 0.6; _d.z += (Math.random() - 0.5) * LEAP.spread;
            spawnShot({ p: mp, v: _d.normalize().multiplyScalar(160), dmg: LEAP.pdmg, team: 'E', kind: 'ebullet', color: 0xff8a40, w: 0.24, len: 4, life: 0.6, label: 'leaper-gun' });
          }
          G.fx.muzzle(mp, _d, 0xffa050, 1.3); sfx('eshell', dist);
        }
      }
      if (this.stT <= 0 && dist < 75 && this.los) { this.st = 'crouch'; this.stT = LEAP.crouch; }
    } else if (this.st === 'crouch') {
      crouch = 1 - Math.max(0, this.stT) / LEAP.crouch; this.vel.multiplyScalar(Math.exp(-8 * dt));
      this.yaw += angDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 6);
      if (this.stT <= 0) {   // jump onto where the target will be when it lands
        const tv = tg === P ? P.vel : (tg.vel || _c.set(0, 0, 0)), T = LEAP.T;
        let bx = pc.x + tv.x * T * 0.85, bz = pc.z + tv.z * T * 0.85;
        bx = Math.max(-ARENA + 6, Math.min(ARENA - 6, bx)); bz = Math.max(-ARENA + 6, Math.min(ARENA - 6, bz));
        this.B.set(bx, 0, bz); if (pointInSolid(_d.set(bx, 1, bz), 2)) this.B.set(tg.pos.x, 0, tg.pos.z);
        this.B.y = groundAt(this.B.x, this.B.z, 99);
        this.A.copy(this.pos); this.st = 'air'; this.ft = 0; this.airDmg = 0; this.downed = false; this.autoD = Math.random() < 0.6;
        G.fx.warn(this.B.clone(), LEAP.R, T); G.leaps = (G.leaps || 0) + 1; sfx('jetdive', dist * 0.5);
        for (let k = 0; k < 8; k++) G.fx.dust(_d.set(this.pos.x, this.pos.y + 0.3, this.pos.z), 1, 2.4, 6);
        if (!G.leapSaid && tg === P) { G.leapSaid = true; G.onHint && G.onHint('跃击者起跳 · 红圈是它的落点，落地冲击波 7 m · 它在空中受伤 ×1.5，打掉四分之一血就会摔下来', 4.5); }
      }
    } else if (this.st === 'air') {
      this.ft += dt; const k = Math.min(1, this.ft / LEAP.T); tuck = 1;
      this.pos.x = this.A.x + (this.B.x - this.A.x) * k; this.pos.z = this.A.z + (this.B.z - this.A.z) * k;
      this.pos.y = this.A.y + (this.B.y - this.A.y) * k + 4 * LEAP.apex * k * (1 - k);
      this.yaw += angDiff(Math.atan2(-(this.B.x - this.A.x), -(this.B.z - this.A.z)), this.yaw) * Math.min(1, dt * 6);
      if (Math.random() < 0.8) G.fx.emit('add', { x: this.pos.x - this.fwdX() * 1.2, y: this.pos.y + 3.8, z: this.pos.z - this.fwdZ() * 1.2, vy: -6, life: 0.2, s0: 1.4, s1: 0.4, c0: 0xffa040, c1: 0xff4010 });
      if (k >= 1) {
        G.curLabel = 'leaper-slam'; explodeAt(this.B.clone().setY(this.B.y + 0.6), LEAP.R, LEAP.dmg, 'E', 1.1, 0xffa060);
        G.fx.ring(this.B.clone().setY(this.B.y + 0.3), new V3(0, 1, 0), 1, LEAP.R, 0.35, 0xffc080);
        if (P.alive && Math.hypot(P.pos.x - this.B.x, P.pos.z - this.B.z) < LEAP.R && P.pos.y - this.B.y < 4) { P.vel.y = Math.max(P.vel.y, LEAP.up); P.grounded = false; G.leapHits = (G.leapHits || 0) + 1; }
        else if (P.alive && Math.hypot(P.pos.x - this.B.x, P.pos.z - this.B.z) < LEAP.R && P.pos.y - this.B.y < 13) { hurtPlayer(LEAP.dmg * 0.7, 'leaper-slam'); G.leapHits = (G.leapHits || 0) + 1; }   // the shock column reaches hovering mechs too
        G.fx.trauma = Math.min(1, G.fx.trauma + 0.4 * Math.max(0, 1 - this.pos.distanceTo(P.pos) / 50));
        for (let q = 0; q < 10; q++) G.fx.dust(_d.set(this.B.x, this.B.y + 0.3, this.B.z), 1, 3, 9);
        this.st = 'lag'; this.stT = LEAP.lag; this.vel.set(0, 0, 0);
      }
    } else if (this.st === 'fall') {
      tuck = 0.5; this.vel.y -= 30 * dt; this.pos.addScaledVector(this.vel, dt); this.obj.rotation.z = Math.sin(G.time * 14) * 0.3;
      const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
      const sd = pointInSolid(this.pos, 2); if (sd && this.pos.y < sd.max.y) { this.pos.y = sd.max.y; this.vel.set(0, this.vel.y, 0); }
      if (this.pos.y <= gy) { this.pos.y = gy; this.st = 'down'; this.stT = LEAP.stun; this.obj.rotation.z = 0; G.fx.dust(_d.set(this.pos.x, gy + 0.3, this.pos.z), 6, 3, 6); sfx('boom', this.pos.distanceTo(P.pos)); }
    } else {   // lag after landing, or down after being shot out of the air
      crouch = this.st === 'down' ? 1 : 0.7;
      if (this.st === 'down' && Math.random() < 0.3) G.fx.sparks(_d.copy(this.c), null, 1, 0xffb060, 8, 0.8, 0.3, 0.18);
      if (this.stT <= 0) { this.st = 'stalk'; this.stT = LEAP.cd[0] + Math.random() * (LEAP.cd[1] - LEAP.cd[0]); }
    }
    if (this.st !== 'air' && this.st !== 'fall') this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.8, 2);
    this.cr += ((tuck ? -0.6 * tuck : crouch) - this.cr) * Math.min(1, dt * 12);
    for (const L of ['LP_LegL', 'LP_LegR']) if (this.n[L]) this.n[L].rotation.x = this.cr * 0.55;
    this.obj.rotation.y = this.yaw;
    this.c.set(this.pos.x, this.pos.y + 3.6 - Math.max(0, this.cr) * 0.9, this.pos.z);
  }
  fwdX() { return -Math.sin(this.yaw); }
  fwdZ() { return -Math.cos(this.yaw); }
}

// ---- Solar flares: every ~23 s the sun flares for 5.5 s. Anything outside a building's shadow burns (you and enemies)
export const FLARE = { first: 16, every: [20, 26], warn: 3, dur: 5.5, dmg: 26, edmg: 22 };
const _fo = new V3();
export function startFlares() { G.flare = { st: 'calm', t: FLARE.first, k: 0, n: 0, exposed: false }; }
export function clearFlares() { G.flare = null; }
export function inShade(x, y, z) { _fo.set(x, y, z); return raySolids(_fo, G.sunDir, 160, true).solid !== null; }
function updateFlares(dt) {
  const F = G.flare, P = G.player; if (!F || !P) return;
  F.t -= dt;
  if (F.st === 'calm') {
    F.k = Math.max(0, F.k - dt * 1.2);
    if (F.t <= 0) { F.st = 'warn'; F.t = FLARE.warn; G.onFlare && G.onFlare(); sfx('alarm', 0); }
  } else if (F.st === 'warn') {
    F.k = 0.3 * (1 - F.t / FLARE.warn);
    if (F.t <= 0) { F.st = 'flare'; F.t = FLARE.dur; F.n++; G.flares = (G.flares || 0) + 1; sfx('bigboom', 60); }
  } else {
    F.k = Math.min(1, F.k + dt * 2.5);
    if (P.alive && !inShade(P.pos.x, P.pos.y + 2.5, P.pos.z)) { hurtPlayer(FLARE.dmg * dt, 'flare'); G.flareT = (G.flareT || 0) + dt; if (Math.random() < 0.3) G.fx.emit('smoke', { x: P.pos.x, y: P.pos.y + 3, z: P.pos.z, vy: 2, life: 0.8, s0: 1, s1: 2.5, c0: 0x8a7a68, c1: 0x5a5048, a0: 0.35, drag: 1.5 }); }
    for (const e of G.enemies) if (e.alive && !e.dying && e.c && e.kind !== 'boss' && !e.holo && !inShade(e.c.x, e.c.y, e.c.z)) { e.hit(FLARE.edmg * dt); G.flareE = (G.flareE || 0) + FLARE.edmg * dt; }
    if (F.t <= 0) { F.st = 'calm'; F.t = FLARE.every[0] + Math.random() * (FLARE.every[1] - FLARE.every[0]); }
  }
  F.exposed = F.st !== 'calm' && P.alive && !inShade(P.pos.x, P.pos.y + 2.5, P.pos.z);
}

// ---- Thunderhead: storm bolts lock onto the highest mech in the open (you or flying enemies) for 1.4 s, then strike.
// Landing or standing within 14 m of a lightning rod (arena towers or LR-1) makes the bolt miss; a rod that takes a bolt zaps the nearest enemy.
export const THUNDER = { first: 10, every: [4.5, 7], lock: 1.4, dmg: 58, edmg: 150, hov: 5, rodR: 14, react: 0.7, zap: 70, zapR: 18 };
const _th = new V3(), _th2 = new V3(), _th3 = new V3();
export const RODS_AT = [];   // arena storm towers {x, z, top}
let rodRings = [];
const ringMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
export function startThunder(rods) {
  G.thunder = { t: THUNDER.first, lock: null };
  RODS_AT.length = 0; for (const r of rods) RODS_AT.push(r);
  const geo = new THREE.RingGeometry(THUNDER.rodR - 0.4, THUNDER.rodR, 64); geo.rotateX(-Math.PI / 2);
  const mat = ringMat(0x60c8ff, 0.32);
  for (const r of RODS_AT) { const m = new THREE.Mesh(geo, mat); m.position.set(r.x, groundAt(r.x, r.z, 2) + 0.15, r.z); G.scene.add(m); rodRings.push(m); }
}
export function clearThunder() { G.thunder = null; for (const m of rodRings) m.parent && m.parent.remove(m); rodRings = []; RODS_AT.length = 0; }
export function rodCover(x, z) {
  for (const r of RODS_AT) if (Math.hypot(r.x - x, r.z - z) < THUNDER.rodR) return _th2.set(r.x, r.top, r.z);
  for (const r of G.rods) if (r.alive && r.up && Math.hypot(r.pos.x - x, r.pos.z - z) < r.d.cover) return r.tip(_th2);
  return null;
}
const altOf = (o) => o.y - groundAt(o.x, o.z, o.y + 1);
function boltFx(from, to, big) {
  G.fx.lightning(from, to, 0xd8f2ff, big ? 1.1 : 0.7, 0.28, 5); G.fx.lightning(from, to, 0x80c8ff, big ? 0.6 : 0.4, 0.2, 7);
  G.fx.flash(to, 0xa0e0ff, 34, 34, 0.22); G.fx.sparks(to, null, 24, 0xd8f2ff, 22, 1.2, 0.4, 0.3);
  sfx('thunder', G.player ? G.player.pos.distanceTo(to) * 0.15 : 10); G.onBolt && G.onBolt('strike');
}
function rodZap(from, R, dmg) {   // a rod that took a bolt (or an LR-1 discharge) hits the nearest enemy in reach
  let best = null, bd = R;
  for (const e of G.enemies) { if (!e.alive || e.dying || !e.c || e.holo || e.cloaked) continue; const d = e.c.distanceTo(from); if (d < bd && clearLine(from, e.c)) { bd = d; best = e; } }
  if (best) { G.fx.lightning(from, best.c, 0x9ff6ff, 0.45, 0.16, 2); dealDamage(best, dmg, 'P', best.c, 'rod'); G.fx.sparks(best.c, null, 10, 0x9ff6ff, 14, 1, 0.3, 0.24); }
  return best;
}
function updateThunder(dt) {
  const T = G.thunder, P = G.player; if (!T || !P) return;
  if (!T.lock) {
    T.t -= dt; if (T.t > 0) return;
    T.t = THUNDER.every[0] + Math.random() * (THUNDER.every[1] - THUNDER.every[0]);
    let best = null, bh = THUNDER.hov;
    if (P.alive) { const h = altOf(P.pos); if (h > bh && !rodCover(P.pos.x, P.pos.z)) { best = P; bh = h; } }
    for (const e of G.enemies) {
      if (!e.alive || e.dying || !e.c || e.holo || e.cloaked || e.kind === 'boss' || e.c.distanceTo(P.pos) > 110) continue;
      const h = altOf(e.c) - 1.5; if (h > bh && !rodCover(e.c.x, e.c.z)) { best = e; bh = h; }
    }
    if (!best) {   // nobody exposed: the bolt hits open ground somewhere near you
      const a = Math.random() * 6.28, r = 18 + Math.random() * 30; _th.set(P.pos.x + Math.sin(a) * r, 0, P.pos.z + Math.cos(a) * r); _th.y = groundAt(_th.x, _th.z, 40);
      const cov = rodCover(_th.x, _th.z); const to = cov ? _th3.copy(cov) : _th;
      boltFx(_th2.set(to.x + (Math.random() - 0.5) * 10, to.y + 80, to.z + (Math.random() - 0.5) * 10), to, false); G.bolts = (G.bolts || 0) + 1;
      if (cov) { rodZap(to, THUNDER.zapR, THUNDER.zap); G.boltRod = (G.boltRod || 0) + 1; }
      return;
    }
    T.lock = { tg: best, t: THUNDER.lock, isP: best === P, react: Math.random() < THUNDER.react };
    if (T.lock.isP) { G.onBolt && G.onBolt('lock'); sfx('coil', 0); G.boltLocks = (G.boltLocks || 0) + 1; }
    return;
  }
  const L = T.lock, tg = L.tg; L.t -= dt;
  if (!tg.alive || (!L.isP && tg.dying)) { T.lock = null; return; }
  const c = L.isP ? tg.center(_th) : _th.copy(tg.c);
  if (Math.random() < 0.6) G.fx.sparks(_th3.copy(c).add(_th2.set((Math.random() - 0.5) * 4, (Math.random() - 0.2) * 4, (Math.random() - 0.5) * 4)), null, 2, 0xbfe8ff, 9, 0.9, 0.25, 0.2);
  if (L.t > 0) return;
  T.lock = null; G.bolts = (G.bolts || 0) + 1;
  const sky = _th3.set(c.x + (Math.random() - 0.5) * 8, c.y + 80, c.z + (Math.random() - 0.5) * 8).clone();
  const cov = rodCover(c.x, c.z);
  if (cov) { const to = cov.clone(); boltFx(sky, to, true); rodZap(to, THUNDER.zapR, THUNDER.zap); G.boltRod = (G.boltRod || 0) + 1; return; }
  const h = L.isP ? altOf(tg.pos) : altOf(tg.c) - 1.5;
  if (h > THUNDER.hov - 1.5) {
    boltFx(sky, c, true);
    if (L.isP) { G.curLabel = 'bolt'; hurtPlayer(THUNDER.dmg, 'bolt'); G.boltHits = (G.boltHits || 0) + 1; tg.vel.y = Math.min(tg.vel.y, -8); G.fx.trauma = Math.min(1, G.fx.trauma + 0.5); }
    else { tg.hit(THUNDER.edmg, c, 'bolt'); G.boltE = (G.boltE || 0) + 1; G.onTally && G.onTally('boltE'); }
  } else {   // it dropped in time: the bolt hits the ground beside it
    const a = Math.random() * 6.28; const to = new V3(c.x + Math.sin(a) * 5, 0, c.z + Math.cos(a) * 5); to.y = groundAt(to.x, to.z, c.y);
    boltFx(sky, to, false); if (L.isP) G.boltDodged = (G.boltDodged || 0) + 1;
  }
}

// ---- LR-1 lightning rod (shoulder): planted 6 m ahead, zaps the nearest enemy every 0.9 s and covers you from storm bolts
export class Rod {
  constructor(owner, slot, d, dmgMul) {
    for (const r of G.rods.slice()) r.end();
    this.d = d; this.mul = dmgMul; this.t = d.dur; this.alive = true; this.up = false; this.drop = 0.45; this.zapT = 0.4;
    const a = owner.aimYaw, p = new V3(owner.pos.x - Math.sin(a) * 6, 0, owner.pos.z - Math.cos(a) * 6);
    if (pointInSolid(new V3(p.x, 1, p.z), 2) || (PLAT.R && Math.hypot(p.x, p.z) > PLAT.R - 4)) p.set(owner.pos.x, 0, owner.pos.z);
    p.y = groundAt(p.x, p.z, owner.pos.y + 2); this.pos = p;
    this.obj = cloneKit('D_Rod'); this.obj.scale.setScalar(1.1); this.obj.position.copy(p).setY(p.y + 8); G.scene.add(this.obj); this.n = nodes(this.obj);
    const geo = new THREE.RingGeometry(d.cover - 0.3, d.cover, 56); geo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(geo, ringMat(0x80d8ff, 0)); this.ring.position.set(p.x, p.y + 0.18, p.z); G.scene.add(this.ring);
    G.rods.push(this); G.rodsUsed = (G.rodsUsed || 0) + 1;
    G.fx.streak(owner.muzzlePos(slot, new V3(), 0).clone(), this.obj.position, 0.4, 0x9fe8ff);
  }
  tip(out) { return out.set(this.pos.x, this.pos.y + 6.7 * 1.1, this.pos.z); }
  end() {
    if (!this.alive) return; this.alive = false;
    G.fx.sparks(this.tip(new V3()), null, 14, 0x9fe8ff, 10, 1, 0.4, 0.22);
    this.obj.parent && this.obj.parent.remove(this.obj); this.ring.parent && this.ring.parent.remove(this.ring); this.ring.geometry.dispose();
    const i = G.rods.indexOf(this); if (i >= 0) G.rods.splice(i, 1);
  }
  update(dt) {
    this.t -= dt; if (this.t <= 0) { this.end(); return; }
    if (this.drop > 0) {
      this.drop -= dt; const k = Math.max(0, this.drop / 0.45); this.obj.position.y = this.pos.y + 8 * k * k;
      if (this.drop <= 0) { this.up = true; G.fx.ring(new V3(this.pos.x, this.pos.y + 0.3, this.pos.z), null, 1, 6, 0.35, 0x9fe8ff); G.fx.smoke(this.pos, 4, 2, 2, 0x8a8a8a, 1.2, 0.8); sfx('pile', G.player.pos.distanceTo(this.pos) * 0.6); }
      return;
    }
    this.ring.material.opacity = 0.22 + 0.08 * Math.sin(G.time * 5) + (this.t < 2 ? -0.1 * Math.sin(G.time * 20) : 0);
    this.zapT -= dt;
    if (this.zapT <= 0) {
      this.zapT = this.d.zap;
      let from = this.tip(new V3()), hit = new Set();
      for (let k = 0; k < this.d.chains; k++) {
        let best = null, bd = k === 0 ? this.d.R : 12;
        for (const e of G.enemies) { if (!e.alive || e.dying || !e.c || e.holo || e.cloaked || hit.has(e)) continue; const dd = e.c.distanceTo(from); if (dd < bd && clearLine(from, e.c)) { bd = dd; best = e; } }
        if (!best) break;
        hit.add(best); G.fx.lightning(from, best.c, 0x9ff6ff, k ? 0.3 : 0.45, 0.14, 2);
        dealDamage(best, this.d.dmg * this.mul * (k ? 0.7 : 1), 'P', best.c, 'rod'); G.fx.sparks(best.c, null, 8, 0x9ff6ff, 14, 1, 0.3, 0.24);
        from = best.c; G.rodZaps = (G.rodZaps || 0) + 1;
      }
      if (hit.size) sfx('coil', G.player.pos.distanceTo(this.pos));
    }
  }
}
export function clearRods() { for (const r of G.rods.slice()) r.end(); G.rods.length = 0; }
function updateRods(dt) { for (const r of G.rods.slice()) r.update(dt); }

// ---- Herald: a command walker that stays behind its escorts. Enemies within 24 m of it move x1.25 faster and hit x1.3 harder;
// every 9-12 s its war horn gives them 2.5 s of half damage from you. Kill it first.
export const HERALD = { hp: 1300, r: 2.8, walk: 6.5, R: 24, spd: 1.3, dmg: 1.3, horn: [7, 9], hornT: 2.5, hornK: 0.4, gunCd: [1.4, 2.0], gunDmg: 9, back: 18, min: 42 };
const hrGeo = new THREE.RingGeometry(HERALD.R - 0.5, HERALD.R, 72); hrGeo.rotateX(-Math.PI / 2);
export class Herald extends Enemy {
  constructor(pos) {
    super('herald', 'E_Herald', pos, HERALD.hp, HERALD.r); this.boom = 1.4;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.hornCd = 3 + Math.random() * 2; this.gunT = 2; this.c.set(pos.x, pos.y + 2.6, pos.z);
    this.aura = new THREE.Mesh(hrGeo, ringMat(0xff4030, 0.28)); G.scene.add(this.aura);
  }
  remove() { super.remove(); this.aura.parent && this.aura.parent.remove(this.aura); this.aura.material.dispose(); }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC);
    let cx = 0, cz = 0, n = 0;
    for (const e of G.enemies) { if (e === this || !e.alive || e.dying || !e.pos || e.kind === 'herald' || e.kind === 'boss' || e.holo || e.pos.distanceTo(this.pos) > 80) continue; cx += e.pos.x; cz += e.pos.z; n++; }
    let gx, gz;
    if (n) { cx /= n; cz /= n; const ax = cx - pc.x, az = cz - pc.z, al = Math.hypot(ax, az) || 1; gx = cx + ax / al * HERALD.back; gz = cz + az / al * HERALD.back; }
    else { const ax = this.pos.x - pc.x, az = this.pos.z - pc.z, al = Math.hypot(ax, az) || 1; gx = pc.x + ax / al * 50; gz = pc.z + az / al * 50; }
    { const ax = gx - pc.x, az = gz - pc.z, al = Math.hypot(ax, az) || 1; if (al < HERALD.min) { gx = pc.x + ax / al * HERALD.min; gz = pc.z + az / al * HERALD.min; } }
    gx = Math.max(-ARENA + 6, Math.min(ARENA - 6, gx)); gz = Math.max(-ARENA + 6, Math.min(ARENA - 6, gz));
    if (PLAT.R) { const d = Math.hypot(gx, gz), lim = PLAT.R - 6; if (d > lim) { gx *= lim / d; gz *= lim / d; } }
    const mx = gx - this.pos.x, mz = gz - this.pos.z, ml = Math.hypot(mx, mz) || 1, sp = HERALD.walk * Math.min(1, ml / 4);
    this.vel.x += (mx / ml * sp - this.vel.x) * (1 - Math.exp(-3 * dt)); this.vel.z += (mz / ml * sp - this.vel.z) * (1 - Math.exp(-3 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 2.6, 4)) blockedSlide(this);
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.8, 2);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    this.yaw += angDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 3);
    if (dist < 75 && this.checkLos(dt)) {
      this.gunT -= dt;
      if (this.gunT <= 0) {
        this.gunT = HERALD.gunCd[0] + Math.random() * (HERALD.gunCd[1] - HERALD.gunCd[0]);
        const m = this.n.Muzzle_HR, mp = m ? m.getWorldPosition(new V3()) : this.c.clone(), aim = lead(mp, 200, _b, tg);
        _d.subVectors(aim, mp).normalize(); spawnShot({ p: mp, v: _d.multiplyScalar(200), dmg: HERALD.gunDmg, team: 'E', kind: 'ebullet', color: 0xff5040, w: 0.24, len: 5, life: 0.8, label: 'herald-gun' });
        G.fx.muzzle(mp, _d, 0xff6040, 1); sfx('eshot', dist);
      }
    }
    this.hornCd -= dt;
    if (this.hornCd <= 0) {
      let k = 0; for (const e of G.enemies) if (e.rally && e.alive && !e.dying && e.pos && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < HERALD.R) { e.hornT = HERALD.hornT; k++; }
      if (k) {
        this.hornCd = HERALD.horn[0] + Math.random() * (HERALD.horn[1] - HERALD.horn[0]); G.horns = (G.horns || 0) + 1;
        G.fx.ring(new V3(this.pos.x, this.pos.y + 0.4, this.pos.z), null, 2, HERALD.R, 0.6, 0xff6040); sfx('horn', dist * 0.7);
        if (!G.hornHintSaid) { G.hornHintSaid = true; G.onHint && G.onHint('号令机吹响战号 · 红圈里的敌机 2.5 秒内只受一半伤害 · 先打掉号令机', 4); }
      } else this.hornCd = 2;
    }
    if (this.n.HR_Banner) this.n.HR_Banner.rotation.y = Math.sin(G.time * 2.1 + this.pos.x) * 0.35;
    this.aura.position.set(this.pos.x, this.pos.y + 0.2, this.pos.z); this.aura.material.opacity = 0.2 + 0.08 * Math.sin(G.time * 3);
    this.obj.rotation.y = this.yaw;
    this.c.set(this.pos.x, this.pos.y + 2.6, this.pos.z);
  }
}

// ---- Highway traffic: armoured trucks run down four lanes (two each way) and despawn past the edge. They are moving
// solids (they block shots and line of sight), and anything on the road in their way is run over and thrown.
export const TRAFFIC = { lanes: [[-10, 1, 21], [-3.5, 1, 26], [3.5, -1, 26], [10, -1, 21]], gap: [2.2, 5.0], first: 3, L: 12.6, W: 3.3, H: 4.2, dmg: 44, edmg: 220, bossDmg: 120, fling: 0.75, up: 9, end: 30 };
export function startTraffic() {
  G.traffic = { trucks: [], lanes: TRAFFIC.lanes.map(([z, dir, v], i) => ({ z, dir, v, t: TRAFFIC.first + i * 0.9 + Math.random() * 2 })) };
}
export function clearTraffic() {
  const T = G.traffic; if (!T) return;
  for (const k of T.trucks) { k.obj.parent && k.obj.parent.remove(k.obj); removeSolid(k.solid); }
  G.traffic = null;
}
export function laneOf(z) { for (const [lz] of TRAFFIC.lanes) if (Math.abs(z - lz) < 2.6) return lz; return null; }
function updateTraffic(dt) {
  const T = G.traffic, P = G.player; if (!T) return;
  const X = ARENA + TRAFFIC.end;
  for (const ln of T.lanes) {
    ln.t -= dt; if (ln.t > 0) continue;
    const x0 = -ln.dir * X;
    if (T.trucks.some((k) => k.lane === ln && Math.abs(k.x - x0) < 24)) { ln.t = 0.5; continue; }
    ln.t = TRAFFIC.gap[0] + Math.random() * (TRAFFIC.gap[1] - TRAFFIC.gap[0]);
    const obj = cloneKit('P_Truck'); obj.rotation.y = ln.dir > 0 ? -Math.PI / 2 : Math.PI / 2; obj.position.set(x0, 0, ln.z); G.scene.add(obj);
    const solid = addSolid(x0, ln.z, TRAFFIC.L, TRAFFIC.W, TRAFFIC.H, 0, 'truck');
    T.trucks.push({ obj, solid, lane: ln, x: x0, v: ln.v * (0.92 + Math.random() * 0.16), hitP: 0, hits: new Set(), honk: false });
    G.trucks = (G.trucks || 0) + 1;
  }
  for (let i = T.trucks.length - 1; i >= 0; i--) {
    const k = T.trucks[i], ln = k.lane;
    k.x += ln.dir * k.v * dt; k.obj.position.x = k.x;
    const hl = TRAFFIC.L / 2, hw = TRAFFIC.W / 2;
    k.solid.min.set(k.x - hl, 0, ln.z - hw); k.solid.max.set(k.x + hl, TRAFFIC.H, ln.z + hw);
    if (Math.abs(k.x) > X + 2) { k.obj.parent && k.obj.parent.remove(k.obj); removeSolid(k.solid); T.trucks.splice(i, 1); continue; }
    const front = k.x + ln.dir * hl;
    if (P && P.alive) {
      const ahead = (P.pos.x - front) * ln.dir;
      if (!k.honk && ahead > 0 && ahead < 40 && Math.abs(P.pos.z - ln.z) < 3.5 && P.pos.y < TRAFFIC.H + 1) { k.honk = true; sfx('horn', ahead * 0.5); }
      k.hitP -= dt;
      const r = P.radius || 1.6;
      if (k.hitP <= 0 && Math.abs(P.pos.x - k.x) < hl + r && Math.abs(P.pos.z - ln.z) < hw + r && P.pos.y < TRAFFIC.H + 0.3 && !(G.blinkInv > 0)) {
        k.hitP = 1.2; G.curLabel = 'truck'; hurtPlayer(TRAFFIC.dmg, 'truck'); G.truckHits = (G.truckHits || 0) + 1;
        const side = Math.sign(P.pos.z - ln.z) || 1;
        P.pos.z = ln.z + side * (hw + r + 0.2); P.vel.x = ln.dir * k.v * TRAFFIC.fling; P.vel.z = side * 8; P.vel.y = TRAFFIC.up; P.grounded = false;
        G.fx.sparks(P.center(new V3()), null, 20, 0xffd090, 18, 1, 0.35, 0.25); G.fx.trauma = Math.min(1, G.fx.trauma + 0.6); sfx('boom', 0);
      }
    }
    for (const e of G.enemies) {
      if (!e.alive || e.dying || !e.pos || e.holo || k.hits.has(e) || e.isTrain || e.isColossus || e.kind === 'leech') continue;
      const r = e.r || 2;
      if (Math.abs(e.pos.x - k.x) > hl + r || Math.abs(e.pos.z - ln.z) > hw + r) continue;
      if (e.pos.y - groundAt(e.pos.x, e.pos.z, e.pos.y + 1) > 1.5) continue;   // flying or on a roof
      k.hits.add(e);
      const side = Math.sign(e.pos.z - ln.z) || 1; e.pos.z = ln.z + side * (hw + r + 0.3);
      const boss = e.kind === 'boss';
      e.hit(boss ? TRAFFIC.bossDmg : TRAFFIC.edmg, e.c, 'truck'); G.truckE = (G.truckE || 0) + 1;
      if (!e.alive) { G.roadkill = (G.roadkill || 0) + 1; G.onTally && G.onTally('roadkill'); }
      if (e.vel) { e.vel.x = ln.dir * 10; e.vel.z = side * 6; }
      G.fx.sparks(e.c, null, 16, 0xffd090, 16, 1, 0.3, 0.25); sfx('boom', P ? P.pos.distanceTo(e.pos) : 40);
    }
  }
}
export function truckAhead(x, z, y, within) {   // the nearest truck about to reach (x, z) on its lane, as seconds to impact
  const T = G.traffic; if (!T || y > TRAFFIC.H + 0.5) return null;
  let best = null;
  for (const k of T.trucks) {
    if (Math.abs(z - k.lane.z) > TRAFFIC.W / 2 + 2.2) continue;
    const ahead = (x - (k.x + k.lane.dir * TRAFFIC.L / 2)) * k.lane.dir; if (ahead < -TRAFFIC.L - 2) continue;
    const t = Math.max(0, ahead) / k.v; if (t < within && (!best || t < best.t)) best = { k, t };
  }
  return best;
}

// ---- Leech: a fast parasite drone that latches onto your back (up to three at once), drains 22 energy per second and
// nibbles 5 AP per second. A quick boost (needs 18 EN) shakes them all off and stuns them; then they come back.
export const LEECH = { hp: 120, r: 1.1, speed: 26, latch: 3.0, drain: 22, bite: 5, max: 3, shake: 2.0, relatch: 3, knock: 60 };
export class Leech extends Enemy {
  constructor(pos) {
    super('leech', 'E_Leech', pos, LEECH.hp, LEECH.r); this.boom = 0.5;
    this.pos.y = groundAt(pos.x, pos.z, 40) + 8; this.vel = new V3(); this.st = 'fly'; this.stT = 0; this.ph = Math.random() * 6.28; this.slot = -1; this.noLatch = 1; this.latchDmg = 0;
    this.c.copy(this.pos); this.yaw = 0;
  }
  explode() { G.fx.explosion(this.c, 0.35, 0x90ff30); sfx('boom', G.player ? G.player.pos.distanceTo(this.c) : 40); this.detach(false); this.remove(); }
  hit(dmg, at, label) {
    if (!this.alive || this.dying) return;
    if (this.st === 'on') { this.latchDmg += dmg; if (this.latchDmg >= LEECH.knock) this.detach(true); }
    super.hit(dmg);
  }
  detach(fling) {
    if (this.st !== 'on') return;
    G.leechOn = Math.max(0, (G.leechOn || 0) - 1); this.slot = -1; this.latchDmg = 0;
    if (fling) {
      const P = G.player, a = P.aimYaw; this.st = 'stun'; this.stT = LEECH.shake; this.noLatch = LEECH.relatch + LEECH.shake;
      this.vel.set(Math.sin(a) * 9 + (Math.random() - 0.5) * 6, 6, Math.cos(a) * 9 + (Math.random() - 0.5) * 6);
    } else this.st = 'fly';
  }
  update(dt) {
    const P = G.player; this.ph += dt * 2.2; this.noLatch -= dt;
    if (this.st === 'on') {
      if (!P.alive) { this.detach(false); return; }
      if (P.qbT > 0) { this.detach(true); G.leechShaken = (G.leechShaken || 0) + 1; G.fx.sparks(this.c, null, 10, 0x90ff30, 12, 1, 0.3, 0.22); return; }
      const a = P.aimYaw, bx = Math.sin(a), bz = Math.cos(a), sx = Math.cos(a), sz = -Math.sin(a), off = (this.slot - 1) * 0.95;
      this.pos.set(P.pos.x + bx * 1.3 + sx * off, P.pos.y + 4.3 + this.slot * 0.35, P.pos.z + bz * 1.3 + sz * off);
      this.yaw = a + Math.PI; this.obj.rotation.set(0.9, this.yaw, 0);
      P.en = Math.max(0, P.en - LEECH.drain * dt); P.drainT = 0;
      G.curLabel = 'leech'; hurtPlayer(LEECH.bite * dt, 'leech'); G.leechT = (G.leechT || 0) + dt / Math.max(1, G.leechOn || 1);
      if (Math.random() < 0.15) G.fx.sparks(this.c, null, 1, 0x90ff30, 4, 0.8, 0.3, 0.18);
    } else if (this.st === 'stun') {
      this.stT -= dt; this.vel.y -= 14 * dt; this.pos.addScaledVector(this.vel, dt); this.vel.multiplyScalar(Math.exp(-1.2 * dt));
      const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1); if (this.pos.y < gy + 0.6) { this.pos.y = gy + 0.6; this.vel.set(0, 0, 0); }
      this.obj.rotation.x += dt * 9; if (this.stT <= 0) { this.st = 'fly'; this.obj.rotation.set(0, this.yaw, 0); }
    } else {
      const tc = P.center(playerC);
      const dd = this.pos.distanceTo(tc), wv = Math.min(1, dd / 30) * 9; if (this.noLatch <= 0 && dd < 12) _a.copy(tc); else _a.set(tc.x + Math.sin(this.ph) * (4 + wv), tc.y + 2 + Math.sin(this.ph * 1.7) * (1.5 + wv * 0.5), tc.z + Math.cos(this.ph) * (4 + wv));
      _b.subVectors(_a, this.pos); const L = _b.length() || 1;
      _b.multiplyScalar(LEECH.speed * Math.min(1, L / 6) / L);
      this.vel.lerp(_b, 1 - Math.exp(-2.5 * dt)); this.pos.addScaledVector(this.vel, dt);
      if (collideCyl(this.pos, 0.8, 1)) this.vel.y += 6 * dt;
      const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1); if (this.pos.y < gy + 1.5) this.pos.y = gy + 1.5;
      this.yaw += angDiff(Math.atan2(-this.vel.x, -this.vel.z), this.yaw) * Math.min(1, dt * 6); this.obj.rotation.set(0, this.yaw, 0);
      if (P.alive && this.noLatch <= 0 && (G.leechOn || 0) < LEECH.max && this.pos.distanceTo(tc) < LEECH.latch && !(G.blinkInv > 0)) {
        const used = new Set(G.enemies.filter((e) => e.kind === 'leech' && e.st === 'on').map((e) => e.slot));
        for (let s = 0; s < LEECH.max; s++) if (!used.has(s)) { this.slot = s; break; }
        this.st = 'on'; G.leechOn = (G.leechOn || 0) + 1; G.leechLatch = (G.leechLatch || 0) + 1; sfx('hook', 0);
        G.onLeech && G.onLeech();
      }
    }
    const cl = Math.sin(G.time * (this.st === 'on' ? 14 : 6) + this.ph) * 0.3;
    for (let i = 1; i <= 4; i++) { const n = this.n['LC_Claw' + i]; if (n) n.rotation.y = (i % 2 ? 1 : -1) * cl; }
    this.c.copy(this.pos);
  }
}

// ---- AC-2 acid sprayer: arcing globs that splash 3 m and corrode what they hit (+7 % damage taken per stack, up to 5)
export const CORR = { grav: 14, R: 3, splash: 0.5, per: 0.07, max: 5, T: 4 };
function corrode(e) {
  const h = e.kind === 'cpart' ? e.owner : e; if (!h || !h.alive || h.isBarrel || h.isPlayer || h.isMine || h.isAlly) return;
  h.corr = Math.min(CORR.max, (h.corr || 0) + 1); h.corrT = CORR.T; G.corrStacks = (G.corrStacks || 0) + 1;
}
function acidSplash(ent, at, dmg) {
  if (ent) corrode(ent);
  for (const e of entsFor('P')) {
    if (e === ent || !e.alive || e.isBarrel || e.isMine || !e.c || e.c.distanceTo(at) > CORR.R + (e.r || 1) * 0.5) continue;
    dealDamage(e, dmg * CORR.splash, 'P', e.c, 'acid'); corrode(e);
  }
  G.fx.sparks(at, null, 10, 0x90ff30, 9, 0.9, 0.35, 0.24);
  G.fx.emit('add', { x: at.x, y: at.y, z: at.z, vy: 0.6, life: 0.35, s0: 1.6, s1: 2.8, c0: 0xa0ff40, c1: 0x306010 });
}



// ---- Supply drops: every 16-20 s a crate parachutes down 30-75 m from you (gold ring where it will land, 6 s fall).
// You grab it by touching it: a repair, overdrive charge or a 15 s damage boost. An enemy that reaches it first is
// EMPOWERED: x1.5 max HP (fully healed), x1.4 damage, bigger, with a gold ring. Crates vanish 25 s after landing.
export const SUPPLY = { first: 12, every: [16, 20], fall: 6, h: 70, R: 4.2, life: 25, near: [30, 75], repair: 0.35, od: 0.5, dmg: 1.3, dmgT: 15, empHp: 1.5, empDmg: 1.4, claim: 3 };
const supRingGeo = new THREE.RingGeometry(SUPPLY.R - 0.5, SUPPLY.R, 40).rotateX(-Math.PI / 2);
const empRingGeo = new THREE.RingGeometry(2.4, 2.9, 32).rotateX(-Math.PI / 2);
export function startSupply() { clearSupply(); G.supply = { t: SUPPLY.first, crates: [] }; }
export function clearSupply() { const S = G.supply; if (!S) return; for (const c of S.crates.slice()) removeCrate(c); G.supply = null; }
function removeCrate(c) {
  c.obj.parent && c.obj.parent.remove(c.obj); c.ring.parent && c.ring.parent.remove(c.ring); c.ring.material.dispose();
  const S = G.supply; if (S) { const i = S.crates.indexOf(c); if (i >= 0) S.crates.splice(i, 1); }
  for (const e of G.enemies) if (e.goalCrate === c) { e.goalP = null; e.goalCrate = null; }
  c.gone = true;
}
function supplySpot() {
  const P = G.player;
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2, r = SUPPLY.near[0] + Math.random() * (SUPPLY.near[1] - SUPPLY.near[0]);
    const x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
    if (Math.abs(x) > ARENA - 12 || Math.abs(z) > ARENA - 12) continue;
    if (PLAT.R && Math.hypot(x, z) > PLAT.R - 14) continue;
    if (groundAt(x, z, 60) > 0.6 || collideCyl(new V3(x, 0.5, z), 3.5, 3)) continue;
    return { x, z };
  }
  return null;
}
export function empower(e) {
  if (!e || !e.alive || e.emp) return;
  e.emp = true; e.maxHp *= SUPPLY.empHp; e.hp = e.maxHp;
  const root = e.obj || (e.mech && e.mech.root) || (e.mech && e.mech.group);
  if (root) { root.scale.multiplyScalar(1.2); const ring = new THREE.Mesh(empRingGeo, ringMat(0xffc040, 0.7)); ring.position.y = 0.25 / root.scale.y; root.add(ring); e.empRing = ring; }
  G.fx.ring(e.c.clone(), null, 2, 9, 0.5, 0xffc040); G.fx.sparks(e.c, null, 24, 0xffd060, 14, 1, 0.4, 0.3);
  G.empowered = (G.empowered || 0) + 1; G.onEmpower && G.onEmpower(e);
}
function grabCrate(c) {
  const P = G.player, kinds = ['repair', 'od', 'dmg'];
  let k = kinds[Math.floor(Math.random() * 3)];
  if (k === 'repair' && P.hp > P.maxHp * 0.85) k = Math.random() < 0.5 ? 'od' : 'dmg';
  if (k === 'od' && G.od && G.od.t > 0) k = 'dmg';
  if (k === 'repair') P.hp = Math.min(P.maxHp, P.hp + P.maxHp * SUPPLY.repair);
  else if (k === 'od') { if (G.od) G.od.k = Math.min(1, G.od.k + SUPPLY.od); }
  else G.pBoostT = SUPPLY.dmgT;
  G.cratesP = (G.cratesP || 0) + 1; G.onTally && G.onTally('crate'); G.onCrate && G.onCrate(k);
  G.fx.ring(c.obj.position.clone(), null, 1, 7, 0.4, 0xffc040); sfx('repair', 0);
  removeCrate(c);
}
const groundKinds = (e) => e.alive && !e.dying && e.pos && !e.emp && !e.holo && e.kind !== 'boss' && e.kind !== 'raider' && e.kind !== 'snatcher' && e.kind !== 'cpart' && !e.isTrain && !e.isColossus && e.pos.y - groundAt(e.pos.x, e.pos.z, e.pos.y + 1) < 2.5;
function updateSupply(dt) {
  const S = G.supply; if (G.pBoostT > 0) G.pBoostT -= dt; if (!S) return;
  const P = G.player;
  S.t -= dt;
  if (S.t <= 0 && P && P.alive) {
    S.t = SUPPLY.every[0] + Math.random() * (SUPPLY.every[1] - SUPPLY.every[0]);
    const sp = supplySpot();
    if (sp) {
      const obj = cloneKit('P_Supply'); obj.position.set(sp.x, SUPPLY.h, sp.z); obj.rotation.y = Math.random() * 6.28; G.scene.add(obj);
      const ring = new THREE.Mesh(supRingGeo, ringMat(0xffc040, 0.55)); ring.position.set(sp.x, 0.15, sp.z); G.scene.add(ring);
      const n = nodes(obj);
      S.crates.push({ obj, ring, chute: n.SP_Chute, st: 'fall', life: SUPPLY.life, x: sp.x, z: sp.z, carrier: null, ph: Math.random() * 6 });
      G.crates = (G.crates || 0) + 1; G.onSupply && G.onSupply(sp);
    }
  }
  for (const c of S.crates.slice()) {
    c.ph += dt;
    if (c.st === 'fall') {
      c.obj.position.y -= SUPPLY.h / SUPPLY.fall * dt;
      if (c.chute) { c.chute.rotation.x = Math.sin(c.ph * 1.3) * 0.08; c.chute.rotation.y = Math.sin(c.ph * 0.9) * 0.08; }
      c.ring.material.opacity = 0.35 + 0.25 * Math.sin(c.ph * 6);
      if (c.obj.position.y <= 0) {
        c.obj.position.y = 0; c.st = 'ground'; if (c.chute) c.chute.visible = false;
        G.fx.sparks(c.obj.position.clone().setY(0.5), null, 14, 0xd8c8a0, 10, 1, 0.4, 0.3);
        const cand = G.enemies.filter(groundKinds).filter((e) => !e.goalCrate && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 90).sort((a, b) => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) - Math.hypot(b.pos.x - c.x, b.pos.z - c.z));
        for (const e of cand.slice(0, SUPPLY.claim)) { e.goalP = new V3(c.x, 0, c.z); e.goalR = 1.5; e.goalCrate = c; }
      }
    } else if (c.st === 'ground') {
      c.life -= dt; c.ring.material.opacity = 0.55;
      c.obj.rotation.y += dt * 0.3;
      if (c.life <= 0) { G.fx.ring(c.obj.position.clone(), null, 1, 5, 0.3, 0x888888); removeCrate(c); continue; }
      if (P && P.alive && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < SUPPLY.R && P.pos.y - c.obj.position.y < 6) { grabCrate(c); continue; }
      for (const e of G.enemies) { if (!groundKinds(e) || Math.hypot(e.pos.x - c.x, e.pos.z - c.z) > SUPPLY.R) continue; empower(e); G.cratesE = (G.cratesE || 0) + 1; removeCrate(c); break; }
    } else if (c.st === 'carried') {
      const k = c.carrier;
      if (!k || !k.alive) { c.st = 'ground'; c.carrier = null; c.obj.position.y = 0; c.life = 15; c.x = c.obj.position.x; c.z = c.obj.position.z; c.ring.position.set(c.x, 0.15, c.z); c.ring.visible = true; continue; }
      c.obj.position.set(k.pos.x, k.pos.y - 2.0, k.pos.z); c.obj.rotation.y = k.yaw;
    }
  }
}
export function nearestCrate(x, z, maxD) {
  const S = G.supply; if (!S) return null; let best = null, bd = maxD;
  for (const c of S.crates) { if (c.st === 'carried') continue; if (c.st === 'fall' && c.obj.position.y > 30) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
  return best;
}

// ---- Snatcher: a fast hover bike that races to supply crates, grabs them with its claw and carries them to an ally,
// which it empowers (or itself, with nobody around). Without a crate it makes 30 m/s drive-by runs past you, firing a
// five-pellet burst when you are ahead of it. Kill it to drop the crate.
export const SNATCH = { hp: 380, r: 1.6, speed: 30, hover: 1.8, carryH: 3.6, gunR: 26, pellets: 5, pDmg: 4.5, gunCd: 0.9, hand: 5 };
export class Snatcher extends Enemy {
  constructor(pos) {
    super('snatcher', 'E_Snatcher', pos, SNATCH.hp, SNATCH.r); this.boom = 0.9;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.carry = null; this.runP = null; this.runT = 0; this.gunT = 1.5; this.side = Math.random() < 0.5 ? 1 : -1; this.bank = 0;
    this.pos.y = groundAt(pos.x, pos.z, 40) + SNATCH.hover; this.c.copy(this.pos);
  }
  explode() {
    if (this.carry) { const c = this.carry; c.carrier = null; this.carry = null; }
    super.explode();
  }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC);
    let goal = null;
    if (this.carry) {
      let ally = null, bd = 150;
      for (const e of G.enemies) { if (e === this || !groundKinds(e)) continue; const d = e.pos.distanceTo(this.pos); if (d < bd) { bd = d; ally = e; } }
      if (ally) goal = ally.pos;
      if (!ally || bd < SNATCH.hand) { const c = this.carry; this.carry = null; empower(ally || this); G.snatchDeliver = (G.snatchDeliver || 0) + 1; removeCrate(c); }
    } else {
      const c = nearestCrate(this.pos.x, this.pos.z, 160);
      if (c && !c.carrier) {
        goal = this.cg || (this.cg = new V3()); goal.set(c.x, 0, c.z);
        if (c.st === 'ground' && Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 3.2) { c.st = 'carried'; c.carrier = this; c.ring.visible = false; this.carry = c; G.snatched = (G.snatched || 0) + 1; G.onSnatch && G.onSnatch(this); sfx('hook', G.player ? G.player.pos.distanceTo(this.pos) : 40); }
      }
    }
    if (!goal) {
      this.runT -= dt;
      if (!this.runP || this.runT <= 0 || Math.hypot(this.runP.x - this.pos.x, this.runP.z - this.pos.z) < 6) {
        const ax = pc.x - this.pos.x, az = pc.z - this.pos.z, al = Math.hypot(ax, az) || 1; this.side *= -1;
        const x = pc.x + ax / al * 34 - az / al * 9 * this.side, z = pc.z + az / al * 34 + ax / al * 9 * this.side;
        this.runP = new V3(Math.max(-ARENA + 10, Math.min(ARENA - 10, x)), 0, Math.max(-ARENA + 10, Math.min(ARENA - 10, z))); this.runT = 6;
      }
      goal = this.runP;
    }
    const gx = goal.x - this.pos.x, gz = goal.z - this.pos.z, gl = Math.hypot(gx, gz) || 1;
    const sp = SNATCH.speed * (this.carry ? 0.8 : 1) * Math.min(1, gl / 8 + 0.35);
    const k = 1 - Math.exp(-2.2 * dt), ovx = this.vel.x, ovz = this.vel.z;
    this.vel.x += (gx / gl * sp - this.vel.x) * k; this.vel.z += (gz / gl * sp - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 1.6, 2)) { this.pos.x -= this.vel.x * dt; this.pos.z -= this.vel.z * dt; this.vel.multiplyScalar(-0.4); this.runP = null; }
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) + (this.carry ? SNATCH.carryH : SNATCH.hover) + Math.sin(G.time * 3 + this.side) * 0.15;
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-6 * dt));
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > 1) { const ny = Math.atan2(-this.vel.x, -this.vel.z), turn = angDiff(ny, this.yaw); this.yaw += turn * Math.min(1, dt * 6); this.bank += (Math.max(-0.6, Math.min(0.6, -turn * 2)) - this.bank) * Math.min(1, dt * 4); }
    this.obj.rotation.set(0, this.yaw, this.bank, 'YXZ');
    if (this.n.SN_Claw) this.n.SN_Claw.rotation.x = this.carry ? 0 : Math.sin(G.time * 5) * 0.15;
    this.c.copy(this.pos);
    this.gunT -= dt;
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1, fwx = -Math.sin(this.yaw), fwz = -Math.cos(this.yaw);
    if (this.gunT <= 0 && dist < SNATCH.gunR && (dx * fwx + dz * fwz) / dist > 0.55 && this.checkLos(dt)) {
      this.gunT = SNATCH.gunCd;
      const m = this.n.Muzzle_SN, mp = m ? m.getWorldPosition(new V3()) : this.c.clone(), aim = lead(mp, 160, _b, tg);
      for (let i = 0; i < SNATCH.pellets; i++) {
        _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.12; _d.y += (Math.random() - 0.5) * 0.08; _d.z += (Math.random() - 0.5) * 0.12; _d.normalize();
        spawnShot({ p: mp, v: _d.clone().multiplyScalar(160), dmg: SNATCH.pDmg, team: 'E', kind: 'ebullet', color: 0xffa040, w: 0.18, len: 3, life: 0.4, label: 'snatcher-gun' });
      }
      sfx('eshot', dist);
    }
  }
}

// ---- GP-2 ground pound: in the air, slam straight down at 70 m/s; on the ground, hop first. The landing shockwave
// grows with the fall (20 m: about 190 damage over 11 m) and stuns; you take half damage during the dive.
function startPound(o, d, mul) {
  const h = o.pos.y - groundAt(o.pos.x, o.pos.z, o.pos.y + 1);
  if (h < 3) { o.vel.y = d.hop; o.grounded = false; G.pound = { st: 'hop', t: d.hopT, d, mul }; }
  else poundDive(o, d, mul);
  sfx('qboost', 0);
}
function poundDive(o, d, mul) { G.pound = { st: 'dive', d, mul, y0: o.pos.y, t: 0 }; o.vel.x *= 0.25; o.vel.z *= 0.25; o.vel.y = -d.dive; sfx('jetdive', 0); }
function updatePound(dt) {
  const Pd = G.pound, P = G.player; if (!Pd) return;
  if (!P || !P.alive) { G.pound = null; return; }
  if (Pd.st === 'hop') { Pd.t -= dt; if (Pd.t <= 0) poundDive(P, Pd.d, Pd.mul); return; }
  Pd.t += dt; P.vel.y = Math.min(P.vel.y, -Pd.d.dive); P.vel.x *= Math.exp(-3 * dt); P.vel.z *= Math.exp(-3 * dt);
  if (Math.random() < 0.8) G.fx.emit('add', { x: P.pos.x, y: P.pos.y + 3, z: P.pos.z, vy: 4, life: 0.25, s0: 2.2, s1: 0.4, c0: 0x80c8ff, c1: 0x204060 });
  const gy = groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
  if (P.grounded || P.pos.y - gy < 0.4 || Pd.t > 3) {
    const d = Pd.d, h = Math.min(d.hMax, Math.max(0, Pd.y0 - P.pos.y)), R = d.r0 + h * d.rPer, dmg = (d.base + h * d.per) * Pd.mul;
    const at = new V3(P.pos.x, gy + 0.3, P.pos.z); let n = 0;
    for (const e of entsFor('P')) {
      if (!e.alive || !e.c || e.isPlayer || e.isAlly) continue;
      const dx = e.c.x - at.x, dz = e.c.z - at.z, dl = Math.hypot(dx, dz);
      if (dl > R + (e.r || 1) * 0.5 || e.c.y - at.y > R * 0.7 + 2) continue;
      dealDamage(e, dmg * (1 - 0.4 * Math.min(1, dl / R)), 'P', e.c, 'p-pound'); n++;
      const host = e.kind === 'cpart' ? e.owner : e;
      if (host && host.alive && !host.isBarrel && !host.isMine) {
        host.stunT = Math.max(host.stunT || 0, host.maxHp > 3000 ? d.stun * 0.3 : d.stun); host.stunMax = host.stunT;
        if (host.vel && host.maxHp < 3000 && dl > 0.1) { host.vel.x += dx / dl * d.knock; host.vel.z += dz / dl * d.knock; }
      }
    }
    G.fx.ring(at, null, 1, R, 0.45, 0x80c8ff); G.fx.ring(at, null, 1, R * 0.6, 0.3, 0xe0f4ff); G.fx.sparks(at, null, 30, 0xc8e0ff, 18, 1, 0.45, 0.3);
    G.fx.emit('add', { x: at.x, y: at.y + 0.5, z: at.z, vy: 1, life: 0.5, s0: R * 0.6, s1: R * 1.4, c0: 0xc0d8f0, c1: 0x404858 });
    G.fx.trauma = Math.min(1, G.fx.trauma + 0.3 + h * 0.012); sfx('boom', 0);
    G.pounds = (G.pounds || 0) + 1; G.poundHits = (G.poundHits || 0) + n; G.poundMaxH = Math.max(G.poundMaxH || 0, h);
    G.pound = null;
  }
}

// ---- Rift gates: three linked pairs of portals. Any mech (you or an enemy) or any shot that flies into a gate comes
// out of its twin, still moving, turned by the difference in the two gates' facing. Every 32 s the gates flicker for
// 3 s and jump to new spots; every 20 s one of them spits out reinforcements (G.onRiftSpawn).
export const RIFT = { pairs: 3, R: 3.0, cd: 1.4, move: 32, warn: 3, spawn: 20, out: 4.6, cols: [0x60e0ff, 0xff60d0, 0xffb040] };
const riftTex = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 3;
  for (let k = 0; k < 4; k++) { x.beginPath(); for (let t = 0; t < 1; t += 0.02) { const a = t * 7 + k * Math.PI / 2, r = t * 60; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } x.stroke(); }
  return new THREE.CanvasTexture(c);
})();
const riftGeo = new THREE.CircleGeometry(RIFT.R + 0.15, 40);
function riftSpot(taken) {
  for (let i = 0; i < 400; i++) {
    const x = (Math.random() * 2 - 1) * (ARENA - 22), z = (Math.random() * 2 - 1) * (ARENA - 22);
    if (PLAT.R && Math.hypot(x, z) > PLAT.R - 20) continue;
    if (groundAt(x, z, 40) > 0.6) continue;
    if (collideCyl(new V3(x, 0.5, z), 5, 7)) continue;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 38)) continue;
    if (G.player && Math.hypot(G.player.pos.x - x, G.player.pos.z - z) < 10) continue;
    return { x, z };
  }
  return { x: (Math.random() - 0.5) * 60, z: (Math.random() - 0.5) * 60 };
}
function placeRifts() {
  const R = G.rift, taken = [];
  for (const g of R.gates) { const p = riftSpot(taken); taken.push(p); g.x = p.x; g.z = p.z; g.yaw = Math.random() * Math.PI * 2; g.obj.position.set(p.x, 0, p.z); g.obj.rotation.y = g.yaw; g.c.set(p.x, 4, p.z); g.n.set(Math.sin(g.yaw), 0, Math.cos(g.yaw)); }
}
export function startRifts() {
  clearRifts();
  const R = G.rift = { gates: [], t: RIFT.move, warn: 0, spawnT: 12 };
  for (let i = 0; i < RIFT.pairs * 2; i++) {
    const obj = cloneKit('P_Rift'); G.scene.add(obj);
    const col = RIFT.cols[i >> 1];
    const disc = new THREE.Mesh(riftGeo, new THREE.MeshBasicMaterial({ map: riftTex, color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    disc.position.set(0, 4, 0); obj.add(disc);
    R.gates.push({ obj, disc, col, pair: i >> 1, x: 0, z: 0, yaw: 0, c: new V3(), n: new V3() });
  }
  for (let i = 0; i < R.gates.length; i++) R.gates[i].twin = R.gates[i ^ 1];
  placeRifts();
}
export function clearRifts() {
  const R = G.rift; if (!R) return;
  for (const g of R.gates) { g.obj.parent && g.obj.parent.remove(g.obj); g.disc.material.dispose(); }
  G.rift = null;
}
const _ry = new V3(0, 1, 0);
function riftGo(g, v) {   // rotation that maps motion into gate g onto motion out of its twin
  return g.twin.yaw - g.yaw + Math.PI;
}
function riftMech(m, isP) {
  const R = G.rift, c = isP ? m.center(_c) : m.c; if (!c) return;
  for (const g of R.gates) {
    if (c.distanceTo(g.c) > RIFT.R) continue;
    const t = g.twin, dy = riftGo(g), v = isP ? m.vel : m.vel;
    let dx = 0, dz = 0;
    if (v) { _a.set(v.x, 0, v.z).applyAxisAngle(_ry, dy); const l = Math.hypot(_a.x, _a.z); if (l > 0.5) { dx = _a.x / l; dz = _a.z / l; } if (isP || m.vel) v.applyAxisAngle(_ry, dy); }
    if (!dx && !dz) { const side = Math.sign(_a.subVectors(c, g.c).dot(g.n)) || 1; dx = -t.n.x * side; dz = -t.n.z * side; }
    const off = c.y - m.pos.y;
    m.pos.set(t.c.x + dx * RIFT.out, Math.max(groundAt(t.c.x + dx * RIFT.out, t.c.z + dz * RIFT.out, t.c.y + 2), t.c.y - off), t.c.z + dz * RIFT.out);
    if (isP) { m.aimYaw += dy; G.camYawKick = (G.camYawKick || 0) + dy; } else if (m.yaw !== undefined) m.yaw += dy;
    if (!isP) m.c.set(m.pos.x, m.pos.y + off, m.pos.z);
    m.riftCd = RIFT.cd;
    G.fx.ring(new V3(g.c.x, g.c.y, g.c.z), g.n, 1, 5, 0.4, g.col); G.fx.ring(new V3(t.c.x, t.c.y, t.c.z), t.n, 1, 5, 0.4, t.col);
    sfx('blink', isP ? 0 : (G.player ? G.player.pos.distanceTo(t.c) : 40));
    if (isP) { G.riftP = (G.riftP || 0) + 1; G.onTally && G.onTally('rift'); G.onRift && G.onRift(); } else G.riftE = (G.riftE || 0) + 1;
    return;
  }
}
function riftShot(s) {
  const R = G.rift; if (!R || s.riftCd > s.age) return;
  for (const g of R.gates) {
    _c.set(s.x, s.y, s.z); if (_c.distanceTo(g.c) > RIFT.R) continue;
    const t = g.twin, dy = riftGo(g);
    _a.subVectors(_c, g.c).applyAxisAngle(_ry, dy); s.v.applyAxisAngle(_ry, dy);
    _b.copy(s.v).normalize();
    s.x = t.c.x + _a.x * 0.6 + _b.x * (RIFT.R + 0.6); s.y = t.c.y + _a.y * 0.6 + _b.y * (RIFT.R + 0.6); s.z = t.c.z + _a.z * 0.6 + _b.z * (RIFT.R + 0.6);
    if (s.aim) s.aim.copy(_c.set(s.x, s.y, s.z).addScaledVector(_b, 60));
    s.riftCd = s.age + 0.25; s.life += 0.15;
    if (s.team === 'P') G.riftShots = (G.riftShots || 0) + 1;
    return;
  }
}
function updateRifts(dt) {
  const R = G.rift; if (!R) return;
  R.t -= dt;
  const warn = R.t < RIFT.warn;
  if (R.t <= 0) { R.t = RIFT.move; placeRifts(); G.onRiftMove && G.onRiftMove(); }
  for (const g of R.gates) {
    g.disc.rotation.z -= dt * 2.4;
    g.disc.material.opacity = warn ? (Math.sin(G.time * 22) > 0 ? 0.85 : 0.15) : 0.7 + 0.15 * Math.sin(G.time * 3 + g.pair);
    const k = 1 + 0.04 * Math.sin(G.time * 5 + g.pair * 2); g.disc.scale.set(k, k, 1);
  }
  const P = G.player;
  if (P && P.alive) { P.riftCd = (P.riftCd || 0) - dt; if (P.riftCd <= 0) riftMech(P, true); }
  for (const e of G.enemies) {
    if (!e.alive || e.dying || !e.pos || !e.c || e.holo || e.isTrain || e.isColossus || e.kind === 'boss' || e.kind === 'cpart' || e.kind === 'leviathan' || (e.kind === 'leech' && e.st === 'on')) continue;
    e.riftCd = (e.riftCd || 0) - dt; if (e.riftCd <= 0) riftMech(e, false);
  }
  R.spawnT -= dt;
  if (R.spawnT <= 0) {
    R.spawnT = RIFT.spawn;
    if (G.onRiftSpawn && G.enemies.filter((e) => e.alive).length < 14) {
      const g = R.gates[Math.floor(Math.random() * R.gates.length)];
      G.fx.ring(g.c.clone(), g.n, 1.5, 9, 0.7, g.col); sfx('blink', P ? P.pos.distanceTo(g.c) : 40);
      G.onRiftSpawn(new V3(g.c.x + g.n.x * 6, 0, g.c.z + g.n.z * 6));
    }
  }
}
export function nearestRift(x, z) {
  const R = G.rift; if (!R) return null;
  let best = null, bd = 1e9; for (const g of R.gates) { const d = Math.hypot(g.x - x, g.z - z); if (d < bd) { bd = d; best = g; } }
  return best && { g: best, d: bd };
}

// ---- Fog harbour: thick fog; the radar only shows enemies within 40 m, enemies that fired in the last 2.5 s, and
// anything near a lit fog lamp. Stand by a lamp for 3 s to light it; every lit lamp also pushes the fog back 30 m.
export const FOG = { R: 7, light: 3, radar: 40, lampSee: 60, ping: 2.5, near: 6, far0: 70, perLamp: 30, spots: [[-68, -58], [66, -62], [-62, 66], [70, 60]] };
const fogHalo = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.35, 'rgba(255,220,150,0.45)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const fogRingGeo = new THREE.RingGeometry(FOG.R - 0.4, FOG.R, 48);
export function startFog() {
  clearFog();
  const F = G.fog = { lamps: [], lit: 0 };
  for (const [sx, sz] of FOG.spots) {
    let x = sx, z = sz;
    for (let i = 0; i < 400; i++) {   // nearest open ground to the planned spot
      const a = i * 2.4, r = Math.sqrt(i) * 2.2; x = sx + Math.cos(a) * r; z = sz + Math.sin(a) * r;
      if (groundAt(x, z, 60) < 0.6 && !collideCyl(new V3(x, 0.5, z), 3, 3)) break;
    }
    const obj = cloneKit('P_FogLamp'); obj.position.set(x, 0, z); G.scene.add(obj);
    const n = nodes(obj); if (n.FL_On) n.FL_On.visible = false;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogHalo, color: 0xffe8b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.position.set(x, 9.4, z); halo.scale.set(16, 16, 1); G.scene.add(halo);
    const ring = new THREE.Mesh(fogRingGeo, new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.5, z); G.scene.add(ring);
    F.lamps.push({ obj, n, halo, ring, x, z, k: 0, lit: false, sol: addSolid(x, z, 1.2, 1.2, 9, 0, 'lamp') });
  }
}
export function clearFog() {
  const F = G.fog; if (!F) return;
  for (const L of F.lamps) { L.obj.parent && L.obj.parent.remove(L.obj); L.halo.parent && L.halo.parent.remove(L.halo); L.halo.material.dispose(); L.ring.parent && L.ring.parent.remove(L.ring); L.ring.material.dispose(); removeSolid(L.sol); }
  G.fog = null;
}
function updateFog(dt) {
  const F = G.fog, P = G.player; if (!F) return;
  for (const L of F.lamps) {
    if (L.lit) { L.halo.material.opacity = 0.8 + Math.sin(G.time * 3 + L.x) * 0.08; continue; }
    const near = P && P.alive && Math.hypot(P.pos.x - L.x, P.pos.z - L.z) < FOG.R && P.pos.y - groundAt(P.pos.x, P.pos.z, P.pos.y + 1) < 8;
    L.k = near ? L.k + dt / FOG.light : Math.max(0, L.k - dt * 0.25);
    L.ring.material.opacity = 0.35 + 0.4 * L.k + (near ? Math.sin(G.time * 12) * 0.1 : 0);
    L.ring.scale.setScalar(1 - 0.5 * L.k);
    if (L.k >= 1) {
      L.lit = true; F.lit++; if (L.n.FL_On) L.n.FL_On.visible = true; if (L.n.FL_Off) L.n.FL_Off.visible = false;
      L.ring.visible = false; G.fx.flash(new V3(L.x, 9.4, L.z), 0xffe0a0, 60, 40, 0.4); G.fx.ring(new V3(L.x, 0.5, L.z), null, 2, 30, 0.6, 0xffd070);
      sfx('repair', 0); G.lampsLit = (G.lampsLit || 0) + 1; G.onTally && G.onTally('lamp'); G.onLamp && G.onLamp(F.lit, F.lamps.length);
    }
  }
}
export function fogFar() { return G.fog ? FOG.far0 + FOG.perLamp * G.fog.lit : 0; }
export function fogSeen(e) {   // may this enemy show on the radar (and be targeted by the autopilot)?
  if (!G.fog) return true;
  if (e.kind === 'boss' || e.markT > 0 || e.pingT > 0) return true;
  const c = e.c || e.pos, P = G.player; if (!c) return true;
  if (P && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < FOG.radar) return true;
  for (const L of G.fog.lamps) if (L.lit && Math.hypot(c.x - L.x, c.z - L.z) < FOG.lampSee) return true;
  return false;
}

// ---- Lurker: an ambush walker folded up inside a cargo crate. Asleep it is off the radar and cannot be locked, but
// its eye glints every few seconds and it takes 1.5x damage. It wakes when you come within 20 m, when it is hit, after
// 30 s, or when it is the last enemy left; the crate falls open, it stands up on four legs and hunts you with
// three-shell cannon bursts. If you get more than 34 m away for 3 s it folds back up where it stands.
export const LURK = { hp: 700, r: 2.4, wake: 20, unfold: 0.8, raise: 1.25, speed: 10, keep: [12, 20], burst: 3, shellDmg: 18, shellV: 75, splash: 3.5, cd: [1.5, 2.1], rehide: 34, hideT: 3, sleepMax: 30, sleepVuln: 1.5, eyeEvery: [3, 5] };
export class Lurker extends Enemy {
  constructor(pos) {
    super('lurker', 'E_Lurker', pos, LURK.hp, LURK.r); this.boom = 1.3;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6.28; this.obj.rotation.y = this.yaw;
    this.st = 'sleep'; this.t = 0; this.unf = 0; this.cloaked = true; this.sleepT = 0; this.farT = 0; this.ph = Math.random() * 6;
    this.eyeT = 1 + Math.random() * 3; this.burstN = 0; this.burstT = 0; this.vel = new V3(); this.strafe = Math.random() < 0.5 ? 1 : -1; this.stT = 3;
    if (this.n.LK_Eye) this.n.LK_Eye.visible = false;
    this.c.set(this.pos.x, this.pos.y + 1.3, this.pos.z); G.lurkers = (G.lurkers || 0) + 1;
  }
  hit(dmg, at, label) {
    if (this.st === 'sleep' && this.alive) { dmg *= LURK.sleepVuln; G.lurkSniped = (G.lurkSniped || 0) + 1; }
    super.hit(dmg, at, label);
    if (this.alive && (this.st === 'sleep' || this.st === 'fold')) this.wake('hit');
  }
  wake(why) {
    this.st = 'unfold'; this.t = LURK.unfold; this.cloaked = false; this.farT = 0; G.lurkWakes = (G.lurkWakes || 0) + 1;
    if (why === 'hit') G.lurkWokenHit = (G.lurkWokenHit || 0) + 1;
    G.fx.smoke(this.pos, 6, 3, 2.5, 0x7a7468, 1.4, 1); G.fx.ring(new V3(this.pos.x, this.pos.y + 0.3, this.pos.z), null, 1, 8, 0.4, 0xff5030);
    sfx('qboost', G.player ? G.player.pos.distanceTo(this.pos) : 0); G.onLurk && G.onLurk(this);
  }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC); this.ph += dt;
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    if (this.st === 'sleep') {
      this.sleepT += dt; this.eyeT -= dt;
      if (this.n.LK_Eye) this.n.LK_Eye.visible = this.eyeT < 0.22;
      if (this.eyeT <= 0) this.eyeT = LURK.eyeEvery[0] + Math.random() * (LURK.eyeEvery[1] - LURK.eyeEvery[0]);
      this.cloaked = !(this.markT > 0);   // a sonar pulse shows it, but does not wake it
      const last = !G.enemies.some((e) => e !== this && e.alive && !e.dying && !(e.kind === 'lurker' && e.st === 'sleep'));
      if (dist < LURK.wake || this.sleepT > LURK.sleepMax || last) this.wake(dist < LURK.wake ? 'near' : 'time');
    } else if (this.st === 'unfold' || this.st === 'fold') {
      this.t -= dt; const k = Math.max(0, this.t / LURK.unfold);
      this.unf = this.st === 'unfold' ? 1 - k : k;
      if (this.t <= 0) {
        if (this.st === 'unfold') { this.st = 'hunt'; this.fireT = 0.4; if (this.n.LK_Eye) this.n.LK_Eye.visible = true; }
        else { this.st = 'sleep'; this.sleepT = 0; this.cloaked = true; G.lurkHides = (G.lurkHides || 0) + 1; }
      }
    } else {   // hunt
      const want = Math.atan2(dx, dz); this.yaw += angDiff(want, this.yaw) * Math.min(1, dt * 3);
      const ox = dx / dist, oz = dz / dist; let mv = dist > LURK.keep[1] ? 1 : dist < LURK.keep[0] ? -0.6 : 0;
      this.stT -= dt; if (this.stT <= 0) { this.stT = 2 + Math.random() * 2; this.strafe *= -1; }
      const vx = (ox * mv - oz * this.strafe * 0.7) * LURK.speed, vz = (oz * mv + ox * this.strafe * 0.7) * LURK.speed;
      this.vel.x += (vx - this.vel.x) * (1 - Math.exp(-4 * dt)); this.vel.z += (vz - this.vel.z) * (1 - Math.exp(-4 * dt));
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      this.pos.x = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.x)); this.pos.z = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.z));
      if (collideCyl(this.pos, 2.2, 2.5)) { this.strafe *= -1; blockedSlide(this); }
      this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) - this.pos.y) * Math.min(1, dt * 10);
      const los = dist < 90 && this.checkLos(dt);
      this.fireT -= dt;
      if (this.burstN > 0) {
        this.burstT -= dt;
        if (this.burstT <= 0) {
          this.burstN--; this.burstT = 0.14;
          const m = this.n.Muzzle_LK, mp = m ? m.getWorldPosition(new V3()) : this.c.clone(), aim = lead(mp, LURK.shellV, _b, tg);
          _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.z += (Math.random() - 0.5) * 0.05;
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(LURK.shellV), dmg: LURK.shellDmg, team: 'E', kind: 'shell', splash: LURK.splash, life: 2.2, grav: 2, label: 'lurker-cannon' });
          G.fx.muzzle(mp, _d, 0xff7040, 1.4); sfx('cannon', dist);
        }
      } else if (this.fireT <= 0 && los) { this.burstN = LURK.burst; this.burstT = 0; this.fireT = LURK.cd[0] + Math.random() * (LURK.cd[1] - LURK.cd[0]); }
      const lastOne = !G.enemies.some((e) => e !== this && e.alive && !e.dying);
      this.farT = dist > LURK.rehide && !lastOne ? this.farT + dt : 0;
      if (this.farT > LURK.hideT) { this.st = 'fold'; this.t = LURK.unfold; this.farT = 0; this.vel.set(0, 0, 0); }
    }
    // pose: the shells fall open, the core rises on its legs and walks
    const u = this.unf, n = this.n;
    if (n.LK_ShellL) n.LK_ShellL.rotation.z = u * 1.75; if (n.LK_ShellR) n.LK_ShellR.rotation.z = -u * 1.75;
    if (n.LK_Body) n.LK_Body.position.y = u * LURK.raise;
    const walk = this.st === 'hunt' ? Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 5) : 0;
    for (let i = 1; i <= 4; i++) { const L = n['LK_Leg' + i]; if (!L) continue; L.scale.y = 0.08 + 0.92 * u; L.rotation.x = Math.sin(this.ph * 9 + (i % 2) * Math.PI + (i > 2 ? 0.8 : 0)) * 0.35 * walk; }
    this.obj.rotation.y = this.yaw;
    this.c.set(this.pos.x, this.pos.y + 1.3 + u * LURK.raise, this.pos.z);
  }
}

// ---- RW-3 rewind: snaps you back to where you were 3 s ago and gives back the armour you lost since (up to 30 %).
// 0.4 s of invulnerability; the afterimage you leave behind bursts for 60 / 6 m half a second later.
const rwHist = []; let rwT = 0;
function recordRewind(dt) {
  const P = G.player; if (!P || !P.alive) { rwHist.length = 0; return; }
  rwT -= dt; if (rwT > 0) return; rwT = 0.1;
  rwHist.push({ t: G.time, x: P.pos.x, y: P.pos.y, z: P.pos.z, hp: P.hp }); while (rwHist.length > 50) rwHist.shift();
}
export function resetRewind() { rwHist.length = 0; rwT = 0; G.rewinds = 0; G.rewindHeal = 0; G.rewindDist = 0; }
function doRewind(owner, d, mul) {
  const P = owner; let past = null;
  for (const h of rwHist) if (h.t <= G.time - d.back) past = h;
  if (!past) past = rwHist[0]; if (!past) return false;
  const from = P.pos.clone(), a = from.clone().setY(from.y + 2.5);
  P.pos.set(past.x, past.y, past.z); P.vel.set(0, 0, 0);
  const lost = Math.max(0, past.hp - P.hp), back = Math.min(lost, P.maxHp * d.cap);
  P.hp = Math.min(P.maxHp, P.hp + back); G.rewindHeal = (G.rewindHeal || 0) + back; G.rewinds = (G.rewinds || 0) + 1; G.rewindDist = (G.rewindDist || 0) + from.distanceTo(P.pos);
  G.blinkInv = Math.max(G.blinkInv || 0, d.inv); G.tether = null; rwHist.length = 0;
  const b = P.pos.clone().setY(P.pos.y + 2.5), fx = G.fx;
  fx.streak(a, b, 1.6, 0x40ffd0, 0.3); fx.streak(a, b, 0.5, 0xe0fff8, 0.3);
  fx.flash(b, 0x40ffd0, 40, 26, 0.3); fx.ring(P.pos, null, 1, 7, 0.4, 0x40ffd0); fx.ring(from, null, 1, 5, 0.4, 0x80fff0);
  for (let i = 0; i < 18; i++) fx.emit('add', { x: a.x + (Math.random() - 0.5) * 3, y: a.y + (Math.random() - 0.5) * 4, z: a.z + (Math.random() - 0.5) * 3, vy: 1, life: 0.5, s0: 1.4, s1: 0.2, c0: 0x60ffe0, c1: 0x104038 });
  sfx('blink', 0);
  G.queue.push({ label: 'p-rewind', t: 0.5, fn: () => { G.fx.flash(a, 0x60ffe0, 40, 30, 0.3); explodeAt(a, d.burstR, d.burst * mul, 'P', 0.8, 0x40ffd0); } });
  return true;
}

// ---- Disarmer: a hovering drone that keeps 30-46 m away and fires a slow, gently homing violet orb every 5-7 s
// (0.7 s charge first). The orb does 26 and LOCKS one of your weapon slots for 4 s. A sideways boost beats the orb.
export const DISARM = { hp: 650, r: 1.8, hover: 9, near: 30, far: 46, speed: 11, every: [5, 7], charge: 0.7, orbV: 40, turn: 2.4, dmg: 26, jam: 4, gunCd: [1.2, 1.8], gunDmg: 8 };
export function jamPlayer() {
  const J = G.jam, free = ['R', 'L', 'S'].filter((k) => !(J[k] > 0));
  const k = (free.length ? free : ['R', 'L', 'S'])[Math.floor(Math.random() * (free.length || 3))];
  J[k] = DISARM.jam; G.jamHits = (G.jamHits || 0) + 1; G.onJam && G.onJam(k);
}
export class Disarmer extends Enemy {
  constructor(pos) {
    super('disarmer', 'E_Disarmer', pos, DISARM.hp, DISARM.r); this.boom = 1.1;
    this.pos.y = groundAt(pos.x, pos.z, 40) + DISARM.hover; this.vel = new V3(); this.yaw = 0; this.orbT = 2 + Math.random() * 2; this.chT = 0; this.gunT = 1.5; this.ph = Math.random() * 6.28; this.dir = Math.random() < 0.5 ? 1 : -1;
    this.c.copy(this.pos);
  }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC); this.ph += dt;
    const dx = this.pos.x - pc.x, dz = this.pos.z - pc.z, dist = Math.hypot(dx, dz) || 1;
    let want = dist < DISARM.near ? 1 : dist > DISARM.far ? -1 : 0;
    const ox = dx / dist, oz = dz / dist, tx = -oz * this.dir, tz = ox * this.dir;
    let vx = (ox * want * 1.2 + tx) * DISARM.speed, vz = (oz * want * 1.2 + tz) * DISARM.speed;
    if (Math.random() < dt * 0.2) this.dir *= -1;
    this.vel.x += (vx - this.vel.x) * (1 - Math.exp(-2 * dt)); this.vel.z += (vz - this.vel.z) * (1 - Math.exp(-2 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.x)); this.pos.z = Math.max(-ARENA + 6, Math.min(ARENA - 6, this.pos.z));
    if (collideCyl(this.pos, 1.8, 2)) { this.dir *= -1; blockedSlide(this); }
    const gy = Math.max(groundAt(this.pos.x, this.pos.z, this.pos.y + 1), pc.y - 3) + DISARM.hover + Math.sin(this.ph * 1.3) * 0.8;
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-1.5 * dt));
    this.yaw += angDiff(Math.atan2(dx, dz), this.yaw) * Math.min(1, dt * 4);
    const los = dist < 80 && this.checkLos(dt);
    if (los) {
      this.gunT -= dt;
      if (this.gunT <= 0 && this.chT <= 0) {
        this.gunT = DISARM.gunCd[0] + Math.random() * (DISARM.gunCd[1] - DISARM.gunCd[0]);
        const m = this.n.Muzzle_DA, mp = m ? m.getWorldPosition(new V3()) : this.c.clone(), aim = lead(mp, 190, _b, tg);
        _d.subVectors(aim, mp).normalize(); spawnShot({ p: mp, v: _d.multiplyScalar(190), dmg: DISARM.gunDmg, team: 'E', kind: 'ebullet', color: 0xc070ff, w: 0.22, len: 4, life: 0.8, label: 'disarmer-gun' });
        sfx('eshot', dist);
      }
    }
    this.orbT -= dt;
    if (this.chT > 0) {
      this.chT -= dt;
      if (Math.random() < 0.5) G.fx.sparks(this.n.Muzzle_DA ? this.n.Muzzle_DA.getWorldPosition(_c) : this.c, null, 1, 0xc050ff, 5, 0.8, 0.3, 0.2);
      if (this.chT <= 0) {
        const m = this.n.Muzzle_DA, mp = m ? m.getWorldPosition(new V3()) : this.c.clone(), aim = lead(mp, DISARM.orbV, _b, tg, 0.6);
        _d.subVectors(aim, mp).normalize();
        const sh = spawnShot({ p: mp, v: _d.multiplyScalar(DISARM.orbV), dmg: DISARM.dmg, team: 'E', kind: 'ebullet', color: 0xc050ff, w: 0.9, len: 1.4, life: 3.2, label: 'disarmer-orb' });
        sh.jamOrb = true; G.jamOrbs = (G.jamOrbs || 0) + 1; sfx('laser', dist);
        G.onJamOrb && G.onJamOrb(sh);
      }
    } else if (this.orbT <= 0 && los && dist < 70) { this.orbT = DISARM.every[0] + Math.random() * (DISARM.every[1] - DISARM.every[0]); this.chT = DISARM.charge; }
    const sw = Math.sin(this.ph * 2) * 0.2 + (this.chT > 0 ? 0.6 : 0);
    if (this.n.DA_ArmL) this.n.DA_ArmL.rotation.z = sw; if (this.n.DA_ArmR) this.n.DA_ArmR.rotation.z = -sw;
    this.obj.rotation.set(Math.sin(this.ph * 1.7) * 0.06, this.yaw, Math.sin(this.ph) * 0.08);
    this.c.copy(this.pos);
  }
}

// ---- NX-8 needler: homing needles stick in what they hit; eight in one target detonate together
export const NEEDLE = { burst: 8, dmg: 100, R: 4.5, keep: 3 };
const ndGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5);
const ndMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff60e0).multiplyScalar(1.6), toneMapped: false });
function clearNeedles(h) { for (const m of h.ndl || []) m.parent && m.parent.remove(m); h.ndl = []; h.needles = 0; }
export function resetNeedles() { if (G.needled) for (const h of G.needled) clearNeedles(h); G.needled = new Set(); }
function embedNeedle(ent, at) {
  const h = ent.kind === 'cpart' ? ent.owner : ent; if (!h || !h.alive || h.dying || !h.obj) return;
  G.needled = G.needled || new Set();
  h.needles = (h.needles || 0) + 1; h.needleT = NEEDLE.keep;
  const m = new THREE.Mesh(ndGeo, ndMat); m.position.copy(at); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); G.scene.add(m); h.obj.attach(m); (h.ndl = h.ndl || []).push(m);
  G.needled.add(h);
  if (h.needles >= NEEDLE.burst) {
    const c = h.c.clone(); clearNeedles(h); G.curLabel = 'needle-burst';
    explodeAt(c, NEEDLE.R, NEEDLE.dmg, 'P', 0.8, 0xff60e0); G.fx.sparks(c, null, 24, 0xff80e8, 18, 1, 0.35, 0.2); G.fx.flash(c, 0xff60e0, 30, 18, 0.15);
    G.needleBursts = (G.needleBursts || 0) + 1; sfx('zap', G.player ? G.player.pos.distanceTo(c) : 0);
  }
}
function updateNeedles(dt) {
  if (!G.needled) return;
  for (const h of G.needled) {
    if (!h.alive || h.gone) { clearNeedles(h); G.needled.delete(h); continue; }
    h.needleT -= dt; if (h.needleT <= 0) { clearNeedles(h); G.needled.delete(h); }
  }
}

// ---- LM-3 bounding mines -----------------------------------------------------------------------------------------
const pmGeo = new THREE.CylinderGeometry(0.42, 0.5, 0.28, 10), pmLight = new THREE.SphereGeometry(0.13, 8, 6);
const pmMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6, metalness: 0.4 });
export function clearPMines() { for (const m of (G.pmines || [])) m.o.parent && m.o.parent.remove(m.o); G.pmines = []; }
function dropPMines(owner, d, dmgMul) {
  G.pmines = G.pmines || [];
  const yaw = owner.legYaw || 0;   // kit front is -Z, so (sin, cos) of legYaw points behind
  for (let k = 0; k < d.n; k++) {
    const a = yaw + (k - (d.n - 1) / 2) * 0.9 + (Math.random() - 0.5) * 0.3, r = 3 + Math.random() * 3;
    const x = owner.pos.x + Math.sin(a) * r, z = owner.pos.z + Math.cos(a) * r, y = groundAt(x, z, owner.pos.y + 1);
    const o = new THREE.Group(); const b = new THREE.Mesh(pmGeo, pmMat); o.add(b);
    const l = new THREE.Mesh(pmLight, new THREE.MeshBasicMaterial({ color: 0xffb040 })); l.position.y = 0.2; o.add(l);
    o.position.set(owner.pos.x, owner.pos.y + 1.5, owner.pos.z); G.scene.add(o);
    G.pmines.push({ o, l, x, y, z, t: 0, fall: 0.35, st: 'fall', life: d.life, d, dmg: d.dmg * dmgMul, from: o.position.clone(), tgt: null, v: new V3() });
  }
  while (G.pmines.length > d.max) { const m = G.pmines.shift(); m.o.parent && m.o.parent.remove(m.o); }
}
function pmBlow(m) {
  G.curLabel = 'p-mine'; explodeAt(m.o.position.clone(), m.d.R, m.dmg, 'P', 0.8, 0xffb050);
  G.pmBlown = (G.pmBlown || 0) + 1; m.o.parent && m.o.parent.remove(m.o);
}
function updatePMines(dt) {
  const L = G.pmines; if (!L || !L.length) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const m = L[i]; m.t += dt; m.life -= dt;
    if (m.st === 'fall') {
      const k = Math.min(1, m.t / m.fall); m.o.position.set(m.from.x + (m.x - m.from.x) * k, m.from.y + (m.y - m.from.y) * k + Math.sin(k * Math.PI) * 1.5, m.from.z + (m.z - m.from.z) * k);
      if (k >= 1) { m.st = 'arm'; m.t = 0; }
      continue;
    }
    if (m.st === 'arm') { m.l.material.color.setHex(Math.sin(m.t * 20) > 0 ? 0xffb040 : 0x302010); if (m.t >= m.d.arm) { m.st = 'set'; m.l.material.color.setHex(0xff3020); } continue; }
    if (m.st === 'set') {
      m.l.visible = Math.sin(m.t * 4) > 0;
      if (m.life <= 0) { m.o.parent && m.o.parent.remove(m.o); L.splice(i, 1); continue; }
      for (const e of G.enemies) {
        if (!e.alive || e.dying || !e.c || e.holo || e.cloaked) continue;
        const hd = Math.hypot(e.c.x - m.x, e.c.z - m.z), hy = e.c.y - m.y;
        if (hd < m.d.trig + (e.r || 1) * 0.3 && hy < m.d.hmax && hy > -3) { m.st = 'jump'; m.tgt = e; m.t = 0; m.v.set(0, 14, 0); sfx('minebeep', G.player ? G.player.pos.distanceTo(m.o.position) : 0); break; }
      }
      continue;
    }
    // jump: hop up, then home in on the target
    const e = m.tgt, pos = m.o.position;
    if (e && e.alive && !e.gone) { _a.subVectors(e.c, pos); const dd = _a.length(); if (dd < 2.2 + (e.r || 1) * 0.4) { pmBlow(m); L.splice(i, 1); continue; } if (m.t > 0.15) m.v.lerp(_a.multiplyScalar(34 / (dd || 1)), Math.min(1, dt * 8)); }
    else m.v.y -= 20 * dt;
    pos.addScaledVector(m.v, dt); m.o.rotation.x += dt * 12;
    G.fx.emit('add', { x: pos.x, y: pos.y, z: pos.z, life: 0.1, s0: 0.8, s1: 0.2, c0: 0xffa040 });
    if (m.t > 1.1 || pos.y < groundAt(pos.x, pos.z, pos.y + 1) - 0.2) { pmBlow(m); L.splice(i, 1); }
  }
}

export function dropRepair(pos) {
  if (G.noRepair) return;
  const o = cloneKit('P_Repair'); o.position.copy(pos); o.position.y = Math.max(1.5, groundAt(pos.x, pos.z, pos.y) + 1.5);
  G.scene.add(o);
  G.pickups.push({ o, t: 0 });
}

export function updateCombat(dt) {
  RAYF.skipIce = false;
  for (let i = G.queue.length - 1; i >= 0; i--) { const q = G.queue[i]; q.t -= dt; if (q.t <= 0) { G.queue.splice(i, 1); G.curLabel = q.label; q.fn(); } }
  const hers = G.enemies.filter((e) => e.kind === 'herald' && e.alive && !e.dying && !(e.stunT > 0));
  for (const e of G.enemies) {
    G.curLabel = e.kind; if (e.pingT > 0) e.pingT -= dt;
    e.rally = false; if (hers.length && e.kind !== 'herald' && e.pos && e.alive && !e.dying) for (const h of hers) if (Math.hypot(h.pos.x - e.pos.x, h.pos.z - e.pos.z) < HERALD.R) { e.rally = true; break; }
    if (e.corrT > 0) { e.corrT -= dt; if (e.corrT <= 0) e.corr = 0; else if (e.c && Math.random() < 0.05 * e.corr) G.fx.emit('add', { x: e.c.x + (Math.random() - 0.5) * 2, y: e.c.y + (Math.random() - 0.5) * 2, z: e.c.z + (Math.random() - 0.5) * 2, vy: -2, life: 0.4, s0: 0.6, s1: 0.2, c0: 0xa0ff40, c1: 0x306010 }); }
    if (e.hornT > 0) { e.hornT -= dt; if (e.c && Math.random() < 0.15) G.fx.sparks(_a.copy(e.c).add(_b.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), null, 1, 0xffb040, 5, 0.8, 0.3, 0.2); }
    else if (e.rally && e.c && Math.random() < 0.05) G.fx.sparks(_a.copy(e.c).setY(e.c.y + 1.5), null, 1, 0xff4030, 4, 0.8, 0.3, 0.2);
    if (e.stunT > 0 && e.alive && !e.dying) {
      e.stunT -= dt; if (e.snap) e.snap(true);
      if (Math.random() < 0.3) G.fx.sparks(_a.copy(e.c).add(_b.set((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 3)), null, 2, 0x9fe0ff, 7, 0.9, 0.3, 0.18);
      if (e.flash > 0) e.flash -= dt;
      continue;
    }
    const sp = G.stasis.length && (e.c || e.pos), sk = sp ? stasisK(sp, e.maxHp > 1500 || e.isColossus || e.isTrain || e.isLev) : 1;
    if (sk < 1) G.stasisSlow = (G.stasisSlow || 0) + dt;
    G.curShooter = e; e.update((e.chill > 0 ? dt * (1 - 0.4 * e.chill / 100) : dt) * sk * (e.rally ? HERALD.spd : 1)); G.curShooter = null;
    if (e.flash > 0) e.flash -= dt;
  }
  const pp = G.player; G.jammed = null;
  if (pp && pp.alive) for (const e of G.enemies) if (e.kind === 'jammer' && e.alive && !e.dying && !(e.stunT > 0) && !(e.markT > 0) && e.c.distanceTo(pp.pos) < JAM_R) { G.jammed = e; break; }
  if (G.jammed && !G.jamSaid) { G.jamSaid = true; G.onHint && G.onHint('电子干扰 · 锁定与雷达失效 · 击落紫色的干扰机，或用电磁脉冲瘫痪它', 4); }
  if (PLAT.R) for (const e of G.enemies) {   // sky elevator: nothing that walks or hovers leaves the deck
    if (!e.pos || !e.alive || e.kind === 'jet' || e.kind === 'dropship') continue;
    const d = Math.hypot(e.pos.x, e.pos.z), lim = PLAT.R - 3; if (d > lim) { e.pos.x *= lim / d; e.pos.z *= lim / d; }
  }
  for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].gone) G.enemies.splice(i, 1);
  G.curLabel = null;
  LAVA.uT.value = G.time;
  if (G.blinkInv > 0) G.blinkInv -= dt;
  recordRewind(dt); updateFog(dt);
  updateMarks(dt);
  updateBurning(dt);
  updateChill(dt);
  if (LAVA.on) updateForge(dt);
  if (G.meteorOn) updateMeteors(dt);
  for (const m of G.mines) if (m.alive) m.update(dt);
  for (let i = G.mines.length - 1; i >= 0; i--) if (!G.mines[i].alive) G.mines.splice(i, 1);
  G.curLabel = null;
  updateMinis(dt);
  updateDecoys(dt);
  updateWells(dt);
  updateStrikes(dt);
  updateDiscs(dt);
  updateHooks(dt);
  updateSmokes(dt);
  updateStasis(dt);
  if (ACID.on) updateAcid(dt);
  if (GRID.on) updateGrid(dt);
  if (G.twisters.length) updateTwisters(dt);
  updateBarrage(dt);
  updateIce(dt); updateIceWalls(dt); updateWind(dt); updateStickies(dt); updateCranes(dt); updatePMines(dt); updateQuakes(dt); updateFlares(dt); updateNeedles(dt); updateThunder(dt); updateRods(dt); updateTraffic(dt); updateRifts(dt); updateSupply(dt); updatePound(dt); for (const k in G.jam) if (G.jam[k] > 0) G.jam[k] -= dt;
  updateShots(dt); RAYF.skipIce = false;
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
