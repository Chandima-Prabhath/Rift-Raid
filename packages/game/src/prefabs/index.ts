/**
 * Rift & Raid — Prefabs module entry point.
 *
 * Prefabs are entity compositions — bundles of components that represent
 * common game objects (player, dummy, projectile, etc.). Adding a prefab
 * creates an entity with all the right components pre-configured.
 */

export * from './Components.js';

import type { World, Entity } from '@rift-and-raid/engine';
import {
  TransformComponent,
  VelocityComponent,
  HealthComponent,
  FactionComponent,
} from '@rift-and-raid/engine';
import type { CharacterClass, Faction } from '@rift-and-raid/shared';
import { CLASS_STATS } from '@rift-and-raid/shared';
import {
  PlayerComponent,
  CombatTargetComponent,
  DummyComponent,
  ProjectileComponent,
  HealthBarComponent,
} from './Components.js';

/**
 * Create a player entity with all default components.
 * Returns the entity ID.
 */
export function createPlayer(
  world: World,
  opts: {
    class: CharacterClass;
    faction: Faction;
    position: { x: number; y: number; z: number };
    weaponId?: string;
  }
): Entity {
  const entity = world.createEntity();
  const transform = world.addComponent(entity, new TransformComponent());
  transform.x = opts.position.x;
  transform.y = opts.position.y;
  transform.z = opts.position.z;
  transform.rotation = 0;

  world.addComponent(entity, new VelocityComponent());

  const health = world.addComponent(entity, new HealthComponent());
  const stats = CLASS_STATS[opts.class];
  health.max = stats.hp;
  health.current = stats.hp;

  const faction = world.addComponent(entity, new FactionComponent());
  faction.faction = opts.faction;

  const player = world.addComponent(entity, new PlayerComponent());
  player.characterClass = opts.class;
  player.faction = opts.faction;
  player.weaponId = opts.weaponId ?? defaultWeaponForClass(opts.class);
  player.spawnProtectionMs = 0;

  const combat = world.addComponent(entity, new CombatTargetComponent());
  combat.attackable = true;
  combat.faction = opts.faction;

  world.addComponent(entity, new HealthBarComponent()).targetEntity = entity;

  return entity;
}

/**
 * Create a training dummy at a position. Has HP, respawns after death.
 */
export function createDummy(
  world: World,
  opts: { position: { x: number; y: number; z: number }; hp?: number }
): Entity {
  const entity = world.createEntity();
  const transform = world.addComponent(entity, new TransformComponent());
  transform.x = opts.position.x;
  transform.y = opts.position.y;
  transform.z = opts.position.z;
  transform.rotation = 0;

  const health = world.addComponent(entity, new HealthComponent());
  const maxHp = opts.hp ?? 100;
  health.max = maxHp;
  health.current = maxHp;

  const dummy = world.addComponent(entity, new DummyComponent());
  dummy.spawnPosition = { ...opts.position };
  dummy.respawnAfterMs = 3000;
  dummy.maxHp = maxHp;
  dummy.dead = false;

  const combat = world.addComponent(entity, new CombatTargetComponent());
  combat.attackable = true;
  combat.faction = 'neutral';

  world.addComponent(entity, new HealthBarComponent()).targetEntity = entity;

  return entity;
}

function defaultWeaponForClass(c: CharacterClass): string {
  switch (c) {
    case 'warrior': return 'sword_iron';
    case 'ranger':  return 'shortbow';
    case 'mage':    return 'fire_staff';
  }
}
