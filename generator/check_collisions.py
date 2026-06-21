#!/usr/bin/env python3
"""
Collision checker for bundle_3mf.py output.

Generates synthetic STL files matching the test manifest dimensions,
then generates a fresh 3MF and checks all instances for XY collisions.

Prints COLLISION: <A> vs <B> for any overlap, or ALL CLEAR if none.
"""

import io
import json
import os
import struct
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

# ── Inject the generator module ──────────────────────────────────────────────
sys.path.insert(0, '/app/generator')
import bundle_3mf

GRIDFINITY_UNIT_MM = 42.0

# ── Generate a synthetic binary STL (a box) ──────────────────────────────────
def make_box_stl(width_mm, depth_mm, height_mm=20.0):
    """Create a binary STL byte string for a box of given dimensions.
    The box spans x=[0,width_mm], y=[0,depth_mm], z=[0,height_mm].
    """
    # 12 triangles for a box (2 per face)
    w, d, h = width_mm, depth_mm, height_mm
    faces = [
        # bottom (z=0, normal 0,0,-1)
        ((0,0,-1), (0,0,0), (w,d,0), (w,0,0)),
        ((0,0,-1), (0,0,0), (0,d,0), (w,d,0)),
        # top (z=h, normal 0,0,1)
        ((0,0,1), (0,0,h), (w,0,h), (w,d,h)),
        ((0,0,1), (0,0,h), (w,d,h), (0,d,h)),
        # front (y=0, normal 0,-1,0)
        ((0,-1,0), (0,0,0), (w,0,0), (w,0,h)),
        ((0,-1,0), (0,0,0), (w,0,h), (0,0,h)),
        # back (y=d, normal 0,1,0)
        ((0,1,0), (0,d,0), (0,d,h), (w,d,h)),
        ((0,1,0), (0,d,0), (w,d,h), (w,d,0)),
        # left (x=0, normal -1,0,0)
        ((-1,0,0), (0,0,0), (0,0,h), (0,d,h)),
        ((-1,0,0), (0,0,0), (0,d,h), (0,d,0)),
        # right (x=w, normal 1,0,0)
        ((1,0,0), (w,0,0), (w,d,0), (w,d,h)),
        ((1,0,0), (w,0,0), (w,d,h), (w,0,h)),
    ]
    buf = io.BytesIO()
    buf.write(b'\x00' * 80)  # header
    buf.write(struct.pack('<I', len(faces)))
    for (nx, ny, nz), v1, v2, v3 in faces:
        buf.write(struct.pack('<fff', nx, ny, nz))
        for vx, vy, vz in (v1, v2, v3):
            buf.write(struct.pack('<fff', vx, vy, vz))
        buf.write(struct.pack('<H', 0))  # attr
    return buf.getvalue()


# ── Test manifest ─────────────────────────────────────────────────────────────
manifest = [
    {'filename': 'bin_1x2x4_k4a25i.stl', 'widthUnits': 1, 'heightUnits': 2, 'qty': 2},
    {'filename': 'bin_1x3x4_k4a25i.stl', 'widthUnits': 1, 'heightUnits': 3, 'qty': 1},
    {'filename': 'bin_5x2x4_k4a25i.stl', 'widthUnits': 5, 'heightUnits': 2, 'qty': 1},
    {'filename': 'bin_5x3x4_k4a25i.stl', 'widthUnits': 5, 'heightUnits': 3, 'qty': 1},
    {'filename': 'bin_3x2x4_k4a25i.stl', 'widthUnits': 3, 'heightUnits': 2, 'qty': 1},
    {'filename': 'bin_2x2x4_k4a25i.stl', 'widthUnits': 2, 'heightUnits': 2, 'qty': 1},
    {'filename': 'bin_3x4x4_k4a25i.stl', 'widthUnits': 3, 'heightUnits': 4, 'qty': 1},
    {'filename': 'bin_1x1x4_k4a25i.stl', 'widthUnits': 1, 'heightUnits': 1, 'qty': 1},
]

# ── Create synthetic STL files in a temp dir ──────────────────────────────────
stl_dir = tempfile.mkdtemp()
print(f'Creating synthetic STL files in {stl_dir}')
for entry in manifest:
    w = entry['widthUnits'] * GRIDFINITY_UNIT_MM
    d = entry['heightUnits'] * GRIDFINITY_UNIT_MM
    h = 20.0  # arbitrary height
    stl_bytes = make_box_stl(w, d, h)
    stl_path = os.path.join(stl_dir, entry['filename'])
    with open(stl_path, 'wb') as f:
        f.write(stl_bytes)
    print(f'  Created {entry["filename"]} ({w:.0f}x{d:.0f}x{h:.0f} mm)')

