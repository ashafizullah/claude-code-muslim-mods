# Changelog

## muslim-mods

### 1.0.1
- Daily ayah: a new verse on `/clear`; switching a feature or changing an option keeps the current one.
- Tasbih: `/tasbih close` ends the demo even after a reload.
- Dashboard: a refused switch says so in a toast; the Close button no longer falls off a short pane.
- Jumu'ah: the Friday morning toast waits for Fajr instead of coming at midnight.
- Ramadan: between midnight and Fajr, `/ramadan` names the night in progress (an odd night of the last ten included).
- Sunnah fasting: a session opened after midnight still hears that today is a sunnah fast while suhur is possible; `/fasting on` refuses impossible dates, says when no reminder can come (prayer times off), and notes that fasting a Friday on its own is disliked; Monday and Thursday on the last two days of Sha'ban are listed without a reminder.
- Hijri date: the 30 days ahead are recomputed as soon as `calendar` or `adjustDays` changes; `/hijri` refuses impossible dates.
- Prayer times: the days around a daylight-saving change are no longer counted 24 hours apart (no duplicate day, no Tahajud an hour off); where the sun doesn't rise or set (polar winter and summer) the missing times are left out instead of breaking `/prayer-times`.
- Adhkar: a fresh start no longer resets today's reading before prayer times has published its time zone.
- A feature switched off no longer leaves its times or dates for the others to read.

### 1.0.0
- The mods are one plugin, `muslim-mods`: one folder to load, one entry in `/config`.
- `/muslim` opens a dashboard that switches each feature on or off (keys 1 to 8), showing what each one shows right now; `/muslim on|off <feature>` and `/muslim list` from the prompt. A switched-off feature is not loaded.
- New: Jumu'ah. From Thursday's Maghrib, salawat and Al-Kahf (on the hint line until `/jumuah read`); on Friday, *Jumu'ah Mubarak*, a reminder 45 minutes before the Friday prayer, and the last hour after Asr; `/jumuah`.
- The hint line under the prompt is put together in one place, in a fixed order.
- Options keep their names under muslim-mods, except: `prayerReminderMinutes` is `jumuahReminderMinutes`; `showArabic` and `suhurMinutes` are one option each across features; Hijri date's `hintLine` is gone (switch the Hijri date off instead). Options and saved progress from the separate mods don't carry over.

## Before 1.0: the separate mods

Each was versioned on its own, in `<mod>/.claude-plugin/plugin.json`. Their histories:

### prayer-times

#### 0.6.1
- While it is Dhuha or Tahajud time, the hint line says so after the countdown (`☀️ Dhuha time`, `🌙 Tahajud time`). Dhuha time ends 10 minutes before Dhuhr; Tahajud time at Fajr. `sunnahReminders: false` hides it too.

#### 0.6.0
- Dhuha (sun at 4.5°) and Tahajud (the last third of the night, Maghrib to Fajr) in `/prayer-times`, with a toast when each begins. `sunnahReminders: false` turns the toasts off. The countdown and the published `today` state keep only the obligatory prayers and sunrise.

#### 0.5.0
- Coordinates in `city` get their own time zone, looked up once with Open-Meteo. Offline, this machine's zone is used and the lookup is retried.

#### 0.4.1
- The place is looked up again in the background: every minute until found, hourly after, so a session started offline recovers.
- Session start waits at most 3 seconds for the place.
- A response that isn't JSON (a rate limit's HTML page) counts as no answer instead of failing the hook.

#### 0.4.0
- The countdown moved from a status line to the tail of the hint line under the prompt, shared with adhkar. The status line older versions pinned is cleared.

#### 0.3.0
- The countdown ticks every second (H:MM:SS).
- Today's times are published in the mod's state for other mods (`prayer-times.today`).

#### 0.2.0
- First release: prayer times calculated on your machine, the place from `city` or your IP, the method picked by country, a reminder before each prayer and a toast when it begins, `/prayer-times`.

### adhkar

#### 0.4.0
- Your place, counts and mode are saved, so `/adhkar` reopens at the same dhikr after a restart the same day.

#### 0.3.1
- The pane's height is counted at its own width (90 columns at most), so long adhkar aren't clipped on wide terminals.
- The day turns over at midnight in the prayer times' time zone.

#### 0.3.0
- A Close button and `/adhkar close`; Arabic is hidden by default (`showArabic`).
- The pane is sized to the longest dhikr, with the buttons on top.

#### 0.2.0
- The reminder moved to the hint line under the prompt, after the prayer countdown.

#### 0.1.0
- First release: the morning and evening adhkar from Hisnul Muslim, a reminder after Fajr and Asr, and a pane with a counter.

### daily-ayah

#### 0.2.0
- A new verse every session start, including `/clear`, instead of one per day. ↻ jumps to an unrelated verse.

#### 0.1.0
- First release: a verse of the Qur'an a day in a band above the prompt, `/ayah`.

### hijri-date

#### 0.2.0
- The next 30 days' Hijri dates are published in the mod's state (`hijri-date.ahead`), for `sunnah-fasting`.
- The white days, and the evening before Tasu'a, Ashura and Arafah, no longer get a toast here: the reminders to fast are `sunnah-fasting`'s. The day itself is still announced, and the hint line still names it.

#### 0.1.0
- First release: the Hijri date (Umm al-Qura or tabular, with `adjustDays` for local sighting) on the hint line, turning over at Maghrib; a toast the evening before and on the day of Ramadan, the Eids, Arafah, Ashura, the white days and the other days that matter; `/hijri`, which also converts a Gregorian date.

### sunnah-fasting

#### 0.1.1
- `/fasting on` turns down a day in Ramadan: `ramadan-mode` gives its suhur and iftar reminders every day.

#### 0.1.0
- First release: a toast the evening before Monday, Thursday, the white days, Arafah, Tasu'a, Ashura and the first days of Dhu al-Hijjah; `/fasting on` for a suhur reminder before Fajr, the iftar time on the hint line and a toast with the iftar dua at Maghrib; `/fasting` lists the next two weeks.

### ramadan-mode

#### 0.1.0
- First release: in Ramadan, a countdown to imsak and iftar on the hint line; toasts for suhur, imsak, iftar (with its dua) and Tarawih; the odd nights of the last ten with the dua for Laylat al-Qadr; a zakat al-fitr reminder; `/ramadan`.

### tasbih

#### 0.1.0
- First release: when the 5-hour or weekly limit is used up, a toast and a pane invite you to SubhanAllah, Alhamdulillah and Allahu akbar (33 each) and the tahlil, with a counter.
- The hint under the prompt shows when the limit comes back; `/tasbih` opens the pane any time.
