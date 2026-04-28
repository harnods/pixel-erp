# Design Tokens

Use this file when selecting color, spacing, or typography values.

## Token Priority

1. Use Design Token 2.4 semantic tokens when the project is on 2.4.
2. Use Design Token 2.1 tokens only when the project is still on 2.1.
3. Use exact design values only as a last resort and call that out explicitly.

## Core Color Choices

| Need | Preferred Token |
| --- | --- |
| Primary text | `text.primary` |
| Secondary text | `text.secondary` |
| Warning text | `text.warning` |
| Danger text | `text.danger` |
| Success text | `text.success` |
| Surface background | `background.surface` |
| Neutral background | `background.neutral` |
| Strong neutral background | `background.neutral.bold` |
| Default border | `border.default` |

## Spacing Scale

| Semantic | Token | Value |
| --- | --- | --- |
| `4xs` | `0.125` | 2px |
| `3xs` | `spacing.1` | 4px |
| `2xs` | `0.375` | 6px |
| `xs` | `spacing.2` | 8px |
| `sm` | `spacing.3` | 12px |
| `md` | `spacing.4` | 16px |
| `lg` | `spacing.5` | 20px |
| `xl` | `spacing.6` | 24px |
| `2xl` | `spacing.8` | 32px |
| `3xl` | `spacing.10` | 40px |
| `4xl` | `spacing.20` | 80px |

## Typography Shortcuts

- Use bare `<MpText>` for default body text when no special size is required.
- Valid common sizes include `h1`, `h2`, `h3`, `label`, `label-small`, `body`, `body-small`, and `overline`.
- Prefer documented weight values such as `regular` and `semiBold`.

## Safe Examples

```vue
<MpText color="text.primary">Primary content</MpText>
<MpText color="text.secondary">Secondary content</MpText>

<MpFlex direction="column" gap="sm" padding="md" backgroundColor="background.surface">
  <MpText size="h3">Section title</MpText>
  <MpText>Body content</MpText>
</MpFlex>

<Pixel.div borderWidth="1px" borderStyle="solid" borderColor="border.default" />
```

## Useful MCP Queries

- `get-docs("design tokens 2.4")`
- `get-docs("design tokens 2.1")`
- `get-docs("semantic color tokens")`
- `get-docs("spacing tokens")`

---

## Enterprise Token Values — Project ERP OS

> ⚠️ **This project uses Enterprise theme only.** Never use Light mode values.  
> Source of truth: `app/layouts/default.vue` `:root` block.  
> CSS Props syntax (e.g. `backgroundColor="background.header"`) is resolved by Pixel at runtime — use `var(--mp-*)` only in scoped `<style>` blocks.

### Background

| CSS Variable | Hex | Use |
|---|---|---|
| `--mp-background-surface-bold` | `#142d26` | Header bar, sidebar header |
| `--mp-background-surface` | `#f8f9f9` | App shell background |
| `--mp-background-stage` | `#ffffff` | Page stage / content area |
| `--mp-background-neutral` | `#ffffff` | Table rows, cards |
| `--mp-background-neutral-subtle` | `#f8f9f9` | Table header, sidebar |
| `--mp-background-neutral-hovered` | `#f8f9f9` | Row hover state |
| `--mp-background-neutral-pressed` | `#ebf0f1` | Row pressed state |
| `--mp-background-neutral-subtle-hovered` | `#ebf0f1` | Sidebar item hover |
| `--mp-background-nav-stack-hovered` | `#d6f4e9` | Active nav item hover |

### Border

| CSS Variable | Hex | Use |
|---|---|---|
| `--mp-border-default` | `#e3e7e9` | Table row separator, filter bar bottom |
| `--mp-border-bold` | `#8c9596` | Emphasized borders |

### Text

| CSS Variable | Hex | Use |
|---|---|---|
| `--mp-text-default` | `#080d0e` | Primary body text |
| `--mp-text-inverse` | `#ffffff` | Text on dark backgrounds (header) |
| `--mp-text-secondary` | `#3a4749` | Labels, captions, pagination info |
| `--mp-text-selected` | `#0f6d4d` | Active/selected state text |
| `--mp-text-link` | `#165082` | Clickable links (invoice number) |
| `--mp-text-disabled` | `#8c9596` | Disabled state, sort arrows |
| `--mp-text-danger` | `#a8352d` | Error messages, overdue labels |

### Other

| CSS Variable | Value | Use |
|---|---|---|
| `--mp-fonts-body` | Inter, system-ui fallbacks | All body text |
| `--mp-radii-md` | `0.375rem` | Button and card border radius |
| `--mp-shadows-sm` | `0px 10px 15px -3px #1d1f2429, ...` | Dropdown / popover shadow |
