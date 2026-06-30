/**
 * Rift & Raid — HealthBarSystem
 *
 * Renders 3D health bars above entities that have a HealthBarComponent.
 * Uses simple plane meshes that always face the camera (billboard effect).
 *
 * Phase 1: simple two-tone bar (red fill on dark background).
 * Phase 3+: improved visuals (faction-colored, segments for boss HP, etc.)
 */

import * as THREE from 'three';
import type { World, System } from '@rift-and-raid/engine';
import {
  HealthComponent,
  TransformComponent,
} from '@rift-and-raid/engine';
import { HealthBarComponent } from '../prefabs/Components.js';

export interface HealthBarSystemCallbacks {
  /** Get the THREE.Scene to add bar meshes to. */
  getScene: () => THREE.Scene;
  /** Get the active camera (for billboard orientation). */
  getCamera: () => THREE.Camera;
}

interface BarVisuals {
  bg: THREE.Mesh;
  fill: THREE.Mesh;
  fillWidth: number;
}

export class HealthBarSystem implements System {
  readonly id = 'HealthBarSystem';
  private callbacks: HealthBarSystemCallbacks;
  private scene!: THREE.Scene;
  private camera!: THREE.Camera;
  private bgGeo: THREE.PlaneGeometry;
  private fillGeo: THREE.PlaneGeometry;
  private bgMat: THREE.MeshBasicMaterial;
  private fillMat: THREE.MeshBasicMaterial;
  /** Track visuals per entity for cleanup. */
  private visuals = new Map<number, BarVisuals>();

  constructor(callbacks: HealthBarSystemCallbacks) {
    this.callbacks = callbacks;
    this.bgGeo = new THREE.PlaneGeometry(1.2, 0.16);
    this.fillGeo = new THREE.PlaneGeometry(1.16, 0.12);
    this.bgMat = new THREE.MeshBasicMaterial({
      color: 0x101020, depthTest: false, transparent: true, opacity: 0.85,
    });
    this.fillMat = new THREE.MeshBasicMaterial({
      color: 0xe44, depthTest: false, transparent: true,
    });
  }

  init(_world: World): void {
    this.scene = this.callbacks.getScene();
    this.camera = this.callbacks.getCamera();
  }

  update(world: World, _dt: number): void {
    const bars = world.query(HealthBarComponent, HealthComponent);
    // Clean up bars for dead/removed entities.
    const validEntities = new Set(bars);

    for (const [entity, _visuals] of this.visuals) {
      if (!validEntities.has(entity)) {
        this.removeBar(entity);
      }
    }

    for (const entity of bars) {
      const bar = world.getComponent(entity, HealthBarComponent);
      const health = world.getComponent(entity, HealthComponent);
      const transform = world.getComponent(entity, TransformComponent);
      if (!bar || !health || !transform) continue;

      // Lazily create meshes.
      let v = this.visuals.get(entity);
      if (!v) {
        const bg = new THREE.Mesh(this.bgGeo, this.bgMat);
        const fill = new THREE.Mesh(this.fillGeo, this.fillMat);
        bg.renderOrder = 999;
        fill.renderOrder = 1000;
        this.scene.add(bg);
        this.scene.add(fill);
        v = { bg, fill, fillWidth: 1.16 };
        this.visuals.set(entity, v);
      }

      // Position above the entity.
      const barY = transform.y + bar.heightOffset;
      v.bg.position.set(transform.x, barY, transform.z);
      v.fill.position.set(transform.x, barY, transform.z);

      // Billboard: face the camera.
      v.bg.quaternion.copy(this.camera.quaternion);
      v.fill.quaternion.copy(this.camera.quaternion);

      // Update fill: scale X by HP ratio, then offset so the LEFT edge
      // stays anchored (bar shrinks from the right).
      const ratio = Math.max(0, health.current / health.max);
      v.fill.scale.x = ratio;

      // In the bar's local space, the fill is centered. To anchor left,
      // shift it by (1 - ratio) * (fillWidth / 2) along the bar's local +X.
      // The bar's local +X in world space = camera's right vector (XZ only).
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      camRight.y = 0;
      camRight.normalize();
      const shift = (1 - ratio) * (v.fillWidth / 2);
      v.fill.position.x = transform.x + camRight.x * shift;
      v.fill.position.z = transform.z + camRight.z * shift;
    }
  }

  private removeBar(entity: number): void {
    const v = this.visuals.get(entity);
    if (!v) return;
    this.scene.remove(v.bg);
    this.scene.remove(v.fill);
    // Don't dispose shared geometries/materials — they're reused.
    this.visuals.delete(entity);
  }

  dispose(): void {
    for (const entity of [...this.visuals.keys()]) {
      this.removeBar(entity);
    }
    this.bgGeo.dispose();
    this.fillGeo.dispose();
    this.bgMat.dispose();
    this.fillMat.dispose();
  }
}
