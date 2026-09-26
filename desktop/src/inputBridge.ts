/**
 * Inside the room, the desktop forwards its pointer and key input to the
 * parent page, which moves the camera and plays the Mac's click sounds.
 * Pointer moves are coalesced to one message per animation frame carrying the
 * latest position; every other event is sent at once, after any pending move,
 * so the parent always sees events in the order they happened.
 */
export type BridgeEventType =
    | 'mousemove'
    | 'mousedown'
    | 'mouseup'
    | 'pointercancel'
    | 'keydown'
    | 'keyup'
    | 'focusin';

export const BRIDGED_EVENTS: BridgeEventType[] = [
    'mousemove',
    'mousedown',
    'mouseup',
    'pointercancel',
    'keydown',
    'keyup',
    'focusin',
];

export interface BridgeMessage {
    type: Exclude<BridgeEventType, 'pointercancel'>;
    inComputer: boolean;
    clientX?: number;
    clientY?: number;
    key?: string;
}

interface InputLike {
    clientX?: number;
    clientY?: number;
    key?: string;
}

/** The message for one event; the viewport decides whether the pointer is on the screen. */
export function toMessage(
    type: BridgeEventType,
    event: InputLike,
    viewport: { width: number; height: number },
): BridgeMessage {
    const { clientX, clientY, key } = event;
    return {
        type: type === 'pointercancel' ? 'mouseup' : type,
        inComputer:
            type.startsWith('key') ||
            (type !== 'pointercancel' &&
                clientX! >= 0 &&
                clientX! <= viewport.width &&
                clientY! >= 0 &&
                clientY! <= viewport.height),
        clientX,
        clientY,
        key,
    };
}

export interface BridgeOptions {
    post: (message: BridgeMessage) => void;
    viewport: () => { width: number; height: number };
    schedule: (callback: () => void) => number;
    cancel: (handle: number) => void;
}

export function createInputBridge({
    post,
    viewport,
    schedule,
    cancel,
}: BridgeOptions) {
    let pending: BridgeMessage | undefined;
    let frame: number | undefined;
    /** Sends the waiting move now, if there is one. */
    const flush = () => {
        if (frame !== undefined) cancel(frame);
        frame = undefined;
        const move = pending;
        pending = undefined;
        if (move) post(move);
    };
    return {
        flush,
        handle(type: BridgeEventType, event: InputLike) {
            const message = toMessage(type, event, viewport());
            if (message.type === 'mousemove') {
                pending = message;
                frame ??= schedule(() => {
                    frame = undefined;
                    flush();
                });
                return;
            }
            flush();
            post(message);
        },
    };
}
