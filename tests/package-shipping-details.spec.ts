// @vitest-environment happy-dom
/**
 * Shipping details per OUTBOUND + PACKAGE.
 *
 * An outbound can leave as several parcels, and a parcel is a shipment: its own
 * courier, its own AWB, its own label. So the courier/tracking asked for at packing
 * is asked PER PACKAGE, and what the label prints is the package's own data.
 *
 * Three rules hold this together, and each is easy to lose:
 *
 *  1. CARRY-DOWN. A package with nothing of its own inherits the parent outbound's
 *     courier/tracking — filling the order in once covers every parcel under it.
 *  2. OVERRIDE. Once a package is given its own details they win over the parent,
 *     for the label and for the delivery created from it.
 *  3. THE PICKING BOARD IS PARENT-ONLY. There is no parcel at picking, so that
 *     print must keep reading the outbound — never a package's override.
 *
 * And the modal only ever asks about what is MISSING: an outbound that already has
 * a courier is never prompted, however many parcels it splits into — every one of
 * them just ships on the parent's details.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('~/utils/shippingLabelPdf', () => ({
  // The flow is what's under test, not jsPDF — capture the label entries instead.
  generateShippingLabelPdf: vi.fn(async (entries: unknown[]) => ({ entries })),
}))
import { usePrintShippingLabel } from '~/composables/usePrintShippingLabel'
import { generateShippingLabelPdf } from '~/utils/shippingLabelPdf'
import {
  setWmsShipping, setWmsPackageShipping, wmsShippingForOrder, wmsShippingForPackage,
  hasOwnPackageShipping, addDeliveryTaskFromPackingTasks, deliveryTasks,
} from '~/data/deliveryTasks'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, startPicking, endPicking } from '~/data/pickingTasks'
import { addPackingTask, startPacking, endPacking, getPackingTask } from '~/data/packingTasks'
import {
  resolveShippingLabelPrint, commitShippingLabelsPrinted, resetPrintedLabels, isLabelPrinted,
} from '~/data/shippingLabels'

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan', SKU = '3004'
const DISALLOW = () => true
let seq = 0

function order(qty = 2): OutgoingOrder {
  seq++
  return addOutgoing({
    salesNo: `Pkg Ship ${seq}`, source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'open', dueDate: '2026-09-20',
    lines: [{ sku: SKU, productName: SKU, desc: '', img: '', unit: 'Unit', qty }],
  })
}

/** One packed parcel for an order — the packing task IS the package. */
function packageFor(o: OutgoingOrder, qty: number) {
  const pick = addPickingTask({
    salesOrderIds: [o.id], salesNos: [o.salesNo],
    warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
  })
  startPicking(pick.id)
  endPicking(pick.id, { [`${o.id}::${SKU}`]: qty })
  const pack = addPackingTask({
    salesOrderId: o.id, salesNo: o.salesNo, pickingTaskId: pick.id, pickingTaskNo: pick.taskNo,
    warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
  })
  startPacking(pack.id)
  endPacking(pack.id, { [`${o.id}::${SKU}`]: qty })
  return getPackingTask(pack.id)!
}

describe('carry-down from the outbound', () => {
  it('a package with no details of its own ships on the parent’s courier', () => {
    const o = order()
    const pkg = packageFor(o, 1)
    setWmsShipping(o.id, { courier: 'JNE REG', trackingNo: 'SD0001111' })

    expect(hasOwnPackageShipping(pkg.id)).toBe(false)
    expect(wmsShippingForPackage(pkg.id, o.id)?.courier).toBe('JNE REG')
    expect(wmsShippingForPackage(pkg.id, o.id)?.trackingNo).toBe('SD0001111')
  })

  it('every package under one outbound starts from the same parent details', () => {
    const o = order(4)
    const a = packageFor(o, 2)
    const b = packageFor(o, 2)
    setWmsShipping(o.id, { courier: 'SiCepat BEST', trackingNo: '' })

    for (const p of [a, b]) expect(wmsShippingForPackage(p.id, o.id)?.courier, p.taskNo).toBe('SiCepat BEST')
  })
})

