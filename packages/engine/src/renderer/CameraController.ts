/**
 * Rift & Raid — CameraController
 *
 * Higher-level camera logic on top of SceneManager. Handles:
 *   - Follow target binding (player-controlled entity)
 *   - Optional zoom (mouse wheel) — disabled by default for fixed AoV view
 *   - Optional pan-look (right-click drag) — disabled by default
 *
 * Per GDD decision #4, camera is FIXED AoV-style — no rotation.
 * We expose zoom as a future hook but keep it disabled.
 */

import * as THREE from 'three';
import type { SceneManager } from './SceneManager.js';
import type { Entity } from '../core/ECS.js';

export class CameraController {
  private sceneManager: SceneManager;
  private target: Entity | null = null;
  private zoomFactor = 1.0;
  private readonly minZoom = 0.7;
  private readonly maxZoom = 1.5;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  follow(entity: Entity | null): void {
    this.target = entity;
    this.sceneManager.setFollowTarget(entity);
  }

  /** Adjust camera distance by factor (mouse wheel). Disabled by default. */
  setZoom(factor: number): void {
    this.zoomFactor = Math.max(this.minZoom, Math.min(this.maxZoom, factor));
    // NOTE: zoom not yet wired into SceneManager offset scaling.
    // Phase 1 will expose this if playtesting wants it.
  }

  get zoom(): number {
    return this.zoomFactor;
  }

  get currentTarget(): Entity | null {
    return this.target;
  }
}

// Re-export THREE here so renderer module consumers don't need to import three directly
// if all they want is the Vector3 type.
export { THREE };
