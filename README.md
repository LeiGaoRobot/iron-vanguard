# 钢铁先锋 Iron Vanguard

An original third-person mech action game, inspired by the gameplay in x.com/BeyondTheBoxCN/status/2121961415699497217. No assets were copied: every model is built with bpy, and everything else (effects, audio, logic) is in three.js r184 with no bundler.

- Play online: https://leigaorobot.github.io/iron-vanguard/ (GitHub Pages, served from `docs/`)
- Artifact: https://claude.ai/artifact/LQpZpncQnSMrgf7ZGLnjzs
- Release process: `python build_dist.py` → `cp dist/index.html docs/` → commit → push → republish the Artifact from the same path (`dist/artifact.html`)

## How to run

| Purpose | Command / URL |
|---|---|
| Build models | `D:/AI/tools/Blender/blender.exe -b -P build_kit.py -- --out D:/AI/mech_arena [--closeups] [--no-render]`, about 20 s, produces `site/assets/kit.glb` + `preview.png` |
| Dev | launch.json `mech-arena` → http://localhost:8211 (`serve.py`, no-store, so module changes are never served from cache) |
| Single-file build | `python build_dist.py` → `dist/index.html` (inline import map, 2.4 MB) + `dist/artifact.html` (body-only, jsDelivr `+esm`, 1.3 MB) |
| Test the single-file build | launch.json `mech-arena-dist` → http://localhost:8213 |
| Screenshot receiver | `python shot_server.py` (8212), writes to `shots/`; `python sheet.py` combines them into a contact sheet |

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Shift | Boost dash (Shift + direction = quick boost, costs 18 EN) |
| Space | Jump; hold in the air to hover |
| LMB / RMB | Right-arm / left-arm weapon |
| E | Shoulder weapon (missiles lock up to 6 targets) |
| R | Reload |
| Esc | Pause |

If the browser refuses pointer lock (for example inside the Artifact iframe), the game falls back to free-mouse mode: the reticle follows the cursor and the camera turns when the cursor is near the screen edge.

## Structure

- `site/kit.js` — loads the GLB (uses `window.__MA_KIT` first), `cloneKit`, `recolor` (palettes are applied by material name), `bakeStatic` (static props merged per material)
- `site/mech.js` — palettes `PALETTES`, frames `FRAMES` (light / std / heavy), and the `Mech` class (procedural walk/flight animation, thruster flames, physics, energy)
- `site/combat.js` — `WEAPONS` (rifle / gatling / coil / rail / missile / cannon / laser), `weaponTick` (shared by the player and the boss), projectiles, enemies (turret / drone / walker / boss), `G.dmgLog` damage-by-source log
- `site/world.js` — 170 m arena, 30 random buildings, AABB collision, `groundAt` (0.7 m step-up), `raySolids`, explosive barrels
- `site/fx.js` — additive particles / smoke / streaks / rings / scorch decals / 5-light pool / screen shake
- `site/audio.js` — WebAudio synthesis (weapons, explosions, thrusters, adaptive drums)
- `site/main.js` — camera, input, aiming and lock-on, waves, HUD, hangar, pause, results, autopilot

## Model contract (`build_kit.py`)

- Kits are `Kit_<Name>` Empties; Z up, front +Y (−Z in three.js), left −X
- Mech pivots: `M_Hips` > `M_ThighL/R` > `M_ShinL/R` > `M_FootL/R`; `M_Torso` > `M_Head` / `M_Pack` (`M_WingL/R`, `T_Back1/2`) / `M_ShoulderL/R` > `M_ArmL/R` > `M_ForeL/R` > `W_HandL/R`; mount points `W_BackL/R`, leg nozzles `T_LegL/R`
- Every weapon has a `Muzzle_*` Empty; gatling barrels `G_Spin`; turret `E_TYaw` > `E_TPitch`; drone `E_Rotor1-4`; walker `E_WBody` / `E_WGun` / `E_Leg1-4` > `E_Knee1-4`
- Recolorable materials: `Armor` / `Armor2` / `Accent`; emissive materials `Visor/NozzleGlow/Coil/Rail/Plasma/Lens/EEye/Repair/Ammo`
- The `Demo` lineup is for preview images only and is not exported to the GLB

## Test hooks `window.__iv`

`start(cfg)`, `step(n)` advances frames manually, `sim(sec)` lets the autopilot play, `wave(i)` jumps to a wave, `capture(name)` posts a screenshot to 8212, `G` (shared state, including `dmgLog`), `cam`, `mouse`, `auto`, `setState`.

## Balance (normal: enemy damage ×0.8)

- W1 5 turrets + 6 drones → W2 3 walkers + 6 drones + 3 turrets → W3 4 walkers + 8 drones + 4 turrets → FINAL boss (5200 HP, heavy frame ×1.35, phase 2 below 50% HP switches to coil + laser and calls 2 drones every 22 s)
- Between waves: 4.5 s, ammo refilled, 25% HP restored
- The autopilot (perfect aim, never uses cover) clears all five loadouts in 110–190 s, with about a 50% win rate
