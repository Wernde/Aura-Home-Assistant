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
        (self.root / '.gitignore').write_text('builder/runs/\n', encoding='utf-8')
        subprocess.run(['git', 'add', 'AGENTS.md', '.gitignore'], cwd=self.root, check=True)
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

    def test_write_file_creates_but_never_overwrites(self):
        created = json.loads(builder.write_file('new.js', 'const safe = true;\n'))
        self.assertTrue(created['ok'])
        refused = json.loads(builder.write_file('new.js', 'const damaged = true;\n'))
        self.assertEqual(refused['error'], 'file_exists_use_replace_text')
        self.assertIn('safe', (self.root / 'new.js').read_text(encoding='utf-8'))

    def test_read_file_uses_bounded_line_ranges(self):
        target = self.root / 'large.js'
        target.write_text(''.join(f'line {number}\n' for number in range(1, 301)), encoding='utf-8')
        first = builder.read_file('large.js')
        self.assertIn('Showing lines 1-220 of 300', first)
        self.assertNotIn('line 221\n', first)
        later = builder.read_file('large.js', 221, 300)
        self.assertIn('line 300', later)
        invalid = json.loads(builder.read_file('large.js', 1, 300))
        self.assertEqual(invalid['error'], 'invalid_line_range')

    def test_read_file_bounds_long_lines_for_the_model_context(self):
        (self.root / 'wide.js').write_text('const value = "' + ('x' * 20_000) + '";\n', encoding='utf-8')
        content = builder.read_file('wide.js')
        self.assertIn('bounded excerpt', content)
        self.assertLess(len(content), 10_000)

    def test_file_discovery_excludes_generated_directories(self):
        (self.root / 'builder' / '__pycache__').mkdir(parents=True)
        (self.root / 'builder' / '__pycache__' / 'cache.pyc').write_bytes(b'x')
        (self.root / 'builder' / 'runs').mkdir(parents=True)
        (self.root / 'builder' / 'runs' / 'latest.md').write_text('old', encoding='utf-8')
        files = json.loads(builder.list_files())
        self.assertFalse(any('__pycache__' in path or 'builder/runs' in path for path in files))


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

    def test_invalid_decision_format_gets_one_retry(self):
        with mock.patch.object(builder, 'ask_text_agent', side_effect=[
            'Looks good but I forgot the token.',
            'DECISION: PASS\nEvidence reviewed.',
        ]) as ask:
            result = builder.ask_decision_agent(
                'http://localhost:11434', 'tiny', 'Reviewer', 'Review this.', {'PASS', 'BLOCKED'}
            )
        self.assertEqual(builder.parse_decision(result, {'PASS', 'BLOCKED'}), 'PASS')
        self.assertEqual(ask.call_count, 2)


class AgentLoopTests(unittest.TestCase):
    def test_tool_argument_parser_handles_non_object_values(self):
        self.assertEqual(builder.parse_tool_arguments('{"path":"app.js"}'), {'path': 'app.js'})
        invalid = builder.parse_tool_arguments(['app.js'])
        self.assertIn('_invalid_arguments', invalid)

    def test_text_agent_labels_malformed_ollama_response_with_role(self):
        with mock.patch.object(builder, 'ollama_chat', return_value={'unexpected': True}), \
             self.assertRaises(builder.AgentRuntimeError) as raised:
            builder.ask_text_agent('http://localhost:11434', 'tiny', 'Planner', 'Plan it.')
        self.assertEqual(raised.exception.role, 'Planner')

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
    def test_model_text_is_bounded_but_keeps_both_ends(self):
        text = 'START' + ('x' * 20_000) + 'END'
        bounded = builder.truncate_for_model(text, 1_000)
        self.assertLessEqual(len(bounded), 1_000)
        self.assertTrue(bounded.startswith('START'))
        self.assertTrue(bounded.endswith('END'))

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

    def test_patch_evidence_preserves_a_proposed_diff(self):
        original_root = builder.ROOT
        with tempfile.TemporaryDirectory() as tempdir:
            builder.ROOT = Path(tempdir)
            try:
                patch = builder.write_patch_evidence('diff --git a/app.js b/app.js\n')
                content = patch.read_text(encoding='utf-8')
            finally:
                builder.ROOT = original_root
        self.assertIn('diff --git', content)

    def test_model_test_summary_keeps_failures_without_full_success_output(self):
        result = {'ok': False, 'results': [
            {'command': ['ok'], 'ok': True, 'returncode': 0, 'duration_s': 1, 'stdout': 'x' * 5000, 'stderr': ''},
            {'command': ['bad'], 'ok': False, 'returncode': 1, 'duration_s': 2, 'stdout': 'failed', 'stderr': 'broken'},
        ]}
        summary = builder.check_summary(result)
        self.assertNotIn('stdout', summary['results'][0])
        self.assertEqual(summary['results'][1]['stderr'], 'broken')


