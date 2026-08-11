const MAX_DT = 1 / 20; // clamp huge deltas after tab-switch or GC pause

/**
 * Simple requestAnimationFrame-driven loop with clamped delta time so
 * gameplay stays frame-rate independent without a full fixed-timestep
 * accumulator (unnecessary for this game's collision requirements).
 */
export class GameLoop {
  private rafId = 0;
  private lastTime = 0;
  private running = false;
  private callback: (dt: number, elapsed: number) => void;
  private elapsed = 0;

  constructor(callback: (dt: number, elapsed: number) => void) {
    this.callback = callback;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(MAX_DT, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += dt;
    this.callback(dt, this.elapsed);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
