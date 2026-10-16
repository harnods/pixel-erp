# Pixel 3 DT 2.4 Enterprise — ERP overrides (SOURCE OF TRUTH)

Where Pixel 3's default DT 2.4 Enterprise rendering does **not** match how this
ERP must look, we override it. This doc is the single list of those overrides —
the recurring "why is this always wrong?" cases. If a component below looks like
Pixel's default, it's wrong; use the override.

Most overrides live UNLAYERED in `app/assets/css/erp.css` (so they beat Pixel's
`@layer` rules), keyed on Pixel's own recipe classes so they apply to **every**
instance. Prefer the ERP wrapper classes/components named here over calling the
raw Pixel component with a variant.

> When you hit a NEW recurring "Pixel default is wrong here" case, add it to this
> doc and to `erp.css`, then it's covered forever.

---

## 1. Secondary button

Pixel's `MpButton variant="secondary"` renders **gray text** — wrong. ERP
secondary = neutral fill, **bold black border**, **black text**, **semibold**.

| Property | Value |
|---|---|
| Fill | `var(--mp-colors-background-neutral, #fff)` |
| Border | `var(--mp-colors-border-bold, #8c9596)` (bold, black) |
| Text | `var(--mp-colors-text-default, #080d0e)` (**black**, never `text.secondary`/gray) |
| Font weight | **semibold** |
| Hover | `var(--mp-colors-background-neutral-hovered)` |

Use **`MpButton variant="secondary"`** — `erp.css` applies the black-text / bold-border
override to Pixel's recipe class automatically (`rule/btn-secondary-black`), so you get the
ERP look without any wrapper. `.btn-enterprise--secondary` is **legacy**
(`rule/btn-mpbutton-standard`) — don't add new ones. See `Button.md`. Always the
fully-qualified `--mp-colors-*` tokens + hex fallback (the short `--mp-*` aliases can
resolve empty; `rule/style-with-css`).

**Disabled.** The black-text override must not reach a disabled secondary button, or
it reads as clickable. `erp.css` restores Pixel's disabled look for
`:disabled` / `[aria-disabled=true]`:

| Property | Value |
|---|---|
| Fill | `var(--mp-colors-background-disabled, #f8f9f9)` (Pixel) |
| Border | `var(--mp-colors-border-default, #e3e7e9)` — the ERP's muted disabled border (Pixel's equals the page background and erases the outline; same fix as §9) |
| Text | `var(--mp-colors-text-disabled, #8c9596)` (Pixel) |

## 2. Ghost button — regular weight

Ghost is the **only** button that is **regular** weight (primary + secondary are
semibold). Font size stays 14px. No fill, no border, `text.secondary`, hover =
neutral-hovered. Used for Cancel / dismiss / close / back. If a ghost button
looks bold, it's wrong. (`erp.css` › `.btn-enterprise--ghost`.)

## 3. Primary button — icon is always white

An icon inside a primary button is **always white**. currentColor icons inherit
the white text automatically, but icons that carry their own fill (e.g.
`airene-brand`, brand glyphs) show their native colour unless forced. Override
whites out fill + stroke of any icon inside a primary button.
(`erp.css` › `.btn-enterprise--primary :is(.mp-icon, svg)`.)

## 3b. Header icon buttons — icon is always white (`icon.inverse`)

> Full spec: **[global-header-bar.md](global-header-bar.md)** (the whole
> `ErpHeader` pattern). Rules: `rule/header-icon-inverse`,
> `rule/header-icon-veil-no-border`.


The quick-action icon buttons in the global header (`ErpHeader` — help, inbox,
upload/`desktop`, and the quick-create `+`) sit on the **dark** header
(`background.header`, `#142D26`). A Pixel ghost `MpButton` renders its icon in the
default **dark** icon color, which is invisible/wrong on the dark header, and it
stays dark on hover (only the bg fill lightens). So these buttons must render the
glyph with an **explicit `icon.inverse` (white)** color that does **not** change on
hover/active — only the background fill changes.

