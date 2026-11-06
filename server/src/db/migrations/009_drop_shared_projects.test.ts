import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import * as m001 from './001_baseline.js';
import * as m009 from './009_drop_shared_projects.js';

async function tableExists(client: Client, name: string): Promise<boolean> {
  const r = await client.execute({ sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, args: [name] });
  return r.rows.length > 0;
}

describe('009_drop_shared_projects', () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ':memory:' });
    await m001.up(client);
  });

  it('drops shared_projects and recreates it on rollback', async () => {
    expect(await tableExists(client, 'shared_projects')).toBe(true);

    await m009.up(client);
    expect(await tableExists(client, 'shared_projects')).toBe(false);

    await m009.down(client);
    expect(await tableExists(client, 'shared_projects')).toBe(true);
  });

  it('is a no-op when the table is already gone', async () => {
    await m009.up(client);
    await expect(m009.up(client)).resolves.toBeUndefined();
  });
});
