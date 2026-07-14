/**
 * A bill of materials (Production → Bill of materials). Defines the finished good
 * a work order produces, along with its category and costing reference.
 */
export interface BillOfMaterials {
  id: string
  /** BOM number, e.g. Bill of Materials #10010 */
  number: string
  /** BOM name — usually the finished good or a variant name */
  name: string
  /** Standard = made-to-stock template · Custom = made-to-order variant */
  category: 'Standard' | 'Custom'
  /** how the output is costed — Actual cost or Standard cost */
  costingReference: 'Actual cost' | 'Standard cost'
  /** the finished good this BOM produces (product name or code) */
  finishedGood: string
  /** free-text description (may be empty) */
  description: string
}

export const billOfMaterials: BillOfMaterials[] = [
  {
    id: 'bom-10010',
    number: 'Bill of Materials #10010',
    name: 'Longboard Alexa',
    category: 'Standard',
    costingReference: 'Actual cost',
    finishedGood: 'Longboard #09',
    description: 'Custom longboard for Alexa',
  },
  {
    id: 'bom-10009',
    number: 'Bill of Materials #10009',
    name: 'Rollerblade',
    category: 'Custom',
    costingReference: 'Standard cost',
    finishedGood: 'Rollerblade',
    description: 'Boots with a single line of polyurethane wheels',
  },
  {
    id: 'bom-10008',
    number: 'Bill of Materials #10008',
    name: 'Lightning Blue Flamed Skateboard THD',
    category: 'Custom',
    costingReference: 'Standard cost',
    finishedGood: 'Skateboard #18',
    description: 'Fully personalized deck with custom graphics, tailored dimensions (width, length, wheelbase), ordered by THD',
  },
  {
    id: 'bom-10007',
    number: 'Bill of Materials #10007',
    name: 'Scooter',
    category: 'Standard',
    costingReference: 'Actual cost',
    finishedGood: 'Scooter',
    description: '',
  },
  {
    id: 'bom-10006',
    number: 'Bill of Materials #10006',
    name: 'Carbon Bicycle',
    category: 'Standard',
    costingReference: 'Standard cost',
    finishedGood: 'Carbon Bicycle',
    description: 'Carbon based materials',
  },
  {
    id: 'bom-10005',
    number: 'Bill of Materials #10005',
    name: 'Inline Skates',
    category: 'Standard',
    costingReference: 'Actual cost',
    finishedGood: 'Inline Skates',
    description: 'Five wheeled inline skates',
  },
  {
    id: 'bom-10004',
    number: 'Bill of Materials #10004',
    name: 'Penny Board Clayton',
    category: 'Custom',
    costingReference: 'Standard cost',
    finishedGood: 'Penny Board CLY',
    description: 'Compact, lightweight plastic cruiser skateboard for Clayton',
  },
  {
    id: 'bom-10003',
    number: 'Bill of Materials #10003',
    name: 'Mountain Bike DJX',
    category: 'Custom',
    costingReference: 'Standard cost',
    finishedGood: 'Mountain Bike #07',
    description: 'Off-road riding, featuring robust construction, knobby tires, and suspension systems for DJX',
  },
  {
    id: 'bom-10002',
    number: 'Bill of Materials #10002',
    name: 'Electric Skateboard',
    category: 'Standard',
    costingReference: 'Actual cost',
    finishedGood: 'Electric Skateboard',
    description: 'Motorized personal transporter controlled by a handheld wireless remote or body weight',
  },
  {
    id: 'bom-10001',
    number: 'Bill of Materials #10001',
    name: 'Tricycle',
    category: 'Standard',
    costingReference: 'Standard cost',
    finishedGood: 'Tricycle',
    description: 'Three-wheeled powered by pedals',
  },
]
