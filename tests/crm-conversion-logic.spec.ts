/**
 * CRM conversion / validation logic — comprehensive test suite.
 *
 * Covers: evalEntry (property vs field validation, type compatibility),
 * configState, readinessCounts, compatibleCrmTypes, erpTargetFields,
 * eligibleModules, service-deals empty state, and PROPERTY_TYPE_TO_CRM mapping.
 */
import { describe, it, expect } from 'vitest'
import {
  evalEntry, configState, readinessCounts, compatibleCrmTypes, erpTargetFields,
  eligibleModules, isConfigReady, ensureConversionConfig,
  type MappingEntry, type ErpTargetField, type EntryEval, type ConversionConfig,
} from '~/data/crmConversion'
import {
  crmModules, getCrmModule, moduleStores, serviceDeals,
  DEFAULT_PROPERTIES, DEFAULT_PROPERTY_IDS, defaultDealProperties,
  type CrmModule, type CrmModuleField, type DealProperty, type DealPropertyType,
} from '~/data/crm'

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeMod(overrides: Partial<CrmModule> = {}): CrmModule {
  return {
    id: 'test-mod', name: 'Test', system: false, accessLevel: 'company',
    status: 'published', sections: [], fields: [], views: [],
    conversionTarget: 'sales-order', recordCount: 0, ...overrides,
  } as CrmModule
}

function makeField(overrides: Partial<ErpTargetField> = {}): ErpTargetField {
  return {
    key: 'test', label: 'Test field', requirement: 'required',
    category: 'text', purpose: 'test', ...overrides,
  }
}

function makeEntry(overrides: Partial<MappingEntry> = {}): MappingEntry {
  return { targetKey: 'test', strategy: 'unmapped', ...overrides }
}

function makeProperty(id: string, type: DealPropertyType): DealProperty {
  return { id, name: id, variableName: id, type, system: true, fillRate: 0 }
}

// ── evalEntry — unmapped strategies ──────────────────────────────────────────
describe('evalEntry — unmapped strategy', () => {
  const mod = makeMod()

  it('returns "missing" for required unmapped fields', () => {
    const entry = makeEntry({ strategy: 'unmapped' })
    const field = makeField({ requirement: 'required' })
    const result = evalEntry(entry, field, mod, [])
    expect(result.status).toBe('missing')
    expect(result.message).toContain('required')
  })

  it('returns "unmapped-optional" for optional unmapped fields', () => {
    const entry = makeEntry({ strategy: 'unmapped' })
    const field = makeField({ requirement: 'optional' })
    const result = evalEntry(entry, field, mod, [])
    expect(result.status).toBe('unmapped-optional')
  })

  it('returns "unmapped-optional" for conditional unmapped fields', () => {
    const entry = makeEntry({ strategy: 'unmapped' })
    const field = makeField({ requirement: 'conditional' })
    const result = evalEntry(entry, field, mod, [])
    expect(result.status).toBe('unmapped-optional')
  })
})

// ── evalEntry — crm-field strategy with properties ──────────────────────────
describe('evalEntry — crm-field validates against properties', () => {
  const mod = makeMod()

  it('finds a property by sourceFieldId and returns compatible', () => {
    const props = [makeProperty('transaction-date', 'Date picker')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'transaction-date' })
    const field = makeField({ category: 'date' })
    expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
  })

  it('returns incompatible when property type does not match field category', () => {
    const props = [makeProperty('deal-name', 'Single-line text')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'deal-name' })
    const field = makeField({ category: 'date' })
    const result = evalEntry(entry, field, mod, props)
    expect(result.status).toBe('incompatible')
    expect(result.message).toContain('not compatible')
  })

  it('returns "incompatible" with message when sourceFieldId does not exist', () => {
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'nonexistent-field' })
    const field = makeField({ category: 'text' })
    const result = evalEntry(entry, field, mod, [])
    expect(result.status).toBe('incompatible')
    expect(result.message).toContain('no longer exists')
  })

  it('falls back to mod.fields when property is not found', () => {
    const modWithFields = makeMod({
      fields: [{ id: 'legacy-field', label: 'Legacy', type: 'text', required: false, system: false }],
    })
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'legacy-field' })
    const field = makeField({ category: 'text' })
    expect(evalEntry(entry, field, modWithFields, []).status).toBe('compatible')
  })

  it('checks type compatibility even for mod.fields fallback', () => {
    const modWithFields = makeMod({
      fields: [{ id: 'legacy-num', label: 'Number', type: 'number', required: false, system: false }],
    })
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'legacy-num' })
    const field = makeField({ category: 'date' })
    const result = evalEntry(entry, field, modWithFields, [])
    expect(result.status).toBe('incompatible')
  })
})

