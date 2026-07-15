// @vitest-environment happy-dom
/**
 * useUnsavedChangesGuard — the shared primitive behind "warn before losing
 * unsaved form data" (pilot: PickItemsPage.vue). This app has exactly one real
 * Vue Router route (a catch-all, app/pages/[...slug].vue) — every "page" is a
 * component swapped in via <component :is> inside it, not a distinct route. So
 * onBeforeRouteLeave never fires here; instead a global router.beforeEach
 * (registered once, in plugins/unsaved-changes-guard.client.ts) calls
 * resolveNavigationAttempt(), which checks whichever form page most recently
 * registered itself via useUnsavedChangesGuard(). These tests exercise that
 * registration + resolution directly, without needing a real router.
 */
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import {
  useUnsavedChangesGuard, useUnsavedChangesModalState, resolveNavigationAttempt,
} from '~/composables/useUnsavedChangesGuard'

function mountForm(options: { dirty: () => boolean; saveDraft?: () => void | Promise<void> }) {
  const FormPage = defineComponent({
    setup() {
      useUnsavedChangesGuard({ hasUnsavedChanges: options.dirty, saveDraft: options.saveDraft })
      return () => h('div', 'form page')
    },
  })
  return mount(FormPage)
}

describe('useUnsavedChangesGuard', () => {
  it('beforeunload: sets returnValue (triggers the native prompt) only when the mounted form is dirty', () => {
    let dirty = false
    const wrapper = mountForm({ dirty: () => dirty })

    const cleanEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)

    dirty = true
    const dirtyEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    wrapper.unmount()
  })

  it('resolveNavigationAttempt: resolves true immediately when no form is mounted', async () => {
    // No mountForm() call in this test — the registry should be empty (or
    // whatever a prior test's unmount left it as, which must be null).
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
  })

  it('resolveNavigationAttempt: resolves true immediately when the mounted form is clean', async () => {
    const wrapper = mountForm({ dirty: () => false })
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    wrapper.unmount()
  })

  it('resolveNavigationAttempt: a dirty form opens the modal and blocks until a choice is made; Cancel resolves false', async () => {
    const wrapper = mountForm({ dirty: () => true })
    const modal = useUnsavedChangesModalState()

    const pending = resolveNavigationAttempt()
    await Promise.resolve() // let the promise executor run
    expect(modal.isOpen.value).toBe(true)

    modal.chooseCancel()
    await expect(pending).resolves.toBe(false)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('resolveNavigationAttempt: "Leave without saving" resolves true without calling saveDraft', async () => {
    const saveDraft = vi.fn()
    const wrapper = mountForm({ dirty: () => true, saveDraft })
    const modal = useUnsavedChangesModalState()

    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.hasSaveDraft.value).toBe(true)

    modal.chooseLeave()
    await expect(pending).resolves.toBe(true)
    expect(saveDraft).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('resolveNavigationAttempt: "Save as draft" calls saveDraft then resolves true', async () => {
    const saveDraft = vi.fn()
    const wrapper = mountForm({ dirty: () => true, saveDraft })
    const modal = useUnsavedChangesModalState()

    const pending = resolveNavigationAttempt()
    await Promise.resolve()

    modal.chooseDraft()
    await expect(pending).resolves.toBe(true)
    expect(saveDraft).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('hasSaveDraft is false when the mounted form has no saveDraft option', async () => {
    const wrapper = mountForm({ dirty: () => true })
    const modal = useUnsavedChangesModalState()

    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.hasSaveDraft.value).toBe(false)

    modal.chooseLeave()
    await pending
    wrapper.unmount()
  })

  it('unmounting the form clears the registry — a later navigation attempt is unblocked', async () => {
    const wrapper = mountForm({ dirty: () => true })
    wrapper.unmount()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
  })
})
