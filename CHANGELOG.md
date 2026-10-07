# Changelog

Each mod is versioned on its own; its version is in `<mod>/.claude-plugin/plugin.json`.

## prayer-times

### 0.6.1
- While it is Dhuha or Tahajud time, the hint line says so after the countdown (`☀️ Dhuha time`, `🌙 Tahajud time`). Dhuha time ends 10 minutes before Dhuhr; Tahajud time at Fajr. `sunnahReminders: false` hides it too.

### 0.6.0
- Dhuha (sun at 4.5°) and Tahajud (the last third of the night, Maghrib to Fajr) in `/prayer-times`, with a toast when each begins. `sunnahReminders: false` turns the toasts off. The countdown and the published `today` state keep only the obligatory prayers and sunrise.

### 0.5.0
- Coordinates in `city` get their own time zone, looked up once with Open-Meteo. Offline, this machine's zone is used and the lookup is retried.

### 0.4.1
- The place is looked up again in the background: every minute until found, hourly after, so a session started offline recovers.
- Session start waits at most 3 seconds for the place.
- A response that isn't JSON (a rate limit's HTML page) counts as no answer instead of failing the hook.

### 0.4.0
- The countdown moved from a status line to the tail of the hint line under the prompt, shared with adhkar. The status line older versions pinned is cleared.

### 0.3.0
- The countdown ticks every second (H:MM:SS).
- Today's times are published in the mod's state for other mods (`prayer-times.today`).

### 0.2.0
- First release: prayer times calculated on your machine, the place from `city` or your IP, the method picked by country, a reminder before each prayer and a toast when it begins, `/prayer-times`.

## adhkar

### 0.4.0
- Your place, counts and mode are saved, so `/adhkar` reopens at the same dhikr after a restart the same day.

### 0.3.1
- The pane's height is counted at its own width (90 columns at most), so long adhkar aren't clipped on wide terminals.
- The day turns over at midnight in the prayer times' time zone.

### 0.3.0
- A Close button and `/adhkar close`; Arabic is hidden by default (`showArabic`).
- The pane is sized to the longest dhikr, with the buttons on top.

### 0.2.0
- The reminder moved to the hint line under the prompt, after the prayer countdown.

### 0.1.0
- First release: the morning and evening adhkar from Hisnul Muslim, a reminder after Fajr and Asr, and a pane with a counter.

## daily-ayah

### 0.2.0
- A new verse every session start, including `/clear`, instead of one per day. ↻ jumps to an unrelated verse.

### 0.1.0
- First release: a verse of the Qur'an a day in a band above the prompt, `/ayah`.

## tasbih

### 0.1.0
- First release: when the 5-hour or weekly limit is used up, a toast and a pane invite you to SubhanAllah, Alhamdulillah and Allahu akbar (33 each) and the tahlil, with a counter.
- The hint under the prompt shows when the limit comes back; `/tasbih` opens the pane any time.
