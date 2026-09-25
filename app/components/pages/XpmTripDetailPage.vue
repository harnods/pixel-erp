<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { MpButton, MpIcon, css } from '@mekari/pixel3'
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
function exportPdf() { infoToast('Export PDF · coming soon') }
function comingSoon() { infoToast('This action is coming soon') }

// ── css() style definitions ──

const detailPageStyle = css({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  minHeight: '0',
  overflow: 'hidden',
})

const detailBarStyle = css({
  flexShrink: '0',
  height: '72px',
  boxSizing: 'border-box',
  bg: 'background.neutral.subtle',
  paddingX: '6',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '4',
})

const detailBarLeftStyle = css({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '0',
  minWidth: '0',
})

const breadcrumbOverrides = css({
  alignSelf: 'flex-start',
  padding: '0',
  minWidth: '0',
  height: 'auto',
  color: 'text.link',
  fontSize: 'sm',
  lineHeight: '16px',
})

const detailTitlerowLeftStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
})

const detailTitleStyle = css({
  margin: '0',
  fontSize: '2xl',
  fontWeight: 'semiBold',
  lineHeight: '32px',
  letterSpacing: '-0.2px',
  color: 'text.default',
  whiteSpace: 'nowrap',
})

const detailStageStyle = css({
  flex: '1',
  minHeight: '0',
  overflowY: 'auto',
  overflowX: 'hidden',
  bg: 'background.stage',
  borderRadius: 'xl xl 0 0',
  paddingX: '6',
  paddingBottom: '6',
  borderTop: `24px solid token(colors.background.stage)`,
  display: 'flex',
  flexDirection: 'column',
  gap: '5',
})

const xpmSubtitleStyle = css({
  margin: '0',
  fontSize: 'md',
  color: 'text.secondary',
})

const xpmBodyStyle = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 340px',
  gap: '6',
  alignItems: 'start',
})

const xpmColStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6',
  minWidth: '0',
})

const xpmCardStyle = css({
  border: `1px solid token(colors.border.default)`,
  rounded: 'lg',
  bg: 'background.canvas',
  padding: '5',
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
})

const xpmCardTitleStyle = css({
  margin: '0 0 4px',
  fontSize: 'lg',
  fontWeight: 'semiBold',
  color: 'text.default',
})

const xpmInfoGridStyle = css({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  columnGap: '6',
})

const xpmCardActionsStyle = css({
  display: 'flex',
  gap: '3',
  paddingTop: '2',
})

const xpmEmptyStyle = css({
  margin: '0',
  fontSize: 'md',
  color: 'text.secondary',
})

const xpmTableStyle = css({
  width: '100%',
  borderCollapse: 'collapse',
})

const xpmThStyle = css({
  height: '28px',
  textAlign: 'left',
  paddingTop: '1',
  paddingBottom: '1',
  paddingRight: '4',
  paddingLeft: '2',
  bg: 'background.neutral.subtle',
  fontSize: 'sm',
  fontWeight: 'semiBold',
  color: 'text.secondary',
  textTransform: 'uppercase',
  borderBottom: `1px solid token(colors.border.default)`,
  whiteSpace: 'nowrap',
})

const xpmThNumStyle = css({
  height: '28px',
  textAlign: 'right',
  paddingTop: '1',
  paddingBottom: '1',
  paddingRight: '2',
  paddingLeft: '4',
  bg: 'background.neutral.subtle',
  fontSize: 'sm',
  fontWeight: 'semiBold',
  color: 'text.secondary',
  textTransform: 'uppercase',
  borderBottom: `1px solid token(colors.border.default)`,
  whiteSpace: 'nowrap',
})

const xpmTdStyle = css({
  height: '40px',
  paddingTop: '1.5',
  paddingBottom: '1.5',
  paddingRight: '4',
  paddingLeft: '2',
  fontSize: 'md',
  color: 'text.default',
  lineHeight: '20px',
  verticalAlign: 'middle',
})

const xpmTdNumStyle = css({
  height: '40px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  paddingTop: '1.5',
  paddingBottom: '1.5',
  paddingRight: '2',
  paddingLeft: '4',
  fontSize: 'md',
  color: 'text.default',
  lineHeight: '20px',
  verticalAlign: 'middle',
})

const xpmTdMutedStyle = css({
  height: '40px',
  paddingTop: '1.5',
  paddingBottom: '1.5',
  paddingRight: '4',
  paddingLeft: '2',
  fontSize: 'md',
  color: 'text.secondary',
  lineHeight: '20px',
  verticalAlign: 'middle',
})

const xpmTdTotalStyle = css({
  height: '40px',
  paddingTop: '1.5',
  paddingBottom: '1.5',
  paddingRight: '4',
  paddingLeft: '2',
  fontSize: 'md',
  color: 'text.default',
  fontWeight: 'semiBold',
  lineHeight: '20px',
  verticalAlign: 'middle',
})

