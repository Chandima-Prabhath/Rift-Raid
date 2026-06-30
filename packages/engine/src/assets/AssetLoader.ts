/**
 * Rift & Raid — AssetLoader
 *
 * Loads 3D model files (GLTF/GLB), textures, and audio. Uses three's
 * GLTFLoader with a LoadingManager that handles per-pack texture routing
 * for Kenney GLB packs (each pack has its own colormap.png that must be
 * redirected based on the model path).
 *
 * Includes a CharacterModelLoader that:
 *   - Loads GLB files from /assets/characters/ (served by Vite publicDir)
 *   - Caches the loaded scene for cloning
 *   - Converts SkinnedMesh to regular Mesh (Kenney characters use skinned
 *     meshes but no animations, so stripping skinning is safe and faster)
 *   - Applies a faction color tint to the model's materials
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ============================================================================
// Per-pack texture routing
// ============================================================================

/**
 * Per-pack texture routing for Kenney GLB packs.
 *
 * Kenney packs reference textures by relative filename (e.g. "colormap.png").
 * Each pack has its own colormap.png. We redirect based on the model path.
 *
 * Texture files live at /textures/{pack}-colormap.png in the public dir:
 *   /textures/characters-colormap.png
 *   /textures/props-colormap.png
 *   /textures/structures-colormap.png
 *
 * IMPORTANT: The URL modifier intercepts ALL URLs the GLTFLoader requests,
 * including the .glb file itself. We MUST only redirect texture files
 * (png/jpg/jpeg/webp/ktx2), NOT the .glb — otherwise the GLB gets
 * redirected to /textures/... where it doesn't exist, Vite serves an
 * HTML 404 fallback, and GLTFLoader crashes trying to JSON.parse HTML.
 */
function buildTextureRedirect(modelUrl: string): (url: string) => string {
  // Determine which Kenney pack this model belongs to.
  let pack = 'default';
  if (modelUrl.includes('/characters/')) pack = 'characters';
  else if (modelUrl.includes('/props/')) pack = 'props';
  else if (modelUrl.includes('/structures/')) pack = 'structures';

  const TEXTURE_EXTS = /\.(png|jpe?g|webp|ktx2|tga|bmp|gif)$/i;

  return (url: string): string => {
    if (/^https?:\/\//i.test(url)) return url;
    // Only redirect texture files. Pass through .glb, .gltf, .bin, etc.
    if (!TEXTURE_EXTS.test(url)) return url;
    const filename = url.split('/').pop() ?? url;
    // Kenney packs use a single colormap per pack, named {pack}-colormap.png.
    // The GLB references it as just "colormap.png" — we prepend the pack prefix.
    if (filename === 'colormap.png') {
      return `/textures/${pack}-colormap.png`;
    }
    // Other textures: look in the textures/ dir by filename.
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
      const loader = new GLTFLoader();
      // Set up a LoadingManager that redirects texture URLs per-pack.
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(buildTextureRedirect(url));
      // Re-bind the loader to use our manager.
      // (GLTFLoader copies manager at construction, so we create a new one.)
      const loaderWithManager = new GLTFLoader(manager);

      loaderWithManager.load(
        url,
        (gltf) => {
          const scene = gltf.scene;
          // Normalize: strip skinning, enable shadows, center on origin.
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
   *   - Enable castShadow/receiveShadow on all meshes
   *   - Keep original materials/textures (do NOT tint — faction color is
   *     shown only on the name banner + HP bar, not on the model itself)
   *
   * NOTE: We do NOT convert SkinnedMesh → Mesh anymore. The previous
   * implementation modified the scene tree during traverse(), which
   * caused some children (like the head) to be skipped. Kenney models
   * render fine as SkinnedMeshes even without animations — the bind-pose
   * geometry is correct.
   */
  private normalizeModel(root: THREE.Object3D): void {
    root.traverse((child) => {
      const obj = child as THREE.Mesh;
      if (!obj.geometry) return;
      // Just enable shadows. Leave materials and mesh types as-is.
      obj.castShadow = true;
      obj.receiveShadow = true;
      // Disable frustum culling for small models (prevents disappearing
      // when the bounding sphere is miscalculated after scaling).
      obj.frustumCulled = false;
    });
  }

  /**
   * Apply a color tint to all materials in a model.
   * Currently unused — we keep original textures and show faction color
   * only on the name banner + HP bar. Kept for future use.
   */
  applyTint(model: THREE.Object3D, tintColor: number): void {
    const color = new THREE.Color(tintColor);
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          // Multiply tint with existing color (preserves texture detail).
          mat.color.copy(color);
          // Keep map if present (texture detail shows through tint).
        }
      }
    });
  }

  /** Load a texture. */
  async loadTexture(url: string): Promise<THREE.Texture> {
    const cached = this.textureCache.get(url);
    if (cached) return cached.clone();
    return new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });
  }

  /** Check if a model is cached. */
  isCached(url: string): boolean {
    return this.cache.has(url);
  }

  /** Clear all caches. */
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

