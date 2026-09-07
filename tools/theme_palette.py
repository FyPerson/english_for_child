"""Weekly theme palettes for the lesson templates (design spec §3.1: change the hue, keep the lightness ladder).

Generates the first-layer tokens (ground, surface, surface-2, sunk, line, line-2, ink, ink-2, ink-3, tile-face,
tile-edge) for the light block and the two dark blocks of a week template from one hue, validates them against the
spec (CIELAB L* of the ground: light 93 to 95.5, dark 10 to 12; ink on every background it sits on >= 7:1, ink-2
>= 4.5:1; lines visibly separated from the ground) and writes them into the template. Semantic colors (vowel, cons,
accent, ok) are never touched.

Usage:
  python tools/theme_palette.py --set A --dry-run          # show the four weeks of set A and their checks
  python tools/theme_palette.py --set A --apply            # write set A into week01..week04 templates
  python tools/theme_palette.py --week 5 --hue 120 --name 青草 --apply   # a new week: pick a hue, apply to its template
"""
import argparse
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from project_config import ROOT

TOKENS = ['ground', 'surface', 'surface-2', 'sunk', 'line', 'line-2', 'ink', 'ink-2', 'ink-3', 'tile-face', 'tile-edge']
SEMANTIC_SOFT = {   # fixed semantic soft backgrounds the ink also sits on; they do not change per week
    'light': ['#FBE7E2', '#E0EEF1', '#FBF0DA', '#E4EFE4'],
    'dark': ['#3A211B', '#12313A', '#372A13', '#1B2D1D'],
}
SETS = {
    'A': [(165, '薄荷'), (300, '香芋'), (235, '天空'), (45, '蜜桃')],
    'B': [(100, '柠檬'), (350, '樱花'), (200, '海盐'), (320, '葡萄')],
}
LIGHT_GROUND_L = (93.0, 95.5)
DARK_GROUND_L = (10.0, 12.0)


def oklch_to_srgb(L, C, h):
    a = C * math.cos(math.radians(h)); b = C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    def gam(x):
        x = max(0.0, min(1.0, x))
        return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    return tuple(round(gam(v) * 255) for v in (r, g, bb))


def hexs(rgb):
    return '#%02X%02X%02X' % tuple(rgb)


