/**
 * Rift & Raid — KeyboardMouse adapter
 *
 * PC input bindings:
 *   - WASD / Arrows  → move (camera-relative)
 *   - Mouse move     → aim (ground-projected point)
 *   - Left-click     → attack (hold for continuous)
 *   - Right-click    → CAMERA ROTATION (held + drag) — NOT ability
 *   - Space          → dash
 *   - Q              → ability
 *   - E              → interact
 *   - Shift          → sprint
 *   - 1/2/3          → class swap (Warrior/Ranger/Mage)
 *
 * Right-click is captured by SceneManager for camera orbit. We do NOT
 * bind it to ability here — use Q instead.
 */

import type { Vec2 } from '@rift-and-raid/shared';
import type { InputAdapter, InputState } from './InputManager.js';

interface Keys {
  [key: string]: boolean;
}

export class KeyboardMouse implements InputAdapter {
  private keys: Keys = {};
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;       // left button
  private abilityQueued = false;    // Q pressed (edge-triggered)
  private dashQueued = false;       // Space pressed
  private interactQueued = false;   // E pressed
  /** Ground-projected aim point (set by external code that knows the camera). */
  private aimWorld: Vec2 = { x: 0, y: 0 };

  private onKeyDown = (e: KeyboardEvent) => {
    // Avoid key-repeat causing edge-trigger spam.
    if (this.keys[e.code]) return;
    this.keys[e.code] = true;
    if (e.code === 'Space') {
      this.dashQueued = true;
      e.preventDefault(); // prevent page scroll
    }
    if (e.code === 'KeyE') this.interactQueued = true;
    if (e.code === 'KeyQ') this.abilityQueued = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };
  private onMouseDown = (e: MouseEvent) => {
    // Only left-click triggers attack. Right-click is handled by SceneManager
    // for camera rotation — we ignore it here.
    if (e.button === 0) this.mouseDown = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };
  private onContext = (e: Event) => e.preventDefault();

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContext);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContext);
  }

  /** Set the world-space aim point (computed by raycast from camera). */
  setAimWorld(x: number, y: number): void {
    this.aimWorld.x = x;
    this.aimWorld.y = y;
  }

  update(state: InputState, _dt: number): void {
    // Movement: WASD or arrow keys.
    let mx = 0;
    let my = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) my -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) my += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) mx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;
    // Normalize diagonals.
    const len = Math.hypot(mx, my);
    if (len > 0) {
      state.move.x = mx / len;
      state.move.y = my / len;
    }

    // Aim from mouse world position.
    state.aim.x = this.aimWorld.x;
    state.aim.y = this.aimWorld.y;
    state.aimActive = true;

    // Attack (left-click, hold for continuous).
    if (this.mouseDown) {
      if (!state.attackHeld) state.attackPressed = true;
      state.attackHeld = true;
    }

    // Ability (Q) — edge-triggered.
    if (this.abilityQueued) {
      state.abilityPressed = true;
      this.abilityQueued = false;
    }

    // Dash (space) — edge-triggered.
    if (this.dashQueued) {
      state.dashPressed = true;
      this.dashQueued = false;
    }

    // Interact (E) — edge-triggered.
    if (this.interactQueued) {
      state.interactPressed = true;
      this.interactQueued = false;
    }

    // Sprint (shift).
    state.sprintHeld = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
  }
}
