import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { HijriDate, PrayerTimesDay } from '../../types'

import { addDays, clock, dateLabel, describe, fastOn, isReminded, localDate, localHour } from './fasts'
import type { FastDay, Options } from './fasts'
import type { Feature } from '../feature'

const TICK_MS = 10e3
// A crossing older than this (the laptop slept through it) is not announced.
const STALE_MS = 5 * 60e3
// Without prayer-times, the evening (when tomorrow's reminder comes) begins at this hour.
const EVENING_HOUR = 18
const LIST_DAYS = 14
// The days you said you'd fast, as YYYY-MM-DD, and the evening reminders given; both kept across sessions.
const INTENT_KEY = 'fasting.intent'
const ANNOUNCED_KEY = 'fasting.announced'

const IFTAR_DUA =
  "Dhahaba al-zama'u wabtallatil-'uruqu wa thabatal-ajru in sha' Allah: the thirst is gone, the veins are moistened and the reward is certain, if Allah wills (Abu Dawud 2357)."

const line = atom({ plugin: 'muslim-mods', key: 'fastingLine' } as const, null)
const prayerDay = { plugin: 'muslim-mods', key: 'prayerToday' } as const
const hijriAhead = { plugin: 'muslim-mods', key: 'hijriAhead' } as const

type Settings = Options & { suhurMs: number }
type Watch = { settings: Settings; lastTick: number }

/** Where things stand at `now`: the local date, today's Fajr and Maghrib if known, and whether it is evening. */
async function context($: EngineInterface, now: number) {
  const { value: day } = (await $.state.get(prayerDay)) as { value: PrayerTimesDay }
  const { value: ahead } = (await $.state.get(hijriAhead)) as { value: HijriDate[] }
  const timeZone = day?.timeZone
  const today = localDate(now, timeZone)
  const slot = (name: string) => (day?.date === today ? day.slots.find(s => s.name === name)?.at : undefined)
  const fajr = slot('Fajr')
  const maghrib = slot('Maghrib')
  const isEvening = maghrib !== undefined ? now >= maghrib : localHour(now, timeZone) >= EVENING_HOUR
  const fastFor = (ymd: string, s: Settings) => fastOn(ymd, ahead?.find(h => h.gregorian === ymd), s)
  return { timeZone, today, fajr, maghrib, isEvening, fastFor }
}

const intents = async ($: EngineInterface) => ((await $.store.get(INTENT_KEY)) as string[] | undefined) ?? []

async function setIntent($: EngineInterface, ymd: string, on: boolean, today: string) {
  // Days before yesterday are dropped; they're done.
  const kept = (await intents($)).filter(d => d !== ymd && d >= addDays(today, -1))
  await $.store.set(INTENT_KEY, on ? [...kept, ymd].sort() : kept)
}

function eveText(tomorrow: string, f: FastDay, isIntended: boolean, suhurAt: string | undefined) {
  const why = f.kind === 'sunnah' ? describe(f.reasons) : ''
  if (isIntended) {
    const suhur = suhurAt ? ` Suhur reminder around ${suhurAt}.` : ''
    return `🌙 You're fasting tomorrow, ${dateLabel(tomorrow)}${why ? ` (${why})` : ''}.${suhur}`
  }
  return `🌙 Tomorrow is ${why}: fasting is sunnah. /fasting on to fast it, with suhur and iftar reminders.`
}

async function tick($: EngineInterface, w: Watch) {
  const s = w.settings
  const now = await $.clock.now()
  const c = await context($, now)
  const crossed = (at: number | undefined) => at !== undefined && w.lastTick < at && at <= now && now - at < STALE_MS
  const intended = await intents($)
  const isFasting = intended.includes(c.today)

  if (c.isEvening) {
    const tomorrow = addDays(c.today, 1)
    const f = c.fastFor(tomorrow, s)
    const isIntended = intended.includes(tomorrow)
    const key = `eve:${tomorrow}`
    const announced = ((await $.store.get(ANNOUNCED_KEY)) as string[] | undefined) ?? []
    if ((isReminded(f) || isIntended) && f.kind !== 'forbidden' && !announced.includes(key)) {
      // Tomorrow's Fajr is close enough to today's for a reminder's "around".
      const suhurAt = c.fajr !== undefined && s.suhurMs > 0 ? clock(c.fajr + 864e5 - s.suhurMs, c.timeZone) : undefined
      $.ui.toast(eveText(tomorrow, f, isIntended, suhurAt), { timeoutMs: 20e3 })
      await $.store.set(ANNOUNCED_KEY, [...announced.slice(-20), key])
    }
  }

  if (isFasting && c.fajr !== undefined && s.suhurMs > 0 && crossed(c.fajr - s.suhurMs)) {
    $.ui.toast(`🍽 Suhur: Fajr is at ${clock(c.fajr, c.timeZone)}, in ${Math.round(s.suhurMs / 60e3)}m.`, { timeoutMs: 20e3 })
  }
  if (isFasting && crossed(c.maghrib)) {
    $.ui.toast(`🍽 It's Maghrib: time to break your fast. ${IFTAR_DUA}`, { timeoutMs: 30e3 })
  }

  let text: string | null = null
  if (isFasting && c.fajr !== undefined && now < c.fajr) text = `🍽 Suhur until ${clock(c.fajr, c.timeZone)}`
  else if (isFasting && c.maghrib !== undefined && now < c.maghrib) text = `🍽 Fasting · iftar ${clock(c.maghrib, c.timeZone)}`
  if ((await read($, line)) !== text) await update($, line, () => text)
  w.lastTick = now
}

