import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';

const glbPath = '/home/z/my-project/packages/game/assets/characters/character-male-a.glb';
const buffer = fs.readFileSync(glbPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
try {
  loader.parse(arrayBuffer, '', (gltf) => {
    console.log('Parsed successfully!');
    const model = gltf.scene;
    console.log('Children:', model.children.length);

    let meshCount = 0;
    model.traverse((child) => {
      if ((child as any).isMesh) {
        meshCount++;
        const mesh = child as any;
        console.log(`Mesh: ${mesh.name} isSkinned=${mesh.isSkinnedMesh}`);
        if (mesh.isSkinnedMesh) {
          console.log(`  skeleton bones: ${mesh.skeleton?.bones?.length}`);
          mesh.geometry.computeBoundingBox();
          const bb = mesh.geometry.boundingBox;
          console.log(`  geometry bb: ${bb ? `(${bb.min.x},${bb.min.y},${bb.min.z}) to (${bb.max.x},${bb.max.y},${bb.max.z})` : 'null'}`);
        }
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    console.log(`\nBox3.setFromObject size: ${size.x}, ${size.y}, ${size.z}`);
    console.log(`Box3 min: ${box.min.x}, ${box.min.y}, ${box.min.z}`);
    console.log(`Box3 max: ${box.max.x}, ${box.max.y}, ${box.max.z}`);

    // Now scale
    const TARGET_HEIGHT = 1.8;
    if (size.y > 0.001) {
      const scale = TARGET_HEIGHT / size.y;
      model.scale.setScalar(scale);
      console.log(`\nScale: ${scale}`);
    }

    // Check box after scale
    const box2 = new THREE.Box3().setFromObject(model);
    const size2 = new THREE.Vector3();
    box2.getSize(size2);
    console.log(`After scale size: ${size2.x}, ${size2.y}, ${size2.z}`);
  }, (err) => {
    console.error('Parse error:', err);
  });
} catch (e: any) {
  console.error('Error:', e.message);
}
