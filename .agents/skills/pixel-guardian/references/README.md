# Shared references (not a skill)

`pixel-guardian`'s top-level `SKILL.md` was retired — it duplicated
`pixel-erp-design` with a stale source of truth (`DESIGN.md`, which had drifted
behind `docs/design/RULES.md`). This folder stays because `docs/design/RULES.md`
and `pixel-erp-design`'s review mode still cite these files:

- `uxw-copy-library.md` — UXW principles/patterns (cited by `docs/design/RULES.md`
  `rule/copy-*`). App copy is English by default; apply the *principles*, not the
  Bahasa strings verbatim.
- `design-principles.md`, `ux-laws.md` — CHOICE / UX-law lenses for judgment calls
  that sit above hard `rule/*` IDs (use during `pixel-erp-design`'s **review** mode).
- `finding-schema.md` — structured finding format (id/dimension/severity/evidence/
  fix/decisionQuestion) for a `pixel-erp-design` review pass, when a plain
  most-severe-first list isn't enough detail.

**Do not** follow `DESIGN.md` or `finding-schema.md`'s guideline-source list as
authority for components/tokens/patterns — that's `docs/design/RULES.md` +
`docs/patterns/*.md`, per `pixel-erp-design` Step 0.
