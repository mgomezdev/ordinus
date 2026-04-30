import { describe, it, expect } from 'vitest';
import type { ApiLayout } from '@gridfinity/shared';
import { groupLayouts } from './groupLayouts';

function makeLayout(overrides: Partial<ApiLayout> = {}): ApiLayout {
  return {
    id: 1,
    userId: 1,
    name: 'Test Layout',
    description: null,
    gridX: 4,
    gridY: 4,
    widthMm: 168,
    depthMm: 168,
    spacerHorizontal: 'none',
    spacerVertical: 'none',
    status: 'submitted',
    isPublic: false,
    createdAt: '2026-02-19T12:00:00Z',
    updatedAt: '2026-02-19T12:00:00Z',
    ...overrides,
  };
}

describe('groupLayouts', () => {
  describe('none mode', () => {
    it('returns a single group with all layouts', () => {
      const layouts = [
        makeLayout({ id: 1, name: 'A' }),
        makeLayout({ id: 2, name: 'B' }),
      ];
      const result = groupLayouts(layouts, 'none');
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('All');
      expect(result[0].layouts).toHaveLength(2);
    });

    it('returns single group for empty array', () => {
      const result = groupLayouts([], 'none');
      expect(result).toHaveLength(1);
      expect(result[0].layouts).toHaveLength(0);
    });
  });

  describe('owner mode', () => {
    it('groups layouts by ownerUsername alphabetically', () => {
      const layouts = [
        makeLayout({ id: 1, ownerUsername: 'Zara' }),
        makeLayout({ id: 2, ownerUsername: 'Alice' }),
        makeLayout({ id: 3, ownerUsername: 'Zara' }),
        makeLayout({ id: 4, ownerUsername: 'Bob' }),
      ];
      const result = groupLayouts(layouts, 'owner');
      expect(result).toHaveLength(3);
      expect(result[0].label).toBe('Alice');
      expect(result[0].layouts).toHaveLength(1);
      expect(result[1].label).toBe('Bob');
      expect(result[1].layouts).toHaveLength(1);
      expect(result[2].label).toBe('Zara');
      expect(result[2].layouts).toHaveLength(2);
    });

    it('uses "Unknown" for layouts without ownerUsername', () => {
      const layouts = [
        makeLayout({ id: 1, ownerUsername: undefined }),
        makeLayout({ id: 2, ownerUsername: 'Alice' }),
      ];
      const result = groupLayouts(layouts, 'owner');
      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('Alice');
      expect(result[1].label).toBe('Unknown');
    });

    it('omits empty groups', () => {
      const layouts = [
        makeLayout({ id: 1, ownerUsername: 'Alice' }),
      ];
      const result = groupLayouts(layouts, 'owner');
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Alice');
    });
  });

  describe('lastEdited mode', () => {
    it('assigns correct time buckets', () => {
      const now = new Date('2026-02-19T15:00:00Z');
      const today = new Date('2026-02-19T08:00:00Z');
      const yesterday = new Date('2026-02-18T12:00:00Z');
      const fiveDaysAgo = new Date('2026-02-14T12:00:00Z');
      const twentyDaysAgo = new Date('2026-01-30T12:00:00Z');
      const sixtyDaysAgo = new Date('2025-12-21T12:00:00Z');

      const layouts = [
        makeLayout({ id: 1, updatedAt: today.toISOString() }),
        makeLayout({ id: 2, updatedAt: yesterday.toISOString() }),
        makeLayout({ id: 3, updatedAt: fiveDaysAgo.toISOString() }),
        makeLayout({ id: 4, updatedAt: twentyDaysAgo.toISOString() }),
        makeLayout({ id: 5, updatedAt: sixtyDaysAgo.toISOString() }),
      ];

      const result = groupLayouts(layouts, 'lastEdited', now);
      const labels = result.map(g => g.label);
      expect(labels).toEqual(['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older']);

      expect(result[0].layouts).toHaveLength(1); // Today
      expect(result[0].layouts[0].id).toBe(1);
      expect(result[1].layouts).toHaveLength(1); // Yesterday
      expect(result[1].layouts[0].id).toBe(2);
      expect(result[2].layouts).toHaveLength(1); // Last 7 Days
      expect(result[2].layouts[0].id).toBe(3);
      expect(result[3].layouts).toHaveLength(1); // Last 30 Days
      expect(result[3].layouts[0].id).toBe(4);
      expect(result[4].layouts).toHaveLength(1); // Older
      expect(result[4].layouts[0].id).toBe(5);
    });

    it('omits empty buckets', () => {
      const now = new Date('2026-02-19T15:00:00Z');
      const layouts = [
        makeLayout({ id: 1, updatedAt: '2026-02-19T08:00:00Z' }),
        makeLayout({ id: 2, updatedAt: '2025-12-01T12:00:00Z' }),
      ];

      const result = groupLayouts(layouts, 'lastEdited', now);
      const labels = result.map(g => g.label);
      expect(labels).toEqual(['Today', 'Older']);
    });

    it('handles empty layouts array', () => {
      const now = new Date('2026-02-19T15:00:00Z');
      const result = groupLayouts([], 'lastEdited', now);
      expect(result).toHaveLength(0);
    });
  });
});
