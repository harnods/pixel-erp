const WRAPPER_ID = 'pr-push-wrapper'

/**
 * Wraps everything currently in <body> (the host app's root, plus our own
 * pins/toolbar which render inline in the same tree) into one element we can
 * transform. Anything marked [data-pr-exempt] (our own Teleported panels) is
 * left as a direct <body> child so it isn't dragged along by the push.
 *
 * Fixed-position descendants of a transformed ancestor become fixed relative
 * to THAT ancestor instead of the viewport (CSS spec quirk) — this is what
 * makes the host app's content (and our pins/toolbar) visually "push" left
 * together, while the panel itself stays pinned to the real viewport edge.
 */
function ensureWrapper(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let wrapper = document.getElementById(WRAPPER_ID)
  if (wrapper) return wrapper

  wrapper = document.createElement('div')
  wrapper.id = WRAPPER_ID
  wrapper.style.transition = 'transform 0.25s ease'
  document.body.insertBefore(wrapper, document.body.firstChild)

  Array.from(document.body.childNodes).forEach(node => {
    if (node === wrapper) return
    if (node instanceof HTMLElement && node.hasAttribute('data-pr-exempt')) return
    wrapper!.appendChild(node)
  })

  return wrapper
}

export function pushBody(widthPx: number) {
  const wrapper = ensureWrapper()
  if (wrapper) wrapper.style.transform = `translateX(-${widthPx}px)`
}

export function unpushBody() {
  if (typeof document === 'undefined') return
  const wrapper = document.getElementById(WRAPPER_ID)
  if (wrapper) wrapper.style.transform = ''
}
