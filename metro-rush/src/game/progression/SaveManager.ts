import { STORAGE_KEYS } from '../config/GameConfig';
import type { GameSettings, SaveData } from '../types/Types';

const DEFAULT_SETTINGS: GameSettings = {
  musicVolume: 0.6,
  sfxVolume: 0.8,
  muted: false,
  quality: 'MEDIUM',
  swipeSensitivity: 1,
};

const DEFAULT_SAVE: SaveData = {
  highScore: 0,
  bestDistance: 0,
  lifetimeCoins: 0,
  settings: DEFAULT_SETTINGS,
  unlocks: ['default'],
  selectedCosmetic: 'default',
};

/**
 * Wraps localStorage with safe fallbacks. Designed so a future cloud-save
 * backend could implement the same shape without touching call sites.
 */
export class SaveManager {
  private data: SaveData;
  private storageAvailable: boolean;

  constructor() {
    this.storageAvailable = SaveManager.detectStorage();
    this.data = this.load();
  }

  private static detectStorage(): boolean {
    try {
      const key = '__metro_rush_test__';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  private load(): SaveData {
    if (!this.storageAvailable) return structuredClone(DEFAULT_SAVE);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.SETTINGS + '.bundle');
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw);
      return {
        highScore: Number(parsed.highScore) || 0,
        bestDistance: Number(parsed.bestDistance) || 0,
        lifetimeCoins: Number(parsed.lifetimeCoins) || 0,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        unlocks: Array.isArray(parsed.unlocks) ? parsed.unlocks : ['default'],
        selectedCosmetic: parsed.selectedCosmetic ?? 'default',
      };
    } catch {
      return structuredClone(DEFAULT_SAVE);
    }
  }

  private persist(): void {
    if (!this.storageAvailable) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.SETTINGS + '.bundle', JSON.stringify(this.data));
    } catch {
      // Storage full or unavailable mid-session; fail silently, game keeps working in-memory.
    }
  }

  getData(): Readonly<SaveData> {
    return this.data;
  }

  getSettings(): GameSettings {
    return this.data.settings;
  }

  updateSettings(partial: Partial<GameSettings>): void {
    this.data.settings = { ...this.data.settings, ...partial };
    this.persist();
  }

  /** Returns true if this run set a new high score. */
  submitRun(score: number, distance: number, coins: number): boolean {
    let isNewHighScore = false;
    if (score > this.data.highScore) {
      this.data.highScore = score;
      isNewHighScore = true;
    }
    if (distance > this.data.bestDistance) {
      this.data.bestDistance = distance;
    }
    this.data.lifetimeCoins += coins;
    this.persist();
    return isNewHighScore;
  }

  unlockCosmetic(id: string): void {
    if (!this.data.unlocks.includes(id)) {
      this.data.unlocks.push(id);
      this.persist();
    }
  }

  selectCosmetic(id: string): void {
    this.data.selectedCosmetic = id;
    this.persist();
  }
}
