/**
 * Rift & Raid — InputMapper
 *
 * Maps raw inputs to gameplay actions. Phase 0: hardcoded default bindings.
 * Phase 1+ will load bindings from a config file, with per-player overrides.
 *
 * The InputManager already exposes a high-level InputState, so most systems
 * don't need this. The InputMapper is for re-binding keys at runtime
 * (e.g., let a player remap "Dash" from Space to something else).
 */

export interface InputBindings {
  moveUp: string[];
  moveDown: string[];
  moveLeft: string[];
  moveRight: string[];
  attack: string;       // mouse button or key
  ability: string;
  dash: string;
  interact: string;
  sprint: string[];
}

export const DefaultBindings: InputBindings = {
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  attack: 'Mouse0',
  ability: 'Mouse2',
  dash: 'Space',
  interact: 'KeyE',
  sprint: ['ShiftLeft', 'ShiftRight'],
};

export class InputMapper {
  private bindings: InputBindings = { ...DefaultBindings };

  get current(): Readonly<InputBindings> {
    return this.bindings;
  }

  rebind(action: keyof InputBindings, value: string | string[]): void {
    (this.bindings[action] as string | string[]) = value;
  }
}
