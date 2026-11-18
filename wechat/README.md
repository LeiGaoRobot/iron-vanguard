# Iron Vanguard · WeChat mini-game prototype

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
| `game.js` | adapter + three.js + all game modules + HUD, minified IIFE | 0.93 MB (main package limit 4 MB) |
| `assets/kit.glb` + `assets/game.js` | subpackage `assets`, loaded with `wx.loadSubpackage` before the kit is parsed | 3.37 MB |
| `game.json` | landscape, subpackage list | |
| `project.config.json` | `appid: touristappid` (only written if missing; put your own AppID here) | |

## How it works

- `src/adapter.js` runs before anything else and fakes what the game and three.js touch: `window` / `document` (a tiny element tree that keeps text and classes, so main.js's DOM HUD writes are harmless), canvases backed by `wx.createCanvas` (the first one is the screen), `localStorage` over `wx.*StorageSync`, `AudioContext` over `wx.createWebAudioContext` (with gain-node stand-ins for StereoPanner / DynamicsCompressor if missing), a `TextDecoder` polyfill for GLTFLoader, and `window.__MA_KIT_LOAD` which reads `assets/kit.glb` from the subpackage.
- `src/hud.js` draws the HUD into a 2D canvas (~30 Hz), uploads it as a `CanvasTexture` and composites it over the frame through `G.afterRender` (a hook main.js calls after `composer.render()`). It mirrors main.js's banner / hint / boss name by reading the fake DOM elements, and reads `__iv.G` / `__iv.run` for bars and counters. Touches from `wx.onTouch*` go straight into `__iv.touch` (left 42% = move stick, buttons on the right, anything else = look drag).
- `src/entry.js` imports adapter → `site/main.js` → HUD, and caps the pixel ratio at 1.5.
- Game-side hooks added for this build: `kit.js` accepts `window.__MA_KIT_LOAD`; `main.js` exposes `G.renderer / G.composer / G.bloom` and calls `G.afterRender(dt)`.

## Testing without WeChat DevTools

`sim/index.html` runs the unchanged `minigame/game.js` inside a Web Worker (no DOM, no `window`, no `document`), with a fake `wx` over `OffscreenCanvas`; real touches and the mouse (as one touch) are forwarded. Launch config `mech-wechat-sim` (port 8214) → `http://localhost:8214/sim/index.html`. Test hooks: `await __sim(code)` evaluates code in the worker; inside it `shot(name)` posts a frame (HUD included) to `shot_server.py` on 8212, `tap(ev, [[x, y], ...])` fires wx touch callbacks, and `cbs` holds the raw callbacks.

Verified there (844 x 390 landscape): boots to the title from the subpackage GLB, Sortie by tap, stick moves the mech, right-side drag turns the camera, fire button fires, `drill` completed on autopilot to the result screen, pause / resume / back to title, and all 24 missions start and run 6 s without errors. The worker has no Web Audio, so audio is untested.

## Not verified yet (needs WeChat DevTools / a real phone)

1. **WebGL 2.** three.js r184 is WebGL2-only. Newer WeChat base libraries expose `webgl2` on mini-game canvases, but older ones / some devices do not; if `getContext('webgl2')` fails the game cannot start. Check the base library version in DevTools and on low-end Android.
2. **Subpackage with only a GLB.** The `assets` subpackage carries just a stub `game.js` and the model; confirm DevTools packs it and `readFileSync('assets/kit.glb')` returns an ArrayBuffer after `loadSubpackage`.
3. **Performance.** The composer uses HalfFloat targets with 4x MSAA plus Bloom; on phones expect to drop MSAA / Bloom, shadows and particle counts (fog, rain, snow, smoke). Desktop sim: 70 s of simulation in 1.4 s, which says nothing about a phone GPU.
4. **Audio** via `wx.createWebAudioContext` (unsupported nodes are faked, so some effects may be dry).
5. **Fonts**: the HUD asks for PingFang / Microsoft YaHei and falls back to the system font.

## Publishing (only the account owner can do these)

Register a mini-game AppID and put it in `project.config.json`; upload from DevTools and pass review. Games published in mainland China generally also need a software copyright certificate, and a game licence (版号) once they take payments or ads.