- Don't rely on `:left-icon` on a ghost `MpButton` here — the icon inherits the
  button's dark currentColor.
- Do render `<MpIcon :name="icon" color="icon.inverse" />` as the button child.
- **Hover/active fill is a literal translucent white** (`rgba(255,255,255,0.12)`
  hover, `rgba(255,255,255,0.2)` active/pressed) — a subtle veil over the dark
  header. Do **not** use the Panda `background.surface.bold.hovered/pressed`
  tokens here: in this build they resolve to an **opaque near-white** (`#f8f9f9`),
  which paints a light box on the dark header and washes out the white icon.

The shared `IconButton` (`app/components/IconButton.vue`) already does this, so use
it for any new header action; the quick-create `+` (`ErpQuickCreateMenu`) uses the
same `<MpIcon color="icon.inverse" />` pattern.

## 4. MpSelect — focus / active state

Pixel's default focus/open state is a faint ~16%-alpha hairline. Override: a
clearly **bold neutral slate** border + 1px ring (`#8c9596`) on focus AND while
the dropdown is open — never brand green. Invalid stays red. Applies to every
MpSelect (and MpInput / MpTextarea / MpDatePicker / MpInputTag share the same
neutral focus ring). (`erp.css` › `.mp-select__control:focus…`, `.mp-select__root:focus-within…`.)

## 4b. Dropdowns — always `<ErpFilterSelect>` (an MpPopover menu)

Pixel's **`MpSelect` renders a NATIVE `<select>`**, so its menu is the OS
dropdown — off-system, and it clips inside scroll containers. So a dropdown is
**never** a native `<select>` **nor** `MpSelect`. Every dropdown/filter uses
**`ErpFilterSelect`** (`app/components/patterns/ErpFilterSelect.vue`): a form-pill
trigger + a Pixel **`MpPopover`** option list (`use-portal`, so it escapes
clipping), and it's **clearable** — an (×) on hover resets it.

```vue
<ErpFilterSelect id="…-filter" :model-value="val" placeholder="Lifecycle"
  :options="[...LIFECYCLE_STAGES]" @update:model-value="v => (val = v)" />
```

Options are `string[]` or `{ value, label }[]`. The pixel-police full-scan
**fails on a native `<select>` OR an `MpSelect` in the CRM module.**

