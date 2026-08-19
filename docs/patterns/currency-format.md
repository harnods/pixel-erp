# Currency format

**Helper**: `app/utils/currency.ts` → `formatIDR`, `formatMoney`
**Settings**: `app/composables/useCurrencySettings.ts` → `amountDisplay`, `currencySymbol`

## 🏆 GOLDEN RULE — money is `Rp4.000.000,00`

| Rule | Value |
|---|---|
| Symbol spacing | **NO space** after `Rp` → `Rp4.000.000,00` (never `Rp 4.000.000,00`) |
| Thousands separator | `.` (id-ID grouping) |
| Decimal separator | `,` |
| Negatives | sign **before** the symbol → `-Rp4.000.000,00` |

## Three "Amount display" modes

The magnitude is dictated by the **Company → Accounting settings ▸ "Amount display"**
setting. All three modes react live app-wide:

| `amountDisplay` | Setting option | Example |
|---|---|---|
| `with-decimals` | Full number (with decimals) | `Rp4.000.000,00` |
| `without-decimals` | Full number | `Rp4.000.000` |
| `abbreviated` | Abbreviated | `Rp2 jt` |

```
formatIDR(4000000)    → "Rp4.000.000,00"    (with-decimals)
formatIDR(4000000)    → "Rp4.000.000"       (without-decimals)
formatIDR(2000000)    → "Rp2 jt"            (abbreviated)
formatIDR(-4000000)   → "-Rp4.000.000,00"
```

### Abbreviated scheme (id-ID)

Suffixes largest-first, **1 decimal max**, `,` decimal separator, trailing `,0` trimmed;
values `< 1000` stay plain. Negatives keep the sign before `Rp`.

| Magnitude | Suffix | Example |
|---|---|---|
| ribu (≥ 1.000) | `rb` | `500_000` → `Rp500 rb` |
| juta (≥ 1.000.000) | `jt` | `2_000_000` → `Rp2 jt`, `1_500_000` → `Rp1,5 jt` |
| miliar (≥ 1.000.000.000) | `M` | `2_500_000_000` → `Rp2,5 M` |
| triliun (≥ 1.000.000.000.000) | `T` | `1_000_000_000_000` → `Rp1 T` |
| < 1000 | — | `900` → `Rp900` |

## Settings-driven

Formatting reads a reactive singleton (`useCurrencySettings`), wired to
**Company → Accounting settings ▸ "Amount display"** on
`SettingsCompanyProfilePage.vue`. Changing "Amount display" updates every money
display app-wide, live — `formatIDR`/`formatMoney` read the reactive ref at each
call (i.e. at render time), so every component re-renders on change. The choice is
persisted to `localStorage` (SPA, `ssr:false`).

- `currencySymbol: 'Rp'` (base currency: Indonesian Rupiah)
- The settings example is per-option (Abbreviated → `e.g. Rp2 jt`) — never a doubled/hardcoded second example.

## Multi-currency

`formatMoney(amount, currency)` is for the cash module only (IDR / SGD / USD).
It applies the same no-space rule, the same settings-driven magnitude (including
abbreviated, e.g. `Rp15 jt` / `SGD6 jt`), and wraps negatives in **accounting
parentheses**: `(Rp32.000.000,00)`, `SGD6.000,00`.

## Rules

- ✅ Every money **display** calls `formatIDR` (or `formatMoney` for the cash module).
- ❌ Never hand-roll `new Intl.NumberFormat('id-ID', { style: 'currency', … })` in a
  component — `style: 'currency'` injects a non-breaking space after the symbol, which
  is exactly the format we reject.
- Input helpers that format a **bare number** with no `Rp` prefix (filter inputs,
  prefix-box table cells) are NOT currency displays — leave them alone.
