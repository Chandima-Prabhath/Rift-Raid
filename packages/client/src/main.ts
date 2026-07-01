/**
 * Rift & Raid — Client entry point (Phases 2–5)
 *
 * Wires up:
 *   - LoginScreen (name + class + model selection)
 *   - SceneManager + ModelRenderer + AssetLoader + CharacterModelLoader
 *   - InputManager (keyboard/mouse + virtual joystick)
 *   - NetworkSystem (Colyseus client, v3 API)
 *   - Game systems (movement, combat, health, dummy, damage numbers)
 *   - HUD, Chat, KillFeed, DeathOverlay, DebugOverlay
 *   - NameTag billboards (faction-colored name + HP bar above each player)
 *   - Minimap (top-right canvas showing players/nodes/structures/bases)
 *   - BuildMenu (B key, structure picker + ghost preview + place on click)
 *   - InteractPrompt (E to harvest / E to deposit)
 *   - Resource node meshes + structure meshes (GLB from Kenney packs)
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
  ClassSelectSystem,
} from '@rift-and-raid/game';
import {
  WORLD_SIZE,
  CLASS_STATS,
  COMBAT,
  HARVESTING,
  BUILDING,
  type CharacterClass,
} from '@rift-and-raid/shared';
import { NetworkSystem } from './NetworkSystem.js';
import { ChatUI } from './ChatUI.js';
import { DeathOverlay } from './DeathOverlay.js';
import { KillFeed } from './KillFeed.js';
import { LoginScreen } from './LoginScreen.js';
import { Minimap } from './Minimap.js';
import { BuildMenu } from './BuildMenu.js';
import { InteractPrompt } from './InteractPrompt.js';

// ============================================================================
// Boot sequence
// ============================================================================

const boot = document.getElementById('boot');
const SERVER_URL = new URLSearchParams(window.location.search).get('server')
  ?? 'ws://localhost:2567';

interface PlayerVisual {
  mesh: THREE.Group;
  nameTag: NameTag;
  currentModelId: string | null;
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
    { x: 0, y: 0, z: -25 },
    { x: -4, y: 0, z: -22 },
    { x: 4, y: 0, z: -22 },
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
  const minimap = new Minimap();
  const interactPrompt = new InteractPrompt();
  let chatUI: ChatUI | null = null;

  // ── 9. Visual tracking ─────────────────────────────────────────────────
  const playerVisuals = new Map<number, PlayerVisual>();
  const projectileMeshes = new Map<string, THREE.Mesh>();
  const localProjectileMeshes = new Map<number, THREE.Mesh>();
  const resourceNodeMeshes = new Map<string, THREE.Object3D>();
  const structureMeshes = new Map<string, THREE.Object3D>();
  /** Build mode state: when a structure type is selected, clicking places it. */
  let buildMode: { type: string; ghost: THREE.Object3D | null } = { type: '', ghost: null };

  // ── 10. Network system (declared early, assigned after BuildMenu) ──────
  // The BuildMenu callbacks reference `network`, so we declare it as `let`
  // here and assign the instance after the BuildMenu is created. The
  // callbacks are only invoked at runtime (after network is assigned), so
  // this is safe.
  let network: NetworkSystem;

  // ── 10b. Build menu ────────────────────────────────────────────────────
  const buildMenu = new BuildMenu({
    onSelect: (structureType) => {
      if (buildMode.ghost) {
        sceneManager.scene.remove(buildMode.ghost);
        buildMode.ghost = null;
      }
      if (structureType) {
        // Create a semi-transparent ghost preview. Start with a box,
        // then async-load the real model and swap it in.
        const ghostGeo = new THREE.BoxGeometry(2, 2, 0.5);
        const ghostMat = new THREE.MeshBasicMaterial({
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        });
        const ghost = new THREE.Mesh(ghostGeo, ghostMat);
        ghost.position.y = 1;
        sceneManager.scene.add(ghost);
        buildMode = { type: structureType, ghost };
        ghostRotation = 0;

        // Async-load the real model for the ghost.
        const modelMap: Record<string, string> = {
          wall_stone: '/structures/wall.glb',
          wall_wood: '/structures/wall-wood.glb',
          tower: '/structures/tower-square-build-a.glb',
          barricade: '/structures/fence.glb',
        };
        const modelUrl = modelMap[structureType] ?? '/structures/wall.glb';
        assetLoader.loadGLTF(modelUrl).then((model) => {
          // Only swap if this ghost is still the active one.
          if (buildMode.ghost !== ghost) return;
          const targetHeight = 2.5;
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          if (size.y > 0.001) {
            model.scale.setScalar(targetHeight / size.y);
          }
          const box2 = new THREE.Box3().setFromObject(model);
          model.position.y = -box2.min.y;

          // Make it semi-transparent for ghost preview.
          model.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              for (const m of mats) {
                const mat = m as THREE.MeshStandardMaterial;
                mat.transparent = true;
                mat.opacity = 0.5;
                mat.depthWrite = false;
              }
            }
          });

          sceneManager.scene.remove(ghost);
          ghost.geometry.dispose();
          (ghost.material as THREE.Material).dispose();
          sceneManager.scene.add(model);
          buildMode = { type: structureType, ghost: model };
          model.rotation.y = ghostRotation;
        }).catch(() => {
          // Keep the box ghost if model fails to load.
        });
      } else {
        buildMode = { type: '', ghost: null };
      }
    },
    onPlace: (structureType, x, z, rotation) => {
      network.sendBuild(structureType, x, z, rotation);
    },
    getVaultResources: () => {
      const localPlayer = network.getLocalPlayerState();
      if (!localPlayer) return { iron: 0, emberwood: 0, godshard: 0 };
      const vault = network.getVaultState(localPlayer.faction);
      return vault ?? { iron: 0, emberwood: 0, godshard: 0 };
    },
  });

  // B key toggles build menu. R rotates ghost. Escape cancels.
  let ghostRotation = 0;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyB') {
      buildMenu.toggle();
      e.preventDefault();
    }
    if (e.code === 'KeyR' && buildMode.ghost) {
      ghostRotation += Math.PI / 4; // 45° increments
      buildMode.ghost.rotation.y = ghostRotation;
      e.preventDefault();
    }
    if (e.code === 'Escape' && buildMode.ghost) {
      buildMenu.cancel();
      if (buildMode.ghost) {
        sceneManager.scene.remove(buildMode.ghost);
        buildMode = { type: '', ghost: null };
      }
      ghostRotation = 0;
    }
  });

  // ── 11. Network system ─────────────────────────────────────────────────
  network = new NetworkSystem(
    world,
    SERVER_URL,
    () => inputManager.getState(),
    {
      onPlayerSpawn: async (entity, _sessionId, isLocal, color, characterModel) => {
        const mesh = modelRenderer.createCapsule(color);
        sceneManager.attachObject(entity, mesh);
        const nameTag = new NameTag();
        mesh.add(nameTag.sprite);
        playerVisuals.set(entity, { mesh, nameTag, currentModelId: null, modelLoading: true });

        if (isLocal) cameraController.follow(entity);

        try {
          // Load model with ORIGINAL textures — no faction tint.
          // Faction color is shown only on the name banner + HP bar.
          const model = await characterLoader.load(characterModel);
          const vis = playerVisuals.get(entity);
          if (vis) {
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
      onPlayerUpdate: (entity, x, y, z, rotation, color, alive, hp, maxHp, characterModel, name, faction) => {
        const vis = playerVisuals.get(entity);
        if (vis) {
          vis.mesh.position.set(x, y, z);
          vis.mesh.rotation.y = rotation;
          vis.mesh.visible = alive;

          const localEntity = network.localPlayerEntity;
          const isLocal = entity === localEntity;
          const localFaction = localEntity !== null
            ? (world.getComponent(localEntity, PlayerComponent)?.faction ?? 'solari')
            : 'solari';
          vis.nameTag.update({ name, faction: faction as 'solari' | 'lunari', hp, maxHp, isLocal, localFaction: localFaction as 'solari' | 'lunari' });

          if (vis.currentModelId !== characterModel && !vis.modelLoading) {
            vis.modelLoading = true;
            characterLoader.load(characterModel).then((model) => {
              while (vis.mesh.children.length > 0) {
                const child = vis.mesh.children[0];
                if (child === vis.nameTag.sprite) break;
                vis.mesh.remove(child);
              }
              vis.mesh.add(model);
              vis.currentModelId = characterModel;
              vis.modelLoading = false;
            }).catch(() => { vis.modelLoading = false; });
          }
        }
      },
      onPlayerLeave: (entity) => {
        const vis = playerVisuals.get(entity);
        if (vis) vis.nameTag.dispose();
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
          </div>`;
        }
      },
    },
    {
      name: loginOpts.name,
      characterClass: loginOpts.characterClass,
      characterModel: loginOpts.characterModel,
    },
    () => cameraController.yaw,
  );

  chatUI = new ChatUI((text) => network.sendChat(text));

  // ── 12. Game systems ───────────────────────────────────────────────────
  const systems = [
    new ClassSelectSystem(content, {
      onClassChange: (_entity, newClass) => {
        network.sendClassSwap(newClass);
      },
    }),
    new MovementSystem(() => inputManager.getState(), () => cameraController.yaw),
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
      onHit: (_proj, target) => {
        const mesh = sceneManager.getObject(target);
        if (mesh) {
          mesh.scale.set(1.2, 1.2, 1.2);
          setTimeout(() => mesh.scale.set(1, 1, 1), 80);
        }
      },
    }),
    new HealthSystem(eventBus, {
      onPlayerDeath: (entity) => console.log(`[Player] ${entity} died`),
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
    // NOTE: HealthBarSystem is intentionally NOT included here.
    // The NameTag (billboard sprite above each player) already shows
    // the player's name + HP bar. Having both would render two HP bars.
  ];

  for (const sys of systems) sys.init?.(world);

  // ── 13. Mouse aim + build placement ────────────────────────────────────
  let mouseNDC = { x: 0, y: 0 };
  window.addEventListener('mousemove', (e) => {
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  function getGroundPoint(): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(mouseNDC.x, mouseNDC.y), sceneManager.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, point)) return point;
    return null;
  }

  function updateAimAndBuildGhost() {
    const point = getGroundPoint();
    if (point) {
      keyboardMouse.setAimWorld(point.x, point.z);
      const localEntity = network.localPlayerEntity;
      if (localEntity) {
        const t = world.getComponent(localEntity, TransformComponent);
        if (t) virtualJoystick.setAimWorld(t.x, t.z);
      }
      // Update build ghost position.
      if (buildMode.ghost) {
        buildMode.ghost.position.x = point.x;
        buildMode.ghost.position.z = point.z;
      }
    }
  }

  // Click to place structure (only when in build mode).
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // left-click only
    if (!buildMode.type) return;
    const point = getGroundPoint();
    if (point) {
      network.sendBuild(buildMode.type, point.x, point.z, ghostRotation);
    }
  });

  // ── 14. Resource node + structure mesh management ──────────────────────
  /** Track which nodes/structures we've already created meshes for. */
  const knownNodeIds = new Set<string>();
  const knownStructureIds = new Set<string>();

  function syncResourceNodeMeshes() {
    network.forEachResourceNode((node, nodeId) => {
      if (knownNodeIds.has(nodeId)) {
        const mesh = resourceNodeMeshes.get(nodeId);
        if (mesh) {
          mesh.visible = node.hp > 0;
        }
        return;
      }
      knownNodeIds.add(nodeId);

      // Use real GLB models for resource nodes. Load async, use primitive
      // as immediate placeholder so the node is visible while loading.
      const placeholderColor = HARVESTING.nodeColor[node.resourceType as 'iron' | 'emberwood' | 'godshard'] ?? 0x808080;
      const placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: placeholderColor })
      );
      placeholder.position.set(node.x, 0.5, node.z);
      placeholder.castShadow = true;
      sceneManager.scene.add(placeholder);
      resourceNodeMeshes.set(nodeId, placeholder);

      // Async-load the real GLB model.
      const modelUrl = node.resourceType === 'emberwood'
        ? '/props/detail-tree.glb'
        : node.resourceType === 'iron'
        ? '/props/detail-rocks.glb'
        : '/props/detail-crystal.glb';

      assetLoader.loadGLTF(modelUrl).then((model) => {
        // Scale to reasonable size (~2m for trees, ~1m for rocks/crystals).
        const targetHeight = node.resourceType === 'emberwood' ? 3.0 : 1.2;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.y > 0.001) {
          model.scale.setScalar(targetHeight / size.y);
        }
        // Center and place on ground.
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.x -= (box2.min.x + box2.max.x) / 2;
        model.position.z -= (box2.min.z + box2.max.z) / 2;
        model.position.y -= box2.min.y;
        model.position.x += node.x;
        model.position.z += node.z;

        // Remove placeholder and add real model.
        sceneManager.scene.remove(placeholder);
        placeholder.geometry.dispose();
        (placeholder.material as THREE.Material).dispose();
        sceneManager.scene.add(model);
        resourceNodeMeshes.set(nodeId, model);
      }).catch((err) => {
        console.warn(`[Client] Failed to load resource model ${modelUrl}:`, err);
      });
    });
  }

  function syncStructureMeshes() {
    // Remove meshes for structures that no longer exist on the server.
    const currentIds = new Set<string>();
    network.forEachStructure((_, structId) => currentIds.add(structId));
    for (const [id, mesh] of structureMeshes) {
      if (!currentIds.has(id)) {
        sceneManager.scene.remove(mesh);
        structureMeshes.delete(id);
        knownStructureIds.delete(id);
      }
    }

    network.forEachStructure((struct, structId) => {
      if (knownStructureIds.has(structId)) {
        const mesh = structureMeshes.get(structId);
        if (mesh) {
          mesh.visible = struct.hp > 0;
          // Scale Y by build progress (grows from ground).
          mesh.scale.y = Math.max(0.1, struct.buildProgress);
        }
        return;
      }
      knownStructureIds.add(structId);

      // Use a placeholder box initially, then async-load the real GLB model.
      const factionColor = struct.faction === 'solari' ? 0xe07b3a : 0x4a90e2;
      const placeholder = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 0.5),
        new THREE.MeshStandardMaterial({
          color: factionColor,
          transparent: !struct.built,
          opacity: struct.built ? 1.0 : 0.6,
        })
      );
      placeholder.position.set(struct.x, 1, struct.z);
      placeholder.rotation.y = struct.rotation;
      placeholder.castShadow = true;
      placeholder.receiveShadow = true;
      placeholder.scale.y = Math.max(0.1, struct.buildProgress);
      sceneManager.scene.add(placeholder);
      structureMeshes.set(structId, placeholder);

      // Map structure type to GLB model URL.
      const modelMap: Record<string, string> = {
        wall_stone: '/structures/wall.glb',
        wall_wood: '/structures/wall-wood.glb',
        tower: '/structures/tower-square-build-a.glb',
        barricade: '/structures/fence.glb',
      };
      const modelUrl = modelMap[struct.structureType] ?? '/structures/wall.glb';

      assetLoader.loadGLTF(modelUrl).then((model) => {
        // Scale to ~2.5m tall.
        const targetHeight = 2.5;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.y > 0.001) {
          model.scale.setScalar(targetHeight / size.y);
        }
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.x = struct.x - (box2.min.x + box2.max.x) / 2;
        model.position.z = struct.z - (box2.min.z + box2.max.z) / 2;
        model.position.y = -box2.min.y;
        model.rotation.y = struct.rotation;

        // Remove placeholder and add real model.
        sceneManager.scene.remove(placeholder);
        placeholder.geometry.dispose();
        (placeholder.material as THREE.Material).dispose();
        sceneManager.scene.add(model);
        structureMeshes.set(structId, model);
      }).catch((err) => {
        console.warn(`[Client] Failed to load structure model ${modelUrl}:`, err);
      });
    });
  }

  // ── 15. Interaction detection (harvest / deposit prompts) ──────────────
  function updateInteractPrompt() {
    const localPlayer = network.getLocalPlayerState();
    if (!localPlayer || !localPlayer.alive) {
      interactPrompt.hide();
      return;
    }

    // Check if near a resource node.
    let nearestNodeId: string | null = null;
    let nearestNodeType = '';
    let nearestNodeDist = Infinity;
    network.forEachResourceNode((node, nodeId) => {
      if (node.hp <= 0) return;
      const dist = Math.hypot(node.x - localPlayer.x, node.z - localPlayer.z);
      if (dist <= HARVESTING.range) {
        if (dist < nearestNodeDist) {
          nearestNodeId = nodeId;
          nearestNodeType = node.resourceType;
          nearestNodeDist = dist;
        }
      }
    });

    // Check if near vault (deposit).
    const vaultX = localPlayer.faction === 'solari' ? -80 : 80;
    const vaultZ = -40;
    const vaultDist = Math.hypot(vaultX - localPlayer.x, vaultZ - localPlayer.z);
    const hasResources = localPlayer.invIron + localPlayer.invEmberwood + localPlayer.invGodshard > 0;

    if (vaultDist <= BUILDING.depositRange && hasResources) {
      interactPrompt.show('Press E to deposit resources');
    } else if (nearestNodeId) {
      const typeName = nearestNodeType.charAt(0).toUpperCase() + nearestNodeType.slice(1);
      interactPrompt.show(`Press E to harvest ${typeName}`);
    } else {
      interactPrompt.hide();
    }

    // Handle E key press.
    const input = inputManager.getState();
    if (input.interactPressed) {
      if (vaultDist <= BUILDING.depositRange && hasResources) {
        network.sendDeposit();
      } else if (nearestNodeId) {
        network.sendHarvest(nearestNodeId);
      }
    }
  }

  // ── 16. Death state tracking ───────────────────────────────────────────
  let wasLocalAlive = true;

  // ── 17. Debug overlay ──────────────────────────────────────────────────
  const debugLogLines: string[] = [];
  debugOverlay.setSource({
    getStats: () => {
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

  // ── 18. Minimap update ─────────────────────────────────────────────────
  function updateMinimap() {
    const entities: Array<any> = [];
    // Bases.
    entities.push({ type: 'base', x: -80, z: -40, faction: 'solari' });
    entities.push({ type: 'base', x: 80, z: -40, faction: 'lunari' });
    // Resource nodes.
    network.forEachResourceNode((node) => {
      if (node.hp > 0) {
        entities.push({ type: 'resource', x: node.x, z: node.z, resourceType: node.resourceType });
      }
    });
    // Structures.
    network.forEachStructure((struct) => {
      if (struct.hp > 0) {
        entities.push({ type: 'structure', x: struct.x, z: struct.z, faction: struct.faction });
      }
    });
    // Players.
    const localSid = network.localSession;
    network.forEachPlayer((p, sid) => {
      entities.push({
        type: 'player',
        x: p.x,
        z: p.z,
        faction: p.faction,
        isLocal: sid === localSid,
        alive: p.alive,
      });
    });
    minimap.update(entities);
  }

  // ── 19. Game loop ──────────────────────────────────────────────────────
  const loop = new GameLoop({
    update: (dt) => {
      inputManager.update(dt);
      updateAimAndBuildGhost();

      // Suppress attacks while in build mode — prevents the CombatSystem
      // from firing projectiles/damage numbers when clicking to place.
      if (buildMode.type) {
        const state = inputManager.getState() as any;
        state.attackPressed = false;
        state.attackHeld = false;
        state.abilityPressed = false;
      }

      // Skip combat systems entirely while in build mode.
      for (const sys of systems) {
        if (buildMode.type && (sys.id === 'CombatSystem' || sys.id === 'ProjectileSystem')) {
          continue;
        }
        sys.update(world, dt);
      }

      network.update(dt);

      // Sync resource node + structure meshes.
      syncResourceNodeMeshes();
      syncStructureMeshes();

      // Interaction prompts.
      updateInteractPrompt();

      // Local player sync + death state.
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
          } else if (playerState.alive && !wasLocalAlive) {
            deathOverlay.hide();
            wasLocalAlive = true;
          } else if (!playerState.alive) {
            deathOverlay.updateTimer(COMBAT.respawnDelayMs, playerState.diedAt);
          }
        }
      }

      // Dummy sync.
      for (const dummyEntity of world.query(DummyComponent, TransformComponent)) {
        const dt2 = world.getComponent(dummyEntity, TransformComponent);
        const mesh = sceneManager.getObject(dummyEntity);
        if (dt2 && mesh) mesh.position.set(dt2.x, dt2.y, dt2.z);
      }

      // Local projectile sync.
      for (const projEntity of world.query(ProjectileComponent, TransformComponent)) {
        const pt = world.getComponent(projEntity, TransformComponent);
        const mesh = localProjectileMeshes.get(projEntity);
        if (pt && mesh) mesh.position.set(pt.x, pt.y, pt.z);
      }

      // HUD.
      if (localEntity !== null) {
        const playerHealth = world.getComponent(localEntity, HealthComponent);
        const playerState = network.getLocalPlayerState();
        if (playerHealth && playerState) {
          const vault = network.getVaultState(playerState.faction);
          hud.setStats({
            fps: loop.fps,
            tickRate: loop.tickRate,
            entityCount: world.entityCount,
            playerHp: playerHealth.current,
            playerMaxHp: playerHealth.max,
            playerResources: {
              iron: playerState.invIron,
              emberwood: playerState.invEmberwood,
              godshard: playerState.invGodshard,
            },
            vaultResources: vault ?? { iron: 0, emberwood: 0, godshard: 0 },
            faction: playerState.faction,
          });
        }
      }

      // Minimap + debug overlay.
      updateMinimap();
      debugOverlay.update();
      buildMenu.refresh();

      world.clearDirtyFlag();
      eventBus.emit(Events.WORLD_TICK, { dt });
    },
    render: (alpha) => {
      sceneManager.updateCamera(alpha);
      sceneManager.render();
    },
  });

  loop.start();

  // ── 20. Connect ────────────────────────────────────────────────────────
  console.log(`[Client] Connecting to ${SERVER_URL}...`);
  network.connect().then(() => {
    if (boot) {
      boot.classList.add('hidden');
      setTimeout(() => boot.remove(), 500);
    }
  }).catch((err) => console.error('[Client] Connection failed:', err));
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
  if (boot) boot.innerHTML = `<div style="color:#f44;padding:20px;">Boot failed: ${err.message}</div>`;
});
