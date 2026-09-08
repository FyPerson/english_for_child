#!/usr/bin/env python3
"""规范类文档的「声明 vs 实作」交付前自检。

起因：2026-09-08 写《周课件数据层交接规范 v2.0》时，同一份文档里两次把没做的事
写成已做——§4.1 把未实现的校验列成「校验器会查的」（首审 critical 1），§4.2 写
「三条已移进 §4.1」而 §4.1 表里根本没有（复审判未修）。这不是粗心，是「写下声明」
比「执行声明」容易，且写完没有逐句回验。

本脚本把回验机械化：抽出文档里的声明句，逐条要求给出可验证的落点。

用法：
    python tools/check_doc_claims.py docs/某规范.md
    python tools/check_doc_claims.py docs/某规范.md --impl tools/validation/check_data.js

退出码非 0 表示有声明查不到落点，需人工确认后再交付。

已知局限（不要把「通过」当成万能证明）：
- **节内自引用验不了**：若「移进 §4.1」这句话本身就写在 §4.1 里，声明的条目名当然能在该节找到。
  真正要防的是跨节声明（§4.2 说「已移进 §4.1」而 §4.1 里没有），那种能正常检出。
- 「已实现」状态只在规则描述里带反引号标识符时才去实现文件里找线索，纯中文描述的规则查不了。
- 它只验证「声明有没有落点」，不验证落点对不对。人工复核仍然必要。
"""
import argparse
import re
import sys
from pathlib import Path

# 「我做了 X」型句子：这类句子必须能在同一文档或实现文件里找到对应物
CLAIM_PATTERNS = [
    (r'移[进入]了?\s*[§#]?([\d.]+)', '声称把内容移到某节'),
    (r'已(?:经)?(?:实现|落地|补齐|改为|改成|拆成|新增)', '声称已完成某改动'),
    (r'见\s*[§#]([\d.]+)', '指向本文某节'),
    (r'范例见\s*`([^`]+)`', '指向某个范例文件'),
    (r'详见\s*`([^`]+)`', '指向某个文件'),
]

# 状态表里标「已实现」的行，必须在实现文件里找到线索
IMPL_CLAIM = re.compile(r'^\|\s*\d+\s*\|\s*`([A-Z][A-Z0-9-]+)`\s*\|(.+?)\|\s*已实现')


def sections(text):
    """收集文档里所有出现过的章节号，用于验证 §x.y 引用。"""
    found = set()
    for m in re.finditer(r'^#{2,4}\s*([\d.]+)', text, re.M):
        num = m.group(1).rstrip('.')
        found.add(num)
        # 「## 4. 硬约束」同时提供 4；「### 4.1」提供 4.1
        if '.' in num:
            found.add(num.split('.')[0])
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('doc', type=Path)
    ap.add_argument('--impl', type=Path, action='append', default=[],
                    help='实现文件；标「已实现」的规则 ID 会在这些文件里找线索')
    ap.add_argument('--repo', type=Path, default=Path('.'))
    args = ap.parse_args()

    text = args.doc.read_text(encoding='utf-8')
    lines = text.splitlines()
    secs = sections(text)
    impl_text = '\n'.join(p.read_text(encoding='utf-8') for p in args.impl if p.exists())

    problems = []

    # 1) 章节引用指向不存在的节
    for i, line in enumerate(lines, 1):
        for m in re.finditer(r'[§](\d+(?:\.\d+)?)', line):
            if m.group(1) not in secs:
                # 引用别的文档的章节是合法的：§ 之前提到了别的文档就跳过
                if re.search(r'(规范|方案|文档|分工|交接|design-doc|\.md|课程|本文 §)', line[:m.start()]):
                    continue
                problems.append((i, f'引用 §{m.group(1)}，但本文没有这一节'))

    # 2) 「移进了 §x」型声明：目标节里必须真的能找到被移动的关键词
    for i, line in enumerate(lines, 1):
        # 一行里可能有多处声明（正文一处、复述上一稿又一处），逐个检查，不能只看第一个
        quoted = [(q.start(), q.end()) for q in re.finditer(r'[""][^""]*[""]', line)]
        for m in re.finditer(r'移[进入]了?\s*[§]([\d.]+)[：:]?(.*)', line):
            # 引号里的「移进 §x」多半是在引用/复述别处（例如描述上一稿的错误），不是本稿的声明
            if any(s < m.start() < e for s, e in quoted):
                continue
            target, rest = m.group(1), m.group(2)
            # 抽出声明里用「」括起来的条目名
            items = re.findall(r'[「『]([^」』]+)[」』]', rest)
            if not items:
                problems.append((i, f'声称移进 §{target} 但没说移了什么，无法验证'))
                continue
            body = section_body(text, target)
            for it in items:
                # 取条目名里最长的连续中文/英文片段做检索锚点
                anchor = max(re.findall(r'[一-鿿]{2,}|[A-Za-z_]{3,}', it) or [it], key=len)
                if anchor not in body:
                    problems.append((i, f'声称「{it}」已移进 §{target}，但该节里找不到「{anchor}」'))

    # 3) 状态标「已实现」的规则，实现文件里要有线索
    if impl_text:
        for i, line in enumerate(lines, 1):
            m = IMPL_CLAIM.match(line)
            if not m:
                continue
            rule_id, desc = m.group(1), m.group(2)
            # 从规则描述里取反引号包住的标识符作为检索锚点
            anchors = re.findall(r'`([A-Za-z_][A-Za-z0-9_.]*)`', desc)
            if not anchors:
                continue
            missing = [a for a in anchors if a.split('.')[0] not in impl_text]
            if missing:
                problems.append((i, f'{rule_id} 标「已实现」，但实现文件里找不到 {missing}'))

    # 4) 指向的文件必须存在
    for i, line in enumerate(lines, 1):
        for m in re.finditer(r'`((?:docs|tools|tests|frontend|resources)/[^`]+?\.(?:js|py|md|json|html))`', line):
            path = m.group(1)
            # NN、N、<...>、* 是模板占位符，不是真实路径
            if re.search(r'(weekNN|weekN\b|<[^>]+>|\*)', path):
                continue
            if not (args.repo / path).exists():
                problems.append((i, f'指向的文件不存在：{path}'))

    if problems:
        print(f'{args.doc}：{len(problems)} 处声明查不到落点\n')
        for ln, msg in problems:
            print(f'  行 {ln}: {msg}')
        return 1
    print(f'{args.doc}：声明与落点自检通过')
    return 0


def section_body(text, num):
    """取某节的正文（到下一个同级或更高级标题为止）。"""
    m = re.search(rf'^#{{2,4}}\s*{re.escape(num)}[.．\s]', text, re.M)
    if not m:
        return ''
    level = len(text[m.start():m.start() + 4]) - len(text[m.start():m.start() + 4].lstrip('#'))
    rest = text[m.end():]
    nxt = re.search(rf'^#{{2,{max(level, 2)}}}\s', rest, re.M)
    return rest[:nxt.start()] if nxt else rest


if __name__ == '__main__':
    sys.exit(main())
