// IRON VANGUARD — main loop, camera, input, aiming, waves, HUD, hangar.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadKit, cloneKit } from './kit.js';
import { buildArena, addSolid, ARENA, solids, raySolids, groundAt, pointInSolid, clearLine, relaySites, mulberry32, LAVA, lavaAt, PLAT } from './world.js';
import { FX, TEX } from './fx.js';
import { initAudio, sfx, thrust, musicTick, setVolume } from './audio.js';
import { Mech, PALETTES, FRAMES, angDiff, PHYS } from './mech.js';
import { Wingman, Reactor, Convoy, WING } from './ally.js';
import { G, OD, explodeAt, WEAPONS, ARM_KEYS, SHOULDER_KEYS, weaponState, weaponTick, updateCombat, Turret, Drone, Walker, Bulwark, Gunship, Relay, Boss, BOSSES, RAIDERS, Colossus, Stalker, Mender, Crawler, Sapper, Jammer, JAM_R, Dropship, Howitzer, Warden, Burrower, Train, TRAIN, setEcho, Eel, Jet, Splitter, clearMeteors, Grappler, hurtPlayer, domeAt, clearWells, clearChill, clearStrikes, clearDiscs, clearDecoys, clearMines, clearMinis, dropRepair, enemyEnts, rayEnts } from './combat.js';

