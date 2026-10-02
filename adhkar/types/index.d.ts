export type AdhkarMode = 'morning' | 'evening'

declare module 'claude-code' {
  interface PluginState {
    adhkar: {
      /** The local date, YYYY-MM-DD. */
      date: string
      mode: AdhkarMode
      index: number
      /** How many times each dhikr was said, by `${date}:${mode}:${id}`. */
      counts: Record<string, number>
      /** The sessions finished, as `${date}:${mode}`. */
      done: string[]
    }
  }
}
