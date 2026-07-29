export async function GET(request, { params }) {
  if (!process.env.VEEZI_TOKEN) {
    return Response.json({ error: 'VEEZI_TOKEN env var is not set' }, { status: 500 })
  }
  try {
    const { path } = await params
    const apiPath = Array.isArray(path) ? path.join('/') : path

    const { searchParams } = new URL(request.url)
    const qs = searchParams.toString()
    const targetUrl = `https://api.eu.veezi.com/${apiPath}${qs ? '?' + qs : ''}`

    const res = await fetch(targetUrl, {
      headers: { 'VeeziAccessToken': process.env.VEEZI_TOKEN },
    })

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
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
