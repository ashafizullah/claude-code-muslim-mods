export type DayNumber = number

declare module 'claude-code' {
  interface PluginState {
    'daily-ayah': { day: DayNumber; skip: number; isHidden: boolean }
  }
}
