# CRM ERP Transaction Conversion Settings V1 — gap analysis & build plan

**PRD mirror:** [`crm-erp-conversion-settings-prd.md`](./crm-erp-conversion-settings-prd.md)
**Confluence:** ECRM / page `51342835732` (tiny `FIBF9As`) — status *DRAFT, for review*.
**Why this doc:** the PRD cites our prototype as its design reference, so the prototype
must reflect the approved behaviour. This maps each PRD area to a prototype surface,
its current status, and what we're building.

## What this PRD is (and is not)

It is **not** generic CRM (leads/pipeline/contacts — those are 4 sibling PRDs). It is a
**narrow, deep feature**: an admin **Settings → ERP Integration Settings** surface that,
per active module (Deals + each custom module), configures whether records convert into
**one** ERP **Sales Quote OR Sales Order** (Expense excluded), via an explicit
**field mapping**; plus a **runtime manual conversion** of one record → exactly one ERP
transaction through a **read-only review + confirm**, with exactly-once guarantees.

### Core invariants (do not violate)
- Targets = Sales Quote + Sales Order **only**. Expense fully deferred — **zero** entry points.
- Trigger = **manual only.** No stage/status/condition/schedule/automation starts or prompts a conversion.
- **One** target + **one** saved mapping per module. No parallel draft/published lists, no history/rollback.
- **One** successful ERP transaction per CRM record, ever. No SQ→SO chaining from CRM.
- ERP Customer handling is **create-only** — no search/match/merge/link/unlink.
- Default AR lives in ERP Company Settings, never in CRM.
- Final review is **read-only** — no runtime data entry.

## Gap matrix: PRD area → prototype surface → status

| # | PRD area | Prototype surface | Status | Action |
|---|---|---|---|---|
| 1 | Settings landing (ERP Integration Settings list) | *none* — Settings › Integrations is WhatsApp/Email cards | ❌ missing | New route `/crm/settings/erp-integrations` + `ErpTablePage` list |
| 2 | Module integration editor + mapping rows + readiness | *none* | ❌ missing | New route `/crm/settings/erp-integrations/:moduleId` |
| 3 | Per-module enable + single target (SQ/SO) | `dealConversionTarget` = one target per **company** | ❌ conflict | Restructure to per-module config in `crm.ts` |
| 4 | Explicit field mapping (4 source strategies, compat matrix, readiness) | hardcoded `dealToSalesPrefill` | ⚠️ missing | Mapping-entry model + editor rows |
| 5 | Trigger = manual only | opens on stage change (Won→SO, Proposal→SQ) | ❌ conflict | Manual "Create SQ/SO" action; remove stage auto-open |
| 6 | Review = read-only + confirm | `CrmCreateTransactionDrawer` hosts the **editable** ERP form | ❌ conflict | Read-only review drawer for the CRM-conversion path |
| 7 | Lifecycle: exactly-once, one-success/record, Processing/Converted/Failed→Retry | `Deal.conversion` flag (none/processing/converted/failed) | ⚠️ partial | Model attempts, retry, terminal Converted, one-success guard |
| 8 | Conversion gates: Deal Lost stage, custom-module blocking criterion | *none* | ❌ missing | Lost-stage gate (Deals) + one-criterion editor (custom modules) |
| 9 | Custom-module conversion (not just Deals) | Deals-only | ❌ missing | Config + runtime for custom modules via the module builder |
| 10 | ERP Customer create-only prerequisite | *none* | ❌ missing | Prerequisite branch in the runtime flow |
| 11 | CRM Access caps: Manage/View ERP Integration Settings, Create SQ, Create SO, Retry | Users/Teams matrix exists w/o these | ⚠️ missing | Add capabilities to the permission matrix |
| 12 | Reachable states (empty/degraded/needs-attention/needs-revalidation/inactive/…) | n/a | ❌ missing | Per `docs/design/reachable-states.md` |
| 13 | Expense excluded, zero entry points | verify none leaked | ⚠️ verify | Grep + remove any Expense conversion path |
| 14 | Record conversion card (status, Open in ERP, Retry) | partial (status flag only) | ⚠️ partial | Card on record Detail |

Legend: ✅ built · ⚠️ partial/needs work · ❌ missing/conflict.

## Config state machine (PRD)
`Not configured` · `Disabled — incomplete draft` · `Disabled — valid draft` · `Ready`
· `Needs revalidation` · `Needs attention` · `Module inactive`.
Runtime record status: `Not converted` · `Processing` · `Converted` (terminal) · `Failed`.

## Build sequence (this repo) — status

- **Phase 0** ✅ — PRD mirror + this gap doc + docs index entry.
- **Phase 1** ✅ — per-module conversion config model (`app/data/crmConversion.ts`);
  Settings → ERP Integration Settings **list** (`CrmErpIntegrationsPage.vue`, route
  `/crm/settings/erp-integrations`) + **module editor** (`CrmErpIntegrationEditorPage.vue`,
  route `…/:moduleId`) with the enable toggle, single SQ/SO target, mandatory + optional
  mapping rows (`CrmMappingRow.vue`), custom-module blocking-criterion editor, readiness/
  dependencies side panel, Validate/Preview, and the Disabled(Save draft)/Enabled(Save
  changes, immediate-effect confirm) footer semantics. Sidebar entry added; all copy in
  `translations.ts`.
- **Phase 2** ✅ (Deals) — removed the stage-triggered auto-open + editable ERP form; the
  editable `CrmCreateTransactionDrawer.vue` was **deleted**. Conversion is now a **manual**
  action → **read-only** `CrmConversionReviewDrawer.vue` → explicit confirm →
  `runDealConversion` (Processing→Converted, exactly-once via `dealConvEligibility`,
  one-success-per-record, Lost-stage gate, ERP-Customer create-only notice, Failed→Retry,
  Open-in-ERP link).
- **Phase 3** ✅ — CRM Access group renamed **Settings / ERP integrations** with View /
  Manage / Create SQ / Create SO / **Retry** capabilities; **Expense removed** from
  `CrmConversionTarget` + labels (zero entry points). Reachable states covered on the list
  (not-configured / disabled / needs-attention / needs-revalidation / module-inactive via
  `configState`) and record (not-converted / processing / converted / failed→retry).

### Known follow-ups (documented, not silently skipped)
- **Custom-module runtime conversion** is not yet wired on the generic record pages
  (`CrmGenericRecordDetailPage.vue`) — the Settings config supports custom modules, and the
  review drawer/runtime were built Deals-first. Generalising `CrmConversionReviewDrawer` +
  `runDealConversion` beyond the `Deal` type is the next step.
- Prototype persistence is localStorage; created ERP SO/SQ records are in-memory (rebuilt on
  reload), so a converted deal's "Open in ERP" link is session-scoped.

## Prototype-scope notes
This is a clickable prototype (localStorage persistence via `app/data/persist.ts`), not the
production backend. We model the **behaviour, states, and UI** the PRD specifies; the
exactly-once/outbox/idempotency machinery is represented in the UI/state model, not as real
distributed infrastructure. All UI follows `pixel-erp-design` + `erp-table-page` rules.
