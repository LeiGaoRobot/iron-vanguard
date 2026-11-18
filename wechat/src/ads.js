// Rewarded video + share cards for the WeChat build.
/* global wx */
import { GAME_NAME, AD_UNIT_REWARDED, SHARE_IMAGE } from './config.js';

// ---------------------------------------------------------------- rewarded video
let ad = null, pending = null;
export const stats = { shown: 0, ended: 0, skipped: 0, failed: 0, free: 0 };

export function initAds() {
  if (!AD_UNIT_REWARDED || typeof wx.createRewardedVideoAd !== 'function') return;
  ad = wx.createRewardedVideoAd({ adUnitId: AD_UNIT_REWARDED });
  ad.onError(() => {});
  ad.onClose((res) => {
    const cb = pending; pending = null;
    const ended = !res || res.isEnded !== false;   // base libraries < 2.1.0 call onClose without res
    if (ended) stats.ended++; else stats.skipped++;
    if (cb) cb(ended);
  });
}
// 'video' when a real ad unit is configured, 'free' otherwise (rewards are just granted)
export const adMode = () => (ad ? 'video' : 'free');
export const adBusy = () => !!pending;

// cb(true) = grant the reward. Closing the video early gives cb(false).
// If the ad cannot load (no fill, network) the reward is granted anyway: the player asked for it in good faith.
export function showRewarded(cb) {
  if (!ad) { stats.free++; cb(true); return; }
  if (pending) return;
  pending = cb; stats.shown++;
  const fail = () => { const c = pending; pending = null; stats.failed++; if (c) c(true); };
  ad.show().catch(() => ad.load().then(() => ad.show()).catch(fail));
}

// ---------------------------------------------------------------- share cards
// A shared card carries ?m=<mission key>; opening it jumps straight into that mission.
let current = () => null;        // () => { key, name } of the mission the card should point at
let pendingJump = null;

function card(m) {
  const o = m ? { title: `${GAME_NAME}：来挑战「${m.name}」`, query: `m=${m.key}` } : { title: `${GAME_NAME}：驾驶机甲出击`, query: '' };
  if (SHARE_IMAGE) o.imageUrl = SHARE_IMAGE;
  return o;
}
export function initShare(getMission) {
  current = getMission;
  if (wx.showShareMenu) wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] });
  if (wx.onShareAppMessage) wx.onShareAppMessage(() => card(current()));
  if (wx.onShareTimeline) wx.onShareTimeline(() => { const c = card(current()); return { title: c.title, query: c.query, imageUrl: c.imageUrl }; });
  const q = (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync().query) || {};
  if (q.m) pendingJump = String(q.m);
  // warm start from a card while the game is already running in the background
  if (wx.onShow) wx.onShow((res) => { const m = res && res.query && res.query.m; if (m) pendingJump = String(m); });
}
export function shareMission(m) { if (wx.shareAppMessage) wx.shareAppMessage(card(m)); }
// the HUD takes the pending jump once it is on the title screen
export function takeJump() { const m = pendingJump; pendingJump = null; return m; }
