import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { find } from '../hooks/register'
import { only } from './only'

function world(on: On, lines: Record<string, string> = {}) {
  const configured: { key: string; value: unknown }[] = []
  const tails: (string | undefined)[] = []
  mock.store(on)
  mock.clock(on, { now: Date.parse('2026-10-07T10:00:00+07:00') })
  // Each feature's part of the hint line, as it would have published it.
  on('state.get', (_, e, next) => (e.key in lines ? ({ value: { value: lines[e.key], version: 1 } } as never) : next(e)))
  on('config.set', (_, e) => {
    configured.push(e as never)
    return { value: e.value }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.render', ($, e) => {
    if (e.component === 'PromptHint') tails.push(e.props.tail)
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { configured, tails }
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const run = (args: string) =>
  ({ command: 'muslim', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
const PANE = {
  plugin: 'muslim-mods',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'muslim',
  props: { title: 'Muslim mods', isFocused: true, bodyColumns: 80, placement: 'dock' },
} as const

test('features are found by id, alias or title', () => {
  expect(find('ayah')?.id).toBe('dailyAyah')
  expect(find("Jumu'ah")?.id).toBe('jumuah')
  expect(find('sunnah-fasting')?.id).toBe('sunnahFasting')
  expect(find('nope')).toBeUndefined()
})

test('/muslim lists, and switches a feature on or off through the settings', { options: only('jumuah', 'dailyAyah') }, async ($, on) => {
  const w = world(on)
  await $.session.start(start)

  expect((await $.command.run(run('list'))).text).toContain('● Daily ayah')
  expect((await $.command.run(run('list'))).text).toContain('○ Prayer times')
  expect((await $.command.run(run('off ayah'))).text).toBe('Daily ayah is off.')
  expect((await $.command.run(run('on prayer'))).text).toBe('Prayer times is on.')
  expect(w.configured).toEqual([
    expect.objectContaining({ key: 'muslim-mods.dailyAyah', value: false }),
    expect.objectContaining({ key: 'muslim-mods.prayerTimes', value: true }),
  ])
  expect((await $.command.run(run('off nope'))).text).toContain('Which one?')
})

test('the dashboard shows each feature and toggles it', { options: only('jumuah', 'dailyAyah') }, async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.command.run(run(''))
  const ui = await $.ui.mount(PANE as never)

  expect((await ui.find({ key: 'toggle-jumuah' }))?.text).toContain('On')
  expect((await ui.find({ key: 'toggle-tasbih' }))?.text).toContain('Off')
  expect((await ui.find({ key: 'row-jumuah' }))?.text).toContain('works in part without Prayer times')

  await ui.press({ key: 'toggle-tasbih' })
  expect(w.configured.at(-1)).toEqual(expect.objectContaining({ key: 'muslim-mods.tasbih', value: true }))
})

test('the hint line joins the parts of the features that are on, in order', { options: only('hijriDate', 'jumuah') }, async ($, on) => {
  const w = world(on, { jumuahLine: '📖 Al-Kahf · /jumuah read', hijriLine: "📅 25 Rabi' al-Akhir 1448", prayerLine: '🕌 off' })
  await $.session.start(start)
  await $.ui.mount({
    plugin: 'muslim-mods',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  } as never)
  expect(w.tails.at(-1)).toBe("📅 25 Rabi' al-Akhir 1448 · 📖 Al-Kahf · /jumuah read")
})
