/**
 * Rift & Raid — MovementSystem
 *
 * Reads input + ECS velocity and updates TransformComponent. Clamps to
 * world bounds. This is a pure gameplay system — no Three.js interaction.
 *
 * Per GDD §15, sprint = 1.4× base speed (Shift held on PC).
 * Dash (Space) applies an instant burst in input/facing direction.
 */

import type { World, System } from '@rift-and-raid/engine';
import type { InputState } from '@rift-and-raid/engine';
import {
  TransformComponent,
  VelocityComponent,
} from '@rift-and-raid/engine';
import {
  PLAYER_DEFAULTS,
  WORLD_SIZE,
  CLASS_STATS,
  type CharacterClass,
} from '@rift-and-raid/shared';
import { PlayerComponent } from '../prefabs/Components.js';

export class MovementSystem implements System {
  readonly id = 'MovementSystem';
  private getInput: () => InputState;

  constructor(getInput: () => InputState) {
    this.getInput = getInput;
  }

  init(_world: World): void {}

  update(world: World, dt: number): void {
    const input = this.getInput();
    const players = world.query(PlayerComponent, TransformComponent, VelocityComponent);

    for (const playerEntity of players) {
      const player = world.getComponent(playerEntity, PlayerComponent);
      const transform = world.getComponent(playerEntity, TransformComponent);
      const velocity = world.getComponent(playerEntity, VelocityComponent);
      if (!player || !transform || !velocity) continue;

      // Base speed depends on class.
      const baseSpeed = CLASS_STATS[player.characterClass as CharacterClass]?.moveSpeed ?? PLAYER_DEFAULTS.moveSpeed;
      const sprintMult = input.sprintHeld ? PLAYER_DEFAULTS.sprintMultiplier : 1;
      const speed = baseSpeed * sprintMult;

      // Movement from input.
      velocity.x = input.move.x * speed;
      velocity.z = input.move.y * speed;

      transform.x += velocity.x * dt;
      transform.z += velocity.z * dt;

      // Clamp to world bounds (per shared/constants WORLD_SIZE).
      transform.x = Math.max(-WORLD_SIZE.width / 2, Math.min(WORLD_SIZE.width / 2, transform.x));
      transform.z = Math.max(-WORLD_SIZE.depth, Math.min(0, transform.z));

      // Facing: aim takes priority, else movement direction.
      if (input.aimActive) {
        const dx = input.aim.x - transform.x;
        const dz = input.aim.y - transform.z;
        if (Math.hypot(dx, dz) > 0.1) {
          transform.rotation = Math.atan2(dx, dz);
        }
      } else if (Math.hypot(velocity.x, velocity.z) > 0.1) {
        transform.rotation = Math.atan2(velocity.x, velocity.z);
      }

      // Dash (instant burst, on cooldown).
      const now = performance.now();
      if (input.dashPressed && now - player.lastDashAt >= PLAYER_DEFAULTS.dashCooldownMs) {
        player.lastDashAt = now;
        const dashDist = PLAYER_DEFAULTS.dashDistance;
        const hasInput = Math.hypot(input.move.x, input.move.y) > 0.1;
        const dir = hasInput
          ? { x: input.move.x, z: input.move.y }
          : { x: Math.sin(transform.rotation), z: Math.cos(transform.rotation) };
        transform.x += dir.x * dashDist;
        transform.z += dir.z * dashDist;
        // Re-clamp after dash.
        transform.x = Math.max(-WORLD_SIZE.width / 2, Math.min(WORLD_SIZE.width / 2, transform.x));
        transform.z = Math.max(-WORLD_SIZE.depth, Math.min(0, transform.z));
      }
    }
  }
}
