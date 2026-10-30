import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

vi.mock('../logger.js', async () => {
  const pino = (await import('pino')).default;
  return { logger: pino({ level: 'silent' }) };
});

const { runMigrations } = await import('../db/migrate.js');
const { client: testClient } = await import('../db/connection.js');
import { createFavorite, listAllFavorites } from './favorites.service.js';

beforeAll(async () => {
  await runMigrations(testClient);
});

const customSpec = { width: 2.5, depth: 1.5, height: 3.5, overrides: { floor_thickness: 1.2 } };
const customization = {
  wallPatternEnabled: false, wallPattern: 'grid' as const, lipStyle: 'normal' as const,
  fingerSlide: 'none' as const, wallCutout: { front: false, back: false, left: false, right: false }, height: 4,
};

describe('favorites service — custom bins', () => {
  it('round-trips a custom bin favorite with its spec and half-unit size', async () => {
    const created = await createFavorite({
      name: 'Custom 2.5×1.5×3.5', libraryId: 'custom', libraryItemId: 'custom-abc123',
      libraryItemName: 'Custom 2.5×1.5×3.5', widthUnits: 2.5, heightUnits: 1.5, color: '#3B82F6',
      paramHash: 'a'.repeat(64), imageUrl: '', customization, customSpec,
    });

    const listed = (await listAllFavorites()).find(f => f.id === created.id);
    expect(listed).toMatchObject({ widthUnits: 2.5, heightUnits: 1.5, libraryId: 'custom' });
    expect(JSON.parse(listed?.customSpec ?? 'null')).toEqual(customSpec);
  });

  it('leaves customSpec null for library favorites', async () => {
    const created = await createFavorite({
      name: 'Bin', libraryId: 'bins_standard', libraryItemId: 'bin-1x1', libraryItemName: 'Bin',
      widthUnits: 1, heightUnits: 1, color: '#3B82F6', imageUrl: '', customization,
    });
    expect(created.customSpec).toBeNull();
  });
});
