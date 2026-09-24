import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import data from '../../data/content.json';
export const names: Record<string, string> = {
    kalexam: 'KalExam',
    openclaw: 'OpenClaw',
    'mission-control': 'Mission Control',
    voiceserve: 'VoiceServe',
    hireai: 'HireAI',
    'healthcare-ai': 'Healthcare Voice AI',
    faceattend: 'FaceAttend',
};
export default function Projects() {
    const { id } = useParams();
    const [query, setQuery] = useState('');
    const project = data.projects.find((p) => p.id === id);
    if (project)
        return (
            <article className="project-detail">
                <Link className="back-link" to="/projects">
                    ← All projects
                </Link>
                <span className="page-eyebrow">
                    {project.inProgress ? 'In progress' : 'Project'}
                </span>
                <h1>{names[project.id] || project.title}</h1>
                <p className="page-lead">{project.description}</p>
                <div className="project-actions">
                    {Object.entries(project.links)
                        .sort(([a]) => (a === 'demo' ? -1 : 1))
                        .map(([type, url]) => (
                        <a
                            className={
                                type === 'demo' ? 'primary-link' : 'text-link'
                            }
                            key={type}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {type === 'demo'
                                ? 'Visit project ↗'
                                : 'View source ↗'}
                        </a>
                        ))}
                    {Object.keys(project.links).length === 0 && (
                        <Link className="text-link" to="/contact">
                            Ask me about this project ↗
                        </Link>
                    )}
                </div>
                <img
                    className="project-hero"
                    src={project.image}
                    alt={project.imagePlaceholder}
                />
                <div className="detail-body">
                    <section>
                        <h2>What I built</h2>
                        <p>{project.longDescription}</p>
                        <h2>Inside the system</h2>
                        <ul>
                            {project.highlights.map((h) => (
                                <li key={h}>{h}</li>
                            ))}
                        </ul>
                    </section>
                    <aside>
                        <h3>Built with</h3>
                        {project.technologies.map((t) => (
                            <span className="tech-tag" key={t}>
                                {t}
                            </span>
                        ))}
                    </aside>
                </div>
            </article>
        );
    const filtered = data.projects.filter((p) =>
        (p.title + ' ' + p.technologies.join(' '))
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
    );
    return (
        <article>
            <span className="page-eyebrow">Projects</span>
            <h1>Things I’ve built.</h1>
            <p className="page-lead">
                Agents, voice systems, and a few ideas that wouldn’t leave me
                alone.
            </p>
            <div className="project-search">
                <label htmlFor="project-search">Search this folder</label>
                <input
                    id="project-search"
                    type="search"
                    placeholder="Find a project or technology…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <span>
                    {filtered.length}{' '}
                    {filtered.length === 1 ? 'project' : 'projects'}
                </span>
            </div>
            <div className="project-grid">
                {filtered.map((p) => (
                    <Link
                        className="project-card"
                        key={p.id}
                        to={'/projects/' + p.id}
                    >
                        <div className="project-image">
                            <img
                                src={p.image}
                                alt={p.imagePlaceholder}
                                loading="lazy"
                            />
                            {p.inProgress && (
                                <span className="file-badge">In progress</span>
                            )}
                        </div>
                        <div className="project-card-copy">
                            <h2>
                                {names[p.id] || p.title}
                                <span aria-hidden="true">→</span>
                            </h2>
                            <p>{p.description}</p>
                            <span className="file-meta">
                                {p.technologies.slice(0, 2).join(' / ')}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
            {!filtered.length && (
                <div className="empty-state">
                    <h2>No files found.</h2>
                    <p>Try a project name, Python, or RAG.</p>
                    <button onClick={() => setQuery('')}>Clear search</button>
                </div>
            )}
        </article>
    );
}
