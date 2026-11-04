# Setup

Use this implementation when project readiness is uncertain.

## Package Check

Confirm `@mekari/pixel3` and `@mekari/pixel3-postcss` are installed.

| Situation                 | Action                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| Both installed            | Proceed                                                                     |
| Missing, existing project | `get-docs("setup pixel3 nuxt")` or `get-docs("setup pixel3 vue vite")`      |
| New project from scratch  | `get-template("general starter")` or `get-template("general starter nuxt")` |

## Project scan

| Check                   | How                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Token mode (2.1 vs 2.4) | Search `setNextTheme` in `main.ts`, `app.vue`, or any `*.ts`/`*.vue`. If `true`, token is 2.4. Ask only if no signal found.   |
| Existing blocks         | Scan `pixel-blocks/`, `src/pixel-blocks/`, `app/pixel-blocks/`. Note names — don't duplicate.                                 |
| Existing layouts        | Scan `layouts/default.vue`, `src/layouts/`, `app/layouts/`. Check if `Navbar`, `Sidebar`, `SidebarChild` are already present. |
