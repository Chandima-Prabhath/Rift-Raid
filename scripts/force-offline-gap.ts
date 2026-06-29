/**
 * Utility: set the saved world's lastTickTimestamp to N hours ago.
 * Used to verify offline simulation works.
 *
 * Usage: npx tsx scripts/force-offline-gap.ts <hours>
 */
import { Persistence } from '../packages/server/src/world/Persistence.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../data/world.sqlite');

const hoursAgo = Number(process.argv[2] ?? 1);
if (Number.isNaN(hoursAgo)) {
  console.error('Usage: npx tsx scripts/force-offline-gap.ts <hours>');
  process.exit(1);
}

const persistence = new Persistence({ dbPath: DB_PATH });
const state = persistence.load();
if (!state) {
  console.error('No saved world state found.');
  process.exit(1);
}
state.lastTickTimestamp = Date.now() - hoursAgo * 3600_000;
persistence.save(state);
console.log(`Set lastTickTimestamp to ${hoursAgo}h ago (${new Date(state.lastTickTimestamp).toISOString()})`);
persistence.close();
