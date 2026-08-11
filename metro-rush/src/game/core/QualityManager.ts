import { QUALITY_PRESETS } from '../config/GameConfig';
import type { QualityLevel, QualitySettings } from '../types/Types';

/**
 * Selects and exposes render/gameplay quality tiers. Auto-detects a sane
 * default from device characteristics, but can be overridden by the user.
 */
export class QualityManager {
  private level: QualityLevel;

  constructor(initial?: QualityLevel) {
    this.level = initial ?? QualityManager.detectDefault();
  }

  private static detectDefault(): QualityLevel {
    const cores = navigator.hardwareConcurrency ?? 4;
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile && cores <= 4) return 'LOW';
    if (isMobile) return 'MEDIUM';
    if (cores >= 8) return 'HIGH';
    return 'MEDIUM';
  }

  get current(): QualityLevel {
    return this.level;
  }

  get settings(): QualitySettings {
    return QUALITY_PRESETS[this.level];
  }

  setLevel(level: QualityLevel): void {
    this.level = level;
  }
}
