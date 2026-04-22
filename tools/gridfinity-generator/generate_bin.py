#!/usr/bin/env python3
"""Generate Gridfinity bin STL files from JSON parameter descriptions.

Usage:
    python generate_bin.py params.json
    python generate_bin.py params.json --output my_bin.stl
    python generate_bin.py params.json --dry-run
"""

import argparse
import json
import os
import subprocess
import sys
import time

OPENSCAD_PATH = os.environ.get('OPENSCAD_PATH', r"C:\Program Files\OpenSCAD (Nightly)\openscad.exe")
OPENSCAD_BACKEND = os.environ.get('OPENSCAD_BACKEND', 'Manifold')
SCAD_FILE = os.environ.get(
    'SCAD_FILE',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gridfinity_basic_cup.scad')
)

# Parameters for the combined gridfinity_basic_cup.scad.
# Types: "array", "string", "bool", "number"
PARAM_REGISTRY = {
    # General Cup
    "width":          {"default": [2, 0],   "type": "array"},
    "depth":          {"default": [1, 0],   "type": "array"},
    "height":         {"default": [3, 0],   "type": "array"},
    "filled_in":      {"default": "disabled", "type": "string"},
    "wall_thickness": {"default": 0,        "type": "number"},
    "lip_style":      {"default": "normal", "type": "string"},
    "position":       {"default": "center", "type": "string"},
    "zClearance":     {"default": 0,        "type": "number"},

    # Subdivisions
    "chamber_wall_thickness":              {"default": 1.2,   "type": "number"},
    "vertical_chambers":                   {"default": 1,     "type": "number"},
    "vertical_separator_bend_position":    {"default": 0,     "type": "number"},
    "vertical_separator_bend_angle":       {"default": 0,     "type": "number"},
    "vertical_separator_bend_separation":  {"default": 0,     "type": "number"},
    "vertical_separator_cut_depth":        {"default": 0,     "type": "number"},
    "horizontal_chambers":                 {"default": 1,     "type": "number"},
    "horizontal_separator_bend_position":  {"default": 0,     "type": "number"},
    "horizontal_separator_bend_angle":     {"default": 0,     "type": "number"},
    "horizontal_separator_bend_separation":{"default": 0,     "type": "number"},
    "horizontal_separator_cut_depth":      {"default": 0,     "type": "number"},
    "vertical_irregular_subdivisions":     {"default": False, "type": "bool"},
    "vertical_separator_config":           {"default": "10.5|21|42|50|60", "type": "string"},
    "horizontal_irregular_subdivisions":   {"default": False, "type": "bool"},
    "horizontal_separator_config":         {"default": "10.5|21|42|50|60", "type": "string"},

    # Base
    "magnet_diameter":            {"default": 0,      "type": "number"},
    "magnet_easy_release":        {"default": "auto", "type": "string"},
    "screw_depth":                {"default": 0,      "type": "number"},
    "center_magnet_diameter":     {"default": 0,      "type": "number"},
    "center_magnet_thickness":    {"default": 0,      "type": "number"},
    "hole_overhang_remedy":       {"default": 2,      "type": "number"},
    "box_corner_attachments_only":{"default": True,   "type": "bool"},
    "floor_thickness":            {"default": 0.7,    "type": "number"},
    "cavity_floor_radius":        {"default": -1,     "type": "number"},
    "efficient_floor":            {"default": "off",  "type": "string"},
    "half_pitch":                 {"default": False,  "type": "bool"},  # subdivide base pads for half-cell offsets
    "flat_base":                  {"default": False,  "type": "bool"},
    "spacer":                     {"default": False,  "type": "bool"},

    # Label
    "label_style":    {"default": "normal",        "type": "string"},
    "label_position": {"default": "left",          "type": "string"},
    "label_size":     {"default": [0, 14, 0, 0.6], "type": "array"},
    "label_relief":   {"default": 0,               "type": "number"},
    "label_walls":    {"default": [1, 0, 0, 0],    "type": "array"},

    # Sliding Lid
    "sliding_lid_enabled":       {"default": False, "type": "bool"},
    "sliding_lid_thickness":     {"default": 0,     "type": "number"},
    "sliding_min_wallThickness": {"default": 0,     "type": "number"},
    "sliding_min_support":       {"default": 0,     "type": "number"},
    "sliding_clearance":         {"default": 0.1,   "type": "number"},

    # Finger Slide
    "fingerslide":        {"default": "none",        "type": "string"},
    "fingerslide_radius": {"default": 8,             "type": "number"},
    "fingerslide_walls":  {"default": [1, 0, 0, 0],  "type": "array"},

    # Tapered Corner
    "tapered_corner":      {"default": "none", "type": "string"},
    "tapered_corner_size": {"default": 10,     "type": "number"},
    "tapered_setback":     {"default": -1,     "type": "number"},

    # Wall Pattern
    "wallpattern_enabled":          {"default": False,       "type": "bool"},
    "wallpattern_style":            {"default": "grid",      "type": "string"},
    "wallpattern_hole_spacing":     {"default": 2,           "type": "number"},
    "wallpattern_walls":            {"default": [1, 1, 1, 1],"type": "array"},
    "wallpattern_dividers_enabled": {"default": "disabled",  "type": "string"},
    "wallpattern_hole_sides":       {"default": 6,           "type": "number"},
    "wallpattern_hole_size":        {"default": 5,           "type": "number"},
    "wallpattern_fill":             {"default": "crop",      "type": "string"},
    "wallpattern_voronoi_noise":    {"default": 0.75,        "type": "number"},
    "wallpattern_voronoi_radius":   {"default": 0.5,         "type": "number"},

    # Wall Cutout
    "wallcutout_vertical":               {"default": "disabled", "type": "string"},
    "wallcutout_horizontal":             {"default": "disabled", "type": "string"},
    "wallcutout_vertical_width":         {"default": 0,          "type": "number"},
    "wallcutout_vertical_angle":         {"default": 70,         "type": "number"},
    "wallcutout_vertical_height":        {"default": 0,          "type": "number"},
    "wallcutout_vertical_corner_radius": {"default": 5,          "type": "number"},
    "wallcutout_horizontal_width":         {"default": 0,          "type": "number"},
    "wallcutout_horizontal_angle":         {"default": 70,         "type": "number"},
    "wallcutout_horizontal_height":        {"default": 0,          "type": "number"},
    "wallcutout_horizontal_corner_radius": {"default": 5,          "type": "number"},

    # Extendable
    "extension_x_enabled":   {"default": False, "type": "bool"},
    "extension_y_enabled":   {"default": False, "type": "bool"},
    "extension_tabs_enabled":{"default": True,  "type": "bool"},

    # Debug
    "cutx":        {"default": 0,     "type": "number"},
    "cuty":        {"default": 0,     "type": "number"},
    "enable_help": {"default": False, "type": "bool"},
}


