import { createServiceClient } from '@/lib/supabase'

// Historique des demandes du client connecté.
//
// GET /api/contact/mine  — Authorization: Bearer <jwt>
//
// Rattrape d'abord les messages envoyés en visiteur avec la même adresse
// (même principe que /api/bookings/claim), puis renvoie l'historique.
// L'e-mail de rapprochement vient TOUJOURS du JWT validé, jamais du client :
// on ne peut donc lire que ses propres demandes.
export async function GET(request) {
  const supabase = createServiceClient()
  if (!supabase) {
    return Response.json({ error: 'supabase_not_configured', messages: [] }, { status: 503 })
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ error: 'no_token', messages: [] }, { status: 401 })
  }

  const { data: { user }, error: uErr } = await supabase.auth.getUser(authHeader.slice(7))
  if (uErr || !user?.email) {
    return Response.json({ error: 'invalid_token', messages: [] }, { status: 401 })
  }

  const email = user.email.trim().toLowerCase()

  // Rattrapage : messages orphelins portant l'adresse du compte.
  // Le trigger le fait déjà à l'inscription ; ce passage couvre les comptes
  // créés avant la migration, et les changements d'adresse.
  const { data: orphans } = await supabase
    .from('contact_messages')
    .select('id, email')
    .is('user_id', null)

  const ids = (orphans || [])
    .filter(m => (m.email || '').trim().toLowerCase() === email)
    .map(m => m.id)

  if (ids.length) {
    await supabase.from('contact_messages').update({ user_id: user.id }).in('id', ids)
  }

  // admin_note reste hors du périmètre client : c'est une note de service.
  const { data: messages, error } = await supabase
    .from('contact_messages')
    .select('id, message_ref, subject, message, status, created_at, answered_at, email, phone, full_name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return Response.json({ error: error.message, messages: [] }, { status: 500 })
  }

  return Response.json({ messages: messages || [], claimed: ids.length })
}
