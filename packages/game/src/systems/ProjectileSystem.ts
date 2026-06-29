/**
 * Rift & Raid — ProjectileSystem
 *
 * Updates projectile motion, checks collisions with attackable targets,
 * applies damage on hit, and destroys projectiles that exceed lifetime
 * or hit something.
 */

import type { World, System } from '@rift-and-raid/engine';
import {
  TransformComponent,
  HealthComponent,
} from '@rift-and-raid/engine';
import {
  ProjectileComponent,
  CombatTargetComponent,
  PlayerComponent,
  DamageNumberComponent,
} from '../prefabs/Components.js';

export interface ProjectileSystemCallbacks {
  /** Called when a projectile's visual representation should be created. */
  onSpawn: (entity: number) => void;
  /** Called when a projectile's visual representation should be removed. */
  onDestroy: (entity: number) => void;
  /** Called when a projectile hits a target (for VFX). */
  onHit: (projectileEntity: number, targetEntity: number, damage: number) => void;
}

export class ProjectileSystem implements System {
  readonly id = 'ProjectileSystem';
  private callbacks: ProjectileSystemCallbacks;

  constructor(callbacks: ProjectileSystemCallbacks) {
    this.callbacks = callbacks;
  }

  init(_world: World): void {
    // no-op
  }

  update(world: World, dt: number): void {
    const now = performance.now();
    const projectiles = world.query(ProjectileComponent, TransformComponent);
    const toDestroy: number[] = [];

    for (const projEntity of projectiles) {
      const proj = world.getComponent(projEntity, ProjectileComponent);
      const transform = world.getComponent(projEntity, TransformComponent);
      if (!proj || !transform) continue;

      // Age.
      proj.ageMs += dt * 1000;
      if (proj.ageMs >= proj.lifetimeMs) {
        toDestroy.push(projEntity);
        continue;
      }

      // Move.
      const moveDistance = proj.speed * dt;
      transform.x += proj.directionX * moveDistance;
      transform.y += proj.directionY * moveDistance;
      transform.z += proj.directionZ * moveDistance;

      // Collision check: any attackable target within radius?
      const targets = world.query(CombatTargetComponent, HealthComponent, TransformComponent);
      let hitSomething = false;
      for (const targetEntity of targets) {
        if (targetEntity === proj.ownerEntity) continue;
        if (proj.hitEntities.includes(targetEntity)) continue;
        const targetCombat = world.getComponent(targetEntity, CombatTargetComponent);
        if (!targetCombat || !targetCombat.attackable) continue;
        if (targetCombat.faction === proj.ownerFaction) continue;

        const targetTransform = world.getComponent(targetEntity, TransformComponent);
        const targetHealth = world.getComponent(targetEntity, HealthComponent);
        if (!targetTransform || !targetHealth) continue;

        // Sphere-sphere collision (projectile vs target).
        const dx = targetTransform.x - transform.x;
        const dy = 1.0 - transform.y; // approximate target center at y=1
        const dz = targetTransform.z - transform.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance <= proj.radius + 0.6) {
          // Hit!
          targetHealth.current -= proj.damage;
          proj.hitEntities.push(targetEntity);
          this.callbacks.onHit(projEntity, targetEntity, proj.damage);
          this.spawnDamageNumber(world, targetTransform.x, 1.5, targetTransform.z, proj.damage, false);
          if (!proj.pierce) {
            hitSomething = true;
            break;
          }
        }
      }

      if (hitSomething) {
        toDestroy.push(projEntity);
      }
    }

    // Destroy expired / hit projectiles.
    for (const entity of toDestroy) {
      this.callbacks.onDestroy(entity);
      world.destroyEntity(entity);
    }
  }

  private spawnDamageNumber(world: World, x: number, y: number, z: number, amount: number, crit: boolean): void {
    const entity = world.createEntity();
    const dn = world.addComponent(entity, new DamageNumberComponent());
    dn.amount = Math.round(amount);
    dn.x = x;
    dn.y = y;
    dn.z = z;
    dn.crit = crit;
  }
}
