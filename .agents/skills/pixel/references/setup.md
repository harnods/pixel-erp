# Setup

Use this file before implementation when project readiness is uncertain.

## Package Check

- Confirm `@mekari/pixel3` is installed.
- Confirm the app already renders Pixel components or can be updated to do so.

## Project Variants

### Nuxt

```bash
pnpm add @mekari/pixel3
```

Register Pixel according to project convention and ensure global Pixel styles are loaded.

### Vue 3 + Vite

```bash
pnpm add @mekari/pixel3
```

Register the Pixel plugin and required composables in app bootstrap based on official docs from `get-docs`.

## Token Mode Check

1. Identify whether the project uses Design Token 2.1 or 2.4.
2. Prefer 2.4 semantic tokens for new work when the project is already on 2.4.
3. Preserve 2.1 when the app has not migrated and the user did not request migration.

## Minimal Readiness Checklist

- Pixel package present
- Global setup loaded
- Token mode known
- Required icons and assets available

## Useful MCP Queries

- `get-docs("setup pixel3 nuxt")`
- `get-docs("setup pixel3 vue vite")`
- `get-docs("design token 2.1 vs 2.4")`
- `get-docs("pixel3 theming")`
