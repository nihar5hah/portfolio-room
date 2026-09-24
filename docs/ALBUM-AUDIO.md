# Local shuffled music library

The active `static/audio/playlist.json` contains 114 user-supplied tracks across 19 albums. These are curated selections, not a claim that every album is complete. Each track has a title, an album key from `AlbumAudio.ALBUMS`, and a same-origin media path, for example:

```json
{ "title": "POWER", "album": "mbdtf", "src": "/audio/mbdtf/03-power.mp3" }
```

Each page fetches the manifest with a ten-second timeout and shuffles across the complete library. Every song plays once per queue, then a fresh shuffle avoids immediately repeating the last song. There is no persisted queue. Validation rejects empty or malformed libraries and more than 128 tracks; failures show a retry action rather than an indefinite loading state.

Sound waits for Enter. Music starts at 6% native media volume (previously 5%); the office ambience ranges from 3.75% to 7.5% gain as the camera moves (previously 5% to 10%). The startup cue uses 25% gain (previously 30%). Effects receive their initial gain before playback, avoiding a full-volume first instant. Click and typing feedback uses 16% gain without spatial panners. At most four non-looping effects overlap; finished source, panner and gain nodes all disconnect. These are gain settings, not perceived-loudness measurements.

Entering while the manifest is loading still enables sound. Music starts once available, unless the visitor has since muted it. A browser playback rejection leaves Play available. The standalone desktop lazily creates the same player when Music opens and waits for Play. Closing Music preserves playback; play/pause, Next and room Sound controls stay synchronized.

The album folders under `static/audio/` are ignored by git (about 434 MB of personal media); only the room's sound effects and `playlist.json` are versioned. A fresh clone therefore shows the library as unavailable until the media is copied in, and a public deployment needs a separate, smaller licensed set.

Audio preloading is disabled and one track streams at a time. MP3 and M4A files use native playback and server byte-range support. Reduced motion stops the record's rotation without stopping music.

The active album selects the table sleeve, record label and disc color. MBDTF, JACKBOYS and Rodeo retain the sourced pressing artwork; additional labels are adapted from album covers. They are album-level representations, not a simulation of record side changes. Artwork and model provenance remain in `static/licenses/models.txt` and desktop Credits.

Run `npm test`, `npm run lint` and `npm run build` after changes. Tests cover shuffle conservation, boundary repetition, gestures, mute/retry, delayed library loading, destination validation, exact file inventory, synchronized materials, initial effect gain, bounded repeated input and complete audio-node cleanup. Previous metadata/range verification did not represent a full listening or full decode audit of the current 114-track library.
