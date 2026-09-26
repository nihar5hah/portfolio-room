import React, { memo } from 'react';
import Window from '../os/Window';
import GEOMETRY from './geometry';

function Resume(props: WindowAppProps) {
    return (
        <Window
            {...GEOMETRY.resume()}
            windowTitle="Résumé — Nihar Shah"
            windowBarIcon="resume"
            closeWindow={props.onClose}
            minimizeWindow={props.onMinimize}
            onInteract={props.onInteract}
            active={props.active}
            bottomLeftText="Résumé"
        >
            <section className="resume-viewer" aria-label="Résumé preview">
                <div className="resume-toolbar">
                    <span>Nihar-Shah-Resume.pdf</span>
                    <a href="/resume.pdf" download="Nihar-Shah-Resume.pdf">
                        Download PDF <span aria-hidden="true">↓</span>
                    </a>
                </div>
                <iframe
                    className="resume-document"
                    src="/resume-preview.html"
                    title="Nihar Shah’s résumé"
                />
            </section>
        </Window>
    );
}

export default memo(Resume);
