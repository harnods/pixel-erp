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
 * MpBadge type mapping (from DESIGN.md):
 *   completed   → Paid, Approved, Active, Completed
 *   warning     → Open, Pending, Draft, In Review
 *   critical    → Overdue, Rejected, Failed, Voided
 *   information → Inactive, Archived, Cancelled
 *   announcement→ New, Beta, VIP, Featured
 */

import { MpBadge } from '@mekari/pixel3'

const props = withDefaults(
  defineProps<{
    status: string
    size?: 'sm' | 'md'
    badgeFor?: string
  }>(),
  { size: undefined, badgeFor: 'tableStatus' },
)

interface StatusConfig { type: string; label: string }

const statusConfig: Record<string, StatusConfig> = {
  // ── Completed (green) ─────────────────────────────
  paid:       { type: 'completed',    label: 'Paid'       },
  approved:   { type: 'completed',    label: 'Approved'   },
  active:     { type: 'completed',    label: 'Active'     },
  completed:  { type: 'completed',    label: 'Completed'  },
  verified:   { type: 'completed',    label: 'Verified'   },
  success:    { type: 'completed',    label: 'Success'    },

  // ── Warning (yellow) ──────────────────────────────
  open:       { type: 'warning',      label: 'Open'       },
  pending:    { type: 'warning',      label: 'Pending'    },
  'partially-processed': { type: 'warning', label: 'Partially processed' },
  'in review':{ type: 'warning',      label: 'In review'  },
  'on progress':{ type: 'warning',    label: 'On progress'},
  'in progress':{ type: 'warning',    label: 'In progress'},
  'awaiting approval':{ type: 'warning', label: 'Awaiting approval' },

  // ── Critical (red) ────────────────────────────────
  overdue:    { type: 'critical',     label: 'Overdue'    },
  rejected:   { type: 'critical',     label: 'Rejected'   },
  failed:     { type: 'critical',     label: 'Failed'     },
  voided:     { type: 'critical',     label: 'Voided'     },
  expired:    { type: 'critical',     label: 'Expired'    },
  error:      { type: 'critical',     label: 'Error'      },

  // ── Information (gray/blue) ───────────────────────
  inactive:   { type: 'information',  label: 'Inactive'   },
  archived:   { type: 'information',  label: 'Archived'   },
  cancelled:  { type: 'information',  label: 'Cancelled'  },
  'not started':{ type: 'information',label: 'Not started'},

  // ── Announcement (purple) ─────────────────────────
  new:        { type: 'announcement', label: 'New'        },
  beta:       { type: 'announcement', label: 'Beta'       },
  vip:        { type: 'announcement', label: 'VIP'        },
  featured:   { type: 'announcement', label: 'Featured'   },
  draft:      { type: 'announcement', label: 'Draft'      },
  closed:     { type: 'announcement', label: 'Closed'     },
}

const config = computed<StatusConfig>(() => {
  const key = props.status?.toLowerCase() ?? ''
  return statusConfig[key] ?? { type: 'information', label: props.status }
})
</script>

<template>
  <MpBadge :for="props.badgeFor" :size="props.size" :type="config.type">
    {{ config.label }}
  </MpBadge>
</template>
