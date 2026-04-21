#!/usr/bin/env python3
"""
STL to PNG Renderer
Renders an STL file to a PNG image with top-down view using 2D projection
and normal-based shading for depth visualization.

Installation:
    pip install numpy-stl matplotlib numpy
"""

import numpy as np
from stl import mesh
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
import argparse
import os
import sys
from glob import glob

try:
    import trimesh
    from PIL import Image
except ImportError:
    trimesh = None
    Image = None


def debug_mesh_info(stl_mesh, quiet=False):
    """Print diagnostic info about the mesh geometry."""
    if quiet:
        return
    min_b = stl_mesh.min_
    max_b = stl_mesh.max_
    extents = max_b - min_b
    centroid = (min_b + max_b) / 2
    num_faces = len(stl_mesh.vectors)

    # Classify face normals by dominant direction
    normals = stl_mesh.normals.copy()
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    norms[norms == 0] = 1
    normals /= norms

    up = np.sum(normals[:, 2] > 0.9)
    down = np.sum(normals[:, 2] < -0.9)
    sideways = num_faces - up - down

    print(f"Mesh info:")
    print(f"  Bounds: X[{min_b[0]:.1f}, {max_b[0]:.1f}] Y[{min_b[1]:.1f}, {max_b[1]:.1f}] Z[{min_b[2]:.1f}, {max_b[2]:.1f}]")
    print(f"  Extents: {extents[0]:.1f} x {extents[1]:.1f} x {extents[2]:.1f} mm")
    print(f"  Centroid: ({centroid[0]:.1f}, {centroid[1]:.1f}, {centroid[2]:.1f})")
    print(f"  Faces: {num_faces} total — {up} up, {down} down, {sideways} side")


