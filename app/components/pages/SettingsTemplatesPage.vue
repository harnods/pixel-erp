<!-- prod-parity: jurnal-doctor/services/quickbook/app/views/company/setting.html.haml (Template menu: _email_template_*.html.haml, _pdf_signature.html.haml, _signature_fields.html.haml, _whatsapp_sales_*_template.html.haml) + jurnal-frontend-app/src/pages/settings/templates/pages/custom_pdf -->
<script setup lang="ts">
import {
  MpIcon, MpInput, MpTextarea, MpToggle, MpCheckbox, MpRadio, MpTooltip, MpInputTag,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpSegmentedControl,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  type DataInterface,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { infoToast, successToast } from '~/utils/toasts'
import {
  TEMPLATE_NAV, EMAIL_TEMPLATE_META, WHATSAPP_TEMPLATE_META,
  SIGNATURE_TYPE_OPTIONS, SIGNATURE_FIELD_OPTIONS,
  PDF_DOC_TYPE_OPTIONS, PDF_TEMPLATE_IDS, PDF_DATE_FORMATS, PDF_CONTENT_SIZES, PDF_PREVIEW_SAMPLE,
  TEMPLATE_COMPANY_NAME, TEMPLATE_USER_NAME,
  getTemplateSettings, saveTemplateSettings, newSignature,
  type TemplateSection, type EmailTemplateKey, type WhatsappTemplateKey, type PdfDocType,
  type CustomPdfSetting, type Signature, type SignatureLine,
} from '~/data/templateSettings'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// ─── Section (left sub-navigation, deep-linked by the prod hash) ─────────────
const ALL_SECTIONS = TEMPLATE_NAV.flatMap((g) => g.items.map((i) => i.id))
const section = ref<TemplateSection>('email_template_sales')
watch(() => route.hash, (h) => {
  const id = (h || '').replace('#', '') as TemplateSection
  if (ALL_SECTIONS.includes(id)) section.value = id
}, { immediate: true })
function go(id: TemplateSection) {
  section.value = id
  router.replace({ query: route.query, hash: `#${id}` })
}

const emailKey = computed<EmailTemplateKey | null>(() =>
  (Object.keys(EMAIL_TEMPLATE_META) as EmailTemplateKey[]).find((k) => EMAIL_TEMPLATE_META[k].section === section.value) ?? null)
const waKey = computed<WhatsappTemplateKey | null>(() =>
  (Object.keys(WHATSAPP_TEMPLATE_META) as WhatsappTemplateKey[]).find((k) => WHATSAPP_TEMPLATE_META[k].section === section.value) ?? null)

// ─── Store (committed) + per-section drafts ──────────────────────────────────
const committed = reactive(getTemplateSettings())
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
function persist() { saveTemplateSettings(clone(committed)) }

// Insert a [Variable] at the caret of the textarea inside `wrapId`.
function insertAt(wrapId: string, current: string, token: string): { value: string; caret: number } {
  const el = document.querySelector<HTMLTextAreaElement>(`#${wrapId} textarea, textarea#${wrapId}`)
  const start = el?.selectionStart ?? current.length
  const end = el?.selectionEnd ?? current.length
  return { value: current.slice(0, start) + token + current.slice(end), caret: start + token.length }
}
function restoreCaret(wrapId: string, caret: number) {
  nextTick(() => {
    const el = document.querySelector<HTMLTextAreaElement>(`#${wrapId} textarea, textarea#${wrapId}`)
    if (!el) return
    el.focus()
    el.setSelectionRange(caret, caret)
  })
}

// ─── Email templates ─────────────────────────────────────────────────────────
const emailDraft = reactive(clone(committed.email))
const emailErrors = reactive<{ subject: string; message: string }>({ subject: '', message: '' })
watch(emailKey, () => { emailErrors.subject = ''; emailErrors.message = '' })
function insertEmailVar(token: string) {
  const k = emailKey.value; if (!k) return
  const r = insertAt('tpl-email-message', emailDraft[k].message, token)
  emailDraft[k].message = r.value
  restoreCaret('tpl-email-message', r.caret)
}
function saveEmail() {
  const k = emailKey.value; if (!k) return
  emailErrors.subject = emailDraft[k].subject.trim() ? '' : t('You must fill in subject')
  emailErrors.message = emailDraft[k].message.trim() ? '' : t('You must fill in message')
  if (emailErrors.subject || emailErrors.message) return
  committed.email[k] = clone(emailDraft[k])
  persist()
  successToast(t('Successfully processed.'))
}

// ─── PDF signature (General Setting) ─────────────────────────────────────────
const sigDraft = reactive(clone(committed.pdfSignature))
const sigError = ref('')
const DRAFT_WATERMARK_TOOLTIP = 'Draft Watermark only applicable when Approval feature is active'
const sigTypeSuggestions = SIGNATURE_TYPE_OPTIONS
const sigFieldOptions = SIGNATURE_FIELD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))

function typeData(s: Signature): DataInterface[] {
  return s.types.map((v) => ({ id: v, text: v, value: v, isInvalid: false, isReadOnly: false }))
}
function onTypesChange(s: Signature, data: DataInterface[]) {
  s.types = data.map((d) => String(d.text))
  sigError.value = ''
}
function lineValue(l: SignatureLine): string {
  if (l.option === 'user_name') return TEMPLATE_USER_NAME
  if (l.option === 'company_name') return TEMPLATE_COMPANY_NAME
  return l.text
}
function setLineOption(l: SignatureLine, v: string) {
  l.option = (v || 'custom') as SignatureLine['option']
}
function addSignature() { sigDraft.signatures.push(newSignature()) }
function removeSignature(id: string) {
  sigDraft.signatures = sigDraft.signatures.filter((s) => s.id !== id)
  sigError.value = ''
}
function removeImage(s: Signature) { s.imageName = null }

const previewSig = ref<Signature | null>(null)

