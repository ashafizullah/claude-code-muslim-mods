// Prayer time calculation after the PrayTimes.org algorithm (one pass, accurate to about a minute).

export const METHOD_NAMES = ['Kemenag', 'JAKIM', 'MWL', 'ISNA', 'Egypt', 'Makkah', 'Karachi', 'Diyanet'] as const
export type Method = (typeof METHOD_NAMES)[number]
export type Asr = 'Standard' | 'Hanafi'

export type Settings = {
  latitude: number
  longitude: number
  timeZone: string
  method: Method
  asr: Asr
  /** Minutes of safety margin; negative takes the method's own. */
  ihtiyatMinutes: number
}

export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const
export type Prayer = (typeof PRAYERS)[number]
export type Name = Prayer | 'Sunrise'
/** Voluntary prayers: listed and announced, but never the countdown's next prayer. */
export const SUNNAH = ['Tahajud', 'Dhuha'] as const
export type Sunnah = (typeof SUNNAH)[number]

export type Slot = { name: Name; at: number }
export type Entry = { name: Name | Sunnah; at: number }

// Isha as a number is an angle; as a string it is minutes after Maghrib.
// `tune` is the authority's own correction in minutes; `ihtiyat` its default safety margin.
const METHODS: Record<Method, { fajr: number; isha: number | string; tune?: Partial<Record<Name, number>>; ihtiyat?: number }> = {
  Kemenag: { fajr: 20, isha: 18, ihtiyat: 2 },
  JAKIM: { fajr: 20, isha: 18, ihtiyat: 2 },
  MWL: { fajr: 18, isha: 17 },
  ISNA: { fajr: 15, isha: 15 },
  Egypt: { fajr: 19.5, isha: 17.5 },
  Makkah: { fajr: 18.5, isha: '90' },
  Karachi: { fajr: 18, isha: 18 },
  Diyanet: { fajr: 18, isha: 17, tune: { Sunrise: -7, Dhuhr: 5, Asr: 5, Maghrib: 7 } },
}

const BY_COUNTRY: Record<string, Method> = {
  ID: 'Kemenag',
  MY: 'JAKIM', SG: 'JAKIM', BN: 'JAKIM',
  SA: 'Makkah', YE: 'Makkah', BH: 'Makkah', KW: 'Makkah', QA: 'Makkah', AE: 'Makkah', OM: 'Makkah',
  EG: 'Egypt', SY: 'Egypt', LB: 'Egypt', IQ: 'Egypt', JO: 'Egypt', PS: 'Egypt', LY: 'Egypt', SD: 'Egypt', DZ: 'Egypt', MA: 'Egypt', TN: 'Egypt',
  PK: 'Karachi', IN: 'Karachi', BD: 'Karachi', AF: 'Karachi',
  US: 'ISNA', CA: 'ISNA',
  TR: 'Diyanet',
}

/** The method most used in a country (ISO 3166 alpha-2), MWL elsewhere. */
export function methodFor(countryCode: string | undefined): Method {
  return BY_COUNTRY[(countryCode ?? '').toUpperCase()] ?? 'MWL'
}

const offsetFormats = new Map<string, Intl.DateTimeFormat>()

/** Hours `timeZone` is ahead of UTC at instant `at` (daylight saving included). */
export function offsetHours(at: number, timeZone: string) {
  let format = offsetFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    offsetFormats.set(timeZone, format)
  }
  const name = format.formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60) : 0
}

export function isTimeZone(timeZone: string) {
  try {
    offsetHours(0, timeZone)
    return true
  } catch {
    return false
  }
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const fix = (a: number, b: number) => {
  const x = a - b * Math.floor(a / b)
  return x < 0 ? x + b : x
}

function julian(year: number, month: number, day: number) {
  if (month <= 2) {
    year -= 1
    month += 12
  }
  const a = Math.floor(year / 100)
  const b = 2 - a + Math.floor(a / 4)
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5
}

function sun(jd: number) {
  const d = jd - 2451545.0
  const g = fix(357.529 + 0.98560028 * d, 360)
  const q = fix(280.459 + 0.98564736 * d, 360)
  const l = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360)
  const e = 23.439 - 0.00000036 * d
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(l)), Math.cos(rad(l)))) / 15, 24)
  return {
    declination: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(l)))),
    equation: q / 15 - ra,
  }
}

// Dhuha begins when the sun stands this high, as Kemenag's timetable has it.
const DHUHA_ALTITUDE = 4.5

