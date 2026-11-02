# Icon (MpIcon)

**Pixel component**: `MpIcon` from `@mekari/pixel3`
**Valid `size` values**: **`sm`**, **`md`**, or an **explicit CSS length** (`"16px"`, `"32px"`)

---

## 🏆 GOLDEN RULE — never pass `xs`, `lg` or `xl`

`MpIcon` renders as `<svg class="mp-icon">`, and the base rule is:

```css
.mp-icon { width: var(--mp-icon-size); height: var(--mp-icon-size); }
```

`--mp-icon-size` is set one of two ways, and **only** these two:

| `size` value | How it resolves | Result |
|---|---|---|
| `sm` | Panda recipe class `.mp-icon--size_sm` | ✅ 20px |
| `md` | Panda recipe class `.mp-icon--size_md` | ✅ 24px |
| any CSS length (`"16px"`) | component writes `style="--mp-icon-size: 16px"` | ✅ that size |
| `xs` / `lg` / `xl` | component writes `style="--mp-icon-size: lg"` | ❌ **invalid length — declaration dropped, SVG renders unbounded (measured 103–1178px)** |

The icon recipe (`@mekari/pixel3-styled-system/recipes/icon-recipe.mjs`) declares
`variantMap = { size: ["sm", "md"] }` — there is no `xs`, `lg` or `xl` variant, and
`size` is typed as plain `string`, so **TypeScript will not catch the mistake**.

> Why this hid for so long: every pre-existing `size="xs"` sat inside a fixed-size
> parent button that clipped the overflow, so the icon looked merely a bit off
> rather than obviously broken.

---

## Size scale

Use these; they continue the 4px scale either side of the two real variants:

| Intent | Pass | Renders |
|---|---|---|
| dense inline (table cell, chip) | `"16px"` | 16px |
| default | `sm` | 20px |
| comfortable / section header | `md` | 24px |
| empty-state, feature tile | `"32px"` | 32px |
| hero / illustration stand-in | `"40px"` | 40px |

```vue
<MpIcon name="search" size="sm" />         <!-- ✅ -->
<MpIcon name="done" size="32px" />         <!-- ✅ explicit length -->
<MpIcon name="close" size="xs" />          <!-- ❌ renders unbounded -->
```

---

## Icon names

`name` **is** a strict union, so a wrong name is a type error. To find a valid one,
use the Pixel MCP `get-icon-name` tool or read the union in
`node_modules/@mekari/pixel3-icon/dist/modules/icon.props.d.ts`.

Names that seem obvious but **do not exist**: `unlink`, `send`, `scale`, `zap`,
`history`, `external-link`. Substitutes in use here: `minus-circular`, `share`,
`finance` / `calculator`, `magic`, `log`.

---

## Colour — the `color` prop, and nothing else

`MpIcon` writes

```
style="--mp-icon-color: var(--mp-colors-icon-default);"
```

as an **inline style on its own `<svg>`**. Inline styles win the cascade, and the
`var()` is resolved in the svg's own context — so **a CSS `color` on the icon, on
its wrapper, or anywhere up the tree has no effect at all**. The icon renders grey
`#536062` on every surface, including saturated fills where it is unreadable.

This fails silently: no console warning, no type error (`color` is typed `string`),
and the dead `color:` declaration reads as if it worked. Setting `color` through
`:style` on the `MpIcon` itself does not work either, for the same reason.

The prop value is a **dot-path into the `--mp-colors-*` namespace** —
`icon.inverse` → `--mp-colors-icon-inverse`:

| Value | Use for |
|---|---|
| `icon.default` | the muted/neutral default (#536062) |
| `icon.inverse` | on a saturated fill (#f0fbf7) |
| `icon.brand` · `icon.selected` | brand green |
| `icon.success` · `icon.warning` · `icon.danger` | status |
| `icon.information` | informational / the nearest thing to Airene purple |
| `icon.highlight` · `icon.disabled` · `icon.inverse.static` · `icon.warning.inverse` | remaining valid paths |

Two traps:

- **`icon.secondary` and `icon.positive` do not exist.** Both were in use in this
  repo and resolved to nothing. Use `icon.default` and `icon.success`.
- **`icon.subtle` is `#e3e7e9`** — a near-white hairline colour, *not* the `#6e7a7c`
  of `--mp-text-subtle`. For a muted icon the right value is `icon.default`.

Both traps are guarded in `tests/pixel-police.spec.ts`.

For a state-driven icon, carry the path in the state metadata next to the icon name
(see `MATCH_META.iconColor` / `iconColorOutline` in `app/data/vatReconciliation.ts`)
rather than branching in the template.

---

## Build checklist

- [ ] `size` is `sm`, `md`, or an explicit CSS length — **never** `xs` / `lg` / `xl`.
- [ ] `name` verified against the union (not guessed).
- [ ] Colour set via the **`color` prop** with a valid `icon.*` path — never via CSS
      `color` on the icon or a wrapper, and never via `:style`.
- [ ] Icons on a filled/saturated surface use `icon.inverse`.
