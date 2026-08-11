/**
 * Central tuning configuration for Metro Rush.
 * All gameplay-affecting magic numbers live here so the game can be
 * balanced without hunting through the codebase.
 */

export const LANE_COUNT = 3;
export const LANE_WIDTH = 2.4;
/** World X position of lanes: [-1, 0, 1] * LANE_WIDTH */
export const LANE_INDICES = [-1, 0, 1] as const;

export const MOVEMENT = {
  LANE_CHANGE_DURATION: 0.16, // seconds to interpolate one lane
  LANE_CHANGE_BUFFER_WINDOW: 0.12, // s of input buffering before action is valid
  LEAN_MAX_ANGLE: 0.32, // radians of body lean during lane change
  LEAN_RECOVERY_SPEED: 8,
  BANK_MAX_ANGLE: 0.22,
};

export const JUMP = {
  FORCE: 8.6,
  GRAVITY: -26,
  MAX_FALL_SPEED: -30,
  COYOTE_TIME: 0.09, // s after leaving ground state a jump still registers
  BUFFER_TIME: 0.14, // s before landing a jump input is still remembered
  LAND_COMPRESSION: 0.22, // squash amount on landing
  LAND_COMPRESSION_RECOVERY: 10,
};

export const SLIDE = {
  DURATION: 0.62, // seconds
  HEIGHT_SCALE: 0.42, // vertical scale of collider/body while sliding
  BUFFER_TIME: 0.14,
};

export const SPEED = {
  INITIAL: 9.5,
  MAX: 26,
  ACCELERATION_PER_SEC: 0.045, // additive speed gain per second survived
  DISTANCE_TO_MAX: 3200, // meters of distance to approach max speed
};

export const SPAWN = {
  CHUNK_LENGTH: 16, // meters per generated chunk
  SPAWN_DISTANCE: 140, // meters ahead of player to keep generated
  DESPAWN_DISTANCE: 24, // meters behind player before recycle
  ACTIVE_CHUNKS_AHEAD: 10,
};

export const COIN = {
  VALUE: 1,
  SPIN_SPEED: 3.4,
  BOB_SPEED: 4,
  BOB_HEIGHT: 0.08,
  MAGNET_RADIUS: 6.5,
  MAGNET_PULL_SPEED: 18,
  COLLECT_RADIUS: 1.05,
};

export const SCORE = {
  DISTANCE_PER_POINT: 1, // 1 point per meter
  MULTIPLIER_STEP_DISTANCE: 400, // meters between multiplier increases
  MULTIPLIER_MAX: 8,
  NEAR_MISS_BONUS: 25,
  NEAR_MISS_COOLDOWN: 0.6,
};

export const POWERUP = {
  MAGNET_DURATION: 9,
  SHIELD_DURATION: 12,
  SCORE_BOOST_DURATION: 10,
  SCORE_BOOST_MULTIPLIER: 2,
  HOVER_DURATION: 8,
  SPAWN_MIN_GAP: 22, // meters between powerup spawns
  SPAWN_CHANCE: 0.35,
};

export const CAMERA = {
  BASE_DISTANCE: 6.8,
  BASE_HEIGHT: 3.4,
  LOOK_AHEAD: 4.5,
  FOLLOW_LERP: 6.5,
  LANE_REACT: 0.35,
  JUMP_LIFT: 0.55,
  LAND_DIP: 0.35,
  BASE_FOV: 62,
  MAX_FOV_BONUS: 9,
  SHAKE_DECAY: 4.5,
};

export const DIFFICULTY = {
  DISTANCE_EASY_END: 400,
  DISTANCE_MEDIUM_END: 1400,
  DISTANCE_HARD_END: 3000,
  PACING_WAVE_LENGTH: 550, // meters per intensity oscillation
  PACING_WAVE_STRENGTH: 0.22,
};

export const PLAYER_COLLISION = {
  RUN_RADIUS: 0.42,
  RUN_HEIGHT: 1.7,
  SLIDE_HEIGHT: 0.85,
  FORGIVENESS: 0.86, // multiplier shrinking effective hitbox for fairness
};

export const STORAGE_KEYS = {
  HIGH_SCORE: 'metroRush.highScore',
  BEST_DISTANCE: 'metroRush.bestDistance',
  LIFETIME_COINS: 'metroRush.lifetimeCoins',
  SETTINGS: 'metroRush.settings',
  UNLOCKS: 'metroRush.unlocks',
};

export const QUALITY_PRESETS = {
  LOW: {
    shadows: false,
    particleMultiplier: 0.35,
    pixelRatioCap: 1,
    drawDistance: 90,
    envDetail: 0.4,
  },
  MEDIUM: {
    shadows: true,
    particleMultiplier: 0.7,
    pixelRatioCap: 1.5,
    drawDistance: 140,
    envDetail: 0.7,
  },
  HIGH: {
    shadows: true,
    particleMultiplier: 1,
    pixelRatioCap: 2,
    drawDistance: 200,
    envDetail: 1,
  },
} as const;
