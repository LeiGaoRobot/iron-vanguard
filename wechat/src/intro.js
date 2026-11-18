// 新兵训练: a ~60 s first mission for the WeChat build, with step-by-step touch hints.
// It is added to main.js's MISSIONS at boot (the object is shared through __iv) and listed first.
export const INTRO_KEY = 'wx_intro';
export const INTRO = {
  name: '新兵训练', desc: '白天 · 三座炮台和一小队无人机 · 一分钟学会移动、开火、悬浮', seed: 3, env: 'day', reward: 800, waves: [
    { title: 'WAVE 1', sub: '击毁三座炮台', spawn: { turret: 3 } },
    { title: 'FINAL WAVE', sub: '无人机来袭 · 跳起来打，或者急闪躲开', spawn: { drone: 4, walker: 1 } },
  ],
};

// each step: hint text, the touch button to ring (BTN key, 'stick' or 'look'), and when it is done
export const STEPS = [
  { t: '按住屏幕左侧拖动，移动机甲', btn: 'stick', done: (I, c) => I.G.player.pos.distanceTo(c.p0) > 6 },
  { t: '右侧拖动转视角 · 准星靠近敌人会自动锁定 · 按住「右臂」开火', btn: 'b0', done: (I) => I.G.stats.kills >= 1 },
  { t: '「左臂」是第二把武器，两只手可以一起开火', btn: 'b2', done: (I, c) => c.stepT > 4 || (I.touch.b.b2 && c.stepT > 1.5) },
  { t: '按住「跳跃」悬浮升空 · 点「推进」急闪躲开子弹', btn: 'jump', done: (I, c) => (c.stepT > 1.5 && (!I.G.player.grounded || I.G.player.thrustLv > 0.5)) || c.stepT > 9 },
  { t: '「肩部」是飞弹，冷却好了就按', btn: 'e', done: (I, c) => (c.stepT > 1.5 && I.G.pw.S && I.G.pw.S.cd > 0) || c.stepT > 8 },
  { t: '能量条见底会过热，飞一会儿落地歇一歇 · 打完这两波就毕业了', btn: '', done: (I, c) => c.stepT > 6 },
];
export const OD_STEP = { t: '超载充满了 · 按「超载」，10 秒内伤害提升、受伤减少', btn: 'od' };
