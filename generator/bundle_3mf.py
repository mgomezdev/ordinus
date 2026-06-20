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
import uuid
import zipfile
from io import StringIO

import matplotlib
matplotlib.use('Agg')  # headless backend — must precede pyplot import
import matplotlib.pyplot as plt
import numpy as np
from rectpack import newPacker, PackingMode, PackingBin, SORT_LSIDE

GRIDFINITY_UNIT_MM = 42.0
ITEM_GAP_MM = 2.0
PLATE_WIDTH_MM = 255.0
PLATE_DEPTH_MM = 255.0

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


def _mesh_to_external_model(vertices: list, triangles: list) -> str:
    """Render a standalone 3MF model XML file for one mesh, centered at origin.

    Each external file always uses object id="1" (local scope).  The calling
    wrapper references it via p:path + objectid="1".
    """
    xs = [v[0] for v in vertices]
    ys = [v[1] for v in vertices]
    zs = [v[2] for v in vertices]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    cz = (min(zs) + max(zs)) / 2
    centered = [(v[0] - cx, v[1] - cy, v[2] - cz) for v in vertices]

    buf = StringIO()
    buf.write('<?xml version="1.0" encoding="UTF-8"?>\n')
    buf.write('<model unit="millimeter" xml:lang="en-US"\n')
    buf.write('    xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"\n')
    buf.write('    xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"\n')
    buf.write('    xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"\n')
    buf.write('    requiredextensions="p">\n')
    buf.write('  <resources>\n')
    buf.write(f'    <object id="1" p:UUID="{uuid.uuid4()}" type="model">\n')
    buf.write('      <mesh>\n')
    buf.write('        <vertices>\n')
    for x, y, z in centered:
        buf.write(f'          <vertex x="{x:.6f}" y="{y:.6f}" z="{z:.6f}"/>\n')
    buf.write('        </vertices>\n')
    buf.write('        <triangles>\n')
    for v1, v2, v3 in triangles:
        buf.write(f'          <triangle v1="{v1}" v2="{v2}" v3="{v3}"/>\n')
    buf.write('        </triangles>\n')
    buf.write('      </mesh>\n')
    buf.write('    </object>\n')
    buf.write('  </resources>\n')
    buf.write('  <build/>\n')
    buf.write('</model>\n')
    return buf.getvalue()


# TODO: expose PLATE_WIDTH_MM / PLATE_DEPTH_MM as CLI arguments (and eventually a UI input)
# so users can target different build volumes without editing source.


def _component_wrapper_xml(wrapper_id: int, safe_name: str) -> str:
    """Render a component-wrapper <object> that references an external mesh file via p:path."""
    return (
        f'    <object id="{wrapper_id}" p:UUID="{uuid.uuid4()}" type="model">\n'
        f'      <components>\n'
        f'        <component p:path="/3D/Objects/{safe_name}.model" objectid="1"'
        f' p:UUID="{uuid.uuid4()}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n'
        f'      </components>\n'
        f'    </object>\n'
    )


def autoarrange_plates(instances: list) -> list:
    """Pack instances onto PLATE_WIDTH_MM × PLATE_DEPTH_MM plates using rectpack.

    Each item is padded by ITEM_GAP_MM on all sides so parts never touch.
    Returns list of plates; each plate is a list of dicts adding 'x' and 'y'
    (the bottom-left corner of the item, gap already stripped out).
    """
    if not instances:
        return []

    pad = ITEM_GAP_MM
    total_area = sum((i['width_mm'] + pad) * (i['depth_mm'] + pad) for i in instances)
    plate_area = PLATE_WIDTH_MM * PLATE_DEPTH_MM
    max_bins = max(int(total_area / plate_area) + 2, len(instances))

    packer = newPacker(mode=PackingMode.Offline, bin_algo=PackingBin.BFF,
                       sort_algo=SORT_LSIDE, rotation=True)
    for _ in range(max_bins):
        packer.add_bin(PLATE_WIDTH_MM, PLATE_DEPTH_MM)
    for i, inst in enumerate(instances):
        packer.add_rect(inst['width_mm'] + pad, inst['depth_mm'] + pad, rid=i)
    packer.pack()

    plates_dict: dict = {}
    for rect in packer.rect_list():
        bin_idx, x, y, packed_w, packed_h, rid = rect
        inst = instances[rid]
        if bin_idx not in plates_dict:
            plates_dict[bin_idx] = []
        # packed_w/packed_h are the ACTUAL placed dimensions (may be rotated vs original).
        # Use them for center calculation so items that were rotated 90° don't overlap.
        placed_w = packed_w - pad
        placed_h = packed_h - pad
        plates_dict[bin_idx].append({
            **inst,
            'x': x + pad / 2,
            'y': y + pad / 2,
            'width_mm': placed_w,
            'depth_mm': placed_h,
        })

    return [plates_dict[i] for i in sorted(plates_dict.keys())]


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
        # Centre mesh at local XY origin and rest on Z=0, then shift to plate position
        verts[:, 0] -= (verts[:, 0].min() + verts[:, 0].max()) / 2
        verts[:, 1] -= (verts[:, 1].min() + verts[:, 1].max()) / 2
        verts[:, 2] -= verts[:, 2].min()
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


