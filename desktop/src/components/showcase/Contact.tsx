import React, { useEffect, useRef, useState } from 'react';
import data from '../../data/content.json';
export default function Contact() {
    const [copied, setCopied] = useState('Copy address');
    const timer = useRef<ReturnType<typeof setTimeout>>();
    useEffect(() => () => clearTimeout(timer.current), []);
    async function copy() {
        try {
            await navigator.clipboard.writeText(data.siteConfig.email);
            setCopied('Copied');
        } catch {
            setCopied('Select the address to copy');
        }
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied('Copy address'), 3000);
    }
    return (
        <article className="contact-page">
            <span className="page-eyebrow">Let’s talk</span>
            <h1>
                Good work starts
                <br />
                with a conversation.
            </h1>
            <p className="page-lead">
                Have a project in mind, a question about my work, or something
                interesting to share?
            </p>
            <div className="contact-letter">
                <span className="file-meta">To: Nihar Shah</span>
                <a
                    className="contact-address"
                    href={'mailto:' + data.siteConfig.email}
                >
                    {data.siteConfig.email}
                </a>
                <div className="contact-actions">
                    <a
                        className="primary-link"
                        href={'mailto:' + data.siteConfig.email}
                    >
                        Write an email ↗
                    </a>
                    <button onClick={copy} aria-label="Copy email address">
                        <span role="status">{copied}</span>
                    </button>
                </div>
            </div>
            <div className="social-links">
                {data.socialLinks
                    .filter((s) => s.name !== 'Email')
                    .map((s) => (
                        <a
                            key={s.name}
                            href={s.url}
                            target={
                                s.url.startsWith('https') ? '_blank' : undefined
                            }
                            rel="noreferrer"
                        >
                            {s.name}
                            {s.url.startsWith('http') && (
                                <span aria-hidden="true">↗</span>
                            )}
                        </a>
                    ))}
            </div>
            <p className="contact-location">
                Based in Ahmedabad, India. Building wherever curiosity takes me.
            </p>
        </article>
    );
}
