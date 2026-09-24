/**
 * Room staging. The desk, laptop, chair, desk props, Begu's corner and walk,
 * and the desk/monitor camera stops were all authored around a desk in the
 * middle of the room. They move together by DESK_Z so the desk sits under
 * the flag; setting this to 0 restores the original island layout.
 */
export const DESK_Z = -4650;


/** Where the imported corner sofa stands, facing the TV (+Z). */
export const SOFA_AT = { x: 0, z: 6800, turn: 0 };