export const sunnahFasting: Feature = (on, options) => {
  const watch: Watch = {
    settings: {
      mondayThursday: options.mondayThursday !== false,
      whiteDays: options.whiteDays !== false,
      suhurMs: Math.max(0, Number(options.suhurMinutes ?? 45)) * 60e3,
    },
    lastTick: 0,
  }

  on('command.run', { command: 'fasting' }, async ($, e) => {
    const s = watch.settings
    const now = await $.clock.now()
    const c = await context($, now)
    const [verb = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)

    if (verb === 'on' || verb === 'off') {
      // Today until Maghrib, tomorrow after it.
      const target =
        arg === 'today' ? c.today
        : arg === 'tomorrow' ? addDays(c.today, 1)
        : /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg
        : arg === '' ? (c.isEvening ? addDays(c.today, 1) : c.today)
        : undefined
      if (!target || Number.isNaN(Date.parse(`${target}T00:00:00Z`))) {
        return { text: 'Usage: /fasting on|off [today|tomorrow|YYYY-MM-DD]' }
      }
      if (target < c.today) return { text: `${dateLabel(target)} has passed.` }
      if (verb === 'off') {
        await setIntent($, target, false, c.today)
        await tick($, watch)
        return { text: `Not fasting ${dateLabel(target)}; its reminders are off.` }
      }
      const f = c.fastFor(target, s)
      if (f.kind === 'forbidden') return { text: `${dateLabel(target)} is ${f.why}: fasting is forbidden on it.` }
      if (f.kind === 'ramadan') {
        return { text: `${dateLabel(target)} is in Ramadan: Ramadan gives the suhur and iftar reminders every day.` }
      }
      await setIntent($, target, true, c.today)
      await tick($, watch)
      const why = f.kind === 'sunnah' ? ` (${describe(f.reasons)})` : ''
      const isToday = target === c.today
      const suhur = s.suhurMs > 0 && !(isToday && c.fajr !== undefined && now >= c.fajr)
        ? `a suhur reminder ${Math.round(s.suhurMs / 60e3)} minutes before Fajr and `
        : ''
      const iftar = isToday && c.maghrib !== undefined ? `iftar at ${clock(c.maghrib, c.timeZone)}` : 'one at Maghrib for iftar'
      return { text: `Fasting ${dateLabel(target)}${why}. You'll get ${suhur}${iftar}.` }
    }
    if (verb !== '') return { text: 'Usage: /fasting, or /fasting on|off [today|tomorrow|YYYY-MM-DD]' }

    const intended = await intents($)
    const lines: string[] = []
    const todayFast = c.fastFor(c.today, s)
    if (intended.includes(c.today)) {
      lines.push(`Fasting today${c.maghrib !== undefined ? `: iftar at ${clock(c.maghrib, c.timeZone)}` : ''}.`)
    } else if (todayFast.kind === 'forbidden') {
      lines.push(`Today is ${todayFast.why}: no fasting.`)
    } else if (todayFast.kind === 'ramadan') {
      lines.push('It is Ramadan.')
    }
    lines.push('Sunnah fasts in the next two weeks:')
    let listed = 0
    for (let i = 0; i < LIST_DAYS; i++) {
      const ymd = addDays(c.today, i)
      const f = c.fastFor(ymd, s)
      if (f.kind !== 'sunnah' && !intended.includes(ymd)) continue
      const mark = intended.includes(ymd) ? '✓' : ' '
      const why = f.kind === 'sunnah' ? describe(f.reasons) : f.kind === 'ramadan' ? 'Ramadan' : ''
      lines.push(`  ${mark} ${dateLabel(ymd).padEnd(11)} ${why.replace(/^./, ch => ch.toUpperCase())}`)
      listed++
    }
    if (!listed) lines.push('  None.')
    lines.push('', "✓ marks the days you said you'd fast. /fasting on to fast today (or tomorrow, after Maghrib).")
    return { text: lines.join('\n') }
  })


  on('session.start', { isInteractive: true }, async ($, e, next) => {
    await $.command.register({
      name: 'fasting',
      description: 'Sunnah fasts in the next two weeks; /fasting on or off to fast today or tomorrow (or a YYYY-MM-DD)',
    })
    watch.lastTick = await $.clock.now()
    await tick($, watch)
    $.clock.every(TICK_MS, () => void tick($, watch))
    return next(e)
  })
}
