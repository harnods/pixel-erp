<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { formatDate, formatDateLong, formatDateTimeLong } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import { xpmTrips, xpmBadgeType, type XpmTrip } from '~/data/xpm'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()

// Look up by code or id; always fall back to the first trip so the page renders.
const trip = computed<XpmTrip>(
  () => xpmTrips.find((tr) => tr.code === props.orderId || tr.id === props.orderId) ?? xpmTrips[0]!,
)

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

function goBack() { router.push('/xpm-trips') }
function exportPdf() { infoToast('Export PDF — coming soon') }
function comingSoon() { infoToast('This action is coming soon') }
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Trips</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ trip.name }}</h1>
          <ErpStatusBadge :status="trip.bookingStatus" :label="trip.bookingStatus" :type="xpmBadgeType(trip.bookingStatus)" badge-for="additionalInformation" size="md" />
        </div>
      </div>
      <button class="btn-enterprise btn-enterprise--secondary" @click="exportPdf">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Export PDF
      </button>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">
      <p class="xpm-subtitle">{{ trip.code }} · requested {{ formatDateLong(trip.requestDate) }}</p>

      <div class="xpm-body">
        <!-- LEFT column -->
        <div class="xpm-col-main">

          <!-- Trip information -->
          <section class="xpm-card">
            <h2 class="xpm-card-title">Trip information</h2>
            <div class="xpm-info-grid">
              <ContentList label="Trip type" :value="trip.tripType" />
              <ContentList label="Booking option" value="Company" />
              <ContentList label="Account" value="Main account" />
              <ContentList label="Trip date" :value="`${formatDate(trip.tripDate)} (2 days)`" />
              <ContentList label="Purpose of trip" value="Client visit" />
              <ContentList label="Destination" :value="trip.destination" />
            </div>
          </section>

          <!-- Transportation -->
          <section class="xpm-card">
            <h2 class="xpm-card-title">Transportation</h2>
            <div class="xpm-info-grid">
              <ContentList label="From" value="Jakarta (CGK)" />
              <ContentList label="To" :value="trip.destination" />
              <ContentList label="Departure" :value="formatDate(trip.tripDate)" />
              <ContentList label="Return" :value="formatDate(trip.tripDate)" />
            </div>
            <div class="xpm-card-actions">
              <button class="btn-enterprise btn-enterprise--ghost" @click="comingSoon">Book via OTA</button>
              <button class="btn-enterprise btn-enterprise--ghost" @click="comingSoon">Attach document</button>
            </div>
          </section>

          <!-- Cash advance -->
          <section class="xpm-card">
            <h2 class="xpm-card-title">Cash advance</h2>
            <table class="xpm-table">
              <thead>
                <tr>
                  <th class="xpm-th">Category</th>
                  <th class="xpm-th">Description</th>
                  <th class="xpm-th xpm-th--num">Requested</th>
                  <th class="xpm-th xpm-th--num">Approved</th>
                </tr>
              </thead>
              <tbody>
                <tr class="xpm-row">
                  <td class="xpm-td">Per diem</td>
                  <td class="xpm-td xpm-td--muted">Meals</td>
                  <td class="xpm-td xpm-td--num">Rp50.000</td>
                  <td class="xpm-td xpm-td--num">Rp50.000</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="xpm-total-row">
                  <td class="xpm-td xpm-td--total">Total cash advance</td>
                  <td class="xpm-td"></td>
                  <td class="xpm-td"></td>
                  <td class="xpm-td xpm-td--num xpm-td--total">Rp50.000</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <!-- Trip expenses -->
          <section class="xpm-card">
            <h2 class="xpm-card-title">Trip expenses · report</h2>
            <p class="xpm-empty">Trip report not submitted yet — expenses appear here after settlement.</p>
          </section>
        </div>

        <!-- RIGHT column -->
        <div class="xpm-col-side">

          <!-- Requester -->
          <section class="xpm-card">
            <div class="xpm-requester">
              <span class="xpm-avatar">{{ initials(trip.requestBy) }}</span>
              <div class="xpm-requester-meta">
                <span class="xpm-requester-name">{{ trip.requestBy }}</span>
                <span class="xpm-requester-role">Requester</span>
              </div>
            </div>
            <dl class="xpm-meta-list">
              <div class="xpm-meta-row"><dt>Department</dt><dd>Sales</dd></div>
              <div class="xpm-meta-row"><dt>Email</dt><dd>{{ trip.requestBy.split(' ')[0]!.toLowerCase() }}@mekari.com</dd></div>
              <div class="xpm-meta-row"><dt>Phone</dt><dd>+62 812 3456 7890</dd></div>
            </dl>
          </section>

          <!-- Trip status timeline -->
          <section class="xpm-card">
            <h2 class="xpm-card-title">Trip status</h2>
            <ol class="xpm-timeline">
              <li class="xpm-tl-item">
                <span class="xpm-tl-dot xpm-tl-dot--warning" />
                <div class="xpm-tl-body">
                  <span class="xpm-tl-title">Booking pending</span>
                  <span class="xpm-tl-sub">Awaiting travel desk confirmation</span>
                </div>
              </li>
              <li class="xpm-tl-item">
                <span class="xpm-tl-dot xpm-tl-dot--done" />
                <div class="xpm-tl-body">
                  <span class="xpm-tl-title">Approved by Rizal Candra</span>
                  <span class="xpm-tl-sub">{{ formatDateTimeLong(trip.requestDate) }}</span>
                </div>
              </li>
              <li class="xpm-tl-item">
                <span class="xpm-tl-dot xpm-tl-dot--done" />
                <div class="xpm-tl-body">
                  <span class="xpm-tl-title">Requested by {{ trip.requestBy }}</span>
                  <span class="xpm-tl-sub">{{ formatDateTimeLong(trip.requestDate) }}</span>
                </div>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* ── Title bar (72px, neutral-subtle, breadcrumb above H1 no gap) ── */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start;
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm, 16px);
  font-family: inherit;
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Stage ── */
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
}
.xpm-subtitle { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Two-column body ── */
.xpm-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--mp-spacing-6); align-items: start; }
.xpm-col-main, .xpm-col-side { display: flex; flex-direction: column; gap: var(--mp-spacing-6); min-width: 0; }

