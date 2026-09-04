<script setup lang="ts">
/**
 * ErpStatusBadge — wraps MpBadge (for="tableStatus") with semantic status mapping.
 *
 * Usage:
 *   <ErpStatusBadge status="paid" />
 *   <ErpStatusBadge status="overdue" />
 *
 * Add new statuses to statusConfig below.
 *
 * MpBadge `type` → colour (Pixel — there is NO purple; gray = `announcement`):
 *   completed    → green   (done / positive)
 *   warning      → yellow  (needs attention / in progress)
 *   critical     → red     (error / failure)
 *   announcement → GRAY    (Pixel's neutral badge — Inactive, Closed, Voided, …)
 *   information  → blue    (informational / new)
 */

import { MpBadge } from '@mekari/pixel3'

const props = withDefaults(
  defineProps<{
    status: string
    /** Badge size — 'sm' (table rows, default) or 'md' (page title bar, detail header). */
    size?: 'sm' | 'md'
    /** MpBadge variant. Default 'tableStatus' (table rows); use 'additionalInformation' next to a page-title H1. */
    badgeFor?: string
    /** Explicit label override — keeps the mapped colour but shows this text instead.
     *  Use when the same status value needs different wording per module (e.g. an
     *  'in progress' order reads "In process" but a work order reads "In progress"). */
    label?: string
    /** Explicit colour-type override — keeps the mapped label but uses this MpBadge
     *  type instead. Use when the same status value needs a different colour per
     *  module (e.g. 'pending' reads warning/yellow for Production requests, but
     *  announcement/gray for Purchase orders). */
    type?: 'completed' | 'announcement' | 'information' | 'warning' | 'critical'
  }>(),
  { size: undefined, badgeFor: 'tableStatus', label: undefined, type: undefined },
)

interface StatusConfig { type: string; label: string }

const statusConfig: Record<string, StatusConfig> = {
  // ── completed — green ─────────────────────────────
  paid:       { type: 'completed',    label: 'Paid'       },
  approved:   { type: 'completed',    label: 'Approved'   },
  active:     { type: 'completed',    label: 'Active'     },
  completed:  { type: 'completed',    label: 'Completed'  },
  counted:    { type: 'completed',    label: 'Counted'    },
  verified:   { type: 'completed',    label: 'Verified'   },
  success:    { type: 'completed',    label: 'Success'    },
  delivered:  { type: 'completed',    label: 'Delivered'  },
  invoiced:   { type: 'completed',    label: 'Invoiced'   },
  received:   { type: 'completed',    label: 'Received'   },
  shipped:    { type: 'completed',    label: 'Shipped'    },
  high:       { type: 'completed',    label: 'High'       },
  fulfilled:  { type: 'completed',    label: 'Fulfilled'  },
  ready:      { type: 'completed',    label: 'Ready'      },

  // ── warning — yellow ──────────────────────────────
  open:       { type: 'warning',      label: 'Open'       },
  unpaid:     { type: 'warning',      label: 'Unpaid'     },
  pending:    { type: 'warning',      label: 'Pending'    },
  'in transit':{ type: 'warning',     label: 'In transit' },
  'awaiting arrival':{ type: 'warning', label: 'Awaiting arrival' },
  receiving:  { type: 'warning',      label: 'Receiving'  },
  'ready to pack':{ type: 'warning',  label: 'Ready to pack' },
  'ready to ship':{ type: 'warning',  label: 'Ready to ship' },
  bill:       { type: 'warning',      label: 'Expenses'   },
  'out for delivery':{ type: 'information', label: 'Out for delivery' },
  'pending put-away':{ type: 'warning', label: 'Pending put-away' },
  unbilled:   { type: 'warning',      label: 'Unbilled'   },
  billing:    { type: 'warning',      label: 'Billing'    },
  'in review':{ type: 'warning',      label: 'In review'  },
  'on progress':{ type: 'warning',    label: 'On progress'},
  medium:     { type: 'warning',      label: 'Medium'     },
  recommended:{ type: 'warning',      label: 'Recommended'},

  // ── critical — red ────────────────────────────────
  overdue:    { type: 'critical',     label: 'Overdue'    },
  rejected:   { type: 'critical',     label: 'Rejected'   },
  failed:     { type: 'critical',     label: 'Failed'     },
  expired:    { type: 'critical',     label: 'Expired'    },
  error:      { type: 'critical',     label: 'Error'      },
  declined:   { type: 'critical',     label: 'Declined'   },
  low:        { type: 'critical',     label: 'Low'        },
  'needs review':{ type: 'critical',  label: 'Needs review' },

  // ── announcement — GRAY (neutral / final / inactive) ──
  draft:      { type: 'announcement', label: 'Draft'      },
  'awaiting approval':{ type: 'announcement', label: 'Draft' },
  closed:     { type: 'announcement', label: 'Closed'     },
  voided:     { type: 'announcement', label: 'Voided'     },
  'awaiting invoice': { type: 'warning', label: 'Awaiting invoice' },
  inactive:   { type: 'announcement', label: 'Inactive'   },
  archived:   { type: 'announcement', label: 'Archived'   },
  archived:   { type: 'announcement', label: 'Archived'   },
  cancelled:  { type: 'announcement', label: 'Cancelled'  },
  canceled:   { type: 'announcement', label: 'Canceled'   },
  'not started':{ type: 'announcement', label: 'Not started' },
  'not allocated':{ type: 'announcement', label: 'Not allocated' },
  not_started:{ type: 'warning',      label: 'Open'        },
  'to do':    { type: 'announcement', label: 'To do'      },
  setup:      { type: 'announcement', label: 'Setup'      },
  direct:     { type: 'announcement', label: 'Direct'     },
  unclassified:{ type: 'announcement', label: 'Other documents' },

  // ── completed — green ─────────────────────────────
  receipt:    { type: 'completed',    label: 'Payment receipt' },

  // ── information — blue ────────────────────────────
  invoice:    { type: 'information',  label: 'Invoice'    },
  'partially processed': { type: 'information', label: 'Partially processed' },
  'partially-processed': { type: 'information', label: 'Partially processed' },
  'partially produced': { type: 'warning', label: 'Partially produced' },
  'partially completed': { type: 'information', label: 'Partially completed' },
  'partially received': { type: 'information', label: 'Partially received' },
  'partial reception': { type: 'information', label: 'Partial reception' },
  'partially picked': { type: 'information', label: 'Partially picked' },
  'partially packed': { type: 'information', label: 'Partially packed' },
  'partially shipped': { type: 'information', label: 'Partially shipped' },
  'partially fulfilled': { type: 'information', label: 'Partially fulfilled' },
  'in progress':{ type: 'information',  label: 'In progress' },
  in_progress:{ type: 'information',  label: 'In progress' },
  'task created':{ type: 'information', label: 'Task created' },
  new:        { type: 'information',  label: 'New'        },
  beta:       { type: 'information',  label: 'Beta'       },
  vip:        { type: 'information',  label: 'VIP'        },
  featured:   { type: 'information',  label: 'Featured'   },
}

const config = computed<StatusConfig>(() => {
  const key = props.status?.toLowerCase() ?? ''
  const base = statusConfig[key] ?? { type: 'information', label: props.status }
  return { ...base, ...(props.label ? { label: props.label } : {}), ...(props.type ? { type: props.type } : {}) }
})
</script>

<template>
  <MpBadge :for="badgeFor" :type="config.type" :size="size">
    {{ config.label }}
  </MpBadge>
</template>
