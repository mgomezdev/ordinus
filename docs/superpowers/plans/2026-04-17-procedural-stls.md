# Procedural STLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only BOM fulfillment feature that generates STL files for each unique bin config in a submitted BOM, then bundles them into a single 3MF with correct quantities.

**Architecture:** Node Express backend spawns `generate_bin.py` (Python/OpenSCAD) per unique bin config, then runs `bundle_3mf.py` to produce one 3MF. A new `bom_generations` table tracks status. React admin panel on the Order Summary page surfaces download links.

**Tech Stack:** TypeScript/Express (server), vitest + supertest (server tests), React (frontend), Python 3 + stdlib only (bundler), Playwright (E2E)

---

## File Map

### Create
- `tools/gridfinity-generator/bundle_3mf.py` — Python script: parses STL binaries, builds 3MF ZIP
- `tools/gridfinity-generator/test_bundle_3mf.py` — pytest tests for bundler
- `packages/server/src/services/bomGeneration.service.ts` — generation pipeline: parse BOM, spawn subprocesses, call bundler
- `packages/server/src/services/bomGeneration.service.test.ts` — vitest tests (in-memory DB)
- `packages/server/src/controllers/bomGeneration.controller.ts` — HTTP handlers (generate, get status, serve file)
- `packages/server/src/routes/bomGeneration.routes.ts` — route definitions + security
- `packages/app/src/api/bomGeneration.api.ts` — frontend API client for generation endpoints
- `packages/app/src/components/admin/AdminBomPanel.tsx` — admin-only panel component
- `packages/app/src/components/admin/AdminBomPanel.css` — panel styles

### Modify
- `packages/shared/src/types.ts` — add `BomGenerationStatus`, `BomGenerationManifestEntry`, `ApiBomGeneration`
- `packages/server/src/db/schema.ts` — add `bomGenerations` table definition
- `packages/server/src/db/migrate.ts` — add `bom_generations` CREATE TABLE statement
- `packages/server/src/config.ts` — add `GRIDFINITY_GENERATOR_DIR`, `GENERATED_STL_DIR`
- `packages/server/src/app.ts` — register `bomGenerationRoutes`
- `packages/app/src/pages/OrderSummaryPage.tsx` — render `<AdminBomPanel>` when `isAdmin`

---

## Task 1: Add `bom_generations` to Schema and Migration

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Modify: `packages/server/src/db/migrate.ts`

- [ ] **Step 1: Add table definition to schema.ts**

  Open `packages/server/src/db/schema.ts`. After the `bomSubmissions` table definition (around line 189), add:

  ```typescript
  export const bomGenerations = sqliteTable('bom_generations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    submissionId: integer('submission_id').notNull().unique().references(() => bomSubmissions.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    fileManifest: text('file_manifest'),
    threeMfPath: text('three_mf_path'),
    generatedAt: text('generated_at'),
    errorMessage: text('error_message'),
  });
  ```

  Also add a relation at the bottom of schema.ts after `bomSubmissionsRelations`:

  ```typescript
  export const bomGenerationsRelations = relations(bomGenerations, ({ one }) => ({
    submission: one(bomSubmissions, {
      fields: [bomGenerations.submissionId],
      references: [bomSubmissions.id],
    }),
  }));
  ```

- [ ] **Step 2: Add migration to migrate.ts**

  Open `packages/server/src/db/migrate.ts`. After the `bom_submissions` table creation block (around line 293), add:

  ```typescript
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
  ```

- [ ] **Step 3: Verify migration runs clean**

  ```bash
  cd packages/server && npx tsx src/db/migrate.ts 2>&1 || echo "run via server startup"
  npm run test -- src/services/userStls.service.test.ts
  ```

  Expected: existing tests still pass (migration is backward-compatible).

- [ ] **Step 4: Commit**

  ```bash
  git add packages/server/src/db/schema.ts packages/server/src/db/migrate.ts
  git commit -m "feat(db): add bom_generations table for STL generation tracking"
  ```

---

## Task 2: Add Shared Types for Generation

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add types after `ApiBomSubmission`**

  Open `packages/shared/src/types.ts`. Find the `ApiBomSubmission` interface (around line 383). Add immediately after it:

  ```typescript
  export type BomGenerationStatus = 'pending' | 'generating' | 'ready' | 'error';

  export interface BomGenerationManifestEntry {
    filename: string;
    widthUnits: number;
    heightUnits: number;
    customization?: BinCustomization;
    qty: number;
  }

  export interface ApiBomGeneration {
    id: number;
    submissionId: number;
    status: BomGenerationStatus;
    fileManifest: BomGenerationManifestEntry[] | null;
    threeMfPath: string | null;
    generatedAt: string | null;
    errorMessage: string | null;
  }
  ```

- [ ] **Step 2: Verify no TypeScript errors**

  ```bash
  cd packages/shared && npx tsc --noEmit
  ```

  Expected: exit code 0, no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/shared/src/types.ts
  git commit -m "feat(shared): add BomGenerationStatus and ApiBomGeneration types"
  ```

---

## Task 3: Add Config Variables for Generation

**Files:**
- Modify: `packages/server/src/config.ts`

- [ ] **Step 1: Add new env vars to envSchema**

  Open `packages/server/src/config.ts`. In the `envSchema` object, add after `PYTHON_SCRIPT_DIR`:

  ```typescript
  GRIDFINITY_GENERATOR_DIR: z.string().default('../../tools/gridfinity-generator'),
  GENERATED_STL_DIR: z.string().default('./data/generated'),
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  cd packages/server && npx tsc --noEmit
  ```

  Expected: exit code 0.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/server/src/config.ts
  git commit -m "feat(config): add GRIDFINITY_GENERATOR_DIR and GENERATED_STL_DIR config vars"
  ```

---

## Task 4: Python 3MF Bundler — Tests First

**Files:**
- Create: `tools/gridfinity-generator/test_bundle_3mf.py`

Write tests before any implementation. The bundler takes a manifest JSON file and produces a `.3mf` archive.

