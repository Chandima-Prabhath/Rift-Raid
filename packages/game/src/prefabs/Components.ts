/**
 * Rift & Raid — Game-specific components
 *
 * These extend the engine's base components with game-specific data.
 * Components are PURE DATA — no methods, no behavior. Systems operate
 * on components; components just hold state.
 *
 * Phase 1 components cover:
 *   - Player (class, faction, role, inventory)
 *   - Combat (weapon, ability, cooldowns, attack state)
 *   - Dummy (training target that respawns)
 *   - Projectile (in-flight ranged attack)
 *   - DamageNumber (floating damage text)
 *   - HealthBar (visual reference for in-world HP bar)
 */

import type { Component } from '@rift-and-raid/engine';
import type {
  CharacterClass,
  Faction,
  PlayerRole,
  ResourceType,
} from '@rift-and-raid/shared';

// ============================================================================
// Player
// ============================================================================

export class PlayerComponent implements Component {
  readonly __componentType = 'Player';
  playerId = ''; // unique per account (Phase 2+)
  characterClass: CharacterClass = 'warrior';
  faction: Faction = 'solari';
  role: PlayerRole = 'member';
  // Personal resource inventory (Phase 4 will use this for real).
  inventory: Record<ResourceType, number> = { iron: 0, emberwood: 0, godshard: 0 };
  // Loadout
  weaponId = 'sword_iron';
  abilityId: string | null = null;
  // Cooldowns (timestamps when ready again).
  lastAttackAt = 0;
  lastAbilityAt = 0;
  lastDashAt = 0;
  // Visual state for animation feedback.
  attackAnimationEndsAt = 0;
  // Spawn protection (ms remaining).
  spawnProtectionMs = 0;
}

// ============================================================================
// Combat target tags
// ============================================================================

export class CombatTargetComponent implements Component {
  readonly __componentType = 'CombatTarget';
  /** Is this entity currently attackable? (false during respawn invuln, etc.) */
  attackable = true;
  /** Faction for friendly-fire checks. */
  faction: Faction | 'neutral' = 'neutral';
}

// ============================================================================
// Training Dummy
// ============================================================================

export class DummyComponent implements Component {
  readonly __componentType = 'Dummy';
  spawnPosition = { x: 0, y: 0, z: 0 };
  respawnAfterMs = 3000;
  dead = false;
  diedAt = 0;
  /** Original max HP to restore on respawn. */
  maxHp = 100;
}

// ============================================================================
// Projectile (ranged attack in flight)
// ============================================================================

export class ProjectileComponent implements Component {
  readonly __componentType = 'Projectile';
  /** Damage on hit. */
  damage = 10;
  /** Speed in m/s. */
  speed = 25;
  /** Direction (normalized). */
  directionX = 0;
  directionY = 0;
  directionZ = 1;
  /** Lifetime in ms — auto-destroyed after this. */
  lifetimeMs = 2000;
  /** Age in ms. */
  ageMs = 0;
  /** Owner entity (to prevent self-hit and for kill credit). */
  ownerEntity = 0;
  /** Owner faction for friendly-fire checks. */
  ownerFaction: Faction | 'neutral' = 'neutral';
  /** Visual: projectile color (Phase 0 primitive). */
  color = 0xffff00;
  /** Visual: projectile radius for collision. */
  radius = 0.3;
  /** Whether this projectile pierces (continues through hits). */
  pierce = false;
  /** Track entities already hit (for pierce). */
  hitEntities: number[] = [];
}

// ============================================================================
// Damage Number (floating text on hit)
// ============================================================================

export class DamageNumberComponent implements Component {
  readonly __componentType = 'DamageNumber';
  amount = 0;
  /** World position where damage was dealt. */
  x = 0;
  y = 0;
  z = 0;
  /** Age in ms. */
  ageMs = 0;
  /** Lifetime in ms. */
  lifetimeMs = 800;
  /** Was this a crit? (Different color.) */
  crit = false;
  /** Vertical drift speed (m/s). */
  driftSpeed = 2;
  /** DOM element reference (HTML overlay). */
  element: HTMLDivElement | null = null;
}

// ============================================================================
// Health Bar (in-world HP indicator)
// ============================================================================

export class HealthBarComponent implements Component {
  readonly __componentType = 'HealthBar';
  /** Entity this bar belongs to. */
  targetEntity = 0;
  /** Vertical offset above the entity. */
  heightOffset = 2.2;
  /** Width of the bar in world units. */
  width = 1.2;
  /** THREE.Object3D references (created by renderer). */
  backgroundMesh: unknown = null;
  fillMesh: unknown = null;
}

// ============================================================================
// Hit Flash (visual feedback when entity takes damage)
// ============================================================================

export class HitFlashComponent implements Component {
  readonly __componentType = 'HitFlash';
  /** Time when flash ends (ms since epoch). */
  endsAt = 0;
  /** Original material color before flash. */
  originalColor = 0xffffff;
}
