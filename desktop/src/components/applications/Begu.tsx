import React, { memo, useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Window from '../os/Window';
import GEOMETRY from './geometry';
import avatar from '../../assets/begu-avatar.jpg';
import { safeBeguLink } from './beguLinks';
type Message = { role: 'user' | 'assistant'; content: string };

/**
 * Replies are model output a visitor can try to steer: links only to
 * Nihar's own pages (beguLinks.ts), everything else as plain text showing
 * where it points; images as their description, never loaded.
 */
const MARKDOWN = {
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        const safe = safeBeguLink(href);
        if (!safe)
            return (
                <span>
                    {children}
                    {href && String(children) !== href ? ` (${href})` : ''}
                </span>
            );
        const external = /^(https:|mailto:)/.test(safe);
        return (
            <a
                href={safe}
                target={safe.startsWith('https:') ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
            >
                {children}
            </a>
        );
    },
    img: ({ alt }: { alt?: string }) => (alt ? <span>{alt}</span> : null),
};
const GREETING =
    'Hey, I’m Begu. I keep Nihar company while he builds. Ask me about his projects, his experience, or how to reach him.';
const SUGGESTIONS = [
    'What is Nihar building?',
    'Tell me about his experience',
    'Which project should I explore?',
];
// A Messages-style conversation: Begu's greeting is the first incoming bubble.
function Begu(props: WindowAppProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const end = useRef<HTMLDivElement>(null);
    const pending = useRef<AbortController>();
    useEffect(() => () => pending.current?.abort(), []);
    useEffect(() => {
        end.current?.scrollIntoView({ block: 'nearest' });
    }, [messages, busy, error]);
    async function ask(question: string) {
        if (busy || !question.trim()) return;
        const next: Message[] = [
            ...messages,
            { role: 'user', content: question.trim() },
        ];
        setMessages(next);
        setInput('');
        setError('');
        setBusy(true);
        pending.current = new AbortController();
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: next.slice(-12) }),
                signal: pending.current.signal,
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(
                    data.error || 'Begu could not answer. Please try again.',
                );
            setMessages([...next, { role: 'assistant', content: data.reply }]);
        } catch (e) {
            if (e instanceof Error && e.name !== 'AbortError')
                setError(
                    e instanceof TypeError || e instanceof SyntaxError
                        ? 'Begu couldn’t connect. Check your connection and try again.'
                        : e.message,
                );
        } finally {
            if (!pending.current?.signal.aborted) setBusy(false);
        }
    }
    // The greeting is shown, never sent: the server only sees real turns.
    const transcript: Message[] = [
        { role: 'assistant', content: GREETING },
        ...messages,
    ];
    return (
        <Window
            {...GEOMETRY.begu()}
            windowTitle="Begu"
            windowBarIcon="begu"
            closeWindow={props.onClose}
            minimizeWindow={props.onMinimize}
            onInteract={props.onInteract}
            active={props.active}
            bottomLeftText="Nihar’s AI companion"
        >
            <section className="msg-app">
                <header className="msg-contact">
                    <img src={avatar} alt="" width={44} height={44} />
                    <strong>Begu</strong>
                    <span>Husky · knows Nihar’s work</span>
                </header>
                <div
                    className="msg-scroll"
                    aria-live="polite"
                    aria-relevant="additions text"
                >
                    {transcript.map((m, i) => {
                        const last =
                            m.role === 'assistant' &&
                            transcript[i + 1]?.role !== 'assistant' &&
                            !(busy && i === transcript.length - 1);
                        return (
                            <div className={'msg-row ' + m.role} key={i}>
                                {m.role === 'assistant' && (
                                    <img
                                        className="msg-face"
                                        src={avatar}
                                        alt=""
                                        data-hidden={!last}
                                    />
                                )}
                                <div className="msg-bubble">
                                    <span className="sr-only">
                                        {m.role === 'assistant'
                                            ? 'Begu:'
                                            : 'You:'}
                                    </span>
                                    {m.role === 'assistant' ? (
                                        <ReactMarkdown
                                            skipHtml
                                            components={MARKDOWN}
                                        >
                                            {m.content}
                                        </ReactMarkdown>
                                    ) : (
                                        m.content
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {!messages.length && (
                        <div className="msg-replies">
                            {SUGGESTIONS.map((q) => (
                                <button key={q} onClick={() => ask(q)}>
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}
                    {busy && (
                        <div className="msg-row assistant" role="status">
                            <img className="msg-face" src={avatar} alt="" />
                            <div className="msg-bubble msg-typing">
                                <span className="sr-only">Begu is typing</span>
                                <i />
                                <i />
                                <i />
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="msg-error" role="alert">
                            <p>{error}</p>
                            <button
                                onClick={() => {
                                    const lastAsk = messages
                                        .filter((m) => m.role === 'user')
                                        .slice(-1)[0];
                                    if (lastAsk) {
                                        setMessages(messages.slice(0, -1));
                                        setInput(lastAsk.content);
                                    }
                                    setError('');
                                }}
                            >
                                Edit and try again
                            </button>
                        </div>
                    )}
                    <div ref={end} />
                </div>
                <form
                    className="msg-compose"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void ask(input);
                    }}
                >
                    <label htmlFor="begu-message" className="sr-only">
                        Message Begu
                    </label>
                    <input
                        id="begu-message"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Message Begu"
                        maxLength={2000}
                        disabled={busy}
                        autoComplete="off"
                    />
                    <button
                        aria-label="Send message"
                        type="submit"
                        disabled={busy || !input.trim()}
                    >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path
                                d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </form>
            </section>
        </Window>
    );
}

export default memo(Begu);
