# Onboarding — erp-app design system

How this repo keeps UI consistent, and how to use it after you clone. Applies to
everyone (with or without Claude Code).

## 1. Setup

```bash
npm install
npm run dev            # dev on :4321 — edit here (HMR)
# for a stable demo build:
npm run build && npm run preview -- --port 4322
```

Open **http://localhost:4321/pixel** — the live component + pattern gallery. Every
component/pattern is rendered live in the DT 2.4 Enterprise theme, with its governing
`rule/*` and correct-usage code. A red "render failed" card = that component is wired
wrong.

## 2. The source of truth

- **`docs/design/RULES.md`** — the canonical registry. Every accepted decision is a
  stable `rule/<id>` with Do/Don't + Why + Source, plus the **authority hierarchy**
  (a `rule/*` beats any mockup) and the "Rejected reflexes" table. **Read this first.**
  Cite `rule/*` IDs in PRs and reviews (e.g. "fixed per `rule/btn-cancel-ghost`").
- **`CLAUDE.md`** — the top section is the mandatory entry point for any UI work.
- **`docs/design/reachable-states.md`** — a surface isn't done until every state it
  can reach is designed (empty / loading / error / permission / destructive).
- **`DESIGN.md` + `docs/patterns/*`** — long-form rationale behind the rule IDs.

## 3. If you use Claude Code in this repo

Everything below is committed, so a fresh clone gets it automatically:

- **Skill `pixel-erp-design`** (`.claude/skills/`) — the routing entry point. Invoke
  `/pixel-erp-design`, or just start UI work and Claude routes to the right rules.
  (`erp-table-page` is the table-specific skill.)
- **`pixel-police` hook** (`.claude/settings.json` + `.claude/scripts/pixel-police.sh`)
  — runs on every Edit/Write of a `.vue` file and flags rule violations, each citing
  its `rule/*` ID. On first run Claude Code asks you to **approve the project hooks** —
  approve them. (A UXW copy-review hook runs too.)
- **Evals** — `bash .claude/scripts/design-evals.sh` checks the linter still catches
  known violations (guards against regressions). Add a fixture when a bad pattern slips
  through.

Personal config (`.claude/settings.local.json`, worktrees) stays out of git.

### Pixel MCP (optional but recommended)
Icon/component lookups (`get-icon-name`, `get-component`) come from the **mekari-pixel**
MCP, which is **per-user** (not committed). Add it to your own Claude config so names
are verified, not guessed. Without it, verify icon names against the app or the Pixel
docs (https://docs.mekari.design).

## 4. Building UI — the short version

1. **Never work from your training prior.** Load the rules for the surface first.
2. **Dropdowns** = `PopoverSelect` (options in a popover) or `MpAutocomplete` with
   `is-searchable`. **Never `MpSelect`** (native OS dropdown). `rule/select-erpfilterselect`.
3. **Buttons** = Pixel `<MpButton>` (`.btn-enterprise` is legacy). Strict rules:
   no `size="md"`, sm is secondary-only, danger is text-only, dropdown = MpPopover,
   danger click → confirm MpModal, save → success toast. See `rule/btn-*`.
4. **Style with `css()` + design tokens.** In this pulled Pixel build the short color
   tokens resolve empty — for colors pass `var(--mp-colors-*, #hex)`. `rule/style-with-css`.
5. **Reuse Pixel Hub blocks** before hand-rolling: `npx @mekari/pixel-hub@latest block add <name>`.
6. Cite the `rule/*` you followed in your PR.

## 5. When a rule is missing or wrong

Don't silently deviate. Add/fix the rule in `docs/design/RULES.md` (Do/Don't + Why +
Source), wire a `pixel-police` check if it's grep-able, and link it from the pattern
doc. Decisions live in the repo, not in one person's head.
