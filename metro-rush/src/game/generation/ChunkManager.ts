import { SPAWN } from '../config/GameConfig';
import { choice, clamp } from '../utils/MathUtils';
import { VALID_PATTERNS, type Pattern } from './PatternLibrary';
import type { DifficultyDirector } from './DifficultyDirector';
import type { ObstacleManager } from '../obstacles/ObstacleManager';
import type { CoinManager } from '../collectibles/CoinManager';
import type { PowerUpManager } from '../powerups/PowerUpManager';

const GAP_MIN = 6;
const GAP_MAX = 12;

/**
 * The level director: chooses the next pattern based on distance,
 * current difficulty budget, and the previous pattern (to avoid
 * repeats), then instantiates it into the obstacle/coin/power-up
 * managers ahead of the player.
 */
export class ChunkManager {
  private nextSpawnZ = SPAWN.CHUNK_LENGTH;
  private previousPatternId: string | null = null;
  private obstacles: ObstacleManager;
  private coins: CoinManager;
  private powerUps: PowerUpManager;
  private difficulty: DifficultyDirector;

  constructor(obstacles: ObstacleManager, coins: CoinManager, powerUps: PowerUpManager, difficulty: DifficultyDirector) {
    this.obstacles = obstacles;
    this.coins = coins;
    this.powerUps = powerUps;
    this.difficulty = difficulty;
  }

  reset(): void {
    this.nextSpawnZ = SPAWN.CHUNK_LENGTH;
    this.previousPatternId = null;
    // Seed a calm opening stretch so players aren't ambushed at start.
    for (let i = 0; i < 2; i++) {
      this.spawnPattern(this.pickPattern(0.1));
    }
  }

  private pickPattern(budgetOverride?: number): Pattern {
    const budget = budgetOverride ?? this.difficulty.difficultyBudget;
    const maxDifficulty = clamp(1 + budget * 4.2, 1, 5);
    let candidates = VALID_PATTERNS.filter((p) => p.difficulty <= maxDifficulty && p.id !== this.previousPatternId);
    if (candidates.length === 0) candidates = VALID_PATTERNS.filter((p) => p.difficulty <= maxDifficulty);
    if (candidates.length === 0) candidates = VALID_PATTERNS;
    return choice(candidates);
  }

  private spawnPattern(pattern: Pattern): void {
    const base = this.nextSpawnZ;
    for (const o of pattern.obstacles) {
      this.obstacles.spawn(o.kind, o.lane, base + o.z);
    }
    for (const c of pattern.coins) {
      this.coins.spawn(c.lane, base + c.z, c.height ?? 1);
    }
    if (pattern.powerUps) {
      for (const p of pattern.powerUps) {
        if (this.powerUps.canSpawnAt(base + p.z, 20)) {
          this.powerUps.spawn(p.kind, p.lane, base + p.z);
        }
      }
    }
    this.previousPatternId = pattern.id;
    const gap = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    this.nextSpawnZ = base + pattern.length + gap;
  }

  update(distanceTraveled: number): void {
    while (this.nextSpawnZ - distanceTraveled < SPAWN.SPAWN_DISTANCE) {
      this.spawnPattern(this.pickPattern());
    }
  }
}
