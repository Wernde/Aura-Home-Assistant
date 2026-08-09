
#!/usr/bin/env python3
"""Local-first multi-agent development runner for AURA.

Uses Ollama on the local machine. No paid API is required. The runner deliberately
keeps deployment, secrets and destructive operations outside the model's tool set.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
from typing import Any

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / 'builder' / 'config.json'
BLOCKED_NAMES = {'.git', '.env', '.env.local', 'ha-token.txt', 'secrets.json'}
MAX_FILE_BYTES = 250_000


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding='utf-8'))


def safe_path(raw: str) -> Path:
    candidate = (ROOT / raw).resolve()
    if candidate != ROOT and ROOT not in candidate.parents:
        raise ValueError('Path escapes repository root')
    if any(part in BLOCKED_NAMES for part in candidate.relative_to(ROOT).parts):
        raise ValueError('Path is protected')
    return candidate


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(['git', '-C', str(ROOT), *args], text=True, capture_output=True, check=check)


def ensure_clean(allow_dirty: bool) -> None:
    status = git('status', '--short').stdout.rstrip()
    if status and not allow_dirty:
        raise RuntimeError(
            'Working tree is not clean. Commit or stash changes, or set allow_dirty=true.\n'
            'Dirty paths reported by git status --short:\n'
            + status
        )


def read_file(path: str) -> str:
    file_path = safe_path(path)
    if not file_path.exists() or not file_path.is_file():
        return json.dumps({'error': 'file_not_found', 'path': path})
    if file_path.stat().st_size > MAX_FILE_BYTES:
        return json.dumps({'error': 'file_too_large', 'path': path})
    return file_path.read_text(encoding='utf-8', errors='replace')


def write_file(path: str, content: str) -> str:
    file_path = safe_path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding='utf-8')
    return json.dumps({'ok': True, 'path': str(file_path.relative_to(ROOT)), 'bytes': len(content.encode('utf-8'))})


def list_files(prefix: str = '') -> str:
    if prefix.strip().lower() in {'<nil>', 'nil', 'null', 'none'}:
        prefix = ''
    base = safe_path(prefix or '.')
    if not base.exists():
        return json.dumps({'error': 'path_not_found', 'path': prefix})
    results: list[str] = []
    for item in base.rglob('*'):
        if not item.is_file():
            continue
        rel = item.relative_to(ROOT)
        if any(part in BLOCKED_NAMES for part in rel.parts):
            continue
        if len(results) >= 300:
            break
        results.append(str(rel))
    return json.dumps(results, indent=2)


def search_text(query: str, prefix: str = '') -> str:
    if not query.strip():
        return json.dumps({'error': 'empty_query'})
    if prefix.strip().lower() in {'<nil>', 'nil', 'null', 'none'}:
        prefix = ''
    base = safe_path(prefix or '.')
    matches: list[dict[str, Any]] = []
    for item in base.rglob('*'):
        if not item.is_file() or item.stat().st_size > MAX_FILE_BYTES:
            continue
        rel = item.relative_to(ROOT)
        if any(part in BLOCKED_NAMES for part in rel.parts):
            continue
        try:
            lines = item.read_text(encoding='utf-8', errors='replace').splitlines()
        except OSError:
            continue
        for idx, line in enumerate(lines, start=1):
            if query.lower() in line.lower():
                matches.append({'path': str(rel), 'line': idx, 'text': line[:500]})
                if len(matches) >= 100:
                    return json.dumps(matches, indent=2)
    return json.dumps(matches, indent=2)


def git_diff() -> str:
    return git('diff', '--', '.').stdout[-60_000:]


def run_checks(commands: list[list[str]]) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    all_ok = True
    for command in commands:
        started = time.time()
        proc = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=180)
        ok = proc.returncode == 0
        all_ok = all_ok and ok
        results.append({
            'command': command,
            'ok': ok,
            'returncode': proc.returncode,
            'duration_s': round(time.time() - started, 2),
            'stdout': proc.stdout[-12_000:],
            'stderr': proc.stderr[-12_000:],
        })
    return {'ok': all_ok, 'results': results}


def ollama_chat(base_url: str, model: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        'model': model,
        'messages': messages,
        'stream': False,
        'options': {
            'num_ctx': 4096,
            'num_predict': 768,
            'temperature': 0.2,
        },
    }
    if tools:
        payload['tools'] = tools
    request = urllib.request.Request(
        base_url.rstrip('/') + '/api/chat',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.loads(response.read().decode('utf-8'))


TOOLS = [
    {'type': 'function', 'function': {'name': 'list_files', 'description': 'List repository files below a safe relative prefix.', 'parameters': {'type': 'object', 'properties': {'prefix': {'type': 'string'}}, 'required': []}}},
    {'type': 'function', 'function': {'name': 'read_file', 'description': 'Read a UTF-8 repository file.', 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}}, 'required': ['path']}}},
    {'type': 'function', 'function': {'name': 'search_text', 'description': 'Search text in repository files.', 'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}, 'prefix': {'type': 'string'}}, 'required': ['query']}}},
    {'type': 'function', 'function': {'name': 'write_file', 'description': 'Write a complete UTF-8 file inside the repository. Never write secrets.', 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}, 'content': {'type': 'string'}}, 'required': ['path', 'content']}}},
    {'type': 'function', 'function': {'name': 'git_diff', 'description': 'Inspect the current uncommitted diff.', 'parameters': {'type': 'object', 'properties': {}, 'required': []}}},
]


def call_tool(name: str, args: dict[str, Any]) -> str:
    if name == 'list_files':
        return list_files(str(args.get('prefix', '')))
    if name == 'read_file':
        return read_file(str(args['path']))
    if name == 'search_text':
        return search_text(str(args['query']), str(args.get('prefix', '')))
    if name == 'write_file':
        return write_file(str(args['path']), str(args['content']))
    if name == 'git_diff':
        return git_diff()
    return json.dumps({'error': 'unknown_tool', 'name': name})


def run_tool_agent(base_url: str, model: str, role: str, task: str, task_source: str, max_turns: int = 24) -> str:
    system = (
        f'You are the AURA {role} agent. Work only inside this repository. Read AGENTS.md first and obey it. '
        'AURA is local-first and must keep working without paid APIs. Never request, expose or write secrets. '
        'Do not weaken privacy or real-world action confirmation. Use tools to inspect the repository before editing. '
        'Keep changes focused, preserve working features, and use Australian English. '
        f'The product task below was loaded from {task_source}; its title/version is not a filename to find. '
        'Mandatory workflow: call list_files, read AGENTS.md and relevant implementation files, then use write_file '
        'to make focused changes. Do not finish with advice or ask the user to provide files already in the repository. '
        'The original product task overrides planner notes if they conflict. '
        'When finished, return a concise summary, risks and checks that should run.'
    )
    messages: list[dict[str, Any]] = [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': task},
    ]
    final = ''
    premature_finishes = 0
    for _ in range(max_turns):
        response = ollama_chat(base_url, model, messages, TOOLS)
        message = response.get('message', {})
        messages.append(message)
        tool_calls = message.get('tool_calls') or []
        if not tool_calls:
            final = str(message.get('content', '')).strip()
            if git_diff().strip():
                break
            premature_finishes += 1
            if premature_finishes >= 3:
                break
            messages.append({
                'role': 'user',
                'content': (
                    'No repository changes exist yet, so implementation is not complete. '
                    'The task is already supplied below and its version is not a filename. '
                    'Now call list_files, read AGENTS.md and the relevant source files, then call write_file '
                    'with the required focused implementation. Do not respond with advice.\n\n'
                    'ORIGINAL PRODUCT TASK:\n' + task
                ),
            })
            continue
        for call in tool_calls:
            fn = call.get('function', {})
            name = str(fn.get('name', ''))
            args = fn.get('arguments') or {}
            try:
                result = call_tool(name, args)
            except Exception as exc:  # local error reported back to agent
                result = json.dumps({'error': type(exc).__name__, 'message': str(exc)})
            messages.append({'role': 'tool', 'tool_name': name, 'content': result})
    return final or 'Agent ended without a final response.'


def ask_text_agent(base_url: str, model: str, role: str, content: str) -> str:
    response = ollama_chat(base_url, model, [
        {'role': 'system', 'content': f'You are the AURA {role} agent. Obey AGENTS.md principles: local-first, no paid APIs, safe confirmed actions, preserve the living visual, Australian English.'},
        {'role': 'user', 'content': content},
    ])
    return str(response.get('message', {}).get('content', '')).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--task', help='Task text')
    parser.add_argument('--task-file', help='Path to a task markdown file')
    parser.add_argument('--config', default=str(DEFAULT_CONFIG))
    parser.add_argument('--auto-commit', action='store_true')
    parser.add_argument('--allow-dirty', action='store_true')
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f'Missing {config_path}. Copy builder/config.example.json to builder/config.json.', file=sys.stderr)
        return 2
    config = load_json(config_path)
    task = args.task or ''
    task_source = 'the --task command-line argument'
    if args.task_file:
        task_path = safe_path(args.task_file)
        task = task_path.read_text(encoding='utf-8')
        task_source = str(task_path.relative_to(ROOT))
    if not task.strip():
        print('Provide --task or --task-file.', file=sys.stderr)
        return 2

    ensure_clean(args.allow_dirty or bool(config.get('allow_dirty', False)))
    base_url = str(config.get('ollama_url', 'http://127.0.0.1:11434'))
    model = str(config.get('model', 'qwen3-coder:30b'))
    checks = config.get('test_commands') or [['python3', '-m', 'http.server', '--help']]

    print('AURA Builder: planning…')
    plan = ask_text_agent(base_url, model, 'Planner', 'Read this product task and produce a focused implementation plan with acceptance checks. Do not edit files.\n\n' + task)
    print(plan)

    print('\nAURA Builder: implementing…')
    implementation = run_tool_agent(
        base_url,
        model,
        'Implementer',
        task + '\n\nPlanner notes (advisory only; ignore any conflict with the task):\n' + plan,
        task_source,
    )
    print(implementation)

    diff = git_diff()
    if not diff.strip():
        print('No file changes were produced. Verifying the existing implementation instead.')
        check_result = run_checks(checks)
        print(json.dumps(check_result, indent=2))
        report_dir = ROOT / 'builder' / 'runs'
        report_dir.mkdir(parents=True, exist_ok=True)
        report = report_dir / 'latest.md'
        report.write_text(
            '# AURA Builder latest run\n\n## Task\n\n' + task
            + '\n\n## Plan\n\n' + plan
            + '\n\n## Implementation\n\n' + implementation
            + '\n\n## Result\n\nNo repository changes were needed; the existing implementation was verified.\n'
            + '\n## Tests\n\n```json\n' + json.dumps(check_result, indent=2) + '\n```\n',
            encoding='utf-8',
        )
        if not check_result['ok']:
            print(f'Existing implementation checks failed. Review {report.relative_to(ROOT)}.', file=sys.stderr)
            return 4
        if args.auto_commit:
            git('add', '--all')
            git('commit', '-m', 'AURA builder: verify ' + task.splitlines()[0][:65])
            print('Committed the verified builder report locally.')
        print('Existing implementation checks passed.')
        return 0

    print('\nAURA Builder: reviewing…')
    review = ask_text_agent(base_url, model, 'Reviewer', 'Review this git diff against the task and AURA safety rules. Identify regressions or missing requirements.\n\nTASK:\n' + task + '\n\nDIFF:\n' + diff)
    print(review)

    if 'BLOCKER' in review.upper() or 'MUST FIX' in review.upper():
        print('\nAURA Builder: applying reviewer fixes…')
        fix = run_tool_agent(
            base_url,
            model,
            'Implementer',
            task + '\n\nReviewer feedback that must be resolved:\n' + review,
            task_source,
        )
        print(fix)

    print('\nAURA Builder: testing…')
    check_result = run_checks(checks)
    print(json.dumps(check_result, indent=2))

    final_diff = git_diff()
    release = ask_text_agent(base_url, model, 'Release Reviewer', 'Write a release decision from this task, diff and test result. Say READY only if the checks passed and there are no obvious safety regressions.\n\nTASK:\n' + task + '\n\nDIFF:\n' + final_diff + '\n\nTESTS:\n' + json.dumps(check_result))
    print('\nAURA Builder: release review…')
    print(release)

    report_dir = ROOT / 'builder' / 'runs'
    report_dir.mkdir(parents=True, exist_ok=True)
    report = report_dir / 'latest.md'
    report.write_text('# AURA Builder latest run\n\n## Task\n\n' + task + '\n\n## Plan\n\n' + plan + '\n\n## Implementation\n\n' + implementation + '\n\n## Review\n\n' + review + '\n\n## Tests\n\n```json\n' + json.dumps(check_result, indent=2) + '\n```\n\n## Release review\n\n' + release + '\n', encoding='utf-8')

    if not check_result['ok'] or 'READY' not in release.upper():
        print(f'Not committing. Review {report.relative_to(ROOT)}.', file=sys.stderr)
        return 4

    if args.auto_commit:
        git('add', '--all')
        git('commit', '-m', 'AURA builder: ' + task.splitlines()[0][:72])
        print('Committed the approved agent changes locally. Production deployment still requires the separate release step.')
    else:
        print('Changes are ready for human review. Re-run with --auto-commit to commit after tests pass.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

