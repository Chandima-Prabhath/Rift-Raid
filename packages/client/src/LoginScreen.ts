/**
 * Rift & Raid — LoginScreen
 *
 * Pre-game screen where the player:
 *   1. Enters a display name
 *   2. Picks a character class (Warrior / Ranger / Mage)
 *   3. Picks a character model (12 Kenney GLB options)
 *
 * On "Play", resolves with the chosen options. The caller passes these to
 * NetworkSystem which forwards them as Colyseus join options.
 */

import { CHARACTER_MODELS } from '@rift-and-raid/engine';
import type { CharacterClass } from '@rift-and-raid/shared';

export interface LoginOptions {
  name: string;
  characterClass: CharacterClass;
  characterModel: string;
}

const CLASS_INFO: Record<CharacterClass, { name: string; desc: string; color: string }> = {
  warrior: { name: 'Warrior', desc: 'High HP, melee sword, Charge ability', color: '#c0392b' },
  ranger: { name: 'Ranger', desc: 'Medium HP, bow, Volley ability', color: '#27ae60' },
  mage: { name: 'Mage', desc: 'Low HP, fire staff, Frost Nova ability', color: '#9b59b6' },
};

export class LoginScreen {
  private container: HTMLDivElement;
  private resolveFn: ((opts: LoginOptions) => void) | null = null;

  private nameInput: HTMLInputElement;
  private selectedClass: CharacterClass = 'warrior';
  private selectedModel: string = CHARACTER_MODELS[0];

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: white;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(0, 0, 0, 0.4);
      padding: 32px 40px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      max-width: 560px;
      width: 90%;
      backdrop-filter: blur(8px);
    `;

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Rift & Raid';
    title.style.cssText = `
      font-size: 36px;
      font-weight: 900;
      margin: 0 0 8px 0;
      text-align: center;
      background: linear-gradient(90deg, #e07b3a, #4a90e2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.02em;
    `;
    panel.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Persistent-world team-based 3D action RTS';
    subtitle.style.cssText = `text-align: center; color: #889; margin: 0 0 24px 0; font-size: 13px;`;
    panel.appendChild(subtitle);

    // Name input
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Player Name';
    nameLabel.style.cssText = `display: block; font-size: 12px; color: #aab; margin-bottom: 6px; font-weight: 600;`;
    panel.appendChild(nameLabel);

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 20;
    this.nameInput.placeholder = 'Enter your name';
    this.nameInput.value = '';
    this.nameInput.style.cssText = `
      width: 100%;
      padding: 10px 12px;
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      color: white;
      font-size: 15px;
      margin-bottom: 20px;
      box-sizing: border-box;
      font-family: inherit;
    `;
    panel.appendChild(this.nameInput);

    // Class selection
    const classLabel = document.createElement('label');
    classLabel.textContent = 'Class';
    classLabel.style.cssText = `display: block; font-size: 12px; color: #aab; margin-bottom: 8px; font-weight: 600;`;
    panel.appendChild(classLabel);

    const classGrid = document.createElement('div');
    classGrid.style.cssText = `display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 20px;`;

    const classButtons: HTMLButtonElement[] = [];
    for (const cls of ['warrior', 'ranger', 'mage'] as CharacterClass[]) {
      const btn = document.createElement('button');
      const info = CLASS_INFO[cls];
      btn.textContent = info.name;
      btn.style.cssText = `
        padding: 12px 8px;
        background: rgba(0, 0, 0, 0.4);
        border: 2px solid ${cls === this.selectedClass ? info.color : 'rgba(255,255,255,0.1)'};
        border-radius: 6px;
        color: ${cls === this.selectedClass ? info.color : '#ccc'};
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;
      `;
      btn.title = info.desc;
      btn.onclick = () => {
        this.selectedClass = cls;
        for (let i = 0; i < classButtons.length; i++) {
          const b = classButtons[i];
          const c = ['warrior', 'ranger', 'mage'][i] as CharacterClass;
          const inf = CLASS_INFO[c];
          b.style.borderColor = c === cls ? inf.color : 'rgba(255,255,255,0.1)';
          b.style.color = c === cls ? inf.color : '#ccc';
        }
      };
      classButtons.push(btn);
      classGrid.appendChild(btn);
    }
    panel.appendChild(classGrid);

    // Model selection
    const modelLabel = document.createElement('label');
    modelLabel.textContent = 'Character Model';
    modelLabel.style.cssText = `display: block; font-size: 12px; color: #aab; margin-bottom: 8px; font-weight: 600;`;
    panel.appendChild(modelLabel);

    const modelGrid = document.createElement('div');
    modelGrid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      margin-bottom: 24px;
      max-height: 180px;
      overflow-y: auto;
      padding: 4px;
    `;

    const modelButtons: HTMLButtonElement[] = [];
    for (const modelId of CHARACTER_MODELS) {
      const btn = document.createElement('button');
      // Show just the gender + letter (e.g. "M-A", "F-C").
      const m = modelId.match(/character-(male|female)-([a-f])/);
      btn.textContent = m ? `${m[1][0].toUpperCase()}-${m[2].toUpperCase()}` : modelId;
      btn.style.cssText = `
        padding: 10px 4px;
        background: ${modelId === this.selectedModel ? 'rgba(74, 144, 226, 0.3)' : 'rgba(0,0,0,0.4)'};
        border: 2px solid ${modelId === this.selectedModel ? '#4a90e2' : 'rgba(255,255,255,0.1)'};
        border-radius: 4px;
        color: ${modelId === this.selectedModel ? '#4a90e2' : '#ccc'};
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;
      `;
      btn.title = modelId;
      btn.onclick = () => {
        this.selectedModel = modelId;
        for (const b of modelButtons) {
          const isActive = b.title === modelId;
          b.style.background = isActive ? 'rgba(74, 144, 226, 0.3)' : 'rgba(0,0,0,0.4)';
          b.style.borderColor = isActive ? '#4a90e2' : 'rgba(255,255,255,0.1)';
          b.style.color = isActive ? '#4a90e2' : '#ccc';
        }
      };
      modelButtons.push(btn);
      modelGrid.appendChild(btn);
    }
    panel.appendChild(modelGrid);

    // Play button
    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play';
    playBtn.style.cssText = `
      width: 100%;
      padding: 14px;
      background: linear-gradient(90deg, #e07b3a, #d06a2a);
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 16px;
      font-weight: 800;
      cursor: pointer;
      font-family: inherit;
      letter-spacing: 0.05em;
      transition: transform 0.1s;
    `;
    playBtn.onmouseenter = () => playBtn.style.transform = 'scale(1.02)';
    playBtn.onmouseleave = () => playBtn.style.transform = 'scale(1)';
    playBtn.onclick = () => {
      const name = this.nameInput.value.trim() || `Player${Math.floor(Math.random() * 9999)}`;
      if (this.resolveFn) {
        this.resolveFn({
          name,
          characterClass: this.selectedClass,
          characterModel: this.selectedModel,
        });
      }
    };
    panel.appendChild(playBtn);

    // Enter key on name input triggers Play.
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') playBtn.click();
    });

    this.container.appendChild(panel);
    document.body.appendChild(this.container);
  }

  /** Show the login screen. Resolves when the player clicks Play. */
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
    this.container.remove();
  }
}
