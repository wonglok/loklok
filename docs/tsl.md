# TSL `MeshPhysicalNodeMaterial` — deep reference

Ground truth: three.js **0.185.1** source.
Primary files: `node_modules/three/src/materials/nodes/`,
`node_modules/three/src/nodes/`, `node_modules/three/src/materials/MeshPhysicalMaterial.js`.

---

## 1. What it is

`MeshPhysicalNodeMaterial` is the **node (TSL) version of `MeshPhysicalMaterial`**.
Instead of a fixed GLSL/WGSL shader string, its shading graph is described by a
tree of **`Node` objects** that are traversed and compiled by `NodeBuilder` into
WGSL for the `WebGPURenderer`. The material is inert until first render; then a
`NodeMaterial` pass compiles the graph for the active scene / lights / camera.

```ts
import * as THREE from "three/webgpu"; // node materials live here
const mat = new THREE.MeshPhysicalNodeMaterial();
```

### Class hierarchy

```
MeshPhysicalMaterial (classic, WebGL)      ← base props + setDefaultValues()
   ▲
MeshPhysicalNodeMaterial                   src/materials/nodes/MeshPhysicalNodeMaterial.js
   ▲
MeshStandardNodeMaterial                   src/materials/nodes/MeshStandardNodeMaterial.js
   ▲
NodeMaterial                               src/materials/nodes/NodeMaterial.js
   ▲
Material
```

- `MeshPhysicalNodeMaterial` inherits every classic property from the
  `MeshPhysicalMaterial` it wraps (`_defaultValues = new MeshPhysicalMaterial()`),
  so `color`, `map`, `roughness`, `metalness`, `emissive`, `ior`, `clearcoat`,
  `transmission`, `anisotropy`, `dispersion`, … all exist and are settable.
- `MeshStandardNodeMaterial` sets `this.lights = true`, marking the material as
  light-reactive in the WebGPU renderer.
- `three/webgpu` re-exports the node materials; the classic and node classes
  coexist and are **not** interchangeable at runtime (the renderer checks
  `material.isNodeMaterial` / the specific flags).

### The two ways to configure every channel

1. **Classic properties** — `color`, `map`, `roughness`, `metalness`, `emissive`,
   `transparent`, `opacity`, `alphaTest`, `flatShading`, `ior`, … These are read
   at shader-build time by TSL **accessors** (`materialColor`, `materialRoughness`,
   `materialIOR`, …) and become node inputs automatically.
2. **Node properties** — `colorNode`, `roughnessNode`, `metalnessNode`,
   `emissiveNode`, `transmissionNode`, `clearcoatNode`, `anisotropyNode`, …
   When **non-`null`**, they **override** the classic-property inference for that
   one channel — including any map the accessor would have sampled.

A material configured only with classic properties **is** a TSL material; the
accessors wire the values in. Node properties exist for when the shader must
_compute_ a value at runtime (textures, UVs, vertex attributes, procedural math,
animation, per-pixel branching).

---

## 2. Node-property inventory (r185.1)

### 2.1 On `NodeMaterial` (base) — `src/materials/nodes/NodeMaterial.js`

| Property                                                | Type          | Overwrites / does                       | Notes                                                                 |
| ------------------------------------------------------- | ------------- | --------------------------------------- | --------------------------------------------------------------------- |
| `colorNode`                                             | `Node<vec3>`  | `color` + `map` inference               | **bypasses `map` auto-sampling** — you must re-add `texture(map)`     |
| `normalNode`                                            | `Node<vec3>`  | `normalMap` / `normalScale` / `bumpMap` | takes over the whole normal incl. tangent-space handling              |
| `opacityNode`                                           | `Node<float>` | `opacity` + `alphaMap`                  | multiplied into `diffuseColor.a`                                      |
| `alphaTestNode`                                         | `Node<float>` | `alphaTest`                             | fragments with `a ≤ node` discarded (or `alphaToCoverage` smoothstep) |
| `aoNode`                                                | `Node<float>` | `aoMap`                                 | ambient occlusion, multiplied into diffuse                            |
| `envNode`                                               | `Node<vec3>`  | `envMap`                                | environment reflection input                                          |
| `maskNode`                                              | `Node<bool>`  | —                                       | `bool(node).not().discard()` — kill fragment when false               |
| `maskShadowNode`                                        | `Node<bool>`  | —                                       | shadow-only discard                                                   |
| `positionNode`                                          | `Node<vec3>`  | geometry position                       | vertex-shader displace                                                |
| `geometryNode`                                          | `Node<vec3>`  | geometry normal/uv                      | low-level geometry override                                           |
| `depthNode`                                             | `Node<float>` | depth write value                       |                                                                       |
| `receivedShadowNode` / `castShadowNode`                 | `Node`        | shadow sampling                         | fully custom shadow handling                                          |
| `receivedShadowPositionNode` / `castShadowPositionNode` | `Node<vec3>`  | shadow depth position                   |                                                                       |
| `outputNode`                                            | `Node`        | final fragment color                    | post-shading per material                                             |
| `mrtNode`                                               | `Node`        | —                                       | custom multi-render-target output                                     |
| `fragmentNode` / `vertexNode`                           | `Node`        | whole stage                             | lowest-level escape hatch                                             |

