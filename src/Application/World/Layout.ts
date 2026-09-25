/**
 * Room staging. The desk, laptop, chair, desk props, Begu's corner and walk,
 * and the desk/monitor camera stops were all authored around a desk in the
 * middle of the room. They move together by DESK_Z so the desk sits under
 * the flag; setting this to 0 restores the original island layout.
 */
export const DESK_Z = -4650;

/** Room units per metre. */
export const METRE = 3300;

/**
 * The Dune ensemble (static/models/Dune/dune-sofa.glb, authored in inches,
 * Z-up): 16 modules, 2.79 × 2.81 m and 0.55 m to the backrest crests.
 * Sizes below are its bounding box in room units.
 */
export const DUNE_SCALE = 0.0254 * METRE;
export const DUNE_SIZE = {
    x: 109.683 * DUNE_SCALE,
    z: 110.438 * DUNE_SCALE,
    y: 21.517 * DUNE_SCALE,
};

/**
 * Leather tatami: the flat Dune module Paulin paired with the ensemble. Here
 * it lines the pit's TV side at seat height, as the step down and as the
 * surface the round table stands on.
 */
export const TATAMI = { depth: 2310, height: 900 };

/**
 * Conversation pit sized to the Dune: 40 units of clearance on every side
 * plus the tatami. 0.52 m deep, so the backrests crest ~3 cm above the floor
 * the way pit seating does. `z` is the back (desk-side) edge; the pit runs
 * `length` toward the TV, centred on it. Begu's walk ends ~0.45 m short of it.
 */
const CLEAR = 40;
export const PIT = {
    x: 0,
    z: 1250,
    width: Math.ceil(DUNE_SIZE.x + 2 * CLEAR),
    length: Math.ceil(DUNE_SIZE.z + 2 * CLEAR) + TATAMI.depth,
    drop: 1716,
};
/** Centre of the Dune's footprint, in front of the tatami. */
export const DUNE_AT = {
    x: PIT.x,
    z: PIT.z + (PIT.length - TATAMI.depth) / 2,
};
/** Muted navy wool, tinting the model's fabric. */
export const DUNE_COLOR = '#42546b';

/** The Graduation rug furnishes the window nook, beside the reading bench. */
export const RUG_AT = { x: -11500, z: 6200 };
