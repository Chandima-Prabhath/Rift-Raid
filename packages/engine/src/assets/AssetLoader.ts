/**
 * Rift & Raid — AssetLoader
 *
 * Loads 3D model files (GLTF/GLB), textures, and audio. Phase 0 stub —
 * Phase 1 will integrate three GLTFLoader with Draco/KTX2 decoders and
 * a proper LRU cache.
 *
 * For now, returns a simple in-memory cache and a no-op fetch.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class AssetLoader {
  private gltfLoader = new GLTFLoader();
  private textureLoader = new THREE.TextureLoader();
  private cache = new Map<string, unknown>();

  /** Load a GLTF/GLB model. Returns the root Object3D (cloneable). */
  async loadGLTF(url: string): Promise<THREE.Object3D> {
    const cached = this.cache.get(url);
    if (cached) {
      return (cached as THREE.Object3D).clone(true);
    }
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          this.cache.set(url, gltf.scene);
          resolve(gltf.scene.clone(true));
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  /** Load a texture. */
  async loadTexture(url: string): Promise<THREE.Texture> {
    const cached = this.cache.get(url) as THREE.Texture | undefined;
    if (cached) return cached.clone();
    return new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });
  }

  /** Check if an asset is cached. */
  isCached(url: string): boolean {
    return this.cache.has(url);
  }

  /** Clear cache. */
  dispose(): void {
    for (const value of this.cache.values()) {
      const obj = value as THREE.Object3D | THREE.Texture;
      if (obj instanceof THREE.Texture) {
        obj.dispose();
      } else {
        obj.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) m.dispose();
          }
        });
      }
    }
    this.cache.clear();
  }
}
