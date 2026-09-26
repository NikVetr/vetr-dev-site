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
npm run android                # bundle, add/sync android/, assemble the debug APK
npm run check:android          # the emulator checks, against that APK
npm run ios -- --run           # on the Mac: bundle, add/sync ios/, build, launch in the simulator
npm run check:ios              # on the Mac: the simulator checks
```

Both build scripts run `npm run mobile` first; `webDir` is a build output, not the
source tree, so an edit to `ui/` is invisible to the shell until it has been bundled
and synced. What the generated projects need beyond Capacitor's template -- the
devtools socket in a debug Android build, the camera declaration for the beacon's
lamp on both -- the scripts write into the generated files on every run.

## The application identifier is provisional

`dev.vetr.pocketlanguageguide` is the identifier the implementation plan proposed. It
is here so the tooling has something to work with, and it is **not approved for
distribution** — §1.2 and N1 both require the owner to settle identity before
anything is submitted anywhere, and an identifier is effectively permanent once a
store listing exists. Change it before the first upload, not after.

## Plugins, and why only these four

Only what an implemented feature uses, all at Capacitor 8:

| plugin | used by | for |
|---|---|---|
| `@capacitor/app` | `ui/platform/shell.js` | the Android system Back press |
| `@capacitor/preferences` | `ui/platform/store.js` | durable personal data |
| `@capacitor/share` | `ui/platform/shell.js` | one-way handoff of a sentence, and delivering a file |
| `@capacitor/filesystem` | `ui/platform/shell.js` | writing an export or a backup where the share sheet can take it |

No location, no notifications, no background service. The camera is declared, not
pluginned: the beacon asks the WebView for it the way it asks a browser, only to
switch the lamp on and off, so `NSCameraUsageDescription` (iOS) and an optional
`CAMERA` permission (Android) go into the generated projects. The keep-awake path in `ui/platform/wake.js` uses the
browser's own `navigator.wakeLock`, which the WebView supports.

**Capacitor 8, because iOS 27 requires it.** An app built with the iOS 27 SDK must
adopt the UIScene life cycle, and refuses to launch otherwise ("UIScene life cycle is
required"); Capacitor 7's template has no scene delegate, Capacitor 8's has one and a
scene proxy in its runtime. Both platforms move together because they share one
`package.json`. Capacitor 8 also generates the iOS project for Swift Package Manager
rather than CocoaPods, targets iOS 15, and on Android compiles against SDK 36 with
Gradle 8.14.3.

## Insets: one strategy, and the thing to check first on a device

`SystemBars.insetsHandling` is **`native`** (Capacitor 8's replacement for
Capacitor 7's `adjustMarginsForEdgeToEdge`), and the safe area is handled entirely
in CSS — `viewport-fit=cover` in all four pages' viewport meta, and
`env(safe-area-inset-*)` padding on `body` in `style.css`, plus the three
`position: fixed` overlays that escape that box (`.board-stage`, `dialog.lightbox`,
`.donate`). Letting Capacitor adjust margins *as well* is the "padding twice" the plan
warns about, and it shows up as a two-notch gap at the top of every screen.

`native` either lays the WebView out inside the bars and reports zero insets (an
older WebView) or draws edge to edge and reports the real ones (Chromium 140 and
up, iOS) -- the page's padding is right in both cases, so the inset is applied once.
Measured on the iOS simulator: 62pt at the top and 34pt at the foot, with the header
and the board's footer clear of both; on the Android emulator the header clears the
status bar and the footer the gesture bar. A phone is still the last word on this.

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

Without hardware acceleration nothing more could be shown: an unaccelerated
Android 15 image is not a usable device — within ninety seconds System UI stops
responding, Google Play services crash, and the WebView's render process is taken
down with them. With the user added to the `kvm` group (and `sg kvm` for a shell
that predates the login) the same emulator boots in fifteen seconds and **the app
renders**: attached over the WebView's devtools socket (`webContentsDebuggingEnabled`,
set in the generated project only, not in the committed config), the page reports
`readyState complete`, the gallery's 53 cards and 53 language buttons, `Capacitor`
present with `getPlatform() === 'android'` and `isNativePlatform() === true`, no
console error, and a tap on Converse opens the board picker at
`https://localhost/conversation.html?target=am&source=en`. Screenshots taken through
the protocol match the browser's. Playwright cannot attach to an Android WebView
(`Browser.setDownloadBehavior` is refused), so the probe speaks the protocol
directly; `tmp/android-cdp.mjs` is that probe.

## Reproducible build, and what the emulator has shown since

`npm run android` (`scripts/build_android.sh`) is the committed build: bundle, add or
sync the project, assemble the debug APK. The gate's `publish` check keeps
`android/`, `ios/` and `dist/` out of the tracked tree. `npm run check:android`
(`scripts/check_android.mjs`) drives the emulator over adb and the WebView's devtools
socket and has shown, on Android 15 under KVM with Capacitor 8: a phrase written
through `Preferences` survives HOME + force-stop + relaunch and an in-place
`adb install -r`; a cold start with wifi and data off loads the gallery and the board
with the phrase on it; Save a copy opens the Android chooser through `deliver()`
(Filesystem + Share), and BACK on it returns to the app with no browser download
behind it. Emulator evidence, not a phone's.

## iOS, built on the Mac over SSH

