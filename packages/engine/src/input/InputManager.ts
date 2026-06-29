/**
 * Rift & Raid — InputManager
 *
 * Abstracts over keyboard, mouse, and touch. Gameplay systems read from
 * InputState; they don't care where the input came from. This is how we
 * support PC and mobile from a single codebase.
 *
 * The InputManager dispatches to one or more InputAdapters (KeyboardMouse,
 * VirtualJoystick). Multiple adapters can be active simultaneously — e.g.,
 * a desktop with a touchscreen can use either.
 *
 * InputState is mutated in-place every frame; gameplay systems read it
 * during their update().
 */

import type { Vec2 } from '@rift-and-raid/shared';

export interface InputState {
  // Movement (left stick on mobile, WASD on PC)
  move: Vec2; // normalized direction, magnitude 0..1
  // Aim (right stick on mobile, mouse position projected to ground on PC)
  aim: Vec2; // world-space XZ position
  aimActive: boolean; // false if no aim input (e.g., no right stick touch)
  // Actions
  attackHeld: boolean;
  attackPressed: boolean; // true for one tick on press edge
  abilityPressed: boolean;
  dashPressed: boolean;
  interactPressed: boolean;
  // Modifiers
  sprintHeld: boolean;
}

function makeDefaultState(): InputState {
  return {
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    aimActive: false,
    attackHeld: false,
    attackPressed: false,
    abilityPressed: false,
    dashPressed: false,
    interactPressed: false,
    sprintHeld: false,
  };
}

export interface InputAdapter {
  /** Called once on attach. Set up DOM listeners. */
  attach(): void;
  /** Called once on detach. Remove DOM listeners. */
  detach(): void;
  /** Called every tick. Update the InputState in-place. */
  update(state: InputState, dt: number): void;
}

export class InputManager {
  private state: InputState = makeDefaultState();
  private adapters: InputAdapter[] = [];
  private attached = false;

  addAdapter(adapter: InputAdapter): void {
    this.adapters.push(adapter);
    if (this.attached) adapter.attach();
  }

  removeAdapter(adapter: InputAdapter): void {
    const idx = this.adapters.indexOf(adapter);
    if (idx >= 0) {
      this.adapters.splice(idx, 1);
      if (this.attached) adapter.detach();
    }
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    for (const a of this.adapters) a.attach();
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    for (const a of this.adapters) a.detach();
  }

  /** Called every tick by the game loop. */
  update(dt: number): InputState {
    // Reset edge-triggered inputs from previous tick.
    this.state.attackPressed = false;
    this.state.abilityPressed = false;
    this.state.dashPressed = false;
    this.state.interactPressed = false;

    // Reset continuous inputs — adapters will set them.
    this.state.move.x = 0;
    this.state.move.y = 0;
    this.state.aimActive = false;
    this.state.attackHeld = false;
    this.state.sprintHeld = false;

    for (const a of this.adapters) a.update(this.state, dt);
    return this.state;
  }

  /** Get current state (read-only from gameplay's perspective). */
  getState(): Readonly<InputState> {
    return this.state;
  }
}
