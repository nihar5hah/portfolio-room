import AudioManager from './AudioManager';
import * as THREE from 'three';
import UIEventBus from '../UI/EventBus';

export class AudioSource {
    manager: AudioManager;

    constructor(manager: AudioManager) {
        this.manager = manager;
    }

    update() {}
}
export class ComputerAudio extends AudioSource {
    lastKey: string;

    constructor(manager: AudioManager) {
        super(manager);

        document.addEventListener('mousedown', (event) => {
            // @ts-ignore
            if (event.inComputer) {
                this.manager.playAudio('mouseDown', {
                    volume: 0.16,
                });
            }
        });

        document.addEventListener('mouseup', (event) => {
            // @ts-ignore
            if (event.inComputer) {
                this.manager.playAudio('mouseUp', {
                    volume: 0.16,
                });
            }
        });

        document.addEventListener('keyup', (event) => {
            // @ts-ignore
            if (event.inComputer) {
                this.lastKey = '';
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key.includes('_AUTO_')) {
                this.manager.playAudio('ccType', {
                    volume: 0.1,
                    randDetuneScale: 0,
                    pitch: 20,
                });
                return;
            }
            if (this.lastKey === event.key) return;
            this.lastKey = event.key;

            // @ts-ignore
            if (event.inComputer) {
                this.manager.playAudio('keyboardKeydown', {
                    volume: 0.16,
                });
            }
        });
    }
}

export class AmbienceAudio extends AudioSource {
    poolKey: string;

    constructor(manager: AudioManager) {
        super(manager);
        UIEventBus.on('loadingScreenDone', () => {
            this.poolKey = this.manager.playAudio('office', {
                volume: 0.075,
                loop: true,
                randDetuneScale: 0,
                muffle: { frequency: 600 },
            });
            this.manager.playAudio('startup', {
                volume: 0.25,
                randDetuneScale: 0,
            });
        });
    }

    update() {
        const distance =
            this.manager.application.camera.instance.position.length();
        // Muffled at the Mac, open across the room (as the old cutoff sweep was).
        const muffle =
            1 - THREE.MathUtils.clamp((distance - 1500) / 9500, 0, 1);
        const volume = THREE.MathUtils.mapLinear(
            distance,
            1200,
            10000,
            0,
            0.15,
        );
        const volumeClamped = THREE.MathUtils.clamp(volume, 0.0375, 0.075);

        this.manager.setAudioMuffle(this.poolKey, muffle);
        this.manager.setAudioVolume(this.poolKey, volumeClamped);
    }
}
