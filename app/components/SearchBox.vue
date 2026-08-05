<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { MpIcon, toast } from '@mekari/pixel3'

const props = withDefaults(defineProps<{
  placeholder?: string
  width?: string
  // 'header' keeps the collapsed trigger looking like the dark header pill
  // (translucent, ⌘K hint) and only turns white with the dropdown on click.
  variant?: 'default' | 'header'
}>(), {
  placeholder: 'Search or create',
  width: '652px',
  variant: 'default',
})

// Header trigger keeps its compact translucent look until opened.
const collapsed = computed(() => props.variant === 'header' && !searchOpen.value)

// Emits the current AI-mode state so a host (e.g. the Home hero) can react
// (glow behind the box).
const emit = defineEmits<{ aimode: [boolean] }>()

const router = useRouter()
// Airene chat panel is driven through a global bridge — works whether this box
// sits inside the routed page (Home hero) or above it (header).
const airene = useAireneBridge()

function soon(what: string) {
  toast.notify({ variant: 'info', title: `${what} — coming soon`, maxWidth: 'max-content' })
}

// ── Dropdown state ──────────────────────────────────────────────────────────
const searchQuery = ref('')
const searchOpen = ref(false)
const searchWrapEl = ref<HTMLElement | null>(null)
const searchTabs = ['Sales', 'Purchases', 'Expenses', 'Products', 'Contacts', 'Files']
const activeSearchTab = ref('Sales')

interface SearchItem { label: string; go: () => void }
function nav(path: string): () => void { return () => { closeSearch(); router.push(path) } }
function todo(what: string): () => void { return () => { closeSearch(); soon(what) } }

const recent = ref<SearchItem[]>([
  { label: 'Purchase Order #10500', go: nav('/inbound-delivery') },
  { label: 'Sales order',           go: nav('/sales-orders') },
  { label: 'Hungry Birds',          go: nav('/sales-invoices') },
])
const files = ref<SearchItem[]>([
  { label: 'procreate-invoice-10090.pdf', go: todo('Open file') },
])

const QUICK_ACTIONS: Record<string, SearchItem[]> = {
  Sales: [
    { label: 'New sales invoice', go: nav('/sales-invoices') },
    { label: 'New sales order',   go: nav('/sales-orders') },
    { label: 'New sales quote',   go: nav('/sales-quotes') },
  ],
  Purchases: [
    { label: 'New purchase invoice', go: nav('/purchase-invoices') },
    { label: 'New purchase order',   go: todo('New purchase order') },
    { label: 'New purchase request', go: todo('New purchase request') },
  ],
  Expenses: [{ label: 'New expense', go: todo('New expense') }],
  Products: [{ label: 'New product', go: nav('/product-list/new') }],
  Contacts: [
    { label: 'New customer', go: todo('New customer') },
    { label: 'New vendor',   go: todo('New vendor') },
  ],
  Files: [],
}
const quickActions = computed<SearchItem[]>(() => QUICK_ACTIONS[activeSearchTab.value] ?? [])
function clearSearchHistory() { recent.value = []; files.value = [] }

// ── AI Mode ─────────────────────────────────────────────────────────────────
const aiMode = ref(false)
const AI_PLACEHOLDER = "What's the top selling product this month?"
const recentChats = ref<string[]>([
  'Are there duplicate transactions in this period?',
  'Explain why expenses increased this month.',
  "What's driving the drop in profit margin?",
])
const suggestedPrompts = [
  'How to connect bank feeds to Mekari ERP?',
  'Summarize budget variance for the last quarter.',
  "What's the top selling product this month?",
  "Why doesn't my bank balance match my books?",
  'Which products are low on stock or need restocking?',
  "Which customers haven't paid yet?",
]
function clearAiChats() { recentChats.value = [] }
function setAi(v: boolean) { aiMode.value = v; emit('aimode', v) }
// AI Mode button: switch to AI mode (prompts) — does NOT open the chat drawer.
function toggleAiMode() { setAi(!aiMode.value); searchOpen.value = true }
// Sending a prompt opens the Airene chat drawer with that prompt.
function askAi(text: string) {
  const t = (text ?? '').trim()
  if (!t) return
  closeSearch()
  airene.requestSend(t)
  searchQuery.value = ''
}

