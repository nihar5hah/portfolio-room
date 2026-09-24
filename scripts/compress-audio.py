"""Re-encode the music library to 96 kbps AAC (.m4a) for hosting.

Run: python3 scripts/compress-audio.py   (requires ffmpeg with aac_at, i.e. macOS)

Apple's AAC encoder at 96 kbps matches the 128 kbps MP3 sources for background
listening at roughly three quarters of the size. Files are written with
faststart so playback begins before the whole file arrives. Each output is
checked (decodes, same duration within half a second) before the playlist is
updated. Originals move to ../portfolio-audio-originals/ (a move, not a copy,
so it needs no extra disk) and can be restored from there.
"""

import json
import shutil
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
audio = root / "static/audio"
archive = root.parent / "portfolio-audio-originals"
manifest_path = audio / "playlist.json"
manifest = json.loads(manifest_path.read_text())


def probe(path, field):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", f"format={field}",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out) if out and out != "N/A" else 0.0


before = after = 0
for track in manifest["tracks"]:
    source = root / "static" / track["src"].lstrip("/")
    if source.suffix == ".m4a" and probe(source, "bit_rate") <= 100_000:
        continue  # already web-sized
    target = source.with_suffix(".m4a")
    if target == source:
        target = source.with_name(source.stem + "-96k.m4a")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(source), "-map", "0:a",
         "-c:a", "aac_at", "-b:a", "96k", "-movflags", "+faststart",
         "-map_metadata", "-1", str(target)],
        check=True,
    )
    drift = abs(probe(source, "duration") - probe(target, "duration"))
    if drift > 0.5:
        target.unlink()
        raise SystemExit(f"{source.name}: duration changed by {drift:.2f}s")
    before += source.stat().st_size
    after += target.stat().st_size
    kept = archive / source.relative_to(audio)
    kept.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), kept)
    track["src"] = "/" + str(target.relative_to(root / "static"))

manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
if before:
    print(f"{before / 1e6:.0f} MB -> {after / 1e6:.0f} MB "
          f"({100 - 100 * after / before:.0f}% smaller); originals in {archive}")
else:
    print("library already web-sized")
