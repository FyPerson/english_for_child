"""Validated project inventory. Paths and output names are derived, never arbitrary."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'build'   # generated products; not tracked by git
INDEX_HTML = '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=course.html"><title>声音积木</title><a href="course.html">进入声音积木</a>'

def load_config(path=None):
    data=json.loads((path or ROOT/'project.json').read_text(encoding='utf-8'))
    if data.get('schemaVersion') != 1: raise ValueError('Unsupported project schema')
    weeks=data.get('weeks'); course=data.get('courseWeeks')
    for name,values in [('weeks',weeks),('courseWeeks',course)]:
        if not isinstance(values,list) or not values or any(type(n) is not int or n<1 or n>99 for n in values):
            raise ValueError(f'{name} must be a nonempty list of week numbers')
        if values != list(range(1,len(values)+1)): raise ValueError(f'{name} must be consecutive, starting at 1')
    if not set(course)<=set(weeks): raise ValueError('courseWeeks must be included in weeks')
    if data.get('entry') != 'course.html': raise ValueError('The stable entry must be course.html')
    return data

def week_name(n): return f'week{n:02}.html'
