const BNI_STATUS_MESSAGES = {
  400: 'Requête invalide envoyée à BNI Pay (paramètres manquants ou incorrects)',
  401: 'Identifiants BNI Pay incorrects — vérifiez BNI_PAY_USERNAME et BNI_PAY_PASSWORD',
  403: 'Accès refusé par BNI Pay — le compte marchand n\'est pas autorisé',
  404: 'Endpoint BNI Pay introuvable — l\'URL de l\'API a peut-être changé',
  429: 'Trop de requêtes vers BNI Pay — réessayez dans quelques secondes',
  500: 'Erreur interne du serveur BNI Pay',
  502: 'BNI Pay est temporairement indisponible',
  503: 'BNI Pay est en maintenance',
}

function bniHttpError(status, rawBody) {
  const known = BNI_STATUS_MESSAGES[status]
  if (known) return known

  // Extraire le texte utile d'une réponse HTML Apache/nginx
  const titleMatch = rawBody.match(/<title>([^<]+)<\/title>/i)
  const h1Match    = rawBody.match(/<h1>([^<]+)<\/h1>/i)
  const label      = h1Match?.[1] ?? titleMatch?.[1] ?? null
  if (label) return `Erreur BNI Pay ${status} : ${label.trim()}`

  return `Erreur BNI Pay ${status}`
}

export async function POST(request) {
  const username = process.env.BNI_PAY_USERNAME
  const password = process.env.BNI_PAY_PASSWORD

  if (!username || !password || !process.env.BNI_PAY_ID_MERCHANT) {
    return Response.json(
      { error: 'BNI Pay non configuré. Définissez les variables BNI_PAY_* dans .env' },
      { status: 503 }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Corps invalide' }, { status: 400 })
  }

  const { orderId, amountCents, redirectUrl } = body
  if (!orderId || amountCents == null) {
    return Response.json({ error: 'orderId et amountCents sont requis' }, { status: 400 })
  }

  const basicAuth = Buffer.from(`${username}:${password}`).toString('base64')

  const payload = {
    authentify: {
      id_merchant:       process.env.BNI_PAY_ID_MERCHANT,
      id_entity:         process.env.BNI_PAY_ID_ENTITY,
      id_operator:       process.env.BNI_PAY_ID_OPERATOR,
      operator_password: process.env.BNI_PAY_OPERATOR_PASSWORD,
    },
    order: {
      id_order:  orderId,
      // Devise configurée sur le compte marchand chez MIPS (passerelle BNI).
      // Le compte sandbox actuel n'accepte que MUR ; en prod il devra être
      // reconfiguré par BNI en MGA. Piloté par .env pour basculer sans toucher au code.
      currency:  process.env.BNI_PAY_CURRENCY || 'MGA',
      amount:    amountCents / 100,
    },
    iframe_behavior: {
      language:               'FR',
      // Taille de l'iframe MIPS (style inline non surchargeable côté CSS).
      // Sans ces valeurs, MIPS génère un cadre 400x400 trop petit et scrollable.
      width:                  480,
      height:                 720,
      custom_redirection_url: redirectUrl ?? null,
    },
    request_mode: 'simple',
    touchpoint:   'web',
  }

  try {
    const bniRes = await fetch('https://mypay.bni.mg/api/load_payment_zone', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${basicAuth}`,
        'user-agent':    'Mozilla/5.0 (compatible; Cinepax/1.0)',
      },
      body: JSON.stringify(payload),
    })

    const rawText = await bniRes.text()

    if (!bniRes.ok) {
      return Response.json(
        { error: bniHttpError(bniRes.status, rawText) },
        { status: 502 }
      )
    }

    try {
      return Response.json(JSON.parse(rawText))
    } catch {
      return Response.json(
        { error: `BNI Pay a renvoyé une réponse inattendue (${bniRes.status})` },
        { status: 502 }
      )
    }
  } catch (e) {
    return Response.json({ error: `Impossible de joindre BNI Pay: ${e.message}` }, { status: 502 })
  }
}
