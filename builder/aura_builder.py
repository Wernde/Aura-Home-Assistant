
#!/usr/bin/env python3
"""Local-first multi-agent development runner for AURA.

Uses Ollama on the local machine. No paid API is required. The runner deliberately
keeps deployment, secrets and destructive operations outside the model's tool set.
"""
from __future__ import annotations

import argparse
import difflib
import json
from pathlib import Path
import re
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
IGNORED_DIRECTORY_NAMES = {'__pycache__', '.pytest_cache', 'node_modules', 'runs'}
MAX_FILE_BYTES = 250_000
MAX_READ_LINES = 220
MAX_MODEL_TEXT_CHARS = 9_000
OLLAMA_TIMEOUT_SECONDS = 180
PREFLIGHT_TIMEOUT_SECONDS = 90
TOOL_AGENT_NUM_PREDICT = 384


class AgentRuntimeError(RuntimeError):
    def __init__(self, role: str, cause: Exception, tool_audit: list[dict[str, Any]]):
        super().__init__(f'{role} failed: {type(cause).__name__}: {cause}')
        self.role = role
        self.cause_type = type(cause).__name__
        self.tool_audit = tool_audit


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding='utf-8'))


def safe_path(raw: str) -> Path:
    root = ROOT.resolve()
    candidate = (root / raw).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError('Path escapes repository root')
    if any(part.lower() in BLOCKED_NAMES for part in candidate.relative_to(root).parts):
        raise ValueError('Path is protected')
    return candidate


def repo_relative(path: Path) -> Path:
    """Return a repository path after normalising Windows long/short aliases."""
    return path.resolve().relative_to(ROOT.resolve())


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


def read_file(path: str, start_line: int = 1, end_line: int | None = None) -> str:
    file_path = safe_path(path)
    if not file_path.exists() or not file_path.is_file():
        return json.dumps({'error': 'file_not_found', 'path': path})
    if file_path.stat().st_size > MAX_FILE_BYTES:
        return json.dumps({'error': 'file_too_large', 'path': path})
    lines = file_path.read_text(encoding='utf-8', errors='replace').splitlines(keepends=True)
    total = len(lines)
    if total == 0:
        return ''
    if start_line < 1:
        return json.dumps({'error': 'invalid_line_range', 'path': path})
    if end_line is None:
        end_line = min(total, start_line + MAX_READ_LINES - 1)
    if end_line < start_line or end_line - start_line + 1 > MAX_READ_LINES:
        return json.dumps({
            'error': 'invalid_line_range',
            'path': path,
            'maximum_lines': MAX_READ_LINES,
        })
    content = ''.join(lines[start_line - 1:end_line])
    if len(content) > MAX_MODEL_TEXT_CHARS:
        return (
            f'[Showing a bounded excerpt from lines {start_line}-{min(end_line, total)} of {total} from {path}. '
            'Use search_text or request a narrower line range for an exact edit.]\n'
            + truncate_for_model(content)
        )
    if start_line == 1 and end_line >= total:
        return content
    return (
        f'[Showing lines {start_line}-{min(end_line, total)} of {total} from {path}. '
        'Request another range if needed.]\n' + content
    )


def write_file(path: str, content: str) -> str:
    if len(content.encode('utf-8')) > MAX_FILE_BYTES:
        return json.dumps({'error': 'file_too_large', 'path': path})
    file_path = safe_path(path)
    if file_path.exists():
        return json.dumps({'error': 'file_exists_use_replace_text', 'path': path})
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding='utf-8')
    return json.dumps({'ok': True, 'path': str(repo_relative(file_path)), 'bytes': len(content.encode('utf-8'))})


def replace_text(path: str, old: str, new: str) -> str:
    """Apply one small, preconditioned edit instead of rewriting a whole file."""
    file_path = safe_path(path)
    if not file_path.exists() or not file_path.is_file():
        return json.dumps({'error': 'file_not_found', 'path': path})
    content = file_path.read_text(encoding='utf-8', errors='replace')
    occurrences = content.count(old)
    if occurrences != 1:
        return json.dumps({
            'error': 'precondition_failed',
            'path': path,
            'expected_occurrences': 1,
            'actual_occurrences': occurrences,
        })
    updated = content.replace(old, new, 1)
    if len(updated.encode('utf-8')) > MAX_FILE_BYTES:
        return json.dumps({'error': 'file_too_large', 'path': path})
    file_path.write_text(updated, encoding='utf-8')
    return json.dumps({'ok': True, 'path': path, 'replacements': 1})


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
        rel = repo_relative(item)
        if any(part.lower() in BLOCKED_NAMES | IGNORED_DIRECTORY_NAMES for part in rel.parts):
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
        rel = repo_relative(item)
        if any(part.lower() in BLOCKED_NAMES | IGNORED_DIRECTORY_NAMES for part in rel.parts):
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


def changed_paths() -> list[str]:
    paths: list[str] = []
    for line in git('status', '--porcelain=v1', '--untracked-files=all').stdout.splitlines():
        path = line[3:].strip()
        if ' -> ' in path:
            path = path.split(' -> ', 1)[1]
        if path:
            paths.append(path.strip('"'))
    return paths


