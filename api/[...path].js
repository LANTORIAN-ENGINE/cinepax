const VEEZI_BASE = 'https://api.eu.veezi.com'
const CONNECT_BASE = 'https://connect.eu.veezi.com'

module.exports = async function handler(req, res) {
  const segments = req.query.path ?? []
  const parts = Array.isArray(segments) ? segments : [segments]
  const [service, ...rest] = parts

  let targetBase, extraHeaders

  if (service === 'veezi') {
    targetBase = VEEZI_BASE
    extraHeaders = { 'VeeziAccessToken': process.env.VEEZI_TOKEN }
  } else if (service === 'connect') {
    targetBase = CONNECT_BASE
    extraHeaders = {
      'vista-tenant': process.env.CONNECT_TENANT,
      'connectApiToken': process.env.CONNECT_TOKEN,
    }
  } else {
    return res.status(404).json({ error: 'Unknown service' })
  }

  const query = new URLSearchParams()
  Object.entries(req.query).forEach(([key, value]) => {
    if (key !== 'path') query.append(key, value)
  })
  const qs = query.toString()
  const targetUrl = `${targetBase}/${rest.join('/')}${qs ? '?' + qs : ''}`

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers: {
      ...extraHeaders,
      'Content-Type': 'application/json',
    },
    body: req.method !== 'GET' && req.method !== 'HEAD'
      ? JSON.stringify(req.body)
      : undefined,
  })

  const data = await upstream.json()
  res.status(upstream.status).json(data)
}
