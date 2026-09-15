/**
 * useTraceabilityCells — how the Batch Traceability report renders its cells, shared by
 * both searches (By batch in BatchTraceabilityReportPage, By transaction in
 * BatchTraceabilityByTransaction) so an attribute or quantity reads identically in each.
 *
 * Attribute cells follow the PRD's three states: "NA" (not used / no access), blank
 * (used, no value), or the formatted value. Mutations follow the sign rule: in = +,
 * out = −, neutral (Warehouse transfer, Stock count) = the bare quantity.
 */
import type { AttributeCell, MutationDirection, QtyCell } from '~/data/batchTraceability'
import { formatExpiry, expiryEffectiveDate, type BatchAttributeKey } from '~/data/batchAttributes'
import { vendors } from '~/data/vendors'
import { gradeById } from '~/data/grades'
import { formatDate } from '~/utils/date'

/** Attribute columns, in the PRD's order. `column` is the table column key. */
export const TRACE_ATTRIBUTE_COLUMNS: readonly { column: string; key: BatchAttributeKey; label: string }[] = [
  { column: 'expiryDate', key: 'expiry_date', label: 'Expiry date' },
  { column: 'manufacturingDate', key: 'manufacturing_date', label: 'Manufacturing date' },
  { column: 'bestBeforeDate', key: 'best_before_date', label: 'Best before date' },
  { column: 'vendor', key: 'supplier', label: 'Vendor' },
  { column: 'grade', key: 'grade', label: 'Grade' },
]

export function useTraceabilityCells() {
  const { t } = useLocale()
  const qtyFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

  function vendorName(id: string): string { return vendors.find((v) => v.id === id)?.name ?? id }
  function gradeName(id: string): string { return gradeById(id)?.name ?? id }

  /** What a date / name column sorts on — ISO for dates, the display name otherwise. */
  function attributeSortValue(cell: AttributeCell, key: BatchAttributeKey): string {
    if (cell.state !== 'value') return ''
    if (key === 'expiry_date') return expiryEffectiveDate(cell.value)
    if (key === 'supplier') return vendorName(cell.value)
    if (key === 'grade') return gradeName(cell.value)
    return cell.value
  }

  function attributeText(cell: AttributeCell, key: BatchAttributeKey): string {
    if (cell.state === 'na') return t('NA')
    if (cell.state === 'empty') return ''
    switch (key) {
      case 'expiry_date': return formatExpiry(cell.value, 'table')
      case 'manufacturing_date':
      case 'best_before_date': return formatDate(cell.value)
      case 'supplier': return vendorName(cell.value)
      case 'grade': return gradeName(cell.value)
    }
  }

  function qtyText(value: number, unit: string | null): string {
    return `${qtyFormat.format(value)}${unit ? ` ${unit}` : ''}`
  }

  /** A quantity cell: "NA", blank, or the quantity with its unit. */
  function qtyCellText(cell: QtyCell, unit: string | null): string {
    if (cell.state === 'na') return t('NA')
    return cell.state === 'value' ? qtyText(cell.value, unit) : ''
  }

  /** A signed mutation: +qty in, −qty out, the bare qty when neutral. */
  function mutationText(direction: MutationDirection, qty: number, unit: string | null): string {
    const text = qtyText(Math.abs(qty), unit)
    return direction === 'in' ? `+${text}` : direction === 'out' ? `−${text}` : text
  }

  return { vendorName, gradeName, attributeSortValue, attributeText, qtyText, qtyCellText, mutationText }
}
