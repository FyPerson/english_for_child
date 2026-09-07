"""Directory contract for build inputs, regression scripts, and resource inventories."""
import ast
import json
from pathlib import Path
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[2]

class LayoutTests(unittest.TestCase):
    def test_frontend_and_resource_inputs(self):
        config=json.loads((ROOT/'project.json').read_text(encoding='utf-8'))
        for week in config['weeks']:
            stem=f'week{week:02}'
            for suffix in ['data.js','template.html']:
                self.assertTrue((ROOT/f'frontend/src/weeks/{stem}.{suffix}').is_file())
            for name in ['phoneme_audio','word_audio','phoneme_ill','word_ill','wall_ill','book_img','celebrate_nat']:
                self.assertTrue((ROOT/f'frontend/src/media/{stem}/{name}.js').is_file())
        for name in ['audio_manifest.json','audio_manifest_w2.json','audio_manifest_w3.json','phoneme_sources_w3.json']:
            self.assertIsInstance(json.loads((ROOT/'resources/manifests'/name).read_text(encoding='utf-8')),dict)
        self.assertTrue((ROOT/'resources/assets/phonemes').is_dir())

    def test_moved_python_sources_parse(self):
        for directory in ['tools','tests']:
            for path in (ROOT/directory).rglob('*.py'):
                ast.parse(path.read_text(encoding='utf-8-sig'),filename=str(path))

    def test_regression_entrypoints(self):
        for name in ['test_progress','test_games','test_assessment_browser','test_mobile','test_course','smoke_parent_panel','smoke_w2_browser','smoke_w3_browser']:
            self.assertTrue((ROOT/f'tests/browser/{name}.py').is_file())
        for name in ['check_data','load_data','assessment_contract','export_data']:
            self.assertTrue((ROOT/f'tools/validation/{name}.js').is_file())
        self.assertFalse((ROOT/'src').exists())
        self.assertFalse((ROOT/'tools/week-checks').exists())

    def test_generated_products_and_moved_directories_are_not_in_the_tree(self):
        for name in ['course.html','index.html','week01.html','week02.html','week03.html','week04.html']:
            self.assertFalse((ROOT/name).exists(),f'{name} must only exist under build/')
        self.assertEqual(sorted(p.name for p in ROOT.glob('week[0-9][0-9].html')),[])
        self.assertFalse((ROOT/'docs/archive/screenshots').exists())
        self.assertFalse((ROOT/'resources/reference').exists())
        tracked=subprocess.run(['git','ls-files','--','*.html'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8').stdout.split()
        self.assertEqual([f for f in tracked if '/' not in f],[],'no HTML product may be tracked at the repository root')

if __name__=='__main__':unittest.main()
