const HEADERS = () => ({
  'vista-tenant': process.env.CONNECT_TENANT,
  'connectApiToken': process.env.CONNECT_TOKEN,
  'Content-Type': 'application/json',
})

async function proxyFetch(targetUrl, options = {}) {
  const res = await fetch(targetUrl, options)
  const text = await res.text()
  try {
    const data = JSON.parse(text)
    return Response.json(data, { status: res.status })
  } catch {
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
}

export async function GET(request, { params }) {
  if (!process.env.CONNECT_TENANT || !process.env.CONNECT_TOKEN) {
    return Response.json({ error: 'CONNECT_TENANT or CONNECT_TOKEN env var is not set' }, { status: 500 })
  }
  try {
    const { path } = await params
    const apiPath = Array.isArray(path) ? path.join('/') : path

    const { searchParams } = new URL(request.url)
    const qs = searchParams.toString()
    const targetUrl = `https://connect.eu.veezi.com/${apiPath}${qs ? '?' + qs : ''}`

    return await proxyFetch(targetUrl, { headers: HEADERS() })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  if (!process.env.CONNECT_TENANT || !process.env.CONNECT_TOKEN) {
    return Response.json({ error: 'CONNECT_TENANT or CONNECT_TOKEN env var is not set' }, { status: 500 })
  }
  try {
    const { path } = await params
    const apiPath = Array.isArray(path) ? path.join('/') : path
    const body = await request.json()

    const targetUrl = `https://connect.eu.veezi.com/${apiPath}`

    return await proxyFetch(targetUrl, {
      method: 'POST',
      headers: HEADERS(),
      body: JSON.stringify(body),
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
