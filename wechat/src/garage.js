// Canvas hangar for the WeChat build. main.js's buildGarage() still fills its (fake) DOM lists whenever the state
// is 'garage' or an option is clicked; this screen reads those elements and calls their onclick handlers, so prices,
// saving, medals and the preview mech all stay main.js's own logic. Only the layout and the touch handling live here.
import { PAL, unit, inRect, el, zh, wName, stripTags, money, text, flat, box, button } from './ui.js';
import { TIERS, Q, setMode } from './quality.js';
import { WX, saveWX, today } from './store.js';
import { FRAMES } from '../../site/mech.js';

const TABS = [['up', '强化'], ['arm', '武器'], ['frame', '机体'], ['chip', '芯片'], ['diff', '难度'], ['medal', '勋章'], ['set', '设置']];
const SLOTS = [['gR', '右臂'], ['gL', '左臂'], ['gS', '肩部']];
export const SUPPLY = { cr: 800, perDay: 3 };
const GS = { tab: 'up', slot: 0, scroll: {}, hits: [], list: null, maxScroll: 0, drag: null };
let ctx = null;   // { iv, startMission, goCurrent, regarage, missionName, toast, showRewarded, adMode, onAd }
export function initGarage(c) { ctx = c; }

// ---------------------------------------------------------------- read main.js's fake DOM
const kids = (id) => (el(id).children || []).slice();
function optItem(c) {
  const [n, d] = stripTags(c.innerHTML).split('\n');
  return { kind: 'opt', name: wName((n || '').trim()), desc: zh(d || ''), on: c.classList.contains('on'), go: () => c.onclick && c.onclick(), colors: c.innerHTML.match(/#[0-9a-fA-F]{6}/g) };
}
function rowItem(r) {
  const h = r.innerHTML || '', b = r.children[0] || null;
  const name = (h.match(/<b>(.*?)<\/b>/) || [])[1] || '', desc = (h.match(/<small>(.*?)<\/small>/) || [])[1] || '';
  const pips = (h.match(/<i /g) || []).length, lv = (h.match(/class="on"/g) || []).length;
  const label = b ? (b.textContent === 'MAX' ? '已满' : b.textContent.replace(/ C$/, ' 资金')) : '';
  return { kind: 'row', name, desc: zh(desc), pips, lv, label, can: !!b && !b.disabled, go: () => b && !b.disabled && b.onclick && b.onclick() };
}
// medals: main.js's buildMedals() fills #mList when the state is 'medals' (see refreshMedals)
function medalItem(d) {
  const h = d.innerHTML || '', sm = [...h.matchAll(/<small>(.*?)<\/small>/g)].map((m) => m[1]);
  const pw = (h.match(/width:(\d+)%/) || [])[1];
  const em = (h.match(/<em>(.*?)<\/em>/) || [])[1] || '';
  return { kind: 'medal', name: (h.match(/<b>(.*?)<\/b>/) || [])[1] || '', desc: sm[0] || '', prog: sm[1] || '', pk: pw ? +pw / 100 : -1, on: d.classList.contains('on'), label: em.replace(/ C$/, ' 资金') };
}
function refreshMedals() { const I = ctx.iv(); I.setState('medals'); ctx.regarage(); }
function items() {
  const I = ctx.iv();
  if (GS.tab === 'up') {
    const out = kids('gUp').map(rowItem).concat(kids('gChip2').map(rowItem));
    for (const c of kids('gWing')) {
      if (c.classList.contains('opts')) out.push({ kind: 'head', name: '僚机' }, ...c.children.map(optItem));
      else out.push(rowItem(c));
    }
    return out;
  }
  if (GS.tab === 'arm') return kids(SLOTS[GS.slot][0]).map(optItem);
  if (GS.tab === 'frame') {
    const fr = Object.values(FRAMES);   // the DOM option only carries the English name as its subtitle
    const out = kids('gFrame').map(optItem).map((it) => { const f = fr.find((x) => x.name === it.name); return f ? { ...it, desc: `装甲 ${f.hp} · 速度 ×${f.speed} · 能量 ${f.en} · 推进 ×${f.boost} · 受伤 ×${f.armor}` } : it; });
    out.push({ kind: 'paint', name: '涂装', sw: kids('gPaint').map(optItem) });
    out.push({ kind: 'note', name: zh(stripTags(el('gStats').innerHTML).replace(/ · /g, ' · ')) });
    return out;
  }
  if (GS.tab === 'chip') return [{ kind: 'note', name: `已装 ${el('gChipN').textContent || ''} · 点击装上 / 卸下` }].concat(kids('gChip').map(optItem));
  if (GS.tab === 'diff') return kids('gDiff').map(optItem);
  if (GS.tab === 'medal') return [{ kind: 'note', name: `已获得 ${el('mCount').textContent || ''} · 每枚勋章首次达成时奖励资金` }].concat(kids('mList').map(medalItem));
  // settings: quality tiers (this build's own) + replay the tutorial
  const cur = `当前「${TIERS[Q.tier].name}」${Q.fps ? ` · 上局约 ${Math.round(Q.fps)} 帧` : ''}`;
  return [
    { kind: 'opt', name: '画质：自动（推荐）', desc: `按实际帧率自动降档 · ${cur}`, on: Q.mode === 'auto', go: () => setMode('auto') },
    ...TIERS.map((t, i) => ({ kind: 'opt', name: `画质：${t.name}`, desc: [`${t.msaa ? '抗锯齿 · ' : ''}${t.bloom ? '辉光 · ' : ''}${t.shadow ? `阴影 ${t.shadow}` : '无阴影'}`, `渲染倍率 ${t.dpr}`].join(' · '), on: Q.mode === String(i), go: () => setMode(String(i)) })),
    { kind: 'opt', name: '重玩新兵训练', desc: '一分钟复习移动、开火、悬浮', on: false, go: () => ctx.startMission('wx_intro') },
  ];
}

// ---------------------------------------------------------------- layout
function L() {
  const W = innerWidth, H = innerHeight, u = unit();
  const x0 = W * 0.42, x1 = W - 0.35 * u, tabH = 0.85 * u, top = 0.35 * u;
  const subH = GS.tab === 'arm' ? 0.8 * u : 0;
  const list = { x: x0, y: top + tabH + 0.2 * u + (subH ? subH + 0.15 * u : 0), w: x1 - x0, h: 0 };
  list.h = H - 0.35 * u - list.y;
  return { W, H, u, x0, x1, top, tabH, subH, list, rowH: 1.18 * u };
}
const supplyLeft = () => (WX.supplyDay === today() ? Math.max(0, SUPPLY.perDay - WX.supplyN) : SUPPLY.perDay);

export function drawGarage() {
  const I = ctx.iv(), g = ctx.g(), Ly = L(), { W, H, u, x0, x1, top, tabH, list, rowH } = Ly;
  GS.hits = [];
  const hit = (r, fn) => GS.hits.push({ r, fn });
  // left column: title, money, supply, back / sortie
  g.fillStyle = 'rgba(4,8,12,0.35)'; g.fillRect(0, 0, W, H);
  text('机库', 0.5 * u, 0.75 * u, 0.6 * u, PAL.ink, 'left', 800);
  text(money(I.save.cr), 0.5 * u, 1.45 * u, 0.4 * u, PAL.amber, 'left', 700);
  const bw = Math.min(W * 0.18, 3.6 * u), bh = 1.0 * u, by = H - bh - 0.35 * u;
  const back = { x: 0.4 * u, y: by, w: bw, h: bh }, go = { x: 0.4 * u + bw + 0.3 * u, y: by, w: bw, h: bh };
  button(back, '返回', PAL.dim); hit(back, () => I.setState('title'));
  button(go, '出击', PAL.cyan); hit(go, () => ctx.goCurrent());
  flat(`任务：${ctx.missionName()}`, 0.45 * u, by - 0.35 * u, 0.3 * u, PAL.dim, 'left', 500, bw * 2 + 0.3 * u);
  const left = supplyLeft(), sup = { x: 0.4 * u, y: by - 1.9 * u, w: bw * 2 + 0.3 * u, h: 0.95 * u };
  button(sup, left ? `${ctx.adMode() === 'video' ? '▶ ' : ''}领取补给 +${SUPPLY.cr} 资金（今日还剩 ${left} 次）` : '今日补给已领完', left ? PAL.amber : PAL.off, 0.36);
  if (left) hit(sup, () => ctx.showRewarded((ok) => {
    ctx.onAd('supply', ok);
    if (!ok) { ctx.toast('视频未看完，没有领到补给'); return; }
    if (WX.supplyDay !== today()) { WX.supplyDay = today(); WX.supplyN = 0; }
    WX.supplyN++; saveWX();
    I.save.cr += SUPPLY.cr; I.save.earned = (I.save.earned || 0) + SUPPLY.cr; I.writeSave();
    ctx.regarage();   // rebuild main.js's lists so the buy buttons see the new balance
    ctx.toast(`补给到账 · +${SUPPLY.cr} 资金`);
  }));
  // right panel
  box({ x: x0 - 0.15 * u, y: top - 0.15 * u, w: x1 - x0 + 0.3 * u, h: H - top }, 'rgba(6,12,18,0.72)');
  const tw = (x1 - x0) / TABS.length;
  TABS.forEach(([k, n], i) => {
    const r = { x: x0 + i * tw + 2, y: top, w: tw - 4, h: tabH }, on = GS.tab === k;
    box(r, on ? 'rgba(95,227,255,0.22)' : 'rgba(10,20,28,0.8)', on ? PAL.cyan : PAL.line, on ? 2 : 1);
    text(n, r.x + r.w / 2, r.y + r.h / 2, 0.36 * u, on ? PAL.ink : PAL.dim, 'center', 700);
    hit(r, () => { GS.tab = k; if (k === 'medal') refreshMedals(); });
  });
  if (GS.tab === 'arm') {
    const sw = (x1 - x0) / 3, y = top + tabH + 0.2 * u;
    SLOTS.forEach(([, n], i) => {
      const r = { x: x0 + i * sw + 2, y, w: sw - 4, h: Ly.subH }, on = GS.slot === i;
      box(r, on ? 'rgba(255,190,80,0.2)' : 'rgba(10,20,28,0.6)', on ? PAL.amber : PAL.line, 1);
      text(n, r.x + r.w / 2, r.y + r.h / 2, 0.32 * u, on ? PAL.ink : PAL.dim);
      hit(r, () => { GS.slot = i; });
    });
  }
  // scrolling list
  const its = items(), key = GS.tab === 'arm' ? 'arm' + GS.slot : GS.tab;
  const heights = its.map((it) => (it.kind === 'head' || it.kind === 'note' ? 0.7 * u : it.kind === 'paint' ? 1.4 * u : rowH));
  const total = heights.reduce((a, b) => a + b + 0.12 * u, 0);
  GS.maxScroll = Math.max(0, total - list.h); GS.list = list; GS.key = key;
  const sc = GS.scroll[key] = Math.min(GS.maxScroll, Math.max(0, GS.scroll[key] || 0));
  g.save(); g.beginPath(); g.rect(list.x, list.y, list.w, list.h); g.clip();
  let y = list.y - sc;
  its.forEach((it, i) => {
    const hh = heights[i], r = { x: list.x, y, w: list.w, h: hh };
    y += hh + 0.12 * u;
    if (r.y + hh < list.y || r.y > list.y + list.h) return;
    const vis = (rr) => ({ ...rr, y: Math.max(rr.y, list.y), h: Math.min(rr.y + rr.h, list.y + list.h) - Math.max(rr.y, list.y) });
    if (it.kind === 'head') { flat(it.name, r.x + 4, r.y + hh / 2, 0.32 * u, PAL.amber, 'left', 700); return; }
    if (it.kind === 'note') { flat(it.name, r.x + 4, r.y + hh / 2, 0.28 * u, PAL.dim, 'left', 500, r.w - 8); return; }
    if (it.kind === 'paint') {
      flat('涂装', r.x + 6, r.y + 0.32 * u, 0.3 * u, PAL.dim, 'left', 600);
      const s = 0.8 * u;
      it.sw.forEach((p, j) => {
        const q = { x: r.x + 6 + j * (s + 0.2 * u), y: r.y + 0.55 * u, w: s, h: s * 0.75 };
        const c = p.colors || ['#888888'];
        g.fillStyle = c[0]; g.fillRect(q.x, q.y, q.w, q.h);
        if (c[1]) { g.fillStyle = c[1]; g.fillRect(q.x + q.w * 0.6, q.y, q.w * 0.4, q.h * 0.5); }
        if (c[2]) { g.fillStyle = c[2]; g.fillRect(q.x + q.w * 0.6, q.y + q.h * 0.5, q.w * 0.4, q.h * 0.5); }
        g.strokeStyle = p.on ? PAL.cyan : 'rgba(255,255,255,0.3)'; g.lineWidth = p.on ? 3 : 1; g.strokeRect(q.x, q.y, q.w, q.h);
        hit(vis(q), p.go);
      });
      return;
    }
    if (it.kind === 'medal') {
      box(r, it.on ? 'rgba(255,190,80,0.14)' : 'rgba(12,22,30,0.85)', it.on ? PAL.amber : 'rgba(95,227,255,0.18)', 1);
      text(it.on ? '★' : '☆', r.x + 0.5 * u, r.y + hh / 2, 0.5 * u, it.on ? PAL.amber : PAL.dim);
      const tw2 = r.w - 3.4 * u;
      flat(it.name, r.x + 1.0 * u, r.y + hh * 0.32, 0.34 * u, it.on ? PAL.ink : PAL.dim, 'left', 700, tw2);
      flat(it.desc, r.x + 1.0 * u, r.y + hh * 0.7, 0.25 * u, PAL.dim, 'left', 500, tw2);
      text(it.label, r.x + r.w - 0.3 * u, r.y + hh * 0.36, 0.28 * u, it.on ? PAL.amber : PAL.ink, 'right', 700);
      if (it.pk >= 0) {
        const bx = r.x + r.w - 2.3 * u, by2 = r.y + hh * 0.66, bw2 = 2.0 * u;
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(bx, by2, bw2, 0.1 * u);
        g.fillStyle = PAL.cyan; g.fillRect(bx, by2, bw2 * it.pk, 0.1 * u);
        flat(it.prog, bx, by2 + 0.25 * u, 0.2 * u, PAL.dim, 'left', 500, bw2);
      }
      return;
    }
    const on = it.kind === 'opt' && it.on;
    box(r, on ? 'rgba(95,227,255,0.16)' : 'rgba(12,22,30,0.85)', on ? PAL.cyan : 'rgba(95,227,255,0.18)', on ? 2 : 1);
    const rw = it.kind === 'row' ? 3.0 * u : on ? 1.6 * u : 0;
    flat(it.name, r.x + 0.3 * u, r.y + hh * 0.34, 0.36 * u, PAL.ink, 'left', 700, r.w - rw - 0.5 * u);
    flat(it.desc, r.x + 0.3 * u, r.y + hh * 0.72, 0.26 * u, PAL.dim, 'left', 500, r.w - rw - 0.5 * u);
    if (it.kind === 'row') {
      if (it.pips) for (let k = 0; k < it.pips; k++) { g.fillStyle = k < it.lv ? PAL.amber : 'rgba(255,255,255,0.18)'; g.fillRect(r.x + r.w - rw - 0.2 * u - (it.pips - k) * 0.28 * u, r.y + hh * 0.3, 0.2 * u, 0.12 * u); }
      const b = { x: r.x + r.w - rw, y: r.y + hh * 0.18, w: rw - 0.2 * u, h: hh * 0.64 };
      button(b, it.label, it.can ? PAL.amber : PAL.off, 0.4);
      if (it.can) hit(vis(b), it.go);
    } else {
      if (on) text(GS.tab === 'set' || GS.tab === 'diff' ? '已选' : '已装备', r.x + r.w - 0.3 * u, r.y + hh / 2, 0.3 * u, PAL.cyan, 'right');
      hit(vis(r), it.go);
    }
  });
  g.restore();
  if (GS.maxScroll > 0) {   // scrollbar
    const k = list.h / (list.h + GS.maxScroll), th = Math.max(0.8 * u, list.h * k);
    g.fillStyle = 'rgba(95,227,255,0.35)'; g.fillRect(x1 + 0.08 * u, list.y + (list.h - th) * (sc / GS.maxScroll), 3, th);
  }
}

// ---------------------------------------------------------------- touch: drag the list to scroll, tap to pick
export function garageStart(t) { if (!GS.drag) GS.drag = { id: t.identifier, x: t.clientX, y: t.clientY, s: GS.scroll[GS.key] || 0, moved: false, inList: GS.list && inRect(GS.list, t.clientX, t.clientY) }; }
export function garageMove(t) {
  const d = GS.drag; if (!d || d.id !== t.identifier) return;
  const dy = t.clientY - d.y;
  if (Math.abs(dy) > 8 || Math.abs(t.clientX - d.x) > 8) d.moved = true;
  if (d.moved && d.inList) GS.scroll[GS.key] = Math.min(GS.maxScroll, Math.max(0, d.s - dy));
}
export function garageEnd(t) {
  const d = GS.drag; if (!d || d.id !== t.identifier) return;
  GS.drag = null;
  if (d.moved) return;
  const h = GS.hits.slice().reverse().find((q) => q.r.h > 0 && inRect(q.r, t.clientX, t.clientY));
  if (h) h.fn();
}
// entering the hangar on the medals tab: main.js only rebuilds #mList on setState('medals')
export function garageEnter() { if (GS.tab === 'medal') refreshMedals(); }
export const garageState = GS;
