import { GameState } from '../types/Types';

const ALLOWED: Record<GameState, GameState[]> = {
  [GameState.BOOT]: [GameState.MENU],
  [GameState.MENU]: [GameState.STARTING],
  [GameState.STARTING]: [GameState.PLAYING, GameState.MENU],
  [GameState.PLAYING]: [GameState.PAUSED, GameState.GAME_OVER],
  [GameState.PAUSED]: [GameState.PLAYING, GameState.MENU],
  [GameState.GAME_OVER]: [GameState.MENU, GameState.STARTING],
};

/**
 * Top-level game state machine. Keeps transitions explicit and safe so
 * restart/pause flows never leave the game in an inconsistent state.
 */
export class GameStateManager {
  private state: GameState = GameState.BOOT;
  private listeners: Set<(prev: GameState, next: GameState) => void> = new Set();

  get current(): GameState {
    return this.state;
  }

  onChange(listener: (prev: GameState, next: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  transition(to: GameState): boolean {
    if (to === this.state) return true;
    if (!ALLOWED[this.state].includes(to)) {
      console.warn(`[GameStateManager] Illegal transition ${this.state} -> ${to}`);
      return false;
    }
    const prev = this.state;
    this.state = to;
    this.listeners.forEach((l) => l(prev, to));
    return true;
  }

  is(...states: GameState[]): boolean {
    return states.includes(this.state);
  }
}
