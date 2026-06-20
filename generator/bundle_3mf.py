#!/usr/bin/env python3
"""Bundle STL files into a 3MF archive with OrcaSlicer-compatible plate auto-arrangement.

Usage:
    python bundle_3mf.py manifest.json stl_dir output.3mf

manifest.json: [{"filename": "bin_2x3x8.stl", "widthUnits": 2, "heightUnits": 3, "qty": 4, "customization": {...}}]
"""
import io
import json
import os
import struct
import subprocess
import sys
import tempfile
import textwrap
import zipfile
from io import StringIO

import matplotlib
matplotlib.use('Agg')  # headless backend — must precede pyplot import
import matplotlib.pyplot as plt
import numpy as np

GRIDFINITY_UNIT_MM = 42.0
ITEM_GAP_MM = 2.0
PLATE_WIDTH_MM = 250.0
PLATE_DEPTH_MM = 250.0

ORCA_SLICER_PATH = os.environ.get(
    'ORCA_SLICER_PATH',
    r'C:\Program Files\OrcaSlicer\orca-slicer.exe',
)
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


# TODO: expose PLATE_WIDTH_MM / PLATE_DEPTH_MM as CLI arguments (and eventually a UI input)
# so users can target different build volumes without editing source.


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


THUMBNAIL_PX = 512
_BG_COLOR = '#0d0d14'
_PLATE_COLOR = '#1a1a28'
_GRID_COLOR = '#2a2a3c'
_BIN_COLOR = '#3B82F6'


def generate_plate_thumbnail(
    plate_items: list,
    mesh_by_filename: dict,
    plate_width_mm: float = PLATE_WIDTH_MM,
    plate_depth_mm: float = PLATE_DEPTH_MM,
) -> bytes:
    """Render a perspective PNG thumbnail of one plate using actual STL geometry.

    plate_items: placed items from autoarrange_plates (each has x, y, filename)
    mesh_by_filename: filename → (object_id, vertices, triangles) from parse_binary_stl
    Returns raw PNG bytes for embedding in the 3MF ZIP.
    """
    fig = plt.figure(figsize=(THUMBNAIL_PX / 100, THUMBNAIL_PX / 100), dpi=100)
    fig.patch.set_facecolor(_BG_COLOR)
    ax = fig.add_axes([0, 0, 1, 1], projection='3d')
    ax.patch.set_facecolor(_BG_COLOR)

    # Plate surface
    px = np.array([[0, plate_width_mm], [0, plate_width_mm]])
    py = np.array([[0, 0], [plate_depth_mm, plate_depth_mm]])
    ax.plot_surface(px, py, np.zeros_like(px), color=_PLATE_COLOR, linewidth=0, zorder=0)

    # Gridfinity unit grid lines on the plate floor
    for gx in np.arange(GRIDFINITY_UNIT_MM, plate_width_mm, GRIDFINITY_UNIT_MM):
        ax.plot([gx, gx], [0, plate_depth_mm], [0, 0], color=_GRID_COLOR, linewidth=0.5, zorder=1)
    for gy in np.arange(GRIDFINITY_UNIT_MM, plate_depth_mm, GRIDFINITY_UNIT_MM):
        ax.plot([0, plate_width_mm], [gy, gy], [0, 0], color=_GRID_COLOR, linewidth=0.5, zorder=1)

    max_z = 10.0
    for item in plate_items:
        _, vertices, triangles = mesh_by_filename[item['filename']]
        verts = np.array(vertices, dtype=np.float64)
        tris = np.array(triangles, dtype=np.int32)
        # Mesh is centred at local origin; shift to left/front edge position
        verts[:, 0] += item['x'] + item['width_mm'] / 2
        verts[:, 1] += item['y'] + item['depth_mm'] / 2
        max_z = max(max_z, float(verts[:, 2].max()))
        ax.plot_trisurf(
            verts[:, 0], verts[:, 1], verts[:, 2],
            triangles=tris,
            color=_BIN_COLOR,
            shade=True,
            linewidth=0,
            antialiased=False,
            zorder=2,
        )

    ax.set_xlim(0, plate_width_mm)
    ax.set_ylim(0, plate_depth_mm)
    ax.set_zlim(0, max_z)
    # Compress Z so bins don't dominate — keep plate footprint prominent
    ax.set_box_aspect([plate_width_mm, plate_depth_mm, max_z * 1.2])
    ax.view_init(elev=35, azim=-50)
    ax.set_axis_off()

    buf = io.BytesIO()
    fig.savefig(buf, format='png', facecolor=_BG_COLOR, edgecolor='none',
                bbox_inches='tight', dpi=100)
    plt.close(fig)
    return buf.getvalue()


