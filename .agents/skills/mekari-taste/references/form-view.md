# Form view

> Validate Pixel components via `get-component` before writing code. MCP owns prop/slot/event names; this file owns which values to use and Mekari-specific conventions.

A page for creating or editing a single record. Anchored example: Request reimbursement in Talenta, Create transaction in Expense, Add employee in Talenta.

## Anatomy

```
Page header: H1, for example "Request reimbursement" -> validate that this exists; if not, check `./mekari-screen.md`
Page content: Single default -> validate that this exists; if not, check `./mekari-screen.md`
┌──────────────────────────────────────────────┐
│ H2 ex: "Reimbursement info"                  |
| Description info                             |
│ [Form fields, single column, max 440px]      │
│                                              |
| Field label *                                │
│ [Input              ▾]                       │
│ Helper text                                  │
│                                              │
│ Field label *                                │
│ [Input              ▾]                       │
│                                              │
│ Section divider                              │
│                                              │
│ H3 Sub-section                               │
│ [Sub-section content]                        │
└──────────────────────────────────────────────┘
                            [Cancel]   [Submit]
```

## Form

**Form block check:**

> Before writing form code, call `get-block("general-form-form")`.
> It covers the standard multi-section form pattern (text input, select, textarea, section dividers, sticky footer).
> Apply the rules below to customize field layout, validation, and error states.

## Form column width

- Single column, left-aligned.
- **Maximum 6 columns** (out of a 12-column grid). In practice this is ~440px for most forms, up to ~560px if any field needs wider input (date range, multi-select with chips).
- Form sits **left-aligned within the content area** — right side stays empty. This is deliberate: forms are vertical-scanning tasks, the empty space on the right reduces eye travel and leaves room for inline help if needed.
- Exception: forms with side-by-side related fields (start date / end date, address city / postal code) can use a 2-column grid for those rows only. Field pairs: gap `pxl-space-md` 16.

### Form group

> Call `get-component("form control")` for code example.

Every field is a vertical stack with `pxl-space-2xs` 6 gap between elements:

1. **Label** (top): `Label/Semibold` 14, `text.default`. Required indicator is a red asterisk `*` in `background.danger.bold` immediately after the label text with a small gap (`pxl-space-3xs` 4).
2. **Input** (control): the field itself.
3. **Helper text** (below): `Label small/Regular` 12, `text.secondary`. Optional but encouraged for complex fields.
4. **Error message** (replaces helper text on validation fail): `Label small/Regular` 12, `background.danger.bold`.

Gap between fields (vertical): `pxl-space-md` 16.

### Input controls

> Call `get-component("input")` for code example.

- **Placeholder**: example/format hint only (e.g. `john@mekari.com`) — never a substitute for the label.
- **File upload**: always include helper text stating allowed formats and max size. Full spec in `upload-flow.md`.
- **Checkbox/radio/toggle**: use Pixel components, never roll custom.
- **Default size**: `size="md"` on all form controls — Pixel internal default is `sm`.

### Section structure within a form

For longer forms, split into sub-sections inside the same card:

1. First sub-section: fields directly under H1 (no sub-header needed).
2. Subsequent sub-sections: horizontal divider `border.default` 1px full-width, then `pxl-space-xl` 24 gap, then `Heading/H3` sub-section title, then fields.

Example: a reimbursement form has the request meta on top (date, name, attachment, description), then a divider, then "Benefit component" as H3 with related fields.

If sub-sections become too long, consider multiple cards instead of dividers — but only if the sub-sections are independently submittable or logically separate (rare in a single form).

### Empty / placeholder state for dynamic sub-sections

Some form sections are populated by user action — e.g. "Benefit component" empty until the user clicks "Add benefit", a line items table empty until rows are added.

When empty:

- Show a small illustrated empty state centered inside the section. See `empty-state.md`.
- Title: descriptive of what will appear ("Reimbursement benefit will appear here").
- Helper: action-pointing with the literal button name bolded ("Add benefit from **Add benefit** button.").
- The add-action button sits **above** the empty state (top-left of the section, outline button), not inside the empty state itself. This way the affordance is reachable whether the section is empty or populated.

When populated:

