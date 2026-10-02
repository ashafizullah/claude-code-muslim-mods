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
  const statuses: (string | undefined)[] = []
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
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { fetched, configured, toasts, statuses }
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
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
  expect(w.statuses.at(-1)).toBe('🕌 Asr 14:49 · in 14m')

  await clock.advance(5 * 60e3)
  expect(w.toasts).toEqual(['🕌 Asr in 10m, at 14:49'])

  await clock.advance(10 * 60e3)
  expect(w.toasts.at(-1)).toBe("🕌 It's time for Asr (14:49). Time to pray.")
  expect(w.statuses.at(-1)).toBe('🕌 Maghrib 17:49 · in 2h 59m')

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
  expect(w.statuses.at(-1)).toBe('🕌 Location unknown: run /prayer-times <your city>')
})

test('/prayer-times <city> saves the city', async ($, on) => {
  mock.clock(on, { now: START })
  const w = world(on, { 'https://ipwho.is/': IPWHO })

  const { text } = await $.command.run(run('Kuala Lumpur'))
  expect(w.configured).toEqual([expect.objectContaining({ key: 'prayer-times.city', value: 'Kuala Lumpur' })])
  expect(text).toBe('Prayer times will now follow Kuala Lumpur.')
})
