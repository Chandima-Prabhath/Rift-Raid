/**
 * Comprehensive multiplayer test — verifies colors, models, inventory isolation.
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

  // Connect 2 clients with DIFFERENT names and models.
  const clientA = new Client('ws://localhost:2567');
  const clientB = new Client('ws://localhost:2567');

  const roomA = await clientA.joinOrCreate('rift-raid', {
    name: 'Alice',
    characterClass: 'warrior',
    characterModel: 'character-female-a',
  });
  console.log(`[A] Alice joined. sessionId=${roomA.sessionId}`);
  await new Promise((r) => setTimeout(r, 200));

  const roomB = await clientB.joinOrCreate('rift-raid', {
    name: 'Bob',
    characterClass: 'ranger',
    characterModel: 'character-male-c',
  });
  console.log(`[B] Bob joined. sessionId=${roomB.sessionId}`);
  await new Promise((r) => setTimeout(r, 500));

  console.log(`\n[A] sees ${roomA.state.players.size} players`);
  console.log(`[B] sees ${roomB.state.players.size} players`);

  // Print all players from both perspectives.
  console.log('\n=== From A\'s perspective ===');
  roomA.state.players.forEach((p: any, sid: string) => {
    const isLocal = sid === roomA.sessionId;
    console.log(
      `  ${isLocal ? '[LOCAL]' : '[REMOTE]'} ${p.name} faction=${p.faction} ` +
      `class=${p.characterClass} model=${p.characterModel} color=0x${p.color.toString(16)} ` +
      `hp=${p.hp}/${p.maxHp} inv=(iron=${p.invIron},ember=${p.invEmberwood})`
    );
  });

  console.log('\n=== From B\'s perspective ===');
  roomB.state.players.forEach((p: any, sid: string) => {
    const isLocal = sid === roomB.sessionId;
    console.log(
      `  ${isLocal ? '[LOCAL]' : '[REMOTE]'} ${p.name} faction=${p.faction} ` +
      `class=${p.characterClass} model=${p.characterModel} color=0x${p.color.toString(16)} ` +
      `hp=${p.hp}/${p.maxHp} inv=(iron=${p.invIron},ember=${p.invEmberwood})`
    );
  });

  // Verify colors are faction-based and consistent across clients.
  console.log('\n=== Verdict: Colors ===');
  const aliceA = roomA.state.players.get(roomA.sessionId);
  const aliceB = roomB.state.players.get(roomA.sessionId);
  const bobA = roomA.state.players.get(roomB.sessionId);
  const bobB = roomB.state.players.get(roomB.sessionId);

  let pass = true;
  if (aliceA?.color !== aliceB?.color) {
    console.log(`❌ Alice's color differs: A sees 0x${aliceA?.color.toString(16)}, B sees 0x${aliceB?.color.toString(16)}`);
    pass = false;
  } else {
    console.log(`✓ Alice's color is consistent across clients: 0x${aliceA?.color.toString(16)}`);
  }
  if (bobA?.color !== bobB?.color) {
    console.log(`❌ Bob's color differs: A sees 0x${bobA?.color.toString(16)}, B sees 0x${bobB?.color.toString(16)}`);
    pass = false;
  } else {
    console.log(`✓ Bob's color is consistent across clients: 0x${bobA?.color.toString(16)}`);
  }
  if (aliceA?.faction === bobA?.faction) {
    console.log(`❌ Alice and Bob are on the same faction (${aliceA?.faction}) — should be opposite`);
    pass = false;
  } else {
    console.log(`✓ Alice (${aliceA?.faction}) and Bob (${bobA?.faction}) are on opposite factions`);
  }
  if (aliceA?.color === bobA?.color) {
    console.log(`❌ Alice and Bob have the same color — should differ by faction`);
    pass = false;
  } else {
    console.log(`✓ Alice and Bob have different colors (faction-based)`);
  }

  // Verify models are correct.
  console.log('\n=== Verdict: Models ===');
  if (aliceA?.characterModel !== 'character-female-a') {
    console.log(`❌ Alice's model is wrong: ${aliceA?.characterModel}`);
    pass = false;
  } else {
    console.log(`✓ Alice's model is correct: ${aliceA?.characterModel}`);
  }
  if (bobB?.characterModel !== 'character-male-c') {
    console.log(`❌ Bob's model is wrong: ${bobB?.characterModel}`);
    pass = false;
  } else {
    console.log(`✓ Bob's model is correct: ${bobB?.characterModel}`);
  }

  // Test model swap — Bob swaps to a different model.
  console.log('\n=== Test: Model swap ===');
  roomB.send('model_swap', { characterModel: 'character-female-d' });
  await new Promise((r) => setTimeout(r, 400));
  const bobAfter = roomA.state.players.get(roomB.sessionId);
  if (bobAfter?.characterModel === 'character-female-d') {
    console.log(`✓ Bob's model swap propagated to A: ${bobAfter.characterModel}`);
  } else {
    console.log(`❌ Bob's model swap failed. A sees: ${bobAfter?.characterModel}`);
    pass = false;
  }

  // Test inventory isolation — verify each player starts with 0 inventory.
  console.log('\n=== Verdict: Inventory isolation ===');
  if (aliceA?.invIron !== 0 || aliceA?.invEmberwood !== 0) {
    console.log(`❌ Alice starts with non-zero inventory: iron=${aliceA?.invIron} ember=${aliceA?.invEmberwood}`);
    pass = false;
  } else {
    console.log(`✓ Alice starts with empty inventory`);
  }
  if (bobB?.invIron !== 0 || bobB?.invEmberwood !== 0) {
    console.log(`❌ Bob starts with non-zero inventory: iron=${bobB?.invIron} ember=${bobB?.invEmberwood}`);
    pass = false;
  } else {
    console.log(`✓ Bob starts with empty inventory`);
  }

  // Test movement replication.
  console.log('\n=== Test: Movement replication ===');
  const initialX = aliceB?.x ?? 0;
  let seq = 0;
  const moveStart = Date.now();
  while (Date.now() - moveStart < 1500) {
    seq++;
    roomA.send('move', {
      sequence: seq,
      moveX: 1, moveZ: 0,
      aimX: 0, aimZ: 0,
      sprint: false,
    });
    await new Promise((r) => setTimeout(r, 50));
  }
  await new Promise((r) => setTimeout(r, 300));
  const finalX = aliceB?.x ?? 0;
  if (Math.abs(finalX - initialX) > 1) {
    console.log(`✓ B observed A moving ${Math.abs(finalX - initialX).toFixed(2)} units`);
  } else {
    console.log(`❌ B did not observe A moving`);
    pass = false;
  }

  console.log(`\n${pass ? '✓ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  console.log('\n=== Disconnecting ===');
  roomA.leave();
  roomB.leave();
  await new Promise((r) => setTimeout(r, 200));
  httpServer.close();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
