/**
 * Rift & Raid — LoginScreen
 *
 * Pre-game screen where the player:
 *   1. Enters a display name
 *   2. Picks a faction (Solari / Lunari) — determines spawn base
 *   3. Picks a character class (Warrior / Ranger / Mage)
 *   4. Picks a character model with LIVE 3D PREVIEW (rotating GLB model)
 *
 * The 3D preview uses a mini Three.js scene with a canvas embedded in
 * the login panel. The selected model loads and rotates so the player
 * can see exactly what they're choosing.
 *
 * On "Play", resolves with the chosen options.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTER_MODELS } from '@rift-and-raid/engine';
import type { CharacterClass, Faction } from '@rift-and-raid/shared';

export interface LoginOptions {
  name: string;
  faction: Faction;
  characterClass: CharacterClass;
  characterModel: string;
}

const CLASS_INFO: Record<CharacterClass, { name: string; desc: string; color: string }> = {
  warrior: { name: 'Warrior', desc: 'High HP · Melee sword · Charge ability', color: '#c0392b' },
  ranger: { name: 'Ranger', desc: 'Medium HP · Bow · Volley ability', color: '#27ae60' },
  mage: { name: 'Mage', desc: 'Low HP · Fire staff · Frost Nova ability', color: '#9b59b6' },
};

const FACTION_INFO: Record<Faction, { name: string; desc: string; color: string; color2: string }> = {
  solari: { name: 'Solari', desc: 'Dawn faction · Warm orange', color: '#e07b3a', color2: '#d06a2a' },
  lunari: { name: 'Lunari', desc: 'Dusk faction · Cool blue', color: '#4a90e2', color2: '#3a80d2' },
};

export class LoginScreen {
  private container: HTMLDivElement;
  private resolveFn: ((opts: LoginOptions) => void) | null = null;

  private nameInput: HTMLInputElement;
  private selectedFaction: Faction = 'solari';
  private selectedClass: CharacterClass = 'warrior';
  private selectedModel: string = CHARACTER_MODELS[0];

  // 3D preview
  private previewRenderer: THREE.WebGLRenderer | null = null;
  private previewScene: THREE.Scene | null = null;
  private previewCamera: THREE.PerspectiveCamera | null = null;
  private previewModel: THREE.Object3D | null = null;
  private previewAnimationId: number | null = null;
  private gltfLoader: GLTFLoader;
  private modelCache = new Map<string, THREE.Object3D>();

  constructor() {
    this.gltfLoader = new GLTFLoader();
    // Set up texture redirect for character models.
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (/^https?:\/\//i.test(url)) return url;
      if (/\.(png|jpe?g|webp|ktx2|tga|bmp|gif)$/i.test(url)) {
        const filename = (url.split('/').pop() ?? url).toLowerCase();
        if (filename === 'colormap.png') return '/textures/characters-colormap.png';
        return `/textures/${filename}`;
      }
      return url;
    });
    this.gltfLoader = new GLTFLoader(manager);

    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a1a 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: white;
      overflow: hidden;
    `;

    // Animated background particles (CSS-only).
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.style.cssText = `
        position: absolute;
        width: 2px; height: 2px;
        background: rgba(255,255,255,${Math.random() * 0.3 + 0.1});
        border-radius: 50%;
        top: ${Math.random() * 100}%;
        left: ${Math.random() * 100}%;
        animation: float ${5 + Math.random() * 10}s infinite ease-in-out;
      `;
      this.container.appendChild(p);
    }
    const style = document.createElement('style');
    style.textContent = `
      @keyframes float {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(${20}px, ${-30}px); }
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(15, 15, 30, 0.85);
      padding: 36px 40px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      max-width: 720px;
      width: 90%;
      backdrop-filter: blur(12px);
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 32px;
    `;

    // ── LEFT COLUMN: form ──
    const leftCol = document.createElement('div');

    const title = document.createElement('h1');
    title.textContent = 'Rift & Raid';
    title.style.cssText = `
      font-size: 32px; font-weight: 900; margin: 0 0 4px 0;
      text-align: center;
      background: linear-gradient(90deg, #e07b3a, #4a90e2);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text; letter-spacing: -0.02em;
    `;
    leftCol.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Choose your path';
    subtitle.style.cssText = `text-align: center; color: #889; margin: 0 0 24px 0; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;`;
    leftCol.appendChild(subtitle);

    // Name input
    leftCol.appendChild(this.createLabel('Player Name'));
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 20;
    this.nameInput.placeholder = 'Enter your name';
    this.nameInput.style.cssText = `
      width: 100%; padding: 12px 14px;
      background: rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px; color: white; font-size: 15px;
      margin-bottom: 18px; box-sizing: border-box; font-family: inherit;
      transition: border-color 0.15s;
    `;
    this.nameInput.addEventListener('focus', () => this.nameInput.style.borderColor = '#4a90e2');
    this.nameInput.addEventListener('blur', () => this.nameInput.style.borderColor = 'rgba(255,255,255,0.12)');
    leftCol.appendChild(this.nameInput);

    // Faction selection
    leftCol.appendChild(this.createLabel('Faction'));
    const factionGrid = document.createElement('div');
    factionGrid.style.cssText = `display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 18px;`;
    const factionButtons: HTMLButtonElement[] = [];
    for (const f of ['solari', 'lunari'] as Faction[]) {
      const btn = document.createElement('button');
      const info = FACTION_INFO[f];
      btn.innerHTML = `<div style="font-size:16px;font-weight:800;">${info.name}</div><div style="font-size:10px;opacity:0.7;margin-top:2px;">${info.desc}</div>`;
      btn.style.cssText = this.buttonStyle(f === this.selectedFaction, info.color);
      btn.onclick = () => {
        this.selectedFaction = f;
        factionButtons.forEach((b, i) => {
          const fa = ['solari', 'lunari'][i] as Faction;
          b.style.cssText = this.buttonStyle(fa === f, FACTION_INFO[fa].color);
        });
      };
      factionButtons.push(btn);
      factionGrid.appendChild(btn);
    }
    leftCol.appendChild(factionGrid);

    // Class selection
    leftCol.appendChild(this.createLabel('Class'));
    const classGrid = document.createElement('div');
    classGrid.style.cssText = `display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 18px;`;
    const classButtons: HTMLButtonElement[] = [];
    for (const cls of ['warrior', 'ranger', 'mage'] as CharacterClass[]) {
      const btn = document.createElement('button');
      const info = CLASS_INFO[cls];
      btn.innerHTML = `<div style="font-size:14px;font-weight:700;">${info.name}</div>`;
      btn.style.cssText = this.buttonStyle(cls === this.selectedClass, info.color);
      btn.title = info.desc;
      btn.onclick = () => {
        this.selectedClass = cls;
        classButtons.forEach((b, i) => {
          const c = ['warrior', 'ranger', 'mage'][i] as CharacterClass;
          b.style.cssText = this.buttonStyle(c === cls, CLASS_INFO[c].color);
        });
      };
      classButtons.push(btn);
      classGrid.appendChild(btn);
    }
    leftCol.appendChild(classGrid);

    // Model selection
    leftCol.appendChild(this.createLabel('Character Model'));
    const modelGrid = document.createElement('div');
    modelGrid.style.cssText = `
      display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px;
      margin-bottom: 24px; max-height: 140px; overflow-y: auto; padding: 4px;
    `;
    const modelButtons: HTMLButtonElement[] = [];
    for (const modelId of CHARACTER_MODELS) {
      const btn = document.createElement('button');
      const m = modelId.match(/character-(male|female)-([a-f])/);
      btn.textContent = m ? `${m[1][0].toUpperCase()}-${m[2].toUpperCase()}` : modelId;
      btn.style.cssText = this.modelButtonStyle(modelId === this.selectedModel);
      btn.title = modelId;
      btn.onclick = () => {
        this.selectedModel = modelId;
        this.updatePreview();
        modelButtons.forEach(b => {
          b.style.cssText = this.modelButtonStyle(b.title === modelId);
        });
      };
      modelButtons.push(btn);
      modelGrid.appendChild(btn);
    }
    leftCol.appendChild(modelGrid);

    // Play button
    const playBtn = document.createElement('button');
    playBtn.textContent = 'ENTER THE RIFT';
    playBtn.style.cssText = `
      width: 100%; padding: 16px;
      background: linear-gradient(135deg, #e07b3a, #4a90e2);
      border: none; border-radius: 8px; color: white;
      font-size: 16px; font-weight: 800; cursor: pointer;
      font-family: inherit; letter-spacing: 0.15em;
      transition: transform 0.1s, box-shadow 0.15s;
      box-shadow: 0 4px 20px rgba(224,123,58,0.3);
    `;
    playBtn.onmouseenter = () => { playBtn.style.transform = 'scale(1.02)'; playBtn.style.boxShadow = '0 6px 30px rgba(224,123,58,0.5)'; };
    playBtn.onmouseleave = () => { playBtn.style.transform = 'scale(1)'; playBtn.style.boxShadow = '0 4px 20px rgba(224,123,58,0.3)'; };
    playBtn.onclick = () => {
      const name = this.nameInput.value.trim() || `Player${Math.floor(Math.random() * 9999)}`;
      if (this.resolveFn) {
        this.resolveFn({
          name,
          faction: this.selectedFaction,
          characterClass: this.selectedClass,
          characterModel: this.selectedModel,
        });
      }
    };
    leftCol.appendChild(playBtn);

    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') playBtn.click();
    });

    // ── RIGHT COLUMN: 3D preview ──
    const rightCol = document.createElement('div');
    rightCol.style.cssText = `
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px;
    `;

    const previewLabel = document.createElement('div');
    previewLabel.textContent = 'PREVIEW';
    previewLabel.style.cssText = `font-size: 10px; color: #889; letter-spacing: 0.2em; font-weight: 700;`;
    rightCol.appendChild(previewLabel);

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = 280;
    previewCanvas.height = 320;
    previewCanvas.style.cssText = `
      background: radial-gradient(ellipse at center, rgba(74,144,226,0.08), transparent 70%);
      border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);
    `;
    rightCol.appendChild(previewCanvas);

    const modelName = document.createElement('div');
    modelName.id = 'rr-model-name';
    modelName.textContent = CHARACTER_MODELS[0];
    modelName.style.cssText = `font-size: 12px; color: #aab; font-family: monospace;`;
    rightCol.appendChild(modelName);

    // Initialize 3D preview
    this.initPreview(previewCanvas);

    panel.appendChild(leftCol);
    panel.appendChild(rightCol);
    this.container.appendChild(panel);
    document.body.appendChild(this.container);

    // Load initial preview
    this.updatePreview();
  }

  private createLabel(text: string): HTMLLabelElement {
    const label = document.createElement('label');
    label.textContent = text;
    label.style.cssText = `display: block; font-size: 11px; color: #889; margin-bottom: 6px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;`;
    return label;
  }

  private buttonStyle(active: boolean, color: string): string {
    return `
      padding: 12px 8px;
      background: ${active ? `linear-gradient(135deg, ${color}33, ${color}11)` : 'rgba(0,0,0,0.4)'};
      border: 2px solid ${active ? color : 'rgba(255,255,255,0.08)'};
      border-radius: 8px; color: ${active ? color : '#aaa'};
      font-family: inherit; cursor: pointer; transition: all 0.15s;
      text-align: center;
    `;
  }

  private modelButtonStyle(active: boolean): string {
    return `
      padding: 10px 4px;
      background: ${active ? 'rgba(74,144,226,0.25)' : 'rgba(0,0,0,0.4)'};
      border: 2px solid ${active ? '#4a90e2' : 'rgba(255,255,255,0.08)'};
      border-radius: 6px; color: ${active ? '#4a90e2' : '#888'};
      font-size: 11px; font-weight: 700; cursor: pointer;
      font-family: monospace; transition: all 0.15s;
    `;
  }

  // --------------------------------------------------------------------------
  // 3D Preview
  // --------------------------------------------------------------------------

  private initPreview(canvas: HTMLCanvasElement): void {
    this.previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.previewRenderer.setSize(280, 320);
    this.previewRenderer.setPixelRatio(window.devicePixelRatio);
    this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;

    this.previewScene = new THREE.Scene();
    this.previewCamera = new THREE.PerspectiveCamera(35, 280 / 320, 0.1, 100);
    this.previewCamera.position.set(0, 1.2, 4);
    this.previewCamera.lookAt(0, 1, 0);

    // Lights
    this.previewScene.add(new THREE.HemisphereLight(0xffffff, 0x443322, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 4);
    this.previewScene.add(dir);
    this.previewScene.add(new THREE.AmbientLight(0x404050, 0.5));

    // Platform disc
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.3, 0.1, 32),
      new THREE.MeshStandardMaterial({ color: 0x222244, metalness: 0.3, roughness: 0.7 })
    );
    platform.position.y = 0;
    this.previewScene.add(platform);

    // Start animation loop
    this.animatePreview();
  }

  private animatePreview = (): void => {
    this.previewAnimationId = requestAnimationFrame(this.animatePreview);
    if (this.previewModel) {
      this.previewModel.rotation.y += 0.01;
    }
    if (this.previewRenderer && this.previewScene && this.previewCamera) {
      this.previewRenderer.render(this.previewScene, this.previewCamera);
    }
  };

  private async updatePreview(): Promise<void> {
    if (!this.previewScene || !this.gltfLoader) return;

    // Remove old model
    if (this.previewModel) {
      this.previewScene.remove(this.previewModel);
      this.previewModel = null;
    }

    const modelId = this.selectedModel;
    const nameEl = document.getElementById('rr-model-name');
    if (nameEl) nameEl.textContent = modelId;

    try {
      let model: THREE.Object3D;
      if (this.modelCache.has(modelId)) {
        model = this.modelCache.get(modelId)!.clone(true);
      } else {
        const gltf = await new Promise<any>((resolve, reject) => {
          this.gltfLoader.load(`/characters/${modelId}.glb`, resolve, undefined, reject);
        });
        // Normalize: convert SkinnedMesh → Mesh
        this.normalizeModel(gltf.scene);
        this.modelCache.set(modelId, gltf.scene);
        model = gltf.scene.clone(true);
      }

      // Scale to 1.8m
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.y > 0.001) {
        model.scale.setScalar(1.8 / size.y);
      }
      const box2 = new THREE.Box3().setFromObject(model);
      model.position.y = -box2.min.y;

      this.previewModel = model;
      this.previewScene.add(model);
    } catch (err) {
      console.warn(`[LoginScreen] Failed to load preview model ${modelId}:`, err);
    }
  }

  private normalizeModel(root: THREE.Object3D): void {
    const toReplace: Array<{ mesh: THREE.Mesh; parent: THREE.Object3D; geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; world: THREE.Matrix4 }> = [];
    root.traverse((child) => {
      const obj = child as THREE.Mesh;
      if (!obj.geometry) return;
      if ((obj as any).isSkinnedMesh) {
        toReplace.push({ mesh: obj, parent: obj.parent!, geo: obj.geometry, mat: obj.material, world: obj.matrixWorld.clone() });
      } else {
        obj.castShadow = true;
        obj.frustumCulled = false;
      }
    });
    for (const item of toReplace) {
      const newGeo = item.geo.clone();
      delete (newGeo as any).attributes.skinIndex;
      delete (newGeo as any).attributes.skinWeight;
      const newMesh = new THREE.Mesh(newGeo, item.mat);
      newMesh.matrix.copy(item.world);
      newMesh.matrixAutoUpdate = false;
      newMesh.frustumCulled = false;
      item.parent.remove(item.mesh);
      item.parent.add(newMesh);
    }
  }

  show(): Promise<LoginOptions> {
    this.container.style.display = 'flex';
    setTimeout(() => this.nameInput.focus(), 100);
    return new Promise((resolve) => {
      this.resolveFn = resolve;
    });
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  dispose(): void {
    if (this.previewAnimationId !== null) {
      cancelAnimationFrame(this.previewAnimationId);
    }
    this.previewRenderer?.dispose();
    this.container.remove();
  }
}
