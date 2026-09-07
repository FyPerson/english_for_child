"""Weekly theme palette tool: spec assertions hold for every hue, templates are rewritten token by token, nothing else moves."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import theme_palette as tp
from project_config import load_config


def synthetic_template():
    light = ';'.join(f'--{t}:#111111' for t in tp.TOKENS) + ';--vowel:#D8492F;--accent:#DE9420'
    dark = ';'.join(f'--{t}:#222222' for t in tp.TOKENS) + ';--vowel:#F0785E;--accent:#EDB055'
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

    def test_every_hue_validates(self):
        for hue in range(0, 360, 15):
            tp.week(hue, f'hue {hue}')   # raises ValueError on any spec violation

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