There is **no `mapNode`** in r185. `map`/`alphaMap`/`roughnessMap`/… flow through
the classic texture props via the accessors (§4.1). To drive a map from a node,
assign the corresponding channel node yourself, e.g. `colorNode = texture(tex)`.

### 2.2 On `MeshStandardNodeMaterial` — `src/materials/nodes/MeshStandardNodeMaterial.js`

| Property        | Type          | Overwrites                                                    |
| --------------- | ------------- | ------------------------------------------------------------- |
| `emissiveNode`  | `Node<vec3>`  | `emissive` + `emissiveIntensity` + `emissiveMap` (all three!) |
| `metalnessNode` | `Node<float>` | `metalness` + `metalnessMap`                                  |
| `roughnessNode` | `Node<float>` | `roughness` + `roughnessMap`                                  |

`setupVariants()` resolves each:

```js
const metalnessNode = this.metalnessNode
  ? float(this.metalnessNode)
  : materialMetalness;
const roughnessNode = getRoughness({
  roughness: this.roughnessNode ? float(this.roughnessNode) : materialRoughness,
});
```

### 2.3 On `MeshPhysicalNodeMaterial` — `src/materials/nodes/MeshPhysicalNodeMaterial.js`

| Property                   | Type          | Overwrites                                              |
| -------------------------- | ------------- | ------------------------------------------------------- |
| `clearcoatNode`            | `Node<float>` | `clearcoat` + `clearcoatMap`                            |
| `clearcoatRoughnessNode`   | `Node<float>` | `clearcoatRoughness` + `clearcoatRoughnessMap`          |
| `clearcoatNormalNode`      | `Node<vec3>`  | `clearcoatNormalMap`                                    |
| `sheenNode`                | `Node<vec3>`  | `sheen` + `sheenColor` + `sheenColorMap`                |
| `sheenRoughnessNode`       | `Node<float>` | `sheenRoughness` + `sheenRoughnessMap`                  |
| `iridescenceNode`          | `Node<float>` | `iridescence`                                           |
| `iridescenceIORNode`       | `Node<float>` | `iridescenceIOR`                                        |
| `iridescenceThicknessNode` | `Node<float>` | `iridescenceThicknessRange` + `iridescenceThicknessMap` |
| `specularIntensityNode`    | `Node<float>` | `specularIntensity` + `specularIntensityMap`            |
| `specularColorNode`        | `Node<vec3>`  | `specularColor` + `specularColorMap`                    |
| `iorNode`                  | `Node<float>` | `ior`                                                   |
| `transmissionNode`         | `Node<float>` | `transmission` + `transmissionMap`                      |
| `thicknessNode`            | `Node<float>` | `thickness` + `thicknessMap`                            |
| `attenuationDistanceNode`  | `Node<float>` | `attenuationDistance`                                   |
| `attenuationColorNode`     | `Node<vec3>`  | `attenuationColor`                                      |
| `dispersionNode`           | `Node<float>` | `dispersion`                                            |
| `anisotropyNode`           | `Node<float>` | `anisotropy` (+ `anisotropyMap` via accessor)           |

### 2.4 The override rule

> For every channel: if `mat.<channel>Node !== null`, the classic
> `<channel>`/`<channel>Map`/related props for that channel are **ignored**.
> The node **replaces** the accessor's entire computation.

Practical consequences:

- Setting `emissiveNode` discards `emissive`, `emissiveIntensity` **and**
  `emissiveMap` — fold them into the node yourself:
  `mat.emissiveNode = texture(emissiveMap).mul(emissiveColor).mul(float(emissiveIntensity))`.
- Setting `colorNode` discards the `color × map` auto-composition.
- Setting `opacityNode` discards `opacity × alphaMap`.
- Setting `roughnessNode`/`metalnessNode` discards the map channel reads.

---

## 3. The build pipeline — `NodeMaterial.setup()`

Every render, `NodeBuilder` runs `NodeMaterial.setup(builder)`:

