/**
 * Rift & Raid — Network schemas (Colyseus @colyseus/schema v2)
 *
 * Uses @type decorators — the only officially supported way to register
 * fields for state synchronization. (defineTypes() exists but does not
 * reliably register fields with the encoder in all runtimes.)
 *
 * IMPORTANT: tsconfig must have:
 *   - experimentalDecorators: true
 *   - useDefineForClassFields: false
 * Otherwise the decorators will not run / class fields will shadow
 * the schema's getters+setters.
 *
 * This file MUST be compiled with `tsc` before being imported by either
 * the server (Bun) or the client (Vite). Both runtimes import from
 * packages/shared/dist/ — never from src/ — to ensure they share the
 * SAME decorator-processed class definitions.
 */

import { Schema, MapSchema, type } from '@colyseus/schema';
import type { Faction, CharacterClass } from '../types/index.js';

// Re-export for convenience (single import for consumers).
export type { Faction, CharacterClass };

// ============================================================================
// Player — one per connected client
// ============================================================================

export class PlayerState extends Schema {
  // Identity
  @type('string') name!: string;
  @type('string') faction!: Faction;
  @type('string') characterClass!: CharacterClass;
  /** GLB model key — see packages/game/assets/characters/. */
  @type('string') characterModel!: string;
  /** Tint applied to the model (faction color). Hex number e.g. 0x4a90e2. */
  @type('number') color!: number;

  // Transform (server-authoritative)
  @type('number') x!: number;
  @type('number') y!: number;
  @type('number') z!: number;
  @type('number') rotation!: number;

  // Health / status
  @type('number') hp!: number;
  @type('number') maxHp!: number;
  @type('boolean') alive!: boolean;
  @type('number') diedAt!: number;
  @type('number') slowMs!: number;

  // Personal resources (carried on player, deposited at vault)
  @type('number') invIron!: number;
  @type('number') invEmberwood!: number;
  @type('number') invGodshard!: number;

  // Ability / cooldown tracking
  @type('string') abilityId!: string;
  @type('number') lastAttackAt!: number;
  @type('number') lastAbilityAt!: number;

  // Network reconciliation
  @type('number') sequence!: number;

  constructor() {
    super();
    // Initialize defaults so the first encode is well-formed.
    this.name = 'Player';
    this.faction = 'solari';
    this.characterClass = 'warrior';
    this.characterModel = 'character-male-a';
    this.color = 0xd97742;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotation = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.diedAt = 0;
    this.slowMs = 0;
    this.invIron = 0;
    this.invEmberwood = 0;
    this.invGodshard = 0;
    this.abilityId = '';
    this.lastAttackAt = 0;
    this.lastAbilityAt = 0;
    this.sequence = 0;
  }
}

// ============================================================================
// Projectile — server-authoritative in-flight attack
// ============================================================================

export class ProjectileState extends Schema {
  @type('string') id!: string;
  @type('string') ownerId!: string;
  @type('string') faction!: string;
  @type('number') damage!: number;
  @type('number') x!: number;
  @type('number') y!: number;
  @type('number') z!: number;
  @type('number') dx!: number;
  @type('number') dy!: number;
  @type('number') dz!: number;
  @type('number') speed!: number;
  @type('number') lifetimeMs!: number;
  @type('number') color!: number;
  @type('boolean') pierce!: boolean;

  constructor() {
    super();
    this.id = '';
    this.ownerId = '';
    this.faction = 'neutral';
    this.damage = 10;
    this.x = 0;
    this.y = 1.2;
    this.z = 0;
    this.dx = 0;
    this.dy = 0;
    this.dz = 1;
    this.speed = 25;
    this.lifetimeMs = 2000;
    this.color = 0xffe060;
    this.pierce = false;
  }
}

// ============================================================================
// ResourceNode — harvestable world resource (iron vein, emberwood tree, godshard crystal)
// ============================================================================

export class ResourceNodeState extends Schema {
  @type('string') id!: string;
  @type('string') resourceType!: string; // 'iron' | 'emberwood' | 'godshard'
  @type('number') x!: number;
  @type('number') y!: number;
  @type('number') z!: number;
  @type('number') hp!: number;
  @type('number') maxHp!: number;
  /** When depleted, this is the timestamp it will respawn. */
  @type('number') respawnAt!: number;

  constructor() {
    super();
    this.id = '';
    this.resourceType = 'iron';
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.hp = 50;
    this.maxHp = 50;
    this.respawnAt = 0;
  }
}

// ============================================================================
// Structure — player-built base structure
// ============================================================================

export class StructureState extends Schema {
  @type('string') id!: string;
  @type('string') structureType!: string; // 'vault' | 'nexus' | 'wall_stone' | 'shop'
  @type('string') faction!: Faction;
  @type('number') x!: number;
  @type('number') y!: number;
  @type('number') z!: number;
  @type('number') rotation!: number;
  @type('number') hp!: number;
  @type('number') maxHp!: number;
  /** Building progress 0..1; 1 = complete. */
  @type('number') buildProgress!: number;
  @type('boolean') built!: boolean;

  constructor() {
    super();
    this.id = '';
    this.structureType = 'wall_stone';
    this.faction = 'solari';
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotation = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.buildProgress = 1;
    this.built = true;
  }
}

// ============================================================================
// TeamVault — per-faction shared resource inventory
// ============================================================================

export class TeamVaultState extends Schema {
  @type('string') faction!: Faction;
  @type('number') iron!: number;
  @type('number') emberwood!: number;
  @type('number') godshard!: number;
  @type('number') level!: number;

  constructor() {
    super();
    this.faction = 'solari';
    this.iron = 0;
    this.emberwood = 0;
    this.godshard = 0;
    this.level = 1;
  }
}

// ============================================================================
// ChatMessage — ephemeral, sent via room.broadcast (not in state)
// ============================================================================

export interface ChatMessagePayload {
  playerId: string;
  name: string;
  text: string;
  timestamp: number;
}

// ============================================================================
// GameState — root schema
// ============================================================================

export class GameState extends Schema {
  @type({ map: PlayerState }) players!: MapSchema<PlayerState>;
  @type({ map: ProjectileState }) projectiles!: MapSchema<ProjectileState>;
  @type({ map: ResourceNodeState }) resourceNodes!: MapSchema<ResourceNodeState>;
  @type({ map: StructureState }) structures!: MapSchema<StructureState>;
  @type({ map: TeamVaultState }) vaults!: MapSchema<TeamVaultState>;
  @type('number') tick!: number;
  @type('number') worldTime!: number;

  constructor() {
    super();
    this.players = new MapSchema();
    this.projectiles = new MapSchema();
    this.resourceNodes = new MapSchema();
    this.structures = new MapSchema();
    this.vaults = new MapSchema();
    this.tick = 0;
    this.worldTime = 0;
  }
}
