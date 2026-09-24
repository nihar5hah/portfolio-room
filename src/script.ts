import './style.css';
import Application from './Application/Application';
try {
    new Application();
} catch {
    document.getElementById('ui')!.innerHTML =
        '<main style="padding:10vw;font:20px system-ui"><h1>Nihar Shah</h1><p>The 3D room is unavailable in this browser.</p><a href="/desktop/">Open the complete desktop portfolio →</a></main>';
}
