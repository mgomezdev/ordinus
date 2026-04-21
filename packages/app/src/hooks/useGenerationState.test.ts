import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGenerationState } from './useGenerationState';

// Stub EventSource so useGenerationEvents doesn't fail
class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null;
  static instances: MockEventSource[] = [];
  constructor() { MockEventSource.instances.push(this); }
  close = vi.fn();
  fire(data: object) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent); }
}
beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
});
afterEach(() => vi.unstubAllGlobals());

describe('useGenerationState', () => {
  it('initially has no entries', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    expect(result.current.getEntry('abc')).toBeUndefined();
  });

  it('trackHash registers hash as pending', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => result.current.trackHash('abc123'));
    expect(result.current.getEntry('abc123')?.status).toBe('pending');
  });

  it('SSE complete event updates status to complete', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => result.current.trackHash('abc123'));
    act(() => MockEventSource.instances[0].fire({ type: 'generation:complete', hash: 'abc123' }));
    expect(result.current.getEntry('abc123')?.status).toBe('complete');
  });

  it('SSE failed event updates status to failed', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => result.current.trackHash('abc123'));
    act(() => MockEventSource.instances[0].fire({ type: 'generation:failed', hash: 'abc123', error: 'boom' }));
    expect(result.current.getEntry('abc123')?.status).toBe('failed');
  });

  it('SSE event for unknown hash is ignored', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => MockEventSource.instances[0].fire({ type: 'generation:complete', hash: 'unknown' }));
    expect(result.current.getEntry('unknown')).toBeUndefined();
  });

  it('trackHash is idempotent — calling twice for same hash keeps pending', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => result.current.trackHash('abc123'));
    act(() => result.current.trackHash('abc123')); // second call must not reset to pending
    expect(result.current.getEntry('abc123')?.status).toBe('pending');
  });

  it('tracks multiple hashes independently', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => {
      result.current.trackHash('hash-a');
      result.current.trackHash('hash-b');
    });
    act(() => MockEventSource.instances[0].fire({ type: 'generation:complete', hash: 'hash-a' }));
    expect(result.current.getEntry('hash-a')?.status).toBe('complete');
    expect(result.current.getEntry('hash-b')?.status).toBe('pending');
  });

  it('trackHash does not overwrite a completed entry', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => result.current.trackHash('abc123'));
    act(() => MockEventSource.instances[0].fire({ type: 'generation:complete', hash: 'abc123' }));
    expect(result.current.getEntry('abc123')?.status).toBe('complete');
    act(() => result.current.trackHash('abc123')); // must not reset to pending
    expect(result.current.getEntry('abc123')?.status).toBe('complete');
  });
});
