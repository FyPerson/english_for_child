"""Single-file baseline of the four delivered weeks.

`--create` takes the baseline once (clean tree before and after a fresh build) and writes
tests/fixtures/baseline_20260907.json. `--check` compares the current build with it: skeleton hash,
declaration order, and per-key media bytes. `build` and `check` only ever read the fixture; retaking it is a
deliberate `--create --force` in its own commit.

Transitional (phase 0 and phase 1 of the engineering plan v1.3 §3.4 ③): the default build form is the single-file
form, so both commands read the products the default build writes: `--create` reads build/ right after building,
`--check` reads the products directory given with `--dir` (run_checks passes its reproducible-build temporary
directory) or build/ by default. From phase 1b both build explicitly with `--single-file`.
"""
import argparse
import datetime
import hashlib
import json
import platform
import re
import subprocess
import sys
from pathlib import Path
from project_config import ROOT, BUILD, load_config, week_name

NAMES = ['PHONEME_AUDIO', 'WORD_AUDIO', 'PHONEME_ILL', 'WORD_ILL', 'WALL_ILL', 'BOOK_IMG', 'CELEBRATE_NAT']
MIMES = {'audio/mpeg', 'image/png', 'image/webp'}
COVERED_WEEKS = [week_name(n) for n in (1, 2, 3, 4)]   # the delivered weeks the baseline must always cover
FIXTURE = ROOT / 'tests/fixtures/baseline_20260907.json'
HELPER = ROOT / 'tools/validation/media_declarations.js'
FORM = 'single-file'
HEX64 = re.compile(r'^[0-9a-f]{64}$')
HEX40 = re.compile(r'^[0-9a-f]{40}$')


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def declarations(path):
    result = subprocess.run(['node', str(HELPER), str(path)], capture_output=True, text=True, encoding='utf-8', timeout=120)
    if result.returncode:
        raise ValueError((result.stderr or '').strip() or f'media_declarations failed for {path}')
    return json.loads(result.stdout)


def analyze(path):
    """Return sha256, skeletonSha256, declarationOrder and media table of one built lesson."""
    raw_bytes = Path(path).read_bytes()
    if b'\r' in raw_bytes:
        raise ValueError(f'{Path(path).name}: carriage return found; built lessons must be LF only')
    raw = raw_bytes.decode('utf-8')
    decls = declarations(path)
    order = sorted(NAMES, key=lambda name: raw.index(decls[name]['text']))
    skeleton = raw
    for name in NAMES:
        text = decls[name]['text']
        if skeleton.count(text) != 1:
            raise ValueError(f'{name}: declaration text is not unique')
        skeleton = skeleton.replace(text, f'/*@MEDIA {name}@*/', 1)
    return {
        'sha256': sha256(raw_bytes),
        'skeletonSha256': sha256(skeleton.encode('utf-8')),
        'declarationOrder': order,
        'media': {name: decls[name]['entries'] for name in NAMES},
    }


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True).stdout.strip()


def build():
    subprocess.run([sys.executable, str(ROOT / 'tools/build_lessons.py')], cwd=ROOT, check=True)


def node_version():
    return subprocess.run(['node', '--version'], capture_output=True, text=True, encoding='utf-8', check=True).stdout.strip()


