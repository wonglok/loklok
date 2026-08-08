# Lessons from the Blender glTF 2.0 Exporter

The official Blender glTF 2.0 exporter (`io_scene_gltf2`) is a large, well-architected codebase that ships with Blender. Reading it yields deep insight into how to correctly bridge Blender's data model to a real-time graphics runtime (like Three.js). This document distills those learnings for our sync protocol.

---

## 1. Architecture: Gather → Flatten → Serialize

The exporter uses a **two-phase design**:

1. **Gather** — Walk the Blender scene once and build a typed intermediate representation (`gltf2_io.Skin`, `Node`, `Animation`, `Mesh`, etc.) populated with Python object references. Every expensive gather function is decorated with `@cached` so it runs once even when referenced from multiple parents.

2. **Flatten + Serialize** — An `Exporter` class traverses the gathered object graph and replaces Python object references with integer indices (accessor index, node index, skin index). Then buffer views are packed and written.

**Takeaway**: Separate data extraction from serialization. Cache gathered results per (object, version) key. Only re-extract when inputs change.

---

## 2. Skinned Mesh Vertex Positions Are in Armature Space

This is the most important finding. The glTF spec requires that vertex positions for a skinned mesh are expressed in the **same coordinate space as the skeleton's inverse bind matrices**.

The exporter achieves this by:

```python
# primitive_extract.py __get_positions():
loc_transform = self.blender_object.matrix_world
self.locs[:] = PrimitiveCreator.apply_mat_to_all(loc_transform, self.locs)
```

Vertex positions from the **original mesh data** (no armature modifier applied) are transformed by `object.matrix_world` into the armature's space. The armature modifier is explicitly NOT evaluated — skinning is meant to happen in the engine.

**Our bug**: We were using `obj.evaluated_get(depsgraph).to_mesh()` which bakes ALL modifiers including the armature deformation. The vertices arrived at the frontend already deformed — and Three.js would deform them again via skinning.

**Fix**: For objects with an armature modifier, use `obj.data` (original mesh) and transform positions by `obj.matrix_world`.

---

## 3. Inverse Bind Matrix Formula

The glTF exporter computes the inverse bind matrix for each bone as:

```python
# skins.py __gather_inverse_bind_matrices():
axis_basis_change = Matrix((
    (1,  0,  0, 0),
    (0,  0,  1, 0),
    (0, -1,  0, 0),
    (0,  0,  0, 1),
))
ibm = (axis_basis_change @ armature.matrix_world @ bone.bone.matrix_local).inverted_safe()
```

Key points:
- Uses `bone.bone.matrix_local` (the **EditBone rest-pose** matrix) — NOT the pose bone matrix.
- Includes `armature.matrix_world` — bones in Blender are relative to the armature object.
- The `axis_basis_change` matrix converts from Blender Z-up `(x, y, z)` to Y-up `(x, z, -y)`.
- This is the inverse of the bone's **world-space** bind pose (in armature space).

**Our previous approach**: We computed `bone.matrix_local.inverted()` (local only, no armature transform) and chained through parents manually. The glTF approach is simpler and more correct.

---

## 4. Animation Bone Local Transform Computation

The exporter computes per-bone animation values in `sampling_cache.py:armature_caching()`:

```python
# Root bone (no exported parent):
matrix = bone.bone.matrix_local.inverted() @ pose_bone.matrix

# Child bone (has exported parent):
rest_mat = parent.bone.matrix_local.inverted() @ bone.bone.matrix_local
matrix = rest_mat.inverted() @ parent_pose.inverted() @ bone_pose
```

This gives the bone's **local TRS relative to its exported parent**, expressed in the bone's rest/bind coordinate frame. The result is decomposed into translation/rotation/scale, converted to Y-up, and written as animation channel keyframes.

**Key insight**: Animation values are **absolute local transforms** (not deltas from rest). In Three.js, `PropertyBinding` sets `.position`, `.quaternion`, `.scale` directly on the bone — so the animation tracks must contain the full local TRS at each frame.

**Our previous approach**: We used `pose_bone.matrix_basis` directly, which is the transform from rest. For root bones with no parent chain this happens to match the glTF formula, but for child bones it differs because it doesn't account for the parent's animation (the `parent_pose.inverted()` term).

---

## 5. Joint Weights from Vertex Groups

The exporter resolves vertex groups to joint indices by **name matching**:

```python
# primitive_extract.py __get_bone_data():
joint_name_to_index = {joint.name: index for index, joint in enumerate(self.skin.joints)}
group_to_joint = [joint_name_to_index.get(g.name) for g in obj.vertex_groups]
```

