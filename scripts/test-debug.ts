/**
 * Debug test: trace exactly what each client receives from the server.
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

  const clientA = new Client('ws://localhost:2567');
  const roomA = await clientA.joinOrCreate('rift-raid');
  console.log(`[A] Connected. sessionId=${roomA.sessionId}`);

  // Listen for ALL state changes.
  let stateChangeCount = 0;
  roomA.onStateChange((state: any) => {
    stateChangeCount++;
    console.log(`[A] onStateChange #${stateChangeCount}: tick=${state.tick} players=${state.players?.size} projectiles=${state.projectiles?.size}`);
  });

  // Listen for any message.
  roomA.onMessage('*', (type: string, message: any) => {
    console.log(`[A] message '${type}':`, message);
  });

  // Check after various delays.
  await new Promise((r) => setTimeout(r, 100));
  console.log(`[A] After 100ms: stateChangeCount=${stateChangeCount}, players=${roomA.state.players?.size ?? 'undefined'}`);

  await new Promise((r) => setTimeout(r, 500));
  console.log(`[A] After 600ms: stateChangeCount=${stateChangeCount}, players=${roomA.state.players?.size ?? 'undefined'}`);

  await new Promise((r) => setTimeout(r, 1000));
  console.log(`[A] After 1600ms: stateChangeCount=${stateChangeCount}, players=${roomA.state.players?.size ?? 'undefined'}`);

  // Try iterating players.
  console.log('\n[A] Trying to iterate players:');
  try {
    if (roomA.state.players) {
      roomA.state.players.forEach((p: any, sid: string) => {
        console.log(`  - ${p.name} sid=${sid.slice(0, 8)} pos=(${p.x}, ${p.z})`);
      });
    } else {
      console.log('  roomA.state.players is undefined');
    }
  } catch (e: any) {
    console.log(`  Error iterating: ${e.message}`);
  }

  // Print the raw state.
  console.log('\n[A] Raw state.toJSON():');
  try {
    console.log(JSON.stringify(roomA.state.toJSON?.() ?? 'no toJSON', null, 2));
  } catch (e: any) {
    console.log(`  Error: ${e.message}`);
  }

  console.log('\n[A] roomA.state keys:', Object.keys(roomA.state));

  console.log('\n=== Disconnecting ===');
  roomA.leave();
  await new Promise((r) => setTimeout(r, 200));
  httpServer.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
