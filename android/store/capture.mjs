// Store screenshots for TapTap: drives the packed APK page (android/build/assets/www, run build_apk.py first)
// in headless Chrome at a phone-like 960x540 CSS viewport with a 2x pixel ratio (1920x1080 images),
// an Android user agent (so the game picks its mobile graphics tier, as in the APK) and touch emulation
// (so the touch HUD is shown).
//
//   node android/store/capture.mjs            # all shots
//   node android/store/capture.mjs forge beh  # only these
//
// Output: android/store/screenshots/NN_<name>.jpg
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WWW = join(HERE, '..', 'build', 'assets', 'www');
const OUT = join(HERE, 'screenshots');
const HTTP_PORT = 8240, CDP_PORT = 9333;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const W = 960, H = 540, DPR = 2;

// Every part / frame / camo owned, so the showcase builds can be equipped.
const OWN_ALL = `(() => {
  const s = __iv.save; s.cr = 18450;
  s.parts = s.parts || {}; s.frames = s.frames || {}; s.pats = s.pats || {};
  const P = { head: ['hawk','mono','crest','radar','hunter','thermal','ew'], core: ['bulwark','sleek','reactor','reclaim','reactive','nanite'], arms: ['brace','guard','stab','pod','rapid','coil','fist'], legs: ['heavy','rev','tread','hover','quad','spring','anchor','wheel'], pack: ['sprint','tank','glide','jumpjet','drone','swarm','aegis'] };
  for (const slot in P) for (const id of P[slot]) s.parts[slot + '.' + id] = true;
  for (const k of ['wraith','titan','falcon','rock','rage','cmd']) s.frames[k] = true;
  for (const k of ['digital','tiger','splinter','hex']) s.pats[k] = true;
  __iv.writeSave(); return true; })()`;

// Start a mission with a build and let the autopilot fight for a while (touch mode first, so no
// pointer-lock request and its "browser does not allow mouse lock" hint).
const sortie = (mission, o, secs, want = 2) => ({ want, run: `(async () => {
  __iv.setTouch(true);
  Object.assign(__iv.cfg, ${JSON.stringify(o)}, { mission: '${mission}', diff: 'normal' });
  __iv.start({ mission: '${mission}' }); __iv.setState('play');
  return __iv.sim(${secs}); })()` });
// Keep stepping until at least `want` enemies are ahead of the camera within 60 m, the camera is not
// pressed against a wall and no banner / hint is up.
const frame = (want, min) => `(() => {
  const G = __iv.G, cam = __iv.cam, ban = document.getElementById('banner'), hint = document.getElementById('hint');
  let seen = 0, i = 0;
  for (; i < 900; i++) {
    __iv.setState('play'); __iv.auto.on = true; __iv.step(1);
    if (__iv.run.over) break;
    const p = G.player.pos, fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    seen = G.enemies.filter((e) => { if (!e.alive) return false; const q = e.c || e.pos; if (!q) return false;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); return d < 60 && d > 6 && (dx * fx + dz * fz) / d > 0.6; }).length;
    const camD = G.camera.position.distanceTo(p);
    if (i >= ${min} && seen >= ${want} && camD > 8 && !ban.classList.contains('show') && hint.classList.contains('hidden')) break;
  }
  return { t: __iv.run.t.toFixed(1), extra: i, seen, hp: Math.round(G.player.hp), over: __iv.run.over }; })()`;
const clean = `(() => { const b = document.getElementById('banner'), h = document.getElementById('hint'); return !b.classList.contains('show') && +getComputedStyle(b).opacity < 0.03 && h.classList.contains('hidden'); })()`;  // the banner fades out over real time

// The hangar the way a player reaches it: start a sortie, pause, press "hangar" (clears the world and
// rebuilds the player mech with the chosen build), then scroll the panel to the frames / parts section.
const hangar = (o) => `(async () => {
  Object.assign(__iv.cfg, ${JSON.stringify(o)}, { mission: 'drill' });
  __iv.start({ mission: 'drill' }); __iv.setState('pause');
  document.getElementById('pGarage').click();
  await new Promise((r) => setTimeout(r, 2500));
  let el = document.getElementById('gPartsSec');
  const sec = el;
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (a.scrollHeight > a.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(a).overflowY)) { a.scrollTop += sec.getBoundingClientRect().top - a.getBoundingClientRect().top - 12; break; }
  }
  await new Promise((r) => setTimeout(r, 800));
  return __iv.state(); })()`;

