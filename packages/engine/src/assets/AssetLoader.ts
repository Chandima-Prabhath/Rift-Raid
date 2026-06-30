/**
 * Rift & Raid — AssetLoader
 *
 * Loads 3D model files (GLTF/GLB) with per-pack texture routing for
 * Kenney GLB packs. Includes CharacterModelLoader that normalizes model
 * scale/position so all character models are uniformly 1.8m tall with
 * feet at y=0.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================================
// Per-pack texture routing
// ============================================================================

/**
 * Kenney packs reference textures by relative filename (e.g. "colormap.png"
 * or "Textures/colormap.png"). Each pack has its own colormap.png. We
 * redirect based on the model path.
 *
 * IMPORTANT: The URL modifier intercepts ALL URLs the GLTFLoader requests,
 * including the .glb file itself. We MUST only redirect texture files
 * (png/jpg/etc), NOT the .glb.
 */
function buildTextureRedirect(modelUrl: string): (url: string) => string {
  let pack = 'default';
  if (modelUrl.includes('/characters/')) pack = 'characters';
  else if (modelUrl.includes('/props/')) pack = 'props';
  else if (modelUrl.includes('/structures/')) pack = 'structures';

  const TEXTURE_EXTS = /\.(png|jpe?g|webp|ktx2|tga|bmp|gif)$/i;

  return (url: string): string => {
    if (/^https?:\/\//i.test(url)) return url;
    if (!TEXTURE_EXTS.test(url)) return url;

    // Get just the filename, lowercased for matching.
    const filename = (url.split('/').pop() ?? url).toLowerCase();

    // Kenney packs use a single colormap per pack. The GLB may reference it
    // as "colormap.png", "Textures/colormap.png", or "textures/colormap.png".
    // We redirect all variants to /textures/{pack}-colormap.png.
    if (filename === 'colormap.png') {
      return `/textures/${pack}-colormap.png`;
    }
    // Any other texture: look in the textures/ dir by filename.
    return `/textures/${filename}`;
  };
}

// ============================================================================
// AssetLoader
// ============================================================================

export class AssetLoader {
  private cache = new Map<string, THREE.Object3D>();
  private textureCache = new Map<string, THREE.Texture>();
  private textureLoader = new THREE.TextureLoader();

  /** Load a GLTF/GLB model. Returns a CLONE of the cached scene. */
  async loadGLTF(url: string): Promise<THREE.Object3D> {
    const cached = this.cache.get(url);
    if (cached) {
      return cached.clone(true);
    }

    return new Promise((resolve, reject) => {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(buildTextureRedirect(url));
      const loader = new GLTFLoader(manager);

      loader.load(
        url,
        (gltf) => {
          const scene = gltf.scene;
          this.normalizeModel(scene);
          this.cache.set(url, scene);
          resolve(scene.clone(true));
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  /**
   * Normalize a loaded GLB model:
   *   - Convert SkinnedMesh → regular Mesh (strips skinning so the mesh
   *     renders correctly without requiring skeleton bones in the scene tree)
   *   - Enable castShadow/receiveShadow on all meshes
   *   - Ensure materials render even if texture is missing (fallback color)
   *   - Disable frustum culling (prevents disappearing after scaling)
   *
   * Why convert SkinnedMesh?
   *   SkinnedMeshes require their skeleton bones to be in the scene tree
   *   for correct rendering. When we clone the cached model, the skeleton
   *   bones are shared by reference but may not be properly attached,
   *   causing the mesh to render at the wrong position or be invisible.
   *   Kenney character models use SkinnedMesh but have no animations, so
   *   stripping skinning is safe — the bind-pose geometry is the final pose.
   *
   * We collect the meshes to replace FIRST, then do the replacement after
   * traversal — this avoids the bug where modifying the tree during
   * traverse() causes some children to be skipped.
   */
  private normalizeModel(root: THREE.Object3D): void {
    // Phase 1: collect all meshes and their properties.
    const toReplace: Array<{
      mesh: THREE.Mesh;
      parent: THREE.Object3D;
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
      worldMatrix: THREE.Matrix4;
    }> = [];

    root.traverse((child) => {
      const obj = child as THREE.Mesh;
      if (!obj.geometry) return;

      if ((obj as any).isSkinnedMesh) {
        // Collect this SkinnedMesh for replacement.
        toReplace.push({
          mesh: obj,
          parent: obj.parent!,
          geometry: obj.geometry,
          material: obj.material,
          worldMatrix: obj.matrixWorld.clone(),
        });
      } else {
        // Regular mesh — just enable shadows.
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.frustumCulled = false;
        this.fixMaterial(obj);
      }
    });

    // Phase 2: replace SkinnedMeshes with regular Meshes (after traversal).
    for (const item of toReplace) {
      // Strip skinning attributes from the geometry (clone it so we don't
      // mutate the cached version).
      const newGeo = item.geometry.clone();
      delete (newGeo as any).attributes.skinIndex;
      delete (newGeo as any).attributes.skinWeight;
      newGeo.computeVertexNormals();

      const newMesh = new THREE.Mesh(newGeo, item.material);
      newMesh.name = item.mesh.name;
      // Copy the world transform so the mesh appears in the right place.
      newMesh.matrix.copy(item.worldMatrix);
      newMesh.matrixAutoUpdate = false; // we set the matrix manually
      newMesh.castShadow = true;
      newMesh.receiveShadow = true;
      newMesh.frustumCulled = false;

      // Replace in parent.
      item.parent.remove(item.mesh);
      item.parent.add(newMesh);

      // Apply material fixes.
      this.fixMaterial(newMesh);
    }
  }

  /**
   * Fix material so the mesh is visible even if texture fails to load.
   * - If color is pure black and a texture map is expected, set color to white
   * - Ensure material isn't fully transparent
   */
  private fixMaterial(mesh: THREE.Mesh): void {
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial;
      if (m.map && m.color) {
        const c = m.color;
        if (c.r < 0.01 && c.g < 0.01 && c.b < 0.01) {
          m.color.setRGB(1, 1, 1);
        }
      }
      if (m.transparent && m.opacity !== undefined && m.opacity < 0.01) {
        m.opacity = 1;
      }
      // Ensure the material updates.
      m.needsUpdate = true;
    }
  }

  /** Load a texture. */
  async loadTexture(url: string): Promise<THREE.Texture> {
    const cached = this.textureCache.get(url);
    if (cached) return cached.clone();
    return new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });
  }

  isCached(url: string): boolean {
    return this.cache.has(url);
  }

  dispose(): void {
    for (const obj of this.cache.values()) {
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    for (const tex of this.textureCache.values()) tex.dispose();
    this.cache.clear();
    this.textureCache.clear();
  }
}

// ============================================================================
// CharacterModelLoader
// ============================================================================

export const CHARACTER_MODELS = [
  'character-male-a', 'character-male-b', 'character-male-c',
  'character-male-d', 'character-male-e', 'character-male-f',
  'character-female-a', 'character-female-b', 'character-female-c',
  'character-female-d', 'character-female-e', 'character-female-f',
] as const;

export type CharacterModelId = (typeof CHARACTER_MODELS)[number];

export class CharacterModelLoader {
  private assetLoader: AssetLoader;
  private loaded = new Set<string>();

  constructor(assetLoader: AssetLoader) {
    this.assetLoader = assetLoader;
  }

  /**
   * Load a character model by id (e.g. "character-male-a").
   *
   * Returns a THREE.Group wrapper containing the scaled/positioned model.
   * The wrapper's origin is at the character's feet (y=0), centered
   * horizontally. The model is scaled to 1.8m tall and rotated 180°
   * (Kenney models face -Z by default; we want +Z).
   *
   * Using a wrapper group ensures the cache isn't polluted with transform
   * offsets — each clone gets fresh transforms applied to the wrapper.
   */
  async load(modelId: string): Promise<THREE.Group> {
    if (!CHARACTER_MODELS.includes(modelId as CharacterModelId)) {
      console.warn(`[CharacterModelLoader] Unknown model "${modelId}", falling back to default`);
      modelId = CHARACTER_MODELS[0];
    }
    const url = `/characters/${modelId}.glb`;
    const model = await this.assetLoader.loadGLTF(url);
    this.loaded.add(modelId);

    // Create a wrapper group. We apply all transforms to the model (child)
    // and return the wrapper (parent) with identity transform. This way
    // the caller can position/rotate the wrapper freely.
    const wrapper = new THREE.Group();

    // Kenney models face -Z by default; rotate 180° to face +Z.
    model.rotation.y = Math.PI;

    // Auto-normalize scale to target height (1.8m).
    // We must compute the bounding box AFTER adding to the wrapper so
    // the wrapper's transform doesn't interfere. Use the model's local box.
    const TARGET_HEIGHT = 1.8;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    if (size.y > 0.001) {
      const scale = TARGET_HEIGHT / size.y;
      model.scale.setScalar(scale);
    }

    // After scaling, recompute the box and offset the model so feet are
    // at y=0 and it's centered on x/z.
    const boxAfter = new THREE.Box3().setFromObject(model);
    model.position.x -= (boxAfter.min.x + boxAfter.max.x) / 2;
    model.position.z -= (boxAfter.min.z + boxAfter.max.z) / 2;
    model.position.y -= boxAfter.min.y;

    wrapper.add(model);
    return wrapper;
  }

  isLoaded(modelId: string): boolean {
    return this.loaded.has(modelId);
  }

  static getAvailableModels(): readonly string[] {
    return CHARACTER_MODELS;
  }
}
