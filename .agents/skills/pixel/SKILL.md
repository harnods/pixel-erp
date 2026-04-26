---
name: pixel
description: Lean, execution-first guide for implementing Mekari Pixel 3 interfaces in Vue 3 or Nuxt from Figma nodes or text requirements. Use when building or modifying Pixel-based UI, validating Pixel props with MCP docs, enforcing token-safe styling, checking token mode (2.1 vs 2.4), or translating Figma structure into Pixel components with minimal context overhead.
metadata:
  author: Ahmad Zakiy
  version: "2026.4.14"
  source: https://pixel-mcp.netlify.app/skills/
---

# Pixel New

Build Pixel 3 UI with a low-noise workflow: verify setup, map the UI, validate props, apply token-safe styling, and ship runnable Vue/Nuxt code.

## Golden Rules

1. Import UI from `@mekari/pixel3`.
2. Use Pixel primitives before raw HTML equivalents.
3. Wrap validated fields in `MpFormControl`.
4. Verify props with Pixel MCP `get-component` before guessing.
5. Prefer design tokens over raw color, spacing, or typography values.
6. Use CSS Props for `MpFlex`, `MpScrollbar`, `MpSkeleton`, and `Pixel.*`; use `css()` only when CSS Props are unavailable.
7. Preserve the project's active token mode instead of mixing 2.1 and 2.4 ad hoc.

## Workflow

### 1. Verify Setup

Read [references/setup.md](references/setup.md) if package setup, plugin registration, or token mode is unclear.

### 2. Analyze the Request

- For Figma work: extract the node ID, then use Figma MCP `get_design_context` and `get_screenshot`.
- For text requests: break the UI into sections, states, interactions, and responsive behavior.
- Produce a short component plan before coding.

### 3. Map UI to Pixel Components

Read [references/components.md](references/components.md), then validate any uncertain component with Pixel MCP `get-component`.

### 4. Apply Styling Safely

- Read [references/design-tokens.md](references/design-tokens.md) when choosing color, spacing, or typography.
- Read [references/styling.md](references/styling.md) when deciding between CSS Props and `css()`.

### 5. Produce Final Code

Read [references/code-structure.md](references/code-structure.md) before writing the final Vue/Nuxt component.

## MCP Usage

### Pixel MCP

- `get-docs` - Pixel setup, component usage, design tokens, and implementation guides
- `get-component` - Component docs, props, slots, and events
- `get-pattern` - Pixel UI patterns and code examples
- `get-template` - Pixel templates and code examples
- `hello-pixel` - Connection test for the MCP server

Available prompts:

- `implement-figma-to-pixel` - Generate an implementation guide for converting Figma designs to Pixel 3 components
- `create-design-to-pixel` - Generate Vue component code from a natural-language UI description

Use `get-docs` first when setup or token mode is unclear, then use `get-component` for component APIs, `get-pattern` for reusable UI patterns, and `get-template` for starter layouts.

### Figma MCP

- `get_design_context` for structure, assets, and code hints
- `get_screenshot` for visual verification
- `get_metadata` only for large-node navigation

## Output Contract

Always produce:

1. Complete runnable Vue/Nuxt code
2. Required imports
3. Components used
4. Token and styling decisions
5. Assumptions, gaps, or unresolved API questions

## QA Checklist

- Setup and token mode confirmed or explicitly called out
- Props verified against Pixel docs where uncertainty existed
- Layout and spacing match the intended hierarchy
- Hover, disabled, error, and loading states handled where relevant
- No stray inline styles or unnecessary raw values

## Reference Loading Guide

- Read `setup.md` before coding if project readiness is uncertain.
- Read `components.md` when mapping UI or resolving prop issues.
- Read `design-tokens.md` when selecting tokens or spacing scale.
- Read `styling.md` when adding layout or custom visual rules.
- Read `code-structure.md` immediately before final code generation.
