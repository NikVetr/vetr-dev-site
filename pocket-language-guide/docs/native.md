# The native shell

The app inside a WebView. **Nothing here is a second build of the app** — the same
files that `npm run mobile` copies into `dist/mobile` are what the shell loads, and
the only difference at runtime is whether a `Capacitor` global exists.

## What is committed, and what is not

`capacitor.config.json`, the pinned dependencies and the platform adapters under
`ui/platform/` are committed. **`ios/` and `android/` are gitignored**, which is
unusual for a Capacitor project and deliberate here: publication of this site *is*
`git push` — plain GitHub Pages off `main`, no build step — so a native project
directory at the repository root would be served to the public web. Regenerate them:

```bash
npm install
npm run mobile                 # builds dist/mobile, the webDir
npx cap add android            # needs the Android SDK
npx cap add ios                # needs macOS and Xcode
npx cap sync                   # after every `npm run mobile`
npx cap run android
```

`npm run mobile` must be re-run before every `sync`; `webDir` is a build output, not
the source tree, so an edit to `ui/` is invisible to the shell until both have run.

## The application identifier is provisional

`dev.vetr.pocketlanguageguide` is the identifier the implementation plan proposed. It
is here so the tooling has something to work with, and it is **not approved for
distribution** — §1.2 and N1 both require the owner to settle identity before
anything is submitted anywhere, and an identifier is effectively permanent once a
store listing exists. Change it before the first upload, not after.

## Plugins, and why only these three

Only what an implemented feature uses:

| plugin | used by | for |
|---|---|---|
| `@capacitor/app` | `ui/platform/shell.js` | the Android system Back press |
| `@capacitor/preferences` | `ui/platform/store.js` | durable personal data |
| `@capacitor/share` | `ui/platform/shell.js` | one-way handoff of a single sentence |

No filesystem, no camera, no location, no notifications, no background service. The
keep-awake path in `ui/platform/wake.js` uses the browser's own `navigator.wakeLock`,
which the WebView supports; a plugin goes in only if a device shows it does not hold.

## Insets: one strategy, and the thing to check first on a device

`adjustMarginsForEdgeToEdge` is set to **`disable`**, and the safe area is handled
entirely in CSS — `viewport-fit=cover` in all four pages' viewport meta, and
`env(safe-area-inset-*)` padding on `body` in `style.css`, plus the three
`position: fixed` overlays that escape that box (`.board-stage`, `dialog.lightbox`,
`.donate`). Letting Capacitor adjust margins *as well* is the "padding twice" the plan
warns about, and it shows up as a two-notch gap at the top of every screen.

**This is the first thing to verify on a real Android device**, because it is the one
decision here that cannot be checked without one: if `env(safe-area-inset-top)` comes
back as zero under edge-to-edge enforcement, the header will sit under the status bar.
The fix in that case is one word — `"auto"` — and then removing the `body` padding so
the inset is still applied exactly once.

## What the shell changes about behaviour

**Back.** Android's system Back is not a browser Back: unhandled in a WebView, it
exits the application. `onBack` gives the page first refusal — an open `<dialog>`
closes, then the page's own handler unwinds one step (on the board: reply → message →
submenu → root), and only an unconsumed press is allowed to leave. At a board's root
it is deliberately unconsumed, because the page behind it is the topic list. **This is
not permission to add a visible Back button to a message**; the tap-anywhere return is
unchanged.

**Storage.** `ui/platform/store.js` mirrors `Preferences` into memory at start-up so
every existing synchronous caller keeps working, and writes through behind them. A
WKWebView's `localStorage` is evictable under storage pressure, which for a store
holding the only copy of someone's own phrases is not acceptable. An install that
predates the adapter is migrated forward on first launch, never backward, and the
source copy is not deleted.

**Handoff.** `handOff(text)` opens the native share sheet with one sentence and
nothing else. One way: no result is captured and nothing is promised about what the
other application does. A cancelled sheet is not a failure and must not trigger a
fallback.

**No service worker.** The bundle ships `data/native.json` saying `serviceWorker:
false`, so `registerOffline` does not register one: a WebView already serves local
files, and a second cache in front of them is a stale-shell bug on an app that updates
through a store.

## The first Android build, and what it could and could not show

Run on 2026-09-24 with the owner's go-ahead to install what testing needs. Nothing
went system-wide: Temurin JDK 21 and the Android SDK (command-line tools, platform
35, build-tools 35.0.0, the emulator, a Google APIs x86_64 image) live under
`~/android-tools/`, and the scripts that drive them are in `tmp/`. Capacitor 7's
Android library compiles for Java 21 — JDK 17 fails with `invalid source release:
21` — which was the one false start.

`npm run mobile`, `npx cap add android`, `npx cap sync android` and `./gradlew
assembleDebug` produce a 42 MB debug APK. On the emulator it **installs, launches,
the Capacitor bridge starts and registers App, Preferences and Share, and the
WebView requests `https://localhost/`** with no error from the shell. That is the
first time any of this has run outside a browser.

What could not be shown is whether the page paints. This user is not in the `kvm`
group, so the emulator ran without hardware acceleration, and an unaccelerated
Android 15 image is not a usable device: within ninety seconds System UI stops
responding, Google Play services crash, and the WebView's render process is taken
down with them. Screenshots show the Capacitor launch screen and then the ANR
dialog, and a debugger attached over the WebView's devtools socket (which needs
`webContentsDebuggingEnabled`, set in the generated project only) reaches the page
target but the renderer dies under it. Two things would finish the test, and either
is enough: `sudo usermod -aG kvm $USER` and a fresh login, after which the same
scripts run accelerated; or a physical Android phone with USB debugging, on which
`npx cap run android` installs the same APK.

## Not done

- **Not yet on a real phone.** A Linux machine cannot produce an iOS result, and the
  Android build above stopped at the emulator's limits. Everything else is verified
  in a browser and by unit tests with a fake `Capacitor`.
- **N2 is only half done.** Handoff and the share path exist; routing the PDF, PNG,
  SVG, ZIP and CSV exports through native file delivery does not. On a device those
  still go through the browser download path, which in a WebView may do nothing.
- **N5 and N6** — repeatable platform builds, icons, splash, signing, store metadata —
  are untouched, and all of them need owner decisions before they mean anything.
