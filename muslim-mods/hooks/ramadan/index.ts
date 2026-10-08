import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { HijriDate, PrayerTimesDay } from '../../types'
import type { Feature } from '../feature'

// Every second, so the countdown under the prompt counts down.
const TICK_MS = 1e3
// A crossing older than this (the laptop slept through it) is not announced.
const STALE_MS = 5 * 60e3
// From this day of Ramadan, a reminder of zakat al-fitr, once.
const ZAKAT_DAY = 27
const ZAKAT_KEY = 'ramadan.zakat'

const IFTAR_DUA =
  "Dhahaba al-zama'u wabtallatil-'uruqu wa thabatal-ajru in sha' Allah: the thirst is gone, the veins are moistened and the reward is certain, if Allah wills (Abu Dawud 2357)."
const QADR_DUA =
  "Allahumma innaka 'afuwwun tuhibbul-'afwa fa'fu 'anni: O Allah, You are pardoning and love to pardon, so pardon me (Tirmidhi 3513)."

const line = atom({ plugin: 'muslim-mods', key: 'ramadanLine' } as const, null)
const prayerDay = { plugin: 'muslim-mods', key: 'prayerToday' } as const
const hijriAhead = { plugin: 'muslim-mods', key: 'hijriAhead' } as const

const DAY_MS = 864e5
export const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** A Gregorian date as `Mon 8 Feb`. */
const dateLabel = (ymd: string) => {
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
const localDate = (now: number, timeZone?: string) => {
  const part = parts(now, timeZone)
  return `${part('year')}-${part('month')}-${part('day')}`
}
const clock = (now: number, timeZone?: string) => {
  const part = parts(now, timeZone)
  return `${part('hour')}:${part('minute')}`
}

/** H:MM:SS, for a countdown that ticks every second. */
export function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1e3))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`
}

const isOddNight = (night: number) => night >= 21 && night % 2 === 1

type Settings = { suhurMs: number; imsakMs: number; tarawih: boolean }
type Watch = { settings: Settings; lastTick: number; zakatSaid: boolean }

/**
 * Where Ramadan stands at `now`: today's times if known, today's Hijri date by daytime,
 * and tonight's (the next day's), since a night of Ramadan precedes its day.
 */
async function context($: EngineInterface, now: number) {
  const { value: day } = (await $.state.get(prayerDay)) as { value: PrayerTimesDay }
  const { value: ahead } = (await $.state.get(hijriAhead)) as { value: HijriDate[] }
  const timeZone = day?.timeZone
  const today = localDate(now, timeZone)
  const slot = (name: string) => (day?.date === today ? day.slots.find(s => s.name === name)?.at : undefined)
  const hijri = (ymd: string) => ahead?.find(h => h.gregorian === ymd)
  const fajr = slot('Fajr')
  const todayH = hijri(today)
  const tomorrowH = hijri(addDays(today, 1))
  // Between midnight and Fajr the night in progress is the one before today's fast, not tomorrow's.
  const isNightBeforeFajr = fajr !== undefined && now < fajr
  const tonightH = isNightBeforeFajr ? todayH : tomorrowH
  return {
    timeZone,
    today,
    fajr,
    maghrib: slot('Maghrib'),
    isha: slot('Isha'),
    ahead: ahead ?? [],
    /** Today is a fasting day of Ramadan: its Ramadan day, else undefined. */
    fastDay: todayH?.month === 9 ? todayH.day : undefined,
    /** Tonight is a night of Ramadan: its number, else undefined. */
    night: tonightH?.month === 9 ? tonightH.day : undefined,
    isEidEve: !isNightBeforeFajr && tomorrowH?.month === 10 && tomorrowH.day === 1,
  }
}

async function tick($: EngineInterface, w: Watch) {
  const s = w.settings
  const now = await $.clock.now()
  const c = await context($, now)
  const crossed = (at: number | undefined) => at !== undefined && w.lastTick < at && at <= now && now - at < STALE_MS
  const at = (t: number) => clock(t, c.timeZone)

  if (c.fastDay !== undefined && c.fajr !== undefined) {
    const imsak = c.fajr - s.imsakMs
    if (s.suhurMs > 0 && s.suhurMs > s.imsakMs && crossed(c.fajr - s.suhurMs)) {
      const until = s.imsakMs > 0 ? `imsak at ${at(imsak)}, Fajr at ${at(c.fajr)}` : `Fajr at ${at(c.fajr)}`
      $.ui.toast(`🍽 Suhur, day ${c.fastDay} of Ramadan: ${until}.`, { timeoutMs: 20e3 })
    }
    if (s.imsakMs > 0 && crossed(imsak)) {
      $.ui.toast(`🍽 Imsak (${at(imsak)}): finish your suhur, Fajr is at ${at(c.fajr)}.`, { timeoutMs: 20e3 })
    }
  }
  if (c.fastDay !== undefined && crossed(c.maghrib)) {
    $.ui.toast(`🍽 It's Maghrib: time to break your fast. ${IFTAR_DUA}`, { timeoutMs: 30e3 })
  }
  if (c.night !== undefined && crossed(c.isha)) {
    const tarawih = s.tarawih ? `🌙 Isha: Tarawih tonight, night ${c.night} of Ramadan.` : ''
    const qadr = isOddNight(c.night) ? `✨ An odd night of the last ten: seek Laylat al-Qadr. ${QADR_DUA}` : ''
    const text = [tarawih, qadr].filter(Boolean).join(' ')
    if (text) $.ui.toast(text, { timeoutMs: 30e3 })
  }
  if (c.fastDay !== undefined && c.fastDay >= ZAKAT_DAY && !w.zakatSaid) {
    w.zakatSaid = true
    const year = c.ahead.find(h => h.gregorian === c.today)?.year
    if ((await $.store.get(ZAKAT_KEY)) !== year) {
      $.ui.toast('🤲 Ramadan is ending: pay zakat al-fitr before the Eid prayer.', { timeoutMs: 20e3 })
      await $.store.set(ZAKAT_KEY, year)
    }
  }

  let text: string | null = null
  if (c.fastDay !== undefined && c.fajr !== undefined && c.maghrib !== undefined) {
    const imsak = c.fajr - s.imsakMs
    if (now < imsak) text = `🍽 Imsak ${at(imsak)} · in ${countdown(imsak - now)}`
    else if (now < c.fajr) text = `🍽 Imsak · Fajr ${at(c.fajr)} · in ${countdown(c.fajr - now)}`
    else if (now < c.maghrib) text = `🍽 Iftar ${at(c.maghrib)} · in ${countdown(c.maghrib - now)}`
  }
  if (text === null && c.night !== undefined && isOddNight(c.night) && c.maghrib !== undefined && now >= c.maghrib) {
    text = `✨ Night ${c.night} · seek Laylat al-Qadr`
  }
  if ((await read($, line)) !== text) await update($, line, () => text)
  w.lastTick = now
}

