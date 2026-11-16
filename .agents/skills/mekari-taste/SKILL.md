---
name: mekari-taste
description: "Imagination sub-skill for Mekari PRD-to-code workflows — reads a PRD, applies Mekari visual principles, draws low-fidelity wireframes per screen, and drafts an implementation plan before code generation. Loaded by implement-to-pixel on the PRD path; can also trigger directly when the user asks to visualize, wireframe, or plan a Mekari screen from a PRD."
metadata:
  author: design@mekari.com
  version: '2026.6.29'
  source: https://ai.mekari.design/skills?skill=mekari-taste
---

# Mekari Taste — Imagination Phase

The imagination phase for Mekari PRD → code workflow. Reads PRD, applies five visual principles, draws wireframes, drafts a plan. Then stops and waits for user confirmation before `implement-to-pixel` resumes code generation.

## When this loads

Loaded by `implement-to-pixel` when input is a PRD (Confluence URL, pasted text, or chat description). Not loaded when input is Figma — Figma already has visual structure, no imagination needed.

If you find yourself loaded directly (without `implement-to-pixel` as the parent), check the input. If it's a PRD and the user is asking for code, run the workflow below. If it's Figma, redirect the user to attach via `implement-to-pixel`.

## The five visual principles

These are the lens you use to imagine the screen before drawing. Apply them mentally as you read the PRD — the wireframe should reflect them visually.

### 1. Layered, not flat

A Mekari screen is readable as architecture before content. Two background tones alternate across zones — `background.surface` for framing (app shell, sidebar, page header, table headers) and `background.stage` for content (work area, card interiors, table body rows). The eye understands the structure in a single sweep.

When you draw the wireframe, show this layering. Don't make everything one color.

### 2. Quiet by default, loud only when needed

Color is signal, not decoration. Brand color belongs to the primary action. Status colors belong to status indicators. Backgrounds stay neutral. Most of the screen is calm, so the few things that matter pop.

When you draw the wireframe, reserve color for the one or two things on the screen that genuinely deserve attention.

### 3. Accountability is visible

Status fields don't just say "Approved" — they say "Approved by [name], [timestamp]". Trust comes from showing who and when, not hiding it. Essential for finance/HR/payroll/tax tools where audit-ability is built in.

When you imagine a screen with status data, include actor and timestamp in your mental picture.

### 4. Density with breathing room

Mekari is a workplace, not a feed. Users scan hundreds of rows in a sitting. Pack the information, but don't pack the eye. Generous-but-not-luxurious spacing. Rows over cards. Right-aligned numbers.

**No cards for index lists or form sections.** Cards add visual weight and consume vertical space. Index lists use table rows — flat, bordered, scannable. Form sections use dividers and sub-headings — not boxed containers. Cards are reserved for summary/highlight content (like a package summary above a table), not for repeating list items or grouping form fields.

When you imagine the layout, lean dense — multiple rows visible without scrolling, but each row legible.

### 5. Frames hold, content does

Different zones have different jobs. Frames (nav, page header, table headers) orient the user. Content (work area, body rows, card interiors) is where work happens. Frames are quieter; content is brighter. Active state lights up the selected item in the frame.

When you draw the wireframe, make the frame-vs-content distinction visible.

## Workflow

### Step 1: Read the PRD completely

- If Confluence URL or uploaded PDF → fetch and read the full page
- If pasted text or chat description → use that directly

Capture: goal, user story, scope (in/out), functional requirements, acceptance criteria, copy already specified (labels, helper text, error messages, empty state copy), explicit edge cases.

Detect the product (Expense, Talenta, Qontak, etc.) from logo references, breadcrumb, space name, or repeated mentions. Ask only if no signal is present anywhere.

### Step 2: Identify screens and detect app shell

A PRD often describes multiple screens (list page + detail page + create form, etc.). List each distinct screen. The output will be one wireframe per screen.

Run app shell detection from `references/mekari-screen.md §1` before identifying patterns. Check for layout file, navbar, and sidebar components in the project. Follow the decision table: if the shell is already installed, note the layout path; if not, note that `get-block` is needed. This finding feeds `**Shell wrapper**` in the plan (Step 6).

### Step 3: For each screen, identify Mekari patterns

Match what the screen does to available pattern references in:

