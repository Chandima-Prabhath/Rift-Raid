/**
 * Rift & Raid — Client NetworkSystem
 *
 * Connects to the Colyseus GameRoom and bridges between:
 *   - Network state (Colyseus schema) → local ECS
 *   - Local player input → Colyseus messages
 *
 * Responsibilities:
 *   1. Connect to ws://server/rift-raid room
 *   2. On join: store sessionId, mark local player as "self"
 *   3. On player add (remote): spawn an ECS entity + 3D mesh for them
 *   4. On player remove: destroy the entity + mesh
 *   5. On player state change (position, rotation, hp, class): update ECS
 *   6. Each tick: send local player's input (move/aim/sprint) to server
 *   7. On chat message: forward to chat UI
 *
 * Phase 2: server-authoritative movement (no client prediction).
 *   - Local player sends input → server moves them → state echoes back
 *   - This adds ~50-100ms input latency but is simple and correct.
 *   - Phase 3+ adds client-side prediction + reconciliation for snappier feel.
 */

import { Client, Room } from 'colyseus.js';
import type * as THREE from 'three';
import type { GameState, PlayerState as SharedPlayerState } from '@rift-and-raid/shared';
import {
  CLASS_STATS,
  type CharacterClass,
} from '@rift-and-raid/shared';
import type { World, Entity } from '@rift-and-raid/engine';
import {
  TransformComponent,
  VelocityComponent,
  HealthComponent,
  FactionComponent,
} from '@rift-and-raid/engine';
import {
  PlayerComponent,
  CombatTargetComponent,
  HealthBarComponent,
} from '@rift-and-raid/game';
import type { InputState } from '@rift-and-raid/engine';

// Client-side state types — colyseus.js decodes the schema into instances
// with the same shape as the server-side classes, but the TypeScript types
// differ slightly. We use the shared types as a structural guide and cast
// at the boundary.
type ClientPlayerState = SharedPlayerState & {
  onChange(cb: () => void): void;
};
interface ClientPlayersMap {
  onAdd(cb: (player: ClientPlayerState, sessionId: string) => void, immediate?: boolean): () => void;
  onRemove(cb: (player: ClientPlayerState, sessionId: string) => void): void;
  get(sessionId: string): ClientPlayerState | undefined;
  forEach(cb: (player: ClientPlayerState, sessionId: string) => void): void;
  size: number;
}
type ClientGameState = {
  players: ClientPlayersMap;
  tick: number;
  worldTime: number;
};

export interface NetworkSystemCallbacks {
  /** Spawn a 3D mesh for a remote player. Returns it for later updates. */
  onPlayerSpawn: (entity: Entity, sessionId: string, isLocal: boolean, color: number) => unknown;
  /** Update a remote player's mesh (position/rotation/color). */
  onPlayerUpdate: (entity: Entity, x: number, y: number, z: number, rotation: number, color: number) => void;
  /** Remove a player's mesh when they disconnect. */
  onPlayerLeave: (entity: Entity, sessionId: string) => void;
  /** Chat message received. */
  onChat: (payload: { playerId: string; name: string; text: string; timestamp: number }) => void;
  /** Connection state changed. */
  onConnectionStateChange: (state: string) => void;
}

export class NetworkSystem {
  private client: Client | null = null;
  private room: Room<ClientGameState> | null = null;
  private world: World;
  private serverUrl: string;
  private callbacks: NetworkSystemCallbacks;
  private getInput: () => InputState;
  private localSessionId: string | null = null;
  /** Map from Colyseus sessionId → local ECS entity. */
  private entityBySessionId = new Map<string, Entity>();
  /** Map from ECS entity → Colyseus sessionId (reverse lookup). */
  private sessionIdByEntity = new Map<Entity, string>();
  private inputSequence = 0;
  private lastInputSendAt = 0;
  private readonly INPUT_SEND_INTERVAL_MS = 50; // 20Hz

  constructor(
    world: World,
    serverUrl: string,
    getInput: () => InputState,
    callbacks: NetworkSystemCallbacks
  ) {
    this.world = world;
    this.serverUrl = serverUrl;
    this.getInput = getInput;
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    this.client = new Client(this.serverUrl);
    this.callbacks.onConnectionStateChange('connecting');

    try {
      this.room = await this.client.joinOrCreate<ClientGameState>('rift-raid');
      this.localSessionId = this.room.sessionId;
      this.callbacks.onConnectionStateChange('connected');
      console.log(`[Network] Connected. sessionId=${this.localSessionId}`);

      this.setupStateListeners();
      this.setupMessageHandlers();
    } catch (err) {
      console.error('[Network] Failed to connect:', err);
      this.callbacks.onConnectionStateChange('error');
    }
  }

  disconnect(): void {
    this.room?.leave();
    this.room = null;
    this.client = null;
    this.localSessionId = null;
    this.callbacks.onConnectionStateChange('disconnected');
  }

  get isConnected(): boolean {
    return this.room !== null;
  }

  get localPlayerEntity(): Entity | null {
    if (!this.localSessionId) return null;
    return this.entityBySessionId.get(this.localSessionId) ?? null;
  }

  /** Send a class swap message. */
  sendClassSwap(characterClass: CharacterClass): void {
    this.room?.send('class_swap', { characterClass });
  }

