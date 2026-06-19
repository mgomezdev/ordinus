#!/usr/bin/env python3
"""Bundle STL files into a 3MF archive with OrcaSlicer-compatible plate auto-arrangement.

Usage:
    python bundle_3mf.py manifest.json stl_dir output.3mf

manifest.json: [{"filename": "bin_2x3x8.stl", "widthUnits": 2, "heightUnits": 3, "qty": 4, "customization": {...}}]
"""
import json
import os
import struct
import sys
import textwrap
import zipfile
from io import StringIO

GRIDFINITY_UNIT_MM = 42.0
ITEM_GAP_MM = 2.0
PLATE_WIDTH_MM = 250.0
PLATE_DEPTH_MM = 250.0
DEFAULT_HEIGHT = 8
DEFAULT_CUSTOMIZATION = {
    'height': DEFAULT_HEIGHT,
    'lipStyle': 'normal',
    'fingerSlide': 'none',
    'wallPattern': 'none',
    'wallCutout': 'none',
}


def parse_binary_stl(path: str) -> tuple:
    """Parse a binary STL file. Returns (vertices, triangles).

    vertices: list of (x, y, z) tuples (deduplicated)
    triangles: list of (v1_idx, v2_idx, v3_idx) tuples
    """
    with open(path, 'rb') as f:
        f.read(80)  # header
        n_triangles = struct.unpack('<I', f.read(4))[0]

    vertices = []
    triangles = []
    vertex_map = {}

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
            triangles.append(tuple(tri_indices))

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

    params = {
        'width': [item['widthUnits'], 0],
        'depth': [item['heightUnits'], 0],
        'height': [c.get('height', DEFAULT_HEIGHT), 0],
        'lip_style': c.get('lipStyle', 'normal'),
        'fingerslide': c.get('fingerSlide', 'none'),
        'label_style': 'disabled',
    }

    wall_pattern = c.get('wallPattern', 'none')
    if wall_pattern != 'none':
        params['wallpattern_enabled'] = True
        params['wallpattern_style'] = wall_pattern

    wall_cutout = c.get('wallCutout', 'none')
    if wall_cutout != 'none':
        params['wallcutout_enabled'] = True
        if wall_cutout == 'vertical':
            params['wallcutout_walls'] = [1, 0, 1, 0]
        elif wall_cutout == 'horizontal':
            params['wallcutout_walls'] = [0, 1, 0, 1]
        elif wall_cutout == 'both':
            params['wallcutout_walls'] = [1, 1, 1, 1]

    return params


def _mesh_to_xml(object_id: int, vertices: list, triangles: list) -> str:
    """Render one <object> element (mesh definition) for 3MF model XML."""
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


def _component_to_xml(wrapper_id: int, mesh_id: int) -> str:
    """Render a component-wrapper <object> that references a shared mesh object.

    Using components avoids duplicating mesh data for items with the same shape.
    Each wrapper gets a unique object ID so OrcaSlicer can assign it to a plate.
    """
    return (
        f'    <object id="{wrapper_id}" type="model">\n'
        f'      <components>\n'
        f'        <component objectid="{mesh_id}"/>\n'
        f'      </components>\n'
        f'    </object>\n'
    )


def autoarrange_plates(instances: list) -> list:
    """Pack instances into PLATE_WIDTH_MM × PLATE_DEPTH_MM plates.

    Uses a shelf-packing algorithm (First Fit Decreasing Height):
    items are sorted by depth descending so taller items seed new shelves,
    and shorter items fill the remaining height on existing shelves.

    instances: list of {'filename': str, 'width_mm': float, 'depth_mm': float}
    Returns: list of plates; each plate is a list of dicts adding 'x' and 'y'
             (the bottom-left corner position of the item on the plate).
    """
    sorted_items = sorted(instances, key=lambda it: (-it['depth_mm'], -it['width_mm']))

    plates: list = []
    current_items: list = []
    # Each shelf: {'y': float, 'height': float, 'x_cursor': float}
    shelves: list = []

    def commit_plate() -> None:
        nonlocal current_items, shelves
        if current_items:
            plates.append(current_items)
        current_items = []
        shelves = []

    for item in sorted_items:
        w, d = item['width_mm'], item['depth_mm']
        placed = False

        # Try to add to an existing shelf (item must fit in remaining width and shelf height)
        for shelf in shelves:
            remaining = PLATE_WIDTH_MM - shelf['x_cursor']
            if w <= remaining and d <= shelf['height']:
                current_items.append({**item, 'x': shelf['x_cursor'], 'y': shelf['y']})
                shelf['x_cursor'] += w + ITEM_GAP_MM
                placed = True
                break

        if not placed:
            # Try starting a new shelf on the current plate
            y_new = shelves[-1]['y'] + shelves[-1]['height'] + ITEM_GAP_MM if shelves else 0.0
            if y_new + d <= PLATE_DEPTH_MM and w <= PLATE_WIDTH_MM:
                shelves.append({'y': y_new, 'height': d, 'x_cursor': w + ITEM_GAP_MM})
                current_items.append({**item, 'x': 0.0, 'y': y_new})
                placed = True

        if not placed:
            # Start a new plate (force-place even if item exceeds plate dimensions)
            commit_plate()
            shelves.append({'y': 0.0, 'height': d, 'x_cursor': w + ITEM_GAP_MM})
            current_items.append({**item, 'x': 0.0, 'y': 0.0})

    commit_plate()
    return plates