export const ramadan: Feature = (on, options) => {
  const minutes = (value: unknown, fallback: number) => Math.max(0, Number(value ?? fallback)) * 60e3
  const watch: Watch = {
    settings: {
      suhurMs: minutes(options.suhurMinutes, 45),
      imsakMs: minutes(options.imsakMinutes, 10),
      tarawih: options.tarawih !== false,
    },
    lastTick: 0,
    zakatSaid: false,
  }

  on('command.run', { command: 'ramadan' }, async $ => {
    const s = watch.settings
    const now = await $.clock.now()
    const c = await context($, now)
    const at = (t: number) => clock(t, c.timeZone)

    if (c.fastDay === undefined && c.night === undefined) {
      if (!c.ahead.length) return { text: "The Hijri dates aren't in yet: is the Hijri date on? /muslim on hijri" }
      const first = c.ahead.find(h => h.month === 9 && h.day === 1)
      if (!first) return { text: 'Ramadan is more than 30 days away. /hijri lists when it begins.' }
      const days = Math.round((Date.parse(first.gregorian) - Date.parse(c.today)) / DAY_MS)
      return {
        text: `Ramadan ${first.year} begins in ${days} day${days === 1 ? '' : 's'}: the first fast is ${dateLabel(first.gregorian)}, Tarawih the evening before.`,
      }
    }

    const lines: string[] = []
    if (c.fastDay !== undefined) {
      lines.push(`Day ${c.fastDay} of Ramadan, ${dateLabel(c.today)}.`)
      if (c.fajr !== undefined && c.maghrib !== undefined) {
        const imsak = s.imsakMs > 0 ? `Imsak ${at(c.fajr - s.imsakMs)} · ` : ''
        lines.push(`  ${imsak}Fajr ${at(c.fajr)} · Iftar ${at(c.maghrib)}${c.isha !== undefined ? ` · Isha ${at(c.isha)}` : ''}`)
      } else {
        lines.push('  The times are unknown until prayer-times finds your place: /prayer-times <your city>.')
      }
    }
    if (c.night !== undefined) {
      const qadr = isOddNight(c.night) ? ': an odd night of the last ten, seek Laylat al-Qadr' : ''
      lines.push(`Tonight is night ${c.night} of Ramadan${qadr}.`)
      if (c.night < 21) {
        const nights = 21 - c.night
        lines.push(`The last ten nights begin in ${nights} night${nights === 1 ? '' : 's'}.`)
      }
    } else if (c.isEidEve) {
      lines.push("Tonight is Eid's eve: takbir, and zakat al-fitr before the Eid prayer.")
    }
    return { text: lines.join('\n') }
  })


  on('session.start', { isInteractive: true }, async ($, e, next) => {
    await $.command.register({ name: 'ramadan', description: "Today's imsak and iftar in Ramadan, or how long until it" })
    watch.lastTick = await $.clock.now()
    await tick($, watch)
    $.clock.every(TICK_MS, () => void tick($, watch))
    return next(e)
  })
}
