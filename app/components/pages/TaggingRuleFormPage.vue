<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/tagging-rules/views/TaggingRuleFormView.vue + components/TaggingRuleForm.vue + components/SelectUsersDrawer.vue -->
<script setup lang="ts">
import {
  MpButton, MpIcon, MpRadio, MpTag, MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpInput,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import {
  getTaggingRule, saveTaggingRule, TAGGING_TRANSACTION_TYPES, TAG_TYPE_LABEL,
  TAG_TYPE_EMAIL, TAG_TYPE_FULL_NAME, TAG_TYPE_CUSTOM, TAGGING_RULE_MAX_SELECTED_USERS, type TagType,
} from '~/data/taggingRules'
import { tags } from '~/data/tags'
import { accountUsers, type AccountUser } from '~/data/usersRoles'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const existing = computed(() => (props.orderId === 'new' ? undefined : getTaggingRule(props.orderId)))
const isEdit = computed(() => !!existing.value)
const pageTitle = computed(() => (isEdit.value ? t('Edit tagging rule') : t('New tagging rule')))

// ─── Form state ──────────────────────────────────────────────────────────────
const ruleName = ref(existing.value?.name ?? '')
const transactionType = ref(existing.value ? String(existing.value.transactionTypeId) : '')
const tagType = ref<TagType>(existing.value?.tagType ?? TAG_TYPE_EMAIL)
const tagNames = ref<string[]>((existing.value?.tagIds ?? []).map(id => tags.find(x => x.id === id)?.name).filter((n): n is string => !!n))
const usersMode = ref<'all' | 'selected'>(existing.value?.userIds.length ? 'selected' : 'all')
const selectedUserIds = ref<string[]>([...(existing.value?.userIds ?? [])])

const transactionTypeOptions = TAGGING_TRANSACTION_TYPES.map(o => ({ value: String(o.id), label: `${o.group} · ${o.label}` }))
const activeTagNames = computed(() => tags.filter(x => !x.archived).map(x => x.name))
const activeUsers = computed(() => accountUsers.filter(u => u.status === 'active'))
const selectedUsers = computed(() => selectedUserIds.value.map(id => accountUsers.find(u => u.id === id)).filter((u): u is AccountUser => !!u))

// Prod locks the tagging type while users are selected — remove them to change it.
const isTagTypeLocked = computed(() => usersMode.value === 'selected' && selectedUserIds.value.length > 0)

const errors = reactive({ ruleName: '', transactionType: '', tags: '', users: '' })
function removeTag(i: number) { tagNames.value = tagNames.value.filter((_, k) => k !== i) }
function removeUser(id: string) { selectedUserIds.value = selectedUserIds.value.filter(x => x !== id) }

function validate(): boolean {
  errors.ruleName = ruleName.value.trim() ? '' : t('Rule name is required')
  errors.transactionType = transactionType.value ? '' : t('Transaction type is required')
  errors.tags = tagType.value === TAG_TYPE_CUSTOM && tagNames.value.length === 0 ? t('Add at least one tag') : ''
  errors.users = usersMode.value === 'selected' && selectedUserIds.value.length === 0 ? t('Select at least one user') : ''
  return !errors.ruleName && !errors.transactionType && !errors.tags && !errors.users
}

const isSaving = ref(false)
async function submit() {
  if (!validate()) return
  isSaving.value = true
  await new Promise(r => setTimeout(r, 400))
  saveTaggingRule({
    id: existing.value?.id,
    name: ruleName.value.trim(),
    transactionTypeId: Number(transactionType.value),
    tagType: tagType.value,
    tagIds: tagType.value === TAG_TYPE_CUSTOM ? tagNames.value.map(n => tags.find(x => x.name === n)?.id).filter((x): x is string => !!x) : [],
    userIds: usersMode.value === 'selected' ? [...selectedUserIds.value] : [],
  })
  isSaving.value = false
  successToast(isEdit.value ? t('Successfully updated') : t('Successfully created'))
  goToList()
}
function goToList() { router.push('/tagging-rules') }

// ─── Select users drawer ─────────────────────────────────────────────────────
const drawerOpen = ref(false)
const draftIds = ref<string[]>([])
const availableSearch = ref('')
const selectedSearch = ref('')
const drawerError = ref('')
function openDrawer() {
  draftIds.value = [...selectedUserIds.value]
  availableSearch.value = ''
  selectedSearch.value = ''
  drawerError.value = ''
  drawerOpen.value = true
}
function matches(u: AccountUser, q: string) {
  const s = q.trim().toLowerCase()
  return !s || u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
}
const availableUsers = computed(() => activeUsers.value.filter(u => !draftIds.value.includes(u.id) && matches(u, availableSearch.value)))
const draftUsers = computed(() => draftIds.value.map(id => accountUsers.find(u => u.id === id)).filter((u): u is AccountUser => !!u))
const filteredDraftUsers = computed(() => draftUsers.value.filter(u => matches(u, selectedSearch.value)))
function addUser(u: AccountUser) {
  if (draftIds.value.length >= TAGGING_RULE_MAX_SELECTED_USERS) {
    drawerError.value = `${t('You can select up to')} ${TAGGING_RULE_MAX_SELECTED_USERS} ${t('people.')}`
    return
  }
  draftIds.value = [...draftIds.value, u.id]
}
function addAll() { for (const u of availableUsers.value) addUser(u) }
function removeDraft(u: AccountUser) { draftIds.value = draftIds.value.filter(id => id !== u.id); drawerError.value = '' }
function removeAll() { draftIds.value = []; drawerError.value = '' }
function saveDrawer() {
  selectedUserIds.value = [...draftIds.value]
  errors.users = ''
  drawerOpen.value = false
}
</script>

<template>
  <div class="trf-page">
    <div class="trf-titlebar">
      <div class="trf-titlebar-left">
        <button class="trf-breadcrumb" @click="goToList">{{ t('Tagging rules') }}</button>
        <h1 class="trf-title">{{ pageTitle }}</h1>
      </div>
    </div>

    <div class="trf-stage">
      <div class="trf-form">
        <MpFormControl id="trf-name" is-required :is-invalid="!!errors.ruleName">
          <MpFormLabel>{{ t('Rule name') }}</MpFormLabel>
          <MpInput id="trf-name-input" v-model="ruleName" is-full-width @update:model-value="errors.ruleName = ''" />
          <MpFormErrorMessage>{{ errors.ruleName }}</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="trf-type" is-required :is-invalid="!!errors.transactionType">
          <MpFormLabel>{{ t('Transaction Type') }}</MpFormLabel>
          <ErpFilterSelect
            id="trf-type-select"
            :model-value="transactionType"
            placeholder="Transaction type"
            :options="transactionTypeOptions"
            :is-clearable="false"
            :is-disabled="isEdit"
            width="270px"
            @update:model-value="(v: string) => { transactionType = v; errors.transactionType = '' }"
          />
          <MpFormErrorMessage>{{ errors.transactionType }}</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="trf-tag-type" is-required :is-invalid="!!errors.tags">
          <MpFormLabel>{{ t('Tagging type that appears on transaction') }}</MpFormLabel>
          <div class="trf-radios">
            <label v-for="tt in [TAG_TYPE_EMAIL, TAG_TYPE_FULL_NAME, TAG_TYPE_CUSTOM]" :key="tt" class="trf-radio" :class="{ 'trf-radio--disabled': isTagTypeLocked && tagType !== tt }">
              <MpRadio
                :id="`trf-tag-type-${tt}`"
                name="trf-tag-type"
                :value="String(tt)"
                :is-checked="tagType === tt"
                :is-disabled="isTagTypeLocked && tagType !== tt"
                @change="tagType = tt; errors.tags = ''"
              />
              <span>{{ t(TAG_TYPE_LABEL[tt]) }}</span>
            </label>
          </div>
          <MpFormHelpText v-if="isTagTypeLocked">{{ t('Remove all selected users to change the tagging type.') }}</MpFormHelpText>
          <div v-if="tagType === TAG_TYPE_CUSTOM" class="trf-indent">
            <MultiSelectDropdown
              id="trf-tags"
              :model-value="tagNames"
              :options="activeTagNames"
              placeholder="Select tag"
              :is-invalid="!!errors.tags"
              @update:model-value="(v: string[]) => { tagNames = v; errors.tags = '' }"
            />
            <div v-if="tagNames.length" class="trf-chips">
              <MpTag v-for="(n, i) in tagNames" :key="n" is-closable @close="removeTag(i)">{{ n }}</MpTag>
            </div>
            <MpFormErrorMessage>{{ errors.tags }}</MpFormErrorMessage>
          </div>
        </MpFormControl>

        <MpFormControl id="trf-users" is-required :is-invalid="!!errors.users">
          <MpFormLabel>{{ t('Transaction created by') }}</MpFormLabel>
          <div class="trf-radios">
            <label class="trf-radio">
              <MpRadio id="trf-users-all" name="trf-users-mode" value="all" :is-checked="usersMode === 'all'" @change="usersMode = 'all'; errors.users = ''" />
              <span>{{ t('All users') }}</span>
            </label>
            <label class="trf-radio">
              <MpRadio id="trf-users-selected" name="trf-users-mode" value="selected" :is-checked="usersMode === 'selected'" @change="usersMode = 'selected'" />
              <span>{{ t('Selected users') }}</span>
            </label>
          </div>
          <div v-if="usersMode === 'selected'" class="trf-indent">
            <div v-if="selectedUsers.length" class="trf-user-list">
              <div v-for="u in selectedUsers" :key="u.id" class="trf-user-row">
                <span>{{ u.name }}</span>
                <MpButton variant="ghost" is-rounded :aria-label="`${t('Remove')} ${u.name}`" @click="removeUser(u.id)">
                  <MpIcon name="minus-circular" size="sm" />
                </MpButton>
              </div>
            </div>
            <button class="btn-enterprise btn-enterprise--secondary trf-add-users" @click="openDrawer">{{ t('Add users') }}</button>
            <MpFormErrorMessage>{{ errors.users }}</MpFormErrorMessage>
          </div>
        </MpFormControl>
      </div>
    </div>

    <div class="trf-footer">
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="goToList">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submit">
        {{ isSaving ? t('Saving…') : (isEdit ? t('Save changes') : t('Save')) }}
      </button>
    </div>

    <!-- ── Select users drawer (copied shell: BillsFiltersDrawer) ── -->
    <Teleport to="body">
      <Transition name="sud">
        <div v-if="drawerOpen" class="sud-overlay">
          <div class="sud-panel" role="dialog" :aria-label="t('Select users')">
            <header class="sud-header">
              <span class="sud-title">{{ t('Select users') }}</span>
              <MpButton class="sud-close" is-rounded :aria-label="t('Close')" @click="drawerOpen = false">
                <MpIcon name="close" size="md" />
              </MpButton>
            </header>
            <div class="sud-body">
              <section class="sud-col">
                <div class="sud-search">
                  <MpIcon name="search" size="sm" />
                  <input v-model="availableSearch" class="sud-search-input" type="text" :placeholder="t('Search...')" />
                </div>
                <div class="sud-col-header">
                  <span class="sud-col-title">{{ t('Users') }}</span>
                  <MpButton variant="textLink" is-rounded @click="addAll">{{ t('Add all') }}</MpButton>
                </div>
                <div class="sud-list">
                  <button v-for="u in availableUsers" :key="u.id" class="sud-row" @click="addUser(u)">
                    <span class="sud-row-text">
                      <span class="sud-row-name">{{ u.name }}</span>
                      <span class="sud-row-email">{{ u.email }}</span>
                    </span>
                    <MpIcon name="add-circular" size="sm" />
                  </button>
                  <p v-if="!availableUsers.length" class="sud-empty">{{ t('No users found') }}</p>
                </div>
              </section>
              <section class="sud-col sud-col--right">
                <div class="sud-search">
                  <MpIcon name="search" size="sm" />
                  <input v-model="selectedSearch" class="sud-search-input" type="text" :placeholder="t('Search...')" />
                </div>
                <template v-if="draftUsers.length">
                  <div class="sud-col-header">
                    <span class="sud-col-title">{{ t('Selected users') }} ({{ draftUsers.length }})</span>
                    <MpButton variant="textLink" is-rounded @click="removeAll">{{ t('Remove all') }}</MpButton>
                  </div>
                  <div class="sud-list">
                    <button v-for="u in filteredDraftUsers" :key="u.id" class="sud-row" @click="removeDraft(u)">
                      <span class="sud-row-text">
                        <span class="sud-row-name">{{ u.name }}</span>
                        <span class="sud-row-email">{{ u.email }}</span>
                      </span>
                      <MpIcon name="minus-circular" size="sm" />
                    </button>
                    <p v-if="!filteredDraftUsers.length" class="sud-empty">{{ t('No users found') }}</p>
                  </div>
                </template>
                <div v-else class="sud-blank">
                  <p class="sud-blank-title">{{ t('No selected users') }}</p>
                  <p class="sud-blank-desc">{{ t('Selected users will appear here.') }}</p>
                </div>
                <p v-if="drawerError" class="sud-error">{{ drawerError }}</p>
              </section>
            </div>
            <footer class="sud-footer">
              <button class="btn-enterprise btn-enterprise--ghost" @click="drawerOpen = false">{{ t('Cancel') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" @click="saveDrawer">{{ t('Save') }}</button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.trf-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.trf-titlebar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.trf-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.trf-breadcrumb { background: none; border: none; cursor: pointer; padding: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-md); color: var(--mp-text-link); font-family: inherit; white-space: nowrap; }
.trf-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.trf-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.trf-stage { flex: 1; min-height: 0; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8); }
.trf-form { width: 558px; max-width: 100%; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }
.trf-radios { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.trf-radio { display: inline-flex; align-items: center; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.trf-radio--disabled { color: var(--mp-text-disabled); cursor: not-allowed; }
.trf-indent { margin-top: var(--mp-spacing-2); padding-left: var(--mp-spacing-7, 28px); display: flex; flex-direction: column; gap: var(--mp-spacing-2); align-items: flex-start; }
.trf-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.trf-user-list {
  width: 100%; max-height: 300px; overflow-y: auto;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.trf-user-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.trf-user-row:last-child { border-bottom: none; }
.trf-add-users { align-self: flex-start; }
.trf-footer { flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default); }

.sud-enter-active, .sud-leave-active { transition: background-color 250ms ease; }
.sud-enter-from, .sud-leave-to { background-color: transparent; }
.sud-enter-active .sud-panel { transition: transform 350ms ease-out; }
.sud-leave-active .sud-panel { transition: transform 250ms ease-in; }
.sud-enter-from .sud-panel, .sud-leave-to .sud-panel { transform: translateX(calc(100% + 12px)); }
.sud-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-background-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.sud-panel {
  margin: var(--mp-spacing-3); width: min(720px, calc(100% - 24px)); height: calc(100% - 24px);
  display: flex; flex-direction: column; background: var(--mp-background-stage);
  border-radius: var(--mp-radii-lg, 12px); overflow: hidden;
}
.sud-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.sud-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sud-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; color: var(--mp-colors-icon-default);
}
.sud-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; }
.sud-col { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); min-height: 0; }
.sud-col--right { border-left: 1px solid var(--mp-border-default); }
.sud-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.sud-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; }
.sud-search-input::placeholder { color: var(--mp-text-placeholder); }
.sud-col-header { display: flex; align-items: center; justify-content: space-between; }
.sud-col-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sud-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
.sud-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-2); border: none; background: none; cursor: pointer; text-align: left;
  border-radius: var(--mp-radii-md); color: var(--mp-colors-icon-default);
}
.sud-row:hover { background: var(--mp-background-neutral-hovered); }
.sud-row-text { display: flex; flex-direction: column; min-width: 0; }
.sud-row-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.sud-row-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sud-empty { margin: 0; padding: var(--mp-spacing-3) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.sud-blank { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-1); }
.sud-blank-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sud-blank-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.sud-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.sud-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default);
}
</style>
