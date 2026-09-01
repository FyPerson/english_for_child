# -*- coding: utf-8 -*-
"""把周课件 HTML 的数据层抽成一份独立的 JS 文件。

两个用途：
  1. **给外部模型当范例**——第三周交给 GPT 写数据层时，附上第二周这份抽取结果，
     照着改比照着规范凭空写准得多（见 docs/第三周数据层交接_*.md）。
  2. **让自检脱离 HTML**——tools/week-checks/check_data.js 可以直接校验这份文件，
     于是"外部模型产出 → 立刻跑校验 → 不合格打回"这个循环不需要先装配进 HTML。

用法：
  python tools/extract_data_layer.py --target week02.html --out tools/week-checks/week02-data.js

抽取的内容 = 设计规范 §5.1 换周清单里属于"数据层"的那些常量，外加一个 META 块
（周次 / 存储键 / 两处积木架字母 / 点亮墙字母集 / 闪卡上限）——这些值在 HTML 里散落
在函数体和模板字符串里，独立文件必须显式声明出来，否则校验器无从得知。
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent

# (常量名, 起始 opener, 结束 closer)——顺序即输出顺序
BLOCKS = [
    ("RESERVED", "[", "];"),
    ("SOUNDS", "{", "\n};"),
    ("W", "{", "\n};"),
    ("WALL_HINT", "{", "\n};"),
    ("BOOK", "{", "\n};"),
    ("FIRST_TEACH_DAY", "{", "};"),
    ("G1_ROUNDS", "{", "\n};"),
    ("G1_THEME", "{", "\n};"),
    ("G3_PAIRS", "[", "];"),
    ("G4_WORDS", "[", "];"),
    ("G5_WHITELIST", "[", "\n];"),
    ("DAYS", "[", "\n];"),
]


def slice_const(html: str, name: str, opener: str, closer: str) -> str:
    anchor = f"const {name} = {opener}"
    n = html.count(anchor)
    if n != 1:
        raise SystemExit(f"`{anchor}` 在目标文件里出现 {n} 次，期望恰好 1 次")
    i = html.index(anchor)
    j = html.index(closer, i + len(anchor)) + len(closer)
    return html[i:j]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, help="周课件 HTML，如 week02.html")
    ap.add_argument("--out", required=True, help="输出的独立数据文件，如 week02-data.js")
    args = ap.parse_args()

    target = Path(args.target)
    if not target.is_absolute():
        target = ROOT / args.target
    out = Path(args.out)
    if not out.is_absolute():
        out = ROOT / args.out
    html = target.read_text(encoding="utf-8")

    # ── META：这些值在 HTML 里散落在函数体/模板串里，独立文件必须显式声明
    def need(pattern: str, what: str, flags=0) -> str:
        m = re.search(pattern, html, flags)
        if not m:
            raise SystemExit(f"抽不到{what}：正则 {pattern} 没命中")
        return m.group(1)

    key = need(r"const KEY = '(soundblocks-w\d+-v\d+)';", "存储键")
    week = int(re.search(r"soundblocks-w(\d+)-", key).group(1))
    racks = re.findall(r"const RACK_LETTERS = '([a-z]+)'\.split\(''\)", html)
    if len(racks) != 2:
        raise SystemExit(f"RACK_LETTERS 找到 {len(racks)} 处，期望 2 处（G4 与 G5 各一）")
    wall = need(r"\$\{'([a-z]+)'\.split\(''\)\.map\(c=>\{", "点亮墙字母集")
    cap = need(r"const FLASH_CAPACITY_BY_KEY = \{ (flash_words:\d+) \}", "闪卡成绩上限")
    alias = re.findall(r"^SOUNDS\.\w+ = Object\.assign\(.*?\);$", html, re.M)

    meta = f"""/* ==================================================================
   META —— 这些值在周课件 HTML 里散落在函数体和模板字符串里（积木架在 initG4 /
   initG5 内部、点亮墙字母集在 renderHome 的模板串里），独立数据文件必须显式声明，
   否则校验器无从得知。装配回 HTML 时要与这里一致。
   ================================================================== */
const META = {{
  week: {week},
  storageKey: '{key}',
  rackG4: '{racks[0]}',              // G4 点单积木架，每字母 1 块
  rackG5: '{racks[1]}',   // G5 造词积木架，每字母 1 块
  wallLetters: '{wall}',           // 首页积木点亮墙显示哪些字母
  flashCapacity: {{ {cap} }},        // 计时闪卡成绩上限 = 本周计时闪卡实际条数
}};
"""

    parts = [
        "/* 第 %d 周数据层（由 tools/extract_data_layer.py 从 %s 抽出）。\n"
        "   契约与写法见 docs/第三周数据层交接_20260901_v1.0.md。\n"
        "   校验：node tools/week-checks/check_data.js %s */\n"
        % (week, target.name, out.name),
        meta,
    ]
    for name, opener, closer in BLOCKS:
        parts.append("\n" + slice_const(html, name, opener, closer) + "\n")
        if name == "SOUNDS" and alias:
            parts.append("\n".join(alias) + "\n")

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(parts), encoding="utf-8", newline="")   # newline="" 防止 Windows 把 LF 写成 CRLF（见 .gitattributes）
    kb = out.stat().st_size / 1024
    print(f"已抽出 {out}（{kb:.0f} KB）")
    print(f"  周次 {week} · 存储键 {key}")
    print(f"  积木架 G4='{racks[0]}'({len(racks[0])} 块) / G5='{racks[1]}'({len(racks[1])} 块)")
    print(f"  点亮墙 '{wall}' · 别名键 {len(alias)} 条")
    print(f"  常量 {len(BLOCKS)} 个")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