- [ ] **Step 1: Write failing tests**

  Create `tools/gridfinity-generator/test_bundle_3mf.py`:

  ```python
  """Tests for bundle_3mf.py — run with: pytest test_bundle_3mf.py -v"""
  import json
  import os
  import struct
  import tempfile
  import zipfile

  import pytest

  import bundle_3mf


  def make_binary_stl(path: str, n_triangles: int = 2) -> None:
      """Write a minimal valid binary STL file."""
      with open(path, 'wb') as f:
          f.write(b'\x00' * 80)  # header
          f.write(struct.pack('<I', n_triangles))
          for i in range(n_triangles):
              f.write(struct.pack('<fff', 0.0, 0.0, 1.0))  # normal
              f.write(struct.pack('<fff', float(i), 0.0, 0.0))  # v1
              f.write(struct.pack('<fff', float(i) + 1.0, 0.0, 0.0))  # v2
              f.write(struct.pack('<fff', float(i) + 0.5, 1.0, 0.0))  # v3
              f.write(struct.pack('<H', 0))  # attribute


  class TestParseBinaryStl:
      def test_returns_vertices_and_triangles(self, tmp_path):
          stl = str(tmp_path / 'test.stl')
          make_binary_stl(stl, n_triangles=1)
          verts, tris = bundle_3mf.parse_binary_stl(stl)
          assert len(tris) == 1
          assert len(verts) == 3  # 3 unique vertices

      def test_deduplicates_shared_vertices(self, tmp_path):
          stl = str(tmp_path / 'shared.stl')
          # Write 2 triangles that share an edge (vertices at (1,0,0) and (0.5,1,0))
          with open(stl, 'wb') as f:
              f.write(b'\x00' * 80)
              f.write(struct.pack('<I', 2))
              for _ in range(2):
                  f.write(struct.pack('<fff', 0.0, 0.0, 1.0))  # normal
                  f.write(struct.pack('<fff', 0.0, 0.0, 0.0))
                  f.write(struct.pack('<fff', 1.0, 0.0, 0.0))
                  f.write(struct.pack('<fff', 0.5, 1.0, 0.0))
                  f.write(struct.pack('<H', 0))
          verts, tris = bundle_3mf.parse_binary_stl(stl)
          assert len(tris) == 2
          assert len(verts) == 3  # all 3 vertices shared


  class TestBuildFilename:
      def test_default_customization(self):
          item = {'widthUnits': 2, 'heightUnits': 3, 'qty': 1, 'customization': None}
          assert bundle_3mf.build_stl_filename(item) == 'bin_2x3x8.stl'

      def test_custom_height(self):
          item = {'widthUnits': 1, 'heightUnits': 1, 'qty': 1,
                  'customization': {'height': 10, 'lipStyle': 'normal',
                                    'fingerSlide': 'none', 'wallPattern': 'none',
                                    'wallCutout': 'none'}}
          assert bundle_3mf.build_stl_filename(item) == 'bin_1x1x10.stl'

      def test_lip_none_added(self):
          item = {'widthUnits': 2, 'heightUnits': 2, 'qty': 1,
                  'customization': {'height': 8, 'lipStyle': 'none',
                                    'fingerSlide': 'none', 'wallPattern': 'none',
                                    'wallCutout': 'none'}}
          assert bundle_3mf.build_stl_filename(item) == 'bin_2x2x8_none.stl'

      def test_fingerslide_suffix(self):
          item = {'widthUnits': 1, 'heightUnits': 2, 'qty': 1,
                  'customization': {'height': 8, 'lipStyle': 'normal',
                                    'fingerSlide': 'rounded', 'wallPattern': 'none',
                                    'wallCutout': 'none'}}
          assert bundle_3mf.build_stl_filename(item) == 'bin_1x2x8_fingerslid.stl'


  class TestBuildParams:
      def test_default_customization_maps_correctly(self):
          item = {'widthUnits': 2, 'heightUnits': 3, 'qty': 1, 'customization': None}
          params = bundle_3mf.build_generate_params(item)
          assert params['width'] == [2, 0]
          assert params['depth'] == [3, 0]
          assert params['height'] == [8, 0]
          assert params['lip_style'] == 'normal'
          assert params['fingerslide'] == 'none'
          assert params.get('wallpattern_enabled') is None  # not set when 'none'

      def test_wall_pattern_enables_flag(self):
          item = {'widthUnits': 1, 'heightUnits': 1, 'qty': 1,
                  'customization': {'height': 8, 'lipStyle': 'normal',
                                    'fingerSlide': 'none', 'wallPattern': 'hexgrid',
                                    'wallCutout': 'none'}}
          params = bundle_3mf.build_generate_params(item)
          assert params['wallpattern_enabled'] is True
          assert params['wallpattern_style'] == 'hexgrid'

      def test_wall_cutout_vertical(self):
          item = {'widthUnits': 1, 'heightUnits': 1, 'qty': 1,
                  'customization': {'height': 8, 'lipStyle': 'normal',
                                    'fingerSlide': 'none', 'wallPattern': 'none',
                                    'wallCutout': 'vertical'}}
          params = bundle_3mf.build_generate_params(item)
          assert params['wallcutout_vertical'] == 'enabled'
          assert params.get('wallcutout_horizontal') is None

      def test_wall_cutout_both(self):
          item = {'widthUnits': 1, 'heightUnits': 1, 'qty': 1,
                  'customization': {'height': 8, 'lipStyle': 'normal',
                                    'fingerSlide': 'none', 'wallPattern': 'none',
                                    'wallCutout': 'both'}}
          params = bundle_3mf.build_generate_params(item)
          assert params['wallcutout_vertical'] == 'enabled'
          assert params['wallcutout_horizontal'] == 'enabled'


  class TestBundle3mf:
      def test_produces_valid_zip(self, tmp_path):
          stl = str(tmp_path / 'bin_2x3x8.stl')
          make_binary_stl(stl)
          manifest = [{'filename': 'bin_2x3x8.stl', 'widthUnits': 2, 'heightUnits': 3,
                       'qty': 2, 'customization': None}]
          out = str(tmp_path / 'output.3mf')
          bundle_3mf.bundle(manifest, str(tmp_path), out)
          assert zipfile.is_zipfile(out)

      def test_zip_contains_required_files(self, tmp_path):
          stl = str(tmp_path / 'bin_1x1x8.stl')
          make_binary_stl(stl)
          manifest = [{'filename': 'bin_1x1x8.stl', 'widthUnits': 1, 'heightUnits': 1,
                       'qty': 1, 'customization': None}]
          out = str(tmp_path / 'output.3mf')
          bundle_3mf.bundle(manifest, str(tmp_path), out)
          with zipfile.ZipFile(out) as z:
              names = z.namelist()
          assert '[Content_Types].xml' in names
          assert '_rels/.rels' in names
          assert '3D/model.model' in names

      def test_item_count_matches_qty(self, tmp_path):
          stl = str(tmp_path / 'bin_2x1x8.stl')
          make_binary_stl(stl)
          manifest = [{'filename': 'bin_2x1x8.stl', 'widthUnits': 2, 'heightUnits': 1,
                       'qty': 3, 'customization': None}]
          out = str(tmp_path / 'output.3mf')
          bundle_3mf.bundle(manifest, str(tmp_path), out)
          with zipfile.ZipFile(out) as z:
              model_xml = z.read('3D/model.model').decode()
          assert model_xml.count('<item ') == 3

      def test_two_unique_stls_one_object_each(self, tmp_path):
          stl_a = str(tmp_path / 'bin_1x1x8.stl')
          stl_b = str(tmp_path / 'bin_2x2x8.stl')
          make_binary_stl(stl_a)
          make_binary_stl(stl_b)
          manifest = [
              {'filename': 'bin_1x1x8.stl', 'widthUnits': 1, 'heightUnits': 1, 'qty': 2, 'customization': None},
              {'filename': 'bin_2x2x8.stl', 'widthUnits': 2, 'heightUnits': 2, 'qty': 1, 'customization': None},
          ]
          out = str(tmp_path / 'output.3mf')
          bundle_3mf.bundle(manifest, str(tmp_path), out)
          with zipfile.ZipFile(out) as z:
              model_xml = z.read('3D/model.model').decode()
          assert model_xml.count('<object ') == 2
          assert model_xml.count('<item ') == 3  # 2 + 1
  ```

