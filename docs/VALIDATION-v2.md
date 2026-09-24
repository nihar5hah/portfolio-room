# Validation — 13 September 2026

The deliverable is `/Users/niharshah/Misc/portfolio-remix`. Production preview is http://127.0.0.1:5181/; direct desktop is http://127.0.0.1:5181/desktop/. No deployment, commit, or push was performed.

## Source and content

- The working tree is a direct clone of `henryjeff/portfolio-website` at `c53c5a50183655eb83d70048403a5084f5d1214c`, with the companion desktop source from `23cf84acd5c76d2c719e1d04c3d976dc4b0b49f8` integrated under `desktop/`.
- Original model and texture bytes match upstream git objects. The original camera, scene, CSS3D screen layers, OS window system, and word game remain the foundation.
- Seven projects, two experiences, six skill groups, two complete articles, contact links, and résumé were migrated from Nihar's supplied portfolio. Professional dates and claims were preserved.
- The served résumé matches the original PDF bytes by SHA-256. Its PDF viewer was not visually inspected by the independent browser worker.
- A fresh comparison of 2,354 original-folder files found zero modifications, additions, or removals. Generated `.next`, dependencies, and git metadata were excluded. See `original-preservation.json`.

## Build checks

- `npm run build`: passed. Both room and desktop build into the same static output.
- `npm run lint`: passed (TypeScript checking).
- `npm test`: three checks passed, covering original assets, migrated content and links, and production entry assets/résumé.
- Distribution size: approximately 14 MB. Webpack retains its three performance warnings: the original 3D assets and bundles exceed its default 244 KiB recommendation. Room entry is approximately 833 KiB; desktop entry approximately 502 KiB, before transfer compression.

## Browser verification

The requested frontend-design skill guided the UI. The requested codex-computer-use skill ran an independent GPT-5.6 Sol review at high reasoning effort against the real browser, followed by a focused production recheck. The worker used an installed Playwright browser after native browser-control connection failures. All 24 screenshots from those two passes were inspected.

The initial report identified remaining Henry text in the game and a visually hidden Game Over panel exposed to accessibility tools. Both were fixed. The final recheck reports **Passed**, with zero console errors or warnings. See `independent-ui-initial.md` and `independent-ui-recheck.md`; the initial report is retained unchanged for provenance.

Verified flows:

- Welcome/loading screen, actual original 3D room, camera approach, and live CRT desktop.
- All seven project pages, both articles, Home, About, Experience, and Contact; project image, description, highlights and links.
- Search with a match, no matches, and reset to all seven projects.
- Minimize/restore, maximize/restore, close/reopen by keyboard shortcut, drag, and resize. Minimized content is removed from the accessibility tree. A final 900×700 viewport check confirmed the window fits within the viewport and above the taskbar.
- Desktop and navigation icons render at nonzero dimensions with successfully loaded images.
- Game keyboard input, BUILD win, restart, and on-screen RET submission. Hidden game panels are removed from the accessibility tree.
- 390×844 mobile projects, project detail, contact, notes, and article detail; no horizontal document overflow. Copy address displays Copied, and the copied address was verified. No email or phone action was sent.
- Reduced motion recognized: CRT videos pause, document animations stop, and monitor entry remains usable. Camera drift/steam/noise suppression was also checked in source.
- Orbit → Use computer makes the embedded portfolio clickable. Step back remains stable when moving from the screen toward the button. The shared hover handler ignores room controls.
- Forced failure of `computer_setup.glb`: clear loading failure status, disabled Enter button, and a working link to the complete desktop portfolio. Blocking and emulation were cleared afterward.
- Final room production console: no warnings or errors.

## Evidence and limits

- `screenshots/room.jpg`: final original-room render.
- `screenshots/monitor.jpg`: customized portfolio inside the original CRT.
- `screenshots/desktop.jpg`: full desktop composition.
- `screenshots/mobile-contact.png`: final independent mobile recheck, including Copied state and mail icon.
- `screenshots/word-game-win.jpg`: final personalized game result.

The 3D screen intentionally retains a physical CRT treatment; small secondary labels are clearer in Open desktop. Testing used desktop Chromium and mobile emulation, not a physical phone or a full cross-browser matrix. External project services were not authenticated or end-to-end tested. The original March 2026 résumé and historical article dates remain unchanged. The optional word game remains the original fixed-answer game, personalized to BUILD.

The implementation review retained the upstream engine and window architecture, reused their existing behavior, removed retired apps and controls, and added no custom framework or server. The runnable checks remain dependency-free Node tests.
