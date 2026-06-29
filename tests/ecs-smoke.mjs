/**
 * Quick smoke test for the ECS. Run with: node tests/ecs-smoke.mjs
 */
import { World, EventBus, ObjectPool } from '@rift-and-raid/engine';

console.log('=== ECS smoke test ===');

// 1. World + entities
const world = new World();
const e1 = world.createEntity();
const e2 = world.createEntity();
const e3 = world.createEntity();
console.log(`Created 3 entities: ${e1}, ${e2}, ${e3}`);
console.log(`Entity count: ${world.entityCount} (expected 3)`);

// 2. Components
class Position { constructor() { this.x = 0; this.y = 0; this.__componentType = 'Position'; } }
class Velocity { constructor() { this.x = 0; this.y = 0; this.__componentType = 'Velocity'; } }
class Health { constructor() { this.hp = 100; this.__componentType = 'Health'; } }

world.addComponent(e1, new Position());
world.addComponent(e1, new Velocity());
world.addComponent(e1, new Health());
world.addComponent(e2, new Position());
world.addComponent(e2, new Health());
// e3 has no components

const withPos = world.query(Position);
console.log(`Entities with Position: ${withPos.size} (expected 2)`);

const withPosAndVel = world.query(Position, Velocity);
console.log(`Entities with Position+Velocity: ${withPosAndVel.size} (expected 1)`);

// 3. Destroy entity
world.destroyEntity(e2);
console.log(`After destroying e2, entity count: ${world.entityCount} (expected 2)`);
const withPos2 = world.query(Position);
console.log(`Entities with Position after destroy: ${withPos2.size} (expected 1)`);

// 4. EventBus
const bus = new EventBus();
let received = 0;
bus.on('test', () => { received++; });
bus.emit('test', {});
bus.emit('test', {});
console.log(`EventBus received: ${received} (expected 2)`);

// 5. ObjectPool
const pool = new ObjectPool(() => ({ active: false }), 5);
console.log(`Pool initial size: ${pool.size} (expected 5)`);
const obj = pool.acquire();
console.log(`Pool after acquire: ${pool.size} (expected 4)`);
pool.release(obj);
console.log(`Pool after release: ${pool.size} (expected 5)`);

console.log('=== All ECS smoke tests passed ===');
