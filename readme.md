# Nihar’s workspace

A personalized continuation of Henry Heffernan’s original portfolio repositories. It retains the room → desk → live screen camera journey and the original draggable/resizable application-window mechanics. The scene uses a detailed CC BY MacBook Pro M3 model with a space-black finish in a charcoal room with a walnut desk, warm lamps, matching Barcelona and Argentina Messi 10 jerseys beside the TV and a Barça flag centered behind the desk. Begu is a black-and-white animated husky. The MacBook starts closed and opens with the camera approach; its live display follows the actual hinge. The desktop is a modern workspace with traffic-light controls, a menu bar, a dock and a Finder-like portfolio.

Begu walks a clear circuit in front of the desk, looks around and pauses. Click the dog or its Begu label: he turns toward you and greets you before the camera approaches the laptop and opens a real AI conversation about Nihar. Begu also opens from the dock, including on mobile.

The original `/Users/niharshah/Misc/portfolio` remains untouched. Professional content, seven projects, two articles, dates and résumé were retained. No deployment, commit or push has been performed.

## Run

Use Node 22+ (tested with Node 26.7). Install once in this folder.

```sh
npm ci
npm run lint
npm run build
npm test
npm run preview
```

Open http://127.0.0.1:5181/ or http://127.0.0.1:5181/desktop/ . The preview serves the production build and Begu’s API on the same origin.

For editing, leave the preview/API server running and run `npm run dev` in another terminal. The development site at http://127.0.0.1:5180/ proxies `/api` to the server on port 5181.

## Begu

The server reads `GEMINI_API_KEY` from the environment. On this machine, the existing portfolio’s key was copied to this project’s ignored `.env.local` with owner-only permissions. It is never bundled into the browser, served as a static file, or printed in logs. To configure another machine, set the environment variable there; do not commit an environment file.

`server/profile-context.txt` comes from the original Begu knowledge base. `server/index.mjs` uses Google’s `generateContent` endpoint with the original `gemini-3.1-flash-lite-preview` model. It retains bounded conversation history, validates requests, limits request size and frequency, and returns clear offline/provider errors. The application does not persist conversations. The provider still processes submitted questions.

A static host alone can serve the portfolio but cannot run Begu: host this Node server or provide an equivalent same-origin `/api/chat` route. The server currently binds to localhost. Shared rate limiting and the hosting platform’s networking configuration should be chosen when deployment is requested.

## Room interactions

The room overlay keeps one control per action: the floating Begu and “Open my portfolio” labels on the objects, plus Sound, Look around and Use the Mac. Labels hide when their object is off-screen or blocked by furniture. Inside the Mac an “Open full size ↗” link opens the standalone desktop.

Objects open things: the turntable opens Music, the bookshelf opens Notes, the Messi frames open About and the Graduation rug plays Graduation. Eleven record sleeves are hidden around the room; clicking one plays its album and counts it (“Records found · n/11”, stored in the visitor’s browser). Begu sits and watches while you use the Mac and hops when a record starts. The window view follows the visitor’s local time (day, dusk, night); the room itself stays dark. The flag’s lights ease down while the Mac is in use so the crest does not compete with the screen.

Begu’s chat uses the original Gemini model and falls back to `gemini-2.5-flash` when Google reports the primary overloaded or rate limited (`MODELS` in `server/index.mjs`).

## Mobile, weather and extras

