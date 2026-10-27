/**
 * The batch attribute columns a batch drawer shows for one product (ATINV-9082, spec
 * §5.1): which attributes, their labels, how a stored value reads, and the options for
 * the pick-one attributes. Expiry is left out of `keys` — the drawers give it its own
 * column.
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import {
  batchAttributeDef, expiryPrecision, getBatchAttributeConfig,
  type BatchAttributeKey, type BatchAttributeValues,
} from '~/data/batchAttributes'
import { vendors } from '~/data/vendors'
import { activeGrades, gradeById } from '~/data/grades'
import { formatDateLong } from '~/utils/date'
import { useLocale } from '~/composables/useLocale'

export function useBatchAttributeColumns(sku: Ref<string>): {
  keys: ComputedRef<BatchAttributeKey[]>
  label: (k: BatchAttributeKey) => string
  text: (k: BatchAttributeKey, v: BatchAttributeValues) => string
  options: (k: BatchAttributeKey) => { value: string; label: string }[]
} {
  const { t } = useLocale()

  const keys = computed(() =>
    getBatchAttributeConfig(sku.value).map((a) => a.key).filter((k) => k !== 'expiry_date'),
  )

  // The catalog label is the t() key; Supplier is already labelled "Vendor" there.
  const label = (k: BatchAttributeKey) => t(batchAttributeDef(k).label)

  const gradeText = (name: string, rank: number) => `${name} · ${t('Rank')} ${rank}`

  function text(k: BatchAttributeKey, v: BatchAttributeValues): string {
    const value = v[k]
    if (!value) return '—'
    switch (k) {
      case 'supplier': return vendors.find((x) => x.id === value)?.name ?? value
      case 'grade': {
        const g = gradeById(value)
        return g ? gradeText(g.name, g.rank) : value
      }
      case 'expiry_date':
        if (expiryPrecision(value) === 'month') {
          const [y, m] = value.split('-')
          return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
        }
        return formatDateLong(value)
      default: return formatDateLong(value)
    }
  }

  function options(k: BatchAttributeKey): { value: string; label: string }[] {
    if (k === 'supplier') return vendors.map((v) => ({ value: v.id, label: v.name }))
    if (k === 'grade') return activeGrades().map((g) => ({ value: g.id, label: gradeText(g.name, g.rank) }))
    return []
  }

  return { keys, label, text, options }
}
