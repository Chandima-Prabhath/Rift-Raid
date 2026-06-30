/**
 * Rift & Raid — GameRoom (Colyseus 0.16 + schema v3)
 *
 * Server-authoritative game room. Each client joins with a username and
 * (optionally) a chosen character model. The server:
 *   - Assigns factions in alternating order (solari, lunari, solari, ...)
 *   - Applies faction-based color tints to player models
 *   - Tracks per-sessionId inventory (no shared state between players)
 *   - Simulates movement, combat, abilities, death/respawn
 *   - Broadcasts state at 20Hz via setPatchRate
 *
 * Per-player state isolation:
 *   Each PlayerState instance is owned by exactly one sessionId. Mutations
 *   to player.invIron etc. only affect that player's record — there is no
 *   shared global inventory. The TeamVaultState (separate schema) holds
 *   the per-faction shared vault, keyed by faction name.
 */

import { Room, Client } from '@colyseus/core';
import {
  GameState,
  PlayerState,
  ProjectileState,
  TeamVaultState,
  CLASS_STATS,
  PLAYER_DEFAULTS,
  WORLD_SIZE,
  COMBAT,
  ABILITIES,
  type CharacterClass,
  type Faction,
} from '@rift-and-raid/shared';

// ============================================================================
// Input message types (client → server)
// ============================================================================

interface MoveInput {
  sequence: number;
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
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

interface AttackInput {
  aimX: number;
  aimZ: number;
}

interface AbilityInput {
  abilityId: string;
  aimX: number;
  aimZ: number;
}

interface ModelSwapInput {
  characterModel: string;
}

interface JoinOptions {
  name?: string;
  characterModel?: string;
  characterClass?: CharacterClass;
}

// ============================================================================
// Constants
// ============================================================================

const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;

/** Faction colors — applied to character models as tint. */
const FACTION_COLORS: Record<Faction, number> = {
  solari: 0xe07b3a, // warm orange
  lunari: 0x4a90e2, // cool blue
};

/** Distinct class accent (overlaid on faction color for visual variety). */
const CLASS_ACCENT: Record<CharacterClass, number> = {
  warrior: 0xc0392b, // red
  ranger: 0x27ae60, // green
  mage: 0x9b59b6, // purple
};

const ABILITY_BY_CLASS: Record<CharacterClass, string> = {
  warrior: 'charge',
  ranger: 'volley',
  mage: 'frost_nova',
};

const SPAWN_POSITIONS: Record<Faction, { x: number; y: number; z: number }> = {
  solari: { x: -80, y: 0, z: -40 },
  lunari: { x: 80, y: 0, z: -40 },
};

/** Available character models (must match files in packages/game/assets/characters/). */
const AVAILABLE_MODELS = [
  'character-male-a',
  'character-male-b',
  'character-male-c',
  'character-male-d',
  'character-male-e',
  'character-male-f',
  'character-female-a',
  'character-female-b',
  'character-female-c',
  'character-female-d',
  'character-female-e',
  'character-female-f',
];

// ============================================================================
// GameRoom
// ============================================================================

export class GameRoom extends Room<GameState> {
  maxClients = 16;

  /** Transient input storage — NOT synced over the wire. Per-sessionId. */
  private playerInputs = new Map<string, MoveInput>();
  private playerLastDash = new Map<string, number>();
  /** Projectile ID counter. */
  private nextProjectileId = 0;
  /** Track which projectiles have hit which players (for pierce). */
  private projectileHits = new Map<string, Set<string>>();
  /** O(1) reverse lookup: PlayerState → sessionId (avoids O(n) scan each tick). */
  private sessionIdByPlayer = new Map<PlayerState, string>();