- Page listing many records → `./references/index-view.md`
- Page for creating/editing a record → `./references/form-view.md`
- Page showing one record with many fields → `./references/detail-view.md`

Companion patterns (nested inside the primary pattern):

- "No data yet" state → `./references/empty-state.md`
- File upload UI → `./references/upload-flow.md`
- Multi-row table actions → `./references/bulk-select.md`
- Filter or search toolbar → `./references/filter.md`
- Destructive confirmation → `./references/confirmation.md`

Every screen also uses `mekari-screen.md`. Read only the references for patterns actually present.

> **Per-row action inference:** If the PRD mentions per-row actions (approve, reject, delete, assign), always ask: can these actions also apply to multiple rows at once? If yes or unclear → identify `bulk-select.md` as a nested pattern and list it in **Open gaps** for PM confirmation.

### Step 3.5: Validate against Pixel MCP before planning

After identifying which patterns and components apply, validate each against the Pixel MCP **before** drafting the plan. This ensures reference files don't silently go stale.

Full gate table, block resolution order, and MCP authority rule: read `../pixel/references/validation.md`.

**This step is a blocking gate.** Do not proceed to Step 4 (imagination) until every item below is done:

- For each reusable UI section (page header, data table, empty state, pagination, confirmation modal): call `get-block("list all")` and identify the matching block, unless a `pixel-blocks/` file already covers it.
- For each primary `Mp*` component the screen will use: call `get-component("<name>")` and note key prop constraints (especially non-obvious ones — action cell pattern, size rules, slot names).
- For each icon name used: call `get-icon-name` to confirm it exists.

**Anchor all findings in the plan.** Record MCP results as a required plan section `**Pixel constraints**` — not just component names, but the key constraint from each MCP call that will affect how the code is written. This section persists into the code generation phase so `pixel` refers to it rather than re-deriving from memory or prior knowledge.

**Required output:** Write the `**Pixel constraints**` block in the conversation now, before proceeding to Step 4. The wireframe step does not start until this block is written.

Example:

```
**Pixel constraints**:
- MpTable action cell → single MpButton variant="secondary" right-icon="chevrons-down" + MpPopover (not multiple sibling buttons)
- MpBadge for="tableStatus" → use for status pills in table rows
- MpDatePicker is-range="true" → for date range filter
- get-block("general-layout-page-header-default") → use for page header
- get-block("general-data-table") → use for table + filter + pagination bundle
```

### Step 4: Imagine the screen using the five principles

Before drawing, think through each screen in order:

1. **App shell** — Where does the nav sit? What's in the page header area? Where does the content area start?
2. **Primary pattern** — What's the main content? Detail key-value list, index table, or form?
3. **Nested patterns** — Filter toolbar? Empty state? File upload? Bulk select?
4. **States** — What does this screen look like when data is empty, loading, errored, or has null values? The PRD usually shows only the happy path; fill the rest from Mekari defaults.
5. **Copy gaps** — What labels, helper text, error messages, empty state copy is missing from the PRD?
6. **Accountability** — Any status fields that need actor + timestamp?

### Step 5: Draw the wireframe

Use the visualizer skill (`visualize:show_widget` with SVG mode) to render an SVG wireframe of each screen. The wireframe must show:

- Two distinct background tones to convey frame-vs-content: `background.surface` for frame zones (outer wrapper, nav rail, page header) and white (`background.stage`) for the content area. Frame zones share one tone — don't draw the page background as a third color.
- Navbar with product logo placeholder and right-side cluster (user, notifications)
- Sidebar with abbreviated nav items (active item highlighted)
- Page header area with breadcrumb (if any), H1, status pill (if any), primary CTA (top-right)
- Page content (data table, description list, form fields, etc.) at low fidelity — boxes and labels, not real content
- Annotations for states filled in by default (e.g. small note "empty state: illustrated, will appear when no records")
- Annotations for gaps the user should confirm (e.g. small note "needs PM input: max selection limit")

Keep the wireframe at sketch fidelity — the goal is to validate structure and pattern choice, not visual polish. Use solid neutral colors for layering, brand color sparingly for the one or two things that matter (primary CTA, active nav, status pill).

Wireframe sizing: SVG width 680px (viewBox `0 0 680 H`), height as needed. Render one wireframe per screen.

### Step 6: Draft the implementation plan

