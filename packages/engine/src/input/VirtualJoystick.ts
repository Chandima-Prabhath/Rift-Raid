/**
 * Rift & Raid — VirtualJoystick
 *
 * Mobile twin-stick controls. Two virtual joysticks:
 *   - Left half of screen → movement
 *   - Right half of screen → aim + attack (hold to attack)
 *
 * Plus on-screen buttons for dash, ability, interact, sprint.
 *
 * Per GDD decision #1, twin-stick with optional auto-aim assist on mobile.
 * Phase 0 implements the joysticks; auto-aim assist is Phase 8.
 */

import type { Vec2 } from '@rift-and-raid/shared';
import type { InputAdapter, InputState } from './InputManager.js';

interface Touch {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  side: 'left' | 'right';
}

const JOYSTICK_RADIUS = 60; // pixels
const DEAD_ZONE = 0.15;

export class VirtualJoystick implements InputAdapter {
  private touches = new Map<number, Touch>();
  private canvas: HTMLCanvasElement | null = null;
  private buttons: Record<string, boolean> = {};
  private buttonElements = new Map<string, HTMLButtonElement>();

  /** DOM container for on-screen buttons. */
  private buttonContainer: HTMLDivElement | null = null;
  private aimWorld: Vec2 = { x: 0, y: 0 };

  attach(): void {
    // Use the first canvas on the page (or attach to document body for touch).
    this.canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    const target: HTMLElement = this.canvas ?? document.body;

    target.addEventListener('touchstart', this.onTouchStart, { passive: false });
    target.addEventListener('touchmove', this.onTouchMove, { passive: false });
    target.addEventListener('touchend', this.onTouchEnd);
    target.addEventListener('touchcancel', this.onTouchEnd);

    this.createButtons();
  }

  detach(): void {
    const target: HTMLElement = this.canvas ?? document.body;
    target.removeEventListener('touchstart', this.onTouchStart);
    target.removeEventListener('touchmove', this.onTouchMove);
    target.removeEventListener('touchend', this.onTouchEnd);
    target.removeEventListener('touchcancel', this.onTouchEnd);
    this.destroyButtons();
  }

  setAimWorld(x: number, y: number): void {
    this.aimWorld.x = x;
    this.aimWorld.y = y;
  }

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    const rect = (this.canvas ?? document.body).getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const x = t.clientX - rect.left;
      const side: 'left' | 'right' = x < rect.width / 2 ? 'left' : 'right';
      this.touches.set(t.identifier, {
        id: t.identifier,
        startX: x,
        startY: t.clientY - rect.top,
        currentX: x,
        currentY: t.clientY - rect.top,
        side,
      });
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    const rect = (this.canvas ?? document.body).getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const touch = this.touches.get(t.identifier);
      if (!touch) continue;
      touch.currentX = t.clientX - rect.left;
      touch.currentY = t.clientY - rect.top;
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.touches.delete(e.changedTouches[i].identifier);
    }
  };

  private createButtons(): void {
    this.buttonContainer = document.createElement('div');
    this.buttonContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100;
      pointer-events: none;
    `;
    document.body.appendChild(this.buttonContainer);

    const makeButton = (id: string, label: string, bottom: number, right: number) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        position: fixed;
        bottom: ${bottom}px;
        right: ${right}px;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: rgba(60, 60, 80, 0.6);
        color: white;
        border: 2px solid rgba(255,255,255,0.4);
        font-size: 14px;
        font-weight: bold;
        user-select: none;
        touch-action: none;
        z-index: 100;
        pointer-events: auto;
      `;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.buttons[id] = true;
      });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.buttons[id] = false;
      });
      document.body.appendChild(btn);
      this.buttonElements.set(id, btn);
    };

    makeButton('dash', 'DASH', 100, 20);
    makeButton('ability', 'ABIL', 20, 100);
    makeButton('interact', 'USE', 20, 180);
  }

  private destroyButtons(): void {
    for (const btn of this.buttonElements.values()) btn.remove();
    this.buttonElements.clear();
    this.buttonContainer?.remove();
    this.buttonContainer = null;
  }

  update(state: InputState, _dt: number): void {
    // Movement (left side touch).
    let mx = 0;
    let my = 0;
    let aimDx = 0;
    let aimDy = 0;
    let rightActive = false;

    for (const touch of this.touches.values()) {
      const dx = touch.currentX - touch.startX;
      const dy = touch.currentY - touch.startY;
      const len = Math.hypot(dx, dy);
      const clamped = Math.min(len, JOYSTICK_RADIUS);
      const nx = len > 0 ? (dx / len) * clamped : 0;
      const ny = len > 0 ? (dy / len) * clamped : 0;

      if (touch.side === 'left') {
        const mag = clamped / JOYSTICK_RADIUS;
        if (mag > DEAD_ZONE) {
          mx = nx / JOYSTICK_RADIUS;
          my = ny / JOYSTICK_RADIUS;
        }
      } else {
        rightActive = true;
        const mag = clamped / JOYSTICK_RADIUS;
        if (mag > DEAD_ZONE) {
          aimDx = nx / JOYSTICK_RADIUS;
          aimDy = ny / JOYSTICK_RADIUS;
        }
      }
    }

    if (mx !== 0 || my !== 0) {
      state.move.x = mx;
      state.move.y = my;
    }

    // Aim: use right-stick direction relative to player (Phase 0: aim at world origin
    // offset by stick direction. Phase 1 will use actual player position from camera).
    if (rightActive) {
      state.aimActive = true;
      state.aim.x = this.aimWorld.x + aimDx * 5;
      state.aim.y = this.aimWorld.y + aimDy * 5;
      // Right stick held = attacking (Mini Militia convention).
      if (!state.attackHeld) state.attackPressed = true;
      state.attackHeld = true;
    }

    if (this.buttons['dash']) {
      state.dashPressed = true;
      this.buttons['dash'] = false; // edge-trigger
    }
    if (this.buttons['ability']) {
      state.abilityPressed = true;
      this.buttons['ability'] = false;
    }
    if (this.buttons['interact']) {
      state.interactPressed = true;
      this.buttons['interact'] = false;
    }
  }
}
