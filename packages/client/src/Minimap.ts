/**
 * Rift & Raid — Minimap
 *
 * Canvas-based minimap in the top-right corner. Shows:
 *   - Map bounds (background rectangle)
 *   - Resource nodes (colored dots by type)
 *   - Structures (faction-colored squares)
 *   - Players (faction-colored dots, local player highlighted)
 *   - Bases/vaults (large faction-colored icons)
 *
 * Updated every frame from network state. Scales world coordinates to
 * minimap canvas coordinates.
 */

import { WORLD_SIZE, HARVESTING } from '@rift-and-raid/shared';

interface MinimapEntity {
  type: 'player' | 'resource' | 'structure' | 'base';
  x: number;
  z: number;
  faction?: string;
  resourceType?: string;
  isLocal?: boolean;
  alive?: boolean;
}

export class Minimap {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size = 160;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      width: ${this.size + 4}px;
      height: ${this.size + 4}px;
      background: rgba(0, 0, 0, 0.6);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 6px;
      z-index: 60;
      pointer-events: none;
      overflow: hidden;
    `;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.style.cssText = `display: block; margin: 2px;`;
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Minimap: 2d context unavailable');
    this.ctx = ctx;

    document.body.appendChild(this.container);
  }

  /** Update the minimap from the current game state. */
  update(entities: MinimapEntity[]): void {
    const ctx = this.ctx;
    const w = this.size;
    const h = this.size;

    // World bounds: x ∈ [-100, 100], z ∈ [-120, 0]
    const worldW = WORLD_SIZE.width;
    const worldD = WORLD_SIZE.depth;

    // Clear.
    ctx.fillStyle = 'rgba(20, 30, 25, 0.9)';
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines (every 25 world units).
    ctx.strokeStyle = 'rgba(80, 100, 80, 0.2)';
    ctx.lineWidth = 0.5;
    for (let wx = -100; wx <= 100; wx += 25) {
      const mx = this.worldXToMinimapX(wx, w);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, h);
      ctx.stroke();
    }
    for (let wz = -120; wz <= 0; wz += 25) {
      const my = this.worldZToMinimapZ(wz, h);
      ctx.beginPath();
      ctx.moveTo(0, my);
      ctx.lineTo(w, my);
      ctx.stroke();
    }

    // Draw entities.
    for (const ent of entities) {
      const mx = this.worldXToMinimapX(ent.x, w);
      const my = this.worldZToMinimapZ(ent.z, h);

      if (ent.type === 'resource') {
        const color = ent.resourceType === 'iron' ? '#808890'
          : ent.resourceType === 'emberwood' ? '#8a5a30'
          : '#b080ff';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(mx, my, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (ent.type === 'structure') {
        const color = ent.faction === 'solari' ? '#e07b3a' : '#4a90e2';
        ctx.fillStyle = color;
        ctx.fillRect(mx - 2, my - 2, 4, 4);
      } else if (ent.type === 'base') {
        const color = ent.faction === 'solari' ? '#e07b3a' : '#4a90e2';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (ent.type === 'player') {
        if (ent.alive === false) continue;
        const color = ent.faction === 'solari' ? '#e07b3a' : '#4a90e2';
        if (ent.isLocal) {
          // Local player: green ring + filled dot.
          ctx.fillStyle = '#3ee07a';
          ctx.beginPath();
          ctx.arc(mx, my, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(mx, my, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw border.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  private worldXToMinimapX(wx: number, mw: number): number {
    // world x: [-worldW/2, worldW/2] → minimap [0, mw]
    return ((wx + WORLD_SIZE.width / 2) / WORLD_SIZE.width) * mw;
  }

  private worldZToMinimapZ(wz: number, mh: number): number {
    // world z: [-worldD, 0] → minimap [0, mh] (flipped so north is up)
    return ((wz + WORLD_SIZE.depth) / WORLD_SIZE.depth) * mh;
  }

  dispose(): void {
    this.container.remove();
  }
}
