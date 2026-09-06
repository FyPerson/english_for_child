"""Build the combined course from supplied source-rendered lessons, never stale outputs."""
import argparse
import base64
import json
import subprocess
from project_config import ROOT, load_config, week_name


def render_course(lessons):
    config=load_config()
    bridge=(ROOT/'frontend/src/shared/course-bridge.js').read_text(encoding='utf-8')
    weeks=[]
    for n in config['courseWeeks']:
        original=lessons[week_name(n)]
        code="const fs=require('fs'),{loadData}=require('./tools/validation/load_data');const d=loadData(fs.readFileSync(0,'utf8'));console.log(JSON.stringify({key:d.META.storageKey,checks:d.DAYS.map((day,di)=>day.steps.flatMap((s,si)=>s.blocks.filter(b=>b.b==='checks').flatMap(b=>b.items.map((_,i)=>`${di+1}-${si}-${i}`))))}));"
        data=json.loads(subprocess.check_output(['node','-e',code],input=original,cwd=ROOT,text=True,encoding='utf-8'))
        injection='<script>\n'+bridge+'\n</script>'
        html=original.replace('</body>',injection+'</body>') if '</body>' in original else original+'\n'+injection
        data['html']=base64.b64encode(html.encode()).decode()
        weeks.append(data)
    nav=''.join(f'<button data-week="{n}" aria-pressed="false" disabled><strong>第 {n} 周</strong><small></small></button>' for n in config['courseWeeks'])
    title=f'第 1—{len(weeks)} 周学习之旅'
    return (ROOT/'frontend/src/course.template.html').read_text(encoding='utf-8').replace('__COURSE_PAYLOAD__',json.dumps({'weeks':weeks},ensure_ascii=False)).replace('__COURSE_NAV__',nav).replace('__COURSE_TITLE__',title)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    from build_lessons import expand, validate_script
    config=load_config()
    lessons={week_name(n):expand((ROOT/f'frontend/src/weeks/week{n:02}.template.html').read_text(encoding='utf-8')) for n in config['courseWeeks']}
    result=render_course(lessons)
    validate_script(result)
    target=ROOT/config['entry']
    if args.check:
        if not target.exists() or target.read_text(encoding='utf-8')!=result:raise SystemExit('OUT OF DATE: course.html; run python tools/project.py build')
    else:
        temp=target.with_suffix('.html.tmp');temp.write_text(result,encoding='utf-8',newline='\n');temp.replace(target)
    print(('CHECKED ' if args.check else 'BUILT ')+str(target))

if __name__=='__main__':main()
