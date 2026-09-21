import { toast } from '@mekari/pixel3'

/** Toast a projectActions result — success message or the refusal reason. Returns ok. */
export function notifyResult(res: { ok: true; message?: string } | { ok: false; error: string }, fallback = 'Saved'): boolean {
  if (res.ok) toast.notify({ variant: 'success', title: res.message ?? fallback })
  else toast.notify({ variant: 'error', title: res.error })
  return res.ok
}
