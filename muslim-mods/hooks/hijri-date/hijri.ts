export const CALENDARS = ['Umm al-Qura', 'Tabular'] as const
export type Calendar = (typeof CALENDARS)[number]

export const MONTHS = [
  'Muharram',
  'Safar',
  "Rabi' al-Awwal",
  "Rabi' al-Akhir",
  'Jumada al-Ula',
  'Jumada al-Akhirah',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qa'dah",
  'Dhu al-Hijjah',
] as const

export type Hijri = { day: number; month: number; year: number }

const DAY_MS = 864e5

/** YYYY-MM-DD as days since 1970-01-01. */
const toDays = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS)
const fromDays = (days: number) => new Date(days * DAY_MS).toISOString().slice(0, 10)

export const addDays = (ymd: string, n: number) => fromDays(toDays(ymd) + n)

const zones = new Map<string, Intl.DateTimeFormat>()

/** The Gregorian date (YYYY-MM-DD) at `now` in `timeZone`, this machine's when not given. */
export function localDate(now: number, timeZone?: string) {
  let zone = zones.get(timeZone ?? '')
  if (!zone) {
    zone = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    zones.set(timeZone ?? '', zone)
  }
  const part = (type: string) => zone.formatToParts(now).find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** The arithmetical (Kuwaiti) calendar, from the Julian day number. */
export function tabular(ymd: string): Hijri {
  let l = toDays(ymd) + 2440588 - 1948440 + 10632
  const n = Math.floor((l - 1) / 10631)
  l = l - 10631 * n + 354
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238)
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29
  const month = Math.floor((24 * l) / 709)
  const day = l - Math.floor((709 * month) / 24)
  return { day, month, year: 30 * n + j - 30 }
}

let umalqura: Intl.DateTimeFormat | null | undefined

/** Umm al-Qura, from the runtime's Intl; undefined where the runtime lacks it. */
function ummAlQura(ymd: string): Hijri | undefined {
  if (umalqura === undefined) {
    try {
      const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      })
      umalqura = f.resolvedOptions().calendar === 'islamic-umalqura' ? f : null
    } catch {
      umalqura = null
    }
  }
  if (!umalqura) return undefined
  const parts = umalqura.formatToParts(Date.parse(`${ymd}T12:00:00Z`))
  const part = (type: string) => Number.parseInt(parts.find(p => p.type === type)?.value ?? '', 10)
  const h = { day: part('day'), month: part('month'), year: part('year') }
  return Number.isFinite(h.day) && Number.isFinite(h.month) && Number.isFinite(h.year) ? h : undefined
}

/** The Hijri date whose daytime falls on the Gregorian date `ymd`, shifted by `adjustDays`. */
export function hijriOf(ymd: string, calendar: Calendar, adjustDays = 0): Hijri {
  const shifted = addDays(ymd, adjustDays)
  return (calendar === 'Umm al-Qura' && ummAlQura(shifted)) || tabular(shifted)
}

export const format = (h: Hijri) => `${h.day} ${MONTHS[h.month - 1]} ${h.year}`

type Fast = 'sunnah' | 'forbidden'

export type Occasion = {
  name: string
  /** On the hint line, when the name is too long for it. */
  short?: string
  fast?: Fast
  /** Said the evening before, after Maghrib, when the Hijri day begins. */
  eve?: string
  /** Said on the day. */
  day?: string
}

const OCCASIONS: Record<string, Occasion> = {
  '1-1': { name: 'Islamic New Year' },
  '1-9': { name: "Tasu'a", fast: 'sunnah' },
  '1-10': { name: 'Ashura', fast: 'sunnah' },
  '8-15': { name: "Nisf Sha'ban" },
  '9-1': {
    name: 'the first day of Ramadan',
    short: '1st of Ramadan',
    eve: 'Ramadan begins tonight: Tarawih tonight, suhur before Fajr.',
    day: 'Ramadan Mubarak.',
  },
  '9-21': {
    name: 'the last ten nights of Ramadan',
    short: 'Last ten nights',
    eve: 'The last ten nights begin tonight: seek Laylat al-Qadr.',
    day: 'The last ten nights of Ramadan: seek Laylat al-Qadr.',
  },
  '10-1': { name: 'Eid al-Fitr', fast: 'forbidden', eve: 'Takbir tonight; zakat al-fitr before the Eid prayer.' },
  '10-2': { name: 'the six days of Shawwal', short: 'Six days of Shawwal', day: 'The six days of Shawwal can be fasted from today.' },
  '12-1': { name: 'the first ten days of Dhu al-Hijjah', short: 'First ten days', day: 'The best days of the year: dhikr, fasting and good deeds.' },
  '12-9': { name: 'the Day of Arafah', fast: 'sunnah' },
  '12-10': { name: 'Eid al-Adha', fast: 'forbidden' },
  '12-11': { name: 'the first day of Tashriq', fast: 'forbidden' },
  '12-12': { name: 'the second day of Tashriq', fast: 'forbidden' },
  '12-13': { name: 'the last day of Tashriq', fast: 'forbidden' },
}

const WHITE_DAYS: Occasion = { name: 'one of the white days (Ayyam al-Bid)', short: 'White day', fast: 'sunnah' }

/** What the Hijri date `h` is, if anything: the occasions, else the white days (13 to 15). */
export function occasionOf(h: Hijri): Occasion | undefined {
  const named = OCCASIONS[`${h.month}-${h.day}`]
  if (named) return named
  if (h.month !== 9 && h.day >= 13 && h.day <= 15) return WHITE_DAYS
  return undefined
}

/**
 * Whether an occasion gets a toast: not the white days, and not the evening before a sunnah
 * fast; the fasting reminders are sunnah fasting's.
 */
export const isAnnounced = (o: Occasion, isEve: boolean) => o !== WHITE_DAYS && !(isEve && o.fast === 'sunnah' && !o.eve)

/** The toast for an occasion, the evening before or on the day. */
export function announce(h: Hijri, o: Occasion, isEve: boolean) {
  const date = format(h)
  if (isEve) {
    const say = o.eve ?? (o.fast === 'sunnah' ? 'Fasting tomorrow is sunnah; remember suhur.' : o.fast === 'forbidden' ? 'No fasting tomorrow.' : '')
    return `🌙 Tonight begins ${date}, ${o.name}.${say ? ` ${say}` : ''}`
  }
  const say = o.day ?? (o.fast === 'sunnah' ? 'Fasting today is sunnah.' : o.fast === 'forbidden' ? 'No fasting today.' : '')
  return `📅 Today is ${date}, ${o.name}.${say ? ` ${say}` : ''}`
}

/** The next named occasions (not the white days) from `ymd` on, within a year. */
export function upcomingOccasions(ymd: string, calendar: Calendar, adjustDays: number, count: number) {
  const found: { gregorian: string; hijri: Hijri; occasion: Occasion }[] = []
  for (let i = 0; i < 360 && found.length < count; i++) {
    const gregorian = addDays(ymd, i)
    const hijri = hijriOf(gregorian, calendar, adjustDays)
    const occasion = OCCASIONS[`${hijri.month}-${hijri.day}`]
    if (occasion) found.push({ gregorian, hijri, occasion })
  }
  return found
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const GREGORIAN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A Gregorian date as `Thu 8 Oct 2026`, spelled the same whatever the runtime's locale data. */
export function gregorianLabel(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${GREGORIAN_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export const daysBetween = (from: string, to: string) => toDays(to) - toDays(from)

/** The occasion as the hint line names it. */
export const shortName = (o: Occasion) => o.short ?? o.name.replace(/^the /, '').replace(/^./, c => c.toUpperCase())
