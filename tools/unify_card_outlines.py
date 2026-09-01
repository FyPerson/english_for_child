"""Unify word-card / wall-Nat silhouettes.

Spec (192px square):
- dark cartoon stroke #232B28, ~3px, only if the alpha edge is light
- no cream/white outer halo
- opaque bbox 70–88% of the canvas (target ~78%), 8–16px padding
- transparent background
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter

INK = (35, 43, 40, 255)
TARGET = 192
PAD_FRAC = 8 / 192  # 8px on the long side; subject ~91.7% of that axis
STROKE = 3
LUM_HALO = 185
DARK_EDGE_PCT = 45.0


def _alpha_edge(opaque: np.ndarray) -> np.ndarray:
    up = np.zeros_like(opaque)
    up[1:] = opaque[:-1]
    dn = np.zeros_like(opaque)
    dn[:-1] = opaque[1:]
    lf = np.zeros_like(opaque)
    lf[:, 1:] = opaque[:, :-1]
    rt = np.zeros_like(opaque)
    rt[:, :-1] = opaque[:, 1:]
    return opaque & ~(up & dn & lf & rt)


def _dark_edge_pct(a: np.ndarray) -> float:
    opaque = a[:, :, 3] > 16
    if not opaque.any():
        return 0.0
    lum = a[:, :, :3].astype(float).mean(2)
    edge = _alpha_edge(opaque)
    if not edge.any():
        return 0.0
    return float((lum[edge] < 70).mean() * 100)


def key_out_flat_bg(im: Image.Image, sat_min: int = 40) -> Image.Image:
    """If corners share a near-flat saturated (or white) fill, punch it to alpha."""
    a = np.array(im.convert("RGBA"))
    h, w = a.shape[:2]
    corner_alpha = np.array([a[0, 0, 3], a[0, w - 1, 3], a[h - 1, 0, 3], a[h - 1, w - 1, 3]])
    if (corner_alpha < 16).all():
        return Image.fromarray(a)
    corners = np.stack([
        a[0, 0, :3], a[0, w - 1, :3], a[h - 1, 0, :3], a[h - 1, w - 1, :3]
    ]).astype(float)
    if corners.std() > 18:
        return Image.fromarray(a)
    bg = corners.mean(0)
    rgb = a[:, :, :3].astype(float)
    dist = np.sqrt(((rgb - bg) ** 2).sum(2))
    sat = rgb.max(2) - rgb.min(2)
    lum = rgb.mean(2)
    bg_lum = float(bg.mean())
    if bg_lum > 245 and sat.mean() < 12:
        mask = (lum > 242) & (sat < 18)
    else:
        mask = dist < 28
    a[mask, 3] = 0
    return Image.fromarray(a)


def strip_light_halo(im: Image.Image, max_pass: int = 5) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    for _ in range(max_pass):
        opaque = a[:, :, 3] > 16
        if not opaque.any():
            break
        edge = _alpha_edge(opaque)
        rgb = a[:, :, :3].astype(float)
        lum = rgb.mean(2)
        sat = rgb.max(2) - rgb.min(2)
        halo = edge & (lum > LUM_HALO) & (sat < 42)
        if not halo.any():
            break
        a[halo, 3] = 0
    return Image.fromarray(a)


def add_dark_stroke(im: Image.Image, width: int = STROKE) -> Image.Image:
    rgba = im.convert("RGBA")
    alpha = rgba.split()[-1]
    if alpha.getextrema()[1] == 0:
        return rgba
    k = max(3, width * 2 + 1)
    if k % 2 == 0:
        k += 1
    dilated = alpha.filter(ImageFilter.MaxFilter(k))
    ring = ImageChops.subtract(dilated, alpha)
    stroke_layer = Image.new("RGBA", rgba.size, INK)
    out = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    out.paste(stroke_layer, mask=dilated)
    out.paste(rgba, mask=alpha)
    # if original already had a dark edge, the ring still sits outside it
    _ = ring
    return out


def recrop(im: Image.Image, size: int = TARGET, pad_frac: float = PAD_FRAC) -> Image.Image:
    a = np.array(im.convert("RGBA"))
    opaque = a[:, :, 3] > 16
    if not opaque.any():
        return Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ys, xs = np.where(opaque)
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    crop = Image.fromarray(a[y0:y1, x0:x1])
    bw, bh = crop.size
    pad = max(8, int(round(size * pad_frac)))
    inner = size - 2 * pad  # long side fills inner; short side stays proportional
    scale = min(inner / bw, inner / bh)
    nw, nh = max(1, int(round(bw * scale))), max(1, int(round(bh * scale)))
    resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def unify(im: Image.Image, force_stroke: bool = False, size: int = TARGET) -> Image.Image:
    """size 默认 TARGET(192)=词卡/助记图规格。庆祝图显示 190px 且是全屏动画主角，
    需要 384（@2x）才不发虚——第一周就是 384，别用 192 覆盖它。"""
    im = key_out_flat_bg(im)
    im = strip_light_halo(im)
    dk = _dark_edge_pct(np.array(im.convert("RGBA")))
    if force_stroke or dk < DARK_EDGE_PCT:
        im = add_dark_stroke(im, STROKE)
    return recrop(im, size)


def metrics(im: Image.Image) -> dict:
    a = np.array(im.convert("RGBA"))
    h, w = a.shape[:2]
    opaque = a[:, :, 3] > 16
    fill = float(opaque.mean() * 100)
    if opaque.any():
        ys, xs = np.where(opaque)
        bbox = ((xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1)) / (w * h) * 100
    else:
        bbox = 0.0
    return {
        "fill": round(fill, 1),
        "bbox": round(bbox, 1),
        "dk": round(_dark_edge_pct(a), 1),
        "size": f"{w}x{h}",
    }


def to_png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
