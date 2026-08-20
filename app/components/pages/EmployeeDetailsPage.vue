<script setup lang="ts">
/**
 * HR → Employee details. Read-only employee profile: a title bar with breadcrumb
 * + status + Actions, an "Employee info" summary (photo + field columns), then
 * MpTabs for Personal / Compensation & benefits / Tax & BPJS / Payslips. Mirrors
 * ProductDetailsPage's shell and the venom EmployeeDetailsPage field grouping.
 */
import { ref, computed } from 'vue'
import { infoToast } from '~/utils/toasts'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatDateLong } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import { employees, getEmployee, markResigned, deleteEmployee, deleteFamilyMember, deleteEmergencyContact, deleteEducation, deleteInformalEducation, deleteWorkExperience } from '~/data'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const employee = computed(() => getEmployee(props.orderId))
function goBack() { router.push('/employee-directory') }

// Which profile section to show — driven by the sidebar's level-2 menu (?view=…).
const route = useRoute()
const view = computed(() => (route.query.view as string) || 'personal-data')
// The page title is the current profile section (not the employee name).
const VIEW_TITLES: Record<string, string> = {
  'personal-data': 'Personal data', 'employment-info': 'Employment info', 'additional-info': 'Additional info',
  'time-off': 'Time off', 'attendance': 'Attendance', 'overtime': 'Overtime',
  'benefit-reimbursement': 'Benefit reimbursement', 'cash-advance': 'Cash advance', 'employee-loan': 'Employee loan',
  'payroll-info': 'Payroll info', 'payslip': 'Payslip', 'files': 'Files', 'assets': 'Assets',
  'salary-adjustment': 'Salary adjustment', 'employee-transfer': 'Employee transfer', 'npp': 'NPP', 'reprimand': 'Reprimand',
}
const viewTitle = computed(() => VIEW_TITLES[view.value] ?? 'Employee profile')
// Personal data page-tabs (outside the stage, under the title).
const PERSONAL_TABS = [
  { key: 'basic-info',        label: 'Basic info' },
  { key: 'family',            label: 'Family members' },
  { key: 'emergency-contact', label: 'Emergency contact' },
  { key: 'education',         label: 'Education' },
  { key: 'work-experience',   label: 'Work experience' },
]
const personalTab = ref('basic-info')
// ── Education ────────────────────────────────────────────────────────────────
const educationSearch = ref('')
const education = computed(() => employee.value?.education ?? [])
const filteredEducation = computed(() => {
  const q = educationSearch.value.toLowerCase().trim()
  return education.value.filter((e) => !q || e.institution.toLowerCase().includes(q) || (e.degree ?? '').toLowerCase().includes(q) || (e.fieldOfStudy ?? '').toLowerCase().includes(q))
})
function addEducation() { infoToast('New education — coming soon') }
function editEducation() { infoToast('Edit education — coming soon') }
function removeEducation(id: string, name: string) {
  if (employee.value) { deleteEducation(employee.value.id, id); toast.notify({ variant: 'success', title: `${name} removed` }) }
}

// Informal education (courses / training / certifications)
const informalSearch = ref('')
const informalEducation = computed(() => employee.value?.informalEducation ?? [])
const filteredInformal = computed(() => {
  const q = informalSearch.value.toLowerCase().trim()
  return informalEducation.value.filter((e) => !q || e.name.toLowerCase().includes(q) || (e.organizer ?? '').toLowerCase().includes(q))
})
function addInformal() { infoToast('New informal education — coming soon') }
function editInformal() { infoToast('Edit informal education — coming soon') }
function removeInformal(id: string, name: string) {
  if (employee.value) { deleteInformalEducation(employee.value.id, id); toast.notify({ variant: 'success', title: `${name} removed` }) }
}