class WorkflowConfigurationTests(unittest.TestCase):
    def test_dell_runner_uses_tool_native_small_model(self):
        workflow = (REPOSITORY_ROOT / '.github' / 'workflows' / 'aura-builder-agents.yml').read_text(encoding='utf-8')
        config = json.loads((REPOSITORY_ROOT / 'builder' / 'config.example.json').read_text(encoding='utf-8'))
        self.assertIn("$model = 'qwen3:0.6b'", workflow)
        self.assertNotIn("$model = 'qwen3:1.7b'", workflow)
        self.assertNotIn("$model = 'qwen2.5:1.5b'", workflow)
        self.assertNotIn("$model = 'qwen2.5-coder:1.5b'", workflow)
        self.assertEqual(config['model'], 'qwen3:0.6b')
        self.assertIn('actions/checkout@v7', workflow)
        self.assertIn('actions/upload-artifact@v7', workflow)
        self.assertIn('ConvertFrom-Json', workflow)
        self.assertNotIn("-replace 'qwen3:1.7b'", workflow)
        self.assertIn('path: builder/runs/', workflow)
        self.assertIn('builder/run-requests/aura-builder.json', workflow)
        self.assertIn('$env:AURA_TASK_FILE', workflow)
        self.assertIn("env.AURA_AUTO_COMMIT == 'true'", workflow)


class PipelineIntegrationTests(RepositoryTestCase):
    def test_successful_pipeline_writes_report_and_patch_without_auto_commit(self):
        (self.root / 'builder' / 'tasks').mkdir(parents=True)
        task = self.root / 'builder' / 'tasks' / 'task.md'
        task.write_text('# Test task\nMake a safe change.\n', encoding='utf-8')
        config = self.root / 'builder' / 'config.json'
        config.write_text(json.dumps({'model': 'tiny', 'test_commands': [['ok']]}), encoding='utf-8')
        subprocess.run(['git', 'add', '.'], cwd=self.root, check=True)
        subprocess.run(['git', 'commit', '-qm', 'pipeline fixture'], cwd=self.root, check=True)

        agent_results = [
            {'summary': 'Scout evidence.', 'tool_calls': [{'tool': 'read_file'}], 'changed': False},
            {'summary': 'Implemented safely.', 'tool_calls': [{'tool': 'replace_text'}], 'changed': True},
            {'summary': 'No blueprint change required.', 'tool_calls': [], 'changed': False},
        ]
        argv = [
            'aura_builder.py', '--task-file', 'builder/tasks/task.md', '--config', str(config),
        ]
        with mock.patch.object(sys, 'argv', argv), \
             mock.patch.object(builder, 'preflight_native_tools', return_value={'ok': True, 'tool_calls': []}), \
             mock.patch.object(builder, 'run_tool_agent', side_effect=agent_results), \
             mock.patch.object(builder, 'ask_text_agent', side_effect=['UX advice.', 'Plan.', 'Manager report.']), \
             mock.patch.object(builder, 'ask_decision_agent', side_effect=[
                 'DECISION: PASS', 'DECISION: PASS', 'DECISION: READY',
             ]), \
             mock.patch.object(builder, 'run_checks', return_value={'ok': True, 'results': []}), \
             mock.patch.object(builder, 'git_diff', side_effect=['', 'diff --git a/app.js b/app.js\n', 'diff --git a/app.js b/app.js\n', 'diff --git a/app.js b/app.js\n']):
            result = builder.main()

        report = (self.root / 'builder' / 'runs' / 'latest.md').read_text(encoding='utf-8')
        patch = (self.root / 'builder' / 'runs' / 'latest.patch').read_text(encoding='utf-8')
        self.assertEqual(result, 0)
        self.assertIn('DECISION: READY', report)
        self.assertIn('diff --git', patch)
        self.assertEqual(subprocess.run(['git', 'status', '--short'], cwd=self.root, text=True, capture_output=True).stdout, '')


if __name__ == '__main__':
    unittest.main()
