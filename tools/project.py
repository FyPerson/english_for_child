"""Stable developer entry: build, check, release, serve, doctor, baseline.

release = check (which builds build/ itself) then package build/ into dist/<version>/; nothing is built a third time.
serve   = build then package, without the regression run, for a quick local preview.
"""
import argparse
import hashlib
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import secrets
import shutil
import subprocess
import sys
from datetime import datetime
from project_config import ROOT, BUILD, load_config, week_name
from verify_manifest import verify

def run(script,*args):
    subprocess.run([sys.executable,str(ROOT/'tools'/script),*args],cwd=ROOT,check=True)

NODE_MIN_MAJOR=18
NODE_VERSION=re.compile(r'v(\d+)\.\d+\.\d+')

def node_version_check(run=subprocess.run,minimum=NODE_MIN_MAJOR):
    """Run `node --version`; return the version string or raise SystemExit naming the actual output (plan v1.3 §4 step 4)."""
    try:
        result=run(['node','--version'],capture_output=True,text=True,encoding='utf-8',timeout=30)
    except (FileNotFoundError,OSError) as error:
        raise SystemExit('Node.js not found on PATH ('+str(error)+'); install Node.js >= '+str(minimum))
    except (subprocess.SubprocessError,UnicodeError) as error:
        raise SystemExit('node --version could not be run: '+type(error).__name__+': '+str(error))
    stdout=(result.stdout or '').strip();stderr=(result.stderr or '').strip()
    shown=' / '.join(part for part in ['stdout: '+repr(stdout) if stdout else '','stderr: '+repr(stderr) if stderr else ''] if part) or 'no output'
    if result.returncode:
        raise SystemExit('node --version failed with exit code '+str(result.returncode)+' ('+shown+')')
    match=NODE_VERSION.fullmatch(stdout)
    if not match:
        raise SystemExit('node --version printed an unexpected value ('+shown+')')
    if int(match.group(1))<minimum:
        raise SystemExit('Node.js '+stdout+' is too old; need major version >= '+str(minimum))
    return stdout

def release_files(config):
    return [config['entry'],'index.html',*[week_name(n) for n in config['weeks']]]

def build_contents(config):
    """Read build/ strictly: the file set must equal the allowlist, nothing more and nothing less."""
    files=release_files(config)
    if not BUILD.is_dir(): raise SystemExit('MISSING build/; run python tools/project.py build')
    present={p.relative_to(BUILD).as_posix() for p in BUILD.rglob('*') if p.is_file()}
    missing=[name for name in files if name not in present]
    extra=sorted(present-set(files))
    if missing: raise SystemExit('MISSING products in build/: '+', '.join(missing)+'; run python tools/project.py build')
    if extra: raise SystemExit('build/ contains files outside the release allowlist: '+', '.join(extra)+'; rebuild with python tools/project.py build')
    return {name:(BUILD/name).read_bytes() for name in files}

def package():
    config=load_config()
    contents=build_contents(config)
    hashes={name:hashlib.sha256(data).hexdigest() for name,data in contents.items()}
    release_id=hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()[:16]
    dist=ROOT/'dist'
    dist.mkdir(parents=True,exist_ok=True)
    for candidate in sorted(dist.glob('soundblocks-*')):
        if not candidate.is_dir():continue
        try:previous=json.loads((candidate/'manifest.json').read_text(encoding='utf-8'))
        except (OSError,ValueError):continue
        if previous.get('release')==release_id:
            # Same allowlist rule as build_contents(), applied recursively to the existing version directory.
            present={p.relative_to(candidate).as_posix() for p in candidate.rglob('*') if p.is_file()}
            unexpected=sorted(present-set(contents)-{'manifest.json'})
            if unexpected: raise ValueError(f'Unexpected files in release directory: {unexpected}')
            verify(candidate)
            target=candidate
            break
    else:
        # Human-readable directory name; content identity remains in the manifest. Write to a staging directory first,
        # verify it, then rename it into place so a failure never leaves a half-written version in dist/.
        stem='soundblocks-'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        target=dist/stem
        suffix=2
        while target.exists():
            target=dist/f'{stem}-{suffix:02}'
            suffix+=1
        staging=dist/('.staging-'+secrets.token_hex(4))
        staging.mkdir()
        try:
            for name,data in contents.items():(staging/name).write_bytes(data)
            (staging/'manifest.json').write_text(json.dumps({'schemaVersion':1,'release':release_id,'files':hashes},ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
            verify(staging)   # the same check the CI release job runs before publishing
            staging.rename(target)
        finally:
            if staging.exists(): shutil.rmtree(staging,ignore_errors=True)
    latest=dist/'最新版本.txt.tmp'
    latest.write_text(f'最近打包版本：{target.name}\n\n打开课件：{target.name}/index.html\n发布网站：上传此版本目录内的文件。\n',encoding='utf-8',newline='\n')
    latest.replace(dist/'最新版本.txt')
    print('RELEASE '+str(target),flush=True)
    return target

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    commands=ap.add_subparsers(dest='command',required=True)
    commands.add_parser('build')
    check=commands.add_parser('check');check.add_argument('--quick',action='store_true');check.add_argument('--skip-baseline',action='store_true',help="Skip only the 'single-file baseline' job; every other job still runs and still fails the run")
    commands.add_parser('release',help='Run the full regression (which builds build/), then package it into dist/<version>/')
    serve=commands.add_parser('serve',help='Build, package and preview locally without the regression run');serve.add_argument('--port',type=int,default=8000)
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
    elif args.command=='check':run('run_checks.py',*(['--quick'] if args.quick else []),*(['--skip-baseline'] if args.skip_baseline else []))
    elif args.command=='release':
        run('run_checks.py')   # step ① of check writes build/; nothing is built again here
        package()
    else:
        run('build_lessons.py')
        target=package()
        handler=partial(SimpleHTTPRequestHandler,directory=str(target))
        with ThreadingHTTPServer(('127.0.0.1',args.port),handler) as server:
            print(f'Preview http://127.0.0.1:{server.server_port}/ (Ctrl+C to stop)',flush=True)
            try:server.serve_forever()
            except KeyboardInterrupt:pass

if __name__=='__main__':
    try:main()
    except subprocess.CalledProcessError as error:raise SystemExit(error.returncode)
