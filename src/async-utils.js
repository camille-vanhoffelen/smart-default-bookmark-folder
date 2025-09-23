/**
 * Semaphore for controlling max concurrent async operations.
 */
export class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.running = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.running < this.maxConcurrency) {
        this.running++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.running++;
      next();
    }
  }

  async execute(task) {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}