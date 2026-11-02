// @vitest-environment happy-dom
/**
 * Other lists > File manager — the upload contract.
 *
 * Two entry points reach the same `uploadFiles`: the Add file modal and
 * dropping files anywhere on the page. What's pinned here is what they must
 * agree on, because it is what the row's `[...]` menu keys off: a freshly
 * uploaded file is UNATTACHED (no transaction number, no page), so its row
 * offers "Attach to an existing transaction" rather than "Change page". The
 * timestamp is local wall-clock — toISOString() would log a 13.31 upload as
 * 06.31 under the id-ID formatting the column uses.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useTableState } from '~/composables/useTableState'
import { managedFiles, creatablePages, attachablePages, filePageTarget, type ManagedFile } from '~/data/fileManager'
import { pendingFormAttachments, takePendingAttachments, setPendingAttachments } from '~/data/fileAttachmentHandoff'

beforeAll(() => {
  Object.assign(globalThis, {
    useTableState,
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
    useRoute: () => ({ path: '/file-manager', params: {}, query: {}, hash: '' }),
    useHead: () => {},
    definePageMeta: () => {},
    navigateTo: () => {},
    useState: (_k: string, f: () => unknown) => ref(f?.()),
  })
})

// `managedFiles` is a module-level reactive store shared with every other spec
// that imports ~/data. These tests add and delete rows, so the list is restored
// after each one — otherwise the leak shows up as unrelated specs failing
// depending on the order vitest happens to run them in.
let pristineFiles: ManagedFile[]
beforeAll(() => { pristineFiles = managedFiles.map(f => ({ ...f })) })
beforeEach(() => {
  localStorage.clear()
  managedFiles.splice(0, managedFiles.length, ...pristineFiles.map(f => ({ ...f })))
  pendingFormAttachments.value = []
})

type AddFileResult = {
  files: { name: string; sizeKB: number }[]
  mode: 'attach' | 'create'
  page: string
  transactionNo: string
  contact: string
  newRoute: string
}
type Vm = {
  onGlobalFileDrop: (files: FileList) => void
  onAddFileSubmit: (r: AddFileResult) => void
  addOpen: boolean
}

async function mountPage() {
  const Page = (await import('~/components/pages/FileManagerPage.vue')).default
  const w = mount(Page, { global: { stubs: { Teleport: true } } })
  return { w, vm: w.vm as unknown as Vm }
}

function fileList(...names: string[]): FileList {
  const dt = new DataTransfer()
  for (const n of names) dt.items.add(new File(['x'], n, { type: 'application/pdf' }))
  return dt.files
}

describe('File manager — upload', () => {
  it('drops files straight into the list, unattached', async () => {
    const { vm } = await mountPage()
    const before = managedFiles.length

    vm.onGlobalFileDrop(fileList('Bukti_Transfer_BCA.pdf', 'Nota_Warung.pdf'))

    expect(managedFiles.length).toBe(before + 2)
    const added = managedFiles.slice(0, 2)
    expect(added.map(f => f.fileName).sort())
      .toEqual(['Bukti_Transfer_BCA.pdf', 'Nota_Warung.pdf'])
    // Unattached: this is what makes the row offer Attach / Create rather
    // than Change page.
    for (const f of added) {
      expect(f.page).toBe('')
      expect(f.transactionNo).toBe('')
    }
  })

  it('stamps the upload in local wall-clock time, not UTC', async () => {
    const { vm } = await mountPage()
    vm.onGlobalFileDrop(fileList('Scan.pdf'))

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const expected = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
    expect(managedFiles[0]!.uploadedAt).toBe(expected)
  })

  it('an empty drop adds nothing', async () => {
    const { vm } = await mountPage()
    const before = managedFiles.length
    vm.onGlobalFileDrop(fileList())
    expect(managedFiles.length).toBe(before)
  })
})

describe('File manager — Add file drawer', () => {
  it('attaching files the upload against the chosen transaction', async () => {
    const { vm } = await mountPage()

    vm.onAddFileSubmit({
      files: [{ name: 'PO-1080.pdf', sizeKB: 128 }],
      mode: 'attach',
      page: 'Sales invoice',
      transactionNo: 'Sales invoice #40150',
      contact: 'Pochi Coffee Roasters',
      newRoute: '',
    })

    expect(managedFiles[0]).toMatchObject({
      fileName: 'PO-1080.pdf',
      page: 'Sales invoice',
      transactionNo: 'Sales invoice #40150',
      contact: 'Pochi Coffee Roasters',
    })
    expect(vm.addOpen).toBe(false)
    // Nothing to hand off — the user isn't going to a create form.
    expect(pendingFormAttachments.value).toHaveLength(0)
  })

  it('creating leaves the file unfiled and hands it to the create form', async () => {
    const { vm } = await mountPage()

    vm.onAddFileSubmit({
      files: [{ name: 'NDA_CPI.docx', sizeKB: 128 }],
      mode: 'create',
      page: 'Sales invoice',
      transactionNo: '',
      contact: '',
      newRoute: '/sales-invoices/new',
    })

    // In the list, but not filed against anything yet.
    expect(managedFiles[0]).toMatchObject({ fileName: 'NDA_CPI.docx', page: '', transactionNo: '' })
    // …and waiting for the form, which seeds its own `attachments` from this.
    expect(takePendingAttachments()).toEqual([{ name: 'NDA_CPI.docx', sizeKB: 128 }])
    // One-shot: a second form visit must not pick them up again.
    expect(takePendingAttachments()).toEqual([])
  })

  it('only offers Create for pages whose form can hold an attachment', () => {
    // Expense has transactions to attach to, but its form has no Attachment
    // field — offering it under Create would drop the file on the floor.
    expect(attachablePages()).toContain('Expense')
    expect(creatablePages()).not.toContain('Expense')
    for (const page of creatablePages()) {
      expect(filePageTarget(page)?.newRoute).toBeTruthy()
    }
  })

  it('lists real transactions for the chosen page', () => {
    const txns = filePageTarget('Sales invoice')!.list()
    expect(txns.length).toBeGreaterThan(0)
    expect(txns[0]!.no).toMatch(/^Sales invoice #\d+$/)
    expect(txns[0]!.contact).toBeTruthy()
  })
})

describe('Create-form hand-off', () => {
  // The drawer's half of the contract is covered above; this is the other
  // half — the create form must actually open with those files attached.
  it.each([
    ['NewSalesInvoicePage'],
    ['NewSalesOrderPage'],
    ['NewSalesQuotePage'],
    ['NewSalesDeliveryPage'],
    ['NewPurchaseQuotePage'],
    ['NewPurchaseDeliveryPage'],
  ])('%s opens with the handed-off files attached', async (page) => {
    setPendingAttachments([{ name: 'PO-1080.pdf', sizeKB: 128 }])

    const Form = (await import(`~/components/pages/${page}.vue`)).default
    const w = mount(Form, { props: { id: 'new' }, global: { stubs: { Teleport: true } } })
    const vm = w.vm as unknown as { attachments: { name: string; sizeKB: number }[] }

    expect(vm.attachments).toEqual([{ name: 'PO-1080.pdf', sizeKB: 128 }])
    // Consumed, so the next form the user opens starts clean.
    expect(pendingFormAttachments.value).toHaveLength(0)
    w.unmount()
  })

  it('a form reached any other way opens with no attachments', async () => {
    pendingFormAttachments.value = []
    const Form = (await import('~/components/pages/NewSalesInvoicePage.vue')).default
    const w = mount(Form, { props: { id: 'new' }, global: { stubs: { Teleport: true } } })
    expect((w.vm as unknown as { attachments: unknown[] }).attachments).toEqual([])
    w.unmount()
  })
})

describe('Add file drawer — staging', () => {
  async function mountDrawer(props: Record<string, unknown> = {}) {
    const Drawer = (await import('~/components/patterns/AddFileDrawer.vue')).default
    const w = mount(Drawer, { props: { isOpen: true, ...props }, global: { stubs: { Teleport: true } } })
    return w.vm as unknown as {
      files: { name: string; sizeKB: number }[]
      onFileChange: (p: Event | FileList | null) => void
      error: string
    }
  }
  // MpUpload hands over the native Event, not a FileList. Typing the handler
  // as a FileList meant nothing was ever staged — the regression this pins.
  function changeEvent(...names: string[]) {
    const dt = new DataTransfer()
    for (const n of names) dt.items.add(new File(['x'.repeat(2048)], n, { type: 'application/pdf' }))
    const input = document.createElement('input')
    input.type = 'file'
    Object.defineProperty(input, 'files', { value: dt.files, writable: true })
    return { target: input } as unknown as Event
  }

  it('stages every file picked in one go', async () => {
    const vm = await mountDrawer()
    vm.onFileChange(changeEvent('a.pdf', 'b.pdf', 'c.pdf'))
    expect(vm.files.map(f => f.name)).toEqual(['a.pdf', 'b.pdf', 'c.pdf'])
  })

  it('appends across several picks and ignores repeats', async () => {
    const vm = await mountDrawer()
    vm.onFileChange(changeEvent('a.pdf'))
    vm.onFileChange(changeEvent('b.pdf', 'a.pdf'))
    expect(vm.files.map(f => f.name)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('still accepts a bare FileList, as older call sites pass', async () => {
    const vm = await mountDrawer()
    const dt = new DataTransfer()
    dt.items.add(new File(['x'], 'legacy.pdf', { type: 'application/pdf' }))
    vm.onFileChange(dt.files)
    expect(vm.files.map(f => f.name)).toEqual(['legacy.pdf'])
  })

  it('enforces the 5-file cap the caption promises', async () => {
    const vm = await mountDrawer()
    vm.onFileChange(changeEvent('1.pdf', '2.pdf', '3.pdf', '4.pdf', '5.pdf', '6.pdf'))
    expect(vm.files).toHaveLength(5)
    expect(vm.error).toBe('You can upload up to 5 files at a time.')
  })

  it('in existing-files mode it seeds the selection and hides nothing else', async () => {
    const vm = await mountDrawer({ existingFiles: [{ name: 'KTP.png', sizeKB: 128 }], initialMode: 'create' })
    expect(vm.files).toEqual([{ name: 'KTP.png', sizeKB: 128 }])
  })
})

describe('File manager — bulk actions', () => {
  type BulkVm = {
    onBulkApply: (r: AddFileResult) => void
    askBulkDelete: (sel: Set<number>, deselect: () => void) => void
    confirmBulkDelete: () => void
    bulkRows: { id: string }[]
    openBulkDrawer: (m: 'attach' | 'create', sel: Set<number>, d: () => void) => void
    bulkFiles: { name: string; sizeKB: number }[]
  }
  async function mountBulk() {
    const Page = (await import('~/components/pages/FileManagerPage.vue')).default
    const w = mount(Page, { global: { stubs: { Teleport: true } } })
    return w.vm as unknown as BulkVm
  }

  it('attaches every selected row to one transaction', async () => {
    const vm = await mountBulk()
    vm.openBulkDrawer('attach', new Set([0, 1]), () => {})
    expect(vm.bulkFiles).toHaveLength(2)

    vm.onBulkApply({
      files: vm.bulkFiles, mode: 'attach', page: 'Sales order',
      transactionNo: 'Sales order #10090', contact: 'Anomali Coffee', newRoute: '',
    })

    for (const r of managedFiles.slice(0, 2)) {
      expect(r.page).toBe('Sales order')
      expect(r.transactionNo).toBe('Sales order #10090')
      expect(r.contact).toBe('Anomali Coffee')
    }
  })

  it('bulk create hands every selected file to the new form', async () => {
    const vm = await mountBulk()
    vm.openBulkDrawer('create', new Set([0, 1]), () => {})
    vm.onBulkApply({
      files: vm.bulkFiles, mode: 'create', page: 'Sales invoice',
      transactionNo: '', contact: '', newRoute: '/sales-invoices/new',
    })
    expect(takePendingAttachments()).toHaveLength(2)
  })

  it('bulk delete removes exactly the selection', async () => {
    const vm = await mountBulk()
    const before = managedFiles.length
    const doomed = managedFiles[0]!.id
    vm.askBulkDelete(new Set([0]), () => {})
    vm.confirmBulkDelete()
    expect(managedFiles.length).toBe(before - 1)
    expect(managedFiles.some(f => f.id === doomed)).toBe(false)
  })
})
