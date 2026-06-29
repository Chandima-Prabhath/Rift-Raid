/**
 * Rift & Raid — ParticleSystem
 *
 * Placeholder for Phase 0. Real particle effects (hit sparks, harvest dust,
 * Riftspawn death poofs) come in Phase 3 with combat.
 *
 * API sketch for future implementation:
 *   spawn(position, type, options)
 *   update(dt) — advance particles
 *   render via THREE.Points
 */

export type ParticleType = 'hit_spark' | 'harvest_dust' | 'death_poof' | 'rift_glow';

export interface ParticleOptions {
  count?: number;
  lifetimeMs?: number;
  speed?: number;
  color?: number;
  size?: number;
}

export class ParticleSystem {
  // Phase 0: stub. Phase 3 will implement with THREE.Points + custom shader.
  spawn(_type: ParticleType, _position: { x: number; y: number; z: number }, _options?: ParticleOptions): void {
    // no-op for now
  }

  update(_dt: number): void {
    // no-op
  }
}
