import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / 'builder'))
import aura_builder as builder  # noqa: E402


class RepositoryTestCase(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.original_root = builder.ROOT
        builder.ROOT = self.root
        subprocess.run(['git', 'init', '-q'], cwd=self.root, check=True)
        subprocess.run(['git', 'config', 'user.email', 'aura-test@example.invalid'], cwd=self.root, check=True)
        subprocess.run(['git', 'config', 'user.name', 'AURA test'], cwd=self.root, check=True)
        (self.root / 'AGENTS.md').write_text('# AURA rules\n', encoding='utf-8')
        subprocess.run(['git', 'add', 'AGENTS.md'], cwd=self.root, check=True)
        subprocess.run(['git', 'commit', '-qm', 'fixture'], cwd=self.root, check=True)

    def tearDown(self):
        builder.ROOT = self.original_root
        self.tempdir.cleanup()


class PathSafetyTests(RepositoryTestCase):
    def test_accepts_a_relative_repository_root(self):
        builder.ROOT = Path(os.path.relpath(self.root, Path.cwd()))
        target = self.root / 'relative-root.txt'
        target.write_text('safe\n', encoding='utf-8')
        self.assertEqual(builder.safe_path('relative-root.txt'), target.resolve())

    def test_rejects_traversal_and_protected_names_case_insensitively(self):
        for path in ('../outside.txt', '.git/config', '.ENV', 'nested/SECRETS.JSON'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                builder.safe_path(path)

    def test_replace_text_requires_one_exact_match(self):
        target = self.root / 'app.js'
        target.write_text('const state = "old";\n', encoding='utf-8')
        result = json.loads(builder.replace_text('app.js', '"old"', '"new"'))
        self.assertTrue(result['ok'])
        self.assertIn('"new"', target.read_text(encoding='utf-8'))
        failed = json.loads(builder.replace_text('app.js', 'missing', 'value'))
        self.assertEqual(failed['error'], 'precondition_failed')

    def test_git_diff_includes_untracked_files(self):
        (self.root / 'new-file.js').write_text('const created = true;\n', encoding='utf-8')
        diff = builder.git_diff()
        self.assertIn('b/new-file.js', diff)
        self.assertIn('const created = true;', diff)


class DecisionGateTests(unittest.TestCase):
    def test_pipeline_includes_design_blueprint_and_manager_roles_in_order(self):
        roles = builder.PIPELINE_ROLES
        self.assertLess(roles.index('UX/Creative Designer'), roles.index('Implementer'))
        self.assertLess(roles.index('Implementer'), roles.index('Blueprint Curator'))
        self.assertLess(roles.index('Blueprint Curator'), roles.index('Safety Reviewer'))
        self.assertLess(roles.index('Release Reviewer'), roles.index('Development Manager'))

    def test_release_decision_requires_exact_token(self):
        allowed = {'READY', 'HOLD'}
        self.assertEqual(builder.parse_decision('DECISION: READY\nChecks passed.', allowed), 'READY')
        for unsafe in ('NOT READY', 'DECISION: NOT_READY', 'UNREADY', 'The change is READY'):
            with self.subTest(text=unsafe):
                self.assertEqual(builder.parse_decision(unsafe, allowed), 'INVALID')

    def test_review_decision_rejects_ambiguous_output(self):
        self.assertEqual(builder.parse_decision('DECISION: PASS', {'PASS', 'BLOCKED'}), 'PASS')
        self.assertEqual(builder.parse_decision('Looks good', {'PASS', 'BLOCKED'}), 'INVALID')


class AgentLoopTests(unittest.TestCase):
    def test_preflight_requires_a_real_native_list_files_call(self):
        response = {'message': {'role': 'assistant', 'content': '', 'tool_calls': [
            {'function': {'name': 'list_files', 'arguments': {'prefix': 'builder'}}}
        ]}}
        with mock.patch.object(builder, 'ollama_chat', return_value=response):
            result = builder.preflight_native_tools('http://localhost:11434', 'tiny')
        self.assertTrue(result['ok'])
        self.assertEqual(result['tool_calls'][0]['tool'], 'list_files')

    def test_preflight_rejects_text_instead_of_a_native_call(self):
        response = {'message': {'role': 'assistant', 'content': '{"name":"list_files"}'}}
        with mock.patch.object(builder, 'ollama_chat', return_value=response):
            result = builder.preflight_native_tools('http://localhost:11434', 'tiny')
        self.assertFalse(result['ok'])
        self.assertEqual(result['error']['type'], 'NativeToolPreflightFailed')

    def test_preflight_accepts_native_call_with_a_correctable_argument_error(self):
        response = {'message': {'role': 'assistant', 'content': '', 'tool_calls': [
            {'function': {'name': 'list_files', 'arguments': {'prefix': 'builder now'}}}
        ]}}
        with mock.patch.object(builder, 'ollama_chat', return_value=response):
            result = builder.preflight_native_tools('http://localhost:11434', 'tiny')
        self.assertTrue(result['ok'])
        self.assertEqual(result['tool_calls'][0]['result']['error'], 'path_not_found')

    def test_implementer_no_change_is_reported_not_claimed_complete(self):
        responses = [
            {'message': {'role': 'assistant', 'content': 'I only made a plan.'}},
            {'message': {'role': 'assistant', 'content': 'Still no edit.'}},
            {'message': {'role': 'assistant', 'content': 'Unable to edit.'}},
        ]
        with mock.patch.object(builder, 'ollama_chat', side_effect=responses), \
             mock.patch.object(builder, 'git_diff', return_value=''):
            result = builder.run_tool_agent('http://localhost:11434', 'tiny', 'Implementer', 'Build it', 'task.md')
        self.assertFalse(result['changed'])
        self.assertEqual(result['summary'], 'Unable to edit.')

    def test_read_only_agent_rejects_write_tool(self):
        responses = [
            {'message': {'role': 'assistant', 'content': '', 'tool_calls': [
                {'function': {'name': 'write_file', 'arguments': {'path': 'x', 'content': 'bad'}}}
            ]}},
            {'message': {'role': 'assistant', 'content': 'Scout finished.'}},
        ]
        with mock.patch.object(builder, 'ollama_chat', side_effect=responses), \
             mock.patch.object(builder, 'git_diff', return_value=''):
            result = builder.run_tool_agent(
                'http://localhost:11434', 'tiny', 'Codebase Scout', 'Inspect', 'task.md',
                tools=builder.READ_ONLY_TOOLS, require_changes=False,
            )
        self.assertEqual(result['tool_calls'][0]['result']['error'], 'ValueError')
        self.assertFalse(result['changed'])


class CheckRunnerTests(unittest.TestCase):
    def test_timeout_becomes_failed_evidence(self):
        expired = subprocess.TimeoutExpired(['slow'], 180, output='partial', stderr='late')
        with mock.patch.object(builder.subprocess, 'run', side_effect=expired):
            result = builder.run_checks([['slow']])
        self.assertFalse(result['ok'])
        self.assertEqual(result['results'][0]['returncode'], 124)
        self.assertIn('timed out', result['results'][0]['stderr'])

    def test_unexpected_failure_writes_hold_report(self):
        original_root = builder.ROOT
        with tempfile.TemporaryDirectory() as tempdir:
            builder.ROOT = Path(tempdir)
            try:
                with mock.patch.object(builder, 'main', side_effect=TimeoutError('model stalled')):
                    result = builder.guarded_main()
                report = (builder.ROOT / 'builder' / 'runs' / 'latest.md').read_text(encoding='utf-8')
            finally:
                builder.ROOT = original_root
        self.assertEqual(result, 5)
        self.assertIn('HOLD', report)
        self.assertIn('TimeoutError', report)


class WorkflowConfigurationTests(unittest.TestCase):
    def test_dell_runner_uses_tool_native_small_model(self):
        workflow = (REPOSITORY_ROOT / '.github' / 'workflows' / 'aura-builder-agents.yml').read_text(encoding='utf-8')
        config = json.loads((REPOSITORY_ROOT / 'builder' / 'config.example.json').read_text(encoding='utf-8'))
        self.assertIn("$model = 'qwen3:0.6b'", workflow)
        self.assertNotIn("$model = 'qwen3:1.7b'", workflow)
        self.assertNotIn("$model = 'qwen2.5:1.5b'", workflow)
        self.assertNotIn("$model = 'qwen2.5-coder:1.5b'", workflow)
        self.assertEqual(config['model'], 'qwen3:0.6b')


if __name__ == '__main__':
    unittest.main()
