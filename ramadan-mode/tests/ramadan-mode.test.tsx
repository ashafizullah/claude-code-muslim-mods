import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { addDays } from '../hooks/register'

/** A day of Jakarta prayer times as prayer-times publishes it: Fajr 04:10, Maghrib 17:35, Isha 18:45 WIB. */
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

// Umm al-Qura: Ramadan 1448 runs from 8 Feb to 8 Mar 2027 (29 days); 9 Mar is Eid al-Fitr.
const FIRST = Date.parse('2027-02-08T00:00:00Z')
function hijriOn(gregorian: string) {
  const i = Math.round((Date.parse(`${gregorian}T00:00:00Z`) - FIRST) / 864e5)
  if (i < 0) return { gregorian, day: 30 + i, month: 8, year: 1448 }
  if (i < 29) return { gregorian, day: i + 1, month: 9, year: 1448 }
  return { gregorian, day: i - 28, month: 10, year: 1448 }
}

function world(on: On, now: () => number, stored?: Record<string, unknown>) {
  const toasts: string[] = []
  const tails: (string | undefined)[] = []
  mock.store(on, stored)
  // Stands in for prayer-times and hijri-date, following the mocked clock.
  on('state.get', (_, e, next) => {
    const today = new Date(now() + 7 * 3600e3).toISOString().slice(0, 10)
    if (e.plugin === 'prayer-times') return { value: { value: dayIn(today), version: 1 } } as never
    if (e.plugin === 'hijri-date') {
      const ahead = Array.from({ length: 30 }, (_, i) => hijriOn(addDays(today, i)))
      return { value: { value: ahead, version: 1 } } as never
    }
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
  plugin: 'ramadan-mode',
  surface: 'terminal',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const
const run = { command: 'ramadan', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('the eve of Ramadan: Tarawih at Isha', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2027-02-07T18:40:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  await clock.advance(10 * 60e3)
  expect(w.toasts).toEqual(['🌙 Isha: Tarawih tonight, night 1 of Ramadan.'])
  expect((await $.command.run(run)).text).toBe('Tonight is night 1 of Ramadan.\nThe last ten nights begin in 20 nights.')
})

// An hour of 1-second ticks: slow on a CI runner.
test('suhur, imsak, then the countdown to iftar', { timeoutMs: 30e3 }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2027-02-08T03:20:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  await $.ui.mount(HINT as never)
  expect(w.tails.at(-1)).toBe('🍽 Imsak 04:00 · in 0:40:00')

  await clock.advance(5 * 60e3)
  expect(w.toasts).toEqual(['🍽 Suhur, day 1 of Ramadan: imsak at 04:00, Fajr at 04:10.'])
  await clock.advance(35 * 60e3)
  expect(w.toasts.at(-1)).toBe('🍽 Imsak (04:00): finish your suhur, Fajr is at 04:10.')
  expect(w.tails.at(-1)).toBe('🍽 Imsak · Fajr 04:10 · in 0:10:00')
  await clock.advance(10 * 60e3)
  expect(w.tails.at(-1)).toBe('🍽 Iftar 17:35 · in 13:25:00')

  expect((await $.command.run(run)).text).toBe(
    'Day 1 of Ramadan, Mon 8 Feb.\n  Imsak 04:00 · Fajr 04:10 · Iftar 17:35 · Isha 18:45\nTonight is night 2 of Ramadan.\nThe last ten nights begin in 19 nights.',
  )
})

test('iftar at Maghrib', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2027-02-10T17:30:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  await clock.advance(5 * 60e3)
  expect(w.toasts.at(-1)).toContain("🍽 It's Maghrib: time to break your fast.")
})

test('an odd night of the last ten', async ($, on) => {
  // 27 Feb is the 20th of Ramadan; its evening begins the 21st night.
  const clock = mock.clock(on, { now: Date.parse('2027-02-27T18:40:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  await $.ui.mount(HINT as never)
  expect(w.tails.at(-1)).toBe('✨ Night 21 · seek Laylat al-Qadr')
  await clock.advance(10 * 60e3)
  expect(w.toasts.at(-1)).toContain('🌙 Isha: Tarawih tonight, night 21 of Ramadan. ✨ An odd night of the last ten')
})

test('zakat al-fitr is said once a Ramadan', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2027-03-06T10:00:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  expect(w.toasts).toEqual(['🤲 Ramadan is ending: pay zakat al-fitr before the Eid prayer.'])
  await $.session.start(start)
  await clock.advance(1e3)
  expect(w.toasts.length).toBe(1)
})

test('before Ramadan, how long until it', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2027-01-20T10:00:00+07:00') })
  world(on, clock.now)
  await $.session.start(start)
  expect((await $.command.run(run)).text).toBe(
    'Ramadan 1448 begins in 19 days: the first fast is Mon 8 Feb, Tarawih the evening before.',
  )
})
