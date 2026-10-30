"""Geometry regression for a generator template update.

Renders each case twice - once with the baseline scad and the parameter names it used, once with the
current scad through generate_bin.py using the params Ordinus now emits - and compares the meshes by
volume and point-to-surface distance (STL hashes are not stable across template versions).

    pip install trimesh numpy scipy rtree
    git show <old-ref>:generator/gridfinity_basic_cup.scad > old.scad
    (cd server && npx tsx ../generator/regression/emit_params.ts ../params.json)
    python generator/regression/compare_geometry.py --baseline-scad old.scad --params params.json

The baseline arguments below are what the previous generator received (its parameter names and defaults);
update them with BASELINE_DEFAULTS and OLD_CASES when the baseline changes.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import trimesh
from trimesh.proximity import closest_point

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import generate_bin  # noqa: E402

SAMPLES = 10000
VOLUME_TOLERANCE_PCT = 1.0
MEAN_DISTANCE_TOLERANCE_MM = 0.02
MAX_DISTANCE_TOLERANCE_MM = 1.0

# Behaviour the upstream template changed on purpose; these are reported, not failed.
KNOWN_DIVERGENT = {
    'lib_labeled_2x1': 'label geometry differs slightly',
    'custom_label': 'label geometry differs slightly',
    'custom_label_back': 'label geometry differs slightly',
    'lib_wallpattern_grid': 'wall pattern algorithm differs',
    'lib_wallpattern_hex': 'wall pattern algorithm differs',
    'custom_flat_base': 'flat base is about 0.7 mm thicker',
    'custom_spacer': 'spacer removes more of the floor',
    'custom_sliding_lid': 'sliding lid detail differs',
    'custom_dividers': 'divider top detail differs',
    'custom_magnet_size': 'magnet height is now configurable (the baseline fixed it at 2.4)',
    'custom_extension': 'extension tab detail differs',
}

BASELINE_DEFAULTS = {'label_style': 'disabled', 'half_pitch': True}


def lib(w, d, **extra):
    args = dict(BASELINE_DEFAULTS, width=[w, 0], depth=[d, 0], height=[4, 0], lip_style='normal', fingerslide='none',
                wallcutout_enabled=False, wallcutout_walls=[0, 0, 0, 0])
    args.update(extra)
    return args


def cus(w, d, h, **extra):
    args = lib(w, d, **extra)
    args['height'] = [h, 0]
    return args


def cutout(walls):
    return dict(wallcutout_enabled=True, wallcutout_walls=walls)


OLD_CASES = {
    'lib_standard_3x2': lib(3, 2),
    'lib_labeled_2x1': lib(2, 1, label_style='normal', label_walls=[0, 1, 0, 0]),
    'lib_shadowbox_2x2': lib(2, 2, lip_style='normal', filled_in='enabled'),
    'lib_lip_reduced': lib(2, 1, lip_style='reduced'),
    'lib_lip_none': lib(2, 1, lip_style='none'),
    'lib_lip_minimum': lib(2, 1, lip_style='minimum'),
    'lib_fingerslide_rounded': lib(2, 1, fingerslide='rounded'),
    'lib_fingerslide_chamfer': lib(2, 1, fingerslide='chamfered'),
    'lib_cutout_front': lib(2, 1, **cutout([-2, 0, 0, 0])),
    'lib_cutout_left': lib(2, 1, **cutout([0, 0, -2, 0])),
    'lib_cutout_all': lib(2, 2, **cutout([-2, -2, -2, -2])),
    'lib_wallpattern_grid': lib(2, 1, wallpattern_enabled=True, wallpattern_style='grid'),
    'lib_wallpattern_hex': lib(2, 1, wallpattern_enabled=True, wallpattern_style='hexgrid'),
    'custom_default': cus(3, 2, 4),
    'custom_half': cus(2.5, 1.5, 3.5),
    'custom_whole_no_halfpitch': cus(3, 2, 4, half_pitch=False),
    'custom_magnets_screws': cus(2, 1, 3, magnet_diameter=6.5, screw_depth=6),
    'custom_magnet_size': cus(2, 1, 3, magnet_diameter=8),
    'custom_center_magnet': cus(2, 1, 3, center_magnet_diameter=10, center_magnet_thickness=2),
    'custom_label': cus(2, 1, 3, label_style='normal'),
    'custom_label_back': cus(2, 1, 3, label_style='normal', label_walls=[0, 1, 0, 0]),
    'custom_dividers': cus(3, 2, 3, vertical_chambers=3, horizontal_chambers=2),
    'custom_sliding_lid': cus(2, 1, 3, sliding_lid_enabled=True, sliding_lid_thickness=3, sliding_min_wallThickness=2),
    'custom_efficient_floor': cus(2, 1, 3, efficient_floor='on'),
    'custom_tapered': cus(2, 1, 3, tapered_corner='rounded'),
    'custom_extension': cus(2, 1, 3, extension_x_enabled=True),
    'custom_filled': cus(2, 1, 3, filled_in='enabled'),
    'custom_floor': cus(2, 1, 3, floor_thickness=1.5, wall_thickness=1.6),
    'custom_flat_base': cus(2, 1, 3, flat_base=True),
    'custom_spacer': cus(2, 1, 3, spacer=True),
}


def scad_value(value):
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (list, tuple)):
        return '[' + ','.join(scad_value(v) for v in value) + ']'
    if isinstance(value, str):
        return '"' + value + '"'
    return str(value)


def render_baseline(scad, args, out):
    cmd = [generate_bin.OPENSCAD_PATH, scad, '--backend', 'Manifold', '--export-format', 'binstl', '--enable', 'textmetrics', '-o', out]
    for name, value in args.items():
        cmd += ['-D', f'{name}={scad_value(value)}']
    subprocess.run(cmd, capture_output=True, check=False)
    return out


def render_current(scad, params, out, workdir):
    params_file = os.path.join(workdir, os.path.basename(out) + '.json')
    with open(params_file, 'w') as handle:
        json.dump(params, handle)
    env = dict(os.environ, OPENSCAD_BACKEND='Manifold')
    script = os.path.join(HERE, '..', 'generate_bin.py')
    subprocess.run([sys.executable, script, params_file, '-o', out, '--model', scad], env=env, capture_output=True, check=False)
    return out


def load(path):
    return trimesh.load(path) if os.path.exists(path) and os.path.getsize(path) > 200 else None


def distances(a, b):
    to_b = closest_point(b, a.sample(SAMPLES))[1]
    to_a = closest_point(a, b.sample(SAMPLES))[1]
    return max(to_a.max(), to_b.max()), (to_a.mean() + to_b.mean()) / 2


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--baseline-scad', required=True)
    parser.add_argument('--params', required=True, help='JSON from emit_params.ts')
    parser.add_argument('--scad', default=generate_bin.SCAD_FILE, help='scad under test (default: generator template)')
    parser.add_argument('cases', nargs='*')
    args = parser.parse_args()

    current = json.load(open(args.params))
    failures = 0
    with tempfile.TemporaryDirectory() as workdir:
        for name, old_args in OLD_CASES.items():
            if args.cases and name not in args.cases:
                continue
            old = load(render_baseline(os.path.abspath(args.baseline_scad), old_args, os.path.join(workdir, name + '_old.stl')))
            new = load(render_current(os.path.abspath(args.scad), current[name], os.path.join(workdir, name + '_new.stl'), workdir))
            if old is None or new is None:
                print(f'{name:28s} RENDER FAIL baseline={old is not None} current={new is not None}')
                failures += 1
                continue
            vol_pct = (new.volume / old.volume - 1) * 100
            worst, mean = distances(old, new)
            ok = abs(vol_pct) <= VOLUME_TOLERANCE_PCT and mean <= MEAN_DISTANCE_TOLERANCE_MM and worst <= MAX_DISTANCE_TOLERANCE_MM
            status = 'PASS' if ok else ('KNOWN' if name in KNOWN_DIVERGENT else 'FAIL')
            note = f'  ({KNOWN_DIVERGENT[name]})' if status == 'KNOWN' else ''
            print(f'{status:5s} {name:28s} vol {old.volume:8.0f} -> {new.volume:8.0f} ({vol_pct:+6.2f}%) '
                  f'max {worst:6.3f} mm mean {mean:.4f} mm  extents {np.round(new.extents - old.extents, 2)}{note}', flush=True)
            failures += status == 'FAIL'
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
