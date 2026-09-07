"""Build standalone lessons from shared code and weekly data into the products directory. No third-party dependency.

Products (`course.html`, `index.html`, every `weekNN.html`) are written to `build/` by default, or to
`--output-dir`. They are generated files and are not tracked by git; `python tools/project.py check` rebuilds
them into a temporary directory and compares byte for byte (reproducible build).
"""
import argparse
from pathlib import Path
import re
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


def build(output_dir=None, week=None):
    """Render every lesson and the course; validate everything before writing any product."""
    config = load_config()
    output_dir = Path(output_dir) if output_dir is not None else BUILD
    if week is not None and week not in config['weeks']:
        raise SystemExit('Unknown week')
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
    output_dir.mkdir(parents=True, exist_ok=True)
    for name, rendered in outputs:
        path = output_dir / name
        temporary = path.with_suffix('.html.tmp')
        temporary.write_text(rendered, encoding='utf-8', newline='\n')
        temporary.replace(path)
        print('BUILT ' + str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path), flush=True)
    return output_dir


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--week', type=int, help='Build one week (plus the course); default builds all')
    ap.add_argument('--output-dir', type=Path, help=f'Write products here instead of {BUILD.relative_to(ROOT)}/')
    args = ap.parse_args()
    build(output_dir=args.output_dir, week=args.week)


if __name__ == '__main__':
    main()
