/**
 * Rift & Raid — BuildMenu
 *
 * Toggle with B key. Shows a grid of buildable structures with their cost.
 * When a structure is selected, the client shows a ghost preview at the
 * mouse position. Clicking places the structure (sends 'build' message).
 *
 * IMPORTANT: render() is NOT called every frame. The affordability display
 * is updated in-place by updating only the CSS classes of existing buttons,
 * not recreating them. Calling render() every frame destroys click handlers.
 */

import { STRUCTURE_TYPES, type StructureTypeId } from '@rift-and-raid/shared';

export interface BuildMenuCallbacks {
  onSelect: (structureType: StructureTypeId | null) => void;
  onPlace: (structureType: StructureTypeId, x: number, z: number, rotation: number) => void;
  getVaultResources: () => { iron: number; emberwood: number; godshard: number };
}

export class BuildMenu {
  private container: HTMLDivElement;
  private callbacks: BuildMenuCallbacks;
  private selected: StructureTypeId | null = null;
  private isVisible = false;
  private buttonEls = new Map<StructureTypeId, HTMLDivElement>();
  private hintEl: HTMLDivElement | null = null;
  private hasRendered = false;

  constructor(callbacks: BuildMenuCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 12, 20, 0.92);
      border: 2px solid rgba(74, 144, 226, 0.4);
      border-radius: 10px;
      padding: 14px 16px;
      display: none;
      flex-direction: column;
      gap: 10px;
      z-index: 70;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: white;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      pointer-events: auto;
    `;
    document.body.appendChild(this.container);
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'flex' : 'none';
    if (this.isVisible) {
      if (!this.hasRendered) {
        this.buildUI();
        this.hasRendered = true;
      }
      this.updateAffordability();
    } else {
      this.selected = null;
      this.callbacks.onSelect(null);
      this.updateSelection();
    }
  }

  get isSelected(): boolean {
    return this.selected !== null;
  }

  get selectedType(): StructureTypeId | null {
    return this.selected;
  }

  /** Build the UI once. Buttons are persistent — not recreated. */
  private buildUI(): void {
    this.container.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = 'BUILD MENU';
    title.style.cssText = `font-size: 12px; font-weight: 800; margin-bottom: 4px; text-align: center; letter-spacing: 0.15em; color: #4a90e2;`;
    this.container.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = `display: flex; gap: 8px;`;

    for (const [id, config] of Object.entries(STRUCTURE_TYPES)) {
      const sid = id as StructureTypeId;
      const btn = document.createElement('div');
      btn.style.cssText = `
        background: rgba(40, 40, 50, 0.8);
        border: 2px solid rgba(255,255,255,0.15);
        border-radius: 8px;
        padding: 12px 14px;
        cursor: pointer;
        min-width: 120px;
        text-align: center;
        transition: all 0.15s;
        pointer-events: auto;
      `;
      btn.innerHTML = `
        <div style="font-size: 14px; font-weight: 700; margin-bottom: 4px;">${config.name}</div>
        <div style="font-size: 10px; color: #aab;">
          ${config.cost.iron > 0 ? `⚔ ${config.cost.iron} ` : ''}
          ${config.cost.emberwood > 0 ? `🪵 ${config.cost.emberwood} ` : ''}
          ${config.cost.godshard > 0 ? `💎 ${config.cost.godshard}` : ''}
        </div>
        <div style="font-size: 9px; color: #678; margin-top: 3px;">HP ${config.hp} · ${(config.constructionMs / 1000).toFixed(0)}s</div>
      `;
      btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.selected = this.selected === sid ? null : sid;
        this.callbacks.onSelect(this.selected);
        this.updateSelection();
      };
      this.buttonEls.set(sid, btn);
      grid.appendChild(btn);
    }
    this.container.appendChild(grid);

    this.hintEl = document.createElement('div');
    this.hintEl.style.cssText = `font-size: 11px; color: #889; margin-top: 4px; text-align: center;`;
    this.hintEl.innerHTML = `<b style="color:#4a90e2">Click</b> ground to place · <b style="color:#4a90e2">R</b> rotate · <b style="color:#4a90e2">Esc</b> cancel`;
    this.hintEl.style.display = 'none';
    this.container.appendChild(this.hintEl);
  }

  /** Update button styling based on selection + affordability. */
  private updateSelection(): void {
    for (const [sid, btn] of this.buttonEls) {
      const isSelected = this.selected === sid;
      const config = STRUCTURE_TYPES[sid];
      const vault = this.callbacks.getVaultResources();
      const affordable = vault.iron >= config.cost.iron
        && vault.emberwood >= config.cost.emberwood
        && vault.godshard >= config.cost.godshard;
      btn.style.borderColor = isSelected ? '#4a90e2' : affordable ? 'rgba(255,255,255,0.15)' : 'rgba(200,80,80,0.3)';
      btn.style.background = isSelected ? 'rgba(74,144,226,0.3)' : affordable ? 'rgba(40,40,50,0.8)' : 'rgba(40,40,50,0.4)';
      btn.style.opacity = affordable ? '1' : '0.5';
      btn.style.cursor = affordable ? 'pointer' : 'not-allowed';
    }
    if (this.hintEl) {
      this.hintEl.style.display = this.selected ? 'block' : 'none';
    }
  }

  /** Update affordability without recreating buttons. Called every frame. */
  updateAffordability(): void {
    if (!this.isVisible) return;
    this.updateSelection();
  }

  /** Refresh — alias for updateAffordability (called from game loop). */
  refresh(): void {
    this.updateAffordability();
  }

  place(x: number, z: number, rotation: number): void {
    if (!this.selected) return;
    this.callbacks.onPlace(this.selected, x, z, rotation);
  }

  cancel(): void {
    this.selected = null;
    this.callbacks.onSelect(null);
    this.updateSelection();
  }

  dispose(): void {
    this.container.remove();
  }
}
