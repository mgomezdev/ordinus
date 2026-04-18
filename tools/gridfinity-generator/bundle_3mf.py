#!/usr/bin/env python3
"""Bundle STL files into a 3MF archive with per-item quantity instances.

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