For each vertex:
1. Read `vertex.groups` (group index, weight)
2. Map group index → joint index via name
3. Filter weight ≤ 0.0001
4. Sort by weight descending, take top 4
5. Normalize weights to sum to 1

**Neutral bone**: Vertices with zero bone influences get assigned to a special "neutral bone" that follows the armature root. The neutral bone's IBM is `(axis_basis @ armature.matrix_world).inverted()`.

**Our approach**: We were already doing most of this correctly (name matching, top 4, normalization). But we didn't have the neutral bone for unassigned vertices.

---

## 6. Two Animation Export Modes

The exporter has two strategies:

### FCurve-Direct Mode
Used when channels are "glTF-representable":
- Read keyframe points from fcurves (`kp.co[0]` for frame, `c.evaluate(frame)` for value)
- For BEZIER: compute tangents from handle positions
- Non-animated vector components backfilled from rest pose
- Requires matching keyframes across all channels, no constraints, supported interpolation

### Sampled/Baked Mode
Used when `force_sampling` is on or `needs_baking()` detects unsupported channels:
- `bpy.context.scene.frame_set(frame)` for each frame in range
- `get_cache_data()` evaluates the depsgraph and records all object/bone matrices
- Steps by `frame_step` (not every frame — compression vs quality tradeoff)
- **All bones** are baked (not just the animated ones), since parent chain can propagate motion

**Our approach**: We sample at fcurve keyframe times, which is a reasonable hybrid. For correctness with constraints/IK, we'd need the full baked path.

---

## 7. Coordinate Space Conversions

The axis basis change matrix is:
```python
axis_basis_change = Matrix((
    (1.0,  0.0,  0.0, 0.0),  # x → x
    (0.0,  0.0,  1.0, 0.0),  # y → z
    (0.0, -1.0,  0.0, 0.0),  # z → -y
    (0.0,  0.0,  0.0, 1.0),
))
```

Applied differently depending on the data type:
- **Matrices**: pre-multiply: `axis_basis @ matrix @ axis_basis.inverted()`
- **Positions**: `(x, z, -y)` — swizzle + negate
- **Quaternions**: `(w, x, z, -y)` — swizzle + negate Y component
- **Scales**: `(x, z, y)` — swizzle only
- **Normals/Tangents**: same swizzle as positions (no negation of normals)

The exporter applies conversions consistently across all joint nodes, animations, and mesh attributes.

---

## 8. JOINTS_0 and WEIGHTS_0 Format

For online transmission, the most relevant formats:
- **JOINTS_0**: `uint16` when bone count ≤ 65535, `uint8` when ≤ 255. 4 components per vertex (Vec4).
- **WEIGHTS_0**: `float32`, 4 components per vertex, normalized per-vertex (sum to 1.0).

---

## 9. Per-Corner Attribute Extraction

The exporter does NOT deduplicate vertices by position only. It deduplicates by **(position, normal, uv) triple**, which is necessary to preserve:
- UV seams (same position, different UV on each side of a seam)
- Sharp/hard edges (same position, different normals on each face)
- Normal map tangents (need consistent UV + normal per vertex)

**Our current approach**: `bm.verts`-based deduplication loses UV seam data and uses `computeVertexNormals()` which recomputes face-averaged normals. This is acceptable for basic sync but will not match Blender's exact shading at UV seams or sharp edges.

---

## 10. Virtual Export Tree

The exporter builds a `VExportTree` — an intermediate scene graph:
- One `VExportNode` per exported Blender entity (object, bone, light, camera)
- Stores `matrix_world`, `parent_uuid`, `blender_type`, etc.
- Bones and skinned meshes are linked to their armature via `armature` UUID
- The tree is filtered, sorted, then recursively gathered

**Takeaway**: Build an intermediate representation that captures the full scene state before serializing. This decouples the heavy Blender API calls from the serialization logic.

---

## Summary: What We Fixed

| Issue | Before | After (glTF-aligned) |
|---|---|---|
| IBM formula | `(C @ bone.local.inv @ C.inv)` | `(axis_basis @ arm_world @ bone.rest).inverted()` |
| Skinned vertex positions | Evaluated mesh (deformed) | Original mesh × `obj.matrix_world` (armature space) |
| Animation bone matrices | `pose_bone.matrix_basis` directly | glTF formula: `rest.inv @ pose` (root), `(parent_rest.inv @ rest).inv @ parent_pose.inv @ pose` (child) |
| Bind pose source | Computed from parent chain | Direct from `bone.matrix_local` |
| Neutral bone | Not implemented | Still pending |
| Per-corner normals | Not exported | Still pending |

This alignment with the glTF exporter ensures our protocol produces correct skinning and animation results that match Blender's own export pipeline.
