import React from 'react';
export interface ShutdownSequenceProps {
    numShutdowns: number;
    setShutdown: React.Dispatch<React.SetStateAction<boolean>>;
}
export default function ShutdownSequence({
    setShutdown,
}: ShutdownSequenceProps) {
    return (
        <main className="shutdown-screen">
            <span className="monogram">N.</span>
            <h1>See you around.</h1>
            <p>It’s safe to close this tab.</p>
            <button onClick={() => window.location.reload()}>
                Restart desktop
            </button>
            <a href="/" target="_top">
                Back to the room ↗
            </a>
        </main>
    );
}
