import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
// The original room listens to input from its physical CSS3D monitor.
if (window.parent !== window) {
    for (const type of [
        'mousemove',
        'mousedown',
        'mouseup',
        'pointercancel',
        'keydown',
        'keyup',
        'focusin',
    ]) {
        window.addEventListener(type, (event: MouseEvent & KeyboardEvent) =>
            window.parent.postMessage(
                {
                    type: type === 'pointercancel' ? 'mouseup' : type,
                    inComputer:
                        type.startsWith('key') ||
                        (type !== 'pointercancel' &&
                            event.clientX >= 0 &&
                            event.clientX <= innerWidth &&
                            event.clientY >= 0 &&
                            event.clientY <= innerHeight),
                    clientX: event.clientX,
                    clientY: event.clientY,
                    key: event.key,
                },
                window.location.origin,
            ),
        );
    }
}
ReactDOM.render(<App />, document.getElementById('root'));
