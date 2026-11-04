# Empty state

> Validate Pixel components via `get-component` before writing code. MCP owns prop/slot/event names; this file owns which values to use and Mekari-specific conventions.

A view shown when there's no data yet. Anchored example: "Reimbursement benefit will appear here" in the Talenta reimbursement form.

**Empty State block check:**

> Before writing empty state code, call `get-block("general-display-empty-state")`.
> Apply the rules below to customize empty states.

## When to use this pattern

Three contexts:

1. **First-time empty** (no records ever created) — the most important to design well; it teaches the user what to do.
2. **Filtered to empty** (records exist, but the current filter has no matches) — inline, no illustration.
3. **Section empty inside a populated screen** (a sub-section of a detail view or form has no items yet) — small inline empty, no full illustration.

This file covers all three; the anatomy differs.

## First-time empty (full illustrated)

```
              [3D illustration, ~120–160px]

         Title (Label/Semibold, larger)
       Helper text pointing at the action

                [Primary CTA button]
```

### Layout

- Center the whole block in the available content area, both axes.
- Width: max ~400px so the helper text wraps naturally.
- Vertical: at least `pxl-space-4xl` 80 padding top and bottom inside the container.

### Illustration

- **Mekari uses colored 3D-style illustrations** for empty states — this is the one place playful imagery is welcome. Examples: a folder with a question mark, a clipboard with a magnifying glass, an empty inbox tray.
- Source: design system assets. **Do not generate new illustrations** — use the ones in the Pixel/Mekari asset library to keep visual consistency across products.
- Size: 120–160px on the longest edge. Don't exceed 200px or it dominates.
- Gap below illustration: `pxl-space-md` 16.

### Title

- Style: `Label/Semibold` 16 or `Heading/H3`.
- Color: `text.default`.
- Voice: **descriptive of what will appear**, not motivational.
  - ✅ "Reimbursement benefit will appear here"
  - ✅ "No transactions yet"
  - ✅ "Your team's expenses will show up here"
  - ❌ "Let's get started!"
  - ❌ "Oops, nothing here!"
  - ❌ "It's quiet in here..."

### Helper text

- Style: `Label small/Regular` 14, `text.secondary`.
- Voice: **points at the action** with the literal button name bolded.
  - ✅ "Add benefit from **Add benefit** button."
  - ✅ "Click **Create transaction** to record your first expense."
  - ✅ "Once your team submits a request, it'll appear here for your review."
  - ❌ "Click below to begin your journey."
  - ❌ "Tap the button to add your first benefit."

### CTA

- Primary brand-bold button when the user can act directly from here.
- Place it `pxl-space-md` 16 below helper text.
- Use the same label as the button used elsewhere on the page (consistency over creativity).
- If the user can't act (e.g. the empty state is from waiting on someone else: "Your manager hasn't assigned any tasks yet"), omit the CTA. Don't fake an action.

## Filtered-to-empty / search-to-empty (not-found states)

Used when the user has actively filtered or searched and got zero results. There are two distinct variants:

### Search not found

```
        [not-found illustration, 260×260px]

          "[query]" not found
  Recheck the keywords you have typed
         and try searching again.
```

### Filter not found

```
        [not-found illustration, 260×260px]

           [Object] not found
  Recheck the filter you have applied
          and try filtering again.
```

### Layout rules (both variants)

- **Table header stays visible** — these are sibling elements rendered below `MpTableContainer`, not inside the table body. The header row provides context: "yes, the table is here, you just filtered it empty."
- Alignment: `direction="column" alignItems="center" flexGrow="1" pt="6"` (24px top padding from the table header). Do **not** use `justifyContent="center"` — that floats the content in the middle of the remaining space.
- Max width of inner content block: `400px`.
- Illustration: use the shared `/not-found.png` asset (260×260px, `objectFit: contain`). **Do use an illustration** — it signals "nothing matches" without implying the system broke.
- Title: `Heading/H3 Semibold`, `text.default`.
  - Search: quote the literal search term in the title — `"[query]" not found`
  - Filter: "[Object] not found" (no quotes, no search term)
- Helper: `Label/Regular`, `text.secondary`, centered.
- No CTA button — the user recovers by editing the search or filter, not by taking an action.

> **Why an illustration?** Mekari's Qontak pattern (ai-agents, tickets) uses the not-found illustration for both variants. It differentiates "filtered to nothing" from "never had data" (which uses the feature-specific illustration) while still communicating state clearly. The old guideline "never illustrate filtered-empty" comes from a different product context; for Qontak, use the illustration.

## Section-empty inside a populated screen

Used when a sub-section of a larger screen has no items yet. Most common in forms with dynamic line items and in detail views with optional attachment sections.

### Form sub-section empty (with add affordance above)

The "Add benefit" pattern in Talenta:

```
H3 Benefit component
[Add benefit button]                          [Search]

              [3D illustration, smaller ~100px]

         Reimbursement benefit will appear here
        Add benefit from Add benefit button.
```

- The add button is **outside** the empty state, top of the section. This is important — it stays in the same position whether the section is empty or populated.
- The empty state is inside the section's bounds, centered, with `pxl-space-3xl` 40 vertical padding.
- Smaller illustration than full-page empty (~100px).
- Helper text references the button literally with bold formatting.

### Detail view sub-section empty (minimal)

If a detail view card has a sub-section with no data ("Attachments: none"), don't use a full empty state. Just write:

```
Attachments        — No attachments
```

Or as a regular row with em dash. The reader is scanning a detail view; a big illustrated empty inside one sub-section breaks the rhythm.

## Error states are not empty states

If the reason for empty is "we couldn't load the data" (network error, permission denied, server error), that's an **error state**, not empty. Different copy, different illustration (the warning-style asset, not the friendly one), and an action button labeled "Retry" or "Refresh".

## Loading states are not empty states either

While loading initial data, show skeleton placeholders, not the empty state. Only show the empty state once you've confirmed there's no data.

## Edge Cases

- **Slow-loading data**: what's the threshold between "still loading" and "definitely empty"? Default: keep skeleton for first 300ms, then if still no data, show empty. Don't flash empty briefly during a fast load.
- **Permission-based empty**: user has access to the page but no records they can see. Same empty layout but different copy: "You don't have any [entity] assigned to you yet" instead of "no entity exists".
- **Filtered + first-time empty**: a brand-new user filters before any data exists. Show first-time empty (it's more useful), and remove the filter chips silently — or show filtered empty with a hint "Your team hasn't added any records yet. Once they do, you can filter here."

## Output Contract

When you ship an empty state:

- Identify which variant (first-time / filtered / section-empty).
- Title and helper copy with bolded button name.
- Illustration choice (asset name from design system, not a description).
- CTA label and behavior.
- Specify what happens after first record is added (does the empty state disappear immediately? animation?).
