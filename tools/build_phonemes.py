# -*- coding: utf-8 -*-
"""音素示范音的处理与注入：源音频 → 规格化 → 内嵌进周课件的 PHONEME_AUDIO。

第一周的六个音素音是手工做的（剪自 Freesound margo_heston「English Phonemes」音包，
CC BY-NC 4.0，降噪裁剪后手贴 base64），没有留下脚本，源文件也不在仓库。
本脚本把那次的处理规格固化下来，让后续周次可复现、可重跑。

规格来源 = 反推第一周 week01-v3.html 已内嵌的六段实测值：
    44100 Hz / mono / libmp3lame 64k / 峰值 −3 dBFS / 时长 0.31–0.73 s
（注意与单词音不同：build_audio.py 用 24000 Hz / 48k，音素要听清发音细节所以规格更高。）

处理链沿用 build_audio.py 的两遍 ffmpeg 模式：先测量响度，再裁静音 + 按测量值归一，
处理后复测验证。差别只在编码参数和"逐音素"而非"逐单词"。

用法：
    # 看会做什么，不写盘
    python tools/build_phonemes.py --target week02.html --src assets/phonemes/week02 --dry-run

    # 真的注入
    python tools/build_phonemes.py --target week02.html --src assets/phonemes/week02

    # 把目标 HTML 里已内嵌的音素音导出成文件（第一周源文件已丢失，用这个取回）
    python tools/build_phonemes.py --target week01-v3.html --extract-to assets/phonemes/week01

源目录约定：文件名 = 音素键，扩展名随意（凡 ffmpeg 能解码即可）。
    assets/phonemes/week02/c.wav   → 注入 PHONEME_AUDIO.c
    assets/phonemes/week02/e.mp3   → 注入 PHONEME_AUDIO.e
别名音（如第二周 k 的 audioKey 指向 c）**不要**单独放文件，脚本会校验并拒绝。

注入是**合并**不是替换：已有的键保留，同名键覆盖。所以第二周只需放六个新音，
第一周那六个继续沿用页面里已有的。

七项自检，任一失败即非零退出且不碰目标 HTML：
    1. 目标 HTML 存在、含 PHONEME_AUDIO 常量块、能定位到唯一一处
    2. 源目录存在且非空；每个源文件都能被 ffmpeg 解码并测出响度
    3. 每个源键都在目标 HTML 的 SOUNDS 里声明过（不许注入页面不认识的音素）
    4. 源键不是别名键（别名由 audioKey 解析，单独给文件说明理解错了）
    5. 处理后峰值落在 [-4, -2] dBFS
    6. 处理后首尾无残留静音（用 build_audio 的 EOF-flush 配对判据，不用距离阈值）
    7. 处理后时长落在 [0.12, 2.0] s——音素音过短多半是裁过头，过长多半没裁干净
"""
from __future__ import annotations

import argparse
import base64
import re
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------- 规格常量

SILENCE_THRESHOLD_DB = -40      # 裁静音阈值，与 build_audio.py 一致
TARGET_PEAK_DBFS = -3.0         # 峰值归一目标，与 build_audio.py 一致
PEAK_TOLERANCE_DB = 1.0
PEAK_LOW = TARGET_PEAK_DBFS - PEAK_TOLERANCE_DB
PEAK_HIGH = TARGET_PEAK_DBFS + PEAK_TOLERANCE_DB

# 音素音专属编码规格（实测自第一周内嵌音，与单词音不同）
MP3_BITRATE = "64k"
MP3_SAMPLE_RATE = "44100"

DURATION_MIN = 0.12
DURATION_MAX = 2.0

HEAD_TAIL_SILENCE_D = 0.02      # silencedetect 的最短静音时长
HEAD_EPS = 0.005                # 判"紧贴文件头"的阈值
# 头部静音的容忍上限。塞音闭塞段 + 擦音鼻音的自然起音实测在 52–97ms（第一周六段），
# 都是音素的组成部分不该裁。250ms 以上才当"没裁过的录音留白"。
HEAD_SILENCE_MAX = 0.25

VOLUME_RE = re.compile(r"max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB")
DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
SILENCE_START_RE = re.compile(r"silence_start:\s*(-?\d+(?:\.\d+)?)")
SILENCE_END_RE = re.compile(
    r"silence_end:\s*(-?\d+(?:\.\d+)?)\s*\|\s*silence_duration:\s*(-?\d+(?:\.\d+)?)"
)

