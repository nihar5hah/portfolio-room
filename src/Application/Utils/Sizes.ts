import EventEmitter from './EventEmitter';

export default class Sizes extends EventEmitter {
    width: number;
    height: number;
    pixelRatio: number;

    constructor() {
        super();

        // Setup
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.pixelRatio = Sizes.capRatio();

        // Resize event
        window.addEventListener('resize', () => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.pixelRatio = Sizes.capRatio();

            this.trigger('resize');
        });
    }

    // 2x DPR is 4x the fragments of 1x; the room is mostly soft plaster and
    // shadow, so 1.5 reads identically and halves fill cost. Phones (narrow)
    // get 1.25 — they're the devices that were actually stalling.
    static capRatio(): number {
        const cap = window.innerWidth < 900 ? 1.25 : 1.5;
        return Math.min(window.devicePixelRatio, cap);
    }
}
