import * as THREE from 'three';
import { LANE_INDICES, LANE_WIDTH, SPAWN } from '../config/GameConfig';
import { ObstacleKind } from '../types/Types';
import { ObjectPool } from '../utils/ObjectPool';
import { OBSTACLE_DEFS } from './ObstacleTypes';

export interface ActiveObstacle {
  mesh: THREE.Object3D;
  kind: ObstacleKind;
  lane: number;
  worldZ: number;
  /** For MOVING_VEHICLE: lane oscillation state */
  laneFrom: number;
  laneTo: number;
  laneT: number;
  laneSwapTimer: number;
  scored: boolean; // near-miss already awarded
}

/**
 * Spawns, updates and recycles obstacle meshes using per-kind object
 * pools so long runs never trigger GC pressure from mesh creation.
 */
export class ObstacleManager {
  private pools: Record<ObstacleKind, ObjectPool<THREE.Object3D>>;
  private active: ActiveObstacle[] = [];

  constructor(scene: THREE.Scene) {
    this.pools = {} as Record<ObstacleKind, ObjectPool<THREE.Object3D>>;
    for (const kind of Object.values(ObstacleKind)) {
      const def = OBSTACLE_DEFS[kind];
      this.pools[kind] = new ObjectPool<THREE.Object3D>(
        () => {
          const mesh = def.buildMesh();
          mesh.visible = false;
          scene.add(mesh);
          return mesh;
        },
        (mesh) => {
          mesh.visible = false;
        },
        4,
      );
    }
  }

  spawn(kind: ObstacleKind, lane: number, worldZ: number): ActiveObstacle {
    const mesh = this.pools[kind].acquire();
    mesh.visible = true;
    mesh.position.set(LANE_INDICES[lane + 1] * LANE_WIDTH, 0, worldZ);
    const obstacle: ActiveObstacle = {
      mesh,
      kind,
      lane,
      worldZ,
      laneFrom: lane,
      laneTo: lane,
      laneT: 1,
      laneSwapTimer: 1.4 + Math.random() * 1.2,
      scored: false,
    };
    this.active.push(obstacle);
    return obstacle;
  }

  update(dt: number, distanceTraveled: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      const z = o.worldZ - distanceTraveled;
      o.mesh.position.z = z;

      if (o.kind === ObstacleKind.MOVING_VEHICLE) {
        o.laneSwapTimer -= dt;
        if (o.laneSwapTimer <= 0 && o.laneT >= 1) {
          o.laneFrom = o.laneTo;
          let next = o.laneTo + (Math.random() > 0.5 ? 1 : -1);
          if (next < -1 || next > 1) next = -next;
          o.laneTo = next;
          o.laneT = 0;
          o.laneSwapTimer = 1.6 + Math.random() * 1.4;
        }
        if (o.laneT < 1) {
          o.laneT = Math.min(1, o.laneT + dt / 0.9);
          const fromX = LANE_INDICES[o.laneFrom + 1] * LANE_WIDTH;
          const toX = LANE_INDICES[o.laneTo + 1] * LANE_WIDTH;
          const eased = o.laneT * o.laneT * (3 - 2 * o.laneT);
          o.mesh.position.x = fromX + (toX - fromX) * eased;
          o.lane = o.laneT > 0.5 ? o.laneTo : o.laneFrom;
        }
      }

      if (z < -SPAWN.DESPAWN_DISTANCE) {
        this.pools[o.kind].release(o.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  getActive(): readonly ActiveObstacle[] {
    return this.active;
  }

  reset(): void {
    for (const o of this.active) {
      this.pools[o.kind].release(o.mesh);
    }
    this.active = [];
  }

  get activeCount(): number {
    return this.active.length;
  }
}
