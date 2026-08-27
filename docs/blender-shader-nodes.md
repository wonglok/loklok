# Blender Shader Nodes ↔ TSL Compatibility Report

Compatibility study between every node in the **Blender 5.2 LTS** Shader Editor
(manual: `render/shader_nodes`) and the **Three.js Shading Language (TSL)** as
shipped by **three.js r185.1** (`three/tsl` + `three/webgpu`), as used by this
project (`MeshPhysicalNodeMaterial`).

Ground truth:

- Blender manual — <https://docs.blender.org/manual/en/latest/render/shader_nodes/index.html>
- three.js r185.1 source — `node_modules/three/src/nodes/` (`TSL.js`, `Nodes.js`, `tsl/TSLBase.js`, `materialx/MaterialXNodes.js`)
- Project context — [`docs/tsl.md`](./tsl.md)

---

## 1. How a Blender material becomes a TSL material

Blender's shader _node graph_ has no equivalent in three.js: there is no
"node tree editor" that produces an arbitrary shader. TSL **is** a shader-graph
API, but three.js materials are built on **one fixed lighting model**
(`MeshPhysicalNodeMaterial` = the TSL version of `MeshPhysicalMaterial`). A
Blender graph therefore translates to TSL in one of two ways:

| Blender contribution                                          | TSL target                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Surface shader** (BSDF closures, emission, mix shaders)     | the material's **`*Node` properties** (`colorNode`, `roughnessNode`, `metalnessNode`, `emissiveNode`, `transmissionNode`, `iorNode`, `clearcoatNode`, `sheenNode`, `iridescenceNode`, `anisotropyNode`, `specularIntensityNode`, …) or the equivalent **classic properties** (`color`, `map`, `roughness`, …) |
| **Value / color / vector / texture / math / converter nodes** | any TSL expression (`Node`) that feeds a `*Node` property                                                                                                                                                                                                                                                     |
| **Displacement nodes**                                        | `mat.positionNode = …` (vertex-shader displacement)                                                                                                                                                                                                                                                           |
| **Volume shaders**                                            | ❌ no volume lighting model in three r185                                                                                                                                                                                                                                                                     |
| **World / light output**                                      | `scene.environment` / `scene.background` textures; three **lights** (scene objects, not nodes)                                                                                                                                                                                                                |
| **Render passes / AOV / ray-tracing features**                | ❌ Cycles/EEVEE-only                                                                                                                                                                                                                                                                                          |

Everything in categories **Input**, **Texture**, **Color**, **Displacement**,
**Utilities → Math**, **Utilities → Vector** is a _value-producing_ node and
translates cleanly into TSL expressions. The **Shader** category is not
per-node; it is the material's lighting model (see §5).

