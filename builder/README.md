# AURA Builder Agent Team

A local-first development team for AURA that runs on the Windows development machine with Ollama. It is intentionally separate from AURA's household runtime. No paid AI API is required.

## What the agents do

1. **Planner** — turns the queued release task into a focused implementation plan and acceptance checks.
2. **Implementer** — inspects the repository with constrained tools and edits only repository files.
3. **Reviewer** — reviews the git diff against the task, `AGENTS.md`, privacy rules and regression risks.
4. **Tester** — runs only the explicitly configured local test commands.
5. **Release Reviewer** — decides whether the change is ready to commit. Deployment is kept as a separate approval boundary.

The same local Ollama model can fill each role, but each role receives different instructions and responsibilities. The runner keeps an auditable report in `builder/runs/latest.md`.

## Safety boundaries

The model cannot run arbitrary shell commands. Its tools are limited to listing, reading, searching and writing repository files plus inspecting the current git diff. Paths that escape the repository or target `.git`, `.env` or known secret files are blocked. Home Assistant credentials remain outside the repository and browser. Production deployment and destructive operations are not exposed as agent tools.

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

The included workflow can run the builder on the Dell after a GitHub Actions self-hosted runner is installed and labelled `aura-dell`. This gives the agents a durable queue and logs while still keeping the model and Home Assistant access on the local machine.

The workflow is manual by default. Automatic scheduled development should only be enabled after the local runner has been observed working safely for several releases.

## Current queue

The first queued task is `builder/tasks/home-state-0.9.md`, which continues the confirmed Home Assistant command milestone with live state, room grouping, availability, brightness/fan capability controls and synchronisation.