  /** Send a chat message. */
  sendChat(text: string): void {
    this.room?.send('chat', { text });
  }

  // --------------------------------------------------------------------------
  // Per-tick update — called from the game loop
  // --------------------------------------------------------------------------

  update(_dt: number): void {
    if (!this.room || !this.localSessionId) return;

    // Send local player input at 20Hz.
    const now = performance.now();
    if (now - this.lastInputSendAt < this.INPUT_SEND_INTERVAL_MS) return;
    this.lastInputSendAt = now;

    const input = this.getInput();
    this.inputSequence++;

    this.room.send('move', {
      sequence: this.inputSequence,
      moveX: input.move.x,
      moveZ: input.move.y,
      aimX: input.aim.x,
      aimZ: input.aim.y,
      sprint: input.sprintHeld,
    });

    // Dash (edge-triggered).
    if (input.dashPressed) {
      const hasInput = Math.hypot(input.move.x, input.move.y) > 0.1;
      const dir = hasInput
        ? { x: input.move.x, z: input.move.y }
        : null;
      if (dir) {
        this.room.send('dash', { directionX: dir.x, directionZ: dir.z });
      } else {
        // Dash in facing direction — we need the local player's rotation.
        const localEntity = this.localPlayerEntity;
        if (localEntity) {
          const t = this.world.getComponent(localEntity, TransformComponent);
          if (t) {
            this.room.send('dash', {
              directionX: Math.sin(t.rotation),
              directionZ: Math.cos(t.rotation),
            });
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // State listeners — called by Colyseus when state changes
  // --------------------------------------------------------------------------

  private setupStateListeners(): void {
    if (!this.room) return;
    const players = this.room.state.players;

    // Player added.
    players.onAdd((player: ClientPlayerState, sessionId: string) => {
      const isLocal = sessionId === this.localSessionId;
      const entity = this.spawnPlayerEntity(player, isLocal);
      this.entityBySessionId.set(sessionId, entity);
      this.sessionIdByEntity.set(entity, sessionId);
      this.callbacks.onPlayerSpawn(entity, sessionId, isLocal, player.color);
      console.log(`[Network] Player ${player.name} (${sessionId}) ${isLocal ? '[LOCAL]' : '[REMOTE]'} spawned`);

      // Listen for field changes on this player.
      player.onChange(() => this.syncPlayerToEntity(entity, player));
    });

    // Player removed.
    players.onRemove((_player: ClientPlayerState, sessionId: string) => {
      const entity = this.entityBySessionId.get(sessionId);
      if (entity !== undefined) {
        this.callbacks.onPlayerLeave(entity, sessionId);
        this.world.destroyEntity(entity);
        this.entityBySessionId.delete(sessionId);
        this.sessionIdByEntity.delete(entity);
      }
      console.log(`[Network] Player ${sessionId} left`);
    });
  }

  private setupMessageHandlers(): void {
    if (!this.room) return;
    this.room.onMessage('chat', (payload) => {
      this.callbacks.onChat(payload);
    });
  }

  // --------------------------------------------------------------------------
  // Entity management
  // --------------------------------------------------------------------------

  private spawnPlayerEntity(player: ClientPlayerState, isLocal: boolean): Entity {
    const entity = this.world.createEntity();

    const transform = this.world.addComponent(entity, new TransformComponent());
    transform.x = player.x;
    transform.y = player.y;
    transform.z = player.z;
    transform.rotation = player.rotation;

    this.world.addComponent(entity, new VelocityComponent());

    const health = this.world.addComponent(entity, new HealthComponent());
    health.max = player.maxHp;
    health.current = player.hp;

    const faction = this.world.addComponent(entity, new FactionComponent());
    faction.faction = player.faction;

    const playerComp = this.world.addComponent(entity, new PlayerComponent());
    playerComp.playerId = isLocal ? 'local' : 'remote';
    playerComp.characterClass = player.characterClass;
    playerComp.faction = player.faction;
    playerComp.spawnProtectionMs = 0;

    const combat = this.world.addComponent(entity, new CombatTargetComponent());
    combat.attackable = !isLocal; // can't attack yourself
    combat.faction = player.faction;

    this.world.addComponent(entity, new HealthBarComponent()).targetEntity = entity;

    return entity;
  }

  private syncPlayerToEntity(entity: Entity, player: ClientPlayerState): void {
    const transform = this.world.getComponent(entity, TransformComponent);
    const health = this.world.getComponent(entity, HealthComponent);
    const playerComp = this.world.getComponent(entity, PlayerComponent);

    if (transform) {
      transform.x = player.x;
      transform.y = player.y;
      transform.z = player.z;
      transform.rotation = player.rotation;
    }
    if (health) {
      health.current = player.hp;
      health.max = player.maxHp;
    }
    if (playerComp && playerComp.characterClass !== player.characterClass) {
      playerComp.characterClass = player.characterClass;
      const stats = CLASS_STATS[player.characterClass];
      if (health && stats) {
        health.max = stats.hp;
      }
    }

    this.callbacks.onPlayerUpdate(
      entity,
      player.x,
      player.y,
      player.z,
      player.rotation,
      player.color
    );
  }
}
