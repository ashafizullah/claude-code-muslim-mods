import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { adhkar } from './adhkar'
import { dailyAyah } from './daily-ayah'
import { hijriDate } from './hijri-date'
import { jumuah } from './jumuah'
import { prayer } from './prayer-times'
import { ramadan } from './ramadan'
import { breakSettings, salahBreak } from './salah-break'
import { sunnahFasting } from './sunnah-fasting'
import { tasbih } from './tasbih'

const PANE = 'muslim'
const PANE_COLUMNS = 84

// Each feature's part of the hint line under the prompt, as it publishes it.
const prayerLine = atom({ plugin: 'muslim-mods', key: 'prayerLine' } as const, null)
const hijriLine = atom({ plugin: 'muslim-mods', key: 'hijriLine' } as const, null)
const adhkarLine = atom({ plugin: 'muslim-mods', key: 'adhkarLine' } as const, null)
const fastingLine = atom({ plugin: 'muslim-mods', key: 'fastingLine' } as const, null)
const ramadanLine = atom({ plugin: 'muslim-mods', key: 'ramadanLine' } as const, null)
const jumuahLine = atom({ plugin: 'muslim-mods', key: 'jumuahLine' } as const, null)
const tasbihLine = atom({ plugin: 'muslim-mods', key: 'tasbihLine' } as const, null)
const salahLine = atom({ plugin: 'muslim-mods', key: 'salahLine' } as const, null)
// What prayer times and the Hijri date publish for the others; state outlives the reload a switch makes.
const prayerToday = atom({ plugin: 'muslim-mods', key: 'prayerToday' } as const, null)
const hijriToday = atom({ plugin: 'muslim-mods', key: 'hijriToday' } as const, null)
const hijriAhead = atom({ plugin: 'muslim-mods', key: 'hijriAhead' } as const, [])

export type Entry = {
  /** Its on/off option in the manifest, `muslim-mods.<id>`. */
  id: string
  /** What /muslim on|off takes besides the id. */
  alias: string
  title: string
  about: string
  /** The features it reads from; without them it works only in part. */
  uses?: string[]
}

/** In the order their parts appear on the hint line. */
export const FEATURES: Entry[] = [
  { id: 'prayerTimes', alias: 'prayer', title: 'Prayer times', about: 'Countdown to the next prayer; /prayer-times' },
  {
    id: 'hijriDate',
    alias: 'hijri',
    title: 'Hijri date',
    about: 'The Hijri date and the days that matter; /hijri',
    uses: ['prayerTimes'],
  },
  { id: 'adhkar', alias: 'adhkar', title: 'Adhkar', about: 'Morning and evening adhkar; /adhkar', uses: ['prayerTimes'] },
  {
    id: 'sunnahFasting',
    alias: 'fasting',
    title: 'Sunnah fasting',
    about: 'Monday, Thursday, the white days; /fasting',
    uses: ['prayerTimes', 'hijriDate'],
  },
  {
    id: 'ramadan',
    alias: 'ramadan',
    title: 'Ramadan',
    about: 'Imsak and iftar countdown in Ramadan; /ramadan',
    uses: ['prayerTimes', 'hijriDate'],
  },
  { id: 'jumuah', alias: 'jumuah', title: "Jumu'ah", about: 'Al-Kahf, salawat and the Friday prayer; /jumuah', uses: ['prayerTimes'] },
  { id: 'dailyAyah', alias: 'ayah', title: 'Daily ayah', about: "A verse of the Qur'an above the prompt; /ayah" },
  { id: 'tasbih', alias: 'tasbih', title: 'Tasbih', about: 'Dhikr when the usage limit runs out; /tasbih' },
  {
    id: 'salahBreak',
    alias: 'salah',
    title: 'Salah break',
    about: "A break from work at each prayer's time; /salah",
    uses: ['prayerTimes'],
  },
]

// The salah break's length, as the dashboard's Shorter and Longer step it.
const BREAK_STEP = 5
const BREAK_MAX = 60

export const isOn = (options: PluginOptions, id: string) => options[id] !== false

/** The feature `name` names: its id, its alias or its title, in any case. */
export function find(name: string) {
  const n = name.toLowerCase().replace(/[^a-z]/g, '')
  return FEATURES.find(f => f.id.toLowerCase() === n || f.alias === n || f.title.toLowerCase().replace(/[^a-z]/g, '') === n)
}

