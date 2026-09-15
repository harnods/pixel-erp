import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Contact master — the Contacts module's record: one company/person the business
 * deals with, tagged with one or more roles (customer / vendor / other).
 *
 * Distinct from `customers.ts`, which is the lean FK table the transaction
 * modules (sales orders, outbound) join against. A contact carries everything
 * the Contacts pages show — tax identity (NPWP + NITKU), credit limit, bank
 * accounts, posting defaults — and is what the New contact form writes.
 *
 * Tax identity, domestic:
 *   • NPWP  = 16 digits.
 *   • NITKU = the NPWP followed by a 6-digit branch suffix (22 digits total).
 *     The form captures the two parts separately (`npwp` + `nitkuSuffix`); the
 *     detail page shows the joined value — see `nitkuFull()`.
 * Foreign contacts carry a single free-form TIN instead.
 */

export type ContactType = 'customer' | 'vendor' | 'other'
export type Domicile = 'domestic' | 'foreign'
/** DJP validation state of the NPWP/NITKU pair. */
export type TaxStatus = 'not-validated' | 'validated'

export interface ContactBank {
  id: string
  bankName: string
  branch: string
  accountNo: string
  accountName: string
  /** Primary account linked to a Mekari Pay / bank feed → "Connected" badge. */
  isConnected?: boolean
}

export interface Contact {
  id: string
  types: ContactType[]
  displayName: string
  /** Honorific shown in parentheses after the full name (Mr / Mrs / Ms). */
  title: string
  fullName: string
  /** One or more addresses — the detail page stacks them. */
  emails: string[]
  mobile: string
  identityType: string
  identityNumber: string
  groups: string[]
  companyName: string
  billingAddress: string
  shippingAddress: string
  phone: string
  fax: string
  domicile: Domicile
  /** Domestic: 16-digit NPWP. */
  npwp: string
  /** Domestic: 6-digit NITKU branch suffix appended to the NPWP. */
  nitkuSuffix: string
  /** Foreign: Tax Identification Number (free-form, no DJP validation). */
  tin: string
  taxStatus: TaxStatus
  /** Maximum unpaid balance allowed, in IDR. `null` = no limit set. */
  creditLimit: number | null
  banks: ContactBank[]
  arAccount: string
  apAccount: string
  paymentTerms: string
  currency: string
  memo: string
  updatedBy: string
  /** ISO timestamp of the last edit. */
  updatedAt: string
}

/** The joined 22-digit NITKU shown on the detail page (empty when no NPWP). */
export function nitkuFull(c: Pick<Contact, 'npwp' | 'nitkuSuffix'>): string {
  return c.npwp ? c.npwp + c.nitkuSuffix : ''
}

/** Options for the fixed-value selects on the New contact form. */
export const TITLE_OPTIONS = ['Mr', 'Mrs', 'Ms']
export const IDENTITY_TYPE_OPTIONS = ['KTP', 'SIM', 'Passport', 'KITAS']
export const CONTACT_GROUP_OPTIONS = [
  'VIP Customers',
  'Food & Beverages',
  'Retail',
  'Distributor',
  'Hotel & Resort',
  'Office pantry',
]
export const BANK_OPTIONS = [
  'Bank BCA', 'Bank Mandiri', 'Bank BNI', 'Bank BRI', 'Bank CIMB Niaga',
  'Bank Danamon', 'Bank Permata', 'Bank DBS', 'Bank OCBC NISP',
]
export const AR_ACCOUNT_OPTIONS = ['1-10100 Account Receivable', '1-10200 Other Receivable']
export const AP_ACCOUNT_OPTIONS = ['2-20100 Trade Payable', '2-20200 Other Payable']
export const PAYMENT_TERMS_OPTIONS = ['Net 7', 'Net 14', 'Net 30', 'Net 60', 'Cash on delivery']
export const CURRENCY_OPTIONS = ['Indonesian Rupiah (Rp)', 'US Dollar ($)', 'Singapore Dollar (S$)']

