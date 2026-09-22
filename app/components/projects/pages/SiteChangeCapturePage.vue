<script setup lang="ts">
/**
 * Site change capture (PRD §8, Story 11) — the realistic alternative to a
 * WhatsApp message. A site supervisor records what changed, on which work
 * package and who asked, from a phone; it becomes a change order in
 * "requested" state for the PM to price and raise. If the work was already
 * done, it's flagged as executed-but-unbilled exposure.
 */
import {
  MpButton, MpInput, MpTextarea, MpCheckbox, MpTextlink, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerDescription,
} from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmActionError from '../PmActionError.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { projects, getProject, projectWorkPackages } from '~/data/projects'
import { changeOrders } from '~/data/projectChanges'
import { captureSiteChange } from '~/data/projectActions'
import { formatDate } from '~/utils/date'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const { asActor } = useProjectRole()
const action = useProjectAction()

const activeProjects = computed(() => projects.filter(p => p.status === 'active'))
const form = reactive({
  projectId: (typeof route.query.project === 'string' && getProject(route.query.project)?.status === 'active' ? route.query.project : activeProjects.value[0]?.id) ?? '',
  wpId: '', title: '', description: '', requestedBy: '', executed: false, photos: 0, touched: false,
})
const wps = computed(() => (form.projectId ? projectWorkPackages(form.projectId) : []))
const projectOptions = computed(() => activeProjects.value.map(p => ({ value: p.id, label: `${p.code} · ${p.name}` })))
const wpOptions = computed(() => wps.value.map(w => ({ value: w.id, label: w.auto ? getProject(form.projectId)?.name ?? '' : `${w.code} ${w.name}` })))
watch(() => form.projectId, () => { form.wpId = wps.value.find(w => w.status === 'in_progress')?.id ?? wps.value[0]?.id ?? '' }, { immediate: true })
const errors = computed(() => ({
  title: !form.title.trim() ? t('Say what changed.') : '',
  wp: !form.wpId ? t('Pick the work package.') : '',
  requestedBy: !form.requestedBy.trim() ? t('Who asked for it?') : '',
}))
function submit() {
  form.touched = true
  if (Object.values(errors.value).some(Boolean)) return
  const res = captureSiteChange({ projectId: form.projectId, wpId: form.wpId, title: form.title, description: form.description, requestedBy: form.requestedBy, executed: form.executed, photoCount: form.photos }, asActor.value)
  if (action.run(res, res.ok && res.no ? `${res.no} ${t('captured')}` : t('Change captured'))) {
    Object.assign(form, { title: '', description: '', requestedBy: '', executed: false, photos: 0, touched: false })
  }
}
const recent = computed(() => changeOrders.filter(v => v.source === 'site').slice(0, 5))
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Site change capture')" />
    <div class="pm-stage">
      <div class="pm-mobile-width pm-stack">
        <div class="pm-card pm-stack pm-gap-4">
          <MpFormControl id="sc-p-fc" is-required>
            <MpFormLabel>{{ t('Project') }}</MpFormLabel>
            <ErpFilterSelect id="sc-p" v-model="form.projectId" :placeholder="t('Select project')" :options="projectOptions" width="100%" :is-clearable="false" />
          </MpFormControl>
          <MpFormControl id="sc-w-fc" is-required :is-invalid="form.touched && !!errors.wp">
            <MpFormLabel>{{ t('Work package') }}</MpFormLabel>
            <ErpFilterSelect id="sc-w" v-model="form.wpId" :placeholder="t('Select work package')" :options="wpOptions" width="100%" :is-clearable="false" />
            <MpFormErrorMessage>{{ errors.wp }}</MpFormErrorMessage>
          </MpFormControl>
          <MpFormControl id="sc-t-fc" is-required :is-invalid="form.touched && !!errors.title">
            <MpFormLabel>{{ t('What changed?') }}</MpFormLabel>
            <MpInput id="sc-t" v-model="form.title" />
            <MpFormErrorMessage>{{ errors.title }}</MpFormErrorMessage>
          </MpFormControl>
          <MpFormControl id="sc-d-fc">
            <MpFormLabel>{{ t('Details') }}</MpFormLabel>
            <MpTextarea id="sc-d" v-model="form.description" />
          </MpFormControl>
          <MpFormControl id="sc-r-fc" is-required :is-invalid="form.touched && !!errors.requestedBy">
            <MpFormLabel>{{ t('Requested by') }}</MpFormLabel>
            <MpInput id="sc-r" v-model="form.requestedBy" />
            <MpFormErrorMessage>{{ errors.requestedBy }}</MpFormErrorMessage>
          </MpFormControl>
          <MpFormControl id="sc-photos-fc">
            <MpFormLabel>{{ t('Photos') }}</MpFormLabel>
            <div class="pm-row">
              <MpButton id="sc-add-photo" variant="secondary" is-rounded left-icon="camera" @click="form.photos++">{{ t('Add photo') }}</MpButton>
              <span v-if="form.photos" class="pm-small pm-muted">{{ form.photos }} {{ t('attached') }}</span>
            </div>
          </MpFormControl>
          <label class="pm-check">
            <MpCheckbox id="sc-executed" :is-checked="form.executed" @change="form.executed = !form.executed" />
            <span>{{ t('The work has already been done') }}</span>
          </label>
          <MpBanner v-if="form.executed" id="sc-executed-warn" variant="warning">
            <MpBannerIcon /><MpBannerDescription>{{ t('It will be flagged as executed-but-unbilled exposure on the project and the portfolio until it’s signed off.') }}</MpBannerDescription>
          </MpBanner>
          <PmActionError id="sc-error" :error="action.error.value" />
          <MpButton id="sc-submit" variant="primary" is-rounded is-full-width @click="submit">{{ t('Capture change') }}</MpButton>
        </div>

        <div v-if="recent.length">
          <h3 class="pm-h3 pm-mb-2">{{ t('Recently captured') }}</h3>
          <div class="pm-table-wrap">
            <table class="pm-table">
              <tbody>
                <tr v-for="v in recent" :key="v.id">
                  <td class="pm-wrap">
                    <span class="pm-strong">{{ v.no }} · {{ v.title }}</span>
                    <span class="pm-cell-sub">{{ getProject(v.projectId)?.code }} · {{ v.capturedBy }} · {{ formatDate(v.createdAt) }}</span>
                  </td>
                  <td class="pm-cell-actions"><MpTextlink :id="`sc-open-${v.id}`" as="a" @click.prevent="router.push(`/projects/${v.projectId}?tab=changes`)">{{ t('Open') }}</MpTextlink></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
