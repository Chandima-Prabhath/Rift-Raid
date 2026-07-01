/**
 * Rift & Raid — GameRoom (Colyseus 0.16 + schema v3)
 *
 * Server-authoritative game room implementing Phases 2–5:
 *   - Player join/leave with faction assignment + character model selection
 *   - Movement (world-space, camera-relative conversion done on client)
 *   - Combat (melee + ranged + abilities + death/respawn)
 *   - Resource nodes (iron/emberwood/godshard) with harvesting + respawn
 *   - Team vaults (deposit resources, per-faction shared inventory)
 *   - Building (place structures, construction timers, structure HP)
 *
 * Per-player state isolation:
 *   Each PlayerState carries its own inventory (invIron/invEmberwood/invGodshard).
 *   TeamVaultState holds the per-faction shared vault, keyed by faction name.
 */

import { Room, Client } from '@colyseus/core';
import {
  GameState,
  PlayerState,
  ProjectileState,
  ResourceNodeState,
  StructureState,
  TeamVaultState,
  CLASS_STATS,
  PLAYER_DEFAULTS,
  WORLD_SIZE,
  COMBAT,
  ABILITIES,
  HARVESTING,
  BUILDING,
  STRUCTURE_TYPES,
  RESOURCE_NODE_SPAWNS,
  type CharacterClass,
  type Faction,
  type StructureTypeId,
} from '@rift-and-raid/shared';

// ============================================================================
// Input message types
// ============================================================================

interface MoveInput { sequence: number; moveX: number; moveZ: number; aimX: number; aimZ: number; sprint: boolean; }
interface DashInput { directionX: number; directionZ: number; }
interface ClassSwapInput { characterClass: CharacterClass; }
interface ChatInput { text: string; }
interface AttackInput { aimX: number; aimZ: number; }
interface AbilityInput { abilityId: string; aimX: number; aimZ: number; }
interface ModelSwapInput { characterModel: string; }
interface HarvestInput { nodeId: string; }
interface DepositInput { }
interface BuildInput { structureType: StructureTypeId; x: number; z: number; rotation: number; }
interface JoinOptions {
  name?: string;
  characterModel?: string;
  characterClass?: CharacterClass;
  faction?: Faction;
}

// ============================================================================
// Constants
// ============================================================================

const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;

