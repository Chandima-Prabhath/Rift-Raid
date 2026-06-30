/**
 * Rift & Raid — NameTag
 *
 * Billboarded name + HP bar above each player. Uses THREE.Sprite with a
 * CanvasTexture. Redrawn only when state changes (name/hp/relationship).
 *
 * Color coding:
 *   - Self:    green  (#3ee07a)
 *   - Ally:    blue   (#4a90e2)
 *   - Enemy:   red    (#e04a4a)
 *
 * Layout (canvas 256×64):
 *   ┌──────────────────────────┐
 *   │       Player Name        │  ← colored text, 20px bold
 *   │  ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░    │  ← HP bar (relationship color)
 *   └──────────────────────────┘
 *
 * The HP bar is thin (8px) and sits below the name. Background is
 * semi-transparent dark. No border on the banner itself — cleaner look.
 */

import * as THREE from 'three';

export interface NameTagOwner {
  name: string;
  faction: 'solari' | 'lunari';
  hp: number;
  maxHp: number;
  isLocal: boolean;
  localFaction: 'solari' | 'lunari';
}

export class NameTag {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private lastHash = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 64;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('NameTag: 2d context unavailable');
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(material);
    // Banner is ~1.6m wide, ~0.4m tall in world space.
    this.sprite.scale.set(1.6, 0.4, 1);
    // Position above the character's head (model is 1.8m tall).
    this.sprite.position.set(0, 2.2, 0);
    this.sprite.renderOrder = 10;
  }

  /** Update the name tag. Redraws only if state changed. */
  update(owner: NameTagOwner): void {
    const hpPct = owner.maxHp > 0 ? Math.max(0, Math.min(1, owner.hp / owner.maxHp)) : 0;
    const hash = `${owner.name}|${owner.faction}|${Math.round(hpPct * 100)}|${owner.isLocal}`;
    if (hash === this.lastHash) return;
    this.lastHash = hash;
    this.draw(owner, hpPct);
    this.texture.needsUpdate = true;
  }

  private draw(owner: NameTagOwner, hpPct: number): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const color = this.getColor(owner);

    // ── Background panel ─────────────────────────────────────────────────
    const bgX = 4;
    const bgY = 4;
    const bgW = w - 8;
    const bgH = h - 8;
    const radius = 6;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.roundRect(ctx, bgX, bgY, bgW, bgH, radius);
    ctx.fill();

    // ── Name (top portion) ───────────────────────────────────────────────
    ctx.fillStyle = color;
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(owner.name, w / 2, bgY + 18);

    // ── HP bar (bottom portion) ──────────────────────────────────────────
    const barX = bgX + 10;
    const barY = bgY + 34;
    const barW = bgW - 20;
    const barH = 8;
    // Track (background).
    ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
    this.roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.fill();
    // Fill (relationship color).
    ctx.fillStyle = color;
    const fillW = Math.max(0, barW * hpPct);
    if (fillW > 0) {
      this.roundRect(ctx, barX, barY, fillW, barH, 3);
      ctx.fill();
    }
  }

  private getColor(owner: NameTagOwner): string {
    if (owner.isLocal) return '#3ee07a'; // green for self
    if (owner.faction === owner.localFaction) return '#4a90e2'; // blue for ally
    return '#e04a4a'; // red for enemy
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  dispose(): void {
    this.texture.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}
