import * as THREE from 'three';
import { JUMP, LANE_INDICES, LANE_WIDTH, MOVEMENT, PLAYER_COLLISION, SLIDE } from '../config/GameConfig';
import { PlayerState } from '../types/Types';
import { clamp, damp } from '../utils/MathUtils';
import { PlayerStateMachine } from './PlayerStateMachine';
import { buildPlayerModel, type PlayerLimbs } from './PlayerModel';
import type { AudioManager } from '../audio/AudioManager';
import type { ParticleManager } from '../effects/ParticleManager';

export interface PlayerHitbox {
  radius: number;
  height: number;
  centerY: number;
}

/**
 * Owns player transform, lane logic, jump/slide physics, procedural
 * limb animation and the finite state machine. All movement is
 * delta-time based for frame-rate independence.
 */
export class PlayerController {
  readonly group: THREE.Group;
  readonly limbs: PlayerLimbs;
  readonly stateMachine = new PlayerStateMachine();

  private lane = 0; // -1, 0, 1
  private laneChangeFrom = 0;
  private laneChangeProgress = 1; // 1 = settled
  private laneChangeDir = 0;

  private velocityY = 0;
  private groundY = 0;
  private airborne = false;

  private slideTimer = 0;
  private stumbleTimer = 0;

  private leanAngle = 0;
  private bankAngle = 0;
  private bodyBob = 0;
  private squash = 1;
  private landingCompression = 0;

  private jumpBufferTimer = -1;
  private slideBufferTimer = -1;
  private laneBuffer: { dir: number; timer: number } | null = null;
  private coyoteTimer = 0;

  private runCycleTime = 0;
  private isMagnetized = false;
  private hasShield = false;

  private audio: AudioManager;
  private particles: ParticleManager;

  constructor(audio: AudioManager, particles: ParticleManager, paletteId = 'default') {
    this.audio = audio;
    this.particles = particles;
    this.limbs = buildPlayerModel(paletteId);
    this.group = this.limbs.root;
    this.group.position.set(0, 0, 0);

    this.stateMachine.onChange((prev, next) => this.handleStateChange(prev, next));
  }