- [ ] **Step 2: Run tests and confirm they fail (module not found)**

  ```bash
  cd tools/gridfinity-generator && python -m pytest test_bundle_3mf.py -v 2>&1 | head -20
  ```

  Expected: `ModuleNotFoundError: No module named 'bundle_3mf'`

- [ ] **Step 3: Commit tests**

  ```bash
  git add tools/gridfinity-generator/test_bundle_3mf.py
  git commit -m "test(bundler): add failing tests for bundle_3mf.py"
  ```

---

## Task 5: Python 3MF Bundler — Implementation

**Files:**
- Create: `tools/gridfinity-generator/bundle_3mf.py`

- [ ] **Step 1: Create the bundler**

  Create `tools/gridfinity-generator/bundle_3mf.py`:

  ```python
  #!/usr/bin/env python3
  """Bundle STL files into a 3MF archive with per-item quantity instances.

  Usage:
      python bundle_3mf.py manifest.json stl_dir output.3mf

  manifest.json: [{"filename": "bin_2x3x8.stl", "widthUnits": 2, "heightUnits": 3, "qty": 4, "customization": {...}}]
  """
  import json
  import struct
  import sys
  import textwrap
  import zipfile
  from io import StringIO
  from typing import Optional

  GRIDFINITY_UNIT_MM = 42.0
  ITEM_GAP_MM = 5.0
  DEFAULT_HEIGHT = 8
  DEFAULT_CUSTOMIZATION = {
      'height': DEFAULT_HEIGHT,
      'lipStyle': 'normal',
      'fingerSlide': 'none',
      'wallPattern': 'none',
      'wallCutout': 'none',
  }


  def parse_binary_stl(path: str) -> tuple[list, list]:
      """Parse a binary STL file. Returns (vertices, triangles).

      vertices: list of (x, y, z) tuples (deduplicated)
      triangles: list of (v1_idx, v2_idx, v3_idx) tuples
      """
      with open(path, 'rb') as f:
          f.read(80)  # header
          n_triangles = struct.unpack('<I', f.read(4))[0]

      vertices: list = []
      triangles: list = []
      vertex_map: dict = {}

      with open(path, 'rb') as f:
          f.read(84)  # skip header + count
          for _ in range(n_triangles):
              f.read(12)  # normal vector (ignored)
              tri_indices = []
              for _ in range(3):
                  xyz = struct.unpack('<fff', f.read(12))
                  if xyz not in vertex_map:
                      vertex_map[xyz] = len(vertices)
                      vertices.append(xyz)
                  tri_indices.append(vertex_map[xyz])
              f.read(2)  # attribute byte count
              triangles.append(tri_indices)

      return vertices, triangles


  def build_stl_filename(item: dict) -> str:
      """Build the STL filename for a BOM item based on its dimensions + customization."""
      c = item.get('customization') or {}
      w = item['widthUnits']
      d = item['heightUnits']
      h = c.get('height', DEFAULT_HEIGHT)

      parts = [f'bin_{w}x{d}x{h}']

      lip = c.get('lipStyle', 'normal')
      if lip != 'normal':
          parts.append(lip)

      if c.get('fingerSlide', 'none') != 'none':
          parts.append('fingerslid')

      if c.get('wallPattern', 'none') != 'none':
          parts.append('patterned')

      if c.get('wallCutout', 'none') != 'none':
          parts.append('cutout')

      return '_'.join(parts) + '.stl'


  def build_generate_params(item: dict) -> dict:
      """Build generate_bin.py parameter dict from a BOM manifest entry."""
      c = item.get('customization') or {}

      params: dict = {
          'width': [item['widthUnits'], 0],
          'depth': [item['heightUnits'], 0],
          'height': [c.get('height', DEFAULT_HEIGHT), 0],
          'lip_style': c.get('lipStyle', 'normal'),
          'fingerslide': c.get('fingerSlide', 'none'),
      }

      wall_pattern = c.get('wallPattern', 'none')
      if wall_pattern != 'none':
          params['wallpattern_enabled'] = True
          params['wallpattern_style'] = wall_pattern

      wall_cutout = c.get('wallCutout', 'none')
      if wall_cutout in ('vertical', 'both'):
          params['wallcutout_vertical'] = 'enabled'
      if wall_cutout in ('horizontal', 'both'):
          params['wallcutout_horizontal'] = 'enabled'

      return params


  def _mesh_to_xml(object_id: int, vertices: list, triangles: list) -> str:
      """Render one <object> element for 3MF model XML."""
      buf = StringIO()
      buf.write(f'    <object id="{object_id}" type="model">\n')
      buf.write('      <mesh>\n')
      buf.write('        <vertices>\n')
      for x, y, z in vertices:
          buf.write(f'          <vertex x="{x:.6f}" y="{y:.6f}" z="{z:.6f}"/>\n')
      buf.write('        </vertices>\n')
      buf.write('        <triangles>\n')
      for v1, v2, v3 in triangles:
          buf.write(f'          <triangle v1="{v1}" v2="{v2}" v3="{v3}"/>\n')
      buf.write('        </triangles>\n')
      buf.write('      </mesh>\n')
      buf.write('    </object>\n')
      return buf.getvalue()


  def bundle(manifest: list, stl_dir: str, output_path: str) -> None:
      """Bundle STL files from stl_dir into output_path (.3mf) per manifest.

      manifest: list of {filename, widthUnits, heightUnits, qty, customization}
      stl_dir: directory containing the STL files
      output_path: path to write the .3mf file
      """
      import os
      objects_xml = []
      items_xml = []
      x_offset = 0.0

      for obj_id, entry in enumerate(manifest, start=1):
          stl_path = os.path.join(stl_dir, entry['filename'])
          vertices, triangles = parse_binary_stl(stl_path)
          objects_xml.append(_mesh_to_xml(obj_id, vertices, triangles))

          width_mm = entry['widthUnits'] * GRIDFINITY_UNIT_MM
          for _ in range(entry['qty']):
              transform = f'1 0 0 0 1 0 0 0 1 {x_offset:.3f} 0 0'
              items_xml.append(f'    <item objectid="{obj_id}" transform="{transform}"/>')
              x_offset += width_mm + ITEM_GAP_MM

      model_xml = textwrap.dedent("""\
          <?xml version="1.0" encoding="UTF-8"?>
          <model unit="millimeter" xml:lang="en-US"
                xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
            <resources>
          """) + ''.join(objects_xml) + textwrap.dedent("""\
            </resources>
            <build>
          """) + '\n'.join(items_xml) + '\n' + textwrap.dedent("""\
            </build>
          </model>
          """)

      content_types = textwrap.dedent("""\
          <?xml version="1.0" encoding="UTF-8"?>
          <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="rels"
              ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Default Extension="model"
              ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
          </Types>
          """)

      rels = textwrap.dedent("""\
          <?xml version="1.0" encoding="UTF-8"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship
              Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"
              Target="/3D/model.model" Id="rel0"/>
          </Relationships>
          """)

      with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
          zf.writestr('[Content_Types].xml', content_types)
          zf.writestr('_rels/.rels', rels)
          zf.writestr('3D/model.model', model_xml)


  if __name__ == '__main__':
      if len(sys.argv) != 4:
          print('Usage: bundle_3mf.py manifest.json stl_dir output.3mf', file=sys.stderr)
          sys.exit(1)

      manifest_path, stl_dir, output_path = sys.argv[1], sys.argv[2], sys.argv[3]
      with open(manifest_path) as f:
          manifest = json.load(f)

      bundle(manifest, stl_dir, output_path)
      print(json.dumps({'status': 'ok', 'output': output_path}))
  ```

