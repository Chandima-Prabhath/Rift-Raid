/**
 * Rift & Raid — Client NetworkSystem (Colyseus 0.16 + schema v3)
 *
 * Bridges between:
 *   - Network state (Colyseus schema) → local ECS
 *   - Local player input → Colyseus messages
 *
 * v3 API notes:
 *   - State callbacks (onChange, onAdd, onRemove) are accessed via a proxy
 *     returned by getDecoderStateCallbacks(room). We use this to register
 *     listeners on the players MapSchema.
 *   - State mutations are read by polling room.state directly each frame
 *     (the proxy callbacks fire on decode, updating the underlying state).
 *
 * Phase 4 additions:
 *   - Per-player state isolation (each PlayerState carries its own inventory)
 *   - Faction-based colors (Solari=orange, Lunari=blue)
 *   - Character model selection (model_swap message)
 *   - Ping measurement (round-trip a 'ping' message every 1s)
 */

import { Client, Room } from 'colyseus.js';
import { getDecoderStateCallbacks } from '@colyseus/schema';
import type * as THREE from 'three';
import type {
  GameState,
  PlayerState as SharedPlayerState,
  ProjectileState as SharedProjectileState,
} from '@rift-and-raid/shared';
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
} from '@rift-and-raid/game';
import type { InputState } from '@rift-and-raid/engine';

// ============================================================================
// Types
// ============================================================================

export interface NetworkSystemCallbacks {
  /** Spawn a 3D mesh for a player. */
  onPlayerSpawn: (entity: Entity, sessionId: string, isLocal: boolean, color: number, characterModel: string) => unknown;
  /** Update a player's mesh (position/rotation/color/visibility). */
  onPlayerUpdate: (
    entity: Entity,
    x: number, y: number, z: number,
    rotation: number,
    color: number,
    alive: boolean,
    hp: number,
    maxHp: number,
    characterModel: string,
    name: string,
    faction: string,
  ) => void;
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
  /** Sound effect triggered by server (networked audio). */
  onSound: (payload: { type: string; x: number; y: number; z: number }) => void;
  /** Connection state changed. */
  onConnectionStateChange: (state: string) => void;
}

// ============================================================================
// NetworkSystem
// ============================================================================

export class NetworkSystem {
  private client: Client | null = null;
  private room: Room<GameState> | null = null;
  private world: World;
  private serverUrl: string;
  private joinOptions: { name?: string; characterModel?: string; characterClass?: CharacterClass; faction?: 'solari' | 'lunari' };
  private callbacks: NetworkSystemCallbacks;
  private getInput: () => InputState;
  private getCameraYaw: () => number;
  private localSessionId: string | null = null;
  private entityBySessionId = new Map<string, Entity>();
  private sessionIdByEntity = new Map<Entity, string>();
  private inputSequence = 0;
  private lastInputSendAt = 0;
  private lastAbilityPressed = false;
  private readonly INPUT_SEND_INTERVAL_MS = 50; // 20Hz

  // Ping measurement
  private ping = 0;
  private lastPingSentAt = 0;
  private pingSequence = 0;

  constructor(
    world: World,
    serverUrl: string,
    getInput: () => InputState,
    callbacks: NetworkSystemCallbacks,
    joinOptions: { name?: string; characterModel?: string; characterClass?: CharacterClass; faction?: 'solari' | 'lunari' } = {},
    getCameraYaw: () => number = () => 0,
  ) {
    this.world = world;
    this.serverUrl = serverUrl;
    this.getInput = getInput;
    this.callbacks = callbacks;
    this.joinOptions = joinOptions;
    this.getCameraYaw = getCameraYaw;
  }

