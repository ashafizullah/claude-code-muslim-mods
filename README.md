# Muslim mods for Claude Code

Two small mods that bring prayer times and a daily verse of the Qur'an into [Claude Code](https://claude.com/claude-code), so a long coding session doesn't run straight past Asr.

| Mod | What it does |
| --- | --- |
| [`prayer-times`](./prayer-times) | Shows the next prayer in the status line, reminds you before it and tells you when its time begins. |
| [`daily-ayah`](./daily-ayah) | Shows one verse of the Qur'an a day in a band above the prompt. |

Both are Claude Code plugins built on function hooks. They need Claude Code **2.1.288 or newer**; the plugin API is in early access and may change between releases.

## prayer-times

```
🕌 Asr 14:49 · in 1h 12m                                   ← status line
🕌 Asr in 10m, at 14:49                                     ← toast, 10 minutes before
🕌 It's time for Asr (14:49). Time to pray.                 ← toast, when the time begins
```

`/prayer-times` prints today's schedule:

```
Prayer times today (Semarang, Indonesia · Asia/Jakarta · Kemenag · detected from your IP)
  Fajr     04:07
  Sunrise  05:20
  Dhuhr    11:29  ← next
  Asr      14:36
  Maghrib  17:35
  Isha     18:44
```

### Where you are

The mod works anywhere in the world. It finds your location in this order:

1. **The `city` option, if you set it.** Either a city name (`Istanbul`, `Kuala Lumpur`), which is looked up with the [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api), or coordinates (`41.01, 28.98`), which need no network at all.
2. **Your IP address, if `city` is blank** (the default). It asks [ipwho.is](https://ipwho.is), and [ipapi.co](https://ipapi.co) if that fails. The lookup is repeated once a day so the times follow you when you travel.

The place found is cached, so later sessions start without a lookup and keep working offline. If the mod can't find you, the status line says so and asks for a city.

To set your city from inside Claude Code:

```
/prayer-times Kuala Lumpur
```

**Privacy:** an IP lookup sends your IP address to ipwho.is (or ipapi.co). If you'd rather not, set `city` to your coordinates and the mod makes no network requests.

### How the times are calculated

Times are computed locally with the [PrayTimes.org](http://praytimes.org/calculation) astronomical method. They were checked against the [Aladhan API](https://aladhan.com/prayer-times-api) for Semarang, London (at midsummer), Istanbul, New York and Makkah, and agree to within a minute.

- **Time zone** comes from the place (`Europe/London`, `America/New_York`, …), so daylight saving time is handled.
- **Calculation method** is picked from your country when `method` is `Auto`:

  | Method | Fajr / Isha | Used for |
  | --- | --- | --- |
  | Kemenag | 20° / 18° | Indonesia |
  | JAKIM | 20° / 18° | Malaysia, Singapore, Brunei |
  | Makkah (Umm al-Qura) | 18.5° / 90 min after Maghrib | Saudi Arabia and the Gulf |
  | Egypt | 19.5° / 17.5° | Egypt, the Levant, North Africa |
  | Karachi | 18° / 18° | Pakistan, India, Bangladesh, Afghanistan |
  | ISNA | 15° / 15° | United States, Canada |
  | Diyanet | 18° / 17°, with Diyanet's own minute corrections | Turkey |
  | MWL | 18° / 17° | everywhere else |

- **High latitudes:** where the sun never sinks far enough for Fajr or Isha (UK and Scandinavian summers), the angle-based rule is used.
- **Ihtiyat** (a safety margin) is 2 minutes for Kemenag and JAKIM, as their published timetables use, and 0 elsewhere.

### Options

| Option | Default | |
| --- | --- | --- |
| `city` | blank | A city, or `lat, lng`. Blank detects it from your IP. |
| `method` | `Auto` | `Auto`, `Kemenag`, `JAKIM`, `MWL`, `ISNA`, `Egypt`, `Makkah`, `Karachi`, `Diyanet` |
| `asr` | `Standard` | `Standard` (Shafi'i, Maliki, Hanbali) or `Hanafi` |
| `ihtiyatMinutes` | `-1` | Minutes added to each time; `-1` uses the method's own. |
| `reminderMinutes` | `10` | How early to remind you; `0` turns the early reminder off. |

## daily-ayah

```
📖 "So remember Me; I will remember you. And be grateful to Me and do not deny Me."
— Al-Baqara (The Cow) 2:152  ↻ ×
```

- A new verse each day at your local midnight, from 59 verses that read well on their own (2:152, 13:28, 39:53, 65:3, 94:5, …).
- **↻** shows another verse; **×** hides the band for the rest of the session.
- `/ayah` prints today's verse with its Arabic text and brings the band back.

The Arabic (Uthmani script) and the **Sahih International** translation were taken from the [AlQuran Cloud API](https://alquran.cloud/api) and are bundled with the mod, so it needs no network.

| Option | Default | |
| --- | --- | --- |
| `showArabic` | `false` | Also show the Arabic in the band. Off by default because many terminals draw right-to-left text poorly; `/ayah` always includes it. |

## Install

Clone the repository:

```sh
git clone https://github.com/ashafizullah/claude-code-muslim-mods.git ~/claude-code-muslim-mods
```

**For one session**, pass each mod with `--plugin-dir`:

```sh
claude --plugin-dir ~/claude-code-muslim-mods/prayer-times --plugin-dir ~/claude-code-muslim-mods/daily-ayah
```

**For every session**, add them to the `env` block of `~/.claude/settings.json`. Separate the paths with `:` on macOS and Linux, or `;` on Windows:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/claude-code-muslim-mods/prayer-times:~/claude-code-muslim-mods/daily-ayah"
  }
}
```

Change the options with `/config`, where each mod's fields are listed. They are saved under `pluginConfigs` in your settings.

## Development

Each mod is a folder with a `.claude-plugin/plugin.json` manifest and a hooks module under `hooks/`. From a mod's folder:

```sh
claude plugin validate .   # check the manifest and hooks the way Claude Code loads them
claude plugin test .       # run tests/*.test.ts(x)
tsc -p .                   # type-check (after Claude Code has loaded the mod once)
```

The tests mock the clock, the network and the store, so they run offline and don't depend on the date.

Pull requests are welcome, especially for more countries' methods or corrections to the times where you live.

## Credits

- Prayer time algorithm: [PrayTimes.org](http://praytimes.org) by Hamid Zarrabi-Zadeh
- Reference times: [Aladhan](https://aladhan.com)
- Qur'an text and translation: [AlQuran Cloud](https://alquran.cloud), Sahih International
- Geocoding: [Open-Meteo](https://open-meteo.com); IP location: [ipwho.is](https://ipwho.is), [ipapi.co](https://ipapi.co)

## License

The code is under the [MIT License](./LICENSE). The Qur'an translation is Sahih International's and is included for personal, non-commercial use.
