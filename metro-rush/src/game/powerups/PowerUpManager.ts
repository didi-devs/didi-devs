import * as THREE from 'three';
import { LANE_INDICES, LANE_WIDTH, SPAWN } from '../config/GameConfig';
import { PowerUpKind } from '../types/Types';
import { ObjectPool } from '../utils/ObjectPool';

export interface ActivePowerUp {
  mesh: THREE.Object3D;
  kind: PowerUpKind;
  lane: number;
  worldZ: number;
  collected: boolean;
  phase: number;
}

const ICON_COLORS: Record<PowerUpKind, number> = {
  [PowerUpKind.MAGNET]: 0xff5cf0,
  [PowerUpKind.SHIELD]: 0x5cc9ff,
  [PowerUpKind.SCORE_BOOST]: 0xffd35c,
  [PowerUpKind.HOVER]: 0x5cffb0,
};

function buildPowerUpMesh(kind: PowerUpKind): THREE.Object3D {
  const g = new THREE.Group();
  const color = ICON_COLORS[kind];
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.4,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 10, 20), mat);
  g.add(ring);

  let core: THREE.Mesh;
  switch (kind) {
    case PowerUpKind.MAGNET:
      core = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.09, 8, 6, Math.PI), mat);
      break;
    case PowerUpKind.SHIELD:
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat);
      break;
    case PowerUpKind.SCORE_BOOST:
      core = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), mat);
      break;
    case PowerUpKind.HOVER:
      core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat);
      break;
  }
  g.add(core);
  return g;
}

/**
 * World pickups for power-ups. Activation/duration/HUD logic lives in
 * Game, this manager only owns spawning, idle animation and pooling.
 */
export class PowerUpManager {
  private pools: Record<PowerUpKind, ObjectPool<THREE.Object3D>>;
  private active: ActivePowerUp[] = [];
  private lastSpawnWorldZ = -Infinity;

  constructor(scene: THREE.Scene) {
    this.pools = {} as Record<PowerUpKind, ObjectPool<THREE.Object3D>>;
    for (const kind of Object.values(PowerUpKind)) {
      this.pools[kind] = new ObjectPool<THREE.Object3D>(
        () => {
          const mesh = buildPowerUpMesh(kind);
          mesh.visible = false;
          scene.add(mesh);
          return mesh;
        },
        (mesh) => {
          mesh.visible = false;
          mesh.scale.set(1, 1, 1);
        },
        2,
      );
    }
  }

  canSpawnAt(worldZ: number, minGap: number): boolean {
    return worldZ - this.lastSpawnWorldZ >= minGap;
  }

  spawn(kind: PowerUpKind, lane: number, worldZ: number): void {
    const mesh = this.pools[kind].acquire();
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    mesh.position.set(LANE_INDICES[lane + 1] * LANE_WIDTH, 1.1, worldZ);
    this.active.push({ mesh, kind, lane, worldZ, collected: false, phase: Math.random() * 10 });
    this.lastSpawnWorldZ = worldZ;
  }

  update(dt: number, distanceTraveled: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (p.collected) {
        p.mesh.scale.multiplyScalar(1 - dt * 9);
        if (p.mesh.scale.x < 0.05) {
          this.pools[p.kind].release(p.mesh);
          this.active.splice(i, 1);
        }
        continue;
      }
      const z = p.worldZ - distanceTraveled;
      p.mesh.position.z = z;
      p.phase += dt * 2;
      p.mesh.rotation.y = p.phase;
      p.mesh.position.y = 1.1 + Math.sin(p.phase * 1.6) * 0.08;

      if (z < -SPAWN.DESPAWN_DISTANCE) {
        this.pools[p.kind].release(p.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  collect(p: ActivePowerUp): void {
    p.collected = true;
  }

  getActive(): readonly ActivePowerUp[] {
    return this.active;
  }

  reset(): void {
    for (const p of this.active) this.pools[p.kind].release(p.mesh);
    this.active = [];
    this.lastSpawnWorldZ = -Infinity;
  }
}