```
<VERTEX STAGE>
  setupVertex → modelViewProjection
  vertexNode override if set; geometryNode bypass; hardware clipping
  outputNode = clip space
<FRAGMENT STAGE>
  setupClipping (clip planes)
  depth setup (if depthWrite/depthTest)
  if fragmentNode === null:
    setupDiffuseColor      → diffuseColor.rgb/a   (§4.3)
    setupAmbientOcclusion  → ao
    setupVariants          → metalness/roughness/physical channels  (§4.4)
    setupLighting          → outgoingLight (direct + indirect env)
    basicOutput = vec4(outgoingLight, diffuseColor.a).max(0)
    result = setupOutput   → tone mapping / color space
    output.assign(result)
    if outputNode !== null → result = outputNode (custom post)
    if MRT → result = renderer.getMRT().merge(mrtNode)
  else:
    fragmentNode = custom fragment (converted to output type)
```

Order matters: lighting runs **after** diffuse/variants, so `outgoingLight`
consumes `diffuseColor`, `metalness`, `roughness`, `clearcoat`, etc.

---

## 4. How classic properties become nodes

### 4.1 `MaterialNode` accessors — `src/nodes/accessors/MaterialNode.js`

Immutable TSL accessors read `builder.context.material.<prop>` and **compose
maps**. Each classic map is sampled from a specific channel and multiplied in:

| Map                 | Classic prop            | Channel          | Accessor composition                                       |
| ------------------- | ----------------------- | ---------------- | ---------------------------------------------------------- |
| albedo              | `map`                   | rgb              | `color × texture(map)`                                     |
| alpha               | `alphaMap`              | a (conventional) | `opacity × texture(alphaMap)`                              |
| roughness           | `roughnessMap`          | **g**            | `roughness × texture(roughnessMap).g`                      |
| metalness           | `metalnessMap`          | **b**            | `metalness × texture(metalnessMap).b`                      |
| emissive            | `emissiveMap`           | rgb              | `emissiveColor × emissiveIntensity × texture(emissiveMap)` |
| normal              | `normalMap`             | special          | `normalMap(texture(normalMap), normalScale)`               |
| ao                  | `aoMap`                 | **r**            | `1 + aoMapIntensity × (texture(aoMap).r − 1)`              |
| specular intensity  | `specularIntensityMap`  | **a**            | `specularIntensity × texture(...).a`                       |
| specular color      | `specularColorMap`      | rgb              | `specularColor × texture(...).rgb`                         |
| clearcoat           | `clearcoatMap`          | **r**            | `clearcoat × texture(clearcoatMap).r`                      |
| clearcoat roughness | `clearcoatRoughnessMap` | **r**            | `clearcoatRoughness × texture(...).r`                      |
| lightmap            | `lightMap`              | rgb              | `lightMapIntensity × texture(lightMap).rgb`                |

The channel reads are literal in source: `COLOR` samples `.rgb` via the raw
texture node, `ROUGHNESS`→`.g`, `METALNESS`→`.b`, `CLEARCOAT`→`.r`,
`SPECULAR_INTENSITY`→`.a`, `AO`→`.r`.

`getTexture(prop)` resolves to `materialReference(prop + 'Map', 'texture')` —
a `texture( material[prop], uv() )` sample. `getColor`/`getFloat` build
`color`/`float` material references. All are memoized per material in a
`_propertyCache`.

### 4.2 `getRoughness()` — `src/nodes/functions/material/getRoughness.js`

```js
roughnessFactor = roughness.max(0.0525); // floor = base mip of a 256 cubemap
roughnessFactor = roughnessFactor.add(geometryRoughness); // normal-derived
roughnessFactor = roughnessFactor.min(1.0);
```

### 4.3 `setupDiffuseColor()` — `NodeMaterial`

```
colorNode  = this.colorNode ? vec4(this.colorNode) : materialColor
  → × vertexColor()           (if vertexColors && geometry has 'color')
  → × instanceColor()         (if object.instanceColor)
  → × batchColor()            (if batched mesh color texture)
diffuseColor.assign( colorNode )
diffuseColor.a ×= opacityNode                       (opacityNode ?? materialOpacity)
alphaTest:  diffuseColor.a ≤ alphaTestNode → discard
            (alphaToCoverage → smoothstep(aTest, aTest + fwidth(a), a))
alphaHash:  diffuseColor.a < getAlphaHashThreshold → discard
if builder.isOpaque(): diffuseColor.a = 1           (forces opaque)
```

Note: the `materialColor` accessor already contains the `color × map` multiply
(§4.1), so `diffuseColor.rgb` is the final albedo.

### 4.4 Physical channels — `MeshPhysicalNodeMaterial.setupVariants()`

