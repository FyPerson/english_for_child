"""Weekly theme palette tool: spec assertions hold for every hue and chroma, every token stays inside sRGB by chroma
reduction (never channel clipping), the semantic soft backgrounds the checks assume are the ones in the templates,
templates are rewritten token by token and nothing else moves."""
from pathlib import Path
import re
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import theme_palette as tp
from project_config import load_config


def synthetic_template(light_extra='', dark_extra=''):
    light = ';'.join(f'--{t}:#111111' for t in tp.TOKENS) + ';--vowel:#D8492F;--accent:#DE9420' + light_extra
    dark = ';'.join(f'--{t}:#222222' for t in tp.TOKENS) + ';--vowel:#F0785E;--accent:#EDB055' + dark_extra
    return ('<style>\n:root{' + light + '}\n'
            '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){' + dark + '}}\n'
            ':root[data-theme="dark"]{' + dark + '}\n</style>')


class PaletteTests(unittest.TestCase):
    def test_named_sets_validate_within_spec(self):
        for key, weeks in tp.SETS.items():
            for hue, name in weeks:
                p = tp.week(hue, name)
                self.assertTrue(tp.LIGHT_GROUND_L[0] <= p['checks']['light ground L*'] <= tp.LIGHT_GROUND_L[1], (key, name))
                self.assertTrue(tp.DARK_GROUND_L[0] <= p['checks']['dark ground L*'] <= tp.DARK_GROUND_L[1], (key, name))
                self.assertGreaterEqual(p['checks']['light ink/ground'], 7.0)
                self.assertGreaterEqual(p['checks']['light ink-2/ground'], 4.5)
                self.assertEqual(p['light']['surface'], '#FFFFFF')

    def test_every_hue_and_chroma_validates(self):
        for hue in range(0, 360, 15):
            for chroma in (0.0, 0.02, 0.045, 0.08, 0.12, 0.2):
                tp.week(hue, f'hue {hue}', chroma=chroma)   # raises ValueError on any spec violation

    def test_chroma_is_reduced_into_the_srgb_gamut_and_reported(self):
        # gamut_chroma never returns a color outside sRGB and keeps the chroma when it already fits
        for hue in range(0, 360, 15):
            for L in (0.2, 0.5, 0.8, 0.96):
                kept = tp.gamut_chroma(L, 0.2, hue)
                self.assertTrue(tp.in_gamut(tp.oklch_to_linear(L, kept, hue)), (hue, L, kept))
        self.assertEqual(tp.gamut_chroma(0.5, 0.02, 165), 0.02)
        # set A: the mint light ladder fits sRGB, the taro / sky / peach grounds need less chroma than the ladder asks
        self.assertEqual(tp.week(165, 'mint')['chroma_reduced'], {})
        for hue in (300, 235, 45):
            reduced = tp.week(hue, 'x')['chroma_reduced']
            self.assertIn('light ground', reduced, hue)
            self.assertTrue(0 < reduced['light ground'] < 1, reduced)
        # the reported ground is exactly the in-gamut color, so it converts back with no channel at a clipped extreme
        # unless the hue itself runs into a primary (pure red / blue at 255 is then the gamut boundary, not clipping)
        p = tp.week(300, 'taro')
        self.assertNotEqual(p['light']['ground'], tp.hexs(tp.oklch_to_srgb(tp.oklch_L_for_lab_L(94.5, 0.045, 300), 0.045, 300)))

    def test_non_finite_hue_or_chroma_is_rejected(self):
        for bad in (float('nan'), float('inf'), -float('inf')):
            with self.assertRaisesRegex(ValueError, 'finite'):
                tp.week(bad, 'bad')
            with self.assertRaisesRegex(ValueError, 'chroma'):
                tp.week(165, 'bad', chroma=bad)
        with self.assertRaisesRegex(ValueError, 'chroma'):
            tp.week(165, 'bad', chroma=0.9)
        self.assertEqual(tp.week(-30, 'wrap')['light'], tp.week(330, 'wrap')['light'])

    def test_validate_rejects_a_broken_palette(self):
        p = tp.week(165, 'mint')
        p['light']['ink'] = p['light']['ground']
        with self.assertRaisesRegex(ValueError, 'ink on ground'):
            tp.validate(p)
        p = tp.week(165, 'mint')
        p['dark']['ground'] = '#000000'
        with self.assertRaisesRegex(ValueError, 'dark ground L'):
            tp.validate(p)

    def test_apply_rewrites_the_three_blocks_and_nothing_else(self):
        p = tp.week(45, 'peach')
        out = tp.apply_to_text(synthetic_template(), p)
        self.assertNotIn('#111111', out)
        self.assertNotIn('#222222', out)
        self.assertEqual(out.count(p['light']['ground']), 1)
        self.assertEqual(out.count(p['dark']['ground']), 2)
        self.assertIn('--vowel:#D8492F', out)
        self.assertIn('--vowel:#F0785E', out)
        self.assertIn('--accent:#DE9420', out)

    def test_apply_refuses_a_block_with_a_missing_or_duplicated_token(self):
        broken = synthetic_template().replace('--sunk:#111111;', '', 1)
        with self.assertRaisesRegex(SystemExit, '--sunk must occur exactly once'):
            tp.apply_to_text(broken, tp.week(45, 'peach'))
        doubled = synthetic_template().replace('--ink:#222222;', '--ink:#222222;--ink:#333333;', 1)
        with self.assertRaisesRegex(SystemExit, '--ink must occur exactly once'):
            tp.apply_to_text(doubled, tp.week(45, 'peach'))

    def test_block_end_is_found_by_brace_depth_and_comments_or_duplicates_are_refused(self):
        p = tp.week(45, 'peach')
        # a brace inside a value and parentheses in shadows do not cut the block short
        nested = synthetic_template(light_extra=';--shadow-1:0 1px 2px rgba(35,43,40,.07);--empty:{}', dark_extra=';--empty:{}')
        out = tp.apply_to_text(nested, p)
        self.assertNotIn('#111111', out)
        self.assertNotIn('#222222', out)
        self.assertEqual(out.count('--empty:{}'), 3)
        with self.assertRaisesRegex(SystemExit, 'light must not contain comments'):
            tp.apply_to_text(synthetic_template(light_extra=';/* --ground:#000000 } */'), p)
        with self.assertRaisesRegex(SystemExit, 'theme-dark must occur exactly once'):
            tp.apply_to_text(synthetic_template() + '\n:root[data-theme="dark"]{--ground:#000000}', p)
        with self.assertRaisesRegex(SystemExit, 'light is not closed'):
            tp.block_spans(':root{--ground:#111111')

    def test_semantic_soft_backgrounds_match_every_template(self):
        for n in load_config()['weeks']:
            text = tp.template_path(n).read_text(encoding='utf-8')
            for start, end, kind in tp.block_spans(text):
                found = dict(re.findall(r'--((?:vowel|cons|accent|ok)-soft):\s*(#[0-9A-Fa-f]{6})', text[start:end]))
                self.assertEqual(found, tp.SEMANTIC_SOFT['light' if kind == 'light' else 'dark'], f'week{n:02} {kind}')

    def test_real_templates_carry_set_a_and_dry_run_is_read_only(self):
        for n, (hue, name) in enumerate(tp.SETS['A'], 1):
            if n not in load_config()['weeks']:
                continue
            path = tp.template_path(n)
            before = path.read_bytes()
            changed = tp.apply(n, tp.week(hue, name), dry=True)
            self.assertEqual(changed, 0, f'week{n:02} template drifted from set A')
            self.assertEqual(path.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
