# 钢翼先锋 Iron Vanguard · WeChat mini-game prototype

Feasibility prototype: the same `site/` game code, bundled for the WeChat mini-game runtime (no DOM), with a canvas HUD and touch controls. Title screen (mission picker) → mission → pause / result. Garage, medals and settings are not ported yet; the loadout is the default one (or whatever the save already holds).

## Build

```
cd wechat
npm install          # esbuild + three 0.184.0
node build.mjs       # writes wechat/minigame/
```

Output (`wechat/minigame/`, open this folder in WeChat DevTools as a mini-game project):

| file | what | size |
|---|---|---|
| `game.js` | adapter + three.js + all game modules + HUD, minified IIFE | 1.00 MB (main package limit 4 MB) |
| `assets/kit.glb` + `assets/game.js` | subpackage `assets`, loaded with `wx.loadSubpackage` before the kit is parsed | 4.24 MB |
| `game.json` | landscape, subpackage list | |
| `project.config.json` | `appid: touristappid` (only written if missing; put your own AppID here) | |

## How it works

- `src/adapter.js` runs before anything else and fakes what the game and three.js touch: `window` / `document` (a tiny element tree that keeps text and classes, so main.js's DOM HUD writes are harmless), canvases backed by `wx.createCanvas` (the first one is the screen), `localStorage` over `wx.*StorageSync`, `AudioContext` over `wx.createWebAudioContext` (with gain-node stand-ins for StereoPanner / DynamicsCompressor if missing), a `TextDecoder` polyfill for GLTFLoader, and `window.__MA_KIT_LOAD` which reads `assets/kit.glb` from the subpackage.
- `src/hud.js` draws the HUD into a 2D canvas (~30 Hz), uploads it as a `CanvasTexture` and composites it over the frame through `G.afterRender` (a hook main.js calls after `composer.render()`). It mirrors main.js's banner / hint / boss name by reading the fake DOM elements, and reads `__iv.G` / `__iv.run` for bars and counters. Touches from `wx.onTouch*` go straight into `__iv.touch` (left 42% = move stick, buttons on the right, anything else = look drag).
- `src/entry.js` imports adapter → `site/main.js` → HUD, and caps the pixel ratio at 1.5.
- Game-side hooks added for this build: `kit.js` accepts `window.__MA_KIT_LOAD`; `main.js` exposes `G.renderer / G.composer / G.bloom` and calls `G.afterRender(dt)`.

## Review text, rewarded video, share cards (`src/config.js`, `src/ads.js`)

- **Chinese-only UI.** Review rejects English on screen and any title other than the registered name. `GAME_NAME` in `src/config.js` is drawn on the title screen and in share cards. `zh()` in `hud.js` translates main.js's English banner lines (`WAVE 2` → `第 2 波`, `FINAL WAVE` → `最终波`, `AMBUSH` → `遭遇伏击` ...) and drops ' · ' segments with no Chinese in them (`SYSTEM DOWN`, `CONVOY LOST`). Weapon model codes are stripped from the HUD (`LZ-1 光束炮` → `光束炮`), and the mission's English name is no longer shown. New English banner text in `site/` needs a line in `ZH`, otherwise it is silently dropped.
- **Revive (rewarded video).** When the mech goes down (not when the reactor / convoy / train is lost), the HUD freezes the game in a `revive` state about 0.6 s into the death countdown: `▶ 复活` restores 50% armour + full energy, gives 2.5 s of invulnerability (`G.blinkInv`), clears incoming enemy shots and fires a 16 m / 140 shockwave; `放弃` lets the countdown finish. Offered once per run, and it resets on every new sortie.
- **Double pay (rewarded video).** The result screen reads this run's kill pay + mission pay from main.js's result panel (`rStats`) and adds the same amount again to `save.cr` once. The result screen buttons are 报酬翻倍 / 分享给好友 / 再来一次 / 返回标题. There are no interstitials or banners: an interstitial earned 1.9% of the article author's ad income (see below).
- **Ads.** Put the 激励视频 ad unit id in `AD_UNIT_REWARDED`. Left empty (the default, and the state until 流量主 is opened), no ad SDK is touched, both rewards are just granted, and the buttons have no ▶ mark. With an id, closing the video early gives no reward, and if the ad fails to load (no fill / network) the reward is granted anyway.
- **Share cards.** The share menu (转发 + 朋友圈) is on everywhere. A card's title is `钢翼先锋：来挑战「<mission>」` with query `m=<mission key>`, and the result screen has its own share button. When the game is opened from a card (cold start via `getLaunchOptionsSync`, warm start via `onShow`), it jumps straight into that mission as soon as it reaches the title screen.

Source of these choices: a solo developer's write-up of shipping a WeChat mini-game with Claude Code (x.com/benshandebiao/status/2121442979999297863, 2026-11-14). In their game, rewarded video is 90.6% of ad income, players watch ~7 a day when stuck, and giving away items kills video views. A personal account can register and open ads (认证 30 元/年); an ads-only game with no in-app purchase needed no 版号 and no 软著 in their case. Registration needs both 小游戏备案 and 小程序备案, and a single-player build can go live before 备案 finishes. 流量主 opens at 100 unique visitors. Review screenshots must be taken inside WeChat with the capsule button visible. Treat these as one person's experience and check the current rules on mp.weixin.qq.com.

## Hangar, quality tiers, play data, tutorial (2026-11-19)

Files: `src/ui.js` (shared canvas helpers + `zh()`), `src/garage.js`, `src/quality.js`, `src/stats.js`, `src/intro.js`, `src/recap.js`, `src/store.js` (this build's own storage key `iv_wx`, separate from the game save).

- **Hangar** (`garage.js`, title screen → 机库, and the result screen's 去机库 when the run paid out). Tabs: 强化 / 武器 (右臂 · 左臂 · 肩部) / 机体 (frames + paints + stat line) / 芯片 / 难度 / 设置. It does not reimplement anything: entering the `garage` state makes main.js's `buildGarage()` fill its fake DOM lists, and the canvas reads those elements (`<b>` name, `<small>` desc, `class="on"`, button text / `disabled`) and calls their `onclick`. Prices, saving, medals and the preview mech are therefore main.js's own, and new garage options in `site/` show up automatically. Lists scroll by dragging; a tap is a touch that moved less than 8 px. The preview camera gets `setViewOffset` (1.3x zoom-out, mech at 0.24 W) while in the hangar. **Daily supply**: ▶ +800 credits, 3 times a day (`SUPPLY` in garage.js); this is the third rewarded-video slot.
- **Quality** (`quality.js`): tiers 高 (dpr 1.5, 4x MSAA, Bloom, 2048 shadow) / 中 (dpr 1.25, no MSAA, Bloom, 1024 shadow, 55% particles) / 低 (dpr 1.0, no Bloom, no shadows, 30% particles). The first guess comes from `benchmarkLevel` (Android: ≥ 30 高, ≥ 15 中, otherwise 低; unknown → 中; DevTools → 高). In 自动 mode, play-time frame rate is measured with real wall time (skipping the first 4 s of each mission); a 3 s window under 38 fps steps down one tier, remembers it (`WX.tier`) and shows a toast. The settings tab can lock a tier. MSAA is switched by changing `samples` on the composer targets and disposing them; particles are thinned with `setDrawRange` on any Points / LineSegments with ≥ 800 vertices (reapplied each sortie).
- **Play data** (`stats.js`): per mission, kept in wx storage `iv_wx_stats`: starts, wins / fails / quits, total seconds, the attempt that first cleared it, which wave failed runs ended on, what killed you, and ad outcomes. Each event also goes to `wx.reportEvent`, so **We分析 needs these events created in the admin console (统计 → 自定义分析 → 事件管理)** before data shows up: `mission_start {mission}`, `mission_end {mission, result, wave, seconds, killer, revived, attempt}`, `ad_reward {mission, kind: revive|double|supply, outcome: ended|skipped|failed|free}`. Read the local table in DevTools with `__ivwx.stats.summary()`.
- **Death recap** (`recap.js`): the result screen of a failed run lists the top two damage sources of that run (or what destroyed the reactor / convoy), from the `G.dmgLog` difference since the sortie, with labels mapped to Chinese names (`walker` 步行机, `raider-shotgun` 敌方机甲 ...). Add a name to `NAMES` when a new enemy kind appears; unknown ones show as 其他.
- **新兵训练** (`intro.js`): a ~60 s first mission (3 turrets, then 4 drones + 1 walker, 800 pay) added to `MISSIONS` at boot as `wx_intro` and listed first. It starts by itself on first launch (no `introDone`, no earnings, no play data). A 6-step hint bar under the vitals rings the control it is about (stick → 右臂 → 左臂 → 跳跃 / 推进 → 肩部 → 过热提示), each step finishing on the action or a timeout. When overdrive fills it inserts a 超载 hint. Autopilot clears it in ~21 s.
- Also: the gale mission's wind direction is drawn on the canvas HUD. The adapter's `firstChild` / `lastChild` now create a child like `firstElementChild` does: main.js writes the wind arrow through `lastChild`, which was null in this build and threw on that mission.

Test notes: `__iv.step(n)` renders only once after n frames, so anything driven from `afterRender` (tutorial steps, revive detection, quality monitor) needs `for (...) __iv.step(1)` loops in the sim. Verified in the sim: first launch → tutorial runs through all 6 steps to the result. In the hangar: buying 装甲强化 (600) works; switching the shoulder weapon to 攻击无人机 after scrolling the list works; frame / paint / chip / settings tabs render; 低 turns off Bloom and shadows; supply +800 counts 1/3. Forcing ~36 fps for 9 s in 自动 drops 高 → 中 with the toast. A failed drill run shows "主要伤害来自：无人机 374 · 炮台 202" and logs `mission_end` with `killer: drone`. All 33 missions start and run 6 s.

## Boot screen, unlocks, retention, game club (2026-11-19, third pass)

- **Boot screen** (`drawSplash()` in hud.js): 健康游戏忠告 (`HEALTH` in config.js), the 12+ 适龄提示 badge, and a progress bar fed by `loadSubpackage(...).onProgressUpdate` (the adapter keeps it in `GameGlobal.__MA_LOAD`). While main.js is still in `loading` there is no game frame and no `afterRender`, so hud.js runs its own rAF loop (`splashLoop`) that renders only the HUD scene. After the title is up the splash stays at least 3 s (`SPL.min`) and title taps are ignored meanwhile. A failed kit load turns the bar red with 载入失败.
- **适龄提示**: the badge sits top-left on the boot and title screens; tapping it on the title opens the full text (`AGE`, `AGE_TEXT` in config.js; it must match the age filled in at 提审).
- **Mission unlocks**: the tutorial and 演习场 are open; each cleared mission opens the next two (`AHEAD = 2`). "Cleared" means any `save.best` key `<mission>.<diff>` exists, so web saves and earlier WeChat progress count. Locked missions can still be browsed (dimmed, 未解锁, "再通关 N 场前面的任务解锁"); 出击 there only toasts. Share-card links still open any mission. The title opens on the next mission to play.
- **First-launch difficulty**: a brand-new player (no best times, no earnings) gets `cfg.diff = 'easy'` (新兵: half damage taken) once (`WX.diffInit`). The title line shows the current difficulty.
- **Touch aim assist**: on top of main.js's drift toward the primary lock, holding 右臂 / 左臂 pulls the view toward the lock 2.4x as hard while the other thumb is off the view (1x while dragging). Measured: a lock 60 px right of the reticle moves yaw −0.0135 rad per frame while firing, 0 without firing.
- **每日挑战** entry on the title (opens after 演习场 is cleared; shows today's environment and ✓ when done). Its share card reads "每日挑战：今天这套地图和头目，你能打赢吗？" with `m=daily`, which always opens *today's* daily.
- **添加到我的小程序 card**: after the first win of a non-tutorial mission (once, `WX.addTip`), the result screen shows a card whose arrow points at the capsule from `wx.getMenuButtonBoundingClientRect()`; the first tap dismisses it.
- **勋章 tab** in the hangar: main.js only rebuilds `#mList` on `setState('medals')`, so opening the tab calls `setState('medals')` then `regarage()` (setState('garage') + this build's view offset; the supply reward uses the same helper now, it used to reset the preview camera). The title shows 勋章 n/43 bottom-right (`MEDALS.length`, so it follows site/).
- **游戏圈**: a native `wx.createGameClubButton` bottom-left, shown on the title only (`GAME_CLUB` in config.js).
- The title used to redraw at 2 Hz when idle, so taps on the arrows showed up to 0.5 s late; any touch now forces a redraw.
- Review copy rewritten for the current build (`review/申报文案.md`) plus `review/隐私与合规清单.md` (which `wx.*` APIs need the 用户隐私保护指引: only `setClipboardData` from diag.js). The screenshots were reshot on 2026-11-19, see below.

Sim additions: `loadSubpackage` reports 25 / 60 / 100 % progress, `getMenuButtonBoundingClientRect` returns an 87×32 capsule, `createGameClubButton` stores the button in `self.club` (`.visible`). `__ivwx.SPL.t0 = Date.now()` re-shows the splash, `SPL.min = 0` skips it. Verified in the sim: boot screen, title with badge / daily / club, age panel, locked mission toast, medals tab (43 rows), first non-tutorial win card, `?m=daily` deep link on a fresh launch (lands in the daily on 新兵).

### Review screenshots (2026-11-19 reshoot)

29 shots in `D:/AI/mech_arena/shots/rv_*.jpg`, 1280x720 sim frames of the current build. `review/collect.py` copies them into `review/1_场景` … `5_系统功能` under the names the 配图 lists in `review/申报文案.md` use, deletes files that are not on the list, and rebuilds `review/截图总览.jpg`. The 60 KB lower size bound catches blank frames. The near-black splash came out at 55 KB, so it was re-saved at JPEG quality 97 (same pixels).

HUD fixes the reshoot turned up:
- **Objective bar**: reactor / convoy / uplink progress (`#coreBox`) had no canvas counterpart, so the WeChat HUD never showed it. It is now drawn top-centre, and moves below the boss bar when a boss is up.
- **English names**: boss bar and objective names carried English tags (`巨像 COLOSSUS`, `暴君 TYRANT · 重装指挥机`). `cnOnly()` in ui.js strips all-caps words.
- **Banner translations**: `ZH` had no `CAPTURE`, `OBJECTIVE`, `INFILTRATE`, `FINAL ROUND` or `EXTRACT`, and `zh()` drops untranslated English, so the 占领据点 banner vanished. Every wave title in main.js is now covered. Both banner lines shrink to fit 90% of the width.
- **Pause and revive**: banners and hints no longer show through the 已暂停 / 机体损毁 panels. The battle controls are hidden under the revive buttons.
- **Weapon line**: it now fits between the stick and 推进 (shrinking if needed); it used to run under the button.
- **Tutorial bar**: the text shrinks instead of being cut off.

How the frames were set up, so they can be retaken:
- **Base save**: intro, drill, harbor and snow cleared; 3260 credits; 3 medals. Seed it in the worker before shooting.
- **Start missions from the title** (`setState('title')` then `start()`). Otherwise the HUD keeps the old run and skips its per-run setup.
- **Banner shots**: run the autopilot (`sim(1)` steps) until `#banner` shows the wanted text. Then turn the autopilot off, try six camera headings for 18 frames each, keep the one with the longest camera-to-mech distance, and shoot. main.js clears the banner after 2.8 s of `step()`, so the heading search must fit inside that window; re-adding `show` afterwards does not work.
- **Hints**: hide `#hint` before shooting. The autopilot dashes until it overheats, and the 能量过热 hint otherwise ends up in every frame.
- **Hangar shots**: reload the page first, so the hangar does not show the last mission's world (the boss hovering behind the mech). Tabs sit at x = 0.42W + (i + 0.5)·(W − 0.35u − 0.42W)/7, y = 0.775u. The paint swatches are on the 机体 tab.
- **Boss close-ups**: the autopilot holds the tyrant about 50 m off, too small to read, and 幻影 up close is mostly beam glow. So the mech is moved 15 m in front of the tyrant along the camera's forward direction (a spot a player can fly to), then 40 frames run normally. Armor is not touched.
- **Revive**: a real death: 头目连战 on 王牌 with the autopilot, `sim(2)` until armor is under 30%, then `step(1)` until the state becomes `revive` (about 30 s of game time).
- **系统1** uses its own title frame (6/35 暴雨) instead of the 1_场景 one.
- **Splash**: shot about 1 s after reload, while `SPL.min` (3 s) still holds it on screen.

## Testing without WeChat DevTools

`sim/index.html` runs the unchanged `minigame/game.js` inside a Web Worker (no DOM, no `window`, no `document`), with a fake `wx` over `OffscreenCanvas`; real touches and the mouse (as one touch) are forwarded. Launch config `mech-wechat-sim` (port 8214) → `http://localhost:8214/sim/index.html`. Test hooks: `await __sim(code)` evaluates code in the worker; inside it `shot(name)` posts a frame (HUD included) to `shot_server.py` on 8212, `tap(ev, [[x, y], ...])` fires wx touch callbacks, and `cbs` holds the raw callbacks.

The fake `wx` also has `getLaunchOptionsSync` (the sim page's `?m=<mission>` becomes the launch query), `showShareMenu` / `onShareAppMessage` / `shareAppMessage` (cards are logged in `self.shares`, the menu callback is `self.shareCb`), and `createRewardedVideoAd`, which closes 0.3 s after `show()` with `isEnded = self.adEnds` and counts shows in `self.adShows`.

Verified there (844 x 390 landscape): boots to the title from the subpackage GLB, Sortie by tap, stick moves the mech, right-side drag turns the camera, fire button fires, `drill` completed on autopilot to the result screen, pause / resume / back to title, and all 24 missions start and run 6 s without errors. Added with the review / ads / share pass (2026-11-19): `?m=icelake` opens straight into 冰湖; the first death shows the revive panel and restores 600/1200 AP, and a second death in the same run goes to the result screen. A `drill` win (3880 kill pay + 2400 mission pay) doubles 6580 → 12860 credits, and a second tap adds nothing. The share button sends `m=icelake`, and 再来一次 restarts the same mission with the revive available again. With a fake ad unit, skipping the video gives no revive and watching it does. The worker has no Web Audio, so audio is untested.

## Not verified yet (needs WeChat DevTools / a real phone)

1. **WebGL 2.** three.js r184 is WebGL2-only. Newer WeChat base libraries expose `webgl2` on mini-game canvases, but older ones / some devices do not; if `getContext('webgl2')` fails the game cannot start. Check the base library version in DevTools and on low-end Android.
2. **Subpackage with only a GLB.** The `assets` subpackage carries just a stub `game.js` and the model; confirm DevTools packs it and `readFileSync('assets/kit.glb')` returns an ArrayBuffer after `loadSubpackage`.
3. **Performance.** The composer uses HalfFloat targets with 4x MSAA plus Bloom; on phones expect to drop MSAA / Bloom, shadows and particle counts (fog, rain, snow, smoke). Desktop sim: 70 s of simulation in 1.4 s, which says nothing about a phone GPU.
4. **Audio** via `wx.createWebAudioContext` (unsupported nodes are faked, so some effects may be dry).
5. **Fonts**: the HUD asks for PingFang / Microsoft YaHei and falls back to the system font.

## Publishing (only the account owner can do these)

Register a mini-game AppID and put it in `project.config.json`; upload from DevTools and pass review. For an ads-only game, see the experience notes above: no 版号 / 软著 were needed there, but in-app purchase does need a 版号. The `review/` screenshots (2026-11-19) come from the sim, so they have no WeChat capsule; if review asks for it, retake the same list in DevTools or on a phone.
