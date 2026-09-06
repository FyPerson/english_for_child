"""Single check entry. Missing dependencies and skipped suites are never reported as passes."""
import argparse
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--quick',action='store_true',help='Build/data/syntax/unit checks only; browser suites explicitly skipped')
    args=ap.parse_args()
    if not shutil.which('node'): raise SystemExit('MISSING: Node.js')
    jobs=[('generated lessons',[sys.executable,'tools/build_lessons.py','--check']),
          ('directory layout',[sys.executable,'tests/unit/test_layout.py']),
          ('build boundaries',[sys.executable,'tests/unit/test_build.py']),
          ('assessment contract',['node','tests/unit/test_assessment_contract.js']),
          ('media coverage',['node','tests/unit/test_media.js'])]
    if not args.quick:
        try: import playwright.sync_api
        except ImportError: raise SystemExit('MISSING: pip install -r requirements-dev.txt; python -m playwright install chromium')
        jobs += [(name,[sys.executable,'tests/browser/'+name+'.py']) for name in
                 ['test_progress','test_games','test_initialpick','test_assessment_browser','test_mobile','test_course','smoke_parent_panel','smoke_w2_browser','smoke_w3_browser']]
    failures=[]
    for name,cmd in jobs:
        print('\nRUN '+name,flush=True)
        result=subprocess.run(cmd,cwd=ROOT)
        print(('PASS ' if result.returncode==0 else 'FAIL ')+name,flush=True)
        if result.returncode: failures.append(name)
    if args.quick: print('SKIPPED: browser suites (--quick)')
    if failures: raise SystemExit('FAILED: '+', '.join(failures))
    print('All selected checks passed.')


if __name__=='__main__': main()
