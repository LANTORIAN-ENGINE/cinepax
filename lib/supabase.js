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

// ── Client de contrôle — vérifie un mot de passe sans ouvrir de session ──────
//
// Vérifier une identité et ouvrir un compte sont deux choses. La connexion a
// une étape intermédiaire : les documents à réaccepter. Tant qu'ils ne le sont
// pas, rien ne doit s'écrire dans le navigateur — sinon la barre annonce
// « connecté » au milieu d'une étape qui ne l'est pas.
//
// D'où ce client à part : `persistSession: false` garde la session en mémoire
// seulement, et `storageKey` distinct évite qu'il ne marche sur les plates-
// bandes du client principal (deux instances sur la même clé se disputent le
// stockage). Le jeton obtenu reste valable — on ne le révoque pas, on ne
// l'écrit simplement nulle part ; il servira à signer le consentement, puis
// la session sera remise au client principal par `setSession`.
//
// Ne surtout pas remplacer par un `signOut({ scope: 'local' })` après coup :
// GoTrue y répond en supprimant la session côté serveur, et le jeton qu'on
// tenait encore en main meurt avec elle.
let _probeClient = null

export function createProbeClient() {
  if (_probeClient) return _probeClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _probeClient = _create(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'cinepax-auth-probe',
    },
  })
  return _probeClient
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
