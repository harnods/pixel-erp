import { receivingPOs, type ReceivingTask, type ReceivingPO } from './receivingTasks'
// Re-use the same product catalog and bin list that receipt line items use,
// so product names, SKUs, and images are consistent across PO and WMS views.
import { BINS } from './receiptLineItems'

// Re-export the catalog inline (same data as receiptLineItems CATALOG, avoids
// a circular import if receiptLineItems ever imports from here).
const CATALOG = [
  { id: 'p01', name: 'Green Beans Arabica Gayo Grade 1',      sku: 'GRN-ARB-GYO',  hue: 25,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Premium-Colombia-Oscar-Hernandez-2026.jpg?v=1781072256' },
  { id: 'p02', name: 'Green Beans Robusta Lampung',            sku: 'GRN-ROB-LMP',  hue: 30,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Kenya-Gatomboya-AB-2026.jpg?v=1779850609' },
  { id: 'p03', name: 'Green Beans Arabica Toraja Sapan',       sku: 'GRN-ARB-TRJ',  hue: 20,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Rwanda-Mbilima-Soil-Project-Lot.0704-2026.jpg?v=1779845863' },
  { id: 'p04', name: 'Green Beans Arabica Kintamani',          sku: 'GRN-ARB-KTM',  hue: 35,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_China-Yunnan-Baoshan-2026.jpg?v=1779678647' },
  { id: 'p05', name: 'Green Beans Arabica Java Preanger',      sku: 'GRN-ARB-JVP',  hue: 28,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Honduras-Norman-Castellanos-2026.jpg?v=1778641670' },
  { id: 'p06', name: 'Green Beans Arabica Mandheling',         sku: 'GRN-ARB-MDH',  hue: 22,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_El-Salvador-Emerson-VasquezPacamara-2026.jpg?v=1776071969' },
  { id: 'p07', name: 'Green Beans Arabica Flores Bajawa',      sku: 'GRN-ARB-FLB',  hue: 18,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Fairfield-Medium.jpg?v=1779256203' },
  { id: 'p08', name: 'Green Beans Robusta Temanggung',         sku: 'GRN-ROB-TMG',  hue: 33,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Blend-Haru-Kochi-2026.jpg?v=1774337981' },
  { id: 'p09', name: 'Roasted Beans House Blend Medium',       sku: 'RST-HSE-1K',   hue: 26,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Fairfield-Dark.jpg?v=1779257290' },
  { id: 'p10', name: 'Roasted Beans Espresso Blend Dark',      sku: 'RST-ESP-1K',   hue: 19,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Fairfield-Dark-coldbrew.jpg?v=1779932788' },
  { id: 'p11', name: 'Roasted Beans Single Origin Gayo',       sku: 'RST-GYO-1K',   hue: 31,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Drip-Bag_Indonesia-Frinsa-Estate-Weninggalih.jpg?v=1779252798' },
  { id: 'p12', name: 'Roasted Beans Decaf Swiss Water',        sku: 'RST-DEC-500',  hue: 24,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Drip-Bag_Rwanda-Mbilima-Soil-Project-2026.jpg?v=1779252374' },
  { id: 'p13', name: 'Espresso Machine Dual Boiler 2-Group',   sku: 'MCH-ESP-2GR',  hue: 200, img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/La-Marzocco-Linea-Mini-Espresso-Machine-White-Hero-KO-by-Clive-Coffee.jpg?v=1711570888' },
  { id: 'p14', name: 'Espresso Machine Single Group Compact',  sku: 'MCH-ESP-1GR',  hue: 205, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/BREVILLEBARISTAEXPRESSESPRESSOMACHINEnew.jpg?v=1711169528' },
  { id: 'p15', name: 'Espresso Machine 3-Group Volumetric',    sku: 'MCH-ESP-3GR',  hue: 210, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/DeLonghiDedicaDuoEspressoMachinenew.jpg?v=1773102708' },
  { id: 'p16', name: 'Coffee Grinder On-Demand 64mm',          sku: 'GRD-OD-64',    hue: 215, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/FELLOWODECOFFEEGRINDER-GEN2new.jpg?v=1712094007' },
  { id: 'p17', name: 'Coffee Grinder Conical 83mm',            sku: 'GRD-CN-83',    hue: 220, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/Eureka_Mignon_Specialita_Espresso_Grindernew-1.jpg?v=1754589272' },
  { id: 'p18', name: 'Coffee Grinder Filter Bulk 98mm',        sku: 'GRD-FL-98',    hue: 225, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/BARATZAENCOREESPCOFFEEANDESPRESSOGRINDERnew.jpg?v=1710889626' },
  { id: 'p19', name: 'Batch Brewer 2.5L Thermal',              sku: 'EQP-BRW-25',   hue: 190, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/DeLonghiMagnificaEvoECAM29043SBSuperautomaticEspressoMachinenew.jpg?v=1773103173' },
  { id: 'p20', name: 'Milk Frothing Pitcher 600ml',            sku: 'ACC-PCH-600',  hue: 185, img: 'https://cdn.shopify.com/s/files/1/2425/8607/products/milk-steaming-pitcher_7a0b6d9d-dc2f-410b-83e8-0c0caf6403e5.jpg' },
  { id: 'p21', name: 'Tamper 58mm Flat Base',                  sku: 'ACC-TMP-58',   hue: 240, img: 'https://cdn.shopify.com/s/files/1/2425/8607/products/Lucca-Stainless-Steel-Espresso-Tamper-05.jpg' },
  { id: 'p22', name: 'Bottomless Portafilter 58mm',            sku: 'ACC-PRT-58',   hue: 245, img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/ECM-Bottomless-Portafilter-Clive-Coffee-KO-01.jpg' },
  { id: 'p23', name: 'Coffee Scale 2kg / 0.1g',               sku: 'ACC-SCL-2K',   hue: 250, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/ACAIALUNAR2021SMARTESPRESSOSCALEnew.jpg?v=1711084594' },
  { id: 'p24', name: 'Paper Filter V60 02 (100 pcs)',          sku: 'ACC-FLT-V60',  hue: 50,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/0129_hariometeo_112_2485daae-afa0-42da-b4d9-97fb436ffc99.jpg' },
  { id: 'p25', name: 'Knock Box Drawer Stainless',             sku: 'ACC-KNB-24',   hue: 235, img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/LUCCA-Knock-Box-Small-Black-by-Clive-Coffee.jpg' },
] as const

export interface TaskLineItem {
  productName: string
  skuCode:     string
  image:       string
  colorHue:    number
  binLocation: string
  expectedQty: number
  receivedQty: number
  unit:        string
}

// Per-task received-qty overrides, recorded when a user ends a receiving session.
// Keyed by taskId → { [skuCode]: receivedQty }. Lets the detail table reflect the
// exact quantities entered (instead of the derived front-fill) for the rest of the
// SPA session, so the demo stays consistent across navigation.
const receivedOverrides: Record<string, Record<string, number>> = {}

export function setTaskReceived(taskId: string, received: Record<string, number>): void {
  receivedOverrides[taskId] = { ...received }
}

function strSeed(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

function unitFor(sku: string): string {
  if (sku.startsWith('GRN-')) return 'Sack'
  if (sku.startsWith('RST-')) return 'Bag'
  if (sku.startsWith('ACC-FLT')) return 'Box'
  return 'Unit'
}

/** Distribute received units front-filling (first SKUs are scanned first). */
function distributeReceived(expectedQtys: number[], totalReceived: number): number[] {
  const received = Array(expectedQtys.length).fill(0)
  let rem = totalReceived
  for (let i = 0; i < expectedQtys.length; i++) {
    if (rem <= 0) break
    const take = Math.min(expectedQtys[i], rem)
    received[i] = take
    rem -= take
  }
  return received
}

/**
 * Generate line items for a receiving task using the shared product catalog.
 * Products are selected deterministically from the PO's purchaseNo seed so
 * the same PO always shows the same set of products everywhere in the app.
 */
export function getTaskLineItems(task: ReceivingTask, purchaseNo: string): TaskLineItem[] {
  const seed = strSeed(purchaseNo)
  const count = Math.min(task.skuCount, CATALOG.length)

  // Pick products the same way receiptLineItems does — seed * 3 + i * 7 pattern.
  const used = new Set<number>()
  const picks: (typeof CATALOG)[number][] = []
  for (let i = 0; i < count; i++) {
    let idx = (seed * 3 + i * 7) % CATALOG.length
    while (used.has(idx)) idx = (idx + 1) % CATALOG.length
    used.add(idx)
    picks.push(CATALOG[idx])
  }

  // Distribute expected qty across SKUs with slight variance.
  const weights = picks.map((_, i) => 1 + ((seed * 17 + i * 11) % 7) * 0.3)
  const totalW = weights.reduce((a, b) => a + b, 0)
  const expectedQtys: number[] = []
  let rem = task.purchaseQty
  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      expectedQtys.push(Math.max(1, rem))
    } else {
      const q = Math.max(1, Math.round(task.purchaseQty * weights[i] / totalW))
      expectedQtys.push(q)
      rem -= q
    }
  }

  const receivedQtys = distributeReceived(expectedQtys, task.receivedQty)
  const override = receivedOverrides[task.id]

  return picks.map((p, i) => ({
    productName: p.name,
    skuCode:     p.sku,
    image:       p.img,
    colorHue:    p.hue,
    binLocation: BINS[(seed + i * 5) % BINS.length],
    expectedQty: expectedQtys[i],
    // Exact per-SKU qty if the user has saved a receiving session; else derived.
    receivedQty: override ? (override[p.sku] ?? 0) : receivedQtys[i],
    unit:        unitFor(p.sku),
  }))
}

/** Find a task and its parent PO. Returns null if not found. */
export function findTaskWithPO(taskId: string): { task: ReceivingTask; po: ReceivingPO } | null {
  for (const po of receivingPOs) {
    const task = po.tasks.find(t => t.id === taskId)
    if (task) return { task, po }
  }
  return null
}

/** All tasks across all POs (flat), for the jump switcher. */
export function allTasksFlat(): Array<ReceivingTask & { purchaseNo: string; warehouseName: string }> {
  return receivingPOs.flatMap(po =>
    po.tasks.map(t => ({ ...t, purchaseNo: po.purchaseNo, warehouseName: po.warehouseName })),
  )
}
