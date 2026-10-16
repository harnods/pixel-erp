/**
 * Settings › Users & roles — authority-matrix invariants.
 *
 * The custom-role matrix is the only place in the app where a permission set is
 * authored, so its shape has to hold: unique row keys, a Project Accounting
 * feature that appears only for tenants with the billing component, and grant
 * bookkeeping (feature count / row keys) that stays consistent with the data.
 */
import { describe, expect, it } from 'vitest'
import {
  AUTHORITY_ACTIONS, AUTHORITY_FEATURES, SYSTEM_ROLES, accountUsers,
  authorityActionsFor, authorityRowKeys, customRoles,
  getCustomRole, getSystemRole, systemRolesFor, userRoleNames, userRoleTypes,
} from '~/data/usersRoles'

describe('authority feature catalogue', () => {
  it('has unique feature ids and unique row keys across the whole matrix', () => {
    const ids = AUTHORITY_FEATURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)

    const rowKeys = AUTHORITY_FEATURES.flatMap(authorityRowKeys)
    expect(new Set(rowKeys).size).toBe(rowKeys.length)
  })

  it('gives report-style features a view-only action set', () => {
    const catalogue = AUTHORITY_ACTIONS.map((a) => a.value)
    for (const feature of AUTHORITY_FEATURES) {
      const actions = authorityActionsFor(feature)
      if (feature.actions) {
        // An explicit per-feature list wins over both defaults — the CRM
        // module-access row is view ("has access") + edit ("is Administrator"),
        // because create/delete have no meaning there.
        expect(actions).toEqual(feature.actions)
        expect(actions.every((a) => catalogue.includes(a))).toBe(true)
      } else if (feature.viewOnly) {
        expect(actions).toEqual(['view'])
      } else {
        expect(actions).toEqual(catalogue)
      }
    }
  })
})

// The feature-level Project Accounting gate (authorityFeaturesFor + a
// `project-accounting` feature carrying five subfeatures) was removed in
// b0686289, which replaced AUTHORITY_FEATURES wholesale with the real 3-level
// Figma hierarchy — that matrix has no project-accounting row and the helper
// went with it. Its four tests were left behind asserting a model that no
// longer exists.
//
// The gate that DID survive is role-level: Project Manager carries
// requiresProjectAccounting and systemRolesFor() filters on it. That is covered
// by "is offered only when the tenant has the Project Accounting component"
// below, so nothing is lost here.

describe('Project Manager is a predefined (existing) role', () => {
  const pm = getSystemRole('project-manager')

  it('lives in the existing-role catalogue, not in custom roles', () => {
    expect(pm).toBeDefined()
    expect(pm!.name).toBe('Project Manager')
    expect(customRoles.some((r) => r.name === 'Project Manager')).toBe(false)
  })

  it('describes what it can do and can be access-limited and time-limited', () => {
    expect(pm!.permissions.length).toBeGreaterThan(0)
    for (const line of pm!.permissions) expect(line).toMatch(/\.$/) // sentence case, full stop
    expect(pm!.accessLimitation).toBeTruthy()
    expect(pm!.supportsTimeLimit).toBe(true)
  })

  it('is offered only when the tenant has the Project Accounting component', () => {
    expect(systemRolesFor(true).map((r) => r.id)).toContain('project-manager')
    expect(systemRolesFor(false).map((r) => r.id)).not.toContain('project-manager')
    expect(systemRolesFor(false).length).toBe(SYSTEM_ROLES.length - 1)
  })

  it('reads as an Existing role — not Custom — on a user who holds it', () => {
    const holder = accountUsers.find((u) => u.systemRoleIds.includes('project-manager'))
    expect(holder, 'no seeded user carries the role, so the list never shows it').toBeDefined()
    expect(userRoleNames(holder!)).toContain('Project Manager')
    expect(userRoleTypes(holder!)).toContain('existing')
    expect(userRoleTypes(holder!)).not.toContain('custom')
  })
})

describe('role catalogues', () => {
  it('has unique system-role ids that all resolve', () => {
    const ids = SYSTEM_ROLES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(getSystemRole(id)).toBeDefined()
  })

  it('never leaves a user pointing at a role that no longer exists', () => {
    for (const user of accountUsers) {
      for (const id of user.systemRoleIds) {
        expect(getSystemRole(id), `${user.name} → unknown system role "${id}"`).toBeDefined()
      }
      for (const id of user.customRoleIds) {
        expect(getCustomRole(id), `${user.name} → unknown custom role "${id}"`).toBeDefined()
      }
    }
  })
})

describe('seeded custom roles', () => {
  it('only grants row keys the matrix actually renders', () => {
    const known = new Set(AUTHORITY_FEATURES.flatMap(authorityRowKeys))
    for (const role of customRoles) {
      for (const key of Object.keys(role.grants)) {
        expect(known, `${role.name} grants unknown row "${key}"`).toContain(key)
      }
    }
  })

  it('never grants an action a feature cannot hold (e.g. delete on a report)', () => {
    for (const role of customRoles) {
      for (const [key, actions] of Object.entries(role.grants)) {
        const featureId = key.includes('.') ? key.split('.')[0]! : key
        const feature = AUTHORITY_FEATURES.find((f) => f.id === featureId)!
        const allowed = authorityActionsFor(feature)
        for (const action of actions) {
          expect(allowed, `${role.name} → ${key} cannot hold "${action}"`).toContain(action)
        }
      }
    }
  })

  it('keeps role ids unique so a new role never overwrites a seeded one', () => {
    const ids = customRoles.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(getCustomRole(id)).toBeDefined()
  })
})
