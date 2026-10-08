import { atom, read, update } from 'claude-code'
import type { EngineInterface, SessionRateLimit } from 'claude-code'

import type { ReachedLimit } from '../../types'
import type { Feature } from '../feature'

const PANE = 'tasbih'
const PANE_COLUMNS = 80
const TICK_MS = 60e3
const INVITED_KEY = 'tasbih.invited'

const reached = atom({ plugin: 'muslim-mods', key: 'tasbihReached' } as const, [])
const index = atom({ plugin: 'muslim-mods', key: 'tasbihIndex' } as const, 0)
const counts = atom({ plugin: 'muslim-mods', key: 'tasbihCounts' } as const, {})
const line = atom({ plugin: 'muslim-mods', key: 'tasbihLine' } as const, null)
// Set by /tasbih demo, whose made-up limit /tasbih close takes away again; in state, so a reload keeps it.
const isDemo = atom({ plugin: 'muslim-mods', key: 'tasbihDemo' } as const, false)

export type Phrase = { id: string; arabic: string; transliteration: string; english: string; repeat: number }

/** The tasbih after prayer, completed to a hundred with the tahlil (Sahih Muslim 597). */
export const PHRASES: Phrase[] = [
  { id: 'subhanallah', arabic: 'سُبْحَانَ اللّٰهِ', transliteration: 'SubḥānAllāh', english: 'Glory be to Allah.', repeat: 33 },
  { id: 'alhamdulillah', arabic: 'الْحَمْدُ لِلّٰهِ', transliteration: 'Alḥamdulillāh', english: 'All praise is for Allah.', repeat: 33 },
  { id: 'allahuakbar', arabic: 'اللّٰهُ أَكْبَرُ', transliteration: 'Allāhu akbar', english: 'Allah is the Greatest.', repeat: 33 },
  {
    id: 'tahlil',
    arabic: 'لَا إِلٰهَ إِلَّا اللّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    transliteration: "Lā ilāha illallāhu waḥdahu lā sharīka lah, lahul-mulku wa lahul-ḥamdu wa huwa ʿalā kulli shay'in qadīr",
    english: 'None has the right to be worshipped but Allah alone, without partner. His is the dominion and His is the praise, and He is able to do all things.',
    repeat: 1,
  },
]

const NAME: Record<ReachedLimit['kind'], string> = { five_hour: '5-hour limit', seven_day: 'weekly limit' }

/** The 5-hour and weekly windows that are used up; a gateway's spend limit is left out. */
export function reachedOf(limits: SessionRateLimit[]): ReachedLimit[] {
  return limits
    .filter(l => (l.kind === 'five_hour' || l.kind === 'seven_day') && l.percentUsed >= 100)
    .map(l => ({ kind: l.kind as ReachedLimit['kind'], resetsAt: l.resetsAt }))
}

/** The windows still used up at `now`: one past its reset time has come back. */
const stillReached = (list: ReachedLimit[], now: number) =>
  list.filter(l => !l.resetsAt || Date.parse(l.resetsAt) > now)

/** "2h 14m", "45m", "3d 4h". */
export function untilText(resetsAt: string | undefined, now: number) {
  if (!resetsAt) return undefined
  const minutes = Math.max(1, Math.ceil((Date.parse(resetsAt) - now) / 60e3))
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d) return `${d}d ${h}h`
  return h ? `${h}h ${m}m` : `${m}m`
}

/** The window that keeps Claude Code waiting longest: the one that resets last. */
function longest(list: ReachedLimit[]) {
  return [...list].sort((a, b) => Date.parse(b.resetsAt ?? '') - Date.parse(a.resetsAt ?? ''))[0]
}

/** "Your weekly limit is used up, back in 3d 4h." */
export function messageFor(list: ReachedLimit[], now: number) {
  const top = longest(list)
  if (!top) return undefined
  const names = list.length > 1 ? 'Your 5-hour and weekly limits are' : `Your ${NAME[top.kind]} is`
  const until = untilText(top.resetsAt, now)
  return `${names} used up${until ? `, back in ${until}` : ''}.`
}

const keyOf = (l: ReachedLimit) => `${l.kind}:${l.resetsAt ?? ''}`

/** Rows the pane needs for the longest phrase at this width. */
export function rowsFor(columns: number, showArabic: boolean) {
  const width = Math.max(20, columns - 4)
  const lines = (text: string) => Math.max(1, Math.ceil(text.length / width))
  const tallest = Math.max(
    ...PHRASES.map(p => [p.transliteration, p.english, showArabic ? p.arabic : ''].filter(Boolean).reduce((n, t) => n + lines(t) + 1, 0)),
  )
  // The message, the progress line and the buttons, each with the gap below it.
  return tallest + 6
}

async function refresh($: EngineInterface) {
  const now = await $.clock.now()
  const list = stillReached(await read($, reached), now)
  if (list.length !== (await read($, reached)).length) await update($, reached, () => list)
  const top = longest(list)
  const until = untilText(top?.resetsAt, now)
  const text = top ? `📿 ${NAME[top.kind]} reached${until ? ` · back in ${until}` : ''} · /tasbih` : null
  if ((await read($, line)) !== text) await update($, line, () => text)
}

