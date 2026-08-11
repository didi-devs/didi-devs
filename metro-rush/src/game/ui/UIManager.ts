import type { GameSettings, PowerUpKind, RunStats } from '../types/Types';

export interface UICallbacks {
  onPlay: () => void;
  onRestart: () => void;
  onHome: () => void;
  onPause: () => void;
  onResume: () => void;
  onQuit: () => void;
  onSettingsChanged: (partial: Partial<GameSettings>) => void;
}

const POWERUP_ICONS: Record<string, string> = {
  MAGNET: '\u{1F9F2}',
  SHIELD: '\u{1F6E1}',
  SCORE_BOOST: '⭐',
  HOVER: '⚡',
};

type ScreenName = 'loading' | 'menu' | 'howto' | 'settings' | 'countdown' | 'pause' | 'gameover';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing UI element #${id}`);
  return el;
}

/**
 * Thin DOM controller. Owns no gameplay state -- only reflects it and
 * forwards user intent back to Game via callbacks.
 */
export class UIManager {
  private callbacks: UICallbacks;
  private screens: Record<ScreenName, HTMLElement>;
  private hud: HTMLElement;
  private mobileHint: HTMLElement;
  private powerupTimers: Map<string, { el: HTMLElement; ring: HTMLElement; duration: number }> = new Map();

  constructor(callbacks: UICallbacks) {
    this.callbacks = callbacks;
    this.screens = {
      loading: $('screen-loading'),
      menu: $('screen-menu'),
      howto: $('screen-howto'),
      settings: $('screen-settings'),
      countdown: $('screen-countdown'),
      pause: $('screen-pause'),
      gameover: $('screen-gameover'),
    };
    this.hud = $('hud');
    this.mobileHint = $('mobile-hint');
    this.bindEvents();
  }

  private bindEvents(): void {
    $('btn-play').addEventListener('click', () => this.callbacks.onPlay());
    $('btn-restart').addEventListener('click', () => this.callbacks.onRestart());
    $('btn-home').addEventListener('click', () => this.callbacks.onHome());
    $('btn-pause').addEventListener('click', () => this.callbacks.onPause());
    $('btn-resume').addEventListener('click', () => this.callbacks.onResume());
    $('btn-pause-quit').addEventListener('click', () => this.callbacks.onQuit());

    $('btn-how-to-play').addEventListener('click', () => this.showScreen('howto'));
    $('btn-howto-back').addEventListener('click', () => this.showScreen('menu'));
    $('btn-settings').addEventListener('click', () => this.showScreen('settings'));
    $('btn-settings-back').addEventListener('click', () => this.showScreen('menu'));
    $('btn-pause-settings').addEventListener('click', () => this.showScreen('settings'));

    const music = $('setting-music') as HTMLInputElement;
    const sfx = $('setting-sfx') as HTMLInputElement;
    const mute = $('setting-mute') as HTMLInputElement;
    const quality = $('setting-quality') as HTMLSelectElement;

    music.addEventListener('input', () => this.callbacks.onSettingsChanged({ musicVolume: Number(music.value) / 100 }));
    sfx.addEventListener('input', () => this.callbacks.onSettingsChanged({ sfxVolume: Number(sfx.value) / 100 }));
    mute.addEventListener('change', () => this.callbacks.onSettingsChanged({ muted: mute.checked }));
    quality.addEventListener('change', () =>
      this.callbacks.onSettingsChanged({ quality: quality.value as GameSettings['quality'] }),
    );
  }

  applySettingsToInputs(settings: GameSettings): void {
    (document.getElementById('setting-music') as HTMLInputElement).value = String(Math.round(settings.musicVolume * 100));
    (document.getElementById('setting-sfx') as HTMLInputElement).value = String(Math.round(settings.sfxVolume * 100));
    (document.getElementById('setting-mute') as HTMLInputElement).checked = settings.muted;
    (document.getElementById('setting-quality') as HTMLSelectElement).value = settings.quality;
  }

