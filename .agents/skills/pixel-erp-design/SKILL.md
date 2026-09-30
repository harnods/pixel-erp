---
name: pixel-erp-design
description: MANDATORY entry point before building, editing, or reviewing ANY UI in the erp-app repo — any .vue page/component, form, modal, table, drawer, filter bar, detail page, button, or user-facing copy. Routes to the exact design rules and pattern docs for the surface you're touching, and enforces the authority hierarchy. Trigger this FIRST whenever a task involves rendering or changing anything a user sees; do not work from your training prior.
---

# Pixel-ERP design — routing entry point

You are changing UI in `erp-app`. Code shows you *what* shipped, not *why* it's the
standard — so **do not work from your training prior**. Load the rules for the
surface you're touching, then build. This skill exists because doing UI "from
memory" is exactly what produces off-standard results.

## Step 0 — resolve authority

When a mockup, screenshot, or your instinct disagrees with a rule, resolve in this
order (highest wins):

1. Explicit user goal in this task.
2. A `rule/*` in **`docs/design/RULES.md`** — **beats any mockup detail**.
3. A pattern doc in `docs/patterns/*`.
4. An adjacent shipped page that already follows the rules.
5. General taste / training prior — **lowest**. Never overrides 2–4.

A Figma export showing a native `<select>` does not override
`rule/select-erpfilterselect`. Follow the rule and say so.

## Step 1 — route by surface (load only what applies)

Identify the surface(s) in your task and load the matching rows. Read
`docs/design/RULES.md` for the cited `rule/*` IDs, plus the source pattern doc.
**Load only the relevant sections — not everything.**

| If you're touching…            | Load rules                                  | Pattern doc / skill |
| ------------------------------ | ------------------------------------------- | ------------------- |
| A **table / index / list**     | `rule/table-*`                              | invoke skill **`erp-table-page`** + `docs/patterns/ErpTablePage.md` |
| A **form**                     | `rule/form-*`, `rule/btn-*`, `rule/checkbox-multiline-top` | `docs/patterns/Form.md`, `docs/patterns/FormTable.md` |
| A **modal / confirm / alert**  | `rule/modal-*`, `rule/btn-*`, `rule/form-errors-inline` | `docs/patterns/Modal.md` |
| A **button**                   | `rule/btn-*`                                | `docs/patterns/Button.md` |
| A **dropdown / filter / search** | `rule/select-*`, `rule/filter-bar-search-export` | `docs/patterns/ErpFilterBar.md` |
| A **drawer / side panel**      | `rule/drawer-*`                             | `docs/patterns/Drawer.md` |
| A **detail page**              | `rule/detail-*`, `rule/type-*`              | `docs/patterns/details-page-format.md` |
| An **empty / error / loading** state | `rule/empty-state-structure`, `rule/toast-success-only`, `rule/form-errors-inline` | `docs/patterns/Toast.md` |
| A **card / surface / page shell** | `rule/surface-*`, `rule/type-*`          | `docs/patterns/pixel-enterprise-overrides.md` |
| **Copy / labels / terminology** | `rule/copy-*`                              | uxw-mekari guideline, `app/data/translations.ts` |
| **Any** of the above (tokens)  | `rule/token-*`                              | `docs/patterns/pixel-enterprise-overrides.md` |

When live component props/tokens are unclear, query the **mekari-pixel-web MCP**
(`get-component`, `get-docs`, `get-icon-name`) — don't guess prop names.

## Step 2 — design every reachable state

Do not stop at the populated success case. Walk
**`docs/design/reachable-states.md`** for your surface (empty / filtered-empty /
loading / error / permission / destructive). If you skip a state, say which and why.

## Step 3 — self-check before you finish

- [ ] Every `rule/*` for this surface is satisfied — or a deviation is called out
      with its reason and authority (Step 0).
- [ ] `pixel-police` notes (they cite `rule/*` IDs) are resolved or justified.
- [ ] Reachable states designed (Step 2).
- [ ] Rebuilt + restarted the 4322 preview so it reflects the change (see CLAUDE.md).

## Modes

- **implement** — build to the rules above.
- **review** — check a diff/page against every applicable `rule/*`; report by ID,
  most-severe first; separate confirmed violations from judgment calls. For a
  judgment call above the hard `rule/*` set (flow, IA, microcopy quality), the
  CHOICE/UX-law lenses in `.agents/skills/pixel-guardian/references/{design-principles,ux-laws}.md`
  still apply; use `finding-schema.md` in that folder if a structured
  evidence/fix/decisionQuestion format is warranted. Those lenses never override
  a `rule/*` — they only fill gaps hard rules don't cover.
- **copy** — apply `rule/copy-*` + uxw-mekari; strings go through `t()`.

## When a rule is missing or wrong

If you hit a recurring "always gets this wrong" case that no `rule/*` covers, or a
rule looks wrong: **do not silently deviate in one page.** Add/fix the rule in
`docs/design/RULES.md` (Do/Don't + Why + Source), wire a `pixel-police` check if
it's grep-able, and link it from the pattern doc. That's how this system stays
correct — decisions live in the repo, not in one person's head.
