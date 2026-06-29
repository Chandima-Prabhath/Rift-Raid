/**
 * Rift & Raid — Client entry point (Phase 2 prototype)
 *
 * Multiplayer skeleton with Colyseus:
 *   - Connects to ws://localhost:2567/rift-raid room
 *   - Local player spawns when connection is established
 *   - Remote players spawn when their state arrives from server
 *   - Movement + dash + class swap are sent to server (server-authoritative)
 *   - Chat (press Enter to type, broadcast to room)
 *
 * Phase 2 success criteria (per GDD §10):
 *   "2 friends in different rooms see each other in real-time"
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
  createDummy,
  // Components
  PlayerComponent,
  DummyComponent,
  ProjectileComponent,
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
import {
  WORLD_SIZE,
  CLASS_STATS,
  type CharacterClass,
} from '@rift-and-raid/shared';
import { NetworkSystem } from './NetworkSystem.js';
import { ChatUI } from './ChatUI.js';

// ── Bootstrap ──────────────────────────────────────────────────────────────

const boot = document.getElementById('boot')!;

// Default to localhost; override via ?server= query param for remote play.
const SERVER_URL = new URLSearchParams(window.location.search).get('server')
  ?? 'ws://localhost:2567';

const COLOR_BY_CLASS: Record<CharacterClass, number> = {
  warrior: 0xd97742,
  ranger: 0x60a060,
  mage: 0x9050c0,
};

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

  // 4. Ground + base markers
  const ground = modelRenderer.createGround(WORLD_SIZE.width, WORLD_SIZE.depth, Palette.grass);
  ground.position.z = -WORLD_SIZE.depth / 2;
  sceneManager.scene.add(ground);

  const solariBase = modelRenderer.createBox(8, 0.2, 8, Palette.solariPrimary);
  solariBase.position.set(-80, 0.1, -40);
  sceneManager.scene.add(solariBase);

  const lunariBase = modelRenderer.createBox(8, 0.2, 8, Palette.lunariPrimary);
  lunariBase.position.set(80, 0.1, -40);
  sceneManager.scene.add(lunariBase);

  // 5. Dummies (still local-only in Phase 2; Phase 4+ adds them to server)
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

  // 6. Input
  const inputManager = new InputManager();
  const keyboardMouse = new KeyboardMouse();
  const virtualJoystick = new VirtualJoystick();
  inputManager.addAdapter(keyboardMouse);
  inputManager.addAdapter(virtualJoystick);
  inputManager.attach();

  // 7. HUD
  const hud = new HUD();

  // 8. Chat UI
  let chatUI: ChatUI | null = null;

  // 9. Track meshes for remote players (entity → mesh).
  const playerMeshes = new Map<number, THREE.Group>();
  const projectileMeshes = new Map<number, THREE.Mesh>();

  // 10. Network system
  const network = new NetworkSystem(
    world,
    SERVER_URL,
    () => inputManager.getState(),
    {
      onPlayerSpawn: (entity, _sessionId, isLocal, color) => {
        const mesh = modelRenderer.createCapsule(color);
        const transform = world.getComponent(entity, TransformComponent);
        if (transform) {
          mesh.position.set(transform.x, transform.y, transform.z);
        }
        sceneManager.attachObject(entity, mesh);
        playerMeshes.set(entity, mesh);

        // Camera follows the local player.
        if (isLocal) {
          cameraController.follow(entity);
          console.log(`[Client] Local player entity ${entity}, camera following`);
        }
      },
      onPlayerUpdate: (entity, x, y, z, rotation, _color) => {
        const mesh = playerMeshes.get(entity) ?? sceneManager.getObject(entity) as THREE.Group | undefined;
        if (mesh) {
          mesh.position.set(x, y, z);
          mesh.rotation.y = rotation;
        }
      },
      onPlayerLeave: (entity, _sessionId) => {
        sceneManager.detachObject(entity);
        playerMeshes.delete(entity);
      },
      onChat: (payload) => {
        chatUI?.addMessage(payload);
      },
      onConnectionStateChange: (state) => {
        console.log(`[Client] Network: ${state}`);
        if (state === 'error') {
          boot.innerHTML = `<div style="color:#f44;padding:20px;font-family:sans-serif;">
            <h2>Cannot connect to server</h2>
            <p>Make sure the server is running: <code>bun run dev:server</code></p>
            <p>Server URL: <code>${SERVER_URL}</code></p>
            <p>You can override with <code>?server=ws://your-host:2567</code></p>
          </div>`;
        }
      },
    }
  );

  chatUI = new ChatUI((text) => network.sendChat(text));

  // 11. Systems
  const systems = [
    new ClassSelectSystem(content, {
      onClassChange: (entity, newClass, color) => {
        const mesh = sceneManager.getObject(entity);
        if (mesh) {
          mesh.traverse((child) => {
            const m = child as THREE.Mesh;
            if (m.geometry instanceof THREE.CapsuleGeometry) {
              m.material = materialSystem.flat(color);
            }
          });
        }
        // Notify server about the class swap.
        network.sendClassSwap(newClass);
        const stats = CLASS_STATS[newClass];
        console.log(`[Class] swapped to ${newClass} (HP ${stats.hp}, speed ${stats.moveSpeed})`);
      },
    }),
    new MovementSystem(() => inputManager.getState()),
    new CombatSystem(content, () => inputManager.getState(), (entity, proj) => {
      const geo = new THREE.SphereGeometry(proj.radius, 8, 6);
      const mat = new THREE.MeshBasicMaterial({ color: proj.color });
      const mesh = new THREE.Mesh(geo, mat);
      const t = world.getComponent(entity, TransformComponent);
      if (t) mesh.position.set(t.x, t.y, t.z);
      sceneManager.scene.add(mesh);
      projectileMeshes.set(entity, mesh);
    }),
    new ProjectileSystem({
      onSpawn: () => {},
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
        if (mesh) mesh.visible = false;
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

  // 12. Mouse aim world projection
  let mouseNDC = { x: 0, y: 0 };
  window.addEventListener('mousemove', (e) => {
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  function updateAimWorld() {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2(mouseNDC.x, mouseNDC.y);
    ray.setFromCamera(ndc, sceneManager.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, point)) {
      keyboardMouse.setAimWorld(point.x, point.z);
      // Virtual joystick aim defaults to local player position; updated below.
      const localEntity = network.localPlayerEntity;
      if (localEntity) {
        const t = world.getComponent(localEntity, TransformComponent);
        if (t) virtualJoystick.setAimWorld(t.x, t.z);
      }
    }
  }

  // 13. Game loop
  const loop = new GameLoop({
    update: (dt) => {
      inputManager.update(dt);
      updateAimWorld();

      // Update local-player-aim for network input.
      // (MovementSystem reads input and updates local transform; that transform
      // is then sent to server by NetworkSystem.update.)

      // Run gameplay systems.
      for (const sys of systems) {
        sys.update(world, dt);
      }

      // Run network system (sends input, applies remote state).
      network.update(dt);

      // Sync player meshes to ECS transforms (for local player; remote players
      // are updated directly by NetworkSystem.onPlayerUpdate).
      const localEntity = network.localPlayerEntity;
      if (localEntity !== null) {
        const t = world.getComponent(localEntity, TransformComponent);
        const mesh = playerMeshes.get(localEntity);
        if (t && mesh) {
          mesh.position.set(t.x, t.y, t.z);
          mesh.rotation.y = t.rotation;
        }
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
      if (localEntity !== null) {
        const playerHealth = world.getComponent(localEntity, HealthComponent);
        const player = world.getComponent(localEntity, PlayerComponent);
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

  // 14. Connect to server (async — happens after loop starts so the scene
  // renders immediately and the boot screen fades).
  console.log(`[Client] Connecting to ${SERVER_URL}...`);
  network.connect().then(() => {
    // Hide boot screen on successful connection.
    boot.classList.add('hidden');
    setTimeout(() => boot.remove(), 500);
  }).catch((err) => {
    console.error('[Client] Connection failed:', err);
  });
}

/**
 * Project a world position to screen pixel coordinates.
 */
function projectToScreen(
  sceneManager: SceneManager,
  x: number,
  y: number,
  z: number
): { x: number; y: number; visible: boolean } | null {
  const v = new THREE.Vector3(x, y, z);
  v.project(sceneManager.camera);
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
