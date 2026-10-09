/**
 * VAL — approval-rule service client (STAND-IN).
 *
 * Grooming 2026-10-09: before a Start / Adjust / Complete / Cancel-close confirmation
 * shows, the FE asks VAL which approval rule applies, and the modal's blue info banner
 * is built from the answer. The prototype has no backend, so this client answers from
 * the local approval workflows (Settings › Approval workflows) after a short delay —
 * the modal gets a real loading state. Swap `request()` for the real endpoint; the
 * types below are the contract the UI relies on.
 */
import { ref } from 'vue'
import { ruleLevelsPreview, type WoTransactionType, type WoRuleLevelPreview } from './woApproval'

export interface ValApprovalRuleQuery {
  /** VAL is modular — one endpoint for every module; Work order is `work-order`. */
  module: 'work-order'
  transactionType: WoTransactionType
  /** the user who will submit the transaction */
  requester: string
}

export interface ValApprovalRule {
  /** false — no active rule gates it: the transaction applies immediately (normal flow) */
  gated: boolean
  ruleId?: string
  ruleName?: string
  levels: WoRuleLevelPreview[]
  /**
   * Every level's only approver is the requester (self-approval off) — BE skips them all,
   * so the transaction is approved automatically on submit.
   */
  autoApproved: boolean
  /** First level someone else must decide — named in the info banner. */
  firstLevel?: WoRuleLevelPreview
}

/** Demo-only: make the next VAL calls fail, to show the modal's error state. */
export const valUnavailable = ref(false)

const LATENCY_MS = 600

async function request(q: ValApprovalRuleQuery): Promise<ValApprovalRule> {
  await new Promise(r => setTimeout(r, LATENCY_MS))
  if (valUnavailable.value) throw new Error('VAL unavailable')
  const preview = ruleLevelsPreview(q.transactionType, q.requester)
  if (!preview) return { gated: false, levels: [], autoApproved: false }
  const firstLevel = preview.levels.find(l => !l.skipped)
  return {
    gated: true,
    ruleId: preview.rule.id,
    ruleName: preview.rule.name,
    levels: preview.levels,
    autoApproved: !firstLevel,
    firstLevel,
  }
}

/** GET approval rule — `null` while loading, `error` set when the call fails. */
export function useValApprovalRule() {
  const rule = ref<ValApprovalRule | null>(null)
  const loading = ref(false)
  const error = ref(false)
  let seq = 0

  async function load(q: ValApprovalRuleQuery): Promise<ValApprovalRule | null> {
    const id = ++seq
    loading.value = true
    error.value = false
    rule.value = null
    try {
      const res = await request(q)
      if (id !== seq) return null // a newer call superseded this one
      rule.value = res
      return res
    } catch {
      if (id === seq) error.value = true
      return null
    } finally {
      if (id === seq) loading.value = false
    }
  }

  function reset() { seq++; rule.value = null; loading.value = false; error.value = false }

  return { rule, loading, error, load, reset }
}
