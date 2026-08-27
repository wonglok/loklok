# Blender Shader Nodes ↔ TSL Mapping

Bidirectional compatibility report for **Blender 5.2 LTS** Shader Editor nodes and
**three.js r185.1** TSL (`three/tsl`, `three/webgpu`) as used by this project's
`MeshPhysicalNodeMaterial`.

## 0. Sources & method

Studied for this report:

- `docs/blender-shader-nodes.md` — the Blender→TSL compatibility study (every
  node in Blender's Shader Editor).
- `docs/tsl.md` — deep reference for `MeshPhysicalNodeMaterial`, its `*Node`
  properties, the build pipeline, and the TSL building blocks.
- `node_modules/three/build/three.tsl.js` — the **authoritative TSL export
  surface** (`TSL.*`, ~500 symbols).

**TSL is treated as the first-class citizen.** The report is organised primarily
by the TSL node catalog (§1), with each TSL node cross-referenced to its Blender
counterpart. The Blender→TSL direction (§2) reproduces every compatibility table
for look-up from Blender's side. §3 lists TSL nodes with no Blender counterpart;
§4 highlights under-used TSL nodes that maximise Blender parity.

### Status legend

| Mark                 | Meaning                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ✅ **Direct**        | TSL has a first-class function/accessor reproducing the node's function.                                                       |
| 🟡 **Composable**    | No one-liner; a short TSL expression / `Fn()` reproduces the exact function.                                                   |
| ⚠️ **Approximate**   | Same intent, different algorithm; needs a manual implementation, LUT, or is only partially covered by the r185 lighting model. |
| ❌ **No equivalent** | Cycles/EEVEE feature, volume/ray-tracing, or geometry-simulation that a TSL material cannot express.                           |

---

## 1. TSL node catalog (first-class index, from `three.tsl.js`)

Every symbol below is confirmed present in `three.tsl.js` (r185.1). Columns:
**TSL node** · **Blender counterpart** · **Status**.

### 1.1 Constructors & types

| TSL                                                      | Blender counterpart                     | Status |
| -------------------------------------------------------- | --------------------------------------- | ------ |
| `float(x)` `int(x)` `uint(x)` `bool(x)`                  | **Value / Integer / Boolean**           | ✅     |
| `vec2/vec3/vec4(x…)` `ivec2/3/4` `uvec2/3/4` `bvec2/3/4` | **Vector**, **Combine XYZ/Color**       | ✅     |
| `mat2/mat3/mat4(…)`                                      | (matrix maths — Vector Math indirectly) | 🟡     |
| `color(r,g,b)`                                           | **Color**                               | ✅     |
| `array(…)` `struct(…)`                                   | **Group / Bundle** (loose)              | 🟡     |
| `convert(x, type)` `bitcast(x)`                          | **Implicit Conversion**                 | ✅     |
| `element(arr, i)` `split(v, 'xy')` `append(…)`           | **Separate/Combine**, array indexing    | ✅     |

### 1.2 Scalar & vector math

| TSL                                                                                                                 | Blender counterpart                                                | Status |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| `add` `sub` `mul` `div` `mod`                                                                                       | **Math / Vector Math**: Add, Subtract, Multiply, Divide, Modulo    | ✅     |
| `pow` `pow2/3/4`                                                                                                    | **Math**: Power, Signed Power                                      | ✅     |
| `exp` `exp2` `log` `log2` `sqrt` `inversesqrt` `cbrt`                                                               | **Math**: Exponent, Logarithm, Sqrt, InvSqrt                       | ✅     |
| `abs` `sign` `floor` `ceil` `round` `trunc` `fract`                                                                 | **Math**: Absolute, Sign, Floor, Ceil, Round, Truncate, Fraction   | ✅     |
| `min` `max` `clamp` `saturate`                                                                                      | **Math / Clamp**                                                   | ✅     |
| `mix` `mixElement`                                                                                                  | **Mix**, **Mix Color**                                             | ✅     |
| `step` `smoothstep` `stepElement` `smoothstepElement`                                                               | **Map Range** (smoothstep), **Math** (Step)                        | ✅     |
| `remap` `remapClamp` `range`                                                                                        | **Map Range** (Linear + Clamp)                                     | ✅     |
| `pcurve` `gain` `posterize` `parabola`                                                                              | **Float Curve / RGB Curves** (simplified), **Map Range** (Stepped) | 🟡     |
| `length` `lengthSq` `distance` `dot` `cross` `normalize`                                                            | **Vector Math**: Length, Distance, Dot, Cross, Normalize           | ✅     |
| `reflect` `refract` `faceforward`                                                                                   | **Vector Math**: Reflect, Refract, Faceforward                     | ✅     |
| `negate` `oneMinus` `reciprocal`                                                                                    | **Math** (negate / 1−x / 1/x)                                      | ✅     |
| `inverse` `transpose` `determinant`                                                                                 | (matrix ops)                                                       | 🟡     |
| `radians` `degrees`                                                                                                 | **Math**: To Radians / Degrees                                     | ✅     |
| `sin` `cos` `tan` `asin` `acos` `atan` `atan(a,b)`                                                                  | **Math**: Sine, Cosine, Tangent, Arcsin…, Arctan2                  | ✅     |
| `sinh` `cosh` `tanh` `asinh` `acosh` `atanh` `sinc`                                                                 | **Math**: hyperbolic ops                                           | ✅     |
| `dFdx` `dFdy` `fwidth`                                                                                              | derivative / edge detection (**Wireframe** approx)                 | 🟡     |
| `rand` `hash`                                                                                                       | **White Noise**                                                    | ✅     |
| `equal` `notEqual` `lessThan` `lessThanEqual` `greaterThan` `greaterThanEqual`                                      | **Math**: Compare, Less/Greater Than                               | ✅     |
| `all` `any` `not` `and` `or` `xor`                                                                                  | **Boolean** logic / **Math** (compare combos)                      | ✅     |
| `bitAnd` `bitOr` `bitXor` `bitNot` `shiftLeft` `shiftRight` `countOneBits` `countLeadingZeros` `countTrailingZeros` | (bitwise — no direct Blender node)                                 | —      |
| `atomic*` `increment` `decrement`                                                                                   | (compute only)                                                     | —      |

### 1.3 Control flow

| TSL                                                                                                                                                            | Blender counterpart                                 | Status |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------ |
| `Fn(fn, layout)`                                                                                                                                               | **Group** (reusable sub-graph)                      | ✅     |
| `If(cond, …)` `Switch(x, {…})` `select(cond, a, b)`                                                                                                            | **Menu / Menu Switch**, Boolean branches            | ✅     |
| `Loop({…})` `Break` `Continue`                                                                                                                                 | **Repeat Zone**                                     | 🟡     |
| `Return` `Discard`                                                                                                                                             | (implicit)                                          | ✅     |
| `Stack` `Var` `Const` `assign` `property` `parameter`                                                                                                          | (TSL internal / shader plumbing)                    | —      |
| `uniform(x)` `uniformArray` `reference` `buffer` `bufferAttribute` `dynamicBufferAttribute` `instancedBufferAttribute` `attribute` `attributeArray` `userData` | **Attribute**, **Value** (animated), vertex buffers | 🟡     |
| `context` `bypass` `isolate` `cache` `call` `overloadingFn` `code` `expression` `glsl` `wgsl` `glslFn` `wgslFn` `js`                                           | **Script** (manual GLSL/WGSL), **Group**            | 🟡     |
| `label` `setName` `debug`                                                                                                                                      | (tooling)                                           | —      |

### 1.4 Geometry / camera / object accessors

| TSL                                                                                                                                                                        | Blender counterpart                                                      | Status                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- | --- |
| `positionLocal/View/World/Geometry/Previous`                                                                                                                               | **Geometry** (Position), **Texture Coordinate** (Object/Generated/World) | ✅                                      |
| `normalLocal/View/World/Geometry/Flat` `transformedNormalView/World` `bentNormalView` `normalViewGeometry` `normalWorldGeometry`                                           | **Geometry** (Normal, True Normal)                                       | ✅                                      |
| `tangentLocal/View/World/Geometry` `bitangent*`                                                                                                                            | **Tangent** (UV Map mode)                                                | 🟡                                      |
| `uv()` `uv(0                                                                                                                                                               | 1)`                                                                      | **UV Map**, **Texture Coordinate** (UV) | ✅  |
| `vertexColor()` `vertexIndex` `instanceIndex` `drawIndex`                                                                                                                  | **Color Attribute**, **Particle/Point Info** (indices)                   | 🟡                                      |
| `faceDirection` `frontFacing`                                                                                                                                              | **Geometry** (Backfacing)                                                | ✅                                      |
| `cameraPosition` `cameraNear` `cameraFar` `cameraViewMatrix` `cameraWorldMatrix` `cameraProjectionMatrix(±Inverse)` `cameraNormalMatrix`                                   | **Camera Data**                                                          | ✅                                      |
| `objectPosition` `objectScale` `objectDirection` `objectRadius` `objectViewPosition` `objectWorldMatrix`                                                                   | **Object Info** (Location/Random), **Texture Coordinate** (Object)       | 🟡                                      |
| `modelPosition` `modelDirection` `modelScale` `modelRadius` `modelViewMatrix` `modelViewProjection` `modelWorldMatrix(±Inverse)` `modelNormalMatrix` `highp/mediumpModel*` | **Object Info**, **Vector Transform**                                    | 🟡                                      |
| `positionViewDirection` `positionWorldDirection`                                                                                                                           | **Geometry** (Incoming), **Texture Coordinate** (Reflection)             | ✅                                      |
| `screenCoordinate` `screenUV` `screenSize` `screenDPR` `matcapUV` `clipSpace`                                                                                              | **Texture Coordinate** (Window), Matcap                                  | ✅                                      |
| `time` `deltaTime` `frameId`                                                                                                                                               | **Scene Time**                                                           | ✅                                      |
| `velocity` `morphReference` `skinning` `computeSkinning` `billboarding`                                                                                                    | (three-only animation features)                                          | —                                       |

### 1.5 Material accessors & shader channels

| TSL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Blender counterpart                                                                             | Status |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------ |
| `materialColor` `materialRoughness` `materialMetalness` `materialEmissive` `materialOpacity` `materialAlphaTest` `materialNormal` `materialAO` `materialIOR` `materialTransmission` `materialThickness` `materialClearcoat(+Roughness/Normal)` `materialSheen(+Roughness)` `materialIridescence(+IOR/Thickness)` `materialSpecularIntensity/Color` `materialAnisotropy(±Vector)` `materialAttenuationColor/Distance` `materialDispersion` `materialEnvIntensity/Rotation` `materialLightMap` `materialReflectivity` `materialRefractionRatio` `materialShininess` `materialSpecular` `materialSpecularStrength` `materialLine*` `materialPointSize` `materialRotation` `materialReference(name, type)` | the classic-property accessors — they read whatever the **Principled BSDF / material** provides | ✅     |
| `diffuseColor` `metalness` `roughness` `emissive` `ior` `transmission` `thickness` `specularColor` `specularF90` `clearcoat` `clearcoatRoughness` `sheen` `sheenRoughness` `iridescence` `iridescenceIOR` `iridescenceThickness` `anisotropy` `anisotropyT/B` `alphaT` `attenuationColor` `attenuationDistance` `dispersion`                                                                                                                                                                                                                                                                                                                                                                           | the shader-wide channel values driving the PBR model                                            | ✅     |

### 1.6 Textures & sampling

| TSL                                                                                                                                                                                                      | Blender counterpart                                             | Status |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ |
| `texture(tex, uvNode?)` `.r/g/b/a/rgb/xyz`                                                                                                                                                               | **Image Texture**                                               | ✅     |
| `texture3D` `textureCubeUV` `cubeTexture` `uniformCubeTexture`                                                                                                                                           | volume/cube textures (Environment / 3D)                         | ✅     |
| `textureLoad` `textureSize` `textureLevel` `textureBicubic(Level)`                                                                                                                                       | (raw / mip sampling)                                            | 🟡     |
| `pmremTexture`                                                                                                                                                                                           | **Sky / Environment** (IBL via PMREM)                           | ⚠️     |
| `sampler` `samplerComparison` `sample`                                                                                                                                                                   | (low-level)                                                     | —      |
| `triplanarTexture(s)`                                                                                                                                                                                    | Triplanar projection (no direct Blender node, but useful)       | 🟡     |
| `viewportTexture` `viewportDepthTexture` `viewportMipTexture` `viewportOpaqueMipTexture` `viewportSharedTexture` `viewportLinearDepth` `viewportUV` `viewportSafeUV` `viewportSize` `viewportResolution` | (screen-space reads — **Shader To RGB**-like, EEVEE equivalent) | ⚠️     |
| `spherizeUV` `spritesheetUV` `equirectUV` `equirectDirection` `pointUV` `screenUV`                                                                                                                       | **Texture Coordinate** variants                                 | ✅     |
| `convertToTexture` `maxMipLevel` `textureBarrier`                                                                                                                                                        | (infra)                                                         | —      |

### 1.7 Bump / normal / displacement

| TSL                              | Blender counterpart                | Status |
| -------------------------------- | ---------------------------------- | ------ |
| `normalMap(tex, scale)`          | **Normal Map**                     | ✅     |
| `bumpMap(tex, scale)`            | **Bump**                           | ✅     |
| `mx_heighttonormal(h, scale)`    | **Bump** (MaterialX height→normal) | ✅     |
| `getNormalFromDepth(depth, pos)` | (SSAO helper)                      | 🟡     |
| `parallaxUV` `parallaxDirection` | **Displacement** (parallax-ish)    | 🟡     |
| `negateOnBackSide`               | (double-sided normal flip)         | 🟡     |

### 1.8 Color / blend / conversion

| TSL                                                                                                   | Blender counterpart                             | Status |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------ |
| `cdl(c, slope, offset, power)`                                                                        | **Brightness/Contrast** (ASC CDL form)          | 🟡     |
| `hue` `saturation` `vibrance`                                                                         | **Hue/Saturation/Value**                        | ✅     |
| `grayscale` `luminance`                                                                               | **RGB to BW**                                   | ✅     |
| `posterize`                                                                                           | **Math** (posterize) / **RGB Curves** (stepped) | 🟡     |
| `blendScreen` `blendOverlay` `blendDodge` `blendBurn` `blendColor`                                    | **Mix Color** blend modes                       | ✅     |
| `mix`                                                                                                 | **Mix Color** (Mix), **Mix**                    | ✅     |
| `convertColorSpace` `colorSpaceToWorking` `workingToColorSpace` `sRGBTransferOETF` `sRGBTransferEOTF` | **Combine/Separate Color** space conversions    | ✅     |
| `mx_hsvtorgb` `mx_rgbtohsv`                                                                           | **Combine/Separate Color** (HSV)                | ✅     |
| `packNormalToRGB` `unpackRGBToNormal`                                                                 | normal packing                                  | 🟡     |
| `premultiplyAlpha` `unpremultiplyAlpha`                                                               | (compositing)                                   | —      |
| `colorToDirection` `directionToColor` `directionToFaceDirection`                                      | (light helpers)                                 | —      |

### 1.9 Noise & procedural

| TSL                                                                                                                        | Blender counterpart                                               | Status |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| `checker(coord)`                                                                                                           | **Checker Texture**                                               | ✅     |
| `rand(coord)` `hash(coord)`                                                                                                | **White Noise**                                                   | ✅     |
| `interleavedGradientNoise`                                                                                                 | (screen-space stable noise)                                       | 🟡     |
| `triNoise3D`                                                                                                               | **Noise / Magic** (basis)                                         | 🟡     |
| `mx_unifiednoise2d/3d(noiseType, …)`                                                                                       | **Noise** (0=Perlin), **Voronoi** (2=Worley), **FBM** (3=Fractal) | ✅     |
| `mx_noise_float/vec3/vec4` `mx_worley_noise_float/vec2/vec3` `mx_cell_noise_float` `mx_fractal_noise_float/vec2/vec3/vec4` | **Noise / Voronoi** (fractal/cell variants)                       | ✅     |
| `oscSine` `oscSquare` `oscSawtooth` `oscTriangle`                                                                          | **Wave Texture** (bands)                                          | 🟡     |
| `shapeCircle` `vogelDiskSample`                                                                                            | (disk sampling)                                                   | 🟡     |

### 1.10 Ramp / remap / transform (MaterialX)

| TSL                                                                                                                                                                                                                                           | Blender counterpart                                    | Status |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------ |
| `mx_ramp4(f, c0, c1, c2, c3)` `mx_ramplr(f, c0, c1)` `mx_ramptb(f, c0, c1)`                                                                                                                                                                   | **Color Ramp** (2–4 stops)                             | ✅     |
| `mx_splitlr` `mx_splittb`                                                                                                                                                                                                                     | **Color Ramp** (step / split)                          | ✅     |
| `mx_place2d(uv, …)` `mx_transform_uv(uv, …)`                                                                                                                                                                                                  | **Mapping** (2-D)                                      | ✅     |
| `mx_rotate2d` `mx_rotate3d`                                                                                                                                                                                                                   | **Vector Rotate**                                      | ✅     |
| `mx_contrast` `mx_safepower` `mx_invert` `mx_aastep` `mx_ifequal` `mx_ifgreater` `mx_ifgreatereq` `mx_add` `mx_subtract` `mx_multiply` `mx_divide` `mx_modulo` `mx_power` `mx_separate` `mx_srgb_texture_to_lin_rec709` `mx_frame` `mx_timer` | the equivalent **Math / Color** ops (MaterialX parity) | ✅     |

### 1.11 Lighting

| TSL                                                                                                                      | Blender counterpart                                             | Status |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------ |
| `lights` `lightingContext` `directPointLight` `getDistanceAttenuation`                                                   | **Light Output** / light nodes (three lights are scene objects) | ⚠️     |
| `ambientOcclusion` `builtinAOContext`                                                                                    | **Ambient Occlusion** (approx)                                  | ⚠️     |
| `shadow` `pointShadow` `shadowPositionWorld` `getShadowMaterial` `builtinShadowContext`                                  | **Light Path** (shadow ray), shadows                            | ⚠️     |
| `lightPosition` `lightViewPosition` `lightProjectionUV` `lightShadowMatrix` `lightTargetDirection` `lightTargetPosition` | (light internals)                                               | —      |
| `reflectVector` `reflectView` `refractVector` `refractView`                                                              | **Fresnel** / **Layer Weight** / Reflection                     | 🟡     |
| `getParallaxCorrectNormal` `getShIrradianceAt` `getScreenPosition` `getViewPosition`                                     | (IBL / shading internals)                                       | —      |
| `reflector`                                                                                                              | (three's Reflector plane)                                       | —      |

### 1.12 Fog & environment

| TSL                                                                                            | Blender counterpart                          | Status |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------- | ------ |
| `fog` `densityFog` `densityFogFactor` `rangeFog` `rangeFogFactor` `exponentialHeightFogFactor` | **World** / volumetric fog (no Blender node) | —      |
| `backgroundBlurriness` `backgroundIntensity` `backgroundRotation`                              | **World Output** (Background)                | ⚠️     |

### 1.13 Tone mapping & output

| TSL                                                                                                                                                             | Blender counterpart                                   | Status |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| `toneMapping` `toneMappingExposure` `acesFilmicToneMapping` `agxToneMapping` `cineonToneMapping` `linearToneMapping` `neutralToneMapping` `reinhardToneMapping` | (renderer display transforms)                         | —      |
| `output` `outputStruct` `renderOutput` `screen`                                                                                                                 | **Material Output** (Surface)                         | ✅     |
| `depth` `depthPass` `pass` `mrt` `rtt` `toonOutlinePass`                                                                                                        | **AOV / Render passes** (via MRT), **Toon** (outline) | 🟡     |

### 1.14 Compute / GPU / utility

| TSL                                                                                                                                                                                                                                                              | Blender counterpart                    | Status |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| `compute` `computeKernel` `storage` `storageTexture(3D)` `storageBarrier` `workgroupArray` `workgroupBarrier` `workgroupId` `numWorkgroups` `globalId` `localId` `invocation*` `subgroup*` `batch` `frameGroup` `objectGroup` `renderGroup` `sharedUniformGroup` | (GPU compute — no Blender shader node) | —      |
| `builtin` `cameraIndex` `getTextureIndex` `replaceDefaultUV` `defaultBuildStages` `defaultShaderStages` `shaderStages` `OnBefore/OnObjectUpdate`                                                                                                                 | (renderer plumbing)                    | —      |

---

## 2. Blender → TSL compatibility tables

### 2.1 INPUT nodes

| Blender node                | Status | TSL mapping                                                                                                                                                                    |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Value** (Constant)        | ✅     | `float(0.5)` · animatable: `uniform(0.5)`                                                                                                                                      |
| **Integer**                 | ✅     | `int(3)`                                                                                                                                                                       |
| **Boolean**                 | ✅     | `bool(true)`                                                                                                                                                                   |
| **Color**                   | ✅     | `color(0.2, 0.5, 0.8)`                                                                                                                                                         |
| **Vector**                  | ✅     | `vec3(1, 0, 0)`                                                                                                                                                                |
| **Menu**                    | ✅     | `select(index.equal(int(0)), a, b)` / `Switch(index, {…})`                                                                                                                     |
| **Attribute**               | 🟡     | `attribute('name')`, `vertexColor()`, `bufferAttribute(attr, 'name')`                                                                                                          |
| **Ambient Occlusion**       | ⚠️     | `mat.aoNode = texture(aoMap).r` (or `ambientOcclusion`)                                                                                                                        |
| **Bevel**                   | ⚠️     | bake bevel-normals into a texture → `mat.normalNode = texture(...)`                                                                                                            |
| **Camera Data**             | ✅     | `cameraPosition`, `cameraNear/Far`, `cameraViewMatrix`, `positionViewDirection`, `viewZToOrthographicDepth`/`viewZToPerspectiveDepth`                                          |
| **Fresnel**                 | 🟡     | custom `Fn` using `pow((ior−1)/(ior+1), 2)` + `pow(1−n.z, 5)`                                                                                                                  |
| **Geometry**                | ✅     | `positionLocal/World/View`, `normalLocal/World/View`, `uv()`, `positionViewDirection`, `frontFacing`, `positionWorldDirection`, `hash(floor(positionLocal))`                   |
| **Curves Info (Hair Info)** | ❌     | no hair/curve path in r185                                                                                                                                                     |
| **Layer Weight**            | ⚠️     | Facing ≈ `pow(1 − dot(n, v), x)`; Fresnel = the `fresnel` `Fn`; Blend ≈ facing                                                                                                 |
| **Light Path**              | ❌     | renderer feature (ray type)                                                                                                                                                    |
| **Object Info**             | 🟡     | `objectPosition`, `modelWorldMatrix`, `objectScale`, `hash(objectPosition)` for Random                                                                                         |
| **Particle Info**           | ❌     | GPU particles via `instanceIndex` only                                                                                                                                         |
| **Point Info**              | ❌     | point-cloud data; not on mesh materials                                                                                                                                        |
| **Raycast**                 | ❌     | Cycles-only ray tracing                                                                                                                                                        |
| **Scene Time**              | ✅     | `time` (Seconds), `deltaTime` (Frame/Delta), `frameId`                                                                                                                         |
| **Tangent**                 | 🟡     | `tangentLocal/View/World` (UV Map mode); Radial needs custom `Fn`                                                                                                              |
| **Texture Coordinate**      | ✅     | `uv()` (UV), `positionLocal` (Object), `positionWorld` (Generated/World), `normalWorld` (Normal), `reflectView` (Reflection), `matcapUV` (Matcap), `screenCoordinate` (Window) |
| **UV Map**                  | ✅     | `uv(0)` / `uv(1)`; multi-UV `uv(i)`                                                                                                                                            |
| **Color Attribute**         | 🟡     | `vertexColor()`; named layers beyond active not addressable                                                                                                                    |
| **Volume Info**             | ❌     | no volume path                                                                                                                                                                 |
| **Wireframe**               | 🟡     | `length(fwidth(positionWorld.xy))` → threshold with `step`                                                                                                                     |

### 2.2 SHADER nodes (BSDF closures & light types)

Not translated as nodes — they drive `MeshPhysicalNodeMaterial`'s fixed PBR
lighting model. The `use*` gates (tsl.md §5) switch branches on/off.

| Blender node                                        | Status | How it maps                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Principled BSDF**                                 | ✅     | the material itself: `colorNode`/`metalnessNode`/`roughnessNode`/`emissiveNode`; `clearcoatNode`+`clearcoatRoughnessNode`; `sheenNode`+`sheenRoughnessNode`; `iridescenceNode`+`iridescenceIORNode`+`iridescenceThicknessNode`; `anisotropyNode`; `transmissionNode`+`thicknessNode`+`iorNode`+`attenuationColorNode`+`attenuationDistanceNode`; `specularIntensityNode`+`specularColorNode`+`iorNode`. **Subsurface & Alpha not fully covered.** |
| **Diffuse BSDF**                                    | ✅     | `metalnessNode = float(0)`, `colorNode`, `roughnessNode`                                                                                                                                                                                                                                                                                                                                                                                          |
| **Glossy BSDF**                                     | ✅     | `metalnessNode = float(1)`, `roughnessNode` (anisotropy ≈ `anisotropyNode`)                                                                                                                                                                                                                                                                                                                                                                       |
| **Glass BSDF**                                      | ✅     | `transmission = 1`, `ior`, `roughness` (transmissive GGX)                                                                                                                                                                                                                                                                                                                                                                                         |
| **Transparent BSDF**                                | ⚠️     | `transparent = true`, `opacityNode`; true refraction needs transmission path                                                                                                                                                                                                                                                                                                                                                                      |
| **Translucent BSDF**                                | ❌     | no translucency model in r185                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Subsurface Scattering**                           | ⚠️     | approximate with `transmission` + `thickness`, or `sheenNode`                                                                                                                                                                                                                                                                                                                                                                                     |
| **Toon BSDF**                                       | ❌     | `ToonLightingModel` exists internally but is not exposed as a material prop                                                                                                                                                                                                                                                                                                                                                                       |
| **Specular BSDF**                                   | 🟡     | `specularIntensityNode` + `specularColorNode` + `iorNode`                                                                                                                                                                                                                                                                                                                                                                                         |
| **Sheen BSDF**                                      | ✅     | `sheenNode`, `sheenRoughnessNode`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Metallic BSDF** (5.2)                             | 🟡     | `metalnessNode = float(1)` + `anisotropyNode` + `clearcoatNode`                                                                                                                                                                                                                                                                                                                                                                                   |
| **Refraction BSDF**                                 | ✅     | `transmission = 1; ior; roughness`                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Add Shader / Mix Shader**                         | ⚠️     | blend contributions inside one material: `mix(cA, cB, f)`, `mix(rA, rB, f)`, emissive via `add(...)`                                                                                                                                                                                                                                                                                                                                              |
| **Background**                                      | ⚠️     | `scene.environment` / `scene.background`; `backgroundBlurriness/Intensity/Rotation`                                                                                                                                                                                                                                                                                                                                                               |
| **Emission**                                        | ✅     | `emissiveNode = color(r,g,b).mul(float(intensity))`                                                                                                                                                                                                                                                                                                                                                                                               |
| **Volume Absorption / Scatter / Principled Volume** | ❌     | no volume shaders                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Hair BSDF / Principled Hair BSDF**                | ❌     | no hair BSDF                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Holdout**                                         | ❌     | use `maskNode` / `maskShadowNode` masking                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Ray Portal BSDF**                                 | ❌     | Cycles-only                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 2.3 DISPLACEMENT nodes

Feed `mat.positionNode` (vertex displacement — include the base position).

| Blender node            | Status | TSL mapping                                                                                                         |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| **Bump**                | ✅     | `mat.normalNode = bumpMap(texture(heightMap), strength)`                                                            |
| **Displacement**        | 🟡     | `mat.positionNode = positionLocal.add(normalLocal.mul(heightNode.sub(midlevel)))`; or classic `mat.displacementMap` |
| **Normal Map**          | ✅     | `mat.normalNode = normalMap(texture(normalTex), scale)`                                                             |
| **Vector Displacement** | 🟡     | `mat.positionNode = positionLocal.add(texture(vdispTex).xyz.mul(scale).sub(0.5))`                                   |

```ts
mat.normalNode = bumpMap(texture(height), float(0.5));
mat.normalNode = normalMap(texture(nrm), float(1.0));
mat.positionNode = positionLocal.add(
  normalLocal.mul(noiseValue.sub(0.5).mul(float(0.1))),
);
```

### 2.4 TEXTURE nodes

| Blender node            | Status | TSL mapping                                                                                                              |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Image Texture**       | ✅     | `texture(tex, uvNode?)`; `videoTexture` for video                                                                        |
| **Environment Texture** | ✅     | `texture(envTex, equirectUV(positionWorldDirection))` or `scene.environment`                                             |
| **Checker Texture**     | ✅     | `checker(coord)` → `.add(1).div(2)` or `smoothstep` for 0–1                                                              |
| **Noise Texture**       | 🟡     | `mx_unifiednoise2d(0, coord, freq, vec2(0), 1, 0, 1, false, octaves, 2, 0.5)`; FBM ≈ type `3`                            |
| **Voronoi Texture**     | 🟡     | `mx_unifiednoise2d(2, coord, freq, vec2(0), jitter, 0, 1, false, 1, 2, 0.5)`; F2/metrics via `mx_worley_noise_vec2/vec3` |
| **White Noise Texture** | ✅     | `rand(coord)` / `hash(coord)`; `interleavedGradientNoise` for stable screen-space                                        |
| **Wave Texture**        | 🟡     | `Fn` — bands `fract(sin(dot(p, vec2(d,0)) + phase))`; rings `fract(length(p − c) + phase)`; `oscSine` etc.               |
| **Brick Texture**       | ⚠️     | build from `checker` + row offset + `mix`/`select` mortar                                                                |
| **Magic Texture**       | ⚠️     | custom `Fn` (sum of `sin`/`cos` harmonics + `triNoise3D`)                                                                |
| **Gabor Texture**       | ❌     | no equivalent                                                                                                            |
| **Sky Texture**         | ⚠️     | three `Sky` object or HDR equirect as `scene.environment`; `pmremTexture` for IBL                                        |
| **Gradient Texture**    | 🟡     | Linear → `smoothstep(a,b,x)` / `mx_ramplr`; Spherical → `length(p)`; Radial → `atan(p.y,p.x)`                            |
| **IES Texture**         | ⚠️     | three loads IES into a light-falloff data texture; not a material node                                                   |

```ts
const c = checker(uv()).add(1).div(2); // Checker 0–1
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
); // FBM
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
); // Voronoi F1
const w = rand(positionWorld); // White noise 3D
```

### 2.5 COLOR nodes

| Blender node             | Status | TSL mapping                                                                                         |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| **Mix Color**            | ✅     | `mix(a, b, f)`; `blendScreen/Overlay/Dodge/Burn/Color` + `add/sub/mul/div/difference`               |
| **RGB Curves**           | ⚠️     | spline `Fn` or bake a 1-D `DataTexture` LUT: `texture(lut, vec2(f))`                                |
| **Brightness/Contrast**  | 🟡     | `cdl(c, vec3(1), vec3(0), vec3(contrast))` or `(c.sub(0.5)).mul(contrast).add(0.5).add(brightness)` |
| **Gamma**                | ✅     | `c.pow(vec3(1 / gamma))`                                                                            |
| **Hue/Saturation/Value** | ✅     | `hue(saturation(c, s), h)`; value via `mix(luminance(c), c, v)`                                     |
| **Invert Color**         | ✅     | `color(1).sub(c)`; with factor `mix(c, color(1).sub(c), f)`                                         |
| **Color Ramp**           | ✅     | `mx_ramp4(f, c0, c1, c2, c3)` or `mix` chain / LUT                                                  |
| **Blackbody**            | 🟡     | Planckian-locus `Fn` or LUT                                                                         |
| **Wavelength**           | 🟡     | colour-matching `Fn` or LUT                                                                         |
| **Light Falloff**        | ⚠️     | `getDistanceAttenuation(distance, cutoff)` / `1/distance²`                                          |
| **Combine Color**        | ✅     | `vec3(r, g, b)`; `convertColorSpace` / `sRGBTransferOETF/EOTF`                                      |
| **Separate Color**       | ✅     | `c.r/.g/.b/.a` (+ `.rgb`, `.xyz`)                                                                   |
| **RGB to BW**            | ✅     | `luminance(c)` / `grayscale(c)`                                                                     |
| **Shader To RGB**        | ❌     | EEVEE-only                                                                                          |

```ts
mat.colorNode = mix(colorA, colorB, f).clamp(vec3(0), vec3(1));
mat.colorNode = hue(saturation(c, 1.2), 0.1);
mat.colorNode = mx_ramp4(f, c0, c1, c2, c3);
mat.colorNode = c.pow(vec3(1 / 2.2));
```

### 2.6 UTILITIES → MATH nodes

| Blender node    | Status | TSL mapping                                                                                                                                           |
| --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Math**        | ✅     | **full parity** — op table below                                                                                                                      |
| **Mix**         | ✅     | `mix(a, b, f)`                                                                                                                                        |
| **Map Range**   | ✅     | Linear `remap(x, fMin, fMax, tMin, tMax)`; clamp `remapClamp(...)`; Smoothstep `smoothstep(...)` + remap; Smootherstep `smoothstepElement(...)` cubed |
| **Clamp**       | ✅     | `clamp(x, min, max)`; Min/Max via `min`/`max`                                                                                                         |
| **Float Curve** | ⚠️     | spline/LUT as **RGB Curves**                                                                                                                          |

#### Math node operation → TSL

| Blender op                         | TSL                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Add / Subtract / Multiply / Divide | `add(a,b)` `sub(a,b)` `mul(a,b)` `div(a,b)`                              |
| Multiply Add                       | `mul(a,b).add(c)`                                                        |
| Power                              | `pow(a,b)`                                                               |
| Logarithm                          | `log(a)` / `log2(a)`                                                     |
| Square Root / Inverse Square Root  | `sqrt(a)` / `inversesqrt(a)`                                             |
| Absolute                           | `abs(a)`                                                                 |
| Exponent                           | `exp(a)` / `exp2(a)`                                                     |
| Minimum / Maximum                  | `min(a,b)` / `max(a,b)`                                                  |
| Less Than / Greater Than           | `a.lessThan(b)` / `a.greaterThan(b)`                                     |
| Sign                               | `sign(a)`                                                                |
| Compare                            | `a.equal(b)`                                                             |
| Smooth Min / Smooth Max            | `Fn` using `smoothstep` on the difference                                |
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

### 2.7 UTILITIES → VECTOR nodes

| Blender node                               | Status | TSL mapping                                                                                                                 |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Combine XYZ**                            | ✅     | `vec3(x, y, z)`                                                                                                             |
| **Separate XYZ**                           | ✅     | `v.x` / `v.y` / `v.z`                                                                                                       |
| **Combine/Separate Cylindrical/Spherical** | 🟡     | coordinate-conversion `Fn`                                                                                                  |
| **Mapping**                                | ✅     | `mx_place2d(uv, …)` / `mx_transform_uv`, `uv.mul(scale).add(offset)` + `rotateUV`                                           |
| **Normal**                                 | ✅     | `normalize(v)`                                                                                                              |
| **Vector Curves**                          | ⚠️     | spline/LUT                                                                                                                  |
| **Radial Tiling**                          | 🟡     | polar `Fn` (`atan` angle, `mod` tile count)                                                                                 |
| **Vector Math**                            | ✅     | **full parity** — op table below                                                                                            |
| **Vector Rotate**                          | ✅     | `rotate(v, euler)` (Euler); `rotate(v, axis, angle)` (Axis-Angle); `mx_rotate2d/3d`                                         |
| **Vector Transform**                       | 🟡     | `transformDirection(v, 'world', 'view')`, `transformNormal(...)`, `cameraViewMatrix`, `modelWorldMatrix`, `modelViewMatrix` |

#### Vector Math node operation → TSL

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
| Snap / Floor / Ceil / Modulo / Fraction | as §2.6                                     |
| Minimum / Maximum                       | `min(a,b)` / `max(a,b)`                     |
| Wrap                                    | as §2.6                                     |
| Sine / Cosine / Tangent                 | `sin(a)` `cos(a)` `tan(a)`                  |
| Signed Power                            | `pow(abs(a), e).mul(sign(a))`               |

### 2.8 OUTPUT / WORLD / LIGHT nodes

| Blender node        | Status | TSL mapping                                                                                                                          |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Material Output** | ✅     | Surface → material channels; **Displacement** → `positionNode`; **Thickness** → `thicknessNode`; **Volume** → ❌; **AOV** → ❌       |
| **Light Output**    | ⚠️     | three lights are scene objects (`pointLight`, `directionalLight`, `spotLight`, `rectAreaLight`); `RectAreaLight` shadows unsupported |
| **World Output**    | ⚠️     | `scene.background` / `scene.environment`; `backgroundBlurriness/Intensity/Rotation`; no world volume                                 |
| **AOV Output**      | ❌     | MRT (`mrt({...})`) for post-processing, not arbitrary user AOVs                                                                      |

### 2.9 GROUP / misc nodes

| Blender node                     | Status | TSL mapping                                                           |
| -------------------------------- | ------ | --------------------------------------------------------------------- |
| **Group**                        | ✅     | `Fn(() => { …; return v; })`                                          |
| **Repeat Zone**                  | 🟡     | `Loop({ start, end, type: 'int' }, () => { … })`                      |
| **Implicit Conversion**          | ✅     | TSL auto-converts scalar→vector→matrix; `convert(x, 'vec3')` explicit |
| **Closure / Evaluate Closure**   | ❌     | no closure type in three                                              |
| **Combine/Join/Separate Bundle** | ❌     | `struct()` exists but is not a Blender bundle                         |
| **Menu Switch**                  | ✅     | `Switch(index, {…})` / `select(...)`                                  |
| **Script**                       | ❌     | Python node — no equivalent                                           |

---

## 3. TSL nodes with no Blender shader-node counterpart

These are three/TSL features that have **no Blender Shader Editor node** (usable
anyway, e.g. for post-processing or scene integration):

| TSL group          | Nodes                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tone mapping       | `toneMapping`, `acesFilmic/agx/cineon/linear/neutral/reinhardToneMapping`, `toneMappingExposure`                                                                                   |
| Fog                | `fog`, `densityFog(±Factor)`, `rangeFog(±Factor)`, `exponentialHeightFogFactor`                                                                                                    |
| Screen-space reads | `viewportTexture`, `viewportDepthTexture`, `viewportLinearDepth`, `viewportMipTexture`, `viewportOpaqueMipTexture`, `viewportUV`, `viewportSafeUV`, `screenUV`, `screenCoordinate` |
| Passes / post      | `pass`, `mrt`, `rtt`, `depthPass`, `toonOutlinePass`, `screen`, `blur`                                                                                                             |
| Compute / GPU      | `compute`, `computeKernel`, `storage`, `storageTexture(3D)`, `workgroup*`, `invocation*`, `subgroup*`, `atomic*`, `globalId`, `localId`, `numWorkgroups`                           |
| Raw shader         | `glsl`, `wgsl`, `glslFn`, `wgslFn`, `code`, `expression`, `js`                                                                                                                     |
| Object features    | `skinning`, `computeSkinning`, `morphReference`, `billboarding`, `velocity`, `reflector`, `batch`                                                                                  |
| Low-level          | `bitcast`, `packHalf2x16`, `unpackHalf2x16`, `packNormalToRGB`, `unpackRGBToNormal`, `floatBitsToInt`, `intBitsToFloat`, `premultiplyAlpha`, `unpremultiplyAlpha`                  |

---

## 4. Maximising TSL utilisation (highlights for Blender parity)

Less-obvious TSL nodes that cover Blender graphs with minimal hand-rolling:

1. **MaterialX noise bundle** — `mx_unifiednoise2d/3d` single-call covers
   **Noise (Perlin)**, **Voronoi (Worley)**, and **FBM** with detail/roughness;
   `mx_worley_noise_vec2/vec3` give F2/distance-metric outputs.
2. **Ramps in one call** — `mx_ramp4`/`mx_ramplr`/`mx_ramptb`/`mx_splitlr`/
   `mx_splittb` replace hand-built `mix` chains for **Color Ramp**.
3. **UV transforms in one call** — `mx_place2d`/`mx_transform_uv` replicate the
   **Mapping** node (translate/rotate/scale/pivot); `rotateUV` for single-angle.
4. **Triplanar** — `triplanarTexture(s)` for seamless box-mapped textures where
   Blender users reach for a Triplanar add-on.
5. **Procedural waves** — `oscSine/oscSquare/oscSawtooth/oscTriangle` build
   **Wave Texture** bands without raw `sin` plumbing.
6. **Color science** — `hue`/`saturation`/`vibrance`/`cdl`/`convertColorSpace`/
   `sRGBTransferOETF/EOTF` and `mx_hsvtorgb`/`mx_rgbtohsv` cover every
   **Color** node except curve/LUT ones.
7. **Map Range / remap** — `remap`, `remapClamp`, `range`, `pcurve`, `gain`,
   `posterize` cover every **Map Range** interpolation incl. Stepped.
8. **Displacement/normal** — `bumpMap`, `normalMap`, `mx_heighttonormal`,
   `parallaxUV`/`parallaxDirection` cover **Bump/Normal/Displacement**.
9. **Screen-space & post** — `viewportDepthTexture` + `getNormalFromDepth` +
   `linearDepth` enable depth-based effects; `pass`/`mrt`/`rtt`/`toonOutlinePass`
   for the post pipeline (`BloomRender.tsx` already uses `pass`/`mrt`/`bloom`).
10. **Shadow control** — `shadow`, `pointShadow`, `shadowPositionWorld`,
    `getShadowMaterial` for custom shadow behaviour the Blender side has no node
    for.

---

## 5. Practical translation recipe (Blender → project material)

For a typical Blender principled material:

1. **Base color** → `mat.color = albedoColor` + `mat.map = albedoTex`, or
   `mat.colorNode = texture(albedoTex).mul(tint)`.
2. **Metallic / Roughness** → `mat.metalnessNode = texture(metalMap).b`,
   `mat.roughnessNode = texture(roughMap).g` (channel conventions in tsl.md
   §8.2.3), or the classic `mat.metalness` / `mat.roughness`.
3. **Normal** → keep classic `mat.normalMap` + `mat.normalScale` (correct TBN,
   tsl.md §8.2.3); only use `mat.normalNode` when you handle the tangent-space
   transform yourself.
4. **Emission** → `mat.emissiveNode = texture(emissiveMap).mul(color(r,g,b)).mul(float(intensity))`.
5. **Transmission / IOR / Thickness / Attenuation** → the physical channels;
   any `*Node` turns the `use*` branch on (tsl.md §5).
6. **Clearcoat / Sheen / Iridescence / Anisotropy** → `clearcoatNode`,
   `sheenNode`, `iridescenceNode`, `anisotropyNode` (a `vec2`).
7. **Displacement / Bump** → `mat.positionNode` / `mat.normalNode` (§2.3).
8. **Alpha** → `mat.transparent = true; mat.opacityNode = texture(alphaMap).a`
   or `mat.alphaTestNode = float(0.5)`.

Everything value-producing in between — noise, ramps, math chains, UV
manipulation — is written as TSL expressions and assigned to the appropriate
channel.

---

## 6. Cross-reference to source docs

| Topic                                                                  | Where                                   |
| ---------------------------------------------------------------------- | --------------------------------------- |
| `MeshPhysicalNodeMaterial` internals, `*Node` inventory, override rule | `docs/tsl.md` §1–2                      |
| Build pipeline (`setup()` order)                                       | `docs/tsl.md` §3                        |
| Accessor math & map channels                                           | `docs/tsl.md` §4, table in §4.1         |
| `use*` feature gates                                                   | `docs/tsl.md` §5                        |
| Physical lighting model                                                | `docs/tsl.md` §6                        |
| TSL building blocks reference                                          | `docs/tsl.md` §7                        |
| Practical patterns & worked example                                    | `docs/tsl.md` §8                        |
| Full TSL export surface                                                | `node_modules/three/build/three.tsl.js` |
| Blender node-by-node study                                             | `docs/blender-shader-nodes.md`          |
