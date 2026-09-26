# V17 — layout experiment, mobile, weather, Good night, TV, lighter music

September 25, 2026 (Asia/Kolkata).

- **Layout (experiment, commit `22ffd22`).** The desk, chair, MacBook, desk props, Begu's corner and walk, and the desk/monitor camera stops move together by `DESK_Z` in `World/Layout.ts` so the desk stands under the flag. The sofa lounge faces the TV in the middle of the room over the Graduation rug, with the bean bags either side. Setting `DESK_Z = 0` and `SOFA_MOVE` to zero, or reverting that commit, restores the island layout. Before/after renders: `.agent-artifacts/layout-2026-09-24/`.
- **Mobile.** Touch devices enter in orbit mode: one finger turns the room, two fingers pinch to zoom, and a slow drift runs until the first touch. Portrait screens keep the landscape horizontal field of view and start at standing eye height. Room objects and Begu act on a tap without movement (drags never open anything); on touch the first tap shows the label, the second opens it. The "Look around" toggle is hidden on touch, and the lock screen and overlay are sized for phones. Checked in the T3 browser at 430 × 932 with touch simulated; not yet on a physical phone.
- **Weather.** `/api/weather` reads Ahmedabad (home) and Bengaluru (internship) from Open-Meteo in one request, cached 15 minutes, keeping the last reading if the provider fails. Shown on the lock screen and in the Mac menu bar.
- **Good night.** Clicking the bed turns off the lamp and flag lights and lowers the room exposure; clicking again wakes it.
- **TV.** Clicking the TV opens a full-screen view of the live score/table board. `MATCH_STREAM_URL` in `src/Application/config.ts` is the slot for a live stream; it is used only while a match is in progress.
- **Music.** `scripts/compress-audio.py` re-encoded all 114 tracks to 96 kbps AAC with faststart: 444 MB → 338 MB (24% smaller), each checked for duration. Originals are in `../portfolio-audio-originals/`. Audio and hashed build files are served with a 30-day immutable cache; HTML and the playlist revalidate. Tracks still load only after Enter, one at a time.
- **Checks.** 32/32 tests, both type-checks and the build pass. Three re-encoded tracks played in the browser.

# V16 — room interactions, Messages-style Begu, desktop window model

Current state, September 24, 2026 (Asia/Kolkata). Earlier sections below are historical records and describe superseded counts (for example the 31-track library).

- **Room.** Ceiling lowered to just above the highest authored camera point, with a picture rail and dim cove line; the ceiling fan hangs from a visible down-rod and plate. The stray glow strip above the flag is now a mounted brass picture light; the flag caption is larger. The Graduation rug is a thin tufted mat with a bound edge and the complete, uncropped print (`scripts/tuft-rug.py`). The MacBook's lid-lift notch now takes the space-black finish (it rendered as a white slit).
- **Overlay.** One control per action; floating labels hide when off-screen or occluded (`Utils/Occlusion.ts`); lock screen has a darker pool behind the clock and a larger Enter; boot screen shows only the progress bar; “Open full size ↗” while using the Mac.
- **Interactions.** Turntable → Music, bookshelf → Notes, Messi frames → About, rug → plays Graduation, eleven hidden sleeves → play their album and count toward “Records found”. Begu watches while the Mac is open and hops when a record starts. The window follows local time. Flag lights ease down while the Mac is in use.
- **Desktop.** The frontmost visible window is the active one (derived in `Desktop.tsx`); closing a window activates the next; Escape closes the top window in the standalone desktop; zoomed windows have square corners; dock has a divider and Trash; the word game uses the TextEdit icon, fits its window and labels the key “ENTER”; Music fills its window. Title and status bars describe the open portfolio page. Begu is a Messages conversation with a husky avatar.
- **Music.** Broken tracks are skipped; retry appears only when every track fails. The limit is `MAX_TRACKS` (500) with a console error. Featured-artist tags are stripped from all titles. Album art loads after the room is enterable and replaces a placeholder in place.
- **Server.** Begu falls back to `gemini-2.5-flash` on 503/429 from the primary model; verified live while the primary returned 503.
- **Checks.** `npm test` 31/31 (three consecutive runs), `npm run lint` now type-checks the room **and** the desktop, `npm run build` passes with the existing size warnings. Verified in the T3 browser: Begu reply, Escape/active window, maximize corners, Music/Résumé/word game layout, lock screen, room interactions (bookshelf → Notes with Begu watching), record counter, and renders of the notch, Mac view and share image. Sound stayed muted throughout. No push or deployment.

