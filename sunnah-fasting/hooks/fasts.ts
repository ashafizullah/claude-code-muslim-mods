import type { PluginState } from 'claude-code'

type HijriDate = PluginState['hijri-date']['ahead'][number]

export type Reason = {
  name: string
  /** Worth a reminder the evening before; the six days of Shawwal, a month of them, are only listed. */
  remind: boolean
}

export type FastDay =
  | { kind: 'sunnah'; reasons: Reason[] }
  | { kind: 'forbidden'; why: string }
  | { kind: 'ramadan' }
  | { kind: 'none' }

export type Options = { mondayThursday: boolean; whiteDays: boolean }

const DAY_MS = 864e5

export const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()

/**
 * What fasting on the Gregorian date `ymd` is, by its weekday and its Hijri date `h`
 * (the one whose daytime falls on it). Without `h`, only the weekday counts.
 */
export function fastOn(ymd: string, h: HijriDate | undefined, o: Options): FastDay {
  const reasons: Reason[] = []
  if (h) {
    const { month: m, day: d } = h
    if (m === 10 && d === 1) return { kind: 'forbidden', why: 'Eid al-Fitr' }
    if (m === 12 && d === 10) return { kind: 'forbidden', why: 'Eid al-Adha' }
    if (m === 12 && d >= 11 && d <= 13) return { kind: 'forbidden', why: 'a day of Tashriq' }
    if (m === 9) return { kind: 'ramadan' }
    if (m === 12 && d === 9) reasons.push({ name: 'the Day of Arafah', remind: true })
    if (m === 12 && d <= 8) reasons.push({ name: 'one of the first days of Dhu al-Hijjah', remind: true })
    if (m === 1 && d === 9) reasons.push({ name: "Tasu'a", remind: true })
    if (m === 1 && d === 10) reasons.push({ name: 'Ashura', remind: true })
    if (o.whiteDays && d >= 13 && d <= 15) reasons.push({ name: 'a white day', remind: true })
    if (m === 10 && d >= 2) reasons.push({ name: 'in the six days of Shawwal', remind: false })
  }
  const w = weekday(ymd)
  if (o.mondayThursday && w === 1) reasons.unshift({ name: 'Monday', remind: true })
  if (o.mondayThursday && w === 4) reasons.unshift({ name: 'Thursday', remind: true })
  return reasons.length ? { kind: 'sunnah', reasons } : { kind: 'none' }
}

/** `Thursday and a white day`, `Monday, Tasu'a and ...`. */
export function describe(reasons: Reason[]) {
  const names = reasons.map(r => r.name)
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

export const isReminded = (f: FastDay) => f.kind === 'sunnah' && f.reasons.some(r => r.remind)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A Gregorian date as `Thu 8 Oct`, spelled the same whatever the runtime's locale data. */
export function dateLabel(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

const zones = new Map<string, Intl.DateTimeFormat>()

function parts(now: number, timeZone?: string) {
  let zone = zones.get(timeZone ?? '')
  if (!zone) {
    zone = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    zones.set(timeZone ?? '', zone)
  }
  const all = zone.formatToParts(now)
  return (type: string) => all.find(p => p.type === type)?.value ?? ''
}

/** The Gregorian date (YYYY-MM-DD) at `now` in `timeZone`, this machine's when not given. */
export function localDate(now: number, timeZone?: string) {
  const part = parts(now, timeZone)
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** The time of day at `now` in `timeZone`, as HH:MM. */
export function clock(now: number, timeZone?: string) {
  const part = parts(now, timeZone)
  return `${part('hour')}:${part('minute')}`
}

export const localHour = (now: number, timeZone?: string) => Number(parts(now, timeZone)('hour'))
