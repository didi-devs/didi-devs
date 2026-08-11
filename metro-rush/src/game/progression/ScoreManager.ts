import { COIN, POWERUP, SCORE } from '../config/GameConfig';

export interface ScoreEvents {
  onCoinCollected?: (total: number) => void;
  onMultiplierChanged?: (multiplier: number) => void;
  onScoreChanged?: (score: number) => void;
}

/**
 * Tracks live run score, coins, distance and multiplier.
 */
export class ScoreManager {
  distance = 0;
  coins = 0;
  score = 0;
  multiplier = 1;
  private scoreBoostActive = false;
  private nextMultiplierDistance = SCORE.MULTIPLIER_STEP_DISTANCE;
  private events: ScoreEvents;

  constructor(events: ScoreEvents = {}) {
    this.events = events;
  }

  reset(): void {
    this.distance = 0;
    this.coins = 0;
    this.score = 0;
    this.multiplier = 1;
    this.scoreBoostActive = false;
    this.nextMultiplierDistance = SCORE.MULTIPLIER_STEP_DISTANCE;
  }

  setScoreBoost(active: boolean): void {
    this.scoreBoostActive = active;
  }

  private effectiveMultiplier(): number {
    return this.scoreBoostActive ? this.multiplier * POWERUP.SCORE_BOOST_MULTIPLIER : this.multiplier;
  }

  addDistance(meters: number): void {
    this.distance += meters;
    this.score += meters * SCORE.DISTANCE_PER_POINT * this.effectiveMultiplier();
    if (this.distance >= this.nextMultiplierDistance && this.multiplier < SCORE.MULTIPLIER_MAX) {
      this.multiplier += 1;
      this.nextMultiplierDistance += SCORE.MULTIPLIER_STEP_DISTANCE;
      this.events.onMultiplierChanged?.(this.multiplier);
    }
    this.events.onScoreChanged?.(Math.floor(this.score));
  }

  addCoin(count = 1): void {
    this.coins += count;
    this.score += count * COIN.VALUE * this.effectiveMultiplier();
    this.events.onCoinCollected?.(this.coins);
    this.events.onScoreChanged?.(Math.floor(this.score));
  }

  addBonus(points: number): void {
    this.score += points * this.effectiveMultiplier();
    this.events.onScoreChanged?.(Math.floor(this.score));
  }

  get roundedScore(): number {
    return Math.floor(this.score);
  }
}
