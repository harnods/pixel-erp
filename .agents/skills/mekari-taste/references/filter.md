# Filter

> Validate Pixel components via `get-component` before writing code. MCP owns prop/slot/event names; this file owns which values to use and Mekari-specific conventions.

**Note: this reference is a starting draft.**

> If you have a specific filter pattern from existing Mekari products (Expense transaction filter, Talenta employee filter, Qontak deal filter), enrich this file with the concrete filter inventory, chip behavior, and saved-views pattern. Treat the rules below as the minimum bar.

## When to use which variant

| List size / complexity                           | Variant                      |
| ------------------------------------------------ | ---------------------------- |
| Up to 3 filter dimensions, each with few options | Inline dropdowns in toolbar  |
| 4+ filter dimensions OR complex multi-criteria   | Filter button → drawer/panel |
| Free-text search across all fields               | Standalone search input      |
| Date range is the primary filter                 | Inline date range picker     |

## Variant A: Inline dropdowns

Each filter is its own dropdown in the toolbar, left-aligned.

```
[Status: All ▾]  [Category: All ▾]  [Date: This month ▾]    [Search...]
```

- Dropdown trigger styling: outline button, 32px height, padding `pxl-space-xs` 8 horizontal, `Label/Regular` 14.
- Label format: `<Dimension>: <Current value>`. "All" when nothing is filtered for that dimension.
- Active filter (not "All"): trigger button bg `background.brand.selected`, text `text.selected`. This signals at a glance which dimensions are filtered.
- Open panel: same as form select panel. Multi-select shows checkboxes, single-select shows radio dots or check on selected.

### Search input

> Call `get-component("input with left addon")` for a code example

- Always on the right of the filter dropdowns, separated by `pxl-space-md` 16 gap.
- 32px height, `pxl-radii-md` 6, leading magnifier icon `icon.default`.
- Placeholder: specific, like "Search by name or ID" — not "Search".
- Debounce: 300ms before triggering search.

**Pixel 3 implementation** — use `MpInputGroup` + `MpInputLeftAddon` with `MpIcon name="search"` inside. Never use `MpInput left-icon` — that prop does not exist in Pixel 3.

### Filter dropdown

> Call `get-block("general-form-popover-select")` for a code example

Omitting it renders the dropdown shorter than the toolbar. Width: `240px` wrapper, not full-page-width.

## Variant B: Filter button → drawer/panel

When there are many dimensions or some require complex inputs (number ranges, multi-select with search).

```
[Filter ⓘ 3]  [Search...]
```

- "Filter" button is outline, 32px, `Label/Regular` 14 + filter icon. The `3` is a count of active filters in a small pill `background.brand.bold`/white text, radius full.
- Click opens a right-side drawer (~400px wide) sliding in from right.

### Drawer anatomy

> Call `get-component("drawer")` for a code example

- Header: `Heading/H3` "Filters", `×` close button.
- Body: vertical list of filter dimensions, each a sub-section with a label and the input control (checkbox list, date range, etc.).
- Footer: sticky bottom, "Clear all" text link left, "Apply filters" primary button right.
- Don't apply filters live as the user toggles — wait for "Apply". This avoids reloading the table multiple times for users adjusting several criteria.

### Active filter chips below the toolbar (optional but recommended)

When filters are applied, show them as removable chips just below the toolbar:

```
Status: Approved ×    Category: Subscription, Software ×    Date: This month ×
                                                            Clear all ←text link
```

- Chip styling: pill `pxl-radii-full` 999, bg `background.brand.selected`, text `text.selected`, `Label small/Regular` Semibold.
- Each chip has an `×` to remove that filter only.
- "Clear all" text link far right.

## Date range filter

A common dimension that deserves its own pattern.

- Trigger: dropdown showing preset + custom: "Date: Last 30 days ▾".
- Open panel:
  - Left: preset list — Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, This year, Custom range.
  - Right (only if Custom): two date pickers (start, end) and an Apply button.
- Show the selected range in the trigger label: "Date: 1 Jan 2026 – 31 Jan 2026" if custom.

## Filter persistence

- Within a session: filters persist as the user navigates back and forth.
- Across sessions: persist in URL query params so the user can bookmark or share filtered views.
- Per user (saved views): if PM wants this, add a "Save view" action — see "Saved views" below.

## Saved views (advanced)

For users who repeatedly use the same filter combination.

- "Save view" text link in the toolbar after filters are applied, opens a small dialog: name the view.
- Saved views appear as a tab strip or dropdown above the table: "All", "My approvals", "Rejected this month".
- Default view is "All", non-removable.
- User can edit/delete their own saved views.

This is a nice-to-have, often deferred — only design it if PM explicitly asked.

## Empty filter result

When filters return zero rows, show inline filtered-empty (see `empty-state.md`):

```
        No results found
   Try adjusting your filters.
        [Clear all filters]
```

## Filter values that depend on other filters

Sometimes options in dimension B depend on the selection in dimension A (e.g. "Category" options depend on "Module"). Handle this carefully:

- Don't silently change dimension B's options when A changes — show a brief disabled state + note "Select a module first" if B is disabled.
- If a user already selected B values and then A changes, invalidating some B selections, show a chip warning: "Filter `Category: X` removed (no longer applicable)."

## Edge Cases

- **Filter on encrypted/personal data**: can the filter even run server-side? Sometimes "Search by phone number" requires hashing or special indexing.
- **Filter result count**: should the trigger show "(247 results)" after applying? Useful, but verify with PM if the count query is cheap.
- **Permission-aware filters**: should filter options be hidden if the user can't act on those records? Default: show all options, filter visibility separately at row level.
- **URL length limits**: many filters with many values can exceed URL length. Use compact query encoding (filter IDs not names) or POST-backed views.
- **Default filter on load**: does the user see "All time" or "This month" by default? Often missed — pick based on the most common use case.

## Output Contract

When you ship a filter:

- Variant chosen with reasoning.
- Filter dimension inventory: name, type (single/multi/range/text), options or source.
- Default filter state on first load.
- Persistence behavior (session, URL, user-saved).
- Dependency rules between filters.
- Behavior on zero results.
