# Rift & Raid — Multiplayer Co-op 3D Web Game

> **Name locked.** Theme: fantasy/medieval, Sibling Gods lore (see GDD.md).

A persistent-world, team-based action RTS built for the web. Designed for 4–6 friends on mixed PC/mobile devices, with short combat sessions layered on top of a persistent world that grows even when no one is playing.

- **Status**: Phase 0 (Foundation) in progress
- **Last updated**: 2026-06-29
- **Owner**: Solo developer (with AI assistance) + friend playtest group (~6 players)

---

## 1. Vision

Build a game that satisfies a friend group of ~6 players with different tastes:

- The AoV fan (strategic, skill-based combat)
- The Mini Militia fans (twin-stick action, quick dopamine)
- The CoC fans (base building, progression)
- The casuals (just want to jump in and have fun)

Three guiding principles:

1. **Skill > grind** — a fresh player can beat a veteran with better play
2. **Quick sessions, deep world** — 5–15 min raids on top of a persistent base
3. **Endlessly extensible** — content is data, not code, so we can keep adding for years

The game is for fun with friends over Discord voice — not commercial, not competitive esports. Fun and engagement are the only success metrics.

---

## 2. Game Concept

### 2.1 Core Loop

Three intertwining phases that players can switch between freely:

| Phase | Activity | Feel like |
|---|---|---|
| **Harvest** | Mine ore, chop wood, hunt neutral monsters in PvE zones | Mini Militia exploration + light survival |
| **Build** | Donate resources to upgrade team base structures | CoC building, but cooperative |
| **Raid / Defend** | Real-time combat on enemy/friendly base | Mini Militia twin-stick + AoV camera |

### 2.2 Two Teams, Shared Bases

- **Two teams** (Red vs Blue — names TBD via friend vote)
- Every player picks a team per session (can switch between sessions, with cooldown to prevent team-hopping for loot)
- **Bases are shared** — not per-player. Everyone on a team contributes to the same base.
- This creates natural cooperation: "we need to defend our gold storage" not "I need to defend MY gold storage"

### 2.3 Persistence vs Sessions

- **World persists**: bases, structures, stored resources, building queues, resource nodes all survive server restarts
- **Sessions are short**: a raid is 5–15 min, harvest runs 5–10 min
- **Offline players' contributions remain**: their character is just "resting" — no logout penalty
- **World keeps running when server is off** (see §6 for offline simulation design)

### 2.4 Democracy System

Each team elects a **Leader** (configurable: weekly, or per-session).

**Leader powers** (all with cooldowns to prevent trolling):

- Place build orders (spend team resources on structures)
- Mark raid targets (ping on map, visible to whole team)
- Call retreats (global team buff: +20% move speed for 10s, 60s cooldown)
- Access commander view (slightly zoomed-out camera + tactical overlay)

**Impeachment**: majority team vote removes leader, triggers immediate re-election.

This gives the CoC/AoV fans their strategic depth without forcing every player to manage the base.

### 2.5 Power Model (skill-first, low-grind)

- **Skill-based**: agility (move speed, dash), aim, positioning matter most
- **Abilities**: 2–3 per character, short CDs (4–10s), impactful but spammable
- **Items**: ~3 slots. Give variety, not raw stats.
  - Example: "Spring Boots" (dash CD −1s) instead of "+50 damage sword"
  - Example: "Thornmail" (reflect 20% melee damage) instead of "+100 armor"
- **Progression**: unlock new abilities/weapons by playing, but **a fresh player is combat-viable from day 1**
- No XP grind wall. Cosmetic skins for self-expression (no pay-to-win, ever).

### 2.6 Match Flow

