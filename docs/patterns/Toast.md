# Toast

Use Pixel toast for short, non-blocking feedback after a user action.

Component/runtime:

- import `toast` from `@mekari/pixel3`;
- mount exactly one `<MpToastManager />` in the app layout;
- keep `toastManager: false` in the Pixel plugin config because the manager is
  mounted manually in `app/layouts/default.vue`;
- do not build custom toast UI.

```ts
import { toast } from '@mekari/pixel3'

toast.notify({
  variant: 'success',
  title: 'Warehouse saved.',
  maxWidth: 'max-content',
})
```

---

## Variants

Only use these variants in ERP:

| Variant | Use for | Icon |
|---|---|---|
| `success` | A user action completed successfully | Pixel toast's default success icon |
| `error` | A user action cannot be completed, or needs user correction | Pixel toast's default error icon |

Do not use `greeting`, `info`, `warning`, custom icons, emoji, or inline SVG
inside toast content. Toast icons must come from the Pixel toast component /
Pixel icon library through the selected variant.

---

## Copy

Toast copy must follow the UXW library. When exact UXW copy is not available in
the local repo, use the ERP fallback patterns below and confirm with UXW before
shipping production copy.

Copy format:

- short and contextual;
- object/context first, then action;
- past tense for success;
- sentence case;
- end with a period;
- usually 2–4 words;
- no long operational explanation in the title.

### Success

Use a short result statement: `{Context object} {past-tense action}.`

| Action | Pattern | Example |
|---|---|---|
| Create | `{Context object} created.` | `Picking list created.` |
| Save draft | `{Context object} draft saved.` | `Picking draft saved.` |
| Save/update | `{Context object} saved.` / `{Context object} updated.` | `Warehouse saved.` / `Warehouse settings saved.` |
| Approve | `{Context object} approved.` | `Warehouse transfer approved.` |
| Archive | `{Context object} archived.` | `Warehouse archived.` |
| Unarchive | `{Context object} unarchived.` | `Warehouse unarchived.` |
| Delete/remove | `{Context object} deleted.` / `{Context object} removed.` | `Warehouse deleted.` |

Keep success toast title concise. Add `description` only when the result needs
extra context; most success toasts should be title-only.

Avoid making the title too specific when it becomes long. For example, use
`Warehouse transfer approved.` instead of including a long document number in the
toast title, unless UXW requires the identifier.

### Error

Use an actionable instruction or a clear reason. Keep it short, but error copy can
be slightly more explicit than success copy when the user needs to fix something.

| Case | Pattern | Example |
|---|---|---|
| Missing input | `You must {action}.` | `You must select warehouse.` |
| Wrong prerequisite | `{Action} first.` | `Enter counted qty first.` |
| Not allowed | `{Reason}.` + optional next step in description | `Already packed.` + `These orders already have a packing task.` |
| Import/process failed | `{Object/action} failed.` + recovery instruction | `Import failed.` + `Try again or download the error file.` |

Do not use "coming soon" as toast copy for production UI. If an action is not
available, remove the action or use an UXW-approved error state/copy.

---

## Standard shape

Always include `maxWidth: 'max-content'` unless the UXW-approved copy needs a
fixed wrapping width.

```ts
toast.notify({
  variant: 'error',
  title: 'You must select warehouse.',
  maxWidth: 'max-content',
})
```

For scan/barcode errors, use the shared helper so toast and sound feedback stay
consistent:

```ts
import { notifyScanError } from '~/utils/scan'

notifyScanError('Barcode not found: "123456".')
```

---

## When not to use toast

- Field-level validation that has a visible field: use inline `MpFormErrorMessage`
  or the form-table cell error pattern.
- Multi-row/table validation that users must inspect: use inline form/table error
  near the affected area.
- Critical confirmation or blocking explanation: use a modal.
- Long instructions: use inline text, not toast.

---

## Checklist

- [ ] Variant is only `success` or `error`.
- [ ] Icon is not overridden; it comes from Pixel toast by variant.
- [ ] Copy follows UXW library or the fallback pattern above.
- [ ] `maxWidth: 'max-content'` is set.
- [ ] Toast is non-blocking and short.
- [ ] Inline validation is used instead of toast when the affected field/cell is visible.
