export type Place = {
  name: string
  latitude: number
  longitude: number
  timeZone: string
  countryCode?: string
}

/** "lat, lng" typed in place of a city. */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | undefined {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text)
  if (!m) return undefined
  const latitude = Number(m[1])
  const longitude = Number(m[2])
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : undefined
}

export const geocodeUrl = (city: string) =>
  `https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&name=${encodeURIComponent(city)}`

/** Open-Meteo's geocoding answer. */
export function parseGeocode(text: string): Place | undefined {
  const hit = (JSON.parse(text) as { results?: Record<string, unknown>[] }).results?.[0]
  if (!hit || typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return undefined
  return {
    name: [hit.name, hit.country].filter(Boolean).join(', '),
    latitude: hit.latitude,
    longitude: hit.longitude,
    timeZone: String(hit.timezone ?? ''),
    countryCode: typeof hit.country_code === 'string' ? hit.country_code : undefined,
  }
}

export const IP_URLS = ['https://ipwho.is/', 'https://ipapi.co/json/'] as const

/** ipwho.is or ipapi.co's answer. */
export function parseIpLookup(text: string): Place | undefined {
  const d = JSON.parse(text) as Record<string, unknown>
  if (d.success === false || d.error || typeof d.latitude !== 'number' || typeof d.longitude !== 'number') {
    return undefined
  }
  const zone = d.timezone
  const timeZone =
    typeof zone === 'string' ? zone : String((zone as { id?: string } | undefined)?.id ?? '')
  return {
    name: [d.city, d.country_name ?? d.country].filter(Boolean).join(', '),
    latitude: d.latitude,
    longitude: d.longitude,
    timeZone,
    countryCode: typeof d.country_code === 'string' ? d.country_code : undefined,
  }
}