/** Each feature's part of the hint line, by id, while it is on. */
async function lines($: EngineInterface, options: PluginOptions): Promise<Record<string, string | null>> {
  const on = (id: string, text: string | null) => (isOn(options, id) ? text : null)
  return {
    prayerTimes: on('prayerTimes', await read($, prayerLine)),
    hijriDate: on('hijriDate', await read($, hijriLine)),
    adhkar: on('adhkar', await read($, adhkarLine)),
    sunnahFasting: on('sunnahFasting', await read($, fastingLine)),
    ramadan: on('ramadan', await read($, ramadanLine)),
    jumuah: on('jumuah', await read($, jumuahLine)),
    tasbih: on('tasbih', await read($, tasbihLine)),
    salahBreak: on('salahBreak', await read($, salahLine)),
  }
}

/** Switches a feature on or off; the change reloads the plugin with only the features that are on. */
async function toggle($: EngineInterface, f: Entry, value: boolean) {
  const set = await $.config.set({ key: `muslim-mods.${f.id}`, value })
  return set.deny ? `Could not switch ${f.title} ${value ? 'on' : 'off'}: ${set.deny}` : `${f.title} is ${value ? 'on' : 'off'}.`
}

/** The same from the dashboard, where only a refusal needs saying. */
async function toggleFromPane($: EngineInterface, f: Entry, value: boolean) {
  const text = await toggle($, f, value)
  if (text.startsWith('Could not')) $.ui.toast(text, { timeoutMs: 10e3 })
}

/** Sets one of the salah break's options; like a switch, it reloads the plugin. */
async function setBreak($: EngineInterface, key: 'salahBreakMinutes' | 'salahBreakHold', value: number | boolean) {
  const set = await $.config.set({ key: `muslim-mods.${key}`, value })
  if (set.deny) return `Could not change the salah break: ${set.deny}`
  return key === 'salahBreakMinutes'
    ? `The salah break lasts ${value} minutes.`
    : `During the salah break, prompts ${value ? 'wait until it ends' : 'go through: it is only a reminder'}.`
}

async function setBreakFromPane($: EngineInterface, key: 'salahBreakMinutes' | 'salahBreakHold', value: number | boolean) {
  const text = await setBreak($, key, value)
  if (text.startsWith('Could not')) $.ui.toast(text, { timeoutMs: 10e3 })
}

