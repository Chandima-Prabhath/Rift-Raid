/**
 * Rift & Raid — GameRoom (Colyseus) — Phase 3
 *
 * Server-authoritative combat:
 *   - Players send attack/ability/dash messages
 *   - Server validates cooldowns, performs hit detection, applies damage
 *   - Server spawns and simulates projectiles
 *   - Server handles death (alive=false) and respawn (after 5s)
 *
 * Phase 3 scope: full PvP combat + 1 ability per class + respawn.
 */

import { Room, Client } from '@colyseus/core';
import {
  GameState,
  PlayerState,
  ProjectileState,
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
  /** Aim point in world space (for melee arc direction + ranged projectile direction). */
  aimX: number;
  aimZ: number;
}

interface AbilityInput {
  abilityId: string;
  aimX: number;
  aimZ: number;
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
const ABILITY_BY_CLASS: Record<CharacterClass, string> = {
  warrior: 'charge',
  ranger: 'volley',
  mage: 'frost_nova',
};
const SPAWN_POSITIONS = {
  solari: { x: -80, y: 0, z: -40 },
  lunari: { x: 80, y: 0, z: -40 },
};

// ============================================================================
// GameRoom
// ============================================================================

export class GameRoom extends Room<GameState> {
  maxClients = 16;
  /** Transient input storage — NOT synced over the wire. */
  private playerInputs = new Map<string, MoveInput>();
  private playerLastDash = new Map<string, number>();
  /** Projectile ID counter. */
  private nextProjectileId = 0;
  /** Track which projectiles have hit which players (for pierce). */
  private projectileHits = new Map<string, Set<string>>();

  onCreate(): void {
    console.log('[GameRoom] room created');
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
      player.hp = stats.hp;
      player.color = COLOR_BY_CLASS[input.characterClass];
      player.abilityId = ABILITY_BY_CLASS[input.characterClass];
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

    // dt from Colyseus is in milliseconds; convert to seconds for gameplay.
    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), TICK_MS);
    // Enable state broadcasting at 20Hz (sends diffs to all clients).
    this.setPatchRate(TICK_MS);
  }

  onJoin(client: Client, _options?: unknown): void {
    console.log(`[GameRoom] ${client.sessionId} joined`);
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
    player.rotation = faction === 'solari' ? 0 : Math.PI;
    player.hp = CLASS_STATS.warrior.hp;
    player.maxHp = CLASS_STATS.warrior.hp;
    player.alive = true;
    player.color = COLOR_BY_CLASS.warrior;
    player.abilityId = ABILITY_BY_CLASS.warrior;

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
  // Attack handling
  // --------------------------------------------------------------------------

  private handleAttack(sessionId: string, input: AttackInput): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive) return;

    const now = Date.now();
    // Weapon cooldown — Phase 3 uses class-based default weapons.
    const weaponCooldown = this.getWeaponCooldown(player.characterClass);
    if (now - player.lastAttackAt < weaponCooldown) return;
    player.lastAttackAt = now;

    console.log(`[GameRoom] ${player.name} attacks (${player.characterClass})`);

    if (player.characterClass === 'warrior') {
      this.performMeleeAttack(player, input);
    } else {
      this.performRangedAttack(player, input);
    }
  }

  private getWeaponCooldown(cls: CharacterClass): number {
    // Phase 3: hardcoded per class. Phase 4+ reads from content registry.
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

    // Attacker facing — based on aim point.
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

      // Hit!
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
    proj.ownerId = this.findSessionIdByPlayer(attacker) ?? '';
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
      proj.color = 0xff8030; // fire orange
    } else {
      proj.color = 0xffe060; // arrow yellow
    }
    proj.pierce = false;

    this.state.projectiles.set(proj.id, proj);
    this.projectileHits.set(proj.id, new Set());
    console.log(`[GameRoom] Projectile spawned: ${proj.id} by ${attacker.name} at (${proj.x.toFixed(1)}, ${proj.z.toFixed(1)})`);
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

  /** Warrior: Charge — dash forward, damage enemies in path. */
  private abilityCharge(player: PlayerState, input: AbilityInput): void {
    const config = ABILITIES.charge;
    const dx = input.aimX - player.x;
    const dz = input.aimZ - player.z;
    const len = Math.hypot(dx, dz);
    const dirX = len > 0 ? dx / len : Math.sin(player.rotation);
    const dirZ = len > 0 ? dz / len : Math.cos(player.rotation);
    player.rotation = Math.atan2(dirX, dirZ);

    // Move player forward.
    player.x += dirX * config.distance;
    player.z += dirZ * config.distance;
    this.clampPosition(player);

    // Damage enemies near the endpoint.
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

  /** Ranger: Volley — fire 3 projectiles in a cone. */
  private abilityVolley(player: PlayerState, input: AbilityInput): void {
    const config = ABILITIES.volley;
    const dx = input.aimX - player.x;
    const dz = input.aimZ - player.z;
    const len = Math.hypot(dx, dz);
    const baseAngle = len > 0 ? Math.atan2(dx, dz) : player.rotation;
    player.rotation = baseAngle;

    const ownerId = this.findSessionIdByPlayer(player) ?? '';
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

  /** Mage: Frost Nova — AoE damage + slow around self. */
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
      // Broadcast kill event to all clients for kill feed.
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
      // Tick slow effect.
      if (player.slowMs > 0) {
        player.slowMs = Math.max(0, player.slowMs - dt * 1000);
      }

      // Respawn check.
      if (!player.alive) {
        this.handleRespawn(player);
        continue;
      }

      const sessionId = this.findSessionIdByPlayer(player);
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
      // Age.
      proj.lifetimeMs -= dt * 1000;
      if (proj.lifetimeMs <= 0) {
        projectilesToDestroy.push(projId);
        continue;
      }

      // Move.
      const moveDistance = proj.speed * dt;
      proj.x += proj.dx * moveDistance;
      proj.y += proj.dy * moveDistance;
      proj.z += proj.dz * moveDistance;

      // Collision with players.
      const hits = this.projectileHits.get(projId) ?? new Set<string>();
      let hitSomething = false;
      for (const [targetSessionId, target] of this.state.players.entries()) {
        if (targetSessionId === proj.ownerId) continue;
        if (hits.has(targetSessionId)) continue;
        if (!target.alive) continue;
        if (target.faction === proj.faction) continue;

        const tdx = target.x - proj.x;
        const tdy = 1.0 - proj.y; // approximate player center at y=1
        const tdz = target.z - proj.z;
        const distance = Math.hypot(tdx, tdy, tdz);
        if (distance <= COMBAT.projectileRadius + COMBAT.playerRadius) {
          this.applyDamage(target, proj.damage, this.state.players.get(proj.ownerId)!);
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
