/**
 * Settings › Templates — email templates, PDF signature setup, customize PDF and
 * WhatsApp message templates. Defaults copy the production seed
 * (EmailMessageTemplate.create_default, ShareMessageTemplate::DEFAULT_TEMPLATE,
 * ondemand-pdf DefaultPdfSetting). Saved values persist in localStorage.
 */

const STORAGE_KEY = 'erp-db:template-settings'

export const TEMPLATE_COMPANY_NAME = 'PT Central Perk Indonesia'
export const TEMPLATE_USER_NAME = 'Rizal Candra'

// ─── Sub-navigation (prod setting.html.haml › Template menu) ────────────────
export type TemplateSection =
  | 'email_template_sales' | 'email_template_sq' | 'email_template_so' | 'email_template_po'
  | 'pdf_signature' | 'customize_pdf'
  | 'whatsapp_sales_invoice_template' | 'whatsapp_sales_order_template'

export const TEMPLATE_NAV: { header: string; items: { id: TemplateSection; label: string }[] }[] = [
  {
    header: 'Email Template',
    items: [
      { id: 'email_template_sales', label: 'Sales Invoice' },
      { id: 'email_template_sq', label: 'Sales Quote' },
      { id: 'email_template_so', label: 'Sales Order' },
      { id: 'email_template_po', label: 'Purchase Order' },
    ],
  },
  {
    header: 'PDF Template',
    items: [
      { id: 'pdf_signature', label: 'General Setting' },
      { id: 'customize_pdf', label: 'Customize PDF' },
    ],
  },
  {
    header: 'WhatsApp',
    items: [
      { id: 'whatsapp_sales_invoice_template', label: 'Sales Template Message' },
      { id: 'whatsapp_sales_order_template', label: 'Order Template Message' },
    ],
  },
]

// ─── Email templates ────────────────────────────────────────────────────────
export type EmailTemplateKey = 'sales_invoice' | 'sales_quote' | 'sales_order' | 'purchase_order'

export interface EmailTemplate { subject: string; message: string }

const CUSTOMER_VARS = ['[NamaCustomer]', '[PerusahaanCustomer]', '[NomorTransaksi]', '[TanggalTransaksi]']
const TAIL_VARS = ['[NamaPerusahaan]', '[EmailPerusahaan]', '[SisaTagihan]', '[TanggalHariIni]']

export const EMAIL_TEMPLATE_META: Record<EmailTemplateKey, { section: TemplateSection; title: string; variables: string[] }> = {
  sales_invoice: {
    section: 'email_template_sales',
    title: 'Sales Email Template',
    variables: [...CUSTOMER_VARS, '[TanggalJatuhTempo]', ...TAIL_VARS],
  },
  sales_quote: {
    section: 'email_template_sq',
    title: 'Sales Quote Email Template',
    variables: [...CUSTOMER_VARS, '[TanggalExpiry]', ...TAIL_VARS],
  },
  sales_order: {
    section: 'email_template_so',
    title: 'Sales Order Email Template',
    variables: [...CUSTOMER_VARS, '[TanggalJatuhTempo]', ...TAIL_VARS],
  },
  purchase_order: {
    section: 'email_template_po',
    title: 'Purchase Order Email Template',
    variables: [
      '[NamaVendor]', '[PerusahaanVendor]', '[NomorTransaksi]', '[TanggalTransaksi]', '[TanggalJatuhTempo]',
      '[NamaPerusahaan]', '[EmailPerusahaan]', '[AlamatPengirimianPerusahaan]', '[SisaTagihan]', '[TanggalHariIni]',
    ],
  },
}

