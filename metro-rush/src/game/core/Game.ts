import * as THREE from 'three';
import { GameState, PlayerState, PowerUpKind } from '../types/Types';
import { POWERUP, SCORE, SPEED } from '../config/GameConfig';
import { GameLoop } from './GameLoop';
import { GameStateManager } from './GameStateManager';
import { QualityManager } from './QualityManager';
import { CollisionSystem } from './CollisionSystem';
import { PlayerController } from '../player/PlayerController';
import { CameraController } from '../camera/CameraController';
import { WorldManager } from '../world/WorldManager';
import { ObstacleManager } from '../obstacles/ObstacleManager';
import { CoinManager } from '../collectibles/CoinManager';
import { PowerUpManager } from '../powerups/PowerUpManager';
import { ChunkManager } from '../generation/ChunkManager';
import { DifficultyDirector } from '../generation/DifficultyDirector';
import { ParticleManager } from '../effects/ParticleManager';
import { AudioManager } from '../audio/AudioManager';
import { InputManager, type InputAction } from '../input/InputManager';
import { SaveManager } from '../progression/SaveManager';
import { ScoreManager } from '../progression/ScoreManager';
import { UIManager } from '../ui/UIManager';
import { clamp } from '../utils/MathUtils';
import type { RunStats } from '../types/Types';

const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'];
const COUNTDOWN_STEP_TIME = 0.62;

interface ActivePowerUpTimer {
  kind: PowerUpKind;
  remaining: number;
  duration: number;
}

