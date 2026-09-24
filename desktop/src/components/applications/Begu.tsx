import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Window from '../os/Window';
import Icon from '../general/Icon';
type Message = { role: 'user' | 'assistant'; content: string };
export default function Begu(props: WindowAppProps) {
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
    return (
        <Window
            top={58}
            left={Math.max(16, innerWidth / 2 - 300)}
            width={Math.min(600, innerWidth - 32)}
            height={Math.min(760, innerHeight - 145)}
            windowTitle="Begu"
            windowBarIcon="begu"
            closeWindow={props.onClose}
            minimizeWindow={props.onMinimize}
            onInteract={props.onInteract}
            bottomLeftText="Nihar’s AI companion"
        >
            <section className="begu-app">
                <header className="begu-profile">
                    <Icon icon="begu" size={54} />
                    <div>
                        <h1>Begu</h1>
                        <p>A curious husky. A lot about Nihar.</p>
                    </div>
                    <span className="begu-status">
                        <i />
                        AI companion
                    </span>
                </header>
                <div
                    className="chat-scroll"
                    aria-live="polite"
                    aria-relevant="additions text"
                >
                    {!messages.length && (
                        <div className="chat-welcome">
                            <h2>Hey. I’m Begu.</h2>
                            <p>
                                I keep Nihar company while he builds.
                                <br />
                                Ask me about his work, projects, or experience.
                            </p>
                            <div className="chat-prompts">
                                {[
                                    'What is Nihar building?',
                                    'Tell me about his experience',
                                    'Which project should I explore?',
                                ].map((q) => (
                                    <button key={q} onClick={() => ask(q)}>
                                        {q}
                                        <span>↗</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div className={'chat-message ' + m.role} key={i}>
                            <span>
                                {m.role === 'assistant' ? 'Begu' : 'You'}
                            </span>
                            <div>
                                {m.role === 'assistant' ? (
                                    <ReactMarkdown>{m.content}</ReactMarkdown>
                                ) : (
                                    m.content
                                )}
                            </div>
                        </div>
                    ))}
                    {busy && (
                        <p className="chat-thinking" role="status">
                            Begu is thinking<span>•••</span>
                        </p>
                    )}
                    {error && (
                        <div className="chat-error" role="alert">
                            <p>{error}</p>
                            <button
                                onClick={() => {
                                    const last = messages
                                        .filter((m) => m.role === 'user')
                                        .slice(-1)[0];
                                    if (last) {
                                        setMessages(messages.slice(0, -1));
                                        setInput(last.content);
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
                    className="chat-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void ask(input);
                    }}
                >
                    <label htmlFor="begu-message" className="sr-only">
                        Ask Begu about Nihar
                    </label>
                    <input
                        id="begu-message"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask me about Nihar…"
                        maxLength={2000}
                        disabled={busy}
                        autoComplete="off"
                    />
                    <button
                        aria-label="Send message"
                        type="submit"
                        disabled={busy || !input.trim()}
                    >
                        ↑
                    </button>
                </form>
                <p className="chat-note">
                    Ask about projects, experience, or getting in touch.
                </p>
            </section>
        </Window>
    );
}
