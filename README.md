# Muslim mods for Claude Code

[![CI](https://github.com/ashafizullah/claude-code-muslim-mods/actions/workflows/ci.yml/badge.svg)](https://github.com/ashafizullah/claude-code-muslim-mods/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/ashafizullah/claude-code-muslim-mods?color=blue)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.288-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Features](https://img.shields.io/badge/features-8-2E7D32)](#muslim-mods-for-claude-code)
[![Last commit](https://img.shields.io/github/last-commit/ashafizullah/claude-code-muslim-mods)](https://github.com/ashafizullah/claude-code-muslim-mods/commits/main)
[![Stars](https://img.shields.io/github/stars/ashafizullah/claude-code-muslim-mods?style=social)](https://github.com/ashafizullah/claude-code-muslim-mods/stargazers)

One plugin that brings prayer times, the Hijri date, the morning and evening adhkar, a verse of the Qur'an, sunnah fasting, Ramadan, Jumu'ah and a tasbih for when your usage limit runs out into [Claude Code](https://claude.com/claude-code), so a long coding session doesn't run straight past Asr. Each feature is switched on or off from one dashboard, `/muslim`.

| Feature | What it does | Command |
| --- | --- | --- |
| [Prayer times](#prayer-times) | Counts down to the next prayer under the prompt, reminds you before it and tells you when its time begins. | `/prayer-times` |
| [Hijri date](#hijri-date) | Shows the Hijri date under the prompt, turning over at Maghrib, and announces Ramadan, the Eids, Arafah, Ashura and the other days that matter. | `/hijri` |
| [Adhkar](#adhkar) | Reminds you of the morning and evening adhkar and opens a pane to read them, with a counter. | `/adhkar` |
| [Sunnah fasting](#sunnah-fasting) | Reminds you the evening before Monday, Thursday, the white days, Arafah and Ashura, then gives suhur and iftar reminders on the days you fast. | `/fasting` |
| [Ramadan](#ramadan) | In Ramadan, counts down to imsak and iftar under the prompt, with suhur, imsak, iftar and Tarawih reminders and the odd nights of the last ten. | `/ramadan` |
| [Jumu'ah](#jumuah) | From Thursday's Maghrib, salawat and Al-Kahf; on Friday, a reminder to get ready for the prayer and the last hour after Asr. | `/jumuah` |
| [Daily ayah](#daily-ayah) | Shows a verse of the Qur'an in a band above the prompt, a new one each session. | `/ayah` |
| [Tasbih](#tasbih) | When your 5-hour or weekly limit runs out, invites you to SubhanAllah, Alhamdulillah and Allahu akbar, with a counter. | `/tasbih` |

**Getting started:** see [Install](#install). It is a Claude Code plugin built on function hooks and needs Claude Code **2.1.288 or newer**; the plugin API is in early access and may change between releases.

## Dashboard

```
/muslim
┌ Muslim mods ───────────────────────────────────────────────────┐
│ [● On ]  1 Prayer times                                        │
│          🕌 Asr 14:40 · in 1:10:00                             │
│ [● On ]  2 Hijri date                                          │
│          📅 27 Rabi' al-Akhir 1448                             │
│ [○ Off]  3 Adhkar                                              │
│          Morning and evening adhkar; /adhkar                   │
│ ...                                                            │
│ Settings: /config, under muslim-mods                 [ Close ] │
└────────────────────────────────────────────────────────────────┘
```

- **`/muslim`** opens the dashboard: each feature with what it shows right now. Keys **1** to **8** switch one on or off; **x** closes.
- **`/muslim off ayah`**, **`/muslim on fasting`** do the same from the prompt (`prayer`, `hijri`, `adhkar`, `fasting`, `ramadan`, `jumuah`, `ayah`, `tasbih`); **`/muslim list`** shows which are on.
- A switched-off feature is not loaded at all: no hooks, no timers, no network. Switching saves the setting and reloads the plugin.
- Every feature's part of the hint line under the prompt is joined into one line in a fixed order, with no labels.
- Hijri date, adhkar, sunnah fasting, Ramadan and Jumu'ah read today's times from Prayer times, and sunnah fasting and Ramadan their dates from Hijri date. Switched off, what depends on them works only in part (the dashboard says so): adhkar falls back to fixed hours, and Ramadan needs both.

All features are on to start with. Every option below is in `/config` under **muslim-mods**.

## Prayer times

```
? for shortcuts  🕌 Asr 14:49 · in 1:12:05 · 🤲 Morning adhkar · /adhkar   ← hint line under the prompt
? for shortcuts  🕌 Dhuhr 11:43 · in 2:10:05 · ☀️ Dhuha time              ← while Dhuha or Tahajud lasts
🕌 Asr in 10m, at 14:49                                          ← toast, 10 minutes before
🕌 It's time for Asr (14:49). Time to pray.                      ← toast, when the time begins
☀️ Dhuha has begun (06:00), until shortly before Dhuhr.          ← toast, for Dhuha and Tahajud
```

`/prayer-times` prints today's schedule:

```
Prayer times today (Semarang, Indonesia · Asia/Jakarta · Kemenag · detected from your IP)
  Tahajud  00:36
  Fajr     04:07
  Sunrise  05:20
  Dhuha    05:46
  Dhuhr    11:29  ← next
  Asr      14:36
  Maghrib  17:35
  Isha     18:44
```

### Where you are

It works anywhere in the world. It finds your location in this order:

1. **The `city` option, if you set it.** Either a city name (`Istanbul`, `Kuala Lumpur`), which is looked up with the [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api), or coordinates (`41.01, 28.98`), whose time zone is looked up once with the [Open-Meteo forecast API](https://open-meteo.com/en/docs) (offline, your machine's time zone is used until the lookup succeeds). With coordinates, `method: Auto` uses MWL; set `method` to your country's.
2. **Your IP address, if `city` is blank** (the default). It asks [ipwho.is](https://ipwho.is), and [ipapi.co](https://ipapi.co) if that fails. The lookup is repeated once a day so the times follow you when you travel.

The countdown leads the hint line under the prompt and ticks every second; the other features add their parts after it.

The place found is cached, so later sessions start without a lookup and keep working offline. If it can't find you, the hint line says so and asks for a city.

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
- **Dhuha** begins when the sun is 4.5° above the horizon, as in Kemenag's timetable (about 20 minutes after sunrise).
- **Tahajud** begins with the last third of the night, the night counted from Maghrib to Fajr. Some timetables (Aladhan's "Lastthird") count it to sunrise instead, which puts it later.
- Dhuha and Tahajud are listed and announced, and while their time lasts the hint line adds `☀️ Dhuha time` or `🌙 Tahajud time` after the countdown. Dhuha time ends 10 minutes before Dhuhr, clear of the sun's zenith; Tahajud time ends at Fajr. The countdown itself only ever points at the five obligatory prayers.

### Options

| Option | Default | |
| --- | --- | --- |
| `city` | blank | A city, or `lat, lng`. Blank detects it from your IP. |
| `method` | `Auto` | `Auto`, `Kemenag`, `JAKIM`, `MWL`, `ISNA`, `Egypt`, `Makkah`, `Karachi`, `Diyanet` |
| `asr` | `Standard` | `Standard` (Shafi'i, Maliki, Hanbali) or `Hanafi` |
| `ihtiyatMinutes` | `-1` | Minutes added to each time; `-1` uses the method's own. |
| `reminderMinutes` | `10` | How early to remind you; `0` turns the early reminder off. |
| `sunnahReminders` | `true` | A toast when the time for Dhuha, and for Tahajud, begins, and a note on the hint line while it lasts. |

## Adhkar

The 24 morning and evening adhkar from **Hisnul Muslim** (Fortress of the Muslim, chapter 27), each with its Arabic text, transliteration, English translation and how many times it is said.

- **When:** morning adhkar from Fajr until Dhuhr, evening adhkar from Asr until Isha, taken from Prayer times. With it off, adhkar falls back to 04:00–11:00 and 15:00–19:00 on your clock.
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

## Jumu'ah

```
🌙 The night of Jumu'ah has begun: send salawat on the Prophet often (Abu Dawud 1047), and read Al-Kahf before tomorrow's Maghrib.
? for shortcuts  🕌 Dhuhr 11:30 · in 1:00:00 · 📅 28 Rabi' al-Akhir 1448 · 📖 Al-Kahf · /jumuah read
🕌 The Friday prayer is at Dhuhr, 11:30, in 45m: time to get ready and go early.
🤲 Friday after Asr: the last hour of Jumu'ah, when dua is answered (Abu Dawud 1048).
```

- Jumu'ah runs from **Thursday's Maghrib** to Friday's. As it begins, a toast for salawat and Al-Kahf; on Friday from Fajr, *Jumu'ah Mubarak* with the sunnah of the day (ghusl, clean clothes and perfume, going early). Each is said once, even across sessions.
- `📖 Al-Kahf` stays on the hint line until you run **`/jumuah read`**.
- A reminder **45 minutes before Dhuhr** to get ready for the Friday prayer, and at **Asr** the last hour of Friday, when dua is answered.
- **`/jumuah`** lists the sunnah of the day with a ✓ on Al-Kahf once read; midweek, when the next Jumu'ah is.

| Option | Default | |
| --- | --- | --- |
| `jumuahReminderMinutes` | `45` | For those who attend the Friday prayer: how early to remind you; `0` turns it off. |
| `kahf` | `true` | Al-Kahf on the hint line until you've read it. |

## Daily ayah

```
📖 "So remember Me; I will remember you. And be grateful to Me and do not deny Me."
— Al-Baqara (The Cow) 2:152  ↻ ×
```

- A new verse each time Claude Code starts or you `/clear`, from 59 verses that read well on their own (2:152, 13:28, 39:53, 65:3, 94:5, …).
- **↻** shows another verse; **×** hides the band for the rest of the session.
- `/ayah` prints the current verse with its Arabic text and brings the band back.

The Arabic (Uthmani script) and the **Sahih International** translation were taken from the [AlQuran Cloud API](https://alquran.cloud/api) and are bundled, so it needs no network.

| Option | Default | |
| --- | --- | --- |
| `showArabic` | `false` | Also show the Arabic in the band. Off by default because many terminals draw right-to-left text poorly; `/ayah` always includes it. |

## Hijri date

```
? for shortcuts  🕌 Asr 14:40 · in 0:40:00 · 📅 12 Rabi' al-Akhir 1448        ← hint line, after the prayer countdown
? for shortcuts  🕌 Isha 18:45 · in 0:50:00 · 🌙 13 Rabi' al-Akhir 1448 · White day   ← after Maghrib
🌙 Tonight begins 15 Sha'ban 1448, Nisf Sha'ban.                  ← toast, the evening before
```

- The Islamic day begins at sunset, so the date turns over at **Maghrib**, read from Prayer times (🌙 until midnight). Until Prayer times has found your place, or with it off, it turns over at midnight.
- A toast the **evening before** and **on the day** of the Islamic New Year, Nisf Sha'ban, the start of Ramadan and its last ten nights, Eid al-Fitr and the six days of Shawwal, the first ten days of Dhu al-Hijjah, Eid al-Adha and the days of Tashriq, and on the day of Tasu'a, Ashura and Arafah. Each is said once, even across sessions. The reminders to fast the evening before are [Sunnah fasting](#sunnah-fasting)'s.

`/hijri` prints today's date and what is coming:

```
27 Rabi' al-Akhir 1448 AH (Umm al-Qura)
  Thu 8 Oct 2026

Coming up (each begins the evening before):
  Sat 23 Jan 2027  15 Sha'ban 1448          Nisf Sha'ban · in 107 days
  Mon 8 Feb 2027   1 Ramadan 1448           1st of Ramadan · in 123 days
  Sun 28 Feb 2027  21 Ramadan 1448          Last ten nights · in 143 days
  Tue 9 Mar 2027   1 Shawwal 1448           Eid al-Fitr · in 152 days
  ...
```

`/hijri 2027-03-10` converts a Gregorian date.

The dates are calculated, not sighted. Countries that begin the month by moon sighting (Indonesia, Malaysia, Pakistan and others) can be a day off Umm al-Qura; set `adjustDays` to match your country's announcement, especially around Ramadan and the Eids.

| Option | Default | |
| --- | --- | --- |
| `calendar` | `Umm al-Qura` | `Umm al-Qura` (Saudi Arabia's) or `Tabular` (arithmetical). |
| `adjustDays` | `0` | Days to add or subtract, e.g. `-1` or `1`, to follow local sighting. |
| `announceDays` | `true` | The toasts for the days above. |

## Sunnah fasting

```
🌙 Tomorrow is Thursday and a white day: fasting is sunnah. /fasting on to fast it, with suhur and iftar reminders.
🍽 Suhur: Fajr is at 04:10, in 45m.                               ← toast, on a day you fast
? for shortcuts  🕌 Asr 14:40 · in 1:10:00 · 📅 13 Rabi' al-Akhir 1448 · White day · 🍽 Fasting · iftar 17:35
🍽 It's Maghrib: time to break your fast. Dhahaba al-zama'u ...    ← toast, at Maghrib
```

- **The evening before** (from Maghrib), a toast when tomorrow is a sunnah fast: Monday or Thursday, a white day (13th to 15th), Arafah, Tasu'a, Ashura or the first days of Dhu al-Hijjah. No reminders during Ramadan, and none for the Eids or the days of Tashriq, when fasting is forbidden.
- **`/fasting on`** says you'll fast (outside Ramadan; in Ramadan, [Ramadan](#ramadan) reminds you every day): today until Maghrib, tomorrow after it (or `/fasting on tomorrow`, `/fasting on 2026-10-15`). On that day you get a suhur toast before Fajr, the iftar time on the hint line and a toast at Maghrib with the iftar dua. `/fasting off` cancels it.
- **`/fasting`** lists the sunnah fasts in the next two weeks, with a ✓ on the days you said you'd fast.

The Hijri dates come from Hijri date and the times from Prayer times, so it follows their settings (`adjustDays` included).

| Option | Default | |
| --- | --- | --- |
| `mondayThursday` | `true` | Remind you before every Monday and Thursday. |
| `whiteDays` | `true` | Remind you before the white days. |
| `suhurMinutes` | `45` | How long before Fajr the suhur reminder comes, here and in Ramadan; `0` turns it off. |

## Ramadan

```
? for shortcuts  🕌 Fajr 04:10 · in 0:40:00 · 📅 1 Ramadan 1448 · 🍽 Imsak 04:00 · in 0:30:00   ← before Fajr
? for shortcuts  🕌 Asr 14:40 · in 1:10:00 · 📅 1 Ramadan 1448 · 🍽 Iftar 17:35 · in 4:05:00    ← the day
🍽 Suhur, day 1 of Ramadan: imsak at 04:00, Fajr at 04:10.         ← toast, 45 minutes before Fajr
🍽 Imsak (04:00): finish your suhur, Fajr is at 04:10.
🍽 It's Maghrib: time to break your fast. Dhahaba al-zama'u ...     ← toast, at Maghrib
🌙 Isha: Tarawih tonight, night 21 of Ramadan. ✨ An odd night of the last ten: seek Laylat al-Qadr. ...
```

It does nothing outside Ramadan. In it, every day, with nothing to turn on:

- A countdown on the hint line to **imsak** before Fajr and to **iftar** through the day, ticking every second; on the odd nights of the last ten (21, 23, 25, 27, 29), `✨ Night 23 · seek Laylat al-Qadr` after Maghrib.
- Toasts for **suhur** (45 minutes before Fajr), **imsak** (10 minutes before), **iftar** at Maghrib with its dua, and **Tarawih** at Isha, from the night before the first fast to the night before the last. On the odd nights the Isha toast adds the dua for Laylat al-Qadr (Tirmidhi 3513).
- A reminder of **zakat al-fitr** from the 27th, once a Ramadan.
- `/ramadan` prints today's imsak, Fajr, iftar and Isha and which night it is tonight; before Ramadan, how many days are left (from 30 days out).

The days come from Hijri date, so its `adjustDays` decides when Ramadan begins and ends for you; the start of Ramadan, the last ten nights and Eid are announced by Hijri date itself.

| Option | Default | |
| --- | --- | --- |
| `suhurMinutes` | `45` | The same option as sunnah fasting's. |
| `imsakMinutes` | `10` | When imsak is, before Fajr; `0` turns the imsak reminder off. |
| `tarawih` | `true` | The toast at Isha. |

## Tasbih

```
📿 5-hour limit reached · back in 1h 42m · /tasbih
```

- When the **5-hour** or **weekly** usage limit is used up, a toast invites you to dhikr and the Tasbih pane opens (on a terminal 144 columns or wider; otherwise run `/tasbih`).
- The pane counts **SubhanAllah** ×33, **Alhamdulillah** ×33, **Allahu akbar** ×33 and the tahlil once, a hundred in all (Sahih Muslim 597). Keys: **c** count, **r** restart, **x** close.
- The hint under the prompt says when the limit comes back, and clears itself once it has.
- Each used-up window invites you once; a new session in the same window keeps only the hint. `/tasbih` opens the pane any time; `/tasbih demo` shows what a used-up 5-hour limit looks like, and `/tasbih close` ends it.

The limits are read from what Claude Code reports, so this works on a Claude subscription (Pro, Max); with an API key there are no such limits and the tasbih stays quiet.

| Option | Default | |
| --- | --- | --- |
| `showArabic` | `false` | Also show the Arabic in the pane (one option for adhkar, the daily ayah and the tasbih). |

## Install

The plugin is built on **function hooks**, a Claude Code plugin API in early access, and is loaded from a folder on disk, not from a marketplace. You need Claude Code **2.1.288 or newer** (`claude --version`).

### 1. Clone the repository

```sh
git clone https://github.com/ashafizullah/claude-code-muslim-mods.git ~/claude-code-muslim-mods
```

### 2. Load the plugin

**Every session (recommended).** Add the `muslim-mods` folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of your **user** settings, `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/claude-code-muslim-mods/muslim-mods"
  }
}
```

- To load other plugins too, separate the paths with `:` on macOS and Linux, `;` on Windows. Absolute paths and `~` both work.
- Only the user settings file is read for this. A project's `.claude/settings.json` is ignored.
- Merge the line into your existing `env` block rather than replacing the file.
- **Restart Claude Code** afterwards. Sessions that are already open don't pick it up.

This also works where no command-line flag can be passed, such as sessions started by the Claude desktop app or the Agent SDK.

**Or from your shell.** The same variable set in the environment works too, for example in `~/.zshrc` or `~/.bashrc`:

```sh
export CLAUDE_CODE_PLUGIN_DIRS="$HOME/claude-code-muslim-mods/muslim-mods"
```

**One session only:**

```sh
claude --plugin-dir ~/claude-code-muslim-mods/muslim-mods
```

**Coming from the separate mods (before 1.0)?** Replace their paths (`.../prayer-times:.../adhkar:...`) with the one `muslim-mods` path. Options set for the old mods don't carry over, so set them again under muslim-mods in `/config`. They keep their names, except Jumu'ah's `prayerReminderMinutes`, now `jumuahReminderMinutes`; `showArabic` and `suhurMinutes` are now one option each for every feature that used them, and Hijri date's `hintLine` is the Hijri date switch itself.

### 3. Check that it loaded

```sh
claude plugin list
```

It is listed under **Session-only plugins** as `muslim-mods@inline`, `✔ loaded`. In a session, `/muslim` opens the dashboard and the prayer countdown appears under the prompt.

### 4. Set your options

Inside Claude Code, open `/config` (the fields are listed under muslim-mods) or run `/plugin configure muslim-mods@inline`.

From the terminal:

```sh
claude plugin configure muslim-mods@inline                  # show the options and which are set
echo '{"city": "Istanbul"}' | claude plugin configure muslim-mods@inline --values-stdin
```

Values are saved under `pluginConfigs` in `~/.claude/settings.json`, and changing one reloads the plugin.

### Updating

What changed in each version is in [CHANGELOG.md](./CHANGELOG.md).

```sh
git -C ~/claude-code-muslim-mods pull
```

An interactive session watches the folder and reloads the plugin when its files change, so a pull takes effect without a restart.

### Troubleshooting

- **Nothing shows up in a new terminal:** the folder isn't in `CLAUDE_CODE_PLUGIN_DIRS`, the variable is in a project settings file instead of `~/.claude/settings.json`, or Claude Code wasn't restarted after the change.
- **It is missing from `claude plugin list`:** check the path, then run `claude plugin validate ~/claude-code-muslim-mods/muslim-mods`.
- **A feature does nothing:** check it is on in `/muslim`. If it is and still misbehaves, start Claude Code with `claude --debug`. Every hook that failed and every module that didn't load is logged with the reason.
- **Arabic shows as separate letters:** your terminal doesn't shape Arabic. Keep `showArabic` off; `/ayah` still prints the Arabic for copying.

### Uninstall

Remove the path from `CLAUDE_CODE_PLUGIN_DIRS`, restart Claude Code, and delete the folder. To drop the saved options too, remove the `muslim-mods` entry under `pluginConfigs` in `~/.claude/settings.json`.

## Data sources and APIs

| Source | Used for | When |
| --- | --- | --- |
| [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) `geocoding-api.open-meteo.com/v1/search` | Turning the `city` option into coordinates and a time zone | At runtime, once per city (cached) |
| [Open-Meteo Forecast API](https://open-meteo.com/en/docs) `api.open-meteo.com/v1/forecast?timezone=auto` | The time zone of coordinates typed in `city` | At runtime, once per coordinates (cached) |
| [ipwho.is](https://ipwho.is) `ipwho.is/` | Finding your location from your IP when `city` is blank | At runtime, at most once a day (cached) |
| [ipapi.co](https://ipapi.co) `ipapi.co/json/` | Fallback for ipwho.is | Only when ipwho.is fails |
| [AlQuran Cloud API](https://alquran.cloud/api) `api.alquran.cloud/v1/ayah/{ref}/editions/quran-uthmani,en.sahih` | The Arabic text and Sahih International translation in the daily ayah | Once, when it was built; bundled in [`muslim-mods/hooks/daily-ayah/verses.ts`](./muslim-mods/hooks/daily-ayah/verses.ts) |
| [Hisnul Muslim API](https://www.hisnmuslim.com) `hisnmuslim.com/api/en/27.json` | The morning and evening adhkar | Once, when it was built; bundled in [`muslim-mods/hooks/adhkar/adhkar.ts`](./muslim-mods/hooks/adhkar/adhkar.ts) |
| [Aladhan API](https://aladhan.com/prayer-times-api) `api.aladhan.com/v1/timings` | Checking the calculated prayer times | During development only; the plugin never calls it |

Prayer times themselves are calculated on your machine; no API is called for them. With coordinates in `city`, the only request is that one time-zone lookup.

## Development

The plugin is the `muslim-mods` folder: a `.claude-plugin/plugin.json` manifest, `hooks/register.tsx` (the dashboard, the hint line, and which features are on) and one folder per feature under `hooks/`, each adding its own hooks. From the repository:

```sh
claude plugin validate muslim-mods   # check the manifest and hooks the way Claude Code loads them
claude plugin test muslim-mods       # run tests/*.test.ts(x)
tsc -p muslim-mods                   # type-check (after Claude Code has loaded the plugin once)
```

Each feature's tests switch the others off, so they see it alone. The tests mock the clock, the network and the store, so they run offline and don't depend on the date.

Pull requests are welcome, especially for more countries' methods or corrections to the times where you live.

## Credits

- Prayer time algorithm: [PrayTimes.org](http://praytimes.org) by Hamid Zarrabi-Zadeh
- Reference times: [Aladhan](https://aladhan.com)
- Qur'an text and translation: [AlQuran Cloud](https://alquran.cloud), Sahih International
- Adhkar: Hisnul Muslim by Sa'id ibn Wahf al-Qahtani, from [hisnmuslim.com](https://www.hisnmuslim.com)
- Geocoding: [Open-Meteo](https://open-meteo.com); IP location: [ipwho.is](https://ipwho.is), [ipapi.co](https://ipapi.co)

## License

The code is under the [MIT License](./LICENSE). The Qur'an translation is Sahih International's and is included for personal, non-commercial use.
