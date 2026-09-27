# Performance

How the room and the desktop in the Mac stay smooth, from a gaming desktop
down to a budget Android phone. Measured on the previous build (`d322087`)
and this one, same machine, same camera views, night (`?time=21:00`).

## What the audit found

| Problem | Where | Cost |
| --- | --- | --- |
| 462–561 draw calls, each drawn again in the shadow pass | hundreds of separate boxes and cylinders (slats, shelves, speaker parts, record grooves) | CPU time per frame, worst on phones |
| Shadow map (2048², 551 draw calls, 530k triangles) redrawn 20 times a second, always | `Renderer.update` | a second render of the room every third frame |
| 12 lights in every lit shader, even at zero intensity | lamps, strips, picture lights, TV glow | per-pixel cost everywhere |
| A second full-screen WebGL canvas for 4.5% film grain, blended with `mix-blend-mode` | `Renderer` overlay | a whole extra context and composite |
| 4096² baked textures downloaded and decoded for nothing: every part of `environment.glb` was hidden, and `decor.glb` only showed a mug | `Environment`, `Decor` | ~1.7 MB download, ~180 MB of decoded image and GPU memory |
| All album covers and vinyl labels for every album fetched after load | `Resources` | several MB nobody sees |
| Ambience and effect sounds preloaded while sound is off | `AudioManager` | ~0.9 MB |
| The desktop app loaded in the Mac's iframe at start-up, even on phones (which open `/desktop/` directly) | `MonitorScreen` | 540 KB JS, a 954 KB wallpaper, icons, React mounting during the intro |
| Uncompressed, unsimplified models (12 MB): 112k-triangle MacBook, 49k triangles of controllers, 56k of plant leaves | `static/models` | load time, memory, triangles |
| No compression from the server; code compiled to ES5; no shared chunks; CSS not minified | `server/index.mjs`, `bundler/` | 1.6 MB of JS over the wire |
| Hover raycast on every mouse event; per-frame style writes on the Mac's screen | `Interactables`, `MonitorScreen` | main-thread work |
| Desktop app: no code splitting, framer-motion for one game, full-size images, blur on phones, re-render on every click | `desktop/` | see below |

## Before → after

| | Before | After |
| --- | --- | --- |
| Draw calls, wide view / bed view / desk | 500 / 561 / 216 | 292 / 276 / 109 |
| Shadow pass | 551 calls, 530k tris, 20×/s always | 356 calls (high) or 276 (low), only when Begu or the ball moves (low: drawn once) |
| Lights in the shader | 12 | 12 high · 7 medium · 5 low |
| WebGL contexts | 2 | 1 |
| Texture memory (estimate) | ~407 MB | ~159 MB high, less on low |
| Models | 10.4 MB + 1.7 MB unused bakes | 4.9 MB (3.8 MB Brotli) |
| Room JS over the wire | 1,089 KB uncompressed | 227 KB Brotli (room 61 + three 129 + React 37) |
| Room page, first visit (encoded bytes) | 20.9 MB | 9.6 MB before compression of models/JS |
| Desktop JS at start-up | 540 KB / 172 KB gz | 82 KB + shared React = 71 KB gz |
| Desktop images at start-up | ~1.15 MB | ~166 KB (phones ~52 KB) |

## Second audit, on the live site

Measured on www.niharshah.me (`?debug&time=21:00`, M4 MacBook, Chrome,
1280×800 at 2×), then on this build. Frame times are CPU + GPU for one
render, synchronised with a 1-pixel read-back; compare within a row.

| Problem | Where | Cost |
| --- | --- | --- |
| Shaders compiled, textures uploaded and (on Metal: Macs, iPhones) GPU pipelines built the first time something came into view | three.js prepares only what is on screen | first look at the lounge: 5 shaders, a 456 ms freeze on an M4; the orbit start and doorway 80–95 ms |
| 4× MSAA on top of a 1.75× resolution on Retina screens | high tier | 8.3 ms a frame vs 6.8 ms at a sharper native 2× without it; ~75 MB of multisample buffers |
| Models and textures (4.4 MB) revalidated on every visit | Vercel default for unhashed files | ~35 conditional requests before a returning visitor sees the room |
| Album covers, record labels and the Messi shirt as JPEG | `room/` | 3.2 MB (11 covers load with the room) |
| 1024² colour and normal maps on a palm-sized football | `Football/brazuca.glb` | 424 KB file, 11 MB of GPU memory |
| MacBook: 60 parts, a draw call each (and again in the shadow pass) | `Computer.ts` | the most draw calls of anything in view |

