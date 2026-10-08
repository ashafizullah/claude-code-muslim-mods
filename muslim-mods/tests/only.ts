const TOGGLES = ['prayerTimes', 'hijriDate', 'adhkar', 'sunnahFasting', 'ramadan', 'jumuah', 'dailyAyah', 'tasbih']

/** The plugin's options with only the features named switched on, so a test sees one feature alone. */
export const only = (...ids: string[]) => Object.fromEntries(TOGGLES.map(id => [id, ids.includes(id)]))
