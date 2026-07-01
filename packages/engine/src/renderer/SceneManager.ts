/**
 * Rift & Raid — SceneManager
 *
 * Wraps THREE.WebGLRenderer + THREE.Scene + manages entity-to-Object3D mapping.
 *
 * Camera system:
 *   - Third-person angled view (pitch 40° from horizon by default)
 *   - 360° yaw rotation via right-click drag (desktop) or two-finger drag (mobile)
 *   - Pitch adjustable via right-click vertical drag (clamped 20°–75°)
 *   - Zoom via mouse wheel (desktop) or pinch (mobile)
 *   - Smooth follow with lerp
 *
 * The camera orbits the follow target. Movement systems read cameraYaw
 * to make WASD movement camera-relative (W = away from camera, not north).
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

  /** Camera orbit state. */
  private yaw: number;   // rotation around Y axis (radians)
  private pitch: number; // angle from horizon toward down (radians)
  private distance: number;

  // Right-click drag state
  private isDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;

  // Pinch state (mobile)
  private pinchActive = false;
  private pinchStartDist = 0;
  private pinchStartDistance = 0;

  // Auto-follow: the camera gradually rotates to stay behind the player
  // when they move. The game sets targetAutoYaw based on movement direction.
  private autoFollowEnabled = true;
  private targetAutoYaw: number | null = null;

  constructor(opts: SceneManagerOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: opts.antialias ?? true,
      powerPreference: 'high-performance',
    });
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
    this.scene.background = new THREE.Color(0x87a8c8);
    this.scene.fog = new THREE.Fog(0x87a8c8, 80, 180);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA_CONFIG.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    // Initialize camera orbit from config.
    this.yaw = CAMERA_CONFIG.initialYaw;
    this.pitch = (CAMERA_CONFIG.pitchDeg * Math.PI) / 180;
    this.distance = CAMERA_CONFIG.distance;

    this.setupLighting();
    this.setupCameraControls();
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight(0xb8c8e0, 0x4a3a2a, 0.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0d0, 1.3);
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

    // Ambient fill so shadows aren't pure black.
    this.scene.add(new THREE.AmbientLight(0x404050, 0.4));
  }

  // --------------------------------------------------------------------------
  // Camera controls
  // --------------------------------------------------------------------------
  // Controls:
  //   - Right-click drag OR Middle-click drag → orbit camera (yaw + pitch)
  //   - Mouse wheel → zoom
  //   - Touch: two-finger drag → orbit, pinch → zoom
  //
  // Design:
  //   - Horizontal drag: drag RIGHT → world rotates right (yaw decreases)
  //   - Vertical drag: drag UP → camera tilts up (pitch decreases, more horizon)
  //   - This matches natural "grab the world and pull it" intuition.
  // --------------------------------------------------------------------------

  private setupCameraControls(): void {
    const el = this.renderer.domElement;

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 2 && e.button !== 1) return;
      this.isDragging = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastDragX;
      const dy = e.clientY - this.lastDragY;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      // Drag right → yaw decreases (world rotates right).
      // Drag up (dy<0) → pitch decreases (camera tilts up toward horizon).
      // Drag down (dy>0) → pitch increases (camera tilts down, more top-down).
      this.yaw -= dx * CAMERA_CONFIG.yawSpeed;
      this.pitch = this.clampPitch(this.pitch + dy * CAMERA_CONFIG.pitchSpeed);
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2 || e.button === 1) this.isDragging = false;
    });

    el.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse wheel zoom.
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY * 0.01;
      this.distance = Math.max(
        CAMERA_CONFIG.minDistance,
        Math.min(CAMERA_CONFIG.maxDistance, this.distance + delta)
      );
    }, { passive: false });

    // Touch: two-finger drag rotates + pinches zoom.
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        this.pinchActive = true;
        this.lastDragX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        this.lastDragY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        this.pinchStartDist = this.touchDistance(e.touches);
        this.pinchStartDistance = this.distance;
      }
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this.pinchActive) {
        e.preventDefault();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const dx = midX - this.lastDragX;
        const dy = midY - this.lastDragY;
        this.lastDragX = midX;
        this.lastDragY = midY;
        this.yaw -= dx * CAMERA_CONFIG.yawSpeed;
        this.pitch = this.clampPitch(this.pitch + dy * CAMERA_CONFIG.pitchSpeed);

        // Pinch zoom.
        const currentDist = this.touchDistance(e.touches);
        const scale = this.pinchStartDist / currentDist;
        this.distance = Math.max(
          CAMERA_CONFIG.minDistance,
          Math.min(CAMERA_CONFIG.maxDistance, this.pinchStartDistance * scale)
        );
      }
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) this.pinchActive = false;
    });
  }

  private touchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  private clampPitch(p: number): number {
    const min = (CAMERA_CONFIG.minPitchDeg * Math.PI) / 180;
    const max = (CAMERA_CONFIG.maxPitchDeg * Math.PI) / 180;
    return Math.max(min, Math.min(max, p));
  }

  /**
   * Set the target yaw for auto-follow. When the player moves, pass the
   * movement direction here and the camera will smoothly rotate to stay
   * behind the player. Pass null to disable auto-follow (e.g., when idle).
   */
  setAutoFollowYaw(yaw: number | null): void {
    this.targetAutoYaw = yaw;
  }

  /** Enable/disable auto-follow entirely. */
  setAutoFollowEnabled(enabled: boolean): void {
    this.autoFollowEnabled = enabled;
  }

  /** Current camera yaw (for camera-relative movement). */
  get cameraYaw(): number {
    return this.yaw;
  }

  /** Current camera pitch. */
  get cameraPitch(): number {
    return this.pitch;
  }

  /** Current camera distance from target. */
  get cameraDistance(): number {
    return this.distance;
  }

  // --------------------------------------------------------------------------
  // Entity object management
  // --------------------------------------------------------------------------

  attachObject(entity: Entity, obj: THREE.Object3D): void {
    const existing = this.entityObjects.get(entity);
    if (existing) this.scene.remove(existing);
    this.entityObjects.set(entity, obj);
    this.scene.add(obj);
  }

  detachObject(entity: Entity): void {
    const obj = this.entityObjects.get(entity);
    if (!obj) return;
    this.scene.remove(obj);
    this.disposeObject(obj);
    this.entityObjects.delete(entity);
  }

  getObject(entity: Entity): THREE.Object3D | undefined {
    return this.entityObjects.get(entity);
  }

  setFollowTarget(entity: Entity | null): void {
    this.followTarget = entity;
    if (entity !== null) {
      const obj = this.entityObjects.get(entity);
      if (obj) this.followPosition.copy(obj.position);
    }
  }

  // --------------------------------------------------------------------------
  // Camera update
  // --------------------------------------------------------------------------

  /** Update camera position based on follow target + orbit angles. */
  updateCamera(alpha: number): void {
    if (this.followTarget === null) return;
    const obj = this.entityObjects.get(this.followTarget);
    if (!obj) return;

    // Smooth follow.
    this.followPosition.lerp(obj.position, CAMERA_CONFIG.followLerp);

    // Auto-follow: smoothly rotate yaw toward targetAutoYaw when set.
    // This makes the camera stay behind the player as they move.
    // Skip if the user is manually dragging.
    if (this.autoFollowEnabled && this.targetAutoYaw !== null && !this.isDragging) {
      // Find shortest angular path (handle wraparound at ±π).
      let diff = this.targetAutoYaw - this.yaw;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      // Slow lerp — camera takes ~1s to catch up. Lower = slower/smoother.
      this.yaw += diff * 0.04;
    }

    // Spherical → Cartesian offset.
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);

    const offsetX = -sinYaw * cosPitch * this.distance;
    const offsetY = sinPitch * this.distance;
    const offsetZ = cosYaw * cosPitch * this.distance;

    this.camera.position.set(
      this.followPosition.x + offsetX,
      this.followPosition.y + offsetY,
      this.followPosition.z + offsetZ
    );
    this.camera.lookAt(this.followPosition);
    void alpha;
  }

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
