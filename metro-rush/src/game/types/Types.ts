export const PlayerState = {
  RUNNING: 'RUNNING',
  LANE_CHANGING: 'LANE_CHANGING',
  JUMPING: 'JUMPING',
  FALLING: 'FALLING',
  SLIDING: 'SLIDING',
  STUMBLING: 'STUMBLING',
  DEAD: 'DEAD',
} as const;
export type PlayerState = (typeof PlayerState)[keyof typeof PlayerState];

export const GameState = {
  BOOT: 'BOOT',
  MENU: 'MENU',
  STARTING: 'STARTING',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

export const ObstacleKind = {
  GROUND_BARRIER: 'GROUND_BARRIER',
  OVERHEAD_BARRIER: 'OVERHEAD_BARRIER',
  FULL_BLOCKER: 'FULL_BLOCKER',
  MOVING_VEHICLE: 'MOVING_VEHICLE',
  STATION_PROP: 'STATION_PROP',
} as const;
export type ObstacleKind = (typeof ObstacleKind)[keyof typeof ObstacleKind];

export const PowerUpKind = {
  MAGNET: 'MAGNET',
  SHIELD: 'SHIELD',
  SCORE_BOOST: 'SCORE_BOOST',
  HOVER: 'HOVER',
} as const;
export type PowerUpKind = (typeof PowerUpKind)[keyof typeof PowerUpKind];

export const BiomeKind = {
  CITY_DAY: 'CITY_DAY',
  TUNNEL: 'TUNNEL',
  METRO_STATION: 'METRO_STATION',
  INDUSTRIAL: 'INDUSTRIAL',
  NIGHT_CITY: 'NIGHT_CITY',
  BRIDGE: 'BRIDGE',
} as const;
export type BiomeKind = (typeof BiomeKind)[keyof typeof BiomeKind];

export interface QualitySettings {
  shadows: boolean;
  particleMultiplier: number;
  pixelRatioCap: number;
  drawDistance: number;
  envDetail: number;
}

export type QualityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  quality: QualityLevel;
  swipeSensitivity: number;
}

export interface SaveData {
  highScore: number;
  bestDistance: number;
  lifetimeCoins: number;
  settings: GameSettings;
  unlocks: string[];
  selectedCosmetic: string;
}

export interface RunStats {
  score: number;
  coins: number;
  distance: number;
  multiplier: number;
  isNewHighScore: boolean;
}
