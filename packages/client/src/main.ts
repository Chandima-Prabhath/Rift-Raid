/**
 * Rift & Raid — Client entry point
 *
 * Wires up:
 *   - LoginScreen (name + class + model selection)
 *   - SceneManager + ModelRenderer + AssetLoader + CharacterModelLoader
 *   - InputManager (keyboard/mouse + virtual joystick)
 *   - NetworkSystem (Colyseus client, v3 API)
 *   - Game systems (movement, combat, health, dummy, damage numbers)
 *   - HUD, Chat, KillFeed, DeathOverlay, DebugOverlay
 *   - NameTag billboards (faction-colored name + HP bar above each player)
 *
 * The client is server-authoritative for ALL gameplay state. Local systems
 * only handle input mapping, dummy combat (PvE), and visual interpolation.
 */

import * as THREE from 'three';
import {
  World,
  GameLoop,
  EventBus,
  Events,
  SceneManager,
  CameraController,
  MaterialSystem,
  ModelRenderer,
  AssetLoader,
  CharacterModelLoader,
  ContentRegistry,
  InputManager,
  KeyboardMouse,
  VirtualJoystick,
  TransformComponent,
  HealthComponent,
  HUD,
  NameTag,
  DebugOverlay,
  Palette,
} from '@rift-and-raid/engine';
import { loadAllContent } from '@rift-and-raid/game';
import {
  createDummy,
  PlayerComponent,
  DummyComponent,
  ProjectileComponent,
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
  COMBAT,
  type CharacterClass,
} from '@rift-and-raid/shared';
import { NetworkSystem } from './NetworkSystem.js';
import { ChatUI } from './ChatUI.js';
import { DeathOverlay } from './DeathOverlay.js';
import { KillFeed } from './KillFeed.js';
import { LoginScreen } from './LoginScreen.js';

// ============================================================================
// Boot sequence
// ============================================================================

const boot = document.getElementById('boot');
const SERVER_URL = new URLSearchParams(window.location.search).get('server')
  ?? 'ws://localhost:2567';

const COLOR_BY_CLASS: Record<CharacterClass, number> = {
  warrior: 0xd97742,
  ranger: 0x60a060,
  mage: 0x9050c0,
};

interface PlayerVisual {
  mesh: THREE.Group;
  nameTag: NameTag;
  /** Last-applied characterModel — used to detect model swaps. */
  currentModelId: string | null;
  /** True if the model GLB is still loading (we apply tint after load). */
  modelLoading: boolean;
}