PHONEME_BLOCK_RE = re.compile(
    r"(const\s+PHONEME_AUDIO\s*=\s*\{)(.*?)(\n\};)", re.S
)
SOUNDS_BLOCK_RE = re.compile(r"const\s+SOUNDS\s*=\s*\{(.*?)\n\};", re.S)

AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac", ".opus", ".webm"}


# ---------------------------------------------------------------- ffmpeg

def get_ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
    except ImportError:
        raise SystemExit(
            "缺少 imageio_ffmpeg。装它：pip install imageio-ffmpeg\n"
            "（与 build_audio.py 同一来源，不额外依赖系统 ffmpeg）"
        )
    return imageio_ffmpeg.get_ffmpeg_exe()


def run_ffmpeg(ffmpeg: str, args: list[str]) -> tuple[int, str]:
    """跑一次 ffmpeg，返回 (returncode, stderr 全文)。分析类 filter 输出都在 stderr。"""
    try:
        p = subprocess.run(
            [ffmpeg, "-hide_banner", "-nostdin", *args],
            capture_output=True, text=True, errors="replace", timeout=60,
        )
        return p.returncode, p.stderr
    except subprocess.TimeoutExpired as e:
        return -1, f"ffmpeg 超时（60s）被终止：{e}"


def parse_duration_seconds(stderr: str) -> float | None:
    m = DURATION_RE.search(stderr)
    if not m:
        return None
    h, mi, s = m.group(1), m.group(2), m.group(3)
    return int(h) * 3600 + int(mi) * 60 + float(s)


def measure_max_volume(ffmpeg: str, path: Path) -> float | None:
    rc, stderr = run_ffmpeg(ffmpeg, ["-i", str(path), "-af", "volumedetect", "-f", "null", "-"])
    if rc != 0:
        return None
    m = VOLUME_RE.search(stderr)
    return float(m.group(1)) if m else None


def has_head_or_tail_silence(stderr: str, duration: float | None) -> str | None:
    """尾静音沿用 build_audio.py 的 EOF-flush 配对判据；**头部判据对音素放宽**。

    2026-09-01 实测教训：直接套用单词管线的"头部静音 start<5ms 即不合格"，会把
    第一周六段已定稿的音素音全判成不合格（头部 52–97ms）。原因是塞音 /p/ /t/ 本身
    就以**闭塞段**（无声）起头，那是音素的组成部分，不是该裁的静音；擦音鼻音从静音
    自然爬升也一样。参考标准把参考文件判不合格，说明判据错了而不是文件错了。

    误裁的代价是实的：对已归一的音频再跑 silenceremove，实测把 p 从 0.39s 削到
    0.13s——爆破前的闭塞没了，听感直接从 /p/ 变成一声爆音。

    所以头部只拦"明显没裁过"的长静音（> HEAD_SILENCE_MAX），不拦音素自身的起音。
    """
    starts = [float(x) for x in SILENCE_START_RE.findall(stderr)]
    ends = [(float(a), float(b)) for a, b in SILENCE_END_RE.findall(stderr)]
    if len(starts) > len(ends):
        return "尾部仍有静音（silence_start 无配对 silence_end，静音持续到 EOF）"
    for st, (_en, dur) in zip(starts, ends):
        if st < HEAD_EPS and dur > HEAD_SILENCE_MAX:
            return (f"头部静音过长（{dur:.3f}s > {HEAD_SILENCE_MAX}s）——"
                    f"这不像音素起音，像是没裁过的录音留白")
    return None


# ---------------------------------------------------------------- HTML 解析

def read_target(target: Path) -> str:
    if not target.exists():
        raise SystemExit(f"自检 1 失败：目标 HTML 不存在：{target}")
    return target.read_text(encoding="utf-8")


def locate_phoneme_block(html: str, target: Path) -> re.Match:
    ms = list(PHONEME_BLOCK_RE.finditer(html))
    if len(ms) != 1:
        raise SystemExit(
            f"自检 1 失败：{target.name} 里 PHONEME_AUDIO 常量块命中 {len(ms)} 处，需恰好 1 处"
        )
    return ms[0]