def parse_hex(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def linear(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    r, g, b = (linear(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def cielab_L(rgb):
    y = luminance(rgb)
    fy = y ** (1 / 3) if y > 0.008856 else 7.787 * y + 16 / 116
    return 116 * fy - 16


def oklch_L_for_lab_L(target_L, chroma, hue):
    """Bisect the OKLCH lightness that yields the target CIELAB L* for this hue (L* drifts with hue at fixed OKLCH L)."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if cielab_L(oklch_to_srgb(mid, chroma, hue)) < target_L:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


LIGHT_GROUND_TARGET, DARK_GROUND_TARGET = 94.5, 11.0


def week(hue, name, chroma=0.045):
    """Light and dark token sets for one hue: the ground is solved to the spec's CIELAB L*, the ladder is relative."""
    c = chroma
    Lg = oklch_L_for_lab_L(LIGHT_GROUND_TARGET, c, hue)
    light = {
        'ground': oklch_to_srgb(Lg, c, hue), 'surface': (255, 255, 255), 'surface-2': oklch_to_srgb(min(Lg + 0.02, 0.985), c * 0.55, hue),
        'sunk': oklch_to_srgb(Lg - 0.035, c * 0.9, hue), 'line': oklch_to_srgb(Lg - 0.07, c * 0.9, hue), 'line-2': oklch_to_srgb(Lg - 0.155, c, hue),
        'ink': oklch_to_srgb(0.27, 0.025, hue), 'ink-2': oklch_to_srgb(0.49, 0.03, hue), 'ink-3': oklch_to_srgb(0.63, 0.025, hue),
        'tile-face': (255, 255, 255), 'tile-edge': oklch_to_srgb(Lg - 0.135, 0.04, hue),
    }
    Ld = oklch_L_for_lab_L(DARK_GROUND_TARGET, 0.022, hue)
    dark = {   # ground CIELAB L* 11 (spec 10 to 12), then the same ladder upwards
        'ground': oklch_to_srgb(Ld, 0.022, hue), 'surface': oklch_to_srgb(Ld + 0.05, 0.024, hue), 'surface-2': oklch_to_srgb(Ld + 0.09, 0.026, hue),
        'sunk': oklch_to_srgb(Ld - 0.04, 0.018, hue), 'line': oklch_to_srgb(Ld + 0.15, 0.03, hue), 'line-2': oklch_to_srgb(Ld + 0.23, 0.035, hue),
        'ink': oklch_to_srgb(0.95, 0.012, hue), 'ink-2': oklch_to_srgb(0.76, 0.02, hue), 'ink-3': oklch_to_srgb(0.62, 0.02, hue),
        'tile-face': oklch_to_srgb(Ld + 0.09, 0.026, hue), 'tile-edge': oklch_to_srgb(Ld + 0.25, 0.035, hue),
    }
    palette = {'name': name, 'hue': hue, 'light': {k: hexs(v) for k, v in light.items()}, 'dark': {k: hexs(v) for k, v in dark.items()}}
    palette['checks'] = validate(palette)
    return palette


def validate(palette):
    """Assert the spec; return the measured numbers. Raises ValueError with every violation listed."""
    problems, measured = [], {}
    for mode, ground_range, min_line_gap in (('light', LIGHT_GROUND_L, 0.08), ('dark', DARK_GROUND_L, 0.02)):
        t = {k: parse_hex(v) for k, v in palette[mode].items()}
        L = cielab_L(t['ground'])
        measured[f'{mode} ground L*'] = round(L, 1)
        if not ground_range[0] <= L <= ground_range[1]:
            problems.append(f'{mode} ground L* {L:.1f} outside {ground_range}')
        backgrounds = {'ground': t['ground'], 'surface': t['surface'], 'surface-2': t['surface-2'], 'sunk': t['sunk']}
        backgrounds.update({f'soft{i}': parse_hex(h) for i, h in enumerate(SEMANTIC_SOFT[mode])})
        for bg_name, bg in backgrounds.items():
            for ink, need in (('ink', 7.0), ('ink-2', 4.5)):
                ratio = contrast(t[ink], bg)
                measured[f'{mode} {ink}/{bg_name}'] = round(ratio, 1)
                if ratio < need:
                    problems.append(f'{mode} {ink} on {bg_name} is {ratio:.1f}:1, need {need}:1')
        gap = abs(luminance(t['line']) - luminance(t['ground']))
        measured[f'{mode} line gap'] = round(gap, 3)
        if gap < min_line_gap:
            problems.append(f'{mode} line is not visibly separated from ground (luminance gap {gap:.3f})')
        if mode == 'light' and (palette['light']['surface'] != '#FFFFFF' or palette['light']['tile-face'] != '#FFFFFF'):
            problems.append('light surface and tile-face must stay #FFFFFF')
    if problems:
        raise ValueError(f'{palette["name"]} (hue {palette["hue"]}): ' + '; '.join(problems))
    return measured


BLOCKS = [('light', r':root\{'),
          ('media-dark', r'@media \(prefers-color-scheme: *dark\)\{\s*:root:not\(\[data-theme="light"\]\)\{'),
          ('theme-dark', r':root\[data-theme="dark"\]\{')]


def block_spans(text):
    spans = []
    for kind, pattern in BLOCKS:
        m = re.search(pattern, text)
        if not m:
            raise SystemExit(f'template block {kind} not found')
        start = m.end()
        spans.append((start, text.index('}', start), kind))
    return spans


def apply_to_text(text, palette):
    """Return the template text with the three blocks rewritten; every token must occur exactly once per block."""
    out = text
    for start, end, kind in sorted(block_spans(text), reverse=True):
        body = text[start:end]
        values = palette['light'] if kind == 'light' else palette['dark']
        for token in TOKENS:
            pattern = re.compile(r'(--' + re.escape(token) + r':)\s*#[0-9A-Fa-f]{6}')
            if len(pattern.findall(body)) != 1:
                raise SystemExit(f'{kind}: token --{token} must occur exactly once in the block')
            body = pattern.sub(lambda m: m.group(1) + values[token], body, count=1)
        out = out[:start] + body + out[end:]
    return out


def template_path(week_no):
    return ROOT / f'frontend/src/weeks/week{week_no:02}.template.html'


def apply(week_no, palette, dry=False):
    path = template_path(week_no)
    text = path.read_text(encoding='utf-8')
    out = apply_to_text(text, palette)
    changed = sum(1 for a, b in zip(text.split('\n'), out.split('\n')) if a != b)
    if not dry and out != text:
        path.write_text(out, encoding='utf-8', newline='\n')
    print(f'week{week_no:02} {palette["name"]} (hue {palette["hue"]}): {changed} lines {"would change" if dry else "changed"}; '
          f'ground {palette["light"]["ground"]} / {palette["dark"]["ground"]}; L* {palette["checks"]["light ground L*"]} / {palette["checks"]["dark ground L*"]}', flush=True)
    return changed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--set', choices=sorted(SETS), help='apply a named four-week set to week01..week04')
    ap.add_argument('--week', type=int, help='apply one palette to this week template')
    ap.add_argument('--hue', type=float, help='OKLCH hue in degrees for --week')
    ap.add_argument('--name', default='', help='display name for --week')
    ap.add_argument('--apply', action='store_true', help='write the templates (default: dry run)')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    dry = not args.apply or args.dry_run
    if args.set:
        for n, (hue, name) in enumerate(SETS[args.set], 1):
            apply(n, week(hue, name), dry)
    elif args.week is not None and args.hue is not None:
        apply(args.week, week(args.hue, args.name or f'hue {args.hue:g}'), dry)
    else:
        ap.error('give --set, or --week with --hue')


if __name__ == '__main__':
    main()
