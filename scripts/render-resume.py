"""Regenerate the accessible preview after replacing static/resume.pdf.

Run: python3 scripts/render-resume.py (requires Poppler's pdftohtml).
The deployed site serves the generated HTML; it needs no PDF plugin or library.
"""

from hashlib import sha256
from html import unescape
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
pdf = root / "static/resume.pdf"
with tempfile.TemporaryDirectory() as folder:
    output = Path(folder) / "resume.html"
    subprocess.run(["pdftohtml", "-s", "-noframes", "-i", str(pdf), str(output)], check=True, capture_output=True)
    source = output.read_text()

# ponytail: font roles match this one-page LaTeX résumé. Re-map the roles if its
# template changes; multi-page documents should use a PDF renderer instead.
assert source.count('id="page1-div"') == 1 and 'id="page2-div"' not in source
assert all(f'>{heading}</p>' in source for heading in ("Summary", "Education", "Experience", "Projects"))
blocks = []
bullet = False
for font, content in re.findall(r'<p [^>]*class="ft(\d+)">(.*?)</p>', source):
    if font == "17":
        bullet = True
        continue
    content = content.replace("&#160;", " ")
    content = re.sub(r'<br/>(Languages:|AI and Computer Vision:|Platforms and Tools:)', r'</p><p>\1', content)
    content = content.replace("<br/>", " ")
    content = content.replace('<a href=', '<a target="_blank" rel="noopener noreferrer" href=')
    tag = {"10": "h1", "13": "h2", "14": "h3", "18": "h3"}.get(font, "p")
    if bullet:
        blocks.append(f"<ul><li>{content}</li></ul>")
    else:
        style = ' class="meta"' if font in ("15", "16") else ""
        blocks.append(f"<{tag}{style}>{content}</{tag}>")
    bullet = False
body = "\n".join(blocks).replace("</ul>\n<ul>", "\n")
assert len(blocks) > 40
# Check every word against the PDF, not a hand-maintained copy of its content.
original = subprocess.check_output(["pdftotext", "-raw", str(pdf), "-"], text=True)
normalize = lambda text: " ".join(text.replace("•", "").split())
assert normalize(unescape(re.sub(r'<[^>]+>', ' ', body))) == normalize(original)
preview = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nihar Shah — Résumé</title>
<style>
* { box-sizing: border-box; }
html { color-scheme: light; background: #e8e8ed; }
body { margin: 0; padding: 28px; color: #202124; font: 20px/1.55 Georgia, 'Times New Roman', serif; }
main { max-width: 1000px; margin: auto; padding: 48px 56px; background: white; box-shadow: 0 2px 10px #00000010; }
h1 { margin: 0 0 12px; text-align: center; font-size: 38px; letter-spacing: -.6px; }
h1 + p, h1 + p + p { text-align: center; font-size: .85em; }
h2 { margin: 32px 0 14px; padding-bottom: 6px; border-bottom: 1px solid #c9c9ce; font-size: 23px; }
h3 { margin: 22px 0 2px; font-size: 1em; }
p { margin: 8px 0; }
.meta { margin: 2px 0; color: #555; font-size: .9em; }
ul { margin: 12px 0 24px; padding-left: 24px; }
li { margin: 8px 0; }
a { color: inherit; text-decoration-color: #b8b8c2; text-underline-offset: 3px; overflow-wrap: anywhere; }
a:hover { color: #007aff; }
a:focus-visible { outline: 2px solid #007aff; outline-offset: 3px; }
@media (max-width: 700px) {
  body { padding: 12px; font-size: 16px; }
  main { padding: 28px 20px; }
  h1 { font-size: 30px; }
  h2 { font-size: 21px; }
}
</style>
</head>
<body><main aria-label="Résumé">
""" + body + "\n</main></body>\n</html>\n"
preview = preview.replace("<head>", f'<head>\n<!-- Source PDF SHA-256: {sha256(pdf.read_bytes()).hexdigest()} -->')
(root / "static/resume-preview.html").write_text(preview)