| | Before | After |
| --- | --- | --- |
| New shaders when turning to the lounge / TV | 5 | 0 (all 49 compiled while loading) |
| First frame looking at the lounge, doorway, orbit start | 456 / 95 / 83 ms | 27 / 15 / 15 ms (steady state 10–13 ms) |
| Retina high tier | 1.75× + MSAA, 8.3 ms | 2× native, 6.8 ms |
| Draw calls: loading view / desk / lounge / doorway | 266 / 163 / 211 / 274 | 233 / 112 / 144 / 225 |
| MacBook draw calls | 60 | 38 |
| Returning visit: model and texture requests | ~35 revalidations | 0 (cached, `immutable`) |
| Album art + labels + shirt | 3.2 MB JPEG | 1.7 MB WebP |
| Football | 424 KB, 11 MB GPU | 229 KB, 2.8 MB GPU |

## How it works

### Quality tiers and the governor (`src/Application/Utils/Quality.ts`)

`detectTier` picks a starting tier from what the device reports: WebGL 2,
data saver, device memory, CPU cores, touch/screen size and the GPU name
(SwiftShader, older Mali/Adreno/PowerVR and Intel HD are low; other phones
and integrated GPUs medium; the rest high).

| | high | medium | low |
| --- | --- | --- | --- |
| Antialiasing | yes | desktop only | no |
| Pixel ratio (start / floor) | ≤1.75 (1.5 phones) / 0.85 | ≤1.35 (1.25 phones) / 0.75 | ≤1 / 0.6 |
| Shadow map | 2048, redrawn ≤30×/s while things move | 1024, ≤15×/s | 1024, drawn once; Begu gets a contact shadow |
| Practical lights | all | fan, TV, floor and desk lamps | fan and floor lamp (the rest keep glowing; their light goes to the sky fill) |
| Small shadow casters (< 5–8 cm) | yes | no | no |
| Clearcoat/sheen materials | yes | yes | plain PBR |
| Textures | full | full | ≤ 512 px, no anisotropy |
| Dust motes, fast rain beads | yes | yes | no |
| Desktop in the Mac | preloaded when idle | preloaded on desktops | on demand |

The governor watches the median frame time in 2-second windows once the
intro has settled. Under ~50 fps it lowers the resolution in steps (bigger
steps the further behind); at the floor it drops a tier. Above ~58 fps for
three windows it raises the resolution again, never past the tier's
start. Changes that recompile shaders (how many lights run, materials) are
only made at start-up: a mid-visit recompile froze the room for 1.6 s on a
fast Mac. Later drops trade resolution, shadow updates, casters and effects.

`?quality=low|medium|high` forces a tier (the resolution still adapts).
`document.documentElement.dataset.quality` shows the tier in use.

### Rendering (`src/Application/Renderer.ts`)

- The shadow map is redrawn only when something under the key light
  changes (`World.shadowsChanged`: Begu's position, heading, pose and clip,
  the ball; the curtains, the MacBook lid and the gold record on every tier).
- Seated at the Mac, the room behind the screen is drawn at a quarter of
  the frame rate; the CSS3D screen is skipped while the lid is shut.
- There is no film grain any more: it was a second full-screen WebGL canvas
  redrawing noise every frame, then briefly a CSS noise layer, and is gone.
- A lost WebGL context (memory pressure on phones) pauses drawing and
  redraws the shadows when it is restored.
- `warmUp()` runs once the room is built, behind the loading screen: it
  compiles every material, then draws the whole scene once with frustum
  culling off (and the shadow pass), which uploads the textures and, on
  Metal, builds the GPU pipelines that compiling alone does not. Nothing
  compiles or uploads when the visitor looks around.
- Retina laptops and monitors (2×, not phones) render at their own density
  without MSAA on the high and medium tiers: sharper and cheaper than a
  lower resolution with MSAA. Phones keep MSAA, which their tiled GPUs
  resolve on-chip.
- The MacBook's parts are merged by material (`mergeModel` in
  `StaticBatch.ts`): the base into the model's root, the lid into its
  hinge, so it still opens. Same-material see-through parts merge too: one
  colour blends the same in any order.

### Fewer draw calls (`src/Application/Utils/StaticBatch.ts`)