# V15 — shuffled three-album music and synchronized physical artwork

The active music library now contains every supplied file: 13 MBDTF MP3s, 7 JACKBOYS MP3s and 11 Rodeo M4As. The supplied Rodeo folder is partial. A single manifest replaces the old MBDTF-only manifest. Every refresh creates a new Fisher–Yates shuffle across all 31 songs, and each completed queue reshuffles without an immediate repeat. The visible player identifies the current album and Shuffle mode.

The active album selects the table sleeve and photographed physical record label, with blue vinyl for JACKBOYS and black vinyl for Rodeo and MBDTF. JACKBOYS uses the original embedded cover, and its 19439732161 pressing's lime-on-black side-A label; Rodeo uses the standard sleeve and the 88875065201 pressing's orange label. Texture UV coordinates sample the original photographs. All source and ownership notes are in desktop Credits and `static/licenses/models.txt`. These are album-level physical representations, not simulated disc-side changes per digital song.

Validation on September 14, 2026 (Asia/Kolkata):

- All 20 tests and TypeScript checks pass. Tests cover per-page shuffle, complete/no-duplicate queues, no immediate repetition on reshuffle, gestures, volume, mute, retry, valid local paths, exact library-file inventory, and actual Three.js sleeve/label/color switching through all three albums and back. Existing room, camera, laptop, husky, football and server checks remain passing.
- Every new supplied file is copied byte-for-byte and passes a full FFmpeg audio decode. New audio totals 157,244,000 bytes. Original MBDTF streams retain their earlier decode verification. All 31 production URLs return exact 206 byte ranges and correct MP3/M4A MIME types.
- In-app visual checks show JACKBOYS, MBDTF and Rodeo with their corresponding sleeves, labels and pressing colors during actual playback. Screenshots are in `.agent-artifacts/v15/`. The geometry uses the existing turntable and remains in the same cabinet position.
- The built production player played all 31 distinct files and traversed every native `ended` boundary into the next shuffled round. This was an accelerated end-boundary check using seeks near the end of each file, not a complete real-time listening session. The full file decode checks cover intervening audio. The observed playback set exactly matches the manifest. See `native-shuffle-playback.json` and `production-ranges.json` in `.agent-artifacts/v15/`.
- Two fresh production loads selected different first tracks (Rodeo's 90210 and MBDTF's Monster), remained paused before Enter, and used `preload=none`; zero album-file requests occurred before the gesture. The normal playback volume remains 0.1. Temporary boundary-test mute was restored. The inspection hook is absent from the production bundle and temporary browser inspection tab was closed.
- Production build passes with the existing three Webpack size-warning categories, which also list the new full-length audio assets. No new application errors were observed; the preexisting MacBook UV-set warning remains. No dependencies were added. The original portfolio's 2,354-file fingerprint check is unchanged. No commit, push or deployment.

# Historical V13 — smaller wall art, original camera sweep and flag clearance

At Nihar's request, Astroworld and Utopia are removed from the scene and initial asset loading. The seven remaining frames are scaled uniformly to 55% of their previous dimensions, with their borders and captions preserved. The Kanye pair is centered over the record cabinet, Rodeo is centered over the sofa, Blonde/Currents are closer together above the bedside shelf, and the Drake/A$AP pair is lowered and grouped beside the window/plant corner.

The V12 half-degree idle yaw is replaced with the exact earlier horizontal/vertical sine path. It reuses the existing application clock, respects reduced motion and leaves the screen-hover and click transition handlers unchanged. A regression checks recorded positions from the earlier camera at 0, 10, 20, 40 and 60 seconds.

The flag's deepest fabric folds intersected the new slat end trim. Moving the flag and its hanging rail forward by 100 scene units clears the wood across the complete mesh. The geometry regression failed before the fix and now passes, comparing the deepest fold against the front of the slat trim.

