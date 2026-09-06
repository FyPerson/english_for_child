"""Build standalone lessons from shared code and weekly data. No third-party dependency."""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile
from project_config import load_config, week_name
from build_course import render_course

ROOT = Path(__file__).resolve().parents[1]
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

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check', action='store_true', help='Check generated files are current; do not write')
    ap.add_argument('--week', type=int, help='Build one week; default builds all')
    args = ap.parse_args()
    config=load_config()
    if args.week is not None and args.week not in config['weeks']: raise SystemExit('Unknown week')
    templates=[SRC/f'weeks/week{n:02}.template.html' for n in config['weeks']]
    if set(templates)!=set((SRC/'weeks').glob('week*.template.html')): raise SystemExit('Template inventory differs from project.json')
    outputs = []
    lessons={}
    with tempfile.TemporaryDirectory(prefix='soundblocks-build-') as temp:
        for template in templates:
            name = template.name.replace('.template', '')
            rendered = expand(template.read_text(encoding='utf-8'))
            staged = Path(temp)/name
            staged.write_text(rendered, encoding='utf-8', newline='\n')
            subprocess.run(['node', str(ROOT/'tools/validation/check_data.js'), str(staged)], check=True)
            validate_script(rendered)
            lessons[name]=rendered
            if args.week is None or name==week_name(args.week): outputs.append((ROOT/name, rendered))
        combined=render_course(lessons)
        validate_script(combined)
        outputs.append((ROOT/config['entry'],combined))
        # Validate every target before writing any distributable.
        for path, rendered in outputs:
            if args.check:
                if not path.exists() or path.read_text(encoding='utf-8') != rendered:
                    raise SystemExit(f'OUT OF DATE: {path.name}; run python tools/build_lessons.py')
            else:
                temporary = path.with_suffix('.html.tmp')
                temporary.write_text(rendered, encoding='utf-8', newline='\n')
                temporary.replace(path)
            print(('CHECKED ' if args.check else 'BUILT ') + path.name)


if __name__ == '__main__':
    main()
