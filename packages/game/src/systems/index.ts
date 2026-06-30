/**
 * Rift & Raid — Game systems module entry point.
 *
 * Systems are the gameplay logic that operates on the ECS each tick.
 * They live in @rift-and-raid/game (not @rift-and-raid/engine) because
 * they know about weapons, classes, factions, etc.
 *
 * The engine is game-agnostic; the systems here are Rift & Raid-specific.
 */

export { CombatSystem } from './CombatSystem.js';
export { ProjectileSystem } from './ProjectileSystem.js';
export type { ProjectileSystemCallbacks } from './ProjectileSystem.js';
export { HealthSystem } from './HealthSystem.js';
export type { HealthSystemCallbacks } from './HealthSystem.js';
export { DummySystem } from './DummySystem.js';
export type { DummySystemCallbacks } from './DummySystem.js';
export { DamageNumberSystem } from './DamageNumberSystem.js';
export type { DamageNumberSystemCallbacks } from './DamageNumberSystem.js';
export { HealthBarSystem } from './HealthBarSystem.js';
export type { HealthBarSystemCallbacks } from './HealthBarSystem.js';
export { MovementSystem } from './MovementSystem.js';
export { ClassSelectSystem } from './ClassSelectSystem.js';
export type { ClassSelectSystemCallbacks } from './ClassSelectSystem.js';