const EMAIL_DEFAULTS: Record<EmailTemplateKey, EmailTemplate> = {
  sales_invoice: {
    subject: 'Faktur Penjualan #[NomorTransaksi]',
    message: 'Yth. [NamaCustomer],\nTerima kasih atas bisnis Anda.\n\nBerikut adalah Faktur #[NomorTransaksi] sebesar [SisaTagihan].\n\nTerimakasih atas kerjasamanya.\n[NamaPerusahaan]',
  },
  sales_quote: {
    subject: 'Penawaran Penjualan #[NomorTransaksi]',
    message: 'Yth. [NamaCustomer],\nTerima kasih atas permintaan penawaran Anda.\n\nBerikut adalah penawaran #[NomorTransaksi] sebesar [SisaTagihan].\n\nTerimakasih atas kerjasamanya.\n[NamaPerusahaan]',
  },
  sales_order: {
    subject: 'Pemesanan Penjualan #[NomorTransaksi]',
    message: 'Yth. [NamaCustomer],\nTerima kasih atas bisnis Anda.\n\nBerikut adalah Pemesanan Penjualan #[NomorTransaksi] sebesar [SisaTagihan].\n\nTerimakasih atas kerjasamanya.\n[NamaPerusahaan]',
  },
  // Worst case: the longest subject and a message using every vendor variable.
  purchase_order: {
    subject: 'Pemesanan Pembelian #[NomorTransaksi] dari [NamaPerusahaan] untuk [PerusahaanVendor] — mohon konfirmasi sebelum [TanggalJatuhTempo]',
    message: 'Yth. [NamaVendor],\nBerikut adalah Pemesanan Pembelian #[NomorTransaksi] tertanggal [TanggalTransaksi] sebesar [SisaTagihan].\n\nMohon kirimkan barang ke [AlamatPengirimianPerusahaan] paling lambat [TanggalJatuhTempo]. Untuk pertanyaan, hubungi kami di [EmailPerusahaan].\n\nTerimakasih atas kerjasamanya.\n[NamaPerusahaan]\n[TanggalHariIni]',
  },
}

// ─── PDF signature (General Setting) ────────────────────────────────────────
export const SIGNATURE_TYPE_OPTIONS = [
  'All', 'Sales Invoice', 'Sales Order', 'Sales Quote', 'Sales Return', 'Receive Payment',
  'Sales Order Payment', 'Purchase Invoice', 'Purchase Order', 'Purchase Payment', 'Purchase Return',
  'Purchase Order Payment', 'Customer Refund Credit Memo', 'Customer Credit Memo', 'Vendor Debit Memo',
]

export type SignatureFieldOption = 'custom' | 'user_name' | 'company_name'
export const SIGNATURE_FIELD_OPTIONS: { value: SignatureFieldOption; label: string }[] = [
  { value: 'custom', label: 'Custom (Type Manually)' },
  { value: 'user_name', label: '[User Name]' },
  { value: 'company_name', label: '[Company Name]' },
]

export interface SignatureLine { option: SignatureFieldOption; text: string }
export interface Signature {
  id: string
  types: string[]
  imageName: string | null
  lines: [SignatureLine, SignatureLine, SignatureLine]
}

export interface PdfSignatureSettings {
  useFooter: boolean
  useSignature: boolean
  useDraftWatermark: boolean
  useQrMekaripay: boolean
  signatures: Signature[]
}

const PDF_SIGNATURE_DEFAULTS: PdfSignatureSettings = {
  useFooter: true,
  useSignature: true,
  useDraftWatermark: false,
  useQrMekaripay: false,
  signatures: [
    {
      id: 'sig-1',
      types: ['All'],
      imageName: 'signature-rizal.png',
      lines: [
        { option: 'user_name', text: '' },
        { option: 'custom', text: 'Finance Manager' },
        { option: 'company_name', text: '' },
      ],
    },
    // Worst case: many document types and the longest custom title.
    {
      id: 'sig-2',
      types: ['Purchase Invoice', 'Purchase Order', 'Purchase Payment', 'Purchase Return', 'Purchase Order Payment', 'Vendor Debit Memo'],
      imageName: null,
      lines: [
        { option: 'custom', text: 'Anindya Kusumawardhani Prameswari' },
        { option: 'custom', text: 'Head of Procurement and Vendor Management, Jakarta Head Office' },
        { option: 'custom', text: '' },
      ],
    },
  ],
}

export function newSignature(): Signature {
  return {
    id: `sig-${Date.now()}`,
    types: [],
    imageName: null,
    lines: [
      { option: 'custom', text: '' },
      { option: 'custom', text: '' },
      { option: 'custom', text: '' },
    ],
  }
}

// ─── Customize PDF (jurnal-frontend-app settings/templates/custom_pdf) ──────
export type PdfDocType = 'sales_invoice' | 'sales_order' | 'sales_quote' | 'purchase_invoice'