// ── evalEntry — non-crm-field strategies ────────────────────────────────────
describe('evalEntry — system/fixed/erp-default strategies', () => {
  const mod = makeMod()

  it('returns compatible for "system" strategy', () => {
    const entry = makeEntry({ strategy: 'system', systemValue: 'today' })
    const field = makeField({ category: 'date' })
    expect(evalEntry(entry, field, mod, []).status).toBe('compatible')
  })

  it('returns compatible for "fixed" strategy', () => {
    const entry = makeEntry({ strategy: 'fixed', fixedValue: 'IDR' })
    const field = makeField({ category: 'currency-code' })
    expect(evalEntry(entry, field, mod, []).status).toBe('compatible')
  })

  it('returns compatible for "erp-default" strategy', () => {
    const entry = makeEntry({ strategy: 'erp-default' })
    const field = makeField({ category: 'erp-option' })
    expect(evalEntry(entry, field, mod, []).status).toBe('compatible')
  })
})

// ── PROPERTY_TYPE_TO_CRM mapping coverage ────────────────────────────────────
describe('PROPERTY_TYPE_TO_CRM — type mapping validation', () => {
  const mod = makeMod()

  const textTypes: DealPropertyType[] = ['Single-line text', 'Multi-line text', 'URL', 'Email', 'Phone number']
  for (const t of textTypes) {
    it(`${t} maps to text → compatible with "text" category`, () => {
      const props = [makeProperty('p', t)]
      const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
      const field = makeField({ category: 'text' })
      expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
    })
  }

  const numberTypes: DealPropertyType[] = ['Number', 'Calculation', 'Rollup']
  for (const t of numberTypes) {
    it(`${t} maps to number → compatible with "decimal" category`, () => {
      const props = [makeProperty('p', t)]
      const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
      const field = makeField({ category: 'decimal' })
      expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
    })
  }

  const dateTypes: DealPropertyType[] = ['Date picker', 'Date and time picker']
  for (const t of dateTypes) {
    it(`${t} maps to date → compatible with "date" category`, () => {
      const props = [makeProperty('p', t)]
      const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
      const field = makeField({ category: 'date' })
      expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
    })
  }

  it('Dropdown select maps to pick-list → compatible with "currency-code"', () => {
    const props = [makeProperty('p', 'Dropdown select')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
    const field = makeField({ category: 'currency-code' })
    expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
  })

  it('Company maps to customer → compatible with "customer" category', () => {
    const props = [makeProperty('p', 'Company')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
    const field = makeField({ category: 'customer' })
    expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
  })

  it('Contact maps to customer → compatible with "customer" category', () => {
    const props = [makeProperty('p', 'Contact')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
    const field = makeField({ category: 'customer' })
    expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
  })

  it('Product list maps to product-list → compatible with "product-lines"', () => {
    const props = [makeProperty('p', 'Product list')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
    const field = makeField({ category: 'product-lines' })
    expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
  })

  it('Related list maps to null → skips type check, treated as compatible', () => {
    const props = [makeProperty('p', 'Related list')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
    const field = makeField({ category: 'text' })
    expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
  })

  it('File maps to null → skips type check, treated as compatible', () => {
    const props = [makeProperty('p', 'File')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
    const field = makeField({ category: 'text' })
    expect(evalEntry(entry, field, mod, props).status).toBe('compatible')
  })

  it('Number type is incompatible with "date" category', () => {
    const props = [makeProperty('p', 'Number')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
    const field = makeField({ category: 'date' })
    expect(evalEntry(entry, field, mod, props).status).toBe('incompatible')
  })

  it('Date picker is incompatible with "money" category', () => {
    const props = [makeProperty('p', 'Date picker')]
    const entry = makeEntry({ strategy: 'crm-field', sourceFieldId: 'p' })
    const field = makeField({ category: 'money' })
    expect(evalEntry(entry, field, mod, props).status).toBe('incompatible')
  })
})

// ── compatibleCrmTypes ──────────────────────────────────────────────────────
describe('compatibleCrmTypes', () => {
  it('customer category accepts only customer type', () => {
    expect(compatibleCrmTypes('customer')).toEqual(['customer'])
  })

  it('product-lines category accepts only product-list type', () => {
    expect(compatibleCrmTypes('product-lines')).toEqual(['product-list'])
  })

  it('date category accepts only date type', () => {
    expect(compatibleCrmTypes('date')).toEqual(['date'])
  })

  it('text category accepts text, pick-list, radio', () => {
    expect(compatibleCrmTypes('text')).toEqual(['text', 'pick-list', 'radio'])
  })

  it('currency-code category accepts pick-list, radio, text', () => {
    expect(compatibleCrmTypes('currency-code')).toEqual(['pick-list', 'radio', 'text'])
  })

  it('money category accepts currency and number', () => {
    expect(compatibleCrmTypes('money')).toEqual(['currency', 'number'])
  })

  it('boolean category is empty (fixed only in V1)', () => {
    expect(compatibleCrmTypes('boolean')).toEqual([])
  })
})

// ── erpTargetFields ─────────────────────────────────────────────────────────
describe('erpTargetFields', () => {
  it('sales-order returns COMMON_ERP_FIELDS without expiryDate', () => {
    const fields = erpTargetFields('sales-order')
    expect(fields.find((f) => f.key === 'expiryDate')).toBeUndefined()
    expect(fields.find((f) => f.key === 'customer')).toBeDefined()
    expect(fields.find((f) => f.key === 'productLines')).toBeDefined()
  })

  it('sales-quote includes expiryDate after dueDate', () => {
    const fields = erpTargetFields('sales-quote')
    const expiryIdx = fields.findIndex((f) => f.key === 'expiryDate')
    const dueDateIdx = fields.findIndex((f) => f.key === 'dueDate')
    expect(expiryIdx).toBeGreaterThan(-1)
    expect(expiryIdx).toBe(dueDateIdx + 1)
  })

  it('sales-quote has one more field than sales-order', () => {
    expect(erpTargetFields('sales-quote').length).toBe(erpTargetFields('sales-order').length + 1)
  })

  it('required fields include customer, txDate, dueDate, productLines, currency', () => {
    const required = erpTargetFields('sales-order').filter((f) => f.requirement === 'required')
    const keys = required.map((f) => f.key)
    expect(keys).toContain('customer')
    expect(keys).toContain('txDate')
    expect(keys).toContain('dueDate')
    expect(keys).toContain('productLines')
    expect(keys).toContain('currency')
  })
})

// ── DEFAULT_PROPERTIES ──────────────────────────────────────────────────────
describe('DEFAULT_PROPERTIES completeness', () => {
  it('includes deal-value property', () => {
    const dv = DEFAULT_PROPERTIES.find((p) => p.id === 'deal-value')
    expect(dv).toBeDefined()
    expect(dv!.fieldType).toBe('number')
  })

  it('every DEFAULT_PROPERTIES id is in DEFAULT_PROPERTY_IDS set', () => {
    for (const p of DEFAULT_PROPERTIES) {
      expect(DEFAULT_PROPERTY_IDS.has(p.id), `missing ${p.id}`).toBe(true)
    }
  })

  it('defaultDealProperties returns visible properties only (excludes hidden)', () => {
    const dp = defaultDealProperties()
    const visibleCount = DEFAULT_PROPERTIES.filter((p) => !p.hidden).length
    expect(dp.length).toBe(visibleCount)
  })

  it('every property in defaultDealProperties has a valid DealPropertyType', () => {
    const dp = defaultDealProperties()
    for (const p of dp) {
      expect(p.type, `property ${p.id} has undefined type`).toBeDefined()
    }
  })
})

// ── Service deals seed — draft module must be empty ─────────────────────────
describe('Service deals — draft module empty state', () => {
  it('service deals seed is empty', () => {
    expect(serviceDeals.length).toBe(0)
  })

  it('services module has recordCount 0', () => {
    const svc = getCrmModule('services')
    expect(svc).toBeDefined()
    expect(svc!.recordCount).toBe(0)
  })

  it('services module is in draft status', () => {
    const svc = getCrmModule('services')
    expect(svc).toBeDefined()
    expect(svc!.status).toBe('draft')
  })
})

// ── eligibleModules — only published modules ────────────────────────────────
describe('eligibleModules — only published', () => {
  it('does not include draft modules', () => {
    const ids = eligibleModules.value.map((m) => m.id)
    for (const m of crmModules) {
      if (m.status === 'draft') {
        expect(ids, `draft module ${m.id} should not be eligible`).not.toContain(m.id)
      }
    }
  })

  it('includes all published modules', () => {
    const ids = eligibleModules.value.map((m) => m.id)
    for (const m of crmModules) {
      if (m.status === 'published') {
        expect(ids, `published module ${m.id} should be eligible`).toContain(m.id)
      }
    }
  })
})

// ── CRM modules structural integrity ────────────────────────────────────────
describe('CRM modules structure', () => {
  it('Deals module exists, is system and published', () => {
    const deals = getCrmModule('deals')
    expect(deals).toBeDefined()
    expect(deals!.system).toBe(true)
    expect(deals!.status).toBe('published')
  })

  it('every module has a unique id', () => {
    const ids = crmModules.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every module status is either published or draft', () => {
    for (const m of crmModules) {
      expect(['published', 'draft']).toContain(m.status)
    }
  })

  it('moduleStores returns properties for deals', () => {
    const stores = moduleStores('deals')
    expect(stores.properties).toBeDefined()
    expect(stores.properties.length).toBeGreaterThan(0)
  })

  it('moduleStores returns properties for services', () => {
    const stores = moduleStores('services')
    expect(stores.properties).toBeDefined()
    expect(stores.properties.length).toBeGreaterThan(0)
  })
})

// ── Cross-validation: properties used in mappings must exist ────────────────
describe('Cross-validation — mapping sourceFieldIds resolve', () => {
  it('all mapping entries with crm-field strategy reference existing properties or fields', () => {
    for (const mod of crmModules) {
      if (mod.status !== 'published') continue
      const cfg = ensureConversionConfig(mod.id)
      if (!cfg.mappings.length) continue
      const props = moduleStores(mod.id).properties
      const propIds = new Set(props.map((p) => p.id))
      const fieldIds = new Set(mod.fields.map((f) => f.id))

      for (const m of cfg.mappings) {
        if (m.strategy === 'crm-field' && m.sourceFieldId) {
          const exists = propIds.has(m.sourceFieldId) || fieldIds.has(m.sourceFieldId)
          expect(exists, `${mod.id}: sourceFieldId "${m.sourceFieldId}" not found in properties or fields`).toBe(true)
        }
      }
    }
  })
})
