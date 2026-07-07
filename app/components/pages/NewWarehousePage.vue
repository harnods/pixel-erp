<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpInput, MpTextarea, MpInputTag, toast, type DataInterface,
} from '@mekari/pixel3'
import { warehouses, addWarehouse, updateWarehouse } from '~/data/warehouses'
import { getWarehouseDetail } from '~/data/warehouseDetails'

// order-id from the catch-all route: 'new' → create, a warehouse id → edit.
const props = defineProps<{ orderId?: string }>()
const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')

const router = useRouter()

const NAME_MAX = 60
const CODE_MAX = 6
const DESC_MAX = 256
const PIC_MAX = 5

const name = ref('')
const code = ref('')
const address = ref('')
const description = ref('')
const picData = ref<DataInterface[]>([])

// Searchable user list — the MpInputTag chevron opens this as a searchable dropdown
const userSuggestions = [
  'Cinta Ayu',
  'Rizal Candra',
  'Budi Santoso',
  'Dewi Lestari',
  'Andi Pratama',
  'Siti Nurhaliza',
  'Maya Sari',
  'Joko Anwar',
]

const picCount = computed(() => picData.value.length)

// Edit mode — prefill the form from the existing warehouse.
onMounted(() => {
  if (!isEdit.value) return
  const w = warehouses.find((x) => x.id === props.orderId)
  if (!w) return
  name.value = w.name
  code.value = w.code
  address.value = w.address === '-' ? '' : w.address
  const detail = getWarehouseDetail(props.orderId!)
  description.value = detail && detail.description !== '—' ? detail.description : ''
  picData.value = w.pics.map((p) => ({
    id: p.id, text: p.name, value: p.name, isInvalid: false, isReadOnly: false,
  }))
})

// Errors are only triggered from the Save action — never inline while typing
const nameError = ref('')
const codeError = ref('')
const picError = ref(false)

function handlePicChange(data: DataInterface[]) {
  picData.value = data
  if (data.length > 0) picError.value = false
}

function goBack() {
  router.push(isEdit.value ? `/warehouses/${props.orderId}` : '/warehouses')
}

// Save is never disabled — validation fires here on click
function save() {
  nameError.value = ''
  codeError.value = ''
  picError.value = picData.value.length === 0

  if (!name.value.trim()) {
    nameError.value = 'You must fill in warehouse name'
  } else {
    const nameLower = name.value.trim().toLowerCase()
    const dup = warehouses.some(w => w.name.toLowerCase() === nameLower && (!isEdit.value || w.id !== props.orderId))
    if (dup) nameError.value = 'Warehouse name already exists'
  }

  if (!code.value.trim()) {
    codeError.value = 'You must fill in warehouse code'
  } else {
    const codeUpper = code.value.trim().toUpperCase()
    const dup = warehouses.some(w => w.code.toUpperCase() === codeUpper && (!isEdit.value || w.id !== props.orderId))
    if (dup) codeError.value = 'Warehouse code already exists'
  }

  if (nameError.value || codeError.value || picError.value) return

  const payload = {
    name: name.value.trim(),
    code: code.value.trim(),
    address: address.value,
    description: description.value,
    pics: picData.value.map((p, i) => ({ id: p.id || `pic-${i}`, name: p.text })),
  }

  if (isEdit.value) {
    updateWarehouse(props.orderId!, payload)
    toast.notify({ variant: 'success', title: 'Warehouse updated' , maxWidth: 'max-content'})
    router.push(`/warehouses/${props.orderId}`)
  } else {
    addWarehouse(payload)
    toast.notify({ variant: 'success', title: 'Warehouse saved' , maxWidth: 'max-content'})
    router.push('/warehouses')
  }
}
</script>

