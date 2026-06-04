# ContentList

A **labelled, read-only field** — a caption (label) stacked directly above its
value. It is the repeating unit of a detail page's header summary
([details-page-format.md](details-page-format.md)) and of any key/value display
across the ERP (drawers, preview panels, summary cards). Because it appears
everywhere, it lives as its own component:
[`app/components/patterns/ContentList.vue`](../../app/components/patterns/ContentList.vue).

> Pixel: plain markup + tokens (no dedicated Pixel component). Status/tag values
> compose with [ErpStatusBadge](ErpStatusBadge.md) / `ErpTagList`.

---

## Anatomy & rules

```
┌──────────────────────────┐
│ Label            (12px)   │  ← var(--mp-text-secondary)
│ Value            (14px)   │  ← var(--mp-text-default)
└──────────────────────────┘
   ▲ padding 8px top & bottom, NO gap between label and value
```

| Part | Token | Notes |
|---|---|---|
| Field padding | `var(--mp-spacing-2)` (8px) top & bottom | the field's own spacing — **never** a flex `gap` on the parent |
| Label → value gap | **0** | label sits directly on top of the value |
| Label | 12px (`--mp-font-sizes-sm`), `--mp-text-secondary` | omit for a value-only field |
| Value | 14px (`--mp-font-sizes-md`), `--mp-text-default` | empty renders as `—` |
| Between two fields in a column | **no gap** | the 8px top+bottom padding of adjacent fields provides the rhythm (≈16px) |

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | — | Caption above the value. Omit for value-only. |
| `value` | `string \| number` | — | Plain-text value. For rich values use the **default slot** instead. |

The **default slot** overrides `value` for rich content (tags, links, multi-line).

---

## Variants (by value type)

| Variant | How |
|---|---|
| Plain text | `<ContentList label="Customer" value="Anomali Coffee" />` |
| Empty | omit `value` (or pass empty) → renders `—` |
| Multi-line | slot with `<span class="content-list__line">…</span>` per line |
| Tags | slot with `<ErpTagList :tags="tags" />` |
| Link / custom | slot with any markup (e.g. an `<a>` or a status badge) |

```vue
<ContentList label="Customer" :value="order.customer.name" />

<ContentList label="Email">
  <span v-for="e in order.email" :key="e" class="content-list__line">{{ e }}</span>
</ContentList>

<ContentList label="Tags">
  <ErpTagList :tags="order.tags" />
</ContentList>
```

---

## Layout in a column grid (Applicable only for transaction type of detail page)

ContentList carries its own spacing, so the containing column/grid sets **no row
gap**:

```css
.content-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 318px) repeat(N-1, minmax(0, 1fr));  /* col 1 = 318px; rest fill equally */
  column-gap: var(--mp-spacing-6);   /* 24px between columns */
  row-gap: 0;
}
.content-list-col { display: flex; flex-direction: column; }  /* no gap between fields */
```

- **Column 1** is `318px` by default and shrinks proportionally when the
  container is tight (`minmax(0, 318px)`).
- **Columns 2…N** fill the remaining width **equally** (`1fr` each); the count
  follows how many columns the data needs (max 5 — see
  [details-page-format.md](details-page-format.md)).
