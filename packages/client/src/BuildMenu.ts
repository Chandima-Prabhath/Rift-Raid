/**
 * Rift & Raid — BuildMenu
 *
 * Toggle with B key. Shows a grid of buildable structures with their cost.
 * When a structure is selected, the client shows a ghost preview at the
 * mouse position. Clicking places the structure (sends 'build' message).
 *
 * Structures are drawn from STRUCTURE_TYPES in shared/constants.
 */

import { STRUCTURE_TYPES, type StructureTypeId } from '@rift-and-raid/shared';

export interface BuildMenuCallbacks {
  /** Called when the player selects a structure to place. null = cancel. */
  onSelect: (structureType: StructureTypeId | null) => void;
  /** Called when the player clicks to place the selected structure. */
  onPlace: (structureType: StructureTypeId, x: number, z: number, rotation: number) => void;
  /** Get the current vault resources (for showing affordability). */
  getVaultResources: () => { iron: number; emberwood: number; godshard: number };
}

export class BuildMenu {
  private container: HTMLDivElement;
  private callbacks: BuildMenuCallbacks;
  private selected: StructureTypeId | null = null;
  private isVisible = false;

  constructor(callbacks: BuildMenuCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      padding: 12px;
      display: none;
      gap: 10px;
      z-index: 70;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: white;
    `;
    document.body.appendChild(this.container);
    // Don't call render() in constructor — the callbacks may reference
    // objects that aren't initialized yet (e.g. NetworkSystem). render()
    // is called on first toggle() instead.
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'flex' : 'none';
    if (this.isVisible) {
      this.render();
    } else {
      this.selected = null;
      this.callbacks.onSelect(null);
    }
  }

  get isSelected(): boolean {
    return this.selected !== null;
  }

  get selectedType(): StructureTypeId | null {
    return this.selected;
  }

  private render(): void {
    this.container.innerHTML = '';
    const vault = this.callbacks.getVaultResources();

    const title = document.createElement('div');
    title.textContent = 'Build Menu (B to close)';
    title.style.cssText = `font-size: 13px; font-weight: 700; margin-bottom: 8px; text-align: center;`;
    this.container.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = `display: flex; gap: 8px;`;

    for (const [id, config] of Object.entries(STRUCTURE_TYPES)) {
      const sid = id as StructureTypeId;
      const affordable = vault.iron >= config.cost.iron
        && vault.emberwood >= config.cost.emberwood
        && vault.godshard >= config.cost.godshard;
      const isSelected = this.selected === sid;

      const btn = document.createElement('div');
      btn.style.cssText = `
        background: ${isSelected ? 'rgba(74, 144, 226, 0.4)' : 'rgba(40, 40, 50, 0.8)'};
        border: 2px solid ${isSelected ? '#4a90e2' : affordable ? 'rgba(255,255,255,0.2)' : 'rgba(200,80,80,0.3)'};
        border-radius: 6px;
        padding: 10px 12px;
        cursor: ${affordable ? 'pointer' : 'not-allowed'};
        opacity: ${affordable ? '1' : '0.5'};
        min-width: 110px;
        text-align: center;
        transition: all 0.15s;
      `;
      btn.innerHTML = `
        <div style="font-size: 13px; font-weight: 700; margin-bottom: 4px;">${config.name}</div>
        <div style="font-size: 10px; color: #aab;">
          ${config.cost.iron > 0 ? `Iron: ${config.cost.iron} ` : ''}
          ${config.cost.emberwood > 0 ? `Wood: ${config.cost.emberwood} ` : ''}
          ${config.cost.godshard > 0 ? `Godshard: ${config.cost.godshard}` : ''}
        </div>
        <div style="font-size: 10px; color: #889; margin-top: 2px;">HP: ${config.hp} · ${(config.constructionMs / 1000).toFixed(0)}s</div>
      `;
      if (affordable) {
        btn.onclick = () => {
          this.selected = isSelected ? null : sid;
          this.callbacks.onSelect(this.selected);
          this.render();
        };
      }
      grid.appendChild(btn);
    }
    this.container.appendChild(grid);

    if (this.selected) {
      const hint = document.createElement('div');
      hint.textContent = `Click on the ground to place. Right-click to cancel.`;
      hint.style.cssText = `font-size: 11px; color: #4a90e2; margin-top: 8px; text-align: center;`;
      this.container.appendChild(hint);
    }
  }

  /** Called when the player clicks on the ground while a structure is selected. */
  place(x: number, z: number, rotation: number): void {
    if (!this.selected) return;
    this.callbacks.onPlace(this.selected, x, z, rotation);
    // Keep selection for rapid placement (shift to place multiple).
  }

  /** Cancel the current selection. */
  cancel(): void {
    this.selected = null;
    this.callbacks.onSelect(null);
    this.render();
  }

  /** Refresh affordability display (call when vault changes). */
  refresh(): void {
    if (this.isVisible) this.render();
  }

  dispose(): void {
    this.container.remove();
  }
}
