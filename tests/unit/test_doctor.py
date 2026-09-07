"""doctor: Node.js version gate with stubbed `node --version` outputs (plan v1.3 §4 phase 0 step 4)."""
from pathlib import Path
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import project


def stub(stdout='', returncode=0, stderr='', raise_error=None):
    def run(cmd, **kwargs):
        if raise_error:
            raise raise_error
        return subprocess.CompletedProcess(cmd, returncode, stdout, stderr)
    return run


class DoctorNodeTests(unittest.TestCase):
    def test_supported_versions_pass_and_are_returned(self):
        self.assertEqual(project.node_version_check(run=stub('v22.11.0\n')), 'v22.11.0')
        self.assertEqual(project.node_version_check(run=stub('v18.0.0\n')), 'v18.0.0')

    def test_too_old_fails_and_names_the_version(self):
        with self.assertRaisesRegex(SystemExit, r'v16\.20\.2 is too old; need major version >= 18'):
            project.node_version_check(run=stub('v16.20.2\n'))

    def test_missing_binary_fails(self):
        with self.assertRaisesRegex(SystemExit, 'Node.js not found'):
            project.node_version_check(run=stub(raise_error=FileNotFoundError('node')))

    def test_nonzero_exit_fails_with_output(self):
        with self.assertRaisesRegex(SystemExit, 'exit code 3: boom'):
            project.node_version_check(run=stub('', returncode=3, stderr='boom'))

    def test_unexpected_format_fails_with_actual_output(self):
        for output in ['', 'node 22', '22.11.0', 'vX.1.0']:
            with self.assertRaisesRegex(SystemExit, 'unexpected value'):
                project.node_version_check(run=stub(output))

    def test_real_node_on_this_machine_is_recorded(self):
        version = project.node_version_check()
        self.assertRegex(version, r'^v\d+\.\d+\.\d+$')
        print('Node.js on this machine: ' + version, flush=True)


if __name__ == '__main__':
    unittest.main()
