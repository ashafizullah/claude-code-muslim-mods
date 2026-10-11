import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { SHARED_KEY, breakSettings } from '../hooks/salah-break'
import { only } from './only'

const ONLY = only('salahBreak')

/** A day of Jakarta prayer times as prayer-times publishes it. */
const DAY = {
  date: '2026-10-12',
  timeZone: 'Asia/Jakarta',
  slots: [
    { name: 'Fajr', at: Date.parse('2026-10-12T04:10:00+07:00') },
    { name: 'Sunrise', at: Date.parse('2026-10-12T05:20:00+07:00') },
    { name: 'Dhuhr', at: Date.parse('2026-10-12T11:40:00+07:00') },
    { name: 'Asr', at: Date.parse('2026-10-12T14:50:00+07:00') },
    { name: 'Maghrib', at: Date.parse('2026-10-12T17:45:00+07:00') },
    { name: 'Isha', at: Date.parse('2026-10-12T18:55:00+07:00') },
  ],
}

function world(on: On, { canShow = () => true, left = undefined as unknown } = {}) {
  const toasts: string[] = []
  const tails: (string | undefined)[] = []
  const suggested: string[] = []
  let isLeftOver = left !== undefined
  // The plugin's store, which every terminal shares: what the test writes here, another terminal wrote.
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', (_, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  // Stands in for prayer-times, and for a break an earlier load left in the session's state.
  on('state.get', (_, e, next) => {
    if (e.key === 'prayerToday') return { value: { value: DAY, version: 1 } } as never
    if (e.key === 'salahBreak' && isLeftOver) return { value: { value: left, version: 1 } } as never
    return next(e)
  })
  on('state.set', (_, e, next) => {
    if (e.key === 'salahBreak') isLeftOver = false
    return next(e)
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.suggest', (_, e) => {
    const isShown = canShow()
    if (isShown) suggested.push(e.text)
    return { isShown }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    if (e.component === 'PromptHint') tails.push(e.props.tail)
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { toasts, tails, suggested, store }
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const HINT = {
  plugin: 'muslim-mods',
  surface: 'terminal',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const
const salah = (args: string) =>
  ({ command: 'salah', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
const typed = (text: string, attachments?: { type: 'image' }[]) =>
  ({ text, wait: false, origin: { kind: 'composer' }, ...(attachments ? { attachments } : {}) }) as never

test('the length is read from the options, within 1 to 120 minutes', () => {
  expect(breakSettings({})).toEqual({ minutes: 15, isHolding: true })
  expect(breakSettings({ salahBreakMinutes: 0 }).minutes).toBe(15)
  expect(breakSettings({ salahBreakMinutes: -5 }).minutes).toBe(1)
  expect(breakSettings({ salahBreakMinutes: 1000 }).minutes).toBe(120)
  expect(breakSettings({ salahBreakMinutes: 'x' as never }).minutes).toBe(15)
  expect(breakSettings({ salahBreakHold: false }).isHolding).toBe(false)
})

// Sixteen minutes of 1-second ticks: slow on a CI runner.
test('at Dhuhr a break begins, holds prompts, and offers them back when it ends', { options: ONLY, timeoutMs: 30e3 }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T11:39:00+07:00') })
  const w = world(on)
  await $.session.start(start)
  await $.ui.mount(HINT as never)

  expect((await $.prompt.submit(typed('before'))).text).toBe('before')
  await clock.advance(60e3)
  expect(w.toasts).toEqual(["🧎 Dhuhr: a salah break until 11:55. Prompts wait until then; /salah done when you're back."])
  expect(w.tails.at(-1)).toBe('🧎 Salah break · Dhuhr · 15:00 left · /salah done')

  expect((await $.prompt.submit(typed('fix the build'))).drop).toContain('Salah break for Dhuhr until 11:55')
  expect((await $.prompt.submit(typed('and the tests'))).drop).not.toContain('attachments')
  expect((await $.prompt.submit(typed('this screenshot', [{ type: 'image' }]))).drop).toContain('attachments are not kept')
  // Slash commands still go through.
  expect((await $.prompt.submit(typed('/help'))).text).toBe('/help')

  await clock.advance(15 * 60e3)
  expect(w.toasts.at(-1)).toBe('🤲 The salah break is over. Taqabbal Allahu minna wa minkum.')
  expect(w.suggested).toEqual(['fix the build\n\nand the tests\n\nthis screenshot'])
  expect(w.tails.at(-1)).toBeUndefined()
  expect((await $.prompt.submit(typed('after'))).text).toBe('after')
})

test('/salah done ends it, later puts it off five minutes, now starts one', { options: ONLY, timeoutMs: 30e3 }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T14:49:30+07:00') })
  const w = world(on)
  await $.session.start(start)
  expect((await $.command.run(salah('done'))).text).toBe('No salah break right now.')

  await clock.advance(60e3)
  expect((await $.command.run(salah(''))).text).toContain('Salah break for Asr until 15:05')
  expect((await $.command.run(salah('later'))).text).toBe('The salah break for Asr starts in 5 minutes, at 14:55.')
  // Put off, prompts go through until it starts.
  expect((await $.prompt.submit(typed('quick one'))).text).toBe('quick one')
  await clock.advance(5 * 60e3)
  expect((await $.prompt.submit(typed('held'))).drop).toBeDefined()

  expect((await $.command.run(salah('done'))).text).toBe('Welcome back. Taqabbal Allahu minna wa minkum.')
  expect(w.suggested).toEqual(['held'])
  expect((await $.prompt.submit(typed('free'))).text).toBe('free')

  expect((await $.command.run(salah('now'))).text).toBe("Salah break until 15:10. /salah done when you're back.")
  expect((await $.command.run(salah(''))).text).toContain('Salah break for Asr')
})

test('a held prompt waits until the prompt box can show it', { options: ONLY }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T17:47:00+07:00') })
  let isBusy = true
  const w = world(on, { canShow: () => !isBusy })
  await $.session.start(start)
  await $.command.run(salah('now'))
  await $.prompt.submit(typed('keep me'))
  await $.command.run(salah('done'))
  expect(w.suggested).toEqual([])
  await clock.advance(1e3)
  expect(w.suggested).toEqual([])
  isBusy = false
  await clock.advance(1e3)
  expect(w.suggested).toEqual(['keep me'])
  await clock.advance(5e3)
  expect(w.suggested.length).toBe(1)
})

test('with hold off, the break is only a reminder', { options: { ...ONLY, salahBreakHold: false, salahBreakMinutes: 10 } }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T18:54:30+07:00') })
  const w = world(on)
  await $.session.start(start)
  await clock.advance(60e3)
  expect(w.toasts).toEqual(["🧎 Isha: a salah break until 19:05. /salah done when you're back."])
  expect((await $.prompt.submit(typed('go on'))).text).toBe('go on')
})

test('a break long over ends without a word', { options: ONLY }, async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-12T16:00:00+07:00') })
  const left = { prayer: 'Dhuhr', from: DAY.slots[2].at, until: DAY.slots[2].at + 15 * 60e3, timeZone: 'Asia/Jakarta' }
  const w = world(on, { left })
  await $.session.start(start)
  expect(w.toasts).toEqual([])
  expect((await $.command.run(salah(''))).text).toContain('No salah break right now.')
})

// Another terminal is another session of the same plugin: its only line to this one is the store.
test('/salah done in another terminal ends the break here too', { options: ONLY, timeoutMs: 30e3 }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T11:39:00+07:00') })
  const w = world(on)
  await $.session.start(start)
  await $.ui.mount(HINT as never)
  await clock.advance(60e3)
  const shared = w.store.get(SHARED_KEY) as Record<string, unknown>
  expect(shared).toEqual(expect.objectContaining({ id: DAY.slots[2].at, prayer: 'Dhuhr' }))
  await $.prompt.submit(typed('fix the build'))

  await clock.advance(3 * 60e3)
  w.store.set(SHARED_KEY, { ...shared, endedAt: clock.now() })
  await clock.advance(1e3)
  expect(w.tails.at(-1)).toBeUndefined()
  expect(w.suggested).toEqual(['fix the build'])
  expect((await $.prompt.submit(typed('go on'))).text).toBe('go on')
  // Ended without a word here, and not begun again.
  await clock.advance(15 * 60e3)
  expect(w.toasts.length).toBe(1)
})

