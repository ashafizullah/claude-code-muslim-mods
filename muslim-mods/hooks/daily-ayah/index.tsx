import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { VERSES } from './verses'
import type { Verse } from './verses'
import type { Feature } from '../feature'

const seed = atom({ plugin: 'muslim-mods', key: 'ayahSeed' } as const, -1)
const skip = atom({ plugin: 'muslim-mods', key: 'ayahSkip' } as const, 0)
const isHidden = atom({ plugin: 'muslim-mods', key: 'ayahHidden' } as const, false)

/** The session's verse; each ↻ steps by a stride coprime to the list's length, so the next is unrelated. */
export function verseFor(seeded: number, skipped: number): Verse {
  const index = (seeded + skipped * 37) % VERSES.length
  return VERSES[index] ?? VERSES[0]!
}

const cite = (v: Verse) => `${v.surah} (${v.meaning}) ${v.ref}`

/** A fresh verse: when the session starts and on /clear, which ends it without a new session.start. */
async function newVerse($: EngineInterface) {
  const now = await $.clock.now()
  await update($, seed, () => now % VERSES.length)
  await update($, skip, () => 0)
}

export const dailyAyah: Feature = (on, options) => {
  const showArabic = options.showArabic === true

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


  on('session.start', { isInteractive: true }, async ($, e, next) => {
    await $.command.register({
      name: 'ayah',
      description: "Show a verse of the Qur'an",
    })
    // A reload (switching a feature, changing an option) starts the session's hooks again; keep its verse.
    if ((await read($, seed)) < 0) await newVerse($)
    return next(e)
  })

  on('session.end', { reason: 'clear' }, async ($, e, next) => {
    await newVerse($)
    await update($, isHidden, () => false)
    return next(e)
  })
}
