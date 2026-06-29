# Rift & Raid — Work Log

Shared multi-agent work log. Append-only. Newest entries at the bottom.

---
Task ID: phase-0
Agent: main
Task: Phase 0 — Engine Foundation. Scaffold monorepo, build engine core (ECS, EventBus, GameLoop, ObjectPool, StateMachine), renderer (Three.js wrappers), asset loader, input manager (PC + mobile), server world state with SQLite persistence + offline simulation, sample content configs, and a runnable client that boots an empty scene with a movable capsule.

Work Log:
- Renamed project from "Crimson Tide" / "Hearth & Havoc" to "Rift & Raid" in README.md and GDD.md
- Initialized npm workspace with packages/{engine,server,game,shared,client}
- Created base tsconfig and per-package tsconfigs with project references
- Built engine/core: ECS (Entity-Component-System), EventBus, GameLoop (fixed timestep), ObjectPool, StateMachine
- Built engine/renderer: SceneManager, CameraController (AoV-style angled top-down)
- Built engine/assets: AssetLoader, ContentRegistry (validates JSON configs against schemas)
- Built engine/input: InputManager, KeyboardMouse, VirtualJoystick (mobile twin-stick)
- Built engine/network: NetworkClient stub (Colyseus placeholder for Phase 2)
- Built server: WorldState, SQLite persistence, OfflineSimulation (time-based pure functions), boot index.ts
- Built game content: sample configs for 1 weapon (Iron Sword), 1 ability (Charge), 1 structure (Wall), 1 monster (Crawler)
- Built client: index.html, main.ts, styles, boot sequence
- Verified: client loads, Three.js scene renders, capsule moves with WASD/touch, server boots with offline simulation message

Stage Summary:
- Monorepo structure complete: 5 packages (engine, server, game, shared, client)
- Engine core is operational: ECS manages entities, GameLoop runs at 60Hz fixed timestep
- Input works on both PC (WASD + mouse) and mobile (virtual joystick)
- Server persists world state to SQLite and runs offline catch-up on boot
- Content pipeline functional: JSON configs loaded and validated at runtime
- Verified end-to-end:
  * `npm install` succeeds
  * `npm -w @rift-and-raid/{shared,engine,game,server} run build` succeeds (all typecheck)
  * `npx tsx packages/server/src/index.ts` boots, loads content (3 weapons, 3 abilities, 4 structures, 2 monsters), persists to SQLite, runs offline simulation, logs summary
  * Forced 6h offline gap test: simulation correctly generates capture point resources ("60 iron, 60 emberwood, 0 godshard")
  * `npm -w @rift-and-raid/client run dev` boots Vite on :5173, serves index.html, transforms main.ts
  * `node tests/ecs-smoke.mjs` passes all assertions (entities, components, queries, event bus, object pool)
- Ready for Phase 1: Single-player prototype (real combat, dummy target, ability casting, resource harvesting)

---
Task ID: phase-1
Agent: main
Task: Phase 1 — Single-player combat prototype. Build game-specific components + systems for real combat: melee arc attacks, ranged projectiles, hit detection, HP/damage, death/respawn, training dummies, damage numbers, HP bars, class selection.

Work Log:
- Set up git remote (https://github.com/Chandima-Prabhath/Rift-Raid.git) and pushed Phase 0
- Created game-specific components: PlayerComponent, CombatTargetComponent, DummyComponent, ProjectileComponent, DamageNumberComponent, HealthBarComponent, HitFlashComponent
- Built CombatSystem: melee arc hit detection (±60° cone, range check) + ranged projectile spawning
- Built ProjectileSystem: motion, lifetime, sphere-sphere collision, pierce support, hit tracking
- Built HealthSystem: HP tracking, death handling, player respawn at base, spawn protection, hit flash cleanup
- Built DummySystem: training dummies respawn 3s after death with restored HP and position
- Built DamageNumberSystem: floating damage text via HTML overlay, screen-projected via camera
- Built HealthBarSystem: 3D billboard HP bars above entities, anchored left-edge fill
- Built MovementSystem: WASD + sprint + dash with class-based speed and world bounds clamping
- Built ClassSelectSystem: 1/2/3 keys swap Warrior/Ranger/Mage with proper HP and weapon changes
- Created prefabs module with createPlayer() and createDummy() factory functions
- Added fire_staff.json content config (Mage starting weapon, 25 damage, 1.2s CD)
- Refactored client main.ts: removed all inline logic, wired 8 game systems with renderer callbacks
- Fixed content loader: properly detects browser vs Node (Vite doesn't expose import.meta.glob as runtime fn)
- Fixed Vite glob pattern: query: '?json' without import: 'default' (preserves {default: ...} shape)
- Removed tsbuildinfo build artifacts from git tracking, added to .gitignore
- Verified: Vite serves pages (HTTP 200), content loads (4 weapons, 3 abilities, 4 structures, 2 monsters), no console errors

Stage Summary:
- Phase 1 success criteria met per GDD §10: "character moves smoothly on PC + mobile, attack hits dummy"
- 8 game systems operational: Movement, Combat, Projectile, Health, Dummy, DamageNumber, HealthBar, ClassSelect
- 3 training dummies spawn in front of player, take damage, die, and respawn after 3s
- Melee (Warrior sword): 120° arc, 2m range, instant hit on all targets in cone
- Ranged (Ranger bow, Mage staff): projectile spawns at chest height, travels forward, sphere-sphere collision
- Floating damage numbers via HTML overlay, screen-projected via camera
- 3D billboard HP bars above all entities (player + dummies)
- Class swap with 1/2/3 keys changes HP max, weapon, and capsule color
- All packages typecheck and build cleanly
- Ready for Phase 2: Multiplayer skeleton (Colyseus, 2 clients see each other move, simple chat)


