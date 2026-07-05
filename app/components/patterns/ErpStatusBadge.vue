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
  }>(),
  { size: undefined, badgeFor: 'tableStatus', label: undefined },
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
  draft:      { type: 'warning',      label: 'Draft'      },
  'in transit':{ type: 'warning',     label: 'In transit' },
  'awaiting arrival':{ type: 'warning', label: 'Awaiting arrival' },
  receiving:  { type: 'warning',      label: 'Receiving'  },
  'on the way':{ type: 'warning',     label: 'Open'       },
  'ready to pack':{ type: 'warning',  label: 'Ready to pack' },
  'ready to ship':{ type: 'warning',  label: 'Ready to ship' },
  'pending put-away':{ type: 'warning', label: 'Pending put-away' },
  'pending pick-up':{ type: 'warning', label: 'Pending pick-up' },
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
  closed:     { type: 'announcement', label: 'Closed'     },
  voided:     { type: 'announcement', label: 'Voided'     },
  inactive:   { type: 'announcement', label: 'Inactive'   },
  archived:   { type: 'announcement', label: 'Archived'   },
  cancelled:  { type: 'announcement', label: 'Cancelled'  },
  canceled:   { type: 'announcement', label: 'Canceled'   },
  'not started':{ type: 'announcement', label: 'Not started' },
  'to do':    { type: 'announcement', label: 'To do'      },
  direct:     { type: 'announcement', label: 'Direct'     },

  // ── information — blue ────────────────────────────
  'partially processed': { type: 'information', label: 'Partially processed' },
  'partially produced': { type: 'warning', label: 'Partially produced' },
  'partially completed': { type: 'information', label: 'Partially completed' },
  'partially received': { type: 'information', label: 'Partially received' },
  'partial reception': { type: 'information', label: 'Partial reception' },
  'partially picked': { type: 'information', label: 'Partially picked' },
  'partially packed': { type: 'information', label: 'Partially packed' },
  'partially shipped': { type: 'information', label: 'Partially shipped' },
  'in progress':{ type: 'information',  label: 'In process' },
  new:        { type: 'information',  label: 'New'        },
  beta:       { type: 'information',  label: 'Beta'       },
  vip:        { type: 'information',  label: 'VIP'        },
  featured:   { type: 'information',  label: 'Featured'   },
}

const config = computed<StatusConfig>(() => {
  const key = props.status?.toLowerCase() ?? ''
  const base = statusConfig[key] ?? { type: 'information', label: props.status }
  return props.label ? { ...base, label: props.label } : base
})
</script>

<template>
  <MpBadge :for="badgeFor" :type="config.type" :size="size">
    {{ config.label }}
  </MpBadge>
</template>
