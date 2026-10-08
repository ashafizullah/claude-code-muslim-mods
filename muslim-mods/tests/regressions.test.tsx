import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { dayAway, schedule, upcoming } from '../hooks/prayer-times/praytimes'
import { only } from './only'

/** A day of Jakarta prayer times as prayer-times publishes it: Fajr 04:10, Maghrib 17:35 WIB. */
const dayIn = (date: string) => ({
  date,
  timeZone: 'Asia/Jakarta',
  slots: [
    { name: 'Fajr', at: Date.parse(`${date}T04:10:00+07:00`) },
    { name: 'Sunrise', at: Date.parse(`${date}T05:20:00+07:00`) },
    { name: 'Dhuhr', at: Date.parse(`${date}T11:30:00+07:00`) },
    { name: 'Asr', at: Date.parse(`${date}T14:40:00+07:00`) },
    { name: 'Maghrib', at: Date.parse(`${date}T17:35:00+07:00`) },
    { name: 'Isha', at: Date.parse(`${date}T18:45:00+07:00`) },
  ],
})

// Umm al-Qura: Ramadan 1448 runs from 8 Feb to 8 Mar 2027; 23 Sep 2026 is 12 Rabi' al-Akhir 1448.
const FIRST_OF_RAMADAN = Date.parse('2027-02-08T00:00:00Z')
function hijriOn(gregorian: string) {
  const days = Math.round((Date.parse(`${gregorian}T00:00:00Z`) - FIRST_OF_RAMADAN) / 864e5)
  if (days >= -40 && days < 0) return { gregorian, day: 30 + days, month: 8, year: 1448 }
  if (days >= 0 && days < 29) return { gregorian, day: days + 1, month: 9, year: 1448 }
  if (days >= 29) return { gregorian, day: days - 28, month: 10, year: 1448 }
  const fromRabi = Math.round((Date.parse(`${gregorian}T00:00:00Z`) - Date.parse('2026-09-23T00:00:00Z')) / 864e5)
  return { gregorian, day: 12 + fromRabi, month: 4, year: 1448 }
}
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/**
 * The world beneath the plugin. `published` stands in for prayer times' `date`: today's by default,
 * or a fixed one to play a stale day.
 */
function world(on: On, now: () => number, published?: string) {
  const toasts: string[] = []
  mock.store(on)
  on('state.get', (_, e, next) => {
    const today = new Date(now() + 7 * 3600e3).toISOString().slice(0, 10)
    if (e.key === 'prayerToday') return { value: { value: dayIn(published ?? today), version: 1 } } as never
    if (e.key === 'hijriAhead') {
      return { value: { value: Array.from({ length: 30 }, (_, i) => hijriOn(addDays(today, i))), version: 1 } } as never
    }
    return next(e)
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { toasts }
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const run = (command: string, args: string) =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

test("Jumu'ah: yesterday's times just after midnight don't bring the morning toast early", { options: only('jumuah') }, async ($, on) => {
  // Friday 9 Oct 2026, 00:00:05, with prayer times still on Thursday.
  const clock = mock.clock(on, { now: Date.parse('2026-10-09T00:00:05+07:00') })
  const w = world(on, clock.now, '2026-10-08')
  await $.session.start(start)
  expect(w.toasts).toEqual([])
})

test("Jumu'ah: the morning toast comes at Fajr", { options: only('jumuah'), timeoutMs: 30e3 }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-09T04:00:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  expect(w.toasts).toEqual([])
  await clock.advance(15 * 60e3)
  expect(w.toasts).toEqual([expect.stringContaining("Jumu'ah Mubarak")])
})

test("Ramadan: after midnight, tonight is the night before today's fast", { options: only('ramadan') }, async ($, on) => {
  // 28 Feb 2027 is the 21st of Ramadan; at 01:00 it is still its night, an odd one.
  const clock = mock.clock(on, { now: Date.parse('2027-02-28T01:00:00+07:00') })
  world(on, clock.now)
  await $.session.start(start)
  expect((await $.command.run(run('ramadan', ''))).text).toContain(
    'Tonight is night 21 of Ramadan: an odd night of the last ten, seek Laylat al-Qadr.',
  )
})

test('Sunnah fasting: an impossible date is refused', { options: only('sunnahFasting') }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-07T10:00:00+07:00') })
  world(on, clock.now)
  await $.session.start(start)
  expect((await $.command.run(run('fasting', 'on 2026-02-31'))).text).toContain('Usage')
})

test('Sunnah fasting: opened after midnight, today is still announced before Fajr', { options: only('sunnahFasting') }, async ($, on) => {
  // Monday 12 Oct 2026, 00:30.
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T00:30:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  expect(w.toasts).toEqual([
    '🌙 Today is Monday: fasting is sunnah. There is still time for suhur. /fasting on to fast it, with suhur and iftar reminders.',
  ])
})

test('Sunnah fasting: a Friday on its own is flagged', { options: only('sunnahFasting') }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-07T10:00:00+07:00') })
  world(on, clock.now)
  await $.session.start(start)
  expect((await $.command.run(run('fasting', 'on 2026-10-09'))).text).toContain('Fasting a Friday on its own is disliked')
  await $.command.run(run('fasting', 'on 2026-10-08'))
  expect((await $.command.run(run('fasting', 'on 2026-10-09'))).text).not.toContain('disliked')
})

test('Sunnah fasting: no reminder is promised without prayer times', { options: only('sunnahFasting') }, async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-07T10:00:00+07:00') })
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start(start)
  expect((await $.command.run(run('fasting', 'on tomorrow'))).text).toContain('no suhur or iftar reminder will come')
})

test('Prayer times: a DST day is stepped over whole, and polar night has no NaN', () => {
  const london = { latitude: 51.5, longitude: -0.12, timeZone: 'Europe/London', method: 'MWL', asr: 'Standard', ihtiyatMinutes: 0 } as const
  // 00:30 on 25 Oct 2026, the 25-hour day the clocks go back.
  const next = upcoming(Date.parse('2026-10-25T00:30:00+01:00'), london)
  const fajrs = next.filter(e => e.name === 'Fajr').map(e => new Date(e.at).toISOString().slice(0, 10))
  expect(fajrs).toEqual(['2026-10-25', '2026-10-26'])
  expect(new Date(dayAway(Date.parse('2026-10-25T23:30:00Z'), 1, 'Europe/London')).toISOString()).toBe('2026-10-26T12:00:00.000Z')

  const tromso = { latitude: 69.65, longitude: 18.96, timeZone: 'Europe/Oslo', method: 'MWL', asr: 'Standard', ihtiyatMinutes: 0 } as const
  const day = schedule(Date.parse('2026-12-20T12:00:00+01:00'), tromso)
  expect(day.every(e => Number.isFinite(e.at))).toBe(true)
  expect(day.some(e => e.name === 'Maghrib')).toBe(false)
})

test('Daily ayah: a reload keeps the verse, /clear brings a new one', { options: only('dailyAyah') }, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  world(on, clock.now)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  const verse = async () => (await $.command.run(run('ayah', ''))).text
  await $.session.start(start)
  const first = await verse()
  await clock.advance(7_000)
  await $.session.start(start)
  expect(await verse()).toBe(first)
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  expect(await verse()).not.toBe(first)
})
