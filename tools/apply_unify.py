"""Apply outline spec to word cards + Nat wall crops, then rewrite week01-v2.html."""
from __future__ import annotations

import base64
import io
import re
import sys
from pathlib import Path

from PIL import Image
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from unify_card_outlines import (  # noqa: E402
    TARGET, metrics, to_png_bytes, unify, key_out_flat_bg, strip_light_halo
)

ROOT = Path(r"E:\projects\english_for_child")
HTML = ROOT / "week01-v2.html"
CARD_DIR = ROOT / "assets" / "word-cards"
WALL_DIR = ROOT / "assets" / "wall-nat"
GEN = Path(r"C:\Users\FY\.grok\sessions\E:\projects\english_for_child\01a047a2-4694-7a82-bd03-a9df7559d9d2\images")
# session path uses percent-encoding on disk
GEN_ALT = Path(r"C:\Users\FY\.grok\sessions") / "E%3A%5Cprojects%5Cenglish_for_child" / "01a047a2-4694-7a82-bd03-a9df7559d9d2" / "images"

REPLACED_SRC = {
    "an": "1.jpg",
    "at": "2.jpg",
    "pin": "4.jpg",
    "sap": "7.jpg",
    "pan": "8.jpg",
    "tan": "10.jpg",
}


def gen_dir() -> Path:
    if GEN_ALT.exists():
        return GEN_ALT
    if GEN.exists():
        return GEN
    raise SystemExit("generated image folder not found")


def key_magenta(im: Image.Image) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    rgb = a[:, :, :3].astype(np.float32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mag = (r > 130) & (b > 90) & (g < 0.78 * r) & (g < 0.88 * b) & (((r + b) / 2 - g) > 36)
    a[mag, 3] = 0
    # despill remaining fringe
    edge_alpha = (a[:, :, 3] > 8) & (a[:, :, 3] < 230)
    spill = edge_alpha & (r > g + 20) & (b > g + 8)
    a[spill, 3] = (a[spill, 3] * 0.15).astype(np.uint8)
    return Image.fromarray(a)


def load_card(key: str) -> Image.Image:
    if key in REPLACED_SRC:
        p = gen_dir() / REPLACED_SRC[key]
        im = Image.open(p).convert("RGBA")
        im = key_magenta(im)
        im = key_out_flat_bg(im)
        im = strip_light_halo(im)
        return im
    return Image.open(CARD_DIR / f"{key}.png").convert("RGBA")


def extract_book(html: str) -> dict[str, Image.Image]:
    items = re.findall(r'(nat\w+):\s*"(data:image/[^"]+)"', html)
    out = {}
    for k, u in items:
        raw = base64.b64decode(u.split(",", 1)[1])
        out[k] = Image.open(io.BytesIO(raw)).convert("RGBA")
    return out


def data_url(im: Image.Image) -> str:
    return "data:image/png;base64," + base64.b64encode(to_png_bytes(im)).decode("ascii")


def js_map(name: str, mapping: dict[str, Image.Image], quote: str = "'") -> str:
    lines = [f"const {name} = {{"]
    for k, im in mapping.items():
        lines.append(f"  {k}:{quote}{data_url(im)}{quote},")
    lines.append("};")
    return "\n".join(lines)


def replace_block(html: str, const_name: str, new_block: str) -> str:
    pat = re.compile(rf"const {const_name} = \{{.*?\n\}};", re.S)
    if not pat.search(html):
        raise SystemExit(f"could not find const {const_name}")
    return pat.sub(new_block, html, count=1)


def main() -> None:
    html = HTML.read_text(encoding="utf-8")
    print("=== word cards ===")
    word_out: dict[str, Image.Image] = {}
    for p in sorted(CARD_DIR.glob("*.png")):
        key = p.stem
        src = load_card(key)
        before = metrics(Image.open(p).convert("RGBA"))
        out = unify(src, force_stroke=False)
        after = metrics(out)
        word_out[key] = out
        out.save(p, format="PNG", optimize=True)
        print(f"  {key:10} {before} -> {after}")

    print("=== Nat wall ===")
    WALL_DIR.mkdir(parents=True, exist_ok=True)
    wall_out: dict[str, Image.Image] = {}
    for k, im in extract_book(html).items():
        before = metrics(im)
        out = unify(im, force_stroke=False)
        after = metrics(out)
        wall_out[k] = out
        out.save(WALL_DIR / f"{k}.png", format="PNG", optimize=True)
        print(f"  {k:12} {before} -> {after}")

    # keep WORD_ILL key order as in original if present
    order = [
        "pit", "pin", "pan", "tap", "tip", "sip", "tin", "snap", "spin", "ten",
        "sun", "sock", "apple", "net", "at", "it", "an", "sap", "pip", "nip", "tan",
    ]
    word_ordered = {k: word_out[k] for k in order if k in word_out}
    for k, im in word_out.items():
        if k not in word_ordered:
            word_ordered[k] = im

    word_block = js_map("WORD_ILL", word_ordered, quote="'")
    wall_block = js_map("WALL_ILL", wall_out, quote="'")

    html2 = replace_block(html, "WORD_ILL", word_block)
    if "const WALL_ILL" in html2:
        html2 = replace_block(html2, "WALL_ILL", wall_block)
    else:
        html2 = html2.replace("const WORD_ILL = {", wall_block + "\nconst WORD_ILL = {", 1)

    old_src = "return (PHONEME_ILL && PHONEME_ILL[key]) || (BOOK_IMG && BOOK_IMG[key]) || (WORD_ILL && WORD_ILL[key]) || '';"
    new_src = "return (WALL_ILL && WALL_ILL[key]) || (PHONEME_ILL && PHONEME_ILL[key]) || (BOOK_IMG && BOOK_IMG[key]) || (WORD_ILL && WORD_ILL[key]) || '';"
    if old_src in html2:
        html2 = html2.replace(old_src, new_src, 1)
    elif new_src not in html2:
        raise SystemExit("illSrc chain not found")

    HTML.write_text(html2, encoding="utf-8")
    print("wrote", HTML, "bytes", HTML.stat().st_size)


if __name__ == "__main__":
    main()
