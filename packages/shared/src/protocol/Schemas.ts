/**
 * Rift & Raid — Network schemas (Colyseus @colyseus/schema v2)
 *
 * These define the shape of state that the server broadcasts to all clients
 * every tick. Colyseus automatically tracks changes and sends only diffs
 * over the wire — extremely efficient for small games like ours.
 *
 * IMPORTANT: Do NOT use class field initializers (e.g. `name = 'Player'`)
 * on Schema subclasses. The @type/defineTypes machinery defines
 * getters/setters on the prototype, and field initializers overwrite them.
 * Set defaults in the constructor instead.
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
// GameState — root schema, holds all players + room metadata
// ============================================================================

export class GameState extends Schema {
  players!: MapSchema<PlayerState>;
  tick!: number;
  worldTime!: number;

  constructor() {
    super();
    this.players = new MapSchema();
    this.tick = 0;
    this.worldTime = 0;
  }
}

defineTypes(GameState, {
  players: { map: PlayerState },
  tick: 'number',
  worldTime: 'number',
});
