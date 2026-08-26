<script setup lang="ts">
/**
 * XpmAccountsPage — XPM (Mekari Expense) "Accounts" (company wallets).
 *
 * A master–detail page (NOT an ErpTablePage index): a left wallet list + a right
 * detail column with a stats strip and Transactions / Wallet settings tabs.
 *
 * Renders inside the shared padded white stage — no title bar, no extra page
 * padding here. The shell's title-bar buttons (Edit wallet / Move money / Top up)
 * fire on the XPM action bus; this page watches `pending` and opens its drawers.
 */
import {
  MpIcon, MpBadge, MpButton, MpButtonGroup,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpInput, MpSelect, MpTextarea, MpToggle,
  toast,
} from '@mekari/pixel3'
import { xpmWallets, type XpmWallet } from '~/data/xpm'
import { formatMoney } from '~/utils/currency'
import { formatDateLong } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { useXpmActions } from '~/composables/useXpmActions'

// ── Selection state ──────────────────────────────────────────────────────────
const wallets = computed<XpmWallet[]>(() => xpmWallets)
const selectedIndex = ref(0)
const selectedWallet = computed(() => wallets.value[selectedIndex.value])

// Active currency per selected wallet — resets to the wallet's first balance.
const activeCurrency = ref(selectedWallet.value?.balances[0]?.currency ?? 'IDR')
watch(selectedIndex, () => {
  activeCurrency.value = selectedWallet.value?.balances[0]?.currency ?? 'IDR'
})

function selectWallet(i: number) { selectedIndex.value = i }

const activeBalance = computed(() => {
  const bal = selectedWallet.value?.balances.find(b => b.currency === activeCurrency.value)
  return bal?.amount ?? 0
})
const isZeroBalance = computed(() => activeBalance.value === 0)
const hasMultiCurrency = computed(() => (selectedWallet.value?.balances.length ?? 0) > 1)

// ── Stats strip (plausible per wallet+currency mock) ─────────────────────────
const stats = computed(() => {
  const cur = activeCurrency.value
  const seed = (selectedWallet.value?.id.length ?? 0) + cur.charCodeAt(0)
  const scale = cur === 'IDR' ? 1_000_000 : 100
  return [
    { caption: `Balance · ${cur}`,   value: formatMoney(activeBalance.value, cur), tone: 'default' as const },
    { caption: 'Pending payouts',    value: formatMoney((seed % 5 + 1) * scale, cur), tone: 'warning' as const },
    { caption: 'Money in · Jul',     value: formatMoney((seed % 7 + 3) * scale, cur), tone: 'success' as const },
    { caption: 'Money out · Jul',    value: formatMoney((seed % 4 + 2) * scale, cur), tone: 'default' as const },
  ]
})

// ── Movement rows (local mock, per wallet+currency) ──────────────────────────
interface MovementRow { date: string; description: string; in?: number; out?: number; balance: number }
function movementsFor(walletId: string, currency: string): MovementRow[] {
  const u = currency === 'IDR' ? 1_000_000 : 100
  const base: Record<string, MovementRow[]> = {
    'w-main': [
      { date: '2026-07-21', description: 'Top up — Bank transfer',            in: 15 * u,            balance: 15 * u },
      { date: '2026-07-20', description: 'AWS — July invoice',                          out: 8 * u,  balance: 7 * u },
      { date: '2026-07-19', description: 'FX buy — USD funding',                         out: 5 * u,  balance: 2 * u },
      { date: '2026-07-18', description: 'Card float replenish',                         out: 2 * u,  balance: 0 },
      { date: '2026-07-16', description: 'Refund — cancelled booking',        in: 1 * u,             balance: 1 * u },
    ],
    'w-reimb': [
      { date: '2026-07-21', description: 'Payout — Maya Chen',                           out: 1 * u,  balance: 6 * u },
      { date: '2026-07-20', description: 'Top up from Main account',          in: 4 * u,             balance: 7 * u },
      { date: '2026-07-19', description: 'Payout — Tom Okafor',                           out: 1 * u,  balance: 3 * u },
      { date: '2026-07-18', description: 'Payout — Indah Permata',                        out: 1 * u,  balance: 4 * u },
      { date: '2026-07-17', description: 'Top up from Main account',          in: 5 * u,             balance: 5 * u },
    ],
    'w-card': [
      { date: '2026-07-21', description: 'Adobe Creative Cloud renewal',                  out: 1 * u,  balance: 2 * u },
      { date: '2026-07-20', description: 'Figma annual seats',                            out: 3 * u,  balance: 3 * u },
      { date: '2026-07-19', description: 'Card float replenish',              in: 4 * u,             balance: 6 * u },
      { date: '2026-07-18', description: 'Google Workspace',                              out: 2 * u,  balance: 2 * u },
      { date: '2026-07-16', description: 'LinkedIn Recruiter',                            out: 1 * u,  balance: 4 * u },
    ],
  }
  return base[walletId] ?? base['w-main']!
}
const movements = computed(() => movementsFor(selectedWallet.value!.id, activeCurrency.value))

