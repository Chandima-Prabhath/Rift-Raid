/**
 * Rift & Raid — Network protocol
 *
 * Message schemas for client↔server communication. Phase 0 stub — Colyseus
 * integration will replace these with @colyseus/schema decorators in Phase 2.
 */

import type {
  CharacterClass,
  EntityId,
  Faction,
  PlayerRole,
  ResourceType,
  Vec3,
} from '../types/index.js';

// ============================================================================
// Client → Server messages
// ============================================================================

export type ClientMessage =
  | { type: 'join';      payload: { playerId: string; faction: Faction; characterClass: CharacterClass } }
  | { type: 'leave';     payload: {} }
  | { type: 'move';      payload: { position: Vec3; velocity: Vec3; sequence: number } }
  | { type: 'attack';    payload: { targetId?: EntityId; aimPoint: Vec3 } }
  | { type: 'ability';   payload: { abilityId: string; aimPoint: Vec3 } }
  | { type: 'dash';      payload: { direction: Vec3 } }
  | { type: 'harvest';   payload: { nodeId: string } }
  | { type: 'deposit';   payload: { resources: Partial<Record<ResourceType, number>> } }
  | { type: 'shop_buy';  payload: { itemId: string } }
  | { type: 'build';     payload: { structureId: string; position: Vec3; rotation: number } }
  | { type: 'build_request_role'; payload: {} }
  | { type: 'build_grant_role';   payload: { playerId: string } }
  | { type: 'raid_declare'; payload: { target: 'vault' | 'nexus' | 'shop' | 'structure'; durationMs: number } }
  | { type: 'raid_join';  payload: { raidId: string } }
  | { type: 'chat';       payload: { text: string; channel: 'team' | 'all' } };

// ============================================================================
// Server → Client messages
// ============================================================================

export type ServerMessage =
  | { type: 'snapshot';      payload: { tick: number; timestamp: number; entities: SnapshotEntity[] } }
  | { type: 'player_state';  payload: { playerId: string; hp: number; class: CharacterClass; faction: Faction; role: PlayerRole; inventory: Record<ResourceType, number> } }
  | { type: 'raid_update';   payload: { raidId: string; status: string; timeRemainingMs: number } }
  | { type: 'event';         payload: { kind: string; data: unknown } }
  | { type: 'chat';          payload: { playerId: string; text: string; channel: 'team' | 'all'; timestamp: number } }
  | { type: 'error';         payload: { code: string; message: string } };

export interface SnapshotEntity {
  id: EntityId;
  type: string;
  position: Vec3;
  velocity?: Vec3;
  rotation?: number;
  hp?: number;
  faction?: Faction;
  // ... per-type extension fields
}

// ============================================================================
// Connection lifecycle
// ============================================================================

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';