async function main() {
  // ── 1. Login screen ────────────────────────────────────────────────────
  const login = new LoginScreen();
  const loginOpts = await login.show();
  login.hide();
  setTimeout(() => login.dispose(), 500);

  // ── 2. Engine kernel ───────────────────────────────────────────────────
  const world = new World();
  const eventBus = new EventBus();

  // ── 3. Content ─────────────────────────────────────────────────────────
  const content = new ContentRegistry();
  await loadAllContent(content);
  console.log(content.summary());

  // ── 4. Renderer + assets ───────────────────────────────────────────────
  const sceneManager = new SceneManager({ antialias: true });
  const materialSystem = new MaterialSystem();
  const modelRenderer = new ModelRenderer(materialSystem);
  const cameraController = new CameraController(sceneManager);
  const assetLoader = new AssetLoader();
  const characterLoader = new CharacterModelLoader(assetLoader);

  // ── 5. World geometry ──────────────────────────────────────────────────
  const ground = modelRenderer.createGround(WORLD_SIZE.width, WORLD_SIZE.depth, Palette.grass);
  ground.position.z = -WORLD_SIZE.depth / 2;
  sceneManager.scene.add(ground);

  const solariBase = modelRenderer.createBox(8, 0.2, 8, Palette.solariPrimary);
  solariBase.position.set(-80, 0.1, -40);
  sceneManager.scene.add(solariBase);

  const lunariBase = modelRenderer.createBox(8, 0.2, 8, Palette.lunariPrimary);
  lunariBase.position.set(80, 0.1, -40);
  sceneManager.scene.add(lunariBase);

  // ── 6. Local dummies (PvE training) ────────────────────────────────────
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

  // ── 7. Input ───────────────────────────────────────────────────────────
  const inputManager = new InputManager();
  const keyboardMouse = new KeyboardMouse();
  const virtualJoystick = new VirtualJoystick();
  inputManager.addAdapter(keyboardMouse);
  inputManager.addAdapter(virtualJoystick);
  inputManager.attach();

  // ── 8. UI overlays ─────────────────────────────────────────────────────
  const hud = new HUD();
  const deathOverlay = new DeathOverlay();
  const killFeed = new KillFeed();
  const debugOverlay = new DebugOverlay();
  let chatUI: ChatUI | null = null;

  // ── 9. Per-entity visual tracking ──────────────────────────────────────
  const playerVisuals = new Map<number, PlayerVisual>();
  const projectileMeshes = new Map<string, THREE.Mesh>();
  const localProjectileMeshes = new Map<number, THREE.Mesh>();

  // ── 10. Network system ─────────────────────────────────────────────────
  const network = new NetworkSystem(
    world,
    SERVER_URL,
    () => inputManager.getState(),
    {
      onPlayerSpawn: async (entity, _sessionId, isLocal, color, characterModel) => {
        // Start with a placeholder capsule. The GLB loads async.
        const mesh = modelRenderer.createCapsule(color);
        sceneManager.attachObject(entity, mesh);

        const nameTag = new NameTag();
        mesh.add(nameTag.sprite);

        playerVisuals.set(entity, {
          mesh,
          nameTag,
          currentModelId: null,
          modelLoading: true,
        });

        if (isLocal) {
          cameraController.follow(entity);
          console.log(`[Client] Local player entity ${entity}, camera following`);
        }

        // Async-load the GLB model and replace the capsule.
        try {
          const model = await characterLoader.load(characterModel);
          characterLoader.applyFactionTint(model, color);

          // Replace capsule children with the model (keep the name tag).
          const vis = playerVisuals.get(entity);
          if (vis) {
            // Remove old capsule body (but keep name tag + group transform).
            while (mesh.children.length > 0) {
              const child = mesh.children[0];
              if (child === nameTag.sprite) break;
              mesh.remove(child);
            }
            mesh.add(model);
            vis.currentModelId = characterModel;
            vis.modelLoading = false;
          }
        } catch (err) {
          console.error(`[Client] Failed to load model ${characterModel}:`, err);
          const vis = playerVisuals.get(entity);
          if (vis) vis.modelLoading = false;
        }
      },
      onPlayerUpdate: (
        entity, x, y, z, rotation, _color, alive, hp, maxHp,
        characterModel, name, faction,
      ) => {
        const vis = playerVisuals.get(entity);
        if (vis) {
          vis.mesh.position.set(x, y, z);
          vis.mesh.rotation.y = rotation;
          vis.mesh.visible = alive;

          // Update name tag with current state.
          const localEntity = network.localPlayerEntity;
          const isLocal = entity === localEntity;
          const localFaction = localEntity !== null
            ? (world.getComponent(localEntity, PlayerComponent)?.faction ?? 'solari')
            : 'solari';
          vis.nameTag.update({
            name,
            faction: faction as 'solari' | 'lunari',
            hp,
            maxHp,
            isLocal,
            localFaction: localFaction as 'solari' | 'lunari',
          });

          // Handle model swap (player changed their character model).
          if (vis.currentModelId !== characterModel && !vis.modelLoading) {
            vis.modelLoading = true;
            characterLoader.load(characterModel).then((model) => {
              characterLoader.applyFactionTint(model, _color);
              // Remove old model child (keep name tag).
              while (vis.mesh.children.length > 0) {
                const child = vis.mesh.children[0];
                if (child === vis.nameTag.sprite) break;
                vis.mesh.remove(child);
              }
              vis.mesh.add(model);
              vis.currentModelId = characterModel;
              vis.modelLoading = false;
            }).catch((err) => {
              console.error(`[Client] Model swap failed:`, err);
              vis.modelLoading = false;
            });
          }
        }
      },
      onPlayerLeave: (entity, _sessionId) => {
        const vis = playerVisuals.get(entity);
        if (vis) {
          vis.nameTag.dispose();
        }
        sceneManager.detachObject(entity);
        playerVisuals.delete(entity);
      },
      onProjectileSpawn: (projId, x, y, z, color) => {
        const geo = new THREE.SphereGeometry(0.3, 8, 6);
        const mat = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        sceneManager.scene.add(mesh);
        projectileMeshes.set(projId, mesh);
      },
      onProjectileUpdate: (projId, x, y, z) => {
        const mesh = projectileMeshes.get(projId);
        if (mesh) mesh.position.set(x, y, z);
      },
      onProjectileDestroy: (projId) => {
        const mesh = projectileMeshes.get(projId);
        if (mesh) {
          sceneManager.scene.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          projectileMeshes.delete(projId);
        }
      },
      onChat: (payload) => chatUI?.addMessage(payload),
      onKill: (victimName, killerName) => killFeed.addKill(victimName, killerName),
      onConnectionStateChange: (state) => {
        console.log(`[Client] Network: ${state}`);
        if (state === 'error' && boot) {
          boot.innerHTML = `<div style="color:#f44;padding:20px;font-family:sans-serif;">
            <h2>Cannot connect to server</h2>
            <p>Make sure the server is running: <code>bun run dev:server</code></p>
            <p>Server URL: <code>${SERVER_URL}</code></p>
            <p>Override with <code>?server=ws://your-host:2567</code></p>
          </div>`;
        }
      },
    },
    {
      name: loginOpts.name,
      characterClass: loginOpts.characterClass,
      characterModel: loginOpts.characterModel,
    },
  );

  chatUI = new ChatUI((text) => network.sendChat(text));

  // ── 11. Game systems ───────────────────────────────────────────────────
  const systems = [
    new ClassSelectSystem(content, {
      onClassChange: (entity, newClass, color) => {
        // For local player, send class swap to server. Server will broadcast
        // the new class which triggers model tint update via onPlayerUpdate.
        network.sendClassSwap(newClass);
        console.log(`[Class] swapped to ${newClass}`);
        void entity; void color;
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
      localProjectileMeshes.set(entity, mesh);
    }),
    new ProjectileSystem({
      onSpawn: () => {},
      onDestroy: (entity) => {
        const mesh = localProjectileMeshes.get(entity);
        if (mesh) {
          sceneManager.scene.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
          localProjectileMeshes.delete(entity);
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
      onPlayerDeath: (entity) => console.log(`[Player] ${entity} died (local)`),
      onPlayerRespawn: (entity) => console.log(`[Player] ${entity} respawned (local)`),
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

  // ── 12. Mouse aim (project to ground plane) ────────────────────────────
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
      const localEntity = network.localPlayerEntity;
      if (localEntity) {
        const t = world.getComponent(localEntity, TransformComponent);
        if (t) virtualJoystick.setAimWorld(t.x, t.z);
      }
    }
  }

  // ── 13. Death state tracking ───────────────────────────────────────────
  let wasLocalAlive = true;

  // ── 14. Debug overlay data source ──────────────────────────────────────
  const debugLogLines: string[] = [];
  function pushDebugLog(line: string): void {
    debugLogLines.push(`[${new Date().toLocaleTimeString()}] ${line}`);
    if (debugLogLines.length > 20) debugLogLines.shift();
  }
  debugOverlay.setSource({
    getStats: () => {
      const localEntity = network.localPlayerEntity;
      const playerState = network.getLocalPlayerState();
      let localPlayer: any = null;
      if (playerState) {
        localPlayer = {
          name: playerState.name,
          faction: playerState.faction,
          characterClass: playerState.characterClass,
          characterModel: playerState.characterModel,
          x: playerState.x,
          y: playerState.y,
          z: playerState.z,
          rotation: playerState.rotation,
          hp: playerState.hp,
          maxHp: playerState.maxHp,
          invIron: playerState.invIron,
          invEmberwood: playerState.invEmberwood,
          invGodshard: playerState.invGodshard,
        };
      }
      return {
        fps: loop.fps,
        tickRate: loop.tickRate,
        entityCount: world.entityCount,
        connectionState: network.isConnected ? 'connected' : 'disconnected',
        localSessionId: network.localSession,
        pingMs: network.currentPing,
        playersVisible: network.playersVisible,
        projectilesVisible: network.projectilesVisible,
        localPlayer,
        logLines: debugLogLines,
      };
    },
  });

  // ── 15. Game loop ──────────────────────────────────────────────────────
  const loop = new GameLoop({
    update: (dt) => {
      inputManager.update(dt);
      updateAimWorld();

      for (const sys of systems) {
        sys.update(world, dt);
      }

      network.update(dt);

      // Sync local player mesh + check death state.
      const localEntity = network.localPlayerEntity;
      if (localEntity !== null) {
        const t = world.getComponent(localEntity, TransformComponent);
        const mesh = playerVisuals.get(localEntity)?.mesh;
        if (t && mesh) {
          mesh.position.set(t.x, t.y, t.z);
          mesh.rotation.y = t.rotation;
        }

        const playerState = network.getLocalPlayerState();
        if (playerState) {
          if (!playerState.alive && wasLocalAlive) {
            deathOverlay.show(COMBAT.respawnDelayMs, playerState.diedAt);
            wasLocalAlive = false;
            pushDebugLog(`Local player died`);
          } else if (playerState.alive && !wasLocalAlive) {
            deathOverlay.hide();
            wasLocalAlive = true;
            pushDebugLog(`Local player respawned`);
          } else if (!playerState.alive) {
            deathOverlay.updateTimer(COMBAT.respawnDelayMs, playerState.diedAt);
          }
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

      // Sync local projectile meshes (for dummy combat).
      const projectiles = world.query(ProjectileComponent, TransformComponent);
      for (const projEntity of projectiles) {
        const pt = world.getComponent(projEntity, TransformComponent);
        const mesh = localProjectileMeshes.get(projEntity);
        if (pt && mesh) {
          mesh.position.set(pt.x, pt.y, pt.z);
        }
      }

      // Update HUD.
      if (localEntity !== null) {
        const playerHealth = world.getComponent(localEntity, HealthComponent);
        const player = world.getComponent(localEntity, PlayerComponent);
        const playerState = network.getLocalPlayerState();
        if (playerHealth && player) {
          hud.setStats({
            fps: loop.fps,
            tickRate: loop.tickRate,
            entityCount: world.entityCount,
            playerHp: playerHealth.current,
            playerMaxHp: playerHealth.max,
            playerResources: playerState ? {
              iron: playerState.invIron,
              emberwood: playerState.invEmberwood,
              godshard: playerState.invGodshard,
            } : {
              iron: player.inventory.iron,
              emberwood: player.inventory.emberwood,
              godshard: player.inventory.godshard,
            },
          });
        }
      }

      // Update debug overlay.
      debugOverlay.update();

      world.clearDirtyFlag();
      eventBus.emit(Events.WORLD_TICK, { dt });
    },
    render: (alpha) => {
      sceneManager.updateCamera(alpha);
      sceneManager.render();
    },
  });

  loop.start();

  // ── 16. Connect to server ──────────────────────────────────────────────
  console.log(`[Client] Connecting to ${SERVER_URL}...`);
  network.connect().then(() => {
    if (boot) {
      boot.classList.add('hidden');
      setTimeout(() => boot.remove(), 500);
    }
    pushDebugLog(`Connected as ${loginOpts.name}`);
  }).catch((err) => {
    console.error('[Client] Connection failed:', err);
    pushDebugLog(`Connection failed: ${err.message}`);
  });

  // ── 17. Window resize ──────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    // SceneManager already handles this internally.
  });
}

// ============================================================================
// Helpers
// ============================================================================

function projectToScreen(
  sceneManager: SceneManager,
  x: number, y: number, z: number,
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
  if (boot) {
    boot.innerHTML = `<div style="color:#f44;padding:20px;">Boot failed: ${err.message}</div>`;
  }
});