function saveSignature() {
  const seen = new Set<string>()
  const dup = sigDraft.signatures.some((s) => s.types.some((ty) => (seen.has(ty) ? true : (seen.add(ty), false))))
  if (dup) { sigError.value = t('You have duplicate signature type'); return }
  sigError.value = ''
  committed.pdfSignature = clone(sigDraft)
  persist()
  successToast(t('Your data has been update'))
}

// ─── Customize PDF ───────────────────────────────────────────────────────────
const docType = ref<string>('')
const docOptions = PDF_DOC_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
const pdfDraft = reactive(clone(committed.customPdf))
const pdfTab = ref<'header' | 'content'>('header')
const pdfTabData = computed(() => [
  { id: 'custom_header', label: t('Header'), value: 'header' },
  { id: 'custom_content', label: t('Content'), value: 'content' },
])
const lastModified = reactive<Record<string, string>>({
  sales_invoice: `${t('Last modified by')} ${TEMPLATE_USER_NAME} ${t('on')} 12/09/2026 14:32`,
})
const pdf = computed<CustomPdfSetting | null>(() => (docType.value ? pdfDraft[docType.value as PdfDocType] : null))
const templateOptions = computed(() =>
  docType.value ? PDF_TEMPLATE_IDS[docType.value as PdfDocType].map((id) => ({ value: id, label: `Template ${id}` })) : [])
const dateFormatOptions = PDF_DATE_FORMATS.map((f) => ({ value: f, label: f }))
const contentSizeOptions = PDF_CONTENT_SIZES.map((o) => ({ value: o.value, label: t(o.label) }))
const pdfEdited = computed(() =>
  !!docType.value && JSON.stringify(pdfDraft[docType.value as PdfDocType]) !== JSON.stringify(committed.customPdf[docType.value as PdfDocType]))
const docTypeName = computed(() => PDF_DOC_TYPE_OPTIONS.find((o) => o.value === docType.value)?.label ?? '')

const deactivateOpen = ref(false)
const resetOpen = ref(false)