Validation on September 14, 2026: all 19 tests and TypeScript pass; production build succeeds with the existing three size-warning categories. Production checks confirm seven requested artwork resources, no inspection global, and screen width changing from about 326 to 527 pixels on hover and back to 326 on cursor exit. In-app development inspection confirms ongoing automatic camera travel, all four smaller poster groups and the flag at close range. Evidence is in `.agent-artifacts/v13/`. The temporary inspection camera is removed before the production build. Work is confined to the separate remix; no new dependencies, commit, push or deployment.

# Historical V12 — lighting, atmosphere and album gallery

The floor lamp now uses a warm #ffb877 point light with distance falloff, an emissive linen shade and filtered shadows. Its emitter sits clear of the opaque pole, and the glowing diffuser does not incorrectly cast a solid shadow. A single cool directional key is motivated by a new high window above the right doorway. The MacBook casts a cool pool of light that fades with its lid opening. Furniture and Begu cast shadows onto the floor and rugs. Native PCF filtering permits the configured shadow radius in the installed Three.js version; no postprocessing dependency was added.

Nine original album covers are framed in four groups: Yeezus and The Life of Pablo above the record cabinet; Astroworld, Rodeo and Utopia near the lamp; Blonde and Currents above the bed; LIVE.LOVE.A$AP and Honestly, Nevermind on the opposite side wall. Nihar clarified Yeezus. The original square artwork is preserved inside consistent frames. Source links and ownership attribution are in desktop Credits and `static/licenses/models.txt`; the nine JPEGs total about 964 KiB. The existing plaster texture is reused on the walls, the slats have end/top trim, and a pointer-transparent CSS vignette darkens the corners.

The idle camera now follows a bounded half-degree yaw with a twenty-second period using the existing application clock. The click/hover/leave flow and its transition timings remain intact. Ninety-six subtle dust points drift below the lamp; reduced motion hides them and stops idle drift. The sofa cushion and bed palette move toward muted burgundy, and the duvet has a displaced surface with broad folds that taper away from the folded throw.

Validation on September 14, 2026 (Asia/Kolkata):

- All 19 tests pass, including actual Three.js checks of poster bounds/textures, the lamp/diffuser, duvet displacement, dust/reduced motion, laptop glow endpoints, and camera yaw at quarter-cycle intervals. Existing screen hover/drag/Escape, furniture, live feed, audio, server and husky checks remain passing. TypeScript passes.
- Production build succeeds with the existing three Webpack asset/entrypoint performance-warning categories. The new Currents cover also exceeds Webpack's 244 KiB individual-asset threshold. No dependency was added.
- In-app browser visual checks cover all nine covers, the bedside folds, warm lamp, slat trim, new doorway window and open MacBook glow. Screenshots are under `.agent-artifacts/v12/`. A live reduced-motion check confirms dust becomes invisible. The production page loads all nine artwork resources and contains no temporary scene-inspection global.
- The normal production journey was repeated: room click approaches the desk (screen approximately 326 px wide), hover focuses the screen (527 px), and cursor-away unfocuses it (326 px). The full album remains playing through these transitions. The sole observed warning is the preexisting MacBook custom-UV loader warning; no new application error was observed.
- A local development sample at 1280×720, device pixel ratio 2, measured 60 animation frames with median 20.3 ms and p95 24.4 ms while using the new shadow configuration. This is a short local browser sample, not a physical-phone performance claim. Close-up screenshots use a temporary inspection camera; normal navigation was separately checked in production. Browser emulation overrides were cleared and the inspection hook removed before building.
- The original portfolio's 2,354-file SHA-256 comparison remains unchanged; see `original-preservation.json`. All changes remain in the separate remix. No commit, push or deployment.

# Historical V11 — restored hover camera interaction

The pointer-leave transition removed in V10 is restored at Nihar's request. Clicking the room approaches the desk; hovering over the computer screen focuses the portfolio; moving out transitions back to the desk. The original camera positions, durations and easing remain unchanged. A drag retains focus until release, and returning to the screen cancels the pending exit. The laptop invitation and album playback remain available.

