/**
 * Rift & Raid — NameTagSystem
 *
 * Renders a billboarded name tag above each player, showing:
 *   - Player name (colored by relationship to local player)
 *   - HP bar (background + fill)
 *
 * Color coding (per user spec):
 *   - Self:    green  (#3ee07a)
 *   - Ally:    blue   (#4a90e2)
 *   - Enemy:   red    (#e04a4a)
 *
 * Implementation:
 *   - Uses THREE.Sprite for the billboard (always faces camera).
 *   - Draws name + HP bar to an offscreen canvas, uploads as CanvasTexture.
 *   - Redraws when HP or name changes (dirty flag) — not every frame.
 *
 * Position: the sprite is added as a child of the player's mesh group,
 * positioned at y = 2.4 (above head). It auto-billboards via Sprite.
 */

import * as THREE from 'three';

export interface NameTagOwner {
  /** Player name. */
  name: string;
  /** Faction for ally/enemy check. */
  faction: 'solari' | 'lunari';
  /** Current HP (0..maxHp). */
  hp: number;
  /** Max HP. */
  maxHp: number;
  /** Is this the local player's own character? */
  isLocal: boolean;
  /** Local player's faction (for ally/enemy determination). */
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
    this.canvas.height = 96;
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
    // Scale: name tags should be ~1.5m wide, ~0.6m tall in world space.
    this.sprite.scale.set(1.5, 0.6, 1);
    this.sprite.position.set(0, 2.4, 0);
    // Render slightly above other transparent objects.
    this.sprite.renderOrder = 10;
  }

  /** Update the name tag. Redraws only if name/hp/relationship changed. */
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

    // Determine color by relationship to local player.
    const color = this.getColor(owner);

    // ── Background panel (semi-transparent black for readability) ────────
    const bgX = 8;
    const bgY = 8;
    const bgW = w - 16;
    const bgH = h - 16;
    const radius = 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    this.roundRect(ctx, bgX, bgY, bgW, bgH, radius);
    ctx.fill();

    // Thin colored border.
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    this.roundRect(ctx, bgX, bgY, bgW, bgH, radius);
    ctx.stroke();

    // ── Name (top half) ──────────────────────────────────────────────────
    ctx.fillStyle = color;
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nameY = bgY + 22;
    ctx.fillText(owner.name, w / 2, nameY);

    // ── HP bar (bottom half) ─────────────────────────────────────────────
    const barX = bgX + 12;
    const barY = bgY + 44;
    const barW = bgW - 24;
    const barH = 16;
    // Background.
    ctx.fillStyle = 'rgba(40, 0, 0, 0.85)';
    this.roundRect(ctx, barX, barY, barW, barH, 4);
    ctx.fill();
    // Fill (HP-dependent color: green > 50%, yellow > 25%, red otherwise).
    const fillColor = hpPct > 0.5 ? '#3ee07a' : hpPct > 0.25 ? '#e0d83e' : '#e04a4a';
    ctx.fillStyle = fillColor;
    const fillW = Math.max(0, barW * hpPct);
    if (fillW > 0) {
      this.roundRect(ctx, barX, barY, fillW, barH, 4);
      ctx.fill();
    }
    // HP text.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(
      `${Math.round(owner.hp)} / ${owner.maxHp}`,
      w / 2,
      barY + barH / 2 + 1
    );
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