def git_diff() -> str:
    """Return tracked and untracked changes so new files count as implementation."""
    diff = git('diff', '--no-ext-diff', '--', '.').stdout
    status = git('status', '--porcelain=v1', '--untracked-files=all').stdout.splitlines()
    for line in status:
        if not line.startswith('?? '):
            continue
        rel = line[3:].strip().strip('"')
        try:
            file_path = safe_path(rel)
            if not file_path.is_file() or file_path.stat().st_size > MAX_FILE_BYTES:
                continue
            content = file_path.read_text(encoding='utf-8', errors='replace').splitlines(keepends=True)
        except (OSError, ValueError):
            continue
        diff += ''.join(difflib.unified_diff([], content, fromfile='/dev/null', tofile='b/' + rel))
    return diff


def committed_diff(paths: list[str]) -> str:
    """Return the latest committed diff, restricted to task-named files."""
    if not paths:
        raise ValueError('Review mode requires at least one existing path named in the task.')
    return git('show', '--format=', '--no-ext-diff', 'HEAD', '--', *paths).stdout


def truncate_for_model(text: str, limit: int = MAX_MODEL_TEXT_CHARS) -> str:
    if len(text) <= limit:
        return text
    half = (limit - 120) // 2
    return text[:half] + '\n\n[...middle omitted to fit local model context...]\n\n' + text[-half:]


def check_summary(result: dict[str, Any]) -> dict[str, Any]:
    """Keep model-facing test evidence small while retaining every failure."""
    summary: list[dict[str, Any]] = []
    for item in result.get('results', []):
        evidence = {
            'command': item.get('command'),
            'ok': item.get('ok'),
            'returncode': item.get('returncode'),
            'duration_s': item.get('duration_s'),
        }
        if not item.get('ok'):
            evidence['stdout'] = str(item.get('stdout', ''))[-1_000:]
            evidence['stderr'] = str(item.get('stderr', ''))[-1_000:]
        summary.append(evidence)
    return {'ok': bool(result.get('ok')), 'results': summary}


def run_checks(commands: list[list[str]]) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    all_ok = True
    for command in commands:
        started = time.time()
        try:
            proc = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=180)
            returncode = proc.returncode
            stdout = proc.stdout
            stderr = proc.stderr
        except subprocess.TimeoutExpired as exc:
            returncode = 124
            stdout = str(exc.stdout or '')
            stderr = str(exc.stderr or '') + '\nCommand timed out after 180 seconds.'
        ok = returncode == 0
        all_ok = all_ok and ok
        results.append({
            'command': command,
            'ok': ok,
            'returncode': returncode,
            'duration_s': round(time.time() - started, 2),
            'stdout': stdout[-12_000:],
            'stderr': stderr[-12_000:],
        })
    return {'ok': all_ok, 'results': results}


def ollama_chat(
    base_url: str,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    num_predict: int = 512,
    timeout_seconds: int = OLLAMA_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        'model': model,
        'messages': messages,
        'stream': False,
        'think': False,
        'options': {
            'num_ctx': 4096,
            'num_predict': num_predict,
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
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        return json.loads(response.read().decode('utf-8'))


TOOLS = [
    {'type': 'function', 'function': {'name': 'list_files', 'description': 'List repository files below a safe relative prefix.', 'parameters': {'type': 'object', 'properties': {'prefix': {'type': 'string'}}, 'required': []}}},
    {'type': 'function', 'function': {'name': 'read_file', 'description': 'Read up to 220 lines from a UTF-8 repository file. Use start_line and end_line to inspect another range.', 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}, 'start_line': {'type': 'integer'}, 'end_line': {'type': 'integer'}}, 'required': ['path']}}},
    {'type': 'function', 'function': {'name': 'search_text', 'description': 'Search text in repository files.', 'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}, 'prefix': {'type': 'string'}}, 'required': ['query']}}},
    {'type': 'function', 'function': {'name': 'write_file', 'description': 'Create a new UTF-8 file inside the repository. It refuses to overwrite existing files. Never write secrets.', 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}, 'content': {'type': 'string'}}, 'required': ['path', 'content']}}},
    {'type': 'function', 'function': {'name': 'replace_text', 'description': 'Replace one exact text block in an existing UTF-8 file. Prefer this for small edits.', 'parameters': {'type': 'object', 'properties': {'path': {'type': 'string'}, 'old': {'type': 'string'}, 'new': {'type': 'string'}}, 'required': ['path', 'old', 'new']}}},
    {'type': 'function', 'function': {'name': 'git_diff', 'description': 'Inspect the current uncommitted diff.', 'parameters': {'type': 'object', 'properties': {}, 'required': []}}},
]
READ_ONLY_TOOLS = [tool for tool in TOOLS if tool['function']['name'] in {'list_files', 'read_file', 'search_text', 'git_diff'}]
FOCUSED_READ_ONLY_TOOLS = [tool for tool in TOOLS if tool['function']['name'] in {'read_file', 'git_diff'}]
EDIT_TOOLS = [tool for tool in TOOLS if tool['function']['name'] in {'read_file', 'replace_text', 'write_file', 'git_diff'}]
LIST_FILES_TOOL = [tool for tool in TOOLS if tool['function']['name'] == 'list_files']


