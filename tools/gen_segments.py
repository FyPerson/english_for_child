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
  python tools/gen_segments.py --target frontend/src/weeks/week05.data.js                    # dry-run，打印建议
  python tools/gen_segments.py --target frontend/src/weeks/week05.data.js --write            # 写回唯一解（无歧义）的词
  python tools/gen_segments.py --target frontend/src/weeks/week05.data.js --write-heuristic   # 额外写回启发式候选（多解词，务必先读警告）

退出码：0=全部处理完毕；1=存在需要人工处理的词（并列 tie / 无法识别 unknown / 分析出错
error），这些词不会被写回；2=用法错误；3=存在按"字位数最少"启发式选出、但尚未落盘/未经
复核确认的 resolved 候选（未加 --write-heuristic，dry-run 与默认 --write 都可能命中）。
1/2/3 都算失败退出（非 0），调用方按"非 0 即不可放行"处理即可；细分只是给人读日志时
定位问题严重程度用（2026-09-09 外审 H1 修复：改前一份只含 resolved 的文件在任何模式下
都会得到退出码 0，掩盖了"仍有候选未经人工复核"这件事）。

M5（2026-09-09 里程碑 2 收口批）：`--write` 默认只写"唯一解"（不需要启发式、没有歧义）的
词；多解词（按"字位数最少"这条编辑启发式选出候选的那些）一律不自动写回，只在报告里列出
全部解析供人选择——这不是限制过严，是安全性修复：bat fixture 已经证明这条启发式会给出
错误答案（b+at，而目标读法其实是 b+a+t），放任它自动写进数据文件，等于让"错误建议"先
进源码、再靠人逐条去发现并推翻。要写多解词的候选，必须显式加 --write-heuristic（见下方
帮助文本），写回的每一处仍带 @gen-segments-unreviewed 标记，交付前必须人工复核删除。
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(target, write, write_heuristic=False, capture_output=False):
    """调用 tools/validation/gen_segments.js 做实际的加载/分词/生成建议。

    `capture_output`：True 时把子进程 stdout/stderr 捕获成文本返回（供本文件的单测
    断言报告内容），False（默认，CLI 用）时让子进程直接继承本进程的 stdout/stderr，
    保持人在终端里跑的体验（--write 的进度提示、报告都是流式打印的）。
    `write_heuristic`：True 时额外传 --write-heuristic 给子进程（见下方 CLI 参数说明）。
    """
    target_path = Path(target)
    if not target_path.is_absolute():
        target_path = (ROOT / target).resolve()
    cmd = ['node', str(ROOT / 'tools' / 'validation' / 'gen_segments.js'), str(target_path)]
    if write:
        cmd.append('--write')
    if write_heuristic:
        cmd.append('--write-heuristic')
    if capture_output:
        return subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, encoding='utf-8')
    return subprocess.run(cmd, cwd=str(ROOT))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--target', required=True, help='周数据文件路径，如 frontend/src/weeks/week05.data.js')
    ap.add_argument('--write', action='store_true',
                     help='写回"唯一解"（无歧义、不需要启发式）的词的 segments；默认只打印（dry-run）。'
                          '多解词（启发式候选）不会被这个开关写回，见 --write-heuristic。')
    ap.add_argument('--write-heuristic', action='store_true',
                     help='在 --write 的基础上，额外写回"字位数最少"这条编辑启发式选出的候选（多解词）。'
                          '⚠️ 基于未经验证的启发式，bat fixture 已证明它会给错（会把 b+a+t 误判成 b+at）——'
                          '写回的每一处仍带 @gen-segments-unreviewed 标记并被 check_data.js 拦下，交付前'
                          '必须逐条人工复核；传本参数会隐含启用写回（不需要再单独加 --write）。')
    args = ap.parse_args()
    result = run(args.target, args.write, write_heuristic=args.write_heuristic)
    sys.exit(result.returncode)


if __name__ == '__main__':
    main()
