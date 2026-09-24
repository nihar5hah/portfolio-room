Status: **Passed** — 0 failed, 0 blocked, 1 non-blocking application warning.

- Closed room: lid fully closed (`openness=0`), Apple logo visible, detailed Shiba model present.
- Opening: hinge progressed `0.257 → 0.841 → 0.985 → 1.0`. Screen stayed attached to the lid without visible floating, flicker, or washout. Final alignment, keyboard, speakers, and chassis looked correct.
- Interruption: `Step back` during approach recovered to the normal desk state; re-entry reached fully open with no stranded lid.
- Chair: seat, back, pedestal, and five-leg base remained present across orbit angles. No visible depth flicker or abnormal shadow artifacts.
- Begu: returned a real project answer covering KalExam, OpenClaw, Mission Control, VoiceServe, healthcare voice AI, HireAI, and FaceAttend. Escape returned focus/camera to the room.
- Desktop: glass menubar, dock, and window styling rendered correctly. Home/Projects navigation, minimize/restore, and About credits all worked.
- Mobile: `390×844`, document width exactly `390`; no horizontal overflow. Window and dock controls were usable.
- Reduced motion: started closed and snapped from `openness=0` to `1` within the first 60 ms sample—no continuous lid animation.

Console:

- Application errors: none.
- Application warning: `THREE.GLTFLoader: Custom UV set 1 for texture normalMap not yet supported.` No corresponding visible defect was observed.
- Environmental/development messages: meshopt experimental SIMD notice, webpack dev-server status, and React DevTools suggestion.

Core evidence: [closed.png](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/closed.png>), [open.png](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/open.png>), [chair.png](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/chair.png>), [begu.png](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/begu.png>), [desktop.png](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/desktop.png>), [mobile.png](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/mobile.png>), [reduced.png](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/reduced.png>).

Transition frames: [200 ms](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/transition-200ms.png>), [500 ms](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/transition-500ms.png>), [1000 ms](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/transition-1000ms.png>), [3000 ms](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/transition-3000ms.png>). Measurements are recorded in [diagnostics.json](</Users/niharshah/Misc/portfolio-remix/.agent-artifacts/ui-tests/v4/diagnostics.json>).

No source or deployment files were changed.