# Dune conversation pit

## The model

`static/models/Dune/dune-sofa.glb` is "Dune_sofa_ARobj" by qasimroy
([Sketchfab](https://sketchfab.com/3d-models/dune-sofa-arobj-be4fe0bcfc2e4138b63effbd3f756252),
CC BY 4.0), after Pierre Paulin's Dune ensemble (1968–72). Credits and the
licence notes are in the Credits app and `static/licenses/models.txt`.

It is 16 modules in one mesh (28,160 triangles), authored Z-up in inches:
2.79 × 2.81 m, 0.55 m to the backrest crests, seats at about 0.27–0.30 m.
A continuous backrest runs along two adjoining sides and a double-backed spine
splits the seating into two valleys. The other two sides are open seating.

Asset preparation (source files kept outside the repo):

1. Drop the flat beige base-colour texture; the fabric is tinted `DUNE_COLOR`.
2. `gltf-transform weld`, then `gltf-transform meshopt` (UVs kept for the bump).
3. The model's twill bump map becomes `fabric-bump.webp` (512 px greyscale),
   tiled ten times across the ensemble (~28 cm repeat).

The GLB is quantized. This three.js release reads normalized attributes raw in
raycasts and precise bounds, so `Environment.ts` expands them to floats on load.
Label occlusion and the tests depend on that.

## The pit

Everything is derived from the model's footprint in `Layout.ts`:

- `PIT`: the model plus 40 units of clearance per side plus the tatami, centred
  on the TV. 0.52 m deep, so the backrests crest ~3 cm above the floor.
- Orientation: backrests face the desk and the window; the open sides face the
  TV and the bed. The front row faces the TV more than 2 m from the screen.
- Build: floor boards stop at a walnut nosing; walnut walls; carpeted pit floor.
- `TATAMI`: four flat leather pads (Paulin's own Dune companion module), one
  per Dune column, at seat height along the TV side. They are the step down.
- The round table stands on a tatami pad, fully clear of the cushions, its top
  just below the floor, holding the controllers.
- The LIVE.LOVE.A$AP sleeve leans on the tatami against the window-side wall.

Around it: the Graduation rug moved to the window nook beside the reading bench
(`RUG_AT`); the bean bags flank the pit's TV end, off the ~1 m walkway to the
media console. Begu's walk ends ~0.45 m short of the pit edge.

## Validation

`tests/room-camera.test.mjs` loads the shipped GLB and checks:

- no floor board spans the opening, and the carpet sits at pit depth;
- the model keeps its authored footprint lying flat, stands on the pit floor,
  crests less than 5 cm above the floor, and clears the walls and the tatami;
- backrests are on the desk and window sides, open seating on the TV and bed sides;
- the table is clear of the cushions, stands on the tatami inside its footprint,
  with the controllers resting on the top;
- the rug, bean bags, bed and window are clear of the pit; there is a walkway to the TV.

Manual WebGL checks: front three-quarter, default room view, desk-side view,
table close-up and the window nook.
