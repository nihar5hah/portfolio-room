import React from 'react';
import { Link } from 'react-router-dom';
import data from '../../data/content.json';
export default function Home() {
    const p = data.projects[0];
    return (
        <article className="home-page">
            <div className="home-heading">
                <h1>
                    Hi, I’m Nihar.
                    <br />
                    <span>I make AI useful.</span>
                </h1>
            </div>
            <p className="home-intro">
                From agents that work together to conversations that help
                people. I build systems that turn a promising idea into
                something you can actually use.
            </p>
            <div className="home-actions">
                <Link className="primary-link" to="/projects">
                    See my work
                </Link>
                <Link className="text-link" to="/about">
                    About me
                </Link>
            </div>
            <div className="home-rule">
                <span>Featured</span>
                <span>{data.projects.length} projects</span>
            </div>
            <Link className="featured-project" to="/projects/kalexam">
                <div className="feature-image">
                    <img src={p.image} alt="KalExam learning platform" />
                    <span className="file-badge">In progress</span>
                </div>
                <div className="feature-copy">
                    <span className="page-eyebrow">Learning & evaluation</span>
                    <h2>KalExam</h2>
                    <p>
                        Your syllabus, your material.
                        <br />A more personal way to learn.
                    </p>
                    <span className="file-meta">
                        RAG · Multi-model AI · Source citations
                    </span>
                </div>
            </Link>
            <footer className="home-footer">
                <span>Ahmedabad, India</span>
                <span>Applied AI · Voice · Agents</span>
            </footer>
        </article>
    );
}
