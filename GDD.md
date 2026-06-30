# Game Design Document — Rift & Raid

> **Status**: v1.0 — Complete design pass. Ready for development.
> **Last updated**: 2026-06-29
> **Companion document**: `README.md` (project plan, tech stack, roadmap)

---

## Table of Contents

1. [Document Purpose](#1-document-purpose)
2. [Game Name & One-Liner](#2-game-name--one-liner)
3. [Vision & Design Pillars](#3-vision--design-pillars)
4. [Lore & World State](#4-lore--world-state)
5. [Factions](#5-factions)
6. [Resources & The Conflict](#6-resources--the-conflict)
7. [World Geography & Map Design](#7-world-geography--map-design)
8. [Bestiary (Riftspawn)](#8-bestiary-riftspawn)
9. [Character Classes](#9-character-classes)
10. [Weapons](#10-weapons)
11. [Abilities](#11-abilities)
12. [Items & Shop System](#12-items--shop-system)
13. [Base & Buildings](#13-base--buildings)
14. [Economy & Resource Flow](#14-economy--resource-flow)
15. [Combat Math & Balance](#15-combat-math--balance)
16. [Match Flow](#16-match-flow)
17. [Strategic Depth](#17-strategic-depth)
18. [Progression & Cosmetics](#18-progression--cosmetics)
19. [Open Items / Future Decisions](#19-open-items--future-decisions)
20. [Changelog](#20-changelog)

---

## 1. Document Purpose

This Game Design Document (GDD) is the **single source of truth for game content**. It captures every gameplay element, balance number, lore detail, and design decision before development begins. The goal is to eliminate mid-development rework caused by unclear or shifting design.

**Rules for this document**:

- No code is written for a feature until its design is captured here.
- Any balance number change is recorded in the changelog (§20) with rationale.
- Any new content (weapon, ability, monster, structure, mode) is added here first, then implemented.
- This document is versioned alongside code in git.

---

## 2. Game Name & One-Liner

**Name**: Rift & Raid

**One-liner**: A persistent-world, team-based 3D action RTS where two tribes fight over a fractured world, harvesting by day, raiding by night, while monsters bleed from the Rift at the world's wound.

**Tagline**: *Rifts scar the world. Raids decide who rules it.*

**Why this name**:
- **Rift** = the wound in the world, source of monsters (Riftspawn), source of rare Godshard. The PvE layer.
- **Raid** = the act of attacking the enemy base. The PvP layer.
- Together they capture both core loops in two punchy, alliterative words
- Easy to say, easy to type, easy to remember, not taken by any major game
- The ampersand gives it a tabletop/board-game feel that matches the friend-group vibe

---

## 3. Vision & Design Pillars

### 3.1 Vision

Build a game that satisfies a friend group of ~6 players with different tastes:

- The AoV fan (strategic, skill-based combat)
- The Mini Militia fans (twin-stick action, quick dopamine)
- The CoC fans (base building, progression)
- The casuals (just want to jump in and have fun)

The game is for fun with friends over Discord voice — not commercial, not competitive esports. Fun and engagement are the only success metrics.

### 3.2 Design Pillars

Everything in the game must serve at least one of these pillars. If a feature doesn't, it gets cut.

| Pillar | What it means | How we measure it |
|---|---|---|
| **Skill > Grind** | A fresh player can beat a veteran with better play. No XP walls, no +50 damage swords. | Day-1 player wins a 1v1 vs. month-6 player at least 30% of the time |
| **Quick Sessions, Deep World** | 5–15 min combat sessions layered on a persistent, growing world. | Average session ≤ 20 min; world visibly changes between sessions |
| **Endlessly Extensible** | Content is data, not code. New weapons/abilities/maps/modes drop in via config files. | Adding a new weapon takes ≤ 1 hour, zero engine code changes |
| **Cross-Platform by Default** | PC and mobile players in the same match, no handicap either way. | Mid-range phone sustains 60fps; PC vs. mobile win rate ±5% |
| **Emergent Stories** | Each session generates a story players tell each other afterwards. | Playtest post-mortems include at least one "remember when..." moment |

### 3.3 Non-Goals (What We're NOT Building)

- An esport (no ranked ladder, no spectator mode, no balance patches driven by pros)
- A grindfest (no daily login rewards, no battle pass, no FOMO mechanics)
- A solo experience (always-online, always-multiplayer, even when "alone" in a harvest zone)
- A graphical showcase (low-poly flat-shaded is the aesthetic, not a limitation)
- A 100-player battle royale (designed for 4–6 friends, scales to maybe 12 max)

---

## 4. Lore & World State

### 4.1 The Sibling Gods

Long ago, twin gods **Solaris** (sun, fire, creation) and **Lunara** (moon, tide, transformation) shaped the world together. They were lovers as much as siblings — two halves of one creative impulse.

They quarreled over one question: *should mortals be given fire?*

- **Solaris** argued yes. Fire brings progress, courage, the forge, the spark of civilization. Without it, mortals remain animals.
- **Lunara** argued no. Fire brings destruction, ambition, the capacity for war. Mortals should be left to change at their own pace, like tides.

Their argument split the sky. Each god blessed a tribe of mortals — the **Solari** and the **Lunari** — and went to sleep, exhausted, promising to wake when their side was proven right.

No one knows what "proven right" means. The gods left no instructions.

### 4.2 The Rift

The world was scarred by their argument. A wound runs through its center — **the Rift** — a jagged tear in reality where neither god's power holds. The Rift does not heal. It widens by a finger's width every century.

From the Rift, **Riftspawn** bleed out at night. They are not demons. They are not evil. They are *unmade* — fragments of creation that never finished, hungry for the warmth they were denied. They attack anything that moves.

Both tribes must beat back Riftspawn incursions, even as they war with each other.

### 4.3 Godshard

When the gods slept, their power crystallized. Fragments of divine essence — **Godshard** — form slowly in the world, drawn to places where the gods' argument was loudest. The Rift produces the most. Smaller deposits form on each tribe's side.

Godshard is the only substance capable of:
- Upgrading a tribe's Nexus (the heart of their base)
- Forging epic items
- Eventually, perhaps, waking a god

Both tribes want it. Neither has enough. The Rift has the most. This is why they fight.

### 4.4 World State (Present Day)

- **Time since the Sundering**: ~800 years
- **Solari civilization**: Desert-dwelling, sun-worshipping, forge-focused, hierarchical. Their capital is **Emberhold** (their team's base).
- **Lunari civilization**: Forest-dwelling, moon-revering, magic-focused, council-led. Their capital is **Mistveil** (their team's base).
- **The Frontier**: The contested land between them, ~3 days' walk wide, scattered with abandoned ruins from before the Sundering. The Rift runs through its center.
- **Population**: Each tribe numbers in the low thousands, but only a few dozen "adventurers" (the players) actively fight, harvest, and raid.
- **Technology**: Medieval + magic. No gunpowder. No steam. Swords, bows, staves, runes.

### 4.5 Why This Lore Works for the Game

| Lore element | Gameplay function |
|---|---|
| Two gods, two tribes | Justifies the 2-team structure |
| The Rift | Source of PvE monsters (Riftspawn) |
| Godshard | The rare resource both teams fight over |
| Sleeping gods | Future seasonal events ("Solaris stirs") |
| 800 years of history | Centuries of lore to drip in via item descriptions, ruins, NPC dialogue |
| "Proven right" ambiguity | Lets us evolve the story based on playtest outcomes |

### 4.6 Lore Delivery (No Cutscenes)

Players don't read lore; they absorb it through:

- **Item descriptions** (e.g., *"This sword was forged in Emberhold during the Third Scorching. The smith's name is lost."*)
- **Ruins in the world** (broken pillars with runes, statues of forgotten heroes)
- **NPC dialogue** at base (one or two flavor lines per NPC per session)
- **Loading screen tips** (rotating pool of 50+ lore snippets)
- **Seasonal events** that advance the meta-story

No mandatory reading. Lore is a reward for curiosity, not a tax on play.

---

## 5. Factions

### 5.1 Solari — Children of the Sun

| Aspect | Detail |
|---|---|
| **God** | Solaris (sun, fire, creation) |
| **Capital** | Emberhold (sandstone fortress in the desert) |
| **Color palette** | Gold, orange, red, sandstone, bronze |
| **Aesthetic** | Angular architecture, banners, forges, sun motifs |
| **Philosophy** | Progress through fire. Strength, courage, hierarchy. |
| **Starting biome** | Solaris Wastes (desert) |
| **Visual identity** | Warm tones, hard shadows, sun-bleached ruins |
| **Symbol** | A sun with eight rays, crossed by a sword |

### 5.2 Lunari — Children of the Moon

| Aspect | Detail |
|---|---|
| **God** | Lunara (moon, tide, transformation) |
| **Capital** | Mistveil (silver spires in an ancient forest) |
| **Color palette** | Silver, blue, teal, pale wood, moonstone |
| **Aesthetic** | Curved architecture, runes, water features, moon motifs |
| **Philosophy** | Harmony through change. Wisdom, adaptation, council rule. |
| **Starting biome** | Lunar Grove (silver forest) |
| **Visual identity** | Cool tones, soft glow, bioluminescent accents |
| **Symbol** | A crescent moon cradling a wave |

### 5.3 Symmetry Note

**Factions are cosmetically different but mechanically identical.** A Solari Warrior and a Lunari Warrior have the same stats. The difference is visual: model, color, animations, base architecture. This ensures perfect balance between teams and keeps the design extensible (we can add a third faction later without rebalancing).

### 5.4 Faction Switching

- Players can switch factions between sessions (not during)
- 24-hour cooldown after switching before switching again
- Switching forfeits any pending faction-specific cosmetics unlocks (not retroactive — already-earned cosmetics remain)
- Game suggests the underpopulated faction to new players (team balance)

---

## 6. Resources & The Conflict

### 6.1 Three Resources (Unified Pool)

Both teams fight over the **same** three resources. This is critical: it means raiding the enemy gives you resources you can actually use, creating real incentive to raid.

| Resource | Rarity | Source | Used For | Lore |
|---|---|---|---|---|
| **Iron** | Common | Iron deposits in all biomes | Basic weapons, basic armor, walls, turrets | Mundane metal, foundation of all crafting |
| **Emberwood** | Common | Ancient trees in all biomes | Structure construction, watchtowers, basic items | Wood imbued with residual god-energy from the Sundering |
| **Godshard** | Rare | Rift (best), small deposits on each side | Epic items, Nexus upgrades, advanced structures | Crystallized fragments of the sleeping gods' power |

### 6.2 Why Three Resources (Not Two)

Two resources (gold + wood) is too simple — every decision reduces to "save or spend". Three creates a **strategic triangle**:

- Want defense? Spend **Iron** on walls/turrets.
- Want economy? Spend **Emberwood** on watchtowers + Vault upgrades.
- Want power? Spend **Godshard** on Nexus upgrades + epic items.

A team that ignores one resource becomes brittle. A team that hoards all three becomes a target.

### 6.3 Resource Node Distribution

```
┌─────────────────────────────────────────────────────────┐
│  SOLARIS WASTES        │  THE FRONTIER   │  LUNAR GROVE  │
│  (Solari side)         │  (contested)    │  (Lunari side)│
│                        │                 │               │
│  ● Iron (lots)         │  ● Iron (some)  │  ● Iron(lots) │
│  ● Emberwood (some)    │  ● Emberwood    │  ● Emberwood  │
│  ● Godshard (rare)     │  ● Godshard     │  ● Godshard   │
│                        │    (LOTS)       │    (rare)     │
│                        │  ● Riftspawn    │               │
└─────────────────────────────────────────────────────────┘
```

**Implications**:
- Each team has safe access to common resources on their side
- Godshard is scarce on each side — major bottleneck for upgrades
- The Frontier is where Godshard-rich nodes spawn — high risk, high reward
- Both teams are incentivized to push into the Frontier, creating organic PvP

### 6.4 The Steal Mechanic

When raiding an enemy base, raiders can steal from the enemy Vault:

- **Cap**: 30% of the Vault's current contents per raid
- **Movement penalty**: −30% move speed while carrying stolen goods
- **Banking**: must return to your own Vault and deposit
- **Risk**: if killed en route, stolen resources drop on the ground (either team can pick up)

This creates a **carry-and-protect** mini-game inside raids. The raider with the loot is vulnerable; the team must escort them home.

### 6.5 The Conflict Loop

```
1. Both teams harvest common resources safely on their side
2. Both teams want Godshard — frontier is contested
3. Teams build bases (spend Iron + Emberwood) and upgrade Nexus (spend Godshard)
4. Teams declare raids to steal enemy Godshard (and Iron/Emberwood)
5. Raiders carry loot home; defenders try to intercept
6. Stolen resources fund more upgrades; cycle continues
7. Victory: destroy enemy Nexus, OR bank enough resources to "win" the season
```

### 6.6 Rubber-Band Mechanic

To prevent one team from snowballing to permanent dominance:

- **When a team is 30%+ behind in total Vault value**, they gain **+10% gather speed**
- **When a team is 50%+ behind**, they additionally gain **+10% combat damage vs. structures** (helps them catch up via raids)
- These buffs disappear as soon as the gap closes below the threshold
- Subtle — no UI indicator. Players just notice they're slightly faster when losing.

This keeps matches competitive even with skill imbalance, without feeling like a handicap.

---

## 7. World Geography & Map Design

### 7.1 Map Dimensions

- **Total size**: ~200m × 120m (24,000 sq m)
- **Walk time base-to-base**: ~30–40s walking, ~20–30s sprinting
- **Camera view radius**: ~25m (player sees only their immediate surroundings)
- **Exploration time**: a player can walk the entire perimeter in ~5 minutes

**Design rationale**: Big enough that the map has variety and multiple routes; small enough that a single session explores it fully. The limited camera view (top-down angled) makes the map *feel* bigger than it is — you can't see the whole thing at once.

### 7.2 Map Layout (Top-Down View)

```
            N (back of map)
            ▲
            │
   ┌────────┴──────────────────────────────────────┐
   │                                                │
   │   ┌──────────┐                  ┌──────────┐  │
   │   │ EMBERHOLD│                  │ MISTVEIL │  │
   │   │ (Solari) │                  │ (Lunari) │  │
   │   │  40×40m  │                  │  40×40m  │  │
   │   │   NW     │                  │   NE     │  │
   │   └────┬─────┘                  └─────┬────┘  │
   │        │                              │       │
   │        │  ╔══════════════════════╗    │       │
   │        ├──╣                      ╠────┤       │
   │        │  ║   THE FRONTIER       ║    │       │
   │        │  ║                      ║    │       │
   │        │  ║   ┌────────────┐     ║    │       │
   │        │  ║   │  THE RIFT  │     ║    │       │
   │        │  ║   │  (center)  │     ║    │       │
   │        │  ║   │  30×30m    │     ║    │       │
   │        │  ║   └────────────┘     ║    │       │
   │        │  ║                      ║    │       │
   │        ├──╣                      ╠────┤       │
   │        │  ╚══════════════════════╝    │       │
   │        │                              │       │
   │        │     (3 routes: north,        │       │
   │        │      center, south)          │       │
   │                                                │
   └────────────────────────────────────────────────┘
            S (front of map)
```

### 7.3 Three Lanes / Routes

Between the two bases, three routes through the Frontier:

| Route | Width | Terrain | Risk | Reward |
|---|---|---|---|---|
| **North Pass** | Narrow (8m) | Mountain pass with cover | Low PvP, easy choke defense | Small Godshard nodes, safe travel |
| **Center Road** | Wide (20m) | Open ground through Rift | High PvP, high Riftspawn | Most Godshard, fastest route |
| **South River** | Medium (12m) | River crossing, slow movement | Medium PvP, ambush risk | Medium Godshard, hidden paths |

This gives raiders **strategic choice**: fast and exposed (Center), slow and sneaky (River), or safe but slow (North). Defenders must split attention across all three.

### 7.4 Biomes

#### Solaris Wastes (Solari side, ~80m × 120m)

- **Terrain**: Sand dunes, sandstone plateaus, dry riverbeds
- **Foliage**: Cacti, dead trees, sun-bleached ruins
- **Lighting**: Warm orange, hard shadows, bright sun
- **Landmarks**: Emberhold (base), abandoned obelisk, dried oasis (resource node cluster)
- **Resource density**: High Iron, medium Emberwood, low Godshard

#### Lunar Grove (Lunari side, ~80m × 120m)

- **Terrain**: Forest floor, mossy stones, gentle streams
- **Foliage**: Silver-leafed trees, glowing mushrooms, ferns
- **Lighting**: Cool blue, soft diffuse, bioluminescent accents at night
- **Landmarks**: Mistveil (base), ancient moonwell, sacred grove (resource node cluster)
- **Resource density**: High Emberwood, medium Iron, low Godshard

#### The Frontier (center, ~40m × 120m)

- **Terrain**: Cracked obsidian ground near Rift, mixed terrain elsewhere
- **Foliage**: Twisted dead trees, glowing Rift crystals, sparse grass
- **Lighting**: Purple/magenta Rift glow, contrast with both sides
- **Landmarks**: The Rift (center), abandoned ruins (3 ruins, capturable camps), 2 Riftspawn nests
- **Resource density**: Medium Iron, medium Emberwood, HIGH Godshard

### 7.5 Day/Night Cycle

- **Cycle length**: 20 minutes (10 min day, 10 min night)
- **Day**: Normal gameplay, Riftspawn less aggressive
- **Night**: Riftspawn spawn rate +50%, they roam further from nests, visibility slightly reduced
- **Visual cue**: Lighting shifts gradually (warm → cool → Rift purple at midnight → warm again)
- **Strategic impact**: raids at night are riskier (more Riftspawn), but defenders are also distracted

### 7.6 Capturable Resource Camps

Three small camps in the Frontier, capturable by either team:

- **Ruined Watchtower** (north pass) — generates 1 Iron/min to owning team
- **Abandoned Mine** (south river) — generates 1 Emberwood/min to owning team
- **Rift Shrine** (center, near Rift) — generates 1 Godshard/5min to owning team

**Capture mechanic**: stand inside the camp's circle for 30 cumulative seconds (multiple players stack). No NPCs defend. Creates a strategic mini-objective outside of raids.

### 7.7 Map Extensibility

Adding a new map = adding one JSON config + asset bundle. Maps are data, not code. Phase 9 will ship with this single map; Phase 10+ adds variants (4-team map, snow biome, underground caverns, etc.).

---

## 8. Bestiary (Riftspawn)

Riftspawn are the PvE threat. They spawn from nests in the Frontier and roam at night. They're not evil — they're unmade fragments of creation, hungry for warmth.

### 8.1 Spawn Rules

| Source | Spawn Rate | Cap | Behavior |
|---|---|---|---|
| Nests (Frontier, fixed locations) | 1 every 60s per nest | 15 per nest | Defend nest, attack nearby players |
| Night roaming | 1 every 30s during night | 30 total on map | Wander toward nearest player structure |
| Rift surges (random event) | Burst of 5–10 every 5 min | — | Charge toward nearest base |

Nest destruction: a nest can be destroyed by players (500 HP). It respawns after 10 minutes. Destroying a nest gives 5 Iron + 2 Godshard to the destroyer.

### 8.2 Riftspawn Roster (Launch)

| Tier | Name | HP | Damage | Speed | Behavior | Drops |
|---|---|---|---|---|---|---|
| Minor | **Crawler** | 30 | 8 (melee) | Fast | Swarms in packs of 3–5 | 1 Emberwood |
| Minor | **Spitter** | 40 | 12 (ranged, 10m) | Slow | Keeps distance, spits poison | 1 Iron |
| Major | **Brute** | 200 | 25 (melee) | Slow | Charges, knockback on hit | 3 Iron + 1 Godshard |
| Elite | **Tunneler** | 150 | 30 (melee) | Medium | Burrows underground, surfaces under players | 5 Iron + 2 Godshard |
| Boss | **Rift Maw** | 1500 | 50 (melee + AoE) | Slow | Multi-phase, drops loot for whole team | 20 Godshard + rare cosmetic |

### 8.3 Boss Schedule

**Rift Maw** spawns once per week at the Rift center. Server-side schedule (every Saturday at 8 PM server time, configurable).

- Spawns with a 5-minute warning (global alert to both teams)
- Both teams can fight it together (temporary PvE truce) or fight each other for the kill credit
- Killing team gets the loot; participating players get a cosmetic
- If not killed in 30 minutes, it despawns (returns to the Rift)

This creates a **weekly social event** friends can plan around — exactly the kind of recurring engagement that keeps the game alive for years.

### 8.4 Adding New Monsters

New Riftspawn = one JSON config + one 3D model. No code changes. The Content Registry validates the config and registers the monster for spawning. Future expansions can add:

- Flying Riftspawn (Harpies)
- Healer Riftspawn (Menders — heal nearby enemies)
- Splitter Riftspawn (Divide — splits into 2 small ones on death)
- Caster Riftspawn (Channelers — ranged AoE attacks)

All implementable via the data-driven pipeline in Phase 0+.

---

## 9. Character Classes

### 9.1 Three Classes (All Unlocked from Day 1)

| Class | Role | HP | Move Speed | Sprint Speed | Dash Distance |
|---|---|---|---|---|---|
| **Warrior** | Frontline, melee bruiser | 130 | 5 m/s | 7 m/s | 4m (3s sprint CD) |
| **Ranger** | Ranged DPS, kiter | 90 | 6 m/s | 8 m/s | 4m (3s sprint CD) |
| **Mage** | Burst damage, fragile | 70 | 5 m/s | 7 m/s | 4m (3s sprint CD) |

All three are unlocked for all players from the start. No grinding to access classes. Players pick a class at base before spawning, and can swap at base (10s cooldown).

### 9.2 Class Identity

#### Warrior
- **Fantasy**: Frontline tank/brawler. Wades into melee, soaks damage, disrupts enemies.
- **Strengths**: High HP, melee cleave, crowd control (stun, knockback)
- **Weaknesses**: No ranged option, kited by Rangers, vulnerable to Mage burst
- **Skill expression**: Positioning to land cleave on multiple enemies, timing Shield Bash to interrupt abilities, using Charge to engage or escape
- **For players who like**: AoV fighters, Mini Militia shotgunners, "in your face" aggression

#### Ranger
- **Fantasy**: Mobile ranged DPS. Hits from distance, kites, never gets hit.
- **Strengths**: Highest sustained DPS, long range, mobility
- **Weaknesses**: Squishy, drops off in melee, requires aim
- **Skill expression**: Kiting (move + shoot), headshots (1.5x damage), ability timing
- **For players who like**: AoV marksmen, Mini Militia snipers, precision play

#### Mage
- **Fantasy**: Glass cannon caster. Burst damage, crowd control, fragile.
- **Strengths**: Highest burst, AoE, crowd control (slow, freeze)
- **Weaknesses**: Lowest HP, slowest attacks, punished hard by gaps in positioning
- **Skill expression**: Ability combos (Frost Nova → Meteor), positioning, Blink escapes
- **For players who like**: AoV mages, ability-focused play, high-risk high-reward

### 9.3 Class Balance Philosophy

- **No hard counters**: a skilled Warrior can beat a Ranger, a skilled Ranger can beat a Mage, etc. Matchups are 45/55 at worst.
- **Team composition matters**: 3 Warriors loses to 1 of each (usually). Diverse comps are rewarded.
- **Symmetric across factions**: Solari Warrior = Lunari Warrior (same stats, different model).

### 9.4 Why Three Classes (Not One, Not Five)

- **One** is too samey — combat feels identical regardless of "loadout"
- **Three** gives clear roles (frontline / ranged / caster) without overwhelming new players
- **Five+** is too much balance work for v1 — we'd ship imbalanced. Add classes in Phase 11+ via the data pipeline.

---

## 10. Weapons

### 10.1 Starting Weapon Roster (6 weapons)

Each class has 2 weapon options. All weapons are **purchasable at the Shop** (see §12) using resources.

| Weapon | Class | Type | Damage | CD | Range | Special | Cost |
|---|---|---|---|---|---|---|---|
| **Iron Sword** | Warrior | Melee | 20 | 0.6s | 2m | Cleave (hits all in arc) | 5 Iron, 2 Emberwood |
| **War Axe** | Warrior | Melee | 28 | 1.0s | 2m | Heavy hit, brief self-slow | 8 Iron, 4 Emberwood |
| **Shortbow** | Ranger | Ranged | 16 | 0.7s | 18m | Fast, low drop-off | 6 Iron, 3 Emberwood |
| **Longbow** | Ranger | Ranged | 22 | 1.2s | 25m | Slow, pierces 1 enemy | 10 Iron, 4 Emberwood |
| **Fire Staff** | Mage | Ranged | 25 | 1.2s | 15m | Projectile, 10% burn DoT (3s) | 8 Iron, 5 Emberwood |
| **Frost Staff** | Mage | Ranged | 18 | 1.0s | 15m | Projectile, 30% slow (1s) | 8 Iron, 5 Emberwood |

### 10.2 Weapon Design Rules

1. **No "+damage" weapons** — every weapon has a tradeoff (more damage = slower, or shorter range, etc.)
2. **Two weapons per class** — meaningful choice, not 20 options
3. **Sidegrades, not upgrades** — Iron Sword and War Axe are equally viable, just different playstyles
4. **Cosmetic variants** — same stats, different model. Earned via play. (e.g., "Sunsteel Sword" = Iron Sword stats, golden skin)

### 10.3 Future Weapons (Post-Launch, Data-Driven)

- Spear (Warrior, longer melee range, lower damage)
- Crossbow (Ranger, slower but no drop-off)
- Lightning Staff (Mage, chain lightning to 2 nearby enemies)
- Shield + Mace (Warrior, defensive option with block)

Each new weapon = 1 JSON config + 1 model. No engine changes.

---

## 11. Abilities

### 11.1 Ability System

- Each class has **3 abilities**: 1 default, 2 unlocked through play (no grind — see §11.3)
- Players equip **1 ability** per match (swap at base, 10s cooldown)
- All abilities have cooldowns in the 6–20s range — spammable but not spam-friendly
- Abilities do not crit (controlled damage)
- Abilities cannot be interrupted by damage (no cast-time abilities — all instant or short-channel)

### 11.2 Ability Roster (9 abilities, 3 per class)

#### Warrior Abilities

| Ability | Effect | CD | Unlock |
|---|---|---|---|
| **Charge** | Dash 6m, knockback enemies hit (15 dmg) | 6s | Default |
| **Shield Bash** | Stun 1s in 3m cone (10 dmg) | 10s | Play 5 matches as Warrior |
| **Whirlwind** | Spin, 15 dmg in 4m radius, 0.5s channel | 12s | Win 3 raids as Warrior |

#### Ranger Abilities

| Ability | Effect | CD | Unlock |
|---|---|---|---|
| **Volley** | Fire 3 arrows in a cone (12 dmg each) | 8s | Default |
| **Smoke Arrow** | Create 4m smoke cloud, blocks vision 3s | 14s | Play 5 matches as Ranger |
| **Multishot** | Fire 5 arrows 360° around you (10 dmg each) | 18s | Win 3 raids as Ranger |

#### Mage Abilities

| Ability | Effect | CD | Unlock |
|---|---|---|---|
| **Frost Nova** | AoE slow 50%, 5m radius, 2s duration | 10s | Default |
| **Blink** | Teleport 8m in cursor direction | 12s | Play 5 matches as Mage |
| **Meteor** | Delayed (1.5s) AoE, 40 dmg, 3m radius | 20s | Win 3 raids as Mage |

### 11.3 Unlock Philosophy

- **Default ability**: available from minute 1, defines the class fantasy
- **Play 5 matches**: unlocked after 5 matches with that class (~1 hour of play). Tracked server-side per account.
- **Win 3 raids**: unlocked after 3 raid wins with that class. Encourages engaging with the raid loop.

**No XP. No levels. No grind.** A friend joining in month 6 can play 5 quick matches (~1 hour) and have the same ability access as a day-1 player. The unlocks are **engagement gates**, not power gates — they exist to onboard players gradually rather than overwhelm them with 9 abilities at once.

### 11.4 Adding New Abilities

New ability = 1 JSON config + (optional) VFX asset. No engine changes. Future expansions can add:

- Warrior: **Bulwark** (team-wide shield), **Cleave** (next attack hits 360°)
- Ranger: **Trap** (place a snare), **Marksman** (next shot +200% damage)
- Mage: **Heal** (restore 30 HP to self/ally), **Time Warp** (slow all enemies in 10m for 2s)

---

## 12. Items & Shop System

### 12.1 Design Decision: Purchasing, Not Crafting

**Original plan**: crafting with timers.
**Revised plan**: instant purchasing at the Shop.

**Why changed**: Friends want quick dopamine. Crafting timers add friction without adding fun. Purchasing keeps the resource economy meaningful (you still earn resources to buy things) but removes the wait.

### 12.2 Item Slots (3 per player)

| Slot | Purpose | Example Items |
|---|---|---|
| **Weapon** | Primary attack | Iron Sword, Longbow, Fire Staff (see §10) |
| **Armor** | Defensive stat | Leather Vest, Plate Mail, Cloak of Speed |
| **Trinket** | Utility bonus | Spring Boots, Thornmail, Vampiric Ring, Lucky Coin |

### 12.3 Armor Items

| Item | Effect | Cost |
|---|---|---|
| **Leather Vest** | +10 HP | 4 Iron, 3 Emberwood |
| **Plate Mail** | +30 HP, −10% move speed | 10 Iron, 5 Emberwood |
| **Cloak of Speed** | +1 m/s move speed | 5 Iron, 5 Emberwood |
| **Runed Vestments** | +15 HP, +5% ability damage | 6 Iron, 3 Emberwood, 1 Godshard |

### 12.4 Trinket Items

| Item | Effect | Cost |
|---|---|---|
| **Spring Boots** | −1s on dash cooldown | 5 Iron, 5 Emberwood |
| **Thornmail** | Reflect 20% melee damage taken | 6 Iron, 5 Emberwood, 1 Godshard |
| **Vampiric Ring** | 5% lifesteal on basic attacks | 5 Emberwood, 2 Godshard |
| **Lucky Coin** | +10% resource gather rate | 8 Iron, 2 Godshard |
| **Swift Charm** | +0.5 m/s move speed, −5% HP | 4 Iron, 4 Emberwood |

### 12.5 Shop UX

- **Location**: Shop building inside team base (next to Forge and Vault)
- **Interface**: grid of items, filtered by slot, sorted by cost
- **Purchase flow**: click item → confirm → item appears in inventory → equip in loadout screen
- **Refund**: items can be refunded within 30s of purchase for full resources back (prevents misclicks)
- **No stock limits**: items don't run out; multiple players can buy the same item

### 12.6 Personal vs. Team Resources

This is the key economic tension:

- **Personal inventory** (cap: 20 of each resource): resources you've harvested but not deposited
- **Team Vault** (cap: 100/200/500 per level): resources donated by players for structures

**Players choose**: deposit resources to help the team build, OR keep them to buy personal items.

**Strategic implications**:
- A selfish player buys strong items but the team base stays weak
- A team-focused player donates everything but fights with starting gear
- The optimal is a balance — and it varies by match situation
- Leader can request donations via a "Donate" prompt (one-click accept for players)

### 12.7 Starter Loadout

Every player spawns with a basic loadout, free, no purchase required:

- Iron Sword / Shortbow / Fire Staff (matching their class)
- Leather Vest
- (No trinket — must be purchased)

This ensures no player is ever truly "naked" — even freshly spawned, they're combat-viable. Items are **upgrades**, not requirements.

---

## 13. Base & Buildings

### 13.1 Building Permission System

**Original plan**: only Leader can build.
**Revised plan**: Leader + Builder role.

**How it works**:

| Role | Who | Build access |
|---|---|---|
| **Leader** | Elected per session | Full: place, upgrade, demolish |
| **Builder** | Players granted role by Leader | Full: place, upgrade, demolish |
| **Member** | Default for all other players | Cannot build, can request Builder role |

**Request flow**:
1. Non-builder opens build menu → sees "Request Builder Role" button
2. Click → Leader gets a notification: *"Player X requests Builder role. Approve / Deny"*
3. Leader clicks → role granted/revoked instantly
4. Builder role persists for the session (no per-action approval)

**Why this works**:
- Leader retains strategic control (only they grant the role)
- Active builders don't get micro-managed (no per-structure approval)
- Reduces leader cognitive load (delegate building to trusted players)
- All build actions logged (leader can review at any time)

### 13.2 Core Structures (Always Present)

| Structure | Level 1 Effect | Level 2 Effect | Level 3 Effect |
|---|---|---|---|
| **Nexus** | Team respawn point | +20% gather speed in 30m radius | +10% HP to all allies in 30m |
| **Vault** | Stores 100 of each resource | 200 cap | 500 cap |
| **Shop** | Buy basic items | Buy rare items | Buy epic items |
| **Barracks** | Class swap | Ability training (swap unlocked abilities) | 2nd loadout slot (save a preset) |
| **Forge** | Repair gear (free, 5s) | Repair gear (instant) | Upgrade items (+5% stat, one-time per item) |

### 13.3 Placeable Structures (Built by Leader/Builders)

| Structure | L1 Stats | L2 Stats | L3 Stats | Cost (L1) |
|---|---|---|---|---|
| **Wall** (segment, 4m) | 200 HP | 400 HP, +50% range block | 800 HP, reflects 10% melee | 5 Iron |
| **Turret** (arrow) | 15 dmg, 1s CD, 15m range | 25 dmg, 0.8s CD | 35 dmg, +30% slow on hit | 20 Iron, 10 Emberwood |
| **Watchtower** | Vision 20m radius | 30m, reveals stealth | 40m, alerts team of enemies in radius | 10 Emberwood |
| **Healing Ward** | Heal 5 HP/s in 5m radius | 10 HP/s | 15 HP/s + cleanse on enter | 5 Emberwood, 2 Godshard |
| **Trap** (hidden) | 30 dmg snare 1s | 50 dmg snare 2s | 70 dmg snare 2s + reveal | 3 Iron, 1 Godshard |

### 13.4 Upgrade Costs

| Structure | L1 → L2 | L2 → L3 |
|---|---|---|
| Nexus | 50 Iron, 20 Emberwood | 100 Iron, 50 Emberwood, 10 Godshard |
| Vault | 30 Iron | 80 Iron, 20 Godshard |
| Shop | 40 Iron, 20 Emberwood | 60 Iron, 30 Emberwood, 15 Godshard |
| Barracks | 30 Emberwood | 50 Emberwood, 10 Godshard |
| Forge | 25 Iron, 15 Emberwood | 40 Iron, 25 Emberwood, 5 Godshard |
| Wall | 10 Iron (per segment) | 20 Iron, 2 Godshard (per segment) |
| Turret | 40 Iron | 60 Iron, 5 Godshard |
| Watchtower | 20 Emberwood | 30 Emberwood, 2 Godshard |
| Healing Ward | 5 Emberwood, 2 Godshard | 8 Emberwood, 4 Godshard |
| Trap | 3 Iron, 2 Godshard | 5 Iron, 3 Godshard |

### 13.5 Construction Rules

- **Placement**: free placement within base radius (50m of Nexus). Cannot place in enemy territory or Frontier.
- **Construction time**: 1 min (small structures) to 5 min (Nexus upgrade)
- **Vulnerable during construction**: structure has 50% HP while building
- **Offline completion**: construction continues during server downtime (time-based, see offline simulation)
- **Demolish**: Leader/Builders can demolish for 50% resource refund

### 13.6 Structure Destruction

- Enemy raiders can destroy structures (must reduce HP to 0)
- Destroyed structures drop 25% of their build cost as resources (claimable by either team)
- Nexus destruction = match win for raiders (or, in non-raid context, triggers 5-minute "Nexus respawns" invulnerability)

---

## 14. Economy & Resource Flow

### 14.1 Resource Nodes

| Node | HP | Harvest Time | Yield | Respawn Time |
|---|---|---|---|---|
| Iron Deposit | 100 | 2s per hit × 3 hits | 3 Iron | 5 min |
| Emberwood Tree | 50 | 1.5s per hit × 3 hits | 2 Emberwood | 8 min |
| Godshard Crystal | 150 | 3s per hit × 5 hits | 1 Godshard | 15 min |

### 14.2 Resource Flow Diagram

```
                ┌─────────────────────┐
                │   Resource Node     │
                │  (Iron/Emberwood/   │
                │      Godshard)      │
                └──────────┬──────────┘
                           │ Player harvests
                           ▼
                ┌─────────────────────┐
                │  Player Inventory   │
                │   (cap: 20 each)    │
                └──────────┬──────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       (Donate to Vault)         (Keep for Shop)
              │                         │
              ▼                         ▼
   ┌──────────────────┐        ┌──────────────────┐
   │   Team Vault     │        │   Player Shop    │
   │ (cap: 100/200/   │        │   Purchases      │
   │      500)        │        │   (instant)      │
   └────────┬─────────┘        └──────────────────┘
            │
            │ Leader/Builder spends
            ▼
   ┌──────────────────┐
   │  Base Structures │
   │  (walls, turret, │
   │   Nexus, etc.)   │
   └──────────────────┘
```

### 14.3 Personal Inventory Cap

- **Cap**: 20 of each resource (60 total slots)
- **Why cap**: forces harvesters to make trips back to base, creating "harvest routes" and raider targets
- **Full inventory**: visual indicator (backpack icon glows)
- **Drop on death**: 50% of carried resources drop on death (either team can pick up)

### 14.4 Donation System

- Players walk to Vault → press "Donate" → choose amount → resources move from personal inventory to Vault
- **Quick donate**: "Donate All" button (one click)
- **Leader requests**: Leader can broadcast "Need 20 Iron for walls" → players get a one-click accept prompt
- **Donation tracking**: leaderboard tracks who donated most (cosmetic reward for top donor each season)

### 14.5 Steal Mechanic (Recap)

- Raiders can steal up to 30% of enemy Vault's current contents
- Stolen resources go to personal inventory (overrides cap while carrying)
- Movement penalty: −30% move speed while carrying stolen goods
- Bank at home Vault to "launder" — now they're team resources
- If killed en route, dropped resources are claimable by either team

### 14.6 Economy Balance Targets

- **Average player income**: 30 Iron + 15 Emberwood + 1 Godshard per 10 min of harvesting
- **Average match spend**: ~50 Iron + 25 Emberwood + 2 Godshard per player per session (gear + donations)
- **Nexus L2 cost (50 Iron + 20 Emberwood)**: requires ~2 players harvesting for 10 min, OR one raid stealing 30% of enemy Vault
- **Godshard scarcity**: 1 Godshard per 15 min harvesting per node; only ~5 nodes on map → ~20 Godshard/hour enter the economy total. Forces hard choices.

These numbers will be tuned in playtesting. Goal: a 30-min session feels rewarding; a 2-hour session doesn't trivialize progression.

---

## 15. Combat Math & Balance

### 15.1 TTK Target: 4–6 seconds

- **Mini Militia**: ~1–2s TTK (too fast for abilities)
- **AoV**: ~5–8s TTK (good for ability combat)
- **Hearth & Havoc**: 4–6s TTK (sweet spot — long enough to outplay, short enough to feel snappy)

### 15.2 Damage Math

| Class | HP | Avg DPS taken to kill |
|---|---|---|
| Warrior | 130 | 5.2s |
| Ranger | 90 | 3.6s |
| Mage | 70 | 2.8s |

### 15.3 Defensive Options (Skill Expression)

| Option | Classes | Effect |
|---|---|---|
| **Dash** | All | 4m dash, 3s CD. Dodges projectiles. |
| **Block** | Warrior only | Hold right-click. −70% frontal damage. Cannot move. Bait enemy attacks. |
| **Cover** | All | Walls/terrain block projectiles. Line of sight breaks ranged aggro. |
| **Healing Ward** | All (placed by builders) | Heal 5–15 HP/s in 5m radius. Static, destroyable. |
| **Smoke Arrow** | Ranger ability | Blocks vision. Escape tool. |

### 15.4 Crits & Headshots

| Attack type | Crit? | Multiplier |
|---|---|---|
| Melee basic attack | No | — |
| Ranged basic attack | Yes (headshot) | 1.5× damage |
| Abilities | No | — |
| Trap damage | No | — |

Ranged headshots are the only crit. This rewards aim without making melee feel bad.

### 15.5 Snowball Prevention

| Mechanic | How it works |
|---|---|
| **No XP/gold per kill** | Kills are tactical (remove a defender), not snowballing |
| **Death grants 5s spawn protection** | No instant re-ganks at base |
| **Raid cooldown** | 5 min between raids. Prevents relentless pressure. |
| **Rubber-band buff** | +10% gather speed when 30%+ behind. +10% structure damage when 50%+ behind. |
| **Defender advantage** | Raiders get −5% move speed in enemy territory. Defender respawns: 5s. Raider respawns: 10s. |
| **Item refunds** | 30s refund window prevents wasted resources from bad decisions |

### 15.6 Class Balance Targets

| Matchup | Win rate (target) |
|---|---|
| Warrior vs. Ranger | 45/55 (Ranger favored) |
| Warrior vs. Mage | 55/45 (Warrior favored) |
| Ranger vs. Mage | 50/50 |
| Mirror match | 50/50 |

These will be tracked per match and tuned via weapon/ability config changes (no engine changes).

---

## 16. Match Flow

### 16.1 Player Session Lifecycle

```
1. Open game
   ↓
2. See team hub
   - Which team they're on (Solari/Lunari)
   - Base status (Nexus level, Vault contents, active structures)
   - Online teammates
   - Current leader
   - Active raids (incoming/outgoing)
   ↓
3. Spawn at team Nexus
   ↓
4. Choose activity (free to switch any time, no queue):
   a. HARVEST — walk to resource node, gather, return to Vault
   b. BUILD — open build menu (if Leader/Builder) or donate resources
   c. SHOP — open Shop, buy items, equip loadout
   d. RAID — declare raid (if Leader) or join pending raid
   e. DEFEND — if base is under attack, automatically join defense
   f. PvE — hunt Riftspawn in the Frontier
   ↓
5. Play activity. Die → respawn at Nexus after 5s.
   ↓
6. Repeat until friends leave.
   ↓
7. Log off. World persists. Offline simulation runs while server is off.
```

### 16.2 Raid Flow (Main PvP Event)

```
1. Leader declares raid on enemy base
   - 5 min cooldown since last raid
   - Pick target: "Steal resources" or "Destroy structure" (Nexus = match win)
   - Pick duration: 5 / 10 / 15 / 20 min
   ↓
2. 30-second preparation phase
   - All Solari raiders gather at base
   - Open Shop, swap loadouts, equip abilities
   - Portal opens at Solari Nexus → enemy territory
   ↓
3. Combat phase (timer counts down)
   - Raiders enter portal → 15s walk to enemy base
   - Fight defenders, destroy structures, steal from Vault
   - Death: respawn at home Nexus after 10s, can re-enter portal
   - Win condition met early? Combat ends.
   ↓
4. End phase (15s return window)
   - Survivors flee through return portal
   - Stolen resources banked at home Vault
   - Combat stats recorded (kills, structures destroyed, resources stolen)
   ↓
5. 5 min cooldown before next raid
```

### 16.3 Defense Flow

When your base is raided:
- All online team members get alert: *"Enemy raid incoming! Target: [structure name]"*
- 30s warning before raiders arrive (time to position defenders, swap to defensive loadouts)
- Defenders spawn at Nexus (5s respawn, vs. 10s for raiders)
- Home advantage: turrets, walls, healing wards all help
- Defenders win if they survive the timer, OR kill all raiders

### 16.4 Sample 10-Minute Session

```
Min 0:00  - 3 friends join Solari, 1 joins Lunari
Min 0:30  - Solari elects Leader (vote)
Min 1:00  - 2 Solari go harvest (Iron + Emberwood)
           1 Solari crafts at Shop (buys Plate Mail)
Min 2:00  - Solari Leader upgrades Vault to L2 (30 Iron)
Min 3:00  - 1 Solari miner deposits 18 Iron, sees enemy scout near node
Min 3:30  - Solari Leader declares raid on Lunari base (10 min, steal resources)
Min 4:00  - 3 Solari enter portal to Lunari base
Min 4:30  - Combat starts. Lunari defender spawns.
Min 6:00  - Solari steal 12 Godshard, lose 1 player (respawns at home, re-enters portal)
Min 7:00  - Solari retreat through portal, raid ends (most resources stolen)
Min 8:00  - Solari bank stolen Godshard, queue Godshard Wall upgrade
Min 9:00  - Solari Warrior buys Vampiric Ring at Shop
Min 10:00 - Session ends, friends log off
           - World persists. Server stays up. Offline sim runs when laptop sleeps.
```

---

## 17. Strategic Depth

### 17.1 Per-Session Decisions (Player)

| Decision | Options | Tradeoff |
|---|---|---|
| Team to join | Solari / Lunari | Loyalty vs. balance (game shows imbalance) |
| Class to play | Warrior / Ranger / Mage | Comfort vs. team comp |
| Activity focus | Harvest / Build / Shop / Raid / Defend / PvE | Personal progress vs. team needs |
| Loadout | Weapon + armor + trinket + ability | DPS vs. survivability vs. utility |
| Donate vs. keep | Vault vs. personal | Team strength vs. personal power |

### 17.2 Leader Decisions (High Impact)

| Decision | Tradeoff |
|---|---|
| Build walls vs. turrets vs. upgrade Nexus | Defense depth vs. damage vs. economy |
| Save resources for next raid vs. spend now | Long-term vs. short-term power |
| When to declare raid | Strike when enemy weak vs. risk losing resources if you fail |
| Mark raid target | Vault (resources) vs. Nexus (win) vs. Shop (deny economy) |
| Call retreat | Save raiders vs. push for objective |
| Grant Builder role | Delegate building vs. retain control |
| Resource donation requests | Push for a big upgrade vs. let players gear up |

### 17.3 Strategic Map Layer

- **Capturable resource camps** (see §7.6) — 3 camps in Frontier, generate passive resources for owning team
- **Rift nest clearing** — destroying nests permanently secures safe harvesting in that area (until respawn)
- **Frontier scouting** — Watchtower placement reveals enemy movement, enabling intercepts

### 17.4 Long-Term Strategic Questions (Per-Week)

- Do we rush Nexus L3 (massive team buff) or spread upgrades across structures?
- Do we stockpile Godshard for a big raid push, or spend it on Healing Wards for defense?
- Do we defend our camps in Frontier, or sacrifice them to focus on base defense?
- Do we hunt the weekly Rift Maw boss together with the enemy (truce), or fight them for the kill?

### 17.5 Emergent Stories

The combination of these systems should generate memorable moments:

- *"Remember when we snuck through the South River with 15 Godshard, and their Ranger ambushed us at the bridge?"*
- *"Remember when Leader placed a trap at our Vault and the raider walked right into it?"*
- *"Remember when both teams called a truce to fight the Rift Maw, then immediately turned on each other for the loot?"*
- *"Remember when our Warrior held the North Pass solo against 3 raiders while we finished upgrading the Nexus?"*

These stories are the goal. If playtest sessions generate them, the design works.

---

## 18. Progression & Cosmetics

### 18.1 Design Rule: No Power Progression

A friend joining in month 6 is **combat-equal** to a day-1 player. The only things they lack:

- Ability unlocks (gated behind ~1 hour of play, not 100 hours)
- Cosmetics (pure visual, no stats)
- Game knowledge (acquired through play)

### 18.2 Cosmetic Unlocks

| Cosmetic | How earned |
|---|---|
| **Character skins** | Play 10 matches → 1 free skin. Win 1 raid → 1 free skin. |
| **Weapon skins** | Craft at Forge (L3) using 5 Godshard. Same stats, different model. |
| **Base themes** | Win 10 defenses. Changes base architecture look. |
| **Titles** | Earned via achievements (see §18.3) |
| **Loading screen cameos** | Random cosmetic for top players each season |

### 18.3 Achievement Titles

| Title | Requirement |
|---|---|
| **Defender of Solari** / **Defender of Lunari** | Win 10 defenses |
| **Rift Slayer** | Kill 100 Riftspawn |
| **Havocbringer** | Win 10 raids |
| **Master Builder** | Place 100 structures (across sessions) |
| **God-Touched** | Land the killing blow on a Rift Maw |
| **Hearthkeeper** | Donate 1000 total resources to team Vault |
| **First of the Name** | Be the first elected Leader (one-time, per faction) |

Titles display next to the player name in the team hub and on the leaderboard.

### 18.4 Leaderboard (Friend Group)

- Tracked per faction and overall
- Categories: matches played, kills, deaths, KDA, resources gathered, raids won, defenses won, Riftspawn killed, donations
- Reset weekly (Sunday 8 PM) — keeps the competition fresh
- All-time stats also tracked separately
- No MMR, no ranked ladder — just friend-group bragging rights

### 18.5 Seasonal Content

Seasons last ~3 months. Each season:

- Adds 2 new weapons, 3 new abilities, 1 new map variant, 1 new Riftspawn type
- Adds a new cosmetic line (themed)
- May include a meta-story advancement (a god stirs, a new Rift opens, a hero rises)
- Top 3 players per faction get a seasonal cosmetic

### 18.6 No Microtransactions. Ever.

The game is for friends. No cash shop. No battle pass. No FOMO. All content is earned through play or granted freely. If a friend can't play for a week, they don't miss anything irreplaceable — seasonal cosmetics rotate back eventually.

---

## 19. Open Items / Future Decisions

Items deferred but to decide before reaching them:

- [ ] **Vehicles / mounts**: Phase 10+. Map is currently walkable; mounts could speed travel but add complexity.
- [ ] **Siege weapons**: Catapults, battering rams for base assaults. Phase 11+.
- [ ] **Weather**: Rain, sandstorms, snow. Visual + minor gameplay (slippery, reduced visibility). Phase 10+.
- [ ] **Pets**: Cosmetic-only followers. Phase 11+.
- [ ] **In-game voice chat**: Currently leaning Discord-only. Revisit if friends want push-to-talk in-game.
- [ ] **Spectator mode**: For friends waiting to join next match. Phase 9+.
- [ ] **Replay system**: Save notable matches. Phase 11+.
- [ ] **Map editor**: In-browser tool to create maps without JSON editing. Phase 12+.
- [ ] **Modding API**: Expose content pipeline to players. Phase 13+.
- [ ] **Third faction**: Possible long-term. Mechanics are symmetric, so addition is feasible. Phase 14+.
- [ ] **Boss roster expansion**: More weekly bosses beyond Rift Maw. Phase 10+.
- [ ] **Quest system**: Daily/weekly objectives for solo play. Phase 11+.
- [ ] **Crafting re-introduction**: If playtest shows players want deeper itemization, add optional crafting on top of Shop. Phase 12+.

---

## 20. Changelog

| Date | Version | Change |
|---|---|---|
| 2026-06-29 | v1.0 | Initial GDD. All 14 design dimensions captured. Decisions locked: Sibling Gods lore, Solari/Lunari factions, 3 unified resources (Iron/Emberwood/Godshard), 3 classes (Warrior/Ranger/Mage), Shop purchasing (not crafting), Leader+Builder permission system, 200×120m map, 4–6s TTK, rubber-band mechanic, cosmetics via play. |
| 2026-06-29 | v1.0.1 | Renamed game from "Hearth & Havoc" to "Rift & Raid". Updated tagline to match. |

---

## How to Update This Document

This GDD is the single source of truth for game content. Update it when:

- A balance number changes (update the relevant table, add changelog entry with rationale)
- A new piece of content is added (weapon, ability, monster, structure, mode, map)
- An open item is resolved (move to the relevant section, remove from §19, add changelog entry)
- A design pillar is added or revised (update §3, add changelog entry)

**Rule**: no code is written for a feature until its design is captured here. This prevents ad-hoc decisions and tech debt.