def build_model_settings_xml(
    plate_obj_ids: list,
    plate_thumbnails: list | None = None,
    wrapper_to_part_id: dict | None = None,
) -> str:
    """Build OrcaSlicer-compatible Metadata/model_settings.config XML.

    wrapper_to_part_id: maps wrapper_id → part_id (component_id from the paired
    OrcaSlicer ID scheme).  OrcaSlicer requires per-instance <object> sections
    before <plate> sections, and the part_id must match its internal volume ID.
    """
    wtp = wrapper_to_part_id or {}
    object_sections: list = []
    for wrapper_id, part_id in wtp.items():
        name = f'Object_{wrapper_id}'
        object_sections.append(
            f'<object id="{wrapper_id}">\n'
            f'  <metadata key="name" value="{name}"/>\n'
            f'  <metadata key="extruder" value="1"/>\n'
            f'  <part id="{part_id}" subtype="normal_part">\n'
            f'    <metadata key="name" value="{name}"/>\n'
            f'    <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n'
            f'    <mesh_stat edges_fixed="0" degenerate_facets="0" '
            f'facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n'
            f'  </part>\n'
            f'</object>'
        )

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
            f'  <metadata key="plater_name" value=""/>\n'
            f'  <metadata key="locked" value="false"/>\n'
            f'  <metadata key="filament_map_mode" value="Auto For Flush"/>\n'
            + thumb_line
            + '\n'.join(instance_lines) + '\n'
            + '</plate>'
        )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<config>\n'
        + ('\n'.join(object_sections) + '\n' if object_sections else '')
        + '\n'.join(plate_sections) + '\n'
        '</config>\n'
    )