/** List of available character models (matches files in packages/game/assets/characters/). */
export const CHARACTER_MODELS = [
  'character-male-a',
  'character-male-b',
  'character-male-c',
  'character-male-d',
  'character-male-e',
  'character-male-f',
  'character-female-a',
  'character-female-b',
  'character-female-c',
  'character-female-d',
  'character-female-e',
  'character-female-f',
] as const;

export type CharacterModelId = (typeof CHARACTER_MODELS)[number];

export class CharacterModelLoader {
  private assetLoader: AssetLoader;
  private loaded = new Set<string>();

  constructor(assetLoader: AssetLoader) {
    this.assetLoader = assetLoader;
  }

  /** Load a character model by id (e.g. "character-male-a"). Returns a clone. */
  async load(modelId: string): Promise<THREE.Object3D> {
    if (!CHARACTER_MODELS.includes(modelId as CharacterModelId)) {
      console.warn(`[CharacterModelLoader] Unknown model "${modelId}", falling back to default`);
      modelId = CHARACTER_MODELS[0];
    }
    const url = `/characters/${modelId}.glb`;
    const model = await this.assetLoader.loadGLTF(url);
    this.loaded.add(modelId);

    // Kenney models face -Z by default; rotate 180° to face +Z.
    model.rotation.y = Math.PI;

    // Auto-normalize scale to target height (1.8m).
    // Compute bounding box, scale uniformly so the model is 1.8m tall.
    // Kenney models have their origin at the feet, so after scaling the
    // feet stay at y=0 and the head is at y=1.8.
    const TARGET_HEIGHT = 1.8;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0.001) {
      const scale = TARGET_HEIGHT / size.y;
      model.scale.setScalar(scale);
    }

    // After scaling, recompute the box and shift the model so feet are at y=0
    // and center it horizontally. We use a wrapper approach: adjust the
    // model's position directly (it will be added as a child of the player
    // mesh group, so position is relative to the group origin).
    const boxAfter = new THREE.Box3().setFromObject(model);
    model.position.x -= (boxAfter.min.x + boxAfter.max.x) / 2;
    model.position.z -= (boxAfter.min.z + boxAfter.max.z) / 2;
    model.position.y -= boxAfter.min.y;

    return model;
  }

  /** Apply faction tint to a loaded character model. */
  applyFactionTint(model: THREE.Object3D, tintColor: number): void {
    this.assetLoader.applyTint(model, tintColor);
  }

  /** Check if a model is already loaded (cached). */
  isLoaded(modelId: string): boolean {
    return this.loaded.has(modelId);
  }

  /** Get list of all available model ids (for UI pickers). */
  static getAvailableModels(): readonly string[] {
    return CHARACTER_MODELS;
  }
}
