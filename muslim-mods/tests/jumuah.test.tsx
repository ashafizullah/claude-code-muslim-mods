import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { only } from './only'

const ONLY = only('jumuah')

/** A day of Jakarta prayer times as prayer-times publishes it: Dhuhr 11:30, Asr 14:40, Maghrib 17:35 WIB. */
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

function world(on: On, now: () => number) {
  const toasts: string[] = []
  const tails: (string | undefined)[] = []
  mock.store(on)
  // Stands in for prayer-times, following the mocked clock.
  on('state.get', (_, e, next) =>
    e.key === 'prayerToday'
      ? ({ value: { value: dayIn(new Date(now() + 7 * 3600e3).toISOString().slice(0, 10)), version: 1 } } as never)
      : next(e),
  )
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
const run = (args: string) =>
  ({ command: 'jumuah', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

test("Thursday's Maghrib begins the night of Jumu'ah", { options: ONLY }, async ($, on) => {
  // 8 Oct 2026 is a Thursday.
  const clock = mock.clock(on, { now: Date.parse('2026-10-08T17:30:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  await $.ui.mount(HINT as never)
  expect(w.tails.at(-1)).toBeUndefined()

  await clock.advance(10 * 60e3)
  expect(w.toasts).toEqual([expect.stringContaining("🌙 The night of Jumu'ah has begun")])
  expect(w.tails.at(-1)).toBe('📖 Al-Kahf · /jumuah read')
})

test('Friday morning, the prayer reminder, and Al-Kahf marked read', { options: ONLY }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-09T10:30:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  await $.ui.mount(HINT as never)
  expect(w.toasts).toEqual([expect.stringContaining("🕌 Jumu'ah Mubarak.")])

  await clock.advance(20 * 60e3)
  expect(w.toasts.at(-1)).toBe('🕌 The Friday prayer is at Dhuhr, 11:30, in 45m: time to get ready and go early.')

  expect((await $.command.run(run(''))).text).toContain('  · Read Surah Al-Kahf (/jumuah read)')
  await $.command.run(run('read'))
  await clock.advance(0)
  expect(w.tails.at(-1)).toBeUndefined()
  expect((await $.command.run(run(''))).text).toBe(
    [
      "Jumu'ah, Fri 9 Oct. The Friday prayer is at Dhuhr, 11:30.",
      '  ✓ Read Surah Al-Kahf (/jumuah read)',
      '  · Send salawat on the Prophet often',
      '  · Ghusl, clean clothes and perfume, and go early to the prayer',
      '  · Dua in the last hour, after Asr',
    ].join('\n'),
  )

  // A new session the same Friday doesn't greet again.
  await $.session.start(start)
  expect(w.toasts.length).toBe(2)
})

test('the last hour after Asr on Friday', { options: ONLY }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-09T14:35:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  await clock.advance(10 * 60e3)
  expect(w.toasts.at(-1)).toBe("🤲 Friday after Asr: the last hour of Jumu'ah, when dua is answered (Abu Dawud 1048).")
})

test('midweek, when the next Jumu\'ah is', { options: ONLY }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-07T10:00:00+07:00') })
  const w = world(on, clock.now)
  await $.session.start(start)
  expect(w.toasts).toEqual([])
  expect((await $.command.run(run(''))).text).toBe("The next Jumu'ah is Fri 9 Oct, in 2 days; it begins at Thursday's Maghrib.")
  expect((await $.command.run(run('read'))).text).toContain("from Thursday's Maghrib")
})