Gated by `use*` getters (§5), each channel resolves node-or-accessor and
assigns the shader-wide property:

```js
// TRANSMISSION block
transmission.assign( this.transmissionNode ? float(this.transmissionNode) : materialTransmission );
thickness.assign( this.thicknessNode ? float(this.thicknessNode) : materialThickness );
attenuationDistance.assign( this.attenuationDistanceNode ? float(...) : materialAttenuationDistance );
attenuationColor.assign( this.attenuationColorNode ? vec3(...) : materialAttenuationColor );
if ( this.useDispersion ) dispersion.assign( this.dispersionNode ? float(...) : materialDispersion );
```

Clearcoat roughness is passed through `getRoughness()`; sheen is a `vec3`
(sheenNode or `materialSheen`); iridescence resolves IOR + thickness;
anisotropy is consumed as a `vec2`:

```js
const anisotropyV = (
  this.anisotropyNode ? vec2(this.anisotropyNode) : materialAnisotropy
).toVar();
anisotropy.assign(anisotropyV.length());
If(anisotropy.equal(0), () => anisotropyV.assign(vec2(1, 0))).Else(() => {
  anisotropyV.divAssign(vec2(anisotropy));
  anisotropy.assign(anisotropy.saturate());
});
alphaT.assign(anisotropy.pow2().mix(roughness.pow2(), 1)); // tangent roughness
anisotropyT.assign(
  TBNViewMatrix[0].mul(anisotropyV.x).add(TBNViewMatrix[1].mul(anisotropyV.y)),
);
anisotropyB.assign(
  TBNViewMatrix[1].mul(anisotropyV.x).sub(TBNViewMatrix[0].mul(anisotropyV.y)),
);
```

### 4.5 Specular — `setupSpecular()`

```js
ior.assign(this.iorNode ? float(this.iorNode) : materialIOR);
specularColor.assign(
  min(pow2(ior.sub(1).div(ior.add(1))).mul(materialSpecularColor), vec3(1)).mul(
    materialSpecularIntensity,
  ),
);
specularColorBlended.assign(mix(specularColor, diffuseColor.rgb, metalness));
specularF90.assign(mix(materialSpecularIntensity, 1.0, metalness));
```

The Fresnel factor uses `((ior−1)/(ior+1))²` (Schlick F0) as a per-channel
base, then blends specular color against diffuse by metalness.

### 4.6 Normal mapping

The `NORMAL` accessor branch:

```js
if ( material.normalMap ) {
  node = normalMap( texture(material.normalMap), materialReference('normalScale','vec2') );
  node.normalMapType = material.normalMapType;
  if ( RG / RGTC2 / EAC formats ) node.unpackNormalMode = NormalRGPacking;  // 2-channel normal
} else if ( material.bumpMap ) {
  node = bumpMap( texture(material.bumpMap).r, materialReference('bumpScale','float') );
} else {
  node = normalView;
}
```

`normalMap()` (internal, **not** exported from `three/tsl`) does the
tangent-space unpack (`n*2-1`) and the TBN transform into view space.
Clearcoat normals use the same helper via `setupClearcoatNormal()`.

---

## 5. Feature gates (`use*` getters)

`MeshPhysicalNodeMaterial` exposes boolean getters that switch **lighting-model
branches** on or off. Each is `value > 0 || nodeProperty !== null`:

| Getter            | Active when                                         |
| ----------------- | --------------------------------------------------- |
| `useClearcoat`    | `clearcoat > 0` \|\| `clearcoatNode !== null`       |
| `useSheen`        | `sheen > 0` \|\| `sheenNode !== null`               |
| `useIridescence`  | `iridescence > 0` \|\| `iridescenceNode !== null`   |
| `useAnisotropy`   | `anisotropy > 0` \|\| `anisotropyNode !== null`     |
| `useTransmission` | `transmission > 0` \|\| `transmissionNode !== null` |
| `useDispersion`   | `dispersion > 0` \|\| `dispersionNode !== null`     |

They feed the lighting model:

```js
setupLightingModel() {
  return new PhysicalLightingModel(useClearcoat, useSheen, useIridescence, useAnisotropy, useTransmission, useDispersion);
}
```

**Implications:**

- Assigning a node property alone (e.g. `mat.clearcoatNode = float(0.3)`) turns
  the branch **on**, even with the classic value at `0`.
- Each enabled branch adds shader cost:
  - `useTransmission` → a **refraction pass** that samples the framebuffer
    (`getTransmissionSample` at refracted UVs), plus IOR-based bending and
    attenuation/absorption.
  - `useAnisotropy` → TBN-rotated roughness (anisotropic GGX).
  - `useIridescence` → thin-film interference Fresnel (multi-layer math, §6.3).
  - `useClearcoat` → second specular lobe at `F0 = 0.04`.
