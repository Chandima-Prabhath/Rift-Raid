/**
 * Rift & Raid — GameLoop
 *
 * Fixed-timestep update + variable render. This is the standard pattern for
 * game loops:
 *
 *   - update() runs at a fixed 60Hz (TICK_RATE_HZ from shared/constants)
 *   - render() runs as fast as the display allows (or as fast as the browser will)
 *   - An accumulator carries sub-tick remainders so update is called 0+ times
 *     per frame and always with the same dt.
 *
 * Why fixed timestep?
 *   - Deterministic simulation (essential for server reconciliation)
 *   - Stable physics (Rapier prefers fixed dt)
 *   - Reproducible bugs (same input → same output)
 */

import { TICK_INTERVAL_MS } from '@rift-and-raid/shared';

export interface GameLoopCallbacks {
  update: (dt: number) => void;
  render: (alpha: number) => void;
}

export class GameLoop {
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private rafId: number | null = null;
  private readonly callbacks: GameLoopCallbacks;
  private readonly tickInterval: number;

  /** Stats (updated every second) */
  public fps = 0;
  public tickRate = 0;
  private frameCount = 0;
  private tickCount = 0;
  private statsTimer = 0;

  constructor(callbacks: GameLoopCallbacks, tickIntervalMs = TICK_INTERVAL_MS) {
    this.callbacks = callbacks;
    this.tickInterval = tickIntervalMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.frameCount = 0;
    this.tickCount = 0;
    this.statsTimer = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    let frameTime = now - this.lastTime;
    this.lastTime = now;

    // Clamp frameTime to avoid spiral-of-death after tab unfocus.
    if (frameTime > 250) {
      frameTime = 250;
    }

    this.accumulator += frameTime;

    // Run as many fixed-step ticks as fit in the accumulator.
    let ticksThisFrame = 0;
    const MAX_TICKS_PER_FRAME = 5; // avoid spiral of death
    while (this.accumulator >= this.tickInterval && ticksThisFrame < MAX_TICKS_PER_FRAME) {
      this.callbacks.update(this.tickInterval / 1000); // dt in seconds
      this.accumulator -= this.tickInterval;
      this.tickCount++;
      ticksThisFrame++;
    }
    // If we hit MAX_TICKS_PER_FRAME, drop the remaining accumulator to catch up.
    if (ticksThisFrame === MAX_TICKS_PER_FRAME) {
      this.accumulator = 0;
    }

    // Render with interpolation factor (0..1) between previous and current tick.
    const alpha = this.accumulator / this.tickInterval;
    this.callbacks.render(alpha);
    this.frameCount++;

    // Stats
    this.statsTimer += frameTime;
    if (this.statsTimer >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / this.statsTimer);
      this.tickRate = Math.round((this.tickCount * 1000) / this.statsTimer);
      this.frameCount = 0;
      this.tickCount = 0;
      this.statsTimer = 0;
    }

    this.rafId = requestAnimationFrame(this.frame);
  };
}