def parse_existing(block_body: str) -> dict[str, str]:
    """解析已内嵌的音素音，返回 {键: data URI}。"""
    return dict(re.findall(r"[\"']?(\w+)[\"']?\s*:\s*[\"'](data:audio/[^\"']+)[\"']", block_body))


def parse_sounds(html: str) -> tuple[set[str], dict[str, str]]:
    """返回 (页面声明的全部音素键, {别名键: 真实音频键})。"""
    m = SOUNDS_BLOCK_RE.search(html)
    if not m:
        raise SystemExit("自检 3 失败：目标 HTML 里找不到 SOUNDS 常量，无法校验音素键")
    body = m.group(1)
    keys, alias = [], {}          # keys 保持页面声明序，新音素按这个序追加
    for km in re.finditer(r"^\s*(\w+)\s*:\s*\{", body, re.M):
        k = km.group(1)
        keys.append(k)
        seg = body[km.end():body.find("\n", km.end()) if body.find("\n", km.end()) > 0 else len(body)]
        am = re.search(r"audioKey\s*:\s*['\"](\w+)['\"]", seg)
        # audioKey 指向自己是 no-op（页面里写出来只为显式表意），不算别名。
        # 只有指向**别的**键才是真别名，那种键不需要自己的音频文件。
        if am and am.group(1) != k:
            alias[k] = am.group(1)
    return keys, alias


# ---------------------------------------------------------------- 主流程

def collect_sources(src_dir: Path) -> dict[str, Path]:
    if not src_dir.is_dir():
        raise SystemExit(f"自检 2 失败：源目录不存在：{src_dir}")
    found: dict[str, Path] = {}
    for p in sorted(src_dir.iterdir()):
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
            if p.stem in found:
                raise SystemExit(f"自检 2 失败：音素键 {p.stem} 有多个源文件，无法判定用哪个")
            found[p.stem] = p
    if not found:
        raise SystemExit(
            f"自检 2 失败：{src_dir} 下没有可识别的音频文件。\n"
            f"  文件名要等于音素键，扩展名支持：{', '.join(sorted(AUDIO_EXTS))}"
        )
    return found


def inspect(ffmpeg: str, path: Path) -> dict | None:
    """测一个文件的规格。返回 None 表示解码失败。"""
    rc, stderr = run_ffmpeg(ffmpeg, [
        "-i", str(path),
        "-af", f"volumedetect,silencedetect=noise={SILENCE_THRESHOLD_DB}dB:d={HEAD_TAIL_SILENCE_D}",
        "-f", "null", "-",
    ])
    if rc != 0:
        return None
    mvm = VOLUME_RE.search(stderr)
    am = re.search(r"Audio:\s*([^\n]*)", stderr)
    audio = am.group(1) if am else ""
    hzm = re.search(r"(\d+)\s*Hz", audio)
    brm = re.search(r"(\d+)\s*kb/s", audio)
    return {
        "peak": float(mvm.group(1)) if mvm else None,
        "duration": parse_duration_seconds(stderr),
        "codec_mp3": audio.strip().startswith("mp3"),
        "hz": hzm.group(1) if hzm else None,
        "mono": "mono" in audio,
        "kbps": brm.group(1) if brm else None,
        "silence": has_head_or_tail_silence(stderr, None),
    }


def conforms(info: dict | None) -> bool:
    """已经符合资源包规格？符合就原样透传，不再重编码。

    重编码已合规的 mp3 有两处实测危害（2026-09-01 干跑发现）：
      - silenceremove 在 −40dB 阈值下会把已归一音频里音素自身的送气/释放段当静音切掉
        （实测 p 从 0.39s 掉到 0.13s，塞音的爆破尾巴没了）
      - mp3 二次编码产生采样间峰值过冲（实测 t 从 −3.7dB 冲到 −1.7dB，出验收区间）
    所以幂等的正确含义是"合规即不动"，而不是"每次都重跑同样的处理链"。
    """
    if not info:
        return False
    return (
        info["codec_mp3"]
        and info["hz"] == MP3_SAMPLE_RATE
        and info["mono"]
        and info["peak"] is not None and PEAK_LOW <= info["peak"] <= PEAK_HIGH
        and info["duration"] is not None and DURATION_MIN <= info["duration"] <= DURATION_MAX
        and info["silence"] is None
    )