// ── Filter chips (visual only) ───────────────────────────────────────────────
const typeFilters = ['All', 'Top-ups', 'Payments', 'FX']
const periodFilters = ['This month', 'Last month', 'All time']
const activeTypeFilter = ref('All')
const activePeriodFilter = ref('This month')

// ── Tabs ─────────────────────────────────────────────────────────────────────
const activeTabIndex = ref(0)

// ── Title-bar action bus ─────────────────────────────────────────────────────
const { pending } = useXpmActions()
const showEdit = ref(false)
const showMove = ref(false)
const showTopUp = ref(false)
watch(() => pending.value, (p) => {
  if (p?.action === 'editWallet') showEdit.value = true
  else if (p?.action === 'moveMoney') showMove.value = true
  else if (p?.action === 'topUp') showTopUp.value = true
})

// ── Edit wallet drawer ───────────────────────────────────────────────────────
const eName = ref('')
const eCurrency = ref('IDR')
const eType = ref('Primary')
const eDefault = ref(false)
watch(showEdit, (open) => {
  if (open && selectedWallet.value) {
    eName.value = selectedWallet.value.name
    eCurrency.value = selectedWallet.value.balances[0]?.currency ?? 'IDR'
    eType.value = selectedWallet.value.type
    eDefault.value = !!selectedWallet.value.isDefault
  }
})
function closeEdit() { showEdit.value = false }
function saveEdit() {
  closeEdit()
  toast.notify({ variant: 'success', title: 'Wallet saved.', maxWidth: 'max-content' })
}

// ── Move money drawer ────────────────────────────────────────────────────────
const mFrom = ref('')
const mTo = ref('')
const mAmount = ref('')
const mNote = ref('')
watch(showMove, (open) => {
  if (open) {
    mFrom.value = selectedWallet.value?.name ?? ''
    mTo.value = wallets.value.find(w => w.id !== selectedWallet.value?.id)?.name ?? ''
    mAmount.value = ''
    mNote.value = ''
  }
})
function closeMove() { showMove.value = false }
function saveMove() {
  closeMove()
  toast.notify({ variant: 'success', title: 'Money moved.', maxWidth: 'max-content' })
}

// ── Top up drawer ────────────────────────────────────────────────────────────
const tAmount = ref('')
const tSource = ref('Bank transfer')
const tNote = ref('')
watch(showTopUp, (open) => { if (open) { tAmount.value = ''; tSource.value = 'Bank transfer'; tNote.value = '' } })
function closeTopUp() { showTopUp.value = false }
function saveTopUp() {
  closeTopUp()
  toast.notify({ variant: 'success', title: 'Top up complete.', maxWidth: 'max-content' })
}

// ── Funding rules (mock) ─────────────────────────────────────────────────────
const fundingRules = computed(() => {
  const map: Record<string, { scope: string; desc: string }[]> = {
    'w-main': [
      { scope: 'All branches', desc: 'Bills & vendor payouts · pays from this wallet' },
      { scope: 'Travel', desc: 'Flights & lodging · pays from this wallet' },
    ],
    'w-reimb': [
      { scope: 'All branches', desc: 'Approved reimbursements · pays from this wallet' },
      { scope: 'Cash advance', desc: 'Per-diem disbursements · pays from this wallet' },
    ],
    'w-card': [
      { scope: 'Marketing', desc: 'Subscriptions & ads · pays from this wallet' },
      { scope: 'Engineering', desc: 'Software & tooling · pays from this wallet' },
    ],
  }
  return map[selectedWallet.value!.id] ?? []
})
</script>

