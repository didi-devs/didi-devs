import { ObstacleKind, PowerUpKind } from '../types/Types';

export interface ObstacleSpawn {
  z: number; // offset from pattern start
  lane: number; // -1, 0, 1
  kind: ObstacleKind;
}

export interface CoinSpawn {
  z: number;
  lane: number;
  height?: number;
}

export interface PowerUpSpawn {
  z: number;
  lane: number;
  kind: PowerUpKind;
}

export interface Pattern {
  id: string;
  length: number;
  difficulty: number; // 1 (easy) .. 5 (hardest)
  obstacles: ObstacleSpawn[];
  coins: CoinSpawn[];
  powerUps?: PowerUpSpawn[];
}

const GB = ObstacleKind.GROUND_BARRIER;
const OB = ObstacleKind.OVERHEAD_BARRIER;
const FB = ObstacleKind.FULL_BLOCKER;
const MV = ObstacleKind.MOVING_VEHICLE;
const SP = ObstacleKind.STATION_PROP;

/**
 * Hand-authored, difficulty-rated obstacle/coin/power-up chunks. Every
 * pattern is constructed so at least one lane stays traversable at any
 * z-slice; `validatePattern` re-checks this at runtime as a safety net
 * for future community-authored patterns.
 */
export const PATTERNS: Pattern[] = [
  {
    id: 'A-coin-trail',
    length: 14,
    difficulty: 1,
    obstacles: [],
    coins: Array.from({ length: 7 }, (_, i) => ({ z: 2 + i * 1.6, lane: 0 })),
  },
  {
    id: 'B-side-barrier',
    length: 14,
    difficulty: 1,
    obstacles: [{ z: 6, lane: -1, kind: GB }],
    coins: Array.from({ length: 5 }, (_, i) => ({ z: 3 + i * 1.6, lane: 1 })),
  },
  {
    id: 'C-jump-then-coins',
    length: 16,
    difficulty: 2,
    obstacles: [{ z: 5, lane: 0, kind: GB }],
    coins: [
      { z: 5, lane: 0, height: 1.6 },
      { z: 6.4, lane: 0, height: 2.0 },
      { z: 7.8, lane: 0, height: 1.6 },
    ],
  },
  {
    id: 'D-overhead-slide',
    length: 14,
    difficulty: 2,
    obstacles: [{ z: 6, lane: 1, kind: OB }],
    coins: [
      { z: 2, lane: 1 },
      { z: 6, lane: 1, height: 0.4 },
      { z: 10, lane: 1 },
    ],
  },
  {
    id: 'E-moving-vehicle',
    length: 18,
    difficulty: 3,
    obstacles: [{ z: 8, lane: 0, kind: MV }],
    coins: [
      { z: 2, lane: -1 },
      { z: 4, lane: -1 },
      { z: 14, lane: 1 },
      { z: 16, lane: 1 },
    ],
  },
  {
    id: 'F-safe-weave',
    length: 20,
    difficulty: 2,
    obstacles: [
      { z: 5, lane: -1, kind: GB },
      { z: 10, lane: 1, kind: GB },
      { z: 15, lane: -1, kind: GB },
    ],
    coins: [
      { z: 5, lane: 0 },
      { z: 10, lane: 0 },
      { z: 15, lane: 0 },
    ],
  },
  {
    id: 'G-double-choice',
    length: 16,
    difficulty: 3,
    obstacles: [
      { z: 6, lane: -1, kind: FB },
      { z: 6, lane: 0, kind: OB },
    ],
    coins: [
      { z: 2, lane: 1 },
      { z: 10, lane: 1 },
      { z: 12, lane: 1 },
    ],
  },
  {
    id: 'H-gauntlet',
    length: 24,
    difficulty: 4,
    obstacles: [
      { z: 4, lane: 0, kind: GB },
      { z: 9, lane: -1, kind: OB },
      { z: 14, lane: 1, kind: FB },
      { z: 19, lane: 0, kind: MV },
    ],
    coins: [
      { z: 4, lane: 0, height: 1.6 },
      { z: 9, lane: -1, height: 0.4 },
      { z: 14, lane: -1 },
      { z: 19, lane: 1 },
    ],
  },
  {
    id: 'I-station-props',
    length: 16,
    difficulty: 2,
    obstacles: [
      { z: 5, lane: -1, kind: SP },
      { z: 10, lane: 1, kind: SP },
    ],
    coins: [
      { z: 5, lane: 1 },
      { z: 10, lane: -1 },
    ],
  },
  {
    id: 'J-triple-full-alt',
    length: 22,
    difficulty: 4,
    obstacles: [
      { z: 4, lane: -1, kind: FB },
      { z: 9, lane: 0, kind: FB },
      { z: 14, lane: 1, kind: FB },
    ],
    coins: [
      { z: 4, lane: 0 },
      { z: 4, lane: 1 },
      { z: 9, lane: -1 },
      { z: 9, lane: 1 },
      { z: 14, lane: -1 },
      { z: 14, lane: 0 },
    ],
  },
  {
    id: 'K-expert-mix',
    length: 26,
    difficulty: 5,
    obstacles: [
      { z: 4, lane: 0, kind: OB },
      { z: 8, lane: -1, kind: GB },
      { z: 8, lane: 1, kind: MV },
      { z: 14, lane: 0, kind: FB },
      { z: 19, lane: -1, kind: OB },
      { z: 19, lane: 1, kind: GB },
    ],
    coins: [
      { z: 4, lane: -1 },
      { z: 14, lane: 1 },
      { z: 19, lane: 0, height: 1.6 },
    ],
  },
  {
    id: 'L-rest',
    length: 12,
    difficulty: 1,
    obstacles: [],
    coins: [
      { z: 3, lane: -1 },
      { z: 3, lane: 0 },
      { z: 3, lane: 1 },
      { z: 8, lane: 0 },
    ],
    powerUps: [{ z: 6, lane: 0, kind: PowerUpKind.SCORE_BOOST }],
  },
];

/**
 * Verifies that at any given z-slice, at least one lane remains reachable
 * without requiring an impossible simultaneous jump+slide+lane-change.
 * Groups obstacles by rounded z and rejects a pattern only if all three
 * lanes are blocked by lane-change-mandatory obstacles at the same slice.
 */
export function validatePattern(pattern: Pattern): boolean {
  const slices = new Map<number, Set<number>>();
  for (const o of pattern.obstacles) {
    const def = OBSTACLE_HARD_BLOCK[o.kind];
    if (!def) continue;
    const key = Math.round(o.z * 4);
    if (!slices.has(key)) slices.set(key, new Set());
    slices.get(key)!.add(o.lane);
  }
  for (const lanes of slices.values()) {
    if (lanes.size >= 3) return false;
  }
  return true;
}

const OBSTACLE_HARD_BLOCK: Partial<Record<ObstacleKind, true>> = {
  [FB]: true,
  [MV]: true,
};

export const VALID_PATTERNS = PATTERNS.filter(validatePattern);
