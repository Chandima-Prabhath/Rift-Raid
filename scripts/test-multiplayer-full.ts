/**
 * All-in-one multiplayer state-sync test (v3 API).
 *
 * Boots an in-process Colyseus server, connects TWO clients, has Client A
 * send 'move' input for 2 seconds, and verifies Client B observes the
 * position changes by polling the state (v3 doesn't expose onChange
 * directly on schema instances).
 */

import { Client } from 'colyseus.js';
import http from 'node:http';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

async function main() {
  console.log('=== Booting in-process server ===\n');

  const app = express();
  const httpServer = http.createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  const { GameRoom } = await import('../packages/server/dist/rooms/GameRoom.js');
  gameServer.define('rift-raid', GameRoom);

  await new Promise<void>((resolve) => {
    httpServer.listen(2567, () => resolve());
  });
  console.log('✓ Server listening\n');

  // Connect 2 clients.
  console.log('=== Connecting 2 clients ===\n');

  const clientA = new Client('ws://localhost:2567');
  const clientB = new Client('ws://localhost:2567');

  const roomA = await clientA.joinOrCreate('rift-raid');
  console.log(`[A] Connected. sessionId=${roomA.sessionId}`);
  await new Promise((r) => setTimeout(r, 200));

  const roomB = await clientB.joinOrCreate('rift-raid');
  console.log(`[B] Connected. sessionId=${roomB.sessionId}`);
  await new Promise((r) => setTimeout(r, 500));

  console.log(`\n[A] sees ${roomA.state.players.size} players`);
  console.log(`[B] sees ${roomB.state.players.size} players`);

  if (roomA.state.players.size === 0 || roomB.state.players.size === 0) {
    console.error('\n❌ FAIL: clients cannot see players — state sync is broken');
    process.exit(1);
  }
  console.log('✓ Initial state sync works!\n');

  // Find A's player state from B's perspective.
  const aSessionId = roomA.sessionId;
  const playerA_fromB = roomB.state.players.get(aSessionId);
  if (!playerA_fromB) {
    console.error('FAIL: B cannot find A in player state');
    process.exit(1);
  }

  const initialX = playerA_fromB.x;
  const initialZ = playerA_fromB.z;
  console.log(`[B] observing A: name=${playerA_fromB.name} pos=(${initialX.toFixed(2)}, ${initialZ.toFixed(2)})`);

  // A sends move input for 2 seconds. We poll B's view of A's position every 200ms.
  console.log('\n--- A sending moveX=+1, moveZ=0 for 2s ---');
  const moveStart = Date.now();
  const moveDuration = 2000;
  let seq = 0;
  const samples: Array<{ t: number; x: number; z: number }> = [];
  samples.push({ t: 0, x: playerA_fromB.x, z: playerA_fromB.z });

  const pollInterval = setInterval(() => {
    samples.push({
      t: Date.now() - moveStart,
      x: playerA_fromB.x,
      z: playerA_fromB.z,
    });
  }, 200);

  while (Date.now() - moveStart < moveDuration) {
    seq++;
    roomA.send('move', {
      sequence: seq,
      moveX: 1,
      moveZ: 0,
      aimX: 0,
      aimZ: 0,
      sprint: false,
    });
    await new Promise((r) => setTimeout(r, 50));
  }

  clearInterval(pollInterval);
  await new Promise((r) => setTimeout(r, 400));

  const finalX = playerA_fromB.x;
  const finalZ = playerA_fromB.z;

  console.log('\n=== Results ===');
  console.log(`A sent ${seq} 'move' messages`);
  console.log(`A's x (from B's perspective): initial=${initialX.toFixed(2)} → final=${finalX.toFixed(2)}`);
  console.log(`A's z (from B's perspective): initial=${initialZ.toFixed(2)} → final=${finalZ.toFixed(2)}`);
  console.log('\nSamples over time:');
  for (const s of samples) {
    console.log(`  t=${s.t.toString().padStart(5)}ms  x=${s.x.toFixed(2).padStart(7)}  z=${s.z.toFixed(2).padStart(7)}`);
  }

  const playerA_fromA = roomA.state.players.get(aSessionId);
  console.log(`\nA sees itself at x=${playerA_fromA?.x.toFixed(2)}, z=${playerA_fromA?.z.toFixed(2)}`);

  console.log('\n=== Verdict ===');
  if (Math.abs(finalX - initialX) < 0.1) {
    console.log("❌ FAIL: B did not observe A's position change");
    console.log('   → Patches are not being applied to the client state.');
  } else {
    console.log(`✓ PASS: B observed A moving ${Math.abs(finalX - initialX).toFixed(2)} units in x.`);
    console.log('   Multiplayer state sync is WORKING!');
  }

  // Print final state from both perspectives.
  console.log('\n=== Final state ===');
  console.log("From A's perspective:");
  roomA.state.players.forEach((p: any, sid: string) => {
    console.log(`  ${p.name} sid=${sid.slice(0, 8)} pos=(${p.x.toFixed(2)}, ${p.z.toFixed(2)}) faction=${p.faction} color=${p.color}`);
  });
  console.log("From B's perspective:");
  roomB.state.players.forEach((p: any, sid: string) => {
    console.log(`  ${p.name} sid=${sid.slice(0, 8)} pos=(${p.x.toFixed(2)}, ${p.z.toFixed(2)}) faction=${p.faction} color=${p.color}`);
  });

  console.log('\n=== Disconnecting ===');
  roomA.leave();
  roomB.leave();
  await new Promise((r) => setTimeout(r, 200));
  httpServer.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
