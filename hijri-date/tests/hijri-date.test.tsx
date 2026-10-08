import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { announce, hijriOf, occasionOf, tabular, upcomingOccasions } from '../hooks/hijri'
import { hijriNow } from '../hooks/register'

/** A day of Jakarta prayer times as prayer-times publishes it; Maghrib at 17:35 WIB. */
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

const SETTINGS = { calendar: 'Umm al-Qura', adjustDays: 0, hintLine: true, announceDays: true } as const

function world(on: On, day: ReturnType<typeof dayIn>, stored?: Record<string, unknown>) {
  const toasts: string[] = []
  const tails: (string | undefined)[] = []
  mock.store(on, stored)
  // Stands in for the prayer-times mod's published day.
  on('state.get', (_, e, next) => (e.plugin === 'prayer-times' ? ({ value: { value: day, version: 1 } } as never) : next(e)))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    if (e.component === 'PromptHint') tails.push(e.props.tail)
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { toasts, tails }
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const HINT = {
  plugin: 'hijri-date',
  surface: 'terminal',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts', tail: '🕌 Asr 14:40 · in 0:40:00' },
} as const
const run = (args: string) => ({
  command: 'hijri',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
}) as const

test('Umm al-Qura dates, and the tabular calendar within a day of them', () => {
  expect(hijriOf('2026-10-08', 'Umm al-Qura')).toEqual({ day: 27, month: 4, year: 1448 })
  expect(hijriOf('2026-10-08', 'Umm al-Qura', -1)).toEqual({ day: 26, month: 4, year: 1448 })
  for (const ymd of ['2026-10-08', '2027-02-08', '2027-05-16', '2030-01-01']) {
    const uq = hijriOf(ymd, 'Umm al-Qura')
    const t = tabular(ymd)
    expect(t.year * 400 + t.month * 31 + t.day - (uq.year * 400 + uq.month * 31 + uq.day)).toBeLessThanOrEqual(2)
  }
})

test('the day turns over at Maghrib, and at midnight without prayer-times', () => {
  const day = dayIn('2026-10-03')
  const before = hijriNow(Date.parse('2026-10-03T17:00:00+07:00'), day as never, SETTINGS)
  const after = hijriNow(Date.parse('2026-10-03T18:00:00+07:00'), day as never, SETTINGS)
  expect(before).toMatchObject({ day: 22, monthName: "Rabi' al-Akhir", gregorian: '2026-10-03', isEve: false })
  expect(after).toMatchObject({ day: 23, gregorian: '2026-10-03', isEve: true })
  expect(hijriNow(Date.parse('2026-10-03T18:00:00+07:00'), null, SETTINGS).isEve).toBe(false)
})

test('occasions, the white days, and what is said of them', () => {
  expect(occasionOf({ day: 9, month: 12, year: 1448 })?.name).toBe('the Day of Arafah')
  expect(occasionOf({ day: 14, month: 4, year: 1448 })?.short).toBe('White day')
  expect(occasionOf({ day: 14, month: 9, year: 1448 })).toBeUndefined()
  expect(occasionOf({ day: 13, month: 12, year: 1448 })?.fast).toBe('forbidden')
  const arafah = { day: 9, month: 12, year: 1448 }
  expect(announce(arafah, occasionOf(arafah)!, true)).toBe(
    '🌙 Tonight begins 9 Dhu al-Hijjah 1448, the Day of Arafah. Fasting tomorrow is sunnah; remember suhur.',
  )
  const next = upcomingOccasions('2026-10-08', 'Umm al-Qura', 0, 3).map(o => o.occasion.name)
  expect(next[0]).toBe("Nisf Sha'ban")
})

test('the hint line turns over at Maghrib; a white day is left to sunnah-fasting', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-09-23T17:00:00+07:00') })
  const w = world(on, dayIn('2026-09-23'))
  const published: Record<string, unknown> = {}
  on('state.set', (_, e, next) => {
    published[e.key] = e.value
    return next(e)
  })

  await $.session.start(start)
  await $.ui.mount(HINT as never)
  expect(w.tails.at(-1)).toBe("🕌 Asr 14:40 · in 0:40:00 · 📅 12 Rabi' al-Akhir 1448")

  await clock.advance(40 * 60e3)
  expect(w.tails.at(-1)).toBe("🕌 Asr 14:40 · in 0:40:00 · 🌙 13 Rabi' al-Akhir 1448 · White day")
  expect(w.toasts).toEqual([])
  const ahead = published.ahead as unknown[]
  expect(ahead.length).toBe(30)
  expect(ahead[1]).toEqual({ gregorian: '2026-09-24', day: 13, month: 4, year: 1448 })
})

test('an occasion announced at Maghrib, once', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2027-01-22T17:00:00+07:00') })
  const w = world(on, dayIn('2027-01-22'))

  await $.session.start(start)
  await clock.advance(40 * 60e3)
  expect(w.toasts).toEqual(["🌙 Tonight begins 15 Sha'ban 1448, Nisf Sha'ban."])

  // A new session the same evening doesn't say it again.
  await $.session.start(start)
  await clock.advance(60e3)
  expect(w.toasts.length).toBe(1)
})

test('/hijri shows today and what is coming, and converts a date', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-08T10:00:00+07:00') })
  world(on, dayIn('2026-10-08'))
  await $.session.start(start)

  const { text } = await $.command.run(run(''))
  expect(text).toContain("27 Rabi' al-Akhir 1448 AH (Umm al-Qura)")
  expect(text).toContain('Thu 8 Oct 2026')
  expect(text).toContain("Nisf Sha'ban")

  expect((await $.command.run(run('2026-10-08'))).text).toBe("Thu 8 Oct 2026 is 27 Rabi' al-Akhir 1448 AH (from the evening before).")
  expect((await $.command.run(run('tomorrow'))).text).toContain('YYYY-MM-DD')
})
