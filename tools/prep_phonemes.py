# -*- coding: utf-8 -*-
"""从 Freesound 试听流切出音素示范音：下载（哈希校验）→ ffmpeg 解码 → 频谱门限降噪 → 按切点裁段
→ 淡入淡出 → 分带保留率护栏 → 写 WAV。

产出的 WAV 不是最终资源，要再交给 tools/build_phonemes.py 做裁静音 / 归一 / 编码 / 注入：
    python tools/prep_phonemes.py  --spec tools/phoneme_sources_w3.json --out tmp/phonemes_stage --clean
    python tools/build_phonemes.py --target week03.html --src tmp/phonemes_stage
    # 然后把 tmp/phonemes_build/<键>.mp3 复制进 assets/phonemes/（那才是真相源，见其 README）

为什么要有这个脚本：第一周的音素音手工剪完源文件就丢了，第二周的处理过程也没留脚本。
这里把"从哪段音、哪个切点、什么参数"写进 spec，日后换切点或换来源都能复跑，
也让 codex / 他人能核对每个音到底取自哪里。

spec 格式见 tools/phoneme_sources_w3.json：顶层 "_meta" 是说明，其余键 = 音素键，每项含
    source.preview   试听流 URL（下载到 tmp/phoneme_previews/ 缓存）
    source.sha256 / source.bytes   **必填**：试听流的哈希（64 位十六进制）与字节数（正整数）；
                     下载与缓存命中都校验，对不上就重下、再不对就报错；漏填直接拒绝，不会静默跳过校验
    start / end      裁段区间（秒，相对试听流）
    noise_sample_end 试听流开头这段当底噪样本（秒）；只在 nr_db > 0 时需要，且必须比 start 早至少半个
                     FFT 窗（约 11.6 ms），否则底噪末帧的窗会盖到音素起始
    nr_db            门限外时频点的衰减量（dB）；0 = 不降噪
    fade_in_ms / fade_out_ms           淡入淡出，两者之和不得超过段长
    fade_out_to_db   可选；淡出到该电平而不是到零（用于必须保住最短时长的短音）
    guard            可选 {"band":[lo,hi], "max_loss_db":x}：降噪后该频带在段内的能量损失超过 x dB 即失败
                     ——门限降噪对"本身像噪声"的擦音、对信噪比低的频带（如 /l/ 的 F3 区）可能削掉真实成分，
                     只看总峰值和时长发现不了（codex 21 审 M-2 + 自查 S-1）。护栏在写盘前判定，失败不碰已有产物
    inject           可选，默认 true，必须是 JSON 布尔。false = 候选：写到 <out>/candidates/，
                     build_phonemes.py 不会扫到子目录，不会被注入；人耳听检通过后再单独注入（见 assets/phonemes/README.md）

类型模糊的配置一律拒绝（失败关闭）：条目 / source / guard 必须是对象，数值必须是有限非布尔数。
输出目录顶层与 candidates/ 里凡是本次没生成的 .wav 都视为残留并报错——两者都可能被当作
build_phonemes.py 的 --src，残留混进去就绕过了"逐个听检后注入"。用 --clean 清掉。

每个键都打印分带（0–500 / 500–1500 / 1500–4000 / 4000–8000 Hz）能量变化和输出 WAV 的 sha256，
留在提交说明里即可复核。解码统一走 imageio_ffmpeg 自带的 ffmpeg（与 build_phonemes.py 同一个二进制），
不再依赖 libsndfile 解 mp3；只依赖 numpy + imageio_ffmpeg。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import urllib.request
import wave
from pathlib import Path

import numpy as np

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
PREVIEW_CACHE = ROOT / "tmp" / "phoneme_previews"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) english_for_child/prep_phonemes"
SAMPLE_RATE = 44100          # 与 build_phonemes.py 的 MP3_SAMPLE_RATE 一致
BANDS = [(0, 500), (500, 1500), (1500, 4000), (4000, 8000)]

N_FFT, HOP = 1024, 256
WIN = np.hanning(N_FFT)


# ---------------------------------------------------------------- ffmpeg / 文件

def get_ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
    except ImportError:
        raise SystemExit("缺少 imageio_ffmpeg。装它：pip install imageio-ffmpeg（与 build_phonemes.py 同一来源）")
    return imageio_ffmpeg.get_ffmpeg_exe()


def ffmpeg_decode(ffmpeg: str, path: Path) -> np.ndarray:
    """解码成 44.1 kHz 单声道 float64。与 build_phonemes.py 用同一个 ffmpeg 二进制。

    不用 ffmpeg 的 `-ac 1`：它对立体声做 L+R×0.707 下混，Freesound 试听流是左右相同的
    双声道，会平白抬高 3 dB（实测 b 候选被抬到 +0.6 dBFS 削波）。改为先解成两声道
    再逐样本平均——单声道源会被复制成两路，平均后不变；立体声源得到与逐声道相同的电平。
    """
    p = subprocess.run(
        [ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-i", str(path),
         "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "2", "-ar", str(SAMPLE_RATE), "-"],
        capture_output=True, timeout=60,
    )
    if p.returncode != 0 or not p.stdout:
        raise SystemExit(f"ffmpeg 解码失败：{path.name}\n{p.stderr.decode('utf-8', 'replace')[-400:]}")
    pcm = np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)
    return pcm.reshape(-1, 2).mean(axis=1)


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_file(path: Path, sha256: str | None, nbytes: int | None) -> str | None:
    """返回 None 表示校验通过，否则返回不通过的原因。"""
    if not path.exists() or path.stat().st_size == 0:
        return "文件不存在或为空"
    if nbytes is not None and path.stat().st_size != nbytes:
        return f"字节数 {path.stat().st_size} ≠ 清单 {nbytes}"
    if sha256 and sha256_of(path) != sha256.lower():
        return "sha256 与清单不符"
    return None


def fetch(url: str, dst: Path, sha256: str, nbytes: int) -> Path:
    """下载到 .part，校验通过才原子改名；缓存命中也校验，不符则重下一次。

    任何失败路径（网络中断、写盘异常、校验不符）都删掉 .part，只有 os.replace 成功后才留下结果；
    旧的同名 .part 在下载前先删。sha256 / bytes 是必填参数，不给"跳过校验"的口子（codex 22 审 M-1 / M-2）。
    """
    if verify_file(dst, sha256, nbytes) is None:
        return dst
    if dst.exists():
        print(f"    缓存 {dst.name} 校验不过（{verify_file(dst, sha256, nbytes)}），重新下载")
    dst.parent.mkdir(parents=True, exist_ok=True)
    part = dst.with_suffix(dst.suffix + ".part")
    part.unlink(missing_ok=True)
    done = False
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r, open(part, "wb") as f:
            f.write(r.read())
        why = verify_file(part, sha256, nbytes)
        if why:
            raise SystemExit(f"下载 {url} 后校验失败：{why}。试听流可能已变或下载被截断，请重新核对清单里的 sha256 / bytes")
        os.replace(part, dst)
        done = True
    finally:
        if not done:
            part.unlink(missing_ok=True)
    return dst


def write_wav(path: Path, seg: np.ndarray, sr: int) -> None:
    pcm = np.clip(np.round(seg * 32767.0), -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


# ---------------------------------------------------------------- 信号处理

def stft(y: np.ndarray) -> np.ndarray:
    pad = np.concatenate([np.zeros(N_FFT // 2), y, np.zeros(N_FFT // 2 + HOP)])
    frames = 1 + (len(pad) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(frames)[:, None]
    return np.fft.rfft(pad[idx] * WIN, axis=1)


def istft(S: np.ndarray, length: int) -> np.ndarray:
    frames = S.shape[0]
    out = np.zeros(N_FFT + HOP * (frames - 1))
    wsum = np.zeros_like(out)
    fr = np.fft.irfft(S, n=N_FFT, axis=1) * WIN
    for i in range(frames):
        out[i * HOP:i * HOP + N_FFT] += fr[i]
        wsum[i * HOP:i * HOP + N_FFT] += WIN ** 2
    return (out / np.maximum(wsum, 1e-8))[N_FFT // 2:N_FFT // 2 + length]


def spectral_gate(x: np.ndarray, sr: int, noise_end: float, nr_db: float) -> np.ndarray:
    """逐频点门限：底噪样本的 均值 + 1.5σ 为阈，低于阈的时频点衰减 nr_db。
    掩码做 3 帧 × 5 频点的盒式平滑，减少"音乐噪声"。"""
    from numpy.lib.stride_tricks import sliding_window_view

    S = stft(x)
    mag = np.abs(S)
    nf = max(int(noise_end * sr / HOP), 4)
    thr = mag[:nf].mean(axis=0) + 1.5 * mag[:nf].std(axis=0)
    mask = (mag > thr[None, :]).astype(float)
    mp = np.pad(mask, ((1, 1), (2, 2)), mode="edge")
    smooth = (sliding_window_view(mp, (3, 5)) * (np.ones((3, 5)) / 15.0)).sum(axis=(2, 3))
    floor = 10 ** (-nr_db / 20)
    gain = floor + (1 - floor) * np.clip(smooth, 0, 1)
    return istft(S * gain, len(x))


def band_energy(seg: np.ndarray, sr: int, lo: float, hi: float) -> float:
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    f = np.fft.rfftfreq(len(seg), 1 / sr)
    return float((spec[(f >= lo) & (f < hi)] ** 2).sum()) + 1e-20


def band_losses(before: np.ndarray, after: np.ndarray, sr: int) -> list[tuple[int, int, float]]:
    return [(lo, hi, 10 * math.log10(band_energy(after, sr, lo, hi) / band_energy(before, sr, lo, hi)))
            for lo, hi in BANDS]


# ---------------------------------------------------------------- 校验

def _num(it: dict, k: str, default=None, lo=None, hi=None, key="") -> float:
    v = it.get(k, default)
    if v is None:
        raise SystemExit(f"[{key}] 缺少字段 {k}")
    if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
        raise SystemExit(f"[{key}] 字段 {k} 必须是有限数值，得到 {v!r}")
    if lo is not None and v < lo:
        raise SystemExit(f"[{key}] 字段 {k}={v} 小于下限 {lo}")
    if hi is not None and v > hi:
        raise SystemExit(f"[{key}] 字段 {k}={v} 大于上限 {hi}")
    return float(v)


SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
KEY_RE = re.compile(r"^[a-z]\w*$")           # 音素键：小写字母开头的单词字符（与 SOUNDS 键一致；将来 sh / ck 也能过），排除路径分隔符
NOISE_GAP_MIN = N_FFT / (2 * SAMPLE_RATE)   # 底噪终点到音素起点至少隔半个 FFT 窗（约 11.6 ms），否则底噪末帧的窗会盖到音素


def validate_key(key: str) -> None:
    """键会直接拼进文件名（<key>.wav、<sound_id>_<key>.mp3），必须是安全的 basename（codex 23 审 M-2）。"""
    if not isinstance(key, str) or not KEY_RE.match(key) or Path(key).name != key:
        raise SystemExit(f"音素键 {key!r} 不合法：须是小写字母开头的单词字符，不能含路径分隔符")


def _pos_int(key: str, name: str, v) -> int:
    if isinstance(v, bool) or not isinstance(v, int) or v <= 0:
        raise SystemExit(f"[{key}] {name} 必须是正整数，得到 {v!r}")
    return v


def _nonempty_str(key: str, name: str, v) -> str:
    if not isinstance(v, str) or not v.strip():
        raise SystemExit(f"[{key}] {name} 必须是非空字符串，得到 {v!r}")
    return v


def validate_source(key: str, it: dict) -> dict:
    """source 子对象：必填字段齐全且类型合法。漏填 / 写错不许静默退化，也不许拖到网络或写盘阶段才炸
    （codex 22 审 M-1、23 审 M-2 / L-1）。sound_id 会拼进缓存文件名，必须是正整数。"""
    src = it.get("source")
    if not isinstance(src, dict):
        raise SystemExit(f"[{key}] source 必须是对象，得到 {type(src).__name__}")
    for f in ("preview", "sound_id", "author", "title", "license", "sha256", "bytes"):
        if f not in src:
            raise SystemExit(f"[{key}] source 缺少字段 {f}")
    for f in ("author", "title", "license"):
        _nonempty_str(key, f"source.{f}", src[f])
    preview = _nonempty_str(key, "source.preview", src["preview"])
    if not preview.startswith("https://"):
        raise SystemExit(f"[{key}] source.preview 必须是 https:// 开头的 URL，得到 {preview!r}")
    _pos_int(key, "source.sound_id", src["sound_id"])
    if not isinstance(src["sha256"], str) or not SHA256_RE.match(src["sha256"]):
        raise SystemExit(f"[{key}] source.sha256 必须是 64 位十六进制字符串，得到 {src['sha256']!r}")
    _pos_int(key, "source.bytes", src["bytes"])
    return src


def validate(key: str, it: dict, duration: float) -> dict:
    """把 spec 一项校验并规整成数值字典。所有错误都带键名，方便定位；类型模糊一律拒绝（失败关闭）。"""
    if not isinstance(it, dict):
        raise SystemExit(f"[{key}] 条目必须是对象，得到 {type(it).__name__}")
    inject = it.get("inject", True)
    if not isinstance(inject, bool):
        raise SystemExit(f"[{key}] inject 必须是 JSON 布尔值 true / false，得到 {inject!r}（候选开关不接受模糊值）")
    start = _num(it, "start", lo=0.0, key=key)
    end = _num(it, "end", lo=0.0, key=key)
    if not start < end:
        raise SystemExit(f"[{key}] 需要 start < end，得到 {start}–{end}")
    if end > duration + 1e-6:
        raise SystemExit(f"[{key}] end={end}s 超出试听流长度 {duration:.3f}s")
    nr = _num(it, "nr_db", default=0.0, lo=0.0, hi=60.0, key=key)
    noise_end = None
    if nr > 0:
        # 只有真要降噪才需要底噪样本；样本必须整段落在音素之前，且留出半个 FFT 窗的余量
        noise_end = _num(it, "noise_sample_end", default=0.12, lo=0.02, key=key)
        if start - noise_end < NOISE_GAP_MIN:
            raise SystemExit(f"[{key}] noise_sample_end={noise_end}s 距 start={start}s 不足 {NOISE_GAP_MIN * 1000:.1f}ms"
                             f"（底噪样本要整段落在音素之前，且留出半个 FFT 窗）")
    fi = _num(it, "fade_in_ms", default=5.0, lo=0.0, key=key)
    fo = _num(it, "fade_out_ms", default=30.0, lo=0.0, key=key)
    seg_ms = (end - start) * 1000
    if fi + fo > seg_ms:
        raise SystemExit(f"[{key}] 淡入 {fi}ms + 淡出 {fo}ms 超过段长 {seg_ms:.0f}ms")
    to_db = it.get("fade_out_to_db")
    if to_db is not None:
        to_db = _num(it, "fade_out_to_db", hi=0.0, key=key)
    guard = it.get("guard")
    if guard is not None:
        if not isinstance(guard, dict):
            raise SystemExit(f"[{key}] guard 必须是对象，得到 {type(guard).__name__}")
        band = guard.get("band")
        ok = (isinstance(band, list) and len(band) == 2
              and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in band)
              and 0 <= band[0] < band[1] <= SAMPLE_RATE / 2)
        if not ok:
            raise SystemExit(f"[{key}] guard.band 必须是两个有限数值 [lo, hi]（0 ≤ lo < hi ≤ {SAMPLE_RATE // 2}），得到 {band!r}")
        _num(guard, "max_loss_db", lo=0.0, key=key)
        guard = {"band": [float(band[0]), float(band[1])], "max_loss_db": float(guard["max_loss_db"])}
    return {"start": start, "end": end, "noise_end": noise_end, "nr": nr, "fi": fi, "fo": fo,
            "to_db": to_db, "guard": guard, "inject": inject}


# ---------------------------------------------------------------- 主流程

def prep_one(ffmpeg: str, key: str, it: dict, out_dir: Path) -> Path:
    validate_key(key)
    if not isinstance(it, dict):
        raise SystemExit(f"[{key}] 条目必须是对象，得到 {type(it).__name__}")
    src = validate_source(key, it)
    cache = PREVIEW_CACHE / f"{src['sound_id']}_{key}.mp3"
    fetch(src["preview"], cache, src["sha256"], src["bytes"])
    x = ffmpeg_decode(ffmpeg, cache)
    sr = SAMPLE_RATE
    p = validate(key, it, len(x) / sr)

    y = spectral_gate(x, sr, p["noise_end"], p["nr"]) if p["nr"] > 0 else x
    a, b = int(p["start"] * sr), int(p["end"] * sr)
    losses = band_losses(x[a:b], y[a:b], sr)

    # 护栏先判、再写盘：失败时不碰输出目录里可能已有的合格产物（codex 22 审 M-3）
    g = p["guard"]
    if g:
        lo, hi = g["band"]
        loss = -10 * math.log10(band_energy(y[a:b], sr, lo, hi) / band_energy(x[a:b], sr, lo, hi))
        if loss > g["max_loss_db"]:
            raise SystemExit(f"[{key}] 护栏失败：{lo:.0f}-{hi:.0f}Hz 在段内损失 {loss:.1f} dB > 允许 {g['max_loss_db']} dB。"
                             f"降噪把该音的真实成分削掉了，调低 nr_db 或换切点")
    seg = y[a:b].copy()
    fi, fo = int(p["fi"] / 1000 * sr), int(p["fo"] / 1000 * sr)
    if fi:
        seg[:fi] *= np.linspace(0, 1, fi)
    if fo:
        seg[-fo:] *= (np.linspace(1, 0, fo) if p["to_db"] is None
                      else 10 ** (np.linspace(0, p["to_db"], fo) / 20))

    # PCM16 写盘前把峰值压到 -1 dBFS 以内，防削波；build_phonemes.py 之后会统一归一到 -3 dBFS，
    # 这里的电平只影响它 -40 dB 裁静音的相对位置，压 1–2 dB 无碍。
    peak_lin = float(np.abs(seg).max())
    cap = 10 ** (-1 / 20)
    if peak_lin > cap:
        seg *= cap / peak_lin
        print(f"    [{key}] 段峰值 {20 * math.log10(peak_lin):+.1f} dBFS 超过 -1 dBFS，已按比例压到 -1 dBFS")

    target_dir = out_dir if p["inject"] else out_dir / "candidates"
    target_dir.mkdir(parents=True, exist_ok=True)
    out = target_dir / f"{key}.wav"
    tmp = target_dir / f"{key}.wav.tmp"
    try:
        write_wav(tmp, seg, sr)
        os.replace(tmp, out)          # 原子落盘：写完整才替换，同 build_phonemes.py 的 atomic_write 习惯
    finally:
        tmp.unlink(missing_ok=True)

    peak = 20 * math.log10(float(np.abs(seg).max()) + 1e-9)
    loss_txt = " ".join(f"{lo}-{hi}Hz {d:+.1f}" for lo, hi, d in losses)
    tag = "" if p["inject"] else "（候选，不注入）"
    print(f"  {key}{tag}: {src['author']}/{src['title']} #{src['sound_id']} "
          f"{p['start']:.2f}-{p['end']:.2f}s -> {len(seg) / sr:.3f}s, 峰值 {peak:.1f} dBFS, 降噪 {p['nr']:g} dB")
    print(f"      段内分带能量变化 dB: {loss_txt}")
    print(f"      sha256 {sha256_of(out)}  {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="从试听流切出音素示范音（交给 build_phonemes.py 规格化）")
    ap.add_argument("--spec", required=True, help="来源与切点清单 JSON，如 tools/phoneme_sources_w3.json")
    ap.add_argument("--out", required=True, help="WAV 输出目录，如 tmp/phonemes_stage")
    ap.add_argument("--key", action="append", help="只处理这些键（可重复）")
    ap.add_argument("--clean", action="store_true", help="先清空输出目录里的 .wav（含 candidates/），避免残留混入注入")
    ap.add_argument("--include-candidates", action="store_true",
                    help="连 inject=false 的候选也处理（写到 <out>/candidates/）")
    args = ap.parse_args()

    spec_path = Path(args.spec)
    spec_path = spec_path if spec_path.is_absolute() else ROOT / spec_path
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    items = {k: v for k, v in spec.items() if not k.startswith("_")}
    if args.key:
        unknown = sorted(set(args.key) - set(items))
        if unknown:
            raise SystemExit(f"--key 不在 spec 里：{unknown}")
        items = {k: items[k] for k in args.key}
    if not args.include_candidates:
        # 非对象条目不在这里判，留给 prep_one 用带键名的 SystemExit 拒绝（codex 23 审 M-1）
        skipped = [k for k, v in items.items() if isinstance(v, dict) and v.get("inject", True) is False]
        items = {k: v for k, v in items.items() if k not in skipped}
        if skipped:
            print(f"跳过候选（inject=false）：{' '.join(skipped)}；加 --include-candidates 才处理\n")

    out_dir = Path(args.out)
    out_dir = out_dir if out_dir.is_absolute() else ROOT / out_dir
    if args.clean and out_dir.exists():
        for p in list(out_dir.glob("*.wav")) + list((out_dir / "candidates").glob("*.wav")):
            p.unlink()
    print(f"spec：{spec_path}\n输出：{out_dir}\n")

    ffmpeg = get_ffmpeg_exe()
    produced: set[Path] = set()
    for k, it in items.items():
        produced.add(prep_one(ffmpeg, k, it, out_dir).resolve())

    # 残留检测：任何会被 build_phonemes.py 当作 --src 的目录都要查——顶层和 candidates/ 都是
    # （提升候选时 candidates/ 就是源目录，旧候选混在里面会绕过"逐个听检后提升"，codex 22 审 H-1）
    cand_dir = out_dir / "candidates"
    stale = [p for p in out_dir.glob("*.wav") if p.resolve() not in produced]
    if cand_dir.is_dir():
        stale += [p for p in cand_dir.glob("*.wav") if p.resolve() not in produced]
    if stale:
        names = ", ".join(str(p.relative_to(out_dir)) for p in stale)
        raise SystemExit(f"输出目录里有本次没生成的残留文件：{names}。"
                         f"它们会被 build_phonemes.py 一并注入——加 --clean 重跑，或手动删掉")
    print(f"\n共 {len(items)} 个；下一步：python tools/build_phonemes.py --target week0N.html --src {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
