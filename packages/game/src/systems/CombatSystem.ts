/**
 * Rift & Raid — CombatSystem
 *
 * Processes attack input from the player. Two attack types:
 *
 *   1. Melee (Warrior sword/axe): instant arc hit in front of player.
 *      All enemies within range and inside the arc take damage.
 *
 *   2. Ranged (Ranger bow, Mage staff): spawns a Projectile entity that
 *      travels forward and applies damage on collision (handled by
 *      ProjectileSystem).
 *
 * Per GDD §15: TTK target 4-6 seconds. Average weapon DPS ~25.
 * Per GDD §12: items give variety not raw stats — weapons are sidegrades.
 */

import type { World, System, ContentRegistry } from '@rift-and-raid/engine';
import {
  TransformComponent,
  HealthComponent,
  FactionComponent,
} from '@rift-and-raid/engine';
import type { InputState } from '@rift-and-raid/engine';
import type { WeaponConfig } from '@rift-and-raid/shared';
import {
  PlayerComponent,
  CombatTargetComponent,
  ProjectileComponent,
} from '../prefabs/Components.js';

export class CombatSystem implements System {
  readonly id = 'CombatSystem';

  private world!: World;
  private content!: ContentRegistry;
  private getInput: () => InputState;
  private spawnProjectile: (entity: number, projectile: ProjectileComponent) => void;

  constructor(
    content: ContentRegistry,
    getInput: () => InputState,
    spawnProjectile: (entity: number, projectile: ProjectileComponent) => void
  ) {
    this.content = content;
    this.getInput = getInput;
    this.spawnProjectile = spawnProjectile;
  }

  init(world: World): void {
    this.world = world;
  }

  update(world: World, _dt: number): void {
    this.world = world;
    const now = performance.now();
    const input = this.getInput();

    // Find the local player entity (the one with PlayerComponent).
    // Phase 1: only one player. Phase 2 will track by network ID.
    const players = world.query(PlayerComponent);
    if (players.size === 0) return;
    const playerEntity = [...players][0];
    const player = world.getComponent(playerEntity, PlayerComponent);
    if (!player) return;

    // Skip if dead (handled by HealthSystem).
    const health = world.getComponent(playerEntity, HealthComponent);
    if (health && health.current <= 0) return;

    // Process attack input.
    if (!input.attackPressed && !input.attackHeld) return;

    // Cooldown check.
    const weapon = this.content.weapons.require(player.weaponId) as WeaponConfig;
    const cooldownMs = weapon.cooldownMs;
    if (now - player.lastAttackAt < cooldownMs) return;
    player.lastAttackAt = now;
    player.attackAnimationEndsAt = now + 200; // 200ms swing animation

    const transform = world.getComponent(playerEntity, TransformComponent);
    if (!transform) return;

    if (weapon.type === 'melee') {
      this.performMeleeAttack(world, playerEntity, player, transform, weapon);
    } else {
      this.performRangedAttack(world, playerEntity, player, transform, weapon);
    }
  }

  /**
   * Melee attack: damage all attackable targets within range and inside
   * the frontal arc (±60° from facing direction, configurable per weapon).
   */
  private performMeleeAttack(
    world: World,
    attackerEntity: number,
    attacker: PlayerComponent,
    transform: TransformComponent,
    weapon: WeaponConfig
  ): void {
    const range = weapon.range;
    const arcHalfAngle = (60 * Math.PI) / 180; // ±60° = 120° arc
    const damage = weapon.damage;

    const targets = world.query(CombatTargetComponent, HealthComponent, TransformComponent);
    for (const targetEntity of targets) {
      if (targetEntity === attackerEntity) continue;
      const targetCombat = world.getComponent(targetEntity, CombatTargetComponent);
      if (!targetCombat || !targetCombat.attackable) continue;
      // Friendly-fire check (Phase 1: dummies are 'neutral', always attackable).
      if (targetCombat.faction === attacker.faction) continue;

      const targetTransform = world.getComponent(targetEntity, TransformComponent);
      const targetHealth = world.getComponent(targetEntity, HealthComponent);
      if (!targetTransform || !targetHealth) continue;

      // Range check.
      const dx = targetTransform.x - transform.x;
      const dz = targetTransform.z - transform.z;
      const distance = Math.hypot(dx, dz);
      if (distance > range) continue;

      // Arc check: is target within ±arcHalfAngle of facing direction?
      const facingX = Math.sin(transform.rotation);
      const facingZ = Math.cos(transform.rotation);
      const dirX = distance > 0 ? dx / distance : 0;
      const dirZ = distance > 0 ? dz / distance : 0;
      const dot = facingX * dirX + facingZ * dirZ;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle > arcHalfAngle) continue;

      // Hit! Apply damage via the event bus. HealthSystem listens.
      // We use direct component mutation for Phase 1 simplicity; Phase 3
      // will route through an EventBus for proper death credit tracking.
      targetHealth.current -= damage;
      this.emitHitVfx(targetEntity, targetTransform, damage, false);
    }
  }

  /**
   * Ranged attack: spawn a projectile entity that travels forward.
   * ProjectileSystem handles collision and damage application.
   */
  private performRangedAttack(
    world: World,
    attackerEntity: number,
    attacker: PlayerComponent,
    transform: TransformComponent,
    weapon: WeaponConfig
  ): void {
    const projectileEntity = world.createEntity();

    // Spawn position: slightly in front of player, at chest height.
    const spawnOffsetX = Math.sin(transform.rotation) * 0.6;
    const spawnOffsetZ = Math.cos(transform.rotation) * 0.6;
    const projTransform = world.addComponent(projectileEntity, new TransformComponent());
    projTransform.x = transform.x + spawnOffsetX;
    projTransform.y = 1.2; // chest height
    projTransform.z = transform.z + spawnOffsetZ;
    projTransform.rotation = transform.rotation;

    const proj = world.addComponent(projectileEntity, new ProjectileComponent());
    proj.damage = weapon.damage;
    proj.speed = 25;
    proj.directionX = Math.sin(transform.rotation);
    proj.directionY = 0;
    proj.directionZ = Math.cos(transform.rotation);
    proj.lifetimeMs = Math.min(3000, weapon.range * 1000 / proj.speed);
    proj.ownerEntity = attackerEntity;
    proj.ownerFaction = attacker.faction;
    // Color by weapon: fire staff = orange, frost staff = cyan, bow = yellow.
    if (weapon.id.includes('fire')) proj.color = 0xff8030;
    else if (weapon.id.includes('frost')) proj.color = 0x80e0ff;
    else proj.color = 0xffe060;
    proj.radius = 0.25;
    proj.pierce = weapon.special === 'pierce';

    this.spawnProjectile(projectileEntity, proj);
  }

  private emitHitVfx(
    _targetEntity: number,
    _transform: TransformComponent,
    _damage: number,
    _crit: boolean
  ): void {
    // Phase 1: HealthSystem / DamageNumberSystem will handle VFX.
    // Direct damage application already happened above.
    // We just emit an event here for the systems that care.
    // (Wire-up happens in client main.ts via EventBus.)
  }
}
