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

const props = defineProps<{ status: string }>()

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

  // ── warning — yellow ──────────────────────────────
  open:       { type: 'warning',      label: 'Open'       },
  pending:    { type: 'warning',      label: 'Pending'    },
  draft:      { type: 'warning',      label: 'Draft'      },
  'in transit':{ type: 'warning',     label: 'In transit' },
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
  'not started':{ type: 'announcement', label: 'Not started' },
  direct:     { type: 'announcement', label: 'Direct'     },

  // ── information — blue ────────────────────────────
  'partially processed': { type: 'information', label: 'Partially processed' },
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
  <MpBadge for="tableStatus" :type="config.type">
    {{ config.label }}
  </MpBadge>
</template>
