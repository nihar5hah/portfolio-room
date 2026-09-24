import * as THREE from 'three';

type MatchEvent = {
    id: string;
    minute: string;
    type: string;
    label: string;
    player: string;
    team: string | null;
    x: number;
    y: number;
    end: { x: number; y: number } | null;
};
type Match = {
    id: string;
    competition: string;
    kickoff: string;
    state: 'pre' | 'in' | 'post';
    clock: string;
    teams: {
        id: string;
        name: string;
        abbreviation: string;
        score: number | null;
    }[];
    events: MatchEvent[];
    commentary: { minute: string; text: string }[];
    sourceUrl: string;
    updatedAt: string;
    stale: boolean;
    table: Standings | null;
};
type Standings = {
    competition: string;
    rows: {
        rank: number;
        id: string;
        name: string;
        played: number;
        goalDifference: number;
        points: number;
    }[];
};

export default class MatchBoard {
    canvas = document.createElement('canvas');
    map: THREE.CanvasTexture;
    data: Match | undefined;
    error = '';
    nextPoll = 0;
    loading = false;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    replayStarted = 0;
    lastDraw = 0;

    constructor() {
        this.canvas.width = 1280;
        this.canvas.height = 720;
        this.canvas.setAttribute('aria-hidden', 'true');
        this.map = new THREE.CanvasTexture(this.canvas);
        this.map.encoding = THREE.sRGBEncoding;
        this.draw();
    }

