import React, { useEffect, useRef, useState } from 'react';
import Application from '../../Application';
import bus from '../EventBus';
import { MATCH_STREAM_URL } from '../../config';

/**
 * Full-screen TV: the live stream while a match is on (once a stream URL is
 * configured), otherwise the same score/table board the room's TV shows,
 * drawn large. Escape or the close button returns to the room.
 */
export default function TvView() {
    const [open, setOpen] = useState(false);
    const canvas = useRef<HTMLCanvasElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    useEffect(() => bus.on('openTv', () => setOpen(true)), []);
    const board = open ? new Application().world?.environment?.matchBoard : undefined;
    const live = board?.data?.state === 'in';
    const stream = live && MATCH_STREAM_URL;
    useEffect(() => {
        if (!open) return;
        close.current?.focus();
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        let frame = 0;
        // Mirror the board's canvas rather than drawing a second one.
        const draw = () => {
            const target = canvas.current;
            if (target && board) target.getContext('2d')?.drawImage(board.canvas, 0, 0);
            frame = requestAnimationFrame(draw);
        };
        if (!stream) draw();
        return () => {
            window.removeEventListener('keydown', onKey);
            cancelAnimationFrame(frame);
        };
    }, [open, stream, board]);
    if (!open) return null;
    return (
        <div
            className="tv-view"
            role="dialog"
            aria-label="Match night TV"
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="tv-screen">
                {stream ? (
                    <iframe
                        src={MATCH_STREAM_URL}
                        title="Live Barça match"
                        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                        allowFullScreen
                    />
                ) : (
                    <canvas ref={canvas} width={1280} height={720} aria-hidden="true" />
                )}
            </div>
            <p className="tv-caption">
                {stream
                    ? 'Live · FC Barcelona'
                    : live
                      ? 'Live score · ESPN'
                      : 'Next match and La Liga table · ESPN'}
            </p>
            <button ref={close} className="tv-close" onClick={() => setOpen(false)}>
                Back to the room
            </button>
        </div>
    );
}
