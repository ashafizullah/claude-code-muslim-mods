/** Today's prayer times, for the other features to read. */
export type PrayerTimesDay = {
  /** The local date, YYYY-MM-DD. */
  date: string
  timeZone: string
  /** Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha, as epoch milliseconds. */
  slots: { name: 'Fajr' | 'Sunrise' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha'; at: number }[]
}

/** Today's Hijri date. */
export type HijriDay = {
  day: number
  /** 1 (Muharram) to 12 (Dhu al-Hijjah). */
  month: number
  year: number
  monthName: string
  /** The Gregorian date (YYYY-MM-DD) whose daytime this Hijri date falls on. */
  gregorian: string
  /** After Maghrib: the Hijri date has turned over, the Gregorian date has not. */
  isEve: boolean
}

/** The Hijri date whose daytime falls on a Gregorian date. */
export type HijriDate = { gregorian: string; day: number; month: number; year: number }

export type AdhkarMode = 'morning' | 'evening'

/** A rate-limit window that ran out. */
export type ReachedLimit = { kind: 'five_hour' | 'seven_day'; resetsAt?: string }

/** A line on the hint line under the prompt, or nothing. */
export type HintLine = string | null

declare module 'claude-code' {
  interface PluginState {
    'muslim-mods': {
      prayerToday: PrayerTimesDay | null
      prayerLine: HintLine

      hijriToday: HijriDay | null
      /** Today (the Gregorian date, by daytime) and the 29 days after it. */
      hijriAhead: HijriDate[]
      hijriLine: HintLine

      /** The local date, YYYY-MM-DD. */
      adhkarDate: string
      adhkarMode: AdhkarMode
      adhkarIndex: number
      /** How many times each dhikr was said, by `${date}:${mode}:${id}`. */
      adhkarCounts: Record<string, number>
      /** The sessions finished, as `${date}:${mode}`. */
      adhkarDone: string[]
      adhkarLine: HintLine

      ayahSeed: number
      ayahSkip: number
      ayahHidden: boolean

      fastingLine: HintLine
      ramadanLine: HintLine
      jumuahLine: HintLine

      /** The windows used up, as the last measurement reported them. */
      tasbihReached: ReachedLimit[]
      tasbihIndex: number
      /** How many times each phrase was said, by its id. */
      tasbihCounts: Record<string, number>
      tasbihLine: HintLine
    }
  }
}