- Disable features you do not use to keep the cheaper path.

---

## 6. Physical lighting model — `PhysicalLightingModel.js`

- **Direct light**: standard PBR specular + diffuse with GGX; `F_Schlick` from
  `specularColor/specularF90`, `D_GGX`/`V_GGX_SmithCorrelated`.
- **Indirect**: env radiance via `EnvironmentNode` (PMREM) — `Scene.environment`
  or the material `envMap`; diffuse uses `getShIrradianceAt` (SH irradiance);
  specular uses `getParallaxCorrectNormal` for parallax-box correction.
- **Transmission** (`useTransmission`): computes `transmissionRay` via
  `refract(-v, n, 1/ior) × thickness × modelScale`, projects the exit point into
  NDC, flips Y (WebGPU), and samples the framebuffer
  (`getTransmissionSample(refractionCoords, roughness, ior)`); applies
  `attenuationColor`/`attenuationDistance` (Beer–Lambert absorption).
- **Iridescence** (`useIridescence`): thin-film model — `sinTheta2` Snell,
  `cosTheta2`, `R0 = IorToFresnel0`, phase `OPD = ior × thickness × 2cosTheta2`,
  per-channel `phi12/phi21` phase shifts, blended reflectivity.
- **Clearcoat** (`useClearcoat`): `clearcoatF0 = vec3(0.04)`,
  `clearcoatF90 = 1`, GGX over `clearcoatRoughness` (post-`getRoughness`).
- **Sheen** (`useSheen`): fabric-like diffuse lobe from `sheen`/`sheenRoughness`.
- **Anisotropy** (`useAnisotropy`): anisotropic GGX using `alphaT` +
  `anisotropyT/anisotropyB` frame.

---

## 7. TSL building blocks — full reference

Everything below is exported from **`three/tsl`**
(`src/nodes/TSL.js` → re-exports `TSLBase.js`, `TSLCore.js`, math, accessors, …).

### 7.1 Constructors (from `TSLCore.js`)

`color(r,g,b)` · `float(x)` · `int(x)` · `uint(x)` · `bool(x)` ·
`vec2(x,y)` · `vec3(x,y,z)` · `vec4(x,y,z,w)` ·
`ivec2/3/4` · `uvec2/3/4` · `bvec2/3/4` ·
`mat2(...)` · `mat3(...)` · `mat4(...)` ·
`element(array, i)` · `split(node, 'xy')` · `append(...)` (deprecated) ·
`convert(node, type)` · `array(...)` / `.toArray()` ·
`uniform(value)` · `attribute(name)` · `varying(...)` · `vertexStage(...)`
`Fn(fn, layout?)` · `If(...)` · `Switch(...)` · `Stack(node)` · `defined(x)`

### 7.2 Math — `MathNode.js` (~70)

`abs` `sign` `round` `floor` `ceil` `trunc` `fract` `mod` `min` `max` `clamp`
`saturate` `mix` `step` `smoothstep` `pow` `pow2` `pow3` `pow4` `sqrt`
`inverseSqrt` `cbrt` `exp` `exp2` `log` `log2` `length` `lengthSq` `distance`
`dot` `cross` `normalize` `reflect` `refract` `faceForward` `negate` `oneMinus`
`reciprocal` `transpose` `determinant` `inverse` `radians` `degrees`
`sin` `cos` `tan` `asin` `acos` `atan` `sinh` `cosh` `tanh` `asinh` `acosh` `atanh`
`dFdx` `dFdy` `fwidth` `rand` `transformDirection` `transformNormalByViewMatrix`
`transformNormalByInverseViewMatrix`
constants: `PI` `PI2` `TWO` `HALF` `EPSILON` `INFINITY`

### 7.3 Operators — `OperatorNode.js`

`add` `sub` `mul` `div` `mod` · comparisons `equal` `notEqual` `lessThan`
`greaterThan` `lessThanEqual` `greaterThanEqual` · logic `and` `or` `not` `xor` ·
bitwise `bitAnd` `bitNot` `bitOr` `bitXor` `shiftLeft` `shiftRight` ·
`increment` `decrement` (and `*Before` variants). Chained on any node:
`n.mul(x).add(y)`, plus `.assign(v)`, `.toVar()`, `.discard()`, `.bypass(...)`,
`.isolate()`, `.context(...)`, `.remap(a,b,c,d)`, `.remapClamp(...)`,
`.toColorSpace(...)`, `.toToneMapping(...)`, `.toInspector()`, `.compute()`,
`.subBuild(type)`, `.call(fn)`.

