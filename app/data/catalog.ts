/**
 * Master product catalog — wholesale coffee beans & café equipment.
 * Every data module that needs product names, SKUs, or photos imports from here.
 * Do NOT define product lists anywhere else in the codebase.
 *
 * Units: Green beans are sold by the Sack (60 kg jute), roasted beans by the Bag
 * (1 kg foil), paper filters by the Box (100 pcs), all hardware as Unit.
 * Prices are IDR wholesale (ex-tax, per-unit).
 */
export interface CatalogItem {
  readonly id: string
  readonly name: string
  readonly desc: string
  readonly sku: string
  readonly hue: number
  readonly img: string
  readonly category: string
  readonly unit: string
  readonly price: number
  readonly stock: number
}

export const CATALOG: readonly CatalogItem[] = [
  // ── Green (raw) coffee beans — sold by the 60 kg jute sack ───────────────
  {
    id: 'p01', category: 'Green Beans', unit: 'Sack', price: 3_200_000, stock: 186,
    name: 'Green Beans Arabica Gayo Grade 1',
    desc: 'Aceh highlands, fully washed, screen 18, 60 kg jute sack',
    sku: 'GRN-ARB-GYO', hue: 25,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Premium-Colombia-Oscar-Hernandez-2026.jpg?v=1781072256',
  },
  {
    id: 'p02', category: 'Green Beans', unit: 'Sack', price: 2_400_000, stock: 240,
    name: 'Green Beans Robusta Lampung',
    desc: 'Sumatra, natural process, screen 16, 60 kg sack',
    sku: 'GRN-ROB-LMP', hue: 30,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Kenya-Gatomboya-AB-2026.jpg?v=1779850609',
  },
  {
    id: 'p03', category: 'Green Beans', unit: 'Sack', price: 3_600_000, stock: 120,
    name: 'Green Beans Arabica Toraja Sapan',
    desc: 'Sulawesi 1,600 masl, semi-washed, 60 kg sack',
    sku: 'GRN-ARB-TRJ', hue: 20,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Rwanda-Mbilima-Soil-Project-Lot.0704-2026.jpg?v=1779845863',
  },
  {
    id: 'p04', category: 'Green Beans', unit: 'Sack', price: 3_800_000, stock: 96,
    name: 'Green Beans Arabica Kintamani',
    desc: 'Bali, honey process, citrus notes, 60 kg sack',
    sku: 'GRN-ARB-KTM', hue: 35,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_China-Yunnan-Baoshan-2026.jpg?v=1779678647',
  },
  {
    id: 'p05', category: 'Green Beans', unit: 'Sack', price: 2_800_000, stock: 154,
    name: 'Green Beans Arabica Java Preanger',
    desc: 'West Java, fully washed, 60 kg sack',
    sku: 'GRN-ARB-JVP', hue: 28,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Honduras-Norman-Castellanos-2026.jpg?v=1778641670',
  },
  {
    id: 'p06', category: 'Green Beans', unit: 'Sack', price: 2_900_000, stock: 200,
    name: 'Green Beans Arabica Mandheling',
    desc: 'North Sumatra, wet-hulled, earthy body, 60 kg sack',
    sku: 'GRN-ARB-MDH', hue: 22,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_El-Salvador-Emerson-VasquezPacamara-2026.jpg?v=1776071969',
  },
  {
    id: 'p07', category: 'Green Beans', unit: 'Sack', price: 3_400_000, stock: 112,
    name: 'Green Beans Arabica Flores Bajawa',
    desc: 'Volcanic soil, chocolate notes, 60 kg sack',
    sku: 'GRN-ARB-FLB', hue: 18,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Fairfield-Medium.jpg?v=1779256203',
  },
  {
    id: 'p08', category: 'Green Beans', unit: 'Sack', price: 2_200_000, stock: 288,
    name: 'Green Beans Robusta Temanggung',
    desc: 'Central Java, dry process, 60 kg sack',
    sku: 'GRN-ROB-TMG', hue: 33,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Blend-Haru-Kochi-2026.jpg?v=1774337981',
  },

  // ── Roasted beans — wholesale foil bags ───────────────────────────────────
  {
    id: 'p09', category: 'Roasted Beans', unit: 'Bag', price: 280_000, stock: 420,
    name: 'Roasted Beans House Blend Medium',
    desc: 'Whole bean, 1 kg foil bag with valve',
    sku: 'RST-HSE-1K', hue: 26,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Single_Fairfield-Dark.jpg?v=1779257290',
  },
  {
    id: 'p10', category: 'Roasted Beans', unit: 'Bag', price: 320_000, stock: 360,
    name: 'Roasted Beans Espresso Blend Dark',
    desc: 'Whole bean, oily finish, 1 kg valve bag',
    sku: 'RST-ESP-1K', hue: 19,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Fairfield-Dark-coldbrew.jpg?v=1779932788',
  },
  {
    id: 'p11', category: 'Roasted Beans', unit: 'Bag', price: 450_000, stock: 250,
    name: 'Roasted Beans Single Origin Gayo',
    desc: 'Light-medium roast, whole bean, 1 kg',
    sku: 'RST-GYO-1K', hue: 31,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Drip-Bag_Indonesia-Frinsa-Estate-Weninggalih.jpg?v=1779252798',
  },
  {
    id: 'p12', category: 'Roasted Beans', unit: 'Bag', price: 380_000, stock: 180,
    name: 'Roasted Beans Decaf Swiss Water',
    desc: 'CO₂-free decaf, whole bean, 500 g bag',
    sku: 'RST-DEC-500', hue: 24,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/image_Beans_Drip-Bag_Rwanda-Mbilima-Soil-Project-2026.jpg?v=1779252374',
  },

  // ── Espresso machines ─────────────────────────────────────────────────────
  {
    id: 'p13', category: 'Espresso Machine', unit: 'Unit', price: 85_000_000, stock: 6,
    name: 'Espresso Machine Dual Boiler 2-Group',
    desc: 'Commercial, stainless body, PID control',
    sku: 'MCH-ESP-2GR', hue: 200,
    img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/La-Marzocco-Linea-Mini-Espresso-Machine-White-Hero-KO-by-Clive-Coffee.jpg?v=1711570888',
  },
  {
    id: 'p14', category: 'Espresso Machine', unit: 'Unit', price: 42_000_000, stock: 9,
    name: 'Espresso Machine Single Group Compact',
    desc: 'Café counter, 1 group, 5 L boiler',
    sku: 'MCH-ESP-1GR', hue: 205,
    img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/BREVILLEBARISTAEXPRESSESPRESSOMACHINEnew.jpg?v=1711169528',
  },
  {
    id: 'p15', category: 'Espresso Machine', unit: 'Unit', price: 120_000_000, stock: 4,
    name: 'Espresso Machine 3-Group Volumetric',
    desc: 'High-volume, auto dosing, twin pump',
    sku: 'MCH-ESP-3GR', hue: 210,
    img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/DeLonghiDedicaDuoEspressoMachinenew.jpg?v=1773102708',
  },

  // ── Grinders ──────────────────────────────────────────────────────────────
  {
    id: 'p16', category: 'Grinder', unit: 'Unit', price: 12_500_000, stock: 11,
    name: 'Coffee Grinder On-Demand 64mm',
    desc: 'Flat burr, digital timer, doserless',
    sku: 'GRD-OD-64', hue: 215,
    img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/FELLOWODECOFFEEGRINDER-GEN2new.jpg?v=1712094007',
  },
  {
    id: 'p17', category: 'Grinder', unit: 'Unit', price: 22_000_000, stock: 5,
    name: 'Coffee Grinder Conical 83mm',
    desc: 'Heavy-duty conical burr, low retention',
    sku: 'GRD-CN-83', hue: 220,
    img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/Eureka_Mignon_Specialita_Espresso_Grindernew-1.jpg?v=1754589272',
  },
  {
    id: 'p18', category: 'Grinder', unit: 'Unit', price: 18_500_000, stock: 7,
    name: 'Coffee Grinder Filter Bulk 98mm',
    desc: 'Batch brew, 2 kg hopper, flat burr',
    sku: 'GRD-FL-98', hue: 225,
    img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/BARATZAENCOREESPCOFFEEANDESPRESSOGRINDERnew.jpg?v=1710889626',
  },

  // ── Equipment ─────────────────────────────────────────────────────────────
  {
    id: 'p19', category: 'Equipment', unit: 'Unit', price: 8_200_000, stock: 13,
    name: 'Batch Brewer 2.5L Thermal',
    desc: 'Dual warmer, programmable, pour-over mode',
    sku: 'EQP-BRW-25', hue: 190,
    img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/DeLonghiMagnificaEvoECAM29043SBSuperautomaticEspressoMachinenew.jpg?v=1773103173',
  },

  // ── Accessories ───────────────────────────────────────────────────────────
  {
    id: 'p20', category: 'Accessory', unit: 'Unit', price: 380_000, stock: 64,
    name: 'Milk Frothing Pitcher 600ml',
    desc: 'Stainless steel, sharp spout, latte art',
    sku: 'ACC-PCH-600', hue: 185,
    img: 'https://cdn.shopify.com/s/files/1/2425/8607/products/milk-steaming-pitcher_7a0b6d9d-dc2f-410b-83e8-0c0caf6403e5.jpg',
  },
  {
    id: 'p21', category: 'Accessory', unit: 'Unit', price: 450_000, stock: 88,
    name: 'Tamper 58mm Flat Base',
    desc: 'Anodized aluminium handle, calibrated',
    sku: 'ACC-TMP-58', hue: 240,
    img: 'https://cdn.shopify.com/s/files/1/2425/8607/products/Lucca-Stainless-Steel-Espresso-Tamper-05.jpg',
  },
  {
    id: 'p22', category: 'Accessory', unit: 'Unit', price: 650_000, stock: 42,
    name: 'Bottomless Portafilter 58mm',
    desc: 'Triple spout removed, chrome finish',
    sku: 'ACC-PRT-58', hue: 245,
    img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/ECM-Bottomless-Portafilter-Clive-Coffee-KO-01.jpg',
  },
  {
    id: 'p23', category: 'Accessory', unit: 'Unit', price: 1_200_000, stock: 36,
    name: 'Coffee Scale 2kg / 0.1g',
    desc: 'Built-in brew timer, USB-C rechargeable',
    sku: 'ACC-SCL-2K', hue: 250,
    img: 'https://cdn.shopify.com/s/files/1/0831/7573/5603/files/ACAIALUNAR2021SMARTESPRESSOSCALEnew.jpg?v=1711084594',
  },
  {
    id: 'p24', category: 'Accessory', unit: 'Box', price: 85_000, stock: 320,
    name: 'Paper Filter V60 02 (100 pcs)',
    desc: 'Natural unbleached, cone shape',
    sku: 'ACC-FLT-V60', hue: 50,
    img: 'https://cdn.shopify.com/s/files/1/0801/9439/files/0129_hariometeo_112_2485daae-afa0-42da-b4d9-97fb436ffc99.jpg',
  },
  {
    id: 'p25', category: 'Accessory', unit: 'Unit', price: 520_000, stock: 55,
    name: 'Knock Box Drawer Stainless',
    desc: '2.4 L capacity, rubber knock bar',
    sku: 'ACC-KNB-24', hue: 235,
    img: 'https://cdn.shopify.com/s/files/1/2425/8607/files/LUCCA-Knock-Box-Small-Black-by-Clive-Coffee.jpg',
  },
] as const
