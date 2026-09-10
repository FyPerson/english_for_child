"""Size guardrail for built products (engineering plan v1.3 §3.5, transitional indicators).

`project.json` carries `sizeBudgetMB`: `week` applies to every `weekNN.html`, `course` to `course.html`;
`index.html` is not counted. Budgets are positive integers in decimal megabytes (1 MB = 1 000 000 bytes), so the
byte limit is exact. A product whose byte size is GREATER than its budget fails; equal passes. Relaxing a number is a deliberate decision, never a default action.

Usage: python tools/size_budget.py [--dir <products directory>]   (default build/)
"""
import argparse
from pathlib import Path
from project_config import BUILD, load_config, size_budgets, week_name

MB = 1_000_000


def budgets(config):
    """Return the validated budget map {name: bytes} for every counted product."""
    raw = size_budgets(config)
    limits = {week_name(n): raw['week'] * MB for n in config['weeks']}
    limits[config['entry']] = raw['course'] * MB
    return limits


WARN_MARGIN_FRACTION = 0.15  # T8②：余量低于预算的这个比例时打分级预警，不影响退出码


def check(products_dir=None, config=None):
    """Raise SystemExit when any counted product exceeds its budget; print every measured size.

    T8②（外审 medium，2026-09-10；L1，2026-09-10 修正本段注释与代码的偏差）：
    硬失败判据不变，仍然只有 `size > limit`（严格大于）才 SystemExit——`size ===
    limit`（恰好等于预算）按既有契约通过，不算 OVER。新增分级预警不改这条判据，
    只是把"交付末端才发现触线"提前到每次 check 都能看见：每个产物额外打印余量
    （MB）；`size > limit` 时走硬失败分支（打印 verdict=OVER 并计入 failures，
    不重复打 WARN——OVER 本身已经是更明确的信号）；`size <= limit` 且余量低于
    预算的 15%（即 size > 0.85×limit）时，在 ok 那一行之外再打一行
    `SIZE WARN <name>: 余量 X.XX MB (Y%)`——**`size === limit`（余量恰好为零）
    这个边界会落进这一支**：verdict 仍是 ok（因为不满足 `size > limit`），但
    margin_bytes===0 必然小于 `WARN_MARGIN_FRACTION * limit`（除非 limit 本身是
    0），所以恰好等于预算的产物是"ok + 打 WARN"，不是"OVER"——上一版注释曾把这
    个边界错写成"size >= limit 走 OVER"，与代码的 `>` 判据不一致，这里改正。
    """
    config = config or load_config()
    directory = Path(products_dir) if products_dir is not None else BUILD
    limits = budgets(config)
    failures = []
    for name, limit in limits.items():
        path = directory / name
        if not path.is_file():
            raise SystemExit(f'MISSING product {path}; run python tools/project.py build')
        size = path.stat().st_size
        margin_bytes = limit - size
        margin_pct = (margin_bytes / limit * 100) if limit else 0.0
        verdict = 'OVER' if size > limit else 'ok'
        print(f'SIZE {name}: {size / MB:.2f} MB of {limit / MB:g} MB budget ({verdict}), margin {margin_bytes / MB:.2f} MB ({margin_pct:.1f}%)', flush=True)
        if size > limit:
            failures.append(f'{name} is {size:,} bytes, budget {int(limit):,}')
        elif margin_bytes < WARN_MARGIN_FRACTION * limit:
            print(f'SIZE WARN {name}: 余量 {margin_bytes / MB:.2f} MB ({margin_pct:.1f}%)', flush=True)
    if failures:
        raise SystemExit('SIZE BUDGET EXCEEDED (relaxing project.json sizeBudgetMB is a deliberate decision):\n  ' + '\n  '.join(failures))
    print(f'SIZE BUDGET OK: {len(limits)} products within budget', flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dir', type=Path, help='Products directory (default build/)')
    args = ap.parse_args()
    check(products_dir=args.dir)


if __name__ == '__main__':
    main()
