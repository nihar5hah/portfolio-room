/** Debug tools: dev builds and `DEBUG_TOOLS=1 npm run build` only (webpack). */
declare const __DEBUG_TOOLS__: boolean | undefined;

/**
 * The lil-gui panel for `#debug` (development builds only). Loaded on demand, so visitors never
 * download it (it is ~30 KB of the room bundle otherwise).
 */
export default class Debug {
    active: boolean;
    ui: { destroy(): void } | undefined;

    constructor() {
        this.active = false;
        // A literal `if` webpack can see is false in production, so the
        // panel's chunk is not even emitted there.
        if (typeof __DEBUG_TOOLS__ !== 'undefined' && __DEBUG_TOOLS__) {
            this.active = window.location.hash === '#debug';
            if (this.active)
                void import(/* webpackChunkName: "debug" */ 'lil-gui').then(
                    ({ GUI }) => (this.ui = new GUI()),
                );
        }
    }
}
