// Test BNI P@Y : quelle devise le compte marchand accepte-t-il ?
// Usage : node documentation/test-bni-currency.mjs
// Lit les credentials depuis .env (sans dépendance externe).

import { readFileSync } from 'node:fs'

// — charge .env manuellement —
const env = {}
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2]
}

const basicAuth = Buffer.from(`${env.BNI_PAY_USERNAME}:${env.BNI_PAY_PASSWORD}`).toString('base64')
const CURRENCIES = ['MGA', 'EUR', 'USD', 'MUR', 'ZAR', 'GBP']

function payload(currency) {
  return {
    authentify: {
      id_merchant:       env.BNI_PAY_ID_MERCHANT,
      id_entity:         env.BNI_PAY_ID_ENTITY,
      id_operator:       env.BNI_PAY_ID_OPERATOR,
      operator_password: env.BNI_PAY_OPERATOR_PASSWORD,
    },
    order: { id_order: `CURTEST-${currency}-${Date.now()}`, currency, amount: 100 },
    iframe_behavior: { language: 'FR' },
    request_mode: 'simple',
    touchpoint:   'web',
  }
}

async function probe(currency) {
  const res = await fetch('https://mypay.bni.mg/api/load_payment_zone', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${basicAuth}`,
      'user-agent':    'Mozilla/5.0 (compatible; Cinepax/1.0)',
    },
    body: JSON.stringify(payload(currency)),
  })
  const raw = await res.text()
  let parsed = null
  try { parsed = JSON.parse(raw) } catch {}

  // Extrait un message lisible (JSON answer, ou titre HTML)
  const status      = parsed?.answer?.operation_status ?? null
  const errMsg      = parsed?.answer?.message ?? parsed?.message ?? parsed?.error ?? null
  const htmlTitle   = raw.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? null
  const hasIframe   = !!parsed?.answer?.payment_zone_data
  const summary     = errMsg ?? htmlTitle ?? (hasIframe ? 'iframe OK ✅' : raw.slice(0, 120))

  return { currency, http: res.status, opStatus: status, hasIframe, summary }
}

console.log('Compte :', env.BNI_PAY_USERNAME, '\n')
for (const c of CURRENCIES) {
  try {
    const r = await probe(c)
    const verdict = r.hasIframe ? '✅ ACCEPTÉE' : '❌'
    console.log(`${c.padEnd(4)} | HTTP ${r.http} | op:${r.opStatus ?? '—'} | ${verdict} | ${r.summary}`)
  } catch (e) {
    console.log(`${c.padEnd(4)} | ERREUR RÉSEAU | ${e.message}`)
  }
}
