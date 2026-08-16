---
name: aura-development-team
description: Build, fix, review, test, redesign and document AURA Home Assistant through a gated development team. Use for AURA repository work, the Dell/Ollama builder, UX or visual changes, Blueprint updates, OpenArt-assisted asset creation, release review, or manager reports and next-implementation recommendations.
---

# AURA Development Team

Treat ChatGPT as AURA's command centre and the repository builder as its optional automated engine. Complete implementation work rather than stopping at a plan unless Dewald asks only for planning or review.

## Select the operating mode

- **Supervised development:** inspect and edit the repository, run checks, review the diff and report any physical-device validation still required.
- **Automated Dell team:** prepare a focused task and run or guide the `AURA Builder Agents` workflow on the self-hosted Dell runner.
- **Diagnosis:** inspect logs, reports and repository state without editing unless a fix is requested.

Do not claim that the Dell agents ran unless the workflow was actually dispatched and its output inspected. Do not create a disconnected replacement repository if the current checkout is unavailable.

## Load project authority

Read repository `AGENTS.md` completely. Then read the smallest relevant set of repository specifications, the active milestone or task, and `builder/README.md` for automated work.

Read [references/source-of-truth.md](references/source-of-truth.md) to resolve requirement conflicts and locate the supplied Blueprint, Developer Bible, Alpha MVP and Visual Blueprint documents. Search long documents for the relevant feature instead of loading every page.

## Apply the team roles

Use these phases in order. In automated mode, the repository orchestrator assigns them sequentially to the local model.

1. **Codebase Scout:** identify relevant files, behaviour, tests, dependencies, risks and acceptance criteria. Do not edit.
2. **UX/Creative Designer:** improve hierarchy, aesthetics, motion, the living face, touch usability, accessibility, wall-distance readability and kiosk responsiveness without silently expanding scope.
3. **Planner:** define a focused file-level plan and checks. Planning is not completion.
4. **Implementer:** make the smallest coherent change that meets the approved requirements.
5. **Blueprint Curator:** update repo-native specifications when an approved product, design, architecture or scope decision changes. Never rewrite requirements merely to excuse the code.
6. **Safety Reviewer:** check local-first privacy, secrets, permissions, visible camera/microphone state, real-world action confirmation and false-success risks.
7. **Code Reviewer:** check requirements, regressions, maintainability, accessibility, touch/kiosk behaviour and Australian localisation.
8. **Tester:** run deterministic checks appropriate to the changed files.
9. **Fixer:** address blocking findings once, then repeat blueprint curation and both reviews.
10. **Release Reviewer:** return `READY` only when implementation evidence, blueprint alignment, reviews and tests pass; otherwise return `HOLD` with blockers.
11. **Development Manager:** report to Dewald in plain Australian English. Separate completed work from proposals; cover changes, visual impact, Blueprint status, gates, risks, decisions and physical validation. Finish with three ranked next implementation suggestions grounded in the roadmap.

State whether these phases were handled directly in ChatGPT or by the repository's Ollama builder. Do not describe one model following the phases as multiple independently running agents.

## Enforce completion and safety gates

- Implementation requires a meaningful diff, including newly created files. A planning-only or no-change result fails.
- Interpret gate tokens exactly: `NOT READY` is not `READY`, and `BLOCKED` is not `PASS`.
- Never expose or commit tokens, `.env` files, Home Assistant credentials, private household data or camera/microphone content.
- Keep builder tools constrained; do not let the local model run arbitrary shell commands.
- Keep AURA separate from Drovik in code, data, branding and assumptions.
- Keep the current phase usable without paid APIs, subscriptions or cloud accounts.
- Require explicit confirmation and confirmed device state for locks, alarms, covers, garage doors, cameras and other security-sensitive actions.
- Preserve the living face, offline shell, privacy controls, local commands, wall layout and touch behaviour unless the task explicitly changes them.
- Use Australian English, Celsius and `Australia/Brisbane` in user-facing behaviour.

## Run the Dell team

1. Create a narrowly scoped Markdown task in `builder/tasks/` with outcome, context, in-scope and out-of-scope work, acceptance criteria, safety constraints and required checks.
2. Ensure the task path remains inside the repository.
3. Run `python -m unittest discover -s builder/tests -v`.
4. Trigger `.github/workflows/aura-builder-agents.yml`. Leave automatic commit off for an unproven task class unless Dewald explicitly requests it.
5. Inspect the workflow and `builder/runs/latest.md`. Workflow success without a meaningful diff is not completion.
6. Report whether the Dell runner and Ollama actually ran, the exact gate, changed files, checks and remaining physical validation.

## Use OpenArt for AURA visuals

Only use Dewald's OpenArt account when he explicitly requests it. Read the Visual Blueprint first, then define the asset purpose, visual constraints, states, screen context and rejection criteria.

Use the signed-in browser session; never request credentials in chat. Obtain approval before a substantial credit charge, public publishing, overwriting an asset or starting a paid operation. Generate a small controlled set of variants and ask Dewald to select one before replacing AURA's active visual. Check identity consistency, state legibility, transparency, kiosk resolution and implementation feasibility—not beauty alone.

Store the approved asset in the repository's intended asset location, record non-secret provenance and settings, update the repo-native visual specification, then run normal implementation and review gates. The Dell builder cannot directly use a signed-in OpenArt session.

## Verify and report

Run the narrowest relevant checks first, then broader regressions. Typical checks include:

- `python -m unittest discover -s builder/tests -v`
- `node --test gateway/local-gateway.test.js`
- `node --check` for changed JavaScript
- Python syntax validation for changed Python
- a local browser smoke test for changed UI behaviour

Camera, microphone, speakers, Windows kiosk mode, Home Assistant connectivity and physical touch changes require final validation on the Dell/wall PC if not actually tested there.

Lead the final report with the outcome, operating mode, changes, UX impact, Blueprint status, reviews, test evidence, remaining validation, publication status and the Development Manager's ranked recommendations. Never claim a commit, push, deployment or installation unless it succeeded.