def format_value(value, param_type):
    """Convert a Python value to OpenSCAD -D flag syntax."""
    if param_type == "array":
        inner = ",".join(str(v) for v in value)
        return f"[{inner}]"
    if param_type == "string":
        return f'"{value}"'
    if param_type == "bool":
        if isinstance(value, str):
            return "true" if value.lower() in ("true", "1", "yes") else "false"
        return "true" if value else "false"
    # number
    return str(value)


def build_command(params, output_path, scad_file=None):
    """Build the OpenSCAD CLI command as a list of args."""
    scad = scad_file if scad_file else SCAD_FILE
    cmd = [
        OPENSCAD_PATH,
        scad,
        "--backend", OPENSCAD_BACKEND,
        "--export-format", "binstl",
        "--enable", "textmetrics",
        "-o", output_path,
    ]

    for name, value in params.items():
        if name not in PARAM_REGISTRY:
            print(f"Warning: unknown parameter '{name}', skipping")
            continue
        reg = PARAM_REGISTRY[name]
        if value == reg["default"]:
            continue
        formatted = format_value(value, reg["type"])
        cmd.extend(["-D", f"{name}={formatted}"])

    return cmd


def auto_filename(params):
    """Generate a filename like bin_2x1x3.stl from dimensions."""
    w = params.get("width", PARAM_REGISTRY["width"]["default"])
    d = params.get("depth", PARAM_REGISTRY["depth"]["default"])
    h = params.get("height", PARAM_REGISTRY["height"]["default"])
    wv = w[0] if isinstance(w, list) else w
    dv = d[0] if isinstance(d, list) else d
    hv = h[0] if isinstance(h, list) else h

    def fmt(v):
        return str(int(v)) if v == int(v) else str(v)
    return f"bin_{fmt(wv)}x{fmt(dv)}x{fmt(hv)}.stl"


def main():
    parser = argparse.ArgumentParser(description="Generate Gridfinity bin STL from JSON parameters")
    parser.add_argument("params_file", help="JSON file with bin parameters")
    parser.add_argument("--output", "-o", help="Output STL path (default: auto-generated)")
    parser.add_argument("--model", "-m", help="Path to .scad file (overrides SCAD_FILE env var)")
    parser.add_argument("--dry-run", action="store_true", help="Print command without running")
    args = parser.parse_args()

    with open(args.params_file) as f:
        params = json.load(f)

    output_path = args.output or auto_filename(params)

    scad_file = args.model or None
    cmd = build_command(params, output_path, scad_file=scad_file)

    display_cmd = []
    for part in cmd:
        if " " in part:
            display_cmd.append(f'"{part}"')
        else:
            display_cmd.append(part)
    print("Command:")
    print("  " + " ".join(display_cmd))
    print()

    if args.dry_run:
        print("(dry run — not executing)")
        return

    if not os.path.isfile(OPENSCAD_PATH):
        print(f"Error: OpenSCAD not found at {OPENSCAD_PATH}")
        sys.exit(1)

    effective_scad = scad_file or SCAD_FILE
    if not os.path.isfile(effective_scad):
        print(f"Error: SCAD file not found at {effective_scad}")
        sys.exit(1)

    print(f"Rendering {output_path}...")
    start = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.time() - start

    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    if result.returncode != 0:
        print(f"OpenSCAD exited with code {result.returncode}")
        sys.exit(result.returncode)

    size_bytes = os.path.getsize(output_path)
    if size_bytes < 1024:
        size_str = f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        size_str = f"{size_bytes / 1024:.1f} KB"
    else:
        size_str = f"{size_bytes / (1024 * 1024):.1f} MB"

    print(f"Done in {elapsed:.1f}s — {output_path} ({size_str})")


if __name__ == "__main__":
    main()
