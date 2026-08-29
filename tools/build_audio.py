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


def run_ffmpeg(ffmpeg: str, args: list[str]) -> str:
    """跑一次 ffmpeg，返回 stderr 全文（ffmpeg 的分析类 filter 输出都在 stderr）。"""
    proc = subprocess.run(
        [ffmpeg, "-hide_banner", "-nostdin", *args],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        encoding="utf-8", errors="replace",
    )
    return proc.stderr or ""


def load_manifest() -> dict:
    m = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return m


def reserved_set(manifest: dict) -> set[str]:
    return set(k.lower() for k in manifest["reserved_blacklist"])


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
#   BOOK.pages[].line。G1/G3/G4 题库、G5 白名单尚未在 v3 落地（S3/P2），留位。
# ======================================================================
DEMO_BLOCK_RE = re.compile(r"demo:\[(.*?)\]\}", re.S)
WORDS_BLOCK_RE = re.compile(r"\{b:'words',\s*items:\[(.*?)\]\}", re.S)
SIGHT_BLOCK_RE = re.compile(r"\{b:'sight',\s*items:\[(.*?)\]\}", re.S)
SENTENCES_BLOCK_RE = re.compile(r"\{b:'sentences',\s*items:\[(.*?)\]\}", re.S)
WALL_HINT_BLOCK_RE = re.compile(r"const WALL_HINT\s*=\s*\{(.*?)\};", re.S)
BOOK_PAGES_BLOCK_RE = re.compile(r"pages:\[(.*?)\]\s*\};", re.S)

PAIR_FIRST_RE = re.compile(r"\[\s*'([^']*)'\s*,")
FLAT_STR_RE = re.compile(r"'([^']*)'")
WALL_HINT_EN_RE = re.compile(r"en:\s*'([^']*)'")
BOOK_LINE_RE = re.compile(r"line:\s*'([^']*)'")


def extract_sounds_demo(html: str) -> list[str]:
    keys = []
    for block in DEMO_BLOCK_RE.findall(html):
        keys.extend(PAIR_FIRST_RE.findall(block))
    return keys


def extract_days_words(html: str) -> list[str]:
    keys = []
    for block in WORDS_BLOCK_RE.findall(html):
        keys.extend(FLAT_STR_RE.findall(block))
    return keys


def extract_days_sight(html: str) -> list[str]:
    keys = []
    for block in SIGHT_BLOCK_RE.findall(html):
        keys.extend(PAIR_FIRST_RE.findall(block))
    return keys


def extract_days_sentences(html: str) -> list[str]:
    keys = []
    for block in SENTENCES_BLOCK_RE.findall(html):
        keys.extend(PAIR_FIRST_RE.findall(block))
    return keys


def extract_wall_hint(html: str) -> list[str]:
    keys = []
    for block in WALL_HINT_BLOCK_RE.findall(html):
        keys.extend(WALL_HINT_EN_RE.findall(block))
    return keys


def extract_book_lines(html: str) -> list[str]:
    keys = []
    for block in BOOK_PAGES_BLOCK_RE.findall(html):
        for raw_line in BOOK_LINE_RE.findall(block):
            # 运行时 initBook() 用 pageData.line.replace(/[""]/g,'') 规范化
            # （该字符类实际是两个 ASCII 双引号 0x22，非弯引号），提取器同步镜像
            keys.append(raw_line.replace('"', ''))
    return keys


EXTRACTION_REGISTRY = {
    "sounds_demo": extract_sounds_demo,
    "days_words": extract_days_words,
    "days_sight": extract_days_sight,
    "days_sentences": extract_days_sentences,
    "wall_hint": extract_wall_hint,
    "book_lines": extract_book_lines,
}


def build_extraction_report(html: str) -> dict[str, list[str]]:
    return {name: fn(html) for name, fn in EXTRACTION_REGISTRY.items()}