After the room is built, each group's unnamed pieces that share a material
and shadow flags are merged into one mesh in that group's space: 331
pieces become 63. Groups keep their names, bounds and transforms, so moving
groups still move and clicks still land on the right object. Named,
skinned, transparent, multi-material, mirrored and custom-raycast meshes are
never merged.

### Loading

- Models: `scripts/optimize-models.mjs` welds, simplifies the heavy ones,
  resizes textures to WebP and Meshopt-compresses them. `Utils/Dequantize.ts`
  expands quantized attributes to floats on load (raycasts, bounds and
  Begu's floor plan read them). Props whose geometry is reused without its
  node keep float positions.
- The unused `environment.glb` and its bake are no longer loaded; the coffee
  mug has its own 512 px texture (`scripts/crop-coffee-mug.mjs`).
- Album art: only what is on screen (the room's sleeves, the record on the
  turntable) is fetched, decoded off the main thread; other covers load
  when their album plays.
- Sound: nothing is fetched until the visitor turns sound on.
- The desktop iframe loads when the visitor heads for the Mac (the lid
  starting to open, an app link), or when the room is idle on capable
  devices; never on phones.
- `/api/weather` is fetched once for the lock screen and the window.
- Caching: models and room textures are requested as `path?v=<hash>`
  (`Utils/assetUrl.ts`; the hashes are computed by the build in
  `bundler/webpack.common.js`). `vercel.json` caches those URLs for a year
  (`immutable`); a changed file gets a new hash. Unversioned requests keep
  revalidating.
- Album covers, record labels and the Messi shirt ship as WebP (45%
  smaller); their JPEG originals stay in `static/` as sources for the
  desktop's thumbnails and are left out of `dist/`.

### Build and server

- `bundler/webpack.common.js`: modern JS (no ES5), three.js from source for
  tree shaking, React and three.js in their own long-cached chunks, hashed
  asset names, unused static files (old bakes, videos, spare models) left
  out of `dist/`. `webpack.prod.js` minifies CSS.
- `scripts/compress-dist.mjs` (part of `npm run build`) writes Brotli and
  gzip copies; `server/index.mjs` serves the best one the browser accepts
  (whole-file requests; byte ranges use the original), with `Vary`.
  Browsers only send `br` over HTTPS, so locally you will see gzip.

### Desktop app (`desktop/`)

- Apps load on demand (`lazyApp`), with a matching placeholder window and a
  retry on failure; hovering a dock icon preloads it. framer-motion is gone
  (the word game uses the Web Animations API).
- WebP wallpaper sized to the screen, 128 px dock icons, 96/264 px album
  thumbnails in Music (`desktop/scripts/optimize-images.mjs`).
- Window state transitions return the same object when nothing changes,
  apps are memoised: a click on the front window renders nothing.
- No backdrop blur on phones and touch screens; window dragging uses
  transforms once per frame; mouse moves to the room are posted once per
  frame; the clock and weather pause while hidden.

## Checking

- `tests/performance.test.mjs`: tier detection, tier settings (Retina
  without MSAA), the governor, forced tiers and static batching.
- `tests/asset-caching.test.mjs`: content-hashed URLs, every loaded file
  exists and is hashed, the year-long cache rule, the warm-up's textures.
- `tests/laptop.test.mjs`: the merged MacBook matches the original's shape
  closed and open, in a fraction of the draw calls.
- `tests/media-serving.test.mjs`: compressed serving.
- `tests/audio-mix.test.mjs`, `tests/entry-resilience.test.mjs`: deferred
  sound and album art.
- In the browser, `?debug` shows an FPS meter and exposes `__app`
  (`__app.quality`, `__app.renderer.instance.info`, `__app.world.batching`).

## Next steps, if needed

- The Graduation Bear (245 KB) downloads with the room though it only
  appears once every record is found; loading it later means repeating the
  room's colour, merge and quality passes for it.
- The bed and suitcase are built from separate copies of identical
  materials, so their pieces never merge; sharing those materials would
  save ~30 more draw calls.
- KTX2/Basis textures would cut GPU memory further (needs the transcoder).
- A deploy removes the previous build's chunks (`output.clean`); a tab left
  open across a deploy gets a "Try again" window for apps it had not opened
  yet. Keeping the previous chunks for a day would avoid that.
- iOS Low Power Mode caps frames at 30; the governor reads that as slow
  and lowers the resolution, which is harmless but not needed.
