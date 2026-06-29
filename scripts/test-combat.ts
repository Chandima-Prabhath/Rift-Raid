/**
 * Test script: connect to the Colyseus server as a client and test combat.
 * Usage: bun scripts/test-combat.ts
 */

import { Client } from 'colyseus.js';

const SERVER_URL = 'ws://localhost:2567';

async function main() {
  const client = new Client(SERVER_URL);
  console.log('Connecting...');
  const room = await client.joinOrCreate('rift-raid');
  console.log(`Connected. sessionId=${room.sessionId}`);

  let attackCount = 0;
  let abilityCount = 0;
  let projectileCount = 0;

  // Listen for state changes
  room.state.players.onAdd((player, sessionId) => {
    console.log(`[Player Add] ${player.name} (${sessionId}) class=${player.characterClass} faction=${player.faction} hp=${player.hp}`);
    player.onChange(() => {
      if (player.hp < player.maxHp) {
        console.log(`[Player Update] ${player.name} hp=${player.hp}/${player.maxHp} alive=${player.alive}`);
      }
    });
  });

  room.state.players.onRemove((_player, sessionId) => {
    console.log(`[Player Remove] ${sessionId}`);
  });

  room.state.projectiles.onAdd((proj, projId) => {
    projectileCount++;
    console.log(`[Projectile Add] id=${projId} owner=${proj.ownerId} damage=${proj.damage} pos=(${proj.x.toFixed(1)}, ${proj.z.toFixed(1)}) color=${proj.color}`);
  });

  room.state.projectiles.onRemove((_proj, projId) => {
    console.log(`[Projectile Remove] ${projId}`);
  });

  // Also listen for state changes
  room.onStateChange((state) => {
    console.log(`[State Change] tick=${state.tick} players=${state.players.size} projectiles=${state.projectiles.size}`);
  });

  room.onMessage('chat', (payload) => {
    console.log(`[Chat] ${payload.name}: ${payload.text}`);
  });

  room.onMessage('kill', (payload) => {
    console.log(`[KILL] ${payload.killerName} killed ${payload.victimName}`);
  });

  // Wait a bit for state to sync
  await new Promise(r => setTimeout(r, 500));

  // Test 1: Attack as warrior (melee)
  console.log('\n--- Test 1: Warrior attack ---');
  room.send('attack', { aimX: 0, aimZ: -50 });
  await new Promise(r => setTimeout(r, 200));

  // Test 2: Swap to ranger
  console.log('\n--- Test 2: Swap to ranger ---');
  room.send('class_swap', { characterClass: 'ranger' });
  await new Promise(r => setTimeout(r, 200));

  // Test 3: Attack as ranger (should spawn projectile)
  console.log('\n--- Test 3: Ranger attack (should spawn projectile) ---');
  room.send('attack', { aimX: 0, aimZ: -50 });
  attackCount++;
  await new Promise(r => setTimeout(r, 500));

  // Test 4: Use ability (volley - should spawn 3 projectiles)
  console.log('\n--- Test 4: Volley ability (should spawn 3 projectiles) ---');
  room.send('ability', { abilityId: 'volley', aimX: 0, aimZ: -50 });
  abilityCount++;
  await new Promise(r => setTimeout(r, 500));

  // Test 5: Swap to mage
  console.log('\n--- Test 5: Swap to mage ---');
  room.send('class_swap', { characterClass: 'mage' });
  await new Promise(r => setTimeout(r, 200));

  // Test 6: Attack as mage (should spawn projectile)
  console.log('\n--- Test 6: Mage attack (should spawn projectile) ---');
  room.send('attack', { aimX: 0, aimZ: -50 });
  attackCount++;
  await new Promise(r => setTimeout(r, 500));

  // Test 7: Use Frost Nova ability
  console.log('\n--- Test 7: Frost Nova ability ---');
  room.send('ability', { abilityId: 'frost_nova', aimX: 0, aimZ: -50 });
  abilityCount++;
  await new Promise(r => setTimeout(r, 500));

  // Test 8: Swap to warrior and use Charge
  console.log('\n--- Test 8: Warrior Charge ability ---');
  room.send('class_swap', { characterClass: 'warrior' });
  await new Promise(r => setTimeout(r, 200));
  room.send('ability', { abilityId: 'charge', aimX: -70, aimZ: -40 });
  abilityCount++;
  await new Promise(r => setTimeout(r, 500));

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Attacks sent: ${attackCount}`);
  console.log(`Abilities sent: ${abilityCount}`);
  console.log(`Projectiles spawned: ${projectileCount}`);

  // Wait a bit more to see if projectiles expire
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n--- Disconnecting ---');
  room.leave();
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
