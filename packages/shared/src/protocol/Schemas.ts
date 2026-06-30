/**
 * Rift & Raid — Network schemas (Colyseus @colyseus/schema v2)
 *
 * Uses defineTypes() instead of @type decorators to avoid Bun's
 * decorator compatibility issues.
 *
 * IMPORTANT: tsconfig must have useDefineForClassFields: false to prevent
 * class field declarations from overwriting the schema's getters/setters.
 */

import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

// ============================================================================
// Player — one per connected client
// ============================================================================

export class PlayerState extends Schema {
  name!: string;
  faction!: 'solari' | 'lunari';
  characterClass!: 'warrior' | 'ranger' | 'mage';
  x!: number;
  y!: number;
  z!: number;
  rotation!: number;
  hp!: number;
  maxHp!: number;
  alive!: boolean;
  sequence!: number;
  color!: number;
  diedAt!: number;
  lastAttackAt!: number;
  lastAbilityAt!: number;
  abilityId!: string;
  slowMs!: number;

  constructor() {
    super();
    this.name = 'Player';
    this.faction = 'solari';
    this.characterClass = 'warrior';
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotation = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.sequence = 0;
    this.color = 0xd97742;
    this.diedAt = 0;
    this.lastAttackAt = 0;
    this.lastAbilityAt = 0;
    this.abilityId = '';
    this.slowMs = 0;
  }
}

defineTypes(PlayerState, {
  name: 'string',
  faction: 'string',
  characterClass: 'string',
  x: 'number',
  y: 'number',
  z: 'number',
  rotation: 'number',
  hp: 'number',
  maxHp: 'number',
  alive: 'boolean',
  sequence: 'number',
  color: 'number',
  diedAt: 'number',
  lastAttackAt: 'number',
  lastAbilityAt: 'number',
  abilityId: 'string',
  slowMs: 'number',
});

// ============================================================================
// Projectile — server-authoritative in-flight attack
// ============================================================================

export class ProjectileState extends Schema {
  id!: string;
  ownerId!: string;
  faction!: string;
  damage!: number;
  x!: number;
  y!: number;
  z!: number;
  dx!: number;
  dy!: number;
  dz!: number;
  speed!: number;
  lifetimeMs!: number;
  color!: number;
  pierce!: boolean;

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

defineTypes(ProjectileState, {
  id: 'string',
  ownerId: 'string',
  faction: 'string',
  damage: 'number',
  x: 'number',
  y: 'number',
  z: 'number',
  dx: 'number',
  dy: 'number',
  dz: 'number',
  speed: 'number',
  lifetimeMs: 'number',
  color: 'number',
  pierce: 'boolean',
});

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
  players!: MapSchema<PlayerState>;
  projectiles!: MapSchema<ProjectileState>;
  tick!: number;
  worldTime!: number;

  constructor() {
    super();
    this.players = new MapSchema();
    this.projectiles = new MapSchema();
    this.tick = 0;
    this.worldTime = 0;
  }
}

defineTypes(GameState, {
  players: { map: PlayerState },
  projectiles: { map: ProjectileState },
  tick: 'number',
  worldTime: 'number',
});