export const PDF_DOC_TYPE_OPTIONS: { value: PdfDocType; label: string; group: string }[] = [
  { value: 'sales_invoice', label: 'Sales Invoice', group: 'SALES' },
  { value: 'sales_order', label: 'Sales Order', group: 'SALES' },
  { value: 'sales_quote', label: 'Sales Quote', group: 'SALES' },
  { value: 'purchase_invoice', label: 'Purchase Invoice', group: 'PURCHASES' },
]

export const PDF_TEMPLATE_IDS: Record<PdfDocType, string[]> = {
  sales_invoice: ['1', '6', '7', '10', '12'],
  sales_order: ['1', '6', '7', '10'],
  sales_quote: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
  purchase_invoice: ['1', '6', '7', '10'],
}

export const PDF_DATE_FORMATS = ['DD-MM-YYYY', 'DD MMM YYYY', 'DD MMMM YYYY', 'MM/DD/YYYY', 'MM-DD-YYYY']
export const PDF_CONTENT_SIZES: { value: 'large' | 'medium' | 'small'; label: string }[] = [
  { value: 'large', label: 'Large' },
  { value: 'medium', label: 'Medium' },
  { value: 'small', label: 'Small' },
]

export interface CustomPdfSetting {
  isActive: boolean
  template: string
  contentSize: 'large' | 'medium' | 'small'
  titleId: string
  titleEn: string
  applyBoth: boolean
  logoShow: boolean
  logoPosition: 'left' | 'center' | 'right'
  company: { name: boolean; addr: boolean; email: boolean; phone: boolean; web: boolean; fax: boolean; taxNo: boolean }
  contact: { displayName: boolean; companyName: boolean; fullName: boolean; addr: boolean; phone: boolean; email: boolean }
  info: { customerRef: boolean; otherDpp: boolean; multipleWithholding: boolean; tags: boolean; warehouse: boolean }
  lines: { product: boolean; description: boolean; qty: boolean; rate: boolean; disc: boolean; tax: boolean }
  message: boolean
  memo: boolean
  paymentInfo: boolean
  inNumberShow: boolean
  inNumberType: 'total' | 'balance_due'
  signatureShow: boolean
  footer: boolean
  footnoteShow: boolean
  footnoteText: string
  formatDate: string
}

export function defaultCustomPdf(docType: PdfDocType): CustomPdfSetting {
  return {
    isActive: docType === 'sales_invoice',
    template: PDF_TEMPLATE_IDS[docType][0]!,
    contentSize: 'large',
    titleId: '',
    titleEn: '',
    applyBoth: false,
    logoShow: true,
    logoPosition: 'left',
    company: { name: true, addr: true, email: true, phone: true, web: true, fax: true, taxNo: true },
    contact: { displayName: true, companyName: true, fullName: true, addr: true, phone: true, email: true },
    info: { customerRef: true, otherDpp: false, multipleWithholding: false, tags: true, warehouse: true },
    lines: { product: true, description: true, qty: true, rate: true, disc: true, tax: true },
    message: true,
    memo: false,
    paymentInfo: true,
    inNumberShow: true,
    inNumberType: 'total',
    signatureShow: true,
    footer: true,
    footnoteShow: true,
    footnoteText: '',
    formatDate: PDF_DATE_FORMATS[0]!,
  }
}

// Sample transaction drawn in the preview pane.
export const PDF_PREVIEW_SAMPLE = {
  company: {
    name: TEMPLATE_COMPANY_NAME,
    addr: 'Jl. Jend. Sudirman Kav. 52-53, Senayan, Kebayoran Baru, Jakarta Selatan 12190',
    email: 'finance@centralperk.co.id',
    phone: '021-5098-7766',
    web: 'www.centralperk.co.id',
    fax: '021-5098-7767',
    taxNo: '01.234.567.8-012.000',
  },
  contact: {
    displayName: 'Kopi Kenangan Senayan',
    companyName: 'PT Kopi Kenangan Nusantara',
    fullName: 'Budi Hartono',
    addr: 'Jl. Asia Afrika No. 8, Gelora, Tanah Abang, Jakarta Pusat 10270',
    phone: '0812-8899-1020',
    email: 'budi.hartono@kopikenangan.co.id',
  },
  number: '10021',
  date: { 'DD-MM-YYYY': '28-08-2023', 'DD MMM YYYY': '28 Aug 2023', 'DD MMMM YYYY': '28 August 2023', 'MM/DD/YYYY': '08/28/2023', 'MM-DD-YYYY': '08-28-2023' } as Record<string, string>,
  customerRef: 'PO-KK-2023-0811',
  tags: 'Wholesale',
  warehouse: 'Gudang Cikarang',
  lines: [
    { product: 'BEAN-ARB-1KG', description: 'Arabica Gayo whole bean 1 kg', qty: '20 Pcs', rate: 'Rp 245.000,00', disc: '0%', tax: 'PPN', amount: 'Rp 4.900.000,00' },
    { product: 'BEAN-ROB-1KG', description: 'Robusta Temanggung whole bean 1 kg', qty: '15 Pcs', rate: 'Rp 165.000,00', disc: '5%', tax: 'PPN', amount: 'Rp 2.351.250,00' },
  ],
  total: 'Rp 8.048.887,50',
  balanceDue: 'Rp 8.048.887,50',
  totalInWords: 'Delapan juta empat puluh delapan ribu delapan ratus delapan puluh tujuh rupiah lima puluh sen',
  message: 'Thank you for your business.',
  memo: 'Deliver before 10:00',
}

