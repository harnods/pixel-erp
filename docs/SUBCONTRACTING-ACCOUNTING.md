# Subcontracting — accounting rules

What the subcon accounting layer does, why, and what is still open.
The rules live in one place: **`app/data/subconAccounting.ts`**, which is pure
(no Vue, no stores) and covered by **`tests/subcon-accounting.spec.ts`**.

This document is written so the PRD can be updated from it.

---

## 1. The shape of it

`buildSubconJournals(input)` takes everything that has happened on a subcon work
order — what was bought, handed over, invoiced, received — and returns the journal
entries that should exist. It posts nothing; the caller decides what to do with them.

The work order detail assembles that input from the app's stores; the tests build
it literally. Both run **the same code**, so the finance fixtures test what the page
actually does.

This is to journals what `buildDocumentPlan` is to documents. The accounting module
reads the document plan and never duplicates it.

### The invariant

**All three supply methods converge on the same finished-goods value.** Basic,
Resupply and Dropship differ in how materials reach the vendor, not in what the
output costs. Every entry balances; a fully received order ends with WIP = 0 and
every clearing account at 0. The tests assert all of it.

---

## 2. Accounts

Journals address accounts by **role**, never by name, and a company maps roles onto
its own chart. Two roles are per-thing: material inventory is held per component,
and each subcon cost line gets its own clearing account.

| Role | Account |
|---|---|
| `materialInventory` | `1-10200 – Raw Material Inventory` |
| `wip` | `1-10201 – WIP Inventory` |
| `finishedGoods` | `1-10202 – Finish Goods Inventory` |
| `vatInput` | `1-40100 – PPN Masukan` |
| `accountsPayable` | `2-10000 – Utang Usaha` |
| `withholdingTaxPayable` | `2-20100 – Utang PPh 23` |
| `subconClearing` | `5-50202 – Beban Vendor` |
| `wasteAccount` | `6-30100 – Kerugian Scrap` |

The first three and `subconClearing` are the product's own chart, taken from the
existing work-order journal screen. The per-thing roles append the component or
cost-line name **within** an entry while keeping the same code, so the journal
summary groups them back into one row per account.

---

## 3. Rules by method

### Resupply — our materials, moved to the vendor

| # | Event | Entry |
|---|---|---|
| 1 | Warehouse transfer to the vendor | **none** — the goods change location, not owner |
| 2 | Materials issued into the vendor's process | `Dr wip / Cr materialInventory`, one credit per component |
| 3 | Vendor invoice | `Dr subconClearing` (per line), `Dr vatInput` / `Cr withholdingTaxPayable`, `Cr accountsPayable` |
| 4 | Purchase delivery | `Dr wip / Cr subconClearing` — capitalisation, at delivery |
| 5 | Goods received | `Dr finishedGoods / Cr wip` |
| 6 | Closed short | `Dr wasteAccount / Cr wip` for whatever is left |

AP = service + VAT − withholding.

Step 2 is posted on **handover**, not on consumption — once materials are in the
vendor's process they are work in progress. In this build that handover is the stock
adjustment posted when the work order starts.

### Dropship — a third party ships to the vendor

Identical, except step 1 becomes a purchase: `Dr materialInventory / Cr accountsPayable`.
The goods land in the vendor's warehouse but are **ours** from that moment, so they
pass through material inventory and out again on handover.

### Basic — the vendor's own materials

| # | Event | Entry |
|---|---|---|
| 1 | Vendor invoice (material **and** service) | `Dr subconClearing`, `Dr vatInput` / `Cr accountsPayable` |
| 2 | Capitalisation | `Dr wip / Cr subconClearing` |
| 3 | Goods received | `Dr finishedGoods / Cr wip` |

**No withholding tax.** Under PMK 141/2015 this is a purchase of goods, not jasa
maklon: the vendor supplies the materials and owns the output until handover.
Withholding applies to Resupply and Dropship only.

---

## 4. Staged handovers and staged receipts

Materials may go over in stages and finished goods may come back in stages, so WIP
is **not** zero between them. After a partial receipt the remaining WIP balance is
the value of materials still being worked on — that is the figure the
"Components at vendor" card and the work order's **Value at vendor** show.

Cost allocation per receipt:

| Driver | Allocation |
|---|---|
| `Unit` | rate × quantity received, rate = amount ÷ planned output |
| `Amount` | pro rata on quantity received |
| `Batch` | **see Open questions** — currently as `Amount` |

**Cost per unit stays constant across receipts.** The final receipt of a fully
delivered order absorbs any rounding drift so the clearing accounts land exactly
on zero.

