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
  }>(),
  { size: undefined, badgeFor: 'tableStatus' },
)

interface StatusConfig { type: string; label: string }

const statusConfig: Record<string, StatusConfig> = {
  // ── completed — green ─────────────────────────────
  paid:       { type: 'completed',    label: 'Paid'       },
  approved:   { type: 'completed',    label: 'Approved'   },
  active:     { type: 'completed',    label: 'Active'     },
  completed:  { type: 'completed',    label: 'Completed'  },
  verified:   { type: 'completed',    label: 'Verified'   },
  success:    { type: 'completed',    label: 'Success'    },
  delivered:  { type: 'completed',    label: 'Delivered'  },
  invoiced:   { type: 'completed',    label: 'Invoiced'   },
  received:   { type: 'completed',    label: 'Received'   },
  shipped:    { type: 'completed',    label: 'Shipped'    },

  // ── warning — yellow ──────────────────────────────
  open:       { type: 'warning',      label: 'Open'       },
  pending:    { type: 'warning',      label: 'Pending'    },
  draft:      { type: 'announcement', label: 'Draft'      },
  'in transit':{ type: 'warning',     label: 'In transit' },
  'awaiting arrival':{ type: 'warning', label: 'Awaiting arrival' },
  receiving:  { type: 'warning',      label: 'Receiving'  },
  'on the way':{ type: 'warning',     label: 'Open'       },
  'ready to pack':{ type: 'warning',  label: 'Ready to pack' },
  'ready to ship':{ type: 'warning',  label: 'Ready to ship' },
  'pending put-away':{ type: 'warning', label: 'Pending put-away' },
  'ready to ship':{ type: 'warning', label: 'Ready to ship' },
  unbilled:   { type: 'warning',      label: 'Unbilled'   },
  'in review':{ type: 'warning',      label: 'In review'  },
  'on progress':{ type: 'warning',    label: 'On progress'},

  // ── critical — red ────────────────────────────────
  overdue:    { type: 'critical',     label: 'Overdue'    },
  rejected:   { type: 'critical',     label: 'Rejected'   },
  failed:     { type: 'critical',     label: 'Failed'     },
  expired:    { type: 'critical',     label: 'Expired'    },
  error:      { type: 'critical',     label: 'Error'      },
  declined:   { type: 'critical',     label: 'Declined'   },

  // ── announcement — GRAY (neutral / final / inactive) ──
  'awaiting approval':{ type: 'announcement', label: 'Draft' },
  closed:     { type: 'announcement', label: 'Closed'     },
  voided:     { type: 'announcement', label: 'Voided'     },
  inactive:   { type: 'announcement', label: 'Inactive'   },
  archived:   { type: 'announcement', label: 'Archived'   },
  cancelled:  { type: 'announcement', label: 'Cancelled'  },
  canceled:   { type: 'announcement', label: 'Canceled'   },
  'not started':{ type: 'announcement', label: 'Not started' },
  not_started:{ type: 'warning',      label: 'Open'        },
  'to do':    { type: 'announcement', label: 'To do'      },
  direct:     { type: 'announcement', label: 'Direct'     },

  // ── information — blue ────────────────────────────
  'partially processed': { type: 'information', label: 'Partially processed' },
  'partially received': { type: 'information', label: 'Partially received' },
  'partial reception': { type: 'information', label: 'Partial reception' },
  'partially picked': { type: 'information', label: 'Partially picked' },
  'partially packed': { type: 'information', label: 'Partially packed' },
  'partially shipped': { type: 'information', label: 'Partially shipped' },
  'in progress':{ type: 'information',  label: 'In progress' },
  in_progress:{ type: 'information',  label: 'In progress' },
  new:        { type: 'information',  label: 'New'        },
  beta:       { type: 'information',  label: 'Beta'       },
  vip:        { type: 'information',  label: 'VIP'        },
  featured:   { type: 'information',  label: 'Featured'   },
}

const config = computed<StatusConfig>(() => {
  const key = props.status?.toLowerCase() ?? ''
  return statusConfig[key] ?? { type: 'information', label: props.status }
})
</script>

<template>
  <MpBadge :for="badgeFor" :type="config.type" :size="size">
    {{ config.label }}
  </MpBadge>
</template>
