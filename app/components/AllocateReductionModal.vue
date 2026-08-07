<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalCloseButton, MpModalOverlay, MpButton, MpInput, toast,
} from '@mekari/pixel3'

/** One SKU whose reduction is spread across ≥2 pending picking tasks (D7 AC#3/#4). */
export interface AllocTask { taskId: string; taskNo: string; currentQty: number; reduceBy: number; soleLine: boolean }
export interface SkuReductionGroup { sku: string; productName: string; toRemove: number; tasks: AllocTask[] }

const props = defineProps<{ open: boolean; groups: SkuReductionGroup[] }>()
const emit = defineEmits<{ close: []; confirm: [allocations: Record<string, { taskId: string; reduceBy: number }[]>] }>()

// Draft reduce-by per task, keyed `${sku}::${taskId}`. Seeded from the default proposal.
const draft = ref<Record<string, string>>({})
const K = (sku: string, taskId: string) => `${sku}::${taskId}`

function seed() {
  const next: Record<string, string> = {}
  for (const g of props.groups) for (const t of g.tasks) next[K(g.sku, t.taskId)] = String(t.reduceBy)
  draft.value = next
}
watch(() => props.open, (v) => { if (v) seed() })
watch(() => props.groups, () => { if (props.open) seed() })

function val(sku: string, taskId: string): number {
  const n = Number(draft.value[K(sku, taskId)])
  return Number.isFinite(n) && n >= 0 ? n : 0
}
function assigned(g: SkuReductionGroup): number { return g.tasks.reduce((s, t) => s + val(g.sku, t.taskId), 0) }
function remaining(g: SkuReductionGroup): number { return g.toRemove - assigned(g) }
/** A row is over its own task qty (invalid). */
function overCap(g: SkuReductionGroup, t: AllocTask): boolean { return val(g.sku, t.taskId) > t.currentQty }
function rowBadge(g: SkuReductionGroup, t: AllocTask): string {
  const r = val(g.sku, t.taskId)
  if (r <= 0) return 'Untouched'
  if (r >= t.currentQty) return t.soleLine ? 'Task will be canceled' : 'SKU removed from task'
  return `${t.currentQty - r} will remain`
}
const allValid = computed(() => props.groups.every((g) =>
  remaining(g) === 0 && g.tasks.every((t) => !overCap(g, t))))

function handleConfirm() {
  if (!allValid.value) {
    const bad = props.groups.find((g) => remaining(g) !== 0 || g.tasks.some((t) => overCap(g, t)))
    const msg = bad && bad.tasks.some((t) => overCap(bad, t))
      ? `A task can’t give back more than it holds`
      : bad ? `${bad.productName}: assign exactly ${bad.toRemove} across the tasks (${remaining(bad) > 0 ? `${remaining(bad)} left` : `${-remaining(bad)} over`})`
      : 'Check the allocation'
    toast.notify({ variant: 'error', title: msg, maxWidth: 'max-content' })
    return
  }
  const allocations: Record<string, { taskId: string; reduceBy: number }[]> = {}
  for (const g of props.groups) allocations[g.sku] = g.tasks.map((t) => ({ taskId: t.taskId, reduceBy: val(g.sku, t.taskId) }))
  emit('confirm', allocations)
}
</script>

<template>
  <MpModal id="alloc-modal" :is-open="open" size="lg" :is-keep-alive="false" @close="emit('close')">
    <MpModalContent>
      <MpModalHeader>
        Choose where to reduce
        <MpModalCloseButton />
      </MpModalHeader>

      <MpModalBody>
        <p class="al-intro">
          You’re lowering the quantity of a SKU that’s split across several picking tasks.
          Pick how much to take back from each — a task emptied this way is cancelled.
        </p>

        <ul class="al-rules">
          <li>A task reduced to 0 is cancelled automatically.</li>
          <li>A task that still has qty left stays Open, but needs warehouse-manager re-arrangement acknowledgement before it can start.</li>
          <li>The default below drains the smallest tasks first — you can adjust the amounts, but they must sum to the total reduction exactly.</li>
        </ul>

        <div v-for="g in groups" :key="g.sku" class="al-group">
          <div class="al-group-head">
            <div class="al-group-title">
              <span class="al-prod">{{ g.productName }}</span>
              <span class="al-sku">{{ g.sku }}</span>
            </div>
            <span class="al-remaining" :class="{ 'al-remaining--ok': remaining(g) === 0, 'al-remaining--bad': remaining(g) !== 0 }">
              {{ remaining(g) === 0 ? `${g.toRemove} of ${g.toRemove} assigned` : `${assigned(g)} of ${g.toRemove} assigned` }}
            </span>
          </div>

          <div class="al-table-wrap">
            <table class="al-table">
              <colgroup>
                <col />
                <col style="width: 120px" />
                <col style="width: 130px" />
                <col style="width: 180px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="al-th">Picking task</th>
                  <th class="al-th al-th--num">In task</th>
                  <th class="al-th al-th--num">Reduce by</th>
                  <th class="al-th">Result</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in g.tasks" :key="t.taskId" class="al-tr">
                  <td class="al-td"><span class="al-taskno">{{ t.taskNo }}</span></td>
                  <td class="al-td al-td--num">{{ t.currentQty }}</td>
                  <td class="al-td al-td--input" :class="{ 'al-td--err': overCap(g, t) }">
                    <MpInput
                      :id="`al-${g.sku}-${t.taskId}`"
                      v-model="draft[K(g.sku, t.taskId)]"
                      type="number"
                      is-full-width
                      :is-invalid="overCap(g, t)"
                    />
                  </td>
                  <td class="al-td">
                    <span class="al-badge" :class="{ 'al-badge--cancel': val(g.sku, t.taskId) >= t.currentQty && t.soleLine }">
                      {{ rowBadge(g, t) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </MpModalBody>

      <MpModalFooter>
        <div class="al-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="handleConfirm">Apply reduction</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.al-intro {
  margin: 0 0 var(--mp-spacing-6) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-lg, 20px);
}
.al-rules {
  margin: 0 0 var(--mp-spacing-6) 0; padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex; flex-direction: column; gap: var(--mp-spacing-1\.5);
  list-style: disc; padding-left: var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-lg, 20px);
}
.al-group { margin-bottom: var(--mp-spacing-8); }
.al-group:last-child { margin-bottom: 0; }
.al-group-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-3);
}
.al-group-title { display: flex; align-items: baseline; gap: var(--mp-spacing-2); min-width: 0; }
.al-prod { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.al-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.al-remaining { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium); white-space: nowrap; }
.al-remaining--ok { color: var(--mp-text-success, #1a7f56); }
.al-remaining--bad { color: var(--mp-text-danger, #e2483d); }

.al-table-wrap { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.al-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }

.al-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.al-th--num { text-align: right; }

.al-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.al-tr:last-child .al-td { border-bottom: none; }
.al-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.al-td--input { padding: 0; }
.al-td--input :deep([class*='input']) { border-radius: 0; border-color: transparent; }
.al-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.al-td--err { background: #FCEEED; border-bottom-color: #E2483D; }
.al-td--err :deep([class*='input']) { background: transparent; }

.al-taskno { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.al-badge { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.al-badge--cancel { color: var(--mp-text-danger, #e2483d); font-weight: var(--mp-font-weights-medium); }

.al-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
