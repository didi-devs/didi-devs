/**
 * Generic object pool to avoid per-frame allocations and GC spikes.
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private factory: () => T;
  private reset: (item: T) => void;

  constructor(factory: () => T, reset: (item: T) => void, initialSize = 0) {
    this.factory = factory;
    this.reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.available.push(this.factory());
    }
  }

  acquire(): T {
    const item = this.available.pop() ?? this.factory();
    this.inUse.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.inUse.has(item)) return;
    this.inUse.delete(item);
    this.reset(item);
    this.available.push(item);
  }

  releaseAll(): void {
    for (const item of Array.from(this.inUse)) {
      this.release(item);
    }
  }

  get activeCount(): number {
    return this.inUse.size;
  }

  forEachActive(cb: (item: T) => void): void {
    this.inUse.forEach(cb);
  }
}
