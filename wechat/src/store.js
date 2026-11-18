// WeChat-build-only persistent state (separate from the game's own save so main.js never sees it).
const KEY = 'iv_wx';
// diffInit: the first-launch difficulty (新兵) has been applied; addTip: the add-to-My-Mini-Programs card was shown
const D = { introDone: false, supplyDay: '', supplyN: 0, quality: 'auto', tier: -1, diffInit: false, addTip: false };
export const WX = { ...D };
try { Object.assign(WX, JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch (e) { /* storage unavailable */ }
export function saveWX() { try { localStorage.setItem(KEY, JSON.stringify(WX)); } catch (e) { /* storage unavailable */ } }
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
