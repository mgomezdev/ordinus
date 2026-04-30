import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { runMigrations } from '../db/migrate.js';
import {
  createUpload,
  getUploadById,
  listByUser,
  updateUploadStatus,
  deleteUpload,
  checkQuota,
} from './userStls.service.js';

let client: ReturnType<typeof createClient>;

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  await runMigrations(client);
  await client.execute(
    `INSERT INTO users (id, email, username, password_hash) VALUES (1, 'test@test.com', 'testuser', 'hash')`,
  );
});

describe('createUpload', () => {
  it('creates a row with pending status', async () => {
    const id = await createUpload(client, {
      userId: 1,
      name: 'My Bin',
      originalFilename: 'bin.stl',
      filePath: '/data/user-stls/1/abc.stl',
    });
    expect(typeof id).toBe('string');
    const row = await getUploadById(client, id);
    expect(row?.status).toBe('pending');
    expect(row?.name).toBe('My Bin');
  });

  it('accepts an optional id', async () => {
    const id = await createUpload(client, {
      id: 'custom-id-123',
      userId: 1,
      name: 'Custom ID Bin',
      originalFilename: 'bin.stl',
      filePath: '/data/user-stls/1/custom.stl',
    });
    expect(id).toBe('custom-id-123');
    const row = await getUploadById(client, id);
    expect(row?.id).toBe('custom-id-123');
  });
});

describe('getUploadById', () => {
  it('returns null for unknown id', async () => {
    const row = await getUploadById(client, 'nonexistent');
    expect(row).toBeNull();
  });

  it('returns full row data', async () => {
    const id = await createUpload(client, {
      userId: 1,
      name: 'Full Row',
      originalFilename: 'test.stl',
      filePath: '/data/user-stls/1/test.stl',
    });
    const row = await getUploadById(client, id);
    expect(row?.userId).toBe(1);
    expect(row?.originalFilename).toBe('test.stl');
    expect(row?.filePath).toBe('/data/user-stls/1/test.stl');
    expect(row?.imageUrl).toBeNull();
    expect(row?.gridX).toBeNull();
    expect(row?.gridY).toBeNull();
  });
});

describe('listByUser', () => {
  it('returns empty array when no uploads', async () => {
    const rows = await listByUser(client, 1);
    expect(rows).toHaveLength(0);
  });

  it('returns uploads for the user in descending order', async () => {
    const now = Date.now();
    await createUpload(client, {
      id: 'older-id',
      userId: 1,
      name: 'First',
      originalFilename: 'a.stl',
      filePath: '/a',
    });
    // Patch created_at to ensure deterministic ordering
    await client.execute({
      sql: `UPDATE user_stl_uploads SET created_at = ?, updated_at = ? WHERE id = 'older-id'`,
      args: [new Date(now - 1000).toISOString(), new Date(now - 1000).toISOString()],
    });
    await createUpload(client, {
      id: 'newer-id',
      userId: 1,
      name: 'Second',
      originalFilename: 'b.stl',
      filePath: '/b',
    });
    const rows = await listByUser(client, 1);
    expect(rows).toHaveLength(2);
    // Most recent first (Second was inserted with a later timestamp)
    expect(rows[0].name).toBe('Second');
    expect(rows[1].name).toBe('First');
  });
});

describe('checkQuota', () => {
  it('returns false when under quota', async () => {
    const exceeded = await checkQuota(client, 1);
    expect(exceeded).toBe(false);
  });

  it('returns true when at quota limit from user_storage', async () => {
    // Set quota to 2
    await client.execute(
      `INSERT INTO user_storage (user_id, max_user_stls) VALUES (1, 2)`,
    );
    await createUpload(client, { userId: 1, name: 'A', originalFilename: 'a.stl', filePath: '/a' });
    await createUpload(client, { userId: 1, name: 'B', originalFilename: 'b.stl', filePath: '/b' });
    const exceeded = await checkQuota(client, 1);
    expect(exceeded).toBe(true);
  });
});

describe('updateUploadStatus', () => {
  it('updates to ready with image data', async () => {
    const id = await createUpload(client, {
      userId: 1,
      name: 'Test',
      originalFilename: 'a.stl',
      filePath: '/f',
    });
    await updateUploadStatus(client, id, 'ready', {
      imageUrl: 'abc.png',
      perspImageUrls: ['abc-p0.png', 'abc-p90.png', 'abc-p180.png', 'abc-p270.png'],
      gridX: 2,
      gridY: 1,
    });
    const row = await getUploadById(client, id);
    expect(row?.status).toBe('ready');
    expect(row?.gridX).toBe(2);
    expect(row?.gridY).toBe(1);
    expect(row?.imageUrl).toBe('abc.png');
    expect(JSON.parse(row?.perspImageUrls ?? '[]')).toHaveLength(4);
  });

  it('updates to error with error message', async () => {
    const id = await createUpload(client, {
      userId: 1,
      name: 'Test',
      originalFilename: 'a.stl',
      filePath: '/f',
    });
    await updateUploadStatus(client, id, 'error', { errorMessage: 'Processing failed' });
    const row = await getUploadById(client, id);
    expect(row?.status).toBe('error');
    expect(row?.errorMessage).toBe('Processing failed');
  });

  it('preserves existing data on partial update', async () => {
    const id = await createUpload(client, {
      userId: 1,
      name: 'Test',
      originalFilename: 'a.stl',
      filePath: '/f',
    });
    await updateUploadStatus(client, id, 'ready', { imageUrl: 'img.png', gridX: 3, gridY: 2 });
    // Update status only without overwriting imageUrl
    await updateUploadStatus(client, id, 'processing');
    const row = await getUploadById(client, id);
    expect(row?.status).toBe('processing');
    expect(row?.imageUrl).toBe('img.png');
  });
});

describe('deleteUpload', () => {
  it('deletes the upload', async () => {
    const id = await createUpload(client, {
      userId: 1,
      name: 'To Delete',
      originalFilename: 'del.stl',
      filePath: '/del',
    });
    await deleteUpload(client, id);
    const row = await getUploadById(client, id);
    expect(row).toBeNull();
  });
});