Validation on September 14, 2026: the revised actual-screen-handler regression failed before restoring hover-out and passes afterward, including repeated outside movement during a drag, returning inside and Escape. All 18 tests and TypeScript checks pass, and the production build succeeds with the existing three size-warning categories. In-app production inspection confirms the full click/hover/leave flow: the projected screen grows from approximately 325 to 526 pixels wide on focus and returns to 325 pixels on exit. Album playback continues. Changes are confined to the remix; no deployment, commit or push.

# Historical V10 — room refinements and full album playback

The suitcase is now grouped and placed clear of the bedside table. The MBDTF sleeve lies flat on the music cabinet, with its bottom on the tabletop. The Graduation rug has a 65-unit raised edge, fine irregular pile shading, fabric sheen and short fringe while preserving its original artwork.

The Match night button and its dialog are removed; the TV keeps its real scores, commentary and event locations. The room-header subtitle, “NIHAR / AFTER HOURS” and “ONE GAME. A LIFETIME.” are removed. A projected, keyboard-accessible “Open my portfolio · Projects / résumé” button points to the MacBook and uses the existing portfolio-entry action. Mouse movement no longer automatically backs out of the portfolio; Step back and Escape remain the exit controls. This fixes the shared screen-event handler for every entry path.

Nihar supplied 13 licensed MP3 tracks. Byte-identical copies total 136,100,353 bytes and 68.74 minutes; every complete stream passed an FFmpeg decode check. The native player starts after Enter at 10% volume, advances in album order, loops to track one, and exposes play/pause, next and Sound controls. Vinyl rotation follows playback and still respects reduced motion and hidden tabs. The album is excluded from the initial room asset preload and streams one track at a time. The native server now serves byte ranges and closes interrupted streams. See `ALBUM-AUDIO.md` for file placement and manifest details.

Validation on September 14, 2026 (Asia/Kolkata):

- All 18 tests and TypeScript checks pass. The production build succeeds with three size-warning categories, now also listing the supplied full-length audio assets. No dependencies were added.
- Regression checks reproduced suitcase/table intersection and unintended pointer-driven monitor exit before their fixes. The actual Three.js geometry checks sleeve/table contact, furniture clearance, rug edges and playback-driven vinyl motion. The real screen handler test checks pointer movement, dragging and Escape. Native server tests cover bounded, suffix and open-ended ranges, unsatisfiable ranges, ignored unsupported ranges and HEAD.
- Production in-app browser verification confirmed zero album file requests before Enter, then playback at volume 0.1. Every real track reached its native `ended` event and advanced to the next, including track 13 looping to Dark Fantasy. This was an accelerated boundary check using seeks near each track's end, not 69 minutes of real-time listening. The complete file decode checks cover the intervening audio. All 13 production URLs also returned correct MP3 MIME types and exact 206 byte ranges.
- The real album controls were checked for mute, next while muted and resume. Portfolio entry remained open while music played; project navigation and Escape were checked. The empty-playlist fallback was verified before the supplied files arrived. Test tones and temporary scene-inspection globals are absent from the production build.
- Visual inspection covers the flat sleeve and turntable, suitcase/table clearance, finer rug texture, opening laptop invitation, removed text and retained TV event display through normal orbit controls. Evidence is under `.agent-artifacts/v10/`, including `album-files.json` and `native-album-playback.json`. The viewport was the normal 568-pixel in-app view; this is not physical-phone audio or performance validation.
- No new application errors were observed. The existing MacBook custom-UV loader warning remains. The original portfolio's 2,354-file SHA-256 comparison is unchanged; see `original-preservation.json`. The original album files are unchanged. Work remains in the separate remix with no commit, push or deployment.

# Historical V9 — aligned match-night and music corners

The window chair is replaced by two sculpted bean bags aimed at the TV, with two gamepads on a shared table and a console below the screen. The seat silhouettes are one continuous fabric surface with seams and a settled seat hollow. Their actual world-space geometry clears the bedside rug, media cabinet and desk route.

The jersey frames flank the TV symmetrically on its centerline. Both original shirt photographs now map onto garment-shaped meshes over the same charcoal backing material; there is no rectangular photograph background or contrasting caption plate. Image-tool background-extraction requests were rejected, so no generated shirt asset is used. The 7,800-unit Barcelona flag and 9,200-unit accent light share the desk's x=-550 centerline.