/** Empty-ish record used to seed the create form and to fill sparse seed rows. */
function blank(): Omit<Contact, 'id'> {
  return {
    types: ['customer'],
    displayName: '', title: 'Mr', fullName: '', emails: [], mobile: '',
    identityType: 'KTP', identityNumber: '', groups: [],
    companyName: '', billingAddress: '', shippingAddress: '', phone: '', fax: '',
    domicile: 'domestic', npwp: '', nitkuSuffix: '', tin: '', taxStatus: 'not-validated',
    creditLimit: null, banks: [],
    arAccount: AR_ACCOUNT_OPTIONS[0]!, apAccount: AP_ACCOUNT_OPTIONS[0]!,
    paymentTerms: 'Net 30', currency: CURRENCY_OPTIONS[0]!,
    memo: '', updatedBy: 'Rizal Candra', updatedAt: '2026-01-20T09:00:00+07:00',
  }
}

/** A sparse coffee-industry account — the bulk of the list. */
function account(
  id: string, displayName: string, companyName: string, email: string, phone: string,
  city: string, groups: string[], creditLimit: number, updatedAt: string,
): Contact {
  return {
    ...blank(), id, displayName, companyName, groups,
    emails: [email], phone, mobile: '',
    billingAddress: `${city}, Indonesia`, shippingAddress: `${city}, Indonesia`,
    creditLimit, updatedAt,
    banks: [],
  }
}

const SEED: Contact[] = [
  // The designed record — every section of the detail page is populated from it.
  {
    id: 'CT001',
    types: ['customer'],
    displayName: 'Jaka Suherman',
    title: 'Mr',
    fullName: 'Jaka Suherman',
    emails: ['jaka@hungrybirds.com', 'app.finance@hungrybids.com'],
    mobile: '+6281899999999',
    identityType: 'KTP',
    identityNumber: '3171010101900001',
    groups: ['VIP Customers', 'Food & Beverages'],
    companyName: 'PT Hungry Birds Indonesia',
    billingAddress: 'Jl. Anggrek No. 25, Kebayoran Baru, Jakarta Selatan, 12130, DKI Jakarta',
    shippingAddress: 'Jl Sindang III/5, Kompleks Pertamina, DKI Jakarta 12820',
    phone: '+62215658424',
    fax: '',
    domicile: 'domestic',
    npwp: '0012345678012000',
    nitkuSuffix: '000001',
    tin: '',
    taxStatus: 'not-validated',
    creditLimit: 500_000_000,
    banks: [
      { id: 'b1', bankName: 'Bank BCA', branch: 'BCA KCU Sudirman', accountNo: '78866668888', accountName: 'PT Hungry Birds Indonesia', isConnected: true },
      { id: 'b2', bankName: 'Bank DBS', branch: '', accountNo: '046999988887777', accountName: 'PT Hungry Birds Indonesia' },
    ],
    arAccount: '1-10100 Account Receivable',
    apAccount: '2-20100 Trade Payable',
    paymentTerms: 'Net 30',
    currency: 'Indonesian Rupiah (Rp)',
    memo: 'Credit limit with approval.',
    updatedBy: 'Rizal Candra',
    updatedAt: '2026-01-25T11:00:00+07:00',
  },
  account('CT002', 'Anomali Coffee',           'PT Anomali Kopi Indonesia',   'purchasing@anomalicoffee.com',   '021-5550001', 'Jakarta',    ['VIP Customers', 'Food & Beverages'], 250_000_000, '2026-01-22T14:20:00+07:00'),
  account('CT003', 'Tanamera Coffee Roastery', 'PT Tanamera Kopi Nusantara',  'order@tanameracoffee.com',       '021-5550002', 'Jakarta',    ['Food & Beverages'],                  180_000_000, '2026-01-19T10:05:00+07:00'),
  account('CT004', 'Hotel Mulia Senayan',      'PT Mulia Intipelangi',        'fnb@hotelmulia.com',             '021-5550003', 'Jakarta',    ['Hotel & Resort', 'VIP Customers'],   400_000_000, '2026-01-18T16:40:00+07:00'),
  account('CT005', 'Fore Coffee Thamrin',      'PT Fore Kopi Indonesia',      'supply@fore.coffee',             '021-5550004', 'Jakarta',    ['Food & Beverages'],                  120_000_000, '2026-01-16T09:15:00+07:00'),
  account('CT006', 'Kopi Kenangan Pusat',      'PT Kopi Kenangan Indonesia',  'buyer@kopikenangan.com',         '021-5550006', 'Jakarta',    ['VIP Customers'],                     500_000_000, '2026-01-15T11:30:00+07:00'),
  account('CT007', 'Distributor Sentra Boga',  'PT Sentra Boga Nusantara',    'po@sentraboga.co.id',            '021-5550015', 'Bekasi',     ['Distributor'],                       750_000_000, '2026-01-14T08:45:00+07:00'),
  account('CT008', 'Excelso Grand Indonesia',  'PT Excelso Multi Rasa',       'purchasing@excelso.com',         '021-5550013', 'Jakarta',    ['Food & Beverages'],                  300_000_000, '2026-01-12T13:10:00+07:00'),
  account('CT009', 'GoWork Office Tower',      'PT Gowork Ruang Kreatif',     'pantry@gowork.co',               '021-5550014', 'Jakarta',    ['Office pantry'],                      40_000_000, '2026-01-11T15:55:00+07:00'),
  account('CT010', 'Coffee Cult Bali',         'PT Kultur Kopi Bali',         'buyer@coffeecult.id',            '0361-555012', 'Bali',       ['Food & Beverages'],                   80_000_000, '2026-01-09T10:20:00+07:00'),
  account('CT011', 'One Eighty Coffee',        'PT Seratus Delapan Puluh',    'supply@oneeighty.coffee',        '022-5550024', 'Bandung',    ['Food & Beverages'],                  100_000_000, '2026-01-08T12:00:00+07:00'),
  account('CT012', 'Pochi Coffee Roasters',    'PT Pochi Roastery Indonesia', 'roastery@pochicoffee.com',       '031-5550025', 'Surabaya',   ['Distributor'],                       150_000_000, '2026-01-06T09:35:00+07:00'),
]

