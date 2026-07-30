# Testing — Vitest suite

The automated safety net for the ERP/WMS prototype. It locks in the **business
rules** (status lifecycles, stock/reservation math, cancel cascades), the
**data-model coherence** (no orphan FKs, no negative stock), and the **UI
behaviour** of every execution page (scan gating, drawers, unsaved-changes
guards, PDFs).

> Companion docs: [data-model.md](data-model.md) · [scenarios.md](scenarios.md) ·
> [integrity-guards.md](integrity-guards.md). Business-rule source of truth:
> [DESIGN.md](../../DESIGN.md) + [inbound-outbound-e2e-flows.md](../inbound-outbound-e2e-flows.md).

---

## Headline

| Metric | Value |
|---|---|
| Spec files | **133** |
| Passing tests | **673** |
| Runner | Vitest (`vitest run`) |
| Config | [`vitest.config.ts`](../../vitest.config.ts) — Vue plugin, `~`/`@` → `app/` alias |

---

## How to run

```bash
npm test            # vitest run — the whole suite, once
npx vitest run      # same
npx vitest          # watch mode
npx vitest run tests/outbound-e2e-scenarios.spec.ts   # one file
npx vitest run -t "shared picking"                    # by test-name match
```

Do **not** run the dev server to test — every spec drives the data/logic layer
(or a mounted component) directly.

---

## Conventions

| Convention | What it means |
|---|---|
| **node vs happy-dom** | Default `environment: 'node'` (pure data-layer/logic specs). A file that mounts a Vue page/drawer opts in per-file with `// @vitest-environment happy-dom` (≈70 files). |
| **Append-only, unique-id isolation** | There is **no global reset** between tests. The mock-DB is a live reactive singleton, so specs never mutate shared seed rows destructively — they **append** their own records with unique ids (`test-…`, high-numbered ids) and assert only on those. Read-only coherence specs assert over the seed as-is. |
| **Data-integrity failure-collection** | Coherence specs (`*-coherence`, `*-integrity`, `data-integrity`) loop the whole seed graph, **collect** every violating row into an array, then assert the array is empty — so one failing test names *all* offenders at once, not just the first. |
| **Docblock-first** | Every spec opens with a `/** … */` explaining the rule under test and citing the canonical data file. Read it before the `it()` names. |
| **Scenario-matrix specs** | The big cascade files (`inbound-cancel-scenarios`, `outbound-cancel-scenarios`, `outbound-cancel-multi-partial`, `outbound-e2e-scenarios`) enumerate labelled scenarios (T1.1…, G1.1…) that mirror the PRD/flow-doc matrices 1:1. |

---

## Known environmental noise (not failures)

Three `@floating-ui/dom getBoundingClientRect` **unhandled errors** surface in
happy-dom component specs that mount Pixel popovers/drawers. happy-dom has no
layout engine, so floating-ui can't measure — the error is logged but the tests
still assert and **pass**. This is environmental; it is not a product defect and
not a test failure.

---

## Map of the suite

| Area | Docs |
|---|---|
| What data exists & the invariants tests enforce | [data-model.md](data-model.md) |
| Every scenario, per module, mapped to its spec file | [scenarios.md](scenarios.md) |
| The cross-module delete/archive/stock guards | [integrity-guards.md](integrity-guards.md) |
