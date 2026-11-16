---
name: pixel
description: Build Mekari Pixel 3 UI in Vue 3/Nuxt from Figma or text, scoped to the Mekari ERP OS project (Enterprise theme, Token 2.4, Nuxt 4). Use when implementing or modifying Pixel-based UI, validating props via Pixel MCP, applying design tokens, checking token mode (2.1 vs 2.4), or building index/form/detail ERP pages.
license: Proprietary
compatibility: Requires a Vue 3/Nuxt project with @mekari/pixel3 installed.
metadata:
  author: design@mekari.com (upstream), Ahmad Zakiy + Mekari ERP (local)
  version: '2026.7.2+erp'
  source: https://ai.mekari.design/skills?skill=pixel
  localNote: Merged upstream v2026.7.2 with ERP-specific project context. Do not overwrite with a plain `skills update` — re-merge instead.
---

# Pixel Design System

Build Pixel 3 UI with a low-noise workflow: verify setup, map the UI, validate props, apply token-safe styling, and ship runnable Vue/Nuxt code.

## Project Context — Mekari ERP OS

- **Theme**: Enterprise only (Token v2.4). Never use Light mode values.
- **Framework**: Nuxt 4, `srcDir: 'app/'`, `ssr: false`
- **Pattern docs**: `docs/patterns/*.md` — always read before building anything new
- **Existing patterns**: `ErpTablePage`, `ErpFilterBar`, `ErpStatusBadge`, `ErpPagination`, `DetailActionsMenu`, `PrintShareMenu`
- **Page recipes**: `docs/patterns/page-recipes.md` — index / form / detail page templates
- **Static assets**: import SVGs from `~/assets/images/` with `?url`, not from `public/`
- **Design tests**: `tests/design/` — Vitest, CSS source parsing, no browser needed
- **Enterprise token values**: [references/design-tokens.md](references/design-tokens.md) — resolved from `app/layouts/default.vue` `:root`

### When to run design tests

Run `npx vitest run tests/design` automatically when modifying:

- `app/components/patterns/*.vue`
- `app/layouts/default.vue`

Skip when only modifying:

- `app/components/pages/*.vue`
- `app/data/`, composables, route logic, docs, non-visual files

## Page Recipes & Commands

Recognise both slash-command style and natural language:

| Command / phrase                                                        | What to build                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `/create-index-page` · "bikin index page" · "create index page"         | `ErpFilterBar` + `ErpTablePage` + `useTableState`                 |
| `/create-form-page` · "bikin form page" · "create form page"            | Page title + stage with form fields (max 6 col) + action group    |
| `/create-detail-page` · "bikin detail page" · "create detail page"      | Page title + stage with detail sections (label / value pairs)     |

For each recipe, read `docs/patterns/page-recipes.md` before writing code.
**Never create a new component/pattern** when an existing one can be customised via slots or props.

## Golden Rules

1. Import components from `@mekari/pixel3`
2. Use Pixel primitives, for example `Pixel.div` and `Pixel.main`, before raw HTML equivalents
3. Use CSS props for `MpFlex`, `MpScrollbar`, `MpSkeleton`, and `Pixel.*`
4. Use CSS function `css()` only when CSS props are unavailable and you need to apply custom styling to a `Mp*` component
5. Use `get-block` first for any reusable UI section (data table, page header, confirmation modal, etc). If a block matches, it is the composition blueprint — do not rebuild the section from loose components. In this project, check `app/components/patterns/*` and `docs/patterns/*` first — an existing `Erp*` pattern outranks a generic block.
6. Use `get-component` to verify a component's props, slot, emit, and usage example before guessing — do this for every `Mp*` component
7. Use `get-icon-name` to verify icon names for `MpIcon` — do not invent icon names
8. Use design tokens 2.4 — this project is Enterprise 2.4 only; never fall back to 2.1
9. Use design tokens with semantic names ex: `background.surface`, `text.default`, `pxl-space-md`, over raw color, spacing, or typography values
10. Use `MpFormControl` to wrap validated fields, for example `MpInput`, `MpSelect`, and `MpTextarea`

## When loaded by `implement-to-pixel`

- Skip step 2 — plan already provided
- Before coding: verify `Pixel constraints` is present and filled. If blank, stop and ask — do not infer.
- Treat `Pixel constraints` as source of truth — do not re-derive from memory
- Start from step 3

## Workflow

### 1. Verify Setup

Read [references/setup.md](references/setup.md) if package setup or token mode is unclear.

### 2. Analyze the Request

Produce a short component plan before coding:

- Figma: extract node ID, call `get_design_context` and `get_screenshot`.
- Text: break UI into sections, states, and interactions.

Read [references/validation.md](references/validation.md) before generating code.

### 3. Create the UI

Read [references/components.md](references/components.md) for creating components and blocks.

### 4. Apply Styling

- Read [references/styling.md](references/styling.md) when deciding between CSS Props and `css()`.
- Read [references/design-tokens.md](references/design-tokens.md) for this project's Enterprise token values.

### 5. Produce Final Code

Read [references/structure.md](references/structure.md) and [references/code-structure.md](references/code-structure.md) before writing the final code.

## MCP Usage

### Pixel MCP — `https://ai.mekari.design/mcp`

- `get-component` — component props, slots, and usage examples
- `get-block` — Vue source for production-ready UI blocks
- `get-template` — starter-project guides and setup
- `get-docs` — setup, design tokens, and theming docs
- `get-icon-name` — look up Pixel icon names

Use `get-docs` first when setup or token mode is unclear, then `get-component` for component APIs, `get-block` for reusable sections, and `get-template` for starter layouts.

### Figma MCP

- `get_design_context` for structure, assets, and code hints
- `get_screenshot` for visual verification
- `get_metadata` only for large-node navigation

## Output Contract

Always produce:

1. Complete runnable Vue/Nuxt code
2. Required imports
3. Components used
4. Token and styling decisions
5. Assumptions, gaps, or unresolved API questions

## QA Checklist

- Setup and token mode confirmed or explicitly called out
- Props verified against Pixel docs where uncertainty existed
- Icon names verified with `get-icon-name`
- Existing `Erp*` pattern reused instead of a new component where possible
- Layout and spacing match the intended hierarchy
- Hover, disabled, error, and loading states handled where relevant
- No stray inline styles or unnecessary raw values
- `npx vitest run tests/design` run when patterns or the default layout changed

## Reference Loading Guide

- Read `setup.md` before coding if project readiness is uncertain.
- Read `validation.md` before generating code.
- Read `components.md` when mapping UI or resolving prop issues.
- Read `styling.md` when adding layout or custom visual rules.
- Read `design-tokens.md` when selecting Enterprise token values.
- Read `structure.md` and `code-structure.md` immediately before final code generation.
