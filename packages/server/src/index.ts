/**
 * Rift & Raid — Server entry point
 *
 * Boots the authoritative server. Phase 0 responsibilities:
 *   1. Load content registry (weapons, abilities, structures, monsters)
 *   2. Open SQLite persistence
 *   3. Load saved world state (or create default)
 *   4. Run offline simulation (catch up to now)
 *   5. Log summary
 *   6. Save updated state
 *   7. (Stub) start WebSocket listener — Phase 2 will integrate Colyseus
 *   8. Set up auto-save (60s) and graceful shutdown (SIGINT/SIGTERM)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../../data/world.sqlite');

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
  // Re-sync world.lastTickTimestamp (simulateOffline mutates the persisted copy).
  world.lastTickTimestamp = now;
  console.log(`[OfflineSim] ${result.summary}`);
  console.log(
    `[OfflineSim] elapsed: ${result.simulatedHours.toFixed(2)}h` +
    (result.capped ? ' (capped)' : '')
  );

  // ── 5. Save updated state ─────────────────────────────────────────────
  persistence.save(toPersisted(world));
  console.log('[Persistence] Saved post-simulation state');

  // ── 6. Network (Phase 0 stub — real Colyseus integration in Phase 2) ──
  const port = NETWORK.defaultPort;
  console.log(`[Network] Phase 0 stub — Colyseus integration pending (would listen on :${port})`);

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
    console.log('[Shutdown] State saved. Goodbye.');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // ── 9. Keep process alive ─────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Server ready. Press Ctrl+C to shut down.');
  console.log('═══════════════════════════════════════════════════════');

  // Phase 0: keep process alive via a long-running interval.
  // Phase 2 will replace this with `server.listen()`.
  const keepAlive = setInterval(() => {
    /* no-op */
  }, 60_000);
  keepAlive.unref?.();
}

main().catch((err) => {
  console.error('Fatal error during boot:', err);
  process.exit(1);
});
