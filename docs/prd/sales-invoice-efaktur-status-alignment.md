# PRD-05 alignment delta — e-Faktur status axes (Sales Invoice)

Status: **PRD not yet updated.** The harness (PR #100) now implements the decisions
below; this file is the list of edits PRD-05 needs so the two stop disagreeing.

Source of truth for the tax rules: **PER-11/PJ/2025 Lampiran huruf D**.
Implementation rule: `rule/efaktur-status-axes` in `docs/design/RULES.md`.

---

## 1. There are three axes, not two

PRD-05 (and the build before PR #100) treated the faktur's own status and DJP's
reply as one field. They are separate, and a third axis already existed:

| Axis | Field | UI label (EN / ID) |
|---|---|---|
| Which document is issued | `docKind` (FK/DK) | Document type / Jenis dokumen |
| The faktur's own status | `kind` + `supersededAs` → `taxDocumentStatus()` | Tax document status / Status dokumen pajak |
| What DJP replied | `status` | DJP status / Status DJP |

**PRD edit:** describe all three; stop describing "DJP status" as carrying
Replaced/Cancelled.

---

## 2. Tax document status — values changed

| PRD said | Shipped | Why |
|---|---|---|
| Normal | **Normal** | — |
| Pembetulan | **dropped** | D.5.f: a faktur may be corrected ONLY by issuing a pengganti. "Pembetulan" is the verb for that act (D.5.a) and a state on SPT and Bukti Potong — not on a faktur. |
| Pengganti | **Pengganti** (Replacement) | D.2.b.2: kode status 01.. |
| Dibetulkan | **dropped** | same as Pembetulan. |
| Diganti | **Diganti** (Replaced) | the superseded faktur. |
| Dibatalkan | **Dibatalkan** (Cancelled) | D.6. |
| — | **Pembatalan** (Cancellation) — added | the cancellation document itself, which the build already raises; it is not the same record as the faktur that ends up Dibatalkan. |
| — | **Nota retur** (Return note) — added | already a document kind in the build; it is not a faktur and carries no NSFP of ours. |

**PRD edit:** replace the six-value list with Normal / Pengganti / Pembatalan /
Diganti / Dibatalkan / Nota retur, and record the D.5.f citation next to the
Pembetulan removal so the decision survives the next review.

---

## 3. DJP status — one deliberate divergence left open

Shipped: `—` · Draft · Memproses ke DJP · Disetujui DJP · Ditolak DJP — as the PRD
asked — **plus `Menunggu dari pembeli` (Awaiting from buyer)**.

That value is not a DJP state at all: nothing is submitted for a nota retur, the
buyer issues it. It was left in place because nota retur has no design of its own
yet (agreed out of scope for PR #100).

**PRD edit:** either give nota retur its own axis/surface, or record this as a
known exception with an owner. It should not quietly stay a "DJP status".

---

## 4. A superseded faktur stays Approved

The model change that makes the split work: a faktur that has been replaced or
cancelled **keeps `status: 'approved'`** — DJP approved it and never said
otherwise — and carries `supersededAs`.

So one row legitimately reads **Diganti** and **Disetujui DJP** at the same time.
Grounded in D.2.b.3)b): the NSFP is issued on "persetujuan dari DJP", and nothing
afterwards withdraws that approval.

**PRD edit:** if PRD-05 specifies the status enum or a state machine, it must stop
treating replaced/cancelled as terminal values of the DJP axis.

---

## 5. Behaviour changes that need PRD coverage

| Change | PRD impact |
|---|---|
| "Type" column renamed **Tax document status**; "DJP Status" → "DJP status" | copy / screenshots |
| **Payment stage column removed** from the Tax document tab (field retained for View details + e-faktur print) | table spec |
| **Review tax impact** gains `Save as draft` / `Save & submit to DJP`, mirroring Create tax document | AC-005 / AC-006 |
| A **cancellation submits BOTH** generated documents (the Pembatalan and the fresh Normal faktur). D.6 imposes no ordering between them | new AC |
| A **return note never offers submit** — the buyer issues the nota retur | new AC |
| Tax document status renders as **plain text**, DJP status as a **badge** | design rule, not PRD |

---

## Open questions for the PRD owner

1. Nota retur: own axis, or documented exception on the DJP axis? (see §3)
2. Does `Pembatalan` as a distinct listed value match how Tax/Finance talk about
   it, or do they only ever say `Dibatalkan`?
3. Cancellation submitting both documents — confirm with Tax that no sequencing
   is expected in Coretax before the fresh faktur is uploaded.
