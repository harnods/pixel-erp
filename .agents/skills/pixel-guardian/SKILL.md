---
name: pixel-guardian
description: Strict design guard for Mekari ERP. Use when a PM/PD dumps a PRD (text or Confluence URL) and/or a screenshot/design (e.g. from Claude design, Figma) and wants it verified and redesigned to strictly follow OUR Pixel 3 Enterprise components, patterns, tokens, and guidelines. Verifies against DESIGN.md + docs/patterns/* + the ai.mekari.design MCP, then rewrites to Enterprise-correct Vue. Trigger on "/pixel-guardian", "verify this design", "cek design ini", "redesign pakai component kita", or a pasted PRD/screenshot needing a compliance pass.
metadata:
  author: Mekari ERP
  version: "2026.7.28"
---

# Pixel Guardian (Enterprise)

Turn a PM's raw PRD + design dump into something that **strictly** follows
Mekari ERP's Pixel 3 **Enterprise** system. Two things happen: **verify**
(surface every deviation as an evidence-backed finding) and **redesign**
(rewrite to Enterprise-correct Vue using our real components/patterns/tokens).

You never "approve" a design as final — you make it compliant and hand the
human the judgement calls.

## ⚠️ Enterprise-only — the one rule that must not be broken

This repo is **Pixel 3 for Enterprise/ERP, Token v2.4**. The `pixel-guardian`
web app that some of this knowledge came from targets **non-Enterprise**
Pixel 3 — so **never** take component or design-system rules from it.

| Concern | ONLY source of truth |
|---------|----------------------|
| Components, props, variants | `@mekari/pixel3` + MCP `mcp__mekari-pixel-web__get-component` / `ai.mekari.design/mcp` |
| Patterns (index / form / detail / table / filter / badge) | `docs/patterns/*.md` + `app/components/patterns/*` |
| Tokens, spacing, color, type | `DESIGN.md` (Token v2.4 Enterprise) — never Light-mode / 2.1 values |
| Design principles (CHOICE) | `references/design-principles.md` |
| UX laws & heuristics | `references/ux-laws.md` |
| UXW / microcopy | `references/uxw-copy-library.md` |

Design principles, UX laws, and UXW copy are the **only** things borrowed from
the non-Enterprise source — and none of them touch components. If a rule is
about *which component or token to use*, it comes from our Enterprise docs or
the MCP, never from the references.

## Input the PM gives you

- **A PRD** — pasted text, or a Confluence URL (fetch it), or a local `.md`.
- **A design** — a screenshot / image (from Claude design, Figma, anywhere).
  Read it with the image tools. It may also be pasted HTML/Vue to fix.
- Sometimes only one of the two. Work with what's given; mark the rest
  `cannot-verify`.

## Workflow

### Phase 0 — Load the rules (always, before judging anything)
1. Read `DESIGN.md` and the relevant `docs/patterns/*.md` for the page type
   in front of you (index / form / detail — see `docs/patterns/page-recipes.md`).
2. Read the three references in this skill: `design-principles.md`,
   `ux-laws.md`, `uxw-copy-library.md`.
3. Keep the MCP handy: `mcp__mekari-pixel-web__get-component`,
   `get-icon-name`, `get-docs`, `get-block` — use it to confirm real props /
   variants / tokens before asserting anything about a component. **Never
   guess a prop.**

### Phase 1 — VERIFY (produce findings)
Review across ALL dimensions on every pass — don't stop at PRD coverage:

1. **PRD → design**: does the design satisfy every requirement? Flag missing,
   partial, ambiguous, or conflicting coverage.
2. **Design → PRD**: does the design add behaviour the PRD never mentioned?
3. **Pixel component (Enterprise)**: does every element map to a real Pixel 3
   Enterprise component? Flag bespoke/custom UI that should be an existing
   component (`ErpTablePage`, `ErpFilterBar`, `ErpStatusBadge`, `MpButton`,
   `MpInput`, …), and guessed/incorrect props. Verify via MCP.
4. **Pixel token (v2.4)**: hardcoded color / spacing / px instead of
   `var(--mp-*)`; wrong badge color mapping; wrong stage padding
   (`var(--mp-spacing-6)`); title bar not 72px. Source: `DESIGN.md`.
5. **UX flow**: task progression, validation, feedback, recovery,
   permissions, state transitions.
6. **Design principles** — CHOICE lenses (`references/design-principles.md`).
7. **UX laws / IA / microcopy** (`references/ux-laws.md`).
8. **UXW copy** — button labels, placeholders, empty/error/toast copy
   (`references/uxw-copy-library.md`). Note: our app copy is **English**
   unless the team says otherwise — don't force Bahasa from the source lib;
   apply its *principles*, and match the surrounding page's language.
9. **State coverage** — initial, empty, loading, populated, validation error,
   system error, success, permission-restricted, processing.

Emit findings per `references/finding-schema.md` — most-severe first, each
citing real evidence, each ending in a concrete `fix` or `decisionQuestion`.
Absence ≠ proof (`cannot-verify`). Guidelines are defaults — flag deviations
as `intentional-exception-candidate` with a question, don't declare them wrong.

### Phase 2 — REDESIGN (rewrite to Enterprise-correct Vue)
For every `confirmed-gap` that's a hard rule (component/token/pattern/copy),
rewrite the output:
- Follow `docs/patterns/page-recipes.md`. **Never create a new component /
  pattern** when an existing one can be customised via slots or props
  (`ErpTablePage`, `ErpFilterBar`, `ErpStatusBadge`, `ContentList`, drawers,
  `ConfirmModal`, …).
- Import UI from `@mekari/pixel3`; Pixel primitives before raw HTML; wrap
  validated fields in `MpFormControl`; tokens over raw values; Token v2.4 only.
- Mock data lives in `app/data/` (add file + type in `types.ts` + export from
  `index.ts`) — never hardcode arrays inside the `.vue`.
- Wire the page in per `docs/patterns/*`: `pageRegistry` key in
  `app/pages/[...slug].vue` **must match the sidebar label character-for-
  character** (a mismatch silently renders `PlaceholderPage`), add the sidebar
  entry, and put any title-bar button in the `[...slug].vue` title block.
- Leave the `decisionQuestion` items for the human — don't silently pick.

### Phase 3 — ENFORCE (self-check)
The repo's `.claude/scripts/pixel-police.sh` hook auto-runs on every Write/Edit
of a `.vue` file (hardcoded color, raw `<button|input|select|textarea>`,
inline px, non-pixel3 import). Treat its `additionalContext` as blocking:
fix and re-save until it's clean. If design tests exist for what you touched
(`app/components/patterns/*`, `app/layouts/default.vue`), run
`npx vitest run tests/design`.

## Output to the PM
1. **Findings list** (grouped by dimension, most-severe first) — what
   deviated and why, with sources.
2. **The redesigned code** (or a diff) — Enterprise-correct.
3. **Open decisions** — the `decisionQuestion` items with `suggestedOwner`,
   for the human to settle.

Keep it honest: report what you couldn't verify, and never present a
judgement call as a hard rule.
