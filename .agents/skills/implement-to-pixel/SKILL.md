---
name: implement-to-pixel
description: "Implement a Mekari product screen (Expense, Talenta, Qontak, Jurnal, Flex, KlikPajak, Sign) from a PRD or Figma design into Vue/Nuxt code using Pixel 3. Triggered when the user attaches a Confluence URL, a Figma URL, pastes a PRD, or asks to implement, build, or code a Mekari screen."
metadata:
  author: design@mekari.com
  version: '2026.6.29'
  source: https://ai.mekari.design/skills?skill=implement-to-pixel
---

# Implement to Pixel — Orchestrator

Entry point for Mekari product screen implementation using the **Pixel 3 design system** (Vue 3, `@mekari/pixel3`, token 2.4). Routes PRD or Figma input to the correct sub-skill, then generates Vue/Nuxt code. All output must use `@mekari/pixel3` components with Pixel 2.4 semantic tokens — no raw hex, no Tailwind.

## When this triggers

Any of the following:

- User attaches a Confluence URL or uploads a PDF
- User attaches a Figma URL
- User invokes `/implement-to-pixel` with or without an attachment

## Step 0: Scan the project first

Before reading the PRD or fetching Figma, take time to understand the existing project. This prevents generating code that conflicts with what is already there.

Check the following items. If any item is unclear, ask the user to clarify before proceeding.

| What to check           | How                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Token mode (2.1 vs 2.4) | Search for `setNextTheme` in `main.ts`, `app.vue` or any `*.ts` or `*.vue` file. If present and value is `true`, token is 2.4. Ask only if neither is clear. |
| Existing blocks         | Scan for `pixel-blocks/`, `src/pixel-blocks/`, or `app/pixel-blocks/`. If blocks exist, note their names and avoid duplicating them.                         |
| Existing layouts        | Scan for `layouts/default.vue`, `src/layouts/`, or `app/layouts/`. Check if components `Navbar`, `Sidebar` and `SidebarChild` already implemented.           |

After scanning, note any findings that affect the implementation. Surface these in the plan or output header.

### Token mode

Default to token 2.4 in all cases. Switch only if the Step 0 scan, the user, or the source explicitly mentions token 2.1 or Enterprise tokens.

## Step 1: Detect input type and route

Look at what was attached:

| Input                                                 | Route                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Confluence URL                                        | **Branch A: PRD path** (with imagination phase)                                 |
| Figma URL                                             | **Branch B: Figma path** (no imagination phase)                                 |
| Both Confluence and Figma URLs                        | Branch B (Figma is more specific), but read the PRD to fill copy/edge case gaps |
| Pasted PRD, Uploaded PDF or chat description (no URL) | Branch A                                                                        |
| `/implement-to-pixel` with no attachment              | Ask which input the user has                                                    |

## Branch A: PRD path (imagination needed)

The PRD describes intent in text; you have no visual yet. You need to imagine the screen before writing code.

### A1. Load `mekari-taste` and run the imagination phase

Load the `mekari-taste` skill. It owns the entire imagination phase — reading the PRD, detecting the product, identifying screens, imagining each screen using the five visual principles, rendering wireframes, and drafting a typed implementation plan. The output is shown to the user. The skill then stops.

### A2. Wait for user confirmation

`mekari-taste` ends with a request for confirmation. Possible responses:

- **Confirmation** ("looks good", "go ahead", "yes", "proceed", "generate code"): continue to A3
- **Revision request** ("change the empty state", "use a different pattern", "I want to add X") then loop back into `mekari-taste` to revise the plan and redraw affected wireframes; show again; wait for confirmation
- **Question**: answer using `mekari-taste` principles and references; stay paused until the user confirms

Do not generate code until the user confirms, but generate the plan and wireframes first. The plan is the contract for what will be implemented, including the components and blocks.

### A3. Generate Vue/Nuxt code from the confirmed plan

Before loading `pixel`, locate `**Pixel constraints**` in the confirmed plan. This section was written from live MCP calls during planning — it is ground truth for component APIs, not memory or prior knowledge.

