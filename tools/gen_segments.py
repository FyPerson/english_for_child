"""为某一周数据文件生成 W[词].segments 建议（里程碑 2 · P3③，方案 §3.4）。

从 W5 起，本周新教的多字母字位若组成字母此前都已单独教过，则当周所有含该字形的词
都必然多解，缺 `segments` 时校验器会失败——这是当周数据生产的义务，不是"将来补"的
窗口。本工具跑一遍分词，对多解词按"字位数最少"选出建议（若并列则报错让人决定），
人只复核 diff，不手写。

真正的加载与分词逻辑在 tools/validation/gen_segments.js（复用 tools/validation/
load_data.js 解析周数据文件，不另写一套解析——与 tools/extract_data_layer.py 调用
tools/validation/export_data.js 是同一种"Python 做薄封装、Node 做实际加载/分词"的
分工，因为周数据文件本身是 JS，且分词依赖 frontend/src/shared/graphemes.js）。

Usage:
  python tools/gen_segments.py --target frontend/src/weeks/week05.data.js              # dry-run，打印建议
  python tools/gen_segments.py --target frontend/src/weeks/week05.data.js --write      # 写回可自动判定（无并列）的建议

退出码：非 0 表示存在需要人工处理的词（并列 / 无法识别 / 分析出错），--write 时这些词
不会被写回。
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(target, write, capture_output=False):
    """调用 tools/validation/gen_segments.js 做实际的加载/分词/生成建议。

    `capture_output`：True 时把子进程 stdout/stderr 捕获成文本返回（供本文件的单测
    断言报告内容），False（默认，CLI 用）时让子进程直接继承本进程的 stdout/stderr，
    保持人在终端里跑的体验（--write 的进度提示、报告都是流式打印的）。
    """
    target_path = Path(target)
    if not target_path.is_absolute():
        target_path = (ROOT / target).resolve()
    cmd = ['node', str(ROOT / 'tools' / 'validation' / 'gen_segments.js'), str(target_path)]
    if write:
        cmd.append('--write')
    if capture_output:
        return subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, encoding='utf-8')
    return subprocess.run(cmd, cwd=str(ROOT))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--target', required=True, help='周数据文件路径，如 frontend/src/weeks/week05.data.js')
    ap.add_argument('--write', action='store_true', help='写回可自动判定（无并列）的建议；默认只打印（dry-run）')
    args = ap.parse_args()
    result = run(args.target, args.write)
    sys.exit(result.returncode)


if __name__ == '__main__':
    main()