- Sub-section transitions to a small inline table or list of the added items, with edit/remove affordances per row.

### Action footer

> Call `get-component("button group")` for code example.

Always at the bottom, sticky or naturally flowing. Button pair is **right-aligned** at the trailing edge of the form column width:

- **Cancel** — always `variant="ghost"`. Never secondary, never textLink. Positioned left of Submit.
- **Submit** — always `variant="primary"` (brand-bold). Right-most button. Label is a verb specific to the action: "Submit", "Create transaction", "Save changes", "Send request". Not "OK" or "Done".
- For long forms with intermediate steps, add **Save draft** as `variant="secondary"` between Cancel and Submit.
- Gap between buttons: `pxl-space-md` 16.
- **Alignment**: the footer row shares the same `width` container as the form fields (e.g. `560px`) so `justify-content: flex-end` actually reaches the form's right edge. Never use `maxWidth` alone — the footer flex container must have the same fixed `width` as the form wrapper.

For multi-step forms (wizards), the footer also has **Back** and **Next** instead of Submit until the last step.

## Form Validation (must have)

### When to validate

- **On blur** for individual fields with format requirements (email, phone, currency).
- **On submit** for everything else.
- **Never on every keystroke** — that's noise.

#### Error display

- Field-level: helper text replaced with error message, Field border turns red.
- Form-level (multiple errors or non-field errors like server validation): banner at the top of the form card. Banner bg `#FBE9E7`, border `background.danger.bold` 1px left, padding `pxl-space-md` 16. Icon (alert-circle) `background.danger.bold` left of text. Plain language: "We couldn't submit your request. Please review the highlighted fields."
- **Don't** scroll the user to the first error automatically — focus the first invalid field instead, which the browser scrolls to gracefully.

#### Success state

- After successful submit, navigate away (usually to the detail view of the created record, or back to the index). Show a success toast briefly.
- Do not show "Form submitted!" inside the form itself unless the form stays open for repeat entries.

### Conditional fields

When a field's visibility depends on another field's value:

- Reveal/hide with a brief fade-in (150ms), don't slide.
- Maintain field order — don't move existing fields up/down to fill space.
- Conditional fields are still subject to the same validation; if hidden, treat their value as null/empty.

## Edge Cases

- **What's the max length** of free-form fields? Default text limit if PM didn't say: 255 chars for short text, 2000 for textarea.
- **Auto-save behavior** — does this form auto-save drafts? If yes, where's the indicator ("Saved 2 seconds ago")?
- **Unsaved changes warning** — does the user see a confirm if they navigate away with unsaved changes? Default: yes for edit forms, no for create forms with empty state.
- **Server-side validation** — what errors can come back from the API that the form needs to render? Default banner copy listed above is generic; PM may want product-specific copy.
- **Field-level permissions** — can some fields be view-only based on user role? If yes, render them disabled with helper text "You don't have permission to edit this".
- **Pre-filled values** — for edit forms, what state should the form show on load? Confirm whether placeholders are still useful or if the existing values fill in.
- **Cancel behavior** — does Cancel discard changes immediately, or show a confirm? Default: confirm if dirty, immediate if clean.

## Common Mistakes

- **Two primary buttons.** A form has exactly one primary action (Submit, Save, Create). If there's a secondary action (Save draft), it's `variant="secondary"`. Cancel is always `variant="ghost"` — never primary, never secondary.
- **Primary button inside a card.** If a form section has a sub-action (like "Add benefit" inside a Benefit component section), that action is an outline button, not a primary. The page-level primary lives in the footer.
- **Form group exceeding 6 columns.** Never stretch the form group beyond 6 columns regardless of screen width or stepper layout.
- **Custom stepper variants.** Never create a new stepper style — use the Pixel stepper component as-is. Completed step states follow the component definition exactly.

## Output contract for this pattern

When you ship a form view:

- Field list with: name, control type, required y/n, validation rule, helper text copy.
- Section structure (single section or sub-sections with dividers).
- Footer action labels (Submit verb specific to the action).
- Validation strategy (on blur vs on submit per field type).
- Error copy for known failure cases.
- Cancel and unsaved-changes behavior.
- Auto-save behavior (if any).
