<script setup lang="ts">
import { ref, computed } from 'vue'
import { MpCheckbox, MpIcon, MpInput, MpInputGroup, MpInputLeftAddon } from '@mekari/pixel3'
import { notifications as allNotifications, type Notification } from '~/data/notifications'
import NotificationListItem from '~/components/patterns/NotificationListItem.vue'
import NotificationDetailPane from '~/components/patterns/NotificationDetailPane.vue'

const search = ref('')
const checkedIds = ref<Set<string>>(new Set())
const selectedId = ref<string | null>(allNotifications[0]?.id ?? null)

const filtered = computed<Notification[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return allNotifications
  return allNotifications.filter(n =>
    n.title.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q),
  )
})

const groups = computed(() => {
  const order: string[] = []
  const map = new Map<string, Notification[]>()
  for (const n of filtered.value) {
    if (!map.has(n.group)) {
      map.set(n.group, [])
      order.push(n.group)
    }
    map.get(n.group)!.push(n)
  }
  return order.map(group => ({ group, items: map.get(group)! }))
})

const selectedIndex = computed(() => filtered.value.findIndex(n => n.id === selectedId.value))
const selected = computed<Notification | null>(() => filtered.value[selectedIndex.value] ?? null)
const hasPrev = computed(() => selectedIndex.value > 0)
const hasNext = computed(() => selectedIndex.value >= 0 && selectedIndex.value < filtered.value.length - 1)

const allChecked = computed(() =>
  filtered.value.length > 0 && filtered.value.every(n => checkedIds.value.has(n.id)),
)

function selectNotification(id: string) {
  selectedId.value = id
}

function toggleChecked(id: string) {
  const s = new Set(checkedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  checkedIds.value = s
}

function toggleAll() {
  if (allChecked.value) {
    checkedIds.value = new Set()
  } else {
    checkedIds.value = new Set(filtered.value.map(n => n.id))
  }
}

function goPrev() {
  if (hasPrev.value) selectedId.value = filtered.value[selectedIndex.value - 1]!.id
}

function goNext() {
  if (hasNext.value) selectedId.value = filtered.value[selectedIndex.value + 1]!.id
}
</script>

<template>
  <div class="nv">
    <div class="nv-list">
      <div class="nv-list-header">
        <div class="nv-list-title-row">
          <span class="nv-select-all" @click.stop>
            <MpCheckbox id="nv-select-all" :is-checked="allChecked" @change="toggleAll" />
          </span>
          <h1 class="nv-title">Notifications</h1>
        </div>
        <MpInputGroup id="nv-search" is-full-width>
          <MpInputLeftAddon><MpIcon name="search" size="md" /></MpInputLeftAddon>
          <MpInput v-model="search" type="text" placeholder="Search..." is-full-width />
        </MpInputGroup>
      </div>

      <div class="nv-list-body">
        <template v-if="groups.length">
          <div v-for="g in groups" :key="g.group" class="nv-group">
            <p class="nv-group-label">{{ g.group }}</p>
            <NotificationListItem
              v-for="item in g.items"
              :key="item.id"
              :notification="item"
              :selected="item.id === selectedId"
              :checked="checkedIds.has(item.id)"
              @select="selectNotification(item.id)"
              @toggle="toggleChecked(item.id)"
            />
          </div>
        </template>
        <div v-else class="nv-empty">
          <p class="nv-empty-title">No notifications found</p>
          <p class="nv-empty-desc">Try a different search term.</p>
        </div>
      </div>
    </div>

    <div class="nv-detail">
      <NotificationDetailPane
        v-if="selected"
        :notification="selected"
        :has-prev="hasPrev"
        :has-next="hasNext"
        @prev="goPrev"
        @next="goNext"
      />
      <div v-else class="nv-empty nv-empty--detail">
        <p class="nv-empty-title">Notifications</p>
        <p class="nv-empty-desc">Notifications will show up here.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nv {
  display: flex;
  flex: 1;
  height: calc(100vh - 220px);
  min-height: 480px;
}

/* ── Left: list pane ── */
.nv-list { display: flex; flex-direction: column; width: 392px; flex-shrink: 0; height: 100%; min-height: 0; border-right: 1px solid var(--mp-border-default, #d0d6dd); }

.nv-list-header {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3, 12px);
  padding: var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px) var(--mp-spacing-3, 12px);
  flex-shrink: 0;
}
.nv-list-title-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4, 16px);
  padding: 0 var(--mp-spacing-2, 8px);
}
.nv-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  color: var(--mp-text-default);
}

.nv-list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 var(--mp-spacing-6, 24px) var(--mp-spacing-4, 16px);
}

.nv-group-label {
  margin: 0;
  padding: var(--mp-spacing-3, 12px) var(--mp-spacing-2, 8px) var(--mp-spacing-1, 6px);
  font-size: 12px;
  font-weight: var(--mp-font-weights-semi-bold);
  letter-spacing: 2.88px;
  text-transform: uppercase;
  color: var(--mp-text-secondary, #626b79);
}

/* ── Right: detail pane ── */
.nv-detail {
  flex: 1;
  min-width: 0;
  height: 100%;
}

/* ── Empty states ── */
.nv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 100%;
  min-height: 240px;
  gap: var(--mp-spacing-2);
}
.nv-empty-title {
  margin: 0;
  font-size: 18px;
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.nv-empty-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}
</style>