### 7.4 Conditional

`If(cond, () => {...}).Else(() => {...}).ElseIf(...)` ·
`Switch(x, {case: fn, default: fn})` · `select(cond, a, b)` ·
`Discard()` / `Return()` (inside `Fn`).

### 7.5 Accessors (geometry & camera)

`positionLocal` `positionView` `positionWorld` `positionPrevious` ·
`normalLocal` `normalView` `normalWorld` `tangentView` `tangentWorld` ·
`bitangentView` · `uv()` `uv(0|1)` `uvs` · `vertexIndex` `instanceIndex` ·
`vertexColor()` `instanceColor()` `batchColor()` · `cameraPosition`
`viewMatrix` `projectionMatrix` `modelViewProjection` `modelMatrix` ·
`screenUV` `positionDirection` `viewDirection` `normalize()`

### 7.6 Material accessors (§4.1)

`materialColor` `materialRoughness` `materialMetalness` `materialEmissive`
`materialOpacity` `materialAlphaTest` `materialNormal` `materialIOR`
`materialTransmission` `materialThickness` `materialClearcoat`
`materialClearcoatRoughness` `materialClearcoatNormal` `materialSheen`
`materialSheenRoughness` `materialIridescence` `materialIridescenceIOR`
`materialIridescenceThickness` `materialSpecularIntensity` `materialSpecularColor`
`materialAnisotropy` `materialAttenuationDistance` `materialAttenuationColor`
`materialDispersion` `materialLightMap` `materialAO` `materialEnv`
`materialReference(name, type)` (raw)

### 7.7 Textures & display

`texture(tex, uvNode?)` · `texture(tex).r/g/b/a/rgb/xyz` · `textureLod` ·
`textureBicubic` · `normalMap()`/`bumpMap()` (internal) ·
`uv()`, `.toColorSpace()`, `.toToneMapping()` · `pass(scene, camera)` ·
`mrt({...})` · `bloom(...)` · `output` · `emissive` (used by `BloomRender.tsx`)

### 7.8 Function builder

```ts
import { Fn, uv, texture } from "three/tsl";
const myShader = Fn(() => {
  const c = texture(map, uv()).toVar();
  return c.rgb.mul(float(1.1));
});
mat.colorNode = myShader();
```

---

## 8. Practical patterns

### 8.1 Static material — classic props (what the project does today)

```ts
const mat = new THREE.MeshPhysicalNodeMaterial();
mat.color.setRGB(0.8, 0.2, 0.1);
mat.roughness = 0.4;
mat.metalness = 0.0;
mat.map = albedoTexture; // accessor auto-composes color × map
mat.normalMap = normalTexture;
mat.transparent = true;
mat.opacity = 0.9;
mat.alphaTest = 0.5;
mat.flatShading = true;
```

Fully TSL already — the accessors lift the values into the graph. No benefit to
hand-writing constant nodes.

### 8.2 Node-driven equivalents

Setting a `*Node` overrides the accessor inference for that channel (incl. any
map). Use when the shader must _compute_ the value.

#### 8.2.1 Scalars & colors

```ts
import { color, float } from "three/tsl";
mat.colorNode = color(0.8, 0.2, 0.1);
mat.roughnessNode = float(0.4);
mat.metalnessNode = float(0.0);
mat.emissiveNode = color(1, 0.3, 0).mul(float(2)); // intensity folded in
```

#### 8.2.2 Textures & UVs

```ts
import { uv, vec2, texture, mul, add } from "three/tsl";
const tiled = texture(albedo, uv().mul(vec2(4, 4))); // 4×4 tiling
const scrolled = texture(albedo, uv().add(vec2(0.1, 0))); // offset (drive with uniform)
const lightmap = texture(lm, uv(1)); // second UV set
```

⚠ **Sampler & colour-space config lives on the `THREE.Texture`, not the node:**
`wrapS/wrapT` (`RepeatWrapping` for tiling), `colorSpace`
(`SRGBColorSpace` for colour, `LinearSRGBColorSpace` for roughness/normal/ao),
`flipY`, `anisotropy`, filters.

```ts
albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
albedo.colorSpace = THREE.SRGBColorSpace;
albedo.anisotropy = 8;
```

#### 8.2.3 Map → channel conventions (§4.1 table)

When you go node-driven, **re-add the map + channel** the accessor would have
applied (mirror of §4.1):

