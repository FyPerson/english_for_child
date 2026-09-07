"""Size guardrail for built products (engineering plan v1.3 §3.5, transitional indicators).

`project.json` carries `sizeBudgetMB`: `week` applies to every `weekNN.html`, `course` to `course.html`;
`index.html` is not counted. Units are decimal megabytes (1 MB = 1 000 000 bytes). A product whose byte size is
GREATER than its budget fails; equal passes. Relaxing a number is a deliberate decision, never a default action.

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


def check(products_dir=None, config=None):
    """Raise SystemExit when any counted product exceeds its budget; print every measured size."""
    config = config or load_config()
    directory = Path(products_dir) if products_dir is not None else BUILD
    limits = budgets(config)
    failures = []
    for name, limit in limits.items():
        path = directory / name
        if not path.is_file():
            raise SystemExit(f'MISSING product {path}; run python tools/project.py build')
        size = path.stat().st_size
        verdict = 'OVER' if size > limit else 'ok'
        print(f'SIZE {name}: {size / MB:.2f} MB of {limit / MB:g} MB budget ({verdict})', flush=True)
        if size > limit:
            failures.append(f'{name} is {size:,} bytes, budget {int(limit):,}')
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
