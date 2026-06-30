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
   *   - Enable castShadow/receiveShadow on all meshes
   *   - Ensure materials render even if texture is missing (fallback color)
   *   - Disable frustum culling (prevents disappearing after scaling)
   */
  private normalizeModel(root: THREE.Object3D): void {
    root.traverse((child) => {
      const obj = child as THREE.Mesh;
      if (!obj.geometry) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;

      // Ensure material has a visible color even if texture fails to load.
      // Kenney materials sometimes have color=black by default; if the
      // texture map is missing, the mesh renders as invisible black.
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          const m = mat as THREE.MeshStandardMaterial;
          // If material color is pure black and there's a texture map,
          // set color to white so the texture shows through.
          if (m.map && m.color) {
            const c = m.color;
            if (c.r < 0.01 && c.g < 0.01 && c.b < 0.01) {
              m.color.setRGB(1, 1, 1);
            }
          }
          // Ensure the material is not fully transparent.
          if (m.transparent && m.opacity !== undefined && m.opacity < 0.01) {
            m.opacity = 1;
          }
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
