# Local shuffled music library

The active `static/audio/playlist.json` contains 114 user-supplied tracks across 19 albums. These are curated selections, not a claim that every album is complete. Each track has a title, an album key from `AlbumAudio.ALBUMS`, and a same-origin media path, for example:

```json
{ "title": "POWER", "album": "mbdtf", "src": "/audio/mbdtf/03-power.mp3" }
```

Each page fetches the manifest with a ten-second timeout and shuffles across the complete library. Every song plays once per queue, then a fresh shuffle avoids immediately repeating the last song. There is no persisted queue. Validation rejects empty or malformed libraries, and libraries above `MAX_TRACKS` (500, in `AlbumAudio.ts`) with a console error naming the limit; failures show a retry action rather than an indefinite loading state. A missing or undecodable track is skipped automatically; only when every track fails in a row does playback stop and offer retry. Clicking a hidden record sleeve or the Graduation rug in the room jumps to that album.

Sound waits for Enter. Music starts at 6% native media volume (previously 5%); the office ambience ranges from 3.75% to 7.5% volume as the camera moves (previously 5% to 10%). The startup cue uses 25% volume (previously 30%). Click and typing feedback uses 16% volume. At most four non-looping effects overlap; each finished effect releases its player. These are volume settings, not perceived-loudness measurements.

Every room sound plays on a native `<audio>` element, the same path as the music; the room creates no Web Audio `AudioContext`. The earlier Three.js/Web Audio graph retuned a live lowpass filter from the camera each frame, which could run away into a loud continuous screech and silence the music. The "muffled at the Mac" effect is now `static/audio/atmosphere/office-muffled.mp3`, a pre-rendered 600 Hz lowpass of `office.mp3` with an identical decoded length (22.0735 s), crossfaded against the plain loop by element volume. Regenerate it with `ffmpeg -i office.mp3 -af "lowpass=f=600:p=2" -c:a libmp3lame -b:a 128k office-muffled.mp3`. If the browser pauses media in a hidden, frozen or back/forward-cached page, the ambience and music resume when the page returns, unless the visitor chose Sound off or paused the music.

Entering while the manifest is loading still enables sound. Music starts once available, unless the visitor has since muted it. A browser playback rejection leaves Play available. The standalone desktop lazily creates the same player when Music opens and waits for Play. Closing Music preserves playback; play/pause, Next and room Sound controls stay synchronized.

The album folders under `static/audio/` are ignored by git (about 434 MB of personal media); only the room's sound effects and `playlist.json` are versioned. A fresh clone therefore shows the library as unavailable until the media is copied in, and a public deployment needs a separate, smaller licensed set.

Audio preloading is disabled and one track streams at a time. MP3 and M4A files use native playback and server byte-range support. Reduced motion stops the record's rotation without stopping music.

The active album selects the table sleeve, record label and disc color. MBDTF, JACKBOYS and Rodeo retain the sourced pressing artwork; additional labels are adapted from album covers. They are album-level representations, not a simulation of record side changes. Artwork and model provenance remain in `static/licenses/models.txt` and desktop Credits.

Run `npm test`, `npm run lint` and `npm run build` after changes. Tests cover shuffle conservation, boundary repetition, gestures, mute/retry, delayed library loading, destination validation, exact file inventory, synchronized materials, the absence of any `AudioContext`, the camera-driven ambience crossfade, bounded repeated input with player release, resumption after browser-initiated pauses, and 100 laptop open/close cycles without interrupting music or ambience. Previous metadata/range verification did not represent a full listening or full decode audit of the current 114-track library.
