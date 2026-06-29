/**
 * Rift & Raid — KillFeed
 *
 * Shows recent kills in the top-right corner. "Player A killed Player B".
 * Each entry fades after 5 seconds.
 */

export interface KillFeedEntry {
  victimName: string;
  killerName: string;
  timestamp: number;
}

export class KillFeed {
  private container: HTMLDivElement;
  private entries: HTMLDivElement[] = [];

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 60px;
      right: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 85;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      max-width: 320px;
    `;
    document.body.appendChild(this.container);
  }

  addKill(victimName: string, killerName: string): void {
    const entry = document.createElement('div');
    entry.style.cssText = `
      background: rgba(0,0,0,0.75);
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.4;
      text-align: right;
      border-left: 3px solid #e44;
      animation: fadeIn 0.2s ease-out;
    `;
    const killer = document.createElement('span');
    killer.textContent = killerName;
    killer.style.fontWeight = 'bold';
    killer.style.color = '#80c0ff';
    entry.appendChild(killer);

    entry.appendChild(document.createTextNode(' killed '));

    const victim = document.createElement('span');
    victim.textContent = victimName;
    victim.style.fontWeight = 'bold';
    victim.style.color = '#ff8080';
    entry.appendChild(victim);

    this.container.appendChild(entry);
    this.entries.push(entry);

    // Auto-remove after 5 seconds.
    setTimeout(() => {
      entry.style.transition = 'opacity 0.5s ease-out';
      entry.style.opacity = '0';
      setTimeout(() => {
        entry.remove();
        const idx = this.entries.indexOf(entry);
        if (idx >= 0) this.entries.splice(idx, 1);
      }, 500);
    }, 5000);

    // Keep only last 5 entries.
    while (this.entries.length > 5) {
      const oldest = this.entries.shift();
      oldest?.remove();
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