const FACTION_COLORS: Record<Faction, number> = {
  solari: 0xe07b3a,
  lunari: 0x4a90e2,
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

const VAULT_POSITIONS: Record<Faction, { x: number; y: number; z: number }> = {
  solari: { x: -80, y: 0, z: -40 },
  lunari: { x: 80, y: 0, z: -40 },
};

const AVAILABLE_MODELS = [
  'character-male-a', 'character-male-b', 'character-male-c',
  'character-male-d', 'character-male-e', 'character-male-f',
  'character-female-a', 'character-female-b', 'character-female-c',
  'character-female-d', 'character-female-e', 'character-female-f',
];

// ============================================================================
// GameRoom
// ============================================================================

export class GameRoom extends Room<GameState> {
  maxClients = 16;

  private playerInputs = new Map<string, MoveInput>();
  private playerLastDash = new Map<string, number>();
  private playerLastHarvest = new Map<string, number>();
  private nextProjectileId = 0;
  private nextStructureId = 0;
  private projectileHits = new Map<string, Set<string>>();
  private sessionIdByPlayer = new Map<PlayerState, string>();

  onCreate(): void {
    console.log('[GameRoom] room created');
    this.setState(new GameState());

    // Initialize vaults.
    for (const f of ['solari', 'lunari'] as Faction[]) {
      const vault = new TeamVaultState();
      vault.faction = f;
      vault.iron = 0;
      vault.emberwood = 0;
      vault.godshard = 0;
      vault.level = 1;
      this.state.vaults.set(f, vault);
    }

    // Spawn resource nodes.
    for (let i = 0; i < RESOURCE_NODE_SPAWNS.length; i++) {
      const spawn = RESOURCE_NODE_SPAWNS[i];
      const node = new ResourceNodeState();
      node.id = `node_${i}`;
      node.resourceType = spawn.type;
      node.x = spawn.x;
      node.y = 0;
      node.z = spawn.z;
      node.maxHp = HARVESTING.nodeHp[spawn.type];
      node.hp = node.maxHp;
      node.respawnAt = 0;
      this.state.resourceNodes.set(node.id, node);
    }

    this.setupMessageHandlers();
    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), TICK_MS);
    this.setPatchRate(TICK_MS);
  }

  private setupMessageHandlers(): void {
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
    });

    this.onMessage('model_swap', (client: Client, input: ModelSwapInput) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (!AVAILABLE_MODELS.includes(input.characterModel)) return;
      player.characterModel = input.characterModel;
    });

    this.onMessage('attack', (client: Client, input: AttackInput) => {
      this.handleAttack(client.sessionId, input);
    });

    this.onMessage('ability', (client: Client, input: AbilityInput) => {
      this.handleAbility(client.sessionId, input);
    });

    this.onMessage('harvest', (client: Client, input: HarvestInput) => {
      this.handleHarvest(client.sessionId, input.nodeId);
    });

    this.onMessage('deposit', (client: Client, _input: DepositInput) => {
      this.handleDeposit(client.sessionId);
    });

    this.onMessage('build', (client: Client, input: BuildInput) => {
      this.handleBuild(client.sessionId, input);
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

    this.onMessage('ping', (client: Client, payload: { seq: number; t: number }) => {
      client.send('pong', { seq: payload.seq, t: payload.t });
    });
  }

  onJoin(client: Client, options?: JoinOptions): void {
    console.log(`[GameRoom] ${client.sessionId} joined`);
    const playerCount = this.state.players.size;

    // Faction: use the player's choice if provided, else auto-assign.
    const faction: Faction = options?.faction === 'solari' || options?.faction === 'lunari'
      ? options.faction
      : (playerCount % 2 === 0 ? 'solari' : 'lunari');
    const spawn = SPAWN_POSITIONS[faction];

    const name = (options?.name && options.name.length > 0 && options.name.length <= 20)
      ? options.name : `Player ${playerCount + 1}`;
    const characterModel = options?.characterModel && AVAILABLE_MODELS.includes(options.characterModel)
      ? options.characterModel : AVAILABLE_MODELS[playerCount % AVAILABLE_MODELS.length];
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

    this.state.players.set(client.sessionId, player);
    this.sessionIdByPlayer.set(player, client.sessionId);
    console.log(`[GameRoom] ${player.name} spawned at (${player.x}, ${player.z}) as ${faction}`);
  }

  onLeave(client: Client, _consented?: boolean): void {
    const player = this.state.players.get(client.sessionId);
    console.log(`[GameRoom] ${player?.name ?? client.sessionId} left`);
    if (player) this.sessionIdByPlayer.delete(player);
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    this.playerLastDash.delete(client.sessionId);
    this.playerLastHarvest.delete(client.sessionId);
  }

  onDispose(): void {
    console.log('[GameRoom] room disposed');
  }

  // --------------------------------------------------------------------------
  // Combat
  // --------------------------------------------------------------------------

  private handleAttack(sessionId: string, input: AttackInput): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive) return;
    const now = Date.now();
    const cd = this.getWeaponCooldown(player.characterClass);
    if (now - player.lastAttackAt < cd) return;
    player.lastAttackAt = now;

    // Broadcast attack sound to all clients.
    this.broadcast('sound', {
      type: player.characterClass === 'warrior' ? 'attack_melee' : 'attack_ranged',
      x: player.x, y: 1, z: player.z,
    });

    if (player.characterClass === 'warrior') {
      this.performMeleeAttack(player, input);
    } else {
      this.performRangedAttack(player, input);
    }
  }

  private getWeaponCooldown(cls: CharacterClass): number {
    return cls === 'warrior' ? 600 : cls === 'ranger' ? 700 : 1200;
  }

  private getWeaponDamage(cls: CharacterClass): number {
    return cls === 'warrior' ? 20 : cls === 'ranger' ? 16 : 25;
  }

  private performMeleeAttack(attacker: PlayerState, input: AttackInput): void {
    const range = 2;
    const damage = this.getWeaponDamage('warrior');
    const arcHalf = COMBAT.meleeArcHalfAngle;
    const dx = input.aimX - attacker.x;
    const dz = input.aimZ - attacker.z;
    const facing = Math.hypot(dx, dz) > 0.1 ? Math.atan2(dx, dz) : attacker.rotation;
    attacker.rotation = facing;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);

    for (const target of this.state.players.values()) {
      if (target === attacker || !target.alive || target.faction === attacker.faction) continue;
      const tdx = target.x - attacker.x;
      const tdz = target.z - attacker.z;
      const dist = Math.hypot(tdx, tdz);
      if (dist > range) continue;
      const dirX = dist > 0 ? tdx / dist : 0;
      const dirZ = dist > 0 ? tdz / dist : 0;
      const dot = fx * dirX + fz * dirZ;
      if (Math.acos(Math.max(-1, Math.min(1, dot))) > arcHalf) continue;
      this.applyDamage(target, damage, attacker);
    }

    // Also damage structures in range (enemy faction only).
    for (const struct of this.state.structures.values()) {
      if (!struct.built) continue;
      if (struct.faction === attacker.faction) continue;
      const sdx = struct.x - attacker.x;
      const sdz = struct.z - attacker.z;
      if (Math.hypot(sdx, sdz) > range) continue;
      struct.hp = Math.max(0, struct.hp - damage);
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
    proj.dz = dirZ;
    proj.speed = 25;
    proj.lifetimeMs = 3000;
    proj.color = attacker.characterClass === 'mage' ? 0xff8030 : 0xffe060;
    this.state.projectiles.set(proj.id, proj);
    this.projectileHits.set(proj.id, new Set());
  }

  private handleAbility(sessionId: string, input: AbilityInput): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive) return;
    const abilityId = input.abilityId || player.abilityId;
    const config = ABILITIES[abilityId as keyof typeof ABILITIES];
    if (!config) return;
    const now = Date.now();
    if (now - player.lastAbilityAt < config.cooldownMs) return;
    player.lastAbilityAt = now;

    switch (abilityId) {
      case 'charge': this.abilityCharge(player, input); break;
      case 'volley': this.abilityVolley(player, input); break;
      case 'frost_nova': this.abilityFrostNova(player, input); break;
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
      if (target === player || !target.alive || target.faction === player.faction) continue;
      if (Math.hypot(target.x - player.x, target.z - player.z) <= config.radius) {
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
      const proj = new ProjectileState();
      proj.id = `proj_${this.nextProjectileId++}`;
      proj.ownerId = ownerId;
      proj.faction = player.faction;
      proj.damage = config.damage;
      proj.x = player.x + Math.sin(angle) * 0.6;
      proj.y = 1.2;
      proj.z = player.z + Math.cos(angle) * 0.6;
      proj.dx = Math.sin(angle);
      proj.dz = Math.cos(angle);
      proj.speed = 25;
      proj.lifetimeMs = 2000;
      proj.color = 0xffe060;
      this.state.projectiles.set(proj.id, proj);
      this.projectileHits.set(proj.id, new Set());
    }
  }

  private abilityFrostNova(player: PlayerState, _input: AbilityInput): void {
    const config = ABILITIES.frost_nova;
    for (const target of this.state.players.values()) {
      if (target === player || !target.alive || target.faction === player.faction) continue;
      if (Math.hypot(target.x - player.x, target.z - player.z) <= config.radius) {
        this.applyDamage(target, config.damage, player);
        target.slowMs = config.slowMs;
      }
    }
  }

  private applyDamage(target: PlayerState, damage: number, attacker: PlayerState): void {
    if (!target.alive) return;
    target.hp = Math.max(0, target.hp - damage);
    // Broadcast hit sound.
    this.broadcast('sound', { type: 'hit', x: target.x, y: 1, z: target.z });
    if (target.hp <= 0) {
      target.alive = false;
      target.diedAt = Date.now();
      console.log(`[GameRoom] ${target.name} killed by ${attacker.name}`);
      this.broadcast('kill', { victimName: target.name, killerName: attacker.name, timestamp: Date.now() });
      // Broadcast death sound.
      this.broadcast('sound', { type: 'death', x: target.x, y: 1, z: target.z });
    }
  }

  private handleRespawn(player: PlayerState): void {
    if (player.alive) return;
    if (Date.now() - player.diedAt < COMBAT.respawnDelayMs) return;
    player.alive = true;
    player.hp = player.maxHp;
    const spawn = SPAWN_POSITIONS[player.faction as Faction];
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.diedAt = 0;
    player.slowMs = 0;
    player.invIron = 0;
    player.invEmberwood = 0;
    player.invGodshard = 0;
  }

  // --------------------------------------------------------------------------
  // Harvesting (Phase 4)
  // --------------------------------------------------------------------------

  private handleHarvest(sessionId: string, nodeId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive) return;
    const node = this.state.resourceNodes.get(nodeId);
    if (!node) return;
    // Range check.
    const dist = Math.hypot(node.x - player.x, node.z - player.z);
    if (dist > HARVESTING.range) return;
    // Cooldown.
    const now = Date.now();
    const lastHarvest = this.playerLastHarvest.get(sessionId) ?? 0;
    if (now - lastHarvest < HARVESTING.cooldownMs) return;
    this.playerLastHarvest.set(sessionId, now);

    // Node must be alive (hp > 0).
    if (node.hp <= 0) return;

    // Apply damage to node.
    node.hp = Math.max(0, node.hp - HARVESTING.damagePerHit);

    // Broadcast harvest sound.
    this.broadcast('sound', { type: 'harvest', x: node.x, y: 1, z: node.z });

    // Add resources to player inventory (respect cap).
    const cap = PLAYER_DEFAULTS.maxInventoryPerResource;
    const yieldAmt = HARVESTING.yieldPerHit;
    if (node.resourceType === 'iron') {
      player.invIron = Math.min(cap, player.invIron + yieldAmt);
    } else if (node.resourceType === 'emberwood') {
      player.invEmberwood = Math.min(cap, player.invEmberwood + yieldAmt);
    } else if (node.resourceType === 'godshard') {
      player.invGodshard = Math.min(cap, player.invGodshard + yieldAmt);
    }

    // If node depleted, schedule respawn.
    if (node.hp <= 0) {
      node.respawnAt = now + HARVESTING.respawnMs;
    }
  }

  private handleRespawnNodes(): void {
    const now = Date.now();
    for (const node of this.state.resourceNodes.values()) {
      if (node.hp <= 0 && node.respawnAt > 0 && now >= node.respawnAt) {
        node.hp = node.maxHp;
        node.respawnAt = 0;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Deposit (Phase 4)
  // --------------------------------------------------------------------------

  private handleDeposit(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive) return;
    const vault = this.state.vaults.get(player.faction as Faction);
    if (!vault) return;

    // Range check — player must be near their faction's vault.
    const vaultPos = VAULT_POSITIONS[player.faction as Faction];
    const dist = Math.hypot(vaultPos.x - player.x, vaultPos.z - player.z);
    if (dist > BUILDING.depositRange) return;

    // Transfer inventory to vault.
    vault.iron += player.invIron;
    vault.emberwood += player.invEmberwood;
    vault.godshard += player.invGodshard;
    console.log(`[GameRoom] ${player.name} deposited ${player.invIron} iron, ${player.invEmberwood} emberwood, ${player.invGodshard} godshard`);
    // Broadcast deposit sound.
    this.broadcast('sound', { type: 'deposit', x: player.x, y: 1, z: player.z });
    player.invIron = 0;
    player.invEmberwood = 0;
    player.invGodshard = 0;
  }

  // --------------------------------------------------------------------------
  // Building (Phase 5)
  // --------------------------------------------------------------------------

  private handleBuild(sessionId: string, input: BuildInput): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.alive) return;
    const config = STRUCTURE_TYPES[input.structureType];
    if (!config) return;

    // Count faction structures.
    let factionCount = 0;
    for (const s of this.state.structures.values()) {
      if (s.faction === player.faction) factionCount++;
    }
    if (factionCount >= BUILDING.maxStructuresPerFaction) return;

    // Range check — must be within build radius of nexus (spawn).
    const nexus = VAULT_POSITIONS[player.faction as Faction];
    const distFromNexus = Math.hypot(input.x - nexus.x, input.z - nexus.z);
    if (distFromNexus > BUILDING.maxBuildRadius) return;

    // World bounds.
    if (input.x < -WORLD_SIZE.width / 2 || input.x > WORLD_SIZE.width / 2) return;
    if (input.z < -WORLD_SIZE.depth || input.z > 0) return;

    // Spacing check — don't allow overlapping structures.
    for (const s of this.state.structures.values()) {
      if (Math.hypot(s.x - input.x, s.z - input.z) < BUILDING.minStructureSpacing) return;
    }

    // Check vault has enough resources.
    const vault = this.state.vaults.get(player.faction as Faction);
    if (!vault) return;
    if (vault.iron < config.cost.iron) return;
    if (vault.emberwood < config.cost.emberwood) return;
    if (vault.godshard < config.cost.godshard) return;

    // Deduct cost.
    vault.iron -= config.cost.iron;
    vault.emberwood -= config.cost.emberwood;
    vault.godshard -= config.cost.godshard;

    // Create structure.
    const struct = new StructureState();
    struct.id = `struct_${this.nextStructureId++}`;
    struct.structureType = input.structureType;
    struct.faction = player.faction;
    struct.x = input.x;
    struct.y = 0;
    struct.z = input.z;
    struct.rotation = input.rotation;
    struct.maxHp = config.hp;
    struct.hp = config.hp; // full HP during construction (simplified)
    struct.buildProgress = 0;
    struct.built = false;

    this.state.structures.set(struct.id, struct);
    console.log(`[GameRoom] ${player.name} placed ${input.structureType} at (${input.x.toFixed(1)}, ${input.z.toFixed(1)})`);
    // Broadcast build sound.
    this.broadcast('sound', { type: 'build', x: input.x, y: 1, z: input.z });
  }

  private handleConstruction(dt: number): void {
    const toRemove: string[] = [];
    for (const struct of this.state.structures.values()) {
      // Remove destroyed structures.
      if (struct.hp <= 0 && struct.built) {
        toRemove.push(struct.id);
        continue;
      }
      if (struct.built) continue;
      const config = STRUCTURE_TYPES[struct.structureType as StructureTypeId];
      if (!config) continue;
      struct.buildProgress += dt * 1000 / config.constructionMs;
      if (struct.buildProgress >= 1) {
        struct.buildProgress = 1;
        struct.built = true;
      }
    }
    for (const id of toRemove) {
      this.state.structures.delete(id);
    }
  }

  // --------------------------------------------------------------------------
  // Simulation tick
  // --------------------------------------------------------------------------

  private tick(dt: number): void {
    this.state.tick++;
    this.state.worldTime = Date.now();

    // Player movement + slow + respawn.
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

      const baseSpeed = CLASS_STATS[player.characterClass as CharacterClass]?.moveSpeed ?? PLAYER_DEFAULTS.moveSpeed;
      const sprintMult = input.sprint ? PLAYER_DEFAULTS.sprintMultiplier : 1;
      const slowMult = player.slowMs > 0 ? COMBAT.slowMultiplier : 1;
      const moveSpeed = baseSpeed * sprintMult * slowMult;

      const newX = player.x + input.moveX * moveSpeed * dt;
      const newZ = player.z + input.moveZ * moveSpeed * dt;

      // Structure collision: don't let players walk through built structures.
      // Each structure has a ~1m radius collision cylinder.
      let blocked = false;
      for (const struct of this.state.structures.values()) {
        if (!struct.built || struct.hp <= 0) continue;
        const sdx = newX - struct.x;
        const sdz = newZ - struct.z;
        if (Math.hypot(sdx, sdz) < 1.2) {
          blocked = true;
          break;
        }
      }

      if (!blocked) {
        player.x = newX;
        player.z = newZ;
      }
      this.clampPosition(player);

      // Facing: character faces MOVEMENT direction (not aim point).
      // Kenney models face -Z by default, so we add π to convert from
      // +Z-forward atan2 result to -Z-forward model facing.
      const moveMag = Math.hypot(input.moveX, input.moveZ);
      if (moveMag > 0.1) {
        player.rotation = Math.atan2(input.moveX, input.moveZ) + Math.PI;
      }
    }

    // Resource node respawns.
    this.handleRespawnNodes();

    // Construction progress.
    this.handleConstruction(dt);

    // Projectile simulation.
    const toDestroy: string[] = [];
    for (const [projId, proj] of this.state.projectiles.entries()) {
      proj.lifetimeMs -= dt * 1000;
      if (proj.lifetimeMs <= 0) { toDestroy.push(projId); continue; }
      const moveDist = proj.speed * dt;
      proj.x += proj.dx * moveDist;
      proj.y += proj.dy * moveDist;
      proj.z += proj.dz * moveDist;

      const hits = this.projectileHits.get(projId) ?? new Set();
      let hitSomething = false;
      // Check collision with players.
      for (const [targetSid, target] of this.state.players.entries()) {
        if (targetSid === proj.ownerId || hits.has(targetSid)) continue;
        if (!target.alive || target.faction === proj.faction) continue;
        const tdx = target.x - proj.x;
        const tdy = 1.0 - proj.y;
        const tdz = target.z - proj.z;
        if (Math.hypot(tdx, tdy, tdz) <= COMBAT.projectileRadius + COMBAT.playerRadius) {
          const attacker = this.state.players.get(proj.ownerId);
          if (attacker) this.applyDamage(target, proj.damage, attacker);
          hits.add(targetSid);
          if (!proj.pierce) { hitSomething = true; break; }
        }
      }
      // Check collision with enemy structures.
      if (!hitSomething) {
        for (const struct of this.state.structures.values()) {
          if (!struct.built || struct.hp <= 0) continue;
          if (struct.faction === proj.faction) continue;
          const sdx = struct.x - proj.x;
          const sdz = struct.z - proj.z;
          const sdy = 1.0 - proj.y;
          if (Math.hypot(sdx, sdy, sdz) <= COMBAT.projectileRadius + 1.0) {
            struct.hp = Math.max(0, struct.hp - proj.damage);
            if (!proj.pierce) { hitSomething = true; break; }
          }
        }
      }
      this.projectileHits.set(projId, hits);
      if (hitSomething) toDestroy.push(projId);
    }
    for (const id of toDestroy) {
      this.state.projectiles.delete(id);
      this.projectileHits.delete(id);
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private clampPosition(player: PlayerState): void {
    player.x = Math.max(-WORLD_SIZE.width / 2, Math.min(WORLD_SIZE.width / 2, player.x));
    player.z = Math.max(-WORLD_SIZE.depth, Math.min(0, player.z));
  }
}
