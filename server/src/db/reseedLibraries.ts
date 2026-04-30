import type { Client } from '@libsql/client';
import type { Logger } from 'pino';
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeParamHash } from '../utils/generationParams.js';
import { buildGenerateParams } from '../services/bomGeneration.service.js';
import { generationPipeline } from '../services/generationPipeline.service.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ManifestLibrary {
  id: string;
  name: string;
  path: string;
}

export interface Manifest {
  version: string;
  libraries: ManifestLibrary[];
}

export interface LibraryItemJson {
  id: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  stlFile?: string;
  imageUrl?: string;
  perspectiveImageUrl?: string;
}

export interface LibraryIndex {
  version: string;
  baseModel?: string;
  customizableFields?: Array<
    | { field: string; label: string; options: string[] }
    | { field: 'height'; label: string; min: number; max: number }
  >;
  parameters?: Record<string, unknown>;
  items: LibraryItemJson[];
}

export const CATEGORY_COLORS: Record<string, string> = {
  bin: '#3B82F6',
  labeled: '#8B5CF6',
  utensil: '#10B981',
  modular: '#F59E0B',
  shadowbox: '#8B5CF6',
};

export function getCategoryName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Wipes and repopulates all library-related tables from JSON files.
 * Deletes in FK-safe order, then re-inserts from manifest + index files.
 */
