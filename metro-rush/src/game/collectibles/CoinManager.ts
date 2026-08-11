import * as THREE from 'three';
import { COIN, LANE_INDICES, LANE_WIDTH, SPAWN } from '../config/GameConfig';
import { ObjectPool } from '../utils/ObjectPool';
import { damp } from '../utils/MathUtils';

export interface ActiveCoin {
  mesh: THREE.Mesh;
  lane: number;
  worldZ: number;
  baseY: number;
  phase: number;
  collected: boolean;
  attracted: boolean;
}

const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({
  color: 0xffd35c,
  emissive: 0x6b4c00,
  emissiveIntensity: 0.4,
  metalness: 0.7,
  roughness: 0.25,
});

/**
 * Manages coin pickups: pooled meshes, spin/bob idle animation, magnet
 * attraction, and collection with smooth pop-out rather than instant
 * disappearance.
 */
export class CoinManager {
  private pool: ObjectPool<THREE.Mesh>;
  private active: ActiveCoin[] = [];

  constructor(scene: THREE.Scene) {
    this.pool = new ObjectPool<THREE.Mesh>(
      () => {
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        mesh.visible = false;
        mesh.castShadow = false;
        scene.add(mesh);
        return mesh;
      },
      (mesh) => {
        mesh.visible = false;
        mesh.scale.set(1, 1, 1);
      },
      40,
    );
  }

  spawn(lane: number, worldZ: number, height = 1): void {
    const mesh = this.pool.acquire();
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    const x = LANE_INDICES[lane + 1] * LANE_WIDTH;
    mesh.position.set(x, height, worldZ);
    this.active.push({
      mesh,
      lane,
      worldZ,
      baseY: height,
      phase: Math.random() * Math.PI * 2,
      collected: false,
      attracted: false,
    });
  }

  /** Spawns a straight trail of coins along one lane. */
  spawnTrail(lane: number, startZ: number, count: number, spacing: number, height = 1): void {
    for (let i = 0; i < count; i++) {
      this.spawn(lane, startZ + i * spacing, height);
    }
  }

  /** Spawns an arc of coins (for jump patterns). */
  spawnArc(lane: number, startZ: number, count: number, spacing: number, peakHeight: number): void {
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1 || 1);
      const arc = Math.sin(t * Math.PI) * peakHeight;
      this.spawn(lane, startZ + i * spacing, 1 + arc);
    }
  }

  update(dt: number, distanceTraveled: number, playerPos: THREE.Vector3, magnetActive: boolean): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];

      if (c.collected) {
        c.mesh.scale.multiplyScalar(1 - dt * 10);
        c.mesh.position.y += dt * 3;
        if (c.mesh.scale.x < 0.05) {
          this.pool.release(c.mesh);
          this.active.splice(i, 1);
        }
        continue;
      }

      const z = c.worldZ - distanceTraveled;
      c.phase += dt * COIN.SPIN_SPEED;
      c.mesh.rotation.y = c.phase;

      if (magnetActive) {
        const dx = playerPos.x - c.mesh.position.x;
        const dz = playerPos.z - z;
        const dist = Math.hypot(dx, dz);
        if (dist < COIN.MAGNET_RADIUS) {
          c.attracted = true;
        }
      }

      if (c.attracted) {
        const targetX = playerPos.x;
        const targetY = playerPos.y + 1;
        c.mesh.position.x = damp(c.mesh.position.x, targetX, COIN.MAGNET_PULL_SPEED, dt);
        c.mesh.position.y = damp(c.mesh.position.y, targetY, COIN.MAGNET_PULL_SPEED, dt);
        c.mesh.position.z = damp(z, playerPos.z, COIN.MAGNET_PULL_SPEED, dt);
        // worldZ must track so the despawn/z calc stays correct next frame
        c.worldZ = c.mesh.position.z + distanceTraveled;
      } else {
        c.mesh.position.z = z;
        c.mesh.position.y = c.baseY + Math.sin(c.phase * (COIN.BOB_SPEED / COIN.SPIN_SPEED)) * COIN.BOB_HEIGHT;
      }

      if (z < -SPAWN.DESPAWN_DISTANCE) {
        this.pool.release(c.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  collect(coin: ActiveCoin): void {
    coin.collected = true;
  }

  getActive(): readonly ActiveCoin[] {
    return this.active;
  }

  reset(): void {
    for (const c of this.active) this.pool.release(c.mesh);
    this.active = [];
  }

  get activeCount(): number {
    return this.active.length;
  }
}
