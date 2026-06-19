#!/usr/bin/env python3
"""Unit tests for bundle_3mf.py — autoarrange_plates logic."""
import sys
import os
import traceback

sys.path.insert(0, os.path.dirname(__file__))

from bundle_3mf import autoarrange_plates, PLATE_WIDTH_MM, PLATE_DEPTH_MM, ITEM_GAP_MM, GRIDFINITY_UNIT_MM


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
