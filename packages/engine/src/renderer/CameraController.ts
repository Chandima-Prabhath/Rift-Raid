/**
 * Rift & Raid — CameraController
 *
 * Higher-level camera logic on top of SceneManager. Provides:
 *   - Follow target binding (player entity)
 *   - Read access to camera yaw (for camera-relative movement)
 *   - Zoom control (programmatic)
 *
 * The actual camera input (right-click drag, wheel) is handled by
 * SceneManager directly. This class is the gameplay-facing API.
 */

import type { SceneManager } from './SceneManager.js';
import type { Entity } from '../core/ECS.js';

export class CameraController {
  private sceneManager: SceneManager;
  private target: Entity | null = null;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  follow(entity: Entity | null): void {
    this.target = entity;
    this.sceneManager.setFollowTarget(entity);
  }

  /** Current camera yaw in radians (for camera-relative movement). */
  get yaw(): number {
    return this.sceneManager.cameraYaw;
  }

  /** Current camera pitch in radians. */
  get pitch(): number {
    return this.sceneManager.cameraPitch;
  }

  /** Current camera distance from target. */
  get distance(): number {
    return this.sceneManager.cameraDistance;
  }

  get currentTarget(): Entity | null {
    return this.target;
  }
}
