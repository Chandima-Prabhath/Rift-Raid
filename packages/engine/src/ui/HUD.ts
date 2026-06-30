/**
 * Rift & Raid — HUD
 *
 * Lightweight in-canvas HUD overlay. Phase 0: minimal FPS counter and
 * debug stats. Phase 3+ adds health bar, resource counts, minimap.
 *
 * Implemented as a DOM overlay (absolutely positioned divs over the canvas)
 * rather than Three.js sprites — DOM is cheaper for text and updates less
 * frequently than the render loop.
 */

export interface HudStats {
  fps?: number;
  tickRate?: number;
  entityCount?: number;
  playerHp?: number;
  playerMaxHp?: number;
  playerResources?: { iron: number; emberwood: number; godshard: number };
}

export class HUD {
  private container: HTMLDivElement;
  private debug: HTMLDivElement;
  private health: HTMLDivElement;
  private resources: HTMLDivElement;
  private stats: HudStats = {};

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: white;
      z-index: 50;
    `;
    document.body.appendChild(this.container);

    this.debug = document.createElement('div');
    this.debug.style.cssText = `
      position: absolute;
      top: 8px; left: 8px;
      background: rgba(0,0,0,0.5);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.5;
      font-family: monospace;
    `;
    this.container.appendChild(this.debug);

    this.health = document.createElement('div');
    this.health.style.cssText = `
      position: absolute;
      bottom: 20px; left: 20px;
      width: 240px;
      height: 28px;
      background: rgba(0,0,0,0.5);
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 4px;
      overflow: hidden;
    `;
    const healthFill = document.createElement('div');
    healthFill.id = 'rr-health-fill';
    healthFill.style.cssText = `
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #e44, #c33);
      transition: width 0.15s ease-out;
    `;
    this.health.appendChild(healthFill);
    this.health.appendChild(this.makeTextSpan('HP', 'bottom: 6px; left: 10px; font-size: 12px;'));
    this.container.appendChild(this.health);

    this.resources = document.createElement('div');
    this.resources.style.cssText = `
      position: absolute;
      top: 8px; right: 8px;
      background: rgba(0,0,0,0.5);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.6;
      min-width: 120px;
    `;
    this.container.appendChild(this.resources);
  }

  private makeTextSpan(text: string, extraCss = ''): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = text;
    span.style.cssText = `position: absolute; ${extraCss}`;
    return span;
  }

  setStats(stats: HudStats): void {
    this.stats = { ...this.stats, ...stats };
    this.render();
  }

  private render(): void {
    const s = this.stats;
    this.debug.innerHTML = [
      `<b>Rift &amp; Raid</b> · Phase 0`,
      `FPS: ${s.fps ?? '-'}  ·  Tick: ${s.tickRate ?? '-'}Hz`,
      `Entities: ${s.entityCount ?? '-'}`,
    ].join('<br>');

    const fill = document.getElementById('rr-health-fill');
    if (fill && s.playerHp !== undefined && s.playerMaxHp !== undefined) {
      const pct = Math.max(0, Math.min(100, (s.playerHp / s.playerMaxHp) * 100));
      fill.style.width = `${pct}%`;
    }

    if (s.playerResources) {
      this.resources.innerHTML = [
        `<span style="color:#a0a0b0">Iron:</span> ${s.playerResources.iron}`,
        `<span style="color:#a08060">Emberwood:</span> ${s.playerResources.emberwood}`,
        `<span style="color:#b080ff">Godshard:</span> ${s.playerResources.godshard}`,
      ].join('<br>');
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