// ─── WhatsApp templates ─────────────────────────────────────────────────────
export type WhatsappTemplateKey = 'sales_invoice' | 'sales_order'

export interface WhatsappTemplate { message: string; showJurnalLink: boolean }

const WA_DEFAULT_VARS = [
  '[CustomerName]', '[CustomerCompany]', '[TransactionNo]', '[TransactionDate]', '[DueDate]',
  '[CompanyEmail]', '[RemainingAmount]', '[CompanyName]',
]

export const WHATSAPP_TEMPLATE_META: Record<WhatsappTemplateKey, { section: TemplateSection; title: string; variables: string[] }> = {
  sales_invoice: { section: 'whatsapp_sales_invoice_template', title: 'Sales Template Message', variables: [...WA_DEFAULT_VARS, '[InvoiceLink]'] },
  sales_order: { section: 'whatsapp_sales_order_template', title: 'Order Template Message', variables: [...WA_DEFAULT_VARS, '[OrderLink]'] },
}

const WA_DEFAULTS: Record<WhatsappTemplateKey, WhatsappTemplate> = {
  sales_invoice: {
    message: 'Halo [CustomerName], terima kasih atas kepercayaan Anda telah bertransaksi dengan perusahaan kami. Berikut adalah faktur [TransactionNo] sebesar [RemainingAmount]. Silakan lihat detail faktur di sini [InvoiceLink]',
    showJurnalLink: true,
  },
  sales_order: {
    message: 'Halo [CustomerName], terima kasih atas kepercayaan Anda telah bertransaksi dengan perusahaan kami. Berikut adalah faktur [TransactionNo] sebesar [RemainingAmount]. Silakan lihat detail faktur di sini [OrderLink]',
    showJurnalLink: false,
  },
}

// ─── Store ──────────────────────────────────────────────────────────────────
export interface TemplateSettings {
  email: Record<EmailTemplateKey, EmailTemplate>
  pdfSignature: PdfSignatureSettings
  customPdf: Record<PdfDocType, CustomPdfSetting>
  whatsapp: Record<WhatsappTemplateKey, WhatsappTemplate>
}

function defaults(): TemplateSettings {
  return JSON.parse(JSON.stringify({
    email: EMAIL_DEFAULTS,
    pdfSignature: PDF_SIGNATURE_DEFAULTS,
    customPdf: {
      sales_invoice: defaultCustomPdf('sales_invoice'),
      sales_order: defaultCustomPdf('sales_order'),
      sales_quote: defaultCustomPdf('sales_quote'),
      purchase_invoice: defaultCustomPdf('purchase_invoice'),
    },
    whatsapp: WA_DEFAULTS,
  }))
}

export function getTemplateSettings(): TemplateSettings {
  const base = defaults()
  if (!import.meta.client) return base
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<TemplateSettings>
    return {
      email: { ...base.email, ...parsed.email },
      pdfSignature: { ...base.pdfSignature, ...parsed.pdfSignature },
      customPdf: { ...base.customPdf, ...parsed.customPdf },
      whatsapp: { ...base.whatsapp, ...parsed.whatsapp },
    }
  } catch { return base }
}

export function saveTemplateSettings(v: TemplateSettings): void {
  if (!import.meta.client) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch { /* non-fatal */ }
}
