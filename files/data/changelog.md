# Change log

What changed in each version of EMA Crossing, newest first. In the app: Settings, then "What's new in this version". The version on a phone is shown at the bottom of the Settings tab.

## 1.2 (21 November 2026)

Finished 21 November 2026. Everything from 1.1 below is in it.

Changed

- **The app is now an engine and a pack.** The installed part is a small engine. Every screen, calculation, list, text and article is a file in a pack, and a newer pack arrives from your update server on its own, with nothing to install. The screens look and work as they did in 1.1.
- **Updates from a server** now bring new screens, features and fixes as well as articles. A new version of the installed engine is needed only rarely, and the app says so when it is.
- Your watchlist, results, alert history, settings and each widget's choice of assets are taken over from 1.0 or 1.1 at the first start. No alert is repeated or missed. An untouched copy of the old watchlist is kept as well.
- The installed app is smaller: about 0.9 MB.

Added

- **Safety for updates**: a pack is accepted only when its file list is signed with the app's own key and every file matches the list. A pack that fails to start is set aside by itself and the one before it is used again.
- The version line in Settings now shows three numbers: the version, the pack ("content") and the engine.

Under the hood

- The rules of the app were carried over from Kotlin to JavaScript with their tests: 28 tests of the rules, and 5 of the engine.

## 1.1 (finished 21 November 2026, never released)

Started 20 November 2026 and finished on the PC and the emulator. It was not sent to the phone: version 1.2 followed straight away and contains all of it.

Added

- **Day summary on the asset screen**: the latest session's open, high, low and volume, the previous close, and the 52-week high and low.
- **Candlestick chart**: a "Candles" switch on the chart. The EMA lines and crossing rings stay on top.
- **Volume bars** under the chart, green when the bar closed at or above its open and red when below. Hidden for assets that report no volume.
- **Full readout when dragging on the chart**: open, high, low and volume of the bar under your finger, next to the close and both EMAs.
- **Indicators on the chart**: switches for RSI (14) and MACD (12, 26, 9) as strips under the chart, and Bollinger bands and simple moving averages drawn over the price. The drag readout shows their values. The choice is remembered.
- **RSI and MACD alerts**: two new alert types beside the EMA crossings, for daily, weekly or hourly bars. RSI 30 / 70 alerts when the 14-bar RSI rises above 70 or falls below 30. MACD 12 / 26 alerts when the MACD line crosses its signal line. The watchlist card shows the current RSI on its pill, and each has its own track record and list of past events.
- **Hold and drag to reorder** the watchlist. The reorder screen with arrows is still in the menu.
- **Early warnings**: a notification before a crossing, when the two averages are close and still closing in (daily and weekly crossings). On by default at 1%; switch it off or choose 0.5%, 1% or 2% in Settings. Assets that are closing in show a "Closing in" pill.
- **Warning when checks have stopped**: a note on the watchlist when no check ran for 12 hours or more before you opened the app.
- **Widget**: scrolls through every asset (Android 12 and later), shows a small trend line per asset, and has a refresh button.
- **Two more widgets**: a small one for a single asset with its trend line, price and the day's change, and a one-line strip with several assets side by side.
- **Choose the assets per widget**: each placed widget keeps its own list. Long-press a widget and tap the pencil (Android 12 and later). The watchlist widget can also be made narrower; it then drops the trend line and, narrower still, the price.
- **Track record on every crossing**: on the asset screen, how often this pair crossed before on this asset and what the price did 5, 20 and 60 bars later, always with the counts. A crossing's notification carries one line of it.
- **Gold in baht**: Thai gold per baht-weight, calculated from US gold futures and the dollar-baht rate. Add it from the popular list or by searching "gold".
- **Articles tab**: short pieces on what the price history shows. They ship with the app. Each opens with its figures: charts you can tap, drag and switch between markets. Every article carries its number. The first four: "Six in ten trades lost money. The best one in thirteen carried the average.", "Eight times in ten, the rule bought back higher than it sold", "EMA or SMA? A coin toss, share by share, and again half by half" and "Four years out of 58: when the rule's sales paid off".
- **Updates from a server**: give the app a server address in Settings and new articles arrive on their own, corrected ones are replaced, and a new version of the app installs with one tap and Android's confirmation. Off until an address is entered. Every download is checked, and an app update must carry this app's own signature.
- **Mute a crossing**: the bell on each crossing silences its notifications while it stays tracked and on screen.
- **Quiet hours**: hold notifications between two hours (22:00 to 07:00 unless changed) and deliver them afterwards.
- **Backup and restore**: save the watchlist, every crossing and the settings to one file, and bring them back.
- **Zoom on the chart**: pinch with two fingers to zoom, slide two fingers to move along the history, or use the Zoom in and Zoom out buttons. **Reset zoom** returns to the chosen range.
- **What's new screen**: this change log inside the app, opened from the Settings tab.
- **Version number** at the bottom of the Settings tab.
- **Appearance setting**: Dark, Light or System, in the Settings tab.
- **Price details switch** in the Settings tab: turn it off to hide the day summary, the open/high/low/volume readout, the volume bars and the Candles switch, for a plainer asset screen.

Changed

- **Every crossing since the last check is reported**, not only the latest one (up to five per pair).
- **Dark is now the default**, whatever the phone is set to, and the opening screen is always dark. The home-screen widget still follows the phone's setting.
- The app now saves open, high, low and volume for every bar, not only the close. The first check after updating downloads them once.

Behind the scenes

- The project is under version control (Git).
- Thirteen new tests cover reading the extra numbers, the indicator maths, repeated crossings, early warnings, the track record, calculated series, the RSI and MACD alerts and the update rules; 27 tests in total.

## 1.0 (18 to 19 November 2026)

The first version, built in several steps over two days.

- **Alerts** when a fast EMA crosses a slow EMA: presets 50/200, 20/50, 12/26, price against EMA 200 or 50, and custom pairs.
- **Timeframes**: each crossing on daily, weekly or hourly closes. Only finished bars count.
- **Watchlist** with the delayed price, the day's change, a 60-day sparkline and a pill per crossing; pull down to refresh; reorder from the menu.
- **Asset screen** with an interactive chart, range buttons, the state of each crossing, one-tap presets and the list of past crossings; rename and remove.
- **Search** by name or symbol, a popular list, and watching a symbol that is not listed yet.
- **Alerts tab** with every crossing of the last 30 days.
- **Home-screen widget** with the state of each asset's crossings, the price and the day's change.
- **Background checks** every 3 hours, every hour while an hourly crossing is watched, and ten minutes after the next market close.
- **Light and dark mode.**
- An optimised 1.4 MB build for installing on a phone.
