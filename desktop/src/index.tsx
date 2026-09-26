import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import { applyTheme, initialTheme } from './hooks/useTheme';
import { BRIDGED_EVENTS, createInputBridge } from './inputBridge';

// Before first paint, so a dark-mode visitor never sees a light flash.
applyTheme(initialTheme());
// The original room listens to input from its physical CSS3D monitor.
if (window.parent !== window) {
    // Inside the room this page is drawn on a 3D-transformed laptop screen;
    // index.css drops effects that Chrome renders with seams there.
    document.documentElement.dataset.embedded = 'room';
    // At most one mousemove per frame reaches the room; clicks and keys go at once.
    const bridge = createInputBridge({
        post: (message) =>
            window.parent.postMessage(message, window.location.origin),
        viewport: () => ({ width: innerWidth, height: innerHeight }),
        schedule: (callback) => requestAnimationFrame(callback),
        cancel: (handle) => cancelAnimationFrame(handle),
    });
    for (const type of BRIDGED_EVENTS)
        window.addEventListener(type, (event) =>
            bridge.handle(type, event as MouseEvent & KeyboardEvent),
        );
}
ReactDOM.render(<App />, document.getElementById('root'));
