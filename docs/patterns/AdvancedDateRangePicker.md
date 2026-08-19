# AdvancedDateRangePicker

The **advanced date picker** — a field that opens a preset list (quick date
ranges) plus, when needed, a calendar for granular / custom selection. It is the
ERP's standard control for any "filter by date range" need (filter drawers,
report toolbars, WMS overview) and mirrors the Pixel
[Date picker → Advance](https://docs.mekari.design/components/date-picker.html#advance)
pattern. It lives as its own component:
[`app/components/patterns/AdvancedDateRangePicker.vue`](../../app/components/patterns/AdvancedDateRangePicker.vue).

> Pixel: composed from `MpPopover` + tokens (no single Pixel component covers the
> preset-list + calendar combination).

---

## Anatomy

```
Field (closed)                         Popover (open)
┌───────────────────────────┐          ┌──────────────────────────────────────────────┐
│ 12/07/2026 - 10/08/2026  📅│          │ TIME RANGE                                     │
└───────────────────────────┘          │  Today            10 Aug 2026                  │  ← single date, no range
                                        │  Last 7 days      4 Aug 2026 - 10 Aug 2026     │
                                        │  Last 14 days     28 Jul 2026 - 10 Aug 2026    │
                                        │  Last 30 days     12 Jul 2026 - 10 Aug 2026    │
                                        │ ────────────────────────────────────────────  │
                                        │  Per day / Per week / Per month / Per year     │  ← opens the calendar
                                        │  Custom                                        │
                                        └──────────────────────────────────────────────┘
```

- Each **quick preset shows its resolved range on the right** of the label.
- **Today shows a single date** (`10 Aug 2026`), never a `x - y` range.
- Presets are **inclusive N-day windows** anchored to today:
  `Last N = today-(N-1) … today`, `Next N = today … today+(N-1)`.
- The **calendar** appears only for the granularity rows (Per day/week/month/year)
  and **Custom** — a plain preset selection never shows a calendar.

---

## Props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `id` | `string` | — | Popover id (required, unique). |
| `modelValue` | `Date[] \| null` | — | `[start, end]`. `null` = unapplied → shows `placeholder`, hides the "Date range: …" label. |
| `direction` | `'past' \| 'future'` | `'past'` | `past` → Today / Last 7 / Last 14 / Last 30 days. `future` → Next 7 / Next 14 / Next 30 days (for forward-looking fields like **Due date**). |
| `isFullWidth` | `boolean` | `false` | Field fills its container. |
| `placeholder` | `string` | `'Select date range'` | Shown while unapplied. |
| `hideLabel` | `boolean` | `false` | Suppress the internal "Date range: …" caption when the caller renders its own field label (e.g. inside a filters drawer). |

Emits `update:modelValue: [Date, Date]` — always a normalized `[start, end]` at day-start.

---

## Usage

```vue
<!-- Transaction date (past presets) -->
<AdvancedDateRangePicker
  :id="`${id}-transactiondate`"
  v-model="draft.transactionDate"
  hide-label is-full-width
  placeholder="Select transaction date"
/>

<!-- Due date (future presets — Next 7 / 14 / 30 days) -->
<AdvancedDateRangePicker
  :id="`${id}-duedate`"
  v-model="draft.dueDate"
  direction="future"
  hide-label is-full-width
  placeholder="Select due date"
/>
```

Filtering a row against the applied range:

```ts
const [start, end] = draft.transactionDate ?? []
const ok = !start || (new Date(row.date) >= start && new Date(row.date) <= end)
```

---

## Rules

- **Single-day selection shows one date, not a range.** When start === end
  (the **Today** preset or a **Per day** pick), the field renders `01/01/2026`,
  never `01/01/2026 - 01/01/2026`.
- **Today in the calendar is filled**, not just outlined: a warning-tone fill
  (`--mp-background-warning`) plus the warning border — it must read as the
  current day at a glance, not merely a ring.
- **Active/selected preset = a `--mp-background-neutral-subtle` background fill**
  (rgb 248,249,249) + default text — matching Pixel's native `MpPopoverListItem`
  active state. NOT a green text or green fill (see [Form.md → Select](Form.md)).
- **Range on the right** of every quick preset; **Today = single date**.
- Preset labels are exact: `Today`, `Last 7 days`, `Last 14 days`, `Last 30 days`
  (past) / `Next 7 days`, `Next 14 days`, `Next 30 days` (future).
- Date text uses the spelled-out day format (`10 Aug 2026`) inside the popover;
  the closed field shows numeric `DD/MM/YYYY - DD/MM/YYYY`
  (see [date-format.md](date-format.md)).
- Tokens only — no hardcoded colors/px. Active preset uses the nav-stack
  selected style (same as the sidebar's active item).
- Reuse this component for every date-range filter; do **not** hand-roll an
  `MpDatePicker` for range filtering.
