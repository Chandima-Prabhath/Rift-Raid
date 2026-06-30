/**
 * Rift & Raid — HUD
 *
 * In-canvas HUD overlay. Shows:
 *   - Debug stats (top-left, below debug overlay)
 *   - HP bar (bottom-left)
 *   - Personal inventory (left side, above HP)
 *   - Team vault resources (left side, below debug)
 *
 * DOM overlay — cheaper than Three.js sprites for text.
 */

export interface HudStats {
  fps?: number;
  tickRate?: number;
  entityCount?: number;
  playerHp?: number;
  playerMaxHp?: number;
  playerResources?: { iron: number; emberwood: number; godshard: number };
  vaultResources?: { iron: number; emberwood: number; godshard: number };
  faction?: string;
}

export class HUD {
  private container: HTMLDivElement;
  private debug: HTMLDivElement;
  private health: HTMLDivElement;
  private resources: HTMLDivElement;
  private vault: HTMLDivElement;
  private controls: HTMLDivElement;
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

    // Debug stats (top-left).
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
      display: none;
    `;
    this.container.appendChild(this.debug);

    // Team vault resources (top-left, below debug).
    this.vault = document.createElement('div');
    this.vault.style.cssText = `
      position: absolute;
      top: 8px; left: 8px;
      background: rgba(0,0,0,0.6);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.6;
      min-width: 140px;
      border: 1px solid rgba(255,255,255,0.15);
    `;
    this.container.appendChild(this.vault);

    // Personal inventory (bottom-left, above HP).
    this.resources = document.createElement('div');
    this.resources.style.cssText = `
      position: absolute;
      bottom: 60px; left: 20px;
      background: rgba(0,0,0,0.6);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.5;
      min-width: 120px;
      border: 1px solid rgba(255,255,255,0.15);
    `;
    this.container.appendChild(this.resources);

    // HP bar (bottom-left).
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

    // Controls hint (bottom-center) — two lines for readability.
    this.controls = document.createElement('div');
    this.controls.style.cssText = `
      position: absolute;
      bottom: 8px; left: 50%;
      transform: translateX(-50%);
      font-size: 11px;
      color: rgba(255,255,255,0.45);
      font-family: monospace;
      white-space: nowrap;
      text-align: center;
      line-height: 1.6;
    `;
    this.controls.innerHTML = [
      '<b style="color:rgba(255,255,255,0.7)">WASD</b> move · <b style="color:rgba(255,255,255,0.7)">Mouse</b> aim · <b style="color:rgba(255,255,255,0.7)">L-Click</b> attack · <b style="color:rgba(255,255,255,0.7)">Q</b> ability · <b style="color:rgba(255,255,255,0.7)">Space</b> dash',
      '<b style="color:rgba(255,255,255,0.7)">E</b> interact · <b style="color:rgba(255,255,255,0.7)">B</b> build · <b style="color:rgba(255,255,255,0.7)">R-Click/Middle</b> rotate camera · <b style="color:rgba(255,255,255,0.7)">Wheel</b> zoom · <b style="color:rgba(255,255,255,0.7)">F3</b> debug',
    ].join('<br>');
    this.container.appendChild(this.controls);
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

    const fill = document.getElementById('rr-health-fill');
    if (fill && s.playerHp !== undefined && s.playerMaxHp !== undefined) {
      const pct = Math.max(0, Math.min(100, (s.playerHp / s.playerMaxHp) * 100));
      fill.style.width = `${pct}%`;
    }

    // Personal inventory.
    if (s.playerResources) {
      this.resources.innerHTML = [
        `<div style="font-size:10px;color:#889;margin-bottom:2px;">CARRYING</div>`,
        `<span style="color:#a0a0b0">Iron:</span> ${s.playerResources.iron}`,
        `<span style="color:#a08060">Wood:</span> ${s.playerResources.emberwood}`,
        `<span style="color:#b080ff">Godshard:</span> ${s.playerResources.godshard}`,
      ].join('<br>');
    }

    // Team vault.
    if (s.vaultResources) {
      const factionLabel = s.faction === 'solari' ? 'SOLARI VAULT' : 'LUNARI VAULT';
      const factionColor = s.faction === 'solari' ? '#e07b3a' : '#4a90e2';
      this.vault.innerHTML = [
        `<div style="font-size:10px;color:${factionColor};margin-bottom:2px;font-weight:700;">${factionLabel}</div>`,
        `<span style="color:#a0a0b0">Iron:</span> ${s.vaultResources.iron}`,
        `<span style="color:#a08060">Wood:</span> ${s.vaultResources.emberwood}`,
        `<span style="color:#b080ff">Godshard:</span> ${s.vaultResources.godshard}`,
      ].join('<br>');
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