  async connect(): Promise<void> {
    this.client = new Client(this.serverUrl);
    this.callbacks.onConnectionStateChange('connecting');

    try {
      this.room = await this.client.joinOrCreate<GameState>('rift-raid', this.joinOptions);
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

  get localSession(): string | null {
    return this.localSessionId;
  }

  get currentPing(): number {
    return this.ping;
  }

  get playersVisible(): number {
    return this.entityBySessionId.size;
  }

  get projectilesVisible(): number {
    return this.room?.state?.projectiles?.size ?? 0;
  }

  sendClassSwap(characterClass: CharacterClass): void {
    this.room?.send('class_swap', { characterClass });
  }

  sendModelSwap(characterModel: string): void {
    this.room?.send('model_swap', { characterModel });
  }

  sendChat(text: string): void {
    this.room?.send('chat', { text });
  }

  sendHarvest(nodeId: string): void {
    this.room?.send('harvest', { nodeId });
  }

  sendDeposit(): void {
    this.room?.send('deposit', {});
  }

  sendBuild(structureType: string, x: number, z: number, rotation: number): void {
    this.room?.send('build', { structureType, x, z, rotation });
  }

  /** Get the vault state for a faction. */
  getVaultState(faction: string): { iron: number; emberwood: number; godshard: number; level: number } | null {
    if (!this.room) return null;
    const vaults = this.room.state?.vaults;
    if (!vaults) return null;
    const v = vaults.get(faction);
    if (!v) return null;
    return { iron: v.iron, emberwood: v.emberwood, godshard: v.godshard, level: v.level };
  }

  /** Iterate all resource nodes. */
  forEachResourceNode(cb: (node: any, nodeId: string) => void): void {
    if (!this.room) return;
    const nodes = this.room.state?.resourceNodes;
    if (!nodes) return;
    nodes.forEach((n, id) => cb(n, id));
  }

  /** Iterate all structures. */
  forEachStructure(cb: (struct: any, structId: string) => void): void {
    if (!this.room) return;
    const structs = this.room.state?.structures;
    if (!structs) return;
    structs.forEach((s, id) => cb(s, id));
  }

  /** Get the local player's PlayerState (read from room.state). */
  getLocalPlayerState(): SharedPlayerState | null {
    if (!this.room || !this.localSessionId) return null;
    // Guard against state.players being undefined during initial sync.
    const players = this.room.state?.players;
    if (!players) return null;
    return players.get(this.localSessionId) ?? null;
  }

  /** Get a remote player's PlayerState by sessionId. */
  getPlayerState(sessionId: string): SharedPlayerState | null {
    if (!this.room) return null;
    const players = this.room.state?.players;
    if (!players) return null;
    return players.get(sessionId) ?? null;
  }

  /** Iterate all player states. */
  forEachPlayer(cb: (player: SharedPlayerState, sessionId: string) => void): void {
    if (!this.room) return;
    const players = this.room.state?.players;
    if (!players) return;
    players.forEach((p, sid) => cb(p, sid));
  }

  // --------------------------------------------------------------------------
  // Per-tick update
  // --------------------------------------------------------------------------

  update(_dt: number): void {
    if (!this.room || !this.localSessionId) return;

    const input = this.getInput();

    this.checkAttackInput();
    this.checkAbilityInput(input);

    const now = performance.now();
    if (now - this.lastInputSendAt >= this.INPUT_SEND_INTERVAL_MS) {
      this.lastInputSendAt = now;
      this.inputSequence++;

      // Convert input (camera-space) to world-space using camera yaw.
      // This way the server doesn't need to know about the camera — it
      // just applies the world-space moveX/moveZ directly.
      const cameraYaw = this.getCameraYaw();
      const cosY = Math.cos(-cameraYaw);
      const sinY = Math.sin(-cameraYaw);
      const worldMoveX = input.move.x * cosY + input.move.y * sinY;
      const worldMoveZ = -input.move.x * sinY + input.move.y * cosY;

      this.room.send('move', {
        sequence: this.inputSequence,
        moveX: worldMoveX,
        moveZ: worldMoveZ,
        aimX: input.aim.x,
        aimZ: input.aim.y,
        sprint: input.sprintHeld,
      });

      if (input.dashPressed) {
        const hasInput = Math.hypot(input.move.x, input.move.y) > 0.1;
        if (hasInput) {
          this.room.send('dash', { directionX: worldMoveX, directionZ: worldMoveZ });
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

    // Ping measurement (every 1s).
    if (now - this.lastPingSentAt >= 1000) {
      this.lastPingSentAt = now;
      this.pingSequence++;
      this.room.send('ping', { seq: this.pingSequence, t: Date.now() });
    }
  }

  private checkAttackInput(): void {
    const input = this.getInput();
    if (input.attackPressed || input.attackHeld) {
      this.room?.send('attack', { aimX: input.aim.x, aimZ: input.aim.y });
    }
  }

  private checkAbilityInput(input: InputState): void {
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
        }
      }
    }
    this.lastAbilityPressed = input.abilityPressed;
  }

  // --------------------------------------------------------------------------
  // State listeners (v3 API)
  // --------------------------------------------------------------------------

  private setupStateListeners(): void {
    if (!this.room) return;

    // v3: get the callback proxy from the room's decoder.
    const callbacks = getDecoderStateCallbacks((this.room as any)['serializer'].decoder);

    // Players — onAdd fires when a new player joins (or initial state sync).
    callbacks(this.room.state).players.onAdd((player: SharedPlayerState, sessionId: string) => {
      const isLocal = sessionId === this.localSessionId;
      const entity = this.spawnPlayerEntity(player, isLocal);
      this.entityBySessionId.set(sessionId, entity);
      this.sessionIdByEntity.set(entity, sessionId);

      this.callbacks.onPlayerSpawn(
        entity, sessionId, isLocal,
        player.color, player.characterModel,
      );
      console.log(
        `[Network] Player ${player.name} (${sessionId.slice(0, 8)}) ` +
        `${isLocal ? '[LOCAL]' : '[REMOTE]'} spawned — model=${player.characterModel} color=0x${player.color.toString(16)}`
      );

      // Listen for changes on this player.
      callbacks(player).onChange(() => {
        this.syncPlayerToEntity(entity, player);
      });
    });

    callbacks(this.room.state).players.onRemove((_player: SharedPlayerState, sessionId: string) => {
      const entity = this.entityBySessionId.get(sessionId);
      if (entity !== undefined) {
        this.callbacks.onPlayerLeave(entity, sessionId);
        this.world.destroyEntity(entity);
        this.entityBySessionId.delete(sessionId);
        this.sessionIdByEntity.delete(entity);
      }
      console.log(`[Network] Player ${sessionId.slice(0, 8)} left`);
    });

    // Projectiles — onAdd spawns the mesh, onRemove destroys it.
    // Position updates are polled each frame in update() via forEach.
    callbacks(this.room.state).projectiles.onAdd((proj: SharedProjectileState, projId: string) => {
      this.callbacks.onProjectileSpawn(projId, proj.x, proj.y, proj.z, proj.color);
    });

    callbacks(this.room.state).projectiles.onRemove((_proj: SharedProjectileState, projId: string) => {
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

    this.room.onMessage('pong', (payload: { seq: number; t: number }) => {
      this.ping = Date.now() - payload.t;
    });

    this.room.onMessage('sound', (payload: { type: string; x: number; y: number; z: number }) => {
      this.callbacks.onSound(payload);
    });
  }

  // --------------------------------------------------------------------------
  // Entity management
  // --------------------------------------------------------------------------

  private spawnPlayerEntity(player: SharedPlayerState, isLocal: boolean): Entity {
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
    faction.faction = player.faction as 'solari' | 'lunari';

    const playerComp = this.world.addComponent(entity, new PlayerComponent());
    playerComp.playerId = isLocal ? 'local' : 'remote';
    playerComp.characterClass = player.characterClass as CharacterClass;
    playerComp.faction = player.faction as 'solari' | 'lunari';
    playerComp.abilityId = player.abilityId || null;
    playerComp.spawnProtectionMs = 0;
    // Per-player inventory (mirrored from server state for HUD display).
    playerComp.inventory.iron = player.invIron;
    playerComp.inventory.emberwood = player.invEmberwood;
    playerComp.inventory.godshard = player.invGodshard;

    const combat = this.world.addComponent(entity, new CombatTargetComponent());
    combat.attackable = !isLocal;
    combat.faction = player.faction as 'solari' | 'lunari';

    // NOTE: HealthBarComponent is intentionally NOT added here.
    // The NameTag (billboard sprite) handles HP display.
    // The old HealthBarSystem rendered a duplicate 3D HP bar.

    return entity;
  }

  private syncPlayerToEntity(entity: Entity, player: SharedPlayerState): void {
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
        playerComp.characterClass = player.characterClass as CharacterClass;
        const stats = CLASS_STATS[playerComp.characterClass];
        if (health && stats) health.max = stats.hp;
      }
      playerComp.abilityId = player.abilityId || null;
      playerComp.inventory.iron = player.invIron;
      playerComp.inventory.emberwood = player.invEmberwood;
      playerComp.inventory.godshard = player.invGodshard;
    }

    this.callbacks.onPlayerUpdate(
      entity,
      player.x, player.y, player.z,
      player.rotation,
      player.color,
      player.alive,
      player.hp,
      player.maxHp,
      player.characterModel,
      player.name,
      player.faction,
    );
  }
}

// Re-export THREE here so consumers don't need to import three directly.
export type { THREE };