def parse_tool_arguments(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            return {'_invalid_arguments': f'Invalid JSON: {exc}'}
    if not isinstance(raw, dict):
        return {'_invalid_arguments': f'Expected an object, received {type(raw).__name__}'}
    return raw


def response_message(response: Any) -> dict[str, Any]:
    if not isinstance(response, dict) or not isinstance(response.get('message'), dict):
        raise ValueError('Ollama response did not contain a structured message object')
    return response['message']


def task_file_hints(task: str) -> list[str]:
    """Extract exact existing repository paths named in a focused task."""
    hints: list[str] = []
    for raw in re.findall(r'`([^`\r\n]+)`', task):
        if raw in hints or not Path(raw).suffix:
            continue
        try:
            candidate = safe_path(raw)
        except ValueError:
            continue
        if candidate.is_file():
            hints.append(raw)
    return hints[:8]


def call_tool(name: str, args: dict[str, Any]) -> str:
    if name == 'list_files':
        return list_files(str(args.get('prefix', '')))
    if name == 'read_file':
        start_line = int(args.get('start_line', 1))
        end_line = int(args['end_line']) if args.get('end_line') is not None else None
        return read_file(str(args['path']), start_line, end_line)
    if name == 'search_text':
        return search_text(str(args['query']), str(args.get('prefix', '')))
    if name == 'write_file':
        return write_file(str(args['path']), str(args['content']))
    if name == 'replace_text':
        return replace_text(str(args['path']), str(args['old']), str(args['new']))
    if name == 'git_diff':
        return truncate_for_model(git_diff())
    return json.dumps({'error': 'unknown_tool', 'name': name})


def audit_tool_result(name: str, result: str) -> dict[str, Any]:
    """Record evidence without copying repository content into the run report."""
    summary: dict[str, Any] = {'characters': len(result)}
    try:
        parsed = json.loads(result)
    except json.JSONDecodeError:
        return summary
    if isinstance(parsed, dict):
        summary['ok'] = bool(parsed.get('ok')) and 'error' not in parsed
        if 'error' in parsed:
            summary['error'] = str(parsed['error'])
        for key in ('path', 'bytes', 'replacements'):
            if key in parsed:
                summary[key] = parsed[key]
    elif isinstance(parsed, list):
        summary['ok'] = True
        summary['items'] = len(parsed)
    return summary


def preflight_native_tools(base_url: str, model: str) -> dict[str, Any]:
    """Fail quickly unless the configured model makes a real native tool call."""
    started = time.time()
    audit: list[dict[str, Any]] = []
    try:
        response = ollama_chat(
            base_url,
            model,
            [
                {
                    'role': 'system',
                    'content': (
                        'You are the AURA Builder preflight. Invoke the supplied list_files function natively. '
                        'Do not print JSON, explain the call or answer in normal text.'
                    ),
                },
                {'role': 'user', 'content': 'Invoke list_files. Set prefix to exactly: builder'},
            ],
            LIST_FILES_TOOL,
            num_predict=64,
            timeout_seconds=PREFLIGHT_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        return {
            'ok': False,
            'duration_s': round(time.time() - started, 2),
            'tool_calls': audit,
            'error': {'type': type(exc).__name__, 'message': str(exc)},
        }

    try:
        message = response_message(response)
    except ValueError as exc:
        return {
            'ok': False,
            'duration_s': round(time.time() - started, 2),
            'tool_calls': audit,
            'error': {'type': type(exc).__name__, 'message': str(exc)},
        }
    for call in message.get('tool_calls') or []:
        fn = call.get('function', {})
        name = str(fn.get('name', ''))
        args = parse_tool_arguments(fn.get('arguments'))
        try:
            if '_invalid_arguments' in args:
                raise ValueError('Invalid JSON tool arguments: ' + args['_invalid_arguments'])
            if name != 'list_files':
                raise ValueError(f'Unexpected preflight tool: {name}')
            result = call_tool(name, args)
        except Exception as exc:
            result = json.dumps({'error': type(exc).__name__, 'message': str(exc)})
        audit.append({
            'tool': name,
            'argument_names': sorted(str(key) for key in args),
            'result': audit_tool_result(name, result),
        })

    # A native call with invented arguments predicts the same failure in later
    # roles, so require both the structured call and a successful tool result.
    valid = any(item['tool'] == 'list_files' and item['result'].get('ok') for item in audit)
    return {
        'ok': valid,
        'duration_s': round(time.time() - started, 2),
        'tool_calls': audit,
        'error': None if valid else {
            'type': 'NativeToolPreflightFailed',
            'message': 'Model returned no valid native list_files call.',
        },
    }


def run_tool_agent(
    base_url: str,
    model: str,
    role: str,
    task: str,
    task_source: str,
    *,
    tools: list[dict[str, Any]] = TOOLS,
    require_changes: bool = True,
    max_turns: int = 24,
) -> dict[str, Any]:
    repository_index = list_files()
    repository_rules = read_file('AGENTS.md')
    exact_paths = task_file_hints(task)
    exact_path_text = ', '.join(exact_paths) or 'No additional task paths were named.'
    system = (
        f'You are the AURA {role} agent. Work only inside this repository. Read AGENTS.md first and obey it. '
        'AURA is local-first and must keep working without paid APIs. Never request, expose or write secrets. '
        'Do not weaken privacy or real-world action confirmation. Use tools to inspect the repository before editing. '
        'Keep changes focused, preserve working features, and use Australian English. '
        f'The product task below was loaded from {task_source}; its title/version is not a filename to find. '
        'The real repository index and AGENTS.md rules are supplied below. Use exact paths from the index. '
        f'Exact existing paths named by this task are: {exact_path_text}. Never omit their extensions. '
        'Call read_file on relevant implementation files before editing. Invoke supplied function tools natively; '
        'never print, describe or wrap a pretend JSON tool call in normal text. '
        + ('Then use replace_text or write_file to make focused changes. ' if require_changes else '')
        + 'Do not ask the user to provide files already in the repository. '
        'The user has authorised this repository task: do not ask whether to proceed. '
        'The original product task overrides planner notes if they conflict. '
        'When finished, return a concise summary, risks and checks that should run.\n\n'
        'REPOSITORY INDEX:\n' + repository_index + '\n\nAGENTS.MD:\n' + repository_rules
    )
    messages: list[dict[str, Any]] = [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': (
            (f'FIRST REQUIRED ACTION: invoke read_file natively for {exact_paths[0]}. ' if exact_paths and role in {'Codebase Scout', 'Implementer', 'Fixer'} else '')
            + 'Do not call list_files or search_text for a path already named below.\n\n' + task
        )},
    ]
    final = ''
    premature_finishes = 0
    tool_audit: list[dict[str, Any]] = []
    baseline = git_diff()
    for _ in range(max_turns):
        try:
            response = ollama_chat(base_url, model, messages, tools, num_predict=TOOL_AGENT_NUM_PREDICT)
        except Exception as exc:
            raise AgentRuntimeError(role, exc, tool_audit) from exc
        try:
            message = response_message(response)
        except ValueError as exc:
            raise AgentRuntimeError(role, exc, tool_audit) from exc
        messages.append(message)
        tool_calls = message.get('tool_calls') or []
        if not tool_calls:
            final = str(message.get('content', '')).strip()
            if not require_changes or git_diff() != baseline:
                break
            premature_finishes += 1
            if premature_finishes >= 3:
                break
            messages.append({
                'role': 'user',
                'content': (
                    'No repository changes exist yet, so implementation is not complete. '
                    'The task is already supplied below and its version is not a filename. '
                    'Use exact paths from the supplied repository index. Now invoke read_file natively for relevant source '
                    'files, then invoke replace_text or write_file to implement the task. Do not print JSON, describe a '
                    'future tool call or respond with advice.\n\n'
                    'ORIGINAL PRODUCT TASK:\n' + task
                ),
            })
            continue
        for call in tool_calls:
            fn = call.get('function', {})
            name = str(fn.get('name', ''))
            args = parse_tool_arguments(fn.get('arguments'))
            try:
                if '_invalid_arguments' in args:
                    raise ValueError('Invalid JSON tool arguments: ' + args['_invalid_arguments'])
                allowed = {tool['function']['name'] for tool in tools}
                if name not in allowed:
                    raise ValueError(f'Tool {name} is not allowed for the {role} role')
                result = call_tool(name, args)
            except Exception as exc:  # local error reported back to agent
                result = json.dumps({'error': type(exc).__name__, 'message': str(exc)})
            tool_audit.append({
                'tool': name,
                'argument_names': sorted(str(key) for key in args),
                'result': audit_tool_result(name, result),
            })
            messages.append({'role': 'tool', 'tool_name': name, 'content': result})
    return {
        'summary': final or 'Agent ended without a final response.',
        'tool_calls': tool_audit,
        'changed': git_diff() != baseline,
    }


