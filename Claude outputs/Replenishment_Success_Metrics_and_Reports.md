# Inventory Replenishment — Success Metrics & Reports

**Owner:** Nia · **Module:** Mekari SCM Service (Jurnal) · **Date:** 18 September 2026 · **Status:** Proposal for review

> Purpose: define the reports that answer *"is the replenishment feature actually working?"* — benchmarked against how NetSuite, Netstock and demand-planning tools measure it, and mapped to Mekari's modules, targets and MVP/phase. It separates **feature success** (is the engine good and used?) from **business outcome** (did inventory health improve?), because conflating the two is the classic way a feature looks like it failed when the business moved for other reasons.

---

## 0. The one framing decision

There are two different questions, and they need different reports:

1. **Does the FEATURE work and get used? (the "success rate")** — is the recommendation accurate, trusted, and acted on? This is directly attributable to the feature and is the honest measure of whether *it* works.
2. **Did inventory HEALTH improve? (the ROI)** — fewer stockouts, less dead stock, freed cash, better turns. This is the business value, but it is lagging and multi-causal (promotions, seasonality, supply shocks all move it), so it must be attributed carefully, not claimed wholesale.

Report on both, but never present Layer 2 movement as proof the feature works without the Layer 1 evidence and an attribution method (§4).

---

## 1. Layer 1 — Feature success reports (attributable to the engine)

| Report | Key metrics & formulas | Source / module | Target | Phase |
|---|---|---|---|---|
| **R1 · Recommendation Acceptance & Quality** | **Acceptance rate** = % of suggested qty kept unchanged on the resulting PR/PO; **edit magnitude** = median \|final − suggested\| ÷ suggested; ROP/safety/lead **override rate**; vendor-change-at-PR rate (D12) | PR/PO (Transaction) + engine logs | Acceptance **> 60%**; investigate **< 40%** (mistrust) | **MVP** |
| **R2 · Demand Forecast Accuracy** | **MAPE** = mean(\|actual − forecast\| ÷ actual); **WMAPE** (revenue/volume-weighted); **Bias** = mean(forecast − actual); **MAE** (units). Segment by FSN / ABC / warehouse | Transaction sales history + AI | MAPE **5–20%** (accuracy 80–95%); Bias ≈ 0 | Phase 1 (needs cycles of history) |
| **R3 · Lead-time Accuracy & Coverage** | **% SKUs on Tier-1 computed** vs estimated lead time; **lead-time error** = actual (GR − PO) vs predicted; **vendor OTIF / on-time %**; lead-time variability per vendor×product | QB PO date ↔ SCM GR | Computed coverage **> 70%** within 60 days | MVP (coverage) / Phase 1 (error, OTIF) |
| **R4 · Worklist Adoption & Action** | Worklist **DAU/WAU**; **% due items actioned** within N days; aged/ignored count; **PR→PO conversion rate** (how many requests purchasing acts on); time-from-due-to-PR; suppressed duplicate recs (US-006); muted-item stockout saves (US-014) | App events + Transaction | Action rate high; PR→PO healthy (low = requests ignored) | **MVP** |
| **R5 · Data Readiness / Needs-setup** | Count & **% of SKUs in Needs setup**; cold-start / provisional SKU count & **graduation rate**; missing-lead-time / missing-vendor counts | Engine / Product / SCM | Needs-setup **trending → 0**; alert **> 20%** of active SKUs | **MVP** |

R1, R4, R5 are the true "success rate" of the function and are shippable in MVP because they only need the feature's own events. R2/R3 accuracy need a few recompute cycles before the numbers mean anything.

---

## 2. Layer 2 — Business outcome reports (the ROI)

| Report | Key metrics & formulas | Source / module | Target / benchmark | Phase |
|---|---|---|---|---|
| **R6 · Stockout & Service** | **Stockout rate** = SKUs out of stock ÷ total SKUs; **fill rate / service level** = orders fulfilled complete ÷ total; days-out; **lost-sales value** = lost units × price | WMS on-hand + Transaction SO (+ Accounting for lost margin) | Fill **95–98%**; stockout **< 2–5%** | MVP (stockout/fill) / Phase 1 (lost sales) |
| **R7 · Overstock & Dead-stock** | **Excess** units/value above max/coverage; **dead / non-moving (FSN=N) value**; **% dead** = unsellable ÷ available; carrying cost of excess. Feeds PSAK 14 obsolescence review | WMS + Product costing + FSN | Dead stock **< 25%**; excess trending down | MVP (FSN-based) / Phase 2 (provision) |
| **R8 · Inventory Efficiency** | **Turnover** = COGS ÷ avg inventory; **DIO / days of cover** = avg inventory ÷ daily COGS; **sell-through** = sold ÷ received | Accounting COGS + WMS inventory | Turns **4–6×** (industry-dep.); DIO **30–90 days** | Phase 1 |
| **R9 · Working Capital / Cash** | Inventory value trend; **cash tied up**; cash freed vs baseline; carrying-cost % | Accounting | Cash freed positive; carrying cost down | Phase 1 |

