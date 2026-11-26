# Change log

What changed in each version of EMA Crossing, newest first. In the app: Settings, then "What's new in this version". The version on a phone is shown at the bottom of the Settings tab.

## 1.2 (21 November 2026)

Finished 21 November 2026. Everything from 1.1 below is in it.

Pack 12, 26 November 2026 (arrives on its own, nothing to install)

- The same as pack 11, under a new number. On a phone where pack 11 did not start in time, the app had stopped trying it; a new number lets it try again.

Pack 11, 26 November 2026

- **New scan symbols show at once.** Symbols new to the scan (the Nasdaq 100 and Major assets after pack 10) used to wait for their market's next scan. Now the app copies their prices from the update when it opens, with no download, and shows their crossings straight away, up to the date of those prices (24 November 2026). The market's next scan adds the days since.
- **Tap a scan find to see its chart.** Tapping a symbol on the Scan tab opens its own page, even when it is not on a watchlist: the full chart you can zoom and drag, Daily, Weekly and Hourly, the crossing that found it, how that crossing went before and its past crossings. **Add to watchlist** is on the page; Back returns to the same place in the list.
- Fixed: during **Scan now** the Scan tab was drawn again after each symbol, and on the phone it jumped back to the top each time. Now only the "Scanning… N of 632" line changes while it runs.

Pack 10, 25 November 2026 (arrived on its own, nothing to install)

- **More to scan: 632 symbols.** Besides the SET100 and the S&P 500, the scan now covers the **Nasdaq 100** and a **Major assets** list: gold, silver, WTI and Brent oil, the US dollar index, the dollar against the baht, euro, yen, pound, yuan, Swiss franc and Australian dollar, Bitcoin and Ethereum. Each is scanned once Yahoo counts its day as over: commodities and the dollar index after midnight New York time, currencies and crypto after midnight UTC (07:20 in Thailand).
- **The scan's first run is light.** The update carries 5 years of daily prices (open, high, low, close and volume) for all 632 symbols, up to 24 November 2026, so the first scan only fetches the last month of each. The file is 15.5 MB, 5.7 MB as it travels compressed.
- **A symbol without recent prices is shown, not scanned.** When Yahoo has nothing for a symbol in the 10 days before its market's latest close (a suspended or renamed share), the Scan tab lists it under "No recent prices" instead of showing its old crossings as recent.
- A scan symbol's whole history is downloaded again once a month instead of every two weeks, spread over the month. A split or other change to past prices is still noticed at once.
- Fixed: the crypto scan after midnight UTC looked for the day that had just begun instead of the one that had ended, so it could put off or skip its scan. **Scan now** was not affected.

Pack 9, 25 November 2026 (arrived on its own, nothing to install)

- **A new Scan tab: the screener.** The app looks through the SET100 and the S&P 500 (603 symbols, listed in the pack) for averages that crossed in the last few days, and lists what it found, newest first, with filters for each list and for up or down. Tap **+** to put a symbol on a watchlist with the crossing that found it, so its alerts start at once.
- **It scans after each close, on each market's own clock**: Thai shares after the Thai close, US shares after the US close in New York time, so America's clock changes and early closes need nothing from you. Weekends are skipped; on a holiday it asks for one price, sees nothing new and stops. **Scan now** runs it straight away.
- **You choose what it looks for.** EMA 50 / 200 daily and weekly are on to start; turn on EMA 20 / 50, price and EMA 200, EMA 12 / 26, RSI 30 / 70, MACD or weekly EMA 20 / 50, or add your own EMA pair. Choose how recent: the last day, 3, 5 or 10 trading days. Changes show at once, from prices already on the phone.
- **The first scan downloads 5 years of prices once** (about 20 to 30 MB, roughly 5 minutes); after that each scan takes only the last month, about 1 to 2 MB. The scan keeps closing prices only, about 15 MB, and **Clear** removes them.
- **A notification when a scan finds new crossings.** One that would arrive in the night waits until 07:00. It can be switched off on the Scan tab.
- **Gentle on Yahoo.** The scan asks for at most 2 prices a second, and the whole app never more than 5. When Yahoo asks the app to slow down, everything waits a minute; after three refusals in a row the scan rests for half an hour, and nothing (opening the app, a price check) starts it again sooner. A price check that comes while a scan runs is done right after it.