The mirror is upright against the right wall, with its 5,900-unit frame centered exactly half its height above the floor. The previous floor-penetration regression was reproduced with the actual room geometry before fixing it.

A walnut turntable rests on the enlarged music cabinet. The displayed sleeve is the original MBDTF ballerina edition, sourced from On the Jungle Floor and checked against Def Jam's official 3LP product. The circular label uses the same ballerina artwork as the second disc shown in the official product photo. The record rotates clockwise at 33 1/3 rpm, with a platter, spindle, grooves, tonearm and stylus; reduced motion and hidden tabs freeze it. This is a visual turntable; album audio and a playable FIFA game are not bundled.

In-app orbit checks revealed that the old desk-sized shadow frustum clipped the bean bags' shadows. The key light now covers the full room with a 4,096-pixel shadow map, keeping comparable spatial shadow resolution across the wider area. This increases shadow-map GPU memory compared with the previous 2,048-pixel map; physical mobile performance has not been measured.

Player tracking was rechecked on September 13, 2026. [Opta Vision](https://www.statsperform.com/products/opta-vision/) documents continuous XY positions for all 22 players, but directs feed integrations to its contact team. No usable public tracking feed or authorized credentials are available to this project. The existing real ESPN scores, commentary and event-location map are retained; no simulated movement or formation positions are presented as tracking.

Validation:

- All 15 tests and TypeScript checks pass; the production build succeeds with the three existing asset/entrypoint-size warnings.
- Room checks build the actual Three.js geometry and verify mirror floor contact and upright orientation, shared jersey backing, trimmed silhouettes inside frames, symmetric TV placement, desk flag/light alignment, clear seating routes, turntable support and bounds, calibrated record speed, reduced motion and hidden-tab behavior.
- In-app browser inspection covers the actual shirt edges and backgrounds, turntable and sleeve, mirror floor contact, the desk flag, the new seating and normal production orbit controls. Evidence is in `.agent-artifacts/v9/`. Temporary scene-inspection globals were removed before the production build.
- The existing known MacBook custom-UV loader warning remains; no new application errors were observed.
- The original-folder SHA-256 comparison checked all 2,354 baseline files: no modifications, additions or removals. See `original-preservation.json`. Only the separate remix changed; no dependencies, commit, push or deployment were added.

# Historical V8 — home furnishings and live Barça match events

The Argentina shirt uses a dark slate image background and matching frame mat so its white sleeves remain legible. The Graduation rug is rectified from the supplied reference, optimized to WebP, and placed beside the bed. The generated originals are preserved outside the website; source and transformation credits are in the desktop and `static/licenses/models.txt`.

The sleeping corner, walnut headboard and wardrobe, folded linen, backpack, suitcase, working Ahmedabad bedside clock, leaning reflective mirror, patterned cream curtains, wall record, reading chair and red ambient lighting draw on Nihar's room photograph. That private photograph is not included in the website. The original Barça gallery, MacBook and Begu route remain intact.

The isolated floor triangle was a clipped shadow cast by the wall-mounted TV frame. Runtime raycasting from the affected floor location back toward the key light identified that frame. Disabling its shadow removes the triangle while retaining furniture and dog shadows. Evidence: `.agent-artifacts/v8/floor-triangle-before.png`, `floor-triangle-isolated.png`, and `floor-triangle-fixed.png`.

The match board now reads `/api/barcelona`. The native server discovers Barcelona's current/recent/next fixture across competitions, obtains the ESPN match summary, coalesces requests, caches for 20 seconds, and marks the last good result stale during provider failures. The board displays the actual score, clock, latest commentary and event coordinates. It animates a shot between provider coordinates only when a new shot event arrives; reduced motion renders the endpoint. The enlarged native dialog exposes the score and commentary as text, traps focus, closes with Escape, and links to the source.

Continuous player tracking is not supplied by this feed. SofaScore's public API request returned 403. Nihar explicitly chose to retain the accurate live event map, and the UI labels this limitation rather than presenting invented player motion.

Validation on September 13, 2026:

- Type checking and all 15 tests pass. New checks cover cross-competition match selection, score and coordinate validation, deduplication, concurrent request coalescing, cache expiry, stale data, recovery and HTTP outage states. Existing MacBook hinge, husky, camera and content tests pass. Room bounds verify the rug and bed clear each other and the floor.
- In-app browser inspection verified the bedroom, mirror, curtains, record wall, reading corner, rug, repaired floor and actual live wall display. The ESPN game page independently matched Levante 0–2 Barcelona at halftime; live commentary subsequently updated without a page reload. These are point-in-time observations, not a fixed displayed result.
- The final production build passed (three Webpack bundle/asset-size warnings remain). Production browser checks covered the black MacBook, opening/closing the native match dialog, Escape restoring focus without leaving the Mac, and real 0–2 to 0–3 score progression. Blocking only the match endpoint produced the explicit delayed/last-update state; clearing the block recovered the live feed.
- The 390-pixel CSS viewport reported no horizontal overflow and a 354-pixel dialog inside the viewport. In-app screenshot scaling under device emulation was inconsistent, so the readable narrow-layout screenshot is at the normal 568-pixel viewport; this is not a physical-phone validation. All temporary network and viewport overrides were cleared, and the development scene hook was removed before the production build.
- The existing MacBook loader emits its known unsupported-UV-set warning. No new application error was observed outside the deliberately blocked match request.
- The 2,354-file original-folder fingerprint comparison remains clean. No new dependency, commit, push or deployment was made.

## Historical V7 — aligned gallery, complete room and constrained orbit

The Barcelona and Argentina Messi 10 jerseys use matching 2800×3750 frames, shared top/bottom edges and equal 900-unit gaps. The 6000×3750 Barça flag shares that baseline and is centered on the couch. The entire display was lowered for better default framing. Other directions now contain a night window and bench, media wall/console/speakers, an entry door, a display cabinet and a plant. The four walls and ceiling enclose the set.

The previous V6 wall change hid backfaces without stopping the camera from leaving the room. A regression using the actual Camera update and installed OrbitControls reproduced a camera z position of -18,682 beyond the back wall at -6,500. Camera positions now stay inside the room with clearance from the walls, floor and ceiling; the look-at direction and transition position are synchronized after clamping. Look Around uses a wider 55-degree lens. The default room lens is 44 degrees; the MacBook close-up retains 35 degrees.

The previous coat expansion displaced 427 of the husky's vertices according to dominant bone assignment, producing visible irregular joins around its tail and body. This deformation and the extra manual tail rotation are removed. The original vertex positions and skin weights are preserved, with smooth shading and the original authored skeletal clips. Direct dog clicks suppress the compatibility mousedown, so the camera stays with the greeting before opening chat. This remains the free stylized husky, not a photorealistic model.

Validation on September 13, 2026:

- Both targeted regressions were run and failed before their fixes. Type checking, the production build and all 11 tests now pass. Tests load the actual husky GLB, execute the actual Camera/Husky classes and build the real room geometry. They cover authored mesh preservation, walking/bone movement, reduced motion, greeting events, camera bounds across orbit/zoom extremes, gallery alignment, couch centering, and furnishings in all directions. Existing MacBook, content and server checks pass.
- In-app browser verification covers the normal direct mesh click, the visible greeting followed by Begu chat, the aligned gallery, interior orbit views and responsive controls. Evidence is under `.agent-artifacts/v7/`.
- Three existing Webpack size warnings remain. Browser console checks distinguish the known MacBook UV-set loader warning from application errors. Mobile verification is browser emulation rather than physical hardware.
- The Argentina photograph comes from Classic Football Shirts; attribution is in desktop credits and `static/licenses/models.txt`. No dependency was added. Work remains in the separate remix, with no commit, push or deployment.

## Historical V6 — Nihar’s Barça den and animated husky

The current room has charcoal walls, dark wood, warm accent lighting, a sofa, coffee table, controller, technical bookshelf, football, rug, floor lamp and Begu’s bed/bowl. A real Messi 10 Barcelona shirt photograph is displayed in a frame; a folded blue/red flag uses the official club crest. Wall faces are inward-facing so orbiting behind the set no longer obscures the entire scene. The space-black MacBook and its calibrated hinge remain in place.

Begu now uses Quaternius’s CC0 husky with a rig and authored walk, idle, head-lowering and jump clips. The model has black/white markings, blue eyes, softer normals and a fuller coat/brush tail. It is intentionally stylized, not photorealistic. Begu walks a bounded circuit in front of the desk, pauses, turns smoothly, and reacts toward the visitor on click before opening chat. Reduced motion freezes ambient animation and opens chat without waiting for the greeting. Sources and ownership notes are in `static/licenses/models.txt` and desktop credits.

Validation on September 13, 2026:

- Type checking, production build and all eight tests pass. The new test loads the actual husky GLB and executes the actual controller, checking bone animation, route bounds, reduced motion and exactly one chat-opening event per greeting. Existing MacBook and server checks remain passing.
- Codex in-app browser checks cover the furnished room, full orbit, direct mesh click, greeting-to-chat transition, and a live provider response identifying Begu as a husky. The selected room control’s contrast was corrected.
- Responsive room checks use 390×844 emulation. Screenshots are under `.agent-artifacts/v6/`. These are browser checks, not physical-device tests.
- The original portfolio fingerprint check was repeated; see `original-preservation.json`. Changes are confined to the separate remix. No commit, push or deployment was performed.
- Webpack retains three bundle/asset-size warnings. The existing MacBook UV-set warning remains; no new visible defect was observed from it.

## Historical V5 — corrected hinge alignment and complete opening

The user's follow-up screenshots exposed gaps in the V4 checks. The closed shell was shifted 74.8 world units (about 10.5 mm at the model's scale) behind the chassis; its front edge was not checked previously. A farther desk camera also settled at 0.4725 openness because the desired lid angle depended on absolute camera distance.