The Ubuntu machine drives an M5 MacBook Air (`ssh mba`): Xcode 27.0 (27A266a), the
iOS 27.0 SDK and simulator runtime, Node 26 and npm 11 from Homebrew. CocoaPods 1.17
is installed but no longer needed, since Capacitor 8 builds with Swift Package
Manager. The Mac keeps its own checkout of the same commit (`~/repos/vetr-dev-site-ios`),
never the working copy, so what it builds is what was pushed.

`npm run ios` (`scripts/build_ios.sh`) is written for a non-interactive shell: it
names Homebrew's tools by path, runs under macOS's own bash 3.2, checks Xcode's
first-launch state, and fails loudly. `--run` boots the simulator, installs and
launches; the version is `package.json`'s and the build number the commit count, so
one commit always builds the same numbers. `npm run check:ios`
(`scripts/check_ios.mjs`) drives the running app three ways -- `simctl` for launch,
reinstall and screenshots; Meta's `idb` for real touches and typing, since a user
gesture is what the keyboard, speech and the share sheet require and the WebView's
content is not in the simulator's accessibility tree; and WebKit's remote inspector
through `ios_webkit_debug_proxy` for what the page reports -- and has shown, on an
iPhone 17 simulator:

| check | result |
|---|---|
| first launch from a clean install | 53 cards, `Capacitor.getPlatform()` is `ios` |
| offline start | all 81 requests of a fresh start answered from the app bundle, no service worker |
| safe areas | 62pt top and 34pt foot; header and board footer clear of both |
| persistence | a phrase written through `Preferences` survives terminate + launch and a reinstall over itself |
| speech | a touch on Speak fires `start` and `end`, 68 voices |
| keyboard | a touched field takes typing and stays visible above the keyboard; after ✓ the page is back at full height, unscrolled |
| backup | Save a copy writes the file and the system share sheet offers it (Copy, Save to Files) |
| cancellation | a touch outside the sheet: the plugin reports "Share canceled", no browser download behind it |
| PDF export | the 742 KB PDF reaches the same sheet (Preview, Markup, Print, Save to Files) |
| life cycle | a trip to another app stops a running beacon and does not reload the page |

**What the simulator found.** Every text field under 16px made iOS zoom the page on
focus and leave it zoomed after the keyboard went -- the board came back at 111%,
header off the top. The last rule in `style.css` now holds text fields at 16px or
more under a coarse pointer, and zoom itself stays enabled. It is true of Safari on
any iPhone, not only of the app.

Offline start is shown by recording requests rather than by switching the network
off, because the simulator shares the Mac's network and turning that off would cut
the SSH session the whole check runs over.

## Signing, a phone, and TestFlight

`TEAM_ID=... npm run ios -- --device` builds a signed debug app and installs and
launches it on a paired iPhone through `devicectl`; `TEAM_ID=... npm run ios -- --archive`
archives a release build and either uploads it to App Store Connect (when
`ASC_KEY_PATH`, `ASC_KEY_ID` and `ASC_ISSUER_ID` name an App Store Connect API key)
or exports the signed `.ipa` for Transporter. Both stop before building without a
team, and with one they stop where Xcode does: today at "No Accounts: Add a new
account in Accounts settings". What is left is the owner's:

1. **Sign in to Xcode** (Settings > Accounts > + > Apple ID) on the Mac. A free Apple
   ID gives a Personal Team, enough to put the app on your own iPhone for seven days
   at a time; TestFlight needs the paid **Apple Developer Program** membership.
2. **Settle the identity** before any upload: `dev.vetr.pocketlanguageguide` and the
   name "Phraselet" are provisional, and a bundle identifier is effectively permanent
   once an App Store Connect record exists. Then create that record (App Store
   Connect > Apps > +).
3. **Prepare the iPhone**: connect it by cable once, trust the Mac, and turn on
   Settings > Privacy & Security > Developer Mode; it can pair over Wi-Fi after that.
4. **Unlock signing over SSH**: codesign cannot use a locked login keychain from an
   SSH session, even with the owner logged in at the Mac. Either run the first signed
   build in Terminal on the Mac and allow codesign access to the key, or pass
   `KEYCHAIN_PASSWORD` for the script to unlock it.
5. **For headless uploads**, create an App Store Connect API key (Users and Access >
   Integrations, App Manager role) and keep the `.p8` on the Mac, outside the
   repository.
6. **Decide what the store sees**: an app icon (the build still carries Capacitor's
   placeholder), and the privacy answers -- the app collects nothing and sends
   nothing, which App Store Connect records as "Data Not Collected".

No administrator password is needed for any of this: Xcode's licence and first
launch are already done.

## Not done

- **Not yet on a real phone.** Both apps are verified on an emulator and a simulator,
  not on a device. The lamp is the clearest case: neither has a torch to reach, so
  whether the beacon's camera request lights one -- which it does in Safari on an
  iPhone -- is for a phone to answer, as are the share sheet's destinations and how
  speech actually sounds.
- **N2 delivery is wired, not device-proven.** Every export and the backup go
  through `deliver()` on a device; the emulator shows the chooser open and close.
  What a real Files app or mail client does with the URI is for a phone to say.
- **N5 and N6.** Repeatable builds are done (`npm run android`, `npm run ios`) and
  signing is wired to stop at the owner's steps above; icons, splash and store
  metadata are untouched, and need owner decisions before they mean anything.
