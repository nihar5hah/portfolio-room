import React, { useEffect, useRef } from 'react';
import Button from './Button';
import { WindowGeometry } from '../applications/geometry';

export interface WindowPlaceholderProps {
    title: string;
    geometry: () => WindowGeometry;
    active: boolean;
    onInteract: () => void;
    onClose: () => void;
    onMinimize: () => void;
    /** Set when the app failed to open: offer a retry instead of waiting. */
    onRetry?: () => void;
}

/**
 * The window frame shown while an app's code downloads (or if it can't), with
 * the same chrome and position as the app's own window. It is replaced by the
 * real window as soon as the code arrives, usually within a frame or two.
 */
export default function WindowPlaceholder(props: WindowPlaceholderProps) {
    const { title, onRetry } = props;
    const frame = useRef<HTMLDivElement>(null);
    // Take focus like a real window does, so opening order stays the same.
    useEffect(() => {
        if (window.parent === window || document.hasFocus())
            frame.current?.focus();
    }, []);
    return (
        <div onMouseDown={props.onInteract} onFocus={props.onInteract}>
            <div
                className="os-window"
                role="region"
                tabIndex={-1}
                aria-label={title}
                aria-busy={!onRetry}
                data-active={props.active}
                data-maximized={false}
                style={{ position: 'absolute', ...props.geometry() }}
                ref={frame}
            >
                <header className="os-titlebar">
                    <div className="traffic-lights">
                        <Button icon="close" onClick={props.onClose} />
                        <Button icon="minimize" onClick={props.onMinimize} />
                        <Button icon="maximize" />
                    </div>
                    <span className="showcase-header">{title}</span>
                </header>
                <div className="window-content window-pending">
                    {onRetry && (
                        <div role="alert">
                            <p>{title} couldn’t open.</p>
                            <button type="button" onClick={onRetry}>
                                Try again
                            </button>
                        </div>
                    )}
                </div>
                <footer className="window-status">
                    <span>
                        {onRetry
                            ? 'Check your connection and try again'
                            : 'Opening…'}
                    </span>
                </footer>
            </div>
        </div>
    );
}

interface AppErrorBoundaryProps {
    fallback: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Keeps one app's failure (a chunk that can't download, or a render error)
 * inside its own window instead of blanking the whole desktop. Remount it with
 * a new key to try again.
 */
export class AppErrorBoundary extends React.Component<
    AppErrorBoundaryProps,
    { failed: boolean }
> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}