```ts
const albedo = texture(albedoMap);
mat.colorNode = albedo.mul(color(0.8, 0.2, 0.1)); // tinted map (or just albedo)
mat.roughnessNode = texture(roughnessMap).g.mul(float(0.4));
mat.metalnessNode = texture(metalnessMap).b.mul(float(0.9));
mat.emissiveNode = texture(emissiveMap)
  .mul(color(1, 0.3, 0))
  .mul(float(2));
mat.opacityNode = texture(alphaMap).a.mul(float(0.85));
mat.aoNode = texture(aoMap).r;
mat.clearcoatNode = texture(clearcoatMap).r;
mat.specularIntensityNode = texture(specularIntensityMap).a;
mat.specularColorNode = texture(specularColorMap).rgb;
```

**Normal maps:** `normalMap()` is internal, not exported from `three/tsl`. The
accessor does the full tangent-space unpack + TBN. If you set `normalNode`, take
over the whole normal: `texture(normalMap).xyz.mul(2).sub(1)` gives an
object-space-style normal **without** the TBN transform. For correct tangent-
space mapping, keep `normalMap`/`normalScale` classic and `normalNode = null`.

#### 8.2.4 Composing / deriving

```ts
mat.colorNode = texture(albedo).mul(color(1.1, 0.9, 0.9)); // tint
mat.colorNode = mix(texture(a), texture(b), float(0.5)); // blend
mat.roughnessNode = mix(float(0.1), float(0.8), texture(mask).r); // mask
const n = texture(albedo).toVar(); // reuse
mat.metalnessNode = texture(metalMap).b.saturate();
mat.emissiveNode = texture(emissiveMap).mul(float(0.9)).clamp(vec3(0), vec3(1));
```

**Animated UV** — drive a `uniform()` per frame:

```ts
import { uniform, uv, add, texture } from "three/tsl";
const scroll = uniform(0);
// useFrame: scroll.value += dt * 0.1;
mat.colorNode = texture(albedo, uv().add(vec2(scroll, 0)));
```

#### 8.2.5 Worked example — fully node-driven material

```ts
import * as THREE from "three/webgpu";
import { color, float, vec2, texture, uv, mul } from "three/tsl";

const mat = new THREE.MeshPhysicalNodeMaterial();
mat.colorNode = texture(albedoTex, uv()).mul(color(0.95, 0.9, 0.9));
mat.metalnessNode = texture(metalTex, uv().mul(vec2(4, 4))).b;
mat.roughnessNode = texture(roughTex).g.mul(float(0.5));
mat.emissiveNode = texture(emissiveTex)
  .mul(color(1, 0.4, 0.2))
  .mul(float(1.5));
mat.transparent = true;
mat.opacityNode = texture(alphaTex).a;
mat.clearcoatNode = texture(clearcoatTex).r;
mat.iorNode = float(1.45);
```

### 8.3 Physical props — accessors or nodes

```ts
mat.transmission = 0.9; // classic
mat.thickness = 1.0;
mat.ior = 1.5;
mat.clearcoat = 0.5;

mat.transmissionNode = float(0.9); // node (activates useTransmission)
mat.iorNode = float(1.5);
mat.clearcoatNode = float(0.5);
mat.attenuationColorNode = color(1, 0.6, 0.3); // Beer–Lambert tint
mat.attenuationDistanceNode = float(2.0);
```

### 8.4 Transparency & blend modes

- `mat.transparent = true` + `mat.opacity` (or `opacityNode`) → alpha blending.
- `alphaTest` / `alphaTestNode` → hard cutout (fragment discard).
- `alphaToCoverage = true` → MSAA-friendly edge smoothing (requires >1 sample).
- `alphaHash = true` → dithered transparency for sorted-free rendering.
- Set `depthWrite = false` for glass / particles; keep `depthTest` on.

### 8.5 Anisotropy is a `vec2`

```ts
mat.anisotropyNode = vec2(1, 0); // length → magnitude; direction → tangent frame
```

### 8.6 Common Blender material → TSL mapping

| Blender (Principled BSDF) | Classic prop                                       | Node equivalent                                                   |
| ------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Base Color (texture)      | `map` + `color`                                    | `colorNode = texture(map)`                                        |
| Base Color (RGB)          | `color`                                            | `colorNode = color(r,g,b)`                                        |
| Roughness                 | `roughness`                                        | `roughnessNode = float(v)`                                        |
| Metallic                  | `metalness`                                        | `metalnessNode = float(v)`                                        |
| Emission Strength/Color   | `emissiveIntensity` + `emissiveMap` (+ `emissive`) | `emissiveNode = texture(emissiveMap).mul(color(e)).mul(float(s))` |
| Alpha                     | `opacity`                                          | `opacityNode = texture(alphaMap).a`                               |
| Normal                    | `normalMap` + `normalScale`                        | keep classic (TBN caveat)                                         |
| Clearcoat                 | `clearcoat`                                        | `clearcoatNode = float(v)`                                        |
| IOR                       | `ior`                                              | `iorNode = float(v)`                                              |
| Transmission              | `transmission`                                     | `transmissionNode = float(v)`                                     |
| Sheen                     | `sheen` + `sheenColor`                             | `sheenNode = color(...)`                                          |
| Anisotropic               | `anisotropy`                                       | `anisotropyNode = vec2(...)`                                      |