def bundle(manifest: list, stl_dir: str, output_path: str) -> None:
    """Bundle STL files from stl_dir into output_path (.3mf) per manifest.

    Creates an OrcaSlicer-compatible 3MF with:
    - Shared mesh definitions (one per unique STL shape)
    - Per-instance component-wrapper objects so each copy has a unique object ID
    - Metadata/model_settings.config assigning objects to plates
    - Items arranged on 250×250 mm plates via shelf packing

    manifest: list of {filename, widthUnits, heightUnits, qty, customization}
    """
    # ── 1. Load each unique STL mesh once ────────────────────────────────────
    mesh_by_filename: dict = {}  # filename → (mesh_obj_id, vertices, triangles)
    next_mesh_id = 1

    for entry in manifest:
        fname = entry['filename']
        if fname not in mesh_by_filename:
            stl_path = os.path.join(stl_dir, fname)
            verts, tris = parse_binary_stl(stl_path)
            mesh_by_filename[fname] = (next_mesh_id, verts, tris)
            next_mesh_id += 1

    # ── 2. Expand manifest → flat instance list ───────────────────────────────
    instances: list = []
    for entry in manifest:
        fname = entry['filename']
        w_mm = entry['widthUnits'] * GRIDFINITY_UNIT_MM
        d_mm = entry['heightUnits'] * GRIDFINITY_UNIT_MM
        for _ in range(entry['qty']):
            instances.append({'filename': fname, 'width_mm': w_mm, 'depth_mm': d_mm})

    # ── 3. Auto-arrange instances onto plates ─────────────────────────────────
    plates = autoarrange_plates(instances)

    # ── 4. Build 3MF XML ──────────────────────────────────────────────────────
    objects_xml: list = []
    items_xml: list = []
    plate_obj_ids: list = []  # [[ids on plate 1], [ids on plate 2], ...]

    # Mesh-definition objects
    for _fname, (mesh_id, verts, tris) in mesh_by_filename.items():
        objects_xml.append(_mesh_to_xml(mesh_id, verts, tris))

    # Component-wrapper objects (one per instance) and build items
    wrapper_id = next_mesh_id
    for plate_items in plates:
        ids_this_plate: list = []
        for placed in plate_items:
            mesh_id = mesh_by_filename[placed['filename']][0]
            objects_xml.append(_component_to_xml(wrapper_id, mesh_id))

            x, y = placed['x'], placed['y']
            transform = f'1 0 0 0 1 0 0 0 1 {x:.3f} {y:.3f} 0'
            items_xml.append(f'    <item objectid="{wrapper_id}" transform="{transform}"/>')

            ids_this_plate.append(wrapper_id)
            wrapper_id += 1
        plate_obj_ids.append(ids_this_plate)

    model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US"\n'
        '      xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n'
        '  <resources>\n'
        + ''.join(objects_xml)
        + '  </resources>\n'
        '  <build>\n'
        + '\n'.join(items_xml) + '\n'
        '  </build>\n'
        '</model>\n'
    )

    # ── 5. Build OrcaSlicer plate-assignment metadata ─────────────────────────
    plate_sections: list = []
    for plate_idx, obj_ids in enumerate(plate_obj_ids, start=1):
        id_lines = '\n'.join(f'      <id value="{oid}"/>' for oid in obj_ids)
        plate_sections.append(
            f'  <plate>\n'
            f'    <id value="{plate_idx}"/>\n'
            f'    <objects_id>\n'
            f'{id_lines}\n'
            f'    </objects_id>\n'
            f'  </plate>'
        )
    model_settings_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        + '\n'.join(plate_sections) + '\n'
        '</config>\n'
    )

    # ── 6. Write ZIP ──────────────────────────────────────────────────────────
    content_types = textwrap.dedent("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels"
            ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="model"
            ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
          <Default Extension="config"
            ContentType="application/octet-stream"/>
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

    # Links model.model to the OrcaSlicer plate-config sidecar
    model_rels = textwrap.dedent("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship
            Type="http://schemas.bambulab.com/package/2021/model-settings"
            Target="/Metadata/model_settings.config" Id="rel1"/>
        </Relationships>
        """)

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types)
        zf.writestr('_rels/.rels', rels)
        zf.writestr('3D/model.model', model_xml)
        zf.writestr('3D/_rels/model.model.rels', model_rels)
        zf.writestr('Metadata/model_settings.config', model_settings_xml)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print('Usage: bundle_3mf.py manifest.json stl_dir output.3mf', file=sys.stderr)
        sys.exit(1)

    manifest_path, stl_dir, output_path = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(manifest_path) as f:
        manifest = json.load(f)

    bundle(manifest, stl_dir, output_path)
    print(json.dumps({'status': 'ok', 'output': output_path}))
