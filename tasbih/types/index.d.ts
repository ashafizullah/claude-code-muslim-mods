/** A rate-limit window that ran out. */
export type ReachedLimit = { kind: 'five_hour' | 'seven_day'; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    tasbih: {
      /** The windows used up, as the last measurement reported them. */
      reached: ReachedLimit[]
      /** Which phrase the counter is on. */
      index: number
      /** How many times each phrase was said, by its id. */
      counts: Record<string, number>
      /** What the hint line under the prompt shows while a limit is reached. */
      line: string | null
    }
  }
}
