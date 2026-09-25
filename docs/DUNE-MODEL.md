# Dune upholstery reconstruction

## Reference and fidelity

Reference: [Paulin, Paulin, Paulin — Ensemble Dune](https://paulinpaulinpaulin.com/en/designs/ensemble-dune-2/).
The official yellow ensemble photographs by Adrien Dirand and the installation
photographs were inspected for silhouette, panel construction and table placement.
Reference photography is not included in the application or repository.

This is an authored, photo-referenced recreation, not a manufacturer model or a
verified dimensionally identical replica. The official page offers dimensions on
request; the dimensions below are estimates chosen for this room. No downloadable
third-party mesh, extracted viewer asset or scanned fabric was used.

## Replacement of the earlier model

The earlier smooth-max heightfield made isolated pyramid peaks and omitted the
front-centre seat for a large wooden block. That is not the construction visible
in the references. It has been removed entirely.

- Six nearly touching upholstered modules fill a three-by-two rectangular layout.
- Back modules have level crests and low, recessed seat junctions.
- Corner modules turn the raised edge along the outside of the ensemble.
- Every top is four explicitly tessellated triangular fabric panels. Padding
  smoothly swells inside each triangle and compresses at its diagonal seams.
- Padding has finite, zero slope at the panel seam. No fractional-power singularity
  or collapsed corner triangles are used.
- Closed shells include softly rolled upper edges, full-height outer skirts and
  rounded bottom hems. Internal joins have shallower rolls than exposed edges.
- Muted navy wool replaces the previous bright blue, high-sheen surface. A seeded
  128-pixel procedural weave provides repeatable colour and micro-bump variation.
- A thin, warm-white circular table sits above the low upholstery at a four-module
  junction. Its slender stem uses the joint, not a hole cut through a cushion.

## Room integration

The Dune is sunk into a conversation pit (`PIT` in `Layout.ts`): built-in seating
in a depressed section of floor, the setting Dune ensembles are often shown in.
Scale is 3300 room units per metre.

- Modules are 0.8 m, so the ensemble is 2.4 × 1.6 m; back height 0.70 m, front
  rim 0.30 m, unchanged.
- The pit is 0.6 m deep, centred on the TV, and filled wall to wall. The backrests
  crest ~10 cm above the floor, like cushions overflowing the pit.
- The floor boards stop at a walnut nosing around the opening. Below it: walnut
  walls, a carpeted pit floor, and one walnut step on the TV side at seat height.
- The Duneside-style table (0.48 m, 0.53 m high) stays just below the floor,
  holding the controllers.
- The rug and bean bags sit between the pit and the TV. The LIVE.LOVE.A$AP
  sleeve leans on the pit step. Begu's walk stays on the boards, clear of the edge.

## Validation

- `tests/dune.test.mjs`: module layout/control profiles; fully closed, consistently
  wound meshes; positive volume; no collapsed triangles or non-finite attributes;
  unit normals; grounded hems; bounded triangle count; deterministic filtered wool.
- `tests/room-camera.test.mjs`: no floor board spans the pit opening; carpet at
  pit depth; six nonintersecting blocks on the pit floor, inside the pit; crest
  just above the floor; step clears the seats at half depth; Begu and bed/rug/TV
  clearance; thin tabletop at the shared junction, below floor level.
- Manual WebGL render checks: front three-quarter, default room view, rear/side,
  close upholstery/table view. These are canvas render exports, not OS screenshots.
- Full room/desktop type checks, test suite and production build must pass.

`Dune.ts` owns the model and fabric texture; `Environment.ts` assembles furniture
and table; `Layout.ts` owns placement and colour. No new dependency or downloaded
model payload is required, but generated geometry still has a runtime cost.