const xpmTdNumTotalStyle = css({
  height: '40px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  paddingTop: '1.5',
  paddingBottom: '1.5',
  paddingRight: '2',
  paddingLeft: '4',
  fontSize: 'md',
  color: 'text.default',
  fontWeight: 'semiBold',
  lineHeight: '20px',
  verticalAlign: 'middle',
})

const xpmRequesterStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
})

const xpmAvatarStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  height: '40px',
  rounded: 'full',
  bg: 'background.neutral.subtle',
  color: 'text.default',
  fontSize: 'md',
  fontWeight: 'semiBold',
  flexShrink: '0',
})

const xpmRequesterMetaStyle = css({
  display: 'flex',
  flexDirection: 'column',
})

const xpmRequesterNameStyle = css({
  fontSize: 'md',
  fontWeight: 'semiBold',
  color: 'text.default',
})

const xpmRequesterRoleStyle = css({
  fontSize: 'sm',
  color: 'text.secondary',
})

const xpmMetaListStyle = css({
  marginTop: '3',
  marginBottom: '0',
  marginLeft: '0',
  marginRight: '0',
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
})

const xpmMetaRowStyle = css({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '3',
})

const xpmMetaDtStyle = css({
  fontSize: 'md',
  color: 'text.secondary',
})

const xpmMetaDdStyle = css({
  margin: '0',
  fontSize: 'md',
  color: 'text.default',
})

const xpmTimelineStyle = css({
  listStyle: 'none',
  marginTop: '1',
  marginBottom: '0',
  marginLeft: '0',
  marginRight: '0',
  padding: '0',
  display: 'flex',
  flexDirection: 'column',
})

const xpmTlItemStyle = css({
  position: 'relative',
  display: 'flex',
  gap: '3',
  paddingBottom: '4',
})

const xpmTlDotBaseStyle = css({
  width: '9px',
  height: '9px',
  rounded: 'full',
  marginTop: '5px',
  flexShrink: '0',
  zIndex: '1',
})

const xpmTlDotWarningStyle = css({
  width: '9px',
  height: '9px',
  rounded: 'full',
  marginTop: '5px',
  flexShrink: '0',
  zIndex: '1',
  bg: 'background.warning.bold',
})

const xpmTlDotDoneStyle = css({
  width: '9px',
  height: '9px',
  rounded: 'full',
  marginTop: '5px',
  flexShrink: '0',
  zIndex: '1',
  bg: 'background.brand.bold',
})

const xpmTlBodyStyle = css({
  display: 'flex',
  flexDirection: 'column',
})

const xpmTlTitleStyle = css({
  fontSize: 'md',
  color: 'text.default',
})

const xpmTlSubStyle = css({
  fontSize: 'sm',
  color: 'text.secondary',
})
</script>

