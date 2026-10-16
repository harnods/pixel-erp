# PRD: Add Payment (Sales Invoices)

**Module:** Sales > Sales Invoices  
**Route:** `/sales-invoices/:id/add-payment`  
**Figma:** [Sales - Sales Invoices, node 5918:117930](https://www.figma.com/design/RVB7WIhNaR1SKa12c3msog/Sales---Sales-Invoices?node-id=5918-117930)  
**Status:** Implemented  
**Last updated:** 2026-10-15

---

## Overview

The "Add payment" form allows users to record a cash payment received against one or more open sales invoices for a customer. It is accessed from a Sales Invoice detail page via an action button.

## Page structure

### Header

- **Breadcrumb:** `Sales invoices / Sales Invoice #XXXXX` (both segments are links)
- **Title:** "Add payment" (or "Edit payment" when editing an existing payment)

### Customer info block (read-only)

Displayed as static text, not editable form fields:

| Field    | Source                                  |
|----------|-----------------------------------------|
| Customer | Customer name from the invoice          |
| Email    | Customer email + generated finance email |

### Form fields

**Row 1:**

| Field            | Type        | Notes                                      |
|------------------|-------------|--------------------------------------------|
| Date paid        | Date picker | Defaults to today (sim clock)              |
| Transaction no.  | Read-only   | Auto-generated with settings gear icon     |
| Reference no.    | Text input  | Optional free-text reference               |

**Row 2:**

| Field           | Type     | Notes                                           |
|-----------------|----------|-------------------------------------------------|
| Account *       | Dropdown | Required. Cash/bank accounts (code prefix `1-`) |
| Payment method  | Dropdown | Bank transfer, Virtual account, Cash, Giro      |

### Invoice table

| Column       | Type       | Notes                                |
|--------------|------------|--------------------------------------|
| Number       | Read-only  | e.g. "Sales Invoice #40120"          |
| Due date     | Read-only  | Invoice due date (DD/MM/YYYY)        |
| Balance due  | Read-only  | Remaining balance, right-aligned     |
| Total        | Read-only  | Invoice total, right-aligned         |
| Amount paid  | Input      | "Rp" prefix + numeric input          |

- Shows all open invoices for the same customer
- Counter below table: "Showing X of Y transactions"
- Pre-fills the source invoice's balance in the Amount paid column

### Summary section

**Left column:**

- **Memo** (textarea, 3 rows) with helper text "Only visible to you and your team"
- **Attachment** section with file upload (XLS, DOC, PDF, JPG, PNG, ZIP; max 10 MB per file, 5 files per transaction)

**Right column:**

- **Subtotal** — sum of all Amount paid values
- **Less: Withholding tax** — checkbox to enable. When checked, shows:
  - Withholding tax account dropdown
  - Amount input with "Rp" prefix
  - "Less: Withholding" line in the totals
- **Total** — Subtotal minus withholding amount (bold)

### Footer

- **Cancel** (ghost button) — navigates back to the invoice detail
- **Save** (primary button) — validates and saves the payment

## Validation rules

1. Account is required
2. At least one invoice must have a positive Amount paid
3. Amount paid must not exceed the invoice's balance due
4. If withholding tax is enabled: account is required, amount must be positive
5. Inline error messages shown below the relevant field; no toast for validation errors

## Data model

Payment is saved as a `PaymentReceived` record in `paymentsReceived.ts`. On save:
- Invoice balances are recalculated (`syncInvoiceBalances`)
- Invoice statuses update (paid / partially-paid / open)
- Journal entries are generated (debit cash account, credit AR)

## Navigation

- Entry: Sales Invoice detail page > "Add payment" action
- On save: redirects to `/payments-received/:id` (payment detail page)
- On cancel: returns to the source invoice detail page
