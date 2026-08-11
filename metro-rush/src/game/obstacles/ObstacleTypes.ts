import * as THREE from 'three';
import { ObstacleKind } from '../types/Types';

export interface ObstacleDef {
  kind: ObstacleKind;
  /** true if the player must jump or change lane to survive (ground-level solid) */
  requiresJumpOrLane: boolean;
  /** true if the player must slide or change lane (overhead solid) */
  requiresSlideOrLane: boolean;
  /** true if the lane must be vacated entirely (no jump/slide saves you) */
  requiresLaneChange: boolean;
  hitboxHalfExtents: THREE.Vector3;
  hitboxCenterY: number;
  buildMesh: () => THREE.Object3D;
}

const barrierMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.55, metalness: 0.1 });
const stripeMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x332200,
  roughness: 0.4,
});
const overheadMat = new THREE.MeshStandardMaterial({ color: 0x3d6bff, roughness: 0.4, metalness: 0.2 });
const blockerMat = new THREE.MeshStandardMaterial({ color: 0x545c6b, roughness: 0.7 });
const vehicleMat = new THREE.MeshStandardMaterial({ color: 0xffd23d, roughness: 0.35, metalness: 0.3 });
const propMat = new THREE.MeshStandardMaterial({ color: 0x8a94a6, roughness: 0.8 });

function buildGroundBarrier(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.5), barrierMat);
  body.position.y = 0.375;
  body.castShadow = true;
  g.add(body);
  for (let i = -1; i <= 1; i += 2) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.52), stripeMat);
    stripe.position.set(i * 0.4, 0.55, 0);
    g.add(stripe);
  }
  return g;
}

function buildOverheadBarrier(): THREE.Object3D {
  const g = new THREE.Group();
  const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 8), overheadMat);
  leftPost.position.set(-1.0, 0.95, 0);
  leftPost.castShadow = true;
  const rightPost = leftPost.clone();
  rightPost.position.x = 1.0;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 0.4), overheadMat);
  beam.position.y = 1.55;
  beam.castShadow = true;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.06), stripeMat);
  sign.position.set(0, 1.55, 0.25);
  g.add(leftPost, rightPost, beam, sign);
  return g;
}

function buildFullBlocker(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 0.6), blockerMat);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const hazard = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.25, 0.62), stripeMat);
  hazard.position.y = 1.6;
  g.add(hazard);
  return g;
}

function buildMovingVehicle(): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 3.2), vehicleMat);
  body.position.y = 0.65;
  body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 1.2), vehicleMat);
  cab.position.set(0, 1.25, -0.6);
  const lightGeo = new THREE.SphereGeometry(0.1, 6, 6);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 });
  const l1 = new THREE.Mesh(lightGeo, lightMat);
  l1.position.set(-0.55, 0.65, 1.62);
  const l2 = l1.clone();
  l2.position.x = 0.55;
  g.add(body, cab, l1, l2);
  return g;
}

function buildStationProp(): THREE.Object3D {
  const g = new THREE.Group();
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.5), propMat);
  bench.position.y = 0.4;
  bench.castShadow = true;
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.08), propMat);
  backrest.position.set(0, 0.65, -0.2);
  g.add(bench, backrest);
  return g;
}

export const OBSTACLE_DEFS: Record<ObstacleKind, ObstacleDef> = {
  [ObstacleKind.GROUND_BARRIER]: {
    kind: ObstacleKind.GROUND_BARRIER,
    requiresJumpOrLane: true,
    requiresSlideOrLane: false,
    requiresLaneChange: false,
    hitboxHalfExtents: new THREE.Vector3(0.7, 0.4, 0.28),
    hitboxCenterY: 0.4,
    buildMesh: buildGroundBarrier,
  },
  [ObstacleKind.OVERHEAD_BARRIER]: {
    kind: ObstacleKind.OVERHEAD_BARRIER,
    requiresJumpOrLane: false,
    requiresSlideOrLane: true,
    requiresLaneChange: false,
    hitboxHalfExtents: new THREE.Vector3(1.05, 0.35, 0.25),
    hitboxCenterY: 1.4,
    buildMesh: buildOverheadBarrier,
  },
  [ObstacleKind.FULL_BLOCKER]: {
    kind: ObstacleKind.FULL_BLOCKER,
    requiresJumpOrLane: false,
    requiresSlideOrLane: false,
    requiresLaneChange: true,
    hitboxHalfExtents: new THREE.Vector3(1.0, 1.0, 0.3),
    hitboxCenterY: 1.0,
    buildMesh: buildFullBlocker,
  },
  [ObstacleKind.MOVING_VEHICLE]: {
    kind: ObstacleKind.MOVING_VEHICLE,
    requiresJumpOrLane: false,
    requiresSlideOrLane: false,
    requiresLaneChange: true,
    hitboxHalfExtents: new THREE.Vector3(0.8, 0.55, 1.55),
    hitboxCenterY: 0.65,
    buildMesh: buildMovingVehicle,
  },
  [ObstacleKind.STATION_PROP]: {
    kind: ObstacleKind.STATION_PROP,
    requiresJumpOrLane: true,
    requiresSlideOrLane: false,
    requiresLaneChange: false,
    hitboxHalfExtents: new THREE.Vector3(0.65, 0.35, 0.3),
    hitboxCenterY: 0.35,
    buildMesh: buildStationProp,
  },
};
