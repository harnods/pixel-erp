# Validation Gates

Run these MCP calls **before** drafting the plan (imagination phase) and **before** writing code (code generation phase). Stop at the first unknown — do not guess.

## MCP gate table

| What to validate                                                         | MCP call                                             | When to skip                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| Any UI component (button, input, table, modal, popover, badge…)          | `get-component("<name>")`                            | Component was already validated earlier in this session           |
| Any icon name                                                            | `get-icon-name("<name>")`                            | Icon name confirmed in a previous get-icon-name call this session |
| Full page template (new project scaffold)                                | `get-template("<name>")`                             | Project already exists and templates aren't needed                |
| Reusable UI section (data table, sidebar, pagination, description list…) | `get-block("list all")` then pick the matching block | Block already installed in `pixel-blocks/` folder                 |
| Setup, token mode, dark mode, plugin registration                        | `get-docs("<query>")`                                | Setup already confirmed in Step 0 project scan                    |

## MCP authority rule

- **MCP owns:** prop names, slot names, event names, component availability
- **Reference files own:** which prop values to use, CSS overrides, zone placement, workarounds for Pixel bugs or Mekari product decisions

If MCP output conflicts with a reference file rule then follow the reference; it encodes a product-level decision.
