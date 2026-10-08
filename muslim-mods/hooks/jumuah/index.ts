import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { PrayerTimesDay } from '../../types'
import type { Feature } from '../feature'

const TICK_MS = 10e3
// A crossing older than this (the laptop slept through it) is not announced.
const STALE_MS = 5 * 60e3
// Without prayer times, Thursday's evening (the night of Jumu'ah) begins at this hour, and Friday's morning at this one.
const EVENING_HOUR = 18
const MORNING_HOUR = 5
// The Fridays whose Al-Kahf was read, and the toasts given, as `<kind>:<Friday's date>`; kept across sessions.
const DONE_KEY = 'jumuah.done'

const NIGHT =
  "🌙 The night of Jumu'ah has begun: send salawat on the Prophet often (Abu Dawud 1047), and read Al-Kahf before tomorrow's Maghrib."
const MORNING =
  "🕌 Jumu'ah Mubarak. Ghusl, clean clothes and perfume, and go early; read Al-Kahf (/jumuah read when done) and send salawat on the Prophet often."
const LAST_HOUR = "🤲 Friday after Asr: the last hour of Jumu'ah, when dua is answered (Abu Dawud 1048)."

const line = atom({ plugin: 'muslim-mods', key: 'jumuahLine' } as const, null)
const prayerDay = { plugin: 'muslim-mods', key: 'prayerToday' } as const

const DAY_MS = 864e5
export const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
const FRIDAY = 5
const THURSDAY = 4

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** A Friday as `Fri 9 Oct`. */
const fridayLabel = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  return `Fri ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
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
const localDate = (now: number, timeZone?: string) => {
  const part = parts(now, timeZone)
  return `${part('year')}-${part('month')}-${part('day')}`
}
const clock = (now: number, timeZone?: string) => {
  const part = parts(now, timeZone)
  return `${part('hour')}:${part('minute')}`
}

type Settings = { prayerMs: number; kahf: boolean }
type Watch = { settings: Settings; lastTick: number }

/**
 * Where the week stands at `now`. Jumu'ah runs from Thursday's Maghrib to Friday's; `friday`
 * is its date while it does, else undefined.
 */
async function context($: EngineInterface, now: number) {
  const { value: day } = (await $.state.get(prayerDay)) as { value: PrayerTimesDay }
  const timeZone = day?.timeZone
  const today = localDate(now, timeZone)
  const slot = (name: string) => (day?.date === today ? day.slots.find(s => s.name === name)?.at : undefined)
  const fajr = slot('Fajr')
  const dhuhr = slot('Dhuhr')
  const asr = slot('Asr')
  const maghrib = slot('Maghrib')
  const isEvening = maghrib !== undefined ? now >= maghrib : Number(parts(now, timeZone)('hour')) >= EVENING_HOUR
  const w = weekday(today)
  const friday =
    w === THURSDAY && isEvening ? addDays(today, 1)
    : w === FRIDAY && !isEvening ? today
    : undefined
  const isFridayDay = w === FRIDAY && !isEvening
  // Yesterday's times, for the moment after midnight (or a wake) before prayer times publishes today's.
  const isStale = !!day && day.date !== today
  // Without prayer times at all, the morning begins at this hour.
  const isMorning = fajr !== undefined ? now >= fajr : !day && Number(parts(now, timeZone)('hour')) >= MORNING_HOUR
  return { timeZone, today, fajr, dhuhr, asr, maghrib, friday, isFridayDay, isStale, isMorning }
}

const doneList = async ($: EngineInterface) => ((await $.store.get(DONE_KEY)) as string[] | undefined) ?? []

async function markDone($: EngineInterface, key: string) {
  const done = await doneList($)
  if (!done.includes(key)) await $.store.set(DONE_KEY, [...done.slice(-20), key])
}

async function tick($: EngineInterface, w: Watch) {
  const s = w.settings
  const now = await $.clock.now()
  const c = await context($, now)
  const crossed = (at: number | undefined) => at !== undefined && w.lastTick < at && at <= now && now - at < STALE_MS
  const done = await doneList($)

  if (c.friday && !c.isStale) {
    // Once per Friday, even across sessions: the night's toast, then the morning's from Fajr.
    const kind = c.isFridayDay ? (c.isMorning ? 'morning' : undefined) : 'night'
    if (kind && !done.includes(`${kind}:${c.friday}`)) {
      $.ui.toast(kind === 'night' ? NIGHT : MORNING, { timeoutMs: 20e3 })
      await markDone($, `${kind}:${c.friday}`)
    }
  }
  if (c.isFridayDay && c.dhuhr !== undefined && s.prayerMs > 0 && crossed(c.dhuhr - s.prayerMs)) {
    $.ui.toast(
      `🕌 The Friday prayer is at Dhuhr, ${clock(c.dhuhr, c.timeZone)}, in ${Math.round(s.prayerMs / 60e3)}m: time to get ready and go early.`,
      { timeoutMs: 20e3 },
    )
  }
  if (c.isFridayDay && crossed(c.asr)) $.ui.toast(LAST_HOUR, { timeoutMs: 20e3 })

  const text = s.kahf && c.friday && !done.includes(`kahf:${c.friday}`) ? '📖 Al-Kahf · /jumuah read' : null
  if ((await read($, line)) !== text) await update($, line, () => text)
  w.lastTick = now
}

export const jumuah: Feature = (on, options) => {
  const watch: Watch = {
    settings: {
      prayerMs: Math.max(0, Number(options.jumuahReminderMinutes ?? 45)) * 60e3,
      kahf: options.kahf !== false,
    },
    lastTick: 0,
  }

  on('command.run', { command: 'jumuah' }, async ($, e) => {
    const now = await $.clock.now()
    const c = await context($, now)
    const arg = e.args.trim().toLowerCase()

    if (arg === 'read') {
      if (!c.friday) return { text: "Al-Kahf is read from Thursday's Maghrib until Friday's Maghrib." }
      await markDone($, `kahf:${c.friday}`)
      await tick($, watch)
      return { text: 'Al-Kahf read: may it be a light for you until the next Friday.' }
    }
    if (arg !== '') return { text: 'Usage: /jumuah, or /jumuah read once you have read Al-Kahf.' }

    if (!c.friday) {
      const days = (FRIDAY - weekday(c.today) + 7) % 7 || 7
      const next = addDays(c.today, days)
      return {
        text: `The next Jumu'ah is ${fridayLabel(next)}, in ${days} day${days === 1 ? '' : 's'}; it begins at Thursday's Maghrib.`,
      }
    }
    const done = await doneList($)
    const mark = (isDone: boolean) => (isDone ? '✓' : '·')
    const dhuhr = c.isFridayDay && c.dhuhr !== undefined ? ` The Friday prayer is at Dhuhr, ${clock(c.dhuhr, c.timeZone)}.` : ''
    return {
      text: [
        `Jumu'ah, ${fridayLabel(c.friday)}.${dhuhr}`,
        `  ${mark(done.includes(`kahf:${c.friday}`))} Read Surah Al-Kahf (/jumuah read)`,
        '  · Send salawat on the Prophet often',
        '  · Ghusl, clean clothes and perfume, and go early to the prayer',
        '  · Dua in the last hour, after Asr',
      ].join('\n'),
    }
  })


  on('session.start', { isInteractive: true }, async ($, e, next) => {
    await $.command.register({
      name: 'jumuah',
      description: "The sunnah of Friday and what's done; /jumuah read once you've read Al-Kahf",
    })
    watch.lastTick = await $.clock.now()
    await tick($, watch)
    $.clock.every(TICK_MS, () => void tick($, watch))
    return next(e)
  })
}
