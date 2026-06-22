#!/usr/bin/env python3
"""Unit tests for bundle_3mf.py — autoarrange_plates logic."""
import sys
import os
import traceback
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))

import io
from PIL import Image

from bundle_3mf import (
    autoarrange_plates,
    build_model_settings_xml,
    generate_plate_thumbnail,
    PLATE_WIDTH_MM, PLATE_DEPTH_MM, ITEM_GAP_MM, GRIDFINITY_UNIT_MM, THUMBNAIL_PX,
)


def _make_box_mesh(w: float, d: float, h: float = 42.0):
    """Minimal centred box mesh (8 verts, 12 tris) mirroring real STL behaviour.

    Gridfinity bins are generated with position="center" so the mesh origin is at
    the centre of the XY footprint (Z goes from 0 to h).
    """
    hw, hd = w / 2, d / 2
    verts = [
        (-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0),
        (-hw, -hd, h), (hw, -hd, h), (hw, hd, h), (-hw, hd, h),
    ]
    tris = [
        (0, 1, 2), (0, 2, 3),  # bottom
        (4, 5, 6), (4, 6, 7),  # top
        (0, 1, 5), (0, 5, 4),  # front
        (2, 3, 7), (2, 7, 6),  # back
        (1, 2, 6), (1, 6, 5),  # right
        (0, 3, 7), (0, 7, 4),  # left
    ]
    return verts, tris


def _mesh_by_filename(plate_items: list) -> dict:
    """Build a mock mesh_by_filename dict for a list of placed items."""
    result = {}
    oid = 1
    for item in plate_items:
        fname = item['filename']
        if fname not in result:
            result[fname] = (oid, *_make_box_mesh(item['width_mm'], item['depth_mm']))
            oid += 1
    return result


def _item(filename, w, d):
    return {'filename': filename, 'width_mm': float(w), 'depth_mm': float(d)}


def test_empty_manifest():
    assert autoarrange_plates([]) == []


def test_single_item_placed_at_origin():
    plates = autoarrange_plates([_item('a.stl', 42, 42)])
    assert len(plates) == 1
    assert len(plates[0]) == 1
    assert plates[0][0]['x'] == 0.0
    assert plates[0][0]['y'] == 0.0


def test_two_items_same_size_fit_on_one_shelf():
    # Two 84×84mm items: 84+2+84 = 170 < 250 → one shelf
    plates = autoarrange_plates([_item('a.stl', 84, 84), _item('b.stl', 84, 84)])
    assert len(plates) == 1
    assert len(plates[0]) == 2
    xs = sorted(p['x'] for p in plates[0])
    assert xs[0] == 0.0
    assert xs[1] == 84.0 + ITEM_GAP_MM


def test_items_wrap_to_new_shelf():
    # 6 items of 42×42mm: 5 fit in one shelf (5*42 + 4*2 = 218 ≤ 250; 6th: 220+42=262>250)
    # 6th starts shelf 2 at y=42+2=44
    items = [_item(f'{i}.stl', 42, 42) for i in range(6)]
    plates = autoarrange_plates(items)
    assert len(plates) == 1  # both shelves fit: 42+2+42 = 86 ≤ 250
    ys = [p['y'] for p in plates[0]]
    assert 0.0 in ys        # shelf 1
    assert 42.0 + ITEM_GAP_MM in ys   # shelf 2


def test_items_overflow_to_second_plate():
    # 15 items of 42×84mm: shelf height=84, two shelves per plate (84+2+84=170 ≤ 250)
    # Shelf 3 would start at y=84+2+84+2=172; 172+84=256 > 250 → new plate
    # 5 items per shelf → plate 1 has 10 items, plate 2 has 5
    items = [_item('bin.stl', 42, 84)] * 15
    plates = autoarrange_plates(items)
    assert len(plates) == 2
    assert len(plates[0]) == 10
    assert len(plates[1]) == 5


def test_oversized_item_still_placed():
    # Item wider than plate: should still be placed (not dropped)
    plates = autoarrange_plates([_item('big.stl', 300, 300)])
    assert len(plates) == 1
    assert len(plates[0]) == 1
    assert plates[0][0]['x'] == 0.0
    assert plates[0][0]['y'] == 0.0