- **Daily, Weekly and Hourly above every chart.** Switch the chart of any asset between daily, weekly and hourly prices, even without a crossing on that timeframe. Without one, the chart shows EMA 50 / 200 and no alerts come from it. Tapping a crossing below puts the chart back on that crossing's timeframe.
- Fixed: on some phones the bottom of the app (the tab bar, buttons at the bottom of a screen, an article's end) sat under the phone's own Back and Home buttons. The app now asks the phone for the height of its buttons again after starting and each time it is opened, and falls back on the browser's own safe area.
- **Price checks use much less data.** The app keeps the price history it already has and downloads only the last few weeks, adding them on. Once a week, or when past prices change (after a split or a dividend adjustment), it downloads the whole history again so the chart stays right. Alerts work exactly as before.

Pack 8, 25 November 2026 (arrived on its own, nothing to install)

- **The watchlist tabs are always at the top**, even with one list, and stay there while you scroll. **New list** sits beside them.
- **Drop a card on a tab** at the top to move it to that list, as well as on the bar at the bottom.
- **A bar to move through time** under the chart on an asset's screen. It shows the whole price history in small, with a frame around the part the chart shows. Drag the frame left or right to move back and forth in time, or tap anywhere on the bar to jump there. Zoom in or out and the frame changes size; **Reset zoom** goes back to the latest prices.
- **Dragging scrolls the list**: hold a card near the top or bottom edge and the list scrolls, faster the closer you are, so a card can go from the bottom of a long list to the top in one drag.

Pack 7, 25 November 2026 (arrived on its own, nothing to install)

- **Drag an asset to another watchlist.** Hold a card on the watchlist: your other lists appear at the bottom. Drag the card onto one and let go to move it there.

Pack 6, 25 November 2026 (arrived on its own, nothing to install)

- **More than one watchlist.** Make as many as you like from the ⋮ menu (**New watchlist**), or the **New** chip. When there are two or more, a row of chips at the top of the Watchlist tab switches between them; each chip shows how many assets the list holds.
- **Rename a watchlist** from the ⋮ menu. The title at the top is the name of the list you are looking at.
- **Move an asset to another watchlist**: open it and tap ⇄ at the top, or use **Reorder or move assets** in the ⋮ menu. An asset can also be on several lists at once: tick them under **On watchlists** on its screen.
- Alerts come for every asset on any list, once each. Your present list stays as it was, under the name "Watchlist", with every asset, crossing and alert kept. Backups now include the lists.

Pack 5, 21 November 2026 (arrived on its own, nothing to install)

- Nothing you can see. The app's test files are no longer sent to the phone, and a new automatic test clicks every control on the asset screen and in Settings to check that nothing moves.

Pack 4, 21 November 2026 (arrived on its own, nothing to install)

- Fixed for every button: tapping a button, chip or switch no longer moves the page. Whatever you tap now stays exactly where it was, even when the chart or a list above it changes size. Packs 2 and 3 had only fixed single cases.
- The row of chart options (Candles, Bollinger, SMA, RSI, MACD) keeps its sideways position when you tap one.

Pack 3, 21 November 2026 (arrived on its own, nothing to install)

- Fixed: with RSI or MACD shown on the chart, tapping a crossing still moved the list down a little each time. Pack 2 had only fixed it for a plain chart.

Pack 2, 21 November 2026 (arrived on its own, nothing to install)

- Fixed: on an asset's screen, tapping a crossing under "Crossings you are alerted on" made the page jump. The list now stays where it is.
- Added: every pack has an id. Settings shows it at the bottom with the pack number and when it was built, so you can tell exactly which content the phone is running.

Changed

- **The app is now an engine and a pack.** The installed part is a small engine. Every screen, calculation, list, text and article is a file in a pack, and a newer pack arrives from your update server on its own, with nothing to install. The screens look and work as they did in 1.1.
- **Updates from a server** now bring new screens, features and fixes as well as articles. A new version of the installed engine is needed only rarely, and the app says so when it is.
- Your watchlist, results, alert history, settings and each widget's choice of assets are taken over from 1.0 or 1.1 at the first start. No alert is repeated or missed. An untouched copy of the old watchlist is kept as well.
- The installed app is smaller: about 0.9 MB.

Added

- **Safety for updates**: a pack is accepted only when its file list is signed with the app's own key and every file matches the list. A pack that fails to start is set aside by itself and the one before it is used again.
- The version lines in Settings show the version, the engine and the pack.

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
