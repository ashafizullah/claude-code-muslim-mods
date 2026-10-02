import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { listFor, windowsFor, wordingFor } from '../hooks/register'

const H = 3600e3
// Semarang, 3 Oct 2026 (WIB, UTC+7), as prayer-times publishes it.
const DAY = {
  date: '2026-10-03',
  timeZone: 'Asia/Jakarta',
  slots: [
    { name: 'Fajr', at: Date.parse('2026-10-02T21:07:00Z') },
    { name: 'Sunrise', at: Date.parse('2026-10-02T22:20:00Z') },
    { name: 'Dhuhr', at: Date.parse('2026-10-03T04:29:00Z') },
    { name: 'Asr', at: Date.parse('2026-10-03T07:36:00Z') },
    { name: 'Maghrib', at: Date.parse('2026-10-03T10:35:00Z') },
    { name: 'Isha', at: Date.parse('2026-10-03T11:44:00Z') },
  ],
} as const
const asr = DAY.slots[3].at

function world(on: On) {
  const toasts: string[] = []
  const tails: (string | undefined)[] = []
  const closed: string[] = []
  mock.store(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  // The engine's hint line, and the pane's frame: records the tail the mods hand it.
  on('ui.render', ($, e) => {
    if (e.component === 'PromptHint') tails.push(e.props.tail)
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { toasts, tails, closed }
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const run = (args: string) => ({
  command: 'adhkar',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
}) as const

test('windows follow prayer-times: Fajr to Dhuhr, Asr to Isha', () => {
  const [morning, evening] = windowsFor(asr, DAY as never)
  expect(morning).toEqual({ mode: 'morning', opens: DAY.slots[0].at, closes: DAY.slots[2].at })
  expect(evening).toEqual({ mode: 'evening', opens: asr, closes: DAY.slots[5].at })
})

test('without prayer-times, the windows fall back to the clock', () => {
  const [morning, evening] = windowsFor(asr, null)
  expect(evening!.closes - evening!.opens).toBe(4 * H)
  expect(morning!.closes - morning!.opens).toBe(7 * H)
})

test('the evening list and wording', () => {
  const evening = listFor('evening')
  expect(evening.some(d => d.id === 95)).toBe(false)
  expect(evening.some(d => d.id === 97)).toBe(true)
  expect(wordingFor(evening.find(d => d.id === 78)!, 'evening').english).toStartWith('O Allah, by Your leave we have reached the evening')
})

test('reminds after Asr, then the pane counts through and finishes', async ($, on) => {
  const clock = mock.clock(on, { now: asr + 10 * 60e3 })
  const w = world(on)
  // Stands in for the prayer-times mod's published day.
  on('state.get', (_, e, next) => (e.plugin === 'prayer-times' ? { value: { value: DAY, version: 1 } } as never : next(e)))

  await $.session.start(start)
  // prayer-times, above, has already put its countdown in the tail.
  await $.ui.mount({
    plugin: 'adhkar',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts', tail: '🕌 Maghrib 17:35 · in 2:49:00' },
  } as never)
  expect(w.tails.at(-1)).toBe('🕌 Maghrib 17:35 · in 2:49:00 · 🤲 Evening adhkar · /adhkar')
  expect(w.toasts).toEqual([])

  await clock.advance(5 * 60e3)
  expect(w.toasts).toEqual(['🤲 Time for the evening adhkar. Run /adhkar to read them.'])

  const { text } = await $.command.run(run(''))
  expect(text).toContain('Evening adhkar opened')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'adhkar', surface, component: 'Pane', requestId: 'adhkar', props: { title: 'Evening adhkar', isFocused: true, bodyColumns: 100, placement: 'dock' } as never })
    if (surface === 'terminal') {
      expect((await ui.find({ key: 'count' }))?.text).toContain('0 / 1')
      await ui.press({ key: 'count' })
      // Ayat al-Kursi is said once, so the count moves on to the three Quls, said three times.
      expect(await ui.find({ type: 'Text', text: /1 of 21/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /2 of 21/ })).toBeDefined()
      expect((await ui.find({ key: 'count' }))?.text).toContain('0 / 3')
    } else {
      await ui.press({ key: 'count' })
      expect((await ui.find({ key: 'count' }))?.text).toContain('1 / 3')
      await ui.press({ key: 'finish' })
    }
    await ui.unmount()
  }

  expect(w.closed).toEqual(['adhkar'])
  expect((await $.command.run(run('close'))).text).toBe('Adhkar closed.')
  expect(w.closed).toEqual(['adhkar', 'adhkar'])
  expect(w.toasts.at(-1)).toBe('🤲 Done. May Allah accept it from you.')
  expect(w.tails.at(-1)).toBe('🕌 Maghrib 17:35 · in 2:49:00')
})
