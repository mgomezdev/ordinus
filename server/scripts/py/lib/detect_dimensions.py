"""Detect Gridfinity grid dimensions from STL or 3MF geometry."""
import math
from pathlib import Path

GRIDFINITY_UNIT_MM = 42.0

def detect_from_stl(file_path: str) -> tuple[int, int]:
    from stl import mesh  # numpy-stl
    import numpy as np
    m = mesh.Mesh.from_file(file_path)
    extent_x = m.x.max() - m.x.min()
    extent_y = m.y.max() - m.y.min()
    grid_x = max(1, math.ceil(extent_x / GRIDFINITY_UNIT_MM))
    grid_y = max(1, math.ceil(extent_y / GRIDFINITY_UNIT_MM))
    return grid_x, grid_y

def detect_from_3mf(file_path: str) -> tuple[int, int]:
    import trimesh
    scene = trimesh.load(file_path, force='scene')
    if hasattr(scene, 'dump'):
        meshes = scene.dump(concatenate=True)
    else:
        meshes = scene
    bounds = meshes.bounds
    extent_x = bounds[1][0] - bounds[0][0]
    extent_y = bounds[1][1] - bounds[0][1]
    grid_x = max(1, math.ceil(extent_x / GRIDFINITY_UNIT_MM))
    grid_y = max(1, math.ceil(extent_y / GRIDFINITY_UNIT_MM))
    return grid_x, grid_y

def detect_dimensions(file_path: str) -> tuple[int, int]:
    ext = Path(file_path).suffix.lower()
    if ext == '.stl':
        return detect_from_stl(file_path)
    elif ext == '.3mf':
        return detect_from_3mf(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