test('/salah done here tells the other terminals', { options: ONLY }, async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-12T15:00:00+07:00') })
  const w = world(on)
  await $.session.start(start)
  await $.command.run(salah('now'))
  await $.command.run(salah('later'))
  expect(w.store.get(SHARED_KEY)).toEqual(
    expect.objectContaining({ prayer: 'Asr', from: Date.parse('2026-10-12T15:05:00+07:00') }),
  )
  await $.command.run(salah('done'))
  expect(w.store.get(SHARED_KEY)).toEqual(expect.objectContaining({ endedAt: Date.parse('2026-10-12T15:00:00+07:00') }))
})

test('a break begun or put off in another terminal is taken up here', { options: ONLY }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T15:00:00+07:00') })
  const w = world(on)
  await $.session.start(start)
  await $.ui.mount(HINT as never)
  const now = clock.now()
  const other = { id: now, prayer: 'Asr', from: now, until: now + 15 * 60e3, timeZone: 'Asia/Jakarta' }
  w.store.set(SHARED_KEY, other)
  await clock.advance(1e3)
  expect((await $.prompt.submit(typed('wait'))).drop).toContain('Salah break for Asr until 15:15')

  w.store.set(SHARED_KEY, { ...other, from: now + 5 * 60e3, until: now + 20 * 60e3 })
  await clock.advance(1e3)
  expect(w.tails.at(-1)).toBe('🧎 Salah break for Asr in 4:58')
  expect((await $.prompt.submit(typed('quick one'))).text).toBe('quick one')
})

test('a prayer another terminal already ended starts no break here', { options: ONLY }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T17:44:30+07:00') })
  const w = world(on)
  await $.session.start(start)
  const at = DAY.slots[4].at
  w.store.set(SHARED_KEY, { id: at, prayer: 'Maghrib', from: at, until: at + 15 * 60e3, endedAt: at })
  await clock.advance(60e3)
  expect(w.toasts).toEqual([])
  expect((await $.prompt.submit(typed('go'))).text).toBe('go')
})

test('a newer break from another terminal replaces this one, and its done ends it', { options: ONLY }, async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-12T11:39:30+07:00') })
  const w = world(on)
  await $.session.start(start)
  await $.ui.mount(HINT as never)
  await clock.advance(60e3)
  expect(w.tails.at(-1)).toContain('Dhuhr')

  // Another terminal says /salah now ten minutes into Dhuhr's break.
  const now = clock.now() + 10 * 60e3
  await clock.set(now)
  const newer = { id: now, prayer: 'Dhuhr', from: now, until: now + 15 * 60e3, timeZone: 'Asia/Jakarta' }
  w.store.set(SHARED_KEY, newer)
  await clock.advance(1e3)
  expect((await $.prompt.submit(typed('wait'))).drop).toContain('until 12:05')

  w.store.set(SHARED_KEY, { ...newer, endedAt: clock.now() })
  await clock.advance(1e3)
  expect(w.tails.at(-1)).toBeUndefined()
  expect(w.toasts.length).toBe(1)
})
