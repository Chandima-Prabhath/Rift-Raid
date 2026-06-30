/**
 * Rift & Raid — WorldState
 *
 * Authoritative in-memory world state on the server. Mirrors the persisted
 * state in SQLite but is mutable during a running session.
 *
 * Phase 0: holds factions, resource nodes, structures, monsters, capture points.
 * Phase 4+ adds: raid sessions, active players, NPC schedules.
 */

import type {
  Faction,
  PersistedWorldState,
  PersistedFactionState,
  PersistedResourceNode,
  PersistedStructure,
  PersistedMonster,
  PersistedCapturePoint,
} from '@rift-and-raid/shared';

export interface WorldState {
  lastTickTimestamp: number;
  factions: Record<Faction, PersistedFactionState>;
  resourceNodes: PersistedResourceNode[];
  structures: PersistedStructure[];
  monsters: PersistedMonster[];
  capturePoints: PersistedCapturePoint[];
}

export function createDefaultWorldState(now: number): WorldState {
  const solariBase = { x: -80, y: 0, z: -40 } as const;
  const lunariBase = { x: 80, y: 0, z: -40 } as const;

  const state: WorldState = {
    lastTickTimestamp: now,
    factions: {
      solari: {
        faction: 'solari',
        vault: { iron: 50, emberwood: 30, godshard: 5 },
        vaultLevel: 1,
        nexusLevel: 1,
        shopLevel: 1,
        barracksLevel: 1,
        forgeLevel: 1,
        leader: undefined,
        builders: [],
      },
      lunari: {
        faction: 'lunari',
        vault: { iron: 50, emberwood: 30, godshard: 5 },
        vaultLevel: 1,
        nexusLevel: 1,
        shopLevel: 1,
        barracksLevel: 1,
        forgeLevel: 1,
        leader: undefined,
        builders: [],
      },
    },
    resourceNodes: [],
    structures: [],
    monsters: [],
    capturePoints: [],
  };

  // Seed initial resource nodes.
  // Solari side (west) — Iron-rich.
  for (let i = 0; i < 4; i++) {
    state.resourceNodes.push({
      id: `iron_solari_${i}`,
      type: 'iron',
      position: { x: -60 - Math.random() * 20, y: 0, z: -40 + (Math.random() - 0.5) * 60 },
      hp: 100, maxHp: 100,
      lastHarvestedAt: now,
      respawnMs: 5 * 60 * 1000,
      depleted: false,
    });
  }
  // Solari side — Emberwood.
  for (let i = 0; i < 3; i++) {
    state.resourceNodes.push({
      id: `ember_solari_${i}`,
      type: 'emberwood',
      position: { x: -50 - Math.random() * 30, y: 0, z: -40 + (Math.random() - 0.5) * 60 },
      hp: 50, maxHp: 50,
      lastHarvestedAt: now,
      respawnMs: 8 * 60 * 1000,
      depleted: false,
    });
  }
  // Lunari side (east) — mirror.
  for (let i = 0; i < 4; i++) {
    state.resourceNodes.push({
      id: `iron_lunari_${i}`,
      type: 'iron',
      position: { x: 60 + Math.random() * 20, y: 0, z: -40 + (Math.random() - 0.5) * 60 },
      hp: 100, maxHp: 100,
      lastHarvestedAt: now,
      respawnMs: 5 * 60 * 1000,
      depleted: false,
    });
  }
  for (let i = 0; i < 3; i++) {
    state.resourceNodes.push({
      id: `ember_lunari_${i}`,
      type: 'emberwood',
      position: { x: 50 + Math.random() * 30, y: 0, z: -40 + (Math.random() - 0.5) * 60 },
      hp: 50, maxHp: 50,
      lastHarvestedAt: now,
      respawnMs: 8 * 60 * 1000,
      depleted: false,
    });
  }
  // Frontier (center) — Godshard-rich.
  for (let i = 0; i < 5; i++) {
    state.resourceNodes.push({
      id: `godshard_frontier_${i}`,
      type: 'godshard',
      position: { x: (Math.random() - 0.5) * 30, y: 0, z: -40 + (Math.random() - 0.5) * 80 },
      hp: 150, maxHp: 150,
      lastHarvestedAt: now,
      respawnMs: 15 * 60 * 1000,
      depleted: false,
    });
  }

  // Seed starting bases (Nexus + Vault + Shop per faction).
  for (const faction of ['solari', 'lunari'] as Faction[]) {
    const base = faction === 'solari' ? solariBase : lunariBase;
    state.structures.push({
      id: `${faction}_nexus`,
      configId: 'nexus',
      faction,
      position: base,
      rotation: 0,
      level: 1,
      hp: 1000,
      constructionStartedAt: now,
      constructionComplete: true,
    });
    state.structures.push({
      id: `${faction}_vault`,
      configId: 'vault',
      faction,
      position: { x: base.x + (faction === 'solari' ? 8 : -8), y: 0, z: base.z + 5 },
      rotation: 0,
      level: 1,
      hp: 500,
      constructionStartedAt: now,
      constructionComplete: true,
    });
    state.structures.push({
      id: `${faction}_shop`,
      configId: 'shop',
      faction,
      position: { x: base.x + (faction === 'solari' ? -8 : 8), y: 0, z: base.z + 5 },
      rotation: 0,
      level: 1,
      hp: 400,
      constructionStartedAt: now,
      constructionComplete: true,
    });
  }

  // Seed 3 capture points in frontier.
  state.capturePoints.push({
    id: 'cp_watchtower',
    configId: 'cp_watchtower',
    position: { x: 0, y: 0, z: -50 },
    ownerFaction: 'solari', // pre-owned for demo: passive resource gen during offline sim
    captureProgress: 1,
    lastCapturedAt: now - 3600_000, // captured 1h ago
  });
  state.capturePoints.push({
    id: 'cp_mine',
    configId: 'cp_mine',
    position: { x: 0, y: 0, z: -30 },
    ownerFaction: 'lunari', // pre-owned for demo
    captureProgress: 1,
    lastCapturedAt: now - 3600_000,
  });
  state.capturePoints.push({
    id: 'cp_shrine',
    configId: 'cp_shrine',
    position: { x: 0, y: 0, z: -40 },
    ownerFaction: null,
    captureProgress: 0,
    lastCapturedAt: 0,
  });

  // Deplete one solari-side iron node and one godshard node so we can
  // verify the respawn simulation works.
  if (state.resourceNodes.length > 0) {
    state.resourceNodes[0].depleted = true;
    state.resourceNodes[0].hp = 0;
    state.resourceNodes[0].lastHarvestedAt = now; // will respawn in 5 min
  }
  const godshardNode = state.resourceNodes.find(n => n.type === 'godshard');
  if (godshardNode) {
    godshardNode.depleted = true;
    godshardNode.hp = 0;
    godshardNode.lastHarvestedAt = now; // will respawn in 15 min
  }

  // Add one structure that is mid-construction (60s build time) so the
  // completion simulation has something to verify.
  state.structures.push({
    id: 'solari_wall_wip',
    configId: 'wall_stone',
    faction: 'solari',
    position: { x: -75, y: 0, z: -38 },
    rotation: 0,
    level: 1,
    hp: 100, // half HP while building
    constructionStartedAt: now, // will complete in 60s
    constructionComplete: false,
  });

  return state;
}

/** Serialize WorldState → PersistedWorldState (1:1 in Phase 0). */
export function toPersisted(state: WorldState): PersistedWorldState {
  return {
    lastTickTimestamp: state.lastTickTimestamp,
    factions: state.factions,
    resourceNodes: state.resourceNodes,
    structures: state.structures,
    monsters: state.monsters,
    capturePoints: state.capturePoints,
  };
}

/** Deserialize PersistedWorldState → WorldState (1:1 in Phase 0). */
export function fromPersisted(persisted: PersistedWorldState): WorldState {
  return {
    lastTickTimestamp: persisted.lastTickTimestamp,
    factions: persisted.factions,
    resourceNodes: persisted.resourceNodes,
    structures: persisted.structures,
    monsters: persisted.monsters,
    capturePoints: persisted.capturePoints,
  };
}
