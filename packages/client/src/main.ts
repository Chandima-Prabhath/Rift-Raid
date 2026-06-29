/**
 * Rift & Raid — Client entry point (Phase 0 prototype)
 *
 * Boots the engine and renders a basic scene with a movable capsule that
 * the camera follows. Demonstrates:
 *   - ECS world with player entity (Transform + Velocity + Health + Faction)
 *   - GameLoop running at 60Hz fixed timestep
 *   - SceneManager rendering Three.js scene
 *   - CameraController following the player
 *   - InputManager dispatching to KeyboardMouse + VirtualJoystick
 *   - HUD overlay showing FPS, HP, resources
 *
 * Phase 1 will add: actual combat, dummy target, ability casting.
 * Phase 2 will add: network sync with the server.
 */

import * as THREE from 'three';
import {
  World,
  GameLoop,
  EventBus,
  SceneManager,
  CameraController,
  MaterialSystem,
  ModelRenderer,
  Palette,
  InputManager,
  KeyboardMouse,
  VirtualJoystick,
  HUD,
  TransformComponent,
  VelocityComponent,
  HealthComponent,
  FactionComponent,
} from '@rift-and-raid/engine';
import { PLAYER_DEFAULTS, WORLD_SIZE, type Faction } from '@rift-and-raid/shared';

// ── Bootstrap ──────────────────────────────────────────────────────────────

const boot = document.getElementById('boot')!;

