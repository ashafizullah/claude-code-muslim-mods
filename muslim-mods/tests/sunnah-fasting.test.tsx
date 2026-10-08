import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { describe, fastOn } from '../hooks/sunnah-fasting/fasts'
import { only } from './only'

const ONLY = only('sunnahFasting')

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

// Umm al-Qura: 23 Sep 2026 is 12 Rabi' al-Akhir 1448.
const AHEAD = Array.from({ length: 14 }, (_, i) => ({
  gregorian: new Date(Date.parse('2026-09-23T00:00:00Z') + i * 864e5).toISOString().slice(0, 10),
  day: 12 + i,
  month: 4,
  year: 1448,
}))

const OPTIONS = { mondayThursday: true, whiteDays: true }

function world(on: On, clockNow: () => number) {
  const toasts: string[] = []
  const tails: (string | undefined)[] = []
  mock.store(on)
  // Stands in for prayer-times and hijri-date: the prayer day follows the mocked clock.
  on('state.get', (_, e, next) => {
    if (e.key === 'prayerToday') {
      const date = new Date(clockNow() + 7 * 3600e3).toISOString().slice(0, 10)
      return { value: { value: dayIn(date), version: 1 } } as never
    }
    if (e.key === 'hijriAhead') return { value: { value: AHEAD, version: 1 } } as never
    return next(e)
  })
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
  plugin: 'muslim-mods',
  surface: 'terminal',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const
const run = (args: string) => ({
  command: 'fasting',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
}) as const

test('what a day is: Monday and Thursday, the white days, Arafah; the Eids and Ramadan apart', { options: ONLY }, () => {
  const thursday = fastOn('2026-09-24', { gregorian: '2026-09-24', day: 13, month: 4, year: 1448 }, OPTIONS)
  expect(thursday.kind === 'sunnah' && describe(thursday.reasons)).toBe('Thursday and a white day')
  const arafah = fastOn('2027-05-15', { gregorian: '2027-05-15', day: 9, month: 12, year: 1448 }, OPTIONS)
  expect(arafah.kind === 'sunnah' && describe(arafah.reasons)).toBe('the Day of Arafah')
  expect(fastOn('2027-05-16', { gregorian: '2027-05-16', day: 10, month: 12, year: 1448 }, OPTIONS)).toEqual({
    kind: 'forbidden',
    why: 'Eid al-Adha',
  })
  expect(fastOn('2027-02-11', { gregorian: '2027-02-11', day: 4, month: 9, year: 1448 }, OPTIONS).kind).toBe('ramadan')
  expect(fastOn('2026-09-24', undefined, { mondayThursday: false, whiteDays: true }).kind).toBe('none')
})

// A day and a night of 10-second ticks: slow on a CI runner.
test('reminded the evening before, then suhur, the fasting day and iftar', { options: ONLY, timeoutMs: 60e3 }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-09-23T17:00:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  await $.ui.mount(HINT as never)
  expect(w.toasts).toEqual([])

  await clock.advance(40 * 60e3)
  expect(w.toasts).toEqual([
    '🌙 Tomorrow is Thursday and a white day: fasting is sunnah. /fasting on to fast it, with suhur and iftar reminders.',
  ])

  const { text } = await $.command.run(run('on'))
  expect(text).toBe(
    "Fasting Thu 24 Sep (Thursday and a white day). You'll get a suhur reminder 45 minutes before Fajr and one at Maghrib for iftar.",
  )

  // 03:25, 45 minutes before Fajr.
  await clock.advance(Date.parse('2026-09-24T03:25:00+07:00') - Date.parse('2026-09-23T17:40:00+07:00'))
  expect(w.toasts.at(-1)).toBe('🍽 Suhur: Fajr is at 04:10, in 45m.')
  expect(w.tails.at(-1)).toBe('🍽 Suhur until 04:10')

  await clock.advance(60 * 60e3)
  expect(w.tails.at(-1)).toBe('🍽 Fasting · iftar 17:35')

  await clock.advance(Date.parse('2026-09-24T17:35:00+07:00') - Date.parse('2026-09-24T04:25:00+07:00'))
  expect(w.toasts.at(-1)).toContain("🍽 It's Maghrib: time to break your fast.")
  expect(w.tails.at(-1)).toBeUndefined()
})

test('/fasting lists the coming sunnah fasts and turns a day off', { options: ONLY }, async ($, on) => {
  const now = Date.parse('2026-09-23T10:00:00+07:00')
  mock.clock(on, { now })
  world(on, () => now)
  await $.session.start(start)

  await $.command.run(run('on tomorrow'))
  const { text } = await $.command.run(run(''))
  expect(text).toContain('✓ Thu 24 Sep  Thursday and a white day')
  expect(text).toContain('  Fri 25 Sep  A white day')
  expect(text).toContain('  Mon 28 Sep  Monday')

  expect((await $.command.run(run('off tomorrow'))).text).toBe('Not fasting Thu 24 Sep; its reminders are off.')
  expect((await $.command.run(run('on 2026-09-01'))).text).toBe('Tue 1 Sep has passed.')
})