/* ── Card ── */
.xpm-card {
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 8px);
  background: var(--mp-background-canvas, #fff);
  padding: var(--mp-spacing-5);
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
}
.xpm-card-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.xpm-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); }
.xpm-card-actions { display: flex; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-2); }
.xpm-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Table ── */
.xpm-table { width: 100%; border-collapse: collapse; }
.xpm-th {
  height: 28px; text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.xpm-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.xpm-td {
  height: 40px;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-lg, 20px); vertical-align: middle;
}
.xpm-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.xpm-td--muted { color: var(--mp-text-secondary); }
.xpm-td--total { font-weight: var(--mp-font-weights-semi-bold); }
.xpm-row .xpm-td { border-bottom: 1px solid var(--mp-border-default); }
.xpm-total-row .xpm-td { border-top: 1px solid var(--mp-border-bold, #758195); }

/* ── Requester ── */
.xpm-requester { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.xpm-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); flex-shrink: 0;
}
.xpm-requester-meta { display: flex; flex-direction: column; }
.xpm-requester-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.xpm-requester-role { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.xpm-meta-list { margin: var(--mp-spacing-3) 0 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.xpm-meta-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-3); }
.xpm-meta-row dt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.xpm-meta-row dd { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* ── Timeline ── */
.xpm-timeline { list-style: none; margin: var(--mp-spacing-1) 0 0; padding: 0; display: flex; flex-direction: column; }
.xpm-tl-item { position: relative; display: flex; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-4); }
.xpm-tl-item:not(:last-child)::before {
  content: ''; position: absolute; left: 4px; top: 14px; bottom: 0;
  width: 1px; background: var(--mp-border-default);
}
.xpm-tl-dot { width: 9px; height: 9px; border-radius: 999px; margin-top: 5px; flex-shrink: 0; z-index: 1; }
.xpm-tl-dot--warning { background: var(--mp-background-warning-bold, #d99a00); }
.xpm-tl-dot--done { background: var(--mp-background-brand-bold, #029861); }
.xpm-tl-body { display: flex; flex-direction: column; }
.xpm-tl-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.xpm-tl-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
