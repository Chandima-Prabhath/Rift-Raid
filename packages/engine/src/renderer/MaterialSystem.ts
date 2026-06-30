/**
 * Rift & Raid — MaterialSystem
 *
 * Centralized material registry. Low-poly flat-shaded look per GDD decision #5.
 * Sharing materials across meshes drastically reduces draw-call overhead and
 * GPU memory; a single MeshLambertMaterial instance can be reused by every
 * "stone wall" mesh in the scene.
 */

import * as THREE from 'three';

export type MaterialKey = string;

export class MaterialSystem {
  private materials = new Map<MaterialKey, THREE.Material>();

  /** Register a material under a key. */
  register(key: MaterialKey, material: THREE.Material): void {
    this.materials.set(key, material);
  }

  /** Get a registered material. */
  get(key: MaterialKey): THREE.Material | undefined {
    return this.materials.get(key);
  }

  /** Get or create a flat-shaded standard material with the given color. */
  flat(color: number, key?: MaterialKey): THREE.MeshLambertMaterial {
    const k = key ?? `flat:${color.toString(16)}`;
    let mat = this.materials.get(k) as THREE.MeshLambertMaterial | undefined;
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color });
      this.materials.set(k, mat);
    }
    return mat;
  }

  /** Dispose all materials. */
  dispose(): void {
    for (const mat of this.materials.values()) mat.dispose();
    this.materials.clear();
  }
}

// ============================================================================
// Pre-defined palette for the launch theme (Solari vs Lunari vs Frontier)
// ============================================================================

export const Palette = {
  // Solari (warm)
  solariPrimary: 0xd97742,
  solariAccent: 0xf0c060,
  solariGround: 0xc9a06a,

  // Lunari (cool)
  lunariPrimary: 0x6a90c0,
  lunariAccent: 0xa0d0e0,
  lunariGround: 0x8aa0a0,

  // Frontier (Rift)
  riftGround: 0x2a2030,
  riftAccent: 0x9050c0,
  riftGlow: 0xc070e0,

  // Neutral
  iron: 0x707080,
  emberwood: 0x6a4830,
  godshard: 0xb080ff,
  stone: 0x909090,
  grass: 0x6a8040,
  sand: 0xd0b070,
} as const;
