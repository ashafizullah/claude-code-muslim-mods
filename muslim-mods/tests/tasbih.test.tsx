import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PHRASES, messageFor, reachedOf, rowsFor, untilText } from '../hooks/tasbih'
import { only } from './only'

const ONLY = only('tasbih')

const NOW = Date.parse('2026-10-07T14:00:00Z')
const at = (ms: number) => new Date(NOW + ms).toISOString()
const H = 3600e3

function world(on: On, stored?: Record<string, unknown>) {
  const toasts: string[] = []
  const tails: (string | undefined)[] = []
  const opened: string[] = []
  const closed: string[] = []
  mock.store(on, stored)
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    if (e.component === 'PromptHint') tails.push(e.props.tail)
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  return { toasts, tails, opened, closed }
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const measure = (rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]) =>
  ({ context: {}, rateLimits, changed: ['rateLimits'] }) as never
const hint = { plugin: 'muslim-mods', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '', tail: undefined } } as never
const pane = { plugin: 'muslim-mods', surface: 'terminal', component: 'Pane', requestId: 'tasbih', props: { title: 'Tasbih', isFocused: true, bodyColumns: 76, placement: 'dock' } } as never

test('only a used-up 5-hour or weekly window counts', { options: ONLY }, () => {
  expect(
    reachedOf([
      { kind: 'five_hour', percentUsed: 99.9 },
      { kind: 'seven_day', percentUsed: 100, resetsAt: at(H) },
      { kind: 'spend_limit', percentUsed: 120 },
    ]),
  ).toEqual([{ kind: 'seven_day', resetsAt: at(H) }])
})

test('the wait reads in days, hours and minutes', { options: ONLY }, () => {
  expect(untilText(at(45 * 60e3), NOW)).toBe('45m')
  expect(untilText(at(2 * H + 14 * 60e3), NOW)).toBe('2h 14m')
  expect(untilText(at(76 * H), NOW)).toBe('3d 4h')
  expect(messageFor([{ kind: 'five_hour', resetsAt: at(H) }], NOW)).toBe('Your 5-hour limit is used up, back in 1h 0m.')
})

test('the four phrases make a hundred', { options: ONLY }, () => {
  expect(PHRASES.reduce((n, p) => n + p.repeat, 0)).toBe(100)
  expect(rowsFor(40, false)).toBeGreaterThan(rowsFor(80, false))
})

test('a used-up limit invites once, and the hint clears when it resets', { options: ONLY }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const w = world(on)
  await $.session.start(start)

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 80, resetsAt: at(H) }]))
  expect(w.toasts).toEqual([])

  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 100, resetsAt: at(H) }]))
  expect(w.toasts).toEqual(['📿 Your 5-hour limit is used up, back in 1h 0m. A moment for SubhanAllah, Alhamdulillah, Allahu akbar? /tasbih'])
  expect(w.opened).toEqual(['tasbih'])
  await $.ui.mount(hint)
  expect(w.tails.at(-1)).toBe('📿 5-hour limit reached · back in 1h 0m · /tasbih')

  // The same window measured again does not invite again.
  await $.session.measure(measure([{ kind: 'five_hour', percentUsed: 100, resetsAt: at(H) }]))
  expect(w.toasts.length).toBe(1)

  await clock.advance(H + 60e3)
  await $.ui.mount(hint)
  expect(w.tails.at(-1)).toBeUndefined()
})

test('a window already invited in an earlier session keeps only the hint', { options: ONLY }, async ($, on) => {
  mock.clock(on, { now: NOW })
  const w = world(on, { 'tasbih.invited': [`seven_day:${at(30 * H)}`] })
  await $.session.start(start)
  await $.session.measure(measure([{ kind: 'seven_day', percentUsed: 100, resetsAt: at(30 * H) }]))
  expect(w.toasts).toEqual([])
  await $.ui.mount(hint)
  expect(w.tails.at(-1)).toBe('📿 weekly limit reached · back in 1d 6h · /tasbih')
})

test('the counter runs through all four phrases and finishes', { options: ONLY }, async ($, on) => {
  mock.clock(on, { now: NOW })
  const w = world(on)
  await $.session.start(start)
  expect((await $.command.run({ command: 'tasbih', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text).toContain('Tasbih opened')

  const ui = await $.ui.mount(pane)
  expect((await ui.find({ key: 'count' }))?.text).toContain('0 / 33')
  for (let n = 0; n < 33; n++) await ui.press({ key: 'count' })
  expect(await ui.find({ type: 'Text', text: /Alḥamdulillāh/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /33 \/ 100/ })).toBeDefined()
  for (let n = 0; n < 66; n++) await ui.press({ key: 'count' })
  expect((await ui.find({ key: 'count' }))?.text).toContain('0 / 1')
  await ui.press({ key: 'count' })
  await ui.unmount()

  expect(w.closed).toEqual(['tasbih'])
  expect(w.toasts.at(-1)).toBe('📿 May Allah accept it from you.')
})

test('/tasbih demo shows the invitation, and close takes it away', { options: ONLY }, async ($, on) => {
  mock.clock(on, { now: NOW })
  const w = world(on)
  await $.session.start(start)
  const run = (args: string) => $.command.run({ command: 'tasbih', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)

  expect((await run('demo')).text).toContain('Tasbih demo')
  expect(w.toasts).toEqual(['📿 Your 5-hour limit is used up, back in 1h 42m. A moment for SubhanAllah, Alhamdulillah, Allahu akbar? /tasbih'])
  expect(w.opened).toEqual(['tasbih'])
  await $.ui.mount(hint)
  expect(w.tails.at(-1)).toBe('📿 5-hour limit reached · back in 1h 42m · /tasbih')

  await run('close')
  await $.ui.mount(hint)
  expect(w.tails.at(-1)).toBeUndefined()
})