export const register: Register = (on, options) => {
  // First, so what a switched-off feature left is cleared before the others start reading it.
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'muslim',
      description: 'The Muslim mods dashboard: switch each one on or off. /muslim on|off <feature>',
    })
    // A feature switched off leaves what it published; the others shouldn't keep reading it.
    // Never at the cost of the features' own start, beneath this hook.
    try {
      if (!isOn(options, 'prayerTimes') && (await read($, prayerToday))) await update($, prayerToday, () => null)
      if (!isOn(options, 'hijriDate') && (await read($, hijriAhead)).length) {
        await update($, hijriToday, () => null)
        await update($, hijriAhead, () => [])
      }
    } catch {
      // Left as it was: the features fall back as they would without it.
    }
    return next(e)
  })

  // Only the features that are on are hooked; switching one reloads the plugin.
  if (isOn(options, 'prayerTimes')) prayer(on, options)
  if (isOn(options, 'hijriDate')) hijriDate(on, options)
  if (isOn(options, 'adhkar')) adhkar(on, options)
  if (isOn(options, 'sunnahFasting')) sunnahFasting(on, options)
  if (isOn(options, 'ramadan')) ramadan(on, options)
  if (isOn(options, 'jumuah')) jumuah(on, options)
  if (isOn(options, 'dailyAyah')) dailyAyah(on, options)
  if (isOn(options, 'tasbih')) tasbih(on, options)
  if (isOn(options, 'salahBreak')) salahBreak(on, options)

  // One line under the prompt, each feature's part in a fixed order, no labels.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const live = await lines($, options)
    // The salah break, while it lasts, comes first: it is the one thing to act on now.
    const order = [live.salahBreak, ...FEATURES.filter(f => f.id !== 'salahBreak').map(f => live[f.id])]
    const parts = order.filter(Boolean)
    if (!parts.length) return next(e)
    return next({ ...e, props: { ...e.props, tail: [e.props.tail, ...parts].filter(Boolean).join(' · ') } })
  })

  on('command.run', { command: 'muslim' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'on' || verb === 'off') {
      const f = find(rest.join(''))
      if (!f) return { text: `Which one? ${FEATURES.map(x => x.alias).join(', ')}` }
      return { text: await toggle($, f, verb === 'on') }
    }
    if (verb === 'break') {
      const minutes = Math.round(Number(rest[0]))
      if (!(minutes >= 1 && minutes <= 120)) return { text: 'Usage: /muslim break <minutes>, from 1 to 120' }
      return { text: await setBreak($, 'salahBreakMinutes', minutes) }
    }
    if (verb === 'hold') {
      if (rest[0] !== 'on' && rest[0] !== 'off') return { text: 'Usage: /muslim hold on|off' }
      return { text: await setBreak($, 'salahBreakHold', rest[0] === 'on') }
    }
    if (verb === 'list') {
      return { text: FEATURES.map(f => `${isOn(options, f.id) ? '●' : '○'} ${f.title.padEnd(15)} ${f.alias}`).join('\n') }
    }
    if (verb !== '') {
      return { text: 'Usage: /muslim, /muslim list, /muslim on|off <feature>, /muslim break <minutes>, /muslim hold on|off' }
    }
    await $.ui.open({
      id: PANE,
      title: 'Muslim mods',
      focus: true,
      closeOnEscape: true,
      // Two lines a feature, a note cut to one, the salah break's settings, and the footer.
      rows: FEATURES.length * 2 + 4,
      columns: PANE_COLUMNS,
    })
    return {
      text: `Muslim mods opened. Keys 1–${FEATURES.length} switch each one on or off; s and l shorten or lengthen the salah break, h sets whether it holds prompts; x closes.`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const live = await lines($, options)
    const title = (id: string) => FEATURES.find(f => f.id === id)?.title ?? id
    const brk = breakSettings(options)
    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        {FEATURES.map((f, i) => {
          const isOnNow = isOn(options, f.id)
          const missing = isOnNow ? (f.uses ?? []).filter(id => !isOn(options, id)).map(title) : []
          const note = missing.length ? `works in part without ${missing.join(' and ')}` : (live[f.id] ?? f.about)
          return (
            <Box key={`row-${f.id}`} flexDirection="row" gap={2}>
              <Button
                key={`toggle-${f.id}`}
                hotkey={String(i + 1)}
                variant={isOnNow ? 'primary' : undefined}
                label={isOnNow ? '● On ' : '○ Off'}
                onPress={() => toggleFromPane($, f, !isOnNow)}
              />
              <Box flexDirection="column">
                <Text bold={isOnNow} dimColor={!isOnNow}>
                  {i + 1} {f.title}
                </Text>
                <Text dimColor wrap="truncate-end">
                  {note}
                </Text>
              </Box>
            </Box>
          )
        })}
        {isOn(options, 'salahBreak') ? (
          <Box key="salah-settings" flexDirection="row" gap={1}>
            <Text>Salah break: {brk.minutes} min</Text>
            <Button
              key="break-less"
              hotkey="s"
              label="− Shorter"
              onPress={() =>
                setBreakFromPane($, 'salahBreakMinutes', Math.min(brk.minutes, Math.max(BREAK_STEP, brk.minutes - BREAK_STEP)))
              }
            />
            <Button
              key="break-more"
              hotkey="l"
              label="+ Longer"
              onPress={() =>
                setBreakFromPane($, 'salahBreakMinutes', Math.max(brk.minutes, Math.min(BREAK_MAX, brk.minutes + BREAK_STEP)))
              }
            />
            <Button
              key="break-hold"
              hotkey="h"
              variant={brk.isHolding ? 'primary' : undefined}
              label={brk.isHolding ? '● Hold prompts' : '○ Hold prompts'}
              onPress={() => setBreakFromPane($, 'salahBreakHold', !brk.isHolding)}
            />
          </Box>
        ) : (
          <Text key="salah-settings" dimColor>
            Salah break is off: switch it on for its settings
          </Text>
        )}
        <Box flexDirection="row" gap={2}>
          <Text dimColor>Settings: /config, under muslim-mods</Text>
          <Button key="close" hotkey="x" role="dismiss" label="Close" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
