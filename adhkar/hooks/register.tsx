import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginState, Register } from 'claude-code'

import type { AdhkarMode } from '../types'
import { ADHKAR } from './adhkar'
import type { Dhikr } from './adhkar'

/** What prayer-times publishes, typed by its contract (a dependency of this mod). */
type PrayerTimesDay = PluginState['prayer-times']['today']

const PANE = 'adhkar'
const TICK_MS = 30e3
const DONE_KEY = 'done'

const date = atom({ plugin: 'adhkar', key: 'date' } as const, '')
const mode = atom({ plugin: 'adhkar', key: 'mode' } as const, 'morning')
const index = atom({ plugin: 'adhkar', key: 'index' } as const, 0)
const counts = atom({ plugin: 'adhkar', key: 'counts' } as const, {})
const done = atom({ plugin: 'adhkar', key: 'done' } as const, [])
const line = atom({ plugin: 'adhkar', key: 'line' } as const, null)
const prayerDay = { plugin: 'prayer-times', key: 'today' } as const

const TITLE: Record<AdhkarMode, string> = { morning: 'Morning adhkar', evening: 'Evening adhkar' }

export const listFor = (m: AdhkarMode) => ADHKAR.filter(d => d.when === 'both' || d.when === m)

/** The wording for this time of day. */
export const wordingFor = (d: Dhikr, m: AdhkarMode) =>
  m === 'evening' && d.evening ? d.evening : { transliteration: d.transliteration, english: d.english }

const zones = new Map<string, Intl.DateTimeFormat>()

/** The date and hour at `now` in `timeZone`, this machine's when not given. */
function localNow(now: number, timeZone?: string) {
  let zone = zones.get(timeZone ?? '')
  if (!zone) {
    zone = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    zones.set(timeZone ?? '', zone)
  }
  const name = zone.formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  const offset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60) : 0
  const local = new Date(now + offset * 3600e3)
  return { date: local.toISOString().slice(0, 10), hours: local.getUTCHours() + local.getUTCMinutes() / 60, offset }
}

export type Window = { mode: AdhkarMode; opens: number; closes: number }

/**
 * Morning adhkar run from Fajr until Dhuhr, evening ones from Asr until Isha, read from
 * prayer-times; without it, 04:00 to 11:00 and 15:00 to 19:00 on this machine's clock.
 */
export function windowsFor(now: number, day: PrayerTimesDay | null | undefined): Window[] {
  const { date: today, offset } = localNow(now, day?.timeZone)
  const at = (name: string) => day?.slots.find(s => s.name === name)?.at
  const [fajr, dhuhr, asr, isha] = ['Fajr', 'Dhuhr', 'Asr', 'Isha'].map(at)
  if (day?.date === today && fajr && dhuhr && asr && isha) {
    return [
      { mode: 'morning', opens: fajr, closes: dhuhr },
      { mode: 'evening', opens: asr, closes: isha },
    ]
  }
  const midnight = Date.parse(`${today}T00:00:00Z`) - offset * 3600e3
  const h = (hours: number) => midnight + hours * 3600e3
  return [
    { mode: 'morning', opens: h(4), closes: h(11) },
    { mode: 'evening', opens: h(15), closes: h(19) },
  ]
}

type Watch = { delayMs: number; lastTick: number }

async function tick($: EngineInterface, w: Watch) {
  const now = await $.clock.now()
  const today = localNow(now).date
  if ((await read($, date)) !== today) {
    await update($, date, () => today)
    await update($, counts, () => ({}))
  }

  const { value: day } = await $.state.get(prayerDay)
  const finished = await read($, done)
  let open: AdhkarMode | undefined
  for (const win of windowsFor(now, day)) {
    const isDone = finished.includes(`${today}:${win.mode}`)
    const remindAt = win.opens + w.delayMs
    if (!isDone && w.lastTick < remindAt && remindAt <= now && now < win.closes) {
      $.ui.toast(`🤲 Time for the ${win.mode} adhkar. Run /adhkar to read them.`, { timeoutMs: 15e3 })
    }
    if (!isDone && win.opens <= now && now < win.closes) open = win.mode
  }
  const text = open ? `🤲 ${TITLE[open]} · /adhkar` : null
  if ((await read($, line)) !== text) await update($, line, () => text)
  w.lastTick = now
}

