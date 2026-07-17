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
  let disableGuard = () => {}
  const FormPage = defineComponent({
    setup() {
      disableGuard = useUnsavedChangesGuard({ hasUnsavedChanges: options.dirty, saveDraft: options.saveDraft }).disableGuard
      return () => h('div', 'form page')
    },
  })
  const wrapper = mount(FormPage)
  return { wrapper, disableGuard: () => disableGuard() }
}

describe('useUnsavedChangesGuard', () => {
  it('beforeunload: sets returnValue (triggers the native prompt) only when the mounted form is dirty', () => {
    let dirty = false
    const { wrapper } = mountForm({ dirty: () => dirty })

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
    const { wrapper } = mountForm({ dirty: () => false })
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    wrapper.unmount()
  })

  it('resolveNavigationAttempt: a dirty form opens the modal and blocks until a choice is made; Cancel resolves false', async () => {
    const { wrapper } = mountForm({ dirty: () => true })
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
    const { wrapper } = mountForm({ dirty: () => true, saveDraft })
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
    const { wrapper } = mountForm({ dirty: () => true, saveDraft })
    const modal = useUnsavedChangesModalState()

    const pending = resolveNavigationAttempt()
    await Promise.resolve()

    modal.chooseDraft()
    await expect(pending).resolves.toBe(true)
    expect(saveDraft).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('hasSaveDraft is false when the mounted form has no saveDraft option', async () => {
    const { wrapper } = mountForm({ dirty: () => true })
    const modal = useUnsavedChangesModalState()

    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.hasSaveDraft.value).toBe(false)

    modal.chooseLeave()
    await pending
    wrapper.unmount()
  })

  it('unmounting the form clears the registry — a later navigation attempt is unblocked', async () => {
    const { wrapper } = mountForm({ dirty: () => true })
    wrapper.unmount()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
  })

  // ── disableGuard() — the fix for "Leave without saving?" firing right after
  // an intentional Finish/Save action, whose own router.push never gets a
  // chance to see hasUnsavedChanges() turn false (nothing else resets it). ──
  describe('disableGuard()', () => {
    it('a still-dirty form navigates through cleanly after calling disableGuard()', async () => {
      // Mirrors the real bug: hasUnsavedChanges() stays permanently true (the
      // underlying draft state is never reset after commit) — only disableGuard()
      // stops the guard from blocking the page's own post-commit navigation.
      const { wrapper, disableGuard } = mountForm({ dirty: () => true })

      disableGuard()
      await expect(resolveNavigationAttempt()).resolves.toBe(true)

      const modal = useUnsavedChangesModalState()
      expect(modal.isOpen.value).toBe(false) // never opened — no blocking modal

      wrapper.unmount()
    })

    it('disableGuard() also suppresses the native beforeunload prompt', () => {
      const { wrapper, disableGuard } = mountForm({ dirty: () => true })

      disableGuard()
      const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)

      wrapper.unmount()
    })

    it('disableGuard() has no effect on a different, still-active form', async () => {
      const { wrapper: formA, disableGuard: disableA } = mountForm({ dirty: () => true })
      formA.unmount() // formB is now the sole registrant
      const { wrapper: formB } = mountForm({ dirty: () => true })

      disableA() // stale — formA's guard object is no longer the active one

      const modal = useUnsavedChangesModalState()
      const pending = resolveNavigationAttempt()
      await Promise.resolve()
      expect(modal.isOpen.value).toBe(true) // formB's guard still blocks

      modal.chooseCancel()
      await pending
      formB.unmount()
    })
  })
})
