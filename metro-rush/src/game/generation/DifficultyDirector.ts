import { DIFFICULTY, SPEED } from '../config/GameConfig';
import { clamp, smoothstep } from '../utils/MathUtils';

export type DifficultyTier = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';

/**
 * Governs forward speed and the difficulty budget available to the
 * pattern generator. Speed ramps smoothly toward MAX_SPEED; pattern
 * difficulty follows a slower curve with gentle oscillation ("pacing
 * waves") so intensity breathes instead of climbing forever.
 */
export class DifficultyDirector {
  private distance = 0;
  private speed = SPEED.INITIAL;

  reset(): void {
    this.distance = 0;
    this.speed = SPEED.INITIAL;
  }

  update(dt: number): void {
    const progress = clamp(this.distance / SPEED.DISTANCE_TO_MAX, 0, 1);
    const eased = smoothstep(0, 1, progress);
    const targetSpeed = SPEED.INITIAL + (SPEED.MAX - SPEED.INITIAL) * eased;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 0.6);
    this.distance += this.speed * dt;
  }

  get currentSpeed(): number {
    return this.speed;
  }

  get distanceTraveled(): number {
    return this.distance;
  }

  get tier(): DifficultyTier {
    if (this.distance < DIFFICULTY.DISTANCE_EASY_END) return 'EASY';
    if (this.distance < DIFFICULTY.DISTANCE_MEDIUM_END) return 'MEDIUM';
    if (this.distance < DIFFICULTY.DISTANCE_HARD_END) return 'HARD';
    return 'EXPERT';
  }

  /** 0..1 budget describing how demanding a chosen pattern may be right now. */
  get difficultyBudget(): number {
    const tierBase: Record<DifficultyTier, number> = { EASY: 0.15, MEDIUM: 0.45, HARD: 0.75, EXPERT: 0.95 };
    const base = tierBase[this.tier];
    const wave = Math.sin((this.distance / DIFFICULTY.PACING_WAVE_LENGTH) * Math.PI * 2) * DIFFICULTY.PACING_WAVE_STRENGTH;
    return clamp(base + wave, 0.05, 1);
  }

  /** Reaction-window multiplier: smaller values demand faster reactions. */
  get reactionWindowScale(): number {
    return clamp(1.25 - this.difficultyBudget * 0.5, 0.6, 1.25);
  }
}