The hinge is now calibrated to `(0, -12.11, 0.12)` in asset coordinates. The front edges differ by 0.041 world units and the back edges by 1.78; the closed display clears the key tops by 1.04 world units. The camera's desk/monitor state now starts an animation to exactly 1.0 openness, the model's authored 110-degree open pose. Camera distance no longer limits the endpoint.

`node --test tests/laptop.test.mjs` failed on both the previous front-edge alignment and far-camera opening behavior before the fix. The strengthened test verifies front/back/side alignment, key clearance, complete opening at three distances for both desk and monitor, interruption recovery and reduced motion. Build, lint and all seven tests pass. Close-up browser inspection covers closed front/side views and the open monitor and farther desk views; evidence is in `.agent-artifacts/v5/`. Changes remain in the separate remix folder.

## V4 foundation and historical checks

All implementation changes are in `/Users/niharshah/Misc/portfolio-remix`. The original portfolio remains unchanged: 2,354 baseline files checked, zero modified, added or removed (excluding `.git`, `.next` and `node_modules`). See `original-preservation.json`.

## Models and motion

The MacBook Pro M3 16-inch 2024 model is by jackbaeten, downloaded from Origami’s publicly served optimized GLB. It is CC BY 4.0, with attribution embedded in the asset and verified against the creator and Origami credits. Begu uses zixisun02’s CC BY 4.0 Shiba, obtained from the public SHIBAAA3D mirror with embedded provenance. Together they add 2,552,088 bytes. Source links, changes and license terms are in `static/licenses/models.txt`; hashes are in `models-v4.json` and credits are accessible in the desktop.

