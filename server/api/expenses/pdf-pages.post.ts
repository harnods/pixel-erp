/**
 * Render a PDF's pages to PNG images server-side (unpdf + a prebuilt canvas, so
 * pdfjs never enters the client bundle). The File Review page shows these as
 * plain <img>s, giving us full control of the background (no Chrome PDF-viewer
 * dark chrome). Capped so a huge PDF can't hang the request.
 *
 * Body: { dataBase64 }  →  { pages: string[] (data:image/png…), pageCount }
 */
import { getDocumentProxy, renderPageAsImage } from 'unpdf'

const MAX_PAGES = 20

export default defineEventHandler(async (event): Promise<{ pages: string[]; pageCount: number; error?: string }> => {
  const body = await readBody<{ dataBase64?: string }>(event)
  if (!body?.dataBase64) { setResponseStatus(event, 400); return { pages: [], pageCount: 0, error: 'No file data' } }
  try {
    const raw = body.dataBase64.includes(',') ? body.dataBase64.slice(body.dataBase64.indexOf(',') + 1) : body.dataBase64
    const buf = Buffer.from(raw, 'base64')
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const pageCount = pdf.numPages
    const pages: string[] = []
    for (let p = 1; p <= Math.min(pageCount, MAX_PAGES); p++) {
      const img = await renderPageAsImage(pdf, p, { canvasImport: () => import('@napi-rs/canvas'), scale: 2 })
      pages.push(`data:image/png;base64,${Buffer.from(img as ArrayBuffer).toString('base64')}`)
    }
    return { pages, pageCount }
  } catch (e: any) {
    return { pages: [], pageCount: 0, error: e?.message || 'render failed' }
  }
})