describe('per-package override', () => {
  it('saves against the package and leaves the parent — and the other package — alone', () => {
    const o = order(4)
    const a = packageFor(o, 2)
    const b = packageFor(o, 2)
    setWmsShipping(o.id, { courier: 'JNE REG', trackingNo: '' })

    setWmsPackageShipping(a.id, { courier: 'AnterAja REG', trackingNo: 'SD0002222' })

    expect(hasOwnPackageShipping(a.id)).toBe(true)
    expect(wmsShippingForPackage(a.id, o.id)).toEqual({ courier: 'AnterAja REG', trackingNo: 'SD0002222' })
    // The sibling still inherits, and the outbound itself is untouched.
    expect(wmsShippingForPackage(b.id, o.id)?.courier).toBe('JNE REG')
    expect(wmsShippingForOrder(o.id)?.courier).toBe('JNE REG')
  })

  it('the delivery created from that package ships under the package’s courier', () => {
    const o = order()
    const pkg = packageFor(o, 2)
    setWmsShipping(o.id, { courier: 'JNE REG', trackingNo: 'SD0003333' })
    setWmsPackageShipping(pkg.id, { courier: 'Ninja Xpress', trackingNo: 'SD0004444' })

    const del = addDeliveryTaskFromPackingTasks([pkg], { assignee: 'Op' })
    expect(del.courier).toBe('Ninja Xpress')
    expect(del.trackingNo).toBe('SD0004444')
    expect(deliveryTasks.find(t => t.id === del.id)!.courier).toBe('Ninja Xpress')
  })
})

describe('duplicate control follows the parcel (D9)', () => {
  beforeEach(() => { resetPrintedLabels() })

  it('printing parcel 2 after parcel 1 is a first print, not a reprint', () => {
    const o = order(4)
    const a = packageFor(o, 2)
    const b = packageFor(o, 2)

    // Parcel A prints.
    const first = resolveShippingLabelPrint([o], DISALLOW, () => [a.taskNo])
    expect(first[0]!.status).toBe('ok')
    commitShippingLabelsPrinted(first)

    // Parcel B is a different sticker — still printable…
    const second = resolveShippingLabelPrint([o], DISALLOW, () => [b.taskNo])
    expect(second[0]!.status).toBe('ok')
    commitShippingLabelsPrinted(second)

    // …but re-printing parcel A is caught.
    expect(resolveShippingLabelPrint([o], DISALLOW, () => [a.taskNo])[0]!.status).toBe('duplicate')
  })

  it('a job mixing a printed and an unprinted parcel prints only the unprinted one', () => {
    const o = order(4)
    const a = packageFor(o, 2)
    const b = packageFor(o, 2)
    commitShippingLabelsPrinted(resolveShippingLabelPrint([o], DISALLOW, () => [a.taskNo]))

    const res = resolveShippingLabelPrint([o], DISALLOW, () => [a.taskNo, b.taskNo])
    expect(res[0]!.status).toBe('ok')
    expect(res[0]!.packageNos).toEqual([b.taskNo]) // A is dropped, not blocking
  })

  it('the picking board keeps the order-level key — no package in sight', () => {
    const o = order()
    const pkg = packageFor(o, 2)
    // Packing printed the parcel…
    commitShippingLabelsPrinted(resolveShippingLabelPrint([o], DISALLOW, () => [pkg.taskNo]))
    // …which must not read as "the order's label was printed" at picking, and vice
    // versa: the two are different stickers with different tracking numbers.
    const code = `SL-${o.number}`
    expect(isLabelPrinted(code, pkg.taskNo)).toBe(true)
    expect(isLabelPrinted(code)).toBe(false)
    expect(resolveShippingLabelPrint([o], DISALLOW)[0]!.status).toBe('ok')
  })
})

