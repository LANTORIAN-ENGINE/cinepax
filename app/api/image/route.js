export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const imageUrl = searchParams.get('url')

  if (!imageUrl) {
    return new Response('Missing url parameter', { status: 400 })
  }

  // Validate that the URL points to cinepax.mg only
  let parsed
  try {
    parsed = new URL(imageUrl)
  } catch {
    return new Response('Invalid url', { status: 400 })
  }

  if (!parsed.hostname.endsWith('cinepax.mg')) {
    return new Response('Forbidden domain', { status: 403 })
  }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        // No Referer sent — fetch server-side bypasses the referrer policy restriction
        'User-Agent': 'Mozilla/5.0',
      },
    })

    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, { status: res.status })
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const buffer = await res.arrayBuffer()

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 500 })
  }
}
