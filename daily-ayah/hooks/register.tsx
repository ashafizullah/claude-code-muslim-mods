import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { VERSES } from './verses'
import type { Verse } from './verses'

const seed = atom({ plugin: 'daily-ayah', key: 'seed' } as const, -1)
const skip = atom({ plugin: 'daily-ayah', key: 'skip' } as const, 0)
const isHidden = atom({ plugin: 'daily-ayah', key: 'isHidden' } as const, false)

/** The session's verse; each ↻ steps by a stride coprime to the list's length, so the next is unrelated. */
export function verseFor(seeded: number, skipped: number): Verse {
  const index = (seeded + skipped * 37) % VERSES.length
  return VERSES[index] ?? VERSES[0]!
}

const cite = (v: Verse) => `${v.surah} (${v.meaning}) ${v.ref}`

/** A fresh verse for every session start, which includes /clear. */
async function newVerse($: EngineInterface) {
  const now = await $.clock.now()
  await update($, seed, () => now % VERSES.length)
  await update($, skip, () => 0)
}

export const register: Register = (on, options) => {
  const showArabic = options.showArabic === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ayah',
      description: "Show a verse of the Qur'an",
    })
    await newVerse($)

    return next(e)
  })

  on('command.run', { command: 'ayah' }, async $ => {
    const v = verseFor(await read($, seed), await read($, skip))
    await update($, isHidden, () => false)

    return { text: `${v.arabic}\n\n"${v.english}"\n— ${cite(v)}, Sahih International` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }
    const seeded = await read($, seed)
    if (seeded < 0) {
      return next(e)
    }

    const v = verseFor(seeded, await read($, skip))
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        {showArabic && <Text>{v.arabic}</Text>}
        <Text italic>📖 "{v.english}"</Text>
        <Box flexDirection="row">
          <Text dimColor>— {cite(v)} </Text>
          <Button key="another" plain label="↻" onPress={() => update($, skip, n => n + 1)} />
          <Text> </Text>
          <Button key="hide" plain role="dismiss" label="×" onPress={() => update($, isHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}
