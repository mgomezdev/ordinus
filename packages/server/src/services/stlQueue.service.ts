type Job = () => Promise<void>;

export class StlQueue {
  private running = 0;
  private readonly queue: Array<() => void> = [];

  private readonly maxWorkers: number;
  constructor(maxWorkers: number) {
    this.maxWorkers = maxWorkers;
  }

  enqueue(job: Job): Promise<void> {
    return new Promise((resolve, reject) => {
      const run = () => {
        this.running++;
        job()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.running--;
            const next = this.queue.shift();
            if (next) next();
          });
      };
      if (this.running < this.maxWorkers) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }
}

import { config } from '../config.js';
export const stlQueue = new StlQueue(config.MAX_STL_WORKERS);
