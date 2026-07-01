/**
 * Rift & Raid — HUD
 *
 * Game-like HUD overlay with:
 *   - Bottom-left: HP bar + personal inventory
 *   - Top-left: Team vault resources
 *   - Bottom-center: controls hint (auto-hides after 10s)
 *   - Top-center: faction indicator
 *   - All styled with glassmorphism + faction colors
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
  private healthBar: HTMLDivElement;
  private healthFill: HTMLDivElement;
  private healthText: HTMLDivElement;
  private inventory: HTMLDivElement;
  private vault: HTMLDivElement;
  private factionBanner: HTMLDivElement;
  private controls: HTMLDivElement;
  private stats: HudStats = {};
  private controlsTimer = 0;

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

    // ── Faction banner (top-center) ──
    this.factionBanner = document.createElement('div');
    this.factionBanner.style.cssText = `
      position: absolute;
      top: 12px; left: 50%;
      transform: translateX(-50%);
      padding: 6px 20px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      display: none;
    `;
    this.container.appendChild(this.factionBanner);

    // ── Team vault (top-left) ──
    this.vault = document.createElement('div');
    this.vault.style.cssText = `
      position: absolute;
      top: 12px; left: 12px;
      background: rgba(10, 14, 24, 0.8);
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.7;
      min-width: 130px;
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(8px);
    `;
    this.container.appendChild(this.vault);

    // ── HP bar + inventory (bottom-left) ──
    const bottomLeft = document.createElement('div');
    bottomLeft.style.cssText = `position: absolute; bottom: 16px; left: 16px; display: flex; flex-direction: column; gap: 8px;`;

    // Inventory
    this.inventory = document.createElement('div');
    this.inventory.style.cssText = `
      background: rgba(10, 14, 24, 0.8);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.6;
      min-width: 140px;
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(8px);
    `;
    bottomLeft.appendChild(this.inventory);

    // HP bar
    this.healthBar = document.createElement('div');
    this.healthBar.style.cssText = `
      width: 220px;
      height: 26px;
      background: rgba(10, 14, 24, 0.8);
      border: 2px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      overflow: hidden;
      position: relative;
      backdrop-filter: blur(8px);
    `;
    this.healthFill = document.createElement('div');
    this.healthFill.style.cssText = `
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #c0392b, #e74c3c);
      transition: width 0.2s ease-out;
    `;
    this.healthBar.appendChild(this.healthFill);
    this.healthText = document.createElement('div');
    this.healthText.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      font-size: 12px;
      font-weight: 700;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    `;
    this.healthBar.appendChild(this.healthText);
    bottomLeft.appendChild(this.healthBar);

    this.container.appendChild(bottomLeft);

    // ── Controls hint (bottom-center, auto-hide) ──
    this.controls = document.createElement('div');
    this.controls.style.cssText = `
      position: absolute;
      bottom: 10px; left: 50%;
      transform: translateX(-50%);
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      font-family: monospace;
      text-align: center;
      line-height: 1.7;
      transition: opacity 0.5s;
    `;
    this.controls.innerHTML = [
      '<b style="color:rgba(255,255,255,0.65)">WASD</b> move · <b style="color:rgba(255,255,255,0.65)">L-Click</b> attack · <b style="color:rgba(255,255,255,0.65)">Q</b> ability · <b style="color:rgba(255,255,255,0.65)">Space</b> dash',
      '<b style="color:rgba(255,255,255,0.65)">E</b> interact · <b style="color:rgba(255,255,255,0.65)">B</b> build · <b style="color:rgba(255,255,255,0.65)">R</b> rotate · <b style="color:rgba(255,255,255,0.65)">R-Click</b> camera · <b style="color:rgba(255,255,255,0.65)">Wheel</b> zoom',
    ].join('<br>');
    this.container.appendChild(this.controls);
    this.controlsTimer = 10;
  }

  setStats(stats: HudStats): void {
    this.stats = { ...this.stats, ...stats };
    this.render();
  }

  /** Called every frame to auto-hide controls hint. */
  tick(dt: number): void {
    if (this.controlsTimer > 0) {
      this.controlsTimer -= dt;
      if (this.controlsTimer <= 0) {
        this.controls.style.opacity = '0';
      }
    }
  }

  private render(): void {
    const s = this.stats;

    // HP bar
    if (s.playerHp !== undefined && s.playerMaxHp !== undefined) {
      const pct = Math.max(0, Math.min(100, (s.playerHp / s.playerMaxHp) * 100));
      this.healthFill.style.width = `${pct}%`;
      this.healthText.textContent = `${Math.round(s.playerHp)} / ${s.playerMaxHp}`;
      // Color shifts from green → yellow → red as HP drops.
      if (pct > 50) {
        this.healthFill.style.background = 'linear-gradient(90deg, #27ae60, #2ecc71)';
      } else if (pct > 25) {
        this.healthFill.style.background = 'linear-gradient(90deg, #e67e22, #f39c12)';
      } else {
        this.healthFill.style.background = 'linear-gradient(90deg, #c0392b, #e74c3c)';
      }
    }

    // Inventory
    if (s.playerResources) {
      this.inventory.innerHTML = `
        <div style="font-size:9px;color:#678;letter-spacing:0.1em;font-weight:700;">CARRYING</div>
        <div><span style="color:#a0a0b0">⚔</span> ${s.playerResources.iron} <span style="color:#678">·</span> <span style="color:#a08060">🪵</span> ${s.playerResources.emberwood} <span style="color:#678">·</span> <span style="color:#b080ff">💎</span> ${s.playerResources.godshard}</div>
      `;
    }

    // Vault
    if (s.vaultResources) {
      const isSolari = s.faction === 'solari';
      const color = isSolari ? '#e07b3a' : '#4a90e2';
      this.vault.innerHTML = `
        <div style="font-size:9px;color:${color};letter-spacing:0.1em;font-weight:700;margin-bottom:3px;">${isSolari ? 'SOLARI' : 'LUNARI'} VAULT</div>
        <div><span style="color:#a0a0b0">⚔</span> ${s.vaultResources.iron}</div>
        <div><span style="color:#a08060">🪵</span> ${s.vaultResources.emberwood}</div>
        <div><span style="color:#b080ff">💎</span> ${s.vaultResources.godshard}</div>
      `;
      this.factionBanner.style.display = 'block';
      this.factionBanner.style.background = isSolari ? 'rgba(224,123,58,0.2)' : 'rgba(74,144,226,0.2)';
      this.factionBanner.style.border = `1px solid ${color}`;
      this.factionBanner.style.color = color;
      this.factionBanner.textContent = isSolari ? '⚔ SOLARI' : '🌙 LUNARI';
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
