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
| LMB / RMB with the blade | With a lock: lunge up to 38 m and slash. The blade cuts through Bulwark shields |
| R | Reload |
| Esc | Pause |
| Gamepad (standard mapping) | LS move · RS look (light aim assist toward the primary lock) · RT / LT arm weapons · RB shoulder · A jump / hover · B, LB or LS click boost (tap = quick boost) · X reload · Start pause. On the title screen A sorties and Y opens the hangar; in pause / results A resumes or retries, B goes to the hangar. Moving the mouse switches back to mouse control |

If the browser refuses pointer lock (for example inside the Artifact iframe), the game falls back to free-mouse mode: the reticle follows the cursor and the camera turns when the cursor is near the screen edge.

## v2 content (2026-11-16)

- **Missions** (`MISSIONS` in `main.js`): Proving Ground (day, boss Tyrant) / Night Raid (night, seed 11, Bulwark + Gunship, boss Phantom) / Endless (dusk, `endlessWave(i)` spends a growing budget on a random mix, boss every 5 waves, enemy HP +5% per wave). Lighting presets in `ENVS`, switched by `applyEnv`; `ensureArena` rebuilds the arena per mission seed
- **New enemies** (`combat.js`): `Bulwark` shielded tank (frontal arc blocks hits: dot > 0.32 between the hit direction and the turret's forward; 560 shield HP, regenerates; down for 7 s when broken; mortar lobs with a ground warning `fx.warn`); `Gunship` (orbits at 22–30 m, chin-gun bursts, 4 slow homing missiles at turn rate 1.55; the HUD shows MISSILE ×N)
- **Blade** `blade`: arm weapon. With a lock it lunges at 120 m/s (`Mech.lungeT` holds velocity and skips gravity), then hits everything within 7.5 m; `G.pierce` bypasses shields; hit-stop `G.hitStop`
- **Bosses** `BOSSES`: tyrant / phantom (light frame, rail + blade + missile → gatling + blade + laser). Enemy blades wind up for 0.45 s with a red flash and ring
- **Credits / upgrades**: kill rewards `KILL_CR` × difficulty, mission reward × rank. Hangar upgrades armor / generator / thrusters / FCS, 5 levels each (600–4200 C). Save data `ironvanguard.save.v1` (credits, upgrades, best per mission and difficulty)

## v3 content (2026-11-16)

- **Snowfield Strike** (`MISSIONS.snow`, env `snow`, seed 21): wave 1 is an objective. Destroy 3 relay towers at the fixed `relaySites` in `world.js`, which the building scatter keeps clear. Wave 2 is a counter-attack. The final wave starts with Tyrant; Phantom drops in after 45 s or once Tyrant is below 50% HP (`run.boss2`). Their HP bars are combined, and the wave before the final repairs 50% instead of 25%
- **Relay tower** `Relay` (`combat.js`, kit `E_Relay`, 2500 HP): calls 2 drones every 20–26 s (`G.onRelayCall`, capped at 7 live drones). It fires an EMP when the player stays within 15 m: a 1.1 s ground warning, then 22 damage and −30 EN. Only the base and the upper mast are solids. **The core hit sphere must not sit inside a solid**, otherwise shots stop on the box and the tower can't be damaged (that was the first version)
- HUD: relays get yellow diamonds on the radar, a yellow off-screen arrow and an on-screen `◆ 中继塔 120m` label; the wave line reads `中继塔 N · 敌机 M`
- Snow look: `buildArena(scene, seed, env)` now takes the env key; the snow floor covers the tiles, roofs are white, and walls get frost ledges. `snowFx` is 3200 flakes in a 70 m box that follows the camera and wraps around it
- **Gamepad**: `pollPad()` runs once per rendered frame (menu buttons, edge detection); `step()` folds the stick and button state into the same intent as the keyboard. Test hook: override `navigator.getGamepads`, then call `__iv.pollPad()` + `__iv.step(1)` per frame, because rAF doesn't run in a hidden pane

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
- Night Raid: the autopilot won 2 of 3 loadouts (130–150 s); its top damage sources are gunship missiles / chin gun and the boss blade. Endless: the autopilot reaches wave 10, where the second boss (Phantom) kills it
- Snowfield: rifle / gatling / missile wins in 155 s; blade / rifle / cannon (light frame) loses at 144 s with Phantom on 505 HP. With both bosses arriving at once, both loadouts died; staggering Phantom's arrival is what makes it winnable
