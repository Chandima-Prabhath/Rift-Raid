/**
 * Rift & Raid — ContentRegistry
 *
 * The heart of the data-driven content pipeline. Loads JSON config files
 * (weapons, abilities, structures, monsters, items, maps) at startup,
 * validates them against schemas, and indexes them by id for O(1) lookup.
 *
 * Adding new content to the game = adding a JSON file in packages/game/content.
 * No code changes. No recompilation. This is the "fresh for years" promise
 * from the GDD.
 *
 * Phase 0 implementation: synchronous validation, single-file registry per type.
 * Phase 1 will add hot-reload in dev mode.
 */

import type {
  WeaponConfig,
  AbilityConfig,
  StructureConfig,
  MonsterConfig,
} from '@rift-and-raid/shared';

// ============================================================================
// Registry per content type
// ============================================================================

export class TypedRegistry<T extends { id: string; version: number }> {
  private items = new Map<string, T>();

  register(item: T): void {
    if (this.items.has(item.id)) {
      throw new ContentValidationError(
        `Duplicate id "${item.id}" — already registered`
      );
    }
    this.items.set(item.id, item);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  require(id: string): T {
    const item = this.items.get(id);
    if (!item) {
      throw new ContentValidationError(`Unknown content id: "${id}"`);
    }
    return item;
  }

  all(): T[] {
    return [...this.items.values()];
  }

  get count(): number {
    return this.items.size;
  }
}

// ============================================================================
// Validation helpers
// ============================================================================

export class ContentValidationError extends Error {
  constructor(message: string, public readonly configPath?: string) {
    super(message);
    this.name = 'ContentValidationError';
  }
}

function assert(condition: unknown, message: string, path?: string): asserts condition {
  if (!condition) {
    throw new ContentValidationError(message, path);
  }
}

function assertNumber(value: unknown, field: string, path: string, min?: number, max?: number): void {
  assert(typeof value === 'number' && !Number.isNaN(value), `${field} must be a number`, path);
  if (min !== undefined) assert((value as number) >= min, `${field} must be >= ${min} (got ${value})`, path);
  if (max !== undefined) assert((value as number) <= max, `${field} must be <= ${max} (got ${value})`, path);
}

function assertString(value: unknown, field: string, path: string): void {
  assert(typeof value === 'string' && value.length > 0, `${field} must be a non-empty string`, path);
}

function assertEnum<T extends string>(value: unknown, field: string, allowed: T[], path: string): asserts value is T {
  assert(typeof value === 'string' && (allowed as string[]).includes(value), `${field} must be one of ${allowed.join('|')} (got "${value}")`, path);
}

// ============================================================================
// Per-type validators
// ============================================================================

export function validateWeapon(raw: unknown, path: string): WeaponConfig {
  const c = raw as Partial<WeaponConfig>;
  assertString(c.id, 'weapon.id', path);
  assertString(c.name, 'weapon.name', path);
  assertEnum(c.class, 'weapon.class', ['warrior', 'ranger', 'mage'], path);
  assertEnum(c.type, 'weapon.type', ['melee', 'ranged'], path);
  assertNumber(c.damage, 'weapon.damage', path, 1, 1000);
  assertNumber(c.cooldownMs, 'weapon.cooldownMs', path, 50, 10000);
  assertNumber(c.range, 'weapon.range', path, 0.5, 100);
  assert(c.cost && typeof c.cost === 'object', 'weapon.cost must be an object', path);
  assertString(c.model, 'weapon.model', path);
  assertString(c.icon, 'weapon.icon', path);
  assertNumber(c.version, 'weapon.version', path, 1);
  return c as WeaponConfig;
}

export function validateAbility(raw: unknown, path: string): AbilityConfig {
  const c = raw as Partial<AbilityConfig>;
  assertString(c.id, 'ability.id', path);
  assertString(c.name, 'ability.name', path);
  assertEnum(c.class, 'ability.class', ['warrior', 'ranger', 'mage'], path);
  assertString(c.description, 'ability.description', path);
  assertNumber(c.cooldownMs, 'ability.cooldownMs', path, 1000, 60000);
  assertEnum(c.unlock, 'ability.unlock', ['default', 'matches_5', 'raids_won_3'], path);
  assert(c.effect && typeof c.effect === 'object', 'ability.effect must be an object', path);
  assertEnum(c.effect.type, 'ability.effect.type',
    ['dash', 'aoe_damage', 'aoe_slow', 'projectile_burst', 'teleport', 'delayed_aoe'], path);
  assertNumber(c.version, 'ability.version', path, 1);
  return c as AbilityConfig;
}

export function validateStructure(raw: unknown, path: string): StructureConfig {
  const c = raw as Partial<StructureConfig>;
  assertString(c.id, 'structure.id', path);
  assertString(c.name, 'structure.name', path);
  assertEnum(c.category, 'structure.category', ['core', 'placeable'], path);
  assertNumber(c.maxLevel, 'structure.maxLevel', path, 1, 5);
  assertNumber(c.baseHp, 'structure.baseHp', path, 1, 10000);
  assertNumber(c.constructionMs, 'structure.constructionMs', path, 0, 3600000);
  assert(c.effects && typeof c.effects === 'object', 'structure.effects must be an object', path);
  assert(c.upgradeCost && typeof c.upgradeCost === 'object', 'structure.upgradeCost must be an object', path);
  assertString(c.model, 'structure.model', path);
  assertString(c.icon, 'structure.icon', path);
  assertNumber(c.version, 'structure.version', path, 1);
  return c as StructureConfig;
}

export function validateMonster(raw: unknown, path: string): MonsterConfig {
  const c = raw as Partial<MonsterConfig>;
  assertString(c.id, 'monster.id', path);
  assertString(c.name, 'monster.name', path);
  assertEnum(c.tier, 'monster.tier', ['minor', 'major', 'elite', 'boss'], path);
  assertNumber(c.hp, 'monster.hp', path, 1, 100000);
  assertNumber(c.damage, 'monster.damage', path, 0, 1000);
  assertNumber(c.speed, 'monster.speed', path, 0, 20);
  assertEnum(c.behavior, 'monster.behavior',
    ['melee_swarm', 'ranged_kiter', 'charger', 'burrower', 'boss_multiphase'], path);
  assert(c.drops && typeof c.drops === 'object', 'monster.drops must be an object', path);
  assertString(c.model, 'monster.model', path);
  assertNumber(c.version, 'monster.version', path, 1);
  return c as MonsterConfig;
}

// ============================================================================
// Top-level ContentRegistry
// ============================================================================

export class ContentRegistry {
  readonly weapons = new TypedRegistry<WeaponConfig>();
  readonly abilities = new TypedRegistry<AbilityConfig>();
  readonly structures = new TypedRegistry<StructureConfig>();
  readonly monsters = new TypedRegistry<MonsterConfig>();
  // items, maps added in Phase 4+

