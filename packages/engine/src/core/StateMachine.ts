/**
 * Rift & Raid — StateMachine
 *
 * Hierarchical finite state machine. Used for:
 *   - Player state (idle, moving, attacking, dashing, dead, respawning)
 *   - Match state (lobby, preparing, active, returning, completed)
 *   - Monster AI state (idle, wander, chase, attack, flee)
 *
 * Supports:
 *   - onEnter / onExit hooks per state
 *   - guards on transitions
 *   - hierarchical states (sub-states) — Phase 2+
 */

export interface StateContext {
  // Marker interface; cast to your own context type.
}

export interface State<TContext extends StateContext = StateContext> {
  name: string;
  onEnter?(context: TContext): void;
  onExit?(context: TContext): void;
  update?(context: TContext, dt: number): void;
}

export interface Transition<TContext extends StateContext = StateContext> {
  from: string;
  to: string;
  guard?(context: TContext): boolean;
  onTransition?(context: TContext): void;
}

export class StateMachine<TContext extends StateContext = StateContext> {
  private states = new Map<string, State<TContext>>();
  private transitions: Transition<TContext>[] = [];
  private current: State<TContext> | null = null;
  private context: TContext;

  constructor(context: TContext) {
    this.context = context;
  }

  addState(state: State<TContext>): this {
    this.states.set(state.name, state);
    return this;
  }

  addTransition(transition: Transition<TContext>): this {
    this.transitions.push(transition);
    return this;
  }

  start(initialState: string): void {
    const state = this.states.get(initialState);
    if (!state) {
      throw new Error(`Unknown initial state: ${initialState}`);
    }
    this.current = state;
    state.onEnter?.(this.context);
  }

  transitionTo(targetName: string): boolean {
    if (!this.current) return false;
    const fromName = this.current.name;
    const matching = this.transitions.filter(
      t => t.from === fromName && t.to === targetName
    );
    if (matching.length === 0) {
      // No registered transition; allow direct transition only if states exist.
      // This is intentional — some transitions are unconditional (e.g., forced respawn).
    }
    for (const t of matching) {
      if (t.guard && !t.guard(this.context)) return false;
    }
    const target = this.states.get(targetName);
    if (!target) {
      throw new Error(`Unknown target state: ${targetName}`);
    }
    this.current.onExit?.(this.context);
    for (const t of matching) {
      t.onTransition?.(this.context);
    }
    this.current = target;
    target.onEnter?.(this.context);
    return true;
  }

  update(dt: number): void {
    this.current?.update?.(this.context, dt);
  }

  get currentStateName(): string | null {
    return this.current?.name ?? null;
  }

  get currentState(): State<TContext> | null {
    return this.current;
  }
}
