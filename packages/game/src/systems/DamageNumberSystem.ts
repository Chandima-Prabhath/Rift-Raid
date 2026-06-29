/**
 * Rift & Raid — DamageNumberSystem
 *
 * Renders floating damage numbers as HTML overlays. Each damage event
 * spawns a DamageNumberComponent; this system:
 *   - Creates a DOM element on first update
 *   - Updates its position each frame (world→screen projection)
 *   - Fades it out over its lifetime
 *   - Removes the element and destroys the entity when expired
 *
 * Why HTML over Three.js sprites:
 *   - Text rendering is crisp at any zoom level
 *   - No texture atlas needed
 *   - Easy to style (font, color, shadow) via CSS
 *   - Cheap to update (1 transform per frame per number)
 */

import type { World, System } from '@rift-and-raid/engine';
import type * as THREE from 'three';
import { DamageNumberComponent } from '../prefabs/Components.js';

export interface DamageNumberSystemCallbacks {
  /** Project a world position to screen pixel coordinates. */
  worldToScreen: (x: number, y: number, z: number) => { x: number; y: number; visible: boolean } | null;
}

export class DamageNumberSystem implements System {
  readonly id = 'DamageNumberSystem';
  private callbacks: DamageNumberSystemCallbacks;
  private container: HTMLDivElement;

  constructor(callbacks: DamageNumberSystemCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      z-index: 80;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-weight: 900;
      text-shadow: 0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1);
    `;
    document.body.appendChild(this.container);
  }

  init(_world: World): void {}

  update(world: World, dt: number): void {
    const numbers = world.query(DamageNumberComponent);
    const toDestroy: number[] = [];

    for (const entity of numbers) {
      const dn = world.getComponent(entity, DamageNumberComponent);
      if (!dn) continue;

      // Create DOM element on first frame.
      if (!dn.element) {
        const el = document.createElement('div');
        el.textContent = dn.crit ? `${dn.amount}!` : `${dn.amount}`;
        el.style.cssText = `
          position: absolute;
          font-size: ${dn.crit ? '28px' : '20px'};
          color: ${dn.crit ? '#ffe060' : '#ffffff'};
          transform: translate(-50%, -50%);
          will-change: transform, opacity;
          user-select: none;
        `;
        this.container.appendChild(el);
        dn.element = el;
      }

      // Age.
      dn.ageMs += dt * 1000;
      if (dn.ageMs >= dn.lifetimeMs) {
        toDestroy.push(entity);
        dn.element.remove();
        continue;
      }

      // Drift upward.
      dn.y += dn.driftSpeed * dt;

      // Project to screen.
      const screen = this.callbacks.worldToScreen(dn.x, dn.y, dn.z);
      if (screen && screen.visible) {
        const fadeProgress = dn.ageMs / dn.lifetimeMs;
        const opacity = fadeProgress < 0.7 ? 1 : 1 - (fadeProgress - 0.7) / 0.3;
        dn.element.style.left = `${screen.x}px`;
        dn.element.style.top = `${screen.y}px`;
        dn.element.style.opacity = `${opacity}`;
        dn.element.style.display = 'block';
      } else {
        dn.element.style.display = 'none';
      }
    }

    for (const entity of toDestroy) {
      world.destroyEntity(entity);
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