async function main() {
  // 1. Set up engine kernel
  const world = new World();
  const eventBus = new EventBus();

  // 2. Renderer
  const sceneManager = new SceneManager({ antialias: true });
  const materialSystem = new MaterialSystem();
  const modelRenderer = new ModelRenderer(materialSystem);
  const cameraController = new CameraController(sceneManager);

  // 3. Ground plane (200m × 120m per GDD §7.1)
  const ground = modelRenderer.createGround(WORLD_SIZE.width, WORLD_SIZE.depth, Palette.grass);
  ground.position.z = -WORLD_SIZE.depth / 2;
  sceneManager.scene.add(ground);

  // 3b. Mark base locations with colored platforms
  const solariBase = modelRenderer.createBox(8, 0.2, 8, Palette.solariPrimary);
  solariBase.position.set(-80, 0.1, -40);
  sceneManager.scene.add(solariBase);
  const lunariBase = modelRenderer.createBox(8, 0.2, 8, Palette.lunariPrimary);
  lunariBase.position.set(80, 0.1, -40);
  sceneManager.scene.add(lunariBase);

  // 3c. Some resource node placeholders
  for (let i = 0; i < 6; i++) {
    const crystal = modelRenderer.createCrystal(Palette.godshard);
    crystal.position.set(
      (Math.random() - 0.5) * 30,
      0,
      -40 + (Math.random() - 0.5) * 80
    );
    sceneManager.scene.add(crystal);
  }

  // 4. Player entity
  const playerEntity = world.createEntity();
  const transform = world.addComponent(playerEntity, new TransformComponent());
  transform.x = 0;
  transform.y = 0;
  transform.z = -40;
  transform.rotation = 0;
  world.addComponent(playerEntity, new VelocityComponent());
  const health = world.addComponent(playerEntity, new HealthComponent());
  health.current = 130;
  health.max = 130;
  const factionComp = world.addComponent(playerEntity, new FactionComponent());
  factionComp.faction = 'solari' as Faction;

  // Player visual (capsule placeholder)
  const playerMesh = modelRenderer.createCapsule(Palette.solariPrimary);
  playerMesh.position.set(transform.x, transform.y, transform.z);
  sceneManager.attachObject(playerEntity, playerMesh);
  cameraController.follow(playerEntity);

  // 5. Input
  const inputManager = new InputManager();
  const keyboardMouse = new KeyboardMouse();
  const virtualJoystick = new VirtualJoystick();
  inputManager.addAdapter(keyboardMouse);
  inputManager.addAdapter(virtualJoystick);
  inputManager.attach();

  // 6. HUD
  const hud = new HUD();

  // 7. Game loop
  let lastSave = Date.now();
  const loop = new GameLoop({
    update: (dt) => {
      const state = inputManager.update(dt);

      // Update mouse aim world position via raycast.
      // Phase 0: simple ground-plane intersection using camera direction.
      updateAimWorld(sceneManager, keyboardMouse, virtualJoystick, transform);

      // Movement
      const speed = PLAYER_DEFAULTS.moveSpeed;
      const velocity = world.getComponent(playerEntity, VelocityComponent)!;
      velocity.x = state.move.x * speed;
      velocity.z = state.move.y * speed;

      transform.x += velocity.x * dt;
      transform.z += velocity.z * dt;

      // Clamp to world bounds
      transform.x = Math.max(-WORLD_SIZE.width / 2, Math.min(WORLD_SIZE.width / 2, transform.x));
      transform.z = Math.max(-WORLD_SIZE.depth, Math.min(0, transform.z));

      // Rotate to face aim direction (or movement direction if no aim)
      if (state.aimActive) {
        const dx = state.aim.x - transform.x;
        const dz = state.aim.y - transform.z;
        if (Math.hypot(dx, dz) > 0.1) {
          transform.rotation = Math.atan2(dx, dz);
        }
      } else if (Math.hypot(velocity.x, velocity.z) > 0.1) {
        transform.rotation = Math.atan2(velocity.x, velocity.z);
      }

      // Sync mesh to ECS transform
      const mesh = sceneManager.getObject(playerEntity);
      if (mesh) {
        mesh.position.set(transform.x, transform.y, transform.z);
        mesh.rotation.y = transform.rotation;
      }

      // Attack (visual feedback: scale pulse)
      if (state.attackPressed) {
        eventBus.emit('player:attack', { entity: playerEntity });
        if (mesh) {
          mesh.scale.set(1.1, 1.1, 1.1);
          setTimeout(() => mesh.scale.set(1, 1, 1), 100);
        }
      }

      // Dash
      if (state.dashPressed) {
        const dashDist = PLAYER_DEFAULTS.dashDistance;
        const dir = Math.hypot(state.move.x, state.move.y) > 0.1
          ? { x: state.move.x, z: state.move.y }
          : { x: Math.sin(transform.rotation), z: Math.cos(transform.rotation) };
        transform.x += dir.x * dashDist;
        transform.z += dir.z * dashDist;
      }

      world.clearDirtyFlag();
      eventBus.emit('world:tick', { dt });

      // Update HUD stats
      hud.setStats({
        fps: loop.fps,
        tickRate: loop.tickRate,
        entityCount: world.entityCount,
        playerHp: health.current,
        playerMaxHp: health.max,
        playerResources: { iron: 5, emberwood: 3, godshard: 1 },
      });

      // Demo: drain HP slowly to show health bar; restore on dash.
      // (Phase 1 will add real combat.)
      // Skip — leave HP static for Phase 0.
    },
    render: (alpha) => {
      sceneManager.updateCamera(alpha);
      sceneManager.render();
    },
  });

  loop.start();

  // Hide boot screen
  setTimeout(() => {
    boot.classList.add('hidden');
    setTimeout(() => boot.remove(), 500);
  }, 300);

  // Save stats every 5s for debug
  setInterval(() => {
    // no-op for Phase 0
  }, 5000);

  void lastSave;
}

/**
 * Project mouse position onto the ground plane (y=0) to get world-space aim.
 * Phase 0: simple raycaster against the ground plane.
 */
function updateAimWorld(
  sceneManager: SceneManager,
  keyboardMouse: KeyboardMouse,
  virtualJoystick: VirtualJoystick,
  playerTransform: TransformComponent
) {
  // Use a raycaster from camera through mouse NDC.
  const ndc = getMouseNDC();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, sceneManager.camera);
  // Intersect with y=0 plane.
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, point)) {
    keyboardMouse.setAimWorld(point.x, point.z);
    virtualJoystick.setAimWorld(playerTransform.x, playerTransform.z);
  }
}

let mouseNDC = { x: 0, y: 0 };
window.addEventListener('mousemove', (e) => {
  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

function getMouseNDC(): { x: number; y: number } {
  return mouseNDC;
}

main().catch((err) => {
  console.error('Boot failed:', err);
  boot.innerHTML = `<div style="color:#f44;padding:20px;">Boot failed: ${err.message}</div>`;
});
