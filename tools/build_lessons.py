"""Build standalone lessons from shared code and weekly data into the products directory. No third-party dependency.

Products (`course.html`, `index.html`, every `weekNN.html`) are written to `build/` by default, or to
`--output-dir`. They are generated files and are not tracked by git; `python tools/project.py check` rebuilds
them into a temporary directory and compares byte for byte (reproducible build).

The products directory is replaced as a whole (plan v1.3 §3.4): every product is first written to a staging
directory next to the target, then the old directory is renamed away, the staging directory is renamed into place
and the old one is deleted. A failure before the swap leaves the old directory untouched; a failed swap is rolled
back. Stale files from earlier builds therefore never survive a build. `--week` builds one week (plus the course
and index) and must be given an explicit `--output-dir`, so `build/` is always a complete set.
"""
import argparse
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
from project_config import ROOT, BUILD, INDEX_HTML, load_config, week_name
from build_course import render_course

SRC = ROOT / 'frontend' / 'src'
INCLUDE = re.compile(r'<!-- @include ([a-zA-Z0-9_./-]+) -->')


def expand(text, ancestors=()):
    def include(match):
        path = (SRC / match[1]).resolve()
        if not path.is_relative_to(SRC.resolve()) or path in ancestors:
            raise ValueError(f'Invalid or recursive include: {match[1]}')
        content = expand(path.read_text(encoding='utf-8'), (*ancestors, path))
        return f'/* SOURCE: {match[1]} */\n{content}\n/* END SOURCE: {match[1]} */'
    return INCLUDE.sub(include, text)


def validate_script(html):
    subprocess.run(['node','-e',"const fs=require('fs'),vm=require('vm');for(const m of fs.readFileSync(0,'utf8').matchAll(/<script([^>]*)>([\\s\\S]*?)<\\/script>/g)){if(m[1].includes('application/json'))JSON.parse(m[2]);else new vm.Script(m[2]);}"],input=html,text=True,encoding='utf-8',check=True)


def product_names(config):
    """Every file the build writes, in a stable order."""
    return [config['entry'], 'index.html', *[week_name(n) for n in config['weeks']]]


def render(config, week=None):
    """Render and validate every lesson and the course; return [(name, text)] without writing anything."""
    templates = [SRC / f'weeks/week{n:02}.template.html' for n in config['weeks']]
    if set(templates) != set((SRC / 'weeks').glob('week*.template.html')):
        raise SystemExit('Template inventory differs from project.json')
    outputs = []
    lessons = {}
    with tempfile.TemporaryDirectory(prefix='soundblocks-build-') as temp:
        for template in templates:
            name = template.name.replace('.template', '')
            rendered = expand(template.read_text(encoding='utf-8'))
            staged = Path(temp) / name
            staged.write_text(rendered, encoding='utf-8', newline='\n')
            subprocess.run(['node', str(ROOT / 'tools/validation/check_data.js'), str(staged)], check=True)
            validate_script(rendered)
            lessons[name] = rendered
            if week is None or name == week_name(week):
                outputs.append((name, rendered))
        combined = render_course(lessons)
        validate_script(combined)
        outputs.append((config['entry'], combined))
        outputs.append(('index.html', INDEX_HTML))
    return outputs


def replace_directory(target, staging):
    """Atomically swap `staging` into `target`; roll back if the swap fails."""
    target = Path(target)
    old = target.parent / f'.{target.name}.old-{secrets.token_hex(4)}'
    if target.exists():
        try:
            target.rename(old)
        except OSError as error:
            raise SystemExit(f'cannot replace {target}: {error}; close programs that hold its files and retry')
    try:
        staging.rename(target)
    except OSError as error:
        if old.exists():
            try:
                old.rename(target)
            except OSError as rollback_error:
                raise SystemExit(f'cannot move the new build into {target}: {error}; restoring the previous build ALSO failed '
                                 f'({rollback_error}); it is still at {old}, move it back by hand')
            raise SystemExit(f'cannot move the new build into {target}: {error}; the previous build was restored')
        raise SystemExit(f'cannot move the new build into {target}: {error}')
    if old.exists():
        shutil.rmtree(old, ignore_errors=True)
        if old.exists():
            print(f'WARNING: the previous build directory {old} could not be deleted; delete it by hand', flush=True)


def build(output_dir=None, week=None):
    """Render every lesson and the course, then replace the products directory as a whole."""
    config = load_config()
    if week is not None and week not in config['weeks']:
        raise SystemExit('Unknown week')
    if week is not None and output_dir is None:
        raise SystemExit('--week only builds part of the product set; give an explicit --output-dir so build/ stays complete')
    output_dir = Path(output_dir) if output_dir is not None else BUILD
    outputs = render(config, week=week)
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = output_dir.parent / f'.{output_dir.name}.tmp-{secrets.token_hex(4)}'
    staging.mkdir()
    try:
        for name, rendered in outputs:
            (staging / name).write_text(rendered, encoding='utf-8', newline='\n')
        replace_directory(output_dir, staging)
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
    for name, _ in outputs:
        path = output_dir / name
        print('BUILT ' + str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path), flush=True)
    return output_dir


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--week', type=int, help='Build one week (plus course and index); requires --output-dir')
    ap.add_argument('--output-dir', type=Path, help=f'Write products here instead of {BUILD.relative_to(ROOT)}/; the directory is owned by the build and replaced as a whole, anything else in it is discarded')
    args = ap.parse_args()
    build(output_dir=args.output_dir, week=args.week)


if __name__ == '__main__':
    main()
