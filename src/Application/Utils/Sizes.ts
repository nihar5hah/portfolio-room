import EventEmitter from './EventEmitter';

export default class Sizes extends EventEmitter {
    width: number;
    height: number;
    pixelRatio: number;

    /** `ratio` is the pixel ratio to render at (see Quality.ts). */
    constructor(public ratio: () => number = Sizes.capRatio) {
        super();

        // Setup
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.pixelRatio = this.ratio();

        // Resize event
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.pixelRatio = this.ratio();

            this.trigger('resize');
        });
    }

    // Without a quality governor: 2x DPR is 4x the fragments of 1x; the room
    // is mostly soft plaster and shadow, so 1.5 reads identically. Phones
    // (narrow) get 1.25.
    static capRatio(): number {
        const cap = window.innerWidth < 900 ? 1.25 : 1.5;
        return Math.min(window.devicePixelRatio, cap);
    }
}