function openSearch() { searchOpen.value = true }
function closeSearch() { searchOpen.value = false; setAi(false) }
function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { closeSearch(); (e.target as HTMLElement)?.blur() }
  else if (e.key === 'Enter' && aiMode.value) { e.preventDefault(); askAi(searchQuery.value) }
}
function onSearchOutside(e: MouseEvent) {
  if (searchOpen.value && !searchWrapEl.value?.contains(e.target as Node)) closeSearch()
}
onMounted(() => document.addEventListener('click', onSearchOutside))
onUnmounted(() => document.removeEventListener('click', onSearchOutside))
</script>

<template>
  <div ref="searchWrapEl" class="search-wrap" :class="{ 'search-wrap--header': variant === 'header' }" :style="{ width: props.width }">
    <div class="search" :class="{ 'search--open': searchOpen, 'search--ai': aiMode, 'search--header': variant === 'header' }">
      <div class="search__row">
        <MpIcon name="search" size="md" class="search__icon" />
        <input
          v-model="searchQuery"
          type="text"
          class="search__input"
          :placeholder="aiMode ? AI_PLACEHOLDER : props.placeholder"
          @focus="openSearch()"
          @click="openSearch()"
          @keydown="onSearchKeydown"
        >
        <span v-if="collapsed" class="search__cmdk">⌘K</span>
        <button v-else class="ai-mode" :class="{ 'ai-mode--active': aiMode }" type="button" @click.stop="toggleAiMode()">
          <svg class="ai-mode__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10.9077 8.22842L10.5112 8.17805C9.1059 7.99858 8.00071 6.89127 7.82266 5.48602L7.77514 5.11147C7.69781 4.49787 7.09344 4.08431 6.45714 4.08431C5.82793 4.08431 5.22497 4.48085 5.1441 5.09232L5.09374 5.48885C4.91427 6.8941 3.80695 7.99929 2.4017 8.17734L2.02716 8.22487C1.40008 8.30645 1 8.90657 1 9.54287C1 10.1792 1.3788 10.7793 2.00801 10.8559L2.40454 10.9063C3.80979 11.0857 4.91498 12.1931 5.09303 13.5983L5.14056 13.9728C5.21788 14.6113 5.82226 15 6.45856 15C7.08776 15 7.69852 14.5715 7.77159 13.992L7.82195 13.5955C8.00142 12.1902 9.10874 11.085 10.514 10.907L10.8885 10.8594C11.5192 10.7793 11.9157 10.1777 11.9157 9.54145C11.9157 8.90515 11.5199 8.30503 10.9077 8.22842Z" fill="currentColor"/>
            <path d="M14.4956 3.07205L14.2977 3.04651C13.5955 2.95643 13.0422 2.40312 12.9535 1.70085L12.9301 1.51358C12.8911 1.20643 12.5889 1 12.2711 1C11.9561 1 11.6553 1.19791 11.6142 1.50436L11.5887 1.70227C11.4986 2.40454 10.9453 2.95784 10.243 3.04651L10.0557 3.06992C9.7422 3.11107 9.54216 3.41113 9.54216 3.72892C9.54216 4.04672 9.73156 4.34749 10.0465 4.38579L10.2444 4.41133C10.9467 4.50142 11.5 5.05472 11.5887 5.75699L11.6121 5.94427C11.6504 6.26348 11.9533 6.45785 12.2711 6.45785C12.586 6.45785 12.8911 6.24362 12.9279 5.95349L12.9535 5.75558C13.0436 5.05331 13.5969 4.5 14.2991 4.41133L14.4864 4.38792C14.8021 4.3482 15 4.04672 15 3.72892C15 3.41113 14.8021 3.11107 14.4956 3.07205Z" fill="currentColor"/>
          </svg>
          AI Mode
        </button>
      </div>

      <div v-if="searchOpen" class="search__panel">
        <!-- AI Mode: suggested prompts + recent chats -->
        <template v-if="aiMode">
          <div v-if="recentChats.length" class="search__group">
            <div class="search__group-head">
              <span class="search__group-title">Recent chats</span>
              <button class="search__clear" type="button" @click.stop="clearAiChats">Clear</button>
            </div>
            <button v-for="c in recentChats" :key="c" class="search__item" type="button" @click="askAi(c)">
              <MpIcon name="comment" size="md" class="search__item-icon" />
              <span>{{ c }}</span>
            </button>
          </div>

          <div class="search__group">
            <span class="search__group-title">Suggested prompts</span>
            <button v-for="p in suggestedPrompts" :key="p" class="search__item" type="button" @click="askAi(p)">
              <svg class="search__item-icon search__item-icon--ai" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M12.9489 11.7105C10.5135 11.3995 8.59878 9.48057 8.29024 7.04641C8.29023 7.04632 8.29025 7.0465 8.29024 7.04641L8.23974 6.64842C8.2257 6.64025 8.20678 6.63122 8.18304 6.62343C8.14733 6.61171 8.10875 6.60546 8.0714 6.60546C8.03118 6.60546 7.99052 6.61199 7.95383 6.62371C7.93489 6.62976 7.91929 6.63645 7.90695 6.64273L7.85508 7.05116C7.54405 9.48653 5.62511 11.4013 3.19095 11.7098C3.19086 11.7098 3.19104 11.7098 3.19095 11.7098L2.78862 11.7609C2.78211 11.7729 2.77485 11.7891 2.76829 11.8095C2.75687 11.845 2.75 11.886 2.75 11.9286C2.75 11.9799 2.75781 12.0267 2.76958 12.0649C2.77275 12.0751 2.77602 12.0842 2.7792 12.0921L3.1957 12.145C5.63107 12.456 7.5458 14.3749 7.85434 16.8091C7.85433 16.809 7.85435 16.8092 7.85434 16.8091L7.90599 17.2161C7.91627 17.2209 7.92906 17.2261 7.94451 17.231C7.98157 17.2426 8.02586 17.25 8.07318 17.25C8.10071 17.25 8.13516 17.2451 8.17197 17.2328C8.19876 17.2238 8.22141 17.2127 8.239 17.2019L8.2895 16.8043C8.60053 14.369 10.5195 12.4542 12.9536 12.1457C12.9535 12.1457 12.9537 12.1457 12.9536 12.1457L13.3575 12.0944C13.3635 12.0829 13.37 12.0678 13.376 12.049C13.3875 12.013 13.3946 11.971 13.3946 11.9269C13.3946 11.8824 13.3875 11.8396 13.3757 11.8024C13.3707 11.7868 13.3654 11.7736 13.3603 11.7628L12.9489 11.7105ZM13.1425 13.6338C11.3859 13.8563 10.0018 15.2378 9.77742 16.9944L9.71446 17.49C9.62313 18.2145 8.85968 18.75 8.07318 18.75C7.2778 18.75 6.52233 18.2641 6.42568 17.4661L6.36627 16.9979C6.14371 15.2414 4.76223 13.8572 3.00567 13.6329L2.51 13.5699C1.7235 13.4742 1.25 12.724 1.25 11.9286C1.25 11.1333 1.7501 10.3831 2.53395 10.2811L3.00212 10.2217C4.75868 9.99917 6.14283 8.61769 6.36716 6.86113L6.43012 6.36546C6.5312 5.60113 7.2849 5.10546 8.0714 5.10546C8.86678 5.10546 9.62225 5.62241 9.7189 6.38941L9.77831 6.85758C10.0009 8.61414 11.3823 9.99829 13.1389 10.2226L13.6346 10.2856C14.3998 10.3813 14.8946 11.1315 14.8946 11.9269C14.8946 12.7222 14.3989 13.4742 13.6106 13.5744L13.1425 13.6338ZM12.8038 3.80814L12.5697 3.8374C12.1778 3.88883 11.9277 4.2639 11.9277 4.66115C11.9277 5.05839 12.1645 5.43435 12.5582 5.48223L12.8055 5.51415C13.6834 5.62676 14.375 6.31839 14.4858 7.19623L14.5151 7.43032C14.563 7.82933 14.9416 8.07229 15.3389 8.07229C15.7326 8.07229 16.1138 7.80451 16.1599 7.44184L16.1919 7.19445C16.3045 6.31662 16.9961 5.62499 17.8739 5.51415L18.108 5.48489C18.5026 5.43524 18.75 5.05839 18.75 4.66115C18.75 4.2639 18.5026 3.88883 18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3389 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00567 13.6816 3.6973 12.8038 3.80814ZM15.3388 3.91203C15.1292 4.1987 14.8764 4.45161 14.5897 4.66124C14.8764 4.87079 15.1293 5.12358 15.339 5.41026C15.5485 5.12359 15.8013 4.87069 16.088 4.66105C15.8013 4.4515 15.5484 4.19871 15.3388 3.91203Z" fill="currentColor"/>
              </svg>
              <span>{{ p }}</span>
            </button>
          </div>
        </template>

        <!-- Normal search -->
        <template v-else>
          <div class="search__scope">
            <span class="search__scope-label">Search in:</span>
            <button
              v-for="t in searchTabs"
              :key="t"
              class="scope-pill"
              :class="{ 'scope-pill--active': activeSearchTab === t }"
              type="button"
              @click="activeSearchTab = t"
            >{{ t }}</button>
          </div>

          <div v-if="recent.length" class="search__group">
            <div class="search__group-head">
              <span class="search__group-title">Recent searches</span>
              <button class="search__clear" type="button" @click.stop="clearSearchHistory">Clear</button>
            </div>
            <button v-for="r in recent" :key="r.label" class="search__item" type="button" @click="r.go()">
              <MpIcon name="time" size="md" class="search__item-icon" />
              <span>{{ r.label }}</span>
            </button>
          </div>

          <div v-if="quickActions.length" class="search__group">
            <span class="search__group-title">Quick actions</span>
            <button v-for="q in quickActions" :key="q.label" class="search__item" type="button" @click="q.go()">
              <MpIcon name="add" size="md" class="search__item-icon" />
              <span>{{ q.label }}</span>
            </button>
          </div>

          <div v-if="files.length" class="search__group">
            <span class="search__group-title">Files</span>
            <button v-for="f in files" :key="f.label" class="search__item" type="button" @click="f.go()">
              <MpIcon name="pdf" size="md" class="search__item-icon" />
              <span>{{ f.label }}</span>
            </button>
          </div>
        </template>

        <div class="search__foot">
          <span class="search__hint"><kbd class="search__kbd">↵</kbd> to search</span>
          <span class="search__hint"><kbd class="search__kbd">ESC</kbd> to close</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-wrap {
  position: relative;
  max-width: 100%;
  height: 52px;
}
.search {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-bold, #8c9596);
  border-radius: var(--mp-radii-full, 999px);
  box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.14), 0px 0px 1px rgba(0, 0, 0, 0.12);
}

