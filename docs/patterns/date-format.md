# Date format

**Helper**: `app/utils/date.ts` → `formatDate`, `formatDateTime`
**Rule**: Dates in tables are **ALWAYS numeric `DD/MM/YYYY`** — never a spelled-out month.

---

## Standard

| Need | Helper | Output |
|---|---|---|
| Date only | `formatDate(iso)` | `23/06/2026` |
| Date + time (24h) | `formatDateTime(iso)` | `23/06/2026 14:30` |
| Empty / invalid input | either | `—` |

- Separator is `/`, zero-padded day & month, 4-digit year (`en-GB` numeric locale).
- ❌ Never `23 Jun 2026` / `Jun 23, 2026` / `2026-06-23` in a table cell.
- Use `formatDateTime` only when the time matters (e.g. receiving start/end timestamps); otherwise `formatDate`.

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
