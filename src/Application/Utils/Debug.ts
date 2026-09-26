/**
 * The lil-gui panel for `#debug`. Loaded on demand, so visitors never
 * download it (it is ~30 KB of the room bundle otherwise).
 */
export default class Debug {
    active: boolean;
    ui: { destroy(): void } | undefined;

    constructor() {
        this.active = window.location.hash === '#debug';
        if (this.active)
            void import(/* webpackChunkName: "debug" */ 'lil-gui').then(
                ({ GUI }) => (this.ui = new GUI()),
            );
    }
}
