import React from 'react';
import Window from '../os/Window';

export default function Resume(props: WindowAppProps) {
    const width = Math.min(1120, innerWidth - 32);
    const height = Math.min(820, innerHeight - 130);
    return (
        <Window
            top={Math.max(40, (innerHeight - 90 - height) / 2)}
            left={Math.max(12, (innerWidth - width) / 2)}
            width={width}
            height={height}
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
