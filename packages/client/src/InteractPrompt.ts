/**
 * Rift & Raid — InteractPrompt
 *
 * Shows a contextual hint near the center of the screen when the player
 * is near an interactable object (resource node, vault).
 *
 * Examples:
 *   "Press E to harvest Iron"
 *   "Press E to deposit resources"
 */

export class InteractPrompt {
  private container: HTMLDivElement;
  private label: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      bottom: 140px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      padding: 8px 16px;
      z-index: 65;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: white;
      font-size: 14px;
      font-weight: 600;
      display: none;
      pointer-events: none;
    `;

    this.label = document.createElement('div');
    this.container.appendChild(this.label);
    document.body.appendChild(this.container);
  }

  show(text: string): void {
    this.label.textContent = text;
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  dispose(): void {
    this.container.remove();
  }
}
