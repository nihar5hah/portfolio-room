# Lived-in lounge

The floor around the pit's TV end is furnished in `src/Application/World/Lounge.ts`
(`furnishLounge`, called from `Environment.ts` after the Dune is built). The aim is
a room someone actually watches matches in: nothing on a grid, nothing mirrored
across the TV axis, every angle a little off, and the everyday mess left out.

## What is there

Window side:

- **Blue bean bag**, dragged close to the pit and twisted ~18° off the screen,
  left uncovered (the oversized throw was removed).
- **Side table** (Poly Haven), set crooked, with a half-drunk coffee and the
  succulent (Poly Haven); a pile of hardbacks on the floor beside it, one slid off.
- **Wicker basket** (Poly Haven, shown at 2.4× as a blanket basket), its lid
  knocked off and lying against it.

Bed side:

- **Burgundy bean bag**, pushed further back and turned in toward the sofa,
  with a chevron pillow (Poly Haven) sunk in its seat.
- **Leather ottoman** (Poly Haven) pulled up as a footrest, skewed, with a grey
  throw folded in a hurry on top; the other pillow fallen on the floor.
- A pair of **adidas Handball Spezials** in Night Indigo kicked off (one rolled
  onto its side) and a mug left on the floor.

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
  Mugs, plants, books, pillows and shoes are all placed this way.
- Mugs and books are small procedural meshes.
- The Spezials are a CC BY 4.0 photoscan (Tigertigertiger, Sketchfab) of the red
  and gum colourway. Its base-colour texture was recoloured to Night Indigo /
  Cream White (IF7087): each texel is classed softly as suede, white leather,
  gum or gold by hue and saturation, laces, tongue label, heel tab and lining are
  told apart by their 3D position on the shoe, and each class is re-tinted in
  linear light to the colour measured from the IF7087 product photo, keeping
  the scan's brightness variation (nap, creases, stitching, serrations). The
  scan is a right shoe; the left is it mirrored, lying on its outer side so the
  mirrored lettering faces the floor. The scan's outsole was captured as a
  blotchy, half-lit patch, so the downward-facing texels below 12 mm are
  repainted as dark rubber with a herringbone tread and pivot circle, with a
  flat normal and even occlusion there. `static/models/Spezial/spezial-night-indigo.glb`
  (690 KB): welded, simplified to ~11k triangles, 1024 px WebP textures.

## Assets

`static/models/Lounge/lounge-props.glb` merges six CC0 Poly Haven scans (the
five lounge props plus the pit's Modern Coffee Table 01; credits in the Credits
app and `static/licenses/models.txt`), 1.84 MB:
`gltf-transform merge` of the 1k glTF downloads, then `dedup`, `prune`,
`resize --width 512 --height 512` and `webp --quality 82`. Geometry is unchanged.
three r137 reads the WebP textures through `EXT_texture_webp`.

## Validation

`tests/room-camera.test.mjs` loads the shipped props (geometry only, since Node
cannot decode WebP) and checks that the bags rest on the floor and face the TV
askew, not squared up or mirrored; that every lounge item is above the floor
(or on the sofa, for its pillow), inside the walls, clear of the pit, media
console, bed and doorway; that the mug and plant stand on the side table, the
pillows sit in the bag and on the sofa seat, the blue bean bag remains uncovered,
and the small ottoman throw remains.
