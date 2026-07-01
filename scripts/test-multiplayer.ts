/**
 * Multiplayer state-sync test.
 *
 * Connects TWO clients (A and B) to the running server.
 * Client A sends 'move' messages to walk in +X direction.
 * Client B listens for state changes on A's PlayerState.
 *
 * Pass criteria: Client B observes Client A's x position increase over time.
 *
 * Usage: bun scripts/test-multiplayer.ts
 */

import { Client } from 'colyseus.js';

const SERVER_URL = 'ws://127.0.0.1:2567';

interface PlayerLike {
  name: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  faction: string;
  characterClass: string;
  sequence: number;
  onChange(cb: () => void): () => void;
}

interface RoomState {
  players: {
    onAdd(cb: (player: PlayerLike, sessionId: string) => void, immediate?: boolean): () => void;
    onRemove(cb: (player: PlayerLike, sessionId: string) => void): void;
    get(sessionId: string): PlayerLike | undefined;
    forEach(cb: (player: PlayerLike, sessionId: string) => void): void;
    size: number;
  };
  projectiles: { size: number };
  tick: number;
}

async function connectClient(label: string): Promise<{ client: Client; room: any }> {
  const client = new Client(SERVER_URL);
  const room = await client.joinOrCreate<RoomState>('rift-raid');
  console.log(`[${label}] Connected. sessionId=${room.sessionId}`);
  return { client, room };
}

async function main() {
  console.log('=== Multiplayer State-Sync Test ===\n');

  // Connect A first.
  const A = await connectClient('A');
  await new Promise((r) => setTimeout(r, 200));

  // Connect B.
  const B = await connectClient('B');
  await new Promise((r) => setTimeout(r, 300));

  // Sanity check: both should see 2 players.
  console.log(`[A] sees ${A.room.state.players.size} players`);
  console.log(`[B] sees ${B.room.state.players.size} players`);

  if (A.room.state.players.size !== 2 || B.room.state.players.size !== 2) {
    console.error('FAIL: Both clients should see 2 players');
    process.exit(1);
  }

  // Print all players visible to each.
  console.log('\n--- Players visible to A ---');
  A.room.state.players.forEach((p, sid) => {
    const tag = sid === A.room.sessionId ? '[LOCAL]' : '[REMOTE]';
    console.log(`  ${tag} ${p.name} sid=${sid.slice(0, 8)} faction=${p.faction} pos=(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  });

  console.log('\n--- Players visible to B ---');
  B.room.state.players.forEach((p, sid) => {
    const tag = sid === B.room.sessionId ? '[LOCAL]' : '[REMOTE]';
    console.log(`  ${tag} ${p.name} sid=${sid.slice(0, 8)} faction=${p.faction} pos=(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  });

  // Find A's sessionId and player state from B's perspective.
  const aSessionId = A.room.sessionId;
  const bSessionId = B.room.sessionId;

  // From B's perspective, get a reference to A's player state.
  const playerA_fromB = B.room.state.players.get(aSessionId);
  if (!playerA_fromB) {
    console.error('FAIL: B cannot find A in player state');
    process.exit(1);
  }

  console.log(`\n[B] observing A: name=${playerA_fromB.name} pos=(${playerA_fromB.x.toFixed(2)}, ${playerA_fromB.z.toFixed(2)})`);

  // Track change events on A's player state from B's perspective.
  let changeCount = 0;
  let lastObservedX = playerA_fromB.x;
  let lastObservedZ = playerA_fromB.z;
  playerA_fromB.onChange(() => {
    changeCount++;
    lastObservedX = playerA_fromB.x;
    lastObservedZ = playerA_fromB.z;
  });

  // Now: A sends 'move' messages to walk in +X direction (moveX=+1, moveZ=0).
  // We send repeatedly for 1.5 seconds.
  console.log('\n--- A sending moveX=+1, moveZ=0 for 1.5s ---');
  const moveStart = Date.now();
  const moveDuration = 1500;
  let seq = 0;
  while (Date.now() - moveStart < moveDuration) {
    seq++;
    A.room.send('move', {
      sequence: seq,
      moveX: 1,
      moveZ: 0,
      aimX: 0,
      aimZ: 0,
      sprint: false,
    });
    await new Promise((r) => setTimeout(r, 50)); // 20Hz
  }

  // Wait a bit for the final patch to propagate.
  await new Promise((r) => setTimeout(r, 300));

  console.log('\n--- Results ---');
  console.log(`A sent ${seq} 'move' messages`);
  console.log(`B received ${changeCount} onChange events on A's PlayerState`);
  console.log(`A's x: initial=${playerA_fromB.x - (lastObservedX - playerA_fromB.x)} → final=${lastObservedX.toFixed(2)}`);
  console.log(`A's z: ${lastObservedZ.toFixed(2)}`);

  // From A's own perspective, get its current x/z.
  const playerA_fromA = A.room.state.players.get(aSessionId);
  console.log(`A sees itself at x=${playerA_fromA?.x.toFixed(2)}, z=${playerA_fromA?.z.toFixed(2)}`);

  // Pass criteria: B should have observed A's x changing.
  if (changeCount === 0) {
    console.error('\nFAIL: B received ZERO onChange events from A\'s movement');
    console.error('  → State sync is BROKEN. Server is not propagating A\'s state changes to B.');
  } else if (lastObservedX === playerA_fromB.x) {
    console.error('\nFAIL: B received onChange events but A\'s x did not change');
    console.error('  → onChange fires but x value is the same. Possible schema encoding issue.');
  } else {
    console.log(`\nPASS: B observed A moving. A.x changed from spawn by ${(lastObservedX - (-80)).toFixed(2)} units`);
    console.log(`  (solari spawn x=-80, so final x should be > -80 if moveX=+1 worked)`);
  }

  // Also: what does the server log say happened?
  console.log('\n--- Final state ---');
  console.log('Server-side (from A\'s perspective):');
  A.room.state.players.forEach((p, sid) => {
    console.log(`  ${p.name} sid=${sid.slice(0, 8)} pos=(${p.x.toFixed(2)}, ${p.z.toFixed(2)}) alive=${p.alive}`);
  });

  console.log('\n--- Disconnecting ---');
  A.room.leave();
  B.room.leave();
  await new Promise((r) => setTimeout(r, 200));
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
