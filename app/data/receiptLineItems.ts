import type { Receipt } from './receipts'

export interface ReceiptLineItem {
  productId: string
  productName: string
  productDesc: string
  sku: string
  colorHue: number
  purchaseQty: number
  storageLocation: string
}

const CATALOG = [
  { id: 'p01', name: 'Smartphone Case iPhone 15 Pro', desc: 'TPU + Polycarbonate, MagSafe compatible', sku: 'ACC-PH-001', hue: 210 },
  { id: 'p02', name: 'Wireless Earbuds Pro X', desc: 'ANC, IPX5, 30h battery, USB-C', sku: 'ACC-AU-002', hue: 145 },
  { id: 'p03', name: 'USB-C Cable 2m Braided', desc: '100W fast charge, PD 3.0', sku: 'ACC-CB-003', hue: 30 },
  { id: 'p04', name: 'Power Bank 20000mAh', desc: '65W PD, dual USB-A + USB-C output', sku: 'ACC-PB-004', hue: 180 },
  { id: 'p05', name: 'Tempered Glass Screen Protector', desc: '9H hardness, 2.5D edge, anti-glare', sku: 'ACC-SP-005', hue: 260 },
  { id: 'p06', name: "Running Shoes Men's (Size 42)", desc: 'EVA midsole, mesh upper, reflective strip', sku: 'APL-SH-006', hue: 15 },
  { id: 'p07', name: 'Cotton T-Shirt Basic White (M)', desc: '180gsm combed cotton, unisex fit', sku: 'APL-TS-007', hue: 200 },
  { id: 'p08', name: 'Cargo Pants Slim Fit (W32)', desc: '4-pocket, stretch cotton blend', sku: 'APL-PT-008', hue: 100 },
  { id: 'p09', name: 'Stainless Water Bottle 750ml', desc: 'Vacuum insulated, 24h cold / 12h hot', sku: 'SPT-BT-009', hue: 170 },
  { id: 'p10', name: 'Instant Coffee 3-in-1 Box', desc: '20 sachets × 25g, medium roast blend', sku: 'FNB-CF-010', hue: 25 },
  { id: 'p11', name: 'Mineral Water 600ml (24-pack)', desc: 'TDS <100ppm, sealed carton', sku: 'FNB-WR-011', hue: 195 },
  { id: 'p12', name: 'Hand Sanitizer Gel 500ml', desc: '70% ethanol, aloe vera extract', sku: 'HBC-HS-012', hue: 135 },
  { id: 'p13', name: 'KN95 Face Mask (50pcs/box)', desc: '5-layer filtration, earloop, foldable', sku: 'HBC-FM-013', hue: 50 },
  { id: 'p14', name: 'A4 Copy Paper 80gsm Rim', desc: '500 sheets, brightness 104%, acid-free', sku: 'OFF-PP-014', hue: 55 },
  { id: 'p15', name: 'Ballpoint Pen Black Box (12pcs)', desc: '0.7mm tip, oil-based ink, cap-type', sku: 'OFF-PN-015', hue: 230 },
  { id: 'p16', name: 'Wireless Optical Mouse 2.4GHz', desc: 'USB nano receiver, 3-level DPI, silent', sku: 'ACC-MS-016', hue: 280 },
  { id: 'p17', name: 'Mechanical Keyboard TKL RGB', desc: 'Brown switches, RGB backlit, USB-C', sku: 'ACC-KB-017', hue: 320 },
  { id: 'p18', name: 'Monitor Stand Adjustable', desc: 'Height 10–15cm, max load 8kg, cable slot', sku: 'FRN-MS-018', hue: 40 },
  { id: 'p19', name: 'Storage Box Foldable 60L', desc: 'PP body + bamboo lid, 50kg rated load', sku: 'FRN-SB-019', hue: 80 },
  { id: 'p20', name: 'Vitamin C 500mg Effervescent (100s)', desc: 'Orange flavour, dissolves in 200ml water', sku: 'HBC-VC-020', hue: 35 },
  { id: 'p21', name: 'Desk Organizer 5-Slot Bamboo', desc: 'Natural bamboo fibre, non-slip base', sku: 'OFF-DO-021', hue: 70 },
  { id: 'p22', name: 'LED Desk Lamp with USB Charging', desc: '3 colour temps, touch dimmer, USB-A port', sku: 'OFF-LM-022', hue: 45 },
  { id: 'p23', name: 'Notebook A5 Hardcover Dot Grid', desc: '192 pages, 80gsm, lay-flat binding', sku: 'OFF-NB-023', hue: 240 },
  { id: 'p24', name: 'Canvas Tote Bag Natural', desc: '10oz cotton canvas, 38×40cm, gusset', sku: 'APL-TB-024', hue: 60 },
  { id: 'p25', name: 'Protein Bar Choc Almond (12pk)', desc: '25g protein/bar, 45g bar, no added sugar', sku: 'FNB-PB-025', hue: 20 },
] as const

const BINS = [
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
    purchaseQty: qtys[i],
    storageLocation: BINS[(seed + i * 5) % BINS.length],
  }))
}
