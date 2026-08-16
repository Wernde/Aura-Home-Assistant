# AURA Source-of-Truth Order

## Conflict priority

1. Dewald's latest explicit instruction for the current task.
2. Repository `AGENTS.md` safety and product boundaries.
3. Latest complete AURA Blueprint Bible and Developer Bible.
4. Alpha MVP Specification for current-scope acceptance criteria.
5. Visual Blueprint for appearance and interaction direction.
6. Repository-native specifications and milestone documents.
7. Existing implementation, which shows current behaviour but is not automatically the intended requirement.

Flag a material conflict before a high-impact or irreversible choice. For ordinary reversible details, preserve local-first privacy, safety and current MVP scope.

## Supplied project documents

Use these when available in the current project or conversation:

- `Aura_Home_Assistant_Blueprint_Bible_Complete_Edition.docx` or the matching PDF
- `Aura_Home_Assistant_Developer_Bible.docx` or the matching PDF
- `Aura_Home_Alpha_MVP_Specification(1).docx`
- `Aura_Home_Assistant_Visual_Blueprint.pdf`

Prefer DOCX for text extraction and PDF for visual-layout verification. Equivalent duplicate editions may exist; prefer the newest complete edition. Do not assume the Dell runner can read conversation-only attachments. Distil active requirements into repository specifications or task files.

## Repository working sources

- `AGENTS.md`
- `docs/MASTER_SPEC.md`
- `docs/MVP_ACCEPTANCE.md`
- `docs/ARCHITECTURE.md`
- `docs/BUILD_ROADMAP.md`
- active milestone documents in `docs/`
- active task files in `builder/tasks/`
- `builder/README.md`

## Non-negotiable boundaries

- AURA is a local-first household assistant for a Windows wall PC and touchscreen.
- AURA and Drovik remain separate products.
- Current operation must not require a paid AI or cloud subscription.
- The face remains visibly alive and communicates state.
- Camera and microphone use is opt-in, visible and locally controlled.
- Sensitive device actions require explicit confirmation and confirmed state.
- Secrets and private household data never enter the repository or browser bundle.
- User-facing copy uses Australian English, Celsius and Brisbane time.
