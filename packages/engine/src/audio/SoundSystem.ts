/**
 * Rift & Raid — SoundSystem
 *
 * Networked audio system. Sound effects are triggered:
 *   - Locally (immediate playback for local player actions)
 *   - Via network messages (synced to all clients for events like hits, kills)
 *
 * Audio is generated procedurally using the Web Audio API (no asset files
 * needed). This keeps the bundle small and avoids licensing issues.
 *
 * Sound types:
 *   - attack_melee:  short thud
 *   - attack_ranged: bow/spell whoosh
 *   - hit:           impact sound
 *   - death:         descending tone
 *   - harvest:       pickaxe chink
 *   - deposit:       coin clink
 *   - build:         hammer tap
 *   - ability:       magical chime
 *   - ui_click:      button click
 *   - ui_hover:      subtle hover
 */

type SoundType =
  | 'attack_melee' | 'attack_ranged' | 'hit' | 'death'
  | 'harvest' | 'deposit' | 'build' | 'ability'
  | 'ui_click' | 'ui_hover' | 'respawn' | 'levelup';

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled = true;
  private volume = 0.5;

  constructor() {
    // AudioContext is created on first user interaction (browsers require this).
  }

  /** Must be called from a user gesture (e.g., button click) to unlock audio. */
  unlock(): void {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      console.log('[SoundSystem] Audio context unlocked');
    } catch (err) {
      console.warn('[SoundSystem] Failed to create audio context:', err);
      this.enabled = false;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
  }

  setEnabled(e: boolean): void {
    this.enabled = e;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Play a sound locally (immediate). */
  play(sound: SoundType, volume: number = 1.0): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    this.generateSound(sound, volume);
  }

  /**
   * Play a sound with a 3D position (spatialized).
   * Volume falls off with distance from the listener.
   */
  play3D(sound: SoundType, x: number, y: number, z: number, listenerX: number, listenerZ: number): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const dist = Math.hypot(x - listenerX, z - listenerZ);
    const maxDist = 40;
    if (dist > maxDist) return;
    const vol = Math.max(0.1, 1 - dist / maxDist);
    this.generateSound(sound, vol);
  }

  private generateSound(sound: SoundType, volume: number): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.connect(this.masterGain);
    gain.gain.value = 0;

    switch (sound) {
      case 'attack_melee':
        this.tone(ctx, gain, 80, 0.15, 'sine', now, volume);
        break;
      case 'attack_ranged':
        this.sweep(ctx, gain, 800, 200, 0.2, now, volume);
        break;
      case 'hit':
        this.noise(ctx, gain, 0.08, now, volume * 0.6);
        this.tone(ctx, gain, 120, 0.1, 'square', now, volume * 0.5);
        break;
      case 'death':
        this.sweep(ctx, gain, 400, 80, 0.5, now, volume);
        break;
      case 'harvest':
        this.tone(ctx, gain, 1200, 0.05, 'square', now, volume * 0.5);
        this.noise(ctx, gain, 0.03, now + 0.02, volume * 0.3);
        break;
      case 'deposit':
        this.tone(ctx, gain, 800, 0.06, 'sine', now, volume * 0.4);
        this.tone(ctx, gain, 1200, 0.08, 'sine', now + 0.05, volume * 0.4);
        break;
      case 'build':
        this.noise(ctx, gain, 0.04, now, volume * 0.4);
        this.tone(ctx, gain, 200, 0.06, 'sine', now, volume * 0.3);
        break;
      case 'ability':
        this.tone(ctx, gain, 523, 0.1, 'sine', now, volume * 0.4);
        this.tone(ctx, gain, 659, 0.1, 'sine', now + 0.08, volume * 0.4);
        this.tone(ctx, gain, 784, 0.15, 'sine', now + 0.16, volume * 0.4);
        break;
      case 'ui_click':
        this.tone(ctx, gain, 600, 0.04, 'sine', now, volume * 0.3);
        break;
      case 'ui_hover':
        this.tone(ctx, gain, 800, 0.02, 'sine', now, volume * 0.15);
        break;
      case 'respawn':
        this.sweep(ctx, gain, 200, 600, 0.3, now, volume);
        break;
      case 'levelup':
        this.tone(ctx, gain, 523, 0.1, 'sine', now, volume * 0.4);
        this.tone(ctx, gain, 659, 0.1, 'sine', now + 0.1, volume * 0.4);
        this.tone(ctx, gain, 784, 0.1, 'sine', now + 0.2, volume * 0.4);
        this.tone(ctx, gain, 1047, 0.2, 'sine', now + 0.3, volume * 0.5);
        break;
    }
  }

  private tone(
    ctx: AudioContext, dest: AudioNode,
    freq: number, dur: number, type: OscillatorType,
    start: number, vol: number,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(start);
    osc.stop(start + dur);
  }

  private sweep(
    ctx: AudioContext, dest: AudioNode,
    freqStart: number, freqEnd: number, dur: number,
    start: number, vol: number,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, start);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(start);
    osc.stop(start + dur);
  }

  private noise(
    ctx: AudioContext, dest: AudioNode,
    dur: number, start: number, vol: number,
  ): void {
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(dest);
    src.start(start);
  }
}