def _write_flat_3mf(
    manifest: list,
    stl_dir: str,
    output_path: str,
    plate_width_mm: float = PLATE_WIDTH_MM,
    plate_depth_mm: float = PLATE_DEPTH_MM,
) -> None:
    """Write a minimal 3MF with all instances at the origin (no arrangement).

    Used as input to OrcaSlicer's --arrange CLI: each unique shape becomes one
    shared mesh object; each instance becomes a component-wrapper at (0,0,0).
    A Metadata/project_settings.config is embedded so OrcaSlicer uses the
    correct plate dimensions instead of the user's last-selected machine.
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

    # OrcaSlicer reads Metadata/project_settings.config by convention when loading
    # a 3MF; embedding it here overrides the user's last-selected machine so the
    # --arrange pass uses our target plate size, not whatever the GUI had open.
    w, d = int(plate_width_mm), int(plate_depth_mm)
    project_settings = json.dumps({
        'printable_area': [f'0x0', f'{w}x0', f'{w}x{d}', f'0x{d}'],
        'printable_height': 260,
    }, indent=2)

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types)
        zf.writestr('_rels/.rels', rels)
        zf.writestr('3D/model.model', model_xml)
        zf.writestr('Metadata/project_settings.config', project_settings)


def arrange_with_orca(flat_3mf: str, output_path: str) -> None:
    """Call OrcaSlicer CLI to auto-arrange a flat 3MF and export the result.

    flat_3mf:    path to the input 3MF with all items at origin; must include
                 Metadata/project_settings.config with the target printable_area
                 so OrcaSlicer uses the correct bed size during arrangement.
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
    # mesh_by_filename: filename → (safe_name, vertices, triangles)
    # safe_name becomes the external file stem: 3D/Objects/{safe_name}.model
    mesh_by_filename: dict = {}
    mesh_idx = 0

    for entry in manifest:
        fname = entry['filename']
        if fname not in mesh_by_filename:
            stl_path = os.path.join(stl_dir, fname)
            verts, tris = parse_binary_stl(stl_path)
            safe_name = f'Object_{mesh_idx}_{mesh_idx}'
            mesh_by_filename[fname] = (safe_name, verts, tris)
            mesh_idx += 1

    # ── 2. Expand manifest → flat instance list ───────────────────────────────
    instances: list = []
    for entry in manifest:
        fname = entry['filename']
        # Static library items have widthUnits=0 — derive footprint from mesh extents.
        if entry.get('widthUnits', 0) > 0:
            w_mm = entry['widthUnits'] * GRIDFINITY_UNIT_MM
            d_mm = entry['heightUnits'] * GRIDFINITY_UNIT_MM
        else:
            _safe, verts, _ = mesh_by_filename[fname]
            xs = [v[0] for v in verts]
            ys = [v[1] for v in verts]
            w_mm = max(xs) - min(xs)
            d_mm = max(ys) - min(ys)
        for _ in range(entry['qty']):
            instances.append({'filename': fname, 'width_mm': w_mm, 'depth_mm': d_mm})

    # ── 3. Auto-arrange instances onto plates ─────────────────────────────────
    plates = autoarrange_plates(instances)

    # ── 4. Build 3MF XML ──────────────────────────────────────────────────────
    # Use OrcaSlicer's paired ID scheme: one global counter allocates IDs for
    # both mesh components and wrappers.  Each UNIQUE shape consumes two IDs
    # (component_id, then wrapper_id); repeated shapes skip the component_id
    # allocation and reuse the existing one.  Part_id in model_settings.config
    # = component_id (the lower of the pair), matching OrcaSlicer's own saves.
    objects_xml: list = []
    items_xml: list = []
    plate_obj_ids: list = []
    all_wrapper_ids: list = []
    wrapper_to_part_id: dict = {}   # wrapper_id → part_id (= component_id)
    fname_to_component_id: dict = {}  # filename → component_id (for shared meshes)

    id_counter = 1
    for plate_idx, plate_items in enumerate(plates):
        plate_offset_x = plate_idx * (PLATE_WIDTH_MM + ITEM_GAP_MM)
        ids_this_plate: list = []
        for placed in plate_items:
            fname = placed['filename']
            safe_name, verts, _ = mesh_by_filename[fname]

            # Allocate component_id only for first occurrence of this shape
            if fname not in fname_to_component_id:
                fname_to_component_id[fname] = id_counter
                id_counter += 1
            component_id = fname_to_component_id[fname]

            wrapper_id = id_counter
            id_counter += 1

            objects_xml.append(_component_wrapper_xml(wrapper_id, safe_name))
            wrapper_to_part_id[wrapper_id] = component_id

            # External mesh is centered at origin (z from -half_h to +half_h).
            # tz = half_h places the bottom face at world Z=0.
            zs = [v[2] for v in verts]
            tz = (max(zs) - min(zs)) / 2
            tx = plate_offset_x + placed['x'] + placed['width_mm'] / 2
            ty = placed['y'] + placed['depth_mm'] / 2
            transform = f'1 0 0 0 1 0 0 0 1 {tx:.3f} {ty:.3f} {tz:.3f}'
            items_xml.append(
                f'    <item objectid="{wrapper_id}" p:UUID="{uuid.uuid4()}"'
                f' transform="{transform}" printable="1"/>'
            )

            ids_this_plate.append(wrapper_id)
            all_wrapper_ids.append(wrapper_id)
        plate_obj_ids.append(ids_this_plate)

    build_uuid = uuid.uuid4()
    model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US"\n'
        '    xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"\n'
        '    xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"\n'
        '    xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"\n'
        '    requiredextensions="p">\n'
        '  <resources>\n'
        + ''.join(objects_xml)
        + '  </resources>\n'
        f'  <build p:UUID="{build_uuid}">\n'
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

    model_settings_xml = build_model_settings_xml(plate_obj_ids, plate_thumbnail_paths, wrapper_to_part_id)

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
            Target="/3D/3dmodel.model" Id="rel0"/>
        </Relationships>
        """)

    # 3dmodel.model.rels: one entry per unique external mesh file.
    rel_entries: list = []
    for i, (safe_name, _, __) in enumerate(mesh_by_filename.values(), start=1):
        rel_entries.append(
            f'  <Relationship Target="/3D/Objects/{safe_name}.model" Id="rel{i}"\n'
            f'    Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
        )
    model_rels = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        + '\n'.join(rel_entries) + '\n'
        '</Relationships>\n'
    )

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types)
        zf.writestr('_rels/.rels', rels)
        zf.writestr('3D/3dmodel.model', model_xml)
        for fname, (safe_name, verts, tris) in mesh_by_filename.items():
            zf.writestr(f'3D/Objects/{safe_name}.model',
                        _mesh_to_external_model(verts, tris))
        zf.writestr('3D/_rels/3dmodel.model.rels', model_rels)
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
