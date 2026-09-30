# Settings page

**Purpose**: a page of configuration that a person reads far more often than they
change — module policies (Replenishment settings), warehouse configuration,
company-wide rules. One view shows the committed values; **Edit** turns the same
rows into inputs in place.

**Rules**: `rule/settings-page-layout`, `rule/settings-row`, `rule/settings-edit-mode`,
`rule/settings-no-unbuilt-controls` (all in [RULES.md](../design/RULES.md) › Settings
pages), plus the form rules each control already follows.

**Live references**
- [SettingsReplenishmentPage.vue](../../app/components/pages/SettingsReplenishmentPage.vue):
  the reference implementation. It follows every rule below and designs every state.
- [ConfigureWarehousePage.vue](../../app/components/pages/ConfigureWarehousePage.vue),
  [SettingsWarehousePage.vue](../../app/components/pages/SettingsWarehousePage.vue):
  same shape; toggle-only rows. These still use legacy `.btn-enterprise` buttons and
  section descriptions, so migrate them when you next touch them.

> **Why not Form.md?** Form.md is for *create/edit a record*: one column, max 558px,
> fields stacked. A settings page is a long, read-mostly list where every value needs its
> explanation beside it, and view and edit must show the same row in the same place. So
> it uses a two-column **label | control** row. This is a deliberate, documented
> exception to `rule/form-field-stacking`, and only for settings pages.

---

## Anatomy