These are lagging and shared with the rest of the business — treat them as *"the environment the feature is trying to improve,"* attributed via §4, not as a raw scorecard for the feature.

---

## 3. Layer 3 — The exec "Replenishment Health" view

A single dashboard, the way Netstock frames it — the **stockout ↔ excess balance** — plus the feature's adoption and accuracy, segmented so it's actionable:

- **Balance gauge:** stockout risk (R6) on one side, excess/dead stock (R7) on the other — the feature's job is to shrink both at once.
- **Trust tiles:** acceptance rate (R1), forecast accuracy (R2), computed-coverage (R3).
- **Segmentation (Netstock ABC practice):** by **ABC value × FSN velocity**, and by **warehouse** — so a good aggregate can't hide a failing A-item class or a bad location.
- Natural home for the **AI module**: "which SKUs are we still stocking out on?", "where is cash tied up?", "is the recommendation being trusted?" answered from these tables.

---

## 4. Attribution — proving it was the feature, not luck

Two low-cost methods so Layer 2 movement is credible:

1. **Baseline (before/after):** snapshot R6–R9 for the 60–90 days before rollout, compare after. Simple, but confounded by seasonality.
2. **Managed vs unmanaged cohort (preferred):** compare SKUs under replenishment management against a matched set that isn't yet — the difference is the feature's effect, controlling for market conditions. Cheap because the feature already tracks which SKUs are managed.

Also surface **counterfactual saves** the feature can claim directly: duplicate POs suppressed (US-006), muted-item stockouts caught (US-014), and Needs-setup items rescued before they went dark — these are honest, feature-attributable wins.

---

## 5. Competitor benchmark

| Source | What they surface | Takeaway for us |
|---|---|---|
| **Netstock** (replenishment tool) | Top-5: turnover, fill rate, forecast accuracy, DIO, stockout rate; ABC segmentation; explicit **stockout-vs-excess** framing | Adopt the balance framing + ABC/FSN segmentation (Layer 3) |
| **NetSuite** | ~33 KPIs incl. turnover, DSI, fill rate, stockout, backorder, sell-through, carrying cost, dead stock, service level, lead time, inventory accuracy | Our R6–R8 match the credible core; don't over-build the long tail |
| **Prediko / demand-planning** | Forecast-accuracy family: MAPE, WMAPE, Bias, MAE, FVA; lead-time variability; lost-sales; planned-vs-actual reorder cadence | Basis for R2/R3; WMAPE + Bias are the ones worth having |
| **Accurate / BigSeller / Jubelio** (SEA rivals) | Little to no replenishment-effectiveness reporting — mostly raw stock reports | **White space:** a replenishment health + accuracy dashboard, especially AI-queryable, is a differentiator, not catch-up |

The effectiveness *dashboard itself* is largely absent from your direct SEA competitors — consistent with the benchmark's finding that the recommendation engine is white space. Pair it with the accounting-native and AI layers and it's hard for them to copy.

---

## 6. Recommended MVP starter set

Ship the reports that are (a) attributable to the feature and (b) computable from day one:

- **R1 Recommendation Acceptance**, **R4 Worklist Adoption + PR→PO**, **R5 Needs-setup readiness** — the honest "success rate."
- **R6 Stockout & Fill (basic)** and **R7 Dead-stock via FSN** — the two outcome numbers customers feel immediately.
- Defer **R2/R3 accuracy** (need history), **R8/R9 cash** (need costing/COGS wiring) to Phase 1.
- Stand up the **Layer 3 exec view** with whatever of the above exists, segmented by warehouse + FSN.

This mirrors the OBS metrics already embedded in the user stories (US-001 computed-coverage, US-006 suppressed duplicates, US-008 acceptance rate, US-003 Needs-setup count, US-016 worklist usage) — so the MVP reports are mostly *surfacing telemetry the build already emits*, not new instrumentation.
