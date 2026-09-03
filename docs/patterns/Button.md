# Button

> **Source of truth: [`docs/design/RULES.md`](../design/RULES.md) `rule/btn-*`.**
> New buttons use Pixel **`<MpButton>`** per the storybook — its secondary variant is
> globally overridden in `erp.css` to the Enterprise look, so plain `MpButton` is
> correct. **`.btn-enterprise` is LEGACY**: do not add new ones (existing usages are
> tolerated and migrated when a file is next touched). The `.btn-enterprise` sections
> below are kept for maintaining that legacy code, not as guidance for new work.

ERP buttons use Pixel semantics and ERP visual rules. `.btn-enterprise` is the legacy
custom button style defined in `app/assets/css/erp.css`.

Token notation:

- Pixel props / `css()` examples should use Pixel token keys when possible
  (`background.neutral`, `border.bold`, `text.default`).
- Custom CSS examples may use the generated CSS variables (`var(--mp-...)`)
  because Pixel MCP exposes those variables in the design-token docs.

---

## Base shape

`.btn-enterprise` buttons are:

- inline-flex;
- pill-rounded (`var(--mp-radii-full)`);
- 14px / `var(--mp-font-sizes-md)`;
- semibold by default;
- `8px 16px` padding;
- `gap: var(--mp-spacing-2)`;
- `1px` border.

Use `btn-enterprise--sm` for dense table/bulk/action-bar buttons.

---

## Secondary button

Use secondary for supporting actions that are still real actions.

Examples:

- `Import`;
- `Reset count`;
- `Save & add another`;
- empty-state CTA when it is not the primary page action;
- non-destructive alternative in destructive confirmation, such as `Keep receipt`
  or `Keep open`.

Visual rule:

| Property | Pixel token | Custom CSS variable |
|---|---|---|
| Fill | `background.neutral` | `var(--mp-background-neutral)` |
| Border | `border.bold` | `var(--mp-border-bold)` |
| Text | `text.default` | `var(--mp-text-default)` |
| Font weight | semibold |
| Hover | `background.neutral.hovered` | `var(--mp-background-neutral-hovered)` |

Implementation:

```html
<button class="btn-enterprise btn-enterprise--secondary">
  Import
</button>
```

With icon:

```html
<button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before">
  <MpIcon name="add" size="sm" />
  New warehouse
</button>
```

If using Pixel directly:

```vue
<MpButton variant="secondary" is-rounded>
  Choose file
</MpButton>
```

Only use the Pixel variant directly when the rendered result matches the ERP
secondary visual rule above.

---

## Ghost button

Use ghost for cancel, dismiss, close, back, or keep-editing actions.

Examples:

- `Cancel`;
- `Keep editing`;
- drawer/modal close actions;
- form footer cancel actions.

Visual rule:

| Property | Pixel token | Custom CSS variable |
|---|---|---|
| Fill | transparent | transparent |
| Border | transparent | transparent |
| Text | `text.secondary` | `var(--mp-text-secondary)` |
| Font weight | regular |
| Hover | `background.neutral.hovered` | `var(--mp-background-neutral-hovered)` |

Implementation:

```html
<button class="btn-enterprise btn-enterprise--ghost">
  Cancel
</button>
```

Pixel equivalent:

```vue
<MpButton variant="ghost" is-rounded>
  Cancel
</MpButton>
```

Rule: any button labelled `Cancel` must be ghost. Do not use secondary for
`Cancel`.

---

## Secondary vs ghost decision

| Situation | Use |
|---|---|
| User performs a supporting action | Secondary |
| User dismisses, cancels, closes, or goes back | Ghost |
| User chooses a safe alternative to a destructive action (`Keep receipt`) | Secondary |
| User confirms a destructive action (`Delete`) | Danger |
| User submits the main form/page action | Primary |

---

## Rules

- Only one primary action per screen.
- Cancel/dismiss is always ghost.
- Secondary uses black/default text and bold border; do not use secondary text
  color for secondary button text.
- Do not use disabled state for validation. Keep action buttons clickable and
  show inline error/toast on click.
- Loading/duplicate-submit protection may use disabled/loading state while the
  action is already running.
- Icon buttons inside table rows are a separate table-action pattern; do not
  infer secondary/ghost page-button rules from row kebabs or row hover buttons.