def test_large_items_sorted_first():
    # Large items (greater depth) should be placed before small items
    items = [_item('small.stl', 42, 42), _item('big.stl', 126, 84)]
    plates = autoarrange_plates(items)
    assert len(plates) == 1
    # big.stl should be at x=0 (placed first due to sort)
    big_placed = next(p for p in plates[0] if p['filename'] == 'big.stl')
    assert big_placed['x'] == 0.0
    assert big_placed['y'] == 0.0


def test_small_item_fills_gap_on_existing_shelf():
    # big item (126×84) placed first at (0,0); small item (42×42) should
    # fit on the same shelf since 42 ≤ 84 (shelf height) and 42 ≤ 250-128 (remaining width)
    items = [_item('small.stl', 42, 42), _item('big.stl', 126, 84)]
    plates = autoarrange_plates(items)
    assert len(plates) == 1
    assert len(plates[0]) == 2
    small_placed = next(p for p in plates[0] if p['filename'] == 'small.stl')
    # small goes on the same shelf as big: x = 126 + 2 = 128, y = 0
    assert small_placed['x'] == 126.0 + ITEM_GAP_MM
    assert small_placed['y'] == 0.0


def test_all_items_have_filename_preserved():
    items = [_item('x.stl', 42, 42), _item('y.stl', 84, 84)]
    plates = autoarrange_plates(items)
    filenames = {p['filename'] for plate in plates for p in plate}
    assert filenames == {'x.stl', 'y.stl'}


def test_positions_are_non_negative():
    items = [_item(f'{i}.stl', 42, 42) for i in range(20)]
    plates = autoarrange_plates(items)
    for plate in plates:
        for p in plate:
            assert p['x'] >= 0.0
            assert p['y'] >= 0.0


def test_single_shelf_width_boundary():
    # Exactly 5 items of 42mm with 2mm gaps: 5*42 + 4*2 = 218 ≤ 250 — all fit
    items = [_item('a.stl', 42, 42)] * 5
    plates = autoarrange_plates(items)
    assert len(plates) == 1
    assert all(p['y'] == 0.0 for p in plates[0])  # all on same shelf


def _parse_config(xml_str: str):
    """Parse model_settings.config XML and return the ElementTree root."""
    return ET.fromstring(xml_str.split('\n', 1)[1])  # skip <?xml?> declaration


def test_model_settings_empty_plates():
    xml = build_model_settings_xml([])
    root = ET.fromstring(xml.split('\n', 1)[1])
    assert root.tag == 'config'
    assert list(root) == []


def test_model_settings_single_plate_single_object():
    xml = build_model_settings_xml([[5]])
    root = ET.fromstring(xml.split('\n', 1)[1])
    plates = root.findall('plate')
    assert len(plates) == 1
    plate = plates[0]
    # plater_id must be 1
    plater_id = next(m for m in plate.findall('metadata') if m.get('key') == 'plater_id')
    assert plater_id.get('value') == '1'
    # one model_instance
    instances = plate.findall('model_instance')
    assert len(instances) == 1
    meta = {m.get('key'): m.get('value') for m in instances[0].findall('metadata')}
    assert meta['object_id'] == '5'
    assert meta['instance_id'] == '0'
    assert meta['identify_id'] == '5'


def test_model_settings_two_plates():
    xml = build_model_settings_xml([[2, 3], [4]])
    root = ET.fromstring(xml.split('\n', 1)[1])
    plates = root.findall('plate')
    assert len(plates) == 2
    # plate 1 has two instances, plate 2 has one
    assert len(plates[0].findall('model_instance')) == 2
    assert len(plates[1].findall('model_instance')) == 1
    # plater_id values are 1 and 2
    def plater_id(plate): return next(m for m in plate.findall('metadata') if m.get('key') == 'plater_id').get('value')
    assert plater_id(plates[0]) == '1'
    assert plater_id(plates[1]) == '2'


def test_model_settings_object_ids_preserved():
    obj_ids = [10, 11, 12]
    xml = build_model_settings_xml([obj_ids])
    root = ET.fromstring(xml.split('\n', 1)[1])
    instances = root.find('plate').findall('model_instance')
    found_ids = [next(m for m in inst.findall('metadata') if m.get('key') == 'object_id').get('value')
                 for inst in instances]
    assert found_ids == ['10', '11', '12']


def test_model_settings_no_objects_id_element():
    """Ensure the old <objects_id> format is not present."""
    xml = build_model_settings_xml([[1, 2]])
    assert '<objects_id>' not in xml
    assert '<id value=' not in xml


