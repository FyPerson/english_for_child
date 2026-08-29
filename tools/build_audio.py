# -*- coding: utf-8 -*-
"""构建管线：按 tools/audio_manifest.json 对 assets/audio_raw/ 的 56 条 mp3 做
后处理（裁头尾静音 + 峰值归一），产出 assets/audio_processed/，并在自检全绿后
把 WORD_AUDIO 注入 week01-v3.html。

规格来源：docs/声音积木v3游戏版实施规格_20260829_v1.3.md §1（后处理参数）+ §10
（build_audio.py 七项自检契约）；本次实现的目录/ffmpeg 来源/处理链/注入锚/原子
写出/提取源注册表设计均由主会话在 S2 派单 spec 草稿中拍板，本文件照此实现。

用法：
  python tools/build_audio.py --no-inject   # 只跑「处理 + 自检①-⑥」，不碰 week01-v3.html
  python tools/build_audio.py                # 处理 + 自检七项全部 + 注入 + 原子写出

设计要点（对应 S2 spec 草稿 1-6 条）：
  1. 目录：raw=assets/audio_raw/（只读）→ processed=assets/audio_processed/（新建，可覆盖重跑）
  2. ffmpeg：imageio_ffmpeg.get_ffmpeg_exe()，不装 pydub
  3. 处理链：每条两遍 ffmpeg（测量 → 处理），处理后再复测验证
  4. 注入锚：/* WORD_AUDIO_INJECT_START */ ... /* WORD_AUDIO_INJECT_END */ 标记对，
     首跑替换占位符 `const WORD_AUDIO = {};`，重跑替换标记对本身（幂等）
  5. 原子写出：先写 .tmp 再 os.replace；任一自检失败 = 非零退出，不写 week01-v3.html
  6. 七项自检：见下方 check1..check7，失败即整体非零退出

产物边界（M4，S2 预筛裁定）：assets/audio_processed/ 是**可重建缓存**，不是交付物——
删掉整个目录重跑一次 `python tools/build_audio.py --no-inject` 即可从 raw 完全重建；
本脚本唯一的真正输出是 week01-v3.html（原子写出，见 atomic_write）。配合 H1 修复
（process_one 编码前 unlink 旧 processed 文件），杜绝"这次 ffmpeg 实际失败，但目录里
还留着上一次成功跑的同名旧文件，自检误判通过"的陈旧缓存复用风险。
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Windows 控制台默认 codepage（如 GBK）打不出 ⊆ 等符号也认不全中文输出，
# 统一切到 UTF-8（stdout/stderr 均需要，避免 print 中途抛 UnicodeEncodeError）。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "tools" / "audio_manifest.json"
RAW_DIR = ROOT / "assets" / "audio_raw"          # 禁区：只读
PROCESSED_DIR = ROOT / "assets" / "audio_processed"
TARGET_HTML = ROOT / "week01-v3.html"

# ---------------- 后处理参数（规格 §1，S2 spec 草稿第 3 条冻结） ----------------
SILENCE_THRESHOLD_DB = -40          # 裁静音阈值
HEAD_TAIL_SILENCE_D = 0.08          # 首尾静音验证窗口：80ms
TARGET_PEAK_DBFS = -3.0             # 峰值归一目标
PEAK_TOLERANCE_DB = 1.0             # 容差 ±1dB → 验收区间 [-4,-2]
PEAK_LOW = TARGET_PEAK_DBFS - PEAK_TOLERANCE_DB
PEAK_HIGH = TARGET_PEAK_DBFS + PEAK_TOLERANCE_DB

# ---------------- 注入锚（S2 spec 草稿第 4 条） ----------------
INJECT_START = "/* WORD_AUDIO_INJECT_START */"
INJECT_END = "/* WORD_AUDIO_INJECT_END */"
PLACEHOLDER = "const WORD_AUDIO = {};"
DATAURI_PREFIX = "data:audio/mpeg;base64,"

VOLUME_RE = re.compile(r"max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB")
DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
SILENCE_START_RE = re.compile(r"silence_start:\s*(-?\d+(?:\.\d+)?)")
SILENCE_END_RE = re.compile(r"silence_end:\s*(-?\d+(?:\.\d+)?)\s*\|\s*silence_duration:\s*(-?\d+(?:\.\d+)?)")


# ======================================================================
# 基础设施：ffmpeg 二进制 / manifest 加载
# ======================================================================
def get_ffmpeg_exe() -> str:
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run_ffmpeg(ffmpeg: str, args: list[str]) -> tuple[int, str]:
    """跑一次 ffmpeg，返回 (returncode, stderr 全文)（ffmpeg 的分析类 filter 输出都在 stderr）。
    H1 修复：调用方必须核对 returncode——非零退出即判处理/测量失败，不能只看 stderr 里
    有没有碰巧解析出数字（decode 失败等场景 stderr 里也可能残留旧格式文本导致误判通过）。
    C4 修复：加 timeout=60s，防止个别损坏/异常输入让 ffmpeg 挂死拖垮整条流水线；
    超时视同失败，returncode 用 -1 这个不可能出现的合法值占位，调用方现有的
    `rc != 0` 判定天然覆盖，不需要额外分支。"""
    try:
        proc = subprocess.run(
            [ffmpeg, "-hide_banner", "-nostdin", *args],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding="utf-8", errors="replace",
            timeout=60,
        )
    except subprocess.TimeoutExpired as e:
        return -1, f"ffmpeg 超时（60s）被终止：{e}"
    return proc.returncode, (proc.stderr or "")


def load_manifest() -> dict:
    m = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return m


def reserved_set(manifest: dict) -> set[str]:
    return set(k.lower() for k in manifest["reserved_blacklist"])


# ======================================================================
# C3（合并审 medium，已裁定采纳）：manifest 每条 file 字段的路径安全前置闸——
# 必须在任何 unlink/ffmpeg 调用之前跑完并通过，否则拒绝继续。两件事：
#   ① file 必须是纯文件名：非绝对路径、无盘符、无目录分隔符/父目录穿越
#     （`Path(f).name != f` 一个条件就能同时抓住这几种情况——只要含目录分隔符
#     或盘符，取 .name 后就不再等于原字符串）。
#   ② 文件名冲突检查改用 casefold 后的集合：check1 的 set(files) 是大小写敏感
#     的字符串去重，抓不住"At.mp3" vs "at.mp3"这种在 Windows 文件系统里会互相
#     覆盖、但作为 Python 字符串并不相等的真实冲突。
# ======================================================================
def check_manifest_paths(manifest: dict) -> tuple[bool, list[str]]:
    problems: list[str] = []
    for it in manifest["items"]:
        f = it["file"]
        p = Path(f)
        if p.is_absolute() or p.drive or p.name != f:
            problems.append(f"key={it['key']!r} file={f!r} 不是合法纯文件名（疑似绝对路径/盘符/含目录分隔符）")

    by_casefold: dict[str, list[str]] = {}
    for it in manifest["items"]:
        by_casefold.setdefault(it["file"].casefold(), []).append(it["file"])
    for cf, names in by_casefold.items():
        distinct = sorted(set(names))
        if len(distinct) > 1:
            problems.append(f"文件名仅大小写不同、Windows 文件系统会视为同一文件：{distinct}")

    return (not problems), problems


# ======================================================================
# 自检① 唯一性断言
# ======================================================================
def check1_uniqueness(manifest: dict) -> tuple[bool, str]:
    items = manifest["items"]
    keys = [it["key"] for it in items]
    files = [it["file"] for it in items]
    n = len(items)
    n_keys = len(set(keys))
    n_files = len(set(files))
    ok = (n == 56 and n_keys == n == n_files)
    detail = f"条目数={n}，去重键数={n_keys}，去重文件名数={n_files}（期望三者均=56）"
    return ok, detail


# ======================================================================
# 自检② 黑名单断言（manifest / 待注入 WORD_AUDIO 键集合）
# ======================================================================
def check2_blacklist_manifest(manifest: dict) -> tuple[bool, str]:
    reserved = reserved_set(manifest)
    leaked = [it["key"] for it in manifest["items"] if it["key"].lower() in reserved]
    ok = not leaked
    detail = "manifest 无保留词泄漏" if ok else f"manifest 泄漏保留词键：{leaked}"
    return ok, detail


# ======================================================================
# 自检③④ 提取源注册表 —— 对 week01-v3.html 数据字面量层提取运行时键
# 每个源：(名称, 正则/提取函数)；任一源提取结果为空 = 失败（防正则静默失效）
# 现有源：SOUNDS[*].demo / DAYS words|sight|sentences 块 items / WALL_HINT /
#   BOOK.pages[].line / G1_ROUNDS（S3：G1 声音抓抓乐两轮 pos/neg 题库）/
#   G3_PAIRS（U1：G3 两扇门分流词对）/ G4_WORDS（U2：G4 点单题库）。
#   G5 白名单尚未在 v3 落地（P2 待落），留位。
# ======================================================================
DEMO_BLOCK_RE = re.compile(r"demo:\[(.*?)\]\}", re.S)
WORDS_BLOCK_RE = re.compile(r"\{b:'words',\s*items:\[(.*?)\]\}", re.S)
SIGHT_BLOCK_RE = re.compile(r"\{b:'sight',\s*items:\[(.*?)\]\}", re.S)
SENTENCES_BLOCK_RE = re.compile(r"\{b:'sentences',\s*items:\[(.*?)\]\}", re.S)
WALL_HINT_BLOCK_RE = re.compile(r"const WALL_HINT\s*=\s*\{(.*?)\};", re.S)
BOOK_PAGES_BLOCK_RE = re.compile(r"pages:\[(.*?)\]\s*\};", re.S)
G1_ROUNDS_BLOCK_RE = re.compile(r"const G1_ROUNDS\s*=\s*\{(.*?)\n\};", re.S)
G1_LIST_RE = re.compile(r"(?:pos|neg):\[([^\]]*)\]")
G1_ROUND_ENTRY_RE = re.compile(r"(\w+):\s*\{\s*pos:\[([^\]]*)\],\s*neg:\[([^\]]*)\]\s*\}")
# U1 新增：G3 两扇门分流常量 const G3_PAIRS = [['sat','sit'], ...]; ——单行/多行
# 都行，非贪婪到第一个 "];"（内层每对只以 ']' 收尾，不带分号，真正的顶层收尾
# 才有 '];'，不会被内层提前截断）。
G3_PAIRS_BLOCK_RE = re.compile(r"const G3_PAIRS\s*=\s*\[(.*?)\];", re.S)
G3_PAIR_RE = re.compile(r"\[\s*'([^']*)'\s*,\s*'([^']*)'\s*\]")
# U2 新增：G4 点单游戏题库 const G4_WORDS = ['at','it',...]; ——扁平字符串数组，
# 非贪婪到第一个 "];"（数组内没有更早的 "];" 子串，够用）。
G4_WORDS_BLOCK_RE = re.compile(r"const G4_WORDS\s*=\s*\[(.*?)\];", re.S)

PAIR_FIRST_RE = re.compile(r"\[\s*'([^']*)'\s*,")
FLAT_STR_RE = re.compile(r"'([^']*)'")
WALL_HINT_EN_RE = re.compile(r"en:\s*'([^']*)'")
BOOK_LINE_RE = re.compile(r"line:\s*'([^']*)'")

# ======================================================================
# C5（合并审 medium，已裁定采纳）：容器锚定——DEMO_BLOCK_RE/WORDS_BLOCK_RE/
# SIGHT_BLOCK_RE/SENTENCES_BLOCK_RE/BOOK_PAGES_BLOCK_RE 都是"在全文任意位置"
# 找形如 demo:[...]}/{b:'words',...}/pages:[...]}的通用模式，本身不知道自己
# 该长在 SOUNDS/DAYS/BOOK 里——万一将来别的常量里长出一个撞形状的字段，会被
# 静默一起吃进来。改成两层：先唯一定位 `const SOUNDS`/`const DAYS`/`const BOOK`
# 这几个顶层声明的起止边界（各断言恰好 1 个锚点），只在对应子串里跑现有正则；
# SOURCE_SPECS 的数量/去重断言保留为第二层，双保险。
# 边界判定用"下一个顶层 const 声明的起始位置"——本文件所有顶层 const 都独占
# 一行、不存在顶层 const 相互嵌套，够用，不需要写一个完整的花括号/字符串转义
# 感知的 JS 解析器。
# ======================================================================
TOP_CONST_RE = re.compile(r"^const\s+(\w+)\b", re.M)


def find_container_block(html: str, name: str) -> str:
    starts = [m.start() for m in TOP_CONST_RE.finditer(html) if m.group(1) == name]
    if len(starts) != 1:
        raise RuntimeError(
            f"顶层声明 'const {name}' 锚点数={len(starts)}（期望恰好 1 个），提取器容器锚定失败——"
            f"检查是否被重命名/重复声明/移出顶层作用域"
        )
    start = starts[0]
    all_starts = sorted(m.start() for m in TOP_CONST_RE.finditer(html))
    later = [s for s in all_starts if s > start]
    end = later[0] if later else len(html)
    return html[start:end]


def extract_sounds_demo(html: str) -> list[str]:
    block_html = find_container_block(html, "SOUNDS")
    keys = []
    for block in DEMO_BLOCK_RE.findall(block_html):
        keys.extend(PAIR_FIRST_RE.findall(block))
    return keys


def extract_days_words(html: str) -> list[str]:
    block_html = find_container_block(html, "DAYS")
    keys = []
    for block in WORDS_BLOCK_RE.findall(block_html):
        keys.extend(FLAT_STR_RE.findall(block))
    return keys


def extract_days_sight(html: str) -> list[str]:
    block_html = find_container_block(html, "DAYS")
    keys = []
    for block in SIGHT_BLOCK_RE.findall(block_html):
        keys.extend(PAIR_FIRST_RE.findall(block))
    return keys


def extract_days_sentences(html: str) -> list[str]:
    block_html = find_container_block(html, "DAYS")
    keys = []
    for block in SENTENCES_BLOCK_RE.findall(block_html):
        keys.extend(PAIR_FIRST_RE.findall(block))
    return keys


def extract_wall_hint(html: str) -> list[str]:
    # WALL_HINT_BLOCK_RE 本身已经是 `const WALL_HINT = {...}` 精确锚定，不属于
    # C5 范围（C5 明确只针对 SOUNDS/DAYS/BOOK 这类"通用模式在全文搜"的提取器）。
    keys = []
    for block in WALL_HINT_BLOCK_RE.findall(html):
        keys.extend(WALL_HINT_EN_RE.findall(block))
    return keys


def extract_book_lines(html: str) -> list[str]:
    block_html = find_container_block(html, "BOOK")
    keys = []
    for block in BOOK_PAGES_BLOCK_RE.findall(block_html):
        for raw_line in BOOK_LINE_RE.findall(block):
            # 运行时 initBook() 用 pageData.line.replace(/[""]/g,'') 规范化
            # （该字符类实际是两个 ASCII 双引号 0x22，非弯引号），提取器同步镜像
            keys.append(raw_line.replace('"', ''))
    return keys


def extract_g1_rounds(html: str) -> list[str]:
    """G1 声音抓抓乐两轮题库（S3 新增）：拉平 pos/neg 全词，供 check3/4 通用覆盖+黑名单检查。"""
    keys = []
    m = G1_ROUNDS_BLOCK_RE.search(html)
    if not m:
        return keys
    for lst in G1_LIST_RE.findall(m.group(1)):
        keys.extend(FLAT_STR_RE.findall(lst))
    return keys


def parse_g1_rounds_structured(html: str) -> dict[str, dict[str, list[str]]]:
    """G1_ROUNDS 的结构化解析（轮次→pos/neg），供 check5 做形状级断言（不是简单集合覆盖）。"""
    m = G1_ROUNDS_BLOCK_RE.search(html)
    if not m:
        return {}
    result: dict[str, dict[str, list[str]]] = {}
    for round_key, pos_str, neg_str in G1_ROUND_ENTRY_RE.findall(m.group(1)):
        result[round_key] = {
            "pos": FLAT_STR_RE.findall(pos_str),
            "neg": FLAT_STR_RE.findall(neg_str),
        }
    return result


def extract_g3_pairs(html: str) -> list[str]:
    """G3 两扇门分流常量（U1 新增）：拉平所有词对的全词，供 check3/4 通用覆盖+黑名单检查。"""
    keys = []
    m = G3_PAIRS_BLOCK_RE.search(html)
    if not m:
        return keys
    for w1, w2 in G3_PAIR_RE.findall(m.group(1)):
        keys.append(w1)
        keys.append(w2)
    return keys


def parse_g3_pairs(html: str) -> list[tuple[str, str]]:
    """G3_PAIRS 的结构化解析（词对列表），供 check5 做形状级断言。"""
    m = G3_PAIRS_BLOCK_RE.search(html)
    if not m:
        return []
    return G3_PAIR_RE.findall(m.group(1))


def extract_g4_words(html: str) -> list[str]:
    """G4 点单游戏题库（U2 新增）：拉平全词，供 check3/4 通用覆盖+黑名单检查。"""
    keys = []
    m = G4_WORDS_BLOCK_RE.search(html)
    if not m:
        return keys
    keys.extend(FLAT_STR_RE.findall(m.group(1)))
    return keys


EXTRACTION_REGISTRY = {
    "sounds_demo": extract_sounds_demo,
    "days_words": extract_days_words,
    "days_sight": extract_days_sight,
    "days_sentences": extract_days_sentences,
    "wall_hint": extract_wall_hint,
    "book_lines": extract_book_lines,
    "g1_rounds": extract_g1_rounds,
    "g3_pairs": extract_g3_pairs,
    "g4_words": extract_g4_words,
}


# ======================================================================
# H3（S2 预筛 high，已裁定采纳）：只判"非空"防不住"正则从命中 6 处静默退化成
# 命中 1 处但仍非空"这种失效——必须核对每源的锚点出现次数、展开键数（含重复）、
# 去重键数，逐条对冻结常量表。改数据形状时必须同步改这张表，否则自检会先炸。
# ======================================================================
SOURCE_SPECS = {
    "sounds_demo":    {"anchor_re": DEMO_BLOCK_RE,       "anchors": 6, "keys": 18, "unique": 18},
    "days_words":     {"anchor_re": WORDS_BLOCK_RE,      "anchors": 4, "keys": 18, "unique": 18},
    "days_sight":     {"anchor_re": SIGHT_BLOCK_RE,      "anchors": 1, "keys": 3,  "unique": 3},
    "days_sentences": {"anchor_re": SENTENCES_BLOCK_RE,  "anchors": 1, "keys": 3,  "unique": 3},
    "wall_hint":      {"anchor_re": WALL_HINT_BLOCK_RE,  "anchors": 1, "keys": 3,  "unique": 3},
    "book_lines":     {"anchor_re": BOOK_PAGES_BLOCK_RE, "anchors": 1, "keys": 6,  "unique": 6},
    "g1_rounds":      {"anchor_re": G1_ROUNDS_BLOCK_RE,  "anchors": 1, "keys": 16, "unique": 15},  # dog 两轮各出现一次
    "g3_pairs":       {"anchor_re": G3_PAIRS_BLOCK_RE,   "anchors": 1, "keys": 2,  "unique": 2},
    "g4_words":       {"anchor_re": G4_WORDS_BLOCK_RE,   "anchors": 1, "keys": 7,  "unique": 7},
}

# ======================================================================
# M1（S2 预筛 medium，已裁定采纳）：manifest 里生成了音频、但当前 v3 运行时
# 任何提取源都引用不到的"孤儿键"冻结清单。S3 落 G1 后已实测复核：词卡墙
# renderWall()/taughtWords() 只从 DAYS 的 'words' 块取词，不引用这两个 Group E
# 补充词，Nat/naps 目前是真孤儿（生成了音频但无运行时引用），不是提取器漏配。
# 只许改小（新源接入后同步缩小此常量），不许改大——改大意味着又新增了孤儿，
# 应该去接入引用而不是放宽断言。
# ======================================================================
UNREFERENCED_KEYS = frozenset({"Nat", "naps"})

# ======================================================================
# M2（S2 预筛 medium，已裁定采纳）：tripwire——HTML 里出现 G5_ 前缀的题库常量
# 声明，但提取注册表/自检⑤没有对应处理，说明落地新游戏时忘了同步
# build_audio.py。G1（g1_rounds）/G3（g3_pairs）/G4（g4_words）都已有提取源 +
# check5 形状级断言，字符类收窄到 [5]，天然排除掉这三个已落地的、只继续盯
# G5——U2 落地 G4_WORDS 时把 4 从字符类里摘掉，正是这条 tripwire 设计初衷要求
# 的"同步更新"动作，不是绕过它。
# ======================================================================
GXX_CONST_RE = re.compile(r"\bconst\s+(G5_[A-Z][A-Z0-9_]*)\s*=")


def build_extraction_report(html: str) -> dict[str, list[str]]:
    return {name: fn(html) for name, fn in EXTRACTION_REGISTRY.items()}


def check3_reference_coverage(manifest: dict, html: str, extraction: dict[str, list[str]]) -> tuple[bool, list[str]]:
    problems = []

    # H3 前提：源注册表与冻结锚点表必须一一对应，防止有源忘记登记冻结值（或反之）
    if set(EXTRACTION_REGISTRY) != set(SOURCE_SPECS):
        problems.append(
            f"EXTRACTION_REGISTRY 与 SOURCE_SPECS 源名不一致：{sorted(set(EXTRACTION_REGISTRY) ^ set(SOURCE_SPECS))}"
        )

    empty_sources = [name for name, keys in extraction.items() if not keys]
    if empty_sources:
        problems.append(f"以下提取源结果为空（正则可能已失效）：{empty_sources}")

    # H3：逐源核对锚点命中次数 + 展开键数（含重复）+ 去重键数
    for name, spec in SOURCE_SPECS.items():
        anchor_n = len(spec["anchor_re"].findall(html))
        if anchor_n != spec["anchors"]:
            problems.append(f"源 {name} 锚点命中数={anchor_n}（冻结期望={spec['anchors']}）")
        keys = extraction.get(name, [])
        if len(keys) != spec["keys"]:
            problems.append(f"源 {name} 展开键数={len(keys)}（冻结期望={spec['keys']}）")
        if len(set(keys)) != spec["unique"]:
            problems.append(f"源 {name} 去重键数={len(set(keys))}（冻结期望={spec['unique']}）")

    manifest_keys = set(it["key"] for it in manifest["items"])
    union = set()
    for keys in extraction.values():
        union.update(keys)
    missing = sorted(k for k in union if k not in manifest_keys)
    if missing:
        problems.append(f"以下运行时提取键不在 manifest 中（缺 mp3 引用）：{missing}")

    # M1：manifest 里没有任何提取源引用到的键，必须恰好等于冻结孤儿清单（只许改小）
    unreferenced = manifest_keys - union
    if unreferenced != set(UNREFERENCED_KEYS):
        problems.append(
            f"manifest 未被任何提取源引用的键与冻结清单不一致："
            f"实际={sorted(unreferenced)}，冻结={sorted(UNREFERENCED_KEYS)}"
        )

    # manifest 每条目的 raw mp3 必须存在（清单-磁盘一致性，非运行时提取范围）
    missing_raw = [it["key"] for it in manifest["items"] if not (RAW_DIR / it["file"]).exists()]
    if missing_raw:
        problems.append(f"manifest 引用的 raw mp3 缺失：{missing_raw}")

    return (not problems), problems


def check4_blacklist_rendering(manifest: dict, extraction: dict[str, list[str]]) -> tuple[bool, list[str]]:
    reserved = reserved_set(manifest)
    problems = []
    for name, keys in extraction.items():
        leaked = [k for k in keys if k.lower() in reserved]
        if leaked:
            problems.append(f"提取源 {name} 渲染了保留词：{leaked}")
    return (not problems), problems


# ======================================================================
# 自检⑤ 题库断言（v1.3 §10 自检⑤ + §4.1/§4.3/§4.4）：
#   - G1 两轮（S3 新增）：pos/neg 各恰好4词、轮内不重复、⊆manifest、不含RESERVED
#   - G3 两扇门（U1 新增）：至少1个词对、每对2个不同词、⊆manifest、不含RESERVED
#   - G4 点单（U2 新增）：词表⊆manifest、不含RESERVED、内部不重复
#   - G5 白名单：现阶段 G5 在 v3 中尚未落地（P2），仍是 manifest 侧预置占位校验
# ======================================================================
def check5_problem_bank(manifest: dict, html: str) -> tuple[bool, list[str]]:
    problems: list[str] = []
    reserved = reserved_set(manifest)
    manifest_keys = set(it["key"] for it in manifest["items"])

    # G5 白名单占位校验（S3/P2 落地前）：manifest group A 应为 18 词、无保留词
    group_a = [it["key"] for it in manifest["items"] if it["group"] == "A"]
    if not (len(group_a) == 18 and not (set(k.lower() for k in group_a) & reserved)):
        problems.append(f"G5 白名单占位校验失败：group A 条目数={len(group_a)}（期望18，且无保留词）")

    # G1 两轮题库断言（S3 新增）
    rounds = parse_g1_rounds_structured(html)
    if set(rounds.keys()) != {"s", "a"}:
        problems.append(f"G1_ROUNDS 轮次键异常：期望 {{'s','a'}}，实际解析到 {sorted(rounds.keys())}")
    for rk in sorted(rounds.keys()):
        data = rounds[rk]
        pos, neg = data.get("pos", []), data.get("neg", [])
        if len(pos) != 4 or len(neg) != 4:
            problems.append(f"G1 轮 {rk} 题量异常：pos={len(pos)}（期望4）neg={len(neg)}（期望4）")
        combined = pos + neg
        if len(set(combined)) != len(combined):
            problems.append(f"G1 轮 {rk} 内部有重复词：{combined}")
        missing = sorted(set(combined) - manifest_keys)
        if missing:
            problems.append(f"G1 轮 {rk} 题库词不在 manifest 中（缺 mp3 引用）：{missing}")
        leaked = sorted(w for w in combined if w.lower() in reserved)
        if leaked:
            problems.append(f"G1 轮 {rk} 题库泄漏保留词：{leaked}")

    # G3 两扇门题库断言（U1 新增）
    g3_pairs = parse_g3_pairs(html)
    if not g3_pairs:
        problems.append("G3_PAIRS 解析为空（正则可能已失效，或常量被重命名/移出顶层作用域）")
    for w1, w2 in g3_pairs:
        if w1 == w2:
            problems.append(f"G3_PAIRS 词对两词相同：({w1!r}, {w2!r})")
        for w in (w1, w2):
            if w not in manifest_keys:
                problems.append(f"G3_PAIRS 词 {w!r} 不在 manifest 中（缺 mp3 引用）")
            if w.lower() in reserved:
                problems.append(f"G3_PAIRS 词 {w!r} 是保留词")

    # G4 点单题库断言（U2 新增）
    g4_words = extract_g4_words(html)
    if not g4_words:
        problems.append("G4_WORDS 解析为空（正则可能已失效，或常量被重命名/移出顶层作用域）")
    if len(set(g4_words)) != len(g4_words):
        problems.append(f"G4_WORDS 内部有重复词：{g4_words}")
    missing_g4 = sorted(set(g4_words) - manifest_keys)
    if missing_g4:
        problems.append(f"G4_WORDS 词不在 manifest 中（缺 mp3 引用）：{missing_g4}")
    leaked_g4 = sorted(w for w in g4_words if w.lower() in reserved)
    if leaked_g4:
        problems.append(f"G4_WORDS 泄漏保留词：{leaked_g4}")

    # M2 tripwire：出现 G5_ 题库常量声明，但提取注册表/本函数都还没有
    # 为它写对应处理——多半是落地新游戏时忘了同步 build_audio.py。
    gxx_found = sorted(set(GXX_CONST_RE.findall(html)))
    if gxx_found:
        problems.append(
            f"发现 G5 题库常量声明，但提取注册表/自检⑤尚无对应断言，"
            f"需在落地该游戏时同步补齐 build_audio.py：{gxx_found}"
        )

    return (not problems), problems


# ======================================================================
# 音频后处理：两遍 ffmpeg（测量 → 处理）+ 处理后复测验证
# ======================================================================
def parse_duration_seconds(stderr: str) -> float | None:
    m = DURATION_RE.search(stderr)
    if not m:
        return None
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def measure_max_volume(ffmpeg: str, path: Path) -> float | None:
    rc, stderr = run_ffmpeg(ffmpeg, ["-i", str(path), "-af", "volumedetect", "-f", "null", "-"])
    if rc != 0:
        return None
    m = VOLUME_RE.search(stderr)
    return float(m.group(1)) if m else None


def process_one(ffmpeg: str, item: dict) -> dict:
    key = item["key"]
    raw_path = RAW_DIR / item["file"]
    out_path = PROCESSED_DIR / item["file"]
    result = {"key": key, "file": item["file"], "ok": False, "reason": None,
              "raw_max_volume": None, "gain_db": None,
              "processed_max_volume": None, "duration": None,
              "head_tail_hit": None}

    if not raw_path.exists():
        result["reason"] = "raw 文件不存在"
        return result

    # 第一遍：测量原始响度
    raw_mv = measure_max_volume(ffmpeg, raw_path)
    if raw_mv is None:
        result["reason"] = "raw 响度测量失败（volumedetect 无输出或 ffmpeg 非零退出，可能无法解码）"
        return result
    result["raw_max_volume"] = raw_mv
    gain_db = TARGET_PEAK_DBFS - raw_mv
    result["gain_db"] = gain_db

    # 第二遍：处理（裁首尾静音 + 峰值归一）
    af_chain = (
        f"silenceremove=start_periods=1:start_threshold={SILENCE_THRESHOLD_DB}dB,"
        f"areverse,"
        f"silenceremove=start_periods=1:start_threshold={SILENCE_THRESHOLD_DB}dB,"
        f"areverse,"
        f"volume={gain_db:.3f}dB"
    )
    # H1：编码前先清掉旧 processed 产物——若本次 ffmpeg 实际失败，不会误留上一次成功
    # 跑出来的同名旧文件，让后面的存在性检查误判通过（陈旧缓存复用风险）。
    out_path.unlink(missing_ok=True)
    proc_rc, stderr = run_ffmpeg(ffmpeg, [
        "-y", "-i", str(raw_path),
        "-af", af_chain,
        "-c:a", "libmp3lame", "-b:a", "48k", "-ar", "24000", "-ac", "1",
        str(out_path),
    ])
    if proc_rc != 0 or not out_path.exists() or out_path.stat().st_size == 0:
        # C4：非零退出/超时都可能是 ffmpeg 已经开始写文件、写到一半才被判失败或被
        # timeout 杀掉，留下部分写入的残缺文件——再 unlink 一次，确保"该条输出保持
        # 已删除态"，不会被后面任何路径误当成有效 processed 产物。
        out_path.unlink(missing_ok=True)
        result["reason"] = f"处理失败（returncode={proc_rc}）或输出缺失/空文件；ffmpeg stderr 尾部：{stderr[-400:]}"
        return result

    # 验证测量：处理后复测响度 + 首尾静音（单次 ffmpeg 跑双 filter，均为分析类 filter 不改音频）
    verify_rc, verify_stderr = run_ffmpeg(ffmpeg, [
        "-i", str(out_path),
        "-af", f"volumedetect,silencedetect=noise={SILENCE_THRESHOLD_DB}dB:d={HEAD_TAIL_SILENCE_D}",
        "-f", "null", "-",
    ])
    duration = parse_duration_seconds(verify_stderr) if verify_rc == 0 else None
    mv_match = VOLUME_RE.search(verify_stderr)
    processed_mv = float(mv_match.group(1)) if (verify_rc == 0 and mv_match) else None
    result["processed_max_volume"] = processed_mv
    result["duration"] = duration

    starts = [float(x) for x in SILENCE_START_RE.findall(verify_stderr)] if verify_rc == 0 else []
    ends = [(float(a), float(b)) for a, b in SILENCE_END_RE.findall(verify_stderr)] if verify_rc == 0 else []
    # H2 回炉（S2 预筛裁决改判 EOF-flush 语义，替换掉原先的 eps 距离比对）：
    # 距离比对已被实测证伪——词中塞音闭塞段（如 nip/snap/book 的 /p//k/ 爆破前停顿）
    # 与真尾静音的"距文件末尾距离"在 52-68ms 连续分布，任何固定 eps 阈值都会二分
    # 到同质样本的两侧，必然误伤。真正能区分两者的信号是配对关系：
    #   - 配对完整的静音段（有 silence_start 也有 silence_end）= 词中自然停顿，忽略；
    #   - 有 silence_start 但直到 EOF 都没有对应 silence_end = 静音一直持续到流结束，
    #     这才是真尾静音，长度 = duration − 该 silence_start（ffmpeg 在 EOF flush 时
    #     不会为"仍在静音中"的收尾段补发 silence_end 事件，配对数天然缺一）。
    # 头部同理：静音配对存在且紧贴文件头（start<5ms）才算头部静音，直接用 ffmpeg
    # 自己算好的 silence_duration 字段，不再反推距离。LAME 编码填充帧本身不产生
    # silencedetect 事件，天然不会触发这两条判据的误报。
    head_hit = False
    if starts and ends and starts[0] < 0.005 and ends[0][1] > HEAD_TAIL_SILENCE_D:
        head_hit = True
    tail_hit = False
    if duration is not None and len(starts) > len(ends):
        tail_start = starts[-1]
        if (duration - tail_start) > HEAD_TAIL_SILENCE_D:
            tail_hit = True
    result["head_tail_hit"] = head_hit or tail_hit

    reasons = []
    if verify_rc != 0:
        reasons.append(f"验证测量 ffmpeg 非零退出（returncode={verify_rc}）")
    if duration is None or duration <= 0:
        reasons.append("时长不可解析或=0")
    if processed_mv is None:
        reasons.append("处理后响度不可解析")
    elif not (PEAK_LOW <= processed_mv <= PEAK_HIGH):
        reasons.append(f"峰值 {processed_mv}dB 超出 [{PEAK_LOW},{PEAK_HIGH}]")
    if result["head_tail_hit"]:
        reasons.append("首尾静音超过 80ms 阈值命中")

    result["ok"] = not reasons
    result["reason"] = "；".join(reasons) if reasons else None
    return result


def check6_audio_integrity(results: list[dict]) -> tuple[bool, list[dict]]:
    failed = [r for r in results if not r["ok"]]
    return (not failed), failed


# ======================================================================
# 注入（本轮 --no-inject 时不调用，但完整实现供后续 S2 收尾/S3 使用）
# ======================================================================
def build_word_audio_block(manifest: dict) -> str:
    entries = []
    for it in manifest["items"]:
        f = PROCESSED_DIR / it["file"]
        b64 = base64.b64encode(f.read_bytes()).decode("ascii")
        uri = DATAURI_PREFIX + b64
        entries.append(f"  {json.dumps(it['key'], ensure_ascii=False)}: {json.dumps(uri)}")
    body = ",\n".join(entries)
    return f"const WORD_AUDIO = {{\n{body}\n}};"


def inject_word_audio(html: str, block: str) -> str:
    """block 由调用方预先算好传入（M3：main() 需要复用同一个 block 算体积预算，
    不再在这里内部重算一次 base64，避免 56 条 mp3 被重复编码两遍）。"""
    wrapped = f"{INJECT_START}\n{block}\n{INJECT_END}"
    start_n, end_n = html.count(INJECT_START), html.count(INJECT_END)
    # L1：注入前先断言标记对数量处于"两个都没有"（首跑，走占位符分支）或
    # "两个都恰好一个"（重跑，走标记对替换分支）这两种合法状态之一；任何介于
    # 中间的不对称状态（比如只删了一半标记）说明文件已被手动改坏，直接拒绝注入。
    if start_n not in (0, 1) or end_n not in (0, 1) or start_n != end_n:
        raise RuntimeError(f"注入标记对数量异常（START={start_n}，END={end_n}），拒绝注入以防写坏文件")
    if start_n == 1:
        pattern = re.compile(re.escape(INJECT_START) + r".*?" + re.escape(INJECT_END), re.S)
        new_html, n = pattern.subn(lambda _m: wrapped, html, count=1)
        if n != 1:
            raise RuntimeError("注入标记对定位异常（未找到恰好 1 处匹配）")
        return new_html
    if html.count(PLACEHOLDER) != 1:
        raise RuntimeError(f"占位符 {PLACEHOLDER!r} 未找到或不唯一（命中 {html.count(PLACEHOLDER)} 处），无法定位注入锚点")
    return html.replace(PLACEHOLDER, wrapped, 1)


def atomic_write(path: Path, content: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8", newline="")
    # L2：os.replace 失败时清掉半成品 .tmp，不在工作目录留垃圾文件；
    # 成功时 tmp 已被 replace 移走，unlink(missing_ok=True) 是安全的 no-op。
    try:
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


# ======================================================================
# 报告输出
# ======================================================================
def hr(title: str) -> None:
    print(f"\n===== {title} =====")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-inject", action="store_true", help="只跑处理+自检①-⑥，不注入/不改动 week01-v3.html")
    args = ap.parse_args()

    overall_ok = True

    manifest = load_manifest()
    ffmpeg = get_ffmpeg_exe()
    print(f"ffmpeg: {ffmpeg}")

    hr("自检① 唯一性断言")
    ok1, d1 = check1_uniqueness(manifest)
    print(("PASS " if ok1 else "FAIL ") + d1)
    overall_ok &= ok1

    hr("自检② 黑名单断言（manifest）")
    ok2, d2 = check2_blacklist_manifest(manifest)
    print(("PASS " if ok2 else "FAIL ") + d2)
    overall_ok &= ok2

    hr("C3 manifest 路径安全前置闸")
    ok_paths, problems_paths = check_manifest_paths(manifest)
    print("PASS" if ok_paths else "FAIL")
    for p in problems_paths:
        print(f"  - {p}")
    if not ok_paths:
        # 硬门禁：不并入 overall_ok 继续跑，直接在任何 unlink/ffmpeg 调用之前停下
        hr("总结")
        print("FAIL：manifest 路径校验未通过，拒绝继续（未调用任何 unlink/ffmpeg）")
        return 1

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    hr("后处理：56 条 raw → processed（两遍 ffmpeg + 复测验证）")
    results = [process_one(ffmpeg, it) for it in manifest["items"]]
    ok_n = sum(1 for r in results if r["ok"])
    print(f"处理完成：{ok_n}/{len(results)} 条通过质量验证")
    raw_mvs = [r["raw_max_volume"] for r in results if r["raw_max_volume"] is not None]
    proc_mvs = [r["processed_max_volume"] for r in results if r["processed_max_volume"] is not None]
    if raw_mvs:
        print(f"raw max_volume 区间：[{min(raw_mvs):.2f}, {max(raw_mvs):.2f}]dB（56 条）")
    if proc_mvs:
        print(f"processed max_volume 区间：[{min(proc_mvs):.2f}, {max(proc_mvs):.2f}]dB（目标 [{PEAK_LOW},{PEAK_HIGH}]）")
    head_tail_hits = [r["key"] for r in results if r["head_tail_hit"]]
    print(f"首尾静音超 80ms 命中数：{len(head_tail_hits)}" + (f"：{head_tail_hits}" if head_tail_hits else ""))

    hr("自检⑥ 音频完整性（解码/时长/峰值/首尾静音，处理后测量值）")
    ok6, failed6 = check6_audio_integrity(results)
    print("PASS 全部 56 条通过" if ok6 else f"FAIL {len(failed6)} 条未通过：")
    for r in failed6:
        print(f"  - {r['key']} ({r['file']}): {r['reason']}")
    overall_ok &= ok6

    html = TARGET_HTML.read_text(encoding="utf-8")
    extraction = build_extraction_report(html)

    hr("提取源注册表：各源提取条数")
    for name, keys in extraction.items():
        uniq = sorted(set(keys))
        print(f"  {name}: {len(keys)} 条（去重 {len(uniq)}）")

    hr("自检③ 引用覆盖（提取键 ⊆ manifest 键 + manifest raw 文件存在性）")
    ok3, problems3 = check3_reference_coverage(manifest, html, extraction)
    print("PASS" if ok3 else "FAIL")
    for p in problems3:
        print(f"  - {p}")
    overall_ok &= ok3

    hr("自检④ 黑名单渲染检查（提取源不含保留词）")
    ok4, problems4 = check4_blacklist_rendering(manifest, extraction)
    print("PASS" if ok4 else "FAIL")
    for p in problems4:
        print(f"  - {p}")
    overall_ok &= ok4

    hr("自检⑤ 题库断言（G1 两轮结构 + G3 两扇门词对 + G4 点单词表 + G5 白名单占位）")
    ok5, problems5 = check5_problem_bank(manifest, html)
    print("PASS" if ok5 else "FAIL")
    for p in problems5:
        print(f"  - {p}")
    overall_ok &= ok5

    if args.no_inject:
        hr("自检⑦ 体积报告")
        print("跳过（--no-inject 模式：本轮不注入，体积增量在注入时才有意义）")
        hr("注入")
        print("跳过（--no-inject）：week01-v3.html 未被读取以外的任何方式触碰，未写入")
        hr("总结")
        print("整体：" + ("PASS（①-⑥全绿，可进入注入阶段）" if overall_ok else "FAIL（存在未通过项，见上）"))
        return 0 if overall_ok else 1

    # ---- 注入路径（本次派单不会走到这里，因为调用方会传 --no-inject）----
    if not overall_ok:
        hr("总结")
        print("FAIL：自检未全绿，不执行注入，不写 week01-v3.html")
        return 1

    # M3：体积预算改判 WORD_AUDIO 载荷本身的字节数（len(block)），不用文件 delta——
    # 幂等重跑时"标记对整块替换"会让 delta 恒≈0，即使载荷本身早已超预算也测不出来。
    payload = build_word_audio_block(manifest)
    before_size = TARGET_HTML.stat().st_size
    new_html = inject_word_audio(html, payload)
    atomic_write(TARGET_HTML, new_html)
    after_size = TARGET_HTML.stat().st_size

    hr("自检⑦ 体积报告")
    payload_bytes = len(payload.encode("utf-8"))
    delta = after_size - before_size
    print(f"注入前 {before_size/1024:.1f}KB → 注入后 {after_size/1024:.1f}KB（文件 delta {delta/1024:.1f}KB，仅供参考）")
    print(f"WORD_AUDIO 载荷本身 {payload_bytes/1024:.1f}KB（预算 1.2MB 判据）")
    if payload_bytes > 1.2 * 1024 * 1024:
        print(f"警告：WORD_AUDIO 载荷 {payload_bytes/1024/1024:.2f}MB 超过 1.2MB 预算（不阻断，人工判断）")

    hr("总结")
    print("PASS：七项自检全绿，已原子写出 week01-v3.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
