import { createClient as _create } from '@supabase/supabase-js'

// ── Browser client — singleton (anon key, RLS enforced) ──────────────────────
let _browserClient = null

export function createClient() {
  if (_browserClient) return _browserClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _browserClient = _create(url, key)
  return _browserClient
}

// ── Server / API route client — service role, bypasses RLS ───────────────────
// New instance per request (no singleton — server-side, stateless)
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return _create(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