<template>
  <div class="nw-page">

    <!-- ── Page title bar (neutral-subtle bg, 72px, breadcrumb + title) ── -->
    <div class="nw-titlebar">
      <div class="nw-titlebar-left">
        <button class="nw-breadcrumb" @click="goBack">Warehouses</button>
        <h1 class="nw-title">{{ isEdit ? 'Edit warehouse' : 'New warehouse' }}</h1>
      </div>
    </div>

    <!-- ── Stage (white, rounded tl/tr, scrollable) ── -->
    <div class="nw-stage">
      <div class="nw-form-group">

        <!-- ── Section: Warehouse info ── -->
        <div class="nw-section">
          <h2 class="nw-section-title">Warehouse info</h2>
          <div class="nw-section-spacer" />

          <div class="nw-fields">

            <!-- Row: Warehouse name + Warehouse code -->
            <div class="nw-row">
              <MpFormControl id="warehouse-name" class="nw-field-name" is-required :is-invalid="!!nameError">
                <div class="nw-label-row">
                  <MpFormLabel>Warehouse name</MpFormLabel>
                  <span class="nw-counter">{{ name.length }} / {{ NAME_MAX }}</span>
                </div>
                <MpInput id="warehouse-name-input" v-model="name" :maxlength="NAME_MAX" @update:model-value="nameError = ''" />
                <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
              </MpFormControl>

              <MpFormControl id="warehouse-code" class="nw-field-code" is-required :is-invalid="!!codeError">
                <div class="nw-label-row">
                  <MpFormLabel>Warehouse code</MpFormLabel>
                  <span class="nw-counter">{{ code.length }} / {{ CODE_MAX }}</span>
                </div>
                <MpInput id="warehouse-code-input" v-model="code" :maxlength="CODE_MAX" @update:model-value="codeError = ''" />
                <MpFormErrorMessage>{{ codeError }}</MpFormErrorMessage>
              </MpFormControl>
            </div>

            <!-- PIC (input tag, max 5, searchable user dropdown) -->
            <MpFormControl id="warehouse-pic" is-required :is-invalid="picError">
              <MpFormLabel>PIC ({{ picCount }}/{{ PIC_MAX }})</MpFormLabel>
              <MpInputTag
                id="warehouse-pic-input"
                :data="picData"
                :max-tags="PIC_MAX"
                :suggestions="userSuggestions"
                :is-show-suggestions="true"
                :is-enable-create-new-tag="false"
                :is-show-icon-chevron-down="true"
                :is-invalid="picError"
                @change="handlePicChange"
              />
              <MpFormErrorMessage>You must select at least one PIC</MpFormErrorMessage>
              <MpFormHelpText>Get notified when stock runs low or a batch is near expiry</MpFormHelpText>
            </MpFormControl>

            <!-- Address -->
            <MpFormControl id="warehouse-address">
              <MpFormLabel>Address</MpFormLabel>
              <MpTextarea id="warehouse-address-input" v-model="address" is-full-width />
            </MpFormControl>

            <!-- Description -->
            <MpFormControl id="warehouse-description">
              <div class="nw-label-row">
                <MpFormLabel>Description</MpFormLabel>
                <span class="nw-counter">{{ description.length }} / {{ DESC_MAX }}</span>
              </div>
              <MpTextarea id="warehouse-description-input" v-model="description" :maxlength="DESC_MAX" is-full-width />
            </MpFormControl>

          </div>
        </div>

        <!-- ── Action group ── -->
        <div class="nw-action-group">
          <div class="nw-action-right">
            <button class="nw-btn-cancel" @click="goBack">Cancel</button>
            <button class="nw-btn-save" @click="save">{{ isEdit ? 'Save changes' : 'Save' }}</button>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Page shell ── */
.nw-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Title bar (matches page-title-bar doc: 72px, neutral-subtle, breadcrumb above H1, no gap) ── */
.nw-titlebar {
  flex-shrink: 0;
  height: 72px;
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}

.nw-titlebar-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}

.nw-breadcrumb {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link);
  font-family: inherit;
  white-space: nowrap;
}
.nw-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }

.nw-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.nw-stage {
  flex: 1;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}

/* ── Form group (564px, matches Figma) ── */
.nw-form-group {
  width: 564px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.nw-section {
  display: flex;
  flex-direction: column;
}

.nw-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}

/* 12px spacer between section title and first field */
.nw-section-spacer {
  height: 12px;
}

.nw-fields {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
}

/* ── Name + code row ── */
.nw-row {
  display: flex;
  gap: var(--mp-spacing-6);
  align-items: flex-start;
}
.nw-field-name {
  width: 368px;
  flex-shrink: 0;
}
.nw-field-code {
  flex: 1;
  min-width: 0;
}

/* ── Label row with char counter ── */
.nw-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-1);
  width: 100%;
}

.nw-counter {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: var(--mp-font-weights-regular);
  line-height: 16px;
  color: var(--mp-text-secondary);
  text-align: right;
}

/* ── Action group ── */
.nw-action-group {
  display: flex;
  align-items: center;
  padding: var(--mp-spacing-4) 0;
}

.nw-action-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  margin-left: auto;
}

.nw-btn-cancel {
  background: transparent;
  border: none;
  border-radius: var(--mp-radii-full, 999px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  font-family: inherit;
}
.nw-btn-cancel:hover { background: var(--mp-background-neutral-hovered); }

.nw-btn-save {
  background: var(--mp-colors-emerald-700, #029861);
  border: 1px solid var(--mp-colors-emerald-700, #029861);
  border-radius: var(--mp-radii-full, 999px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-inverse);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.nw-btn-save:hover { background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a); }
</style>
