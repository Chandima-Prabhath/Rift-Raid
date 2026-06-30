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
   *   - Convert SkinnedMesh to regular Mesh (Kenney characters)
   *   - Enable castShadow/receiveShadow on all meshes
   *   - Ensure materials are MeshStandardMaterial (for tint support)
   */
  private normalizeModel(root: THREE.Object3D): void {
    root.traverse((child) => {
      const obj = child as THREE.Mesh;
      if (!obj.geometry) return;

      // Convert SkinnedMesh → Mesh by stripping skinning attributes.
      if ((obj as any).isSkinnedMesh) {
        const geo = obj.geometry;
        // Remove skinning attributes; keep position/normal/uv.
        delete (geo as any).attributes.skinIndex;
        delete (geo as any).attributes.skinWeight;
        // Replace the SkinnedMesh with a regular Mesh.
        const newMesh = new THREE.Mesh(geo, obj.material);
        newMesh.name = obj.name;
        newMesh.position.copy(obj.position);
        newMesh.rotation.copy(obj.rotation);
        newMesh.scale.copy(obj.scale);
        newMesh.castShadow = true;
        newMesh.receiveShadow = true;
        // Replace in parent.
        if (obj.parent) {
          obj.parent.add(newMesh);
          obj.parent.remove(obj);
        }
        return;
      }

      // Regular mesh — just enable shadows.
      obj.castShadow = true;
      obj.receiveShadow = true;

      // Ensure material is MeshStandardMaterial (so we can tint it).
      if (obj.material && !(obj.material instanceof THREE.MeshStandardMaterial)) {
        const oldMat = obj.material as THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
        const newMat = new THREE.MeshStandardMaterial({
          map: oldMat.map ?? undefined,
          color: oldMat.color?.clone() ?? new THREE.Color(0xffffff),
        });
        obj.material = newMat;
        oldMat.dispose?.();
      }
    });
  }

  /**
   * Apply a color tint to all materials in a model.
   * Used for faction-based coloring (Solari=orange, Lunari=blue).
   * Tint multiplies the existing texture color.
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
    // Different Kenney character models have slightly different base sizes,
    // so we compute the bounding box and scale uniformly to hit 1.8m.
    const TARGET_HEIGHT = 1.8;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0.001) {
      const scale = TARGET_HEIGHT / size.y;
      model.scale.setScalar(scale);
    }

    // Re-center horizontally on origin (so the model stands on its position
    // point, not offset to one side).
    const boxAfter = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    boxAfter.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    // Lift so feet are at y=0.
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