def render_stl_to_png(stl_path, output_path, max_dimension=800, dpi=100, quiet=False, rotation=0):
    """
    Render an STL file to a PNG image with top-down 2D projection.

    Args:
        stl_path: Path to input STL file
        output_path: Path to output PNG file
        max_dimension: Maximum width or height in pixels (default: 800)
        dpi: Dots per inch for output image
        quiet: If True, suppress verbose output (for batch mode)
    """
    try:
        # Load the STL file
        stl_mesh = mesh.Mesh.from_file(stl_path)

        # Print diagnostic info
        debug_mesh_info(stl_mesh, quiet=quiet)

        # Apply user rotation around Z-axis if specified
        if rotation != 0:
            angle_rad = np.radians(rotation)
            cos_a, sin_a = np.cos(angle_rad), np.sin(angle_rad)
            # Rotate vertices in-place (numpy-stl uses structured arrays)
            v = stl_mesh.vectors
            x_all = v[:, :, 0].copy()
            y_all = v[:, :, 1].copy()
            v[:, :, 0] = cos_a * x_all - sin_a * y_all
            v[:, :, 1] = sin_a * x_all + cos_a * y_all
            # Rotate normals in-place
            n = stl_mesh.normals
            nx = n[:, 0].copy()
            ny = n[:, 1].copy()
            n[:, 0] = cos_a * nx - sin_a * ny
            n[:, 1] = sin_a * nx + cos_a * ny
            # Invalidate numpy-stl cached bounds
            for attr in ('_min', '_max'):
                if hasattr(stl_mesh, attr):
                    delattr(stl_mesh, attr)

        # Get mesh bounds
        min_bounds = stl_mesh.min_
        max_bounds = stl_mesh.max_

        x_range = max_bounds[0] - min_bounds[0]
        y_range = max_bounds[1] - min_bounds[1]

        # Sort faces by average Z (painter's algorithm: draw lowest first)
        z_order = np.mean(stl_mesh.vectors[:, :, 2], axis=1)
        sort_idx = np.argsort(z_order)

        sorted_vectors = stl_mesh.vectors[sort_idx]
        sorted_normals = stl_mesh.normals[sort_idx]

        # Project to 2D: extract X,Y only
        polygons = sorted_vectors[:, :, :2]  # (N, 3, 2) — triangles in XY

        # Compute per-face shading from normals
        normals = sorted_normals.copy()
        norms = np.linalg.norm(normals, axis=1, keepdims=True)
        norms[norms == 0] = 1
        normals /= norms

        # Light from upper-left at 45° elevation
        el, az = np.radians(45), np.radians(225)
        light_dir = np.array([
            np.cos(el) * np.sin(az),
            np.cos(el) * np.cos(az),
            np.sin(el)
        ])
        light_dir /= np.linalg.norm(light_dir)

        ambient = 0.3
        diffuse = np.clip(np.dot(normals, light_dir), 0, 1)
        brightness = ambient + (1 - ambient) * diffuse

        base_color = np.array([0.7, 0.7, 0.75])
        face_colors = brightness[:, np.newaxis] * base_color
        # Add alpha channel (fully opaque faces)
        face_colors = np.column_stack([face_colors, np.ones(len(face_colors))])

        # Compute figure size from model aspect ratio
        aspect_ratio = x_range / y_range if y_range > 0 else 1.0
        if aspect_ratio >= 1.0:
            fig_width = max_dimension / dpi
            fig_height = (max_dimension / aspect_ratio) / dpi
        else:
            fig_width = (max_dimension * aspect_ratio) / dpi
            fig_height = max_dimension / dpi

        # Create 2D figure
        fig, ax = plt.subplots(figsize=(fig_width, fig_height), dpi=dpi)

        # Transparent background
        fig.patch.set_alpha(0)
        ax.patch.set_alpha(0)
        ax.set_axis_off()

        # Render with PolyCollection
        collection = PolyCollection(
            polygons,
            facecolors=face_colors,
            edgecolors=face_colors,
            linewidths=0.5,
        )
        ax.add_collection(collection)

        # Set axis limits with small padding
        pad_x = x_range * 0.02
        pad_y = y_range * 0.02
        ax.set_xlim(min_bounds[0] - pad_x, max_bounds[0] + pad_x)
        ax.set_ylim(min_bounds[1] - pad_y, max_bounds[1] + pad_y)
        ax.set_aspect('equal')

        # Remove all margins
        plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

        # Save with transparency
        plt.savefig(output_path, bbox_inches='tight', pad_inches=0,
                    transparent=True, dpi=dpi)
        plt.close()

        actual_width = int(fig_width * dpi)
        actual_height = int(fig_height * dpi)
        if not quiet:
            print(f"Successfully rendered {stl_path} to {output_path}")
            print(f"Output dimensions: ~{actual_width}x{actual_height} pixels (aspect ratio: {aspect_ratio:.2f})")
        return True

    except FileNotFoundError:
        print(f"Error: STL file not found: {stl_path}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error rendering STL: {str(e)}", file=sys.stderr)
        return False


