# -*- coding: utf-8 -*-
"""按 tools/audio_manifest.json 批量生成 edge-tts 音频（断点续跑：已存在且非空的文件跳过）。

用法：python tools/gen_audio.py [--force] [--manifest tools/audio_manifest_w2.json]
输出：assets/audio_raw/<file>（裁静音/响度归一由 build_audio.py 负责，此处只生成原始 clip）
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "tools" / "audio_manifest.json"   # 可被 --manifest 覆盖
OUT_DIR = ROOT / "assets" / "audio_raw"
CONCURRENCY = 3


def load_manifest():
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    items = m["items"]
    # 前置断言：键唯一、文件名唯一、条数 56、黑名单不在清单
    keys = [it["key"] for it in items]
    files = [it["file"] for it in items]
    expected = m.get("expected_items", 56)
    assert len(keys) == len(set(keys)) == expected, f"键不唯一或条数不是 {expected}：{len(keys)}/{len(set(keys))}"
    assert len(files) == len(set(files)), "文件名冲突"
    leaked = set(k.lower() for k in keys) & set(m["reserved_blacklist"])
    assert not leaked, f"黑名单泄漏进清单：{leaked}"
    return m


async def gen_one(sem, voice, rate_map, it, force):
    out = OUT_DIR / it["file"]
    if not force and out.exists() and out.stat().st_size > 0:
        return ("skip", it["key"])
    async with sem:
        # 默认沿用整周声线/分类语速；小书等特殊条目可在 manifest 中逐条覆盖。
        # 这样儿童故事能使用儿童声线，而单词、音素和其他句子不被连带重生成。
        item_voice = it.get("voice", voice)
        item_rate = it.get("rate", rate_map[it["type"]])
        tts = edge_tts.Communicate(it["text"], item_voice, rate=item_rate)
        await tts.save(str(out))
    return ("ok", it["key"])


async def main(force, only_keys=None):
    m = load_manifest()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    items = m["items"]
    if only_keys:
        requested = set(only_keys)
        known = {it["key"] for it in items}
        missing = sorted(requested - known)
        if missing:
            raise SystemExit(f"--key 不在 manifest 中：{missing}")
        items = [it for it in items if it["key"] in requested]
    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = [gen_one(sem, m["voice"], m["rate"], it, force) for it in items]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    ok = skip = 0
    failed = []
    for it, r in zip(items, results):
        if isinstance(r, Exception):
            failed.append((it["key"], repr(r)))
        elif r[0] == "ok":
            ok += 1
        else:
            skip += 1
    print(f"本次选择 {len(items)} 条：生成 {ok} 条，跳过 {skip} 条，失败 {len(failed)} 条")
    for k, e in failed:
        print(f"  FAILED {k}: {e}")
    if failed:
        sys.exit(1)
    # 完整性复核：每条文件存在且非空
    missing = [it["file"] for it in m["items"] if not (OUT_DIR / it["file"]).exists() or (OUT_DIR / it["file"]).stat().st_size == 0]
    if missing:
        print(f"缺失/空文件：{missing}")
        sys.exit(1)
    total = sum((OUT_DIR / it["file"]).stat().st_size for it in m["items"])
    print(f"{len(m['items'])} 条齐全，共 {total/1024:.0f}KB（base64 内嵌预估 {total*1.33/1024:.0f}KB）")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="忽略已有文件全部重新生成")
    ap.add_argument("--manifest", help="词表清单路径（默认第一周 tools/audio_manifest.json）")
    ap.add_argument("--key", action="append", help="只生成指定 key；可重复传入，适合局部回炉")
    _a = ap.parse_args()
    if _a.manifest:
        _p = Path(_a.manifest)
        MANIFEST = _p if _p.is_absolute() else ROOT / _a.manifest
    asyncio.run(main(_a.force, _a.key))
