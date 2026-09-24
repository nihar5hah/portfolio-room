import React, { useEffect, useRef, useState } from 'react';
import { IconName } from '../../assets/icons';
import Button from './Button';

export interface WindowProps {
    closeWindow: () => void;
    minimizeWindow: () => void;
    onInteract: () => void;
    width: number;
    height: number;
    top: number;
    left: number;
    windowTitle?: string;
    bottomLeftText?: string;
    rainbow?: boolean;
    windowBarColor?: string;
    windowBarIcon?: IconName;
    onWidthChange?: (width: number) => void;
    active?: boolean;
    onHeightChange?: (height: number) => void;
}

const Window: React.FC<WindowProps> = (props) => {
    const windowRef = useRef<any>(null);
    const contentRef = useRef<any>(null);

    const dragProps = useRef<{
        dragStartX: any;
        dragStartY: any;
    }>();

    const [top, setTop] = useState(props.top);
    const [left, setLeft] = useState(props.left);

    const [width, setWidth] = useState(props.width);
    const [height, setHeight] = useState(props.height);

    const [contentWidth, setContentWidth] = useState(props.width);
    const [contentHeight, setContentHeight] = useState(props.height);

    const windowActive = props.active ?? true;

    const [isMaximized, setIsMaximized] = useState(false);
    const [preMaxSize, setPreMaxSize] = useState({
        width,
        height,
        top,
        left,
    });

    useEffect(() => {
        if (window.parent === window || document.hasFocus())
            windowRef.current?.focus();
    }, []);
    // The size the window wants: the app's default, or the last size the visitor
    // dragged it to. Fitting always starts from this, so a window squeezed by a
    // narrow viewport grows back when space returns instead of staying compact.
    const preferred = useRef({ width, height });
    useEffect(() => {
        const fit = () => {
            const availableWidth = Math.max(300, window.innerWidth - 24);
            const availableHeight = Math.max(220, window.innerHeight - 130);
            const nextWidth = isMaximized
                ? window.innerWidth
                : Math.min(Math.max(preferred.current.width, 520), availableWidth);
            const nextHeight = isMaximized
                ? window.innerHeight - 120
                : Math.min(preferred.current.height, availableHeight);
            setWidth(nextWidth);
            setHeight(nextHeight);
            setLeft((current) =>
                isMaximized
                    ? 0
                    : Math.max(6, Math.min(current, window.innerWidth - nextWidth - 6)),
            );
            setTop((current) =>
                isMaximized
                    ? 32
                    : Math.max(
                          6,
                          Math.min(current, window.innerHeight - nextHeight - 44),
                      ),
            );
        };
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [isMaximized]);
    // The window itself follows the cursor: geometry is written straight to the
    // node during the gesture and committed to state on release, so a drag never
    // re-renders the contents. top/left/width/height stay frozen meanwhile, which
    // keeps every delta below anchored to where the gesture started.
    const gesture = useRef<'drag' | 'resize' | null>(null);
    const capture = useRef<{ element: HTMLDivElement; id: number }>();
    const startGesture = (
        event: React.PointerEvent<HTMLDivElement>,
        mode: 'drag' | 'resize',
    ) => {
        if (event.button !== 0 || gesture.current) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        capture.current = { element: event.currentTarget, id: event.pointerId };
        gesture.current = mode;
        dragProps.current = {
            dragStartX: event.clientX,
            dragStartY: event.clientY,
        };
    };

    const stopGesture = () => {
        if (!gesture.current) return;
        const resized = gesture.current === 'resize';
        gesture.current = null;
        const style = windowRef.current.style;
        if (resized)
            preferred.current = {
                width: parseFloat(style.width),
                height: parseFloat(style.height),
            };
        setLeft(parseFloat(style.left));
        setTop(parseFloat(style.top));
        setWidth(parseFloat(style.width));
        setHeight(parseFloat(style.height));
        const held = capture.current;
        capture.current = undefined;
        if (held?.element.hasPointerCapture(held.id))
            held.element.releasePointerCapture(held.id);
    };

    const moveGesture = (event: PointerEvent) => {
        if (!gesture.current || event.pointerId !== capture.current?.id) return;
        if (!(event.buttons & 1)) return stopGesture();
        const { clientX, clientY } = event;
        if (gesture.current === 'drag') {
            const { x, y } = getXYFromDragProps(clientX, clientY);
            windowRef.current.style.left = `${x}px`;
            windowRef.current.style.top = `${y}px`;
        } else {
            const curWidth = Math.min(
                window.innerWidth - left - 6,
                Math.max(520, clientX - left),
            );
            const curHeight = Math.min(
                window.innerHeight - top - 90,
                Math.max(220, clientY - top),
            );
            windowRef.current.style.width = `${curWidth}px`;
            windowRef.current.style.height = `${curHeight}px`;
        }
    };

    useEffect(() => {
        // A transformed iframe can lose native capture. Observe release in its
        // same-origin parent too; a cross-origin embed has no accessible frameElement.
        const targets = new Set([
            window,
            window.frameElement ? window.parent : window,
        ]);
        const blur = () => {
            if ([...targets].every((target) => !target.document.hasFocus()))
                stopGesture();
        };
        window.addEventListener('pointermove', moveGesture);
        for (const target of targets) {
            target.addEventListener('pointerup', stopGesture);
            target.addEventListener('pointercancel', stopGesture);
            target.addEventListener('blur', blur);
        }
        return () => {
            window.removeEventListener('pointermove', moveGesture);
            for (const target of targets) {
                target.removeEventListener('pointerup', stopGesture);
                target.removeEventListener('pointercancel', stopGesture);
                target.removeEventListener('blur', blur);
            }
        };
    }, [top, left, width, height]);

    const getXYFromDragProps = (
        clientX: number,
        clientY: number,
    ): { x: number; y: number } => {
        if (!dragProps.current) return { x: 0, y: 0 };
        const { dragStartX, dragStartY } = dragProps.current;

        const x = Math.max(
            0,
            Math.min(
                window.innerWidth - width - 6,
                clientX - dragStartX + left,
            ),
        );
        const y = Math.max(
            32,
            Math.min(
                window.innerHeight - height - 90,
                clientY - dragStartY + top,
            ),
        );

        return { x, y };
    };

    useEffect(() => {
        props.onWidthChange && props.onWidthChange(contentWidth);
    }, [props.onWidthChange, contentWidth]); // eslint-disable-line

    useEffect(() => {
        props.onHeightChange && props.onHeightChange(contentHeight);
    }, [props.onHeightChange, contentHeight]); // eslint-disable-line

    useEffect(() => {
        setContentWidth(contentRef.current.getBoundingClientRect().width);
    }, [width]);

    useEffect(() => {
        setContentHeight(contentRef.current.getBoundingClientRect().height);
    }, [height]);

    const maximize = () => {
        if (isMaximized) {
            setWidth(preMaxSize.width);
            setHeight(preMaxSize.height);
            setTop(preMaxSize.top);
            setLeft(preMaxSize.left);
            setIsMaximized(false);
        } else {
            setPreMaxSize({
                width,
                height,
                top,
                left,
            });
            setWidth(window.innerWidth);
            setHeight(window.innerHeight - 120);
            setTop(32);
            setLeft(0);
            setIsMaximized(true);
        }
    };


    const onWindowInteract = () => {
        props.onInteract();
    };

    return (
        <div onMouseDown={onWindowInteract} onFocus={onWindowInteract}>
            <div
                className="os-window"
                role="region"
                tabIndex={-1}
                data-active={windowActive}
                data-maximized={isMaximized}
                aria-label={props.windowTitle}
                style={{ position: 'absolute', width, height, top, left }}
                ref={windowRef}
            >
                <header className="os-titlebar">
                    <div
                        className="window-drag-handle"
                        onPointerDown={(event) => startGesture(event, 'drag')}
                        onLostPointerCapture={stopGesture}
                    />
                    <div className="traffic-lights">
                        <Button icon="close" onClick={props.closeWindow} />
                        <Button
                            icon="minimize"
                            onClick={props.minimizeWindow}
                        />
                        <Button icon="maximize" onClick={maximize} />
                    </div>
                    <span className="showcase-header">{props.windowTitle}</span>
                </header>
                <div className="window-content" ref={contentRef}>
                    {props.children}
                </div>
                <footer className="window-status">
                    <span>{props.bottomLeftText}</span>
                </footer>
                <div
                    className="window-resize-handle"
                    onPointerDown={(event) => startGesture(event, 'resize')}
                    onLostPointerCapture={stopGesture}
                />
            </div>
        </div>
    );
};
export default Window;
