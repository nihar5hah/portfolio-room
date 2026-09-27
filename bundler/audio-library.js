const library = require('../config/audio-library.json');
const manifest = require('../static/audio/playlist.json');

const origin = new URL(library.origin);
if (origin.protocol !== 'https:' || origin.origin !== library.origin) {
    throw new Error('Audio library origin must be a bare HTTPS origin');
}

function validateTrack(track) {
    if (
        !track ||
        typeof track.title !== 'string' ||
        !track.title.trim() ||
        typeof track.album !== 'string' ||
        !/^[a-z0-9_-]+$/.test(track.album) ||
        typeof track.src !== 'string' ||
        track.preview ||
        !new RegExp(
            `^/audio/${track.album}/[a-z0-9][a-z0-9._-]*\\.(m4a|mp3|ogg|wav|flac)$`,
            'i',
        ).test(track.src) ||
        track.album === 'previews'
    ) {
        throw new Error('Playlist entries must point to full album tracks');
    }
    return track;
}

/** The playlist never depends on a build machine's private local music files. */
function hostedPlaylist(content) {
    const list = JSON.parse(content.toString());
    if (!Array.isArray(list.tracks) || !list.tracks.length)
        throw new Error('The full-song playlist is empty');
    list.tracks = list.tracks.map((track) => ({
        ...validateTrack(track),
        src: new URL(track.src, origin).href,
    }));
    if (
        new Set(list.tracks.map((track) => track.src)).size !==
        list.tracks.length
    )
        throw new Error('The full-song playlist contains duplicate tracks');
    return JSON.stringify(list);
}

// Music is deployed independently. The site ships neither full-track copies
// nor obsolete clips, even when those files happen to exist on a developer's Mac.
const audioCopyIgnores = [
    '**/audio/previews/**',
    ...new Set(
        manifest.tracks.map((track) => {
            validateTrack(track);
            return `**/audio/${track.album}/**`;
        }),
    ),
];

module.exports = { hostedPlaylist, audioCopyIgnores, validateTrack };