- **1v1 minimum** (per decision #2)
- **Scalable length** (per decision #3): default 10 min, configurable 5/10/15/20
- Players walk to enemy base → attack structures → steal resources → retreat or wipe
- **Win condition**: destroy enemy Nexus (central base structure), OR have most resources stolen when timer ends

---

## 3. Design Decisions (Locked)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Combat feel | **Twin-stick with optional auto-aim assist on mobile** | Proven by Mini Militia. Works on PC (WASD + mouse) and mobile (dual virtual joysticks). Auto-aim assist compensates for touch imprecision without making PC players feel cheated. |
| 2 | Minimum match size | **1v1** | Allows 2-friend quick duels, scales up to 3v3 or more. |
| 3 | Match length | **Scalable, default 10 min** | Quick dopamine for casuals, room for strategy for AoV fans. Configurable per match. |
| 4 | Camera | **Fixed AoV-style angled top-down** | Simpler to control, mobile-friendly, prevents motion sickness, lets players focus on combat. |
| 5 | Art style | **Flat-shaded low-poly** | Performant on mobile, looks great with stylized aesthetic, no UV unwrapping needed. |
| 6 | Theme | **Fantasy/Medieval** | Largest pool of free CC0 assets (Kenney, Quaternius, KayKit, Mixamo). Easy to extend with new weapons/abilities. Familiar trope, instantly grokkable. |
| 7 | Persistence | **Yes — world persists indefinitely, with offline simulation** | Resources/structures survive server restarts. Offline time is simulated on server boot. |
| 8 | Hosting | **Self-hosted on laptop, intermittent, no continuous uptime** | No Oracle (changed free tier without notice). No fiber at boarding house. World state persists to disk (SQLite). Offline simulation handles time gaps so the world "grows" during downtime. |

---

## 4. Tech Stack

| Layer | Tech | Why |
|---|---|---|
| Rendering | **Three.js + TypeScript** | Industry standard, huge community, flexible |
| Game architecture | **Custom ECS (Entity-Component-System)** | Composable, performant, easy to extend |
| Physics | **Rapier (WASM)** | Fast, deterministic, low-poly friendly |
| Networking | **Colyseus (Node.js)** | Authoritative server, room system, state sync — purpose-built for web multiplayer |
| Real-time transport | WebSocket (default), WebRTC via @geckos.io (optional upgrade) | WebSocket is fine for 4–6 players; Geckos gives UDP-like latency if needed later |
| Database | **SQLite** (via `bun:sqlite`, zero-dependency) | File-based, zero-config, perfect for self-hosted small game, survives crashes |
| Build tool | **Vite** | Fast HMR, easy Three.js setup |
| Runtime | **Bun** (for both dev and prod) | Native TypeScript, fast boot, built-in SQLite, replaces Node + tsx + better-sqlite3 |
| Reverse proxy | **Caddy** or **nginx** | HTTPS termination, static asset serving |
| Tunnel (if behind NAT) | **Cloudflare Tunnel (cloudflared)** | Free, no port forwarding, gives public HTTPS URL through boarding house NAT |
| CI/CD | GitHub Actions → SSH deploy | One commit = deployed game (when laptop is online) |

---

## 5. Engine Architecture (Foundation-First)

The engine is built as a **decoupled core** that knows nothing about the specific game. Gameplay systems live on top of it. This separation is what lets us add content for years without technical debt.

### 5.1 Directory Structure

```
crimson-tide/ → rift-and-raid/
├── README.md                    # This document
├── package.json
├── tsconfig.json
├── vite.config.ts
│
├── packages/
│   ├── engine/                  # Game-agnostic core
│   │   ├── core/                # ECS, event bus, game loop, state machine, object pool
│   │   ├── renderer/            # Three.js wrappers (scene, camera, materials, models)
│   │   ├── assets/              # Asset loader, cache, content registry
│   │   ├── input/               # Multi-platform input (keyboard/mouse + touch)
│   │   ├── network/             # Colyseus client + prediction/reconciliation
│   │   └── ui/                  # Lightweight in-canvas HUD (no React in-game)
│   │
│   ├── server/                  # Authoritative server
│   │   ├── rooms/               # Colyseus rooms (harvest, raid, lobby)
│   │   ├── world/               # World state, persistence, offline simulation
│   │   ├── systems/             # Server-side gameplay systems
│   │   └── api/                 # REST endpoints (auth, leaderboards, configs)
│   │
│   ├── game/                    # Game-specific content (Crimson Tide)
│   │   ├── content/             # Data-driven configs (weapons, abilities, structures, monsters)
│   │   │   ├── weapons/
│   │   │   ├── abilities/
│   │   │   ├── structures/
│   │   │   ├── monsters/
│   │   │   ├── items/
│   │   │   └── maps/
│   │   ├── systems/             # Combat, resource, building, progression, election
│   │   ├── prefabs/             # Entity compositions (player, turret, tree, ore node)
│   │   └── modes/               # Game mode plugins (raid, capture flag, king of hill)
│   │
│   └── shared/                  # Code shared between client and server
│       ├── protocol/            # Network message schemas
│       ├── constants/           # Tunable constants
│       └── types/               # TypeScript types
│
├── client/                      # Browser entry point
│   ├── index.html
│   ├── main.ts                  # Bootstraps engine + game
│   └── styles/
│
├── scripts/                     # Tooling
│   ├── fetch-assets.sh          # Downloads CC0 assets from Kenney/Quaternius
│   ├── deploy.sh                # SSH deploy to laptop server
│   └── migrate.ts               # SQLite migrations
│
└── tests/                       # Unit + integration tests
```

### 5.2 Key Architectural Principles

1. **ECS everywhere** — every game object is an entity with components. Components are pure data. Systems operate on components. No deep inheritance hierarchies.
2. **Data-driven content** — weapons, abilities, structures, monsters, maps are all JSON configs in `packages/game/content/`. Adding content = adding a file. No recompilation.
3. **Deterministic time-based systems** — every "time-based" gameplay effect (tree growth, building construction, resource regen) is a pure function of elapsed time. This enables offline simulation (see §6).
4. **Authoritative server** — server is the source of truth. Client predicts and reconciles. No trust in client input.
5. **No game logic in renderer** — Three.js is a view layer only. Game state lives in ECS, renderer reads it.
6. **Shared protocol** — TypeScript types and Colyseus schemas are generated from a single source, so client and server never disagree.
7. **Pure functions for offline simulation** — any system that needs to "catch up" after downtime must be implemented as a pure function of `(state, elapsed_time) → new_state`. No real-time loops for progression.

---

## 6. World Persistence & Offline Simulation

### 6.1 The Problem

The server runs on a laptop that is **not always on** (boarding house, no 24/7 power, no fiber). Players will join when the server is up, but the world should still "progress" during downtime — trees grow, buildings complete, resources regenerate, cooldowns tick down.

This is a hard requirement, not a nice-to-have. Without it, the persistent-world concept falls apart.

### 6.2 The Solution: Deterministic Time-Based Systems

Every time-based gameplay effect is implemented as a **pure function of elapsed time**, not a real-time loop.

**Example: Tree growth**

```ts
// content/structures/tree.json
{
  "id": "tree_oak",
  "growthStages": [
    { "durationHours": 2,  "model": "tree_sapling.glb" },
    { "durationHours": 6,  "model": "tree_young.glb" },
    { "durationHours": 24, "model": "tree_mature.glb", "harvestable": true }
  ]
}

// server/world/systems/TreeGrowthSystem.ts
function getTreeStage(tree: TreeEntity, now: number): number {
  const elapsed = now - tree.plantedAt;
  let cumulative = 0;
  for (let i = 0; i < tree.config.growthStages.length; i++) {
    cumulative += tree.config.growthStages[i].durationHours * 3600_000;
    if (elapsed < cumulative) return i;
  }
  return tree.config.growthStages.length - 1; // fully grown
}
```

**Example: Building construction**

```ts
function isConstructionComplete(building: BuildingEntity, now: number): boolean {
  return building.startedAt + building.config.buildDurationMs <= now;
}
```

**Example: Passive resource generation**

```ts
function getMineAccumulated(mine: MineEntity, now: number): number {
  const elapsedHours = (now - mine.lastCollectionAt) / 3600_000;
  return Math.min(
    mine.config.capacity,
    elapsedHours * mine.config.perHour
  );
}
```

### 6.3 What Simulates Offline vs What Doesn't

| Simulates offline (pure time functions) | Does NOT simulate offline (requires players) |
|---|---|
| Tree / crop growth | Combat |
| Building construction completion | AI behavior |
| Resource node regeneration | Player-initiated raids |
| Passive resource generation (mines produce X/hour) | Resource gathering by players |
| Cooldown timers (abilities, elections, team-switch) | Movement, position changes |
| Crafting timers | Trades between players |
| Building decay (if unmaintained) | Chat, social interactions |

### 6.4 Boot-Time Catch-Up

When the server boots:

1. Load last-saved world state from SQLite (with `lastTickTimestamp`)
2. Calculate `elapsed = Date.now() - lastTickTimestamp`
3. Cap at `MAX_OFFLINE_SIMULATION_HOURS = 168` (7 days) to prevent runaway calc on long absences
4. For each time-based system, recompute current state from elapsed time using the pure functions above
5. Log summary: `"Simulated 3 days, 14 hours of world time. 47 trees matured. 3 buildings completed. 2 mines produced 240 ore total."`
6. Write the new state back to SQLite
7. Mark server as ready; accept player connections

This makes the intermittent server feel like a persistent world. Players can leave for a week, come back, and find their base has grown — exactly like Animal Crossing or Stardew Valley handle offline time.

### 6.5 Save Strategy

- **Auto-save**: world state snapshot to SQLite every 60 seconds
- **Save-on-event**: save immediately after significant events (building placed, resources deposited, leader elected)
- **Graceful shutdown**: on SIGINT/SIGTERM, save before exiting
- **Crash recovery**: write-ahead log (WAL) mode in SQLite, periodic checkpoints
- **Backup**: weekly SQLite file backup to git (if small) or to a separate folder on disk

---

## 7. Content Extensibility (Years of Fresh Content)

This is the most important architectural goal. New content must never require touching engine code. If adding a new weapon means editing a `.ts` file, we've failed.

### 7.1 Data-Driven Content Pipeline

Every gameplay element is a config file:

```
packages/game/content/
├── weapons/
│   ├── sword_iron.json          # { damage, cooldown, range, attackType, model, animations }
│   ├── bow_long.json
│   └── staff_fire.json
├── abilities/
│   ├── dash.json                # { cooldown, distance, duration, effect }
│   ├── heal_aoe.json
│   └── shield.json
├── structures/
│   ├── nexus.json               # Central base structure
│   ├── turret_arrow.json
│   ├── wall_stone.json
│   └── mine_gold.json
├── monsters/
│   ├── wolf.json
│   ├── goblin.json
│   └── dragon_baby.json
├── maps/
│   ├── two_bases_forest.json    # Map layout, spawn points, resource node placements
│   └── four_bases_desert.json
└── items/
    ├── boots_spring.json        # { effect: "dash_cooldown_reduction", amount: -1000 }
    └── thornmail.json
```

**Adding a new weapon = creating one JSON file. No code changes. No recompile. Hot-reloads in dev.**

### 7.2 Content Schema Validation

Every config file is validated against a JSON schema on server boot. Invalid configs are rejected with a clear error message. This prevents one bad config from crashing the server.

### 7.3 Versioning

Every content file has a `version` field. Migrations are handled by `scripts/migrate.ts`. Old save files are upgraded automatically on server boot.

### 7.4 Modular Game Modes

Game modes are plugins implementing a `GameMode` interface:

```
packages/game/modes/
├── raid.ts                      # Destroy enemy nexus
├── capture_flag.ts              # Steal enemy flag
├── king_of_hill.ts              # Hold the central point
├── boss_invasion.ts             # PvE boss fight
└── harvest_rush.ts              # Most resources in 10 min
```

Each mode implements: `onStart()`, `onTick(dt)`, `onPlayerJoin()`, `onPlayerLeave()`, `checkWinCondition()`. Server picks mode per match. Adding a mode = adding a file.

### 7.5 Seasonal Events

Seasonal content is just content packs activated by date:

```json
// content/seasons/halloween_2026.json
{
  "startDate": "2026-10-15",
  "endDate": "2026-11-05",
  "activates": ["monster_pumpkin", "weapon_broomstick", "map_spooky_forest"],
  "cosmetics": ["skin_witch_hat", "base_theme_pumpkin"]
}
```

Server checks active seasons on boot and on hourly tick. No code changes for seasonal events. This is our "years of fresh content" engine — drop a seasonal JSON, done.

### 7.6 Modding (Future, Phase 10+)

Once the content pipeline is stable, we expose it as a modding API. Players can create and share content packs. This is the long-tail engagement strategy that keeps the game alive for years.

---

## 8. Asset Strategy

### 8.1 Theme: Fantasy/Medieval

Chosen per decision #6. Reasons:

- **Largest pool of free CC0 assets** of any theme
- **Easy to extend** with new weapons (swords, bows, staves, axes) and abilities (magic, melee, ranged)
- **Familiar trope** — friends instantly understand "sword = melee, bow = ranged"
- **Low-poly flat-shaded medieval looks gorgeous** — think *For the King* or *Townscaper* aesthetic

### 8.2 Asset Sources (All Free, Mostly CC0)

| Source | URL | What we get | License |
|---|---|---|---|
| Kenney | kenney.nl | Castle Kit, Medieval, Weapons, UI packs | CC0 |
| Quaternius | quaternius.com | Ultimate Medieval Kingdom (massive), animated animals, characters | CC0 |
| KayKit | kaylousberg.com | Pre-rigged medieval characters with animations | CC0 |
| Mixamo | mixamo.com | Unlimited character animations (idle, run, attack, die) | Free w/ Adobe account |
| Poly Pizza | poly.pizza | 3000+ searchable low-poly models | Mixed (mostly CC0) |
| ambientCG | ambientcg.com | PBR textures (wood, stone, metal) | CC0 |

### 8.3 Workflow (No UV Unwrapping Needed)

The owner has limited Blender skills (no rigging, UV unwrapping, or texturing). This workflow sidesteps all of that:

1. Download pre-rigged character from KayKit (already has skeleton + idle/run animations)
2. Download additional animations from Mixamo (free Adobe account)
3. In Blender (optional): retarget Mixamo animations to KayKit skeleton (1-click with free Auto-Rig Pro or free plugins)
4. Export as GLTF/GLB (web standard, handles materials + animations in one file)
5. Drop into `packages/game/assets/`
6. Reference in content config (e.g. `weapons/sword_iron.json` → `"model": "weapons/sword_iron.glb"`)
7. Asset loader handles caching, Draco compression, KTX2 textures

**A fully animated character can be ready in 30 minutes without ever opening the UV editor.**

### 8.4 Procedural Fallback

For prototyping (Phase 1–2), we use simple primitives (cubes, capsules, cylinders) with flat-shaded materials. Looks great with low-poly aesthetic. Swap in real models later without code changes — only the content config changes.

### 8.5 Asset Fetch Script

`scripts/fetch-assets.sh` (to be written in Phase 0) will:

- Download asset packs from Kenney's CDN (direct zip URLs)
- Download Quaternius packs (direct zip URLs)
- Unzip into `packages/game/assets/`
- Convert to GLB where needed
- Verify all referenced assets exist

This lets us pull fresh assets anytime without manual download. The AI assistant can run this script directly when new assets are needed.

---

## 9. Hosting Setup

### 9.1 Self-Hosted on Laptop (Intermittent)

Per decision #8: server runs on owner's laptop, in boarding house. Not 24/7.

**Implications**:

- World must persist to disk between sessions (SQLite — see §6)
- Offline simulation handles time gaps (see §6)
- Server boots in <5 seconds (just load SQLite + run catch-up)
- Players connect via LAN or tunnel
- Friends get a Discord webhook notification when server is up

### 9.2 Network Options (Pick Based on Situation)

**Option A: LAN (simplest, if all friends are in same boarding house)**

- Server listens on `0.0.0.0:2567`
- Players connect to `http://<laptop-LAN-IP>:2567`
- No internet needed, lowest latency
- Limitation: only works when everyone is on same WiFi

**Option B: Cloudflare Tunnel (recommended for remote friends)**

- Install `cloudflared` on laptop
- Run: `cloudflared tunnel --url http://localhost:2567`
- Get public HTTPS URL like `https://crimson-tide.example.trycloudflare.com`
- No port forwarding needed (works through boarding house NAT)
- Free, no account required for quick tunnels
- For stable URL: create a named tunnel + free `crimson-tide.cfargotunnel.com` domain
- Limitation: depends on Cloudflare not being blocked on the network

**Option C: Tailscale (mesh VPN, all friends install client)**

- Each friend installs Tailscale (free, works on mobile + PC)
- Connect to same tailnet
- Server laptop has stable Tailscale IP (e.g. `100.x.x.x`)
- Limitation: requires client install on every device — friction

**Recommendation**: Start with **Option A (LAN)** for first playtests in the boarding house. Switch to **Option B (Cloudflare Tunnel)** when remote friends want to join. Tailscale is a fallback if Cloudflare is blocked.

### 9.3 When Server Is Down

- Players see "Server is offline" page with last-seen timestamp (served from a tiny static page or via Discord)
- World state is safe in SQLite — nothing lost
- When server boots, catch-up simulation runs (see §6)
- Owner gets a Discord webhook (optional) confirming server is up + public URL

### 9.4 Deploy Script

`scripts/deploy.sh` (to be written) will:

1. Pull latest code from git
2. Build client (`vite build`)
3. Restart server (`pm2 restart crimson-tide`)
4. Restart Cloudflare tunnel (if remote play)
5. Send Discord webhook: "Server is up at `<URL>`. Simulated `<X>` hours of world time."

---

## 10. Development Roadmap

Each phase produces a **playable build** so friends can test early and give feedback. No phase ends without something to play.

| Phase | Duration | Deliverable | Success Criteria |
|---|---|---|---|
| **0. Foundation** | Week 1 | Engine skeleton: ECS, game loop, scene manager, input manager, asset loader, SQLite persistence, offline simulation stub | Boot server, load empty world, save state, restart, verify catch-up runs |
| **1. Single-player prototype** | Week 2 | One character, movement, fixed AoV camera, basic attack, dummy target | Character moves smoothly on PC + mobile, attack hits dummy |
| **2. Multiplayer skeleton** | Week 3 | Colyseus server, 2 clients see each other move, simple chat | 2 friends in different rooms see each other in real-time |
| **3. Combat + abilities** | Week 4 | Health, damage, 1 ability per char, respawn, death | Can kill each other, abilities fire on cooldown, respawns work |
| **4. Resources + harvesting** | Week 5 | Mine nodes, inventory, drop-off at base, resource counters | Mine ore, bring to base, see counter increment |
| **5. Bases + building** | Week 6 | Place structures, upgrade levels, visual progression, construction timers | Queue a building, see it construct over time (test offline sim) |
| **6. Raid mode** | Week 7 | Attack enemy base, destroy structures, steal resources, win condition | Full raid match 1v1 or 2v2, win/lose screen |
| **7. Leader + democracy** | Week 8 | Election UI, leader powers, impeachment vote | Elect a leader, use powers, impeach |
| **8. Polish + mobile controls** | Week 9 | Virtual joysticks, mobile UI, performance pass | Smooth 60fps on mid-range phone, controls feel good |
| **9. Deploy + playtest** | Week 10 | Public URL via Cloudflare Tunnel, CI/CD, Discord webhook | All 6 friends play together from different devices |

After Phase 9, the game is "live" for the friend group. Future phases add content (new weapons, abilities, maps, modes, seasonal events) using the data-driven pipeline — no engine changes needed.

---

## 11. Open Items / Future Decisions

Items we've deferred but should decide before reaching them:

- [ ] **Team names**: Red vs Blue is placeholder. Vote among friends?
- [ ] **Character roster**: Start with 1 generic character, or design 3 distinct classes (Warrior/Archer/Mage) from day 1?
- [ ] **Ability list**: Need to design 6–9 abilities (2–3 per starting character)
- [ ] **Map count**: Start with 1 map, plan for 3 by Phase 9
- [ ] **Cosmetic system**: How do players earn skins? Play time, achievements, or just free for all?
- [ ] **Voice chat**: In-game (via WebRTC) or rely on Discord voice? (Leaning: Discord voice — less work, friends already use it)
- [ ] **Anti-cheat**: For 6 friends, probably not needed. But if friends-of-friends join, consider server-side validation depth.
- [ ] **Backup strategy**: SQLite file is single — should we auto-backup to GitHub Releases weekly? (The DB will be small enough.)
- [ ] **Analytics**: Optional, but tracking which abilities/maps are most played would inform balance. Can be added in Phase 9.
- [ ] **Map editor**: Build a simple in-browser editor so adding maps doesn't require hand-editing JSON? (Phase 10+)

---

## 12. Changelog

| Date | Change |
|---|---|
| 2026-06-29 | Initial plan drafted. Decisions 1–8 locked. Architecture, persistence, content pipeline, hosting, roadmap defined. |
| 2026-06-29 | Renamed game from "Crimson Tide" to "Rift & Raid". Started Phase 0 (engine foundation). |

---

## How to Update This Document

This README is the single source of truth for the project. Update it when:

- A design decision changes (update §3, add changelog entry)
- A phase completes (mark in §10, add changelog entry)
- A new open item is identified (add to §11)
- An open item is resolved (move to §3 with rationale, remove from §11)

**Rule**: no code is written for a feature until its design is captured here. This prevents ad-hoc decisions and tech debt — the exact thing the owner wants to avoid.