The `*Node` property semantics are the ones documented in
[`docs/tsl.md`](./tsl.md#2-node-property-inventory-r1851): setting
`mat.colorNode` overrides `color` + `map` for that channel, etc.

---

## 2. Status legend

| Mark                 | Meaning                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ✅ **Direct**        | TSL has a first-class function/accessor that reproduces the node's function.                                                        |
| 🟡 **Composable**    | No one-liner, but a short TSL expression / `Fn()` reproduces the exact function.                                                    |
| ⚠️ **Approximate**   | Same intent, different algorithm; needs a manual implementation, LUT texture, or only partially covered by the r185 lighting model. |
| ❌ **No equivalent** | Cycles/EEVEE renderer feature, geometry-simulation, or volume/ray-tracing feature that a TSL material cannot express.               |

---

## 3. TSL building blocks referenced throughout (r185.1)

All importable from `three/tsl`. Confirmed present in this exact build.

### 3.1 Constructors & accessors

| TSL                                                                                                                                                                                                                                                                                                                                                  | Purpose                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `float(x)` `int(x)` `bool(x)` `uint(x)`                                                                                                                                                                                                                                                                                                              | scalar constants                    |
| `vec2(x,y)` `vec3(x,y,z)` `vec4(x,y,z,w)` `mat2/3/4(...)`                                                                                                                                                                                                                                                                                            | vectors/matrices                    |
| `color(r,g,b)`                                                                                                                                                                                                                                                                                                                                       | color constant                      |
| `uniform(x)`                                                                                                                                                                                                                                                                                                                                         | uniform (animatable: `u.value = …`) |
| `uv(n?)`                                                                                                                                                                                                                                                                                                                                             | UV set 0 / 1 (Blender **UV Map**)   |
| `positionLocal/World/View`, `normalLocal/World/View`, `tangent*`, `bitangent*`                                                                                                                                                                                                                                                                       | geometry vectors                    |
| `positionViewDirection`                                                                                                                                                                                                                                                                                                                              | view vector (fragment → camera)     |
| `cameraPosition`, `cameraNear`, `cameraFar`, `cameraViewMatrix`, `cameraWorldMatrix`                                                                                                                                                                                                                                                                 | camera data                         |
| `time`, `deltaTime`, `frameId`                                                                                                                                                                                                                                                                                                                       | scene time                          |
| `objectPosition`, `objectScale`, `objectDirection`, `modelWorldMatrix`, `modelScale`, `modelRadius`                                                                                                                                                                                                                                                  | object info                         |
| `vertexColor()`, `vertexIndex`, `instanceIndex`, `attribute('name')`                                                                                                                                                                                                                                                                                 | vertex/instance data                |
| `screenCoordinate`, `screenUV`, `screenSize`, `matcapUV`                                                                                                                                                                                                                                                                                             | screen / matcap                     |
| `frontFacing`                                                                                                                                                                                                                                                                                                                                        | face direction                      |
| `materialColor`, `materialRoughness`, `materialMetalness`, `materialEmissive`, `materialOpacity`, `materialAO`, `materialIOR`, `materialTransmission`, `materialThickness`, `materialClearcoat`, `materialClearcoatRoughness`, `materialSheen`, `materialIridescence`, `materialSpecularIntensity`, `materialSpecularColor`, `materialAnisotropy`, … | classic-property accessors          |
| `diffuseColor`, `metalness`, `roughness`, `emissive`, `ior`, `transmission`, `thickness`, `specularColor`, `specularF90`                                                                                                                                                                                                                             | shader-wide channel nodes           |

### 3.2 Math (covers the Blender Math + Vector Math nodes)

`add` `sub` `mul` `div` `mix` `mixElement` `clamp` `saturate` `min` `max`
`abs` `sign` `floor` `ceil` `round` `trunc` `fract` `mod` `pow` `pow2/3/4`
`exp` `exp2` `log` `log2` `sqrt` `inversesqrt` `cbrt` `sin` `cos` `tan`
`asin` `acos` `atan` (2-arg = atan2) `sinh` `cosh` `tanh` `asinh` `acosh`
`atanh` `sinc` `radians` `degrees` `dot` `cross` `length` `lengthSq`
`distance` `normalize` `reflect` `refract` `faceforward` `inverse`
`transpose` `determinant` `smoothstep` `step` `select` `If(...)`
`lessThan` `lessThanEqual` `greaterThan` `greaterThanEqual` `equal`
`notEqual` `all` `any` `not` `and` `or` `oneMinus` `negate` `reciprocal`
`gain` `pcurve` `range` `remap` `remapClamp` `posterize`.

### 3.3 Color / blend / procedural

`luminance` `grayscale` `hue` `saturation` `vibrance` `posterize` `cdl`
`blendScreen` `blendOverlay` `blendDodge` `blendBurn` `blendColor` `mix`
`checker` `rand` `hash` `interleavedGradientNoise` `triNoise3D` `bumpMap`
`normalMap` `rotate` `rotateUV` `equirectUV` `toneMapping` `convertColorSpace`
`sRGBTransferOETF` `sRGBTransferEOTF`.

### 3.4 MaterialX helpers (exported from `three/tsl`, very useful for Blender parity)

`mx_unifiednoise2d/3d(noiseType, coord, freq, offset, jitter, outmin, outmax, clampoutput, octaves, lacunarity, diminish)` — noiseType `0=Perlin`, `1=Cell`, `2=Worley`, `3=Fractal`.
`mx_noise_float` `mx_worley_noise_float` `mx_cell_noise_float`
`mx_fractal_noise_float` `mx_hsvtorgb` `mx_rgbtohsv` `mx_ramp4`
`mx_ramplr` `mx_ramptb` `mx_splitlr` `mx_splittb` `mx_place2d`
`mx_transform_uv` `mx_rotate2d` `mx_rotate3d` `mx_contrast` `mx_safepower`
`mx_invert` `mx_heighttonormal`.

---

## 4. INPUT nodes

Blender 5.2 **Input** category. All value-producing; most map to TSL accessors.

| Blender node                | Status | TSL mapping                                                                                                                                                                                                                                                                |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Value** (Constant)        | ✅     | `float(0.5)` · animatable: `const u = uniform(0.5)`                                                                                                                                                                                                                        |
| **Integer**                 | ✅     | `int(3)`                                                                                                                                                                                                                                                                   |
| **Boolean**                 | ✅     | `bool(true)`                                                                                                                                                                                                                                                               |
| **Color**                   | ✅     | `color(0.2, 0.5, 0.8)`                                                                                                                                                                                                                                                     |
| **Vector**                  | ✅     | `vec3(1, 0, 0)`                                                                                                                                                                                                                                                            |
| **Menu**                    | ✅     | `select(index.equal(int(0)), a, b)` or `Switch(index, {…})`                                                                                                                                                                                                                |
| **Attribute**               | 🟡     | `attribute('name')`, `vertexColor()`, `bufferAttribute(attr, 'name')`. Only geometry attributes that exist on the mesh / are passed to the material work; arbitrary object data-attributes do not.                                                                         |
| **Ambient Occlusion**       | ⚠️     | Cycles/EEVEE ray/AO term, no node equivalent. Map-based: `mat.aoNode = texture(aoMap).r` (accessor math `1 + aoMapIntensity × (tex.r − 1)`).                                                                                                                               |
| **Bevel**                   | ⚠️     | Cycles-only geometric bevel. Approximate with a **baked bevel-normals texture**: `mat.normalNode = texture(bevelNormalsTex)` (requires the normal-map tangent-space caveat from tsl.md §6.2.4).                                                                            |
| **Camera Data**             | ✅     | `cameraPosition`, `cameraNear`, `cameraFar`, `cameraViewMatrix`; View Vector = `positionViewDirection`; View Z depth = `viewZToOrthographicDepth` / `viewZToPerspectiveDepth`, or `linearDepth` on `viewportDepthTexture`.                                                 |
| **Fresnel**                 | 🟡     | `const fresnel = Fn(({ ior, normal = transformedNormalView }) => { const f0 = pow((ior.sub(1)).div(ior.add(1)), 2); return f0.add((float(1).sub(f0)).mul(pow(float(1).sub(normal.z), 5))); })` — view-space trick `normal.z = dot(n, view)`.                               |
| **Geometry**                | ✅     | `positionLocal/World/View` (Position), `normalLocal/World/View` (Normal), `uv()` / `uv(1)` (UV), `positionViewDirection` (Incoming), `frontFacing` (Backfacing), `positionWorldDirection` (True Normal ≈ `normalWorld`). Random Per Island ≈ `hash(floor(positionLocal))`. |
| **Curves Info (Hair Info)** | ❌     | three r185 has no hair/curve shader path in the node material.                                                                                                                                                                                                             |
| **Layer Weight**            | ⚠️     | Cycles-specific. Approximate: Facing = `pow(1 − dot(n, v), x)`; Fresnel = the `fresnel` Fn above; Blend = `pow(1 − dot(n, v), x)`.                                                                                                                                         |
| **Light Path**              | ❌     | renderer feature (ray type). No equivalent.                                                                                                                                                                                                                                |
| **Object Info**             | 🟡     | `objectPosition` (Location), `modelWorldMatrix` (Rotation/Scale via `modelScale`), `objectScale`; Random ≈ `hash(objectPosition)`. Pass Index / Object Index: not exposed.                                                                                                 |
| **Particle Info**           | ❌     | GPU particle data (`velocity`, `instanceIndex`) only via Points/instancing; no particle-sim attributes.                                                                                                                                                                    |
| **Point Info**              | ❌     | point-cloud data; not available on mesh materials.                                                                                                                                                                                                                         |
| **Raycast**                 | ❌     | Cycles-only ray tracing.                                                                                                                                                                                                                                                   |
| **Scene Time**              | ✅     | `time` (Seconds), `deltaTime` (Frame/Delta). `frameId` for the frame number.                                                                                                                                                                                               |
| **Tangent**                 | 🟡     | Direction type `UV Map` → `tangentLocal/View/World`; `Radial` mode (tangent from a point in UV space) needs a custom `Fn`.                                                                                                                                                 |
| **Texture Coordinate**      | ✅     | `uv()` (UV), `positionLocal` (Object ≈ Generated), `positionWorld` (Generated/World), `normalWorld` (Normal), `cameraPosition`−`positionWorld` (Reflection ≈ `reflectView`), `matcapUV` (Matcap), `screenCoordinate` (Window).                                             |
| **UV Map**                  | ✅     | `uv(0)` / `uv(1)`; UV-from-name → `texture(tex, uv(...))`. Multi-UV via `uv(i)`.                                                                                                                                                                                           |
| **Color Attribute**         | 🟡     | `vertexColor()`; named color layers other than the active vertex color are not directly addressable.                                                                                                                                                                       |
| **Volume Info**             | ❌     | no volume path.                                                                                                                                                                                                                                                            |
| **Wireframe**               | 🟡     | No direct. Approximate with a screen-space edge detector: `fwidth(positionView.xy)` or `length(fwidth(positionWorld.xy))` → thresholded with `step`.                                                                                                                       |

### 4.1 Attribute node — Blender `attribute` / TSL `attribute`

```ts
// Blender: Attribute (name = "col")
mat.colorNode = attribute("col");
// or a vertex color layer
mat.colorNode = vertexColor();
// custom buffer attribute (JS side)
const attr = new THREE.BufferAttribute(data, 3);
mat.colorNode = bufferAttribute(attr, "color");
```

---

## 5. SHADER nodes (BSDF closures & light types)

These are **not translated as nodes** — they select which parts of
`MeshPhysicalNodeMaterial`'s fixed PBR lighting model are driven. The
`use*` feature gates in tsl.md §4 turn branches on/off.

| Blender node                                   | Status | How it maps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Principled BSDF**                            | ✅     | The material itself: `colorNode`/`metalnessNode`/`roughnessNode`/`emissiveNode`; `clearcoatNode`+`clearcoatRoughnessNode` (Clearcoat); `sheenNode`+`sheenRoughnessNode` (Sheen); `iridescenceNode`+`iridescenceIORNode`+`iridescenceThicknessNode` (Iridescence); `anisotropyNode` (Anisotropic); `transmissionNode`+`thicknessNode`+`iorNode`+`attenuationColorNode`+`attenuationDistanceNode` (Transmission); `specularIntensityNode`+`specularColorNode`+`iorNode` (Specular). **Subsurface & Alpha not fully covered** (no SSS in r185 physical). |
| **Diffuse BSDF**                               | ✅     | Metalness-0 PBR: `mat.metalnessNode = float(0); mat.colorNode = …; mat.roughnessNode = …`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Glossy BSDF**                                | ✅     | `mat.metalnessNode = float(1); mat.roughnessNode = …` (roughness anisotropy ≈ `anisotropyNode`).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Glass BSDF**                                 | ✅     | `mat.transmission = 1; mat.ior = …; mat.roughness = …` (transmissive GGX). Thin-film approx differs from Cycles but same intent.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Transparent BSDF**                           | ⚠️     | `mat.transparent = true; mat.opacityNode = …`. True refraction requires the transmission path instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Translucent BSDF**                           | ❌     | no translucency lighting model in r185.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Subsurface Scattering**                      | ⚠️     | No true SSS. Approximate with `transmission` + `thickness`, or `sheenNode`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Toon BSDF**                                  | ❌     | `ToonLightingModel` exists internally (`functions/ToonLightingModel.js`) but is not exposed as a material property.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Specular BSDF**                              | 🟡     | `specularIntensityNode` + `specularColorNode` + `iorNode` approximate it (not a separate closure).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Sheen BSDF**                                 | ✅     | `mat.sheenNode = …; mat.sheenRoughnessNode = …`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Metallic BSDF** (new in 5.2)                 | 🟡     | `mat.metalnessNode = float(1)` + `anisotropyNode` + `clearcoatNode`. Approximates, not a distinct closure.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Refraction BSDF**                            | ✅     | `transmission = 1; ior; roughness` (thin-lens refraction).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Add Shader / Mix Shader**                    | ⚠️     | You cannot blend **two materials**, but you can blend _contributions inside one_: `mat.colorNode = mix(cA, cB, f)`, `mat.roughnessNode = mix(rA, rB, f)`, emissive via `add(...)`.                                                                                                                                                                                                                                                                                                                                                                    |
| **Background**                                 | ⚠️     | Not a node. `scene.environment = tex` / `scene.background = tex`; TSL uniforms `backgroundBlurriness`, `backgroundIntensity`, `backgroundRotation`.                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Emission**                                   | ✅     | `mat.emissiveNode = color(r,g,b).mul(float(intensity))`, or `materialEmissive`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Volume Absorption / Scatter / Coefficients** | ❌     | no volume shader nodes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Principled Volume**                          | ❌     | no volume path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Hair BSDF / Principled Hair BSDF**           | ❌     | no hair BSDF.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Holdout**                                    | ❌     | Use `mat.maskNode = bool(false)`-style masking / `maskShadowNode` instead; not a holdout pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Ray Portal BSDF**                            | ❌     | Cycles-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## 6. DISPLACEMENT nodes

These feed `mat.positionNode` (vertex displacement). Note `positionNode`
replaces the geometry position entirely — include the base position.

| Blender node            | Status | TSL mapping                                                                                                                                                                                                                        |
| ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bump**                | ✅     | `mat.normalNode = bumpMap(texture(heightMap), strengthNode)` — TSL `bumpMap(tex, scale?)` (r185, `display/BumpMapNode.js`).                                                                                                        |
| **Displacement**        | 🟡     | `mat.positionNode = positionLocal.add(normalLocal.mul(heightNode))`; Midlevel: `… .mul(height.sub(midlevel))`; use the **classic property** `mat.displacementMap` when a texture is wanted (the accessor path does the same math). |
| **Normal Map**          | ✅     | `mat.normalNode = normalMap(texture(normalTex), scaleNode)` — TSL `normalMap(tex, scale?)`.                                                                                                                                        |
| **Vector Displacement** | 🟡     | `mat.positionNode = positionLocal.add(texture(vdispTex).xyz.mul(scale).sub(0.5))` (Object/World space).                                                                                                                            |

```ts
// Bump
mat.normalNode = bumpMap(texture(height), float(0.5));
// Normal map
mat.normalNode = normalMap(texture(nrm), float(1.0));
// Procedural displacement (midlevel 0.5, scale 0.1)
mat.positionNode = positionLocal.add(
  normalLocal.mul(noiseValue.sub(0.5).mul(float(0.1))),
);
```

---

## 7. TEXTURE nodes

| Blender node            | Status | TSL mapping                                                                                                                                                                                                                                      |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Image Texture**       | ✅     | `texture(tex, uvNode?)`. Movie files load as a texture too (or use `videoTexture`). Color space / wrap / filter live on `THREE.Texture` (tsl.md §6.2.2).                                                                                         |
| **Environment Texture** | ✅     | `texture(envTex, equirectUV(positionWorldDirection))`, or set `scene.environment = envTex` for IBL. Equirect conversion via `equirectUV`.                                                                                                        |
| **Checker Texture**     | ✅     | `checker(coord)` — returns `+1/−1` (use `.add(1).div(2)` or `smoothstep` to match Blender's 0–1).                                                                                                                                                |
| **Noise Texture**       | 🟡     | `mx_unifiednoise2d(0, coord, freq, vec2(0), 1, 0, 1, false, octaves, 2, 0.5)` → Perlin; type `FBM` ≈ `mx_unifiednoise2d(3, …)` with `octaves ≈ Detail`; distortion needs a manual offset: sample the same noise at an offset coordinate and add. |
| **Voronoi Texture**     | 🟡     | `mx_unifiednoise2d(2, coord, freq, vec2(0), jitter, 0, 1, false, 1, 2, 0.5)` → Worley (F1). F2 / Smooth / distance metrics: approximate with `mx_worley_noise_vec2/vec3` (returns distance to nearest cell).                                     |
| **White Noise Texture** | ✅     | `rand(coord)` (hash) — 1D `rand(x)`, 2D `rand(uv())`, 3D `rand(positionWorld)`, 4D via `hash`. `interleavedGradientNoise` for a stable screen-space alternative.                                                                                 |
| **Wave Texture**        | 🟡     | `Fn` — bands: `fract(sin(dot(p, vec2(d,0)) + phase))`; rings: `fract(length(p − center) + phase)`; combine with `oscSine`/`smoothstep`. No direct `wave()`.                                                                                      |
| **Brick Texture**       | ⚠️     | No direct. Build from `checker` + row offset + mortar color via `mix`/`select` (complex; see tsl.md §6.2.5 for `mix` blending patterns).                                                                                                         |
| **Magic Texture**       | ⚠️     | Iterative color swirl; implement as a custom `Fn` (sum of `sin`/`cos` harmonics + `triNoise3D`). No direct.                                                                                                                                      |
| **Gabor Texture**       | ❌     | Gabor-kernel noise; no equivalent.                                                                                                                                                                                                               |
| **Sky Texture**         | ⚠️     | No node. Use three's `Sky` (custom shader object) or an HDR equirect as `scene.environment`; a `PMREMTexture` (`pmremTexture`) can drive IBL.                                                                                                    |
| **Gradient Texture**    | 🟡     | Linear → `smoothstep(a, b, x)` / `mx_ramplr`; Diagonal → `(x+y)` normalized; Spherical → `length(p)`; Radial → `atan(p.y, p.x)` mapped; Quadratic → `pow(x,2)`; Easing → `smoothstep`.                                                           |
| **IES Texture**         | ⚠️     | Photometric data: three loads IES into a data texture used by light falloff; not a material node.                                                                                                                                                |

```ts
// Checker as 0–1
const c = checker(uv()).add(1).div(2);
// Perlin/FBM noise with detail + roughness
const n = mx_unifiednoise2d(
  3,
  positionLocal.xy.mul(scale),
  vec2(1),
  vec2(0),
  1,
  0,
  1,
  false,
  int(detail),
  2,
  roughness,
);
// Voronoi F1
const v = mx_unifiednoise2d(
  2,
  uv(),
  vec2(scale),
  vec2(0),
  jitter,
  0,
  1,
  false,
  1,
  2,
  0.5,
);
// White noise 3D
const w = rand(positionWorld);
```

---

## 8. COLOR nodes

| Blender node             | Status | TSL mapping                                                                                                                                                                                   |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mix Color**            | ✅     | `mix(a, b, f)`. Blend modes: `blendScreen`, `blendOverlay`, `blendDodge`, `blendBurn`, `blendColor` + `add`/`sub`/`mul`/`div`/`difference`. **Soft Light / Linear Light** need a custom `Fn`. |
| **RGB Curves**           | ⚠️     | No curve widget. Implement per-channel Catmull-Rom spline `Fn`, or bake the curve into a 1-D `DataTexture` and sample via `texture(lut, vec2(f))`.                                            |
| **Brightness/Contrast**  | 🟡     | `cdl(c, vec3(1), vec3(0), vec3(contrast))` or manual `(c.sub(0.5)).mul(contrast).add(0.5).add(brightness)`.                                                                                   |
| **Gamma**                | ✅     | `c.pow(vec3(1 / gamma))` (per-channel `pow`).                                                                                                                                                 |
| **Hue/Saturation/Value** | ✅     | `hue(c, h)` / `saturation(c, s)` / value via `mix(luminance(c), c, v)`; or round-trip `mx_hsvtorgb(mx_rgbtohsv(c))` and shift the HSV components.                                             |
| **Invert Color**         | ✅     | `color(1,1,1).sub(c)`; with Factor: `mix(c, color(1).sub(c), f)`.                                                                                                                             |
| **Color Ramp**           | ✅     | Factor → stops. `mx_ramp4(f, c1, c2, c3, c4)` for 4 stops, or a `mix` chain for N stops, or a 1-D LUT `texture(lut, vec2(f))`.                                                                |
| **Blackbody**            | 🟡     | Blackbody temperature→RGB; implement the Planckian-locus polynomial as a custom `Fn` or bake a LUT. No built-in.                                                                              |
| **Wavelength**           | 🟡     | Wavelength→RGB (approx. color-matching curve); custom `Fn` or LUT.                                                                                                                            |
| **Light Falloff**        | ⚠️     | `getDistanceAttenuation(distance, cutoff)` or `1 / distance²` (quadratic); Blender's _Quadratic/Smooth/Linear_ falloffs are approx.                                                           |
| **Combine Color**        | ✅     | `vec3(r, g, b)`; space conversions via `convertColorSpace`/`sRGBTransferOETF`/`sRGBTransferEOTF`.                                                                                             |
| **Separate Color**       | ✅     | `c.r` / `c.g` / `c.b` / `c.a` (plus `.rgb`, `.xyz`).                                                                                                                                          |
| **RGB to BW**            | ✅     | `luminance(c)` or `grayscale(c)`.                                                                                                                                                             |
| **Shader To RGB**        | ❌     | EEVEE-only (render of the surface to a color).                                                                                                                                                |

```ts
// Mix with factor + clamp
mat.colorNode = mix(colorA, colorB, f).clamp(vec3(0), vec3(1));
// Hue/Sat/Value
mat.colorNode = hue(saturation(c, 1.2), 0.1);
// Color ramp from factor f (4 stops)
mat.colorNode = mx_ramp4(f, c0, c1, c2, c3);
// Gamma
mat.colorNode = c.pow(vec3(1 / 2.2));
```

---

## 9. UTILITIES → MATH nodes

| Blender node    | Status | TSL mapping                                                                                                                                                                                                       |
| --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Math**        | ✅     | **Full parity** — see the operation table §9.1.                                                                                                                                                                   |
| **Mix**         | ✅     | `mix(a, b, f)`; blend modes as in §8 **Mix Color**; clamp result with `.clamp()`.                                                                                                                                 |
| **Map Range**   | ✅     | Linear: `remap(x, fromMin, fromMax, toMin, toMax)`; clamp variant `remapClamp(...)`; Smoothstep: `smoothstep(fromMin, fromMax, x)` then remap; Smootherstep: `smoothstepElement` cubed (`t*t*t*(t*(t*6−15)+10)`). |
| **Clamp**       | ✅     | `clamp(x, min, max)`; Min/Max modes via `min`/`max`.                                                                                                                                                              |
| **Float Curve** | ⚠️     | Curve widget; same spline/LUT approach as **RGB Curves**.                                                                                                                                                         |

### 9.1 Blender **Math** node operation → TSL

| Blender op                         | TSL                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Add / Subtract / Multiply / Divide | `add(a,b)` `sub(a,b)` `mul(a,b)` `div(a,b)`                              |
| Multiply Add                       | `mul(a,b).add(c)`                                                        |
| Power                              | `pow(a,b)`                                                               |
| Logarithm                          | `log(a)` (base e) / `log2(a)`                                            |
| Square Root / Inverse Square Root  | `sqrt(a)` / `inversesqrt(a)`                                             |
| Absolute                           | `abs(a)`                                                                 |
| Exponent                           | `exp(a)` / `exp2(a)`                                                     |
| Minimum / Maximum                  | `min(a,b)` / `max(a,b)`                                                  |
| Less Than / Greater Than           | `a.lessThan(b)` / `a.greaterThan(b)` (bool)                              |
| Sign                               | `sign(a)`                                                                |
| Compare                            | `a.equal(b)` (bool)                                                      |
| Smooth Minimum / Smooth Maximum    | custom `Fn` using `smoothstep` on the difference                         |
| Round / Floor / Ceil / Truncate    | `round(a)` `floor(a)` `ceil(a)` `trunc(a)`                               |
| Snap                               | `floor(a.div(step)).mul(step)`                                           |
| Wrap                               | `mod(a.sub(min), max.sub(min)).add(min)`                                 |
| Ping-pong                          | `abs(mod(a.sub(min), (max.sub(min)).mul(2)).sub(max.sub(min))).add(min)` |
| Sine / Cosine / Tangent            | `sin(a)` `cos(a)` `tan(a)`                                               |
| Arcsine / Arccosine / Arctangent   | `asin(a)` `acos(a)` `atan(a)`                                            |
| Arctan2                            | `atan(a, b)`                                                             |
| Hyperbolic Sine / Cosine / Tangent | `sinh(a)` `cosh(a)` `tanh(a)`                                            |
| Arsinh / Arcosh / Artanh           | `asinh(a)` `acosh(a)` `atanh(a)`                                         |
| To Radians / To Degrees            | `radians(a)` / `degrees(a)`                                              |

---

## 10. UTILITIES → VECTOR nodes

| Blender node                         | Status | TSL mapping                                                                                                                                                                                                  |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Combine XYZ**                      | ✅     | `vec3(x, y, z)`                                                                                                                                                                                              |
| **Separate XYZ**                     | ✅     | `v.x` / `v.y` / `v.z`                                                                                                                                                                                        |
| **Combine Cylindrical / Spherical**  | 🟡     | Coordinate conversion `Fn` (e.g. spherical → `vec3(r sinθ cosφ, r sinθ sinφ, r cosθ)`).                                                                                                                      |
| **Separate Cylindrical / Spherical** | 🟡     | Inverse conversion `Fn`.                                                                                                                                                                                     |
| **Mapping**                          | ✅     | `mx_place2d(uv, …)` (translate/rotate/scale/pivot) or manual `uv.mul(scale).add(offset)` + `rotateUV(uv, angle, center)`; 3-D variant via `rotate(vec3Node, euler)` and `add`/`mul`.                         |
| **Normal**                           | ✅     | `normalize(v)`                                                                                                                                                                                               |
| **Vector Curves**                    | ⚠️     | Spline/LUT as with RGB Curves.                                                                                                                                                                               |
| **Radial Tiling**                    | 🟡     | Polar tiling `Fn` (angle → `atan`, tile count → `mod`).                                                                                                                                                      |
| **Vector Math**                      | ✅     | **Full parity** — see §10.1.                                                                                                                                                                                 |
| **Vector Rotate**                    | ✅     | `rotate(v, eulerVec3)` (Euler); `rotate(v, angle)` on a `vec2`; `mx_rotate2d` / `mx_rotate3d` for MaterialX parity. Axis-Angle: `rotate(v, axis, angle)` via RotateNode.                                     |
| **Vector Transform**                 | 🟡     | `transformDirection(v, 'world', 'view')` / `transformNormal(v, …)`; matrices `cameraViewMatrix`, `modelWorldMatrix`, `modelWorldMatrixInverse`, `cameraWorldMatrix`; Point transforms via `modelViewMatrix`. |

### 10.1 Blender **Vector Math** node operation → TSL

| Blender op                              | TSL                                         |
| --------------------------------------- | ------------------------------------------- |
| Add / Subtract / Multiply / Divide      | `add(a,b)` `sub(a,b)` `mul(a,b)` `div(a,b)` |
| Multiply Add                            | `mul(a,b).add(c)`                           |
| Cross Product                           | `cross(a,b)`                                |
| Project                                 | `b.mul(dot(a,b).div(dot(b,b)))`             |
| Reflect                                 | `reflect(a, b)`                             |
| Refract                                 | `refract(a, b, eta)`                        |
| Faceforward                             | `faceforward(a, b, c)`                      |
| Dot Product                             | `dot(a,b)`                                  |
| Distance                                | `distance(a,b)`                             |
| Length                                  | `length(a)`                                 |
| Scale                                   | `a.mul(s)`                                  |
| Normalize                               | `normalize(a)`                              |
| Absolute                                | `abs(a)`                                    |
| Snap / Floor / Ceil / Modulo / Fraction | as in §9.1                                  |
| Minimum / Maximum                       | `min(a,b)` / `max(a,b)`                     |
| Wrap                                    | as in §9.1                                  |
| Sine / Cosine / Tangent                 | `sin(a)` `cos(a)` `tan(a)`                  |
| Signed Power                            | `pow(abs(a), e).mul(sign(a))`               |

---

## 11. OUTPUT / WORLD / LIGHT nodes

| Blender node        | Status | TSL mapping                                                                                                                                                  |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Material Output** | ✅     | Surface → the material channels; **Displacement** → `mat.positionNode` (§6); **Thickness** → `thicknessNode`; **Volume** → ❌; **Properties/AOV** → ❌.      |
| **Light Output**    | ⚠️     | three lights are scene objects (`pointLight`, `directionalLight`, `spotLight`, `rectAreaLight`), not nodes; `RectAreaLight` shadows unsupported (tsl.md §7). |
| **World Output**    | ⚠️     | `scene.background` / `scene.environment`; TSL `backgroundBlurriness`, `backgroundIntensity`, `backgroundRotation` (r185). No world volume.                   |
| **AOV Output**      | ❌     | Custom outputs unsupported; MRT (`mrt({...})`) exists for post-processing but not arbitrary user AOVs.                                                       |

---

## 12. Group / misc nodes

| Blender node                     | Status | TSL mapping                                                                                                      |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| **Group**                        | ✅     | A group is just a reusable sub-graph — in TSL that is a `Fn(() => { …; return v; })` function.                   |
| **Repeat Zone**                  | 🟡     | Loop node — TSL `Loop({ start, end, type: 'int' }, () => { … })`; `for` loops are supported in `Fn` bodies.      |
| **Implicit Conversion**          | ✅     | TSL auto-converts `float`→`vec`→`mat` and scalars to vectors (`float(1).toVec3`); explicit `convert(x, 'vec3')`. |
| **Closure / Evaluate Closure**   | ❌     | three has no closure type.                                                                                       |
| **Combine/Join/Separate Bundle** | ❌     | no bundle/struct user graph (TSL `struct()` exists but is not a Blender bundle equivalent).                      |
| **Menu Switch**                  | ✅     | `Switch(index, {…})` / `select(...)`.                                                                            |
| **Script**                       | ❌     | Python node — no equivalent.                                                                                     |

---

## 13. Quick-reference: which Blender nodes are directly usable in TSL

**Fully mappable (✅ / 🟡):** Value, Integer, Boolean, Color, Vector, Menu,
Camera Data, Geometry, Scene Time, Texture Coordinate, UV Map, Attribute,
Tangent, Fresnel · Bump, Normal Map, Displacement, Vector
Displacement · Image Texture, Environment Texture, Checker, Noise, Voronoi,
White Noise, Gradient · Mix Color, Color Ramp, Combine/Separate Color, RGB to
BW, Hue/Saturation/Value, Gamma, Invert, Brightness/Contrast · Math, Mix, Map
Range, Clamp · Combine/Separate XYZ, Vector Math, Vector Rotate, Mapping,
Normal, Vector Transform, Vector Curves (via LUT) · Group, Repeat Zone,
Implicit Conversion, Menu Switch.

**Material-channel mappings (✅):** Principled BSDF (all its inputs map to
`*Node` properties), Diffuse, Glossy, Glass, Refraction, Sheen, Emission,
Metallic (approx), Specular (approx), Mix/Add Shader (within one material).

**No equivalent (❌):** Ambient Occlusion (ray), Bevel, Light Path, Raycast,
Particle Info, Point Info, Curves Info, Volume Info, Wireframe (approx
possible) · all Volume shaders, Hair BSDFs, Holdout, Ray Portal, Translucent,
Toon, Principled Volume · Shader To RGB · AOV Output · Bundle/Closure/Script
nodes.

---

## 14. Practical translation recipe (Blender → effectnode-b3 material)

For a typical Blender principled material:

1. **Base color** → `mat.color = albedoColor` + `mat.map = albedoTex`, or
   `mat.colorNode = texture(albedoTex).mul(tint)`.
2. **Metallic / Roughness** → `mat.metalnessNode = texture(metalMap).b`,
   `mat.roughnessNode = texture(roughMap).g` (channel conventions in
   tsl.md §6.2.3), or `mat.metalness = …; mat.roughness = …`.
3. **Normal** → keep classic `mat.normalMap` + `mat.normalScale` (correct TBN,
   tsl.md §6.2.4); only use `mat.normalNode` when you handle the tangent-space
   transform yourself.
4. **Emission** → `mat.emissiveNode = texture(emissiveMap).mul(color(r,g,b)).mul(float(intensity))`.
5. **Transmission / IOR / Thickness / Attenuation** → the physical channels;
   setting any `*Node` turns the `use*` branch on (tsl.md §4).
6. **Clearcoat / Sheen / Iridescence / Anisotropy** → `clearcoatNode`,
   `sheenNode`, `iridescenceNode`, `anisotropyNode` (vec2).
7. **Displacement / Bump** → `mat.positionNode` / `mat.normalNode` (§6).
8. **Alpha** → `mat.transparent = true; mat.opacityNode = texture(alphaMap).a`
   or `mat.alphaTestNode = float(0.5)`.

Everything value-producing in between — noise, ramps, math chains, UV
manipulation — is written as TSL expressions and assigned to the appropriate
channel. See `docs/tsl.md` §6 for the exact node-property mechanics.
