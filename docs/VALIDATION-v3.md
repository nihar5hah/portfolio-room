# Validation — MacBook and Begu redesign, 13 September 2026

Deliverable: `/Users/niharshah/Misc/portfolio-remix`. Local production preview: http://127.0.0.1:5181/. Direct desktop: http://127.0.0.1:5181/desktop/. No deployment, commit or push was performed.

## Scope and provenance

The room is based on Henry Heffernan’s original repository at `c53c5a50183655eb83d70048403a5084f5d1214c`; the integrated desktop is based on `23cf84acd5c76d2c719e1d04c3d976dc4b0b49f8`. Camera transitions, orbit controls, CSS3D input bridge and application-window mechanics remain the foundation. The visible CRT, desk and plant have been replaced. New geometry supplies a silver laptop, rounded wooden desk, ceramic plant and clickable Begu dog; the retained chair mesh has new materials. The OS now has modern typography, traffic-light windows, a menu bar and dock.

Seven projects, two experiences, six skill groups, two complete articles, contact links and the original résumé are preserved. Project imagery and professional dates are unchanged. Original source assets remain archived for provenance, but unused CRT models and effects are no longer loaded.

A fresh comparison checked 2,354 files in `/Users/niharshah/Misc/portfolio` against the original baseline: zero changes, additions or removals. Only generated `.next`, dependency and git directories are excluded. See `original-preservation.json`.

## Begu

Clicking the actual dog mesh, its accessible label, the room’s Meet Begu button or the desktop dock opens the chat. Room actions also run the original camera approach, fitted to the MacBook. The original portfolio’s knowledge and configured Gemini model are used through a new same-origin Node API. Live questions and a follow-up returned actual provider answers, with the input enabled again afterward.

The API key is server-only in ignored `.env.local`, with owner-only permissions. Request validation, bounded context, request-size limits, per-process rate limits, missing credentials and generic upstream errors are implemented. No conversations are persisted by this application. The provider receives submitted questions. A static-only deployment would need a separate API; the included Node server runs both locally.

## Checks

The six dependency-free Node tests cover migrated content/assets/résumé and chat success, request validation, rejected origins, non-public files, missing credentials, oversized input and provider failure. Final `npm run build`, `npm run lint` and all six tests passed. Webpack retains three bundle/asset-size warnings (room entry about 842 KiB; desktop entry about 514 KiB before compression). A byte scan of all 104 distribution files found no API credential; `.env.local` permissions are 600.

## Browser review

An independent GPT-5.6 Sol worker used an installed Playwright browser after native computer-use connection failed. The primary agent also inspected and operated the app in the Codex browser. Evidence is under `.agent-artifacts/ui-tests/v3/`; initial screenshots are retained unchanged.

The first pass exercised the room/camera, Begu and real AI follow-up, all six portfolio areas, all seven project details and both notes, search, traffic-light controls, dock restore/reopen, drag/resize, mobile navigation and scrolling, contact copy feedback, keyboard focus and reduced motion.

Two defects found during visual/mobile checks were corrected: the transparent WebGL screen cutout wrote lit RGB despite zero alpha, washing out the iframe in one browser; an unused invisible resize element extended 14 pixels beyond the mobile viewport. The cutout now writes black/zero alpha, the unused element is deleted, and inactive drag/resize outlines are removed from layout. The monitor approach is closer for better readability, window-control hit targets are larger, and close/reopen no longer relies on a delayed state update.

## Limits

Testing uses desktop browsers and mobile emulation, not a physical phone or a full browser/device matrix. External project services were not authenticated or tested end to end. Résumé bytes are verified; the PDF is preserved as supplied. The original dated articles and professional timeline were intentionally retained. The optional original word game remains the fixed BUILD game. Original asset/bundle size warnings remain; no new rendering or server dependency was added. Prior CRT-version evidence is archived in `VALIDATION-v2.md` and is not evidence of this redesigned scene.

## Final primary-agent verification

- Corrected production laptop screenshots show the complete readable OS, and Begu opens on that display. All six initial and five focused-worker screenshots were visually inspected. Current copies have the `screenshots/v3-` prefix.
- Mobile Contact has `scrollWidth = clientWidth = 390` and displays Copied feedback. Begu displays a real answer after the forced-network-error/retry journey and recovers the composer.
- The focused worker sampled Escape before the final shared keyboard fix. The primary agent then verified the final production bundle: Escape changes Step back to Use computer both when a room control has focus and when Projects inside the iframe has focus; focus returns to the room control.
- Maximized window bounds at 1440×900: top 32, bottom 812, dock top 822. The window clears both the menu and dock.
- Blocking `models/World/environment.glb` produces an explicit loading failure, disabled room entry and the direct-desktop fallback. Network blocking and temporary viewport settings were removed.
- Clicking the actual visible dog mesh was also verified in the primary browser during scene integration. Its accessible label and the persistent Meet Begu button provide equivalent entry points.

The initial independent report is `independent-ui-v3-initial.md`. It is preserved unchanged, including defects corrected afterward. Final screenshots: `v3-scene.png`, `v3-laptop.png`, `v3-room-begu.png`, `v3-mobile.png`, `v3-mobile-begu.png`.

The focused independent report is preserved at `independent-ui-v3-recheck.md`. Its only failed check was Escape in the previously loaded room bundle; the two final primary checks above verified the corrected shared handler. The final network-error copy now says “Begu couldn’t connect. Check your connection and try again.” A forced blocked request in the final bundle displayed that message; Edit and try again restored the original question and enabled Send. Blocking was cleared and the desktop reloaded.

Final verdict: the requested local redesign and chat journey are implemented and verified within the device/browser limits above. Both build/typechecking and all six executable checks pass.
