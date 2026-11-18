// "How did I lose?" — sums this run's G.dmgLog by enemy kind and names them in Chinese.
// Labels look like 'walker', 'raider-shotgun', 'gunship-missile', 'core<-drone' (damage to the reactor / truck).
const NAMES = {
  drone: '无人机', turret: '炮台', walker: '步行机', bulwark: '护盾坦克', gunship: '武装直升机', boss: '头目', raider: '敌方机甲', lancer: '敌方机甲',
  relay: '中继塔', stalker: '隐形狙击机', mender: '维修无人机', crawler: '自爆蜘蛛', sapper: '布雷机', mine: '地雷', jammer: '干扰机', dropship: '运输机',
  howitzer: '自走炮', warden: '穹盾发生器', burrower: '钻地虫', train: '装甲列车', eel: '雷鳗', jet: '攻击机', splitter: '分裂球', skimmer: '气垫炮艇',
  lev: '沙海巨虫', prism: '棱镜反射', fencer: '激光栅栏', fence: '激光栅栏', hive: '蜂巢', swarm: '自爆蜂群', blinker: '闪影', watch: '瞭望塔炮击',
  frost: '寒霜炮', blimp: '飞艇炸弹', colossus: '巨像', grappler: '钩锁机', echo: '镜像', lava: '熔岩', eruption: '火山弹', meteor: '陨石',
  acid: '酸雾', thunder: '雷击', twister: '龙卷', icehole: '冰窟', grid: '电网', storm: '风暴圈', p: '自己的弹药', ally: '友军', X: '爆炸', sentry: '哨戒炮',
};
export const kindOf = (label) => String(label).replace(/^(core|truck)<-/, '').split('-')[0];
export const nameOf = (kind) => NAMES[kind] || '其他';

let base = {};
export function snapRun(G) { base = { ...(G.dmgLog || {}) }; }
// top sources of damage this run; target 'player' (default) or 'core' (reactor / convoy)
export function topSources(G, target = 'player', n = 2) {
  const sum = {};
  for (const [k, v] of Object.entries(G.dmgLog || {})) {
    const isCore = /^(core|truck)<-/.test(k);
    if ((target === 'core') !== isCore) continue;
    const d = v - (base[k] || 0); if (d < 1) continue;
    const kk = kindOf(k); sum[kk] = (sum[kk] || 0) + d;
  }
  return Object.entries(sum).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ kind: k, name: nameOf(k), dmg: Math.round(v) }));
}