function times(day: number, s: Settings): { name: Name | 'Dhuha'; at: number }[] {
  const local = new Date(day + offsetHours(day, s.timeZone) * 3600e3)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth() + 1
  const d = local.getUTCDate()
  const noonUtc = Date.UTC(y, m - 1, d, 12)
  const offset = offsetHours(noonUtc - offsetHours(noonUtc, s.timeZone) * 3600e3, s.timeZone)
  const jd = julian(y, m, d) - s.longitude / (15 * 24)
  const lat = s.latitude

  const midDay = (t: number) => fix(12 - sun(jd + t).equation, 24)
  // NaN where the sun never reaches the angle (summer nights far from the equator).
  const angleTime = (angle: number, t: number, before: boolean) => {
    const decl = sun(jd + t).declination
    const cos =
      (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) /
      (Math.cos(rad(decl)) * Math.cos(rad(lat)))
    const span = deg(Math.acos(cos)) / 15
    return midDay(t) + (before ? -span : span)
  }
  const asrTime = (factor: number, t: number) => {
    const decl = sun(jd + t).declination
    const angle = -deg(Math.atan(1 / (factor + Math.tan(rad(Math.abs(lat - decl))))))
    return angleTime(angle, t, false)
  }

  const method = METHODS[s.method] ?? METHODS.MWL
  const sunrise = angleTime(0.833, 6 / 24, true)
  // Where the sun stays low all day (polar winter), a quarter hour after sunrise.
  const dhuha = angleTime(-DHUHA_ALTITUDE, 6 / 24, true)
  const maghrib = angleTime(0.833, 18 / 24, false)
  let fajr = angleTime(method.fajr, 5 / 24, true)
  let isha =
    typeof method.isha === 'string'
      ? maghrib + Number(method.isha) / 60
      : angleTime(method.isha, 18 / 24, false)

  // High latitudes, angle-based rule: Fajr and Isha stay within angle/60 of the night.
  const night = 24 - (maghrib - sunrise)
  const fajrLimit = (method.fajr / 60) * night
  if (Number.isNaN(fajr) || sunrise - fajr > fajrLimit) fajr = sunrise - fajrLimit
  if (typeof method.isha === 'number') {
    const ishaLimit = (method.isha / 60) * night
    if (Number.isNaN(isha) || isha - maghrib > ishaLimit) isha = maghrib + ishaLimit
  }

  const hours: Record<Name | 'Dhuha', number> = {
    Fajr: fajr,
    Sunrise: sunrise,
    Dhuha: Number.isNaN(dhuha) ? sunrise + 0.25 : dhuha,
    Dhuhr: midDay(12 / 24),
    Asr: asrTime(s.asr === 'Hanafi' ? 2 : 1, 13 / 24),
    Maghrib: maghrib,
    Isha: isha,
  }

  const midnightUtc = Date.UTC(y, m - 1, d) - offset * 3600e3
  const shift = offset - s.longitude / 15
  const ihtiyat = s.ihtiyatMinutes < 0 ? (method.ihtiyat ?? 0) : s.ihtiyatMinutes
  return (['Fajr', 'Sunrise', 'Dhuha', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const).map(name => {
    const margin = (name === 'Sunrise' ? -ihtiyat : ihtiyat) + (name === 'Dhuha' ? 0 : (method.tune?.[name] ?? 0))
    const minutes = Math.round((hours[name] + shift) * 60 + margin)
    return { name, at: midnightUtc + minutes * 60e3 }
  })
}

/** Times for the calendar day holding instant `day` in the settings' time zone, as epoch ms. */
export function prayerTimes(day: number, s: Settings): Slot[] {
  return times(day, s).filter((t): t is Slot => t.name !== 'Dhuha')
}

/**
 * The whole day in order, the sunnah prayers included: Tahajud from the last third of the night
 * before (yesterday's Maghrib to today's Fajr), Dhuha once the sun has risen 4.5°.
 */
export function schedule(day: number, s: Settings): Entry[] {
  const all = times(day, s)
  const fajr = all.find(t => t.name === 'Fajr')!.at
  const maghrib = times(day - 86400e3, s).find(t => t.name === 'Maghrib')!.at
  const tahajud = Math.round((fajr - (fajr - maghrib) / 3) / 60e3) * 60e3
  return [{ name: 'Tahajud', at: tahajud }, ...all]
}

/** Today's schedule followed by tomorrow's, so the next prayer always exists. */
export function upcoming(now: number, s: Settings): Entry[] {
  return [...schedule(now, s), ...schedule(now + 86400e3, s)]
}

export function clock(at: number, timeZone: string) {
  const t = new Date(at + offsetHours(at, timeZone) * 3600e3)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
}

export function span(ms: number) {
  const minutes = Math.max(0, Math.ceil(ms / 60e3))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** H:MM:SS, for a countdown that ticks every second. */
export function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1e3))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}

/** YYYY-MM-DD in `timeZone`. */
export function localDate(at: number, timeZone: string) {
  return new Date(at + offsetHours(at, timeZone) * 3600e3).toISOString().slice(0, 10)
}
