import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PrayerTimesDay } from '../types'

import { IP_URLS, geocodeUrl, parseCoordinates, parseGeocode, parseIpLookup } from './location'
import type { Place } from './location'
import { METHOD_NAMES, PRAYERS, clock, countdown, isTimeZone, localDate, methodFor, prayerTimes, span, upcoming } from './praytimes'
import type { Asr, Method, Settings, Slot } from './praytimes'

// Every second, so the countdown in the status line counts down.
const TICK_MS = 1e3
// A crossing older than this (the laptop slept through it) is not announced.
const STALE_MS = 5 * 60e3
// An IP lookup is redone daily, so the times follow a traveller.
const IP_CACHE_MS = 24 * 3600e3
const PLACE_KEY = 'place'

const today = atom({ plugin: 'prayer-times', key: 'today' } as const, null)
const line = atom({ plugin: 'prayer-times', key: 'line' } as const, null)

const isPrayer = (slot: Slot) => (PRAYERS as readonly string[]).includes(slot.name)

type Cached = { query: string; at: number; place: Place }

type Watch = {
  query: string
  method: string
  asr: Asr
  ihtiyatMinutes: number
  reminderMs: number
  place?: Place
  settings?: Settings
  lastTick: number
  published?: string
}

async function fetchJson($: EngineInterface, url: string) {
  try {
    const res = await $.http.fetch(url, { headers: { accept: 'application/json' } })
    return res.ok ? res.text : undefined
  } catch {
    return undefined
  }
}

/** Where the person is: the coordinates or city they set, else a lookup of their IP; cached in the store. */
async function locate($: EngineInterface, query: string): Promise<Place | undefined> {
  const now = await $.clock.now()
  const cached = (await $.store.get(PLACE_KEY)) as Cached | undefined
  const isFresh = cached?.query === query && (query !== '' || now - cached.at < IP_CACHE_MS)
  if (cached && isFresh) return cached.place

  const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  let place: Place | undefined
  const coordinates = parseCoordinates(query)
  if (coordinates) {
    place = { name: `${coordinates.latitude}, ${coordinates.longitude}`, timeZone: systemZone, ...coordinates }
  } else if (query !== '') {
    const text = await fetchJson($, geocodeUrl(query))
    place = text ? parseGeocode(text) : undefined
  } else {
    for (const url of IP_URLS) {
      const text = await fetchJson($, url)
      place = text ? parseIpLookup(text) : undefined
      if (place) break
    }
  }

  if (!place) return cached?.query === query ? cached.place : undefined
  if (!isTimeZone(place.timeZone)) place = { ...place, timeZone: systemZone }
  await $.store.set(PLACE_KEY, { query, at: now, place } satisfies Cached)
  return place
}

/** Puts today's times in this mod's state, where other mods (adhkar) read them. */
async function publish($: EngineInterface, w: Watch, now: number, s: Settings) {
  const slots = prayerTimes(now, s)
  const date = localDate(now, s.timeZone)
  const key = `${date} ${s.latitude} ${s.longitude} ${s.method} ${s.asr} ${s.ihtiyatMinutes}`
  if (w.published === key) return
  w.published = key
  const day: PrayerTimesDay = { date, timeZone: s.timeZone, slots }
  await update($, today, () => day)
}

async function tick($: EngineInterface, w: Watch) {
  const now = await $.clock.now()
  const s = w.settings
  if (!s) {
    await update($, line, () => '🕌 Location unknown: /prayer-times <your city>')
    w.lastTick = now
    return
  }
  await publish($, w, now, s)
  const prayers = upcoming(now, s).filter(isPrayer)
  const crossed = (at: number) => w.lastTick < at && at <= now && now - at < STALE_MS

  for (const p of prayers) {
    if (crossed(p.at)) {
      $.ui.toast(`🕌 It's time for ${p.name} (${clock(p.at, s.timeZone)}). Time to pray.`, {
        timeoutMs: 20e3,
      })
    } else if (w.reminderMs > 0 && crossed(p.at - w.reminderMs)) {
      $.ui.toast(`🕌 ${p.name} in ${span(p.at - now)}, at ${clock(p.at, s.timeZone)}`, {
        timeoutMs: 12e3,
      })
    }
  }

  const next = prayers.find(p => p.at > now)
  if (next) {
    const text = `🕌 ${next.name} ${clock(next.at, s.timeZone)} · in ${countdown(next.at - now)}`
    await update($, line, () => text)
  }
  w.lastTick = now
}

async function settle($: EngineInterface, w: Watch) {
  w.place = await locate($, w.query)
  if (!w.place) return
  const method = (METHOD_NAMES as readonly string[]).includes(w.method)
    ? (w.method as Method)
    : methodFor(w.place.countryCode)
  w.settings = {
    latitude: w.place.latitude,
    longitude: w.place.longitude,
    timeZone: w.place.timeZone,
    method,
    asr: w.asr,
    ihtiyatMinutes: w.ihtiyatMinutes,
  }
}

export const register: Register = (on, options) => {
  const watch: Watch = {
    query: String(options.city ?? '').trim(),
    method: String(options.method ?? 'Auto'),
    asr: String(options.asr ?? 'Standard') as Asr,
    ihtiyatMinutes: Number(options.ihtiyatMinutes ?? -1),
    reminderMs: Number(options.reminderMinutes ?? 10) * 60e3,
    lastTick: 0,
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'prayer-times',
      description: "Show today's prayer times, or set your city: /prayer-times <city>",
    })
    await settle($, watch)
    watch.lastTick = await $.clock.now()
    await tick($, watch)
    $.clock.every(TICK_MS, () => void tick($, watch))

    return next(e)
  })

  // Leads the tail of the hint line under the prompt, where other mods (adhkar) add theirs after it: one line, no labels.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const text = await read($, line)
    if (!text) return next(e)
    return next({ ...e, props: { ...e.props, tail: e.props.tail ? `${text} · ${e.props.tail}` : text } })
  })

  on('command.run', { command: 'prayer-times' }, async ($, e) => {
    const city = e.args.trim()
    if (city !== '') {
      const set = await $.config.set({ key: 'prayer-times.city', value: city })
      return { text: set.deny ? `Could not save the city: ${set.deny}` : `Prayer times will now follow ${city}.` }
    }

    const s = watch.settings
    if (!s || !watch.place) {
      return { text: 'Location unknown. Set it with /prayer-times <your city>, or "lat, lng".' }
    }
    const now = await $.clock.now()
    const today = prayerTimes(now, s)
    const next = upcoming(now, s).filter(isPrayer).find(p => p.at > now)
    const lines = today.map(slot => {
      const mark = next && slot.at === next.at ? '  ← next' : ''
      return `  ${slot.name.padEnd(8)} ${clock(slot.at, s.timeZone)}${mark}`
    })
    const where = `${watch.place.name} · ${s.timeZone} · ${s.method}${watch.query === '' ? ' · detected from your IP' : ''}`

    return { text: [`Prayer times today (${where})`, ...lines].join('\n') }
  })
}