If `**Pixel constraints**` is missing or empty, **stop**. Run the missing `get-block` / `get-component` / `get-icon-name` calls now, record findings, then continue.

Load the `pixel` skill. Pass the confirmed plan and the `**Pixel constraints**` section explicitly. The Pixel skill will:

- Treat `**Pixel constraints**` as first source of truth — do not re-derive from memory
- Apply token-safe styling using Pixel 2.4 semantic tokens — never raw hex
- Walk each pattern's anatomy from `../mekari-taste/references/[pattern].md`
- Follow its golden rules, output contract, and QA checklist
- Build all states from the plan: happy path plus empty, loading, and error

## Branch B: Figma path (no imagination needed)

The Figma file is the source of truth for visual structure. There's no need to imagine — translate what's there.

### B1. Fetch the Figma design

Extract `fileKey` and `nodeId` from the Figma URL, then call the Figma MCP tools directly:

- `Figma:get_design_context(fileKey, nodeId)` — structure, layout, tokens used
- `Figma:get_screenshot(fileKey, nodeId)` — visual reference
- `Figma:get_variable_defs(fileKey, nodeId)` — confirm token mode (2.4 expected)

For large nodes, use `Figma:get_metadata` first, then drill into specific children.

### B2. Detect product and confirm token mode

Read the product from the top bar logo lockup in the screenshot ("mekari expense", "mekari talenta", "mekari qontak", etc.) or from the Figma file name. Ask only if neither is clear.

If variable defs return Pixel 2.1 token shape (`$gray-600`, `Spacing/xs`), inform the user and ask whether to translate to 2.4 or keep 2.1.

### B3. Identify patterns and states, then generate code

Read the Figma screenshot and match visible patterns to `../mekari-taste/references/` files. For token names, call `get-docs("design-tokens")` on Pixel MCP. **Do not load `mekari-taste` itself** — the Figma file replaces the imagination phase.

### B3.5. Validate components against Pixel MCP

Before loading `pixel`, validate every component and block identified in B3:

- Call `get-component("<name>")` for each primary `Mp*` component
- Call `get-block("list all")` for each reusable UI section (page header, data table, pagination, modal, etc.)
- Call `get-icon-name` for each icon used

Record all findings as `**Pixel constraints**`. This section is passed to `pixel` as source of truth — do not skip.

### B4. Generate Vue/Nuxt code

**Load the `pixel` skill.** Pass it the patterns from B3, the Figma context from B1, and the state gaps identified from pattern references. The `pixel` skill owns the entire code generation workflow — component validation, token-safe styling, output structure, and QA checklist.

### B5. Validate against the screenshot

Compare the rendered output mentally against the Figma screenshot. Note deliberate deviations (e.g. "Figma used a custom shadow; replaced with flat-card Mekari convention").

## Multi-screen handling

If the plan or Figma has multiple screens, generate them in order. Each screen is one Vue file. Consider extracting shared sub-components (status pill, action footer) when used 3+ times.

## Companion skills

- **`mekari-taste`** — imagination phase for Branch A only (read PRD, draw wireframes, draft plan)
- **`pixel`** — Pixel 3 component prop API for both branches
- **`visualize`** — used by `mekari-taste` to render wireframes (not called directly by this skill)
- **Figma MCP** — called directly in Branch B via `Figma:get_design_context`, `Figma:get_screenshot`, `Figma:get_variable_defs`, `Figma:get_metadata`

## Installation & Updates

This skill is managed by the `pixel-hub` CLI. To install or update:

```bash
# Install (from your project root)
npx @mekari/pixel-hub skills install --skill implement-to-pixel --agent claude-code --yes

# Update to latest
npx @mekari/pixel-hub skills update --skill implement-to-pixel --yes
```

The CLI writes files to `.agents/skills/implement-to-pixel/` and symlinks `.claude/skills/implement-to-pixel/` for Claude Code.
Lock file: `.pixel-hub/skill-lock.json` — commit this so teammates can restore with `skills install --yes`.
