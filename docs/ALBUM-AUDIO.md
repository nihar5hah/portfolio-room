# Full-song shuffled music library

The active `static/audio/playlist.json` contains 114 user-supplied full tracks across 19 albums. These are curated selections, not a claim that every album is complete. Each source entry has a title, an album key from `AlbumAudio.ALBUMS`, and a canonical media path, for example:

```json
{ "title": "Power", "album": "mbdtf", "src": "/audio/mbdtf/03-power.m4a" }
```

The build always converts these paths into absolute URLs at the HTTPS origin in `config/audio-library.json`: `https://portfolio-room-audio.vercel.app`. It does not check whether a build machine has the private audio files. There is no preview selection, truncation, or snippet fallback. The player accepts only canonical full-track paths from this configured host or the page's own origin; it rejects arbitrary remote origins, credentials, traversal and preview paths.

Each page fetches the manifest with a ten-second timeout and shuffles across the complete library. Every song plays once per queue, then a fresh shuffle avoids immediately repeating the last song. There is no persisted queue. Validation rejects empty or malformed libraries, and libraries above `MAX_TRACKS` (500, in `AlbumAudio.ts`) with a console error naming the limit; failures show a retry action rather than an indefinite loading state. A missing or undecodable track is skipped automatically; only when every track fails in a row does playback stop and offer retry. Clicking a hidden record sleeve or the Graduation rug in the room jumps to that album.

Sound waits for Enter. Music starts at 6% native media volume (previously 5%); the office ambience ranges from 3.75% to 7.5% volume as the camera moves (previously 5% to 10%). The startup cue uses 25% volume (previously 30%). Click and typing feedback uses 16% volume. At most four non-looping effects overlap; each finished effect releases its player. These are volume settings, not perceived-loudness measurements.

iPhone and iPad Safari ignore element volume: before, everything there played at 100%, including music meant for 6%, and the ambience crossfade and rain fade did nothing. `Audio/Volume.ts` detects this (a set volume that does not read back) and, only on such browsers, plays each element through one plain Web Audio gain node, so the same levels apply. It adds gain only: no filters, nothing retuned per frame. The context starts suspended (silent) until the first tap. The music element requests CORS (`crossOrigin = "anonymous"`; the audio host sends `Access-Control-Allow-Origin: *`), without which the gain path would play silence. A known trade-off on iOS: Safari suspends Web Audio when the phone locks, so the music stops there instead of continuing, and resumes when the page returns or on the next tap.

Every other browser sets `volume` directly and creates no `AudioContext`: every room sound plays on a native `<audio>` element, the same path as the music. The earlier Three.js/Web Audio graph retuned a live lowpass filter from the camera each frame, which could run away into a loud continuous screech and silence the music. The "muffled at the Mac" effect is now `static/audio/atmosphere/office-muffled.mp3`, a pre-rendered 600 Hz lowpass of `office.mp3` with an identical decoded length (22.0735 s), crossfaded against the plain loop by element volume. Regenerate it with `ffmpeg -i office.mp3 -af "lowpass=f=600:p=2" -c:a libmp3lame -b:a 128k office-muffled.mp3`. If the browser pauses media in a hidden, frozen or back/forward-cached page, the ambience and music resume when the page returns, unless the visitor chose Sound off or paused the music.

Entering while the manifest is loading still enables sound. Music starts once available, unless the visitor has since muted it. A browser playback rejection leaves Play available. The standalone desktop lazily creates the same player when Music opens and waits for Play. Closing Music preserves playback; play/pause, Next and room Sound controls stay synchronized.

The full album folders under `static/audio/` are ignored by Git (about 322 MiB of audio). Only the room's sound effects, the playlist, and hosting configuration are versioned. The main site's build excludes both full-track binaries and any obsolete snippets. Audio lives in the separate `portfolio-room-audio` Vercel project, which is not Git-connected, so deploying the website cannot overwrite its library. Fresh clones and GitHub deployments use the same full-song URLs.

Audio preloading is disabled and one track streams at a time. MP3 and M4A files use native playback and server byte-range support. Reduced motion stops the record's rotation without stopping music.

The active album selects the table sleeve, record label and disc color. MBDTF, JACKBOYS and Rodeo retain the sourced pressing artwork; additional labels are adapted from album covers. They are album-level representations, not a simulation of record side changes. Artwork and model provenance remain in `static/licenses/models.txt` and desktop Credits.

Run `npm test`, `npm run lint` and `npm run build` after changes. Tests cover shuffle conservation, boundary repetition, gestures, mute/retry, delayed library loading, trusted destination validation, manifest inventory, synchronized materials, the absence of any `AudioContext`, the camera-driven ambience crossfade, bounded repeated input with player release, resumption after browser-initiated pauses, and 100 laptop open/close cycles without interrupting music or ambience. Build integration tests exercise the actual copy rules with and without local audio: both must produce the same full-song playlist and neither may ship clips or full-track copies. Local-file inventory checks run when the private album directories exist; normal CI needs no private media.

## Independent audio deployment

The website (`portfolio-room`, Git-connected) and library (`portfolio-room-audio`, not Git-connected) deploy independently. The current library was verified anonymously: all 114 media responses have the expected full-file byte lengths, and representative beginning/end range requests return exact HTTP 206 bytes. CORS permits playback from the website, local development and preview domains. Files are not marked immutable because their paths are not content-hashed; cache lifetime is one hour. No sign-in or automation-bypass token is required to access the production audio origin.

To update the library from the private local originals:

```sh
npm run build:audio
vercel link --yes --project portfolio-room-audio --scope his-projects-e8fc753c --cwd .agent-artifacts/audio-host
npx --yes vercel@60.1.3 deploy --prebuilt --prod --yes --cwd .agent-artifacts/audio-host
```

`build:audio` prepares a static Build Output API deployment under the Git-ignored `.agent-artifacts/audio-host/`. It fails if any full-track source is missing and copies only files listed in the manifest, never snippets, code, or credentials. This is a manual library-maintenance command, not part of normal website CI. Keep the project's stable production alias in `config/audio-library.json`, not an expiring preview or a specific deployment URL. If the alias changes, update that config and redeploy the website too.

When adding a song, upload it to the audio host **before** pushing the playlist/client changes to GitHub. Keep existing published paths when replacing a library deployment so visitors with older site builds still have working tracks. Keep private backups of the originals: the Git repository is intentionally not an audio backup. Independent hosting still consumes the account's normal storage and transfer allowances.

## Full songs only

The obsolete tracked clips and preview-generation script were removed. Ordinary GitHub pushes now deploy the full-song playlist without requiring audio files in Git. If the audio host is unavailable, the player uses its existing failure/retry behavior; it never switches to a 30-second clip. Removing or replacing the library later is an explicit change to its deployment and playlist/configuration, not an automatic side effect of a website rebuild.