async function open($: EngineInterface, columns: number, showArabic: boolean, focus: boolean) {
  return $.ui.open({
    id: PANE,
    title: 'Tasbih',
    ...(focus ? { focus: true as const } : {}),
    closeOnEscape: true,
    rows: rowsFor(Math.min(PANE_COLUMNS, columns), showArabic),
    columns: PANE_COLUMNS,
  })
}

async function finish($: EngineInterface) {
  await update($, index, () => 0)
  await update($, counts, () => ({}))
  await $.ui.close({ id: PANE })
  $.ui.toast('📿 May Allah accept it from you.', { timeoutMs: 8e3 })
}

/** One more; a phrase said its full number of times moves on to the next, the last one finishes. */
async function count($: EngineInterface) {
  const i = await read($, index)
  const p = PHRASES[i]
  if (!p) return
  const said = (await update($, counts, c => ({ ...c, [p.id]: Math.min(p.repeat, (c[p.id] ?? 0) + 1) })))[p.id] ?? 0
  if (said < p.repeat) return
  if (i < PHRASES.length - 1) await update($, index, () => i + 1)
  else await finish($)
}

/** The toast and the pane that ask for dhikr while `list` is used up. */
async function invite($: EngineInterface, list: ReachedLimit[], columns: number, showArabic: boolean, focus: boolean) {
  $.ui.toast(`📿 ${messageFor(list, await $.clock.now())} A moment for SubhanAllah, Alhamdulillah, Allahu akbar? /tasbih`, { timeoutMs: 20e3 })
  return open($, columns, showArabic, focus)
}

export const tasbih: Feature = (on, options) => {
  const showArabic = options.showArabic === true

  on('session.measure', async ($, e, next) => {
    if (!e.changed.includes('rateLimits')) return next(e)
    const list = reachedOf(e.rateLimits)
    await update($, isDemo, () => false)
    await update($, reached, () => list)
    await refresh($)

    // Invite once per window: a new session in the same used-up window keeps only the hint line.
    const invited = ((await $.store.get(INVITED_KEY)) as string[] | undefined) ?? []
    const fresh = list.filter(l => !invited.includes(keyOf(l)))
    if (fresh.length) {
      await $.store.set(INVITED_KEY, [...invited, ...fresh.map(keyOf)].slice(-20))
      // Unasked, the pane seats on a wide terminal and waits on a narrow one; /tasbih opens it anywhere.
      await invite($, list, PANE_COLUMNS, showArabic, false)
    }

    return next(e)
  })

  on('command.run', { command: 'tasbih' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    if (asked === 'close') {
      await $.ui.close({ id: PANE })
      if (await read($, isDemo)) {
        await update($, isDemo, () => false)
        await update($, reached, () => [])
        await refresh($)
      }
      return { text: 'Tasbih closed.' }
    }
    if (asked === 'demo') {
      // What a used-up 5-hour limit looks like, without waiting for one; nothing is remembered as invited.
      await update($, isDemo, () => true)
      const list: ReachedLimit[] = [{ kind: 'five_hour', resetsAt: new Date((await $.clock.now()) + 102 * 60e3).toISOString() }]
      await update($, reached, () => list)
      await refresh($)
      await invite($, list, e.presentation.columns, showArabic, true)
      return { text: 'Tasbih demo: a 5-hour limit made up as used up. /tasbih close ends it.' }
    }
    await open($, e.presentation.columns, showArabic, true)

    return { text: 'Tasbih opened. Keys: c count, r restart, x close.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const i = Math.min(await read($, index), PHRASES.length - 1)
    const p = PHRASES[i]!
    const said = (await read($, counts))[p.id] ?? 0
    const total = PHRASES.reduce((n, q, j) => n + (j < i ? q.repeat : 0), said)
    const message = messageFor(await read($, reached), await $.clock.now())

    return (
      <Box flexDirection="column" width={e.props.bodyColumns} gap={1}>
        <Text dimColor>
          {message ? `${message} ` : ''}Remember Allah while you wait.
        </Text>
        <Text dimColor>
          {i + 1} of {PHRASES.length} · {total} / 100
        </Text>
        <Box flexDirection="row" gap={2}>
          <Button key="count" variant="primary" hotkey="c" label={`${said} / ${p.repeat}`} onPress={() => count($)} />
          <Button
            key="restart"
            hotkey="r"
            label="Restart"
            onPress={async () => {
              await update($, index, () => 0)
              await update($, counts, () => ({}))
            }}
          />
          <Button key="close" hotkey="x" role="dismiss" label="Close" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {showArabic && <Text>{p.arabic}</Text>}
        <Text bold>{p.transliteration}</Text>
        <Text>{p.english}</Text>
      </Box>
    )
  })


  on('session.start', { isInteractive: true }, async ($, e, next) => {
    await $.command.register({ name: 'tasbih', description: 'Count SubhanAllah, Alhamdulillah, Allahu akbar: /tasbih [close|demo]' })
    await refresh($)
    $.clock.every(TICK_MS, () => void refresh($))
    return next(e)
  })
}