The user-supplied `Emanuele-web04/macbook-studio` repository was inspected. Its current main branch contains a procedural photographic reconstruction rather than an imported model. The downloaded M3 asset was selected for its detailed mesh and separate lid assembly; no source or separately licensed SF Symbols were copied from that repository.

The laptop starts closed. The actual lid assembly and HTML-screen anchor rotate around a calibrated hinge; the desk/monitor camera state triggers a complete opening and recovers from interrupted camera tweens. The iframe is hidden when closed and inert during movement. Reduced motion snaps the lid. The original emissive display is hidden and replaced by a black/zero-alpha WebGL cutout and the live CSS3D desktop.

Begu retains actual-mesh raycasting, an accessible label, the room button and dock entry, all connected to the existing server-side Gemini chat. The imported dog has subtle breathing, suppressed for reduced motion. Its dock/avatar artwork now matches the Shiba.

## Chair and rendering

The original chair mesh has 952 base triangles and 770 seat triangles, with no duplicate faces. The base sits above the floor. Controlled depth comparisons were captured under `.agent-artifacts/v4/chair-depth-*`. The perspective near plane was increased from 10 to 100 to improve depth resolution on thin chair parts; the original far range is retained so the room/loading views remain covered. Distant floor fog blends the ground into the background. Existing shadow casting is retained. An independent orbit check found no missing chair geometry, visible depth flicker or abnormal shadow artifacts.

