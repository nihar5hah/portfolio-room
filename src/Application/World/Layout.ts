/**
 * Room staging. The desk, laptop, chair, desk props, Begu's corner and walk,
 * and the desk/monitor camera stops were all authored around a desk in the
 * middle of the room. They move together by DESK_Z so the desk sits under
 * the flag; setting this to 0 restores the original island layout.
 */
export const DESK_Z = -4650;

/** Back edge of the Dune; it runs 2 m toward the TV (+Z), leaving the rug clear. */
// x is offset toward the bed so the Dune never hides Begu from the main view.
export const DUNE_AT = { x: 2500, z: 1500 };
/** Muted navy wool; lighter than the old tint so the sewn panels remain legible. */
export const DUNE_COLOR = '#42546b';
