import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions } from 'claude-code'

import type { PrayerTimesDay, SalahBreak } from '../../types'
import { clock, countdown } from '../prayer-times/praytimes'
import type { Feature } from '../feature'

// Every second, so the countdown under the prompt counts down.
const TICK_MS = 1e3
// A crossing older than this (the laptop slept through it) starts no break.
const STALE_MS = 5 * 60e3
const LATER_MS = 5 * 60e3
const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const
export const DEFAULT_BREAK_MINUTES = 15
export const MAX_BREAK_MINUTES = 120

const current = atom({ plugin: 'muslim-mods', key: 'salahBreak' } as const, null)
const held = atom({ plugin: 'muslim-mods', key: 'salahHeld' } as const, null)
const line = atom({ plugin: 'muslim-mods', key: 'salahLine' } as const, null)
const prayerDay = { plugin: 'muslim-mods', key: 'prayerToday' } as const

type Watch = { breakMs: number; isHolding: boolean; lastTick: number }

/** The break's length in minutes and whether it holds prompts, from the options. */
export const breakSettings = (options: PluginOptions) => ({
  minutes: Math.min(
    MAX_BREAK_MINUTES,
    Math.max(1, Math.round(Number(options.salahBreakMinutes ?? DEFAULT_BREAK_MINUTES)) || DEFAULT_BREAK_MINUTES),
  ),
  isHolding: options.salahBreakHold !== false,
})

const isPrayer = (name: string) => (PRAYERS as readonly string[]).includes(name)
const at = (ms: number, timeZone?: string) => (timeZone ? clock(ms, timeZone) : new Date(ms).toTimeString().slice(0, 5))
// M:SS under an hour, H:MM:SS above.
const left = (ms: number) => countdown(ms).replace(/^0:0?/, '')

async function today($: EngineInterface) {
  const { value } = (await $.state.get(prayerDay)) as { value: PrayerTimesDay | null }
  return value
}

async function begin($: EngineInterface, w: Watch, prayer: string, from: number, timeZone?: string) {
  const b: SalahBreak = { prayer, from, until: from + w.breakMs, ...(timeZone ? { timeZone } : {}) }
  await update($, current, () => b)
  return b
}

/** Offers a prompt held during the break back in the prompt box; kept until the box can show it. */
async function offer($: EngineInterface) {
  const text = await read($, held)
  if (!text) return
  try {
    // Not shown while a turn runs or the box holds text: the next tick tries again.
    if ((await $.prompt.suggest({ text })).isShown) await update($, held, () => null)
  } catch {
    await update($, held, () => null)
  }
}

/** Ends the break and offers back what was held during it. */
async function end($: EngineInterface) {
  await update($, current, () => null)
  await offer($)
}

async function tick($: EngineInterface, w: Watch) {
  const now = await $.clock.now()
  const day = await today($)
  const crossed = (t: number) => w.lastTick < t && t <= now && now - t < STALE_MS

  for (const slot of day?.slots ?? []) {
    if (!isPrayer(slot.name) || !crossed(slot.at)) continue
    const b = await begin($, w, slot.name, slot.at, day?.timeZone)
    const hold = w.isHolding ? ' Prompts wait until then;' : ''
    $.ui.toast(`🧎 ${slot.name}: a salah break until ${at(b.until, b.timeZone)}.${hold} /salah done when you're back.`, {
      timeoutMs: 30e3,
    })
  }

  let b = await read($, current)
  if (b && now >= b.until) {
    await end($)
    // A break long over (the feature was off, or the laptop slept) ends without a word.
    if (now - b.until < STALE_MS) {
      $.ui.toast('🤲 The salah break is over. Taqabbal Allahu minna wa minkum.', { timeoutMs: 10e3 })
    }
    b = null
  } else if (!b) await offer($)
  const text =
    !b ? null
    : now < b.from ? `🧎 Salah break for ${b.prayer} in ${left(b.from - now)}`
    : `🧎 Salah break · ${b.prayer} · ${left(b.until - now)} left · /salah done`
  if ((await read($, line)) !== text) await update($, line, () => text)
  w.lastTick = now
}

export const salahBreak: Feature = (on, options) => {
  const s = breakSettings(options)
  const watch: Watch = { breakMs: s.minutes * 60e3, isHolding: s.isHolding, lastTick: 0 }

  // During the break the person's own prompts wait; slash commands, and everything else, go through.
  on('prompt.submit', async ($, e, next) => {
    if (!watch.isHolding || e.origin.kind !== 'composer' || e.text.trimStart().startsWith('/')) return next(e)
    try {
      const b = await read($, current)
      const now = await $.clock.now()
      if (!b || now < b.from || now >= b.until) return next(e)
      // Every prompt typed during the break is kept, not just the last.
      const prev = await read($, held)
      await update($, held, () => (prev ? `${prev}\n\n${e.text}` : e.text))
      // Only the words are kept: what was pasted or attached has to be added again.
      const lost = e.attachments?.length ? ' (attachments are not kept: add them again then)' : ''
      return {
        drop: `🧎 Salah break for ${b.prayer} until ${at(b.until, b.timeZone)}. Your prompt is kept and offered back after the break${lost}; /salah done if you've prayed.`,
      }
    } catch {
      // A break that can't be read never swallows a prompt.
      return next(e)
    }
  })

  on('command.run', { command: 'salah' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const now = await $.clock.now()
    const b = await read($, current)

    if (arg === 'done' || arg === 'skip') {
      if (!b) return { text: 'No salah break right now.' }
      await end($)
      await tick($, watch)
      return { text: arg === 'done' ? 'Welcome back. Taqabbal Allahu minna wa minkum.' : 'Salah break skipped.' }
    }
    if (arg === 'later') {
      if (!b) return { text: 'No salah break right now.' }
      const from = now + LATER_MS
      await update($, current, () => ({ ...b, from, until: from + watch.breakMs }))
      await tick($, watch)
      return { text: `The salah break for ${b.prayer} starts in 5 minutes, at ${at(from, b.timeZone)}.` }
    }
    if (arg === 'now') {
      const day = await today($)
      const last = [...(day?.slots ?? [])].reverse().find(slot => isPrayer(slot.name) && slot.at <= now)
      const nb = await begin($, watch, last?.name ?? 'Salah', now, day?.timeZone)
      await tick($, watch)
      return { text: `Salah break until ${at(nb.until, nb.timeZone)}. /salah done when you're back.` }
    }
    if (arg !== '') return { text: 'Usage: /salah, /salah now, /salah later, or /salah done' }

    if (!b) {
      const hold = watch.isHolding ? ' Your prompts wait until it ends.' : ''
      return {
        text: `No salah break right now. One begins at each prayer's time and lasts ${s.minutes} minutes.${hold} /salah now starts one; /muslim changes the length.`,
      }
    }
    if (now < b.from) return { text: `The salah break for ${b.prayer} starts at ${at(b.from, b.timeZone)}.` }
    return {
      text: `Salah break for ${b.prayer} until ${at(b.until, b.timeZone)}. /salah done when you're back, /salah later for 5 more minutes.`,
    }
  })

  on('session.start', { isInteractive: true }, async ($, e, next) => {
    await $.command.register({
      name: 'salah',
      description: "A break from work at each prayer's time; /salah now, /salah later, /salah done",
    })
    watch.lastTick = await $.clock.now()
    await tick($, watch)
    $.clock.every(TICK_MS, () => void tick($, watch))
    return next(e)
  })
}
