# Lived-in lounge

The floor around the pit's TV end is furnished in `src/Application/World/Lounge.ts`
(`furnishLounge`, called from `Environment.ts` after the Dune is built). The aim is
a room someone actually watches matches in: nothing on a grid, nothing mirrored
across the TV axis, every angle a little off, and the everyday mess left out.

## What is there

Window side:

- **Blue bean bag**, dragged close to the pit and twisted ~18° off the screen,
  with an oatmeal throw dragged half off its arm and pooling on the floor.
- **Side table** (Poly Haven), set crooked, with a half-drunk coffee and the
  succulent (Poly Haven); a pile of hardbacks on the floor beside it, one slid off.
- **Wicker basket** (Poly Haven, shown at 2.4× as a blanket basket), its lid
  knocked off and lying against it.

Bed side:

- **Burgundy bean bag**, pushed further back and turned in toward the sofa,
  with a chevron pillow (Poly Haven) sunk in its seat.
- **Leather ottoman** (Poly Haven) pulled up as a footrest, skewed, with a grey
  throw folded in a hurry on top; the other pillow fallen on the floor.
- A pair of **slides** kicked off (one upside down) and a mug left on the floor.

On the Dune's front row: a third pillow, tossed.

## How it is built

- `beanBagGeometry(seed, size)`: a closed lat-long shell with shared seam
  vertices, shaped into a slouch: heavy fill pooled low, a backrest pushed up
  behind an off-centre seat hollow, folds bunched around the base and radiating
  from the hollow, six panel seams pulled in, and a slight lean. The seed varies
  every bag. Crease shading and the sofa's woven fabric (`DuneSofa.ts`) at a
  tight canvas scale.
- `throwBlanket(supports, …)`: a cloth grid dropped over the listed supports by
  raycasting, limited to a steep fall off edges (as a blanket hangs), softened,
  then rumpled upward only (so nothing pokes through). Stripes are multiplied
  into the crease shading.
- `rest(object, supports, …)`: drops an object until its footprint touches the
  highest surface below; with `soft`, until its middle settles into a cushion.
  Mugs, plants, books, pillows and slides are all placed this way.
- Mugs, books and slides are small procedural meshes.

## Assets

`static/models/Lounge/lounge-props.glb` merges five CC0 Poly Haven scans
(credits in the Credits app and `static/licenses/models.txt`), 1.65 MB:
`gltf-transform merge` of the 1k glTF downloads, then `dedup`, `prune`,
`resize --width 512 --height 512` and `webp --quality 82`. Geometry is unchanged.
three r137 reads the WebP textures through `EXT_texture_webp`.

## Validation

`tests/room-camera.test.mjs` loads the shipped props (geometry only, since Node
cannot decode WebP) and checks that the bags rest on the floor and face the TV
askew, not squared up or mirrored; that every lounge item is above the floor
(or on the sofa, for its pillow), inside the walls, clear of the pit, media
console, bed and doorway; that the mug and plant stand on the side table, the
pillows sit in the bag and on the sofa seat, and the throw hangs from the bag to
the floor.
