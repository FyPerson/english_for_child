"""Stable developer entry: build, check, release, serve, doctor, baseline."""
import argparse
import hashlib
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import shutil
import subprocess
import sys
from datetime import datetime
from project_config import ROOT, BUILD, load_config, week_name
from verify_manifest import verify

def run(script,*args):
    subprocess.run([sys.executable,str(ROOT/'tools'/script),*args],cwd=ROOT,check=True)

NODE_MIN_MAJOR=18

def node_version_check(run=subprocess.run,minimum=NODE_MIN_MAJOR):
    """Run `node --version`; return the version string or raise SystemExit naming the actual output (plan v1.3 §4 step 4)."""
    try:
        result=run(['node','--version'],capture_output=True,text=True,encoding='utf-8')
    except (FileNotFoundError,OSError) as error:
        raise SystemExit('Node.js not found on PATH ('+str(error)+'); install Node.js >= '+str(minimum))
    output=(result.stdout or '').strip()
    if result.returncode:
        raise SystemExit('node --version failed with exit code '+str(result.returncode)+': '+(output or (result.stderr or '').strip()))
    match=re.match(r'^v(\d+)\.',output)
    if not match:
        raise SystemExit('node --version printed an unexpected value: '+repr(output))
    if int(match.group(1))<minimum:
        raise SystemExit('Node.js '+output+' is too old; need major version >= '+str(minimum))
    return output

def release_files(config):
    return [config['entry'],'index.html',*[week_name(n) for n in config['weeks']]]

def package():
    config=load_config()
    files=release_files(config)
    # Human-readable directories; content identity remains in the manifest. Products come from build/ only.
    missing=[name for name in files if not (BUILD/name).is_file()]
    if missing: raise SystemExit('MISSING products in build/: '+', '.join(missing)+'; run python tools/project.py build')
    contents={name:(BUILD/name).read_bytes() for name in files}
    hashes={name:hashlib.sha256(data).hexdigest() for name,data in contents.items()}
    release_id=hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()[:16]
    dist=ROOT/'dist'
    dist.mkdir(parents=True,exist_ok=True)
    target=None
    for candidate in sorted(dist.glob('soundblocks-*')):
        if not candidate.is_dir():continue
        try:previous=json.loads((candidate/'manifest.json').read_text(encoding='utf-8'))
        except (OSError,ValueError):continue
        if previous.get('release')==release_id:
            target=candidate
            break
    if target is None:
        stem='soundblocks-'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        target=dist/stem
        suffix=2
        while target.exists():
            target=dist/f'{stem}-{suffix:02}'
            suffix+=1
    target.mkdir(parents=True,exist_ok=True)
    unexpected={p.name for p in target.iterdir()}-set(contents)-{'manifest.json'}
    if unexpected: raise ValueError(f'Unexpected files in release directory: {sorted(unexpected)}')
    for name,data in contents.items():
        temp=target/(name+'.tmp');temp.write_bytes(data);temp.replace(target/name)
    (target/'manifest.json').write_text(json.dumps({'schemaVersion':1,'release':release_id,'files':hashes},ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    verify(target)   # the same check the CI release job runs before publishing
    latest=dist/'最新版本.txt.tmp'
    latest.write_text(f'最近打包版本：{target.name}\n\n打开课件：{target.name}/index.html\n发布网站：上传此版本目录内的文件。\n',encoding='utf-8',newline='\n')
    latest.replace(dist/'最新版本.txt')
    print('RELEASE '+str(target),flush=True)
    return target

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    commands=ap.add_subparsers(dest='command',required=True)
    commands.add_parser('build')
    check=commands.add_parser('check');check.add_argument('--quick',action='store_true')
    commands.add_parser('release',help='Build, run full regression, then produce a publication-only directory')
    serve=commands.add_parser('serve',help='Build and preview publication-only files locally');serve.add_argument('--port',type=int,default=8000)
    commands.add_parser('doctor')
    base=commands.add_parser('baseline',help='Take (once) or compare the single-file baseline of the delivered weeks')
    group=base.add_mutually_exclusive_group(required=True)
    group.add_argument('--create',action='store_true');group.add_argument('--check',action='store_true')
    base.add_argument('--force',action='store_true',help='With --create: overwrite an existing fixture deliberately')
    args=ap.parse_args()
    if args.command=='baseline' and args.force and not args.create: base.error('--force only applies to --create')
    if args.command=='doctor':
        load_config()
        print('Python: '+sys.version.split()[0]);print('Node: '+str(shutil.which('node')))
        if sys.version_info<(3,10):raise SystemExit('Need Python >=3.10')
        print('Node version: '+node_version_check())
        try:
            import playwright.sync_api
            with playwright.sync_api.sync_playwright() as p:
                browser=p.chromium.launch();browser.close()
        except Exception as e:raise SystemExit('Browser dependency unavailable: '+str(e))
        print('PASS environment, Node.js >= '+str(NODE_MIN_MAJOR)+' and Chromium')
    elif args.command=='baseline':run('baseline.py',*(['--create']+(['--force'] if args.force else []) if args.create else ['--check']))
    elif args.command=='build':run('build_lessons.py')
    elif args.command=='check':run('run_checks.py',*(['--quick'] if args.quick else []))
    else:
        run('build_lessons.py')
        if args.command=='release':run('run_checks.py')
        target=package()
        if args.command=='serve':
            handler=partial(SimpleHTTPRequestHandler,directory=str(target))
            with ThreadingHTTPServer(('127.0.0.1',args.port),handler) as server:
                print(f'Preview http://127.0.0.1:{server.server_port}/ (Ctrl+C to stop)',flush=True)
                try:server.serve_forever()
                except KeyboardInterrupt:pass

if __name__=='__main__':
    try:main()
    except subprocess.CalledProcessError as error:raise SystemExit(error.returncode)
