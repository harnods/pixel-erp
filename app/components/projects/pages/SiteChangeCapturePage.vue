<script setup lang="ts">
/**
 * Site change capture (PRD §8, Story 11) — the realistic alternative to a
 * WhatsApp message. A site supervisor records what changed, on which work
 * package and who asked, from a phone; it becomes a change order in
 * "requested" state for the PM to price and raise. If the work was already
 * done, it's flagged as executed-but-unbilled exposure.
 */
import PmTitleBar from '../PmTitleBar.vue'
import { projects, getProject, projectWorkPackages } from '~/data/projects'
import { changeOrders } from '~/data/projectChanges'
import { captureSiteChange } from '~/data/projectActions'
import { formatDate } from '~/utils/date'
import { notifyResult } from '~/utils/projectToast'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { asActor } = useProjectRole()

const activeProjects = computed(() => projects.filter(p => p.status === 'active'))
const form = reactive({
  projectId: (typeof route.query.project === 'string' && getProject(route.query.project)?.status === 'active' ? route.query.project : activeProjects.value[0]?.id) ?? '',
  wpId: '', title: '', description: '', requestedBy: '', executed: false, photos: 0, touched: false,
})
const wps = computed(() => (form.projectId ? projectWorkPackages(form.projectId) : []))
watch(() => form.projectId, () => { form.wpId = wps.value.find(w => w.status === 'in_progress')?.id ?? wps.value[0]?.id ?? '' }, { immediate: true })
const errors = computed(() => ({
  title: !form.title.trim() ? t('Say what changed.') : '',
  wp: !form.wpId ? t('Pick the work package.') : '',
  requestedBy: !form.requestedBy.trim() ? t('Who asked for it?') : '',
}))
const lastNo = ref('')
function submit() {
  form.touched = true
  if (Object.values(errors.value).some(Boolean)) return
  const res = captureSiteChange({ projectId: form.projectId, wpId: form.wpId, title: form.title, description: form.description, requestedBy: form.requestedBy, executed: form.executed, photoCount: form.photos }, asActor.value)
  if (notifyResult(res, t('Change captured')) && res.ok) {
    lastNo.value = res.no ?? ''
    Object.assign(form, { title: '', description: '', requestedBy: '', executed: false, photos: 0, touched: false })
  }
}
const recent = computed(() => changeOrders.filter(v => v.source === 'site').slice(0, 5))
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Site change capture')" :subtitle="t('Record a customer’s field change before the work is done — so it gets priced, signed off and billed.')" />
    <div class="pm-stage">
      <div style="max-width: 560px; margin: 0 auto" class="pm-stack">
        <div v-if="lastNo" class="pm-banner pm-banner--success">
          <div class="pm-banner-body"><div class="pm-banner-title">{{ lastNo }} {{ t('captured') }}</div>{{ t('The PM will price it and raise it for Finance approval.') }}</div>
        </div>

        <div class="pm-card pm-stack" style="gap: 14px">
          <div class="pm-field">
            <label class="pm-label pm-label-req" for="sc-p">{{ t('Project') }}</label>
            <select id="sc-p" v-model="form.projectId" class="pm-select"><option v-for="p in activeProjects" :key="p.id" :value="p.id">{{ p.code }} · {{ p.name }}</option></select>
          </div>
          <div class="pm-field">
            <label class="pm-label pm-label-req" for="sc-w">{{ t('Work package') }}</label>
            <select id="sc-w" v-model="form.wpId" class="pm-select" :aria-invalid="form.touched && !!errors.wp"><option v-for="w in wps" :key="w.id" :value="w.id">{{ w.auto ? getProject(form.projectId)?.name : `${w.code} ${w.name}` }}</option></select>
          </div>
          <div class="pm-field">
            <label class="pm-label pm-label-req" for="sc-t">{{ t('What changed?') }}</label>
            <input id="sc-t" v-model="form.title" class="pm-input" :placeholder="t('e.g. Add 4 sockets in the lecturers’ room')" :aria-invalid="form.touched && !!errors.title" />
            <span v-if="form.touched && errors.title" class="pm-error">{{ errors.title }}</span>
          </div>
          <div class="pm-field">
            <label class="pm-label" for="sc-d">{{ t('Details') }}</label>
            <textarea id="sc-d" v-model="form.description" class="pm-textarea" :placeholder="t('Where, how much, anything the PM needs to price it')" />
          </div>
          <div class="pm-field">
            <label class="pm-label pm-label-req" for="sc-r">{{ t('Requested by') }}</label>
            <input id="sc-r" v-model="form.requestedBy" class="pm-input" :placeholder="t('Name and role on the customer side')" :aria-invalid="form.touched && !!errors.requestedBy" />
            <span v-if="form.touched && errors.requestedBy" class="pm-error">{{ errors.requestedBy }}</span>
          </div>
          <div class="pm-field">
            <span class="pm-label">{{ t('Photos') }}</span>
            <div class="pm-row">
              <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="form.photos++">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.6" /></svg>
                {{ t('Add photo') }}
              </button>
              <span v-if="form.photos" class="pm-small pm-muted">{{ form.photos }} {{ t('attached') }}</span>
            </div>
          </div>
          <label class="pm-check"><input v-model="form.executed" type="checkbox" /> {{ t('The work has already been done') }}</label>
          <div v-if="form.executed" class="pm-banner pm-banner--warn"><div class="pm-banner-body">{{ t('It will be flagged as executed-but-unbilled exposure on the project and the portfolio until it’s signed off.') }}</div></div>
          <button class="btn-enterprise btn-enterprise--primary" type="button" style="width: 100%; justify-content: center" @click="submit">{{ t('Capture change') }}</button>
        </div>

        <div v-if="recent.length">
          <h3 class="pm-h3" style="margin-bottom: 8px">{{ t('Recently captured') }}</h3>
          <div class="pm-card" style="padding: 4px 14px">
            <div v-for="v in recent" :key="v.id" class="pm-row" style="padding: 10px 0; border-bottom: 1px solid var(--mp-border-default)">
              <div style="flex: 1; min-width: 0">
                <div class="pm-strong">{{ v.no }} · {{ v.title }}</div>
                <div class="pm-small pm-muted">{{ getProject(v.projectId)?.code }} · {{ v.capturedBy }} · {{ formatDate(v.createdAt) }}</div>
              </div>
              <button class="pm-link pm-small" type="button" @click="router.push(`/projects/${v.projectId}?tab=changes`)">{{ t('Open') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