A generated room reflection environment improves the metal chassis. Intensity is kept lower on the existing room materials, and imported glTF colors are not converted from sRGB a second time. The camera notch uses a dark nonreflective treatment. No new runtime dependency was installed.

## Desktop

The interface uses the native system font, translucent menu/window/dock surfaces, rounded windows, a glass sidebar selection, meaningful menu actions and an original vector wallpaper. The visual reference was Apple’s current macOS page, `https://www.apple.com/os/macos/`, including its enhanced Liquid Glass reference (macOS 27 announced for September 14, 2026; checked September 13 in India). This remains Nihar’s independent portfolio UI, not a full operating-system replica. All seven projects, two articles, experience, skills and original résumé are preserved.

## Verification

- `npm run build`, `npm run lint` and all seven tests passed. The new test loads the real compressed MacBook geometry and executes the actual Computer implementation to check closed height, chassis clearance, screen placement, full opening, interrupted closure/reopening and reduced motion.
- An independent GPT-5.6 Sol browser pass reported **Passed**, with no application errors. It checked closed/open/partial lid states, interruptions, four chair orbit angles, a real Begu answer, Escape back to the room, desktop navigation, credits, minimize/restore, 390×844 mobile overflow and controls, and reduced motion. See `independent-ui-v4.md` and `.agent-artifacts/ui-tests/v4/diagnostics.json`.
- The primary agent inspected the evidence screenshots, then verified the final production build at `http://127.0.0.1:5181/`. Final corrections after the independent pass were the dark notch, distant-floor blend, Shiba icon, preservation of the original far range, removal of a temporary development diagnostic hook, and replacement of a per-frame vector allocation with `Math.hypot`.
- The distribution credential scan covered 108 files and found no configured API key. `.env.local` remains mode 600 and server-only. No deployment, commit or push was performed.

## Limits

Testing used desktop browsers and mobile emulation, not physical phones. One existing Three.js 0.137 loader limitation remains: the MacBook material `gMtYExgrEUqPfln` asks for UV set 1 on a normal map, which that loader does not support. It emits a warning and uses the default UV; no corresponding visible defect was observed. Other messages are the decoder’s SIMD notice and development-tool information. Webpack reports the expected three asset/bundle-size warnings for this 3D site. The seven automated checks are behavior/content checks, not a cross-device rendering guarantee.

V3 evidence is preserved in `VALIDATION-v3.md`; V2 in `VALIDATION-v2.md`.

## Look Around roams the room (2026-09-26)

Look Around used to orbit a fixed point near the desk from at least 4 m away and 2.6 m up, so corners such as the kicked-off Spezials by the bean bag could not be reached. The orbit point now slides across the floor plane (right-drag or Shift-drag, arrow keys, two fingers on touch), stays inside the walls (`ROAM` in `Camera.ts`), and double-click or double-tap flies it to whatever surface is under the pointer, coming in to 5.2 m or closer. The camera may come within 1.2 m of its target and down to 0.9 m above the floor. A short hint lists the controls for nine seconds each time Look Around starts. `tests/room-camera.test.mjs` checks floor panning, the target clamp, the camera clamp from every angle, and a double-click flight to the shoes. In the browser, arrow keys walked the orbit point across to the far wall and a double-click on the shoes landed within 0.35 m of them.

Static files that keep their names when edited (models, textures, the résumé) are now served `no-cache` with an ETag, so browsers revalidate (a 304 when unchanged) instead of reusing an hour-old copy after a model is replaced. Hashed bundles and album tracks stay immutable.
