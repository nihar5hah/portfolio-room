import React from 'react';
import { Link, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import notes from '../../data/notes.json';
export default function Notes() {
    const { id } = useParams();
    const note = notes.find((n) => n.id === id);
    return note ? (
        <article className="note-detail">
            <Link className="back-link" to="/notes">
                ← All notes
            </Link>
            <span className="page-eyebrow">
                {note.date} · {note.category}
            </span>
            <h1>{note.title}</h1>
            <p className="page-lead">{note.excerpt}</p>
            {note.category === 'Design archive' && (
                <p className="archive-notice">
                    From the archive: this article describes the previous
                    version of my portfolio.
                </p>
            )}
            <div className="markdown">
                <Markdown>{note.body}</Markdown>
            </div>
        </article>
    ) : (
        <article>
            <span className="page-eyebrow">Notes</span>
            <h1>Thinking out loud.</h1>
            <p className="page-lead">What I’m learning along the way.</p>
            <div className="notes-list">
                {notes.map((n) => (
                    <Link to={'/notes/' + n.id} key={n.id}>
                        <span className="file-meta">
                            {n.date} / {n.category}
                        </span>
                        <h2>{n.title}</h2>
                        <p>{n.excerpt}</p>
                        <span className="note-read">Read note →</span>
                    </Link>
                ))}
            </div>
        </article>
    );
}
