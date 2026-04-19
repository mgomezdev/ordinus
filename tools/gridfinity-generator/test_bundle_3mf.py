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
        assert params['label_style'] == 'disabled'
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
        assert params['wallcutout_enabled'] is True
        assert params['wallcutout_walls'] == [1, 0, 1, 0]

    def test_wall_cutout_horizontal(self):
        item = {'widthUnits': 1, 'heightUnits': 1, 'qty': 1,
                'customization': {'height': 8, 'lipStyle': 'normal',
                                  'fingerSlide': 'none', 'wallPattern': 'none',
                                  'wallCutout': 'horizontal'}}
        params = bundle_3mf.build_generate_params(item)
        assert params['wallcutout_enabled'] is True
        assert params['wallcutout_walls'] == [0, 1, 0, 1]

    def test_wall_cutout_both(self):
        item = {'widthUnits': 1, 'heightUnits': 1, 'qty': 1,
                'customization': {'height': 8, 'lipStyle': 'normal',
                                  'fingerSlide': 'none', 'wallPattern': 'none',
                                  'wallCutout': 'both'}}
        params = bundle_3mf.build_generate_params(item)
        assert params['wallcutout_enabled'] is True
        assert params['wallcutout_walls'] == [1, 1, 1, 1]

    def test_wall_cutout_none_not_set(self):
        item = {'widthUnits': 1, 'heightUnits': 1, 'qty': 1,
                'customization': {'height': 8, 'lipStyle': 'normal',
                                  'fingerSlide': 'none', 'wallPattern': 'none',
                                  'wallCutout': 'none'}}
        params = bundle_3mf.build_generate_params(item)
        assert 'wallcutout_enabled' not in params


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
