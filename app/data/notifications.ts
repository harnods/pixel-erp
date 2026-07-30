export interface NotificationField {
  label: string
  value: string
  sub?: string
  /** Renders the value in the danger color (e.g. "Overdue by" day counts). */
  danger?: boolean
}

export interface NotificationAction {
  label: string
  primary?: boolean
}

export interface Notification {
  id: string
  /** Bold title shown in the list row. */
  title: string
  /** Secondary preview line shown in the list row (2-line clamp). */
  preview: string
  /** Section this row is grouped under — "Today", "Last 7 days", or a month label. */
  group: string
  /** Relative/short label shown at the right of the list row ("Just now", "5 mins ago", "26 Feb"). */
  timeLabel: string
  /** Full date-time shown in the detail pane header. */
  timestamp: string
  unread: boolean
  detail: {
    heading: string
    description: string
    fields: NotificationField[]
    actions: NotificationAction[]
  }
}

export const notifications: Notification[] = [
  // ── Today ──────────────────────────────────────────────────────────────
  {
    id: 'n-01',
    title: 'Import successful',
    preview: '240 sales invoices have been successfully added to the sales invoice list.',
    group: 'Today',
    timeLabel: 'Just now',
    timestamp: '29 Jul 2026, 09:40',
    unread: true,
    detail: {
      heading: 'Sales invoices import completed',
      description: '240 sales invoices have been successfully added to the sales invoice list.',
      fields: [
        { label: 'Imported by', value: 'Cinta Ayu', sub: 'CP070 | Accounting' },
        { label: 'Import started', value: '29 Jul 2026, 09:35' },
        { label: 'Import completed', value: '29 Jul 2026, 09:40' },
        { label: 'Source file', value: 'SalesInvoice_July_2026.xlsx' },
      ],
      actions: [
        { label: 'View sales invoice', primary: true },
        { label: 'View import list' },
      ],
    },
  },
  {
    id: 'n-02',
    title: 'Green Beans Arabica Gayo Grade 1 is out of stock',
    preview: 'Green Beans Arabica Gayo Grade 1 (SKU: GB-GYO-01) is currently out of stock in Jababeka 1 warehouse.',
    group: 'Today',
    timeLabel: '10 mins ago',
    timestamp: '29 Jul 2026, 09:30',
    unread: true,
    detail: {
      heading: 'Green Beans Arabica Gayo Grade 1 is out of stock',
      description: 'This product has reached zero available stock. Sales orders containing this item can no longer be fulfilled until stock is replenished.',
      fields: [
        { label: 'Product', value: 'Green Beans Arabica Gayo Grade 1', sub: 'SKU: GB-GYO-01' },
        { label: 'Warehouse', value: 'Jababeka 1' },
        { label: 'On hand qty', value: '0 kg' },
        { label: 'Available qty', value: '0 kg' },
        { label: 'Detected at', value: '29 Jul 2026, 09:30' },
      ],
      actions: [
        { label: 'View product', primary: true },
      ],
    },
  },

  {
    id: 'n-14',
    title: 'Multiple withholding migration in progress',
    preview: 'We’ll send an in-app notification when it’s ready.',
    group: 'Today',
    timeLabel: '35 mins ago',
    timestamp: '29 Jul 2026, 09:15',
    unread: true,
    detail: {
      heading: 'Multiple withholding migration in progress',
      description: 'We’ll send an in-app notification when it’s ready.',
      fields: [
        { label: 'Requested by', value: 'Cinta Ayu', sub: 'CP070 | Accounting' },
        { label: 'Migration started', value: '29 Jul 2026, 09:15' },
      ],
      actions: [],
    },
  },
  {
    id: 'n-15',
    title: 'Recalculation in progress',
    preview: 'Certain functions in transactions are temporarily unavailable until recalculation is completed.',
    group: 'Today',
    timeLabel: '50 mins ago',
    timestamp: '29 Jul 2026, 08:50',
    unread: true,
    detail: {
      heading: 'Recalculation in progress',
      description: 'Certain functions in transactions are temporarily unavailable until recalculation is completed.',
      fields: [
        { label: 'Requested by', value: 'Rangga Wirawan', sub: 'CP042 | Finance' },
        { label: 'Recalculation started', value: '29 Jul 2026, 08:50' },
      ],
      actions: [],
    },
  },

  // ── Last 7 days ────────────────────────────────────────────────────────
  {
    id: 'n-03',
    title: 'Sales Order #00456 is overdue',
    preview: 'Sales Order #00456 for PT Maju Bersama Indonesia was due on 25 Jul 2026 and has not been fulfilled.',
    group: 'Last 7 days',
    timeLabel: '28 Jul',
    timestamp: '28 Jul 2026, 08:00',
    unread: false,
    detail: {
      heading: 'Sales Order #00456 is overdue',
      description: 'This sales order has passed its delivery due date and has not been fulfilled.',
      fields: [
        { label: 'Customer', value: 'PT Maju Bersama Indonesia' },
        { label: 'Transaction date', value: '18 Jul 2026' },
        { label: 'Due date', value: '25 Jul 2026' },
        { label: 'Overdue by', value: '3 days', danger: true },
        { label: 'Amount', value: 'Rp45.000.000' },
      ],
      actions: [
        { label: 'View sales order', primary: true },
        { label: 'Send reminder' },
      ],
    },
  },
  {
    id: 'n-04',
    title: 'Purchase Order #00089 is overdue',
    preview: 'Purchase Order #00089 to CV Sukses Makmur was expected on 26 Jul 2026 and has not been received.',
    group: 'Last 7 days',
    timeLabel: '27 Jul',
    timestamp: '27 Jul 2026, 08:00',
    unread: false,
    detail: {
      heading: 'Purchase Order #00089 is overdue',
      description: 'This purchase order has passed its expected delivery date and the goods have not arrived.',
      fields: [
        { label: 'Vendor', value: 'CV Sukses Makmur' },
        { label: 'Transaction date', value: '15 Jul 2026' },
        { label: 'Expected date', value: '26 Jul 2026' },
        { label: 'Overdue by', value: '1 day', danger: true },
        { label: 'Amount', value: 'Rp18.200.000' },
      ],
      actions: [
        { label: 'View purchase order', primary: true },
        { label: 'Contact vendor' },
      ],
    },
  },
  {
    id: 'n-16',
    title: 'Recalculation completed',
    preview: 'The cost recalculation for July 2026 has been completed successfully. Updated inventory valuation is now reflected in your reports.',
    group: 'Last 7 days',
    timeLabel: '26 Jul',
    timestamp: '26 Jul 2026, 18:20',
    unread: false,
    detail: {
      heading: 'Recalculation completed',
      description: 'The cost recalculation for July 2026 has been completed successfully. Updated inventory valuation is now reflected in your reports.',
      fields: [
        { label: 'Requested by', value: 'Rangga Wirawan', sub: 'CP042 | Finance' },
        { label: 'Recalculation started', value: '26 Jul 2026, 18:00' },
        { label: 'Recalculation completed', value: '26 Jul 2026, 18:20' },
      ],
      actions: [],
    },
  },
  {
    id: 'n-05',
    title: 'Export successful',
    preview: 'The export of 86 purchase invoices for July 2026 has been completed and is ready to download.',
    group: 'Last 7 days',
    timeLabel: '25 Jul',
    timestamp: '25 Jul 2026, 17:12',
    unread: false,
    detail: {
      heading: 'Purchase invoices export completed',
      description: 'The export of 86 purchase invoices for July 2026 has been completed and is ready to download.',
      fields: [
        { label: 'Exported by', value: 'Rangga Wirawan', sub: 'CP042 | Finance' },
        { label: 'Export started', value: '25 Jul 2026, 17:10' },
        { label: 'Export completed', value: '25 Jul 2026, 17:12' },
        { label: 'File name', value: 'PurchaseInvoice_July_2026.xlsx' },
      ],
      actions: [
        { label: 'Download file', primary: true },
        { label: 'View export list' },
      ],
    },
  },

  {
    id: 'n-17',
    title: 'Multiple withholding migration failed',
    preview: 'The migration could not be completed. 8 records failed validation — check that the withholding tax type and account mapping are correct before retrying.',
    group: 'Last 7 days',
    timeLabel: '24 Jul',
    timestamp: '24 Jul 2026, 14:32',
    unread: false,
    detail: {
      heading: 'Multiple withholding migration failed',
      description: 'The migration could not be completed. 8 records failed validation — check that the withholding tax type and account mapping are correct before retrying.',
      fields: [
        { label: 'Requested by', value: 'Cinta Ayu', sub: 'CP070 | Accounting' },
        { label: 'Migration started', value: '24 Jul 2026, 14:28' },
        { label: 'Migration failed', value: '24 Jul 2026, 14:32' },
      ],
      actions: [
        { label: 'Retry migration', primary: true },
      ],
    },
  },

  // ── Jul (older this month) ────────────────────────────────────────────
  {
    id: 'n-06',
    title: 'Import failed',
    preview: 'The import of stock adjustments from StockAdjustment_July_2026.xlsx could not be completed.',
    group: 'Jul',
    timeLabel: '18 Jul',
    timestamp: '18 Jul 2026, 11:05',
    unread: false,
    detail: {
      heading: 'Stock adjustments import failed',
      description: 'The import could not be completed. 12 rows failed validation — check that product codes and warehouse names match existing records.',
      fields: [
        { label: 'Imported by', value: 'Cinta Ayu', sub: 'CP070 | Accounting' },
        { label: 'Import started', value: '18 Jul 2026, 11:02' },
        { label: 'Import failed', value: '18 Jul 2026, 11:05' },
        { label: 'Source file', value: 'StockAdjustment_July_2026.xlsx' },
      ],
      actions: [
        { label: 'View import list', primary: true },
      ],
    },
  },
  {
    id: 'n-18',
    title: 'Multiple withholding migration completed',
    preview: '214 withholding tax records have been successfully migrated to the updated PPh format. No further action is required.',
    group: 'Jul',
    timeLabel: '16 Jul',
    timestamp: '16 Jul 2026, 10:45',
    unread: false,
    detail: {
      heading: 'Multiple withholding migration completed',
      description: '214 withholding tax records have been successfully migrated to the updated PPh format. No further action is required.',
      fields: [
        { label: 'Requested by', value: 'Cinta Ayu', sub: 'CP070 | Accounting' },
        { label: 'Migration started', value: '16 Jul 2026, 10:30' },
        { label: 'Migration completed', value: '16 Jul 2026, 10:45' },
      ],
      actions: [],
    },
  },
  {
    id: 'n-07',
    title: 'Green Beans Robusta Lampung is running low',
    preview: 'Green Beans Robusta Lampung (SKU: GB-RBL-02) has fallen below its minimum stock threshold in Karawang warehouse.',
    group: 'Jul',
    timeLabel: '15 Jul',
    timestamp: '15 Jul 2026, 14:20',
    unread: false,
    detail: {
      heading: 'Green Beans Robusta Lampung is running low',
      description: 'Current stock has fallen below the minimum threshold set for this product. Consider creating a purchase request to replenish it.',
      fields: [
        { label: 'Product', value: 'Green Beans Robusta Lampung', sub: 'SKU: GB-RBL-02' },
        { label: 'Warehouse', value: 'Karawang' },
        { label: 'On hand qty', value: '38 kg' },
        { label: 'Available qty', value: '22 kg' },
        { label: 'Minimum stock', value: '50 kg' },
      ],
      actions: [
        { label: 'View product', primary: true },
      ],
    },
  },
  {
    id: 'n-08',
    title: 'Sales Invoice #00512 is overdue',
    preview: 'Sales Invoice #00512 for PT Cahaya Abadi Sentosa was due on 8 Jul 2026 and remains unpaid.',
    group: 'Jul',
    timeLabel: '12 Jul',
    timestamp: '12 Jul 2026, 08:00',
    unread: false,
    detail: {
      heading: 'Sales Invoice #00512 is overdue',
      description: 'This invoice has passed its payment due date and remains unpaid.',
      fields: [
        { label: 'Customer', value: 'PT Cahaya Abadi Sentosa' },
        { label: 'Invoice date', value: '24 Jun 2026' },
        { label: 'Due date', value: '8 Jul 2026' },
        { label: 'Overdue by', value: '4 days', danger: true },
        { label: 'Amount due', value: 'Rp120.000.000' },
      ],
      actions: [
        { label: 'View sales invoice', primary: true },
        { label: 'Send reminder' },
      ],
    },
  },
  {
    id: 'n-09',
    title: 'Work Order #00023 is not started yet',
    preview: 'Work Order #00023 for Green Beans Arabica Toraja Sapan was scheduled to start on 8 Jul 2026 but has not begun.',
    group: 'Jul',
    timeLabel: '10 Jul',
    timestamp: '10 Jul 2026, 08:00',
    unread: false,
    detail: {
      heading: 'Work Order #00023 is not started yet',
      description: 'This work order has passed its planned start date without any production activity logged.',
      fields: [
        { label: 'Product', value: 'Green Beans Arabica Toraja Sapan' },
        { label: 'Assigned to', value: 'Fajar Nugroho' },
        { label: 'Planned start date', value: '8 Jul 2026' },
        { label: 'Warehouse', value: 'Cikarang' },
      ],
      actions: [
        { label: 'View work order', primary: true },
      ],
    },
  },

  // ── Jun ────────────────────────────────────────────────────────────────
  {
    id: 'n-10',
    title: 'Export failed',
    preview: 'The export of sales deliveries for June 2026 could not be completed due to a server timeout.',
    group: 'Jun',
    timeLabel: '28 Jun',
    timestamp: '28 Jun 2026, 16:48',
    unread: false,
    detail: {
      heading: 'Sales deliveries export failed',
      description: 'The export could not be completed due to a server timeout. Please try again — if the problem persists, contact support.',
      fields: [
        { label: 'Exported by', value: 'Rangga Wirawan', sub: 'CP042 | Finance' },
        { label: 'Export started', value: '28 Jun 2026, 16:45' },
        { label: 'Export failed', value: '28 Jun 2026, 16:48' },
        { label: 'File name', value: 'SalesDelivery_June_2026.xlsx' },
      ],
      actions: [
        { label: 'Retry export', primary: true },
        { label: 'View export list' },
      ],
    },
  },
  {
    id: 'n-19',
    title: 'Recalculation failed',
    preview: 'The cost recalculation could not be completed due to a data conflict — a stock adjustment was made in Karawang warehouse while the recalculation was running. Resolve the conflict and retry.',
    group: 'Jun',
    timeLabel: '22 Jun',
    timestamp: '22 Jun 2026, 09:12',
    unread: false,
    detail: {
      heading: 'Recalculation failed',
      description: 'The cost recalculation could not be completed due to a data conflict — a stock adjustment was made in Karawang warehouse while the recalculation was running. Resolve the conflict and retry.',
      fields: [
        { label: 'Requested by', value: 'Rangga Wirawan', sub: 'CP042 | Finance' },
        { label: 'Recalculation started', value: '22 Jun 2026, 09:00' },
        { label: 'Recalculation failed', value: '22 Jun 2026, 09:12' },
      ],
      actions: [
        { label: 'Retry recalculation', primary: true },
      ],
    },
  },
  {
    id: 'n-11',
    title: 'Purchase Order #00071 is overdue',
    preview: 'Purchase Order #00071 to PT Teknologi Nusantara was expected on 15 Jun 2026 and has not been received.',
    group: 'Jun',
    timeLabel: '20 Jun',
    timestamp: '20 Jun 2026, 08:00',
    unread: false,
    detail: {
      heading: 'Purchase Order #00071 is overdue',
      description: 'This purchase order has passed its expected delivery date and the goods have not arrived.',
      fields: [
        { label: 'Vendor', value: 'PT Teknologi Nusantara' },
        { label: 'Transaction date', value: '2 Jun 2026' },
        { label: 'Expected date', value: '15 Jun 2026' },
        { label: 'Overdue by', value: '5 days', danger: true },
        { label: 'Amount', value: 'Rp32.750.000' },
      ],
      actions: [
        { label: 'View purchase order', primary: true },
        { label: 'Contact vendor' },
      ],
    },
  },
  {
    id: 'n-12',
    title: 'Import successful',
    preview: '312 products were successfully added to the product catalog.',
    group: 'Jun',
    timeLabel: '14 Jun',
    timestamp: '14 Jun 2026, 10:02',
    unread: false,
    detail: {
      heading: 'Product catalog import completed',
      description: '312 products were successfully added to the product catalog.',
      fields: [
        { label: 'Imported by', value: 'Cinta Ayu', sub: 'CP070 | Accounting' },
        { label: 'Import started', value: '14 Jun 2026, 09:58' },
        { label: 'Import completed', value: '14 Jun 2026, 10:02' },
        { label: 'Source file', value: 'ProductCatalog_2026.xlsx' },
      ],
      actions: [
        { label: 'View products', primary: true },
        { label: 'View import list' },
      ],
    },
  },
  {
    id: 'n-13',
    title: 'Sales Order #00398 is overdue',
    preview: 'Sales Order #00398 for PT Sinar Harapan Bangsa was due on 1 Jun 2026 and has not been fulfilled.',
    group: 'Jun',
    timeLabel: '5 Jun',
    timestamp: '5 Jun 2026, 08:00',
    unread: false,
    detail: {
      heading: 'Sales Order #00398 is overdue',
      description: 'This sales order has passed its delivery due date and has not been fulfilled.',
      fields: [
        { label: 'Customer', value: 'PT Sinar Harapan Bangsa' },
        { label: 'Transaction date', value: '22 May 2026' },
        { label: 'Due date', value: '1 Jun 2026' },
        { label: 'Overdue by', value: '4 days', danger: true },
        { label: 'Amount', value: 'Rp55.000.000' },
      ],
      actions: [
        { label: 'View sales order', primary: true },
        { label: 'Send reminder' },
      ],
    },
  },
]
