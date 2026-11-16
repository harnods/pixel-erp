# Confirmation

> Validate Pixel components via `get-component` before writing code. MCP owns prop/slot/event names; this file owns which values to use and Mekari-specific conventions.

Asking the user "are you sure?" before an action with consequences. Used for destructive, irreversible, or financially significant actions.

**Note: this reference is a starting draft.**

> If you have specific confirmation patterns from existing Mekari products (Expense reject confirm, Talenta offboard confirm, Qontak archive confirm), enrich this file with the concrete copy and action labels. Treat the rules below as the minimum bar.

**Modal Confirmation block check:**

> Before writing confirmation modal code, call `get-block("general-form-modal-confirmation")`
> It covers the standard pattern (header, body copy, Cancel + action button, loading state, success/error toast).
> Apply the rules below to choose copy, button variant, and trigger placement.

## When to use this pattern

Yes for:

- **Destructive**: delete, permanently archive, cancel a transaction, terminate an employee.
- **Irreversible**: submit a payroll batch, send out invoices, publish to customers.
- **Financially significant**: approve a payment ≥ threshold, top up balance, change subscription plan.
- **Affects other people**: reassign a deal, change role, remove access.

No (do not show a confirm) for:

- Standard form submissions with normal undo paths.
- Filter changes, sort changes, navigation.
- Anything the user can trivially undo from the same screen.

Friction is a tool. Use it precisely.

## Variants

| Stakes                                   | Variant                                 |
| ---------------------------------------- | --------------------------------------- |
| Moderate (most "Are you sure?")          | Modal dialog                            |
| Low (a small action, but reversible-ish) | Inline confirm in a dropdown or popover |
| Very high stakes                         | Type-to-confirm modal                   |
| Quick destructive in a list              | Undo toast (no upfront confirm)         |

## Variant A: Modal dialog (default)

```
┌─────────────────────────────────────────────┐
│  Reject this request?                  ×    │
│                                             │
│  This will return the request to the        │
│  employee with a note. They can revise      │
│  and resubmit.                              │
│                                             │
│                       [Cancel]  [Reject]    │
└─────────────────────────────────────────────┘
```

### Anatomy

- Use `is-close-on-overlay-click` for non-destructive; omit it for destructive so the user must explicitly cancel.
- Size: `md`. Never hand-code a width.
- Don't use `is-centered`
- Padding: handled by `MpModalHeader`, `MpModalBody`, `MpModalFooter` — do not add extra padding.

### Header

- Title `Heading/H3` 16 Semibold, `text.default`.
- Title is a **question or a clear statement of consequence** — not "Confirm" or "Are you sure?".
  - ✅ "Reject this request?"
  - ✅ "Delete this transaction?"
  - ✅ "Remove access for Agung Setiawarman?"
  - ❌ "Confirm action"
  - ❌ "Are you sure?"
- Close `×` icon top-right.

### Body

- `Label/Regular` 14, `text.default`.
- Describe **what will happen** in plain language, including:
  1. What changes.
  2. Who is affected.
  3. Whether it's reversible and how.
- Examples:
  - ✅ "This will return the request to the employee with a note. They can revise and resubmit."
  - ✅ "Agung will lose access to all expense data immediately. This can be restored within 30 days."
  - ❌ "This action cannot be undone." (vague — what action, undone how?)

### Footer

- Right-aligned cluster: Cancel + primary action button.
- **Cancel**: always `variant="ghost"`. Never secondary, never textLink, never outline.
- **Primary action**: solid button. Variant depends on action type:
  - Destructive (delete, reject, remove): `variant="danger"`. Label is the verb: "Delete", "Reject", "Remove access".
  - Non-destructive (submit, approve, publish): `variant="primary"` (brand blue).
  - Never use generic "OK" or "Confirm" — always the specific verb.

### Focus

- Focus lands on **Cancel** by default, not the primary action. Hitting Enter accidentally shouldn't destroy data.
- Escape closes the modal (= Cancel).

## Variant B: Inline confirm

For low-stakes actions inside dropdowns or popovers, where opening a full modal is overkill.

```
[⋮ menu]
├─ View detail
├─ Edit
└─ Remove
       ↓ inline expand
       Remove this item?
       [Cancel]  [Remove]
```

- The action expands inline within the menu, showing a small prompt with Cancel + verb buttons.
- Use this only when the consequence is small and the affordance is already a "list of actions" context.

## Variant C: Type-to-confirm modal

For very high stakes (deleting a workspace, permanently removing all employee data, cancelling a paid subscription).

```
┌─────────────────────────────────────────────┐
│  Delete workspace "Central Perk Indonesia"? │
│                                             │
│  All 247 employees, 1.832 transactions, and │
│  all related data will be permanently       │
│  deleted. This cannot be undone.            │
│                                             │
│  Type "Central Perk Indonesia" to confirm:  │
│  [_______________________________________]  │
│                                             │
│              [Cancel]  [Delete workspace]   │
└─────────────────────────────────────────────┘
```

- Same modal anatomy as variant A.
- Add a text input below the body. The user must type the exact name (or a confirmation phrase) before the primary button enables.
- Primary button disabled until input matches; enabled = `background.danger.bold` style.
- Don't accept partial matches or case-insensitive. Exact match. (Yes, it's friction. That's the point.)

## Variant D: Undo toast (no upfront confirm)

For quick destructive actions where the user is likely correct (archiving notifications, removing chips, deleting a draft).

- Perform the action immediately.
- Show a toast bottom-right: "1 item archived. Undo" (Undo as text link).
- Toast persists ~7 seconds, then dismisses.
- Undo restores the state.

Don't combine variants — either confirm upfront or let undo handle it, not both.

## Copy patterns

| Action             | Title                          | Body opener                               |
| ------------------ | ------------------------------ | ----------------------------------------- |
| Delete             | "Delete this [entity]?"        | "This permanently removes…"               |
| Reject             | "Reject this [entity]?"        | "This will return…" or "This notifies…"   |
| Archive            | "Archive this [entity]?"       | "Archived items can be restored from…"    |
| Remove access      | "Remove access for [Name]?"    | "[Name] will lose access to…"             |
| Cancel transaction | "Cancel this transaction?"     | "The pending amount will be returned to…" |
| Submit payroll     | "Submit payroll for [period]?" | "This locks the period and notifies…"     |

## Loading and error states during confirmation

- After the user clicks the primary action, the button shows a spinner and disables; Cancel becomes the only way out (or close the modal if the action allows interrupting).
- If the action fails, keep the modal open and show an inline error banner at the top of the modal body: "Couldn't reject the request. [specific reason]." Provide a retry path (clicking the primary action again).
- On success, close the modal and trigger the success toast from the parent screen.

## Edge Cases

- **What if the entity changed while the modal was open?** (Someone else already rejected it.) Default: server returns conflict error, modal shows inline error "This request has already been processed by [actor]." with Close as the only action.
- **Mobile**: full-screen sheet from bottom instead of centered modal. Same anatomy.
- **Confirm fatigue**: if the user does this action 50 times a day, they'll click through without reading. Consider an "always remove this confirm" checkbox stored in user preferences — but only for low-stakes actions, never for type-to-confirm.
- **Keyboard accessibility**: tab order Cancel → primary. Esc cancels. Trap focus inside modal while open.

## Output Contract

When you ship a confirmation:

- Variant chosen with reasoning.
- Title copy (specific question, not generic).
- Body copy explaining what happens, who's affected, reversibility.
- Primary button verb-specific label and color (destructive red vs neutral blue).
- Default focus target (Cancel for destructive).
- Error and loading behavior during the action.
