import type { Client } from '@libsql/client';

export const version = 1;
export const name = 'baseline_schema';

export async function up(client: Client): Promise<void> {
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

  try {
    await client.execute(`ALTER TABLE library_items ADD COLUMN perspective_image_path TEXT;`);
  } catch { /* Column already exists */ }

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

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_library_items_library_id ON library_items(library_id);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_item_categories_category_id ON item_categories(category_id);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_item_categories_item ON item_categories(library_id, item_id);`);

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

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);`);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS customer_parts (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      part_id TEXT NOT NULL REFERENCES user_stl_uploads(id) ON DELETE CASCADE,
      PRIMARY KEY (customer_id, part_id)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS customer_ref_images (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      ref_image_id INTEGER NOT NULL REFERENCES ref_images(id) ON DELETE CASCADE,
      PRIMARY KEY (customer_id, ref_image_id)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS layouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
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

  try {
    await client.execute(`SELECT customer_id FROM layouts LIMIT 1;`);
  } catch {
    try {
      await client.execute(`ALTER TABLE layouts RENAME TO layouts_old;`);
      await client.execute(`
        CREATE TABLE layouts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
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
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          thumbnail_path TEXT
        );
      `);
      await client.execute(`
        INSERT INTO layouts (id, user_id, name, description, grid_x, grid_y, width_mm, depth_mm,
          spacer_horizontal, spacer_vertical, is_public, created_at, updated_at, thumbnail_path)
        SELECT id, user_id, name, description, grid_x, grid_y, width_mm, depth_mm,
          spacer_horizontal, spacer_vertical, is_public, created_at, updated_at, thumbnail_path
        FROM layouts_old;
      `);
      await client.execute(`DROP TABLE layouts_old;`);
    } catch { /* ignore */ }
  }

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_layouts_user ON layouts(user_id);`);
  try { await client.execute(`CREATE INDEX IF NOT EXISTS idx_layouts_customer ON layouts(customer_id);`); } catch { /* ignore */ }

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

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_placed_items_layout ON placed_items(layout_id);`);

  try {
    await client.execute(`ALTER TABLE placed_items ADD COLUMN customization TEXT;`);
  } catch { /* Column already exists */ }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_storage (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      layout_count INTEGER NOT NULL DEFAULT 0,
      image_bytes INTEGER NOT NULL DEFAULT 0,
      max_layouts INTEGER NOT NULL DEFAULT 50,
      max_image_bytes INTEGER NOT NULL DEFAULT 52428800
    );
  `);

  try {
    await client.execute(`ALTER TABLE user_storage ADD COLUMN max_user_stls INTEGER NOT NULL DEFAULT 50;`);
  } catch { /* Column already exists */ }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_stl_uploads (
      id TEXT NOT NULL PRIMARY KEY,
      user_id INTEGER,
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

  try {
    const tableInfo = await client.execute(`PRAGMA table_info(user_stl_uploads);`);
    const userIdCol = tableInfo.rows.find((r) => r['name'] === 'user_id');
    if (userIdCol && userIdCol['notnull'] === 1) {
      await client.execute(`ALTER TABLE user_stl_uploads RENAME TO user_stl_uploads_old;`);
      await client.execute(`
        CREATE TABLE user_stl_uploads (
          id TEXT NOT NULL PRIMARY KEY,
          user_id INTEGER,
          name TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          file_path TEXT NOT NULL,
          image_url TEXT,
          persp_image_urls TEXT,
          grid_x INTEGER,
          grid_y INTEGER,
          grid_z INTEGER,
          visibility TEXT NOT NULL DEFAULT 'private',
          status TEXT NOT NULL DEFAULT 'pending',
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      await client.execute(`
        INSERT INTO user_stl_uploads (id, user_id, name, original_filename, file_path, image_url,
          persp_image_urls, grid_x, grid_y, grid_z, visibility, status, error_message, created_at, updated_at)
        SELECT id, user_id, name, original_filename, file_path, image_url,
          persp_image_urls, grid_x, grid_y, grid_z, visibility, status, error_message, created_at, updated_at
        FROM user_stl_uploads_old;
      `);
      await client.execute(`DROP TABLE user_stl_uploads_old;`);
    }
  } catch { /* ignore */ }

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_user_stl_uploads_user ON user_stl_uploads(user_id);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_user_stl_uploads_status ON user_stl_uploads(status);`);

  try { await client.execute(`ALTER TABLE user_stl_uploads ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE user_stl_uploads ADD COLUMN grid_z INTEGER;`); } catch { /* exists */ }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS shared_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      created_by INTEGER,
      expires_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  try {
    const tableInfo = await client.execute(`PRAGMA table_info(shared_projects);`);
    const createdByCol = tableInfo.rows.find((r) => r['name'] === 'created_by');
    if (createdByCol && createdByCol['notnull'] === 1) {
      await client.execute(`ALTER TABLE shared_projects RENAME TO shared_projects_old;`);
      await client.execute(`
        CREATE TABLE shared_projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
          slug TEXT NOT NULL UNIQUE,
          created_by INTEGER,
          expires_at TEXT,
          view_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      await client.execute(`
        INSERT INTO shared_projects (id, layout_id, slug, created_by, expires_at, view_count, created_at)
        SELECT id, layout_id, slug, created_by, expires_at, view_count, created_at
        FROM shared_projects_old;
      `);
      await client.execute(`DROP TABLE shared_projects_old;`);
    }
  } catch { /* ignore */ }

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_shared_projects_slug ON shared_projects(slug);`);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ref_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  try {
    await client.execute(`SELECT uploaded_by FROM ref_images LIMIT 1;`);
    await client.execute(`ALTER TABLE ref_images RENAME TO ref_images_old;`);
    await client.execute(`
      CREATE TABLE ref_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await client.execute(`INSERT INTO ref_images (id, name, file_path, file_size, created_at) SELECT id, name, file_path, file_size, created_at FROM ref_images_old;`);
    await client.execute(`DROP TABLE ref_images_old;`);
  } catch { /* already migrated */ }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      library_id TEXT NOT NULL,
      library_item_id TEXT NOT NULL,
      library_item_name TEXT NOT NULL,
      width_units INTEGER NOT NULL,
      height_units INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      param_hash TEXT,
      image_url TEXT NOT NULL DEFAULT '',
      perspective_image_url TEXT,
      perspective_image_url90 TEXT,
      perspective_image_url180 TEXT,
      perspective_image_url270 TEXT,
      customization TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  try {
    const tableInfo = await client.execute(`PRAGMA table_info(favorites);`);
    const userIdCol = tableInfo.rows.find((r) => r['name'] === 'user_id');
    if (userIdCol && userIdCol['notnull'] === 1) {
      await client.execute(`ALTER TABLE favorites RENAME TO favorites_old;`);
      await client.execute(`
        CREATE TABLE favorites (
          id TEXT PRIMARY KEY,
          user_id INTEGER,
          name TEXT NOT NULL,
          library_id TEXT NOT NULL,
          library_item_id TEXT NOT NULL,
          library_item_name TEXT NOT NULL,
          width_units INTEGER NOT NULL,
          height_units INTEGER NOT NULL,
          color TEXT NOT NULL DEFAULT '#3B82F6',
          param_hash TEXT,
          image_url TEXT NOT NULL DEFAULT '',
          perspective_image_url TEXT,
          perspective_image_url90 TEXT,
          perspective_image_url180 TEXT,
          perspective_image_url270 TEXT,
          customization TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
      await client.execute(`INSERT INTO favorites SELECT * FROM favorites_old;`);
      await client.execute(`DROP TABLE favorites_old;`);
    }
  } catch { /* ignore */ }

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

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_reference_images_layout ON reference_images(layout_id);`);

  try {
    await client.execute(`ALTER TABLE reference_images ADD COLUMN ref_image_id INTEGER REFERENCES ref_images(id) ON DELETE SET NULL;`);
  } catch { /* exists */ }

  try { await client.execute(`DROP TABLE IF EXISTS shadowboxes;`); } catch { /* ignore */ }

  try { await client.execute(`DROP INDEX IF EXISTS idx_layouts_status;`); } catch { /* ignore */ }
  try { await client.execute(`ALTER TABLE layouts DROP COLUMN status;`); } catch { /* ignore */ }

  try {
    await client.execute(`SELECT layout_id FROM bom_generations LIMIT 1;`);
  } catch {
    try { await client.execute(`DROP TABLE IF EXISTS bom_generations;`); } catch { /* ignore */ }
    try { await client.execute(`DROP TABLE IF EXISTS bom_submissions;`); } catch { /* ignore */ }
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

  try { await client.execute(`ALTER TABLE libraries ADD COLUMN base_model_path TEXT;`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE library_items ADD COLUMN stl_file TEXT;`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE library_items ADD COLUMN param_hash TEXT;`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE libraries ADD COLUMN parameters TEXT;`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE layouts ADD COLUMN thumbnail_path TEXT;`); } catch { /* exists */ }
  try { await client.execute(`ALTER TABLE bom_generations ADD COLUMN themis_project_id INTEGER;`); } catch { /* exists */ }
}

export async function down(client: Client): Promise<void> {
  // Drop tables in reverse FK dependency order
  const tables = [
    'bom_generations',
    'reference_images',
    'placed_items',
    'shared_projects',
    'customer_ref_images',
    'customer_parts',
    'item_categories',
    'favorites',
    'user_stl_uploads',
    'user_storage',
    'refresh_tokens',
    'layouts',
    'customers',
    'ref_images',
    'categories',
    'library_items',
    'libraries',
    'users',
  ];
  for (const t of tables) {
    await client.execute(`DROP TABLE IF EXISTS ${t}`);
  }
}
