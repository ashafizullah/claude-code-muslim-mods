# Muslim mods for Claude Code

[![CI](https://github.com/ashafizullah/claude-code-muslim-mods/actions/workflows/ci.yml/badge.svg)](https://github.com/ashafizullah/claude-code-muslim-mods/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/ashafizullah/claude-code-muslim-mods?color=blue)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.288-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Mods](https://img.shields.io/badge/mods-4-2E7D32)](#muslim-mods-for-claude-code)
[![Last commit](https://img.shields.io/github/last-commit/ashafizullah/claude-code-muslim-mods)](https://github.com/ashafizullah/claude-code-muslim-mods/commits/main)
[![Stars](https://img.shields.io/github/stars/ashafizullah/claude-code-muslim-mods?style=social)](https://github.com/ashafizullah/claude-code-muslim-mods/stargazers)

Small mods that bring prayer times, the morning and evening adhkar, a verse of the Qur'an and a tasbih for when your usage limit runs out into [Claude Code](https://claude.com/claude-code), so a long coding session doesn't run straight past Asr.

| Mod | What it does |
| --- | --- |
| [`prayer-times`](./prayer-times) | Counts down to the next prayer under the prompt, reminds you before it and tells you when its time begins. |
| [`adhkar`](./adhkar) | Reminds you of the morning and evening adhkar and opens a pane to read them, with a counter. |
| [`daily-ayah`](./daily-ayah) | Shows a verse of the Qur'an in a band above the prompt, a new one each session. |
| [`tasbih`](./tasbih) | When your 5-hour or weekly limit runs out, invites you to SubhanAllah, Alhamdulillah and Allahu akbar, with a counter. |

**Getting started:** see [Install](#install). Each mod is a Claude Code plugin built on function hooks. They need Claude Code **2.1.288 or newer**; the plugin API is in early access and may change between releases.

## prayer-times

```
? for shortcuts  🕌 Asr 14:49 · in 1:12:05 · 🤲 Morning adhkar · /adhkar   ← hint line under the prompt
🕌 Asr in 10m, at 14:49                                          ← toast, 10 minutes before
🕌 It's time for Asr (14:49). Time to pray.                      ← toast, when the time begins
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

1. **The `city` option, if you set it.** Either a city name (`Istanbul`, `Kuala Lumpur`), which is looked up with the [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api), or coordinates (`41.01, 28.98`), whose time zone is looked up once with the [Open-Meteo forecast API](https://open-meteo.com/en/docs) (offline, your machine's time zone is used until the lookup succeeds). With coordinates, `method: Auto` uses MWL; set `method` to your country's.
2. **Your IP address, if `city` is blank** (the default). It asks [ipwho.is](https://ipwho.is), and [ipapi.co](https://ipapi.co) if that fails. The lookup is repeated once a day so the times follow you when you travel.

The countdown sits at the end of the hint line under the prompt and ticks every second; `adhkar` adds its reminder after it on the same line, with no plugin labels.

The place found is cached, so later sessions start without a lookup and keep working offline. If the mod can't find you, the hint line says so and asks for a city.

To set your city from inside Claude Code:

```
/prayer-times Kuala Lumpur
```

**Privacy:** an IP lookup sends your IP address to ipwho.is (or ipapi.co). If you'd rather not, set `city` to your coordinates: the only request is one time-zone lookup to Open-Meteo, which carries the coordinates but not your IP's location.

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

Other mods can read today's times from prayer-times' state (`prayer-times.today`, typed in [`types/index.d.ts`](./prayer-times/types/index.d.ts)); `adhkar` does.

## adhkar

The 24 morning and evening adhkar from **Hisnul Muslim** (Fortress of the Muslim, chapter 27), each with its Arabic text, transliteration, English translation and how many times it is said.

- **When:** morning adhkar from Fajr until Dhuhr, evening adhkar from Asr until Isha, taken from `prayer-times`. Without it, the mod falls back to 04:00–11:00 and 15:00–19:00 on your clock.
- **Reminder:** a toast 15 minutes after Fajr or Asr begins (time to pray first), and `🤲 Evening adhkar · /adhkar` after the prayer countdown under the prompt until you finish.
- **`/adhkar`** opens a pane on the adhkar for this time of day; `/adhkar morning` or `/adhkar evening` picks one.

```
Evening adhkar · 2 of 21

Recite Surah al-Ikhlas, al-Falaq and an-Nas (112, 113, 114).
Al-Ikhlas (112): Say, He is Allah, [who is] One, …

[ 1 / 3 ]  [ Previous ]  [ Next ]  [ Finish ]  [ Close ]
```

| Key | |
| --- | --- |
| `c` | Count one repetition. When a dhikr reaches its number, the pane moves on to the next. |
| `n` / `p` | Next / previous. |
| `f` | Finish: marks today's session done and closes the pane. |
| `x` / `Esc` | Close the pane; your place is kept. `/adhkar close` does the same. |

Your place and counts are saved, so after closing Claude Code, `/adhkar` reopens at the same dhikr the same day. A new day starts from the top.

Where the evening wording differs ("amsayna" for "asbahna"), the pane shows the evening text or a note. Three are listed in the morning only (two of them, said 100 times, are once a day) and one in the evening only.

| Option | Default | |
| --- | --- | --- |
| `reminderDelayMinutes` | `15` | How long after Fajr and Asr begin to remind you. |
| `showArabic` | `false` | Show the Arabic text in the pane. Off by default: most terminals draw Arabic as unjoined letters, left to right. Turn it on if yours shapes Arabic properly. |

## daily-ayah

```
📖 "So remember Me; I will remember you. And be grateful to Me and do not deny Me."
— Al-Baqara (The Cow) 2:152  ↻ ×
```

- A new verse each time Claude Code starts or you `/clear`, from 59 verses that read well on their own (2:152, 13:28, 39:53, 65:3, 94:5, …).
- **↻** shows another verse; **×** hides the band for the rest of the session.
- `/ayah` prints the current verse with its Arabic text and brings the band back.

The Arabic (Uthmani script) and the **Sahih International** translation were taken from the [AlQuran Cloud API](https://alquran.cloud/api) and are bundled with the mod, so it needs no network.

| Option | Default | |
| --- | --- | --- |
| `showArabic` | `false` | Also show the Arabic in the band. Off by default because many terminals draw right-to-left text poorly; `/ayah` always includes it. |

## tasbih

```
📿 5-hour limit reached · back in 1h 42m · /tasbih
```

- When the **5-hour** or **weekly** usage limit is used up, a toast invites you to dhikr and the Tasbih pane opens (on a terminal 144 columns or wider; otherwise run `/tasbih`).
- The pane counts **SubhanAllah** ×33, **Alhamdulillah** ×33, **Allahu akbar** ×33 and the tahlil once, a hundred in all (Sahih Muslim 597). Keys: **c** count, **r** restart, **x** close.
- The hint under the prompt says when the limit comes back, and clears itself once it has.
- Each used-up window invites you once; a new session in the same window keeps only the hint. `/tasbih` opens the pane any time; `/tasbih demo` shows what a used-up 5-hour limit looks like, and `/tasbih close` ends it.

The limits are read from what Claude Code reports, so this works on a Claude subscription (Pro, Max); with an API key there are no such limits and the mod stays quiet.

| Option | Default | |
| --- | --- | --- |
| `showArabic` | `false` | Also show the Arabic in the pane. |

## Install

These mods are plugins of **function hooks**, a Claude Code plugin API in early access. They are loaded from a folder on disk, not from a marketplace. You need Claude Code **2.1.288 or newer** (`claude --version`).

### 1. Clone the repository

```sh
git clone https://github.com/ashafizullah/claude-code-muslim-mods.git ~/claude-code-muslim-mods
```

`adhkar` reads today's prayer times from `prayer-times` (it lists it under `dependencies`), so load the two together. `daily-ayah` and `tasbih` work on their own.

### 2. Load the mods

**Every session (recommended).** Add the folders to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of your **user** settings, `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/claude-code-muslim-mods/prayer-times:~/claude-code-muslim-mods/adhkar:~/claude-code-muslim-mods/daily-ayah:~/claude-code-muslim-mods/tasbih"
  }
}
```

- Separate the paths with `:` on macOS and Linux, `;` on Windows. Absolute paths and `~` both work.
- Only the user settings file is read for this. A project's `.claude/settings.json` is ignored.
- Merge the line into your existing `env` block rather than replacing the file.
- **Restart Claude Code** afterwards. Sessions that are already open don't pick it up.

This also works where no command-line flag can be passed, such as sessions started by the Claude desktop app or the Agent SDK.

**Or from your shell.** The same variable set in the environment works too, for example in `~/.zshrc` or `~/.bashrc`:

```sh
export CLAUDE_CODE_PLUGIN_DIRS="$HOME/claude-code-muslim-mods/prayer-times:$HOME/claude-code-muslim-mods/adhkar:$HOME/claude-code-muslim-mods/daily-ayah:$HOME/claude-code-muslim-mods/tasbih"
```

**One session only.** Pass each folder with `--plugin-dir`:

```sh
claude --plugin-dir ~/claude-code-muslim-mods/prayer-times \
       --plugin-dir ~/claude-code-muslim-mods/adhkar \
       --plugin-dir ~/claude-code-muslim-mods/daily-ayah \
       --plugin-dir ~/claude-code-muslim-mods/tasbih
```

### 3. Check that they loaded

```sh
claude plugin list
```

They are listed under **Session-only plugins** as `prayer-times@inline`, `adhkar@inline`, `daily-ayah@inline` and `tasbih@inline`, each `✔ loaded`. In a session, `/prayer-times` should print today's times and the countdown should appear under the prompt.

### 4. Set your options

Inside Claude Code, open `/config` (each mod's fields are listed there) or run `/plugin configure prayer-times@inline`.

From the terminal:

```sh
claude plugin configure prayer-times@inline                  # show the options and which are set
echo '{"city": "Istanbul"}' | claude plugin configure prayer-times@inline --values-stdin
```

Values are saved under `pluginConfigs` in `~/.claude/settings.json`, and changing one reloads the mod.

### Updating

What changed in each version is in [CHANGELOG.md](./CHANGELOG.md).

```sh
git -C ~/claude-code-muslim-mods pull
```

An interactive session watches these folders and reloads a mod when its files change, so a pull takes effect without a restart.

### Troubleshooting

- **Nothing shows up in a new terminal:** the folders aren't in `CLAUDE_CODE_PLUGIN_DIRS`, the variable is in a project settings file instead of `~/.claude/settings.json`, or Claude Code wasn't restarted after the change.
- **A mod is missing from `claude plugin list`:** check the path, then run `claude plugin validate ~/claude-code-muslim-mods/<mod>`.
- **It loads but misbehaves:** start Claude Code with `claude --debug`. Every hook that failed and every module that didn't load is logged with the reason.
- **Arabic shows as separate letters:** your terminal doesn't shape Arabic. Keep `showArabic` off; `/ayah` still prints the Arabic for copying.

### Uninstall

Remove the paths from `CLAUDE_CODE_PLUGIN_DIRS`, restart Claude Code, and delete the folder. To drop the saved options too, remove the mods' entries under `pluginConfigs` in `~/.claude/settings.json`.

## Data sources and APIs

| Source | Used for | When |
| --- | --- | --- |
| [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) `geocoding-api.open-meteo.com/v1/search` | Turning the `city` option into coordinates and a time zone | At runtime, once per city (cached) |
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs) `api.open-meteo.com/v1/forecast?timezone=auto` | The time zone of coordinates typed in `city` | At runtime, once per coordinates (cached) |
| [ipwho.is](https://ipwho.is) `ipwho.is/` | Finding your location from your IP when `city` is blank | At runtime, at most once a day (cached) |
| [ipapi.co](https://ipapi.co) `ipapi.co/json/` | Fallback for ipwho.is | Only when ipwho.is fails |
| [AlQuran Cloud API](https://alquran.cloud/api) `api.alquran.cloud/v1/ayah/{ref}/editions/quran-uthmani,en.sahih` | The Arabic text and Sahih International translation in `daily-ayah` | Once, when the mod was built; bundled in [`daily-ayah/hooks/verses.ts`](./daily-ayah/hooks/verses.ts) |
| [Hisnul Muslim API](https://www.hisnmuslim.com) `hisnmuslim.com/api/en/27.json` | The morning and evening adhkar in `adhkar` | Once, when the mod was built; bundled in [`adhkar/hooks/adhkar.ts`](./adhkar/hooks/adhkar.ts) |
| [Aladhan API](https://aladhan.com/prayer-times-api) `api.aladhan.com/v1/timings` | Checking the calculated prayer times | During development only; the mods never call it |

Prayer times themselves are calculated on your machine; no API is called for them. With coordinates in `city`, the only request is that one time-zone lookup.

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
- Adhkar: Hisnul Muslim by Sa'id ibn Wahf al-Qahtani, from [hisnmuslim.com](https://www.hisnmuslim.com)
- Geocoding: [Open-Meteo](https://open-meteo.com); IP location: [ipwho.is](https://ipwho.is), [ipapi.co](https://ipapi.co)

## License

The code is under the [MIT License](./LICENSE). The Qur'an translation is Sahih International's and is included for personal, non-commercial use.
