import type { On, PluginOptions } from 'claude-code'

/**
 * A feature of the plugin: it adds its hooks when it is on. Each hooks session.start with
 * `{ isInteractive: true }`, since a module may hook it only once without a matcher.
 */
export type Feature = (on: On, options: PluginOptions) => void