  reset(): void {
    this.lane = 0;
    this.laneChangeFrom = 0;
    this.laneChangeProgress = 1;
    this.laneChangeDir = 0;
    this.velocityY = 0;
    this.airborne = false;
    this.slideTimer = 0;
    this.stumbleTimer = 0;
    this.leanAngle = 0;
    this.bankAngle = 0;
    this.squash = 1;
    this.landingCompression = 0;
    this.jumpBufferTimer = -1;
    this.slideBufferTimer = -1;
    this.laneBuffer = null;
    this.coyoteTimer = 0;
    this.isMagnetized = false;
    this.hasShield = false;
    this.stateMachine.reset();
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);
  }

  get currentLane(): number {
    return this.lane;
  }

  get worldX(): number {
    return this.group.position.x;
  }

  get state(): PlayerState {
    return this.stateMachine.current;
  }

  setShield(active: boolean): void {
    this.hasShield = active;
  }

  get shielded(): boolean {
    return this.hasShield;
  }

  setMagnetized(active: boolean): void {
    this.isMagnetized = active;
  }

  get magnetized(): boolean {
    return this.isMagnetized;
  }

  // -------------------------------------------------------------------
  // Input intents (called from Game on discrete input actions)
  // -------------------------------------------------------------------

  requestLaneChange(dir: -1 | 1): void {
    const state = this.stateMachine.current;
    if (state === PlayerState.DEAD || state === PlayerState.STUMBLING) return;
    const targetLane = clamp(this.lane + dir, -1, 1);
    if (targetLane === this.lane) return; // at edge, buffering wouldn't help
    this.laneBuffer = { dir, timer: MOVEMENT.LANE_CHANGE_BUFFER_WINDOW };
  }

  requestJump(): void {
    if (this.stateMachine.current === PlayerState.DEAD) return;
    this.jumpBufferTimer = JUMP.BUFFER_TIME;
  }

  requestSlide(): void {
    if (this.stateMachine.current === PlayerState.DEAD) return;
    this.slideBufferTimer = SLIDE.BUFFER_TIME;
  }

  // -------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------

  update(dt: number): void {
    this.stateMachine.update(dt);
    this.updateBuffers(dt);
    this.updateLaneChange(dt);
    this.updateVertical(dt);
    this.updateSlide(dt);
    this.updateStumble(dt);
    this.applyBuffered();
    this.animate(dt);
  }

  private updateBuffers(dt: number): void {
    if (this.jumpBufferTimer >= 0) this.jumpBufferTimer -= dt;
    if (this.slideBufferTimer >= 0) this.slideBufferTimer -= dt;
    if (this.laneBuffer) {
      this.laneBuffer.timer -= dt;
      if (this.laneBuffer.timer < 0) this.laneBuffer = null;
    }
    if (!this.airborne) this.coyoteTimer = JUMP.COYOTE_TIME;
    else this.coyoteTimer -= dt;
  }

  private applyBuffered(): void {
    const state = this.stateMachine.current;

    if (this.laneBuffer && this.laneChangeProgress >= 1 && state !== PlayerState.DEAD && state !== PlayerState.STUMBLING) {
      const dir = this.laneBuffer.dir;
      const targetLane = clamp(this.lane + dir, -1, 1);
      if (targetLane !== this.lane) {
        this.laneChangeFrom = this.lane;
        this.lane = targetLane;
        this.laneChangeProgress = 0;
        this.laneChangeDir = dir;
        this.laneBuffer = null;
        this.audio.playSfx('laneChange');
        if (state === PlayerState.RUNNING) {
          this.stateMachine.transition(PlayerState.LANE_CHANGING);
        }
      } else {
        this.laneBuffer = null;
      }
    }

    if (
      this.jumpBufferTimer >= 0 &&
      !this.airborne &&
      this.coyoteTimer >= 0 &&
      state !== PlayerState.SLIDING &&
      state !== PlayerState.DEAD &&
      state !== PlayerState.STUMBLING
    ) {
      this.jumpBufferTimer = -1;
      this.slideBufferTimer = -1;
      this.velocityY = JUMP.FORCE;
      this.airborne = true;
      this.stateMachine.transition(PlayerState.JUMPING);
      this.audio.playSfx('jump');
      this.particles.burst('dust', this.footPosition(), 6, 1, 2, 0.4);
    } else if (
      this.slideBufferTimer >= 0 &&
      !this.airborne &&
      state !== PlayerState.SLIDING &&
      state !== PlayerState.DEAD &&
      state !== PlayerState.STUMBLING
    ) {
      this.slideBufferTimer = -1;
      this.jumpBufferTimer = -1;
      this.slideTimer = SLIDE.DURATION;
      this.stateMachine.transition(PlayerState.SLIDING);
      this.audio.playSfx('slide');
    }
  }

  private updateLaneChange(dt: number): void {
    if (this.laneChangeProgress < 1) {
      this.laneChangeProgress = Math.min(1, this.laneChangeProgress + dt / MOVEMENT.LANE_CHANGE_DURATION);
      if (this.laneChangeProgress >= 1 && this.stateMachine.current === PlayerState.LANE_CHANGING) {
        this.stateMachine.transition(PlayerState.RUNNING);
      }
    }

    const fromX = LANE_INDICES[this.laneChangeFrom + 1] * LANE_WIDTH;
    const toX = LANE_INDICES[this.lane + 1] * LANE_WIDTH;
    const eased = 1 - Math.pow(1 - this.laneChangeProgress, 3);
    const x = fromX + (toX - fromX) * eased;
    this.group.position.x = x;

    const targetLean = this.laneChangeProgress < 1 ? this.laneChangeDir * MOVEMENT.LEAN_MAX_ANGLE : 0;
    const targetBank = this.laneChangeProgress < 1 ? -this.laneChangeDir * MOVEMENT.BANK_MAX_ANGLE : 0;
    this.leanAngle = damp(this.leanAngle, targetLean, MOVEMENT.LEAN_RECOVERY_SPEED, dt);
    this.bankAngle = damp(this.bankAngle, targetBank, MOVEMENT.LEAN_RECOVERY_SPEED, dt);
  }

  private updateVertical(dt: number): void {
    if (!this.airborne) return;
    this.velocityY += JUMP.GRAVITY * dt;
    this.velocityY = Math.max(this.velocityY, JUMP.MAX_FALL_SPEED);
    this.group.position.y += this.velocityY * dt;

    if (this.velocityY < 0 && this.stateMachine.current === PlayerState.JUMPING) {
      this.stateMachine.transition(PlayerState.FALLING);
    }

    if (this.group.position.y <= this.groundY) {
      this.group.position.y = this.groundY;
      this.velocityY = 0;
      this.airborne = false;
      this.landingCompression = JUMP.LAND_COMPRESSION;
      this.audio.playSfx('land');
      this.particles.burst('dust', this.footPosition(), 10, 1.6, 2.4, 0.45);
      if (this.stateMachine.current !== PlayerState.DEAD && this.stateMachine.current !== PlayerState.STUMBLING) {
        this.stateMachine.transition(PlayerState.RUNNING);
      }
    }
  }

  private updateSlide(dt: number): void {
    if (this.stateMachine.current !== PlayerState.SLIDING) return;
    this.slideTimer -= dt;
    if (this.slideTimer <= 0) {
      this.stateMachine.transition(PlayerState.RUNNING);
    }
  }

  private updateStumble(dt: number): void {
    if (this.stateMachine.current !== PlayerState.STUMBLING) return;
    this.stumbleTimer -= dt;
    if (this.stumbleTimer <= 0) {
      this.stateMachine.transition(PlayerState.RUNNING);
    }
  }

  private handleStateChange(_prev: PlayerState, next: PlayerState): void {
    if (next === PlayerState.STUMBLING) {
      this.stumbleTimer = 0.5;
    }
  }

  // -------------------------------------------------------------------
  // Reactions triggered externally (collision system)
  // -------------------------------------------------------------------

  triggerStumble(): void {
    if (this.stateMachine.current === PlayerState.DEAD) return;
    this.stateMachine.transition(PlayerState.STUMBLING);
  }

  triggerDeath(): void {
    this.stateMachine.transition(PlayerState.DEAD);
  }

  footPosition(): THREE.Vector3 {
    const p = this.group.position.clone();
    p.y += 0.05;
    return p;
  }

  chestPosition(): THREE.Vector3 {
    const p = this.group.position.clone();
    p.y += 1.1;
    return p;
  }

  getHitbox(): PlayerHitbox {
    const sliding = this.stateMachine.current === PlayerState.SLIDING;
    const height = sliding ? PLAYER_COLLISION.SLIDE_HEIGHT : PLAYER_COLLISION.RUN_HEIGHT;
    return {
      radius: PLAYER_COLLISION.RUN_RADIUS * PLAYER_COLLISION.FORGIVENESS,
      height: height * PLAYER_COLLISION.FORGIVENESS,
      centerY: this.group.position.y + height / 2,
    };
  }

  // -------------------------------------------------------------------
  // Procedural animation
  // -------------------------------------------------------------------

  private animate(dt: number): void {
    const state = this.stateMachine.current;
    const running = state === PlayerState.RUNNING || state === PlayerState.LANE_CHANGING;

    if (running || this.airborne) {
      this.runCycleTime += dt * (this.airborne ? 4 : 9);
    }

    this.landingCompression = damp(this.landingCompression, 0, JUMP.LAND_COMPRESSION_RECOVERY, dt);
    const targetSquashY = 1 - this.landingCompression;
    const targetSquashXZ = 1 + this.landingCompression * 0.6;
    this.squash = damp(this.squash, 1, 10, dt);

    this.group.rotation.z = this.bankAngle;
    this.group.rotation.y = this.leanAngle * 0.5;

    const t = this.runCycleTime;
    const swing = Math.sin(t);
    const swingAlt = Math.sin(t + Math.PI);

    if (state === PlayerState.SLIDING) {
      const slideProgress = 1 - clamp(this.slideTimer / SLIDE.DURATION, 0, 1);
      const easeIn = Math.min(1, slideProgress * 6);
      const easeOut = Math.min(1, (1 - slideProgress) * 6);
      const bend = Math.min(easeIn, easeOut);
      this.limbs.torso.rotation.x = bend * 1.15;
      this.limbs.head.parent!.rotation.x = bend * -0.5;
      this.group.scale.y = 1 - bend * (1 - SLIDE.HEIGHT_SCALE);
      this.limbs.leftArm.rotation.x = -bend * 1.2;
      this.limbs.rightArm.rotation.x = -bend * 1.2;
      this.limbs.leftLeg.rotation.x = bend * 0.6;
      this.limbs.rightLeg.rotation.x = -bend * 0.3;
    } else {
      this.limbs.torso.rotation.x = damp(this.limbs.torso.rotation.x, this.airborne ? 0.12 : 0.05, 10, dt);
      this.limbs.head.parent!.rotation.x = damp(this.limbs.head.parent!.rotation.x, 0, 10, dt);
      this.group.scale.y = damp(this.group.scale.y, targetSquashY, 12, dt);
      this.group.scale.x = damp(this.group.scale.x, targetSquashXZ, 12, dt);
      this.group.scale.z = damp(this.group.scale.z, targetSquashXZ, 12, dt);

      if (this.airborne) {
        const tuck = this.velocityY > 0 ? 0.6 : 0.2;
        this.limbs.leftLeg.rotation.x = -tuck;
        this.limbs.rightLeg.rotation.x = tuck * 0.6;
        this.limbs.leftArm.rotation.x = 0.4;
        this.limbs.rightArm.rotation.x = -0.6;
      } else {
        this.limbs.leftLeg.rotation.x = swing * 0.9;
        this.limbs.rightLeg.rotation.x = swingAlt * 0.9;
        this.limbs.leftArm.rotation.x = swingAlt * 0.7;
        this.limbs.rightArm.rotation.x = swing * 0.7;
        this.bodyBob = Math.abs(Math.sin(t * 2)) * 0.04;
      }
    }

    if (state === PlayerState.STUMBLING) {
      this.limbs.torso.rotation.x = damp(this.limbs.torso.rotation.x, -0.4, 14, dt);
      this.group.rotation.z = damp(this.group.rotation.z, (Math.random() - 0.5) * 0.3, 4, dt);
    }

    if (state === PlayerState.DEAD) {
      this.group.rotation.x = damp(this.group.rotation.x, Math.PI * 0.5, 6, dt);
      this.group.position.y = damp(this.group.position.y, this.groundY - 0.2, 6, dt);
    } else {
      this.group.rotation.x = damp(this.group.rotation.x, 0, 8, dt);
    }

    const hips = this.limbs.torso.parent!;
    if (state !== PlayerState.SLIDING && state !== PlayerState.DEAD) {
      hips.position.y = 0.95 + this.bodyBob;
    }
  }
}
