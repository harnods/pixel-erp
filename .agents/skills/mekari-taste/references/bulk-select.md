# Bulk select

> Validate Pixel components via `get-component` before writing code. MCP owns prop/slot/event names; this file owns which values to use and Mekari-specific conventions.

Selecting multiple table rows to perform an action on all of them at once. Common in transaction lists, employee lists, approval queues.

**Note: this reference is a starting draft.**

> If you have specific bulk-action patterns from existing Mekari products (Expense bulk approve, Talenta bulk export, Qontak bulk reassign), enrich this file with the concrete copy, action inventory, and confirmation behavior. Treat the rules below as the minimum bar.

## When to use this pattern

- The list has actions that meaningfully scale (approve, reject, export, archive, delete, reassign).
- It's reasonable for a user to want to act on 10+ rows at once.
- The action is the same regardless of which rows are selected (e.g. "Approve" works the same on row 1 and row 50).

Don't add bulk select just because checkboxes are easy. They add visual noise. Earn them.

## Anatomy when no rows are selected

Standard table with a leading checkbox column:

```
┌─────────────────────────────────────────────────────┐
│ ☐  Col1     Col2     Col3     Col4                  │  <- header with select-all checkbox
├─────────────────────────────────────────────────────┤
│ ☐  row data ...                                     │
│ ☐  row data ...                                     │
└─────────────────────────────────────────────────────┘
```

- Checkbox column width: ~40px, fixed.
- Checkbox cell padding: vertical-center, `pxl-space-md` 16 horizontal.
- Header checkbox toggles select-all-on-current-page. **Not** select-all-records — that's a separate action (see below).

## Anatomy when rows are selected — action bar replaces table header

When ≥ 1 row is selected, the table header transforms into a bulk action bar **in place** (don't push the table down or float a new toolbar):

```
┌─────────────────────────────────────────────────────┐
│ ☑  3 selected   [Approve]  [Reject]  [⋮]      [×]   │
├─────────────────────────────────────────────────────┤
│ ☑  row data ... (selected, bg tint)                 │
│ ☐  row data ...                                     │
│ ☑  row data ... (selected, bg tint)                 │
└─────────────────────────────────────────────────────┘
```

### Action bar anatomy

- Background: `background.brand.selected` (`#D6DBF7`) lightened, or `#EEF2FF` if that token isn't available. Subtle, not strong.
- Height: same as standard header (~44px).
- Left: select-all checkbox (now showing indeterminate or checked state) + count text `Label/Semibold` 14 "N selected".
- Middle (left-aligned right after the count): primary bulk actions as outline buttons (`Approve`, `Reject`, `Export`). Limit to 3 visible actions; rest go in `⋮` overflow.
- Right: close `×` button to clear selection.

### Selected row state

- Row background: `background.brand.selected` lightened (~`#EEF2FF`).
- Other row styling unchanged.

## Select-all-records (across pages)

When the user clicks the header checkbox to select all visible rows, show a banner below the action bar:

```
All 10 on this page are selected.   Select all 247 records  ←text link
```

- Banner bg: same as action bar bg, subtle.
- Padding: `pxl-space-xs` 8 vertical, `pxl-space-md` 16 horizontal.
- "Select all 247 records" is a text link in `text.link`.
- After clicking, the banner changes to:
  ```
  All 247 records are selected.   Clear selection  ←text link
  ```

This separation between "all on this page" and "all in the dataset" is important — most users only want the visible 10.

## Action buttons in the bar

- Use the same outline button styling as elsewhere on the page.
- Label is a verb in imperative: "Approve", "Reject", "Export", "Archive", "Delete".
- Destructive actions (Delete, Reject without nuance, Archive) get a confirmation dialog. See `confirmation.md`.

## What happens after action completes

- Success: toast appears with the result ("3 transactions approved"). Selection clears. Table refreshes in place.
- Partial success (3 of 5 succeeded): toast plus banner above the table listing what failed and why. Selection retained for the failed rows only, so the user can retry.
- Full failure: banner above the table with error and a "Retry" link. Selection retained.

## Pagination interaction

- Changing the page while rows are selected: keep selection. Show a small persistent counter near pagination: "3 selected across all pages".
- Re-filtering while rows are selected: keep selection of rows not affected by the filter; show a counter "3 selected (1 hidden by filter)" if some selected rows fall outside the new filter.
- These behaviors can confuse users — if the product is high-stakes (finance approvals), prefer clearing selection on page change and warning the user.

## When not to use bulk select

- Lists with mostly bespoke actions per row (each row needs a different action).
- Lists where the same action across rows is rare in practice (PM should check analytics).
- Mobile-first views — bulk select on touch is awkward; design a different flow.

## Edge Cases

- **Max selection limit**: is there a server limit on how many records can be acted on in one batch? Common: 100 or 500. Surface in the action confirmation: "You're about to approve 247 records. This may take a moment."
- **Mixed-state selection**: user selects rows that aren't all eligible for the chosen action (e.g. selecting "Approve" when some rows are already approved). Default: action only applies to eligible rows; show in result toast "2 approved, 1 already approved (skipped)."
- **Permission-gated rows**: user selects rows including some they don't own. Server should reject; UI should ideally prevent selection in the first place via row-level disabled checkbox with tooltip "You don't have permission to act on this row."
- **Real-time changes**: a row the user selected gets updated by someone else mid-action. Default: act on the user's snapshot, surface conflicts in the result toast.

## Output Contract

When you ship bulk select:

- Action inventory with labels and which require confirmation.
- Max selection limit and copy when reached.
- Behavior on page change / filter change with selection active.
- Permission handling for ineligible rows.
- Partial-success result UX.
