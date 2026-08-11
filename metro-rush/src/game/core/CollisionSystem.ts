import { COIN, SCORE } from '../config/GameConfig';
import { PlayerState } from '../types/Types';
import type { PlayerController } from '../player/PlayerController';
import type { ObstacleManager, ActiveObstacle } from '../obstacles/ObstacleManager';
import type { CoinManager } from '../collectibles/CoinManager';
import type { PowerUpManager, ActivePowerUp } from '../powerups/PowerUpManager';
import { OBSTACLE_DEFS } from '../obstacles/ObstacleTypes';

export interface CollisionResult {
  coinsCollected: number;
  powerUpsCollected: ActivePowerUp[];
  hitObstacle: ActiveObstacle | null;
  shieldAbsorbed: boolean;
  nearMisses: number;
}

const NEAR_MISS_LANE_THRESHOLD = 0.35; // meters of x-distance considered "close"
const NEAR_MISS_Z_RANGE = 1.4;

/**
 * Lightweight, gameplay-tuned collision checks. Uses lane-aware broad
 * phase (only test obstacles/coins near the player's Z) then simple
 * AABB-vs-capsule-ish overlap using intentionally forgiving hitboxes
 * rather than raw visual bounding boxes.
 */
export class CollisionSystem {
  private nearMissCooldown = 0;

  reset(): void {
    this.nearMissCooldown = 0;
  }

  update(
    dt: number,
    player: PlayerController,
    obstacles: ObstacleManager,
    coins: CoinManager,
    powerUps: PowerUpManager,
  ): CollisionResult {
    this.nearMissCooldown = Math.max(0, this.nearMissCooldown - dt);
    const result: CollisionResult = {
      coinsCollected: 0,
      powerUpsCollected: [],
      hitObstacle: null,
      shieldAbsorbed: false,
      nearMisses: 0,
    };

    const hitbox = player.getHitbox();
    const px = player.worldX;
    const py = player.group.position.y;

    // Coins
    for (const coin of coins.getActive()) {
      if (coin.collected) continue;
      const dx = coin.mesh.position.x - px;
      const dy = coin.mesh.position.y - (py + 0.9);
      const dz = coin.mesh.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < COIN.COLLECT_RADIUS * COIN.COLLECT_RADIUS) {
        coins.collect(coin);
        result.coinsCollected++;
      }
    }

    // Power-ups
    for (const p of powerUps.getActive()) {
      if (p.collected) continue;
      const dx = p.mesh.position.x - px;
      const dy = p.mesh.position.y - (py + 0.9);
      const dz = p.mesh.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 1.1 * 1.1) {
        powerUps.collect(p);
        result.powerUpsCollected.push(p);
      }
    }

    // Obstacles
    if (player.state !== PlayerState.DEAD) {
      for (const o of obstacles.getActive()) {
        const def = OBSTACLE_DEFS[o.kind];
        const dz = Math.abs(o.mesh.position.z);
        if (dz > 2.5) continue; // broad phase: only test near player

        const dx = o.mesh.position.x - px;
        const overlapX = Math.abs(dx) < def.hitboxHalfExtents.x + hitbox.radius;
        const overlapZ = dz < def.hitboxHalfExtents.z + hitbox.radius;

        const obstacleTop = def.hitboxCenterY + def.hitboxHalfExtents.y;
        const obstacleBottom = def.hitboxCenterY - def.hitboxHalfExtents.y;
        const playerTop = hitbox.centerY + hitbox.height / 2;
        const playerBottom = hitbox.centerY - hitbox.height / 2;
        const overlapY = playerTop > obstacleBottom && playerBottom < obstacleTop;

        if (overlapX && overlapZ && overlapY) {
          result.hitObstacle = o;
          break;
        } else if (overlapZ && !overlapX && dz < NEAR_MISS_Z_RANGE) {
          const closeness = Math.abs(dx) - (def.hitboxHalfExtents.x + hitbox.radius);
          if (closeness >= 0 && closeness < NEAR_MISS_LANE_THRESHOLD && this.nearMissCooldown <= 0) {
            result.nearMisses++;
            this.nearMissCooldown = SCORE.NEAR_MISS_COOLDOWN;
          }
        }
      }
    }

    return result;
  }
}
