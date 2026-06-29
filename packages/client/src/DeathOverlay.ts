/**
 * Rift & Raid — DeathOverlay
 *
 * Shows when the local player dies. Displays a respawn timer and dims the
 * screen. Hidden when the player respawns.
 */

export class DeathOverlay {
  private container: HTMLDivElement;
  private timerEl: HTMLDivElement;
  private titleEl: HTMLHeadingElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 150;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: white;
    `;

    this.titleEl = document.createElement('h1');
    this.titleEl.textContent = 'You Died';
    this.titleEl.style.cssText = `
      font-size: 48px;
      font-weight: 900;
      color: #e44;
      text-shadow: 0 4px 12px rgba(0,0,0,0.8);
      margin: 0 0 16px 0;
      letter-spacing: -0.02em;
    `;
    this.container.appendChild(this.titleEl);

    this.timerEl = document.createElement('div');
    this.timerEl.style.cssText = `
      font-size: 24px;
      font-weight: 600;
      color: #ccc;
      text-shadow: 0 2px 4px rgba(0,0,0,0.8);
    `;
    this.timerEl.textContent = 'Respawning in 5...';
    this.container.appendChild(this.timerEl);

    document.body.appendChild(this.container);
  }

  /** Show the death overlay with a respawn countdown. */
  show(respawnDelayMs: number, diedAt: number): void {
    this.container.style.display = 'flex';
    this.updateTimer(respawnDelayMs, diedAt);
  }

  /** Update the countdown timer. */
  updateTimer(respawnDelayMs: number, diedAt: number): void {
    const elapsed = Date.now() - diedAt;
    const remaining = Math.max(0, respawnDelayMs - elapsed);
    const seconds = Math.ceil(remaining / 1000);
    this.timerEl.textContent = `Respawning in ${seconds}...`;
  }

  /** Hide the overlay (player respawned). */
  hide(): void {
    this.container.style.display = 'none';
  }

  get isVisible(): boolean {
    return this.container.style.display === 'flex';
  }

  dispose(): void {
    this.container.remove();
  }
}
