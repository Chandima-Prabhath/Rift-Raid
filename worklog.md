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