def ask_text_agent(base_url: str, model: str, role: str, content: str, num_predict: int = 512) -> str:
    try:
        response = ollama_chat(base_url, model, [
            {'role': 'system', 'content': f'You are the AURA {role} agent. Obey AGENTS.md principles: local-first, no paid APIs, safe confirmed actions, preserve the living visual, Australian English.'},
            {'role': 'user', 'content': content},
        ], num_predict=num_predict)
        message = response_message(response)
    except Exception as exc:
        raise AgentRuntimeError(role, exc, []) from exc
    return str(message.get('content', '')).strip()


def parse_decision(text: str, allowed: set[str]) -> str:
    """Require an exact DECISION token; never accept READY inside NOT READY."""
    match = re.search(r'^\s*DECISION\s*:\s*([A-Z_]+)\s*$', text.upper(), re.MULTILINE)
    if not match or match.group(1) not in allowed:
        return 'INVALID'
    return match.group(1)


def ask_decision_agent(
    base_url: str,
    model: str,
    role: str,
    content: str,
    allowed: set[str],
    num_predict: int = 384,
) -> str:
    """Retry one formatting-only failure without weakening exact decision gates."""
    response = ask_text_agent(base_url, model, role, content, num_predict=num_predict)
    if parse_decision(response, allowed) != 'INVALID':
        return response
    choices = ', '.join(f'DECISION: {choice}' for choice in sorted(allowed))
    correction = (
        content
        + '\n\nYour previous response did not contain a valid exact decision line. '
        + f'Review the same evidence and begin with exactly one of these lines: {choices}. '
        + 'Do not use another decision word.\n\n'
        + 'PREVIOUS INVALID RESPONSE:\n' + response
    )
    return ask_text_agent(base_url, model, role, correction, num_predict=min(num_predict, 256))


