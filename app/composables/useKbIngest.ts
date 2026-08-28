/**
 * KB ingestion pipeline (client side): read a File → base64 → server extraction
 * → server enrichment (summary + keywords) → persist a KbDoc (capped text +
 * chunks in the reactive snapshot; full text + raw bytes in IndexedDB).
 *
 * The doc is added immediately with status 'processing' so it shows in the file
 * manager right away, then patched to 'ready'/'failed' when the pipeline settles.
 */
import { addDoc, updateNode, KB_TEXT_CAP, type KbDoc } from '~/data/coworkKb'
import { putBlob } from '~/utils/kbBlobStore'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function extOf(name: string): string { return (name.split('.').pop() || '').toLowerCase() }

export function useKbIngest() {
  /** Ingest one file into a folder. Returns the created doc (already in the store). */
  async function ingestFile(folderId: string, file: File): Promise<KbDoc> {
    const ext = extOf(file.name)
    const doc = addDoc(folderId, {
      name: file.name.replace(/\.[^.]+$/, ''),
      fileName: file.name,
      ext,
      mime: file.type,
      sizeBytes: file.size,
      status: 'processing',
      source: 'upload',
    })

    try {
      const dataUrl = await readAsDataUrl(file)
      // 1) Extract text server-side (handles docx/xlsx/pdf/images uniformly).
      const ex = await $fetch<{ text?: string; pageCount?: number; warning?: string }>('/api/cowork/kb/extract', {
        method: 'POST',
        body: { fileName: file.name, mime: file.type, ext, dataBase64: dataUrl },
      })
      const fullText = (ex?.text ?? '').trim()

      // 2) Enrich (summary + keywords) — best-effort.
      let summary = ''
      let keywords: string[] = []
      if (fullText) {
        try {
          const en = await $fetch<{ summary?: string; keywords?: string[] }>('/api/cowork/kb/enrich', {
            method: 'POST',
            body: { fileName: file.name, text: fullText },
          })
          summary = en?.summary ?? ''
          keywords = en?.keywords ?? []
        } catch { /* keep going without enrichment */ }
      }

      // 3) Thumbnail — images use themselves; PDFs get page 1 rendered server-side.
      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)
      let thumbUrl: string | undefined
      if (isImage) {
        thumbUrl = dataUrl
      } else if (ext === 'pdf') {
        try {
          const th = await $fetch<{ thumbUrl?: string | null }>('/api/cowork/kb/thumb', {
            method: 'POST', body: { ext, dataBase64: dataUrl },
          })
          thumbUrl = th?.thumbUrl ?? undefined
        } catch { /* no thumbnail — fall back to icon */ }
      }

      // 4) Full text + raw bytes + thumbnail → IndexedDB; capped text + chunks → snapshot.
      await putBlob({ id: doc.id, fileName: file.name, mime: file.type, text: fullText, dataUrl, thumbUrl })
      updateNode(doc.id, {
        status: 'ready',
        text: fullText.slice(0, KB_TEXT_CAP),
        summary,
        keywords,
        pageCount: ex?.pageCount,
        warning: ex?.warning,
        thumb: !!thumbUrl,
        blobRef: doc.id,
      })
    } catch (err: any) {
      updateNode(doc.id, { status: 'failed', warning: String(err?.message ?? err) })
    }
    return doc
  }

  /** Ingest many files sequentially (keeps the model calls gentle). */
  async function ingestFiles(folderId: string, files: File[] | FileList): Promise<KbDoc[]> {
    const list = Array.from(files)
    const out: KbDoc[] = []
    for (const f of list) out.push(await ingestFile(folderId, f))
    return out
  }

  return { ingestFile, ingestFiles }
}
