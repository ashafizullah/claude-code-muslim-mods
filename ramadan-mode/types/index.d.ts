/** What ramadan-mode shows on the hint line under the prompt: the countdown to imsak or iftar. */
export type RamadanLine = string | null

declare module 'claude-code' {
  interface PluginState {
    'ramadan-mode': {
      line: RamadanLine
    }
  }
}
