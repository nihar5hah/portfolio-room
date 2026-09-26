#!/usr/bin/env python3
"""Cut a 30-second preview of every album track for the live site.

The full library (static/audio/<album>/) is local-only and git-ignored. This
writes static/audio/previews/<album>/<same name>.m4a, which is tracked and
deployed. Each clip starts about a third of the way in (past the intro),
with a short fade in and out, as 96 kbps AAC. The build uses a full track
when it exists and its preview otherwise (bundler/webpack.common.js).

    python3 scripts/make-previews.py            # only missing previews
    python3 scripts/make-previews.py --force    # redo all
"""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = os.path.join(ROOT, 'static')
LENGTH = 30.0
FADE_IN, FADE_OUT = 0.8, 2.5


def duration(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'default=nw=1:nk=1', path],
        capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def start_of(total):
    """About a third in, but never so late the clip runs off the end."""
    if total <= LENGTH:
        return 0.0
    return max(0.0, min(total * 0.34, total - LENGTH - 3.0))


def cut(track, force):
    source = os.path.join(STATIC, track['src'].lstrip('/'))
    relative = track['src'].lstrip('/').split('/', 1)[1]  # <album>/<file>
    target = os.path.join(STATIC, 'audio', 'previews', relative)
    if not os.path.exists(source):
        return f'missing source: {track["src"]}'
    if os.path.exists(target) and not force:
        return None
    os.makedirs(os.path.dirname(target), exist_ok=True)
    total = duration(source)
    start = start_of(total)
    length = min(LENGTH, total)
    fade = f'afade=t=in:d={FADE_IN},afade=t=out:st={length - FADE_OUT:.2f}:d={FADE_OUT}'
    subprocess.run(
        ['ffmpeg', '-y', '-v', 'error', '-ss', f'{start:.2f}', '-t', f'{length:.2f}',
         '-i', source, '-af', fade, '-c:a', 'aac', '-b:a', '96k',
         '-movflags', '+faststart', '-map_metadata', '-1', '-vn', target],
        check=True)
    return None


def main():
    force = '--force' in sys.argv
    with open(os.path.join(STATIC, 'audio', 'playlist.json')) as f:
        tracks = json.load(f)['tracks']
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        problems = [p for p in pool.map(lambda t: cut(t, force), tracks) if p]
    for problem in problems:
        print(problem)
    print(f'{len(tracks) - len(problems)} previews ready')


if __name__ == '__main__':
    main()
