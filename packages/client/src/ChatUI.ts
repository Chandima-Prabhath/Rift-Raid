/**
 * Rift & Raid — Chat UI
 *
 * Simple in-game chat overlay. Press Enter to focus the input, type, press
 * Enter to send. Press Escape to cancel.
 *
 * Messages appear in the top-left corner, fading after a few seconds.
 */

export interface ChatMessage {
  playerId: string;
  name: string;
  text: string;
  timestamp: number;
}

export class ChatUI {
  private container: HTMLDivElement;
  private messagesEl: HTMLDivElement;
  private inputEl: HTMLInputElement;
  private onSend: (text: string) => void;
  private messageTimeouts = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(onSend: (text: string) => void) {
    this.onSend = onSend;

    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 60px;
      left: 8px;
      width: 320px;
      max-width: 60vw;
      z-index: 90;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;

    this.messagesEl = document.createElement('div');
    this.messagesEl.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 200px;
      overflow: hidden;
    `;
    this.container.appendChild(this.messagesEl);

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.placeholder = 'Press Enter to chat...';
    this.inputEl.maxLength = 200;
    this.inputEl.style.cssText = `
      width: 100%;
      box-sizing: border-box;
      padding: 6px 10px;
      margin-top: 6px;
      background: rgba(0,0,0,0.6);
      color: white;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 4px;
      font-size: 13px;
      pointer-events: auto;
      display: none;
    `;
    this.container.appendChild(this.inputEl);

    document.body.appendChild(this.container);

    // Enter to focus, Escape to blur, Enter in input to send.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && document.activeElement !== this.inputEl) {
        e.preventDefault();
        this.inputEl.style.display = 'block';
        this.inputEl.focus();
      } else if (e.code === 'Escape' && document.activeElement === this.inputEl) {
        this.inputEl.blur();
        this.inputEl.value = '';
        this.inputEl.style.display = 'none';
      }
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        const text = this.inputEl.value.trim();
        if (text) this.onSend(text);
        this.inputEl.value = '';
        this.inputEl.blur();
        this.inputEl.style.display = 'none';
      }
    });
  }

  addMessage(msg: ChatMessage): void {
    const el = document.createElement('div');
    el.style.cssText = `
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.4;
      animation: fadeIn 0.15s ease-out;
    `;
    const nameSpan = document.createElement('span');
    nameSpan.textContent = msg.name + ': ';
    nameSpan.style.fontWeight = 'bold';
    nameSpan.style.color = '#80c0ff';
    el.appendChild(nameSpan);
    el.appendChild(document.createTextNode(msg.text));
    this.messagesEl.appendChild(el);

    // Auto-remove after 6 seconds.
    const timeout = setTimeout(() => {
      el.style.transition = 'opacity 0.5s ease-out';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 6000);
    this.messageTimeouts.set(msg.timestamp, timeout);

    // Keep only the last 8 messages.
    while (this.messagesEl.children.length > 8) {
      this.messagesEl.firstChild?.remove();
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
