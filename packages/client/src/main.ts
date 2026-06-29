/**
 * Rift & Raid — Client entry point (Phase 1 prototype)
 *
 * Boots the engine and renders a playable combat prototype:
 *   - WASD/arrows to move, mouse to aim, click to attack, Space to dash
 *   - 1/2/3 keys to swap between Warrior / Ranger / Mage
 *   - 3 training dummies that take damage, die, and respawn
 *   - Floating damage numbers
 *   - HP bars above all entities
 *   - AoV-style fixed angled camera that follows the player
 *
 * Phase 1 success criteria (per GDD §10):
 *   "Character moves smoothly on PC + mobile, attack hits dummy"
 */

import * as THREE from 'three';
import {
  // Core
  World,
  GameLoop,
  EventBus,
  Events,
  // Renderer
  SceneManager,
  CameraController,
  MaterialSystem,
  ModelRenderer,
  Palette,
  // Assets
  ContentRegistry,
  // Input
  InputManager,
  KeyboardMouse,
  VirtualJoystick,
  // Engine components
  TransformComponent,
  HealthComponent,
  // UI
  HUD,
} from '@rift-and-raid/engine';
import { loadAllContent } from '@rift-and-raid/game';
import {
  // Prefabs
  createPlayer,
  createDummy,
  // Components
  PlayerComponent,
  CombatTargetComponent,
  DummyComponent,
  ProjectileComponent,
  HealthBarComponent,
  // Systems
  MovementSystem,
  CombatSystem,
  ProjectileSystem,
  HealthSystem,
  DummySystem,
  DamageNumberSystem,
  HealthBarSystem,
  ClassSelectSystem,
} from '@rift-and-raid/game';
import { CLASS_STATS, WORLD_SIZE, type CharacterClass } from '@rift-and-raid/shared';

// ── Bootstrap ──────────────────────────────────────────────────────────────

const boot = document.getElementById('boot')!;

