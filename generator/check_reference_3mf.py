#!/usr/bin/env python3
"""
Validate collision checker against reference 3MF files.
Run: python3 /tmp/check_reference_3mf.py
"""

import os
import sys
import xml.etree.ElementTree as ET
import zipfile

NS_CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
NS_PROD = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06'


def parse_3mf(path, main_entry_name='3D/3dmodel.model'):
    """Return list of items with world transform info and mesh AABB."""
    with zipfile.ZipFile(path) as zf:
        # Find main model file
        entries = zf.namelist()
        main_entry = None
        for name in [main_entry_name, '3D/model.model']:
            if name in entries:
                main_entry = name
                break
        if not main_entry:
            print(f'  ERROR: no model file found in {path}. Entries: {entries}')
            return []

        model_xml = zf.read(main_entry).decode('utf-8')
        root = ET.fromstring(model_xml)

        # Build map: wrapper_id -> external_model_path (for production-extension 3MFs)
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

        # Also build a map of inline mesh objects (for non-external-model format)
        inline_aabbs = {}
        if resources_el is not None:
            for obj_el in resources_el.findall(f'{{{NS_CORE}}}object'):
                obj_id = obj_el.get('id')
                mesh_el = obj_el.find(f'{{{NS_CORE}}}mesh')
                if mesh_el is not None:
                    verts_el = mesh_el.find(f'{{{NS_CORE}}}vertices')
                    if verts_el is not None:
                        vertices = []
                        for v_el in verts_el.findall(f'{{{NS_CORE}}}vertex'):
                            vertices.append((float(v_el.get('x')), float(v_el.get('y')), float(v_el.get('z'))))
                        if vertices:
                            xs = [v[0] for v in vertices]
                            ys = [v[1] for v in vertices]
                            zs = [v[2] for v in vertices]
                            inline_aabbs[obj_id] = (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))

        # Also inline objects that are component wrappers referencing inline meshes
        inline_wrapper_aabbs = {}
        if resources_el is not None:
            for obj_el in resources_el.findall(f'{{{NS_CORE}}}object'):
                obj_id = obj_el.get('id')
                comps_el = obj_el.find(f'{{{NS_CORE}}}components')
                if comps_el is not None and obj_id not in wrapper_to_extpath:
                    for comp_el in comps_el.findall(f'{{{NS_CORE}}}component'):
                        ref_id = comp_el.get('objectid')
                        if ref_id and ref_id in inline_aabbs:
                            inline_wrapper_aabbs[obj_id] = inline_aabbs[ref_id]

        # Parse build items
        items = []
        build_el = root.find(f'{{{NS_CORE}}}build')
        if build_el is not None:
            for item_el in build_el.findall(f'{{{NS_CORE}}}item'):
                objectid = item_el.get('objectid')
                transform_str = item_el.get('transform', '1 0 0 0 1 0 0 0 1 0 0 0')
                parts = [float(x) for x in transform_str.split()]
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
            oid = item['objectid']
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

            if ext_path:
                item['mesh_aabb'] = mesh_aabb_cache.get(ext_path)
            elif oid in inline_wrapper_aabbs:
                item['mesh_aabb'] = inline_wrapper_aabbs[oid]
            elif oid in inline_aabbs:
                item['mesh_aabb'] = inline_aabbs[oid]
            else:
                item['mesh_aabb'] = None

    return items


def apply_transform(rot, tx, ty, tz, aabb):
    """3MF row-vector convention: world = local * M."""
    min_x, max_x, min_y, max_y, min_z, max_z = aabb
    corners = [
        (min_x, min_y, min_z), (max_x, min_y, min_z),
        (min_x, max_y, min_z), (max_x, max_y, min_z),
        (min_x, min_y, max_z), (max_x, min_y, max_z),
        (min_x, max_y, max_z), (max_x, max_y, max_z),
    ]
    world_corners = []
    for (lx, ly, lz) in corners:
        wx = lx*rot[0][0] + ly*rot[1][0] + lz*rot[2][0] + tx
        wy = lx*rot[0][1] + ly*rot[1][1] + lz*rot[2][1] + ty
        wz = lx*rot[0][2] + ly*rot[1][2] + lz*rot[2][2] + tz
        world_corners.append((wx, wy, wz))
    wxs = [c[0] for c in world_corners]
    wys = [c[1] for c in world_corners]
    wzs = [c[2] for c in world_corners]
    return (min(wxs), max(wxs), min(wys), max(wys), min(wzs), max(wzs))


def check_collisions(path):
    print(f'\n{"="*60}')
    print(f'Checking: {os.path.basename(path)}')
    items = parse_3mf(path)
    print(f'Items found: {len(items)}')

    world_aabbs = []
    for i, item in enumerate(items):
        if item['mesh_aabb'] is None:
            print(f'  Item {i} (obj={item["objectid"]}): NO MESH DATA')
            world_aabbs.append(None)
            continue
        waabb = apply_transform(item['rot'], item['tx'], item['ty'], item['tz'], item['mesh_aabb'])
        world_aabbs.append(waabb)
        m = item['mesh_aabb']
        print(f'  Item {i:2d} (obj={item["objectid"]:>3s}): '
              f'world x=[{waabb[0]:.1f},{waabb[1]:.1f}] y=[{waabb[2]:.1f},{waabb[3]:.1f}]')

    collisions = []
    tol = 0.01
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
                area = (ox_max - ox_min) * (oy_max - oy_min)
                msg = (f'COLLISION: Item {i} (obj={items[i]["objectid"]}) vs '
                       f'Item {j} (obj={items[j]["objectid"]}) -- '
                       f'XY x=[{ox_min:.1f},{ox_max:.1f}] y=[{oy_min:.1f},{oy_max:.1f}] '
                       f'area={area:.1f}mm²')
                print(f'  {msg}')
                collisions.append(msg)

    if not collisions:
        print('  RESULT: ALL CLEAR -- no XY collisions')
    else:
        print(f'  RESULT: {len(collisions)} COLLISIONS FOUND')
    return len(collisions)


# Check reference files
base = '/tmp/ref_3mf'
correct_path = f'{base}/correct.3mf'
incorrect_path = f'{base}/incorrect.3mf'

n_correct = check_collisions(correct_path)
n_incorrect = check_collisions(incorrect_path)

print(f'\n{"="*60}')
print(f'Correct 3MF collisions: {n_correct} (expected: 0)')
print(f'Incorrect 3MF collisions: {n_incorrect} (expected: >0 if truly incorrect)')
if n_correct == 0 and n_incorrect > 0:
    print('Checker validated: correctly identifies good vs bad 3MF')
elif n_correct == 0 and n_incorrect == 0:
    print('WARNING: Both are collision-free -- either both are good or checker has a bug')
else:
    print('WARNING: Correct 3MF has collisions -- check the reference files')
