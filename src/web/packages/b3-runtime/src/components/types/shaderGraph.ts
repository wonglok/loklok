// ---------------------------------------------------------------------------
// Serialized Blender shader node-graph types.
//
// Matches the JSON emitted by the Blender add-on's `_extract_node_graph`:
// a flat list of nodes with slugified ids/types, socket connections, props,
// color-ramp / curve data, and image color space.
// ---------------------------------------------------------------------------

/** A single input/output socket on a Blender shader node. */
export interface BlenderSocket {
  name: string;
  /** Display-name slug (may differ from `name` after Blender renames). */
  display?: string;
  /** Value when the socket is not connected (number, array, or image name). */
  value?: unknown;
  /** Connected node ID. */
  fromNode?: string;
  /** Connected output socket name on the upstream node. */
  fromSocket?: string;
}

/** A single color stop in a Blender Color Ramp. */
export interface ColorStop {
  position: number;
  /** RGBA */
  color: [number, number, number, number];
}

/** Serialised Color Ramp data from a VALTORGB node. */
export interface ColorRampData {
  /** 'LINEAR' | 'CONSTANT' | 'EASE' | 'B_SPLINE' | 'CARDINAL' */
  interpolation: string;
  stops: ColorStop[];
}

/** Serialised CurveMapping data from CURVE_RGB / CURVE_VEC / CURVE_FLOAT. */
export interface CurveData {
  /** 'HORIZONTAL' | 'EXTRAPOLATED' */
  extend: string;
  /** One curve per channel; each curve is a list of [x, y] points. */
  curves: [number, number][][];
  tmin: number;
  tmax: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/** Serialized Blender shader node. */
export interface BlenderNode {
  /** Slugified node name — unique within the tree. */
  id: string;
  /** Slugified node type, e.g. `bsdf-principled`, `math`, `tex-image`. */
  type: string;
  label: string;
  /** Color Ramp data — present on VALTORGB nodes. */
  colorRamp?: ColorRampData;
  /** Curve data — present on CURVE_RGB / CURVE_VEC / CURVE_FLOAT. */
  curveData?: CurveData;
  /** Image color space name ('sRGB' | 'Non-Color' | …) — present on TEX_IMAGE. */
  colorspace?: string;
  /** Node config properties (operations, blend types, dimensions, …). */
  props?: Record<string, unknown>;
  /** Output sockets with default values (RGB / Value nodes carry value here). */
  outputs?: BlenderSocket[];
  inputs: BlenderSocket[];
}

/** The full serialised shader graph for one material. */
export interface ShaderGraph {
  nodes: BlenderNode[];
}
