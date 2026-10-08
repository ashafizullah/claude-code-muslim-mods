import { expect, mock, test } from 'claude-code/testing'

import { VERSES } from '../hooks/daily-ayah/verses'
import { verseFor } from '../hooks/daily-ayah'
import { only } from './only'

const ONLY = only('dailyAyah')

// 3 Oct 2026, 09:00 WIB; the verse is picked from the start time.
const NOW = Date.parse('2026-10-03T02:00:00Z')
const SEED = NOW % VERSES.length

test("shows the session's verse above the prompt, cycles it and hides it", { options: ONLY }, async ($, on) => {
  mock.clock(on, { now: NOW })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // The engine's own band: nothing.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  let skipped = 0
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'muslim-mods',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never,
    })
    const shown = verseFor(SEED, skipped)
    expect(await ui.find({ type: 'Text', text: `— ${shown.surah} (${shown.meaning}) ${shown.ref} ` })).toBeDefined()

    await ui.press({ key: 'another' })
    skipped += 1
    const after = verseFor(SEED, skipped)
    expect(after.ref).not.toBe(shown.ref)
    expect(await ui.find({ type: 'Text', text: `— ${after.surah} (${after.meaning}) ${after.ref} ` })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({
    plugin: 'muslim-mods',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never,
  })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ key: 'another' })).toBeUndefined()
})

test('/ayah prints the verse with its citation', { options: ONLY }, async ($, on) => {
  mock.clock(on, { now: NOW })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const { text } = await $.command.run({
    command: 'ayah',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  const v = verseFor(SEED, 0)
  expect(text).toContain(v.english)
  expect(text).toContain(`${v.ref}, Sahih International`)
})
