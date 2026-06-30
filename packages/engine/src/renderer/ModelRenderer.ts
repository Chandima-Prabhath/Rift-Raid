/**
 * Rift & Raid — ModelRenderer
 *
 * Helpers for creating THREE.Object3D representations from primitive shapes
 * (Phase 0 prototype) and from GLTF models (Phase 1+).
 *
 * Phase 0 only uses primitive shapes (capsules, boxes, cylinders) with flat
 * materials. The asset pipeline will replace these with real GLB models once
 * the Kenney/Quaternius packs are fetched in Phase 1.
 */

import * as THREE from 'three';
import type { MaterialSystem } from './MaterialSystem.js';

export class ModelRenderer {
  private materialSystem: MaterialSystem;

  constructor(materialSystem: MaterialSystem) {
    this.materialSystem = materialSystem;
  }

  /** Create a capsule character placeholder (Phase 0). */
  createCapsule(color: number, height = 1.8, radius = 0.4): THREE.Group {
    const group = new THREE.Group();
    const mat = this.materialSystem.flat(color);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(radius, height - radius * 2, 4, 8), mat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Direction indicator (so we can see which way the character faces).
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.4, 6),
      this.materialSystem.flat(0xffffff, `flat:ffffff`)
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, height * 0.5, radius + 0.2);
    group.add(nose);

    return group;
  }

  /** Create a flat ground plane. */
  createGround(width: number, depth: number, color: number): THREE.Mesh {
    const mat = this.materialSystem.flat(color);
    const geo = new THREE.PlaneGeometry(width, depth, 1, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Create a box structure (Phase 0 wall/turret placeholder). */
  createBox(width: number, height: number, depth: number, color: number): THREE.Mesh {
    const mat = this.materialSystem.flat(color);
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Create a resource node placeholder (cylinder crystal). */
  createCrystal(color: number, height = 1.2, radius = 0.4): THREE.Mesh {
    const mat = this.materialSystem.flat(color);
    const geo = new THREE.CylinderGeometry(radius * 0.6, radius, height, 6);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
