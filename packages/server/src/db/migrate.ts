import type { Client } from '@libsql/client';

export async function runMigrations(client: Client): Promise<void> {
  await client.execute('PRAGMA foreign_keys = ON;');
  await client.execute('PRAGMA busy_timeout = 5000;');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT NOT NULL DEFAULT '1.0.0',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS library_items (
      library_id TEXT NOT NULL REFERENCES libraries(id),
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      width_units INTEGER NOT NULL,
      height_units INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      image_path TEXT,
      perspective_image_path TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (library_id, id)
    );
  `);

  // Add perspective_image_path column if missing (existing databases)
  try {
    await client.execute(`ALTER TABLE library_items ADD COLUMN perspective_image_path TEXT;`);
  } catch {
    // Column already exists — ignore
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS item_categories (
      library_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      PRIMARY KEY (library_id, item_id, category_id)
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_library_items_library_id ON library_items(library_id);
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_item_categories_category_id ON item_categories(category_id);
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_item_categories_item ON item_categories(library_id, item_id);
  `);

  // Auth tables
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
  `);

  // Layout tables
  await client.execute(`
    CREATE TABLE IF NOT EXISTS layouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      grid_x INTEGER NOT NULL CHECK (grid_x BETWEEN 1 AND 20),
      grid_y INTEGER NOT NULL CHECK (grid_y BETWEEN 1 AND 20),
      width_mm REAL NOT NULL,
      depth_mm REAL NOT NULL,
      spacer_horizontal TEXT NOT NULL DEFAULT 'none',
      spacer_vertical TEXT NOT NULL DEFAULT 'none',
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_layouts_user ON layouts(user_id);
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS placed_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
      library_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 10),
      height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 10),
      rotation INTEGER NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      customization TEXT
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_placed_items_layout ON placed_items(layout_id);
  `);

  // Add customization column to placed_items if missing (existing databases)
  try {
    await client.execute(`ALTER TABLE placed_items ADD COLUMN customization TEXT;`);
  } catch {
    // Column already exists — ignore
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_storage (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      layout_count INTEGER NOT NULL DEFAULT 0,
      image_bytes INTEGER NOT NULL DEFAULT 0,
      max_layouts INTEGER NOT NULL DEFAULT 50,
      max_image_bytes INTEGER NOT NULL DEFAULT 52428800
    );
  `);

  // Add max_user_stls column to user_storage if missing (existing databases)
  try {
    await client.execute(`ALTER TABLE user_storage ADD COLUMN max_user_stls INTEGER NOT NULL DEFAULT 50;`);
  } catch {
    // Column already exists — ignore
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_stl_uploads (
      id TEXT NOT NULL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      image_url TEXT,
      persp_image_urls TEXT,
      grid_x INTEGER,
      grid_y INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_user_stl_uploads_user ON user_stl_uploads(user_id);
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_user_stl_uploads_status ON user_stl_uploads(status);
  `);

  // Sharing tables
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shared_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      created_by INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_shared_projects_slug ON shared_projects(slug);
  `);

  // Reference image library table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ref_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_ref_images_owner ON ref_images(owner_id);
  `);

  // Reference images table (per-layout placements)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS reference_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      x REAL NOT NULL DEFAULT 10,
      y REAL NOT NULL DEFAULT 10,
      width REAL NOT NULL DEFAULT 50,
      height REAL NOT NULL DEFAULT 50,
      opacity REAL NOT NULL DEFAULT 0.5,
      scale REAL NOT NULL DEFAULT 1.0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      rotation INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_reference_images_layout ON reference_images(layout_id);
  `);

  // Add ref_image_id column to reference_images if missing (existing databases)
  try {
    await client.execute(
      `ALTER TABLE reference_images ADD COLUMN ref_image_id INTEGER REFERENCES ref_images(id) ON DELETE SET NULL;`,
    );
  } catch {
    // Column already exists — ignore
  }

  // Add status column to layouts if missing (existing databases)
  try {
    await client.execute(`ALTER TABLE layouts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';`);
  } catch {
    // Column already exists — ignore
  }

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_layouts_status ON layouts(status);`);

  // BOM submissions table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS bom_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_id INTEGER REFERENCES layouts(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      grid_x INTEGER NOT NULL,
      grid_y INTEGER NOT NULL,
      width_mm REAL NOT NULL,
      depth_mm REAL NOT NULL,
      total_items INTEGER NOT NULL,
      total_unique INTEGER NOT NULL,
      export_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS bom_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL UNIQUE REFERENCES bom_submissions(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      file_manifest TEXT,
      three_mf_path TEXT,
      generated_at TEXT,
      error_message TEXT
    );
  `);

  // Drop legacy shadowboxes table (replaced by user_stl_uploads)
  try {
    await client.execute(`DROP TABLE IF EXISTS shadowboxes;`);
  } catch {
    // ignore
  }

  // BOM view refactor: drop status from layouts, migrate bom_generations to use layout_id
  try {
    await client.execute(`DROP INDEX IF EXISTS idx_layouts_status;`);
  } catch {}
  try {
    await client.execute(`ALTER TABLE layouts DROP COLUMN status;`);
  } catch {}

  // Migrate bom_generations from submission_id to layout_id (idempotent)
  try {
    // Probe for layout_id column — if it exists, table is already migrated
    await client.execute(`SELECT layout_id FROM bom_generations LIMIT 1;`);
  } catch {
    // layout_id doesn't exist yet — recreate the table
    try { await client.execute(`DROP TABLE IF EXISTS bom_generations;`); } catch {}
    try { await client.execute(`DROP TABLE IF EXISTS bom_submissions;`); } catch {}
    await client.execute(`
      CREATE TABLE IF NOT EXISTS bom_generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        layout_id INTEGER NOT NULL UNIQUE REFERENCES layouts(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        export_json TEXT,
        file_manifest TEXT,
        three_mf_path TEXT,
        generated_at TEXT,
        error_message TEXT
      );
    `);
  }
}
