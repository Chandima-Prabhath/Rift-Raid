/**
 * Rift & Raid — Shared types
 *
 * Type definitions used by both client and server. Kept in a shared package
 * so the two sides can never drift apart.
 */

// ============================================================================
// Factions
// ============================================================================

export type Faction = 'solari' | 'lunari';

// ============================================================================
// Classes
// ============================================================================

export type CharacterClass = 'warrior' | 'ranger' | 'mage';

// ============================================================================
// Resources
// ============================================================================

export type ResourceType = 'iron' | 'emberwood' | 'godshard';

export interface ResourceInventory {
  iron: number;
  emberwood: number;
  godshard: number;
}

// ============================================================================
// Entities
// ============================================================================

/**
 * Entity ID — opaque integer assigned by the ECS.
 * Negative IDs are reserved for client-side predicted entities.
 */
export type EntityId = number;

export type EntityType =
  | 'player'
  | 'structure'
  | 'resource_node'
  | 'monster'
  | 'projectile'
  | 'item_drop'
  | 'capture_point';

// ============================================================================
// Vectors (serializable; do not use THREE.Vector3 here — shared package must
// stay rendering-agnostic)
// ============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

// ============================================================================
// Roles / Permissions
// ============================================================================

export type PlayerRole = 'leader' | 'builder' | 'member';

// ============================================================================
// Match / Raid
// ============================================================================

export type RaidTargetType = 'vault' | 'nexus' | 'shop' | 'structure';

export type RaidStatus = 'preparing' | 'active' | 'returning' | 'completed' | 'failed';

export interface RaidDeclaration {
  id: string;
  attackerFaction: Faction;
  defenderFaction: Faction;
  target: RaidTargetType;
  durationMs: number;
  startedAt: number;
  status: RaidStatus;
}

// ============================================================================
// Content config types (validated at runtime by ContentRegistry)
// ============================================================================

export interface WeaponConfig {
  id: string;
  name: string;
  class: CharacterClass;
  type: 'melee' | 'ranged';
  damage: number;
  cooldownMs: number;
  range: number;
  special?: string;
  cost: Partial<ResourceInventory>;
  model: string;
  icon: string;
  version: number;
}

export interface AbilityConfig {
  id: string;
  name: string;
  class: CharacterClass;
  description: string;
  cooldownMs: number;
  unlock: 'default' | 'matches_5' | 'raids_won_3';
  effect: {
    type: 'dash' | 'aoe_damage' | 'aoe_slow' | 'projectile_burst' | 'teleport' | 'delayed_aoe';
    damage?: number;
    radius?: number;
    durationMs?: number;
    distance?: number;
    projectileCount?: number;
    delayMs?: number;
  };
  vfx: string;
  version: number;
}

export interface StructureConfig {
  id: string;
  name: string;
  category: 'core' | 'placeable';
  maxLevel: number;
  baseHp: number;
  constructionMs: number;
  effects: Record<number, Record<string, number>>;
  upgradeCost: Record<number, Partial<ResourceInventory>>;
  model: string;
  icon: string;
  version: number;
}

export interface MonsterConfig {
  id: string;
  name: string;
  tier: 'minor' | 'major' | 'elite' | 'boss';
  hp: number;
  damage: number;
  speed: number;
  behavior: 'melee_swarm' | 'ranged_kiter' | 'charger' | 'burrower' | 'boss_multiphase';
  drops: Partial<ResourceInventory>;
  model: string;
  version: number;
}

// ============================================================================
// World state (persisted to SQLite, simulated on boot)
// ============================================================================

export interface PersistedWorldState {
  lastTickTimestamp: number;
  factions: Record<Faction, PersistedFactionState>;
  resourceNodes: PersistedResourceNode[];
  structures: PersistedStructure[];
  monsters: PersistedMonster[];
  capturePoints: PersistedCapturePoint[];
  // Future: world events, seasons, boss schedules
}

export interface PersistedFactionState {
  faction: Faction;
  vault: ResourceInventory;
  vaultLevel: number;
  nexusLevel: number;
  shopLevel: number;
  barracksLevel: number;
  forgeLevel: number;
  leader?: string; // player id
  builders: string[]; // player ids
}

export interface PersistedResourceNode {
  id: string;
  type: ResourceType;
  position: Vec3;
  hp: number;
  maxHp: number;
  lastHarvestedAt: number;
  respawnMs: number;
  depleted: boolean;
}

export interface PersistedStructure {
  id: string;
  configId: string;
  faction: Faction;
  position: Vec3;
  rotation: number;
  level: number;
  hp: number;
  constructionStartedAt: number;
  constructionComplete: boolean;
}

export interface PersistedMonster {
  id: string;
  configId: string;
  position: Vec3;
  hp: number;
  spawnedAt: number;
  nestId?: string;
}

export interface PersistedCapturePoint {
  id: string;
  configId: string;
  position: Vec3;
  ownerFaction: Faction | null;
  captureProgress: number; // 0..1 per faction
  lastCapturedAt: number;
}
