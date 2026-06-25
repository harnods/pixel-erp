import type { Receipt } from './receipts'

export interface ReceiptLineItem {
  productId: string
  productName: string
  productDesc: string
  sku: string
  colorHue: number
  image: string
  unit: string
  purchaseQty: number
  storageLocation: string
}

/** Stock-keeping unit of measure, derived from the SKU family. */
function unitFor(sku: string): string {
  if (sku.startsWith('GRN-')) return 'Sack'   // green beans by 60kg sack
  if (sku.startsWith('RST-')) return 'Bag'    // roasted beans by bag
  if (sku.startsWith('ACC-FLT')) return 'Box' // filters by box
  return 'Unit'                               // machines, grinders, gear
}

// Wholesale coffee beans + machines & equipment catalog.
// Product photos are real, solid-background shots from Kurasu (beans),
// La Marzocco / Breville / De'Longhi (machines), Fellow / Eureka / Baratza
// (grinders) and Clive / Seattle Coffee Gear / Hario (accessories).
const CATALOG = [
  // ── Green (raw) coffee beans, by origin — sold by the sack ──
  { id: 'p01', name: 'Green Beans Arabica Gayo Grade 1', desc: 'Aceh highlands, fully washed, 60kg jute sack', sku: 'GRN-ARB-GYO', hue: 25, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Premium-Colombia-Oscar-Hernandez-2026.jpg?v=1781072256' },
  { id: 'p02', name: 'Green Beans Robusta Lampung', desc: 'Sumatra, natural process, screen 16, 60kg sack', sku: 'GRN-ROB-LMP', hue: 30, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Kenya-Gatomboya-AB-2026.jpg?v=1779850609' },
  { id: 'p03', name: 'Green Beans Arabica Toraja Sapan', desc: 'Sulawesi 1,600 masl, semi-washed, 60kg sack', sku: 'GRN-ARB-TRJ', hue: 20, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Rwanda-Mbilima-Soil-Project-Lot.0704-2026.jpg?v=1779845863' },
  { id: 'p04', name: 'Green Beans Arabica Kintamani', desc: 'Bali, honey process, citrus notes, 60kg sack', sku: 'GRN-ARB-KTM', hue: 35, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_China-Yunnan-Baoshan-2026.jpg?v=1779678647' },
  { id: 'p05', name: 'Green Beans Arabica Java Preanger', desc: 'West Java, fully washed, 60kg sack', sku: 'GRN-ARB-JVP', hue: 28, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Honduras-Norman-Castellanos-2026.jpg?v=1778641670' },
  { id: 'p06', name: 'Green Beans Arabica Mandheling', desc: 'North Sumatra, wet-hulled, earthy body, 60kg sack', sku: 'GRN-ARB-MDH', hue: 22, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_El-Salvador-Emerson-VasquezPacamara-2026.jpg?v=1776071969' },
  { id: 'p07', name: 'Green Beans Arabica Flores Bajawa', desc: 'Volcanic soil, chocolate notes, 60kg sack', sku: 'GRN-ARB-FLB', hue: 18, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Fairfield-Medium.jpg?v=1779256203' },
  { id: 'p08', name: 'Green Beans Robusta Temanggung', desc: 'Central Java, dry process, 60kg sack', sku: 'GRN-ROB-TMG', hue: 33, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Blend-Haru-Kochi-2026.jpg?v=1774337981' },

  // ── Roasted beans — wholesale bags ──
  { id: 'p09', name: 'Roasted Beans House Blend Medium', desc: 'Whole bean, 1kg foil bag with valve', sku: 'RST-HSE-1K',  hue: 26, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Fairfield-Dark.jpg?v=1779257290' },
  { id: 'p10', name: 'Roasted Beans Espresso Blend Dark', desc: 'Whole bean, oily finish, 1kg valve bag', sku: 'RST-ESP-1K',  hue: 19, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Fairfield-Dark-coldbrew.jpg?v=1779932788' },
  { id: 'p11', name: 'Roasted Beans Single Origin Gayo', desc: 'Light-medium roast, whole bean, 1kg', sku: 'RST-GYO-1K',  hue: 31, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Drip-Bag_Indonesia-Frinsa-Estate-Weninggalih.jpg?v=1779252798' },
  { id: 'p12', name: 'Roasted Beans Decaf Swiss Water', desc: 'CO₂-free decaf, whole bean, 500g bag', sku: 'RST-DEC-500', hue: 24, img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Drip-Bag_Rwanda-Mbilima-Soil-Project-2026.jpg?v=1779252374' },

  // ── Espresso machines — La Marzocco / Breville / De'Longhi ──
  { id: 'p13', name: 'Espresso Machine Dual Boiler 2-Group', desc: 'Commercial, stainless body, PID control', sku: 'MCH-ESP-2GR', hue: 200, img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/La-Marzocco-Linea-Mini-Espresso-Machine-White-Hero-KO-by-Clive-Coffee.jpg?v=1711570888' },
  { id: 'p14', name: 'Espresso Machine Single Group Compact', desc: 'Café counter, 1 group, 5L boiler', sku: 'MCH-ESP-1GR', hue: 205, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/BREVILLEBARISTAEXPRESSESPRESSOMACHINEnew.jpg?v=1711169528' },
  { id: 'p15', name: 'Espresso Machine 3-Group Volumetric', desc: 'High-volume, auto dosing, twin pump', sku: 'MCH-ESP-3GR', hue: 210, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/DeLonghiDedicaDuoEspressoMachinenew.jpg?v=1773102708' },

  // ── Grinders — Fellow / Eureka / Baratza ──
  { id: 'p16', name: 'Coffee Grinder On-Demand 64mm', desc: 'Flat burr, digital timer, doserless', sku: 'GRD-OD-64',   hue: 215, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/FELLOWODECOFFEEGRINDER-GEN2new.jpg?v=1712094007' },
  { id: 'p17', name: 'Coffee Grinder Conical 83mm', desc: 'Heavy-duty conical burr, low retention', sku: 'GRD-CN-83',   hue: 220, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/Eureka_Mignon_Specialita_Espresso_Grindernew-1.jpg?v=1754589272' },
  { id: 'p18', name: 'Coffee Grinder Filter Bulk 98mm', desc: 'Batch brew, 2kg hopper, flat burr', sku: 'GRD-FL-98',   hue: 225, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/BARATZAENCOREESPCOFFEEANDESPRESSOGRINDERnew.jpg?v=1710889626' },

  // ── Brewing equipment & accessories ──
  { id: 'p19', name: 'Batch Brewer 2.5L Thermal', desc: 'Dual warmer, programmable, pour-over mode', sku: 'EQP-BRW-25',  hue: 190, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/DeLonghiMagnificaEvoECAM29043SBSuperautomaticEspressoMachinenew.jpg?v=1773103173' },
  { id: 'p20', name: 'Milk Frothing Pitcher 600ml', desc: 'Stainless steel, sharp spout, latte art', sku: 'ACC-PCH-600', hue: 185, img: 'https://cdn.shopify.com/s/files/1/2425/8607/products/milk-steaming-pitcher_7a0b6d9d-dc2f-410b-83e8-0c0caf6403e5.jpg' },
  { id: 'p21', name: 'Tamper 58mm Flat Base', desc: 'Anodized aluminium handle, calibrated', sku: 'ACC-TMP-58',  hue: 240, img: 'https://cdn.shopify.com/s/files/1/2425/8607/products/Lucca-Stainless-Steel-Espresso-Tamper-05.jpg' },
  { id: 'p22', name: 'Bottomless Portafilter 58mm', desc: 'Triple spout removed, chrome finish', sku: 'ACC-PRT-58',  hue: 245, img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/ECM-Bottomless-Portafilter-Clive-Coffee-KO-01.jpg' },
  { id: 'p23', name: 'Coffee Scale 2kg / 0.1g', desc: 'Built-in brew timer, USB-C rechargeable', sku: 'ACC-SCL-2K',  hue: 250, img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/ACAIALUNAR2021SMARTESPRESSOSCALEnew.jpg?v=1711084594' },
  { id: 'p24', name: 'Paper Filter V60 02 (100 pcs)', desc: 'Natural unbleached, cone shape', sku: 'ACC-FLT-V60', hue: 50,  img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/0129_hariometeo_112_2485daae-afa0-42da-b4d9-97fb436ffc99.jpg' },
  { id: 'p25', name: 'Knock Box Drawer Stainless', desc: '2.4L capacity, rubber knock bar', sku: 'ACC-KNB-24',  hue: 235, img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/LUCCA-Knock-Box-Small-Black-by-Clive-Coffee.jpg' },
] as const

export const BINS = [
  'A-01-01', 'A-01-02', 'A-02-01', 'A-02-03', 'A-03-02',
  'B-01-01', 'B-01-04', 'B-02-02', 'B-03-01', 'B-03-03',
  'C-01-02', 'C-02-01', 'C-02-04', 'C-03-03', 'C-04-01',
  'D-01-03', 'D-02-01', 'D-02-02', 'D-03-04', 'D-04-02',
] as const

export function lineItemsForReceipt(receipt: Receipt): ReceiptLineItem[] {
  const seed = receipt.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const count = Math.min(receipt.skuQty, CATALOG.length)
  const used = new Set<number>()
  const picks: (typeof CATALOG)[number][] = []

  for (let i = 0; i < count; i++) {
    let idx = (seed * 3 + i * 7) % CATALOG.length
    while (used.has(idx)) idx = (idx + 1) % CATALOG.length
    used.add(idx)
    picks.push(CATALOG[idx])
  }

  // Distribute purchaseQty with variance so not all items have the same qty
  const weights = picks.map((_, i) => 1 + ((seed * 17 + i * 11) % 7) * 0.3)
  const totalW = weights.reduce((a, b) => a + b, 0)
  const qtys: number[] = []
  let remaining = receipt.purchaseQty

  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      qtys.push(Math.max(1, remaining))
    } else {
      const q = Math.max(1, Math.round(receipt.purchaseQty * weights[i] / totalW))
      qtys.push(q)
      remaining -= q
    }
  }

  return picks.map((p, i) => ({
    productId: p.id,
    productName: p.name,
    productDesc: p.desc,
    sku: p.sku,
    colorHue: p.hue,
    image: p.img,
    unit: unitFor(p.sku),
    purchaseQty: qtys[i],
    storageLocation: BINS[(seed + i * 5) % BINS.length],
  }))
}