// ── Work experience ──────────────────────────────────────────────────────────
const workSearch = ref('')
const workExperience = computed(() => employee.value?.workExperience ?? [])
const filteredWork = computed(() => {
  const q = workSearch.value.toLowerCase().trim()
  return workExperience.value.filter((w) => !q || w.company.toLowerCase().includes(q) || (w.position ?? '').toLowerCase().includes(q))
})
function lengthOfService(startYear: string, endYear: string): string {
  const end = /^\d+$/.test(endYear) ? Number(endYear) : new Date().getFullYear()
  const y = Math.max(0, end - Number(startYear))
  return `${y} ${y === 1 ? t('yr') : t('yrs')}`
}
function addWorkExperience() { infoToast('New work experience — coming soon') }
function editWorkExperience() { infoToast('Edit work experience — coming soon') }
function removeWorkExperience(id: string, name: string) {
  if (employee.value) { deleteWorkExperience(employee.value.id, id); toast.notify({ variant: 'success', title: `${name} removed` }) }
}
// Direct reports = employees whose direct manager is this employee.
const directReports = computed(() => {
  const me = employee.value
  if (!me) return []
  return employees.filter((e) => e.directManager === me.fullName && e.id !== me.id)
})
function goReport(id: string) { router.push(`/employee-directory/${id}`) }
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
}
function hueFor(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

// ── Helpers ────────────────────────────────────────────────────────────────
function ageInYears(iso?: string): number | null {
  if (!iso) return null
  const dob = new Date(iso)
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}
function tenureLabel(iso?: string): string {
  if (!iso) return ''
  const start = new Date(iso)
  const now = new Date()
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  if (now.getDate() < start.getDate()) months--
  if (months < 0) months = 0
  const y = Math.floor(months / 12)
  const mo = months % 12
  const parts: string[] = []
  if (y) parts.push(`${y} ${t(y === 1 ? 'yr' : 'yrs')}`)
  parts.push(`${mo} ${t(mo === 1 ? 'mo' : 'mos')}`)
  return parts.join(' ')
}
const joinValue = computed(() => {
  const e = employee.value
  if (!e?.joinDate) return '—'
  return `${formatDateLong(e.joinDate)} · ${tenureLabel(e.joinDate)}`
})
const dobValue = computed(() => {
  const e = employee.value
  if (!e?.dateOfBirth) return '—'
  const age = ageInYears(e.dateOfBirth)
  return `${formatDateLong(e.dateOfBirth)}${age != null ? ` · ${age} ${t('yrs')}` : ''}`
})
function employmentBadge(v?: string): { type: 'completed' | 'warning' | 'information' | 'announcement'; label: string } {
  const map: Record<string, 'completed' | 'warning' | 'information' | 'announcement'> = {
    Permanent: 'completed', Probation: 'warning', 'Part-time': 'information', Contract: 'announcement',
  }
  return { type: map[v ?? ''] ?? 'announcement', label: v ?? '—' }
}
function yesNo(v?: boolean) { return v ? t('Yes') : t('No') }
function waLink(phone: string) { return `https://wa.me/${phone.replace(/[^0-9]/g, '')}` }
const emailAddress = computed(() => employee.value?.personalEmail || employee.value?.email)
function formatDate(iso?: string) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

// ── Family ───────────────────────────────────────────────────────────────────
const familySearch = ref('')
const family = computed(() => employee.value?.family ?? [])
const filteredFamily = computed(() => {
  const q = familySearch.value.toLowerCase().trim()
  return family.value.filter((f) => !q || f.name.toLowerCase().includes(q) || (f.relationship ?? '').toLowerCase().includes(q))
})
function addFamilyMember() { infoToast('New family member — coming soon') }
function editFamily() { infoToast('Edit family member — coming soon') }
function deleteFamily(id: string, name: string) {
  if (employee.value) { deleteFamilyMember(employee.value.id, id); toast.notify({ variant: 'success', title: `${name} removed` }) }
}

// ── Emergency contacts ───────────────────────────────────────────────────────
const emergencySearch = ref('')
const emergencyContacts = computed(() => employee.value?.emergencyContacts ?? [])
const filteredEmergency = computed(() => {
  const q = emergencySearch.value.toLowerCase().trim()
  return emergencyContacts.value.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.relationship ?? '').toLowerCase().includes(q))
})
function addEmergencyContact() { infoToast('New emergency contact — coming soon') }
function editEmergency() { infoToast('Edit emergency contact — coming soon') }
function deleteEmergency(id: string, name: string) {
  if (employee.value) { deleteEmergencyContact(employee.value.id, id); toast.notify({ variant: 'success', title: `${name} removed` }) }
}
function statusBadgeAttrs(s: string): { type?: 'announcement' | 'warning'; label: string } {
  if (s === 'resigned') return { type: 'announcement', label: t('Resigned') }
  if (s === 'resigning') return { type: 'warning', label: t('Resigning') }
  return { label: t('Active') }
}

// Mock payslips derived from basic salary (Compensation is monthly).
const payslips = computed(() => {
  const e = employee.value
  if (!e || e.status !== 'active' || !e.basicSalary) return []
  const base = e.basicSalary
  return ['June 2026', 'July 2026', 'August 2026'].map((period) => {
    const bpjs = Math.round(base * 0.04)
    const pph = Math.round(base * 0.05)
    return { period, gross: base, bpjs, pph, take: base - bpjs - pph }
  })
})

// ── Actions ────────────────────────────────────────────────────────────────
function editEmployee() { router.push(`/employee-directory/${props.orderId}/edit`) }

const resignModalOpen = ref(false)
function confirmResign() {
  if (employee.value) {
    markResigned(employee.value.id, new Date().toISOString().slice(0, 10))
    toast.notify({ variant: 'success', title: `${employee.value.fullName} ${t('marked as resigned')}` })
  }
  resignModalOpen.value = false
}

