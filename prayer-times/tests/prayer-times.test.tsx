import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// 14:35 WIB on 3 Oct 2026; Asr in Jakarta (Kemenag, +2 min ihtiyat) is 14:49.
const START = Date.parse('2026-10-03T07:35:00Z')

const IPWHO = JSON.stringify({
  success: true, city: 'Jakarta', country: 'Indonesia', country_code: 'ID',
  latitude: -6.2088, longitude: 106.8456, timezone: { id: 'Asia/Jakarta' },
})
const GEOCODE_LONDON = JSON.stringify({
  results: [{ name: 'London', country: 'United Kingdom', country_code: 'GB', latitude: 51.50853, longitude: -0.12574, timezone: 'Europe/London' }],
})

function world(on: On, answers: Record<string, string | undefined>) {
  const fetched: string[] = []
  const configured: unknown[] = []
  const toasts: string[] = []
  const tails: (string | undefined)[] = []
  mock.store(on)
  on('http.fetch', (_, e) => {
    fetched.push(e.url)
    const hit = Object.entries(answers).find(([prefix]) => e.url.startsWith(prefix))?.[1]
    return { value: { status: hit ? 200 : 503, ok: !!hit, headers: {}, text: hit ?? '' } } as never
  })
  on('config.set', (_, e) => {
    configured.push(e)
    return { value: e.value }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  // The engine's hint line: records the tail the mods hand it.
  on('ui.render', ($, e) => {
    if (e.component === 'PromptHint') tails.push(e.props.tail)
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { fetched, configured, toasts, tails }
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const HINT = {
  plugin: 'prayer-times',
  surface: 'terminal',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const
const run = (args: string) => ({
  command: 'prayer-times',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
}) as const

test('detects the place from the IP, reminds before Asr and announces it', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const w = world(on, { 'https://ipwho.is/': IPWHO })

  await $.session.start(start)
  await $.ui.mount(HINT as never)
  expect(w.tails.at(-1)).toBe('🕌 Asr 14:49 · in 0:14:00')

  await clock.advance(1e3)
  expect(w.tails.at(-1)).toBe('🕌 Asr 14:49 · in 0:13:59')

  await clock.advance(5 * 60e3 - 1e3)
  expect(w.toasts).toEqual(['🕌 Asr in 10m, at 14:49'])

  await clock.advance(10 * 60e3)
  expect(w.toasts.at(-1)).toBe("🕌 It's time for Asr (14:49). Time to pray.")
  expect(w.tails.at(-1)).toBe('🕌 Maghrib 17:49 · in 2:59:00')

  const { text } = await $.command.run(run(''))
  expect(text).toContain('Jakarta, Indonesia · Asia/Jakarta · Kemenag · detected from your IP')
  expect(text).toContain('Fajr     04:21')
})

test('a city is geocoded, in its own time zone and method', { options: { city: 'London' } }, async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-06-21T12:00:00Z') })
  const w = world(on, { 'https://geocoding-api.open-meteo.com/': GEOCODE_LONDON })

  await $.session.start(start)
  const { text } = await $.command.run(run(''))
  expect(w.fetched.some(url => url.includes('name=London'))).toBe(true)
  expect(text).toContain('London, United Kingdom · Europe/London · MWL')
  expect(text).toContain('Fajr     02:31')
  expect(text).toContain('Isha     23:27')
})

test('with no network and nothing cached it asks for a city', async ($, on) => {
  mock.clock(on, { now: START })
  const w = world(on, {})

  await $.session.start(start)
  await $.ui.mount(HINT as never)
  expect(w.tails.at(-1)).toBe('🕌 Location unknown: /prayer-times <your city>')
})

test('/prayer-times <city> saves the city', async ($, on) => {
  mock.clock(on, { now: START })
  const w = world(on, { 'https://ipwho.is/': IPWHO })

  const { text } = await $.command.run(run('Kuala Lumpur'))
  expect(w.configured).toEqual([expect.objectContaining({ key: 'prayer-times.city', value: 'Kuala Lumpur' })])
  expect(text).toBe('Prayer times will now follow Kuala Lumpur.')
})

test('looks again when the network comes back', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  const answers: Record<string, string | undefined> = {}
  const w = world(on, answers)

  await $.session.start(start)
  await $.ui.mount(HINT as never)
  expect(w.tails.at(-1)).toBe('🕌 Location unknown: /prayer-times <your city>')

  answers['https://ipwho.is/'] = IPWHO
  await clock.advance(60e3)
  await clock.advance(1e3)
  expect(w.tails.at(-1)).toMatch(/^🕌 Asr 14:49 · in /)
})

test('a page that is not JSON counts as no answer', async ($, on) => {
  mock.clock(on, { now: START })
  const w = world(on, { 'https://ipwho.is/': '<html>rate limited</html>', 'https://ipapi.co/': IPWHO })

  await $.session.start(start)
  const { text } = await $.command.run(run(''))
  expect(text).toContain('Jakarta, Indonesia')
  expect(w.fetched).toContain('https://ipapi.co/json/')
})

test('coordinates get their own time zone', { options: { city: '21.42, 39.83' } }, async ($, on) => {
  mock.clock(on, { now: START })
  const w = world(on, { 'https://api.open-meteo.com/v1/forecast': JSON.stringify({ timezone: 'Asia/Riyadh' }) })

  await $.session.start(start)
  const { text } = await $.command.run(run(''))
  expect(w.fetched.some(url => url.includes('latitude=21.42&longitude=39.83'))).toBe(true)
  expect(text).toContain('21.42, 39.83 · Asia/Riyadh')
})

test('lists Dhuha and Tahajud, and says when each begins', async ($, on) => {
  // 00:49:30 WIB on 4 Oct: the last third of the night (Maghrib 17:49 to Fajr 04:21) begins at 00:50.
  const clock = mock.clock(on, { now: Date.parse('2026-10-03T17:49:30Z') })
  const w = world(on, { 'https://ipwho.is/': IPWHO })

  await $.session.start(start)
  await $.ui.mount(HINT as never)
  await clock.advance(60e3)
  expect(w.toasts).toEqual(['🌙 The last third of the night has begun (00:50): time for Tahajud, until Fajr.'])
  expect(w.tails.at(-1)).toBe('🕌 Fajr 04:21 · in 3:30:30')

  const { text } = await $.command.run(run(''))
  expect(text).toContain('  Tahajud  00:50\n  Fajr     04:21  ← next\n  Sunrise  05:34\n  Dhuha    06:00\n  Dhuhr')
})

test('tells when Dhuha begins', async ($, on) => {
  // 05:58 WIB on 3 Oct; Dhuha is at 06:00.
  const clock = mock.clock(on, { now: Date.parse('2026-10-02T22:58:00Z') })
  const w = world(on, { 'https://ipwho.is/': IPWHO })

  await $.session.start(start)
  await clock.advance(3 * 60e3)
  expect(w.toasts).toEqual(['☀️ Dhuha has begun (06:00), until shortly before Dhuhr.'])
})

test('sunnahReminders off keeps Dhuha and Tahajud quiet', { options: { sunnahReminders: false } }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-03T17:49:30Z') })
  const w = world(on, { 'https://ipwho.is/': IPWHO })

  await $.session.start(start)
  await clock.advance(60e3)
  expect(w.toasts).toEqual([])
})
