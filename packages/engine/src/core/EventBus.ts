/**
 * Rift & Raid — EventBus
 *
 * Decoupled publish/subscribe. Used for one-shot events ("player died",
 * "structure destroyed", "raid declared") where direct system-to-system
 * calls would create unwanted coupling.
 *
 * For per-tick data flow, use components + queries (ECS). For one-shot
 * signals, use the EventBus.
 */

export type EventHandler<T = unknown> = (payload: T) => void;

export interface EventSubscription {
  unsubscribe(): void;
}

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on<T>(eventType: string, handler: EventHandler<T>): EventSubscription {
    let set = this.handlers.get(eventType);
    if (!set) {
      set = new Set();
      this.handlers.set(eventType, set);
    }
    set.add(handler as EventHandler);
    return {
      unsubscribe: () => {
        set!.delete(handler as EventHandler);
      },
    };
  }

  once<T>(eventType: string, handler: EventHandler<T>): EventSubscription {
    const sub = this.on<T>(eventType, (payload) => {
      sub.unsubscribe();
      handler(payload);
    });
    return sub;
  }

  emit<T>(eventType: string, payload: T): void {
    const set = this.handlers.get(eventType);
    if (!set) return;
    // Copy to a list so handlers can unsubscribe during iteration.
    for (const handler of [...set]) {
      try {
        (handler as EventHandler<T>)(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${eventType}" threw:`, err);
      }
    }
  }

  /** Remove all handlers for an event type, or all handlers if no type given. */
  clear(eventType?: string): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }
}

// ============================================================================
// Well-known event names (kept here to avoid magic strings across the codebase)
// ============================================================================

export const Events = {
  PLAYER_DIED: 'player:died',
  PLAYER_SPAWNED: 'player:spawned',
  STRUCTURE_DESTROYED: 'structure:destroyed',
  STRUCTURE_BUILT: 'structure:built',
  RESOURCE_HARVESTED: 'resource:harvested',
  RESOURCE_DEPOSITED: 'resource:deposited',
  ITEM_PURCHASED: 'item:purchased',
  RAID_DECLARED: 'raid:declared',
  RAID_ENDED: 'raid:ended',
  LEADER_ELECTED: 'leader:elected',
  MONSTER_KILLED: 'monster:killed',
  BOSS_SPAWNED: 'boss:spawned',
  BOSS_KILLED: 'boss:killed',
  MATCH_WIN: 'match:win',
  WORLD_TICK: 'world:tick',
  WORLD_SAVED: 'world:saved',
  WORLD_LOADED: 'world:loaded',
  OFFLINE_SIMULATION_COMPLETE: 'offline:sim:complete',
} as const;

export type EventName = (typeof Events)[keyof typeof Events];
