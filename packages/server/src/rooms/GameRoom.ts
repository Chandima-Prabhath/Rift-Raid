/**
 * Rift & Raid — GameRoom (Colyseus)
 *
 * The authoritative server room. Each connected client is a player. The room:
 *   - Maintains the canonical GameState (Colyseus schema)
 *   - Receives input messages from clients (move, attack, dash, chat, etc.)
 *   - Applies inputs to player state (server-authoritative movement)
 *   - Broadcasts state to all clients every tick (Colyseus handles diffing)
 *
 * Phase 2 scope: basic movement sync + chat. Combat sync comes in Phase 3.
 *
 * Architecture:
 *   - Server holds a simple player map (sessionId → PlayerState).
 *   - No ECS on server yet (Phase 3+); movement is direct field mutation.
 *   - Server ticks at 20Hz (50ms) — clients interpolate between updates.
 */

import { Room, Client } from '@colyseus/core';
import {
  GameState,
  PlayerState,
  CLASS_STATS,
  PLAYER_DEFAULTS,
  WORLD_SIZE,
  type CharacterClass,
  type Faction,
} from '@rift-and-raid/shared';

// ============================================================================
// Input message types (client → server)
// ============================================================================

interface MoveInput {
  /** Input sequence number (for client reconciliation). */
  sequence: number;
  /** Normalized movement direction (-1..1 each axis). */
  moveX: number;
  moveZ: number;
  /** Aim world position. */
  aimX: number;
  aimZ: number;
  /** Sprint held? */
  sprint: boolean;
}

interface DashInput {
  directionX: number;
  directionZ: number;
}

interface ClassSwapInput {
  characterClass: CharacterClass;
}

interface ChatInput {
  text: string;
}

// ============================================================================
// Constants
// ============================================================================

const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;
const COLOR_BY_CLASS: Record<CharacterClass, number> = {
  warrior: 0xd97742,
  ranger: 0x60a060,
  mage: 0x9050c0,
};
const SPAWN_POSITIONS = {
  solari: { x: -80, y: 0, z: -40 },
  lunari: { x: 80, y: 0, z: -40 },
};

// ============================================================================
// GameRoom
// ============================================================================

export class GameRoom extends Room<GameState> {
  maxClients = 16; // generous cap for friend group + observers
  private tickAccumulator = 0;
  /** Transient input storage — NOT synced over the wire. */
  private playerInputs = new Map<string, MoveInput>();
  private playerLastDash = new Map<string, number>();

  onCreate(): void {
    console.log('[GameRoom] room created');

    // Initialize state.
    this.setState(new GameState());

    // ── Message handlers ──────────────────────────────────────────────────
    this.onMessage('move', (client: Client, input: MoveInput) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      player.sequence = input.sequence;
      this.playerInputs.set(client.sessionId, input);
    });

    this.onMessage('dash', (client: Client, input: DashInput) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      const now = Date.now();
      const lastDash = this.playerLastDash.get(client.sessionId) ?? 0;
      if (now - lastDash < PLAYER_DEFAULTS.dashCooldownMs) return;
      this.playerLastDash.set(client.sessionId, now);
      player.x += input.directionX * PLAYER_DEFAULTS.dashDistance;
      player.z += input.directionZ * PLAYER_DEFAULTS.dashDistance;
      this.clampPosition(player);
    });

    this.onMessage('class_swap', (client: Client, input: ClassSwapInput) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.characterClass = input.characterClass;
      const stats = CLASS_STATS[input.characterClass];
      player.maxHp = stats.hp;
      player.hp = stats.hp; // full heal on swap (Phase 2 convenience)
      player.color = COLOR_BY_CLASS[input.characterClass];
    });

    this.onMessage('chat', (client: Client, input: ChatInput) => {
      if (!input.text || input.text.length > 200) return; // cap message length
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      // Broadcast chat to everyone in the room (including sender for echo).
      this.broadcast('chat', {
        playerId: client.sessionId,
        name: player.name,
        text: input.text,
        timestamp: Date.now(),
      });
    });

    // ── Start simulation loop ─────────────────────────────────────────────
    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
  }

  onJoin(client: Client, _options?: unknown): void {
    console.log(`[GameRoom] ${client.sessionId} joined`);

    // Pick faction — alternate to keep teams balanced (Phase 6+ adds real
    // team selection UI).
    const playerCount = this.state.players.size;
    const faction: Faction = playerCount % 2 === 0 ? 'solari' : 'lunari';
    const spawn = SPAWN_POSITIONS[faction];

    const player = new PlayerState();
    player.name = `Player ${playerCount + 1}`;
    player.faction = faction;
    player.characterClass = 'warrior';
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.rotation = faction === 'solari' ? 0 : Math.PI; // face center
    player.hp = CLASS_STATS.warrior.hp;
    player.maxHp = CLASS_STATS.warrior.hp;
    player.alive = true;
    player.color = COLOR_BY_CLASS.warrior;

    this.state.players.set(client.sessionId, player);
    console.log(`[GameRoom] ${player.name} spawned at (${player.x}, ${player.z}) as ${faction}`);
  }

  onLeave(client: Client, _consented?: boolean): void {
    const player = this.state.players.get(client.sessionId);
    console.log(`[GameRoom] ${player?.name ?? client.sessionId} left`);
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    this.playerLastDash.delete(client.sessionId);
  }

  onDispose(): void {
    console.log('[GameRoom] room disposed');
  }

  // --------------------------------------------------------------------------
  // Simulation
  // --------------------------------------------------------------------------

  private tick(dt: number): void {
    this.state.tick++;
    this.state.worldTime = Date.now();

    // Apply movement for each player based on their latest input.
    for (const player of this.state.players.values()) {
      if (!player.alive) continue;
      const sessionId = this.findSessionIdByPlayer(player);
      if (!sessionId) continue;
      const input = this.playerInputs.get(sessionId);
      if (!input) continue;

      const speed = CLASS_STATS[player.characterClass as CharacterClass]?.moveSpeed
        ?? PLAYER_DEFAULTS.moveSpeed;
      const sprintMult = input.sprint ? PLAYER_DEFAULTS.sprintMultiplier : 1;
      const moveSpeed = speed * sprintMult;

      player.x += input.moveX * moveSpeed * dt;
      player.z += input.moveZ * moveSpeed * dt;
      this.clampPosition(player);

      // Rotation: face aim point if provided.
      const dx = input.aimX - player.x;
      const dz = input.aimZ - player.z;
      if (Math.hypot(dx, dz) > 0.1) {
        player.rotation = Math.atan2(dx, dz);
      }
    }
  }

  /** Reverse lookup: find sessionId for a given player state. */
  private findSessionIdByPlayer(target: PlayerState): string | null {
    for (const [sessionId, player] of this.state.players.entries()) {
      if (player === target) return sessionId;
    }
    return null;
  }

  private clampPosition(player: PlayerState): void {
    player.x = Math.max(-WORLD_SIZE.width / 2, Math.min(WORLD_SIZE.width / 2, player.x));
    player.z = Math.max(-WORLD_SIZE.depth, Math.min(0, player.z));
  }
}
