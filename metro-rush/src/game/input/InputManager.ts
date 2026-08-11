export type InputAction = 'LEFT' | 'RIGHT' | 'JUMP' | 'SLIDE' | 'PAUSE';

export type InputListener = (action: InputAction) => void;

const SWIPE_MIN_DISTANCE = 32;
const SWIPE_MAX_TIME = 500;

/**
 * Unified keyboard + touch input manager. Emits discrete high-level
 * actions rather than raw key/pointer events so gameplay code never
 * needs to know which device produced an input.
 */
export class InputManager {
  private listeners: Set<InputListener> = new Set();
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private touchActive = false;
  private element: HTMLElement;
  private enabled = true;

  constructor(element: HTMLElement) {
    this.element = element;
    this.bind();
  }

  onAction(listener: InputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private emit(action: InputAction): void {
    if (!this.enabled && action !== 'PAUSE') return;
    this.listeners.forEach((l) => l(action));
  }

  private bind(): void {
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });

    this.element.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.element.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.element.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    this.element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        this.emit('LEFT');
        break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault();
        this.emit('RIGHT');
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        e.preventDefault();
        this.emit('JUMP');
        break;
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        this.emit('SLIDE');
        break;
      case 'Escape':
        e.preventDefault();
        this.emit('PAUSE');
        break;
    }
  };

  private handleTouchStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    this.touchStartX = t.clientX;
    this.touchStartY = t.clientY;
    this.touchStartTime = performance.now();
    this.touchActive = true;
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (!this.touchActive) return;
    // Prevent scroll/zoom while actively playing.
    e.preventDefault();
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    if (!this.touchActive) return;
    e.preventDefault();
    this.touchActive = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - this.touchStartX;
    const dy = t.clientY - this.touchStartY;
    const dt = performance.now() - this.touchStartTime;
    if (dt > SWIPE_MAX_TIME) return;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < SWIPE_MIN_DISTANCE) return;

    if (absX > absY) {
      this.emit(dx > 0 ? 'RIGHT' : 'LEFT');
    } else {
      this.emit(dy > 0 ? 'SLIDE' : 'JUMP');
    }
  };

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.element.removeEventListener('touchstart', this.handleTouchStart);
    this.element.removeEventListener('touchmove', this.handleTouchMove);
    this.element.removeEventListener('touchend', this.handleTouchEnd);
    this.listeners.clear();
  }
}
