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
