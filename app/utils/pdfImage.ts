export interface LoadedPdfImage {
  dataUrl: string
  format: 'JPEG' | 'PNG' | 'WEBP'
}

/**
 * Fetches a product photo (product catalog images are external CDN URLs, not
 * local assets) and returns it as a base64 data URL jsPDF's addImage can embed.
 * Returns null on ANY failure (missing image, offline, CORS, non-image response)
 * so a product photo that won't load never breaks the rest of the document —
 * the caller just skips drawing it for that row.
 */
export async function loadImageDataUrl(url: string | undefined): Promise<LoadedPdfImage | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)
    const ext = url.toLowerCase().split('?')[0]!.split('.').pop() ?? ''
    const format = ext === 'png' ? 'PNG' : ext === 'webp' ? 'WEBP' : 'JPEG'
    const mime = format === 'PNG' ? 'image/png' : format === 'WEBP' ? 'image/webp' : 'image/jpeg'
    return { dataUrl: `data:${mime};base64,${base64}`, format }
  } catch {
    return null
  }
}

// bwip-js's own resolution split (browser build vs Node build, see barcode.ts) has
// no equivalent here — base64-encoding a fetched buffer is plain enough to just
// branch on which global is available.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(buffer).toString('base64')
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

/** Loads every distinct URL in `urls` once (dedup — the same product photo often
 *  repeats across expanded batch/serial rows), keyed by URL for O(1) lookup while
 *  building the PDF table. */
export async function loadImagesByUrl(urls: (string | undefined)[]): Promise<Map<string, LoadedPdfImage | null>> {
  const unique = [...new Set(urls.filter((u): u is string => !!u))]
  const loaded = await Promise.all(unique.map((u) => loadImageDataUrl(u)))
  return new Map(unique.map((u, i) => [u, loaded[i]!]))
}
