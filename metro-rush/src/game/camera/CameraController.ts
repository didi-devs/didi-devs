import * as THREE from 'three';
import { CAMERA, SPEED } from '../config/GameConfig';
import { clamp, damp } from '../utils/MathUtils';
import type { PlayerController } from '../player/PlayerController';

/**
 * Polished third-person chase camera: smooth follow, speed-reactive FOV,
 * lane-change reaction, jump lift / landing dip, and decaying shake.
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  private shakeStrength = 0;
  private lookAtTarget = new THREE.Vector3();
  private currentLookAhead = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.BASE_FOV, aspect, 0.1, 400);
    this.camera.position.set(0, CAMERA.BASE_HEIGHT, CAMERA.BASE_DISTANCE);
  }

  addShake(amount: number): void {
    this.shakeStrength = Math.min(1.2, this.shakeStrength + amount);
  }

  reset(player: PlayerController): void {
    this.shakeStrength = 0;
    const p = player.group.position;
    this.camera.position.set(p.x, p.y + CAMERA.BASE_HEIGHT, p.z + CAMERA.BASE_DISTANCE);
    this.lookAtTarget.set(p.x, p.y + 1, p.z - CAMERA.LOOK_AHEAD);
    this.camera.lookAt(this.lookAtTarget);
  }

  update(dt: number, player: PlayerController, speed: number): void {
    const p = player.group.position;
    const speedRatio = clamp((speed - SPEED.INITIAL) / (SPEED.MAX - SPEED.INITIAL), 0, 1);

    const targetDistance = CAMERA.BASE_DISTANCE + speedRatio * 0.8;
    const targetHeight = CAMERA.BASE_HEIGHT + Math.max(0, p.y) * 0.35;

    const laneReact = p.x * CAMERA.LANE_REACT * 0.15;

    const jumpLift = Math.max(0, p.y) * CAMERA.JUMP_LIFT * 0.2;

    const targetX = p.x * 0.4 + laneReact;
    const targetY = p.y + targetHeight + jumpLift;
    const targetZ = p.z + targetDistance;

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeStrength > 0.001) {
      shakeX = (Math.random() - 0.5) * this.shakeStrength * 0.3;
      shakeY = (Math.random() - 0.5) * this.shakeStrength * 0.3;
      this.shakeStrength = damp(this.shakeStrength, 0, CAMERA.SHAKE_DECAY, dt);
    }

    this.camera.position.x = damp(this.camera.position.x, targetX + shakeX, CAMERA.FOLLOW_LERP, dt);
    this.camera.position.y = damp(this.camera.position.y, targetY + shakeY, CAMERA.FOLLOW_LERP * 0.9, dt);
    this.camera.position.z = damp(this.camera.position.z, targetZ, CAMERA.FOLLOW_LERP, dt);

    this.currentLookAhead = damp(this.currentLookAhead, CAMERA.LOOK_AHEAD + speedRatio * 3, 4, dt);
    this.lookAtTarget.set(p.x * 0.6, p.y + 1.1, p.z - this.currentLookAhead);
    this.camera.lookAt(this.lookAtTarget);

    const targetFov = CAMERA.BASE_FOV + speedRatio * CAMERA.MAX_FOV_BONUS;
    this.camera.fov = damp(this.camera.fov, targetFov, 3, dt);
    this.camera.updateProjectionMatrix();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
