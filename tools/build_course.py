"""Build the combined course from supplied source-rendered lessons, never stale outputs."""
import argparse
import json
import subprocess
from project_config import ROOT, BUILD, load_config, week_name


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
        # T8①（外审 medium，2026-09-10）：改前每周整份 HTML 先 base64 编码再塞进
        # JSON payload，消费端 atob 解码再 srcdoc——base64 编码本身让体积恒为原始
        # 字节数的 4/3，这一份体积膨胀对已经内嵌大量音频/图片 base64 的周课件是
        # 纯浪费（音频/图片数据在周 HTML 内部已经是 base64 了，这里又在外面整体
        # 包一层 base64，等于套了两层编码开销）。改为直接把 HTML 原始字符串放进
        # JSON（json.dumps 本身就会正确转义引号/反斜杠/换行），消费端去掉 atob
        # 直接用 course.weeks[i].html 作为 srcdoc。
        data['html']=html
        weeks.append(data)
    nav=''.join(f'<button data-week="{n}" aria-pressed="false" disabled><strong>第 {n} 周</strong><small></small></button>' for n in config['courseWeeks'])
    title=f'第 1—{len(weeks)} 周学习之旅'
    # payload 内嵌进 `<script type="application/json">...</script>`——JSON.dumps
    # 不会转义 `</`，而周 HTML 内部本来就含大量真实的 `</script>` 标签（各周自己的
    # <script> 块），若原样嵌入，浏览器 HTML 解析器会把第一个 `</script>` 当成
    # 外层 payload script 标签的收尾，提前截断整个 JSON、后面的内容全部逃逸成
    # 页面正文——这里必须把 payload 文本里的 `</` 转义成 `<\/`（JSON 字符串里
    # 反斜杠加正斜杠仍解码为字面的 `/`，语义不变，但浏览器 HTML 解析器不会再把它
    # 认成标签收尾）。
    payload=json.dumps({'weeks':weeks},ensure_ascii=False).replace('</','<\\/')
    return (ROOT/'frontend/src/course.template.html').read_text(encoding='utf-8').replace('__COURSE_PAYLOAD__',payload).replace('__COURSE_NAV__',nav).replace('__COURSE_TITLE__',title)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    from build_lessons import expand, validate_script
    config=load_config()
    lessons={week_name(n):expand((ROOT/f'frontend/src/weeks/week{n:02}.template.html').read_text(encoding='utf-8')) for n in config['courseWeeks']}
    result=render_course(lessons)
    validate_script(result)
    BUILD.mkdir(parents=True,exist_ok=True)
    target=BUILD/config['entry']
    if args.check:
        if not target.exists() or target.read_text(encoding='utf-8')!=result:raise SystemExit('OUT OF DATE: build/course.html; run python tools/project.py build')
    else:
        temp=target.with_suffix('.html.tmp');temp.write_text(result,encoding='utf-8',newline='\n');temp.replace(target)
    print(('CHECKED ' if args.check else 'BUILT ')+str(target))

if __name__=='__main__':main()