<template>
  <div :class="detailPageStyle">

    <!-- ── Title bar ── -->
    <header :class="detailBarStyle">
      <div :class="detailBarLeftStyle">
        <MpButton variant="ghost" size="sm" :class="breadcrumbOverrides" @click="goBack">Trips</MpButton>
        <div :class="detailTitlerowLeftStyle">
          <h1 :class="detailTitleStyle">{{ trip.name }}</h1>
          <ErpStatusBadge :status="trip.bookingStatus" :label="trip.bookingStatus" :type="xpmBadgeType(trip.bookingStatus)" badge-for="additionalInformation" size="md" />
        </div>
      </div>
      <MpButton variant="secondary" class="btn-enterprise btn-enterprise--secondary" @click="exportPdf">
        <MpIcon name="download" size="sm" />
        Export PDF
      </MpButton>
    </header>

    <!-- ── Scrollable stage ── -->
    <div :class="detailStageStyle">
      <p :class="xpmSubtitleStyle">{{ trip.code }} · requested {{ formatDateLong(trip.requestDate) }}</p>

      <div :class="xpmBodyStyle">
        <!-- LEFT column -->
        <div :class="xpmColStyle">

          <!-- Trip information -->
          <section :class="xpmCardStyle">
            <h2 :class="xpmCardTitleStyle">Trip information</h2>
            <div :class="xpmInfoGridStyle">
              <ContentList label="Trip type" :value="trip.tripType" />
              <ContentList label="Booking option" value="Company" />
              <ContentList label="Account" value="Main account" />
              <ContentList label="Trip date" :value="`${formatDate(trip.tripDate)} (2 days)`" />
              <ContentList label="Purpose of trip" value="Client visit" />
              <ContentList label="Destination" :value="trip.destination" />
            </div>
          </section>

          <!-- Transportation -->
          <section :class="xpmCardStyle">
            <h2 :class="xpmCardTitleStyle">Transportation</h2>
            <div :class="xpmInfoGridStyle">
              <ContentList label="From" value="Jakarta (CGK)" />
              <ContentList label="To" :value="trip.destination" />
              <ContentList label="Departure" :value="formatDate(trip.tripDate)" />
              <ContentList label="Return" :value="formatDate(trip.tripDate)" />
            </div>
            <div :class="xpmCardActionsStyle">
              <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="comingSoon">Book via OTA</MpButton>
              <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="comingSoon">Attach document</MpButton>
            </div>
          </section>

          <!-- Cash advance -->
          <section :class="xpmCardStyle">
            <h2 :class="xpmCardTitleStyle">Cash advance</h2>
            <table :class="xpmTableStyle">
              <thead>
                <tr>
                  <th :class="xpmThStyle">Category</th>
                  <th :class="xpmThStyle">Description</th>
                  <th :class="xpmThNumStyle">Requested</th>
                  <th :class="xpmThNumStyle">Approved</th>
                </tr>
              </thead>
              <tbody>
                <tr class="xpm-row">
                  <td :class="xpmTdStyle">Per diem</td>
                  <td :class="xpmTdMutedStyle">Meals</td>
                  <td :class="xpmTdNumStyle">Rp50.000</td>
                  <td :class="xpmTdNumStyle">Rp50.000</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="xpm-total-row">
                  <td :class="xpmTdTotalStyle">Total cash advance</td>
                  <td :class="xpmTdStyle"></td>
                  <td :class="xpmTdStyle"></td>
                  <td :class="xpmTdNumTotalStyle">Rp50.000</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <!-- Trip expenses -->
          <section :class="xpmCardStyle">
            <h2 :class="xpmCardTitleStyle">Trip expenses · report</h2>
            <p :class="xpmEmptyStyle">Trip report not submitted yet · expenses appear here after settlement.</p>
          </section>
        </div>

        <!-- RIGHT column -->
        <div :class="xpmColStyle">

          <!-- Requester -->
          <section :class="xpmCardStyle">
            <div :class="xpmRequesterStyle">
              <span :class="xpmAvatarStyle">{{ initials(trip.requestBy) }}</span>
              <div :class="xpmRequesterMetaStyle">
                <span :class="xpmRequesterNameStyle">{{ trip.requestBy }}</span>
                <span :class="xpmRequesterRoleStyle">Requester</span>
              </div>
            </div>
            <dl :class="xpmMetaListStyle">
              <div :class="xpmMetaRowStyle"><dt :class="xpmMetaDtStyle">Department</dt><dd :class="xpmMetaDdStyle">Sales</dd></div>
              <div :class="xpmMetaRowStyle"><dt :class="xpmMetaDtStyle">Email</dt><dd :class="xpmMetaDdStyle">{{ trip.requestBy.split(' ')[0]!.toLowerCase() }}@mekari.com</dd></div>
              <div :class="xpmMetaRowStyle"><dt :class="xpmMetaDtStyle">Phone</dt><dd :class="xpmMetaDdStyle">+62 812 3456 7890</dd></div>
            </dl>
          </section>

          <!-- Trip status timeline -->
          <section :class="xpmCardStyle">
            <h2 :class="xpmCardTitleStyle">Trip status</h2>
            <ol :class="xpmTimelineStyle">
              <li :class="xpmTlItemStyle" class="xpm-tl-item">
                <span :class="xpmTlDotWarningStyle" />
                <div :class="xpmTlBodyStyle">
                  <span :class="xpmTlTitleStyle">Booking pending</span>
                  <span :class="xpmTlSubStyle">Awaiting travel desk confirmation</span>
                </div>
              </li>
              <li :class="xpmTlItemStyle" class="xpm-tl-item">
                <span :class="xpmTlDotDoneStyle" />
                <div :class="xpmTlBodyStyle">
                  <span :class="xpmTlTitleStyle">Approved by Rizal Candra</span>
                  <span :class="xpmTlSubStyle">{{ formatDateTimeLong(trip.requestDate) }}</span>
                </div>
              </li>
              <li :class="xpmTlItemStyle" class="xpm-tl-item xpm-tl-item--last">
                <span :class="xpmTlDotDoneStyle" />
                <div :class="xpmTlBodyStyle">
                  <span :class="xpmTlTitleStyle">Requested by {{ trip.requestBy }}</span>
                  <span :class="xpmTlSubStyle">{{ formatDateTimeLong(trip.requestDate) }}</span>
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
/* Timeline connecting line — :not(:last-child)::before cannot be expressed in css() */
.xpm-tl-item:not(.xpm-tl-item--last)::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: 0;
  width: 1px;
  background: var(--mp-border-default);
}

/* Table row borders — compound selectors that need scoped CSS */
.xpm-row td { border-bottom: 1px solid var(--mp-border-default); }
.xpm-total-row td { border-top: 1px solid var(--mp-border-bold, #758195); }
</style>