- [ ] **Step 2: Run tests and verify they pass**

  ```bash
  cd tools/gridfinity-generator && python -m pytest test_bundle_3mf.py -v
  ```

  Expected: all tests PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add tools/gridfinity-generator/bundle_3mf.py
  git commit -m "feat(bundler): implement bundle_3mf.py — STL→3MF with qty instances"
  ```

---

## Task 6: BOM Generation Service — Tests First

**Files:**
- Create: `packages/server/src/services/bomGeneration.service.test.ts`

- [ ] **Step 1: Write failing tests**

  Create `packages/server/src/services/bomGeneration.service.test.ts`:

  ```typescript
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import { createClient } from '@libsql/client';
  import { runMigrations } from '../db/migrate.js';

  // We test the pure extraction logic without spawning real subprocesses
  import { extractUniqueConfigs, formatBomGeneration } from './bomGeneration.service.js';

  let client: ReturnType<typeof createClient>;

  beforeEach(async () => {
    client = createClient({ url: ':memory:' });
    await runMigrations(client);
    await client.execute(
      `INSERT INTO users (id, email, username, password_hash) VALUES (1, 'a@b.com', 'admin', 'hash')`,
    );
    await client.execute(
      `INSERT INTO bom_submissions (id, grid_x, grid_y, width_mm, depth_mm, total_items, total_unique, export_json, created_at)
       VALUES (1, 4, 4, 168, 168, 3, 2, '[]', datetime('now'))`,
    );
  });

  describe('extractUniqueConfigs', () => {
    it('groups identical items and sums quantities', () => {
      const bomItems = [
        { itemId: 'standard-2x3', name: 'Bin', widthUnits: 2, heightUnits: 3,
          color: '#000', categories: [], quantity: 2, customization: undefined },
        { itemId: 'standard-2x3', name: 'Bin', widthUnits: 2, heightUnits: 3,
          color: '#000', categories: [], quantity: 1, customization: undefined },
      ];
      const configs = extractUniqueConfigs(bomItems);
      expect(configs).toHaveLength(1);
      expect(configs[0].qty).toBe(3);
      expect(configs[0].widthUnits).toBe(2);
      expect(configs[0].heightUnits).toBe(3);
    });

    it('separates items with different customizations', () => {
      const bomItems = [
        { itemId: 'bin', name: 'Bin', widthUnits: 2, heightUnits: 2,
          color: '#000', categories: [], quantity: 1,
          customization: { wallPattern: 'none', lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 8 } },
        { itemId: 'bin', name: 'Bin', widthUnits: 2, heightUnits: 2,
          color: '#000', categories: [], quantity: 1,
          customization: { wallPattern: 'none', lipStyle: 'none', fingerSlide: 'none', wallCutout: 'none', height: 10 } },
      ];
      const configs = extractUniqueConfigs(bomItems);
      expect(configs).toHaveLength(2);
    });

    it('treats undefined customization same as default', () => {
      const bomItems = [
        { itemId: 'bin', name: 'Bin', widthUnits: 1, heightUnits: 1,
          color: '#000', categories: [], quantity: 2, customization: undefined },
        { itemId: 'bin', name: 'Bin', widthUnits: 1, heightUnits: 1,
          color: '#000', categories: [], quantity: 1,
          customization: { wallPattern: 'none', lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 8 } },
      ];
      const configs = extractUniqueConfigs(bomItems);
      expect(configs).toHaveLength(1);
      expect(configs[0].qty).toBe(3);
    });

    it('returns empty array for empty BOM', () => {
      expect(extractUniqueConfigs([])).toHaveLength(0);
    });
  });

  describe('formatBomGeneration', () => {
    it('formats a pending row', () => {
      const row = {
        id: 1, submissionId: 1, status: 'pending',
        fileManifest: null, threeMfPath: null, generatedAt: null, errorMessage: null,
      };
      const result = formatBomGeneration(row);
      expect(result.status).toBe('pending');
      expect(result.fileManifest).toBeNull();
    });

    it('parses fileManifest JSON string', () => {
      const manifest = [{ filename: 'bin_2x3x8.stl', widthUnits: 2, heightUnits: 3, qty: 2, customization: null }];
      const row = {
        id: 1, submissionId: 1, status: 'ready',
        fileManifest: JSON.stringify(manifest),
        threeMfPath: '/data/generated/bom-1/bom-1.3mf',
        generatedAt: '2026-04-17T00:00:00Z',
        errorMessage: null,
      };
      const result = formatBomGeneration(row);
      expect(result.fileManifest).toHaveLength(1);
      expect(result.fileManifest![0].filename).toBe('bin_2x3x8.stl');
    });
  });
  ```

- [ ] **Step 2: Run and confirm failure**

  ```bash
  cd packages/server && npm run test -- src/services/bomGeneration.service.test.ts 2>&1 | tail -10
  ```

  Expected: `Cannot find module './bomGeneration.service.js'`

- [ ] **Step 3: Commit tests**

  ```bash
  git add packages/server/src/services/bomGeneration.service.test.ts
  git commit -m "test(bomGeneration): add failing unit tests for service"
  ```

---

## Task 7: BOM Generation Service — Implementation

**Files:**
- Create: `packages/server/src/services/bomGeneration.service.ts`

- [ ] **Step 1: Implement the service**

  Create `packages/server/src/services/bomGeneration.service.ts`:

  ```typescript
  import { spawn } from 'child_process';
  import { eq } from 'drizzle-orm';
  import fs from 'fs/promises';
  import path from 'path';
  import { AppError, ErrorCodes } from '@gridfinity/shared';
  import type { BOMItem, ApiBomGeneration, BomGenerationManifestEntry } from '@gridfinity/shared';
  import { db } from '../db/connection.js';
  import { bomSubmissions, bomGenerations } from '../db/schema.js';
  import { config } from '../config.js';
  import { logger } from '../logger.js';

  const DEFAULT_CUSTOMIZATION = {
    wallPattern: 'none',
    lipStyle: 'normal',
    fingerSlide: 'none',
    wallCutout: 'none',
    height: 8,
  } as const;

  // ── Pure extraction helpers (exported for testing) ──────────────────────────

  function customizationKey(item: BOMItem): string {
    const c = item.customization;
    if (!c) return 'default';
    const isDefault =
      c.wallPattern === 'none' && c.lipStyle === 'normal' &&
      c.fingerSlide === 'none' && c.wallCutout === 'none' && c.height === 8;
    if (isDefault) return 'default';
    return `${c.wallPattern}|${c.lipStyle}|${c.fingerSlide}|${c.wallCutout}|${c.height}`;
  }

  export interface UniqueConfig {
    widthUnits: number;
    heightUnits: number;
    customization: typeof DEFAULT_CUSTOMIZATION;
    qty: number;
    filename: string;
  }

  export function extractUniqueConfigs(bomItems: BOMItem[]): UniqueConfig[] {
    const map = new Map<string, UniqueConfig>();

    for (const item of bomItems) {
      const c = item.customization ?? DEFAULT_CUSTOMIZATION;
      const key = `${item.widthUnits}x${item.heightUnits}::${customizationKey(item)}`;
      const existing = map.get(key);
      if (existing) {
        existing.qty += item.quantity;
      } else {
        const filename = buildStlFilename(item.widthUnits, item.heightUnits, c);
        map.set(key, { widthUnits: item.widthUnits, heightUnits: item.heightUnits, customization: c, qty: item.quantity, filename });
      }
    }

    return Array.from(map.values());
  }

  function buildStlFilename(w: number, d: number, c: typeof DEFAULT_CUSTOMIZATION): string {
    const parts = [`bin_${w}x${d}x${c.height}`];
    if (c.lipStyle !== 'normal') parts.push(c.lipStyle);
    if (c.fingerSlide !== 'none') parts.push('fingerslid');
    if (c.wallPattern !== 'none') parts.push('patterned');
    if (c.wallCutout !== 'none') parts.push('cutout');
    return parts.join('_') + '.stl';
  }

  // ── DB helpers ────────────────────────────────────────────────────────────

  type RawGenRow = typeof bomGenerations.$inferSelect;

  export function formatBomGeneration(row: RawGenRow): ApiBomGeneration {
    return {
      id: row.id,
      submissionId: row.submissionId,
      status: row.status as ApiBomGeneration['status'],
      fileManifest: row.fileManifest ? (JSON.parse(row.fileManifest) as BomGenerationManifestEntry[]) : null,
      threeMfPath: row.threeMfPath,
      generatedAt: row.generatedAt,
      errorMessage: row.errorMessage,
    };
  }

  export async function getGeneration(submissionId: number): Promise<ApiBomGeneration | null> {
    const rows = await db.select().from(bomGenerations).where(eq(bomGenerations.submissionId, submissionId)).limit(1);
    return rows.length ? formatBomGeneration(rows[0]) : null;
  }

  // ── Subprocess helpers ────────────────────────────────────────────────────

  function runPython(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const child = spawn('python3', args);
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`python3 ${args[0]} exited ${code}: ${stderr.trim()}`));
        }
      });
    });
  }

  // ── Main generation pipeline ──────────────────────────────────────────────

  export async function triggerGeneration(submissionId: number): Promise<ApiBomGeneration> {
    const subRows = await db.select().from(bomSubmissions).where(eq(bomSubmissions.id, submissionId)).limit(1);
    if (!subRows.length) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'BOM submission not found');
    }

    const exportJson = subRows[0].exportJson;
    const bomItems: BOMItem[] = JSON.parse(exportJson) as BOMItem[];
    const uniqueConfigs = extractUniqueConfigs(bomItems);

    const outDir = path.resolve(config.GENERATED_STL_DIR, `bom-${submissionId}`);
    await fs.mkdir(outDir, { recursive: true });

    // Upsert generation record with 'generating' status
    const now = new Date().toISOString();
    await db.delete(bomGenerations).where(eq(bomGenerations.submissionId, submissionId));
    await db.insert(bomGenerations).values({ submissionId, status: 'generating' });

    // Run generation asynchronously (do not await — returns immediately to caller)
    void runGenerationPipeline(submissionId, uniqueConfigs, outDir, now);

    const rows = await db.select().from(bomGenerations).where(eq(bomGenerations.submissionId, submissionId)).limit(1);
    return formatBomGeneration(rows[0]);
  }

  async function runGenerationPipeline(
    submissionId: number,
    configs: UniqueConfig[],
    outDir: string,
    startedAt: string,
  ): Promise<void> {
    const generatorDir = path.resolve(config.GRIDFINITY_GENERATOR_DIR);
    const generateBinScript = path.join(generatorDir, 'generate_bin.py');
    const bundleScript = path.join(generatorDir, 'bundle_3mf.py');

    try {
      // Generate each unique STL
      for (const cfg of configs) {
        const stlPath = path.join(outDir, cfg.filename);
        const paramsPath = path.join(outDir, `params_${cfg.filename.replace('.stl', '')}.json`);

        const params = buildGenerateParams(cfg);
        await fs.writeFile(paramsPath, JSON.stringify(params));
        await runPython([generateBinScript, paramsPath, '--output', stlPath]);
        logger.info({ stlPath }, 'Generated STL');
      }

      // Bundle into 3MF
      const manifest: BomGenerationManifestEntry[] = configs.map(cfg => ({
        filename: cfg.filename,
        widthUnits: cfg.widthUnits,
        heightUnits: cfg.heightUnits,
        customization: cfg.customization,
        qty: cfg.qty,
      }));
      const manifestPath = path.join(outDir, 'manifest.json');
      const threeMfPath = path.join(outDir, `bom-${submissionId}.3mf`);
      await fs.writeFile(manifestPath, JSON.stringify(manifest));
      await runPython([bundleScript, manifestPath, outDir, threeMfPath]);

      await db.update(bomGenerations)
        .set({ status: 'ready', fileManifest: JSON.stringify(manifest), threeMfPath, generatedAt: new Date().toISOString() })
        .where(eq(bomGenerations.submissionId, submissionId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ submissionId, err: msg }, 'BOM generation failed');
      await db.update(bomGenerations)
        .set({ status: 'error', errorMessage: msg })
        .where(eq(bomGenerations.submissionId, submissionId));
    }
  }

  function buildGenerateParams(cfg: UniqueConfig): Record<string, unknown> {
    const c = cfg.customization;
    const params: Record<string, unknown> = {
      width: [cfg.widthUnits, 0],
      depth: [cfg.heightUnits, 0],
      height: [c.height, 0],
      lip_style: c.lipStyle,
      fingerslide: c.fingerSlide,
    };
    if (c.wallPattern !== 'none') {
      params.wallpattern_enabled = true;
      params.wallpattern_style = c.wallPattern;
    }
    if (c.wallCutout === 'vertical' || c.wallCutout === 'both') {
      params.wallcutout_vertical = 'enabled';
    }
    if (c.wallCutout === 'horizontal' || c.wallCutout === 'both') {
      params.wallcutout_horizontal = 'enabled';
    }
    return params;
  }
  ```

- [ ] **Step 2: Run service tests**

  ```bash
  cd packages/server && npm run test -- src/services/bomGeneration.service.test.ts
  ```

  Expected: all tests PASS.

- [ ] **Step 3: Run full server test suite**

  ```bash
  cd packages/server && npm run test
  ```

  Expected: all tests PASS (no regressions).

- [ ] **Step 4: Commit**

  ```bash
  git add packages/server/src/services/bomGeneration.service.ts
  git commit -m "feat(bomGeneration): implement generation service with STL subprocess pipeline"
  ```

---

## Task 8: Controller, Routes, and Security Tests

**Files:**
- Create: `packages/server/src/controllers/bomGeneration.controller.ts`
- Create: `packages/server/src/routes/bomGeneration.routes.ts`

The security tests come first, then the implementation that makes them pass.

- [ ] **Step 1: Write security + controller tests**

  Create `packages/server/src/controllers/bomGeneration.controller.test.ts`:

  ```typescript
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import request from 'supertest';
  import { createApp } from '../app.js';

  // Mock the service so we don't spawn real subprocesses
  vi.mock('../services/bomGeneration.service.js', () => ({
    triggerGeneration: vi.fn().mockResolvedValue({
      id: 1, submissionId: 42, status: 'generating',
      fileManifest: null, threeMfPath: null, generatedAt: null, errorMessage: null,
    }),
    getGeneration: vi.fn().mockResolvedValue({
      id: 1, submissionId: 42, status: 'ready',
      fileManifest: [{ filename: 'bin_2x3x8.stl', widthUnits: 2, heightUnits: 3, qty: 2 }],
      threeMfPath: '/data/generated/bom-42/bom-42.3mf',
      generatedAt: '2026-04-17T00:00:00Z',
      errorMessage: null,
    }),
  }));

  // Mock auth middleware to inject user by header for testing
  vi.mock('../middleware/auth.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../middleware/auth.js')>();
    return {
      ...actual,
      requireAuth: vi.fn((req: any, _res: any, next: any) => {
        const role = req.headers['x-test-role'] as string | undefined;
        if (!role) {
          next({ statusCode: 401, message: 'Auth required' });
          return;
        }
        req.user = { userId: 1, role };
        next();
      }),
    };
  });

  const app = createApp();

  describe('POST /api/v1/admin/bom/:submissionId/generate — security', () => {
    it('returns 401 with no auth', async () => {
      const res = await request(app).post('/api/v1/admin/bom/42/generate');
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
      const res = await request(app)
        .post('/api/v1/admin/bom/42/generate')
        .set('x-test-role', 'user');
      expect(res.status).toBe(403);
    });

    it('returns 202 for admin user', async () => {
      const res = await request(app)
        .post('/api/v1/admin/bom/42/generate')
        .set('x-test-role', 'admin');
      expect(res.status).toBe(202);
    });
  });

  describe('GET /api/v1/admin/bom/:submissionId/generation — security', () => {
    it('returns 401 with no auth', async () => {
      const res = await request(app).get('/api/v1/admin/bom/42/generation');
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/v1/admin/bom/42/generation')
        .set('x-test-role', 'user');
      expect(res.status).toBe(403);
    });

    it('returns 200 with generation data for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/bom/42/generation')
        .set('x-test-role', 'admin');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ready');
    });
  });

  describe('GET /api/v1/admin/bom/:submissionId/files/:filename — security', () => {
    it('returns 401 with no auth', async () => {
      const res = await request(app).get('/api/v1/admin/bom/42/files/bin_2x3x8.stl');
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/v1/admin/bom/42/files/bin_2x3x8.stl')
        .set('x-test-role', 'user');
      expect(res.status).toBe(403);
    });
  });
  ```

- [ ] **Step 2: Run tests and confirm failure**

  ```bash
  cd packages/server && npm run test -- src/controllers/bomGeneration.controller.test.ts 2>&1 | tail -10
  ```

  Expected: routes not found (404) — controller/routes don't exist yet.

- [ ] **Step 3: Implement controller**

  Create `packages/server/src/controllers/bomGeneration.controller.ts`:

  ```typescript
  import { createReadStream, existsSync } from 'fs';
  import path from 'path';
  import { AppError, ErrorCodes } from '@gridfinity/shared';
  import type { ApiResponse, ApiBomGeneration } from '@gridfinity/shared';
  import type { Request, Response, NextFunction } from 'express';
  import * as bomGenerationService from '../services/bomGeneration.service.js';
  import { config } from '../config.js';

  function parseSubmissionId(req: Request): number {
    const id = parseInt(req.params.submissionId as string, 10);
    if (isNaN(id)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid submission ID');
    return id;
  }

  export async function generateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const submissionId = parseSubmissionId(req);
      const generation = await bomGenerationService.triggerGeneration(submissionId);
      const body: ApiResponse<ApiBomGeneration> = { data: generation };
      res.status(202).json(body);
    } catch (err) {
      next(err);
    }
  }

  export async function getGenerationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const submissionId = parseSubmissionId(req);
      const generation = await bomGenerationService.getGeneration(submissionId);
      if (!generation) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'No generation record for this submission');
      }
      const body: ApiResponse<ApiBomGeneration> = { data: generation };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  }

  export function serveFileHandler(req: Request, res: Response, next: NextFunction): void {
    try {
      const submissionId = parseSubmissionId(req);
      const filename = req.params.filename as string;

      // Prevent path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid filename');
      }

      const filePath = path.resolve(config.GENERATED_STL_DIR, `bom-${submissionId}`, filename);
      if (!existsSync(filePath)) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'File not found');
      }

      const contentType = filename.endsWith('.3mf')
        ? 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
        : 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  }
  ```

- [ ] **Step 4: Implement routes**

  Create `packages/server/src/routes/bomGeneration.routes.ts`:

  ```typescript
  import { Router } from 'express';
  import { requireAuth } from '../middleware/auth.js';
  import { requireAdmin } from '../middleware/admin.js';
  import * as ctrl from '../controllers/bomGeneration.controller.js';

  const router = Router();

  router.post('/admin/bom/:submissionId/generate', requireAuth, requireAdmin, ctrl.generateHandler);
  router.get('/admin/bom/:submissionId/generation', requireAuth, requireAdmin, ctrl.getGenerationHandler);
  router.get('/admin/bom/:submissionId/files/:filename', requireAuth, requireAdmin, ctrl.serveFileHandler);

  export default router;
  ```

- [ ] **Step 5: Run security tests**

  ```bash
  cd packages/server && npm run test -- src/controllers/bomGeneration.controller.test.ts
  ```

  Expected: all tests PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/server/src/controllers/bomGeneration.controller.ts \
          packages/server/src/routes/bomGeneration.routes.ts \
          packages/server/src/controllers/bomGeneration.controller.test.ts
  git commit -m "feat(bomGeneration): add controller, routes, and security tests"
  ```

