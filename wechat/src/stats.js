// Per-mission play data: kept on the phone (wx storage) and reported to We分析 through wx.reportEvent.
// Event ids / fields must be created in the admin console (统计 → 自定义分析 → 事件管理) before reports show up:
//   mission_start { mission }
//   mission_end   { mission, result: win|fail|quit, wave, seconds, killer, revived, attempt }
//   ad_reward     { mission, kind: revive|double|supply, outcome: ended|skipped|failed|free }
/* global wx */
const KEY = 'iv_wx_stats';
let ST = { v: 1, m: {} };
try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1) ST = o; } catch (e) { /* storage unavailable */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* storage unavailable */ } };
const rec = (k) => ST.m[k] || (ST.m[k] = { start: 0, win: 0, fail: 0, quit: 0, firstWin: 0, secs: 0, wave: {}, killer: {}, ads: {} });
function report(id, data) { try { if (typeof wx !== 'undefined' && wx.reportEvent) wx.reportEvent(id, data); } catch (e) { /* not configured */ } }
export const sent = [];   // last reports, for tests
function send(id, data) { sent.push([id, data]); if (sent.length > 40) sent.shift(); report(id, data); }

export function missionStart(k) { rec(k).start++; save(); send('mission_start', { mission: k }); }
export function missionEnd(k, o) {
  const r = rec(k);
  r[o.result]++; r.secs += Math.round(o.seconds);
  if (o.result === 'win' && !r.firstWin) r.firstWin = r.start;   // attempts it took to clear the first time
  if (o.result !== 'win') { r.wave[o.wave] = (r.wave[o.wave] || 0) + 1; if (o.killer) r.killer[o.killer] = (r.killer[o.killer] || 0) + 1; }
  save();
  send('mission_end', { mission: k, result: o.result, wave: o.wave, seconds: Math.round(o.seconds), killer: o.killer || '', revived: o.revived ? 1 : 0, attempt: r.start });
}
export function adReward(k, kind, outcome) {
  const r = rec(k || '-'), a = r.ads[kind] || (r.ads[kind] = {});
  a[outcome] = (a[outcome] || 0) + 1; save();
  send('ad_reward', { mission: k || '', kind, outcome });
}
// table for DevTools / the sim: one row per mission
export function summary() {
  return Object.entries(ST.m).map(([k, r]) => {
    const done = r.win + r.fail + r.quit, top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([x, n]) => `${x}×${n}`).join(' ');
    return { mission: k, start: r.start, win: r.win, fail: r.fail, quit: r.quit, winRate: done ? +(r.win / done).toFixed(2) : 0, firstWinAttempt: r.firstWin, avgSecs: done ? Math.round(r.secs / done) : 0, failWave: top(r.wave), killer: top(r.killer), ads: JSON.stringify(r.ads) };
  });
}
export function resetStats() { ST = { v: 1, m: {} }; save(); }