def build_model_settings_xml(plate_obj_ids: list, plate_thumbnails: list | None = None) -> str:
    """Build OrcaSlicer-compatible Metadata/model_settings.config XML.

    plate_obj_ids: list of plates; each plate is a list of wrapper object IDs
    (the XML `id` attribute of the component-wrapper <object> elements that
    appear as <item> entries in <build>).

    OrcaSlicer identifies plate membership via <model_instance> children, each
    carrying three <metadata> elements:
      - object_id:   the wrapper's XML object ID from 3dmodel.model
      - instance_id: 0-based instance index within that object (always 0 here
                     since every wrapper is instantiated exactly once in <build>)
      - identify_id: stable unique identifier (we reuse the object ID)

    See: OrcaSlicer src/libslic3r/Format/bbs_3mf.cpp (INSTANCE_TAG, PLATERID_ATTR)
    """
    plate_sections: list = []
    for plate_idx, obj_ids in enumerate(plate_obj_ids, start=1):
        thumb_path = (plate_thumbnails or [])[plate_idx - 1] if plate_thumbnails else None
        thumb_line = f'  <metadata key="thumbnail_file" value="{thumb_path}"/>\n' if thumb_path else ''
        instance_lines = []
        for oid in obj_ids:
            instance_lines.append(
                f'  <model_instance>\n'
                f'    <metadata key="object_id" value="{oid}"/>\n'
                f'    <metadata key="instance_id" value="0"/>\n'
                f'    <metadata key="identify_id" value="{oid}"/>\n'
                f'  </model_instance>'
            )
        plate_sections.append(
            f'<plate>\n'
            f'  <metadata key="plater_id" value="{plate_idx}"/>\n'
            f'  <metadata key="plater_name" value="Plate {plate_idx}"/>\n'
            f'  <metadata key="locked" value="false"/>\n'
            + thumb_line
            + '\n'.join(instance_lines) + '\n'
            + '</plate>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        + '\n'.join(plate_sections) + '\n'
        '</config>\n'
    )


def _write_flat_3mf(manifest: list, stl_dir: str, output_path: str) -> None:
    """Write a minimal 3MF with all instances at the origin (no arrangement).

    Used as input to OrcaSlicer's --arrange CLI: each unique shape becomes one
    shared mesh object; each instance becomes a component-wrapper at (0,0,0).
    OrcaSlicer restructures the file during arrangement and exports the result.
    """
    mesh_by_filename: dict = {}
    next_id = 1

    for entry in manifest:
        fname = entry['filename']
        if fname not in mesh_by_filename:
            verts, tris = parse_binary_stl(os.path.join(stl_dir, fname))
            mesh_by_filename[fname] = (next_id, verts, tris)
            next_id += 1

    objects_xml: list = []
    items_xml: list = []

    for _fname, (mesh_id, verts, tris) in mesh_by_filename.items():
        objects_xml.append(_mesh_to_xml(mesh_id, verts, tris))

    wrapper_id = next_id
    for entry in manifest:
        mesh_id = mesh_by_filename[entry['filename']][0]
        for _ in range(entry['qty']):
            objects_xml.append(_component_to_xml(wrapper_id, mesh_id))
            items_xml.append(
                f'    <item objectid="{wrapper_id}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>'
            )
            wrapper_id += 1

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


