# AURA Builder Agent Team

A local-first development team for AURA that runs on the Windows development machine with Ollama. It is intentionally separate from AURA's household runtime. No paid AI API is required.

## What the agents do

1. **Codebase Scout** — uses read-only repository tools to identify the smallest relevant files, tests and regression risks.
2. **Planner** — turns the queued release task and scout evidence into a focused implementation plan.
3. **UX/Creative Designer** — audits visual hierarchy, aesthetics, motion, the living face, touch usability, accessibility and wall-distance readability without silently expanding the task.
4. **Implementer** — edits repository files with constrained, preconditioned tools.
5. **Blueprint Curator** — updates relevant repo-native specifications when an approved product, design, architecture or scope decision changes; it never rewrites requirements merely to excuse the code.
6. **Safety Reviewer** — checks privacy, secrets, real-world actions, confirmation semantics and local-first boundaries.
7. **Code Reviewer** — checks requirements, regressions and maintainability independently from the safety review.
8. **Tester** — runs only the explicitly configured deterministic test commands.
9. **Fixer** — receives blocking review evidence and gets one bounded repair pass followed by mandatory re-review.
10. **Release Reviewer** — returns an exact `READY` or `HOLD` decision. Deployment remains a separate approval boundary.
11. **Development Manager** — reports the outcome directly to Dewald in plain language and ranks the next implementation opportunities without confusing suggestions with completed work.

The same local Ollama model fills each role sequentially so the 4 GB Dell is never asked to keep several models active at once. Each role receives different tools and instructions. The UX/Creative Designer is advisory; the Blueprint Curator may edit only repo-native documentation and may correctly make no change when the implementation does not alter an approved decision. The manager report is written into `builder/runs/latest.md` and the workflow artifact so it can be brought back into the ChatGPT command-centre conversation.

## Safety boundaries

The model cannot run arbitrary shell commands. Its tools are limited to listing, reading, searching, exact text replacement, focused file writing and diff inspection. The Scout receives read-only tools. Paths that escape the repository or target `.git`, `.env` or known secret files are blocked case-insensitively. New files are included in diff evidence. Home Assistant credentials remain outside the repository and browser. Production deployment and destructive operations are not exposed as agent tools.

An implementation run with no code change fails. It can no longer be converted into a successful “verified” release. For an intentional check-only run, use `--verify-only`; that mode skips all editing and release claims.

## One-time Dell setup

Install Git, Python 3, Node.js and Ollama. Then install a coding model that fits the Dell hardware. The example configuration uses `qwen3-coder:30b`; choose a smaller model if the machine does not have enough RAM/VRAM.

From the repository root:

```powershell
Copy-Item builder\config.example.json builder\config.json
ollama pull qwen3-coder:30b
python builder\aura_builder.py --task-file builder\tasks\home-state-0.9.md
```

Review the diff and `builder/runs/latest.md`. When the checks are clean, the same task can be run with:

```powershell
python builder\aura_builder.py --task-file builder\tasks\home-state-0.9.md --auto-commit
```

`--auto-commit` commits only after the configured checks pass and the release reviewer returns `READY`. It does not publish or deploy the app.

## Running through a self-hosted GitHub runner

The included workflow can run the builder on the Dell after a GitHub Actions self-hosted runner is installed with the labels `aura`, `builder` and `ollama`. This gives the agents a durable queue and logs while still keeping the model and Home Assistant access on the local machine. A concurrency lock prevents two builder jobs from competing for the local model and working tree.

Run the orchestration gate tests at any time:

```powershell
python -m unittest discover -s builder\tests -v
```

The workflow is manual by default. Automatic scheduled development should only be enabled after the local runner has been observed working safely for several releases.

## Current queue

The first queued task is `builder/tasks/home-state-0.9.md`, which continues the confirmed Home Assistant command milestone with live state, room grouping, availability, brightness/fan capability controls and synchronisation.
