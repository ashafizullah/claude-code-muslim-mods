import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginState, Register } from 'claude-code'

import type { HijriDay } from '../types'
import {
  CALENDARS,
  MONTHS,
  addDays,
  announce,
  daysBetween,
  format,
  gregorianLabel,
  hijriOf,
  localDate,
  occasionOf,
  shortName,
  upcomingOccasions,
} from './hijri'
import type { Calendar } from './hijri'

/** What prayer-times publishes, typed by its contract (a dependency of this mod). */
type PrayerTimesDay = PluginState['prayer-times']['today']

const TICK_MS = 30e3
// The toasts already given, kept across sessions so a new session doesn't repeat them.
const ANNOUNCED_KEY = 'announced'

const today = atom({ plugin: 'hijri-date', key: 'today' } as const, null)
const line = atom({ plugin: 'hijri-date', key: 'line' } as const, null)
const prayerDay = { plugin: 'prayer-times', key: 'today' } as const

type Settings = { calendar: Calendar; adjustDays: number; hintLine: boolean; announceDays: boolean }

/**
 * The Hijri date now. It turns over at Maghrib, read from prayer-times; without it
 * (no place found yet), at midnight on this machine's clock.
 */
export function hijriNow(now: number, day: PrayerTimesDay | null | undefined, s: Settings): HijriDay {
  const gregorian = localDate(now, day?.timeZone)
  const maghrib = day?.date === gregorian ? day.slots.find(slot => slot.name === 'Maghrib')?.at : undefined
  const isEve = maghrib !== undefined && now >= maghrib
  const h = hijriOf(isEve ? addDays(gregorian, 1) : gregorian, s.calendar, s.adjustDays)
  return { ...h, monthName: MONTHS[h.month - 1], gregorian, isEve }
}

async function tick($: EngineInterface, s: Settings) {
  const now = await $.clock.now()
  const { value: day } = await $.state.get(prayerDay)
  const h = hijriNow(now, day, s)
  const current = await read($, today)
  if (!current || current.day !== h.day || current.month !== h.month || current.year !== h.year || current.isEve !== h.isEve) {
    await update($, today, () => h)
  }

  const occasion = occasionOf(h)
  if (s.hintLine) {
    const text = `${h.isEve ? '🌙' : '📅'} ${format(h)}${occasion ? ` · ${shortName(occasion)}` : ''}`
    if ((await read($, line)) !== text) await update($, line, () => text)
  }

  if (s.announceDays && occasion) {
    const key = `${h.year}-${h.month}-${h.day}:${h.isEve ? 'eve' : 'day'}`
    const announced = ((await $.store.get(ANNOUNCED_KEY)) as string[] | undefined) ?? []
    if (!announced.includes(key)) {
      $.ui.toast(announce(h, occasion, h.isEve), { timeoutMs: 20e3 })
      await $.store.set(ANNOUNCED_KEY, [...announced.slice(-20), key])
    }
  }
}

export const register: Register = (on, options) => {
  const calendar = String(options.calendar ?? 'Umm al-Qura')
  const settings: Settings = {
    calendar: (CALENDARS as readonly string[]).includes(calendar) ? (calendar as Calendar) : 'Umm al-Qura',
    adjustDays: Math.trunc(Number(options.adjustDays ?? 0)) || 0,
    hintLine: options.hintLine !== false,
    announceDays: options.announceDays !== false,
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hijri',
      description: "Today's Hijri date and the days ahead, or convert a date: /hijri 2027-03-10",
    })
    await tick($, settings)
    $.clock.every(TICK_MS, () => void tick($, settings))
    return next(e)
  })

  // After prayer-times' countdown on the hint line under the prompt.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const text = settings.hintLine ? await read($, line) : null
    if (!text) return next(e)
    return next({ ...e, props: { ...e.props, tail: e.props.tail ? `${e.props.tail} · ${text}` : text } })
  })

  on('command.run', { command: 'hijri' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(arg) || Number.isNaN(Date.parse(`${arg}T00:00:00Z`))) {
        return { text: 'Give a Gregorian date as YYYY-MM-DD, e.g. /hijri 2027-03-10.' }
      }
      const h = hijriOf(arg, settings.calendar, settings.adjustDays)
      const o = occasionOf(h)
      return { text: `${gregorianLabel(arg)} is ${format(h)} AH${o ? `, ${o.name}` : ''} (from the evening before).` }
    }

    const now = await $.clock.now()
    const { value: day } = await $.state.get(prayerDay)
    const h = hijriNow(now, day, settings)
    const o = occasionOf(h)
    const adjust = settings.adjustDays ? ` ${settings.adjustDays > 0 ? '+' : ''}${settings.adjustDays} day${Math.abs(settings.adjustDays) === 1 ? '' : 's'}` : ''
    const lines = [
      `${format(h)} AH${o ? `, ${o.name}` : ''} (${settings.calendar}${adjust})`,
      h.isEve
        ? `  Since Maghrib; the daytime of this date is ${gregorianLabel(addDays(h.gregorian, 1))}.`
        : `  ${gregorianLabel(h.gregorian)}`,
      '',
      'Coming up (each begins the evening before):',
    ]
    for (const next of upcomingOccasions(addDays(h.gregorian, h.isEve ? 2 : 1), settings.calendar, settings.adjustDays, 6)) {
      const days = daysBetween(h.gregorian, next.gregorian)
      lines.push(
        `  ${gregorianLabel(next.gregorian).padEnd(16)} ${format(next.hijri).padEnd(24)} ${shortName(next.occasion)} · in ${days} day${days === 1 ? '' : 's'}`,
      )
    }
    return { text: lines.join('\n') }
  })
}