export async function reseedLibraryData(client: Client, logger: Logger): Promise<void> {
  // From server/src/db or server/dist/db -> 3 levels up = repo root
  const projectRoot = resolve(__dirname, '..', '..', '..');
  const publicDir = resolve(projectRoot, 'app', 'public');

  const librariesDir = process.env.LIBRARIES_DIR ?? resolve(publicDir, 'libraries');
  const imageDir = process.env.IMAGE_DIR ?? resolve(projectRoot, 'server', 'data', 'images');
  const generatorModelsDir = process.env.GENERATOR_MODELS_DIR ?? resolve(projectRoot, 'server', 'data', 'generator-models');
  const staticStlsDir = process.env.STATIC_STLS_DIR ?? resolve(projectRoot, 'server', 'data', 'static-stls');

  mkdirSync(imageDir, { recursive: true });
  mkdirSync(generatorModelsDir, { recursive: true });
  mkdirSync(staticStlsDir, { recursive: true });

  // Read manifest
  const manifestPath = resolve(librariesDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    logger.warn(`No library manifest found at: ${manifestPath} — starting with empty library`);
    return;
  }

  const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  logger.info(`Reseeding library data — found ${manifest.libraries.length} libraries in manifest`);

  // Clear existing library data (FK-safe order)
  await client.execute('DELETE FROM item_categories;');
  await client.execute('DELETE FROM library_items;');
  await client.execute('DELETE FROM categories;');
  await client.execute('DELETE FROM libraries;');
  logger.info('Cleared existing library data');

  const allCategories = new Set<string>();
  const now = new Date().toISOString();

  // Process each library
  for (let libIdx = 0; libIdx < manifest.libraries.length; libIdx++) {
    const lib = manifest.libraries[libIdx];
    const libDir = resolve(librariesDir, lib.id);
    const indexPath = resolve(libDir, 'index.json');

    if (!existsSync(indexPath)) {
      logger.warn(`Library index not found: ${indexPath}, skipping`);
      continue;
    }

    const libIndex: LibraryIndex = JSON.parse(readFileSync(indexPath, 'utf-8'));
    logger.info(`Processing library: ${lib.name} (${libIndex.items.length} items)`);

    // Copy base model (.scad) if present
    let baseModelPath: string | null = null;
    if (libIndex.baseModel) {
      const srcScad = resolve(libDir, libIndex.baseModel);
      if (existsSync(srcScad)) {
        const destScadDir = resolve(generatorModelsDir, lib.id);
        mkdirSync(destScadDir, { recursive: true });
        const destScad = resolve(destScadDir, libIndex.baseModel);
        copyFileSync(srcScad, destScad);
        baseModelPath = destScad;
        logger.info({ srcScad, destScad }, 'Copied base model');
      } else {
        logger.warn(`Base model not found: ${srcScad}`);
      }
    }

    // Insert library
    await client.execute({
      sql: `INSERT INTO libraries (id, name, description, version, is_active, sort_order, created_at, updated_at, base_model_path, parameters)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      args: [
        lib.id, lib.name, null, libIndex.version, libIdx, now, now, baseModelPath,
        libIndex.parameters ? JSON.stringify(libIndex.parameters) : null,
      ],
    });

    // Process items
    for (let itemIdx = 0; itemIdx < libIndex.items.length; itemIdx++) {
      const item = libIndex.items[itemIdx];

      // Collect categories
      for (const cat of item.categories) {
        allCategories.add(cat);
      }

      // Handle image copying
      let imagePath: string | null = null;
      if (item.imageUrl) {
        let sourceImagePath: string;
        if (item.imageUrl.startsWith('/')) {
          sourceImagePath = resolve(publicDir, item.imageUrl.slice(1));
        } else {
          sourceImagePath = resolve(libDir, item.imageUrl);
        }

        if (existsSync(sourceImagePath)) {
          const destDir = resolve(imageDir, lib.id);
          mkdirSync(destDir, { recursive: true });
          const destFilename = basename(sourceImagePath);
          const destPath = resolve(destDir, destFilename);
          copyFileSync(sourceImagePath, destPath);
          imagePath = `${lib.id}/${destFilename}`;
        } else {
          logger.warn(`Image not found: ${sourceImagePath}`);
        }
      }

      // Handle perspective image copying
      let perspectiveImagePath: string | null = null;
      if (item.perspectiveImageUrl) {
        let sourcePerspectivePath: string;
        if (item.perspectiveImageUrl.startsWith('/')) {
          sourcePerspectivePath = resolve(publicDir, item.perspectiveImageUrl.slice(1));
        } else {
          sourcePerspectivePath = resolve(libDir, item.perspectiveImageUrl);
        }

        if (existsSync(sourcePerspectivePath)) {
          const destDir = resolve(imageDir, lib.id);
          mkdirSync(destDir, { recursive: true });
          const destFilename = basename(sourcePerspectivePath);
          const destPath = resolve(destDir, destFilename);
          copyFileSync(sourcePerspectivePath, destPath);
          perspectiveImagePath = `${lib.id}/${destFilename}`;

          // Copy rotation variants (90, 180, 270) from the same source directory
          if (destFilename.endsWith('-perspective.png')) {
            const sourceDir = dirname(sourcePerspectivePath);
            for (const rotation of [90, 180, 270]) {
              const rotatedFilename = destFilename.replace(/-perspective\.png$/, `-perspective-${rotation}.png`);
              const rotatedSrcPath = resolve(sourceDir, rotatedFilename);
              if (existsSync(rotatedSrcPath)) {
                copyFileSync(rotatedSrcPath, resolve(destDir, rotatedFilename));
              }
            }
          }
        } else {
          logger.warn(`Perspective image not found: ${sourcePerspectivePath}`);
        }
      }

      // Copy static STL if present
      let stlFilePath: string | null = null;
      if (item.stlFile) {
        const srcStl = resolve(libDir, item.stlFile);
        if (existsSync(srcStl)) {
          const destStlDir = resolve(staticStlsDir, lib.id);
          mkdirSync(destStlDir, { recursive: true });
          const destStl = resolve(destStlDir, item.stlFile);
          copyFileSync(srcStl, destStl);
          stlFilePath = destStl;
        } else {
          logger.warn(`Static STL not found: ${srcStl}`);
        }
      }

      // Compute param_hash and enqueue generation for baseModel items without a static STL
      let paramHash: string | null = null;
      if (baseModelPath && !item.stlFile) {
        const itemParams = libIndex.parameters ?? {};
        const generateParams = buildGenerateParams({
          widthUnits: item.widthUnits,
          heightUnits: item.heightUnits,
          customization: { wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false }, height: 4 },
          qty: 1,
          filename: 'bin.stl',
          baseModelPath,
          parameters: Object.keys(itemParams).length > 0 ? (itemParams as Record<string, unknown>) : undefined,
        });
        paramHash = computeParamHash(generateParams as Record<string, unknown>);
        void generationPipeline.seed(paramHash, generateParams as Record<string, unknown>, baseModelPath);
      }

      // Insert item
      await client.execute({
        sql: `INSERT INTO library_items (library_id, id, name, width_units, height_units, color, image_path, perspective_image_path, is_active, sort_order, created_at, updated_at, stl_file, param_hash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
        args: [lib.id, item.id, item.name, item.widthUnits, item.heightUnits, item.color, imagePath, perspectiveImagePath, itemIdx, now, now, stlFilePath, paramHash],
      });
    }
  }

  // Insert categories
  const sortedCategories = Array.from(allCategories).sort();
  for (let i = 0; i < sortedCategories.length; i++) {
    const catId = sortedCategories[i];
    await client.execute({
      sql: `INSERT INTO categories (id, name, color, sort_order) VALUES (?, ?, ?, ?)`,
      args: [catId, getCategoryName(catId), CATEGORY_COLORS[catId] ?? null, i],
    });
  }
  logger.info(`Inserted ${sortedCategories.length} categories: ${sortedCategories.join(', ')}`);

  // Insert item_categories junction entries
  for (const lib of manifest.libraries) {
    const libDir = resolve(librariesDir, lib.id);
    const indexPath = resolve(libDir, 'index.json');
    if (!existsSync(indexPath)) continue;

    const libIndex: LibraryIndex = JSON.parse(readFileSync(indexPath, 'utf-8'));

    for (const item of libIndex.items) {
      for (const catId of item.categories) {
        await client.execute({
          sql: `INSERT INTO item_categories (library_id, item_id, category_id) VALUES (?, ?, ?)`,
          args: [lib.id, item.id, catId],
        });
      }
    }
  }

  // Seed-time cleanup: delete library/{hash} dirs not referenced by any current library item
  const hashRows = await client.execute(`SELECT DISTINCT param_hash FROM library_items WHERE param_hash IS NOT NULL`);
  const currentHashes = new Set(hashRows.rows.map(r => r.param_hash as string));

  const libraryGenDir = resolve(config.GENERATED_STL_DIR, 'library');
  if (existsSync(libraryGenDir)) {
    const { readdir, rm: rmDir } = await import('node:fs/promises');
    const entries = await readdir(libraryGenDir).catch(() => [] as string[]);
    for (const hash of entries) {
      if (!currentHashes.has(hash)) {
        await rmDir(resolve(libraryGenDir, hash), { recursive: true, force: true });
        logger.info({ hash }, 'Removed stale library generation dir');
      }
    }
  }

  // Log summary
  const libCount = await client.execute('SELECT COUNT(*) as count FROM libraries');
  const itemCount = await client.execute('SELECT COUNT(*) as count FROM library_items');
  const catCount = await client.execute('SELECT COUNT(*) as count FROM categories');
  const junctionCount = await client.execute('SELECT COUNT(*) as count FROM item_categories');

  logger.info(
    `Reseed complete — Libraries: ${libCount.rows[0].count}, Items: ${itemCount.rows[0].count}, Categories: ${catCount.rows[0].count}, Item-Category links: ${junctionCount.rows[0].count}`
  );
}
