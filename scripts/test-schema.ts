/**
 * Schema v3 encode/decode test using the proper Encoder/Decoder API.
 */

import { GameState, PlayerState } from '../packages/shared/dist/index.js';
import { Encoder, Decoder, Reflection } from '@colyseus/schema';

console.log('=== Schema v3 Encode/Decode Test ===\n');

const state = new GameState();
console.log('1. Created GameState. players.size =', state.players.size);

const player = new PlayerState();
player.name = 'Alice';
player.faction = 'solari';
player.x = 100;
player.z = 200;
state.players.set('session-1', player);
console.log('2. Added player. players.size =', state.players.size);
console.log('   Player:', player.name, 'pos=(', player.x, ',', player.z, ')');

// v3 uses Encoder class. The same encoder must be reused for patches
// (it tracks the change tree internally).
let encoded: Uint8Array;
let encoder: Encoder;
try {
  encoder = new Encoder(state);
  encoded = encoder.encodeAll();
  console.log('3. encodeAll() returned', encoded.length, 'bytes');
} catch (e: any) {
  console.log('3. ❌ Encoder failed:', e.message);
  console.log(e.stack);
  process.exit(1);
}

// Decode using Decoder (reused for patches too).
try {
  const state2 = new GameState();
  const decoder = new Decoder(state2);
  decoder.decode(encoded);
  console.log('4. Decoded into fresh state. players.size =', state2.players.size);

  if (state2.players.size > 0) {
    const p = state2.players.get('session-1');
    console.log('   Player from decoded state:', p?.name, 'pos=(', p?.x, ',', p?.z, ')');
  } else {
    console.log('   ❌ FAIL: decoded state has no players!');
  }

  // Test patch encoding — reuse the SAME encoder.
  player.x = 150;
  player.z = 250;
  const patch = encoder.encode();
  console.log('\n5. After mutation, patch size =', patch.length, 'bytes');

  decoder.decode(patch);
  const p2 = state2.players.get('session-1');
  console.log('   After patch: player pos = (', p2?.x, ',', p2?.z, ')');

  console.log('\n=== Verdict ===');
  if (state2.players.size === 1 && p2?.x === 150) {
    console.log('✓ PASS: schema v3 encode/decode works correctly');
  } else {
    console.log('❌ FAIL: schema is broken');
  }
} catch (e: any) {
  console.log('4. ❌ Decoder failed:', e.message);
  console.log(e.stack);
  process.exit(1);
}