def write_report(sections: list[tuple[str, str]]) -> Path:
    report_dir = ROOT / 'builder' / 'runs'
    report_dir.mkdir(parents=True, exist_ok=True)
    report = report_dir / 'latest.md'
    body = '# AURA Builder latest run\n\n'
    for heading, content in sections:
        body += f'## {heading}\n\n{content.strip()}\n\n'
    report.write_text(body, encoding='utf-8')
    return report


def write_patch_evidence(diff: str | None = None) -> Path:
    report_dir = ROOT / 'builder' / 'runs'
    report_dir.mkdir(parents=True, exist_ok=True)
    patch = report_dir / 'latest.patch'
    patch.write_text(diff if diff is not None else git_diff(), encoding='utf-8')
    return patch


def agent_summary(result: dict[str, Any]) -> str:
    return str(result.get('summary', '')).strip()


PIPELINE_ROLES = (
    'Codebase Scout',
    'UX/Creative Designer',
    'Planner',
    'Implementer',
    'Blueprint Curator',
    'Safety Reviewer',
    'Code Reviewer',
    'Tester',
    'Fixer',
    'Release Reviewer',
    'Development Manager',
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--task', help='Task text')
    parser.add_argument('--task-file', help='Path to a task markdown file')
    parser.add_argument('--config', default=str(DEFAULT_CONFIG))
    parser.add_argument('--auto-commit', action='store_true')
    parser.add_argument('--allow-dirty', action='store_true')
    parser.add_argument('--verify-only', action='store_true', help='Run configured checks without asking agents to edit files')
    parser.add_argument(
        '--review-last-commit',
        action='store_true',
        help='Review and test the latest committed change to task-named files without asking the local model to edit',
    )
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
        task_source = str(repo_relative(task_path))
    if not task.strip():
        print('Provide --task or --task-file.', file=sys.stderr)
        return 2

    allow_dirty = args.allow_dirty or bool(config.get('allow_dirty', False))
    ensure_clean(allow_dirty)
    if allow_dirty and args.auto_commit:
        print('Refusing --auto-commit with a dirty working tree.', file=sys.stderr)
        return 2
    base_url = str(config.get('ollama_url', 'http://127.0.0.1:11434'))
    model = str(config.get('model', 'qwen3-coder:30b'))
    checks = config.get('test_commands') or [['python3', '-m', 'http.server', '--help']]
    baseline_diff = git_diff()

    if args.verify_only:
        print('AURA Builder: verification-only mode…')
        check_result = run_checks(checks)
        report = write_report([
            ('Mode', 'Verification only. No implementation or release claim was requested.'),
            ('Task', task),
            ('Tests', '```json\n' + json.dumps(check_result, indent=2) + '\n```'),
            ('Result', 'PASS' if check_result['ok'] else 'FAIL'),
        ])
        print(f'Verification report: {repo_relative(report)}')
        return 0 if check_result['ok'] else 4

    print('AURA Builder: checking native model tools…')
    preflight = preflight_native_tools(base_url, model)
    print(json.dumps(preflight, indent=2))
    if not preflight['ok']:
        write_patch_evidence('')
        report = write_report([
            ('Task', task),
            ('Model preflight', '```json\n' + json.dumps(preflight, indent=2) + '\n```'),
            ('Tool audit', '```json\n' + json.dumps(preflight.get('tool_calls', []), indent=2) + '\n```'),
            ('Result', 'HOLD: the configured model did not complete a valid native tool call within the preflight budget. No agent roles or repository edits were started.'),
        ])
        print(f'Model preflight failed. Review {repo_relative(report)}.', file=sys.stderr)
        return 5

    if args.review_last_commit:
        paths = task_file_hints(task)
        diff = committed_diff(paths)
        if not diff.strip():
            write_patch_evidence('')
            report = write_report([
                ('Task', task),
                ('Model preflight', '```json\n' + json.dumps(preflight, indent=2) + '\n```'),
                ('Result', 'HOLD: the latest commit contains no change to the exact existing paths named by the task.'),
            ])
            print(f'No task-scoped committed diff. Review {repo_relative(report)}.', file=sys.stderr)
            return 3

        review_prompt = (
            'Review the committed diff against the task and AGENTS.md. The first line must be exactly '
            'DECISION: PASS or DECISION: BLOCKED. Use BLOCKED for any missing requirement, regression, secret exposure, '
            'unsafe real-world action, false success state or inadequate evidence. This is an independent validation run: '
            'the change is already committed, so do not ask to edit it.\n\nTASK:\n'
            + task + '\n\nCOMMITTED TASK-SCOPED DIFF:\n' + truncate_for_model(diff)
        )
        print('AURA Builder: safety review of committed change…')
        safety_review = ask_decision_agent(base_url, model, 'Safety Reviewer', review_prompt, {'PASS', 'BLOCKED'})
        print(safety_review)
        print('\nAURA Builder: code review of committed change…')
        code_review = ask_decision_agent(base_url, model, 'Code Reviewer', review_prompt, {'PASS', 'BLOCKED'})
        print(code_review)

        print('\nAURA Builder: deterministic testing…')
        check_result = run_checks(checks)
        print(json.dumps(check_result, indent=2))
        reviews_pass = all(
            parse_decision(review, {'PASS', 'BLOCKED'}) == 'PASS'
            for review in (safety_review, code_review)
        )
        release = ask_decision_agent(
            base_url,
            model,
            'Release Reviewer',
            'The first line must be exactly DECISION: READY or DECISION: HOLD. READY requires passing deterministic '
            'checks and both independent reviews passing. Never claim physical Windows wall-PC validation from static '
            'tests.\n\nTASK:\n' + task
            + '\n\nCOMMITTED TASK-SCOPED DIFF:\n' + truncate_for_model(diff)
            + '\n\nSAFETY REVIEW:\n' + safety_review
            + '\n\nCODE REVIEW:\n' + code_review
            + '\n\nTESTS:\n' + json.dumps(check_summary(check_result)),
            {'READY', 'HOLD'},
            num_predict=256,
        )
        print('\nAURA Builder: release review…')
        print(release)
        manager = ask_text_agent(
            base_url,
            model,
            'Development Manager',
            'Report directly to Dewald in concise plain Australian English. State that this was an independent review '
            'of an already committed task-scoped diff. Summarise the change, UX impact, blueprint status, reviews, '
            'deterministic tests, release decision, remaining physical wall-PC validation, and three ranked next '
            'implementation suggestions. Do not invent validation or agent implementation activity.\n\nTASK:\n' + task
            + '\n\nSAFETY REVIEW:\n' + safety_review
            + '\n\nCODE REVIEW:\n' + code_review
            + '\n\nTESTS:\n' + json.dumps(check_summary(check_result))
            + '\n\nRELEASE REVIEW:\n' + release,
            num_predict=384,
        )
        print('\nAURA Builder: manager report…')
        print(manager)
        write_patch_evidence(diff)
        report = write_report([
            ('Mode', 'Independent review of the latest committed change, restricted to exact paths named by the task.'),
            ('Task', task),
            ('Model preflight', '```json\n' + json.dumps(preflight, indent=2) + '\n```'),
            ('Reviewed paths', '\n'.join('- `' + path + '`' for path in paths)),
            ('Safety review', safety_review),
            ('Code review', code_review),
            ('Tests', '```json\n' + json.dumps(check_result, indent=2) + '\n```'),
            ('Release review', release),
            ('Manager report to Dewald', manager),
        ])
        release_ready = parse_decision(release, {'READY', 'HOLD'}) == 'READY'
        if not check_result['ok'] or not reviews_pass or not release_ready:
            print(f'Committed change remains on hold. Review {repo_relative(report)}.', file=sys.stderr)
            return 4
        print('Committed task-scoped change passed independent local-agent review and deterministic checks.')
        return 0

    print('AURA Builder: scouting…')
    scout = run_tool_agent(
        base_url,
        model,
        'Codebase Scout',
        'Inspect the repository for the supplied task. Identify the smallest relevant files, existing tests, constraints and likely regression risks. Do not edit files.\n\n' + task,
        task_source,
        tools=FOCUSED_READ_ONLY_TOOLS,
        require_changes=False,
        max_turns=4,
    )
    print(agent_summary(scout))

    print('\nAURA Builder: UX and creative direction…')
    ux_direction = ask_text_agent(
        base_url,
        model,
        'UX/Creative Designer',
        'Audit the task and scout evidence from the perspective of AURA\'s cinematic wall-display experience. '
        'Recommend only task-relevant improvements to visual hierarchy, aesthetics, motion, the living face, '
        'touchscreen usability, accessibility, room-distance readability and responsive kiosk behaviour. '
        'Preserve the approved dark holographic identity, but do not treat the current aesthetics as untouchable. '
        'Do not edit files and do not expand the task beyond its stated outcome.\n\nTASK:\n'
        + task + '\n\nSCOUT EVIDENCE:\n' + agent_summary(scout),
        num_predict=384,
    )
    print(ux_direction)

    print('AURA Builder: planning…')
    plan = ask_text_agent(
        base_url,
        model,
        'Planner',
        'Produce a small, executable implementation plan with acceptance checks. Do not edit files. Use the scout evidence, '
        'consider the UX/Creative Designer advice where it supports the task, and do not invent files.\n\nTASK:\n'
        + task + '\n\nSCOUT EVIDENCE:\n' + agent_summary(scout)
        + '\n\nUX/CREATIVE DIRECTION:\n' + ux_direction,
        num_predict=384,
    )
    print(plan)

    print('\nAURA Builder: implementing…')
    implementation = run_tool_agent(
        base_url,
        model,
        'Implementer',
        task + '\n\nSCOUT EVIDENCE (advisory):\n' + truncate_for_model(agent_summary(scout), 800)
        + '\n\nImplementation directive: make only the focused change requested by the task. Do not copy code blocks, '
        'imports or invented filenames from advisory role responses.',
        task_source,
        tools=EDIT_TOOLS,
        max_turns=12,
    )
    print(agent_summary(implementation))

    diff = git_diff()
    if diff == baseline_diff or not bool(implementation.get('changed')):
        print('No implementation changes were produced. This is a failed build, not a verified release.', file=sys.stderr)
        check_result = run_checks(checks)
        print(json.dumps(check_result, indent=2))
        manager = ask_text_agent(
            base_url,
            model,
            'Development Manager',
            'Report directly to Dewald in plain Australian English. Explain that the build failed because no implementation '
            'change was produced. Summarise what was attempted, the available test evidence, the blocker, the decision needed '
            'from him if any, and three ranked next implementation suggestions grounded in the task and scout evidence. '
            'Do not claim completion and do not invent agent activity.\n\nTASK:\n' + task
            + '\n\nSCOUT:\n' + agent_summary(scout)
            + '\n\nIMPLEMENTER:\n' + agent_summary(implementation)
            + '\n\nTESTS:\n' + json.dumps(check_summary(check_result)),
            num_predict=512,
        )
        write_patch_evidence(diff)
        report = write_report([
            ('Task', task),
            ('Model preflight', '```json\n' + json.dumps(preflight, indent=2) + '\n```'),
            ('Scout', agent_summary(scout)),
            ('Scout tool audit', '```json\n' + json.dumps(scout.get('tool_calls', []), indent=2) + '\n```'),
            ('UX/Creative direction', ux_direction),
            ('Plan', plan),
            ('Implementation', agent_summary(implementation)),
            ('Tool audit', '```json\n' + json.dumps(implementation.get('tool_calls', []), indent=2) + '\n```'),
            ('Tests', '```json\n' + json.dumps(check_result, indent=2) + '\n```'),
            ('Manager report to Dewald', manager),
            ('Result', 'FAILED: the Implementer produced no repository changes. Use --verify-only for an intentional verification run.'),
        ])
        print(f'No-change failure report: {repo_relative(report)}', file=sys.stderr)
        return 3

    print('\nAURA Builder: curating the blueprint…')
    blueprint = run_tool_agent(
        base_url,
        model,
        'Blueprint Curator',
        'Inspect the implemented diff and the repository-native specifications. Update only the relevant blueprint, '
        'acceptance, architecture or roadmap document when the task intentionally changes approved product behaviour, '
        'visual direction, architecture or scope. Do not rewrite requirements merely to excuse an implementation. '
        'Do not duplicate material or edit source code. If the implementation does not change an authoritative decision, '
        'make no edit and explain why. Conversation-only attachments are not available to this runner, so preserve essential '
        'approved decisions in the repository-native documents.\n\nTASK:\n' + task + '\n\nIMPLEMENTED DIFF:\n' + truncate_for_model(diff),
        task_source,
        require_changes=False,
        max_turns=6,
    )
    print(agent_summary(blueprint))
    diff = git_diff()

    review_prompt = (
        'Review the diff against the task and AGENTS.md. The first line must be exactly DECISION: PASS or DECISION: BLOCKED. '
        'Use BLOCKED for any missing requirement, regression, secret exposure, unsafe real-world action, false success state or inadequate evidence.\n\nTASK:\n'
        + task + '\n\nDIFF:\n' + truncate_for_model(diff)
    )
    print('\nAURA Builder: safety review…')
    safety_review = ask_decision_agent(base_url, model, 'Safety Reviewer', review_prompt, {'PASS', 'BLOCKED'})
    print(safety_review)
    print('\nAURA Builder: code review…')
    code_review = ask_decision_agent(base_url, model, 'Code Reviewer', review_prompt, {'PASS', 'BLOCKED'})
    print(code_review)

    reviews_pass = all(
        parse_decision(review, {'PASS', 'BLOCKED'}) == 'PASS'
        for review in (safety_review, code_review)
    )
    fix = None
    if not reviews_pass:
        print('\nAURA Builder: applying reviewer fixes…')
        fix = run_tool_agent(
            base_url,
            model,
            'Fixer',
            task + '\n\nSafety review:\n' + safety_review + '\n\nCode review:\n' + code_review,
            task_source,
        )
        print(agent_summary(fix))
        if not fix.get('changed'):
            print('Reviewers blocked the change and the Fixer produced no further edit.', file=sys.stderr)
        else:
            diff = git_diff()
            blueprint = run_tool_agent(
                base_url,
                model,
                'Blueprint Curator',
                'Re-check repository-native specifications after the reviewer fix. Update documentation only if the '
                'intentional product, design, architecture or scope decision now differs. Do not edit source code or '
                'rewrite requirements to excuse the implementation.\n\nTASK:\n' + task + '\n\nUPDATED DIFF:\n' + truncate_for_model(diff),
                task_source,
                require_changes=False,
                max_turns=12,
            )
            diff = git_diff()
            post_fix_prompt = review_prompt.split('\n\nDIFF:\n', 1)[0] + '\n\nDIFF:\n' + truncate_for_model(diff)
            print('\nAURA Builder: re-running safety and code reviews…')
            safety_review = ask_decision_agent(base_url, model, 'Safety Reviewer', post_fix_prompt, {'PASS', 'BLOCKED'})
            code_review = ask_decision_agent(base_url, model, 'Code Reviewer', post_fix_prompt, {'PASS', 'BLOCKED'})
            print(safety_review)
            print(code_review)
        reviews_pass = all(
            parse_decision(review, {'PASS', 'BLOCKED'}) == 'PASS'
            for review in (safety_review, code_review)
        )

    print('\nAURA Builder: testing…')
    check_result = run_checks(checks)
    print(json.dumps(check_result, indent=2))

    final_diff = git_diff()
    release = ask_decision_agent(
        base_url,
        model,
        'Release Reviewer',
        'The first line must be exactly DECISION: READY or DECISION: HOLD. READY requires passing checks, both reviews passing, '
        'and repository-native blueprint alignment for any changed product or design decision. '
        'Never claim physical Windows wall-PC validation from static tests.\n\nTASK:\n' + task
        + '\n\nDIFF:\n' + truncate_for_model(final_diff)
        + '\n\nSAFETY REVIEW:\n' + safety_review
        + '\n\nCODE REVIEW:\n' + code_review
        + '\n\nTESTS:\n' + json.dumps(check_summary(check_result)),
        {'READY', 'HOLD'},
        num_predict=384,
    )
    print('\nAURA Builder: release review…')
    print(release)

    print('\nAURA Builder: manager report…')
    manager = ask_text_agent(
        base_url,
        model,
        'Development Manager',
        'Report directly to Dewald in plain Australian English. Give a concise executive summary of the task, what changed, '
        'UX/design impact, blueprint updates, review and test results, release decision, risks, physical Dell/wall-PC validation '
        'still required, and any decision he must make. Finish with three ranked, concrete next implementation suggestions '
        'that advance the current AURA roadmap without paid APIs. Clearly distinguish completed work from suggestions. Do not '
        'invent validation or agent activity.\n\nTASK:\n' + task
        + '\n\nUX DIRECTION:\n' + ux_direction
        + '\n\nIMPLEMENTATION:\n' + agent_summary(implementation)
        + '\n\nBLUEPRINT CURATION:\n' + agent_summary(blueprint)
        + '\n\nSAFETY REVIEW:\n' + safety_review
        + '\n\nCODE REVIEW:\n' + code_review
        + '\n\nTESTS:\n' + json.dumps(check_summary(check_result))
        + '\n\nRELEASE REVIEW:\n' + release,
        num_predict=512,
    )
    print(manager)

    write_patch_evidence(final_diff)
    report = write_report([
        ('Task', task),
        ('Model preflight', '```json\n' + json.dumps(preflight, indent=2) + '\n```'),
        ('Scout', agent_summary(scout)),
        ('Scout tool audit', '```json\n' + json.dumps(scout.get('tool_calls', []), indent=2) + '\n```'),
        ('UX/Creative direction', ux_direction),
        ('Plan', plan),
        ('Implementation', agent_summary(implementation)),
        ('Implementer tool audit', '```json\n' + json.dumps(implementation.get('tool_calls', []), indent=2) + '\n```'),
        ('Blueprint curation', agent_summary(blueprint)),
        ('Blueprint curator tool audit', '```json\n' + json.dumps(blueprint.get('tool_calls', []), indent=2) + '\n```'),
        ('Fixer tool audit', '```json\n' + json.dumps((fix or {}).get('tool_calls', []), indent=2) + '\n```'),
        ('Safety review', safety_review),
        ('Code review', code_review),
        ('Tests', '```json\n' + json.dumps(check_result, indent=2) + '\n```'),
        ('Changed paths', '\n'.join('- `' + path + '`' for path in changed_paths())),
        ('Release review', release),
        ('Manager report to Dewald', manager),
    ])

    release_ready = parse_decision(release, {'READY', 'HOLD'}) == 'READY'
    if not check_result['ok'] or not reviews_pass or not release_ready:
        print(f'Not committing. Review {repo_relative(report)}.', file=sys.stderr)
        return 4

    if args.auto_commit:
        paths = changed_paths()
        if not paths:
            print('No paths available to commit.', file=sys.stderr)
            return 4
        git('add', '--all', '--', *paths)
        git('commit', '-m', 'AURA builder: ' + task.splitlines()[0][:72])
        print('Committed the approved agent changes locally. Production deployment still requires the separate release step.')
    else:
        print('Changes are ready for human review. Re-run with --auto-commit to commit after tests pass.')
    return 0


def guarded_main() -> int:
    """Always leave uploadable failure evidence when an unexpected error escapes."""
    try:
        return main()
    except Exception as exc:
        failure = {
            'type': type(exc).__name__,
            'message': str(exc),
        }
        role = getattr(exc, 'role', 'Builder runtime')
        tool_audit = getattr(exc, 'tool_audit', [])
        try:
            patch = write_patch_evidence()
            changed = changed_paths()
        except Exception:
            patch = write_patch_evidence('')
            changed = []
        report = write_report([
            ('Failed role', role),
            ('Runtime failure', '```json\n' + json.dumps(failure, indent=2) + '\n```'),
            ('Tool audit', '```json\n' + json.dumps(tool_audit, indent=2) + '\n```'),
            ('Changed paths', '\n'.join('- `' + path + '`' for path in changed) or 'None recorded.'),
            ('Patch evidence', str(repo_relative(patch))),
            ('Result', 'HOLD: the builder stopped unexpectedly. No release or push is approved.'),
        ])
        print(f'AURA Builder stopped unexpectedly. Review {repo_relative(report)}.', file=sys.stderr)
        return 5


if __name__ == '__main__':
    raise SystemExit(guarded_main())