After all wireframes are rendered, write a structured plan. **Every required section must be filled. Do not present the plan with a blank or "TBD" required section — fill it first, using Mekari defaults where the PRD is silent.**

`pixel` validates this plan on receive. A missing required section stops code generation.

```
## Plan for [Product] — [Feature/Flow name]

### Screens identified
1. [Screen 1 name] — patterns: [list]
2. [Screen 2 name] — patterns: [list]
...

### Per screen

#### Screen 1: [name]
**Patterns** _(required)_: mekari-screen + [primary] + [nested if any]
**Shell wrapper** _(required)_: [Layout installed at `path/to/default.vue` — use `get-block("general-layout-mekari-screen-default")` for page content wrapper, skip if already called this session] OR [No layout found — call `get-block("general-layout-mekari-screen-default")` first]
**Pixel constraints** _(required — filled from Step 3.5 MCP calls, not guessed)_:
  - [ComponentName or block] → [key constraint that affects how the code is written]
  - [e.g. "MpTable action cell → single MpButton variant='secondary' right-icon='chevrons-down' + MpPopover"]
**States** _(required — all four must appear or be explicitly marked N/A)_:
  - Empty: [describe or "N/A — always has data"]
  - Loading: [skeleton or spinner — describe]
  - Error: [API failure behavior]
  - Null values: [what cells/fields show when data is missing]
**Copy defaults applied** _(required — list every string the PRD didn't specify)_:
  - [key]: [value used]
**Conventions applied** _(required — list Mekari taste decisions made)_:
  - [e.g. "status shown as actor + timestamp", "rows not cards for the list"]
**Open gaps** _(required — list PM/design decisions; "none" if truly none)_:
  - [e.g. "max selection limit not specified in PRD"]

[Repeat per screen]

### Next step
If the plan and wireframes look right, say "looks good" or "go ahead" and `implement-to-pixel` will generate Vue/Nuxt code from this plan. If anything needs adjustment, tell me what to change — I can revise the plan or redraw a wireframe before code generation.
```

### Step 7: Pre-flight check

Before presenting the wireframes and plan to the user, verify every item below. Fix any failure before proceeding.

- [ ] Step 3.5 blocking gate completed: `get-block` called for every reusable section, `get-component` called for every primary Mp\* component, `get-icon-name` called for every icon
- [ ] `**Pixel constraints**` block written in the conversation (the actual output exists, not just claimed)
- [ ] Plan includes `**Pixel constraints**` section with key constraints — not just component names
- [ ] Every screen has a wireframe rendered (not skipped or described in text only)
- [ ] Wireframes show two distinct background tones (surface frame zones vs white content area)
- [ ] Pattern identification for every screen is grounded in a reference file (not guessed)
- [ ] Every screen includes at minimum: empty state, loading state, and error state in the plan
- [ ] Status fields on any screen are planned with actor + timestamp (not just the status value)
- [ ] All copy gaps from the PRD are either filled with a Mekari default or flagged as an open gap — nothing left blank
- [ ] Open gaps that require a PM/design decision are listed clearly and distinctly from defaults

### Step 8: Wait for user confirmation

After the pre-flight check passes and wireframes + plan are presented, **stop and wait**. Do not generate code. Do not call `implement-to-pixel`.

The user will either:

- **Confirm** ("looks good", "go ahead", "yes proceed") → control returns to `implement-to-pixel` to take the plan and generate code
- **Request changes** ("change the empty state", "use a different pattern for screen 2", "add X") → revise the plan, redraw affected wireframes, present again
- **Ask questions** → answer using these principles and references; stay paused until user confirms

## Companion skills

- **`implement-to-pixel`** — the orchestrator; loads this skill for Branch A, then takes the confirmed plan and generates code
- **`visualize`** — used in Step 5 to render wireframes via `show_widget`

## Installation & Updates

This skill is managed by the `pixel-hub` CLI. To install or update:

```bash
# Install (from your project root)
npx @mekari/pixel-hub skills install --skill mekari-taste --agent claude-code --yes

# Update to latest
npx @mekari/pixel-hub skills update --skill mekari-taste --yes
```

The CLI writes files to `.agents/skills/mekari-taste/` and symlinks `.claude/skills/mekari-taste/` for Claude Code.
Lock file: `.pixel-hub/skill-lock.json` — commit this so teammates can restore with `skills install --yes`.
