<script setup lang="ts">
/**
 * Title bar shared by every Projects page: breadcrumb directly above the title
 * (rule/detail-breadcrumb-no-gap), badges beside it, actions top-right in an
 * MpButtonGroup (rule/page-title-actions-group). No page-description subtitle
 * (rule/no-page-description-subtitle) — `meta` is record context (customer · PM · SO) only.
 *
 * It also mounts the prototype's scenario FAB (rule/detail-scenario-fab): the demo
 * role switch ("View as") that drives raise vs approve, plus any page scenarios
 * (e.g. the portfolio's Empty state) passed in `scenarios`.
 */
import { MpButtonGroup } from '@mekari/pixel3'
import ScenarioFab, { type Scenario } from '~/components/patterns/ScenarioFab.vue'
import { PROJECT_ROLES, type ProjectRole } from '~/composables/useProjectRole'

const props = withDefaults(defineProps<{
  title: string
  breadcrumb?: { label: string; to: string }
  meta?: string
  scenarios?: Scenario[]
  scenario?: string
}>(), { scenarios: () => [], scenario: '' })
const emit = defineEmits<{ (e: 'update:scenario', v: string): void }>()

const router = useRouter()
const { t } = useLocale()
const { role, setRole } = useProjectRole()

const fabScenarios = computed<Scenario[]>(() => [
  ...PROJECT_ROLES.map(r => ({ label: `${t('View as')} ${t(r.label)}`, value: `role:${r.value}` })),
  ...props.scenarios.map(s => ({ label: t(s.label), value: s.value })),
])
const fabValue = computed({
  get: () => (props.scenario && props.scenario !== 'data' ? props.scenario : `role:${role.value}`),
  set: (v: string) => {
    if (v.startsWith('role:')) {
      setRole(v.slice(5) as ProjectRole)
      if (props.scenario && props.scenario !== 'data') emit('update:scenario', 'data')
    } else {
      emit('update:scenario', v)
    }
  },
})
</script>

<template>
  <header class="pm-bar">
    <div class="pm-bar-left">
      <span v-if="breadcrumb" class="pm-link pm-small" role="link" tabindex="0" @click="router.push(breadcrumb.to)" @keydown.enter="router.push(breadcrumb.to)">{{ breadcrumb.label }}</span>
      <div class="pm-titlerow">
        <h1 class="pm-title">{{ title }}</h1>
        <slot name="badges" />
      </div>
      <div v-if="meta" class="pm-title-sub">{{ meta }}</div>
    </div>
    <MpButtonGroup v-if="$slots.actions" class="pm-bar-actions"><slot name="actions" /></MpButtonGroup>
  </header>
  <ScenarioFab v-model="fabValue" :scenarios="fabScenarios" :aria-label="t('Prototype — view as')" />
</template>