def process_one(ffmpeg: str, key: str, src: Path, work_dir: Path) -> tuple[bytes, dict]:
    """两遍 ffmpeg：测量 → 裁静音+归一，处理后复测验证。返回 (mp3 字节, 指标)。"""
    raw_mv = measure_max_volume(ffmpeg, src)
    if raw_mv is None:
        raise SystemExit(f"自检 2 失败：[{key}] 响度测量失败，{src.name} 可能无法解码")
    gain_db = TARGET_PEAK_DBFS - raw_mv

    out = work_dir / f"{key}.mp3"
    out.unlink(missing_ok=True)
    af = (
        f"silenceremove=start_periods=1:start_threshold={SILENCE_THRESHOLD_DB}dB,"
        f"areverse,"
        f"silenceremove=start_periods=1:start_threshold={SILENCE_THRESHOLD_DB}dB,"
        f"areverse,"
        f"volume={gain_db:.3f}dB"
    )
    rc, stderr = run_ffmpeg(ffmpeg, [
        "-y", "-i", str(src), "-af", af,
        "-c:a", "libmp3lame", "-b:a", MP3_BITRATE, "-ar", MP3_SAMPLE_RATE, "-ac", "1",
        str(out),
    ])
    if rc != 0 or not out.exists() or out.stat().st_size == 0:
        out.unlink(missing_ok=True)
        raise SystemExit(f"[{key}] 处理失败（rc={rc}）；ffmpeg stderr 尾部：{stderr[-400:]}")

    vrc, vstderr = run_ffmpeg(ffmpeg, [
        "-i", str(out),
        "-af", f"volumedetect,silencedetect=noise={SILENCE_THRESHOLD_DB}dB:d={HEAD_TAIL_SILENCE_D}",
        "-f", "null", "-",
    ])
    if vrc != 0:
        raise SystemExit(f"[{key}] 处理后复测失败")
    duration = parse_duration_seconds(vstderr)
    mvm = VOLUME_RE.search(vstderr)
    peak = float(mvm.group(1)) if mvm else None

    if peak is None or not (PEAK_LOW <= peak <= PEAK_HIGH):
        raise SystemExit(
            f"自检 5 失败：[{key}] 处理后峰值 {peak} dBFS 不在 [{PEAK_LOW}, {PEAK_HIGH}]"
        )
    sil = has_head_or_tail_silence(vstderr, duration)
    if sil:
        raise SystemExit(f"自检 6 失败：[{key}] {sil}")
    if duration is None or not (DURATION_MIN <= duration <= DURATION_MAX):
        raise SystemExit(
            f"自检 7 失败：[{key}] 处理后时长 {duration}s 不在 "
            f"[{DURATION_MIN}, {DURATION_MAX}]——过短多半裁过头，过长多半没裁干净"
        )
    return out.read_bytes(), {"peak": peak, "duration": duration, "gain_db": gain_db,
                              "raw_peak": raw_mv, "bytes": out.stat().st_size}


def render_block(entries: dict[str, str], order: list[str]) -> str:
    """按 order 渲染。每行都带尾逗号——与第一周原块的写法一致，
    这样"没有新增音素"时重跑本脚本产出的 HTML 与输入逐字节相同（真幂等）。"""
    return "\n" + "\n".join(f"  {k}:'{entries[k]}'," for k in order if k in entries)


