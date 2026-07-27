# Date format

**Helper**: `app/utils/date.ts` → `formatDate`, `formatDateTime`, `formatDateLong`, `formatDateTimeLong`

## 🏆 GOLDEN RULE — timestamps (date + time)

| Context | Helper | Output |
|---|---|---|
| **In a TABLE** | `formatDateTime(iso)` | `23/06/2026, 15:30` |
| **NOT in a table** (detail header, "Last updated by", form field, note) | `formatDateTimeLong(iso)` | `23 Jun 2026, 15:30` |

- Table → numeric `DD/MM/YYYY, HH:MM`. Non-table → spelled-out `DD Mon YYYY, HH:MM`.
- 24h time, colon separator, **comma** between date and time, **no `(GMT+7)` suffix**.
- Applies **everywhere** a timestamp shows — index tables, activity log, LastUpdatedCell, detail headers, picking / packing / receiving / put-away pages, etc.

---

## Standard (date only)

| Need | Helper | Output |
|---|---|---|
| Date only, **table** | `formatDate(iso)` | `23/06/2026` |
| Date only, **non-table** | `formatDateLong(iso)` | `23 Jun 2026` |
| Empty / invalid input | any | `—` |

- Table date is `/`-separated, zero-padded, 4-digit year (`en-GB` numeric).
- ❌ Never `Jun 23, 2026` / `2026-06-23`, and never a spelled-out month in a **table** cell.
- Never hand-roll `id-ID` / `toLocaleTimeString` in a component — call the shared helper.

---

## Usage

```ts
import { formatDate, formatDateTime } from '~/utils/date'
```

```vue
<template #cell-estimatedArrival="{ value }">{{ formatDate(value as string) }}</template>
<!-- timestamped column -->
<td>{{ formatDateTime(task.startDate) }}</td>
```

Do **not** hand-roll `toLocaleDateString(...)` in a component — call the shared helper so every
table stays consistent. If a new format is genuinely needed, add it to `app/utils/date.ts`.

---

## Where it's applied

All ERP index tables route through these helpers, e.g. Barang masuk → On the way
(`estimatedArrival`), Receiving (`startDate`/`endDate`, timestamped), Completed
(`receivedDate`), Canceled (`canceledDate`); and the Sales / Purchase index tables
(transaction date, due date, etc.) which already render numeric `DD/MM/YYYY`.

> Detail-page header summaries (ContentList) may show a longer human date — this rule is
> about **table cells**.