/* Open — a gentle eased slide downward, played once on mount. Close is a plain
   v-if removal (instant, no leave frame) so there's no snag on outside-click. */
.search__panel {
  transform-origin: top;
  animation: search-pop-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes search-pop-in {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.search--open {
  border-radius: var(--mp-radii-xl, 12px);
  box-shadow: 0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -2px rgba(0, 0, 0, 0.05);
}

/* AI Mode: animated purple gradient border ring around the whole container. */
@property --ai-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
/* No base border in AI mode — the gradient ring below is the only border, and
   removing the 1px border keeps the ring an even thickness (incl. corners). */
.search--ai { border: none; }
.search--ai::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  background: conic-gradient(from var(--ai-angle), #8270db, #6aa1ff, #b39dff, #8270db);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  animation: ai-border-spin 3s linear infinite;
  pointer-events: none;
}
@keyframes ai-border-spin { to { --ai-angle: 360deg; } }

.search__row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  height: 50px;
  padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-4);
}

/* ── Header variant: collapsed trigger keeps the dark translucent pill look ── */
.search-wrap--header { height: 36px; }
/* When opened, the header dropdown widens to the hero width and re-centers over
   the compact trigger. */
.search--header.search--open {
  width: 652px;
  max-width: 80vw;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
}
.search--header:not(.search--open) {
  background: var(--mp-colors-background-header-menu-hovered, rgba(255, 255, 255, 0.08));
  border: none;
  box-shadow: none;
}
.search--header:not(.search--open) .search__row {
  height: 36px;
  padding: 0 var(--mp-spacing-3);
}
.search--header:not(.search--open) .search__icon { color: #fff; opacity: 0.5; }
.search--header:not(.search--open) .search__input { color: #fff; }
.search--header:not(.search--open) .search__input::placeholder { color: #fff; opacity: 0.5; }
.search__cmdk {
  flex-shrink: 0;
  padding: 2px var(--mp-spacing-1\.5, 6px);
  border-radius: var(--mp-radii-sm, 4px);
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  opacity: 0.5;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 1.4;
}
.search__icon { color: var(--mp-text-secondary, #3a4749); flex-shrink: 0; }
.search__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default, #080d0e);
}
.search__input::placeholder { color: var(--mp-text-placeholder, #6e7a7c); }

/* AI Mode button */
.ai-mode {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1\.5, 6px);
  height: 36px;
  padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary, #3a4749);
  cursor: pointer;
  flex-shrink: 0;
}
.ai-mode:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.ai-mode__icon { color: #8270db; }
.ai-mode--active {
  background: #8270db;
  border-color: #8270db;
  color: #fff;
}
.ai-mode--active:hover { background: #7460c9; }
.ai-mode--active .ai-mode__icon { color: #fff; }

/* Expanded panel */
.search__panel {
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
  padding: var(--mp-spacing-4) 0 0;
  display: flex;
  flex-direction: column;
  text-align: left;
}
.search__scope {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--mp-spacing-1, 4px);
  padding: 0 var(--mp-spacing-4) var(--mp-spacing-4);
}
.search__scope-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-right: var(--mp-spacing-1); }
.scope-pill {
  padding: 2px var(--mp-spacing-3);
  border-radius: var(--mp-radii-full, 999px);
  border: none;
  background: transparent;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary, #3a4749);
  cursor: pointer;
}
.scope-pill:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.scope-pill--active {
  background: var(--mp-background-brand-selected, #d6f4e9);
  color: var(--mp-text-selected, #0f6d4d);
  font-weight: var(--mp-font-weights-semi-bold);
}
.search__group { display: flex; flex-direction: column; padding: var(--mp-spacing-2) var(--mp-spacing-2) 0; }
.search__group-head { display: flex; align-items: center; justify-content: space-between; }
.search__group-title {
  padding: 0 var(--mp-spacing-2) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.search__clear { background: none; border: none; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); padding: 0 var(--mp-spacing-2) var(--mp-spacing-1); }
.search__clear:hover { color: var(--mp-text-default); text-decoration: underline; }
.search__item {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: 10px var(--mp-spacing-3);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  border-radius: var(--mp-radii-md, 8px);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default, #080d0e);
}
.search__item:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.search__item-icon { color: var(--mp-text-secondary, #3a4749); flex-shrink: 0; }
.search__item-icon--ai { color: #8270db; }
.search__foot {
  margin-top: var(--mp-spacing-3);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom-left-radius: var(--mp-radii-xl, 12px);
  border-bottom-right-radius: var(--mp-radii-xl, 12px);
}
.search__hint { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.search__kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 4px;
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-sm, 4px);
  font-size: 11px;
  color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
}
</style>
