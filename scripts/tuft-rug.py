"""Bake the Graduation print into a tufted-rug texture. Nothing is cropped.

Run: python3 scripts/tuft-rug.py (requires Pillow and NumPy).
Reads scripts/source/graduation-rug-print.webp, writes static/room/graduation-rug.webp.
Ink printed on pile loses its crisp edges, never reaches pure black or white,
and carries fibre grain plus soft nap mottling; the full design stays intact.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

root = Path(__file__).resolve().parents[1]
source = root / "scripts/source/graduation-rug-print.webp"
target = root / "static/room/graduation-rug.webp"

print_image = Image.open(source).convert("RGB")
w, h = print_image.size
rng = np.random.default_rng(2007)

# Ink bleeds slightly into the pile.
rgb = np.asarray(print_image.filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
luma = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
rgb = luma[..., None] + (rgb - luma[..., None]) * 0.9  # dye is less saturated
rgb = 0.035 + rgb * 0.92  # pile never reads as pure black or paper white

# Fibre grain, smeared along the nap so it reads as threads, not sensor noise.
grain = Image.fromarray(
    (np.clip(rng.normal(0.5, 0.18, (h, w)), 0, 1) * 255).astype(np.uint8)
).filter(ImageFilter.BoxBlur(1)).resize((w, h))
grain = np.asarray(grain, np.float32) / 255 - 0.5
nap = np.roll(grain, 1, axis=0) + grain + np.roll(grain, -1, axis=0)
rgb *= 1 + nap[..., None] * 0.09

# Brushed-pile mottling: large soft patches where light catches the nap differently.
patches = Image.fromarray(
    (rng.random((18, 12)) * 255).astype(np.uint8)
).resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(24))
rgb *= 1 + (np.asarray(patches, np.float32) / 255 - 0.5)[..., None] * 0.07

# Pile is compressed where the binding is stitched.
edge = np.minimum.outer(
    np.minimum(np.arange(h), np.arange(h)[::-1]),
    np.minimum(np.arange(w), np.arange(w)[::-1]),
)
rgb *= (0.955 + 0.045 * np.clip(edge / 14, 0, 1))[..., None]

out = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8))
assert out.size == print_image.size, "the rug keeps the complete print"
out.save(target, "WEBP", quality=90, method=6)
print(f"{target.relative_to(root)} {out.size[0]}x{out.size[1]}")