const deleteModalOpen = ref(false)
function confirmDelete() {
  if (employee.value) {
    const name = employee.value.fullName
    deleteEmployee(employee.value.id)
    toast.notify({ variant: 'success', title: `${t('Employee')} ${t('deleted')}` })
    router.push('/employee-directory')
    void name
  }
  deleteModalOpen.value = false
}
</script>

<template>
  <div v-if="employee" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <h1 class="detail-title">{{ t(viewTitle) }}</h1>
      </div>

      <MpPopover id="ed-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--primary">
            {{ t('Actions') }}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="editEmployee">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="employee.status === 'active'" @click="resignModalOpen = true">{{ t('Mark as resign') }}</MpPopoverListItem>
            <MpPopoverListItem @click="deleteModalOpen = true">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </header>

    <!-- Page tabs — only for the Personal data view -->
    <div v-if="view === 'personal-data'" class="detail-page-tabs">
      <button
        v-for="pt in PERSONAL_TABS" :key="pt.key"
        class="page-tab" :class="{ 'page-tab--active': personalTab === pt.key }"
        type="button" @click="personalTab = pt.key"
      >{{ t(pt.label) }}</button>
    </div>

    <!-- ── Stage ── -->
    <div class="detail-stage">
      <!-- ===== Employment info ===== -->
      <template v-if="view === 'employment-info'">
        <section class="pd-subsection">
          <div class="pd-grid">
            <div class="pd-gcol">
              <ContentList :label="t('Employee ID')" :value="employee.employeeId" />
              <ContentList :label="t('Barcode')" :value="employee.barcode" />
              <ContentList :label="t('Branch')" :value="employee.branch" />
              <ContentList :label="t('Organization')" :value="employee.department" />
            </div>
            <div class="pd-gcol">
              <ContentList :label="t('Job position')" :value="employee.jobPosition" />
              <ContentList :label="t('Job level')" :value="employee.jobLevel" />
              <ContentList :label="t('Employment status')" :value="employee.employmentStatus" />
            </div>
            <div class="pd-gcol">
              <ContentList :label="t('Date of joining')" :value="joinValue" />
              <ContentList :label="t('Signing date')" :value="employee.signDate ? formatDateLong(employee.signDate) : '—'" />
              <ContentList :label="t('End date')" :value="employee.contractEndDate ? formatDateLong(employee.contractEndDate) : '—'" />
            </div>
            <div class="pd-gcol">
              <ContentList :label="t('Job grade')" :value="employee.jobGrade" />
              <ContentList :label="t('Job class')" :value="employee.jobClass" />
              <ContentList :label="t('Direct manager')" :value="employee.directManager" />
            </div>
          </div>
        </section>

        <!-- Direct reports -->
        <section class="pd-subsection">
          <h3 class="pd-subsection-title">{{ t('Direct reports') }}</h3>
          <div v-if="directReports.length" class="pd-table-scroll">
            <table class="pd-table pd-table--middle">
              <thead>
                <tr>
                  <th class="pd-th">{{ t('Name') }}</th>
                  <th class="pd-th">{{ t('Employee ID') }}</th>
                  <th class="pd-th">{{ t('Job position') }}</th>
                  <th class="pd-th">{{ t('Organization') }}</th>
                  <th class="pd-th">{{ t('Employment status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in directReports" :key="r.id" class="pd-tr">
                  <td class="pd-td">
                    <div class="dr-name">
                      <img v-if="r.photo" :src="r.photo" alt="" class="dr-avatar" />
                      <span v-else class="dr-avatar dr-avatar--ph" :style="{ background: `hsl(${hueFor(r.fullName)} 62% 90%)`, color: `hsl(${hueFor(r.fullName)} 55% 32%)` }">{{ initials(r.fullName) }}</span>
                      <a class="pd-link" @click.prevent="goReport(r.id)">{{ r.fullName }}</a>
                    </div>
                  </td>
                  <td class="pd-td">{{ r.employeeId }}</td>
                  <td class="pd-td">{{ r.jobPosition }}</td>
                  <td class="pd-td">{{ r.department }}</td>
                  <td class="pd-td">{{ r.employmentStatus }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="pd-empty-tab">
            <p class="empty-full-title">{{ t('No direct reports') }}</p>
            <p class="empty-full-desc">{{ t('People who report to this employee will appear here.') }}</p>
          </div>
        </section>
      </template>

      <!-- ===== Personal data → Basic info ===== -->
      <template v-else-if="view === 'personal-data' && personalTab === 'basic-info'">
            <!-- Personal info -->
            <section class="pd-subsection">
              <h3 class="pd-subsection-title">{{ t('Personal info') }}</h3>
              <div class="pd-grid">
                <div class="pd-gcol">
                  <ContentList :label="t('Full name')" :value="employee.fullName" />
                  <ContentList :label="t('Phone no.')">
                    <a v-if="employee.phone" class="pd-link" :href="waLink(employee.phone)" target="_blank" rel="noopener">{{ employee.phone }}</a><span v-else>—</span>
                  </ContentList>
                  <ContentList :label="t('Additional phone no.')">
                    <a v-if="employee.additionalPhone" class="pd-link" :href="waLink(employee.additionalPhone)" target="_blank" rel="noopener">{{ employee.additionalPhone }}</a><span v-else>—</span>
                  </ContentList>
                </div>
                <div class="pd-gcol">
                  <ContentList :label="t('Personal email address')">
                    <a v-if="emailAddress" class="pd-link" :href="`mailto:${emailAddress}`">{{ emailAddress }}</a><span v-else>—</span>
                  </ContentList>
                  <ContentList :label="t('Date of birth')" :value="dobValue" />
                  <ContentList :label="t('Place of birth')" :value="employee.placeOfBirth" />
                </div>
                <div class="pd-gcol">
                  <ContentList :label="t('Gender')" :value="employee.gender" />
                  <ContentList :label="t('Marital status')" :value="employee.maritalStatus" />
                </div>
                <div class="pd-gcol">
                  <ContentList :label="t('Blood type')" :value="employee.bloodType" />
                  <ContentList :label="t('Religion')" :value="employee.religion" />
                </div>
              </div>
            </section>

            <!-- Identity & address -->
            <section class="pd-subsection">
              <h3 class="pd-subsection-title">{{ t('Identity & address') }}</h3>
              <!-- Row 1: Citizen ID + addresses (4th column empty) -->
              <div class="pd-grid">
                <div class="pd-gcol"><ContentList :label="t('Citizen ID')" :value="employee.nik" /></div>
                <div class="pd-gcol"><ContentList :label="t('Address as on citizen ID')" :value="employee.ktpAddress" /></div>
                <div class="pd-gcol"><ContentList :label="t('Current address (domicile)')" :value="employee.currentAddress" /></div>
              </div>
              <!-- Row 2: passport fields, each its own column (4th empty) -->
              <div class="pd-grid">
                <div class="pd-gcol"><ContentList :label="t('Passport no.')" :value="employee.passportNo" /></div>
                <div class="pd-gcol"><ContentList :label="t('Passport expiry date')" :value="employee.passportExpiry ? formatDateLong(employee.passportExpiry) : '—'" /></div>
                <div class="pd-gcol"><ContentList :label="t('Issue country')" :value="employee.passportCountry" /></div>
              </div>
            </section>
      </template>

      <!-- ===== Personal data → Family ===== -->
      <template v-else-if="view === 'personal-data' && personalTab === 'family'">
            <section class="pd-subsection">
              <div class="family-bar">
                <h3 class="pd-subsection-title family-title">{{ t('Family members') }}</h3>
                <div class="family-actions">
                  <span class="pd-search">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    <input v-model="familySearch" type="text" :placeholder="t('Search...')" class="pd-search-input" />
                  </span>
                  <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="addFamilyMember">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {{ t('New family member') }}
                  </button>
                </div>
              </div>

              <div v-if="filteredFamily.length" class="pd-table-scroll">
                <table class="pd-table">
                  <thead>
                    <tr>
                      <th class="pd-th">{{ t('Name') }}</th>
                      <th class="pd-th">{{ t('Relationship') }}</th>
                      <th class="pd-th">{{ t('Birthdate') }}</th>
                      <th class="pd-th">{{ t('Citizen ID') }}</th>
                      <th class="pd-th">{{ t('Marital status') }}</th>
                      <th class="pd-th">{{ t('Gender') }}</th>
                      <th class="pd-th">{{ t('Occupation') }}</th>
                      <th class="pd-th">{{ t('Religion') }}</th>
                      <th class="pd-th">{{ t('Eligible for reimbursement') }}</th>
                      <th class="pd-th pd-th--action" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="f in filteredFamily" :key="f.id" class="pd-tr">
                      <td class="pd-td">{{ f.name }}</td>
                      <td class="pd-td">{{ f.relationship }}</td>
                      <td class="pd-td">{{ formatDate(f.birthDate) }}</td>
                      <td class="pd-td">{{ f.citizenId ?? '—' }}</td>
                      <td class="pd-td">{{ f.maritalStatus ?? '—' }}</td>
                      <td class="pd-td">{{ f.gender ?? '—' }}</td>
                      <td class="pd-td">{{ f.occupation ?? '—' }}</td>
                      <td class="pd-td">{{ f.religion ?? '—' }}</td>
                      <td class="pd-td">{{ f.reimbursementEligible ? t('Yes') : t('No') }}</td>
                      <td class="pd-td pd-td--action">
                        <MpPopover :id="`fam-actions-${f.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                          <MpPopoverTrigger>
                            <button class="row-kebab" type="button" aria-label="More actions"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></button>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
                            <MpPopoverList>
                              <MpPopoverListItem @click="editFamily">{{ t('Edit') }}</MpPopoverListItem>
                              <MpPopoverListItem @click="deleteFamily(f.id, f.name)">{{ t('Delete') }}</MpPopoverListItem>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="pd-empty-tab">
                <p class="empty-full-title">{{ t('No family members yet') }}</p>
                <p class="empty-full-desc">{{ t('Add family members for BPJS and reimbursement.') }}</p>
              </div>
            </section>
      </template>

      <!-- ===== Personal data → Emergency contact ===== -->
      <template v-else-if="view === 'personal-data' && personalTab === 'emergency-contact'">
            <section class="pd-subsection">
              <div class="family-bar">
                <h3 class="pd-subsection-title family-title">{{ t('Emergency contact') }}</h3>
                <div class="family-actions">
                  <span class="pd-search">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    <input v-model="emergencySearch" type="text" :placeholder="t('Search...')" class="pd-search-input" />
                  </span>
                  <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="addEmergencyContact">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {{ t('New emergency contact') }}
                  </button>
                </div>
              </div>

              <div v-if="filteredEmergency.length" class="pd-table-scroll">
                <table class="pd-table">
                  <thead>
                    <tr>
                      <th class="pd-th">{{ t('Name') }}</th>
                      <th class="pd-th">{{ t('Relationship') }}</th>
                      <th class="pd-th">{{ t('Phone number') }}</th>
                      <th class="pd-th pd-th--action" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in filteredEmergency" :key="c.id" class="pd-tr">
                      <td class="pd-td">{{ c.name }}</td>
                      <td class="pd-td">{{ c.relationship }}</td>
                      <td class="pd-td"><a class="pd-link" :href="waLink(c.phone)" target="_blank" rel="noopener">{{ c.phone }}</a></td>
                      <td class="pd-td pd-td--action">
                        <MpPopover :id="`ec-actions-${c.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                          <MpPopoverTrigger>
                            <button class="row-kebab" type="button" aria-label="More actions"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></button>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
                            <MpPopoverList>
                              <MpPopoverListItem @click="editEmergency">{{ t('Edit') }}</MpPopoverListItem>
                              <MpPopoverListItem @click="deleteEmergency(c.id, c.name)">{{ t('Delete') }}</MpPopoverListItem>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="pd-empty-tab">
                <p class="empty-full-title">{{ t('No emergency contacts yet') }}</p>
                <p class="empty-full-desc">{{ t('Add someone to reach in an emergency.') }}</p>
              </div>
            </section>
      </template>

      <!-- ===== Personal data → Education ===== -->
      <template v-else-if="view === 'personal-data' && personalTab === 'education'">
            <!-- Formal education -->
            <section class="pd-subsection">
              <div class="family-bar">
                <h3 class="pd-subsection-title family-title">{{ t('Formal education') }}</h3>
                <div class="family-actions">
                  <span class="pd-search">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    <input v-model="educationSearch" type="text" :placeholder="t('Search...')" class="pd-search-input" />
                  </span>
                  <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="addEducation">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {{ t('New formal education') }}
                  </button>
                </div>
              </div>

              <div v-if="filteredEducation.length" class="pd-table-scroll">
                <table class="pd-table pd-table--middle">
                  <thead>
                    <tr>
                      <th class="pd-th">{{ t('Institution') }}</th>
                      <th class="pd-th">{{ t('Degree') }}</th>
                      <th class="pd-th">{{ t('Field of study') }}</th>
                      <th class="pd-th">{{ t('Period') }}</th>
                      <th class="pd-th">{{ t('Grade') }}</th>
                      <th class="pd-th">{{ t('Certificate') }}</th>
                      <th class="pd-th pd-th--action" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="e in filteredEducation" :key="e.id" class="pd-tr">
                      <td class="pd-td">{{ e.institution }}</td>
                      <td class="pd-td">{{ e.degree }}</td>
                      <td class="pd-td">{{ e.fieldOfStudy }}</td>
                      <td class="pd-td">{{ e.startYear }} – {{ e.endYear }}</td>
                      <td class="pd-td">{{ e.grade ?? '—' }}</td>
                      <td class="pd-td">
                        <a v-if="e.certificateUrl" class="pd-cert" :href="e.certificateUrl" :download="`${e.institution} certificate`">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                          {{ t('Download') }}
                        </a>
                        <span v-else>{{ t('Not available') }}</span>
                      </td>
                      <td class="pd-td pd-td--action">
                        <MpPopover :id="`edu-actions-${e.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                          <MpPopoverTrigger>
                            <button class="row-kebab" type="button" aria-label="More actions"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></button>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
                            <MpPopoverList>
                              <MpPopoverListItem @click="editEducation">{{ t('Edit') }}</MpPopoverListItem>
                              <MpPopoverListItem @click="removeEducation(e.id, e.institution)">{{ t('Delete') }}</MpPopoverListItem>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="pd-empty-tab"><p class="empty-full-title">{{ t('No formal education yet') }}</p><p class="empty-full-desc">{{ t('Degrees and schools will appear here.') }}</p></div>
            </section>

            <!-- Informal education -->
            <section class="pd-subsection">
              <div class="family-bar">
                <h3 class="pd-subsection-title family-title">{{ t('Informal education') }}</h3>
                <div class="family-actions">
                  <span class="pd-search">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    <input v-model="informalSearch" type="text" :placeholder="t('Search...')" class="pd-search-input" />
                  </span>
                  <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="addInformal">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {{ t('New informal education') }}
                  </button>
                </div>
              </div>

              <div v-if="filteredInformal.length" class="pd-table-scroll">
                <table class="pd-table pd-table--middle">
                  <thead>
                    <tr>
                      <th class="pd-th">{{ t('Name') }}</th>
                      <th class="pd-th">{{ t('Organizer') }}</th>
                      <th class="pd-th">{{ t('Period') }}</th>
                      <th class="pd-th">{{ t('Certificate') }}</th>
                      <th class="pd-th pd-th--action" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="e in filteredInformal" :key="e.id" class="pd-tr">
                      <td class="pd-td">{{ e.name }}</td>
                      <td class="pd-td">{{ e.organizer }}</td>
                      <td class="pd-td">{{ e.startYear }} – {{ e.endYear }}</td>
                      <td class="pd-td">
                        <a v-if="e.certificateUrl" class="pd-cert" :href="e.certificateUrl" :download="`${e.name} certificate`">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                          {{ t('Download') }}
                        </a>
                        <span v-else>{{ t('Not available') }}</span>
                      </td>
                      <td class="pd-td pd-td--action">
                        <MpPopover :id="`inf-actions-${e.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                          <MpPopoverTrigger>
                            <button class="row-kebab" type="button" aria-label="More actions"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></button>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
                            <MpPopoverList>
                              <MpPopoverListItem @click="editInformal">{{ t('Edit') }}</MpPopoverListItem>
                              <MpPopoverListItem @click="removeInformal(e.id, e.name)">{{ t('Delete') }}</MpPopoverListItem>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="pd-empty-tab"><p class="empty-full-title">{{ t('No informal education yet') }}</p><p class="empty-full-desc">{{ t('Courses, training and certifications will appear here.') }}</p></div>
            </section>
      </template>

      <!-- ===== Personal data → Work experience ===== -->
      <template v-else-if="view === 'personal-data' && personalTab === 'work-experience'">
            <section class="pd-subsection">
              <div class="family-bar">
                <h3 class="pd-subsection-title family-title">{{ t('Work experience') }}</h3>
                <div class="family-actions">
                  <span class="pd-search">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    <input v-model="workSearch" type="text" :placeholder="t('Search...')" class="pd-search-input" />
                  </span>
                  <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="addWorkExperience">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {{ t('New work experience') }}
                  </button>
                </div>
              </div>

              <div v-if="filteredWork.length" class="pd-table-scroll">
                <table class="pd-table pd-table--middle">
                  <thead>
                    <tr>
                      <th class="pd-th">{{ t('Company') }}</th>
                      <th class="pd-th">{{ t('Position') }}</th>
                      <th class="pd-th">{{ t('Period') }}</th>
                      <th class="pd-th">{{ t('Length of service') }}</th>
                      <th class="pd-th pd-th--action" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="w in filteredWork" :key="w.id" class="pd-tr">
                      <td class="pd-td">{{ w.company }}</td>
                      <td class="pd-td">{{ w.position }}</td>
                      <td class="pd-td">{{ w.startYear }} – {{ w.endYear }}</td>
                      <td class="pd-td">{{ lengthOfService(w.startYear, w.endYear) }}</td>
                      <td class="pd-td pd-td--action">
                        <MpPopover :id="`we-actions-${w.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                          <MpPopoverTrigger>
                            <button class="row-kebab" type="button" aria-label="More actions"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></button>
                          </MpPopoverTrigger>
                          <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
                            <MpPopoverList>
                              <MpPopoverListItem @click="editWorkExperience">{{ t('Edit') }}</MpPopoverListItem>
                              <MpPopoverListItem @click="removeWorkExperience(w.id, w.company)">{{ t('Delete') }}</MpPopoverListItem>
                            </MpPopoverList>
                          </MpPopoverContent>
                        </MpPopover>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="pd-empty-tab"><p class="empty-full-title">{{ t('No work experience yet') }}</p><p class="empty-full-desc">{{ t('Past roles will appear here.') }}</p></div>
            </section>
      </template>

      <!-- ===== Additional info ===== -->
      <div v-else-if="view === 'additional-info'" class="pd-empty-tab"><p class="empty-full-title">{{ t('No additional info') }}</p><p class="empty-full-desc">{{ t('Custom fields will appear here.') }}</p></div>

      <!-- ===== Payroll info (compensation + tax) ===== -->
      <template v-else-if="view === 'payroll-info'">
          <section class="pd-subsection">
            <h3 class="pd-subsection-title">{{ t('Compensation & benefits') }}</h3>
            <div class="pd-cols">
              <div class="pd-field-col pd-field-col--flex">
                <ContentList :label="t('Basic salary')" :value="employee.basicSalary ? `${formatIDR(employee.basicSalary)} / ${t('month')}` : '—'" />
                <ContentList :label="t('Salary type')" :value="employee.salaryType" />
                <ContentList :label="t('Eligible for overtime')" :value="yesNo(employee.overtimeEligible)" />
                <ContentList :label="t('Eligible for THR')" :value="yesNo(employee.thrEligible)" />
              </div>
              <div class="pd-field-col pd-field-col--flex">
                <ContentList :label="t('Bank name')" :value="employee.bankName" />
                <ContentList :label="t('Bank account no.')" :value="employee.bankAccountNumber" />
                <ContentList :label="t('Account holder name')" :value="employee.bankAccountHolder" />
              </div>
              <div class="pd-field-col pd-field-col--flex" />
            </div>
          </section>
          <section class="pd-subsection">
            <h3 class="pd-subsection-title">{{ t('Tax & BPJS') }}</h3>
            <div class="pd-cols">
              <div class="pd-field-col pd-field-col--flex">
                <ContentList :label="t('NPWP')" :value="employee.npwp" />
                <ContentList :label="t('PTKP status')" :value="employee.ptkpStatus" />
                <ContentList :label="t('Tax method (PPh 21)')" :value="employee.taxMethod" />
              </div>
              <div class="pd-field-col pd-field-col--flex">
                <ContentList :label="t('BPJS Kesehatan no.')" :value="employee.bpjsKesehatanNo" />
                <ContentList :label="t('BPJS Kesehatan class')" :value="employee.bpjsKesehatanClass" />
                <ContentList :label="t('Faskes tingkat 1')" :value="employee.bpjsKesehatanFaskes" />
              </div>
              <div class="pd-field-col pd-field-col--flex">
                <ContentList :label="t('BPJS Ketenagakerjaan no.')" :value="employee.bpjsKetenagakerjaanNo" />
              </div>
            </div>
          </section>
      </template>

      <!-- ===== Payslip ===== -->
      <template v-else-if="view === 'payslip'">
            <div v-if="payslips.length" class="pd-table-scroll">
              <table class="pd-table">
                <thead>
                  <tr>
                    <th class="pd-th">{{ t('Period') }}</th>
                    <th class="pd-th pd-th--num">{{ t('Gross') }}</th>
                    <th class="pd-th pd-th--num">{{ t('BPJS (employee)') }}</th>
                    <th class="pd-th pd-th--num">{{ t('PPh 21') }}</th>
                    <th class="pd-th pd-th--num">{{ t('Take-home pay') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in payslips" :key="p.period" class="pd-tr">
                    <td class="pd-td">{{ p.period }}</td>
                    <td class="pd-td pd-td--num">{{ formatIDR(p.gross) }}</td>
                    <td class="pd-td pd-td--num">{{ formatIDR(p.bpjs) }}</td>
                    <td class="pd-td pd-td--num">{{ formatIDR(p.pph) }}</td>
                    <td class="pd-td pd-td--num">{{ formatIDR(p.take) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="pd-empty-tab">
              <p class="empty-full-title">{{ t('No payslips yet') }}</p>
              <p class="empty-full-desc">{{ t('Published payslips will appear here.') }}</p>
            </div>
      </template>

      <!-- ===== Everything else (Time / Finance / Files / Assets / Employment history) ===== -->
      <div v-else class="pd-empty-tab"><p class="empty-full-title">{{ t('Coming soon') }}</p><p class="empty-full-desc">{{ t('This section is not available yet.') }}</p></div>
    </div>

    <!-- Mark as resign confirm -->
    <MpModal id="ed-resign-modal" :is-open="resignModalOpen" size="md" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="resignModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Mark as resign') }}?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>{{ employee.fullName }} {{ t('will be marked as resigned with today as the resign date. You can undo this by editing the employee.') }}</MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="resignModalOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="confirmResign">{{ t('Mark as resign') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- Delete confirm -->
    <MpModal id="ed-delete-modal" :is-open="deleteModalOpen" size="md" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="deleteModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Delete') }} {{ employee.fullName }}?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>{{ t('Deleted employees cannot be restored.') }}</MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteModalOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">{{ t('Delete') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>

  <div v-else class="detail-page">
    <div class="pd-notfound">
      <p class="empty-full-title">{{ t('Employee not found') }}</p>
      <a class="pd-link" @click.prevent="goBack">{{ t('Back to Employee directory') }}</a>
    </div>
  </div>
</template>

<style scoped>
/* ── Shell (mirrors ProductDetailsPage / details-page-format.md §C) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap; font-family: inherit;
}
.detail-btn--primary {
  background: var(--mp-colors-emerald-700, #029861); border-color: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
}
.detail-btn--primary:hover {
  background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}

/* ── Page-level tab bar (outside the stage, under the title) ── */
.detail-page-tabs {
  flex-shrink: 0; display: flex; align-items: flex-end; gap: var(--mp-spacing-5);
  padding: 0 var(--mp-spacing-6); background: var(--mp-background-neutral-subtle);
}
.page-tab {
  position: relative; display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); white-space: nowrap; transition: color 100ms;
}
.page-tab:not(.page-tab--active):hover { color: var(--mp-text-default); }
.page-tab--active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.page-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--mp-text-selected); border-radius: var(--mp-radii-sm, 2px) var(--mp-radii-sm, 2px) 0 0; }

/* ── Tabs (green active-state) ── */
.detail-tabs { margin-top: 0; }
/* Gap between the Employment-info summary and the sub-tab bar. */
.pd-section + .detail-tabs { margin-top: var(--mp-spacing-8); }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) {
  background-color: var(--mp-border-selected, #029861) !important;
}
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

/* ── Info sections ── */
.pd-section { display: flex; flex-direction: column; }
.pd-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.pd-info-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; flex-wrap: wrap; }
.pd-cols { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; flex-wrap: wrap; }
.pd-image-col { flex-shrink: 0; width: 172px; }
.pd-image {
  width: 172px; height: 172px; object-fit: cover; border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default);
}
.pd-image--placeholder {
  display: flex; align-items: center; justify-content: center;
  font-size: 48px; font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
}
.pd-field-col { display: flex; flex-direction: column; }
.pd-field-col--flex { flex: 1; min-width: 220px; }

/* Tab sub-sections (Personal info / Identity & address) — 12-col grid, each
   column spans 3 (→ 4 columns). */
.pd-subsection { display: flex; flex-direction: column; }
/* Subtle gray divider between stacked content sections (16px each side → 32px total). */
.pd-subsection + .pd-subsection { margin-top: var(--mp-spacing-6, 24px); padding-top: var(--mp-spacing-6, 24px); border-top: 1px solid var(--mp-border-default); }
.pd-subsection-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.pd-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 0 var(--mp-spacing-6); }
.pd-gcol { grid-column: span 3; display: flex; flex-direction: column; min-width: 0; }
/* Responsive: 4 → 2 columns on medium widths, 1 column on narrow. */
@media (max-width: 1080px) { .pd-gcol { grid-column: span 6; } }
@media (max-width: 640px) { .pd-gcol { grid-column: span 12; } }
/* Mobile — tighter side padding, single-line title, and the page-tab bar scrolls
   horizontally instead of overflowing. */
@media (max-width: 640px) {
  .detail-bar { padding-left: var(--mp-spacing-4); padding-right: var(--mp-spacing-4); gap: var(--mp-spacing-2); }
  .detail-title { font-size: var(--mp-font-sizes-xl, 20px); line-height: 26px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail-stage { padding-left: var(--mp-spacing-4); padding-right: var(--mp-spacing-4); }
  .detail-page-tabs {
    padding-left: var(--mp-spacing-4); padding-right: var(--mp-spacing-4);
    gap: var(--mp-spacing-4); overflow-x: auto; scrollbar-width: none;
  }
  .detail-page-tabs::-webkit-scrollbar { display: none; }
  .page-tab { flex-shrink: 0; }
}
.pd-link { color: var(--mp-text-link); cursor: pointer; }
.pd-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Direct reports — name cell avatar */
.dr-name { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.dr-avatar { width: 28px; height: 28px; border-radius: var(--mp-radii-full, 999px); object-fit: cover; flex-shrink: 0; }
.dr-avatar--ph { display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); }

/* ── Payslips table ── */
.pd-table-scroll { overflow-x: auto; }
.pd-table { width: 100%; min-width: max-content; border-collapse: collapse; }
.pd-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default);
  vertical-align: top; white-space: nowrap; background: var(--mp-background-neutral);
}
.pd-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.pd-tr:hover .pd-td { background: var(--mp-background-neutral-hovered); }
/* Tables that keep cells vertically centered (avatar / action rows). */
.pd-table--middle .pd-td { vertical-align: middle; }
/* Certificate download link */
.pd-cert { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); color: var(--mp-text-link); cursor: pointer; }
.pd-cert:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Family section (full-width table + filter bar) ── */
.family-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); }
.family-title { margin: 0; }
.family-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pd-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 240px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.pd-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; }
.pd-search-input::placeholder { color: var(--mp-text-placeholder); }
/* Row kebab (Edit / Delete) in the Family & Emergency tables */
.pd-th--action, .pd-td--action { width: 52px; text-align: right; }
.pd-td--action { padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

.pd-empty-tab { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10, 40px) 0; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pd-notfound { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10) 0; }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
