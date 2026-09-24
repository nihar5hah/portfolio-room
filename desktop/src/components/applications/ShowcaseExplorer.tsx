import React, { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import Home from '../showcase/Home';
import About from '../showcase/About';
import Experience from '../showcase/Experience';
import Projects, { names } from '../showcase/Projects';
import data from '../../data/content.json';
import notes from '../../data/notes.json';
import Contact from '../showcase/Contact';
import Notes from '../showcase/Notes';
import VerticalNavbar from '../showcase/VerticalNavbar';
import Window from '../os/Window';
import useInitialWindowSize from '../../hooks/useInitialWindowSize';
function Pages() {
    const { pathname } = useLocation();
    const page = useRef<HTMLElement>(null);
    useEffect(() => {
        page.current?.scrollTo(0, 0);
    }, [pathname]);
    return (
        <div className="site-page portfolio-shell">
            <VerticalNavbar />
            <main className="portfolio-page" ref={page} id="portfolio-content">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/experience" element={<Experience />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/projects/:id" element={<Projects />} />
                    <Route path="/notes" element={<Notes />} />
                    <Route path="/notes/:id" element={<Notes />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="*" element={<Home />} />
                </Routes>
            </main>
        </div>
    );
}
// Like Finder, the title bar names the open page and the status bar describes it.
function describe(pathname: string): [string, string] {
    const [section, id] = pathname.split('/').filter(Boolean);
    const count = (n: number, word: string) =>
        `${n} ${word}${n === 1 ? '' : 's'}`;
    if (section === 'projects') {
        const index = data.projects.findIndex((p) => p.id === id);
        if (index < 0) return ['Projects', count(data.projects.length, 'project')];
        const p = data.projects[index];
        return [
            names[p.id] || p.title,
            `${index + 1} of ${count(data.projects.length, 'project')}`,
        ];
    }
    if (section === 'notes') {
        const index = notes.findIndex((n) => n.id === id);
        if (index < 0) return ['Notes', count(notes.length, 'note')];
        return [notes[index].title, `${index + 1} of ${count(notes.length, 'note')}`];
    }
    if (section === 'about') return ['About', 'Ahmedabad, India'];
    if (section === 'experience')
        return ['Experience', count(data.experiences.length, 'role')];
    if (section === 'contact') return ['Contact', data.siteConfig.email];
    return ['Nihar Shah', count(data.projects.length, 'project')];
}
function Explorer(props: WindowAppProps) {
    const { initWidth, initHeight } = useInitialWindowSize({ margin: 120 });
    const width = Math.min(1180, initWidth);
    // ~40px of air above the dock, like a real window left where macOS opens it.
    const height = Math.max(420, Math.min(760, initHeight - 30));
    const [title, status] = describe(useLocation().pathname);
    return (
        <Window
            top={Math.max(40, (window.innerHeight - 90 - height) / 2)}
            left={Math.max(12, (window.innerWidth - width) / 2)}
            width={width}
            height={height}
            windowTitle={title}
            windowBarIcon="windowExplorerIcon"
            closeWindow={props.onClose}
            onInteract={props.onInteract}
            active={props.active}
            minimizeWindow={props.onMinimize}
            bottomLeftText={status}
        >
            <Pages />
        </Window>
    );
}
export default function ShowcaseExplorer(props: WindowAppProps) {
    return (
        <HashRouter
            future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
            }}
        >
            <Explorer {...props} />
        </HashRouter>
    );
}
