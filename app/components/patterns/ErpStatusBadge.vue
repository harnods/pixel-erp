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

  // ── warning — yellow ──────────────────────────────
  open:       { type: 'warning',      label: 'Open'       },
  pending:    { type: 'warning',      label: 'Pending'    },
  draft:      { type: 'warning',      label: 'Draft'      },
  'in review':{ type: 'warning',      label: 'In review'  },
  'on progress':{ type: 'warning',    label: 'On progress'},

  // ── critical — red ────────────────────────────────
  overdue:    { type: 'critical',     label: 'Overdue'    },
  rejected:   { type: 'critical',     label: 'Rejected'   },
  failed:     { type: 'critical',     label: 'Failed'     },
  expired:    { type: 'critical',     label: 'Expired'    },
  error:      { type: 'critical',     label: 'Error'      },

  // ── announcement — GRAY (neutral / final / inactive) ──
  closed:     { type: 'announcement', label: 'Closed'     },
  voided:     { type: 'announcement', label: 'Voided'     },
  inactive:   { type: 'announcement', label: 'Inactive'   },
  archived:   { type: 'announcement', label: 'Archived'   },
  cancelled:  { type: 'announcement', label: 'Cancelled'  },
  'not started':{ type: 'announcement', label: 'Not started' },

  // ── information — blue ────────────────────────────
  'partially processed': { type: 'information', label: 'Partially processed' },
  unbilled:   { type: 'information',  label: 'Unbilled'   },
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
