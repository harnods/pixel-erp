import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { normalizeRouteKey } from '../lib/routeKey'
import { viewQuerySuffix } from '../lib/viewKey'

const SESSION_KEY = 'pr-review-mode'

const _isReviewMode = ref(false)
const _isAddingMode = ref(false)
const _pinsVisible = ref(true)
const _reviewerName = ref('')
// Resolved comments are noise once handled — hidden by default, both as pins
// on the page and in the All comments panel. Shared here so the panel's
// toggle and the on-page pins stay in sync.
const _hideResolved = ref(true)

export function useReviewMode() {
  const route = useRoute()

  // Scope key folds in view-defining query params (e.g. ?tab=), so comments
  // made on one tab don't leak onto the others.
  const routeKey = computed(() => normalizeRouteKey(route.path) + viewQuerySuffix(route.query))

  // Concrete path to store & navigate back to — includes the tab so the
  // All comments panel lands on the exact tab a comment was left on.
  const viewPath = computed(() => route.path + viewQuerySuffix(route.query))

  function initFromQuery() {
    const triggeredByQuery = 'review' in (route.query ?? {})
    if (triggeredByQuery) {
      sessionStorage.setItem(SESSION_KEY, '1')
    }
    _isReviewMode.value = triggeredByQuery || sessionStorage.getItem(SESSION_KEY) === '1'
    _reviewerName.value = localStorage.getItem('pr-author') ?? ''
  }

  function exitReviewMode() {
    sessionStorage.removeItem(SESSION_KEY)
    _isReviewMode.value = false
    _isAddingMode.value = false
  }

  function enterReviewMode() {
    sessionStorage.setItem(SESSION_KEY, '1')
    _isReviewMode.value = true
  }

  /** Convenience for a single menu item: flips review mode on/off without the host needing to check state first. */
  function toggleReviewMode() {
    if (_isReviewMode.value) {
      exitReviewMode()
    } else {
      enterReviewMode()
    }
  }

  function toggleAddMode() {
    _isAddingMode.value = !_isAddingMode.value
  }

  function cancelAddMode() {
    _isAddingMode.value = false
  }

  function togglePins() {
    _pinsVisible.value = !_pinsVisible.value
  }

  function toggleHideResolved() {
    _hideResolved.value = !_hideResolved.value
  }

  function setReviewerName(name: string) {
    _reviewerName.value = name.trim()
    localStorage.setItem('pr-author', _reviewerName.value)
  }

  return {
    isReviewMode: _isReviewMode,
    isAddingMode: _isAddingMode,
    pinsVisible: _pinsVisible,
    reviewerName: _reviewerName,
    hideResolved: _hideResolved,
    routeKey,
    viewPath,
    initFromQuery,
    exitReviewMode,
    enterReviewMode,
    toggleReviewMode,
    toggleAddMode,
    cancelAddMode,
    togglePins,
    toggleHideResolved,
    setReviewerName,
  }
}
