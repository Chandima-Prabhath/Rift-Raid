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



---
Task ID: phase-4-multiplayer-fix
Agent: main
Task: Fix broken multiplayer state sync, faction colors, add name tags with HP bars, character model selection, and engine debugging tools.

Work Log:
- Diagnosed root cause: clients received ZERO state from server. Two compounding issues:
  1. Colyseus version mismatch: server @colyseus/core@0.15.57 vs client colyseus.js@0.15.28 — incompatible protocols
  2. Schema used defineTypes() which doesn't reliably register fields with the encoder
- Upgraded all Colyseus packages: @colyseus/core@0.16.22, colyseus.js@0.16.22, @colyseus/schema@3.0.76, @colyseus/ws-transport@0.16.5, @colyseus/monitor@0.16.7
- Rewrote Schemas.ts to use @type decorators (the only officially supported way to register fields for state synchronization)
- Added new schema fields: characterModel, invIron, invEmberwood, invGodshard, ResourceNodeState, StructureState, TeamVaultState
- Updated Vite config to import from dist/ (not src/) so server and client share the SAME decorator-processed class definitions
- Fixed loadContent.ts content directory resolution (was broken when running from built dist/)
- Rewrote GameRoom with:
  - Faction-based colors (Solari=0xe07b3a orange, Lunari=0x4a90e2 blue)
  - Per-sessionId inventory (no shared state between players)
  - Character model selection (12 Kenney GLB models)
  - O(1) sessionIdByPlayer Map for reverse lookup
  - model_swap message handler
  - ping/pong for latency measurement
  - Per-faction TeamVaultState initialization
- Added NameTag system (packages/engine/src/renderer/NameTag.ts):
  - THREE.Sprite billboard that always faces camera
  - CanvasTexture redrawn only when name/HP/relationship changes (not every frame)
  - Color coding: self=green, ally=blue, enemy=red
  - HP bar with color gradient (green>50%, yellow>25%, red)
- Upgraded AssetLoader with:
  - Per-pack texture routing (LoadingManager.setURLModifier)
  - SkinnedMesh → Mesh conversion (Kenney characters use skinned meshes)
  - Material normalization to MeshStandardMaterial for tint support
  - applyTint() for faction-based coloring
  - CharacterModelLoader class with 12 model options
- Added DebugOverlay (packages/engine/src/ui/DebugOverlay.ts):
  - F3 toggles visibility
  - Shows FPS, tick rate, entity count, ping, players visible
  - Local player state (position, HP, inventory, class, model)
  - Engine log lines (last 5)
- Created LoginScreen with name input, class selection (3 buttons), model selection (12 buttons grid)
- Rewrote client main.ts to wire everything together:
  - LoginScreen → NetworkSystem with join options
  - Async GLB model loading with placeholder capsule
  - NameTag attached to each player mesh
  - Model swap detection (reloads GLB when player changes model)
  - DebugOverlay with live stats
- Updated NetworkSystem for Colyseus v3 API:
  - Uses getDecoderStateCallbacks() for state change listeners
  - Ping measurement via ping/pong messages
  - Per-player state polling (no more onChange on schema instances)
- Wrote comprehensive test (scripts/test-multiplayer-comprehensive.ts) verifying:
  - 2 clients connect with different names/models
  - Colors are faction-based and consistent across clients
  - Models are correct per player
  - Model swap propagates to other client
  - Inventory starts at 0 for each player
  - Movement replicates in real-time (9+ units over 1.5s)

Stage Summary:
- ✅ Multiplayer state sync WORKS (was completely broken before)
- ✅ Faction colors consistent across clients (Alice=orange, Bob=blue on both sides)
- ✅ Per-player inventory isolation (no shared state)
- ✅ Character model selection (12 Kenney GLB models)
- ✅ Model swap propagation
- ✅ NameTag billboards with faction-colored name + HP bar
- ✅ DebugOverlay with F3 toggle, live stats, ping
- ✅ All packages typecheck cleanly
- ✅ Vite dev server boots and serves assets correctly
- ✅ Comprehensive test passes all assertions
- Ready for live playtest with 2 browser tabs

---
Task ID: camera-controls-fix
Agent: main
Task: Fix camera (was on player's head), add 360° rotation, make movement camera-relative, improve controls.

Work Log:
- Root cause of "camera on head": pitchDeg was 60° measured from straight-down (so actual angle from horizon was 30°), and the offset math put the camera too close/low.
- Rewrote CAMERA_CONFIG: pitch is now 40° from horizon (intuitive MOBA angle), with min/max clamp 20°-75°.
- Rewrote SceneManager camera system:
  - Spherical orbit (yaw + pitch + distance) around follow target
  - Right-click drag → yaw rotation (horizontal) + pitch adjustment (vertical)
  - Mouse wheel → zoom (distance 8-32)
  - Touch: two-finger drag → rotate, pinch → zoom
  - Exposed cameraYaw/cameraPitch/cameraDistance getters for gameplay code
- Rewrote CameraController: thin gameplay-facing API, exposes yaw for movement
- Rewrote MovementSystem: camera-relative movement
  - Input vector (move.x, move.y) rotated by -cameraYaw to convert camera-space → world-space
  - W always moves away from camera, S toward camera, A/D strafe relative to camera
  - Character faces movement direction (not aim) — natural for third-person
  - Dash is also camera-relative
  - Only local player reads input (remote players are network-synced)
- Updated NetworkSystem: converts input to world-space using camera yaw BEFORE sending to server
  - Server stays simple — just applies world-space moveX/moveZ
  - Added getCameraYaw parameter to constructor
- Updated KeyboardMouse input adapter:
  - Right-click NO LONGER triggers ability (it's camera rotation now)
  - Ability moved to Q key
  - Space dash now prevents page scroll
  - Left-click still attacks (hold for continuous)
- Updated main.ts: passes cameraController.yaw to both MovementSystem and NetworkSystem
- All multiplayer tests still pass (movement replication works with camera-relative input)

Stage Summary:
- ✅ Camera is now angled top-down at 40° (not on player's head)
- ✅ Right-click drag rotates camera 360° (horizontal) + adjusts pitch (vertical)
- ✅ Mouse wheel zooms in/out (8-32 distance)
- ✅ Touch: two-finger drag rotates, pinch zooms
- ✅ WASD movement is camera-relative (W = away from camera, not north)
- ✅ Character faces movement direction
- ✅ Ability on Q key (right-click freed for camera)
- ✅ All packages typecheck cleanly
- ✅ Multiplayer test passes (colors, models, inventory, movement)