/**
 * Top-level orchestrator wiring every subsystem together and driving
 * the frame loop. This is the only class that knows about all other
 * systems; individual managers stay decoupled from one another.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;

  private stateManager = new GameStateManager();
  private quality: QualityManager;
  private save = new SaveManager();
  private ui: UIManager;
  private audio = new AudioManager();
  private input: InputManager;

  private camera: CameraController;
  private player!: PlayerController;
  private world!: WorldManager;
  private obstacles!: ObstacleManager;
  private coins!: CoinManager;
  private powerUps!: PowerUpManager;
  private chunks!: ChunkManager;
  private difficulty = new DifficultyDirector();
  private particles!: ParticleManager;
  private collision = new CollisionSystem();
  private scoreManager!: ScoreManager;

  private loop: GameLoop;

  private countdownStep = 0;
  private countdownTimer = 0;
  private hasSeenIntro = false;

  private activePowerUps: Map<PowerUpKind, ActivePowerUpTimer> = new Map();
  private hitStopTimer = 0;
  private gameOverDelayTimer = 0;
  private pendingGameOver = false;

  private debugEnabled = false;
  private lastDt = 1 / 60;

  constructor(canvas: HTMLCanvasElement) {
    this.quality = new QualityManager(this.save.getSettings().quality);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = this.quality.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();

    this.camera = new CameraController(window.innerWidth / window.innerHeight);

    this.audio.setMusicVolume(this.save.getSettings().musicVolume);
    this.audio.setSfxVolume(this.save.getSettings().sfxVolume);
    this.audio.setMuted(this.save.getSettings().muted);

    this.input = new InputManager(canvas);
    this.ui = new UIManager({
      onPlay: () => this.beginStartSequence(),
      onRestart: () => this.beginStartSequence(),
      onHome: () => this.goHome(),
      onPause: () => this.pause(),
      onResume: () => this.resume(),
      onQuit: () => this.goHome(),
      onSettingsChanged: (partial) => this.applySettings(partial),
    });
    this.ui.applySettingsToInputs(this.save.getSettings());

    this.setupWorld();
    this.bindInput();
    this.bindResize();

    this.debugEnabled = new URLSearchParams(window.location.search).has('debug');
    if (this.debugEnabled) {
      (window as any).__scene = this.scene;
      (window as any).__game = this;
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') {
        this.debugEnabled = !this.debugEnabled;
        if (!this.debugEnabled) this.ui.updateDebug(null);
      }
    });

    this.loop = new GameLoop((dt, elapsed) => this.tick(dt, elapsed));
  }

  private setupWorld(): void {
    this.world = new WorldManager(this.scene, this.quality.settings.shadows);
    this.particles = new ParticleManager(this.scene, this.quality.settings.particleMultiplier);
    this.obstacles = new ObstacleManager(this.scene);
    this.coins = new CoinManager(this.scene);
    this.powerUps = new PowerUpManager(this.scene);
    this.chunks = new ChunkManager(this.obstacles, this.coins, this.powerUps, this.difficulty);
    this.player = new PlayerController(this.audio, this.particles, this.save.getData().selectedCosmetic);
    this.scene.add(this.player.group);
    this.scoreManager = new ScoreManager({
      onCoinCollected: (total) => this.ui.updateCoins(total),
      onMultiplierChanged: (m) => this.ui.updateMultiplier(m),
      onScoreChanged: (s) => this.ui.updateScore(s, false),
    });
  }

  private bindInput(): void {
    this.input.onAction((action: InputAction) => {
      if (action === 'PAUSE') {
        if (this.stateManager.is(GameState.PLAYING)) this.pause();
        else if (this.stateManager.is(GameState.PAUSED)) this.resume();
        return;
      }
      if (!this.stateManager.is(GameState.PLAYING)) return;
      switch (action) {
        case 'LEFT':
          this.player.requestLaneChange(-1);
          break;
        case 'RIGHT':
          this.player.requestLaneChange(1);
          break;
        case 'JUMP':
          this.player.requestJump();
          break;
        case 'SLIDE':
          this.player.requestSlide();
          break;
      }
    });
  }

  private bindResize(): void {
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.settings.pixelRatioCap);
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(w, h);
      this.camera.setAspect(w / h);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    resize();
  }

  boot(): void {
    this.ui.setLoadingProgress(20);
    let pct = 20;
    const interval = window.setInterval(() => {
      pct += 25;
      this.ui.setLoadingProgress(Math.min(100, pct));
      if (pct >= 100) {
        window.clearInterval(interval);
        window.setTimeout(() => this.enterMenu(), 200);
      }
    }, 140);

    this.camera.reset(this.player);
    this.loop.start();
  }

  private enterMenu(): void {
    this.stateManager.transition(GameState.MENU);
    this.ui.setMenuBestScore(this.save.getData().highScore);
    this.ui.showScreen('menu');
    this.audio.init();
  }

  private goHome(): void {
    this.stateManager.transition(GameState.MENU);
    this.ui.setHudVisible(false);
    this.ui.clearPowerUpBadges();
    this.audio.stopMusic();
    this.ui.setMenuBestScore(this.save.getData().highScore);
    this.ui.showScreen('menu');
  }

  private applySettings(partial: Partial<import('../types/Types').GameSettings>): void {
    this.save.updateSettings(partial);
    const s = this.save.getSettings();
    this.audio.setMusicVolume(s.musicVolume);
    this.audio.setSfxVolume(s.sfxVolume);
    this.audio.setMuted(s.muted);
    if (partial.quality) {
      this.quality.setLevel(s.quality);
      this.particles.setParticleMultiplier(this.quality.settings.particleMultiplier);
      this.renderer.shadowMap.enabled = this.quality.settings.shadows;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.settings.pixelRatioCap);
      this.renderer.setPixelRatio(pixelRatio);
    }
    this.audio.playSfx('uiClick');
  }

  // -------------------------------------------------------------------
  // Start sequence
  // -------------------------------------------------------------------

  private beginStartSequence(): void {
    this.audio.resume();
    this.stateManager.transition(GameState.STARTING);
    this.resetRun();
    this.ui.showScreen('countdown');
    this.ui.setHudVisible(false);

    if (!this.hasSeenIntro) {
      this.countdownStep = 0;
      this.countdownTimer = COUNTDOWN_STEP_TIME;
      this.ui.setCountdown(COUNTDOWN_STEPS[0]);
      this.audio.playSfx('countdown');
      this.hasSeenIntro = true;
    } else {
      // Skip repeated full countdown on subsequent plays -- short "GO" only.
      this.countdownStep = COUNTDOWN_STEPS.length - 1;
      this.countdownTimer = COUNTDOWN_STEP_TIME * 0.6;
      this.ui.setCountdown(COUNTDOWN_STEPS[this.countdownStep]);
      this.audio.playSfx('go');
    }
  }

  private resetRun(): void {
    this.player.reset();
    this.world.reset();
    this.obstacles.reset();
    this.coins.reset();
    this.powerUps.reset();
    this.difficulty.reset();
    this.chunks.reset();
    this.collision.reset();
    this.scoreManager.reset();
    this.camera.reset(this.player);
    this.activePowerUps.clear();
    this.ui.clearPowerUpBadges();
    this.hitStopTimer = 0;
    this.gameOverDelayTimer = 0;
    this.pendingGameOver = false;
  }

  private startPlaying(): void {
    this.stateManager.transition(GameState.PLAYING);
    this.ui.setHudVisible(true);
    this.ui.showScreen(null);
    this.ui.showMobileHint();
    this.ui.updateScore(0, false);
    this.ui.updateCoins(0);
    this.ui.updateMultiplier(1);
    this.audio.startMusic();
  }

  private pause(): void {
    if (!this.stateManager.is(GameState.PLAYING)) return;
    this.stateManager.transition(GameState.PAUSED);
    this.ui.showScreen('pause');
    this.audio.playSfx('uiClick');
  }

  private resume(): void {
    if (!this.stateManager.is(GameState.PAUSED)) return;
    this.stateManager.transition(GameState.PLAYING);
    this.ui.showScreen(null);
    this.audio.playSfx('uiClick');
  }

  // -------------------------------------------------------------------
  // Main tick
  // -------------------------------------------------------------------

  private tick(dt: number, _elapsed: number): void {
    this.lastDt = dt;

    switch (this.stateManager.current) {
      case GameState.STARTING:
        this.updateCountdown(dt);
        this.camera.update(dt, this.player, SPEED.INITIAL);
        break;
      case GameState.PLAYING:
        this.updatePlaying(dt);
        break;
      case GameState.PAUSED:
      case GameState.MENU:
      case GameState.GAME_OVER:
        this.camera.update(dt, this.player, this.difficulty.currentSpeed * 0.3);
        break;
      default:
        break;
    }

    this.particles.update(dt);
    this.renderer.render(this.scene, this.camera.camera);

    if (this.debugEnabled) this.updateDebugPanel();
  }

  private updateCountdown(dt: number): void {
    this.countdownTimer -= dt;
    if (this.countdownTimer <= 0) {
      this.countdownStep++;
      if (this.countdownStep >= COUNTDOWN_STEPS.length) {
        this.startPlaying();
        return;
      }
      this.ui.setCountdown(COUNTDOWN_STEPS[this.countdownStep]);
      this.countdownTimer = COUNTDOWN_STEP_TIME;
      this.audio.playSfx(this.countdownStep === COUNTDOWN_STEPS.length - 1 ? 'go' : 'countdown');
    }
  }

  private updatePlaying(dt: number): void {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      dt *= 0.05;
    }

    this.difficulty.update(dt);
    const speed = this.difficulty.currentSpeed;

    this.player.update(dt);
    this.world.update(dt, this.difficulty.distanceTraveled, this.player.worldX);
    this.obstacles.update(dt, this.difficulty.distanceTraveled);
    this.coins.update(dt, this.difficulty.distanceTraveled, this.player.group.position, this.player.magnetized);
    this.powerUps.update(dt, this.difficulty.distanceTraveled);
    this.chunks.update(this.difficulty.distanceTraveled);
    this.camera.update(dt, this.player, speed);

    this.updateSpeedEffects(dt, speed);
    this.updatePowerUpTimers(dt);

    if (!this.pendingGameOver) {
      this.scoreManager.addDistance(speed * dt);
      this.ui.updateDistance(this.scoreManager.distance);

      const result = this.collision.update(dt, this.player, this.obstacles, this.coins, this.powerUps);

      if (result.coinsCollected > 0) {
        this.scoreManager.addCoin(result.coinsCollected);
        this.audio.playSfx('coin');
        this.particles.burst('sparkle', this.player.chestPosition(), result.coinsCollected * 3, 1.4, 3, 0.5);
      }

      for (const p of result.powerUpsCollected) {
        this.activatePowerUp(p.kind);
        this.audio.playSfx('powerupPickup');
        this.particles.burst('sparkle', this.player.chestPosition(), 14, 1.8, 3.2, 0.6);
      }

      for (let i = 0; i < result.nearMisses; i++) {
        this.scoreManager.addBonus(SCORE.NEAR_MISS_BONUS);
        this.ui.showNearMiss();
        this.audio.playSfx('nearMiss');
        this.camera.addShake(0.08);
      }

      if (result.hitObstacle) {
        this.handleCollision();
      }
    } else {
      this.gameOverDelayTimer -= dt;
      if (this.gameOverDelayTimer <= 0) {
        this.finishRun();
      }
    }

    if (Math.floor(this.scoreManager.distance / 500) > Math.floor((this.scoreManager.distance - speed * dt) / 500)) {
      this.ui.showMilestone(`${Math.floor(this.scoreManager.distance)}M`);
      this.audio.playSfx('milestone');
    }
  }

  private handleCollision(): void {
    if (this.player.shielded) {
      this.player.setShield(false);
      this.deactivatePowerUp(PowerUpKind.SHIELD);
      this.player.triggerStumble();
      this.camera.addShake(0.3);
      this.audio.playSfx('collision');
      this.particles.burst('impact', this.player.chestPosition(), 10, 1.5, 2.5, 0.4);
      return;
    }

    this.player.triggerDeath();
    this.camera.addShake(0.8);
    this.audio.playSfx('collision');
    this.particles.burst('impact', this.player.chestPosition(), 26, 2.4, 4, 0.7);
    this.hitStopTimer = 0.12;
    this.pendingGameOver = true;
    this.gameOverDelayTimer = 1.1;
  }

  private finishRun(): void {
    this.stateManager.transition(GameState.GAME_OVER);
    this.audio.stopMusic();
    const stats: RunStats = {
      score: this.scoreManager.roundedScore,
      coins: this.scoreManager.coins,
      distance: Math.floor(this.scoreManager.distance),
      multiplier: this.scoreManager.multiplier,
      isNewHighScore: false,
    };
    stats.isNewHighScore = this.save.submitRun(stats.score, stats.distance, stats.coins);
    if (stats.isNewHighScore) {
      this.audio.playSfx('newHighScore');
    }
    this.ui.clearPowerUpBadges();
    this.ui.showGameOver(stats, this.save.getData().highScore, this.save.getData().bestDistance);
  }

  // -------------------------------------------------------------------
  // Power-ups
  // -------------------------------------------------------------------

  private activatePowerUp(kind: PowerUpKind): void {
    const duration = this.powerUpDuration(kind);
    this.activePowerUps.set(kind, { kind, remaining: duration, duration });
    this.ui.addPowerUpBadge(kind, duration);
    this.audio.playSfx('powerupActivate');

    switch (kind) {
      case PowerUpKind.MAGNET:
        this.player.setMagnetized(true);
        break;
      case PowerUpKind.SHIELD:
        this.player.setShield(true);
        break;
      case PowerUpKind.SCORE_BOOST:
        this.scoreManager.setScoreBoost(true);
        break;
      case PowerUpKind.HOVER:
        break;
    }
  }

  private deactivatePowerUp(kind: PowerUpKind): void {
    if (!this.activePowerUps.has(kind)) return;
    this.activePowerUps.delete(kind);
    this.ui.removePowerUpBadge(kind);
    this.audio.playSfx('powerupExpire');
    switch (kind) {
      case PowerUpKind.MAGNET:
        this.player.setMagnetized(false);
        break;
      case PowerUpKind.SHIELD:
        this.player.setShield(false);
        break;
      case PowerUpKind.SCORE_BOOST:
        this.scoreManager.setScoreBoost(false);
        break;
      case PowerUpKind.HOVER:
        break;
    }
  }

  private powerUpDuration(kind: PowerUpKind): number {
    switch (kind) {
      case PowerUpKind.MAGNET:
        return POWERUP.MAGNET_DURATION;
      case PowerUpKind.SHIELD:
        return POWERUP.SHIELD_DURATION;
      case PowerUpKind.SCORE_BOOST:
        return POWERUP.SCORE_BOOST_DURATION;
      case PowerUpKind.HOVER:
        return POWERUP.HOVER_DURATION;
    }
  }

  private updatePowerUpTimers(dt: number): void {
    for (const timer of Array.from(this.activePowerUps.values())) {
      timer.remaining -= dt;
      this.ui.updatePowerUpBadge(timer.kind, Math.max(0, timer.remaining), timer.duration);
      if (timer.remaining <= 0) {
        this.deactivatePowerUp(timer.kind);
      }
    }
  }

  // -------------------------------------------------------------------
  // Speed effects (visual reinforcement of pace)
  // -------------------------------------------------------------------

  private speedLineAccumulator = 0;
  private updateSpeedEffects(dt: number, speed: number): void {
    const speedRatio = clamp((speed - SPEED.INITIAL) / (SPEED.MAX - SPEED.INITIAL), 0, 1);
    this.speedLineAccumulator += dt * (2 + speedRatio * 10);
    if (this.speedLineAccumulator > 1) {
      this.speedLineAccumulator = 0;
      const behind = this.player.group.position.clone();
      behind.z += 1.5;
      behind.y += 0.3 + Math.random() * 1.2;
      behind.x += (Math.random() - 0.5) * 3;
      this.particles.burst('speedLine', behind, Math.round(1 + speedRatio * 3), 0.3, 8 + speedRatio * 6, 0.35);
    }

    if (this.player.state === PlayerState.RUNNING && Math.random() < dt * 6) {
      this.particles.burst('dust', this.player.footPosition(), 1, 0.4, 1, 0.3);
    }
  }

  private updateDebugPanel(): void {
    const lines = [
      `FPS: ${Math.round(1 / Math.max(0.0001, this.lastDt))}`,
      `state: ${this.stateManager.current}`,
      `player: ${this.player.state}`,
      `lane: ${this.player.currentLane}`,
      `speed: ${this.difficulty.currentSpeed.toFixed(2)}`,
      `distance: ${this.difficulty.distanceTraveled.toFixed(1)}`,
      `tier: ${this.difficulty.tier}`,
      `budget: ${this.difficulty.difficultyBudget.toFixed(2)}`,
      `biome: ${this.world.getBiomeForDistance(this.difficulty.distanceTraveled)}`,
      `obstacles: ${this.obstacles.activeCount}`,
      `coins: ${this.coins.activeCount}`,
      `groundTiles: ${this.world.activeGroundTileCount}`,
      `scenery: ${this.world.activeSceneryCount}`,
      `drawCalls: ${this.renderer.info.render.calls}`,
    ];
    this.ui.updateDebug(lines.join('\n'));
  }
}
