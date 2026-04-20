#!/usr/bin/env python3
"""
CLI entry point for STL/3MF processing.
Usage: python3 process_stl.py --input /path/to/file.stl --output-dir /path/to/images --id abc123

Outputs JSON to stdout on success:
  {"gridX": 2, "gridY": 1, "imageUrl": "abc123.png", "perspImageUrls": ["abc123-p0.png", ...]}

Exits non-zero with error message to stderr on failure.
"""
import argparse
import json
import sys
from pathlib import Path


def validate_magic_bytes(file_path: str) -> str:
    """
    Validate file header to determine actual format.
    Returns 'stl' or '3mf'.
    Raises ValueError if format is unrecognized.
    """
    path = Path(file_path)
    with open(file_path, 'rb') as f:
        header = f.read(4)

    # 3MF is a ZIP container: starts with PK\x03\x04
    if header[:4] == b'PK\x03\x04':
        return '3mf'

    # STL: binary (80-byte header) or ASCII (starts with 'solid')
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            first_line = f.readline().strip().lower()
        if first_line.startswith('solid'):
            return 'stl'
        # Binary STL: no magic bytes required, just needs to be >= 84 bytes
        if path.stat().st_size >= 84:
            return 'stl'
    except Exception:
        pass

    raise ValueError(f"File does not appear to be a valid STL or 3MF: {file_path}")


def main():
    parser = argparse.ArgumentParser(description='Process STL/3MF file for Gridfinity library.')
    parser.add_argument('--input', required=True, help='Path to input STL/3MF file')
    parser.add_argument('--output-dir', required=True, help='Directory to write preview images')
    parser.add_argument('--id', required=True, help='Upload ID (used as image filename prefix)')
    args = parser.parse_args()

    try:
        validate_magic_bytes(args.input)

        from lib.detect_dimensions import detect_dimensions
        grid_x, grid_y = detect_dimensions(args.input)

        from lib.render_previews import render_all
        image_result = render_all(args.input, args.output_dir, args.id)

        result = {
            "gridX": grid_x,
            "gridY": grid_y,
            "imageUrl": image_result["imageUrl"],
            "perspImageUrls": image_result["perspImageUrls"],
        }
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
