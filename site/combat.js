// Weapons, projectiles, enemies, damage.  Shared state lives in G.
import * as THREE from 'three';
import { RAYF, barrels, raySolids, clearLine, collideCyl, groundAt, removeSolid, pointInSolid, addSolid, ARENA, PLAT, WATER, LAVA, lavaAt, lavaD, GRID, CREEP, RADZ, GLADU, PAINT } from './world.js';
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
  drill: { slot: 'arm', name: 'DR-2 钻地弹', en: 'DR-2 Drill Gun', desc: '慢速钻头弹 · 可钻透 18 m 内的墙体与掩体 · 命中后爆炸 3.5 m · 隔着墙打躲在后面的敌机（看雷达）', type: 'bullet', drill: 18, rate: 0.36, dmg: 58, splash: 3.5, speed: 110, spread: 0.004, mag: 10, reload: 2.2, life: 1.8, color: 0xffa040, w: 0.45, len: 3, sfx: 'cannon', recoil: 0.4 },
  bubble: { slot: 'arm', name: 'BU-6 泡泡枪', en: 'BU-6 Bubble Gun', desc: '慢速大泡泡（轻微下坠）· 罩住 2000 血以下的普通敌机：被泡泡托起 8 m、瘫痪 2.8 秒（期间受伤 +30%），泡泡破了地面单位摔下来再吃 90 · 重型和头目只会被黏住减速 · 在「定时炸弹」里，被泡住的敌人没法把炸弹传回给你', type: 'bullet', grenade: true, bub: true, rate: 0.55, dmg: 24, splash: 2.2, speed: 58, grav: 5, spread: 0.004, mag: 8, reload: 2.2, color: 0xa8e8ff, sfx: 'spit', recoil: 0.3 },
  ecan: { slot: 'arm', name: 'EC-2 能量炮', en: 'EC-2 Energy Cannon', desc: '不用弹匣，每发消耗 4 点推进能量 · 0.18 秒一发 38 伤害的贯穿光束，一条线上的敌机全吃 · 能量不够就打不响，开火不影响回能，但别想边打边一直推进 · 超载期间能量无限', type: 'ecan', rate: 0.18, dmg: 38, cost: 4, reserve: 0, range: 90, sfx: 'laser', recoil: 0.5 },
  arc: { slot: 'arm', name: 'AR-7 电弧枪', en: 'AR-7 Arc Caster', desc: '42 m 内瞬发电弧 · 自动打准星附近、有视线的敌机 · 再跳到 10 m 内最多 3 台敌机（每跳 ×0.7）· 不用瞄准，适合打迅猛机这种会闪避的快速目标', type: 'arc', rate: 0.15, dmg: 25, range: 42, chain: 3, chainR: 10, chainK: 0.7, mag: 28, reload: 1.8, sfx: 'coil', recoil: 0.15 },
  javelin: { slot: 'arm', name: 'JV-3 穿甲标枪', en: 'JV-3 Javelin', desc: '高速重标枪（轻微下坠）130 伤害 · 贯穿最多 4 台敌机，每穿一台伤害 ×0.8 · 命中的第一台轻型敌机被钉住瘫痪 1.2 秒并击退 4 m · 扎进墙里会留一会儿', type: 'javelin', rate: 0.75, dmg: 130, speed: 95, grav: 4, pierce: 4, pierceK: 0.8, pin: 1.2, knock: 4, life: 2.2, range: 120, mag: 4, reload: 2.4, color: 0xffb060, sfx: 'rail', recoil: 0.7 },
  splat: { slot: 'arm', name: 'SP-4 泼溅炮', en: 'SP-4 Splat Cannon', desc: '抛射大团青色涂料（有下坠）· 溅射 3.5 m · 被溅中的敌机 3 秒糊住镜头：射击大幅偏离（头目减半）、近身攻击伤害 −30% · 在「领地争夺」里一发涂出 4.5 m 青色', type: 'bullet', grenade: true, goo: true, rate: 0.45, dmg: 46, splash: 3.5, speed: 62, grav: 16, spread: 0.004, mag: 12, reload: 2.4, color: 0x40d8ff, sfx: 'grenade', recoil: 0.45 },
  plorb: { slot: 'arm', name: 'PL-3 等离子球', en: 'PL-3 Plasma Orb', desc: '发射缓慢飞行的等离子球 · 飞行中每 0.25 秒电击身边 8 m 内最多 2 台敌机（对菌巢 / 菌瘤 / 播种者 ×1.5）· 撞上敌机、墙体或飞满 2.8 秒后炸开', type: 'plorb', rate: 0.5, dmg: 60, splash: 5, zap: 13, zapR: 8, zapN: 2, bio: 1.5, speed: 22, life: 2.8, mag: 8, reload: 2.2, sfx: 'coil', recoil: 0.35 },
  isotope: { slot: 'arm', name: 'IS-3 衰变枪', en: 'IS-3 Isotope Rifle', desc: '绿色衰变弹 · 每发命中给敌机叠一层衰变（最多 6 层，每层每秒 5 伤害，4 秒不补就消退）· 带 2 层以上衰变的敌机被击毁时，衰变扩散到 12 m 内所有敌机', type: 'bullet', decay: true, rate: 0.12, dmg: 11, speed: 300, spread: 0.007, mag: 36, reload: 1.9, color: 0x9cff40, w: 0.24, len: 5, sfx: 'rifle', recoil: 0.14 },
  rifle: { slot: 'arm', name: 'AR-77 突击步枪', en: 'AR-77 Rifle', desc: '全自动 · 精准 · 均衡', type: 'bullet', rate: 0.1, dmg: 17, speed: 320, spread: 0.005, mag: 40, reload: 1.7, color: 0xffd27a, w: 0.22, len: 7, sfx: 'rifle', recoil: 0.18 },
  gatling: { slot: 'arm', name: 'GX-6 加特林', en: 'GX-6 Gatling', desc: '需预转 · 高射速 · 散布大', type: 'bullet', rate: 0.042, spinUp: 0.45, dmg: 8.5, speed: 290, spread: 0.022, mag: 200, reload: 3.0, color: 0xffb860, w: 0.18, len: 6, sfx: 'gatling', recoil: 0.08 },
  coil: { slot: 'arm', name: 'LC-3 闪电线圈', en: 'LC-3 Arc Coil', desc: '自动索敌 · 连锁 3 个目标', type: 'chain', rate: 0.5, dmg: 44, range: 60, chains: 3, chainR: 18, mag: 14, reload: 2.2, sfx: 'coil', recoil: 0.3 },
  rail: { slot: 'arm', name: 'RG-9 磁轨炮', en: 'RG-9 Railgun', desc: '按住蓄力 · 松开贯穿', type: 'charge', charge: 1.1, dmg: [45, 280], rate: 0.6, mag: 6, reload: 2.6, sfx: 'rail', recoil: 0.9 },
  blade: { slot: 'arm', name: 'LB-0 光束剑', en: 'LB-0 Pulse Blade', desc: '近战 · 锁定时冲刺斩击 · 耗 EN', type: 'blade', dmg: 310, range: 7.5, lunge: 38, cd: 0.95, cost: 16, sfx: 'blade' },
  flak: { slot: 'arm', name: 'FL-8 高射炮', en: 'FL-8 Flak Cannon', desc: '近炸引信炮弹 · 飞近敌机 4 m 内自动空爆 · 6 m 破片 · 射程尽头也会空爆 · 专克蜂群和无人机', type: 'bullet', flak: 4, rate: 0.3, dmg: 44, splash: 6, speed: 150, spread: 0.01, life: 0.7, mag: 12, reload: 2.6, color: 0xffc070, w: 0.32, len: 3, sfx: 'cannon', recoil: 0.45 },
  shotgun: { slot: 'arm', name: 'SG-12 霰弹炮', en: 'SG-12 Scattergun', desc: '近距离 · 一发 9 颗弹丸 · 射程短', type: 'bullet', pellets: 9, rate: 0.72, dmg: 13, speed: 250, spread: 0.075, life: 0.42, mag: 6, reload: 2.3, color: 0xffc890, w: 0.2, len: 4, sfx: 'cannon', recoil: 0.7 },
  grenade: { slot: 'arm', name: 'GL-4 榴弹发射器', en: 'GL-4 Grenade Launcher', desc: '抛物线弹道 · 范围爆炸 · 可越过掩体', type: 'bullet', grenade: true, rate: 0.55, dmg: 78, splash: 6.5, speed: 88, grav: 30, spread: 0.004, mag: 8, reload: 2.5, color: 0xffa050, sfx: 'grenade', recoil: 0.55 },
  burner: { slot: 'shoulder', name: 'AB-1 加力推进', en: 'AB-1 Afterburner', desc: '5 秒加力 · 移速 ×1.6、能量无限 · 以 14 m/s 以上撞上敌机造成 90 伤害并撞开（每台每秒一次，头目 50%）· 期间受伤 −20% · 冷却 14 秒', type: 'burner', dur: 5, speed: 1.6, ram: 90, ramR: 3.0, ramV: 14, push: 5, stun: 0.6, cut: 0.2, cd: 14, sfx: 'qboost' },
  repair: { slot: 'shoulder', name: 'RB-3 维修光束', en: 'RB-3 Repair Beam', desc: '4 秒维修光束 · 自动接上 45 m 内受损最重的友军，每秒修复 110（反应堆 / 基地 20%，炮台 60%）· 没有受损友军时改为汲取准星前方的敌机：每秒 50 伤害并回复你 30% · 冷却 12 秒', type: 'repair', dur: 4, R: 45, heal: 110, drain: 50, back: 0.3, coreK: 0.2, turK: 0.6, cd: 12, sfx: 'repair' },
  reflect: { slot: 'shoulder', name: 'RF-2 偏转力场', en: 'RF-2 Reflector', desc: '展开 2.5 秒的球形力场 · 6 m 内飞来的敌方子弹、导弹、炮弹全部反弹回最近的敌机（伤害 ×1.2）· 期间其余伤害 −40% · 冷却 13 秒', type: 'reflect', dur: 2.5, R: 6, mul: 1.2, cut: 0.4, cd: 13, sfx: 'shield' },
  frag: { slot: 'arm', name: 'SC-6 散裂炮', en: 'SC-6 Frag Cannon', desc: '炮弹飞近敌机 9 m 内（或飞出 50 m）自动炸成 6 枚破片 · 破片朝最近的敌机散射 · 中远距离威力最大', type: 'bullet', split: 0.45, fragN: 6, fragDmg: 10, rate: 0.4, dmg: 24, speed: 110, spread: 0.006, life: 1.2, mag: 10, reload: 2.6, color: 0x60ffc0, w: 0.34, len: 3, sfx: 'cannon', recoil: 0.35 },
  melter: { slot: 'arm', name: 'HL-5 热熔光束', en: 'HL-5 Melter', desc: '按住持续照射 42 m 内的目标 · 盯住同一个目标越久伤害越高：每秒 40，2.5 秒后升到 220 · 换目标重新计算 · 满槽可照 5 秒', type: 'melter', rate: 0.05, dps0: 40, dps1: 220, ramp: 2.5, range: 42, mag: 100, reload: 2.4, sfx: 'laser' },
  flamer: { slot: 'arm', name: 'FT-2 火焰喷射器', en: 'FT-2 Flamethrower', desc: '近距离持续喷射 · 点燃敌人持续灼烧 · 燃烧中的敌人伤害 −25%', type: 'flame', rate: 0.04, dmg: 8, speed: 60, spread: 0.08, life: 0.42, mag: 120, reload: 2, burn: 22, burnT: 2.5, sfx: 'flame' },
  cryo: { slot: 'arm', name: 'CR-3 冷冻枪', en: 'CR-3 Cryo Lance', desc: '冰晶连射 · 射程 70 m · 命中累积寒冷让敌人变慢 · 冻满后冰封 1.5 秒（瘫痪、受伤 +30%）', type: 'bullet', rate: 0.085, dmg: 8.5, speed: 230, spread: 0.007, life: 0.3, mag: 60, reload: 2.2, color: 0x9fe8ff, w: 0.26, len: 5, sfx: 'cryo', recoil: 0.1, chill: 5.5 },
  disc: { slot: 'arm', name: 'DS-7 回旋刃', en: 'DS-7 Ripper Disc', desc: '掷出贯穿锯刃 · 飞到 48 m 或撞墙后飞回手中 · 去程回程各命中一次 · 同时最多 2 片', type: 'disc', rate: 0.32, dmg: 56, speed: 72, range: 48, mag: 2, reload: 0, sfx: 'disc', recoil: 0.25 },
  pile: { slot: 'arm', name: 'PB-9 打桩机', en: 'PB-9 Pile Bunker', desc: '近战 · 锁定时冲刺 · 单体重击 · 贯穿护盾', type: 'pile', dmg: 430, range: 5.5, lunge: 26, cd: 1.3, cost: 20, sfx: 'pile' },
  sticky: { slot: 'arm', name: 'SB-5 粘性炸弹', en: 'SB-5 Sticky Launcher', desc: '低弧线粘弹 · 粘在敌机或地面上 1.2 秒后引爆 · 同一目标上每多一颗伤害 +25%', type: 'bullet', grenade: true, sticky: true, rate: 0.4, dmg: 60, splash: 5, speed: 95, grav: 14, spread: 0.006, mag: 6, reload: 2.4, color: 0xff5040, sfx: 'grenade', recoil: 0.45 },
  tractor: { slot: 'arm', name: 'TB-3 牵引臂', en: 'TB-3 Tractor Beam', desc: '按住抓取 45 m 内准星附近的轻型敌机或油桶，悬在身前并使其瘫痪 · 松开（或 4 秒后）以 55 m/s 掷出：砸中敌机 / 墙 / 地面时爆炸 140，被掷出的敌机再受 240 · 油桶炸成 170 的大爆炸 · 掷出时自动偏向准星附近的敌机', type: 'tractor', range: 45, cone: 0.24, hold: 4, speed: 55, dmg: 140, r: 6, selfDmg: 240, rate: 0.6, mag: 1, reload: 0, sfx: 'hook' },
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
  xswap: { slot: 'shoulder', name: 'XS-1 置换器', en: 'XS-1 Transposer', desc: '与准星附近 75 m 内一台敌机瞬间互换位置 · 被换的敌机眩晕 1.5 秒（重型不眩晕）· 换位后 0.35 秒无敌 · 能把追兵甩给它的同伴，也能一步跨进敌阵 · 9 秒冷却', type: 'xswap', range: 75, cone: 0.21, stun: 1.5, inv: 0.35, cd: 9, sfx: 'blink' },
  antigrav: { slot: 'shoulder', name: 'AG-2 反重力弹', en: 'AG-2 Anti-Grav', desc: '射出反重力弹 · 落点 12 m 内的敌机被托到 10 m 高空悬浮 3 秒（不能移动和开火，受伤 ×1.3），然后摔下 70 伤害 · 飞行敌机也会被摔到地上 · 头目和重型只受 120 伤害', type: 'antigrav', speed: 70, range: 90, R: 12, up: 10, dur: 3, fall: 70, heavy: 120, cd: 12, sfx: 'grav' },
  grav: { slot: 'shoulder', name: 'GW-1 重力井', en: 'GW-1 Gravity Well', desc: '发射奇点 · 3 秒内把周围敌机拖向中心并吞掉敌弹 · 结束时坍缩爆炸', type: 'grav', speed: 75, range: 95, R: 20, pull: 15, dur: 3, dps: 26, burst: 150, burstR: 11, cd: 14, sfx: 'grav' },
  blink: { slot: 'shoulder', name: 'BL-2 跃迁推进器', en: 'BL-2 Blink Drive', desc: '向移动方向瞬移 22 m · 0.35 秒无敌 · 挣断钩锁 · 原地残影 0.3 秒后爆裂 · 2 次充能（各 5.5 秒）', type: 'blink', dist: 22, inv: 0.35, burst: 110, burstR: 9, mag: 2, rech: 5.5, sfx: 'blink' },
  decoy: { slot: 'shoulder', name: 'HD-1 全息诱饵', en: 'HD-1 Holo Decoy', desc: '投射机体全息影像 6 秒 · 吸引敌方火力（头目不易上当）· 被打碎时放出电磁冲击', type: 'decoy', hp: 380, dur: 6, cd: 20, burst: 70, burstR: 11, sfx: 'decoy' },
  orbital: { slot: 'shoulder', name: 'OS-1 轨道打击', en: 'OS-1 Orbital Strike', desc: '标记落点 · 1.4 秒后卫星光柱从天而降 · 半径 9 m 重击 · 落点灼烧 2 秒 · 锁定时卫星跟踪目标直到落下前 0.4 秒', type: 'orbital', dmg: 360, R: 9, delay: 1.4, dps: 40, burnT: 2, range: 170, cd: 13, sfx: 'orbital' },
  pmines: { slot: 'shoulder', name: 'LM-3 跳雷', en: 'LM-3 Bounding Mines', desc: '在身边撒下 4 枚跳雷 · 0.6 秒后布防 · 敌机进入 9 m 水平范围（20 m 高度内）即弹起追击引爆 · 90 伤害 / 6 m · 存在 25 秒', type: 'pmines', n: 4, arm: 0.6, trig: 9, hmax: 20, dmg: 90, R: 6, life: 25, cd: 9, max: 12, sfx: 'minedrop' },
  rewind: { slot: 'shoulder', name: 'RW-3 时间回溯', en: 'RW-3 Rewind', desc: '按下：机体回到 3 秒前的位置，并找回这 3 秒内损失的装甲（最多 30%）· 0.4 秒无敌 · 原地留下的残影 0.5 秒后炸开 60 伤害 / 6 m · 冷却 15 秒', type: 'rewind', cd: 15, back: 3, cap: 0.3, inv: 0.4, burst: 60, burstR: 6 },
  pound: { slot: 'shoulder', name: 'GP-2 俯冲重击', en: 'GP-2 Ground Pound', desc: '空中按下：以 70 m/s 垂直砸向地面 · 落地冲击波的伤害和半径随下落高度增长（20 m 高约 190 伤害 / 11 m），震慑 0.6 秒并击退 · 下砸中受伤减半 · 在地面按下先跃起再砸', type: 'pound', cd: 6, base: 70, per: 6, r0: 6, rPer: 0.25, hMax: 40, hop: 30, hopT: 0.5, dive: 70, stun: 0.6, knock: 18 },
  rod: { slot: 'shoulder', name: 'LR-1 避雷针', en: 'LR-1 Lightning Rod', desc: '在前方 6 m 插下避雷针 14 秒 · 每 0.9 秒放电打 22 m 内最近的敌机（36，再连锁 1 个）· 雷暴里 14 m 内不会被雷劈 · 同时只能有 1 根', type: 'rod', dur: 14, zap: 0.9, dmg: 36, R: 22, chains: 2, cover: 14, cd: 18, sfx: 'sentry' },
  sentry: { slot: 'shoulder', name: 'TR-3 哨戒炮塔', en: 'TR-3 Sentry Turret', desc: '在前方架设自动炮塔 15 秒 · 双管速射 75 m 内敌机 · 吸引部分火力 · 耐久 400 · 同时只能有 1 座', type: 'sentry', hp: 400, dur: 15, dmg: 10, rate: 0.11, range: 75, cd: 22, sfx: 'sentry' },
  saws: { slot: 'shoulder', name: 'SB-4 环绕锯刃', en: 'SB-4 Orbit Saws', desc: '放出 4 片锯刃绕着机体高速旋转 8 秒，半径在 4–13 m 之间来回伸缩 · 每片切中 30 伤害（头目一半），同一目标 0.3 秒一次 · 碰到的敌方子弹 / 导弹 / 炮弹直接切碎', type: 'saws', n: 4, dur: 8, rMin: 3.5, rMax: 11, period: 2.2, spin: 4.4, dmg: 45, bossK: 0.5, hitCd: 0.3, cutR: 1.8, cd: 13, sfx: 'blade' },
  nanocloud: { slot: 'shoulder', name: 'NC-2 纳米云', en: 'NC-2 Nanite Cloud', desc: '在机体周围放出 10 m 纳米虫群 8 秒，跟着你走 · 云里的敌机每秒受 45 伤害（头目一半）· 飞进云里的敌方子弹 / 导弹 / 炮弹有一半被吃掉', type: 'nanocloud', R: 10, dur: 8, dps: 45, bossK: 0.5, eat: 0.5, cd: 15, sfx: 'stasis' },
  stasis: { slot: 'shoulder', name: 'TS-1 时滞场', en: 'TS-1 Stasis Field', desc: '在准星处展开 14 m 时滞球 5 秒 · 球内敌机动作放慢到三成、敌弹几乎停在空中 · 头目只放慢一半', type: 'stasis', range: 60, R: 14, dur: 5, k: 0.3, bossK: 0.6, shotK: 0.12, cd: 17, sfx: 'stasis' },
  bwall: { slot: 'shoulder', name: 'BP-4 推进屏障', en: 'BP-4 Barrier Ram', desc: '在身前立起 11 m 宽的能量墙并以 16 m/s 向前推进 35 m · 挡下迎面的敌方子弹、炮弹与导弹 · 撞上的敌机（头目除外）被推着走，撞上墙壁再受重击并瘫痪 0.8 秒 · 冷却 11 秒', type: 'bwall', W: 11, H: 7, speed: 16, dur: 2.2, dmg: 70, slam: 90, bossDmg: 40, stun: 0.8, cd: 11, sfx: 'shield' },
  chainb: { slot: 'shoulder', name: 'LK-3 连锁信标', en: 'LK-3 Link Beacon', desc: '射出信标 · 命中处 18 m 内最多 5 台敌机被连接 9 秒 · 你对其中任何一台造成的伤害，其余每台再受 40%（头目只受一半）· 冷却 14 秒', type: 'chainb', speed: 85, R: 18, max: 5, dur: 9, share: 0.4, cd: 14, sfx: 'grenade' },
  camo: { slot: 'shoulder', name: 'OC-1 光学迷彩', en: 'OC-1 Optical Camo', desc: '隐身 7 秒 · 敌人看不见 10 m 外的你（头目 16 m），只会朝你隐身时的位置开火，来袭导弹失去锁定 · 隐身中造成的伤害 ×1.5，命中后 0.8 秒现形 · 冷却 20 秒', type: 'camo', dur: 7, cd: 20, sfx: 'decoy' },
  hack: { slot: 'shoulder', name: 'HK-1 入侵模块', en: 'HK-1 Hack Module', desc: '发射追踪入侵飞镖 · 命中普通敌机后上传 0.8 秒，使其倒戈 10 秒：替你攻击附近的敌人、吸引敌方火力 · 头目 / 大型目标 / 部分特殊兵种无法入侵：改为 150 伤害并瘫痪 1.5 秒 · 冷却 16 秒', type: 'hack', speed: 110, cd: 16, dur: 10, up: 0.8, fail: 150, stun: 1.5, sfx: 'cannon' },
  ciws: { slot: 'shoulder', name: 'PD-3 近防炮', en: 'PD-3 CIWS', desc: '按下后肩部近防炮自动开火 8 秒 · 优先击落 45 m 内来袭的导弹 / 炮弹 / 巡航导弹（每发约一半几率打爆），其次扫射 35 m 内的无人机等小型飞行敌机 · 冷却 15 秒', type: 'ciws', dur: 8, cd: 15, R: 45, airR: 35, rate: 0.085, dmg: 16, kill: 0.55, sfx: 'gatling' },
  net: { slot: 'shoulder', name: 'NT-4 捕获网', en: 'NT-4 Net Launcher', desc: '发射追踪捕获网 · 地面敌机被缠住 2.5 秒无法移动（仍能开火）· 小型飞行敌机直接被网落（140 伤害）· 头目与大型目标减速 40% · 信使被缠住 3 秒：车速 −65%、受到伤害 +30% · 冷却 7 秒', type: 'net', dmg: 30, air: 140, root: 2.5, speed: 70, cd: 7, sfx: 'cannon' },
  smoke: { slot: 'shoulder', name: 'SM-2 烟幕弹', en: 'SM-2 Smoke Screen', desc: '在身前炸开 12 m 烟幕 8 秒 · 烟幕外的敌人看不穿它，无法瞄准烟里的你 · 已发射的导弹照样追踪', type: 'smoke', R: 12, dur: 8, cd: 16, sfx: 'smoke' },
  sonar: { slot: 'shoulder', name: 'SN-1 声呐脉冲', en: 'SN-1 Sonar Pulse', desc: '向四周发出声呐波 · 75 m 内敌机标记 7 秒（受伤 +25%、隐身失效、干扰机停摆）· 近身 10 m 冲击', type: 'sonar', R: 75, mark: 7, vuln: 1.25, bossVuln: 1.12, burst: 45, burstR: 10, cd: 11, sfx: 'sonar' },
  shield: { slot: 'shoulder', name: 'AS-3 能量护盾', en: 'AS-3 Aegis Shield', desc: '展开 3 秒 · 正面伤害 −85%', type: 'shield', dur: 3, cd: 9, block: 0.85, arc: 0.15, sfx: 'shield' },
};
export const ARM_KEYS = ['ecan', 'arc', 'javelin', 'bubble', 'splat', 'isotope', 'plorb', 'tractor', 'drill', 'frag', 'melter', 'siphon', 'acid', 'needler', 'ricochet', 'rifle', 'gatling', 'shotgun', 'flamer', 'cryo', 'grenade', 'sticky', 'coil', 'disc', 'hook', 'sonic', 'flak', 'rail', 'blade', 'pile'];
export const SHOULDER_KEYS = ['xswap', 'antigrav', 'saws', 'nanocloud', 'bwall', 'chainb', 'camo', 'hack', 'ciws', 'net', 'burner', 'repair', 'reflect', 'rewind', 'pound', 'rod', 'pmines', 'missile', 'cannon', 'laser', 'shield', 'drones', 'emp', 'decoy', 'grav', 'orbital', 'blink', 'sonar', 'sentry', 'smoke', 'stasis', 'cluster', 'chaff', 'icewall', 'rockets'];

export function weaponState(key) {
  const d = WEAPONS[key];
  return { key, d, ammo: d.mag || 0, reloadT: 0, cd: 0, spin: 0, chargeT: 0, wasHeld: false, beamT: 0, sndT: 0, fired: 0, windT: 0, side: 1 };
}

const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3();

// ------------------------------------------------------------------ entities for hit tests
function entsFor(team) {
  const out = [];
  if (team === 'P') {
    for (const e of G.enemies) if (e.alive && !e.dying && !e.hacked) { if (e.parts) { for (const pt of e.parts) if (pt.alive) out.push(pt); } else out.push(e); }
    for (const b of barrels) if (!b.dead) out.push(b.ent || (b.ent = { isBarrel: true, b, c: b.pos, r: 1.5, get alive() { return !b.dead; }, hit: (dmg) => hitBarrel(b, dmg) }));
    for (const m of G.mines) if (m.alive) out.push(m);
    for (const w of G.wrecks) if (w.alive) out.push(w.ent);
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
  if (team === 'P' && G.camo && G.camo.t > 0 && !ent.isBarrel) { const lb = label || G.curLabel || ''; if (!isAlly(lb) && !lb.startsWith('hack')) { G.camoBonus = (G.camoBonus || 0) + dmg * (CAMO.dmg - 1); dmg *= CAMO.dmg; if (G.camo.revT < 0) G.camo.revT = CAMO.grace; } }
  if (team === 'P') { const h = ent.kind === 'cpart' ? ent.owner : ent; if (h.stunT > 0) dmg *= STUN_VULN; if (h.markT > 0) dmg *= h.maxHp > 3000 ? WEAPONS.sonar.bossVuln : WEAPONS.sonar.vuln; if (h.corr > 0) { G.corrBonus = (G.corrBonus || 0) + dmg * CORR.per * h.corr; dmg *= 1 + CORR.per * h.corr; } if (h.shroud) { G.shroudBlocked = (G.shroudBlocked || 0) + dmg * (1 - DECAP.shroud); dmg *= DECAP.shroud; } if (h.hornT > 0) { G.hornBlocked = (G.hornBlocked || 0) + dmg * (1 - HERALD.hornK); dmg *= HERALD.hornK; } }   // EMP-stunned targets take extra damage
  if ((team === 'P' || team === 'X') && !G.pierce && !ent.isBarrel && !ent.isMine && !ent.isPlayer && !ent.isAlly && G.player) {   // warden dome: hits from outside are absorbed
    const w = domeAt(ent.c);
    if (w && G.player.pos.distanceTo(w.pos) > w.R) { w.absorb(dmg, domeEntry(w, G.player.center(_c), ent.c, new V3())); if (team === 'P' && !isAlly(label || G.curLabel)) G.stats.hits++; return; }
  }
  { const h = ent.kind === 'cpart' ? ent.owner : ent;
    if (team === 'P' && h.adapt) dmg = h.adaptHit(label || G.curLabel, dmg);
    if (team === 'P' && G.polar && h.pol && !ent.isBarrel && !isAlly(label || G.curLabel)) { const k = h.pol === G.polar.p ? POL.same : POL.opp; if (k > 1) G.polar.oppDmg += dmg * (k - 1); dmg *= k; }   // polarity: opposite charge hits harder
    if (team === 'P' && G.hf && G.hf.h === h && h.kind !== 'boss' && h.kind !== 'raider' && (label || G.curLabel) !== 'p-fuse') { dmg *= FUSE.carrierK; G.hf.shielded = (G.hf.shielded || 0) + dmg; }   // the bomb's field shields its carrier   // adaptor: resists the damage type it adapted to
    if (team === 'P' && G.glad && !isAlly(label || G.curLabel) && !ent.isBarrel) { if (G.glad.h >= GLAD.frenzy) { G.gladBonus += dmg * (GLAD.fdmg - 1); dmg *= GLAD.fdmg; } G.glad.lastDmgT = G.time; G.glad.h = Math.min(100, G.glad.h + Math.min(dmg, 200) * (h.kind === 'boss' ? GLAD.bossK : GLAD.dmgK)); }   // a good show keeps them interested
    if (h && !ent.isBarrel) { h._lastLbl = label || G.curLabel || ''; h._lastTeam = team; } }
  ent.hit(dmg, at, label || G.curLabel);
  if (dmg >= 4) hitFlash(ent.kind === 'cpart' ? ent.owner : ent);
  if (team === 'P' && !ent.isBarrel && G.lgroups.length && (label || G.curLabel) !== 'link') { const h = ent.kind === 'cpart' ? ent.owner : ent; if (h.linkG && h.linkG.t > 0 && !isAlly(label || G.curLabel)) linkShare(h, dmg, h.linkG); }
  if (team === 'P' && !ent.isBarrel && !isAlly(label || G.curLabel)) { G.stats.hits++; G.stats.dmgDealt += dmg; G.hud.hit = 0.14; if (G.od && !(G.od.t > 0) && !ent.isCore) G.od.k = Math.min(1, G.od.k + dmg / OD.fill * (G.odGain || 1)); }
}

const BURN_WEAK = 0.75, STUN_VULN = 1.3;
const isAlly = (l) => !!l && l.startsWith('ally');
export function hurtPlayer(dmg, label) { G.curSrc = null; damagePlayer(dmg, null, label); }
function damagePlayer(dmg, src, label) {
  const p = G.player; if (!p || !p.alive || G.godMode || G.blinkInv > 0) return;
  if (G.curShooter && G.curShooter.hacked) return;   // a hacked enemy's direct attacks never hit you
  if (G.polar) { const pp = G.curPol !== undefined ? G.curPol : G.curShooter && G.curShooter.pol; if (pp) { if (pp === G.polar.p) { polAbsorb(dmg); return; } dmg *= POL.hitOpp; } }   // polarity: same charge is absorbed
  const blk = shieldBlock(p, src || G.curSrc);
  if (blk) { G.stats.blocked = (G.stats.blocked || 0) + dmg * blk; if (Math.random() < 0.3) sfx('shield', 0); }
  if (G.curShooter && G.curShooter.rally) { dmg *= HERALD.dmg; G.rallyHits = (G.rallyHits || 0) + 1; }   // rallied by a herald
  if (G.curShooter && G.curShooter.emp) dmg *= SUPPLY.empDmg;   // empowered by a supply crate
  if (G.glad) dmg *= G.glad.h <= GLAD.booed ? GLAD.booDmg : GLAD.arenaDmg;   // the crowd is cheering the other side
  if (G.pound && G.pound.st === 'dive') dmg *= 0.5;
  if (G.curShooter && G.curShooter.gooT > 0) dmg *= TURF.gooHit;   // goo-blinded: its direct hits land poorly
  if (G.atom && G.atom.dose > 0) { const k = Math.min(G.atom.dose, ATOM.vulnCap) / ATOM.vulnK; G.atomBonus = (G.atomBonus || 0) + dmg * k; dmg *= 1 + k; }   // irradiated armour
  if (G.refl && G.refl.t > 0) dmg *= 1 - G.refl.d.cut;
  if (G.burn && G.burn.t > 0) dmg *= 1 - G.burn.d.cut;   // afterburner   // reflector: what it can't bounce, it softens
  if (G.curShooter && G.curShooter.burnT > 0) dmg *= BURN_WEAK;   // direct hits (melee, beams) from a burning enemy
  const d = dmg * G.diff.dmg * p.frame.armor * (1 - blk) * (G.od && G.od.t > 0 ? OD.armor : 1);
  G.dmgLog = G.dmgLog || {}; G.dmgLog[label || '?'] = (G.dmgLog[label || '?'] || 0) + d;
  p.hit(d); G.stats.dmgTaken += d; if (G.salv) salvHit(d); G.hud.hurt = Math.min(1, G.hud.hurt + d / 120); G.hurtAt = G.time;
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
  if (team === 'E' && G.curShooter && G.curShooter.hacked) team = 'P';
  if (team !== 'E' && G.webs.length) for (const w of G.webs) if (Math.hypot(w.x - pos.x, w.z - pos.z) < w.R + radius && pos.y - w.y < radius + 3) w.hp -= dmg * 1.5;   // blasts tear webs apart
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
  if (o.web) s.web = true;
  if (o.goo) s.goo = true; if (o.pglob) s.pglob = true; if (o.bub) s.bub = true;
  if (s.team === 'E' && G.curShooter && G.curShooter.hacked) { s.team = 'P'; s.dmg *= HACK.dmg; s.label = 'hack-' + G.curShooter.kind; s.target = null; G.hackShots = (G.hackShots || 0) + 1; G.shots.push(s); return s; }
  if (s.team === 'E' && G.polar && G.curShooter && G.curShooter.pol) { const sh = G.curShooter, x = sh.kind === 'boss' || sh.kind === 'raider'; if (x) sh._pa = !sh._pa; s.pol = x && sh._pa ? (sh.pol === 'R' ? 'B' : 'R') : sh.pol; s.color = POL.col[s.pol]; }   // heavies fire both colours, shot by shot
  if (s.team === 'E' && G.curShooter) G.curShooter.pingT = FOG.ping;   // fog harbour: firing shows you on the radar
  if (s.team === 'E' && G.curShooter && G.curShooter.rally) s.dmg *= HERALD.dmg;
  if (s.team === 'E' && s.label === 'marshal') s.dmg *= DECAP.gunK;
  if (s.team === 'E' && s.label === 'adaptor') s.dmg *= ADAPT.gunK;
  if (s.team === 'E' && G.curShooter && G.curShooter.emp) s.dmg *= SUPPLY.empDmg;
  if (s.team === 'E' && G.curShooter && G.curShooter.burnT > 0) s.dmg *= BURN_WEAK;   // burning enemies fire weakened shots
  if (s.team === 'E' && G.curShooter && G.curShooter.gooT > 0) {   // splat goo on its optics: the shot flies wide
    const k = TURF.gooDev * (G.curShooter.maxHp > 3000 ? 0.5 : 1) * s.speed;
    s.v.x += (Math.random() - 0.5) * 2 * k; s.v.y += (Math.random() - 0.5) * 1.2 * k; s.v.z += (Math.random() - 0.5) * 2 * k; s.v.setLength(s.speed);
    if (s.target) s.target = null; if (s.aim) { s.aim.x += (Math.random() - 0.5) * 16; s.aim.z += (Math.random() - 0.5) * 16; }
    G.gooMiss = (G.gooMiss || 0) + 1;
  }
  G.shots.push(s);
  return s;
}

// hit flash: a hit swaps the target's meshes to a brightened clone of their material for a few frames.
// clones keep the source's onBeforeCompile (wear) and cache key, so no new shader program is built.
const _hfCache = new Map(), HF = [];
function hfMat(m) {
  let f = _hfCache.get(m);
  if (!f) {
    f = m.clone(); f.onBeforeCompile = m.onBeforeCompile; if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) f.customProgramCacheKey = m.customProgramCacheKey;
    if (f.emissive) { f.emissive.setHex(0xffe2c0); f.emissiveIntensity = 0.4 + (m.emissiveIntensity || 0) * (m.emissive ? Math.max(m.emissive.r, m.emissive.g, m.emissive.b) : 0); }
    f.userData.hfSrc = m; _hfCache.set(m, f);
  }
  return f;
}
function hitFlash(e) {
  if (!e || e.isPlayer || e.isBarrel || e.isMine || e.isAlly || e.holo || e.hacked || e.cloaked || e._vm || e._hm) return;
  const root = e.obj || (e.mech && e.mech.root); if (!root || !root.parent) return;
  if (e._hf || (e._hfCd || 0) > G.time) return;
  const list = [];
  root.traverse((o) => { const m = o.material; if (o.isMesh && m && !Array.isArray(m) && m.isMeshStandardMaterial && !m.transparent && !m.userData.hfSrc && !o.isInstancedMesh) { list.push(o, m); o.material = hfMat(m); } });
  if (list.length) { HF.push({ e, list, t: 0.055 }); e._hf = true; }
  e._hfCd = G.time + 0.14;
}
function unflashAt(i) { const h = HF[i]; for (let j = 0; j < h.list.length; j += 2) { const o = h.list[j]; if (o.material.userData.hfSrc === h.list[j + 1]) o.material = h.list[j + 1]; } h.e._hf = false; HF.splice(i, 1); }
function unflash(e) { for (let i = HF.length - 1; i >= 0; i--) if (HF[i].e === e) unflashAt(i); }
function updateHitFlash(dt) { for (let i = HF.length - 1; i >= 0; i--) { HF[i].t -= dt; if (HF[i].t <= 0 || !HF[i].e.alive) unflashAt(i); } }
// bullet strikes leave a mark on static walls and the floor (normal = the nearest box face)
const MARK_KINDS = new Set(['building', 'wall', 'pillar']), _mn = new THREE.Vector3();
function wallMark(p, sol) {
  if (!G.fx || !G.fx.hole) return;
  if (sol === 'floor') { if ((WATER.on && p.y < WATER.y + 0.2) || PLAT.R) return; _mn.set(0, 1, 0); }
  else {
    if (!sol || !MARK_KINDS.has(sol.kind) || (sol.kind === 'wall' && p.y > 13.6)) return;   // the perimeter wall's collider runs far above its 14 m visual
    const d = [p.x - sol.min.x, sol.max.x - p.x, p.y - sol.min.y, sol.max.y - p.y, p.z - sol.min.z, sol.max.z - p.z];
    let k = 0; for (let i = 1; i < 6; i++) if (d[i] < d[k]) k = i;
    _mn.set(0, 0, 0); _mn.setComponent(k >> 1, k & 1 ? 1 : -1);
  }
  G.fx.hole(p, _mn);
}

function impact(s, at, ent) { if (!G.polar) { impact0(s, at, ent); return; } G.curPol = s.pol || 0; try { impact0(s, at, ent); } finally { G.curPol = undefined; } }
function impact0(s, at, ent) {
  const fx = G.fx; G.curLabel = s.label;
  if (G.turf) turfShot(s, at);
  if (s.goo) { gooSplash(s, at); return; }
  if (s.bub) { bubbleHit(s, at, ent); return; }
  if (s.pglob) { explodeAt(at, s.splash, s.dmg, s.team, 0.6, 0xff2a9a); paintSplash(at, 0xff2a9a); return; }
  if (s.web) { webSplat(s, at, ent); return; }
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
    if (s.decay && ent && ent.alive !== false && !ent.isBarrel && !ent.isPlayer && !ent.isMine && !ent.isAlly) decayAdd(ent, 1);
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
    if (s.team === 'E' && G.refl && G.refl.t > 0 && REFL_KINDS.has(s.kind) && G.player && G.player.alive) {   // RF-2 reflector bubble
      const pc = G.player.center(_c), R = G.refl.d.R;
      if ((s.x - pc.x) ** 2 + (s.y - pc.y) ** 2 + (s.z - pc.z) ** 2 < R * R) { reflectShot(s, pc.clone()); G.refl.hitT = 0.08; }
    }
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
      {   // trail: puffs spaced ~0.7 m along this frame's path so they merge into one plume instead of beads
        const stp = s.speed * dt, n = Math.max(1, Math.min(4, Math.ceil(stp / 0.7)));
        for (let k = 0; k < n; k++) {
          const f = -k / n * dt;
          fx.emit('smoke', { x: s.x + s.v.x * f, y: s.y + s.v.y * f, z: s.z + s.v.z * f, vx: (Math.random() - 0.5) * 0.8, vy: 0.4, vz: (Math.random() - 0.5) * 0.8, life: 0.8 + Math.random() * 0.25, s0: 1.4, s1: 4.0 + Math.random() * 1.2, c0: 0xc8c6c0, c1: 0xa09e98, a0: 0.3, drag: 2 });
        }
      }
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
    if (s.split) {   // frag cannon: burst near an enemy or at the end of its arm
      let near = null;
      for (const e of entsP) if (!e.isBarrel && !e.isMine && e.alive && e.c.distanceTo(_b) < 9 + (e.r || 1) * 0.5) { near = e; break; }
      if (near || s.age >= s.split) { splitFrag(s, _b.clone(), near, entsP); G.shots.splice(i, 1); continue; }
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
    let w = raySolids(_a, _d, L);
    if (s.drill && w.solid && w.solid !== 'floor' && w.solid.kind !== 'barrel' && (s.wallIn || 0) < s.drill) { if (!s.inW) { s.inW = true; G.drillThru = (G.drillThru || 0) + 1; } s.wallIn = (s.wallIn || 0) + 4; _c.copy(_a).addScaledVector(_d, w.t); G.fx.sparks(_c, _d.clone().multiplyScalar(-1), 10, 0xffb060, 14, 0.9, 0.35, 0.3); G.fx.smoke(_c, 2, 1.4, 1.0, 0x9a8468, 0.7, 0.45); s.wasIn = true; w = { t: Infinity, solid: null }; }   // DR-2: bore on through
    if (s.drill && s.wasIn && !pointInSolid(_b) && pointInSolid(_a)) { G.fx.sparks(_a, _d, 12, 0xffb060, 16, 0.8, 0.35, 0.3); G.fx.smoke(_a, 2, 1.4, 1.0, 0x9a8468, 0.7, 0.45); s.wasIn = false; }   // bursting out the far side
    if (s.drill && pointInSolid(_b)) {
      s.wallIn = (s.wallIn || 0) + L; s.wasIn = true;
      if (s.wallIn >= s.drill) { impact(s, _b.clone(), null); G.shots.splice(i, 1); continue; }
    }
    if (h && h.t * L <= w.t) {
      if (s.inW && s.team === 'P') G.drillWallHits = (G.drillWallHits || 0) + 1;
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
      if (s.kind === 'bullet' || s.kind === 'ebullet') wallMark(_c, w.solid);
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
          spawnShot({ p: mp, v: _d.clone().normalize().multiplyScalar(v), dmg: d.dmg * dmgMul, team, kind: 'grenade', splash: d.splash, grav: g, life: 5, color: d.color, sticky: d.sticky && team === 'P', goo: d.goo && team === 'P', bub: d.bub && team === 'P' });
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
          if (d.split && team === 'P') { sh.split = d.split; sh.fragN = d.fragN; sh.fragDmg = d.fragDmg * dmgMul; }
          if (d.bounce && team === 'P') sh.bounce = d.bounce;
          if (d.drill && team === 'P') { sh.drill = d.drill; sh.splash = d.splash; }
          if (d.acid && team === 'P') sh.acid = true;
          if (d.decay && team === 'P') sh.decay = true;
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
  } else if (d.type === 'melter') {
    if (held && ws.reloadT <= 0 && ws.ammo > 0) {
      const mp = owner.muzzlePos(slot, _a).clone(); _d.subVectors(aim, mp).normalize();
      const w = raySolids(mp, _d, d.range), h = rayEnts(mp, _d, w.t, entsFor(enemyTeam)), L = h ? h.t : w.t, end = mp.clone().addScaledVector(_d, L);
      const te = h ? (h.ent.kind === 'cpart' ? h.ent.owner : h.ent) : null;
      if (te && te === ws.mTgt) ws.mT = Math.min(d.ramp, (ws.mT || 0) + dt); else { ws.mTgt = te; ws.mT = 0; }
      const k = ws.mT / d.ramp, dps = d.dps0 + (d.dps1 - d.dps0) * k, fl = 0.85 + Math.random() * 0.3;
      fx.streak(mp, end, (0.5 + 0.9 * k) * fl, k > 0.7 ? 0xffe0a0 : 0xff7a20); fx.streak(mp, end, (0.18 + 0.3 * k) * fl, 0xfff4e0);
      fx.emit('add', { x: end.x, y: end.y, z: end.z, life: 0.06, s0: (1.4 + 2 * k) * fl, c0: 0xffa040 });
      if (Math.random() < 0.3 + 0.5 * k) fx.sparks(end, _d.clone().multiplyScalar(-1), 2, 0xffc060, 12, 0.9, 0.3, 0.25);
      if (h) { dealDamage(h.ent, dps * dmgMul * dt, team, end); if (me) G.meltPeak = Math.max(G.meltPeak || 0, k); }
      else if (w.solid && w.solid !== 'floor' && w.solid.kind === 'barrel') hitBarrel(w.solid.ref, dps * dt);
      while (ws.cd <= 0 && ws.ammo > 0) { ws.cd += d.rate; ws.ammo--; }
      if (me) G.stats.shots++;
      ws.sndT -= dt; if (ws.sndT <= 0) { ws.sndT = 0.11; sfx('laser', dist); }
      mslot.recoil = Math.min(0.06, (mslot.recoil || 0) + dt * 0.3);
      if (ws.ammo <= 0) { startReload(); ws.mT = 0; ws.mTgt = null; }
    } else { if (pressed && ws.ammo <= 0) startReload(); ws.mT = 0; ws.mTgt = null; }
    if (!held && ws.cd < 0) ws.cd = 0;
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
  } else if (d.type === 'saws') {
    if (pressed && ws.cd <= 0 && isP && owner.alive) { ws.cd = d.cd; castSaws(owner, d, dmgMul, me); if (me) G.stats.shots++; }
  } else if (d.type === 'nanocloud') {
    if (pressed && ws.cd <= 0 && isP && owner.alive) { ws.cd = d.cd; castNano(owner, d, dmgMul, me); if (me) G.stats.shots++; }
  } else if (d.type === 'stasis') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; castStasis(owner, slot, d, aim); if (me) G.stats.shots++; }
  } else if (d.type === 'bwall') {
    if (pressed && ws.cd <= 0 && isP && owner.alive) { ws.cd = d.cd; fireBWall(owner, d, dmgMul); if (me) G.stats.shots++; }
  } else if (d.type === 'chainb') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; fireLinkB(owner, slot, d, aim, target); if (me) G.stats.shots++; }
  } else if (d.type === 'camo') {
    if (pressed && ws.cd <= 0 && isP && !(G.camo && G.camo.t > 0)) { ws.cd = d.cd; fireCamo(owner, d); if (me) G.stats.shots++; }
  } else if (d.type === 'hack') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; fireHack(owner, slot, d, dmgMul, aim, target); if (me) G.stats.shots++; }
  } else if (d.type === 'ciws') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; G.ciwsL = G.ciwsL.filter((c) => c.owner !== owner); G.ciwsL.push({ owner, slot, d, mul: dmgMul, t: d.dur, fT: 0, me }); sfx('repair', 0); if (me) G.stats.shots++; }
  } else if (d.type === 'net') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; fireNet(owner, slot, d, dmgMul, aim, target); if (me) G.stats.shots++; }
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
  } else if (d.type === 'xswap') {
    if (pressed && ws.cd <= 0 && isP && owner.alive && xSwap(owner, d, aim)) { ws.cd = d.cd; if (me) G.stats.shots++; }
  } else if (d.type === 'antigrav') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; launchAG(owner, slot, d, dmgMul, aim); sfx('grenade', dist); if (me) G.stats.shots++; }
  } else if (d.type === 'grav') {
    if (pressed && ws.cd <= 0 && isP) { ws.cd = d.cd; launchWell(owner, slot, d, dmgMul, aim); sfx('cannon', dist); if (me) G.stats.shots++; }
  } else if (d.type === 'tractor') {
    let B = G.tbeams.find((b) => b.owner === owner && b.slot === slot && b.st === 'hold');
    if (held && !B && ws.cd <= 0 && isP && owner.alive) {
      const mp = owner.muzzlePos(slot, new V3(), 0).clone(), tg = tractorPick(mp, aim, d);
      if (tg) { B = tractorGrab(owner, slot, d, dmgMul, tg); if (me) G.stats.shots++; mslot.recoil = 0.6; }
      else { ws.cd = 0.3; fx.streak(mp, _a.subVectors(aim, mp).normalize().multiplyScalar(Math.min(d.range, mp.distanceTo(aim))).add(mp), 0.22, 0x40ffc0); }
    }
    if (B && (!held || B.t >= d.hold || !owner.alive)) { tractorThrow(B, aim); ws.cd = d.rate; mslot.recoil = 1; }
  } else if (d.type === 'hook') {
    const out = G.hooks.some((h) => h.owner === owner && h.slot === slot);
    if (held && ws.cd <= 0 && !out && isP && owner.alive) { ws.cd = d.rate; fireHook(owner, slot, d, dmgMul, aim); if (me) G.stats.shots++; mslot.recoil = 1; }
    for (const m of mslot.models) { const hk = m._hook || (m._hook = find(m, 'HK_Head')); if (hk) hk.visible = !out; }
  } else if (d.type === 'plorb') {
    if (held && ws.reloadT <= 0 && ws.cd <= 0 && ws.ammo > 0 && isP) { ws.cd = d.rate; ws.ammo--; firePlOrb(owner, slot, d, dmgMul, aim, me); if (me) { G.stats.shots++; sfx(d.sfx, 0); } mslot.recoil = 1; }
    if (ws.ammo <= 0) startReload();
  } else if (d.type === 'ecan') {
    const odOn = !!(G.od && G.od.t > 0) && owner === G.player;
    if (held && ws.cd <= 0 && isP && owner.alive && (odOn || owner.en >= d.cost + d.reserve)) {
      ws.cd = d.rate; if (!odOn) owner.en -= d.cost; fireCharge(owner, slot, d, dmgMul, aim, me); if (me) { G.stats.shots++; sfx(d.sfx, 0); } mslot.recoil = d.recoil;
    } else if (held && ws.cd <= 0 && me && owner.en < d.cost && !ws.dry) { ws.dry = true; sfx('empty', 0); }
    if (!held) ws.dry = false;
    const ek = owner.maxEn ? Math.max(0, owner.en / owner.maxEn) : 1;
    for (const m of mslot.models) { const c = m._cg || (m._cg = find(m, 'CG_Core')); if (c) c.scale.setScalar(0.5 + 0.9 * ek + (ws.cd > d.rate * 0.5 ? 0.5 : 0)); }
  } else if (d.type === 'arc') {
    if (held && ws.reloadT <= 0 && ws.cd <= 0 && ws.ammo > 0 && isP) { ws.cd = d.rate; ws.ammo--; fireArc(owner, slot, d, dmgMul, aim, me); if (me) { G.stats.shots++; sfx(d.sfx, 0); } mslot.recoil = 1; }
    if (ws.ammo <= 0) startReload();
    for (const m of mslot.models) { const c = m._ac || (m._ac = find(m, 'AC_Coil')); if (c) c.rotation.z += dt * (ws.cd > 0 ? 22 : 3); }
  } else if (d.type === 'javelin') {
    if (held && ws.reloadT <= 0 && ws.cd <= 0 && ws.ammo > 0 && isP) { ws.cd = d.rate; ws.ammo--; fireJav(owner, slot, d, dmgMul, aim); if (me) { G.stats.shots++; sfx(d.sfx, 0); } mslot.recoil = 1; }
    if (ws.ammo <= 0) startReload();
    for (const m of mslot.models) { const sp = m._jv || (m._jv = find(m, 'JV_Spear')); if (sp) sp.visible = ws.ammo > 0 && ws.reloadT <= 0; }
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
  } else if (d.type === 'burner') {
    if (pressed && ws.cd <= 0 && me && owner.alive) { ws.cd = d.cd; G.burn = { t: d.dur, d, mul: dmgMul, slot, hit: new Map() }; sfx('qboost', 0); sfx('od', 0); G.stats.shots++; G.burns = (G.burns || 0) + 1; fx.ring(new V3(owner.pos.x, owner.pos.y + 0.4, owner.pos.z), null, 1, 7, 0.35, 0xff9a40); }
  } else if (d.type === 'repair') {
    if (pressed && ws.cd <= 0 && me && owner.alive) { ws.cd = d.cd; G.rbeam = { t: d.dur, d, mul: dmgMul, slot, tgt: null, sw: 0, aim: aim.clone() }; sfx('repair', 0); G.stats.shots++; }
    if (me && G.rbeam && G.rbeam.t > 0) G.rbeam.aim.copy(aim);
  } else if (d.type === 'reflect') {
    if (pressed && ws.cd <= 0 && me && owner.alive) { ws.cd = d.cd; G.refl = { t: d.dur, d, hitT: 0 }; sfx('shield', 0); G.stats.shots++; fx.ring(owner.center(new V3()), null, 1, d.R, 0.3, 0x80f0ff); }
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
// ---- AG-2 anti-gravity grenade: a teal ball flies to the aim point and opens a 12 m field. Ordinary enemies in it are
// lifted 10 m (kept stunned, so their own update does not snap them back down) and bob for 3 s, then drop and take 70
// on landing; flyers fall to the ground too. Heavies just take 120
const agCore = new THREE.MeshBasicMaterial({ color: 0x9affea, fog: false });
const agGlow = new THREE.MeshBasicMaterial({ color: 0x40ffd8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const agHeavy = (e) => e.kind === 'boss' || e.kind === 'raider' || e.isColossus || e.isTrain || e.isLev || e.isObjective || e.maxHp > 3000 * G.diff.hp;
function launchAG(owner, slot, d, dmgMul, aim) {
  G.agBalls = G.agBalls || [];
  const mp = owner.muzzlePos(slot, new V3(), 0).clone(); _d.subVectors(aim, mp);
  if (!Number.isFinite(_d.x + _d.y + _d.z + mp.x + mp.y + mp.z) || _d.lengthSq() < 1e-6) return;
  let L = Math.min(d.range, _d.length()); _d.normalize();
  const w = raySolids(mp, _d, L); if (w.t < L) L = Math.max(2, w.t - 1);
  const end = mp.clone().addScaledVector(_d, L);
  const o = new THREE.Group(); o.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), agCore)); const halo = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), agGlow.clone()); o.add(halo);
  o.position.copy(mp); G.scene.add(o);
  G.agBalls.push({ o, from: mp, end, fly: Math.max(0.05, L / d.speed), t: 0, d, mul: dmgMul });
}
function updateAG(dt) {
  const fx = G.fx; G.agBalls = G.agBalls || []; G.lifts = G.lifts || [];
  for (let i = G.agBalls.length - 1; i >= 0; i--) {
    const b = G.agBalls[i], d = b.d; b.t += dt;
    b.o.position.lerpVectors(b.from, b.end, Math.min(1, b.t / b.fly));
    fx.emit('add', { x: b.o.position.x, y: b.o.position.y, z: b.o.position.z, life: 0.18, s0: 1.1, s1: 0.2, c0: 0x40ffd8 });
    if (b.t < b.fly) continue;
    const P = b.end; b.o.parent && b.o.parent.remove(b.o); G.agBalls.splice(i, 1);
    fx.flash(P, 0x40ffd8, 30, 26, 0.3); fx.ring(P.clone(), new V3(0, 1, 0), 1, d.R * 1.3, 0.5, 0x60ffe0); fx.ring(P.clone(), null, 1, d.R, 0.4, 0x60ffe0); sfx('grav', G.player.pos.distanceTo(P));
    let n = 0; const prev = G.curLabel; G.curLabel = 'p-antigrav';
    for (const e of G.enemies) {
      if (!e.alive || e.dying || !e.pos || !e.c || e.isMine || e.kind === 'cpart' || NO_PULL.has(e.kind) || e.agT > 0) continue;
      if (Math.hypot(e.c.x - P.x, e.c.z - P.z) > d.R || Math.abs(e.c.y - P.y) > 14) continue;
      if (agHeavy(e)) { if (!e.isObjective) dealDamage(e, d.heavy * b.mul, 'P', e.c, 'p-antigrav'); continue; }
      e.agT = d.dur; n++;
      G.lifts.push({ e, base: e.pos.y, up: d.up, t: d.dur, age: 0, vy: 0, fall: false, d, mul: b.mul, rx: e.obj ? e.obj.rotation.x : 0, rz: e.obj ? e.obj.rotation.z : 0 });
    }
    G.curLabel = prev; G.agLifted = (G.agLifted || 0) + n;
  }
  for (let i = G.lifts.length - 1; i >= 0; i--) {
    const L = G.lifts[i], e = L.e;
    if (!e.alive || e.dying) { e.agT = 0; G.lifts.splice(i, 1); continue; }
    e.stunT = Math.max(e.stunT || 0, 0.2); L.age += dt;
    const y0 = e.pos.y;
    if (!L.fall) {
      L.t -= dt; e.agT = Math.max(0.01, L.t);
      const k = Math.min(1, L.age / 0.6), ease = 1 - (1 - k) * (1 - k);
      e.pos.y = L.base + L.up * ease + Math.sin(L.age * 4) * 0.4;
      if (e.obj) { e.obj.rotation.x = L.rx + Math.sin(L.age * 2.3) * 0.25; e.obj.rotation.z = L.rz + Math.cos(L.age * 1.9) * 0.25; }
      if (Math.random() < 0.5) G.fx.emit('add', { x: e.pos.x + (Math.random() - 0.5) * 3, y: e.pos.y - 0.5, z: e.pos.z + (Math.random() - 0.5) * 3, vy: -3, life: 0.4, s0: 0.6, s1: 0.1, c0: 0x40ffd8 });
      if (L.t <= 0) L.fall = true;
    } else {
      L.vy -= 32 * dt; e.pos.y += L.vy * dt;
      const g = groundAt(e.pos.x, e.pos.z, y0 + 0.5, 1);
      if (e.pos.y <= g) {
        e.pos.y = g; e.agT = 0; e.stunT = Math.max(e.stunT || 0, 0.4); if (e.obj) { e.obj.rotation.x = L.rx; e.obj.rotation.z = L.rz; }
        G.fx.dust(_c.set(e.pos.x, g + 0.3, e.pos.z), 10); G.fx.ring(_c.clone(), new V3(0, 1, 0), 0.5, 5, 0.3, 0xc0fff0);
        const prev = G.curLabel; G.curLabel = 'p-antigrav'; dealDamage(e, L.d.fall * L.mul, 'P', e.c, 'p-antigrav'); G.curLabel = prev; G.agDrops = (G.agDrops || 0) + 1;
        G.lifts.splice(i, 1);
      }
    }
    if (e.c) e.c.y += e.pos.y - y0;
  }
}
// ---- XS-1 transposer: swap places with the enemy nearest the crosshair (within 12 deg, 75 m, line of sight). The enemy
// lands where you stood (on the ground under you if it walks) and is stunned for 1.5 s unless it is heavy; you get a
// moment of invulnerability. Bosses, raiders, multi-part targets and objectives cannot be swapped
const xsNo = (e) => !e.obj || e.isObjective || e.kind === 'cpart' || e.isMine || e.kind === 'boss' || e.kind === 'raider' || e.isColossus || e.isTrain || e.isLev || e.holo || e.cloaked || NO_PULL.has(e.kind) || e.agT > 0 || e.tbHeld;
function xSwap(owner, d, aim) {
  const mp = owner.center(new V3()), dir = new V3().subVectors(aim, mp);
  if (!Number.isFinite(dir.x + dir.y + dir.z) || dir.lengthSq() < 1e-6) return false;
  dir.normalize(); let best = null, bs = d.cone;
  for (const e of G.enemies) {
    if (!e.alive || e.dying || !e.c || !e.pos || xsNo(e)) continue;
    _a.subVectors(e.c, mp); const L = _a.length(); if (L > d.range || L < 5) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, _a.dot(dir) / L)));
    if (ang < bs && clearLine(mp, e.c)) { bs = ang; best = e; }
  }
  if (!best) return false;
  const e = best, from = owner.pos.clone(), to = e.pos.clone(), dc = e.c.y - e.pos.y, fx = G.fx;
  owner.pos.copy(to); if (!e.flying) owner.pos.y = Math.max(to.y, groundAt(to.x, to.z, to.y + 1, 1));
  owner.vel.set(0, Math.max(0, owner.vel.y), 0);
  e.pos.x = from.x; e.pos.z = from.z; e.pos.y = e.flying ? Math.max(from.y + 3, to.y > from.y ? from.y + 6 : from.y + 3) : groundAt(from.x, from.z, from.y + 1, 1);
  e.c.set(e.pos.x, e.pos.y + dc, e.pos.z); if (e.vel) e.vel.set(0, 0, 0);
  if (!agHeavy(e)) e.stunT = Math.max(e.stunT || 0, d.stun);
  G.blinkInv = Math.max(G.blinkInv || 0, d.inv); G.xswaps = (G.xswaps || 0) + 1; if (e.kind === 'nemesis' && G.nem) G.nem.swaps++;
  const a = from.clone().setY(from.y + 2.5), b = owner.pos.clone().setY(owner.pos.y + 2.5);
  fx.streak(a, b, 2.0, 0xb070ff, 0.22); fx.streak(a, b, 0.6, 0xf0e4ff, 0.22);
  fx.flash(a, 0xb070ff, 30, 24, 0.3); fx.flash(b, 0xb070ff, 30, 24, 0.3);
  fx.ring(from.clone(), null, 1, 6, 0.35, 0xb070ff); fx.ring(owner.pos.clone(), null, 1, 6, 0.35, 0xd0b0ff);
  sfx('blink', 0);
  return true;
}
export function clearAG() { for (const b of G.agBalls || []) b.o.parent && b.o.parent.remove(b.o); G.agBalls = []; for (const L of G.lifts || []) L.e.agT = 0; G.lifts = []; }
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
  const hid = camoHidden(from, self);
  if (hid) best = null;
  for (const f of [G.player, ...G.friends]) {
    if (!f || !f.alive || (hid && f === G.player)) continue;
    const w = f === G.player ? 1 : f.foeWBoss && (self.kind === 'boss' || self.kind === 'raider' || self.isColossus || self.isTrain) ? f.foeWBoss : (self.kind === 'drone' || self.kind === 'gunship' ? f.foeWAir ?? f.foeW : f.foeW) ?? 1.15;
    const sc = Math.hypot(f.pos.x - from.x, f.pos.z - from.z) * w;
    if (sc < bs) { bs = sc; best = f; }
  }
  if (!best) best = G.player;
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
  tg() { return this.hacked ? hackTarget(this) : pickTarget(this); }
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
    if (dist < (this.range || 125) && this.checkLos(dt)) {
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
  tyrant: { name: '暴君 TYRANT · 重装指挥机', palette: 'tyrant', pattern: 'tiger', frame: 'heavy', parts: { head: 'radar', core: 'reactor', legs: 'quad', pack: 'tank' }, scale: 1.35, hp: 5200, want: [45, 32],
    phases: [{ R: 'gatling', L: 'rifle', S: 'cannon' }, { R: 'gatling', L: 'coil', S: 'laser' }], mul: { gatling: 0.32, rifle: 0.35, coil: 0.3, cannon: 0.6, laser: 0.45 },
    phase2: ['暴君 · 第二形态', '武装切换：光束炮 / 闪电线圈'] },
  phantom: { name: '幻影 PHANTOM · 强袭机', palette: 'phantom', pattern: 'hex', frame: 'light', parts: { head: 'crest', core: 'sleek', legs: 'rev', pack: 'sprint' }, scale: 1.22, hp: 4300, want: [34, 20], agile: true,
    phases: [{ R: 'rail', L: 'blade', S: 'missile' }, { R: 'gatling', L: 'blade', S: 'laser' }], mul: { rail: 0.25, blade: 0.34, missile: 0.5, gatling: 0.3, laser: 0.42 },
    phase2: ['幻影 · 解除限制', '机动全开：光束炮 / 加特林'] },
};
// Raiders: squad mechs, same AI and weapons as the bosses, no phases, no boss bar
export const RAIDERS = {
  raider: { name: '掠夺者 RAIDER', palette: 'raider', pattern: 'splinter', frame: 'std', parts: { head: 'mono', arms: 'brace', legs: 'tread' }, scale: 1.0, hp: 900, want: [36, 36], phases: [{ R: 'rifle', L: 'shotgun', S: 'missile' }], mul: { rifle: 0.1, shotgun: 0.15, missile: 0.14 } },
  lancer: { name: '枪骑兵 LANCER', palette: 'lancer', pattern: 'digital', frame: 'light', parts: { head: 'hawk', legs: 'hover', pack: 'jumpjet' }, scale: 0.96, hp: 700, want: [24, 24], agile: true, phases: [{ R: 'blade', L: 'gatling', S: 'cannon' }], mul: { blade: 0.13, gatling: 0.1, cannon: 0.2 } },
};
// Echo: the mirror boss copies the player's loadout (player-only gear is swapped for the nearest enemy-capable weapon).
// Phase 2 splits off two weak Shards with the same weapons.
const ECHO_SUB = { xswap: 'missile', antigrav: 'missile', ecan: 'rifle', arc: 'rifle', javelin: 'rail', bubble: 'grenade', splat: 'grenade', saws: 'missile', isotope: 'rifle', plorb: 'coil', nanocloud: 'missile', tractor: 'rifle', bwall: 'missile', chainb: 'missile', camo: 'missile', hack: 'missile', ciws: 'missile', net: 'missile', drill: 'rifle', burner: 'missile', repair: 'missile', reflect: 'missile', frag: 'shotgun', melter: 'rifle', rewind: 'missile', pound: 'missile', siphon: 'rifle', needler: 'rifle', acid: 'rifle', rod: 'missile', ricochet: 'rifle', pmines: 'missile', sticky: 'grenade', rockets: 'missile', icewall: 'missile', chaff: 'missile', cluster: 'cannon', flak: 'gatling', stasis: 'missile', sonic: 'shotgun', smoke: 'missile', hook: 'rifle', pile: 'blade', disc: 'rifle', decoy: 'missile', sentry: 'drones', grav: 'cannon', orbital: 'cannon', emp: 'missile' };
const ECHO_MUL = { rifle: 0.22, gatling: 0.26, shotgun: 0.3, flamer: 0.3, cryo: 0.3, grenade: 0.4, coil: 0.3, rail: 0.25, blade: 0.34, missile: 0.5, cannon: 0.6, laser: 0.45, drones: 0.4, shield: 0 };
export function setEcho(L) {
  const f = (k) => ECHO_SUB[k] || k, lo = { R: f(L.R), L: f(L.L), S: f(L.S) };
  BOSSES.echo = { name: '镜像 ECHO · 复制体', palette: 'echo', frame: L.frame || 'std', parts: L.parts, pattern: L.pattern, scale: 1.15, hp: 6000, want: [32, 26], agile: true, phases: [lo, lo], mul: ECHO_MUL, phase2: ['镜像 · 分裂', '两台镜像碎片加入战斗'] };
  RAIDERS.shard = { name: '镜像碎片 SHARD', palette: 'echo', frame: 'light', scale: 0.85, hp: 500, want: [28, 28], agile: true, phases: [lo], mul: Object.fromEntries(Object.entries(ECHO_MUL).map(([k, v]) => [k, v * 0.35])) };
  return lo;
}
export class Boss {
  constructor(pos, ctx, type = 'tyrant', hpMul = 1) {
    const B = this.B = BOSSES[type] || RAIDERS[type];
    this.kind = 'boss'; this.type = type; this.r = 2.5 * B.scale; this.c = new V3(); this.alive = true; this.dying = false; this.flash = 0;
    this.mech = new Mech(G.scene, ctx, { palette: B.palette, pattern: B.pattern, frame: B.frame, parts: B.parts, cosmetic: true, scale: B.scale, isBoss: true, loadout: B.phases[0], yaw: Math.PI });
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

// ---- v61 Raptor: a fast flag-runner. Raiders run the lanes to your flag and carry it home (slower); the rest hunt you
// at 12-20 m with a five-pellet scattergun and bite when close. When your aim ray sweeps within 2.5 m of one it hops 8 m aside
export const RAPT = { hp: 480, r: 2.0, run: 15, carry: 11, hunt: 12, keep: [12, 20], gunCd: [1.6, 2.2], pel: 5, pdmg: 6, spread: 0.12, gunR: 45, bite: 28, biteR: 7, biteCd: 3, hopCd: [2.6, 3.6], hop: 8, hopT: 0.4, hopR: 2.5, hopP: 0.6, grab: 3.5 };
export const CTF_LANE_X = [-80, 0, 80];
const _rh = new V3(), _ra = new V3();
export class Raptor extends Enemy {
  constructor(pos, raid) {
    super('raptor', 'E_Raptor', pos, RAPT.hp, RAPT.r); this.boom = 1.0;
    this.raid = !!raid; this.vel = new V3(); this.yaw = Math.random() * 6.28; this.st = 'run'; this.gunT = 1 + Math.random(); this.biteT = 1; this.hopT = 1 + Math.random();
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.swT = 2; this.wp = []; this.wpI = 0; this.goal = null; this.A = new V3(); this.B = new V3(); this.ft = 0; this.ph = Math.random() * 6;
    this.lane = CTF_LANE_X[Math.floor(Math.random() * 3)]; this.mode = 'hunt';
    this.c.set(pos.x, pos.y + 3, pos.z);
  }
  plan(gx, gz) {   // run along one of the three lanes (kept clear of buildings) when the goal is far up or down the map
    this.wp.length = 0; this.wpI = 0; this.goal = [gx, gz];
    const dz = gz - this.pos.z;
    if (Math.abs(dz) > 50) {
      const s = Math.sign(dz), L = Math.abs(this.pos.z) > 122 ? this.lane : CTF_LANE_X.reduce((a, b) => Math.abs(b - this.pos.x) < Math.abs(a - this.pos.x) ? b : a);
      this.wp.push([L, this.pos.z + s * 6], [L, Math.abs(gz) > 122 ? gz - s * 2 : gz - s * 12]);
    }
    this.wp.push([gx, gz]);
  }
  hit(dmg, at, label) { if (this.st === 'hop') dmg *= 0.8; super.hit(dmg); }
  update(dt) {
    const P = G.player, tg = this.tg(), pc = tg.center(playerC), S = G.ctf, FP = S && S.flags.P;
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    this.gunT -= dt; this.biteT -= dt; this.hopT -= dt;
    let mode = 'hunt', gx = 0, gz = 0;
    if (FP && FP.carrier === this) { mode = 'carry'; [gx, gz] = CTF.bases.E; }
    else if (FP && this.raid && FP.st !== 'carried') { mode = 'raid'; gx = FP.pos.x; gz = FP.pos.z; }
    this.mode = mode;
    let spd = 0;
    if (this.st === 'hop') {
      this.ft += dt; const k = Math.min(1, this.ft / RAPT.hopT);
      this.pos.x = this.A.x + (this.B.x - this.A.x) * k; this.pos.z = this.A.z + (this.B.z - this.A.z) * k;
      this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.8, 2) + 2.2 * 4 * k * (1 - k);
      if (collideCyl(this.pos, 1.8, 3.5)) this.ft = RAPT.hopT;
      if (Math.random() < 0.7) G.fx.emit('add', { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z, vy: -2, life: 0.18, s0: 1.1, s1: 0.3, c0: 0xffb060, c1: 0xff5020 });
      if (this.ft >= RAPT.hopT) { this.st = 'run'; this.vel.set((this.B.x - this.A.x) / RAPT.hopT * 0.3, 0, (this.B.z - this.A.z) / RAPT.hopT * 0.3); G.fx.dust(_rh.set(this.pos.x, this.pos.y + 0.3, this.pos.z), 3, 2, 5); }
    } else {
      let tx = 0, tz = 0;
      if (mode === 'hunt') {
        this.swT -= dt; if (this.swT <= 0) { this.swT = 1 + Math.random() * 1.5; this.strafe *= -1; }
        this.slideT = Math.max(0, (this.slideT || 0) - dt);
        let toward = dist > RAPT.keep[1] ? 1 : dist < RAPT.keep[0] ? -0.6 : 0; if (this.slideT > 0) toward *= 0.15;
        const sw = this.slideT > 0 ? 1.1 : 0.85;
        tx = (dx / dist * toward - dz / dist * this.strafe * sw) * RAPT.hunt; tz = (dz / dist * toward + dx / dist * this.strafe * sw) * RAPT.hunt;
        this.yaw += angDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 6);
      } else {
        if (!this.goal || Math.hypot(this.goal[0] - gx, this.goal[1] - gz) > 8 || this.lastMode !== mode) this.plan(gx, gz);
        let w = this.wp[Math.min(this.wpI, this.wp.length - 1)];
        while (this.wpI < this.wp.length - 1 && Math.hypot(w[0] - this.pos.x, w[1] - this.pos.z) < 5) w = this.wp[++this.wpI];
        const wx = w[0] - this.pos.x, wz = w[1] - this.pos.z, wl = Math.hypot(wx, wz) || 1, sp = mode === 'carry' ? RAPT.carry : RAPT.run;
        this.slideT = Math.max(0, (this.slideT || 0) - dt);
        const sl = this.slideT > 0 ? 0.9 : 0;
        tx = (wx / wl * (1 - sl * 0.7) - wz / wl * this.strafe * sl) * sp; tz = (wz / wl * (1 - sl * 0.7) + wx / wl * this.strafe * sl) * sp;
        this.yaw += angDiff(Math.atan2(-tx, -tz), this.yaw) * Math.min(1, dt * 7);
        if (mode === 'raid' && Math.hypot(FP.pos.x - this.pos.x, FP.pos.z - this.pos.z) < RAPT.grab) { FP.st = 'carried'; FP.carrier = this; FP.dropT = 0; S.steals++; G.onCTF && G.onCTF('stolen', FP); }
        if (mode === 'carry' && Math.hypot(gx - this.pos.x, gz - this.pos.z) < CTF.capR) { S.lost++; ctfHome(FP); this.raid = false; G.onCTF && G.onCTF('lost', FP); }
      }
      this.lastMode = mode;
      this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-4 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-4 * dt));
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      if (collideCyl(this.pos, 1.8, 3.5)) blockedSlide(this);
      this.pos.x = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.x)); this.pos.z = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.z));
      this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.8, 2);
      spd = Math.hypot(this.vel.x, this.vel.z);
      // dodge-hop: your aim ray passing close makes it jump aside
      if (this.hopT <= 0 && P.alive && G.aimPoint && this.c.distanceTo(P.pos) < 60) {
        P.center(_ra); _rh.subVectors(G.aimPoint, _ra); const L = _rh.length();
        if (L > 1) {
          _rh.multiplyScalar(1 / L); _d.subVectors(this.c, _ra); const al = _d.dot(_rh);
          if (al > 0) {
            const off = Math.sqrt(Math.max(0, _d.lengthSq() - al * al));
            if (off < RAPT.hopR) {
              this.hopT = RAPT.hopCd[0] + Math.random() * (RAPT.hopCd[1] - RAPT.hopCd[0]);
              if (Math.random() < (mode === 'carry' ? RAPT.hopP * 0.7 : RAPT.hopP)) {
                const px = -_rh.z, pz = _rh.x, pl = Math.hypot(px, pz) || 1, side = (_d.x * px + _d.z * pz) >= 0 ? 1 : -1;
                for (const sg of [side, -side]) {
                  const bx = this.pos.x + px / pl * RAPT.hop * sg, bz = this.pos.z + pz / pl * RAPT.hop * sg;
                  if (Math.abs(bx) > ARENA - 6 || Math.abs(bz) > ARENA - 6 || pointInSolid(_c.set(bx, 1, bz), 2)) continue;
                  this.A.copy(this.pos); this.B.set(bx, 0, bz); this.st = 'hop'; this.ft = 0; G.raptorHops = (G.raptorHops || 0) + 1; sfx('jetdive', this.c.distanceTo(P.pos) * 0.6);
                  if (!G.raptorHopSaid && tg === P) { G.raptorHopSaid = true; G.onHint && G.onHint('迅猛机会躲开你的准星 · 换个方向扫，或者用不用瞄准的武器（电弧枪 / 导弹）', 3.5); }
                  break;
                }
              }
            }
          }
        }
      }
    }
    // scattergun + bite
    if (this.st !== 'hop' && dist < RAPT.gunR && this.checkLos(dt) && this.gunT <= 0) {
      this.gunT = (RAPT.gunCd[0] + Math.random() * (RAPT.gunCd[1] - RAPT.gunCd[0])) * (mode === 'carry' ? 1.5 : 1);
      const m = this.n.Muzzle_RP, mp = m ? m.getWorldPosition(new V3()) : this.c.clone(); const aim = lead(mp, 150, _b, tg);
      for (let k = 0; k < RAPT.pel; k++) {
        _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * RAPT.spread; _d.y += (Math.random() - 0.5) * RAPT.spread * 0.6; _d.z += (Math.random() - 0.5) * RAPT.spread;
        spawnShot({ p: mp, v: _d.normalize().multiplyScalar(150), dmg: RAPT.pdmg, team: 'E', kind: 'ebullet', color: 0xffa040, w: 0.22, len: 3.5, life: 0.5, label: 'raptor-gun' });
      }
      G.fx.muzzle(mp, _d, 0xffb050, 1.1); sfx('eshell', dist);
    }
    if (this.st !== 'hop' && this.biteT <= 0 && this.c.distanceTo(pc) < RAPT.biteR) {
      this.biteT = RAPT.biteCd;
      if (tg === P) damagePlayer(RAPT.bite, this, 'raptor-bite'); else if (tg._ent) tg._ent.hit(RAPT.bite, this, 'raptor-bite');
      G.fx.sparks(pc, null, 10, 0xffc080, 12, 1, 0.3, 0.2); sfx('ric', dist);
    }
    // legs / tail / head
    const run = Math.min(1, spd / RAPT.run); this.ph += dt * (4 + spd * 0.8);
    if (this.n.RP_LegL) this.n.RP_LegL.rotation.x = this.st === 'hop' ? -0.5 : Math.sin(this.ph) * 0.75 * run;
    if (this.n.RP_LegR) this.n.RP_LegR.rotation.x = this.st === 'hop' ? -0.5 : -Math.sin(this.ph) * 0.75 * run;
    if (this.n.RP_Tail) this.n.RP_Tail.rotation.y = Math.sin(this.ph * 0.5) * 0.3 * (0.3 + run);
    if (this.n.RP_Head) this.n.RP_Head.rotation.x = Math.sin(this.ph * 2) * 0.06 * run;
    this.obj.rotation.y = this.yaw; this.obj.rotation.x = -0.12 * run;
    this.c.set(this.pos.x, this.pos.y + 3, this.pos.z);
  }
}

// ---- v61 capture the flag: two bases at either end of the map. Touch the red flag to carry it (x0.85 speed) and bring
// it to your pad while your own flag is home to score; raptors raid your flag and run it home. Kill the carrier and touch
// the dropped flag to send it home; a dropped flag returns on its own after 20 s
export const CTF = { pickR: 4.5, capR: 7, slow: 0.85, boost: 0.5, grabT: 1.5, need: 3, foeNeed: 3, ret: 20, bases: { P: [0, 140], E: [0, -140] }, col: { P: 0x38d8ff, E: 0xff3a3a } };
function tintFlag(o, col) {
  o.traverse((m) => {
    if (!m.isMesh || !m.material) return; const n = m.material.name;
    if (n !== 'FlagCloth' && n !== 'FlagGlow') return;
    m.material = m.material.clone();
    if (n === 'FlagCloth') { m.material.color.setHex(col); if (m.material.emissive) { m.material.emissive.setHex(col); m.material.emissiveIntensity = 0.25; } }
    else { m.material.color.setHex(col); m.material.emissive && m.material.emissive.setHex(col); }
  });
}
export function startCTF() {
  const S = G.ctf = { grabK: 0, caps: 0, lost: 0, grabs: 0, returns: 0, carrierKills: 0, steals: 0, needSaidT: 0, flags: {} };
  for (const t of ['P', 'E']) {
    const [x, z] = CTF.bases[t], gy = groundAt(x, z, 0);
    const base = cloneKit('P_FlagBase'); base.position.set(x, gy, z); G.scene.add(base); tintFlag(base, CTF.col[t]);
    const o = cloneKit('P_Flag'); o.position.set(x, gy, z); G.scene.add(o); tintFlag(o, CTF.col[t]);
    S.flags[t] = { team: t, home: new V3(x, gy, z), pos: new V3(x, gy, z), st: 'home', carrier: null, dropT: 0, o, base, cloth: find(o, 'FG_Cloth'), ring: find(base, 'FP_Ring') };
  }
}
export function clearCTF() {
  if (G.ctf) for (const t in G.ctf.flags) { const f = G.ctf.flags[t]; f.o.parent && f.o.parent.remove(f.o); f.base.parent && f.base.parent.remove(f.base); }
  if (G.ctf && G.player) { G.player.slowMul = 1; G.player.boostMul = 1; }
  G.ctf = null;
}
function ctfHome(f) { f.st = 'home'; f.carrier = null; f.pos.copy(f.home); f.dropT = 0; }
function ctfDrop(f, at) { f.st = 'dropped'; f.carrier = null; f.pos.set(at.x, groundAt(at.x, at.z, at.y + 1), at.z); f.dropT = CTF.ret; G.onCTF && G.onCTF('drop', f); }
function updateCTF(dt) {
  const S = G.ctf, P = G.player; if (!S || !P) return;
  const FP = S.flags.P, FE = S.flags.E;
  S.needSaidT -= dt;
  for (const f of [FP, FE]) {
    if (f.st === 'carried') {
      const c = f.carrier;
      if (c === P) { if (!P.alive) ctfDrop(f, P.pos); }
      else if (!c || !c.alive || c.dying || c.gone) { if (c) S.carrierKills++; ctfDrop(f, c ? c.pos : f.pos); }
    } else if (f.st === 'dropped') { f.dropT -= dt; if (f.dropT <= 0) { ctfHome(f); G.onCTF && G.onCTF('reset', f); } }
  }
  if (P.alive && !S.done) {
    const near = (f) => Math.hypot(P.pos.x - f.pos.x, P.pos.z - f.pos.z) < CTF.pickR && P.pos.y - f.pos.y < 7;
    if (FE.st !== 'carried' && near(FE)) {   // pulling the flag takes 1.5 s next to it (a dropped one is instant)
      S.grabK += dt / (FE.st === 'dropped' ? 0.2 : CTF.grabT);
      if (S.grabK >= 1) { S.grabK = 0; FE.st = 'carried'; FE.carrier = P; FE.dropT = 0; S.grabs++; G.onCTF && G.onCTF('grab', FE); }
    } else S.grabK = Math.max(0, S.grabK - dt * 2);
    if (FP.st === 'dropped' && near(FP)) { ctfHome(FP); S.returns++; G.onCTF && G.onCTF('return', FP); }
    if (FE.carrier === P && Math.hypot(P.pos.x - FP.home.x, P.pos.z - FP.home.z) < CTF.capR && P.pos.y - FP.home.y < 9) {
      if (FP.st === 'home') { S.caps++; ctfHome(FE); G.onCTF && G.onCTF('cap', FE); }
      else if (S.needSaidT <= 0) { S.needSaidT = 4; G.onCTF && G.onCTF('needHome', FP); }
    }
  }
  P.slowMul = FE.carrier === P ? CTF.slow : 1; P.boostMul = FE.carrier === P ? CTF.boost : 1;
  for (const f of [FP, FE]) {
    const o = f.o, c = f.carrier;
    if (f.st === 'carried' && c === P) {
      const y = P.legYaw, k = P.scale || 1; o.position.set(P.pos.x + Math.sin(y) * 1.4 * k, P.pos.y + 3.0 * k, P.pos.z + Math.cos(y) * 1.4 * k); o.rotation.set(0, y + Math.PI / 2, 0); o.scale.setScalar(0.85);
    } else if (f.st === 'carried' && c) {
      const m = c.n && c.n.RP_Flag; if (m) m.getWorldPosition(o.position); else o.position.copy(c.pos); o.rotation.set(0, (c.yaw || 0) + Math.PI, 0); o.scale.setScalar(0.8);
    } else {
      o.position.copy(f.pos); o.scale.setScalar(1); o.rotation.set(f.st === 'dropped' ? 0.3 : 0, f.st === 'dropped' ? 0.8 : 0, 0);
      if (f.st === 'dropped' && Math.random() < 0.5) G.fx.emit('add', { x: f.pos.x + (Math.random() - 0.5) * 2, y: f.pos.y + 0.5, z: f.pos.z + (Math.random() - 0.5) * 2, vy: 6, life: 0.6, s0: 0.6, s1: 0.1, c0: CTF.col[f.team] });
    }
    if (f.st === 'carried') f.pos.set(o.position.x, groundAt(o.position.x, o.position.z, o.position.y), o.position.z);
    if (f.cloth) f.cloth.rotation.y = Math.sin(G.time * 3.2 + (f.team === 'P' ? 0 : 1.7)) * 0.28 + (f.st === 'carried' ? 0.5 : 0);
    if (f.ring) { const away = f.st !== 'home'; f.ring.scale.setScalar(away ? 1 + 0.06 * Math.sin(G.time * 8) : 1); f.ring.visible = !away || Math.sin(G.time * 6) > -0.4; }
  }
}

// ---- v64 hunted: a Nemesis hunts you all mission. While its shield holds it only takes 3 % damage, but enough damage
// in a burst staggers it. Five power cells lie around the city; each one you touch lights a snare pylon around the trap
// ring in the middle. With all five lit, the first time the Nemesis steps into the ring the trap fires: the shield
// breaks for good and it is pinned for 7 s taking x1.5. Then it is an ordinary (angry) fight
export const NEM = { hp: 9000, cellT: 2.5, r: 2.6, run: 13.5, rage: 1.12, shieldMul: 0.03, stag: 320, stagT: 1.1, stagCd: 2.5, leapCd: [5, 7], crouch: 0.5, T: 1.1, apex: 11, leapR: 7, leapDmg: 32, clawR: 7.2, clawWind: 0.38, clawDmg: 42, clawCd: 1.5, knock: 15, gunCd: [2.6, 3.4], pel: 6, pdmg: 5, spread: 0.08, gunMin: 12, gunMax: 42, trapT: 7, trapMul: 1.5, trapR: 12, pyR: 19, cellR: 4.5, spawnT: 10 };
NEM.cells = [0, 1, 2, 3, 4].map((k) => { const a = 0.31 + k * 1.2566; return [Math.round(Math.sin(a) * 118), Math.round(Math.cos(a) * 118)]; });
export function nemPylons() { return [0, 1, 2, 3, 4].map((k) => { const a = k * 1.2566 + 0.63; return [Math.sin(a) * NEM.pyR, Math.cos(a) * NEM.pyR]; }); }
const nemShellGeo = new THREE.IcosahedronGeometry(1, 2);
const nemShellMat = new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true, fog: false });
const cellBeamGeo = new THREE.CylinderGeometry(0.5, 0.9, 40, 10, 1, true);
const cellBeamMat = new THREE.MeshBasicMaterial({ color: 0xc8ff30, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const trapMat = new THREE.MeshBasicMaterial({ color: 0xff40c8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const trapBeamMat = new THREE.MeshBasicMaterial({ color: 0xff70d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
export class Nemesis extends Enemy {
  constructor(pos, hpMul = 1) {
    super('nemesis', 'E_Nemesis', pos, NEM.hp * hpMul, NEM.r); this.boom = 2.6; this.B = { name: '追猎者 NEMESIS' };
    this.vel = new V3(); this.yaw = 0; this.st = 'run'; this.stT = 0; this.shield = true; this.stagAcc = 0; this.stagCd = 0;
    this.leapT = 4; this.clawT = 0; this.gunT = 2; this.A = new V3(); this.Bp = new V3(); this.ft = 0; this.ph = 0; this.shellK = 0;
    this.shell = new THREE.Mesh(nemShellGeo, nemShellMat.clone()); G.scene.add(this.shell);
    this.c.set(pos.x, pos.y + 5, pos.z);
  }
  remove() { this.shell.parent && this.shell.parent.remove(this.shell); super.remove(); }
  explode() { G.curLabel = 'p-nemesis'; explodeAt(this.c, 9, 60, 'P', 2.6, 0xff4050); G.fx.trauma = Math.min(1, G.fx.trauma + 0.6); this.remove(); }
  hit(dmg, at, label) {
    if (!this.alive || this.dying) return;
    if (this.shield) {
      this.shellK = 1;
      if (this.stagCd <= 0 && this.st !== 'stag' && this.st !== 'air' && this.st !== 'trap') {
        this.stagAcc += dmg;
        if (this.stagAcc >= NEM.stag * (G.diff.hp || 1)) {
          this.stagAcc = 0; this.st = 'stag'; this.stT = NEM.stagT; G.nem && G.nem.stags++;
          const P = G.player, dx = this.pos.x - P.pos.x, dz = this.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1; this.vel.set(dx / l * 7, 0, dz / l * 7);
          G.fx.sparks(this.c, null, 18, 0xff6070, 14, 1, 0.3, 0.25); sfx('shieldbreak', P.pos.distanceTo(this.pos)); G.onNEM && G.onNEM('stag');
        }
      }
      dmg *= NEM.shieldMul;
    } else if (this.st === 'trap') dmg *= NEM.trapMul;
    super.hit(dmg);
  }
  update(dt) {
    const P = G.player, tg = this.tg(), pc = tg.center(playerC), fx = G.fx, n = this.n;
    this.ph += dt; this.stagCd -= dt; this.clawT -= dt; this.leapT -= dt; this.gunT -= dt; this.shellK = Math.max(0, this.shellK - dt * 3);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1, up = tg.pos.y - this.pos.y;
    const spd = NEM.run * (this.shield ? 1 : NEM.rage);
    let legA = 0, armL = 0, armR = 0, lean = 0.12, face = true;
    if (this.st === 'stag' || this.st === 'trap') {
      this.stT -= dt; this.vel.multiplyScalar(Math.exp(-5 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; collideCyl(this.pos, 2.4, 5);
      lean = this.st === 'trap' ? 0.45 : 0.3; armL = armR = this.st === 'trap' ? 1.1 + 0.15 * Math.sin(this.ph * 20) : -0.5; legA = this.st === 'trap' ? 0.5 : 0; face = false;
      if (this.st === 'trap' && Math.random() < 0.7) fx.sparks(_d.set(this.pos.x + (Math.random() - 0.5) * 3, this.pos.y + 1 + Math.random() * 5, this.pos.z + (Math.random() - 0.5) * 3), null, 2, 0xff60d0, 10, 0.8, 0.3, 0.2);
      if (this.stT <= 0) { if (this.st === 'trap') G.onNEM && G.onNEM('free'); this.st = 'run'; this.stagCd = NEM.stagCd; this.stagAcc = 0; }
    } else if (this.st === 'crouch') {
      this.stT -= dt; lean = 0.4; legA = 0.6; armL = armR = -0.6; this.vel.multiplyScalar(Math.exp(-8 * dt));
      if (this.stT <= 0) {
        const tv = tg === P ? P.vel : (tg.vel || _c.set(0, 0, 0)), T = NEM.T;
        let bx = pc.x + tv.x * T * 0.8, bz = pc.z + tv.z * T * 0.8;
        bx = Math.max(-ARENA + 6, Math.min(ARENA - 6, bx)); bz = Math.max(-ARENA + 6, Math.min(ARENA - 6, bz));
        this.Bp.set(bx, 0, bz); if (pointInSolid(_d.set(bx, 1, bz), 2)) this.Bp.set(tg.pos.x, 0, tg.pos.z);
        this.Bp.y = groundAt(this.Bp.x, this.Bp.z, 99);
        this.A.copy(this.pos); this.st = 'air'; this.ft = 0; G.nem && G.nem.leaps++;
        fx.warn(this.Bp.clone(), NEM.leapR, T); sfx('jetdive', dist * 0.5);
        for (let k = 0; k < 8; k++) fx.dust(_d.set(this.pos.x, this.pos.y + 0.3, this.pos.z), 1, 2.4, 6);
      }
    } else if (this.st === 'air') {
      this.ft += dt; const k = Math.min(1, this.ft / NEM.T); legA = -0.5; armL = armR = 1.4; lean = 0.25;
      this.pos.x = this.A.x + (this.Bp.x - this.A.x) * k; this.pos.z = this.A.z + (this.Bp.z - this.A.z) * k;
      this.pos.y = this.A.y + (this.Bp.y - this.A.y) * k + 4 * NEM.apex * k * (1 - k);
      this.yaw += angDiff(Math.atan2(-(this.Bp.x - this.A.x), -(this.Bp.z - this.A.z)), this.yaw) * Math.min(1, dt * 6); face = false;
      if (Math.random() < 0.8) fx.emit('add', { x: this.pos.x, y: this.pos.y + 4, z: this.pos.z, vy: -6, life: 0.22, s0: 1.5, s1: 0.4, c0: 0xff5060, c1: 0xff2010 });
      if (k >= 1) {
        G.curLabel = 'nem-leap'; explodeAt(this.Bp.clone().setY(this.Bp.y + 0.6), NEM.leapR, NEM.leapDmg, 'E', 1.2, 0xff6070);
        fx.ring(this.Bp.clone().setY(this.Bp.y + 0.3), new V3(0, 1, 0), 1, NEM.leapR, 0.35, 0xff8090);
        if (P.alive && Math.hypot(P.pos.x - this.Bp.x, P.pos.z - this.Bp.z) < NEM.leapR && P.pos.y - this.Bp.y >= 4 && P.pos.y - this.Bp.y < 12) hurtPlayer(NEM.leapDmg * 0.7, 'nem-leap');
        fx.trauma = Math.min(1, fx.trauma + 0.45 * Math.max(0, 1 - this.pos.distanceTo(P.pos) / 50));
        for (let q = 0; q < 10; q++) fx.dust(_d.set(this.Bp.x, this.Bp.y + 0.3, this.Bp.z), 1, 3, 9);
        this.st = 'land'; this.stT = 0.45; this.vel.set(0, 0, 0); this.leapT = NEM.leapCd[0] + Math.random() * (NEM.leapCd[1] - NEM.leapCd[0]);
      }
    } else if (this.st === 'land') {
      this.stT -= dt; lean = 0.4; legA = 0.5; if (this.stT <= 0) this.st = 'run';
    } else if (this.st === 'claw') {
      this.stT -= dt; const k = 1 - Math.max(0, this.stT) / NEM.clawWind; armR = 0.4 + 1.8 * k; armL = 0.2 + 1.2 * k; lean = 0.2 - 0.15 * k;
      this.vel.multiplyScalar(Math.exp(-6 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; collideCyl(this.pos, 2.4, 5);
      if (this.stT <= 0) {
        this.st = 'run'; this.clawT = NEM.clawCd; this.swing = 0.25;
        const fwx = -Math.sin(this.yaw), fwz = -Math.cos(this.yaw);
        fx.ring(_d.set(this.pos.x + fwx * 3, this.pos.y + 3.5, this.pos.z + fwz * 3), null, 1, 6, 0.25, 0xff4050);
        for (let q = 0; q < 8; q++) fx.emit('add', { x: this.pos.x + fwx * 4 + (Math.random() - 0.5) * 4, y: this.pos.y + 2 + Math.random() * 4, z: this.pos.z + fwz * 4 + (Math.random() - 0.5) * 4, life: 0.2, s0: 1.2, s1: 0.2, c0: 0xff5060 });
        sfx('blade', P.pos.distanceTo(this.pos));
        for (const f of [P, ...G.friends]) {
          if (!f || !f.alive || !f.pos) continue;
          const fx2 = f.pos.x - this.pos.x, fz2 = f.pos.z - this.pos.z, fl = Math.hypot(fx2, fz2) || 1;
          if (fl > NEM.clawR || Math.abs(f.pos.y - this.pos.y) > 5 || (fx2 * fwx + fz2 * fwz) / fl < -0.2) continue;
          if (f === P) { damagePlayer(NEM.clawDmg, this, 'nem-claw'); P.vel.x += fx2 / fl * NEM.knock; P.vel.z += fz2 / fl * NEM.knock; P.vel.y = Math.max(P.vel.y, 6); P.grounded = false; if (G.nem) G.nem.claws++; fx.trauma = Math.min(1, fx.trauma + 0.5); }
          else if (f._ent) f._ent.hit(NEM.clawDmg * 2, this, 'nem-claw');
        }
      }
    } else {   // run it down
      const want = dist > 4 ? spd : 0;
      const tx = dx / dist * want, tz = dz / dist * want;
      this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-4 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-4 * dt));
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      if (collideCyl(this.pos, 2.4, 5)) blockedSlide(this);
      const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 2, 1); this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 10);
      legA = Math.sin(this.ph * 9) * 0.7 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 8); armL = -legA * 0.6; armR = legA * 0.6; lean = 0.22;
      if (dist < NEM.clawR - 1 && Math.abs(up) < 5 && this.clawT <= 0) { this.st = 'claw'; this.stT = NEM.clawWind; sfx('warn', P.pos.distanceTo(this.pos)); }
      else if (this.leapT <= 0 && (up > 6 || dist > 48) && dist < 95) { this.st = 'crouch'; this.stT = NEM.crouch; }
      else if (dist > NEM.gunMin && dist < NEM.gunMax && this.gunT <= 0 && this.checkLos(dt)) {
        this.gunT = NEM.gunCd[0] + Math.random() * (NEM.gunCd[1] - NEM.gunCd[0]);
        const m = n.Muzzle_NM, mp = m ? m.getWorldPosition(new V3()) : this.c.clone(), aim = lead(mp, 150, _b, tg);
        for (let k = 0; k < NEM.pel; k++) {
          _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * NEM.spread; _d.y += (Math.random() - 0.5) * NEM.spread * 0.6; _d.z += (Math.random() - 0.5) * NEM.spread;
          spawnShot({ p: mp, v: _d.normalize().multiplyScalar(150), dmg: NEM.pdmg, team: 'E', kind: 'ebullet', color: 0xff5060, w: 0.24, len: 4, life: 0.6, label: 'nem-gun' });
        }
        fx.muzzle(mp, _d, 0xff6070, 1.3); sfx('eshell', dist);
      }
    }
    if (face) this.yaw += angDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 6);
    this.obj.rotation.y = this.yaw; this.obj.rotation.x = 0;
    if (n.NM_LegL) { n.NM_LegL.rotation.x = legA; n.NM_LegR.rotation.x = -legA; }
    if (n.NM_ArmL) { n.NM_ArmL.rotation.x += (armL - n.NM_ArmL.rotation.x) * Math.min(1, dt * 14); n.NM_ArmR.rotation.x += (armR - n.NM_ArmR.rotation.x) * Math.min(1, dt * 14); }
    if (n.NM_Head) n.NM_Head.rotation.x = -lean * 0.6;
    this.c.set(this.pos.x, this.pos.y + 5 - lean * 1.5, this.pos.z);
    const sh = this.shell; sh.visible = this.shield && this.st !== 'trap';
    if (sh.visible) { sh.position.set(this.pos.x, this.pos.y + 4, this.pos.z); sh.scale.set(3.4, 4.6, 3.4); sh.rotation.y = this.ph * 0.4; sh.material.opacity = 0.07 + 0.05 * Math.sin(this.ph * 5) + 0.35 * this.shellK; }
  }
}
export function startHunted() {
  clearHunted();
  const S = G.nem = { cells: [], pylons: [], got: 0, armed: false, fired: false, claws: 0, stags: 0, leaps: 0, swaps: 0, ent: null, ring: null, disc: null };
  for (const [x, z] of NEM.cells) {
    const o = cloneKit('P_PowerCell'); o.position.set(x, groundAt(x, z, 99), z); G.scene.add(o);
    const beam = new THREE.Mesh(cellBeamGeo, cellBeamMat); beam.position.set(x, o.position.y + 21, z); G.scene.add(beam);
    S.cells.push({ x, z, o, beam, got: false, core: nodes(o).PC_Core });
  }
  for (const [x, z] of nemPylons()) {
    const o = cloneKit('P_Snare'); o.position.set(x, 0, z); o.rotation.y = Math.atan2(x, z); G.scene.add(o);
    const lamp = nodes(o).NS_Lamp; if (lamp) lamp.visible = false;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1, 8, 1, true).rotateX(Math.PI / 2), trapBeamMat.clone());
    const L = Math.hypot(x, z); beam.position.set(x / 2, 5.4, z / 2); beam.scale.set(1, 1, L); beam.lookAt(0, 5.4, 0); G.scene.add(beam);
    S.pylons.push({ x, z, o, lamp, beam, lit: false, solid: addSolid(x, z, 2.4, 2.4, 6.2, 0, 'snare') });
  }
  S.ring = new THREE.Mesh(new THREE.RingGeometry(NEM.trapR - 0.7, NEM.trapR, 72).rotateX(-Math.PI / 2), trapMat.clone()); S.ring.position.set(0, 0.09, 0); G.scene.add(S.ring);
  S.disc = new THREE.Mesh(new THREE.CircleGeometry(NEM.trapR - 0.7, 72).rotateX(-Math.PI / 2), trapMat.clone()); S.disc.material.opacity = 0.04; S.disc.position.set(0, 0.07, 0); G.scene.add(S.disc);
}
export function clearHunted() {
  const S = G.nem; if (!S) return;
  for (const c of S.cells) { c.o.parent && c.o.parent.remove(c.o); c.beam.parent && c.beam.parent.remove(c.beam); }
  for (const q of S.pylons) { q.o.parent && q.o.parent.remove(q.o); q.beam.parent && q.beam.parent.remove(q.beam); if (q.solid) removeSolid(q.solid); }
  for (const m of [S.ring, S.disc]) m && m.parent && m.parent.remove(m);
  G.nem = null;
}
function updateHunted(dt) {
  const S = G.nem; if (!S) return;
  const P = G.player, fx = G.fx, t = G.time, N = S.ent;
  for (const c of S.cells) {
    if (c.got) continue;
    if (c.core) c.core.rotation.y += dt * 2.5;
    c.beam.material.opacity = 0.16 + 0.08 * Math.sin(t * 4 + c.x);
    const on = P && P.alive && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < NEM.cellR && P.pos.y - c.o.position.y < 3;
    c.k = Math.max(0, (c.k || 0) + (on ? dt : -dt * 0.5)); S.ext = on ? c : S.ext === c ? null : S.ext;
    if (on && Math.random() < 0.6) fx.emit('add', { x: c.x + (Math.random() - 0.5) * 2, y: c.o.position.y + 1 + Math.random() * 2, z: c.z + (Math.random() - 0.5) * 2, vy: 6, life: 0.4, s0: 0.7, s1: 0.1, c0: 0xc8ff30 });
    if (c.core) c.core.position.y = 1.3 + Math.min(1, c.k / NEM.cellT) * 1.2;
    if (c.k >= NEM.cellT) {
      c.got = true; S.ext = null; c.o.parent && c.o.parent.remove(c.o); c.beam.parent && c.beam.parent.remove(c.beam);
      const q = S.pylons[S.got]; S.got++;
      if (q) { q.lit = true; if (q.lamp) q.lamp.visible = true; fx.flash(new V3(q.x, 6.3, q.z), 0xff40c8, 30, 20, 0.4); }
      fx.flash(new V3(c.x, c.o.position.y + 1.5, c.z), 0xc8ff30, 40, 26, 0.4); fx.ring(new V3(c.x, c.o.position.y + 0.4, c.z), null, 1, 8, 0.4, 0xc8ff30); sfx('repair', 0);
      if (S.got >= S.cells.length) S.armed = true;
      G.onNEM && G.onNEM(S.armed ? 'armed' : 'cell', S.got);
    }
  }
  const armedK = S.fired ? 0.15 : S.armed ? 0.55 + 0.25 * Math.sin(t * 6) : 0.12 + 0.05 * S.got;
  S.ring.material.opacity = armedK; S.disc.material.opacity = S.armed && !S.fired ? 0.08 + 0.04 * Math.sin(t * 6) : 0.03;
  for (const q of S.pylons) { if (q.lamp && q.lit) q.lamp.scale.setScalar(1 + 0.15 * Math.sin(t * 7 + q.x)); q.beam.material.opacity = S.armed && !S.fired ? 0.35 + 0.2 * Math.sin(t * 10 + q.z) : Math.max(0, q.beam.material.opacity - dt * 0.6); }
  if (S.armed && !S.fired && N && N.alive && !N.dying && N.st !== 'air' && N.st !== 'crouch' && Math.hypot(N.pos.x, N.pos.z) < NEM.trapR) {
    S.fired = true; N.shield = false; N.st = 'trap'; N.stT = NEM.trapT; N.vel.set(0, 0, 0);
    for (const q of S.pylons) { q.beam.material.opacity = 1; fx.streak(new V3(q.x, 6.3, q.z), N.c.clone(), 1.6, 0xff40c8, 0.5); }
    fx.flash(N.c, 0xff40c8, 90, 40, 0.6); fx.ring(new V3(N.pos.x, 0.5, N.pos.z), new V3(0, 1, 0), 2, NEM.trapR * 1.6, 0.6, 0xff70d8); fx.trauma = Math.min(1, fx.trauma + 0.6);
    sfx('shieldbreak', 0); sfx('bigboom', P ? P.pos.distanceTo(N.pos) : 0);
    G.onNEM && G.onNEM('trap');
  }
}

// ---- v63 aerie: four armoured decks float 24-45 m up, each held by a lift engine (AeroGen) with a turret beside it.
// A jump pad on the ground next to each deck throws you onto it (a scripted 1.7 s arc). Destroying an engine drops its
// deck: it falls and crashes, crushing whatever is below (220 to enemies, 60 to you)
export const AER = { decks: [{ x: 92, z: 36, h: 24 }, { x: -92, z: -36, h: 31 }, { x: 36, z: -96, h: 38 }, { x: -36, z: 96, h: 45 }], W: 26, T: 2, padD: 30, padR: 3.4, rideT: 1.7, arc: 12, genHp: 4200, crashR: 16, crashDmg: 220, crashP: 60 };
export function aerPads() { return AER.decks.map((D) => { const L = Math.hypot(D.x, D.z), ux = -D.x / L, uz = -D.z / L; return [D.x + ux * AER.padD, D.z + uz * AER.padD]; }); }
const deckMat = new THREE.MeshStandardMaterial({ color: 0x5a6270, metalness: 0.3, roughness: 0.78 });
const deckMat2 = new THREE.MeshStandardMaterial({ color: 0x2e333c, metalness: 0.5, roughness: 0.6 });
const aerGlow = new THREE.MeshBasicMaterial({ color: 0x9ae6ff });
const aerBeam = new THREE.MeshBasicMaterial({ color: 0x58c8ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const padMat = new THREE.MeshBasicMaterial({ color: 0x58ffc8 });
function makeDeck(D) {
  const g = new THREE.Group(), W = AER.W, T = AER.T;
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, T, W), deckMat); top.position.y = -T / 2; top.castShadow = true; top.receiveShadow = true; g.add(top);
  const under = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 2.4, W * 0.7), deckMat2); under.position.y = -T - 1.2; under.castShadow = true; g.add(under);
  for (const [sx, sz, w, d] of [[0, W / 2, W, 0.4], [0, -W / 2, W, 0.4], [W / 2, 0, 0.4, W], [-W / 2, 0, 0.4, W]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), aerGlow); b.position.set(sx, 0.05, sz); g.add(b); }
  const beams = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const th = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 2.4, 12), deckMat2); th.position.set(sx * W * 0.32, -T - 1.6, sz * W * 0.32); g.add(th);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16), aerGlow); disc.rotation.x = Math.PI / 2; disc.position.set(sx * W * 0.32, -T - 2.85, sz * W * 0.32); g.add(disc);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 4.0, 14, 16, 1, true), aerBeam); cone.position.set(sx * W * 0.32, -T - 9.9, sz * W * 0.32); g.add(cone); beams.push(cone);
  }
  g.position.set(D.x, D.h, D.z); G.scene.add(g);
  return { g, beams };
}
function makePad(x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(AER.padR + 0.6, AER.padR + 1.0, 0.5, 24), deckMat2); base.position.y = 0.25; base.receiveShadow = true; g.add(base);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(AER.padR, 0.18, 6, 32), padMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.55; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(AER.padR * 0.55, 0.12, 6, 24), padMat); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.55; g.add(ring2);
  g.position.set(x, 0, z); G.scene.add(g); return { g, ring, x, z };
}
export class AeroGen extends Enemy {
  constructor(D) {
    super('aerogen', 'E_AeroGen', new V3(D.x, D.h, D.z), AER.genHp, 3.0); this.boom = 2.2; this.isObjective = true; this.deck = D;
    this.solids = [addSolid(D.x, D.z, 6, 6, 1.8, D.h, 'aerogen')];
    this.c.set(D.x, D.h + 6.2, D.z);
  }
  die() {
    for (const so of this.solids) removeSolid(so);
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c.clone(), 9, 40, 'P', 2.4, 0x58c8ff); G.fx.flash(this.c, 0x9ae6ff, 60, 30, 0.5);
    const D = this.deck; D.dead = true;
    if (D.solid) { removeSolid(D.solid); D.solid = null; }
    D.vy = 0; D.fallT = 0; D.falling = true;
    for (const e of G.enemies) if (e.alive && !e.dying && e.onDeck === D && e !== this) dealDamage(e, 1e6, 'P', e.c, 'aer-fall');
    G.onAER && G.onAER('gen', D);
    this.remove();
  }
  update(dt) {
    const n = this.n; this.ph = (this.ph || 0) + dt;
    if (n.AE_Ring) n.AE_Ring.rotation.y += dt * 2.2;
    if (n.AE_Core) { n.AE_Core.getWorldPosition(this.c); n.AE_Core.scale.setScalar(1 + 0.12 * Math.sin(this.ph * 6)); }
  }
}
export function startAerie() {
  clearAerie();
  const S = G.aer = { decks: [], pads: [], ride: null, padCd: 0, rides: 0, dropped: 0, crushed: 0, slams: 0 };
  const pads = aerPads();
  AER.decks.forEach((D0, i) => {
    const D = { ...D0, i, dead: false, falling: false };
    D.solid = addSolid(D.x, D.z, AER.W, AER.W, AER.T, D.h - AER.T, 'deck');
    D.mesh = makeDeck(D); D.gen = new AeroGen(D);
    { const L = Math.hypot(D.x, D.z), t = new Turret(new V3(D.x + D.x / L * 8.5, D.h, D.z + D.z / L * 8.5)); t.onDeck = D; t.range = 60; }   // one turret, on the far side from the pad
    S.decks.push(D);
    const [px, pz] = pads[i]; const pad = makePad(px, pz); pad.D = D; S.pads.push(pad);
  });
}
export function clearAerie() {
  const S = G.aer; if (!S) return;
  for (const D of S.decks) { if (D.solid) removeSolid(D.solid); D.mesh.g.parent && D.mesh.g.parent.remove(D.mesh.g); }
  for (const p of S.pads) p.g.parent && p.g.parent.remove(p.g);
  G.aer = null;
}
function updateAerie(dt) {
  const S = G.aer; if (!S) return;
  const P = G.player, fx = G.fx, t = G.time;
  for (const D of S.decks) {
    const M = D.mesh;
    if (!D.falling) { for (const b of M.beams) b.material.opacity = 0.1 + 0.04 * Math.sin(t * 9 + D.i); if (D.dead) continue; continue; }
    if (D.crashed) { D.fallT += dt; if (D.fallT > 2.5 && M.g.parent) M.g.parent.remove(M.g); continue; }
    D.vy -= 22 * dt; M.g.position.y += D.vy * dt; M.g.rotation.x += dt * 0.12 * (D.i % 2 ? 1 : -1); M.g.rotation.z += dt * 0.08;
    for (const b of M.beams) b.visible = false;
    if (Math.random() < 0.6) fx.emit('smoke', { x: D.x + (Math.random() - 0.5) * 20, y: M.g.position.y - 2, z: D.z + (Math.random() - 0.5) * 20, vy: 4, life: 0.8, s0: 2.4, s1: 3.5, c0: 0x50555c });
    if (M.g.position.y <= 3) {
      D.crashed = true; D.fallT = 0; M.g.position.y = 2.5;
      const at = new V3(D.x, 1.5, D.z);
      const before = G.enemies.filter((e) => e.alive && !e.dying && !e.isObjective && Math.hypot(e.pos.x - D.x, e.pos.z - D.z) < AER.crashR && e.pos.y < 14);
      G.curLabel = 'aer-crash'; explodeAt(at, AER.crashR, AER.crashDmg, 'P', 4.2, 0xffa050); fx.dust(at, 40); fx.trauma = Math.min(1, fx.trauma + 0.7); sfx('bigboom', P ? P.pos.distanceTo(at) : 0);
      const n = before.filter((e) => !e.alive || e.dying).length; S.crushed += n; S.dropped++;
      if (P && P.alive && Math.hypot(P.pos.x - D.x, P.pos.z - D.z) < AER.crashR && P.pos.y < 10) { hurtPlayer(AER.crashP, 'aer-crash'); }
      G.onAER && G.onAER('crash', D, n);
    }
  }
  // jump pads: step on one (on the ground) and get thrown onto its deck in a scripted arc
  S.padCd -= dt;
  for (const pad of S.pads) { pad.ring.material = padMat; pad.ring.scale.setScalar(1 + 0.06 * Math.sin(t * 6)); if (!pad.D.dead && Math.random() < 0.25) fx.emit('add', { x: pad.x + (Math.random() - 0.5) * 4, y: 0.6, z: pad.z + (Math.random() - 0.5) * 4, vy: 9, life: 0.5, s0: 0.5, s1: 0.1, c0: 0x58ffc8 }); }
  if (P && P.alive) {
    if (S.ride) {
      const R = S.ride; R.t += dt; const k = Math.min(1, R.t / AER.rideT);
      P.pos.lerpVectors(R.from, R.to, k); P.pos.y += AER.arc * 4 * k * (1 - k) + (R.to.y - R.from.y) * (Math.sin(k * Math.PI / 2) - k);
      P.vel.set(0, 0, 0); P.grounded = false;
      if (Math.random() < 0.8) fx.emit('add', { x: P.pos.x, y: P.pos.y + 0.5, z: P.pos.z, life: 0.35, s0: 1.2, s1: 0.2, c0: 0x58ffc8 });
      if (k >= 1) { S.ride = null; S.padCd = 1.5; P.vel.set(0, -2, 0); }
    } else if (S.padCd <= 0 && P.pos.y < 1.5) {
      for (const pad of S.pads) {
        if (pad.D.dead || Math.hypot(P.pos.x - pad.x, P.pos.z - pad.z) > AER.padR) continue;
        const D = pad.D, L = Math.hypot(pad.x - D.x, pad.z - D.z) || 1;
        S.ride = { t: 0, from: P.pos.clone(), to: new V3(D.x + (pad.x - D.x) / L * 7, D.h + 0.2, D.z + (pad.z - D.z) / L * 7) }; S.rides++;
        fx.ring(new V3(pad.x, 0.6, pad.z), new V3(0, 1, 0), 1, 7, 0.4, 0x58ffc8); sfx('qboost', 0); G.onAER && G.onAER('pad', D);
        break;
      }
    }
  }
}

// ---- v63 Swatter: a hammerhead drone that hunts anything flying. It cruises 14 m above its target (never below 26 m);
// when the target is airborne (5 m+ off the ground) within 24 m it parks overhead, glows and drops a red cone for 0.85 s,
// then slams: inside the 10 m cone that is 30 damage, a 34 m/s shove to the ground and no boost / hover for 1.6 s.
// Against grounded targets it fires four-round bursts
export const SWAT = { hp: 700, r: 2.8, speed: 15, alt: 14, minY: 26, reach: 24, wind: 0.85, coneR: 10, dmg: 30, down: 34, lockT: 1.6, cd: [4.5, 6.5], airH: 5, gunCd: 3.2, gunN: 3, gunDmg: 5 };
const swatConeGeo = new THREE.CylinderGeometry(1.2, SWAT.coneR, 1, 24, 1, true).translate(0, -0.5, 0);
export class Swatter extends Enemy {
  constructor(pos) {
    super('swatter', 'E_Swatter', pos, SWAT.hp, SWAT.r); this.boom = 1.4; this.flying = true;
    this.pos.y = Math.max(this.pos.y, SWAT.minY); this.st = 'hunt'; this.slamT = 2 + Math.random() * 2; this.gunT = 1.5; this.burst = 0; this.burstT = 0; this.windT = 0; this.ph = Math.random() * 6;
    this.cone = new THREE.Mesh(swatConeGeo, new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); this.cone.visible = false; G.scene.add(this.cone);
    this.c.set(this.pos.x, this.pos.y, this.pos.z);
  }
  remove() { this.cone.parent && this.cone.parent.remove(this.cone); super.remove(); }
  die() { this.cone.visible = false; super.die(); }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC), fx = G.fx, P = G.player;
    this.ph += dt; this.slamT -= dt;
    const gy = groundAt(tg.pos.x, tg.pos.z, tg.pos.y + 0.5, 1), air = tg.pos.y - gy > SWAT.airH;
    const dx = tg.pos.x - this.pos.x, dz = tg.pos.z - this.pos.z, hd = Math.hypot(dx, dz) || 1;
    let wx = tg.pos.x, wz = tg.pos.z, spd = SWAT.speed;
    if (this.st === 'wind') {
      this.windT -= dt; spd = 3;
      const k = 1 - this.windT / SWAT.wind, gH = Math.max(0, this.pos.y - groundAt(this.pos.x, this.pos.z, this.pos.y - 1, 1));
      this.cone.visible = true; this.cone.position.set(this.pos.x, this.pos.y - 0.8, this.pos.z); this.cone.scale.set(1, gH, 1); this.cone.material.opacity = 0.08 + 0.14 * k + 0.06 * Math.sin(this.ph * 40);
      if (this.n.HX_Plate) this.n.HX_Plate.position.y = -0.55 - 0.35 * k;
      if (this.windT <= 0) {
        this.st = 'hunt'; this.cone.visible = false; this.slamT = SWAT.cd[0] + Math.random() * (SWAT.cd[1] - SWAT.cd[0]); G.swatSlams = (G.swatSlams || 0) + 1;
        if (this.n.HX_Plate) this.n.HX_Plate.position.y = -0.55;
        fx.ring(_c.set(this.pos.x, this.pos.y - 1.5, this.pos.z), new V3(0, 1, 0), 2, SWAT.coneR * 1.2, 0.35, 0xff6040);
        for (let k2 = 0; k2 < 6; k2++) fx.emit('add', { x: this.pos.x + (Math.random() - 0.5) * 6, y: this.pos.y - 2, z: this.pos.z + (Math.random() - 0.5) * 6, vy: -40, life: 0.4, s0: 1.4, s1: 0.4, c0: 0xff6a40 });
        sfx('pilehit', P ? P.pos.distanceTo(this.pos) : 0);
        for (const f of [P, ...G.friends]) {
          if (!f || !f.alive || !f.pos) continue;
          if (Math.hypot(f.pos.x - this.pos.x, f.pos.z - this.pos.z) > SWAT.coneR || f.pos.y > this.pos.y - 1) continue;
          if (f === P) { damagePlayer(SWAT.dmg, this, 'swatter'); P.vel.y = -SWAT.down; P.slamT = SWAT.lockT; P.grounded = false; G.swatHits = (G.swatHits || 0) + 1; if (G.aer) G.aer.slams++; fx.trauma = Math.min(1, fx.trauma + 0.4); G.onHint && !G.swatSaid && (G.swatSaid = true, G.onHint('被拍击机拍下来了 · 1.6 秒内不能推进和悬停 · 它充能时（红色光锥）横向闪出光锥', 3.2)); }
          else if (f._ent) f._ent.hit(SWAT.dmg, this, 'swatter');
        }
      }
    } else {
      this.cone.visible = false;
      if (!air) { const a = this.ph * 0.4; wx = tg.pos.x + Math.cos(a) * 18; wz = tg.pos.z + Math.sin(a) * 18; }
      if (air && this.slamT <= 0 && hd < SWAT.reach && tg.pos.y < this.pos.y - 3) { this.st = 'wind'; this.windT = SWAT.wind; this.dodge = Math.random(); sfx('warn', P ? P.pos.distanceTo(this.pos) : 0); }
      // guns against grounded targets
      this.gunT -= dt;
      if (!air && this.gunT <= 0 && this.checkLos(dt)) { this.gunT = SWAT.gunCd; this.burst = SWAT.gunN; this.burstT = 0; }
      if (this.burst > 0) { this.burstT -= dt; if (this.burstT <= 0) { this.burst--; this.burstT = 0.1; const mp = _a.set(this.pos.x, this.pos.y - 0.6, this.pos.z).clone(), aim = lead(mp, 110, _b, tg); _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.z += (Math.random() - 0.5) * 0.05; spawnShot({ p: mp, v: _d.normalize().multiplyScalar(110), dmg: SWAT.gunDmg, team: 'E', kind: 'ebullet', color: 0xff8050, w: 0.22, len: 2.4, life: 1.1, label: 'swatter' }); sfx('eshot', P ? P.pos.distanceTo(mp) : 0); } }
    }
    // fly: toward the waypoint, cruising above the target
    const wy = Math.max(SWAT.minY, tg.pos.y + SWAT.alt), mx = wx - this.pos.x, mz = wz - this.pos.z, ml = Math.hypot(mx, mz);
    if (ml > 0.5) { const v = Math.min(spd, ml * 2); this.pos.x += mx / ml * v * dt; this.pos.z += mz / ml * v * dt; }
    if (this.st !== 'wind') this.pos.y += (wy - this.pos.y) * Math.min(1, dt * 1.5);
    collideCyl(this.pos, 3, 1.2);
    this.obj.rotation.y += angDiff(Math.atan2(-dx, -dz), this.obj.rotation.y) * Math.min(1, dt * 3);
    this.obj.rotation.z = Math.sin(this.ph * 1.7) * 0.06; this.obj.rotation.x = this.st === 'wind' ? 0.12 : Math.sin(this.ph * 1.3) * 0.05;
    this.c.set(this.pos.x, this.pos.y, this.pos.z);
  }
}

// ---- v62 black hole ("singularity"): it hangs 20 m over the plaza, fed by four injector pylons. It pulls mechs (you and
// enemies) toward itself (strongest close in, lifting near the middle), bends every projectile, and its event horizon
// burns you at 70/s and swallows ordinary enemies outright. It grows every 45 s; each injector destroyed weakens and
// shrinks it; with all four down it collapses in a shockwave
export const BH = { x: 0, y: 20, z: 0, R0: 7, Rmax: 11, reach: 130, pull: 15, pullExp: 1.25, lift: 6, liftR: 30, dps: 70, bossK: 0.04, growEvery: 45, grow: 0.1, growR: 0.5, Kmax: 1.8, shrink: 0.7, shrinkR: 1.3, shotA: 1500, shotMax: 70, injHp: 6000, sites: [[95, 95], [-95, 95], [95, -95], [-95, -95]] };
const _bh = new V3(), _bq = new THREE.Quaternion(), _bup = new V3(0, 1, 0);
let bhMeshes = null;
function makeBHMeshes() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  const glowMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vU; uniform float uT; void main(){ float d = length(vU - 0.5) * 4.0; float a = atan(vU.y - 0.5, vU.x - 0.5);'
      + ' float ring = exp(-pow((d - 1.06) / 0.05, 2.0)) * 2.2 + exp(-pow((d - 1.12) / 0.32, 2.0)) * 0.55 * (0.8 + 0.2 * sin(a * 5.0 + uT * 2.0));'
      + ' vec3 c = mix(vec3(1.0, 0.55, 0.25), vec3(1.0, 0.95, 0.85), clamp(ring - 0.6, 0.0, 1.0)); gl_FragColor = vec4(c * ring, clamp(ring, 0.0, 1.0)); }' });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), glowMat);
  const diskMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vP; uniform float uT; float h(float x){ return fract(sin(x * 91.7) * 4375.5); }'
      + ' void main(){ float r = length(vP); float a = atan(vP.y, vP.x); float k = (r - 1.3) / 2.2;'
      + ' float sw = a + 2.6 / r - uT * (1.6 / r); float b = 0.55 + 0.45 * sin(sw * 7.0) * sin(sw * 3.0 + r * 4.0);'
      + ' float e = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.55, 1.0, k));'
      + ' vec3 c = mix(vec3(1.0, 0.92, 0.75), mix(vec3(1.0, 0.45, 0.15), vec3(0.55, 0.2, 0.75), smoothstep(0.3, 1.0, k)), smoothstep(0.0, 0.45, k));'
      + ' float i = e * b * (1.6 - k); gl_FragColor = vec4(c * i, clamp(i, 0.0, 1.0)); }' });
  const disk = new THREE.Mesh(new THREE.RingGeometry(1.3, 3.5, 96, 1), diskMat); disk.rotation.x = -Math.PI / 2 + 0.28;
  g.add(core, disk, glow); g.position.set(BH.x, BH.y, BH.z);
  return { g, core, glow, disk, glowMat, diskMat };
}
const bhBeamMat = new THREE.MeshBasicMaterial({ color: 0xb070ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const bhBeamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);
export class Injector extends Enemy {
  constructor(pos) {
    super('injector', 'E_Injector', pos, BH.injHp, 3.2); this.boom = 2.4; this.isObjective = true;
    this.pos.y = 0;
    this.solids = [addSolid(pos.x, pos.z, 7, 7, 2.6, 0, 'injector'), addSolid(pos.x, pos.z, 2.6, 2.6, 8.4, 2.6, 'injector')];
    this.c.set(pos.x, 11.6, pos.z); this.ph = Math.random() * 6;
    this.beam = new THREE.Mesh(bhBeamGeo, bhBeamMat); G.scene.add(this.beam);
  }
  die() {
    for (const so of this.solids) removeSolid(so);
    this.beam.parent && this.beam.parent.remove(this.beam);
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c, 10, 40, 'P', 2.6, 0xc080ff); G.fx.flash(this.c, 0xc080ff, 60, 30, 0.5);
    for (let k = 0; k < 4; k++) G.queue.push({ label: 'inj', t: 0.25 + k * 0.3, fn: () => explodeAt(new V3(this.pos.x + (Math.random() - 0.5) * 4, 3 + k * 2, this.pos.z + (Math.random() - 0.5) * 4), 0, 0, 'P', 1.2, 0xc080ff) });
    const B = G.bh; if (B && B.st === 'live') { B.K *= BH.shrink; B.R = Math.max(3, B.R - BH.shrinkR); B.injDead++; G.fx.ring(_bh.set(BH.x, BH.y, BH.z), null, B.R * 1.5, B.R * 4, 0.6, 0xc080ff); G.onBH && G.onBH('inj', B); }
    this.remove();
  }
  remove() { this.beam.parent && this.beam.parent.remove(this.beam); super.remove(); }
  update(dt) {
    this.ph += dt; const n = this.n, B = G.bh;
    if (n.IJ_Ring) n.IJ_Ring.rotation.y += dt * 1.6;
    if (n.IJ_Core) { n.IJ_Core.getWorldPosition(this.c); n.IJ_Core.scale.setScalar(1 + 0.15 * Math.sin(this.ph * 7)); }
    if (B && B.st === 'live') {
      _bh.set(BH.x, BH.y, BH.z).sub(this.c); const L = _bh.length(); _bh.multiplyScalar(1 / L);
      this.beam.position.copy(this.c); _bq.setFromUnitVectors(_bup, _bh); this.beam.quaternion.copy(_bq);
      const w = 0.35 + 0.12 * Math.sin(this.ph * 11); this.beam.scale.set(w, Math.max(0, L - B.R), w); this.beam.visible = true;
    } else this.beam.visible = false;
  }
}
export function startBH() {
  clearBH();
  bhMeshes = makeBHMeshes(); G.scene.add(bhMeshes.g);
  G.bh = { st: 'live', K: 1, R: BH.R0, t: BH.growEvery, eaten: 0, injDead: 0, grows: 0, colT: 0, inT: 0, bent: 0, inj: BH.sites.map(([x, z]) => new Injector(new V3(x, 0, z))), saidEat: false, saidIn: false };
}
export function clearBH() {
  if (bhMeshes) { bhMeshes.g.parent && bhMeshes.g.parent.remove(bhMeshes.g); bhMeshes = null; }
  G.bh = null;
}
const bhHeavy = (e) => e.kind === 'boss' || e.kind === 'raider' || e.isColossus || e.isTrain || e.isLev || e.maxHp > 3000 * G.diff.hp;
function bhPullAt(x, z) { const B = G.bh, d = Math.hypot(x - BH.x, z - BH.z); if (d >= BH.reach) return 0; const k = 1 - d / BH.reach; return BH.pull * B.K * Math.pow(k, BH.pullExp); }
function updateBH(dt) {
  const B = G.bh; if (!B) return;
  const M = bhMeshes, fx = G.fx, P = G.player;
  if (M) { M.glowMat.uniforms.uT.value += dt; M.diskMat.uniforms.uT.value += dt; if (G.camera) M.glow.quaternion.copy(G.camera.quaternion); }
  if (B.st === 'collapse') {
    B.colT -= dt; const k = Math.max(0, B.colT / 2); if (M) M.g.scale.setScalar(Math.max(0.01, B.R * k * k));
    if (B.colT <= 0) {
      B.st = 'gone'; if (M) M.g.visible = false; _bh.set(BH.x, BH.y, BH.z);
      G.curLabel = 'bh-collapse'; explodeAt(_bh.clone(), 45, 160, 'P', 4, 0xd0a0ff); fx.flash(_bh, 0xe0c0ff, 500, 300, 0.9); fx.ring(_bh.clone(), new V3(0, 1, 0), 2, 120, 1.2, 0xd0a0ff);
      fx.trauma = 1; sfx('bigboom', 0); G.onBH && G.onBH('gone', B);
    }
    return;
  }
  if (B.st !== 'live') return;
  if (M) M.g.scale.setScalar(B.R);
  B.t -= dt;
  if (B.t <= 0) { B.t = BH.growEvery; if (B.K < BH.Kmax) { B.K = Math.min(BH.Kmax, B.K * (1 + BH.grow)); B.R = Math.min(BH.Rmax, B.R + BH.growR); B.grows++; G.onBH && G.onBH('grow', B); } }
  if (!B.inj.some((e) => e.alive)) { B.st = 'collapse'; B.colT = 2; G.onBH && G.onBH('collapse', B); sfx('alarm', 0); return; }
  _bh.set(BH.x, BH.y, BH.z);
  // you: pulled in, lifted near the middle, burned in the horizon
  if (P && P.alive) {
    const dx = BH.x - P.pos.x, dz = BH.z - P.pos.z, d = Math.hypot(dx, dz) || 1, v = bhPullAt(P.pos.x, P.pos.z);
    if (v > 0) { P.pos.x += dx / d * v * dt; P.pos.z += dz / d * v * dt; }
    if (d < BH.liftR && P.pos.y < BH.y) P.pos.y += BH.lift * B.K * (1 - d / BH.liftR) * dt;
    const pc = P.center(_c);
    if (pc.distanceTo(_bh) < B.R + 2) { hurtPlayer(BH.dps * dt, 'blackhole'); B.inT += dt; if (Math.random() < 0.5) fx.sparks(pc, null, 2, 0xd0a0ff, 10, 0.6, 0.2, 0.15); if (!B.saidIn) { B.saidIn = true; G.onBH && G.onBH('in', B); } }
  }
  // enemies: pulled the same way (heavies less); ordinary ones are swallowed at the horizon
  for (const e of G.enemies) {
    if (!e.alive || e.dying || e.isObjective || e.isMine || !e.pos || e.kind === 'cpart' || e.stuck) continue;
    const dx = BH.x - e.pos.x, dz = BH.z - e.pos.z, d = Math.hypot(dx, dz) || 1, hv = bhHeavy(e), v = bhPullAt(e.pos.x, e.pos.z) * (hv ? 0.35 : 0.85);
    if (v > 0) { const ox = e.pos.x, oz = e.pos.z; e.pos.x += dx / d * v * dt; e.pos.z += dz / d * v * dt; if (e.c) { e.c.x += e.pos.x - ox; e.c.z += e.pos.z - oz; } }
    // lift: kept as an absolute height so walkers (which snap to the ground in their own update) still rise toward it
    if (!hv && d < BH.liftR) { if (e.bhY == null) e.bhY = e.pos.y; e.bhY = Math.min(BH.y, e.bhY + BH.lift * B.K * (1.2 - d / BH.liftR) * dt); }
    else if (e.bhY != null) { e.bhY -= 9 * dt; if (e.bhY <= e.pos.y) e.bhY = null; }
    if (e.bhY != null && e.bhY > e.pos.y) { const dy = e.bhY - e.pos.y; e.pos.y = e.bhY; if (e.c) e.c.y += dy; if (e.obj) e.obj.position.y = e.pos.y; }
    if (e.c && e.c.distanceTo(_bh) < B.R + (e.r || 2)) {
      if (hv) { dealDamage(e, e.maxHp * BH.bossK * dt, 'X', e.c, 'bh'); }
      else { B.eaten++; G.bhEaten = (G.bhEaten || 0) + 1; fx.flash(e.c.clone(), 0xd0a0ff, 30, 16, 0.25); fx.ring(e.c.clone(), null, 0.5, 6, 0.3, 0xd0a0ff); dealDamage(e, 1e9, 'X', e.c, 'bh'); if (!B.saidEat) { B.saidEat = true; G.onBH && G.onBH('eat', B); } }
    }
  }
  // projectiles bend toward it and vanish inside the horizon
  for (const sh of G.shots) {
    const dx = BH.x - sh.x, dy = BH.y - sh.y, dz = BH.z - sh.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 8100) continue;
    const d = Math.sqrt(d2) || 1;
    if (d < B.R) { sh.life = 0; continue; }
    const a = Math.min(BH.shotMax, BH.shotA * B.K / d2) * dt; sh.v.x += dx / d * a; sh.v.y += dy / d * a; sh.v.z += dz / d * a; B.bent++;
  }
  // matter spiralling in
  if (Math.random() < 0.9) {
    const a = Math.random() * 6.283, r = B.R * (2.6 + Math.random() * 2.5), tx = -Math.sin(a), tz = Math.cos(a);
    fx.emit('add', { x: BH.x + Math.cos(a) * r, y: BH.y + (Math.random() - 0.5) * 2, z: BH.z + Math.sin(a) * r, vx: (-Math.cos(a) * 0.5 + tx) * r * 0.9, vy: 0, vz: (-Math.sin(a) * 0.5 + tz) * r * 0.9, life: 0.9, s0: 0.9, s1: 0.2, c0: Math.random() < 0.5 ? 0xffa060 : 0xc090ff });
  }
}

// ---- v62 Gyro: a heavy spinning top. It winds up, then shoots off in a straight line at 22 m/s bending gently toward
// its target and ricocheting off walls; contact hits for 35 and knocks you away. While spinning it shrugs off half the
// damage and flings blade shards at you; after 4 bounces (or 7 s) it wobbles for 2.4 s and takes x1.6
export const GYRO = { hp: 650, r: 2.2, speed: 22, turn: 0.7, bounces: 4, spinT: 7, wind: 1.1, wobT: 2.4, spinK: 0.5, wobK: 1.6, dmg: 35, knock: 14, hitCd: 1, reachY: 6, shardCd: 1.8, shardN: 2, shardDmg: 8 };
export class Gyro extends Enemy {
  constructor(pos) {
    super('gyro', 'E_Gyro', pos, GYRO.hp, GYRO.r); this.boom = 1.2;
    this.vel = new V3(); this.st = 'wind'; this.stT = GYRO.wind + Math.random(); this.b = 0; this.hitT = 0; this.shT = 1; this.spinV = 0; this.wob = 0;
    this.c.set(pos.x, pos.y + 2, pos.z);
  }
  hit(dmg, at, label) {
    if (this.st === 'spin') { dmg *= GYRO.spinK; if (Math.random() < 0.3) G.fx.sparks(this.c, null, 3, 0xffe0a0, 12, 0.6, 0.2, 0.12); }
    else if (this.st === 'wobble') dmg *= GYRO.wobK;
    super.hit(dmg);
  }
  update(dt) {
    const P = G.player, tg = this.tg(), pc = tg.center(playerC), fx = G.fx;
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    this.stT -= dt; this.hitT -= dt;
    if (this.st === 'wind') {
      this.spinV += (30 - this.spinV) * Math.min(1, dt * 2); this.wob *= Math.exp(-4 * dt);
      if (this.stT <= 0) { this.st = 'spin'; this.stT = GYRO.spinT; this.b = 0; this.shT = 0.8; this.vel.set(dx / dist * GYRO.speed, 0, dz / dist * GYRO.speed); G.gyroRuns = (G.gyroRuns || 0) + 1; sfx('jetdive', dist); }
    } else if (this.st === 'spin') {
      this.spinV = 40; this.wob *= Math.exp(-4 * dt);
      const want = Math.atan2(dx, dz), cur = Math.atan2(this.vel.x, this.vel.z), a = cur + Math.max(-GYRO.turn * dt, Math.min(GYRO.turn * dt, angDiff(want, cur)));
      this.vel.set(Math.sin(a) * GYRO.speed, 0, Math.cos(a) * GYRO.speed);
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      const px = this.pos.x, pz = this.pos.z; let bounced = false;
      if (collideCyl(this.pos, 2.0, 3)) {
        const nx = this.pos.x - px, nz = this.pos.z - pz, nl = Math.hypot(nx, nz);
        if (nl > 1e-4) { const ux = nx / nl, uz = nz / nl, vn = this.vel.x * ux + this.vel.z * uz; if (vn < 0) { this.vel.x -= 2 * vn * ux; this.vel.z -= 2 * vn * uz; } } else this.vel.multiplyScalar(-1);
        bounced = true;
      }
      for (const ax of ['x', 'z']) if (Math.abs(this.pos[ax]) > ARENA - 4) { this.pos[ax] = Math.sign(this.pos[ax]) * (ARENA - 4); this.vel[ax] = -Math.sign(this.pos[ax]) * Math.abs(this.vel[ax]); bounced = true; }
      if (bounced) { this.b++; G.gyroBounces = (G.gyroBounces || 0) + 1; fx.sparks(_c.set(this.pos.x, this.pos.y + 1.6, this.pos.z), null, 14, 0xffd080, 18, 1, 0.3, 0.2); sfx('ric', dist); }
      if (Math.random() < 0.6) fx.sparks(_d.set(this.pos.x, this.pos.y + 0.2, this.pos.z), null, 1, 0xffc070, 8, 0.5, 0.2, 0.12);
      // blade shards flung at the target
      this.shT -= dt;
      if (this.shT <= 0 && dist < 55 && this.checkLos(dt)) {
        this.shT = GYRO.shardCd; const mp = _a.set(this.pos.x, this.pos.y + 1.7, this.pos.z).clone(), aim = lead(mp, 90, _b, tg);
        for (let k = 0; k < GYRO.shardN; k++) { _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.12; _d.y += (Math.random() - 0.5) * 0.06; _d.z += (Math.random() - 0.5) * 0.12; spawnShot({ p: mp, v: _d.normalize().multiplyScalar(90), dmg: GYRO.shardDmg, team: 'E', kind: 'ebullet', color: 0xffd060, w: 0.3, len: 2, life: 0.9, label: 'gyro-blade' }); }
        sfx('eshot', dist);
      }
      // contact
      if (this.hitT <= 0) for (const f of [P, ...G.friends]) {
        if (!f || !f.alive || !f.pos) continue; const fx2 = f.pos.x - this.pos.x, fz = f.pos.z - this.pos.z, fd = Math.hypot(fx2, fz) || 1;
        if (fd < 3.8 && f.pos.y - this.pos.y < GYRO.reachY) {
          this.hitT = GYRO.hitCd; const vn = (this.vel.x * fx2 + this.vel.z * fz) / fd; if (vn > 0) { this.vel.x -= 2 * vn * fx2 / fd; this.vel.z -= 2 * vn * fz / fd; } this.b++;
          if (f === P) { damagePlayer(GYRO.dmg, this, 'gyro'); P.vel.x += fx2 / fd * GYRO.knock; P.vel.z += fz / fd * GYRO.knock; P.vel.y = Math.max(P.vel.y, 5); P.grounded = false; G.gyroHits = (G.gyroHits || 0) + 1; }
          else if (f._ent) f._ent.hit(GYRO.dmg, this, 'gyro');
          fx.sparks(_c.set(f.pos.x, f.pos.y + 2, f.pos.z), null, 16, 0xffe0a0, 16, 1, 0.3, 0.2); sfx('ric', 0); break;
        }
      }
      if (this.b >= GYRO.bounces || this.stT <= 0) { this.st = 'wobble'; this.stT = GYRO.wobT; this.vel.set(0, 0, 0); G.gyroWobbles = (G.gyroWobbles || 0) + 1; if (!G.gyroSaid && tg === P) { G.gyroSaid = true; G.onHint && G.onHint('陀螺机在晃 · 停转的 2.4 秒里受伤 ×1.6，转起来时只吃一半', 3); } }
    } else {   // wobble: spinning down, tipping round its tip
      this.spinV *= Math.exp(-1.2 * dt); this.wob += (1 - this.wob) * Math.min(1, dt * 3);
      if (this.stT <= 0) { this.st = 'wind'; this.stT = GYRO.wind; }
    }
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.8, 2);
    if (this.n.GY_Spin) this.n.GY_Spin.rotation.y += this.spinV * dt;
    const t = G.time * (this.st === 'wobble' ? 5 : 9); this.obj.rotation.set(Math.sin(t) * (0.04 + 0.3 * this.wob), this.obj.rotation.y + this.spinV * dt * 0.15, Math.cos(t) * (0.04 + 0.3 * this.wob));
    this.c.set(this.pos.x, this.pos.y + 1.9, this.pos.z);
  }
}

// ---- EC-2 energy cannon: a thin piercing hitscan beam paid for with boost energy
function fireCharge(owner, slot, d, mul, aim, me) {
  const mp = owner.muzzlePos(slot, new V3(), 0).clone(), dir = new V3().subVectors(aim, mp);
  if (!Number.isFinite(dir.x + dir.y + dir.z) || !Number.isFinite(mp.x + mp.y + mp.z) || dir.lengthSq() < 1e-6) return;
  dir.normalize();
  const w = raySolids(mp, dir, d.range), L = Math.min(w.t, d.range), end = mp.clone().addScaledVector(dir, L);
  const rad = 0.7, dmg = d.dmg * mul;
  const prevL = G.curLabel; G.curLabel = 'p-ecan'; let n = 0; const hit = new Set();
  for (const e of entsFor('P')) {
    if (!e.alive || e.isMine || e.holo || !e.c) continue;
    const h = e.kind === 'cpart' ? e.owner : e; if (hit.has(h)) continue;
    _c.subVectors(e.c, mp); const al = _c.dot(dir); if (al < 0 || al > L + (e.r || 1.5)) continue;
    const off = Math.sqrt(Math.max(0, _c.lengthSq() - al * al)); if (off > rad + (e.r || 1.5)) continue;
    hit.add(h); dealDamage(e, dmg, 'P', e.c, 'p-ecan'); n++;
    if (n > 1 && me) G.stats.shots++;
    G.fx.sparks(e.c, dir, 4, 0x80ffc0, 12, 0.6, 0.2, 0.14);
  }
  G.curLabel = prevL;
  if (n > 1) G.chgPierce = (G.chgPierce || 0) + n - 1;
  G.fx.streak(mp, end, 0.32, 0x60ffb0, 0.09);
  G.fx.streak(mp, end, 0.1, 0xe0fff0, 0.07);
  G.fx.flash(mp, 0x80ffc0, 8, 6, 0.08); if (!n) G.fx.sparks(end, null, 4, 0x80ffc0, 10, 0.6, 0.2, 0.12);
}

// ---- AR-7 arc caster: hitscan arc at the enemy nearest the aim ray (with line of sight), then up to 3 chain jumps
function fireArc(owner, slot, d, mul, aim, me) {
  const mp = owner.muzzlePos(slot, new V3(), 0).clone(), dir = new V3().subVectors(aim, mp);
  if (!Number.isFinite(dir.x + dir.y + dir.z) || !Number.isFinite(mp.x + mp.y + mp.z) || dir.lengthSq() < 1e-6) return;
  dir.normalize();
  let best = null, bs = 1e9;
  for (const e of entsFor('P')) {
    if (!e.alive || e.isMine || e.holo || e.cloaked || !e.c) continue;
    _c.subVectors(e.c, mp); const L = _c.length(); if (!(L <= d.range) || L < 0.5) continue;
    const al = _c.dot(dir); if (al <= 0) continue;
    const off = Math.sqrt(Math.max(0, L * L - al * al)), lim = (e.r || 1.5) + 1.5 + al * 0.12; if (off > lim) continue;
    const sc = off / lim + al / d.range * 0.3; if (sc < bs && clearLine(mp, e.c)) { bs = sc; best = e; }
  }
  if (!best) { const w = raySolids(mp, dir, d.range * 0.6); G.fx.lightning(mp, mp.clone().addScaledVector(dir, Math.min(w.t, d.range * 0.6)), 0x9fe8ff, 0.2, 0.08, 1.2); return; }
  const prevL = G.curLabel; G.curLabel = 'p-arc';
  const hit = new Set(); let from = mp, cur = best, dmg = d.dmg * mul;
  for (let k = 0; k <= d.chain && cur; k++) {
    const h = cur.kind === 'cpart' ? cur.owner : cur; hit.add(h);
    const to = cur.c.clone();
    G.fx.lightning(from, to, 0x9ff6ff, k ? 0.24 : 0.34, 0.12, 1.6);
    G.fx.sparks(to, null, 6, 0x9ff6ff, 10, 0.8, 0.2, 0.15);
    dealDamage(cur, dmg, 'P', to, 'p-arc');
    if (k) { G.arcChains = (G.arcChains || 0) + 1; if (me) G.stats.shots++; }
    from = to; dmg *= d.chainK;
    let nb = null, nd = d.chainR;
    for (const e of entsFor('P')) {
      if (!e.alive || e.isMine || e.isBarrel || e.holo || e.cloaked || !e.c) continue;
      if (hit.has(e.kind === 'cpart' ? e.owner : e)) continue;
      const dd = e.c.distanceTo(from); if (dd < nd && clearLine(from, e.c)) { nd = dd; nb = e; }
    }
    cur = nb;
  }
  G.curLabel = prevL;
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

// ---- Refinery: three fuel tanks. Planters drive up to a tank and strap a demolition charge to it (14 s fuse).
// Stand within 5 m of a charge for 2 s to defuse it. A charge that goes off blasts everything within 12 m and takes
// half a tank's integrity; when all three tanks are gone the mission is lost.
export const DEPOT = { spots: [[-42, 34], [46, 28], [0, -52]], hp: 1000, R: 4.4, fuse: 16, max: 3, defuse: 2, defR: 5, blast: 12, blastDmg: 80, tankDmg: 0.5 };
const chGeo = new THREE.BoxGeometry(0.9, 0.5, 0.9), chLightGeo = new THREE.SphereGeometry(0.16, 8, 6);
const chMat = new THREE.MeshStandardMaterial({ color: 0xb8402e, roughness: 0.5, metalness: 0.3 });
const chRingGeo = new THREE.RingGeometry(DEPOT.defR - 0.35, DEPOT.defR, 48);
export function startDepots() {
  clearDepots();
  const D = G.depot = { tanks: [], charges: [], lost: false };
  for (const [sx, sz] of DEPOT.spots) {
    let x = sx, z = sz;
    for (let i = 0; i < 500; i++) {
      const a = i * 2.4, r = Math.sqrt(i) * 2.2; x = sx + Math.cos(a) * r; z = sz + Math.sin(a) * r;
      if (groundAt(x, z, 60) < 0.6 && !collideCyl(new V3(x, 0.5, z), 9, 3)) break;
    }
    const obj = cloneKit('P_FuelTank'); obj.position.set(x, 0, z); obj.rotation.y = Math.random() * 6.28; G.scene.add(obj);
    D.tanks.push({ obj, x, z, hp: DEPOT.hp, maxHp: DEPOT.hp, alive: true, sol: addSolid(x, z, 7.6, 7.6, 9, 0, 'tank'), fireT: 0 });
  }
}
export function clearDepots() {
  const D = G.depot; if (!D) return;
  for (const t of D.tanks) { t.obj.parent && t.obj.parent.remove(t.obj); removeSolid(t.sol); }
  for (const c of D.charges) removeCharge(c);
  G.depot = null;
}
function removeCharge(c) { c.obj.parent && c.obj.parent.remove(c.obj); c.ring.parent && c.ring.parent.remove(c.ring); c.ring.material.dispose(); c.light.material.dispose(); c.gone = true; }
export function depotTarget(from) {   // nearest live tank, preferring one without a charge already on it
  const D = G.depot; if (!D) return null; let best = null, bd = 1e9;
  for (const t of D.tanks) { if (!t.alive) continue; const d = Math.hypot(t.x - from.x, t.z - from.z) + (D.charges.some((c) => c.tank === t) ? 60 : 0); if (d < bd) { bd = d; best = t; } }
  return best;
}
export function plantCharge(t, from) {
  const D = G.depot; if (!D || !t.alive) return;
  let dx = from.x - t.x, dz = from.z - t.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const x = t.x + dx * (DEPOT.R + 0.5), z = t.z + dz * (DEPOT.R + 0.5);
  const obj = new THREE.Group(); obj.add(new THREE.Mesh(chGeo, chMat)); obj.children[0].position.y = 1.4;
  const light = new THREE.Mesh(chLightGeo, new THREE.MeshBasicMaterial({ color: 0xff2010 })); light.position.y = 1.75; obj.add(light);
  obj.position.set(x, 0, z); obj.rotation.y = Math.atan2(dx, dz); G.scene.add(obj);
  const ring = new THREE.Mesh(chRingGeo, new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.45, z); G.scene.add(ring);
  D.charges.push({ obj, light, ring, x, z, t: DEPOT.fuse, tank: t, k: 0, beepT: 0 });
  G.planted = (G.planted || 0) + 1; G.onPlant && G.onPlant(t);
}
function hurtTank(t, frac) {
  t.hp -= t.maxHp * frac; G.onTankHit && G.onTankHit(t);
  if (t.hp > 0 || !t.alive) return;
  t.alive = false; t.hp = 0; G.tanksLost = (G.tanksLost || 0) + 1;
  const c = new V3(t.x, 5, t.z); G.fx.explosion(c, 3.2, 0xff7020); G.fx.flash(c, 0xffa040, 120, 60, 0.5); G.fx.trauma = Math.min(1, G.fx.trauma + 0.6);
  sfx('bigboom', G.player ? G.player.pos.distanceTo(c) * 0.5 : 0);
  G.curLabel = 'depot-blast'; explodeAt(c, 16, 90, 'X', 2.4, 0xff8030);
  t.obj.scale.set(1.05, 0.42, 1.05); t.obj.rotation.z = 0.08; t.sol.max.y = 3.6;
  const D = G.depot; if (D && !D.tanks.some((k) => k.alive)) D.lost = true;
  G.onTankLost && G.onTankLost(t);
}
function updateDepots(dt) {
  const D = G.depot, P = G.player; if (!D) return;
  for (const t of D.tanks) {   // burning wrecks and damaged tanks smoke
    if (!t.alive) { if (Math.random() < 0.5) G.fx.emit('add', { x: t.x + (Math.random() - 0.5) * 6, y: 3.5, z: t.z + (Math.random() - 0.5) * 6, vy: 5, life: 0.7, s0: 3, s1: 1, c0: 0xff7020, c1: 0x401808 }); if (Math.random() < 0.3) G.fx.smoke(new V3(t.x, 4, t.z), 1, 3, 3, 0x2a2624, 2.5, 1.2); }
    else if (t.hp < t.maxHp * 0.6 && Math.random() < 0.15) G.fx.smoke(new V3(t.x + (Math.random() - 0.5) * 4, 8, t.z + (Math.random() - 0.5) * 4), 1, 1.5, 2, 0x3a3634, 1.6, 1);
  }
  for (let i = D.charges.length - 1; i >= 0; i--) {
    const c = D.charges[i];
    const near = P && P.alive && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < DEPOT.defR && P.pos.y - groundAt(P.pos.x, P.pos.z, P.pos.y + 1) < 6;
    c.k = near ? c.k + dt / DEPOT.defuse : Math.max(0, c.k - dt * 0.5);
    c.ring.scale.setScalar(1 - 0.55 * c.k); c.ring.material.color.setHex(c.k > 0 ? 0x60e0ff : 0xff4030);
    if (c.k >= 1) {
      removeCharge(c); D.charges.splice(i, 1); G.defused = (G.defused || 0) + 1; G.onTally && G.onTally('defuse');
      G.fx.sparks(new V3(c.x, 1.5, c.z), null, 18, 0x80e8ff, 10, 1, 0.4, 0.2); sfx('repair', 0); G.onDefuse && G.onDefuse(c);
      continue;
    }
    c.t -= dt; c.beepT -= dt;
    const urg = Math.max(0, c.t / DEPOT.fuse);
    if (c.beepT <= 0) { c.beepT = 0.12 + 0.9 * urg; c.light.material.color.setHex(0xff2010); sfx('minebeep', P ? P.pos.distanceTo(c.obj.position) : 0); }
    else if (c.beepT < 0.06 + 0.5 * urg) c.light.material.color.setHex(0x301008);
    c.ring.material.opacity = 0.45 + 0.35 * Math.abs(Math.sin(G.time * (4 + 14 * (1 - urg))));
    if (c.t <= 0) {
      removeCharge(c); D.charges.splice(i, 1); G.detonated = (G.detonated || 0) + 1;
      const at = new V3(c.x, 1.5, c.z); G.curLabel = 'depot-charge'; explodeAt(at, DEPOT.blast, DEPOT.blastDmg, 'X', 2, 0xff6020);
      if (c.tank.alive) hurtTank(c.tank, DEPOT.tankDmg);
    }
  }
}
export function nearestCharge(x, z) {
  const D = G.depot; if (!D) return null; let best = null, bd = 1e9;
  for (const c of D.charges) { const d = Math.hypot(c.x - x, c.z - z) + c.t * 3; if (d < bd) { bd = d; best = c; } }   // the one about to blow counts as nearer
  return best;
}

// ---- Planter: a fast tracked demolition bot with no gun. It drives to a fuel tank, spends 2.2 s strapping a charge
// to it (kill it then and the charge is never planted), runs from you for 6 s, rests, fetches a new charge and goes again.
export const PLANT = { hp: 340, r: 1.6, speed: 15, plantT: 2.2, flee: 6, rest: [8, 12] };
export class Planter extends Enemy {
  constructor(pos) {
    super('planter', 'E_Planter', pos, PLANT.hp, PLANT.r); this.boom = 0.8;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = 0; this.vel = new V3(); this.st = 'go'; this.t = 0; this.tank = null; this.ph = Math.random() * 6;
    this.stuckT = 0; this.sideT = 0; this.side = 1; this.last = this.pos.clone(); this.c.set(this.pos.x, this.pos.y + 1, this.pos.z);
  }
  drive(tx, tz, spd, dt) {
    let dx = tx - this.pos.x, dz = tz - this.pos.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    if (this.sideT > 0) { this.sideT -= dt; const sx = -dz * this.side, sz = dx * this.side; dx = dx * 0.3 + sx; dz = dz * 0.3 + sz; }
    this.vel.x += (dx * spd - this.vel.x) * (1 - Math.exp(-5 * dt)); this.vel.z += (dz * spd - this.vel.z) * (1 - Math.exp(-5 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.x)); this.pos.z = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.z));
    collideCyl(this.pos, 1.5, 1.6);
    this.stuckT += dt; if (this.stuckT > 1.5) { if (this.pos.distanceTo(this.last) < 3 && dl > 3) { this.sideT = 1.4; this.side *= -1; } this.stuckT = 0; this.last.copy(this.pos); }
    if (Math.hypot(this.vel.x, this.vel.z) > 1) this.yaw += angDiff(Math.atan2(this.vel.x, this.vel.z), this.yaw) * Math.min(1, dt * 8);
    return dl;
  }
  update(dt) {
    const P = G.player; this.ph += dt; const ch = this.n.PL_Charge;
    if (this.st === 'go') {
      if (!this.tank || !this.tank.alive) this.tank = depotTarget(this.pos);
      if (!this.tank) { this.st = 'flee'; this.t = PLANT.flee; }
      else {
        let dx = this.pos.x - this.tank.x, dz = this.pos.z - this.tank.z; const dl = Math.hypot(dx, dz) || 1;
        const gx = this.tank.x + dx / dl * (DEPOT.R + 1.8), gz = this.tank.z + dz / dl * (DEPOT.R + 1.8);
        if (G.depot.charges.length >= DEPOT.max) { this.st = 'rest'; this.t = 2; }
        else if (this.drive(gx, gz, PLANT.speed, dt) < 1.6) { this.st = 'plant'; this.t = PLANT.plantT; this.vel.set(0, 0, 0); G.onPlanting && G.onPlanting(this); }
      }
    } else if (this.st === 'plant') {
      this.t -= dt; if (Math.random() < 0.4) G.fx.sparks(_a.set(this.pos.x, this.pos.y + 1.2, this.pos.z), null, 1, 0xffb040, 6, 0.8, 0.3, 0.2);
      if (this.tank && this.tank.alive) this.yaw += angDiff(Math.atan2(this.tank.x - this.pos.x, this.tank.z - this.pos.z), this.yaw) * Math.min(1, dt * 6);
      if (this.t <= 0) { if (this.tank && this.tank.alive) plantCharge(this.tank, this.pos); if (ch) ch.visible = false; this.st = 'flee'; this.t = PLANT.flee; }
    } else if (this.st === 'flee') {
      this.t -= dt; const ax = P ? this.pos.x - P.pos.x : 1, az = P ? this.pos.z - P.pos.z : 0, al = Math.hypot(ax, az) || 1;
      this.drive(this.pos.x + ax / al * 30, this.pos.z + az / al * 30, PLANT.speed * 0.9, dt);
      if (this.t <= 0) { this.st = 'rest'; this.t = PLANT.rest[0] + Math.random() * (PLANT.rest[1] - PLANT.rest[0]); }
    } else {   // rest: idle wander, then fetch a new charge
      this.t -= dt; this.vel.multiplyScalar(Math.exp(-3 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      if (this.t <= 0 && !(G.depot && G.depot.charges.length >= DEPOT.max)) { this.st = 'go'; this.tank = null; if (ch) ch.visible = true; }   // at most three live charges at once
    }
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) - this.pos.y) * Math.min(1, dt * 10);
    this.obj.rotation.set(0, this.yaw, 0);
    this.c.set(this.pos.x, this.pos.y + 1, this.pos.z);
  }
}

// ---- Salvage run: every enemy you kill drops glowing salvage cores (walkers 2, heavies 3, most others 1). Fly over a
// core to pick it up (carry 4, each one slows you 5%). A hit of 30+ knocks one loose. Stand on the extraction pad
// (below 12 m) to hand them in, 0.4 s each. Loose cores fade after 30 s; scavengers grab them and fly off the map.
export const SALV = { carry: 4, pickR: 3.4, life: 30, padR: 7.5, padH: 12, padT: 0.4, slow: 0.05, dropHit: 30, dropCd: 1.2, spot: [0, 0],
  drops: { walker: 2, bulwark: 3, gunship: 3, raider: 3, lancer: 3, boss: 0, crawler: 0, swarm: 0, scav: 1, mender: 1, turret: 1, drone: 1, howitzer: 2 } };

// ------------------------------------------------------------------ v43 fortify: build pads round the reactor. Kills earn works
// points; stand on a pad to build a permanent turret (then upgrade it, then repair it). Hijackers can turn a turret against you.
export const FORT = { ring: 30, padR: 4.4, padH: 5, buildT: 1.2, start: 300, clear: 150, cost: [350, 450], fix: 150, fixAt: 0.7,
  hp: [700, 1100], dmg: [4.5, 6], rate: [0.22, 0.17], range: 75, missT: 5.5, mdmg: 24, hackMul: 0.7,
  pts: { drone: 15, walker: 40, bulwark: 60, gunship: 60, mender: 40, hijack: 50, sapper: 30, raider: 80, boss: 0, crawler: 6 }, ptsDef: 25 };
export const FORT_PADS = [0, 1, 2, 3, 4, 5].map((i) => { const a = i / 6 * Math.PI * 2 + 0.52; return [Math.round(Math.cos(a) * FORT.ring), Math.round(Math.sin(a) * FORT.ring)]; });
export const HIJACK = { hp: 380, r: 1.8, speed: 16, hover: 10, chanR: 14, chan: 1.8, hack: 10, interrupt: 160, cd: 4, holdR: 10, gunCd: 2.6, gunR: 55, dmg: 7 };
const padRingGeo = new THREE.RingGeometry(FORT.padR - 0.35, FORT.padR, 40);
export function startFort() {
  clearFort();
  const pads = FORT_PADS.map(([x, z]) => {
    const y = groundAt(x, z, 20);
    const obj = cloneKit('P_BuildPad'); obj.position.set(x, y, z); G.scene.add(obj);
    const ring = new THREE.Mesh(padRingGeo, new THREE.MeshBasicMaterial({ color: 0x40c8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.5, z); G.scene.add(ring);
    return { x, y, z, obj, ring, tur: null, k: 0 };
  });
  G.hackBreaks = 0; G.fortDmg = 0;
  G.fort = { pads, pts: FORT.start, built: 0, ups: 0, fixes: 0, lost: 0, hacked: 0, saved: 0, here: null };
}
export function clearFort() {
  const F = G.fort; if (!F) return;
  const rm = (o) => o && o.parent && o.parent.remove(o);
  for (const p of F.pads) { rm(p.obj); rm(p.ring); p.ring.material.dispose(); if (p.tur) p.tur.end(false, true); }
  G.fort = null;
}
export function padAction(p) {   // what standing on this pad would do: {kind, cost} or null
  const t = p.tur;
  if (!t) return { kind: 'build', cost: FORT.cost[0] };
  if (t.hackT > 0) return null;
  if (t.lv < 2) return { kind: 'up', cost: FORT.cost[1] };
  if (t.hp < t.maxHp * FORT.fixAt) return { kind: 'fix', cost: FORT.fix };
  return null;
}
export function fortGoal(px, pz) {   // autopilot: the nearest pad with an affordable job (build first, then upgrade, then repair)
  const F = G.fort; if (!F) return null;
  let best = null, bs = 1e9;
  for (const p of F.pads) {
    const a = padAction(p); if (!a || a.cost > F.pts) continue;
    const sc = Math.hypot(p.x - px, p.z - pz) + (a.kind === 'build' ? 0 : a.kind === 'up' ? 40 : 80);
    if (sc < bs) { bs = sc; best = p; }
  }
  return best;
}
function updateFort(dt) {
  const F = G.fort; if (!F) return;
  const P = G.player; F.here = null;
  for (const p of F.pads) {
    if (p.tur) { if (p.tur.alive) p.tur.update(dt); else p.tur = null; }
    const on = P && P.alive && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < FORT.padR && P.pos.y - p.y < FORT.padH;
    const a = padAction(p), can = a && a.cost <= F.pts;
    if (on) F.here = p;
    if (on && can) {
      p.k += dt / FORT.buildT;
      if (Math.random() < 0.5) G.fx.sparks(new V3(p.x + (Math.random() - 0.5) * 5, p.y + 0.6, p.z + (Math.random() - 0.5) * 5), new V3(0, 1, 0), 2, 0x80e0ff, 8, 0.8, 0.3, 0.2);
      if (p.k >= 1) {
        p.k = 0; F.pts -= a.cost;
        if (a.kind === 'build') { p.tur = new Bastion(p); F.built++; }
        else if (a.kind === 'up') { p.tur.upgrade(); F.ups++; }
        else { p.tur.hp = p.tur.maxHp; F.fixes++; G.fx.ring(new V3(p.x, p.y + 1, p.z), null, 1, 6, 0.4, 0x60ff90); sfx('repair', 0); }
        G.onFortWork && G.onFortWork(a.kind, p);
      }
    } else p.k = Math.max(0, p.k - dt * 2);
    const m = p.ring.material, pul = 0.5 + 0.5 * Math.sin(G.time * 5);
    if (p.tur && p.tur.hackT > 0) { m.color.setHex(0xff30d0); m.opacity = 0.5 + 0.4 * pul; }
    else if (on && can) { m.color.setHex(0x80f0ff); m.opacity = 0.6 + 0.4 * p.k; }
    else if (can) { m.color.setHex(0x40c8ff); m.opacity = 0.35 + 0.35 * pul; }
    else if (p.tur) { m.color.setHex(0x60ff90); m.opacity = 0.35; }
    else { m.color.setHex(0x8090a0); m.opacity = 0.25; }
  }
}

export class Bastion {
  constructor(pad) {
    this.pad = pad; this.lv = 1; this.isBastion = true; this.alive = true;
    this.maxHp = FORT.hp[0]; this.hp = this.maxHp;
    this.foeW = 1.35; this.foeWAir = 1.3; this.foeWBoss = 1.8;
    this.vel = new V3(); this.pos = new V3(pad.x, pad.y + 0.42, pad.z);
    this.obj = cloneKit('D_Bastion'); this.obj.scale.setScalar(1.55); this.obj.position.copy(this.pos).setY(this.pos.y + 9);
    this.n = nodes(this.obj); this.head = this.n.BS_Head; if (this.n.BS_Up) this.n.BS_Up.visible = false;
    this.obj.rotation.y = Math.atan2(-pad.x, -pad.z);   // faces outward from the reactor
    G.scene.add(this.obj);
    this.fireT = 0.8; this.tgtT = 0; this.tgt = null; this.ph = Math.random() * 6; this.missT = FORT.missT; this.drop = 0.5;
    this.hackT = 0; this.hacker = null; this.flash = 0;
    this._ent = { isAlly: true, isBastion: true, c: new V3(), r: 2.8, get alive() { return this.w.alive && !(this.w.hackT > 0); }, w: this, hit: (dmg) => this.damage(dmg) };
    G.friends.push(this);
    G.fx.streak(new V3(pad.x, pad.y + 60, pad.z), new V3(pad.x, pad.y + 2, pad.z), 1.2, 0x80e0ff, 0.3);
    sfx('sentry', G.player ? G.player.pos.distanceTo(this.pos) : 0);
  }
  center(out) { return out.set(this.pos.x, this.pos.y + 3.3, this.pos.z); }
  upgrade() {
    this.lv = 2; this.maxHp = FORT.hp[1]; this.hp = this.maxHp;
    if (this.n.BS_Up) this.n.BS_Up.visible = true; this.obj.scale.setScalar(1.7);
    G.fx.ring(new V3(this.pos.x, this.pos.y + 1, this.pos.z), null, 1, 7, 0.45, 0x80e0ff); G.fx.sparks(this.center(_a), null, 18, 0x9fe8ff, 14, 1, 0.4, 0.22);
    sfx('sentry', G.player ? G.player.pos.distanceTo(this.pos) : 0);
  }
  damage(dmg) {
    if (!this.alive || this.hackT > 0) return;
    this.hp -= dmg * G.diff.dmg; this.flash = 0.1;
    G.fortDmg = (G.fortDmg || 0) + dmg * G.diff.dmg;
    if (this.hp <= 0) this.end(true);
  }
  end(broken, quiet) {
    if (!this.alive) return;
    this.alive = false; this.hackT = 0;
    const c = this.center(new V3());
    if (broken) { G.fx.explosion(c, 1.0, 0xffb060); sfx('boom', G.player ? G.player.pos.distanceTo(c) : 0); if (G.fort) G.fort.lost++; G.onFortLost && G.onFortLost(this); }
    this.obj.parent && this.obj.parent.remove(this.obj);
    const i = G.friends.indexOf(this); if (i >= 0) G.friends.splice(i, 1);
    if (!quiet) for (const e of G.enemies) if (e.foe === this) e.tgT = 0;
  }
  hack(t, by) {
    if (!this.alive || this.hackT > 0) return;
    this.hackT = t; this.hacker = by; this.tgt = null; this.tgtT = 0;
    const i = G.friends.indexOf(this); if (i >= 0) G.friends.splice(i, 1);
    for (const e of G.enemies) if (e.foe === this) e.tgT = 0;
    if (G.fort) G.fort.hacked++;
    G.fx.sparks(this.center(_a), null, 20, 0xff40e0, 14, 1, 0.4, 0.22);
    G.onFortHack && G.onFortHack(this);
  }
  unhack() {
    if (!(this.hackT > 0)) return;
    this.hackT = 0; this.hacker = null; this.tgt = null; this.tgtT = 0;
    if (this.alive && !G.friends.includes(this)) G.friends.push(this);
    G.fx.sparks(this.center(_a), null, 14, 0x80e0ff, 12, 1, 0.35, 0.2);
    G.onFortFree && G.onFortFree(this);
  }
  update(dt) {
    this.ph += dt;
    if (this.drop > 0) {
      this.drop -= dt; const k = Math.max(0, this.drop / 0.5);
      this.obj.position.y = this.pos.y + 9 * k * k;
      if (this.drop <= 0) { G.fx.ring(new V3(this.pos.x, this.pos.y + 0.3, this.pos.z), null, 1, 7, 0.4, 0x9fe8ff); G.fx.smoke(this.pos, 6, 3, 2, 0x8a8a8a, 1.4, 0.8); G.fx.trauma = Math.min(1, (G.fx.trauma || 0) + 0.2); }
      return;
    }
    const hacked = this.hackT > 0;
    if (hacked) {
      this.hackT -= dt;
      const h = this.hacker;
      if (this.hackT <= 0 || !h || !h.alive || h.dying || h.stunT > 0) { this.unhack(); return; }
      if (Math.random() < 0.35) G.fx.emit('add', { x: this.pos.x + (Math.random() - 0.5) * 3, y: this.pos.y + 1.5 + Math.random() * 2.5, z: this.pos.z + (Math.random() - 0.5) * 3, vy: 1.2, life: 0.35, s0: 0.8, s1: 0.2, c0: 0xff40e0 });
    }
    const P = this.center(_a).clone();
    this.tgtT -= dt;
    if (this.tgtT <= 0) {
      this.tgtT = 0.3; this.tgt = null; let bd = FORT.range;
      if (hacked) {
        for (const f of [G.player, ...G.friends]) {
          if (!f || !f.alive || f === this) continue;
          const fc = f.center(new V3()), dd = fc.distanceTo(P);
          if (dd < bd && clearLine(P, fc)) { bd = dd; this.tgt = f; }
        }
      } else {
        for (const e of entsFor('P')) {
          if (e.isBarrel || e.isMine || e.cloaked || e.kind === 'hijack') continue;   // the hijacker's ECM hull is invisible to turrets
          const dd = e.c.distanceTo(P); if (dd < bd && clearLine(P, e.c)) { bd = dd; this.tgt = e; }
        }
      }
    }
    const t = this.tgt && this.tgt.alive ? this.tgt : null;
    const tc = t ? (t.c && !t.center ? t.c : t.center(new V3())) : null;
    const want = tc ? Math.atan2(-(tc.x - P.x), -(tc.z - P.z)) - this.obj.rotation.y : Math.sin(this.ph * 0.5) * 1.1;
    this.head.rotation.y += angDiff(want, this.head.rotation.y) * Math.min(1, dt * (t ? 7 : 1.5));
    if (this.flash > 0) this.flash -= dt;
    this.fireT -= dt; this.missT -= dt;
    const aimed = t && Math.abs(angDiff(want, this.head.rotation.y)) < 0.2;
    const team = hacked ? 'E' : 'P', label = hacked ? 'bastion-hacked' : 'ally-bastion', mul = hacked ? FORT.hackMul : 1;
    if (aimed && this.fireT <= 0) {
      this.fireT = FORT.rate[this.lv - 1] * (0.9 + Math.random() * 0.2);
      const mp = this.n.Muzzle_Bastion.getWorldPosition(new V3());
      _d.subVectors(tc, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.03; _d.y += (Math.random() - 0.5) * 0.02; _d.z += (Math.random() - 0.5) * 0.03;
      G.curShooter = null;
      spawnShot({ p: mp, v: _d.normalize().multiplyScalar(260), dmg: FORT.dmg[this.lv - 1] * mul, team, kind: team === 'P' ? 'bullet' : 'ebullet', color: hacked ? 0xff50e0 : 0x9fe8ff, w: 0.2, len: 5, life: 0.6, label });
      G.fx.muzzle(mp, _d, hacked ? 0xff60e0 : 0x9fe8ff, 0.8);
      if (Math.random() < 0.3) sfx('dronefire', G.player ? G.player.pos.distanceTo(mp) : 0);
    }
    if (this.lv >= 2 && aimed && this.missT <= 0) {
      this.missT = FORT.missT * (0.85 + Math.random() * 0.3);
      const mp = this.n.Muzzle_Bastion.getWorldPosition(new V3()); mp.y += 1.2;
      const ent = hacked ? (t === G.player ? G.player._ent : t._ent) : t;
      if (ent) {
        spawnShot({ p: mp, v: new V3(0, 30, 0).addScaledVector(_d.subVectors(tc, mp).normalize(), 20), dmg: FORT.mdmg * mul, team, kind: 'missile', splash: 4, target: ent, aim: tc.clone(), life: 4.5, maxSpeed: hacked ? 60 : 85, turn: hacked ? 1.8 : 3.5, label });
        sfx('missile', G.player ? G.player.pos.distanceTo(mp) : 0);
      }
    }
  }
}

// Hijacker: an ECM hover drone that turrets can't see. It flies to the nearest player turret, channels a hack for 2 s (enough
// damage breaks it), then holds the link: the turret fires on you until the hijacker dies, is stunned, or 9 s pass.
export class Hijacker extends Enemy {
  constructor(pos) {
    super('hijack', 'E_Hijack', pos, HIJACK.hp, HIJACK.r); this.boom = 0.8;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.st = 'seek'; this.tb = null; this.chanT = 0; this.chanDmg = 0; this.cdT = 2 + Math.random() * 2;
    this.gunT = 2; this.side = Math.random() < 0.5 ? 1 : -1; this.orbA = Math.random() * 6.28; this.goalV = new V3(); this.zapT = 0; this.bank = 0;
    this.pos.y = groundAt(pos.x, pos.z, 40) + HIJACK.hover; this.c.copy(this.pos);
  }
  hit(dmg) {
    const st = this.st;
    if (st === 'chan') this.chanDmg += dmg;
    super.hit(dmg);
    if (!this.alive && (st === 'chan' || st === 'hold') && G.fort) G.fort.saved++;
    if (this.alive && this.st === 'chan' && this.chanDmg >= HIJACK.interrupt * G.diff.hp) {
      this.st = 'seek'; this.cdT = HIJACK.cd; this.tb = null;
      G.fx.sparks(this.c, null, 14, 0xff40e0, 12, 1, 0.35, 0.2); G.hackBreaks = (G.hackBreaks || 0) + 1;
      G.onHackBreak && G.onHackBreak(this);
    }
  }
  update(dt) {
    const F = G.fort, tg = this.tg(), pc = tg.center(playerC);
    this.cdT -= dt;
    let goal = null, face = null;
    const tb = this.tb;
    if ((this.st === 'chan' || this.st === 'hold') && (!tb || !tb.alive || (this.st === 'hold' && !(tb.hackT > 0 && tb.hacker === this)) || (this.st === 'chan' && tb.hackT > 0))) { this.st = 'seek'; this.tb = null; this.cdT = HIJACK.cd; }
    if (this.st === 'seek' && this.cdT <= 0 && F) {
      let best = null, bd = 1e9;
      for (const p of F.pads) {
        const b = p.tur; if (!b || !b.alive || b.hackT > 0 || b.drop > 0) continue;
        if (G.enemies.some((e) => e !== this && e.kind === 'hijack' && e.alive && e.tb === b)) continue;
        const d = Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z); if (d < bd) { bd = d; best = b; }
      }
      this.tb = best;
      if (best) { this.st = 'go'; G.onHackGo && G.onHackGo(this, best); }
    }
    if (this.st === 'go') {
      const b = this.tb;
      if (!b || !b.alive || b.hackT > 0) { this.st = 'seek'; this.tb = null; }
      else {
        goal = this.goalV.set(b.pos.x, 0, b.pos.z);
        if (Math.hypot(b.pos.x - this.pos.x, b.pos.z - this.pos.z) < HIJACK.chanR) { this.st = 'chan'; this.chanT = HIJACK.chan; this.chanDmg = 0; G.onHackStart && G.onHackStart(this, b); sfx('alarm', G.player ? G.player.pos.distanceTo(this.pos) * 0.5 : 0); }
      }
    }
    if (this.st === 'chan' || this.st === 'hold') {
      const b = this.tb, bc = b.center(_c);
      this.orbA += dt * 0.5 * this.side;
      goal = this.goalV.set(b.pos.x + Math.cos(this.orbA) * HIJACK.holdR, 0, b.pos.z + Math.sin(this.orbA) * HIJACK.holdR); face = bc;
      if (this.st === 'chan') { this.chanT -= dt; if (this.chanT <= 0) { this.st = 'hold'; b.hack(HIJACK.hack, this); } }
      this.zapT -= dt;
      if (this.zapT <= 0) {
        this.zapT = 0.07; const em = this.n.HJ_Emit ? this.n.HJ_Emit.getWorldPosition(new V3()) : this.c.clone();
        G.fx.lightning(em, bc.clone(), 0xff40e0, this.st === 'chan' ? 0.22 + (1 - this.chanT / HIJACK.chan) * 0.3 : 0.5, 0.1, 1.2);
      }
    }
    if (!goal) {   // nothing to hack: circle the target at 30-40 m and plink
      this.orbA += dt * 0.35 * this.side;
      goal = this.goalV.set(pc.x + Math.cos(this.orbA) * 34, 0, pc.z + Math.sin(this.orbA) * 34);
    }
    const gx = goal.x - this.pos.x, gz = goal.z - this.pos.z, gl = Math.hypot(gx, gz) || 1;
    const sp = HIJACK.speed * Math.min(1, gl / 8 + 0.25), k = 1 - Math.exp(-2.4 * dt);
    this.vel.x += (gx / gl * sp - this.vel.x) * k; this.vel.z += (gz / gl * sp - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 1.6, 2)) { this.pos.x -= this.vel.x * dt; this.pos.z -= this.vel.z * dt; this.vel.multiplyScalar(-0.3); this.side *= -1; this.climbT = 2.5; }
    if (this.climbT > 0) this.climbT -= dt;
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) + HIJACK.hover + (this.climbT > 0 ? 16 : 0) + Math.sin(G.time * 2.5 + this.side) * 0.4;
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-3 * dt));
    const ny = face ? Math.atan2(-(face.x - this.pos.x), -(face.z - this.pos.z)) : Math.hypot(this.vel.x, this.vel.z) > 1 ? Math.atan2(-this.vel.x, -this.vel.z) : this.yaw;
    const turn = angDiff(ny, this.yaw); this.yaw += turn * Math.min(1, dt * 5);
    this.bank += (Math.max(-0.45, Math.min(0.45, -turn * 2)) - this.bank) * Math.min(1, dt * 4);
    this.obj.rotation.set(0, this.yaw, this.bank, 'YXZ');
    this.c.copy(this.pos);
    if ((this.st === 'chan' || this.st === 'hold') && Math.random() < 0.4) G.fx.emit('add', { x: this.pos.x, y: this.pos.y - 0.6, z: this.pos.z, life: 0.25, s0: 1.2, s1: 0.2, c0: 0xff40e0 });
    this.gunT -= dt;
    const dist = pc.distanceTo(this.pos);
    if (this.st !== 'chan' && this.gunT <= 0 && dist < HIJACK.gunR && this.checkLos(dt)) {
      this.gunT = HIJACK.gunCd;
      for (let i = 0; i < 2; i++) G.queue.push({ t: i * 0.12, label: 'hijack-gun', fn: () => {
        if (!this.alive) return;
        const aim = lead(this.c, 150, _b, tg); _d.subVectors(aim, this.c).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.05; _d.normalize();
        spawnShot({ p: this.c, v: _d.clone().multiplyScalar(150), dmg: HIJACK.dmg, team: 'E', kind: 'ebullet', color: 0xff70e0, w: 0.18, len: 3, life: 0.5, label: 'hijack-gun' });
      } });
      sfx('eshot', dist);
    }
  }
}

// RF-2 reflector: a short bubble round the player that bounces enemy projectiles back at the nearest enemy
const REFL_KINDS = new Set(['ebullet', 'bullet', 'missile', 'plasma', 'grenade', 'shell']);
let reflMesh = null;
function reflectShot(s, pc) {
  const d = G.refl.d, at = new V3(s.x, s.y, s.z);
  let best = null, bd = 140;
  for (const e of entsFor('P')) { if (e.isBarrel || e.isMine || e.cloaked || e.holo) continue; const dd = e.c.distanceTo(at); if (dd < bd) { bd = dd; best = e; } }
  const sp = s.v.length();
  if (best) s.v.subVectors(best.c, at).normalize(); else s.v.normalize().multiplyScalar(-1);
  s.v.x += (Math.random() - 0.5) * 0.03; s.v.y += (Math.random() - 0.5) * 0.03; s.v.z += (Math.random() - 0.5) * 0.03; s.v.normalize();
  if (s.kind === 'missile') { s.v.multiplyScalar(Math.max(40, Math.min(sp, 80))); s.speed = s.v.length(); s.maxSpeed = Math.max(s.maxSpeed, 90); s.target = best; s.aim = best ? best.c.clone() : null; s.turn = 4; }
  else if (s.kind === 'ebullet' || s.kind === 'bullet') { s.kind = 'bullet'; s.v.multiplyScalar(Math.max(120, Math.min(sp, 220))); }
  else { s.grav = 0; s.splash = Math.max(s.splash || 0, 3.5); s.v.multiplyScalar(Math.max(70, Math.min(sp, 120))); }
  s.x = pc.x + (s.x - pc.x) * 1.02; s.y = pc.y + (s.y - pc.y) * 1.02; s.z = pc.z + (s.z - pc.z) * 1.02;
  s.team = 'P'; s.dmg *= d.mul; s.label = 'reflect'; s.color = 0x80f0ff; s.age = 0; s.life = Math.max(s.life, 1.6);
  s.frostP = 0; s.jamOrb = false; s.acid = false; s.decay = false; s.chill = 0; s.bounce = 0;
  G.stats.shots++; G.reflN = (G.reflN || 0) + 1;
  G.fx.sparks(at, s.v.clone().normalize(), 5, 0xb0f8ff, 14, 0.6, 0.2, 0.2);
  if (Math.random() < 0.3) sfx('ric', 0);
}
function updateReflect(dt) {
  const R = G.refl, P = G.player;
  if (R && R.t > 0 && P && P.alive) R.t -= dt;
  const on = R && R.t > 0 && P && P.alive;
  if (!reflMesh && on) {
    reflMesh = new THREE.Group();
    reflMesh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x80f0ff).multiplyScalar(1.4), transparent: true, opacity: 0.35, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })));
    reflMesh.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.98, 3), new THREE.MeshBasicMaterial({ color: 0x40a8d0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })));
    G.scene.add(reflMesh);
  }
  if (!reflMesh) return;
  reflMesh.visible = !!on;
  if (!on) return;
  const k = Math.min(1, (R.d.dur - R.t) * 8, R.t * 5);
  P.center(reflMesh.position); reflMesh.scale.setScalar(R.d.R * (0.6 + 0.4 * k));
  reflMesh.rotation.y += dt * 1.5; reflMesh.rotation.x += dt * 0.7;
  reflMesh.children[0].material.opacity = 0.35 * k + (R.hitT > 0 ? 0.3 : 0); reflMesh.children[1].material.opacity = 0.12 * k;
  if (R.hitT > 0) R.hitT -= dt;
}
export function clearRefl() { G.refl = null; G.reflN = 0; if (reflMesh) reflMesh.visible = false; }

// ------------------------------------------------------------------ v44 push the line: a lane from your base (east) to the enemy
// citadel (west). Two towers guard the lane; while either stands the citadel is shielded. Allied tank squads roll out of your
// base every 18 s and push to the next objective. Shades hide nearby enemies until they open fire.
export const LANE = { home: [125, 0], cit: [-130, 0], towers: [[-60, 16], [-60, -16]], towerHp: 4500, citHp: 7000, citS: 1.25, escort: 36, armK: 0.3,
  trHp: 240, trSpeed: 6.5, trRange: 42, trDmg: 5, trRate: 1.7, squad: 4, squadT: 18, maxTroop: 12, park: 28,
  twRange: 110, twDmg: 9, twRate: 2.8, citRange: 130, citDmg: 18, citRate: 6 };
export const SHADE = { hp: 450, r: 1.7, R: 24, near: 16, hover: 7, speed: 11, keep: 40, reveal: 1.2,
  kinds: new Set(['walker', 'drone', 'bulwark', 'gunship', 'mender', 'sapper', 'crawler', 'leech']) };
export function startLane() {
  clearLane();
  const towers = LANE.towers.map(([x, z]) => new Tower(new V3(x, groundAt(x, z, 20), z)));
  const [cx, cz] = LANE.cit;
  const cit = new Citadel(new V3(cx, groundAt(cx, cz, 20), cz));
  G.lane = { towers, cit, troops: [], squadT: 3, sent: 0, lost: 0, abs: 0 };
  G.veilN = 0; G.veilT = 0;
}
export function clearLane() {
  const L = G.lane; if (!L) return;
  for (const t of L.troops.slice()) t.end(true);
  G.lane = null;
}
export function laneEscorted(o) {   // towers and the citadel only take full damage with an allied tank close by
  const L = G.lane; if (!L) return true;
  const R = LANE.escort + (o.kind === 'citadel' ? 8 : 0);
  return L.troops.some((t) => t.alive && Math.hypot(t.pos.x - o.pos.x, t.pos.z - o.pos.z) < R);
}
function armorHit(o, dmg) {
  if (laneEscorted(o)) return dmg;
  o.armT = (o.armT || 0) - 1; if (o.armT <= 0) { o.armT = 6; G.fx.sparks(_a.copy(o.c).add(_b.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3)), null, 3, 0xffd080, 10, 0.8, 0.2, 0.2); }
  if (G.lane) G.lane.armored = (G.lane.armored || 0) + dmg * (1 - LANE.armK);
  G.onArmor && G.onArmor(o);
  return dmg * LANE.armK;
}
export function laneObjective() {   // the next thing the squads (and the autopilot) push at
  const L = G.lane; if (!L) return null;
  let best = null, bd = 1e9;
  for (const t of L.towers) if (t.alive) { const d = t.pos.x; if (best === null || d > bd) { bd = d; best = t; } }
  return best || (L.cit.alive ? L.cit : null);
}
function updateLane(dt) {
  const L = G.lane; if (!L) return;
  for (let i = L.troops.length - 1; i >= 0; i--) { const t = L.troops[i]; if (t.alive) t.update(dt); else L.troops.splice(i, 1); }
  if (!L.cit.alive) return;
  L.squadT -= dt;
  if (L.squadT <= 0) {
    L.squadT = LANE.squadT;
    const n = Math.min(LANE.squad, LANE.maxTroop - L.troops.length);
    for (let k = 0; k < n; k++) {
      const z = (k - (n - 1) / 2) * 4.2, x = LANE.home[0] - 14 - (k % 2) * 3;
      L.troops.push(new Trooper(new V3(x, groundAt(x, z, 20), z), z * 1.6));
      L.sent++;
    }
    if (n > 0) G.onSquad && G.onSquad(n);
  }
}

// Shade: a hovering cloak projector. Enemies of the listed kinds within 24 m of a Shade are veiled (no lock-on, no radar, the
// autopilot and your drones ignore them) unless they are within 16 m of you, fired in the last 1.2 s, or are sonar-marked.
function veilMats(e, on) {   // veiled enemies swap to transparent copies of their materials
  if (on && !e._vm) { unflash(e); e._vm = []; e.obj.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) { const m = o.material.clone(); m.transparent = true; m.depthWrite = false; if (m.emissive) { m.emissive.setHex(0x7040e0); m.emissiveIntensity = 0.7; } e._vm.push([o, o.material, m, o.castShadow]); } }); }
  if (!e._vm) return;
  for (const [o, m0, m1, cs] of e._vm) { o.material = on ? m1 : m0; o.castShadow = on ? false : cs; }
}
function updateVeil(dt) {
  const shades = [];
  for (const e of G.enemies) if (e.kind === 'shade' && e.alive && !e.dying && !(e.stunT > 0)) shades.push(e);
  if (!shades.length && !G.veilN) return;
  const P = G.player; let n = 0;
  for (const e of G.enemies) {
    if (!SHADE.kinds.has(e.kind) || !e.obj) continue;
    let want = false;
    if (shades.length && e.alive && !e.dying && !(e.markT > 0) && !((e.pingT || 0) > FOG.ping - SHADE.reveal) && !(P && P.alive && e.c.distanceTo(P.pos) < SHADE.near))
      for (const s of shades) if (s.pos.distanceTo(e.c) < SHADE.R) { want = true; break; }
    if (want) {
      if (!e.veil) { e.veil = true; e.cloaked = true; e.veilPh = Math.random() * 6; veilMats(e, true); G.fx.sparks(e.c, null, 6, 0xb080ff, 8, 0.8, 0.3, 0.2); }
      const a = 0.2 + 0.08 * Math.sin(G.time * 7 + e.veilPh) + (Math.sin(G.time * 19 + e.veilPh) > 0.9 ? 0.2 : 0);
      for (const v of e._vm) v[2].opacity = a;
      if (Math.random() < 0.12) G.fx.emit('add', { x: e.c.x + (Math.random() - 0.5) * 3, y: e.c.y + (Math.random() - 0.5) * 3, z: e.c.z + (Math.random() - 0.5) * 3, vy: 0.8, life: 0.4, s0: 0.9, s1: 0.2, c0: 0x9a60ff });
      n++;
    } else if (e.veil) {
      e.veil = false; e.cloaked = false; veilMats(e, false);
      if (e.alive) G.fx.sparks(e.c, null, 5, 0xc0a0ff, 8, 0.8, 0.25, 0.2);
    }
  }
  G.veilN = n; if (n) G.veilT = (G.veilT || 0) + dt;
}
const shadeRingGeo = new THREE.RingGeometry(SHADE.R - 0.5, SHADE.R, 56);
export class Shade extends Enemy {
  constructor(pos) {
    super('shade', 'E_Shade', pos, SHADE.hp, SHADE.r); this.boom = 0.9; this.obj.scale.setScalar(1.35);
    this.vel = new V3(); this.side = Math.random() < 0.5 ? 1 : -1; this.orbA = Math.random() * 6.28; this.goalV = new V3(); this.ph = Math.random() * 6;
    this.pos.y = groundAt(pos.x, pos.z, 40) + SHADE.hover; this.c.set(this.pos.x, this.pos.y + 3, this.pos.z);
    this.ring = new THREE.Mesh(shadeRingGeo, new THREE.MeshBasicMaterial({ color: 0x9a60ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.ring.rotation.x = -Math.PI / 2; G.scene.add(this.ring);
  }
  remove() { super.remove(); this.ring.parent && this.ring.parent.remove(this.ring); this.ring.material.dispose(); }
  update(dt) {
    this.ph += dt;
    if (this.n.SH_Ring1) this.n.SH_Ring1.rotation.z += dt * 1.6;
    if (this.n.SH_Ring2) this.n.SH_Ring2.rotation.z -= dt * 2.3;
    const tg = this.tg(), pc = tg.center(playerC);
    // follow the middle of the nearby pack, but never come within 40 m of the target
    let cx = 0, cz = 0, k = 0;
    for (const e of G.enemies) if (SHADE.kinds.has(e.kind) && e.alive && !e.dying && e.pos.distanceTo(this.pos) < 70) { cx += e.pos.x; cz += e.pos.z; k++; }
    let gx, gz;
    if (k) { gx = cx / k; gz = cz / k; }
    else { this.orbA += dt * 0.3 * this.side; gx = pc.x + Math.cos(this.orbA) * 55; gz = pc.z + Math.sin(this.orbA) * 55; }
    const ax = gx - pc.x, az = gz - pc.z, ad = Math.hypot(ax, az) || 1;
    if (ad < SHADE.keep) { gx = pc.x + ax / ad * SHADE.keep; gz = pc.z + az / ad * SHADE.keep; }
    const dx = gx - this.pos.x, dz = gz - this.pos.z, dl = Math.hypot(dx, dz) || 1;
    const sp = SHADE.speed * Math.min(1, dl / 10 + 0.15), kk = 1 - Math.exp(-2 * dt);
    this.vel.x += (dx / dl * sp - this.vel.x) * kk; this.vel.z += (dz / dl * sp - this.vel.z) * kk;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 1.4, 4)) { this.pos.x -= this.vel.x * dt; this.pos.z -= this.vel.z * dt; this.vel.multiplyScalar(-0.3); this.climbT = 2.5; }
    if (this.climbT > 0) this.climbT -= dt;
    this.pos.x = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.x)); this.pos.z = Math.max(-ARENA + 4, Math.min(ARENA - 4, this.pos.z));
    const g = groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
    const gy = g + SHADE.hover + (this.climbT > 0 ? 14 : 0) + Math.sin(this.ph * 1.7) * 0.6;
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-2.5 * dt));
    this.obj.rotation.set(Math.sin(this.ph) * 0.06, this.ph * 0.4, Math.cos(this.ph * 0.8) * 0.06);
    this.c.set(this.pos.x, this.pos.y + 3, this.pos.z);
    this.ring.position.set(this.pos.x, groundAt(this.pos.x, this.pos.z, this.pos.y) + 0.35, this.pos.z);
    this.ring.material.opacity = 0.22 + 0.14 * Math.sin(this.ph * 3);
    this.ring.rotation.z += dt * 0.4;
    if (Math.random() < 0.25) G.fx.emit('add', { x: this.c.x, y: this.c.y, z: this.c.z, vy: -1.5, life: 0.5, s0: 1.4, s1: 0.2, c0: 0x9a60ff });
  }
}

// Lane tower: armoured pylon with a twin cannon head; shields the citadel while it stands
export class Tower extends Enemy {
  constructor(pos) {
    super('tower', 'E_Tower', pos, LANE.towerHp, 2.3); this.boom = 2.4; this.isObjective = true;
    this.c.set(pos.x, pos.y + 8.8, pos.z);
    this.solids = [addSolid(pos.x, pos.z, 5, 5, 1, 0, 'tower'), addSolid(pos.x, pos.z, 2.6, 2.6, 6.7, 1, 'tower')];   // the gun head (hit sphere) stays clear of the boxes
    this.burst = 0; this.burstT = 0; this.fireT = 2 + Math.random();
  }
  hit(dmg, at, label) { if (!isAlly(label || G.curLabel)) this.aggroT = 3; super.hit(armorHit(this, dmg)); }
  pickT(dt) {   // towers shoot the tank column first; the player only when close or after hitting the tower
    const P = G.player;
    if (P && P.alive && (this.aggroT > 0 || Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 45)) return P;
    this.scanT = (this.scanT || 0) - dt;
    if (this.scanT <= 0) { this.scanT = 0.5; this.tr = null; let bd = LANE.twRange; if (G.lane) for (const t of G.lane.troops) { if (!t.alive) continue; const c = t.center(new V3()), d = c.distanceTo(this.c); if (d < bd && clearLine(this.c, c)) { bd = d; this.tr = t; } } }
    return this.tr && this.tr.alive ? this.tr : this.tg();
  }
  remove() { super.remove(); for (const s of this.solids) removeSolid(s); this.solids = []; }
  die() {
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c, 9, 40, 'P', 2.4, 0xff7040); G.fx.flash(this.c, 0xff8040, 50, 30, 0.4);
    for (let k = 0; k < 3; k++) G.queue.push({ label: 'tower', t: 0.25 + k * 0.3, fn: () => explodeAt(new V3(this.pos.x + (Math.random() - 0.5) * 3, 2 + k * 2.5, this.pos.z + (Math.random() - 0.5) * 3), 0, 0, 'P', 1.2) });
    this.remove();
  }
  update(dt) {
    if (this.aggroT > 0) this.aggroT -= dt;
    const p = this.pickT(dt), pc = p.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz);
    const Y = this.n.TW_Yaw; Y.rotation.y += angDiff(Math.atan2(-dx, -dz), Y.rotation.y) * Math.min(1, dt * 2.2);
    if (dist < LANE.twRange && (p !== G.player || this.checkLos(dt))) {
      this.fireT -= dt;
      if (this.fireT <= 0) { this.burst = 6; this.bt = p; this.burstT = 0; this.fireT = LANE.twRate * (0.9 + Math.random() * 0.25); }
    }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burst--; this.burstT = 0.11;
        const mp = this.n.Muzzle_Tower.getWorldPosition(new V3());
        const bt = this.bt && this.bt.alive ? this.bt : this.tg(), aim = lead(mp, 170, _b, bt);
        _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.035; _d.y += (Math.random() - 0.5) * 0.025; _d.z += (Math.random() - 0.5) * 0.035;
        spawnShot({ p: mp, v: _d.normalize().multiplyScalar(170), dmg: LANE.twDmg, team: 'E', kind: 'ebullet', color: 0xff5030, w: 0.36, len: 7, label: 'tower' });
        G.fx.muzzle(mp, _d, 0xff8a50, 1.5); sfx('eshot', dist);
      }
    }
  }
}

// Citadel: the enemy base. Shielded while any tower stands; lobs plasma at whatever is closest
export class Citadel extends Enemy {
  constructor(pos) {
    const S = LANE.citS;
    super('citadel', 'E_Citadel', pos, LANE.citHp, 3.2); this.boom = 4; this.isObjective = true; this.obj.scale.setScalar(S);
    this.c.set(pos.x, pos.y + 9.2 * S, pos.z);
    this.solids = [addSolid(pos.x, pos.z, 16 * S, 16 * S, 1.6 * S, 0, 'citadel'), addSolid(pos.x, pos.z, 11 * S, 11 * S, 2.2 * S, 1.6 * S, 'citadel'), addSolid(pos.x, pos.z, 6.5 * S, 6.5 * S, 4.8 * S, 3.6 * S, 'citadel')];
    this.dome = new THREE.Group();
    this.dome.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5030).multiplyScalar(1.3), transparent: true, opacity: 0.3, wireframe: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })));
    this.dome.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.99, 4), new THREE.MeshBasicMaterial({ color: 0x902010, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })));
    this.dome.position.set(pos.x, pos.y + 6 * S, pos.z); this.dome.scale.setScalar(13.5 * S); G.scene.add(this.dome);
    this.fireT = 4; this.zapT = 0; this.shT = 0; this.ph = 0; this.wasSh = true;
  }
  get shielded() { return !!(G.lane && G.lane.towers.some((t) => t.alive)); }
  hit(dmg) {
    if (!this.alive || this.dying) return;
    if (this.shielded) {
      if (G.lane) G.lane.abs += dmg;
      this.shT = 0.15;
      if (Math.random() < 0.3) { const a = Math.random() * 6.28; G.fx.sparks(_a.set(this.pos.x + Math.cos(a) * 12, this.pos.y + 6 + Math.random() * 8, this.pos.z + Math.sin(a) * 12), null, 3, 0xff7050, 9, 0.8, 0.25, 0.2); }
      return;
    }
    super.hit(dmg);
  }
  remove() { super.remove(); for (const s of this.solids) removeSolid(s); this.solids = []; if (this.dome) { this.dome.parent && this.dome.parent.remove(this.dome); for (const m of this.dome.children) { m.geometry.dispose(); m.material.dispose(); } this.dome = null; } }
  die() {
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c, 14, 60, 'P', 4, 0xff7040); G.fx.flash(this.c, 0xff9050, 90, 40, 0.7);
    for (let k = 0; k < 6; k++) G.queue.push({ label: 'citadel', t: 0.2 + k * 0.25, fn: () => explodeAt(new V3(this.pos.x + (Math.random() - 0.5) * 14, 2 + Math.random() * 8, this.pos.z + (Math.random() - 0.5) * 14), 0, 0, 'P', 2) });
    this.remove();
  }
  update(dt) {
    this.ph += dt;
    const sh = this.shielded;
    if (this.wasSh && !sh) { this.wasSh = false; G.fx.ring(new V3(this.pos.x, this.pos.y + 1, this.pos.z), null, 2, 22, 0.6, 0xff7050); G.fx.flash(this.c, 0xff6040, 60, 30, 0.4); sfx('shieldbreak', G.player ? G.player.pos.distanceTo(this.pos) : 0); G.onCitadelOpen && G.onCitadelOpen(this); }
    if (this.dome) {
      this.dome.visible = sh;
      if (sh) {
        this.dome.rotation.y += dt * 0.15; if (this.shT > 0) this.shT -= dt;
        this.dome.children[0].material.opacity = 0.22 + 0.08 * Math.sin(this.ph * 2) + (this.shT > 0 ? 0.25 : 0);
        this.zapT -= dt;
        if (this.zapT <= 0) {   // the towers feed the dome: arcs from each living tower to a mast
          this.zapT = 0.5 + Math.random() * 0.4;
          for (const t of G.lane.towers) if (t.alive && Math.random() < 0.7) { const m = this.n['CT_Mast' + (1 + ((Math.random() * 4) | 0))]; G.fx.lightning(t.c.clone(), m ? m.getWorldPosition(new V3()).setY(this.pos.y + 7 * LANE.citS) : this.c.clone(), 0xff6040, 0.35, 0.14, 2.2); }
        }
      }
    }
    const p = this.tg(), pc = p.center(playerC), dist = pc.distanceTo(this.c);
    this.fireT -= dt;
    if (this.fireT <= 0 && dist < LANE.citRange && this.checkLos(dt)) {
      this.fireT = LANE.citRate * (0.85 + Math.random() * 0.3);
      for (let k = 0; k < 4; k++) G.queue.push({ label: 'citadel', t: k * 0.22, fn: () => {
        if (!this.alive) return;
        const mp = this.c.clone(); mp.y += 2;
        const aim = lead(mp, 75, _b, this.tg()); _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.06; _d.y += 0.03 + (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.06; _d.normalize();
        spawnShot({ p: mp, v: _d.clone().multiplyScalar(75), dmg: LANE.citDmg, team: 'E', kind: 'plasma', splash: 5, life: 3, size: 1.2, label: 'citadel' });
      } });
      sfx('cannon', dist);
    }
  }
}

// Trooper: allied squad tank. Rolls down the lane toward the next objective, stops to fight anything within range
export class Trooper {
  constructor(pos, lz) {
    this.alive = true; this.isTrooper = true; this.maxHp = LANE.trHp; this.hp = this.maxHp; this.lz = lz;
    this.foeW = 1.2; this.foeWAir = 1.15; this.foeWBoss = 1.5;
    this.pos = pos.clone(); this.vel = new V3(); this.yaw = Math.PI / 2;   // facing west, down the lane
    this.obj = cloneKit('A_Trooper'); this.obj.scale.setScalar(1.2); this.obj.position.copy(this.pos); G.scene.add(this.obj);
    this.n = nodes(this.obj); this.tur = this.n.TR_Turret;
    this.fireT = 1 + Math.random(); this.burst = 0; this.burstT = 0; this.tgt = null; this.tgtT = 0; this.flash = 0; this.stuck = 0;
    this._ent = { isAlly: true, c: new V3(), r: 2.2, get alive() { return this.w.alive; }, w: this, hit: (d) => this.damage(d) };
    G.friends.push(this);
  }
  center(out) { return out.set(this.pos.x, this.pos.y + 1.7, this.pos.z); }
  damage(d) { if (!this.alive) return; this.hp -= d * G.diff.dmg; this.flash = 0.1; if (this.hp <= 0) this.end(false); }
  end(quiet) {
    if (!this.alive) return;
    this.alive = false;
    if (!quiet) { const c = this.center(new V3()); G.fx.explosion(c, 0.8, 0xffb060); sfx('boom', G.player ? G.player.pos.distanceTo(c) : 0); if (G.lane) G.lane.lost++; }
    this.obj.parent && this.obj.parent.remove(this.obj);
    const i = G.friends.indexOf(this); if (i >= 0) G.friends.splice(i, 1);
    for (const e of G.enemies) if (e.foe === this) e.tgT = 0;
  }
  update(dt) {
    const P = this.center(new V3());
    this.tgtT -= dt;
    if (this.tgtT <= 0) {
      this.tgtT = 0.4; this.tgt = null; let bd = LANE.trRange;
      for (const e of entsFor('P')) {
        if (e.isBarrel || e.isMine || e.cloaked || e.holo) continue;
        if (e.kind === 'citadel' && e.shielded) continue;
        const dd = e.c.distanceTo(P); if (dd < bd && clearLine(P, e.c)) { bd = dd; this.tgt = e; }
      }
    }
    const t = this.tgt && this.tgt.alive ? this.tgt : null;
    // drive: to a parking spot short of the next objective, stop while there is something to shoot
    const o = laneObjective();
    let sp = 0, gx = this.pos.x, gz = this.lz;
    if (o) { gx = o.pos.x + LANE.park; if (o === G.lane.cit) gx += 4; }
    const dx = gx - this.pos.x, dz = gz - this.pos.z, dl = Math.hypot(dx, dz);
    if (!t && dl > 2) sp = LANE.trSpeed;
    let vx = dl > 0.01 ? dx / dl * sp : 0, vz = dl > 0.01 ? dz / dl * sp : 0;
    for (const q of G.lane.troops) {   // keep a little spacing
      if (q === this || !q.alive) continue;
      const ox = this.pos.x - q.pos.x, oz = this.pos.z - q.pos.z, od = Math.hypot(ox, oz);
      if (od < 4 && od > 0.01) { vx += ox / od * (4 - od) * 1.5; vz += oz / od * (4 - od) * 1.5; }
    }
    const k = 1 - Math.exp(-3 * dt);
    this.vel.x += (vx - this.vel.x) * k; this.vel.z += (vz - this.vel.z) * k;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 1.9, 2)) { this.pos.x = ox; this.pos.z = oz; this.stuck += dt; if (this.stuck > 0.3) this.lz *= 0.5; this.pos.z += Math.sign(-this.pos.z || 1) * dt * 4; if (collideCyl(this.pos, 1.9, 2)) this.pos.z = oz; }
    else this.stuck = 0;
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 2);
    const v = Math.hypot(this.vel.x, this.vel.z);
    if (v > 0.6) this.yaw += angDiff(Math.atan2(-this.vel.x, -this.vel.z), this.yaw) * Math.min(1, dt * 4);
    this.obj.position.copy(this.pos); this.obj.rotation.set(0, this.yaw, 0);
    const tc = t ? t.c : null;
    const want = tc ? Math.atan2(-(tc.x - P.x), -(tc.z - P.z)) - this.yaw : 0;
    this.tur.rotation.y += angDiff(want, this.tur.rotation.y) * Math.min(1, dt * 5);
    if (this.flash > 0) this.flash -= dt;
    this.fireT -= dt;
    if (t && this.fireT <= 0 && Math.abs(angDiff(want, this.tur.rotation.y)) < 0.25) { this.fireT = LANE.trRate * (0.85 + Math.random() * 0.3); this.burst = 3; this.burstT = 0; }
    if (this.burst > 0 && t) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burst--; this.burstT = 0.13;
        const mp = this.n.Muzzle_Trooper.getWorldPosition(new V3()), dir = new V3().subVectors(tc, mp).normalize();
        dir.x += (Math.random() - 0.5) * 0.04; dir.y += (Math.random() - 0.5) * 0.03; dir.z += (Math.random() - 0.5) * 0.04; dir.normalize();
        G.curShooter = null;
        spawnShot({ p: mp, v: dir.multiplyScalar(200), dmg: LANE.trDmg, team: 'P', kind: 'bullet', color: 0x80c8ff, w: 0.22, len: 5, life: 0.5, label: 'ally-trooper' });
        G.fx.muzzle(mp, dir, 0x9fd8ff, 0.8);
        if (Math.random() < 0.25) sfx('dronefire', G.player ? G.player.pos.distanceTo(mp) : 0);
      }
    }
  }
}

// RB-3 repair beam: heals the most damaged ally in range; with nobody hurt it drains the enemy under the crosshair instead
let rbMesh = null;
function rbHolder(f) { return f.hp !== undefined && f.maxHp ? f : f.mech && f.mech.hp !== undefined ? f.mech : null; }
function updateRBeam(dt) {
  const R = G.rbeam, P = G.player;
  const on = R && R.t > 0 && P && P.alive;
  if (on) R.t -= dt;
  if (!rbMesh && on) {
    rbMesh = new THREE.Group();
    const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    rbMesh.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40ff70).multiplyScalar(1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })));
    rbMesh.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe8ffe8, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })));
    G.scene.add(rbMesh);
  }
  if (!rbMesh) return;
  rbMesh.visible = false;
  if (!on) return;
  const d = R.d, from = P.muzzlePos(R.slot, new V3(), 0);
  R.sw -= dt;
  const ok = (x) => x && (x.isEnt ? x.e.alive : x.f.alive && rbHolder(x.f) && rbHolder(x.f).hp < rbHolder(x.f).maxHp);
  if (R.sw <= 0 || !ok(R.tgt)) {
    R.sw = 0.35; R.tgt = null; let bk = 0.999;
    for (const f of G.friends) {
      const h = rbHolder(f); if (!f.alive || !h || f.hackT > 0) continue;
      const k = h.hp / h.maxHp, c = f.center(new V3());
      if (k < bk && c.distanceTo(from) < d.R && clearLine(from, c)) { bk = k; R.tgt = { f }; }
    }
    if (!R.tgt && R.aim) {
      const ad = new V3().subVectors(R.aim, from).normalize(); let ba = 0.3;
      for (const e of entsFor('P')) {
        if (e.isBarrel || e.isMine || e.holo || (e.kind === 'citadel' && e.shielded)) continue;
        const v = new V3().subVectors(e.c, from), L = v.length(); if (L > d.R) continue;
        const a = v.normalize().angleTo(ad); if (a < ba && clearLine(from, e.c)) { ba = a; R.tgt = { isEnt: true, e }; }
      }
    }
  }
  const T = R.tgt; if (!T) return;
  const end = T.isEnt ? T.e.c.clone() : T.f.center(new V3());
  const heal = !T.isEnt;
  if (heal) { const h = rbHolder(T.f), x = Math.min(h.maxHp - h.hp, d.heal * dt * (T.f._ent && T.f._ent.isCore ? d.coreK : T.f.isBastion ? d.turK : 1)); h.hp += x; G.rbHeal = (G.rbHeal || 0) + x; }
  else { const x = d.drain * R.mul * dt; const h0 = G.stats.hits; dealDamage(T.e, x, 'P', end, 'repair'); G.stats.hits = h0 + (R.hitE !== T.e ? 1 : 0); R.hitE = T.e; P.hp = Math.min(P.maxHp, P.hp + x * d.back); G.rbDrain = (G.rbDrain || 0) + x; }
  const col = heal ? 0x40ff70 : 0xb0ff30;
  rbMesh.children[0].material.color.setHex(col).multiplyScalar(1.6);
  const L = from.distanceTo(end), fl = 0.85 + Math.random() * 0.3;
  rbMesh.visible = true; rbMesh.position.copy(from); rbMesh.lookAt(end);
  rbMesh.children[0].scale.set(0.32 * fl, 0.32 * fl, L); rbMesh.children[1].scale.set(0.1, 0.1, L);
  if (Math.random() < 0.5) G.fx.sparks(end, null, 2, col, 8, 0.8, 0.3, 0.2);
  if (Math.random() < 0.3) G.fx.emit('add', { x: end.x, y: end.y, z: end.z, vy: heal ? 2 : -1, life: 0.3, s0: 1.4, s1: 0.2, c0: col });
  R.sndT = (R.sndT || 0) - dt; if (R.sndT <= 0) { R.sndT = 0.5; sfx('zap', 0); }
}
export function clearRBeam() { G.rbeam = null; G.rbHeal = 0; G.rbDrain = 0; if (rbMesh) rbMesh.visible = false; }

const salvRingGeo = new THREE.RingGeometry(SALV.padR - 0.4, SALV.padR, 48);
export function startSalvage() {
  clearSalvage();
  const [sx, sz] = SALV.spot; let x = sx, z = sz;
  for (let i = 0; i < 600; i++) {
    const a = i * 2.4, r = Math.sqrt(i) * 2.2; x = sx + Math.cos(a) * r; z = sz + Math.sin(a) * r;
    if (groundAt(x, z, 60) < 0.6 && !collideCyl(new V3(x, 0.5, z), 8, 3)) break;
  }
  const obj = cloneKit('P_SalvPad'); obj.position.set(x, 0, z); G.scene.add(obj);
  const ring = new THREE.Mesh(salvRingGeo, new THREE.MeshBasicMaterial({ color: 0x40ffb0, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.4, z); G.scene.add(ring);
  const orbs = [];
  for (let i = 0; i < SALV.carry; i++) { const o = cloneKit('P_Salvage'); o.scale.setScalar(0.5); o.visible = false; G.scene.add(o); orbs.push(o); }
  G.salv = { pad: { obj, n: nodes(obj), x, z, ring }, cores: [], orbs, carried: 0, delivered: 0, faded: 0, lost: 0, stolen: 0, knocked: 0, grabbed: 0, dropT: 0, padK: 0, flash: 0 };
}
export function clearSalvage() {
  const S = G.salv; if (!S) return;
  const rm = (o) => o && o.parent && o.parent.remove(o);
  rm(S.pad.obj); rm(S.pad.ring); S.pad.ring.material.dispose();
  for (const c of S.cores) rm(c.obj);
  for (const o of S.orbs) rm(o);
  if (G.player) G.player.slowMul = 1;
  G.salv = null;
}
export function dropCores(pos, n, kick = 1) {
  const S = G.salv; if (!S || n <= 0) return;
  for (let k = 0; k < n; k++) {
    const obj = cloneKit('P_Salvage'); G.scene.add(obj);
    const a = Math.random() * 6.28, sp = (3 + Math.random() * 4) * kick;
    const c = { obj, x: pos.x, y: Math.max(pos.y, groundAt(pos.x, pos.z, pos.y + 2) + 1), z: pos.z, v: new V3(Math.cos(a) * sp, 6 + Math.random() * 4, Math.sin(a) * sp), t: 0, air: true, ph: Math.random() * 6 };
    obj.position.set(c.x, c.y, c.z); S.cores.push(c);
  }
}
export function nearestCore(x, z, maxD = 1e9) {
  const S = G.salv; if (!S) return null;
  let best = null, bd = maxD;
  for (const c of S.cores) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
  return best;
}
export function takeCore(c) {
  const S = G.salv; const i = S.cores.indexOf(c); if (i < 0) return false;
  S.cores.splice(i, 1); c.obj.parent && c.obj.parent.remove(c.obj); return true;
}
function salvHit(d) {
  const S = G.salv, P = G.player; if (!S || S.carried <= 0 || d < SALV.dropHit || S.dropT > 0) return;
  S.dropT = SALV.dropCd; S.carried--; S.knocked++;
  dropCores(P.center(new V3()), 1, 2);
  G.onSalvKnock && G.onSalvKnock();
}
function updateSalvage(dt) {
  const S = G.salv; if (!S) return;
  const P = G.player; S.dropT -= dt; if (S.flash > 0) S.flash -= dt;
  for (let i = S.cores.length - 1; i >= 0; i--) {
    const c = S.cores[i]; c.t += dt;
    if (c.air) {
      c.v.y -= 22 * dt; c.x += c.v.x * dt; c.y += c.v.y * dt; c.z += c.v.z * dt;
      c.x = Math.max(-ARENA + 4, Math.min(ARENA - 4, c.x)); c.z = Math.max(-ARENA + 4, Math.min(ARENA - 4, c.z));
      const g = groundAt(c.x, c.z, c.y + 1) + 1;
      if (c.y <= g && c.v.y < 0) { c.y = g; c.air = false; }
    }
    const bob = c.air ? 0 : Math.sin(c.t * 3 + c.ph) * 0.25;
    c.obj.position.set(c.x, c.y + bob, c.z); c.obj.rotation.y += dt * 2.2;
    c.obj.visible = c.t < SALV.life - 6 || Math.sin(c.t * (8 + (c.t - SALV.life + 6) * 4)) > -0.2;
    if (c.t > SALV.life) { c.obj.parent && c.obj.parent.remove(c.obj); S.cores.splice(i, 1); S.faded++; continue; }
    if (P && P.alive && S.carried < SALV.carry && c.t > 0.35 && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < SALV.pickR && Math.abs(c.y - P.pos.y - 2) < 5) {
      c.obj.parent && c.obj.parent.remove(c.obj); S.cores.splice(i, 1); S.carried++; S.grabbed++;
      sfx('coin', 0); G.fx.ring(new V3(c.x, c.y, c.z), null, 0.5, 3, 0.25, 0x40ffb0);
      G.onSalvPick && G.onSalvPick(S.carried);
    }
  }
  if (P) P.slowMul = 1 - SALV.slow * S.carried;
  for (let i = 0; i < S.orbs.length; i++) {
    const o = S.orbs[i]; o.visible = !!(P && P.alive && i < S.carried);
    if (!o.visible) continue;
    const a = G.time * 2.2 + i * Math.PI / 2;
    o.position.set(P.pos.x + Math.cos(a) * 2.3, P.pos.y + 4.4 + Math.sin(G.time * 3 + i) * 0.2, P.pos.z + Math.sin(a) * 2.3); o.rotation.y += dt * 3;
  }
  const pd = S.pad, onPad = P && P.alive && Math.hypot(P.pos.x - pd.x, P.pos.z - pd.z) < SALV.padR && P.pos.y - groundAt(P.pos.x, P.pos.z, P.pos.y + 1) < SALV.padH;
  if (onPad && S.carried > 0) {
    S.padK += dt;
    while (S.padK >= SALV.padT && S.carried > 0) {
      S.padK -= SALV.padT; S.carried--; S.delivered++; S.flash = 0.4;
      G.fx.ring(new V3(pd.x, 0.6, pd.z), null, 1, SALV.padR + 2, 0.45, 0x40ffb0); sfx('repair', 0);
      G.onSalvDeliver && G.onSalvDeliver(S.delivered);
    }
  } else S.padK = 0;
  const b = pd.n.SVP_Beacon; if (b) { const k = 1 + 0.15 * Math.sin(G.time * 4) + S.flash * 1.2; b.scale.setScalar(k); }
  pd.ring.material.opacity = 0.4 + 0.25 * Math.sin(G.time * 3) + (onPad ? 0.3 : 0) + S.flash;
}

// Scavenger: a fast 3 m hover salvage drone. It flies to the nearest loose core and grabs it (holds 3); when it is
// full, or holds some and none are left nearby, it flies straight for the edge of the map and warps out, and the
// cores it holds are lost. If you carry 2+ cores it dives at you and steals one with its magnet (7 m). It shoots a
// weak two-round burst. Kill it and everything it holds falls out, plus one core of its own.
export const SCAV = { hp: 300, r: 1.6, speed: 20, hover: 5, low: 2.4, load: 3, grabR: 3, stealR: 7, stealCd: 3, gunR: 34, gunCd: 1.6, dmg: 7 };
export class Scav extends Enemy {
  constructor(pos) {
    super('scav', 'E_Scav', pos, SCAV.hp, SCAV.r); this.boom = 0.8;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.load = 0; this.st = 'hunt'; this.gunT = 2; this.side = Math.random() < 0.5 ? 1 : -1; this.bank = 0;
    this.stealT = 2; this.exitP = null; this.orbA = Math.random() * 6.28; this.goalV = new V3();
    this.pos.y = groundAt(pos.x, pos.z, 40) + SCAV.hover; this.c.copy(this.pos);
  }
  explode() { if (this.load > 0) dropCores(this.c, this.load); this.load = 0; super.explode(); }
  update(dt) {
    const S = G.salv, P = G.player, tg = this.tg(), pc = tg.center(playerC);
    this.stealT -= dt;
    let goal = null, low = false, dive = false, spd = SCAV.speed;
    if (this.st === 'hunt' && (this.load >= SCAV.load || (this.load > 0 && !nearestCore(this.pos.x, this.pos.z, 90)))) {
      this.st = 'exit';
      const ax = Math.abs(this.pos.x), az = Math.abs(this.pos.z), E = ARENA - 6;
      this.exitP = ax > az ? new V3(Math.sign(this.pos.x || 1) * E, 0, this.pos.z) : new V3(this.pos.x, 0, Math.sign(this.pos.z || 1) * E);
      G.onScavExit && G.onScavExit(this);
    }
    if (this.st === 'exit') {
      goal = this.exitP; spd *= 0.85;
      if (Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) < 5) {
        if (S) S.lost += this.load; G.onScavEscape && G.onScavEscape(this, this.load);
        G.fx.flash(this.c.clone(), 0x40ffb0, 30, 20, 0.35); G.fx.ring(this.pos, null, 1, 8, 0.4, 0x40ffb0);
        this.load = 0; this.alive = false; this.remove(); return;
      }
    } else if (S) {
      if (P && P.alive && S.carried >= 2 && this.stealT <= 0 && P.pos.distanceTo(this.pos) < 70) {
        goal = P.pos; low = true; dive = true; spd *= 1.25;
        if (Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < SCAV.stealR && Math.abs(P.pos.y + 2 - this.pos.y) < 6) {
          S.carried--; S.stolen++; this.load++; this.stealT = SCAV.stealCd;
          G.fx.sparks(P.center(_a), null, 10, 0x40ffb0, 12, 0.8, 0.3, 0.2); sfx('hook', 0);
          G.onScavSteal && G.onScavSteal(this);
        }
      } else {
        const c = nearestCore(this.pos.x, this.pos.z, 160);
        if (c) {
          goal = this.goalV.set(c.x, 0, c.z); const d = Math.hypot(c.x - this.pos.x, c.z - this.pos.z); low = d < 14;
          if (d < SCAV.grabR && !c.air && takeCore(c)) { this.load++; sfx('hook', P ? P.pos.distanceTo(this.pos) : 40); G.onScavGrab && G.onScavGrab(this); }
        }
      }
    }
    if (!goal) {   // nothing to collect: circle the target at 30-40 m
      this.orbA += dt * 0.35 * this.side;
      goal = this.goalV.set(pc.x + Math.cos(this.orbA) * 34, 0, pc.z + Math.sin(this.orbA) * 34);
    }
    const gx = goal.x - this.pos.x, gz = goal.z - this.pos.z, gl = Math.hypot(gx, gz) || 1;
    const sp = spd * Math.min(1, gl / 8 + 0.3), k = 1 - Math.exp(-2.4 * dt);
    this.vel.x += (gx / gl * sp - this.vel.x) * k; this.vel.z += (gz / gl * sp - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 1.6, 2)) { this.pos.x -= this.vel.x * dt; this.pos.z -= this.vel.z * dt; this.vel.multiplyScalar(-0.3); this.side *= -1; }
    let gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) + (low ? SCAV.low : SCAV.hover) + Math.sin(G.time * 3 + this.side) * 0.2;
    if (dive) gy = Math.max(gy, P.pos.y + 2.5);
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-4 * dt));
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > 1) { const ny = Math.atan2(this.vel.x, this.vel.z), turn = angDiff(ny, this.yaw); this.yaw += turn * Math.min(1, dt * 6); this.bank += (Math.max(-0.5, Math.min(0.5, -turn * 2)) - this.bank) * Math.min(1, dt * 4); }
    this.obj.rotation.set(0, this.yaw, this.bank, 'YXZ');
    for (let i = 1; i <= 3; i++) { const n = this.n['SC_Load' + i]; if (n) n.visible = this.load >= i; }
    if (this.n.SC_Claw) this.n.SC_Claw.rotation.x = Math.sin(G.time * 4) * 0.12;
    this.c.copy(this.pos);
    if (this.load > 0 && Math.random() < 0.2) G.fx.emit('add', { x: this.pos.x, y: this.pos.y - 1.3, z: this.pos.z, life: 0.3, s0: 0.8, s1: 0.2, c0: 0x40ffb0 });
    this.gunT -= dt;
    const dist = pc.distanceTo(this.pos);
    if (this.gunT <= 0 && dist < SCAV.gunR && this.checkLos(dt)) {
      this.gunT = SCAV.gunCd;
      for (let i = 0; i < 2; i++) G.queue.push({ t: i * 0.12, label: 'scav-gun', fn: () => {
        if (!this.alive) return;
        const aim = lead(this.c, 150, _b, tg); _d.subVectors(aim, this.c).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.05; _d.normalize();
        spawnShot({ p: this.c, v: _d.clone().multiplyScalar(150), dmg: SCAV.dmg, team: 'E', kind: 'ebullet', color: 0x80ffc0, w: 0.18, len: 3, life: 0.5, label: 'scav-gun' });
      } });
      sfx('eshot', dist);
    }
  }
}

// SC-6 frag cannon: the shell bursts into fragments near an enemy (or at the end of its arm), each fragment aimed at
// the nearest enemy ahead of the burst
function splitFrag(s, at, near, entsP) {
  const fx = G.fx; G.curLabel = s.label;
  const dir = s.v.clone().normalize();
  let tgt = near;
  if (!tgt) { let bd = 30; for (const e of entsP) { if (e.isBarrel || e.isMine || !e.alive) continue; _c.subVectors(e.c, at); const d = _c.length(); if (d < bd && _c.dot(dir) / (d || 1) > 0.5) { bd = d; tgt = e; } } }
  const base = tgt ? new V3().subVectors(tgt.c, at).normalize() : dir;
  for (let k = 0; k < s.fragN; k++) {
    _d.copy(base); _d.x += (Math.random() - 0.5) * 0.22; _d.y += (Math.random() - 0.5) * 0.16; _d.z += (Math.random() - 0.5) * 0.22; _d.normalize();
    spawnShot({ p: at, v: _d.clone().multiplyScalar(150), dmg: s.fragDmg, team: 'P', kind: 'bullet', color: 0x90ffd8, w: 0.16, len: 2.4, life: 0.35, label: s.label });
  }
  fx.sparks(at, base, 10, 0x80ffd0, 14, 0.5, 0.25, 0.18); fx.emit('add', { x: at.x, y: at.y, z: at.z, life: 0.12, s0: 2.6, s1: 0.4, c0: 0x80ffd0 });
  G.fragBursts = (G.fragBursts || 0) + 1; if (!isAlly(s.label)) G.stats.shots += s.fragN - 1;
  if (Math.random() < 0.5) sfx('ric', G.player ? G.player.pos.distanceTo(at) : 0);
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

// ------------------------------------------------------------------ v45 AB-1 afterburner: 5 s of ×1.6 speed and free energy;
// ploughing into an enemy above 14 m/s rams it (90 damage, shoved and stunned, once a second per enemy, bosses take half)
export function updateBurn(dt) {
  const B = G.burn, P = G.player; if (!B) return;
  B.t -= dt;
  if (!P || !P.alive || B.t <= 0) { if (P) P.burnMul = 1; G.burn = null; sfx('odend', 0); return; }
  P.burnMul = B.d.speed; P.en = P.maxEn; P.overheat = 0;
  const pc = P.center(_c), sp = Math.hypot(P.vel.x, P.vel.y, P.vel.z);
  // exhaust: two orange jets out of the back
  const yaw = P.aimYaw ?? 0, bx = Math.sin(yaw), bz = Math.cos(yaw);
  for (let k = 0; k < 2; k++) {
    const sx = Math.cos(yaw) * (k ? 0.9 : -0.9), sz = -Math.sin(yaw) * (k ? 0.9 : -0.9);
    G.fx.emit('add', { x: pc.x + bx * 1.6 + sx, y: pc.y + 0.6, z: pc.z + bz * 1.6 + sz, vx: bx * 9 - P.vel.x * 0.3, vy: (Math.random() - 0.5) * 1.5, vz: bz * 9 - P.vel.z * 0.3, life: 0.22, s0: 1.3, s1: 0.2, c0: 0xffd080, c1: 0xff4010 });
  }
  if (sp < B.d.ramV) return;
  const now = G.time || 0;
  for (const e of G.enemies) {
    if (!e.alive || e.dying || !e.c || e.holo) continue;
    const R = B.d.ramR + (e.r || 1.5);
    if (e.c.distanceToSquared(pc) > R * R) continue;
    const last = B.hit.get(e); if (last !== undefined && now - last < 1) continue;
    B.hit.set(e, now);
    const big = e.kind === 'boss' || e.kind === 'raider' || e.maxHp > 3000;
    G.curLabel = 'p-burner'; dealDamage(e, B.d.ram * B.mul * (big ? 0.5 : 1), 'P', e.c, 'p-burner'); G.curLabel = null;
    G.rams = (G.rams || 0) + 1;
    _b.set(e.c.x - pc.x, 0, e.c.z - pc.z); if (_b.lengthSq() < 0.01) _b.set(P.vel.x, 0, P.vel.z); _b.normalize();
    G.fx.sparks(e.c, _b, 14, 0xffb060, 16, 1.2, 0.35, 0.3); G.fx.ring(e.c, null, 0.6, 4, 0.25, 0xffa040); sfx('pilehit', 0);
    G.fx.trauma = Math.min(1, (G.fx.trauma || 0) + 0.25);
    if (!big && e.alive && e.pos && !e.isObjective) {
      const ox = e.pos.x, oz = e.pos.z; e.pos.x += _b.x * B.d.push; e.pos.z += _b.z * B.d.push;
      if (pointInSolid(new V3(e.pos.x, e.pos.y + 1, e.pos.z), e.r || 2)) { e.pos.x = ox; e.pos.z = oz; }
      if (e.vel) e.vel.multiplyScalar(0.2);
      e.stunT = Math.max(e.stunT || 0, B.d.stun); e.stunMax = e.stunT;
    }
    P.vel.x *= 0.8; P.vel.z *= 0.8;
  }
}
export function clearBurn() { G.burn = null; G.burns = 0; G.rams = 0; if (G.player) G.player.burnMul = 1; }

// ------------------------------------------------------------------ v45 beacon run: fly through 14 beacon gates in order against
// the clock. Each gate +9 s, each kill +2 s (+1 for small fry). Engineers race ahead and weld turrets next to upcoming gates.
export const BEACON = { n: 14, laps: 2, total: 28, rIn: 78, rOut: 118, lo: 5.5, hi: 14, passR: 6.5, passH: 7, t0: 30, add: 2.5, kill: 1.5, killS: 0.75, fin: 25 };
export const BEACON_GATES = Array.from({ length: BEACON.n }, (_, i) => { const a = i / BEACON.n * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? BEACON.rOut : BEACON.rIn; return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), i % 4 === 3 ? BEACON.hi : BEACON.lo]; });
export const BEACON_PATH = [...BEACON_GATES.map(([x, z]) => [x, z]), [BEACON_GATES[0][0], BEACON_GATES[0][1]]];
const gateBeamGeo = new THREE.CylinderGeometry(0.7, 0.7, 90, 12, 1, true).translate(0, 45, 0);
let beamMesh = null;
const GATE_COL = { next: [0x30e0ff, 2.6], soon: [0x2a6a90, 0.9], done: [0x40ff80, 0.7] };
function gateTint(g, k) {
  const [c, s] = GATE_COL[k];
  for (const m of g.mats) { if (m.emissive) { m.emissive.setHex(c); m.emissiveIntensity = s; } else m.color.setHex(c); }
}
export function startBeacon() {
  clearBeacon();
  const gates = BEACON_GATES.map(([x, z, h], i) => {
    const y = groundAt(x, z, 40) + h;
    const obj = cloneKit('P_Gate'); obj.position.set(x, y, z);
    const [nx, nz] = BEACON_GATES[(i + 1) % BEACON.n], [px, pz] = BEACON_GATES[(i + BEACON.n - 1) % BEACON.n];
    obj.rotation.y = Math.atan2(-(nx - px), -(nz - pz));
    const mats = [];
    obj.traverse((o) => { if (o.isMesh && o.material && /GateGlow/.test(o.material.name)) { o.material = o.material.clone(); mats.push(o.material); } });
    G.scene.add(obj);
    const g = { x, y, z, obj, mats, spin: nodes(obj).GT_Spin, passed: false, i };
    gateTint(g, i === 0 ? 'next' : 'soon');
    return g;
  });
  if (!beamMesh) { beamMesh = new THREE.Mesh(gateBeamGeo, new THREE.MeshBasicMaterial({ color: 0x40e8ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); beamMesh.renderOrder = 3; }
  G.scene.add(beamMesh);
  G.beacon = { gates, i: 0, t: BEACON.t0, done: false, bonus: 0, kills: 0, flash: 0, best: BEACON.t0 };
  placeBeam();
}
function placeBeam() {
  const B = G.beacon; if (!B || !beamMesh) return;
  const g = beaconNext(); beamMesh.visible = !!g;
  if (g) beamMesh.position.set(g.x, groundAt(g.x, g.z, 40), g.z);
}
export function clearBeacon() {
  const B = G.beacon; if (B) for (const g of B.gates) { g.obj.parent && g.obj.parent.remove(g.obj); for (const m of g.mats) m.dispose(); }
  if (beamMesh && beamMesh.parent) beamMesh.parent.remove(beamMesh);
  G.beacon = null;
}
export function beaconNext() { const B = G.beacon; return B && !B.done ? B.gates[B.i % BEACON.n] : null; }
export function beaconTime(k) { const B = G.beacon; if (!B || B.done || B.t <= 0) return; const a = k === 'small' ? BEACON.killS : BEACON.kill; B.t += a; B.bonus += a; B.kills++; B.flash = 0.6; }
export function updateBeacon(dt) {
  const B = G.beacon, P = G.player; if (!B) return;
  for (const g of B.gates) if (g.spin) g.spin.rotation.z += dt * (g === beaconNext() ? 1.6 : 0.4);
  if (beamMesh && beamMesh.visible) beamMesh.material.opacity = 0.2 + 0.1 * Math.sin((G.time || 0) * 5);
  B.flash = Math.max(0, B.flash - dt);
  if (B.i > 0 && !B.won && !(G.player && G.player.alive === false)) B.t = Math.max(0, B.t - dt);
  if (B.done) return;
  if (!P || !P.alive || B.t <= 0) return;
  const g = B.gates[B.i % BEACON.n], pc = P.center(_c);
  if (Math.hypot(pc.x - g.x, pc.z - g.z) < BEACON.passR && Math.abs(pc.y - g.y) < BEACON.passH) {
    g.passed = true; gateTint(g, 'done'); B.i++;
    G.fx.ring(new V3(g.x, g.y, g.z), null, 1, 9, 0.4, 0x40ffc0); G.fx.sparks(new V3(g.x, g.y, g.z), null, 24, 0x80f0ff, 18, 1.4, 0.5, 0.3);
    if (B.i >= BEACON.total) { B.done = true; B.t += BEACON.fin; }
    else { B.t += BEACON.add; if (B.i % BEACON.n === 0) for (const q of B.gates) { q.passed = false; gateTint(q, 'soon'); } gateTint(B.gates[B.i % BEACON.n], 'next'); }
    B.flash = 0.8; B.best = Math.max(B.best, B.t);
    placeBeam(); G.onGate && G.onGate(B.i, B.done);
  }
}

// ---- Engineer: a tracked construction rig. It drives ahead of you (in the beacon run, to the gate after next), stops and
// welds a light turret together in 2.6 s, then backs off and goes for another. Up to three of its turrets at a time.
export const ENG = { hp: 520, r: 1.9, speed: 10, buildT: 2.6, rest: [4, 7], max: 3, tHp: 170, tS: 0.78, near: 13 };
export class Engineer extends Enemy {
  constructor(pos) {
    super('engineer', 'E_Engineer', pos, ENG.hp, ENG.r); this.boom = 0.9;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6; this.vel = new V3(); this.st = 'go'; this.t = 0; this.goT = 0; this.spot = null; this.builds = []; this.ph = Math.random() * 6;
    this.stuckT = 0; this.sideT = 0; this.side = 1; this.last = this.pos.clone(); this.c.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
  }
  drive(tx, tz, spd, dt) {
    let dx = tx - this.pos.x, dz = tz - this.pos.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    if (this.sideT > 0) { this.sideT -= dt; const sx = -dz * this.side, sz = dx * this.side; dx = dx * 0.3 + sx; dz = dz * 0.3 + sz; }
    const k = Math.min(1, dl / 6);
    this.vel.x += (dx * spd * k - this.vel.x) * (1 - Math.exp(-4 * dt)); this.vel.z += (dz * spd * k - this.vel.z) * (1 - Math.exp(-4 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.x)); this.pos.z = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.z));
    collideCyl(this.pos, 1.8, 2);
    this.stuckT += dt; if (this.stuckT > 1.5) { if (this.pos.distanceTo(this.last) < 3 && dl > 3) { this.sideT = 1.4; this.side *= -1; } this.stuckT = 0; this.last.copy(this.pos); }
    if (Math.hypot(this.vel.x, this.vel.z) > 1) this.yaw += angDiff(Math.atan2(-this.vel.x, -this.vel.z), this.yaw) * Math.min(1, dt * 6);   // kit front is -Z
    return dl;
  }
  pickSpot() {
    const B = G.beacon; let cx, cz;
    if (B && !B.done) { const g = B.gates[(B.i + 1 + (Math.random() < 0.5 ? 1 : 0)) % BEACON.n]; cx = g.x; cz = g.z; }
    else { const p = this.tg(); let dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z; const dl = Math.hypot(dx, dz) || 1; cx = p.pos.x + dx / dl * 32; cz = p.pos.z + dz / dl * 32; }
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, r = ENG.near * (0.7 + Math.random() * 0.6), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x) > ARENA - 10 || Math.abs(z) > ARENA - 10 || pointInSolid(new V3(x, 1, z), 4.5)) continue;
      return new V3(x, 0, z);
    }
    return new V3(cx + 10, 0, cz);
  }
  update(dt) {
    this.ph += dt; const n = this.n;
    this.builds = this.builds.filter((t) => t.alive);
    for (const t of this.builds) if (t.grow < 1) { t.grow = Math.min(1, t.grow + dt * 1.4); t.obj.scale.setScalar(ENG.tS * (0.12 + 0.88 * t.grow)); }
    if (this.st === 'go') {
      if (!this.spot) { this.spot = this.pickSpot(); this.goT = 0; }
      this.goT += dt;
      if (this.drive(this.spot.x, this.spot.z, ENG.speed, dt) < 2.2) { this.st = 'build'; this.t = ENG.buildT; this.vel.set(0, 0, 0); G.onWeld && G.onWeld(this); }
      else if (this.goT > 22) this.spot = null;
    } else if (this.st === 'build') {
      this.t -= dt;
      const tp = n.EN_Torch ? n.EN_Torch.getWorldPosition(_a) : _a.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
      if (Math.random() < 0.6) G.fx.sparks(tp, null, 3, Math.random() < 0.5 ? 0xffe080 : 0x80d0ff, 8, 0.9, 0.3, 0.18);
      if (Math.random() < 0.15) G.fx.emit('add', { x: tp.x, y: tp.y, z: tp.z, life: 0.08, s0: 1.6, s1: 0.4, c0: 0xc0e8ff });
      if (this.t <= 0) { this.weld(); this.st = 'rest'; this.t = ENG.rest[0] + Math.random() * (ENG.rest[1] - ENG.rest[0]); if (n.EN_Pod) n.EN_Pod.visible = false; }
    } else {
      this.t -= dt; const P = G.player;
      const ax = P ? this.pos.x - P.pos.x : 1, az = P ? this.pos.z - P.pos.z : 0, al = Math.hypot(ax, az) || 1;
      if (al < 40) this.drive(this.pos.x + ax / al * 20, this.pos.z + az / al * 20, ENG.speed * 0.8, dt);
      else { this.vel.multiplyScalar(Math.exp(-3 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; }
      if (this.t <= 0) { if (this.builds.length < ENG.max) { this.st = 'go'; this.spot = null; if (n.EN_Pod) n.EN_Pod.visible = true; } else this.t = 2.5; }
    }
    if (n.EN_Arm) n.EN_Arm.rotation.x += ((this.st === 'build' ? 0.7 + Math.sin(this.ph * 9) * 0.12 : -0.15) - n.EN_Arm.rotation.x) * Math.min(1, dt * 5);
    if (n.EN_Fore) n.EN_Fore.rotation.x += ((this.st === 'build' ? -0.9 : 0.4) - n.EN_Fore.rotation.x) * Math.min(1, dt * 5);
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) - this.pos.y) * Math.min(1, dt * 10);
    this.obj.rotation.set(0, this.yaw, 0);
    this.c.set(this.pos.x, this.pos.y + 1.2, this.pos.z);
  }
  weld() {
    const fx0 = -Math.sin(this.yaw), fz0 = -Math.cos(this.yaw);
    let at = null;
    for (const [f, sd] of [[4.5, 0], [3.5, 3.5], [3.5, -3.5], [-4, 0]]) {
      const x = this.pos.x + fx0 * f + fz0 * sd, z = this.pos.z + fz0 * f - fx0 * sd;
      if (!pointInSolid(new V3(x, 1, z), 2.2)) { at = new V3(x, groundAt(x, z, this.pos.y + 3), z); break; }
    }
    if (!at) return;
    const t = new Turret(at); t.built = true; t.maxHp = ENG.tHp * G.diff.hp; t.hp = t.maxHp; t.r = 1.7; t.grow = 0; t.fireT = 1.5 + Math.random();
    t.obj.scale.setScalar(ENG.tS * 0.12); t.c.set(at.x, at.y + 1.8 * ENG.tS, at.z);
    this.builds.push(t); G.welded = (G.welded || 0) + 1;
    G.fx.ring(new V3(at.x, at.y + 0.3, at.z), null, 0.6, 4, 0.3, 0xffd060); sfx('reload', G.player ? G.player.pos.distanceTo(at) : 0);
  }
}

// ------------------------------------------------------------------ v46 Sunlance: an orbital laser walks the ground after you.
// Three uplink dishes aim it; each one destroyed slows and narrows it. Kill all three and the beam is yours: it hunts enemies.
export const LANCE = { R: 6.5, speed: 9.5, dps: 55, edps: 200, bossDps: 22, delay: 10, sprintEvery: [12, 16], warn: 1.4, sprint: 24, sprintT: 2.2,
  dishHp: 4000, perDish: 0.2, huntSpeed: 11, sites: [[-112, -78], [118, -56], [-6, 124]] };
const lanceCore = new THREE.CylinderGeometry(1, 1, 420, 16, 1, true).translate(0, 210, 0);
const lanceRingGeo = new THREE.RingGeometry(0.9, 1, 48);
const scorchGeo = new THREE.CircleGeometry(1, 16), UPV = new V3(0, 1, 0);
let lanceGrp = null;
function lanceMeshes() {
  if (lanceGrp) return lanceGrp;
  const mk = (geo, c, o) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  const g = new THREE.Group(), core = mk(lanceCore, 0xffe0c8, 0.9), glow = mk(lanceCore, 0xff3418, 0.28), ring = mk(lanceRingGeo, 0xff4020, 0.8), warn = mk(lanceRingGeo, 0xffd040, 0.0);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.35; warn.rotation.x = -Math.PI / 2; warn.position.y = 0.4;
  g.add(core, glow, ring, warn); g.renderOrder = 4;
  const scorch = [];
  for (let k = 0; k < 48; k++) { const m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ color: 0x140a06, transparent: true, opacity: 0, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; scorch.push(m); }
  lanceGrp = { g, core, glow, ring, warn, scorch, si: 0 };
  return lanceGrp;
}
export class Dish extends Enemy {
  constructor(pos) {
    super('dish', 'E_Dish', pos, LANCE.dishHp, 3.0); this.boom = 2.4; this.isObjective = true;
    this.pos.y = 0;
    this.solids = [addSolid(pos.x, pos.z, 7, 7, 2.4, this.pos.y, 'dish'), addSolid(pos.x, pos.z, 2.2, 2.2, 4.4, this.pos.y + 2.4, 'dish')];
    this.c.set(pos.x, this.pos.y + 9.5, pos.z); this.ph = Math.random() * 6;
  }
  die() {
    for (const so of this.solids) removeSolid(so);
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c, 10, 40, 'P', 2.6, 0xff6040); G.fx.flash(this.c, 0xff6040, 60, 30, 0.5);
    for (let k = 0; k < 4; k++) G.queue.push({ label: 'dish', t: 0.25 + k * 0.3, fn: () => explodeAt(new V3(this.pos.x + (Math.random() - 0.5) * 4, this.pos.y + 3 + k * 2, this.pos.z + (Math.random() - 0.5) * 4), 0, 0, 'P', 1.2) });
    this.remove();
  }
  update(dt) {
    this.ph += dt; const L = G.lance, n = this.n;
    if (n.DH_Yaw && L) n.DH_Yaw.rotation.y += angDiff(Math.atan2(-(L.x - this.pos.x), -(L.z - this.pos.z)) + Math.PI, n.DH_Yaw.rotation.y) * Math.min(1, dt * 2);
    if (n.DH_Core) { n.DH_Core.getWorldPosition(this.c); n.DH_Core.scale.setScalar(1 + 0.12 * Math.sin(this.ph * 6)); }
  }
}
export function startLance() {
  clearLance();
  const M = lanceMeshes(); G.scene.add(M.g); for (const m of M.scorch) G.scene.add(m);
  const dishes = LANCE.sites.map(([x, z]) => new Dish(new V3(x, 0, z)));
  G.lance = { x: 0, z: 0, vx: 0, vz: 0, st: 'idle', t: LANCE.delay, sprT: 18, R: LANCE.R, dishes, hijack: false, dmgP: 0, dmgE: 0, lockT: 0, sprints: 0, sprintHit: 0, scT: 0, sndT: 0, dir: new V3() };
  M.g.visible = false;
}
export function clearLance() {
  if (lanceGrp) { lanceGrp.g.parent && lanceGrp.g.parent.remove(lanceGrp.g); for (const m of lanceGrp.scorch) { m.visible = false; m.material.opacity = 0; m.parent && m.parent.remove(m); } }
  G.lance = null;
}
function lanceTarget(L) {
  if (!L.hijack) return G.player && G.player.alive ? G.player.pos : null;
  let best = null, bd = 1e9;
  for (const e of G.enemies) { if (!e.alive || e.dying || !e.pos || e.isObjective) continue; const d = Math.hypot(e.pos.x - L.x, e.pos.z - L.z) + (e.kind === 'boss' ? 40 : 0); if (d < bd) { bd = d; best = e.pos; } }
  return best;
}
export function updateLance(dt) {
  const L = G.lance, M = lanceGrp; if (!L || !M) return;
  const alive = L.dishes.filter((d) => d.alive).length, k = L.dishes.length - alive;
  if (alive === 0 && !L.hijack) { L.hijack = true; L.st = 'track'; G.onLanceHijack && G.onLanceHijack(); }
  L.R = LANCE.R * (L.hijack ? 1 : 1 - 0.1 * k);
  const col = L.hijack ? 0x40d8ff : 0xff3418;
  M.glow.material.color.setHex(col); M.ring.material.color.setHex(L.hijack ? 0x60e0ff : 0xff4020);
  const P = G.player, tp = lanceTarget(L);
  if (L.st === 'idle') {
    L.t -= dt; M.g.visible = false;
    if (L.t <= 0 && P) { const a = Math.random() * Math.PI * 2; L.x = P.pos.x + Math.cos(a) * 55; L.z = P.pos.z + Math.sin(a) * 55; L.st = 'track'; G.onLanceOn && G.onLanceOn(); }
    return;
  }
  M.g.visible = true;
  const spd = L.hijack ? LANCE.huntSpeed : LANCE.speed * (1 - LANCE.perDish * k);
  if (L.st === 'track') {
    if (tp) { const lv = !L.hijack && P ? 0.6 : 0; let dx = tp.x + (lv ? P.vel.x * lv : 0) - L.x, dz = tp.z + (lv ? P.vel.z * lv : 0) - L.z; const dl = Math.hypot(dx, dz) || 1; const want = Math.min(spd, dl * 1.5); L.vx += (dx / dl * want - L.vx) * Math.min(1, dt * 2.5); L.vz += (dz / dl * want - L.vz) * Math.min(1, dt * 2.5); }
    else { L.vx *= Math.exp(-2 * dt); L.vz *= Math.exp(-2 * dt); }
    const far = !L.hijack && tp && P && Math.hypot(tp.x - L.x, tp.z - L.z) > 45;
    L.farT = far ? (L.farT || 0) + dt : 0;
    if (L.farT > 2.5) {   // fallen behind: the satellite re-aims and drops the beam on the ground ahead of you
      L.farT = 0; const vx = P.vel.x, vz = P.vel.z, vl = Math.hypot(vx, vz), a = Math.random() * Math.PI * 2, o = 4 + Math.random() * 6;
      L.x = tp.x + (vl > 3 ? vx / vl * Math.min(26, vl * 1.5) : 0) + Math.cos(a) * o; L.z = tp.z + (vl > 3 ? vz / vl * Math.min(26, vl * 1.5) : 0) + Math.sin(a) * o;
      L.vx = L.vz = 0; L.st = 'drop'; L.t = 1.3; L.drops = (L.drops || 0) + 1; sfx('warn', 0); G.onLanceWarn && G.onLanceWarn(true);
    }
    if (!L.hijack) { L.sprT -= dt; if (L.sprT <= 0 && tp && Math.hypot(tp.x - L.x, tp.z - L.z) < 70) { L.st = 'warn'; L.t = LANCE.warn; L.vx = L.vz = 0; sfx('warn', 0); G.onLanceWarn && G.onLanceWarn(); } }
  } else if (L.st === 'warn') {
    L.t -= dt; L.vx = L.vz = 0;
    if (tp) { L.dir.set(tp.x + (P ? P.vel.x * 0.5 : 0) - L.x, 0, tp.z + (P ? P.vel.z * 0.5 : 0) - L.z); if (L.dir.lengthSq() < 0.01) L.dir.set(1, 0, 0); L.dir.normalize(); }
    if (L.t <= 0) { L.st = 'sprint'; L.t = LANCE.sprintT; L.spd = tp ? Math.min(32, Math.max(LANCE.sprint, Math.hypot(tp.x - L.x, tp.z - L.z) / (LANCE.sprintT * 0.7))) : LANCE.sprint; L.sprints++; L.hitThis = false; sfx('laser', 0); }
  } else if (L.st === 'drop') {   // red warning ring on the spot, no damage until it lands
    L.t -= dt; L.vx = L.vz = 0; if (L.t <= 0) { L.st = 'track'; L.sprT = Math.max(L.sprT, 4); G.fx.flash(_a.set(L.x, groundAt(L.x, L.z, 60) + 2, L.z), 0xff5030, 40, 30, 0.3); G.fx.ring(_a.set(L.x, groundAt(L.x, L.z, 60) + 0.5, L.z), null, 1, L.R * 2.4, 0.4, 0xff6040); sfx('laser', 0); }
  } else if (L.st === 'sprint') {
    L.t -= dt; L.vx = L.dir.x * L.spd; L.vz = L.dir.z * L.spd;
    if (L.t <= 0) { L.st = 'track'; L.sprT = LANCE.sprintEvery[0] + Math.random() * (LANCE.sprintEvery[1] - LANCE.sprintEvery[0]); if (L.hitThis) L.sprintHit++; }
  }
  L.x += L.vx * dt; L.z += L.vz * dt;
  L.x = Math.max(-ARENA, Math.min(ARENA, L.x)); L.z = Math.max(-ARENA, Math.min(ARENA, L.z));
  const gy = groundAt(L.x, L.z, 60);
  // visuals
  const fl = 0.85 + 0.15 * Math.sin((G.time || 0) * 40) * Math.random();
  M.g.position.set(L.x, gy, L.z);
  M.core.scale.set(L.R * 0.38 * fl, 1, L.R * 0.38 * fl); M.glow.scale.set(L.R, 1, L.R); M.ring.scale.setScalar(L.R * 1.15);
  const dropK = L.st === 'drop' ? 1 - L.t / 1.3 : 1;
  M.core.visible = M.glow.visible = M.ring.visible = L.st !== 'drop';
  M.glow.material.opacity = L.st === 'warn' ? 0.12 + 0.3 * Math.abs(Math.sin(L.t * 18)) : L.st === 'sprint' ? 0.4 : 0.2;
  M.warn.material.opacity = L.st === 'warn' ? 0.9 : L.st === 'drop' ? 0.5 + 0.5 * Math.abs(Math.sin(L.t * 14)) : 0; M.warn.scale.setScalar(L.st === 'drop' ? L.R * (2.6 - 1.6 * dropK) : L.R * (1.2 + (L.st === 'warn' ? (1 - L.t / LANCE.warn) * 1.6 : 0)));
  if (L.st !== 'drop' && Math.random() < 0.7) G.fx.sparks(_a.set(L.x + (Math.random() - 0.5) * L.R, gy + 0.5, L.z + (Math.random() - 0.5) * L.R), UPV, 2, L.hijack ? 0x80e8ff : 0xffa060, 14, 1.4, 0.4, 0.25);
  if (Math.random() < 0.25) G.fx.smoke(_a.set(L.x, gy + 1, L.z), 1, 2.5, 1.6, 0x2a2420, 1, 0.5);
  L.scT -= dt;
  if (L.scT <= 0 && L.st !== 'drop') { L.scT = 0.3; const m = M.scorch[M.si++ % M.scorch.length]; m.position.set(L.x + (Math.random() - 0.5), gy + 0.06, L.z + (Math.random() - 0.5)); m.scale.setScalar(L.R * (0.8 + Math.random() * 0.3)); m.material.opacity = 0.55; m.visible = true; }
  for (const m of M.scorch) if (m.visible) { m.material.opacity -= dt * 0.045; if (m.material.opacity <= 0) m.visible = false; }
  L.sndT -= dt; if (L.sndT <= 0 && P) { L.sndT = 1.3; sfx('laser', Math.hypot(P.pos.x - L.x, P.pos.z - L.z)); }
  // damage: the column reaches all the way up, so flying over it does not help
  if (L.st === 'drop') return;
  if (P && P.alive && !L.hijack && Math.hypot(P.pos.x - L.x, P.pos.z - L.z) < L.R) {
    G.curSrc = null; damagePlayer(LANCE.dps * dt, null, 'lance'); L.dmgP += LANCE.dps * dt; L.hitThis = L.st === 'sprint' || L.hitThis; G.lanceOnYou = 0.3;
  }
  for (const e of G.enemies) {
    if (!e.alive || e.dying || !e.pos || e.isObjective || e.holo) continue;
    if (Math.hypot(e.pos.x - L.x, e.pos.z - L.z) > L.R + (e.r || 1.5) * 0.5) continue;
    const d = (e.kind === 'boss' ? LANCE.bossDps : LANCE.edps) * dt; L.dmgE += d;
    dealDamage(e, d, 'X', e.c, 'lance');
  }
}

// ---- Grav-Lock: a slow four-legged heavy that projects a 22 m violet gravity dome. Inside it your hover jets cut out,
// gravity is 2.6×, and boosting is 25% slower; it walks up to put you inside and lobs mortar shells at you.
export const ANCHOR = { hp: 950, r: 2.6, R: 22, speed: 5.2, keep: [9, 17], g: 2.6, boostK: 0.75, fire: [3.2, 4.2], dmg: 24, splash: 5.5 };
const domeGeo = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const domeRingGeo = new THREE.RingGeometry(0.97, 1, 64);
export class Anchor extends Enemy {
  constructor(pos) {
    super('anchor', 'E_Anchor', pos, ANCHOR.hp, ANCHOR.r); this.boom = 1.5;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6; this.vel = new V3(); this.ph = Math.random() * 6; this.fireT = 2.5; this.side = Math.random() < 0.5 ? 1 : -1; this.sideT = 0; this.stuckT = 0; this.last = this.pos.clone(); this.on = 0;
    this.dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: 0xa050ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.ring = new THREE.Mesh(domeRingGeo, new THREE.MeshBasicMaterial({ color: 0xb060ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    this.ring.rotation.x = -Math.PI / 2; this.dome.scale.setScalar(ANCHOR.R); this.ring.scale.setScalar(ANCHOR.R);
    G.scene.add(this.dome, this.ring); this.c.set(this.pos.x, this.pos.y + 3.2, this.pos.z);
  }
  remove() { super.remove(); for (const m of [this.dome, this.ring]) { m.parent && m.parent.remove(m); m.material.dispose(); } }
  domeOn() { return this.alive && !(this.stunT > 0); }
  update(dt) {
    const t = this.tg(), n = this.n; this.ph += dt;
    let dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    let mx = 0, mz = 0;
    if (dl > ANCHOR.keep[1]) { mx = dx; mz = dz; } else if (dl < ANCHOR.keep[0]) { mx = -dx; mz = -dz; } else { mx = -dz * this.side * 0.6; mz = dx * this.side * 0.6; }
    if (this.sideT > 0) { this.sideT -= dt; mx = mx * 0.3 - dz * this.side; mz = mz * 0.3 + dx * this.side; }
    this.vel.x += (mx * ANCHOR.speed - this.vel.x) * (1 - Math.exp(-3 * dt)); this.vel.z += (mz * ANCHOR.speed - this.vel.z) * (1 - Math.exp(-3 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.x)); this.pos.z = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.z));
    collideCyl(this.pos, 2.4, 3);
    this.stuckT += dt; if (this.stuckT > 1.6) { if (this.pos.distanceTo(this.last) < 2 && dl > ANCHOR.keep[1]) { this.sideT = 1.6; this.side *= -1; } this.stuckT = 0; this.last.copy(this.pos); }
    this.yaw += angDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 2);
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 2) - this.pos.y) * Math.min(1, dt * 8);
    this.obj.rotation.set(0, this.yaw, 0);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    for (let i = 1; i <= 4; i++) { const l = n['AN_Leg' + i]; if (l) l.rotation.x = Math.sin(this.ph * 5 + (i % 2) * Math.PI) * 0.3 * Math.min(1, sp / 3); }
    if (n.AN_Ring) n.AN_Ring.rotation.y += dt * 2.5;
    this.c.set(this.pos.x, this.pos.y + 3.2, this.pos.z);
    const on = this.domeOn(); this.on += ((on ? 1 : 0) - this.on) * Math.min(1, dt * 4);
    this.dome.position.set(this.pos.x, this.pos.y, this.pos.z); this.ring.position.set(this.pos.x, this.pos.y + 0.3, this.pos.z);
    this.dome.material.opacity = (0.05 + 0.03 * Math.sin(this.ph * 3) + (this.inside ? 0.05 : 0)) * this.on; this.ring.material.opacity = 0.6 * this.on;
    // mortar: three lobbed shells at you, landing spots marked
    if (dl < 70 && this.checkLos(dt)) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = ANCHOR.fire[0] + Math.random() * (ANCHOR.fire[1] - ANCHOR.fire[0]);
        for (let k = 0; k < 3; k++) G.queue.push({ label: 'anchor-mortar', t: k * 0.35, fn: () => {
          if (!this.alive || !this.n.Muzzle_Anchor) return;
          const mp = this.n.Muzzle_Anchor.getWorldPosition(new V3());
          const f = this.tg(), D = Math.hypot(f.pos.x - mp.x, f.pos.z - mp.z), Tf = 1.1 + D / 60, g = 26;
          const aim = new V3().copy(f.pos).addScaledVector(f.vel || _c.set(0, 0, 0), Tf * 0.7);
          aim.x += (Math.random() - 0.5) * 6; aim.z += (Math.random() - 0.5) * 6; aim.y = groundAt(aim.x, aim.z, aim.y + 1);
          const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
          G.curShooter = this; spawnShot({ p: mp, v, dmg: ANCHOR.dmg, team: 'E', kind: 'shell', splash: ANCHOR.splash, life: Tf + 1, grav: g, label: 'anchor-mortar', color: 0xc070ff }); G.curShooter = null;
          G.fx.warn(aim, ANCHOR.splash, Tf); G.fx.muzzle(mp, _d.copy(v).normalize(), 0xc080ff, 1.6); sfx('eshell', dl);
        } });
      }
    }
  }
}
export function updateGrav(dt) {
  const P = G.player; if (!P) return;
  let lock = false;
  for (const e of G.enemies) {
    if (e.kind !== 'anchor') continue;
    e.inside = false;
    if (!e.domeOn() || !P.alive) continue;
    if (Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) < ANCHOR.R && P.pos.y - e.pos.y < ANCHOR.R) { e.inside = true; lock = true; }
  }
  P.gravMul = lock ? ANCHOR.g : 1; P.gravBoost = lock ? ANCHOR.boostK : 1;
  if (lock) { G.gravT = (G.gravT || 0) + dt; G.gravOn = 0.3; } else G.gravOn = Math.max(0, (G.gravOn || 0) - dt);
}

// ------------------------------------------------------------------ v48 Skyshield: missile trucks drive between hide sites,
// raise their racks and fire slow cruise missiles at three civilian shelters; the missiles can be shot down
export const SKY = { shelters: [[-72, 52], [74, 46], [0, -80]], hits: 5,
  sites: [[-118, -40], [-96, -112], [-20, -128], [70, -116], [124, -52], [126, 40], [92, 112], [10, 128], [-80, 116], [-128, 54]],
  lnHp: 1600, lnR: 3.2, speed: 9, setup: 2.8, salvo: 2, gap: 1.4, pack: 1.8, hold: [3, 6],
  crHp: 45, crR: 1.5, crSpeed: 17, crAlt: 28, crDmg: 60, crSplash: 6, crTurn: 1.3 };
const SKY_LIFT = 0.95;
export class Launcher extends Enemy {
  constructor(pos) {
    super('launcher', 'E_Launcher', pos, SKY.lnHp, SKY.lnR); this.boom = 2.0;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6; this.vel = new V3(); this.st = 'drive'; this.t = 0; this.lift = 0; this.ph = Math.random() * 6;
    this.stuckT = 0; this.sideT = 0; this.side = 1; this.last = this.pos.clone(); this.goal = this.pickSite(); this.fired = 0; this.salvos = 0;
    this.c.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
  }
  drive(tx, tz, spd, dt) { return Engineer.prototype.drive.call(this, tx, tz, spd, dt); }
  pickSite() {
    const P = G.player, cur = this.goal;
    if (G.sky) {   // a hide site at least 45 m from here, preferably away from you
      const opts = SKY.sites.filter((q) => Math.hypot(q[0] - this.pos.x, q[1] - this.pos.z) > 45 && q !== cur);
      opts.sort((a, b) => (Math.hypot(b[0] - P.pos.x, b[1] - P.pos.z) - Math.hypot(a[0] - P.pos.x, a[1] - P.pos.z)) + (Math.random() - 0.5) * 80);
      return opts[0] || SKY.sites[0];
    }
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * 6.283, r = 65 + Math.random() * 40, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
      if (Math.abs(x) > ARENA - 12 || Math.abs(z) > ARENA - 12 || pointInSolid(new V3(x, 1, z), 4)) continue;
      return [x, z];
    }
    return [this.pos.x, this.pos.z];
  }
  pickTarget() {
    if (G.sky) { const live = G.sky.shelters.filter((q) => q.alive); if (live.length) return live[Math.floor(Math.random() * live.length)]; }
    return null;   // null = the player (or a friend)
  }
  update(dt) {
    const n = this.n; this.ph += dt; this.t -= dt;
    if (this.st === 'drive') {
      const dl = this.drive(this.goal[0], this.goal[1], SKY.speed, dt);
      if (dl < 4) { this.st = 'setup'; this.t = SKY.setup; this.vel.set(0, 0, 0); G.fx.warn(this.pos.clone(), 7, SKY.setup); G.onLaunchWarn && G.onLaunchWarn(this); sfx('alarm', G.player ? G.player.pos.distanceTo(this.pos) * 0.5 : 0); }
    } else {
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      if (this.st === 'setup' && this.t <= 0) { this.st = 'fire'; this.t = 0; this.fired = 0; }
      else if (this.st === 'fire' && this.t <= 0) {
        if (this.fired < SKY.salvo) { this.launch(); this.fired++; this.t = SKY.gap; }
        else { this.st = 'pack'; this.t = SKY.pack; this.salvos++; }
      } else if (this.st === 'pack' && this.t <= 0) { this.st = 'hold'; this.t = SKY.hold[0] + Math.random() * (SKY.hold[1] - SKY.hold[0]); }
      else if (this.st === 'hold' && this.t <= 0) { this.st = 'drive'; this.goal = this.pickSite(); }
    }
    const want = this.st === 'setup' || this.st === 'fire' ? SKY_LIFT : 0;
    this.lift += Math.max(-dt * 0.6, Math.min(dt * 0.45, want - this.lift));
    if (n.LN_Rack) n.LN_Rack.rotation.x = this.lift;
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 2) - this.pos.y) * Math.min(1, dt * 8);
    this.obj.rotation.set(0, this.yaw, 0);
    this.c.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
  }
  launch() {
    const mp = this.n.Muzzle_Launch ? this.n.Muzzle_Launch.getWorldPosition(new V3()) : new V3(this.pos.x, this.pos.y + 5, this.pos.z);
    const side = this.fired % 2 ? 1 : -1; mp.x += Math.cos(this.yaw) * side * 0.5; mp.z -= Math.sin(this.yaw) * side * 0.5;
    const dir = new V3(-Math.sin(this.yaw) * Math.cos(this.lift), Math.sin(this.lift), -Math.cos(this.yaw) * Math.cos(this.lift));
    new Cruise(mp, dir, this.pickTarget(), this);
    G.fx.muzzle(mp, dir, 0xffb060, 3); G.fx.smoke(mp.clone().addScaledVector(dir, -4), 6, 3, 2.2, 0x8a8478, 1.5, 0.6); G.fx.flash(mp, 0xffa050, 40, 30, 0.25);
    sfx('missile', G.player ? G.player.pos.distanceTo(mp) : 0);
    G.onCruise && G.onCruise(this);
  }
}
export class Cruise extends Enemy {
  constructor(pos, dir, shelter, from) {
    super('cruise', 'E_Cruise', pos, SKY.crHp, SKY.crR); this.boom = 0.8; this.noLos = true;
    this.vel = dir.clone().multiplyScalar(SKY.crSpeed * 0.7); this.shelter = shelter; this.from = from; this.age = 0; this.puffT = 0; this.ph = Math.random() * 6;
    this.c.copy(pos); G.cruiseN = (G.cruiseN || 0) + 1;
  }
  aimPt(out) {
    if (this.shelter) return out.set(this.shelter.pos.x, this.shelter.pos.y + 3, this.shelter.pos.z);
    const f = this.tg(); return f.center ? f.center(out) : out.copy(f.pos);
  }
  explode() { G.cruiseDown = (G.cruiseDown || 0) + 1; G.curLabel = 'p-cruise'; explodeAt(this.c, 5, 30, 'P', 1.3, 0xffa040); G.fx.flash(this.c, 0xffa040, 30, 24, 0.2); this.remove(); }
  impact() {
    if (!this.alive) return;
    this.alive = false; this.dying = true;
    const c = this.c.clone();
    G.curLabel = 'cruise'; G.curSrc = c; explodeAt(c, SKY.crSplash, SKY.crDmg, 'E', 2.2, 0xff8030); G.fx.flash(c, 0xff9040, 70, 40, 0.4);
    G.fx.smoke(c, 10, 6, 3, 0x4a4440, 2, 0.6);
    if (this.shelter && this.shelter.alive && c.distanceTo(this.shelter.pos) < 14) this.shelter.hit();
    if (G.player) { const dd = G.player.pos.distanceTo(c); G.fx.trauma = Math.min(1, G.fx.trauma + Math.max(0, 0.6 - dd / 120)); sfx('bigboom', dd); }
    this.remove();
  }
  update(dt) {
    this.age += dt; this.ph += dt;
    const tp = this.aimPt(_c), dx = tp.x - this.c.x, dz = tp.z - this.c.z, dh = Math.hypot(dx, dz) || 1;
    // climb to cruise altitude, fly level, then dive onto the target from about 1.1 x altitude out
    const alt = this.shelter ? SKY.crAlt : Math.min(SKY.crAlt, tp.y + 12);
    const want = _d.set(dx / dh, 0, dz / dh);
    if (this.age < 0.9) want.copy(this.vel).normalize();
    else if (dh > alt * 1.1) want.y = Math.max(-0.5, Math.min(0.6, (alt - this.c.y) / 18));
    else { want.set(dx, tp.y - this.c.y, dz).normalize(); }
    want.normalize();
    const sp = Math.min(SKY.crSpeed, this.vel.length() + dt * 14), cur = _b.copy(this.vel).normalize();
    cur.lerp(want, Math.min(1, SKY.crTurn * dt * (this.age < 0.9 ? 0.3 : dh < alt * 1.1 ? 2.2 : 1))).normalize();
    this.vel.copy(cur).multiplyScalar(sp);
    const L = sp * dt, hit = raySolids(this.c, cur, L + 0.5);
    this.c.addScaledVector(this.vel, dt); this.pos.copy(this.c);
    const gy = groundAt(this.c.x, this.c.z, this.c.y + 2);
    if (hit.solid || this.c.y < gy + 0.6 || this.c.distanceTo(tp) < 2.5 || this.age > 16) { this.impact(); return; }
    this.obj.lookAt(_a.copy(this.c).sub(this.vel));
    this.obj.rotateZ(Math.sin(this.ph * 3) * 0.15);
    this.puffT -= dt;
    if (this.puffT <= 0) { this.puffT = 0.05; const tail = _a.copy(this.c).addScaledVector(cur, -1.8); G.fx.smoke(tail, 1, 1.4, 1.6, 0xb8b0a4, 0.4, 0.5); G.fx.emit('add', { x: tail.x, y: tail.y, z: tail.z, life: 0.12, s0: 1.4, s1: 0.4, c0: 0xffd090, c1: 0xff6020 }); }
  }
}
class Shelter {
  constructor(x, z) {
    this.obj = cloneKit('P_Shelter'); const y = groundAt(x, z, 20); this.obj.position.set(x, y, z); G.scene.add(this.obj); this.pos = this.obj.position;
    this.n = nodes(this.obj); this.solid = addSolid(x, z, 7.2, 7.2, 4.5, y, 'shelter'); this.hits = SKY.hits; this.alive = true; this.hitT = 0; this.ph = Math.random() * 6; this.k = 1;
    this.lights = []; if (this.n.SH_Light) this.n.SH_Light.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); this.lights.push(o); } });
  }
  hit() {
    if (!this.alive) return;
    this.hits--; this.hitT = 1; G.sky.impacts++;
    G.fx.sparks(_a.set(this.pos.x, this.pos.y + 6, this.pos.z), null, 30, 0xffb060, 20, 1, 0.6, 0.4);
    if (this.hits <= 0) { this.alive = false; removeSolid(this.solid); this.solid = addSolid(this.pos.x, this.pos.z, 7.2, 7.2, 2.4, this.pos.y, 'shelter'); G.fx.flash(_a, 0xff6020, 90, 60, 0.6); G.onShelterLost && G.onShelterLost(this); }
    else G.onShelterHit && G.onShelterHit(this);
  }
  remove() { this.obj.parent && this.obj.parent.remove(this.obj); removeSolid(this.solid); for (const m of this.lights) m.material.dispose(); }
  update(dt) {
    this.ph += dt; this.hitT = Math.max(0, this.hitT - dt);
    const d = this.n.SH_Dome; if (d) { this.k += ((this.alive ? 1 : 0.35) - this.k) * Math.min(1, dt * 1.5); const w = this.alive ? 1 : 1.08; d.scale.set(w, this.k, w); }   // the dome sinks when it collapses (kit z-up = glTF y)
    for (const m of this.lights) m.material.emissiveIntensity = this.alive ? (this.hits <= 1 ? 0.6 + 0.6 * Math.abs(Math.sin(this.ph * 6)) : 1) * (this.hitT > 0 ? 0.3 : 1) : 0;
    if ((!this.alive || this.hits < SKY.hits) && Math.random() < (this.alive ? 0.08 * (SKY.hits - this.hits) : 0.4)) G.fx.smoke(_a.set(this.pos.x + (Math.random() - 0.5) * 8, this.pos.y + (this.alive ? 5 : 2), this.pos.z + (Math.random() - 0.5) * 8), 1, 4, 3, 0x3a3634, 2.5, 0.5);
  }
}
export function startSky() { clearSky(); G.sky = { shelters: SKY.shelters.map(([x, z]) => new Shelter(x, z)), lost: false, impacts: 0 }; }
export function clearSky() { if (G.sky) for (const q of G.sky.shelters) q.remove(); G.sky = null; }
function updateSky(dt) {
  const S = G.sky; if (!S) return;
  for (const q of S.shelters) q.update(dt);
  if (!S.lost && S.shelters.every((q) => !q.alive)) S.lost = true;
}

// ---- PD-3 CIWS: an automatic point-defence gun on the shoulder for 8 s
G.ciwsL = [];
function updateCiws(dt) {
  for (let i = G.ciwsL.length - 1; i >= 0; i--) {
    const C = G.ciwsL[i], o = C.owner, d = C.d; C.t -= dt; C.fT -= dt;
    if (C.t <= 0 || !o.alive) { G.ciwsL.splice(i, 1); continue; }
    while (C.fT <= 0) {
      C.fT += d.rate;
      const mp = o.muzzlePos(C.slot, new V3(), 0);
      let best = null, bd = d.R, shot = -1;
      for (let k = 0; k < G.shots.length; k++) {   // incoming slow ordnance first (bullets are too fast to catch)
        const q = G.shots[k]; if (q.team !== 'E' || q.speed > 90 || q.kind === 'ebullet' || q.kind === 'bullet') continue;
        const dd = Math.hypot(q.x - mp.x, q.y - mp.y, q.z - mp.z); if (dd < bd) { bd = dd; shot = k; }
      }
      if (shot < 0) { bd = d.R; for (const e of G.enemies) if (e.kind === 'cruise' && e.alive && !e.dying) { const dd = e.c.distanceTo(mp); if (dd < bd && clearLine(mp, e.c)) { bd = dd; best = e; } } }
      if (shot < 0 && !best) { bd = d.airR; for (const e of G.enemies) if (e.alive && !e.dying && !e.cloaked && ['drone', 'swarm', 'jammer', 'mender', 'scav', 'disarmer', 'hijack', 'sapper', 'leech'].includes(e.kind)) { const dd = e.c.distanceTo(mp); if (dd < bd && clearLine(mp, e.c)) { bd = dd; best = e; } } }
      if (shot < 0 && !best) break;
      const tp = shot >= 0 ? new V3(G.shots[shot].x, G.shots[shot].y, G.shots[shot].z) : best.c.clone();
      tp.x += (Math.random() - 0.5) * 0.8; tp.y += (Math.random() - 0.5) * 0.8; tp.z += (Math.random() - 0.5) * 0.8;
      G.fx.streak(mp, tp, 0.12, 0xffe0a0, 0.05); G.fx.muzzle(mp, _d.subVectors(tp, mp).normalize(), 0xffd080, 0.8);
      if (shot >= 0) { if (Math.random() < d.kill) { G.fx.emit('add', { x: tp.x, y: tp.y, z: tp.z, life: 0.25, s0: 2.4, s1: 0.6, c0: 0xffe0a0, c1: 0xff6020 }); G.fx.sparks(tp, null, 8, 0xffc070, 10, 1, 0.3, 0.2); G.shots.splice(shot, 1); if (C.me) G.ciwsEat = (G.ciwsEat || 0) + 1; } }
      else { dealDamage(best, d.dmg * C.mul, 'P', tp, 'ciws'); G.fx.sparks(tp, null, 2, 0xffc070, 8, 1, 0.2, 0.15); if (C.me) G.ciwsHit = (G.ciwsHit || 0) + 1; }
      if (C.me && Math.random() < 0.4) sfx('gatling', 0);
    }
  }
}

// ------------------------------------------------------------------ v49 Evacuation: weaver spider walkers and their webs, the
// HK-1 hack module (an enemy fights for you for a while), civilians walking to an evac pad and a rescue shuttle
export const WEAVE = { hp: 820, r: 2.8, speed: 7, keep: [20, 36], burst: 4, gap: 0.12, gunCd: [2.2, 3.0], dmg: 11, webCd: [4.5, 6.5], webR: 7, webT: 13, webDmg: 14, webHp: 70, stick: 2.4, slow: 0.45, civSlow: 0.3, grav: 2.4 };
export const HACK = { kinds: ['turret', 'drone', 'walker', 'bulwark', 'gunship', 'skimmer', 'frost', 'blinker', 'weaver', 'howitzer'], maxHp: 2000, dmg: 0.8 };
G.webs = []; G.hacks = []; G.webT = 0;
G.queue.push = function (...a) { for (const q of a) if (q && q.sh === undefined) q.sh = G.curShooter; return Array.prototype.push.apply(this, a); };
const webGeo = new THREE.CircleGeometry(1, 28), dartGeo = new THREE.OctahedronGeometry(0.4, 0), hackRingGeo = new THREE.TorusGeometry(1, 0.09, 6, 28), ZV = new V3(), _hc = new THREE.Color();
let webTex = null, webMesh = null;
function webTexture() {
  if (webTex) return webTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(240, 248, 255, 0.95)'; g.translate(128, 128); const N = 14;
  g.lineWidth = 2.4;
  for (let k = 0; k < N; k++) { const a = k / N * Math.PI * 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 126, Math.sin(a) * 126); g.stroke(); }
  g.lineWidth = 1.5;
  for (let r = 10; r < 124; r += 9) { g.beginPath(); for (let k = 0; k <= N; k++) { const a = k / N * Math.PI * 2, rr = r + (k % 2) * 2.5; k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke(); }
  webTex = new THREE.CanvasTexture(cv); webTex.colorSpace = THREE.SRGBColorSpace;
  return webTex;
}
function addWeb(x, z, yRef) {
  const y = groundAt(x, z, yRef + 3);
  if (G.webs.length >= 14) { const o = G.webs.shift(); o.m.parent && o.m.parent.remove(o.m); o.m.material.dispose(); }
  const m = new THREE.Mesh(webGeo, new THREE.MeshBasicMaterial({ map: webTexture(), color: 0xe8f4ff, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.set(-Math.PI / 2, 0, Math.random() * 6); m.position.set(x, y + 0.1, z); m.scale.setScalar(WEAVE.webR); m.renderOrder = 3; G.scene.add(m);
  G.webs.push({ x, z, y, R: WEAVE.webR, t: WEAVE.webT, T: WEAVE.webT, hp: WEAVE.webHp, m });
  G.websMade = (G.websMade || 0) + 1;
}
export function webAt(x, z, y) { for (const w of G.webs) if (Math.hypot(x - w.x, z - w.z) < w.R && y - w.y < 1.6) return w; return null; }
function webSplat(s, at, ent) {
  if (ent) dealDamage(ent, s.dmg, s.team, at);
  G.fx.sparks(at, null, 10, 0xeef6ff, 8, 0.8, 0.4, 0.2);
  if (s.team === 'P') { const h = ent && (ent.kind === 'cpart' ? ent.owner : ent); if (h && h.alive && !h.isBarrel && !h.isMine) h.stunT = Math.max(h.stunT || 0, 1.2); return; }   // a hacked weaver's web just binds its target
  if (ent && ent.isPlayer) { G.webT = Math.max(G.webT, WEAVE.stick); G.webHits = (G.webHits || 0) + 1; G.onWebbed && G.onWebbed(); }
  if (ent && ent.isCiv) { const c = G.friends.find((f) => f._ent === ent); if (c) c.webT = 4; }
  addWeb(at.x, at.z, at.y);
}
function updateWebs(dt) {
  const P = G.player;
  for (let i = G.webs.length - 1; i >= 0; i--) {
    const w = G.webs[i]; w.t -= dt;
    for (const f of G.fires) if (Math.hypot(f.x - w.x, f.z - w.z) < w.R + f.R) { w.hp -= 80 * dt; break; }   // fire burns silk
    if (w.t <= 0 || w.hp <= 0) {
      if (w.hp <= 0) { G.fx.sparks(new V3(w.x, w.y + 0.5, w.z), null, 14, 0xffd0a0, 10, 1, 0.4, 0.2); G.websBurnt = (G.websBurnt || 0) + 1; }
      w.m.parent && w.m.parent.remove(w.m); w.m.material.dispose(); G.webs.splice(i, 1); continue;
    }
    w.m.material.opacity = 0.62 * Math.min(1, (w.T - w.t) / 0.25, w.t / 1.5) * (0.55 + 0.45 * Math.max(0, w.hp) / WEAVE.webHp);
  }
  if (!P) return;
  if (P.alive && P.grounded && webAt(P.pos.x, P.pos.z, P.pos.y)) G.webT = Math.max(G.webT, 0.35);
  if (G.webT > 0 && P.qbT > 0.05) { G.webT = 0; G.webBroke = (G.webBroke || 0) + 1; G.fx.sparks(P.center(_a).clone(), null, 18, 0xeef6ff, 12, 1, 0.4, 0.22); }   // a quick boost tears you free
  if (G.webT > 0 && P.alive) {
    G.webT -= dt; G.webbedT = (G.webbedT || 0) + dt;
    P.webMul = WEAVE.slow; P.webG = P.grounded ? 1 : WEAVE.grav;
    if (!webMesh) { webMesh = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ color: 0xeef6ff, wireframe: true, transparent: true, opacity: 0.6, fog: false })); G.scene.add(webMesh); }
    if (!webMesh.parent) G.scene.add(webMesh);
    P.center(webMesh.position); webMesh.scale.setScalar(2.6 * P.scale); webMesh.rotation.y += dt * 0.6; webMesh.material.opacity = 0.6 * Math.min(1, G.webT * 2);
  } else {
    P.webMul = 1; P.webG = 1; G.webT = 0;
    if (webMesh && webMesh.parent) webMesh.parent.remove(webMesh);
  }
}
export function clearWebs() { for (const w of G.webs) { w.m.parent && w.m.parent.remove(w.m); w.m.material.dispose(); } G.webs.length = 0; G.webT = 0; if (webMesh && webMesh.parent) webMesh.parent.remove(webMesh); if (G.player) { G.player.webMul = 1; G.player.webG = 1; } }

export class Weaver extends Enemy {
  constructor(pos) {
    super('weaver', 'E_Weaver', pos, WEAVE.hp, WEAVE.r); this.boom = 1.3;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6; this.vel = new V3(); this.gait = Math.random() * 6;
    this.sideT = 0; this.strafe = Math.random() < 0.5 ? 1 : -1; this.stT = 3; this.burst = 0; this.burstT = 0; this.gunT = 1.2 + Math.random(); this.webCd = 1.5 + Math.random() * 1.5;
    this.legs = []; for (let k = 0; k < 8; k++) this.legs.push(this.n['WV_L' + k]);
    this.c.set(this.pos.x, this.pos.y + 2.0, this.pos.z);
  }
  update(dt) {
    const t = this.tg(), tc = t.center ? t.center(playerC) : playerC.copy(t.pos);
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
    this.blindT = this.los ? 0 : (this.blindT || 0) + dt;
    this.stT -= dt; if (this.stT <= 0) { this.stT = 2.5 + Math.random() * 2.5; this.strafe *= -1; }
    let toward = dl > WEAVE.keep[1] || this.blindT > 3 ? 1 : dl < WEAVE.keep[0] ? -0.8 : 0, fx_ = dx / dl, fz = dz / dl;
    const gl = goalDir(this, this.pos); if (gl) { fx_ = gl.x; fz = gl.z; toward = 1; }
    if (this.sideT > 0) { this.sideT -= dt; toward *= 0.2; }
    const sw = this.sideT > 0 ? 1.3 : gl ? 0.2 : 0.55;
    const tx = (fx_ * toward - fz * this.strafe * sw) * WEAVE.speed, tz = (fz * toward + fx_ * this.strafe * sw) * WEAVE.speed;
    this.vel.x += (tx - this.vel.x) * (1 - Math.exp(-2.5 * dt)); this.vel.z += (tz - this.vel.z) * (1 - Math.exp(-2.5 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.x)); this.pos.z = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.z));
    if (collideCyl(this.pos, 2.4, 3) && !(this.sideT > 0)) { this.sideT = 1.2; this.strafe *= -1; }
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 2) - this.pos.y) * Math.min(1, dt * 8);
    const sp = Math.hypot(this.vel.x, this.vel.z), amp = Math.min(1, sp / 3);
    this.yaw += angDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 3);   // the body keeps facing its target, the legs scuttle sideways
    this.obj.rotation.set(0, this.yaw, 0);
    this.gait += dt * (2 + sp * 1.6);
    for (let k = 0; k < 8; k++) {
      const L = this.legs[k]; if (!L) continue;
      const side = k < 4 ? -1 : 1, ph = this.gait + ((k + (k < 4 ? 0 : 1)) % 2) * Math.PI;
      L.rotation.y = Math.sin(ph) * 0.3 * amp; L.rotation.z = side * Math.max(0, Math.cos(ph)) * 0.32 * amp;
    }
    this.c.set(this.pos.x, this.pos.y + 2.0 + Math.sin(this.gait * 2) * 0.05 * amp, this.pos.z);
    const los = this.checkLos(dt);
    this.gunT -= dt;
    if (this.gunT <= 0 && los && dl < 70) { this.gunT = WEAVE.gunCd[0] + Math.random() * (WEAVE.gunCd[1] - WEAVE.gunCd[0]); this.burst = WEAVE.burst; this.burstT = 0; }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burst--; this.burstT = WEAVE.gap;
        const mp = this.n.Muzzle_WvGun ? this.n.Muzzle_WvGun.getWorldPosition(_a).clone() : this.c.clone();
        const aim = lead(mp, 120, _b, t); _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.03; _d.z += (Math.random() - 0.5) * 0.05;
        spawnShot({ p: mp, v: _d.normalize().multiplyScalar(120), dmg: WEAVE.dmg, team: 'E', kind: 'ebullet', color: 0xd8b0ff, w: 0.22, len: 4, label: 'weaver-needle' });
        G.fx.muzzle(mp, _d, 0xc8a0ff, 0.9); sfx('eshot', dl);
      }
    }
    this.webCd -= dt;   // web glob: a lobbed silk bundle aimed where the target is going; it leaves a sticky patch
    if (this.webCd <= 0 && dl < 60 && los) {
      this.webCd = WEAVE.webCd[0] + Math.random() * (WEAVE.webCd[1] - WEAVE.webCd[0]);
      const mp = this.n.Muzzle_Web ? this.n.Muzzle_Web.getWorldPosition(new V3()) : new V3(this.pos.x, this.pos.y + 3, this.pos.z);
      mp.y += 0.6;
      const D = Math.hypot(tc.x - mp.x, tc.z - mp.z), Tf = 0.7 + D / 60, g = 20;
      const aim = new V3().copy(tc).addScaledVector(t.vel || ZV, Tf * 0.85);
      const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
      spawnShot({ p: mp, v, dmg: WEAVE.webDmg, team: 'E', kind: 'shell', splash: 0, life: Tf + 1.5, grav: g, label: 'weaver-web', color: 0xeef6ff, size: 1.6, web: true });
      G.fx.muzzle(mp, _d.copy(v).normalize(), 0xeef6ff, 1.4); sfx('eshell', dl); G.webShots = (G.webShots || 0) + 1;
    }
  }
}

// ---- HK-1 hack module
function fireHack(owner, slot, d, dmgMul, aim, target) {
  const mp = owner.muzzlePos(slot, new V3(), 0), v = new V3().subVectors(aim, mp).normalize().multiplyScalar(d.speed);
  const m = new THREE.Mesh(dartGeo, new THREE.MeshBasicMaterial({ color: 0x70ffb8, fog: false })); m.position.copy(mp); G.scene.add(m);
  let tgt = target && target.alive ? target : null;
  if (!tgt) { let bd = 0.95; for (const e of entsFor('P')) { if (!e.alive || e.isBarrel || e.isMine || !e.c) continue; _c.subVectors(e.c, mp); const dl = _c.length(); if (dl > 130) continue; const k = _c.dot(v) / (dl * d.speed); if (k > bd) { bd = k; tgt = e; } } }
  G.hacks.push({ p: mp.clone(), v, t: 1.7, d, mul: dmgMul, tgt, m });
  G.fx.muzzle(mp, _d.copy(v).normalize(), 0x70ffb8, 1.3); sfx('cannon', 0);
}
export function hackable(h) { return !!h && HACK.kinds.includes(h.kind) && h.maxHp <= HACK.maxHp * G.diff.hp && !h.hacked && !h.cloaked && !h.veil && h.alive && !h.dying; }
function hackHit(e, n) {
  const h = e.kind === 'cpart' ? e.owner : e, d = n.d;
  if (!h || !h.alive || h.dying) return;
  if (hackable(h)) {
    h.stunT = Math.max(h.stunT || 0, d.up); G.hackTries = (G.hackTries || 0) + 1;
    if (G.player) G.fx.streak(G.player.center(_a).clone(), h.c.clone(), 0.3, 0x70ffb8, d.up);
    G.fx.ring(h.c.clone(), null, 0.5, (h.r || 2) * 1.8, d.up, 0x70ffb8);
    G.queue.push({ label: 'hack', t: d.up, fn: () => { if (h.alive && !h.dying && !h.hacked) hackOn(h, d.dur); } });
  } else {
    dealDamage(e, d.fail * n.mul, 'P', n.p, 'hack');
    if (h.alive) h.stunT = Math.max(h.stunT || 0, h.kind === 'boss' || h.kind === 'raider' || h.maxHp > 3000 ? 0.6 : d.stun);
    G.fx.sparks(n.p.clone(), null, 14, 0x70ffb8, 10, 1, 0.3, 0.2); G.hackFail = (G.hackFail || 0) + 1;
  }
}
function hackOn(h, dur) {
  h.hacked = true; h.hackT = dur; h.hfoeT = 0; h.goalP0 = h.goalP; h.goalP = null;
  const f = { isHackAlly: true, h, pos: h.pos, get vel() { return h.vel || ZV; }, get alive() { return h.alive && !h.dying && h.hacked; }, center: (o) => o.copy(h.c), foeW: 1.0, foeWAir: 1.0, foeWBoss: 1.1, hit: (dmg) => h.hit(dmg) };
  f._ent = { isAlly: true, isHack: true, c: new V3(), r: h.r || 2, get alive() { return f.alive; }, hit: (dmg, src, label) => h.hit(dmg, src) };
  h.hackF = f; G.friends.push(f);
  unflash(h); h.obj.traverse((o) => { if (o.isMesh && !o.userData.hm) { o.userData.hm = o.material; const m = o.material.clone(); if (m.emissive) { m.emissive.setHex(0x30ff90); m.emissiveIntensity = 0.45; } else if (m.color) m.color.lerp(_hc.setHex(0x70ffb8), 0.4); o.material = m; } });
  h.hackRing = new THREE.Mesh(hackRingGeo, new THREE.MeshBasicMaterial({ color: 0x70ffb8, transparent: true, opacity: 0.85, fog: false })); h.hackRing.rotation.x = -Math.PI / 2; G.scene.add(h.hackRing);
  for (const e of G.enemies) if (e !== h && e.alive && e.c && e.c.distanceTo(h.c) < 70) e.tgT = 0;
  G.hacked = (G.hacked || 0) + 1; G.onHacked && G.onHacked(h);
  G.fx.ring(h.c.clone(), null, 1, (h.r || 2) * 3, 0.4, 0x70ffb8); sfx('shield', G.player ? G.player.pos.distanceTo(h.pos) * 0.5 : 0);
}
function hackOff(h) {
  h.hacked = false; h.tgT = 0; h.goalP = h.goalP0 || null;
  const i = G.friends.indexOf(h.hackF); if (i >= 0) G.friends.splice(i, 1);
  for (const e of G.enemies) if (e.foe === h.hackF) e.tgT = 0;
  h.hackF = null;
  h.obj.traverse((o) => { if (o.isMesh && o.userData.hm) { o.material.dispose(); o.material = o.userData.hm; o.userData.hm = null; } });
  if (h.hackRing) { h.hackRing.parent && h.hackRing.parent.remove(h.hackRing); h.hackRing.material.dispose(); h.hackRing = null; }
  if (h.alive && h.c) G.fx.sparks(h.c.clone(), null, 10, 0x70ffb8, 8, 0.8, 0.3, 0.2);
}
function hackTarget(self) {   // a hacked enemy goes for the nearest enemy it can see; with none around it trails the player
  if (self.hfoe && self.hfoe.alive && G.time < self.hfoeT) return self.hfoe;
  self.hfoeT = G.time + 0.6;
  let best = null, bd = 95;
  for (const e of G.enemies) {
    if (e === self || !e.alive || e.dying || e.hacked || !e.c || e.cloaked) continue;
    const d = e.c.distanceTo(self.c); if (d < bd) { bd = d; best = e; }
  }
  if (best) { const e = best; self.hfoe = e._px || (e._px = { isEnemyProxy: true, pos: e.pos || e.c, get vel() { return e.vel || ZV; }, get alive() { return e.alive && !e.dying && !e.hacked; }, center: (o) => o.copy(e.c) }); return self.hfoe; }
  const P = G.player;
  self.hfoe = self._idle || (self._idle = { pos: new V3(), vel: ZV, alive: true, center: (o) => o.copy(self._idle.pos) });
  if (P) self._idle.pos.set(P.pos.x, P.pos.y + 140, P.pos.z);
  return self.hfoe;
}
function updateHacks(dt) {
  for (let i = G.hacks.length - 1; i >= 0; i--) {
    const n = G.hacks[i]; n.t -= dt;
    if (n.tgt && n.tgt.alive && n.tgt.c) { const sp = n.v.length(); _a.subVectors(n.tgt.c, n.p).normalize(); _b.copy(n.v).divideScalar(sp); if (_a.dot(_b) > 0) { _b.lerp(_a, Math.min(1, 4 * dt)).normalize(); n.v.copy(_b).multiplyScalar(sp); } }
    const L = n.v.length() * dt; _d.copy(n.v).normalize();
    const w = raySolids(n.p, _d, L);
    let hit = null;
    for (const e of entsFor('P')) { if (!e.alive || e.isBarrel || e.isMine || !e.c) continue; if (e.c.distanceTo(n.p) < (e.r || 1.5) + 1.0) { hit = e; break; } }
    if (hit) { hackHit(hit, n); n.t = 0; }
    else if (w.solid || n.t <= 0) { G.fx.sparks(n.p, null, 6, 0x70ffb8, 8, 0.8, 0.3, 0.2); n.t = 0; }
    else n.p.addScaledVector(n.v, dt);
    n.m.position.copy(n.p); n.m.rotation.x += dt * 9; n.m.rotation.y += dt * 7;
    if (Math.random() < 0.6) G.fx.emit('add', { x: n.p.x, y: n.p.y, z: n.p.z, life: 0.25, s0: 0.5, s1: 0.1, c0: 0x70ffb8, c1: 0x104830 });
    if (n.t <= 0) { n.m.parent && n.m.parent.remove(n.m); n.m.material.dispose(); G.hacks.splice(i, 1); }
  }
  for (const h of G.enemies) {
    if (!h.hacked) continue;
    h.hackT -= dt;
    if (h.hackT <= 0 || !h.alive || h.dying) { hackOff(h); continue; }
    if (h.hackRing) { h.hackRing.position.set(h.c.x, h.c.y + (h.r || 2) + 1.2, h.c.z); h.hackRing.scale.setScalar((h.r || 2) * 0.8); h.hackRing.rotation.z += dt * 2; h.hackRing.material.opacity = h.hackT < 2 ? 0.4 + 0.45 * (Math.sin(h.hackT * 18) > 0 ? 1 : 0) : 0.85; }
    if (Math.random() < 0.1) G.fx.sparks(_a.copy(h.c).add(_b.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), null, 1, 0x70ffb8, 5, 0.8, 0.3, 0.2);
  }
}
export function clearHacks() {
  for (const n of G.hacks) { n.m.parent && n.m.parent.remove(n.m); } G.hacks.length = 0;
  for (const h of G.enemies) if (h.hacked) hackOff(h);
}

// ---- civilians and the rescue shuttle
export const EVAC = { pad: [0, 8], routes: [
    [[-112, 76], [-70, 52], [-28, 24], [0, 8]],
    [[114, 66], [70, 46], [26, 22], [0, 8]],
    [[10, -120], [6, -70], [2, -26], [0, 8]],
  ], total: 60, goal: 40, maxLost: 15, hp: 40, civK: 0.7, spd: 3.3, run: 4.8, group: 4, gap: 6.5, first: 4, shuttle: [40, 14], land: 4, load: 9, cap: 12, foeW: 1.25, waitR: [10.5, 13.5] };
export const EVAC_ROAD = (() => { const R = EVAC.routes, r = [...R[0], ...R[1].slice(0, 3).reverse(), ...R[2]]; r.skip = [6]; return r; })();
class Civ {
  constructor(route, j) {
    this.isCiv = true; this.route = route; this.i = 1; this.alive = true; this.maxHp = EVAC.hp; this.hp = this.maxHp;
    this.foeW = EVAC.foeW; this.foeWAir = EVAC.foeW; this.foeWBoss = 4;
    const [x0, z0] = route[0], [x1, z1] = route[1], dl = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / dl, uz = (z1 - z0) / dl;
    this.off = (j - 1.5) * 0.8 + (Math.random() - 0.5) * 0.6;
    this.pos = new V3(x0 + ux * (9 + j * 1.3) - uz * this.off, 0, z0 + uz * (9 + j * 1.3) + ux * this.off); this.pos.y = groundAt(this.pos.x, this.pos.z, 20);
    this.vel = new V3(); this.spd = EVAC.spd * (0.9 + Math.random() * 0.2); this.ph = Math.random() * 6; this.st = 'walk'; this.webT = 0; this.scareT = 0; this.scared = false; this.yaw = Math.atan2(-ux, -uz);
    this.obj = cloneKit('P_Civ'); this.obj.scale.setScalar(1.3); this.n = nodes(this.obj); this.obj.position.copy(this.pos); G.scene.add(this.obj);
    const me = this; this._ent = { isAlly: true, isCiv: true, c: new V3(), r: 1.1, get alive() { return me.alive; }, hit: (d) => me.damage(d) };
    G.friends.push(this);
  }
  center(o) { return o.set(this.pos.x, this.pos.y + 1.2, this.pos.z); }
  hit(d) { this.damage(d); }
  damage(d) {
    if (!this.alive || (G.curShooter && G.curShooter.hacked)) return;
    const lb = G.curLabel || '?';
    d *= EVAC.civK * (lb.startsWith('boss-') ? 0.4 : lb === 'weaver-needle' ? 0.5 : 1); this.hp -= d * G.diff.dmg; G.civDmg = (G.civDmg || 0) + d * G.diff.dmg;   // a boss's splash is aimed at you, civilians only catch the edge
    G.civLog = G.civLog || {}; G.civLog[lb] = (G.civLog[lb] || 0) + d * G.diff.dmg;
    if (this.hp <= 0) this.die();
  }
  leave() {
    this.alive = false; this.obj.parent && this.obj.parent.remove(this.obj);
    const i = G.friends.indexOf(this); if (i >= 0) G.friends.splice(i, 1);
    for (const e of G.enemies) if (e.foe === this) e.tgT = 0;
  }
  die() { this.leave(); if (G.evac) G.evac.lost++; G.fx.sparks(this.center(_a).clone(), null, 8, 0xff6040, 6, 0.8, 0.3, 0.2); G.fx.smoke(this.pos, 2, 1.5, 1.2, 0x4a4440, 1, 0.6); G.onCivLost && G.onCivLost(this); }
  board() { this.leave(); if (G.evac) G.evac.saved++; G.onCivSaved && G.onCivSaved(this); }
  update(dt) {
    const E = G.evac, sh = E.sh;
    let tx = this.pos.x, tz = this.pos.z, spd = this.spd;
    this.scareT -= dt;
    if (this.scareT <= 0) { this.scareT = 0.5; this.scared = false; for (const e of G.enemies) if (e.alive && !e.dying && !e.hacked && e.c && Math.hypot(e.c.x - this.pos.x, e.c.z - this.pos.z) < 24) { this.scared = true; break; } }
    if (this.scared) spd = EVAC.run;
    if (this.st === 'walk') {
      const w = this.route[this.i];
      if (this.i >= this.route.length - 1) {
        if (!this.wait) { const a = Math.atan2(this.pos.z - w[1], this.pos.x - w[0]) + (Math.random() - 0.5) * 1.0, r = EVAC.waitR[0] + Math.random() * (EVAC.waitR[1] - EVAC.waitR[0]); this.wait = [w[0] + Math.cos(a) * r, w[1] + Math.sin(a) * r]; }
        tx = this.wait[0]; tz = this.wait[1]; if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 1.2) this.st = 'wait';
      } else {
        const p0 = this.route[this.i - 1], dl = Math.hypot(w[0] - p0[0], w[1] - p0[1]) || 1, nx = -(w[1] - p0[1]) / dl, nz = (w[0] - p0[0]) / dl;
        tx = w[0] + nx * this.off * 1.6; tz = w[1] + nz * this.off * 1.6;
        if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 3) this.i++;
      }
    } else if (this.st === 'wait') { spd = 0; if (sh.st === 'load' && sh.room > 0) { this.st = 'board'; sh.room--; } }
    if (this.st === 'board') {
      if (sh.st !== 'load') this.st = 'wait';
      else { tx = EVAC.pad[0]; tz = EVAC.pad[1] + 5; spd = EVAC.run; if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 2.2) { this.board(); return; } }
    }
    if (this.webT > 0 || webAt(this.pos.x, this.pos.z, this.pos.y)) { this.webT = Math.max(0, this.webT - dt); spd *= WEAVE.civSlow; this.webbed = true; } else this.webbed = false;
    let dx = tx - this.pos.x, dz = tz - this.pos.z; const dl = Math.hypot(dx, dz);
    if (dl > 0.3 && spd > 0) { dx /= dl; dz /= dl; this.vel.x += (dx * spd - this.vel.x) * Math.min(1, dt * 6); this.vel.z += (dz * spd - this.vel.z) * Math.min(1, dt * 6); }
    else this.vel.multiplyScalar(Math.exp(-8 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    collideCyl(this.pos, 0.5, 1.6);
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5);
    const sp = Math.hypot(this.vel.x, this.vel.z), k = Math.min(1, sp / 2.5);
    if (sp > 0.4) this.yaw += angDiff(Math.atan2(-this.vel.x, -this.vel.z), this.yaw) * Math.min(1, dt * 8);
    else if (this.st === 'wait') this.yaw += angDiff(Math.atan2(-(EVAC.pad[0] - this.pos.x), -(EVAC.pad[1] - this.pos.z)), this.yaw) * Math.min(1, dt * 3);
    this.ph += dt * (2 + sp * 2.4);
    const n = this.n, sw = Math.sin(this.ph) * 0.7 * k;
    if (n.CV_LegL) { n.CV_LegL.rotation.x = sw; n.CV_LegR.rotation.x = -sw; }
    if (n.CV_ArmL) { const up = this.scared && sp > 0.5 ? -2.6 : 0; n.CV_ArmL.rotation.x = this.scared ? up + sw * 0.3 : -sw * 0.8; n.CV_ArmR.rotation.x = this.scared ? up - sw * 0.3 : sw * 0.8; }
    if (this.st === 'wait' && sh.st === 'down') { if (n.CV_ArmR) n.CV_ArmR.rotation.x = -2.8 + Math.sin(this.ph * 3) * 0.3; }   // waving at the shuttle
    this.obj.position.copy(this.pos); this.obj.rotation.set(0, this.yaw, 0);
  }
}
export function startEvac() {
  clearEvac();
  const E = G.evac = { civs: [], saved: 0, lost: 0, spawned: 0, k: 0, spawnT: EVAC.first, objs: [], trips: 0 };
  for (const r of EVAC.routes) { const x = r[0][0], z = r[0][1], y = groundAt(x, z, 20), o = cloneKit('P_Shelter'); o.position.set(x, y, z); G.scene.add(o); E.objs.push(o); addSolid(x, z, 7.2, 7.2, 4.5, y, 'shelter'); }
  const px = EVAC.pad[0], pz = EVAC.pad[1], pad = cloneKit('P_EvacPad'); pad.position.set(px, groundAt(px, pz, 20), pz); G.scene.add(pad); E.objs.push(pad); E.pad = pad; E.padN = nodes(pad);
  const so = cloneKit('A_Shuttle'); so.visible = false; so.position.set(px, 200, pz); G.scene.add(so); E.objs.push(so);
  E.sh = { obj: so, n: nodes(so), st: 'away', t: EVAC.shuttle[0], y: 200, ph: 0, room: 0, ramp: 0 };
}
export function clearEvac() {
  const E = G.evac; if (!E) return;
  for (const c of E.civs) if (c.alive) c.leave();
  for (const o of E.objs) o.parent && o.parent.remove(o);
  G.evac = null;
}
function updateShuttle(dt) {
  const E = G.evac, S = E.sh, o = S.obj, n = S.n, px = EVAC.pad[0], pz = EVAC.pad[1], gy = E.pad.position.y, H = 70;
  S.ph += dt; S.t -= dt;
  if (S.st === 'away') { o.visible = false; if (S.t <= 0) { S.st = 'down'; S.t = EVAC.land; o.visible = true; G.onShuttle && G.onShuttle('down'); } }
  else if (S.st === 'down') { const k = Math.max(0, S.t / EVAC.land); S.y = gy + 0.2 + H * k * k; if (S.t <= 0) { S.st = 'load'; S.t = EVAC.load; S.room = EVAC.cap; G.fx.ring(new V3(px, gy + 0.4, pz), null, 2, 16, 0.6, 0xc8c0b0); G.onShuttle && G.onShuttle('load'); } }
  else if (S.st === 'load') {
    S.y = gy + 0.2;
    const boarding = E.civs.some((c) => c.alive && c.st === 'board'), waiting = E.civs.some((c) => c.alive && c.st === 'wait');
    if (S.t <= 0 && !boarding || (S.room <= 0 && !boarding) || (S.t < EVAC.load - 3 && !boarding && !waiting)) { S.st = 'up'; S.t = EVAC.land; E.trips++; G.onShuttle && G.onShuttle('up'); }
  } else if (S.st === 'up') { const k = 1 - Math.max(0, S.t / EVAC.land); S.y = gy + 0.2 + H * k * k; if (S.t <= 0) { S.st = 'away'; S.t = EVAC.shuttle[1]; } }
  o.position.set(px, S.y + (S.st === 'load' ? 0 : Math.sin(S.ph * 1.3) * 0.25), pz);
  for (let k = 0; k < 4; k++) if (n['SHU_Fan' + k]) n['SHU_Fan' + k].rotation.y += dt * (S.st === 'load' ? 14 : 34);
  S.ramp += ((S.st === 'load' ? 1 : 0) - S.ramp) * Math.min(1, dt * 3); if (n.SHU_Ramp) n.SHU_Ramp.rotation.x = -1.15 * S.ramp;
  if (o.visible && S.y - gy < 14 && Math.random() < 0.5) { const a = Math.random() * 6.3, r = 6 + Math.random() * 8; G.fx.smoke(_a.set(px + Math.cos(a) * r, gy + 0.3, pz + Math.sin(a) * r), 1, 2.2, 1.6, 0xb8b0a0, 1, 0.5); }
  if (E.padN.EP_Lights) E.padN.EP_Lights.visible = S.st === 'away' ? true : (S.ph * 2.5) % 1 < 0.55;
}
function updateEvac(dt) {
  const E = G.evac; if (!E) return;
  E.spawnT -= dt;
  if (E.spawnT <= 0 && E.spawned < EVAC.total) {
    E.spawnT = EVAC.gap; const ri = E.k++ % 3, r = EVAC.routes[ri], nn = Math.min(EVAC.group, EVAC.total - E.spawned);
    for (let j = 0; j < nn; j++) E.civs.push(new Civ(r, j));
    E.spawned += nn; G.onCivGroup && G.onCivGroup(ri);
  }
  for (const c of E.civs) if (c.alive) c.update(dt);
  if (E.civs.length > 30) E.civs = E.civs.filter((c) => c.alive);
  updateShuttle(dt);
}
export function evacWalking() { const E = G.evac; return E ? E.civs.filter((c) => c.alive && c.st === 'walk') : []; }

// ------------------------------------------------------------------ v47 Pursuit: a data courier drives a loop of the city
// and stops at four upload stations; at 100% upload the mission is lost. Stay within 24 m while it uploads to jam it.
export const COURIER = { path: [[-120, -60], [-70, -125], [50, -120], [125, -75], [125, 40], [75, 115], [-35, 125], [-125, 75]], stations: [1, 3, 5, 7],
  hp: 18000, r: 3.2, speed: 14, stop: 9, per: 25, jamR: 24, jamK: 0.35, front: 0.45, rear: 1.4, mineT: [4, 6], panic: [0.66, 0.33], netK: 1.3, boost: 1.5, boostT: 6, turn: 2.6 };
export const COURIER_PATH = [...COURIER.path, COURIER.path[0]];
const upBeamGeo = new THREE.CylinderGeometry(0.7, 0.7, 260, 10, 1, true).translate(0, 130, 0);
function stationSpot(i) {   // beside the road, on the outside of the loop
  const [x, z] = COURIER.path[i], l = Math.hypot(x, z) || 1;
  return new V3(x + x / l * 11, 0, z + z / l * 11);
}
export class Courier extends Enemy {
  constructor() {
    const [x, z] = COURIER.path[0];
    super('courier', 'E_Courier', new V3(x, 0, z), COURIER.hp, COURIER.r); this.boom = 2.4; this.isCourier = true;
    const [nx, nz] = COURIER.path[1];
    this.i = 1; this.st = 'drive'; this.t = 0; this.yaw = Math.atan2(-(nx - x), -(nz - z)); this.spd = 0; this.vel = new V3(); this.mineT = 3; this.panicK = 0; this.boostT = 0; this.ph = 0; this.mines = 0; this.jamT = 0;
    this.c.set(x, 1.4, z);
  }
  hit(dmg, at) {
    if (!this.alive || this.dying) return;
    if (at) { const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), dx = at.x - this.pos.x, dz = at.z - this.pos.z, dl = Math.hypot(dx, dz) || 1, k = (dx * fx + dz * fz) / dl; dmg *= k > 0.45 ? COURIER.front : k < -0.45 ? COURIER.rear : 1; }
    if (this.netT > 0) dmg *= COURIER.netK;   // caught in a net: the armour plates are pinned open
    super.hit(dmg);
    if (this.alive && this.panicK < COURIER.panic.length && this.hp < this.maxHp * COURIER.panic[this.panicK]) {   // panic: smoke, a burst of speed, a call for drones
      this.panicK++; this.boostT = COURIER.boostT; if (this.st === 'upload') { this.st = 'drive'; this.i = (this.i + 1) % COURIER.path.length; }
      G.smokes.push({ c: this.c.clone(), R: 11, t: 6, T: 6, puffT: 0 }); for (const e of G.enemies) if (e.losT !== undefined) e.losT = 0;
      G.fx.flash(this.c, 0xd0d4d8, 20, 14, 0.2); sfx('smoke', G.player ? G.player.pos.distanceTo(this.pos) : 0);
      G.onCourierPanic && G.onCourierPanic(this);
    }
  }
  die() { this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this); explodeAt(this.c, 9, 40, 'P', 2.4, 0x60e8ff); G.fx.flash(this.c, 0x80f0ff, 60, 30, 0.5); this.remove(); }
  update(dt) {
    const P = G.player, n = this.n, CP = G.courier; this.ph += dt;
    const path = COURIER.path, N = path.length;
    let spd = 0;
    if (this.st === 'drive') {
      const [tx, tz] = path[this.i], dx = tx - this.pos.x, dz = tz - this.pos.z, dl = Math.hypot(dx, dz);
      const isSt = COURIER.stations.includes(this.i);
      if (dl < (isSt ? 3 : 7)) {
        if (isSt && !this.skip) { this.st = 'upload'; this.t = COURIER.stop; this.station = CP && CP.stations[COURIER.stations.indexOf(this.i)]; G.onUpload && G.onUpload(this); }
        else { this.skip = false; this.i = (this.i + 1) % N; }
      }
      this.yaw += Math.max(-COURIER.turn * dt, Math.min(COURIER.turn * dt, angDiff(Math.atan2(-dx, -dz), this.yaw)));
      const off = Math.abs(angDiff(Math.atan2(-dx, -dz), this.yaw));
      spd = COURIER.speed * (this.boostT > 0 ? COURIER.boost : 1) * (this.netT > 0 ? 0.35 : 1) * (off > 0.8 ? 0.45 : 1) * (isSt ? Math.min(1, 0.35 + dl / 30) : 1);
      this.mineT -= dt;
      if (this.mineT <= 0 && P && P.alive && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 80) {
        this.mineT = COURIER.mineT[0] + Math.random() * (COURIER.mineT[1] - COURIER.mineT[0]);
        for (let k = -1; k <= 1; k += 2) { const m = new Mine(new V3(this.pos.x + Math.sin(this.yaw) * 3.2 + Math.cos(this.yaw) * k * 1.2, this.pos.y + 0.8, this.pos.z + Math.cos(this.yaw) * 3.2 - Math.sin(this.yaw) * k * 1.2), this); m.life = 25; this.mines++; }
        sfx('minedrop', Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z));
      }
    } else if (this.st === 'upload') {
      this.t -= dt;
      const jam = P && P.alive && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < COURIER.jamR;
      if (jam) this.jamT += dt;
      if (CP) { CP.up = Math.min(100, CP.up + COURIER.per / COURIER.stop * dt * (jam ? COURIER.jamK : 1)); CP.jam = jam; if (CP.up >= 100) { CP.done = true; G.onCourierDone && G.onCourierDone(); } }
      if (this.t <= 0) { this.st = 'drive'; this.i = (this.i + 1) % N; this.station = null; }
    }
    if (this.boostT > 0) { this.boostT -= dt; if (Math.random() < 0.5) G.fx.sparks(_a.set(this.pos.x + Math.sin(this.yaw) * 2.8, this.pos.y + 1, this.pos.z + Math.cos(this.yaw) * 2.8), _b.set(Math.sin(this.yaw), 0.2, Math.cos(this.yaw)), 2, 0x80e8ff, 14, 0.4, 0.3, 0.3); }
    this.spd += (spd - this.spd) * Math.min(1, dt * 2.5);
    this.vel.set(-Math.sin(this.yaw) * this.spd, 0, -Math.cos(this.yaw) * this.spd);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    collideCyl(this.pos, 2.4, 2);
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 2);
    this.pos.y += (gy + 0.35 + Math.sin(this.ph * 3) * 0.08 - this.pos.y) * Math.min(1, dt * 6);
    this.obj.rotation.set(0, this.yaw, 0); this.obj.rotation.z = -angDiff(this.yaw, this.lastYaw ?? this.yaw) / Math.max(dt, 1e-3) * 0.06; this.lastYaw = this.yaw;
    for (let k = 1; k <= 4; k++) { const f = n['CR_Fan' + k]; if (f) f.rotation.z += dt * (14 + this.spd); }
    if (n.CR_Core) { n.CR_Core.rotation.z += dt * 1.5; n.CR_Core.scale.setScalar(1 + (this.st === 'upload' ? 0.2 : 0.06) * Math.sin(this.ph * (this.st === 'upload' ? 14 : 4))); }
    this.c.set(this.pos.x, this.pos.y + 1.3, this.pos.z);
  }
}
class UpStation {
  constructor(i) {
    this.i = i; this.obj = cloneKit('P_UpStation'); const p = stationSpot(i); p.y = groundAt(p.x, p.z, 20); this.obj.position.copy(p); G.scene.add(this.obj); this.pos = this.obj.position;
    this.n = nodes(this.obj); this.solid = addSolid(p.x, p.z, 4.4, 4.4, 0.6, p.y, 'station');
    this.beam = new THREE.Mesh(upBeamGeo, new THREE.MeshBasicMaterial({ color: 0x50e8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.beam.position.set(p.x, p.y + 6.6, p.z); G.scene.add(this.beam); this.k = 0; this.ph = Math.random() * 6;
    if (this.n.US_Dish) { const [x, z] = COURIER.path[i]; this.n.US_Dish.rotation.z = Math.atan2(-(x - p.x), -(z - p.z)); }
  }
  remove() { this.obj.parent && this.obj.parent.remove(this.obj); this.beam.parent && this.beam.parent.remove(this.beam); this.beam.material.dispose(); removeSolid(this.solid); }
  update(dt, on, jam) {
    this.ph += dt; this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * 5);
    this.beam.material.opacity = this.k * (jam ? 0.18 + 0.15 * Math.abs(Math.sin(this.ph * 20)) : 0.42 + 0.08 * Math.sin(this.ph * 8));
    this.beam.material.color.setHex(jam ? 0xff9040 : 0x50e8ff); this.beam.visible = this.k > 0.01;
    if (this.n.US_Beacon) this.n.US_Beacon.scale.setScalar(on ? 1.4 + 0.5 * Math.sin(this.ph * 10) : 0.8);
  }
}
export function startPursuit() {
  clearPursuit();
  G.courier = { stations: COURIER.stations.map((i) => new UpStation(i)), up: 0, jam: false, done: false, c: null };
  G.courier.c = new Courier();
}
export function clearPursuit() { if (G.courier) for (const st of G.courier.stations) st.remove(); G.courier = null; }
function updatePursuit(dt) {
  const CP = G.courier; if (!CP) return;
  const c = CP.c, upAt = c && c.alive && c.st === 'upload' ? c.station : null;
  for (const st of CP.stations) st.update(dt, st === upAt, CP.jam && st === upAt);
  if (!upAt) CP.jam = false;
}

// ---- Torcher: a flame tank. it closes to 8-13 m, sprays a 16 m cone of fire for 2.6 s (you keep burning for 3 s
// afterwards) and leaves burning patches on the ground. the fuel tanks on its back take 1.8x damage and blow up when it dies.
export const TORCH = { hp: 700, r: 2.4, speed: 7.5, keep: [8, 13], range: 18, cone: 0.42, dps: 34, burnT: 3, burnDps: 8, spray: 2.6, rest: [2.2, 3.4], lob: [4.5, 6], lobDmg: 22, lobR: 5, patchR: 3.2, patchT: 6, patchDps: 16, rear: 1.8, boomR: 8, boomDmg: 90 };
export class Torcher extends Enemy {
  constructor(pos) {
    super('torcher', 'E_Torcher', pos, TORCH.hp, TORCH.r); this.boom = 1.2;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6; this.tYaw = this.yaw; this.vel = new V3(); this.st = 'go'; this.t = 1.5; this.ph = Math.random() * 6; this.patchT = 0; this.lobT = 2 + Math.random() * 2;
    this.stuckT = 0; this.sideT = 0; this.side = 1; this.last = this.pos.clone(); this.c.set(this.pos.x, this.pos.y + 1.4, this.pos.z);
  }
  drive(tx, tz, spd, dt) { return Engineer.prototype.drive.call(this, tx, tz, spd, dt); }
  hit(dmg, at) {
    if (at && this.alive) { const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), dx = at.x - this.pos.x, dz = at.z - this.pos.z, dl = Math.hypot(dx, dz) || 1; if ((dx * fx + dz * fz) / dl < -0.4) { dmg *= TORCH.rear; this.tankHit = (this.tankHit || 0) + 1; } }
    super.hit(dmg);
  }
  die() {
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    G.curLabel = 'torcher-tank'; explodeAt(this.c, TORCH.boomR, TORCH.boomDmg, 'X', 1.7, 0xff8030); G.fx.flash(this.c, 0xff8030, 40, 24, 0.35);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.random(); addFire(this.pos.x + Math.cos(a) * 4, this.pos.z + Math.sin(a) * 4, this.pos.y); }
    this.remove();
  }
  update(dt) {
    const t = this.tg(), n = this.n; this.ph += dt;
    const tc = t.center ? t.center(playerC) : t.pos;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
    if (this.st === 'spray') {
      this.vel.multiplyScalar(Math.exp(-4 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    } else if (dl > TORCH.keep[1]) this.drive(t.pos.x, t.pos.z, TORCH.speed, dt);
    else if (dl < TORCH.keep[0]) this.drive(this.pos.x - dx / dl * 10, this.pos.z - dz / dl * 10, TORCH.speed * 0.7, dt);
    else { this.vel.multiplyScalar(Math.exp(-3 * dt)); this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; }
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 2) - this.pos.y) * Math.min(1, dt * 8);
    this.obj.rotation.set(0, this.yaw, 0);
    // the turret tracks the target (world yaw), a bit slower while spraying so you can strafe out of the cone
    const want = Math.atan2(-(tc.x - this.pos.x), -(tc.z - this.pos.z));
    this.tYaw += Math.max(-dt * (this.st === 'spray' ? 1.1 : 2.6), Math.min(dt * (this.st === 'spray' ? 1.1 : 2.6), angDiff(want, this.tYaw)));
    if (n.TC_Turret) n.TC_Turret.rotation.y = this.tYaw - this.yaw;
    this.c.set(this.pos.x, this.pos.y + 1.4, this.pos.z);
    this.t -= dt;
    if (this.st === 'go' || this.st === 'rest') {
      if (this.t <= 0 && dl < TORCH.range && Math.abs(angDiff(want, this.tYaw)) < 0.5 && this.checkLos(dt)) { this.st = 'spray'; this.t = TORCH.spray; sfx('erupt', G.player ? G.player.pos.distanceTo(this.pos) : 0); }
      else if (this.st === 'rest' && this.t <= 0) this.st = 'go';
      this.lobT -= dt;   // napalm lob at targets out of flame range: a marked landing spot that leaves a fire patch
      if (this.lobT <= 0 && dl > TORCH.range && dl < 60 && this.checkLos(dt)) {
        this.lobT = TORCH.lob[0] + Math.random() * (TORCH.lob[1] - TORCH.lob[0]);
        const mp = n.Muzzle_Torch ? n.Muzzle_Torch.getWorldPosition(new V3()) : new V3(this.pos.x, this.pos.y + 2, this.pos.z);
        const D = Math.hypot(t.pos.x - mp.x, t.pos.z - mp.z), Tf = 1.0 + D / 55, g = 24;
        const aim = new V3().copy(tc).addScaledVector(t.vel || _c.set(0, 0, 0), Tf * 0.8);
        const gy = groundAt(aim.x, aim.z, aim.y + 1), hit = aim.y - gy < 4 ? (aim.y = gy, true) : false;
        const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
        G.curShooter = this; spawnShot({ p: mp, v, dmg: TORCH.lobDmg, team: 'E', kind: 'shell', splash: TORCH.lobR, life: Tf + 1, grav: g, label: 'torcher-napalm', color: 0xff7020, size: 1.4 }); G.curShooter = null;
        if (hit) { G.fx.warn(aim, TORCH.lobR, Tf); G.queue.push({ label: 'napalm', t: Tf, fn: () => addFire(aim.x, aim.z, aim.y) }); }
        G.fx.muzzle(mp, _d.copy(v).normalize(), 0xff9040, 1.8); sfx('eshell', dl);
      }
    } else if (this.st === 'spray') {
      const mp = n.Muzzle_Torch ? n.Muzzle_Torch.getWorldPosition(new V3()) : new V3(this.pos.x, this.pos.y + 1.8, this.pos.z);
      const fx = -Math.sin(this.tYaw), fz = -Math.cos(this.tYaw);
      for (let k = 0; k < 2; k++) { const sp = 18 + Math.random() * 8, a = (Math.random() - 0.5) * TORCH.cone * 1.6, cx = fx * Math.cos(a) - fz * Math.sin(a), cz = fz * Math.cos(a) + fx * Math.sin(a);
        G.fx.emit('add', { x: mp.x, y: mp.y, z: mp.z, vx: cx * sp, vy: (Math.random() - 0.3) * 3, vz: cz * sp, life: 0.5 + Math.random() * 0.25, s0: 0.6, s1: 2.3, c0: k ? 0xff8a30 : 0xffb050, c1: 0x801808 }); }
      if (Math.random() < 0.3) G.fx.smoke(_b.set(mp.x + fx * 8, mp.y + 1, mp.z + fz * 8), 1, 2.4, 1.4, 0x2a2420, 1, 0.5);
      for (const f of [G.player, ...G.friends]) {
        if (!f || !f.alive || !f.pos) continue;
        const fc = f.center ? f.center(_c) : _c.copy(f.pos), ex = fc.x - mp.x, ez = fc.z - mp.z, ed = Math.hypot(ex, ez) || 1;
        if (ed > TORCH.range + (f.isPlayer || f === G.player ? 0.5 : 1) || Math.abs(fc.y - mp.y) > 9) continue;
        if ((ex * fx + ez * fz) / ed < Math.cos(TORCH.cone)) continue;
        if (!clearLine(mp, fc)) continue;
        if (f === G.player) { G.curSrc = mp; damagePlayer(TORCH.dps * dt, mp, 'torcher'); G.pBurnT = TORCH.burnT; G.torchHit = (G.torchHit || 0) + dt; }
        else if (f.hit) f.hit(TORCH.dps * dt * 0.7, fc, 'torcher');
      }
      this.patchT -= dt;
      if (this.patchT <= 0) { this.patchT = 0.3; const r = 4 + Math.random() * (TORCH.range - 5), a = (Math.random() - 0.5) * TORCH.cone; addFire(mp.x + (fx * Math.cos(a) - fz * Math.sin(a)) * r, mp.z + (fz * Math.cos(a) + fx * Math.sin(a)) * r, this.pos.y); }
      if (this.t <= 0) { this.st = 'rest'; this.t = TORCH.rest[0] + Math.random() * (TORCH.rest[1] - TORCH.rest[0]); }
    }
    if (n.TC_Tank) n.TC_Tank.scale.setScalar(1 + (this.st === 'spray' ? 0.03 * Math.sin(this.ph * 30) : 0));
  }
}
G.fires = [];
const fireGeo = new THREE.CircleGeometry(1, 20);
let firePool = null;
function addFire(x, z, yRef) {
  const y = groundAt(x, z, yRef + 3);
  if (G.fires.length >= 40) G.fires.shift();
  G.fires.push({ x, z, y, R: TORCH.patchR * (0.8 + Math.random() * 0.4), t: TORCH.patchT, T: TORCH.patchT, ph: Math.random() * 6 });
}
function updateFires(dt) {
  if (!firePool) { firePool = []; for (let k = 0; k < 40; k++) { const m = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({ color: 0xc03810, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 3; firePool.push(m); } }
  const P = G.player;
  for (let i = G.fires.length - 1; i >= 0; i--) {
    const f = G.fires[i]; f.t -= dt; f.ph += dt;
    if (f.t <= 0) { G.fires.splice(i, 1); continue; }
    if (Math.random() < 0.25) G.fx.emit('add', { x: f.x + (Math.random() - 0.5) * f.R * 1.4, y: f.y + 0.3, z: f.z + (Math.random() - 0.5) * f.R * 1.4, vx: 0, vy: 2.5 + Math.random() * 2, vz: 0, life: 0.45, s0: 0.8, s1: 0.2, c0: 0xff8030, c1: 0x902008 });
    if (P && P.alive && Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < f.R && P.pos.y - f.y < 2.5) { G.curSrc = null; damagePlayer(TORCH.patchDps * dt, null, 'fire'); G.pBurnT = Math.max(G.pBurnT || 0, 1.2); G.fireT = (G.fireT || 0) + dt; }
  }
  for (let k = 0; k < firePool.length; k++) {
    const m = firePool[k], f = G.fires[k];
    if (!f) { if (m.visible) { m.visible = false; m.parent && m.parent.remove(m); } continue; }
    if (!m.parent) G.scene.add(m);
    m.visible = true; m.position.set(f.x, f.y + 0.08, f.z); m.scale.setScalar(f.R * (0.9 + 0.1 * Math.sin(f.ph * 9)));
    m.material.opacity = 0.32 * Math.min(1, f.t / 1.2, (f.T - f.t) / 0.3 + 0.3);
  }
  if (G.pBurnT > 0 && P && P.alive) {   // you keep burning for a moment after the spray
    G.pBurnT -= dt; G.curSrc = null; damagePlayer(TORCH.burnDps * dt, null, 'burn');
    if (Math.random() < 0.5) G.fx.emit('add', { x: P.pos.x + (Math.random() - 0.5) * 2, y: P.pos.y + 1 + Math.random() * 3, z: P.pos.z + (Math.random() - 0.5) * 2, vx: 0, vy: 3, vz: 0, life: 0.4, s0: 1.0, s1: 0.2, c0: 0xffb050, c1: 0xff3010 });
  }
}
export function clearFires() { G.fires.length = 0; G.pBurnT = 0; if (firePool) for (const m of firePool) { m.visible = false; m.parent && m.parent.remove(m); } }

// ---- NT-4 net launcher: a homing net. ground enemies are pinned 2.5 s (they still shoot), small flyers are brought down,
// big ones are slowed 40%, the courier drops to 35% speed
G.nets = [];
const netGeo = new THREE.IcosahedronGeometry(1, 1);
function fireNet(owner, slot, d, dmgMul, aim, target) {
  const mp = owner.muzzlePos(slot, new V3(), 0), v = new V3().subVectors(aim, mp).normalize().multiplyScalar(d.speed);
  const m = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ color: 0x60ffb8, wireframe: true, transparent: true, opacity: 0.9, fog: false }));
  m.position.copy(mp); m.scale.setScalar(0.5); G.scene.add(m);
  let tgt = target && target.alive ? target : null;
  if (!tgt) { let bd = 0.96; for (const e of entsFor('P')) { if (!e.alive || e.isBarrel || e.isMine || !e.c) continue; _c.subVectors(e.c, mp); const dl = _c.length(); if (dl > 120) continue; const k = _c.dot(v) / (dl * d.speed); if (k > bd) { bd = k; tgt = e; } } }
  G.nets.push({ p: mp.clone(), v, t: 1.8, d, mul: dmgMul, tgt, m });
  G.fx.muzzle(mp, _d.copy(v).normalize(), 0x80ffc0, 1.6); sfx('cannon', 0);
}
function netHit(e, n) {
  const h = e.kind === 'cpart' ? e.owner : e, d = n.d;
  G.netHits = (G.netHits || 0) + 1;
  const small = ['cruise', 'drone', 'swarm', 'jammer', 'mender', 'scav', 'disarmer', 'hijack', 'sapper'].includes(h.kind);
  dealDamage(e, (small ? d.air : d.dmg) * n.mul, 'P', n.p, 'net');
  if (!h.alive) return;
  h.netT = h.isCourier ? 3 : d.root; G.fx.ring(h.c.clone(), null, 0.5, (h.r || 2) * 1.6, 0.3, 0x60ffb8);
  if (h.isCourier) G.onCourierNet && G.onCourierNet();
}
function netVisual(e) {
  if (!(e.netT > 0) || !e.alive || e.dying) { if (e.netMesh) { e.netMesh.parent && e.netMesh.parent.remove(e.netMesh); e.netMesh = null; } return; }
  if (!e.netMesh) { e.netMesh = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ color: 0x60ffb8, wireframe: true, transparent: true, opacity: 0.7, fog: false })); G.scene.add(e.netMesh); }
  e.netMesh.position.copy(e.c); e.netMesh.scale.setScalar((e.r || 2) * 1.15); e.netMesh.rotation.y += 0.02; e.netMesh.material.opacity = 0.7 * Math.min(1, e.netT * 2);
}
function updateNets(dt) {
  for (let i = G.nets.length - 1; i >= 0; i--) {
    const n = G.nets[i]; n.t -= dt;
    if (n.tgt && n.tgt.alive && n.tgt.c) { const sp = n.v.length(); _a.subVectors(n.tgt.c, n.p).normalize(); _b.copy(n.v).divideScalar(sp); if (_a.dot(_b) > 0) { _b.lerp(_a, Math.min(1, 2.8 * dt)).normalize(); n.v.copy(_b).multiplyScalar(sp); } }
    n.v.y -= 4 * dt;
    const L = n.v.length() * dt; _d.copy(n.v).normalize();
    const w = raySolids(n.p, _d, L);
    let hit = null;
    for (const e of entsFor('P')) { if (!e.alive || e.isBarrel || e.isMine || !e.c) continue; if (e.c.distanceTo(n.p) < (e.r || 1.5) + 1.3) { hit = e; break; } }
    if (hit) { netHit(hit, n); n.t = 0; }
    else if (w.solid || n.t <= 0) { G.fx.sparks(n.p, null, 6, 0x80ffc0, 8, 0.8, 0.3, 0.2); n.t = 0; }
    else n.p.addScaledVector(n.v, dt);
    n.m.position.copy(n.p); n.m.scale.setScalar(Math.min(1.4, n.m.scale.x + dt * 2.2)); n.m.rotation.x += dt * 6; n.m.rotation.y += dt * 4;
    if (n.t <= 0) { n.m.parent && n.m.parent.remove(n.m); n.m.material.dispose(); G.nets.splice(i, 1); }
  }
}
export function clearNets() { for (const n of G.nets) { n.m.parent && n.m.parent.remove(n.m); } G.nets.length = 0; }

// ------------------------------------------------------------------ v50 Sabotage: four enemy power pylons that only demolition
// charges can bring down (you plant them, ground enemies try to defuse them), revivers that rebuild wrecks into enemies,
// and the OC-1 optical camo
export const CAMO = { see: 10, bossSee: 16, grace: 0.8, dmg: 1.5 };
G.camo = null; G.wrecks = [];
export function camoHidden(from, self) {
  const C = G.camo, P = G.player; if (!C || !(C.t > 0) || !P || !P.alive || !from) return false;
  const big = self && (self.kind === 'boss' || self.kind === 'raider' || self.isColossus);
  return Math.hypot(P.pos.x - from.x, P.pos.z - from.z) > (big ? CAMO.bossSee : CAMO.see);
}
function camoMats(P, on) {
  if (on && !P._cm) { P._cm = []; P.root.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) { const m = o.material.clone(); m.transparent = true; m.depthWrite = false; m.opacity = 0.16; if (m.emissive) { m.emissive.setHex(0x3aa8d8); m.emissiveIntensity = 0.5; } P._cm.push([o, o.material, m, o.castShadow]); } }); }
  if (!P._cm) return;
  for (const [o, m0, m1, cs] of P._cm) { o.material = on ? m1 : m0; o.castShadow = on ? false : cs; }
}
function fireCamo(owner, d) {
  const P = owner, at = P.pos.clone();
  const C = G.camo = { t: d.dur, revT: -1, T: d.dur };
  C.ghost = { isCamoGhost: true, pos: at, vel: new V3(), get alive() { return G.camo === C && C.t > 0; }, center: (o) => o.set(at.x, at.y + 2.6 * P.scale, at.z), foeW: 1, foeWAir: 1, foeWBoss: 1 };
  G.friends.push(C.ghost);
  for (const e of G.enemies) e.tgT = 0;
  for (const sh of G.shots) if (sh.team === 'E' && sh.target && sh.target.isPlayer) { sh.target = null; G.camoLost = (G.camoLost || 0) + 1; }
  camoMats(P, true);
  G.fx.ring(new V3(at.x, at.y + 0.3, at.z), null, 1, 7, 0.4, 0x60d8ff); G.fx.sparks(P.center(new V3()), null, 16, 0x9ff0ff, 10, 1, 0.4, 0.2);
  sfx('decoy', 0); G.camoUses = (G.camoUses || 0) + 1; G.onCamo && G.onCamo(true);
}
function endCamo() {
  const C = G.camo; if (!C) return;
  const i = G.friends.indexOf(C.ghost); if (i >= 0) G.friends.splice(i, 1);
  G.camo = null; for (const e of G.enemies) e.tgT = 0;
  if (G.player) { camoMats(G.player, false); G.fx.sparks(G.player.center(new V3()), null, 12, 0x9ff0ff, 8, 1, 0.3, 0.2); }
  G.onCamo && G.onCamo(false);
}
function updateCamo(dt) {
  const C = G.camo; if (!C) return;
  const P = G.player; if (!P || !P.alive) { endCamo(); return; }
  C.t -= dt; G.camoT = (G.camoT || 0) + dt;
  if (C.revT >= 0) { C.revT -= dt; if (C.revT <= 0) C.t = 0; }
  if (C.t <= 0) { endCamo(); return; }
  if (P._cm) { const op = C.revT >= 0 ? 0.35 + 0.3 * Math.abs(Math.sin(G.time * 30)) : 0.12 + 0.06 * Math.sin(G.time * 7); for (const r of P._cm) r[2].opacity = op; }
}
export function clearCamo() { if (G.camo) endCamo(); G.camo = null; }

// ---- wrecks: an enemy that dies near a reviver leaves a wreck for 26 s. it can be shot / blasted apart (160 HP)
export const REVIVE = { hp: 950, r: 2.6, speed: 10, hover: 8, keep: 46, scan: 110, near: 110, chan: 3, interrupt: 170, cd: 2.5, max: 4, gunCd: 2.6, gunR: 60, dmg: 9, hpK: 0.6, wreckHp: 160, wreckT: 26, maxWrecks: 10 };
const REV_MAKE = { walker: (p) => new Walker(p), drone: (p) => new Drone(p), bulwark: (p) => new Bulwark(p), gunship: (p) => new Gunship(p), weaver: (p) => new Weaver(p), turret: (p) => new Turret(p), frost: (p) => new Frostcaster(p), leaper: (p) => new Leaper(p), torcher: (p) => new Torcher(p), anchor: (p) => new Anchor(p), howitzer: (p) => new Howitzer(p), prism: (p) => new Prism(p), skimmer: (p) => new Skimmer(p), blinker: (p) => new Blinker(p) };
export function noteWreck(e) {
  if (!e || e.revived || !REV_MAKE[e.kind] || !e.c) return;
  if (!G.enemies.some((r) => r.kind === 'reviver' && r.alive && !r.dying && r.c.distanceTo(e.c) < REVIVE.near)) return;
  if (G.wrecks.length >= REVIVE.maxWrecks) removeWreck(G.wrecks[0]);
  const x = e.c.x, z = e.c.z, y = groundAt(x, z, e.c.y + 1);
  const obj = cloneKit('P_Hulk'); obj.scale.setScalar(0.34); obj.position.set(x, y, z); obj.rotation.y = Math.random() * 6.28; G.scene.add(obj);
  const w = { kind: e.kind, x, z, y, hp: REVIVE.wreckHp * G.diff.hp, t: REVIVE.wreckT, obj, alive: true, claim: null, smokeT: 0 };
  w.ent = { isBarrel: true, isWreck: true, w, c: new V3(x, y + 1, z), r: 2.4, get alive() { return w.alive; }, hit: (dmg) => { if (!w.alive) return; w.hp -= dmg; if (w.hp <= 0) { G.wrecksBroken = (G.wrecksBroken || 0) + 1; G.fx.sparks(w.ent.c.clone(), null, 18, 0xffb060, 12, 1, 0.4, 0.2); G.fx.explosion(w.ent.c.clone(), 0.9, 0xff8040); removeWreck(w); } } };
  G.wrecks.push(w); G.wrecksMade = (G.wrecksMade || 0) + 1;
}
function removeWreck(w) {
  w.alive = false; w.obj.parent && w.obj.parent.remove(w.obj);
  const i = G.wrecks.indexOf(w); if (i >= 0) G.wrecks.splice(i, 1);
}
function updateWrecks(dt) {
  for (let i = G.wrecks.length - 1; i >= 0; i--) {
    const w = G.wrecks[i]; w.t -= dt;
    if (w.claim && (!w.claim.alive || w.claim.dying || w.claim.wreck !== w)) w.claim = null;
    if (w.t <= 0) { removeWreck(w); continue; }
    if (w.t < 2) w.obj.scale.setScalar(0.34 * Math.max(0.05, w.t / 2));
    w.smokeT -= dt; if (w.smokeT <= 0) { w.smokeT = 0.5 + Math.random() * 0.4; G.fx.smoke(new V3(w.x + (Math.random() - 0.5) * 2, w.y + 1.2, w.z + (Math.random() - 0.5) * 2), 1, 1, 1.5, 0x2c2a28, 1.4, 0.8); }
  }
}
export function clearWrecks() { for (const w of [...G.wrecks]) removeWreck(w); G.wrecks.length = 0; }

// Reviver: a slow hover barge. it keeps ~46 m from you behind its allies; when a wreck lies within 110 m it flies over it
// and pours nanites down for 3 s (green beam), then the wreck stands up again as the same enemy at 60% HP. 170 damage
// during the pour breaks it off; four rebuilds and it is spent. a pulse gun for self-defence
export class Reviver extends Enemy {
  constructor(pos) {
    super('reviver', 'E_Reviver', pos, REVIVE.hp, REVIVE.r); this.boom = 1.1;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.st = 'idle'; this.wreck = null; this.chanT = 0; this.chanDmg = 0; this.cdT = 1.5 + Math.random() * 2;
    this.left = REVIVE.max; this.gunT = 2 + Math.random(); this.side = Math.random() < 0.5 ? 1 : -1; this.orbA = Math.random() * 6.28; this.goalV = new V3(); this.zapT = 0; this.bank = 0; this.climbT = 0;
    this.pos.y = groundAt(pos.x, pos.z, 40) + REVIVE.hover; this.c.copy(this.pos);
  }
  hit(dmg) {
    if (this.st === 'chan') this.chanDmg += dmg;
    super.hit(dmg);
    if (this.alive && this.st === 'chan' && this.chanDmg >= REVIVE.interrupt * G.diff.hp) {
      this.st = 'idle'; this.cdT = REVIVE.cd; if (this.wreck) this.wreck.claim = null; this.wreck = null;
      G.fx.sparks(this.c, null, 16, 0x40ff80, 12, 1, 0.35, 0.2); G.reviveBreaks = (G.reviveBreaks || 0) + 1; G.onReviveBreak && G.onReviveBreak(this);
    }
  }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC);
    this.cdT -= dt;
    if (this.n.RV_Ring) this.n.RV_Ring.rotation.y += dt * (this.st === 'chan' ? 5 : 1.4);
    let goal = null, face = null;
    const w = this.wreck;
    if ((this.st === 'go' || this.st === 'chan') && (!w || !w.alive)) { this.st = 'idle'; this.wreck = null; this.cdT = 1; }
    if (this.st === 'idle' && this.cdT <= 0 && this.left > 0) {
      let best = null, bd = REVIVE.scan;
      for (const k of G.wrecks) { if (!k.alive || k.claim || k.t < 4) continue; const d = Math.hypot(k.x - this.pos.x, k.z - this.pos.z); if (d < bd) { bd = d; best = k; } }
      if (best) { this.st = 'go'; this.wreck = best; best.claim = this; G.onReviveGo && G.onReviveGo(this, best); }
      else this.cdT = 0.8;
    }
    if (this.st === 'go') {
      const k = this.wreck; goal = this.goalV.set(k.x, 0, k.z);
      if (Math.hypot(k.x - this.pos.x, k.z - this.pos.z) < 3.5) { this.st = 'chan'; this.chanT = REVIVE.chan; this.chanDmg = 0; k.t = Math.max(k.t, REVIVE.chan + 1); G.onReviveStart && G.onReviveStart(this, k); }
    }
    if (this.st === 'chan') {
      const k = this.wreck; goal = this.goalV.set(k.x, 0, k.z);
      this.chanT -= dt; this.zapT -= dt;
      if (this.zapT <= 0) {
        this.zapT = 0.07; const em = this.n.RV_Emit ? this.n.RV_Emit.getWorldPosition(new V3()) : this.c.clone();
        G.fx.lightning(em, new V3(k.x + (Math.random() - 0.5) * 2, k.y + 0.8, k.z + (Math.random() - 0.5) * 2), 0x40ff80, 0.25 + (1 - this.chanT / REVIVE.chan) * 0.35, 0.1, 1.2);
      }
      if (Math.random() < 0.6) G.fx.emit('add', { x: k.x + (Math.random() - 0.5) * 3, y: k.y + 0.4, z: k.z + (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 3, life: 0.6, s0: 0.9, s1: 0.2, c0: 0x50ff90 });
      k.obj.position.y = k.y + (1 - this.chanT / REVIVE.chan) * 0.8; k.obj.rotation.y += dt * 0.6;
      if (this.chanT <= 0) {
        const at = new V3(k.x, k.y, k.z), kind = k.kind; removeWreck(k); this.wreck = null; this.st = 'idle'; this.cdT = REVIVE.cd; this.left--;
        const e = REV_MAKE[kind](at); e.revived = true; e.hp = e.maxHp * REVIVE.hpK;
        G.fx.ring(new V3(at.x, at.y + 0.4, at.z), null, 1, 8, 0.45, 0x50ff90); G.fx.flash(new V3(at.x, at.y + 2, at.z), 0x60ff90, 40, 20, 0.35);
        sfx('repair', G.player ? G.player.pos.distanceTo(at) * 0.6 : 0); G.revived = (G.revived || 0) + 1; G.onRevived && G.onRevived(e, this);
      }
    }
    if (!goal) {   // hang back behind the nearest allies, ~46 m from the target
      let mx = 0, mz = 0, n = 0;
      for (const e of G.enemies) if (e !== this && e.alive && !e.dying && e.kind !== 'reviver' && e.c && e.c.distanceTo(this.pos) < 80) { mx += e.c.x; mz += e.c.z; n++; }
      let ax, az; if (n) { ax = mx / n; az = mz / n; } else { ax = this.pos.x; az = this.pos.z; }
      let dx = ax - pc.x, dz = az - pc.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      this.orbA += dt * 0.3 * this.side;
      goal = this.goalV.set(pc.x + dx * REVIVE.keep + Math.cos(this.orbA) * 8, 0, pc.z + dz * REVIVE.keep + Math.sin(this.orbA) * 8);
      face = pc;
    }
    const gx = goal.x - this.pos.x, gz = goal.z - this.pos.z, gl = Math.hypot(gx, gz) || 1;
    const sp = REVIVE.speed * Math.min(1, gl / 8 + 0.2) * (this.st === 'chan' ? 0.3 : 1), kk = 1 - Math.exp(-2 * dt);
    this.vel.x += (gx / gl * sp - this.vel.x) * kk; this.vel.z += (gz / gl * sp - this.vel.z) * kk;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 2.2, 2.5)) { this.pos.x -= this.vel.x * dt; this.pos.z -= this.vel.z * dt; this.vel.multiplyScalar(-0.3); this.side *= -1; this.climbT = 2.5; }
    if (this.climbT > 0) this.climbT -= dt;
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) + REVIVE.hover + (this.climbT > 0 ? 16 : 0) + Math.sin(G.time * 1.8 + this.side) * 0.35;
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-2.5 * dt));
    const ny = face ? Math.atan2(-(face.x - this.pos.x), -(face.z - this.pos.z)) : Math.hypot(this.vel.x, this.vel.z) > 1 ? Math.atan2(-this.vel.x, -this.vel.z) : this.yaw;
    const turn = angDiff(ny, this.yaw); this.yaw += turn * Math.min(1, dt * 3);
    this.bank += (Math.max(-0.3, Math.min(0.3, -turn * 1.5)) - this.bank) * Math.min(1, dt * 3);
    this.obj.rotation.set(0, this.yaw, this.bank, 'YXZ');
    this.c.copy(this.pos);
    this.gunT -= dt;
    if (this.st !== 'chan' && this.gunT <= 0 && pc.distanceTo(this.pos) < REVIVE.gunR && this.checkLos(dt)) {
      this.gunT = REVIVE.gunCd;
      for (let i = 0; i < 3; i++) G.queue.push({ t: i * 0.15, label: 'reviver-gun', fn: () => {
        if (!this.alive) return;
        const mp = this.n.Muzzle_RvGun ? this.n.Muzzle_RvGun.getWorldPosition(new V3()) : this.c.clone();
        const aim = lead(mp, 120, _b, tg); _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.05; _d.normalize();
        spawnShot({ p: mp, v: _d.clone().multiplyScalar(120), dmg: REVIVE.dmg, team: 'E', kind: 'ebullet', color: 0x70ff90, w: 0.22, len: 3, life: 0.6, label: 'reviver-gun' });
      } });
    }
  }
}

// ---- the four pylons. stand within 7.5 m of one (below 7 m) for 2.5 s to plant a charge (22 s fuse); up to two ground enemies
// are sent to each charge and defuse it in 4 s (3.2 s with two). a charge that goes off fells the pylon and blasts 15 m around it. destroy all four
// before the enemy orbital gun finishes charging (330 s)
export const SABOT = { sites: [[-66, -46], [70, -38], [60, 58], [-58, 54]], R: 5, plantR: 7.5, plantT: 2.5, fuse: 22, defR: 6, defT: 4, blast: 15, blastDmg: 110, limit: 260, defKinds: ['walker', 'bulwark', 'prism'] };
const sabZoneGeo = new THREE.RingGeometry(SABOT.plantR - 0.4, SABOT.plantR, 64), sabProgGeo = new THREE.RingGeometry(SABOT.plantR - 1.4, SABOT.plantR - 0.6, 64, 1, 0, Math.PI * 2);
export function startSabot() {
  clearSabot();
  const S = G.sabot = { gens: [], charges: [], t: SABOT.limit, done: 0, lost: false, defT: 0 };
  for (const [sx, sz] of SABOT.sites) {
    let x = sx, z = sz;
    for (let i = 0; i < 500; i++) {
      const a = i * 2.4, r = Math.sqrt(i) * 2.2; x = sx + Math.cos(a) * r; z = sz + Math.sin(a) * r;
      if (groundAt(x, z, 60) < 0.6 && !collideCyl(new V3(x, 0.5, z), 11, 3)) break;
    }
    const obj = cloneKit('E_Pylon'); obj.position.set(x, 0, z); obj.rotation.y = Math.random() * 6.28; G.scene.add(obj);
    obj.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'PylonGlow' && !o.material._sab) { o.material._sab = true; o.material.color.setHex(0xff5a3a); if (o.material.emissive) o.material.emissive.setHex(0xff2a10); } });
    const zone = new THREE.Mesh(sabZoneGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    zone.rotation.x = -Math.PI / 2; zone.position.set(x, 0.35, z); G.scene.add(zone);
    const prog = new THREE.Mesh(sabProgGeo, new THREE.MeshBasicMaterial({ color: 0x60e8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    prog.rotation.x = -Math.PI / 2; prog.position.set(x, 0.4, z); prog.visible = false; G.scene.add(prog);
    S.gens.push({ obj, zone, prog, x, z, alive: true, k: 0, charge: null, n: nodes(obj), sol: addSolid(x, z, 6.4, 6.4, 10.5, 0, 'pylon') });
  }
}
export function clearSabot() {
  const S = G.sabot; if (!S) return;
  for (const g of S.gens) { for (const o of [g.obj, g.zone, g.prog]) o.parent && o.parent.remove(o); g.zone.material.dispose(); g.prog.material.dispose(); removeSolid(g.sol); }
  for (const c of S.charges) removeCharge(c);
  for (const e of G.enemies) if (e.sabC) { e.goalP = null; e.sabC = null; }
  G.sabot = null;
}
function sabPlant(g, from) {
  const S = G.sabot;
  let dx = from.x - g.x, dz = from.z - g.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const x = g.x + dx * (SABOT.R + 0.3), z = g.z + dz * (SABOT.R + 0.3);
  const obj = new THREE.Group(); obj.add(new THREE.Mesh(chGeo, chMat)); obj.children[0].position.y = 1.4;
  const light = new THREE.Mesh(chLightGeo, new THREE.MeshBasicMaterial({ color: 0xff2010 })); light.position.y = 1.75; obj.add(light);
  obj.position.set(x, 0, z); obj.rotation.y = Math.atan2(dx, dz); G.scene.add(obj);
  const ring = new THREE.Mesh(chRingGeo, new THREE.MeshBasicMaterial({ color: 0x60e8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  ring.scale.setScalar(SABOT.defR / DEPOT.defR); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.45, z); G.scene.add(ring);
  const c = { obj, light, ring, x, z, p: new V3(x, 0, z), t: SABOT.fuse, gen: g, k: 0, beepT: 0, camo: !!(G.camo && G.camo.t > 0) };
  S.charges.push(c); g.charge = c; G.sabPlanted = (G.sabPlanted || 0) + 1; if (c.camo) G.sabCamoPlant = (G.sabCamoPlant || 0) + 1;
  sfx('repair', 0); G.onSabPlant && G.onSabPlant(g, c);
}
function sabDrop(c) {
  removeCharge(c); const S = G.sabot; const i = S.charges.indexOf(c); if (i >= 0) S.charges.splice(i, 1);
  if (c.gen.charge === c) c.gen.charge = null;
  for (const e of G.enemies) if (e.sabC === c) { e.goalP = null; e.sabC = null; }
}
function sabGround(e) { return e.pos && e.alive && !e.dying && !e.hacked && SABOT.defKinds.includes(e.kind) && e.pos.y - groundAt(e.pos.x, e.pos.z, e.pos.y + 1) < 4; }
function updateSabot(dt) {
  const S = G.sabot, P = G.player; if (!S) return;
  if (S.gens.some((g) => g.alive)) { S.t -= dt; if (S.t <= 0 && !S.lost) { S.t = 0; S.lost = true; } }
  for (const g of S.gens) {
    if (!g.alive) { if (Math.random() < 0.4) G.fx.smoke(new V3(g.x + (Math.random() - 0.5) * 4, 4, g.z + (Math.random() - 0.5) * 4), 1, 2.5, 3, 0x2a2624, 2.4, 1.2); continue; }
    if (g.n.PY_Ring) g.n.PY_Ring.rotation.y += dt * 1.2;
    const near = !g.charge && P && P.alive && Math.hypot(P.pos.x - g.x, P.pos.z - g.z) < SABOT.plantR + 0.5 && P.pos.y - groundAt(P.pos.x, P.pos.z, P.pos.y + 1) < 7;
    g.k = near ? g.k + dt / SABOT.plantT : Math.max(0, g.k - dt);
    g.prog.visible = g.k > 0; g.prog.scale.setScalar(0.25 + 0.75 * Math.min(1, g.k)); g.prog.material.opacity = 0.5 + 0.4 * Math.min(1, g.k);
    g.zone.material.color.setHex(g.charge ? 0xff4030 : near ? 0x60e8ff : 0xffa040);
    g.zone.material.opacity = g.charge ? 0.25 : 0.4 + 0.2 * Math.sin(G.time * 3);
    if (g.k >= 1) { g.k = 0; g.prog.visible = false; sabPlant(g, P.pos); }
  }
  S.defT -= dt;
  if (S.defT <= 0 && S.charges.length) {   // send up to three nearby ground enemies to each live charge
    S.defT = 1.2;
    for (const c of S.charges) {
      let n = G.enemies.filter((e) => e.sabC === c && e.alive && !e.dying).length;
      if (n >= 2) continue;
      const cand = G.enemies.filter((e) => sabGround(e) && !e.sabC && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < 75).sort((a, b) => Math.hypot(a.pos.x - c.x, a.pos.z - c.z) - Math.hypot(b.pos.x - c.x, b.pos.z - c.z));
      for (const e of cand) { if (n >= 2) break; e.sabC = c; e.goalP = c.p; e.goalR = 2.5; n++; }
    }
  }
  for (let i = S.charges.length - 1; i >= 0; i--) {
    const c = S.charges[i];
    let nd = 0; for (const e of G.enemies) if (sabGround(e) && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < SABOT.defR) nd++;
    c.k = nd ? c.k + dt / SABOT.defT * Math.min(1.25, 0.75 + 0.25 * nd) : Math.max(0, c.k - dt * 0.4);
    c.ring.material.color.setHex(c.k > 0 ? 0xffd040 : 0x60e8ff); c.ring.scale.setScalar(SABOT.defR / DEPOT.defR * (1 - 0.55 * c.k));
    if (c.k >= 1) {
      sabDrop(c); G.sabDefused = (G.sabDefused || 0) + 1;
      G.fx.sparks(new V3(c.x, 1.5, c.z), null, 18, 0xffd040, 10, 1, 0.4, 0.2); sfx('alarm', P ? P.pos.distanceTo(c.p) * 0.4 : 0); G.onSabDefuse && G.onSabDefuse(c);
      continue;
    }
    c.t -= dt; c.beepT -= dt;
    const urg = Math.max(0, c.t / SABOT.fuse);
    if (c.beepT <= 0) { c.beepT = 0.12 + 0.9 * urg; c.light.material.color.setHex(0xff2010); sfx('minebeep', P ? P.pos.distanceTo(c.obj.position) : 0); }
    else if (c.beepT < 0.06 + 0.5 * urg) c.light.material.color.setHex(0x301008);
    c.ring.material.opacity = 0.45 + 0.35 * Math.abs(Math.sin(G.time * (4 + 14 * (1 - urg))));
    if (c.t <= 0) {
      const g = c.gen; sabDrop(c);
      const at = new V3(c.x, 1.5, c.z); G.curLabel = 'sabot-charge'; explodeAt(at, SABOT.blast, SABOT.blastDmg, 'X', 2.6, 0xff6020);
      g.alive = false; S.done++; removeSolid(g.sol); g.sol = addSolid(g.x, g.z, 6.4, 6.4, 3.4, 0, 'pylon');
      g.obj.scale.set(1.08, 0.36, 1.08); g.obj.rotation.z = 0.1; g.zone.visible = false; g.prog.visible = false;
      const hc = new V3(g.x, 6, g.z); G.fx.explosion(hc, 3.4, 0xff5020); G.fx.flash(hc, 0xff8040, 140, 70, 0.6); G.fx.trauma = Math.min(1, G.fx.trauma + 0.5);
      sfx('bigboom', P ? P.pos.distanceTo(hc) * 0.5 : 0); G.onGenDown && G.onGenDown(g);
    }
  }
}
export function sabTarget(from) {   // the nearest pylon still standing that has no charge on it
  const S = G.sabot; if (!S) return null; let best = null, bd = 1e9;
  for (const g of S.gens) { if (!g.alive || g.charge) continue; const d = Math.hypot(g.x - from.x, g.z - from.z); if (d < bd) { bd = d; best = g; } }
  return best;
}

// ------------------------------------------------------------------ v51 Decapitation: the enemy commander hides among three
// holographic lookalikes inside jamming shrouds; scan them up close to find the real one, then stop it before it reaches
// its extraction ship. Dazzlers blind you if you are looking at them when they strobe. The LK-3 link beacon shares damage
export const DAZZ = { hp: 520, r: 2.3, hover: 11, keep: [24, 40], speed: 11, cd: [6.5, 9], charge: 1.1, range: 50, cone: 0.643, blind: 2.8, gunCd: 2.6, gunR: 70, dmg: 8 };
G.dazzleT = 0;
export class Dazzler extends Enemy {
  constructor(pos) {
    super('dazzler', 'E_Dazzler', pos, DAZZ.hp, DAZZ.r); this.boom = 1.0;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.st = 'idle'; this.cdT = 3 + Math.random() * 3; this.chT = 0; this.gunT = 1.5 + Math.random();
    this.side = Math.random() < 0.5 ? 1 : -1; this.goalV = new V3(); this.bank = 0; this.climbT = 0; this.open = 0; this.autoR = false;
    this.pos.y = groundAt(pos.x, pos.z, 40) + DAZZ.hover; this.c.copy(this.pos);
    this.lens = null; this.obj.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'DazzleLens') { if (!this.lens) this.lens = o.material.clone(); o.material = this.lens; } });
  }
  lensPos(out) { return this.n.DZ_Lens ? this.n.DZ_Lens.getWorldPosition(out) : out.copy(this.c); }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC), P = G.player;
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    const los = this.checkLos(dt);
    this.cdT -= dt;
    if (this.st === 'idle' && this.cdT <= 0) {
      if (P && P.alive && tg === P && this.c.distanceTo(pc) < DAZZ.range * 0.92 && los) { this.st = 'charge'; this.chT = DAZZ.charge; this.autoR = Math.random() < 0.6; sfx('charge', dist * 0.5); G.onDazzleCharge && G.onDazzleCharge(this); }
      else this.cdT = 0.6;
    }
    if (this.st === 'charge') {
      this.chT -= dt; const k = 1 - Math.max(0, this.chT) / DAZZ.charge;
      if (this.lens && this.lens.emissive) this.lens.emissiveIntensity = 1 + k * 9;
      if (Math.random() < 0.5) { const lp = this.lensPos(_a); G.fx.emit('add', { x: lp.x, y: lp.y, z: lp.z, vy: 0, life: 0.12, s0: 1.2 + k * 3, s1: 0.4, c0: 0xffffff }); }
      if (this.chT <= 0) {
        const lp = this.lensPos(new V3());
        G.fx.flash(lp, 0xffffff, 140, 70, 0.3); G.fx.ring(lp, null, 0.5, 9, 0.25, 0xffffff); sfx('shieldbreak', dist * 0.4);
        if (P && P.alive && lp.distanceTo(P.center(_c)) < DAZZ.range && clearLine(P.center(_c), lp)) {
          const cy = G.camYaw ?? P.aimYaw ?? 0, cp = G.camPitch ?? 0;
          _b.set(-Math.sin(cy) * Math.cos(cp), Math.sin(cp), -Math.cos(cy) * Math.cos(cp));
          _d.subVectors(lp, P.center(_c)).normalize();
          if (_b.dot(_d) > DAZZ.cone) { G.dazzleT = Math.max(G.dazzleT || 0, DAZZ.blind); G.dazzled = (G.dazzled || 0) + 1; G.lockTarget = null; G.locks.length = 0; for (const sh of G.shots) if (sh.team === 'P' && sh.target) sh.target = null; G.onDazzle && G.onDazzle(this); }
          else G.dazzleDodge = (G.dazzleDodge || 0) + 1;
        }
        this.st = 'idle'; this.cdT = DAZZ.cd[0] + Math.random() * (DAZZ.cd[1] - DAZZ.cd[0]);
      }
    } else if (this.lens && this.lens.emissive) this.lens.emissiveIntensity += (1 - this.lens.emissiveIntensity) * Math.min(1, dt * 4);
    this.open += ((this.st === 'charge' ? 1 : 0) - this.open) * Math.min(1, dt * 6);
    for (let i = 1; i <= 4; i++) { const pt = this.n['DZ_Petal' + i]; if (pt) pt.rotation.x = this.open * 0.95; }
    if (this.n.DZ_Ring) this.n.DZ_Ring.rotation.y += dt * (this.st === 'charge' ? 9 : 2);
    // orbit the target at 24-40 m
    const H = this.home, far = H && Math.hypot(pc.x - H.x, pc.z - H.z) > 70, ox = far ? H.x : pc.x, oz = far ? H.z : pc.z;   // a guard dazzler stays by its post
    const want = far ? 14 : Math.max(DAZZ.keep[0], Math.min(DAZZ.keep[1], dist)), a = far ? G.time * 0.3 * this.side : Math.atan2(-dz, -dx) + this.side * 0.45;
    const goal = this.goalV.set(ox + Math.cos(a) * want, 0, oz + Math.sin(a) * want);
    const gx = goal.x - this.pos.x, gz = goal.z - this.pos.z, gl = Math.hypot(gx, gz) || 1;
    const sp = DAZZ.speed * Math.min(1, gl / 6 + 0.15) * (this.st === 'charge' ? 0.15 : 1), kk = 1 - Math.exp(-2.2 * dt);
    this.vel.x += (gx / gl * sp - this.vel.x) * kk; this.vel.z += (gz / gl * sp - this.vel.z) * kk;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 2, 2.4)) { this.pos.x -= this.vel.x * dt; this.pos.z -= this.vel.z * dt; this.vel.multiplyScalar(-0.3); this.side *= -1; this.climbT = 2.5; }
    if (this.climbT > 0) this.climbT -= dt;
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) + DAZZ.hover + (this.climbT > 0 ? 14 : 0) + Math.sin(G.time * 2.1 + this.side) * 0.4;
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-2.5 * dt));
    const ny = Math.atan2(-(pc.x - this.pos.x), -(pc.z - this.pos.z)), turn = angDiff(ny, this.yaw); this.yaw += turn * Math.min(1, dt * 3);
    this.bank += (Math.max(-0.3, Math.min(0.3, -turn * 1.5)) - this.bank) * Math.min(1, dt * 3);
    this.obj.rotation.set(Math.max(-0.5, Math.min(0.5, Math.atan2(pc.y - this.pos.y, dist))), this.yaw, this.bank, 'YXZ');
    this.c.copy(this.pos);
    this.gunT -= dt;
    if (this.st === 'idle' && this.gunT <= 0 && dist < DAZZ.gunR && los) {
      this.gunT = DAZZ.gunCd;
      for (let i = 0; i < 3; i++) G.queue.push({ t: i * 0.14, label: 'dazzler-gun', fn: () => {
        if (!this.alive) return;
        const mp = this.n.Muzzle_Dazz ? this.n.Muzzle_Dazz.getWorldPosition(new V3()) : this.c.clone();
        const aim = lead(mp, 120, _b, this.tg()); _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.05; _d.normalize();
        spawnShot({ p: mp, v: _d.clone().multiplyScalar(120), dmg: DAZZ.dmg, team: 'E', kind: 'ebullet', color: 0xfff2b0, w: 0.22, len: 3, life: 0.7, label: 'dazzler-gun' });
      } });
    }
  }
}

// ---- the commanders. one is real (5600 HP), three are holographic decoys (1600 HP). until identified each sits in a
// jamming shroud and takes 15% damage. stand within 30 m with a clear line for 3.5 s to scan one (a sonar mark, or knocking
// it to 50%, also exposes it). a decoy collapses and pops; the real one runs for the extraction ship (lands 28 s after
// the reveal, 7 s to board)
export const DECAP = { sites: [[-70, -54], [76, -42], [64, 64], [-62, 58]], pads: [[0, -142], [144, 4], [-142, 10], [8, 142]], scanR: 30, scanT: 3.5, shroud: 0.15, hp: 5600, decoyHp: 1600, exposeK: 0.5, alertAt: 210, board: 7, guardK: 0.5, shipH: 10, flee: 0.35, gunK: 0.6, shipT: 28 };
const dcZoneGeo = new THREE.RingGeometry(DECAP.scanR - 0.5, DECAP.scanR, 72), dcProgGeo = new THREE.RingGeometry(4.6, 5.6, 48), dcShroudGeo = new THREE.IcosahedronGeometry(1, 2);
const dcPadGeo = new THREE.RingGeometry(7, 8, 56), dcBeamGeo = new THREE.CylinderGeometry(1.6, 1.6, 120, 16, 1, true);
export class Marshal extends Enemy {
  constructor(pos, real) {
    super('marshal', 'E_Marshal', pos, real ? DECAP.hp : DECAP.decoyHp, 3.6); this.boom = 2.2; this.obj.scale.setScalar(1.45);
    this.real = real; this.known = false; this.shroud = true; this.scanK = 0; this.st = 'hold'; this.guarded = false;
    this.vel = new V3(); this.ph = Math.random() * 6; this.strafe = Math.random() < 0.5 ? 1 : -1; this.stT = 3; this.yaw = Math.random() * 6.28;
    for (const [a, b] of [['E_WBody', 'MS_Body'], ['E_WGun', 'MS_Gun'], ['Muzzle_Walker', 'Muzzle_Marshal']]) this.n[a] = this.n[b];
    for (let i = 1; i <= 4; i++) { this.n['E_Leg' + i] = this.n['MS_Leg' + i]; this.n['E_Knee' + i] = this.n['MS_Knee' + i]; }
    this.sh = new THREE.Mesh(dcShroudGeo, new THREE.MeshBasicMaterial({ color: 0xb070ff, transparent: true, opacity: 0.14, wireframe: true, depthWrite: false, fog: false })); this.sh.scale.setScalar(6.2); G.scene.add(this.sh);
    this.zone = new THREE.Mesh(dcZoneGeo, new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, fog: false })); this.zone.rotation.x = -Math.PI / 2; G.scene.add(this.zone);
    this.prog = new THREE.Mesh(dcProgGeo, new THREE.MeshBasicMaterial({ color: 0x60e8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false })); this.prog.rotation.x = -Math.PI / 2; this.prog.visible = false; G.scene.add(this.prog);
    this.c.set(pos.x, pos.y + 3.5, pos.z);
  }
  hit(dmg) {
    super.hit(dmg);
    if (this.alive && this.real && this.known && !this.guarded && this.hp < this.maxHp * DECAP.guardK) { this.guarded = true; G.onVipGuard && G.onVipGuard(this); }
  }
  die() { this.dropFx(); super.die(); }
  dropFx() { for (const o of [this.sh, this.zone, this.prog]) o.parent && o.parent.remove(o); }
  holo(on) {
    if (on && !this._hm) { unflash(this); this._hm = []; this.obj.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) { const m = o.material.clone(); m.transparent = true; m.depthWrite = false; m.opacity = 0.4; if (m.emissive) { m.emissive.setHex(0xa060ff); m.emissiveIntensity = 1.2; } this._hm.push(m); o.material = m; o.castShadow = false; } }); }
  }
  update(dt) {
    if (this.st === 'fade') {
      this.fadeT -= dt; const op = (0.15 + 0.35 * Math.abs(Math.sin(G.time * 40))) * Math.max(0.1, this.fadeT / 1.1);
      if (this._hm) for (const m of this._hm) m.opacity = op;
      this.obj.scale.set(1.45 * (1 + (1.1 - this.fadeT) * 0.15), 1.45 * Math.max(0.2, this.fadeT / 1.1), 1.45 * (1 + (1.1 - this.fadeT) * 0.15));
      if (Math.random() < 0.5) G.fx.sparks(this.c, null, 3, 0xb070ff, 8, 1, 0.3, 0.2);
      if (this.fadeT <= 0) {
        G.curLabel = 'decoy-pop'; G.curShooter = null; explodeAt(this.c.clone(), 9, 30, 'E', 1.4, 0xb070ff);
        const at = this.pos.clone(); this.dropFx(); this.alive = false; this.dying = true; this.remove(); G.onDecoyPop && G.onDecoyPop(at);
      }
      return;
    }
    if (this.st === 'board') {
      this.boardT -= dt; this.c.set(this.pos.x, this.pos.y + 3.5, this.pos.z);
      const S = G.decap;
      if (S && S.ship && Math.random() < 0.6) G.fx.lightning(S.ship.obj.position.clone().add(new V3(0, -2, 0)), this.c.clone().add(new V3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), 0xff6040, 0.3, 0.08, 1);
      this.pos.y += dt * 0.25 * (DECAP.board - this.boardT > 3 ? 1 : 0);
      if (this.boardT <= 0) { this.dropFx(); this.alive = false; this.dying = true; this.remove(); if (S) { S.lost = true; S.escaped = true; } G.onVipEscape && G.onVipEscape(this); }
      return;
    }
    Walker.prototype.update.call(this, dt);
    if (this.st === 'flee') {
      this.pos.x += this.vel.x * dt * DECAP.flee; this.pos.z += this.vel.z * dt * DECAP.flee;
      if (collideCyl(this.pos, 2.8, 4)) blockedSlide(this);
      const pd = this.goalP, at = pd && Math.hypot(pd.x - this.pos.x, pd.z - this.pos.z) < 10; if (pd) this.goalR = at || this.goalR === 8 ? 8 : 4;   // waits by the pad until the ship is down
      if (at && G.decap && G.decap.shipT <= 0) { this.st = 'board'; this.boardT = DECAP.board; G.vipBoarded = true; G.onVipBoard && G.onVipBoard(this); }
    }
    this.c.set(this.pos.x, this.pos.y + 3.5, this.pos.z);
    this.sh.visible = this.shroud; if (this.shroud) { this.sh.position.copy(this.c); this.sh.rotation.y += dt * 0.4; this.sh.material.opacity = 0.1 + 0.05 * Math.sin(G.time * 3 + this.ph); }
    this.zone.visible = !this.known; this.zone.position.set(this.pos.x, this.pos.y + 0.3, this.pos.z);
    this.prog.visible = !this.known && this.scanK > 0; this.prog.position.set(this.pos.x, this.pos.y + 0.35, this.pos.z); this.prog.scale.setScalar(0.3 + 0.7 * Math.min(1, this.scanK));
  }
}
export function startDecap() {
  clearDecap();
  const S = G.decap = { ms: [], t: 0, real: null, found: false, lost: false, escaped: false, pad: null, ship: null, how: '' };
  const ri = Math.floor(Math.random() * DECAP.sites.length);
  DECAP.sites.forEach(([sx, sz], i) => {
    let x = sx, z = sz;
    for (let k = 0; k < 500; k++) { const a = k * 2.4, r = Math.sqrt(k) * 2.2; x = sx + Math.cos(a) * r; z = sz + Math.sin(a) * r; if (groundAt(x, z, 60) < 0.6 && !collideCyl(new V3(x, 0.5, z), 6, 3)) break; }
    const m = new Marshal(new V3(x, 0, z), i === ri); m.home = new V3(x, 0, z); m.goalP = m.home; m.goalR = 10; S.ms.push(m); if (i === ri) S.real = m;
  });
}
export function clearDecap() {
  const S = G.decap; if (!S) return;
  for (const m of S.ms) m.dropFx();
  if (S.ship) for (const o of [S.ship.obj, S.ship.ring, S.ship.beam]) o.parent && o.parent.remove(o);
  G.decap = null;
}
function decapReveal(m, why) {
  const S = G.decap; if (!S || m.known) return;
  m.known = true; m.shroud = false; m.scanK = 1; m.sh.visible = false; m.zone.visible = false; m.prog.visible = false;
  G.fx.ring(m.c.clone(), null, 1, 9, 0.4, m.real ? 0xff5030 : 0xb070ff); sfx(m.real ? 'alarm' : 'cloak', 0);
  if (m.real) {
    S.found = true; S.foundAt = S.t; S.how = why; S.shipT = DECAP.shipT;
    const P = G.player; let best = null, bs = 1e9;
    for (const [px, pz] of DECAP.pads) { const sc = Math.hypot(px - m.pos.x, pz - m.pos.z) - 0.7 * (P ? Math.hypot(px - P.pos.x, pz - P.pos.z) : 0); if (sc < bs) { bs = sc; best = [px, pz]; } }
    S.pad = new V3(best[0], 0, best[1]);
    m.st = 'flee'; m.goalP = S.pad; m.goalR = 4;
    const obj = cloneKit('E_Dropship'); obj.position.set(best[0], 80, best[1]); obj.rotation.y = Math.atan2(-(m.pos.x - best[0]), -(m.pos.z - best[1])); G.scene.add(obj);
    const ring = new THREE.Mesh(dcPadGeo, new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(best[0], groundAt(best[0], best[1], 40) + 0.3, best[1]); G.scene.add(ring);
    const beam = new THREE.Mesh(dcBeamGeo, new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); beam.position.set(best[0], 60, best[1]); G.scene.add(beam);
    S.ship = { obj, ring, beam, n: nodes(obj), leaveT: 0 };
    G.onVipFound && G.onVipFound(m, why);
  } else {
    m.st = 'fade'; m.fadeT = 1.1; m.holo(true); G.decoysOut = (G.decoysOut || 0) + 1;
    G.onDecoyFound && G.onDecoyFound(m, why);
  }
}
function updateDecap(dt) {
  const S = G.decap, P = G.player; if (!S) return;
  S.t += dt;
  for (const m of S.ms) {
    if (!m.alive || m.dying || m.known) continue;
    const near = P && P.alive && Math.hypot(P.pos.x - m.pos.x, P.pos.z - m.pos.z) < DECAP.scanR && clearLine(P.center(_c), m.c);
    m.scanK = near ? m.scanK + dt / DECAP.scanT : Math.max(0, m.scanK - dt * 0.25);
    if (near && Math.random() < 0.25) G.fx.lightning(P.center(new V3()), m.c.clone().add(new V3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4)), 0x60e8ff, 0.12, 0.05, 0.6);
    const why = m.scanK >= 1 ? 'scan' : m.markT > 0 ? 'sonar' : m.hp <= m.maxHp * DECAP.exposeK ? 'dmg' : m.real && S.t > DECAP.alertAt ? 'alert' : '';
    if (why) decapReveal(m, why);
  }
  if (!S.found && S.real && S.real.alive && S.ms.filter((m) => !m.real && m.known).length >= S.ms.length - 1) decapReveal(S.real, 'last');
  const sh = S.ship;
  if (sh) {
    const R = S.real, o = sh.obj, gy = groundAt(S.pad.x, S.pad.z, 40) + DECAP.shipH;
    for (const k of ['E_DFanL', 'E_DFanR']) if (sh.n[k]) sh.n[k].rotation.y += dt * (k === 'E_DFanL' ? 30 : -30);
    if (S.escaped) { sh.leaveT += dt; o.position.y += dt * (6 + sh.leaveT * 6); if (sh.leaveT > 10) { for (const x of [o, sh.ring, sh.beam]) x.parent && x.parent.remove(x); S.ship = null; } }
    else if (!R || !R.alive) { sh.leaveT += dt; o.position.y += dt * (4 + sh.leaveT * 5); sh.ring.visible = false; sh.beam.visible = false; if (sh.leaveT > 10) { for (const x of [o, sh.ring, sh.beam]) x.parent && x.parent.remove(x); S.ship = null; } }
    else { S.shipT = Math.max(0, S.shipT - dt); const k = S.shipT / DECAP.shipT; o.position.y = gy + 75 * k * k; sh.ring.material.opacity = 0.4 + 0.3 * Math.sin(G.time * 5); sh.beam.material.opacity = R.st === 'board' ? 0.22 + 0.1 * Math.sin(G.time * 12) : 0.08; }
  }
}

// ---- LK-3 link beacon: a slow cyan beacon; where it lands, up to five enemies within 18 m are linked for 9 s
G.lbeacons = []; G.lgroups = [];
const lbGeo = new THREE.SphereGeometry(0.35, 10, 8), lkRingGeo = new THREE.TorusGeometry(1, 0.06, 6, 32);
function fireLinkB(owner, slot, d, aim, target) {
  const mp = owner.muzzlePos(slot, new V3(), 0), v = new V3().subVectors(aim, mp).normalize().multiplyScalar(d.speed);
  const m = new THREE.Mesh(lbGeo, new THREE.MeshBasicMaterial({ color: 0x80f0ff, fog: false })); m.position.copy(mp); G.scene.add(m);
  G.lbeacons.push({ p: mp.clone(), v, t: 1.6, d, m, tgt: target && target.alive ? target : null });
  G.fx.muzzle(mp, _d.copy(v).normalize(), 0x80f0ff, 1.4); sfx('grenade', 0); G.linkUses = (G.linkUses || 0) + 1;
}
function linkBurst(at, d) {
  const cand = G.enemies.filter((e) => e.alive && !e.dying && !e.hacked && e.c && !e.cloaked && e.c.distanceTo(at) < d.R).sort((a, b) => a.c.distanceTo(at) - b.c.distanceTo(at)).slice(0, d.max);
  G.fx.ring(at, null, 1, d.R, 0.35, 0x60e8ff); G.fx.sparks(at, null, 14, 0x80f0ff, 10, 1, 0.35, 0.2); sfx('zap', G.player ? G.player.pos.distanceTo(at) * 0.5 : 0);
  if (cand.length < 2) { G.linkFizz = (G.linkFizz || 0) + 1; return; }
  for (const e of cand) if (e.linkG) { const og = e.linkG; og.ents = og.ents.filter((x) => x !== e); e.linkG = null; }
  const pos = new Float32Array(d.max * 2 * 3), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(0x70f0ff).multiplyScalar(4), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); line.frustumCulled = false; G.scene.add(line);
  const rmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60e8ff).multiplyScalar(3), transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const g = { ents: cand, t: d.dur, d, line, pos, rmat, rings: new Map() };
  for (const e of cand) { e.linkG = g; G.fx.ring(e.c.clone(), null, 0.5, (e.r || 2) * 1.5, 0.3, 0x60e8ff); const r = new THREE.Mesh(lkRingGeo, rmat); r.rotation.x = Math.PI / 2; r.scale.setScalar((e.r || 2) * 1.25); G.scene.add(r); g.rings.set(e, r); }
  G.lgroups.push(g); G.linkedN = (G.linkedN || 0) + cand.length;
}
function linkShare(h, dmg, g) {
  const hb = G.stats.hits, lb = G.curLabel; G.curLabel = 'link';
  for (const o of g.ents) {
    if (o === h || !o.alive || o.dying) continue;
    const x = dmg * g.d.share * (o.maxHp > 3000 ? 0.5 : 1); G.linkDmg = (G.linkDmg || 0) + x;
    dealDamage(o, x, 'P', o.c, 'link');
  }
  G.curLabel = lb; G.stats.hits = hb;
}
function dropLinkG(g) { for (const e of g.ents) if (e.linkG === g) e.linkG = null; for (const r of g.rings.values()) r.parent && r.parent.remove(r); g.rings.clear(); g.rmat.dispose(); g.line.parent && g.line.parent.remove(g.line); g.line.geometry.dispose(); g.line.material.dispose(); const i = G.lgroups.indexOf(g); if (i >= 0) G.lgroups.splice(i, 1); }
function updateLinkB(dt) {
  for (let i = G.lbeacons.length - 1; i >= 0; i--) {
    const n = G.lbeacons[i]; n.t -= dt;
    if (n.tgt && n.tgt.alive && n.tgt.c) { const sp = n.v.length(); _a.subVectors(n.tgt.c, n.p).normalize(); _b.copy(n.v).divideScalar(sp); if (_a.dot(_b) > 0) { _b.lerp(_a, Math.min(1, 2.2 * dt)).normalize(); n.v.copy(_b).multiplyScalar(sp); } }
    n.v.y -= 3 * dt;
    const L = n.v.length() * dt; _d.copy(n.v).normalize();
    const w = raySolids(n.p, _d, L);
    let hit = null;
    for (const e of entsFor('P')) { if (!e.alive || e.isBarrel || e.isMine || !e.c) continue; if (e.c.distanceTo(n.p) < (e.r || 1.5) + 1.2) { hit = e; break; } }
    if (hit || w.solid || n.t <= 0 || n.p.y < groundAt(n.p.x, n.p.z, n.p.y + 1) + 0.2) { linkBurst(hit ? hit.c.clone() : n.p.clone(), n.d); n.t = -1; }
    else n.p.addScaledVector(n.v, dt);
    n.m.position.copy(n.p); n.m.scale.setScalar(1 + 0.3 * Math.sin(G.time * 30));
    if (n.t < 0) { n.m.parent && n.m.parent.remove(n.m); n.m.material.dispose(); G.lbeacons.splice(i, 1); }
  }
  for (let i = G.lgroups.length - 1; i >= 0; i--) {
    const g = G.lgroups[i]; g.t -= dt;
    g.ents = g.ents.filter((e) => e.alive && !e.dying && e.linkG === g);
    for (const [e, r] of g.rings) { if (!g.ents.includes(e)) { r.parent && r.parent.remove(r); g.rings.delete(e); } else { r.position.copy(e.c); r.rotation.z += dt * 2; } }
    g.rmat.opacity = (0.5 + 0.4 * Math.abs(Math.sin(G.time * 6))) * Math.min(1, g.t * 1.5);
    if (g.t <= 0 || g.ents.length < 2) { dropLinkG(g); continue; }
    const k = g.ents.length, P = g.pos; let j = 0;
    for (let a = 0; a < k; a++) { if (k === 2 && a === 1) break; const e0 = g.ents[a], e1 = g.ents[(a + 1) % k]; P[j++] = e0.c.x; P[j++] = e0.c.y; P[j++] = e0.c.z; P[j++] = e1.c.x; P[j++] = e1.c.y; P[j++] = e1.c.z; }
    g.line.geometry.setDrawRange(0, j / 3); g.line.geometry.attributes.position.needsUpdate = true;
    g.line.material.opacity = (0.55 + 0.35 * Math.abs(Math.sin(G.time * 8))) * Math.min(1, g.t * 1.5);
    g.zapT = (g.zapT || 0) - dt; if (g.zapT <= 0) { g.zapT = 0.12; const a0 = Math.floor(Math.random() * k), e0 = g.ents[a0], e1 = g.ents[(a0 + 1) % k]; G.fx.lightning(e0.c.clone(), e1.c.clone(), 0x60e8ff, 0.3, 0.1, 1); }
  }
}
export function clearLinkB() { for (const n of G.lbeacons) n.m.parent && n.m.parent.remove(n.m); G.lbeacons.length = 0; for (const g of [...G.lgroups]) dropLinkG(g); G.lgroups.length = 0; }

// ------------------------------------------------------------------ v52 Shifting Walls: two sets of concrete wall segments
// trade places every 20 s (yellow stripes on the floor 2.4 s before a wall rises; whatever stands there is thrown clear and
// hurt); a laser canopy at 16 m burns your mech if it flies higher than 11 m. Pulsars send out expanding rings that
// alternate low (jump over it) and high (stay on the ground under it); walls stop rings. BP-4 pushes an energy wall forward
export const MAZE = { cell: 22, n: 4, len: 14, th: 1.8, h: 9, warn: 2.4, rise: 0.9, period: 20, canopy: 16, burnAt: 11, dps: 30, dmg: 20, edmg: 120, bossDmg: 40, fling: 13 };
G.maze = null;
const mzHash = (i, j, k) => { let x = Math.imul(i + 97, 73856093) ^ Math.imul(j + 211, 19349663) ^ Math.imul(k + 7, 83492791); x = Math.imul(x ^ (x >>> 13), 0x5bd1e995); return ((x ^ (x >>> 15)) >>> 0) / 4294967296; };
const stripeTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#000000'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#ffffff';
  for (let x = -32; x < 160; x += 16) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 8, 32); g.lineTo(x + 16, 0); g.lineTo(x + 8, 0); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set((MAZE.len + 5) / 5, 1); return t; })();
const gridTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#000000'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ARENA * 2 / 8, ARENA * 2 / 8); return t; })();
const mzPlaneGeo = new THREE.PlaneGeometry(1, 1);
export function startMaze() {
  clearMaze();
  const S = G.maze = { walls: [], up: 'A', t: MAZE.period, warned: false, shifts: 0 };
  for (let i = -MAZE.n; i <= MAZE.n; i++) for (let j = -MAZE.n; j <= MAZE.n; j++) {
    const rot = mzHash(i, j, 1) < 0.5 ? 1 : 0, x = i * MAZE.cell + (mzHash(i, j, 2) - 0.5) * 6, z = j * MAZE.cell + (mzHash(i, j, 3) - 0.5) * 6;
    const hw = rot ? MAZE.th / 2 : MAZE.len / 2, hd = rot ? MAZE.len / 2 : MAZE.th / 2;
    let clash = false;
    for (const q of [[0, 0], [hw, hd], [-hw, -hd], [hw, -hd], [-hw, hd]]) if (pointInSolid(_a.set(x + q[0], 1, z + q[1]), 2.5)) { clash = true; break; }
    if (clash) continue;
    const set = ((i + j) & 1) ? 'A' : 'B', k = set === 'A' ? 1 : 0;
    const obj = cloneKit('P_LiftWall'); obj.rotation.y = rot ? Math.PI / 2 : 0; obj.position.set(x, -MAZE.h * (1 - k) + (k ? 0 : 0.25), z); G.scene.add(obj);
    const sol = addSolid(x, z, hw * 2, hd * 2, MAZE.h, 0, 'mazewall'); sol.max.y = Math.max(0.25, MAZE.h * k);
    const stripe = new THREE.Mesh(mzPlaneGeo, new THREE.MeshBasicMaterial({ map: stripeTex, color: new THREE.Color(0xffc030).multiplyScalar(1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    stripe.rotation.set(-Math.PI / 2, 0, rot ? Math.PI / 2 : 0); stripe.scale.set(MAZE.len + 5, MAZE.th + 5, 1); stripe.position.set(x, 0.07, z); stripe.visible = false; G.scene.add(stripe);
    S.walls.push({ x, z, rot, hw, hd, set, k, tgt: k, obj, sol, stripe, warnT: 0, hits: new Set() });
  }
  const cm = new THREE.Mesh(mzPlaneGeo, new THREE.MeshBasicMaterial({ map: gridTex, color: new THREE.Color(0xff2a30).multiplyScalar(1.6), transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  cm.rotation.x = -Math.PI / 2; cm.scale.set(ARENA * 2, ARENA * 2, 1); cm.position.y = MAZE.canopy; cm.renderOrder = 3; G.scene.add(cm); S.canopy = cm;
  G.mazeFling = 0; G.mazeCrush = 0; G.mazeKills = 0; G.canopyT = 0; G.canopyOn = 0;
}
export function clearMaze() {
  const S = G.maze;
  if (S) {
    for (const w of S.walls) { w.obj.parent && w.obj.parent.remove(w.obj); removeSolid(w.sol); w.stripe.parent && w.stripe.parent.remove(w.stripe); w.stripe.material.dispose(); }
    S.canopy.parent && S.canopy.parent.remove(S.canopy); S.canopy.material.dispose();
  }
  G.maze = null; G.canopyOn = 0;
}
function mazeIn(w, x, z, r) { return Math.abs(x - w.x) < w.hw + r && Math.abs(z - w.z) < w.hd + r; }
function mazeOut(w, p, r) {   // shove p out of the footprint along the wall's short axis; returns the unit push direction
  if (w.rot) { const sg = Math.sign(p.x - w.x) || 1; p.x = w.x + sg * (w.hw + r + 0.3); return _d.set(sg, 0, 0); }
  const sg = Math.sign(p.z - w.z) || 1; p.z = w.z + sg * (w.hd + r + 0.3); return _d.set(0, 0, sg);
}
function updateMaze(dt) {
  const S = G.maze, P = G.player; if (!S) return;
  S.t -= dt;
  if (S.t <= MAZE.warn && !S.warned) {
    S.warned = true;
    for (const w of S.walls) if (w.set !== S.up) { w.warnT = MAZE.warn; w.stripe.visible = true; w.autoR = Math.random() < 0.65; }
    sfx('warn', 0); G.onMazeWarn && G.onMazeWarn();
  }
  if (S.t <= 0) {
    S.up = S.up === 'A' ? 'B' : 'A'; S.t = MAZE.period; S.warned = false; S.shifts++;
    for (const w of S.walls) { w.tgt = w.set === S.up ? 1 : 0; if (w.tgt) w.hits.clear(); }
    sfx('rumble', 0); G.fx.trauma = Math.min(1, G.fx.trauma + 0.25); G.onMazeShift && G.onMazeShift(S);
  }
  for (const w of S.walls) {
    if (w.warnT > 0) { w.warnT -= dt; w.stripe.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(G.time * (6 + 10 * (1 - w.warnT / MAZE.warn)))); }
    else if (w.stripe.visible && w.k > 0.6) { w.stripe.visible = false; w.stripe.material.opacity = 0; }
    if (w.k === w.tgt) continue;
    const rising = w.tgt > w.k;
    w.k = rising ? Math.min(1, w.k + dt / MAZE.rise) : Math.max(0, w.k - dt / (MAZE.rise * 1.6));
    w.obj.position.y = -MAZE.h * (1 - w.k) + (w.k < 0.03 ? 0.25 : 0); w.sol.max.y = Math.max(0.25, MAZE.h * w.k);
    if (Math.random() < 0.5) G.fx.dust(_a.set(w.x + (Math.random() - 0.5) * w.hw * 2, 0.4, w.z + (Math.random() - 0.5) * w.hd * 2), 1, 2.2, 4);
    if (!rising) continue;
    const top = MAZE.h * w.k;
    if (P && P.alive && !w.hits.has(P)) {
      const r = P.radius || 1.6;
      if (mazeIn(w, P.pos.x, P.pos.z, 1.5 + r * 0.5) && P.pos.y < top - 0.2 && !(G.blinkInv > 0)) {
        w.hits.add(P); G.curLabel = 'mazewall'; hurtPlayer(MAZE.dmg, 'mazewall'); G.mazeFling++;
        const dir = mazeOut(w, P.pos, r); P.vel.x = dir.x * MAZE.fling; P.vel.z = dir.z * MAZE.fling; P.vel.y = 7; P.grounded = false;
        G.fx.sparks(P.center(_c), null, 18, 0xffd090, 16, 1, 0.35, 0.25); G.fx.trauma = Math.min(1, G.fx.trauma + 0.5); sfx('boom', 0);
      }
    }
    for (const e of G.enemies) {
      if (!e.alive || e.dying || !e.pos || e.holo || w.hits.has(e) || e.isTrain || e.isColossus || e.isLev || e.kind === 'cpart') continue;
      const r = 2.5 + (e.r || 2) * 0.3;   // the striped footprint (2.5 m round the wall)
      if (!mazeIn(w, e.pos.x, e.pos.z, r) || e.pos.y > top - 0.2 || e.pos.y > 2.5) continue;
      w.hits.add(e);
      const dir = mazeOut(w, e.pos, r), boss = e.kind === 'boss';
      if (e.c) { e.c.x = e.pos.x; e.c.z = e.pos.z; }
      e.hit(boss ? MAZE.bossDmg : MAZE.edmg, e.c, 'mazewall'); G.mazeCrush++;
      if (!e.alive) { G.mazeKills++; G.onTally && G.onTally('mazekill'); }
      if (e.vel) { e.vel.x = dir.x * 10; e.vel.z = dir.z * 10; }
      G.fx.sparks(e.c || e.pos, null, 14, 0xffd090, 14, 1, 0.3, 0.25); sfx('boom', P ? P.pos.distanceTo(e.pos) : 40);
    }
  }
  // laser canopy: anything of yours above 11 m gets burnt and pushed down
  if (P) {
    const feet = P.pos.y, k = Math.max(0, Math.min(1, 1 - (MAZE.burnAt - feet) / 7));
    S.canopy.material.opacity = 0.05 + 0.4 * k * k + (G.canopyOn > 0 ? 0.15 * Math.abs(Math.sin(G.time * 20)) : 0);
    if (P.alive && feet > MAZE.burnAt) {
      G.curLabel = 'canopy'; hurtPlayer(MAZE.dps * dt, 'canopy'); G.canopyT += dt; G.canopyOn = 0.3;
      if (P.vel.y > -3) P.vel.y = -3;
      if (Math.random() < 0.5) G.fx.sparks(_a.set(P.pos.x + (Math.random() - 0.5) * 3, P.pos.y + 5, P.pos.z + (Math.random() - 0.5) * 3), null, 2, 0xff4030, 8, 1, 0.3, 0.2);
      G.onCanopy && G.onCanopy();
    } else G.canopyOn = Math.max(0, G.canopyOn - dt);
  }
}

// ---- Pulsar: a three-legged emitter tower. every 5.5-7 s it charges for 1 s (core orange = low ring next, cyan = high)
// and sends out an expanding ring (15 m/s, out to 70 m). a low ring fills 0-3.4 m above its feet: jump over it. a high ring
// fills 6.5-14 m: stay on the ground under it. 40 damage and a shove; walls in the way stop it. a twin gun in between
export const PULSE = { hp: 1200, r: 2.6, speed: 4.2, keep: [22, 38], cd: [5.5, 7], charge: 1.0, v: 15, R: 70, low: 3.4, high: [6.5, 14], dmg: 40, push: 14, gunCd: 2.2, gunDmg: 12, gunR: 70, trig: 80 };
const PU_COL = { low: 0xff8a30, high: 0x40d8ff };
G.rings = [];
const pRingGeo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
const pRingTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.88, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64); return new THREE.CanvasTexture(c); })();
export function clearRings() { for (const r of G.rings) { r.mesh.parent && r.mesh.parent.remove(r.mesh); r.mesh.material.dispose(); } G.rings.length = 0; G.ringsMade = 0; G.ringHits = 0; G.ringDodged = 0; G.ringBlocked = 0; }
export class Pulsar extends Enemy {
  constructor(pos) {
    super('pulsar', 'E_Pulsar', pos, PULSE.hp, PULSE.r); this.boom = 1.4;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6.28; this.vel = new V3(); this.ph = Math.random() * 6; this.side = Math.random() < 0.5 ? 1 : -1; this.sideT = 0; this.stuckT = 0; this.last = this.pos.clone();
    this.st = 'idle'; this.cdT = 2.5 + Math.random() * 2.5; this.chT = 0; this.next = Math.random() < 0.5 ? 'low' : 'high'; this.gunT = 1.5 + Math.random(); this.ringY = null;
    this.core = null; this.obj.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'PulseCore') { if (!this.core) this.core = o.material.clone(); o.material = this.core; } });
    this.c.set(this.pos.x, this.pos.y + 4, this.pos.z); this.tint();
  }
  tint() { if (this.core && this.core.emissive) { this.core.emissive.setHex(PU_COL[this.next]); this.core.color.setHex(PU_COL[this.next]); } }
  update(dt) {
    const t = this.tg(), n = this.n; this.ph += dt;
    const tc = t.center(playerC);
    let dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const los = this.checkLos(dt);
    let mx = 0, mz = 0;
    if (dl > PULSE.keep[1] || !los) { mx = dx; mz = dz; } else if (dl < PULSE.keep[0]) { mx = -dx; mz = -dz; } else { mx = -dz * this.side * 0.6; mz = dx * this.side * 0.6; }
    if (this.sideT > 0) { this.sideT -= dt; mx = mx * 0.3 - dz * this.side; mz = mz * 0.3 + dx * this.side; }
    const spd = PULSE.speed * (this.st === 'charge' ? 0.15 : 1), kk = 1 - Math.exp(-3 * dt);
    this.vel.x += (mx * spd - this.vel.x) * kk; this.vel.z += (mz * spd - this.vel.z) * kk;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.x = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.x)); this.pos.z = Math.max(-ARENA + 5, Math.min(ARENA - 5, this.pos.z));
    collideCyl(this.pos, 2.4, 3);
    this.stuckT += dt; if (this.stuckT > 1.6) { if (this.pos.distanceTo(this.last) < 2 && (dl > PULSE.keep[1] || !los)) { this.sideT = 1.8; this.side *= -1; } this.stuckT = 0; this.last.copy(this.pos); }
    this.yaw += angDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 2);
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 2) - this.pos.y) * Math.min(1, dt * 8);
    this.obj.rotation.set(0, this.yaw, 0);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    for (let i = 1; i <= 3; i++) { const l = n['PU_Leg' + i]; if (l) l.rotation.z = Math.sin(this.ph * 5 + i * 2.1) * 0.16 * Math.min(1, sp / 2.5); }
    this.c.set(this.pos.x, this.pos.y + 4, this.pos.z);
    // charge and fire a ring
    this.cdT -= dt;
    if (this.st === 'idle' && this.cdT <= 0) {
      if (dl < PULSE.trig) { this.st = 'charge'; this.chT = PULSE.charge; sfx('charge', dl * 0.5); G.onPulseCharge && G.onPulseCharge(this); }
      else this.cdT = 0.8;
    }
    const R = n.PU_Ring; if (R && this.ringY === null) this.ringY = R.position.y;
    let ck = 0;
    if (this.st === 'charge') {
      this.chT -= dt; ck = 1 - Math.max(0, this.chT) / PULSE.charge;
      if (Math.random() < 0.6) G.fx.emit('add', { x: this.c.x + (Math.random() - 0.5) * 3, y: this.pos.y + (this.next === 'low' ? 1 : 8) + Math.random() * 2, z: this.c.z + (Math.random() - 0.5) * 3, vy: 0, life: 0.18, s0: 1.4, s1: 0.3, c0: PU_COL[this.next] });
      if (this.chT <= 0) { spawnPulseRing(this, this.next); this.next = this.next === 'low' ? 'high' : 'low'; this.tint(); this.st = 'idle'; this.cdT = PULSE.cd[0] + Math.random() * (PULSE.cd[1] - PULSE.cd[0]); }
    }
    if (this.core && this.core.emissive) this.core.emissiveIntensity = 1.2 + ck * 7 + 0.3 * Math.sin(this.ph * 4);
    if (R) { R.rotation.y += dt * (this.st === 'charge' ? 9 : 1.4); const want = this.ringY + (this.next === 'high' ? 2.6 : -0.9) * (0.35 + 0.65 * ck); R.position.y += (want - R.position.y) * Math.min(1, dt * 5); }
    // twin gun between rings
    this.gunT -= dt;
    if (this.st === 'idle' && this.gunT <= 0 && dl < PULSE.gunR && los) {
      this.gunT = PULSE.gunCd;
      for (let i = 0; i < 2; i++) G.queue.push({ t: i * 0.16, label: 'pulsar-gun', fn: () => {
        if (!this.alive) return;
        const mp = this.n.Muzzle_Pulse ? this.n.Muzzle_Pulse.getWorldPosition(new V3()) : this.c.clone();
        const aim = lead(mp, 110, _b, this.tg()); _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.05; _d.normalize();
        spawnShot({ p: mp, v: _d.clone().multiplyScalar(110), dmg: PULSE.gunDmg, team: 'E', kind: 'ebullet', color: 0xffc080, w: 0.28, len: 4, life: 0.8, label: 'pulsar-gun' });
        G.fx.muzzle(mp, _d, 0xffb060, 1.0);
      } });
    }
  }
}
function spawnPulseRing(src, type) {
  const col = PU_COL[type], b0 = type === 'low' ? 0 : PULSE.high[0], b1 = type === 'low' ? PULSE.low : PULSE.high[1];
  const mat = new THREE.MeshBasicMaterial({ map: pRingTex, color: new THREE.Color(col).multiplyScalar(2.2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(pRingGeo, mat); m.position.set(src.pos.x, src.pos.y + (b0 + b1) / 2, src.pos.z); m.scale.set(1.5, b1 - b0, 1.5); m.frustumCulled = false; G.scene.add(m);
  G.rings.push({ x: src.pos.x, z: src.pos.z, y0: src.pos.y, b0, b1, R: 1.5, type, mesh: m, hit: new Set(), src, autoR: Math.random() < 0.65 });
  G.ringsMade = (G.ringsMade || 0) + 1;
  G.fx.flash(_a.set(src.pos.x, src.pos.y + (b0 + b1) / 2, src.pos.z), col, 90, 50, 0.25);
  sfx(type === 'low' ? 'sonic' : 'emp', G.player ? G.player.pos.distanceTo(src.pos) * 0.5 : 40);
}
function updateRings(dt) {
  const P = G.player;
  for (let i = G.rings.length - 1; i >= 0; i--) {
    const r = G.rings[i], R0 = r.R; r.R += PULSE.v * dt;
    const k = r.R / PULSE.R; r.mesh.scale.set(r.R, r.b1 - r.b0, r.R); r.mesh.material.opacity = 0.8 * (1 - k * k);
    if (r.R >= PULSE.R) { r.mesh.parent && r.mesh.parent.remove(r.mesh); r.mesh.material.dispose(); G.rings.splice(i, 1); continue; }
    if (!P || !P.alive || r.hit.has(P)) continue;
    const d = Math.hypot(P.pos.x - r.x, P.pos.z - r.z), rr = P.radius || 1.6;
    if (d < R0 - rr || d > r.R + rr * 0.5) continue;
    r.hit.add(P);
    const feet = P.pos.y - r.y0, head = feet + 4.8;
    if (feet >= r.b1 || head <= r.b0 || G.blinkInv > 0) { G.ringDodged = (G.ringDodged || 0) + 1; continue; }
    const em = _a.set(r.x, r.y0 + (r.b0 + r.b1) / 2, r.z), tc = P.center(_c); tc.y = Math.max(r.y0 + r.b0 + 0.5, Math.min(r.y0 + r.b1 - 0.5, tc.y));
    if (!clearLine(em, tc)) { G.ringBlocked = (G.ringBlocked || 0) + 1; continue; }
    G.curShooter = r.src; G.curLabel = 'pulsar-ring'; hurtPlayer(PULSE.dmg, 'pulsar-ring'); G.curShooter = null;
    if (!(r.src && r.src.hacked)) {
      G.ringHits = (G.ringHits || 0) + 1;
      const ux = (P.pos.x - r.x) / (d || 1), uz = (P.pos.z - r.z) / (d || 1);
      P.vel.x += ux * PULSE.push; P.vel.z += uz * PULSE.push; if (r.type === 'low') { P.vel.y = Math.max(P.vel.y, 5); P.grounded = false; } else P.vel.y = Math.min(P.vel.y, -6);
      G.fx.sparks(P.center(_c), null, 16, PU_COL[r.type], 16, 1, 0.3, 0.25); G.fx.trauma = Math.min(1, G.fx.trauma + 0.4);
      G.onRingHit && G.onRingHit(r);
    }
  }
}

// ---- BP-4 barrier ram: an 11 m x 7 m energy wall that slides forward 35 m. eats enemy shots that meet it, carries the
// enemies it runs into (bosses only take a knock) and slams them if it reaches a wall
G.bwalls = [];
const bwTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.08, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
  for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < 72; x += 16) { g.beginPath(); for (let q = 0; q < 6; q++) { const a = q * Math.PI / 3; g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); } g.closePath(); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; })();
export function clearBWalls() { for (const b of G.bwalls) { b.mesh.parent && b.mesh.parent.remove(b.mesh); b.mesh.material.dispose(); } G.bwalls.length = 0; G.bwUses = 0; G.bwBlocked = 0; G.bwCarry = 0; G.bwSlams = 0; G.bwDmg = 0; }
function fireBWall(owner, d, mul) {
  const yaw = owner.aimYaw ?? G.camYaw ?? 0, dir = new V3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const p = owner.pos.clone().addScaledVector(dir, 5);
  const base = Math.max(groundAt(p.x, p.z, owner.pos.y + 1), owner.pos.y - 1.5);
  const mat = new THREE.MeshBasicMaterial({ map: bwTex, color: new THREE.Color(0x4cc8ff).multiplyScalar(1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(mzPlaneGeo, mat); mesh.scale.set(d.W, d.H, 1); mesh.rotation.set(0, yaw, 0); mesh.position.set(p.x, base + d.H / 2, p.z); G.scene.add(mesh);
  G.bwalls.push({ owner, d, mul, dir, p, base, t: d.dur, yaw, carried: new Set(), hit: new Set(), mesh, me: owner === G.player, age: 0 });
  G.bwUses = (G.bwUses || 0) + 1; sfx('shield', 0); G.fx.ring(_a.set(p.x, base + 0.3, p.z), null, 1, 7, 0.35, 0x4cc8ff);
}
function updateBWalls(dt) {
  for (let i = G.bwalls.length - 1; i >= 0; i--) {
    const b = G.bwalls[i], d = b.d, dir = b.dir; b.t -= dt; b.age += dt;
    let reach = 0; for (const e of b.carried) if (e.alive) reach = Math.max(reach, (e.r || 2) + 1.2);
    const step = d.speed * dt;
    let blocked = false;
    for (const hy of [1.4, d.H * 0.6]) { _a.set(b.p.x, b.base + hy, b.p.z); const w = raySolids(_a, dir, step + 1 + reach, true); if (w.solid && w.solid !== 'floor' && w.solid.kind !== 'barrel' && w.solid.kind !== 'icewall') { blocked = true; break; } }
    if (!blocked) b.p.addScaledVector(dir, step);
    const gy = groundAt(b.p.x, b.p.z, b.base + 2); if (gy > b.base) b.base = gy;
    b.mesh.position.set(b.p.x, b.base + d.H / 2, b.p.z);
    b.mesh.material.opacity = 0.6 * Math.min(1, b.age * 6, Math.max(0, b.t) * 4 + (blocked ? 0 : 0.2)) * (0.85 + 0.15 * Math.sin(G.time * 30));
    const lx = -dir.z * d.W / 2, lz = dir.x * d.W / 2;
    G.fx.streak(_a.set(b.p.x - lx, b.base + d.H, b.p.z - lz), _b.set(b.p.x + lx, b.base + d.H, b.p.z + lz), 0.22, 0x9fe8ff);
    G.fx.streak(_a.set(b.p.x - lx, b.base + 0.1, b.p.z - lz), _b.set(b.p.x + lx, b.base + 0.1, b.p.z + lz), 0.3, 0x9fe8ff);
    if (Math.random() < 0.7) G.fx.sparks(_a.set(b.p.x + (Math.random() - 0.5) * 2 * lx, b.base + 0.2, b.p.z + (Math.random() - 0.5) * 2 * lz), null, 1, 0x9fe8ff, 6, 1, 0.3, 0.18);
    // enemy fire that meets it
    for (let j = G.shots.length - 1; j >= 0; j--) {
      const s = G.shots[j]; if (s.team !== 'E') continue;
      const rx = s.x - b.p.x, rz = s.z - b.p.z, lat = -rx * dir.z + rz * dir.x;
      if (Math.abs(lat) > d.W / 2 || s.y < b.base - 0.3 || s.y > b.base + d.H + 0.3) continue;
      const al = rx * dir.x + rz * dir.z, al0 = al - (s.v.x * dir.x + s.v.z * dir.z) * dt + step;
      if (!(Math.abs(al) < 1.0 || (al < 0) !== (al0 < 0) && Math.abs(al0) < 12)) continue;
      G.shots.splice(j, 1); G.bwBlocked = (G.bwBlocked || 0) + 1;
      G.fx.sparks(_c.set(s.x, s.y, s.z), dir, s.kind === 'ebullet' ? 3 : 10, 0x9fe8ff, 12, 0.8, 0.25, 0.2);
      if (s.kind !== 'ebullet') G.fx.explosion(_c, 0.5, 0x60c8ff);
    }
    // enemies in its path
    for (const e of G.enemies) {
      if (!e.alive || e.dying || !e.c || !e.pos || e.holo || e.isObjective || e.isTrain || e.isColossus || e.isLev || e.kind === 'cpart' || e.isMine) continue;
      const r = e.r || 2, rx = e.c.x - b.p.x, rz = e.c.z - b.p.z, al = rx * dir.x + rz * dir.z, lat = -rx * dir.z + rz * dir.x;
      if (Math.abs(lat) > d.W / 2 + r * 0.5 || e.c.y < b.base - 1 || e.c.y > b.base + d.H + r) continue;
      const big = e.kind === 'boss' || e.maxHp > 3000;
      if (!b.carried.has(e) && !(al > -1.5 && al < r + 1.5)) continue;
      if (!b.hit.has(e)) {
        b.hit.add(e); G.curLabel = 'bwall'; const dm = (big ? d.bossDmg : d.dmg) * b.mul; dealDamage(e, dm, 'P', e.c, 'bwall'); G.bwDmg = (G.bwDmg || 0) + dm;
        G.fx.sparks(e.c, dir, 14, 0x9fe8ff, 14, 0.9, 0.3, 0.22); sfx('hit', G.player ? G.player.pos.distanceTo(e.c) : 30);
        if (!big && e.alive) { b.carried.add(e); G.bwCarry = (G.bwCarry || 0) + 1; }
      }
      if (b.carried.has(e) && e.alive && !blocked) {
        const dl = r + 1.2 - al;
        if (dl > 0) { e.pos.x += dir.x * dl; e.pos.z += dir.z * dl; e.c.x += dir.x * dl; e.c.z += dir.z * dl; }
        if (e.vel) { e.vel.x = dir.x * d.speed; e.vel.z = dir.z * d.speed; }
      }
    }
    if (blocked || b.t <= 0) {
      for (const e of b.carried) {
        if (!e.alive) continue;
        if (blocked) { G.curLabel = 'bwall'; dealDamage(e, d.slam * b.mul, 'P', e.c, 'bwall'); G.bwDmg = (G.bwDmg || 0) + d.slam * b.mul; e.stunT = Math.max(e.stunT || 0, d.stun); G.bwSlams = (G.bwSlams || 0) + 1; G.fx.sparks(e.c, null, 20, 0xffffff, 18, 1, 0.35, 0.25); }
        else e.stunT = Math.max(e.stunT || 0, 0.35);
        if (e.vel) e.vel.multiplyScalar(0.2);
      }
      if (blocked) { G.fx.ring(_a.set(b.p.x, b.base + d.H / 2, b.p.z), dir, 1, 8, 0.3, 0x9fe8ff); G.fx.trauma = Math.min(1, G.fx.trauma + 0.2); sfx('shieldbreak', G.player ? G.player.pos.distanceTo(b.p) * 0.5 : 30); }
      b.mesh.parent && b.mesh.parent.remove(b.mesh); b.mesh.material.dispose(); G.bwalls.splice(i, 1);
    }
  }
}

// ---- v53 assembly line: three conveyor belts (alternating direction) carry whatever stands on them; nine hydraulic presses
// slam a marked 6 x 6 m plate on the belts; three fabricators at the belt heads keep building enemies that ride the belts out
export const FACT = { belts: [-60, 0, 60], dirs: [1, -1, 1], half: 5, len: 300, speed: 6, pressX: [-70, 0, 70], idle: [3.5, 7.5], warn: 1.6, drop: 0.18, hold: 0.7, rise: 1.4,
  plate: 3, pDmg: 60, eDmg: 220, bossDmg: 60, fling: 14, fabHp: 5000, fabCd: [16, 20], fabFirst: [6, 11, 16], cap: 7, fabX: 140 };
G.belts = []; G.presses = []; G.factory = null;
let beltTex = null;
function beltTexture() {
  if (beltTex) return beltTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#2c2e32'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 16) { x.fillStyle = i % 32 ? '#34363a' : '#26282c'; x.fillRect(i, 0, 8, 128); }
  x.strokeStyle = '#d8a828'; x.lineWidth = 14; x.lineJoin = 'miter';
  x.beginPath(); x.moveTo(30, 18); x.lineTo(86, 64); x.lineTo(30, 110); x.stroke();
  x.fillStyle = '#1a1b1e'; x.fillRect(0, 0, 128, 6); x.fillRect(0, 122, 128, 6);
  beltTex = new THREE.CanvasTexture(c); beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping; beltTex.repeat.set(FACT.len / 10, 1); beltTex.colorSpace = THREE.SRGBColorSpace;
  beltTex.anisotropy = 4;
  return beltTex;
}
const plateGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export class Fabricator extends Enemy {
  constructor(x, z, dir, i) {
    super('fab', 'E_Fab', new V3(x, 0, z), FACT.fabHp, 2.8); this.boom = 2.4; this.isObjective = true; this.dir = dir; this.i = i;
    this.obj.rotation.y = -dir * Math.PI / 2;
    this.solids = [addSolid(x, z, 9, 10, 6.3, 0, 'fab')];
    this.c.set(x + dir * 0.5, 8, z); this.t = FACT.fabFirst[i] || 8; this.made = 0; this.door = 0; this.ph = Math.random() * 6; this.st = 'idle';
  }
  die() {
    for (const so of this.solids) removeSolid(so);
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c, 11, 40, 'P', 2.8, 0xffa040); G.fx.flash(this.c, 0xffa040, 60, 30, 0.5);
    for (let k = 0; k < 5; k++) G.queue.push({ label: 'fab', t: 0.2 + k * 0.28, fn: () => explodeAt(new V3(this.pos.x + (Math.random() - 0.5) * 8, 1.5 + Math.random() * 4, this.pos.z + (Math.random() - 0.5) * 8), 0, 0, 'P', 1.4) });
    this.remove();
  }
  update(dt) {
    const n = this.n; this.ph += dt;
    if (n.FB_Core) n.FB_Core.scale.setScalar(1 + 0.1 * Math.sin(this.ph * 5) + (this.st === 'build' ? 0.15 : 0));
    for (const k of ['FB_Arm1', 'FB_Arm2']) if (n[k]) n[k].rotation.y = Math.sin(this.ph * (this.st === 'build' ? 4 : 0.8) + (k === 'FB_Arm2' ? 2 : 0)) * 0.9;
    if (n.FB_Door) n.FB_Door.position.y = this.door * 4.4;
    this.t -= dt;
    if (this.st === 'idle') {
      this.door = Math.max(0, this.door - dt * 1.5);
      if (this.t <= 0) {
        const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && !e.isObjective).length;
        if (foes >= FACT.cap || !G.player || !G.player.alive) { this.t = 2; return; }
        this.st = 'build'; this.t = 1.4; G.fx.sparks(this.c, null, 12, 0xffc060, 10, 1, 0.5, 0.3);
      }
    } else if (this.st === 'build') {
      this.door = Math.min(1, this.door + dt * 1.2);
      if (Math.random() < 0.5) G.fx.sparks(_a.set(this.pos.x + this.dir * 5, 4.5, this.pos.z + (Math.random() - 0.5) * 5), null, 2, 0xffc060, 8, 1, 0.3, 0.2);
      if (this.t <= 0) { this.st = 'idle'; this.t = FACT.fabCd[0] + Math.random() * (FACT.fabCd[1] - FACT.fabCd[0]); this.produce(); }
    }
  }
  produce() {
    const k = this.made++, ox = this.pos.x + this.dir * 8, z = this.pos.z, P = (dz) => new V3(ox + this.dir * Math.random() * 3, 0, z + dz);
    const seq = G.factory ? G.factory.seq : 0, kind = ['crawler', 'forklift', 'walker', 'crawler', 'bulwark', 'forklift'][(k + this.i * 2) % 6];
    if (kind === 'crawler') for (let j = 0; j < 3; j++) new Crawler(P((j - 1) * 2.5));
    else if (kind === 'forklift') new Forklift(P(0));
    else if (kind === 'walker') new Walker(P(0));
    else if (kind === 'bulwark') (seq >= 1 ? new Bulwark(P(0)) : new Walker(P(0)));
    G.fabMade = (G.fabMade || 0) + 1;
    G.fx.ring(new V3(ox, 0.3, z), null, 1, 6, 0.4, 0xffb040); sfx('reel', G.player ? G.player.pos.distanceTo(this.pos) : 50);
  }
}
export function startFactory() {
  clearFactory();
  const g = new THREE.Group(), tex = beltTexture(), bm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.2 });
  const rail = new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.5, metalness: 0.6 }), haz = new THREE.MeshStandardMaterial({ color: 0xd8a828, roughness: 0.6 });
  FACT.belts.forEach((z, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(FACT.len, FACT.half * 2).rotateX(-Math.PI / 2), bm); m.position.set(0, 0.07, z); if (FACT.dirs[i] < 0) m.rotation.y = Math.PI; m.receiveShadow = true; g.add(m);
    for (const sz of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(FACT.len, 0.45, 0.5), rail); r.position.set(0, 0.22, z + sz * (FACT.half + 0.25)); r.castShadow = r.receiveShadow = true; g.add(r);
      const h = new THREE.Mesh(new THREE.BoxGeometry(FACT.len, 0.08, 0.52), haz); h.position.set(0, 0.47, z + sz * (FACT.half + 0.25)); g.add(h);
    }
    G.belts.push({ z, dir: FACT.dirs[i] });
    for (const px of FACT.pressX) {
      const o = cloneKit('P_Press'); o.position.set(px, 0, z); g.add(o);
      const sol = [addSolid(px, z - 6.6, 1.0, 0.9, 11.2, 0, 'press'), addSolid(px, z + 6.6, 1.0, 0.9, 11.2, 0, 'press'), addSolid(px, z, 1.6, 14.4, 1.2, 11.0, 'press')];
      const pl = new THREE.Mesh(plateGeo, new THREE.MeshBasicMaterial({ color: 0xff3018, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      pl.scale.set(FACT.plate * 2 + 1, 1, FACT.plate * 2 + 1); pl.position.set(px, 0.12, z); pl.renderOrder = 3; g.add(pl);
      const nn = nodes(o); G.presses.push({ x: px, z, o, head: nn.PZ_Head, pl, sol, st: 'idle', t: FACT.idle[0] + Math.random() * (FACT.idle[1] - FACT.idle[0]), y: 8, hitSet: new Set() });
    }
  });
  for (const z of [-30, 30]) for (let k = 0; k < 4; k++) {
    const x = -105 + k * 70 + (Math.random() - 0.5) * 20, zz = z + (Math.random() - 0.5) * 10;
    if (pointInSolid(new V3(x, 1, zz), 2)) continue;
    const o = cloneKit('P_Barrel'); o.position.set(x, 0, zz); o.rotation.y = Math.random() * 6; g.add(o);
    const so = addSolid(x + 0.45, zz + 0.35, 2.2, 2.2, 1.4, 0, 'barrel'), b = { obj: o, pos: new V3(x + 0.45, 0.8, zz + 0.35), hp: 40, solid: so, dead: false };
    so.ref = b; barrels.push(b);
  }
  G.scene.add(g);
  const fabs = FACT.belts.map((z, i) => new Fabricator(-FACT.dirs[i] * FACT.fabX, z, FACT.dirs[i], i));
  G.factory = { g, fabs, seq: 0, beltT: 0, crushE: 0, crushP: 0, slams: 0 };
}
export function clearFactory() {
  if (G.factory) { G.factory.g.parent && G.factory.g.parent.remove(G.factory.g); for (const p of G.presses) for (const so of p.sol) removeSolid(so); }
  G.factory = null; G.belts = []; G.presses = [];
}
function onBelt(x, z) {
  if (Math.abs(x) > FACT.len / 2) return null;
  for (const b of G.belts) if (Math.abs(z - b.z) < FACT.half) return b;
  return null;
}
function updateFactory(dt) {
  const F = G.factory; if (!F) return;
  if (beltTex) beltTex.offset.x -= FACT.speed / 10 * dt;
  const P = G.player;
  if (P && P.alive && P.grounded) { const b = onBelt(P.pos.x, P.pos.z); if (b) { P.pos.x += b.dir * FACT.speed * dt; F.beltT += dt; } }
  for (const e of G.enemies) {
    if (!e.alive || e.dying || e.isObjective || !e.pos || e.tbHeld) continue;
    if (e.mech ? !e.mech.grounded : Math.abs(e.pos.y - groundAt(e.pos.x, e.pos.z, e.pos.y + 1)) > 0.6) continue;
    const b = onBelt(e.pos.x, e.pos.z); if (!b) continue;
    e.pos.x += b.dir * FACT.speed * dt; if (e.c && e.c !== e.pos && !e.mech) e.c.x += b.dir * FACT.speed * dt;
  }
  for (const p of G.presses) {
    p.t -= dt;
    if (p.st === 'idle') {
      p.y += (8 - p.y) * Math.min(1, dt * 3);
      if (p.t <= 0) { p.st = 'warn'; p.t = FACT.warn; if (P && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 28) { sfx('warn', 0); G.onPressWarn && G.onPressWarn(); } }
    } else if (p.st === 'warn') {
      p.y = 8 + 0.15 * Math.sin(p.t * 40);
      if (p.t <= 0) { p.st = 'drop'; p.t = FACT.drop; p.hitSet.clear(); }
    } else if (p.st === 'drop') {
      p.y = Math.max(0.12, 8 * (p.t / FACT.drop));
      pressHit(p, F);
      if (p.t <= 0) { p.st = 'hold'; p.t = FACT.hold; p.y = 0.12; F.slams++; G.fx.ring(new V3(p.x, 0.3, p.z), null, 1, 8, 0.35, 0xffc080); G.fx.dust && G.fx.dust(new V3(p.x, 0.3, p.z), 8); sfx('pilehit', P ? P.pos.distanceTo(new V3(p.x, 0, p.z)) : 60); if (P && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 30) G.fx.trauma = Math.max(G.fx.trauma || 0, 0.35); }
    } else if (p.st === 'hold') {
      if (p.t <= 0) { p.st = 'rise'; p.t = FACT.rise; }
    } else if (p.st === 'rise') {
      p.y = 0.12 + 7.88 * (1 - p.t / FACT.rise);
      if (p.t <= 0) { p.st = 'idle'; p.t = FACT.idle[0] + Math.random() * (FACT.idle[1] - FACT.idle[0]); }
    }
    if (p.head) p.head.position.y = p.y;
    p.pl.material.opacity = p.st === 'warn' ? 0.35 + 0.3 * Math.sin(p.t * 22) : p.st === 'drop' ? 0.7 : 0;
  }
}
function pressHit(p, F) {
  const h = FACT.plate, P = G.player;
  if (P && P.alive && !p.hitSet.has(P) && Math.abs(P.pos.x - p.x) < h + 1.2 && Math.abs(P.pos.z - p.z) < h + 1.2 && P.pos.y < p.y + 0.5 && P.pos.y < 8) {
    p.hitSet.add(P); G.curSrc = new V3(p.x, 4, p.z); damagePlayer(FACT.pDmg, G.curSrc, 'press'); F.crushP++;
    const sx = Math.sign(P.pos.x - p.x) || 1; P.vel.x = sx * FACT.fling; P.vel.y = 7; P.pos.x = p.x + sx * (h + 1.6);
  }
  for (const e of G.enemies) {
    if (!e.alive || e.dying || e.isObjective || !e.pos || p.hitSet.has(e)) continue;
    const r = (e.r || 2) * 0.4;
    if (Math.abs(e.pos.x - p.x) > h + r || Math.abs(e.pos.z - p.z) > h + r || e.pos.y > p.y || e.pos.y > 8) continue;
    p.hitSet.add(e); G.pressCrush = (G.pressCrush || 0) + 1; const big = e.kind === 'boss' || e.kind === 'raider' || e.maxHp > 3000;
    G.curLabel = 'press'; dealDamage(e, big ? FACT.bossDmg : FACT.eDmg, 'X', e.c, 'press'); G.curLabel = null; F.crushE++;
    if (!e.alive) F.crushKill = (F.crushKill || 0) + 1;
    G.fx.sparks(e.c, null, 14, 0xffc080, 14, 1, 0.4, 0.3);
  }
}


// ------------------------------------------------------------------ v54 Tsunami: tide pumps on the seaward (west) edge
// drive a wall of water across the whole map every 30 s. It carries and drowns everything below its crest; hover above
// it or stand on a roof. Every pump destroyed lowers the wave 3 m and gives 6 s more between waves; all three down and
// the sea calms. Swappers lock a tether onto you and trade places, preferably dropping you on the sea side
export const TSU = { period: 26, first: 14, warn: 7, speed: 24, thick: 26, h: 15, hPer: 3, perAdd: 5, carry: 0.6, pDps: 36, eDps: 70, bossDps: 10, x0: -185, x1: 190,
  pumpHp: 6000, pumps: [[-150, -90], [-150, 0], [-150, 90]] };
G.tsu = null;
let tsuGeo = null;
function waveGeo() {
  if (tsuGeo) return tsuGeo;
  const sh = new THREE.Shape(), pts = [];
  for (let i = 0; i <= 28; i++) {   // front at x = 0, crest just behind it, long sloping back to x = -thick
    const u = i / 28, x = -u * TSU.thick;
    const y = u < 0.12 ? Math.sin(u / 0.12 * Math.PI / 2) : Math.pow(1 - (u - 0.12) / 0.88, 1.6);
    pts.push([x, y]);
  }
  sh.moveTo(0.6, 0); for (const [x, y] of pts) sh.lineTo(x, y); sh.lineTo(-TSU.thick, 0); sh.lineTo(0.6, 0);
  tsuGeo = new THREE.ExtrudeGeometry(sh, { depth: 2 * 190, bevelEnabled: false, steps: 95, curveSegments: 4 });
  tsuGeo.translate(0, 0, -190);
  // undulate the crest along its length and shade deep teal at the foot through to white foam at the crest
  const pa = tsuGeo.attributes.position, col = new Float32Array(pa.count * 3), deep = new THREE.Color(0x15485c), mid = new THREE.Color(0x3fa2bc), foam = new THREE.Color(0xeefcff), cc = new THREE.Color();
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), lead = Math.max(0, 1 + x / 6);
    const wob = 1 + 0.13 * Math.sin(z * 0.045) + 0.07 * Math.sin(z * 0.13 + 1.7);
    pa.setY(i, y * wob); pa.setX(i, x + lead * 2.2 * Math.sin(z * 0.03 + 0.5) * y);
    const k = y * wob;
    if (k < 0.7) cc.copy(deep).lerp(mid, k / 0.7); else cc.copy(mid).lerp(foam, Math.min(1, (k - 0.7) / 0.32));
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  tsuGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); tsuGeo.computeVertexNormals();
  return tsuGeo;
}
export class TidePump extends Enemy {
  constructor(x, z, i) {
    super('pump', 'E_Pump', new V3(x, 0, z), TSU.pumpHp, 3.0); this.boom = 2.4; this.isObjective = true; this.i = i;
    this.obj.rotation.y = Math.PI / 2;   // intakes (kit -Z) face the sea to the west
    this.solids = [addSolid(x, z, 9.4, 9.4, 5.0, 0, 'pump')];
    this.c.set(x, 7.2, z); this.ph = Math.random() * 6;
  }
  die() {
    for (const so of this.solids) removeSolid(so);
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c, 11, 40, 'P', 2.6, 0x60c8ff); G.fx.flash(this.c, 0x60c8ff, 60, 30, 0.5);
    for (let k = 0; k < 4; k++) G.queue.push({ label: 'pump', t: 0.2 + k * 0.3, fn: () => explodeAt(new V3(this.pos.x + (Math.random() - 0.5) * 8, 1.5 + Math.random() * 4, this.pos.z + (Math.random() - 0.5) * 8), 0, 0, 'P', 1.3) });
    const T = G.tsu; if (T) { T.h = Math.max(4, T.h - TSU.hPer); T.per += TSU.perAdd; T.down++; G.onPumpDown && G.onPumpDown(this, T); }
    this.remove();
  }
  update(dt) {
    const T = G.tsu, n = this.n, busy = T && (T.st === 'warn' || T.st === 'wave') ? 1 : 0; this.ph += dt;
    if (n.TP_Fan) n.TP_Fan.rotation.y += dt * (1.2 + busy * 6);
    if (n.TP_Core) n.TP_Core.scale.setScalar(1 + 0.08 * Math.sin(this.ph * (3 + busy * 8)) + busy * 0.12);
    if (busy && Math.random() < 0.3) G.fx.emit('add', { x: this.pos.x - 6, y: 1.6, z: this.pos.z + (Math.random() - 0.5) * 5, vx: -4, vy: 2, life: 0.6, s0: 1.2, s1: 2.5, c0: 0xcfefff });
  }
}
export function startTsunami() {
  clearTsunami();
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false });
  const wave = new THREE.Mesh(waveGeo(), mat); wave.renderOrder = 2; g.add(wave);
  const foam = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 380), new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.55, depthWrite: false }));
  foam.renderOrder = 3; g.add(foam);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(3, 340).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  line.position.set(-160, 0.15, 0); g.add(line);
  g.visible = true; wave.visible = foam.visible = false; G.scene.add(g);
  const pumps = TSU.pumps.map(([x, z], i) => new TidePump(x, z, i));
  G.tsu = { g, wave, foam, line, pumps, st: 'calm', t: TSU.first, X: TSU.x0, h: TSU.h, per: TSU.period, n: 0, down: 0, acc: 0, eAcc: 0, hitsP: 0, carried: 0 };
  G.tsuKills = 0; G.tsuDmgP = 0;
}
export function clearTsunami() { if (G.tsu) G.tsu.g.parent && G.tsu.g.parent.remove(G.tsu.g); G.tsu = null; }
export function tsuEta() {   // seconds until the next wave front reaches the player (null when calm forever)
  const T = G.tsu, P = G.player; if (!T || !P) return null;
  if (T.down >= TSU.pumps.length && T.st === 'calm') return null;
  const reach = Math.max(0, (P.pos.x - (T.st === 'wave' ? T.X : TSU.x0)) / TSU.speed);
  if (T.st === 'wave') return P.pos.x < T.X - TSU.thick ? null : reach;
  return (T.st === 'warn' ? T.t : T.t + TSU.warn) + reach;
}
export function inWave(pos, pad = 0) {
  const T = G.tsu; if (!T || T.st !== 'wave') return false;
  return pos.x < T.X + 1 + pad && pos.x > T.X - TSU.thick && pos.y < T.h * waveAt(T.X - pos.x) + 0.8;
}
function waveAt(back) { const u = Math.max(0, Math.min(1, back / TSU.thick)); return u < 0.12 ? Math.max(0.35, Math.sin(u / 0.12 * Math.PI / 2)) : Math.pow(1 - (u - 0.12) / 0.88, 1.6); }
function updateTsunami(dt) {
  const T = G.tsu; if (!T) return;
  const P = G.player;
  T.t -= dt;
  if (T.st === 'calm') {
    if (T.t <= 0 && T.down < TSU.pumps.length) { T.st = 'warn'; T.t = TSU.warn; sfx('alarm', 0); G.onTsuWarn && G.onTsuWarn(T); }
  } else if (T.st === 'warn') {
    T.line.material.opacity = 0.35 + 0.3 * Math.sin(G.time * 12);
    if (Math.random() < 0.4) G.fx.emit('add', { x: TSU.x0 + 25 + Math.random() * 6, y: Math.random() * 3, z: (Math.random() - 0.5) * 320, vy: 3, life: 0.8, s0: 1.5, s1: 3, c0: 0xdff6ff });
    if (T.t <= 0) { T.st = 'wave'; T.X = TSU.x0; T.n++; T.line.material.opacity = 0; T.wave.visible = true; T.hitE = new Set(); T.hitP = false; sfx('rumble', 0); G.onTsuWave && G.onTsuWave(T); }
  } else if (T.st === 'wave') {
    T.X += TSU.speed * dt;
    T.wave.position.set(T.X, 0, 0); T.wave.scale.set(1, T.h, 1);
    T.foam.position.set(T.X - 2.6, T.h * 0.98, 0); T.foam.scale.set(1, Math.max(0.6, T.h * 0.06), 1);
    if (P) {
      const dx = P.pos.x - T.X;
      if (dx < 30 && dx > -40) for (let k = 0; k < 4; k++) G.fx.emit('add', { x: T.X - Math.random() * 4, y: T.h * (0.8 + Math.random() * 0.25), z: P.pos.z + (Math.random() - 0.5) * 60, vx: 6 + Math.random() * 6, vy: 2 + Math.random() * 4, life: 0.7, s0: 1.2, s1: 3.2, c0: 0xeefcff });
      if (Math.abs(dx) < 60) G.fx.trauma = Math.max(G.fx.trauma, 0.25 * (1 - Math.abs(dx) / 60));
      if (P.alive && inWave(P.pos)) {
        if (!T.hitP) { T.hitP = true; T.hitsP++; G.onTsuHit && G.onTsuHit(); }
        P.pos.x += TSU.speed * TSU.carry * dt; P.vel.x = Math.max(P.vel.x, TSU.speed * TSU.carry * 0.5); P.vel.y = Math.min(P.vel.y, 5.5);
        T.carried += dt; T.acc += TSU.pDps * dt;
        if (T.acc >= 6) { G.curSrc = new V3(T.X - 4, P.pos.y, P.pos.z); damagePlayer(T.acc, G.curSrc, 'tsunami'); G.tsuDmgP += T.acc; T.acc = 0; }
      }
    }
    T.eAcc += dt; const tick = T.eAcc >= 0.25; if (tick) T.eAcc = 0;
    for (const e of G.enemies) {
      if (!e.alive || e.dying || e.isObjective || !e.pos || e.holo || e.isMine || e.kind === 'cpart' || e.isTrain || e.isColossus || e.isLev) continue;
      if (!inWave(e.pos)) continue;
      const big = e.kind === 'boss' || e.kind === 'raider' || e.maxHp > 3000;
      if (!big && !e.tbHeld) { e.pos.x += TSU.speed * TSU.carry * dt; if (e.c && e.c !== e.pos && !e.mech) e.c.x += TSU.speed * TSU.carry * dt; }
      if (tick) {
        G.curLabel = 'tsunami'; dealDamage(e, (big ? TSU.bossDps : TSU.eDps) * 0.25, 'X', e.c || e.pos, 'tsunami'); G.curLabel = null;
        if (!e.alive) G.tsuKills = (G.tsuKills || 0) + 1;
        if (Math.random() < 0.5) G.fx.sparks(e.c || e.pos, null, 4, 0xdff6ff, 8, 1, 0.3, 0.3);
      }
    }
    if (T.X > TSU.x1 + TSU.thick) { T.st = 'calm'; T.t = T.per; T.wave.visible = T.foam.visible = false; T.acc = 0; }
  }
}

export const SWAP = { hp: 700, r: 2.2, hover: 8, keep: [30, 50], speed: 12, cd: [8, 10], lock: 1.2, range: 60, brk: 220, daze: 1.5, dazeK: 1.5, gunCd: 2.2, gunR: 70, dmg: 7 };
export class Swapper extends Enemy {
  constructor(pos) {
    super('swapper', 'E_Swap', pos, SWAP.hp, SWAP.r); this.boom = 1.0;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.st = 'idle'; this.cdT = 3 + Math.random() * 3; this.lockT = 0; this.lockDmg = 0; this.dazeT = 0; this.gunT = 1.5 + Math.random();
    this.side = Math.random() < 0.5 ? 1 : -1; this.goalV = new V3(); this.climbT = 0;
    this.pos.y = groundAt(pos.x, pos.z, 40) + SWAP.hover; this.c.copy(this.pos);
  }
  hit(dmg) {
    if (this.st === 'daze') dmg *= SWAP.dazeK;
    if (this.st === 'lock') this.lockDmg += dmg;
    super.hit(dmg);
  }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC), P = G.player, n = this.n;
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    const los = this.checkLos(dt);
    this.cdT -= dt;
    if (this.st === 'idle' && this.cdT <= 0) {
      if (P && P.alive && tg === P && this.c.distanceTo(pc) < SWAP.range && los && !(G.camo && G.camo.t > 0)) { this.st = 'lock'; this.lockT = SWAP.lock; this.lockDmg = 0; sfx('warn', 0); G.swapLocks = (G.swapLocks || 0) + 1; G.onSwapLock && G.onSwapLock(this); }
      else this.cdT = 0.7;
    }
    if (this.st === 'lock') {
      this.lockT -= dt; const k = 1 - Math.max(0, this.lockT) / SWAP.lock;
      const ok = P && P.alive && clearLine(P.center(_c), this.c) && this.lockDmg < SWAP.brk && this.c.distanceTo(P.center(_c)) < SWAP.range * 1.15;
      if (!ok) { this.st = 'idle'; this.cdT = 3.5; G.swapBreaks = (G.swapBreaks || 0) + 1; G.fx.sparks(this.c, null, 14, 0xc070ff, 12, 1, 0.4, 0.25); sfx('snap', dist * 0.5); }
      else {
        G.fx.streak(_a.copy(this.c), _b.copy(P.center(_c)), 0.12 + k * 0.25, 0xc060ff);
        if (Math.random() < 0.6) G.fx.sparks(P.center(_c), null, 2, 0xc070ff, 6, 1, 0.3, 0.2);
        if (this.lockT <= 0) this.swap(P);
      }
    } else if (this.st === 'daze') {
      this.dazeT -= dt; if (Math.random() < 0.4) G.fx.sparks(this.c, null, 2, 0xd0a0ff, 6, 1, 0.3, 0.2);
      if (this.dazeT <= 0) { this.st = 'idle'; this.cdT = SWAP.cd[0] + Math.random() * (SWAP.cd[1] - SWAP.cd[0]); }
    }
    const spin = this.st === 'lock' ? 9 : this.st === 'daze' ? 14 : 1.6;
    if (n.SX_Ring1) n.SX_Ring1.rotation.y += dt * spin;
    if (n.SX_Ring2) n.SX_Ring2.rotation.x += dt * spin * 0.7;
    if (n.SX_Core) n.SX_Core.scale.setScalar(1 + (this.st === 'lock' ? 0.35 * (1 - Math.max(0, this.lockT) / SWAP.lock) + 0.1 * Math.sin(G.time * 30) : 0.06 * Math.sin(G.time * 4)));
    // keep 30-50 m away, preferring the seaward (west) side of the target when the tsunami is running
    const want = Math.max(SWAP.keep[0], Math.min(SWAP.keep[1], dist));
    const a = G.tsu ? Math.PI + this.side * (0.5 + 0.35 * Math.sin(G.time * 0.25 + this.side)) : Math.atan2(-dz, -dx) + this.side * 0.45;
    const goal = this.goalV.set(pc.x + Math.cos(a) * want, 0, pc.z + Math.sin(a) * want);
    const gx = goal.x - this.pos.x, gz = goal.z - this.pos.z, gl = Math.hypot(gx, gz) || 1;
    const sp = SWAP.speed * Math.min(1, gl / 6 + 0.15) * (this.st === 'lock' ? 0.2 : this.st === 'daze' ? 0.1 : 1), kk = 1 - Math.exp(-2.2 * dt);
    this.vel.x += (gx / gl * sp - this.vel.x) * kk; this.vel.z += (gz / gl * sp - this.vel.z) * kk;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 2, 2.2)) { this.pos.x -= this.vel.x * dt; this.pos.z -= this.vel.z * dt; this.vel.multiplyScalar(-0.3); this.side *= -1; this.climbT = 2.5; }
    if (this.climbT > 0) this.climbT -= dt;
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) + SWAP.hover + (this.climbT > 0 ? 14 : 0) + Math.sin(G.time * 1.7 + this.side) * 0.5 - (this.st === 'daze' ? 2 : 0);
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-2.5 * dt));
    const ny = Math.atan2(-(pc.x - this.pos.x), -(pc.z - this.pos.z)), turn = angDiff(ny, this.yaw); this.yaw += turn * Math.min(1, dt * 3);
    this.obj.rotation.set(0, this.yaw, this.st === 'daze' ? Math.sin(G.time * 9) * 0.4 : 0, 'YXZ');
    this.c.copy(this.pos);
    this.gunT -= dt;
    if (this.st === 'idle' && this.gunT <= 0 && dist < SWAP.gunR && los) {
      this.gunT = SWAP.gunCd;
      for (let i = 0; i < 2; i++) G.queue.push({ t: i * 0.16, label: 'swapper-gun', fn: () => {
        if (!this.alive) return;
        const mp = this.n.Muzzle_Swap ? this.n.Muzzle_Swap.getWorldPosition(new V3()) : this.c.clone();
        const aim = lead(mp, 110, _b, this.tg()); _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.05; _d.normalize();
        spawnShot({ p: mp, v: _d.clone().multiplyScalar(110), dmg: SWAP.dmg, team: 'E', kind: 'ebullet', color: 0xe0b0ff, w: 0.22, len: 3, life: 0.8, label: 'swapper-gun' });
      } });
    }
  }
  swap(P) {
    const pp = P.pos.clone(), mp = this.pos.clone();
    G.fx.flash(pp, 0xc060ff, 40, 30, 0.3); G.fx.flash(mp, 0xc060ff, 40, 30, 0.3);
    G.fx.ring(pp.clone().setY(pp.y + 2), null, 1, 7, 0.35, 0xc070ff); G.fx.ring(mp.clone(), null, 1, 7, 0.35, 0xc070ff);
    const gy = groundAt(mp.x, mp.z, mp.y + 1);
    P.pos.set(mp.x, Math.max(gy, mp.y - 2.6), mp.z); P.vel.set(0, 0, 0); if (P.lungeT) P.lungeT = 0;
    this.pos.set(pp.x, pp.y + 2.6, pp.z); this.c.copy(this.pos); this.vel.set(0, 0, 0);
    this.st = 'daze'; this.dazeT = SWAP.daze; G.swaps = (G.swaps || 0) + 1;
    sfx('blink', 0); G.fx.trauma = Math.min(1, G.fx.trauma + 0.3);
    G.onSwap && G.onSwap(this);
  }
}

// NC-2 nanite cloud: a 10 m swarm that follows its owner for 8 s, chewing on enemies inside and eating half the enemy
// projectiles that fly into it
G.nanos = [];
const nanoWire = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7cf0e0).multiplyScalar(1.3), wireframe: true, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const nanoGeo = new THREE.IcosahedronGeometry(1, 2);
function castNano(owner, d, mul, me) {
  G.nanos = G.nanos.filter((c) => { if (c.owner === owner) { c.o.parent && c.o.parent.remove(c.o); return false; } return true; });
  const o = new THREE.Mesh(nanoGeo, nanoWire.clone()); o.scale.setScalar(0.5); G.scene.add(o);
  G.nanos.push({ owner, d, mul, t: d.dur, age: 0, tick: 0, o, me });
  G.nanoN = (G.nanoN || 0) + 1;
  sfx(d.sfx || 'stasis', 0); const c = owner.center(new V3()); G.fx.ring(c, null, 1, d.R * 1.3, 0.45, 0x7cf0e0);
}
function updateNano(dt) {
  for (let i = G.nanos.length - 1; i >= 0; i--) {
    const N = G.nanos[i], d = N.d; N.t -= dt; N.age += dt;
    if (N.t <= 0 || !N.owner.alive) { N.o.parent && N.o.parent.remove(N.o); G.nanos.splice(i, 1); continue; }
    const c = N.owner.center(N.cp || (N.cp = new V3())), R = d.R, fade = Math.min(1, N.t * 2);
    N.o.position.copy(c); N.o.scale.setScalar(R * Math.min(1, N.age * 4)); N.o.rotation.y += dt * 0.6; N.o.rotation.x += dt * 0.25; N.o.material.opacity = 0.06 * fade;
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * 6.28, b = Math.acos(Math.random() * 2 - 1), r = R * (0.35 + 0.65 * Math.cbrt(Math.random()));
      G.fx.emit('add', { x: c.x + Math.sin(b) * Math.cos(a) * r, y: Math.max(0.3, c.y + Math.cos(b) * r * 0.7), z: c.z + Math.sin(b) * Math.sin(a) * r, vx: -Math.sin(a) * 3, vz: Math.cos(a) * 3, life: 0.35, s0: 0.35, s1: 0.1, c0: 0x9ff8ec });
    }
    for (let j = G.shots.length - 1; j >= 0; j--) {
      const sh = G.shots[j]; if (sh.team !== 'E' || sh._nc) continue;
      if (Math.hypot(sh.x - c.x, sh.y - c.y, sh.z - c.z) > R) continue;
      sh._nc = true;
      if (Math.random() < d.eat) { G.shots.splice(j, 1); G.nanoEat = (G.nanoEat || 0) + 1; G.fx.sparks(_a.set(sh.x, sh.y, sh.z), null, 4, 0x9ff8ec, 8, 0.8, 0.25, 0.15); }
    }
    N.tick += dt; if (N.tick < 0.25) continue; N.tick = 0;
    for (const e of G.enemies) {
      if (!e.alive || e.dying || e.holo || e.isMine || e.hacked || !(e.c || e.pos)) continue;
      const ec = e.c || e.pos; if (ec.distanceTo(c) > R + (e.r || 2) * 0.5) continue;
      const big = e.kind === 'boss' || e.kind === 'raider' || e.maxHp > 3000 || e.isColossus || e.isTrain || e.isLev;
      G.curLabel = 'nanocloud'; dealDamage(e, d.dps * 0.25 * N.mul * (big ? d.bossK : 1), 'P', ec, 'nanocloud'); G.curLabel = null;
      G.nanoDmg = (G.nanoDmg || 0) + d.dps * 0.25 * N.mul * (big ? d.bossK : 1);
      if (Math.random() < 0.5) G.fx.sparks(ec, null, 3, 0x9ff8ec, 6, 1, 0.25, 0.15);
    }
  }
}
export function clearNano() { for (const N of G.nanos) N.o.parent && N.o.parent.remove(N.o); G.nanos.length = 0; G.nanoEat = 0; G.nanoDmg = 0; G.nanoN = 0; }


// ------------------------------------------------------------------ v55 Hive Creep: three hive nodes spread living creep
// (circles painted on the floor through CREEP.uC). Creep slows and hurts mechs standing in it, heals enemies on it, and
// eats the purifier at the centre while it touches it. Nodes on their own only reach 80 m; seeders carry it further by
// planting tumours on the creep's front edge. Destroy a node and its creep (and its tumours' support) recedes
export const BIO = { nodeHp: 3600, nodes: [[-125, -75], [125, -80], [5, 140]], r0: 18, grow: 0.35, rMax: 80, shrink: 5, coreDps: 26, coreR: 10,
  pDps: 8, pSlow: 0.7, regen: 0.012, tumorHp: 320, tumorR: 20, tumorGrow: 1.5, maxC: 10, spitCd: [4, 5.5], spitR: 45, spitDmg: 14 };
G.bio = null;
export function inCreep(pos, pad = 1) {
  const B = G.bio; if (!B) return false;
  for (const c of B.circles) if (c.r > 1 && Math.hypot(pos.x - c.x, pos.z - c.z) < c.r - pad) return true;
  return false;
}
export class BioNode extends Enemy {
  constructor(x, z, i) {
    super('bionode', 'E_BioNode', new V3(x, 0, z), BIO.nodeHp, 3.2); this.boom = 2.4; this.isObjective = true; this.i = i;
    this.obj.rotation.y = i * 2.1 + 0.4;
    this.solids = [addSolid(x, z, 8, 8, 5.0, 0, 'bionode')];
    this.c.set(x, 6.8, z); this.ph = Math.random() * 6;
  }
  die() {
    for (const so of this.solids) removeSolid(so);
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c, 11, 40, 'P', 2.6, 0x9cff3a); G.fx.flash(this.c, 0x9cff3a, 60, 30, 0.5);
    for (let k = 0; k < 5; k++) G.queue.push({ label: 'bionode', t: 0.2 + k * 0.28, fn: () => explodeAt(new V3(this.pos.x + (Math.random() - 0.5) * 8, 1 + Math.random() * 4, this.pos.z + (Math.random() - 0.5) * 8), 0, 0, 'P', 1.3, 0x9cff3a) });
    const B = G.bio; if (B) { B.down++; G.onNodeDown && G.onNodeDown(this, B); }
    this.remove();
  }
  update(dt) {
    const n = this.n; this.ph += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.ph * 2.4);
    if (n.BN_Core) n.BN_Core.scale.setScalar(1 + 0.12 * pulse + (this.flash > 0 ? 0.1 : 0));
    if (n.BN_Petals) { n.BN_Petals.rotation.z += dt * 0.25; n.BN_Petals.scale.set(1 + 0.08 * pulse, 1 + 0.08 * pulse, 1); }
    if (Math.random() < 0.15) G.fx.emit('add', { x: this.pos.x + (Math.random() - 0.5) * 6, y: 2 + Math.random() * 5, z: this.pos.z + (Math.random() - 0.5) * 6, vy: 1.5, life: 1.2, s0: 0.5, s1: 0.1, c0: 0xb8ff60 });
  }
}
export class Tumor extends Enemy {
  constructor(pos) {
    super('tumor', 'E_Tumor', pos, BIO.tumorHp, 1.6); this.boom = 0.9;
    this.pos.y = groundAt(pos.x, pos.z, 30); this.age = 0; this.obj.scale.setScalar(0.2); this.obj.rotation.y = Math.random() * 6;
    this.c.set(this.pos.x, this.pos.y + 1.3, this.pos.z); this.spitT = 2 + Math.random() * 2;
    const B = G.bio; if (B && B.circles.length < BIO.maxC) B.circles.push({ x: pos.x, z: pos.z, r: 0, rT: BIO.tumorR, src: this });
    G.tumors = (G.tumors || 0) + 1; G.onTumor && G.onTumor(this);
  }
  die() {
    this.dying = true; this.alive = false; G.stats.kills++; G.onKill && G.onKill(this);
    explodeAt(this.c, 3, 10, 'P', 0.9, 0x9cff3a); G.fx.sparks(this.c, null, 14, 0xb8ff60, 12, 1, 0.5, 0.3);
    this.remove();
  }
  update(dt) {
    this.age += dt; const k = Math.min(1, 0.2 + this.age / 1.5);
    this.obj.scale.setScalar(k * (1 + 0.05 * Math.sin(this.age * 5)));
    if (this.n.TU_Core) this.n.TU_Core.scale.setScalar(1 + 0.2 * Math.sin(this.age * 6));
    this.spitT -= dt;
    if (this.spitT <= 0 && this.age > 1.5) {
      this.spitT = BIO.spitCd[0] + Math.random() * (BIO.spitCd[1] - BIO.spitCd[0]);
      const t = this.tg(), tc = t.center ? t.center(playerC) : t.pos;
      if (this.c.distanceTo(tc) < BIO.spitR && this.checkLos(dt)) bioLob(this, this.c.clone().setY(this.c.y + 0.5), t, tc, BIO.spitDmg, 'tumor-spore');
    }
  }
}
function bioLob(e, mp, t, tc, dmg, label) {   // green spore blob lobbed onto the target's predicted spot
  const D = Math.hypot(tc.x - mp.x, tc.z - mp.z), Tf = 0.9 + D / 40, g = 22;
  const aim = new V3().copy(tc).addScaledVector(t.vel || _c.set(0, 0, 0), Tf * 0.6);
  const gy = groundAt(aim.x, aim.z, aim.y + 1), low = aim.y - gy < 4; if (low) aim.y = gy;
  const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
  G.curShooter = e; spawnShot({ p: mp, v, dmg, team: 'E', kind: 'shell', splash: 3.5, life: Tf + 1, grav: g, label, color: 0x9cff3a, size: 1.3 }); G.curShooter = null;
  if (low) G.fx.warn(aim, 3.5, Tf);
  sfx('eshell', G.player ? G.player.pos.distanceTo(mp) : 50);
}
export function startBio() {
  clearBio();
  const nodes = BIO.nodes.map(([x, z], i) => new BioNode(x, z, i));
  G.bio = { nodes, circles: nodes.map((nd) => ({ x: nd.pos.x, z: nd.pos.z, r: BIO.r0, rT: BIO.rMax, src: nd, node: true })), down: 0, acc: 0, cAcc: 0, eT: 0, pT: 0, coreT: 0, touch: 0 };
  G.tumors = 0; G.seedPlants = 0; G.seedBreaks = 0; G.creepDmgP = 0; G.creepCore = 0; G.creepHeal = 0;
}
export function clearBio() { G.bio = null; for (const v of CREEP.uC.value) v.set(0, 0, 0, 0); if (G.player) G.player.creepMul = 1; }
// a seeder's next planting spot: the point just inside the creep front that lies closest to the purifier (or the
// player when there is no core), away from other tumours
export function seedSpot(from) {
  const B = G.bio; if (!B || B.circles.length >= BIO.maxC) return null;
  const goal = G.core && G.core.alive ? G.core.pos : G.player ? G.player.pos : null; if (!goal) return null;
  let best = null, bd = 1e9;
  for (const c of B.circles) {
    if (c.r < 8 || !c.src.alive) continue;
    const dx = goal.x - c.x, dz = goal.z - c.z, L = Math.hypot(dx, dz) || 1;
    if (L < c.r) continue;   // already over the goal
    const q = new V3(c.x + dx / L * (c.r - 3), 0, c.z + dz / L * (c.r - 3));
    if (pointInSolid(new V3(q.x, 1, q.z), 1.5)) continue;
    if (G.enemies.some((e) => e.kind === 'tumor' && e.alive && Math.hypot(e.pos.x - q.x, e.pos.z - q.z) < 9)) continue;
    const sc = Math.hypot(goal.x - q.x, goal.z - q.z) + Math.hypot(from.x - q.x, from.z - q.z) * 0.25;
    if (sc < bd) { bd = sc; best = q; }
  }
  return best;
}
function updateBio(dt) {
  const B = G.bio; if (!B) return;
  const P = G.player, all = B.down >= B.nodes.length;
  for (let i = B.circles.length - 1; i >= 0; i--) {
    const c = B.circles[i];
    if (c.src.alive && !all) c.r = Math.min(c.rT, c.r + (c.node ? BIO.grow : BIO.tumorGrow) * dt);
    else { c.r -= BIO.shrink * dt; if (c.r <= 0) { B.circles.splice(i, 1); continue; } }
  }
  if (all) for (const e of G.enemies) if (e.kind === 'tumor' && e.alive && !e.dying) { G.curLabel = 'wither'; e.hit(e.hp + 1); G.curLabel = null; }
  for (let k = 0; k < 10; k++) { const c = B.circles[k], v = CREEP.uC.value[k]; if (c) v.set(c.x, c.z, Math.max(0, c.r), 1); else v.set(0, 0, 0, 0); }
  // the purifier: every circle touching it eats into it
  if (G.core && G.core.alive) {
    let n = 0; for (const c of B.circles) if (c.r > 2 && Math.hypot(G.core.pos.x - c.x, G.core.pos.z - c.z) < c.r + BIO.coreR) n++;
    B.touch = n;
    if (n) {
      B.cAcc += BIO.coreDps * n * dt;
      if (Math.random() < 0.3 * n) G.fx.sparks(_a.set(G.core.pos.x + (Math.random() - 0.5) * 14, 1 + Math.random() * 3, G.core.pos.z + (Math.random() - 0.5) * 14), null, 3, 0xb8ff60, 6, 1, 0.4, 0.2);
      if (B.cAcc >= 10) { G.curLabel = 'creep'; G.core.damage(B.cAcc); G.curLabel = null; G.creepCore += B.cAcc; B.cAcc = 0; if (!B.coreSaid) { B.coreSaid = true; G.onCreepCore && G.onCreepCore(); } }
    }
  }
  // mechs standing in creep are slowed and eaten
  if (P) {
    const on = P.alive && P.pos.y - groundAt(P.pos.x, P.pos.z, P.pos.y + 1) < 1.3 && inCreep(P.pos);
    P.creepMul = on ? BIO.pSlow : 1;
    if (on) {
      B.acc += BIO.pDps * dt; B.pT += dt;
      if (Math.random() < 0.3) G.fx.emit('add', { x: P.pos.x + (Math.random() - 0.5) * 3, y: 0.3, z: P.pos.z + (Math.random() - 0.5) * 3, vy: 1.2, life: 0.6, s0: 0.5, s1: 0.1, c0: 0xb8ff60 });
      if (B.acc >= 4) { G.curSrc = P.pos.clone(); damagePlayer(B.acc, G.curSrc, 'creep'); G.creepDmgP += B.acc; B.acc = 0; if (!B.pSaid) { B.pSaid = true; G.onCreepP && G.onCreepP(); } }
    }
  }
  // enemies on creep regenerate
  B.eT += dt; if (B.eT >= 0.5) {
    const tk = B.eT; B.eT = 0;
    for (const e of G.enemies) {
      if (!e.alive || e.dying || e.isObjective || e.kind === 'tumor' || e.kind === 'boss' || e.kind === 'raider' || e.hacked || !e.pos || e.hp >= e.maxHp || e.maxHp > 3000) continue;
      if (!inCreep(e.pos)) continue;
      const h = Math.min(e.maxHp - e.hp, e.maxHp * BIO.regen * tk); e.hp += h; G.creepHeal += h;
      if (Math.random() < 0.3) G.fx.sparks(e.c || e.pos, null, 3, 0xb8ff60, 5, 1, 0.4, 0.2);
    }
  }
}

// seeder: a six-legged bug that walks to the creep front nearest the purifier, digs in for 3 s (180 damage interrupts)
// and plants a creep tumour there; up to three each. It spits spore blobs while it walks
export const SEED = { hp: 650, r: 2.0, speed: 7.5, dig: 3.0, brk: 180, cd: 7, max: 3, keep: [24, 36], spitCd: [3.2, 4.5], spitR: 45, dmg: 12 };
export class Seeder extends Enemy {
  constructor(pos) {
    super('seeder', 'E_Seeder', pos, SEED.hp, SEED.r); this.boom = 1.0;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6; this.vel = new V3(); this.st = 'go'; this.t = 0; this.ph = Math.random() * 6;
    this.stuckT = 0; this.sideT = 0; this.side = Math.random() < 0.5 ? 1 : -1; this.last = this.pos.clone(); this.spot = null; this.spotT = 0; this.planted = 0; this.digDmg = 0;
    this.spitT = 2 + Math.random() * 2; this.c.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
  }
  drive(tx, tz, spd, dt) { return Engineer.prototype.drive.call(this, tx, tz, spd, dt); }
  hit(dmg) { if (this.st === 'dig') this.digDmg += dmg; super.hit(dmg); }
  update(dt) {
    const t = this.tg(), n = this.n, tc = t.center ? t.center(playerC) : t.pos; this.ph += dt; this.t -= dt;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
    let moving = 0;
    if (this.st === 'go') {
      this.spotT -= dt;
      if (this.spotT <= 0) { this.spotT = 2; this.spot = this.planted < SEED.max ? seedSpot(this.pos) : null; }
      if (this.spot) {
        const d = this.drive(this.spot.x, this.spot.z, SEED.speed, dt); moving = 1;
        if (d < 3.5) { this.st = 'dig'; this.t = SEED.dig; this.digDmg = 0; this.vel.set(0, 0, 0); G.onSeedDig && G.onSeedDig(this); }
      } else { this.st = 'roam'; this.t = 4; }
    } else if (this.st === 'roam' || this.st === 'rest') {
      if (dl > SEED.keep[1]) { this.drive(t.pos.x, t.pos.z, SEED.speed, dt); moving = 1; }
      else if (dl < SEED.keep[0]) { this.drive(this.pos.x - dx / dl * 12, this.pos.z - dz / dl * 12, SEED.speed * 0.8, dt); moving = 1; }
      else { this.drive(this.pos.x - dz / dl * this.side * 8, this.pos.z + dx / dl * this.side * 8, SEED.speed * 0.45, dt); moving = 0.5; }
      if (this.t <= 0) { this.st = 'go'; this.spotT = 0; }
    } else if (this.st === 'dig') {
      this.vel.multiplyScalar(0.8);
      if (Math.random() < 0.5) G.fx.emit('add', { x: this.pos.x + (Math.random() - 0.5) * 2.5, y: 0.3, z: this.pos.z + (Math.random() - 0.5) * 2.5, vy: 2, life: 0.6, s0: 0.6, s1: 0.2, c0: 0xb8ff60 });
      if ((this.ringT = (this.ringT || 0) - dt) <= 0) { this.ringT = 0.5; G.fx.ring(new V3(this.pos.x, this.pos.y + 0.3, this.pos.z), null, 1, 6, 0.4, 0x9cff3a); }
      if (this.digDmg >= SEED.brk) { this.st = 'rest'; this.t = 4; G.seedBreaks = (G.seedBreaks || 0) + 1; G.fx.sparks(this.c, null, 12, 0xb8ff60, 10, 1, 0.4, 0.25); G.onSeedBreak && G.onSeedBreak(this); }
      else if (this.t <= 0) {
        const sp = this.spot || this.pos; new Tumor(new V3(sp.x + Math.sin(this.yaw) * 1.5, 0, sp.z + Math.cos(this.yaw) * 1.5));
        this.planted++; G.seedPlants = (G.seedPlants || 0) + 1; this.st = 'rest'; this.t = SEED.cd; this.spot = null; sfx('repair', dl);
      }
    }
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 2) - this.pos.y) * Math.min(1, dt * 8);
    const sp = Math.hypot(this.vel.x, this.vel.z), want = sp > 1 && this.st !== 'dig' ? Math.atan2(-this.vel.x, -this.vel.z) : Math.atan2(-dx, -dz);
    this.yaw2 = (this.yaw2 ?? want) + angDiff(want, this.yaw2 ?? want) * Math.min(1, dt * 5);
    this.obj.rotation.set(this.st === 'dig' ? 0.18 : 0, this.yaw2, 0, 'YXZ');
    for (let i = 1; i <= 6; i++) { const L = n['SD_L' + i]; if (!L) continue; const g = (i % 2 ? 1 : -1) * ((i - 1 >> 1) % 2 ? -1 : 1); L.rotation.x = Math.sin(this.ph * 11) * 0.4 * g * Math.min(1, sp / 4); L.rotation.y = this.st === 'dig' ? Math.sin(this.ph * 20 + i) * 0.15 : 0; }
    if (n.SD_Sac) n.SD_Sac.scale.setScalar(this.st === 'dig' ? 1 + 0.35 * (1 - Math.max(0, this.t) / SEED.dig) + 0.08 * Math.sin(this.ph * 18) : 1 + 0.05 * Math.sin(this.ph * 3));
    this.c.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    this.spitT -= dt;
    if (this.st !== 'dig' && this.spitT <= 0 && dl < SEED.spitR && this.checkLos(dt)) {
      this.spitT = SEED.spitCd[0] + Math.random() * (SEED.spitCd[1] - SEED.spitCd[0]);
      const mp = n.Muzzle_Seed ? n.Muzzle_Seed.getWorldPosition(new V3()) : this.c.clone();
      bioLob(this, mp, t, tc, SEED.dmg, 'seeder-spit');
    }
  }
}

// PL-3 plasma orb: a slow orb that zaps up to two enemies around it every 0.25 s (biomass ×1.5) and bursts on contact
G.plorbs = [];
const plorbGeo = new THREE.IcosahedronGeometry(0.62, 2);
const plorbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8cc0ff).multiplyScalar(2.6), toneMapped: false });
const plorbHalo = new THREE.MeshBasicMaterial({ color: 0x5c9cff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
const isBio = (e) => e.kind === 'bionode' || e.kind === 'tumor' || e.kind === 'seeder';
function firePlOrb(owner, slot, d, mul, aim, me) {
  const mp = owner.muzzlePos(slot, new V3());
  const dir = new V3().subVectors(aim, mp).normalize();
  if (!Number.isFinite(dir.x + dir.y + dir.z) || !Number.isFinite(mp.x + mp.y + mp.z)) return;
  const o = new THREE.Mesh(plorbGeo, plorbMat); o.position.copy(mp);
  const h = new THREE.Mesh(plorbGeo, plorbHalo); h.scale.setScalar(2.1); o.add(h); G.scene.add(o);
  G.plorbs.push({ o, p: mp.clone(), v: dir.multiplyScalar(d.speed), t: d.life, tick: 0.12, d, mul, me });
  G.plorbN = (G.plorbN || 0) + 1;
  G.fx.muzzle(mp, dir.clone().normalize(), 0x8cc0ff, 1.3);
}
function popOrb(O) {
  G.curLabel = 'plorb'; explodeAt(O.p.clone(), O.d.splash, O.d.dmg * O.mul, 'P', 1.1, 0x8cc0ff); G.curLabel = null;
  G.fx.flash(O.p, 0x8cc0ff, 22, 14, 0.25); O.o.parent && O.o.parent.remove(O.o);
}
function updatePlOrbs(dt) {
  for (let i = G.plorbs.length - 1; i >= 0; i--) {
    const O = G.plorbs[i], d = O.d; O.t -= dt;
    const np = (O.np || (O.np = new V3())).copy(O.p).addScaledVector(O.v, dt);
    let pop = O.t <= 0 || !Number.isFinite(np.x + np.y + np.z) || np.y < groundAt(np.x, np.z, np.y + 1) + 0.3 || !clearLine(O.p, np);
    if (!pop) for (const e of G.enemies) { if (!e.alive || e.dying || e.holo || e.hacked || !e.c) continue; if (e.c.distanceTo(np) < (e.r || 1.5) + 0.5) { pop = true; break; } }
    if (pop) { popOrb(O); G.plorbs.splice(i, 1); continue; }
    O.p.copy(np); O.o.position.copy(np); O.o.rotation.y += dt * 6; O.o.scale.setScalar(1 + 0.15 * Math.sin(G.time * 30 + i));
    if (Math.random() < 0.6) G.fx.emit('add', { x: np.x, y: np.y, z: np.z, life: 0.25, s0: 0.5, s1: 0.1, c0: 0x8cc0ff });
    O.tick -= dt; if (O.tick > 0) continue; O.tick = 0.25;
    const near = [];
    for (const e of G.enemies) {
      if (!e.alive || e.dying || e.holo || e.hacked || e.isMine || e.cloaked || !e.c) continue;
      const L = e.c.distanceTo(np); if (!(L <= d.zapR + (e.r || 1.5) * 0.5)) continue;
      near.push([L, e]);
    }
    near.sort((a, b) => a[0] - b[0]);
    let z = 0;
    for (const [, e] of near) {
      if (z >= d.zapN) break;
      if (!clearLine(np, e.c)) continue;
      z++; const dm = d.zap * O.mul * (isBio(e) ? d.bio : 1);
      G.curLabel = 'plorb-zap'; dealDamage(e, dm, 'P', e.c, 'plorb-zap'); G.curLabel = null;
      if (O.me) G.stats.shots++;
      G.plorbZap = (G.plorbZap || 0) + dm;
      G.fx.streak(np.clone(), e.c.clone(), 0.1, 0x9cc8ff); G.fx.sparks(e.c, null, 4, 0x9cc8ff, 8, 1, 0.25, 0.15);
    }
  }
}
export function clearPlOrbs() { for (const O of G.plorbs) O.o.parent && O.o.parent.remove(O.o); G.plorbs.length = 0; G.plorbN = 0; G.plorbZap = 0; }


// ------------------------------------------------------------------ v56 Meltdown: a nuclear plant is overheating. Four
// coolant pumps sit in radiation zones; stand at one for 4 s to restart it. The reactor core's own zone grows with the
// heat, two plumes drift round the plant and burst bloaters leave puddles. Standing in radiation builds up a dose that
// makes you take more damage (+1 % per 2.5 rad, up to +60 %) and above 100 rad eats your armour; decon pads wash it off.
// The core heats up all mission (each restarted pump slows it); at 100 % it melts down and you fail
export const ATOM = { pumps: [[-84, -60], [88, -54], [-78, 80], [84, 76]], pumpR: 6.5, fixT: 8.0, fixDecay: 0.4, contR: 16, zoneR: 23, zoneFade: 6,
  coreR0: 24, coreRk: 0.14, plumes: 2, plumeR: 13, plumeSpd: 3.4, rMax: 105, decon: [[-36, -82], [40, 86]], deconR: 5.5, deconK: 32,
  heat0: 100 / 195, pumpCut: 0.22, cool: 1.5, dose: 8, coreDose: 11, decayP: 1.5, vulnK: 250, vulnCap: 150, sick: 100, sickDps: 5, hMax: 16,
  towers: [[-40, 118], [46, 124]], puddleR: 7, puddleT: 10 };
G.atom = null;
export function radAt(x, z, y = 0) {   // dose rate (rad/s) at a point
  const A = G.atom; if (!A) return 0;
  const hk = Math.max(0, 1 - y / ATOM.hMax); if (hk <= 0) return 0;
  let r = 0;
  for (const Z of A.zones) { if (Z.r < 1 || Z.w <= 0) continue; const d = Math.hypot(x - Z.x, z - Z.z); if (d < Z.r) r = Math.max(r, Z.k * Z.w * (0.45 + 0.55 * (1 - d / Z.r))); }
  return r * hk;
}
function lampMat(c) { return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.3 }); }
const pumpRingGeo = new THREE.RingGeometry(ATOM.pumpR - 0.4, ATOM.pumpR, 48);
export function startAtom() {
  clearAtom();
  const A = G.atom = { pumps: [], pads: [], zones: [], props: [], heat: 0, peak: 0, dose: 0, peakDose: 0, fixed: 0, sickAcc: 0, plT: 0, hot: false };
  const red = lampMat(0xff3020), green = lampMat(0x50ff40);
  ATOM.pumps.forEach(([x, z], i) => {
    const obj = cloneKit('P_Coolant'); obj.position.set(x, 0, z); obj.rotation.y = Math.atan2(-x, -z) + Math.PI; G.scene.add(obj);
    const n = nodes(obj); if (n.CP_Lamp) n.CP_Lamp.traverse((o) => { if (o.isMesh) o.material = red; });
    const ring = new THREE.Mesh(pumpRingGeo, new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.6, z); G.scene.add(ring);
    const Z = { x, z, r: ATOM.zoneR, k: ATOM.dose, w: 1, src: 'pump' }; A.zones.push(Z);
    A.pumps.push({ i, obj, n, ring, x, z, k: 0, fixed: false, said: false, zone: Z, green, sol: addSolid(x, z, 7, 7, 4.2, 0, 'pump') });
  });
  A.core = { x: 0, z: 0, r: ATOM.coreR0, k: ATOM.coreDose, w: 1, src: 'core' }; A.zones.push(A.core);
  for (let k = 0; k < ATOM.plumes; k++) { const a = k * Math.PI + 0.8, Z = { x: Math.cos(a) * 60, z: Math.sin(a) * 60, r: ATOM.plumeR, k: ATOM.dose, w: 1, src: 'plume', tx: 0, tz: 0 }; plumeGoal(Z); A.zones.push(Z); }
  for (const [x, z] of ATOM.decon) {
    const obj = cloneKit('P_Decon'); obj.position.set(x, 0, z); obj.rotation.y = Math.atan2(x, z); G.scene.add(obj);
    A.pads.push({ obj, n: nodes(obj), x, z, on: false });
  }
  const dome = cloneKit('P_AtomDome'); dome.position.set(0, 0, 0); dome.rotation.y = 0.6; G.scene.add(dome);
  A.props.push({ obj: dome, sol: [addSolid(0, 0, 24, 24, 14, 0, 'dome'), addSolid(Math.cos(0.6) * 15.5, -Math.sin(0.6) * 15.5, 9, 9, 6.3, 0, 'dome')] });
  for (const [x, z] of ATOM.towers) { const o = cloneKit('P_CoolTower'); o.position.set(x, 0, z); o.rotation.y = x * 0.1; G.scene.add(o); A.props.push({ obj: o, sol: [addSolid(x, z, 17, 17, 30, 0, 'tower')] }); }
  G.atomFix = 0; G.atomBonus = 0; G.atomSick = 0; G.bloatHunts = 0; G.bloatBursts = 0; G.bloatPops = 0; G.decayDmg = 0; G.decaySpreads = 0; G.deconT = 0;
}
function plumeGoal(Z) { for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, r = 40 + Math.random() * (ATOM.rMax - 40); Z.tx = Math.cos(a) * r; Z.tz = Math.sin(a) * r; if (Math.hypot(Z.tx - Z.x, Z.tz - Z.z) > 35) break; } }
export function clearAtom() {
  const A = G.atom; for (const v of RADZ.uR.value) v.set(0, 0, 0, 0);
  if (!A) return;
  for (const P of A.pumps) { P.obj.parent && P.obj.parent.remove(P.obj); P.ring.parent && P.ring.parent.remove(P.ring); P.ring.material.dispose(); removeSolid(P.sol); }
  for (const D of A.pads) D.obj.parent && D.obj.parent.remove(D.obj);
  for (const Q of A.props) { Q.obj.parent && Q.obj.parent.remove(Q.obj); for (const so of Q.sol) removeSolid(so); }
  G.atom = null;
}
export function atomPuddle(x, z, r = ATOM.puddleR, t = ATOM.puddleT) { const A = G.atom; if (!A) return; A.zones.push({ x, z, r, k: ATOM.dose * 1.2, w: 1, src: 'puddle', t, t0: t }); }
function updateAtom(dt) {
  const A = G.atom, P = G.player; if (!A) return;
  const all = A.fixed >= A.pumps.length;
  // core heat: rises all mission, each restarted pump cuts the rate; all four restarted and it cools down
  if (!A.melted) {
    if (all) A.heat = Math.max(0, A.heat - ATOM.cool * dt); else A.heat = Math.min(100, A.heat + ATOM.heat0 * (1 - ATOM.pumpCut * A.fixed) * dt);
    A.peak = Math.max(A.peak, A.heat); if (A.heat >= 100) { A.melted = true; G.onMeltdown && G.onMeltdown(); }
    if (!A.hot && A.heat > 75) { A.hot = true; G.onAtomHot && G.onAtomHot(); }
  }
  A.core.r = ATOM.coreR0 + A.heat * ATOM.coreRk;
  // pumps: stand next to one, low, to restart it
  for (const Q of A.pumps) {
    if (Q.fixed) { Q.zone.w = Math.max(0, Q.zone.w - dt / ATOM.zoneFade); if (Q.n.CP_Wheel) Q.n.CP_Wheel.rotation.y += dt * 0.6; continue; }
    const near = P && P.alive && Math.hypot(P.pos.x - Q.x, P.pos.z - Q.z) < ATOM.pumpR + 1 && P.pos.y - groundAt(P.pos.x, P.pos.z, P.pos.y + 1) < 6;
    let cont = false;
    if (near) for (const e of G.enemies) { if (!e.alive || e.dying || !e.pos || e.hacked || e.isObjective || e.kind === 'drone' || e.kind === 'bloater' || e.kind === 'boss' || e.kind === 'gunship') continue; if (Math.hypot(e.pos.x - Q.x, e.pos.z - Q.z) < ATOM.contR && e.pos.y - groundAt(e.pos.x, e.pos.z, e.pos.y + 1) < 6) { cont = true; break; } }
    Q.cont = cont; if (near) A.at = Q; else if (A.at === Q) A.at = null;
    Q.k = near ? (cont ? Q.k : Q.k + dt / ATOM.fixT) : Math.max(0, Q.k - dt * ATOM.fixDecay);
    Q.ring.material.color.setHex(cont ? 0xff4030 : 0xffd040);
    if (near && !Q.said) { Q.said = true; G.onPumpStart && G.onPumpStart(Q); }
    if (near && Q.n.CP_Wheel) Q.n.CP_Wheel.rotation.y += dt * 4;
    Q.ring.material.opacity = 0.35 + 0.4 * Q.k + (near ? Math.sin(G.time * 12) * 0.1 : 0); Q.ring.scale.setScalar(1 - 0.5 * Math.min(1, Q.k));
    if (near && Math.random() < 0.3) G.fx.sparks(_a.set(Q.x + (Math.random() - 0.5) * 3, 2 + Math.random() * 2, Q.z + (Math.random() - 0.5) * 3), null, 2, 0xd0f4ff, 6, 1, 0.3, 0.15);
    if (Q.k >= 1) {
      Q.fixed = true; A.fixed++; G.atomFix++; Q.ring.visible = false;
      if (Q.n.CP_Lamp) Q.n.CP_Lamp.traverse((o) => { if (o.isMesh) o.material = Q.green; });
      G.fx.flash(new V3(Q.x, 5, Q.z), 0x80ffd0, 60, 40, 0.4); G.fx.ring(new V3(Q.x, 0.6, Q.z), null, 2, 26, 0.6, 0x80ffd0);
      for (let k = 0; k < 14; k++) G.fx.emit('smoke', { x: Q.x + (Math.random() - 0.5) * 4, y: 4 + Math.random() * 2, z: Q.z + (Math.random() - 0.5) * 4, vy: 4 + Math.random() * 3, life: 2.2, s0: 1.5, s1: 5, c0: 0xe8ecef, c1: 0xc0c6cc, a0: 0.5, drag: 1 });
      sfx('repair', 0); G.onPumpFixed && G.onPumpFixed(Q, A);
    }
  }
  // drifting plumes (they die down once the core is safe), puddles fade
  for (let i = A.zones.length - 1; i >= 0; i--) {
    const Z = A.zones[i];
    if (Z.src === 'plume') {
      if (all) Z.w = Math.max(0, Z.w - dt / 8);
      const dx = Z.tx - Z.x, dz = Z.tz - Z.z, L = Math.hypot(dx, dz);
      if (L < 4) plumeGoal(Z); else { Z.x += dx / L * ATOM.plumeSpd * dt; Z.z += dz / L * ATOM.plumeSpd * dt; }
    } else if (Z.src === 'puddle') { Z.t -= dt; Z.w = Math.min(1, Z.t / 2); if (Z.t <= 0) { A.zones.splice(i, 1); continue; } }
    else if (Z.src === 'core' && all) Z.w = Math.max(0.35, Z.w - dt / 12);
  }
  let vi = 0;
  for (const Z of A.zones) { if (vi >= 8) break; if (Z.w <= 0.01 || Z.r < 1) continue; RADZ.uR.value[vi++].set(Z.x, Z.z, Z.r, Z.w); }
  for (; vi < 8; vi++) RADZ.uR.value[vi].set(0, 0, 0, 0);
  // floating motes over the zones, steam over the towers
  for (const Z of A.zones) { if (Z.w <= 0.05) continue; if (Math.random() < Z.r * Z.r * 0.0006 * Z.w) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * Z.r; G.fx.emit('add', { x: Z.x + Math.cos(a) * r, y: 0.4 + Math.random() * 3, z: Z.z + Math.sin(a) * r, vy: 0.8 + Math.random(), life: 1.6, s0: 0.35, s1: 0.1, c0: 0xb0ff50 }); } }
  A.plT -= dt;
  if (A.plT <= 0) { A.plT = 0.22; for (const [x, z] of ATOM.towers) G.fx.emit('smoke', { x: x + (Math.random() - 0.5) * 10, y: 30, z: z + (Math.random() - 0.5) * 10, vx: 1.2, vy: 3 + Math.random() * 2, life: 5, s0: 5, s1: 13, c0: 0xe6e8e4, c1: 0xbcc0bc, a0: 0.38, drag: 0.3 }); }
  // the player's dose
  if (P && P.alive) {
    const gy = groundAt(P.pos.x, P.pos.z, P.pos.y + 1), rr = radAt(P.pos.x, P.pos.z, P.pos.y - gy);
    A.rate = rr;
    let pad = null; for (const D of A.pads) { D.on = Math.hypot(P.pos.x - D.x, P.pos.z - D.z) < ATOM.deconR && P.pos.y - gy < 4; if (D.on) pad = D; }
    if (pad) { A.dose = Math.max(0, A.dose - ATOM.deconK * dt); G.deconT += dt; if (Math.random() < 0.8) G.fx.emit('add', { x: pad.x + (Math.random() - 0.5) * 6, y: 5, z: pad.z + (Math.random() - 0.5) * 2, vy: -6, life: 0.6, s0: 0.3, s1: 0.1, c0: 0xc8f0ff }); }
    else if (rr > 0) A.dose += rr * dt;
    else A.dose = Math.max(0, A.dose - ATOM.decayP * dt);
    A.peakDose = Math.max(A.peakDose, A.dose);
    if (rr > 0 && !A.doseSaid) { A.doseSaid = true; G.onDose && G.onDose(); }
    if (A.dose > ATOM.sick) {
      A.sickAcc += ATOM.sickDps * dt;
      if (A.sickAcc >= 4) { G.curSrc = null; damagePlayer(A.sickAcc, null, 'radiation'); G.atomSick += A.sickAcc; A.sickAcc = 0; if (!A.sickSaid) { A.sickSaid = true; G.onSick && G.onSick(); } }
    }
  }
  for (const D of A.pads) if (D.n.DC_Spray) D.n.DC_Spray.scale.setScalar(D.on ? 1.3 + 0.2 * Math.sin(G.time * 20) : 1);
}

// bloater: a floating hazard tank. It drifts to the nearest radiation zone, soaks it up for 7 s (swelling and glowing),
// then hunts you at 15 m/s and bursts beside you (40 damage, +45 rad). Shoot it before it is full and it just pops;
// shoot it full and it bursts where it is, hurting enemies around it and leaving a radiation puddle
export const BLOAT = { hp: 520, r: 1.9, hover: 4.5, speed: 9, hunt: 15, feed: 6, boomR: 9, dmg: 40, dose: 45, popDose: 25, eDmg: 140, huntT: 16 };
export class Bloater extends Enemy {
  constructor(pos) {
    super('bloater', 'E_Bloater', pos, BLOAT.hp, BLOAT.r); this.boom = 0.8;
    this.vel = new V3(); this.st = 'seek'; this.charge = 0; this.zone = null; this.zT = 0; this.ph = Math.random() * 6; this.huntT = 0; this.off = new V3();
    this.pos.y = groundAt(pos.x, pos.z, 40) + BLOAT.hover; this.c.copy(this.pos);
  }
  pickZone() {
    const A = G.atom; let best = null, bd = 1e9;
    if (A) for (const Z of A.zones) { if (Z.w < 0.3 || Z.r < 5) continue; const d = Math.hypot(Z.x - this.pos.x, Z.z - this.pos.z) - Z.r + (Z.src === 'core' ? 25 : 0); if (d < bd) { bd = d; best = Z; } }
    this.zone = best; if (best) { const a = Math.random() * 6.28, r = Math.random() * best.r * 0.5; this.off.set(Math.cos(a) * r, 0, Math.sin(a) * r); }
  }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC), n = this.n; this.ph += dt;
    let gx = 0, gz = 0, gyT = groundAt(this.pos.x, this.pos.z, this.pos.y + 1) + BLOAT.hover, spd = BLOAT.speed;
    if (this.st === 'seek') {
      this.zT -= dt; if (this.zT <= 0 || !this.zone || this.zone.w < 0.3) { this.zT = 3; this.pickZone(); }
      if (!this.zone) { this.charge = Math.min(1, this.charge + dt / (BLOAT.feed * 3)); if (this.charge >= 1) this.goHunt(); gx = pc.x; gz = pc.z; spd *= 0.4; }
      else {
        gx = this.zone.x + this.off.x; gz = this.zone.z + this.off.z;
        if (Math.hypot(this.pos.x - this.zone.x, this.pos.z - this.zone.z) < this.zone.r * 0.75) { this.st = 'feed'; G.onBloatFeed && G.onBloatFeed(this); }
      }
    } else if (this.st === 'feed') {
      gx = this.pos.x + Math.sin(this.ph * 0.7) * 3; gz = this.pos.z + Math.cos(this.ph * 0.6) * 3; spd = 2; gyT -= 1.5;
      const inZ = this.zone && this.zone.w > 0.2 && Math.hypot(this.pos.x - this.zone.x, this.pos.z - this.zone.z) < this.zone.r + 2;
      if (!inZ) { this.st = 'seek'; this.zT = 0; }
      else { this.charge = Math.min(1, this.charge + dt / BLOAT.feed); if (Math.random() < 0.5) G.fx.emit('add', { x: this.pos.x + (Math.random() - 0.5) * 8, y: 0.5, z: this.pos.z + (Math.random() - 0.5) * 8, vy: 3, life: 0.8, s0: 0.4, s1: 0.1, c0: 0xb0ff50 }); }
      if (this.charge >= 1) this.goHunt();
    } else if (this.st === 'hunt') {
      this.huntT -= dt; gx = pc.x; gz = pc.z; gyT = Math.max(gyT - 2, pc.y + 0.5); spd = BLOAT.hunt;
      if (this.c.distanceTo(pc) < 4.2 && tg === G.player) { this.burst(true); return; }
      if (this.huntT <= 0) { this.burst(true); return; }
      if (Math.random() < 0.5) G.fx.emit('add', { x: this.pos.x, y: this.pos.y, z: this.pos.z, life: 0.4, s0: 1.0, s1: 0.2, c0: 0xa0ff40 });
    }
    const dx = gx - this.pos.x, dz = gz - this.pos.z, L = Math.hypot(dx, dz) || 1, kk = 1 - Math.exp(-(this.st === 'hunt' ? 3 : 1.8) * dt);
    const sp = spd * Math.min(1, L / 5 + 0.2);
    this.vel.x += (dx / L * sp - this.vel.x) * kk; this.vel.z += (dz / L * sp - this.vel.z) * kk;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 1.8, 2)) { this.pos.x -= this.vel.x * dt; this.pos.z -= this.vel.z * dt; this.vel.multiplyScalar(-0.3); this.climb = 2; }
    if (this.climb > 0) { this.climb -= dt; gyT += 12; }
    const vy = this.st === 'hunt' ? 6 : 2.5;
    this.pos.y += Math.max(-vy * dt, Math.min(vy * dt, (gyT + Math.sin(this.ph * 1.9) * 0.4 - this.pos.y) * Math.min(1, dt * 3)));
    const sw = 1 + 0.6 * this.charge + (this.st === 'hunt' ? 0.06 * Math.sin(this.ph * 30) : 0.03 * Math.sin(this.ph * 4));
    if (n.BF_Shell) n.BF_Shell.scale.setScalar(sw);
    if (n.BF_Core) n.BF_Core.scale.setScalar(sw * (0.9 + 0.3 * this.charge + (this.st === 'hunt' ? 0.15 * Math.sin(this.ph * 25) : 0)));
    if (n.BF_Fins) { n.BF_Fins.rotation.z += dt * (this.st === 'hunt' ? 18 : 4); n.BF_Fins.position.z = -1.05 * sw; }
    this.r = BLOAT.r * sw; this.obj.rotation.set(Math.sin(this.ph) * 0.1, this.ph * 0.4, Math.cos(this.ph * 1.3) * 0.1, 'YXZ');
    this.c.copy(this.pos);
  }
  goHunt() { this.st = 'hunt'; this.huntT = BLOAT.huntT; this.charge = 1; G.bloatHunts++; sfx('warn', G.player ? G.player.pos.distanceTo(this.pos) * 0.5 : 0); G.onBloatHunt && G.onBloatHunt(this); }
  burst(self) {
    if (this.gone) return;
    const at = this.c.clone(), P = G.player;
    this.alive = false; this.dying = true;
    if (!self) { G.stats.kills++; G.onKill && G.onKill(this); }
    G.curLabel = self ? 'ally-bloat' : 'bloater-burst'; explodeAt(at, BLOAT.boomR, BLOAT.eDmg, 'P', 1.6, 0x9cff3a); G.curLabel = null;
    if (P && P.alive) { const d = P.center(_c).distanceTo(at); if (d < BLOAT.boomR + 1) { const f = 1 - Math.max(0, d - 2) / BLOAT.boomR * 0.6; G.curSrc = at; damagePlayer(BLOAT.dmg * f * (self ? 1 : 0.6), at, 'bloater'); if (G.atom) G.atom.dose += (self ? BLOAT.dose : BLOAT.popDose) * f; } }
    G.fx.flash(at, 0x9cff3a, 50, 30, 0.4); G.fx.ring(at.clone().setY(groundAt(at.x, at.z, at.y) + 0.5), null, 1, BLOAT.boomR + 2, 0.5, 0x9cff3a);
    atomPuddle(at.x, at.z);
    G.bloatBursts++; this.remove();
  }
  die() {
    if (this.charge >= 0.5) { this.burst(false); return; }
    G.bloatPops++; Enemy.prototype.die.call(this);
  }
}

// IS-3 isotope rifle: every hit adds a decay stack (up to 6, 5 damage/s each, 4 s without a refresh and it fades);
// an enemy with 2+ stacks that dies passes its stacks to every enemy within 12 m
export const DECAY = { dps: 5, max: 6, T: 4, boss: 0.5, R: 12, min: 2 };
function decayAdd(e, n) {
  const h = e.kind === 'cpart' ? e.owner : e; if (!h || !h.alive || h.isBarrel || h.isPlayer || h.isMine || h.isAlly || h.holo) return;
  h.decay = Math.min(DECAY.max, Math.max(h.decay || 0, 0) + n); h.decT = DECAY.T;
}
function decayTick(e, dt) {
  e.decT -= dt; if (e.decT <= 0 || !e.alive || e.dying) { e.decay = 0; e.decT = 0; return; }
  e.decAcc = (e.decAcc || 0) + DECAY.dps * e.decay * dt * (e.maxHp > 3000 || e.kind === 'boss' ? DECAY.boss : 1);
  if (e.decAcc >= 6) { const dm = e.decAcc; e.decAcc = 0; G.curLabel = 'isotope-decay'; dealDamage(e, dm, 'P', e.c, 'isotope-decay'); G.curLabel = null; G.stats.shots++; G.decayDmg = (G.decayDmg || 0) + dm; }
  if (e.c && Math.random() < 0.06 * e.decay) G.fx.emit('add', { x: e.c.x + (Math.random() - 0.5) * 2.5, y: e.c.y + (Math.random() - 0.5) * 2, z: e.c.z + (Math.random() - 0.5) * 2.5, vy: 1.5, life: 0.5, s0: 0.5, s1: 0.1, c0: 0x9cff40 });
}
export function decaySpread(e) {
  if (!(e.decay >= DECAY.min) || !e.c) return;
  let n = 0;
  for (const o of G.enemies) {
    if (o === e || !o.alive || o.dying || !o.c || o.isBarrel || o.isMine || o.holo || o.hacked) continue;
    if (o.c.distanceTo(e.c) > DECAY.R + (o.r || 1.5) * 0.5) continue;
    decayAdd(o, Math.max(0, e.decay - (o.decay || 0)));
    n++; G.fx.streak(e.c.clone(), o.c.clone(), 0.12, 0x9cff40);
  }
  if (n) { G.decaySpreads = (G.decaySpreads || 0) + n; G.fx.ring(e.c.clone(), null, 1, DECAY.R, 0.4, 0x9cff40); }
}

// forklift: lobs explosive barrels from its forks. While a barrel sits on the forks the forklift takes x1.5 damage, and
// 150 damage dealt in that window sets the barrel off on the forklift itself
export const FORK = { hp: 1100, r: 2.4, speed: 6, keep: [25, 45], reload: 1.2, load: 3, aim: 0.8, dmg: 45, splash: 7, vuln: 1.5, pop: 150, popDmg: 320, popR: 7, popE: 45, range: 70 };
export class Forklift extends Enemy {
  constructor(pos) {
    super('forklift', 'E_Fork', pos, FORK.hp, FORK.r); this.boom = 1.2;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6; this.vel = new V3(); this.st = 'load'; this.t = FORK.load * (0.4 + Math.random() * 0.5); this.ph = Math.random() * 6; this.bDmg = 0;
    this.stuckT = 0; this.sideT = 0; this.side = Math.random() < 0.5 ? 1 : -1; this.last = this.pos.clone(); this.c.set(this.pos.x, this.pos.y + 1.6, this.pos.z); this.fork = 0;
  }
  drive(tx, tz, spd, dt) { return Engineer.prototype.drive.call(this, tx, tz, spd, dt); }
  get loaded() { return this.st === 'load' || this.st === 'aim'; }
  hit(dmg, at) {
    if (this.alive && !this.dying && this.loaded) {
      dmg *= FORK.vuln; this.bDmg += dmg;
      if (this.bDmg >= FORK.pop) { this.st = 'reload'; this.t = FORK.reload * 2; this.bDmg = 0; const bp = this.n.FK_Barrel ? this.n.FK_Barrel.getWorldPosition(new V3()) : this.c.clone(); G.forkPops = (G.forkPops || 0) + 1; if (this.n.FK_Barrel) this.n.FK_Barrel.visible = false; G.curLabel = 'fork-pop'; explodeAt(bp, FORK.popR, FORK.popE, 'X', 1.6, 0xff6020); super.hit(FORK.popDmg); G.onForkPop && G.onForkPop(); return; }
    }
    super.hit(dmg);
  }
  update(dt) {
    const t = this.tg(), n = this.n; this.ph += dt;
    const tc = t.center ? t.center(playerC) : t.pos;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
    if (dl > FORK.keep[1]) this.drive(t.pos.x, t.pos.z, FORK.speed, dt);
    else if (dl < FORK.keep[0]) this.drive(this.pos.x - dx / dl * 12, this.pos.z - dz / dl * 12, FORK.speed * 0.8, dt);
    else { const sx = -dz / dl * this.side, sz = dx / dl * this.side; this.drive(this.pos.x + sx * 8, this.pos.z + sz * 8, FORK.speed * 0.45, dt); this.sideT2 = (this.sideT2 || 4) - dt; if (this.sideT2 <= 0) { this.sideT2 = 3 + Math.random() * 3; this.side *= -1; } }
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 2) - this.pos.y) * Math.min(1, dt * 8);
    const want = Math.atan2(-dx, -dz); this.yaw2 = (this.yaw2 ?? want) + angDiff(want, this.yaw2 ?? want) * Math.min(1, dt * 3);
    this.obj.rotation.set(0, this.yaw2, 0);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    for (let i = 1; i <= 4; i++) if (n['FK_W' + i]) n['FK_W' + i].rotation.x += sp * dt / 0.55;
    this.c.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    this.t -= dt;
    const fwant = this.st === 'aim' ? 2.2 : this.st === 'load' ? 0.6 : 0;
    this.fork += (fwant - this.fork) * Math.min(1, dt * 4);
    if (n.FK_Fork) n.FK_Fork.position.y = 0.45 + this.fork;
    if (n.FK_Barrel) { n.FK_Barrel.visible = this.loaded; n.FK_Barrel.scale.setScalar(this.st === 'load' ? Math.min(1, (FORK.load - this.t) / 0.4 + 0.2) : 1); if (this.st === 'aim') n.FK_Barrel.rotation.y = Math.sin(this.ph * 40) * 0.08; }
    if (this.st === 'reload') { if (this.t <= 0) { this.st = 'load'; this.t = FORK.load; this.bDmg = 0; } }
    else if (this.st === 'load') { if (this.t <= 0 && dl < FORK.range && this.checkLos(dt)) { this.st = 'aim'; this.t = FORK.aim; } }
    else if (this.st === 'aim') {
      if (this.t <= 0) {
        this.st = 'reload'; this.t = FORK.reload; this.bDmg = 0;
        const mp = n.FK_Barrel ? n.FK_Barrel.getWorldPosition(new V3()) : new V3(this.pos.x, this.pos.y + 2.5, this.pos.z);
        const D = Math.hypot(t.pos.x - mp.x, t.pos.z - mp.z), Tf = 1.0 + D / 42, g = 22;
        const aim = new V3().copy(tc).addScaledVector(t.vel || _c.set(0, 0, 0), Tf * 0.7);
        const gy = groundAt(aim.x, aim.z, aim.y + 1), low = aim.y - gy < 4; if (low) aim.y = gy;
        const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
        G.curShooter = this; spawnShot({ p: mp, v, dmg: FORK.dmg, team: 'E', kind: 'shell', splash: FORK.splash, life: Tf + 1, grav: g, label: 'fork-barrel', color: 0xff3818, size: 2.2 }); G.curShooter = null;
        if (low) G.fx.warn(aim, FORK.splash, Tf);
        G.forkThrows = (G.forkThrows || 0) + 1; sfx('eshell', dl);
      }
    }
  }
}

// TB-3 tractor beam: hold to grab a light enemy (or an explosive barrel) near the aim, it floats stunned in front of you;
// release (or after 4 s) to hurl it; it detonates on whatever it hits
G.tbeams = [];
const TRACT_OK = new Set([...PULLABLE, 'forklift', 'torcher', 'leech', 'blinker', 'pulsar', 'dazzler', 'planter', 'engineer', 'scavenger', 'snatcher', 'eel', 'frost', 'disarmer', 'leaper']);
function tractorOk(e) { return e.alive && !e.dying && e.obj && e.pos && !e.isObjective && !e.solids && !e.tbHeld && !e.parts && TRACT_OK.has(e.kind) && e.maxHp <= 1300 * G.diff.hp; }
function tractorPick(mp, aim, d) {
  const dir = _b.subVectors(aim, mp).normalize().clone(), cc = Math.cos(d.cone);
  let best = null, bs = -1e9;
  const test = (c, ent, isB) => {
    const v = _c.subVectors(c, mp), L = v.length(); if (L > d.range || L < 2) return;
    const k = v.dot(dir) / L; if (k < cc) return;
    if (!isB && !clearLine(mp, c)) return;
    const sc = k * 2 - L / 90; if (sc > bs) { bs = sc; best = { ent, isB }; }
  };
  for (const e of G.enemies) if (tractorOk(e)) test(e.c, e, false);
  for (const b of barrels) if (!b.dead && !b.held) test(b.pos, b, true);
  return best;
}
function tractorGrab(owner, slot, d, mul, tg) {
  const B = { owner, slot, d, mul, ent: tg.ent, isB: tg.isB, st: 'hold', t: 0, vel: new V3(), P: new V3(), spin: new V3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6) };
  if (tg.isB) { const b = tg.ent; b.held = true; removeSolid(b.solid); B.P.copy(b.pos); }
  else { const e = tg.ent; e.tbHeld = true; e.stunT = Math.max(e.stunT || 0, 0.5); e.stunMax = e.stunT; B.off = new V3().subVectors(e.c, e.pos); B.P.copy(e.pos); if (e.vel) e.vel.set(0, 0, 0); }
  G.tbeams.push(B); G.tbGrabs = (G.tbGrabs || 0) + 1; if (tg.isB) G.tbBarrelGrabs = (G.tbBarrelGrabs || 0) + 1;
  G.fx.ring(tg.isB ? tg.ent.pos : tg.ent.c, null, 1, 4, 0.3, 0x40ffc0); sfx('hook', 0);
  return B;
}
function tbAlive(B) { return B.isB ? !B.ent.dead : B.ent.alive && !B.ent.dying && !B.ent.gone; }
function tbSet(B, p) {
  if (B.isB) { const b = B.ent; b.pos.copy(p); b.obj.position.set(p.x, p.y - 0.8, p.z); }
  else { const e = B.ent; e.pos.copy(p); if (e.c !== e.pos) e.c.copy(p).add(B.off); }
}
function tractorThrow(B, aim) {
  if (B.st !== 'hold') return;
  B.st = 'fly'; B.t = 0;
  const own = B.owner, oc = own.center(new V3()), fw = new V3().subVectors(aim, oc);
  if (fw.length() < 10 || aim.distanceTo(B.P) < 5) fw.set(-Math.sin(own.aimYaw), 0.05, -Math.cos(own.aimYaw));
  fw.normalize();
  let best = null, bs = -1e9; const cc = Math.cos(G.tbWide ? 1.3 : 0.7);
  for (const e of G.enemies) {
    if (!e.alive || e.dying || e === B.ent || !e.c || e.cloaked || e.hacked) continue;
    const v = _a.subVectors(e.c, B.P), L = v.length(); if (L > 95 || L < 3) continue;
    const k = v.dot(fw) / L; if (k < cc) continue;
    const sc = k * 2 - L / 60 + (e.isObjective ? 0.3 : 0); if (sc > bs) { bs = sc; best = e; }
  }
  if (best) { const L = best.c.distanceTo(B.P), Tf = L / B.d.speed; fw.copy(best.c).addScaledVector(best.vel || _c.set(0, 0, 0), Tf * 0.8).sub(B.P); fw.y += 0.5 * 18 * Tf * Tf; fw.normalize(); }
  else fw.y += 0.06;
  B.vel.copy(fw).multiplyScalar(B.d.speed);
  G.tbThrows = (G.tbThrows || 0) + 1; sfx('grenade', 0);
  G.fx.ring(B.P, null, 1, 3, 0.25, 0x40ffc0);
}
function tractorImpact(B, hitE) {
  const p = B.P.clone(), d = B.d;
  const prev = G.curLabel; G.curLabel = 'p-tractor';
  if (B.isB) { const b = B.ent; b.dead = true; b.held = false; b.obj.visible = false; explodeAt(p, 9, 170, 'X', 1.8); G.tbBarrelBooms = (G.tbBarrelBooms || 0) + 1; }
  else {
    const e = B.ent; e.tbHeld = false; e.obj.rotation.x = 0; e.obj.rotation.z = 0;
    if (e.pos.y < groundAt(e.pos.x, e.pos.z, e.pos.y + 3)) e.pos.y = groundAt(e.pos.x, e.pos.z, e.pos.y + 3);
    explodeAt(p, d.r, d.dmg * B.mul, 'P', 1.4, 0x40ffc0);
    if (e.alive && !e.dying) { dealDamage(e, d.selfDmg * B.mul, 'P', e.c, 'p-tractor'); if (e.alive) { e.stunT = Math.max(e.stunT || 0, 0.8); e.stunMax = e.stunT; } }
  }
  if (hitE) G.tbHits = (G.tbHits || 0) + 1;
  G.curLabel = prev; G.fx.flash(p, 0x40ffc0, 30, 18, 0.25);
}
function updateTBeams(dt) {
  for (let i = G.tbeams.length - 1; i >= 0; i--) {
    const B = G.tbeams[i], own = B.owner; B.t += dt;
    if (!tbAlive(B)) { if (!B.isB) B.ent.tbHeld = false; G.tbeams.splice(i, 1); continue; }
    if (B.st === 'hold') {
      if (!own.alive) { tractorThrow(B, own.center(new V3())); continue; }
      const fw = _a.set(-Math.sin(own.aimYaw), 0, -Math.cos(own.aimYaw)), oc = own.center(_b);
      const tx = oc.x + fw.x * 7.5, ty = oc.y + 1.2 + Math.sin(B.t * 4) * 0.3, tz = oc.z + fw.z * 7.5, k = 1 - Math.exp(-10 * dt);
      B.P.x += (tx - B.P.x) * k; B.P.y += (ty - B.P.y) * k; B.P.z += (tz - B.P.z) * k;
      tbSet(B, B.P);
      if (!B.isB) { const e = B.ent; e.stunT = Math.max(e.stunT || 0, 0.3); e.stunMax = Math.max(e.stunMax || 0, e.stunT); if (e.vel) e.vel.set(0, 0, 0); e.obj.rotation.y += dt * 1.6; }
      const mp = own.muzzlePos(B.slot, new V3(), 0), tp = B.isB ? B.ent.pos : B.ent.c, fl = 0.8 + Math.random() * 0.4;
      G.fx.streak(mp, tp, 0.5 * fl, 0x40ffc0); G.fx.streak(mp, tp, 0.16 * fl, 0xd8fff0);
      if (Math.random() < 0.4) G.fx.emit('add', { x: tp.x + (Math.random() - 0.5) * 3, y: tp.y + (Math.random() - 0.5) * 3, z: tp.z + (Math.random() - 0.5) * 3, vx: (mp.x - tp.x) * 0.6, vy: (mp.y - tp.y) * 0.6, vz: (mp.z - tp.z) * 0.6, life: 0.35, s0: 0.5, s1: 0.1, c0: 0x80ffd8 });
      B.sndT = (B.sndT || 0) - dt; if (B.sndT <= 0) { B.sndT = 0.5; sfx('reel', 0); }
    } else {
      const steps = 3, sdt = dt / steps; let hit = null, done = false;
      for (let s2 = 0; s2 < steps && !done; s2++) {
        B.vel.y -= 18 * sdt; B.P.addScaledVector(B.vel, sdt);
        for (const e of G.enemies) {
          if (!e.alive || e.dying || e === B.ent || !e.c || e.hacked) continue;
          if (e.c.distanceTo(B.P) < (e.r || 2) + 1.4) { hit = e; done = true; break; }
        }
        if (!done && (pointInSolid(B.P, 0.4) || B.P.y <= groundAt(B.P.x, B.P.z, B.P.y + 2) + 0.5 || B.t > 3)) done = true;
      }
      tbSet(B, B.P);
      if (!B.isB) { B.ent.obj.rotation.x += B.spin.x * dt; B.ent.obj.rotation.z += B.spin.z * dt; B.ent.stunT = Math.max(B.ent.stunT || 0, 0.3); }
      if (Math.random() < 0.6) G.fx.emit('add', { x: B.P.x, y: B.P.y, z: B.P.z, life: 0.3, s0: 1.4, s1: 0.2, c0: 0x40ffc0 });
      if (done) { tractorImpact(B, hit); G.tbeams.splice(i, 1); }
    }
  }
}
export function clearTBeams() {
  for (const B of G.tbeams) { if (B.isB) { B.ent.held = false; } else B.ent.tbHeld = false; }
  G.tbeams.length = 0;
}

export function updateCombat(dt) {
  RAYF.skipIce = false;
  updateHitFlash(dt);
  for (let i = G.queue.length - 1; i >= 0; i--) { const q = G.queue[i]; q.t -= dt; if (q.t <= 0) { G.queue.splice(i, 1); G.curLabel = q.label; if (q.sh && (q.sh.hacked || q.sh.gooT > 0 || (G.polar && q.sh.pol))) G.curShooter = q.sh; q.fn(); G.curShooter = null; } }
  const hers = G.enemies.filter((e) => e.kind === 'herald' && e.alive && !e.dying && !(e.stunT > 0));
  for (const e of G.enemies) {
    G.curLabel = e.kind; if (e.pingT > 0) e.pingT -= dt;
    e.rally = false; if (hers.length && e.kind !== 'herald' && e.pos && e.alive && !e.dying) for (const h of hers) if (Math.hypot(h.pos.x - e.pos.x, h.pos.z - e.pos.z) < HERALD.R) { e.rally = true; break; }
    if (e.decT > 0) decayTick(e, dt);
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
    const netted = e.netT > 0 && !e.isCourier, netBig = netted && (e.maxHp > 3000 || e.kind === 'boss' || e.kind === 'raider'), nx = e.pos ? e.pos.x : 0, nz = e.pos ? e.pos.z : 0;
    if (e.bubSlow > 0) e.bubSlow -= dt;
    const fzD = G.hf && G.hf.h === e && fuseDrives(e), fx0 = fzD ? e.pos.x : 0, fy0 = fzD ? e.pos.y : 0, fz0 = fzD ? e.pos.z : 0;
    G.curShooter = e; e.update((e.chill > 0 ? dt * (1 - 0.4 * e.chill / 100) : dt) * sk * (e.rally ? HERALD.spd : 1) * (netBig ? 0.6 : 1) * (e.bubSlow > 0 ? BUB.slow : 1)); G.curShooter = null;
    if (fzD && e.alive && !e.dying) fuseDrive(e, dt, fx0, fy0, fz0);
    if (e.netT > 0) { e.netT -= dt; if (netted && !netBig && e.pos && e.alive) { e.pos.x = nx; e.pos.z = nz; } netVisual(e); } else if (e.netMesh) netVisual(e);
    if (e.flash > 0) e.flash -= dt;
  }
  const pp = G.player; G.jammed = null;
  if (pp && pp.alive) for (const e of G.enemies) if (e.kind === 'jammer' && e.alive && !e.dying && !(e.stunT > 0) && !(e.markT > 0) && e.c.distanceTo(pp.pos) < JAM_R) { G.jammed = e; break; }
  if (G.jammed && !G.jamSaid) { G.jamSaid = true; G.onHint && G.onHint('电子干扰 · 锁定与雷达失效 · 击落紫色的干扰机，或用电磁脉冲瘫痪它', 4); }
  if (PLAT.R) for (const e of G.enemies) {   // sky elevator: nothing that walks or hovers leaves the deck
    if (!e.pos || !e.alive || e.kind === 'jet' || e.kind === 'dropship') continue;
    const d = Math.hypot(e.pos.x, e.pos.z), lim = PLAT.R - 3; if (d > lim) { e.pos.x *= lim / d; e.pos.z *= lim / d; }
  }
  for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].gone) { const e = G.enemies[i]; if (e.netMesh) { e.netMesh.parent && e.netMesh.parent.remove(e.netMesh); e.netMesh = null; } G.enemies.splice(i, 1); }
  G.curLabel = null;
  LAVA.uT.value = G.time;
  if (G.blinkInv > 0) G.blinkInv -= dt;
  recordRewind(dt); updateFog(dt); updateDepots(dt); updateSalvage(dt); updateFort(dt); updateReflect(dt); updateLane(dt); updateVeil(dt); updateRBeam(dt); updateBurn(dt); updateBeacon(dt); updateLance(dt); updateGrav(dt); updatePursuit(dt); updateFires(dt); updateNets(dt); updateSky(dt); updateCiws(dt); updateWebs(dt); updateHacks(dt); updateEvac(dt); updateCamo(dt); updateWrecks(dt); updateSabot(dt); updateDecap(dt); updateLinkB(dt); if (G.dazzleT > 0) G.dazzleT -= dt;
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
  updateWells(dt); updateAG(dt);
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
  updateMaze(dt); updateRings(dt); updateBWalls(dt); updateFactory(dt); updateTBeams(dt); updateTsunami(dt); updateNano(dt); updateBio(dt); updatePlOrbs(dt); updateAtom(dt); updateSaws(dt); updateTurf(dt); updateGoo(dt); updateBubbles(dt); updateFuse(dt); updateScram(dt); updatePolar(dt); updateJavs(dt); updateCTF(dt); updateBH(dt); updateAerie(dt); updateHunted(dt); updateGlad(dt);
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


// ------------------------------------------------------------------ v57 Coliseum: the crowd's HYPE (0-100) rises with kills
// (more for switching weapons, killing in the air, multi-kills and luring enemies into the flame vents) and drains while
// you fight; at 80+ the crowd is in a frenzy (damage x1.25, they throw repair kits), at 25 or less they boo and throw
// junk at you, and 7 s at zero gets you thrown out. Thirteen flame vents in the sand erupt on their own cycles
export const GLAD = { R: 116, gateR: 115.5, gateA: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
  vents: [[0, 0], [46, 0], [-46, 0], [0, 46], [0, -46], [57, 57], [-57, 57], [57, -57], [-57, -57], [86, 0], [-86, 0], [0, 86], [0, -86]],
  ventR: 5.2, ventH: 11, warn: 1.6, fire: 2.6, idle: [5, 9], pDps: 30, eDps: 70, bDps: 12,
  h0: 55, decay: 1.6, bored: 2.0, boredT: 2.5, kill: 4, small: 0.5, big: 2.5, vary: 0.5, air: 0.4, airH: 5, multi: 0.25, highK: 0.7, multiT: 2.5, trap: 8, bossK: 0.006, dmgK: 0.003, other: 1.5,
  frenzy: 80, booed: 25, fdmg: 1.25, dropT: 20, junkT: 3.4, junkDmg: 20, arenaDmg: 1.15, booDmg: 1.35, zeroT: 7, calmK: 0.2 };
G.glad = null; G.gladBonus = 0;
const ventRingGeo = new THREE.RingGeometry(GLAD.ventR - 0.6, GLAD.ventR, 40);
export function startGlad() {
  clearGlad();
  const A = G.glad = { h: GLAD.h0, peak: GLAD.h0, low: GLAD.h0, vents: [], gates: [], lastDmgT: G.time, zeroAcc: 0, dropT: GLAD.dropT, junkT: GLAD.junkT, multiN: 0, multiT: -9, lastKey: null, calm: true, lost: false, booedEver: false, frenzyOn: false, booOn: false, accP: 0, eT: 0 };
  GLAD.vents.forEach(([x, z], i) => {
    const obj = cloneKit('P_FireVent'); obj.position.set(x, 0.02, z); obj.rotation.y = i * 0.7; G.scene.add(obj);
    const n = nodes(obj), gm = []; if (n.FV_Glow) n.FV_Glow.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); gm.push(o.material); } });
    const ring = new THREE.Mesh(ventRingGeo, new THREE.MeshBasicMaterial({ color: 0xff5020, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.25, z); G.scene.add(ring);
    A.vents.push({ x, z, obj, n, gm, ring, st: 'idle', t: 3 + Math.random() * 6 + (i === 0 ? 4 : 0) });
  });
  GLAD.gateA.forEach((a, i) => {
    const x = Math.cos(a) * GLAD.gateR, z = Math.sin(a) * GLAD.gateR, obj = cloneKit('P_ArenaGate');
    obj.position.set(x, 0, z); obj.rotation.y = Math.atan2(x, z); G.scene.add(obj);
    A.gates.push({ i, a, x, z, obj, n: nodes(obj), open: 0 });
  });
  G.gladBonus = 0; G.gladTraps = 0; G.gladDrops = 0; G.gladJunk = 0; G.gladVentHits = 0; G.adaptN = 0; G.adaptRes = 0; G.adaptWeak = 0; G.sawDmg = 0; G.sawCut = 0; G.sawN = 0;
}
export function clearGlad() {
  const A = G.glad; GLADU.uH.value = 0; if (!A) return;
  for (const V of A.vents) { V.obj.parent && V.obj.parent.remove(V.obj); V.ring.parent && V.ring.parent.remove(V.ring); }
  for (const g of A.gates) g.obj.parent && g.obj.parent.remove(g.obj);
  G.glad = null;
}
// the arena floor point in front of gate i (and raise its portcullis for a few seconds)
export function gladGate(i, air) {
  const A = G.glad, g = A && A.gates[i % 4]; if (!g) return new V3(0, air ? 14 : 0, 0);
  g.open = 4.5;
  const r = 100 + Math.random() * 6, a = g.a + (Math.random() - 0.5) * 0.12;
  return new V3(Math.cos(a) * r, air ? 12 + Math.random() * 6 : 0, Math.sin(a) * r);
}
function hypeAdd(v, why) {
  const A = G.glad; if (!A || v <= 0) return;
  A.h = Math.min(100, A.h + v); A.peak = Math.max(A.peak, A.h);
  G.onHype && G.onHype(v, why);
}
// called from G.onKill: score the kill for the crowd
export function gladKill(e) {
  const A = G.glad; if (!A || !e || e.hacked || e.holo) return;
  const lbl = e._lastLbl || '', team = e._lastTeam;
  const small = e.kind === 'crawler' || e.kind === 'drone' || e.kind === 'swarm', big = e.kind === 'boss' || e.kind === 'adaptor' || e.kind === 'bulwark' || e.kind === 'rammer';
  if (lbl === 'vent') { G.gladTraps++; hypeAdd(GLAD.trap, 'trap'); return; }
  if (team !== 'P' || lbl.startsWith('ally')) { hypeAdd(GLAD.other, ''); return; }
  const key = lbl.replace(/^p-/, '').replace(/^hack-.*/, 'hack');
  const base = GLAD.kill * (small ? GLAD.small : big ? GLAD.big : 1); let k = 1, why = '';   // bonuses scale the kill, not flat points
  if (A.lastKey && key !== A.lastKey) { k += GLAD.vary; why = 'vary'; }
  A.lastKey = key;
  const P = G.player;
  if (P && P.alive && P.pos.y - groundAt(P.pos.x, P.pos.z, P.pos.y + 1) > GLAD.airH) { k += GLAD.air; why = why || 'air'; }
  if (G.time - A.multiT < GLAD.multiT) { A.multiN++; k += GLAD.multi * Math.min(A.multiN, 3); why = 'multi'; } else A.multiN = 0;
  A.multiT = G.time;
  hypeAdd(base * k * (A.h > 70 ? GLAD.highK : 1), why);   // a crowd that is already roaring is harder to impress
}
function gladJunk() {   // the booing crowd lobs junk from the stands at you
  const P = G.player; if (!P || !P.alive) return;
  const a = Math.random() * Math.PI * 2, r = GLAD.R + 8, from = new V3(Math.cos(a) * r, 18 + Math.random() * 6, Math.sin(a) * r);
  const T = 1.7 + Math.random() * 0.4, g = 18, to = P.center(new V3()).addScaledVector(P.vel, T * 0.6); to.y = groundAt(to.x, to.z, to.y + 1);
  const v = new V3((to.x - from.x) / T, (to.y - from.y) / T + 0.5 * g * T, (to.z - from.z) / T);
  G.curShooter = null; spawnShot({ p: from, v, dmg: GLAD.junkDmg, team: 'E', kind: 'grenade', splash: 3.5, grav: g, life: 4, color: 0xd8c8a0, label: 'crowd-junk' });
  G.gladJunk++;
}
function updateGlad(dt) {
  const A = G.glad, P = G.player; if (!A) return;
  // hype drains; faster when you are not hurting anybody; barely during the breaks between rounds
  const P0 = G.player; let near = false, any = false;   // the crowd only gets bored if there is someone to fight
  for (const e of G.enemies) { if (!e.alive || e.dying || e.holo) continue; any = true; if (P0 && Math.hypot(e.c.x - P0.pos.x, e.c.z - P0.pos.z) < 70) { near = true; break; } }
  let rate = GLAD.decay + (near && G.time - A.lastDmgT > GLAD.boredT ? GLAD.bored : 0); if (A.calm || !any) rate *= GLAD.calmK;
  A.h = Math.max(0, A.h - rate * dt); A.low = Math.min(A.low, A.h);
  GLADU.uH.value += (A.h / 100 - GLADU.uH.value) * Math.min(1, dt * 2);
  const fr = A.h >= GLAD.frenzy, bo = A.h <= GLAD.booed;
  if (fr && !A.frenzyOn) G.onFrenzy && G.onFrenzy(); A.frenzyOn = fr;
  if (bo && !A.booOn && !A.calm) { A.booedEver = true; G.onBooed && G.onBooed(); } A.booOn = bo;
  if (fr && !A.calm && P && P.alive) {
    A.dropT -= dt;
    if (A.dropT <= 0) { A.dropT = GLAD.dropT; for (let k = 0; k < 20; k++) { const a = Math.random() * 6.28, r = 7 + Math.random() * 9, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r; if (Math.hypot(x, z) > GLAD.R - 8 || pointInSolid(new V3(x, 1, z), 2)) continue; dropRepair(new V3(x, 0, z)); G.fx.flash(new V3(x, 3, z), 0x60ff90, 30, 20, 0.3); G.gladDrops++; G.onCrowdDrop && G.onCrowdDrop(); break; } }
  }
  if (bo && !A.calm) { A.junkT -= dt; if (A.junkT <= 0) { A.junkT = GLAD.junkT * (0.8 + Math.random() * 0.4); gladJunk(); } }
  if (A.h <= 0.01 && !A.calm && any) { A.zeroAcc += dt; if (A.zeroAcc >= GLAD.zeroT && !A.lost) { A.lost = true; G.onHypeLost && G.onHypeLost(); } }
  else if (A.h > 3) A.zeroAcc = Math.max(0, A.zeroAcc - dt * 2);
  // portcullises
  for (const g of A.gates) { g.open = Math.max(0, g.open - dt); const tgt = g.open > 0 ? 8.5 : 0; if (g.n.AG_Bars) g.n.AG_Bars.position.y += (tgt - g.n.AG_Bars.position.y) * Math.min(1, dt * 3); }
  // flame vents
  A.eT += dt; const tick = A.eT >= 0.25; if (tick) A.eT = 0;
  const gy = P ? groundAt(P.pos.x, P.pos.z, P.pos.y + 1) : 0;
  for (const V of A.vents) {
    V.t -= dt;
    if (V.st === 'idle') { if (V.t <= 0 && !A.calm) { V.st = 'warn'; V.t = GLAD.warn; V.dodge = Math.random() < 0.7; } }
    else if (V.st === 'warn') { if (V.t <= 0) { V.st = 'fire'; V.t = GLAD.fire; sfx('flame', P ? P.pos.distanceTo(_a.set(V.x, 0, V.z)) : 50); G.fx.ring(_a.set(V.x, 0.5, V.z), null, 1, GLAD.ventR * 1.6, 0.35, 0xff8030); } }
    else if (V.t <= 0) { V.st = 'idle'; V.t = GLAD.idle[0] + Math.random() * (GLAD.idle[1] - GLAD.idle[0]); }
    const w = V.st === 'warn' ? 1 - V.t / GLAD.warn : 0, f = V.st === 'fire';
    V.ring.material.opacity = V.st === 'warn' ? 0.35 + 0.4 * Math.abs(Math.sin(G.time * (6 + 10 * w))) : f ? 0.5 : 0;
    if (V.n.FV_Glow) V.n.FV_Glow.scale.setScalar(f ? 1.05 : 0.6 + 0.4 * w);
    for (const m of V.gm) m.emissiveIntensity = f ? 4 : 0.4 + 2.5 * w;
    if (V.st === 'warn' && Math.random() < 0.4 + w) G.fx.sparks(_a.set(V.x + (Math.random() - 0.5) * 6, 0.4, V.z + (Math.random() - 0.5) * 6), _b.set(0, 1, 0), 2, 0xffa040, 8, 0.6, 0.3, 0.15);
    if (!f) continue;
    for (let k = 0; k < 4; k++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * GLAD.ventR * 0.75; G.fx.emit('add', { x: V.x + Math.cos(a) * r, y: 0.6, z: V.z + Math.sin(a) * r, vx: (Math.random() - 0.5) * 2, vy: 14 + Math.random() * 7, vz: (Math.random() - 0.5) * 2, life: 0.75, s0: 2.2, s1: 4.6, c0: 0xff8a2a, c1: 0xa02006, a0: 0.6 }); }
    G.fx.emit('add', { x: V.x + (Math.random() - 0.5) * 2, y: 0.8, z: V.z + (Math.random() - 0.5) * 2, vy: 18 + Math.random() * 6, life: 0.45, s0: 1.6, s1: 2.6, c0: 0xffe0a0, c1: 0xff7a20, a0: 0.7 });   // hot core
    if (Math.random() < 0.35) G.fx.emit('smoke', { x: V.x + (Math.random() - 0.5) * 4, y: 9, z: V.z + (Math.random() - 0.5) * 4, vy: 4, life: 1.6, s0: 2, s1: 5, c0: 0x3a3430, c1: 0x22201e, a0: 0.4, drag: 1 });
    if (P && P.alive && Math.hypot(P.pos.x - V.x, P.pos.z - V.z) < GLAD.ventR + 0.8 && P.pos.y - gy < GLAD.ventH) {
      A.accP += GLAD.pDps * dt;
      if (A.accP >= 7) { G.curShooter = null; G.curSrc = null; damagePlayer(A.accP, null, 'vent'); G.gladVentHits += A.accP; A.accP = 0; }
    }
    if (!tick) continue;
    G.curLabel = 'vent'; G.curShooter = null;
    for (const e of G.enemies) {
      if (!e.alive || e.dying || !e.pos || e.isObjective) continue;
      if (Math.hypot(e.pos.x - V.x, e.pos.z - V.z) > GLAD.ventR + (e.r || 2) * 0.4) continue;
      if ((e.c ? e.c.y : e.pos.y) - groundAt(e.pos.x, e.pos.z, e.pos.y + 1) > GLAD.ventH) continue;
      const big = e.kind === 'boss' || e.maxHp > 3000;
      dealDamage(e.parts ? e.parts[0] : e, (big ? GLAD.bDps : GLAD.eDps) * 0.25, 'X', e.c || e.pos, 'vent');
    }
    G.curLabel = null;
  }
}
export function gladVentAt(x, z, pad = 0) {   // a warning / erupting vent covers this point (autopilot avoidance)
  const A = G.glad; if (!A) return null;
  for (const V of A.vents) if (V.st !== 'idle' && Math.hypot(x - V.x, z - V.z) < GLAD.ventR + pad) return V;
  return null;
}

// adaptor: a heavy four-legged gladiator whose armour adapts. Damage it takes is sorted into kinetic / explosive / energy;
// once one type dominates the last few seconds it re-tunes its armour to it (0.9 s, plates flicker): that type then does
// 25 % and the other two 120 %, until another type takes over (at most every 2.5 s). Each re-tune throws a shock ring
const ADAPT_CAT = {};
for (const k of ['missile', 'grenade', 'cannon', 'rockets', 'cluster', 'sticky', 'pmines', 'orbital', 'pound', 'blink', 'decoy', 'grav', 'rewind', 'plorb', 'frag', 'bwall', 'drones', 'sentry-boom']) ADAPT_CAT[k] = 'exp';
for (const k of ['laser', 'melter', 'flamer', 'blade', 'pile', 'sonic', 'cryo', 'acid', 'emp', 'rod', 'nanocloud', 'burner', 'chainb', 'isotope', 'link', 'siphon', 'repair', 'stasis']) ADAPT_CAT[k] = 'eng';
export function adaptCat(label) { const k = (label || '').replace(/^p-/, ''); return ADAPT_CAT[k] || 'kin'; }
export const ADAPT = { hp: 1500, scale: 1.3, res: 0.4, weak: 1.2, win: 2.2, need: 70, tune: 0.9, minT: 2.5, gunK: 0.7, pulseR: 12, pulseDmg: 24,
  col: { kin: 0x5ab0ff, exp: 0xff8a2a, eng: 0xc060ff }, cn: { kin: '动能', exp: '爆炸', eng: '能量' } };
export class Adaptor extends Enemy {
  constructor(pos) {
    super('adaptor', 'E_Adaptor', pos, ADAPT.hp, 3.4); this.boom = 2; this.obj.scale.setScalar(ADAPT.scale); this.adapt = true;
    this.vel = new V3(); this.ph = Math.random() * 6; this.strafe = Math.random() < 0.5 ? 1 : -1; this.stT = 3; this.yaw = Math.random() * 6.28;
    for (const [a, b] of [['E_WBody', 'AP_Body'], ['E_WGun', 'AP_Gun'], ['Muzzle_Walker', 'Muzzle_Adapt']]) this.n[a] = this.n[b];
    for (let i = 1; i <= 4; i++) { this.n['E_Leg' + i] = this.n['AP_Leg' + i]; this.n['E_Knee' + i] = this.n['AP_Knee' + i]; }
    this.acc = { kin: 0, exp: 0, eng: 0 }; this.res = null; this.pend = null; this.pendT = 0; this.lastAd = -9;
    this.gm = null; this.obj.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'AdaptGlow') { if (!this.gm) this.gm = o.material.clone(); o.material = this.gm; } });
    this.c.set(pos.x, pos.y + 3.2, pos.z);
  }
  adaptHit(label, dmg) {
    const cat = adaptCat(label); this.acc[cat] += dmg;
    if (!this.res) return dmg;
    if (cat === this.res) { G.adaptRes += dmg * (1 - ADAPT.res); return dmg * ADAPT.res; }
    G.adaptWeak += dmg * (ADAPT.weak - 1); return dmg * ADAPT.weak;
  }
  update(dt) {
    Walker.prototype.update.call(this, dt);
    this.c.set(this.pos.x, this.pos.y + 3.2, this.pos.z);
    const k = Math.exp(-dt / ADAPT.win); for (const c in this.acc) this.acc[c] *= k;
    let best = null, bv = 0; for (const c in this.acc) if (this.acc[c] > bv) { bv = this.acc[c]; best = c; }
    if (!this.pend && best && best !== this.res && bv > ADAPT.need && G.time - this.lastAd > ADAPT.minT) { this.pend = best; this.pendT = ADAPT.tune; }
    if (this.pend) {
      this.pendT -= dt;
      if (this.pendT <= 0) {
        this.res = this.pend; this.pend = null; this.lastAd = G.time; G.adaptN++;
        G.fx.ring(this.c, null, 1, ADAPT.pulseR * 1.3, 0.4, ADAPT.col[this.res]); G.fx.flash(this.c, ADAPT.col[this.res], 40, 24, 0.25); sfx('shield', G.player ? G.player.pos.distanceTo(this.pos) : 40);
        G.curLabel = 'adaptor-pulse'; G.curShooter = this; explodeAt(this.c.clone(), ADAPT.pulseR, ADAPT.pulseDmg, 'E', 0.6, ADAPT.col[this.res]); G.curShooter = null; G.curLabel = 'adaptor';
        G.onAdapt && G.onAdapt(this);
      }
    }
    const ring = this.n.AP_Ring; if (ring) ring.rotation.z += dt * (this.pend ? 9 : this.res ? 1.4 : 0.5);
    if (this.gm) {
      const col = this.pend ? (Math.sin(G.time * 40) > 0 ? ADAPT.col[this.pend] : 0xffffff) : this.res ? ADAPT.col[this.res] : 0xd8ecff;
      this.gm.emissive.setHex(col); this.gm.color.setHex(col); this.gm.emissiveIntensity = this.pend ? 3.5 : 2.2;
    }
  }
}

// SB-4 orbit saws: four blades circle you for 8 s, the orbit breathing between 4 and 13 m; each blade cuts what it touches
// (per-target cooldown) and shreds enemy projectiles it passes through
G.saws = [];
export function castSaws(owner, d, mul, me) {
  G.saws = G.saws.filter((S) => { if (S.owner === owner) { for (const o of S.discs) o.parent && o.parent.remove(o); return false; } return true; });
  const discs = [];
  for (let k = 0; k < d.n; k++) { const o = cloneKit('P_SawDisc'); o.scale.setScalar(1.5); G.scene.add(o); discs.push(o); }
  G.saws.push({ owner, d, mul, me, t: d.dur, age: 0, ang: Math.random() * 6.28, discs, cds: new Map(), sndT: 0 });
  G.sawN = (G.sawN || 0) + 1; sfx(d.sfx || 'blade', 0); G.fx.ring(owner.center(new V3()), null, 1, d.rMin * 2.2, 0.35, 0xffe0a0);
}
const _sw = new V3(), _sc = new V3();
function updateSaws(dt) {
  for (let i = G.saws.length - 1; i >= 0; i--) {
    const S = G.saws[i], d = S.d; S.t -= dt; S.age += dt;
    if (S.t <= 0 || !S.owner.alive) { for (const o of S.discs) { G.fx.sparks(o.position, null, 6, 0xffe0a0, 8, 0.6, 0.25, 0.15); o.parent && o.parent.remove(o); } G.saws.splice(i, 1); continue; }
    const c = S.owner.center(_sc), grow = Math.min(1, S.age * 3) * Math.min(1, S.t * 3);
    const r = (d.rMin + (d.rMax - d.rMin) * (0.5 - 0.5 * Math.cos(S.age * Math.PI * 2 / d.period))) * grow;
    S.ang += d.spin * dt;
    const ents = entsFor('P');
    S.discs.forEach((o, k) => {
      const a = S.ang + k * Math.PI * 2 / d.n;
      const ox = c.x + Math.cos(a) * r, oz = c.z + Math.sin(a) * r, gy = groundAt(ox, oz, c.y) + 1.6;   // blades sag toward the ground so a hovering mech still mows
      o.position.set(ox, Math.max(gy, c.y - 0.6 - Math.max(0, c.y - 0.6 - gy) * 0.45 + Math.sin(S.age * 3 + k) * 0.5), oz);
      o.rotation.y += dt * 28; o.rotation.z = Math.sin(a) * 0.15;
      if (Math.random() < 0.5) G.fx.emit('add', { x: o.position.x, y: o.position.y, z: o.position.z, life: 0.12, s0: 0.9, s1: 0.2, c0: 0xffe8b0 });
      for (let j = G.shots.length - 1; j >= 0; j--) {
        const sh = G.shots[j]; if (sh.team !== 'E') continue;
        if (Math.abs(sh.x - o.position.x) > d.cutR || Math.abs(sh.z - o.position.z) > d.cutR || Math.abs(sh.y - o.position.y) > d.cutR) continue;
        G.shots.splice(j, 1); G.sawCut++; G.fx.sparks(_sw.set(sh.x, sh.y, sh.z), null, 5, 0xffd080, 10, 0.8, 0.25, 0.15);
      }
      for (const e of ents) {
        if (!e.alive || e.holo || !e.c || e.isBarrel || e.isMine) continue;   // barrels would go off in your face
        const host = e.kind === 'cpart' ? e.owner : e; if (host.hacked || host.cloaked) continue;
        const er = e.r || 1; if (Math.hypot(e.c.x - o.position.x, e.c.z - o.position.z) > 2.1 + er * 0.6 || Math.abs(e.c.y - o.position.y) > 2.4 + er) continue;   // cylinder test: tall mechs get cut at the shins
        if ((S.cds.get(e) || 0) > G.time) continue;
        S.cds.set(e, G.time + d.hitCd);
        const big = host.kind === 'boss' || host.kind === 'raider' || host.maxHp > 3000 || host.isColossus || host.isTrain || host.isLev;
        const dm = d.dmg * S.mul * (big ? d.bossK : 1);
        G.curLabel = 'p-saws'; G.curSrc = S.owner.pos; dealDamage(e, dm, 'P', e.c, 'p-saws'); G.curLabel = null;
        G.sawDmg += dm; G.fx.sparks(e.c, _sw.subVectors(e.c, c).normalize(), 10, 0xffe0a0, 16, 0.8, 0.3, 0.2);
        S.sndT -= 1; if (S.sndT <= 0) { S.sndT = 3; sfx('bladehit', S.me ? 0 : 40); }
      }
    });
    if (S.me && Math.random() < dt * 4) sfx('spin', 0);
  }
}
export function clearSaws() { for (const S of G.saws) for (const o of S.discs) o.parent && o.parent.remove(o); G.saws.length = 0; }


// ------------------------------------------------------------------ v58 Turf War: paint the floor. A 200 x 200 grid of 1.7 m
// cells over the arena (cells inside solids don't count); your feet, shots and kills paint cyan, enemy feet, shots and
// sprayer trails paint magenta. Standing on your colour: speed x1.2 and energy regen x1.6; on theirs: speed x0.72 and the
// paint eats 6 AP/s. Whoever covers more floor when the clock runs out wins
export const TURF = { N: 200, dur: 240, bossAt: 165, last: 30, lastK: 1.5, pTrail: 2.4, eTrail: 1.3, bossTrail: 2.2, bullet: 1.5, splashK: 0.8, missile: 3, goo: 4.5, glob: 4.5,
  kill: 6, killBig: 10, bossKill: 24, ownSpd: 1.2, ownEn: 1.6, foeSpd: 0.72, foeDps: 6, gooT: 3, gooDev: 0.28, gooHit: 0.7 };
const TURF_BIG = new Set(['walker', 'bulwark', 'prism', 'rammer', 'adaptor', 'marshal', 'forklift', 'herald', 'torcher', 'leaper', 'anchor', 'sprayer', 'raider']);
export function startTurf() {
  const N = TURF.N, cs = 2 * ARENA / N, own = new Uint8Array(N * N), ok = new Uint8Array(N * N), q = new V3(); let n = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    q.set(-ARENA + (i + 0.5) * cs, 0.6, -ARENA + (j + 0.5) * cs);
    if (Math.abs(q.x) < ARENA - 3 && Math.abs(q.z) < ARENA - 3 && !pointInSolid(q, 0.2)) { ok[j * N + i] = 1; n++; }
  }
  PAINT.data.fill(0); PAINT.tex.needsUpdate = true;
  G.turf = { own, ok, n: [n, 0, 0], total: n, mul: 1, dirty: false, upT: 0, eT: 0, foeT: 0, ownT: 0, peak: 0, low: 1 };
}
export function clearTurf() { G.turf = null; if (G.player) { G.player.turfMul = 1; G.player.turfEn = 1; } }
export function turfShare() { const T = G.turf; return T ? [T.n[1] / T.total, T.n[2] / T.total] : [0, 0]; }
export function turfAt(x, z) {
  const T = G.turf; if (!T) return 0; const N = TURF.N, cs = 2 * ARENA / N;
  const i = Math.floor((x + ARENA) / cs), j = Math.floor((z + ARENA) / cs);
  return i < 0 || j < 0 || i >= N || j >= N ? 0 : T.own[j * N + i];
}
export function paintAt(x, z, r, team, soft = false) {
  const T = G.turf; if (!T || !team || !Number.isFinite(x + z)) return 0;
  const N = TURF.N, cs = 2 * ARENA / N, D = PAINT.data; r = Math.max(r * (team === 1 ? T.mul : 1), cs * 0.6);   // the last-30-s boost is yours alone
  const i0 = Math.max(0, Math.floor((x - r + ARENA) / cs)), i1 = Math.min(N - 1, Math.floor((x + r + ARENA) / cs));
  const j0 = Math.max(0, Math.floor((z - r + ARENA) / cs)), j1 = Math.min(N - 1, Math.floor((z + r + ARENA) / cs));
  let ch = 0; const r2 = r * r;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = -ARENA + (i + 0.5) * cs - x, dz = -ARENA + (j + 0.5) * cs - z; if (dx * dx + dz * dz > r2) continue;
    const k = j * N + i; if (!T.ok[k] || T.own[k] === team || (soft && T.own[k])) continue;
    T.n[T.own[k]]--; T.n[team]++; T.own[k] = team; D[k * 4] = team === 1 ? 255 : 0; D[k * 4 + 1] = team === 2 ? 255 : 0; ch++;
  }
  if (ch) T.dirty = true;
  return ch;
}
function paintSplash(at, col) {
  for (let k = 0; k < 10; k++) { const a = Math.random() * 6.283, v = 3 + Math.random() * 5; G.fx.emit('add', { x: at.x, y: at.y + 0.3, z: at.z, vx: Math.cos(a) * v, vy: 3 + Math.random() * 4, vz: Math.sin(a) * v, grav: 14, life: 0.55, s0: 0.6, s1: 0.25, c0: col }); }
}
function turfShot(s, at) {   // a shot that lands on the floor paints it
  if (!(at.y < 3)) return; const team = s.team === 'P' ? 1 : s.team === 'E' ? 2 : 0; if (!team) return;
  const r = s.goo ? TURF.goo : s.pglob ? TURF.glob : s.splash > 0 ? s.splash * TURF.splashK : s.kind === 'missile' ? TURF.missile : TURF.bullet;
  paintAt(at.x, at.z, r, team);
}
export function turfKill(e) {   // a wreck bursts into your colour
  if (!G.turf) return; const P = e.mech ? e.mech.pos : (e.pos || e.c); if (!P) return;
  const r = e.kind === 'boss' ? TURF.bossKill : TURF_BIG.has(e.kind) ? TURF.killBig : TURF.kill;
  paintAt(P.x, P.z, r, 1); G.fx.ring(new V3(P.x, 0.3, P.z), null, 1, r, 0.5, 0x18c8ff); paintSplash(new V3(P.x, 0.5, P.z), 0x40d8ff);
}
export function updateTurf(dt) {
  const T = G.turf; if (!T) return; const p = G.player;
  if (p && p.alive) {
    const on = p.grounded ? turfAt(p.pos.x, p.pos.z) : 0;
    if (p.grounded && Math.hypot(p.vel.x, p.vel.z) > 1.5) paintAt(p.pos.x, p.pos.z, TURF.pTrail, 1, true);
    p.turfMul = on === 1 ? TURF.ownSpd : on === 2 ? TURF.foeSpd : 1; p.turfEn = on === 1 ? TURF.ownEn : 1;
    if (on === 2) { hurtPlayer(TURF.foeDps * dt, 'paint'); T.foeT += dt; } else if (on === 1) T.ownT += dt;
  }
  T.eT -= dt;
  if (T.eT <= 0) {
    T.eT = 0.2;
    for (const e of G.enemies) {
      if (!e.alive || e.dying || e.hacked || e.kind === 'turret' || e.kind === 'sprayer' || e.isMine) continue;
      const P = e.mech ? e.mech.pos : e.pos; if (!P || P.y > 1.5) continue;
      paintAt(P.x, P.z, e.mech ? TURF.bossTrail : TURF.eTrail, 2, !e.mech);
    }
  }
  T.upT -= dt; if (T.dirty && T.upT <= 0) { T.upT = 0.08; T.dirty = false; PAINT.tex.needsUpdate = true; }
  const sh = turfShare(); T.peak = Math.max(T.peak, sh[0]);
}

// SP-4 splat cannon: cyan goo gums up the optics of everything in the splash for 3 s
function gooSplash(s, at) {
  explodeAt(at, s.splash, s.dmg, s.team, 0.7, 0x18c8ff); paintSplash(at, 0x40d8ff);
  let n = 0;
  for (const e of G.enemies) {
    if (!e.alive || e.dying || e.hacked || e.isMine || !e.c) continue; const h = e.kind === 'cpart' ? e.owner : e;
    if (e.c.distanceTo(at) - (e.r || 1.5) * 0.6 < s.splash + 1) { h.gooT = TURF.gooT * ((h.maxHp || 0) > 3000 ? 0.5 : 1); n++; }
  }
  G.gooHits = (G.gooHits || 0) + n;
}
function updateGoo(dt) {
  for (const e of G.enemies) if (e.gooT > 0) {
    e.gooT -= dt;
    if (e.c && Math.random() < 0.35) G.fx.emit('add', { x: e.c.x + (Math.random() - 0.5) * 1.6, y: e.c.y + 0.6, z: e.c.z + (Math.random() - 0.5) * 1.6, vy: -2.5, grav: 6, life: 0.5, s0: 0.35, s1: 0.15, c0: 0x40d8ff });
  }
}

// Sprayer: a four-wheeled paint truck that hunts for unpainted and cyan floor, laying a 2.6 m magenta trail; it runs from
// you inside 22 m, lobs paint globs (18 damage, 3.5 m) every 2.5-3.5 s and takes x1.6 on the paint tank at its rear
export const SPRAY = { hp: 560, r: 2.2, speed: 13, flee: 20, fleeSpd: 13, cd: [2.5, 3.5], dmg: 18, splash: 3.5, R: 48, trail: 1.8, back: 2.0, goalR: 90 };
export class Sprayer extends Enemy {
  constructor(pos) {
    super('sprayer', 'E_Sprayer', pos, SPRAY.hp, SPRAY.r); this.boom = 1.1;
    this.pos.y = groundAt(pos.x, pos.z, 40); this.yaw = Math.random() * 6; this.yaw2 = this.yaw; this.vel = new V3(); this.ph = Math.random() * 6;
    this.stuckT = 0; this.sideT = 0; this.side = Math.random() < 0.5 ? 1 : -1; this.last = this.pos.clone(); this.goal = null; this.goalT = 0;
    this.lobT = 1.5 + Math.random() * 1.5; this.c.set(this.pos.x, this.pos.y + 1.3, this.pos.z);
  }
  drive(tx, tz, spd, dt) { return Engineer.prototype.drive.call(this, tx, tz, spd, dt); }
  hit(dmg, at) {
    if (at && this.alive) { const fx = -Math.sin(this.yaw2), fz = -Math.cos(this.yaw2); if ((at.x - this.pos.x) * fx + (at.z - this.pos.z) * fz < -0.4) { dmg *= SPRAY.back; G.sprayBack = (G.sprayBack || 0) + 1; } }
    super.hit(dmg);
  }
  pickGoal() {
    const p = G.player, q = new V3(); let best = null, bs = -1e9;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * 6.283, r = 25 + Math.random() * SPRAY.goalR;
      const x = Math.max(-150, Math.min(150, this.pos.x + Math.cos(a) * r)), z = Math.max(-150, Math.min(150, this.pos.z + Math.sin(a) * r));
      q.set(x, 0.6, z); if (pointInSolid(q, 1.5)) continue;
      const o = turfAt(x, z); let sc = o === 1 ? 3 : o === 0 ? 2 : 0;
      if (p) { const d = Math.hypot(x - p.pos.x, z - p.pos.z); sc += Math.min(1.5, d / 60) - (d < 30 ? 2 : 0); }
      sc += Math.random() * 0.5;
      if (sc > bs) { bs = sc; best = new V3(x, 0, z); }
    }
    this.goal = best; this.goalT = 6 + Math.random() * 4;
  }
  update(dt) {
    const t = this.tg(), n = this.n, tc = t.center ? t.center(playerC) : t.pos; this.ph += dt; this.goalT -= dt;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dl = Math.hypot(dx, dz) || 1;
    if (dl < SPRAY.flee) { this.fleeing = true; this.drive(this.pos.x - dx / dl * 14 - dz / dl * this.side * 6, this.pos.z - dz / dl * 14 + dx / dl * this.side * 6, SPRAY.fleeSpd, dt); }
    else {
      this.fleeing = false;
      if (!this.goal || this.goalT <= 0 || Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 5) this.pickGoal();
      if (this.goal) this.drive(this.goal.x, this.goal.z, SPRAY.speed, dt);
    }
    this.pos.y += (groundAt(this.pos.x, this.pos.z, this.pos.y + 2) - this.pos.y) * Math.min(1, dt * 8);
    const sp = Math.hypot(this.vel.x, this.vel.z), want = sp > 1 ? Math.atan2(-this.vel.x, -this.vel.z) : this.yaw2;
    this.yaw2 += angDiff(want, this.yaw2) * Math.min(1, dt * 5);
    this.obj.rotation.set(0, this.yaw2, 0, 'YXZ');
    const bx = this.pos.x + Math.sin(this.yaw2) * 1.7, bz = this.pos.z + Math.cos(this.yaw2) * 1.7;
    if (sp > 2) {
      paintAt(bx, bz, SPRAY.trail, 2);
      if (Math.random() < 0.7) G.fx.emit('add', { x: bx + (Math.random() - 0.5) * 1.6, y: 0.35, z: bz + (Math.random() - 0.5) * 1.6, vx: this.vel.x * 0.2, vy: 0.8, vz: this.vel.z * 0.2, life: 0.4, s0: 0.7, s1: 0.2, c0: 0xff2a9a });
    }
    for (let i = 1; i <= 4; i++) { const w = n['SR_Wheel' + i]; if (w) w.rotation.x -= sp * dt / 0.45; }
    if (n.SR_Turret) n.SR_Turret.rotation.y = angDiff(Math.atan2(-dx, -dz), this.yaw2);
    if (n.SR_Tank) n.SR_Tank.scale.setScalar(1 + 0.04 * Math.sin(this.ph * 7));
    this.c.set(this.pos.x, this.pos.y + 1.3, this.pos.z);
    this.lobT -= dt;
    if (this.lobT <= 0 && dl < SPRAY.R && this.checkLos(dt)) {
      this.lobT = SPRAY.cd[0] + Math.random() * (SPRAY.cd[1] - SPRAY.cd[0]);
      const mp = n.Muzzle_Spray ? n.Muzzle_Spray.getWorldPosition(new V3()) : this.c.clone();
      const D = Math.hypot(tc.x - mp.x, tc.z - mp.z), Tf = 0.8 + D / 45, g = 22;
      const aim = new V3().copy(tc).addScaledVector(t.vel || _c.set(0, 0, 0), Tf * 0.6);
      const gy = groundAt(aim.x, aim.z, aim.y + 1), low = aim.y - gy < 4; if (low) aim.y = gy;
      const v = new V3((aim.x - mp.x) / Tf, (aim.y - mp.y + 0.5 * g * Tf * Tf) / Tf, (aim.z - mp.z) / Tf);
      G.curShooter = this; spawnShot({ p: mp, v, dmg: SPRAY.dmg, team: 'E', kind: 'shell', pglob: true, splash: SPRAY.splash, life: Tf + 1, grav: g, label: 'sprayer', color: 0xff2a9a, size: 1.4 }); G.curShooter = null;
      if (low) G.fx.warn(aim, SPRAY.splash, Tf);
      sfx('eshell', G.player ? G.player.pos.distanceTo(mp) : 50);
    }
  }
}


// ------------------------------------------------------------------ v59 Hot Fuse: a countdown bomb clamps onto someone and
// has to be passed on. hold it and get within 7 m of an enemy for a moment to stick it on them; an enemy carrying it hunts
// you to pass it back. it goes off when the clock runs out: on you 110 damage, on an enemy an instant kill (bosses lose
// 10 %) and a 12 m blast that hurts every enemy round it. every other bomb starts on an enemy near you
export const FUSE = { carrierK: 0.25, first: 8, gap: 6, tP: 14, tE: 12, minT: 4, passR: 7, passT: 0.35, cool: 1.5, pull: 11, dmgP: 110, dmgE: 160, R: 12, bossK: 0.1, nearR: 8, nearDmg: 40 };
const HF_NO = new Set(['turret', 'relay', 'cruise', 'swarm', 'tumor', 'civ', 'cpart', 'tower', 'citadel', 'dish', 'pump', 'fab', 'bionode']);
function hfOk(e, init) {
  if (!e || !e.alive || e.dying || e.gone || e.hacked || e.isMine || e.isObjective || e.isBarrel || e.holo || e.cloaked || !e.c || HF_NO.has(e.kind)) return false;
  if (init && (e.kind === 'boss' || e.kind === 'raider' || e.maxHp > 3000)) return false;
  return true;
}
const hfMesh = (() => {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.35, metalness: 0.7, emissive: 0xff2a10, emissiveIntensity: 0.3 }));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.09, 8, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a18).multiplyScalar(2.6), toneMapped: false }));
  band.rotation.x = Math.PI / 2;
  const band2 = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.06, 8, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc040).multiplyScalar(2), toneMapped: false }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8030).multiplyScalar(2), transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
  ring.rotation.x = Math.PI / 2;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 70, 8, 1, true).translate(0, 36, 0), new THREE.MeshBasicMaterial({ color: 0xff3a18, transparent: true, opacity: 0.3, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  g.add(core, band, band2, ring, beam); g.visible = false; g.userData = { core, band, band2, ring, beam };
  return g;
})();
export function startFuse() {
  G.hf = { h: null, t: 0, next: FUSE.first, n: 0, kills: 0, onP: 0, bossHits: 0, passes: 0, backs: 0, passK: 0, cool: 0, beepT: 0, flashK: 0, pause: false, lastC: new V3(), bubbledHolder: 0 };
  G.scene.add(hfMesh); hfMesh.visible = false;
}
export function clearFuse() { G.hf = null; hfMesh.visible = false; }
export function fuseNear(pc, r) {   // the nearest enemy you could hand the bomb to
  let best = null, bd = r;
  for (const e of G.enemies) { if (!hfOk(e)) continue; const d = e.c.distanceTo(pc) - (e.r || 2) * 0.5; if (d < bd) { bd = d; best = e; } }
  return best;
}
// the bomb takes over its carrier's legs: after its own update (animation, guns) its position is put back and it rushes
// you in a straight line at 11 m/s; fliers drop to your height. crawlers and bosses keep their own movement
const FUSE_SELF = new Set(['crawler', 'eel', 'leech', 'burrower', 'swarm']);
export function fuseDrives(e) { return !!(e.pos && !e.mech && !e.bubbled && !(e.stunT > 0) && !e.isTrain && !e.solids && !FUSE_SELF.has(e.kind)); }
function fuseDrive(e, dt, x0, y0, z0) {
  const P = G.player; if (!P || !P.alive) return; const pc = P.center(_c);
  const ax = e.pos.x, ay = e.pos.y, az = e.pos.z;
  const dx = pc.x - x0, dz = pc.z - z0, dl = Math.hypot(dx, dz) || 1, sp = FUSE.pull;
  e.pos.x = x0; e.pos.z = z0;
  if (dl > 2.5) { e.pos.x += dx / dl * sp * dt; e.pos.z += dz / dl * sp * dt; }
  collideCyl(e.pos, Math.min(2, e.r || 1.5), 2.4);
  const g = groundAt(e.pos.x, e.pos.z, y0 + 2);
  if (y0 - g > 2.5) { const ty = Math.max(g + 2.5, pc.y - 0.5); e.pos.y = y0 + Math.max(-7 * dt, Math.min(7 * dt, ty - y0)); }
  if (e.c !== e.pos) { e.c.x += e.pos.x - ax; e.c.y += e.pos.y - ay; e.c.z += e.pos.z - az; }
  if (e.vel) { e.vel.x = dx / dl * sp; e.vel.z = dz / dl * sp; }
}
function hfArm() {
  const F = G.hf, p = G.player; F.n++;
  let h = 'P';
  if (F.n % 2 === 0) {
    let best = null, bd = 1e9;
    for (const e of G.enemies) { if (!hfOk(e, true)) continue; const d = e.c.distanceTo(p.pos); if (d > 22 && d < 95 && d < bd) { bd = d; best = e; } }
    if (best) h = best;
  }
  F.h = h; F.t = h === 'P' ? FUSE.tP : FUSE.tE; F.cool = 1; F.passK = 0; F.beepT = 0;
  const at = h === 'P' ? p.center(new V3()) : h.c;
  G.fx.ring(at, null, 1, 6, 0.4, 0xff5020); G.fx.flash(at, 0xff6030, 20, 14, 0.25); sfx('warn', 0);
  G.onFuse && G.onFuse(h === 'P' ? 'armP' : 'armE', h);
}
function hfGive(to) {
  const F = G.hf, p = G.player, from = F.h === 'P' ? p.center(new V3()) : F.h.c.clone(), dest = to === 'P' ? p.center(new V3()) : to.c;
  F.h = to; F.t = Math.max(F.t, FUSE.minT); F.cool = FUSE.cool; F.passK = 0;
  if (to === 'P') F.backs++; else F.passes++;
  G.fx.streak(from, dest, 0.6, 0xff6030); G.fx.ring(dest, null, 1, 5, 0.3, 0xff8030); sfx('catch', 0);
  G.onFuse && G.onFuse(to === 'P' ? 'back' : 'pass', to);
}
function hfBoom(at, h) {
  const F = G.hf, p = G.player, prev = G.curLabel; G.curLabel = 'p-fuse';
  const near = G.enemies.filter((e) => e.alive && !e.dying && e.c && e.c.distanceTo(at) < FUSE.R + 3 && e.kind !== 'boss' && e.kind !== 'raider');
  if (h === 'P') { hurtPlayer(FUSE.dmgP, 'fuse'); if (p.vel) p.vel.y = Math.max(p.vel.y, 9); F.onP++; }
  else if (h && h.alive) {
    if (h.kind === 'boss' || h.kind === 'raider' || h.maxHp > 3000) { dealDamage(h, h.maxHp * FUSE.bossK, 'P', at, 'p-fuse'); F.bossHits++; }
    else dealDamage(h, h.hp + 10, 'P', at, 'p-fuse');
  }
  explodeAt(at, FUSE.R, FUSE.dmgE, 'P', 2.6, 0xff5020);
  let kn = 0; for (const e of near) if (!e.alive) kn++; F.kills += kn; F.lastKn = kn;
  if (h !== 'P' && p.center(_c).distanceTo(at) < FUSE.nearR) hurtPlayer(FUSE.nearDmg, 'fuse-near');
  G.fx.flash(at, 0xff6030, 90, 50, 0.45); G.fx.ring(at, null, 1, FUSE.R, 0.5, 0xff5020); G.fx.trauma = Math.min(1, G.fx.trauma + (h === 'P' ? 0.8 : 0.35));
  sfx('bigboom', p.pos.distanceTo(at) * 0.3);
  G.curLabel = prev;
  F.h = null; F.next = FUSE.gap; hfMesh.visible = false;
  G.onFuse && G.onFuse(h === 'P' ? 'boomP' : 'boomE', h);
}
export function updateFuse(dt) {
  const F = G.hf; if (!F) return; const p = G.player;
  if (!p || !p.alive) { hfMesh.visible = false; return; }
  const anyone = G.enemies.some((e) => hfOk(e));
  if (!F.h) { hfMesh.visible = false; if (!F.pause) { F.next -= dt; if (F.next <= 0 && anyone) hfArm(); } return; }
  if (F.h === 'P' && !anyone) { F.h = null; F.next = FUSE.gap; hfMesh.visible = false; G.fx.ring(p.center(new V3()), null, 1, 4, 0.3, 0x80ff80); sfx('repair', 0); G.onFuse && G.onFuse('safe', null); return; }
  if (F.h !== 'P' && !hfOk(F.h)) {   // the carrier died first: the bomb goes off where it fell
    hfBoom(F.lastC.clone(), null); return;
  }
  F.t -= dt; F.cool -= dt;
  const pc = p.center(new V3());
  if (F.h === 'P') {
    const best = fuseNear(pc, FUSE.passR);
    if (best && F.cool <= 0) { F.passK += dt; if (F.passK >= FUSE.passT) hfGive(best); } else F.passK = Math.max(0, F.passK - dt * 2);
  } else {
    const e = F.h, d = e.c.distanceTo(pc) - (e.r || 2) * 0.5, held = e.bubbled || e.stunT > 0;
    if (e.bubbled) F.bubbledHolder += dt;
    if (d < FUSE.passR && F.cool <= 0 && !held) { F.passK += dt; if (F.passK >= FUSE.passT) hfGive('P'); } else F.passK = Math.max(0, F.passK - dt * 2);
  }
  const hc = F.h === 'P' ? pc : F.h.c; F.lastC.copy(hc);
  if (F.t <= 0) { hfBoom(hc.clone(), F.h); return; }
  // beeps speed up as the fuse burns down
  F.beepT -= dt;
  if (F.beepT <= 0) { F.beepT = Math.max(0.12, Math.min(1, F.t / 7)); F.flashK = 1; sfx('minebeep', p.pos.distanceTo(hc) * 0.5); }
  F.flashK = Math.max(0, F.flashK - dt * 6);
  const U = hfMesh.userData, up = F.h === 'P' ? 2.6 : (F.h.r || 2) * 0.8 + 1.6;
  hfMesh.visible = true; hfMesh.position.set(hc.x, hc.y + up, hc.z);
  hfMesh.rotation.y += dt * 2.5; U.band2.rotation.y += dt * 4;
  U.core.material.emissiveIntensity = 0.3 + F.flashK * 4;
  U.ring.scale.setScalar(1 + (1 - F.flashK) * 0.9); U.ring.material.opacity = 0.8 * F.flashK;
  U.beam.material.opacity = F.t < 4 ? 0.2 + 0.3 * F.flashK : 0.22;
  if (Math.random() < 0.5) G.fx.emit('add', { x: hfMesh.position.x, y: hfMesh.position.y + 0.8, z: hfMesh.position.z, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 0.3, s0: 0.35, s1: 0.1, c0: 0xffa040 });
}

// BU-6 bubble gun: wobbly soap bubbles that trap a light enemy and float it up 8 m, stunned; when the bubble pops a ground
// unit falls and takes 90. heavies and bosses only get stuck in the film and slow down
export const BUB = { t: 2.8, rise: 3.6, maxH: 8, fall: 90, fallStun: 0.8, slow: 0.55, slowT: 2.2, bigHp: 2000, catchR: 3.4 };
G.bubbles = [];
const bubGeo = new THREE.SphereGeometry(1, 24, 16);
const bubMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.3, roughness: 0.04, metalness: 0, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [120, 480],
  emissive: 0x2a4a60, emissiveIntensity: 0.5, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2 });
function bubbleOk(e) { return e.alive && !e.dying && !e.gone && e.obj && e.pos && !e.mech && !e.isObjective && !e.solids && !e.parts && !e.isMine && !e.isBarrel && !e.bubbled && !e.tbHeld && !e.hacked && e.kind !== 'cpart' && e.kind !== 'civ'; }
function bubbleHit(s, at, ent) {
  explodeAt(at, s.splash, s.dmg, 'P', 0.45, 0xa8e8ff);
  for (let k = 0; k < 8; k++) G.fx.emit('add', { x: at.x, y: at.y, z: at.z, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6, grav: 4, life: 0.5, s0: 0.5, s1: 0.15, c0: 0xc8f0ff });
  let e = ent && ent.kind === 'cpart' ? ent.owner : ent;
  if (!e || !e.alive || e.isPlayer || e.isAlly || e.isBarrel) {
    e = null; let bd = BUB.catchR;
    for (const q of G.enemies) { if (!q.alive || q.dying || !q.c || q.hacked || q.isMine) continue; const d = q.c.distanceTo(at) - (q.r || 1.5) * 0.6; if (d < bd) { bd = d; e = q; } }
  }
  if (!e) return;
  if (e.maxHp > BUB.bigHp * G.diff.hp || e.mech || !bubbleOk(e)) {   // too big to lift: stuck in the film
    if (!e.bubbled) { e.bubSlow = BUB.slowT * (e.kind === 'boss' ? 0.6 : 1); G.bubSlows = (G.bubSlows || 0) + 1; G.fx.ring(e.c, null, 1, (e.r || 2) * 1.4, 0.35, 0xa8e8ff); }
    return;
  }
  const gy = groundAt(e.pos.x, e.pos.z, e.pos.y + 1.5), m = new THREE.Mesh(bubGeo, bubMat); m.renderOrder = 6; G.scene.add(m);
  const B = { e, t: BUB.t, y0: e.pos.y, top: e.pos.y + BUB.maxH, gy, ground: e.pos.y - gy < 1.5, st: 'up', vy: 0, off: new V3().subVectors(e.c, e.pos), m, R: (e.r || 1.5) * 1.15 + 0.7, ph: Math.random() * 6 };
  e.bubbled = true; e.stunT = Math.max(e.stunT || 0, 0.4); e.stunMax = e.stunT; if (e.vel) e.vel.set(0, 0, 0);
  G.bubbles.push(B); G.bubbled = (G.bubbled || 0) + 1; sfx('catch', 0);
  G.onBubble && G.onBubble(e);
}
function bubbleEnd(B, i) { B.e.bubbled = false; B.m.parent && B.m.parent.remove(B.m); G.bubbles.splice(i, 1); }
function updateBubbles(dt) {
  for (let i = G.bubbles.length - 1; i >= 0; i--) {
    const B = G.bubbles[i], e = B.e; B.ph += dt;
    if (!e.alive || e.dying || e.gone) { popFx(B.m.position, B.R); bubbleEnd(B, i); continue; }
    e.stunT = Math.max(e.stunT || 0, 0.3); e.stunMax = Math.max(e.stunMax || 0, e.stunT); if (e.vel) e.vel.set(0, 0, 0);
    if (B.st === 'up') {
      B.t -= dt;
      const ny = Math.min(B.top, e.pos.y + BUB.rise * dt) + Math.sin(B.ph * 2.2) * 0.02;
      e.pos.y = ny; e.c.copy(e.pos).add(B.off); e.obj.rotation.y += dt * 0.9;
      B.m.position.copy(e.c); const w = 1 + 0.05 * Math.sin(B.ph * 7); B.m.scale.set(B.R * w, B.R / w, B.R * w);
      if (B.t <= 0) {
        popFx(B.m.position, B.R); B.m.visible = false; sfx('snap', G.player ? G.player.pos.distanceTo(e.c) : 40);
        if (B.ground) { B.st = 'fall'; B.vy = 0; } else bubbleEnd(B, i);
      }
    } else {
      B.vy -= 30 * dt; e.pos.y += B.vy * dt;
      if (e.pos.y <= B.gy) {
        e.pos.y = B.gy; e.c.copy(e.pos).add(B.off);
        dealDamage(e, BUB.fall, 'P', e.c, 'p-bubble'); G.bubDrops = (G.bubDrops || 0) + 1;
        if (e.alive) { e.stunT = BUB.fallStun; e.stunMax = e.stunT; }
        G.fx.dust(e.pos, 10, 2.6, 8); sfx('land', G.player ? G.player.pos.distanceTo(e.pos) : 40);
        bubbleEnd(B, i);
      } else e.c.copy(e.pos).add(B.off);
    }
  }
}
function popFx(at, R) {
  for (let k = 0; k < 16; k++) { const a = Math.random() * 6.283, b = Math.random() * 3.14; G.fx.emit('add', { x: at.x + Math.cos(a) * Math.sin(b) * R, y: at.y + Math.cos(b) * R, z: at.z + Math.sin(a) * Math.sin(b) * R, vx: Math.cos(a) * 3, vy: 1, vz: Math.sin(a) * 3, grav: 6, life: 0.45, s0: 0.3, s1: 0.08, c0: 0xd8f4ff }); }
  G.fx.ring(at, null, 0.6, R * 1.3, 0.25, 0xc8f0ff);
}
export function clearBubbles() { for (const B of G.bubbles) { B.e.bubbled = false; B.m.parent && B.m.parent.remove(B.m); } G.bubbles.length = 0; }

// Scrambler: a hover drone with a signal dish. it keeps 26-42 m away and every 6-8 s charges for 0.9 s (the dish glows
// green, its rings spin up) then fires a scramble pulse: if you are within 42 m with a clear line your movement is
// mirrored for 3.5 s (forward is back, left is right). break the line, get out of range, or hit it for 140 while it
// charges to cancel. a twin gun pecks at you in between
export const SCRAM = { hp: 640, r: 2.3, hover: 10, keep: [26, 42], speed: 10, cd: [6, 8], charge: 0.9, range: 42, t: 3.5, brk: 140, gunCd: 2.9, gunR: 70, dmg: 7, gunN: 3 };
G.scramT = 0;
export class Scrambler extends Enemy {
  constructor(pos) {
    super('scrambler', 'E_Scrambler', pos, SCRAM.hp, SCRAM.r); this.boom = 1.0;
    this.vel = new V3(); this.yaw = Math.random() * 6.28; this.st = 'idle'; this.cdT = 3 + Math.random() * 3; this.chT = 0; this.gunT = 1.5 + Math.random(); this.chHp = 0;
    this.side = Math.random() < 0.5 ? 1 : -1; this.goalV = new V3(); this.bank = 0; this.climbT = 0; this.spin = 1;
    this.pos.y = groundAt(pos.x, pos.z, 40) + SCRAM.hover; this.c.copy(this.pos);
    this.glow = null; this.obj.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'ScramGlow') { if (!this.glow) this.glow = o.material.clone(); o.material = this.glow; } });
  }
  hornPos(out) { return this.n.SQ_Horn ? this.n.SQ_Horn.getWorldPosition(out) : out.copy(this.c); }
  update(dt) {
    const tg = this.tg(), pc = tg.center(playerC), P = G.player;
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    const los = this.checkLos(dt);
    this.cdT -= dt;
    if (this.st === 'idle' && this.cdT <= 0) {
      if (P && P.alive && tg === P && this.c.distanceTo(pc) < SCRAM.range * 0.95 && los) { this.st = 'charge'; this.chT = SCRAM.charge; this.chHp = this.hp; this.autoR = Math.random() < 0.55; sfx('charge', dist * 0.5); G.scramCharges = (G.scramCharges || 0) + 1; }
      else this.cdT = 0.6;
    }
    if (this.st === 'charge') {
      this.chT -= dt; const k = 1 - Math.max(0, this.chT) / SCRAM.charge;
      if (this.glow && this.glow.emissive) this.glow.emissiveIntensity = 1 + k * 7;
      if (Math.random() < 0.5) { const hp = this.hornPos(_a); G.fx.emit('add', { x: hp.x, y: hp.y, z: hp.z, life: 0.15, s0: 1 + k * 2.5, s1: 0.3, c0: 0x9cff4a }); }
      if (this.chHp - this.hp >= SCRAM.brk * G.diff.hp) {   // knocked off its aim
        this.st = 'idle'; this.cdT = 3; G.scramBreak = (G.scramBreak || 0) + 1; G.fx.sparks(this.c, null, 14, 0x9cff4a, 12, 1, 0.4, 0.25); sfx('snap', dist * 0.5);
      } else if (this.chT <= 0) {
        const hp = this.hornPos(new V3());
        G.fx.ring(hp, null, 0.5, 14, 0.3, 0x7cff2a); G.fx.flash(hp, 0x9cff4a, 40, 30, 0.2); sfx('jam', dist * 0.4);
        if (P && P.alive && hp.distanceTo(P.center(_c)) < SCRAM.range && clearLine(P.center(_c), hp) && !smokeBlocks(hp, P.center(_c))) {
          G.scramT = SCRAM.t; G.scrams = (G.scrams || 0) + 1; G.fx.streak(hp, P.center(_c), 0.5, 0x7cff2a); G.fx.ring(P.center(_c), null, 1, 6, 0.35, 0x7cff2a);
          G.onScramble && G.onScramble(this);
        } else G.scramDodge = (G.scramDodge || 0) + 1;
        this.st = 'idle'; this.cdT = SCRAM.cd[0] + Math.random() * (SCRAM.cd[1] - SCRAM.cd[0]);
      }
    } else if (this.glow && this.glow.emissive) this.glow.emissiveIntensity += (1 - this.glow.emissiveIntensity) * Math.min(1, dt * 4);
    this.spin += ((this.st === 'charge' ? 9 : 1.2) - this.spin) * Math.min(1, dt * 4);
    if (this.n.SQ_Ring1) this.n.SQ_Ring1.rotation.z += dt * this.spin;
    if (this.n.SQ_Ring2) this.n.SQ_Ring2.rotation.z -= dt * this.spin * 0.7;
    if (this.n.SQ_Dish) this.n.SQ_Dish.rotation.x = Math.max(-0.6, Math.min(0.6, Math.atan2(pc.y - this.pos.y, dist))) * 0.8;
    // orbit the target at 26-42 m
    const want = Math.max(SCRAM.keep[0], Math.min(SCRAM.keep[1], dist)), a = Math.atan2(-dz, -dx) + this.side * 0.4;
    const goal = this.goalV.set(pc.x + Math.cos(a) * want, 0, pc.z + Math.sin(a) * want);
    const gx = goal.x - this.pos.x, gz = goal.z - this.pos.z, gl = Math.hypot(gx, gz) || 1;
    const sp = SCRAM.speed * Math.min(1, gl / 6 + 0.15) * (this.st === 'charge' ? 0.2 : 1), kk = 1 - Math.exp(-2.2 * dt);
    this.vel.x += (gx / gl * sp - this.vel.x) * kk; this.vel.z += (gz / gl * sp - this.vel.z) * kk;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 2, 2.4)) { this.vel.multiplyScalar(-0.3); this.side *= -1; this.climbT = 2.5; }
    if (this.climbT > 0) this.climbT -= dt;
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) + SCRAM.hover + (this.climbT > 0 ? 14 : 0) + Math.sin(G.time * 1.7 + this.side) * 0.5;
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-2.5 * dt));
    const ny = Math.atan2(-(pc.x - this.pos.x), -(pc.z - this.pos.z)), turn = angDiff(ny, this.yaw); this.yaw += turn * Math.min(1, dt * 3);
    this.bank += (Math.max(-0.3, Math.min(0.3, -turn * 1.5)) - this.bank) * Math.min(1, dt * 3);
    this.obj.rotation.set(0, this.yaw, this.bank, 'YXZ');
    this.c.copy(this.pos);
    this.gunT -= dt;
    if (this.st === 'idle' && this.gunT <= 0 && dist < SCRAM.gunR && los) {
      this.gunT = SCRAM.gunCd;
      for (let i = 0; i < SCRAM.gunN; i++) G.queue.push({ t: i * 0.12, label: 'scrambler-gun', fn: () => {
        if (!this.alive) return;
        const mp = this.n.Muzzle_Scram ? this.n.Muzzle_Scram.getWorldPosition(new V3()) : this.c.clone();
        const aim = lead(mp, 120, _b, this.tg()); _d.subVectors(aim, mp).normalize(); _d.x += (Math.random() - 0.5) * 0.05; _d.y += (Math.random() - 0.5) * 0.04; _d.z += (Math.random() - 0.5) * 0.05; _d.normalize();
        spawnShot({ p: mp, v: _d.clone().multiplyScalar(120), dmg: SCRAM.dmg, team: 'E', kind: 'ebullet', color: 0xb8ff70, w: 0.22, len: 3, life: 0.7, label: 'scrambler-gun' });
      } });
    }
  }
}
function updateScram(dt) { if (G.scramT > 0) { G.scramT -= dt; G.scramTime = (G.scramTime || 0) + dt; } }

// ------------------------------------------------------------------ v60 polarity
// You carry a red or blue charge (X switches, 0.5 s cooldown). Every enemy carries one too (a ring under it).
// Your hits on the opposite charge do x1.5, on the same charge x0.6. Enemy shots and hits of your charge are
// absorbed (they feed overdrive), the opposite charge hits you x1.25. A polarity wave flips every enemy every 25 s.
export const POL = { opp: 1.5, same: 0.5, hitOpp: 1.6, cd: 0.5, waveEvery: 25, waveFirst: 30, warn: 3, bossFlip: 10, bossWarn: 1.5, odK: 0.6, col: { R: 0xff3a3a, B: 0x3aa0ff } };
const polRingGeo = new THREE.TorusGeometry(1, 0.07, 6, 36).rotateX(Math.PI / 2);
const polMat = (c, k, o) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false, transparent: true, opacity: o, depthWrite: false, fog: false });
const polRingMat = { R: polMat(0xff3a3a, 2.2, 0.85), B: polMat(0x3aa0ff, 2.2, 0.85) };
const pPolRing = new THREE.Group();
{ const a = new THREE.Mesh(polRingGeo, polMat(0xffffff, 2.4, 0.9)), b = new THREE.Mesh(polRingGeo, polMat(0xffffff, 1.6, 0.45)); b.scale.setScalar(0.72); pPolRing.add(a, b); pPolRing.userData = { a, b }; }
export function startPolar() {
  G.polar = { p: 'B', cd: 0, abs: 0, absDmg: 0, oppDmg: 0, waveT: POL.waveFirst, warned: false, flips: 0, swaps: 0, beamHits: 0, beamDmg: 0, beamPass: 0, fxT: 0, pause: false, rings: [] };
  G.scene.add(pPolRing); pPolRing.visible = true;
}
export function clearPolar() {
  if (G.polar) for (const r of G.polar.rings) { r.m.parent && r.m.parent.remove(r.m); r.e._pr = null; }
  G.polar = null; pPolRing.parent && pPolRing.parent.remove(pPolRing);
  for (const P of G.dyPairs) P.dispose(); G.dyPairs.length = 0;
  for (const J of G.javs) J.o.parent && J.o.parent.remove(J.o); G.javs.length = 0;
}
export function setPol(p) {
  const S = G.polar; if (!S || S.cd > 0 || p === S.p || !G.player || !G.player.alive) return false;
  S.p = p; S.cd = POL.cd; S.swaps++;
  const pc = G.player.center(new V3()); G.fx.ring(pc, null, 0.4, 7, 0.3, POL.col[p]); G.fx.flash(pc, POL.col[p], 18, 10, 0.15); sfx('charge', 0);
  return true;
}
export function togglePol() { return !!G.polar && setPol(G.polar.p === 'R' ? 'B' : 'R'); }
function polAbsorb(dmg) {
  const S = G.polar; S.abs++; S.absDmg += dmg;
  if (G.od && !(G.od.t > 0)) G.od.k = Math.min(1, G.od.k + dmg / OD.fill * POL.odK);
  if (S.fxT <= 0 && G.player) { S.fxT = 0.08; const pc = G.player.center(new V3()); G.fx.ring(pc, null, 0.6, 3.6, 0.22, POL.col[S.p]); G.fx.sparks(pc, null, 6, POL.col[S.p], 8, 1, 0.25, 0.15); }
}
const polOk = (e) => e && e.alive && !e.dying && !e.gone && e.c && !e.isMine && !e.isBarrel && !e.holo && e.kind !== 'cpart';
function flipPol(e) { e.pol = e.pol === 'R' ? 'B' : 'R'; G.fx.ring(e.c, null, 0.5, (e.r || 2) * 2.6, 0.3, POL.col[e.pol]); }
export function updatePolar(dt) {
  const S = G.polar; if (!S) return;
  S.cd -= dt; S.fxT -= dt;
  const P = G.player;
  if (P) { pPolRing.position.set(P.pos.x, P.pos.y + 0.2, P.pos.z); pPolRing.scale.setScalar(2.3 + Math.sin(G.time * 6) * 0.08); pPolRing.rotation.y += dt * 1.5;
    const c = POL.col[S.p]; pPolRing.userData.a.material.color.setHex(c).multiplyScalar(2.4); pPolRing.userData.b.material.color.setHex(c).multiplyScalar(1.6); pPolRing.visible = P.alive; }
  if (!S.pause) {
    S.waveT -= dt;
    if (!S.warned && S.waveT <= POL.warn) { S.warned = true; G.onPolar && G.onPolar('warn'); sfx('alarm', 0); }
    if (S.waveT <= 0) {
      S.waveT = POL.waveEvery; S.warned = false; S.flips++;
      for (const e of G.enemies) if (polOk(e) && e.pol) flipPol(e);
      if (P) G.fx.ring(P.center(new V3()), null, 1, 90, 0.9, 0xffffff);
      G.onPolar && G.onPolar('flip'); sfx('jam', 0);
    }
  }
  const warnK = S.warned && !S.pause;
  for (const e of G.enemies) {
    if (!polOk(e)) continue;
    if (!e.pol) e.pol = S.nextPol = S.nextPol === 'R' ? 'B' : 'R';   // alternate, so the field is always split
    const boss = e.kind === 'boss' || e.kind === 'raider';
    if (e.kind === 'boss') { e.polT = (e.polT ?? POL.bossFlip) - dt; if (e.polT <= 0) { e.polT = POL.bossFlip; flipPol(e); G.onPolar && G.onPolar('boss', e); } }
    let m = e._pr;
    if (!m) { m = e._pr = new THREE.Mesh(polRingGeo, polRingMat[e.pol]); G.scene.add(m); S.rings.push({ e, m }); }
    m.material = polRingMat[e.pol];
    const R = (e.r || 2) * (boss ? 1.1 : 1.3) + 0.5; m.scale.setScalar(R);
    m.position.set(e.c.x, e.c.y - (e.r || 2) * (boss ? 0.9 : 0.55), e.c.z); m.rotation.y += dt * 2;
    m.visible = !((warnK || (e.kind === 'boss' && e.polT < POL.bossWarn)) && ((G.time * 9) | 0) % 2);
  }
  for (let i = S.rings.length - 1; i >= 0; i--) { const r = S.rings[i]; if (!polOk(r.e)) { r.m.parent && r.m.parent.remove(r.m); r.e._pr = null; S.rings.splice(i, 1); } }
}
// what is shooting at you, by charge (the autopilot picks the charge that absorbs the most)
export function polThreat(pc) {
  const w = { R: 0, B: 0 };
  for (const e of G.enemies) {
    if (!polOk(e) || !e.pol) continue;
    const d = e.c.distanceTo(pc); if (d > 75) continue;
    if (e.kind === 'boss' || e.kind === 'raider') { w[e.pol === 'R' ? 'B' : 'R'] += e.kind === 'boss' ? 2.5 : 1.5; continue; }   // their fire is mixed: wear the other colour and hit them harder
    w[e.pol] += (e.kind === 'crawler' ? 0.4 : 1) * (e.los === false ? 0.4 : 1) * (d < 30 ? 1.3 : 1);
  }
  for (const D of G.dyPairs) { const b = D.beamNear(pc); if (b < 16) w[D.tp] += D.st === 'sweep' ? 8 : 3; }
  return w;
}

// ------------------------------------------------------------------ v60 dyad twin drones
// Spawned as a red/blue pair, linked by a tether whose colour swaps every 3 s. Crossing the tether at the other
// charge burns 40/s. They orbit at 30-42 m and every 9-12 s sweep the tether straight through you at your height.
// Kill one and the other rebuilds it at half health after 8 s (twice per pair) unless you finish both.
export const DYAD = { hp: 620, r: 2.0, hover: 8, keep: [30, 42], sep: 22, speed: 13, sweepSp: 17, sweepCd: [7, 10], beamDps: 45, beamHit: 30, beamR: 3, flipT: 3, flipWarn: 0.6, gunCd: 2.6, gunN: 3, dmg: 8, gunR: 75, rebuild: 8, rebK: 0.5, rebMax: 1 };
G.dyPairs = [];
const dyBeamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
function dySeg(a, b, p) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, L2 = ux * ux + uy * uy + uz * uz || 1;
  let k = ((p.x - a.x) * ux + (p.y - a.y) * uy + (p.z - a.z) * uz) / L2; k = Math.max(0, Math.min(1, k));
  return Math.hypot(a.x + ux * k - p.x, a.y + uy * k - p.y, a.z + uz * k - p.z);
}
class DyadPair {
  constructor(a, b) {
    this.m = [a, b]; this.st = 'orbit'; this.swT = 4 + Math.random() * 3; this.tp = Math.random() < 0.5 ? 'R' : 'B'; this.tT = DYAD.flipT;
    this.mid = new V3().addVectors(a.pos, b.pos).multiplyScalar(0.5); this.midY = this.mid.y; this.sdir = new V3(1, 0, 0); this.axis = new V3(1, 0, 0); this.left = 0; this.side = Math.random() < 0.5 ? 1 : -1;
    this.rebT = 0; this.reb = 0; this.frame = -1; this.hurtT = 0; this.passT = 0; this.goneT = 0;
    this.core = new THREE.Mesh(dyBeamGeo, polMat(0xffffff, 3, 0.95)); this.halo = new THREE.Mesh(dyBeamGeo, polMat(0xffffff, 1.6, 0.35));
    this.halo.material.blending = THREE.AdditiveBlending; this.beam = new THREE.Group(); this.beam.add(this.core, this.halo); G.scene.add(this.beam);
    G.dyPairs.push(this);
  }
  dispose() { this.beam.parent && this.beam.parent.remove(this.beam); this.dead = true; }
  live() { return this.m.filter((e) => e && e.alive && !e.dying); }
  beamNear(pc) { const L = this.live(); return L.length === 2 && !this.dead ? dySeg(L[0].c, L[1].c, pc) : 1e9; }
  step(dt) {
    if (this.frame === G.time || this.dead) return; this.frame = G.time;
    const L = this.live(); if (!L.length) { this.dispose(); return; }
    const tg = L[0].tg(), pc = tg.center(new V3()), P = G.player;
    this.tT -= dt; if (this.tT <= 0) { this.tp = this.tp === 'R' ? 'B' : 'R'; this.tT = DYAD.flipT; }
    const gy = groundAt(this.mid.x, this.mid.z, this.mid.y + 2);
    if (L.length === 2) {
      this.rebT = 0;
      const dx = this.mid.x - pc.x, dz = this.mid.z - pc.z, dist = Math.hypot(dx, dz) || 1;
      if (this.st === 'orbit') {
        this.swT -= dt;
        const want = Math.max(DYAD.keep[0], Math.min(DYAD.keep[1], dist)), a = Math.atan2(dz, dx) + this.side * 0.5;
        const gx = pc.x + Math.cos(a) * want - this.mid.x, gz = pc.z + Math.sin(a) * want - this.mid.z, gl = Math.hypot(gx, gz) || 1, sp = DYAD.speed * Math.min(1, gl / 8 + 0.2);
        this.mid.x += gx / gl * sp * dt; this.mid.z += gz / gl * sp * dt;
        this.axis.set(-dz / dist, 0, dx / dist);
        this.midY += (gy + DYAD.hover - this.midY) * Math.min(1, dt * 1.5);
        if (this.swT <= 0 && dist < 62 && L[0].los && L[1].los && clearLine(new V3(this.mid.x, this.midY, this.mid.z), pc)) {
          this.st = 'sweep'; const tv = tg.vel || new V3();
          this.sdir.set(pc.x + tv.x * 0.6 - this.mid.x, 0, pc.z + tv.z * 0.6 - this.mid.z); const sl = this.sdir.length() || 1; this.sdir.multiplyScalar(1 / sl);
          this.left = sl + 24; G.dySweeps = (G.dySweeps || 0) + 1; sfx('charge', dist * 0.5); G.onDyad && G.onDyad('sweep', this);
        }
      } else {
        const tx = pc.x - this.mid.x, tz = pc.z - this.mid.z, tl = Math.hypot(tx, tz) || 1;
        if ((tx * this.sdir.x + tz * this.sdir.z) / tl > 0.2 && tl > 4) {   // still ahead: bend the sweep towards you
          const da = angDiff(Math.atan2(tz, tx), Math.atan2(this.sdir.z, this.sdir.x)), na = Math.atan2(this.sdir.z, this.sdir.x) + Math.max(-1.5 * dt, Math.min(1.5 * dt, da));
          this.sdir.set(Math.cos(na), 0, Math.sin(na)); this.left = Math.max(this.left, tl + 20);
        }
        const st = DYAD.sweepSp * dt; this.mid.addScaledVector(this.sdir, st); this.left -= st;
        this.axis.set(-this.sdir.z, 0, this.sdir.x);
        this.midY += (Math.max(gy + 2.4, pc.y + 0.3) - this.midY) * Math.min(1, dt * 2.5);
        if (this.left <= 0 || (this.left < 20 && collideCyl(this.mid.clone().setY(this.midY), 1, 2))) { this.st = 'orbit'; this.swT = DYAD.sweepCd[0] + Math.random() * (DYAD.sweepCd[1] - DYAD.sweepCd[0]); this.side *= -1; }
      }
    } else {
      const e = L[0]; this.st = 'orbit';
      if (this.mid.distanceTo(_a.set(e.pos.x, this.mid.y, e.pos.z)) > 12) this.mid.set(e.pos.x, this.mid.y, e.pos.z);
      { const dx = this.mid.x - pc.x, dz = this.mid.z - pc.z, dist = Math.hypot(dx, dz) || 1, want = Math.max(DYAD.keep[0] * 0.8, Math.min(DYAD.keep[1] * 0.8, dist)), a = Math.atan2(dz, dx) + this.side * 0.5;
        const gx = pc.x + Math.cos(a) * want - this.mid.x, gz = pc.z + Math.sin(a) * want - this.mid.z, gl = Math.hypot(gx, gz) || 1, sp = DYAD.speed * Math.min(1, gl / 8 + 0.2);
        this.mid.x += gx / gl * sp * dt; this.mid.z += gz / gl * sp * dt; this.axis.set(-dz / dist, 0, dx / dist);
        this.midY += (gy + DYAD.hover - this.midY) * Math.min(1, dt * 1.5); }
      this.rebT += dt;
      if (this.reb < DYAD.rebMax && this.rebT >= DYAD.rebuild) {
        const at = new V3(e.pos.x + this.axis.x * 6, e.pos.y, e.pos.z + this.axis.z * 6);
        const nu = new Dyad(at, e.pol === 'R' ? 'B' : 'R', this); nu.hp = nu.maxHp * DYAD.rebK;
        const i = this.m[0] === e ? 1 : 0; this.m[i] = nu; this.reb++; this.rebT = 0; G.dyRebuilt = (G.dyRebuilt || 0) + 1;
        G.fx.streak(e.c, nu.c, 0.4, 0xffffff); G.fx.ring(nu.c, null, 0.6, 8, 0.4, POL.col[nu.pol]); sfx('charge', P ? P.pos.distanceTo(at) * 0.5 : 0);
        G.onDyad && G.onDyad('rebuild', this);
      } else if (this.reb < DYAD.rebMax && Math.random() < dt * 8) { const k = this.rebT / DYAD.rebuild; G.fx.emit('add', { x: e.c.x + this.axis.x * 6 * k, y: e.c.y, z: e.c.z + this.axis.z * 6 * k, life: 0.2, s0: 0.6 + k * 2, s1: 0.2, c0: 0xffffff }); }
    }
    // member goals
    for (let i = 0; i < 2; i++) { const e = this.m[i]; if (!e || !e.alive) continue; const sg = L.length === 2 ? (i ? -1 : 1) * DYAD.sep / 2 : 0; e.goal.set(this.mid.x + this.axis.x * sg, this.midY, this.mid.z + this.axis.z * sg); }
    // tether
    if (L.length === 2) {
      const a = L[0].c, b = L[1].c, len = a.distanceTo(b) || 0.01;
      this.beam.visible = true; this.beam.position.addVectors(a, b).multiplyScalar(0.5);
      this.beam.quaternion.setFromUnitVectors(_yUp, _a.subVectors(b, a).multiplyScalar(1 / len));
      const sw = this.st === 'sweep', flick = this.tT < DYAD.flipWarn && ((G.time * 12) | 0) % 2, col = POL.col[flick ? (this.tp === 'R' ? 'B' : 'R') : this.tp];
      this.core.scale.set(sw ? 0.16 : 0.1, len, sw ? 0.16 : 0.1); this.halo.scale.set(sw ? 0.7 : 0.45, len, sw ? 0.7 : 0.45);
      this.core.material.color.setHex(col).multiplyScalar(sw ? 3.4 : 2.4); this.halo.material.color.setHex(col).multiplyScalar(sw ? 1.4 : 0.8);
      if (P && P.alive) {
        const pc2 = P.center(new V3()), dd = dySeg(a, b, pc2);
        if (dd < DYAD.beamR) {
          if (G.polar && G.polar.p === this.tp) { G.polar.beamPass += dt; this.passT -= dt; if (this.passT <= 0) { this.passT = 0.12; G.fx.sparks(pc2, null, 5, col, 10, 1, 0.2, 0.15); } }
          else { const pv = G.curPol, sh = G.curShooter, bd = DYAD.beamDps * dt + (this.hurtT <= 0 ? DYAD.beamHit : 0); G.curPol = 0; G.curShooter = null; damagePlayer(bd, this.beam.position, 'dyad-beam'); G.curPol = pv; G.curShooter = sh;
            if (G.polar) { G.polar.beamDmg += bd; if (this.hurtT <= 0) G.polar.beamHits++; } if (this.hurtT <= 0) { sfx('zap', 0); G.fx.ring(pc2, null, 0.4, 4, 0.25, col); } this.hurtT = 0.6;
            if (Math.random() < 0.4) G.fx.sparks(pc2, null, 4, col, 12, 1, 0.2, 0.15); }
        }
        this.hurtT -= dt;
      }
    } else this.beam.visible = false;
  }
}
const _yUp = new V3(0, 1, 0);
export function spawnDyads(at) {
  const ax = Math.random() * 6.28, ox = Math.cos(ax) * DYAD.sep / 2, oz = Math.sin(ax) * DYAD.sep / 2;
  const a = new Dyad(new V3(at.x + ox, at.y, at.z + oz), 'R', null), b = new Dyad(new V3(at.x - ox, at.y, at.z - oz), 'B', null);
  const P = new DyadPair(a, b); a.pair = P; b.pair = P;
  return P;
}
export class Dyad extends Enemy {
  constructor(pos, pol, pair) {
    super('dyad', 'E_Dyad', pos, DYAD.hp, DYAD.r); this.boom = 0.9; this.obj.scale.setScalar(1.5); this.pol = pol; this.pair = pair;
    this.vel = new V3(); this.goal = new V3().copy(pos); this.yaw = Math.random() * 6.28; this.gunT = 1.5 + Math.random() * 1.5; this.spin = 1;
    this.pos.y = groundAt(pos.x, pos.z, 40) + DYAD.hover; this.goal.y = this.pos.y; this.c.copy(this.pos);
    this.glow = null; this._tc = null;
    this.obj.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'PolGlow') { if (!this.glow) this.glow = o.material.clone(); o.material = this.glow; } });
  }
  remove() { super.remove(); if (this.pair && !this.pair.live().length) this.pair.dispose(); }
  update(dt) {
    if (this.pair) this.pair.step(dt);
    const tg = this.tg(), pc = tg.center(playerC);
    const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    const los = this.checkLos(dt), sw = this.pair && this.pair.st === 'sweep';
    const gx = this.goal.x - this.pos.x, gz = this.goal.z - this.pos.z, gl = Math.hypot(gx, gz) || 1;
    const sp = (sw ? DYAD.sweepSp * 1.4 : DYAD.speed * 1.3) * Math.min(1, gl / 5 + 0.1), kk = 1 - Math.exp(-3 * dt);
    this.vel.x += (gx / gl * sp - this.vel.x) * kk; this.vel.z += (gz / gl * sp - this.vel.z) * kk;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    if (collideCyl(this.pos, 1.8, 2.2)) this.vel.multiplyScalar(-0.3);
    const gy = Math.max(this.goal.y, groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5) + 2) + Math.sin(G.time * 2 + this.yaw) * 0.3;
    this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-3 * dt));
    const ny = Math.atan2(dx, dz); this.yaw += angDiff(ny, this.yaw) * Math.min(1, dt * 3);
    this.obj.rotation.set(0, this.yaw, 0, 'YXZ');
    this.spin += ((sw ? 7 : 1.5) - this.spin) * Math.min(1, dt * 3);
    if (this.n.DY_Cage) this.n.DY_Cage.rotation.y += dt * this.spin;
    if (this.glow && this._tc !== this.pol) { this._tc = this.pol; const c = POL.col[this.pol]; this.glow.color.setHex(c); if (this.glow.emissive) this.glow.emissive.setHex(c); }
    this.c.copy(this.pos);
    this.gunT -= dt;
    if (!sw && this.gunT <= 0 && dist < DYAD.gunR && los) {
      this.gunT = DYAD.gunCd + Math.random() * 0.4;
      for (let i = 0; i < DYAD.gunN; i++) G.queue.push({ t: i * 0.13, label: 'dyad-gun', fn: () => {
        if (!this.alive) return;
        const mp = this.n.Muzzle_Dyad ? this.n.Muzzle_Dyad.getWorldPosition(new V3()) : this.c.clone();
        const aim = lead(mp, 110, new V3(), this.tg()), v = aim.sub(mp).normalize();
        v.x += (Math.random() - 0.5) * 0.05; v.y += (Math.random() - 0.5) * 0.04; v.z += (Math.random() - 0.5) * 0.05; v.normalize();
        spawnShot({ p: mp, v: v.multiplyScalar(110), dmg: DYAD.dmg, team: 'E', kind: 'ebullet', color: POL.col[this.pol], w: 0.26, len: 3.5, life: 0.8, label: 'dyad-gun' });
        G.fx.muzzle(mp, v.clone().normalize(), POL.col[this.pol], 0.9); sfx('eshot', this.c.distanceTo(G.player.pos));
      } });
    }
  }
}

// ------------------------------------------------------------------ v60 JV-3 javelin
G.javs = [];
const javGeo = { shaft: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6).rotateX(Math.PI / 2), head: new THREE.ConeGeometry(0.13, 0.55, 8).rotateX(Math.PI / 2).translate(0, 0, 1.35), fin: new THREE.BoxGeometry(0.34, 0.03, 0.3).translate(0, 0, -0.95) };
const javMat = { shaft: new THREE.MeshStandardMaterial({ color: 0x8c9098, metalness: 0.8, roughness: 0.35 }), head: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a3a).multiplyScalar(2.6), toneMapped: false }) };
function fireJav(owner, slot, d, mul, aim) {
  const mp = owner.muzzlePos(slot, new V3(), 0).clone(), dir = new V3().subVectors(aim, mp).normalize();
  if (!Number.isFinite(dir.x + dir.y + dir.z) || !Number.isFinite(mp.x + mp.y + mp.z)) return;
  dir.y += Math.min(0.03, mp.distanceTo(aim) / d.speed * d.grav * 0.5 / d.speed);   // aim a touch high to cancel the drop
  const o = new THREE.Group(), f2 = new THREE.Mesh(javGeo.fin, javMat.shaft); f2.rotation.z = Math.PI / 2;
  o.add(new THREE.Mesh(javGeo.shaft, javMat.shaft), new THREE.Mesh(javGeo.head, javMat.head), new THREE.Mesh(javGeo.fin, javMat.shaft), f2);
  o.position.copy(mp); G.scene.add(o);
  G.javs.push({ o, p: mp.clone(), prev: mp.clone(), v: dir.normalize().multiplyScalar(d.speed), d, mul, hit: new Set(), n: 0, pinned: false, t: 0, stuck: 0 });
  G.javN = (G.javN || 0) + 1;
  G.fx.muzzle(mp, dir, 0xffb060, 1.4);
}
const javLight = (e) => e.kind !== 'boss' && e.kind !== 'raider' && e.kind !== 'cpart' && !e.isObjective && !e.isMine && !e.isBarrel && !e.isColossus && !e.isTrain && e.maxHp < 2000 * G.diff.hp;
function updateJavs(dt) {
  const fx = G.fx, dir = _jd;
  for (let i = G.javs.length - 1; i >= 0; i--) {
    const J = G.javs[i], d = J.d;
    if (J.stuck > 0) { J.stuck -= dt; if (J.stuck <= 0) { J.o.parent && J.o.parent.remove(J.o); G.javs.splice(i, 1); } continue; }
    J.t += dt; J.v.y -= d.grav * dt;
    const sp = J.v.length(), st = sp * dt; dir.copy(J.v).multiplyScalar(1 / sp);
    J.prev.copy(J.p);
    const w = raySolids(J.p, dir, st);
    let wall = false;
    if (w.t < st) { J.p.addScaledVector(dir, Math.max(0, w.t - 0.3)); wall = true; } else J.p.addScaledVector(dir, st);
    // pierce everything along the step
    _jc.subVectors(J.p, J.prev); const L2 = _jc.lengthSq(); let done = false;
    const prevL = G.curLabel; G.curLabel = 'p-jav';
    for (const e of entsFor('P')) {
      if (J.hit.has(e) || e.isMine || !e.alive) continue;
      _jb.subVectors(e.c, J.prev); let k = L2 > 0 ? _jb.dot(_jc) / L2 : 0; k = Math.max(0, Math.min(1, k));
      const ex = J.prev.x + _jc.x * k - e.c.x, ey = J.prev.y + _jc.y * k - e.c.y, ez = J.prev.z + _jc.z * k - e.c.z, r = (e.r || 1) + 0.5;
      if (ex * ex + ey * ey + ez * ez > r * r) continue;
      J.hit.add(e); const h = e.kind === 'cpart' ? e.owner : e;
      dealDamage(e, d.dmg * J.mul * Math.pow(d.pierceK, J.n), 'P', e.c, 'p-jav'); J.n++; G.javHits = (G.javHits || 0) + 1;
      fx.sparks(e.c, dir, 12, 0xffc080, 16, 1, 0.3, 0.2);
      if (J.n > 1) G.javMulti = (G.javMulti || 0) + 1;
      if (!J.pinned && h && h.alive && javLight(h)) {
        J.pinned = true; h.stunT = Math.max(h.stunT || 0, d.pin); G.javPins = (G.javPins || 0) + 1;
        if (h.pos) { const ox = h.pos.x, oz = h.pos.z; h.pos.x += dir.x * d.knock; h.pos.z += dir.z * d.knock; if (collideCyl(h.pos, (h.r || 2) * 0.8, 2)) { h.pos.x = ox; h.pos.z = oz; } h.c && h.c.set(h.c.x + h.pos.x - ox, h.c.y, h.c.z + h.pos.z - oz); }
        fx.ring(h.c, null, 0.5, 5, 0.3, 0xffb060);
      }
      if (J.n >= d.pierce) { done = true; break; }
    }
    G.curLabel = prevL;
    J.o.position.copy(J.p); _jb.copy(J.p).add(dir); J.o.lookAt(_jb);
    if (Math.random() < 0.6) fx.emit('add', { x: J.p.x, y: J.p.y, z: J.p.z, life: 0.14, s0: 0.7, s1: 0.1, c0: 0xff9a3a });
    if (wall && !done) { J.stuck = 1.6; fx.sparks(J.p, null, 12, 0xffc080, 14, 1, 0.3, 0.2); sfx('ric', G.player ? G.player.pos.distanceTo(J.p) : 0); wallMark(J.p, w.solid); continue; }
    if (done || J.t > d.life) { J.o.parent && J.o.parent.remove(J.o); G.javs.splice(i, 1); }
  }
}
const _jd = new V3(), _jb = new V3(), _jc = new V3();
