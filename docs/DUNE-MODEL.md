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

## In the room

`DUNE_SHRINK` shows the ensemble at 90% (2.51 × 2.53 m, crests at 0.49 m).

`DuneSofa.ts` bakes the model into room-aligned space and splits it back into
its 16 modules (loose pieces grouped by grid cell), so cushions can be re-posed
individually (`DUNE_POSES` in `Layout.ts`: copy another module, mirror, or
quarter-turn). As authored, the TV-side window corner had an L-shaped back
along the window *and the screen*, running on into the next module: it rose in
peaks by the TV and those seats faced away from it. That pair is now built from
the ensemble's own modules, the window-side seat behind it and a flat front
seat, so the whole front row is open seating facing the screen.

Upholstery: a procedural plain weave (`wovenFabric`, ~11 cm tiles of 16 yarns)
gives colour variation and a normal map; the model's twill stays as the bump;
creases and seams are darkened per vertex from local concavity
(`shadeCreases`); a soft blue-grey sheen catches the edges.

## The pit

Everything is derived from the model's footprint in `Layout.ts`:

- `PIT`: the model plus 40 units of clearance per side plus the tatami, centred
  on the TV. Deep enough that the backrests crest ~3 cm above the floor. Its
  TV-side nosing meets the media console (`MEDIA_CONSOLE`), so the seating
  starts right under the screen.
- Orientation: backrests face the desk and the window; the open sides face the
  TV and the bed. The front row sits about 1.3 m from the screen.
- Build: floor boards stop at a walnut nosing; walnut walls; carpeted pit floor.
- `TATAMI`: four flat leather pads (Paulin's own Dune companion module), one
  per Dune column, at seat height along the TV side. They are the step down.
- The round table stands on a tatami pad, fully clear of the cushions, its top
  just below the floor, holding the controllers.
- The LIVE.LOVE.A$AP sleeve leans on the tatami against the window-side wall.

Around it: the Graduation rug moved to the window nook beside the reading bench
(`RUG_AT`); the bean bags flank the pit's TV end. Begu's walk ends well short
of the pit edge.

## Validation

`tests/room-camera.test.mjs` loads the shipped GLB and checks:

- no floor board spans the opening, and the carpet sits at pit depth;
- the model keeps its authored footprint lying flat, stands on the pit floor,
  crests less than 5 cm above the floor, and clears the walls and the tatami;
- backrests are on the desk and window sides, open seating on the TV and bed sides;
- the model is split into 16 square-set modules with crease shading and woven,
  normal-mapped fabric, and every front-row module is open seating;
- the table is clear of the cushions, stands on the tatami inside its footprint,
  with the controllers resting on the top;
- the rug, bean bags, bed and window are clear of the pit, and the pit meets
  the media console.

Manual WebGL checks: front three-quarter, default room view, desk-side view,
table close-up and the window nook.
