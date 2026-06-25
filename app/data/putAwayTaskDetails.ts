import { putAwayTasks, type PutAwayTask } from './putAwayTasks'
import { BINS } from './receiptLineItems'

const CATALOG = [
  { id: 'p01', name: 'Green Beans Arabica Gayo Grade 1',      sku: 'GRN-ARB-GYO',  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Premium-Colombia-Oscar-Hernandez-2026.jpg?v=1781072256',  unit: 'kg' },
  { id: 'p02', name: 'Green Beans Robusta Lampung',            sku: 'GRN-ROB-LMP',  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Kenya-Gatomboya-AB-2026.jpg?v=1779850609',          unit: 'kg' },
  { id: 'p03', name: 'Green Beans Arabica Toraja Sapan',       sku: 'GRN-ARB-TRJ',  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Rwanda-Mbilima-Soil-Project-Lot.0704-2026.jpg?v=1779845863', unit: 'kg' },
  { id: 'p04', name: 'Green Beans Arabica Kintamani',          sku: 'GRN-ARB-KTM',  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_China-Yunnan-Baoshan-2026.jpg?v=1779678647',          unit: 'kg' },
  { id: 'p05', name: 'Green Beans Arabica Java Preanger',      sku: 'GRN-ARB-JVP',  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Honduras-Norman-Castellanos-2026.jpg?v=1778641670',  unit: 'kg' },
  { id: 'p06', name: 'Roasted Beans House Blend Medium',       sku: 'RST-HSE-1K',   img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Fairfield-Medium.jpg?v=1779256203',                  unit: 'kg' },
  { id: 'p07', name: 'Roasted Beans Espresso Blend Dark',      sku: 'RST-ESP-1K',   img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Fairfield-Dark-coldbrew.jpg?v=1779932788',                   unit: 'kg' },
  { id: 'p08', name: 'Espresso Machine Dual Boiler 2-Group',   sku: 'MCH-ESP-2GR',  img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/La-Marzocco-Linea-Mini-Espresso-Machine-White-Hero-KO-by-Clive-Coffee.jpg?v=1711570888', unit: 'pcs' },
  { id: 'p09', name: 'Coffee Grinder On-Demand 64mm',          sku: 'GRD-OD-64',    img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/FELLOWODECOFFEEGRINDER-GEN2new.jpg?v=1712094007',                   unit: 'pcs' },
  { id: 'p10', name: 'Milk Frothing Pitcher 600ml',            sku: 'ACC-PCH-600',  img: 'https://cdn.shopify.com/s/files/1/2425/8607/products/milk-steaming-pitcher_7a0b6d9d-dc2f-410b-83e8-0c0caf6403e5.jpg',     unit: 'pcs' },
  { id: 'p11', name: 'Tamper 58mm Flat Base',                  sku: 'ACC-TMP-58',   img: 'https://cdn.shopify.com/s/files/1/2425/8607/products/Lucca-Stainless-Steel-Espresso-Tamper-05.jpg',                       unit: 'pcs' },
  { id: 'p12', name: 'Coffee Scale 2kg / 0.1g',                sku: 'ACC-SCL-2K',   img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/ACAIALUNAR2021SMARTESPRESSOSCALEnew.jpg?v=1711084594',              unit: 'pcs' },
] as const

export interface PutAwayLineItem {
  productName: string
  skuCode: string
  image: string
  qty: number
  stored: number
  binLocation: string
  unit: string
  receivingTaskNo: string
}

function strSeed(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

export function getPutAwayLineItems(taskId: string): PutAwayLineItem[] {
  const task = putAwayTasks.find(t => t.id === taskId)
  if (!task) return []

  const seed = strSeed(taskId)
  const count = Math.min(3 + (seed % 4), CATALOG.length) // 3–6 items

  const used = new Set<number>()
  const picks: (typeof CATALOG)[number][] = []
  for (let i = 0; i < count; i++) {
    let idx = (seed * 3 + i * 7) % CATALOG.length
    while (used.has(idx)) idx = (idx + 1) % CATALOG.length
    used.add(idx)
    picks.push(CATALOG[idx])
  }

  const weights = picks.map((_, i) => 1 + ((seed * 17 + i * 11) % 7) * 0.3)
  const totalW = weights.reduce((a, b) => a + b, 0)
  const qtys: number[] = []
  let remaining = task.itemQty
  for (let i = 0; i < count; i++) {
    if (i === count - 1) { qtys.push(Math.max(1, remaining)) }
    else { const q = Math.max(1, Math.round(task.itemQty * weights[i] / totalW)); qtys.push(q); remaining -= q }
  }

  return picks.map((p, i) => {
    const qty = qtys[i]
    let stored = 0
    if (task.status === 'completed') {
      stored = qty
    } else if (task.status === 'in progress') {
      const pct = 0.3 + ((seed * 13 + i * 5) % 5) * 0.1
      stored = Math.min(qty - 1, Math.max(0, Math.round(qty * pct)))
    }
    const binIdx = (seed + i * 3) % BINS.length
    const rtNo = task.receivingTaskNos[(seed + i) % task.receivingTaskNos.length]
    return {
      productName: p.name,
      skuCode: p.sku,
      image: p.img,
      qty,
      stored,
      binLocation: BINS[binIdx],
      unit: p.unit,
      receivingTaskNo: rtNo,
    }
  })
}

export function allPutAwayTasksFlat(): PutAwayTask[] {
  return [...putAwayTasks]
}
