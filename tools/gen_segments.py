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

退出码（2026-09-09 外审 H1/H2 修复；2026-09-10 内部预筛复测再修 H2）：0=全部处理完毕
（没有 tie/unknown/error，磁盘上最终也没有残留未复核标记）；1=存在需要人工处理的词
（并列 tie / 无法识别 unknown / 分析出错 error），这些词不会被写回；2=用法错误；3=存在按
"字位数最少"启发式选出、但尚未落盘的 resolved 候选（dry-run 或默认 --write，即未加
--write-heuristic 时命中）；4=本次运行结束后磁盘上的最终文件内容里仍残留
@gen-segments-unreviewed 标记（不论这个标记是本次写入的，还是更早一次 --write-heuristic
遗留、这次根本没碰到那些词——一旦词已经有 segments，就不会再进入 resolveWord/
writeSuggestions 的处理路径），未经人工复核（check_data.js 会拦截带此标记的数据）。
1/2/3/4 都算失败退出（非 0），调用方按"非 0 即不可放行"处理即可；细分只是给人读日志时
定位问题严重程度用。3 与 4 的区别：3="候选还没被写进文件"（该考虑要不要加
--write-heuristic 重跑），4="磁盘上还带着未复核标记，等着人复核"（该去打开文件删标记做
复核）——H1 修复的是"只含 resolved 的文件在任何模式下都得到退出码 0"；H2 修复的是
"--write-heuristic 写回未复核标记后，仍会得到退出码 0，与 check_data.js 会拦截同一份
数据这件事矛盾"；2026-09-10 复测发现 H2 的实作只覆盖了"本次运行写入"这一种情形，重跑
（标记已经在磁盘上、这次根本没碰到那些词）恒返回 0，改为直接扫描本次运行后磁盘上的
最终文件内容判定退出码 4，三种模式（dry-run/--write/--write-heuristic）统一走这条判据。

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
                          '必须逐条人工复核；传本参数会隐含启用写回（不需要再单独加 --write）。'
                          '本次运行若确有候选被这样写回，退出码是 4（不是 0）——0 只留给"没有任何未复核'
                          '标记残留"的状态，见上方退出码说明。')
    args = ap.parse_args()
    result = run(args.target, args.write, write_heuristic=args.write_heuristic)
    sys.exit(result.returncode)


if __name__ == '__main__':
    main()
