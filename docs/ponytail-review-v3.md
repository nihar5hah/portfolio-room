# Focused implementation review

MonitorScreen.ts:L276: delete: obsolete CRT texture, video, enclosure and dimming helpers. The LCD only needs the retained CSS3D plane and event bridge.
sources.ts:L3: delete: unused CRT computer model and screen-effect loads. Keep their source assets archived for provenance.
Window.tsx: delete: nested retro bevel wrappers. Keep the original window state, dragging, resizing and taskbar behavior under the new chrome.

Applied during this pass. The companion API uses Node HTTP and fetch with no added runtime dependency. Provider success, unavailable configuration, validation, oversized requests and errors have executable Node checks.

net: -0 lines possible after these deletions.
