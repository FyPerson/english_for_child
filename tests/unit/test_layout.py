"""Directory contract for build inputs, regression scripts, and resource inventories."""
import ast
import json
from pathlib import Path
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

if __name__=='__main__':unittest.main()
