// IRON VANGUARD — main loop, camera, input, aiming, waves, HUD, hangar.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadKit, loadParts, cloneKit } from './kit.js';
import { buildArena, addSolid, ARENA, solids, raySolids, groundAt, pointInSolid, clearLine, relaySites, mulberry32, STORM_RODS, LAVA, lavaAt, PLAT, WATER, GRID } from './world.js';
import { FX, TEX } from './fx.js';
import { AtmospherePass, makeRidge } from './post.js';
import { initAudio, sfx, thrust, musicTick, setVolume } from './audio.js';
import { Mech, PALETTES, FRAMES, angDiff, PHYS, MECHS, PARTS, PART_SLOTS, SLOT_NAMES, BUILDS, partStats, partsReady } from './mech.js';
import { Wingman, Reactor, Convoy, WING } from './ally.js';
import { G, OD, explodeAt, WEAPONS, ARM_KEYS, SHOULDER_KEYS, weaponState, weaponTick, updateCombat, Turret, Drone, Walker, Bulwark, Gunship, Relay, Boss, BOSSES, RAIDERS, Colossus, Stalker, Mender, Crawler, Sapper, Jammer, JAM_R, Dropship, Howitzer, Warden, Burrower, Train, TRAIN, setEcho, Eel, Jet, Splitter, clearMeteors, Skimmer, clearHooks, Leviathan, Prism, PRISM, Fencer, FENCE, Hive, clearGrid, Blinker, BLINK, Watchtower, WATCH, clearBarrage, Frostcaster, FROST, ICE, startIce, clearIce, Airship, BLIMP, WIND, startWind, clearWind, Mirage, MIRAGE, clearStickies, Deflector, DEFL, MAGNET, startCranes, clearCranes, clearPMines, Rammer, RAM, QUAKE, startQuakes, clearQuakes, fissureDist, Leaper, LEAP, FLARE, Herald, HERALD, Tower, Citadel, Trooper, Shade, SHADE, LANE, Marshal, DECAP, startDecap, clearDecap, Dazzler, DAZZ, clearLinkB, Pulsar, PULSE, MAZE, startMaze, clearMaze, clearRings, clearBWalls, Forklift, FACT, startFactory, clearFactory, clearTBeams, TSU, Swapper, SWAP, startTsunami, clearTsunami, clearNano, tsuEta, inWave, BIO, Seeder, SEED, startBio, clearBio, clearPlOrbs, inCreep, ATOM, Bloater, BLOAT, startAtom, clearAtom, decaySpread, GLAD, Adaptor, ADAPT, Sprayer, SPRAY, Scrambler, SCRAM, FUSE, startFuse, clearFuse, fuseNear, POL, DYAD, Dyad, spawnDyads, startPolar, clearPolar, togglePol, setPol, polThreat, Raptor, RAPT, CTF, startCTF, clearCTF, BUB, clearBubbles, TURF, startTurf, clearTurf, turfShare, turfAt, turfKill, startGlad, clearGlad, gladGate, gladKill, gladVentAt, clearSaws, Reviver, REVIVE, noteWreck, CAMO, clearCamo, clearWrecks, SABOT, startSabot, clearSabot, sabTarget, Weaver, WEAVE, HACK, hackable, EVAC, EVAC_ROAD, startEvac, clearEvac, evacWalking, clearWebs, clearHacks, Launcher, Cruise, SKY, startSky, clearSky, Courier, COURIER, COURIER_PATH, startPursuit, clearPursuit, Torcher, TORCH, clearFires, clearNets, Dish, Anchor, ANCHOR, LANCE, startLance, clearLance, Engineer, ENG, BEACON, BEACON_GATES, BEACON_PATH, startBeacon, clearBeacon, beaconNext, beaconTime, clearBurn, startLane, clearLane, laneObjective, laneEscorted, clearRBeam, Bastion, Hijacker, HIJACK, FORT, FORT_PADS, startFort, clearFort, padAction, fortGoal, clearRefl, Scav, SCAV, SALV, startSalvage, clearSalvage, dropCores, nearestCore, Planter, PLANT, DEPOT, startDepots, clearDepots, nearestCharge, Lurker, LURK, FOG, startFog, clearFog, fogSeen, fogFar, resetRewind, Snatcher, SNATCH, SUPPLY, startSupply, clearSupply, nearestCrate, Disarmer, DISARM, RIFT, startRifts, clearRifts, Leech, LEECH, TRAFFIC, startTraffic, clearTraffic, truckAhead, THUNDER, startThunder, clearThunder, rodCover, clearRods, startFlares, clearFlares, inShade, resetNeedles, startTwisters, clearTwisters, TWIST, startAcid, clearAcid, clearStasis, clearSmokes, Grappler, hurtPlayer, domeAt, clearWells, clearChill, clearStrikes, clearDiscs, clearDecoys, clearMines, clearMinis, dropRepair, enemyEnts, rayEnts } from './combat.js';

const $ = (id) => document.getElementById(id);
// rail loop for the train mission: a 118 x 82 m oval, closed (last point == first)
const TRACK = (() => { const a = []; for (let i = 0; i <= 96; i++) { const t = i / 96 * Math.PI * 2; a.push([118 * Math.cos(t), 82 * Math.sin(t)]); } a[96] = a[0]; a.rail = true; return a; })();
const V3 = THREE.Vector3;
const DIFFS = {
  easy: { name: '新兵', desc: '受到伤害 ×0.5 · 敌方耐久 ×0.8 · 报酬 ×0.7', dmg: 0.5, hp: 0.8, cr: 0.7 },
  normal: { name: '正规', desc: '标准 · 报酬 ×1', dmg: 0.8, hp: 1, cr: 1 },
  hard: { name: '王牌', desc: '受到伤害 ×1.6 · 敌方耐久 ×1.25 · 报酬 ×1.5', dmg: 1.25, hp: 1.25, cr: 1.5 },
};
const CTF_LANES = Object.assign([[0, -158], [0, 158], [-80, -158], [-80, 158], [80, -158], [80, 158], [-80, -140], [80, -140], [-80, 140], [80, 140]], { skip: [1, 3, 5, 7] });   // v61: three clear north-south lanes + a cross lane at each base
const MISSIONS = {
  drill: { name: '演习场', en: 'PROVING GROUND', desc: '白天 · 炮台 / 无人机 / 步行机 · 头目「暴君」', seed: 3, env: 'day', reward: 2000, waves: [
    { title: 'WAVE 1', sub: '清除外围炮台与无人机', spawn: { turret: 5, drone: 6 } },
    { title: 'WAVE 2', sub: '装甲步行机接近', spawn: { walker: 3, drone: 6, turret: 3 } },
    { title: 'WAVE 3', sub: '全面进攻', spawn: { walker: 4, drone: 8, turret: 4 } },
    { title: 'FINAL WAVE', sub: '击破重装指挥机「暴君」', spawn: { boss: 'tyrant', drone: 3 } },
  ] },
  harbor: { name: '夜袭 · 港湾区', en: 'NIGHT RAID', desc: '夜间 · 护盾坦克 / 武装直升机 · 头目「幻影」', seed: 11, env: 'night', reward: 3200, waves: [
    { title: 'WAVE 1', sub: '护盾坦克推进 · 从侧面、背后、上方攻击，或用光束剑斩开', spawn: { bulwark: 2, drone: 5, turret: 3 } },
    { title: 'WAVE 2', sub: '武装直升机来袭 · 导弹警报时急闪躲避 · 布雷机会在你周围撒地雷', spawn: { gunship: 1, walker: 2, drone: 3, sapper: 1 } },
    { title: 'WAVE 3', sub: '全面进攻 · 当心隐形狙击机「潜猎者」的红色激光', spawn: { gunship: 2, bulwark: 2, turret: 3, drone: 3, stalker: 1 } },
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
    { title: 'WAVE 3', sub: '空中突击 · 布雷机随行', spawn: { gunship: 2, drone: 5, walker: 2, sapper: 1 }, late: { gunship: 1, drone: 5 } },
    { title: 'WAVE 4', sub: '全面合围 · 维修无人机随行', spawn: { bulwark: 2, walker: 3, gunship: 1, drone: 4, mender: 1 }, late: { gunship: 1, walker: 2, drone: 4 } },
    { title: 'FINAL WAVE', sub: '击破「暴君」 · 它会直扑反应堆', spawn: { boss: 'tyrant', walker: 3, drone: 4, bossHp: 0.85 }, late: { bulwark: 2, drone: 4 } },
  ] },
  storm: { name: '暴雨 · 机甲猎杀', en: 'STORM HUNT', desc: '雷暴夜雨 · 敌方机甲小队「掠夺者」「枪骑兵」 · 头目「幻影」', seed: 41, env: 'storm', reward: 4200, waves: [
    { title: 'WAVE 1', sub: '掠夺者小队接近 · 它们和你一样会推进、急闪', spawn: { raider: 2, drone: 4, turret: 3 } },
    { title: 'WAVE 2', sub: '枪骑兵加入 · 光束剑冲刺前会红光预警 · 雨中有隐形狙击机', spawn: { raider: 2, lancer: 1, walker: 2, drone: 3, stalker: 1 } },
    { title: 'WAVE 3', sub: '机甲猎杀队 · 干扰机随行，靠近它锁定会失效', spawn: { lancer: 1, raider: 2, gunship: 1, jammer: 1 }, late: { lancer: 1, drone: 3 } },
    { title: 'FINAL WAVE', sub: '猎杀队队长「幻影」亲自出击', spawn: { boss: 'phantom' } },
  ] },
  convoy: { name: '沙漠 · 运输车护送', en: 'CONVOY ESCORT', desc: '白天 · 护送装甲运输车穿越敌区 · 头目「暴君」', seed: 51, env: 'desert', reward: 4000, convoy: true, coreHp: 4200,
    path: [[-140, 135], [-40, 135], [10, 90], [60, 60], [90, -10], [60, -80], [-20, -110], [-100, -100], [-140, -140]],
    stops: [45, 185, 315, 430, 520], waves: [
    { title: 'AMBUSH', sub: '车队遭遇伏击 · 运输车停车等待 · 清除敌人后继续前进', spawn: { turret: 4, drone: 5, walker: 3 } },
    { title: 'WAVE 2', sub: '装甲部队拦截 · 布雷机在路上撒雷，地雷也会炸运输车', spawn: { walker: 3, bulwark: 2, drone: 3, sapper: 1 }, late: { walker: 2, drone: 3 } },
    { title: 'WAVE 3', sub: '空中拦截 · 掠夺者出现', spawn: { gunship: 2, raider: 1, drone: 4 }, late: { walker: 2, raider: 1 } },
    { title: 'WAVE 4', sub: '敌方机甲小队 · 维修无人机随行', spawn: { bulwark: 2, raider: 2, lancer: 1, drone: 3, mender: 1 }, late: { gunship: 1, walker: 2 } },
    { title: 'FINAL WAVE', sub: '「暴君」封锁撤离点', spawn: { boss: 'tyrant', drone: 3, walker: 2 }, late: { raider: 1, bulwark: 1, drone: 3 } },
  ] },
  ash: { name: '灰烬 · 巨像', en: 'COLOSSUS', desc: '火山灰夜幕 · 巨型四足攻城兵器「巨像」 · 先毁武器舱再打核心', seed: 61, env: 'ash', reward: 5200, waves: [
    { title: 'WAVE 1', sub: '先遣部队', spawn: { walker: 3, drone: 5, turret: 3 } },
    { title: 'WAVE 2', sub: '护卫机甲', spawn: { raider: 2, bulwark: 1, drone: 4 } },
    { title: 'FINAL WAVE', sub: '巨像来袭 · 摧毁两座武器舱，再攻击腹部核心 · 别站在它脚下', spawn: { colossus: 1, drone: 3 } },
  ] },
  uplink: { name: '工业区 · 据点争夺', en: 'UPLINK CONTROL', desc: '白天 · 占领并守住 A / B / C 三个据点，上行链路满载后击破「暴君」', seed: 71, env: 'day', reward: 4600, capture: true,
    zones: [[-100, 30], [96, 10], [-4, -104]], waves: [
    { title: 'CAPTURE', sub: '占领 A / B / C 据点 · 站进圈内，并清除圈内的敌方地面单位', spawn: { drone: 4, mender: 1 }, zoneDef: { turret: 1, walker: 2 } },
    { title: 'COUNTERATTACK', sub: '敌军反攻据点 · 维修无人机随行', spawn: { walker: 3, bulwark: 2, drone: 4, mender: 1 }, at: 0.3 },
    { title: 'COUNTERATTACK', sub: '掠夺者小队前来夺点 · 当心隐形狙击机与干扰机', spawn: { raider: 2, lancer: 1, walker: 2, drone: 3, stalker: 1, mender: 1, jammer: 1 }, at: 0.65 },
    { title: 'FINAL WAVE', sub: '上行链路完成 · 击破来袭的「暴君」', spawn: { boss: 'tyrant', drone: 3, mender: 1 } },
  ] },
  extract: { name: '废城 · 数据撤离', en: 'EXTRACTION', desc: '黎明 · 下载 3 处数据终端，再到撤离点坚守 30 秒等待回收 · 自爆蜘蛛群 · 头目「幻影」追击', seed: 81, env: 'dawn', reward: 5000, extract: true,
    zones: [[-112, 18], [104, -40], [-10, -118]], evac: [126, 116], waves: [
    { title: 'INFILTRATE', sub: '潜入废城 · 站在数据终端旁下载（12 秒）· 每个终端都有守军', spawn: { turret: 3, drone: 4 }, zoneDef: { turret: 1, walker: 1 } },
    { title: 'AMBUSH', sub: '下载被发现 · 自爆蜘蛛群来袭 · 扑击前会闪红光，跳起或急闪躲开', spawn: { crawler: 10, drone: 3, walker: 1 } },
    { title: 'AMBUSH', sub: '掠夺者追踪信号而来 · 维修无人机随行', spawn: { crawler: 12, raider: 1, walker: 1, mender: 1 } },
    { title: 'AMBUSH', sub: '全面追击 · 当心隐形狙击机', spawn: { crawler: 14, bulwark: 1, lancer: 1, stalker: 1 } },
    { title: 'EXTRACT', sub: '数据已全部取得 · 前往撤离点坚守 30 秒 · 「幻影」正在追击', spawn: { crawler: 8, drone: 3 }, lateBoss: { type: 'phantom', hp: 0.5, t: 8 } },
  ] },
  forge: { name: '熔岩 · 地心锻炉', en: 'MAGMA FORGE', desc: '熔岩河横贯战场，踩上去持续受伤 · 火山弹从河中喷发 · 钻地虫从脚下破土而出 · 头目「暴君」', seed: 131, env: 'forge', reward: 5000, waves: [
    { title: 'WAVE 1', sub: '熔岩河 · 跳起或悬停越过 · 当心追着你的尘土', spawn: { turret: 2, walker: 3, drone: 3, burrower: 3 } },
    { title: 'WAVE 2', sub: '钻地虫群 · 红圈出现立刻离开 · 它钻出地面才能被击中', spawn: { walker: 3, burrower: 3, gunship: 2, crawler: 5 } },
    { title: 'WAVE 3', sub: '重装部队在熔岩对岸推进', spawn: { bulwark: 1, raider: 2, burrower: 3, drone: 3, howitzer: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」踏着熔岩而来', spawn: { boss: 'tyrant', burrower: 3, drone: 3 } },
  ] },
  ion: { name: '离子风暴 · 收缩战区', en: 'ION STORM', desc: '离子风暴从四周收拢 · 安全区每波缩小并移动，区外持续受伤 · 钩锁机躲在风暴里把你拖出去 · 头目「暴君」', seed: 161, env: 'ion', reward: 5600, storm: true, waves: [
    { title: 'WAVE 1', sub: '风暴正在收拢 · 留在安全区内', spawn: { drone: 4, walker: 4, grappler: 2, crawler: 6 } },
    { title: 'WAVE 2', sub: '钩锁机 · 被钩中立刻急闪或跃迁挣脱', spawn: { walker: 3, grappler: 2, gunship: 1, crawler: 6, stalker: 1 } },
    { title: 'WAVE 3', sub: '安全区再次缩小 · 敌机守在风暴边缘', spawn: { raider: 2, grappler: 3, drone: 3, sapper: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」在风暴眼中等你', spawn: { boss: 'tyrant', bossHp: 1.2, grappler: 2, drone: 2 } },
  ] },
  abyss: { name: '深渊 · 海底基地', en: 'ABYSS', desc: '海底 · 浮力让跳跃更高、下坠更慢 · 能见度低 · 雷鳗蓄力后高速冲刺撕咬 · 隐形狙击机藏在暗处 · 头目「幻影」', seed: 171, env: 'abyss', grav: 0.55, reward: 5800, waves: [
    { title: 'WAVE 1', sub: '雷鳗 · 蓄力时蓝线就是它的冲刺路线，横向闪开', spawn: { drone: 3, walker: 3, eel: 3, crawler: 6 } },
    { title: 'WAVE 2', sub: '暗处的隐形狙击机与干扰机 · 声呐能把它们照出来', spawn: { eel: 3, stalker: 1, sapper: 2, walker: 2, jammer: 1 } },
    { title: 'WAVE 3', sub: '鳗群与敌方机甲小队', spawn: { raider: 2, lancer: 1, eel: 3, mender: 1, drone: 2 } },
    { title: 'FINAL WAVE', sub: '「幻影」在深渊中潜行', spawn: { boss: 'phantom', eel: 2, drone: 2 } },
  ] },
  elevator: { name: '天梯 · 轨道电梯', en: 'SKY ELEVATOR', desc: '在爬升的轨道电梯平台上作战 · 平台外是万丈虚空 · 攻击机俯冲扫射，地面红线就是弹道 · 越往上重力越弱 · 头目「暴君」乘运输机降落', seed: 181, env: 'sky1', platform: 140, reward: 6000,
    ascend: [{ env: 'sky1', y: -140, cA: 0xffffff, cB: 0x9fb4c8, cover: 0.45, puff: 1, v: 18, g: 1 }, { env: 'sky2', y: -420, cA: 0xffd2b0, cB: 0x7a5a78, cover: 0.5, puff: 0.7, v: 24, g: 0.92 },
      { env: 'sky3', y: -1100, cA: 0xdde6ff, cB: 0x2a4680, cover: 0.56, puff: 0.25, v: 30, g: 0.8 }, { env: 'sky4', y: -2600, cA: 0xeef4ff, cB: 0x103470, cover: 0.62, puff: 0, v: 36, g: 0.6 }], waves: [
    { title: 'WAVE 1', sub: '海拔 3 km · 平台开始爬升', spawn: { drone: 4, walker: 3, jet: 2, crawler: 6 } },
    { title: 'WAVE 2', sub: '海拔 12 km · 黄昏云海 · 运输机在平台上卸兵', spawn: { jet: 2, dropship: 2, gunship: 1, walker: 2, drone: 2 } },
    { title: 'WAVE 3', sub: '海拔 40 km · 平流层 · 敌方机甲小队登台', spawn: { jet: 2, raider: 2, lancer: 1, sapper: 1, dropship: 1 } },
    { title: 'FINAL WAVE', sub: '海拔 100 km · 轨道 · 重力减弱 · 「暴君」乘重型运输机降落', spawn: { dropBoss: 'tyrant', bossHp: 1.15, jet: 3, drone: 2 } },
  ] },
  dune: { name: '沙海 · 巨虫', en: 'DUNE LEVIATHAN', desc: '无边沙海 · 沙下有东西在追着震动走 · 红圈是它破土的位置 · 终波头目「沙海巨虫」', seed: 211, env: 'dune', reward: 5800, waves: [
    { title: 'WAVE 1', sub: '沙海 · 地面在动 · 红圈出现立刻离开', spawn: { walker: 3, drone: 3, burrower: 3, crawler: 6, gunship: 1 } },
    { title: 'WAVE 2', sub: '沙暴中的炮火 · 用烟幕或建筑挡住视线', spawn: { walker: 2, burrower: 3, gunship: 1, howitzer: 1, bulwark: 1, drone: 2 } },
    { title: 'WAVE 3', sub: '敌方机甲小队 · 钻地虫掩护', spawn: { raider: 2, lancer: 1, burrower: 2, mender: 1, sapper: 1, drone: 2 } },
    { title: 'FINAL WAVE', sub: '「沙海巨虫」破沙而出 · 它露出身体时才能被击中 · 头部受伤更重', spawn: { leviathan: 1, drone: 3, burrower: 2 } },
  ] },
  toxic: { name: '毒沼 · 化工厂', en: 'TOXIC WORKS', desc: '泄漏的化工厂 · 绿色酸雾随风飘移，雾里持续腐蚀装甲（敌机同样）· 「栅栏机」两两拉起激光栅栏横扫 · 头目「暴君」', seed: 231, env: 'toxic', acid: 5, reward: 6000, waves: [
    { title: 'WAVE 1', sub: '泄漏区 · 红线闪烁就是栅栏要扫过来了 · 起跳越过它，别站在绿雾里', spawn: { fencer: 2, walker: 2, drone: 3, crawler: 6 } },
    { title: 'WAVE 2', sub: '储罐区 · 栅栏与炮火', spawn: { fencer: 2, bulwark: 1, gunship: 1, walker: 1, drone: 2 } },
    { title: 'WAVE 3', sub: '反应釜 · 敌方机甲小队', spawn: { fencer: 2, raider: 1, lancer: 1, mender: 1, drone: 2 } },
    { title: 'FINAL WAVE', sub: '「暴君」与栅栏网 · 把它引进酸雾里', spawn: { boss: 'tyrant', bossHp: 0.9, fencer: 2, drone: 2 } },
  ] },
  lane: { name: '前线 · 兵线推进', en: 'PUSH THE LINE', desc: '黄昏兵线 · 友军坦克每 18 秒从基地出发推进 · 两座防御塔不倒，敌方要塞就有护盾 · 幽影会隐藏身边的敌机（开火时现形）· 守住基地，攻破要塞', seed: 373, env: 'front', reward: 8200, lane: true, coreHp: 4000, bossHp: 1.0, sites: [[125, 0], [-130, 0], [-60, 16], [-60, -16]], waves: [
    { title: 'PUSH THE LINE', sub: '跟随友军坦克推进 · 摧毁两座防御塔，再攻破敌方要塞', spawn: {} },
  ] },
  decap: { name: '斩首 · 指挥官', en: 'DECAPITATION', desc: '琥珀暮色 · 敌方指挥官混在三台全息诱饵里，都罩着干扰力场（只吃 15% 伤害）· 进入 30 m 黄圈扫描 3.5 秒识别真身 · 真身会逃向运输机，登机前击毁它 · 小心眩惑机的强光', seed: 433, env: 'decap', reward: 8400, decap: true, sites: DECAP.sites.concat(DECAP.pads), waves: [
    { title: 'DECAPITATION', sub: '找出真正的指挥官', spawn: {} },
  ] },
  factory: { name: '工厂 · 流水线', en: 'ASSEMBLY LINE', desc: '黄昏的总装车间 · 传送带会把站在上面的一切往前推 · 液压机砸下前地面红色闪烁 · 摧毁 3 座不停造兵的制造厂，再击破「暴君」 · 装卸机举着油桶时一打就炸', seed: 461, env: 'factory', reward: 8800, factory: true, bossHp: 1.0,
    sites: [-60, 0, 60].flatMap((z) => [-140, -115, -90, -65, -40, -15, 10, 35, 60, 85, 110, 135].map((x) => [x, z])), waves: [
    { title: 'ASSEMBLY LINE', sub: '摧毁 3 座制造厂 · 当心液压机', spawn: {} },
  ] },
  hotfuse: { name: '引信 · 定时炸弹', en: 'HOT FUSE', desc: '定时炸弹轮流挂在你和敌机身上 · 在你身上时贴近敌机 7 m 把它传出去，在敌机身上时它会冲过来塞回给你 · 时间到就爆：炸你 110，炸敌机直接炸毁 · 扰频机让你方向反转 · 头目「暴君」', seed: 559, env: 'fuse', reward: 9400, hotfuse: true, waves: [
    { title: 'WAVE 1', sub: '第一枚炸弹 · 扰频机', spawn: { scrambler: 1, walker: 4, crawler: 6, drone: 3 } },
    { title: 'WAVE 2', sub: '护盾坦克 · 双扰频', spawn: { scrambler: 2, walker: 4, bulwark: 1, drone: 3, crawler: 6 } },
    { title: 'WAVE 3', sub: '敌方机甲', spawn: { scrambler: 2, raider: 1, walker: 2, crawler: 6, drone: 2 } },
    { title: 'WAVE 4', sub: '爬虫潮 · 三扰频', spawn: { scrambler: 3, walker: 3, crawler: 10, drone: 2 } },
    { title: 'FINAL WAVE', sub: '「暴君」· 把炸弹塞给它', spawn: { boss: 'tyrant', bossHp: 1.1, scrambler: 1, crawler: 4 } },
  ] },
  polar: { name: '极性 · 双色战场', en: 'POLARITY', desc: '你和每台敌机都带红或蓝极性 · 按 X 切换 · 打异色 ×1.5、打同色 ×0.6 · 同色的子弹被你吸收并充能超载 · 每 25 秒极性波让敌机全部翻转 · 双子机的光索只放同色通过 · 「暴君」每 10 秒换色', seed: 560, env: 'polar', reward: 9600, polar: true, waves: [
    { title: 'WAVE 1', sub: '双色敌军 · 第一对双子机', spawn: { dyad: 1, walker: 5, drone: 4, crawler: 4 } },
    { title: 'WAVE 2', sub: '护盾坦克 · 两对双子机', spawn: { dyad: 2, walker: 4, bulwark: 1, drone: 3, crawler: 6 } },
    { title: 'WAVE 3', sub: '炮艇 · 两对双子机', spawn: { dyad: 2, walker: 4, gunship: 1, crawler: 6 } },
    { title: 'WAVE 4', sub: '敌方机甲 · 两种颜色交替开火', spawn: { dyad: 1, raider: 2, walker: 2, drone: 2, crawler: 6 } },
    { title: 'FINAL WAVE', sub: '「暴君」· 每 10 秒换色 · 双色火力', spawn: { boss: 'tyrant', bossHp: 1.35, dyad: 1, walker: 2, crawler: 4 } },
  ] },
  ctf: { name: '夺旗 · 双基地', en: 'CAPTURE THE FLAG', desc: '两端各一座基地 · 在红旗旁站 1.5 秒拔旗、扛着它变慢，趁你的旗在家时带回得分 · 夺 3 次获胜 · 迅猛机会偷你的旗，被带回 3 次就输 · 击毁携旗者、碰一下落地的旗就能送回 · 夺 2 次后「暴君」守旗', seed: 561, env: 'ctf', reward: 9800, ctf: true, bossHp: 0.9, path: CTF_LANES, sites: [[0, 140], [0, -140]], waves: [
    { title: 'CAPTURE THE FLAG', sub: '夺取敌旗 3 次 · 别让迅猛机把你的旗带走', spawn: {} },
  ] },
  turf: { name: '涂装 · 领地争夺', en: 'TURF WAR', desc: '你走过、打中地面、击毁敌机的地方涂成青色，敌人走过和打中的地方涂成洋红 · 站在青色上移速 ×1.2、能量回复 ×1.6，站在洋红上减速并掉装甲 · 喷涂车专涂你的地盘，背后的油漆罐是弱点 · 4 分钟后覆盖多的一方获胜', seed: 558, env: 'paint', reward: 9800, turf: true, bossHp: 0.8, waves: [
    { title: 'TURF WAR', sub: '4 分钟内涂得比敌人多', spawn: {} },
  ] },
  coliseum: { name: '角斗场 · 人气', en: 'COLISEUM', desc: '五轮角斗 · 观众的人气随击杀上涨、随时间回落：换着武器杀、空中杀、连杀、把敌人引进火焰喷口都更加分 · 人气 80% 以上全场沸腾（伤害 ×1.25、扔修理包），25% 以下喝倒彩往场里扔东西，冷场 7 秒就被轰下台 · 适应者的装甲会适应你最常用的伤害类型', seed: 557, env: 'glad', platform: 116, reward: 9600, glad: true, bossHp: 1.15,
    waves: [
    { title: 'COLISEUM', sub: '五轮角斗 · 让观众保持兴奋', spawn: {} },
  ] },
  meltdown: { name: '核电站 · 熔毁', en: 'MELTDOWN', desc: '核电站堆芯过热 · 四台冷却泵泡在辐射区里，落地站在泵旁 4 秒重启它 · 待在辐射里会积累剂量：受伤加重，过 100 rad 还会掉装甲，去洗消台洗掉 · 胀辐球吸饱辐射后会冲过来炸你 · 堆芯到 100% 就熔毁', seed: 503, env: 'atom', reward: 9400, meltdown: true, bossHp: 1.1,
    sites: ATOM.pumps.concat(ATOM.decon, ATOM.towers, [[0, 0], [14, -8]]), waves: [
    { title: 'MELTDOWN', sub: '重启 4 台冷却泵 · 别让堆芯过热', spawn: {} },
  ] },
  creep: { name: '虫巢 · 菌毯', en: 'HIVE CREEP', desc: '外星虫巢落在城郊 · 三座菌巢不断向外蔓延菌毯，站在上面减速并掉装甲，敌机在上面会回血 · 播种者把菌瘤种到菌毯前沿，一路种向中央净化塔，菌毯碰到净化塔就会侵蚀它 · 摧毁菌巢让菌毯退去', seed: 491, env: 'creep', reward: 9200, creep: true, coreHp: 4000, bossHp: 0.9,
    sites: BIO.nodes.concat([[0, 0]]), waves: [
    { title: 'HIVE CREEP', sub: '摧毁 3 座菌巢 · 打断播种者，别让菌毯碰到净化塔', spawn: {} },
  ] },
  tsunami: { name: '海啸 · 巨浪', en: 'TSUNAMI', desc: '风暴将至的港口城 · 西侧海边三台潮汐泵每 26 秒掀起一道 15 m 巨浪，自西向东横扫全图，浪里的一切都被卷走并受伤 · 飞到浪头之上或躲上屋顶 · 每摧毁一台泵浪就矮 3 m · 交换机锁定后会和你互换位置', seed: 477, env: 'tsunami', reward: 9000, tsunami: true, bossHp: 1.0,
    sites: TSU.pumps.concat([[-150, -45], [-150, 45]]), waves: [
    { title: 'TSUNAMI', sub: '摧毁 3 台潮汐泵 · 巨浪来时升到浪头之上', spawn: {} },
  ] },
  maze: { name: '迷城 · 升降壁垒', en: 'SHIFTING WALLS', desc: '钢灰午后的迷城 · 两组墙体每 20 秒升降换位，黄色条纹处的墙将升起，站在上面会被掀飞 · 11 m 以上会被激光天幕灼烧 · 「脉冲塔」放出低环（跳过去）与高环（落地躲）', seed: 457, env: 'maze', reward: 8600, maze: true,
    sites: [[-66, -66], [-22, -66], [22, -66], [66, -66], [-66, -22], [-22, -22], [22, -22], [66, -22], [-66, 22], [-22, 22], [22, 22], [66, 22], [-66, 66], [-22, 66], [22, 66], [66, 66]], waves: [
    { title: 'WAVE 1', sub: '外环 · 橙色低环跳过去，青色高环落地躲 · 墙壁挡得住脉冲环', spawn: { pulsar: 1, walker: 2, drone: 2, crawler: 4 } },
    { title: 'WAVE 2', sub: '中庭 · 把敌人引到黄色条纹上，让升起的墙掀飞它们', spawn: { pulsar: 2, bulwark: 1, walker: 3, gunship: 1, drone: 2 } },
    { title: 'WAVE 3', sub: '内城 · 敌方机甲小队', spawn: { pulsar: 2, raider: 1, lancer: 1, mender: 1, walker: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」入场 · 墙会掀飞它，也挡得住它的子弹', spawn: { boss: 'tyrant', bossHp: 1.2, pulsar: 2, walker: 1, drone: 2 } },
  ] },
  sabot: { name: '破袭 · 敌后爆破', en: 'SABOTAGE', desc: '黎明前的敌后基地 · 四座能源塔为敌军轨道炮供能，武器打不动它们：落地站在塔下 2.5 秒安放炸药，22 秒后引爆 · 敌方步行机会冲过去拆弹 · 复苏者能把残骸重建成敌机 · 轨道炮充能完毕前炸掉全部能源塔，再击破「幻影」', seed: 427, env: 'sabot', reward: 8300, sabot: true, sites: SABOT.sites, bossHp: 0.75, waves: [
    { title: 'SABOTAGE', sub: '炸掉四座能源塔', spawn: {} },
  ] },
  rescue: { name: '撤离 · 平民疏散', en: 'EVACUATION', desc: '黄昏战火 · 三座避难所里的平民沿道路走向中央撤离点，救援穿梭机每隔一阵降落接走一批 · 敌军优先攻击平民，织网者的蛛网会把平民和你粘住 · 撤离 40 人即胜利（「暴君」出现后须先击破），平民伤亡 15 人即失败', seed: 417, env: 'evac', reward: 8200, rescue: true, path: EVAC_ROAD, sites: [...EVAC.routes.map((r) => r[0]), EVAC.pad], bossHp: 1.0, waves: [
    { title: 'EVACUATION', sub: '掩护平民前往撤离点', spawn: {} },
  ] },
  sky: { name: '防空 · 导弹拦截', en: 'SKYSHIELD', desc: '暮色 · 敌方导弹车在城郊的隐蔽点之间转移，停车架起发射架后向三座避难所发射巡航导弹 · 导弹飞得慢、可以击落 · 在发射前摧毁导弹车 · 三座避难所全毁即失败 · 三波，最后一波「暴君」压阵', seed: 409, env: 'shield', reward: 8000, sky: true, sites: [...SKY.shelters, ...SKY.sites], bossHp: 1.0, waves: [
    { title: 'SKYSHIELD', sub: '击落巡航导弹 · 摧毁导弹车', spawn: {} },
  ] },
  pursuit: { name: '追击 · 数据信使', en: 'PURSUIT', desc: '暮色城区 · 一辆装甲信使车载着情报沿环城路狂奔，每到一座上传站就停车上传 · 传满 100% 任务失败 · 上传时贴近它 24 m 内能干扰 · 车头装甲厚、车尾是弱点 · 它会沿路撒地雷，残血时放烟幕加速 · 喷火坦克会来拦你', seed: 401, env: 'chase', reward: 7800, pursuit: true, path: COURIER_PATH, sites: COURIER.stations.map((i) => { const [x, z] = COURIER.path[i], l = Math.hypot(x, z) || 1; return [x + x / l * 11, z + z / l * 11]; }), bossHp: 0.8, waves: [
    { title: 'PURSUIT', sub: '追上数据信使 · 在它上传完之前击毁它', spawn: {} },
  ] },
  lance: { name: '轨道炮 · 灼光', en: 'SUNLANCE', desc: '正午 · 敌方的轨道激光炮从天而降、一路追着你烧（飞得再高也躲不开光柱）· 摧毁 3 座卫星天线，每座让光柱变慢变细 · 三座全毁就能夺取光柱，它会转去追烧敌机 · 重力锁会把你按在地上', seed: 397, env: 'noon', reward: 7800, lance: true, sites: LANCE.sites, bossHp: 1.1, waves: [
    { title: 'SUNLANCE', sub: '摧毁 3 座卫星天线 · 别让光柱追上你', spawn: {} },
  ] },
  beacon: { name: '赛道 · 信标冲刺', en: 'BEACON RUN', desc: '两圈飞过 14 道信标门（青色光柱指向下一道）· 过门 +2.5 秒，击毁敌机 +1.5 秒 · 工程车会在前方门边焊出炮台 · 时间耗尽即失败，最后击破「幻影」', seed: 383, env: 'sprint', reward: 7600, beacon: true, path: BEACON_PATH, bossHp: 0.75, waves: [
    { title: 'BEACON RUN', sub: '飞过第一道信标门 · 计时开始', spawn: {} },
  ] },
  fortify: { name: '防线 · 炮台工事', en: 'FORTIFY', desc: '晨雾前线 · 守住中央反应堆 · 击毁敌机赚工事点，站上周围 6 个基座建造永久炮台（再站一次升级，受损可维修）· 劫控机炮台看不见，会入侵炮台让它掉转枪口：击落它或打断入侵', seed: 363, env: 'fort', reward: 7800, defense: true, fortify: true, coreHp: 5000, sites: [[0, 0], ...FORT_PADS], waves: [
    { title: 'WAVE 1', sub: '击毁敌机赚取工事点 · 站上基座建造炮台', spawn: { walker: 4, drone: 6 }, late: { walker: 2, drone: 4 } },
    { title: 'HIJACKERS', sub: '劫控机会入侵炮台 · 炮台看不见它，只能靠你', spawn: { walker: 4, bulwark: 1, gunship: 1, drone: 5, hijack: 2 }, late: { walker: 2, drone: 4, hijack: 1 } },
    { title: 'WAVE 3', sub: '空中突击 · 两架劫控机', spawn: { gunship: 1, walker: 4, drone: 5, hijack: 2, raider: 1 }, late: { gunship: 1, walker: 2, drone: 3, hijack: 1 } },
    { title: 'WAVE 4', sub: '全面合围 · 维修无人机随行', spawn: { bulwark: 2, walker: 4, drone: 5, hijack: 3, mender: 1, raider: 1 }, late: { gunship: 1, walker: 2, drone: 4, hijack: 1 } },
    { title: 'FINAL WAVE', sub: '击破「暴君」 · 劫控机随行', spawn: { boss: 'tyrant', walker: 3, raider: 1, drone: 4, hijack: 2, bossHp: 1.6 }, late: { bulwark: 1, walker: 2, drone: 3, hijack: 1 } },
  ] },
  salvage: { name: '残骸场 · 回收', en: 'SALVAGE RUN', desc: '阴天的机甲残骸场 · 击毁敌机会掉出发光的回收核心，飞过去就能拾取（最多带 4 个，每个减速 5%）· 送回中央回收台交付 · 受到 30 以上的重击会掉一个 · 拾荒者会把地上的核心抢走飞出地图，还会扑过来偷你身上的 · 交满 24 个后头目「暴君」来袭', seed: 353, env: 'wreck', reward: 7600, salvage: true, quota: 24, waves: [
    { title: 'SALVAGE', sub: '击毁敌机 · 把掉出的核心送回回收台', spawn: { walker: 2, drone: 3, scav: 1 } },
    { title: 'SCAVENGERS', sub: '拾荒者成群而来 · 别让它们把核心带走', spawn: { walker: 1, bulwark: 1, drone: 2, scav: 2 }, at: 0.3 },
    { title: 'RAID', sub: '掠夺者护送拾荒者', spawn: { raider: 1, walker: 1, drone: 2, scav: 2, mender: 1 }, at: 0.65 },
    { title: 'FINAL WAVE', sub: '回收完成 · 击破「暴君」', spawn: { boss: 'tyrant', bossHp: 1.4, drone: 2 } },
  ] },
  refinery: { name: '炼油厂 · 拆弹', en: 'REFINERY DEFUSE', desc: '黄昏的炼油厂 · 守住三座油罐 · 爆破机会开到油罐边装炸药，16 秒后爆炸（同时最多三枚），炸掉油罐一半耐久 · 站到炸药旁 5 m 内 2 秒就能拆除 · 爆破机装炸药要 2.2 秒，这时击毁它炸药就装不上 · 三座油罐全被炸毁则任务失败 · 头目「暴君」', seed: 347, env: 'refinery', reward: 7500, depot: true, waves: [
    { title: 'WAVE 1', sub: '爆破机', spawn: { planter: 2, walker: 3, drone: 3, crawler: 4 } },
    { title: 'WAVE 2', sub: '掩护爆破', spawn: { planter: 2, bulwark: 1, walker: 3, gunship: 1 } },
    { title: 'WAVE 3', sub: '多点爆破', spawn: { planter: 3, raider: 1, walker: 3, mender: 1, drone: 2 } },
    { title: 'FINAL WAVE', sub: '「暴君」与爆破机', spawn: { boss: 'tyrant', bossHp: 1.3, planter: 2 } },
  ] },
  fog: { name: '雾港 · 伏击', en: 'FOG HARBOR', desc: '浓雾笼罩的港口 · 雷达只显示 40 m 内、刚开过火、或靠近已点亮雾灯的敌机 · 在四盏雾灯旁站 3 秒点亮它，每点亮一盏雾气退后 30 m · 伏击者伪装成货箱，靠近 20 m 才会醒来——眼睛偶尔会闪红光，趁它沉睡开火伤害 ×1.5 · 头目「暴君」', seed: 341, env: 'fog', reward: 7400, fog: true, waves: [
    { title: 'WAVE 1', sub: '雾中的货箱', spawn: { lurker: 3, walker: 3, drone: 3, crawler: 4 } },
    { title: 'WAVE 2', sub: '看不见的狙击手', spawn: { lurker: 3, stalker: 1, walker: 2, gunship: 1, bulwark: 1 } },
    { title: 'WAVE 3', sub: '伏击圈', spawn: { lurker: 4, raider: 1, walker: 3, mender: 1, drone: 2 } },
    { title: 'FINAL WAVE', sub: '「暴君」与伏击者', spawn: { boss: 'tyrant', bossHp: 1.3, lurker: 2 } },
  ] },
  supply: { name: '空投 · 补给争夺', en: 'SUPPLY RACE', desc: '晴空下的城区 · 每 16–20 秒有一个补给箱伞降到你附近（地面金圈标出落点）· 抢到能修理、充超载或 15 秒伤害强化 · 让敌人先碰到，它就被强化：血量 ×1.5、伤害 ×1.4 · 抢夺机会把箱子抢走送给同伴，打爆它箱子就掉下来 · 头目「暴君」', seed: 337, env: 'supply', reward: 7300, supply: true, waves: [
    { title: 'WAVE 1', sub: '第一批空投 · 抢夺机', spawn: { snatcher: 2, walker: 3, drone: 2, crawler: 4 } },
    { title: 'WAVE 2', sub: '争夺补给线', spawn: { snatcher: 2, bulwark: 1, walker: 3, gunship: 1 } },
    { title: 'WAVE 3', sub: '抢夺机群', spawn: { snatcher: 3, raider: 1, bulwark: 1, walker: 3, mender: 1, drone: 2 } },
    { title: 'FINAL WAVE', sub: '「暴君」与抢夺机', spawn: { boss: 'tyrant', bossHp: 1.4, snatcher: 2 } },
  ] },
  rift: { name: '裂隙 · 传送门', en: 'RIFT GATES', desc: '紫夜废城里开着三对相连的传送门（同色一对）· 机甲和子弹飞进一扇门就从另一扇出来 · 隔着门开枪能打到远处的敌人 · 每 32 秒门会闪烁后换位置，每 20 秒有一扇门吐出增援 · 缴械机的紫色光球会锁死你一个武器槽 4 秒 · 头目「暴君」', seed: 331, env: 'rift', reward: 7200, rift: true, waves: [
    { title: 'WAVE 1', sub: '裂隙初开 · 缴械机', spawn: { disarmer: 1, walker: 3, drone: 3, crawler: 4 } },
    { title: 'WAVE 2', sub: '门后来客', spawn: { disarmer: 1, gunship: 1, bulwark: 1, walker: 3, leech: 3 } },
    { title: 'WAVE 3', sub: '双缴械机 · 闪影', spawn: { disarmer: 2, raider: 1, walker: 2, drone: 3, blinker: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」穿门而来', spawn: { boss: 'tyrant', bossHp: 1.35, disarmer: 1 } },
  ] },
  highway: { name: '高速 · 车流', en: 'HIGHWAY RUSH', desc: '黄昏的四车道高速穿城而过 · 装甲卡车不停地呼啸而过，挡子弹也挡视线，路面上的机甲（敌我都算）会被撞飞 · 跳起或悬空就能让它从脚下开过 · 寄生体会扑到你背上吸能量，急闪（Shift）甩掉 · 头目「暴君」', seed: 317, env: 'highway', reward: 7100, highway: true, waves: [
    { title: 'WAVE 1', sub: '匝道口 · 寄生体', spawn: { leech: 4, walker: 3, drone: 2 } },
    { title: 'WAVE 2', sub: '高架下 · 寄生体群', spawn: { leech: 5, bulwark: 1, gunship: 1, walker: 2, crawler: 4 } },
    { title: 'WAVE 3', sub: '收费站 · 敌方机甲', spawn: { leech: 4, raider: 1, lancer: 1, mender: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」与车流', spawn: { boss: 'tyrant', bossHp: 1.3, leech: 4 } },
  ] },
  thunder: { name: '雷暴 · 避雷塔', en: 'THUNDERHEAD', desc: '雷暴压城 · 每 5–7 秒一道闪电锁定离地最高、又不在避雷塔保护圈里的机甲（敌我都算），1.4 秒后劈下 · 落地或躲进蓝色圈里就能躲开 · 号令机让红圈里的敌机更快更狠，战号响起时还会减伤 · 头目「暴君」', seed: 313, env: 'thunder', reward: 7000, thunder: true, waves: [
    { title: 'WAVE 1', sub: '雷云压境 · 号令机', spawn: { herald: 1, walker: 3, drone: 3, crawler: 4 } },
    { title: 'WAVE 2', sub: '避雷塔之间 · 空中部队', spawn: { herald: 1, gunship: 1, bulwark: 1, walker: 3, leaper: 1, drone: 2 } },
    { title: 'WAVE 3', sub: '双号令 · 敌方机甲', spawn: { herald: 2, raider: 1, walker: 3, drone: 2, crawler: 4 } },
    { title: 'FINAL WAVE', sub: '「暴君」与雷暴', spawn: { boss: 'tyrant', bossHp: 1.45, herald: 2 } },
  ] },
  flare: { name: '日冕 · 太阳风暴', en: 'SOLAR FLARE', desc: '低悬的烈日 · 每二十多秒一次耀斑：警报 3 秒后持续 5.5 秒，站在建筑阴影外的机甲（敌我都算）都会被灼烧 · 看地上的影子躲进阴影里 · 跃击者会跳到你身上，空中打掉它四分之一血就会摔下来 · 头目「暴君」', seed: 311, env: 'flare', reward: 6900, flare: true, waves: [
    { title: 'WAVE 1', sub: '烈日街区 · 跃击者', spawn: { leaper: 3, walker: 3, drone: 2 } },
    { title: 'WAVE 2', sub: '长影广场 · 跃击小队', spawn: { leaper: 3, bulwark: 1, gunship: 1, walker: 1, crawler: 4 } },
    { title: 'WAVE 3', sub: '日冕之下 · 敌方机甲', spawn: { leaper: 2, raider: 1, lancer: 1, mender: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」与耀斑', spawn: { boss: 'tyrant', bossHp: 1.4, leaper: 2 } },
  ] },
  quake: { name: '断层城 · 地震', en: 'FAULT LINE', desc: '断层带上的废城 · 每二十秒一次地震：先闷响预警，随后三条地裂依次喷发（橙色线预警，站在地面上会被灼烧，悬空可以躲开），碎石落在你周围（红圈）· 破城锤会瞄准冲锋，正面装甲很厚，撞墙后瘫痪 · 头目「暴君」', seed: 307, env: 'quake', reward: 6800, quake: true, waves: [
    { title: 'WAVE 1', sub: '断层带 · 破城锤', spawn: { rammer: 1, walker: 3, drone: 2, crawler: 4 } },
    { title: 'WAVE 2', sub: '塌陷街区 · 双破城锤', spawn: { rammer: 2, bulwark: 1, walker: 2, gunship: 1 } },
    { title: 'WAVE 3', sub: '震中 · 敌方机甲', spawn: { rammer: 1, raider: 1, lancer: 1, mender: 1, crawler: 4 } },
    { title: 'FINAL WAVE', sub: '「暴君」在震中等你', spawn: { boss: 'tyrant', bossHp: 1.2, rammer: 1 } },
  ] },
  scrap: { name: '废料场 · 电磁吊', en: 'SCRAPYARD', desc: '生锈的废料场 · 三台电磁起重机轮流通电，把四周的机甲（敌我都算）吸到磁盘下面，断电时整堆废铁砸下来 · 偏导机的磁场会把你的实弹推偏，导弹、光束、近战不受影响 · 头目「暴君」', seed: 301, env: 'scrap', cranes: [[-58, -36, 0.4], [62, -18, -0.9], [4, 62, 1.6]], reward: 6700, waves: [
    { title: 'WAVE 1', sub: '废料场 · 偏导机护着谁', spawn: { deflector: 1, walker: 4, drone: 2, crawler: 5 } },
    { title: 'WAVE 2', sub: '吊臂下 · 双偏导机', spawn: { deflector: 2, bulwark: 1, walker: 3, gunship: 1, drone: 2 } },
    { title: 'WAVE 3', sub: '熔炉区 · 敌方机甲', spawn: { deflector: 1, raider: 1, lancer: 1, mender: 1, crawler: 4 } },
    { title: 'FINAL WAVE', sub: '「暴君」在磁盘下等你', spawn: { boss: 'tyrant', bossHp: 1.35, deflector: 1 } },
  ] },
  salt: { name: '盐湖 · 海市蜃楼', en: 'MIRAGE FLATS', desc: '刺眼的盐壳平原 · 低悬的太阳晃眼 · 幻象机躲在太阳方向，带着两个镜像分身和一群全息无人机（打一下就碎、子弹无害）· 声呐能照出真身 · 头目「幻影」', seed: 297, env: 'salt', glare: true, reward: 6600, waves: [
    { title: 'WAVE 1', sub: '盐壳平原 · 哪个才是真的', spawn: { mirage: 1, walker: 3, drone: 2 } },
    { title: 'WAVE 2', sub: '烈日 · 背着太阳的敌人', spawn: { mirage: 1, gunship: 1, bulwark: 1, walker: 2, crawler: 4 } },
    { title: 'WAVE 3', sub: '镜面 · 双幻象机与隐形狙击', spawn: { mirage: 2, raider: 1, stalker: 1, mender: 1 } },
    { title: 'FINAL WAVE', sub: '「幻影」从光里走出来', spawn: { boss: 'phantom', bossHp: 0.65, mirage: 1 } },
  ] },
  gale: { name: '狂风 · 高原', en: 'GALE RIDGE', desc: '风电高原 · 狂风每十几秒转向，把机甲（尤其空中）和弹道都吹偏 · 飞艇顺风飘到头顶投弹 · 头目「暴君」', seed: 293, env: 'gale', wind: true, reward: 6500, waves: [
    { title: 'WAVE 1', sub: '山脊 · 迎风悬停会被吹走，贴地更稳', spawn: { blimp: 1, walker: 3, drone: 3, crawler: 4 } },
    { title: 'WAVE 2', sub: '风电场 · 飞艇与炮火', spawn: { blimp: 1, bulwark: 1, gunship: 1, walker: 3, drone: 2 } },
    { title: 'WAVE 3', sub: '垭口 · 双飞艇与敌方机甲', spawn: { blimp: 2, raider: 1, lancer: 1, mender: 1, crawler: 5 } },
    { title: 'FINAL WAVE', sub: '「暴君」顶风而来', spawn: { boss: 'tyrant', bossHp: 1, blimp: 1, drone: 2 } },
  ] },
  icelake: { name: '冰湖 · 薄冰', en: 'FROZEN LAKE', desc: '结冰的湖港 · 冰面打滑，脚下冰层会裂开成冰窟 · 寒霜炮的冰弹叠满就把你冻住 · 头目「暴君」', seed: 289, env: 'icelake', ice: true, grip: 0.3, reward: 6400, waves: [
    { title: 'WAVE 1', sub: '冰面 · 刹车要提前 · 冰层裂纹处马上会塌', spawn: { frost: 2, walker: 3, drone: 3, crawler: 4 } },
    { title: 'WAVE 2', sub: '码头 · 寒霜炮编队', spawn: { frost: 3, bulwark: 1, gunship: 1, walker: 2 } },
    { title: 'WAVE 3', sub: '湖心 · 敌方机甲小队', spawn: { frost: 3, raider: 1, lancer: 1, mender: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」踏冰而来', spawn: { boss: 'tyrant', bossHp: 1, frost: 2, drone: 2 } },
  ] },
  lockdown: { name: '封锁线 · 探照灯', en: 'LOCKDOWN', desc: '宵禁中的封锁区 · 瞭望塔探照灯来回扫，被照到就招来炮击 · 打掉灯塔或躲进阴影 · 头目「暴君」', seed: 277, env: 'lockdown', reward: 6300, waves: [
    { title: 'WAVE 1', sub: '检查站 · 别站进探照灯的光圈 · 被照到后用掩体挡住视线', spawn: { watch: 2, walker: 2, drone: 3, crawler: 4 } },
    { title: 'WAVE 2', sub: '仓储区 · 灯塔与炮火', spawn: { watch: 2, bulwark: 1, gunship: 1, walker: 2 } },
    { title: 'WAVE 3', sub: '指挥所 · 敌方机甲小队', spawn: { watch: 3, raider: 1, lancer: 1, mender: 1, walker: 2 } },
    { title: 'FINAL WAVE', sub: '「暴君」入场 · 先熄灯', spawn: { boss: 'tyrant', bossHp: 1, watch: 3, drone: 2, gunship: 1 } },
  ] },
  twister: { name: '龙卷 · 荒原', en: 'TWISTER PLAINS', desc: '雷暴下的荒原 · 四股龙卷游走，卷住就被抛起甩出（敌机同样）· 「闪影」瞬移到侧后开火 · 头目「暴君」', seed: 263, env: 'twister', twisters: 4, reward: 6200, waves: [
    { title: 'WAVE 1', sub: '麦田 · 侧后方地上的红圈是「闪影」要瞬移过去的地方 · 转身对准它', spawn: { blinker: 2, walker: 2, drone: 3, crawler: 4 } },
    { title: 'WAVE 2', sub: '风场 · 把敌人引进龙卷里', spawn: { blinker: 3, bulwark: 1, gunship: 1, walker: 2 } },
    { title: 'WAVE 3', sub: '农庄 · 敌方机甲小队', spawn: { blinker: 3, raider: 1, lancer: 1, mender: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」入场 · 它不怕龙卷', spawn: { boss: 'tyrant', bossHp: 0.9, blinker: 2, drone: 2 } },
  ] },
  grid: { name: '电网 · 发电站', en: 'POWER GRID', desc: '夜间发电站 · 地块轮流通电，黄框预警后放电 · 「蜂巢」放出成群自爆无人机 · 头目「暴君」', seed: 247, env: 'grid', reward: 6100, waves: [
    { title: 'WAVE 1', sub: '变电区 · 黄框闪烁的地块马上通电 · 离开那一格，或起跳悬停躲过去', spawn: { hive: 1, walker: 2, drone: 2, crawler: 6 } },
    { title: 'WAVE 2', sub: '冷却塔 · 蜂巢与护盾坦克', spawn: { hive: 1, bulwark: 1, gunship: 1, walker: 2 } },
    { title: 'WAVE 3', sub: '主控室 · 敌方机甲小队', spawn: { hive: 2, raider: 1, lancer: 1, mender: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」入场 · 把它引到通电的地块上', spawn: { boss: 'tyrant', bossHp: 0.9, hive: 2, drone: 2 } },
  ] },
  jungle: { name: '丛林 · 雨林遗迹', en: 'JUNGLE RUINS', desc: '雨林吞没的旧城 · 「棱镜」的镜面会把子弹和导弹原路弹回 · 绕到侧后、从高处打，或用光束 / 爆炸 / 近战 / 音波 · 头目「暴君」', seed: 221, env: 'jungle', reward: 5900, waves: [
    { title: 'WAVE 1', sub: '遗迹外围 · 青色镜面朝着你时别开枪 · 绕到侧面，或等它开火后镜面放下散热', spawn: { prism: 2, walker: 2, drone: 3, crawler: 6 } },
    { title: 'WAVE 2', sub: '密林伏击 · 棱镜掩护炮击', spawn: { prism: 3, walker: 1, howitzer: 1, gunship: 1, drone: 2 } },
    { title: 'WAVE 3', sub: '镜阵 · 敌方机甲小队', spawn: { prism: 3, raider: 1, lancer: 1, mender: 1, drone: 2 } },
    { title: 'FINAL WAVE', sub: '「暴君」与镜阵 · 先拆镜子', spawn: { boss: 'tyrant', bossHp: 0.9, prism: 2, drone: 2 } },
  ] },
  surge: { name: '港湾 · 风暴潮', en: 'STORM SURGE', desc: '暴风雨中的港区 · 每波潮水上涨，水里走得慢 · 气垫炮艇绕圈扫射、放鱼雷 · 爬上屋顶占高处 · 头目「幻影」', seed: 201, env: 'surge', tide: [0.5, 1.5, 2.5, 3.3], reward: 5600, waves: [
    { title: 'WAVE 1', sub: '潮位 0.5 m · 气垫炮艇贴着水面绕圈扫射', spawn: { skimmer: 3, walker: 3, drone: 3 } },
    { title: 'WAVE 2', sub: '潮位 1.5 m · 水里移动变慢 · 用推进或爬上屋顶', spawn: { skimmer: 4, gunship: 1, bulwark: 1, drone: 2 } },
    { title: 'WAVE 3', sub: '潮位 2.5 m · 敌方机甲小队', spawn: { skimmer: 4, raider: 1, lancer: 1, mender: 1, jammer: 1 } },
    { title: 'FINAL WAVE', sub: '潮位 3.3 m · 「幻影」踏浪而来', spawn: { boss: 'phantom', bossHp: 0.9, skimmer: 2, drone: 2 } },
  ] },
  meteor: { name: '陨坑 · 流星雨', en: 'METEOR FALL', desc: '紫夜流星雨 · 陨石砸向红圈，敌我都会被砸中 · 有的陨石里滚出分裂球，打碎会一分为二、二分为四 · 头目「暴君」', seed: 191, env: 'meteor', meteors: true, reward: 5400, waves: [
    { title: 'WAVE 1', sub: '分裂球 · 大球远处放散射，打碎后分成两个中球、再分成小球', spawn: { splitter: 3, walker: 3, drone: 4, crawler: 6 } },
    { title: 'WAVE 2', sub: '中球蓄力后直线冲撞 · 横向闪开', spawn: { splitter: 4, gunship: 1, bulwark: 1, mender: 1, drone: 3 } },
    { title: 'WAVE 3', sub: '流星雨加密 · 敌方机甲小队', spawn: { splitter: 4, raider: 2, lancer: 1, sapper: 1, howitzer: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」在陨石雨中出击', spawn: { boss: 'tyrant', bossHp: 1.1, splitter: 3, drone: 2 } },
  ] },
  mirror: { name: '数据空间 · 镜像试炼', en: 'MIRROR TRIAL', desc: '赛博空间 · 霓虹网格 · 隐形狙击机与干扰机 · 头目「镜像」复制你当前的全部武装，变身后分裂出镜像碎片', seed: 151, env: 'cyber', reward: 5400, waves: [
    { title: 'WAVE 1', sub: '数据空间 · 当心隐形狙击机', spawn: { turret: 2, drone: 4, walker: 4, stalker: 1 } },
    { title: 'WAVE 2', sub: '防火墙 · 敌方机甲小队与干扰机', spawn: { raider: 1, lancer: 1, jammer: 1, walker: 3, mender: 1, drone: 2 } },
    { title: 'FINAL WAVE', sub: '「镜像」读取了你的机体数据 · 它用的就是你的武器', spawn: { boss: 'echo', drone: 2, walker: 2 } },
  ] },
  rail: { name: '铁道 · 装甲列车拦截', en: 'RAIL INTERCEPT', desc: '秋日午后 · 装甲列车沿环形铁轨巡行 · 先毁三节武装车厢，再打车头反应堆 · 三圈内不击毁就让它逃了', seed: 141, env: 'autumn', reward: 5200, track: TRACK, waves: [
    { title: 'WAVE 1', sub: '铁道沿线的守备部队 · 别在铁轨上停留', spawn: { turret: 2, walker: 3, drone: 4, crawler: 4 } },
    { title: 'WAVE 2', sub: '护卫部队 · 列车即将进站', spawn: { walker: 3, bulwark: 1, gunship: 2, raider: 2 } },
    { title: 'FINAL WAVE', sub: '装甲列车 IRONCLAD · 三圈内击毁它 · 先打武装车厢', spawn: { train: 1, drone: 3, walker: 2, raider: 1 } },
  ] },
  lunar: { name: '月面 · 静海基地', en: 'LUNAR BASE', desc: '低重力 · 跳得更高、滞空更久 · 穹盾发生器护住敌群，从外面打不进去 · 冲进护罩内作战 · 头目「幻影」', seed: 121, env: 'lunar', grav: 0.4, reward: 4800, waves: [
    { title: 'WAVE 1', sub: '低重力 · 跳得更高、落得更慢 · 琥珀色穹盾从外面打不进去', spawn: { turret: 2, walker: 3, drone: 3, warden: 1 } },
    { title: 'WAVE 2', sub: '两座穹盾 · 冲进护罩，或用电磁脉冲 / 重力井破局', spawn: { walker: 3, bulwark: 1, warden: 2, drone: 3, crawler: 5 } },
    { title: 'WAVE 3', sub: '掠夺者小队在穹盾下推进', spawn: { raider: 2, warden: 1, mender: 1, drone: 3 } },
    { title: 'FINAL WAVE', sub: '「幻影」在穹盾掩护下现身', spawn: { boss: 'phantom', warden: 1, drone: 2 } },
  ] },
  canyon: { name: '峡谷 · 炮火压制', en: 'BOMBARDMENT', desc: '沙尘 · 自走炮在远处隔山轰击 · 红圈是落点 · 找到并摧毁炮兵 · 头目「暴君」', seed: 111, env: 'haze', reward: 4600, waves: [
    { title: 'WAVE 1', sub: '炮击来袭 · 地面红圈是落点 · 自走炮躲在远处，不需要视线', spawn: { turret: 3, drone: 3, walker: 1, howitzer: 2 } },
    { title: 'WAVE 2', sub: '炮兵阵地推进 · 无人机在为炮兵校射', spawn: { walker: 2, bulwark: 1, drone: 4, turret: 2, howitzer: 2, sapper: 1 } },
    { title: 'WAVE 3', sub: '三门自走炮 · 掠夺者与维修无人机护卫', spawn: { howitzer: 3, raider: 1, gunship: 1, drone: 3, mender: 1 } },
    { title: 'FINAL WAVE', sub: '「暴君」在炮火掩护下推进', spawn: { boss: 'tyrant', howitzer: 3, drone: 3, walker: 1 } },
  ] },
  airborne: { name: '高原 · 空降拦截', en: 'AIRBORNE', desc: '阴天 · 敌军用运输机空投部队 · 在舱门打开前击落运输机，连货一起消灭 · 头目「暴君」乘重型运输机降落', seed: 101, env: 'overcast', reward: 4800, waves: [
    { title: 'WAVE 1', sub: '敌方运输机接近 · 地面红圈是投放点 · 在舱门打开前击落它，连货一起消灭', spawn: { turret: 3, drone: 3, drops: [{ walker: 2 }, { walker: 2 }] } },
    { title: 'WAVE 2', sub: '第二批空降 · 武装直升机掩护', spawn: { drone: 3, gunship: 1, drops: [{ bulwark: 1, drone: 2 }, { walker: 2 }, { walker: 1, sapper: 1 }] } },
    { title: 'WAVE 3', sub: '精锐空降 · 掠夺者小队 · 干扰机随行', spawn: { drone: 3, jammer: 1, drops: [{ raider: 1 }, { lancer: 1 }, { walker: 2 }] } },
    { title: 'FINAL WAVE', sub: '重型运输机载着「暴君」降落 · 击落它挡不住暴君，但能让它带伤出场', spawn: { drone: 2, drops: [{ walker: 2 }], dropBoss: 'tyrant', bossHp: 1 } },
  ] },
  gauntlet: { name: '头目连战', en: 'GAUNTLET', desc: '日蚀 · 连续四场头目战，最后「暴君」与「幻影」同时出击 · 每场之间修复 50% 装甲 · 当心干扰机', seed: 91, env: 'eclipse', reward: 6000, gauntlet: true, waves: [
    { title: 'ROUND 1', sub: '击破「暴君」', spawn: { boss: 'tyrant', drone: 2 } },
    { title: 'ROUND 2', sub: '击破「幻影」 · 干扰机随行，靠近它锁定与雷达失效', spawn: { boss: 'phantom', jammer: 1 } },
    { title: 'ROUND 3', sub: '巨像 · 先毁武器舱再打核心', spawn: { colossus: 1, bossHp: 0.8, drone: 2 } },
    { title: 'FINAL ROUND', sub: '「暴君」与「幻影」同时出击', spawn: { boss: 'tyrant', boss2: 'phantom', bossHp: 0.55, jammer: 1 } },
  ] },
  endless: { name: '无尽防线', en: 'ENDLESS', desc: '黄昏 · 无限波次，越来越强 · 每 5 波一个头目', seed: 5, env: 'dusk', endless: true, reward: 0 },
};
const ENVS = {
  day: { top: 0x6f98bf, hor: 0xc4cfd8, fog: [90, 560], hemi: [0xdfe9f2, 0x6a6660, 0.6], sun: [0xfff1de, 2.2], env: 0.42, exp: 0.9, dir: [0.45, 0.55, 0.7], disc: 1 },
  dusk: { top: 0x3c4f7c, hor: 0xd99a74, fog: [80, 520], hemi: [0xffd6b8, 0x4c4240, 0.5], sun: [0xffb47a, 2.5], env: 0.34, exp: 0.95, dir: [-0.62, 0.2, 0.46], disc: 1.4 },
  snow: { top: 0x8ea3b8, hor: 0xd6dee6, fog: [40, 300], hemi: [0xeef4ff, 0x8f99a6, 0.72], sun: [0xf2f6ff, 1.5], env: 0.36, exp: 0.82, dir: [0.35, 0.42, 0.65], disc: 0.35, snow: true },
  desert: { top: 0x6f9cc6, hor: 0xe8d2a8, fog: [80, 520], hemi: [0xfff0d8, 0x8a6a48, 0.62], sun: [0xffe4b8, 2.6], env: 0.4, exp: 0.86, dir: [0.5, 0.62, -0.38], disc: 1.3 },
  ash: { top: 0x1f1716, hor: 0x7a4a36, fog: [45, 360], hemi: [0xffc0a0, 0x2a2020, 0.42], sun: [0xff9060, 1.5], env: 0.22, exp: 1.02, dir: [-0.45, 0.32, 0.6], disc: 0.8, ash: true },
  storm: { top: 0x1c232c, hor: 0x46505c, fog: [30, 230], hemi: [0x9aacc0, 0x26282c, 0.42], sun: [0xc0cce0, 0.8], env: 0.2, exp: 1.02, dir: [0.25, 0.7, 0.4], disc: 0.05, rain: true },
  dawn: { top: 0x56658f, hor: 0xf0b49c, fog: [70, 480], hemi: [0xffd8cc, 0x4a4250, 0.52], sun: [0xffc49a, 2.1], env: 0.34, exp: 0.95, dir: [0.75, 0.16, -0.25], disc: 1.6 },
  haze: { top: 0x8a7468, hor: 0xe2aa7c, fog: [55, 400], hemi: [0xffe2c4, 0x5e4232, 0.6], sun: [0xffc890, 2.2], env: 0.32, exp: 0.94, dir: [-0.5, 0.42, 0.35], disc: 1.1 },
  forge: { top: 0x1c0d0a, hor: 0x7a2e16, fog: [50, 380], hemi: [0xffb090, 0x3a1810, 0.42], sun: [0xffa070, 1.45], env: 0.2, exp: 1.0, dir: [0.4, 0.34, -0.6], disc: 0.3, ash: true, ember: true },
  ion: { top: 0x15112a, hor: 0x4e3c6e, fog: [45, 330], hemi: [0xbcaeff, 0x1c1a26, 0.46], sun: [0xd4c4ff, 1.05], env: 0.22, exp: 1.02, dir: [-0.35, 0.5, 0.55], disc: 0.2, bolts: true, dust: true },
  cyber: { top: 0x05030c, hor: 0x2a0c40, fog: [60, 440], hemi: [0x9080ff, 0x140a20, 0.42], sun: [0xc0b0ff, 1.1], env: 0.22, exp: 1.0, dir: [0.3, 0.7, 0.4], disc: 0, stars: true, earth: [0, -1, 0] },
  autumn: { top: 0x4673a8, hor: 0xe2a46a, fog: [110, 620], hemi: [0xffdcb0, 0x5a3a22, 0.48], sun: [0xffb878, 2.5], env: 0.3, exp: 0.84, dir: [-0.5, 0.34, 0.62], disc: 1.3, leaves: true },
  lunar: { top: 0x020308, hor: 0x0c0f16, fog: [160, 950], hemi: [0xa8b4cc, 0x1c1c20, 0.28], sun: [0xfffaf2, 2.5], env: 0.2, exp: 0.95, dir: [0.55, 0.36, -0.5], disc: 0.15, stars: true, earth: [-0.42, 0.55, -0.72] },
  overcast: { top: 0x7a8590, hor: 0xb4bcc4, fog: [60, 420], hemi: [0xe0e6ec, 0x5a5c5e, 0.7], sun: [0xf0f2f4, 1.25], env: 0.4, exp: 0.92, dir: [0.3, 0.75, 0.4], disc: 0.15 },
  eclipse: { top: 0x120c1c, hor: 0x5c2a40, fog: [55, 420], hemi: [0xd8c0ff, 0x1c1620, 0.36], sun: [0xff9a80, 1.25], env: 0.18, exp: 1.04, dir: [-0.3, 0.38, 0.7], disc: 0.5 },
  abyss: { top: 0x03121c, hor: 0x0c4a58, fog: [30, 200], hemi: [0x7fd0e0, 0x081418, 0.48], sun: [0x98e4f4, 0.8], env: 0.16, exp: 0.96, dir: [0.15, 0.92, 0.2], disc: 0, bubbles: true },
  sky1: { top: 0x3f7fc8, hor: 0xcfe2f2, fog: [220, 1500], hemi: [0xe4f0ff, 0x7088a0, 0.6], sun: [0xfff2e0, 2.3], env: 0.35, exp: 0.88, dir: [0.4, 0.6, 0.5], disc: 1.0, earth: [0, -1, 0] },
  sky2: { top: 0x2a3c78, hor: 0xf0a070, fog: [240, 1700], hemi: [0xffd0b0, 0x40406a, 0.5], sun: [0xffb070, 2.2], env: 0.3, exp: 0.9, dir: [-0.6, 0.28, 0.5], disc: 1.4, earth: [0, -1, 0] },
  sky3: { top: 0x060c26, hor: 0x3a6ab8, fog: [300, 2400], hemi: [0xb8ccff, 0x202838, 0.42], sun: [0xfff6ec, 2.5], env: 0.24, exp: 0.95, dir: [-0.4, 0.42, 0.55], disc: 0.6, stars: 0.5, earth: [0, -1, 0] },
  sky4: { top: 0x000002, hor: 0x0c1c40, fog: [500, 3200], hemi: [0xa8b4cc, 0x101420, 0.3], sun: [0xffffff, 2.6], env: 0.2, exp: 0.95, dir: [0.5, 0.42, -0.5], disc: 0.2, stars: 1, earth: [0, -1, 0] },
  dune: { top: 0x8a6e58, hor: 0xe0b890, fog: [50, 340], hemi: [0xffe4c4, 0x6a5038, 0.6], sun: [0xffd4a4, 2.0], env: 0.32, exp: 0.9, dir: [-0.4, 0.45, 0.45], disc: 0.7, sand: true },
  factory: { top: 0x46444c, hor: 0xd0b494, fog: [80, 450], hemi: [0xe8d8c0, 0x2c2a28, 0.55], sun: [0xffd8a8, 1.7], env: 0.26, exp: 0.95, dir: [0.55, 0.42, -0.4], disc: 0.75, cl: 0.4 },
  ctf: { top: 0x3a68a8, hor: 0xc8dcea, fog: [150, 620], hemi: [0xe8f0ff, 0x3a3a34, 0.6], sun: [0xfff0d8, 2.4], env: 0.28, exp: 0.92, dir: [0.42, 0.55, 0.45], disc: 0.5, cl: 0.45 },
  polar: { top: 0x2c3260, hor: 0xd8b0d8, fog: [130, 560], hemi: [0xe8dcff, 0x2e2a3c, 0.58], sun: [0xffe4f0, 2.2], env: 0.28, exp: 0.94, dir: [0.5, 0.4, -0.5], disc: 0.55, cl: 0.3 },
  fuse: { top: 0x46587a, hor: 0xf0a878, fog: [120, 520], hemi: [0xffe2cc, 0x403830, 0.55], sun: [0xffb878, 2.3], env: 0.26, exp: 0.92, dir: [-0.6, 0.35, 0.45], disc: 0.5, cl: 0.35 },
  paint: { top: 0x3f8ee0, hor: 0xe4ecf2, fog: [150, 650], hemi: [0xf4f8ff, 0x5a6058, 0.62], sun: [0xfff4e0, 2.6], env: 0.3, exp: 0.9, dir: [0.45, 0.75, 0.35], disc: 0.6, cl: 0.25 },
  glad: { top: 0x5f86b8, hor: 0xeccc9c, fog: [140, 640], hemi: [0xfff0d8, 0x6a5038, 0.6], sun: [0xffe0ae, 2.5], env: 0.32, exp: 0.92, dir: [0.55, 0.5, 0.42], disc: 1.1, cl: 0.3 },
  atom: { top: 0x3c4232, hor: 0xb4b48c, fog: [60, 380], hemi: [0xdcdcc0, 0x2a2e22, 0.6], sun: [0xfff0c4, 1.5], env: 0.26, exp: 0.9, dir: [0.35, 0.5, -0.3], disc: 0.8, cl: 0.7 },
  creep: { top: 0x352840, hor: 0xa08896, fog: [60, 400], hemi: [0xd8c6d8, 0x2a2230, 0.6], sun: [0xffd6c0, 1.4], env: 0.26, exp: 0.9, dir: [-0.4, 0.45, 0.35], disc: 0.8, cl: 0.6 },
  tsunami: { top: 0x2e3e4c, hor: 0x9aacb8, fog: [70, 430], hemi: [0xc4d8e4, 0x262e34, 0.6], sun: [0xe4eeff, 1.45], env: 0.27, exp: 0.92, dir: [0.35, 0.55, 0.35], disc: 0.7, cl: 0.75 },
  maze: { top: 0x3e5670, hor: 0xb4c4cc, fog: [70, 420], hemi: [0xc8d8e8, 0x2a2c30, 0.55], sun: [0xfff0dc, 1.45], env: 0.24, exp: 0.98, dir: [-0.45, 0.6, -0.4], disc: 0.8, cl: 0.5 },
  decap: { top: 0x2c2430, hor: 0xc08a5c, fog: [60, 380], hemi: [0xe0b890, 0x22201c, 0.5], sun: [0xffb070, 1.25], env: 0.22, exp: 0.95, dir: [0.62, 0.24, -0.42], disc: 0.85, cl: 0.62 },
  sabot: { top: 0x0e1626, hor: 0x5a6e8c, fog: [55, 360], hemi: [0x9ab0d0, 0x161a22, 0.42], sun: [0xc8d4ff, 0.95], env: 0.18, exp: 1.02, dir: [-0.55, 0.3, 0.5], disc: 0.4 },
  evac: { top: 0x2c2232, hor: 0xd8784a, fog: [70, 430], hemi: [0xdcc8c0, 0x34261e, 0.5], sun: [0xff8a50, 1.55], env: 0.26, exp: 0.95, dir: [0.42, 0.24, -0.6], disc: 1.0 },
  shield: { top: 0x1c2a56, hor: 0xe4945e, fog: [90, 520], hemi: [0xd0d4ec, 0x302c38, 0.46], sun: [0xff9c68, 1.7], env: 0.24, exp: 0.95, dir: [-0.52, 0.2, 0.6], disc: 1.0 },
  chase: { top: 0x2a3658, hor: 0xd08a66, fog: [70, 440], hemi: [0xe8ccc0, 0x34303c, 0.5], sun: [0xffa070, 1.9], env: 0.26, exp: 0.94, dir: [0.6, 0.24, -0.58], disc: 0.9 },
  noon: { top: 0x4c7cb4, hor: 0xeee0c6, fog: [110, 540], hemi: [0xf6ecda, 0x5c4c38, 0.6], sun: [0xfff2dc, 2.5], env: 0.3, exp: 0.84, dir: [0.18, 0.94, 0.28], disc: 0.45 },
  sprint: { top: 0x3e74b8, hor: 0xcadbe6, fog: [90, 480], hemi: [0xe2ecf6, 0x4e4638, 0.6], sun: [0xfff0d6, 2.2], env: 0.3, exp: 0.9, dir: [-0.42, 0.6, -0.45], disc: 0.5 },
  front: { top: 0x6e6a60, hor: 0xd0ae84, fog: [60, 380], hemi: [0xe8dcc8, 0x4a3e30, 0.62], sun: [0xffd0a0, 1.8], env: 0.26, exp: 0.88, dir: [0.55, 0.42, -0.5], disc: 0.4 },
  fort: { top: 0x5c7ea8, hor: 0xdcd4c2, fog: [70, 400], hemi: [0xe0e8f0, 0x4a463c, 0.64], sun: [0xfff0d8, 1.85], env: 0.28, exp: 0.9, dir: [-0.5, 0.55, -0.45], disc: 0.35 },
  wreck: { top: 0x58606c, hor: 0xb8b0a0, fog: [80, 420], hemi: [0xd8dce0, 0x3a3630, 0.62], sun: [0xe8e0d0, 1.6], env: 0.26, exp: 0.9, dir: [0.4, 0.55, -0.5], disc: 0.3 },
  refinery: { top: 0x46548a, hor: 0xe8a070, fog: [100, 480], hemi: [0xffe0c0, 0x40342a, 0.55], sun: [0xffb070, 2.2], env: 0.24, exp: 0.9, dir: [-0.6, 0.35, 0.4], disc: 0.6 },
  fog: { top: 0x3c4848, hor: 0x8c9894, fog: [6, 70], hemi: [0xc0d0cc, 0x2c3634, 0.55], sun: [0xdce4e0, 0.85], env: 0.22, exp: 0.92, dir: [0.3, 0.6, 0.5], disc: 0.1 },
  supply: { top: 0x4a86d0, hor: 0xd8e6f0, fog: [120, 520], hemi: [0xf0f6ff, 0x50604a, 0.6], sun: [0xfff2d8, 2.4], env: 0.26, exp: 0.9, dir: [0.5, 0.7, 0.3], disc: 0.5 },
  rift: { top: 0x140c2a, hor: 0x6a4a9a, fog: [60, 300], hemi: [0xc0a8ff, 0x241a34, 0.5], sun: [0xd0b0ff, 1.25], env: 0.22, exp: 0.95, dir: [0.4, 0.5, -0.6], disc: 0.4, stars: 0.5, earth: [0, -1, 0] },
  highway: { top: 0x3a3c64, hor: 0xe0946a, fog: [70, 360], hemi: [0xffd8c0, 0x3a3038, 0.5], sun: [0xffb078, 1.6], env: 0.24, exp: 0.95, dir: [-0.7, 0.32, 0.45], disc: 0.6 },
  thunder: { top: 0x1a2228, hor: 0x44525a, fog: [40, 260], hemi: [0xa0b8c4, 0x262a2c, 0.5], sun: [0xb8c8d8, 0.85], env: 0.22, exp: 1.0, dir: [0.3, 0.7, 0.35], disc: 0.05, rain: true },
  flare: { top: 0x7c86a8, hor: 0xf2d6aa, fog: [60, 340], hemi: [0xfff0d8, 0x584838, 0.45], sun: [0xfff0cc, 2.4], env: 0.2, exp: 0.82, dir: [0.55, 0.42, -0.72], disc: 0.9 },
  quake: { top: 0x786e64, hor: 0xc8b49a, fog: [50, 300], hemi: [0xe4d6c2, 0x463c34, 0.55], sun: [0xffe0b8, 1.6], env: 0.24, exp: 0.86, dir: [0.45, 0.42, -0.6], disc: 0.45, dust: true },
  scrap: { top: 0x6a6470, hor: 0xc8a888, fog: [50, 320], hemi: [0xe8d0b8, 0x4a3a30, 0.55], sun: [0xffd8a8, 1.5], env: 0.24, exp: 0.86, dir: [-0.5, 0.38, 0.55], disc: 0.4, dust: true },
  salt: { top: 0x5f8fc8, hor: 0xf0e4d0, fog: [80, 440], hemi: [0xfff2e0, 0x9a9286, 0.62], sun: [0xfff0d6, 1.7], env: 0.26, exp: 0.78, dir: [0.15, 0.2, -0.97], disc: 0.9 },
  gale: { top: 0x55626e, hor: 0xc0bfb2, fog: [55, 340], hemi: [0xd8dccc, 0x4a463a, 0.58], sun: [0xfff0d8, 1.45], env: 0.26, exp: 0.9, dir: [-0.45, 0.42, 0.5], disc: 0.3, sand: true },
  icelake: { top: 0x5a7aa2, hor: 0xc4d2de, fog: [60, 360], hemi: [0xd6e8ff, 0x4c5c6c, 0.55], sun: [0xffe2c4, 1.35], env: 0.24, exp: 0.82, dir: [0.55, 0.32, -0.45], disc: 0.3 },
  lockdown: { top: 0x04060b, hor: 0x161c2a, fog: [30, 250], hemi: [0x5a6a8a, 0x0a0c10, 0.26], sun: [0x9ab0d8, 0.45], env: 0.1, exp: 1.1, dir: [-0.3, 0.7, 0.4], disc: 0.25 },
  twister: { top: 0x3e4236, hor: 0xb4a47a, fog: [50, 320], hemi: [0xd8d0b0, 0x3a3424, 0.6], sun: [0xffe6b8, 1.5], env: 0.28, exp: 0.95, dir: [0.5, 0.5, -0.4], disc: 0.35, sand: true },
  grid: { top: 0x0c1424, hor: 0x2e3e58, fog: [45, 330], hemi: [0x9ab4e0, 0x141820, 0.34], sun: [0xb8ccff, 0.8], env: 0.16, exp: 1.04, dir: [0.4, 0.55, -0.5], disc: 0.3 },
  toxic: { top: 0x48562a, hor: 0xc4c27a, fog: [40, 300], hemi: [0xe6eec0, 0x343a20, 0.58], sun: [0xf6eec0, 1.8], env: 0.3, exp: 0.92, dir: [-0.35, 0.6, 0.45], disc: 0.5, spores: true },
  jungle: { top: 0x3c6a58, hor: 0xb8d0a0, fog: [40, 300], hemi: [0xe0f0c8, 0x2c3a20, 0.6], sun: [0xfff0c8, 1.9], env: 0.3, exp: 0.92, dir: [0.35, 0.62, 0.4], disc: 0.6, pollen: true },
  surge: { top: 0x34424e, hor: 0x8a98a2, fog: [55, 400], hemi: [0xc8d8e4, 0x30383c, 0.56], sun: [0xd8e4f0, 1.15], env: 0.3, exp: 0.95, dir: [0.3, 0.6, 0.45], disc: 0.1, rain: true },
  meteor: { top: 0x050414, hor: 0x3c2050, fog: [110, 680], hemi: [0xd0b0ff, 0x2a1a2c, 0.5], sun: [0xffc0a0, 1.7], env: 0.26, exp: 0.98, dir: [-0.45, 0.4, 0.55], disc: 0.4, stars: 0.8, earth: [0, -1, 0] },
  night: { top: 0x060b18, hor: 0x18223a, fog: [45, 340], hemi: [0x6880b8, 0x141419, 0.22], sun: [0xa8bcff, 0.55], env: 0.1, exp: 1.08, dir: [0.3, 0.62, -0.5], disc: 0.45 },
};
const KILL_CR = { raptor: 160, dyad: 190, scrambler: 200, sprayer: 220, adaptor: 260, bloater: 200, seeder: 220, tumor: 70, bionode: 600, swapper: 190, pump: 600, forklift: 200, fab: 600, pulsar: 230, marshal: 600, dazzler: 200, reviver: 240, weaver: 190, launcher: 260, cruise: 25, courier: 1200, torcher: 170, dish: 600, anchor: 220, engineer: 180, tower: 400, citadel: 1200, shade: 160, hijack: 130, scav: 140, planter: 150, lurker: 160, snatcher: 140, disarmer: 200, leech: 45, herald: 260, leaper: 220, rammer: 240, deflector: 200, mirage: 260, blimp: 420, frost: 180, watch: 250, blinker: 160, hive: 300, swarm: 5, fencer: 110, prism: 220, skimmer: 200, splitter: 60, jet: 220, eel: 200, grappler: 240, train: 2500, burrower: 180, warden: 200, howitzer: 220, dropship: 350, jammer: 180, sapper: 160, crawler: 20, mender: 140, stalker: 260, drone: 40, turret: 60, walker: 120, bulwark: 150, gunship: 220, raider: 300, relay: 450, boss: 1200 };
const UPGRADES = {
  armor: { name: '装甲强化', desc: 'AP +8%' },
  gen: { name: '发电机', desc: 'EN 上限与回复 +8%' },
  thr: { name: '推进器', desc: '推进与急闪速度 +4%' },
  fcs: { name: '火控系统', desc: '全武器伤害 +6%' },
};
const UP_COST = [600, 1200, 2000, 3000, 4200];
// passive chips: one slot, a second one for CHIP2_COST
const CHIPS = {
  nano: { name: '纳米自修复', desc: '5 秒未受伤后每秒修复 0.6% AP' },
  mag: { name: '扩容弹匣', desc: '臂部弹匣 +40% · 换弹 −20%' },
  cool: { name: '冷却回路', desc: '肩部武器冷却 −25%' },
  thrust: { name: '推进增压', desc: '推进 +10% · EN 回复 +25%' },
  cap: { name: '超载电容', desc: '超载充能 +40% · 持续 +3 秒' },
  leech: { name: '吸能装甲', desc: '每次击毁回复 2.5% AP' },
};
const CHIP2_COST = 3000;
// challenge modifiers: toggled on the title screen, each raises the payout
const MODS = {
  glass: { name: '玻璃机体', desc: '机体 AP ×0.6', cr: 0.3 },
  elite: { name: '精锐敌军', desc: '敌方耐久 ×1.3', cr: 0.3 },
  nofix: { name: '无补给', desc: '敌人不掉修理包 · 波间不修复装甲', cr: 0.25 },
};
// daily challenge: one seeded mission per local date: arena, lighting, enemy mix, final boss and forced modifiers
const ENV_CN = { day: '白天', dawn: '黎明', dusk: '黄昏', night: '夜间', snow: '暴雪', desert: '沙漠', storm: '雷暴', ash: '火山灰' };
function dailyMission() {
  const now = new Date(), ds = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let h = 2166136261; for (const ch of 'iv-daily-' + ds) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = mulberry32(h), pick = (a) => a[Math.floor(rnd() * a.length)];
  const env = pick(Object.keys(ENV_CN));
  const mk = Object.keys(MODS), m1 = pick(mk), forceMods = [m1];
  if (rnd() < 0.5) forceMods.push(pick(mk.filter((k) => k !== m1)));
  const boss = pick(['tyrant', 'phantom', 'colossus']);
  const waves = [3, 6, 9].map((n, i) => ({ title: `WAVE ${i + 1}`, sub: ['今日敌情：先遣部队', '敌军增援', '主力部队'][i], spawn: mixWave(n, rnd) }));
  waves.push(boss === 'colossus' ? { title: 'FINAL WAVE', sub: '今日头目：巨像 · 先毁武器舱再打核心', spawn: { colossus: 1, drone: 3 } }
    : { title: 'FINAL WAVE', sub: `今日头目：${BOSSES[boss].name.split(' ')[0]}`, spawn: { boss, drone: 3, stalker: rnd() < 0.5 ? 1 : 0 } });
  const mods = forceMods.map((k) => MODS[k].name).join(' / ');
  return { name: '每日挑战', en: 'DAILY ' + ds.slice(5), desc: `${ds} · ${ENV_CN[env]} · 强制词条：${mods} · 头目 ${boss === 'colossus' ? '巨像' : BOSSES[boss].name.split(' ')[0]} · 每天一套新地图与敌军`,
    seed: 100 + (h % 800), env, reward: 4800, waves, forceMods, bestKey: 'daily@' + ds, date: ds };
}
MISSIONS.daily = dailyMission();
const forcedMod = (k) => !!(MISSIONS[cfg.mission] && (MISSIONS[cfg.mission].forceMods || []).includes(k));
const modOn = (k) => !!(cfg.mods && cfg.mods[k]) || forcedMod(k);
const modMul = () => 1 + Object.keys(MODS).reduce((a, k) => a + (modOn(k) ? MODS[k].cr : 0), 0);
const SAVE_KEY = 'ironvanguard.save.v1';
const save = { cr: 0, up: { armor: 0, gen: 0, thr: 0, fcs: 0 }, best: {}, bestWave: 0, earned: 0, wing: false, medals: {}, tally: {} };
const WING_COST = 2500, WING_CR = 0.85;
try { const o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (o) { Object.assign(save, o); save.up = { armor: 0, gen: 0, thr: 0, fcs: 0, ...(o.up || {}) }; } } catch (e) { /* storage unavailable */ }
const partOwned = (slot, id) => id === 'std' || !!(save.parts && save.parts[slot + '.' + id]);
const myParts = () => { const r = {}; for (const s of PART_SLOTS) { const id = (cfg.parts || {})[s]; if (id && PARTS[s][id] && partOwned(s, id)) r[s] = id; } return r; };
const writeSave = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const playerMods = () => { const u = save.up, th = chipOn('thrust'); return { hp: 1 + 0.08 * u.armor, en: 1 + 0.08 * u.gen, regen: (1 + 0.08 * u.gen) * (th ? 1.25 : 1), boost: (1 + 0.04 * u.thr) * (th ? 1.1 : 1), speed: 1 + 0.02 * u.thr }; };
const chipSlots = () => (save.chip2 ? 2 : 1);
const chipOn = (k) => Array.isArray(cfg.chips) && cfg.chips.slice(0, chipSlots()).includes(k);
function playerWeapon(key) {   // weapon state with chip modifiers applied to a private copy of the weapon data
  const ws = weaponState(key), d = { ...ws.d };
  if (chipOn('mag') && d.slot === 'arm' && d.mag) { d.mag = Math.round(d.mag * 1.4); d.reload *= 0.8; }
  if (d.slot === 'arm' && d.reload) d.reload *= partStats(myParts()).reload;   // brace arms
  if (chipOn('cool') && d.slot === 'shoulder' && d.cd) d.cd *= 0.75;
  ws.d = d; ws.ammo = d.mag || 0; return ws;
}
const freshPW = () => ({ R: playerWeapon(cfg.R), L: playerWeapon(cfg.L), S: playerWeapon(cfg.S) });
const dmgMul = () => 1 + 0.06 * save.up.fcs;

// ------------------------------------------------------------------ config (per-viewer convenience only)
const CFG_KEY = 'ironvanguard.cfg.v1';
const cfg = { palette: 'vanguard', frame: 'std', R: 'rifle', L: 'gatling', S: 'missile', diff: 'normal', mission: 'drill', sens: 1, vol: 0.7, invY: false, wing: true };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } };
// migrate the v1 per-difficulty best times (proving ground only)
try { const old = JSON.parse(localStorage.getItem('ironvanguard.best') || '{}'); for (const k in old) if (!save.best['drill.' + k]) save.best['drill.' + k] = old[k]; } catch (e) { /* ignore */ }
if (!MISSIONS[cfg.mission]) cfg.mission = 'drill';
if (!cfg.mods || typeof cfg.mods !== 'object') cfg.mods = {};
if (!Array.isArray(cfg.chips)) cfg.chips = [];
if (!cfg.parts || typeof cfg.parts !== 'object') cfg.parts = {};

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
  uniforms: { top: { value: new THREE.Color(0x6f98bf) }, hor: { value: HORIZON }, sun: { value: new V3(0.45, 0.55, 0.7).normalize() }, disc: { value: 1 }, stars: { value: 0 }, earth: { value: new V3(-0.45, 0.32, -0.83).normalize() },
    sunC: { value: new THREE.Color(1, 0.92, 0.8) }, cover: { value: 0.4 }, cT: { value: 0 }, cLit: { value: new THREE.Color(1, 1, 1) }, cDark: { value: new THREE.Color(0.4, 0.45, 0.5) } },
  vertexShader: 'varying vec3 vDi; void main(){ vDi = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
  // vDi is renormalised per pixel: the linearly interpolated direction made the sharp sun disc a cross along the sphere's triangle edges
  // clouds: one fbm layer projected onto a flat ceiling, lit by sampling the density a step toward the sun (thin edges facing the
  // sun glow, thick cores go dark underneath); they hide the sun disc so light shafts come out of the gaps
  fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sun; uniform float disc; uniform float stars; uniform vec3 earth; varying vec3 vDi; vec3 vD;
    uniform vec3 sunC; uniform float cover; uniform float cT; uniform vec3 cLit; uniform vec3 cDark;
    float hs(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float h2(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p, float hi){ float v = 0.0, a = 0.5; mat2 R = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 5; i++) { v += a * vn(p) * (i > 2 ? hi : 1.0); p = R * p; a *= 0.5; } return v; }
    void main(){ vD = normalize(vDi); float h = clamp(vD.y, 0.0, 1.0); vec3 c = mix(hor, top, pow(h, 0.55));
      float s = max(dot(vD, sun), 0.0);
      c += sunC * (pow(s, 8.0) * 0.15 + pow(s, 3.0) * 0.1 * (1.0 - h) * (1.0 - h)) * disc;
      float sd = pow(s, 600.0) * 4.0, ca = 0.0;
      if (cover > 0.001 && vD.y > 0.0) {
        float t = 1.0 / (vD.y + 0.06), hi = smoothstep(0.03, 0.22, vD.y);
        vec2 p = vD.xz * t * 2.1 + vec2(0.9, 0.35) * cT;
        p += 0.75 * vec2(vn(p * 0.4 + 3.1), vn(p * 0.4 + 9.7));
        float d = fbm(p, hi), th = mix(0.74, 0.3, cover);
        float a = smoothstep(th, th + 0.12, d);
        if (a > 0.001) {
          float d2 = fbm(p + normalize(sun.xz + 1e-4) * 0.2, hi);
          float core = smoothstep(th + 0.02, th + 0.24, d);   // thick middles go dark underneath, thin edges stay bright
          float lit = clamp(0.5 + (d - d2) * 8.0, 0.0, 1.0) * (1.0 - 0.62 * core);
          vec3 cc = mix(cDark, cLit, lit) + sunC * pow(s, 5.0) * (1.0 - core * 0.85) * 1.6 * disc;
          cc = mix(cc, hor, smoothstep(0.3, 0.0, vD.y) * 0.65);
          ca = a * smoothstep(0.0, 0.07, vD.y) * 0.97;
          c = mix(c, cc, ca); sd *= 1.0 - ca;
        }
      }
      c += sunC * sd;
      if (stars > 0.01) {
        vec3 q = floor(vD * 220.0); float st = hs(q); c += vec3(0.85, 0.9, 1.0) * step(0.9965, st) * (0.4 + 2.2 * fract(st * 97.0)) * smoothstep(0.0, 0.12, vD.y) * min(stars, 1.0) * (1.0 - ca);
        float e = dot(vD, earth);
        if (e > 0.9975) {   // earth: blue disc with cloud bands, lit from the sun side
          vec3 n = normalize(vD - earth * e); float r = sqrt(max(0.0, 1.0 - e * e)) / 0.0707;
          vec3 l = normalize(sun - earth * dot(sun, earth)); float lit = smoothstep(-0.35, 0.45, dot(n, l) * r);
          float cl = smoothstep(0.55, 0.8, hs(floor(vD * 900.0)) * 0.5 + 0.5 * sin(vD.y * 700.0 + vD.x * 300.0));
          vec3 ec = mix(vec3(0.08, 0.22, 0.5), vec3(0.15, 0.4, 0.25), step(0.7, hs(floor(vD * 500.0))));
          c = mix(ec, vec3(0.92), cl * 0.75) * (0.04 + 1.3 * lit) + vec3(0.3, 0.5, 1.0) * smoothstep(0.7, 1.0, r) * 0.5 * lit;
        } else c += vec3(0.25, 0.45, 1.0) * smoothstep(0.9965, 0.9975, e) * 0.35;
      }
      if (vD.y < 0.0) c = hor; gl_FragColor = vec4(c, 1.0); }`,
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
const hemi = new THREE.HemisphereLight(0xdfe9f2, 0x6a6660, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1de, 2.2);
const GFX_HI = !window.__MA_KIT_LOAD && !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);   // desktop: 4K shadows + SSAO
sun.castShadow = true; sun.shadow.mapSize.setScalar(GFX_HI ? 4096 : 2048);   // WeChat quality tiers override this
const SC = sun.shadow.camera; SC.left = -70; SC.right = 70; SC.top = 70; SC.bottom = -70; SC.near = 10; SC.far = 400; SC.updateProjectionMatrix();
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const envBase = { exp: 1, sun: 1, top: new THREE.Color() }, FLARE_TOP = new THREE.Color(0xfff0d0);
const SUN_DIR = new V3(0.45, 0.55, 0.7).normalize(); G.sunDir = SUN_DIR; const _shX = new V3(), _shY = new V3(), _shP = new V3(), _shUp = new V3(0, 1, 0); const _glv = new V3(), _glp = new V3();
// cloud cover per lighting preset (0 = clear sky); anything not listed gets 0.4
const CLOUD = { day: 0.42, dusk: 0.52, snow: 0.85, desert: 0.28, ash: 0.7, storm: 0.95, dawn: 0.48, haze: 0.55, forge: 0.6, ion: 0.5, cyber: 0, autumn: 0.48, lunar: 0,
  overcast: 0.95, eclipse: 0.3, abyss: 0, sky1: 0.35, sky2: 0.32, sky3: 0.08, sky4: 0, dune: 0.4, evac: 0.52, shield: 0.46, chase: 0.5, noon: 0.3, sprint: 0.42,
  front: 0.55, fort: 0.5, wreck: 0.7, refinery: 0.46, fog: 0.9, supply: 0.4, rift: 0.2, highway: 0.46, thunder: 0.95, flare: 0.25, quake: 0.6, scrap: 0.6,
  salt: 0.22, gale: 0.66, icelake: 0.6, lockdown: 0.4, twister: 0.85, grid: 0.4, toxic: 0.6, jungle: 0.55, surge: 0.9, meteor: 0.15, night: 0.35 };
const clOf = (E) => E.cl ?? CLOUD[Object.keys(ENVS).find((k) => ENVS[k] === E)] ?? 0.4;
const lumOf = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
function applyEnv(key) {
  if (typeof key === 'string') setFoot(key);
  const E = typeof key === 'object' ? key : ENVS[key] || ENVS.day, U = sky.material.uniforms;
  U.top.value.set(E.top); HORIZON.set(E.hor); scene.fog.color.copy(HORIZON); scene.fog.near = E.fog[0]; scene.fog.far = E.fog[1];
  SUN_DIR.set(...E.dir).normalize(); U.sun.value.copy(SUN_DIR); U.disc.value = E.disc;
  hemi.color.set(E.hemi[0]); hemi.groundColor.set(E.hemi[1]); hemi.intensity = E.hemi[2];
  sun.color.set(E.sun[0]); sun.intensity = E.sun[1];
  U.stars.value = +E.stars || 0; if (E.earth) U.earth.value.set(...E.earth).normalize();
  scene.environmentIntensity = E.env; renderer.toneMappingExposure = E.exp; envBase.exp = E.exp; envBase.sun = E.sun[1]; envBase.top.set(E.top);
  snowFx.visible = !!(E.snow || E.ash || E.leaves || E.dust || E.bubbles || E.sand || E.pollen || E.spores); rainFx.visible = !!E.rain;
  snowFx.material.color.set(E.spores ? 0xc8e060 : E.pollen ? 0xe8f0a0 : E.sand ? 0xd8b080 : E.bubbles ? 0x8fdcec : E.dust ? 0xa890d8 : E.leaves ? 0xd0782a : E.ember ? 0xff8a40 : E.ash ? 0x6a605a : 0xffffff); snowFx.userData.k = E.spores ? -0.12 : E.pollen ? -0.06 : E.sand ? 0.18 : E.bubbles ? -0.45 : E.dust ? -0.15 : E.leaves ? 0.22 : E.ash ? 0.35 : 1;
  storm.on = !!(E.rain || E.bolts); storm.hemi = E.hemi[2]; storm.top.set(E.top); storm.k = 0; storm.t = 4 + Math.random() * 6;
  applyAtmo(E);
}
// clouds, light shafts / aerial perspective / grade and the distant ridge follow the preset's sky and sun colours
function applyAtmo(E) {
  const U = sky.material.uniforms, hl = lumOf(HORIZON);
  U.cover.value = clOf(E); U.sunC.value.copy(sun.color);
  U.cLit.value.copy(sun.color).multiplyScalar(THREE.MathUtils.clamp(hl * 1.5 + 0.2, 0.18, 1.25)).lerp(HORIZON, 0.2);
  U.cDark.value.copy(U.top.value).lerp(HORIZON, 0.45).multiplyScalar(0.52);
  atmo.setEnv(E, sun.color, U.top.value, HORIZON);
  const R = ridge.userData.U; R.hor.value.copy(HORIZON); R.top.value.copy(U.top.value); R.sunC.value.copy(sun.color); R.sunDir.value.copy(SUN_DIR);
  R.vis.value = THREE.MathUtils.clamp((E.fog[1] - 180) / 380, 0, 0.92); R.lit.value = THREE.MathUtils.clamp(hl * 1.6 + 0.15, 0.1, 1.2);
}
let arenaKey = '';
function ensureArena() {
  const M = MISSIONS[cfg.mission], key = M.seed + M.env;
  if (key === arenaKey && arenaGroup) return;
  if (arenaGroup) scene.remove(arenaGroup);
  PLAT.R = M.platform || 0; asc = null; tide = null; WATER.on = false; WATER.y = -50; ridge.visible = !PLAT.R || !!M.glad;
  arenaGroup = buildArena(scene, M.seed, M.env, M.path || M.track || (M.highway || M.lane ? Object.assign([[-ARENA - 40, 0], [ARENA + 40, 0]], { wide: M.lane ? 22 : 28 }) : null), M.zones ? (M.evac ? [...M.zones, M.evac] : M.zones) : M.cranes ? M.cranes.map((c) => [c[0], c[1]]) : M.sites || null); arenaKey = key;
  applyEnv(M.env);
  if (M.platform && !M.glad) buildAscent(arenaGroup);   // the coliseum only borrows the round boundary, not the elevator
  if (M.tide) buildTide(arenaGroup, M);
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
// storm surge: a wide water plane with a tiling procedural normal map; the tide rises each wave
let tide = null, waterTex = null;
function makeWaterNormals() {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), im = g.createImageData(N, N), h = new Float32Array(N * N);
  const waves = []; for (let k = 0; k < 14; k++) waves.push([1 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 7) - 3, Math.random() * 6.28, 1 / (1 + k * 0.4)]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (const [a, b, ph, w] of waves) v += Math.sin((a * x + b * y) / N * 6.2832 * 2 + ph) * w; h[y * N + x] = v; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    const nx = -dx * 0.6, ny = -dy * 0.6, L = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    im.data[i] = (nx / L * 0.5 + 0.5) * 255; im.data[i + 1] = (ny / L * 0.5 + 0.5) * 255; im.data[i + 2] = (1 / L * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 70); return t;
}
function buildTide(group, M) {
  waterTex = waterTex || makeWaterNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x183e4a, roughness: 0.1, metalness: 0.25, transparent: true, opacity: 0.9, normalMap: waterTex, normalScale: new THREE.Vector2(0.55, 0.55), depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), mat); m.renderOrder = 2; group.add(m);
  tide = { m, y: M.tide[0], yT: M.tide[0], splT: 0 };
  WATER.on = true; WATER.y = tide.y; m.position.y = tide.y;
}
function tideLogic(dt) {
  if (!tide) return;
  const dy = tide.yT - tide.y; tide.y += Math.sign(dy) * Math.min(Math.abs(dy), 0.12 * dt);
  WATER.y = tide.y; tide.m.position.y = tide.y;
  waterTex.offset.x += dt * 0.012; waterTex.offset.y += dt * 0.007;
  const p = G.player; if (!p || state !== 'play') return;
  tide.splT -= dt;
  if (p.wade > 0.05 && Math.hypot(p.vel.x, p.vel.z) > 3 && tide.splT <= 0) {
    tide.splT = 0.05;
    for (let k = 0; k < 2; k++) fx.emit('add', { x: p.pos.x + (Math.random() - 0.5) * 3, y: tide.y + 0.2, z: p.pos.z + (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 2, life: 0.45, s0: 1, s1: 2.2, c0: 0xd0eaf2 });
  }
  if (p.wade > 0.3 && !G.wadeSaid) { G.wadeSaid = true; showHint('涨潮 · 在水里移动变慢 · 用推进或钩爪 / 跳跃爬上屋顶占据高处', 4); }
}
const storm = { on: false, k: 0, t: 6, hemi: 0.4, top: new THREE.Color(), flashTop: new THREE.Color(0xb8c8e8) };
function updateRain(dt) {
  if (!storm.on) return;
  const a = rainFx.geometry.attributes.position.array, c = camera.position, H = RAIN_BOX / 2, vx = 3, vy = -34, L = 0.045, gy = WATER.on ? WATER.y : 0;
  if (rainFx.visible) for (let i = 0; i < RAIN_N; i++) {
    const j = i * 6;
    let x = a[j] + vx * dt, y = a[j + 1] + vy * dt, z = a[j + 2];
    if (y - c.y < -H) y += RAIN_BOX; if (x - c.x > H) x -= RAIN_BOX; else if (x - c.x < -H) x += RAIN_BOX; if (z - c.z > H) z -= RAIN_BOX; else if (z - c.z < -H) z += RAIN_BOX;
    if (y - c.y > H) y -= RAIN_BOX;
    if (a[j + 1] > gy && y <= gy && Math.random() < 0.45) {   // splash where the drop crosses the floor / water, near the camera
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < 1400) {
        fx.emit('add', { x, y: gy + 0.04, z, life: 0.17, s0: 0.12, s1: 0.95, c0: 0xc8d8ea, a0: 0.38 });
        if (Math.random() < 0.35) fx.emit('add', { x, y: gy + 0.1, z, vx: (Math.random() - 0.5) * 1.6, vy: 1.8 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 1.6, grav: 18, life: 0.28, s0: 0.11, s1: 0.06, c0: 0xd8e6f4, a0: 0.5 });
      }
    }
    a[j] = x; a[j + 1] = y; a[j + 2] = z; a[j + 3] = x - vx * L; a[j + 4] = y - vy * L; a[j + 5] = z;
  }
  if (rainFx.visible) rainFx.geometry.attributes.position.needsUpdate = true;
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
    a[j] += (Math.sin(t * 0.9 + ph[i]) * 0.6 + 2.2) * dt; a[j + 1] -= (2.6 + (ph[i] % 1.3)) * dt * (snowFx.userData.k || 1); a[j + 2] += Math.cos(t * 0.7 + ph[i]) * 0.5 * dt;
    for (let k = 0; k < 3; k++) { const d = a[j + k] - cc[k]; if (d > H) a[j + k] -= SNOW_BOX; else if (d < -H) a[j + k] += SNOW_BOX; }
  }
  snowFx.geometry.attributes.position.needsUpdate = true;
}
// the composer's buffers carry a depth texture so the atmosphere pass can tell sky from geometry and measure distance
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(innerWidth, innerHeight) }));
composer.addPass(new RenderPass(scene, camera));
const atmo = new AtmospherePass(innerWidth, innerHeight); composer.addPass(atmo); G.atmo = atmo;
atmo.aoOn = GFX_HI;   // SSAO is a desktop extra (a WeChat quality tier may turn it on)
const ridge = makeRidge(7); scene.add(ridge); G.ridge = ridge;
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.45, 2.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

G.scene = scene; G.camera = camera; G.renderer = renderer; G.composer = composer; G.bloom = bloom;
const fx = new FX(scene); G.fx = fx; fx.lightRefs = { sun, hemi, dir: SUN_DIR };

// footprints: [strength, r, g, b] - strong in snow / sand / dust, faint scuffs on hard ground; rgb is the print colour
const FOOT = { snow: [1, 0.36, 0.44, 0.6], icelake: [0.55, 0.5, 0.6, 0.75], dune: [1, 0.6, 0.47, 0.34], desert: [0.9, 0.6, 0.48, 0.36], salt: [0.75, 0.62, 0.55, 0.5],
  glad: [0.85, 0.6, 0.48, 0.36], lunar: [1, 0.45, 0.45, 0.47], meteor: [0.6, 0.5, 0.46, 0.5], abyss: [0.8, 0.5, 0.55, 0.55], ash: [0.8, 0.45, 0.43, 0.42],
  jungle: [0.7, 0.45, 0.42, 0.32], toxic: [0.55, 0.5, 0.5, 0.36], creep: [0.5, 0.48, 0.36, 0.44], twister: [0.6, 0.55, 0.5, 0.4], gale: [0.5, 0.52, 0.5, 0.44],
  autumn: [0.55, 0.52, 0.42, 0.34], forge: [0.55, 0.42, 0.36, 0.34], sky1: [0, 1, 1, 1], sky2: [0, 1, 1, 1], sky3: [0, 1, 1, 1], sky4: [0, 1, 1, 1], cyber: [0, 1, 1, 1] };
const _fp1 = new THREE.Vector3(), _fp2 = new THREE.Vector3();
function setFoot(key) { const f = FOOT[key] || [0.3, 0.3, 0.29, 0.28]; G.footK = f[0]; G.footTint = new THREE.Color(f[1], f[2], f[3]); }
function stepPrint(m) {
  if (!G.footK || !m.n || !m.n.M_FootL || !m.n.M_FootR) return;
  if ((WATER.on && m.pos.y < WATER.y + 0.3) || (LAVA.on && lavaAt(m.pos.x, m.pos.z))) return;
  const a = m.n.M_FootL.getWorldPosition(_fp1), b = m.n.M_FootR.getWorldPosition(_fp2), p = a.y < b.y ? a : b;
  fx.footprint({ x: p.x, y: m.pos.y, z: p.z }, m.legYaw, 2.1 * m.scale, G.footTint, G.footK);
}
// heat haze sources (thrusters, explosions, burning ground) and lens-dirt glints for the atmosphere pass
function feedPost() {
  for (const m of MECHS) { if (!m.root.parent) { if (m._seen) MECHS.delete(m); continue; } m._seen = true; m.heat(atmo.heat); }
  fx.heatOut(atmo.heat);
  if (G.fires) for (const f of G.fires) atmo.heat.push({ x: f.x, y: (f.y || 0) + 1.4, z: f.z, r: f.R * 1.1, s: 0.04 });
  fx.glintOut(atmo.glints);
}

// ------------------------------------------------------------------ mech callbacks (sounds, dust, shake)
const mctx = {
  onStep(m) { const d = m.pos.distanceTo(G.player ? G.player.pos : m.pos); sfx('step', d * (m === G.player ? 1 : 0.8)); if (m.scale > 1.2 || m === G.player) fx.dust(m.pos, 2, 1.6 * m.scale, 3); if (m === G.player) fx.trauma = Math.min(1, fx.trauma + 0.03); stepPrint(m); },
  onLand(m, imp) { fx.dust(m.pos, 10, 2.6 * m.scale, 9); fx.ring(m.pos, null, 1, 5 * m.scale, 0.4, 0xd8d0c0); if (m === G.player) { sfx('land'); fx.trauma = Math.min(1, fx.trauma + imp / 60); } else sfx('step', m.pos.distanceTo(G.player.pos)); },
  onQuickBoost(m) {
    m.qbAt = G.time;
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
  if (e.code === 'KeyV' && state === 'play') odPressed = true;
  if (e.code === 'KeyX' && state === 'play') togglePol();
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
  else if (state === 'title' && padHit(2)) { initAudio(); setState('medals'); }
  else if (state === 'medals' && (padHit(1) || padHit(0))) setState('title');
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
  const down = (e) => { e.preventDefault(); e.stopPropagation(); touch.b[k] = true; b.classList.add('on'); if (k === 'reload' && state === 'play') manualReload(); if (k === 'pol' && state === 'play') togglePol(); };
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
  if (G.camYawKick) { cam.yaw += G.camYawKick; G.camYawKick = 0; }
  G.camYaw = cam.yaw; G.camPitch = cam.pitch;
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
const lockK = () => (G.player && G.player.frame.lock) || 1;   // hawk head widens both lock circles
const lockR = () => innerHeight * 0.16 * lockK(), mslR = () => innerHeight * 0.3 * lockK();
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
    if (e.cloaked) continue;
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
  if (G.jammed) locks.length = 0;
  if (G.dazzleT > 0) locks.length = 0;
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
let snipeSaid = false;
const run = { wave: -1, breakT: 0, t: 0, over: false, deathT: 0, won: false, bossPhaseT: 0, droneT: 0, waves: [], cr: 0, msslT: 0 };

// endless: each wave spends a growing budget on a random mix; every 5th wave brings a boss
function endlessWave(i) {
  const n = i + 1;
  if (n % 5 === 0) {
    if (n % 10 === 0) return { title: `WAVE ${n}`, sub: '巨像来袭：先摧毁武器舱', boss: true, spawn: { colossus: 1, bossHp: 0.7 + 0.1 * (n / 10 - 1), drone: Math.min(6, 2 + n / 10) } };
    const type = ((n - 5) / 10) % 2 ? 'phantom' : 'tyrant';
    return { title: `WAVE ${n}`, sub: `头目来袭：${BOSSES[type].name}`, boss: true, spawn: { boss: type, bossHp: 0.75 + 0.15 * (n / 5 - 1), drone: Math.min(6, 1 + n / 5), turret: n >= 10 ? 2 : 0 } };
  }
  const sp = mixWave(n, Math.random);
  const subs = ['敌军增援抵达', '更多敌机接近', '防线承压', '坚守阵地'];
  return { title: `WAVE ${n}`, sub: subs[i % subs.length] + ` · 敌方耐久 +${Math.round(i * 5)}%`, spawn: sp };
}
const curWave = () => run.waves[run.wave];
function mixWave(n, rnd) {
  const pool = [['drone', 1, 99], ['turret', 1.5, 8]];
  if (n >= 2) pool.push(['walker', 3, 6]);
  if (n >= 3) pool.push(['bulwark', 3.5, 4]);
  if (n >= 4) pool.push(['gunship', 5, 3]);
  if (n >= 4) pool.push(['mender', 2.5, 2]);
  if (n >= 3) pool.push(['crawler', 0.7, 10], ['burrower', 3, 2]);
  if (n >= 4) pool.push(['sapper', 3, 2], ['warden', 3.5, 1]);
  if (n >= 5) pool.push(['stalker', 4, 2], ['jammer', 3.5, 1], ['howitzer', 4, 2]);
  if (n >= 6) pool.push(['raider', 4.5, 3], ['lancer', 4.5, 2], ['dropship', 5, 2]);
  if (n >= 5) pool.push(['grappler', 4, 2]);
  if (n >= 4) pool.push(['eel', 3.5, 2]);
  if (n >= 5) pool.push(['jet', 4, 2]);
  if (n >= 3) pool.push(['splitter', 3, 2]);
  if (n >= 4) pool.push(['skimmer', 3.5, 2]);
  if (n >= 3) pool.push(['prism', 3.5, 2]);
  if (n >= 4) pool.push(['fencer', 3.5, 2]);
  if (n >= 4) pool.push(['hive', 4, 1]);
  if (n >= 3) pool.push(['blinker', 3, 2]);
  if (n >= 4) pool.push(['watch', 3.5, 1]);
  if (n >= 3) pool.push(['frost', 3, 2]);
  if (n >= 5) pool.push(['blimp', 5, 1]);
  if (n >= 4) pool.push(['mirage', 4, 1]);
  if (n >= 3) pool.push(['deflector', 3, 1]);
  if (n >= 3) pool.push(['rammer', 3, 1]);
  if (n >= 2) pool.push(['leaper', 2, 2]);
  if (n >= 2) pool.push(['herald', 1, 1]);
  if (n >= 1) pool.push(['leech', 3, 1]);
  if (n >= 2) pool.push(['disarmer', 1, 1]);
  if (n >= 1) pool.push(['snatcher', 2, 1]);
  if (n >= 2) pool.push(['lurker', 2, 1]);
  const sp = {}; let budget = 5 + n * 2.6, total = 0;
  while (budget > 0.9 && total < 24) {
    const [k, c, max] = pool[Math.floor(rnd() * pool.length)];
    if ((sp[k] || 0) >= max || c > budget + 0.5) { if (pool.every(([kk, cc, mm]) => (sp[kk] || 0) >= mm || cc > budget + 0.5)) break; continue; }
    sp[k] = (sp[k] || 0) + 1; budget -= c; total++;
  }
  return sp;
}

function makePlayer() {
  if (G.player) G.player.dispose();
  G.player = new Mech(scene, mctx, { palette: cfg.palette, frame: cfg.frame, parts: myParts(), loadout: { R: cfg.R, L: cfg.L, S: cfg.S }, yaw: 0, mods: playerMods() });
  G.player.pos.set(0, 0, 128);
  G.pw = freshPW();
  cam.yaw = 0; cam.pitch = -0.05;
  buildWeaponPanel();
}

const wingOn = () => !!(save.wing && cfg.wing);
function clearWorld() {
  if (G.wing) G.wing.dispose(); if (G.core) G.core.dispose();
  clearDecoys(); clearWells(); clearChill(); clearStrikes(); clearDiscs(); clearMeteors(); clearHooks(); clearSmokes(); clearStasis(); clearAcid(); clearGrid(); clearTwisters(); clearBarrage(); clearIce(); clearWind(); clearStickies(); clearCranes(); clearPMines(); clearQuakes(); clearFlares(); resetNeedles(); clearThunder(); clearRods(); clearTraffic(); clearRifts(); clearSupply(); clearDepots(); clearSalvage(); clearFort(); clearRefl(); clearLane(); clearRBeam(); clearBeacon(); clearBurn(); clearLance(); clearPursuit(); clearFires(); clearNets(); clearDecap(); clearLinkB(); clearMaze(); clearRings(); clearBWalls(); clearFactory(); clearTBeams(); clearTsunami(); clearNano(); clearBio(); clearPlOrbs(); clearAtom(); clearGlad(); clearSaws(); clearTurf(); clearFuse(); clearBubbles(); clearPolar(); clearCTF(); G.arcChains = 0; G.raptorHops = 0; G.raptorHopSaid = false; G.dySweeps = 0; G.dyRebuilt = 0; G.javN = 0; G.javHits = 0; G.javPins = 0; G.javMulti = 0; G.dySaid = false; G.scramT = 0; G.scrams = 0; G.scramDodge = 0; G.scramBreak = 0; G.scramCharges = 0; G.scramTime = 0; G.bubbled = 0; G.bubDrops = 0; G.bubSlows = 0; G.scrSaid = false; G.pressCrush = 0; G.pwSaid = false; G.fpSaid = false; G.fbSaid = false; G.mzSaid = false; G.cnSaid = false; G.puSaid = false; G.bwSaid = false; G.dazzleT = 0; G.dazzled = 0; G.dazzleDodge = 0; G.linkUses = 0; G.linkDmg = 0; G.linkedN = 0; G.linkFizz = 0; G.decoysOut = 0; G.vipBoarded = false; G.shroudBlocked = 0; G.dazSaid = false; G.dcSaid = false; G.lkSaid = false; clearCamo(); clearWrecks(); clearSabot(); G.camoUses = 0; G.camoT = 0; G.camoBonus = 0; G.camoLost = 0; G.wrecksMade = 0; G.wrecksBroken = 0; G.revived = 0; G.reviveBreaks = 0; G.sabPlanted = 0; G.sabCamoPlant = 0; G.sabDefused = 0; G.sabSaid = false; G.revSaid = false; G.camoSaid = false; G.defSaid = false; clearWebs(); clearHacks(); clearEvac(); G.webHits = 0; G.webBroke = 0; G.webbedT = 0; G.websMade = 0; G.websBurnt = 0; G.webShots = 0; G.hacked = 0; G.hackTries = 0; G.hackFail = 0; G.hackShots = 0; G.civDmg = 0; G.civLog = {}; G.rescueSaid = false; G.civSaid = false; G.webSaid = false; G.hackSaid = false; G.shuttleSaid = 0; clearSky(); G.ciwsL.length = 0; G.cruiseN = 0; G.cruiseDown = 0; G.ciwsEat = 0; G.ciwsHit = 0; G.skySaid = false; G.cruiseSaid = false; G.netHits = 0; G.torchHit = 0; G.fireT = 0; G.courierUp = null; G.pursuitSaid = false; G.jamSaid = false; G.lanceSaid = false; G.gravSaid = false; G.gravT = 0; G.drillThru = 0; G.drillWallHits = 0; G.welded = 0; G.withdrawn = 0; G.engSaid = false; G.planted = 0; G.defused = 0; G.detonated = 0; G.tanksLost = 0; G.meltPeak = 0; G.plantSaid = false; clearFog(); resetRewind(); G.lampsLit = 0; G.lurkers = 0; G.lurkWakes = 0; G.lurkWokenHit = 0; G.lurkSniped = 0; G.lurkHides = 0; G.lurkSaid = false; G.fogSaid = false; G.pound = null; G.pBoostT = 0; G.crates = 0; G.cratesP = 0; G.cratesE = 0; G.empowered = 0; G.snatched = 0; G.snatchDeliver = 0; G.pounds = 0; G.poundHits = 0; G.poundMaxH = 0; G.supplySaid = false; G.empSaid = false; G.snatchSaid = false; G.jam.R = G.jam.L = G.jam.S = 0; G.jamHits = 0; G.jamOrbs = 0; G.jamSaid2 = false; G.riftP = 0; G.riftE = 0; G.riftShots = 0; G.riftSaid = false; G.siphonHeal = 0; G.leechOn = 0; G.leechLatch = 0; G.leechShaken = 0; G.leechT = 0; G.leechSaid = false; G.trucks = 0; G.truckHits = 0; G.truckE = 0; G.roadkill = 0; G.corrStacks = 0; G.corrBonus = 0; G.boltSaid = false; G.hornHintSaid = false; G.heraldSaid = false; G.bolts = 0; G.boltLocks = 0; G.boltHits = 0; G.boltDodged = 0; G.boltE = 0; G.boltRod = 0; G.rodZaps = 0; G.rodsUsed = 0; G.horns = 0; G.hornBlocked = 0; G.rallyHits = 0; G.leapSaid = false; G.leapDownSaid = false; G.flareSaid = false; G.leaps = 0; G.leapDowned = 0; G.leapHits = 0; G.flares = 0; G.flareT = 0; G.flareE = 0; G.needleBursts = 0; G.ramSaid = false; G.ramStunSaid = false; G.quakeSaid = false; G.ramCharges = 0; G.ramHits = 0; G.ramStuns = 0; G.ramBlocked = 0; G.quakes = 0; G.fisT = 0; G.ricochets = 0; G.ricoSeek = 0; G.defl = []; G.deflected = 0; G.magnetOn = 0; G.scrapDrops = 0; G.pmBlown = 0; G.deflDown = 0; G.magSaid = false; G.deflSaid = false; G.holoSpawned = 0; G.holoPopped = 0; G.stuckN = 0; G.holoSaid = false; G.bombsDropped = 0; G.windSaid = false; G.bombSaid = false; G.frozeSaid = false; G.holeSaid = false; G.spotSaid = false; G.twistSaid = false; G.blinkSaid = false; G.gridSaid = false; G.hiveSaid = false; G.levSaid = false; G.levSwimSaid = false; G.smokeN = 0; G.levBreaches = 0; G.meteorSaid = false; G.wadeSaid = false; G.tether = null; G.blinkInv = 0; G.eelSaid = false; G.jetSaid = false; G.train = null; G.hornSaid = false; G.wing = null; G.core = null; G.friends.length = 0;
  for (const e of G.enemies) e.remove ? e.remove() : null;
  G.enemies.length = 0; G.shots.length = 0; G.queue.length = 0; clearMinis(); clearMines(); snipeSaid = false; G.mendSaid = false; G.mineSaid = false; G.jamSaid = false; G.jammed = null; clearZones();
  for (const k of G.pickups) scene.remove(k.o);
  G.pickups.length = 0;
}

function newGame() {
  run.late = null;
  clearWorld();
  arenaKey = ''; ensureArena();   // rebuild so barrels and props are fresh
  G.diff = { key: cfg.diff, ...DIFFS[cfg.diff] };
  if (modOn('elite')) G.diff.hp *= 1.3;
  G.noRepair = modOn('nofix');
  makePlayer();
  if (modOn('glass')) { G.player.maxHp = Math.round(G.player.maxHp * 0.6); G.player.hp = G.player.maxHp; }
  Object.assign(G.stats, { shots: 0, hits: 0, kills: 0, dmgTaken: 0, dmgDealt: 0, blocked: 0 });
  const M = MISSIONS[cfg.mission];
  G.echoLo = setEcho({ R: cfg.R, L: cfg.L, S: cfg.S, frame: cfg.frame, parts: myParts() });
  PHYS.g = M.grav || 1; PHYS.grip = M.grip || 1; if (M.ice) startIce(); if (M.wind) startWind(); G.glare = !!M.glare; if (M.cranes) startCranes(M.cranes); if (M.quake) startQuakes(); if (M.flare) startFlares(); if (M.thunder) startThunder(STORM_RODS); if (M.highway) startTraffic(); if (M.rift) startRifts(); if (M.supply) startSupply(); if (M.fog) startFog(); if (M.depot) startDepots(); if (M.salvage) startSalvage(); if (M.fortify) startFort(); if (M.lane) startLane(); G.meteorOn = !!M.meteors; if (M.acid) startAcid(M.acid); if (M.twisters) startTwisters(M.twisters); G.acidSaid = false; G.fenceSaid = false; G.linkSaid = false; if (tide) { tide.y = tide.yT = M.tide[0]; WATER.y = tide.y; } if (M.ascend) setStage(0, true); clearWells(); G.eruptT = 8; G.freezes = 0; G.lavaT = 0; G.eruptions = 0; G.burrowUps = 0;
  if (M.defense) {
    G.core = new Reactor(scene, new V3(0, 0, 0), M.coreHp); G.friends.push(G.core);
    G.player.pos.set(0, 0, 22);
  }
  if (M.lane) {
    G.core = new Reactor(scene, new V3(LANE.home[0], 0, LANE.home[1]), M.coreHp); G.core.label = '基地'; G.friends.push(G.core);
    G.player.pos.set(LANE.home[0] - 24, 0, 0); cam.yaw = Math.PI / 2; G.player.aimYaw = cam.yaw;
  }
  if (M.maze) startMaze();
  if (M.glad) { startGlad(); G.player.pos.set(0, 0, -66); }
  if (M.hotfuse) startFuse();
  if (M.polar) { startPolar(); showHint('按 X 切换红 / 蓝极性 · 同色的子弹会被你吸收 · 打异色的敌机伤害更高', 4.5); }
  document.body.classList.toggle('polarmode', !!M.polar);
  if (M.turf) { startTurf(); G.player.pos.set(0, 0, -70); turfGarrison(); }
  if (M.meltdown) { startAtom(); G.player.pos.set(-30, 0, -96); atomGarrison(); }
  if (M.creep) { G.core = new Reactor(scene, new V3(0, 0, 0), M.coreHp); G.core.label = '净化塔'; G.core.foeW = 1.8; G.core.foeWAir = 1.8; G.core.foeWBoss = 4; G.friends.push(G.core); G.player.pos.set(0, 0, 24); startBio(); creepGarrison(); }
  if (M.tsunami) { startTsunami(); G.player.pos.set(40, 0, 0); cam.yaw = Math.PI / 2; G.player.aimYaw = cam.yaw; tsunamiGarrison(); }
  if (M.ctf) { startCTF(); G.player.pos.set(0, 0, 126); cam.yaw = 0; G.player.aimYaw = 0; ctfGarrison(); }
  if (M.factory) { startFactory(); G.player.pos.set(0, 0, 30); cam.yaw = 0; G.player.aimYaw = 0; factoryGarrison(); }
  if (M.decap) { startDecap(); G.player.pos.set(0, 0, 116); cam.yaw = 0; G.player.aimYaw = cam.yaw; decapGarrison(); }
  if (M.sabot) { startSabot(); G.player.pos.set(0, 0, 112); cam.yaw = 0; G.player.aimYaw = cam.yaw; sabotGarrison(); }
  if (M.rescue) { startEvac(); G.player.pos.set(EVAC.pad[0] + 16, 0, EVAC.pad[1] + 18); cam.yaw = 0.7; G.player.aimYaw = cam.yaw; }
  if (M.sky) { startSky(); G.player.pos.set(0, 0, 8); cam.yaw = 0; G.player.aimYaw = 0; }
  if (M.pursuit) { startPursuit(); G.player.pos.set(-136, 0, -30); cam.yaw = Math.atan2(-16, 30); G.player.aimYaw = cam.yaw; }
  if (M.lance) { startLance(); G.player.pos.set(0, 0, -20); cam.yaw = 0; G.player.aimYaw = 0; }
  if (M.beacon) {
    startBeacon(); const [gx, gz] = BEACON_GATES[0], [hx, hz] = BEACON_GATES[BEACON.n - 1], dl = Math.hypot(gx - hx, gz - hz);
    G.player.pos.set(gx - (gx - hx) / dl * 26, 0, gz - (gz - hz) / dl * 26); cam.yaw = Math.atan2(-(gx - hx), -(gz - hz)); G.player.aimYaw = cam.yaw;
  }
  if (M.convoy) {
    G.core = new Convoy(scene, M.path, M.coreHp); G.friends.push(G.core);
    G.player.pos.set(M.path[0][0] + 6, 0, M.path[0][1] - 9); cam.yaw = -Math.PI / 2; G.player.aimYaw = cam.yaw;
  }
  G.od = { k: 0, t: 0, ringT: 0, dur: OD.dur + (chipOn('cap') ? 3 : 0) }; G.odGain = (chipOn('cap') ? 1.4 : 1) * (G.player.frame.od || 1); G.hurtAt = -99;
  $('coreName').textContent = G.core ? (M.creep ? '净化塔 PURIFIER' : M.convoy ? '运输车 CONVOY' : M.lane ? '基地 HQ' : '反应堆 REACTOR') : '';
  if (wingOn()) { G.wing = new Wingman(scene, mctx, cfg.palette === 'kestrel' ? 'vanguard' : 'kestrel'); G.friends.push(G.wing); }
  run.coreLost = false; run.trainLost = false; run.depotLost = false; run.salvage = !!M.salvage; run.quota = M.quota || 0; run.fortify = !!M.fortify; run.hackSaid = false; run.decap = !!M.decap; run.dcT = 16; run.dcN = 0; run.vipLost = false; run.dcWarn = 0; run.sabot = !!M.sabot; run.sbT = 14; run.sbN = 0; run.sbBoss = false; run.orbLost = false; run.sbWarn = 0; run.rescue = !!M.rescue; run.rsT = 10; run.rsN = 0; run.rsCap = 5; run.rsBoss = false; run.civLost = false; run.sky = !!M.sky; run.skyW = 0; run.skyBreak = 5; run.skyT = 16; run.skyB = 12; run.cityLost = false; run.pursuit = !!M.pursuit; run.prsT = 10; run.prsN = 0; run.dataLost = false; run.lance = !!M.lance; run.factory = !!M.factory; run.ctf = !!M.ctf; run.flagLost = false; run.rpT = 7; run.sqT = 26; run.ctfSq = 0; run.raidSaid = false; run.fcT = 20; run.tsunami = !!M.tsunami; run.tsT = 18; run.tsN = 0; run.creep = !!M.creep; run.crT = 16; run.crN = 0; run.seedT = 14; run.glad = !!M.glad; run.turf = !!M.turf; run.hf = !!M.hotfuse; run.tfC = 0; run.tfT = 10; run.tfN = 0; run.tfLast = false; run.tfBoss = false; run.turfLost = false; run.gRound = -1; run.gT = 5; run.gBreak = false; run.gq = []; run.gRe = false; run.gN0 = 0; run.hypeLost = false; run.hypeMsg = ''; run.hypeMsgT = 0; run.meltdown = !!M.meltdown; run.mdT = 20; run.mdN = 0; run.blT = 10; run.meltLost = false; run.lcnT = 6; run.lcnN = 0; run.beacon = !!M.beacon; run.bcnT = 3; run.bcnN = 0; run.timeUp = false; run.lane = !!M.lane; run.laneT = 8; run.laneN = 0; run.shadeSaid = false; run.squadSaid = false; run.armorSaid = false;
  run.ring = M.storm ? { x: 0, z: 0, r: STORM.r0, x0: 0, z0: 0, r0: STORM.r0, x1: 0, z1: 0, r1: STORM.r0, t: 0, T: 1, wait: 0, outT: 0, said: false } : null; G.ring = run.ring; G.tether = null; G.blinkInv = 0; G.grapHits = 0; G.snaps = 0; G.blinks = 0; G.stormT = 0; run.tetherSaid = false;
  stormWall.visible = !!M.storm; stormNext.visible = false;
  run.extract = !!M.extract; run.dlN = 0; run.got = 0; run.evac = null; run.lateBoss = null;
  run.capture = !!M.capture; run.zones = M.capture ? makeZones(M.zones) : M.extract ? makeZones(M.zones, { R: 8, kind: 'cache' }) : []; run.up = 0; run.finalOn = false; run.trickT = 22; run.zoneWarnT = {}; run.spotC = null;
  Object.assign(run, { dropSaid: false, gauntlet: !!M.gauntlet, escort: !!M.convoy, stops: M.stops || [], driving: false, harT: 8, waitSaid: 0, wave: -1, defense: !!M.defense, coreWarnT: -99, coreLowSaid: false, breakT: 1.5, t: 0, over: false, deathT: 0, won: false, droneT: 0, cr: 0, msslT: 0, boss2: null, relayHintT: 0, waves: M.endless ? [] : M.waves, endless: !!M.endless });
  if (M.fortify) run.breakT = 9;
  G.boss = null; G.bosses = [];
  $('bossBox').classList.add('hidden');
}

function spot(minD, maxD, air, bearing) {
  const p = run.spotC || ((run.defense || run.escort) && G.core ? G.core.pos : G.player.pos);
  for (let i = 0; i < 300; i++) {
    const a = bearing === undefined || i > 200 ? Math.random() * Math.PI * 2 : bearing + (Math.random() - 0.5) * 2.1, r = minD + Math.random() * (maxD - minD);
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    if (Math.abs(x) > ARENA - 10 || Math.abs(z) > ARENA - 10) continue;
    if (PLAT.R && Math.hypot(x, z) > PLAT.R - 12) continue;
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
  if (run.ring) shrinkStorm(i);
  if (MISSIONS[cfg.mission] && MISSIONS[cfg.mission].ascend && i > 0) setStage(i, false);
  if (tide && MISSIONS[cfg.mission].tide) tide.yT = MISSIONS[cfg.mission].tide[Math.min(i, MISSIONS[cfg.mission].tide.length - 1)];
  if (run.endless) G.diff.hp = DIFFS[cfg.diff].hp * (1 + 0.05 * i) * (modOn('elite') ? 1.3 : 1);
  const S = W.spawn, R = run.defense ? 1.15 : 1;
  banner(W.title, W.sub, !!(S.boss || S.colossus || S.train || S.leviathan));
  sfx(S.boss ? 'alarm' : 'wave');
  // defense: the first group comes from one side; a second group follows from the opposite side
  const b0 = run.defense ? Math.atan2(G.player.pos.z, G.player.pos.x) + Math.PI * (0.5 + Math.random()) : run.escort && G.core ? G.core.heading() : undefined;
  const n0 = G.enemies.length;
  let goalZ = null;
  if (run.capture && W.at) { goalZ = attackZone(); run.spotC = goalZ.pos; }
  spawnGroup(S, R, b0);
  run.spotC = null;
  if ((run.capture || run.extract) && W.zoneDef) for (const z of run.zones) {
    const m0 = G.enemies.length;
    for (let k = 0; k < (W.zoneDef.turret || 0); k++) new Turret(zoneSpot(z, 4, 8));
    for (let k = 0; k < (W.zoneDef.walker || 0); k++) new Walker(zoneSpot(z, 3, 9));
    for (const e of G.enemies.slice(m0)) { e.goalP = z.pos; e.goalR = 7; }
  }
  if (goalZ) { for (const e of G.enemies.slice(n0)) if (GROUND.has(e.kind)) { e.goalP = goalZ.pos; e.goalR = 7; } showHint(`敌军目标：据点 ${goalZ.name}`, 3); }
  run.late = W.late || null; run.lateT = run.t + 20; run.lateB = b0 === undefined ? undefined : b0 + Math.PI;
  for (let k = 0; k < (S.relay || 0); k++) new Relay(relaySites[k].clone());
  G.bosses = [];
  if (S.train) {
    G.boss = G.train = new Train(TRACK, S.bossHp || 1); G.bosses.push(G.boss);
    $('bossName').textContent = G.boss.B.name; $('bossBox').classList.remove('hidden');
    sfx('alarm'); sfx('horn', 60);
  }
  if (S.leviathan) {
    G.boss = new Leviathan(spot(70, 100), S.bossHp || 1); G.bosses.push(G.boss);
    $('bossName').textContent = G.boss.B.name; $('bossBox').classList.remove('hidden');
    sfx('alarm');
  }
  if (S.colossus) {
    G.boss = new Colossus(spot(110, 140), S.bossHp || 1); G.bosses.push(G.boss);
    $('bossName').textContent = G.boss.B.name; $('bossBox').classList.remove('hidden');
    sfx('alarm');
  }
  if (S.boss) {
    G.boss = new Boss(spot(90 * R, 120 * R), mctx, S.boss, S.bossHp || 1); G.bosses.push(G.boss);
    run.boss2 = S.boss2 ? { type: S.boss2, hp: S.bossHp || 1, t: 0 } : null;   // the second boss drops in mid-fight
    $('bossName').textContent = BOSSES[S.boss].name;
    $('bossBox').classList.remove('hidden');
  }
}

// dropships enter from outside the arena, staggered by distance
function dropEntry(k, b) {
  const a = (b === undefined ? Math.random() * 6.28 : b) + (Math.random() - 0.5) * 1.4, r = ARENA + 30 + k * 45;
  return new V3(Math.cos(a) * r, 46 + Math.random() * 6, Math.sin(a) * r);
}
G.onDrop = (at, cg, ds, crashed) => {
  const ring = (i, n, r) => { const a = i / n * 6.283 + Math.random() * 0.5; const p = new V3(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r); return pointInSolid(new V3(p.x, 1, p.z), 3) ? at.clone() : p; };
  if (cg.boss) {
    const b = new Boss(at.clone(), mctx, cg.boss, cg.hp || 1);
    if (crashed) b.hp = b.maxHp * 0.7;
    G.boss = b; G.bosses = (G.bosses || []).concat([b]);
    $('bossName').textContent = BOSSES[cg.boss].name; $('bossBox').classList.remove('hidden');
    banner(crashed ? '暴君从残骸中走出' : '头目着陆', crashed ? `${BOSSES[cg.boss].name} · 带伤出场（70%）` : BOSSES[cg.boss].name, true); sfx('alarm');
    fx.trauma = Math.min(1, fx.trauma + 0.6);
    return;
  }
  let i = 0; const n = Object.values(cg).reduce((a, v) => a + v, 0);
  for (let k = 0; k < (cg.walker || 0); k++) new Walker(ring(i++, n, 4));
  for (let k = 0; k < (cg.bulwark || 0); k++) new Bulwark(ring(i++, n, 4));
  for (const t of Object.keys(RAIDERS)) for (let k = 0; k < (cg[t] || 0); k++) new Boss(ring(i++, n, 4), mctx, t, 1);
  for (let k = 0; k < (cg.drone || 0); k++) { const p = ring(i++, n, 3); p.y = 10; new Drone(p); }
  for (let k = 0; k < (cg.sapper || 0); k++) { const p = ring(i++, n, 3); p.y = 11; new Sapper(p); }
  for (let k = 0; k < (cg.crawler || 0); k++) new Crawler(ring(i++, n, 3));
};
G.onSpot = (e) => { if (!G.spotSaid) { G.spotSaid = true; showHint('被探照灯照到了 · 炮弹会落在你脚下的红圈 · 躲到掩体后挡住灯光、用干扰弹，或打掉灯塔头部的探照灯', 4.5); } };
G.onDeflDown = (f) => { if (!G.deflSaid) { G.deflSaid = true; showHint('偏导场过载 · 3 秒内实弹能打进去 · 持续射击会让磁场过载，贴进磁场里开火也不会被推偏', 4.5); } };
G.onTally = (k) => { save.tally[k] = (save.tally[k] || 0) + 1; };
G.onSquad = (n) => { if (!run.squadSaid) { run.squadSaid = true; showHint('友军坦克出发了 · 它们会沿兵线推进，攻击防御塔', 3); } };
G.onArmor = () => { if (!run.armorSaid) { run.armorSaid = true; showHint('防御塔装甲很厚 · 友军坦克在旁边时才能打出全额伤害 · 掩护坦克推进', 4); } };
G.onCitadelOpen = () => { fx.trauma = Math.min(1, fx.trauma + 0.5); };
G.onFortWork = (k) => { G.onTally('build'); sfx('wave'); showHint(k === 'build' ? '炮台已建成 · 它会自动射击敌机' : k === 'up' ? '炮台已升级 · 耐久提升、射速加快、加装导弹' : '炮台已修复', 2.5); };
G.onFortLost = () => { showHint('一座炮台被摧毁 · 基座空出来了，可以重建', 3); };
G.onHackGo = () => { if (!run.hackSaid) { run.hackSaid = true; showHint('劫控机飞向你的炮台 · 炮台看不见它，击落它', 4); } };
G.onHackStart = () => { banner('HIJACK', '劫控机正在入侵炮台 · 2 秒内打断它', true); };
G.onFortHack = () => { banner('炮台被劫持', '它在向你开火 · 击落劫控机即可夺回', true); sfx('warn'); };
G.onFortFree = () => { showHint('炮台已夺回', 2); };
G.onHackBreak = () => { showHint('入侵被打断', 1.6); };
G.onSalvDeliver = (n) => { G.onTally('salvage'); if (n === 1) showHint('核心已交付 · 继续击毁敌机回收核心', 3); };
G.onSalvPick = (n) => { if (n === 1 && !run.salvPickSaid) { run.salvPickSaid = true; showHint('拾取了回收核心 · 带回中央回收台（雷达上的绿圈）· 最多带 4 个，带得越多越慢', 5); } };
G.onSalvKnock = () => { showHint('重击打掉了一个核心 · 捡回来', 2); };
G.onScavSteal = () => { banner('STOLEN', '拾荒者偷走了一个核心 · 击落它就会掉出来', true); };
G.onScavExit = (e) => { if (e.load > 0) showHint(`拾荒者带着 ${e.load} 个核心飞向地图边缘 · 拦住它`, 3); };
G.onScavEscape = (e, n) => { if (n > 0) banner('LOST', `拾荒者带走了 ${n} 个核心`, true); };
G.onPlant = (t) => { banner('CHARGE', '油罐上被装了炸药 · 16 秒后爆炸 · 站到旁边 2 秒拆除', true); if (!G.plantSaid) { G.plantSaid = true; showHint('雷达上闪红的方块是炸药 · 落到它 5 m 内站 2 秒就能拆除（悬空 6 m 以上不算）', 5); } };
G.onDefuse = () => { banner('DEFUSED', '炸药已拆除'); };
G.onTankLost = () => { const D = G.depot; banner('TANK LOST', `一座油罐被炸毁 · 剩余 ${D.tanks.filter((t) => t.alive).length}/${D.tanks.length}`, true); };
G.onLamp = (n, N) => { banner('LAMP', n >= N ? '雾灯全部点亮 · 港口的雾散开了' : `雾灯 ${n}/${N} · 雾气退后、灯下 60 m 的敌机显示在雷达上`); };
G.onLurk = (e) => { if (!G.lurkSaid && state === 'play') { G.lurkSaid = true; showHint('货箱醒了——那是伏击者 · 离它 34 m 以上它会重新缩回箱子里 · 看见闪红光的货箱就先开火', 4); } };
G.onSupply = () => { if (!G.supplySaid) { G.supplySaid = true; showHint('补给箱正在伞降 · 地面金圈是落点 · 抢在敌人之前碰到它', 4); } };
G.onCrate = (k) => { banner('SUPPLY', k === 'repair' ? '补给 · 修理 +35%' : k === 'od' ? '补给 · 超载 +50%' : '补给 · 伤害强化 15 秒'); };
G.onEmpower = (e) => { if (!G.empSaid && state === 'play') { G.empSaid = true; showHint('一台敌机抢到了补给 · 金圈标记的敌机血量 ×1.5、伤害 ×1.4 · 优先解决它', 4); } };
G.onSnatch = () => { if (!G.snatchSaid) { G.snatchSaid = true; showHint('抢夺机抓走了补给箱 · 它要把箱子送给同伴 · 打爆它箱子就会掉下来', 4); } };
G.onJam = (k) => { if (!G.jamSaid2) { G.jamSaid2 = true; showHint('武器槽被缴械机锁死 4 秒 · 紫色光球会慢慢追你，侧向急闪就能甩开', 4); } };
G.onJamOrb = (sh) => { sh.react = Math.random() < 0.5; };
G.onRift = () => { if (!G.riftSaid) { G.riftSaid = true; showHint('穿过了传送门 · 同色的两扇门相连 · 子弹也能穿门，隔门开火打远处的敌人', 4); } };
G.onRiftMove = () => { if (state === 'play') showHint('传送门换位置了', 2); };
G.onRiftSpawn = (p) => { if (state !== 'play' || !run || run.over) return; if (Math.random() < 0.6) { for (let j = 0; j < 3; j++) new Crawler(new V3(p.x + (Math.random() - 0.5) * 4, 0, p.z + (Math.random() - 0.5) * 4)); } else new Walker(new V3(p.x, 0, p.z)); };
G.onLeech = () => { if (!G.leechSaid) { G.leechSaid = true; showHint('寄生体扑到背上了 · 它在吸你的能量 · 急闪（Shift）把它们全甩下去', 4); } };
G.onBolt = (k) => { if (k === 'strike') storm.k = 1; else if (k === 'lock' && !G.boltSaid) { G.boltSaid = true; showHint('雷击锁定 · 1.4 秒后闪电劈下 · 立刻落地，或躲进避雷塔的蓝色圈里', 4); } };
G.onFlare = () => { if (!G.flareSaid) { G.flareSaid = true; showHint('耀斑警报 · 3 秒后烈日灼烧一切不在阴影里的机甲 · 看地上的影子，躲到建筑背光的一侧（悬空太高也会暴露）', 5); } };
G.onQuake = () => { if (!G.quakeSaid) { G.quakeSaid = true; showHint('地震要来了 · 地裂会沿橙色线喷发（站在地面上才会被烧，悬空能躲）· 碎石落在红圈里', 4.5); } };
G.onMagnet = (c) => { if (!G.magSaid) { G.magSaid = true; showHint('电磁吊在通电 · 38 m 内的机甲会被吸到磁盘下，断电后废铁砸下（红圈）· 推进逃开，或者把敌人引过去', 5); } };
G.onHolo = (e) => { if (!G.holoSaid) { G.holoSaid = true; showHint('幻象机投出了全息无人机和两个镜像分身 · 幻象一碰就碎、子弹无害 · 真身躲在太阳方向 · 声呐能把幻象全部照没', 5); } };
G.onWindShift = () => { G.windShiftT = 3; if (!G.windSaid) { G.windSaid = true; showHint('风向 3 秒后改变 · 右上角箭头是风吹去的方向 · 空中被吹得最厉害，火箭和炮弹也会顺风偏', 4.5); } };
G.onBombRun = (e) => { if (!G.bombSaid && e.tg() === G.player) { G.bombSaid = true; showHint('飞艇在头顶投弹 · 红圈是每颗炸弹的落点，炸弹会顺风飘 · 侧向闪开或者打掉它', 4); } };
G.onFrozen = () => { if (!G.frozeSaid) { G.frozeSaid = true; showHint('被冻住了 · 冰弹会叠加寒冷，叠满就冻结 1 秒 · 躲开淡蓝色冰弹，或用冰墙挡住寒霜炮', 4.5); } };
G.onHole = () => { if (!G.holeSaid) { G.holeSaid = true; showHint('掉进冰窟了 · 冰水持续扣装甲并减速 · 看到冰面裂纹和红圈就跳开，悬停也能越过', 4.5); } };
G.onBlink = (e) => { if (!G.blinkSaid && e.lockOn === G.player) { G.blinkSaid = true; showHint('闪影 · 地上的紫红圈就是它要瞬移到的位置 · 转身对准，或在它现身前急闪离开 · 开火后它会停顿片刻', 4.5); } };
G.onHive = (e) => { if (!G.hiveSaid && G.player && e.c.distanceTo(G.player.pos) < 110) { G.hiveSaid = true; showHint('蜂巢 · 一次放出六架自爆无人机 · 优先打掉蜂巢，蜂群用高射炮或范围武器清', 4.5); } };
G.onFence = (e) => { if (!G.fenceSaid && G.player && e.c.distanceTo(G.player.pos) < 90) { G.fenceSaid = true; showHint('激光栅栏 · 两台栅栏机之间的红线马上横扫过来 · 起跳或推进越过它，绕到端头，或击毁其中一台', 4.5); } };
G.onFenceLink = () => { if (!G.linkSaid) { G.linkSaid = true; showHint('落单的栅栏机和另一台重新组网了', 3); } };
G.onDropWarn = () => { if (!run.dropSaid) { run.dropSaid = true; showHint('运输机正在降落投放 · 舱门打开前击落它，货物一起报废', 3.5); } };

function spawnGroup(S, R = 1, b) {
  for (let k = 0; k < (S.turret || 0); k++) new Turret((Math.random() < 0.45 && roofSpot(50, 150)) || spot(55, 140));
  for (let k = 0; k < (S.drone || 0); k++) new Drone(spot(70 * R, 140 * R, true, b));
  for (let k = 0; k < (S.walker || 0); k++) new Walker(spot(95 * R, 140 * R, false, b));
  for (let k = 0; k < (S.bulwark || 0); k++) new Bulwark(spot(95 * R, 130 * R, false, b));
  for (let k = 0; k < (S.gunship || 0); k++) new Gunship(spot(110 * R, 150 * R, true, b));
  for (let k = 0; k < (S.stalker || 0); k++) new Stalker(spot(80 * R, 130 * R, false, b));
  for (let k = 0; k < (S.mender || 0); k++) new Mender(spot(90 * R, 140 * R, true, b));
  for (let k = 0; k < (S.sapper || 0); k++) new Sapper(spot(90 * R, 140 * R, true, b));
  for (let k = 0; k < (S.jammer || 0); k++) new Jammer(spot(70 * R, 110 * R, true, b));
  for (let k = 0; k < (S.howitzer || 0); k++) new Howitzer(spot(115 * R, 150 * R, false, b));
  for (let k = 0; k < (S.warden || 0); k++) new Warden(spot(80 * R, 105 * R, false, b));
  for (let k = 0; k < (S.burrower || 0); k++) new Burrower(spot(60 * R, 100 * R, false, b));
  for (let k = 0; k < (S.grappler || 0); k++) new Grappler(spot(70 * R, 115 * R, true, b));
  for (let k = 0; k < (S.eel || 0); k++) new Eel(spot(60 * R, 100 * R, true, b));
  for (let k = 0; k < (S.shade || 0); k++) new Shade(spot(90 * R, 130 * R, true, b));
  for (let k = 0; k < (S.hijack || 0); k++) new Hijacker(spot(80 * R, 120 * R, true, b));
  for (let k = 0; k < (S.scav || 0); k++) new Scav(spot(80 * R, 130 * R, true, b));
  for (let k = 0; k < (S.planter || 0); k++) new Planter(spot(95 * R, 150 * R, false, b));
  for (let k = 0; k < (S.dazzler || 0); k++) new Dazzler(spot(55, 85, true, b));
  for (let k = 0; k < (S.pulsar || 0); k++) new Pulsar(spot(60 * R, 100 * R, false, b));
  for (let k = 0; k < (S.forklift || 0); k++) new Forklift(spot(50 * R, 90 * R, false, b));
  for (let k = 0; k < (S.swapper || 0); k++) new Swapper(spot(50, 85, true, b));
  for (let k = 0; k < (S.seeder || 0); k++) new Seeder(spot(50 * R, 90 * R, false, b));
  for (let k = 0; k < (S.bloater || 0); k++) new Bloater(spot(60, 95, true, b));
  for (let k = 0; k < (S.adaptor || 0); k++) new Adaptor(spot(50 * R, 90 * R, false, b));
  for (let k = 0; k < (S.sprayer || 0); k++) new Sprayer(spot(60 * R, 100 * R, false, b));
  for (let k = 0; k < (S.scrambler || 0); k++) new Scrambler(spot(55 * R, 85 * R, true, b));
  for (let k = 0; k < (S.dyad || 0); k++) spawnDyads(spot(60 * R, 90 * R, true, b));
  for (let k = 0; k < (S.raptor || 0); k++) new Raptor(spot(45 * R, 75 * R, false, b), false);
  for (let k = 0; k < (S.reviver || 0); k++) new Reviver(spot(60, 95, true, b));
  for (let k = 0; k < (S.weaver || 0); k++) new Weaver(spot(55 * R, 90 * R, false, b));
  for (let k = 0; k < (S.launcher || 0); k++) new Launcher(spot(70 * R, 110 * R, false, b));
  for (let k = 0; k < (S.torcher || 0); k++) new Torcher(spot(60 * R, 110 * R, false, b));
  for (let k = 0; k < (S.anchor || 0); k++) new Anchor(spot(70 * R, 120 * R, false, b));
  for (let k = 0; k < (S.engineer || 0); k++) new Engineer(spot(80 * R, 130 * R, false, b));
  for (let k = 0; k < (S.lurker || 0); k++) new Lurker(spot(30 * R, 90 * R, false, b));
  for (let k = 0; k < (S.snatcher || 0); k++) new Snatcher(spot(70 * R, 120 * R, false, b));
  for (let k = 0; k < (S.disarmer || 0); k++) new Disarmer(spot(70 * R, 115 * R, true, b));
  for (let k = 0; k < (S.leech || 0); k++) new Leech(spot(70 * R, 120 * R, true, b));
  for (let k = 0; k < (S.herald || 0); k++) new Herald(spot(80 * R, 120 * R, false, b));
  for (let k = 0; k < (S.leaper || 0); k++) new Leaper(spot(70 * R, 115 * R, false, b));
  for (let k = 0; k < (S.rammer || 0); k++) new Rammer(spot(80 * R, 125 * R, false, b));
  for (let k = 0; k < (S.deflector || 0); k++) new Deflector(spot(40 * R, 70 * R, true, b));
  for (let k = 0; k < (S.mirage || 0); k++) new Mirage(spot(45 * R, 80 * R, true, b));
  for (let k = 0; k < (S.blimp || 0); k++) new Airship(spot(60 * R, 110 * R, true, b));
  for (let k = 0; k < (S.frost || 0); k++) new Frostcaster(spot(55 * R, 100 * R, false, b));
  for (let k = 0; k < (S.watch || 0); k++) new Watchtower(spot(55 * R, 110 * R, false, b));
  for (let k = 0; k < (S.blinker || 0); k++) new Blinker(spot(60 * R, 100 * R, true, b));
  for (let k = 0; k < (S.hive || 0); k++) new Hive(spot(70 * R, 110 * R, true, b));
  for (let k = 0; k < (S.prism || 0); k++) new Prism(spot(80 * R, 130 * R, false, b));
  for (let k = 0; k < (S.fencer || 0); k++) { const s0 = spot(75 * R, 125 * R, true, b), a = new Fencer(s0); new Fencer(new V3(s0.x + 12, s0.y, s0.z + 4), a); }   // fencers come in linked pairs
  for (let k = 0; k < (S.skimmer || 0); k++) new Skimmer(spot(80 * R, 135 * R, false, b));
  for (let k = 0; k < (S.splitter || 0); k++) new Splitter(spot(75 * R, 125 * R, false, b), 0);
  for (let k = 0; k < (S.jet || 0); k++) { const a = (b === undefined ? Math.random() * 6.28 : b) + (Math.random() - 0.5) * 2, r = 230 + k * 30; new Jet(new V3(Math.cos(a) * r, 50, Math.sin(a) * r)); }
  const drops = (S.drops || []).concat(Array.from({ length: S.dropship || 0 }, () => ({ walker: 2 })));
  drops.forEach((cg, k) => new Dropship(dropEntry(k, b), cg, false));
  if (S.dropBoss) new Dropship(dropEntry(drops.length + 0.5, b), { boss: S.dropBoss, hp: S.bossHp || 1 }, true);
  for (let k = 0; k < (S.crawler || 0); k += 6) {   // crawlers come in packs of up to 6
    const c0 = spot(55 * R, 95 * R, false, b);
    for (let j = 0; j < Math.min(6, S.crawler - k); j++) { const a = Math.random() * 6.28, r = Math.random() * 4; new Crawler(new V3(c0.x + Math.cos(a) * r, 0, c0.z + Math.sin(a) * r)); }
  }
  for (const t of Object.keys(RAIDERS)) for (let k = 0; k < (S[t] || 0); k++) new Boss(spot(85 * R, 130 * R, false, b), mctx, t, 1);
}

G.onKill = (e) => {
  noteWreck(e); decaySpread(e); gladKill(e); turfKill(e);
  G.hud.kill = 0.3;
  const T = save.tally; T.all = (T.all || 0) + 1; T[e.kind] = (T[e.kind] || 0) + 1;
  if (e.isColossus) T.colossus = (T.colossus || 0) + 1;
  if (e.isLev) T.leviathan = (T.leviathan || 0) + 1;
  if (e.isTrain) T.train = (T.train || 0) + 1;
  if (e.type === 'echo') T.echo = (T.echo || 0) + 1;
  if (e.kind === 'dropship' && e.full) T.dropFull = (T.dropFull || 0) + 1;
  if (chipOn('leech') && G.player.alive) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.025);
  const cr = Math.round((KILL_CR[e.isTrain ? 'train' : e.kind] || 50) * DIFFS[cfg.diff].cr);
  run.cr += cr; G.hud.cr = 1.2; G.hud.crLast = cr;
  if (e.kind === 'bulwark' && Math.random() < 0.5) dropRepair(e.c);
  if (e.kind === 'gunship') dropRepair(e.c);
  if (e.kind === 'walker' && Math.random() < 0.6) dropRepair(e.c);
  else if (e.kind === 'drone' && Math.random() < 0.12) dropRepair(e.c);
  else if (e.kind === 'turret' && Math.random() < 0.2) dropRepair(e.c);
  if (e.kind === 'boss') { fx.trauma = 1; timeScaleT = 1.6; }
  if (G.salv && !run.finalOn) dropCores(e.c || e.pos, SALV.drops[e.kind] ?? 1);
  if (G.fort) G.fort.pts += FORT.pts[e.kind] ?? FORT.ptsDef;
  if (G.beacon && G.beacon.i > 0) beaconTime(BCN_SMALL.has(e.kind) ? 'small' : null);
  if (e.kind === 'tower') { fx.trauma = Math.min(1, fx.trauma + 0.6); const n = G.lane ? G.lane.towers.filter((x) => x.alive).length : 0; banner('防御塔已摧毁', n ? `还剩 ${n} 座 · 要塞护盾仍在` : '要塞护盾正在瓦解', false); sfx('repair'); }
  if (e.kind === 'courier') { G.courierUp = G.courier ? G.courier.up : 0; fx.trauma = Math.min(1, fx.trauma + 0.9); }
  if (e.kind === 'fab') { fx.trauma = Math.min(1, fx.trauma + 0.7); const n = G.factory ? G.factory.fabs.filter((x) => x.alive).length : 0; if (n) banner('制造厂已摧毁', `还剩 ${n} 座 · 这条传送带不再出兵`, false); sfx('repair'); }
  if (e.kind === 'dish') { fx.trauma = Math.min(1, fx.trauma + 0.6); const n = G.lance ? G.lance.dishes.filter((x) => x.alive).length : 0; if (n) banner('卫星天线已摧毁', `还剩 ${n} 座 · 光柱变慢变细了`, false); sfx('repair'); }
  if (e.kind === 'anchor' && !G.gravSaid0) { G.gravSaid0 = true; showHint('重力锁已击毁 · 紫色力场消失', 2); }
  if (e.kind === 'relay') { fx.trauma = Math.min(1, fx.trauma + 0.6); const n = G.enemies.filter((x) => x.kind === 'relay' && x.alive).length; banner('中继塔已摧毁', n ? `剩余 ${n} 座` : '全部中继塔已摧毁 · 清除残敌', false); }
};
G.onBossPhase = (b) => {
  banner(b.B.phase2[0], b.B.phase2[1], true); sfx('alarm');
  if (b.type === 'echo') { for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28; const q = new V3(b.pos.x + Math.cos(a) * 9, 0, b.pos.z + Math.sin(a) * 9); if (pointInSolid(q.clone().setY(1.5), 3)) q.copy(spot(30, 50)); new Boss(q, mctx, 'shard', 1); fx.flash(q.clone().setY(3), 0xff40e0, 40, 30, 0.4); fx.ring(q, null, 1, 10, 0.5, 0xff40e0); } return; }
  if (!b.isTrain) for (let k = 0; k < 3; k++) new Drone(spot(50, 90, true));
};
G.onRelayCall = (r) => {
  if (G.enemies.filter((e) => e.kind === 'drone' && e.alive).length >= 7) return;
  for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28; new Drone(new V3(r.pos.x + Math.cos(a) * 8, 15 + Math.random() * 4, r.pos.z + Math.sin(a) * 8)); }
  G.fx.ring(new V3(r.pos.x, 13.5, r.pos.z), null, 1, 10, 0.6, 0xff6040);
  if (!run.relayHintT || run.t - run.relayHintT > 40) { run.relayHintT = run.t; showHint('中继塔正在呼叫增援 · 优先摧毁中继塔', 2.5); }
};
G.onHint = (t, d) => showHint(t, d);
G.onMazeWarn = () => { if (!G.mzSaid) { G.mzSaid = true; showHint('黄色条纹处的墙 2.4 秒后升起 · 站在上面会被掀飞受伤 · 把敌人引过去', 5); } };
G.onCanopy = () => { if (!G.cnSaid) { G.cnSaid = true; showHint('激光天幕 · 飞到 11 m 以上会被灼烧 · 墙高 9 m，可以贴着墙顶翻过去', 4.5); } };
G.onPulseCharge = (e) => { if (!G.puSaid && e.c.distanceTo(G.player.pos) < 80) { G.puSaid = true; showHint('脉冲塔 · 核心橙色 = 低环，跳起越过 · 青色 = 高环，落地躲在下面 · 墙壁挡得住脉冲环', 5); } };
G.onSnipe = (e, tg) => { if (tg === G.player && !snipeSaid) { snipeSaid = true; showHint('狙击警报 · 隐形的潜猎者正在瞄准你 · 红线定住闪烁时立刻急闪，或打它打断瞄准', 4.5); } };
G.onEnemyMissile = () => { if (run.msslT <= 0) { sfx('warn'); run.msslT = 1; } };
G.onPlayerHit = () => {};
G.onAllyDown = () => { showHint(`僚机被击毁 · ${WING.respawn} 秒后重新空投`, 3); };
G.onAllyBack = () => { showHint('僚机已重新空投', 2.5); sfx('repair'); };
G.onCoreHit = () => {
  const c = G.core; if (!c) return;
  if (run.t - run.coreWarnT > 9) { run.coreWarnT = run.t; showHint(`${c.label}遭受攻击 · 剩余 ${Math.ceil(c.hp / c.maxHp * 100)}%`, 2.2); sfx('warn'); }
  if (!run.coreLowSaid && c.hp < c.maxHp * 0.3) { run.coreLowSaid = true; banner(c.label + '危急', '耐久低于 30%', true); sfx('alarm'); }
};
let timeScaleT = 0;
let odPressed = false;
function activateOD() {
  const p = G.player, o = G.od;
  if (!o || o.t > 0 || o.k < 1 || !p.alive || run.won) return;
  o.t = o.dur; o.k = 0; o.ringT = 0; o.uses = (o.uses || 0) + 1; G.pChill = 0; G.frozenT = 0;
  const c = p.center(new V3());
  G.curLabel = 'p-od'; explodeAt(c, 16, 160, 'P', 2.2, 0xffa040); G.curLabel = null;
  fx.ring(new V3(p.pos.x, 0.4, p.pos.z), null, 1, 22, 0.6, 0xffa040);
  fx.trauma = Math.min(1, fx.trauma + 0.6); timeScaleT = Math.max(timeScaleT, 0.45);
  p.en = p.maxEn; p.overheat = 0;
  banner('OVERDRIVE', '超载启动 · 伤害 ×1.4 · 受伤 −35% · 能量无限', false); sfx('od');
}
function updateOD(dt) {
  const o = G.od, p = G.player; if (!o || !(o.t > 0)) return;
  o.t = Math.max(0, o.t - dt);
  if (p.alive) {
    p.en = p.maxEn; p.overheat = 0;
    for (const k of ['R', 'L']) { const w = G.pw[k]; if (w.reloadT > 0) w.reloadT -= dt; }
    if (G.pw.S.cd > 0) G.pw.S.cd -= dt * 0.8;
    if (Math.random() < 0.5) fx.sparks(p.center(new V3()).add(new V3((Math.random() - 0.5) * 2, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 2)), { x: 0, y: 1, z: 0 }, 1, 0xffb050, 6, 0.8, 0.4, 0.22);
    o.ringT -= dt; if (o.ringT <= 0) { o.ringT = 0.55; fx.ring(new V3(p.pos.x, 0.3, p.pos.z), null, 1.5, 6, 0.4, 0xff9030); }
  }
  if (o.t <= 0) { showHint('超载结束', 1.6); sfx('odend'); }
}

function waveLogic(dt) {
  const p = G.player;
  if (run.over) return;
  run.t += dt;
  if (run.ring) stormLogic(dt);
  if (G.hf) G.hf.pause = run.breakT > 0 || !!run.won;
  if (G.polar) G.polar.pause = run.breakT > 0 || !!run.won;
  if (!p.alive) {
    if (!run.deathT) { run.deathT = 2.8; fx.explosion(p.center(new V3()), 2.6, 0xff8040); sfx('bigboom'); p.root.visible = false; banner('机体损毁', 'SYSTEM DOWN', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.core && !G.core.alive) {
    if (!run.deathT) { run.deathT = 3.2; run.coreLost = true; fx.trauma = 1; sfx('bigboom'); banner(G.core.label + '被摧毁', run.escort ? 'CONVOY LOST' : 'REACTOR LOST', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.decap && G.decap.lost) {
    if (!run.deathT) { run.deathT = 3.4; run.vipLost = true; sfx('alarm', 0); banner('目标已撤离', 'DECAPITATION FAILED', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.sabot && G.sabot.lost) {
    if (!run.deathT) { run.deathT = 3.4; run.orbLost = true; fx.trauma = 0.9; fx.flash(G.player.center(new V3()), 0xffe0c0, 300, 200, 0.6); sfx('bigboom', 0); banner('轨道炮充能完毕', 'SABOTAGE FAILED', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.evac && G.evac.lost >= EVAC.maxLost && G.evac.saved < EVAC.goal) {
    if (!run.deathT) { run.deathT = 3.2; run.civLost = true; fx.trauma = 0.6; sfx('alarm'); banner('平民伤亡过多', 'EVACUATION FAILED', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.sky && G.sky.lost) {
    if (!run.deathT) { run.deathT = 3.2; run.cityLost = true; fx.trauma = 1; sfx('bigboom'); banner('避难所全部被摧毁', 'CITY LOST', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.courier && G.courier.done) {
    if (!run.deathT) { run.deathT = 3.2; run.dataLost = true; fx.trauma = 0.6; sfx('alarm'); banner('情报已上传完毕', 'DATA LOST', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.turf && G.turf.lost) {
    if (!run.deathT) { const [a, b] = turfShare(); run.deathT = 3; run.turfLost = true; fx.trauma = 0.5; banner('地盘被抢走', `青色 ${Math.round(a * 100)}% · 洋红 ${Math.round(b * 100)}%`, true); sfx('alarm'); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.glad && G.glad.lost) {
    if (!run.deathT) { run.deathT = 3; run.hypeLost = true; fx.trauma = 0.6; banner('被轰下台', '观众冷场太久，把你赶出了角斗场', true); sfx('alarm'); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.ctf && G.ctf.lost >= CTF.foeNeed) {
    if (!run.deathT) { run.deathT = 3; run.flagLost = true; G.ctf.done = true; fx.trauma = 0.5; banner('旗帜失守', `敌方已 ${G.ctf.lost} 次把你的旗带回基地`, true); sfx('alarm'); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.atom && G.atom.melted) {
    if (!run.deathT) { run.deathT = 3.4; run.meltLost = true; fx.trauma = 1; fx.flash(new V3(0, 10, 0), 0x9cff3a, 400, 300, 0.8); sfx('bigboom', 0); banner('堆芯熔毁', 'MELTDOWN', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.depot && G.depot.lost) {
    if (!run.deathT) { run.deathT = 3.2; run.depotLost = true; fx.trauma = 1; banner('油罐全部被炸毁', 'DEPOTS LOST', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (G.train && G.train.escaped) {
    if (!run.deathT) { run.deathT = 3.2; run.trainLost = true; sfx('horn', 30); banner('装甲列车逃脱', 'TARGET ESCAPED', true); }
    run.deathT -= dt;
    if (run.deathT <= 0) finish(false);
    return;
  }
  if (run.escort && run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (run.breakT > 0) {
    run.breakT -= dt;
    if (run.breakT <= 0) {
      if (run.escort) { const nx = run.wave + 1; G.core.target = nx < run.stops.length ? run.stops[nx] : G.core.total; run.driving = true; if (nx > 0) showHint(nx < run.stops.length ? '运输车继续前进 · 跟紧车队' : '前往撤离点', 2.5); }
      else startWave(run.wave + 1);
    }
    return;
  }
  if (run.decap) { decapLogic(dt); return; }
  if (run.sabot) { sabotLogic(dt); return; }
  if (run.rescue) { rescueLogic(dt); return; }
  if (run.sky) { skyLogic(dt); return; }
  if (run.pursuit) { pursuitLogic(dt); return; }
  if (run.ctf) { ctfLogic(dt); return; }
  if (run.factory) { factoryLogic(dt); return; }
  if (run.tsunami) { tsunamiLogic(dt); return; }
  if (run.creep) { creepLogic(dt); return; }
  if (run.meltdown) { meltdownLogic(dt); return; }
  if (run.glad) { gladLogic(dt); return; }
  if (run.turf) { turfLogic(dt); return; }
  if (run.lance) { lanceLogic(dt); return; }
  if (run.beacon) { beaconLogic(dt); return; }
  if (run.lane) { laneLogic(dt); return; }
  if (run.salvage) { salvageLogic(dt); return; }
  if (run.capture) { captureLogic(dt); return; }
  if (run.extract) { extractLogic(dt); return; }
  if (run.driving) {
    const c = G.core, far = c.pos.distanceTo(p.pos) > 60;
    c.wait = far;
    if (far && run.t - run.waitSaid > 8) { run.waitSaid = run.t; showHint('运输车在等你 · 回到车队附近', 2.2); }
    run.harT -= dt;
    if (run.harT <= 0) {   // light harassment on the road
      run.harT = 13 + Math.random() * 5;
      if (G.enemies.filter((e) => e.alive && e.kind === 'drone').length < 4) { const b = c.heading(); for (let k = 0; k < 2; k++) new Drone(spot(60, 90, true, b)); }
    }
    if (c.d >= c.target - 0.06) {
      run.driving = false; c.wait = false;
      const nx = run.wave + 1;
      if (nx < run.waves.length) startWave(nx);
      else { run.won = true; banner('MISSION COMPLETE', '运输车安全抵达撤离点', false); sfx('wave'); run.deathT = 3.5; }
    }
    return;
  }
  const alive = G.enemies.filter((e) => !e.gone).length;
  run.msslT -= dt;
  if (run.late && (run.t > run.lateT || alive <= 2)) {
    spawnGroup(run.late, run.defense ? 1.15 : 1, run.lateB); run.late = null;
    banner('敌军增援', run.defense ? '从反应堆另一侧逼近' : run.escort ? '从车队后方逼近' : '更多敌机接近', true); sfx('warn');
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
    if (!run.endless && !run.escort && run.wave >= run.waves.length - 1) { if (!run.won) { run.won = true; banner('MISSION COMPLETE', '头目已击破', false); run.deathT = 3.5; } run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
    if (run.endless) { const b = Math.round(150 * (run.wave + 1) * DIFFS[cfg.diff].cr); run.cr += b; }
    G.boss = null; G.bosses = [];
    banner(run.gauntlet ? 'ROUND CLEAR' : run.waves[run.wave].spawn.relay ? 'OBJECTIVE CLEAR' : run.escort && run.wave >= run.waves.length - 1 ? 'AREA CLEAR' : 'WAVE CLEAR', run.endless ? `第 ${run.wave + 1} 波完成 · 弹药补满 · 修复 25% 装甲` : (G.noRepair ? '短暂整备 · 弹药补满' : '短暂整备 · 弹药补满 · 修复 25% 装甲'), false);
    sfx('repair');
    if (G.fort) { G.fort.pts += FORT.clear; showHint(`整备时间 · 工事点 +${FORT.clear} · 站上基座建造或升级炮台`, 4); }
    for (const k of ['R', 'L', 'S']) { const w = G.pw[k]; w.ammo = w.d.mag || 0; w.reloadT = 0; w.cd = 0; }
    const nx = run.waves[run.wave + 1], big = nx && (nx.spawn.boss2 || run.gauntlet);
    if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (big ? 0.5 : 0.25));
    if (big) showHint(nx.spawn.boss2 ? '下一波是双头目 · 已额外修复装甲' : '连战整备 · 修复 50% 装甲', 3);
    if (G.wing) G.wing.repair(0.4);
    if (run.gauntlet) G.od.k = Math.min(1, G.od.k + 0.35);
    if (G.core && G.core.alive) { G.core.hp = Math.min(G.core.maxHp, G.core.hp + G.core.maxHp * 0.15); if (G.core.hp > G.core.maxHp * 0.3) run.coreLowSaid = false; }
    run.breakT = run.gauntlet ? 6 : run.fortify ? 11 : 4.5;
  }
}

// ------------------------------------------------------------------ ion storm (shrinking safe zone)
// Each wave start picks a smaller circle inside the current one; after a short delay the wall closes in on it.
// Outside the wall the player takes damage that grows with how far out they are. Enemies are unaffected.
const STORM = { r0: 165, k: 0.72, minR: 44, wait: 9, dur: 32, dps: 20 };
const stormWall = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 128, 1, true).translate(0, 0.5, 0);
  const m = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; varying float vY; void main() { vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; varying vec2 vUv; varying float vY;
      void main() {
        float s = 0.5 + 0.5 * sin(vUv.x * 420.0 + vY * 9.0 - uT * 2.6);
        float s2 = 0.5 + 0.5 * sin(vUv.x * 150.0 - vY * 5.0 + uT * 1.3);
        float edge = exp(-vY * 30.0);
        float fade = 1.0 - smoothstep(0.35, 1.0, vY);
        vec3 c = mix(vec3(0.55, 0.22, 1.0), vec3(0.15, 1.0, 0.8), s * s2);
        gl_FragColor = vec4(c * (0.55 + 1.6 * edge), ((0.1 + 0.22 * s * s2) * fade + edge * 0.7));
      }` });
  const o = new THREE.Mesh(g, m); o.visible = false; o.frustumCulled = false; o.renderOrder = 5; scene.add(o); return o;
})();
const stormNext = (() => {
  const g = new THREE.RingGeometry(0.985, 1, 160).rotateX(-Math.PI / 2);
  const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe0f0ff).multiplyScalar(1.4), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  o.visible = false; o.renderOrder = 4; scene.add(o); return o;
})();
// ------------------------------------------------------------------ sky elevator: tether + collar rings sliding down, rising cloud
// puffs, a cloud sea that falls away below the deck, and the sky blended from stage to stage as the platform climbs
let asc = null;
const _ecA = new THREE.Color(), _ecB = new THREE.Color();
const lcol = (a, b, k) => _ecA.set(a).lerp(_ecB.set(b), k).getHex(), lnum = (a, b, k) => a + (b - a) * k;
function mixEnv(A, B, k) {
  return { top: lcol(A.top, B.top, k), hor: lcol(A.hor, B.hor, k), fog: [lnum(A.fog[0], B.fog[0], k), lnum(A.fog[1], B.fog[1], k)],
    hemi: [lcol(A.hemi[0], B.hemi[0], k), lcol(A.hemi[1], B.hemi[1], k), lnum(A.hemi[2], B.hemi[2], k)], sun: [lcol(A.sun[0], B.sun[0], k), lnum(A.sun[1], B.sun[1], k)],
    env: lnum(A.env, B.env, k), exp: lnum(A.exp, B.exp, k), dir: [0, 1, 2].map((i) => lnum(A.dir[i], B.dir[i], k)), disc: lnum(A.disc, B.disc, k),
    stars: lnum(+A.stars || 0, +B.stars || 0, k), earth: B.earth, cl: lnum(clOf(A), clOf(B), k) };
}
function buildAscent(group) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.4, metalness: 0.8 });
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 3600, 24, 1, true), metal));
  const glow = new THREE.MeshBasicMaterial({ color: 0x7fe8ff });
  for (let k = 0; k < 4; k++) group.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 3600, 0.45).translate(Math.cos(k * Math.PI / 2 + 0.4) * 5.6, 0, Math.sin(k * Math.PI / 2 + 0.4) * 5.6), glow));
  addSolid(0, 0, 11, 11, 400, 0, 'tether');
  const ringG = new THREE.TorusGeometry(6.8, 0.5, 8, 32).rotateX(Math.PI / 2), ringM = new THREE.MeshBasicMaterial({ color: 0x58d8ff });
  const rings = []; for (let i = 0; i < 16; i++) { const r = new THREE.Mesh(ringG, ringM); r.position.y = -360 + i * 45; group.add(r); rings.push(r); }
  const seaU = { uT: { value: 0 }, cA: { value: new THREE.Color(0xffffff) }, cB: { value: new THREE.Color(0x9fb4c8) }, cover: { value: 0.45 } };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: seaU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uT; uniform vec3 cA; uniform vec3 cB; uniform float cover; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){ vec2 p = vW.xz * 0.0016 + vec2(uT * 0.004, uT * 0.0025); float f = fbm(p);
        float m = smoothstep(cover - 0.12, cover + 0.18, f);
        vec3 c = mix(cB, cA, m * (0.75 + 0.25 * fbm(p * 3.0 + 7.0)));
        float d = length(vW.xz - cameraPosition.xz), fade = 1.0 - smoothstep(2400.0, 4400.0, d);
        gl_FragColor = vec4(c, fade); }` }));
  sea.position.y = -140; sea.renderOrder = -5; sea.frustumCulled = false; group.add(sea);
  const pm = new THREE.SpriteMaterial({ map: TEX.softTex, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  const puffs = [];
  const placePuff = (s, y) => { const a = Math.random() * 6.283, r = PLAT.R + 25 + Math.random() * 260; s.position.set(Math.cos(a) * r, y, Math.sin(a) * r); s.scale.setScalar(50 + Math.random() * 70); };
  for (let i = 0; i < 40; i++) { const s = new THREE.Sprite(pm); placePuff(s, -260 + Math.random() * 480); group.add(s); puffs.push(s); }
  asc = { rings, sea, seaU, pm, puffs, placePuff, v: 18, vT: 18, y: -140, yT: -140, puff: 1, puffT: 1, cA: new THREE.Color(0xffffff), cB: new THREE.Color(0x9fb4c8), cover: 0.45 };
}
function setStage(i, now) {
  const M = MISSIONS[cfg.mission], L = M.ascend, st = L[Math.min(i, L.length - 1)], E = ENVS[st.env];
  PHYS.g = st.g;
  if (now || !run.envCur) { applyEnv(E); run.envCur = E; run.envBl = null; }
  else run.envBl = { A: run.envCur, B: E, t: 0, T: 9 };
  if (!asc) return;
  asc.yT = st.y; asc.vT = st.v; asc.puffT = st.puff; asc.cA.set(st.cA); asc.cB.set(st.cB); asc.cover = st.cover;
  if (now) { asc.y = st.y; asc.v = st.v; asc.puff = st.puff; asc.seaU.cA.value.copy(asc.cA); asc.seaU.cB.value.copy(asc.cB); asc.seaU.cover.value = st.cover; }
}
function ascentLogic(dt) {
  if (!asc || !PLAT.R) return;
  const b = run.envBl;
  if (b) { b.t += dt; const k = Math.min(1, b.t / b.T), e = k * k * (3 - 2 * k), E = mixEnv(b.A, b.B, e); applyEnv(E); if (k >= 1) { run.envBl = null; run.envCur = b.B; } else run.envCur = E; }
  const k = Math.min(1, dt * 0.25);
  asc.y += (asc.yT - asc.y) * k; asc.v += (asc.vT - asc.v) * k; asc.puff += (asc.puffT - asc.puff) * k;
  asc.sea.position.y = asc.y; asc.pm.opacity = 0.5 * asc.puff;
  asc.seaU.cA.value.lerp(asc.cA, k); asc.seaU.cB.value.lerp(asc.cB, k); asc.seaU.cover.value += (asc.cover - asc.seaU.cover.value) * k; asc.seaU.uT.value += dt;
  for (const r of asc.rings) { r.position.y -= asc.v * dt; if (r.position.y < -360) r.position.y += 16 * 45; }
  for (const s of asc.puffs) { s.position.y -= asc.v * 1.6 * dt; if (s.position.y < -280) asc.placePuff(s, 220 + Math.random() * 60); }
}

function shrinkStorm(i) {
  const R = run.ring, last = i >= run.waves.length - 1;
  const r1 = Math.max(STORM.minR, R.r * (i === 0 ? 0.82 : STORM.k) * (last ? 0.85 : 1));
  const room = Math.max(0, R.r - r1) * 0.75, a = Math.random() * 6.28, m = Math.random() * room;
  let x1 = R.x + Math.cos(a) * m, z1 = R.z + Math.sin(a) * m;
  const lim = ARENA - r1 * 0.6; x1 = Math.max(-lim, Math.min(lim, x1)); z1 = Math.max(-lim, Math.min(lim, z1));
  Object.assign(R, { x0: R.x, z0: R.z, r0: R.r, x1, z1, r1, t: 0, T: STORM.dur * (last ? 0.8 : 1), wait: i === 0 ? 4 : STORM.wait });
  stormNext.visible = true; stormNext.position.set(x1, 0.25, z1); stormNext.scale.setScalar(r1);
  if (i > 0) showHint(`风暴将在 ${Math.round(R.wait)} 秒后收缩 · 白圈是下一个安全区`, 3);
}
function stormLogic(dt) {
  const R = run.ring, p = G.player;
  if (R.wait > 0) R.wait -= dt;
  else if (R.t < R.T) {
    R.t = Math.min(R.T, R.t + dt); const k = R.t / R.T, e = k * k * (3 - 2 * k);
    R.x = R.x0 + (R.x1 - R.x0) * e; R.z = R.z0 + (R.z1 - R.z0) * e; R.r = R.r0 + (R.r1 - R.r0) * e;
    if (R.t >= R.T) stormNext.visible = false;
  }
  stormWall.position.set(R.x, -1, R.z); stormWall.scale.set(R.r, 70, R.r); stormWall.material.uniforms.uT.value = G.time;
  const out = p.alive ? Math.hypot(p.pos.x - R.x, p.pos.z - R.z) - R.r : -1;
  R.out = out;
  if (out > 0) {
    hurtPlayer(STORM.dps * (1 + Math.min(2, out / 25)) * dt, 'storm'); G.stormT += dt; R.outT += dt;
    if (!R.said) { R.said = true; showHint('离子风暴 · 安全区外持续受伤，离得越远越痛 · 回到圈内', 3.5); }
    if (Math.random() < dt * 3) sfx('stormz', 0);
    if (Math.random() < 0.4) fx.sparks(p.center(new V3()).add(new V3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4)), null, 1, Math.random() < 0.5 ? 0xb080ff : 0x50ffd0, 9, 0.8, 0.25, 0.15);
  } else R.outT = 0;
}
G.onTether = () => { if (!run.tetherSaid) { run.tetherSaid = true; showHint('被钩锁拖拽 · 急闪（Shift）或跃迁挣断钢缆 · 也可以集火钩锁机', 4); } };

// ------------------------------------------------------------------ capture zones (uplink mission)
const ZONE_R = 13, CAP_T = 6, UP_RATE = 0.0045, GROUND = new Set(['walker', 'prism', 'bulwark', 'raider', 'turret', 'boss']);
const ZCOL = { P: 0x5fe3ff, E: 0xff4a3a, N: 0xe8e8e8 };
let zoneGroup = null;
const zoneKits = [];
function clearZones() {
  for (const o of zoneKits) scene.remove(o); zoneKits.length = 0;
  if (!zoneGroup) return;
  zoneGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  scene.remove(zoneGroup); zoneGroup = null;
}
function makeZones(list, o = {}) {
  const ZR = o.R || ZONE_R, kind = o.kind || 'zone';
  if (!o.append) { clearZones(); zoneGroup = new THREE.Group(); scene.add(zoneGroup); }
  const addM = (op) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  return list.map(([x, z], i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(ZR - 0.5, ZR, 72).rotateX(-Math.PI / 2), addM(0.9)); ring.position.set(x, 0.14, z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ZR, 48).rotateX(-Math.PI / 2), addM(0.07)); disc.position.set(x, 0.1, z);
    const prog = new THREE.Mesh(new THREE.RingGeometry(ZR - 2.4, ZR - 1.3, 72, 1, 0, 0.01).rotateX(-Math.PI / 2), addM(0.85)); prog.position.set(x, 0.16, z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.1, 70, 12, 1, true), addM(0.22)); beam.position.set(x, 35, z);
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.3, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.6, metalness: 0.4 })); pylon.position.set(x, 1.1, z); pylon.castShadow = true;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), addM(1)); lamp.position.set(x, 2.5, z);
    zoneGroup.add(ring, disc, prog, beam);
    if (kind === 'cache') {   // data terminal model (shared kit geometry: removed, never disposed)
      const q = Math.round(Math.random() * 4) % 4, m = cloneKit('F_Cache'); m.position.set(x, 0, z); m.rotation.y = q * Math.PI / 2;
      scene.add(m); zoneKits.push(m); addSolid(x, z, q % 2 ? 1.2 : 1.8, q % 2 ? 1.8 : 1.2, 2.4);
    } else zoneGroup.add(pylon, lamp);
    const Z = { name: o.names ? o.names[i] : 'ABC'[i], kind, R: ZR, x, z, pos: new V3(x, 0, z), k: kind === 'zone' ? -1 : 0, own: kind === 'zone' ? 'E' : 'N', pin: false, ein: 0, ring, disc, prog, beam, lamp, shownK: 9, col: -1 };
    paintZone(Z, 0);
    return Z;
  });
}
function paintZone(z, t) {
  const contest = z.pin && z.ein > 0;
  let base = z.own === 'P' ? ZCOL.P : z.own === 'E' ? ZCOL.E : ZCOL.N;
  if (z.kind === 'cache' && z.own !== 'P') base = z.pin ? (Math.sin(t * 8) > 0 ? 0xffd23a : 0xfff0a0) : z.k > 0 ? 0xffd23a : ZCOL.N;
  if (z.kind === 'evac') base = 0x6dff9a;
  const c = contest && Math.sin(t * 12) > 0 ? 0xffd23a : base;
  if (c !== z.col) { z.col = c; for (const m of [z.ring, z.disc, z.beam, z.lamp]) m.material.color.set(c); }
  z.beam.material.opacity = z.own === 'P' ? 0.3 : 0.18;
  z.disc.material.opacity = z.pin ? 0.13 : 0.07;
  const kk = Math.round(Math.abs(z.k) * 60) / 60;
  if (kk !== z.shownK) {
    z.shownK = kk; z.prog.geometry.dispose();
    z.prog.geometry = new THREE.RingGeometry(z.R - 2.4, z.R - 1.3, 72, 1, Math.PI / 2, Math.max(0.01, kk * Math.PI * 2)).rotateX(-Math.PI / 2);
  }
  z.prog.material.color.set(z.kind === 'evac' ? 0x6dff9a : z.k >= 0 ? ZCOL.P : ZCOL.E);
}
function zoneSpot(z, r0, r1) {
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0), q = new V3(z.x + Math.cos(a) * r, 0, z.z + Math.sin(a) * r);
    if (!pointInSolid(new V3(q.x, 1, q.z), 3)) return q;
  }
  return new V3(z.x, 0, z.z);
}
// counterattack target: a zone the player holds and is far from (else the nearest one)
function attackZone() {
  const p = G.player.pos; let best = null, bs = -1;
  for (const z of run.zones) { const d = Math.hypot(z.x - p.x, z.z - p.z) + (z.own === 'P' ? 400 : 0); if (d > bs) { bs = d; best = z; } }
  return best;
}
// ------------------------------------------------------------------ push the line (v44): squads roll out, the enemy sends waves
const LANE_WAVE = { t: 20, cap: 10 };
function laneWave(n, room) {
  const t = run.t;
  const S = t < 60 ? { walker: 2, drone: 2 } : t < 140 ? { walker: 3, drone: 2, bulwark: 1, shade: 1 } : { walker: 3, drone: 3, bulwark: 1, shade: 1, gunship: Math.random() < 0.4 ? 1 : 0 };
  for (const k of ['gunship', 'shade', 'bulwark', 'drone', 'walker']) { let tot = Object.values(S).reduce((a, v) => a + v, 0); while (tot > room && S[k] > (k === 'walker' ? 1 : 0)) { S[k]--; tot--; } }
  const at = (air) => {
    for (let i = 0; i < 40; i++) {
      const x = LANE.cit[0] - 18 - Math.random() * 10, z = (Math.random() - 0.5) * 44;   // behind the citadel
      if (!air && pointInSolid(new V3(x, 1, z), 3)) continue;
      return new V3(x, air ? groundAt(x, z, 99) + 10 + Math.random() * 5 : 0, z);
    }
    return new V3(LANE.cit[0] - 20, air ? 12 : 0, 0);
  };
  const n0 = G.enemies.length;
  for (let k = 0; k < (S.walker || 0); k++) new Walker(at(false));
  for (let k = 0; k < (S.bulwark || 0); k++) new Bulwark(at(false));
  for (let k = 0; k < (S.drone || 0); k++) new Drone(at(true));
  for (let k = 0; k < (S.gunship || 0); k++) new Gunship(at(true));
  for (let k = 0; k < (S.shade || 0); k++) new Shade(at(true));
  for (const e of G.enemies.slice(n0)) if (GROUND.has(e.kind) && G.core) { e.goalP = G.core.pos; e.goalR = 22; }
  if (S.shade && !run.shadeSaid) { run.shadeSaid = true; showHint('幽影（紫色光环）正在隐藏身边的敌机 · 隐身的敌机无法锁定，开火或靠近时现形 · 先击落幽影', 5); }
}
function laneLogic(dt) {
  const L = G.lane, p = G.player; if (!L) return;
  if (!L.cit.alive) {
    if (!run.won) { run.won = true; banner('MISSION COMPLETE', '敌方要塞已攻破', false); sfx('wave'); run.deathT = 3.5; }
    run.deathT -= dt; if (run.deathT <= 0) finish(true);
    return;
  }
  if (!run.finalOn && !L.towers.some((t) => t.alive)) {
    run.finalOn = true;
    const M = MISSIONS[cfg.mission];
    G.boss = new Boss(new V3(LANE.cit[0] + 26, 0, 0), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
    $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
    banner('要塞护盾已瓦解', '「暴君」从要塞出击 · 攻破要塞即可获胜', true); sfx('alarm'); run.laneT = Math.max(run.laneT, 30);
    if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
  }
  run.laneT -= dt;
  if (run.laneT <= 0) {
    run.laneT = LANE_WAVE.t; run.laneN++;
    const foes = G.enemies.filter((e) => e.alive && !e.dying && !e.isObjective && e.kind !== 'boss').length;
    if (LANE_WAVE.cap - foes >= 2) laneWave(run.laneN, LANE_WAVE.cap - foes);
  }
}

// ---- v45 beacon run director: squads appear around the gates ahead of you, engineers race on to weld turrets there
const BCN_SMALL = new Set(['drone', 'crawler', 'swarm', 'turret']);
function nearGate(i, air, r0 = 16, r1 = 34) {
  const B = G.beacon, g = B.gates[i % BEACON.n];
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0), x = g.x + Math.cos(a) * r, z = g.z + Math.sin(a) * r;
    if (Math.abs(x) > ARENA - 10 || Math.abs(z) > ARENA - 10) continue;
    if (!air && pointInSolid(new V3(x, 1, z), 3)) continue;
    return new V3(x, air ? groundAt(x, z, 99) + 9 + Math.random() * 7 : 0, z);
  }
  return new V3(g.x + 20, air ? 14 : 0, g.z);
}
function beaconSquad() {
  const B = G.beacon, k = B.i / BEACON.total, at = B.i + 2;
  const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss').length;
  if (foes >= 7) return;
  const engs = G.enemies.filter((e) => e.kind === 'engineer' && e.alive).length, n0 = G.enemies.length;
  for (let n = 0; n < 2; n++) new Drone(nearGate(at, true));
  new Walker(nearGate(at, false));
  if (k > 0.25) { if (Math.random() < 0.5) new Bulwark(nearGate(at + 1, false)); else new Walker(nearGate(at + 1, false)); }
  if (k > 0.45 && Math.random() < 0.55) new Gunship(nearGate(at + 1, true, 30, 50));
  if (k > 0.65) new Walker(nearGate(at, false));
  if (engs < 2 && run.bcnN % 2 === 0) new Engineer(nearGate(at, false, 20, 40));
  for (const e of G.enemies.slice(n0)) e.bcnBorn = run.t;
  run.bcnN++;
}
// ---- v51 decapitation director: four commanders (combat.js Marshal; one real, three holographic decoys) each with an escort
// walker and a dazzler; squads land beside the nearest unidentified commander (or the fleeing real one) every 20 s
function decapGarrison() {
  G.decap.ms.forEach((m, i) => { const w = new Walker(nearPt(m.pos.x, m.pos.z, false, 12, 24)); w.goalP = m.home; w.goalR = 18; if (i % 2 === 0) { const d = new Dazzler(nearPt(m.pos.x, m.pos.z, true, 18, 30)); d.home = m.home; } });
}
function dcFoes() { return G.enemies.filter((e) => e.alive && !e.dying && !e.hacked && e.kind !== 'marshal' && e.kind !== 'turret' && e.kind !== 'boss' && e.kind !== 'raider').length; }
function decapAnchor() {
  const S = G.decap, p = G.player;
  if (S.found && S.real && S.real.alive) return S.real.pos;
  let best = null, bd = 1e9; for (const m of S.ms) if (m.alive && !m.known) { const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z); if (d < bd) { bd = d; best = m.pos; } }
  return best || p.pos;
}
function decapSquad() {
  const a = decapAnchor(), cap = 7, f0 = dcFoes(); if (f0 >= cap) return;
  run.dcN++;
  new Walker(nearPt(a.x, a.z, false, 26, 44));
  if (f0 + 1 < cap) (run.dcN % 2 ? new Bulwark(nearPt(a.x, a.z, false, 28, 46)) : new Drone(nearPt(a.x, a.z, true, 30, 46)));
  if (run.dcN >= 2 && f0 + 2 < cap && G.enemies.filter((e) => e.kind === 'dazzler' && e.alive && !e.dying).length < 3) new Dazzler(nearPt(a.x, a.z, true, 30, 50));
}
function decapLogic(dt) {
  const S = G.decap; if (!S) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (S.real && !S.real.alive && !S.escaped) { run.won = true; banner('MISSION COMPLETE', `敌方指挥官被击毁 · 用时 ${Math.floor(run.t / 60)}:${String(Math.floor(run.t % 60)).padStart(2, '0')}`, false); sfx('wave'); run.deathT = 3.5; return; }
  if (!S.found) { const w = S.t > DECAP.alertAt - 15 ? 2 : S.t > DECAP.alertAt - 60 ? 1 : 0; if (w > run.dcWarn) { run.dcWarn = w; banner('指挥官起疑', w === 2 ? '15 秒后它会自行撤离' : '一分钟内找不出真身，它就会撤离', true); sfx('alarm'); } }
  run.dcT -= dt;
  if (run.dcT <= 0) { run.dcT = S.found ? 18 : 24; decapSquad(); }
}
G.onVipFound = (m, why) => {
  const P = G.player, d = Math.round(Math.hypot(G.decap.pad.x - m.pos.x, G.decap.pad.z - m.pos.z));
  banner('目标确认', why === 'alert' ? `指挥官起疑了 · 正赶往 ${d} m 外的运输机` : `真正的指挥官 · 正赶往 ${d} m 外的运输机`, true); sfx('alarm');
  showHint('干扰力场已失效 · 运输机 28 秒后在红色光柱处降落，登机要 7 秒 · 在那之前击毁它', 4);
  new Walker(nearPt(m.pos.x, m.pos.z, false, 14, 24));
};
G.onDecoyFound = (m) => { const S = G.decap, k = S.ms.filter((x) => !x.real && x.known).length; banner('全息诱饵', `${k}/${S.ms.length - 1} · 它要炸了，离远点`, true); if (!G.dcSaid) { G.dcSaid = true; showHint('诱饵被识破后会自爆并放出两架无人机 · 继续扫描下一台', 3.5); } };
G.onDecoyPop = (at) => { new Drone(nearPt(at.x, at.z, true, 4, 10)); new Drone(nearPt(at.x, at.z, true, 4, 10)); };
G.onVipBoard = () => { banner('目标正在登机', '7 秒内击毁它', true); sfx('alarm'); };
G.onVipGuard = (m) => { new Boss(nearPt(m.pos.x, m.pos.z, false, 16, 28), mctx, 'lancer', 0.7); showHint('指挥官呼叫了护卫机甲「枪骑兵」', 3); };
G.onDazzle = () => { sfx('hurt', 0); if (!G.dazSaid) { G.dazSaid = true; showHint('被眩惑机强光致盲 · 它亮起蓄力时把视线移开或躲到掩体后', 4); } };

// ---- v50 sabotage director: four pylons (combat.js updateSabot) each with a walker and a turret, a reviver from the start;
// squads land beside the pylon nearest to you every 18 s, a planted charge brings two walkers running; the Phantom comes
// once all four are down
function sabotGarrison() {
  G.sabot.gens.forEach((g, i) => { new Walker(nearPt(g.x, g.z, false, 14, 26)); new Turret(nearPt(g.x, g.z, false, 12, 22)); (i % 2 ? new Bulwark(nearPt(g.x, g.z, false, 16, 28)) : new Walker(nearPt(g.x, g.z, false, 14, 26))); });
  new Reviver(nearPt(0, -20, true, 0, 20));
}
function sabFoes() { return G.enemies.filter((e) => e.alive && !e.dying && !e.hacked && e.kind !== 'boss' && e.kind !== 'turret').length; }
function sabotSquad() {
  const S = G.sabot, p = G.player;
  let g = sabTarget(p.pos); if (!g) { let bd = 1e9; for (const k of S.gens) if (k.alive) { const d = Math.hypot(k.x - p.pos.x, k.z - p.pos.z); if (d < bd) { bd = d; g = k; } } }
  const ax = g ? g.x : 0, az = g ? g.z : 0, cap = 7, f0 = sabFoes();
  if (f0 >= cap) return;
  run.sbN++;
  new Walker(nearPt(ax, az, false, 26, 46));
  if (f0 + 1 < cap) (run.sbN % 2 ? new Bulwark(nearPt(ax, az, false, 30, 50)) : new Walker(nearPt(ax, az, false, 26, 46)));
  if (run.sbN >= 2 && f0 + 2 < cap) new Drone(nearPt(ax, az, true, 30, 48));
  const revs = G.enemies.filter((e) => e.kind === 'reviver' && e.alive && !e.dying).length;
  if (run.sbN >= 2 && revs < (S.done >= 2 ? 2 : 1) && f0 + 3 < cap) new Reviver(nearPt(ax, az, true, 40, 60));
}
function sabotLogic(dt) {
  const S = G.sabot; if (!S) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (S.done >= S.gens.length && run.sbBoss && !(G.boss && G.boss.alive)) { run.won = true; banner('MISSION COMPLETE', `四座能源塔全部摧毁 · 轨道炮剩余 ${Math.ceil(S.t)} 秒`, false); sfx('wave'); run.deathT = 3.5; return; }
  if (!run.sbBoss && S.done >= S.gens.length) {
    run.sbBoss = true; const M = MISSIONS[cfg.mission];
    G.boss = new Boss(nearPt(0, 0, false, 20, 40), mctx, 'phantom', M.bossHp || 1); G.bosses = [G.boss];
    $('bossName').textContent = BOSSES.phantom.name; $('bossBox').classList.remove('hidden');
    banner('能源塔全部炸毁', '「幻影」出击 · 击破它', true); sfx('alarm');
  }
  if (S.done < S.gens.length) {
    const w = S.t < 30 ? 3 : S.t < 60 ? 2 : S.t < 120 ? 1 : 0;
    if (w > run.sbWarn) { run.sbWarn = w; banner('轨道炮充能', `剩余 ${Math.ceil(S.t)} 秒 · 还有 ${S.gens.length - S.done} 座能源塔`, true); sfx('alarm'); }
  }
  run.sbT -= dt;
  if (run.sbT <= 0) { run.sbT = 16; if (!(G.boss && G.boss.alive)) sabotSquad(); }
}
G.onSabPlant = (g, c) => {
  if (!G.sabSaid) { G.sabSaid = true; showHint('炸药已安放 · 22 秒后引爆 · 敌方步行机会冲过去拆弹，守住它，引爆前离开 15 m', 4); }
  const f0 = sabFoes();
  for (let k = 0; k < 2; k++) if (f0 + k < 9) new Walker(nearPt(g.x, g.z, false, 36, 52));
};
G.onSabDefuse = () => { banner('炸药被拆除', '回去重新安放', true); };
G.onGenDown = (g) => { const S = G.sabot; if (S && S.done < S.gens.length) showHint(`能源塔被摧毁 · 还剩 ${S.gens.length - S.done} 座`, 2.5); };
G.onReviveStart = () => { if (!G.revSaid) { G.revSaid = true; showHint('复苏者正在重建残骸 · 打断它（短时间内造成大量伤害）或打碎地上的残骸', 4); } };
G.onCamo = (on) => { if (on && !G.camoSaid) { G.camoSaid = true; showHint('光学迷彩：10 m 外的敌人看不见你 · 开火命中后 0.8 秒现形', 3); } };

// ---- v49 evacuation director: civilians walk three roads to the pad (combat.js updateEvac); squads of weavers / walkers
// (later drones and gunships) land beside whoever is walking; the Tyrant comes at 26 saved
function rescueSquad() {
  const foes = G.enemies.filter((e) => e.alive && !e.dying && !e.hacked && e.kind !== 'boss').length;
  if (foes >= run.rsCap) return;
  const walk = evacWalking();
  let ax, az;
  if (walk.length) { const c = walk[Math.floor(Math.random() * walk.length)]; ax = c.pos.x; az = c.pos.z; }
  else { const r = EVAC.routes[Math.floor(Math.random() * 3)]; ax = r[1][0]; az = r[1][1]; }
  run.rsN++;
  new Weaver(nearPt(ax, az, false, 40, 60));
  if (foes + 1 < run.rsCap) new Walker(nearPt(ax, az, false, 40, 62));
  if (run.rsN >= 2 && foes + 2 < run.rsCap) new Drone(nearPt(ax, az, true, 34, 50));
  if (run.rsN >= 4 && foes + 3 < run.rsCap && Math.random() < 0.5) new Gunship(nearPt(ax, az, true, 50, 70));
  if (!G.rescueSaid) { G.rescueSaid = true; showHint('敌军正在接近平民 · 织网者（蜘蛛）会喷蛛网把人粘住', 3.5); }
}
function rescueLogic(dt) {
  const E = G.evac; if (!E) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (E.saved >= EVAC.goal && !(G.boss && G.boss.alive)) { run.won = true; banner('MISSION COMPLETE', `撤离 ${E.saved} 人 · 平民伤亡 ${E.lost}`, false); sfx('wave'); run.deathT = 3.5; return; }
  if (!run.rsBoss && E.saved >= 24) {
    run.rsBoss = true; const M = MISSIONS[cfg.mission];
    G.boss = new Boss(nearPt(EVAC.pad[0], EVAC.pad[1], false, 80, 100), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
    $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
    banner('「暴君」来袭', '击破它 · 撤离才能完成', true); sfx('alarm');
  }
  run.rsT -= dt;
  if (run.rsT <= 0) { run.rsT = G.boss && G.boss.alive ? 24 : 15; rescueSquad(); }
}
G.onCivGroup = () => { if (!G.civSaid) { G.civSaid = true; showHint('平民正从避难所出发 · 沿道路走向中央撤离点 · 掩护他们', 4); } };
G.onWebbed = () => { if (!G.webSaid) { G.webSaid = true; showHint('被蛛网粘住：移动变慢、无法悬停 · 急闪挣脱 · 爆炸和火焰能烧掉地上的蛛网', 4); } };
G.onHacked = () => { if (!G.hackSaid) { G.hackSaid = true; showHint('入侵成功 · 这台敌机倒戈 10 秒，会替你作战', 2.5); } };
G.onCivLost = () => { const E = G.evac; if (E && (E.lost <= 3 || E.lost % 3 === 0 || E.lost >= EVAC.maxLost - 3)) showHint(`一名平民遇难 · 伤亡 ${E.lost}/${EVAC.maxLost}`, 1.6); };
G.onShuttle = (st) => { if (st === 'down' && (G.shuttleSaid || 0) < 2) { G.shuttleSaid = (G.shuttleSaid || 0) + 1; showHint('救援穿梭机正在降落 · 撤离点的平民准备登机', 2.5); } };

// ---- v48 skyshield director: three waves of missile trucks (2 / 3 / 2 + the Tyrant); escorts every 20 s
const SKY_WAVES = [2, 3, 2];
function skySite(minD) {
  const p = G.player, opts = SKY.sites.filter((q) => Math.hypot(q[0] - p.pos.x, q[1] - p.pos.z) > minD);
  const q = (opts.length ? opts : SKY.sites)[Math.floor(Math.random() * (opts.length || SKY.sites.length))];
  return new V3(q[0], 0, q[1]);
}
function skyWave() {
  run.skyW++; const n = SKY_WAVES[run.skyW - 1];
  for (let k = 0; k < n; k++) new Launcher(skySite(80));
  if (run.skyW === SKY_WAVES.length) {
    const M = MISSIONS[cfg.mission];
    G.boss = new Boss(spot(70, 100), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
    $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
    banner(`第 ${run.skyW} 波 · 最后一波`, `${n} 辆导弹车 · 「暴君」压阵`, true); sfx('alarm');
  } else banner(`第 ${run.skyW} 波`, `${n} 辆导弹车正在进入阵地`, true);
}
function skySquad() {
  const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && e.kind !== 'launcher' && e.kind !== 'cruise').length;
  if (foes >= 3 || (G.boss && G.boss.alive)) return;   // the Tyrant is the last wave's escort
  const lns = G.enemies.filter((e) => e.kind === 'launcher' && e.alive), L = lns[Math.floor(Math.random() * lns.length)];
  const ax = L ? L.pos.x : G.player.pos.x + 60, az = L ? L.pos.z : G.player.pos.z;
  if (G.enemies.filter((e) => e.alive && e.kind === 'walker').length < 2) new Walker(nearPt(ax, az, false, 14, 30)); else new Drone(nearPt(ax, az, true, 16, 32));
  if (run.skyW >= 2 && foes <= 1 && Math.random() < 0.5) new Gunship(nearPt(ax, az, true, 30, 50));
}
function skyLogic(dt) {
  const S = G.sky, p = G.player; if (!S) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (run.skyBreak > 0) { run.skyBreak -= dt; if (run.skyBreak <= 0) skyWave(); return; }
  const lns = G.enemies.filter((e) => e.kind === 'launcher' && e.alive && !e.dying).length;
  if (!lns && !(G.boss && G.boss.alive)) {
    if (run.skyW >= SKY_WAVES.length) { run.won = true; banner('MISSION COMPLETE', `城市防空成功 · 避难所 ${S.shelters.filter((q) => q.alive).length}/3`, false); sfx('wave'); run.deathT = 3.5; }
    else { run.skyBreak = 8; banner('本波导弹车已全部摧毁', `第 ${run.skyW + 1} 波即将到来 · 装甲修复 30%`, false); sfx('wave'); if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3); }
    return;
  }
  run.skyT -= dt;
  if (run.skyT <= 0) { run.skyT = 20; skySquad(); }
  run.skyB -= dt;
  if (run.skyB <= 0) { run.skyB = 20; skyBarrage(run.skyW >= 3 ? 3 : 2); }
}
function skyBarrage(n) {   // bombers beyond the city edge: a salvo of cruise missiles from one side
  const live = G.sky.shelters.filter((q) => q.alive); if (!live.length) return;
  const a = Math.random() * Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const b = a + (k - (n - 1) / 2) * 0.12, pos = new V3(Math.cos(b) * (ARENA - 6), 30 + k * 2, Math.sin(b) * (ARENA - 6)), q = live[(k + Math.floor(Math.random() * 3)) % live.length];
    const dir = new V3(q.pos.x - pos.x, 0, q.pos.z - pos.z).normalize();
    G.queue.push({ label: 'barrage', t: k * 0.6, fn: () => { if (G.sky) new Cruise(pos, dir, q, null); } });
  }
  showHint(`巡航导弹从城外来袭 ×${n} · 雷达上的橙点`, 2.2);
}
G.onLaunchWarn = () => { if (!G.skySaid) { G.skySaid = true; showHint('导弹车停车架起发射架（红圈）· 在它发射前摧毁它', 3.5); } };
G.onCruise = () => { if (!G.cruiseSaid) { G.cruiseSaid = true; showHint('巡航导弹飞得很慢 · 可以锁定并击落 · 近防炮会自动拦截', 3.5); } };
G.onShelterHit = (q) => showHint(`避难所被导弹击中 · 还能承受 ${q.hits} 发`, 2);
G.onShelterLost = () => { fx.trauma = Math.min(1, fx.trauma + 0.6); const n = G.sky.shelters.filter((q) => q.alive).length; banner('一座避难所被摧毁', n ? `还剩 ${n} 座` : '', true); sfx('bigboom'); };

// ---- v47 pursuit director: squads block the road ahead of the courier; flame tanks from the second squad; the courier down = the Phantom comes for the data
function pursuitSquad() {
  const CP = G.courier, c = CP.c, path = COURIER.path, N = path.length;
  const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && e.kind !== 'courier').length;
  const room = 4 - foes; if (room <= 0) return;   // the cap counts single units, not squads
  const [ax, az] = path[(c.i + 1) % N], k = run.prsN;
  const list = ['walker', k % 2 ? 'torcher' : 'drone']; if (k >= 1) list.push(k % 2 ? 'walker' : 'torcher'); if (k >= 3 && Math.random() < 0.4) list.push('gunship');
  for (const kind of list.slice(0, room)) {
    const e = kind === 'walker' ? new Walker(nearPt(ax, az, false, 18, 36)) : kind === 'drone' ? new Drone(nearPt(ax, az, true, 16, 34))
      : kind === 'torcher' ? new Torcher(nearPt(ax, az, false, 8, 24)) : new Gunship(nearPt(ax, az, true, 30, 50));
    e.born = run.t;
  }
  run.prsN++;
}
function pursuitLogic(dt) {
  const CP = G.courier, p = G.player; if (!CP) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (!CP.c.alive) {
    if (!run.finalOn) {
      run.finalOn = true; const M = MISSIONS[cfg.mission];
      G.boss = new Boss(spot(60, 90), mctx, 'phantom', M.bossHp || 1); G.bosses = [G.boss];
      $('bossName').textContent = BOSSES.phantom.name; $('bossBox').classList.remove('hidden');
      banner('数据信使已击毁', `上传被截断在 ${Math.floor(CP.up)}% · 「幻影」赶来回收数据 · 击破它`, true); sfx('alarm');
      if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
    } else if (G.boss && !G.boss.alive) { run.won = true; banner('MISSION COMPLETE', '情报已截获', false); sfx('wave'); run.deathT = 3.5; }
    return;
  }
  run.prsT -= dt;
  if (run.prsT <= 0) { run.prsT = 22; pursuitSquad(); }
  run.prsW = (run.prsW || 0) - dt;
  if (run.prsW <= 0) {   // the chase leaves road blocks behind: escorts more than 90 m back for a while pull out
    run.prsW = 1;
    for (const e of G.enemies) if (e.alive && !e.dying && e.born !== undefined && run.t - e.born > 15 && e.c.distanceTo(p.pos) > 90) { e.alive = false; e.remove(); }
  }
}
G.onUpload = () => { if (!G.pursuitSaid) { G.pursuitSaid = true; showHint('信使在上传站停车上传 · 贴近 24 m 内能干扰它（上传变慢）· 打它的车尾', 4); } else showHint('信使开始上传！', 1.4); };
G.onCourierPanic = () => { const c = G.courier.c, foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && e.kind !== 'courier').length; for (let n = 0; n < Math.min(2, 7 - foes); n++) new Drone(nearPt(c.pos.x, c.pos.z, true, 14, 26)).born = run.t; showHint('信使放出烟幕并加速 · 呼叫了无人机护航', 2.4); };
G.onCourierNet = () => showHint('信使被捕获网缠住 · 车速大减', 1.6);

// ---- v46 sunlance director: squads guard the uplink dishes; grav-locks walk in from 40 s; all three dishes down = the beam is yours
function nearPt(x0, z0, air, r0 = 16, r1 = 34) {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0), x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
    if (Math.abs(x) > ARENA - 10 || Math.abs(z) > ARENA - 10) continue;
    if (!air && pointInSolid(new V3(x, 1, z), 3)) continue;
    return new V3(x, air ? groundAt(x, z, 99) + 9 + Math.random() * 7 : 0, z);
  }
  return new V3(x0 + 20, air ? 14 : 0, z0);
}
function lanceSquad() {
  const L = G.lance, live = L.dishes.filter((d) => d.alive);
  const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && !e.isObjective).length;
  if (foes >= 7) return;
  const p = G.player, near = live.length ? live.reduce((a, b) => (Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) ? a : b)) : null;
  const ax = near ? near.pos.x : p.pos.x, az = near ? near.pos.z : p.pos.z, k = run.lcnN;
  let room = 7 - foes; const ok = () => room-- > 0;
  if (k >= 1 && G.enemies.filter((e) => e.kind === 'anchor' && e.alive).length < 2 && ok()) new Anchor(nearPt(p.pos.x, p.pos.z, false, 55, 80));
  if (ok()) new Walker(nearPt(ax, az, false, 18, 36));
  for (let n = 0; n < 2; n++) if (ok()) new Drone(nearPt(ax, az, true, 20, 40));
  if (k >= 2 && ok()) { if (Math.random() < 0.5) new Bulwark(nearPt(ax, az, false, 24, 44)); else new Walker(nearPt(ax, az, false, 24, 44)); }
  if (k >= 3 && Math.random() < 0.5 && ok()) new Gunship(nearPt(ax, az, true, 30, 50));
  run.lcnN++;
}
function lanceLogic(dt) {
  const L = G.lance, p = G.player; if (!L) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (L.hijack) {
    if (!run.finalOn) {
      run.finalOn = true; const M = MISSIONS[cfg.mission];
      G.boss = new Boss(spot(70, 100), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
      new Anchor(nearPt(G.boss.pos.x, G.boss.pos.z, false, 16, 30)); new Bulwark(nearPt(G.boss.pos.x, G.boss.pos.z, false, 16, 30));
      for (let n = 0; n < 2; n++) new Drone(nearPt(G.boss.pos.x, G.boss.pos.z, true, 14, 30));
      $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
      banner('轨道炮已夺取', '光柱变成青色，正在追烧敌机 · 「暴君」亲自来夺 · 击破它', true); sfx('alarm');
      if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
    } else if (G.boss && !G.boss.alive && !G.enemies.some((e) => e.alive && !e.dying && e.kind === 'anchor')) { run.won = true; banner('MISSION COMPLETE', '轨道炮阵地已攻陷', false); sfx('wave'); run.deathT = 3.5; }
    return;
  }
  run.lcnT -= dt;
  if (run.lcnT <= 0) { run.lcnT = run.lcnN === 0 ? 14 : 20; lanceSquad(); }
}
// ---- v53 assembly line director: each fabricator has a turret guard; fabricators build the waves; drones / gunships top up the air
// ---- v61 capture-the-flag director: a garrison at the enemy base, raptors from the enemy base every ~12 s (2 alive,
// one more per capture; 1 raider, 2 after the first capture), squads every ~24 s while fewer than 9 are up; two
// captures bring the Tyrant to guard the red flag; three captures win
const CTF_SQ = [{ drone: 2, crawler: 3 }, { walker: 1, crawler: 4 }, { bulwark: 1, drone: 2 }, { walker: 1, drone: 1, crawler: 3 }];
function ctfMake(kind, at) {
  if (kind === 'walker') return new Walker(at); if (kind === 'drone') return new Drone(at); if (kind === 'crawler') return new Crawler(at);
  if (kind === 'bulwark') return new Bulwark(at); if (kind === 'raptor') return new Raptor(at, false);
}
function ctfReinforce() {   // every capture: the enemy base digs in a bit more
  const [x, z] = CTF.bases.E, n = G.ctf ? G.ctf.caps : 1;
  new Turret(new V3(x + (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10), 0, z + 8 + Math.random() * 6));
  new Walker(nearPt(x, z + 14, false, 6, 18));
  if (n >= 1) new Bulwark(nearPt(x, z + 20, false, 4, 12));
}
function ctfGarrison() {
  const [x, z] = CTF.bases.E;
  for (const dx of [-14, 14]) new Turret(new V3(x + dx, 0, z + 6));
  for (let k = 0; k < 2; k++) new Walker(nearPt(x, z + 12, false, 6, 16));
  new Walker(nearPt(0, 0, false, 10, 30)); new Drone(nearPt(0, -40, true, 20, 40));
  new Raptor(nearPt(x, z, false, 6, 14), false);
}
function ctfLogic(dt) {
  const S = G.ctf; if (!S) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (S.caps >= CTF.need) { S.done = true; run.won = true; banner('MISSION COMPLETE', `夺旗 ${S.caps} : ${S.lost}`, false); sfx('wave'); run.deathT = 3.5; return; }
  const raps = G.enemies.filter((e) => e.kind === 'raptor' && e.alive && !e.dying), raiders = raps.filter((e) => e.raid).length;
  const wantN = run.finalOn ? 2 : 2 + Math.min(1, S.caps), wantRaid = S.caps >= 1 ? 2 : 1;
  run.rpT -= dt;
  if (run.rpT <= 0) {
    if (raps.length < wantN || raiders < wantRaid) {
      run.rpT = 10; const [x, z] = CTF.bases.E;
      if (raps.length >= wantN) { const h = raps.find((e) => !e.raid); if (h) h.raid = true; }
      else new Raptor(nearPt(x, z, false, 6, 16), raiders < wantRaid);
      if (!run.raidSaid && raiders < wantRaid) { run.raidSaid = true; showHint('迅猛机出发去偷你的旗 · 它们沿三条大道跑 · 盯住雷达上的蓝旗', 3.5); }
    } else run.rpT = 3;
  }
  run.sqT -= dt;
  if (run.sqT <= 0 && !run.finalOn) {
    run.sqT = 28;
    const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && e.kind !== 'turret').length;
    if (foes < 8) { const Q = CTF_SQ[run.ctfSq++ % CTF_SQ.length], at = spot(55, 85); for (const k in Q) for (let j = 0; j < Q[k]; j++) ctfMake(k, nearPt(at.x, at.z, k === 'drone', 4, 14)); }
  }
  if (S.caps >= 2 && !run.finalOn) {
    run.finalOn = true; const M = MISSIONS[cfg.mission], [x, z] = CTF.bases.E;
    G.boss = new Boss(nearPt(x, z, false, 10, 20), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
    $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
    banner('「暴君」守住了敌旗', '再夺一次就赢 · 头目就在敌方基地', true); sfx('alarm');
    if (!G.noRepair) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.25);
  }
}
function factoryGarrison() {
  for (const f of G.factory.fabs) { new Turret(new V3(f.pos.x + f.dir * 4, 6.3, f.pos.z + 3.2)); new Walker(nearPt(f.pos.x + f.dir * 20, f.pos.z, false, 6, 16)); }
  for (let n = 0; n < 2; n++) new Drone(nearPt(0, -30, true, 30, 50));
}
function factoryLogic(dt) {
  const F = G.factory, p = G.player; if (!F) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (!F.fabs.some((f) => f.alive)) {
    if (!run.finalOn) {
      run.finalOn = true; const M = MISSIONS[cfg.mission];
      G.boss = new Boss(spot(70, 100), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
      new Forklift(nearPt(G.boss.pos.x, G.boss.pos.z, false, 16, 30));
      $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
      banner('生产线已停摆', '三座制造厂全部摧毁 · 「暴君」亲自出击 · 击破它', true); sfx('alarm');
      if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
    } else if (G.boss && !G.boss.alive) { run.won = true; banner('MISSION COMPLETE', '工厂已瘫痪', false); sfx('wave'); run.deathT = 3.5; }
    return;
  }
  run.fcT -= dt;
  if (run.fcT <= 0) {
    run.fcT = 24; F.seq++;
    const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && !e.isObjective).length;
    if (foes < 7) { new Drone(nearPt(p.pos.x, p.pos.z, true, 40, 60)); if (F.seq >= 3 && Math.random() < 0.4 && !G.enemies.some((e) => e.kind === 'gunship' && e.alive)) new Gunship(nearPt(p.pos.x, p.pos.z, true, 50, 70)); }
  }
}
// ---- v54 tsunami director: each pump has a turret and a walker; squads (with swappers) come every ~22 s from the east
// ---- v55 hive creep director: each node starts with crawlers and a seeder; seeders keep coming from the nodes (up to
// three alive), squads every ~20 s while fewer than 7 enemies are up; all nodes down and the Phantom drops in
// ---- v57 coliseum director: five rounds; each round's fighters walk out of the four gates a few at a time and one more
// batch joins when about a third are left; 7 s breaks between rounds (the crowd calms down, 10 % repair); round five is
// the champion, the Tyrant, with an adaptor at its side; the round is won when the champion falls
const GLAD_ROUNDS = [
  { t: 'ROUND 1', sub: '热身 · 爬虫与无人机 · 换着武器击杀，观众更兴奋', s: [['crawler', 8], ['drone', 3], ['walker', 2]], re: [['crawler', 4], ['walker', 1], ['drone', 2]] },
  { t: 'ROUND 2', sub: '适应者登场 · 它的装甲会适应你最常用的伤害类型 · 换一种武器打它', s: [['adaptor', 1], ['walker', 3], ['drone', 3], ['crawler', 4]], re: [['crawler', 4], ['walker', 1]] },
  { t: 'ROUND 3', sub: '重装 · 护盾坦克与破城锤 · 把它们引进火焰喷口', s: [['bulwark', 2], ['rammer', 1], ['walker', 2], ['crawler', 6]], re: [['drone', 3], ['crawler', 4]] },
  { t: 'ROUND 4', sub: '两台适应者 + 跃击者', s: [['adaptor', 2], ['leaper', 2], ['walker', 1], ['drone', 3]], re: [['crawler', 5], ['walker', 2]] },
  { t: 'CHAMPION', sub: '冠军「暴君」入场 · 别让观众冷场', s: [['boss', 1], ['walker', 1]], re: [['drone', 1], ['crawler', 4]] },
];
function gladMake(kind, gi) {
  const at = gladGate(gi, kind === 'drone');
  if (kind === 'crawler') return new Crawler(at); if (kind === 'drone') return new Drone(at); if (kind === 'walker') return new Walker(at);
  if (kind === 'scrambler') return new Scrambler(at); if (kind === 'sprayer') return new Sprayer(at); if (kind === 'adaptor') return new Adaptor(at); if (kind === 'bulwark') return new Bulwark(at); if (kind === 'rammer') return new Rammer(at); if (kind === 'leaper') return new Leaper(at);
  if (kind === 'boss') { const M = MISSIONS[cfg.mission]; G.boss = new Boss(at, mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss]; $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden'); return G.boss; }
}
function gladQueue(list) { let gi = Math.floor(Math.random() * 4), t = 0.6; for (const [k, n] of list) for (let j = 0; j < n; j++) { run.gq.push({ k, gi: gi++ % 4, t }); t += 0.55; } }
function gladLogic(dt) {
  const A = G.glad, p = G.player; if (!A) return;
  run.hypeMsgT -= dt;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  for (let i = run.gq.length - 1; i >= 0; i--) { const q = run.gq[i]; q.t -= dt; if (q.t <= 0) { gladMake(q.k, q.gi); run.gq.splice(i, 1); } }
  const last = GLAD_ROUNDS.length - 1;
  if (run.gRound < 0 || run.gBreak) {
    run.gT -= dt;
    if (run.gT <= 0) {
      run.gRound++; run.gBreak = false; A.calm = false; const R = GLAD_ROUNDS[run.gRound];
      banner(R.t, R.sub, run.gRound === last); sfx(run.gRound === last ? 'alarm' : 'wave');
      gladQueue(R.s); run.gRe = false; run.gN0 = R.s.reduce((a, b) => a + b[1], 0);
    }
    return;
  }
  const foes = G.enemies.filter((e) => e.alive && !e.dying && !e.hacked).length + run.gq.length;
  if (run.gRound === last) {
    if (G.boss && !G.boss.alive && !run.gq.some((q) => q.k === 'boss')) { run.won = true; banner('MISSION COMPLETE', '冠军倒下 · 全场起立', false); sfx('wave'); run.deathT = 3.5; return; }
  }
  if (!run.gRe && foes <= Math.ceil(run.gN0 * 0.35)) { run.gRe = true; gladQueue(GLAD_ROUNDS[run.gRound].re); }
  if (run.gRound === last && run.gRe) { run.gT -= dt; if (run.gT <= 0) { run.gT = 25; if (foes < 5) gladQueue([['crawler', 4]]); } }   // the champion keeps getting company
  if (foes === 0 && run.gRe && run.gRound < last) {
    run.gBreak = true; run.gT = 7; A.calm = true;
    if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.1);
    banner(`第 ${run.gRound + 1} 轮结束`, `观众人气 ${Math.round(A.h)}% · 下一轮 7 秒后开始`, false);
  }
}
const HYPE_WHY = { vary: '换武器', air: '空中击杀', multi: '连杀', trap: '火焰陷阱' };
G.onHype = (v, why) => { if (!run.glad) return; run.hypeMsg = `+${Math.round(v)}` + (HYPE_WHY[why] ? ' ' + HYPE_WHY[why] : ''); run.hypeMsgT = 1.6; if (why === 'trap' && !G.trapSaid) { G.trapSaid = true; showHint('观众最爱看敌人被火焰喷口烧死 · 人气 +8', 3); } };
G.onFrenzy = () => { if (run.glad) { banner('全场沸腾', `人气 ${GLAD.frenzy}% 以上 · 伤害 ×${GLAD.fdmg} · 观众会扔修理包下来`, false); sfx('wave'); } };
G.onBooed = () => { if (run.glad) { banner('观众在喝倒彩', `人气跌到 ${GLAD.booed}% 以下 · 他们开始往场里扔东西 · 快去击杀`, true); if (!G.booSaid) { G.booSaid = true; showHint(`人气归零 ${GLAD.zeroT} 秒就会被轰下台 · 换着武器击杀、空中击杀、连杀涨得最快`, 5); } } };
G.onAdapt = (e) => { if (!G.adSaid) { G.adSaid = true; showHint(`适应者的装甲适应了「${ADAPT.cn[e.res]}」伤害（只吃 25%）· 换一种类型的武器打它：动能 / 爆炸 / 能量`, 5); } };
G.onCrowdDrop = () => { if (!G.cdSaid) { G.cdSaid = true; showHint('观众扔下了修理包（绿色）', 3); } };
// ---- v56 meltdown director: crawlers and a walker guard the pumps, a bloater is already drifting; squads every 22 s
// while fewer than 6 are up, bloaters every 15 s (up to 3); starting a pump calls a squad to it; all four pumps
// restarted and the Tyrant comes for the plant
function atomGarrison() {
  for (const [x, z] of ATOM.pumps) { for (let j = 0; j < 2; j++) new Crawler(nearPt(x, z, false, 10, 18)); new Walker(nearPt(x, z, false, 12, 22)); }
  new Bloater(nearPt(40, 30, true, 10, 30)); new Drone(nearPt(0, 40, true, 20, 40));
}
// ---- v58 turf war director: two sprayers, a walker and crawlers start across the arena; a squad every 14 s while fewer
// than 9 are up (sprayers / crawlers / walkers / drones / a shield tank in rotation); the Tyrant comes at 2:30; the last
// 30 s paint 1.5x wider; when the clock runs out the side with more floor wins
function turfGarrison() {
  for (let j = 0; j < 2; j++) new Sprayer(nearPt(0, 90, false, 0, 30));
  new Walker(nearPt(0, 80, false, 0, 24)); for (let j = 0; j < 3; j++) new Crawler(nearPt(0, 70, false, 0, 24));
}
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function turfLogic(dt) {
  const T = G.turf; if (!T) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  run.tfC += dt; const left = TURF.dur - run.tfC, M = MISSIONS[cfg.mission];
  if (!run.tfLast && left <= TURF.last) { run.tfLast = true; T.mul = TURF.lastK; banner('最后 30 秒', '你的涂装半径 ×1.5 · 全力抢地盘', true); sfx('alarm'); }
  if (!run.tfBoss && run.tfC >= TURF.bossAt) {
    run.tfBoss = true; G.boss = new Boss(spot(70, 100), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
    $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
    banner('「暴君」入场', '它走过的地方都会变洋红 · 击破它炸开 24 m 青色', true); sfx('alarm');
  }
  if (left <= 0) {
    const [a, b] = turfShare();
    if (a > b) { run.won = true; banner('MISSION COMPLETE', `青色 ${Math.round(a * 100)}% · 洋红 ${Math.round(b * 100)}%`, false); sfx('wave'); run.deathT = 3.5; }
    else T.lost = true;
    return;
  }
  run.tfT -= dt;
  if (run.tfT <= 0) {
    run.tfT = 14;
    const live = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss'), spr = live.filter((e) => e.kind === 'sprayer').length;
    if (live.length < 8 && !(G.boss && G.boss.alive)) {
      const k = run.tfN++ % 4, at = () => spot(55, 95);
      if (k === 0) { if (spr < 2) new Sprayer(at()); for (let j = 0; j < 3; j++) new Crawler(at()); }
      else if (k === 1) { new Walker(at()); for (let j = 0; j < 2; j++) new Crawler(at()); new Drone(spot(50, 80, true)); }
      else if (k === 2) { if (spr < 2) new Sprayer(at()); new Bulwark(at()); }
      else { new Walker(at()); for (let j = 0; j < 3; j++) new Crawler(at()); }
    }
  }
}
// ---- v59 hot fuse hints
G.onFuse = (ev, h) => {
  if (!G.hf) return;
  if (ev === 'armP') showHint('💣 炸弹挂在你身上 · 贴近敌机 7 m 内把它传出去', 2.6);
  else if (ev === 'armE') showHint('💣 炸弹挂在一台敌机身上 · 它会冲过来塞给你 · 拉开距离', 2.6);
  else if (ev === 'back') showHint('💣 炸弹又回到你身上了', 1.6);
  else if (ev === 'safe') showHint('💣 场上没有敌机可传 · 炸弹已解除', 2);
  else if (ev === 'boomE' && G.hf.lastKn) showHint(`💥 炸弹炸毁 ${G.hf.lastKn} 台 · 共 ${G.hf.kills} 台`, 1.6);
};
// ---- v61 capture-the-flag hints
G.onCTF = (ev, f) => {
  const S = G.ctf; if (!S) return;
  if (ev === 'grab') { showHint('🚩 拿到敌旗 · 带回你的蓝色基地（移速 ×0.85）', 2.6); sfx('charge', 0); }
  else if (ev === 'return') { showHint('你的旗已送回基地', 1.8); sfx('charge', 0); }
  else if (ev === 'cap') { ctfReinforce(); banner(`夺旗 ${S.caps} / ${CTF.need}`, S.caps < CTF.need ? '敌旗回到了对方基地 · 再去夺' : '敌方基地失守', false); sfx('wave'); if (!G.noRepair) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.15); }
  else if (ev === 'stolen') { banner('你的旗被夺走了', '迅猛机正带着它跑回敌方基地 · 击毁携旗者', true); sfx('alarm'); }
  else if (ev === 'lost') { banner(`失守 ${S.lost} / ${CTF.foeNeed}`, '敌方把你的旗带回了基地 · 旗已归位', true); sfx('alarm'); }
  else if (ev === 'drop') showHint(f.team === 'P' ? '携旗者被击毁 · 碰一下落地的旗就能送回' : '敌旗掉了 · 20 秒内捡回来', 2.4);
  else if (ev === 'needHome') showHint('先夺回你的旗，才能得分', 2);
  else if (ev === 'reset') showHint(f.team === 'P' ? '你的旗自动归位' : '敌旗自动归位', 1.6);
};
// ---- v60 polarity hints
G.onPolar = (ev, e) => {
  if (ev === 'warn') banner('POLARITY WAVE', '3 秒后敌机极性全部翻转', true);
  else if (ev === 'flip') showHint('⚡ 极性翻转 · 敌机全部换色', 1.6);
  else if (ev === 'boss' && e) showHint(`「暴君」换成${e.pol === 'R' ? '红' : '蓝'}色`, 1.4);
};
G.onDyad = (ev) => {
  if (ev === 'sweep' && !G.dySaid) { G.dySaid = true; showHint('双子机拉着光索扫过来 · 切成光索的颜色就能穿过去，或跳过 / 躲开', 3); }
  else if (ev === 'rebuild') showHint('双子机重建了同伴 · 两台要在 8 秒内一起击毁', 2.4);
};
G.onScramble = () => { if (!G.scrSaid) { G.scrSaid = true; showHint('⇄ 被扰频机干扰 · 方向暂时反转 · 躲到掩体后或在它蓄力时打断', 3); } };
function meltdownLogic(dt) {
  const A = G.atom, p = G.player; if (!A) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  run.blT -= dt;
  if (run.blT <= 0) { run.blT = run.finalOn ? 20 : 15; if (G.enemies.filter((e) => e.kind === 'bloater' && e.alive && !e.dying).length < (run.finalOn ? 2 : 3)) new Bloater(spot(60, 95, true)); }
  if (A.fixed >= A.pumps.length) {
    if (!run.finalOn) {
      run.finalOn = true; const M = MISSIONS[cfg.mission];
      G.boss = new Boss(spot(70, 100), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
      $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
      banner('堆芯正在冷却', '四台冷却泵全部重启 · 「暴君」来夺取核电站 · 击破它', true); sfx('alarm');
      if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
    } else if (G.boss && !G.boss.alive) { run.won = true; banner('MISSION COMPLETE', '核电站已冷停堆', false); sfx('wave'); run.deathT = 3.5; }
    return;
  }
  const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && e.kind !== 'bloater').length;
  run.mdT -= dt;
  if (run.mdT <= 0) {
    run.mdT = 18; const k = run.mdN++ % 4;
    if (foes < 8) {
      const open = A.pumps.filter((q) => !q.fixed), q = open[run.mdN % open.length], at = () => nearPt(q.x, q.z, false, 14, 26);
      if (k === 0) { for (let j = 0; j < 3; j++) new Crawler(at()); new Drone(nearPt(p.pos.x, p.pos.z, true, 40, 60)); }
      else if (k === 1) { new Walker(at()); new Crawler(at()); }
      else if (k === 2) { new Bulwark(at()); new Drone(nearPt(p.pos.x, p.pos.z, true, 40, 60)); }
      else { new Walker(at()); for (let j = 0; j < 2; j++) new Crawler(at()); }
    }
  }
}
G.onPumpStart = (q) => { if (run.meltdown && G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss').length < 9) { for (let j = 0; j < 2; j++) new Crawler(nearPt(q.x, q.z, false, 22, 32)); new Walker(nearPt(q.x, q.z, false, 26, 36)); } if (!G.pmSaid) { G.pmSaid = true; showHint(`站在冷却泵旁（离地 6 m 以内）${ATOM.fixT} 秒重启它 · ${ATOM.contR} m 内有地面敌机时进度暂停，离开会慢慢退回`, 4.5); } };
G.onPumpFixed = (q, A) => { const n = A.pumps.length - A.fixed; if (n) banner('冷却泵已重启', `堆芯升温变慢 · 还剩 ${n} 台`, false); };
G.onDose = () => { showHint('你站在辐射区里 · 剂量越高受伤越重，超过 100 rad 还会掉装甲 · 飞高一点辐射就弱，去洗消台（蓝灯）洗掉', 5); };
G.onSick = () => { banner('辐射病', '剂量超过 100 rad · 每秒掉装甲 · 去洗消台', true); sfx('alarm'); };
G.onAtomHot = () => { banner('堆芯温度 75%', '熔毁在即 · 抓紧重启冷却泵', true); sfx('alarm'); };
G.onBloatHunt = () => { if (!G.blSaid) { G.blSaid = true; showHint('胀辐球吸饱了辐射，正冲向你 · 在它靠近前打爆它（会就地炸开并留下辐射坑）', 4); } };
function creepGarrison() {
  for (const nd of G.bio.nodes) { for (let j = 0; j < 2; j++) new Crawler(nearPt(nd.pos.x, nd.pos.z, false, 10, 18)); }
  new Seeder(nearPt(G.bio.nodes[0].pos.x, G.bio.nodes[0].pos.z, false, 10, 16)); new Drone(nearPt(0, -40, true, 20, 40));
}
function creepLogic(dt) {
  const B = G.bio, p = G.player; if (!B) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  const live = B.nodes.filter((n) => n.alive);
  if (!live.length) {
    if (!run.finalOn) {
      run.finalOn = true; const M = MISSIONS[cfg.mission];
      G.boss = new Boss(spot(70, 100), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
      $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
      banner('菌毯正在退去', '三座菌巢全部摧毁 · 「暴君」来回收虫巢样本 · 击破它', true); sfx('alarm');
      if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
    } else if (G.boss && !G.boss.alive) { run.won = true; banner('MISSION COMPLETE', '虫巢已清除', false); sfx('wave'); run.deathT = 3.5; }
    return;
  }
  const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && !e.isObjective && e.kind !== 'tumor').length;
  run.seedT -= dt;
  if (run.seedT <= 0) {
    run.seedT = 20;
    const seeders = G.enemies.filter((e) => e.kind === 'seeder' && e.alive && !e.dying).length;
    if (seeders < 3) { const nd = live[Math.floor(Math.random() * live.length)]; new Seeder(nearPt(nd.pos.x, nd.pos.z, false, 9, 15)); }
  }
  run.crT -= dt;
  if (run.crT <= 0) {
    run.crT = 24; const k = run.crN++ % 4;
    if (foes < 6) {
      const nd = live[run.crN % live.length], at = () => nearPt(nd.pos.x, nd.pos.z, false, 10, 22);
      if (k === 0) { for (let j = 0; j < 3; j++) new Crawler(at()); new Drone(nearPt(p.pos.x, p.pos.z, true, 40, 60)); }
      else if (k === 1) { new Walker(at()); new Crawler(at()); }
      else if (k === 2) { new Bulwark(at()); new Drone(nearPt(p.pos.x, p.pos.z, true, 40, 60)); }
      else { for (let j = 0; j < 3; j++) new Crawler(at()); new Drone(nearPt(p.pos.x, p.pos.z, true, 40, 60)); }
    }
  }
}
G.onCreepCore = () => { banner('菌毯碰到净化塔', '净化塔正在被侵蚀 · 打掉前沿的菌瘤，或摧毁它所属的菌巢', true); sfx('alarm'); };
G.onCreepP = () => { if (!G.cpSaid) { G.cpSaid = true; showHint('站在菌毯上 · 减速 30%、每秒掉 8 装甲，敌机在上面会回血 · 跳起来或悬停就没事', 4.5); } };
G.onNodeDown = (nd, B) => { G.fx.trauma = Math.min(1, G.fx.trauma + 0.7); const n = B.nodes.filter((x) => x.alive).length; if (n) banner('菌巢已摧毁', `它的菌毯正在退去 · 还剩 ${n} 座`, false); sfx('repair'); };
G.onSeedDig = () => { if (!G.sdSaid) { G.sdSaid = true; showHint(`播种者在菌毯前沿钻地（绿色波纹）· ${SEED.dig} 秒内打它 ${SEED.brk} 伤害就能打断`, 4); } };
G.onTumor = () => { if (!G.tmSaid) { G.tmSaid = true; showHint('播种者种下了菌瘤 · 菌毯从这里继续往外长，菌瘤还会吐孢子 · 打掉它菌毯就退回去', 4); } };
function tsunamiGarrison() {
  for (const pm of G.tsu.pumps) { new Turret(new V3(pm.pos.x + 3.2, 5.0, pm.pos.z + 3.2)); new Walker(nearPt(pm.pos.x + 22, pm.pos.z, false, 6, 16)); }
  new Swapper(nearPt(-40, 0, true, 10, 30)); new Drone(nearPt(0, 40, true, 20, 40));
}
function tsunamiLogic(dt) {
  const T = G.tsu, p = G.player; if (!T) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (!T.pumps.some((f) => f.alive)) {
    if (!run.finalOn) {
      run.finalOn = true; const M = MISSIONS[cfg.mission];
      G.boss = new Boss(spot(70, 100), mctx, 'tyrant', M.bossHp || 1); G.bosses = [G.boss];
      $('bossName').textContent = BOSSES.tyrant.name; $('bossBox').classList.remove('hidden');
      banner('海面已平息', '三台潮汐泵全部摧毁 · 「暴君」从海上登陆 · 击破它', true); sfx('alarm');
      if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
    } else if (G.boss && !G.boss.alive) { run.won = true; banner('MISSION COMPLETE', '港口城保住了', false); sfx('wave'); run.deathT = 3.5; }
    return;
  }
  run.tsT -= dt;
  if (run.tsT <= 0) {
    run.tsT = 22; const k = run.tsN++ % 4;
    const foes = G.enemies.filter((e) => e.alive && !e.dying && e.kind !== 'boss' && !e.isObjective).length;
    if (foes < 7) {
      const at = () => nearPt(p.pos.x + 40 + Math.random() * 30, p.pos.z + (Math.random() - 0.5) * 60, false, 0, 20);
      if (k === 0) { new Walker(at()); new Drone(nearPt(p.pos.x, p.pos.z, true, 40, 60)); }
      else if (k === 1) { new Swapper(nearPt(p.pos.x - 40, p.pos.z, true, 0, 20)); for (let j = 0; j < 3; j++) new Crawler(at()); }
      else if (k === 2) { new Bulwark(at()); new Drone(nearPt(p.pos.x, p.pos.z, true, 40, 60)); }
      else { new Swapper(nearPt(p.pos.x - 40, p.pos.z, true, 0, 20)); new Walker(at()); }
    }
  }
}
G.onTsuWarn = (T) => { if (!G.twSaid) { G.twSaid = true; showHint(`巨浪警报 · ${TSU.warn} 秒后从西边海上涌来，浪高 ${T.h} m · 飞到浪头之上，或躲上足够高的屋顶`, 5); } };
G.onTsuHit = () => { if (!G.thSaid) { G.thSaid = true; showHint('被巨浪卷住了 · 浪里每秒掉装甲并被一路推着走 · 往上飞出浪头', 4); } };
G.onPumpDown = (pm, T) => { G.fx.trauma = Math.min(1, G.fx.trauma + 0.7); const n = T.pumps.filter((x) => x.alive).length; if (n) banner('潮汐泵已摧毁', `浪高降到 ${T.h} m · 浪间隔 ${T.per} 秒 · 还剩 ${n} 台`, false); sfx('repair'); };
G.onSwapLock = () => { if (!G.slSaid) { G.slSaid = true; showHint('交换机在锁定你（紫色连线）· 1.2 秒内打它 220 伤害或躲到掩体后就能断开', 4); } };
G.onSwap = () => { if (!G.swSaid) { G.swSaid = true; showHint('位置被交换了 · 交换机会把你丢到靠海的一侧，它自己会晕 1.5 秒、受伤 ×1.5', 4); } };
function tbAuto(slot, d) { const B = G.tbeams.find((b) => b.owner === G.player && b.slot === slot && b.st === 'hold'); return B ? B.t < 0.9 : d < 40; }
G.onPressWarn = () => { if (!G.pwSaid) { G.pwSaid = true; showHint('液压机 · 红色闪烁 1.6 秒后砸下 · 站在传送带上会被一路推着走，留意脚下', 4.5); } };
G.onForkPop = () => { if (!G.fpSaid) { G.fpSaid = true; showHint('油桶在叉子上被打爆了 · 装卸机举着油桶时受伤 ×1.5，累计 150 就会炸到自己', 4); } };
G.onLanceOn = () => { if (!G.lanceSaid) { G.lanceSaid = true; banner('轨道激光已锁定你', '红色光柱会一路追着你烧 · 飞得再高也躲不开 · 摧毁卫星天线让它变慢', true); } };
G.onLanceWarn = (drop) => showHint(drop ? '光柱在你前方落下 · 绕开红圈' : '光柱即将冲刺 · 横向躲开它的冲刺方向', 1.6);
G.onLanceHijack = () => { fx.trauma = Math.min(1, fx.trauma + 0.8); sfx('repair'); };

function beaconLogic(dt) {
  const B = G.beacon, p = G.player; if (!B) return;
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); return; }
  if (B.t <= 0 && !run.timeUp) { run.timeUp = true; run.deathT = 3.2; fx.trauma = 0.6; banner('时间耗尽', 'TIME UP', true); sfx('alarm'); }
  if (run.timeUp) { run.deathT -= dt; if (run.deathT <= 0) finish(false); return; }
  run.bcnFar = (run.bcnFar || 0) - dt;
  if (run.bcnFar <= 0) {   // squads you have left far behind give up the chase (turrets and engineers stay put)
    run.bcnFar = 1;
    for (const e of G.enemies) if (e.alive && !e.dying && e.pos && e.kind !== 'boss' && e.kind !== 'turret' && e.kind !== 'engineer' && run.t - (e.bcnBorn ?? run.t) > 18 && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) > 110) { e.alive = false; e.remove(); G.withdrawn = (G.withdrawn || 0) + 1; }
  }
  if (B.done) {
    if (!run.finalOn) {
      run.finalOn = true; const M = MISSIONS[cfg.mission];
      const g = B.gates[3]; G.boss = new Boss(new V3(g.x, 0, g.z), mctx, 'phantom', M.bossHp || 1); G.bosses = [G.boss];
      $('bossName').textContent = BOSSES.phantom.name; $('bossBox').classList.remove('hidden');
      banner('全部信标已通过', `「幻影」追来了 · 在 ${Math.ceil(B.t)} 秒内击破它（击毁敌机仍然加时）`, true); sfx('alarm');
      if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
    } else if (G.boss && !G.boss.alive) { run.won = true; B.won = true; banner('MISSION COMPLETE', `信标冲刺完成 · 剩余 ${B.t.toFixed(1)} 秒`, false); sfx('wave'); run.deathT = 3.5; }
    return;
  }
  if (B.i === 0) return;   // the clock and the squads start at the first gate
  run.bcnT -= dt;
  if (run.bcnT <= 0) { run.bcnT = 11; beaconSquad(); }
}
G.onGate = (i, done) => {
  sfx('coin'); fx.trauma = Math.min(1, fx.trauma + 0.15);
  if (i === 1) { banner('计时开始', `下一道信标门在青色光柱下 · 每过一门 +${BEACON.add} 秒`, false); run.bcnT = 1; new Turret(nearGate(3, false, 10, 18)); new Engineer(nearGate(2, false, 24, 40)); }
  else if (!done) showHint(i === BEACON.n ? `第二圈 · 炮台还在原地 · +${BEACON.add} 秒` : `信标 ${i}/${BEACON.total} · +${BEACON.add} 秒`, i === BEACON.n ? 3 : 1.4);
};
G.onWeld = (e) => { if (!G.engSaid) { G.engSaid = true; showHint('工程车（黄色履带车）正在门边焊接炮台 · 焊完前击毁它，或者冲过去别停', 5); } };

function salvageLogic(dt) {
  const S = G.salv, p = G.player; if (!S) return;
  const q = run.quota, f = S.delivered / q;
  const nx = run.waves[run.wave + 1];
  if (!run.finalOn && nx && nx.at !== undefined && f >= nx.at && run.wave + 1 < run.waves.length - 1) { startWave(run.wave + 1); return; }
  if (!run.finalOn && S.delivered >= q) {
    run.finalOn = true; startWave(run.waves.length - 1);
    if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
    for (const k of ['R', 'L', 'S']) { const w = G.pw[k]; w.ammo = w.d.mag || 0; w.reloadT = 0; }
    return;
  }
  // trickle: fresh enemies keep coming so there is always salvage to win
  run.trickT -= dt;
  const alive = G.enemies.filter((e) => e.alive && !e.dying).length;
  if (!run.finalOn && !alive && !S.cores.length && run.trickT > 3) run.trickT = 3;
  if (!run.finalOn && run.trickT <= 0) {
    run.trickT = 16 + Math.random() * 6;
    if (alive < 5) spawnGroup(f > 0.45 && Math.random() < 0.5 ? { walker: 1, scav: 1, drone: 1 } : f > 0.2 && Math.random() < 0.4 ? { bulwark: 1, scav: 1 } : { walker: 1, drone: 2 });
  }
  if (run.finalOn && G.bosses.length && G.bosses.every((b) => !b.alive)) {
    if (!run.won) { run.won = true; banner('MISSION COMPLETE', '回收完成 · 头目已击破', false); run.deathT = 3.5; }
    run.deathT -= dt; if (run.deathT <= 0) finish(true);
  }
}

function captureLogic(dt) {
  const p = G.player; let own = 0, eown = 0;
  for (const z of run.zones) {
    const inZ = (o) => Math.hypot(o.pos.x - z.x, o.pos.z - z.z) < ZONE_R;
    z.pin = (p.alive && inZ(p) && p.pos.y < 16) || !!(G.wing && G.wing.alive && inZ(G.wing));
    z.ein = 0; for (const e of G.enemies) if (e.alive && !e.dying && GROUND.has(e.kind) && inZ(e)) z.ein++;
    if (z.pin && !z.ein) z.k = Math.min(1, z.k + dt / CAP_T);
    else if (z.ein && !z.pin) z.k = Math.max(-1, z.k - dt / 9 * Math.min(2, z.ein));
    const prev = z.own;
    if (z.k >= 1) z.own = 'P'; else if (z.k <= -1) z.own = 'E'; else if ((z.own === 'P' && z.k < 0) || (z.own === 'E' && z.k > 0)) z.own = null;
    if (z.own !== prev) {
      if (z.own === 'P') { banner(`据点 ${z.name} 已占领`, `上行链路 +${Math.round(UP_RATE * 1000) / 10}%/秒`, false); sfx('repair'); }
      else if (prev === 'P') { banner(`据点 ${z.name} 失守`, '回去夺回它', true); sfx('alarm'); }
      else if (z.own === 'E') showHint(`敌军占领了据点 ${z.name}`, 2.5);
    }
    if (z.own === 'P' && z.ein && !z.pin && run.t - (run.zoneWarnT[z.name] || -99) > 12) { run.zoneWarnT[z.name] = run.t; showHint(`据点 ${z.name} 遭到进攻`, 2.5); sfx('warn'); }
    if (z.own === 'P') own++; else if (z.own === 'E') eown++;
    paintZone(z, run.t);
  }
  if (!run.finalOn) run.up = Math.max(0, Math.min(1, run.up + dt * (UP_RATE * own - (eown >= 2 ? 0.003 : 0))));
  // escalation by uplink progress
  const nx = run.waves[run.wave + 1];
  if (!run.finalOn && nx && nx.at !== undefined && run.up >= nx.at) { startWave(run.wave + 1); return; }
  if (!run.finalOn && run.up >= 1) {
    run.finalOn = true; startWave(run.waves.length - 1);
    if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
    for (const k of ['R', 'L', 'S']) { const w = G.pw[k]; w.ammo = w.d.mag || 0; w.reloadT = 0; }
    return;
  }
  // trickle: a small squad heads for a zone every ~30 s
  run.trickT -= dt;
  if (!run.finalOn && run.trickT <= 0) {
    run.trickT = 18 + Math.random() * 6;
    if (G.enemies.filter((e) => e.alive && GROUND.has(e.kind)).length < 8) {
      const z = attackZone(); run.spotC = z.pos; const n0 = G.enemies.length;
      spawnGroup(run.up > 0.45 && Math.random() < 0.5 ? { raider: 1, walker: 1, drone: 1 } : { walker: 2, drone: 2 });
      run.spotC = null;
      for (const e of G.enemies.slice(n0)) if (GROUND.has(e.kind)) { e.goalP = z.pos; e.goalR = 7; }
    }
  }
  if (run.finalOn && G.bosses.length && G.bosses.every((b) => !b.alive)) {
    if (!run.won) { run.won = true; banner('MISSION COMPLETE', '上行链路已建立 · 头目已击破', false); run.deathT = 3.5; }
    run.deathT -= dt; if (run.deathT <= 0) finish(true);
  }
}

// ------------------------------------------------------------------ extraction mission: download 3 caches, then hold the evac zone
const DL_T = 12, EVAC_T = 30;
function extractLogic(dt) {
  const p = G.player, M = MISSIONS[cfg.mission];
  run.msslT -= dt;
  const inZ = (o, z) => Math.hypot(o.pos.x - z.x, o.pos.z - z.z) < z.R;
  for (const z of run.zones) {
    if (z.kind !== 'cache') continue;
    z.pin = p.alive && inZ(p, z) && p.pos.y < 14;
    if (z.k < 1 && z.pin && !run.won) {
      if (!z.started) {   // starting a download trips the alarm: the next ambush wave converges on this cache
        z.started = true; run.dlN++;
        if (run.dlN < run.waves.length - 1) { run.spotC = z.pos; startWave(run.dlN); run.spotC = null; }
        run.trickT = 24;
      }
      z.k = Math.min(1, z.k + dt / DL_T);
      if (z.k >= 1) {
        z.own = 'P'; run.got++;
        const n = run.zones.filter((q) => q.kind === 'cache').length;
        banner(`数据 ${run.got}/${n} 已取得`, run.got < n ? '前往下一个数据终端' : '前往撤离点', false); sfx('repair');
        if (run.got >= n) {
          run.evac = makeZones([M.evac], { R: 14, kind: 'evac', append: true, names: ['EVAC'] })[0]; run.zones.push(run.evac);
          startWave(run.waves.length - 1); run.trickT = 12; run.lateBoss = { ...(run.waves[run.waves.length - 1].lateBoss || {}) }; if (!run.lateBoss.type) run.lateBoss = null;
          if (!G.noRepair) { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4); showHint('撤离点已开启 · 修复 40% 装甲 · 弹药补满', 3); }
          for (const k of ['R', 'L', 'S']) { const w = G.pw[k]; w.ammo = w.d.mag || 0; w.reloadT = 0; }
        }
      }
    }
    paintZone(z, run.t);
  }
  run.trickT -= dt;
  if (run.lateBoss && (run.lateBoss.t -= dt) <= 0) {   // the pursuer arrives a few seconds after the evac opens
    const L = run.lateBoss; run.lateBoss = null;
    G.boss = new Boss(spot(100, 130), mctx, L.type, L.hp); G.bosses = [G.boss];
    $('bossName').textContent = BOSSES[L.type].name; $('bossBox').classList.remove('hidden');
    banner('追击者出现', BOSSES[L.type].name + ' · 守住撤离点', true); sfx('alarm');
  }
  if (run.evac) {
    const z = run.evac;
    z.pin = p.alive && inZ(p, z) && p.pos.y < 16;
    z.ein = 0; for (const e of G.enemies) if (e.alive && !e.dying && GROUND.has(e.kind) && inZ(e, z)) z.ein++;
    if (z.pin && !run.won) z.k = Math.min(1, z.k + dt / EVAC_T * (z.ein ? 0.5 : 1));
    paintZone(z, run.t);
    if (z.k >= 1 && !run.won) { run.won = true; banner('MISSION COMPLETE', '回收完成 · 数据已安全撤离', false); sfx('wave'); run.deathT = 3.5; }
    if (run.trickT <= 0 && !run.won) {   // pressure on the evac: a crawler pack every ~11 s
      run.trickT = 9 + Math.random() * 4;
      if (G.enemies.filter((e) => e.alive && e.kind === 'crawler').length < 14) { run.spotC = z.pos; spawnGroup({ crawler: 5 }); run.spotC = null; }
    }
  } else if (run.dlN > 0 && run.trickT <= 0) {   // once the alarm is up, crawler packs keep hunting you
    run.trickT = 20 + Math.random() * 6;
    if (G.enemies.filter((e) => e.alive).length < 16) spawnGroup({ crawler: 4, drone: 1 });
  }
  if (G.bosses && G.bosses.some((b) => b.phase === 2 && b.alive)) {
    run.droneT -= dt;
    if (run.droneT <= 0) { run.droneT = 22; if (G.enemies.filter((e) => e.kind === 'drone' && e.alive).length < 3) for (let k = 0; k < 2; k++) new Drone(spot(60, 100, true)); }
  }
  if (run.won) { run.deathT -= dt; if (run.deathT <= 0) finish(true); }
}

function finish(win) {
  run.over = true;
  const p = G.player, s = G.stats;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const tm = run.t;
  const M = MISSIONS[cfg.mission], D = DIFFS[cfg.diff], bk = (M.bestKey || cfg.mission) + '.' + cfg.diff;
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
  const mm = modMul(); if (mm > 1) { run.cr = Math.round(run.cr * mm); bonus = Math.round(bonus * mm); }
  const earned = run.cr + bonus;
  save.cr += earned; save.earned = (save.earned || 0) + earned;
  const got = checkMedals({ win, rank, hpK: p.hp / p.maxHp, cleared: run.endless ? Math.max(0, run.wave) : 0, M });
  writeSave();
  $('rRank').textContent = rank;
  $('rTitle').textContent = run.endless ? 'LINE BROKEN' : win ? 'MISSION COMPLETE' : 'MISSION FAILED';
  $('rSub').textContent = `${M.name} · ${D.name} · ` + (run.endless ? `坚守 ${Math.max(0, run.wave)} 波` : win ? (G.core ? `任务完成 · ${G.core.label}剩余 ${Math.ceil(G.core.hp / G.core.maxHp * 100)}%` : G.salv ? `任务完成 · 回收 ${G.salv.delivered} 个核心` : G.depot ? `任务完成 · 油罐剩余 ${G.depot.tanks.filter((t) => t.alive).length}/${G.depot.tanks.length}` : '任务完成') : run.coreLost ? `${G.core ? G.core.label : '反应堆'}在第 ${run.wave + 1} 波被摧毁` : run.vipLost ? '敌方指挥官登上运输机撤离了' : run.orbLost ? '能源塔没能在轨道炮充能前全部炸毁' : run.civLost ? `平民伤亡 ${EVAC.maxLost} 人，撤离失败` : run.cityLost ? '三座避难所全部被摧毁' : run.dataLost ? '数据信使完成了上传' : run.turfLost ? `地盘被抢走 · 青色 ${Math.round(turfShare()[0] * 100)}% 对 洋红 ${Math.round(turfShare()[1] * 100)}%` : run.flagLost ? '敌方三次夺走了你的旗' : run.hypeLost ? '观众冷场太久，被轰下台' : run.meltLost ? '堆芯熔毁' : run.depotLost ? '三座油罐全部被炸毁' : run.trainLost ? '装甲列车逃脱' : run.timeUp ? (G.beacon && G.beacon.done ? '时间耗尽 · 没能及时击破「幻影」' : `时间耗尽 · 通过 ${G.beacon ? G.beacon.i : 0}/${BEACON.total} 道信标`) : `在第 ${run.wave + 1} 波被击毁`) + (G.wing ? ' · 僚机随行（报酬 ×0.85）' : '') + (mm > 1 ? ` · 挑战 ×${mm.toFixed(2)}` : '');
  const bestTxt = run.endless ? (save.best[bk] ? `${save.best[bk]} 波` : '—') : (save.best[bk] ? fmt(save.best[bk]) : '—');
  $('rStats').innerHTML = `<span>用时</span><b>${fmt(tm)}</b><span>击毁</span><b>${s.kills}</b><span>命中率</span><b>${acc}%</b><span>造成伤害</span><b>${Math.round(s.dmgDealt)}</b><span>承受伤害</span><b>${Math.round(s.dmgTaken)}</b><span>${run.endless ? '最佳波数' : '最佳用时'}</span><b>${bestTxt}${newBest ? ' <em>NEW</em>' : ''}</b>`
    + `<span class="cr">击毁报酬</span><b class="cr">${run.cr} C</b>` + (bonus ? `<span class="cr">任务报酬 · 评级 ${rank}</span><b class="cr">${bonus} C</b>` : '') + `<span class="cr">持有资金</span><b class="cr">${save.cr} C</b>`
    + got.map((m) => `<span class="medal">新勋章 · ${m.name}</span><b class="medal">+${m.cr} C</b>`).join('');
  if (got.length) setTimeout(() => sfx('medal'), 400);
  setState('result');
}

function manualReload() {
  for (const k of ['R', 'L']) { const w = G.pw[k]; if (w.d.mag && w.ammo < w.d.mag && w.reloadT <= 0) { w.reloadT = w.d.reload; sfx('reload'); } }
}

// ------------------------------------------------------------------ states / overlays
const overlays = ['title', 'garage', 'pause', 'result', 'loading', 'medals'];
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
  if (s === 'medals') buildMedals();
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
$('btnMedals').onclick = () => { initAudio(); sfx('ui'); setState('medals'); };
$('mBack').onclick = () => { sfx('ui'); setState('title'); };
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
    const v = save.best[(MISSIONS[mk].bestKey || mk) + '.' + dk]; if (!v) continue;
    parts.push(`${DIFFS[dk].name} ${MISSIONS[mk].endless ? v + ' 波' : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`}`);
  }
  return parts.join(' · ');
}
let titleScrolled = false;
function buildTitle() {
  const el = $('tMission'), sc = el.scrollTop; el.innerHTML = '';
  for (const [k, M] of Object.entries(MISSIONS)) {
    const d = document.createElement('button'); d.type = 'button'; d.className = 'mis' + (cfg.mission === k ? ' on' : '');
    const b = bestLine(k);
    d.innerHTML = `<b>${M.name.replace(" · ", "·")}${b ? ' <em class="done">✓</em>' : ''}</b><span class="en">${M.en}</span>`; d.title = M.desc + (b ? ' · 最佳 ' + b : '');
    d.onclick = () => { initAudio(); sfx('ui'); cfg.mission = k; saveCfg(); ensureArena(); buildTitle(); };
    el.appendChild(d);
  }
  const c0 = el.firstElementChild, rh = c0 ? c0.offsetHeight : 0, nM = Object.keys(MISSIONS).length;
  if (rh) { el.style.maxHeight = (rh * 3 + 6 + 5) + 'px'; el.scrollTop = sc; if (!titleScrolled) { titleScrolled = true; const on = el.querySelector('.mis.on'); if (on && on.offsetTop + rh > el.clientHeight + el.scrollTop) el.scrollTop = on.offsetTop - 5; } }
  $('tMisN').textContent = `${nM} 个任务 · 滚动查看更多 ▾`;
  const bs = bestLine(cfg.mission); $('tMisDesc').innerHTML = MISSIONS[cfg.mission].desc + (bs ? ` <span class="best">· 最佳 ${bs}</span>` : '');
  const me = $('tMods'); me.innerHTML = '<span class="lbl">挑战</span>';
  for (const [k, X] of Object.entries(MODS)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (modOn(k) ? ' on' : '') + (forcedMod(k) ? ' forced' : '');
    b.textContent = `${X.name} +${Math.round(X.cr * 100)}%`; b.title = X.desc + ' · 报酬 +' + Math.round(X.cr * 100) + '%' + (forcedMod(k) ? ' · 每日挑战强制' : '');
    if (forcedMod(k)) b.disabled = true;
    b.onclick = () => { initAudio(); sfx('ui'); cfg.mods[k] = !modOn(k); saveCfg(); buildTitle(); };
    me.appendChild(b);
  }
  $('btnMedals').textContent = `勋章 ${Object.keys(save.medals).length}/${MEDALS.length}`;
  $('bestTxt').textContent = `资金 ${save.cr} C` + (Object.values(save.up).some((v) => v) ? ' · 机库强化 ' + Object.entries(save.up).filter(([, v]) => v).map(([k, v]) => `${UPGRADES[k].name} ${v}`).join(' / ') : '');
}

// ------------------------------------------------------------------ medals: one-off achievements, each pays credits once
const STORY = ['drill', 'harbor', 'snow', 'defense', 'storm', 'convoy', 'ash', 'uplink', 'extract'];
const won = (k) => Object.keys(DIFFS).some((d) => save.best[k + '.' + d]);
const isMeleeKey = (k) => k === 'blade' || k === 'pile';
const MEDALS = [
  { id: 'first', name: '初次胜利', desc: '赢得任意一场任务', cr: 300, test: (r) => r.win },
  { id: 'allmis', name: '全域作战', desc: '赢下全部 9 场剧情任务（不含无尽与每日）', cr: 3000, test: () => STORY.every(won), prog: () => [STORY.filter(won).length, STORY.length] },
  { id: 'ace', name: '王牌驾驶员', desc: '以王牌难度赢得一场任务', cr: 1500, test: (r) => r.win && cfg.diff === 'hard' },
  { id: 'srank', name: '完美作战', desc: '获得 S 评级', cr: 800, test: (r) => r.win && r.rank === 'S' },
  { id: 'iron', name: '铁壁', desc: '赢得任务时装甲剩余 90% 以上', cr: 800, test: (r) => r.win && r.hpK >= 0.9 },
  { id: 'glass', name: '玻璃大炮', desc: '开启「玻璃机体」赢得一场任务', cr: 1000, test: (r) => r.win && modOn('glass') },
  { id: 'triple', name: '三重挑战', desc: '三个挑战词条全开并获胜', cr: 2500, test: (r) => r.win && Object.keys(MODS).every(modOn) },
  { id: 'melee', name: '近身猎手', desc: '双臂都装近战武器（光束剑 / 打桩机）并获胜', cr: 1500, test: (r) => r.win && isMeleeKey(cfg.R) && isMeleeKey(cfg.L) },
  { id: 'solo', name: '孤胆守卫', desc: '不带僚机赢得反应堆防卫或运输车护送', cr: 1000, test: (r) => r.win && !wingOn() && (r.M.defense || r.M.convoy) },
  { id: 'od', name: '超载大师', desc: '一局中发动 5 次超载', cr: 600, test: () => ((G.od && G.od.uses) || 0) >= 5 },
  { id: 'daily', name: '每日一战', desc: '完成一次每日挑战', cr: 800, test: (r) => r.win && cfg.mission === 'daily' },
  { id: 'end10', name: '不灭防线', desc: '无尽防线坚守 10 波', cr: 1500, test: (r) => r.cleared >= 10 },
  { id: 'end20', name: '钢铁长城', desc: '无尽防线坚守 20 波', cr: 3000, test: (r) => r.cleared >= 20 },
  { id: 'giant', name: '屠巨者', desc: '击毁巨像', cr: 1000, tally: 'colossus', need: 1 },
  { id: 'boss10', name: '头目猎人', desc: '累计击破 10 台头目（含巨像）', cr: 1500, tally: 'boss', need: 10 },
  { id: 'bug', name: '灭虫', desc: '累计击毁 100 只自爆蜘蛛', cr: 800, tally: 'crawler', need: 100 },
  { id: 'k1000', name: '千机斩', desc: '累计击毁 1000 台敌机', cr: 2000, tally: 'all', need: 1000 },
  { id: 'gauntlet', name: '连战制霸', desc: '赢下「头目连战」', cr: 2500, test: (r) => r.win && cfg.mission === 'gauntlet' },
  { id: 'ecm', name: '电子战', desc: '累计击落 10 台干扰机', cr: 800, tally: 'jammer', need: 10 },
  { id: 'unhook', name: '断索', desc: '累计击落 10 台钩锁机', cr: 1000, tally: 'grappler', need: 10 },
  { id: 'eelslayer', name: '屠鳗', desc: '累计击落 10 条雷鳗', cr: 1000, tally: 'eel', need: 10 },
  { id: 'ace', name: '制空', desc: '累计击落 10 架攻击机', cr: 1000, tally: 'jet', need: 10 },
  { id: 'sandking', name: '驯沙', desc: '击败沙海巨虫', cr: 1500, tally: 'leviathan', need: 1 },
  { id: 'mirrorbreak', name: '裂镜', desc: '累计击毁 20 台棱镜', cr: 1200, tally: 'prism', need: 20 },
  { id: 'unfence', name: '断网', desc: '累计击毁 20 台栅栏机', cr: 1200, tally: 'fencer', need: 20 },
  { id: 'ctf', name: '夺旗大师', desc: '赢得「夺旗 · 双基地」且敌方一次都没把你的旗带回去', cr: 1250, test: (r) => r.win && cfg.mission === 'ctf' && G.ctf && G.ctf.lost === 0 },
  { id: 'polar', name: '阴阳', desc: '赢得「极性 · 双色战场」且吸收至少 250 次敌方攻击', cr: 1300, test: (r) => r.win && cfg.mission === 'polar' && G.polar && G.polar.abs >= 250 },
  { id: 'hotfuse', name: '传爆手', desc: '赢得「引信 · 定时炸弹」且用炸弹炸毁至少 5 台敌机', cr: 1300, test: (r) => r.win && cfg.mission === 'hotfuse' && G.hf && G.hf.kills >= 5 },
  { id: 'turf', name: '满城青', desc: '赢得「涂装 · 领地争夺」且结束时青色覆盖 ≥ 50%', cr: 1250, test: (r) => r.win && cfg.mission === 'turf' && G.turf && turfShare()[0] >= 0.5 },
  { id: 'glad', name: '人气王', desc: '赢得「角斗场 · 人气」且观众一次都没有喝倒彩', cr: 1200, test: (r) => r.win && cfg.mission === 'coliseum' && G.glad && !G.glad.booedEver },
  { id: 'meltdown', name: '冷停堆', desc: '赢得「核电站 · 熔毁」且堆芯温度从未超过 60%', cr: 1150, test: (r) => r.win && cfg.mission === 'meltdown' && G.atom && G.atom.peak < 60 },
  { id: 'creep', name: '焦土', desc: '赢得「虫巢 · 菌毯」且菌毯从未碰到净化塔', cr: 1150, test: (r) => r.win && cfg.mission === 'creep' && G.bio && !G.bio.coreSaid },
  { id: 'tsunami', name: '冲浪者', desc: '赢得「海啸 · 巨浪」且被巨浪卷到不超过 1 次', cr: 1150, test: (r) => r.win && cfg.mission === 'tsunami' && G.tsu && G.tsu.hitsP <= 1 },
  { id: 'factory', name: '流水线', desc: '赢得「工厂 · 流水线」且让液压机砸中至少 3 台敌机', cr: 1150, test: (r) => r.win && cfg.mission === 'factory' && (G.pressCrush || 0) >= 3 },
  { id: 'maze', name: '迷城', desc: '赢得「迷城 · 升降壁垒」且让升起的墙掀飞至少 3 台敌机', cr: 1100, test: (r) => r.win && cfg.mission === 'maze' && (G.mazeCrush || 0) >= 3 },
  { id: 'decap', name: '斩首', desc: '赢得「斩首 · 指挥官」且目标没能登上运输机', cr: 1100, test: (r) => r.win && cfg.mission === 'decap' && !G.vipBoarded },
  { id: 'sabot', name: '断电', desc: '赢得「破袭 · 敌后爆破」且没有一枚炸药被拆除', cr: 1100, test: (r) => r.win && cfg.mission === 'sabot' && !(G.sabDefused > 0) },
  { id: 'rescue', name: '方舟', desc: '赢得「撤离 · 平民疏散」且平民伤亡不超过 3 人', cr: 1100, test: (r) => r.win && cfg.mission === 'rescue' && G.evac && G.evac.lost <= 3 },
  { id: 'sky', name: '金穹', desc: '赢得「防空 · 导弹拦截」且三座避难所全部保住', cr: 1100, test: (r) => r.win && cfg.mission === 'sky' && G.sky && G.sky.shelters.every((q) => q.alive) },
  { id: 'pursuit', name: '截获', desc: '赢得「追击 · 数据信使」且信使被击毁时上传不到 50%', cr: 1100, test: (r) => r.win && cfg.mission === 'pursuit' && G.courierUp !== null && G.courierUp < 50 },
  { id: 'lance', name: '夺日', desc: '赢得「轨道炮 · 灼光」且被光柱烧掉的装甲少于 300', cr: 1100, test: (r) => r.win && cfg.mission === 'lance' && G.lance && G.lance.dmgP < 300 },
  { id: 'beacon', name: '极速', desc: '赢得「信标冲刺」且剩余时间 30 秒以上', cr: 1100, test: (r) => r.win && cfg.mission === 'beacon' && G.beacon && G.beacon.t >= 30 },
  { id: 'lane', name: '破城锤', desc: '赢得「兵线推进」且基地装甲剩余 50% 以上', cr: 1100, test: (r) => r.win && cfg.mission === 'lane' && G.core && G.core.hp > G.core.maxHp * 0.5 },
  { id: 'fortify', name: '筑垒大师', desc: '累计建造或升级 12 座炮台', cr: 1000, tally: 'build', need: 12 },
  { id: 'salvage', name: '拾荒王', desc: '交付 40 个回收核心', cr: 1100, tally: 'salvage', need: 40 },
  { id: 'defuse', name: '拆弹专家', desc: '拆除 15 枚炸药', cr: 1100, tally: 'defuse', need: 15 },
  { id: 'lamp', name: '守灯人', desc: '点亮 20 盏雾灯', cr: 1000, tally: 'lamp', need: 20 },
  { id: 'crate', name: '空投猎手', desc: '抢到 25 个补给箱', cr: 1100, tally: 'crate', need: 25 },
  { id: 'rift', name: '穿越者', desc: '穿过传送门 30 次', cr: 1000, tally: 'rift', need: 30 },
  { id: 'roadkill', name: '车祸现场', desc: '让卡车撞毁 20 架敌机', cr: 1300, tally: 'roadkill', need: 20 },
  { id: 'bolt', name: '引雷', desc: '让闪电劈中 20 架敌机', cr: 1300, tally: 'boltE', need: 20 },
  { id: 'unleap', name: '截跃', desc: '在空中把跃击者打下来 15 次', cr: 1200, tally: 'leapDown', need: 15 },
  { id: 'unram', name: '拆城', desc: '累计击毁 12 台破城锤', cr: 1300, tally: 'rammer', need: 12 },
  { id: 'undefl', name: '消磁', desc: '累计击落 12 架偏导机', cr: 1300, tally: 'deflector', need: 12 },
  { id: 'unmirage', name: '破妄', desc: '累计击落 12 架幻象机', cr: 1300, tally: 'mirage', need: 12 },
  { id: 'unblimp', name: '坠艇', desc: '累计击落 10 艘飞艇', cr: 1500, tally: 'blimp', need: 10 },
  { id: 'unfrost', name: '破冰', desc: '累计击毁 15 台寒霜炮', cr: 1200, tally: 'frost', need: 15 },
  { id: 'unwatch', name: '熄灯', desc: '累计击毁 15 座瞭望塔', cr: 1200, tally: 'watch', need: 15 },
  { id: 'unblink', name: '破影', desc: '累计击毁 15 架闪影', cr: 1200, tally: 'blinker', need: 15 },
  { id: 'unhive', name: '灭巢', desc: '累计击毁 10 座蜂巢', cr: 1200, tally: 'hive', need: 10 },
  { id: 'skipper', name: '截浪', desc: '累计击沉 15 艘气垫炮艇', cr: 1000, tally: 'skimmer', need: 15 },
  { id: 'shatter', name: '碎星', desc: '累计击碎 40 个分裂球（大中小都算）', cr: 1000, tally: 'splitter', need: 40 },
  { id: 'mirror', name: '破镜', desc: '击败复制你武装的「镜像」', cr: 1200, tally: 'echo', need: 1 },
  { id: 'derail', name: '脱轨', desc: '击毁装甲列车', cr: 1200, tally: 'train', need: 1 },
  { id: 'digger', name: '地心猎人', desc: '累计击毁 10 只钻地虫', cr: 1000, tally: 'burrower', need: 10 },
  { id: 'breaker', name: '破穹者', desc: '累计摧毁 8 台穹盾发生器', cr: 1000, tally: 'warden', need: 8 },
  { id: 'counter', name: '反炮兵', desc: '累计摧毁 12 门自走炮', cr: 1000, tally: 'howitzer', need: 12 },
  { id: 'intercept', name: '防空专家', desc: '累计在投放前击落 10 架运输机', cr: 1000, tally: 'dropFull', need: 10 },
  { id: 'maxed', name: '满改机体', desc: '四项机库强化全部升满', cr: 1000, test: () => Object.values(save.up).every((v) => v >= 5), prog: () => [Object.values(save.up).reduce((a, v) => a + v, 0), 20] },
];
function checkMedals(r) {
  const got = [];
  for (const m of MEDALS) {
    if (save.medals[m.id]) continue;
    const ok = m.tally ? (save.tally[m.tally] || 0) >= m.need : r ? !!m.test(r) : false;
    if (ok) { save.medals[m.id] = Date.now(); save.cr += m.cr; got.push(m); }
  }
  return got;
}
function buildMedals() {
  const el = $('mList'); el.innerHTML = '';
  let n = 0;
  for (const m of MEDALS) {
    const on = !!save.medals[m.id]; if (on) n++;
    const pr = m.tally ? [Math.min(m.need, save.tally[m.tally] || 0), m.need] : m.prog ? m.prog() : null;
    const d = document.createElement('div'); d.className = 'medal' + (on ? ' on' : '');
    d.innerHTML = `<i>${on ? '★' : '☆'}</i><div><b>${m.name}</b><small>${m.desc}</small>${pr && !on ? `<span class="mp"><span style="width:${(pr[0] / pr[1] * 100).toFixed(0)}%"></span></span><small>${pr[0]} / ${pr[1]}</small>` : ''}</div><em>${on ? '已获得' : '+' + m.cr + ' C'}</em>`;
    el.appendChild(d);
  }
  $('mCount').textContent = `${n} / ${MEDALS.length}`;
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
      save.cr -= cost; save.up[k]++; const got = checkMedals(null); writeSave(); sfx(got.length ? 'medal' : 'coin'); makePlayer(); buildGarage();
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
  buildParts(opt, fill);
  const F = G.player.frame, xs = (k, lab) => (F[k] !== 1 ? ` · ${lab} <b>×${F[k].toFixed(2)}</b>` : '');
  $('gStats').innerHTML = `AP <b>${Math.round(F.hp)}</b> · 速度 <b>×${F.speed.toFixed(2)}</b> · EN <b>${Math.round(F.en)}</b> · 推进 <b>×${F.boost.toFixed(2)}</b> · 受伤 <b>×${+F.armor.toFixed(2)}</b>` + (save.up.fcs ? ` · 伤害 <b>×${dmgMul().toFixed(2)}</b>` : '')
    + xs('lock', '锁定') + xs('reload', '装填') + (F.jump !== 1 ? ` · 跳跃高度 <b>×${(F.jump * F.jump).toFixed(2)}</b>` : '') + xs('qb', '急闪耗能') + xs('hover', '悬停耗能') + xs('lift', '悬停爬升') + xs('radar', '雷达') + xs('od', '超载充能') + (F.grip ? ' · <b>防滑</b>' : '') + (F.float ? ' · <b>涉水</b>' : '');
  const wopt = (slot, k) => opt(`${WEAPONS[k].name}<small>${WEAPONS[k].desc}</small>`, cfg[slot] === k, () => { cfg[slot] = k; G.player.mount({ R: cfg.R, L: cfg.L, S: cfg.S }); G.pw = freshPW(); buildWeaponPanel(); });
  fill('gR', ARM_KEYS.map((k) => wopt('R', k)));
  fill('gL', ARM_KEYS.map((k) => wopt('L', k)));
  fill('gS', SHOULDER_KEYS.map((k) => wopt('S', k)));
  const slots = chipSlots(), mine = cfg.chips.slice(0, slots);
  fill('gChip', Object.entries(CHIPS).map(([k, c]) => opt(`${c.name}<small>${c.desc}</small>`, mine.includes(k), () => {
    const cur = cfg.chips.slice(0, slots);
    cfg.chips = cur.includes(k) ? cur.filter((x) => x !== k) : cur.concat([k]).slice(-slots);
    rebuildPreview();
  })));
  $('gChipN').textContent = `${mine.length} / ${slots}`;
  const gc2 = $('gChip2'); gc2.innerHTML = '';
  if (!save.chip2) {
    const row = document.createElement('div'); row.className = 'uprow';
    row.innerHTML = `<div class="un"><b>第二芯片槽</b><small>同时装两枚芯片</small></div><div></div>`;
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = `${CHIP2_COST} C`; btn.disabled = save.cr < CHIP2_COST;
    btn.onclick = () => { if (save.cr < CHIP2_COST) return; save.cr -= CHIP2_COST; save.chip2 = true; writeSave(); sfx('coin'); buildGarage(); };
    row.appendChild(btn); gc2.appendChild(row);
  }
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
// parts: four named builds (buy whatever is missing in one go, then equip) and one row per slot; an unowned part
// shows its price and is bought + equipped on click
function buildParts(opt, fill) {
  const sec = $('gPartsSec'); if (!sec) return;
  sec.style.display = partsReady() ? '' : 'none';
  if (!partsReady()) return;
  if (!save.parts) save.parts = {};
  const cur = myParts();
  const buy = (list) => { const cost = list.reduce((a, [s, id]) => a + PARTS[s][id].cost, 0); if (save.cr < cost) { sfx('empty'); return false; }
    save.cr -= cost; for (const [s, id] of list) save.parts[s + '.' + id] = true; writeSave(); sfx('coin'); return true; };
  fill('gBuild', Object.entries(BUILDS).map(([k, B]) => {
    const want = PART_SLOTS.map((s) => [s, B.parts[s] || 'std']);
    const miss = want.filter(([s, id]) => !partOwned(s, id)), cost = miss.reduce((a, [s, id]) => a + PARTS[s][id].cost, 0);
    const on = want.every(([s, id]) => (cur[s] || 'std') === id);
    return opt(`${B.name}<small>${on ? '已装备' : miss.length ? `缺 ${miss.length} 件 · ${cost} C` : B.en}</small>`, on, () => {
      if (miss.length && !buy(miss)) return;
      cfg.parts = { ...B.parts }; rebuildPreview();
    }, miss.length && save.cr < cost ? 'lock' : '');
  }));
  const el = $('gParts'); el.innerHTML = '';
  for (const s of PART_SLOTS) {
    const row = document.createElement('div'); row.className = 'prow';
    row.innerHTML = `<span class="pl">${SLOT_NAMES[s][0]}</span>`;
    const o = document.createElement('div'); o.className = 'opts';
    for (const [id, P] of Object.entries(PARTS[s])) {
      const own = partOwned(s, id);
      o.appendChild(opt(`${P.name}<small>${own ? (P.d || '基准') : `${P.cost} C · ${P.d}`}</small>`, (cur[s] || 'std') === id, () => {
        if (!own && !buy([[s, id]])) return;
        cfg.parts = { ...cur, [s]: id }; rebuildPreview();
      }, own ? '' : (save.cr < P.cost ? 'lock' : 'buy')));
    }
    row.appendChild(o); el.appendChild(row);
  }
}

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
  if (G.od) {
    const on = G.od.t > 0, ready = !on && G.od.k >= 1;
    $('odBar').firstElementChild.style.width = ((on ? G.od.t / G.od.dur : G.od.k) * 100).toFixed(1) + '%';
    $('odBar').classList.toggle('ready', ready); $('odBar').classList.toggle('on', on);
    $('odTxt').textContent = on ? `${G.od.t.toFixed(1)} s` : ready ? (touch.active ? '按「超载」' : pad.active ? 'Y 发动' : 'V 发动') : Math.floor(G.od.k * 100) + '%';
    $('odFx').classList.toggle('on', on);
    const ob = document.querySelector('#tBtns .od'); if (ob) ob.classList.toggle('ready', ready);
  }
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
      if (w.d.type === 'drones') { const m = G.minis.find((x) => x.owner === G.player); if (m) { txt = 'ACTIVE ' + Math.ceil(m.t); k = m.t / w.d.dur; cls = ''; } }
      if (w.d.type === 'hook' && G.hooks.some((h) => h.owner === G.player && h.slot === slot)) { txt = 'HOOKED'; k = 1; cls = ''; }
      if (w.d.type === 'stasis' && G.stasis.length) { txt = 'STASIS ' + Math.ceil(G.stasis[G.stasis.length - 1].t); k = 1; cls = ''; }
      if (w.d.type === 'smoke' && G.smokes.length) { txt = 'SMOKE ' + Math.ceil(G.smokes[G.smokes.length - 1].t); k = 1; cls = ''; }
      if (w.d.type === 'repair' && G.rbeam && G.rbeam.t > 0) { txt = (G.rbeam.tgt && G.rbeam.tgt.isEnt ? 'DRAIN ' : 'REPAIR ') + G.rbeam.t.toFixed(1); k = G.rbeam.t / w.d.dur; cls = ''; }
      if (w.d.type === 'burner' && G.burn && G.burn.t > 0) { txt = 'BURN ' + G.burn.t.toFixed(1); k = G.burn.t / w.d.dur; cls = ''; }
      if (w.d.type === 'reflect' && G.refl && G.refl.t > 0) { txt = 'REFLECT ' + G.refl.t.toFixed(1); k = G.refl.t / w.d.dur; cls = ''; }
      if (w.d.type === 'sentry') { const m = G.friends.find((x) => x.isSentry); if (m) { txt = 'SENTRY ' + Math.ceil(m.t); k = m.hp / m.maxHp; cls = ''; } }
      if (w.d.type === 'decoy') { const m = G.friends.find((x) => x.isDecoyObj); if (m) { txt = 'DECOY ' + Math.ceil(m.t); k = m.hp / m.maxHp; cls = ''; } }
    }
    if (G.jam[slot] > 0) { txt = 'LOCKED ' + G.jam[slot].toFixed(1); k = G.jam[slot] / DISARM.jam; cls = 'reloading'; }
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
    d.style.display = ''; d.className = 'mark' + (e.kind === 'boss' ? ' boss' : e.kind === 'relay' || e.kind === 'dish' || e.kind === 'fab' || e.kind === 'pump' || e.kind === 'bionode' || e.kind === 'courier' || e.kind === 'launcher' || e.kind === 'tower' || e.kind === 'citadel' ? ' obj' : '');
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
  { const g = beaconNext(); if (g) { _sp.set(g.x, g.y + 7.5, g.z).project(camera); if (_sp.z < 1 && Math.abs(_sp.x) < 1 && Math.abs(_sp.y) < 1) { const d = objPool[oi] || poolEl(objPool, M, 'objm'); oi++;
    d.style.display = ''; d.className = 'objm'; d.style.left = ((_sp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - _sp.y) / 2 * innerHeight) + 'px'; d.textContent = `◇ 信标 ${G.beacon.i + 1} ${Math.round(Math.hypot(g.x - p.pos.x, g.z - p.pos.z))}m`; } } }
  for (const e of G.enemies) {
    if ((e.kind !== 'relay' && e.kind !== 'dish' && e.kind !== 'fab' && e.kind !== 'pump' && e.kind !== 'bionode' && e.kind !== 'courier' && e.kind !== 'launcher' && e.kind !== 'tower' && e.kind !== 'citadel') || !e.alive) continue;
    _sp.set(e.pos.x, e.pos.y + (e.kind === 'citadel' ? 22 : e.kind === 'tower' ? 13 : e.kind === 'dish' ? 13 : e.kind === 'fab' ? 11 : e.kind === 'pump' ? 10 : e.kind === 'bionode' ? 10 : e.kind === 'courier' ? 6 : e.kind === 'launcher' ? 8 : 15.5), e.pos.z).project(camera);
    if (_sp.z > 1 || Math.abs(_sp.x) > 1 || Math.abs(_sp.y) > 1) continue;
    const d = objPool[oi] || poolEl(objPool, M, 'objm'); oi++;
    d.style.display = ''; d.className = 'objm'; d.style.left = ((_sp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - _sp.y) / 2 * innerHeight) + 'px';
    d.textContent = `◆ ${e.kind === 'tower' ? '防御塔' : e.kind === 'citadel' ? (e.shielded ? '要塞（护盾）' : '要塞') : e.kind === 'dish' ? '卫星天线' : e.kind === 'fab' ? '制造厂' : e.kind === 'pump' ? '潮汐泵' : e.kind === 'bionode' ? '菌巢' : e.kind === 'courier' ? `数据信使 ${Math.floor(G.courier ? G.courier.up : 0)}%` : e.kind === 'launcher' ? (e.st === 'setup' || e.st === 'fire' ? '导弹车（发射中）' : '导弹车') : '中继塔'} ${Math.round(e.pos.distanceTo(p.pos))}m`;
  }
  for (const e of G.enemies) {
    if (e.kind !== 'dropship' || !e.alive || !e.cargo) continue;
    _sp.set(e.pos.x, e.pos.y + 4, e.pos.z).project(camera);
    if (_sp.z > 1 || Math.abs(_sp.x) > 1 || Math.abs(_sp.y) > 1) continue;
    const d = objPool[oi] || poolEl(objPool, M, 'objm'); oi++;
    d.style.display = ''; d.className = 'objm foe'; d.style.left = ((_sp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - _sp.y) / 2 * innerHeight) + 'px';
    d.textContent = `▼ ${e.heavy ? '重型运输机' : '运输机'} ` + (e.st === 'drop' ? `投放 ${e.stT.toFixed(1)}s` : e.st === 'down' ? '降落中' : `${Math.round(e.pos.distanceTo(p.pos))}m`) + ` · ${Math.ceil(e.hp / e.maxHp * 100)}%`;
  }
  if (G.core && G.core.alive) {
    _sp.set(G.core.pos.x, 17.5, G.core.pos.z).project(camera);
    const dd = G.core.pos.distanceTo(p.pos);
    if (_sp.z < 1 && Math.abs(_sp.x) < 1 && Math.abs(_sp.y) < 1 && dd > 18) {
      const d = objPool[oi] || poolEl(objPool, M, 'objm'); oi++;
      d.style.display = ''; d.className = 'objm core'; d.style.left = ((_sp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - _sp.y) / 2 * innerHeight) + 'px';
      d.textContent = `◆ ${G.core.label} ${Math.round(dd)}m`;
    }
  }
  if (run.capture || run.extract) for (const z of run.zones) {
    const dd = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
    _sp.set(z.x, 9, z.z).project(camera);
    if (_sp.z > 1 || Math.abs(_sp.x) > 1 || Math.abs(_sp.y) > 1) continue;
    const d = objPool[oi] || poolEl(objPool, M, 'objm'); oi++;
    d.style.display = ''; d.className = 'objm' + (z.own === 'P' || z.kind === 'evac' ? ' core' : z.own === 'E' ? ' foe' : ''); d.style.left = ((_sp.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - _sp.y) / 2 * innerHeight) + 'px';
    const pct = Math.floor(z.k * 100);
    d.textContent = z.kind === 'cache' ? `◆ 终端 ${z.name} ` + (z.k >= 1 ? '已取得' : z.pin ? `下载 ${pct}%` : z.k > 0 ? `${pct}%` : '') + (dd > z.R ? ` ${Math.round(dd)}m` : '')
      : z.kind === 'evac' ? '◆ 撤离点 ' + (z.pin ? `回收 ${pct}%` + (z.ein ? ' · 敌机干扰' : '') : `${pct}%`) + (dd > z.R ? ` ${Math.round(dd)}m` : '')
      : `◆ ${z.name} ` + (z.pin && z.ein ? '争夺中' : z.pin && z.k < 1 ? `占领中 ${Math.round((z.k + 1) * 50)}%` : z.own === 'P' ? '己方' : z.own === 'E' ? '敌方' : '中立') + (dd > z.R ? ` ${Math.round(dd)}m` : '');
  }
  for (; oi < objPool.length; oi++) objPool[oi].style.display = 'none';
  // hurt vignette
  G.hud.hurt = Math.max(0, G.hud.hurt - dt * 1.2);
  { const F = G.flare, ft = $('flareTag');
    if (F) { const k = F.k; renderer.toneMappingExposure = envBase.exp * (1 + 0.5 * k); sun.intensity = envBase.sun * (1 + 1.1 * k); sky.material.uniforms.top.value.copy(envBase.top).lerp(FLARE_TOP, k * 0.75); }
    const on = F && F.st !== 'calm' && state === 'play' && G.player.alive; ft.style.display = on ? 'block' : 'none';
    if (on) { ft.classList.toggle('safe', !F.exposed); ft.textContent = F.st === 'warn' ? (F.exposed ? '☀ 耀斑来袭 · 快进阴影 · SOLAR FLARE' : '☀ 耀斑来袭 · 你在阴影里') : (F.exposed ? '☀ 暴露在日光下 · 正在灼烧' : '阴影中 · 安全'); } }
  if (G.fog) { scene.fog.near = FOG.near; scene.fog.far += (fogFar() - scene.fog.far) * Math.min(1, dt * 1.5); }
  if (G.lane && state === 'play' && G.player.alive) { const ft = $('flareTag'), L = G.lane;
    const tw = L.towers.filter((t) => t.alive).length;
    let t = '友军坦克 ' + L.troops.length + ' · 防御塔 ' + tw + '/' + L.towers.length + ' · ' + (tw ? '要塞护盾开启' : '要塞护盾已瓦解');
    const o = laneObjective(); if (o && o.kind === 'tower' && !laneEscorted(o) && o.pos.distanceTo(G.player.pos) < 120) t += ' · 没有友军坦克在旁，防御塔只受 30% 伤害';
    if (G.veilN) t += ' · ' + G.veilN + ' 台敌机隐身中';
    ft.style.display = 'block'; ft.classList.toggle('safe', !tw); ft.textContent = t; }
  if (G.decap && state === 'play' && G.player.alive) { const ft = $('flareTag'), S = G.decap, R = S.real, P = G.player;
    let t;
    if (!S.found) { const sc = S.ms.filter((m) => m.alive && !m.known && m.scanK > 0).sort((a, b) => b.scanK - a.scanK)[0]; t = `🎯 指挥官 ? · 已识破诱饵 ${S.ms.filter((m) => !m.real && m.known).length}/${S.ms.length - 1}` + (sc ? ` · 扫描 ${Math.round(Math.min(1, sc.scanK) * 100)}%` : ''); }
    else if (R && R.alive) t = R.st === 'board' ? `🎯 目标登机中 · ${Math.max(0, R.boardT).toFixed(1)} 秒` : `🎯 目标撤离中 · 距运输机 ${Math.round(Math.hypot(S.pad.x - R.pos.x, S.pad.z - R.pos.z))} m` + (S.shipT > 0 ? ` · 运输机 ${Math.ceil(S.shipT)} 秒后降落` : ' · 运输机已降落') + ` · 装甲 ${Math.round(R.hp / R.maxHp * 100)}%`;
    else t = '🎯 目标已击毁';
    if (G.dazzleT > 0) t = '✸ 致盲 · ' + t;
    ft.style.display = 'block'; ft.classList.toggle('safe', !S.found); ft.textContent = t; }
  else if (G.dazzleT > 0 && state === 'play' && G.player.alive) { const ft = $('flareTag'); ft.style.display = 'block'; ft.classList.remove('safe'); ft.textContent = `✸ 眩光致盲 · ${G.dazzleT.toFixed(1)} 秒`; }
  if (G.sabot && state === 'play' && G.player.alive) { const ft = $('flareTag'), S = G.sabot, c = S.charges.slice().sort((a, b) => a.t - b.t)[0];
    let t = `⚡ 能源塔 ${S.gens.length - S.done}/${S.gens.length} · 轨道炮 ${Math.ceil(S.t)} 秒`;
    if (c) t += c.k > 0 ? ` · 炸药被拆 ${Math.round(c.k * 100)}%` : ` · 炸药 ${Math.ceil(c.t)} 秒后引爆`;
    if (G.camo && G.camo.t > 0) t = '👁 隐身中 · ' + t;
    ft.style.display = 'block'; ft.classList.toggle('safe', !(c && c.k > 0) && S.t > 60); ft.textContent = t; }
  else if (G.camo && G.camo.t > 0 && state === 'play' && G.player.alive) { const ft = $('flareTag'); ft.style.display = 'block'; ft.classList.add('safe'); ft.textContent = `👁 光学迷彩 · 隐身 ${Math.ceil(G.camo.t)} 秒`; }
  if (G.evac && state === 'play' && G.player.alive) { const ft = $('flareTag'), E = G.evac, S = E.sh;
    let t = `🚁 已撤离 ${E.saved}/${EVAC.goal} · 伤亡 ${E.lost}/${EVAC.maxLost} · ` + (S.st === 'load' ? '穿梭机登机中' : S.st === 'down' ? '穿梭机降落中' : S.st === 'up' ? '穿梭机起飞' : `穿梭机 ${Math.ceil(S.t)} 秒后到达`);
    if (G.webT > 0) t = '🕸 被蛛网粘住 · 急闪挣脱 · ' + t;
    ft.style.display = 'block'; ft.classList.toggle('safe', !(G.webT > 0) && E.lost < EVAC.maxLost - 4); ft.textContent = t; }
  else if (G.webT > 0 && state === 'play' && G.player.alive) { const ft = $('flareTag'); ft.style.display = 'block'; ft.classList.remove('safe'); ft.textContent = '🕸 被蛛网粘住 · 移动变慢、无法悬停 · 急闪挣脱'; }
  if (G.sky && state === 'play' && G.player.alive) { const ft = $('flareTag'), S = G.sky, live = S.shelters.filter((q) => q.alive).length, hp = S.shelters.reduce((a, q) => a + Math.max(0, q.hits), 0);
    const inc = G.enemies.filter((e) => e.kind === 'cruise' && e.alive).length, set = G.enemies.some((e) => e.kind === 'launcher' && e.alive && (e.st === 'setup' || e.st === 'fire'));
    let t = `🛡 避难所 ${live}/3 · 完整度 ${hp}/${SKY.hits * 3}`; if (inc) t = `🚀 巡航导弹来袭 ×${inc} · ` + t; else if (set) t = '⚠ 导弹车正在架设发射架 · ' + t;
    if (G.ciwsL.some((c) => c.me)) t = '◎ 近防炮开火中 · ' + t;
    ft.style.display = 'block'; ft.classList.toggle('safe', !inc && !set); ft.textContent = t; }
  if (G.courier && state === 'play' && G.player.alive) { const ft = $('flareTag'), CP = G.courier, c = CP.c, up = Math.floor(CP.up);
    let t = !c.alive ? `◎ 情报截获 · 上传停在 ${up}% · 击破「幻影」` : c.st === 'upload' ? (CP.jam ? `📡 干扰中！上传 ${up}%（变慢）` : `⚠ 信使正在上传 ${up}% · 贴近 24m 干扰`) : `📡 数据信使 · 上传 ${up}% · 距你 ${Math.round(Math.hypot(c.pos.x - G.player.pos.x, c.pos.z - G.player.pos.z))}m`;
    if (G.pBurnT > 0) t = '🔥 着火！ ' + t;
    ft.style.display = 'block'; ft.classList.toggle('safe', !c.alive || CP.jam || (c.st !== 'upload' && !(G.pBurnT > 0))); ft.textContent = t;
    if (CP.jam && !G.jamSaid) { G.jamSaid = true; showHint('干扰生效 · 上传速度降到 35%', 2); } }
  if (G.lance && state === 'play' && G.player.alive) { const ft = $('flareTag'), L = G.lance, n = L.dishes.filter((d) => d.alive).length;
    let t = L.hijack ? '◎ 轨道炮已夺取 · 光柱在追烧敌机' : L.st === 'idle' ? `☀ 轨道激光充能中 · ${Math.ceil(L.t)} 秒` : L.st === 'warn' ? '⚠ 光柱即将冲刺！' : L.st === 'drop' ? '⚠ 光柱正在你前方落下！' : `☀ 轨道激光 · 卫星天线 ${n}/3 · 距你 ${Math.round(Math.hypot(L.x - G.player.pos.x, L.z - G.player.pos.z))}m`;
    if (G.gravOn > 0) t += ' · 重力锁定：无法悬停'; if (G.lanceOnYou > 0) t = '🔥 被光柱灼烧！ ' + t;
    ft.style.display = 'block'; ft.classList.toggle('safe', L.hijack || (L.st !== 'warn' && !(G.lanceOnYou > 0) && !(G.gravOn > 0))); ft.textContent = t; G.lanceOnYou = Math.max(0, (G.lanceOnYou || 0) - 0.05);
    if (G.gravOn > 0 && !G.gravSaid) { G.gravSaid = true; showHint('重力锁（紫色力场）里推进器无法悬停、冲刺变慢 · 击毁它或离开力场', 4); } }
  if (G.beacon && state === 'play' && G.player.alive) { const ft = $('flareTag'), B = G.beacon;
    let t = B.done ? `⏱ ${B.t.toFixed(1)} 秒 · 击破「幻影」` : B.i === 0 ? `⏱ 飞过第一道信标门开始计时 · 起始 ${BEACON.t0} 秒` : `⏱ ${B.t.toFixed(1)} 秒 · 信标 ${B.i}/${BEACON.total}`;
    const tur = G.enemies.filter((e) => e.built && e.alive).length; if (tur) t += ` · 焊接炮台 ${tur}`;
    ft.style.display = 'block'; ft.classList.toggle('safe', B.flash > 0 || B.t > 20); ft.textContent = t; }
  if (G.fort && state === 'play' && G.player.alive) { const ft = $('flareTag'), F = G.fort, h = F.here, P = G.player;
    const n = F.pads.filter((q) => q.tur).length, hk = F.pads.filter((q) => q.tur && q.tur.hackT > 0).length;
    let t = '工事点 ' + F.pts + ' · 炮台 ' + n + '/' + F.pads.length;
    if (h) { const a = padAction(h), nm = a ? (a.kind === 'build' ? '建造' : a.kind === 'up' ? '升级' : '维修') : ''; t += a ? (a.cost <= F.pts ? ' · ' + nm + '中 ' + Math.round(h.k * 100) + '%' : ' · ' + nm + '需要 ' + a.cost + ' 点') : h.tur && h.tur.hackT > 0 ? ' · 炮台被劫持' : ' · 炮台已满级'; }
    else if (fortGoal(P.pos.x, P.pos.z)) t += ' · 可施工（雷达上的蓝框）';
    if (hk) t += ' · ' + hk + ' 座被劫持';
    ft.style.display = 'block'; ft.classList.toggle('safe', !hk); ft.textContent = t; }
  if (G.salv && state === 'play' && G.player.alive) { const ft = $('flareTag'), P = G.player, S = G.salv, pd = S.pad;
    const a = Math.atan2(-(pd.x - P.pos.x), -(pd.z - P.pos.z)) - cam.yaw, rel = ((a % 6.2832) + 9.4248) % 6.2832 - 3.1416, arr = Math.abs(rel) < 0.4 ? '↑' : Math.abs(rel) > 2.7 ? '↓' : rel > 0 ? '←' : '→';
    let t = '携带 ' + S.carried + '/' + SALV.carry + ' · 回收台 ' + arr + ' ' + Math.round(Math.hypot(pd.x - P.pos.x, pd.z - P.pos.z)) + ' m · 已交 ' + S.delivered + '/' + run.quota;
    if (S.cores.length) t += ' · 地上 ' + S.cores.length + ' 个'; if (S.lost) t += ' · 被抢走 ' + S.lost;
    ft.style.display = 'block'; ft.classList.toggle('safe', S.carried < 3); ft.textContent = t; }
  if (G.depot && state === 'play' && G.player.alive) { const ft = $('flareTag'), P = G.player, D = G.depot, c = nearestCharge(P.pos.x, P.pos.z);
    let t = '油罐 ' + D.tanks.filter((k) => k.alive).length + '/' + D.tanks.length + ' · ' + D.tanks.map((k) => k.alive ? Math.ceil(k.hp / k.maxHp * 100) + '%' : '×').join(' ');
    if (c) { const a = Math.atan2(-(c.x - P.pos.x), -(c.z - P.pos.z)) - cam.yaw, rel = ((a % 6.2832) + 9.4248) % 6.2832 - 3.1416, arr = Math.abs(rel) < 0.4 ? '↑' : Math.abs(rel) > 2.7 ? '↓' : rel > 0 ? '←' : '→'; t += ' · 炸药 ' + arr + ' ' + Math.round(Math.hypot(c.x - P.pos.x, c.z - P.pos.z)) + ' m · ' + Math.ceil(c.t) + ' 秒' + (D.charges.length > 1 ? '（共 ' + D.charges.length + ' 枚）' : '') + (c.k > 0 ? ' · 拆除中 ' + Math.round(c.k * 100) + '%' : ''); }
    ft.style.display = 'block'; ft.classList.toggle('safe', !c); ft.textContent = t; }
  if (G.fog && state === 'play' && G.player.alive) { const ft = $('flareTag'), P = G.player; let L = null, bd = 1e9; for (const l of G.fog.lamps) if (!l.lit) { const dd = Math.hypot(l.x - P.pos.x, l.z - P.pos.z); if (dd < bd) { bd = dd; L = l; } }
    let t = '雾灯 ' + G.fog.lit + '/' + G.fog.lamps.length;
    if (L) { const a = Math.atan2(-(L.x - P.pos.x), -(L.z - P.pos.z)) - cam.yaw, rel = ((a % 6.2832) + 9.4248) % 6.2832 - 3.1416, arr = Math.abs(rel) < 0.4 ? '↑' : Math.abs(rel) > 2.7 ? '↓' : rel > 0 ? '←' : '→'; t += ' · 最近未点亮 ' + arr + ' ' + Math.round(bd) + ' m' + (L.k > 0 ? ' · 点亮中 ' + Math.round(L.k * 100) + '%' : ''); }
    ft.style.display = 'block'; ft.classList.toggle('safe', !L); ft.textContent = t;
    if (!G.fogSaid && run.t > 2) { G.fogSaid = true; showHint('浓雾 · 雷达只能看到 40 m 内和刚开过火的敌机 · 去雾灯旁站 3 秒点亮它', 5); } }
  if (G.supply && state === 'play' && G.player.alive) { const ft = $('flareTag'), P = G.player, c = nearestCrate(P.pos.x, P.pos.z, 400); let t = '';
    if (G.pBoostT > 0) t = '伤害强化 ' + G.pBoostT.toFixed(0) + ' 秒';
    if (c) { const dx = c.x - P.pos.x, dz = c.z - P.pos.z, a = Math.atan2(-dx, -dz) - cam.yaw, rel = ((a % 6.2832) + 9.4248) % 6.2832 - 3.1416, arr = Math.abs(rel) < 0.4 ? '↑' : Math.abs(rel) > 2.7 ? '↓' : rel > 0 ? '←' : '→'; t = (t ? t + ' · ' : '') + '补给箱 ' + arr + ' ' + Math.round(Math.hypot(dx, dz)) + ' m' + (c.st === 'fall' ? ' · 降落中' : ''); }
    else if (G.supply.crates.some((k) => k.st === 'carried')) t = (t ? t + ' · ' : '') + '补给箱被抢夺机抓走了';
    ft.style.display = t ? 'block' : 'none'; ft.classList.toggle('safe', G.pBoostT > 0); if (t) ft.textContent = t; }
  if (G.traffic && state === 'play' && G.player.alive) { const ft = $('flareTag'), n = G.leechOn || 0; ft.style.display = n ? 'block' : 'none'; ft.classList.remove('safe'); if (n) ft.textContent = '寄生体 ×' + n + ' · 正在吸能 · 急闪（Shift）甩掉'; }
  { const T = G.thunder, ft = $('flareTag');
    if (T && state === 'play' && G.player.alive) { const P = G.player, L = T.lock, cov = rodCover(P.pos.x, P.pos.z), high = P.pos.y - groundAt(P.pos.x, P.pos.z, P.pos.y + 1) > THUNDER.hov;
      let txt = '', safe = false;
      if (L && L.isP) txt = '⚡ 雷击锁定 ' + Math.max(0, L.t).toFixed(1) + ' s · 落地或进入避雷塔圈'; else if (high && cov) { txt = '⚡ 避雷塔保护中'; safe = true; } else if (high) txt = '⚡ 高空暴露 · 会被雷击锁定';
      ft.style.display = txt ? 'block' : 'none'; ft.classList.toggle('safe', safe); ft.textContent = txt; } }
  if (G.maze && state === 'play' && G.player.alive) { const ft = $('flareTag'), S = G.maze, P = G.player;
    let t = S.t <= MAZE.warn ? `▦ 墙体换位 ${Math.max(0, S.t).toFixed(1)} 秒 · 避开黄色条纹` : `▦ 升降墙 · ${Math.ceil(S.t)} 秒后换位`, safe = S.t > MAZE.warn;
    if (G.canopyOn > 0) { t = '⚠ 激光天幕灼烧中 · 降到 11 m 以下'; safe = false; } else if (P.pos.y > MAZE.burnAt - 2.5) { t = '⚠ 接近激光天幕 · ' + t; safe = false; }
    ft.style.display = 'block'; ft.classList.toggle('safe', safe); ft.textContent = t; }
  if (G.glad && state === 'play' && G.player.alive) { const ft = $('flareTag'), A = G.glad, h = Math.round(A.h), nb = Math.round(A.h / 10);
    ft.style.display = 'block';
    const bar = '▮'.repeat(nb) + '▯'.repeat(10 - nb), msg = run.hypeMsgT > 0 ? ` · ${run.hypeMsg}` : '';
    if (A.zeroAcc > 0.4) { ft.classList.remove('safe'); ft.textContent = `👎 冷场 · ${Math.max(0, GLAD.zeroT - A.zeroAcc).toFixed(1)} 秒后被轰下台 · 快去击杀`; }
    else if (A.h >= GLAD.frenzy) { ft.classList.add('safe'); ft.textContent = `🔥 全场沸腾 ${h}% ${bar} · 伤害 ×${GLAD.fdmg}${msg}`; }
    else if (A.h <= GLAD.booed) { ft.classList.remove('safe'); ft.textContent = `👎 喝倒彩 ${h}% ${bar}${msg}`; }
    else { ft.classList.add('safe'); ft.textContent = `👏 人气 ${h}% ${bar}${msg}`; } }
  if (G.turf && state === 'play' && G.player.alive) { const ft = $('flareTag'), [a, b] = turfShare(), A = Math.round(a * 100), B = Math.round(b * 100), on = G.player.grounded ? turfAt(G.player.pos.x, G.player.pos.z) : 0;
    const nb = Math.round(a / Math.max(0.001, a + b) * 10), bar = '▮'.repeat(nb) + '▯'.repeat(10 - nb), tl = mmss(Math.max(0, TURF.dur - run.tfC)) + (G.turf.mul > 1 ? ' · 涂装 ×1.5' : '');
    ft.style.display = 'block';
    if (on === 2) { ft.classList.remove('safe'); ft.textContent = `⚠ 踩在洋红上 · 减速掉装甲 · 青 ${A}% ${bar} 洋 ${B}% · ${tl}`; }
    else { ft.classList.add('safe'); ft.textContent = `🎨 青 ${A}% ${bar} 洋 ${B}% · ${tl}${on === 1 ? ' · 青色加速中' : ''}`; } }
  if (G.atom && state === 'play' && G.player.alive) { const ft = $('flareTag'), A = G.atom, vk = Math.min(A.dose, ATOM.vulnCap) / ATOM.vulnK;
    ft.style.display = 'block';
    const dz = `辐射 ${Math.round(A.dose)} rad` + (vk > 0.01 ? ` · 受伤 ×${(1 + vk).toFixed(2)}` : '');
    if (A.dose > ATOM.sick) { ft.classList.remove('safe'); ft.textContent = `☢ 辐射病 ${Math.round(A.dose)} rad · 去洗消台`; }
    else if (A.at && A.at.cont) { ft.classList.remove('safe'); ft.textContent = `⚠ 冷却泵附近有敌机 · 清掉它们才能继续重启 · ${dz}`; }
    else if (A.at) { ft.classList.add('safe'); ft.textContent = `🔧 重启冷却泵 ${Math.floor(A.at.k * 100)}% · ${dz}`; }
    else if (A.pads.some((d) => d.on)) { ft.classList.add('safe'); ft.textContent = `🚿 洗消中 · ${dz}`; }
    else if (A.rate > 0) { ft.classList.remove('safe'); ft.textContent = `☢ 辐射区 +${A.rate.toFixed(1)}/秒 · ${dz}`; }
    else { ft.classList.add('safe'); ft.textContent = `☢ 堆芯 ${Math.floor(A.heat)}% · ${dz}`; } }
  if (G.bio && state === 'play' && G.player.alive) { const ft = $('flareTag'), B = G.bio, P = G.player;
    ft.style.display = 'block';
    if (P.creepMul < 1) { ft.classList.remove('safe'); ft.textContent = '⚠ 站在菌毯上 · 减速并掉装甲 · 跳起来'; }
    else if (B.touch) { ft.classList.remove('safe'); ft.textContent = `⚠ 菌毯正在侵蚀净化塔 ×${B.touch}`; }
    else if (B.down >= B.nodes.length) { ft.classList.add('safe'); ft.textContent = '🧬 菌毯正在退去'; }
    else { const sd = G.enemies.filter((e) => e.kind === 'seeder' && e.alive && !e.dying).length, tm = G.enemies.filter((e) => e.kind === 'tumor' && e.alive && !e.dying).length; ft.classList.add('safe'); ft.textContent = `🧬 播种者 ${sd} · 菌瘤 ${tm}`; } }
  if (G.tsu && state === 'play' && G.player.alive) { const ft = $('flareTag'), T = G.tsu, P = G.player, eta = tsuEta();
    ft.style.display = 'block';
    if (inWave(P.pos)) { ft.classList.remove('safe'); ft.textContent = '⚠ 被巨浪卷走 · 往上飞出浪头'; }
    else if (eta === null) { ft.classList.add('safe'); ft.textContent = T.down >= 3 ? '🌊 海面已平息' : '🌊 巨浪已经过去'; }
    else if (eta < 12) { ft.classList.remove('safe'); ft.textContent = `⚠ 巨浪 ${eta.toFixed(1)} 秒后到达 · 升到 ${T.h} m 以上或上屋顶`; }
    else { ft.classList.add('safe'); ft.textContent = `🌊 下一道巨浪 ${Math.ceil(eta)} 秒 · 浪高 ${T.h} m`; } }
  if (G.factory && state === 'play' && G.player.alive) { const ft = $('flareTag'), P = G.player;
    const pr = G.presses.find((q) => (q.st === 'warn' || q.st === 'drop') && Math.abs(P.pos.x - q.x) < FACT.plate + 2 && Math.abs(P.pos.z - q.z) < FACT.plate + 2);
    const bt = G.belts.find((b) => Math.abs(P.pos.z - b.z) < FACT.half && Math.abs(P.pos.x) < FACT.len / 2);
    if (pr) { ft.style.display = 'block'; ft.classList.remove('safe'); ft.textContent = '⚠ 液压机即将砸下 · 离开红色区域'; }
    else if (bt && P.grounded) { ft.style.display = 'block'; ft.classList.add('safe'); ft.textContent = bt.dir > 0 ? '▶ 传送带 · 向东推送' : '◀ 传送带 · 向西推送'; }
    else ft.style.display = 'none'; }
  $('spotTag').style.display = G.spotT > 0 && G.player.alive && state === 'play' ? 'block' : 'none';
  if (G.hf && state === 'play' && G.player.alive) { const ft = $('flareTag'), F = G.hf; let t;
    if (!F.h) t = run.breakT > 0 ? `💣 整备中 · 炸弹已炸毁 ${F.kills} 台` : `💣 下一枚炸弹 ${Math.max(0, F.next).toFixed(1)} 秒 · 已炸毁 ${F.kills} 台`;
    else if (F.h === 'P') t = `💣 炸弹在你身上 · ${F.t.toFixed(1)} 秒 · 贴近敌机 7 m 传出去${F.cool > 0 ? ' · 刚接手' : F.passK > 0 ? ' · 传递中…' : ''}`;
    else t = `💣 炸弹在${F.h.kind === 'boss' || F.h.kind === 'raider' ? '头目' : '敌机'}身上 · ${F.t.toFixed(1)} 秒 · 离你 ${Math.round(F.h.c.distanceTo(G.player.pos))} m${F.h.bubbled ? ' · 被泡住了' : ' · 别让它靠近'}${F.h.kind === 'boss' || F.h.kind === 'raider' ? '' : ' · 炸弹护体：只吃 25% 伤害'}`;
    ft.style.display = 'block'; ft.classList.toggle('safe', F.h !== 'P'); ft.textContent = t; }
  if (G.ctf && state === 'play' && G.player.alive) { const ft = $('flareTag'), S = G.ctf, st = (f) => f.st === 'home' ? '在家' : f.st === 'carried' ? (f.carrier === G.player ? '在你手上' : '被夺走') : `落地 ${Math.ceil(f.dropT)} 秒`;
    ft.style.display = 'block'; ft.classList.toggle('safe', S.flags.P.st === 'home'); ft.textContent = S.grabK > 0.02 ? `🚩 拔旗中 ${Math.round(S.grabK * 100)}% · 留在旗旁` : `🚩 夺旗 ${S.caps}/${CTF.need} · 失守 ${S.lost}/${CTF.foeNeed} · 我方旗${st(S.flags.P)} · 敌旗${st(S.flags.E)}`; }
  if (G.polar && state === 'play' && G.player.alive) { const ft = $('flareTag'), S = G.polar;
    const w = S.pause ? '' : S.warned ? ` · ⚡ 极性波 ${Math.max(0, S.waveT).toFixed(1)} 秒` : ` · 翻转 ${Math.ceil(S.waveT)} 秒`;
    ft.style.display = 'block'; ft.classList.toggle('safe', S.p === 'B'); ft.textContent = `${S.p === 'R' ? '🔴 红' : '🔵 蓝'}极性 · X 切换 · 已吸收 ${S.abs}${w}`; }
  { const ft = $('flareTag'), on = G.scramT > 0 && state === 'play' && G.player.alive, cur = ft.textContent.startsWith('⇄') ? ft.textContent.replace(/^⇄[^·]*·\s?/, '') : ft.textContent;
    if (on) { ft.style.display = 'block'; ft.classList.remove('safe'); ft.textContent = `⇄ 方向反转 ${G.scramT.toFixed(1)} 秒 · ${cur}`; }
    else if (ft.textContent.startsWith('⇄')) { if (cur) ft.textContent = cur; else ft.style.display = 'none'; } }
  { const sc = $('scram'); if (sc) sc.style.opacity = G.scramT > 0 && state === 'play' ? (0.3 + 0.45 * Math.min(1, G.scramT)).toFixed(3) : '0'; }
  { const dz = $('dazzle'); if (dz) { const k = G.dazzleT > 0 && state === 'play' ? Math.min(1, G.dazzleT / DAZZ.blind) : 0; dz.style.opacity = k > 0 ? (0.25 + 0.72 * Math.pow(k, 0.6)).toFixed(3) : '0'; } }
  { const gl = $('glare'), on = MISSIONS[cfg.mission].glare && state === 'play';
    if (!on) gl.style.opacity = 0; else { camera.getWorldDirection(_glv); const k = Math.max(0, (_glv.dot(SUN_DIR) - 0.72) / 0.28); _glp.copy(camera.position).addScaledVector(SUN_DIR, 600).project(camera);
      gl.style.opacity = (k * k * 0.9).toFixed(3); gl.style.background = `radial-gradient(circle at ${(_glp.x * 50 + 50).toFixed(1)}% ${(50 - _glp.y * 50).toFixed(1)}%, rgba(255,252,240,0.98) 0%, rgba(255,246,222,0.6) 16%, rgba(255,240,210,0.12) 45%, rgba(255,240,210,0) 70%)`; } }
  { const wt = $('windTag'); const on = WIND.on && state === 'play'; wt.style.display = on ? 'block' : 'none';
    if (on) { if (G.windShiftT > 0) G.windShiftT -= 1 / 60; const sh = G.windShiftT > 0, a = sh ? WIND.next : WIND.a; wt.classList.toggle('shift', sh);
      const wx = Math.cos(a), wz = Math.sin(a), fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      const sx = wx * rx + wz * rz, sy = -(wx * fx + wz * fz); wt.lastChild.style.transform = 'rotate(' + Math.atan2(sx, -sy).toFixed(2) + 'rad)'; } }
  $('frostVig').style.opacity = G.player.alive && state === 'play' ? (G.frozenT > 0 ? 0.95 : Math.min(0.8, G.pChill * 0.8)).toFixed(2) : '0';
  $('acidVig').style.opacity = G.inAcid && G.player.alive ? (0.55 + Math.sin(performance.now() / 160) * 0.08).toFixed(2) : '0';
  if (G.inAcid && !G.acidSaid) { G.acidSaid = true; showHint('酸雾 · 雾里每秒腐蚀装甲 · 离开绿色雾区（敌机进去也会被腐蚀）', 4); }
  $('stormVig').style.opacity = run.ring && run.ring.out > 0 && G.player.alive ? Math.min(0.9, 0.4 + run.ring.out / 40 + Math.sin(performance.now() / 140) * 0.06).toFixed(2) : '0';
  $('hurt').style.opacity = Math.min(0.9, G.hud.hurt + (hpK < 0.25 ? 0.25 + Math.sin(performance.now() / 180) * 0.1 : 0)).toFixed(2);
  // waves / boss
  if (run.wave >= 0) {
    $('waveTitle').textContent = curWave().title;
    const left = G.enemies.filter((e) => e.alive).length;
    const rl = G.enemies.filter((e) => e.kind === 'relay' && e.alive).length;
    $('waveSub').textContent = run.breakT > 0 ? '整备中…' : run.ctf && G.ctf ? (G.ctf.flags.P.st === 'carried' ? '你的旗被夺走 · 击毁携旗的迅猛机' : G.ctf.flags.P.st === 'dropped' ? '把落地的旗送回基地' : G.ctf.flags.E.carrier === G.player ? '把敌旗带回你的基地' : `去敌方基地夺旗 · ${G.ctf.caps} / ${CTF.need}`) : run.hf && G.hf && G.hf.h === 'P' ? '把炸弹传给敌机' : run.hf && G.hf && G.hf.h ? '别让带炸弹的敌机靠近' : run.turf && G.turf ? (run.tfBoss && G.boss && G.boss.alive ? '击败「暴君」· 守住地盘' : '涂得比敌人多 · 先打喷涂车') : run.glad && G.glad ? (run.gRound < 0 || run.gBreak ? `下一轮 ${Math.max(0, Math.ceil(run.gT))} 秒后开始` : run.gRound >= 4 ? '击败冠军「暴君」' : `第 ${run.gRound + 1}/5 轮 · 剩余 ${G.enemies.filter((e) => e.alive && !e.dying).length + run.gq.length}`) : run.meltdown && G.atom ? (G.atom.fixed < G.atom.pumps.length ? `冷却泵 ${G.atom.fixed}/${G.atom.pumps.length} · 堆芯 ${Math.floor(G.atom.heat)}%` : '击破「暴君」') : run.creep && G.bio ? (G.bio.nodes.some((f) => f.alive) ? `菌巢 ${G.bio.nodes.filter((f) => f.alive).length}/3` + (G.bio.touch ? ` · 菌毯侵蚀净化塔 ×${G.bio.touch}` : '') : '击破「暴君」') : run.tsunami && G.tsu ? (G.tsu.pumps.some((f) => f.alive) ? `潮汐泵 ${G.tsu.pumps.filter((f) => f.alive).length}/3 · 浪高 ${G.tsu.h} m` : '击破「暴君」') : run.factory && G.factory ? (G.factory.fabs.some((f) => f.alive) ? `制造厂 ${G.factory.fabs.filter((f) => f.alive).length}/3` : '击破「暴君」') : run.decap && G.decap ? (!G.decap.found ? `扫描指挥官 · 诱饵 ${G.decap.ms.filter((m) => !m.real && m.known).length}/3` : '在登机前击毁指挥官') : run.sabot && G.sabot ? (G.boss && G.boss.alive ? '击破「幻影」' : `能源塔 ${G.sabot.gens.length - G.sabot.done}/${G.sabot.gens.length} · 轨道炮 ${Math.ceil(G.sabot.t)} 秒`) : run.rescue && G.evac ? (G.boss && G.boss.alive ? `撤离 ${G.evac.saved}/${EVAC.goal} · 击破「暴君」` : `撤离 ${G.evac.saved}/${EVAC.goal} · 伤亡 ${G.evac.lost}/${EVAC.maxLost}`) : run.sky && G.sky ? (run.skyBreak > 0 ? '下一波即将到来…' : `第 ${run.skyW}/3 波 · 导弹车 ${G.enemies.filter((e) => e.kind === 'launcher' && e.alive).length}`) : run.pursuit && G.courier ? (G.courier.c.alive ? `情报上传 ${Math.floor(G.courier.up)}%` : '击破「幻影」') : run.lance && G.lance ? (G.lance.hijack ? '击破「暴君」' : `卫星天线 ${G.lance.dishes.filter((d) => d.alive).length}/3`) : run.beacon && G.beacon ? (G.beacon.done ? `剩余 ${G.beacon.t.toFixed(0)} 秒 · 击破「幻影」` : `信标 ${G.beacon.i}/${BEACON.total} · 剩余 ${G.beacon.t.toFixed(0)} 秒`) : run.lane && G.lane ? (G.lane.towers.some((t) => t.alive) ? `防御塔 ${G.lane.towers.filter((t) => t.alive).length}/2 · 敌机 ${left}` : `要塞 ${Math.ceil(G.lane.cit.hp / G.lane.cit.maxHp * 100)}% · 敌机 ${left}`) : run.extract ? (run.evac ? `撤离 ${Math.floor(run.evac.k * 100)}%` : `数据 ${run.got}/3`) + ` · 敌机 ${left}` : run.salvage && G.salv ? `回收 ${G.salv.delivered}/${run.quota} · 敌机 ${left}` : run.capture ? run.zones.map((z) => `${z.name}${z.own === 'P' ? '◆' : z.own === 'E' ? '✕' : '○'}`).join(' ') + ` · 敌机 ${left}` : (G.train && G.train.alive ? `逃脱 ${Math.floor(G.train.timeLeft() / 60)}:${String(Math.floor(G.train.timeLeft() % 60)).padStart(2, '0')} · 车厢 ${G.train.parts.filter((q) => q.alive && q.key !== 'loco').length}/3 · 敌机 ${left - 1}` : rl ? `中继塔 ${rl} · 敌机 ${left - rl}` : `剩余敌机 ${left}`);
  } else { $('waveTitle').textContent = 'STANDBY'; $('waveSub').textContent = ''; }
  const cb = $('coreBox'); cb.classList.toggle('hidden', !G.core && !run.capture && !run.extract && !run.salvage);
  if (run.extract && !G.core) {
    const act = run.zones.find((z) => z.kind === 'cache' && z.k > 0 && z.k < 1), v = run.evac ? run.evac.k : (run.got + (act ? act.k : 0)) / 3;
    $('coreName').textContent = run.evac ? '撤离回收 EVAC' : `数据 DATA ${run.got}/3` + (act ? ` · 下载 ${act.name}` : '');
    $('coreBar').firstElementChild.style.width = (v * 100).toFixed(1) + '%'; $('coreBar').classList.remove('low'); $('corePct').textContent = Math.floor(v * 100) + '%'; cb.classList.remove('hit');
  }
  if (run.salvage && G.salv && !G.core) { const f = Math.min(1, G.salv.delivered / run.quota); $('coreName').textContent = '回收核心 SALVAGE'; $('coreBar').firstElementChild.style.width = (f * 100).toFixed(1) + '%'; $('coreBar').classList.remove('low'); $('corePct').textContent = G.salv.delivered + '/' + run.quota; cb.classList.remove('hit'); }
  if (run.capture && !G.core) { $('coreName').textContent = '上行链路 UPLINK'; $('coreBar').firstElementChild.style.width = (run.up * 100).toFixed(1) + '%'; $('coreBar').classList.remove('low'); $('corePct').textContent = Math.floor(run.up * 100) + '%'; cb.classList.remove('hit'); }
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
  const W = radar.width, R = W / 2, K = R / (140 * (p.frame.radar || 1));   // radar head: wider radar
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
  if (PLAT.R) { rctx.beginPath(); rctx.arc(-p.pos.x * K, -p.pos.z * K, PLAT.R * K, 0, Math.PI * 2); rctx.stroke(); }
  else rctx.strokeRect((-ARENA - p.pos.x) * K, (-ARENA - p.pos.z) * K, ARENA * 2 * K, ARENA * 2 * K);
  if (run.ring) {
    const Rg = run.ring; rctx.strokeStyle = 'rgba(190, 120, 255, 0.9)'; rctx.lineWidth = 3; rctx.beginPath(); rctx.arc((Rg.x - p.pos.x) * K, (Rg.z - p.pos.z) * K, Rg.r * K, 0, Math.PI * 2); rctx.stroke();
    if (stormNext.visible) { rctx.strokeStyle = 'rgba(235, 245, 255, 0.75)'; rctx.lineWidth = 1.5; rctx.setLineDash([5, 5]); rctx.beginPath(); rctx.arc((Rg.x1 - p.pos.x) * K, (Rg.z1 - p.pos.z) * K, Rg.r1 * K, 0, Math.PI * 2); rctx.stroke(); rctx.setLineDash([]); }
  }
  if (G.glad) for (const V of G.glad.vents) { rctx.fillStyle = V.st === 'fire' ? '#ff6020' : V.st === 'warn' ? '#ffb040' : 'rgba(255,170,90,0.3)'; rctx.beginPath(); rctx.arc((V.x - p.pos.x) * K, (V.z - p.pos.z) * K, Math.max(2.5, GLAD.ventR * K), 0, Math.PI * 2); rctx.fill(); }
  if (G.ctf) for (const t of ['P', 'E']) {   // flags: a little pennant on the radar, a ring at each base
    const f = G.ctf.flags[t], x = (f.pos.x - p.pos.x) * K, z = (f.pos.z - p.pos.z) * K, hx = (f.home.x - p.pos.x) * K, hz = (f.home.z - p.pos.z) * K, col = t === 'P' ? '#40e0ff' : '#ff4848';
    rctx.strokeStyle = col; rctx.lineWidth = 1.5; rctx.beginPath(); rctx.arc(hx, hz, 5, 0, Math.PI * 2); rctx.stroke();
    if (f.st !== 'home' && Math.sin(G.time * 8) < -0.3) continue;
    rctx.fillStyle = col; rctx.fillRect(x - 1, z - 7, 2, 10); rctx.beginPath(); rctx.moveTo(x + 1, z - 7); rctx.lineTo(x + 8, z - 4.5); rctx.lineTo(x + 1, z - 2); rctx.fill();
  }
  if (G.atom) {
    rctx.lineWidth = 1;
    for (const Z of G.atom.zones) { if (Z.w < 0.05) continue; rctx.fillStyle = `rgba(150, 255, 60, ${0.14 * Z.w})`; rctx.strokeStyle = `rgba(170, 255, 80, ${0.5 * Z.w})`; rctx.beginPath(); rctx.arc((Z.x - p.pos.x) * K, (Z.z - p.pos.z) * K, Z.r * K, 0, Math.PI * 2); rctx.fill(); rctx.stroke(); }
    for (const q of G.atom.pumps) { rctx.fillStyle = q.fixed ? '#60ff80' : '#ffd040'; rctx.fillRect((q.x - p.pos.x) * K - 3.5, (q.z - p.pos.z) * K - 3.5, 7, 7); }
    rctx.fillStyle = '#80d8ff'; for (const d of G.atom.pads) { rctx.beginPath(); rctx.arc((d.x - p.pos.x) * K, (d.z - p.pos.z) * K, 3.5, 0, Math.PI * 2); rctx.fill(); }
  }
  if (G.bio) {
    rctx.fillStyle = 'rgba(150, 255, 60, 0.16)'; rctx.strokeStyle = 'rgba(170, 255, 90, 0.55)'; rctx.lineWidth = 1;
    for (const c of G.bio.circles) { if (c.r < 1) continue; rctx.beginPath(); rctx.arc((c.x - p.pos.x) * K, (c.z - p.pos.z) * K, c.r * K, 0, Math.PI * 2); rctx.fill(); rctx.stroke(); }
  }
  if (G.tsu) {
    const T = G.tsu;
    if (T.st === 'wave') { rctx.fillStyle = 'rgba(80, 190, 255, 0.35)'; rctx.fillRect((T.X - TSU.thick - p.pos.x) * K, (-ARENA - p.pos.z) * K, TSU.thick * K, ARENA * 2 * K); rctx.fillStyle = '#e8fbff'; rctx.fillRect((T.X - p.pos.x) * K - 1, (-ARENA - p.pos.z) * K, 2, ARENA * 2 * K); }
    else if (T.st === 'warn') { rctx.fillStyle = G.time % 0.5 < 0.25 ? '#ff4020' : 'rgba(255, 64, 32, 0.4)'; rctx.fillRect((-ARENA - p.pos.x) * K, (-ARENA - p.pos.z) * K, 3, ARENA * 2 * K); }
  }
  if (G.factory) {
    for (const b of G.belts) { rctx.fillStyle = 'rgba(216, 168, 40, 0.3)'; rctx.fillRect((-FACT.len / 2 - p.pos.x) * K, (b.z - FACT.half - p.pos.z) * K, FACT.len * K, FACT.half * 2 * K); }
    for (const pr of G.presses) { rctx.fillStyle = pr.st === 'warn' || pr.st === 'drop' ? '#ff4020' : 'rgba(150, 150, 160, 0.6)'; rctx.fillRect((pr.x - 3 - p.pos.x) * K, (pr.z - 3 - p.pos.z) * K, 6 * K, 6 * K); }
  }
  if (G.maze) for (const w of G.maze.walls) { if (w.k < 0.15 && !(w.warnT > 0)) continue; rctx.fillStyle = w.warnT > 0 && w.k < 0.5 ? '#ffc030' : 'rgba(205, 215, 228, 0.7)'; rctx.fillRect((w.x - w.hw - p.pos.x) * K, (w.z - w.hd - p.pos.z) * K, Math.max(1.5, w.hw * 2 * K), Math.max(1.5, w.hd * 2 * K)); }
  for (const r of G.rings) { rctx.strokeStyle = r.type === 'low' ? 'rgba(255, 150, 60, 0.8)' : 'rgba(80, 220, 255, 0.8)'; rctx.lineWidth = 1.5; rctx.beginPath(); rctx.arc((r.x - p.pos.x) * K, (r.z - p.pos.z) * K, r.R * K, 0, Math.PI * 2); rctx.stroke(); }
  for (const e of G.enemies) {
    if (e.kind === 'burrower' && e.cloaked && e.alive && !G.jammed) { rctx.fillStyle = 'rgba(190, 140, 90, 0.55)'; rctx.beginPath(); rctx.arc((e.pos.x - p.pos.x) * K, (e.pos.z - p.pos.z) * K, 3.5, 0, Math.PI * 2); rctx.fill(); continue; }
    if (!e.alive || e.cloaked || (G.jammed && e.kind !== 'boss') || !fogSeen(e)) continue;
    const x = (e.c.x - p.pos.x) * K, z = (e.c.z - p.pos.z) * K;
    if (G.hf && G.hf.h === e) { rctx.strokeStyle = '#ff4020'; rctx.lineWidth = 2.5; rctx.beginPath(); rctx.arc(x, z, 8 + 2.5 * Math.sin(G.time * 10), 0, Math.PI * 2); rctx.stroke(); }
    if (G.polar && e.pol) { rctx.fillStyle = e.pol === 'R' ? '#ff5050' : '#50b0ff'; const rr = e.kind === 'boss' ? 7 : e.kind === 'dyad' ? 5 : 3.5; rctx.beginPath(); rctx.arc(x, z, rr, 0, Math.PI * 2); rctx.fill(); continue; }
    if (e.kind === 'scrambler') { rctx.fillStyle = e.st === 'charge' ? '#d8ff80' : '#7cff2a'; rctx.beginPath(); rctx.arc(x, z, e.st === 'charge' ? 6 : 4.5, 0, Math.PI * 2); rctx.fill(); continue; }
    if (e.kind === 'dropship') { rctx.fillStyle = e.cargo ? '#ffcc40' : '#8a7a50'; rctx.save(); rctx.translate(x, z); rctx.rotate(-e.yaw); rctx.beginPath(); rctx.moveTo(0, -9); rctx.lineTo(-7, 7); rctx.lineTo(7, 7); rctx.fill(); rctx.restore(); continue; }
    if (e.kind === 'warden') { if (e.domeOn()) { rctx.strokeStyle = 'rgba(255, 176, 80, 0.55)'; rctx.lineWidth = 1.5; rctx.beginPath(); rctx.arc(x, z, e.R * K, 0, Math.PI * 2); rctx.stroke(); } rctx.fillStyle = '#ffb050'; rctx.beginPath(); rctx.moveTo(x, z - 6); rctx.lineTo(x + 6, z); rctx.lineTo(x, z + 6); rctx.lineTo(x - 6, z); rctx.fill(); continue; }
    if (e.kind === 'howitzer') { rctx.fillStyle = '#ff9a40'; rctx.fillRect(x - 5, z - 5, 10, 10); rctx.strokeStyle = '#2a1a10'; rctx.lineWidth = 1.5; rctx.strokeRect(x - 5, z - 5, 10, 10); continue; }
    if (e.kind === 'engineer') { rctx.fillStyle = '#ffc830'; rctx.fillRect(x - 4, z - 4, 8, 8); continue; }
    if (e.kind === 'jammer') { rctx.fillStyle = '#c070ff'; rctx.beginPath(); rctx.arc(x, z, 5, 0, Math.PI * 2); rctx.fill(); continue; }
    if (e.kind === 'anchor') { rctx.strokeStyle = 'rgba(176, 96, 255, 0.7)'; rctx.lineWidth = 1.5; rctx.beginPath(); rctx.arc(x, z, ANCHOR.R * K, 0, Math.PI * 2); rctx.stroke(); }
    if (e.kind === 'marshal') { if (e.known) { rctx.fillStyle = '#ff3020'; rctx.beginPath(); rctx.moveTo(x, z - 7); rctx.lineTo(x + 6, z); rctx.lineTo(x, z + 7); rctx.lineTo(x - 6, z); rctx.fill(); } else { rctx.fillStyle = '#ffd040'; rctx.fillRect(x - 5, z - 5, 10, 10); rctx.fillStyle = '#201a10'; rctx.font = 'bold 9px sans-serif'; rctx.textAlign = 'center'; rctx.fillText('?', x, z + 3); } continue; }
    if (e.kind === 'pulsar') { rctx.fillStyle = e.next === 'low' ? '#ff9a40' : '#50dcff'; rctx.beginPath(); rctx.arc(x, z, e.st === 'charge' ? 6 : 4.5, 0, Math.PI * 2); rctx.fill(); continue; }
    if (e.kind === 'dazzler' && e.st === 'charge') { rctx.strokeStyle = '#ffffff'; rctx.lineWidth = 2; rctx.beginPath(); rctx.arc(x, z, 5, 0, Math.PI * 2); rctx.stroke(); }
    if (e.kind === 'reviver') { rctx.strokeStyle = '#50ff90'; rctx.lineWidth = 2; rctx.beginPath(); rctx.arc(x, z, 4.5, 0, Math.PI * 2); rctx.stroke(); continue; }
    if (e.hacked) { rctx.fillStyle = '#70ffb8'; rctx.beginPath(); rctx.arc(x, z, 4, 0, Math.PI * 2); rctx.fill(); continue; }
    if (e.kind === 'cruise') { rctx.fillStyle = '#ff9a40'; rctx.beginPath(); rctx.arc(x, z, 3, 0, Math.PI * 2); rctx.fill(); continue; }
    if (e.kind === 'relay' || e.kind === 'dish' || e.kind === 'fab' || e.kind === 'pump' || e.kind === 'bionode' || e.kind === 'courier' || e.kind === 'launcher' || e.kind === 'tower' || e.kind === 'citadel') { rctx.fillStyle = e.kind === 'citadel' && e.shielded ? '#ff6040' : '#ffd23a'; rctx.save(); rctx.translate(x, z); rctx.rotate(Math.PI / 4); rctx.fillRect(-6, -6, 12, 12); rctx.restore(); continue; }
    rctx.fillStyle = e.kind === 'boss' ? '#ff8a1a' : '#ff4a3a';
    if (e.kind === 'raider') rctx.fillStyle = '#ff9a5a';
    const s = e.kind === 'boss' ? 9 : e.kind === 'gunship' || e.kind === 'raider' ? 8 : e.kind === 'walker' || e.kind === 'bulwark' ? 7 : 5;
    rctx.fillRect(x - s / 2, z - s / 2, s, s);
  }
  if (run.capture || run.extract) for (const z of run.zones) { const x = (z.x - p.pos.x) * K, y = (z.z - p.pos.z) * K; rctx.strokeStyle = z.kind === 'evac' ? '#6dff9a' : z.own === 'P' ? '#5fe3ff' : z.own === 'E' ? '#ff4a3a' : z.kind === 'cache' ? '#ffd23a' : '#e8e8e8'; rctx.lineWidth = 3; rctx.beginPath(); rctx.arc(x, y, Math.max(6, z.R * K), 0, Math.PI * 2); rctx.stroke(); rctx.fillStyle = rctx.strokeStyle; rctx.font = 'bold 13px system-ui'; rctx.textAlign = 'center'; rctx.textBaseline = 'middle'; rctx.fillText(z.name, x, y); }
  rctx.fillStyle = '#ffb040'; if (!G.jammed) for (const m of G.mines) if (m.alive) rctx.fillRect((m.pos.x - p.pos.x) * K - 2, (m.pos.z - p.pos.z) * K - 2, 4, 4);
  if (G.decap) { const S = G.decap; if (S.pad && S.real && S.real.alive) { rctx.strokeStyle = '#ff4030'; rctx.lineWidth = 2; rctx.beginPath(); rctx.arc((S.pad.x - p.pos.x) * K, (S.pad.z - p.pos.z) * K, 6, 0, Math.PI * 2); rctx.stroke(); } }
  if (G.sabot) for (const g of G.sabot.gens) { if (!g.alive) continue; rctx.fillStyle = g.charge ? (g.charge.k > 0 ? '#ffd040' : '#ff4030') : '#ffa040'; rctx.fillRect((g.x - p.pos.x) * K - 5, (g.z - p.pos.z) * K - 5, 10, 10); }
  for (const w of G.wrecks) { rctx.fillStyle = '#8a8a86'; rctx.fillRect((w.x - p.pos.x) * K - 2, (w.z - p.pos.z) * K - 2, 4, 4); }
  if (G.evac) { const E = G.evac; rctx.fillStyle = 'rgba(110, 255, 150, 0.9)'; rctx.fillRect((EVAC.pad[0] - p.pos.x) * K - 5, (EVAC.pad[1] - p.pos.z) * K - 5, 10, 10);
    for (const c of E.civs) if (c.alive) { rctx.fillStyle = c.webbed ? '#c8d8ff' : c.scared ? '#ffe070' : '#f4f4f0'; rctx.fillRect((c.pos.x - p.pos.x) * K - 1.5, (c.pos.z - p.pos.z) * K - 1.5, 3, 3); } }
  if (G.sky) for (const q of G.sky.shelters) { rctx.fillStyle = q.alive ? 'rgba(120, 230, 140, 0.9)' : 'rgba(120, 120, 120, 0.6)'; rctx.fillRect((q.pos.x - p.pos.x) * K - 4, (q.pos.z - p.pos.z) * K - 4, 8, 8); }
  if (G.courier) for (const st of G.courier.stations) { const on = G.courier.c.alive && G.courier.c.station === st; rctx.fillStyle = on ? 'rgba(80, 232, 255, 0.95)' : 'rgba(80, 232, 255, 0.4)'; rctx.fillRect((st.pos.x - p.pos.x) * K - 3, (st.pos.z - p.pos.z) * K - 3, 6, 6); if (on) { rctx.strokeStyle = 'rgba(80, 232, 255, 0.6)'; rctx.lineWidth = 1; rctx.beginPath(); rctx.arc((st.pos.x - p.pos.x) * K, (st.pos.z - p.pos.z) * K, COURIER.jamR * K, 0, Math.PI * 2); rctx.stroke(); } }
  if (G.lance && G.lance.st !== 'idle') { const L = G.lance; rctx.fillStyle = L.hijack ? 'rgba(64, 216, 255, 0.55)' : 'rgba(255, 60, 30, 0.6)'; rctx.beginPath(); rctx.arc((L.x - p.pos.x) * K, (L.z - p.pos.z) * K, Math.max(4, L.R * K), 0, Math.PI * 2); rctx.fill(); }
  if (G.beacon) { const B = G.beacon; for (const g of B.gates) { if (g.passed) continue; const x = (g.x - p.pos.x) * K, z = (g.z - p.pos.z) * K, nx = g === beaconNext(); rctx.strokeStyle = nx ? '#40e8ff' : 'rgba(64, 160, 200, 0.55)'; rctx.lineWidth = nx ? 3 : 1.5; rctx.beginPath(); rctx.arc(x, z, nx ? 7 : 4, 0, Math.PI * 2); rctx.stroke(); } }
  if (G.lane) { rctx.fillStyle = '#60b0ff'; for (const t of G.lane.troops) { const x = (t.pos.x - p.pos.x) * K, z = (t.pos.z - p.pos.z) * K; rctx.fillRect(x - 2.5, z - 2.5, 5, 5); } }
  if (G.fort) { for (const q of G.fort.pads) { const a = padAction(q); rctx.fillStyle = q.tur && q.tur.hackT > 0 ? '#ff40d0' : q.tur ? '#60ff90' : '#46586a'; rctx.strokeStyle = a && a.cost <= G.fort.pts ? '#40c8ff' : 'rgba(0,0,0,0)'; rctx.lineWidth = 2;
    const x = (q.x - p.pos.x) * K, z = (q.z - p.pos.z) * K; rctx.fillRect(x - 3.5, z - 3.5, 7, 7); rctx.strokeRect(x - 5.5, z - 5.5, 11, 11); } }
  if (G.salv) { const S = G.salv; rctx.strokeStyle = '#40ffb0'; rctx.lineWidth = 3; rctx.beginPath(); rctx.arc((S.pad.x - p.pos.x) * K, (S.pad.z - p.pos.z) * K, Math.max(7, SALV.padR * K), 0, Math.PI * 2); rctx.stroke(); rctx.fillStyle = '#40ffb0'; for (const c of S.cores) { rctx.beginPath(); rctx.arc((c.x - p.pos.x) * K, (c.z - p.pos.z) * K, 3.5, 0, Math.PI * 2); rctx.fill(); } }
  if (G.depot) { for (const t of G.depot.tanks) { rctx.fillStyle = t.alive ? '#5fe3ff' : '#555'; rctx.beginPath(); rctx.arc((t.x - p.pos.x) * K, (t.z - p.pos.z) * K, 8, 0, Math.PI * 2); rctx.fill(); } for (const c of G.depot.charges) { if (Math.sin(G.time * (6 + 20 * (1 - c.t / DEPOT.fuse))) > -0.3) { rctx.fillStyle = '#ff3020'; rctx.fillRect((c.x - p.pos.x) * K - 5, (c.z - p.pos.z) * K - 5, 10, 10); } } }
  if (G.core && G.core.alive) { rctx.fillStyle = '#5fe3ff'; const x = (G.core.pos.x - p.pos.x) * K, z = (G.core.pos.z - p.pos.z) * K; rctx.beginPath(); rctx.arc(x, z, 9, 0, Math.PI * 2); rctx.fill(); rctx.strokeStyle = '#e8fbff'; rctx.lineWidth = 2; rctx.stroke(); }
  if (G.wing && G.wing.alive) { rctx.fillStyle = '#9fffd0'; const x = (G.wing.pos.x - p.pos.x) * K, z = (G.wing.pos.z - p.pos.z) * K; rctx.beginPath(); rctx.moveTo(x, z - 8); rctx.lineTo(x - 6, z + 6); rctx.lineTo(x + 6, z + 6); rctx.fill(); }
  rctx.fillStyle = '#5dff9a';
  for (const k of G.pickups) rctx.fillRect((k.o.position.x - p.pos.x) * K - 3, (k.o.position.z - p.pos.z) * K - 3, 6, 6);
  rctx.restore();
  if (G.jammed) {   // ECM static: speckle + band
    for (let i = 0; i < 260; i++) { rctx.fillStyle = `rgba(${190 + Math.random() * 60 | 0}, ${150 + Math.random() * 60 | 0}, 255, ${Math.random() * 0.5})`; rctx.fillRect(Math.random() * W, Math.random() * W, 3, 3); }
    const by = (performance.now() * 0.12) % W; rctx.fillStyle = 'rgba(176, 96, 255, 0.18)'; rctx.fillRect(0, by, W, 18);
    rctx.fillStyle = '#d8a8ff'; rctx.font = 'bold 22px system-ui'; rctx.textAlign = 'center'; rctx.textBaseline = 'middle'; rctx.fillText('ECM', R, R * 0.45);
  }
  $('ecm').classList.toggle('hidden', !G.jammed || !p.alive);
  rctx.strokeStyle = 'rgba(95, 227, 255, 0.25)'; rctx.lineWidth = 2;
  for (const rr of [R * 0.33, R * 0.66]) { rctx.beginPath(); rctx.arc(R, R, rr, 0, Math.PI * 2); rctx.stroke(); }
  rctx.fillStyle = '#e8f8ff'; rctx.beginPath(); rctx.moveTo(R, R - 10); rctx.lineTo(R - 7, R + 8); rctx.lineTo(R + 7, R + 8); rctx.fill();
  rctx.strokeStyle = 'rgba(95,227,255,0.35)'; rctx.beginPath(); rctx.moveTo(R, R); rctx.lineTo(R - R * 0.6, R - R * 0.8); rctx.moveTo(R, R); rctx.lineTo(R + R * 0.6, R - R * 0.8); rctx.stroke();
}

// ------------------------------------------------------------------ autopilot (test hook)
const auto = { on: false, st: 1, stT: 0, jT: 3, hover: 0, sT: 0 };
const incomingAny = () => G.shots.some((sh) => sh.team === 'E' && (sh.kind === 'missile' || sh.kind === 'plasma') && Math.hypot(sh.x - G.player.pos.x, sh.y - G.player.pos.y - 3, sh.z - G.player.pos.z) < 30);
function autoIntent(dt) {
  const p = G.player; let tgt = null, bd = 1e9;
  if (G.bio) G.bioUrgent = G.bio.touch > 0 || G.enemies.some((e) => e.kind === 'tumor' && e.alive && Math.hypot(e.pos.x, e.pos.z) < 60);
  for (const e of G.enemies) { if (!e.alive || e.dying || e.cloaked || e.hacked || e.tbHeld || !fogSeen(e) || (G.dazzleT > 0 && e.c.distanceTo(p.pos) > 16)) continue; let d = e.c.distanceTo(p.pos) + (G.hf && G.hf.h === e ? 45 : 0) - (G.ctf && G.ctf.flags.P.carrier === e ? 80 : 0) + (G.polar && e.pol === G.polar.p ? 18 : 0) + (e.kind === 'boss' ? -30 : e.kind === 'sprayer' ? -40 : e.kind === 'cruise' ? (e.c.distanceTo(p.pos) < 120 ? -110 : 60) : e.kind === 'launcher' ? (e.st === 'setup' || e.st === 'fire' ? -45 : -20) : e.kind === 'courier' ? (e.st === 'upload' ? -40 : -10) : e.kind === 'dish' ? -50 : e.kind === 'fab' ? -60 : e.kind === 'pump' ? -60 : e.kind === 'bionode' ? (G.bioUrgent ? -60 : -210) : e.kind === 'bloater' ? (e.st === 'hunt' ? -70 : e.charge > 0.4 ? -15 : 10) : e.kind === 'seeder' && e.st === 'dig' ? -70 : e.kind === 'tumor' ? (Math.hypot(e.pos.x, e.pos.z) < 60 ? -120 : 0) : e.kind === 'swapper' && e.st === 'lock' ? -45 : e.kind === 'forklift' && e.loaded ? -8 : e.kind === 'relay' ? -25 : e.kind === 'tower' ? -30 : e.kind === 'citadel' ? (e.shielded ? 90 : -45) : e.kind === 'shade' ? -45 : e.kind === 'mender' ? -35 : e.kind === 'herald' ? -40 : e.kind === 'hijack' ? (e.st === 'chan' || e.st === 'hold' ? -70 : e.st === 'go' ? -40 : -15) : e.kind === 'scav' ? (e.load > 0 ? -50 : -10) : e.kind === 'planter' ? (e.st === 'plant' ? -60 : 0) : e.kind === 'snatcher' && e.carry ? -45 : e.emp ? -15 : e.kind === 'hive' ? -20 : e.kind === 'watch' ? (G.spotT > 0 && e.lock > 0 ? -45 : -10) : e.kind === 'blinker' ? (e.st === 'exposed' || e.st === 'strike' ? -40 : 0) : e.kind === 'swarm' ? (e.c.distanceTo(p.pos) < 12 ? -20 : 60) : e.kind === 'jammer' ? (G.jammed === e ? -45 : -15) : e.kind === 'dropship' ? (e.cargo && e.st !== 'in' ? -60 : e.cargo ? -20 : 400) : e.kind === 'howitzer' ? -25 : e.kind === 'warden' ? (domeAt(p.pos) === e ? -90 : -30) : e.kind === 'crawler' && e.c.distanceTo(p.pos) < 35 ? -30 : e.kind === 'prism' && !(e.vent > 0) && e.fwd.x * (p.pos.x - e.pos.x) + e.fwd.z * (p.pos.z - e.pos.z) > 0 ? 25 : 0); if (G.core) d = d * 0.5 + e.c.distanceTo(G.core.pos) * 0.7; if (G.evac && e.foe && e.foe.isCiv) d -= 35; if (e.kind === 'reviver') d -= e.st === 'chan' ? 50 : 20; if (e.kind === 'marshal') d += e.shroud ? 30 : e.real ? -60 : 0; if (e.kind === 'dazzler') d -= e.st === 'charge' ? 15 : 5; if (e.sabC) d -= 35; if (d < bd) { bd = d; tgt = e; } }
  // pick up repairs when hurt
  let goal = null;
  if (p.hp < p.maxHp * 0.6) for (const k of G.pickups) { const d = k.o.position.distanceTo(p.pos); if (d < 70) { goal = k.o.position; break; } }
  if (!goal) for (const e of G.enemies) {
    if (e.kind !== 'jet' || !e.alive || !e.av || (e.st !== 'tele' && e.st !== 'strafe')) continue;
    const ax = e.A.x, az = e.A.z, dx = e.B.x - ax, dz = e.B.z - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.pos.x - ax) * dx + (p.pos.z - az) * dz) / L2)), cx = ax + dx * t, cz = az + dz * t, dd = Math.hypot(p.pos.x - cx, p.pos.z - cz);
    if (dd < 7) { let nx = p.pos.x - cx, nz = p.pos.z - cz; if (dd < 0.5) { nx = -dz; nz = dx; } const nl = Math.hypot(nx, nz) || 1; goal = new V3(p.pos.x + nx / nl * 14, 0, p.pos.z + nz / nl * 14); break; }
  }
  auto.shade = false;
  if (!goal && G.flare && G.flare.st !== 'calm' && (G.flare.st === 'flare' || G.flare.t < 2.2)) {
    if (!auto.shadeP || G.time - (auto.shadeAt || 0) > 1 || !inShade(auto.shadeP.x, 2.5, auto.shadeP.z)) {   // nearest spot on the dark side of a tall building
      auto.shadeAt = G.time; auto.shadeP = null; let bd = 1e9; const sx = G.sunDir.x, sz = G.sunDir.z, sl = Math.hypot(sx, sz) || 1;
      for (const so of solids) {
        if (so.max.y < 7) continue;
        const cx = (so.min.x + so.max.x) / 2, cz = (so.min.z + so.max.z) / 2, hx = (so.max.x - so.min.x) / 2, hz = (so.max.z - so.min.z) / 2;
        if (Math.hypot(cx - p.pos.x, cz - p.pos.z) > 90) continue;
        const ext = Math.abs(sx / sl) * hx + Math.abs(sz / sl) * hz;
        for (const off of [3.5, 7]) { const qx = cx - sx / sl * (ext + off), qz = cz - sz / sl * (ext + off); if (!inShade(qx, 2.5, qz)) continue; const dd = Math.hypot(qx - p.pos.x, qz - p.pos.z); if (dd < bd) { bd = dd; auto.shadeP = new V3(qx, 0, qz); } }
      }
    }
    if (auto.shadeP && G.flare.exposed) { goal = auto.shadeP.clone(); auto.shade = true; }
    else if (auto.shadeP && Math.hypot(auto.shadeP.x - p.pos.x, auto.shadeP.z - p.pos.z) < 6) auto.shade = true;   // hold the spot
  }
  if (G.thunder && G.thunder.lock && G.thunder.lock.isP && G.thunder.lock.react) auto.shade = true;   // drop out of the sky before the bolt
  if (!goal) for (const e of G.enemies) {
    if (e.kind !== 'leaper' || !e.alive || e.st !== 'air' || !e.autoD || e.ft < 0.35) continue;
    const dx = p.pos.x - e.B.x, dz = p.pos.z - e.B.z, dd = Math.hypot(dx, dz);
    if (dd < LEAP.R + 3) { const nl = dd || 1; goal = new V3(e.B.x + dx / nl * (LEAP.R + 8), 0, e.B.z + dz / nl * (LEAP.R + 8)); break; }
  }
  if (!goal) for (const e of G.enemies) {
    if (e.kind !== 'rammer' || !e.alive || e.st !== 'aim' || !e.autoD || e.stT > 0.75) continue;
    const px = p.pos.x - e.pos.x, pz = p.pos.z - e.pos.z, along = px * e.dir.x + pz * e.dir.z, side = px * -e.dir.z + pz * e.dir.x;
    if (along > -4 && along < RAM.len + 4 && Math.abs(side) < RAM.hitW + 4) { const sg = side >= 0 ? 1 : -1; goal = new V3(p.pos.x - e.dir.z * sg * 14, 0, p.pos.z + e.dir.x * sg * 14); break; }
  }
  if (!goal && G.quake) for (const f of G.quake.fis) {
    if (!f.autoD || (f.st === 'warn' && f.t > 0.9)) continue;
    const px = p.pos.x - f.ax, pz = p.pos.z - f.az, side = px * -f.uz + pz * f.ux;
    if (fissureDist(f, p.pos.x, p.pos.z) < QUAKE.fW + 3) { const sg = side >= 0 ? 1 : -1; goal = new V3(p.pos.x - f.uz * sg * 10, 0, p.pos.z + f.ux * sg * 10); break; }
  }
  if (!goal && G.cranes) for (const c of G.cranes) {
    if (!(c.st === 'on' || (c.st === 'fall' && c.t > 0.2)) || !c.autoD) continue;
    const dx = p.pos.x - c.x, dz = p.pos.z - c.z, dd = Math.hypot(dx, dz);
    if (dd < (c.st === 'fall' ? MAGNET.dropR + 3 : 24)) { const nl = dd || 1; goal = new V3(c.x + dx / nl * 45, 0, c.z + dz / nl * 45); break; }
  }
  if (!goal && run.ring) {
    const Rg = run.ring, nx = Rg.t < Rg.T, cx = nx ? Rg.x1 : Rg.x, cz = nx ? Rg.z1 : Rg.z, cr = nx ? Rg.r1 : Rg.r;
    const dc = Math.hypot(p.pos.x - cx, p.pos.z - cz), dn = Math.hypot(p.pos.x - Rg.x, p.pos.z - Rg.z);
    if (dn > Rg.r - 8 || (nx && dc > cr - 10 + (Rg.wait > 0 ? 20 : 0))) goal = new V3(cx, 0, cz);
  }
  if (!goal && run.capture && !run.finalOn) {
    let zb = null, zs = 1e9;
    for (const z of run.zones) { const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z); const sc = z.own === 'P' ? (z.ein ? d * 0.6 : 1e9) : d; if (sc < zs) { zs = sc; zb = z; } }
    if (zb && Math.hypot(zb.x - p.pos.x, zb.z - p.pos.z) > ZONE_R * 0.55) goal = zb.pos;
  }
  if (!goal && run.extract && !run.won) {
    let zb = run.evac, zs = 1e9;
    if (!zb) for (const z of run.zones) { if (z.kind !== 'cache' || z.k >= 1) continue; const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z) - (z.k > 0 ? 200 : 0); if (d < zs) { zs = d; zb = z; } }
    const busy = !run.evac && !(zb && zb.k > 0) && G.enemies.filter((e) => e.alive && !e.cloaked && e.kind !== 'crawler' && e.c.distanceTo(p.pos) < (e.kind === 'turret' ? 60 : 90)).length >= 2;   // clear the area before the next cache
    if (zb && !busy && Math.hypot(zb.x - p.pos.x, zb.z - p.pos.z) > zb.R * 0.5) goal = zb.pos;
  }
  // prism facing us: circle round to its side instead of shooting into the mirror
  const mirror = !!tgt && tgt.kind === 'prism' && !(tgt.stunT > 0) && !(tgt.vent > 0) && tgt.fwd.x * (p.pos.x - tgt.pos.x) + tgt.fwd.z * (p.pos.z - tgt.pos.z) > PRISM.arc * Math.hypot(p.pos.x - tgt.pos.x, p.pos.z - tgt.pos.z);
  const refl = (w) => w.d.type === 'missile' || (w.d.type === 'bullet' && !w.d.grenade);
  if (!goal && mirror) { const rx = -tgt.fwd.z, rz = tgt.fwd.x, sg = rx * (p.pos.x - tgt.pos.x) + rz * (p.pos.z - tgt.pos.z) >= 0 ? 1 : -1; goal = new V3(tgt.pos.x + rx * sg * 24 - tgt.fwd.x * 8, 0, tgt.pos.z + rz * sg * 24 - tgt.fwd.z * 8); }
  auto.lamp = false;
  if (!goal && G.fort) { const busy = tgt && tgt.c.distanceTo(p.pos) < 32 && run.breakT <= 0; const pd = busy ? null : fortGoal(p.pos.x, p.pos.z);
    if (pd) { goal = new V3(pd.x, 0, pd.z); if (Math.hypot(pd.x - p.pos.x, pd.z - p.pos.z) < 14) auto.lamp = true; } }
  if (!goal && G.salv && !run.finalOn) { const S = G.salv, pd = S.pad; const c = S.carried < SALV.carry ? nearestCore(p.pos.x, p.pos.z, S.carried >= 2 ? 30 : 75) : null;
    if (c) { goal = new V3(c.x, 0, c.z); if (Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 14) auto.lamp = true; }
    else if (S.carried > 0 && (S.carried >= 2 || !nearestCore(p.pos.x, p.pos.z, 90))) { goal = new V3(pd.x, 0, pd.z); if (Math.hypot(pd.x - p.pos.x, pd.z - p.pos.z) < 14) auto.lamp = true; } }
  if (!goal && G.depot) { const c = nearestCharge(p.pos.x, p.pos.z); auto.far = false; if (c) { goal = new V3(c.x, 0, c.z); const cd = Math.hypot(c.x - p.pos.x, c.z - p.pos.z); auto.far = cd > 30; if (cd < 16) auto.lamp = true; auto.defGo = (auto.defGo || 0) + dt; } }   // defuse charges before anything else
  if (!goal && G.fog) { let L = null, bd = 1e9; for (const l of G.fog.lamps) if (!l.lit) { const dd = Math.hypot(l.x - p.pos.x, l.z - p.pos.z); if (dd < bd) { bd = dd; L = l; } } const busy = tgt && tgt.c.distanceTo(p.pos) < 40; if (L && !busy) { goal = new V3(L.x, 0, L.z); if (bd < 16) auto.lamp = true; auto.lampGo = (auto.lampGo || 0) + dt; } }   // light the fog lamps between fights
  if (G.glad) { const V = gladVentAt(p.pos.x, p.pos.z, 3.5); if (V && V.dodge) { const dx = p.pos.x - V.x, dz = p.pos.z - V.z, L = Math.hypot(dx, dz) || 1; goal = new V3(V.x + dx / L * (GLAD.ventR + 10), 0, V.z + dz / L * (GLAD.ventR + 10)); } }
  if (!goal && G.saws.some((S) => S.owner === p)) { let be = null, bd = 32; for (const e of G.enemies) { if (!e.alive || e.dying || !e.c || e.kind === 'boss' || e.kind === 'drone') continue; const dd = e.c.distanceTo(p.pos); if (dd < bd) { bd = dd; be = e; } } if (be) goal = new V3(be.pos.x, 0, be.pos.z); }   // orbit saws up: wade in
  if (!goal && G.ctf && !run.won) { const S = G.ctf, FP = S.flags.P, FE = S.flags.E; let g = null, land = true;   // ctf: chase your flag's carrier, return a dropped flag, else go for theirs / bring it home
    if (FP.st === 'carried' && FP.carrier && FP.carrier !== p) { if (Math.hypot(FP.carrier.pos.x - p.pos.x, FP.carrier.pos.z - p.pos.z) > 18) g = FP.carrier.pos; land = false; }
    else if (FP.st === 'dropped') g = FP.pos;
    else if (FE.carrier === p) g = FP.home;
    else if (FE.st !== 'carried' && !(G.boss && G.boss.alive && G.boss.pos.distanceTo(FE.pos) < 55 && p.hp < p.maxHp * 0.8)) g = FE.pos;   // the Tyrant on the flag: fight it first unless healthy
    if (g) { goal = new V3(g.x, 0, g.z); if (land && Math.hypot(g.x - p.pos.x, g.z - p.pos.z) < 16) auto.lamp = true; } }
  if (G.atom && !run.finalOn) { const A = G.atom;   // meltdown: restart the nearest pump; wash off a heavy dose first
    let Q = null, bd = 1e9; for (const q of A.pumps) if (!q.fixed) { const dd = Math.hypot(q.x - p.pos.x, q.z - p.pos.z); if (dd < bd) { bd = dd; Q = q; } }
    if (A.dose > 95 && !(Q && Q.k > 0.5 && bd < 10)) auto.decon = true; else if (A.dose < 20) auto.decon = false;
    if (auto.decon) { let D = null, dd = 1e9; for (const d of A.pads) { const x = Math.hypot(d.x - p.pos.x, d.z - p.pos.z); if (x < dd) { dd = x; D = d; } } if (D) { goal = new V3(D.x, 0, D.z); if (dd < 14) auto.lamp = true; } }
    else if (Q && !goal) { const busy = tgt && tgt.kind === 'bloater' && tgt.st === 'hunt'; if (!busy) { goal = new V3(Q.x, 0, Q.z); if (bd < 16) auto.lamp = true; } } }
  if (!goal && G.supply) { const c = nearestCrate(p.pos.x, p.pos.z, 80); if (c && (c.st === 'ground' || c.obj.position.y < 20)) { goal = new V3(c.x, 0, c.z); auto.crateGo = (auto.crateGo || 0) + dt; } }   // race the enemies to supply crates
  if (!goal && G.rift && tgt && !(p.riftCd > 0)) { const dT = Math.hypot(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z); if (dT > 60) for (const g of G.rift.gates) { const dg = Math.hypot(g.x - p.pos.x, g.z - p.pos.z), dt2 = Math.hypot(g.twin.x - tgt.pos.x, g.twin.z - tgt.pos.z); if (dg < 45 && dg + dt2 < dT - 30) { goal = new V3(g.x, 0, g.z); auto.riftGo = (auto.riftGo || 0) + dt; break; } } }   // take a rift gate as a shortcut
  if (!goal && tgt) { const wd = domeAt(tgt.c); if (wd && p.pos.distanceTo(wd.pos) > wd.R * 0.55 && wd.dp > wd.maxDp * 0.35) goal = wd.pos; }
  if (G.train && G.train.alive) {
    const T = G.train;
    for (const C of T.cars) {
      const dx = p.pos.x - C.pos.x, dz = p.pos.z - C.pos.z, al = dx * C.tan.x + dz * C.tan.z, sd = dx * -C.tan.z + dz * C.tan.x;
      const inWay = C === T.cars[0] ? al > -8 && al < 40 : Math.abs(al) < C.len / 2 + 4;
      if (inWay && Math.abs(sd) < 6.5 && p.pos.y < 6) { const sg = sd >= 0 ? 1 : -1; auto.trackGoal = new V3(p.pos.x - C.tan.z * sg * 16, 0, p.pos.z + C.tan.x * sg * 16); auto.trackT = 1.0; break; }
    }
  }
  if (auto.trackT > 0) { auto.trackT -= dt; goal = auto.trackGoal; }
  if (GRID.on) for (const z of G.zones) {   // charged floor sector: walk off it during the warning, ride out the discharge in the air
    const dx = p.pos.x - z.x, dz = p.pos.z - z.z; if (Math.max(Math.abs(dx), Math.abs(dz)) > 21) continue;
    if (z.autoR === undefined) z.autoR = Math.random() < 0.7;
    if (!z.autoR) continue;
    if (z.st === 'warn' && !goal) { goal = Math.abs(dx) > Math.abs(dz) ? new V3(z.x + Math.sign(dx || 1) * 28, 0, p.pos.z) : new V3(p.pos.x, 0, z.z + Math.sign(dz || 1) * 28); }
  }
  if (G.maze && !goal) for (const w of G.maze.walls) {   // a wall about to rise under you: step off its footprint
    if (!(w.warnT > 0) || !w.autoR || Math.abs(p.pos.x - w.x) > w.hw + 3 || Math.abs(p.pos.z - w.z) > w.hd + 3) continue;
    goal = w.rot ? new V3(w.x + (Math.sign(p.pos.x - w.x) || 1) * (w.hw + 8), 0, p.pos.z) : new V3(p.pos.x, 0, w.z + (Math.sign(p.pos.z - w.z) || 1) * (w.hd + 8)); break;
  }
  if (G.factory && !goal) for (const pr of G.presses) {   // a press about to slam: step off the plate along the belt (a human misses some)
    if (pr.st === 'idle' || pr.st === 'rise') { pr.autoR = undefined; continue; }
    if (pr.autoR === undefined) pr.autoR = Math.random() < 0.7;
    if (!pr.autoR || Math.abs(p.pos.x - pr.x) > FACT.plate + 3 || Math.abs(p.pos.z - pr.z) > FACT.plate + 3 || p.pos.y > 7) continue;
    goal = new V3(pr.x + (Math.sign(p.pos.x - pr.x) || 1) * (FACT.plate + 7), 0, p.pos.z); break;
  }
  if (!goal) for (const t of G.twisters) {   // tornado: get out of the funnel's reach, sideways to its path
    const dx = p.pos.x - t.x, dz = p.pos.z - t.z, dl = Math.hypot(dx, dz) || 1;
    if (t.autoR === undefined || (t.autoRT = (t.autoRT || 0) - dt) <= 0) { t.autoR = Math.random() < 0.6; t.autoRT = 6; }
    if (t.autoR && dl < TWIST.pull + 6) { goal = new V3(t.x + dx / dl * (TWIST.pull + 14), 0, t.z + dz / dl * (TWIST.pull + 14)); break; }
  }
  if (!goal && G.inAcid) for (const c of G.acid) { const dx = p.pos.x - c.x, dz = p.pos.z - c.z, dl = Math.hypot(dx, dz) || 1; if (dl < c.R) { goal = new V3(c.x + dx / dl * (c.R + 8), 0, c.z + dz / dl * (c.R + 8)); break; } }
  if (G.lance && !G.lance.hijack && G.lance.st !== 'idle') { const L = G.lance, dx = p.pos.x - L.x, dz = p.pos.z - L.z, dl = Math.hypot(dx, dz) || 1;
    if (L.autoT === undefined || (L.autoT -= dt) <= 0) { L.autoT = 3; L.autoR = Math.random() < 0.7; }   // a human doesn't always watch the beam
    if (L.autoR && L.st === 'drop' && dl < L.R + 12) goal = new V3(p.pos.x + (dx / dl) * 16, 0, p.pos.z + (dz / dl) * 16);
    else if (L.autoR && dl < L.R + 9) { const sx = L.st === 'sprint' || L.st === 'warn' ? -L.dir.z : 0, sz = L.st === 'sprint' || L.st === 'warn' ? L.dir.x : 0, sg = Math.sign(dx * sx + dz * sz) || 1; goal = new V3(p.pos.x + (dx / dl) * 14 + sx * sg * 14, 0, p.pos.z + (dz / dl) * 14 + sz * sg * 14); } }
  if (!goal && G.fires.length) for (const f of G.fires) { const dx = p.pos.x - f.x, dz = p.pos.z - f.z, dl = Math.hypot(dx, dz) || 1; if (dl < f.R + 1 && p.pos.y - f.y < 3) { goal = new V3(f.x + dx / dl * (f.R + 6), 0, f.z + dz / dl * (f.R + 6)); break; } }
  if (!goal && G.decap && !run.won) {
    const S = G.decap;
    if (S.found && S.real && S.real.alive) { if (Math.hypot(S.real.pos.x - p.pos.x, S.real.pos.z - p.pos.z) > 30) goal = S.real.pos; }
    else { let m0 = null, bd = 1e9; for (const m of S.ms) if (m.alive && !m.known) { const dd = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z); if (dd < bd) { bd = dd; m0 = m; } } if (m0 && (bd > 18 || !clearLine(p.center(new V3()), m0.c))) goal = m0.pos; }
  }
  auto.plant = false;
  if (!goal && G.sabot && !run.won) {
    const S = G.sabot; let away = null, C = null;
    for (const c of S.charges) { const cd = Math.hypot(c.x - p.pos.x, c.z - p.pos.z); if (c.t < 5 && cd < SABOT.blast + 5) { const dl = cd || 1; away = new V3(c.x + (p.pos.x - c.x) / dl * 32, 0, c.z + (p.pos.z - c.z) / dl * 32); } if (c.k > 0 || G.enemies.some((e) => e.sabC === c && e.alive && !e.dying)) C = C || c; }
    if (away) goal = away;
    else if (C) { if (Math.hypot(C.x - p.pos.x, C.z - p.pos.z) > 20) goal = new V3(C.x, 0, C.z); }
    else { const g = sabTarget(p.pos); if (g) { const gd = Math.hypot(g.x - p.pos.x, g.z - p.pos.z); if (gd > 3) goal = new V3(g.x, 0, g.z); if (gd < 16) auto.plant = true; } }
  }
  if (!goal && G.evac) {   // go to the civilians under fire, else stay with the walking columns
    let C = null, bd = 1e9; for (const e of G.enemies) if (e.alive && !e.dying && !e.hacked && e.foe && e.foe.isCiv && e.foe.alive) { const dd = Math.hypot(e.foe.pos.x - p.pos.x, e.foe.pos.z - p.pos.z); if (dd < bd) { bd = dd; C = e.foe; } }
    if (C && bd > 26) goal = new V3(C.pos.x, 0, C.pos.z);
    else if (!C && !tgt) { const w = evacWalking(); if (w.length) { let mx = 0, mz = 0; for (const c of w) { mx += c.pos.x; mz += c.pos.z; } mx /= w.length; mz /= w.length; if (Math.hypot(mx - p.pos.x, mz - p.pos.z) > 40) goal = new V3(mx, 0, mz); } }
  }
  if (!goal && G.sky) { let L = null, bd = 1e9; for (const e of G.enemies) if (e.kind === 'launcher' && e.alive) { const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) - (e.st === 'setup' || e.st === 'fire' ? 40 : 0); if (dd < bd) { bd = dd; L = e; } } if (L && Math.hypot(L.pos.x - p.pos.x, L.pos.z - p.pos.z) > 34) goal = new V3(L.pos.x, 0, L.pos.z); }
  if (!goal && G.courier && G.courier.c.alive) { const c = G.courier.c, dl = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z); if (dl > (c.st === 'upload' ? 16 : 24)) goal = new V3(c.pos.x, 0, c.pos.z); }
  auto.gate = null;
  if (!goal && run.beacon && G.beacon && !G.beacon.done) { const g = beaconNext(); if (g) { goal = new V3(g.x, 0, g.z); auto.gate = g; } }
  if (!goal && run.lane && G.lane) {   // push: stand off short of the next objective, fall back if the base is in trouble
    const o = laneObjective(), home = G.core && G.core.alive ? G.core : null;
    const threat = home && home.hp < home.maxHp * 0.8 && G.enemies.some((e) => e.alive && !e.dying && e.pos && !e.isObjective && Math.hypot(e.pos.x - home.pos.x, e.pos.z - home.pos.z) < 40);
    if (threat && Math.hypot(p.pos.x - home.pos.x, p.pos.z - home.pos.z) > 30) goal = home.pos;
    else if (o && !threat) { let fx0 = home ? home.pos.x - 20 : 100; for (const t of G.lane.troops) if (t.alive) fx0 = Math.min(fx0, t.pos.x); const gx = o.kind === 'citadel' ? o.pos.x + 36 : Math.max(o.pos.x + 36, fx0 - 4); if (Math.abs(p.pos.x - gx) > 12 || Math.abs(p.pos.z) > 20) goal = new V3(gx, 0, 0); }
  }
  if (!goal && !run.lane && !run.creep && G.core && G.core.alive && Math.hypot(p.pos.x - G.core.pos.x, p.pos.z - G.core.pos.z) > (run.escort ? (run.driving ? 22 : G.enemies.filter((e) => e.alive).length <= 2 ? 999 : 45) : 70)) goal = G.core.pos;
  if (tgt) {
    const pc = p.center(new V3());
    const dx = tgt.c.x - pc.x, dz = tgt.c.z - pc.z, h = Math.hypot(dx, dz);
    const camRight = 3.1 * p.scale;
    cam.yaw = Math.atan2(-dx, -dz) + Math.atan2(camRight, h) * 0.9;
    cam.pitch = Math.max(-0.6, Math.min(0.8, Math.atan2(tgt.c.y - pc.y - 1.0, h)));
  }
  for (const e of G.enemies) {   // a dazzler about to strobe: look away (a human doesn't catch every one)
    if (e.kind !== 'dazzler' || e.st !== 'charge' || !e.alive || !e.autoR || e.c.distanceTo(p.pos) > DAZZ.range) continue;
    cam.yaw = Math.atan2(-(e.c.x - p.pos.x), -(e.c.z - p.pos.z)) + Math.PI; auto.away = (auto.away || 0) + dt; break;
  }
  auto.stT -= dt; if (auto.stT <= 0) { auto.stT = 2 + Math.random() * 2.5; auto.st = Math.random() < 0.5 ? 1 : -1; }
  auto.jT -= dt; let jump = false; if (auto.jT <= 0 && p.grounded) { auto.jT = 4 + Math.random() * 4; jump = true; auto.hover = 0.8 + Math.random(); }
  auto.hover -= dt;
  if (tgt && tgt.c.y - p.pos.y > 7 && tgt.c.distanceTo(p.pos) < 70 && p.en > 25) { if (p.grounded) jump = true; auto.hover = 0.3; }
  for (const e of G.enemies) {   // a fence about to sweep through us: jump it
    if (e.kind !== 'fencer' || !e.lead || !e.plan || !e.alive || (e.plan.st !== 'arm' && e.plan.st !== 'sweep')) continue;
    const P = e.plan, sx = (p.pos.x - P.C.x) * P.D.x + (p.pos.z - P.C.z) * P.D.z, nx = (p.pos.x - P.C.x) * P.N.x + (p.pos.z - P.C.z) * P.N.z;
    if (P.autoJ === undefined) P.autoJ = Math.random() < 0.65;   // a human doesn't read every sweep in time
    if (P.autoJ && P.st === 'sweep' && Math.abs(nx) < FENCE.len / 2 + 2 && sx > -1 && sx < 7) { if (p.grounded) { if (p.en > 10) { jump = true; auto.hover = 0.7; } } else if (!(auto.hover > 0.3)) auto.hover = -0.5; }   // on the ground: jump it; in the air: drop under it
  }
  if (GRID.on) for (const z of G.zones) { if (!z.autoR || Math.max(Math.abs(p.pos.x - z.x), Math.abs(p.pos.z - z.z)) > 21) continue; if ((z.st === 'live' || z.t < 0.4) && p.en > 8) { if (p.grounded) jump = true; auto.hover = Math.max(auto.hover, 0.4); } }
  if (G.traffic) { const ta = truckAhead(p.pos.x, p.pos.z, p.pos.y, 1.3); if (ta) { if (ta.k.autoR === undefined) ta.k.autoR = Math.random() < 0.75; if (ta.k.autoR && p.en > 8) { if (p.grounded) jump = true; auto.hover = Math.max(auto.hover, 0.9); } } }   // hop over a truck about to hit
  if (G.leechOn > 0) { auto.leechT = (auto.leechT || 0) + dt; } else auto.leechT = 0;
  if (auto.far && G.depot && p.en > 20) { if (p.grounded) jump = true; auto.hover = Math.max(auto.hover, 0.6); }   // hop over the refinery on the way to a charge
  if (auto.gate) { const gy = auto.gate.y - p.center(new V3()).y, gd = Math.hypot(auto.gate.x - p.pos.x, auto.gate.z - p.pos.z); if ((gy > 2.5 && gd < 60) || (gd > 30 && p.en > 40)) { if (p.grounded) jump = true; auto.hover = Math.max(auto.hover, 0.3); } else if (gy < -3 && gd < 40) auto.hover = -1; }
  if (auto.shade || auto.lamp || auto.plant) { jump = false; auto.hover = -1; }
  for (const r of G.rings) {   // pulsar rings: hop the low one, drop under the high one (a human misses some)
    if (!r.autoR || r.hit.has(p)) continue;
    const gap = Math.hypot(p.pos.x - r.x, p.pos.z - r.z) - r.R;
    if (r.type === 'low' && gap > 0 && gap < 7 && p.en > 8) { if (p.grounded) jump = true; auto.hover = Math.max(auto.hover, 0.6); }
    else if (r.type === 'high' && gap > 0 && gap < 22) { jump = false; auto.hover = -1; }
  }
  if (G.maze && p.pos.y > MAZE.burnAt - 2.5) { jump = false; auto.hover = -1; }
  if (G.turf) {   // turf war: fight on foot so your feet paint; with nothing close, go paint the nearest magenta or bare floor
    if (!(tgt && tgt.c.y - p.pos.y > 8) && p.hp > p.maxHp * 0.5 && !(G.boss && G.boss.alive)) auto.hover = -1;
    if (!goal && (!tgt || tgt.c.distanceTo(p.pos) > 45)) {
      auto.tfT = (auto.tfT || 0) - dt;
      if (!auto.tfG || auto.tfT <= 0 || Math.hypot(auto.tfG.x - p.pos.x, auto.tfG.z - p.pos.z) < 6) {
        let bs = -1e9; const q = new V3(); auto.tfT = 5;
        for (let k = 0; k < 14; k++) { const a = Math.random() * 6.283, r = 20 + Math.random() * 70, x = Math.max(-150, Math.min(150, p.pos.x + Math.cos(a) * r)), z = Math.max(-150, Math.min(150, p.pos.z + Math.sin(a) * r));
          q.set(x, 0.6, z); if (pointInSolid(q, 2)) continue; const o = turfAt(x, z), sc = (o === 0 ? 3 : o === 2 ? 1 : 0) - r / 90 + Math.random() * 0.4; if (sc > bs) { bs = sc; auto.tfG = new V3(x, 0, z); } }
      }
      goal = auto.tfG;
    }
  }   // stay under the laser canopy
  if (G.polar && p.alive) {   // polarity: wear the charge that is shooting at you (absorb it), shoot the other one
    auto.polT = (auto.polT || 0) - dt;
    if (auto.polT <= 0) { auto.polT = 0.35; const w = polThreat(p.center(new V3())), want = w.R > w.B * 1.15 ? 'R' : w.B > w.R * 1.15 ? 'B' : null; if (want && want !== G.polar.p && Math.random() < 0.8) setPol(want); }
  }
  if (G.hf && G.hf.h && !run.won) {   // hot fuse: carrying the bomb, run it into the nearest enemy; an enemy carrying it, keep clear
    const F = G.hf;
    if (F.h === 'P') {
      const e = fuseNear(p.center(new V3()), 140);
      if (e && F.t < FUSE.tP - 1) { goal = e.c; const dy = e.c.y - (p.pos.y + 2.6); if (dy > 3 && p.en > 15) { if (p.grounded) jump = true; auto.hover = 0.5; } else if (dy < -2.5) { jump = false; auto.hover = -1; } }
    } else if (F.h.c) {
      const h = F.h, dx = p.pos.x - h.c.x, dz = p.pos.z - h.c.z, dl = Math.hypot(dx, dz) || 1;
      if (dl < 28 && !h.bubbled) goal = new V3(p.pos.x + dx / dl * 18 - dz / dl * 7 * (auto.side || 1), 0, p.pos.z + dz / dl * 18 + dx / dl * 7 * (auto.side || 1));
    }
  }
  if (G.bio && inCreep(p.pos) && p.en > 25) { if (!(auto.crT > 0)) { auto.crT = 4; auto.crR = Math.random() < 0.7; } if (auto.crR) { if (p.grounded) jump = true; auto.hover = Math.max(auto.hover, 0.3); } }
  if (auto.crT > 0) auto.crT -= 1 / 60;
  if (G.tsu) { const T = G.tsu, eta = tsuEta(); if (T.st !== 'wave' || T.n !== auto.tsN) { if (T.st === 'wave') auto.tsN = T.n; auto.tsR = Math.random() < 0.7; }
    if (auto.tsR && eta !== null && eta < 1.6 && p.pos.y < T.h + 2 && p.en > 6) { if (p.grounded) jump = true; auto.hover = Math.max(auto.hover, 0.5); } }
  if (LAVA.on && lavaAt(p.pos.x + p.vel.x * 0.4, p.pos.z + p.vel.z * 0.4) && p.en > 12) { if (p.grounded) jump = true; auto.hover = Math.max(auto.hover, 0.25); }
  const d = tgt ? tgt.c.distanceTo(p.pos) : 0;
  const isMelee = (t) => t === 'blade' || t === 'pile';
  const hasFlame = G.pw.R.d.type === 'flame' || G.pw.L.d.type === 'flame', hasArc = G.pw.R.d.type === 'arc' || G.pw.L.d.type === 'arc';
  const bigT = !!tgt && (tgt.kind === 'boss' || tgt.kind === 'raider');
  const flamer = hasFlame && !!tgt && (bigT || Math.abs(tgt.c.y - p.pos.y) < 7);   // rush ground targets; chase bosses with the boost
  const melee = isMelee(G.pw.R.d.type) || isMelee(G.pw.L.d.type) || flamer;
  let f = tgt ? (melee ? (d > (flamer ? 13 : 24) ? 1 : 0) : (d > (hasArc ? 36 : 45) ? 1 : d < (hasArc ? 16 : 22) ? -1 : 0)) : 0, s = tgt ? auto.st : 0;
  if (goal) { const gx = goal.x - p.pos.x, gz = goal.z - p.pos.z; const yaw = cam.yaw; const fw = [-Math.sin(yaw), -Math.cos(yaw)], rt = [Math.cos(yaw), -Math.sin(yaw)]; f = Math.sign(gx * fw[0] + gz * fw[1]); s = Math.sign(gx * rt[0] + gz * rt[1]); }
  const los = tgt && clearLine(p.center(new V3()), tgt.c);
  const swK = G.pw.S.d.type === 'saws', swNear = swK && (G.enemies.filter((e) => e.alive && !e.dying && e.c && e.c.distanceTo(p.pos) < 26).length >= 2 || G.enemies.some((e) => e.alive && !e.dying && e.c && e.kind !== 'drone' && e.kind !== 'boss' && e.c.distanceTo(p.pos) < 40) || G.shots.filter((sh) => sh.team === 'E' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 25).length >= 5);
  const ncK = G.pw.S.d.type === 'nanocloud', ncNear = ncK && (G.enemies.filter((e) => e.alive && !e.dying && e.c && e.c.distanceTo(p.pos) < 12).length >= 2 || G.enemies.some((e) => e.alive && !e.dying && e.c && e.c.distanceTo(p.pos) < 9) || G.shots.filter((sh) => sh.team === 'E' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 30).length >= 6);
  const bwK = G.pw.S.d.type === 'bwall', bwNear = bwK && ((!!tgt && !!los && d < 40 && !bigT && tgt.c.y - p.pos.y < 6) || G.shots.filter((sh) => sh.team === 'E' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 40).length >= 5);
  const lkK = G.pw.S.d.type === 'chainb', lkNear = lkK && !!tgt && !!los && tgt.c.distanceTo(p.pos) < 90 && G.enemies.filter((e) => e !== tgt && e.alive && !e.dying && e.c && e.c.distanceTo(tgt.c) < WEAPONS.chainb.R).length >= 1;
  const cmK = G.pw.S.d.type === 'camo', cmNear = cmK && !(G.camo && G.camo.t > 0) && ((G.sabot && !!sabTarget(p.pos) && Math.hypot(sabTarget(p.pos).x - p.pos.x, sabTarget(p.pos).z - p.pos.z) < 40) || (G.hud.hurt > 0.3 && p.hp < p.maxHp * 0.6) || incomingAny());
  const hkK = G.pw.S.d.type === 'hack', hkNear = hkK && !!tgt && hackable(tgt) && tgt.c.distanceTo(p.pos) < 80 && !!los;
  const cwK = G.pw.S.d.type === 'ciws', cwNear = cwK && (G.enemies.some((e) => e.kind === 'cruise' && e.alive && e.c.distanceTo(p.pos) < 50) || G.shots.filter((sh) => sh.team === 'E' && sh.speed < 90 && sh.kind !== 'bullet' && sh.kind !== 'ebullet' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 40).length >= 2 || G.enemies.filter((e) => e.alive && (e.kind === 'drone' || e.kind === 'swarm') && e.c.distanceTo(p.pos) < 32).length >= 2);
  const empK = G.pw.S.d.type === 'emp', empNear = empK && (G.enemies.some((e) => e.alive && !e.dying && e.c.distanceTo(p.pos) < 22) || G.shots.some((sh) => sh.team === 'E' && sh.kind !== 'bullet' && sh.kind !== 'ebullet' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 20));
  const sonK = G.pw.S.d.type === 'sonar', sonNear = sonK && (!!G.jammed || G.enemies.some((e) => e.kind === 'stalker' && e.alive && !(e.markT > 0) && e.c.distanceTo(p.pos) < 75) || G.enemies.filter((e) => e.alive && !e.dying && !(e.markT > 0) && e.c.distanceTo(p.pos) < 70).length >= 3);
  const smkK = G.pw.S.d.type === 'smoke', pmK = G.pw.S.d.type === 'pmines', pmNear = pmK && G.enemies.some((e) => e.alive && !e.dying && !e.holo && e.c && e.c.distanceTo(p.pos) < 30);
  const iwK = G.pw.S.d.type === 'icewall', iwNear = iwK && (G.hud.hurt > 0.2 || incomingAny() || G.pChill > 0.4 || G.enemies.filter((e) => e.alive && !e.dying && e.c.distanceTo(p.pos) < 70).length >= 4);
  const chfK = G.pw.S.d.type === 'chaff', chfNear = chfK && (G.spotT > 0 || G.shots.some((sh) => sh.team === 'E' && sh.kind === 'missile' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 45));
  const stsK = G.pw.S.d.type === 'stasis', stsNear = stsK && !!tgt && d < 58 && (bigT || incomingAny() || G.enemies.filter((e) => e.alive && !e.dying && e.c.distanceTo(tgt.c) < 14).length >= 3);
  const rwK = G.pw.S.d.type === 'rewind', rwNear = rwK && G.hud.hurt > 0.3 && p.hp < p.maxHp * 0.85;
  const pndK = G.pw.S.d.type === 'pound', pndNear = pndK && !G.pound && G.enemies.filter((e) => e.alive && !e.dying && !e.holo && e.c && e.pos && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 11 && e.pos.y - groundAt(e.pos.x, e.pos.z, e.pos.y + 1) < 3).length >= 1;
  const rodK = G.pw.S.d.type === 'rod', rodNear = rodK && (!!(G.thunder && G.thunder.lock && G.thunder.lock.isP) || G.enemies.some((e) => e.alive && !e.dying && !e.holo && e.c && e.c.distanceTo(p.pos) < 22));
  auto.sT -= dt; const sPress = auto.sT <= 0 && (swK ? swNear : ncK ? ncNear : bwK ? bwNear : lkK ? lkNear : cmK ? cmNear : hkK ? hkNear : cwK ? cwNear : rwK ? rwNear : pndK ? pndNear : rodK ? rodNear : empK ? empNear : pmK ? pmNear : sonK ? sonNear : iwK ? iwNear : chfK ? chfNear : stsK ? stsNear : smkK ? G.hud.hurt > 0.25 : los && !(mirror && refl(G.pw.S))) && (G.pw.S.d.type !== 'orbital' || (!!G.lockTarget && d < 150)); if (sPress) auto.sT = 0.6;
  const sniped = G.enemies.some((e) => e.kind === 'stalker' && e.st === 'aim' && e.lockOn === p && e.stT < 0.5);
  const incoming = G.shots.some((sh) => sh.team === 'E' && sh.kind === 'missile' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 22);
  const shellAt = G.barrage.some((b) => b.t < 0.55 && Math.hypot(b.p.x - p.pos.x, b.p.z - p.pos.z) < WATCH.R + 1 && b.vol && b.vol.autoD);
  const holeAt = p.pos.y < 1.5 && G.holes.some((h) => (h.st === 'open' || h.t < 0.6) && Math.hypot(h.x - p.pos.x, h.z - p.pos.z) < h.R + 1 && (h.autoD ?? (h.autoD = Math.random() < 0.6)));
  const blinkAt = G.enemies.some((e) => e.kind === 'blinker' && e.st === 'mark' && e.lockOn === p && e.stT < 0.35 && (e.autoD ?? (e.autoD = Math.random() < 0.55)));
  const leapNear = G.enemies.some((e) => (e.kind === 'crawler' && e.st === 'leap' && e.c.distanceTo(p.pos) < 12) || (e.kind === 'burrower' && e.st === 'warn' && Math.hypot(e.spot.x - p.pos.x, e.spot.z - p.pos.z) < 7) || (e.isLev && e.st === 'warn' && Math.hypot(e.spot.x - p.pos.x, e.spot.z - p.pos.z) < 12));
  const fire = (slot) => (!!los || (!!tgt && !!G.pw[slot].d.drill && d < 90)) && !(mirror && refl(G.pw[slot])) && (G.pw[slot].d.type !== 'blade' || d < 36) && (G.pw[slot].d.type !== 'pile' || d < 24) && (G.pw[slot].d.type !== 'flame' || d < 20) && (G.pw[slot].d.type !== 'arc' || d < 42) && (!G.pw[slot].d.chill || d < 66) && (G.pw[slot].d.type !== 'disc' || d < 52) && (G.pw[slot].d.type !== 'plorb' || d < 58) && (!G.pw[slot].d.bub || d < 60) && (G.pw[slot].d.type !== 'sonic' || d < 30) && (G.pw[slot].d.type !== 'hook' || (d < 66 && !bigT)) && (G.pw[slot].d.type !== 'charge' || Math.random() < 0.985) && (!G.pw[slot].d.flak || d < 100) && (G.pw[slot].d.type !== 'tractor' || tbAuto(slot, d));
  const odNow = G.od.k >= 1 && (G.bosses.some((b) => b.alive && b.c.distanceTo(p.pos) < 80) || G.enemies.filter((e) => e.alive && e.c.distanceTo(p.pos) < 60).length >= 3);
  const blinkK = G.pw.S.d.type === 'blink';
  const blinkP = blinkK && G.pw.S.ammo > 0 && (G.tether ? Math.random() < 0.08 : (leapNear || sniped) ? Math.random() < 0.2 : incoming ? Math.random() < 0.1 : G.hud.hurt > 0.35 ? Math.random() < 0.05 : run.ring && run.ring.out > -3 ? Math.random() < 0.05 : false);
  return { od: odNow, f, s, boost: d > 70 || !!goal || (flamer && bigT && d > 18), qboost: (G.shots.some((sh) => sh.jamOrb && sh.react && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 14) && p.en >= 18 && Math.random() < 0.4) || (auto.leechT > 0.7 && p.en >= 18 && Math.random() < 0.08) || (!!G.tether && !blinkK && Math.random() < 0.06) || (G.hud.hurt > 0.35 && Math.random() < 0.05) || (incoming && Math.random() < 0.25) || (sniped && Math.random() < 0.035) || (leapNear && Math.random() < 0.3) || (blinkAt && Math.random() < 0.35) || (shellAt && Math.random() < 0.3) || (holeAt && Math.random() < 0.3) || (G.webT > 0.4 && p.en >= 18 && Math.random() < 0.05), jump: jump || holeAt, hover: auto.hover > 0, b0: fire('R'), b2: fire('L'), e: blinkK ? blinkP : sPress };
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
  G.tbWide = !!auto.on;
  if (auto.on) A = autoIntent(dt);
  else {
    const B = pad.b, T = touch.b;
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight') || !!B[1] || !!B[4] || !!B[10] || !!T.boost, space = keys.has('Space') || !!B[0] || !!T.jump;
    const cl = (v) => Math.max(-1, Math.min(1, v));
    A = { f: cl((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - pad.ly - touch.my), s: cl((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + pad.lx + touch.mx),
      boost: shift, qboost: shift && !lastShift, jump: space && !lastSpace, hover: space, b0: mouse.b0 || !!B[7] || !!T.b0, b2: mouse.b2 || !!B[6] || !!T.b2, e: ePressed || !!B[5] || !!T.e, od: odPressed || !!B[3] || !!T.od };
    odPressed = false;
    lastShift = shift; lastSpace = space;
  }
  if (G.scramT > 0 && !(auto.on && G.scramT < SCRAM.t - 1.2)) { A.f = -A.f; A.s = -A.s; }
  cam.pitch = Math.max(-0.75, Math.min(0.95, cam.pitch));
  const fw = [-Math.sin(cam.yaw), -Math.cos(cam.yaw)], rt = [Math.cos(cam.yaw), -Math.sin(cam.yaw)];
  const mx = fw[0] * A.f + rt[0] * A.s, mz = fw[1] * A.f + rt[1] * A.s;
  // aim pitch from the chest to the aim point
  const chest = p.center(new V3());
  const ad = G.aimPoint.clone().sub(chest);
  const aimPitch = Math.atan2(ad.y, Math.hypot(ad.x, ad.z) || 1);
  const aimYaw = Math.hypot(ad.x, ad.z) > 6 ? Math.atan2(-ad.x, -ad.z) : cam.yaw;
  const frz = G.frozenT > 0;   // frozen solid: no input, no fire
  p.update(dt, frz ? { mx: 0, mz: 0, aimYaw: p.aimYaw, aimPitch } : { mx, mz, boost: A.boost, qboost: A.qboost, jump: A.jump, hover: A.hover, aimYaw, aimPitch });
  updateCamera(dt);
  camera.updateMatrixWorld();
  updateAim();
  if (A.od) activateOD();
  updateOD(dt);
  if (chipOn('nano') && G.player.alive && state === 'play' && G.time - G.hurtAt > 5) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.006 * dt);
  if (p.alive && !run.won && !frz) {
    const dm = dmgMul() * (G.od.t > 0 ? OD.dmg : 1);
    G.curLabel = 'p-' + G.pw.R.key; weaponTick(dt, p, 'R', G.pw.R, A.b0 && !(G.jam.R > 0), G.aimPoint, G.lockTarget, 'P', G.locks, dm);
    G.curLabel = 'p-' + G.pw.L.key; weaponTick(dt, p, 'L', G.pw.L, A.b2 && !(G.jam.L > 0), G.aimPoint, G.lockTarget, 'P', G.locks, dm);
    G.curLabel = 'p-' + G.pw.S.key; weaponTick(dt, p, 'S', G.pw.S, A.e && !(G.jam.S > 0), G.aimPoint, G.lockTarget, 'P', G.locks, dm);
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
  updateSnow(dt); updateRain(dt); ascentLogic(dt); tideLogic(dt);
  waveLogic(dt);
  thrust(p.alive ? Math.max(p.thrustLv, p.hoverLv * 0.7) : 0);
  const inten = run.wave < 0 ? 0 : (G.bosses && G.bosses.some((b) => b.alive)) ? 1 : Math.min(0.9, 0.45 + run.wave * 0.15);
  musicTick(run.over ? 0 : inten);
  // shadow camera follows the player
  // snapped to whole shadow texels in light space, so static shadows don't crawl as the player moves
  _shX.crossVectors(_shUp, SUN_DIR); if (_shX.lengthSq() < 1e-6) _shX.set(1, 0, 0); _shX.normalize(); _shY.crossVectors(SUN_DIR, _shX);
  const tx = (SC.right - SC.left) / sun.shadow.mapSize.x, sa = Math.round(p.pos.dot(_shX) / tx) * tx, sb = Math.round(p.pos.dot(_shY) / tx) * tx;
  _shP.copy(_shX).multiplyScalar(sa).addScaledVector(_shY, sb).addScaledVector(SUN_DIR, p.pos.dot(SUN_DIR));
  sun.position.copy(_shP).addScaledVector(SUN_DIR, 200); sun.target.position.copy(_shP); sun.target.updateMatrixWorld();
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
  sky.material.uniforms.cT.value += dt * 0.012; feedPost(); atmo.update(camera, SUN_DIR);
  composer.render();
  if (G.afterRender) G.afterRender(dt);   // WeChat build draws its canvas HUD here
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
    feedPost(); atmo.update(camera, SUN_DIR); composer.render();
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
    await loadKit('./assets/kit.glb?v=68');
    await loadParts('./assets/parts.glb?v=2');
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
