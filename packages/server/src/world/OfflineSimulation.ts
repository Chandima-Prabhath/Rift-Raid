/**
 * Rift & Raid — OfflineSimulation
 *
 * THE most important design pattern in the project. Per GDD §6, the server
 * runs on a laptop that is NOT always on. When the server boots after being
 * down for hours/days, it must "catch up" the world state to now — trees
 * grow, buildings complete, mines produce, etc.
 *
 * Implementation principle (from GDD §5.2): every time-based gameplay effect
 * is a PURE FUNCTION of elapsed time. No real-time loops. This means we can
 * recompute the current state from (state_at_shutdown, elapsed_time) without
 * replaying tick-by-tick.
 *
 * What simulates offline (per GDD §6.3):
 *   - Resource node respawn (depleted nodes come back after their respawn timer)
 *   - Building construction completion (in-progress structures finish)
 *   - Passive resource generation from capture points (owning team accrues)
 *   - Cooldown timers (elections, raids, team-switch)
 *
 * What does NOT simulate offline:
 *   - Combat, AI behavior, movement
 *   - Player-initiated raids
 *   - Resource gathering by players (only passive generation from camps)
 *
 * Phase 0 implements:
 *   - Resource node respawn
 *   - Building construction completion
 *   - Capture point passive generation
 *
 * Phase 5+ will add: tree growth stages, building decay, election timers,
 * raid cooldowns, boss schedule adherence.
 */

import type {
  PersistedWorldState,
  PersistedResourceNode,
  PersistedStructure,
} from '@rift-and-raid/shared';
import { MAX_OFFLINE_SIMULATION_HOURS } from '@rift-and-raid/shared';

export interface OfflineSimulationResult {
  elapsedMs: number;
  simulatedHours: number;
  capped: boolean;
  nodesRespawned: number;
  structuresCompleted: number;
  resourcesGenerated: { iron: number; emberwood: number; godshard: number };
  summary: string;
}

/**
 * Run offline simulation on a world state, mutating it in place.
 * Returns a summary of what changed for logging.
 */
export function simulateOffline(
  state: PersistedWorldState,
  now: number
): OfflineSimulationResult {
  const rawElapsed = now - state.lastTickTimestamp;
  if (rawElapsed <= 0) {
    return {
      elapsedMs: 0,
      simulatedHours: 0,
      capped: false,
      nodesRespawned: 0,
      structuresCompleted: 0,
      resourcesGenerated: { iron: 0, emberwood: 0, godshard: 0 },
      summary: 'No time elapsed since last save — no simulation needed.',
    };
  }

  // Cap to prevent runaway calc.
  const capped = rawElapsed > MAX_OFFLINE_SIMULATION_HOURS * 3600_000;
  const elapsedMs = capped ? MAX_OFFLINE_SIMULATION_HOURS * 3600_000 : rawElapsed;
  const simulatedHours = elapsedMs / 3600_000;
  const simulatedUntil = state.lastTickTimestamp + elapsedMs;

  let nodesRespawned = 0;
  let structuresCompleted = 0;
  const resourcesGenerated = { iron: 0, emberwood: 0, godshard: 0 };

  // ----------------------------------------------------------------------
  // 1. Resource node respawn
  // ----------------------------------------------------------------------
  for (const node of state.resourceNodes) {
    if (node.depleted) {
      const depletedAt = node.lastHarvestedAt;
      const respawnAt = depletedAt + node.respawnMs;
      if (simulatedUntil >= respawnAt) {
        node.depleted = false;
        node.hp = node.maxHp;
        node.lastHarvestedAt = respawnAt;
        nodesRespawned++;
      }
    }
  }

  // ----------------------------------------------------------------------
  // 2. Building construction completion
  // ----------------------------------------------------------------------
  // For Phase 0 we don't have per-structure constructionMs in the persisted
  // record; we infer "complete" by checking if constructionStartedAt +
  // assumed duration (60s for small, 300s for nexus) has passed. Phase 5
  // will store the exact constructionMs and the structure config id will
  // determine duration.
  // For Phase 0 demo purposes: any structure with constructionComplete=false
  // is assumed to finish after 60s.
  for (const structure of state.structures) {
    if (!structure.constructionComplete) {
      const assumedDurationMs = 60_000;
      if (simulatedUntil >= structure.constructionStartedAt + assumedDurationMs) {
        structure.constructionComplete = true;
        structuresCompleted++;
      }
    }
  }

  // ----------------------------------------------------------------------
  // 3. Capture point passive resource generation
  // ----------------------------------------------------------------------
  // Each capture point generates resources to its owning faction's vault
  // at a fixed rate (per GDD §7.6).
  //   - cp_watchtower: 1 iron/min
  //   - cp_mine:       1 emberwood/min
  //   - cp_shrine:     1 godshard/5min
  for (const cp of state.capturePoints) {
    if (!cp.ownerFaction || cp.lastCapturedAt === 0) continue;
    const generationStart = Math.max(cp.lastCapturedAt, state.lastTickTimestamp);
    const generationEnd = simulatedUntil;
    const generationMs = Math.max(0, generationEnd - generationStart);
    const minutes = generationMs / 60_000;
    const faction = state.factions[cp.ownerFaction];

    if (cp.configId === 'cp_watchtower') {
      const amount = Math.floor(minutes); // 1 per min
      if (amount > 0) {
        faction.vault.iron = Math.min(500, faction.vault.iron + amount);
        resourcesGenerated.iron += amount;
      }
    } else if (cp.configId === 'cp_mine') {
      const amount = Math.floor(minutes);
      if (amount > 0) {
        faction.vault.emberwood = Math.min(500, faction.vault.emberwood + amount);
        resourcesGenerated.emberwood += amount;
      }
    } else if (cp.configId === 'cp_shrine') {
      const amount = Math.floor(minutes / 5); // 1 per 5 min
      if (amount > 0) {
        faction.vault.godshard = Math.min(500, faction.vault.godshard + amount);
        resourcesGenerated.godshard += amount;
      }
    }
  }

  // Update the world's timestamp to reflect simulation completion.
  state.lastTickTimestamp = now;

  const parts: string[] = [];
  parts.push(`Simulated ${formatDuration(elapsedMs)} of world time.`);
  if (capped) parts.push(`(Capped at ${MAX_OFFLINE_SIMULATION_HOURS}h — actual gap was ${formatDuration(rawElapsed)}.)`);
  if (nodesRespawned > 0) parts.push(`${nodesRespawned} resource node(s) respawned.`);
  if (structuresCompleted > 0) parts.push(`${structuresCompleted} building(s) completed construction.`);
  const totalGen = resourcesGenerated.iron + resourcesGenerated.emberwood + resourcesGenerated.godshard;
  if (totalGen > 0) {
    parts.push(
      `Capture points generated: ${resourcesGenerated.iron} iron, ${resourcesGenerated.emberwood} emberwood, ${resourcesGenerated.godshard} godshard.`
    );
  }
  if (nodesRespawned === 0 && structuresCompleted === 0 && totalGen === 0) {
    parts.push('No state changes during offline period.');
  }

  return {
    elapsedMs,
    simulatedHours,
    capped,
    nodesRespawned,
    structuresCompleted,
    resourcesGenerated,
    summary: parts.join(' '),
  };
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.round((ms % 3_600_000) / 60_000);
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}
