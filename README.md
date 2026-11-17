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
| LMB / RMB with the pile bunker | With a lock: dash up to 26 m and drive the spike into one target (pierces shields, knocks back) |
| LMB / RMB with the flamethrower | Hold to spray (≈ 19 m reach); burning enemies take damage over time and deal 25 % less |
| R | Reload |
| V | Overdrive (when the OD bar is full) |
| Esc | Pause |
| Gamepad (standard mapping) | LS move · RS look (light aim assist toward the primary lock) · RT / LT arm weapons · RB shoulder · A jump / hover · B, LB or LS click boost (tap = quick boost) · X reload · Y overdrive · Start pause. On the title screen A sorties, Y opens the hangar and X opens the medals (B / A back); in pause / results A resumes or retries, B goes to the hangar. Moving the mouse switches back to mouse control |
| Touch | Shown after the first touch. Drag on the left to move (the stick appears where the finger lands), drag anywhere else to look (aim assist toward the primary lock is 1.4× the gamepad's), buttons bottom-right: right arm / left arm / shoulder / jump-hover / boost (tap = quick boost) / reload / overdrive; ‖ at the top pauses. The HUD moves to the top corners in touch mode |

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

## v4 content (2026-11-16)

- **Reactor Defense** (`MISSIONS.defense`, dusk, seed 31): protect the `F_Reactor` core at the centre plaza (7000 HP, `Reactor` in `ally.js`, model scaled ×1.5). The mission fails if it falls. 5 waves; each wave comes from one side and a second group (`late`) arrives from the opposite side after 20 s or once ≤ 2 enemies are left (`spawnGroup` + `spot(..., bearing)`, which now spawns around the core). Between waves the core repairs 15%. The rank is based on the core's remaining HP
- **Targeting** (`pickTarget` in `combat.js`): every enemy re-picks its target every 1–1.5 s from `G.player` + `G.friends`, scored by distance × weight (player 1, wingman 0.95, core 0.5 for ground units / 0.85 for flyers). Anything put in `G.friends` needs `pos / vel / center() / alive / _ent`. Enemy missile warnings only fire when the player is the target
- **Wingman** (`Wingman` in `ally.js`): a one-off 2500 C contract in the hangar, then on/off per sortie (`cfg.wing`). Rifle + arc coil + missiles at 0.5× damage, 0.8× HP, takes 0.75× damage; stays 13 m beside the player and fights what is near the player (and the core). When destroyed it is air-dropped again 30 s later. With a wingman, kill and mission rewards are ×0.85. Its shots are labelled `ally-*` and don't count toward the player's accuracy / damage stats
- **Ground AI fixes**: walkers and Bulwarks with no line of sight for 4 s close in instead of idling at their preferred range; on bumping into a building they slide along it for 2.5 s (`blockedSlide`), and reverse direction next time if a slide made less than 4 m of progress. The first version left a walker stuck behind a building for a minute and the wave could never be cleared
- **Touch controls** (see Controls) and a 5-column mission grid on a wider title card

## v5 content (2026-11-16)

- **Storm Hunt** (`MISSIONS.storm`, env `storm`, seed 41): night rain, about 2400 `LineSegments` streaks in a 60 m box that follows the camera; lightning every 7–16 s flashes the hemisphere light and sky (sometimes a double flash) and the thunder (`sfx('thunder')`) arrives after the sound-travel delay. The floor is darker, a little metallic, with wet patches. Waves: raiders + drones + turrets → raiders + lancer + walkers → raiders + lancer + gunship (+ late lancer) → Phantom
- **Enemy squad mechs** (`RAIDERS` in `combat.js`): the `Boss` brain with one phase and no boss bar (`kind = 'raider'`). Raider: standard frame, rifle / shotgun / missile, 900 HP. Lancer: light frame, agile, blade / gatling / cannon, 700 HP. Their shots are labelled `raider-*` / `lancer-*` in `G.dmgLog`. They also show up in Endless from round 6
- **SG-12 Scattergun** (arm): 9 pellets per shot, short range (pellet life 0.42 s), 6 shells per load
- **AS-3 Aegis Shield** (shoulder): 3 s, −85% damage from hits within the frontal arc (`shieldBlock`, measured against the aim direction), 9 s cooldown; a curved additive panel in front of the torso flashes on each blocked hit. The weapon panel reads ACTIVE while it is up
- Enemy-only palettes carry `enemy: true` and are hidden from the hangar

## v6 content (2026-11-16)

- **Overdrive** (`OD` in `combat.js`, `activateOD` / `updateOD` in `main.js`): damage you deal fills the OD bar (2600 damage; allies' damage and hits on the core don't count). V / gamepad Y / the touch 超载 button fires it: a 16 m shockwave (160 damage), a short slow-motion, then 10 s of damage ×1.4, damage taken ×0.65, endless energy, faster reloads and shoulder cooldown. Orange screen-edge glow and a pulsing ring at the feet while it runs. The autopilot uses it when 3+ enemies are within 60 m or a boss is within 80 m
- **Convoy Escort** (`MISSIONS.convoy`, env `desert`, seed 51): escort the `F_Truck` transport (`Convoy` in `ally.js`, 4200 HP) along a road (`path`, smoothed with Chaikin; `buildArena(..., road)` keeps buildings and props 11 m clear of it and lays asphalt + a dashed centre line). The truck stops at each `stops` distance and a wave spawns ahead of it (late groups come from behind); once the wave is clear it drives on (7 m/s), waiting if you are more than 60 m away, with a pair of drones harassing it on the road. Reaching the end of the road after the final wave wins; losing the truck fails. The convoy reuses the `G.core` slot, so targeting, the HUD bar, the off-screen arrow, the radar and the core-based rank all work unchanged (`label` names it)
- Mission cards on the title now show only name / English / best; the selected mission's description is under the grid (7 missions fit at 720 p)

## v7 content (2026-11-16)

- **Colossus** (`Colossus` in `combat.js`, kit `E_Colossus`, scale 1.4): a ~28 m quadruped siege walker with three separately targetable parts. `entsFor('P')` now pushes a boss's alive `parts` instead of the boss itself, so shots, missiles and the blade lock onto parts. Missile pod `E_CPodL` (10 homing missiles every 7–9 s) and cannon pod `E_CPodR` (6 lobbed shells with ground markers) each have 3800 × HP; the belly core `E_CCore` (7600 × HP) takes only 12% damage while either pod stands. Destroying both pods opens phase 2 (faster walk, plasma volleys). Always active: a chin gun (6-round burst every 3.4 s within 90 m) and a stomp — anything on the ground within 22 m after a 1.3 s red ring takes up to 70 damage (jump / hover to avoid it). Tank-like steering (0.4 rad/s), keeps 30–60 m from its target
- **Ash · Colossus** (`MISSIONS.ash`, env `ash`, seed 61, reward 5200): three waves, the last one the Colossus plus drones; grey ash fall reuses the snow particle system (`userData.k` slows it)
- **Endless**: every 10th wave is a Colossus (HP 0.7 + 0.1 per further appearance); other boss waves alternate Tyrant / Phantom
- **Challenge modifiers** (`MODS` in `main.js`, chips under the mission grid, saved in `cfg.mods`): glass frame (AP × 0.6, +30%), elite enemies (enemy HP × 1.3, +30%), no supplies (no repair drops, no between-wave repair, +25%). The bonuses add up and multiply kill + mission credits; the result screen shows `挑战 ×N`
- 8 mission cards on the title at 720 p (grid `repeat(8, …)`, card max-width 1140 px)

## v8 content (2026-11-17)

- **DP-4 Drone Pod** (shoulder, `WEAPONS.drones`, kit `S_Drones` with a docked `D_Dock` drone, flying drone `D_Mini`): launches 2 attack drones for 14 s (cooldown 18 s). They orbit 4.6 m around their owner at shoulder height and fire at the closest visible enemy within 80 m (6 damage every 0.17 s each; cloaked enemies are ignored). Drones live in `G.minis` (`spawnMini` / `updateMinis` / `clearMinis` in `combat.js`), take the owner's paint scheme, and the HUD shows `ACTIVE n` while they are out. Player drone shots are labelled `drone-pod` and count toward your stats and the OD meter
- **Stalker** (`Stalker` in `combat.js`, kit `E_Stalker`, 520 HP): a cloaked sniper. It walks invisibly (alpha 0.05 with a faint shimmer) to a spot 65–105 m from its target, decloaks to 55%, and paints the target with a red laser for 1.65 s. The laser tracks where the target will be at the moment of the shot, then freezes and flashes for the last 0.3 s before a hitscan rail shot (70 damage), so moving in a straight line gets you hit and changing direction or quick-boosting dodges it. ~90 damage while it aims interrupts the shot; any hit reveals it for 2.5 s. After firing it stays visible for 1.4 s, then cloaks and moves at least 25 m. Cloaked units (`e.cloaked`) can't be locked, don't show on the radar and are skipped by the autopilot (and by your drones), but bullets still hit them. First lock-on per sortie shows a hint. Appears in Night Raid wave 3, Storm Hunt wave 2, endless from wave 5 and in daily mixes
- **Daily challenge** (`MISSIONS.daily = dailyMission()` in `main.js`): one mission per local date, seeded by an FNV hash of the date (`mulberry32`): random environment, arena seed, three waves from `mixWave(n, rnd)` (the endless mix generator, now shared), a final boss (Tyrant / Phantom / Colossus), and 1–2 forced challenge modifiers (`forceMods`; their chips show dashed and locked). Best times are kept per date (`bestKey: 'daily@YYYY-MM-DD'`)
- 9 mission cards on the title at 720 p (grid `repeat(9, …)`, no overflow)

## v9 content (2026-11-17)

- **Industrial Zone · Uplink Control** (`MISSIONS.uplink`, `capture: true`): three capture zones A / B / C (`zones` in the mission, also passed to `buildArena` so no building lands on them). Stand inside a zone (radius 13 m) with no enemy ground unit in it to capture (6 s from neutral, 12 s from enemy-held); enemy ground units in a zone you're not in push it back. Each zone you hold adds 0.45 %/s to the uplink; if the enemy holds two or more, it drains. Counterattack waves start at 30 % and 65 % uplink and march on the zone you hold farthest from you, a small squad heads for a zone every ~20 s, and at 100 % the Tyrant arrives (kill it to win). Code: `makeZones` / `captureLogic` / `attackZone` in `main.js`; zone attackers carry `goalP` / `goalR` and `goalDir()` in `combat.js` steers walkers, bulwarks and raiders there first. The core HUD bar shows the uplink, the wave line shows `A◆ B✕ C○`, zones get screen markers and radar rings
- **Mender** (`Mender` in `combat.js`, kit `E_Mender`, 170 HP): repair drone that hangs behind the most damaged enemy (as seen from you) and beams repairs into it (12 + 3 % max HP per second, up to 60/s; it also refills bulwark shields). Backs away when you come within 30 m. First beam shows a hint. Appears in Uplink, Reactor Defense wave 4, Convoy wave 4, endless / daily mixes from wave 4
- **GL-4 Grenade Launcher** (arm, `WEAPONS.grenade`, kit `W_Grenade`): lobbed grenades on a low-angle ballistic arc that lands on the aim point (speed 88, gravity 30), 78 damage with 6.5 m splash, 8 rounds. Good against groups, menders hiding behind allies and turrets behind cover; weak against fast drones
- 10 mission cards on the title at 720 p (grid `repeat(5, …)`, two rows)

## v10 content (2026-11-17)

- **Dead City · Extraction** (`MISSIONS.extract`, `extract: true`, env `dawn`, seed 81, reward 5000): three data caches A / B / C (`F_Cache` terminal + a radius-8 ring, `makeZones(list, { R: 8, kind: 'cache' })`). Stand within 8 m to download (12 s; progress pauses when you leave, it doesn't reset). Starting a download trips the alarm: the next AMBUSH wave converges on that cache (`run.spotC`), and from then on a crawler pack hunts you every ~23 s. With all three done, the evac zone (radius 14, `kind: 'evac'`, appended with `append: true`) opens at `M.evac`. You get a 40 % repair and full ammo, and the Phantom (0.5 × HP, `lateBoss`) arrives 8 s later. Hold the zone for 30 s to win; progress runs at half speed while an enemy ground unit is inside, and crawler packs hit the zone every ~11 s. Code: `extractLogic` in `main.js`. Zones now carry `R` and `kind` (`zone` / `cache` / `evac`) and every HUD / radar / autopilot path uses `z.R`; the cache model is kept in `zoneKits` (shared kit geometry, removed but never disposed) and gets a small solid via `addSolid`
- **Crawler** (`Crawler` in `combat.js`, kit `E_Crawler`, 75 HP): suicide spider bomb that comes in packs of up to 6 (`spawnGroup` `crawler: n`). Runs at its target at 12–15 m/s with a weave, flashes red and leaps from ~9 m (0.5 s ballistic arc onto the target's predicted position), then detonates on contact or when the 0.85 s fuse runs out (6 m, 42 damage). Shot down, it pops with a smaller blast that hurts other enemies (5.5 m, 45, queued 0.07 s later so packs chain-react). Also in endless / daily mixes from wave 3
- **PB-9 Pile Bunker** (arm, `WEAPONS.pile`, kit `W_Pile` with a `P_Spike` node that fires 1.3 m forward): with a lock it dashes up to 26 m, then one piercing punch (430 damage to a single target, shields ignored) plus a 5 m shockwave (16 %), knockback, a 0.13 s hit-stop and heavy screen shake. 20 EN, 1.3 s cycle
- **Dawn** lighting preset (`ENVS.dawn`, pink-orange sky, low sun); daily challenges can roll it too
- Title: 11 mission cards in a `repeat(6, …)` grid. Best times moved off the cards (a ✓ marks cleared missions) into the description line under the grid, because cards with a best line were 20 px taller and pushed the title past 720 p

## v11 content (2026-11-17)

- **Medals** (`MEDALS` in `main.js`, 18 entries; title button "勋章 n/18" opens the `#medals` overlay, 3-column grid, pad B / A goes back). Each medal pays credits once (300 – 3000 C). Most are checked in `finish()` from the run result (first win, all 9 story missions, ace difficulty, S rank, ≥ 90 % AP, glass modifier, all three modifiers, both arms melee, no wingman in defense / convoy, 5 overdrives in one run, a daily win, endless wave 10 / 20). Four count across runs from `save.tally`, which `G.onKill` fills by enemy kind: Colossus kills, bosses, crawlers, total kills. "满改机体" is also checked on every hangar purchase. New medals appear as amber rows on the result screen with a chime; tally medals show a progress bar on the medals screen. The save gains `medals` and `tally` (old saves load fine and start empty)
- **Sapper** (`Sapper` in `combat.js`, kit `E_Sapper` with twin rotors, 300 HP, `KILL_CR` 160): a mine-laying drone that circles its target at 15 ± 9 m, ~11 m up, and drops a **Mine** (kit `E_Mine`, blinking `E_MineLight`) every 2.2–3 s when within 32 m, at most 6 live per sapper. Mines arm 1.2 s after landing; a player, wingman or convoy truck within 4.5 m starts a 0.5 s beep, then 6.5 m / 55 damage. Shoot a mine (24 HP, lockable, orange dot on the radar) to blow it early (6 m / 40, hurts everyone nearby, you included). Mines live in `G.mines`, not `G.enemies`, so waves don't wait for them; they expire after 45 s and `clearMines()` clears them between missions. Appears in harbor wave 2, convoy wave 2, defense wave 3 and in endless / daily mixes from wave 4
- **FT-2 Flamethrower** (arm, `WEAPONS.flamer`, kit `W_Flamer`): 25 puffs / s at 8 damage, 120-round tank, 2 s refill. Puffs slow down and rise (drag 1.3 / s), so the reach is about 19 m, and the hit radius grows with age (`0.4 + age × 2.5`), so it sweeps crowds. Every hit ignites the target (`ignite` / `updateBurning`, 22 damage over 2.5 s, refreshed by further hits, pierces shields). **Burning enemies deal 25 % less damage**: `updateCombat` sets `G.curShooter` around each `e.update`, and both `spawnShot` (enemy shots) and `damagePlayer` (melee / beams) check its `burnT`
- Autopilot with a flamer rushes ground targets to 13 m and fires inside 20 m, uses the rifle on fliers, and boosts in on bosses / raiders

## v12 content (2026-11-17)

- **Gauntlet** (`MISSIONS.gauntlet`, seed 91, new `eclipse` lighting: dark violet sky, red-pink horizon): four boss rounds in a row: Tyrant → Phantom + jammer → Colossus (80 % HP) → Tyrant and Phantom together (55 % HP each, the Phantom drops in at half Tyrant HP or after 45 s, plus a jammer). Between rounds (`run.gauntlet`): 50 % armor repair, +35 % overdrive charge, 6 s break, banner "ROUND CLEAR". Not part of the 9 story missions. Reward 6000 C. The title grid is now 2 × 6
- **Jammer** (`Jammer` in `combat.js`, kit `E_Jammer` at 1.3× scale: octagonal hover hull, spinning dish `E_JDish`, pulsing core `E_JCore`; 380 HP, unarmed, `KILL_CR` 180): hovers ~7 m up and orbits ~34 m from the player, backing off inside 20 m, with a purple field ring every 1.3 s. While a live, un-stunned jammer is within `JAM_R` = 50 m of the player, `G.jammed` is set: `updateAim` empties the lock list (no lock-on, missiles fly unguided), the radar hides every dot except bosses and draws purple static with "ECM", and the HUD shows a blinking "ECM 干扰 · 锁定失效" badge. Jammers are purple circles on the radar when not jamming. In Gauntlet rounds 2 and 4, Storm Hunt wave 3, Uplink's second counterattack, and endless / daily mixes from wave 5. Autopilot targets the jammer first while jammed
- **EP-5 EMP** (shoulder, `WEAPONS.emp`, kit `S_Emp`, `empPulse()`): 11 s cooldown. Hits everything within 26 m of you for 85 damage (one-shots drones on normal) and **stuns** it for 2.5 s (bosses and raiders 0.8 s, relays immune; a hit on a Colossus part stuns the whole Colossus). Stunned enemies skip `update` entirely (they freeze in place, crackling blue) and **take +30 % damage** (`STUN_VULN` in `dealDamage`). The pulse also deletes enemy projectiles within 30 m and fizzles mines without exploding them. A stunned jammer stops jamming. Autopilot only fires it when an enemy is within 22 m or an enemy missile / shell is within 20 m
- Medals: 20 now. "连战制霸" (win Gauntlet, 2500 C) and "电子战" (10 jammers total, `save.tally.jammer`, 800 C)

## v14 content (2026-11-18)

- **Bombardment** (`MISSIONS.canyon`, seed 111, new `haze` lighting: dusty red-orange): four waves built around self-propelled guns; the final wave is the Tyrant under the cover of three howitzers. Reward 4600 C. 14 mission cards (still two rows of 7)
- **Howitzer** (`Howitzer` in `combat.js`, kit `E_Howitzer`: tracked hull, `E_HTurret` yaw, `E_HBarrel` pitch, `Muzzle_Howitzer`; 650 HP, `KILL_CR` 220). Spawns 115–150 m out and holds 60–125 m from its target (backs off when something closes in, drives in when out of reach). Indirect fire, no line of sight needed: every 7–9 s it raises the barrel for 1.1 s, then fires a 5-shell creeping barrage along the target's path (from 7 m behind to ~30 m ahead, spacing grows with speed), each shell 40 dmg / 8 m splash, flight time 1.4 s + 1 s per 80 m, landing spot marked with a red circle. Spread depends on spotting (`spotted()`): its own line of sight 3 m, another enemy that sees the same target 4 m, nobody 9 m. First salvo shows a hint. Radar: orange square. Also in endless / daily mixes from wave 5. Autopilot gives it −25 m of target priority
- **HD-1 Holo Decoy** (shoulder, `WEAPONS.decoy`, kit `S_Decoy`): projects a hologram of the mech (the `Mech` kit with an additive cyan material + wireframe) 9 m ahead for 6 s, 380 HP, cooldown 20 s. It joins `G.friends` with `foeW 0.55` (enemies weigh its distance at about half the player's), and nearby enemies re-pick targets at once. `foeWBoss 0.95`: bosses, raiders and the Colossus barely fall for it (`pickTarget` checks `foeWBoss` first). Shattered before it expires, it releases a shock: 70 dmg within 11 m and a 1.2 s stun (0.4 s on bosses). `G.decoyDmg` counts what it soaked
- Medal "反炮兵": destroy 12 howitzers (1000 C). 22 medals; the medal grid got tighter padding so it still fits 720p

## v13 content (2026-11-17)

- **Airborne** (`MISSIONS.airborne`, seed 101, new `overcast` lighting): four waves where most enemies arrive by dropship; the final wave brings the Tyrant in a heavy dropship plus one escort. Reward 4800 C. The title grid is now 7 columns (13 cards, 2 rows)
- **Dropship** (`Dropship` in `combat.js`, kit `E_Dropship`: twin ducted fans `E_DFanL/R`, cargo pod `E_DPod`; 1500 HP at 1.55× scale, heavy version 3200 HP at 1.9× in rust colours; `KILL_CR` 350). Spawned by `spawnGroup` from `S.drops` (a list of cargo objects such as `{ walker: 2 }`, `{ bulwark: 1, drone: 2 }`, `{ raider: 1 }`), `S.dropship` (count, cargo `{ walker: 2 }`) and `S.dropBoss` (heavy dropship carrying a boss). `dropEntry()` starts them outside the arena, 45 m apart, so they arrive staggered. States: `in` (cruise at ~40 m, picks a landing zone 26–42 m from its target on open ground once inside the arena) → `down` (red ground marker, descends to 13 m) → `drop` (hovers 2.6 s with dust, door gun 7 damage / 0.5 s) → releases the cargo through `G.onDrop(pos, cargo, ds, crashed)` and hides the pod → `out` (climbs away, takes half damage, removed at the edge with no kill). Shot down with cargo aboard, the cargo is lost (`save.tally.dropFull`), except a boss, which walks out of the wreck at 70 % HP. Radar: yellow triangle (grey once empty); on-screen tag "▼ 运输机 投放 2.1s · 64%". Also in endless / daily mixes from wave 6. Autopilot shoots loaded dropships first, hardest once they start descending
- **Chips** (`CHIPS` in `main.js`, hangar section "芯片 CHIPS"): one slot, a second for 3000 C (`save.chip2`); `cfg.chips` holds the picks, extras beyond the slot count are ignored. 纳米自修复 (0.6 % AP/s after 5 s without damage, `G.hurtAt`), 扩容弹匣 (arm mags +40 %, reload −20 %), 冷却回路 (shoulder cooldown −25 %), 推进增压 (boost +10 %, EN regen +25 %, via `playerMods`), 超载电容 (overdrive charge +40 % via `G.odGain`, duration 13 s via `G.od.dur`), 吸能装甲 (+2.5 % AP per kill). Weapon chips go through `playerWeapon()`, which gives each player weapon state a private copy of its `WEAPONS` entry so the shared table is never mutated
- Medal "防空专家": shoot down 10 loaded dropships (1000 C). 21 medals

## Structure

- `site/kit.js` — loads the GLB (uses `window.__MA_KIT` first), `cloneKit`, `recolor` (palettes are applied by material name), `bakeStatic` (static props merged per material)
- `site/mech.js` — palettes `PALETTES`, frames `FRAMES` (light / std / heavy), and the `Mech` class (procedural walk/flight animation, thruster flames, physics, energy)
- `site/combat.js` — `WEAPONS` (rifle / gatling / coil / rail / missile / cannon / laser), `weaponTick` (shared by the player and the boss), projectiles, enemies (turret / drone / walker / boss), `G.dmgLog` damage-by-source log
- `site/world.js` — 170 m arena, 30 random buildings, AABB collision, `groundAt` (0.7 m step-up), `raySolids`, explosive barrels
- `site/fx.js` — additive particles / smoke / streaks / rings / scorch decals / 5-light pool / screen shake
- `site/audio.js` — WebAudio synthesis (weapons, explosions, thrusters, adaptive drums)
- `site/ally.js` — `Wingman` (AI ally mech) and `Reactor` (defense objective); both register in `G.friends`
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
- Reactor Defense (autopilot, no wingman): rifle / gatling / missile wins with the core at 28%; blade / rifle / cannon (light frame) wins with it at ~50%. With the wingman it is clearly easier (the core lost < 15% over the run that was checked). Walker shells are the largest source of core damage (> 50%)
- v14 (autopilot, no wingman, normal): Bombardment with rifle / gatling / missile won 2:48 (726 AP), with rifle / gatling / decoy won 3:26 (972 AP, the decoy soaked 1101 damage over 11 casts). The first decoy (8 s, 520 HP, cooldown 15 s, `foeW` 0.45, bosses fooled too) took 1907 damage while the player took only ~330, so it was cut back. The first howitzer (4 shells across the target's motion, flight time 2.4 s + 1 s per 55 m) landed 0 of 44 shells on the moving autopilot. The creeping barrage along the path with faster shells still mostly misses the autopilot (~170 damage per run) but a stationary mech takes ~250 from 14 shells: it is there to punish standing still
- v13 (autopilot, no wingman, normal): Airborne with rifle / gatling / missile won 2:53 (694 AP), with 9 of the dropships shot down loaded; grenade / rifle / laser + nano chip won 3:24. The first version (two escort dropships in the final wave, door gun 9) lost in the final wave after the Tyrant was already dead: dropped walkers did 470 and door guns 258 of the damage. Nano at 1 % / s after 4 s healed 667 → 1192 during the final wave's lulls, so it went to 0.6 % / s after 5 s
- v12 (autopilot, no wingman, normal): Gauntlet with rifle / gatling / missile won 3:20 (777 AP); blade / rifle / EMP won 2:05 (676 AP); rifle / gatling / EMP won 3:40 (802 AP). Before the final round dropped from 62 % to 55 % boss HP and the EMP gained the +30 % stun vulnerability (70 → 85 damage), rifle / gatling / EMP lost twice in the final round (Tyrant at 196–245 HP). Drones were the largest damage source across the four rounds (~1000 of the damage taken). Proving Ground with blade / rifle / EMP won 1:58 (1079 AP). Ranged loadouts rarely trigger the EMP (the autopilot keeps 22–45 m), melee loadouts use it 4–9 times a run
- v11 (autopilot, no wingman, normal): Harbor with rifle / gatling / missile (now with a sapper in wave 2) won 2:39 (570 AP). Proving Ground with flamer / rifle / missile won 2:12 (387 AP); rifle / gatling won 2:08 (669 AP). Harbor with flamer / rifle lost to the Phantom: closing to flame range puts you in its blade range (933 AP gone in 20 s), which is the intended counter. The first flamer (5 damage, 44 m/s with drag 1.7 = only ~13 m real reach, autopilot walking at hovering bosses) did 442 damage to the Tyrant in 24 s versus 4861 for twin rifles and lost every run; after the range / damage / debuff changes and the boss-chasing boost it does 3215. Mines rarely hurt the autopilot because it shoots them on sight; a player standing next to an armed mine takes ~36 on normal
- v10 (autopilot, no wingman, normal): Extraction with rifle / gatling / missile won 2:37 (938 / 1200 AP) and 2:18 (306 AP); pile / rifle / missile won 2:40 (944 AP). Proving Ground with pile / rifle / missile 2:01. Earlier versions lost 4 of 6 runs in the evac hold: the Phantom arriving with the evac (its blade did 500–640 damage to an autopilot holding still), and leftover gunships from ambush 2. Six crawlers reaching a player who stands still do ~170 damage; the perfect-aim autopilot rarely lets them close
- v9 (autopilot, no wingman, normal): Uplink Control with rifle / gatling / missile 4:14, 494 / 1200 AP left, rank B (the first version took 2:23: one walker + one turret per zone and a 30 s trickle were cleared before the first counterattack); Proving Ground with grenade / rifle / missile 2:41 (rifle / gatling ~2:00)
- v8 (autopilot, no wingman, rifle / gatling + shoulder): Proving Ground with the drone pod 1:59 (missile pods 2:05); Night Raid 137 s with 765 / 1200 AP; daily challenge of 2026-11-17 (desert, forced glass frame) 140 s with 602 / 720 AP. The Stalker landed 3 of 7 shots on the moving autopilot; with the first version (aim locked on the current position, 0.45 s freeze) it hit nothing at all
- Ash · Colossus (autopilot, no wingman): rifle / gatling / missile wins in 153 s with 362 / 1200 AP left; blade / rifle / cannon (light frame) wins in 95 s with 602 AP (the blade melts the exposed core). Largest damage sources: chin gun and phase-2 plasma. First version (10-round gun every 2.2 s, plasma 30) killed the rifle loadout at 128 s with the chin gun at 749 damage on its own; the autopilot outruns the homing missiles, a standing player takes ~50 per salvo
- Convoy Escort (autopilot, no wingman): rifle / gatling / missile wins in 360 s with the truck down to 977 / 4200 at its lowest; blade / rifle / cannon (light frame) wins in 337 s with the truck at 3442. Bulwark mortars are the largest source of truck damage (~40%), then gunships. First version (6000 HP truck, lighter waves) ended with the truck untouched
- Storm Hunt (autopilot, no wingman): rifle / gatling / missile wins in 167 s with 273 HP left; shotgun / rifle / shield wins in 178 s with 135 HP (the shield blocked ~780 damage). First version (raider damage ×0.3, 1100 HP, Phantom with two escorts) died at 42 s
- Snowfield: rifle / gatling / missile wins in 155 s; blade / rifle / cannon (light frame) loses at 144 s with Phantom on 505 HP. With both bosses arriving at once, both loadouts died; staggering Phantom's arrival is what makes it winnable
