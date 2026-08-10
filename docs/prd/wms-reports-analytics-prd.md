---
source: Confluence page id 51213697517
url: https://jurnal.atlassian.net/wiki/spaces/PD/pages/51213697517
title: "[WMS PRD 1.4] WMS Reports and Analytics"
space: PD (Accounting & Tax)
last_modified: Jul 31, 2026
note: Local mirror — keep in sync
---

# [WMS PRD 1.4] WMS Reports and Analytics

**Parent:** [\[WMS One Pager\] Mekari WMS](https://jurnal.atlassian.net/wiki/spaces/PD/pages/51199967496)

**Status:** draft

**Scope:** MVP only

**Pic:** @Fitriani Meizvira

## TL;DR

| What this is | WMS reporting and analytics, delivered as **two separate pages**: **Analytics page** (dashboard) — metric cards / quickviews. Two sections: **Operational** (live daily) and **Post-Operational** (performance). Every card drills down to detail. **Reports page** — row-level raw data dump, with export. Activities covered: Inbound Timeliness, Inbound Accuracy, Outbound Timeliness, Outbound Accuracy, Product Issuance Rate (naming TBD), Inventory Accuracy. |
| --- | --- |
| Research basis | |
| Proposed solution | |

## Change Log

| Version | Published at | Updated By | Description |
| --- | --- | --- | --- |
| v1.0 | 7/7/2026 | @Fitriani Meizvira | |
| v1.1 | 7/8/2026 | @Fitriani Meizvira | Restructured into two pages (Analytics + Reports). Analytics split into Operational and Post-Operational sections. Added Operational quickview stories, drill-down behavior, and a proposed filter set (incl. operator filters: Receiver, Putaway PIC, Picker, Packer, Courier). Existing content moved: summary → Analytics (Post-Operational); raw data → Reports; per-report Export consolidated into Reports-page behavior. |
| v1.2 | 7/24/2026 | @Fitriani Meizvira | Fixing Receiving Time formula; Fixing Total Putaway formula |
| v1.3 | 7/28/2026 | @Fitriani Meizvira | Removal of SKU filters from Analytics page; Removal of some calculation in Accuracy section, since it is overlapping with Volume section; Addition of "Refresh" button in Analytics page |
| v1.4 | 7/30/2026 | @Fitriani Meizvira | Removing LM role from RBAC-related requirements; Adding Ultimate role from RBAC-related requirements |

---

# Page Structure & Navigation

Reports and Analytics are **two separate pages** under the WMS module.

**Analytics page (dashboard)**

Summary, metrics, and quickviews of Inbound and Outbound activity. Two sections:

- **Operational** — live, daily. "Today, how many inbound... how many received... how many put away." For running day-to-day operations.
- **Post-Operational** — performance metrics (timeliness, accuracy, velocity, stock accuracy). This is what the prototype covers so far.

**Reports page**

The row-level "dump raw data" of Inbound and Outbound activity, with export. This is where a metric card lands when the user wants to see the underlying rows.

## Drill-down behavior

Every card on the Analytics page connects quickly to its detailed data. The destination differs by section:

| From (card clicked) | Opens | Filters carried over |
| --- | --- | --- |
| **Operational** card, e.g. "10 inbound not yet received" | The **Inbound operational page** (the working list, **not** a report) | Warehouse + the card's stage/state (e.g. Waiting to Receive) + today |
| **Operational** card (Outbound), e.g. "5 waiting to ship" | The **Outbound operational page** (working list) | Warehouse + stage/state + today |
| **Post-Operational** metric, e.g. "average picking time" | The **Reports page** → matching report raw data (e.g. Outbound Timeliness) | The same Date + Warehouse (+ SKU / state) currently set on the dashboard |
| **Post-Operational** accuracy metric, e.g. "SHORT EXPECTED %" | The **Reports page** → Inbound/Outbound Accuracy raw data | Date + Warehouse + the clicked state (e.g. SHORT EXPECTED) |

## Proposed filters

Ideas for the filter set across both pages. Operator-level filters (Receiver, Putaway PIC, Picker, Packer, Courier) reuse the P1 columns already defined in raw data, so they are P1.

| Filter | Analytics – Operational | Analytics – Post-Op | Reports (raw) | Notes |
| --- | --- | --- | --- | --- |
| Date range | Fixed to "today" (live) | Yes (default D-6 to D) | Yes | Operational is real-time, so no range. Post-Op and Reports share the range. |
| Warehouse | Yes | Yes | Yes | Warehouse Manager limited to assigned warehouses. |
| SKU / Product | Optional | Yes (Accuracy, Issuance) | Yes | Enables lead-time-by-product insight (carried-over feedback). |
| Inbound Receive State / Outbound Fulfillment State | No | Yes (Accuracy) | Yes | MATCH / SHORT / OVER EXPECTED. |
| Stage / State (operational) | Yes | No | No | e.g. Waiting to Receive, In Picking. Drives the operational cards. |
| [P1] Receiver / Putaway PIC (Inbound); Picker / Packer / Courier (Outbound) | Yes ("my queue", operators) | No | Yes | Operator-level; seeds the future Employee Performance report. |
| [P1] Supplier/Sender (Inbound); Customer/Recipient (Outbound) | No | No | Yes | Party-level filtering on raw data. |

---

# User Stories — Analytics Page

## General — Analytics page behavior

### Story 1 — Access and shared behavior for the Analytics page

**Details**

- **Page location**
  - In ERP package, the WMS analytics page/dashboard is located under WMS module, submenu Overview
  - In WMS package, the WMS analytics page/dashboard is the first standalone menu on the left navigation bar (replacing 'Home' menu in ERP package)
  - This page has two sections: **Operational** (live daily) and **Post-Operational** (performance)
  - In both Inbound and Outbound tab, have a refresh button to reload data in the analytics page without changing any filters, and also information "Updated at hh:mm"
  - Any change of filters will also affect the "Updated at hh:mm" information
- **Access (RBAC)**
  - Roles that can view: Owner, Ultimate, ~~LM~~, Warehouse Manager
  - Owner and/or Ultimate ~~LM~~ can view with any Warehouse filter; Warehouse Manager can only view data filtered by their Warehouse assignments
  - _Notes: LM role is removed per 30 July 2026 due to its actual capability, which is to enable the user to do create and update action. Create and update action is not relevant for this page_
- **Time and timezone**
  - Any timestamps shown must use the warehouse local timezone
- **Filters**
  - Separate filters between Post-Operational and Operational section. Filtering will be detailed in sections below
- **Export**
  - The Analytics page is on-screen only, so NO EXPORT. Export lives on the Reports page

**Acceptance Criteria**

- **AC#1 Access by role** — GIVEN a user with Owner, LM, or Warehouse Manager role, WHEN they open the Analytics page, THEN it loads; a user without one of these roles cannot access it.
- **AC#2 Warehouse scope by role** — GIVEN an Owner or LM, WHEN they use the Warehouse filter, THEN they can select any Warehouse or "All"; and a Warehouse Manager only sees their assigned Warehouses.
- **AC#3 Two sections present** — GIVEN the Analytics page, WHEN it loads, THEN it shows an Operational section and a Post-Operational section.
- **AC#4 Empty state** — GIVEN a filter with no matching data, WHEN the page runs, THEN it shows a zero or blank state, not an error.

---

## Operational section (live daily)

### Story 2 — Inbound operational quick view

_**As a**_ Warehouse Manager, _**I want**_ to see today's live inbound queue, _**so that**_ I can act on what still needs receiving or putaway right now.

**Filters**

- **Warehouse** — Dropdown of "All", and list of active Warehouse Name
  - Default value: For Warehouse Manager → Warehouse that is first assigned to that user (earliest created_at for user x warehouse assignment); For Owner and/or Ultimate ~~LM~~ → "All"
  - _Notes: LM role removed per 30 July 2026 (create/update capability not relevant for this page)_
  - Filter must not be null for the data to be able to load
- **Date** — One date filter only (not a range). The month can only be picked for the last 6 months. Default value = today
- **Operator (Receiver / Putaway PIC)** — Dropdown of Warehouse Manager, Warehouse Operator, Not assigned, and "All"
  - Can only select one value
  - Operator filter WILL NOT apply to Pending Inbound and Closed Inbound
  - If value = All → show all data without operator filter
  - If value = Not assigned → show data with no assignee yet

**Quickview cards**

- **Pending Inbound** — Inbound that has not been worked on yet. Operator filter does not apply for this card.
  - "Total pending Inbound" (main number): Inbound completion status = PENDING; Inbound does not have any non-cancelled Receiving or non-cancelled Putaway task
  - "Should arrive at this date": Inbound with expected arrival date = filtered date, completion status = PENDING, no non-cancelled Receiving/Putaway task
  - "Should arrive < this date, but not finished yet": Inbound with expected arrival date < filtered date, completion status = PENDING, no non-cancelled Receiving/Putaway task
  - On click → open Inbound delivery page, Tab Receipts, Warehouse = filtered Warehouse, Status = PENDING, Arrival date = custom range ('to' = filtered date, 'from' = null)
- **Inbound on receiving** — count of distinct Inbound currently on receiving. Shows three numbers:
  - Total distinct Inbound currently on Receiving (main number): Inbound completion status (IN PROGRESS, PARTIALLY COMPLETED); at least one Receiving with status = IN PROGRESS; Receiving's start_at within filtered date
  - On Receiving, supposed to come within filtered date: same criteria + Inbound's expected arrival date = filtered date
  - On Receiving, supposed to come earlier: same criteria + expected arrival date < filtered date
  - On Receiving, supposed to come later: same criteria + expected arrival date > filtered date
  - On click → Inbound delivery page, Tab Receiving, Warehouse = filtered, Assignee = filtered assignee, Status = IN PROCESS
- **Inbound on putaway** — count of distinct Inbound currently on putaway. Shows three numbers:
  - Total distinct Inbound currently on Putaway (main number): Inbound completion status (IN PROGRESS, PARTIALLY COMPLETED); at least one Putaway with status = IN PROGRESS; Putaway's start_at within filtered date
  - On Putaway, supposed to come = filtered date: same + expected arrival date = filtered date
  - On Putaway, supposed to come earlier: same + expected arrival date < filtered date
  - On Putaway, supposed to come later: same + expected arrival date > filtered date
  - On click → Inbound delivery page, Tab Putaway, Warehouse = filtered, Assignee = filtered assignee, Status = IN PROCESS
- **Closed inbound** — Operator filter does not apply for this card.
  - Total distinct Inbound that is CLOSED (main number): closure status = CLOSED or completion status = FULLY COMPLETED; closed_at within filtered date
  - Closed and supposed to end in filtered date: same + expected arrival date = filtered date
  - Closed but supposed to end earlier: same + expected arrival date < filtered date
  - Closed but supposed to end later: same + expected arrival date > filtered date
  - On click → Inbound delivery page, Tab Receipt, Warehouse = filtered, Status = COMPLETED, Arrival date = custom range ('to' = filtered date, 'from' = null)
- **Inbound with no ongoing action** — Inbound not actively being worked on.
  - Total Inbound with no tasks at all (Operator filter does not apply): completion status (IN PROGRESS, PARTIALLY COMPLETED); no (OPEN, IN PROGRESS) Receiving nor (OPEN, IN PROGRESS) Putaway. **Cannot be clicked**
  - Total Inbound with Receiving as open task: completion status (IN PROGRESS, PARTIALLY COMPLETED); no IN PROGRESS Receiving; at least one OPEN Receiving task. On click → Inbound delivery page, Tab Receiving, Warehouse = filtered, Assignee = filtered, Status = Open
  - Total Inbound with Putaway as open task: Inbound status = IN PROGRESS; no IN PROGRESS Putaway; at least one OPEN Putaway task. On click → Inbound delivery page, Tab Receiving, Warehouse = filtered, Assignee = filtered, Status = Open

**Acceptance Criteria**

- **AC#1 Live scope** — GIVEN the Operational section, WHEN it loads, THEN each card reflects current open work / today for the selected Warehouse.
- **AC#2 Drill-down to operational page** — GIVEN an inbound quickview card, WHEN the user clicks it, THEN the Inbound operational page opens, filtered to that stage + Warehouse + today (not a report).
- **AC#3 RBAC scope** — GIVEN a Warehouse Manager, WHEN the section loads, THEN only their assigned Warehouses are available.

### Story 3 — Outbound operational quickview

_**As a**_ warehouse supervisor, _**I want**_ to see today's live outbound queue, _**so that**_ I can act on what still needs picking, packing, or shipping right now.

**Filters**

- **Warehouse** — Dropdown of "All", and list of active Warehouse Name. Default: Warehouse Manager → first assigned warehouse; Owner/Ultimate ~~LM~~ → "All". Filter must not be null.
- **Date** — One date filter only (not a range). Month pickable for last 6 months. Default = today.
- **Operator (Picker / Packer / Shipper PIC)** — Dropdown of Warehouse Manager, Warehouse Operator, Not assigned, "All". One value only. Does NOT apply to Pending/Closed Outbound. All → no operator filter; Not assigned → data with no assignee yet.

**Quickview cards**

- **Pending Outbound** — Outbound not yet worked on. Operator filter does not apply.
  - "Total pending Inbound" [sic] (main number): Outbound completion status = PENDING; no non-cancelled Picking/Packing/Shipping task
  - "Should be completed at this date": expected completion date = filtered date, completion status PENDING, no non-cancelled task
  - "Should be completed < this date, but not finished yet": expected completion date < filtered date, PENDING, no non-cancelled task
  - On click → Outbound delivery page, Tab Requests, Warehouse = filtered, Status = PENDING, Due date = custom range ('to' = filtered date, 'from' = null)
- **Outbound on picking** — distinct Outbound currently on picking. Three numbers:
  - Total distinct on Picking (main number): Outbound status (IN PROGRESS, PARTIALLY COMPLETED); at least one Picking with status = IN PROGRESS; Picking start_at within filtered date
  - Supposed to complete within / earlier / later than filtered date: same + expected completed date = / < / > filtered date
  - On click → Outbound delivery page, Tab Picking, Warehouse = filtered, Assignee = filtered, Status = IN PROCESS
- **Outbound on packing** — distinct Outbound currently on packing. Three numbers (same structure using Packing with status = IN PROGRESS, Packing start_at within filtered date; expected completed date = / < / > filtered date). On click → Tab Packing, Status = IN PROCESS
- **Outbound on Shipping** — distinct Outbound currently on Shipping (main number + expected completed date = / < / > filtered date; Shipping status = IN PROGRESS). NOT CLICKABLE or on click → Outbound shipped page, Tab Shipped, Status = IN PROCESS
- **Closed outbound** — Operator filter does not apply.
  - Total distinct Outbound CLOSED (main number): closure status = CLOSED or completion FULLY COMPLETED; closed_at within filtered date
  - Closed and supposed to end in / earlier / later than filtered date: same + expected completion date = / < / > filtered date
  - On click → Outbound delivery page, Tab Requests, Warehouse = filtered, Status = COMPLETED, Due = custom range ('to' = filtered date, 'from' = null)
- **Outbound with no ongoing action** — Outbound not actively worked on.
  - Total Outbound with no tasks at all (Operator filter does not apply): status (IN PROGRESS, PARTIALLY COMPLETED); no (OPEN, IN PROGRESS) Picking/Packing/Shipping. **Cannot be clicked**
  - With Picking / Packing / Shipping as open task: no IN PROGRESS of that stage; at least one OPEN task of that stage. On click → Outbound delivery/shipped page, respective Tab, Status = Open

**Acceptance Criteria**

- **AC#1 Live scope** — each card reflects current open work / today for the selected Warehouse.
- **AC#2 Drill-down to operational page** — clicking an outbound quickview card opens the Outbound operational page, filtered to that stage + Warehouse + today (not a report).
- **AC#3 RBAC scope** — Warehouse Manager sees only assigned Warehouses.

---

## Post-Operational section — Inbound Timeliness

### Story 4 — Inbound Timeliness metrics

_**As a**_ warehouse manager, _**I want**_ to see how long inbounds take at each stage, _**so that**_ I can find bottlenecks and hold receiving SLA.

**Filters**

- **Date** — range, default D-6 until D, must fill, max 366 days
- **Warehouse** — Dropdown of "All" + active Warehouse Name. Default: WM → first assigned; Owner/Ultimate ~~LM~~ → "All". Must not be null.
- **Operator (Receiver / Putaway PIC)** — Dropdown of Warehouse Manager, Warehouse Operator, Not assigned, "All". One value. Does NOT apply to Open Inbound and Closed Inbound. All → no operator filter; Not assigned → no-assignee data.

**Summary headlines: volume**

- **Total Inbound Created** (Operator filter does not apply):
  - number of distinct Inbound created in WMS within filtered date; Inbound closure status != CANCELLED; created_at within filtered date
  - number of distinct SKU from those Inbound
  - total qty to be received from those Inbound
  - On click → WMS Inbound Timeliness Reports (Date/Warehouse/Operator = active summary filters)
- **Total Closed Inbound** (Operator filter does not apply):
  - number of distinct Inbound already closed within filtered date; closure status = CLOSED; closed_at within filtered date
  - number of distinct SKU; total qty to be received
- **Total Receiving**:
  - number of distinct Receiving activities within filtered date; Receiving status = COMPLETED; completed_at within filtered date
  - number of distinct SKU from Receiving; average distinct SKU per Receiving
  - total qty from Receiving (Batch-tracked products calculated at Product level = sum of all Batch qty); average qty per Receiving
- **Total Putaway**:
  - number of distinct Putaway activities within filtered date; Putaway status = COMPLETED; completed_at within filtered date
  - number of distinct SKU from Putaway; average distinct SKU per Putaway
  - total qty from Putaway (Batch at Product level); average qty per Putaway
- **Inbound, Receiving, Putaway comparison** (Operator filter does not apply):
  - Average Receiving created for one Inbound: all Inbound with closed_at within filtered date; for selected Inbound get all Receiving with status = COMPLETED
  - Average Receiving task in one Putaway: all Putaway with completed_at within filtered date; for selected Putaway get all Receiving with status = COMPLETED

**Summary headlines: duration** _[logic to show duration, follow current development]_

- **Inbound to Expected Arrival Date** (Operator filter does not apply): Inbound with closed_at within filtered date; average and median of (Inbound expected_date minus created_at). Duration <= 0 counted as 0.
- **Inbound to Receiving** — time to receive an Inbound for the first time (average & median). Operator filter does not apply. For each Inbound with closed_at in range, use only the **first Receiving task** (Receiving started first): average/median of (first Receiving start_at minus Inbound created_at). Duration <= 0 counted as 0.
- **Receiving time** — how long the receiving process takes (average & median). All Receiving with finished_at in range: average/median of (Receiving finished_at minus start_at). Duration <= 0 counted as 0.
- **Putaway time (Receiving to Putaway)** — time from end of Receiving to end of Putaway. All Receiving with finished_at in range; for each Receiving get all Putaway with status = COMPLETED. Operator filter applies to Putaway PIC. Average/median of (Putaway finish_at minus Receiving finish_at). Duration <= 0 counted as 0. If no Putaway at all (all WH skip_putaway = TRUE), show "-".
- **Inbound cycle time (dock to stock)** — end-to-end time Inbound created until closed. Operator filter does not apply. Inbound with closed_at in range: average/median of (closed_at minus created_at). Duration <= 0 counted as 0.
- **Inbound Timeliness** — gap between actual Inbound closing time and expected arrival date (closer to zero = more precise). Operator filter does not apply. Inbound with closed_at in range: average/median of (closed_at minus expected_arrival_date). Positive = actual later than expected; Negative = actual earlier than expected.

All duration cards on click → WMS Inbound Timeliness Reports with same Date/Warehouse/Operator filters.

**Acceptance Criteria**

- **AC#1 Cancelled excluded** — CANCELLED inbounds excluded from every volume count.
- **AC#2 Volume detail** — each volume headline shows count, distinct SKU, total qty; batch-tracked products summed at product level.
- **AC#3 Duration statistic** — each duration shows both average and median across in-scope inbounds, in hours and minutes.
- **AC#4 First receiving used** — for Inbound-to-Receiving time, only the first receiving task's start is used.
- **AC#5 Non-positive duration** — a computed duration <= 0 is counted as 0.
- **AC#6 Drill-down** — clicking a metric card opens the Reports page Inbound Timeliness raw data with the same Date and Warehouse filters.

---

## Post-Operational section — Inbound Accuracy

### Story 5 — Inbound Accuracy metrics

_**As a**_ warehouse manager, _**I want**_ to see whether we received what was expected, _**so that**_ I can catch short, over, or missed receipts.

**Filters**

- **Date** — range, default D-6 until D, must fill, max 366 days
- **Warehouse** — "All" + active Warehouse Name. Default: WM → first assigned; Owner/Ultimate ~~LM~~ → "All". Must not be null.
- ~~SKU (default "All"; either "All" or 1 <= x <= 10 SKUs)~~ — Removed per 7/28/2026
- ~~Source of Inbound~~ — Removed per 7/28/2026
- ~~Inbound Receive State (default "All"; MATCH/SHORT/OVER EXPECTED; only if SKU filter = All)~~ — Removed per 7/28/2026

**Summary headlines**

- **Total Closed Inbound** — ~~count/SKU/qty definitions~~ Already included in Timeliness/Volume section above (removal per 7/28/2026). On click → WMS Inbound Accuracy Reports (Date/Warehouse/SKU/Source = active summary).
- **Inbound Receive State** — all Inbound closed within filtered date, show:
  - number and % of closed Inbound with completion = MATCH EXPECTED / addition of on-hand stock = Inbound qty
  - number and % with completion = SHORT EXPECTED / addition of on-hand stock < Inbound qty
  - number and % with completion = OVER EXPECTED / addition of on-hand stock > Inbound qty
- **Total Receive Qty** — using the Timeliness/Volume definition above (removal per 7/28/2026): sum (qty from filtered Product from all Receiving) → number, and percentage (÷ filtered Product's all Inbound Qty). Batch-tracked at Product level.
- **Total Putaway Qty** — using Timeliness/Volume definition above (removal per 7/28/2026): sum (qty from filtered Product from all Putaway) → number, and percentage (÷ filtered Product's all Inbound Qty). Batch at Product level. If no Putaway at all (all WH skip_putaway = TRUE), show "-".

**Special notes / Edge cases**

- Receive rate might exceed 100%, due to option to receive more than Inbound Qty
- Blind or ad-hoc receiving with no expected qty (Inbound qty = 0): exclude from Total Receiving Percentage, but still include in Total Receiving Qty
- Filter to a single SKU: Distinct SKU = 1; other headlines reflect only that SKU

**Acceptance Criteria**

- **AC#1 Closed inbound basis** — only inbounds with status CLOSED and closed_at within filtered date included; CANCELLED excluded.
- **AC#2 Receive state breakdown** — with SKU filter = "All", Inbound Receive State shows count and % of closed inbounds for MATCH / SHORT / OVER EXPECTED.
- **AC#3 Receive state hidden per SKU** — with specific SKUs selected, the Receive State breakdown shows the NaN state instead of percentages.
- **AC#4 Receive and Putaway percentage** — with Total Inbound Qty > 0, Total Receive Qty and Total Putaway Qty each show quantity and its % of Total Inbound Qty; over-receipt may exceed 100% and is not capped.
- **AC#5 Blind receiving handling** — blind/ad-hoc receiving (Inbound Qty = 0) excluded from percentage but still counted in Total Receive Qty.
- **AC#6 Batch at product level** — Receive/Putaway qty for batch-tracked product aggregated at product level.

---

## Post-Operational section — Outbound Timeliness

### Story 6 — Outbound Timeliness metrics

_**As a**_ warehouse manager, _**I want**_ to see how long outbounds take at each stage, _**so that**_ I can find bottlenecks and hold shipping SLA.

**Filters**

- **Date** — range, default D-6 until D, must fill, max 366 days
- **Warehouse** — "All" + active Warehouse Name. Default: WM → first assigned; Owner/Ultimate ~~LM~~ → "All". Must not be null.
- **Operator (Picker / Packer / Shipping PIC)** — Warehouse Manager, Warehouse Operator, Not assigned, "all". One value. Does NOT apply to Pending/Closed Outbound. all → no operator filter; Not assigned → no-assignee data.

**Outbound flow:** Created → Picking → Packing → Shipping → Closed

**Summary headlines: volume**

- **Total Outbound Created** (Operator filter does not apply): distinct Outbound created in WMS within filtered date; closure status != CANCELLED; created_at in range; distinct SKU; total qty to be shipped
- **Total Closed Outbound** (Operator filter does not apply): distinct Outbound closed within filtered date; closure status = CLOSED; closed_at in range; distinct SKU; total qty to be shipped
- **Total Picking**: distinct Picking activities within range; status = COMPLETED; completed_at in range; distinct SKU; average distinct SKU per Picking; total qty (Batch at Product level); average qty per Picking
- **Total Packing**: distinct Packing activities; status = COMPLETED; completed_at in range; distinct SKU; average distinct SKU per Packing; total qty (Batch at Product level); average qty per Packing
- **Total Shipping**: distinct Shipping activities; status = COMPLETED; completed_at in range; distinct SKU; average distinct SKU per Shipping; total qty (Batch at Product level); average qty per Shipping
- **Outbound, Picking, Packing, Shipping comparison** (Operator filter does not apply):
  - Average Picking created for one Outbound: all Outbound with closed_at in range; get all Picking with status = COMPLETED
  - Average Packing task for one Outbound: all Outbound with closed_at in range; get distinct Packing with status = COMPLETED
  - Average Shipping task for one Outbound: all Outbound with closed_at in range; get distinct Shipping with status = COMPLETED

**Summary headlines: duration** _[logic to show duration, follow current development]_

- **Outbound to Expected Completion Date** (Operator filter does not apply): Outbound with closed_at in range; average/median of (expected_completion_date minus created_at). <= 0 counted as 0.
- **Outbound to Picking** — time to pick an Outbound for the first time (average & median). Outbound with closed_at in range; use only the **first Picking task** (started first): average/median of (first Picking start_at minus Outbound created_at). <= 0 counted as 0.
- **Picking time** — how long picking takes (average & median). All Picking with finished_at in range: average/median of (Picking finished_at minus start_at). <= 0 counted as 0. If no Picking at all (all WH skip_picking = TRUE), show "-".
- **Packing time** — from start of Packing to end of Packing. All Packing with finished_at in range: average/median of (Packing finish_at minus start_at). <= 0 counted as 0.
- **Shipping time (Packing to Shipping)** — from end of Packing to shipped. Operator filter applies on the Shipping side. All Shipping with shipped_at in range; from selected Shipping get all Packing with status = COMPLETED related to it: average/median of (Shipping shipped_at minus Packing finish_at). <= 0 counted as 0.
- **Outbound cycle time (order to ship)** — end-to-end time Outbound created until closed. Operator filter does not apply. Outbound with closed_at in range: average/median of (closed_at minus created_at). <= 0 counted as 0.
- **Outbound Timeliness** — gap between actual Outbound closing time and expected ship date (closer to zero = more precise). Operator filter does not apply. Outbound with closed_at in range: average/median of (closed_at minus expected_ship_date). Positive = actual later than expected; Negative = earlier.

All cards on click → WMS Outbound Timeliness Reports with same Date/Warehouse/Operator filters.

**Acceptance Criteria**

- **AC#1 Cancelled excluded** — CANCELLED outbounds excluded from every volume count.
- **AC#2 Volume detail** — each volume headline (Created, Closed, Picking, Packing, Shipping) shows activity count, distinct SKU, total qty; batch-tracked summed at product level.
- **AC#3 Duration statistic** — each duration shows both average and median, in hours and minutes.
- **AC#4 First picking used** — for Outbound-to-Picking time, only the first picking task's start is used.
- **AC#5 Non-positive duration** — computed duration <= 0 counted as 0.
- **AC#6 Timeliness sign** — positive value means actual later than expected; negative means earlier.

---

## Post-Operational section — Outbound Accuracy

### Story 7 — Outbound Accuracy metrics

_**As a**_ warehouse manager, _**I want**_ to see whether we shipped what was ordered, _**so that**_ I can catch short or wrong shipments.

**Filters**

- **Date** — range, default D-6 until D, must fill, max 366 days
- **Warehouse** — "All" + active Warehouse Name. Default: WM → first assigned; Owner/Ultimate ~~LM~~ → "All". Must not be null.
- ~~SKU (default "All"; either "All" or 1 <= x <= 10 SKUs)~~ — Removed per 7/28/2026
- **Operator (Picker / Packer / Shipping PIC)** — Warehouse Manager, Warehouse Operator, Not assigned, "all". One value. Does NOT apply to Pending/Closed Outbound. all → no operator filter; Not assigned → no-assignee data.

**Summary headlines**

- **Total Closed Outbound** — ~~count/SKU/ordered-qty definitions~~ Already included in Timeliness/Volume section above (removal per 7/28/2026). On click → WMS Outbound Accuracy Reports (Date/Warehouse/SKU/Operator = active summary).
- **Total Picked Qty** — using Timeliness/Volume definition above (removal per 7/28/2026): sum (qty from all Product from all Picking) → number, and percentage (÷ total Outbound Qty). Batch at Product level.
- **Total Packed Qty** — using Timeliness/Volume definition above: sum (qty from all Product from all Packing) → number, and percentage (÷ total Outbound Qty). Batch at Product level.
- **Total Shipped Qty** — using Timeliness/Volume definition above: sum (qty from all Product from all Shipping) → number, and percentage (÷ total Outbound Qty). Batch at Product level.

**Special notes / Edge cases**

- Fulfillment rate might exceed 100%, due to over-pick or over-ship
- Fulfillment percentage may differ across stages (picked vs packed vs shipped); show each separately
- Filter to a single SKU: Distinct SKU = 1; other headlines reflect only that SKU

**Acceptance Criteria**

- **AC#1 Closed outbound basis** — only outbounds with status CLOSED and closed_at within filtered date included; CANCELLED excluded.
- **AC#2 Fulfillment state breakdown** — with SKU filter = "All", Outbound Fulfillment State shows count and % of closed outbounds for MATCH / SHORT / OVER EXPECTED.
- **AC#3 Fulfillment state hidden per SKU** — with specific SKUs selected, the Fulfillment State breakdown shows the NaN state instead of percentages.
- **AC#4 Stage percentage** — with Total Outbound Qty > 0, Total Picked/Packed/Shipped Qty each show quantity and its % of Total Outbound Qty; over-fulfilment may exceed 100% and is not capped.
- **AC#5 Batch at product level** — stage qty for batch-tracked product aggregated at product level.

---

# User Stories — Reports Page

## General — Reports page behavior

### Story 10 — Access, export, and shared behavior for the Reports page

**Importance:** Must Have · **Design:** [TBD]

**Details**

- **Page location** — ERP package: WMS Report located in Report module, new WMS submenu. WMS package: WMS Report located in Report module.
- **Access (RBAC)** — Roles that can view: Owner, Ultimate, ~~LM~~, Warehouse Manager. Owner/Ultimate ~~LM~~ can view any Warehouse; Warehouse Manager only their assigned Warehouses. _(LM removed per 30 July 2026.)_
- **Time and timezone** — timestamps use warehouse local timezone.
- **Filters** — detailed in sections below.
- **Export** — available on report page. Exportable to CSV (P0) and XLS/XLSX (P1). Export respects active filters: file contains exactly the filtered rows.
- **Empty and loading states** — when no data matches, show zero/blank state, not an error.

**Acceptance Criteria**

- **AC#1 Access by role** — Owner/LM/Warehouse Manager can open Reports; others cannot.
- **AC#2 Warehouse scope by role** — Owner/LM select any Warehouse or "All"; Warehouse Manager only assigned Warehouses.
- **AC#3 Export scope and formats** — only raw data exportable, in CSV (P0) and XLS/XLSX (P1).
- **AC#4 Export respects filters** — file contains exactly the filtered rows.
- **AC#5 Empty state** — filter with no rows shows zero/blank state, not an error.

---

## Inbound (raw data)

### Story 11 — Inbound Timeliness — raw data

**Importance:** Must Have · **Design:** [TBD]

_**As an**_ analyst, _**I want**_ row-level inbound timeliness data I can export, _**so that**_ I can audit specific inbounds and run my own analysis.

**Filters**

- **Date** — range, default D-6 until D, must fill, max 366 days
- **Warehouse** — "All" + active Warehouse Name. Default: WM → first assigned; Owner/~~LM~~ Ultimate → "All". Must not be null.
- **Operator (Receiver / Putaway PIC)** — Warehouse Manager, Warehouse Operator, Not assigned, "All". One value. ~~Operator filter WILL NOT apply to Open/Closed Inbound~~. all → no operator filter; Not assigned → no-assignee data.

**Raw data columns** — Get all Inbound closed within filtered date. Timestamps in hours/minutes/seconds. Queried data unique per Receiving.

- **Warehouse Name**
- **Inbound ID**
- **Inbound Expected Arrival At**
- **Inbound Closing time** — One Inbound with multiple Receiving will have same value
- **Receiving ID** — multiple Receiving events → multiple rows
- **[P1] Receiver Name**
- **Receiving Start**
- **Receiving Finish**
- **[P1] Putaway PIC Name**
- **Putaway ID**
- **Putaway Start**
- **Putaway Finish**

**Edge cases** — Missing stage timestamps show as blank, not zero or epoch.

**Acceptance Criteria**

- **AC#1 Columns present** — shows Warehouse Name, Inbound ID, Inbound Closing Time, Receiving ID, Receiver Name (P1), Receiving Start, Receiving Finish, Putaway PIC Name (P1), Putaway ID, Putaway Start, Putaway Finish.
- **AC#2 Row granularity** — one row per Receiving and one row per Putaway, with inbound-level fields repeated.
- **AC#3 Blank not zero** — not-yet-done stage timestamp shown blank, not zero/epoch.

### Story 12 — Inbound Accuracy — raw data

**Importance:** Must Have · **Design:** [TBD]

_**As an**_ analyst, _**I want**_ row-level inbound accuracy data I can export, _**so that**_ I can trace fill rate down to each inbound and SKU.

**Filters**

- **Date** — range, default D-6 until D, must fill, max 366 days
- **Warehouse** — "All" + active Warehouse Name. Default: WM → first assigned; Owner/~~LM~~ Ultimate → "All". Must not be null.
- **SKU** — default "All"; either "All" or 1 <= x <= 10 SKUs
- **Source of Inbound** — "All" + list of Inbound source; 1 <= x <= 10 Source. Default "All". Must not be null.
- **Inbound Receive State** — default "All"; MATCH / SHORT / OVER EXPECTED; can only be used if SKU filter = All

**Raw data columns** — Get all Inbound closed within filtered date. Queried data unique per Product and Receiving.

- **[P1] Supplier/Sender Name**
- **Warehouse Name**
- **Inbound ID** — multiple SKU lines → multiple rows
- **Product Name** — only has value if SKU filter != All; otherwise blank
- **Inbound Qty**
- **[P1] Receiver Name**
- **Receiving ID** — multiple Receiving lines → multiple rows
- **Receiving Qty**
- **[P1] Putaway PIC**
- **Putaway ID**
- **Putaway Qty**

**Edge cases** — Batch/serial tracked SKU: line Receive qty sums across batches or serial numbers. Wrong item (not on PO): row with PO qty 0 and Receive qty > 0.

**Acceptance Criteria**

- **AC#1 Row grain** — one row per Inbound line and per Receiving/Putaway, with inbound-level fields repeated, reflecting filters.
- **AC#2 Columns present** — Supplier/Sender Name (P1), Warehouse Name, Inbound ID, Product Name, Inbound Qty, Receiver Name (P1), Receiving ID, Receiving Qty, Putaway PIC (P1), Putaway ID, Putaway Qty.
- **AC#3 Product Name per SKU filter** — SKU = "All" → Product Name blank; specific SKUs → Product Name populated.

---

## Outbound (raw data)

### Story 13 — Outbound Timeliness — raw data

**Importance:** Must Have · **Design:** [TBD]

_**As an**_ analyst, _**I want**_ row-level outbound timeliness data I can export, _**so that**_ I can audit specific outbounds and run my own analysis.

**Filters**

- **Date** — range, default D-6 until D, must fill, max 366 days
- **Warehouse** — "All" + active Warehouse Name. Default: WM → first assigned; Owner/~~LM~~ Ultimate → "All". Must not be null.
- **Operator (Picker / Packer / Shipping PIC)** — Warehouse Manager, Warehouse Operator, Not assigned, "all". One value. Does NOT apply to Pending/Closed Outbound. all → no operator filter; Not assigned → no-assignee data.

**Raw data columns** — Get all Outbound closed within filtered date. Timestamps in hours/minutes/seconds. Queried data unique per Picking + Packing.

- **[P1] Customer/Recipient Name**
- **Warehouse Name**
- **Outbound ID**
- **Outbound Closing time** — One Outbound with multiple Picking will have same value
- **Picking ID** — multiple picking events → multiple rows
- **[P1] Picker Name**
- **Picking Start**
- **Picking Finish**
- **[P1] Packer Name**
- **Packing ID**
- **Packing Start**
- **Packing Finish**
- **[P1] Shipping PIC**
- **[P1] Courier Name**
- **Shipping ID**
- **Shipping At**

**Edge cases** — Missing stage timestamps show as blank, not zero or epoch.

**Acceptance Criteria**

- **AC#1 Columns present** — Warehouse Name, Outbound ID, Outbound Closing time, Picking ID, Picker Name (P1), Picking Start, Picking Finish, Packer Name (P1), Packing ID, Packing Start, Packing Finish, Shipping At.
- **AC#2 Row granularity** — one row per Picking (and per Packing where applicable), with outbound-level fields repeated.
- **AC#3 Blank not zero** — not-yet-done stage timestamp shown blank, not zero/epoch.

### Story 14 — Outbound Accuracy — raw data

**Importance:** Must Have · **Design:** [TBD]

_**As an**_ analyst, _**I want**_ row-level outbound accuracy data I can export, _**so that**_ I can trace fulfilment down to each outbound and SKU.

**Filters**

- **Date** — range, default D-6 until D, must fill, max 366 days
- **Warehouse** — "All" + active Warehouse Name. Default: WM → first assigned; Owner/~~LM~~ Ultimate → "All". Must not be null.
- **SKU** — default "All"; either "All" or 1 <= x <= 10 SKUs
- **Operator (Picker / Packer / Shipping PIC)** — Warehouse Manager, Warehouse Operator, Not assigned, "all". One value. Does NOT apply to Pending/Closed Outbound. all → no operator filter; Not assigned → no-assignee data.

**Raw data columns** — Get all Outbound closed within filtered date. Queried data unique per Product + Picking + Packing.

- **[P1] Customer/Recipient Name**
- **Warehouse Name**
- **Outbound ID** — multiple SKU lines → multiple rows
- **Product Name** — only has value if SKU filter != All; otherwise blank
- **Outbound Qty**
- **[P1] Picker Name**
- **Picking ID**
- **Picked Qty**
- **[P1] Packer Name**
- **Packing ID**
- **Packed Qty**
- **[P1] Shipping PIC / [P1] Courier Name**
- **Shipping ID**
- **Shipped Qty**

**Acceptance Criteria**

- **AC#1 Row grain** — rows at Outbound × SKU (and per Picking) grain, reflecting filters.
- **AC#2 Columns present** — Customer/Recipient Name (P1), Warehouse Name, Outbound ID, Product Name, Outbound Qty, Picker Name (P1), Picking ID, Picked Qty, Packer Name (P1), Packing ID, Packed Qty, Courier Name (P1), Shipping ID, Shipped Qty.
- **AC#3 Product Name per SKU filter** — SKU = "All" → Product Name blank; specific SKUs → populated.

---

**Scope boundary.** This PRD covers Inbound (Timeliness, Accuracy), Outbound (Timeliness, Accuracy), Product Issuance Rate (Stock Velocity), and Inventory Accuracy (cycle count variance), delivered across an Analytics page and a Reports page. Inventory Accuracy depends on the Cycle Count / Stock Opname feature and reason-coded adjustment (P0 anchor items) being available. Do not confuse Inbound/Outbound Accuracy (a process measure: received or shipped vs expected) with Inventory Accuracy (an inventory measure: system vs physical on-hand).

---

# Impacted Module Areas

| Module | Impact |
| --- | --- |
| Fulfillment (WMS) | Primary source. Reads inbound, outbound, receiving, putaway, picking, packing, shipping, and cycle count records with their timestamps and operators. New reporting aggregations, an operational live view, and a raw data export are new WMS artifacts. |
| Product & Inventory | Reads product master (SKU, tracking method, base UOM), on-hand stock-by-location, and stock movements (for issuance velocity). Cycle count results and reason-coded adjustments feed Inventory Accuracy. |
| Transaction | Reads expected qty from the linked PO or ASN (inbound) and SO (outbound) for the accuracy fill rate. |
| Accounting (JE) | None. These reports are read-only analytics with no journal entries. Value variance in Inventory Accuracy reads unit cost only, it does not post. |
| Data / Analytics | New aggregation queries or read models, a near-real-time operational view, plus an export service. |
| AI | None in MVP. Operator, duration, and velocity data can seed future performance and FSN analytics. |

---

# Open Questions

- **Operational metrics:** exact state definitions (waiting to receive, in receiving, waiting for putaway, waiting to pick/pack/ship). Needs one agreed rule per state.
- **Operational refresh cadence:** on page load vs live polling; and the exact date scope (strictly today vs all currently-open work regardless of date).
- **Deep-link filter mapping:** exactly which filters carry over on each card click (confirm per metric).
- **Operator filters** (Receiver, Putaway PIC, Picker, Packer, Courier): confirm as P1 and where they appear (Operational "my queue" and Reports raw).
- **Product Issuance on the Analytics page:** dashboard headline cards vs the per-product table; and where the per-product table lives (Reports page).
- **Inventory Accuracy scorecard:** finalize the metric (currently "xxx" placeholder) and define the matching raw data columns.
- **Reporting grain:** header level or line level. Recommendation: line-level base (inbound by SKU), rolled up to header for the summary.
- **Duration statistic:** average, median, or p90. Recommendation: show median and p90, not average.
- **Date filter basis:** inbound created date, receiving date, or completion date. Recommendation: inbound created date, with a completion-date view as a later option.
- **Volume headline meaning:** Total Receiving and Total Putaway as funnel counts of inbounds, or as counts of receiving and putaway events. Recommendation: funnel counts of inbounds.
- **Definition of Completed Inbound:** all lines received to expected qty, or status Closed. Needs one agreed rule.
- **Over-receipt handling in Receive rate:** cap at 100% or show the true rate. Recommendation: show the true rate and flag.
- **Returns (Inbound Return):** included in these inbound reports or reported separately.
- **Damaged units:** counted in Receive qty, or excluded pending QC result.
- **Report location and RBAC roles:** confirm placement in the WMS module and the viewer roles (Owner, LM, Stockist).
- Add Operator columns (receiver, putaway operator) to the timeliness raw data, to seed the future Employee Performance report at low incremental cost.
- **Product Issuance Rate name:** keep, or rename to "Stock Velocity & Deadstock". Recommendation: rename.
- **Issuance definition:** outbound shipments only, or all stock-out movements (transfer-out, negative adjustment).
- **Deadstock window and Issuance Rate unit:** default no issuance in 90 days; rate per day vs per week. Both configurable.
- Inventory Accuracy depends on the Cycle Count / Stock Opname feature and reason-coded adjustment (P0 anchor). Confirm those ship before or with this report.
- Inventory Accuracy value variance depends on unit cost (batch/serial costing). Confirm availability, else keep value metrics as P1.
- Variance by ABC class in Inventory Accuracy: deferred to Next Phase pending the ABC / FSN engine.
- **Outbound Fulfillment State definition** (MATCH / SHORT / OVER EXPECTED): confirm the rule and whether it is measured at picked, packed, or shipped qty.