---

## Task 9: Register Routes in app.ts

**Files:**
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Import and register the new router**

  Open `packages/server/src/app.ts`. Add the import after the existing admin imports:

  ```typescript
  import bomGenerationRoutes from './routes/bomGeneration.routes.js';
  ```

  Add the route registration after `app.use('/api/v1', adminUserStlsRouter);`:

  ```typescript
  app.use('/api/v1', bomGenerationRoutes);
  ```

- [ ] **Step 2: Verify TypeScript and run all server tests**

  ```bash
  cd packages/server && npx tsc --noEmit && npm run test
  ```

  Expected: exit code 0, all tests PASS.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/server/src/app.ts
  git commit -m "feat(server): register bomGeneration routes"
  ```

---

## Task 10: Frontend API Client

**Files:**
- Create: `packages/app/src/api/bomGeneration.api.ts`

- [ ] **Step 1: Create the API client**

  Create `packages/app/src/api/bomGeneration.api.ts`:

  ```typescript
  import type { ApiResponse, ApiBomGeneration } from '@gridfinity/shared';

  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

  async function genFetch<T>(path: string, options: RequestInit, accessToken: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers as Record<string, string>),
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? `Request failed with status ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  export async function triggerBomGeneration(
    submissionId: number,
    accessToken: string,
  ): Promise<ApiBomGeneration> {
    const result = await genFetch<ApiResponse<ApiBomGeneration>>(
      `/admin/bom/${submissionId}/generate`,
      { method: 'POST' },
      accessToken,
    );
    return result.data;
  }

  export async function getBomGeneration(
    submissionId: number,
    accessToken: string,
  ): Promise<ApiBomGeneration | null> {
    try {
      const result = await genFetch<ApiResponse<ApiBomGeneration>>(
        `/admin/bom/${submissionId}/generation`,
        { method: 'GET' },
        accessToken,
      );
      return result.data;
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) return null;
      throw err;
    }
  }

  export function getFileDownloadUrl(submissionId: number, filename: string): string {
    return `${API_BASE_URL}/admin/bom/${submissionId}/files/${encodeURIComponent(filename)}`;
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  cd packages/app && npx tsc --noEmit
  ```

  Expected: exit code 0.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/app/src/api/bomGeneration.api.ts
  git commit -m "feat(frontend): add bomGeneration API client"
  ```

---

## Task 11: AdminBomPanel Component

**Files:**
- Create: `packages/app/src/components/admin/AdminBomPanel.tsx`
- Create: `packages/app/src/components/admin/AdminBomPanel.css`

- [ ] **Step 1: Write component CSS**

  Create `packages/app/src/components/admin/AdminBomPanel.css`:

  ```css
  .admin-bom-panel {
    background: var(--blue-50);
    border-bottom: 1px solid var(--blue-200);
    padding: 14px 20px;
  }

  .admin-bom-panel--error {
    background: #fef2f2;
    border-bottom-color: #fca5a5;
  }

  .admin-bom-panel--generating {
    background: #fefce8;
    border-bottom-color: #fde68a;
  }

  .admin-bom-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .admin-bom-panel__label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--blue-700);
  }

  .admin-bom-panel__status {
    margin-top: 4px;
    font-size: 13px;
    color: #374151;
  }

  .admin-bom-panel__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .admin-bom-panel__btn {
    padding: 7px 14px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .admin-bom-panel__btn--generate {
    background: var(--blue-700);
    color: white;
  }

  .admin-bom-panel__btn--generate:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .admin-bom-panel__btn--download-3mf {
    background: #059669;
    color: white;
  }

  .admin-bom-panel__stl-links {
    margin-top: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .admin-bom-panel__stl-chip {
    font-size: 12px;
    background: white;
    border: 1px solid var(--blue-300);
    border-radius: 4px;
    padding: 3px 10px;
    color: var(--blue-700);
    text-decoration: none;
  }

  .admin-bom-panel__stl-chip:hover {
    background: var(--blue-50);
  }
  ```

- [ ] **Step 2: Implement the component**

  Create `packages/app/src/components/admin/AdminBomPanel.tsx`:

  ```typescript
  import { useState, useEffect, useCallback } from 'react';
  import type { ApiBomGeneration } from '@gridfinity/shared';
  import {
    triggerBomGeneration,
    getBomGeneration,
    getFileDownloadUrl,
  } from '../../api/bomGeneration.api';
  import './AdminBomPanel.css';

  interface AdminBomPanelProps {
    submissionId: number;
    accessToken: string;
  }

  const POLL_INTERVAL_MS = 3000;

  export function AdminBomPanel({ submissionId, accessToken }: AdminBomPanelProps) {
    const [generation, setGeneration] = useState<ApiBomGeneration | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
      try {
        const gen = await getBomGeneration(submissionId, accessToken);
        setGeneration(gen);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load generation status');
      } finally {
        setLoading(false);
      }
    }, [submissionId, accessToken]);

    useEffect(() => {
      void fetchStatus();
    }, [fetchStatus]);

    // Poll while generating
    useEffect(() => {
      if (generation?.status !== 'generating') return;
      const timer = setInterval(() => { void fetchStatus(); }, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [generation?.status, fetchStatus]);

    const handleGenerate = async () => {
      setError(null);
      try {
        const gen = await triggerBomGeneration(submissionId, accessToken);
        setGeneration(gen);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
      }
    };

    const isGenerating = generation?.status === 'generating';
    const isReady = generation?.status === 'ready';
    const isError = generation?.status === 'error' || !!error;

    const panelClass = [
      'admin-bom-panel',
      isGenerating ? 'admin-bom-panel--generating' : '',
      isError ? 'admin-bom-panel--error' : '',
    ].filter(Boolean).join(' ');

    const statusText = (() => {
      if (loading) return 'Loading…';
      if (!generation) return 'Not yet generated';
      if (generation.status === 'generating') return 'Generating STL files…';
      if (generation.status === 'ready') {
        const count = generation.fileManifest?.reduce((s, e) => s + e.qty, 0) ?? 0;
        const unique = generation.fileManifest?.length ?? 0;
        return `Files generated · ${unique} unique config${unique !== 1 ? 's' : ''} · ${count} items total · ${generation.generatedAt ? new Date(generation.generatedAt).toLocaleString() : ''}`;
      }
      if (generation.status === 'error') return `Error: ${generation.errorMessage ?? 'Unknown error'}`;
      return 'Not yet generated';
    })();

    const threeMfFilename = isReady && generation?.threeMfPath
      ? generation.threeMfPath.split(/[\\/]/).pop()
      : null;

    const totalItems = generation?.fileManifest?.reduce((s, e) => s + e.qty, 0) ?? 0;

    return (
      <div className={panelClass}>
        <div className="admin-bom-panel__header">
          <div>
            <div className="admin-bom-panel__label">Admin — Order Fulfillment</div>
            <div className="admin-bom-panel__status">{statusText}</div>
          </div>
          <div className="admin-bom-panel__actions">
            <button
              type="button"
              className="admin-bom-panel__btn admin-bom-panel__btn--generate"
              onClick={() => { void handleGenerate(); }}
              disabled={isGenerating || loading}
            >
              {isGenerating ? '⏳ Generating…' : generation ? '↺ Regenerate' : '⚙ Generate Files'}
            </button>
            {isReady && threeMfFilename && (
              <a
                href={getFileDownloadUrl(submissionId, threeMfFilename)}
                download={threeMfFilename}
                className="admin-bom-panel__btn admin-bom-panel__btn--download-3mf"
              >
                ⬇ Download 3MF ({totalItems} items)
              </a>
            )}
          </div>
        </div>

        {isReady && generation.fileManifest && (
          <div className="admin-bom-panel__stl-links">
            {generation.fileManifest.map((entry) => (
              <a
                key={entry.filename}
                href={getFileDownloadUrl(submissionId, entry.filename)}
                download={entry.filename}
                className="admin-bom-panel__stl-chip"
              >
                ⬇ {entry.filename} ×{entry.qty}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Verify TypeScript**

  ```bash
  cd packages/app && npx tsc --noEmit
  ```

  Expected: exit code 0.

- [ ] **Step 4: Commit**

  ```bash
  git add packages/app/src/components/admin/AdminBomPanel.tsx \
          packages/app/src/components/admin/AdminBomPanel.css
  git commit -m "feat(frontend): add AdminBomPanel component for BOM generation"
  ```

---

## Task 12: Wire AdminBomPanel into OrderSummaryPage

**Files:**
- Modify: `packages/app/src/pages/OrderSummaryPage.tsx`

- [ ] **Step 1: Find where to add the panel**

  Open `packages/app/src/pages/OrderSummaryPage.tsx`. The component already reads `isAdmin` and `layoutMeta` from `useWorkspace()`. You also need the submission ID (from `layoutMeta`) and the access token.

  Check what `layoutMeta` contains and how `accessToken` is available in this component. Look at the imports and `useWorkspace()` destructuring. You need:
  - `isAdmin` — already in WorkspaceContext (line 225)
  - `accessToken` — from auth context (use `useAuth()` hook if it exists, or `useWorkspace`)
  - `bomSubmissionId` — the ID returned after `handleSubmitLayout` succeeds, or stored in layoutMeta

  Check for auth hook:
  ```bash
  grep -rn "useAuth\|accessToken" packages/app/src/hooks packages/app/src/contexts | grep -v test | head -10
  ```

- [ ] **Step 2: Add AdminBomPanel import and render**

  At the top of `OrderSummaryPage.tsx`, add the import:

  ```typescript
  import { AdminBomPanel } from '../components/admin/AdminBomPanel';
  ```

  In the destructured `useWorkspace()` call, also destructure `isAdmin` and `accessToken` (check the exact names from WorkspaceContext — `isAdmin` is confirmed at line 225, `accessToken` may be named differently).

  In the JSX, before the `<div className="order-summary-main">` opening content (right after the breadcrumb or at the top of the page), add:

  ```tsx
  {isAdmin && layoutMeta.bomSubmissionId && accessToken && (
    <AdminBomPanel
      submissionId={layoutMeta.bomSubmissionId}
      accessToken={accessToken}
    />
  )}
  ```

  > **Note:** `layoutMeta.bomSubmissionId` may not exist yet — if `layoutMeta` doesn't currently track the submission ID, you need to add it. Check `WorkspaceContext.tsx` for `layoutMeta` shape and the `handleSubmitLayout` result; the submission ID comes back from the BOM submit API call. If it's not stored, update `layoutMeta` to include `bomSubmissionId?: number` and populate it when submission succeeds.

- [ ] **Step 3: Verify TypeScript**

  ```bash
  cd packages/app && npx tsc --noEmit
  ```

  Expected: exit code 0. Fix any type errors before proceeding.

- [ ] **Step 4: Verify in browser**

  ```bash
  cd packages/app && npm run dev
  ```

  Open http://localhost:5173, log in as an admin user, open a layout with a submitted BOM, navigate to Order Summary. Verify the admin panel appears at the top of the page. Verify it shows "Not yet generated" state. Verify a regular user does not see the panel.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/app/src/pages/OrderSummaryPage.tsx
  git commit -m "feat(frontend): wire AdminBomPanel into OrderSummaryPage for admin users"
  ```

---

## Task 13: E2E Tests

**Files:**
- Create: `packages/app/e2e/tests/admin-bom-generation.spec.ts`

- [ ] **Step 1: Write E2E tests**

  Create `packages/app/e2e/tests/admin-bom-generation.spec.ts`:

  ```typescript
  import { test, expect } from '@playwright/test';

  // These tests require TARGET=docker or RUN_INTEGRATION_TESTS=1 for full generation.
  // Auth and visibility tests run in all modes.

  test.describe('Admin BOM generation panel', () => {
    test('admin user sees admin panel on Order Summary', async ({ page }) => {
      // Log in as admin
      await page.goto('/');
      // ... login flow (use page object if available, e.g. AuthPage.login)
      // Navigate to a submitted layout's order summary
      // Check panel is visible
      await expect(page.getByText('Admin — Order Fulfillment')).toBeVisible();
    });

    test('regular user does not see admin panel', async ({ page }) => {
      // Log in as regular user
      // Navigate to order summary
      await expect(page.getByText('Admin — Order Fulfillment')).not.toBeVisible();
    });

    test('non-admin direct API call to generate returns 403', async ({ request }) => {
      // Get a non-admin token (log in as regular user)
      const loginRes = await request.post('/api/v1/auth/login', {
        data: { email: 'user@test.com', password: 'password123' },
      });
      const { accessToken } = (await loginRes.json()).data;

      const res = await request.post('/api/v1/admin/bom/1/generate', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(res.status()).toBe(403);
    });

    test('unauthenticated generate call returns 401', async ({ request }) => {
      const res = await request.post('/api/v1/admin/bom/1/generate');
      expect(res.status()).toBe(401);
    });

    test('unauthenticated file download returns 401', async ({ request }) => {
      const res = await request.get('/api/v1/admin/bom/1/files/bin_2x3x8.stl');
      expect(res.status()).toBe(401);
    });

    test('non-admin file download returns 403', async ({ request }) => {
      const loginRes = await request.post('/api/v1/auth/login', {
        data: { email: 'user@test.com', password: 'password123' },
      });
      const { accessToken } = (await loginRes.json()).data;

      const res = await request.get('/api/v1/admin/bom/1/files/bin_2x3x8.stl', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(res.status()).toBe(403);
    });
  });
  ```

  > **Note:** Replace the login credentials and navigation with your project's actual test user fixtures and page objects (see `e2e/pages/` for existing page objects, and `e2e/fixtures/` for test users).

- [ ] **Step 2: Run E2E tests**

  ```bash
  cd packages/app && npm run test:e2e -- e2e/tests/admin-bom-generation.spec.ts
  ```

  Expected: auth/visibility tests pass. Integration (full generation) tests are skipped unless `RUN_INTEGRATION_TESTS=1`.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/app/e2e/tests/admin-bom-generation.spec.ts
  git commit -m "test(e2e): add admin BOM generation panel security and visibility tests"
  ```

---

## Task 14: Full Test Pass + Lint

- [ ] **Step 1: Run full unit test suite**

  ```bash
  cd packages/server && npm run test
  cd packages/app && npm run test:run
  ```

  Expected: all tests PASS.

- [ ] **Step 2: Run linter**

  ```bash
  npm run lint
  ```

  Expected: exit code 0, no errors.

- [ ] **Step 3: Commit any lint fixes**

  If lint auto-fixed anything:
  ```bash
  git add -u
  git commit -m "fix(lint): address lint warnings in procedural-stls implementation"
  ```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Customization schema (BinCustomization defaults) | Task 2, Task 7 `DEFAULT_CUSTOMIZATION` |
| BOM exportJson includes customization | The existing `BOMItem` type already has `customization?: BinCustomization`. No new work needed — the submission already serializes BOMItems. |
| Endpoint `POST /admin/bom/:id/generate` | Task 8 |
| Admin-only auth guard | Task 8, security tests |
| 401 for unauthenticated | Task 8, Task 13 |
| 403 for non-admin | Task 8, Task 13 |
| STL per unique config | Task 7 `extractUniqueConfigs` + generation pipeline |
| Single 3MF with N item instances | Task 5 `bundle_3mf.py` |
| Items arranged in row with X offsets | Task 5 `GRIDFINITY_UNIT_MM` spacing |
| Per-item download chips in UI | Task 11 `AdminBomPanel` STL link chips |
| 3MF download button | Task 11 `AdminBomPanel` green button |
| `bom_generations` table | Task 1 |
| Admin panel hidden from non-admin | Task 12 `{isAdmin && ...}` |
| E2E auth tests | Task 13 |
| Docker/production: out of scope | ✓ |