**Field metrics — match MpInput exactly (`rule/select-field-metrics`).** Every
hand-rolled select/dropdown trigger (`.efs-trigger`, `PopoverSelect` `.ps-trigger`,
`MultiSelectDropdown` `.msd-field`, `AdvanceDateFilter` `.adf-trigger`) must sit at the
**same height and resting border as an MpInput/MpAutocomplete beside it**: **height
`var(--mp-sizes-9.5, 38px)`** and **border `1px solid var(--mp-colors-border-form,
#1d1f2429)`** — the translucent form-border Pixel draws on MpInput. Do **not** use `36px`
(`--mp-sizes-9`) or the lighter/cooler table border `--mp-colors-border-default` (#e3e7e9)
on a field trigger, and never the short `--mp-*` aliases (they resolve **empty** in this
build). Focus/active border stays the neutral bold `#8c9596` ring
(`rule/select-active-neutral`). The rounded filter-bar **search pill** (§5) is exempt.

## 5. Search — always a form pill, shared focus ring

Every search box in the app is the **pill** form used in the filter bar above a
table: neutral fill, `border.default`, **fully-rounded** (`radii.full`), 14px
input, placeholder = `text.placeholder`. On focus it gets the same neutral slate
ring (`#8c9596`) as the form controls — never brand green. Do not build a
square/plain search input. Canonical markup = `.filter-search` + `.filter-search-input`
(`BillsReviewFilesPage.vue` and every index/filter bar). Focus override in
`erp.css` › `.filter-search:focus-within, …`.

## 6. Typography — 14px/regular is the default; 12px only for captions

Body / field / value / control text is **14px regular** (`font-sizes.md`,
`text.default`). Do **not** use 12px (`font-sizes.sm`) for normal text. The ONLY
place 12px appears is a **caption** — the small secondary line, usually directly
**below** a 14px value (field helper text, the label above a value in a
ContentList, "Visible to vendor", uploaded-by lines). Caption = 12px
`text.secondary`. If you're reaching for 12px and it isn't a caption under a
14px line, use 14px.

## 7. Content detail pages — key/value uses ContentList

A content/detail page's header summary and any key→value display use the
**`ContentList`** component (`app/components/patterns/ContentList.vue`): a **12px
`text.secondary` label (caption)** stacked directly above its **14px
`text.default` value** — see rule 6. Don't hand-roll label/value pairs with ad-hoc
sizes; compose status/tags inside it with `ErpStatusBadge` / `ErpTagList`. See
`ContentList.md` and `details-page-format.md`.

## 8. MpTabs `variant-color="green"` — selected tab color

Pixel 3 DT 2.4 Enterprise's "green" tab variant paints the selected tab text and
underline in a **pale mint** (`mp-c_green.400`, ~`#7dc7a8`) — it reads as
disabled/muted, not selected. The ERP standard is the same dark brand green used
everywhere else for a "selected" state (`text.selected`, underline
`border.selected`/`#029861`). Fixed globally in `erp.css` ›
`.mp-tab--variantColor_green.mp-tab--isSelected_true` — do **not** re-patch this
per page with a local `:deep()` override (many older detail pages still carry one;
harmless but redundant now that the fix is global).

## 9. MpCheckbox — disabled control border

Pixel 3 DT 2.4 Enterprise's disabled checkbox border (~`#ebf0f1`) has almost no
contrast against the page's off-white background (~`#f8f9f9`) — a disabled-but-
available checkbox (e.g. a role's "Access limitation" before the role itself is
ticked) reads as if there's no checkbox at all. Fixed globally in `erp.css` ›
`.mp-checkbox__root[aria-disabled="true"] .mp-checkbox__control` to use
`border.default` (`#e3e7e9`) — visible but still clearly muted/inactive.

---

## Rule of thumb

Reach for the **ERP class/component** (`btn-enterprise--*`, `.filter-search`,
`ContentList`, `ErpStatusBadge`), not the raw Pixel variant. The `erp.css`
overrides then guarantee the DT 2.4 Enterprise look even where Pixel's default
would be wrong.

---

## Enforcement — the "pixel police"

Two guards keep modules on-system:

- **`scripts/pixel-police-ci.sh`** (CI gate) — checks only the lines a PR *adds*
  (hardcoded colors, raw HTML controls, hardcoded px, drop-shadows, non-Pixel3
  imports). It deliberately ignores pre-existing code, so it never flags committed
  debt — only new drift.
- **`tests/pixel-police.spec.ts`** (`npm test`) — a **full-scan** guard. The CRM
  module block scans every CRM file end-to-end and fails on bespoke CSS: raw
  off-system `MpButton variant="secondary|ghost"`, hand-rolled button/control
  classes (`*-btn`, `*-input`, chips, segmented…), raw `<button>/<input>` without
  a **sanctioned** class, hardcoded color literals, and drop-shadows on surfaces.

**Sanctioned raw-control classes** (used across dozens of non-CRM files, so they
*are* the override system — not drift): `btn-enterprise*`, `filter-all-btn`,
`filter-icon-btn`, `filter-btn-group`, `filter-search`/`search-input`,
`search-clear-btn`, `row-kebab`, `page-tab`, `detail-breadcrumb`, `sidebar-toggle`.
Anything else that renders like a control must be a Pixel component or one of
these — never a new per-page class. When you add a genuinely reusable override,
put it in `erp.css` (global) and add its name to the police allowlist; do **not**
create a per-page bespoke control class.
