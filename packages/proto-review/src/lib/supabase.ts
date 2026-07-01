import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function initSupabase(url: string, key: string): void {
  _client = createClient(url, key)
}

export function getSupabase(): SupabaseClient {
  if (!_client) throw new Error('[proto-review] Supabase not initialized')
  return _client
}
