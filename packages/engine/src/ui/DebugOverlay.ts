/**
 * Rift & Raid — DebugOverlay
 *
 * A DOM overlay that shows real-time debug info:
 *   - FPS, tick rate, entity count
 *   - Network stats (ping, packets/sec, bandwidth)
 *   - Local player state (position, rotation, HP, class, faction, model)
 *   - Visible players count (with breakdown by faction)
 *   - Active entities (projectiles, structures)
 *
 * Toggle with F3 key. Always-on by default in dev mode.
 *
 * The overlay is read-only — it polls a DebugDataSource each frame.
 */

export interface DebugDataSource {
  getStats(): DebugStats;
}

export interface DebugStats {
  fps: number;
  tickRate: number;
  entityCount: number;
  // Network
  connectionState: string;
  localSessionId: string | null;
  pingMs: number;
  playersVisible: number;
  projectilesVisible: number;
  // Local player
  localPlayer: {
    name: string;
    faction: string;
    characterClass: string;
    characterModel: string;
    x: number;
    y: number;
    z: number;
    rotation: number;
    hp: number;
    maxHp: number;
    invIron: number;
    invEmberwood: number;
    invGodshard: number;
  } | null;
  // Custom log lines (engine systems can push messages)
  logLines: string[];
}

export class DebugOverlay {
  private container: HTMLDivElement;
  private isVisible = true;
  private source: DebugDataSource | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 8px;
      left: 8px;
      background: rgba(0, 0, 0, 0.75);
      color: #b0e0b0;
      padding: 10px 12px;
      border-radius: 4px;
      font-family: "SF Mono", Menlo, Consolas, monospace;
      font-size: 11px;
      line-height: 1.55;
      pointer-events: none;
      z-index: 100;
      white-space: pre;
      max-width: 380px;
      backdrop-filter: blur(4px);
      border: 1px solid rgba(80, 200, 80, 0.2);
    `;
    document.body.appendChild(this.container);

    // F3 toggles visibility.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  setSource(source: DebugDataSource): void {
    this.source = source;
  }

  toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'block' : 'none';
  }

  /** Called every frame by the game loop. */
  update(): void {
    if (!this.isVisible || !this.source) return;
    try {
      const stats = this.source.getStats();
      this.container.textContent = this.format(stats);
    } catch (e) {
      // Swallow errors during early init when room.state isn't ready yet.
      // The overlay will retry next frame.
    }
  }

  private format(s: DebugStats): string {
    const lines: string[] = [];
    lines.push('═══ Rift & Raid ═══');
    lines.push(`FPS: ${s.fps}  Tick: ${s.tickRate}Hz  Entities: ${s.entityCount}`);
    lines.push('─── Network ───');
    lines.push(`State: ${s.connectionState}`);
    lines.push(`Session: ${s.localSessionId?.slice(0, 12) ?? '-'}`);
    lines.push(`Ping: ${s.pingMs.toFixed(0)}ms  Players: ${s.playersVisible}  Projectiles: ${s.projectilesVisible}`);
    if (s.localPlayer) {
      const p = s.localPlayer;
      lines.push('─── Local Player ───');
      lines.push(`${p.name} [${p.faction}] ${p.characterClass} (${p.characterModel})`);
      lines.push(`pos: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  rot: ${(p.rotation * 180 / Math.PI).toFixed(0)}°`);
      lines.push(`HP: ${p.hp}/${p.maxHp}`);
      lines.push(`Inv: iron=${p.invIron} ember=${p.invEmberwood} godshard=${p.invGodshard}`);
    }
    if (s.logLines.length > 0) {
      lines.push('─── Log ───');
      for (const line of s.logLines.slice(-5)) {
        lines.push(line);
      }
    }
    return lines.join('\n');
  }

  dispose(): void {
    this.container.remove();
  }
}
