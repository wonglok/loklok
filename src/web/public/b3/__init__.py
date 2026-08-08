# Blender Add-on
# Contributor(s): Lok Wong @wonglok831 at x.com and github.com/wonglok
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTIBILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <http://www.gnu.org/licenses/>.

bl_info = {
    "name": "B3 Addon",
    "description": "Blender and ThreeJS Addon",
    "author": "Lok Wong",
    "version": (1, 0, 3),
    "blender": (4, 1, 0),
    "location": "Properties > Render > B3 Addon",
    "warning": "", # used for warning icon and text in add-ons panel
    "wiki_url": "http://inter-site.com",
    "category": "3D View"
}

import bpy
import json
import array
import mathutils
import os
import math
import signal
import struct
import asyncio
import threading
import sys
import subprocess

# ---------------------------------------------------------------------------
# Auto-install websockets in Blender's bundled Python
# ---------------------------------------------------------------------------
try:
    import websockets
except ImportError:
    print("[B3Sync] Installing websockets package...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
    import websockets

from websockets.exceptions import ConnectionClosed

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SERVER_HOST = "localhost"
SERVER_PORT_DEFAULT = 8765


# ---------------------------------------------------------------------------
# Shared state — all protected by _lock
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_state = {
    "running": False,
    "error": "",
    "clients": set(),
    "loop": None,
    "server": None,
    "thread": None,
    "hdr_cache": None,    # (width, height, pixels_bytes, key) or None
    "tex_cache": {},      # image_name → (mime, bytes, key)
    "geo_cache": {},      # obj_name → (version, vCount, iCount, hasUVs, blob_bytes)
    "camera_sync_enabled": True,
    "scene_cams_cache": None,
    "scene_cams_sent": set(),
    "lights_cache": None,
    "lights_sent": set(),
    "port": 0,
}


def _set_running(running: bool, error: str = ""):
    """Thread-safe state update.  The timer picks up the change on the next tick."""
    with _lock:
        _state["running"] = running
        _state["error"] = error


def _redraw_all():
    """Force Blender to redraw every UI area so the panel updates.
    MUST be called from the main thread.

    Safe to call during add-on registration — when bpy.context is a restricted
    context (e.g. during install/enable) we simply skip the redraw."""
    try:
        for window in bpy.context.window_manager.windows:
            for area in window.screen.areas:
                area.tag_redraw()
    except (AttributeError, TypeError):
        pass  # restricted context — no redraw needed at registration time


# ---------------------------------------------------------------------------
# Shader node-graph extraction
import re

def _slugify(name):
    """Normalize a Blender identifier into a portable slug.

    Lowercase, replace runs of non-alphanumeric chars with a single hyphen,
    strip leading / trailing hyphens.  Examples:
      'Base Color'      → 'base-color'
      'BSDF_PRINCIPLED' → 'bsdf-principled'
      'Emission Color'  → 'emission-color'
    """
    slug = re.sub(r'[^a-zA-Z0-9]+', '-', str(name)).strip('-').lower()
    return slug


# ---------------------------------------------------------------------------
def _extract_node_graph(mat):
    """Walk the material's shader node tree and serialise it.

    Returns a list of dicts — one per node — with:
      - id        : unique node identifier (name)
      - type      : slugified node type (bsdf-principled, tex-image, …)
      - label     : human-readable label (Blender node label or name)
      - inputs    : list of {name (slug), value?, fromNode?, fromSocket? (slug)}

    All identifiers are slugified so the web side can use them as-is."""
    if not mat or not mat.use_nodes:
        return None

    nodes = []
    for node in mat.node_tree.nodes:
        try:
            inputs = []
            for sock in node.inputs:
                entry = {"name": _slugify(sock.name)}
                if sock.is_linked:
                    for link in sock.links:
                        entry["fromNode"] = _slugify(link.from_node.name)
                        entry["fromSocket"] = _slugify(link.from_socket.name)
                        break  # only first link
                else:
                    try:
                        val = sock.default_value
                        # Handle Image data-blocks (TEX_IMAGE node "Image" socket)
                        if hasattr(val, 'name') and hasattr(val, 'size'):
                            # bpy.types.Image — store just the name
                            entry["value"] = val.name
                        elif hasattr(val, '__iter__') and not isinstance(val, str):
                            entry["value"] = [round(float(v), 7) for v in val]
                        elif hasattr(val, '__len__') and not isinstance(val, str):
                            entry["value"] = list(val)
                        else:
                            try:
                                entry["value"] = round(float(val), 7) if isinstance(val, (int, float)) else str(val)
                            except (ValueError, TypeError):
                                entry["value"] = str(val)
                    except Exception:
                        # Some sockets have no default_value — skip
                        pass
                inputs.append(entry)

            nodes.append({
                "id":    _slugify(node.name),
                "type":  _slugify(node.type),
                "label": getattr(node, "label", "") or node.name,
                "inputs": inputs,
            })

            # --- Color Ramp (valtorgb) — extract stops for TSL gradient sampling ---
            if node.type == 'VALTORGB' and hasattr(node, 'color_ramp'):
                ramp = node.color_ramp
                stops = []
                for el in ramp.elements:
                    c = el.color
                    clen = len(c) if hasattr(c, '__len__') else 3
                    stops.append({
                        "position": round(el.position, 7),
                        "color": [
                            round(c[0], 7),
                            round(c[1], 7),
                            round(c[2], 7),
                            round(c[3], 7) if clen >= 4 else 1.0,
                        ],
                    })
                interpolation = getattr(ramp, 'interpolation', 'LINEAR')
                nodes[-1]["colorRamp"] = {
                    "interpolation": interpolation,
                    "stops": stops,
                }
        except Exception:
            # Skip nodes that can't be serialised
            continue

    return nodes if nodes else None
def _find_image_texture(socket):
    """Follow socket links to find an Image Texture node.
    Handles Normal Map nodes (2-hop: input → Normal Map → Image Texture).
    Returns the bpy Image object or None."""
    if socket is None or not socket.is_linked:
        return None
    for link in socket.links:
        src = link.from_node
        if src.type == 'TEX_IMAGE' and src.image:
            return src.image
        if src.type == 'NORMAL_MAP':
            color_in = src.inputs.get('Color')
            if color_in and color_in.is_linked:
                for l2 in color_in.links:
                    s2 = l2.from_node
                    if s2.type == 'TEX_IMAGE' and s2.image:
                        return s2.image
    return None


def _ensure_image_loaded(img):
    """Make sure an image has pixel data in memory (unpack / reload if needed).
    Returns True if pixels are now available."""
    if img.pixels:
        return True
    if img.packed_file:
        try:
            img.unpack(method='USE_ORIGINAL')
            return bool(img.pixels)
        except Exception:
            pass
    if img.filepath:
        try:
            img.reload()
            return bool(img.pixels)
        except Exception:
            pass
    return False


def _get_image_bytes(img):
    """Get encoded image bytes (PNG/JPG/WebP) and MIME type from a Blender image.

    Tries in priority order:
    1. Read the original file from disk (preserves original format)
    2. Use packed file data (preserves original format)
    3. Save in-memory pixels to a temp PNG file and read it back

    Returns (bytes_data, mime_type, extension) or (None, None, None) on failure.
    """
    import os
    import tempfile

    # 1. Try file on disk — preserves original format (PNG / JPG / WebP / …)
    if img.filepath:
        filepath = bpy.path.abspath(img.filepath)
        if os.path.isfile(filepath):
            ext = os.path.splitext(filepath)[1].lower()
            mime_map = {
                '.png':  'image/png',
                '.jpg':  'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.webp': 'image/webp',
            }
            mime = mime_map.get(ext, 'image/png')
            with open(filepath, 'rb') as f:
                return f.read(), mime, ext.lstrip('.')

    # 2. Try packed image data — preserves original format
    if img.packed_file:
        data = img.packed_file.data
        ext = 'png'
        if img.filepath:
            ext = os.path.splitext(img.filepath)[1].lower().lstrip('.') or 'png'
        mime_map = {
            'png':  'image/png',
            'jpg':  'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp',
        }
        mime = mime_map.get(ext, 'image/png')
        return data, mime, ext

    # 3. In-memory / generated image — save to temp PNG
    if img.pixels:
        tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
        tmp_path = tmp.name
        tmp.close()
        try:
            img.save(filepath=tmp_path)
            with open(tmp_path, 'rb') as f:
                data = f.read()
            return data, 'image/png', 'png'
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    return None, None, None


# ---------------------------------------------------------------------------
# Binary geometry packing
# ---------------------------------------------------------------------------
def _pack_geometry(vertices, indices, uvs):
    """Pack geometry arrays into a single binary blob.

    Layout: [float32 vertices][uint32 indices][float32 UVs (optional)]
    Uses struct.pack for explicit 4-byte unsigned ints (indices)."""
    v_bytes = array.array('f', vertices).tobytes()
    # struct.pack guarantees 4-byte unsigned ints (unlike array('I') which is platform-dependent)
    i_bytes = struct.pack(f'<{len(indices)}I', *indices) if indices else b''
    u_bytes = array.array('f', uvs).tobytes() if uvs else b''
    return v_bytes + i_bytes + u_bytes


# ---------------------------------------------------------------------------
# Scene data extraction (Blender Z-up → Three.js Y-up)
# ---------------------------------------------------------------------------
def get_scene_data():
    """Returns (json_string, geometry_dict).

    json_string — per-frame scene data WITHOUT vertices/indices/UVs arrays.
    geometry_dict — {object_name: (version, vCount, iCount, hasUVs, blob_bytes)}
      for binary geo messages (sent once per client per version)."""
    import bmesh

    depsgraph = bpy.context.evaluated_depsgraph_get()
    view_layer = bpy.context.view_layer
    data = {"objects": []}
    geometry_dict = {}

    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue

        # Skip objects hidden in the viewport (eye icon, hidden collections, etc.)
        if not obj.visible_get(view_layer=view_layer):
            continue

        # --- Geometry (triangulated, Y-up converted) ---
        eval_obj = obj.evaluated_get(depsgraph)
        try:
            mesh = eval_obj.to_mesh()
        except RuntimeError:
            continue

        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.verts.index_update()

        vertices = []
        for v in bm.verts:
            # Blender Z-up → Three.js Y-up
            vertices.extend([v.co.x, v.co.z, -v.co.y])

        # --- UV coordinates (per-vertex, from active UV layer) ---
        uv_layer = bm.loops.layers.uv.active
        uvs = []
        if uv_layer:
            # One UV pair per unique vertex — last loop touching the vertex wins.
            # This is correct for meshes without UV seams; at seam edges the
            # vertex will use whichever face is iterated last.
            uvs = [0.0, 0.0] * len(bm.verts)
            for face in bm.faces:
                for loop in face.loops:
                    vi = loop.vert.index
                    uv = loop[uv_layer].uv
                    uvs[vi * 2] = uv.x
                    uvs[vi * 2 + 1] = uv.y

        indices = []
        for face in bm.faces:
            for v in face.verts:
                indices.append(v.index)

        # --- Shader node graph — sole source of material properties ---
        graph = None
        graph_hash = "0"
        try:
            graph = _extract_node_graph(obj.active_material)
            if graph:
                import hashlib
                graph_json = json.dumps(graph, sort_keys=True)
                graph_hash = hashlib.md5(graph_json.encode()).hexdigest()[:8]
        except Exception:
            pass

        # Version tag — changes when geometry or shader graph changes
        uv_cksum = 0
        if uvs:
            uv_cksum = int(sum(uvs) * 1000)
        version = (
            f"v{len(vertices)}_f{len(indices)}"
            f"_uv{uv_cksum}"
            f"_gh{graph_hash}"
        )

        # Pack geometry as binary blob (sent once per client per version)
        has_uvs = bool(uvs)
        blob = _pack_geometry(vertices, indices, uvs if has_uvs else [])
        geometry_dict[obj.name] = (
            version,
            len(vertices) // 3,  # vCount
            len(indices),        # iCount
            has_uvs,
            blob,
        )

        bm.free()
        eval_obj.to_mesh_clear()

        # --- Transform ---
        orig_mode = obj.rotation_mode
        obj.rotation_mode = 'QUATERNION'
        pos = obj.location
        q = obj.rotation_quaternion
        s = obj.scale
        obj.rotation_mode = orig_mode

        obj_data = {
            "name":       obj.name,
            "position":   [pos.x, pos.z, -pos.y],
            "quaternion": [q.x,   q.z,   -q.y,   q.w],
            "scale":      [s.x,   s.z,    s.y],
            "version":    version,
        }

        # Attach shader node graph — the sole source of material properties
        if graph:
            obj_data["graph"] = {"nodes": graph}

        data["objects"].append(obj_data)

    return json.dumps(data), geometry_dict


# ---------------------------------------------------------------------------
# World HDR extraction (must run on main thread)
# ---------------------------------------------------------------------------
def _get_world_intensity():
    """Extract just the Background node Strength from the World shader.
    Returns a float — lightweight, called every tick, no caching needed."""
    world = bpy.context.scene.world
    if not world or not world.use_nodes:
        return 1.0
    for node in world.node_tree.nodes:
        if node.type == 'BACKGROUND':
            try:
                return float(node.inputs[1].default_value)
            except (KeyError, IndexError, AttributeError):
                pass
            break
    return 1.0


def _extract_world_hdr():
    """Extract the HDR environment texture from the World shader.
    Returns (width, height, pixels_bytes, cache_key) or None.
    Cached in _state so we only re-extract when the image changes.
    Intensity is handled separately via _get_world_intensity()."""
    world = bpy.context.scene.world
    if not world or not world.use_nodes:
        with _lock:
            _state["hdr_cache"] = None
        return None

    for node in world.node_tree.nodes:
        if node.type == 'TEX_ENVIRONMENT' and node.image:
            img = node.image
            if not _ensure_image_loaded(img):
                print(f"[B3Sync] WARNING: could not load environment image '{img.name}'")
                continue
            w, h = img.size
            if w == 0 or h == 0:
                print(f"[B3Sync] WARNING: environment image '{img.name}' has zero size")
                continue
            key = f"{img.name}_{w}x{h}"

            with _lock:
                cached = _state["hdr_cache"]
            if cached is not None and cached[3] == key:
                return cached  # unchanged — return cached data

            # Read the original HDR file bytes (packed or from disk)
            hdr_bytes = None
            if img.packed_file is not None:
                try:
                    hdr_bytes = img.packed_file.data
                except Exception:
                    pass
            if hdr_bytes is None and img.filepath:
                try:
                    path = bpy.path.abspath(img.filepath)
                    with open(path, 'rb') as f:
                        hdr_bytes = f.read()
                except Exception as e:
                    print(f"[B3Sync] WARNING: could not read environment file '{img.filepath}': {e}")
                    continue
            if not hdr_bytes:
                print(f"[B3Sync] WARNING: no data for environment image '{img.name}'")
                continue

            result = (w, h, hdr_bytes, key)

            with _lock:
                _state["hdr_cache"] = result
                _state["hdr_sent"].clear()  # re-send to all clients
            print(f"[B3Sync] HDR blob sent: {img.name} ({w}×{h}, {len(hdr_bytes)} bytes)")
            return result

    # No environment texture in world
    with _lock:
        _state["hdr_cache"] = None
        _state["hdr_sent"].clear()
    return None


# ---------------------------------------------------------------------------
# Material texture extraction (must run on main thread)
# ---------------------------------------------------------------------------
def _extract_textures():
    """Scan all mesh materials for all Image Textures (graph-based approach).
    Extracts every TEX_IMAGE node image, not just BSDF-connected ones.
    Caches encoded image bytes in _state["tex_cache"].

    Returns dict of image_name → (mime_type, bytes_data, cache_key)."""
    textures = {}

    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        mat = obj.active_material
        if not mat or not mat.use_nodes:
            continue

        # Scan ALL Image Texture nodes in the material's node tree
        for node in mat.node_tree.nodes:
            if node.type != 'TEX_IMAGE' or not node.image:
                continue

            img = node.image
            name = img.name
            if name in textures:
                continue

            # Get encoded image bytes (PNG / JPG / WebP)
            img_bytes, mime, ext = _get_image_bytes(img)
            if img_bytes is None:
                print(f"[B3Sync] WARNING: no image data for '{name}'")
                continue

            w, h = img.size
            key = f"{name}_{w}x{h}"

            # Check cache
            with _lock:
                cached = _state["tex_cache"].get(name)
            if cached is not None and cached[2] == key:
                textures[name] = cached
                continue

            result = (mime, img_bytes, key)
            textures[name] = result

            with _lock:
                _state["tex_cache"][name] = result
            print(f"[B3Sync] Texture extracted: {name} ({w}×{h}, {ext})")

    # Purge stale cache entries
    with _lock:
        for name in list(_state["tex_cache"].keys()):
            if name not in textures:
                del _state["tex_cache"][name]

    return textures


# ---------------------------------------------------------------------------
# Viewport camera extraction (must run on main thread)
# ---------------------------------------------------------------------------
def _extract_viewport():
    """Extract the 3D viewport camera — the actual viewpoint the user sees.

    Uses bpy.context.temp_override to ensure correct context for each 3D view.
    Sends the camera world matrix in Blender Z‑up space — the Three.js side
    applies the axis conversion (R_x(-90°)) so both ends are easy to reason about.
    Returns a dict ready for JSON serialization, or None."""
    scene = bpy.context.scene

    for window in bpy.context.window_manager.windows:
        scr = window.screen
        if scr is None:
            continue
        for area in scr.areas:
            if area.type != 'VIEW_3D':
                continue
            # Use temp_override to set the correct context for this area
            try:
                with bpy.context.temp_override(window=window, area=area):
                    space = bpy.context.space_data
                    if space is None:
                        continue
                    r3d = space.region_3d
                    if r3d is None:
                        continue

                    # r3d.view_matrix = world→camera.  Invert to get the camera
                    # world matrix (camera→world, Blender Z‑up space).
                    cam_world = r3d.view_matrix.inverted()

                    # Convert Blender Z‑up → Three.js Y‑up
                    # R_x(-90°) maps: X→X,  Y→-Z,  Z→Y
                    C = mathutils.Matrix.Rotation(-math.pi / 2, 4, 'X')
                    cam_three = C @ cam_world

                    # Extract components in Three.js space
                    pos = cam_three.translation
                    quat = cam_three.to_quaternion()
                    euler = cam_three.to_euler('XYZ')
                    scl = cam_three.to_scale()

                    # FOV derivation
                    if r3d.view_perspective == 'CAMERA' and scene.camera and scene.camera.data.type == 'PERSP':
                        fov = math.degrees(scene.camera.data.angle)
                    elif r3d.view_perspective == 'PERSP':
                        lens = r3d.view_lens
                        sensor_height = scene.camera.data.sensor_height if scene.camera and scene.camera.data else 24.0
                        fov = 2.0 * math.degrees(math.atan(sensor_height / (2.0 * lens)))
                    elif r3d.view_perspective == 'ORTHO':
                        fov = max(r3d.view_distance, 10.0)
                    else:
                        fov = 50.0

                    print(f"[B3Sync] Viewport camera synced — fov={fov:.1f}°")
                    return {
                        "type": "camera",
                        "position": [round(pos.x, 7), round(pos.y, 7), round(pos.z, 7)],
                        "quaternion": [round(quat.x, 7), round(quat.y, 7), round(quat.z, 7), round(quat.w, 7)],
                        "euler":    [round(euler.x, 7), round(euler.y, 7), round(euler.z, 7)],
                        "scale":    [round(scl.x, 7), round(scl.y, 7), round(scl.z, 7)],
                        "fov":  round(fov, 2),
                        "ortho": r3d.view_perspective == 'ORTHO',
                        "isViewport": True,
                    }
            except Exception as e:
                print(f"[B3Sync] Camera context override failed: {e}")
                continue

    print("[B3Sync] Camera: no 3D viewport found")
    return None


# ---------------------------------------------------------------------------
# Scene camera extraction (all Camera objects, not just the viewport)
# ---------------------------------------------------------------------------
def _extract_scene_cameras():
    """Extract ALL scene Camera objects (not just the viewport camera),
    converted to Three.js Y-up space. Same convention as _extract_viewport()
    so scene cameras and the viewport camera land in the same frame.

    Returns a list of dicts ready for JSON serialization (one per Camera)."""
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    C = mathutils.Matrix.Rotation(-math.pi / 2, 4, 'X')  # Blender Z-up → Three.js Y-up
    cameras = []

    for obj in scene.objects:
        if obj.type != 'CAMERA':
            continue
        try:
            eval_obj = obj.evaluated_get(depsgraph)
            cam_data = eval_obj.data

            # Camera world matrix (Blender Z-up) → Three.js Y-up
            cam_three = C @ eval_obj.matrix_world
            pos = cam_three.translation
            quat = cam_three.to_quaternion()
            euler = cam_three.to_euler('XYZ')
            scl = cam_three.to_scale()

            if cam_data.type == 'ORTHO':
                is_ortho = True
                fov = max(cam_data.ortho_scale, 10.0)
            else:
                is_ortho = False
                fov = math.degrees(cam_data.angle)

            cameras.append({
                "name":       obj.name,
                "position":   [round(pos.x, 7), round(pos.y, 7), round(pos.z, 7)],
                "quaternion": [round(quat.x, 7), round(quat.y, 7), round(quat.z, 7), round(quat.w, 7)],
                "euler":      [round(euler.x, 7), round(euler.y, 7), round(euler.z, 7)],
                "scale":      [round(scl.x, 7), round(scl.y, 7), round(scl.z, 7)],
                "fov":        round(fov, 2),
                "ortho":      is_ortho,
                "orthoScale": round(cam_data.ortho_scale, 4),
                "clipStart":  round(cam_data.clip_start, 4),
                "clipEnd":    round(cam_data.clip_end, 4),
                "isActive":   scene.camera == obj,
            })
        except Exception:
            continue

    return cameras


# ---------------------------------------------------------------------------
# Scene light extraction (all Light objects)
# ---------------------------------------------------------------------------
def _extract_lights():
    """Extract ALL scene Light objects, converted to Three.js Y-up space.

    Returns a list of dicts ready for JSON serialization (one per Light)."""
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    C = mathutils.Matrix.Rotation(-math.pi / 2, 4, 'X')  # Blender Z-up → Three.js Y-up
    lights = []

    for obj in scene.objects:
        if obj.type != 'LIGHT':
            continue
        try:
            eval_obj = obj.evaluated_get(depsgraph)
            light_data = eval_obj.data

            # Light world matrix (Blender Z-up) → Three.js Y-up
            light_three = C @ eval_obj.matrix_world
            pos = light_three.translation
            quat = light_three.to_quaternion()
            scl = light_three.to_scale()

            entry = {
                "name":       obj.name,
                "type":       light_data.type,  # 'POINT', 'SUN', 'SPOT', 'AREA'
                "color":      [
                    round(light_data.color[0], 7),
                    round(light_data.color[1], 7),
                    round(light_data.color[2], 7),
                ],
                "intensity":  round(light_data.energy, 7),
                "castShadow": getattr(light_data, 'use_shadow', False),
                "position":   [round(pos.x, 7), round(pos.y, 7), round(pos.z, 7)],
                "quaternion": [round(quat.x, 7), round(quat.y, 7), round(quat.z, 7), round(quat.w, 7)],
                "scale":      [round(scl.x, 7), round(scl.y, 7), round(scl.z, 7)],
            }

            # Type-specific properties
            if light_data.type == 'POINT':
                entry["distance"] = round(light_data.cutoff_distance, 7)
                entry["radius"]   = round(light_data.shadow_soft_size, 7)
            elif light_data.type == 'SUN':
                entry["angle"] = round(light_data.angle, 7)
            elif light_data.type == 'SPOT':
                entry["coneAngle"] = round(light_data.spot_size, 7)
                entry["penumbra"]  = round(light_data.spot_blend, 7)
                entry["distance"]  = round(light_data.cutoff_distance, 7)
            elif light_data.type == 'AREA':
                entry["width"]  = round(light_data.size, 7)
                entry["height"] = round(light_data.size_y, 7)
                # shape: 'SQUARE', 'RECTANGLE', 'DISK', 'ELLIPSE'
                entry["shape"]  = getattr(light_data, 'shape', 'SQUARE')

            lights.append(entry)
        except Exception:
            continue

    return lights


# ---------------------------------------------------------------------------
# Request handlers — respond to client resource requests
# ---------------------------------------------------------------------------

def _handle_request_geo(obj_name):
    """Respond to a geometry request from the main-thread-populated cache."""
    with _lock:
        geo_entry = _state["geo_cache"].get(obj_name)
    if geo_entry is not None:
        geo_version, v_count, i_count, has_uvs, blob = geo_entry
        header = json.dumps({
            "type": "geo",
            "name": obj_name,
            "version": geo_version,
            "vCount": v_count,
            "iCount": i_count,
            "hasUVs": has_uvs,
        })
        return (header, blob)
    return None


def _handle_request_tex(tex_name):
    """Respond to a texture request from the main-thread-populated cache."""
    with _lock:
        tex_entry = _state["tex_cache"].get(tex_name)
    if tex_entry is not None:
        mime, bytes_data, _ = tex_entry
        header = json.dumps({
            "type": "tex",
            "name": tex_name,
            "mime": mime,
        })
        return (header, bytes_data)
    return None


def _handle_request_hdr():
    """Respond to an HDR request from the main-thread-populated cache."""
    with _lock:
        hdr = _state["hdr_cache"]
    if hdr is not None:
        w, h, pixels_bytes, _ = hdr
        header = json.dumps({"type": "hdr", "width": w, "height": h})
        return (header, pixels_bytes)
    else:
        header = json.dumps({"type": "hdr", "width": 0, "height": 0})
        return (header, None)


async def _handler(websocket):
    """Handle a client connection — responds to resource requests."""
    with _lock:
        _state["clients"].add(websocket)
    print(f"[B3Sync] Client connected ({len(_state['clients'])} total)")

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type", "")

                if msg_type == "request-geo":
                    obj_name = data.get("name", "")
                    print(f"[B3Sync] REQUEST geo: {obj_name}")
                    result = _handle_request_geo(obj_name)
                    if result:
                        header, blob = result
                        await websocket.send(header)
                        await websocket.send(blob)
                        print(f"[B3Sync] SENT geo: {obj_name} ({len(blob)} bytes)")

                elif msg_type == "request-tex":
                    tex_name = data.get("name", "")
                    print(f"[B3Sync] REQUEST tex: {tex_name}")
                    result = _handle_request_tex(tex_name)
                    if result:
                        header, blob = result
                        await websocket.send(header)
                        await websocket.send(blob)
                        print(f"[B3Sync] SENT tex: {tex_name} ({len(blob)} bytes)")
                    else:
                        print(f"[B3Sync] MISS tex: {tex_name} (not in cache)")

                elif msg_type == "request-hdr":
                    print(f"[B3Sync] REQUEST hdr")
                    result = _handle_request_hdr()
                    if result is not None:
                        header, blob = result
                        await websocket.send(header)
                        if blob:
                            await websocket.send(blob)
                        print(f"[B3Sync] SENT hdr ({len(blob) if blob else 0} bytes)")
            except Exception:
                pass
    except ConnectionClosed:
        pass
    finally:
        with _lock:
            _state["clients"].discard(websocket)
            ws_id = id(websocket)
            _state["geo_sent"].pop(ws_id, None)
            _state["tex_sent"].pop(ws_id, None)
            _state["hdr_sent"].discard(ws_id)
            _state["scene_cams_sent"].discard(ws_id)
            _state["lights_sent"].discard(ws_id)
        print(f"[B3Sync] Client disconnected ({len(_state['clients'])} total)")


# ---------------------------------------------------------------------------
# Server thread
# ---------------------------------------------------------------------------
async def _run_server(port: int):
    """Top-level async entry point — runs inside loop.run_until_complete()."""
    async with websockets.serve(_handler, SERVER_HOST, port) as server:
        with _lock:
            _state["server"] = server
        _set_running(True, "")
        print(f"[B3Sync] Server listening on ws://{SERVER_HOST}:{port}")

        # Blocks until server.close() is called from stop_server()
        try:
            await server.serve_forever()
        except asyncio.CancelledError:
            # server.close() cancels the serving future — this is the expected
            # shutdown path, not an error.
            pass

    # async with block exited → server is cleanly shut down
    with _lock:
        _state["server"] = None
    print("[B3Sync] Server shut down cleanly.")


def _server_thread(port: int):
    """Entry point for the background thread — owns the asyncio event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    with _lock:
        _state["loop"] = loop

    try:
        loop.run_until_complete(_run_server(port))
    except OSError as e:
        msg = f"Port {port} is in use — close another Blender instance or change the port"
        print(f"[B3Sync] ERROR: {msg} ({e})")
        _set_running(False, msg)
    except Exception as e:
        msg = f"Server error: {e}"
        print(f"[B3Sync] ERROR: {msg}")
        _set_running(False, msg)
    finally:
        _set_running(False, "")
        loop.close()
        with _lock:
            if _state["loop"] is loop:
                _state["loop"] = None
        print("[B3Sync] Event loop closed.")


# ---------------------------------------------------------------------------
# Timer (fires at ~5 Hz from Blender's main thread)
# ---------------------------------------------------------------------------
def _timer():
    """Blender timer — extracts data on main thread, sends lightweight JSON at ~15 Hz.
    Binary blobs (geometry, textures, HDR) are cached for on-demand request/response."""
    try:
        with _lock:
            loop = _state["loop"]
            current = list(_state["clients"])

        if loop is not None and not loop.is_closed() and current:
            # --- Extract scene data + geometry on main thread, cache for requests ---
            data_json, geometry_dict = get_scene_data()
            with _lock:
                for obj_name, geo_entry in geometry_dict.items():
                    _state["geo_cache"][obj_name] = geo_entry

            # Send lightweight scene JSON (no blobs)
            for ws in current:
                try:
                    asyncio.run_coroutine_threadsafe(ws.send(data_json), loop)
                except RuntimeError:
                    pass

            # --- Extract HDR on main thread, cache for requests ---
            hdr = _extract_world_hdr()
            with _lock:
                if hdr is not None:
                    _state["hdr_cache"] = hdr
                else:
                    _state["hdr_cache"] = None

            # --- HDR intensity (lightweight JSON, every tick) ---
            hdr_intensity_msg = json.dumps({
                "type": "hdr-intensity",
                "value": _get_world_intensity(),
            })
            for ws in current:
                try:
                    asyncio.run_coroutine_threadsafe(ws.send(hdr_intensity_msg), loop)
                except RuntimeError:
                    continue

            # --- Extract textures on main thread, cache for requests ---
            _extract_textures()  # populates _state["tex_cache"] internally

            # --- Camera data (JSON) ---
            with _lock:
                send_cam = _state["camera_sync_enabled"]
            if send_cam:
                cam = _extract_viewport()
                if cam is not None:
                    cam_json = json.dumps(cam)
                    for ws in current:
                        try:
                            asyncio.run_coroutine_threadsafe(ws.send(cam_json), loop)
                        except RuntimeError:
                            pass

                cams_json = json.dumps({
                    "type": "cameras",
                    "cameras": _extract_scene_cameras(),
                })
                with _lock:
                    cached = _state["scene_cams_cache"]
                    if cached != cams_json:
                        _state["scene_cams_cache"] = cams_json
                        _state["scene_cams_sent"].clear()
                for ws in current:
                    ws_id = id(ws)
                    with _lock:
                        if ws_id in _state["scene_cams_sent"]:
                            continue
                        _state["scene_cams_sent"].add(ws_id)
                    try:
                        asyncio.run_coroutine_threadsafe(ws.send(cams_json), loop)
                    except RuntimeError:
                        pass

            # --- Scene lights ---
            lights_json = json.dumps({
                "type": "lights",
                "lights": _extract_lights(),
            })
            with _lock:
                cached = _state["lights_cache"]
                if cached != lights_json:
                    _state["lights_cache"] = lights_json
                    _state["lights_sent"].clear()
            for ws in current:
                ws_id = id(ws)
                with _lock:
                    if ws_id in _state["lights_sent"]:
                        continue
                    _state["lights_sent"].add(ws_id)
                try:
                    asyncio.run_coroutine_threadsafe(ws.send(lights_json), loop)
                except RuntimeError:
                    pass

    except Exception as e:
        import traceback
        print(f"[B3Sync] ERROR in timer: {e}")
        traceback.print_exc()

    _redraw_all()
    return 1.0 / 15.0



# ---------------------------------------------------------------------------
# Port cleanup helper
# ---------------------------------------------------------------------------
def _kill_port_processes(port: int):
    """Find and kill any process that is listening on the given port.

    Uses lsof (macOS / Linux) to look up PIDs bound to the TCP port, then
    sends SIGKILL to each one.  Skips the current Blender process itself so
    we don't accidentally kill ourselves.

    Returns a list of PIDs that were killed (empty if the port was free)."""
    killed = []
    try:
        result = subprocess.run(
            ["lsof", "-ti", f"tcp:{port}"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return killed  # port is free, or lsof not available

        my_pid = os.getpid()
        for line in result.stdout.strip().splitlines():
            pid_str = line.strip()
            if not pid_str.isdigit():
                continue
            pid = int(pid_str)
            if pid == my_pid:
                continue  # never kill ourselves
            try:
                os.kill(pid, signal.SIGKILL)
                killed.append(pid)
                print(f"[B3Sync] Killed PID {pid} holding port {port}")
            except (ProcessLookupError, PermissionError) as e:
                print(f"[B3Sync] Could not kill PID {pid}: {e}")

        if killed:
            # Brief pause to let the OS release the port
            import time
            time.sleep(0.3)

    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        # lsof not available — not much we can do
        if isinstance(e, FileNotFoundError):
            print("[B3Sync] lsof not found — cannot check port usage")
        else:
            print("[B3Sync] lsof timed out — skipping port check")

    return killed


# ---------------------------------------------------------------------------
# Public start / stop
# ---------------------------------------------------------------------------
def start_server():
    """Start (or restart) the WebSocket server."""
    # Kill any existing server first
    stop_server()

    with _lock:
        _state["error"] = ""

    # During add-on registration, bpy.context may be a restricted context
    # that lacks a 'scene' attribute. Fall back to the default port.
    try:
        port = getattr(bpy.context.scene, "b3sync_port", SERVER_PORT_DEFAULT)
    except AttributeError:
        port = SERVER_PORT_DEFAULT

    # Kill any foreign process squatting on the port
    _kill_port_processes(port)

    t = threading.Thread(target=_server_thread, args=(port,), daemon=True, name="b3sync-ws")
    with _lock:
        _state["thread"] = t
        _state["port"] = port
    t.start()

    if not bpy.app.timers.is_registered(_timer):
        bpy.app.timers.register(_timer)

    _redraw_all()


def stop_server():
    """Stop the WebSocket server.  Updates the UI immediately — the old
    server thread is joined briefly afterwards so the port is released."""
    if bpy.app.timers.is_registered(_timer):
        bpy.app.timers.unregister(_timer)

    with _lock:
        server = _state["server"]
        loop = _state["loop"]
        old_thread = _state["thread"]
        _state["clients"].clear()
        _state["server"] = None
        _state["loop"] = None
        _state["thread"] = None
        _state["port"] = 0

    # Flag the old server as stopped BEFORE any blocking work — the panel
    # reads these flags on the next redraw.
    _set_running(False, "")
    _redraw_all()

    # server.close() must be called from the event loop's own thread
    if server is not None and loop is not None and not loop.is_closed():
        loop.call_soon_threadsafe(server.close)

    # Brief join so the OS can release the socket before a potential restart.
    if old_thread is not None and old_thread.is_alive():
        old_thread.join(timeout=0.3)
        if old_thread.is_alive():
            print("[B3Sync] NOTE: server thread still exiting…")


# ---------------------------------------------------------------------------
# Blender operators
# ---------------------------------------------------------------------------
class B3SYNC_OT_start(bpy.types.Operator):
    bl_idname = "b3sync.start"
    bl_label = "Start Server"
    bl_description = "Start the WebSocket sync server"

    def execute(self, context):
        start_server()
        return {'FINISHED'}


class B3SYNC_OT_stop(bpy.types.Operator):
    bl_idname = "b3sync.stop"
    bl_label = "Stop Server"
    bl_description = "Stop the WebSocket sync server"

    def execute(self, context):
        stop_server()
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Blender panel (3D View → Sidebar → B3Sync tab)
# ---------------------------------------------------------------------------
class B3SYNC_PT_panel(bpy.types.Panel):
    bl_label = "B3Sync Server"
    bl_idname = "B3SYNC_PT_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "B3Sync"

    def draw(self, context):
        layout = self.layout
        scene = context.scene

        with _lock:
            running = _state["running"]
            error = _state["error"]
            num_clients = len(_state["clients"])
            actual_port = _state["port"]
            server = _state["server"]
            loop = _state["loop"]
            thread = _state["thread"]
        configured_port = scene.b3sync_port

        # Health check: if _state says "running" but the thread/loop died,
        # mark as stopped so the UI doesn't lie.
        if running:
            thread_alive = thread is not None and thread.is_alive()
            loop_ok = loop is not None and not loop.is_closed()
            server_ok = server is not None
            if not (thread_alive and loop_ok and server_ok):
                running = False
                if not error:
                    error = "Server stopped unexpectedly — check the console"

        # Port number setting
        row = layout.row(align=True)
        row.label(text="Port")
        row.prop(scene, "b3sync_port", text="")

        layout.separator()

        # Status
        if running:
            layout.label(text="●  RUNNING", icon='CHECKMARK')
            layout.label(text=f"ws://{SERVER_HOST}:{actual_port}")
            layout.label(text=f"Clients connected: {num_clients}")

            # Port mismatch warning
            if actual_port != configured_port:
                layout.separator()
                col = layout.column()
                col.alert = True
                col.label(text="Port changed — restart to apply", icon='ERROR')
        else:
            layout.label(text="STOPPED", icon='CANCEL')

        layout.separator()

        # Error message
        if error:
            col = layout.column()
            col.alert = True
            col.label(text=error, icon='ERROR')

        layout.separator()

        # Buttons
        if running:
            layout.operator("b3sync.stop", icon='PAUSE')
        else:
            layout.operator("b3sync.start", icon='PLAY')


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------
CLASSES = (
    B3SYNC_OT_start,
    B3SYNC_OT_stop,
    B3SYNC_PT_panel,
)


def register():
    # Kill any stale process squatting on the default port before we start
    _kill_port_processes(SERVER_PORT_DEFAULT)

    # Unregister any previous instance so re-runs are clean
    for cls in reversed(CLASSES):
        try:
            bpy.utils.unregister_class(cls)
        except RuntimeError:
            pass  # wasn't registered — fine

    # Remove old scene properties if they exist (e.g. from a prior version)
    for prop in ("b3sync_port",):
        try:
            delattr(bpy.types.Scene, prop)
        except (AttributeError, KeyError):
            pass

    for cls in CLASSES:
        bpy.utils.register_class(cls)

    # Scene property for the port number
    bpy.types.Scene.b3sync_port = bpy.props.IntProperty(
        name="Port",
        description="WebSocket server port (requires restart to take effect)",
        default=SERVER_PORT_DEFAULT,
        min=1,
        max=65535,
    )

    print("[B3Sync] Panel registered — open the 3D View sidebar (N) → B3Sync")

    # Auto-start the server on add-on registration
    start_server()


def unregister():
    stop_server()
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)

    del bpy.types.Scene.b3sync_port

    print("[B3Sync] Unregistered")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Re-register (safe if already registered)
    try:
        unregister()
    except Exception:
        pass
    register()
    # Server auto-starts via register()
    print("[B3Sync] Ready — server auto-starting…")