def do_extract(target: Path, out_dir: Path) -> int:
    html = read_target(target)
    m = locate_phoneme_block(html, target)
    existing = parse_existing(m.group(2))
    if not existing:
        print(f"{target.name} 的 PHONEME_AUDIO 是空的，没什么可导出")
        return 0
    out_dir.mkdir(parents=True, exist_ok=True)
    for k, uri in existing.items():
        b64 = uri.split(",", 1)[1]
        p = out_dir / f"{k}.mp3"
        p.write_bytes(base64.b64decode(b64))
        print(f"  导出 {p}  ({p.stat().st_size} 字节)")
    print(f"\n共导出 {len(existing)} 个音素音到 {out_dir}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="音素示范音处理与注入")
    ap.add_argument("--target", required=True, help="目标周课件 HTML")
    ap.add_argument("--src", help="源音频目录（文件名 = 音素键）")
    ap.add_argument("--extract-to", help="把目标 HTML 已内嵌的音素音导出到该目录，然后退出")
    ap.add_argument("--dry-run", action="store_true", help="只报告，不写目标 HTML")
    ap.add_argument("--force-reprocess", action="store_true",
                    help="连已合规的文件也强制重跑处理链（会有代际损失，一般别用）")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    target = Path(args.target)
    if not target.is_absolute():
        target = root / target
    print(f"目标：{target}")

    if args.extract_to:
        out = Path(args.extract_to)
        return do_extract(target, out if out.is_absolute() else root / out)

    if not args.src:
        raise SystemExit("要注入就得给 --src（或者用 --extract-to 只做导出）")
    src_dir = Path(args.src)
    if not src_dir.is_absolute():
        src_dir = root / src_dir
    print(f"源目录：{src_dir}\n")

    html = read_target(target)
    m = locate_phoneme_block(html, target)
    existing = parse_existing(m.group(2))
    declared, alias = parse_sounds(html)
    sources = collect_sources(src_dir)

    # 自检 3 / 4
    for k in sources:
        if k not in declared:
            raise SystemExit(
                f"自检 3 失败：源文件 {k} 对应的音素没在目标 HTML 的 SOUNDS 里声明。\n"
                f"  页面声明的音素：{' '.join(sorted(declared))}"
            )
        if k in alias:
            raise SystemExit(
                f"自检 4 失败：{k} 是别名音（audioKey → {alias[k]}），不该单独给源文件。\n"
                f"  把文件改名成 {alias[k]} 即可，页面会自动让 {k} 共用它。"
            )

    ffmpeg = get_ffmpeg_exe()
    work = root / "tmp" / "phonemes_build"
    work.mkdir(parents=True, exist_ok=True)

    print(f"{'音素':<6}{'处理':>10}{'峰值':>9}{'时长':>8}{'字节':>8}")
    merged = dict(existing)
    passthrough, processed = [], []
    for k in sorted(sources):
        src = sources[k]
        pre = inspect(ffmpeg, src)
        if conforms(pre) and not args.force_reprocess:
            data = src.read_bytes()
            info = {"peak": pre["peak"], "duration": pre["duration"], "bytes": len(data)}
            passthrough.append(k)
            how = "原样透传"
        else:
            data, info = process_one(ffmpeg, k, src, work)
            processed.append(k)
            how = "重新处理"
        merged[k] = "data:audio/mpeg;base64," + base64.b64encode(data).decode("ascii")
        print(f"{k:<6}{how:>8}{info['peak']:>8.1f}dB{info['duration']:>7.2f}s{info['bytes']:>8d}")

    if passthrough:
        print(f"\n原样透传 {len(passthrough)} 个（已合规，不重编码避免代际损失）："
              f"{' '.join(passthrough)}")
    if processed:
        print(f"重新处理 {len(processed)} 个：{' '.join(processed)}")

    # 覆盖报告
    need = {k for k in declared if k not in alias}
    have = {k for k in merged}
    missing = sorted(need - have)
    print(f"\n音素音覆盖：{len(have & need)}/{len(need)}")
    if missing:
        print(f"  仍缺：{' '.join(missing)}（按铁律 8，缺的不会给听音按钮）")
    if alias:
        print(f"  别名：{', '.join(f'{k}→{v}' for k, v in sorted(alias.items()))}")

    # 键序：已有的保持原样（教学序，别重排制造无谓 diff），新音素按页面 SOUNDS 声明序追加
    order = [k for k in existing if k in merged]
    order += [k for k in declared if k in merged and k not in order]
    new_block = m.group(1) + render_block(merged, order) + m.group(3)
    new_html = html[:m.start()] + new_block + html[m.end():]

    added = sorted(set(merged) - set(existing))
    replaced = sorted(k for k in sources if k in existing)
    total_kb = sum(len(base64.b64decode(v.split(",", 1)[1])) for v in merged.values()) / 1024
    print(f"\n新增 {len(added)}：{' '.join(added) or '无'}")
    print(f"覆盖 {len(replaced)}：{' '.join(replaced) or '无'}")
    print(f"内嵌音素音合计 {total_kb:.1f} KB；HTML {len(html)} → {len(new_html)} 字符")

    if args.dry_run:
        print("\n--dry-run：未写盘")
        return 0

    tmp = target.with_suffix(target.suffix + ".tmp")
    tmp.write_text(new_html, encoding="utf-8")
    tmp.replace(target)          # 原子替换
    print(f"\n已写入 {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
