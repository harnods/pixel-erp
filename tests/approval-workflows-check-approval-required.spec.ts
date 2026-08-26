/**
 * check_approval_required — the interface contract Project Creation, Variation Order, and
 * Milestone Verification flows call before executing their gated action (spec §5).
 *
 * Exercised against the seeded rules in app/data/approvalWorkflows.ts:
 *   - awf-004 Milestone Verification Rule 001 — project.milestone_verification, scoped to
 *     "Some projects" (Menara Sudirman Renovation, Gudang Bekasi Expansion), no amount condition.
 *   - awf-005 Project Creation Rule 001 — project.creation, all projects, contract value > 500jt,
 *     2-approver "All" level (multi-approver Any/All coverage).
 *   - awf-006 Variation Order Rule 001 — project.variation_order, all projects, delta > 25jt.
 */
import { describe, it, expect } from 'vitest'
import { check_approval_required, projects, getProjectById } from '~/data/approvalWorkflows'

const projectId = (name: string) => projects.find((p) => p.name === name)!.id
const IN_SCOPE_PROJECT = projectId('Menara Sudirman Renovation')
const OUT_OF_SCOPE_PROJECT = projectId('ERP Rollout Phase 2')

describe('check_approval_required', () => {
  it('no rule configured / amount below threshold → approval not required', () => {
    const result = check_approval_required('project.variation_order', 10_000_000, null)
    expect(result).toEqual({ approval_required: false, rule_id: null, approval_levels: [], status: 'no_rule' })
  })

  it('amount above threshold → approval required, rule matched', () => {
    const result = check_approval_required('project.variation_order', 30_000_000, null)
    expect(result.approval_required).toBe(true)
    expect(result.rule_id).toBe('awf-006')
    expect(result.status).toBe('pending')
    expect(result.approval_levels).toEqual([
      { level: 1, requires: 'any', approver_ids: expect.arrayContaining([expect.any(String)]) },
    ])
  })

  it('amount exactly at threshold does NOT trigger (must strictly exceed)', () => {
    const result = check_approval_required('project.variation_order', 25_000_000, null)
    expect(result.approval_required).toBe(false)
  })

  it('project creation: contract value above threshold → required, multi-approver "All" level intact', () => {
    const result = check_approval_required('project.creation', 600_000_000, null)
    expect(result.approval_required).toBe(true)
    expect(result.rule_id).toBe('awf-005')
    expect(result.approval_levels).toHaveLength(1)
    expect(result.approval_levels[0]!.requires).toBe('all')
    expect(result.approval_levels[0]!.approver_ids.length).toBe(2)
  })

  it('project creation: contract value below threshold → no rule', () => {
    const result = check_approval_required('project.creation', 100_000_000, null)
    expect(result.approval_required).toBe(false)
    expect(result.status).toBe('no_rule')
  })

  it('project-scoped rule matching project_id → required', () => {
    const result = check_approval_required('project.milestone_verification', null, IN_SCOPE_PROJECT)
    expect(result.approval_required).toBe(true)
    expect(result.rule_id).toBe('awf-004')
  })

  it('project-scoped rule NOT matching project_id → not required', () => {
    const result = check_approval_required('project.milestone_verification', null, OUT_OF_SCOPE_PROJECT)
    expect(result.approval_required).toBe(false)
    expect(result.status).toBe('no_rule')
  })

  it('project-scoped rule with no project_id at all → not required (can\'t match "Some projects" scope)', () => {
    const result = check_approval_required('project.milestone_verification', null, null)
    expect(result.approval_required).toBe(false)
  })

  it('milestone verification evaluates on action_type + project scoping only — amount is ignored even if passed', () => {
    // The rule has no amount condition (minAmount === null for this action), so passing a
    // non-null amount must not affect the result — only action_type + project_id matter.
    const withAmount = check_approval_required('project.milestone_verification', 999_999_999, IN_SCOPE_PROJECT)
    const withoutAmount = check_approval_required('project.milestone_verification', null, IN_SCOPE_PROJECT)
    expect(withAmount).toEqual(withoutAmount)
    expect(withAmount.approval_required).toBe(true)
  })

  it('resolved project ids are real projects (sanity check on test fixtures)', () => {
    expect(getProjectById(IN_SCOPE_PROJECT)?.name).toBe('Menara Sudirman Renovation')
    expect(getProjectById(OUT_OF_SCOPE_PROJECT)?.name).toBe('ERP Rollout Phase 2')
  })
})
