import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { VERSES } from './verses'
import type { Verse } from './verses'

const day = atom({ plugin: 'daily-ayah', key: 'day' } as const, 0)
const skip = atom({ plugin: 'daily-ayah', key: 'skip' } as const, 0)
const isHidden = atom({ plugin: 'daily-ayah', key: 'isHidden' } as const, false)

const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'longOffset' })

/** Days since the epoch, counted from midnight in this machine's time zone. */
export function dayNumber(now: number) {
  const name = zone.formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  const offset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60) : 0
  return Math.floor((now + offset * 3600e3) / 86400e3)
}

/** Steps through the list by a stride coprime to its length, so neighbouring days get unrelated verses. */
export function verseFor(dayNo: number, skipped: number): Verse {
  const index = (dayNo * 37 + skipped) % VERSES.length
  return VERSES[index] ?? VERSES[0]!
}

const cite = (v: Verse) => `${v.surah} (${v.meaning}) ${v.ref}`

async function syncDay($: EngineInterface) {
  const today = dayNumber(await $.clock.now())
  if ((await read($, day)) !== today) {
    await update($, day, () => today)
    await update($, skip, () => 0)
  }
}

export const register: Register = (on, options) => {
  const showArabic = options.showArabic === true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ayah',
      description: "Show today's verse of the Qur'an",
    })
    await syncDay($)
    $.clock.every(60e3, () => void syncDay($))

    return next(e)
  })

  on('command.run', { command: 'ayah' }, async $ => {
    const v = verseFor(await read($, day), await read($, skip))
    await update($, isHidden, () => false)

    return { text: `${v.arabic}\n\n"${v.english}"\n— ${cite(v)}, Sahih International` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }
    const dayNo = await read($, day)
    if (dayNo === 0) {
      return next(e)
    }

    const v = verseFor(dayNo, await read($, skip))
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