function onToggleActive() {
  const p = pdf.value; if (!p) return
  if (p.isActive) { deactivateOpen.value = true; return }
  p.isActive = true
  committed.customPdf[docType.value as PdfDocType].isActive = true
  persist()
  successToast(t('Template custom activated'))
}
function confirmDeactivate() {
  const k = docType.value as PdfDocType
  pdfDraft[k] = { ...clone(committed.customPdf[k]), isActive: false }
  committed.customPdf[k].isActive = false
  persist()
  deactivateOpen.value = false
  successToast(t('Template custom deactivated'))
}
function requestReset() {
  if (pdf.value?.isActive && pdfEdited.value) resetOpen.value = true
}
function confirmReset() {
  const k = docType.value as PdfDocType
  pdfDraft[k] = clone(committed.customPdf[k])
  resetOpen.value = false
  successToast(t('Template reset to previous version'))
}
function savePdf() {
  const k = docType.value as PdfDocType; if (!k) return
  committed.customPdf[k] = clone(pdfDraft[k])
  persist()
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  lastModified[k] = `${t('Last modified by')} ${TEMPLATE_USER_NAME} ${t('on')} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  successToast(t('Pdf setting successfully saved'))
}
function onTitleId(v: string) {
  const p = pdf.value; if (!p) return
  p.titleId = v
  if (p.applyBoth) p.titleEn = v
}
function onApplyBoth() {
  const p = pdf.value; if (!p) return
  p.applyBoth = !p.applyBoth
  if (p.applyBoth) p.titleEn = p.titleId
}

const S = PDF_PREVIEW_SAMPLE
const previewTitle = computed(() => pdf.value?.titleEn || docTypeName.value)
const previewDate = computed(() => S.date[pdf.value?.formatDate ?? 'DD-MM-YYYY'] ?? '')

// ─── WhatsApp templates ─────────────────────────────────────────────────────
const waDraft = reactive(clone(committed.whatsapp))
const waError = ref('')
watch(waKey, () => { waError.value = '' })
function insertWaVar(token: string) {
  const k = waKey.value; if (!k) return
  const r = insertAt('tpl-wa-message', waDraft[k].message, token)
  waDraft[k].message = r.value
  restoreCaret('tpl-wa-message', r.caret)
}
function saveWa() {
  const k = waKey.value; if (!k) return
  const msg = waDraft[k].message
  if (!msg.trim()) { waError.value = t('You must fill in message'); return }
  if (/\p{Extended_Pictographic}/u.test(msg)) { waError.value = t('Message cannot contain emoji'); return }
  waError.value = ''
  committed.whatsapp[k] = clone(waDraft[k])
  persist()
  successToast(t('Successfully processed.'))
}

function notInPrototype() { infoToast(t('Not in this prototype')) }
</script>

<template>
  <div class="tpl-page">
    <!-- ── Left · Template sub-navigation ── -->
    <nav class="tpl-nav" :aria-label="t('Template')">
      <div v-for="g in TEMPLATE_NAV" :key="g.header" class="tpl-nav__group">
        <span class="tpl-nav__header">{{ t(g.header) }}</span>
        <a
          v-for="it in g.items"
          :key="it.id"
          :href="`#${it.id}`"
          class="tpl-nav__item"
          :class="{ 'tpl-nav__item--active': section === it.id }"
          @click.prevent="go(it.id)"
        >{{ t(it.label) }}</a>
      </div>
    </nav>

    <!-- ── Right · section content ── -->
    <div class="tpl-main">

      <!-- Email templates -->
      <section v-if="emailKey" :key="emailKey" class="tpl-section">
        <h2 class="tpl-section__title">{{ t(EMAIL_TEMPLATE_META[emailKey].title) }}</h2>

        <div class="tpl-form">
          <MpFormControl id="tpl-email-subject-fc" :is-invalid="!!emailErrors.subject">
            <MpFormLabel>{{ t('Subject') }}</MpFormLabel>
            <MpInput id="tpl-email-subject" v-model="emailDraft[emailKey].subject" :is-invalid="!!emailErrors.subject" @input="emailErrors.subject = ''" />
            <MpFormErrorMessage v-if="emailErrors.subject">{{ emailErrors.subject }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="tpl-email-message-fc" :is-invalid="!!emailErrors.message">
            <MpFormLabel>{{ t('Message') }}</MpFormLabel>
            <div id="tpl-email-message" class="tpl-textarea tpl-textarea--tall">
              <MpTextarea id="tpl-email-message-input" :rows="15" v-model="emailDraft[emailKey].message" :is-invalid="!!emailErrors.message" @input="emailErrors.message = ''" />
            </div>
            <MpFormErrorMessage v-if="emailErrors.message">{{ emailErrors.message }}</MpFormErrorMessage>
          </MpFormControl>

          <div class="tpl-vars">
            <span class="tpl-vars__label">{{ t('Variable') }}</span>
            <div class="tpl-vars__list">
              <a
                v-for="v in EMAIL_TEMPLATE_META[emailKey].variables"
                :key="v"
                href="#"
                role="button"
                class="tpl-var"
                @click.prevent="insertEmailVar(v)"
              >{{ v }}</a>
            </div>
          </div>

          <div class="tpl-actions">
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="saveEmail">{{ t('Update Template') }}</button>
          </div>
        </div>
      </section>

      <!-- PDF Setup (General Setting) -->
      <section v-else-if="section === 'pdf_signature'" class="tpl-section">
        <h2 class="tpl-section__title">{{ t('PDF Setup') }}</h2>

        <div class="tpl-form">
          <div class="tpl-switches">
            <div class="tpl-switch">
              <span class="tpl-switch__label">{{ t('Use Footer') }}</span>
              <MpToggle id="tpl-use-footer" v-model:is-checked="sigDraft.useFooter" :aria-label="t('Use Footer')" />
              <MpTooltip id="tpl-use-footer-tt" :label="t('Footer will appear at the bottom of each page, containing transaction number and page information (e.g. Invoice #10001 Page 1 of 3)')" placement="right" use-portal>
                <MpIcon name="help" size="sm" class="tpl-help" />
              </MpTooltip>
            </div>
            <div class="tpl-switch">
              <span class="tpl-switch__label">{{ t('Use Signature') }}</span>
              <MpToggle id="tpl-use-signature" v-model:is-checked="sigDraft.useSignature" :aria-label="t('Use Signature')" />
            </div>
            <div class="tpl-switch">
              <span class="tpl-switch__label">{{ t('Use Draft Watermark') }}</span>
              <MpToggle id="tpl-use-watermark" v-model:is-checked="sigDraft.useDraftWatermark" :aria-label="t('Use Draft Watermark')" />
              <MpTooltip id="tpl-use-watermark-tt" :label="t(DRAFT_WATERMARK_TOOLTIP)" placement="right" use-portal>
                <MpIcon name="help" size="sm" class="tpl-help" />
              </MpTooltip>
            </div>
            <div class="tpl-switch">
              <span class="tpl-switch__label">{{ t('Use QR Code Mekaripay') }}</span>
              <MpToggle id="tpl-use-qr" v-model:is-checked="sigDraft.useQrMekaripay" :aria-label="t('Use QR Code Mekaripay')" />
              <MpTooltip id="tpl-use-qr-tt" :label="t('To show the QR Code at sales print PDF')" placement="right" use-portal>
                <MpIcon name="help" size="sm" class="tpl-help" />
              </MpTooltip>
            </div>
          </div>

          <div v-if="sigDraft.useSignature" class="tpl-sigs">
            <div v-for="(s, si) in sigDraft.signatures" :key="s.id" class="tpl-sig">
              <div class="tpl-sig__head">
                <span class="tpl-sig__title">{{ t('Signature') }} {{ si + 1 }}</span>
                <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="removeSignature(s.id)">{{ t('Delete') }}</button>
              </div>

              <MpFormControl :id="`tpl-sig-types-${s.id}-fc`">
                <MpFormLabel>{{ t('Use this signature for') }}</MpFormLabel>
                <MpInputTag
                  :id="`tpl-sig-types-${s.id}`"
                  :data="typeData(s)"
                  :suggestions="sigTypeSuggestions"
                  :is-show-suggestions="true"
                  :is-enable-create-new-tag="false"
                  :is-show-icon-chevron-down="true"
                  @change="(d: DataInterface[]) => onTypesChange(s, d)"
                />
              </MpFormControl>

              <div class="tpl-sig__body">
                <div class="tpl-sig__image" role="button" tabindex="0" @click="notInPrototype" @keydown.enter="notInPrototype">
                  <template v-if="s.imageName">
                    <span class="tpl-sig__scribble" aria-hidden="true">{{ TEMPLATE_USER_NAME }}</span>
                    <span class="tpl-sig__file">{{ s.imageName }}</span>
                    <MpTooltip :id="`tpl-sig-rm-${s.id}`" :label="t('Delete')" placement="top" use-portal>
                      <span class="tpl-sig__rm" role="button" tabindex="0" @click.stop="removeImage(s)" @keydown.enter.stop="removeImage(s)">
                        <MpIcon name="close" size="sm" />
                      </span>
                    </MpTooltip>
                  </template>
                  <template v-else>
                    <MpIcon name="upload" size="md" />
                    <span class="tpl-sig__choose">{{ t('Choose File') }}</span>
                    <span class="tpl-caption">{{ t('recommended size:') }}<br>{{ t('100x100 (px)') }}</span>
                  </template>
                </div>

                <div class="tpl-sig__lines">
                  <div v-for="(l, li) in s.lines" :key="li" class="tpl-sig__line">
                    <ErpFilterSelect
                      :id="`tpl-sig-${s.id}-opt-${li}`"
                      :model-value="l.option"
                      :placeholder="t('Custom (Type Manually)')"
                      :options="sigFieldOptions"
                      :is-clearable="false"
                      width="220px"
                      @update:model-value="(v: string) => setLineOption(l, v)"
                    />
                    <MpInput
                      v-if="l.option === 'custom'"
                      :id="`tpl-sig-${s.id}-text-${li}`"
                      v-model="l.text"
                      :aria-label="`${t('Signature')} ${si + 1} · ${li + 1}`"
                    />
                    <span v-else class="tpl-sig__resolved">{{ lineValue(l) }}</span>
                  </div>
                </div>
              </div>

              <div class="tpl-sig__foot">
                <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="previewSig = s">{{ t('Preview') }}</button>
              </div>
            </div>

            <div>
              <button type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="addSignature">
                <MpIcon name="add" size="sm" />
                {{ t('Add Other Signature') }}
              </button>
            </div>
          </div>

          <p class="tpl-caption">
            {{ t('Note') }} : {{ t('We cannot guarantee that printed digital signature from this feature has complied with legislations or has been certified legally. For more information please visit') }}
            <a class="tpl-link" href="http://jdihn.id/jdihn.bphn2017/file_peraturan/12pp082.pdf" target="_blank" rel="noopener">{{ t('here') }}</a>
          </p>

          <p v-if="sigError" class="tpl-error">{{ sigError }}</p>
          <div class="tpl-actions">
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="saveSignature">{{ t('Save') }}</button>
          </div>
        </div>
      </section>

      <!-- Customize PDF -->
      <section v-else-if="section === 'customize_pdf'" class="tpl-section">
        <h2 class="tpl-section__title">PDF</h2>

        <div class="tpl-doc">
          <MpFormControl id="tpl-pdf-doctype-fc">
            <MpFormLabel>{{ t('Document type') }}</MpFormLabel>
            <ErpFilterSelect id="tpl-pdf-doctype" v-model="docType" :placeholder="t('Select document')" :options="docOptions" :is-clearable="false" width="263px" />
          </MpFormControl>
        </div>
        <div class="tpl-dashed" />

        <div v-if="!pdf" class="tpl-blank">
          <MpIcon name="tips" size="md" />
          <span class="tpl-blank__title">{{ t('PDF template will appear here') }}</span>
          <span class="tpl-blank__desc">{{ t('Select document type to set PDF template.') }}</span>
        </div>

        <template v-else>
          <div class="tpl-activate">
            <span class="tpl-switch__label">{{ t('Activate template custom') }}</span>
            <MpToggle id="tpl-pdf-active" :is-checked="pdf.isActive" :aria-label="t('Activate template custom')" @change="onToggleActive" />
          </div>

          <div class="tpl-pdf">
            <!-- Settings column -->
            <div v-if="pdf.isActive" class="tpl-pdf__settings">
              <MpSegmentedControl id="tpl-pdf-tab" name="tpl-pdf-tab" v-model="pdfTab" :data="pdfTabData" is-full-width />

              <!-- Header -->
              <template v-if="pdfTab === 'header'">
                <div class="tpl-group">
                  <div class="tpl-row">
                    <span class="tpl-group__title">{{ t('Show company logo in PDF') }}</span>
                    <MpToggle id="tpl-pdf-logo" v-model:is-checked="pdf.logoShow" :aria-label="t('Show company logo in PDF')" />
                  </div>
                  <template v-if="pdf.logoShow">
                    <span class="tpl-group__title">{{ t('Logo position') }}</span>
                    <div class="tpl-radios">
                      <label v-for="pos in (['left', 'center', 'right'] as const)" :key="pos" class="tpl-check">
                        <MpRadio :id="`tpl-logo-${pos}`" name="tpl-logo" :is-checked="pdf.logoPosition === pos" @change="pdf.logoPosition = pos" />
                        <span>{{ t(pos === 'left' ? 'Left' : pos === 'center' ? 'Center' : 'Right') }}</span>
                      </label>
                    </div>
                  </template>
                </div>
                <div class="tpl-divider" />

                <div class="tpl-group">
                  <span class="tpl-group__title">{{ t('Title document') }}</span>
                  <div class="tpl-lang">
                    <span class="tpl-lang__tag">ID</span>
                    <MpInput id="tpl-pdf-title-id" :model-value="pdf.titleId" :aria-label="`${t('Title document')} ID`" @update:model-value="(v: string | number | undefined) => onTitleId(String(v ?? ''))" />
                  </div>
                  <div class="tpl-lang">
                    <span class="tpl-lang__tag">EN</span>
                    <MpInput id="tpl-pdf-title-en" v-model="pdf.titleEn" :is-disabled="pdf.applyBoth" :aria-label="`${t('Title document')} EN`" />
                  </div>
                  <label class="tpl-check">
                    <MpCheckbox id="tpl-pdf-apply-both" :is-checked="pdf.applyBoth" @change="onApplyBoth" />
                    <span>{{ t('Apply for both') }}</span>
                  </label>
                </div>
                <div class="tpl-divider" />

                <div class="tpl-group">
                  <span class="tpl-group__title">{{ t('Company info') }}</span>
                  <label v-for="f in ([['name', 'Company Name'], ['addr', 'Address'], ['email', 'Email'], ['phone', 'Telephone'], ['web', 'Website'], ['fax', 'Fax'], ['taxNo', 'NPWP']] as const)" :key="f[0]" class="tpl-check">
                    <MpCheckbox :id="`tpl-co-${f[0]}`" :is-checked="pdf.company[f[0]]" @change="pdf.company[f[0]] = !pdf.company[f[0]]" />
                    <span>{{ t(f[1]) }}</span>
                  </label>
                  <span class="tpl-group__title">{{ t('Recipient info') }}</span>
                  <label v-for="f in ([['displayName', 'Name'], ['companyName', 'Company Name'], ['fullName', 'Full Name'], ['addr', 'Address'], ['phone', 'Telephone'], ['email', 'Email']] as const)" :key="f[0]" class="tpl-check">
                    <MpCheckbox :id="`tpl-ct-${f[0]}`" :is-checked="pdf.contact[f[0]]" @change="pdf.contact[f[0]] = !pdf.contact[f[0]]" />
                    <span>{{ t(f[1]) }}</span>
                  </label>
                </div>
                <div class="tpl-divider" />

                <MpFormControl id="tpl-pdf-size-fc">
                  <MpFormLabel>{{ t('Content size') }}</MpFormLabel>
                  <ErpFilterSelect id="tpl-pdf-size" v-model="pdf.contentSize" :placeholder="t('Content size')" :options="contentSizeOptions" :is-clearable="false" width="100%" />
                </MpFormControl>
              </template>

              <!-- Content -->
              <template v-else>
                <MpFormControl id="tpl-pdf-date-fc">
                  <MpFormLabel>{{ t('Date format') }}</MpFormLabel>
                  <ErpFilterSelect id="tpl-pdf-date" v-model="pdf.formatDate" :placeholder="t('Date format')" :options="dateFormatOptions" :is-clearable="false" width="100%" />
                </MpFormControl>
                <div class="tpl-divider" />

                <div class="tpl-group">
                  <span class="tpl-group__title">{{ t('Transaction info') }}</span>
                  <label v-for="f in ([['customerRef', 'Customer Ref.'], ['otherDpp', 'DPP Nilai Lain'], ['multipleWithholding', 'Multi withholding'], ['tags', 'Tags'], ['warehouse', 'Warehouse']] as const)" :key="f[0]" class="tpl-check">
                    <MpCheckbox :id="`tpl-info-${f[0]}`" :is-checked="pdf.info[f[0]]" @change="pdf.info[f[0]] = !pdf.info[f[0]]" />
                    <span>{{ t(f[1]) }}</span>
                  </label>
                  <span class="tpl-group__title">{{ t('Table') }}</span>
                  <label v-for="f in ([['product', 'Product Code'], ['description', 'Description'], ['qty', 'Quantity and unit'], ['rate', 'Price per unit'], ['disc', 'Discount'], ['tax', 'Tax']] as const)" :key="f[0]" class="tpl-check">
                    <MpCheckbox :id="`tpl-line-${f[0]}`" :is-checked="pdf.lines[f[0]]" @change="pdf.lines[f[0]] = !pdf.lines[f[0]]" />
                    <span>{{ t(f[1]) }}</span>
                  </label>
                  <span class="tpl-group__title">{{ t('Message and memo') }}</span>
                  <label class="tpl-check"><MpCheckbox id="tpl-msg" :is-checked="pdf.message" @change="pdf.message = !pdf.message" /><span>{{ t('Message') }}</span></label>
                  <label class="tpl-check"><MpCheckbox id="tpl-memo" :is-checked="pdf.memo" @change="pdf.memo = !pdf.memo" /><span>Memo</span></label>
                  <label class="tpl-check"><MpCheckbox id="tpl-payinfo" :is-checked="pdf.paymentInfo" @change="pdf.paymentInfo = !pdf.paymentInfo" /><span>{{ t('Payment info') }}</span></label>
                </div>
                <div class="tpl-divider" />

                <div class="tpl-group">
                  <div class="tpl-row">
                    <span class="tpl-group__title">{{ t('Amount in words') }}</span>
                    <MpToggle id="tpl-say" v-model:is-checked="pdf.inNumberShow" :aria-label="t('Amount in words')" />
                  </div>
                  <span class="tpl-caption">{{ t('Choose nominal to be shown in the document.') }}</span>
                  <div v-if="pdf.inNumberShow" class="tpl-radios">
                    <label v-for="ty in (['total', 'balance_due'] as const)" :key="ty" class="tpl-check">
                      <MpRadio :id="`tpl-say-${ty}`" name="tpl-say" :is-checked="pdf.inNumberType === ty" @change="pdf.inNumberType = ty" />
                      <span>{{ t(ty === 'total' ? 'Total' : 'Balance due') }}</span>
                    </label>
                  </div>
                </div>
                <div class="tpl-divider" />

                <div class="tpl-group">
                  <div class="tpl-row">
                    <span class="tpl-group__title">{{ t('Signature') }}</span>
                    <MpToggle id="tpl-sig-show" v-model:is-checked="pdf.signatureShow" :aria-label="t('Signature')" />
                  </div>
                  <span class="tpl-caption">{{ t('You can upload signature in') }} <a class="tpl-link" href="#pdf_signature" @click.prevent="go('pdf_signature')">{{ t('PDF setting') }}</a></span>
                </div>
                <div class="tpl-divider" />

                <div class="tpl-group">
                  <div class="tpl-row">
                    <span class="tpl-group__title">Footer</span>
                    <MpToggle id="tpl-footer" v-model:is-checked="pdf.footer" aria-label="Footer" />
                  </div>
                  <span class="tpl-caption">{{ t('Showing transaction number and page number') }}</span>
                </div>
                <div class="tpl-divider" />

                <div class="tpl-group">
                  <div class="tpl-row">
                    <span class="tpl-group__title">{{ t('Footnote') }}</span>
                    <MpToggle id="tpl-footnote" v-model:is-checked="pdf.footnoteShow" :aria-label="t('Footnote')" />
                  </div>
                  <span class="tpl-caption">{{ t('Additional note in the bottom of the document.') }}</span>
                  <MpTextarea v-if="pdf.footnoteShow" id="tpl-footnote-text" :rows="3" v-model="pdf.footnoteText" :aria-label="t('Footnote')" />
                </div>
              </template>
            </div>

            <!-- Preview column -->
            <div class="tpl-pdf__preview">
              <div class="tpl-pdf__bar">
                <div class="tpl-pdf__bar-left">
                  <span>{{ t('Preview template') }}</span>
                  <ErpFilterSelect id="tpl-pdf-template" v-model="pdf.template" placeholder="Template" :options="templateOptions" :is-clearable="false" width="200px" />
                </div>
                <div class="tpl-pdf__bar-right">
                  <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="requestReset">{{ t('Reset template') }}</button>
                  <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="notInPrototype">{{ t('Preview') }}</button>
                  <button type="button" class="btn-enterprise btn-enterprise--primary" @click="savePdf">{{ t('Save') }}</button>
                </div>
              </div>

              <div class="tpl-pdf__stage">
                <span class="tpl-caption tpl-pdf__info"><MpIcon name="tips" size="sm" />{{ t('Changes will apply to every template for the selected document type.') }}</span>
                <div class="tpl-doc-sheet" :class="`tpl-doc-sheet--${pdf.contentSize}`">
                  <div class="tpl-doc-sheet__head" :class="`tpl-doc-sheet__head--${pdf.logoPosition}`">
                    <span v-if="pdf.logoShow" class="tpl-doc-sheet__logo">CP</span>
                    <div class="tpl-doc-sheet__co">
                      <strong v-if="pdf.company.name">{{ S.company.name }}</strong>
                      <span v-if="pdf.company.addr">{{ S.company.addr }}</span>
                      <span v-if="pdf.company.phone">{{ S.company.phone }}</span>
                      <span v-if="pdf.company.fax">Fax {{ S.company.fax }}</span>
                      <span v-if="pdf.company.email">{{ S.company.email }}</span>
                      <span v-if="pdf.company.web">{{ S.company.web }}</span>
                      <span v-if="pdf.company.taxNo">NPWP {{ S.company.taxNo }}</span>
                    </div>
                  </div>
                  <div class="tpl-doc-sheet__title">{{ previewTitle }}</div>
                  <div class="tpl-doc-sheet__meta">
                    <div class="tpl-doc-sheet__to">
                      <strong v-if="pdf.contact.displayName">{{ S.contact.displayName }}</strong>
                      <span v-if="pdf.contact.companyName">{{ S.contact.companyName }}</span>
                      <span v-if="pdf.contact.fullName">{{ S.contact.fullName }}</span>
                      <span v-if="pdf.contact.addr">{{ S.contact.addr }}</span>
                      <span v-if="pdf.contact.phone">{{ S.contact.phone }}</span>
                      <span v-if="pdf.contact.email">{{ S.contact.email }}</span>
                    </div>
                    <dl class="tpl-doc-sheet__dl">
                      <dt>No.</dt><dd>{{ S.number }}</dd>
                      <dt>{{ t('Date') }}</dt><dd>{{ previewDate }}</dd>
                      <template v-if="pdf.info.customerRef"><dt>{{ t('Customer Ref.') }}</dt><dd>{{ S.customerRef }}</dd></template>
                      <template v-if="pdf.info.tags"><dt>{{ t('Tags') }}</dt><dd>{{ S.tags }}</dd></template>
                      <template v-if="pdf.info.warehouse"><dt>{{ t('Warehouse') }}</dt><dd>{{ S.warehouse }}</dd></template>
                    </dl>
                  </div>
                  <div class="tpl-doc-sheet__table">
                    <div class="tpl-doc-sheet__tr tpl-doc-sheet__tr--head">
                      <span v-if="pdf.lines.product">{{ t('Product') }}</span>
                      <span v-if="pdf.lines.description">{{ t('Description') }}</span>
                      <span v-if="pdf.lines.qty">{{ t('Quantity and unit') }}</span>
                      <span v-if="pdf.lines.rate">{{ t('Price per unit') }}</span>
                      <span v-if="pdf.lines.disc">{{ t('Discount') }}</span>
                      <span v-if="pdf.lines.tax">{{ t('Tax') }}</span>
                      <span class="tpl-doc-sheet__amt">{{ t('Amount') }}</span>
                    </div>
                    <div v-for="ln in S.lines" :key="ln.product" class="tpl-doc-sheet__tr">
                      <span v-if="pdf.lines.product">{{ ln.product }}</span>
                      <span v-if="pdf.lines.description">{{ ln.description }}</span>
                      <span v-if="pdf.lines.qty">{{ ln.qty }}</span>
                      <span v-if="pdf.lines.rate">{{ ln.rate }}</span>
                      <span v-if="pdf.lines.disc">{{ ln.disc }}</span>
                      <span v-if="pdf.lines.tax">{{ ln.tax }}</span>
                      <span class="tpl-doc-sheet__amt">{{ ln.amount }}</span>
                    </div>
                  </div>
                  <div class="tpl-doc-sheet__totals">
                    <span>{{ t('Total') }}</span><strong>{{ S.total }}</strong>
                    <span>{{ t('Balance due') }}</span><strong>{{ S.balanceDue }}</strong>
                  </div>
                  <div v-if="pdf.inNumberShow" class="tpl-doc-sheet__say">{{ t('Amount in words') }}: {{ S.totalInWords }}</div>
                  <div class="tpl-doc-sheet__bottom">
                    <div class="tpl-doc-sheet__notes">
                      <span v-if="pdf.message">{{ t('Message') }}: {{ S.message }}</span>
                      <span v-if="pdf.memo">Memo: {{ S.memo }}</span>
                      <span v-if="pdf.paymentInfo">{{ t('Payment info') }}: Bank BCA 5485079642 a.n. {{ S.company.name }}</span>
                    </div>
                    <div v-if="pdf.signatureShow" class="tpl-doc-sheet__sign">
                      <span class="tpl-sig__scribble">{{ TEMPLATE_USER_NAME }}</span>
                      <span>{{ TEMPLATE_USER_NAME }}</span>
                    </div>
                  </div>
                  <div v-if="pdf.footnoteShow && pdf.footnoteText" class="tpl-doc-sheet__footnote">{{ pdf.footnoteText }}</div>
                  <div v-if="pdf.footer" class="tpl-doc-sheet__footer">{{ docTypeName }} #{{ S.number }} · Page 1 of 1</div>
                </div>
              </div>
            </div>
          </div>

          <p v-if="lastModified[docType]" class="tpl-caption">{{ lastModified[docType] }}</p>
        </template>
      </section>

      <!-- WhatsApp templates -->
      <section v-else-if="waKey" :key="waKey" class="tpl-section">
        <h2 class="tpl-section__title">{{ t(WHATSAPP_TEMPLATE_META[waKey].title) }}</h2>

        <div class="tpl-form">
          <MpFormControl id="tpl-wa-message-fc" :is-invalid="!!waError">
            <MpFormLabel>{{ t('Message') }}</MpFormLabel>
            <div id="tpl-wa-message" class="tpl-wa-box">
              <MpTextarea id="tpl-wa-message-input" :rows="8" v-model="waDraft[waKey].message" :is-invalid="!!waError" :aria-label="t('Message')" @input="waError = ''" />
              <p v-if="waDraft[waKey].showJurnalLink" class="tpl-wa-box__footer">Powered by Mekari Jurnal [LinkJurnal]</p>
            </div>
            <MpFormErrorMessage v-if="waError">{{ waError }}</MpFormErrorMessage>
          </MpFormControl>

          <div class="tpl-row tpl-row--start">
            <label class="tpl-check">
              <MpCheckbox id="tpl-wa-footer" :is-checked="waDraft[waKey].showJurnalLink" @change="waDraft[waKey].showJurnalLink = !waDraft[waKey].showJurnalLink" />
              <span>{{ t('Footer message') }}</span>
            </label>
            <MpTooltip id="tpl-wa-footer-tt" :label="t('If enabled, the footer message will appear in your WhatsApp template message.')" placement="right" use-portal>
              <MpIcon name="info" size="sm" class="tpl-help" />
            </MpTooltip>
          </div>

          <div class="tpl-vars tpl-vars--stacked">
            <span class="tpl-vars__label">{{ t('Available variables:') }}</span>
            <div class="tpl-vars__list">
              <a
                v-for="v in WHATSAPP_TEMPLATE_META[waKey].variables"
                :key="v"
                href="#"
                role="button"
                class="tpl-var"
                @click.prevent="insertWaVar(v)"
              >{{ v }}</a>
            </div>
          </div>

          <div class="tpl-actions">
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="saveWa">{{ t('Save Template') }}</button>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Signature preview ── -->
    <MpModal id="tpl-sig-preview" :is-open="!!previewSig" :is-close-on-esc="false" :is-close-on-overlay-click="false" size="md" @close="previewSig = null">
      <MpModalContent>
        <MpModalHeader>
          {{ t('Signature Preview (All)') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <div v-if="previewSig" class="tpl-sig-preview">
            <span v-if="previewSig.imageName" class="tpl-sig__scribble tpl-sig__scribble--lg">{{ TEMPLATE_USER_NAME }}</span>
            <strong v-for="(l, li) in previewSig.lines.filter((x) => lineValue(x))" :key="li">{{ lineValue(l) }}</strong>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <button type="button" class="btn-enterprise btn-enterprise--primary" @click="previewSig = null">OK</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Deactivate template custom ── -->
    <MpModal id="tpl-pdf-deactivate" :is-open="deactivateOpen" :is-close-on-esc="false" :is-close-on-overlay-click="false" size="md" @close="deactivateOpen = false">
      <MpModalContent>
        <MpModalHeader>
          {{ t('Deactivate template custom?') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <p class="tpl-dialog-body"><strong>{{ docTypeName }} Template {{ pdf?.template }}</strong> {{ t('will be deactivated and PDF template format will be reverted.') }}</p>
        </MpModalBody>
        <MpModalFooter>
          <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="deactivateOpen = false">{{ t('Cancel') }}</button>
          <button type="button" class="btn-enterprise btn-enterprise--danger" @click="confirmDeactivate">{{ t('Deactivate') }}</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Reset template ── -->
    <MpModal id="tpl-pdf-reset" :is-open="resetOpen" :is-close-on-esc="false" :is-close-on-overlay-click="false" size="md" @close="resetOpen = false">
      <MpModalContent>
        <MpModalHeader>
          {{ t('Reset this template?') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <p class="tpl-dialog-body">{{ t('By resetting, template will be reverted to the previous version.') }}</p>
        </MpModalBody>
        <MpModalFooter>
          <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="resetOpen = false">{{ t('Cancel') }}</button>
          <button type="button" class="btn-enterprise btn-enterprise--danger" @click="confirmReset">{{ t('Reset') }}</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.tpl-page {
  display: flex;
  gap: var(--mp-spacing-6);
  height: 100%;
  min-height: 0;
}

/* ── Left sub-navigation ── */
.tpl-nav {
  flex-shrink: 0;
  width: var(--mp-sizes-56);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
  padding-right: var(--mp-spacing-4);
  border-right: 1px solid var(--mp-border-default);
  overflow-y: auto;
}
.tpl-nav__group { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.tpl-nav__header {
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  letter-spacing: 2.88px;
  text-transform: uppercase;
  color: var(--mp-text-secondary);
}
.tpl-nav__item {
  padding: var(--mp-spacing-2);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  text-decoration: none;
}
.tpl-nav__item:hover { background: var(--mp-background-neutral-hovered); }
.tpl-nav__item--active {
  background: var(--mp-background-neutral-pressed);
  color: var(--mp-text-link);
  font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Right content ── */
.tpl-main { flex: 1; min-width: 0; overflow-y: auto; }
.tpl-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.tpl-section__title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.tpl-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); max-width: 720px; }


.tpl-vars { display: flex; gap: var(--mp-spacing-4); align-items: flex-start; }
.tpl-vars--stacked { flex-direction: column; gap: var(--mp-spacing-2); }
.tpl-vars__label {
  flex-shrink: 0;
  min-width: 80px;
  padding-top: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.tpl-vars__list { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.tpl-var {
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  text-decoration: none;
  cursor: pointer;
}
.tpl-var:hover { background: var(--mp-background-neutral-hovered); border-color: var(--mp-border-bold); }

.tpl-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); }
.tpl-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); text-align: right; }
.tpl-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.tpl-link { color: var(--mp-text-link); text-decoration: underline; cursor: pointer; }
.tpl-help { color: var(--mp-colors-icon-default); cursor: help; }
.tpl-dialog-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Toggles */
.tpl-switches { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.tpl-switch { display: grid; grid-template-columns: 240px auto auto; justify-content: start; align-items: center; column-gap: var(--mp-spacing-3); }
.tpl-switch__label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* Checkbox / radio rows — the control already carries its 12px label gap. */
.tpl-check { display: inline-flex; align-items: center; gap: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.tpl-radios { display: flex; gap: var(--mp-spacing-6); }
.tpl-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.tpl-row--start { justify-content: flex-start; }

/* Signatures */
.tpl-sigs { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.tpl-sig {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg);
}
.tpl-sig__head { display: flex; align-items: center; justify-content: space-between; }
.tpl-sig__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tpl-sig__body { display: flex; gap: var(--mp-spacing-4); align-items: flex-start; }
.tpl-sig__image {
  position: relative;
  flex-shrink: 0;
  width: calc(var(--mp-sizes-20) * 2);
  height: calc(var(--mp-sizes-22) + var(--mp-sizes-12));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2);
  border: 1px dashed var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
  text-align: center;
  cursor: pointer;
  color: var(--mp-colors-icon-default);
}
.tpl-sig__choose { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link); }
.tpl-sig__file { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.tpl-sig__rm { position: absolute; top: var(--mp-spacing-1); right: var(--mp-spacing-1); display: inline-flex; cursor: pointer; }
.tpl-sig__scribble {
  font-family: 'Brush Script MT', 'Segoe Script', cursive;
  font-size: var(--mp-font-sizes-2xl);
  color: var(--mp-text-default);
  white-space: nowrap;
}
.tpl-sig__scribble--lg { font-size: calc(var(--mp-font-sizes-2xl) * 1.5); }
.tpl-sig__lines { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.tpl-sig__line { display: flex; gap: var(--mp-spacing-3); align-items: center; }
.tpl-sig__line > :last-child { flex: 1; min-width: 0; }
.tpl-sig__resolved { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.tpl-sig__foot { display: flex; justify-content: flex-end; }
.tpl-sig-preview { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) 0; text-align: center; }

/* Customize PDF */
.tpl-dashed { border-top: 1px dashed var(--mp-border-default); }
.tpl-blank { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10) var(--mp-spacing-6); color: var(--mp-colors-icon-default); }
.tpl-blank__title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tpl-blank__desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.tpl-activate { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.tpl-pdf { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.tpl-pdf__settings { flex-shrink: 0; width: 340px; display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.tpl-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.tpl-group__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tpl-divider { border-top: 1px solid var(--mp-border-default); }
.tpl-pdf__preview { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.tpl-pdf__bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.tpl-pdf__bar-left, .tpl-pdf__bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.tpl-pdf__bar-left > span { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.tpl-pdf__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-6);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle);
}
.tpl-pdf__info { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }

/* Preview sheet */
.tpl-doc-sheet {
  width: 100%;
  max-width: 620px;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-6);
  border: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
}
.tpl-doc-sheet--small { font-size: var(--mp-font-sizes-xs); }
.tpl-doc-sheet--medium { font-size: var(--mp-font-sizes-sm); }
.tpl-doc-sheet--large { font-size: var(--mp-font-sizes-md); }
.tpl-doc-sheet__head { display: flex; gap: var(--mp-spacing-3); align-items: flex-start; }
.tpl-doc-sheet__head--center { flex-direction: column; align-items: center; text-align: center; }
.tpl-doc-sheet__head--right { flex-direction: row-reverse; text-align: right; }
.tpl-doc-sheet__logo {
  flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-12); height: var(--mp-sizes-12);
  border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-success);
  color: var(--mp-colors-text-success);
  font-weight: var(--mp-font-weights-semi-bold);
}
.tpl-doc-sheet__co, .tpl-doc-sheet__to, .tpl-doc-sheet__notes { display: flex; flex-direction: column; gap: 2px; }
.tpl-doc-sheet__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); text-align: right; }
.tpl-doc-sheet__meta { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); }
.tpl-doc-sheet__to { max-width: 50%; }
.tpl-doc-sheet__dl { display: grid; grid-template-columns: auto auto; column-gap: var(--mp-spacing-3); row-gap: 2px; margin: 0; }
.tpl-doc-sheet__dl dt { color: var(--mp-text-secondary); }
.tpl-doc-sheet__dl dd { margin: 0; }
.tpl-doc-sheet__table { display: flex; flex-direction: column; border-top: 1px solid var(--mp-border-default); }
.tpl-doc-sheet__tr { display: flex; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); }
.tpl-doc-sheet__tr > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.tpl-doc-sheet__tr--head { font-weight: var(--mp-font-weights-semi-bold); }
.tpl-doc-sheet__amt { text-align: right; }
.tpl-doc-sheet__totals { display: grid; grid-template-columns: auto auto; justify-content: end; column-gap: var(--mp-spacing-6); row-gap: 2px; text-align: right; }
.tpl-doc-sheet__say { color: var(--mp-text-secondary); }
.tpl-doc-sheet__bottom { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); align-items: flex-end; }
.tpl-doc-sheet__sign { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.tpl-doc-sheet__footnote { padding-top: var(--mp-spacing-2); border-top: 1px dashed var(--mp-border-default); color: var(--mp-text-secondary); white-space: pre-wrap; }
.tpl-doc-sheet__footer { text-align: right; color: var(--mp-text-secondary); }

.tpl-lang { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.tpl-lang__tag { flex-shrink: 0; width: 24px; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.tpl-lang > :last-child { flex: 1; min-width: 0; }

/* WhatsApp */
.tpl-wa-box { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.tpl-wa-box__footer { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
