/**
 * useProjectAction — runs a projectActions result the ERP way:
 *   • success → success toast (rule/btn-save-toast, rule/toast-success-only)
 *   • refusal → kept as an inline error the page renders next to the action
 *     (rule/form-errors-inline) via <PmActionError :error="error" />
 * One instance per surface (page / drawer / modal) so errors sit where the fix is.
 */
import { successToast } from '~/utils/toasts'

type Result = { ok: true; message?: string } | { ok: false; error: string }

export function useProjectAction() {
  const error = ref('')
  function run(res: Result, successMessage?: string): boolean {
    if (res.ok) {
      error.value = ''
      successToast(res.message ?? successMessage ?? 'Saved')
      return true
    }
    error.value = res.error
    return false
  }
  function fail(message: string) { error.value = message }
  function clear() { error.value = '' }
  return { error, run, fail, clear }
}
