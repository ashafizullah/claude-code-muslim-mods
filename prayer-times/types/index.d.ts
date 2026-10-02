/** Today's prayer times as prayer-times publishes them, for other mods to read. */
export type PrayerTimesDay = {
  /** The local date, YYYY-MM-DD. */
  date: string
  timeZone: string
  /** Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha, as epoch milliseconds. */
  slots: { name: 'Fajr' | 'Sunrise' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha'; at: number }[]
}

declare module 'claude-code' {
  interface PluginState {
    'prayer-times': {
      today: PrayerTimesDay | null
      /** What the hint line under the prompt shows: the next prayer and its countdown. */
      line: string | null
    }
  }
}
