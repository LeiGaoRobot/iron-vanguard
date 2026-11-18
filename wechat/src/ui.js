// Shared 2D drawing helpers and Chinese-text filters for the WeChat canvas UI (hud.js, garage.js, intro.js).
// `S.g` is the HUD canvas context; hud.js sets it once at init.
export const S = { g: null };
export const PAL = { ink: '#e8f4ff', dim: 'rgba(200,220,235,0.72)', cyan: '#5fe3ff', amber: '#ffbe50', red: '#ff5a4a', green: '#7fe08a', bg: 'rgba(8,14,20,0.62)', line: 'rgba(95,227,255,0.45)', off: 'rgba(255,255,255,0.2)' };
export const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';
export const unit = () => Math.min(innerWidth, innerHeight) / 10;
export const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const el = (id) => document.getElementById(id);

// ---------------------------------------------------------------- Chinese-only text (review rejects English in the UI)
// main.js banners carry English titles / subtitles ('WAVE 2', 'SYSTEM DOWN'); translate the common ones and drop the rest.
const ZH = [
  [/\bFINAL WAVE\b/g, '最终波'], [/\bWAVE CLEAR\b/g, '本波肃清'], [/\bROUND CLEAR\b/g, '本轮肃清'], [/\bAREA CLEAR\b/g, '区域肃清'],
  [/\bOBJECTIVE CLEAR\b/g, '目标达成'], [/\bMISSION COMPLETE\b/g, '任务完成'], [/\bMISSION FAILED\b/g, '任务失败'],
  [/\bWAVE (\d+)\b/g, '第 $1 波'], [/\bROUND (\d+)\b/g, '第 $1 轮'], [/\bAMBUSH\b/g, '遭遇伏击'], [/\bCOUNTERATTACK\b/g, '敌方反攻'],
  [/\bOVERDRIVE\b/g, '超载'], [/\bECM\b/g, '电子干扰'], [/\bAP\b/g, '装甲'], [/\bEN\b/g, '能量'],
];
export const CJK = /[㐀-鿿＀-￯　-〿]/;
export function zh(s) {
  if (!s) return '';
  let t = String(s);
  for (const [r, v] of ZH) t = t.replace(r, v);
  // keep only ' · ' segments that have Chinese in them ('CONVOY LOST', 'SYSTEM DOWN' go)
  return t.split(' · ').map((x) => x.trim()).filter((x) => CJK.test(x)).join(' · ');
}
// 'LZ-1 光束炮' -> '光束炮' (model codes read as English to reviewers)
export const wName = (n) => { const p = String(n).split(' '); return p.length > 1 && !CJK.test(p[0]) ? p.slice(1).join('') : String(n); };
export const stripTags = (s) => String(s).replace(/<small>/g, '\n').replace(/<[^>]*>/g, '');
export const money = (n) => `${n} 资金`;
export const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- primitives
export function text(s, x, y, size, col = PAL.ink, align = 'center', weight = 600) {
  const g = S.g;
  g.font = `${weight} ${Math.round(size)}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle';
  g.lineWidth = Math.max(2, size / 6); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(s, x, y);
  g.fillStyle = col; g.fillText(s, x, y);
}
// plain text cut to maxW with an ellipsis (no outline: for panels with their own background)
export function flat(s, x, y, size, col = PAL.ink, align = 'left', weight = 500, maxW = 1e9) {
  const g = S.g;
  g.font = `${weight} ${Math.round(size)}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle';
  let t = String(s);
  if (g.measureText(t).width > maxW) { while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; }
  g.fillStyle = col; g.fillText(t, x, y);
}
export function bar(x, y, w, h, k, col, label, val) {
  const g = S.g;
  g.fillStyle = PAL.bg; g.fillRect(x, y, w, h);
  g.fillStyle = col; g.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, k)), h - 2);
  g.strokeStyle = PAL.line; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) { g.fillStyle = PAL.ink; g.font = `600 ${Math.round(h * 0.78)}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(label, x + 6, y + h / 2 + 0.5); }
  if (val) { g.textAlign = 'right'; g.fillText(val, x + w - 6, y + h / 2 + 0.5); }
}
export function circle(x, y, r, fill, stroke, lw = 2) {
  const g = S.g;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
export function box(r, fill = 'rgba(10,20,28,0.8)', stroke = null, lw = 2) {
  const g = S.g;
  g.fillStyle = fill; g.fillRect(r.x, r.y, r.w, r.h);
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw); }
}
export function panel(title, sub) {
  const W = innerWidth, H = innerHeight, u = unit(), g = S.g;
  g.fillStyle = 'rgba(4,8,12,0.55)'; g.fillRect(0, 0, W, H);
  text(title, W / 2, H * 0.24, u * 1.0, PAL.ink, 'center', 800);
  if (sub) text(sub, W / 2, H * 0.24 + u * 0.95, u * 0.36, PAL.dim);
}
export function button(r, label, col = PAL.cyan, size = 0.42) {
  box(r, 'rgba(10,20,28,0.8)', col);
  text(label, r.x + r.w / 2, r.y + r.h / 2, r.h * size, PAL.ink, 'center', 700);
}