  onCreate(): void {
    console.log('[GameRoom] room created');
    this.setState(new GameState());

    // Initialize per-faction vaults.
    const solariVault = new TeamVaultState();
    solariVault.faction = 'solari';
    solariVault.iron = 0;
    solariVault.emberwood = 0;
    solariVault.godshard = 0;
    solariVault.level = 1;
    this.state.vaults.set('solari', solariVault);

    const lunariVault = new TeamVaultState();
    lunariVault.faction = 'lunari';
    lunariVault.iron = 0;
    lunariVault.emberwood = 0;
    lunariVault.godshard = 0;
    lunariVault.level = 1;
    this.state.vaults.set('lunari', lunariVault);

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
      player.hp = stats.hp;
      player.abilityId = ABILITY_BY_CLASS[input.characterClass];
      console.log(`[GameRoom] ${player.name} swapped to ${input.characterClass}`);
    });

    this.onMessage('model_swap', (client: Client, input: ModelSwapInput) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (!AVAILABLE_MODELS.includes(input.characterModel)) {
        console.warn(`[GameRoom] Invalid model: ${input.characterModel}`);
        return;
      }
      player.characterModel = input.characterModel;
      console.log(`[GameRoom] ${player.name} swapped model to ${input.characterModel}`);
    });

    this.onMessage('attack', (client: Client, input: AttackInput) => {
      this.handleAttack(client.sessionId, input);
    });

    this.onMessage('ability', (client: Client, input: AbilityInput) => {
      this.handleAbility(client.sessionId, input);
    });

    this.onMessage('chat', (client: Client, input: ChatInput) => {
      if (!input.text || input.text.length > 200) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.broadcast('chat', {
        playerId: client.sessionId,
        name: player.name,
        text: input.text,
        timestamp: Date.now(),
      });
    });

    // Ping/pong for round-trip latency measurement.
    this.onMessage('ping', (client: Client, payload: { seq: number; t: number }) => {
      client.send('pong', { seq: payload.seq, t: payload.t });
    });

    // dt from Colyseus is in milliseconds; convert to seconds for gameplay.
    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), TICK_MS);
    // Enable state broadcasting at 20Hz (sends diffs to all clients).
    this.setPatchRate(TICK_MS);
  }

  onJoin(client: Client, options?: JoinOptions): void {
    console.log(`[GameRoom] ${client.sessionId} joined`);

    const playerCount = this.state.players.size;
    // Alternate factions: 1st → solari, 2nd → lunari, 3rd → solari, ...
    const faction: Faction = playerCount % 2 === 0 ? 'solari' : 'lunari';
    const spawn = SPAWN_POSITIONS[faction];

    // Parse join options.
    const name = (options?.name && options.name.length > 0 && options.name.length <= 20)
      ? options.name
      : `Player ${playerCount + 1}`;
    const characterModel = options?.characterModel && AVAILABLE_MODELS.includes(options.characterModel)
      ? options.characterModel
      : AVAILABLE_MODELS[playerCount % AVAILABLE_MODELS.length];
    const characterClass: CharacterClass = options?.characterClass ?? 'warrior';

    const player = new PlayerState();
    player.name = name;
    player.faction = faction;
    player.characterClass = characterClass;
    player.characterModel = characterModel;
    player.color = FACTION_COLORS[faction];
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.rotation = faction === 'solari' ? 0 : Math.PI;
    player.hp = CLASS_STATS[characterClass].hp;
    player.maxHp = CLASS_STATS[characterClass].hp;
    player.alive = true;
    player.abilityId = ABILITY_BY_CLASS[characterClass];
    // Per-player inventory starts at 0 — NOT shared with anyone.
    player.invIron = 0;
    player.invEmberwood = 0;
    player.invGodshard = 0;

    this.state.players.set(client.sessionId, player);
    this.sessionIdByPlayer.set(player, client.sessionId);

    console.log(
      `[GameRoom] ${player.name} spawned at (${player.x}, ${player.z}) as ${faction} ` +
      `(model=${characterModel}, color=0x${player.color.toString(16)})`
    );
  }

  onLeave(client: Client, _consented?: boolean): void {
    const player = this.state.players.get(client.sessionId);
    console.log(`[GameRoom] ${player?.name ?? client.sessionId} left`);
    if (player) {
      this.sessionIdByPlayer.delete(player);
    }
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    this.playerLastDash.delete(client.sessionId);
  }

  onDispose(): void {
    console.log('[GameRoom] room disposed');
  }

  // --------------------------------------------------------------------------
  // Attack handling
  // --------------------------------------------------------------------------

  private handleAttack(sessionId: string, input: AttackInput): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive) return;

    const now = Date.now();
    const weaponCooldown = this.getWeaponCooldown(player.characterClass);
    if (now - player.lastAttackAt < weaponCooldown) return;
    player.lastAttackAt = now;

    if (player.characterClass === 'warrior') {
      this.performMeleeAttack(player, input);
    } else {
      this.performRangedAttack(player, input);
    }
  }

  private getWeaponCooldown(cls: CharacterClass): number {
    switch (cls) {
      case 'warrior': return 600;
      case 'ranger': return 700;
      case 'mage': return 1200;
    }
  }

  private getWeaponDamage(cls: CharacterClass): number {
    switch (cls) {
      case 'warrior': return 20;
      case 'ranger': return 16;
      case 'mage': return 25;
    }
  }

  private performMeleeAttack(attacker: PlayerState, input: AttackInput): void {
    const range = 2;
    const damage = this.getWeaponDamage('warrior');
    const arcHalf = COMBAT.meleeArcHalfAngle;

    const dx = input.aimX - attacker.x;
    const dz = input.aimZ - attacker.z;
    const facingRotation = Math.hypot(dx, dz) > 0.1 ? Math.atan2(dx, dz) : attacker.rotation;
    attacker.rotation = facingRotation;
    const facingX = Math.sin(facingRotation);
    const facingZ = Math.cos(facingRotation);

    for (const target of this.state.players.values()) {
      if (target === attacker) continue;
      if (!target.alive) continue;
      if (target.faction === attacker.faction) continue;

      const tdx = target.x - attacker.x;
      const tdz = target.z - attacker.z;
      const distance = Math.hypot(tdx, tdz);
      if (distance > range) continue;

      const dirX = distance > 0 ? tdx / distance : 0;
      const dirZ = distance > 0 ? tdz / distance : 0;
      const dot = facingX * dirX + facingZ * dirZ;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle > arcHalf) continue;

      this.applyDamage(target, damage, attacker);
    }
  }

  private performRangedAttack(attacker: PlayerState, input: AttackInput): void {
    const damage = this.getWeaponDamage(attacker.characterClass);
    const dx = input.aimX - attacker.x;
    const dz = input.aimZ - attacker.z;
    const len = Math.hypot(dx, dz);
    const dirX = len > 0 ? dx / len : Math.sin(attacker.rotation);
    const dirZ = len > 0 ? dz / len : Math.cos(attacker.rotation);
    attacker.rotation = Math.atan2(dirX, dirZ);

    const proj = new ProjectileState();
    proj.id = `proj_${this.nextProjectileId++}`;
    proj.ownerId = this.sessionIdByPlayer.get(attacker) ?? '';
    proj.faction = attacker.faction;
    proj.damage = damage;
    proj.x = attacker.x + dirX * 0.6;
    proj.y = 1.2;
    proj.z = attacker.z + dirZ * 0.6;
    proj.dx = dirX;
    proj.dy = 0;
    proj.dz = dirZ;
    proj.speed = 25;
    proj.lifetimeMs = 3000;
    if (attacker.characterClass === 'mage') {
      proj.color = 0xff8030;
    } else {
      proj.color = 0xffe060;
    }
    proj.pierce = false;

    this.state.projectiles.set(proj.id, proj);
    this.projectileHits.set(proj.id, new Set());
  }

  // --------------------------------------------------------------------------
  // Ability handling
  // --------------------------------------------------------------------------

  private handleAbility(sessionId: string, input: AbilityInput): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive) return;

    const abilityId = input.abilityId || player.abilityId;
    const config = ABILITIES[abilityId as keyof typeof ABILITIES];
    if (!config) return;

    const now = Date.now();
    if (now - player.lastAbilityAt < config.cooldownMs) return;
    player.lastAbilityAt = now;

    console.log(`[GameRoom] ${player.name} uses ability ${abilityId}`);

    switch (abilityId) {
      case 'charge':
        this.abilityCharge(player, input);
        break;
      case 'volley':
        this.abilityVolley(player, input);
        break;
      case 'frost_nova':
        this.abilityFrostNova(player, input);
        break;
    }
  }

  private abilityCharge(player: PlayerState, input: AbilityInput): void {
    const config = ABILITIES.charge;
    const dx = input.aimX - player.x;
    const dz = input.aimZ - player.z;
    const len = Math.hypot(dx, dz);
    const dirX = len > 0 ? dx / len : Math.sin(player.rotation);
    const dirZ = len > 0 ? dz / len : Math.cos(player.rotation);
    player.rotation = Math.atan2(dirX, dirZ);

    player.x += dirX * config.distance;
    player.z += dirZ * config.distance;
    this.clampPosition(player);

    for (const target of this.state.players.values()) {
      if (target === player) continue;
      if (!target.alive) continue;
      if (target.faction === player.faction) continue;
      const tdx = target.x - player.x;
      const tdz = target.z - player.z;
      if (Math.hypot(tdx, tdz) <= config.radius) {
        this.applyDamage(target, config.damage, player);
      }
    }
  }

  private abilityVolley(player: PlayerState, input: AbilityInput): void {
    const config = ABILITIES.volley;
    const dx = input.aimX - player.x;
    const dz = input.aimZ - player.z;
    const len = Math.hypot(dx, dz);
    const baseAngle = len > 0 ? Math.atan2(dx, dz) : player.rotation;
    player.rotation = baseAngle;

    const ownerId = this.sessionIdByPlayer.get(player) ?? '';
    for (let i = -1; i <= 1; i++) {
      const angle = baseAngle + i * (config.spreadAngle / 2);
      const dirX = Math.sin(angle);
      const dirZ = Math.cos(angle);

      const proj = new ProjectileState();
      proj.id = `proj_${this.nextProjectileId++}`;
      proj.ownerId = ownerId;
      proj.faction = player.faction;
      proj.damage = config.damage;
      proj.x = player.x + dirX * 0.6;
      proj.y = 1.2;
      proj.z = player.z + dirZ * 0.6;
      proj.dx = dirX;
      proj.dy = 0;
      proj.dz = dirZ;
      proj.speed = 25;
      proj.lifetimeMs = 2000;
      proj.color = 0xffe060;
      proj.pierce = false;

      this.state.projectiles.set(proj.id, proj);
      this.projectileHits.set(proj.id, new Set());
    }
  }

  private abilityFrostNova(player: PlayerState, _input: AbilityInput): void {
    const config = ABILITIES.frost_nova;
    for (const target of this.state.players.values()) {
      if (target === player) continue;
      if (!target.alive) continue;
      if (target.faction === player.faction) continue;
      const tdx = target.x - player.x;
      const tdz = target.z - player.z;
      if (Math.hypot(tdx, tdz) <= config.radius) {
        this.applyDamage(target, config.damage, player);
        target.slowMs = config.slowMs;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Damage + death + respawn
  // --------------------------------------------------------------------------

  private applyDamage(target: PlayerState, damage: number, attacker: PlayerState): void {
    if (!target.alive) return;
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp <= 0) {
      target.alive = false;
      target.diedAt = Date.now();
      console.log(`[GameRoom] ${target.name} was killed by ${attacker.name}`);
      this.broadcast('kill', {
        victimName: target.name,
        killerName: attacker.name,
        timestamp: Date.now(),
      });
    }
  }

  private handleRespawn(player: PlayerState): void {
    const now = Date.now();
    if (player.alive) return;
    if (now - player.diedAt < COMBAT.respawnDelayMs) return;

    player.alive = true;
    player.hp = player.maxHp;
    const spawn = SPAWN_POSITIONS[player.faction as Faction];
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.diedAt = 0;
    player.slowMs = 0;
    // Reset inventory on death (per GDD: lose carried resources).
    player.invIron = 0;
    player.invEmberwood = 0;
    player.invGodshard = 0;
    console.log(`[GameRoom] ${player.name} respawned`);
  }

  // --------------------------------------------------------------------------
  // Simulation tick
  // --------------------------------------------------------------------------

  private tick(dt: number): void {
    this.state.tick++;
    this.state.worldTime = Date.now();

    // ── Player movement + slow + respawn ──────────────────────────────────
    for (const player of this.state.players.values()) {
      if (player.slowMs > 0) {
        player.slowMs = Math.max(0, player.slowMs - dt * 1000);
      }

      if (!player.alive) {
        this.handleRespawn(player);
        continue;
      }

      const sessionId = this.sessionIdByPlayer.get(player);
      if (!sessionId) continue;
      const input = this.playerInputs.get(sessionId);
      if (!input) continue;

      const baseSpeed = CLASS_STATS[player.characterClass as CharacterClass]?.moveSpeed
        ?? PLAYER_DEFAULTS.moveSpeed;
      const sprintMult = input.sprint ? PLAYER_DEFAULTS.sprintMultiplier : 1;
      const slowMult = player.slowMs > 0 ? COMBAT.slowMultiplier : 1;
      const moveSpeed = baseSpeed * sprintMult * slowMult;

      player.x += input.moveX * moveSpeed * dt;
      player.z += input.moveZ * moveSpeed * dt;
      this.clampPosition(player);

      const dx = input.aimX - player.x;
      const dz = input.aimZ - player.z;
      if (Math.hypot(dx, dz) > 0.1) {
        player.rotation = Math.atan2(dx, dz);
      }
    }

    // ── Projectile simulation ─────────────────────────────────────────────
    const projectilesToDestroy: string[] = [];
    for (const [projId, proj] of this.state.projectiles.entries()) {
      proj.lifetimeMs -= dt * 1000;
      if (proj.lifetimeMs <= 0) {
        projectilesToDestroy.push(projId);
        continue;
      }

      const moveDistance = proj.speed * dt;
      proj.x += proj.dx * moveDistance;
      proj.y += proj.dy * moveDistance;
      proj.z += proj.dz * moveDistance;

      const hits = this.projectileHits.get(projId) ?? new Set<string>();
      let hitSomething = false;
      for (const [targetSessionId, target] of this.state.players.entries()) {
        if (targetSessionId === proj.ownerId) continue;
        if (hits.has(targetSessionId)) continue;
        if (!target.alive) continue;
        if (target.faction === proj.faction) continue;

        const tdx = target.x - proj.x;
        const tdy = 1.0 - proj.y;
        const tdz = target.z - proj.z;
        const distance = Math.hypot(tdx, tdy, tdz);
        if (distance <= COMBAT.projectileRadius + COMBAT.playerRadius) {
          const attacker = this.state.players.get(proj.ownerId);
          if (attacker) {
            this.applyDamage(target, proj.damage, attacker);
          }
          hits.add(targetSessionId);
          if (!proj.pierce) {
            hitSomething = true;
            break;
          }
        }
      }
      this.projectileHits.set(projId, hits);

      if (hitSomething) {
        projectilesToDestroy.push(projId);
      }
    }

    for (const projId of projectilesToDestroy) {
      this.state.projectiles.delete(projId);
      this.projectileHits.delete(projId);
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private clampPosition(player: PlayerState): void {
    player.x = Math.max(-WORLD_SIZE.width / 2, Math.min(WORLD_SIZE.width / 2, player.x));
    player.z = Math.max(-WORLD_SIZE.depth, Math.min(0, player.z));
  }

  /** Expose available character models for the client to display in the picker. */
  static getAvailableModels(): string[] {
    return [...AVAILABLE_MODELS];
  }
}