# ── Generate a fresh 3MF ──────────────────────────────────────────────────────
with tempfile.NamedTemporaryFile(suffix='.3mf', delete=False) as tmp:
    output_3mf = tmp.name

print(f'\nGenerating 3MF to {output_3mf} ...')
bundle_3mf._bundle_legacy(manifest, stl_dir, output_3mf)
print(f'Generated: {os.path.getsize(output_3mf)} bytes')

# ── Parse the 3MF ─────────────────────────────────────────────────────────────
NS_CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
NS_PROD = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06'


def parse_3mf(path):
    """Return list of items with world transform info and mesh AABB."""
    with zipfile.ZipFile(path) as zf:
        model_xml = zf.read('3D/3dmodel.model').decode('utf-8')
        root = ET.fromstring(model_xml)

        # Build map: wrapper_id -> external_model_path
        wrapper_to_extpath = {}
        resources_el = root.find(f'{{{NS_CORE}}}resources')
        if resources_el is not None:
            for obj_el in resources_el.findall(f'{{{NS_CORE}}}object'):
                obj_id = obj_el.get('id')
                comps_el = obj_el.find(f'{{{NS_CORE}}}components')
                if comps_el is not None:
                    for comp_el in comps_el.findall(f'{{{NS_CORE}}}component'):
                        ext_path = comp_el.get(f'{{{NS_PROD}}}path')
                        if ext_path:
                            wrapper_to_extpath[obj_id] = ext_path.lstrip('/')

        # Parse build items
        items = []
        build_el = root.find(f'{{{NS_CORE}}}build')
        if build_el is not None:
            for item_el in build_el.findall(f'{{{NS_CORE}}}item'):
                objectid = item_el.get('objectid')
                transform_str = item_el.get('transform', '1 0 0 0 1 0 0 0 1 0 0 0')
                parts = [float(x) for x in transform_str.split()]
                # 3MF transform: 12 values
                # r00 r01 r02 r10 r11 r12 r20 r21 r22 tx ty tz
                rot = [parts[0:3], parts[3:6], parts[6:9]]
                tx, ty, tz = parts[9], parts[10], parts[11]
                ext_path = wrapper_to_extpath.get(objectid)
                items.append({
                    'objectid': objectid,
                    'rot': rot,
                    'tx': tx,
                    'ty': ty,
                    'tz': tz,
                    'ext_path': ext_path,
                    'transform_str': transform_str,
                })

        # Read mesh AABBs from external files
        mesh_aabb_cache = {}
        for item in items:
            ext_path = item['ext_path']
            if ext_path and ext_path not in mesh_aabb_cache:
                try:
                    ext_xml = zf.read(ext_path).decode('utf-8')
                    ext_root = ET.fromstring(ext_xml)
                    vertices = []
                    for v_el in ext_root.iter(f'{{{NS_CORE}}}vertex'):
                        vertices.append((float(v_el.get('x')), float(v_el.get('y')), float(v_el.get('z'))))
                    if vertices:
                        xs = [v[0] for v in vertices]
                        ys = [v[1] for v in vertices]
                        zs = [v[2] for v in vertices]
                        mesh_aabb_cache[ext_path] = (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
                    else:
                        mesh_aabb_cache[ext_path] = None
                except Exception as e:
                    print(f'  WARNING: could not parse {ext_path}: {e}')
                    mesh_aabb_cache[ext_path] = None
            item['mesh_aabb'] = mesh_aabb_cache.get(ext_path)

    return items


def apply_transform(rot, tx, ty, tz, aabb):
    """Apply 3MF rotation matrix + translation to AABB corners to get world AABB.

    3MF spec uses ROW VECTORS: world = local * M (not M * local).
    The stored values rot[row][col] in the 12-value transform are:
      r00 r01 r02  r10 r11 r12  r20 r21 r22  tx ty tz
    Row-vector multiplication: world_i = sum_j(local_j * M_ji)
      world_x = lx*r00 + ly*r10 + lz*r20 + tx
      world_y = lx*r01 + ly*r11 + lz*r21 + ty
      world_z = lx*r02 + ly*r12 + lz*r22 + tz
    """
    min_x, max_x, min_y, max_y, min_z, max_z = aabb
    corners = [
        (min_x, min_y, min_z), (max_x, min_y, min_z),
        (min_x, max_y, min_z), (max_x, max_y, min_z),
        (min_x, min_y, max_z), (max_x, min_y, max_z),
        (min_x, max_y, max_z), (max_x, max_y, max_z),
    ]
    world_corners = []
    for (lx, ly, lz) in corners:
        # Row-vector convention: world = local * M
        wx = lx*rot[0][0] + ly*rot[1][0] + lz*rot[2][0] + tx
        wy = lx*rot[0][1] + ly*rot[1][1] + lz*rot[2][1] + ty
        wz = lx*rot[0][2] + ly*rot[1][2] + lz*rot[2][2] + tz
        world_corners.append((wx, wy, wz))
    wxs = [c[0] for c in world_corners]
    wys = [c[1] for c in world_corners]
    wzs = [c[2] for c in world_corners]
    return (min(wxs), max(wxs), min(wys), max(wys), min(wzs), max(wzs))


print('\nParsing 3MF...')
items = parse_3mf(output_3mf)
print(f'Found {len(items)} instances in build section')

# Print each item's world AABB
print('\n=== Item World-Space AABBs ===')
world_aabbs = []
for i, item in enumerate(items):
    if item['mesh_aabb'] is None:
        print(f'  Item {i} (obj={item["objectid"]}): NO MESH DATA')
        world_aabbs.append(None)
        continue

    waabb = apply_transform(item['rot'], item['tx'], item['ty'], item['tz'], item['mesh_aabb'])
    world_aabbs.append(waabb)

    ext_stem = (item['ext_path'] or '').split('/')[-1] if item['ext_path'] else 'N/A'
    rotated = (item['rot'][0] == [0.0, 1.0, 0.0])
    print(f'  Item {i:2d} (obj={item["objectid"]:>3s}, {ext_stem}, rotated={rotated}):')
    print(f'           transform: {item["transform_str"]}')
    m = item['mesh_aabb']
    print(f'           mesh AABB: x=[{m[0]:.1f},{m[1]:.1f}] y=[{m[2]:.1f},{m[3]:.1f}] z=[{m[4]:.1f},{m[5]:.1f}]')
    print(f'           world AABB: x=[{waabb[0]:.1f},{waabb[1]:.1f}] y=[{waabb[2]:.1f},{waabb[3]:.1f}] z=[{waabb[4]:.1f},{waabb[5]:.1f}]')

# Check all pairs for XY collision
print('\n=== XY Collision Check ===')
collisions = []
tol = 0.01  # floating-point tolerance
for i in range(len(items)):
    for j in range(i+1, len(items)):
        a = world_aabbs[i]
        b = world_aabbs[j]
        if a is None or b is None:
            continue

        ax_min, ax_max, ay_min, ay_max = a[0], a[1], a[2], a[3]
        bx_min, bx_max, by_min, by_max = b[0], b[1], b[2], b[3]

        x_overlap = ax_max - tol > bx_min and bx_max - tol > ax_min
        y_overlap = ay_max - tol > by_min and by_max - tol > ay_min

        if x_overlap and y_overlap:
            ox_min = max(ax_min, bx_min)
            ox_max = min(ax_max, bx_max)
            oy_min = max(ay_min, by_min)
            oy_max = min(ay_max, by_max)
            overlap_area = (ox_max - ox_min) * (oy_max - oy_min)
            ea = (items[i]['ext_path'] or '?').split('/')[-1]
            eb = (items[j]['ext_path'] or '?').split('/')[-1]
            msg = (f'COLLISION: Item {i} (obj={items[i]["objectid"]}, {ea}) '
                   f'vs Item {j} (obj={items[j]["objectid"]}, {eb}) '
                   f'-- XY overlap x=[{ox_min:.2f},{ox_max:.2f}] y=[{oy_min:.2f},{oy_max:.2f}] '
                   f'area={overlap_area:.1f}mm²')
            print(f'  {msg}')
            collisions.append(msg)

if not collisions:
    print('  ALL CLEAR -- no XY collisions found')

print(f'\nTotal: {len(items)} items, {len(collisions)} collision pairs')

# Cleanup
os.unlink(output_3mf)
import shutil
shutil.rmtree(stl_dir)