// Vendors and "other" contacts share the same store — the role checkboxes on the
// form decide which index a record shows up in.
SEED[6]!.types = ['customer', 'vendor']
SEED[8]!.types = ['other']

const STORE_KEY = 'contacts-v1'

export const contacts = reactive<Contact[]>(
  loadSnapshot<Contact>(STORE_KEY) ?? SEED.map((c) => ({ ...c, banks: c.banks.map((b) => ({ ...b })) })),
)

export function persistContacts(): void {
  saveSnapshot(STORE_KEY, contacts)
}

export function getContact(id: string): Contact | undefined {
  return contacts.find((c) => c.id === id)
}

/** Contacts carrying a given role — backs the Customers / Vendors / Other lists. */
export function contactsOfType(type: ContactType): Contact[] {
  return contacts.filter((c) => c.types.includes(type))
}

/** Next free id (CT013, CT014, …). */
function nextId(): string {
  const max = contacts.reduce((n, c) => {
    const v = Number(c.id.replace(/\D/g, ''))
    return Number.isFinite(v) && v > n ? v : n
  }, 0)
  return `CT${String(max + 1).padStart(3, '0')}`
}

export function addContact(payload: Omit<Contact, 'id'>): Contact {
  const created: Contact = { ...payload, id: nextId() }
  contacts.unshift(created)
  persistContacts()
  return created
}

export function updateContact(id: string, payload: Partial<Omit<Contact, 'id'>>): void {
  const c = contacts.find((x) => x.id === id)
  if (!c) return
  Object.assign(c, payload)
  persistContacts()
}

export function deleteContact(id: string): void {
  const i = contacts.findIndex((c) => c.id === id)
  if (i !== -1) {
    contacts.splice(i, 1)
    persistContacts()
  }
}

/** A fresh, unsaved contact for the create form. */
export function newContactDraft(type: ContactType = 'customer'): Omit<Contact, 'id'> {
  return { ...blank(), types: [type] }
}

// The DJP lookup behind the New contact form's `Validate` button is mocked, and
// which result it returns is a demo toggle rather than a property of the numbers
// — see `useContactTaxScenario`.
