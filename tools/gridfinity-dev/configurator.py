#!/usr/bin/env python3
"""Gridfinity Bin Configurator — Flask backend.

Serves a WYSIWYG web app for configuring Gridfinity bins.
Users adjust controls and see a 3D preview update in real time.

Usage:
    pip install flask
    python configurator.py
    # Open http://localhost:5000
"""

import json
import os
import subprocess
import sys
import tempfile
import time

from flask import Flask, Response, request, jsonify, send_from_directory

app = Flask(__name__)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GENERATE_BIN = os.path.join(SCRIPT_DIR, "generate_bin.py")

# PROJECT defaults from MODEL_PREFERENCES.md (override OpenSCAD defaults)
PROJECT_DEFAULTS = {
    "height": [10, 0],
    "lip_style": "none",
    "sub_pitch": 2,
    "enable_magnets": False,
    "enable_screws": False,
    "label_style": "disabled",
    "floor_thickness": 0.7,
}

# Label defaults when label is enabled
LABEL_DEFAULTS = {
    "label_style": "normal",
    "label_position": "left",
    "label_size": [1, 14, 0, 0.6],
    "label_walls": [0, 1, 0, 0],
}

# Quality overrides for fast preview
PREVIEW_QUALITY = {"fa": 15, "fs": 2}


def build_params(user_params, preview=True):
    """Merge project defaults with user overrides into final params."""
    params = dict(PROJECT_DEFAULTS)
    params.update(user_params)

    if preview:
        params.update(PREVIEW_QUALITY)

    return params


def generate_stl(params, output_path):
    """Write params JSON and call generate_bin.py, return (success, stderr)."""
    tmp_json = output_path + ".json"
    try:
        with open(tmp_json, "w") as f:
            json.dump(params, f)

        cmd = [sys.executable, GENERATE_BIN, tmp_json, "-o", output_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            return False, result.stderr or result.stdout
        return True, ""
    finally:
        if os.path.exists(tmp_json):
            os.remove(tmp_json)


def make_filename(params):
    """Generate download filename per naming convention."""
    w = params.get("width", [2, 0])
    d = params.get("depth", [1, 0])
    h = params.get("height", [10, 0])
    wv = w[0] if isinstance(w, list) else w
    dv = d[0] if isinstance(d, list) else d
    hv = h[0] if isinstance(h, list) else h

    def fmt(v):
        return str(int(v)) if v == int(v) else str(v)

    suffixes = []
    if params.get("lip_style", "none") not in ("none", ""):
        suffixes.append("lipped")
    if params.get("label_style", "disabled") != "disabled":
        suffixes.append("labeled")
    if params.get("fingerslide", "none") != "none":
        suffixes.append("fingerslid")
    if params.get("wallpattern_enabled", False):
        suffixes.append("patterned")
    if params.get("wallcutout_vertical", "disabled") != "disabled":
        suffixes.append("cutout")
    if params.get("wallcutout_horizontal", "disabled") != "disabled" and "cutout" not in suffixes:
        suffixes.append("cutout")

    name = f"bin_{fmt(wv)}x{fmt(dv)}x{fmt(hv)}"
    if suffixes:
        name += "_" + "_".join(suffixes)
    return name + ".stl"


@app.route("/")
def index():
    return send_from_directory(SCRIPT_DIR, "configurator.html")


@app.route("/api/preview", methods=["POST"])
def preview():
    user_params = request.get_json(force=True)
    params = build_params(user_params, preview=True)

    with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        start = time.time()
        ok, err = generate_stl(params, tmp_path)
        elapsed = time.time() - start

        if not ok:
            return jsonify({"error": err}), 500

        with open(tmp_path, "rb") as f:
            stl_bytes = f.read()

        print(f"Preview generated in {elapsed:.1f}s")
        return Response(stl_bytes, mimetype="application/octet-stream")
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


@app.route("/api/download", methods=["POST"])
def download():
    user_params = request.get_json(force=True)
    params = build_params(user_params, preview=False)
    filename = make_filename(params)

    with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        start = time.time()
        ok, err = generate_stl(params, tmp_path)
        elapsed = time.time() - start

        if not ok:
            return jsonify({"error": err}), 500

        with open(tmp_path, "rb") as f:
            stl_bytes = f.read()

        print(f"Download generated in {elapsed:.1f}s — {filename}")
        return Response(
            stl_bytes,
            mimetype="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    print("Gridfinity Bin Configurator")
    print("Open http://localhost:5000")
    app.run(debug=True, port=5000)