def create(force=False, fixture=FIXTURE):
    if fixture.exists() and not force:
        raise SystemExit(f'REFUSED: {fixture.name} already exists; retake deliberately with --force')
    if git('status', '--porcelain'):
        raise SystemExit('REFUSED: working tree or index is not clean')
    build()
    if git('status', '--porcelain'):
        raise SystemExit('REFUSED: the build changed tracked products, so HEAD does not describe them; commit the rebuilt products first')
    config = load_config()
    missing = [name for name in COVERED_WEEKS if name not in {week_name(n) for n in config['weeks']}]
    if missing:
        raise SystemExit('REFUSED: project.json no longer lists the covered weeks ' + ', '.join(missing))
    weeks = {name: analyze(BUILD / name) for name in COVERED_WEEKS}
    data = {
        'schemaVersion': 1,
        'takenAt': datetime.date.today().isoformat(),
        'sourceCommit': git('rev-parse', 'HEAD'),
        'form': FORM,
        'toolVersions': {'python': platform.python_version(), 'node': node_version(), 'hash': 'sha256'},
        'weeks': weeks,
        'course': {'sha256': sha256((BUILD / config['entry']).read_bytes())},
    }
    validate(data)
    fixture.parent.mkdir(parents=True, exist_ok=True)
    temp = fixture.with_suffix('.json.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    temp.replace(fixture)
    print('BASELINE ' + str(fixture), flush=True)
    return data


def _fail(message):
    raise SystemExit('baseline fixture invalid: ' + message)


def validate(data):
    """Reject any fixture that could pass silently: wrong shape, missing weeks, malformed entries."""
    if not isinstance(data, dict):
        _fail('not an object')
    expected_keys = {'schemaVersion', 'takenAt', 'sourceCommit', 'form', 'toolVersions', 'weeks', 'course'}
    if set(data) != expected_keys:
        _fail(f'top-level keys must be exactly {sorted(expected_keys)}')
    if data['schemaVersion'] != 1:
        _fail('unsupported schemaVersion')
    if data['form'] != FORM:
        _fail(f'form must be {FORM!r}, got {data["form"]!r}')
    if not isinstance(data['sourceCommit'], str) or not HEX40.match(data['sourceCommit']):
        _fail('sourceCommit must be a 40-hex commit id')
    if not isinstance(data['takenAt'], str) or not re.match(r'^\d{4}-\d{2}-\d{2}$', data['takenAt']):
        _fail('takenAt must be an ISO date')
    tools = data['toolVersions']
    if not isinstance(tools, dict) or set(tools) != {'python', 'node', 'hash'} or tools['hash'] != 'sha256':
        _fail('toolVersions must list python, node and hash sha256')
    course = data['course']
    if not isinstance(course, dict) or set(course) != {'sha256'} or not HEX64.match(str(course['sha256'])):
        _fail('course must carry a single sha256')
    weeks = data['weeks']
    if not isinstance(weeks, dict) or set(weeks) != set(COVERED_WEEKS):
        _fail(f'weeks must be exactly {COVERED_WEEKS}')
    for name in COVERED_WEEKS:
        entry = weeks[name]
        if not isinstance(entry, dict) or set(entry) != {'sha256', 'skeletonSha256', 'declarationOrder', 'media'}:
            _fail(f'{name}: entry keys must be sha256, skeletonSha256, declarationOrder, media')
        for field in ('sha256', 'skeletonSha256'):
            if not isinstance(entry[field], str) or not HEX64.match(entry[field]):
                _fail(f'{name}: {field} must be a 64-hex digest')
        order = entry['declarationOrder']
        if not isinstance(order, list) or not all(isinstance(x, str) for x in order):
            _fail(f'{name}: declarationOrder must be a list of strings')
        if sorted(order) != sorted(NAMES) or len(order) != len(NAMES):
            _fail(f'{name}: declarationOrder must be a permutation of the seven declarations')
        media = entry['media']
        if not isinstance(media, dict) or set(media) != set(NAMES):
            _fail(f'{name}: media must contain exactly the seven declarations')
        for decl in NAMES:
            rows = media[decl]
            if not isinstance(rows, list):
                _fail(f'{name}: {decl} must be a list')
            keys = []
            for row in rows:
                if not (isinstance(row, list) and len(row) == 3 and all(isinstance(x, str) for x in row)):
                    _fail(f'{name}: {decl} rows must be [key, mime, sha256]')
                key, mime, digest = row
                if mime not in MIMES or not HEX64.match(digest):
                    _fail(f'{name}: {decl}[{key!r}] has an unknown mime or a malformed digest')
                if key in keys:
                    _fail(f'{name}: {decl} has duplicate key {key!r}')
                keys.append(key)
            if decl == 'CELEBRATE_NAT' and keys != ['']:
                _fail(f'{name}: CELEBRATE_NAT must have exactly one entry with an empty key')
            if decl != 'CELEBRATE_NAT' and '' in keys:
                _fail(f'{name}: {decl} has an empty key')
    return data


def load(fixture=FIXTURE):
    if not fixture.exists():
        raise SystemExit(f'MISSING baseline fixture {fixture}; create it once with `python tools/project.py baseline --create`')
    try:
        data = json.loads(fixture.read_text(encoding='utf-8'))
    except ValueError as error:
        _fail(f'not valid JSON ({error})')
    return validate(data)


def _media_difference(name, decl, expected, actual):
    ek = [row[0] for row in expected]
    ak = [row[0] for row in actual]
    label = f'{name}: {decl}'
    if ek != ak:
        added = [k for k in ak if k not in ek]
        removed = [k for k in ek if k not in ak]
        parts = []
        if added:
            parts.append('added ' + ', '.join(repr(k) for k in added))
        if removed:
            parts.append('removed ' + ', '.join(repr(k) for k in removed))
        if not added and not removed:
            first = next(i for i, (x, y) in enumerate(zip(ek, ak)) if x != y)
            parts.append(f'reordered from position {first} ({ek[first]!r} expected, {ak[first]!r} built)')
        return [f'{label} keys differ: ' + '; '.join(parts)]
    out = []
    mime = [k or '<string>' for (k, m1, _), (_, m2, _) in zip(expected, actual) if m1 != m2]
    data = [k or '<string>' for (k, _, d1), (_, _, d2) in zip(expected, actual) if d1 != d2]
    if mime:
        out.append(f'{label} mime differs for ' + ', '.join(mime))
    if data:
        out.append(f'{label} bytes differ for ' + ', '.join(data))
    return out


def differences(expected, actual):
    """Human-readable differences between baseline week entries and freshly analyzed ones."""
    out = []
    for name in sorted(expected):
        if name not in actual:
            out.append(f'{name}: present in baseline but not built')
            continue
        e, a = expected[name], actual[name]
        if e['skeletonSha256'] != a['skeletonSha256']:
            out.append(f'{name}: skeletonSha256 differs ({e["skeletonSha256"][:12]} expected, {a["skeletonSha256"][:12]} built)')
        if e['declarationOrder'] != a['declarationOrder']:
            out.append(f'{name}: declarationOrder differs (expected {e["declarationOrder"]}, built {a["declarationOrder"]})')
        for decl in NAMES:
            out.extend(_media_difference(name, decl, e['media'][decl], a['media'][decl]))
    return out


# L1 修复（外审 low，2026-09-09）：改前"媒体唯一例外"只靠 docs/ 里的一段说明 + 代码
# 注释表达（方案 §2 提到的"枚举唯一例外"），check()/differences() 本身对它一无所知——
# 迁移期间任何一次 `python tools/baseline.py --check` 都会把这条已知例外和其余全部
# skeletonSha256/媒体差异混在同一份 diff 列表里，靠人眼分辨"这条是已知的"还是"这条是
# 新出现的引擎改造副作用"。这里补一份带 reason 分类（data-decision / engine-change）
# 的机器可断言清单：每一条记录哪一周、哪个媒体声明、哪个键、发生了什么变化（目前只有
# 'removed' 这一种，见下方用途）、为什么允许。
#
# 刻意不改 `differences()`/`check()` 本身的行为（那两个函数仍然照原样把这条例外也
# 报成一行 diff）——本任务的验收标准明确写着"基线差异单独跑，预期 4 条 skeletonSha256
# + 1 条 WORD_AUDIO keys differ removed 'pit'（已知例外）"，如果让 `differences()`
# 悄悄把这条例外从输出里过滤掉，验证时看到的只会是 4 条而不是 5 条，反而让人误以为
# 哪里坏了。这里改成一个独立的分类函数：把 `differences()` 产出的原始 diff 字符串，
# 按这份清单分成"已知例外"与"未知/意外"两组——`check()`/CI 要不要用它来放宽判据，
# 由后续阶段（第 9 步重取基线、或未来允许迁移期间部分放行）再决定，本次只补上这个
# 可断言的分类能力本身，见 tests/unit/test_baseline.py 的 L1 回归用例。
KNOWN_MEDIA_EXCEPTIONS = [
    {'week': 'week01.html', 'decl': 'WORD_AUDIO', 'key': 'pit', 'change': 'removed', 'reason': 'data-decision',
     'note': ("P8（2026-09-09 用户拍板）：W1 周检词 'spit' 换成 'pit'，'pit' 未配真人示范音，"
              "随词表变化从 WORD_AUDIO 里移除——这是里程碑 2 的数据层教学决策，不是引擎改造"
              "的副作用，见 docs/里程碑2实施方案 §2「枚举唯一例外」。")},
]


def classify_media_differences(diffs, exceptions=KNOWN_MEDIA_EXCEPTIONS):
    """把 `differences()` 产出的一条条原始 diff 字符串分成 known（命中已知例外）与
    unexpected（其余全部——包括非媒体的 skeletonSha256/declarationOrder 差异，那些
    这份清单从不覆盖）两组。

    只精确匹配"单个键的 removed"这一种最简形态——`_media_difference()` 在同一个
    decl 里有多处变化时会把它们合并进同一行（比如同时 added 又 removed，或者一次
    removed 多个键），那种合并后的行不会等于任何一条已知例外的精确文案，会被判
    unexpected。这是刻意的"精确守恒"：例外只保护"确实只发生了这一个、且只有这一个"
    的变化，一旦有别的变化混进同一个 decl，哪怕真正的例外也在其中，也要求人重新看一眼，
    不能让新的、未登记的媒体漂移搭着已知例外的车悄悄放行。"""
    known_labels = {
        f"{e['week']}: {e['decl']} keys differ: removed {e['key']!r}"
        for e in exceptions if e['change'] == 'removed'
    }
    known = [d for d in diffs if d in known_labels]
    unexpected = [d for d in diffs if d not in known_labels]
    return {'known': known, 'unexpected': unexpected}


def check(fixture=FIXTURE, week_paths=None, products_dir=None):
    """Compare built lessons with the fixture.

    `products_dir` is where the products were built (build/ by default; run_checks passes its temporary directory).
    `week_paths` (tests) must map every covered week explicitly and nothing else.
    """
    data = load(fixture)
    if week_paths is not None:
        missing = [name for name in COVERED_WEEKS if name not in week_paths]
        if missing:
            raise ValueError('week_paths must cover ' + ', '.join(missing))
        extra = sorted(set(week_paths) - set(COVERED_WEEKS))
        if extra:
            raise ValueError('week_paths has entries the baseline does not cover: ' + ', '.join(extra))
        built = {name: Path(week_paths[name]) for name in COVERED_WEEKS}
        skipped = []
    else:
        config = load_config()
        listed = [week_name(n) for n in config['weeks']]
        missing = [name for name in COVERED_WEEKS if name not in listed]
        if missing:
            raise SystemExit('project.json no longer lists the covered weeks ' + ', '.join(missing))
        directory = Path(products_dir) if products_dir is not None else BUILD
        built = {name: directory / name for name in COVERED_WEEKS}
        absent = [name for name in COVERED_WEEKS if not built[name].is_file()]
        if absent:
            raise SystemExit(f'MISSING products in {directory}: ' + ', '.join(absent) + '; run python tools/project.py build')
        skipped = [name for name in listed if name not in COVERED_WEEKS]
    actual = {name: analyze(path) for name, path in built.items()}
    diffs = differences(data['weeks'], actual)
    if diffs:
        raise SystemExit('BASELINE MISMATCH; if the change is intended, retake with '
                         '`python tools/project.py baseline --create --force` in its own commit:\n  ' + '\n  '.join(diffs))
    print(f'BASELINE OK: {len(actual)} weeks match {fixture.name} (form {FORM})'
          + (f'; not covered by the baseline: {", ".join(skipped)}' if skipped else ''), flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument('--create', action='store_true', help='Build, then write the baseline fixture (refuses to overwrite)')
    group.add_argument('--check', action='store_true', help='Compare the current build with the baseline fixture')
    ap.add_argument('--force', action='store_true', help='With --create only: overwrite an existing fixture deliberately')
    ap.add_argument('--fixture', type=Path, default=FIXTURE)
    ap.add_argument('--dir', type=Path, help='With --check: products directory to compare (default build/)')
    args = ap.parse_args()
    if args.force and not args.create:
        ap.error('--force only applies to --create')
    if args.dir is not None and not args.check:
        ap.error('--dir only applies to --check')
    if args.create:
        create(force=args.force, fixture=args.fixture)
    else:
        check(fixture=args.fixture, products_dir=args.dir)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