/** The mode a bare /adhkar opens: the open window's, else by the hour. */
async function currentMode($: EngineInterface): Promise<AdhkarMode> {
  const now = await $.clock.now()
  const { value: day } = await $.state.get(prayerDay)
  const open = windowsFor(now, day).find(w => w.opens <= now && now < w.closes)
  return open?.mode ?? (localNow(now).hours < 12 ? 'morning' : 'evening')
}

async function finish($: EngineInterface) {
  const m = await read($, mode)
  const key = `${await read($, date)}:${m}`
  if ((await read($, line))?.includes(TITLE[m])) await update($, line, () => null)
  const list = await update($, done, d => (d.includes(key) ? d : [...d, key].slice(-30)))
  await $.store.set(DONE_KEY, list)
  await $.ui.close({ id: PANE })
  $.ui.toast('🤲 Done. May Allah accept it from you.', { timeoutMs: 8e3 })
}

async function step($: EngineInterface, by: number) {
  const size = listFor(await read($, mode)).length
  await update($, index, i => Math.min(size - 1, Math.max(0, i + by)))
}

/** One more repetition; a dhikr said its full number of times moves on to the next. */
async function count($: EngineInterface) {
  const m = await read($, mode)
  const list = listFor(m)
  const i = await read($, index)
  const d = list[i]
  if (!d) return
  const key = `${await read($, date)}:${m}:${d.id}`
  const said = (await update($, counts, c => ({ ...c, [key]: Math.min(d.repeat, (c[key] ?? 0) + 1) })))[key] ?? 0
  if (said < d.repeat) return
  if (i < list.length - 1) {
    await update($, index, () => i + 1)
  } else {
    await finish($)
  }
}

export const register: Register = (on, options) => {
  const showArabic = options.showArabic === true
  const watch: Watch = { delayMs: Number(options.reminderDelayMinutes ?? 15) * 60e3, lastTick: 0 }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'adhkar',
      description: 'Read the morning or evening adhkar: /adhkar [morning|evening|close]',
    })
    // Versions before 0.4 pinned a status line, which outlives a reload; this one lives on the hint line.
    $.ui.status(undefined)
    const saved = (await $.store.get(DONE_KEY)) as string[] | undefined
    if (saved) await update($, done, () => saved)
    watch.lastTick = await $.clock.now()
    await tick($, watch)
    $.clock.every(TICK_MS, () => void tick($, watch))

    return next(e)
  })

  on('command.run', { command: 'adhkar' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    if (asked === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Adhkar closed.' }
    }
    const chosen: AdhkarMode =
      asked === 'morning' || asked === 'evening' ? asked : await currentMode($)
    if ((await read($, mode)) !== chosen) {
      await update($, mode, () => chosen)
      await update($, index, () => 0)
    }
    await tick($, watch)
    await $.ui.open({ id: PANE, title: TITLE[chosen], focus: true, closeOnEscape: true })

    return { text: `${TITLE[chosen]} opened. Keys: c count, n next, p previous, f finish, x close.` }
  })

  // Follows prayer-times on the hint line under the prompt: one line, no labels.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const text = await read($, line)
    if (!text) return next(e)
    return next({ ...e, props: { ...e.props, tail: e.props.tail ? `${e.props.tail} · ${text}` : text } })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const m = await read($, mode)
    const list = listFor(m)
    const i = Math.min(await read($, index), list.length - 1)
    const d = list[i]
    if (!d) return <Text dimColor>Nothing to read.</Text>
    const said = (await read($, counts))[`${await read($, date)}:${m}:${d.id}`] ?? 0
    const words = wordingFor(d, m)
    const isDone = (await read($, done)).includes(`${await read($, date)}:${m}`)

    return (
      <Box flexDirection="column" width={e.props.bodyColumns} gap={1}>
        <Text dimColor>
          {TITLE[m]} · {i + 1} of {list.length}
          {isDone ? ' · finished today' : ''}
        </Text>
        {showArabic && <Text>{d.arabic}</Text>}
        <Text italic>{words.transliteration}</Text>
        <Text>{words.english}</Text>
        {d.note && <Text dimColor>{d.note}</Text>}
        <Box flexDirection="row" gap={2}>
          <Button key="count" variant="primary" hotkey="c" label={`${said} / ${d.repeat}`} onPress={() => count($)} />
          <Button key="prev" hotkey="p" label="Previous" onPress={() => step($, -1)} />
          <Button key="next" hotkey="n" label="Next" onPress={() => step($, 1)} />
          <Button key="finish" hotkey="f" label="Finish" onPress={() => finish($)} />
          <Button key="close" hotkey="x" role="dismiss" label="Close" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