const $ = (id) => document.getElementById(id);
// rail loop for the train mission: a 118 x 82 m oval, closed (last point == first)
const TRACK = (() => { const a = []; for (let i = 0; i <= 96; i++) { const t = i / 96 * Math.PI * 2; a.push([118 * Math.cos(t), 82 * Math.sin(t)]); } a[96] = a[0]; a.rail = true; return a; })();
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
  elevator: { name: '天梯 · 轨道电梯', en: 'SKY ELEVATOR', desc: '在爬升的轨道电梯平台上作战 · 平台外是万丈虚空，边缘有能量护栏 · 攻击机俯冲扫射，地面红线就是弹道 · 越往上重力越弱 · 头目「暴君」在轨道上乘运输机降落', seed: 181, env: 'sky1', platform: 140, reward: 6000,
    ascend: [{ env: 'sky1', y: -140, cA: 0xffffff, cB: 0x9fb4c8, cover: 0.45, puff: 1, v: 18, g: 1 }, { env: 'sky2', y: -420, cA: 0xffd2b0, cB: 0x7a5a78, cover: 0.5, puff: 0.7, v: 24, g: 0.92 },
      { env: 'sky3', y: -1100, cA: 0xdde6ff, cB: 0x2a4680, cover: 0.56, puff: 0.25, v: 30, g: 0.8 }, { env: 'sky4', y: -2600, cA: 0xeef4ff, cB: 0x103470, cover: 0.62, puff: 0, v: 36, g: 0.6 }], waves: [
    { title: 'WAVE 1', sub: '海拔 3 km · 平台开始爬升', spawn: { drone: 4, walker: 3, jet: 2, crawler: 6 } },
    { title: 'WAVE 2', sub: '海拔 12 km · 黄昏云海 · 运输机在平台上卸兵', spawn: { jet: 2, dropship: 2, gunship: 1, walker: 2, drone: 2 } },
    { title: 'WAVE 3', sub: '海拔 40 km · 平流层 · 敌方机甲小队登台', spawn: { jet: 2, raider: 2, lancer: 1, sapper: 1, dropship: 1 } },
    { title: 'FINAL WAVE', sub: '海拔 100 km · 轨道 · 重力减弱 · 「暴君」乘重型运输机降落', spawn: { dropBoss: 'tyrant', bossHp: 1.15, jet: 3, drone: 2 } },
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
  meteor: { top: 0x050414, hor: 0x3c2050, fog: [110, 680], hemi: [0xd0b0ff, 0x2a1a2c, 0.5], sun: [0xffc0a0, 1.7], env: 0.26, exp: 0.98, dir: [-0.45, 0.4, 0.55], disc: 0.4, stars: 0.8, earth: [0, -1, 0] },
  night: { top: 0x060b18, hor: 0x18223a, fog: [45, 340], hemi: [0x6880b8, 0x141419, 0.22], sun: [0xa8bcff, 0.55], env: 0.1, exp: 1.08, dir: [0.3, 0.62, -0.5], disc: 0.45 },
};
const KILL_CR = { splitter: 60, jet: 220, eel: 200, grappler: 240, train: 2500, burrower: 180, warden: 200, howitzer: 220, dropship: 350, jammer: 180, sapper: 160, crawler: 20, mender: 140, stalker: 260, drone: 40, turret: 60, walker: 120, bulwark: 150, gunship: 220, raider: 300, relay: 450, boss: 1200 };
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
const writeSave = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const playerMods = () => { const u = save.up, th = chipOn('thrust'); return { hp: 1 + 0.08 * u.armor, en: 1 + 0.08 * u.gen, regen: (1 + 0.08 * u.gen) * (th ? 1.25 : 1), boost: (1 + 0.04 * u.thr) * (th ? 1.1 : 1), speed: 1 + 0.02 * u.thr }; };
const chipSlots = () => (save.chip2 ? 2 : 1);
const chipOn = (k) => Array.isArray(cfg.chips) && cfg.chips.slice(0, chipSlots()).includes(k);
function playerWeapon(key) {   // weapon state with chip modifiers applied to a private copy of the weapon data
  const ws = weaponState(key), d = { ...ws.d };
  if (chipOn('mag') && d.slot === 'arm' && d.mag) { d.mag = Math.round(d.mag * 1.4); d.reload *= 0.8; }
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
  uniforms: { top: { value: new THREE.Color(0x6f98bf) }, hor: { value: HORIZON }, sun: { value: new V3(0.45, 0.55, 0.7).normalize() }, disc: { value: 1 }, stars: { value: 0 }, earth: { value: new V3(-0.45, 0.32, -0.83).normalize() } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
  fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sun; uniform float disc; uniform float stars; uniform vec3 earth; varying vec3 vD;
    float hs(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    void main(){ float h = clamp(vD.y, 0.0, 1.0); vec3 c = mix(hor, top, pow(h, 0.55));
      float s = max(dot(vD, sun), 0.0); c += vec3(1.0, 0.92, 0.8) * (pow(s, 600.0) * 4.0 + pow(s, 8.0) * 0.15 * disc);
      if (stars > 0.01) {
        vec3 q = floor(vD * 220.0); float st = hs(q); c += vec3(0.85, 0.9, 1.0) * step(0.9965, st) * (0.4 + 2.2 * fract(st * 97.0)) * smoothstep(0.0, 0.12, vD.y) * min(stars, 1.0);
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
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const SC = sun.shadow.camera; SC.left = -70; SC.right = 70; SC.top = 70; SC.bottom = -70; SC.near = 10; SC.far = 400; SC.updateProjectionMatrix();
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const SUN_DIR = new V3(0.45, 0.55, 0.7).normalize();
function applyEnv(key) {
  const E = typeof key === 'object' ? key : ENVS[key] || ENVS.day, U = sky.material.uniforms;
  U.top.value.set(E.top); HORIZON.set(E.hor); scene.fog.color.copy(HORIZON); scene.fog.near = E.fog[0]; scene.fog.far = E.fog[1];
  SUN_DIR.set(...E.dir).normalize(); U.sun.value.copy(SUN_DIR); U.disc.value = E.disc;
  hemi.color.set(E.hemi[0]); hemi.groundColor.set(E.hemi[1]); hemi.intensity = E.hemi[2];
  sun.color.set(E.sun[0]); sun.intensity = E.sun[1];
  U.stars.value = +E.stars || 0; if (E.earth) U.earth.value.set(...E.earth).normalize();
  scene.environmentIntensity = E.env; renderer.toneMappingExposure = E.exp;
  snowFx.visible = !!(E.snow || E.ash || E.leaves || E.dust || E.bubbles); rainFx.visible = !!E.rain;
  snowFx.material.color.set(E.bubbles ? 0x8fdcec : E.dust ? 0xa890d8 : E.leaves ? 0xd0782a : E.ember ? 0xff8a40 : E.ash ? 0x6a605a : 0xffffff); snowFx.userData.k = E.bubbles ? -0.45 : E.dust ? -0.15 : E.leaves ? 0.22 : E.ash ? 0.35 : 1;
  storm.on = !!(E.rain || E.bolts); storm.hemi = E.hemi[2]; storm.top.set(E.top); storm.k = 0; storm.t = 4 + Math.random() * 6;
}
let arenaKey = '';
function ensureArena() {
  const M = MISSIONS[cfg.mission], key = M.seed + M.env;
  if (key === arenaKey && arenaGroup) return;
  if (arenaGroup) scene.remove(arenaGroup);
  PLAT.R = M.platform || 0; asc = null;
  arenaGroup = buildArena(scene, M.seed, M.env, M.path || M.track || null, M.zones ? (M.evac ? [...M.zones, M.evac] : M.zones) : null); arenaKey = key;
  applyEnv(M.env);
  if (M.platform) buildAscent(arenaGroup);
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
  if (!storm.on) return;
  const a = rainFx.geometry.attributes.position.array, c = camera.position, H = RAIN_BOX / 2, vx = 3, vy = -34, L = 0.045;
  if (rainFx.visible) for (let i = 0; i < RAIN_N; i++) {
    const j = i * 6;
    let x = a[j] + vx * dt, y = a[j + 1] + vy * dt, z = a[j + 2];
    if (y - c.y < -H) y += RAIN_BOX; if (x - c.x > H) x -= RAIN_BOX; else if (x - c.x < -H) x += RAIN_BOX; if (z - c.z > H) z -= RAIN_BOX; else if (z - c.z < -H) z += RAIN_BOX;
    if (y - c.y > H) y -= RAIN_BOX;
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
  G.player = new Mech(scene, mctx, { palette: cfg.palette, frame: cfg.frame, loadout: { R: cfg.R, L: cfg.L, S: cfg.S }, yaw: 0, mods: playerMods() });
  G.player.pos.set(0, 0, 128);
  G.pw = freshPW();
  cam.yaw = 0; cam.pitch = -0.05;
  buildWeaponPanel();
}

const wingOn = () => !!(save.wing && cfg.wing);
function clearWorld() {
  if (G.wing) G.wing.dispose(); if (G.core) G.core.dispose();
  clearDecoys(); clearWells(); clearChill(); clearStrikes(); clearDiscs(); clearMeteors(); G.meteorSaid = false; G.tether = null; G.blinkInv = 0; G.eelSaid = false; G.jetSaid = false; G.train = null; G.hornSaid = false; G.wing = null; G.core = null; G.friends.length = 0;
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
  G.echoLo = setEcho({ R: cfg.R, L: cfg.L, S: cfg.S, frame: cfg.frame });
  PHYS.g = M.grav || 1; G.meteorOn = !!M.meteors; if (M.ascend) setStage(0, true); clearWells(); G.eruptT = 8; G.freezes = 0; G.lavaT = 0; G.eruptions = 0; G.burrowUps = 0;
  if (M.defense) {
    G.core = new Reactor(scene, new V3(0, 0, 0), M.coreHp); G.friends.push(G.core);
    G.player.pos.set(0, 0, 22);
  }
  if (M.convoy) {
    G.core = new Convoy(scene, M.path, M.coreHp); G.friends.push(G.core);
    G.player.pos.set(M.path[0][0] + 6, 0, M.path[0][1] - 9); cam.yaw = -Math.PI / 2; G.player.aimYaw = cam.yaw;
  }
  G.od = { k: 0, t: 0, ringT: 0, dur: OD.dur + (chipOn('cap') ? 3 : 0) }; G.odGain = chipOn('cap') ? 1.4 : 1; G.hurtAt = -99;
  $('coreName').textContent = G.core ? (M.convoy ? '运输车 CONVOY' : '反应堆 REACTOR') : '';
  if (wingOn()) { G.wing = new Wingman(scene, mctx, cfg.palette === 'kestrel' ? 'vanguard' : 'kestrel'); G.friends.push(G.wing); }
  run.coreLost = false; run.trainLost = false;
  run.ring = M.storm ? { x: 0, z: 0, r: STORM.r0, x0: 0, z0: 0, r0: STORM.r0, x1: 0, z1: 0, r1: STORM.r0, t: 0, T: 1, wait: 0, outT: 0, said: false } : null; G.ring = run.ring; G.tether = null; G.blinkInv = 0; G.hooks = 0; G.snaps = 0; G.blinks = 0; G.stormT = 0; run.tetherSaid = false;
  stormWall.visible = !!M.storm; stormNext.visible = false;
  run.extract = !!M.extract; run.dlN = 0; run.got = 0; run.evac = null; run.lateBoss = null;
  run.capture = !!M.capture; run.zones = M.capture ? makeZones(M.zones) : M.extract ? makeZones(M.zones, { R: 8, kind: 'cache' }) : []; run.up = 0; run.finalOn = false; run.trickT = 22; run.zoneWarnT = {}; run.spotC = null;
  Object.assign(run, { dropSaid: false, gauntlet: !!M.gauntlet, escort: !!M.convoy, stops: M.stops || [], driving: false, harT: 8, waitSaid: 0, wave: -1, defense: !!M.defense, coreWarnT: -99, coreLowSaid: false, breakT: 1.5, t: 0, over: false, deathT: 0, won: false, droneT: 0, cr: 0, msslT: 0, boss2: null, relayHintT: 0, waves: M.endless ? [] : M.waves, endless: !!M.endless });
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
  if (run.endless) G.diff.hp = DIFFS[cfg.diff].hp * (1 + 0.05 * i) * (modOn('elite') ? 1.3 : 1);
  const S = W.spawn, R = run.defense ? 1.15 : 1;
  banner(W.title, W.sub, !!(S.boss || S.colossus || S.train));
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
  G.hud.kill = 0.3;
  const T = save.tally; T.all = (T.all || 0) + 1; T[e.kind] = (T[e.kind] || 0) + 1;
  if (e.isColossus) T.colossus = (T.colossus || 0) + 1;
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
  o.t = o.dur; o.k = 0; o.ringT = 0; o.uses = (o.uses || 0) + 1;
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
    for (const k of ['R', 'L', 'S']) { const w = G.pw[k]; w.ammo = w.d.mag || 0; w.reloadT = 0; w.cd = 0; }
    const nx = run.waves[run.wave + 1], big = nx && (nx.spawn.boss2 || run.gauntlet);
    if (!G.noRepair) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (big ? 0.5 : 0.25));
    if (big) showHint(nx.spawn.boss2 ? '下一波是双头目 · 已额外修复装甲' : '连战整备 · 修复 50% 装甲', 3);
    if (G.wing) G.wing.repair(0.4);
    if (run.gauntlet) G.od.k = Math.min(1, G.od.k + 0.35);
    if (G.core && G.core.alive) { G.core.hp = Math.min(G.core.maxHp, G.core.hp + G.core.maxHp * 0.15); if (G.core.hp > G.core.maxHp * 0.3) run.coreLowSaid = false; }
    run.breakT = run.gauntlet ? 6 : 4.5;
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
    stars: lnum(+A.stars || 0, +B.stars || 0, k), earth: B.earth };
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
const ZONE_R = 13, CAP_T = 6, UP_RATE = 0.0045, GROUND = new Set(['walker', 'bulwark', 'raider', 'turret', 'boss']);
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
  $('rSub').textContent = `${M.name} · ${D.name} · ` + (run.endless ? `坚守 ${Math.max(0, run.wave)} 波` : win ? (G.core ? `任务完成 · ${G.core.label}剩余 ${Math.ceil(G.core.hp / G.core.maxHp * 100)}%` : '任务完成') : run.coreLost ? `${G.core ? G.core.label : '反应堆'}在第 ${run.wave + 1} 波被摧毁` : run.trainLost ? '装甲列车逃脱' : `在第 ${run.wave + 1} 波被击毁`) + (G.wing ? ' · 僚机随行（报酬 ×0.85）' : '') + (mm > 1 ? ` · 挑战 ×${mm.toFixed(2)}` : '');
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
function buildTitle() {
  const el = $('tMission'); el.innerHTML = '';
  for (const [k, M] of Object.entries(MISSIONS)) {
    const d = document.createElement('button'); d.type = 'button'; d.className = 'mis' + (cfg.mission === k ? ' on' : '');
    const b = bestLine(k);
    d.innerHTML = `<b>${M.name}${b ? ' <em class="done">✓</em>' : ''}</b><span class="en">${M.en}</span>`; d.title = M.desc + (b ? ' · 最佳 ' + b : '');
    d.onclick = () => { initAudio(); sfx('ui'); cfg.mission = k; saveCfg(); ensureArena(); buildTitle(); };
    el.appendChild(d);
  }
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
  const F = G.player.frame;
  $('gStats').innerHTML = `AP <b>${Math.round(F.hp)}</b> · 速度 <b>×${F.speed.toFixed(2)}</b> · EN <b>${Math.round(F.en)}</b> · 推进 <b>×${F.boost.toFixed(2)}</b> · 受伤 <b>×${F.armor}</b>` + (save.up.fcs ? ` · 伤害 <b>×${dmgMul().toFixed(2)}</b>` : '');
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
      if (w.d.type === 'sentry') { const m = G.friends.find((x) => x.isSentry); if (m) { txt = 'SENTRY ' + Math.ceil(m.t); k = m.hp / m.maxHp; cls = ''; } }
      if (w.d.type === 'decoy') { const m = G.friends.find((x) => x.isDecoyObj); if (m) { txt = 'DECOY ' + Math.ceil(m.t); k = m.hp / m.maxHp; cls = ''; } }
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
  $('stormVig').style.opacity = run.ring && run.ring.out > 0 && G.player.alive ? Math.min(0.9, 0.4 + run.ring.out / 40 + Math.sin(performance.now() / 140) * 0.06).toFixed(2) : '0';
  $('hurt').style.opacity = Math.min(0.9, G.hud.hurt + (hpK < 0.25 ? 0.25 + Math.sin(performance.now() / 180) * 0.1 : 0)).toFixed(2);
  // waves / boss
  if (run.wave >= 0) {
    $('waveTitle').textContent = curWave().title;
    const left = G.enemies.filter((e) => e.alive).length;
    const rl = G.enemies.filter((e) => e.kind === 'relay' && e.alive).length;
    $('waveSub').textContent = run.breakT > 0 ? '整备中…' : run.extract ? (run.evac ? `撤离 ${Math.floor(run.evac.k * 100)}%` : `数据 ${run.got}/3`) + ` · 敌机 ${left}` : run.capture ? run.zones.map((z) => `${z.name}${z.own === 'P' ? '◆' : z.own === 'E' ? '✕' : '○'}`).join(' ') + ` · 敌机 ${left}` : (G.train && G.train.alive ? `逃脱 ${Math.floor(G.train.timeLeft() / 60)}:${String(Math.floor(G.train.timeLeft() % 60)).padStart(2, '0')} · 车厢 ${G.train.parts.filter((q) => q.alive && q.key !== 'loco').length}/3 · 敌机 ${left - 1}` : rl ? `中继塔 ${rl} · 敌机 ${left - rl}` : `剩余敌机 ${left}`);
  } else { $('waveTitle').textContent = 'STANDBY'; $('waveSub').textContent = ''; }
  const cb = $('coreBox'); cb.classList.toggle('hidden', !G.core && !run.capture && !run.extract);
  if (run.extract && !G.core) {
    const act = run.zones.find((z) => z.kind === 'cache' && z.k > 0 && z.k < 1), v = run.evac ? run.evac.k : (run.got + (act ? act.k : 0)) / 3;
    $('coreName').textContent = run.evac ? '撤离回收 EVAC' : `数据 DATA ${run.got}/3` + (act ? ` · 下载 ${act.name}` : '');
    $('coreBar').firstElementChild.style.width = (v * 100).toFixed(1) + '%'; $('coreBar').classList.remove('low'); $('corePct').textContent = Math.floor(v * 100) + '%'; cb.classList.remove('hit');
  }
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
  if (PLAT.R) { rctx.beginPath(); rctx.arc(-p.pos.x * K, -p.pos.z * K, PLAT.R * K, 0, Math.PI * 2); rctx.stroke(); }
  else rctx.strokeRect((-ARENA - p.pos.x) * K, (-ARENA - p.pos.z) * K, ARENA * 2 * K, ARENA * 2 * K);
  if (run.ring) {
    const Rg = run.ring; rctx.strokeStyle = 'rgba(190, 120, 255, 0.9)'; rctx.lineWidth = 3; rctx.beginPath(); rctx.arc((Rg.x - p.pos.x) * K, (Rg.z - p.pos.z) * K, Rg.r * K, 0, Math.PI * 2); rctx.stroke();
    if (stormNext.visible) { rctx.strokeStyle = 'rgba(235, 245, 255, 0.75)'; rctx.lineWidth = 1.5; rctx.setLineDash([5, 5]); rctx.beginPath(); rctx.arc((Rg.x1 - p.pos.x) * K, (Rg.z1 - p.pos.z) * K, Rg.r1 * K, 0, Math.PI * 2); rctx.stroke(); rctx.setLineDash([]); }
  }
  for (const e of G.enemies) {
    if (e.kind === 'burrower' && e.cloaked && e.alive && !G.jammed) { rctx.fillStyle = 'rgba(190, 140, 90, 0.55)'; rctx.beginPath(); rctx.arc((e.pos.x - p.pos.x) * K, (e.pos.z - p.pos.z) * K, 3.5, 0, Math.PI * 2); rctx.fill(); continue; }
    if (!e.alive || e.cloaked || (G.jammed && e.kind !== 'boss')) continue;
    const x = (e.c.x - p.pos.x) * K, z = (e.c.z - p.pos.z) * K;
    if (e.kind === 'dropship') { rctx.fillStyle = e.cargo ? '#ffcc40' : '#8a7a50'; rctx.save(); rctx.translate(x, z); rctx.rotate(-e.yaw); rctx.beginPath(); rctx.moveTo(0, -9); rctx.lineTo(-7, 7); rctx.lineTo(7, 7); rctx.fill(); rctx.restore(); continue; }
    if (e.kind === 'warden') { if (e.domeOn()) { rctx.strokeStyle = 'rgba(255, 176, 80, 0.55)'; rctx.lineWidth = 1.5; rctx.beginPath(); rctx.arc(x, z, e.R * K, 0, Math.PI * 2); rctx.stroke(); } rctx.fillStyle = '#ffb050'; rctx.beginPath(); rctx.moveTo(x, z - 6); rctx.lineTo(x + 6, z); rctx.lineTo(x, z + 6); rctx.lineTo(x - 6, z); rctx.fill(); continue; }
    if (e.kind === 'howitzer') { rctx.fillStyle = '#ff9a40'; rctx.fillRect(x - 5, z - 5, 10, 10); rctx.strokeStyle = '#2a1a10'; rctx.lineWidth = 1.5; rctx.strokeRect(x - 5, z - 5, 10, 10); continue; }
    if (e.kind === 'jammer') { rctx.fillStyle = '#c070ff'; rctx.beginPath(); rctx.arc(x, z, 5, 0, Math.PI * 2); rctx.fill(); continue; }
    if (e.kind === 'relay') { rctx.fillStyle = '#ffd23a'; rctx.save(); rctx.translate(x, z); rctx.rotate(Math.PI / 4); rctx.fillRect(-6, -6, 12, 12); rctx.restore(); continue; }
    rctx.fillStyle = e.kind === 'boss' ? '#ff8a1a' : '#ff4a3a';
    if (e.kind === 'raider') rctx.fillStyle = '#ff9a5a';
    const s = e.kind === 'boss' ? 9 : e.kind === 'gunship' || e.kind === 'raider' ? 8 : e.kind === 'walker' || e.kind === 'bulwark' ? 7 : 5;
    rctx.fillRect(x - s / 2, z - s / 2, s, s);
  }
  if (run.capture || run.extract) for (const z of run.zones) { const x = (z.x - p.pos.x) * K, y = (z.z - p.pos.z) * K; rctx.strokeStyle = z.kind === 'evac' ? '#6dff9a' : z.own === 'P' ? '#5fe3ff' : z.own === 'E' ? '#ff4a3a' : z.kind === 'cache' ? '#ffd23a' : '#e8e8e8'; rctx.lineWidth = 3; rctx.beginPath(); rctx.arc(x, y, Math.max(6, z.R * K), 0, Math.PI * 2); rctx.stroke(); rctx.fillStyle = rctx.strokeStyle; rctx.font = 'bold 13px system-ui'; rctx.textAlign = 'center'; rctx.textBaseline = 'middle'; rctx.fillText(z.name, x, y); }
  rctx.fillStyle = '#ffb040'; if (!G.jammed) for (const m of G.mines) if (m.alive) rctx.fillRect((m.pos.x - p.pos.x) * K - 2, (m.pos.z - p.pos.z) * K - 2, 4, 4);
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
function autoIntent(dt) {
  const p = G.player; let tgt = null, bd = 1e9;
  for (const e of G.enemies) { if (!e.alive || e.dying || e.cloaked) continue; let d = e.c.distanceTo(p.pos) + (e.kind === 'boss' ? -30 : e.kind === 'relay' ? -25 : e.kind === 'mender' ? -35 : e.kind === 'jammer' ? (G.jammed === e ? -45 : -15) : e.kind === 'dropship' ? (e.cargo && e.st !== 'in' ? -60 : e.cargo ? -20 : 400) : e.kind === 'howitzer' ? -25 : e.kind === 'warden' ? (domeAt(p.pos) === e ? -90 : -30) : e.kind === 'crawler' && e.c.distanceTo(p.pos) < 35 ? -30 : 0); if (G.core) d = d * 0.5 + e.c.distanceTo(G.core.pos) * 0.7; if (d < bd) { bd = d; tgt = e; } }
  // pick up repairs when hurt
  let goal = null;
  if (p.hp < p.maxHp * 0.6) for (const k of G.pickups) { const d = k.o.position.distanceTo(p.pos); if (d < 70) { goal = k.o.position; break; } }
  if (!goal) for (const e of G.enemies) {
    if (e.kind !== 'jet' || !e.alive || !e.av || (e.st !== 'tele' && e.st !== 'strafe')) continue;
    const ax = e.A.x, az = e.A.z, dx = e.B.x - ax, dz = e.B.z - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.pos.x - ax) * dx + (p.pos.z - az) * dz) / L2)), cx = ax + dx * t, cz = az + dz * t, dd = Math.hypot(p.pos.x - cx, p.pos.z - cz);
    if (dd < 7) { let nx = p.pos.x - cx, nz = p.pos.z - cz; if (dd < 0.5) { nx = -dz; nz = dx; } const nl = Math.hypot(nx, nz) || 1; goal = new V3(p.pos.x + nx / nl * 14, 0, p.pos.z + nz / nl * 14); break; }
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
  if (!goal && G.core && G.core.alive && Math.hypot(p.pos.x - G.core.pos.x, p.pos.z - G.core.pos.z) > (run.escort ? (run.driving ? 22 : G.enemies.filter((e) => e.alive).length <= 2 ? 999 : 45) : 70)) goal = G.core.pos;
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
  if (LAVA.on && lavaAt(p.pos.x + p.vel.x * 0.4, p.pos.z + p.vel.z * 0.4) && p.en > 12) { if (p.grounded) jump = true; auto.hover = Math.max(auto.hover, 0.25); }
  const d = tgt ? tgt.c.distanceTo(p.pos) : 0;
  const isMelee = (t) => t === 'blade' || t === 'pile';
  const hasFlame = G.pw.R.d.type === 'flame' || G.pw.L.d.type === 'flame';
  const bigT = !!tgt && (tgt.kind === 'boss' || tgt.kind === 'raider');
  const flamer = hasFlame && !!tgt && (bigT || Math.abs(tgt.c.y - p.pos.y) < 7);   // rush ground targets; chase bosses with the boost
  const melee = isMelee(G.pw.R.d.type) || isMelee(G.pw.L.d.type) || flamer;
  let f = tgt ? (melee ? (d > (flamer ? 13 : 24) ? 1 : 0) : (d > 45 ? 1 : d < 22 ? -1 : 0)) : 0, s = tgt ? auto.st : 0;
  if (goal) { const gx = goal.x - p.pos.x, gz = goal.z - p.pos.z; const yaw = cam.yaw; const fw = [-Math.sin(yaw), -Math.cos(yaw)], rt = [Math.cos(yaw), -Math.sin(yaw)]; f = Math.sign(gx * fw[0] + gz * fw[1]); s = Math.sign(gx * rt[0] + gz * rt[1]); }
  const los = tgt && clearLine(p.center(new V3()), tgt.c);
  const empK = G.pw.S.d.type === 'emp', empNear = empK && (G.enemies.some((e) => e.alive && !e.dying && e.c.distanceTo(p.pos) < 22) || G.shots.some((sh) => sh.team === 'E' && sh.kind !== 'bullet' && sh.kind !== 'ebullet' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 20));
  const sonK = G.pw.S.d.type === 'sonar', sonNear = sonK && (!!G.jammed || G.enemies.some((e) => e.kind === 'stalker' && e.alive && !(e.markT > 0) && e.c.distanceTo(p.pos) < 75) || G.enemies.filter((e) => e.alive && !e.dying && !(e.markT > 0) && e.c.distanceTo(p.pos) < 70).length >= 3);
  auto.sT -= dt; const sPress = auto.sT <= 0 && (empK ? empNear : sonK ? sonNear : los) && (G.pw.S.d.type !== 'orbital' || (!!G.lockTarget && d < 150)); if (sPress) auto.sT = 0.6;
  const sniped = G.enemies.some((e) => e.kind === 'stalker' && e.st === 'aim' && e.lockOn === p && e.stT < 0.5);
  const incoming = G.shots.some((sh) => sh.team === 'E' && sh.kind === 'missile' && Math.hypot(sh.x - p.pos.x, sh.y - p.pos.y - 3, sh.z - p.pos.z) < 22);
  const leapNear = G.enemies.some((e) => (e.kind === 'crawler' && e.st === 'leap' && e.c.distanceTo(p.pos) < 12) || (e.kind === 'burrower' && e.st === 'warn' && Math.hypot(e.spot.x - p.pos.x, e.spot.z - p.pos.z) < 7));
  const fire = (slot) => !!los && (G.pw[slot].d.type !== 'blade' || d < 36) && (G.pw[slot].d.type !== 'pile' || d < 24) && (G.pw[slot].d.type !== 'flame' || d < 20) && (!G.pw[slot].d.chill || d < 66) && (G.pw[slot].d.type !== 'disc' || d < 52) && (G.pw[slot].d.type !== 'charge' || Math.random() < 0.985);
  const odNow = G.od.k >= 1 && (G.bosses.some((b) => b.alive && b.c.distanceTo(p.pos) < 80) || G.enemies.filter((e) => e.alive && e.c.distanceTo(p.pos) < 60).length >= 3);
  const blinkK = G.pw.S.d.type === 'blink';
  const blinkP = blinkK && G.pw.S.ammo > 0 && (G.tether ? Math.random() < 0.08 : (leapNear || sniped) ? Math.random() < 0.2 : incoming ? Math.random() < 0.1 : G.hud.hurt > 0.35 ? Math.random() < 0.05 : run.ring && run.ring.out > -3 ? Math.random() < 0.05 : false);
  return { od: odNow, f, s, boost: d > 70 || !!goal || (flamer && bigT && d > 18), qboost: (!!G.tether && !blinkK && Math.random() < 0.06) || (G.hud.hurt > 0.35 && Math.random() < 0.05) || (incoming && Math.random() < 0.25) || (sniped && Math.random() < 0.035) || (leapNear && Math.random() < 0.3), jump, hover: auto.hover > 0, b0: fire('R'), b2: fire('L'), e: blinkK ? blinkP : sPress };
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
      boost: shift, qboost: shift && !lastShift, jump: space && !lastSpace, hover: space, b0: mouse.b0 || !!B[7] || !!T.b0, b2: mouse.b2 || !!B[6] || !!T.b2, e: ePressed || !!B[5] || !!T.e, od: odPressed || !!B[3] || !!T.od };
    odPressed = false;
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
  if (A.od) activateOD();
  updateOD(dt);
  if (chipOn('nano') && G.player.alive && state === 'play' && G.time - G.hurtAt > 5) G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.006 * dt);
  if (p.alive && !run.won) {
    const dm = dmgMul() * (G.od.t > 0 ? OD.dmg : 1);
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
  updateSnow(dt); updateRain(dt); ascentLogic(dt);
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
    await loadKit('./assets/kit.glb?v=26');
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
