/**
 * Rift & Raid — Global constants
 *
 * Tunable values that affect multiple systems. Each subsystem also has its
 * own constants; this file is for cross-cutting values only.
 *
 * IMPORTANT: changing any value here MUST be accompanied by an entry in the
 * GDD changelog explaining the rationale.
 */

// ============================================================================
// Time
// ============================================================================

export const TICK_RATE_HZ = 60;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ; // ~16.67ms

/** Cap on offline simulation to prevent runaway calc on long absences. */
export const MAX_OFFLINE_SIMULATION_HOURS = 168; // 7 days

// ============================================================================
// World
// ============================================================================

export const WORLD_SIZE = {
  width: 200, // X axis (meters, east-west)
  depth: 120, // Z axis (meters, north-south)
} as const;

export const BASE_RADIUS_M = 50; // structures can only be placed within this radius of Nexus

// ============================================================================
// Camera (angled top-down, rotatable)
// ============================================================================

export const CAMERA_CONFIG = {
  /**
   * Pitch angle from horizon (0°) toward straight-down (90°).
   * 40° = slightly elevated third-person view (like AoV / LoL).
   * Higher = more top-down. Lower = more horizon.
   */
  pitchDeg: 40,
  /** Distance from camera to player. */
  distance: 18,
  /** Field of view. */
  fov: 55,
  /** Smoothing factor for follow (0 = instant, 1 = no follow). */
  followLerp: 0.18,
  /** Pixel ratio cap (mobile perf). */
  maxPixelRatio: 2,
  /** Min/max zoom (mouse wheel). */
  minDistance: 8,
  maxDistance: 32,
  /** Yaw rotation speed (radians per pixel of right-click drag). */
  yawSpeed: 0.005,
  /** Pitch adjustment speed (radians per pixel of right-click vertical drag). */
  pitchSpeed: 0.003,
  /** Min/max pitch (clamped so you can't go fully top-down or fully horizon). */
  minPitchDeg: 20,
  maxPitchDeg: 75,
  /** Pinch-to-zoom speed factor (mobile). */
  pinchZoomSpeed: 0.01,
  /** Initial yaw (radians). 0 = looking toward -Z. */
  initialYaw: 0,
} as const;

// ============================================================================
// Player
// ============================================================================

export const PLAYER_DEFAULTS = {
  moveSpeed: 5, // m/s, overridden by class
  sprintMultiplier: 1.4,
  dashDistance: 4,
  dashCooldownMs: 3000,
  maxInventoryPerResource: 20,
  respawnMs: 5000,
} as const;

export const CLASS_STATS = {
  warrior: { hp: 130, moveSpeed: 5, sprintSpeed: 7 },
  ranger:  { hp: 90,  moveSpeed: 6, sprintSpeed: 8 },
  mage:    { hp: 70,  moveSpeed: 5, sprintSpeed: 7 },
} as const;

// ============================================================================
// Combat
// ============================================================================

export const COMBAT = {
  /** Headshot multiplier for ranged weapons. */
  headshotMultiplier: 1.5,
  /** Spawn protection after respawn. */
  spawnProtectionMs: 5000,
  /** Movement penalty while carrying stolen resources. */
  stealMoveSpeedPenalty: 0.3, // -30%
  /** Maximum fraction of enemy Vault that can be stolen per raid. */
  stealCapFraction: 0.3,
  /** Cooldown between raids. */
  raidCooldownMs: 5 * 60 * 1000, // 5 min
  /** Respawn delay after death (ms). */
  respawnDelayMs: 5000,
  /** Melee attack arc half-angle (radians). ±60° = 120° arc. */
  meleeArcHalfAngle: (60 * Math.PI) / 180,
  /** Projectile collision radius (sphere check). */
  projectileRadius: 0.4,
  /** Player collision radius (for projectile hits). */
  playerRadius: 0.6,
  /** Slow multiplier when slowed (e.g. by Frost Nova). */
  slowMultiplier: 0.5,
} as const;

export const ABILITIES = {
  charge: {
    name: 'Charge',
    cooldownMs: 6000,
    distance: 6,
    damage: 15,
    radius: 1.5,
  },
  volley: {
    name: 'Volley',
    cooldownMs: 8000,
    damage: 12,
    projectileCount: 3,
    spreadAngle: (30 * Math.PI) / 180, // ±30° cone
  },
  frost_nova: {
    name: 'Frost Nova',
    cooldownMs: 10000,
    radius: 5,
    damage: 10,
    slowMs: 2000,
  },
} as const;

// ============================================================================
// Economy
// ============================================================================

export const ECONOMY = {
  /** Personal inventory cap per resource. */
  inventoryCapPerResource: 20,
  /** Vault caps by level. */
  vaultCapByLevel: [0, 100, 200, 500],
  /** Rubber-band: gather speed bonus when behind. */
  rubberBandGatherBonus: 0.10, // +10% when 30%+ behind
  rubberBandStructureDamageBonus: 0.10, // +10% when 50%+ behind
  rubberBandGatherThreshold: 0.30,
  rubberBandStructureDamageThreshold: 0.50,
} as const;

// ============================================================================
// PvE
// ============================================================================

export const RIFTSPAWN = {
  minorCap: 30,
  majorSpawnIntervalMs: 5 * 60 * 1000, // 5 min
  eliteSpawnIntervalMs: 15 * 60 * 1000, // 15 min
  bossSpawnDayOfWeek: 6, // Saturday
  bossSpawnHour: 20, // 8 PM server time
  bossDespawnMs: 30 * 60 * 1000, // 30 min
  nightSpawnMultiplier: 1.5,
} as const;

// ============================================================================
// Day/Night
// ============================================================================

export const DAY_NIGHT = {
  cycleMs: 20 * 60 * 1000, // 20 min total
  dayFraction: 0.5, // first half is day
} as const;

// ============================================================================
// Network
// ============================================================================

export const NETWORK = {
  defaultPort: 2567,
  reconciliationBufferMs: 1000,
  interpolationDelayMs: 100,
  maxSnapshotRate: 20, // server sends state at 20Hz
} as const;
