import { reactive } from "vue";
import { loadSnapshot, saveSnapshot } from "./persist";

/**
 * Internal transfer — moving money between the company's own cash/bank accounts
 * (Cash management › New transaction › Internal transfer). One source account
 * ("Transfer from") pays one or more destination accounts, each with its own
 * amount. Persisted to the mini-DB so saved transfers survive a reload.
 */
export interface InternalTransferLine {
  /** destination cash account id (see data/cashAccounts.ts) */
  accountId: string;
  description: string;
  amount: number;
}
/** Recurring schedule attached to a transfer (Set as recurring). */
export interface RecurringInfo {
  name: string;
  interval: number;
  unit: "day" | "week" | "month" | "year";
  ends: "never" | "after" | "on";
  occurrences?: number;
  endDate?: string;
  startDate: string;
}

export interface InternalTransfer {
  id: string;
  /** sequential document number, shown as "Internal transfer #00001" */
  number: number;
  transferNo: string;
  /** source cash account id ("Transfer from") */
  fromAccountId: string;
  /** ISO date (YYYY-MM-DD) */
  transactionDate: string;
  referenceNo?: string;
  tags: string[];
  lines: InternalTransferLine[];
  total: number;
  memo?: string;
  /** set once "Set as recurring" is saved — drives the Recurring badge */
  recurring?: RecurringInfo;
  createdAt: string;
}

// Seed mock transfers between existing cash/bank accounts (see data/cashAccounts.ts).
// Deterministic — fixed ids/numbers/dates — so account-detail ledgers and the
// transfer list are populated out of the box. Newest first.
function seedInternalTransfers(): InternalTransfer[] {
  const mk = (
    n: number, date: string, from: string,
    to: string, desc: string, amount: number,
    ref?: string, tags: string[] = [], memo?: string,
  ): InternalTransfer => ({
    id: `it-seed-${n}`,
    number: n,
    transferNo: `TRF-2026-${String(n).padStart(4, "0")}`,
    fromAccountId: from,
    transactionDate: date,
    referenceNo: ref,
    tags,
    lines: [{ accountId: to, description: desc, amount }],
    total: amount,
    memo,
    createdAt: `${date}T09:30:00`,
  });
  // Reverse-chronological (newest first) to match addInternalTransfer's unshift order.
  return [
    mk(6, "2026-08-14", "CA003", "CA002", "Petty cash top-up", 5_000_000, "PC-0814", ["petty cash"], "Weekly petty cash replenishment"),
    mk(5, "2026-08-10", "CA010", "CA003", "Consolidate to main operating account", 150_000_000, "TRF-AUG-05", ["treasury"]),
    mk(4, "2026-07-28", "CA-MO", "CA-MSO", "Fund Sales Ops sub-account", 40_000_000, undefined, ["mandiri", "allocation"]),
    mk(3, "2026-07-15", "CA003", "CA004", "FX funding for Singapore supplier", 80_000_000, "FX-0715", ["fx", "import"], "Prefund DBS for USD purchase"),
    mk(2, "2026-06-30", "CA003", "CA001", "Cash drawer replenishment", 10_000_000, undefined, ["retail"]),
    mk(1, "2026-06-12", "CA010", "CA-MH1", "Payroll float to HRBP Ops", 20_000_000, "PAY-0612", ["payroll"]),
  ];
}

const snapshot = loadSnapshot<InternalTransfer>("internal-transfers-v1");
export const internalTransfers = reactive<InternalTransfer[]>(snapshot ?? seedInternalTransfers());
function persist(): void {
  saveSnapshot("internal-transfers-v1", internalTransfers);
}

/** Next auto transfer number, e.g. "TRF-2026-0001" — mirrors nextReceiptNo /
 *  nextDeliveryOrderNo. Deterministic-ish: max existing + 1. */
export function nextInternalTransferNo(): string {
  const used = internalTransfers
    .map((t) => Number(t.transferNo.replace(/\D/g, "").slice(-4)))
    .filter((n) => Number.isFinite(n));
  const seq = Math.max(0, ...used) + 1;
  const year = new Date().getFullYear();
  return `TRF-${year}-${String(seq).padStart(4, "0")}`;
}

export function getInternalTransfer(id: string): InternalTransfer | undefined {
  return internalTransfers.find((t) => t.id === id);
}

export function setInternalTransferRecurring(id: string, info: RecurringInfo): void {
  const tr = internalTransfers.find((t) => t.id === id);
  if (tr) { tr.recurring = info; persist(); }
}

export function deleteInternalTransfer(id: string): void {
  const i = internalTransfers.findIndex((t) => t.id === id);
  if (i >= 0) { internalTransfers.splice(i, 1); persist(); }
}

export function updateInternalTransfer(id: string, opts: {
  fromAccountId: string;
  transactionDate: string;
  referenceNo?: string;
  tags?: string[];
  lines: InternalTransferLine[];
  memo?: string;
}): InternalTransfer | undefined {
  const tr = internalTransfers.find((t) => t.id === id);
  if (!tr) return undefined;
  tr.fromAccountId = opts.fromAccountId;
  tr.transactionDate = opts.transactionDate;
  tr.referenceNo = opts.referenceNo || undefined;
  tr.tags = opts.tags ?? [];
  tr.lines = opts.lines;
  tr.total = opts.lines.reduce((s, l) => s + (l.amount || 0), 0);
  tr.memo = opts.memo || undefined;
  persist();
  return tr;
}

export function addInternalTransfer(opts: {
  fromAccountId: string;
  transactionDate: string;
  referenceNo?: string;
  tags?: string[];
  lines: InternalTransferLine[];
  memo?: string;
}): InternalTransfer {
  const total = opts.lines.reduce((s, l) => s + (l.amount || 0), 0);
  const number = Math.max(0, ...internalTransfers.map((t) => t.number || 0)) + 1;
  const transfer: InternalTransfer = {
    id: `it-new-${internalTransfers.length + 1}-${Math.round(total)}`,
    number,
    transferNo: nextInternalTransferNo(),
    fromAccountId: opts.fromAccountId,
    transactionDate: opts.transactionDate,
    referenceNo: opts.referenceNo || undefined,
    tags: opts.tags ?? [],
    lines: opts.lines,
    total,
    memo: opts.memo || undefined,
    createdAt: new Date().toISOString(),
  };
  internalTransfers.unshift(transfer);
  persist();
  return transfer;
}