describe('the modal only asks for what is missing', () => {
  /** The label entries handed to the PDF by the last print. */
  function lastLabels(): { packageNo?: string; courier?: string; trackingNo?: string }[] {
    const calls = (generateShippingLabelPdf as unknown as { mock: { calls: unknown[][] } }).mock.calls
    return (calls.at(-1)?.[0] ?? []) as { packageNo?: string; courier?: string; trackingNo?: string }[]
  }
  const refs = (o: OutgoingOrder, tasks: { id: string; taskNo: string }[]) =>
    tasks.map(t => ({ id: t.id, no: t.taskNo, orderId: o.id }))

  it('an outbound that already has a courier is never prompted — every parcel uses the parent', async () => {
    const o = order(4)
    const a = packageFor(o, 2)
    const b = packageFor(o, 2)
    setWmsShipping(o.id, { courier: 'JNE REG', trackingNo: 'SD0009999' })

    const flow = usePrintShippingLabel()
    await flow.printShippingLabels([o], { requireCourier: true, packages: refs(o, [a, b]) })

    expect(flow.courierModalOpen.value, 'nothing to ask').toBe(false)
    expect(flow.courierModalRows.value).toHaveLength(0)
    // Two parcels, two labels, both on the outbound's own courier and AWB.
    const labels = lastLabels()
    expect(labels.map(l => l.packageNo)).toEqual([a.taskNo, b.taskNo])
    for (const l of labels) {
      expect(l.courier).toBe('JNE REG')
      expect(l.trackingNo).toBe('SD0009999')
    }
  })

  it('an outbound with no courier is asked once per parcel', async () => {
    const o = order(4)
    const a = packageFor(o, 2)
    const b = packageFor(o, 2)

    const flow = usePrintShippingLabel()
    await flow.printShippingLabels([o], { requireCourier: true, packages: refs(o, [a, b]) })

    expect(flow.courierModalOpen.value).toBe(true)
    expect(flow.courierModalRows.value.map(r => r.packageNo)).toEqual([a.taskNo, b.taskNo])
    expect(flow.courierModalRows.value.every(r => r.orderNumber === o.number)).toBe(true)
  })

  it('what the operator types per parcel is what that parcel’s label prints', async () => {
    const o = order(4)
    const a = packageFor(o, 2)
    const b = packageFor(o, 2)

    const flow = usePrintShippingLabel()
    await flow.printShippingLabels([o], { requireCourier: true, packages: refs(o, [a, b]) })
    const [rowA, rowB] = flow.courierModalRows.value

    await flow.saveShippingDetailsAndPrint({
      [rowA!.key]: { courier: 'SiCepat BEST', trackingNo: 'SD0005555' },
      [rowB!.key]: { courier: 'AnterAja REG', trackingNo: 'SD0006666' },
    })

    const byPkg = new Map(lastLabels().map(l => [l.packageNo, l]))
    expect(byPkg.get(a.taskNo)).toMatchObject({ courier: 'SiCepat BEST', trackingNo: 'SD0005555' })
    expect(byPkg.get(b.taskNo)).toMatchObject({ courier: 'AnterAja REG', trackingNo: 'SD0006666' })
    // Stored against the packages, not the outbound.
    expect(wmsShippingForPackage(a.id, o.id)?.courier).toBe('SiCepat BEST')
    expect(wmsShippingForPackage(b.id, o.id)?.courier).toBe('AnterAja REG')
  })

  it('the picking board prints the parent, with no parcel on the label', async () => {
    const o = order(4)
    packageFor(o, 2)
    setWmsShipping(o.id, { courier: 'JNE REG', trackingNo: 'SD0007777' })

    const flow = usePrintShippingLabel()
    await flow.printShippingLabels([o]) // no packages, no requireCourier — the picking call

    const labels = lastLabels()
    expect(labels).toHaveLength(1)
    expect(labels[0]!.packageNo).toBeUndefined()
    expect(labels[0]!.trackingNo).toBe('SD0007777')
  })
})
