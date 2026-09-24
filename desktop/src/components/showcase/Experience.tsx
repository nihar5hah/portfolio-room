import React from 'react';
import data from '../../data/content.json';
export default function Experience() {
    return (
        <article>
            <span className="page-eyebrow">Experience</span>
            <h1>Learning by doing.</h1>
            <p className="page-lead">
                Real teams, real systems, and the details that make them work.
            </p>
            <div className="experience-list">
                {data.experiences.map((e) => (
                    <section className="experience-entry" key={e.id}>
                        <div className="experience-date">
                            <span>{e.period}</span>
                            <small>{e.location}</small>
                            {e.current && <b>Current role</b>}
                        </div>
                        <div>
                            <h2>{e.company}</h2>
                            <h3>{e.role}</h3>
                            <p>{e.description}</p>
                            <ul>
                                {e.achievements.map((a) => (
                                    <li key={a}>{a}</li>
                                ))}
                            </ul>
                            <div className="tag-row">
                                {e.technologies.map((t) => (
                                    <span className="tech-tag" key={t}>
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </section>
                ))}
            </div>
        </article>
    );
}
