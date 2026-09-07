"""Single-file baseline of the delivered weeks.

`--create` takes the baseline once (clean tree, fresh build) and writes tests/fixtures/baseline_20260907.json.
`--check` compares the current build with it: skeleton hash, declaration order, and per-key media bytes.
`build` and `check` only ever read the fixture; retaking it is a deliberate `--create --force` in its own commit.
"""
import argparse
import datetime
import hashlib
import json
import platform
import subprocess
import sys
from pathlib import Path
from project_config import ROOT, load_config, week_name

NAMES = ['PHONEME_AUDIO', 'WORD_AUDIO', 'PHONEME_ILL', 'WORD_ILL', 'WALL_ILL', 'BOOK_IMG', 'CELEBRATE_NAT']
FIXTURE = ROOT / 'tests/fixtures/baseline_20260907.json'
HELPER = ROOT / 'tools/validation/media_declarations.js'
FORM = 'single-file'


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def declarations(path):
    result = subprocess.run(['node', str(HELPER), str(path)], capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise ValueError((result.stderr or '').strip() or f'media_declarations failed for {path}')
    return json.loads(result.stdout)


def analyze(path):
    """Return sha256, skeletonSha256, declarationOrder and media table of one built lesson."""
    raw_bytes = Path(path).read_bytes()
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


def create(force=False, fixture=FIXTURE):
    if fixture.exists() and not force:
        raise SystemExit(f'REFUSED: {fixture.name} already exists; retake deliberately with --force')
    if git('status', '--porcelain'):
        raise SystemExit('REFUSED: working tree or index is not clean')
    subprocess.run([sys.executable, str(ROOT / 'tools/build_lessons.py')], cwd=ROOT, check=True)
    config = load_config()
    weeks = {week_name(n): analyze(ROOT / week_name(n)) for n in config['weeks']}
    node = subprocess.run(['node', '--version'], capture_output=True, text=True, encoding='utf-8', check=True).stdout.strip()
    data = {
        'schemaVersion': 1,
        'takenAt': datetime.date.today().isoformat(),
        'sourceCommit': git('rev-parse', 'HEAD'),
        'form': FORM,
        'toolVersions': {'python': platform.python_version(), 'node': node, 'hash': 'sha256'},
        'weeks': weeks,
        'course': {'sha256': sha256((ROOT / config['entry']).read_bytes())},
    }
    fixture.parent.mkdir(parents=True, exist_ok=True)
    temp = fixture.with_suffix('.json.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    temp.replace(fixture)
    print('BASELINE ' + str(fixture), flush=True)
    return data


def load(fixture=FIXTURE):
    if not fixture.exists():
        raise SystemExit(f'MISSING baseline fixture {fixture}; create it once with `python tools/project.py baseline --create`')
    data = json.loads(fixture.read_text(encoding='utf-8'))
    if data.get('schemaVersion') != 1:
        raise SystemExit('baseline: unsupported schemaVersion')
    if data.get('form') != FORM:
        raise SystemExit(f'baseline: form must be {FORM!r}, got {data.get("form")!r}')
    return data


def differences(expected, actual):
    """Human-readable differences between baseline week entries and freshly analyzed ones."""
    out = []
    for name in sorted(expected):
        if name not in actual:
            out.append(f'{name}: present in baseline but not built')
            continue
        e, a = expected[name], actual[name]
        for field in ['skeletonSha256', 'declarationOrder']:
            if e[field] != a[field]:
                out.append(f'{name}: {field} differs')
        for decl in NAMES:
            em = [tuple(x) for x in e['media'].get(decl, [])]
            am = [tuple(x) for x in a['media'].get(decl, [])]
            if em == am:
                continue
            if [x[0] for x in em] != [x[0] for x in am]:
                out.append(f'{name}: {decl} keys differ ({len(em)} baseline vs {len(am)} built)')
            else:
                changed = [x[0] or '<string>' for x, y in zip(em, am) if x != y]
                out.append(f'{name}: {decl} mime or bytes differ for ' + ', '.join(changed))
    return out


def check(fixture=FIXTURE, week_paths=None):
    data = load(fixture)
    config = load_config()
    built = {week_name(n): (week_paths or {}).get(week_name(n), ROOT / week_name(n)) for n in config['weeks']}
    actual = {name: analyze(path) for name, path in built.items() if name in data['weeks']}
    skipped = sorted(set(built) - set(data['weeks']))
    diffs = differences(data['weeks'], actual)
    if diffs:
        raise SystemExit('BASELINE MISMATCH; if the change is intended, retake with '
                         '`python tools/project.py baseline --create --force` in its own commit:\n  ' + '\n  '.join(diffs))
    print(f'BASELINE OK: {len(actual)} weeks match {fixture.name} (form {FORM})'
          + (f'; not covered: {", ".join(skipped)}' if skipped else ''), flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument('--create', action='store_true', help='Build, then write the baseline fixture (refuses to overwrite)')
    group.add_argument('--check', action='store_true', help='Compare the current build with the baseline fixture')
    ap.add_argument('--force', action='store_true', help='With --create: overwrite an existing fixture deliberately')
    ap.add_argument('--fixture', type=Path, default=FIXTURE)
    args = ap.parse_args()
    if args.create:
        create(force=args.force, fixture=args.fixture)
    else:
        check(fixture=args.fixture)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
