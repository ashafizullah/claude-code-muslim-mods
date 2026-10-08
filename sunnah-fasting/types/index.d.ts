/** What sunnah-fasting shows on the hint line under the prompt on a fasting day. */
export type SunnahFastingLine = string | null

declare module 'claude-code' {
  interface PluginState {
    'sunnah-fasting': {
      line: SunnahFastingLine
    }
  }
}