def check3_reference_coverage(manifest: dict, extraction: dict[str, list[str]]) -> tuple[bool, list[str]]:
    problems = []
    empty_sources = [name for name, keys in extraction.items() if not keys]
    if empty_sources:
        problems.append(f"以下提取源结果为空（正则可能已失效）：{empty_sources}")

    manifest_keys = set(it["key"] for it in manifest["items"])
    union = set()
    for keys in extraction.values():
        union.update(keys)
    missing = sorted(k for k in union if k not in manifest_keys)
    if missing:
        problems.append(f"以下运行时提取键不在 manifest 中（缺 mp3 引用）：{missing}")

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
# 自检⑤ 题库断言（现阶段仅 G5 白名单==A 组 18 词的常量预置校验；
# G1/G3/G4 题库源与 G5 在 v3 中尚不存在，S3/P2 落地时补运行时提取）
# ======================================================================
def check5_problem_bank_placeholder(manifest: dict) -> tuple[bool, str]:
    reserved = reserved_set(manifest)
    group_a = [it["key"] for it in manifest["items"] if it["group"] == "A"]
    ok = len(group_a) == 18 and not (set(k.lower() for k in group_a) & reserved)
    detail = f"manifest group A（拟作 G5 白名单）条目数={len(group_a)}（期望 18，且无保留词）"
    return ok, detail


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
    stderr = run_ffmpeg(ffmpeg, ["-i", str(path), "-af", "volumedetect", "-f", "null", "-"])
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
        result["reason"] = "raw 响度测量失败（volumedetect 无输出，可能无法解码）"
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
    stderr = run_ffmpeg(ffmpeg, [
        "-y", "-i", str(raw_path),
        "-af", af_chain,
        "-c:a", "libmp3lame", "-b:a", "48k", "-ar", "24000", "-ac", "1",
        str(out_path),
    ])
    if not out_path.exists() or out_path.stat().st_size == 0:
        result["reason"] = f"处理输出缺失/空文件；ffmpeg stderr 尾部：{stderr[-400:]}"
        return result

    # 验证测量：处理后复测响度 + 首尾静音（单次 ffmpeg 跑双 filter，均为分析类 filter 不改音频）
    verify_stderr = run_ffmpeg(ffmpeg, [
        "-i", str(out_path),
        "-af", f"volumedetect,silencedetect=noise={SILENCE_THRESHOLD_DB}dB:d={HEAD_TAIL_SILENCE_D}",
        "-f", "null", "-",
    ])
    duration = parse_duration_seconds(verify_stderr)
    mv_match = VOLUME_RE.search(verify_stderr)
    processed_mv = float(mv_match.group(1)) if mv_match else None
    result["processed_max_volume"] = processed_mv
    result["duration"] = duration

    starts = [float(x) for x in SILENCE_START_RE.findall(verify_stderr)]
    ends = [(float(a), float(b)) for a, b in SILENCE_END_RE.findall(verify_stderr)]
    eps = 0.03  # 30ms 容差，应对 ffmpeg 时间戳量化误差
    head_hit = any(s <= eps for s in starts)
    tail_hit = False
    if duration is not None:
        tail_hit = any(abs(e - duration) <= eps for (e, _dur) in ends)
        # 静音持续到文件末尾、没有对应 silence_end 事件的情况（EOF 前未闭合）
        if len(starts) > len(ends) and starts and starts[-1] < duration:
            tail_hit = True
    result["head_tail_hit"] = head_hit or tail_hit

    reasons = []
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


def inject_word_audio(html: str, manifest: dict) -> str:
    block = build_word_audio_block(manifest)
    wrapped = f"{INJECT_START}\n{block}\n{INJECT_END}"
    if INJECT_START in html and INJECT_END in html:
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
    os.replace(tmp, path)


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
    ok3, problems3 = check3_reference_coverage(manifest, extraction)
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

    hr("自检⑤ 题库断言（占位：G5 白名单==A组18词 的 manifest 侧预置校验）")
    ok5, d5 = check5_problem_bank_placeholder(manifest)
    print(("PASS " if ok5 else "FAIL ") + d5)
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

    before_size = TARGET_HTML.stat().st_size
    new_html = inject_word_audio(html, manifest)
    atomic_write(TARGET_HTML, new_html)
    after_size = TARGET_HTML.stat().st_size

    hr("自检⑦ 体积报告")
    delta = after_size - before_size
    print(f"注入前 {before_size/1024:.1f}KB → 注入后 {after_size/1024:.1f}KB（增量 {delta/1024:.1f}KB）")
    if delta > 1.2 * 1024 * 1024:  # 规格 §1：预算对象是注入产生的“增量”，不是 HTML 总体积
        print(f"警告：注入增量 {delta/1024/1024:.2f}MB 超过 1.2MB 预算（不阻断，人工判断）")

    hr("总结")
    print("PASS：七项自检全绿，已原子写出 week01-v3.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
