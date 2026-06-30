/**
 * Rift & Raid — SceneManager
 *
 * Wraps THREE.WebGLRenderer + THREE.Scene + manages entity-to-Object3D mapping.
 * The renderer module is the ONLY place in the engine that imports three.
 * Gameplay systems never touch THREE directly — they update ECS transforms,
 * and the SceneManager syncs them to Object3Ds once per frame.
 */

import * as THREE from 'three';
import { CAMERA_CONFIG } from '@rift-and-raid/shared';
import type { Entity } from '../core/ECS.js';

export interface SceneManagerOptions {
  canvas?: HTMLCanvasElement;
  antialias?: boolean;
}

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Map from ECS entity id → THREE.Object3D. */
  private entityObjects = new Map<Entity, THREE.Object3D>();
  /** Camera follow target (entity). */
  private followTarget: Entity | null = null;
  private followPosition = new THREE.Vector3();
  private cameraOffset: THREE.Vector3;

  constructor(opts: SceneManagerOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: opts.antialias ?? true,
      powerPreference: 'high-performance',
    });
    // If no canvas was passed, Three.js creates one as renderer.domElement.
    // We must append it to the DOM and position it to fill the viewport.
    if (!opts.canvas && this.renderer.domElement.parentNode === null) {
      const canvas = this.renderer.domElement;
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.zIndex = '1';
      document.body.appendChild(canvas);
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CAMERA_CONFIG.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87a8c8); // sky blue placeholder
    this.scene.fog = new THREE.Fog(0x87a8c8, 60, 120);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_CONFIG.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    // AoV-style angled top-down camera offset.
    // Pitch 60deg from straight-down: height/distance = sin(60), forward/distance = cos(60)
    const pitchRad = (CAMERA_CONFIG.pitchDeg * Math.PI) / 180;
    const height = CAMERA_CONFIG.distance * Math.sin(pitchRad);
    const forward = CAMERA_CONFIG.distance * Math.cos(pitchRad);
    this.cameraOffset = new THREE.Vector3(0, height, forward);

    this.setupLighting();
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  private setupLighting(): void {
    // Hemisphere light for soft ambient.
    const hemi = new THREE.HemisphereLight(0xb8c8e0, 0x4a3a2a, 0.6);
    this.scene.add(hemi);

    // Directional "sun" with shadows.
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.2);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  /** Add or replace the Object3D for an entity. */
  attachObject(entity: Entity, obj: THREE.Object3D): void {
    const existing = this.entityObjects.get(entity);
    if (existing) {
      this.scene.remove(existing);
    }
    this.entityObjects.set(entity, obj);
    this.scene.add(obj);
  }

  /** Remove and dispose the Object3D for an entity. */
  detachObject(entity: Entity): void {
    const obj = this.entityObjects.get(entity);
    if (!obj) return;
    this.scene.remove(obj);
    this.disposeObject(obj);
    this.entityObjects.delete(entity);
  }

  /** Get the Object3D for an entity (for direct manipulation by renderers). */
  getObject(entity: Entity): THREE.Object3D | undefined {
    return this.entityObjects.get(entity);
  }

  /** Set which entity the camera should follow. */
  setFollowTarget(entity: Entity | null): void {
    this.followTarget = entity;
    if (entity !== null) {
      const obj = this.entityObjects.get(entity);
      if (obj) {
        this.followPosition.copy(obj.position);
      }
    }
  }

  /** Update camera position based on follow target. Call once per render. */
  updateCamera(alpha: number): void {
    if (this.followTarget === null) return;
    const obj = this.entityObjects.get(this.followTarget);
    if (!obj) return;
    // Smooth follow.
    this.followPosition.lerp(obj.position, CAMERA_CONFIG.followLerp);
    const target = this.followPosition.clone().add(this.cameraOffset);
    this.camera.position.copy(target);
    this.camera.lookAt(this.followPosition);
    // `alpha` is interpolation factor between ticks; for simplicity we use
    // lerp here. Phase 2 will add proper state interpolation.
    void alpha;
  }

  /** Render the scene. */
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.dispose();
      }
    });
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    for (const entity of [...this.entityObjects.keys()]) {
      this.detachObject(entity);
    }
    this.renderer.dispose();
  }
}
