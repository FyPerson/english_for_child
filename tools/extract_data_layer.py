"""Export a lesson data snapshot; author frontend/src/weeks/weekNN.data.js."""
import argparse
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--target',required=True)
    ap.add_argument('--out',required=True)
    args=ap.parse_args()
    target=(ROOT/args.target).resolve()
    out=(ROOT/args.out).resolve()
    out.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['node',str(ROOT/'tools/validation/export_data.js'),str(target),str(out)],check=True)
if __name__=='__main__': main()