  showScreen(name: ScreenName | null): void {
    Object.values(this.screens).forEach((s) => s.classList.remove('active'));
    if (name) this.screens[name].classList.add('active');
  }

  hideAllScreens(): void {
    this.showScreen(null);
  }

  setLoadingProgress(pct: number): void {
    (document.getElementById('loading-bar-fill') as HTMLElement).style.width = `${pct}%`;
  }

  setMenuBestScore(score: number): void {
    $('menu-best-score').textContent = Math.floor(score).toLocaleString();
  }

  setHudVisible(visible: boolean): void {
    this.hud.classList.toggle('active', visible);
  }

  showMobileHint(): void {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      this.mobileHint.classList.add('show');
      setTimeout(() => this.mobileHint.classList.remove('show'), 3200);
    }
  }

  setCountdown(text: string): void {
    const el = $('countdown-number');
    el.textContent = text;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  updateScore(score: number, pulse: boolean): void {
    const el = $('hud-score');
    el.textContent = Math.floor(score).toLocaleString();
    if (pulse) this.pulse(el);
  }

  updateMultiplier(multiplier: number): void {
    const el = $('hud-multiplier');
    el.textContent = `x${multiplier}`;
    this.pulse(el);
  }

  updateCoins(coins: number): void {
    const el = $('hud-coins');
    (document.getElementById('hud-coins') as HTMLElement).textContent = String(coins);
    this.pulse(el);
  }

  updateDistance(distance: number): void {
    $('hud-distance').textContent = `${Math.floor(distance)}m`;
  }

  private pulse(el: HTMLElement): void {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  showNearMiss(): void {
    const el = $('hud-near-miss');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  showMilestone(text: string): void {
    const el = $('hud-milestone');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  addPowerUpBadge(kind: PowerUpKind, duration: number): void {
    const container = $('hud-powerups');
    let existing = this.powerupTimers.get(kind);
    if (!existing) {
      const badge = document.createElement('div');
      badge.className = 'hud-powerup-badge';
      badge.innerHTML = `<div class="ring" style="--pct:100"></div><span>${POWERUP_ICONS[kind] ?? '?'}</span>`;
      container.appendChild(badge);
      existing = { el: badge, ring: badge.querySelector('.ring') as HTMLElement, duration };
      this.powerupTimers.set(kind, existing);
    }
    existing.duration = duration;
  }

  updatePowerUpBadge(kind: PowerUpKind, remaining: number, duration: number): void {
    const entry = this.powerupTimers.get(kind);
    if (!entry) return;
    const pct = Math.max(0, Math.min(100, (remaining / duration) * 100));
    entry.ring.style.setProperty('--pct', String(pct));
  }

  removePowerUpBadge(kind: PowerUpKind): void {
    const entry = this.powerupTimers.get(kind);
    if (!entry) return;
    entry.el.remove();
    this.powerupTimers.delete(kind);
  }

  clearPowerUpBadges(): void {
    for (const kind of Array.from(this.powerupTimers.keys())) this.removePowerUpBadge(kind as PowerUpKind);
  }

  showGameOver(stats: RunStats, highScore: number, bestDistance: number): void {
    $('stat-score').textContent = Math.floor(stats.score).toLocaleString();
    $('stat-highscore').textContent = Math.floor(highScore).toLocaleString();
    $('stat-distance').textContent = `${Math.floor(stats.distance)}m`;
    $('stat-bestdistance').textContent = `${Math.floor(bestDistance)}m`;
    $('stat-coins').textContent = String(stats.coins);
    const badge = $('newhigh-badge');
    badge.classList.toggle('show', stats.isNewHighScore);
    const title = $('gameover-title');
    title.textContent = stats.isNewHighScore ? 'NEW RECORD!' : 'RUN OVER';
    this.showScreen('gameover');
  }

  updateDebug(text: string | null): void {
    const panel = $('debug-panel');
    if (text === null) {
      panel.classList.remove('active');
      return;
    }
    panel.classList.add('active');
    panel.textContent = text;
  }
}
