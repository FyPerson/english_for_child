# -*- coding: utf-8 -*-
"""把插画规格化并注入周课件 HTML 的常量（PHONEME_ILL / WORD_ILL / BOOK_IMG / CELEBRATE_NAT）。

补的是设计规范 §11.1 里断掉的最后一步：图像模型出图 → unify_card_outlines 规格化
→ **注入 HTML**。第一周那次是用一次性脚本 tools/apply_unify.py 做的，但它写死了目标
HTML、写死了某个会话目录、写死了文件名映射，复用不了；该脚本与其目标 week01-v2.html
已于 2026-09-01 一并删除（见 git 历史 7f3eb85）。本脚本按目录约定和 art 键自动配对。

用法：
  python tools/embed_assets.py --target week02.html --assets assets/week02
  python tools/embed_assets.py --target week02.html --assets assets/week02 --dry-run
  python tools/embed_assets.py --target week02.html --assets assets/week02 --raw   # 跳过规格化

目录约定（文件名 = art 键，见 docs/插画生成提示词_第N周_*.md）：
  assets/week{NN}/phoneme/<键>.png      → PHONEME_ILL   （音素助记图，键取自 SOUNDS[].art）
  assets/week{NN}/word-cards/<词>.png   → WORD_ILL      （词卡插画，键取自 W[].art）
  assets/week{NN}/book/<键>.png         → BOOK_IMG      （小书插画，键取自 BOOK.pages[].art）
  assets/week{NN}/celebrate.png         → CELEBRATE_NAT （庆祝主角图，单张）
  assets/wall-nat/<键>.png              → WORD_ILL      （复用第一周已有的 Nat 动作原图；本周目录优先）
  下划线开头的文件一律跳过（角色定妆图等中间产物，不进课件）。

幂等：每次都从目录全量重建这四个常量再整体替换，可以边补图边重跑。
安全：任一环节出错都不写目标文件；成功时原子写出（先写 .tmp 再 os.replace）。
"""
from __future__ import annotations

import argparse
import base64
import os
import re
import sys
from pathlib import Path

# Windows 控制台默认 codepage 打不全中文/符号
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

# 目录名 → (常量名, 中文说明)
DIR_MAP = {
    "phoneme": ("PHONEME_ILL", "音素助记图"),
    "word-cards": ("WORD_ILL", "词卡插画"),
    "book": ("BOOK_IMG", "小书插画"),
}
IMG_EXT = {".png", ".webp"}


# ────────────────────────────── 从目标 HTML 读出「谁引用了哪些 art 键」
def slice_const(html: str, name: str, opener: str = "{", closer: str = "\n};") -> str:
    """抠出 `const NAME = {` … `\\n};` 之间的整段（含两端）。"""
    anchor = f"const {name} = {opener}"
    n = html.count(anchor)
    if n != 1:
        raise SystemExit(f"在目标文件里找到 {n} 处 `{anchor}`，期望恰好 1 处")
    i = html.index(anchor)
    j = html.index(closer, i + len(anchor)) + len(closer)
    return html[i:j]


ART_RE = re.compile(r"art:\s*'([A-Za-z0-9_]+)'")
THEME_ART_RE = re.compile(r"(?:icon|targetArt):\s*'([A-Za-z0-9_]+)'")


def referenced_keys(html: str) -> dict[str, set[str]]:
    """按常量归类出数据层实际引用到的 art 键。

    G1_THEME 的 icon / targetArt 走 illSrc 的四表联查，落在 PHONEME_ILL 或 WORD_ILL——
    这里不猜它落在哪张表，两张都算「可接受」，由目录里实际放了哪张图决定。
    """
    # 音素助记图只有「本周真的会渲染 sound 块」的那些音素才需要——SOUNDS 是跨周累计的，
    # 旧音的记录仍在（快闪复习要读它们的 ipa/mem），但第二周不会再打开旧音的音素实验室，
    # 那几张助记图不该催着生成。只取 DAYS 里出现过 {b:'sound', s:'X'} 的 X。
    days_blk = slice_const(html, "DAYS", "[", "\n];")
    live_sounds = set(re.findall(r"\{b:'sound',\s*s:'(\w+)'\}", days_blk))
    sounds_blk = slice_const(html, "SOUNDS")
    live_arts = set()
    for m in re.finditer(r"^  (\w+):\{.*?(?=^  \w+:\{|^\};)", sounds_blk, re.S | re.M):
        if m.group(1) in live_sounds:
            live_arts |= set(ART_RE.findall(m.group(0)))

    refs = {
        "PHONEME_ILL": live_arts,
        "WORD_ILL": set(ART_RE.findall(slice_const(html, "W"))),
        "BOOK_IMG": set(ART_RE.findall(slice_const(html, "BOOK"))),
    }
    theme = set(THEME_ART_RE.findall(slice_const(html, "G1_THEME")))
    refs["_G1_THEME"] = theme          # 两表通吃，单独记账
    return refs


