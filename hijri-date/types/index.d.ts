/** Today's Hijri date as hijri-date publishes it, for other mods to read. */
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

declare module 'claude-code' {
  interface PluginState {
    'hijri-date': {
      today: HijriDay | null
      /** What the hint line under the prompt shows. */
      line: string | null
    }
  }
}