const SHOTS = [
  { name: 'title', setup: `(async () => { __iv.setState('title'); const ml = document.getElementById('tMission'); ml.scrollTop = 0; await new Promise((r) => setTimeout(r, 1500)); return __iv.state(); })()`, settle: 600 },
  { name: 'hangar', setup: hangar({ palette: 'kestrel', pattern: 'digital', frame: 'std', R: 'rifle', L: 'gatling', S: 'missile', parts: { head: 'radar', core: 'reactor', arms: 'brace', legs: 'quad', pack: 'tank' } }) },
  { name: 'storm', setup: sortie('storm', { palette: 'specter', pattern: 'none', frame: 'std', R: 'rifle', L: 'gatling', S: 'missile', parts: { head: 'crest', core: 'sleek', legs: 'hover', arms: 'guard', pack: 'sprint' } }, 32) },
  { name: 'forge', setup: sortie('forge', { palette: 'vanguard', pattern: 'none', frame: 'heavy', R: 'rifle', L: 'gatling', S: 'missile', parts: { head: 'mono', core: 'bulwark', arms: 'brace', legs: 'tread', pack: 'tank' } }, 34) },
  { name: 'behemoth', setup: sortie('beh', { palette: 'ronin', pattern: 'tiger', frame: 'std', R: 'rifle', L: 'gatling', S: 'missile', parts: {} }, 26) },
  { name: 'singularity', setup: sortie('singularity', { palette: 'sakura', pattern: 'none', frame: 'std', R: 'rifle', L: 'gatling', S: 'missile', parts: { head: 'hawk', arms: 'stab', legs: 'quad', pack: 'glide' } }, 24) },
  { name: 'coliseum', setup: sortie('coliseum', { palette: 'vanguard', pattern: 'hex', frame: 'std', R: 'rifle', L: 'gatling', S: 'missile', parts: { head: 'crest', core: 'sleek', legs: 'rev', pack: 'sprint' } }, 28) },
  { name: 'snow', setup: sortie('snow', { palette: 'kestrel', pattern: 'splinter', frame: 'std', R: 'rifle', L: 'gatling', S: 'missile', parts: { head: 'ew', core: 'nanite', arms: 'guard', legs: 'heavy', pack: 'aegis' } }, 30) },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const only = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  const http = spawn('python', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], { cwd: WWW, stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'iv-shots-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--ignore-gpu-blocklist', '--enable-gpu',
    '--use-angle=d3d11', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  try {
    let page;
    for (let i = 0; i < 50 && !page; i++) {
      await sleep(300);
      try { page = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch (e) { /* not up yet */ }
    }
    if (!page) throw new Error('Chrome did not start');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map();
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async (expression, timeout = 180000) => {
      const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout });
      if (m.result && m.result.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 600));
      return m.result && m.result.result && m.result.result.value;
    };

    await send('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'Android' });
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
    for (let i = 0; i < 120; i++) {
      await sleep(500);
      const st = await evaluate(`window.__iv ? __iv.state() : ''`).catch(() => '');
      if (st === 'title') break;
      if (i === 119) throw new Error('game did not reach the title screen');
    }
    console.log('gpu:', await evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl2'); const x = g && g.getExtension('WEBGL_debug_renderer_info'); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : '?'; })()`));
    await evaluate(OWN_ALL);

    let n = 0;
    for (const s of SHOTS) {
      n++;
      if (only.length && !only.includes(s.name)) continue;
      const t0 = Date.now();
      let r, shot;
      if (typeof s.setup === 'string') {
        r = await evaluate(s.setup);
        await sleep(s.settle || 300);
        shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, captureBeyondViewport: false });
      } else {
        // the game keeps running in real time between the last step and the capture, so a banner can
        // pop up in between: check afterwards and take it again
        r = await evaluate(s.setup.run);
        for (let k = 0; k < 6; k++) {
          r = await evaluate(frame(s.setup.want, k ? 20 : 30));
          shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92, captureBeyondViewport: false });
          if (await evaluate(clean)) break;
          await sleep(400);
        }
      }
      const file = join(OUT, `${String(n).padStart(2, '0')}_${s.name}.jpg`);
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      console.log(s.name, JSON.stringify(r), ((Date.now() - t0) / 1000).toFixed(1) + 's ->', file);
    }
    ws.close();
  } finally {
    chrome.kill(); http.kill();
    await sleep(800);
    try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* chrome may still hold files */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
