import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { normalizeRouteKey } from '../lib/routeKey'

const SESSION_KEY = 'pr-review-mode'

const _isReviewMode = ref(false)
const _isAddingMode = ref(false)
const _pinsVisible = ref(true)
const _reviewerName = ref('')

export function useReviewMode() {
  const route = useRoute()

  const routeKey = computed(() => normalizeRouteKey(route.path))

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

  function setReviewerName(name: string) {
    _reviewerName.value = name.trim()
    localStorage.setItem('pr-author', _reviewerName.value)
  }

  return {
    isReviewMode: _isReviewMode,
    isAddingMode: _isAddingMode,
    pinsVisible: _pinsVisible,
    reviewerName: _reviewerName,
    routeKey,
    initFromQuery,
    exitReviewMode,
    enterReviewMode,
    toggleReviewMode,
    toggleAddMode,
    cancelAddMode,
    togglePins,
    setReviewerName,
  }
}
