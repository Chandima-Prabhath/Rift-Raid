/**
 * Rift & Raid — Server entry point
 *
 * Boots the authoritative server. Phase 2 responsibilities:
 *   1. Load content registry (weapons, abilities, structures, monsters)
 *   2. Open SQLite persistence
 *   3. Load saved world state (or create default)
 *   4. Run offline simulation (catch up to now)
 *   5. Log summary
 *   6. Save updated state
 *   7. Start Colyseus server with GameRoom
 *   8. Set up auto-save (60s) and graceful shutdown (SIGINT/SIGTERM)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import {
  NETWORK,
  type PersistedWorldState,
} from '@rift-and-raid/shared';
import { ContentRegistry } from '@rift-and-raid/engine';
import { loadAllContent } from '@rift-and-raid/game';
import {
  createDefaultWorldState,
  fromPersisted,
  toPersisted,
  Persistence,
  simulateOffline,
  type WorldState,
} from './world/index.js';
import { GameRoom } from './rooms/GameRoom.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../../data/world.sqlite');
const PORT = Number(process.env.PORT ?? NETWORK.defaultPort);

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Rift & Raid — Server booting');
  console.log('═══════════════════════════════════════════════════════');

  // ── 1. Content registry ───────────────────────────────────────────────
  const content = new ContentRegistry();
  await loadAllContent(content);
  console.log(content.summary());

  // ── 2. Persistence ────────────────────────────────────────────────────
  const persistence = new Persistence({ dbPath: DB_PATH });
  console.log(`[Persistence] Opened SQLite at ${DB_PATH}`);

  // ── 3. Load world state ───────────────────────────────────────────────
  const now = Date.now();
  const persisted = persistence.load();
  let world: WorldState;
  if (persisted) {
    console.log(`[World] Loaded saved state (last tick: ${new Date(persisted.lastTickTimestamp).toISOString()})`);
    world = fromPersisted(persisted);
  } else {
    console.log('[World] No saved state — creating default world');
    world = createDefaultWorldState(now);
  }

  // ── 4. Offline simulation ─────────────────────────────────────────────
  console.log('[OfflineSim] Running catch-up...');
  const result = simulateOffline(toPersisted(world), now);
  world.lastTickTimestamp = now;
  console.log(`[OfflineSim] ${result.summary}`);
  console.log(
    `[OfflineSim] elapsed: ${result.simulatedHours.toFixed(2)}h` +
    (result.capped ? ' (capped)' : '')
  );

  // ── 5. Save updated state ─────────────────────────────────────────────
  persistence.save(toPersisted(world));
  console.log('[Persistence] Saved post-simulation state');

  // ── 6. Start Colyseus server ──────────────────────────────────────────
  const app = express();
  const httpServer = http.createServer(app);

  // Mount the Colyseus monitor at /colyseus for debug UI.
  app.use('/colyseus', monitor());

  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  // Define the room — clients join at /rift-raid.
  gameServer.define('rift-raid', GameRoom);

  httpServer.listen(PORT, () => {
    console.log(`[Network] Colyseus server listening on http://localhost:${PORT}`);
    console.log(`[Network] Room endpoint: ws://localhost:${PORT}/rift-raid`);
    console.log(`[Network] Monitor: http://localhost:${PORT}/colyseus`);
  });

  // ── 7. Auto-save loop ─────────────────────────────────────────────────
  const AUTO_SAVE_INTERVAL_MS = 60_000;
  const autoSaveTimer = setInterval(() => {
    world.lastTickTimestamp = Date.now();
    persistence.save(toPersisted(world));
  }, AUTO_SAVE_INTERVAL_MS);
  autoSaveTimer.unref?.();

  // ── 8. Graceful shutdown ──────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Shutdown] Received ${signal}. Saving state...`);
    clearInterval(autoSaveTimer);
    world.lastTickTimestamp = Date.now();
    persistence.save(toPersisted(world));
    persistence.close();
    httpServer.close();
    console.log('[Shutdown] State saved. Goodbye.');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Server ready. Press Ctrl+C to shut down.');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Fatal error during boot:', err);
  process.exit(1);
});