<template>
  <div class="acc-page">
    <!-- 1 · All-wallets summary line -->
    <p class="acc-summary">All wallets ≈ Rp25.572.177</p>

    <!-- 2 · Zero-balance warning banner -->
    <div v-if="isZeroBalance" class="acc-zero">
      <MpIcon name="warning-triangle" size="md" color="icon.warning" />
      <span class="acc-zero__text">{{ selectedWallet.name }} is at zero — top up to release pending payouts.</span>
      <MpButton variant="primary" size="sm" is-rounded @click="showTopUp = true">Top up now</MpButton>
    </div>

    <!-- 3 · Two-column master–detail -->
    <div class="acc-grid">
      <!-- LEFT · wallet list -->
      <aside class="acc-list">
        <header class="acc-list__head">Wallets</header>
        <ul class="acc-list__rows">
          <li
            v-for="(w, i) in wallets"
            :key="w.id"
            class="acc-row"
            :class="{ 'acc-row--active': i === selectedIndex }"
            @click="selectWallet(i)"
          >
            <div class="acc-row__top">
              <span class="acc-row__name">{{ w.name }}</span>
              <MpBadge v-if="w.isDefault" for="additionalInformation" type="information" size="sm">Default</MpBadge>
            </div>
            <span class="acc-row__tag">{{ w.tag }}</span>
            <div class="acc-row__balances">
              <span v-for="b in w.balances" :key="b.currency" class="acc-row__bal">
                {{ formatMoney(b.amount, b.currency) }} · {{ b.currency }}
              </span>
            </div>
          </li>
        </ul>
        <footer class="acc-list__foot">
          <MpButton variant="textLink" size="sm" left-icon="add" @click="infoToast('Add wallet — coming soon')">Add wallet</MpButton>
        </footer>
      </aside>

      <!-- RIGHT · detail -->
      <section class="acc-detail">
        <!-- Currency segmented toggle -->
        <div v-if="hasMultiCurrency" class="acc-seg">
          <button
            v-for="b in selectedWallet.balances"
            :key="b.currency"
            type="button"
            class="acc-seg__btn"
            :class="{ 'acc-seg__btn--active': activeCurrency === b.currency }"
            @click="activeCurrency = b.currency"
          >{{ b.currency }}</button>
        </div>

        <!-- Stats strip -->
        <div class="acc-stats">
          <div v-for="s in stats" :key="s.caption" class="acc-stat">
            <span class="acc-stat__caption">{{ s.caption }}</span>
            <span class="acc-stat__value" :class="`acc-stat__value--${s.tone}`">{{ s.value }}</span>
          </div>
        </div>

        <!-- Tabs -->
        <MpTabs id="acc-tabs" v-model="activeTabIndex" variant-color="green" class="acc-tabs">
          <MpTabList>
            <MpTab id="acc-tab-txn" value="transactions">Transactions</MpTab>
            <MpTab id="acc-tab-settings" value="settings">Wallet settings</MpTab>
          </MpTabList>
          <MpTabPanels>
            <!-- Transactions -->
            <MpTabPanel value="transactions">
              <div class="acc-txn">
                <h3 class="acc-txn__title">{{ selectedWallet.name }} · {{ activeCurrency }} movement</h3>

                <div class="acc-txn__filters">
                  <div class="acc-chips">
                    <button
                      v-for="f in typeFilters"
                      :key="f"
                      type="button"
                      class="acc-chip"
                      :class="{ 'acc-chip--active': activeTypeFilter === f }"
                      @click="activeTypeFilter = f"
                    >{{ f }}</button>
                  </div>
                  <div class="acc-chips">
                    <button
                      v-for="f in periodFilters"
                      :key="f"
                      type="button"
                      class="acc-chip"
                      :class="{ 'acc-chip--active': activePeriodFilter === f }"
                      @click="activePeriodFilter = f"
                    >{{ f }}</button>
                  </div>
                  <div class="acc-search">
                    <MpIcon name="search" size="md" />
                    <input class="acc-search__input" type="text" placeholder="Search movement…" />
                  </div>
                </div>

                <div class="acc-table-wrap">
                  <table class="acc-table">
                    <thead>
                      <tr>
                        <th class="acc-th">Date</th>
                        <th class="acc-th">Description</th>
                        <th class="acc-th acc-th--right">Money in</th>
                        <th class="acc-th acc-th--right">Money out</th>
                        <th class="acc-th acc-th--right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(m, i) in movements" :key="i" class="acc-tr">
                        <td class="acc-td">{{ formatDateLong(m.date) }}</td>
                        <td class="acc-td">{{ m.description }}</td>
                        <td class="acc-td acc-td--right acc-td--in">{{ m.in != null ? formatMoney(m.in, activeCurrency) : '—' }}</td>
                        <td class="acc-td acc-td--right acc-td--out">{{ m.out != null ? formatMoney(m.out, activeCurrency) : '—' }}</td>
                        <td class="acc-td acc-td--right">{{ formatMoney(m.balance, activeCurrency) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </MpTabPanel>

            <!-- Wallet settings -->
            <MpTabPanel value="settings">
              <div class="acc-settings">
                <!-- Wallet details -->
                <div class="acc-card">
                  <div class="acc-card__head">
                    <div class="acc-card__heading">
                      <span class="acc-card__title">Wallet details</span>
                      <span class="acc-card__sub">Name, purpose and the people accountable for this wallet</span>
                    </div>
                    <MpButton variant="secondary" size="sm" is-rounded @click="showEdit = true">Edit</MpButton>
                  </div>
                  <dl class="acc-dl">
                    <div class="acc-dl__row"><dt>Wallet name</dt><dd>{{ selectedWallet.name }}</dd></div>
                    <div class="acc-dl__row"><dt>Description</dt><dd>{{ selectedWallet.description }}</dd></div>
                    <div class="acc-dl__row"><dt>Wallet type</dt><dd>{{ selectedWallet.type }}</dd></div>
                    <div class="acc-dl__row"><dt>Currency</dt><dd>{{ selectedWallet.balances.map(b => b.currency).join(', ') }}</dd></div>
                    <div class="acc-dl__row"><dt>Default account</dt><dd>{{ selectedWallet.isDefault ? 'Yes' : 'No' }}</dd></div>
                    <div class="acc-dl__row"><dt>Wallet owner</dt><dd>Finance team</dd></div>
                    <div class="acc-dl__row"><dt>Created on</dt><dd>{{ formatDateLong('2026-01-14') }}</dd></div>
                  </dl>
                </div>

                <!-- Funding rules -->
                <div class="acc-card">
                  <div class="acc-card__head">
                    <div class="acc-card__heading">
                      <span class="acc-card__title">Funding rules</span>
                      <span class="acc-card__sub">Which spend this wallet pays for — by branch, type and policy</span>
                    </div>
                    <MpButton variant="secondary" size="sm" is-rounded @click="infoToast('Add rule — coming soon')">Add rule</MpButton>
                  </div>
                  <ul class="acc-rules">
                    <li v-for="(r, i) in fundingRules" :key="i" class="acc-rule">
                      <MpBadge for="additionalInformation" type="announcement" size="sm">{{ r.scope }}</MpBadge>
                      <span class="acc-rule__desc">{{ r.desc }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </MpTabPanel>
          </MpTabPanels>
        </MpTabs>
      </section>
    </div>
  </div>

  <!-- ── Edit wallet drawer ── -->
  <MpDrawer
    id="xpm-edit-wallet-drawer"
    :is-open="showEdit"
    placement="right"
    size="md"
    variant="floating"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeEdit"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="dr-card">
          <div class="dr-header">
            <span class="dr-title">Edit wallet</span>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeEdit" />
          </div>
          <div class="dr-form">
            <MpFormControl id="ew-name">
              <MpFormLabel>Wallet name</MpFormLabel>
              <MpInput id="ew-name-input" v-model="eName" is-full-width />
            </MpFormControl>
            <MpFormControl id="ew-currency">
              <MpFormLabel>Currency</MpFormLabel>
              <MpSelect id="ew-currency-select" v-model="eCurrency" is-full-width>
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="SGD">SGD</option>
                <option value="AUD">AUD</option>
              </MpSelect>
            </MpFormControl>
            <MpFormControl id="ew-type">
              <MpFormLabel>Wallet type</MpFormLabel>
              <MpSelect id="ew-type-select" v-model="eType" is-full-width>
                <option value="Primary">Primary</option>
                <option value="Sub-wallet">Sub-wallet</option>
                <option value="Card float">Card float</option>
              </MpSelect>
            </MpFormControl>
            <div class="dr-toggle-row">
              <div class="dr-toggle-info">
                <span class="dr-toggle-title">Default account</span>
                <span class="dr-toggle-hint">Use this wallet as the company default for new spend</span>
              </div>
              <MpToggle v-model:is-checked="eDefault" aria-label="Default account" />
            </div>
          </div>
          <div class="dr-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="closeEdit">Cancel</MpButton>
              <MpButton variant="primary" is-rounded @click="saveEdit">Save changes</MpButton>
            </MpButtonGroup>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>

  <!-- ── Move money drawer ── -->
  <MpDrawer
    id="xpm-move-money-drawer"
    :is-open="showMove"
    placement="right"
    size="md"
    variant="floating"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeMove"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="dr-card">
          <div class="dr-header">
            <span class="dr-title">Move money</span>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeMove" />
          </div>
          <div class="dr-form">
            <MpFormControl id="mm-from">
              <MpFormLabel>From wallet</MpFormLabel>
              <MpSelect id="mm-from-select" v-model="mFrom" is-full-width>
                <option v-for="w in wallets" :key="w.id" :value="w.name">{{ w.name }}</option>
              </MpSelect>
            </MpFormControl>
            <MpFormControl id="mm-to">
              <MpFormLabel>To wallet</MpFormLabel>
              <MpSelect id="mm-to-select" v-model="mTo" is-full-width>
                <option v-for="w in wallets" :key="w.id" :value="w.name">{{ w.name }}</option>
              </MpSelect>
            </MpFormControl>
            <MpFormControl id="mm-amount">
              <MpFormLabel>Amount</MpFormLabel>
              <MpInput id="mm-amount-input" v-model="mAmount" placeholder="0" is-full-width />
            </MpFormControl>
            <MpFormControl id="mm-note">
              <MpFormLabel>Note</MpFormLabel>
              <MpTextarea id="mm-note-textarea" v-model="mNote" is-full-width :rows="3" placeholder="What is this transfer for?" />
            </MpFormControl>
          </div>
          <div class="dr-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="closeMove">Cancel</MpButton>
              <MpButton variant="primary" is-rounded left-icon="transfer" @click="saveMove">Move money</MpButton>
            </MpButtonGroup>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>

  <!-- ── Top up drawer ── -->
  <MpDrawer
    id="xpm-top-up-drawer"
    :is-open="showTopUp"
    placement="right"
    size="md"
    variant="floating"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeTopUp"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="dr-card">
          <div class="dr-header">
            <span class="dr-title">Top up</span>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeTopUp" />
          </div>
          <div class="dr-form">
            <MpFormControl id="tu-amount">
              <MpFormLabel>Amount</MpFormLabel>
              <MpInput id="tu-amount-input" v-model="tAmount" placeholder="0" is-full-width />
            </MpFormControl>
            <MpFormControl id="tu-source">
              <MpFormLabel>Source</MpFormLabel>
              <MpSelect id="tu-source-select" v-model="tSource" is-full-width>
                <option value="Bank transfer">Bank transfer</option>
                <option value="From Main account">From Main account</option>
                <option value="Virtual account">Virtual account</option>
              </MpSelect>
            </MpFormControl>
            <MpFormControl id="tu-note">
              <MpFormLabel>Note</MpFormLabel>
              <MpTextarea id="tu-note-textarea" v-model="tNote" is-full-width :rows="3" placeholder="Reference or reason for this top up" />
            </MpFormControl>
          </div>
          <div class="dr-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="closeTopUp">Cancel</MpButton>
              <MpButton variant="primary" is-rounded @click="saveTopUp">Top up</MpButton>
            </MpButtonGroup>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
.acc-page { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

/* 1 · summary line */
.acc-summary { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* 2 · zero-balance banner */
.acc-zero {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-warning);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-warning-subtle);
}
.acc-zero__text { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* 3 · master–detail grid */
.acc-grid { display: grid; grid-template-columns: 320px 1fr; gap: var(--mp-spacing-4); align-items: start; }
@media (max-width: 900px) { .acc-grid { grid-template-columns: 1fr; } }

/* LEFT · wallet list */
.acc-list {
  display: flex; flex-direction: column;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
  overflow: hidden;
}
.acc-list__head {
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.acc-list__rows { list-style: none; margin: 0; padding: 0; }
.acc-row {
  position: relative;
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
  cursor: pointer;
}
.acc-row:hover { background: var(--mp-background-neutral-hovered); }
.acc-row--active { background: var(--mp-background-brand-selected, var(--mp-background-neutral-subtle)); }
.acc-row--active::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: var(--mp-border-selected, #0f6d4d);
}
.acc-row__top { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.acc-row__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.acc-row__tag { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.acc-row__balances { display: flex; flex-direction: column; gap: 2px; margin-top: var(--mp-spacing-1); }
.acc-row__bal { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.acc-list__foot { padding: var(--mp-spacing-2) var(--mp-spacing-3); }

/* RIGHT · detail */
.acc-detail { display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-width: 0; }

/* segmented currency toggle */
.acc-seg {
  display: inline-flex; align-self: flex-start;
  padding: 3px; gap: 2px;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle);
}
.acc-seg__btn {
  padding: var(--mp-spacing-1) var(--mp-spacing-4);
  border: none; background: transparent; cursor: pointer;
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.acc-seg__btn--active { background: var(--mp-background-neutral); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }

/* stats strip */
.acc-stats {
  display: grid; grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
  overflow: hidden;
}
.acc-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-4); border-left: 1px solid var(--mp-border-default); }
.acc-stat:first-child { border-left: none; }
.acc-stat__caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.acc-stat__value { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.acc-stat__value--warning { color: var(--mp-text-warning, #b25e02); }
.acc-stat__value--success { color: var(--mp-text-success, #0a7a4a); }
@media (max-width: 720px) { .acc-stats { grid-template-columns: repeat(2, 1fr); } .acc-stat:nth-child(3) { border-left: none; } }

/* tabs */
.acc-tabs { width: 100%; }

/* transactions */
.acc-txn { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-4); }
.acc-txn__title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.acc-txn__filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-3); }
.acc-chips { display: inline-flex; gap: var(--mp-spacing-2); }
.acc-chip {
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-sm); cursor: pointer;
}
.acc-chip--active { border-color: var(--mp-border-selected, #0f6d4d); background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.acc-search {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto;
  width: 220px; padding: var(--mp-spacing-1) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral); color: var(--mp-text-subtle);
}
.acc-search__input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.acc-search__input::placeholder { color: var(--mp-text-placeholder); }

/* movement table */
.acc-table-wrap { overflow-x: auto; }
.acc-table { width: 100%; border-collapse: collapse; }
.acc-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  text-align: left; text-transform: uppercase; letter-spacing: 0.04em;
  font-size: var(--mp-font-sizes-xs, 12px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.acc-th--right { text-align: right; }
.acc-tr:hover { background: var(--mp-background-neutral-hovered); }
.acc-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  vertical-align: middle;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.acc-td--right { text-align: right; }
.acc-td--in { color: var(--mp-text-success, #0a7a4a); }
.acc-td--out { color: var(--mp-text-default); }

/* wallet settings */
.acc-settings { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-4); }
.acc-card {
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
  padding: var(--mp-spacing-4);
}
.acc-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); }
.acc-card__heading { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.acc-card__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.acc-card__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.acc-dl { margin: 0; display: flex; flex-direction: column; }
.acc-dl__row { display: grid; grid-template-columns: 180px 1fr; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); }
.acc-dl__row:last-child { border-bottom: none; }
.acc-dl__row dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.acc-dl__row dd { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.acc-rules { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.acc-rule { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; }
.acc-rule__desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* ── Drawers (floating card) ── */
.dr-card { display: flex; flex-direction: column; height: 100%; }
.dr-header {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.dr-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dr-form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }
.dr-toggle-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.dr-toggle-info { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.dr-toggle-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dr-toggle-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.dr-footer { display: flex; justify-content: flex-end; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
</style>
