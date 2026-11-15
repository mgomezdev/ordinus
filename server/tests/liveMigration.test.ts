import { it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { runMigrations, rollbackLast } from '../src/db/migrate.js';
it('upgrades an existing drawer and read-only invitation without changing their contents or privileges', async () => {
  const db = createClient({ url: ':memory:' });
  try {
    await runMigrations(db); await rollbackLast(db);
    await db.execute("INSERT INTO layouts(id, name, grid_x, grid_y, grid_resolution, width_mm, depth_mm) VALUES (7, 'Existing drawer', 4, 3, 1, 168, 126)");
    await db.execute("INSERT INTO placed_items(id, layout_id, library_id, item_id, x, y, width, height, rotation, customization) VALUES (9, 7, 'bins_standard', 'bin-1x1', 1, 2, 1, 1, 90, '{\"height\":6}')");
    await db.execute("INSERT INTO guest_links(id, layout_id, token_hash, created_at, expires_at) VALUES ('existing', 7, 'invitation-hash', 1, 9999999999999)");
    await db.execute("INSERT INTO guest_sessions(token_hash, link_id, expires_at) VALUES ('session-hash', 'existing', 9999999999999)");
    await db.execute("INSERT INTO admin_account(id, password_hash) VALUES (1, 'existing-password-hash')");
    await runMigrations(db);
    expect((await db.execute('SELECT name, grid_resolution FROM layouts WHERE id=7')).rows[0]).toMatchObject({ name: 'Existing drawer', grid_resolution: 1 });
    expect((await db.execute('SELECT * FROM placed_items WHERE id=9')).rows[0]).toMatchObject({ x: 1, y: 2, width: 1, height: 1, rotation: 90, customization: '{"height":6}' });
    expect(String((await db.execute('SELECT stable_id FROM placed_items WHERE id=9')).rows[0].stable_id)).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
    expect((await db.execute('SELECT allow_edit, token_hash FROM guest_links')).rows[0]).toMatchObject({ allow_edit: 0, token_hash: 'invitation-hash' });
    expect((await db.execute('SELECT token_hash FROM guest_sessions')).rows[0].token_hash).toBe('session-hash');
    expect((await db.execute('SELECT password_hash FROM admin_account')).rows[0].password_hash).toBe('existing-password-hash');
  } finally { db.close(); }
});
