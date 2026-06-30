/**
 * Rift & Raid — DummySystem
 *
 * Respawns training dummies after they die. Restores HP, position, and
 * attackability.
 */

import type { World, System } from '@rift-and-raid/engine';
import {
  HealthComponent,
  TransformComponent,
} from '@rift-and-raid/engine';
import {
  DummyComponent,
  CombatTargetComponent,
} from '../prefabs/Components.js';

export interface DummySystemCallbacks {
  onRespawn: (entity: number) => void;
}

export class DummySystem implements System {
  readonly id = 'DummySystem';
  private callbacks: DummySystemCallbacks;

  constructor(callbacks: DummySystemCallbacks) {
    this.callbacks = callbacks;
  }

  init(_world: World): void {}

  update(world: World, _dt: number): void {
    const now = performance.now();
    const dummies = world.query(DummyComponent, HealthComponent, CombatTargetComponent);
    for (const dummyEntity of dummies) {
      const dummy = world.getComponent(dummyEntity, DummyComponent);
      const health = world.getComponent(dummyEntity, HealthComponent);
      const combat = world.getComponent(dummyEntity, CombatTargetComponent);
      const transform = world.getComponent(dummyEntity, TransformComponent);
      if (!dummy || !health || !combat || !transform) continue;

      if (dummy.dead && now - dummy.diedAt >= dummy.respawnAfterMs) {
        // Respawn.
        dummy.dead = false;
        health.current = dummy.maxHp;
        health.max = dummy.maxHp;
        combat.attackable = true;
        transform.x = dummy.spawnPosition.x;
        transform.y = dummy.spawnPosition.y;
        transform.z = dummy.spawnPosition.z;
        this.callbacks.onRespawn(dummyEntity);
      }
    }
  }
}
