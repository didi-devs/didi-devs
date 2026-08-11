import { PlayerState } from '../types/Types';

const ALLOWED_TRANSITIONS: Record<PlayerState, PlayerState[]> = {
  [PlayerState.RUNNING]: [
    PlayerState.LANE_CHANGING,
    PlayerState.JUMPING,
    PlayerState.SLIDING,
    PlayerState.FALLING,
    PlayerState.STUMBLING,
    PlayerState.DEAD,
  ],
  [PlayerState.LANE_CHANGING]: [
    PlayerState.RUNNING,
    PlayerState.JUMPING,
    PlayerState.SLIDING,
    PlayerState.FALLING,
    PlayerState.STUMBLING,
    PlayerState.DEAD,
  ],
  [PlayerState.JUMPING]: [PlayerState.FALLING, PlayerState.RUNNING, PlayerState.STUMBLING, PlayerState.DEAD],
  [PlayerState.FALLING]: [PlayerState.RUNNING, PlayerState.STUMBLING, PlayerState.DEAD],
  [PlayerState.SLIDING]: [
    PlayerState.RUNNING,
    PlayerState.JUMPING,
    PlayerState.FALLING,
    PlayerState.STUMBLING,
    PlayerState.DEAD,
  ],
  [PlayerState.STUMBLING]: [PlayerState.RUNNING, PlayerState.DEAD],
  [PlayerState.DEAD]: [PlayerState.RUNNING],
};

/**
 * Explicit finite state machine preventing impossible combinations such
 * as sliding mid-air or moving lanes while dead.
 */
export class PlayerStateMachine {
  private state: PlayerState = PlayerState.RUNNING;
  private timeInState = 0;
  private listeners: Set<(prev: PlayerState, next: PlayerState) => void> = new Set();

  get current(): PlayerState {
    return this.state;
  }

  get elapsed(): number {
    return this.timeInState;
  }

  onChange(listener: (prev: PlayerState, next: PlayerState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  canTransition(to: PlayerState): boolean {
    if (to === this.state) return true;
    return ALLOWED_TRANSITIONS[this.state].includes(to);
  }

  transition(to: PlayerState): boolean {
    if (!this.canTransition(to)) return false;
    const prev = this.state;
    this.state = to;
    this.timeInState = 0;
    if (prev !== to) {
      this.listeners.forEach((l) => l(prev, to));
    }
    return true;
  }

  update(dt: number): void {
    this.timeInState += dt;
  }

  reset(): void {
    this.state = PlayerState.RUNNING;
    this.timeInState = 0;
  }
}