def render_stl_to_png_perspective(stl_path, output_path, max_dimension=800, camera_tilt=22.5,
                                   fov=45, dpi=100, quiet=False, rotation=0):
    """
    Render an STL file to a PNG image with perspective projection.

    Uses manual perspective projection + a software z-buffer. Every pixel
    independently tracks the closest triangle covering it, giving correct
    occlusion for all geometry regardless of complexity or view angle.

    Args:
        stl_path: Path to input STL file
        output_path: Path to output PNG file (must be .png for transparency)
        max_dimension: Maximum width or height in pixels (default: 800)
        camera_tilt: Camera tilt angle in degrees from top-down (default: 22.5)
        fov: Vertical field of view in degrees (default: 45)
        dpi: Unused in z-buffer mode; kept for API compatibility
        quiet: If True, suppress verbose output
        rotation: Z-axis rotation in degrees (0, 90, 180, 270)

    Returns:
        True on success, False on failure
    """
    try:
        import matplotlib
        matplotlib.use('Agg')

        stl_mesh = mesh.Mesh.from_file(stl_path)
        debug_mesh_info(stl_mesh, quiet=quiet)

        # Exact sin/cos for 90-degree rotation stops (avoids floating-point noise)
        EXACT_ROTATIONS = {
            0:   (1.0,  0.0),
            90:  (0.0,  1.0),
            180: (-1.0, 0.0),
            270: (0.0, -1.0),
        }

        if rotation != 0:
            key = rotation % 360
            cos_a, sin_a = EXACT_ROTATIONS.get(
                key, (np.cos(np.radians(rotation)), np.sin(np.radians(rotation)))
            )
            v = stl_mesh.vectors
            x_all = v[:, :, 0].copy()
            y_all = v[:, :, 1].copy()
            v[:, :, 0] = cos_a * x_all - sin_a * y_all
            v[:, :, 1] = sin_a * x_all + cos_a * y_all
            n = stl_mesh.normals
            nx = n[:, 0].copy()
            ny = n[:, 1].copy()
            n[:, 0] = cos_a * nx - sin_a * ny
            n[:, 1] = sin_a * nx + cos_a * ny
            for attr in ('_min', '_max'):
                if hasattr(stl_mesh, attr):
                    delattr(stl_mesh, attr)

        min_b = stl_mesh.min_
        max_b = stl_mesh.max_
        extents = max_b - min_b
        centroid = (min_b + max_b) / 2.0

        # ── Per-face shading ──────────────────────────────────────────────────
        normals = stl_mesh.normals.copy()
        norms = np.linalg.norm(normals, axis=1, keepdims=True)
        norms[norms == 0] = 1
        normals /= norms

        el_light, az_light = np.radians(45), np.radians(225)
        light_dir = np.array([
            np.cos(el_light) * np.sin(az_light),
            np.cos(el_light) * np.cos(az_light),
            np.sin(el_light),
        ])
        light_dir /= np.linalg.norm(light_dir)
        brightness = 0.3 + 0.7 * np.clip(normals.dot(light_dir), 0, 1)
        base_color = np.array([0.7, 0.7, 0.75], dtype=np.float32)
        face_rgb = (brightness[:, None] * base_color).astype(np.float32)  # (N, 3)

        # ── Camera ───────────────────────────────────────────────────────────
        tilt_rad = np.radians(camera_tilt)
        scene_radius = np.linalg.norm(extents) * 0.5
        cam_dist = scene_radius / np.sin(np.radians(fov) / 2) * 1.5

        cam_pos = centroid + np.array([
            0.0,
            -cam_dist * np.sin(tilt_rad),   # in front (-Y)
             cam_dist * np.cos(tilt_rad),   # above   (+Z)
        ])
        forward = centroid - cam_pos
        forward /= np.linalg.norm(forward)

        world_up = np.array([0.0, 0.0, 1.0])
        if abs(forward.dot(world_up)) > 0.999:
            world_up = np.array([0.0, -1.0, 0.0])
        right = np.cross(forward, world_up)
        right /= np.linalg.norm(right)
        cam_up = np.cross(right, forward)

        # ── Perspective projection → NDC ──────────────────────────────────────
        N = stl_mesh.vectors.shape[0]
        vf = (stl_mesh.vectors.reshape(-1, 3) - cam_pos).astype(np.float32)

        x_view = vf.dot(right.astype(np.float32))
        y_view = vf.dot(cam_up.astype(np.float32))
        z_view = vf.dot(forward.astype(np.float32))

        f_focal = float(1.0 / np.tan(np.radians(fov) / 2))
        z_safe = np.where(z_view > 0.01 * cam_dist, z_view, np.float32(0.01 * cam_dist))
        x_ndc = (x_view / z_safe * f_focal).reshape(N, 3)
        y_ndc = (y_view / z_safe * f_focal).reshape(N, 3)
        z_view = z_view.reshape(N, 3)

        # ── Image dimensions from projected bounds ────────────────────────────
        all_xn = x_ndc.ravel()
        all_yn = y_ndc.ravel()
        xr = float(all_xn.max() - all_xn.min())
        yr = float(all_yn.max() - all_yn.min())
        aspect_ratio = xr / yr if yr > 0 else 1.0

        if aspect_ratio >= 1.0:
            W, H = max_dimension, max(1, int(round(max_dimension / aspect_ratio)))
        else:
            W, H = max(1, int(round(max_dimension * aspect_ratio))), max_dimension

        # ── NDC → pixel coordinates (y-axis flipped) ─────────────────────────
        pad = 0.02
        xn_lo = float(all_xn.min()) - xr * pad
        xn_hi = float(all_xn.max()) + xr * pad
        yn_lo = float(all_yn.min()) - yr * pad
        yn_hi = float(all_yn.max()) + yr * pad

        px = ((x_ndc - xn_lo) / (xn_hi - xn_lo) * (W - 1)).astype(np.float32)
        py = ((yn_hi - y_ndc) / (yn_hi - yn_lo) * (H - 1)).astype(np.float32)

        # ── Software z-buffer rasterization ───────────────────────────────────
        # color_buf: RGBA float32; alpha=0 → transparent background.
        # depth_buf: view-space z per pixel; smaller z = closer to camera.
        color_buf = np.zeros((H, W, 4), dtype=np.float32)
        depth_buf = np.full((H, W), np.inf, dtype=np.float32)

        for i in range(N):
            vx = px[i]      # (3,) pixel x
            vy = py[i]      # (3,) pixel y
            vz = z_view[i]  # (3,) view-space depth per vertex

            # Bounding box clipped to image extents
            bx0 = max(0, int(vx.min()))
            bx1 = min(W - 1, int(np.ceil(vx.max())))
            by0 = max(0, int(vy.min()))
            by1 = min(H - 1, int(np.ceil(vy.max())))
            if bx0 > bx1 or by0 > by1:
                continue

            # Pixel grid within bounding box
            gx, gy = np.meshgrid(
                np.arange(bx0, bx1 + 1, dtype=np.float32),
                np.arange(by0, by1 + 1, dtype=np.float32),
            )

            # Barycentric coordinates via edge equations
            x0, y0 = vx[0], vy[0]
            x1, y1 = vx[1], vy[1]
            x2, y2 = vx[2], vy[2]
            denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(denom) < 0.5:
                continue  # Degenerate / sub-pixel triangle

            inv_d = 1.0 / denom
            w0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) * inv_d
            w1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) * inv_d
            w2 = 1.0 - w0 - w1

            inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not np.any(inside):
                continue

            # Perspective-correct depth interpolation: interpolate 1/z (linear in screen space)
            inv_z_interp = (w0 / vz[0] + w1 / vz[1] + w2 / vz[2])[inside]
            z_interp = 1.0 / inv_z_interp
            ay = gy[inside].astype(np.int32)
            ax = gx[inside].astype(np.int32)

            # Write pixel only where this triangle is closer than what's there
            closer = z_interp < depth_buf[ay, ax]
            uy, ux = ay[closer], ax[closer]
            depth_buf[uy, ux] = z_interp[closer]
            color_buf[uy, ux, :3] = face_rgb[i]
            color_buf[uy, ux, 3] = 1.0

        plt.imsave(output_path, color_buf)

        if not quiet:
            print(f"Successfully rendered {stl_path} to {output_path}")
            print(f"Output dimensions: {W}x{H} pixels (aspect ratio: {aspect_ratio:.2f})")
            print(f"Camera: tilt={camera_tilt}°, fov={fov}°, dist={cam_dist:.1f}mm from centroid")
        return True

    except FileNotFoundError:
        print(f"Error: STL file not found: {stl_path}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error rendering STL with perspective: {str(e)}", file=sys.stderr)
        import traceback
        if not quiet:
            traceback.print_exc()
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Render an STL file to a PNG image. '
                    'Supports both perspective (shows walls/depth) and orthographic (flat top-down) modes. '
                    'Image dimensions automatically match model aspect ratio.'
    )
    parser.add_argument('stl_file', nargs='?', default=None,
                        help='Path to input STL file (omit with --batch)')
    parser.add_argument('-b', '--batch', nargs='?', const='.', default=None, metavar='DIR',
                        help='Process all .stl files in DIR (default: current directory)')
    parser.add_argument('-o', '--output', help='Path to output PNG file (default: input_name.png)')
    parser.add_argument('-s', '--size', type=int, default=800,
                        help='Maximum dimension in pixels (default: 800). '
                             'Other dimension scales to match model aspect ratio.')
    parser.add_argument('-d', '--dpi', type=int, default=100, help='DPI for output image (default: 100)')

    # Rendering mode options
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument('-p', '--perspective', action='store_true',
                           help='Use perspective rendering to show vertical features (default)')
    mode_group.add_argument('--orthographic', action='store_true',
                           help='Use orthographic (flat top-down) rendering')

    # Perspective-specific options
    parser.add_argument('--camera-tilt', type=float, default=22.5,
                       help='Camera tilt angle in degrees for perspective mode (default: 22.5)')
    parser.add_argument('--fov', type=float, default=45,
                       help='Field of view in degrees for perspective mode (default: 45)')
    parser.add_argument('--rotate', type=int, default=0, choices=[0, 90, 180, 270],
                       help='Additional Z-axis rotation in degrees (default: 0)')

    args = parser.parse_args()

    # Determine rendering mode (perspective is default)
    use_perspective = not args.orthographic

    # Validate argument combinations
    if args.batch is not None and args.stl_file:
        parser.error('Cannot use --batch with a positional STL file argument')
    if args.batch is not None and args.output:
        parser.error('Cannot use --output with --batch (output names are derived automatically)')
    if args.batch is None and args.stl_file is None:
        parser.error('Either provide an STL file or use --batch')

    # Check if perspective mode is available
    if use_perspective and (trimesh is None or Image is None):
        print("Warning: Perspective rendering requires trimesh and Pillow libraries.", file=sys.stderr)
        print("Install with: pip install trimesh pillow", file=sys.stderr)
        print("Falling back to orthographic rendering.", file=sys.stderr)
        use_perspective = False

    # Batch mode
    if args.batch is not None:
        stl_files = sorted(glob(os.path.join(args.batch, '*.stl')))
        if not stl_files:
            print(f'No .stl files found in {os.path.abspath(args.batch)}', file=sys.stderr)
            sys.exit(1)

        mode_str = "perspective" if use_perspective else "orthographic"
        print(f'Batch processing {len(stl_files)} STL file(s) in {os.path.abspath(args.batch)} ({mode_str} mode)...')
        successes = 0
        failures = 0

        for stl_file in stl_files:
            output_path = os.path.splitext(stl_file)[0] + '.png'
            if use_perspective:
                success = render_stl_to_png_perspective(
                    stl_file, output_path,
                    max_dimension=args.size,
                    camera_tilt=args.camera_tilt,
                    fov=args.fov,
                    dpi=args.dpi,
                    quiet=True,
                    rotation=args.rotate
                )
            else:
                success = render_stl_to_png(
                    stl_file, output_path,
                    max_dimension=args.size, dpi=args.dpi, quiet=True,
                    rotation=args.rotate
                )
            if success:
                print(f'  Rendered {stl_file} -> {output_path}')
                successes += 1
            else:
                print(f'  FAILED  {stl_file}', file=sys.stderr)
                failures += 1

        print(f'Done: {successes} succeeded, {failures} failed')
        sys.exit(0 if failures == 0 else 1)

    # Single-file mode
    if args.output is None:
        output_path = args.stl_file.rsplit('.', 1)[0] + '.png'
    else:
        output_path = args.output

    if use_perspective:
        success = render_stl_to_png_perspective(
            args.stl_file, output_path,
            max_dimension=args.size,
            camera_tilt=args.camera_tilt,
            fov=args.fov,
            dpi=args.dpi,
            rotation=args.rotate
        )
    else:
        success = render_stl_to_png(
            args.stl_file, output_path,
            max_dimension=args.size, dpi=args.dpi,
            rotation=args.rotate
        )

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