# ────────────────────────────── 规格化 + 编码
CELEBRATE_PX = 384          # 庆祝图显示 190px，按 @2x 出图；词卡/助记图仍用 unify 默认的 192

def load_png(path: Path, raw: bool, size: int | None = None) -> bytes:
    data = path.read_bytes()
    if raw:
        return data
    from PIL import Image                      # 延迟导入：--raw 时不需要 Pillow
    from unify_card_outlines import unify, to_png_bytes, metrics, TARGET
    im = Image.open(path).convert("RGBA")
    before = metrics(im)
    im = unify(im, size=size or TARGET)
    after = metrics(im)
    print(f"    规格化 {path.name}: {before['size']} → {after['size']}"
          f"，主体占比 {before['bbox']}% → {after['bbox']}%，暗边 {after['dk']}%")
    return to_png_bytes(im)


def to_data_uri(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


# ────────────────────────────── 生成常量文本
def render_map(name: str, entries: dict[str, str], note: str) -> str:
    if not entries:
        return f"const {name} = {{\n  /* {note}：目录里还没有图。 */\n}};"
    lines = [f"const {name} = {{", f"  /* {note}：由 tools/embed_assets.py 从素材目录注入，勿手改。 */"]
    for k in sorted(entries):
        lines.append(f"  {k}:'{entries[k]}',")
    lines[-1] = lines[-1].rstrip(",")
    lines.append("};")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, help="周课件 HTML，如 week02.html")
    ap.add_argument("--assets", required=True, help="本周素材目录，如 assets/week02")
    ap.add_argument("--raw", action="store_true", help="跳过 unify 规格化，按原样内嵌")
    ap.add_argument("--dry-run", action="store_true", help="只报告，不写文件")
    args = ap.parse_args()

    target = Path(args.target)
    if not target.is_absolute():
        target = ROOT / args.target
    assets = Path(args.assets)
    if not assets.is_absolute():
        assets = ROOT / args.assets
    if not target.exists():
        raise SystemExit(f"找不到目标文件：{target}")
    if not assets.exists():
        raise SystemExit(f"找不到素材目录：{assets}\n"
                         f"目录约定见本脚本头部注释，或 docs/插画生成提示词_第N周_*.md §0")

    print(f"目标：{target}")
    print(f"素材：{assets}")
    html = target.read_text(encoding="utf-8")
    refs = referenced_keys(html)
    theme_refs = refs.pop("_G1_THEME")

    built: dict[str, dict[str, str]] = {c: {} for c, _ in DIR_MAP.values()}
    problems: list[str] = []

    for sub, (const, note) in DIR_MAP.items():
        d = assets / sub
        if not d.exists():
            print(f"\n[{const}] {note}：目录 {d.relative_to(ROOT)} 不存在，跳过")
            continue
        files = sorted(f for f in d.iterdir()
                       if f.suffix.lower() in IMG_EXT and not f.name.startswith("_"))
        print(f"\n[{const}] {note}：{len(files)} 张")
        for f in files:
            key = f.stem
            # 孤儿图：文件在、但数据层没有任何地方引用这个键
            if key not in refs[const] and key not in theme_refs:
                problems.append(f"孤儿图 {f.relative_to(ROOT)}：art 键 '{key}' 没有被数据层引用，未注入")
                continue
            built[const][key] = to_data_uri(load_png(f, args.raw))

    # 第一周已经生成过一套 Nat 动作 PNG。后续周若在 W[].art 里显式引用同名键，
    # 直接复用这批原图；本周 word-cards 目录若有同名素材，仍以本周版本优先。
    # 共享图已经是 192×192 RGBA 的课件成品，因此按原始字节内嵌，不再二次规格化。
    shared_word_dir = ROOT / "assets" / "wall-nat"
    if shared_word_dir.exists():
        missing_word_keys = sorted(refs["WORD_ILL"] - set(built["WORD_ILL"]))
        reused = []
        for key in missing_word_keys:
            for ext in (".png", ".webp"):
                source = shared_word_dir / f"{key}{ext}"
                if source.exists():
                    built["WORD_ILL"][key] = to_data_uri(source.read_bytes())
                    reused.append(source.relative_to(ROOT))
                    break
        if reused:
            print("\n[WORD_ILL] 复用第一周 Nat 原图：" + ", ".join(map(str, reused)))

    # 庆祝主角图（单张）
    celebrate = ""
    for cand in ("celebrate.png", "celebrate.webp"):
        p = assets / cand
        if p.exists():
            print(f"\n[CELEBRATE_NAT] 庆祝主角图：{cand}")
            celebrate = to_data_uri(load_png(p, args.raw, CELEBRATE_PX))
            break
    else:
        print("\n[CELEBRATE_NAT] 庆祝主角图：素材目录里没有 celebrate.png，保持现状为空")

    # 缺图报告：数据层写了 art 键但目录里没有对应文件
    print("\n===== 覆盖情况 =====")
    for sub, (const, note) in DIR_MAP.items():
        want, got = refs[const], set(built[const])
        missing = sorted(want - got)
        print(f"{const:14s} {len(got)}/{len(want)} 已就位"
              + (f"，还缺：{missing}" if missing else "，全齐"))
    theme_missing = sorted(k for k in theme_refs
                           if not any(k in built[c] for c in built))
    if theme_missing:
        print(f"G1_THEME 引用但缺图：{theme_missing}（会走 hasIll 降级，不报错）")

    if problems:
        print("\n===== 需要注意 =====")
        for p in problems:
            print("  ·", p)

    total = sum(len(v) for v in built.values()) + (1 if celebrate else 0)
    if total == 0:
        print("\n没有任何图可注入，目标文件未改动。")
        return 0

    # ── 整体替换四个常量
    new_html = html
    for sub, (const, note) in DIR_MAP.items():
        old = slice_const(new_html, const)
        new_html = new_html.replace(old, render_map(const, built[const], note), 1)
    # CELEBRATE_NAT 是单行常量，且行尾可能带注释——必须整行替换。
    # 用「找 `';` 当结束」会踩坑：空值时该行是 `= '';   /* 注释 */`，`';\n` 在本行匹配不上，
    # 就会一路吞到文件后面某处的 `';\n`，把中间的代码整段吃掉（实测踩过一次）。
    cel_re = re.compile(r"^const CELEBRATE_NAT = '[^']*';.*$", re.M)
    if len(cel_re.findall(new_html)) != 1:
        raise SystemExit(f"CELEBRATE_NAT 行匹配到 {len(cel_re.findall(new_html))} 处，期望恰好 1 处")
    new_c = (f"const CELEBRATE_NAT = '{celebrate}';   /* 由 tools/embed_assets.py 注入，勿手改 */"
             if celebrate
             else "const CELEBRATE_NAT = '';   /* 庆祝主角图尚未就位，页面只放彩带 */")
    new_html = cel_re.sub(lambda _m: new_c, new_html, count=1)

    before_kb, after_kb = len(html) / 1024, len(new_html) / 1024
    print(f"\n注入 {total} 张图：{before_kb:.0f} KB → {after_kb:.0f} KB"
          f"（+{after_kb - before_kb:.0f} KB）")

    if args.dry_run:
        print("--dry-run：目标文件未写入。")
        return 0

    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(new_html, encoding="utf-8", newline="")   # newline="" 防止 Windows 把 LF 写成 CRLF（见 .gitattributes）
    os.replace(tmp, target)
    print(f"已原子写出 {target.name}")
    print("下一步：跑一遍自检——"
          f"node tools/week-checks/check_data.js {target.name} && "
          f"python tools/week-checks/smoke_w2_browser.py {target.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
