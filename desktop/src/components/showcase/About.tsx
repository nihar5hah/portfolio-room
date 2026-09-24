import React from 'react';
import data from '../../data/content.json';
export default function About() {
    return (
        <article>
            <span className="page-eyebrow">About</span>
            <h1>A builder at heart.</h1>
            <p className="page-lead">
                I’m Nihar Shah, an applied AI systems builder based in
                Ahmedabad, India.
            </p>
            <div className="about-intro">
                <div>
                    <h2>Curiosity, then code.</h2>
                    <p>
                        I work at the intersection of AI, product, and
                        engineering. My projects span autonomous agents,
                        retrieval and evaluation systems, computer vision, and
                        voice assistants.
                    </p>
                    <p>
                        At Confido Health, I help develop and improve
                        conversational AI for healthcare clinics. Alongside that
                        work, I’m studying Computer Science at CHARUSAT and
                        building tools of my own.
                    </p>
                </div>
            </div>
            <h2 className="section-heading">The toolbox</h2>
            <div className="skills-grid">
                {data.skillCategories.map((c) => (
                    <section key={c.id}>
                        <h3>{c.title}</h3>
                        <p>{c.skills.map((s) => s.name).join(' · ')}</p>
                    </section>
                ))}
            </div>
            <h2 className="section-heading">Learning, continuously.</h2>
            {data.education.map((e) => (
                <section className="education-row" key={e.school}>
                    <span className="file-meta">{e.period}</span>
                    <div>
                        <h3>{e.degree}</h3>
                        <p>{e.school}</p>
                    </div>
                </section>
            ))}
            <div className="certifications">
                {data.certifications.map((c) => (
                    <span key={c}>{c}</span>
                ))}
            </div>
        </article>
    );
}
