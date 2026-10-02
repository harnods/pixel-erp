<script setup lang="ts">
import { MpButton, MpIcon, css } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'

const props = withDefaults(defineProps<{
  currentPage: number
  perPage: number
  total: number
}>(), {
  currentPage: 1,
  perPage: 25,
  total: 0,
})

const emit = defineEmits<{
  pageChange: [page: number]
  perPageChange: [perPage: number]
}>()

const perPageOptions = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
]

const perPageModel = computed({
  get: () => String(props.perPage),
  set: (v: string) => emit('perPageChange', Number(v)),
})

const totalPages  = computed(() => Math.max(1, Math.ceil(props.total / props.perPage)))
const rangeStart  = computed(() => props.total === 0 ? 0 : (props.currentPage - 1) * props.perPage + 1)
const rangeEnd    = computed(() => Math.min(props.currentPage * props.perPage, props.total))

/* ---------- css() styles ---------- */

const paginationClass = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--mp-spacing-2, 8px)',
  flexShrink: 0,
})

const leftClass = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--mp-spacing-6, 24px)',
})

const perpageClass = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--mp-spacing-3, 12px)',
})

const labelClass = css({
  fontSize: 'var(--mp-font-sizes-md, 14px)',
  lineHeight: 'var(--mp-line-heights-md, 20px)',
  color: 'var(--mp-text-secondary)',
  whiteSpace: 'nowrap',
})

const showingClass = css({
  fontSize: 'var(--mp-font-sizes-md, 14px)',
  lineHeight: 'var(--mp-line-heights-md, 20px)',
  color: 'var(--mp-text-secondary)',
  whiteSpace: 'nowrap',
})

const rightClass = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--mp-spacing-4, 16px)',
})

const navClass = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--mp-spacing-2, 8px)',
})
</script>

<template>
  <div :class="paginationClass">

    <!-- Left: Rows per page + Showing -->
    <div :class="leftClass">
      <div :class="perpageClass">
        <span :class="labelClass">Rows per page</span>
        <ErpFilterSelect
          id="pagination-per-page"
          v-model="perPageModel"
          placeholder="25"
          :options="perPageOptions"
          :is-clearable="false"
          width="80px"
        />
      </div>
      <span :class="showingClass">Showing {{ rangeStart }}-{{ rangeEnd }} of {{ total }}</span>
    </div>

    <!-- Right: Page X of Y + nav -->
    <div :class="rightClass">
      <span :class="labelClass">Page {{ currentPage }} of {{ totalPages }}</span>
      <div :class="navClass">
        <MpButton
          variant="ghost"
          size="sm"
          left-icon="chevrons-left"
          :is-disabled="currentPage <= 1"
          aria-label="Previous page"
          @click="emit('pageChange', currentPage - 1)"
        />
        <MpButton
          variant="ghost"
          size="sm"
          left-icon="chevrons-right"
          :is-disabled="currentPage >= totalPages"
          aria-label="Next page"
          @click="emit('pageChange', currentPage + 1)"
        />
      </div>
    </div>

  </div>
</template>