def test_model_settings_locked_false():
    xml = build_model_settings_xml([[1]])
    root = ET.fromstring(xml.split('\n', 1)[1])
    locked = next(m for m in root.find('plate').findall('metadata') if m.get('key') == 'locked')
    assert locked.get('value') == 'false'


def test_model_settings_thumbnail_file_included():
    xml = build_model_settings_xml([[1]], plate_thumbnails=['Metadata/plate_1.png'])
    root = ET.fromstring(xml.split('\n', 1)[1])
    thumb = next(m for m in root.find('plate').findall('metadata') if m.get('key') == 'thumbnail_file')
    assert thumb.get('value') == 'Metadata/plate_1.png'


def test_model_settings_thumbnail_omitted_when_not_provided():
    xml = build_model_settings_xml([[1]])
    assert 'thumbnail_file' not in xml


def test_model_settings_thumbnail_per_plate():
    xml = build_model_settings_xml([[1], [2]], plate_thumbnails=['Metadata/plate_1.png', 'Metadata/plate_2.png'])
    root = ET.fromstring(xml.split('\n', 1)[1])
    plates = root.findall('plate')
    for i, plate in enumerate(plates, start=1):
        thumb = next(m for m in plate.findall('metadata') if m.get('key') == 'thumbnail_file')
        assert thumb.get('value') == f'Metadata/plate_{i}.png'


def test_generate_plate_thumbnail_returns_valid_png():
    items = [{'x': 0.0, 'y': 0.0, 'width_mm': 84.0, 'depth_mm': 42.0, 'filename': 'a.stl'}]
    png_bytes = generate_plate_thumbnail(items, _mesh_by_filename(items))
    img = Image.open(io.BytesIO(png_bytes))
    assert img.format == 'PNG'
    assert img.size[0] > 100 and img.size[1] > 100


def test_generate_plate_thumbnail_empty_plate():
    # Empty plate has no meshes to look up — passes an empty mesh dict
    png_bytes = generate_plate_thumbnail([], {})
    img = Image.open(io.BytesIO(png_bytes))
    assert img.format == 'PNG'
    assert img.size[0] > 100 and img.size[1] > 100


def test_generate_plate_thumbnail_multiple_items():
    items = [
        {'x': 0.0,  'y': 0.0,  'width_mm': 84.0,  'depth_mm': 42.0,  'filename': 'a.stl'},
        {'x': 86.0, 'y': 0.0,  'width_mm': 42.0,  'depth_mm': 42.0,  'filename': 'b.stl'},
        {'x': 0.0,  'y': 44.0, 'width_mm': 126.0, 'depth_mm': 84.0,  'filename': 'c.stl'},
    ]
    png_bytes = generate_plate_thumbnail(items, _mesh_by_filename(items))
    img = Image.open(io.BytesIO(png_bytes))
    assert img.format == 'PNG'
    assert img.size[0] > 100 and img.size[1] > 100


if __name__ == '__main__':
    tests = [
        test_empty_manifest,
        test_single_item_placed_at_origin,
        test_two_items_same_size_fit_on_one_shelf,
        test_items_wrap_to_new_shelf,
        test_items_overflow_to_second_plate,
        test_oversized_item_still_placed,
        test_large_items_sorted_first,
        test_small_item_fills_gap_on_existing_shelf,
        test_all_items_have_filename_preserved,
        test_positions_are_non_negative,
        test_single_shelf_width_boundary,
        test_model_settings_empty_plates,
        test_model_settings_single_plate_single_object,
        test_model_settings_two_plates,
        test_model_settings_object_ids_preserved,
        test_model_settings_no_objects_id_element,
        test_model_settings_locked_false,
        test_model_settings_thumbnail_file_included,
        test_model_settings_thumbnail_omitted_when_not_provided,
        test_model_settings_thumbnail_per_plate,
        test_generate_plate_thumbnail_returns_valid_png,
        test_generate_plate_thumbnail_empty_plate,
        test_generate_plate_thumbnail_multiple_items,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f'PASS {test.__name__}')
        except Exception as e:
            print(f'FAIL {test.__name__}: {e}')
            traceback.print_exc()
            failed += 1
    total = len(tests)
    print(f'\n{total - failed}/{total} passed')
    sys.exit(0 if failed == 0 else 1)