Withholding is computed **per invoice**: a vendor billing twice produces two
withholding entries, never one rolled-up figure.

---

## 5. Component quantity adjustment

The boundary is the quantity already handed over, and it decides whether a journal
exists at all.

| Change | Result |
|---|---|
| **Increase**, when everything planned is already with the vendor | Needs a **new shipment** (transfer for Resupply, purchase for Dropship). Editing the number alone moves no goods, so it posts nothing on its own. |
| **Decrease** to at-or-above what has been handed over | **No journal entry.** Only the outstanding quantity still to send changes. A correcting entry would invent a movement that never happened. |
| **Decrease below** what has been handed over | **Rejected**, naming the quantity already sent and pointing at material return from the vendor. |
| Any change on **Basic** | Not applicable — the materials are the vendor's. The action is hidden, not shown inert. |

The action stays enabled and explains itself (`rule/btn-no-disabled-validation`);
the consequence is shown as the quantity is typed, before saving.

**A new subcon cost line** may be added while the work order is open. It gets its own
clearing account, flows through the same invoice → capitalisation path, and raises
cost per unit without changing quantity.

---

## 6. Plan vs actual

Planned is what the BOM and cost lines say the run should cost. Actual is what has
really been posted — materials issued, subcon cost capitalised.

**They legitimately diverge.** Reducing a component's planned quantity after part of
it has gone to the vendor changes the plan and posts nothing; the materials already
issued stay in WIP. A variance is information, not an error.

**Not currently shown on the work order.** `subconCostSummary()` and
`subconWipBalance()` compute both, and the tests exercise them, but the panel that
displayed them was removed from the work order detail — the journal and the stock
movements carry the same story through the screen the product already had. Bring the
panel back if a running WIP figure is wanted on the page itself.

---

## 7. Open questions

Raised rather than guessed at. All three are visible in the module's doc comment.

1. **Cost driver `Batch`.** Not covered by the finance simulations. Treated as
   `Amount` — a whole-batch charge spread pro rata across quantity received — on the
   reasoning that a batch fee is incurred for the run as a whole. Charging 100% to
   the first receipt is equally defensible and materially different for staged
   receipts.

2. **Receipts against a partial handover.** The fixtures always complete the handover
   before any goods come back. Where materials are still outstanding, a receipt is
   valued at `materialsActuallyInWip ÷ plannedOutputQty` per unit, so WIP can only
   release what was really put into it — with the consequence that cost per unit
   drifts if goods arrive before materials finish. Finance has not ruled on which
   side should give.

3. **Clearing account naming.** ~~`Expense Subcon - <line>`~~ — **settled**: the
   product's chart already carries `5-50202 Beban Vendor`, which is what this is,
   so the module uses it. It still behaves as a clearing account rather than an
   expense (it nets to zero), which may matter to how it is reported.

---

## 8. Configurable, not hardcoded

`SUBCON_ACCOUNTING_SETTINGS` in the module. Defaults are what the simulations used.

| Setting | Default | Open item |
|---|---|---|
| `vendorWarehouseUsesSeparateWipAccount` | `false` | Separate WIP-at-vendor account, or material inventory separated only by warehouse |
| `basicPassesThroughWip` | `true` | Whether Basic passes through WIP or posts straight to finished goods |
| `shortfallValuation` | `'cost'` | How a short-completion shortfall is valued, and which account receives it |
| `withholdingRate` | `0.02` | PPh 23 |
| `vatRate` | `0.11` | PPN |

---

## 9. Test fixtures

BOM "Kemeja Formal Pria" #10087, 500 pcs, vendor PT Roastery Nusantara Mandiri.
Materials 9,700,000 + subcon 13,100,000 = **22,800,000**, cost per unit **45,600**.

- **Test 1** — full receipt, all three methods. Finished goods 22,800,000 in every
  method; WIP and clearing end at 0; withholding 262,000 on Resupply and Dropship,
  0 on Basic.
- **Test 2** — materials 60/40, receipts of 300 then 200. Receipts worth 13,680,000
  and 9,120,000; cost per unit 45,600 in both; WIP walks
  5,820,000 → 9,700,000 → 17,560,000 → **3,880,000** → 0; two withholding entries
  of 157,200 and 104,800.
- **Test 3** — adjustments. Materials 9,700,000 → 9,825,000, subcon → 13,850,000,
  total → 23,675,000, cost per unit → 47,350. The kancing decrease produces **zero**
  journal entries; a decrease below what was sent is rejected.