---

## 9. Pitfalls

1. **`colorNode` / `emissiveNode` / `opacityNode` swallow their maps** — always
   re-add the texture yourself (§2.4).
2. **`normalNode` lacks TBN** — for tangent-space normals keep `normalMap`
   classic.
3. **`useTransmission` enables a refraction pass** — expensive; it samples the
   framebuffer and needs `transmission` + `thickness` + `ior` to look right.
4. **`anisotropyNode` is a `vec2`**, not a scalar.
5. **Setting a `*Node` activates the `use*` branch even at value 0** (§5).
6. **Colour space is on the `THREE.Texture`** — a roughness map stored as sRGB
   will wash out the data; mark it `LinearSRGBColorSpace`.
7. **`RectAreaLight` has no `shadow`** — `castShadow` must be `false`
   (TSL `setupShadow` reads `light.shadow.shadowNode`). The AREA case was
   removed from `LightFromData.tsx`; AREA lights fall through to `pointLight`.
8. **No `mapNode`** — there is no per-map node property in r185.

---

## 10. Implications for this project

`meshBuilder.ts` (`buildGeometryFromBuffer`) currently does §8.1 — builds
`new THREE.MeshPhysicalNodeMaterial()` and sets classic props. This already runs
through the TSL pipeline; correct as-is.

Future-work notes:

- `tslMaterialBuilder.ts` was removed, so Blender's shader **node graph** is no
  longer evaluated. Materials use the flat property set synced from Blender
  (color, roughness, metalness, emissive, maps, blend mode). `graph`/`resolveImage`
  were stripped from `meshBuilder.ts`, `SyncViewer.tsx`, `ProductionViewer.tsx`,
  and `blenderTypes.ts`.
- `emissive` handling: the builder sets `emissiveIntensity` + `emissiveMap` but
  **not** `emissive`/`emissiveNode`. To honour Blender emissive colors, set
  `mat.emissive = new THREE.Color(...)` or `mat.emissiveNode = color(...)` —
  remembering `emissiveNode` overrides map + intensity.
- For per-pixel work later (animated UVs, procedural noise, vertex albedo),
  assign the relevant `*Node` and, for the base color, include `texture(map)`
  explicitly.
- `BloomRender.tsx` already uses the TSL sub-graph API (`pass`, `mrt`, `bloom`,
  `emissive`) — the same `three/tsl` surface documented in §7.

---

## 11. Reference file map (three 0.185.1)

| Topic                                                                                           | File                                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `MeshPhysicalNodeMaterial` + `use*` gates + `setupVariants`                                     | `src/materials/nodes/MeshPhysicalNodeMaterial.js` |
| `emissiveNode`/`metalnessNode`/`roughnessNode`                                                  | `src/materials/nodes/MeshStandardNodeMaterial.js` |
| `colorNode`/`opacityNode`/`alphaTestNode`/… + `setup()` + `setupDiffuseColor`                   | `src/materials/nodes/NodeMaterial.js`             |
| Map accessors (`materialColor`, `materialRoughness`, …) + channel reads                         | `src/nodes/accessors/MaterialNode.js`             |
| Geometry/camera accessors                                                                       | `src/nodes/accessors/`                            |
| Shader-wide property nodes (`diffuseColor`, `metalness`, `roughness`, `ior`, `transmission`, …) | `src/nodes/core/PropertyNode.js`                  |
| `getRoughness`                                                                                  | `src/nodes/functions/material/getRoughness.js`    |
| PBR lighting (direct/indirect, transmission, iridescence, clearcoat, sheen, anisotropy)         | `src/nodes/functions/PhysicalLightingModel.js`    |
| TSL base functions (`Fn`, `If`, `color`, `float`, `vec*`, `mat*`)                               | `src/nodes/tsl/TSLBase.js`, `TSLCore.js`          |
| Math functions                                                                                  | `src/nodes/math/MathNode.js`                      |
| Operators                                                                                       | `src/nodes/math/OperatorNode.js`                  |
| TSL public export surface                                                                       | `src/nodes/TSL.js` → `three/tsl`                  |
| Classic material defaults                                                                       | `src/materials/MeshPhysicalMaterial.js`           |
