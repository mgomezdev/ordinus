import { describe, it, expect } from 'vitest';
import { StlQueue } from './stlQueue.service.js';

describe('StlQueue', () => {
  it('runs jobs up to concurrency limit immediately', async () => {
    const queue = new StlQueue(2);
    const calls: number[] = [];
    await Promise.all([
      queue.enqueue(() => new Promise<void>((resolve) => { calls.push(1); resolve(); })),
      queue.enqueue(() => new Promise<void>((resolve) => { calls.push(2); resolve(); })),
    ]);
    expect(calls).toContain(1);
    expect(calls).toContain(2);
  });

  it('queues jobs beyond concurrency limit', async () => {
    const queue = new StlQueue(1);
    const order: number[] = [];
    let resolveFirst!: () => void;
    const firstJob = () => new Promise<void>((resolve) => { order.push(1); resolveFirst = resolve; });
    const secondJob = () => new Promise<void>((resolve) => { order.push(2); resolve(); });

    const p1 = queue.enqueue(firstJob);
    const p2 = queue.enqueue(secondJob);
    expect(order).toEqual([1]);
    resolveFirst();
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });
});
