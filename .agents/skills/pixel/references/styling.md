# Styling

Use this when styling UI.

## Rules

1. Use full property names such as `alignItems`, `justifyContent`, and `flexGrow` in CSS props
2. Avoid inline styles, for example `<div style="margin-bottom: 8px">`
3. Avoid hardcoded tokens, for example `MpFlex marginBottom="80x"`
4. Avoid using the Vue `<style></style>` tag

## Priority

1. Use CSS props for `MpFlex`, `MpScrollbar`, `MpSkeleton`, and `Pixel.*`
2. Use CSS function `css()` only when CSS props are unavailable and you need to apply custom styling to a component

## Design Token

Call `get-docs("design tokens 2.4")` or `get-docs("spacing tokens")` for the complete list of 2.4 tokens.

Quick reference:

| Need                    | Semantic             | Foundation            | Raw       |
| ----------------------- | -------------------- | --------------------- | --------- |
| Primary text            | `text.default`       | `colors.neutral.1000` | `#272B32` |
| Secondary text          | `text.secondary`     | `colors.neutral.700`  | `#656F80` |
| App shell background    | `background.surface` | -                     | `#F1F5F9` |
| Content area background | `background.stage`   | `colors.white`        | `#FFFFFF` |
| Default border          | `border.default`     | `colors.neutral.300`  | `#DCDFE4` |

## Correct Usage

```vue
<MpFlex
  flexDirection="column"
  gap="4"
  padding="6"
  backgroundColor="background.surface"
>
  <MpText size="h3" color="text.default">Title</MpText>
  <MpButton :class="css({ marginTop: '4' })">Submit</MpButton>
</MpFlex>
```

## Incorrect Usage

```vue
<MpFlex :class="css({ marginTop: '16px' })">
  <MpText style="color: #1f2937">Title</MpText>
</MpFlex>
```