  private loaded = false;

  /**
   * Register a weapon config (already-loaded object). Validates before storing.
   * Throws ContentValidationError on invalid config.
   */
  registerWeapon(raw: unknown, path = '<inline>'): void {
    this.weapons.register(validateWeapon(raw, path));
  }

  registerAbility(raw: unknown, path = '<inline>'): void {
    this.abilities.register(validateAbility(raw, path));
  }

  registerStructure(raw: unknown, path = '<inline>'): void {
    this.structures.register(validateStructure(raw, path));
  }

  registerMonster(raw: unknown, path = '<inline>'): void {
    this.monsters.register(validateMonster(raw, path));
  }

  /**
   * Bulk-load all configs from a directory-like structure.
   * Phase 0 uses static imports for simplicity. Phase 1 will use Vite's
   * import.meta.glob for hot-reload.
   */
  loadAll(configs: {
    weapons?: Array<{ raw: unknown; path: string }>;
    abilities?: Array<{ raw: unknown; path: string }>;
    structures?: Array<{ raw: unknown; path: string }>;
    monsters?: Array<{ raw: unknown; path: string }>;
  }): void {
    if (this.loaded) {
      throw new Error('ContentRegistry already loaded');
    }
    for (const { raw, path } of configs.weapons ?? []) this.registerWeapon(raw, path);
    for (const { raw, path } of configs.abilities ?? []) this.registerAbility(raw, path);
    for (const { raw, path } of configs.structures ?? []) this.registerStructure(raw, path);
    for (const { raw, path } of configs.monsters ?? []) this.registerMonster(raw, path);
    this.loaded = true;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Summary for logging on boot. */
  summary(): string {
    return [
      `Content registry loaded:`,
      `  weapons:    ${this.weapons.count}`,
      `  abilities:  ${this.abilities.count}`,
      `  structures: ${this.structures.count}`,
      `  monsters:   ${this.monsters.count}`,
    ].join('\n');
  }
}
