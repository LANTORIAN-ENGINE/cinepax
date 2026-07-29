// Identité du cinéma, telle que déclarée dans le back-office Veezi.
//
// Sert les pages « À propos » et « Contactez-nous » : l'adresse, le téléphone
// et le nombre de salles viennent de l'API plutôt que d'être figés dans le
// code, pour rester justes si le back-office change.
//
// Ce que Veezi ne donne pas et qui reste dans lib/contenu.js : horaires
// d'ouverture, adresse e-mail, réseaux sociaux.

const VEEZI = 'https://api.eu.veezi.com'

export const revalidate = 3600

async function veezi(path) {
  const res = await fetch(`${VEEZI}${path}`, {
    headers: { VeeziAccessToken: process.env.VEEZI_TOKEN },
    next: { revalidate },
  })
  if (!res.ok) throw new Error(`Veezi ${path} → ${res.status}`)
  return res.json()
}

export async function GET() {
  if (!process.env.VEEZI_TOKEN) {
    return Response.json({ error: 'VEEZI_TOKEN env var is not set' }, { status: 500 })
  }

  try {
    const [site, screensRaw] = await Promise.all([veezi('/v1/site'), veezi('/v1/screen')])
    const screens = Array.isArray(screensRaw) ? screensRaw : []

    // Veezi éclate l'adresse sur trois lignes libres, souvent en majuscules.
    const addressLines = [site.Address1, site.Address2, site.Address3]
      .map(l => l?.trim())
      .filter(Boolean)

    return Response.json({
      name: site.LegalName || site.Name,
      shortName: site.ShortName,
      addressLines,
      postcode: site.Postcode || null,
      country: site.Country || null,
      phone: site.Phone1 || null,
      screens: screens.map(s => ({
        id: s.Id,
        name: s.Name,
        number: s.ScreenNumber,
        seats: s.TotalSeats,
      })),
      totalScreens: screens.length,
      totalSeats: screens.reduce((sum, s) => sum + (s.TotalSeats || 0), 0),
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 })
  }
}
