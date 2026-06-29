/**
 * Rift & Raid — ObjectPool
 *
 * Reuse objects to avoid GC pressure. Especially important for projectiles,
 * particles, and short-lived entities that allocate hundreds per second.
 *
 * Usage:
 *   const pool = new ObjectPool(() => ({ active: false, x: 0, y: 0 }), 100);
 *   const obj = pool.acquire();
 *   obj.active = true;
 *   // ... use it ...
 *   obj.active = false;
 *   pool.release(obj);
 */

export class ObjectPool<T> {
  private free: T[] = [];
  private factory: () => T;
  private resetFn?: (obj: T) => void;

  constructor(factory: () => T, initialSize = 0, resetFn?: (obj: T) => void) {
    this.factory = factory;
    this.resetFn = resetFn;
    for (let i = 0; i < initialSize; i++) {
      this.free.push(factory());
    }
  }

  acquire(): T {
    const obj = this.free.pop() ?? this.factory();
    if (this.resetFn) this.resetFn(obj);
    return obj;
  }

  release(obj: T): void {
    this.free.push(obj);
  }

  get size(): number {
    return this.free.length;
  }

  /** Pre-warm the pool with N more objects. */
  prewarm(n: number): void {
    for (let i = 0; i < n; i++) this.free.push(this.factory());
  }
}