Touch devices explore the room with drag and pinch; objects open on a second tap. The lock screen and Mac menu bar show the weather in Ahmedabad and Bengaluru. The bed toggles Good night. The TV opens full screen; paste a live stream link into `MATCH_STREAM_URL` in `src/Application/config.ts` to show it during matches. Room staging lives in `src/Application/World/Layout.ts`; the TV lounge is a Pierre Paulin Dune (qasimroy's CC BY model, `static/models/Dune/`, colour `DUNE_COLOR`) sunk into a conversation pit sized to it (`PIT`, `TATAMI`); see [Dune notes](docs/DUNE-MODEL.md).

## Editing map

- `src/Application/World/Computer.ts`: imported MacBook assembly, calibrated hinge, approach animation and live-display anchor.
- `Environment.ts`, `Decor.ts`: furnished Barça den, lighting, bean bags, record cabinet, desk and dog interaction.
- `Husky.ts`: imported skeletal animation, walking route, greeting and reduced-motion behavior.
- `MonitorScreen.ts`: the original CSS3D input bridge adapted to a sharp laptop display.
- `src/Application/Camera/`: original camera/tween machinery with endpoints fitted to the new laptop.
- `desktop/src/components/os/`: desktop/window/dock controls.
- `desktop/src/components/showcase/`: portfolio pages.
- `desktop/src/components/applications/Begu.tsx`: Messages-style chat UI.
- `src/Application/World/Interactables.ts`: clickable room objects and the hidden-record hunt.
- `scripts/tuft-rug.py`: rebuilds the Graduation rug texture from `scripts/source/`.
- `desktop/src/data/`: migrated portfolio content and article bodies.
- `desktop/src/index.css`: the desktop visual system and responsive layouts.
- `server/`: server-only chatbot logic and original profile knowledge.
- `static/projects/`, `static/resume.pdf`: Nihar’s project images and original PDF.

Look Around offers a full orbit with a wider lens, constrained inside all four walls and below the ceiling. A night window and bench, media console, entry door and display cabinet furnish the other views.

The original room assets remain on disk for provenance; the CRT and old desk/plant are no longer rendered. The imported MacBook and husky use the installed GLTFLoader and Meshopt decoder. The husky is a free, stylized rigged model with smooth shading and its original geometry, not a fur simulation. Remaining objects use installed Three.js geometry/materials and real shadows, with no new modeling or rendering dependency. Sound waits for Enter, then starts the shuffled music library at 6% volume alongside soft ambience. Music contains 114 tracks across 19 albums, stored as 96 kbps AAC (`scripts/compress-audio.py`); see [audio behavior](docs/ALBUM-AUDIO.md). Direct desktop entry waits for Play in Music. Reduced-motion preferences suppress camera drift, transition duration, steam/noise animation and Begu’s movement; the chat stays accessible. The desktop uses the system font and glass styling informed by Apple’s current macOS reference, with the Catalina Night wallpaper. Narrow-screen Mac and Begu entries open the readable standalone desktop. Portfolio content adapts to its own resizable window width.

## Provenance

- Room repository: [henryjeff/portfolio-website](https://github.com/henryjeff/portfolio-website), base `c53c5a50183655eb83d70048403a5084f5d1214c`.
- Desktop repository: [henryjeff/portfolio-inner-site](https://github.com/henryjeff/portfolio-inner-site), base `23cf84acd5c76d2c719e1d04c3d976dc4b0b49f8`.
- Root git history is preserved on `codex/nihar-portfolio`. Original desktop metadata is archived at `.git/upstream-desktop-history`; desktop source is integrated normally into this workspace.
- The room MIT notice is retained. The companion desktop checkout supplies no separate license file. Original attribution is available from Portfolio menu → About this workspace. Pixel art still used by the optional original game retains its attribution.
- Self-hosted Manrope and IBM Plex Mono notices are under `static/licenses/`.

- MacBook Pro M3: jackbaeten, via Origami’s optimized GLB (CC BY 4.0). Husky: Quaternius via Poly Pizza (CC0 1.0). Dune sofa: qasimroy via Sketchfab (CC BY 4.0). The retired Shiba asset retains its original attribution. Sources, adaptation notes and license links are in [model credits](static/licenses/models.txt), with historical asset hashes in [models-v4.json](docs/models-v4.json). The Barça crest comes from the official club sprite; the framed shirt photographs come from Legacy Football Shirts (Barcelona) and Classic Football Shirts (Argentina). Original image ownership is retained.
- [Emanuele-web04/macbook-studio](https://github.com/Emanuele-web04/macbook-studio) was evaluated as requested. Its current main branch constructs an independent model in code; no geometry, code or separately licensed SF Symbols were copied from it.

See [base design](docs/DESIGN-v3.md) and [current validation](docs/VALIDATION.md).
