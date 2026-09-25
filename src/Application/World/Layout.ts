/**
 * Room staging. The desk, laptop, chair, desk props, Begu's corner and walk,
 * and the desk/monitor camera stops were all authored around a desk in the
 * middle of the room. They move together by DESK_Z so the desk sits under
 * the flag; setting this to 0 restores the original island layout.
 */
export const DESK_Z = -4650;

/**
 * Conversation pit, in room units (3300 per metre): a 0.6 m deep opening in
 * the floor, centred on the TV. `z` is its back (desk-side) edge; it runs
 * `length` toward the TV, ending in one step up. The Dune fills it wall to wall.
 */
export const PIT = { x: 0, z: 1600, width: 8000, length: 6600, drop: 1980 };
/** Back edge of the Dune, 40 units inside the pit's back wall. */
export const DUNE_AT = { x: PIT.x, z: PIT.z + 40 };
/** Muted navy wool; lighter than the old tint so the sewn panels remain legible. */
export const DUNE_COLOR = '#42546b';
