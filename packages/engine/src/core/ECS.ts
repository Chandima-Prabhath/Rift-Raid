/**
 * Rift & Raid — ECS (Entity-Component-System)
 *
 * The kernel of the engine. Everything in the world is an entity (just an ID).
 * Components are pure data, stored in flat typed arrays for cache locality.
 * Systems run on each tick and operate on entities matching a query.
 *
 * Design principles:
 *  - Entities are IDs only (no GameObject class)
 *  - Components are data, never behavior
 *  - Systems are pure functions of (world, dt)
 *  - Queries are cached for performance
 */

// ============================================================================
// Component type registry
// ============================================================================

/**
 * A component is a plain data object. Each component type has a unique string
 * id so we can store and query by type. Components MUST be plain data — no
 * methods, no references to entities or systems.
 */
export interface Component {
  readonly __componentType: string;
}

/**
 * Component constructor. Used to register and identify component types.
 * We use the class itself as the key (not a string), so renames are caught
 * at compile time.
 */
export type ComponentClass<T extends Component = Component> = new () => T;

// ============================================================================
// Entity
// ============================================================================

/**
 * Entity is just an integer ID. We recycle IDs of destroyed entities.
 * ID 0 is reserved as "no entity".
 */
export type Entity = number;

const NULL_ENTITY: Entity = 0;

// ============================================================================
// World — the ECS container
// ============================================================================

/**
 * The World holds all entities, components, and cached queries.
 * One World per game session (client) or per room (server).
 */
export class World {
  /** Next entity ID to allocate. */
  private nextEntityId = 1;
  /** Recycled entity IDs available for reuse. */
  private recycled: Entity[] = [];
  /** Set of all currently-alive entities. */
  private alive = new Set<Entity>();
  /** Component storage: Map<componentType, Map<entity, component>> */
  private stores = new Map<ComponentClass, Map<Entity, Component>>();
  /** Cached query results: Map<queryKey, Set<entity>> */
  private queryCache = new Map<string, Set<Entity>>();
  /** Map<queryKey, ComponentClass[]> that invalidate the cache */
  private queryRegistrations = new Map<string, ComponentClass[]>();
  /** Generation counter to invalidate caches. */
  private dirty = false;

  // --------------------------------------------------------------------------
  // Entity lifecycle
  // --------------------------------------------------------------------------

  /** Create a new entity. Returns its ID. */
  createEntity(): Entity {
    const id = this.recycled.length > 0 ? this.recycled.pop()! : this.nextEntityId++;
    this.alive.add(id);
    this.dirty = true;
    return id;
  }

  /** Destroy an entity and all its components. */
  destroyEntity(entity: Entity): void {
    if (!this.alive.has(entity)) return;
    for (const store of this.stores.values()) {
      store.delete(entity);
    }
    this.alive.delete(entity);
    this.recycled.push(entity);
    this.dirty = true;
  }

  /** Check if entity is alive. */
  isAlive(entity: Entity): boolean {
    return this.alive.has(entity);
  }

  /** Get all alive entities (as iterable). */
  entities(): Iterable<Entity> {
    return this.alive;
  }

  /** Number of alive entities. */
  get entityCount(): number {
    return this.alive.size;
  }

  // --------------------------------------------------------------------------
  // Component operations
  // --------------------------------------------------------------------------

  /** Add a component to an entity. Replaces if one already exists. */
  addComponent<T extends Component>(entity: Entity, component: T): T {
    if (!this.alive.has(entity)) {
      throw new Error(`Cannot add component to dead entity ${entity}`);
    }
    const ctor = component.constructor as ComponentClass<T>;
    let store = this.stores.get(ctor);
    if (!store) {
      store = new Map();
      this.stores.set(ctor, store);
    }
    store.set(entity, component);
    this.dirty = true;
    return component;
  }

  /** Remove a component from an entity. */
  removeComponent<T extends Component>(entity: Entity, ctor: ComponentClass<T>): void {
    const store = this.stores.get(ctor);
    if (store) {
      store.delete(entity);
      this.dirty = true;
    }
  }

  /** Get a component for an entity, or undefined. */
  getComponent<T extends Component>(entity: Entity, ctor: ComponentClass<T>): T | undefined {
    const store = this.stores.get(ctor);
    return store?.get(entity) as T | undefined;
  }

  /** Check if entity has a component. */
  hasComponent<T extends Component>(entity: Entity, ctor: ComponentClass<T>): boolean {
    const store = this.stores.get(ctor);
    return store?.has(entity) ?? false;
  }

  /** Get all entities that have ALL the given component types. */
  query(...ctors: ComponentClass[]): Set<Entity> {
    if (ctors.length === 0) {
      return new Set(this.alive);
    }
    const key = ctors.map(c => c.name).sort().join('|');
    let cached = this.queryCache.get(key);
    if (cached && !this.dirty) {
      return cached;
    }
    // Rebuild cache for this query.
    cached = new Set<Entity>();
    const stores = ctors.map(c => this.stores.get(c)).filter(Boolean) as Map<Entity, Component>[];
    if (stores.length === ctors.length) {
      // Use the smallest store as the seed for iteration.
      stores.sort((a, b) => a.size - b.size);
      const seed = stores[0];
      const others = stores.slice(1);
      for (const entity of seed.keys()) {
        if (others.every(s => s.has(entity))) {
          cached.add(entity);
        }
      }
    }
    this.queryCache.set(key, cached);
    this.queryRegistrations.set(key, ctors);
    // Note: we don't clear `dirty` here because other queries also need rebuild.
    // Instead, we clear `dirty` after all queries have been rebuilt once per tick.
    return cached;
  }

  /**
   * Called at the end of each tick to clear the dirty flag.
   * If you add/remove components mid-iteration, the next query() call will
   * rebuild affected caches.
   */
  clearDirtyFlag(): void {
    this.dirty = false;
  }
}

// ============================================================================
// System interface
// ============================================================================

/**
 * A System processes entities matching a query, once per tick.
 * Systems must be idempotent w.r.t. their query — modifying the world during
 * iteration is allowed (component add/remove marks the cache dirty and the
 * next query call rebuilds it).
 */
export interface System {
  /** Stable id for debugging. */
  readonly id: string;
  /** Called once when the system is registered. */
  init?(world: World): void;
  /** Called every fixed-timestep tick. dt is in seconds. */
  update(world: World, dt: number): void;
}

// ============================================================================
// Common components (kept here as starting primitives; game-specific
// components live in packages/game/src/prefabs)
// ============================================================================

export class TransformComponent implements Component {
  readonly __componentType = 'Transform';
  x = 0;
  y = 0;
  z = 0;
  rotation = 0; // yaw, radians
}

export class VelocityComponent implements Component {
  readonly __componentType = 'Velocity';
  x = 0;
  y = 0;
  z = 0;
}

export class HealthComponent implements Component {
  readonly __componentType = 'Health';
  current = 100;
  max = 100;
}

export class FactionComponent implements Component {
  readonly __componentType = 'Faction';
  faction: 'solari' | 'lunari' = 'solari';
}

export class TagComponent implements Component {
  readonly __componentType = 'Tag';
  tags: string[] = [];
}

export { NULL_ENTITY };
