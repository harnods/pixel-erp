# Global Header Bar

The dark **app-level** bar pinned to the top of every screen (`ErpHeader`,
`app/components/ErpHeader.vue`). It is **above** the sidebar + page title bar and is
shared by every scenario (ERP, WMS standalone/ops, CRM). Do not confuse it with the
**[page title bar](page-title-bar.md)** — that is the 72px light bar *inside* the
content column; this is the global brand/nav/actions header on
`background.header` (`#142D26`).

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ▣ ✦mekari | ERP  [Gudang ▾]        ⌕ Search…        + ⊙ 🖥 ✉   ( RC  Rizal ▾ )  │
│ └ left: switcher + logo + wh ┘   └ center: search ┘ └ actions ┘ └ user menu ┘   │
└───────────────────────────────────────────────────────────────────────────────┘
      background.header (#142D26) · 56px tall · everything on it reads WHITE
```

---

## Fixed dimensions & layout

| Property | Value |
|---|---|
| **Height** | **56px** |
| Background | `var(--mp-colors-background-header)` (`#142D26`) |
| Padding | `16px` left / `12px` right (`--mp-spacing-4` / `--mp-spacing-3`) |
| Gap | `8px` (`--mp-spacing-2`) between the three regions |
| z-index | `var(--mp-z-indices-sticky, 1100)` |
| Layout | flex row: **left** (logo, flex:1) · **center** (search) · **right** (actions + user, flex:1, end-aligned) |

> **Layout is owned by scoped CSS, NOT MpFlex utility props**, on purpose. Pixel's
> atomic utility classes (`.mp-d_flex`, …) can go stale after heavy HMR and collapse
> this always-visible shell to `display:block`. Scoped styles are unlayered and
> compiled per-component, so the header stays laid out regardless. MpFlex/MpText/
> MpAvatar are still used for tokens + typography — only the structural layout is ours.

### Three regions

- **Left** — product switcher (`ErpProductSwitcher`, only when the product rail is
  hidden) + the Mekari ERP logo (always the same lockup) + warehouse switcher
  (`ErpWarehouseSwitcher`, only when scoped to a warehouse).
- **Center** — `QuickSearch`. **Hidden on every home page** (ERP Home, HR Home) —
  those carry their own hero search, so it isn't duplicated. CRM has no home, so it
  keeps the header search. Fixed `280px` ≥768px, `400px` ≥992px.
- **Right** — the quick-action icon cluster (`.erp-header__actions`, shown ≥768px)
  then the user menu (`ErpUserMenu`). ERP-only actions (`+` quick-create, upload
  center) are hidden in WMS.

---

## Icon buttons — always white, subtle veil on hover, **no border**

Every control on the header sits on the **dark** `background.header`, so its glyph
must be **white and stay white**. The quick-action icons are the shared
**`IconButton`** (`app/components/IconButton.vue`); the quick-create **`+`** is
`ErpQuickCreateMenu`'s trigger. They share one visual contract — `rule/header-icon-*`:

| Aspect | Value | Why |
|---|---|---|
| Size | `36×36`, `rounded: lg`, centered | consistent hit target |
| Icon color | **`icon.inverse`** (white, `#F0FBF7`) — set via `<MpIcon color="icon.inverse" />`, **not** `:left-icon` | a ghost `MpButton`'s `:left-icon` inherits the **dark** currentColor → invisible on the dark header |
| Hover fill | **`rgba(255,255,255,0.12)`** (literal translucent white) | the Panda `background.surface.bold.hovered` token resolves to an **opaque near-white** (`#f8f9f9`) in this build — a light box that washes out the white icon |
| Active/pressed fill | **`rgba(255,255,255,0.2)`** | — |
| Border | **`border: none`** | ghost `MpButton` ships a 1px border that shows as an outlined box on hover; the `+` kills it, so these match |
| Icon on hover/active | **stays white** | only the fill changes, never the glyph color |
| Focus ring | `2px solid token(colors.focus)` on **`:focus-visible` only** | keyboard focus, not mouse hover |

```vue
<!-- Shared IconButton — use it for any new header action -->
<MpButton variant="ghost" :class="buttonClass" :aria-label="icon">
  <MpIcon :name="icon" color="icon.inverse" />
</MpButton>
<!-- buttonClass (css()): height/width 9, rounded lg, border: none,
     _hover.bg rgba(255,255,255,0.12), _active.bg rgba(255,255,255,0.2) -->
```

**Do** — reach for the shared `IconButton` for a new header action; it already
encodes all of the above. **Don't** — hand-roll a ghost `MpButton` with
`:left-icon`, or use the `background.surface.bold.*` tokens for the fill.

### Badge (unread/pending)

`IconButton` takes `showBadge` (red dot, top-right, ringed with the header bg) and
`isActive` (keeps the pressed fill while an attached popover is open, e.g. the
upload center).

---

## Related

- **[page-title-bar.md](page-title-bar.md)** — the light 72px bar *inside* the
  content column (different bar, different rules).
- **[pixel-enterprise-overrides.md](pixel-enterprise-overrides.md)** § *"3b. Header
  icon buttons — icon is always white"* — the override rationale.
- **[Button.md](Button.md)** — general button variants.
- Rules: `rule/header-icon-inverse`, `rule/header-icon-veil-no-border` in
  [design/RULES.md](../design/RULES.md).