async function main() {
  // 1. Engine kernel
  const world = new World();
  const eventBus = new EventBus();

  // 2. Content
  const content = new ContentRegistry();
  await loadAllContent(content);
  console.log(content.summary());

  // 3. Renderer
  const sceneManager = new SceneManager({ antialias: true });
  const materialSystem = new MaterialSystem();
  const modelRenderer = new ModelRenderer(materialSystem);
  const cameraController = new CameraController(sceneManager);

  // 4. Ground + base markers + decorative crystals (from Phase 0)
  const ground = modelRenderer.createGround(WORLD_SIZE.width, WORLD_SIZE.depth, Palette.grass);
  ground.position.z = -WORLD_SIZE.depth / 2;
  sceneManager.scene.add(ground);

  const solariBase = modelRenderer.createBox(8, 0.2, 8, Palette.solariPrimary);
  solariBase.position.set(-80, 0.1, -40);
  sceneManager.scene.add(solariBase);

  const lunariBase = modelRenderer.createBox(8, 0.2, 8, Palette.lunariPrimary);
  lunariBase.position.set(80, 0.1, -40);
  sceneManager.scene.add(lunariBase);

  // 5. Player entity
  const playerEntity = createPlayer(world, {
    class: 'warrior',
    faction: 'solari',
    position: { x: 0, y: 0, z: -20 },
  });
  const playerMesh = modelRenderer.createCapsule(Palette.solariPrimary);
  const playerTransform = world.getComponent(playerEntity, TransformComponent)!;
  playerMesh.position.set(playerTransform.x, playerTransform.y, playerTransform.z);
  sceneManager.attachObject(playerEntity, playerMesh);
  cameraController.follow(playerEntity);

  // 6. Dummies — cluster of 3 in front of player
  const dummyPositions = [
    { x: 0, y: 0, z: -35 },
    { x: -4, y: 0, z: -32 },
    { x: 4, y: 0, z: -32 },
  ];
  for (const pos of dummyPositions) {
    const dummyEntity = createDummy(world, { position: pos, hp: 60 });
    const dummyMesh = modelRenderer.createCapsule(0x808090, 1.6, 0.45);
    dummyMesh.position.set(pos.x, pos.y, pos.z);
    sceneManager.attachObject(dummyEntity, dummyMesh);
  }

  // 7. Input
  const inputManager = new InputManager();
  const keyboardMouse = new KeyboardMouse();
  const virtualJoystick = new VirtualJoystick();
  inputManager.addAdapter(keyboardMouse);
  inputManager.addAdapter(virtualJoystick);
  inputManager.attach();

  // 8. HUD
  const hud = new HUD();

  // 9. Systems
  // Track projectile visual meshes for cleanup.
  const projectileMeshes = new Map<number, THREE.Mesh>();

  const systems = [
    new ClassSelectSystem(content, {
      onClassChange: (entity, newClass, color) => {
        const mesh = sceneManager.getObject(entity);
        if (!mesh) return;
        // Swap capsule color by replacing material.
        mesh.traverse((child) => {
          const m = child as THREE.Mesh;
          if (m.geometry instanceof THREE.CapsuleGeometry) {
            m.material = materialSystem.flat(color);
          }
        });
        const stats = CLASS_STATS[newClass];
        console.log(`[Class] swapped to ${newClass} (HP ${stats.hp}, speed ${stats.moveSpeed})`);
      },
    }),
    new MovementSystem(() => inputManager.getState()),
    new CombatSystem(content, () => inputManager.getState(), (entity, proj) => {
      // Create projectile visual.
      const geo = new THREE.SphereGeometry(proj.radius, 8, 6);
      const mat = new THREE.MeshBasicMaterial({ color: proj.color });
      const mesh = new THREE.Mesh(geo, mat);
      const t = world.getComponent(entity, TransformComponent);
      if (t) mesh.position.set(t.x, t.y, t.z);
      sceneManager.scene.add(mesh);
      projectileMeshes.set(entity, mesh);
    }),
    new ProjectileSystem({
      onSpawn: () => { /* mesh created in CombatSystem callback above */ },
      onDestroy: (entity) => {
        const mesh = projectileMeshes.get(entity);
        if (mesh) {
          sceneManager.scene.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          projectileMeshes.delete(entity);
        }
      },
      onHit: (_proj, target, _dmg) => {
        // Visual feedback: scale pulse on target.
        const mesh = sceneManager.getObject(target);
        if (mesh) {
          mesh.scale.set(1.2, 1.2, 1.2);
          setTimeout(() => mesh.scale.set(1, 1, 1), 80);
        }
      },
    }),
    new HealthSystem(eventBus, {
      onPlayerDeath: (entity) => console.log(`[Player] ${entity} died — respawning`),
      onPlayerRespawn: (entity) => console.log(`[Player] ${entity} respawned`),
      onDummyDeath: (entity) => {
        const mesh = sceneManager.getObject(entity);
        if (mesh) {
          // Hide mesh on death (DummySystem will show it again on respawn).
          mesh.visible = false;
        }
        console.log(`[Dummy] ${entity} destroyed — respawning in 3s`);
      },
    }),
    new DummySystem({
      onRespawn: (entity) => {
        const mesh = sceneManager.getObject(entity);
        if (mesh) mesh.visible = true;
      },
    }),
    new DamageNumberSystem({
      worldToScreen: (x, y, z) => projectToScreen(sceneManager, x, y, z),
    }),
    new HealthBarSystem({
      getScene: () => sceneManager.scene,
      getCamera: () => sceneManager.camera,
    }),
  ];

  for (const sys of systems) sys.init?.(world);

  // 10. Mouse aim world projection (called every frame)
  let mouseNDC = { x: 0, y: 0 };
  window.addEventListener('mousemove', (e) => {
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  function updateAimWorld() {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouseNDC, sceneManager.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, point)) {
      keyboardMouse.setAimWorld(point.x, point.z);
      virtualJoystick.setAimWorld(playerTransform.x, playerTransform.z);
    }
  }

  // 11. Game loop
  const loop = new GameLoop({
    update: (dt) => {
      // Update input (refreshes edge-triggered flags).
      inputManager.update(dt);

      // Update mouse aim world position.
      updateAimWorld();

      // Run all gameplay systems.
      for (const sys of systems) {
        sys.update(world, dt);
      }

      // Sync player mesh to ECS transform.
      const playerMesh3d = sceneManager.getObject(playerEntity);
      if (playerMesh3d) {
        playerMesh3d.position.set(playerTransform.x, playerTransform.y, playerTransform.z);
        playerMesh3d.rotation.y = playerTransform.rotation;
      }

      // Sync dummy meshes.
      const dummies = world.query(DummyComponent, TransformComponent);
      for (const dummyEntity of dummies) {
        const dt2 = world.getComponent(dummyEntity, TransformComponent);
        const mesh = sceneManager.getObject(dummyEntity);
        if (dt2 && mesh) {
          mesh.position.set(dt2.x, dt2.y, dt2.z);
        }
      }

      // Sync projectile meshes.
      const projectiles = world.query(ProjectileComponent, TransformComponent);
      for (const projEntity of projectiles) {
        const pt = world.getComponent(projEntity, TransformComponent);
        const mesh = projectileMeshes.get(projEntity);
        if (pt && mesh) {
          mesh.position.set(pt.x, pt.y, pt.z);
        }
      }

      // HUD update.
      const playerHealth = world.getComponent(playerEntity, HealthComponent);
      const player = world.getComponent(playerEntity, PlayerComponent);
      if (playerHealth && player) {
        hud.setStats({
          fps: loop.fps,
          tickRate: loop.tickRate,
          entityCount: world.entityCount,
          playerHp: playerHealth.current,
          playerMaxHp: playerHealth.max,
          playerResources: {
            iron: player.inventory.iron,
            emberwood: player.inventory.emberwood,
            godshard: player.inventory.godshard,
          },
        });
      }

      world.clearDirtyFlag();
      eventBus.emit(Events.WORLD_TICK, { dt });
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
}

/**
 * Project a world position to screen pixel coordinates.
 * Returns null if the point is behind the camera.
 */
function projectToScreen(
  sceneManager: SceneManager,
  x: number,
  y: number,
  z: number
): { x: number; y: number; visible: boolean } | null {
  const v = new THREE.Vector3(x, y, z);
  v.project(sceneManager.camera);
  // v.z is in NDC [-1, 1]; behind camera if z > 1.
  if (v.z > 1) return { x: 0, y: 0, visible: false };
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    visible: true,
  };
}

main().catch((err) => {
  console.error('Boot failed:', err);
  boot.innerHTML = `<div style="color:#f44;padding:20px;">Boot failed: ${err.message}</div>`;
});
