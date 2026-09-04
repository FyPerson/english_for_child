#!/usr/bin/env python3
"""Archive the public HQ previews from margo_heston's English Phonemes pack.

The archive is reference material only.  It lives below assets/phonemes/source-library,
so build_phonemes.py (which scans only the top level) will never inject it by accident.
"""

from __future__ import annotations

import hashlib
import html as html_lib
import json
import os
import re
import urllib.request
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "phonemes" / "source-library" / "margo_heston-english-phonemes"
PACK_ID = 12249
EXPECTED_COUNT = 43
SEARCH_URL = (
    "https://freesound.org/search/"
    "?f=pack_grouping%3A%2212249_English%20Phonemes%22"
    "&g=1&s=Date%20added%20%28newest%20first%29&page={}"
)
PLAYER_RE = re.compile(
    r'data-sound-id="(?P<id>\d+)"[\s\S]*?'
    r'data-mp3="(?P<mp3>[^"]+)"[\s\S]*?'
    r'data-title="(?P<title>[^"]+)"[\s\S]*?'
    r'data-duration="(?P<duration>[^"]+)"'
)
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "english-for-child source archiver/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    entries: dict[int, dict] = {}
    page_urls = []
    for page in range(1, 4):
        url = SEARCH_URL.format(page)
        page_urls.append(url)
        body = fetch(url).decode("utf-8")
        for match in PLAYER_RE.finditer(body):
            sound_id = int(match.group("id"))
            title = html_lib.unescape(match.group("title"))
            lq_url = html_lib.unescape(match.group("mp3"))
            hq_url = lq_url.replace("-lq.mp3", "-hq.mp3")
            if hq_url == lq_url or not hq_url.startswith("https://cdn.freesound.org/previews/"):
                raise SystemExit(f"unexpected preview URL for {sound_id}: {lq_url}")
            stem = SAFE_NAME_RE.sub("_", Path(title).stem).strip("._")
            entries[sound_id] = {
                "sound_id": sound_id,
                "title": title,
                "duration_seconds": float(match.group("duration")),
                "page": f"https://freesound.org/people/margo_heston/sounds/{sound_id}/",
                "preview": hq_url,
                "file": f"{sound_id}_{stem}.mp3",
            }

    if len(entries) != EXPECTED_COUNT:
        raise SystemExit(f"pack listing changed: expected {EXPECTED_COUNT} sounds, found {len(entries)}")

    OUT.mkdir(parents=True, exist_ok=True)
    manifest_entries = []
    for sound_id in sorted(entries):
        item = entries[sound_id]
        target = OUT / item["file"]
        data = fetch(item["preview"])
        if len(data) < 512 or not (data.startswith(b"ID3") or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")):
            raise SystemExit(f"download for {sound_id} is not a plausible MP3 ({len(data)} bytes)")
        part = target.with_suffix(target.suffix + ".part")
        try:
            part.write_bytes(data)
            os.replace(part, target)
        finally:
            part.unlink(missing_ok=True)
        item["bytes"] = len(data)
        item["sha256"] = sha256(data)
        manifest_entries.append(item)
        print(f"{sound_id}  {item['title']:<10} {len(data):>7} bytes  {item['sha256'][:12]}")

    manifest = {
        "pack": {
            "id": PACK_ID,
            "title": "English Phonemes",
            "author": "margo_heston",
            "page": "https://freesound.org/people/margo_heston/packs/12249/",
            "license": "CC BY-NC 4.0",
            "note": "Public HQ MP3 previews; reference source archive, not page-ready teaching clips.",
        },
        "retrieved": date.today().isoformat(),
        "listing_pages": page_urls,
        "count": len(manifest_entries),
        "files": manifest_entries,
    }
    manifest_path = OUT / "manifest.json"
    tmp = manifest_path.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, manifest_path)
    finally:
        tmp.unlink(missing_ok=True)
    print(f"\nArchived {len(manifest_entries)} HQ previews to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
