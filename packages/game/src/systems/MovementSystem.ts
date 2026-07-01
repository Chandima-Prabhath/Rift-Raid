/**
 * Rift & Raid — MovementSystem
 *
 * Camera-relative movement:
 *   - W (move.y = -1) → moves away from camera (forward in screen space)
 *   - S (move.y = +1) → moves toward camera
 *   - A (move.x = -1) → moves left relative to camera
 *   - D (move.x = +1) → moves right relative to camera
 *
 * The input vector (move.x, move.y) is rotated by the camera yaw before
 * being applied to the world-space velocity. This is the standard
 * third-person / MOBA control scheme.
 *
 * Facing: the character faces the MOVEMENT direction (not the aim point),
 * which feels natural for a third-person action game. Aim is handled
 * separately by the combat system (melee arc / projectile direction).
 *
 * Sprint = 1.4× speed (Shift held).
 * Dash = instant burst in input/facing direction (Space, on cooldown).
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
  private getCameraYaw: () => number;

  constructor(getInput: () => InputState, getCameraYaw: () => number = () => 0) {
    this.getInput = getInput;
    this.getCameraYaw = getCameraYaw;
  }

  init(_world: World): void {}

  update(world: World, dt: number): void {
    const input = this.getInput();
    const cameraYaw = this.getCameraYaw();
    const players = world.query(PlayerComponent, TransformComponent, VelocityComponent);

    // Camera-relative movement: rotate input vector by camera yaw.
    //
    // The camera looks toward -Z when yaw=0 (i.e., the player is "in front"
    // of the camera on the -Z side). So:
    //   - "Forward" (W, move.y=-1) should move the player toward -Z in camera space.
    //   - We rotate the input vector by -cameraYaw to convert from camera space
    //     to world space.
    //
    // Rotation matrix for angle θ (counter-clockwise around Y, looking down):
    //   x' = x*cos(θ) + z*sin(θ)
    //   z' = -x*sin(θ) + z*cos(θ)
    //
    // But our input is (move.x=right, move.y=forward). We treat move.y as the
    // forward/back axis (mapped to z) and move.x as the strafe axis (mapped to x).
    // We negate cameraYaw because rotating the world by +yaw means we rotate
    // the input by -yaw to compensate.
    const cosY = Math.cos(-cameraYaw);
    const sinY = Math.sin(-cameraYaw);
    const worldMoveX = input.move.x * cosY + input.move.y * sinY;
    const worldMoveZ = -input.move.x * sinY + input.move.y * cosY;

    for (const playerEntity of players) {
      const player = world.getComponent(playerEntity, PlayerComponent);
      const transform = world.getComponent(playerEntity, TransformComponent);
      const velocity = world.getComponent(playerEntity, VelocityComponent);
      if (!player || !transform || !velocity) continue;

      // Only the local player reads input. Remote players are synced via network.
      if (player.playerId !== 'local') continue;

      // Base speed depends on class.
      const baseSpeed = CLASS_STATS[player.characterClass as CharacterClass]?.moveSpeed ?? PLAYER_DEFAULTS.moveSpeed;
      const sprintMult = input.sprintHeld ? PLAYER_DEFAULTS.sprintMultiplier : 1;
      const speed = baseSpeed * sprintMult;

      // Apply camera-relative movement.
      velocity.x = worldMoveX * speed;
      velocity.z = worldMoveZ * speed;

      transform.x += velocity.x * dt;
      transform.z += velocity.z * dt;

      // Clamp to world bounds.
      transform.x = Math.max(-WORLD_SIZE.width / 2, Math.min(WORLD_SIZE.width / 2, transform.x));
      transform.z = Math.max(-WORLD_SIZE.depth, Math.min(0, transform.z));

      // Facing: character faces movement direction.
      // Kenney character models face +Z at rotation 0 after SkinnedMesh
      // conversion. atan2(vx, vz) gives the correct angle for +Z-forward.
      const moveMag = Math.hypot(velocity.x, velocity.z);
      if (moveMag > 0.1) {
        transform.rotation = Math.atan2(velocity.x, velocity.z);
      }

      // Dash (instant burst, on cooldown) — also camera-relative.
      const now = performance.now();
      if (input.dashPressed && now - player.lastDashAt >= PLAYER_DEFAULTS.dashCooldownMs) {
        player.lastDashAt = now;
        const dashDist = PLAYER_DEFAULTS.dashDistance;
        const hasInput = Math.hypot(input.move.x, input.move.y) > 0.1;
        const dir = hasInput
          ? { x: worldMoveX, z: worldMoveZ }
          : { x: Math.sin(transform.rotation), z: Math.cos(transform.rotation) };
        // Normalize dash direction.
        const dlen = Math.hypot(dir.x, dir.z);
        if (dlen > 0.001) {
          dir.x /= dlen;
          dir.z /= dlen;
        }
        transform.x += dir.x * dashDist;
        transform.z += dir.z * dashDist;
        transform.x = Math.max(-WORLD_SIZE.width / 2, Math.min(WORLD_SIZE.width / 2, transform.x));
        transform.z = Math.max(-WORLD_SIZE.depth, Math.min(0, transform.z));
      }
    }
  }
}
