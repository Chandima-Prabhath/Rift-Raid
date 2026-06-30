/**
 * Rift & Raid — HealthSystem
 *
 * Watches all entities with HealthComponent. Handles death when HP <= 0.
 * Death logic depends on entity type:
 *
 *   - Players: respawn at base after delay (Phase 3+ will wire this fully).
 *   - Dummies: marked dead, DummySystem handles respawn.
 *   - Monsters: destroyed, drops spawned (Phase 4+).
 *
 * Phase 1 only handles dummies and players (death = teleport to spawn, restore HP).
 */

import type { World, System, EventBus } from '@rift-and-raid/engine';
import {
  HealthComponent,
  TransformComponent,
} from '@rift-and-raid/engine';
import { PLAYER_DEFAULTS } from '@rift-and-raid/shared';
import {
  PlayerComponent,
  DummyComponent,
  CombatTargetComponent,
  HitFlashComponent,
} from '../prefabs/Components.js';

export interface HealthSystemCallbacks {
  onPlayerDeath: (entity: number) => void;
  onPlayerRespawn: (entity: number) => void;
  onDummyDeath: (entity: number) => void;
}

export class HealthSystem implements System {
  readonly id = 'HealthSystem';
  private eventBus: EventBus;
  private callbacks: HealthSystemCallbacks;

  constructor(eventBus: EventBus, callbacks: HealthSystemCallbacks) {
    this.eventBus = eventBus;
    this.callbacks = callbacks;
  }

  init(_world: World): void {}

  update(world: World, _dt: number): void {
    const now = performance.now();

    // Players: death → respawn at base after delay.
    const players = world.query(PlayerComponent, HealthComponent);
    for (const playerEntity of players) {
      const player = world.getComponent(playerEntity, PlayerComponent);
      const health = world.getComponent(playerEntity, HealthComponent);
      if (!player || !health) continue;

      // Spawn protection countdown.
      if (player.spawnProtectionMs > 0) {
        player.spawnProtectionMs = Math.max(0, player.spawnProtectionMs - 16);
      }

      if (health.current <= 0 && !player.spawnProtectionMs) {
        // Player just died.
        this.callbacks.onPlayerDeath(playerEntity);
        this.eventBus.emit('player:died', { entity: playerEntity });

        // Phase 1: instant respawn at spawn point.
        const transform = world.getComponent(playerEntity, TransformComponent);
        if (transform) {
          // Solari spawn: (-80, 0, -40). Lunari: (80, 0, -40).
          if (player.faction === 'solari') {
            transform.x = -80;
            transform.z = -40;
          } else {
            transform.x = 80;
            transform.z = -40;
          }
        }
        health.current = health.max;
        player.spawnProtectionMs = PLAYER_DEFAULTS.respawnMs;
        this.callbacks.onPlayerRespawn(playerEntity);
        this.eventBus.emit('player:spawned', { entity: playerEntity });
      }
    }

    // Dummies: death → mark dead, let DummySystem respawn.
    const dummies = world.query(DummyComponent, HealthComponent, CombatTargetComponent);
    for (const dummyEntity of dummies) {
      const dummy = world.getComponent(dummyEntity, DummyComponent);
      const health = world.getComponent(dummyEntity, HealthComponent);
      const combat = world.getComponent(dummyEntity, CombatTargetComponent);
      if (!dummy || !health || !combat) continue;

      if (health.current <= 0 && !dummy.dead) {
        dummy.dead = true;
        dummy.diedAt = now;
        combat.attackable = false;
        this.callbacks.onDummyDeath(dummyEntity);
        this.eventBus.emit('monster:killed', { entity: dummyEntity, kind: 'dummy' });
      }
    }

    // Clean up expired hit flashes.
    const flashes = world.query(HitFlashComponent);
    for (const entity of flashes) {
      const flash = world.getComponent(entity, HitFlashComponent);
      if (flash && now > flash.endsAt) {
        world.removeComponent(entity, HitFlashComponent);
      }
    }
  }
}