```
┌── title bar (72px, neutral-subtle) ─────────────────────────────────────────┐
│  Replenishment ‹breadcrumb›                                                  │
│  Replenishment settings                                  [ Edit ] / [View only]│
└──────────────────────────────────────────────────────────────────────────────┘
┌── stage (white, scrolls) ────────────────────────────────────────────────────┐
│  H2 Section title                                                             │
│  ┌──────────────────────────────┬─────────────────────────────────────────┐  │
│  │ Label (MpFormLabel)          │ value  — or, in edit mode, the control  │  │
│  │ caption (12px, secondary)    │ MpFormErrorMessage when invalid         │  │
│  └──────────────────────────────┴─────────────────────────────────────────┘  │
│  … more rows (1px divider between rows) …                                     │
│  ──────────────────────────────────────────────── (divider between sections)  │
│  H2 Next section                                                              │
│                                                                               │
│                 [error pointer]   [Reset to defaults] [Cancel] [Save changes] │ ← sticky, edit mode only
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1. Route & title bar (`rule/settings-page-layout`)
- **Module settings opened from inside a module** (e.g. the worklist's *Settings*
  button) render through **`detailMatch`** in `[...slug].vue`. The component owns its
  title bar and stage, just like a detail or form page.
- **Title bar**: the [page-title-bar.md](page-title-bar.md) dimensions (72px,
  neutral-subtle).
  - A **breadcrumb** back to the module (`MpTextlink as="a"`, 12px link) sits directly
    above the **H1 `<Module> settings`**.
  - **Right**: the one page action. `Edit` is a secondary `MpButton` (`is-rounded`),
    shown in view mode only.
  - If the user can't edit, show a `View only` `MpBadge for="additionalInformation"` in
    place of Edit.
- **No page or section description subtitle** (`rule/no-page-description-subtitle`).
  Explanations belong in the row captions.

### 2. Sections & type
- The stage content has **24px** padding and max width **900px**.
- **Sections** are an **H2** (`xl`/20, semibold, `rule/type-scale`). Sections after
  the first get a **1px divider** and 24px above.
- Row labels are `MpFormLabel` (14px). Captions and values follow `rule/type-14-default`.

### 3. Settings row (`rule/settings-row`)
- Each row is one **`MpFormControl`** used as a two-column grid:
  **label column `minmax(0, 320px)`** | **control column `1fr`**, 24px gap, 12px
  vertical padding, 1px divider between rows (none after the last row in a section).
- **Left**: `MpFormLabel` plus a **caption** (12px, secondary). The caption carries
  what the setting does and what a blank value inherits.
- **Right**:
  - **View mode**: the committed value, as a **whole translated sentence** built with
    `tf()` (for example `tf('{n} days', { n })`). Never concatenate fragments like
    `${v}d` (`rule/copy-id-translations`).
  - **Edit mode**: the control, always size md (`rule/form-size-md-only`).
    - **Number with a unit**: `MpInputGroup` + `MpInput` (**128px**, the same everywhere) + `MpInputRightAddon has-background` with **12px** horizontal padding. The addon sits INSIDE the input's box, so the input width has to hold the number *and* the suffix; narrower inputs clip the value. The group hugs its input (`width: fit-content`).
    - **Select** (`ErpFilterSelect`) and **multi-select** (`MpInputTag`): one fixed width, **320px** (`--rs-field-width`), so they line up and long option labels still fit. This replaces `rule/form-select-half` on settings pages.
    - **Multi-select**: `MpInputTag` (`rule/select-multi-mpinputtag`).
    - **Toggle**: `MpToggle v-model:is-checked`, left-aligned in the control column
      (`rule/form-toggle-inline`).
- **Error**: `MpFormControl :is-invalid` plus `MpFormErrorMessage` **under the control**
  (`rule/field-invalid-caption`).
- **Per-category policy** (one value per category, with a fallback): a list of
  `category | control` lines inside the control column.
  - The **fallback line ("Other categories") comes last**, after a 1px divider.
  - View mode shows each category's effective value, whether its own or inherited.
- **Empty value that isn't 0** (e.g. lead time "Not set"): a dashed-border chip in
  secondary text, visually distinct from any number. Never render it as `0` or `—`.

### 4. Edit mode (`rule/settings-edit-mode`)
- `Edit` copies the committed config into a **draft**, and the rows switch to controls
  in place.
- **Footer**: sticky at the bottom of the stage, **edit mode only**, on its own stacking layer (`z-index` + `isolation: isolate`). Otherwise input addons paint over it while the rows scroll beneath. It's an
  `MpButtonGroup class="erp-action-footer"` (`rule/btn-responsive-footer`), with no
  divider above it.
  - Buttons: ghost `Reset to defaults` (optional), ghost `Cancel`, primary
    `Save changes` (`rule/form-edit-save-changes`).
  - An inline **error pointer** sits to the left of the buttons.
- **Cancel** restores the committed values and leaves edit mode.

### 5. States (all required — [reachable-states.md](../design/reachable-states.md))

| State | Design |
|---|---|
| View only (no permission) | `View only` badge in the title bar and a caption at the top of the stage. No Edit button, no inputs. |
| Pristine | Committed values, read-only. |
| Invalid submit | Every failing row shows `MpFormErrorMessage`. The footer shows "Fix the highlighted fields to save." Save stays clickable (`rule/btn-no-disabled-validation`). |
| Submitting | `Save changes` `:is-loading` (the one allowed lock). |
| Save error | An inline footer message, and edit mode keeps every change. Never a toast. |
| Success | Toast `"<Module> settings saved"` (no period, `rule/btn-save-toast`). Then back to view mode. |
| Unsaved changes | Leaving the page (route leave **and** route update, plus `beforeunload`) with a dirty draft opens `ConfirmModal`: "Discard unsaved changes?", with `Discard changes` or `Keep editing`. |
| Destructive edit | Removing something that clears other values (e.g. a category that carries defaults) opens `ConfirmModal`, titled as a question. |

### 6. Don't (`rule/settings-no-unbuilt-controls`)
- Don't ship a **disabled "not available yet" control** (a greyed toggle for a setting
  that doesn't exist). Leave the setting out until it's built.
- Don't use a legacy `.btn-enterprise` button, a native `<select>` / `MpSelect`, a
  hand-rolled chip list, a placeholder as a label, or hardcoded px spacing.
