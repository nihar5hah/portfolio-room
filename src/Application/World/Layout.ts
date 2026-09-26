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
 * Z-up): 16 modules, 2.79 × 2.81 m and 0.55 m to the backrest crests as
 * authored, shown at 90% (2.51 × 2.53 m). Sizes below are its bounding box
 * in room units.
 */
export const DUNE_SHRINK = 0.9;
export const DUNE_SCALE = 0.0254 * METRE * DUNE_SHRINK;
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
export const TATAMI = { depth: 2310, height: Math.round(900 * DUNE_SHRINK) };

/** The media console under the TV: its depth and centre line. */
export const MEDIA_CONSOLE = { depth: 1750, z: 17100 };

/**
 * Conversation pit sized to the Dune: 40 units of clearance on every side
 * plus the tatami. Deep enough that the backrests crest ~3 cm above the
 * floor the way pit seating does. `z` is the back (desk-side) edge; the pit
 * runs `length` toward the TV, centred on it, and its TV-side nosing meets
 * the front of the media console (its doors and handles stand 120 proud of
 * the carcass), so the seating starts right under the screen.
 */
const CLEAR = 40;
const NOSING = 150;
const CONSOLE_FRONT = MEDIA_CONSOLE.z - MEDIA_CONSOLE.depth / 2 - 120;
const PIT_LENGTH = Math.ceil(DUNE_SIZE.z + 2 * CLEAR) + TATAMI.depth;
export const PIT = {
    x: 0,
    z: CONSOLE_FRONT - 20 - NOSING - PIT_LENGTH,
    width: Math.ceil(DUNE_SIZE.x + 2 * CLEAR),
    length: PIT_LENGTH,
    drop: Math.round(DUNE_SIZE.y) - 90,
};
/** Centre of the Dune's footprint, in front of the tatami. */
export const DUNE_AT = {
    x: PIT.x,
    z: PIT.z + (PIT.length - TATAMI.depth) / 2,
};
/**
 * Re-posed Dune modules, keyed `row-col` (row 0 on the TV side, column 0 on
 * the window side; see DuneSofa.ts). As authored, the TV-side window corner
 * had an L-shaped back along the window and the screen, continuing into the
 * next module, so it rose in peaks by the TV and those seats faced away from
 * it. That pair is re-upholstered from the ensemble's own modules: the
 * window-side seat behind it (window back only), and the flat front seat,
 * so the whole front row is open seating facing the screen.
 */
export const DUNE_POSES: Record<
    string,
    { from?: string; flip?: boolean; turn?: number }
> = {
    '0-0': { from: '1-0' },
    '0-1': { from: '0-2' },
};
/** Muted navy wool, tinting the model's fabric. */
export const DUNE_COLOR = '#42546b';

/** The Graduation rug furnishes the window nook, beside the reading bench. */
export const RUG_AT = { x: -11500, z: 6200 };
