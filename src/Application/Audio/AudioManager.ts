import AlbumAudio from './AlbumAudio';

/**
 * Music is the room's only audio output. Keep it independent of Three and the
 * camera: opening/closing the laptop must not create or automate audio nodes.
 * The former ambience/effects graph and its restart watchdog are intentionally
 * removed after repeated runaway-audio reports.
 */
export default class AudioManager {
    readonly album = new AlbumAudio();
}
