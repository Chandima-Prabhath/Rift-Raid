/**
 * Rift & Raid — Client NetworkSystem (Phase 3)
 *
 * Bridges between:
 *   - Network state (Colyseus schema) → local ECS
 *   - Local player input → Colyseus messages
 *
 * Phase 3 additions:
 *   - Sends attack + ability messages to server (server-authoritative combat)
 *   - Spawns/destroys projectile meshes from server ProjectileState
 *   - Handles death/respawn visual state (hide mesh when dead)
 *   - Forwards kill feed events for UI
 */

import { Client, Room } from 'colyseus.js';
import type * as THREE from 'three';
import type { GameState, PlayerState as SharedPlayerState, ProjectileState as SharedProjectileState } from '@rift-and-raid/shared';
import {
  CLASS_STATS,
  COMBAT,
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

// Client-side state types.
type ClientPlayerState = SharedPlayerState & {
  onChange(cb: () => void): void;
};
type ClientProjectileState = SharedProjectileState & {
  onChange(cb: () => void): void;
};
interface ClientPlayersMap {
  onAdd(cb: (player: ClientPlayerState, sessionId: string) => void, immediate?: boolean): () => void;
  onRemove(cb: (player: ClientPlayerState, sessionId: string) => void): void;
  get(sessionId: string): ClientPlayerState | undefined;
  forEach(cb: (player: ClientPlayerState, sessionId: string) => void): void;
  size: number;
}
interface ClientProjectilesMap {
  onAdd(cb: (proj: ClientProjectileState, projId: string) => void, immediate?: boolean): () => void;
  onRemove(cb: (proj: ClientProjectileState, projId: string) => void): void;
  get(projId: string): ClientProjectileState | undefined;
  forEach(cb: (proj: ClientProjectileState, projId: string) => void): void;
  size: number;
}
type ClientGameState = {
  players: ClientPlayersMap;
  projectiles: ClientProjectilesMap;
  tick: number;
  worldTime: number;
};

export interface NetworkSystemCallbacks {
  /** Spawn a 3D mesh for a player. */
  onPlayerSpawn: (entity: Entity, sessionId: string, isLocal: boolean, color: number) => unknown;
  /** Update a player's mesh (position/rotation/color/visibility). */
  onPlayerUpdate: (entity: Entity, x: number, y: number, z: number, rotation: number, color: number, alive: boolean, hp: number, maxHp: number) => void;
  /** Remove a player's mesh when they disconnect. */
  onPlayerLeave: (entity: Entity, sessionId: string) => void;
  /** Spawn a projectile mesh. */
  onProjectileSpawn: (projId: string, x: number, y: number, z: number, color: number) => void;
  /** Update a projectile mesh. */
  onProjectileUpdate: (projId: string, x: number, y: number, z: number) => void;
  /** Remove a projectile mesh. */
  onProjectileDestroy: (projId: string) => void;
  /** Chat message received. */
  onChat: (payload: { playerId: string; name: string; text: string; timestamp: number }) => void;
  /** A player was killed. */
  onKill: (victimName: string, killerName: string) => void;
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
  private entityBySessionId = new Map<string, Entity>();
  private sessionIdByEntity = new Map<Entity, string>();
  private inputSequence = 0;
  private lastInputSendAt = 0;
  private lastAttackHeld = false;
  private lastAbilityPressed = false;
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

  sendClassSwap(characterClass: CharacterClass): void {
    this.room?.send('class_swap', { characterClass });
  }

  sendChat(text: string): void {
    this.room?.send('chat', { text });
  }

  // --------------------------------------------------------------------------
  // Per-tick update
  // --------------------------------------------------------------------------

  update(_dt: number): void {
    if (!this.room || !this.localSessionId) return;

    const input = this.getInput();

    // Check attack + ability every frame (edge-triggered).
    this.checkAttackInput();
    this.checkAbilityInput(input);

    const now = performance.now();
    if (now - this.lastInputSendAt < this.INPUT_SEND_INTERVAL_MS) {
      return;
    }
    this.lastInputSendAt = now;

    this.inputSequence++;

    this.room.send('move', {
      sequence: this.inputSequence,
      moveX: input.move.x,
      moveZ: input.move.y,
      aimX: input.aim.x,
      aimZ: input.aim.y,
      sprint: input.sprintHeld,
    });

    // Dash.
    if (input.dashPressed) {
      const hasInput = Math.hypot(input.move.x, input.move.y) > 0.1;
      if (hasInput) {
        this.room.send('dash', { directionX: input.move.x, directionZ: input.move.y });
      } else {
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

  private checkAttackInput(): void {
    const input = this.getInput();
    // Send attack on press edge AND while held (server enforces cooldown).
    if (input.attackPressed || input.attackHeld) {
      this.room?.send('attack', { aimX: input.aim.x, aimZ: input.aim.y });
    }
  }

  private checkAbilityInput(input: InputState): void {
    // Ability — edge-triggered (only on press, not hold).
    if (input.abilityPressed && !this.lastAbilityPressed) {
      const localEntity = this.localPlayerEntity;
      if (localEntity) {
        const playerComp = this.world.getComponent(localEntity, PlayerComponent);
        if (playerComp) {
          this.room?.send('ability', {
            abilityId: playerComp.abilityId ?? '',
            aimX: input.aim.x,
            aimZ: input.aim.y,
          });
          console.log(`[Network] Sent ability: ${playerComp.abilityId}`);
        }
      }
    }
    this.lastAbilityPressed = input.abilityPressed;
  }

  // --------------------------------------------------------------------------
  // State listeners
  // --------------------------------------------------------------------------

  private setupStateListeners(): void {
    if (!this.room) return;
    const players = this.room.state.players;
    const projectiles = this.room.state.projectiles;

    players.onAdd((player: ClientPlayerState, sessionId: string) => {
      const isLocal = sessionId === this.localSessionId;
      const entity = this.spawnPlayerEntity(player, isLocal);
      this.entityBySessionId.set(sessionId, entity);
      this.sessionIdByEntity.set(entity, sessionId);
      this.callbacks.onPlayerSpawn(entity, sessionId, isLocal, player.color);
      console.log(`[Network] Player ${player.name} (${sessionId}) ${isLocal ? '[LOCAL]' : '[REMOTE]'} spawned`);

      player.onChange(() => this.syncPlayerToEntity(entity, player));
    });

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

    // Projectile lifecycle.
    projectiles.onAdd((proj: ClientProjectileState, projId: string) => {
      this.callbacks.onProjectileSpawn(projId, proj.x, proj.y, proj.z, proj.color);
    });

    projectiles.onRemove((_proj: ClientProjectileState, projId: string) => {
      this.callbacks.onProjectileDestroy(projId);
    });
  }

  private setupMessageHandlers(): void {
    if (!this.room) return;
    this.room.onMessage('chat', (payload) => {
      this.callbacks.onChat(payload);
    });
    this.room.onMessage('kill', (payload: { victimName: string; killerName: string; timestamp: number }) => {
      this.callbacks.onKill(payload.victimName, payload.killerName);
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
    playerComp.abilityId = player.abilityId || null;
    playerComp.spawnProtectionMs = 0;

    const combat = this.world.addComponent(entity, new CombatTargetComponent());
    combat.attackable = !isLocal;
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
    if (playerComp) {
      if (playerComp.characterClass !== player.characterClass) {
        playerComp.characterClass = player.characterClass;
        const stats = CLASS_STATS[player.characterClass];
        if (health && stats) health.max = stats.hp;
      }
      playerComp.abilityId = player.abilityId || null;
    }

    this.callbacks.onPlayerUpdate(
      entity,
      player.x,
      player.y,
      player.z,
      player.rotation,
      player.color,
      player.alive,
      player.hp,
      player.maxHp
    );
  }
}
