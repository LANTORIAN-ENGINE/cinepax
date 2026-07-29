import { createServiceClient } from '@/lib/supabase'

// Vérifie le statut admin côté serveur via service role (bypass RLS)
// GET /api/auth/me  — Authorization: Bearer <jwt>
export async function GET(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ is_admin: false, error: 'no_token' })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ is_admin: false, error: 'supabase_not_configured' })
  }

  // Valider le JWT et récupérer l'utilisateur
  const { data: { user }, error: userError } = await supabase.auth.getUser(
    authHeader.slice(7)
  )

  if (userError || !user) {
    return Response.json({ is_admin: false, error: 'invalid_token' })
  }

  // Lire le profil avec service role — bypass RLS garanti
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[api/auth/me] profile error:', profileError.message)
  }

  return Response.json({
    is_admin:   profile?.is_admin === true,
    full_name:  profile?.full_name ?? null,
    user_id:    user.id,
    email:      user.email,
  })
}
