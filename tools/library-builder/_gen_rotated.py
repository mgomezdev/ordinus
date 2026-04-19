#!/usr/bin/env python3
"""Generate rotated perspective PNGs for shadowbox library (90, 180, 270 degrees)."""
import subprocess, sys, os

SCRIPT = os.path.join(os.path.dirname(__file__), "stl_to_png.py")
STL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "libraries", "shadowbox")

sizes = [(w, d) for w in range(2, 6) for d in range(2, 6)]
rotations = [90, 180, 270]
failures = []

for w, d in sizes:
    stl = os.path.join(STL_DIR, f"shadowbox_{w}x{d}.stl")
    for rot in rotations:
        out = os.path.join(STL_DIR, f"shadowbox_{w}x{d}-perspective-{rot}.png")
        print(f"Rendering shadowbox_{w}x{d}-perspective-{rot}.png ...")
        result = subprocess.run(
            [sys.executable, SCRIPT, stl, "--output", out, "--size", "800", "--rotate", str(rot)],
            capture_output=False
        )
        if result.returncode != 0:
            failures.append(f"shadowbox_{w}x{d}-perspective-{rot}.png")

if failures:
    print(f"\nFAILED: {failures}", file=sys.stderr)
    sys.exit(1)

print(f"\nDone — generated {len(sizes) * len(rotations)} rotated perspective PNGs")
