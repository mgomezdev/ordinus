#!/usr/bin/env python3
"""Unit tests for bundle_3mf.py — autoarrange_plates logic."""
import sys
import os
import traceback
import tempfile
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, os.path.dirname(__file__))

import io
from PIL import Image

from bundle_3mf import (
    autoarrange_plates,
    build_model_settings_xml,
    generate_plate_thumbnail,
    _write_flat_3mf,
    arrange_with_orca,
    ORCA_SLICER_PATH,
    PLATE_WIDTH_MM, PLATE_DEPTH_MM, ITEM_GAP_MM, GRIDFINITY_UNIT_MM, THUMBNAIL_PX,
)

_ORCA_AVAILABLE = os.path.isfile(ORCA_SLICER_PATH)

# Minimal real STL for integration tests (1x1 blank from static library)
_TEST_STL_DIR = os.path.join(
    os.path.dirname(__file__), '..', 'server', 'data', 'static-stls', 'modular-utensil'
)
_TEST_STL_MANIFEST = [
    {'filename': '1x1-blank.stl', 'widthUnits': 1, 'heightUnits': 1, 'qty': 2},
    {'filename': '2x2-blank.stl', 'widthUnits': 2, 'heightUnits': 2, 'qty': 1},
]


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


def test_write_flat_3mf_is_valid_zip():
    """_write_flat_3mf produces a valid ZIP containing the required 3MF entries."""
    stl_dir = _TEST_STL_DIR
    if not os.path.isdir(stl_dir):
        print('SKIP test_write_flat_3mf_is_valid_zip (STL dir not found)')
        return
    with tempfile.NamedTemporaryFile(suffix='.3mf', delete=False) as f:
        out = f.name
    try:
        _write_flat_3mf(_TEST_STL_MANIFEST, stl_dir, out)
        assert zipfile.is_zipfile(out), 'Output is not a valid ZIP'
        with zipfile.ZipFile(out) as zf:
            names = zf.namelist()
        assert '[Content_Types].xml' in names
        assert '_rels/.rels' in names
        assert '3D/model.model' in names
    finally:
        os.unlink(out)


def test_write_flat_3mf_all_items_at_origin():
    """All <item> transforms in the flat 3MF should be the identity (0 0 0)."""
    stl_dir = _TEST_STL_DIR
    if not os.path.isdir(stl_dir):
        print('SKIP test_write_flat_3mf_all_items_at_origin (STL dir not found)')
        return
    with tempfile.NamedTemporaryFile(suffix='.3mf', delete=False) as f:
        out = f.name
    try:
        _write_flat_3mf(_TEST_STL_MANIFEST, stl_dir, out)
        with zipfile.ZipFile(out) as zf:
            model = zf.read('3D/model.model').decode()
        root = ET.fromstring(model)
        ns = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
        items = root.findall('.//m:build/m:item', ns)
        total_qty = sum(e['qty'] for e in _TEST_STL_MANIFEST)
        assert len(items) == total_qty, f'Expected {total_qty} items, got {len(items)}'
        for item in items:
            assert item.get('transform') == '1 0 0 0 1 0 0 0 1 0 0 0', \
                f'Item {item.get("objectid")} has non-identity transform'
    finally:
        os.unlink(out)


def test_arrange_with_orca_raises_when_not_found():
    """arrange_with_orca raises FileNotFoundError when the binary is missing."""
    import bundle_3mf as bm
    original = bm.ORCA_SLICER_PATH
    try:
        bm.ORCA_SLICER_PATH = '/nonexistent/orca-slicer'
        raised = False
        try:
            arrange_with_orca('/tmp/fake.3mf', '/tmp/out.3mf')
        except FileNotFoundError:
            raised = True
        assert raised, 'Expected FileNotFoundError'
    finally:
        bm.ORCA_SLICER_PATH = original


def test_arrange_with_orca_produces_valid_3mf():
    """Integration: OrcaSlicer arranges a flat 3MF and writes a valid output."""
    if not _ORCA_AVAILABLE:
        print('SKIP test_arrange_with_orca_produces_valid_3mf (OrcaSlicer not found)')
        return
    stl_dir = _TEST_STL_DIR
    if not os.path.isdir(stl_dir):
        print('SKIP test_arrange_with_orca_produces_valid_3mf (STL dir not found)')
        return
    with tempfile.NamedTemporaryFile(suffix='.3mf', delete=False) as f:
        flat = f.name
    with tempfile.NamedTemporaryFile(suffix='.3mf', delete=False) as f:
        out = f.name
    try:
        _write_flat_3mf(_TEST_STL_MANIFEST, stl_dir, flat)
        arrange_with_orca(flat, out)
        assert os.path.isfile(out) and os.path.getsize(out) > 1000, \
            'OrcaSlicer output missing or too small'
        assert zipfile.is_zipfile(out), 'OrcaSlicer output is not a valid ZIP'
        with zipfile.ZipFile(out) as zf:
            names = zf.namelist()
        assert any('model_settings.config' in n for n in names), \
            'model_settings.config missing from OrcaSlicer output'
        assert any('plate_1.png' in n for n in names), \
            'plate thumbnail missing from OrcaSlicer output'
    finally:
        for path in (flat, out):
            if os.path.exists(path):
                os.unlink(path)


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
        test_write_flat_3mf_is_valid_zip,
        test_write_flat_3mf_all_items_at_origin,
        test_arrange_with_orca_raises_when_not_found,
        test_arrange_with_orca_produces_valid_3mf,
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
