import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGenerationEvents } from './useGenerationEvents';

class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  url: string;
  static instances: MockEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close = vi.fn();

  fire(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
});
afterEach(() => vi.unstubAllGlobals());

describe('useGenerationEvents', () => {
  it('opens EventSource at the correct URL', () => {
    renderHook(() => useGenerationEvents('http://localhost:3001/api/v1', vi.fn()));
    expect(MockEventSource.instances[0].url).toBe('http://localhost:3001/api/v1/generation/events');
  });

  it('calls onEvent when a message arrives', () => {
    const onEvent = vi.fn();
    renderHook(() => useGenerationEvents('http://localhost:3001/api/v1', onEvent));
    MockEventSource.instances[0].fire({ type: 'generation:complete', hash: 'abc' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'generation:complete', hash: 'abc' });
  });

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() =>
      useGenerationEvents('http://localhost:3001/api/v1', vi.fn())
    );
    unmount();
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });

  it('ignores malformed messages', () => {
    const onEvent = vi.fn();
    renderHook(() => useGenerationEvents('http://localhost:3001/api/v1', onEvent));
    MockEventSource.instances[0].onmessage?.({ data: 'not-json' } as MessageEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
