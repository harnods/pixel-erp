// Short synthesized tones (no audio assets to manage) for scan feedback — mirrors
// a real barcode scanner's beep: a bad/rejected scan sounds different from a good one.
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audioCtx = new Ctor()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function beep(frequency: number, durationMs: number, volume = 0.15): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = frequency
  gain.gain.value = volume
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + durationMs / 1000)
}

/** Low-pitched buzz for a rejected/failed scan (barcode not found, wrong SKU, already full, ...). */
export function playScanErrorSound(): void {
  beep(220, 180)
}

/** Short, quiet high-pitched chirp for a scan that matched and was applied —
 *  deliberately softer than the error buzz so a fast scan-scan-scan flow doesn't
 *  get loud, while a rejected scan still stands out. */
export function playScanSuccessSound(): void {
  beep(880, 90, 0.06)
}
