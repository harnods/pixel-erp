# Dev Changes overlay — "what changed & where" for engineers

An engineer-facing layer that points at the exact spots on each page that moved in a
push. When you deploy to `main`, teammates opening the app see a pulsing marker on
every changed element; clicking it opens a coachmark with the change summary, date,
files, and PR link. This is **not** the customer-facing feature announcement
(`WhatsNewModal`) — it is a review aid, deliberately styled off-system (purple /
Airene) so it never reads as product chrome.

> This applies to **everyone who pushes to the repo**, not one person. The overlay
> ships in the app and resolves are keyed to the signed-in `@mekari.com` account, so
> each engineer sees and dismisses changes independently.

## For anyone shipping a change — two steps

When your PR changes something a teammate should notice on a page:

1. **Tag the changed element** in the template with a stable id:
   ```html
   <th class="si-th" data-devchange="deal-unit-readonly">{{ t('Unit') }}</th>
   ```
   Put it on an element that is reliably present (a column header, a section title, a
   field label) — not a row that only exists after data loads.

2. **Add a registry entry** in [`app/data/devChanges.ts`](../../app/data/devChanges.ts)
   keyed by that same id, newest first:
   ```ts
   {
     id: 'deal-unit-readonly',
     title: 'Unit column is now read-only',
     description: 'One or two sentences: what changed and why.',
     date: '2026-09-18',      // ISO; convert relative dates
     pr: '#82',               // becomes a GitHub PR link
     files: ['NewCrmDealPage.vue', 'NewSalesOrderPage.vue'],
   }
   ```

That's it — the overlay auto-discovers the tag on whatever page it lives on. No
per-route wiring, no CSS selectors.

## Behavior (visibility is derived, not a stored switch)

```
active = there is ≥1 change that is neither resolved nor dismissed
```

- **On by default.** A newly pushed change surfaces the layer automatically — nobody
  has to enable anything. A new change even re-surfaces the layer for someone who had
  previously dismissed it (the new change isn't dismissed).
- **Turn off** — user menu (top-right) → **Changes**, or click the floating pill.
  This *dismisses* every change known right now and persists across reloads; a later
  push brings the layer back.
- **Mark as resolved** — the ✓ on a coachmark. Hides that one change **for the current
  user only**. When the last change is resolved, the whole layer disappears.
- **Show N resolved** — a pill above the FAB restores what you resolved on this page.

## Where it lives

| File | Role |
|---|---|
| [`app/data/devChanges.ts`](../../app/data/devChanges.ts) | The change registry (`DEV_CHANGES`) + repo base for PR links |
| [`app/components/patterns/DevChangesOverlay.vue`](../../app/components/patterns/DevChangesOverlay.vue) | The marker + coachmark layer + FAB; mounted once in `layouts/default.vue` |
| [`app/composables/useDevChanges.ts`](../../app/composables/useDevChanges.ts) | Shared state: per-user resolved / dismissed sets + derived `active` |
| `ErpUserMenu.vue` | The **Changes** on/off toggle (replaced the old proto-review "Review mode") |

## Per-user storage

Keyed by the signed-in email (`local` when the access gate is off in dev):

- `erp-devchanges-resolved:<email>` — ids the user marked resolved
- `erp-devchanges-muted:<email>` — ids dismissed by the last "turn off"

Because it's `localStorage`, state is per-user **per browser** — the same engineer on
a different device starts fresh. A cross-device store would need a small backend
endpoint; for the prototype this matches how everything else here persists.
