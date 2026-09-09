"""Baseline contract: exact analysis, static declaration scan, strict fixture schema, create guards, read-only behaviour."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import baseline

ROOT = Path(__file__).resolve().parents[2]
PNG_BYTES, MP3_BYTES = b'not really a png', b'not really an mp3'
PNG, MP3 = base64.b64encode(PNG_BYTES).decode(), base64.b64encode(MP3_BYTES).decode()
SHA = hashlib.sha256


def segments(wall_value=None, unterminated=False, word_ill_lines=None):
    """Declaration texts in the mixed styles the real media files use, keyed by name."""
    audio = lambda name: f'const {name} = {{\n  "a": "data:audio/mpeg;base64,{MP3}",\n  "at": "data:audio/mpeg;base64,{MP3}"\n}};'
    image = lambda name: f"const {name} = {{\n  /* injected */\n  cat:'data:image/png;base64,{PNG}',\n  dog:'data:image/webp;base64,{PNG}'\n}};"
    wall = f"const WALL_ILL = {{\n  nat:'{wall_value}'\n}};" if wall_value else 'const WALL_ILL = {\n  /* nothing this week */\n};'
    book = image('BOOK_IMG')
    if unterminated:
        book = book[:-len('\n};')]
    word_ill = image('WORD_ILL') if word_ill_lines is None else 'const WORD_ILL = {\n' + '\n'.join(word_ill_lines) + '\n};'
    return {'PHONEME_AUDIO': audio('PHONEME_AUDIO'), 'WORD_AUDIO': audio('WORD_AUDIO'), 'PHONEME_ILL': image('PHONEME_ILL'),
            'WORD_ILL': word_ill, 'WALL_ILL': wall, 'BOOK_IMG': book,
            'CELEBRATE_NAT': f"const CELEBRATE_NAT = 'data:image/png;base64,{PNG}';"}


def sample(order=baseline.NAMES, extra='', **kw):
    seg = segments(**kw)
    parts = ['<!doctype html><html><body><script>', 'const META = {week: 1};', extra] + [seg[n] for n in order] + ['</script></body></html>']
    return '\n'.join(parts), seg


def write(temp, text, name='week01.html', newline='\n'):
    path = Path(temp) / name
    path.write_text(text, encoding='utf-8', newline=newline)
    return path


class AnalyzeTests(unittest.TestCase):
    def test_hashes_order_and_media_are_exact(self):
        html, seg = sample()
        with tempfile.TemporaryDirectory() as temp:
            path = write(temp, html)
            result = baseline.analyze(path)
            self.assertEqual(result['sha256'], SHA(path.read_bytes()).hexdigest())
        skeleton = html
        for name in baseline.NAMES:
            skeleton = skeleton.replace(seg[name], f'/*@MEDIA {name}@*/')
        self.assertEqual(result['skeletonSha256'], SHA(skeleton.encode('utf-8')).hexdigest())
        self.assertEqual(result['declarationOrder'], baseline.NAMES)
        mp3, png = SHA(MP3_BYTES).hexdigest(), SHA(PNG_BYTES).hexdigest()
        self.assertEqual(result['media']['WORD_AUDIO'], [['a', 'audio/mpeg', mp3], ['at', 'audio/mpeg', mp3]])
        self.assertEqual(result['media']['WORD_ILL'], [['cat', 'image/png', png], ['dog', 'image/webp', png]])
        self.assertEqual(result['media']['WALL_ILL'], [])
        self.assertEqual(result['media']['CELEBRATE_NAT'], [['', 'image/png', png]])

    def test_reordered_declarations_report_the_new_order_only(self):
        order = list(reversed(baseline.NAMES))
        with tempfile.TemporaryDirectory() as temp:
            a = baseline.analyze(write(temp, sample()[0]))
            b = baseline.analyze(write(temp, sample(order=order)[0]))
        self.assertEqual(b['declarationOrder'], order)
        self.assertEqual(a['media'], b['media'])

    def test_plain_text_change_alters_skeleton_not_media(self):
        with tempfile.TemporaryDirectory() as temp:
            a = baseline.analyze(write(temp, sample()[0]))
            b = baseline.analyze(write(temp, sample(extra='<!-- one more comment -->')[0]))
        self.assertNotEqual(a['skeletonSha256'], b['skeletonSha256'])
        self.assertEqual((a['media'], a['declarationOrder']), (b['media'], b['declarationOrder']))

    def assert_rejected(self, html, pattern, newline='\n'):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, pattern):
                baseline.analyze(write(temp, html, newline=newline))

    def test_duplicate_declaration_fails(self):
        self.assert_rejected(sample(extra='const WORD_AUDIO = {};')[0], 'WORD_AUDIO')

    def test_unterminated_declaration_fails(self):
        order = [n for n in baseline.NAMES if n != 'BOOK_IMG'] + ['BOOK_IMG']
        self.assert_rejected(sample(order=order, unterminated=True)[0], 'BOOK_IMG')

    def test_reference_form_lesson_is_rejected(self):
        self.assert_rejected(sample(wall_value='media/0123456789abcdef.png')[0], 'data URI')

    def test_crlf_is_rejected(self):
        self.assert_rejected(sample()[0], 'carriage return', newline='\r\n')

    def test_non_canonical_base64_is_rejected(self):
        for payload in ['AAA', 'AA==AA', 'AAAA=', 'AAA=AAAA']:
            self.assert_rejected(sample(wall_value=f'data:image/png;base64,{payload}')[0], 'canonical base64')

    def test_static_scan_rejects_non_plain_properties(self):
        value = f"'data:image/png;base64,{PNG}'"
        for lines, pattern in [
            ([f"  cat:{value},", f"  cat:{value}"], 'duplicate key'),
            ([f"  ['c'+'at']:{value}"], 'plain'),
            ([f"  ...{{cat:{value}}}"], 'plain'),
            ([f"  get cat(){{return {value};}}"], 'plain'),
            ([f"  cat:{{inner:{value}}}"], 'plain'),
            ([f"  7:{value}"], 'numeric key'),
            ([f"  cat:{value}", "  /* multi", "  line */"], 'plain'),
        ]:
            self.assert_rejected(sample(word_ill_lines=lines)[0], pattern)


def fake_project(temp, weeks=(1, 2, 3, 4)):
    """A temporary ROOT whose build/ holds sample weeks and a course file."""
    root = Path(temp)
    (root / 'build').mkdir(exist_ok=True)
    for n in weeks:
        write(root / 'build', sample(extra=f'<!-- week {n} -->')[0], f'week{n:02}.html')
    write(root / 'build', '<html>course</html>', 'course.html')
    return root


def make_fixture(root, fixture, force=False, commit='a' * 40, statuses=('', '')):
    with patch.object(baseline, 'ROOT', root), patch.object(baseline, 'BUILD', root / 'build'), patch.object(baseline, 'build') as build, \
         patch.object(baseline, 'git', side_effect=[*statuses, commit]), patch.object(baseline, 'node_version', return_value='v24.0.0'), \
         patch.object(baseline, 'load_config', return_value={'weeks': [1, 2, 3, 4], 'courseWeeks': [1], 'entry': 'course.html'}):
        data = baseline.create(force=force, fixture=fixture)
    return data, build


class CreateTests(unittest.TestCase):
    def test_create_writes_a_valid_fixture_and_force_overwrites(self):
        with tempfile.TemporaryDirectory() as temp:
            root = fake_project(temp)
            fixture = root / 'fixtures' / 'b.json'
            data, build = make_fixture(root, fixture)
            build.assert_called_once()
            self.assertEqual(set(data['weeks']), set(baseline.COVERED_WEEKS))
            self.assertEqual((data['form'], data['sourceCommit'], data['toolVersions']['node']), ('single-file', 'a' * 40, 'v24.0.0'))
            self.assertEqual(data['course']['sha256'], SHA((root / 'build' / 'course.html').read_bytes()).hexdigest())
            self.assertEqual(data['weeks']['week02.html'], baseline.analyze(root / 'build' / 'week02.html'))
            self.assertEqual(json.loads(fixture.read_text(encoding='utf-8')), data)
            with self.assertRaisesRegex(SystemExit, 'REFUSED'):
                make_fixture(root, fixture)
            again, _ = make_fixture(root, fixture, force=True, commit='b' * 40)
            self.assertEqual(json.loads(fixture.read_text(encoding='utf-8'))['sourceCommit'], 'b' * 40)
            baseline.validate(again)

    def test_create_refuses_existing_fixture_without_touching_git_or_build(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(baseline, 'git') as git, patch.object(baseline, 'build') as build:
            fixture = Path(temp) / 'b.json'
            fixture.write_text('{}', encoding='utf-8')
            with self.assertRaisesRegex(SystemExit, 'REFUSED'):
                baseline.create(fixture=fixture)
            git.assert_not_called()
            build.assert_not_called()
            self.assertEqual(fixture.read_text(encoding='utf-8'), '{}')

    def test_create_refuses_dirty_tree_before_building(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(baseline, 'git', return_value=' M week01.html'), patch.object(baseline, 'build') as build:
            with self.assertRaisesRegex(SystemExit, 'not clean'):
                baseline.create(fixture=Path(temp) / 'b.json')
            build.assert_not_called()

    def test_create_refuses_when_the_build_dirties_the_tree(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / 'b.json'
            with self.assertRaisesRegex(SystemExit, 'build changed'):
                make_fixture(fake_project(temp), fixture, statuses=('', ' M week01.html'))
            self.assertFalse(fixture.exists())

    def test_real_git_repository_detects_a_build_that_rewrites_tracked_products(self):
        """Same guard, but with a real git repository instead of a mocked status."""
        with tempfile.TemporaryDirectory() as temp:
            root = fake_project(temp)
            git = lambda *a: subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@example.com', *a], cwd=root, check=True, capture_output=True)
            git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'products')
            fixture = root / 'b.json'
            config = {'weeks': [1, 2, 3, 4], 'courseWeeks': [1], 'entry': 'course.html'}
            common = dict(ROOT=root, BUILD=root / 'build', node_version=lambda: 'v24.0.0', load_config=lambda: config)
            with patch.multiple(baseline, build=lambda: None, **common):
                data = baseline.create(fixture=fixture)
            self.assertEqual(data['sourceCommit'], git('rev-parse', 'HEAD').stdout.decode().strip())
            self.assertTrue(fixture.exists())
            fixture.unlink()

            def rewriting_build():
                write(root / 'build', sample(extra='<!-- rebuilt differently -->')[0], 'week03.html')
            with patch.multiple(baseline, build=rewriting_build, **common):
                with self.assertRaisesRegex(SystemExit, 'build changed'):
                    baseline.create(fixture=fixture)
            self.assertFalse(fixture.exists())
            git('checkout', '--', 'build/week03.html')
            (root / 'stray.txt').write_text('untracked', encoding='utf-8')
            with patch.multiple(baseline, build=lambda: None, **common):
                with self.assertRaisesRegex(SystemExit, 'not clean'):
                    baseline.create(fixture=fixture)


class FixtureSchemaTests(unittest.TestCase):
    def valid(self, temp):
        root = fake_project(temp)
        fixture = root / 'b.json'
        data, _ = make_fixture(root, fixture)
        return root, fixture, data

    def assert_invalid(self, data, pattern):
        with self.assertRaisesRegex(SystemExit, pattern):
            baseline.validate(json.loads(json.dumps(data)))

    def test_valid_fixture_passes_and_variants_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            _, _, data = self.valid(temp)
        baseline.validate(json.loads(json.dumps(data)))
        empty = dict(data, weeks={})
        self.assert_invalid(empty, 'weeks must be exactly')
        self.assert_invalid(dict(data, form='reference'), 'form')
        self.assert_invalid(dict(data, extra=1), 'top-level keys')
        self.assert_invalid(dict(data, sourceCommit='abc'), 'sourceCommit')
        three = json.loads(json.dumps(data)); del three['weeks']['week04.html']
        self.assert_invalid(three, 'weeks must be exactly')
        no_decl = json.loads(json.dumps(data)); del no_decl['weeks']['week01.html']['media']['WALL_ILL']
        self.assert_invalid(no_decl, 'exactly the seven')
        bad_hex = json.loads(json.dumps(data)); bad_hex['weeks']['week01.html']['media']['WORD_AUDIO'][0][2] = 'zz'
        self.assert_invalid(bad_hex, 'malformed digest')
        dup = json.loads(json.dumps(data)); dup['weeks']['week01.html']['media']['WORD_AUDIO'].append(['a', 'audio/mpeg', 'f' * 64])
        self.assert_invalid(dup, 'duplicate key')
        order = json.loads(json.dumps(data)); order['weeks']['week01.html']['declarationOrder'] = baseline.NAMES[:-1]
        self.assert_invalid(order, 'permutation')
        for bad in ['PHONEME_AUDIO', [1, None, {}], None]:
            typed = json.loads(json.dumps(data)); typed['weeks']['week01.html']['declarationOrder'] = bad
            self.assert_invalid(typed, 'list of strings')
        celebrate = json.loads(json.dumps(data)); celebrate['weeks']['week01.html']['media']['CELEBRATE_NAT'] = []
        self.assert_invalid(celebrate, 'CELEBRATE_NAT')

    def test_missing_fixture_is_reported_not_created(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / 'b.json'
            with self.assertRaisesRegex(SystemExit, 'MISSING'):
                baseline.check(fixture=fixture)
            self.assertFalse(fixture.exists())

    def test_empty_weeks_fixture_cannot_pass_check(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / 'b.json'
            fixture.write_text(json.dumps({'schemaVersion': 1, 'form': 'single-file', 'weeks': {}}), encoding='utf-8')
            with self.assertRaisesRegex(SystemExit, 'invalid'):
                baseline.check(fixture=fixture)


class CheckTests(unittest.TestCase):
    def test_check_with_explicit_paths_passes_then_reports_and_keeps_fixture(self):
        with tempfile.TemporaryDirectory() as temp:
            root = fake_project(temp)
            fixture = root / 'b.json'
            make_fixture(root, fixture)
            paths = {name: root / 'build' / name for name in baseline.COVERED_WEEKS}
            baseline.check(fixture=fixture, week_paths=paths)
            with self.assertRaisesRegex(ValueError, 'week_paths must cover'):
                baseline.check(fixture=fixture, week_paths={'week01.html': root / 'build' / 'week01.html'})
            with self.assertRaisesRegex(ValueError, 'does not cover: week05.html'):
                baseline.check(fixture=fixture, week_paths=dict(paths, **{'week05.html': root / 'build' / 'week01.html'}))
            before = (fixture.read_bytes(), os.stat(fixture).st_mtime_ns)
            broken = sample(extra='<!-- week 2 -->', wall_value=f'data:image/png;base64,{PNG}')[0]
            write(root / 'build', broken, 'week02.html')
            with self.assertRaisesRegex(SystemExit, r"week02\.html: WALL_ILL keys differ: added 'nat'"):
                baseline.check(fixture=fixture, week_paths=paths)
            self.assertEqual((fixture.read_bytes(), os.stat(fixture).st_mtime_ns), before)

    def test_differences_name_keys_order_mime_and_bytes(self):
        entry = {'sha256': '0' * 64, 'skeletonSha256': 's' * 64, 'declarationOrder': baseline.NAMES,
                 'media': {name: [] for name in baseline.NAMES}}
        entry['media']['WORD_AUDIO'] = [['a', 'audio/mpeg', 'x' * 64], ['at', 'audio/mpeg', 'y' * 64]]
        clone = lambda: json.loads(json.dumps(entry))
        self.assertEqual(baseline.differences({'w': entry}, {'w': entry}), [])
        changed = clone(); changed['media']['WORD_AUDIO'][1][2] = 'z' * 64
        self.assertEqual(baseline.differences({'w': entry}, {'w': changed}), ['w: WORD_AUDIO bytes differ for at'])
        mime = clone(); mime['media']['WORD_AUDIO'][0][1] = 'image/png'
        self.assertEqual(baseline.differences({'w': entry}, {'w': mime}), ['w: WORD_AUDIO mime differs for a'])
        fewer = clone(); fewer['media']['WORD_AUDIO'].pop()
        self.assertEqual(baseline.differences({'w': entry}, {'w': fewer}), ["w: WORD_AUDIO keys differ: removed 'at'"])
        swapped = clone(); swapped['media']['WORD_AUDIO'].reverse()
        self.assertIn("reordered from position 0 ('a' expected, 'at' built)", baseline.differences({'w': entry}, {'w': swapped})[0])
        order = clone(); order['declarationOrder'] = list(reversed(baseline.NAMES))
        self.assertIn('declarationOrder differs (expected', baseline.differences({'w': entry}, {'w': order})[0])
        self.assertEqual(baseline.differences({'w': entry}, {}), ['w: present in baseline but not built'])


class MediaExceptionsTests(unittest.TestCase):
    """L1（外审 low，2026-09-09）：媒体唯一例外要有机器可断言的分类，不能只靠注释。"""

    def test_classify_separates_known_from_unexpected_with_precise_conservation(self):
        exceptions = [
            {'week': 'week01.html', 'decl': 'WORD_AUDIO', 'key': 'pit', 'change': 'removed', 'reason': 'data-decision'},
        ]
        known_line = "week01.html: WORD_AUDIO keys differ: removed 'pit'"
        # ①命中已知例外的一行，应分进 known。
        self.assertEqual(baseline.classify_media_differences([known_line], exceptions), {'known': [known_line], 'unexpected': []})
        # ②同一 decl 但还带着别的变化（同一行里 removed 了两个键，不只是登记的那一个）——
        #   "精确守恒"要求这种合并行整条判 unexpected，不能因为其中包含被允许的那个键
        #   就放行，否则新的、未登记的媒体漂移会搭已知例外的车悄悄溜过去。
        combined_line = "week01.html: WORD_AUDIO keys differ: removed 'pit', 'sat'"
        self.assertEqual(baseline.classify_media_differences([combined_line], exceptions), {'known': [], 'unexpected': [combined_line]})
        # ③不相干的差异（别的周/别的 decl/别的键）应分进 unexpected。
        unrelated = "week02.html: WORD_AUDIO keys differ: removed 'pit'"
        self.assertEqual(baseline.classify_media_differences([unrelated], exceptions), {'known': [], 'unexpected': [unrelated]})
        # ④非媒体差异（骨架哈希/声明顺序）这份清单从不覆盖，恒为 unexpected——例外清单
        #   只保护"媒体键被移除"这一种变化，骨架结构变化永远需要人核实。
        skeleton_line = 'week01.html: skeletonSha256 differs (aaaaaaaaaaaa expected, bbbbbbbbbbbb built)'
        self.assertEqual(baseline.classify_media_differences([skeleton_line], exceptions), {'known': [], 'unexpected': [skeleton_line]})
        # ⑤混合列表：known 与 unexpected 各自正确分组，互不影响。
        mixed = baseline.classify_media_differences([known_line, unrelated, skeleton_line], exceptions)
        self.assertEqual(mixed, {'known': [known_line], 'unexpected': [unrelated, skeleton_line]})

    def test_default_exceptions_constant_matches_the_real_week01_pit_removal_wording(self):
        # KNOWN_MEDIA_EXCEPTIONS 的默认清单必须能精确复现 _media_difference() 真正会
        # 产出的那一行文案——不是靠人眼对齐，用 baseline 自己的比较逻辑反向验证。
        entry = lambda rows: {'sha256': '0' * 64, 'skeletonSha256': 's' * 64, 'declarationOrder': baseline.NAMES,
                               'media': {name: [] for name in baseline.NAMES}}
        expected = entry([])
        expected['media']['WORD_AUDIO'] = [['pit', 'audio/mpeg', 'x' * 64], ['sat', 'audio/mpeg', 'y' * 64]]
        actual = json.loads(json.dumps(expected))
        actual['media']['WORD_AUDIO'] = [['sat', 'audio/mpeg', 'y' * 64]]   # 'pit' 已被移除
        diffs = baseline.differences({'week01.html': expected}, {'week01.html': actual})
        classified = baseline.classify_media_differences(diffs)
        self.assertEqual(classified, {'known': ["week01.html: WORD_AUDIO keys differ: removed 'pit'"], 'unexpected': []},
                          'KNOWN_MEDIA_EXCEPTIONS 里 pit 的登记文案应与 differences() 真正产出的那一行逐字一致')

    def test_live_repository_media_drift_is_fully_explained_by_known_exceptions(self):
        """当前迁移期基线必然与实测产物有差异（骨架哈希会变，是引擎改造的正常代价）——
        这条测试只盯媒体这一类差异（"keys differ" / "mime differs" / "bytes differ"），
        断言任何媒体漂移要么命中 KNOWN_MEDIA_EXCEPTIONS（带 reason 分类），要么就必须
        被当成新问题拦下来，不能靠人眼在一堆 diff 里分辨。这是 L1"对允许删除的键与
        其余媒体清单做精确守恒断言"的实测落地：一旦未来某次引擎改造意外动了媒体
        （比如误删了别的键），这条测试会先转红，逼着人把它按"数据决策"还是"引擎改造"
        分类登记，而不是被当前这一条已知例外的宽容掩盖过去。"""
        subprocess.run([sys.executable, 'tools/build_lessons.py'], cwd=ROOT, check=True)
        data = baseline.load()
        actual = {name: baseline.analyze(baseline.BUILD / name) for name in baseline.COVERED_WEEKS}
        diffs = baseline.differences(data['weeks'], actual)
        media_diffs = [d for d in diffs if ' keys differ:' in d or ' mime differs for ' in d or ' bytes differ for ' in d]
        classified = baseline.classify_media_differences(media_diffs)
        self.assertEqual(classified['unexpected'], [],
                          '出现未登记在 KNOWN_MEDIA_EXCEPTIONS 里的媒体差异，需要先查清是数据决策还是引擎改造，'
                          '登记对应 reason 后再放行，不能直接忽略：' + json.dumps(classified['unexpected'], ensure_ascii=False))


class ReadOnlyBehaviourTests(unittest.TestCase):
    def test_repository_fixture_exists_and_build_plus_check_leave_it_untouched(self):
        """build 与 baseline --check 都不得改动 fixture 文件（只读行为契约）。

        注意 --check 这一步**不要求子进程退出码为 0**。本测试的判据只有一条：
        fixture 的字节与 mtime 未变。--check 的退出码反映的是"当前产物是否仍与
        基线相符"，那是**产物内容的瞬时状态**，不是只读行为——里程碑 2 这类会
        合法改变产物的改造进行期间，它本来就该报差异（第 9 步重取基线后才回到
        相符）。原先写 check=True 等于把这个瞬时状态锁进了一条名为
        ReadOnlyBehaviour 的测试里，改造一开始就必红，而它红的原因与它要保护的
        性质无关。build 那一步仍然要求成功——build 失败是真问题。
        """
        self.assertTrue(baseline.FIXTURE.exists(), 'the repository baseline fixture is required')
        before = (baseline.FIXTURE.read_bytes(), os.stat(baseline.FIXTURE).st_mtime_ns)
        subprocess.run([sys.executable, 'tools/build_lessons.py'], cwd=ROOT, check=True)
        checked = subprocess.run([sys.executable, 'tools/baseline.py', '--check'], cwd=ROOT,
                                 capture_output=True, text=True, encoding='utf-8')
        # 退出码不参与"是否相符"的判定，但要确认它真的跑起来了、而且是真的执行了
        # --check 逻辑（不是参数解析失败打印 usage 就蒙混过关）。
        #
        # L4 修复（预筛 low）：改前只判 stdout+stderr 里含子串 'baseline'——这太弱了，
        # 连参数解析失败时 argparse 打印的 usage 行（`usage: baseline.py [-h] ...`）
        # 都含 'baseline'（脚本文件名本身），根本测不出"--check 逻辑真的跑了"。
        # 改成两条更有区分度的判据：
        #   ① 退出码必须 ∈ {0, 1}——0 是 tools/baseline.py:260 的"BASELINE OK"分支，
        #      1 是 tools/baseline.py:258 的"BASELINE MISMATCH"分支（SystemExit(str)
        #      的默认退出码是 1）；argparse 自身的用法错误退出码是 2，不在这个集合里，
        #      能把"参数解析失败"这类情况排除掉。
        #   ② 输出必须含 'BASELINE OK' 或 'BASELINE MISMATCH' 这两个具体标志串之一
        #      （分别对应 tools/baseline.py:260 / :258 的实际打印文案），不是宽松地
        #      找 'baseline' 这个子串。
        output = (checked.stdout or '') + (checked.stderr or '')
        self.assertIn(checked.returncode, (0, 1),
                      f'--check 的退出码应是 0（BASELINE OK）或 1（BASELINE MISMATCH），'
                      f'实际 {checked.returncode}——可能是参数解析失败（usage 错误码 2），说明 --check 逻辑没有真正执行')
        self.assertTrue('BASELINE OK' in output or 'BASELINE MISMATCH' in output,
                      f'--check 似乎没有真正执行 --check 逻辑：输出里既没有 "BASELINE OK" 也没有 '
                      f'"BASELINE MISMATCH" 这两个具体标志串：{output[:300]!r}')
        self.assertEqual((baseline.FIXTURE.read_bytes(), os.stat(baseline.FIXTURE).st_mtime_ns), before)

    def test_force_without_create_is_an_error_in_both_entrypoints(self):
        for cmd in [[sys.executable, 'tools/baseline.py', '--check', '--force'],
                    [sys.executable, 'tools/project.py', 'baseline', '--check', '--force']]:
            result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
            self.assertNotEqual(result.returncode, 0, cmd)
            self.assertIn('--force', result.stderr)


if __name__ == '__main__':
    unittest.main()
