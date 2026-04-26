# Styling

Use this file when deciding how to style Pixel components safely.

## Priority

1. Use CSS Props for `MpFlex`, `MpScrollbar`, `MpSkeleton`, and `Pixel.*`.
2. Use `css()` only for components that do not expose the CSS Props you need.
3. Use design tokens for color, spacing, and typography values.

## Rules

- Use full property names such as `alignItems`, `justifyContent`, and `flexGrow`.
- Avoid shorthand style props when explicit properties are available.
- Avoid inline styles for visual styling.
- Avoid hardcoded visual values unless the surrounding code already relies on them.

## Correct Usage

```vue
<MpFlex direction="column" gap="4" padding="6" backgroundColor="background.surface">
  <MpText size="h3" color="text.primary">Title</MpText>
  <MpButton :class="css({ marginTop: '4' })">Submit</MpButton>
</MpFlex>
```

## Incorrect Usage

```vue
<MpFlex :class="css({ marginTop: '16px' })">
  <MpText style="color: #1f2937">Title</MpText>
</MpFlex>
```

## Boundary Rules

- Do not use `css()` on `MpFlex` or `Pixel.div` for layout that CSS Props already support.
- Do not use shorthand border declarations when individual border properties are clearer.
- Keep new styling aligned with the existing theme and token mode.
