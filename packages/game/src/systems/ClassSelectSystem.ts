/**
 * Rift & Raid — ClassSelectSystem
 *
 * Phase 1: lets the local player swap classes instantly with number keys.
 *   1 → Warrior (sword_iron)
 *   2 → Ranger  (shortbow)
 *   3 → Mage    (fire_staff, would be added to content)
 *
 * Each class gets a different starting weapon and HP per GDD §9.
 * Real loadout / ability selection UI comes in Phase 6.
 */

import type { World, System, ContentRegistry } from '@rift-and-raid/engine';
import {
  HealthComponent,
  TransformComponent,
} from '@rift-and-raid/engine';
import { CLASS_STATS, type CharacterClass } from '@rift-and-raid/shared';
import { PlayerComponent } from '../prefabs/Components.js';

const CLASS_BY_KEY: Record<string, CharacterClass> = {
  Digit1: 'warrior',
  Digit2: 'ranger',
  Digit3: 'mage',
};

const WEAPON_BY_CLASS: Record<CharacterClass, string> = {
  warrior: 'sword_iron',
  ranger: 'shortbow',
  mage: 'fire_staff',
};

const COLOR_BY_CLASS: Record<CharacterClass, number> = {
  warrior: 0xd97742, // solari orange
  ranger: 0x60a060,  // green
  mage: 0x9050c0,    // purple
};

export interface ClassSelectSystemCallbacks {
  /** Called when player swaps class (so renderer can update mesh color). */
  onClassChange: (entity: number, newClass: CharacterClass, color: number) => void;
}

export class ClassSelectSystem implements System {
  readonly id = 'ClassSelectSystem';
  private callbacks: ClassSelectSystemCallbacks;
  private content: ContentRegistry;
  private keysPressed: Set<string> = new Set();

  constructor(content: ContentRegistry, callbacks: ClassSelectSystemCallbacks) {
    this.content = content;
    this.callbacks = callbacks;

    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keysPressed.add(e.code);
  };

  init(_world: World): void {}

  update(world: World, _dt: number): void {
    if (this.keysPressed.size === 0) return;
    const keys = [...this.keysPressed];
    this.keysPressed.clear();

    const players = world.query(PlayerComponent);
    if (players.size === 0) return;
    const playerEntity = [...players][0];
    const player = world.getComponent(playerEntity, PlayerComponent);
    if (!player) return;

    for (const key of keys) {
      const newClass = CLASS_BY_KEY[key];
      if (!newClass) continue;

      const oldClass = player.characterClass;
      if (newClass === oldClass) continue;

      player.characterClass = newClass;
      player.weaponId = WEAPON_BY_CLASS[newClass];

      // Update HP max for the new class.
      const stats = CLASS_STATS[newClass];
      const health = world.getComponent(playerEntity, HealthComponent);
      if (health && stats) {
        health.max = stats.hp;
        health.current = stats.hp; // full heal on swap for Phase 1 convenience
      }

      this.callbacks.onClassChange(playerEntity, newClass, COLOR_BY_CLASS[newClass]);
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }
}
