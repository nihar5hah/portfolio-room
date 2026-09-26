/**
 * Where each app's window opens. Shared by the app and by the placeholder the
 * desktop shows while that app's code downloads, so the real window appears
 * exactly where its empty frame was.
 */
export interface WindowGeometry {
    top: number;
    left: number;
    width: number;
    height: number;
}

/** Centred above the dock, as macOS opens a document window. */
const centered = (width: number, height: number): WindowGeometry => ({
    top: Math.max(40, (innerHeight - 90 - height) / 2),
    left: Math.max(12, (innerWidth - width) / 2),
    width,
    height,
});

const GEOMETRY = {
    showcase: () =>
        centered(
            Math.min(1180, innerWidth - 120),
            // ~40px of air above the dock, like a real window left where macOS opens it.
            Math.max(420, Math.min(760, innerHeight - 120 - 30)),
        ),
    henordle: () =>
        centered(
            Math.min(560, innerWidth - 24),
            Math.min(780, innerHeight - 140),
        ),
    begu: (): WindowGeometry => ({
        top: 58,
        left: Math.max(16, innerWidth / 2 - 280),
        width: Math.min(560, innerWidth - 32),
        height: Math.min(720, innerHeight - 145),
    }),
    music: (): WindowGeometry => ({
        top: 72,
        left: Math.max(16, innerWidth / 2 - 260),
        width: Math.min(520, innerWidth - 32),
        height: Math.min(620, innerHeight - 160),
    }),
    resume: () =>
        centered(
            Math.min(1120, innerWidth - 32),
            Math.min(820, innerHeight - 130),
        ),
    credits: () =>
        centered(
            Math.min(640, innerWidth - 24),
            Math.min(620, innerHeight - 140),
        ),
};

export default GEOMETRY;