def arrange_with_orca(flat_3mf: str, output_path: str) -> None:
    """Call OrcaSlicer CLI to auto-arrange a flat 3MF and export the result.

    flat_3mf:    path to the input 3MF with all items at origin
    output_path: path where OrcaSlicer writes the arranged 3MF

    OrcaSlicer handles plate splitting, transforms, model_settings.config,
    and per-plate PNG thumbnails — we get all of that for free.

    Raises FileNotFoundError if ORCA_SLICER_PATH doesn't exist.
    Raises RuntimeError if OrcaSlicer exits non-zero or produces no output.
    """
    if not os.path.isfile(ORCA_SLICER_PATH):
        raise FileNotFoundError(
            f'OrcaSlicer not found at {ORCA_SLICER_PATH}. '
            f'Set the ORCA_SLICER_PATH env var to override.'
        )

    result = subprocess.run(
        [ORCA_SLICER_PATH, '--arrange', '1', '--ensure-on-bed',
         '--export-3mf', output_path, flat_3mf],
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0 or not os.path.isfile(output_path):
        raise RuntimeError(
            f'OrcaSlicer arrangement failed (exit {result.returncode}):\n{result.stderr}'
        )


def bundle(manifest: list, stl_dir: str, output_path: str) -> None:
    """Bundle STL files from stl_dir into output_path (.3mf) per manifest.

    When ORCA_SLICER_PATH points to a valid OrcaSlicer binary, delegates plate
    arrangement, thumbnail generation, and model_settings.config to OrcaSlicer
    via its --arrange CLI.  Falls back to the internal shelf-packing algorithm
    when OrcaSlicer is unavailable (e.g. in CI or Docker without OrcaSlicer).

    manifest: list of {filename, widthUnits, heightUnits, qty, customization}
    """
    if os.path.isfile(ORCA_SLICER_PATH):
        with tempfile.NamedTemporaryFile(suffix='.3mf', delete=False) as tmp:
            flat_path = tmp.name
        try:
            _write_flat_3mf(manifest, stl_dir, flat_path)
            arrange_with_orca(flat_path, output_path)
        finally:
            if os.path.exists(flat_path):
                os.unlink(flat_path)
        return

    _bundle_legacy(manifest, stl_dir, output_path)


def _bundle_legacy(manifest: list, stl_dir: str, output_path: str) -> None:
    """Shelf-packing fallback used when OrcaSlicer is not available.

    Creates an OrcaSlicer-compatible 3MF with:
    - Shared mesh definitions (one per unique STL shape)
    - Per-instance component-wrapper objects so each copy has a unique object ID
    - Metadata/model_settings.config assigning objects to plates
    - Items arranged on 250×250 mm plates via shelf packing
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

            # Gridfinity STL meshes are generated with position="center" (the OpenSCAD
            # library default), so the mesh is centred at its local origin. autoarrange
            # returns left/front edge coordinates, so shift by half-dimensions to align
            # the mesh centre with the intended plate position.
            tx = placed['x'] + placed['width_mm'] / 2
            ty = placed['y'] + placed['depth_mm'] / 2
            transform = f'1 0 0 0 1 0 0 0 1 {tx:.3f} {ty:.3f} 0'
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

    # ── 5. Generate plate thumbnails and build metadata ───────────────────────
    plate_thumbnail_paths: list = []
    plate_thumbnail_bytes: list = []
    for plate_idx, plate_items in enumerate(plates, start=1):
        thumb_path = f'Metadata/plate_{plate_idx}.png'
        plate_thumbnail_paths.append(thumb_path)
        plate_thumbnail_bytes.append(generate_plate_thumbnail(plate_items, mesh_by_filename))

    model_settings_xml = build_model_settings_xml(plate_obj_ids, plate_thumbnail_paths)

    # ── 6. Write ZIP ──────────────────────────────────────────────────────────
    content_types = textwrap.dedent("""\
        <?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels"
            ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="model"
            ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
          <Default Extension="config"
            ContentType="application/xml"/>
          <Default Extension="png"
            ContentType="image/png"/>
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
        for thumb_path, thumb_bytes in zip(plate_thumbnail_paths, plate_thumbnail_bytes):
            zf.writestr(thumb_path, thumb_bytes)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print('Usage: bundle_3mf.py manifest.json stl_dir output.3mf', file=sys.stderr)
        sys.exit(1)

    manifest_path, stl_dir, output_path = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(manifest_path) as f:
        manifest = json.load(f)

    bundle(manifest, stl_dir, output_path)
    print(json.dumps({'status': 'ok', 'output': output_path}))
