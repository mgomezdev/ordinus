import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { validateCuratedLibrary } from '@gridfinity/shared';
import type { CuratedLibrary } from '@gridfinity/shared';
import { client } from '../db/connection.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await client.execute('SELECT definition FROM curated_libraries ORDER BY rowid');
    res.json({ data: rows.rows.map(row => JSON.parse(String(row.definition)) as CuratedLibrary) });
  } catch (error) { next(error); }
});

async function save(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const errors = validateCuratedLibrary(req.body);
    if (errors.length) { res.status(400).json({ error: { message: errors.join('; ') } }); return; }
    const library = req.body as CuratedLibrary;
    if (req.method === 'PUT' && req.params.id !== library.id) {
      res.status(400).json({ error: { message: 'Library id cannot be changed' } }); return;
    }
    // A reference cannot claim editable dimensions or resize an existing fixed model.
    for (const entry of library.entries) {
      if (entry.kind !== 'fixed') continue;
      const colon = entry.sourceId.indexOf(':');
      const libraryId = entry.sourceId.slice(0, colon), itemId = entry.sourceId.slice(colon + 1);
      const source = libraryId === 'user-stl'
        ? await client.execute({ sql: "SELECT grid_x AS width_units, grid_y AS height_units FROM user_stl_uploads WHERE id = ? AND status = 'ready'", args: [itemId] })
        : await client.execute({ sql: `SELECT i.width_units, i.height_units FROM library_items i
        JOIN libraries l ON i.library_id = l.id WHERE i.library_id = ? AND i.id = ? AND i.is_active = 1 AND l.is_active = 1`,
        args: [libraryId, itemId] });
      const row = source.rows[0];
      if (!row || row.width_units !== entry.width || row.height_units !== entry.depth) {
        res.status(400).json({ error: { message: `${entry.name}: source is unavailable or its footprint changed; choose the source again` } }); return;
      }
    }
    if (req.method === 'POST') {
      // Atomic conflict handling protects simultaneous authors from overwriting a collection.
      const result = await client.execute({ sql: 'INSERT INTO curated_libraries (id, definition) VALUES (?, ?) ON CONFLICT(id) DO NOTHING', args: [library.id, JSON.stringify(library)] });
      if (!result.rowsAffected) { res.status(409).json({ error: { message: 'Library already exists' } }); return; }
      res.status(201).json({ data: library });
    } else {
      const result = await client.execute({ sql: 'UPDATE curated_libraries SET definition = ? WHERE id = ?', args: [JSON.stringify(library), library.id] });
      if (!result.rowsAffected) { res.status(404).json({ error: { message: 'Library not found' } }); return; }
      res.json({ data: library });
    }
  } catch (error) { next(error); }
}

router.post('/', save);
router.put('/:id', save);
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await client.execute({ sql: 'DELETE FROM curated_libraries WHERE id = ?', args: [req.params.id] });
    if (!result.rowsAffected) { res.status(404).json({ error: { message: 'Library not found' } }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