    async poll() {
        this.loading = true;
        try {
            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), 12000);
            let response: Response;
            try {
                response = await fetch('/api/barcelona', {
                    signal: controller.signal,
                });
            } finally {
                window.clearTimeout(timeout);
            }
            if (!response.ok) throw new Error('Feed unavailable');
            const data: Match = await response.json();
            if (
                !Array.isArray(data.teams) ||
                data.teams.length !== 2 ||
                !Array.isArray(data.events) ||
                !Number.isFinite(Date.parse(data.updatedAt))
            )
                throw new Error('Invalid feed');
            const latest = data.events[data.events.length - 1];
            const previous = this.data?.events[this.data.events.length - 1];
            this.replayStarted =
                !data.stale &&
                data.state === 'in' &&
                latest?.end &&
                latest.id !== previous?.id &&
                !this.reducedMotion.matches
                    ? performance.now()
                    : 0;
            this.data = data;
            this.error = '';
        } catch {
            this.error = this.data
                ? 'Connection interrupted · showing last update'
                : 'Live match data is temporarily unavailable';
            if (this.data) this.data.stale = true;
        } finally {
            this.loading = false;
            this.nextPoll = performance.now() + 20000;
            this.draw();
        }
    }

    update() {
        if (document.hidden) return;
        const now = performance.now();
        if (!this.loading && now >= this.nextPoll) void this.poll();
        if (this.replayStarted && now - this.lastDraw > 50) {
            this.draw();
            if (now - this.replayStarted >= 1600 || this.reducedMotion.matches)
                this.replayStarted = 0;
        }
    }

    draw() {
        const ctx = this.canvas.getContext('2d')!;
        const data = this.data;
        this.lastDraw = performance.now();
        ctx.fillStyle = '#101b21';
        ctx.fillRect(0, 0, 1280, 720);
        const write = (
            text: string,
            x: number,
            y: number,
            size = 24,
            color = '#c1cbd0',
            weight = '400',
        ) => {
            ctx.font = `${weight} ${size}px -apple-system, sans-serif`;
            ctx.fillStyle = color;
            ctx.fillText(text, x, y, 1230 - x);
        };
        const wrap = (
            text: string,
            x: number,
            y: number,
            maxWidth: number,
            maxLines: number,
        ) => {
            ctx.font = '22px -apple-system, sans-serif';
            let line = '',
                count = 0;
            for (const word of text.split(' ')) {
                if (ctx.measureText(line + word).width > maxWidth && line) {
                    write(line.trim(), x, y + count++ * 30, 22);
                    line = '';
                    if (count >= maxLines) return;
                }
                line += word + ' ';
            }
            if (line) write(line.trim(), x, y + count * 30, 22);
        };
        write('BARÇA / MATCH NIGHT', 50, 55, 23, '#e7c889', '600');
        if (!data) {
            write(
                this.error || 'Finding the Barcelona match…',
                50,
                170,
                36,
                '#f5f0e5',
            );
            write('Live scores, match events, and the next fixture.', 50, 230);
            this.map.needsUpdate = true;
            return;
        }
        const [home, away] = data.teams;
        const stale =
            data.stale || Date.now() - Date.parse(data.updatedAt) > 60000;
        const status = stale
            ? 'LAST UPDATE'
            : data.state === 'in'
              ? `LIVE · ${data.clock}`
              : data.state === 'post'
                ? data.clock
                : 'UP NEXT';
        write(status, 960, 55, 25, stale ? '#efb781' : '#8bd9b3', '600');
        write(
            `${home.name}   ${home.score ?? '–'} : ${away.score ?? '–'}   ${away.name}`,
            50,
            130,
            46,
            '#f5f0e5',
            '600',
        );
        const kickoff = new Intl.DateTimeFormat('en-IN', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        }).format(new Date(data.kickoff));
        write(`${data.competition}  ·  ${kickoff}`, 50, 176, 23);
        const x = 50,
            y = 246,
            w = 745,
            h = 382;
        const recent = data.events.slice(-8),
            latest = recent[recent.length - 1];
        // With no match being played the pitch is an empty rectangle, so the
        // league table takes the space instead: it is the one thing that says
        // something on any day of the season. Sent only when play isn't live.
        if (data.table) {
            const standings = data.table.rows;
            const barcelona = standings.find((row) => row.id === '83');
            write(
                data.table.competition.toUpperCase(),
                x,
                y - 22,
                20,
                '#9aaeb0',
            );
            const panel = (
                rows: typeof standings,
                left: number,
                width: number,
            ) => {
                const line = Math.floor((h - 56) / rows.length);
                ctx.fillStyle = '#15242b';
                ctx.fillRect(left, y, width, h);
                const column = [
                    22,
                    74,
                    width - 268,
                    width - 180,
                    width - 76,
                ].map((at) => left + at);
                ['#', 'CLUB', 'PL', 'GD', 'PTS'].forEach((head, index) =>
                    write(head, column[index], y + 34, 19, '#7d9198', '600'),
                );
                rows.forEach((row, index) => {
                    const top = y + 50 + index * line;
                    const ours = row === barcelona;
                    if (ours) {
                        ctx.fillStyle = '#20323a';
                        ctx.fillRect(left, top, width, line);
                    }
                    [
                        String(row.rank),
                        row.name,
                        String(row.played),
                        row.goalDifference > 0
                            ? `+${row.goalDifference}`
                            : String(row.goalDifference),
                        String(row.points),
                    ].forEach((cell, at) =>
                        write(
                            cell,
                            column[at],
                            top + line / 2 + 8,
                            21,
                            ours ? '#f5f0e5' : '#c1cbd0',
                            ours ? '600' : '400',
                        ),
                    );
                });
            };
            // Before kickoff there is nothing on the pitch and nothing to say
            // about it, so both panels go to the table and it runs the whole
            // division. Once there is a move or a line of commentary to show,
            // the table hands that column back and keeps Barcelona's end.
            if (latest || data.commentary[0]) {
                const top = standings.slice(0, 8);
                if (barcelona && !top.includes(barcelona)) top[7] = barcelona;
                panel(top, x, w);
            } else {
                panel(standings.slice(0, 10), x, 560);
                panel(standings.slice(10, 20), x + 620, 560);
            }
        } else {
            ctx.fillStyle = '#1c3936';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#78988a';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            ctx.beginPath();
            ctx.moveTo(x + w / 2, y);
            ctx.lineTo(x + w / 2, y + h);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x + w / 2, y + h / 2, 56, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeRect(x, y + h * 0.23, w * 0.16, h * 0.54);
            ctx.strokeRect(x + w * 0.84, y + h * 0.23, w * 0.16, h * 0.54);
            write('RECENT EVENT LOCATIONS', x, y - 22, 20, '#9aaeb0');
            recent.forEach((event, index) => {
                const px = x + (event.x / 100) * w,
                    py = y + (1 - event.y / 100) * h;
                const color = event.team === '83' ? '#ed6089' : '#efce8b';
                ctx.globalAlpha = event === latest ? 1 : 0.3 + index * 0.05;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(px, py, event === latest ? 9 : 5, 0, Math.PI * 2);
                ctx.fill();
                if (event === latest) {
                    ctx.strokeStyle = color;
                    ctx.beginPath();
                    ctx.arc(px, py, 16, 0, Math.PI * 2);
                    ctx.stroke();
                    if (event.end) {
                        const ex = x + (event.end.x / 100) * w,
                            ey = y + (1 - event.end.y / 100) * h;
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                        ctx.lineTo(ex, ey);
                        ctx.stroke();
                        const progress =
                            this.replayStarted && !this.reducedMotion.matches
                                ? Math.min(
                                      1,
                                      (performance.now() - this.replayStarted) /
                                          1500,
                                  )
                                : 1;
                        ctx.fillStyle = '#fff6e7';
                        ctx.beginPath();
                        ctx.arc(
                            px + (ex - px) * progress,
                            py + (ey - py) * progress,
                            5,
                            0,
                            Math.PI * 2,
                        );
                        ctx.fill();
                    }
                }
            });
            ctx.globalAlpha = 1;
            if (!latest)
                wrap(
                    data.state === 'pre'
                        ? 'Event locations will appear when the match begins.'
                        : 'No event coordinates supplied yet.',
                    110,
                    423,
                    610,
                    2,
                );
        }
        if (latest) {
            write('LATEST ON THE PITCH', 840, 224, 20, '#9aaeb0');
            write(
                `${latest.minute} · ${latest.player || 'Match event'}`,
                840,
                270,
                25,
                '#f5f0e5',
                '600',
            );
            wrap(latest.label, 840, 308, 385, 3);
        }
        const commentary = data.commentary[0];
        if (commentary) {
            write(`COMMENTARY · ${commentary.minute}`, 840, 434, 20, '#9aaeb0');
            wrap(commentary.text, 840, 478, 385, 4);
        }
        if (!data.table) {
            write('● Barcelona', 50, 663, 20, '#ed6089');
            write(
                `● ${home.id === '83' ? away.name : home.name}`,
                210,
                663,
                20,
                '#efce8b',
            );
            write(
                'Event coordinates · not continuous player tracking',
                50,
                699,
                19,
                '#9aaeb0',
            );
        }
        const updated = new Date(data.updatedAt).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        write(`ESPN · updated ${updated}`, 840, 663, 19, '#9aaeb0');
        if (stale) write('Feed delayed · retrying', 840, 699, 19, '#efb781');
        this.map.needsUpdate = true;
    }
}
