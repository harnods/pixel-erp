/**
 * KB thumbnail — renders page 1 of a PDF to a small PNG so the file manager can
 * show a real preview instead of a generic icon. Server-side (unpdf + a prebuilt
 * canvas) so pdfjs never enters the client bundle. Images don't come here — the
 * client already holds the raw image and uses it directly.
 *
 * Body: { ext, dataBase64 }  →  { thumbUrl: 'data:image/png;base64,…' | null }
 */
import { getDocumentProxy, renderPageAsImage } from 'unpdf'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ ext?: string; dataBase64?: string }>(event)
  const ext = (body?.ext || '').toLowerCase()
  if (ext !== 'pdf' || !body?.dataBase64) return { thumbUrl: null }
  try {
    const raw = body.dataBase64.includes(',') ? body.dataBase64.slice(body.dataBase64.indexOf(',') + 1) : body.dataBase64
    const buf = Buffer.from(raw, 'base64')
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const img = await renderPageAsImage(pdf, 1, { canvasImport: () => import('@napi-rs/canvas'), scale: 0.6 })
    const b64 = Buffer.from(img as ArrayBuffer).toString('base64')
    return { thumbUrl: `data:image/png;base64,${b64}` }
  } catch {
    return { thumbUrl: null }
  }
})
