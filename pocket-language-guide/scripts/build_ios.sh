#!/usr/bin/env bash
# Build the iOS app from a clean checkout, reproducibly, over SSH.
#
#   npm run ios                  # bundle, add/sync the project, build for the simulator
#   npm run ios -- --sync        # bundle and sync only (no xcodebuild)
#   npm run ios -- --run         # ...and boot a simulator, install and launch it
#   TEAM_ID=... npm run ios -- --device    # signed debug build, installed on a connected iPhone
#   TEAM_ID=... npm run ios -- --archive   # signed release archive for TestFlight
#
# The iOS project (`ios/`) is generated and gitignored for the same reason the Android
# one is: this site is published by `git push`, so a native project at the repository
# root would be served to the public web (docs/native.md). What is committed is this
# script and `capacitor.config.json`.
#
# SSH-safe: a non-interactive shell on the Mac has none of the login shell's PATH, so
# the tools are named by where Homebrew puts them, nothing prompts, and every step
# fails loudly. The simulator build is unsigned. The two signed modes need an Apple
# team and, over SSH, an unlocked login keychain -- see "Signing" in docs/native.md.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export LANG="${LANG:-en_US.UTF-8}"
export CI=1 HOMEBREW_NO_AUTO_UPDATE=1
for tool in node npm npx xcodebuild xcrun; do
  command -v "$tool" >/dev/null || { echo "missing $tool on PATH ($PATH)"; exit 1; }
done
xcodebuild -checkFirstLaunchStatus || { echo "Xcode's first-launch setup or licence is not done: run 'sudo xcodebuild -license accept' and 'xcodebuild -runFirstLaunch' once, as an admin"; exit 1; }

MODE="${1:-}"
if [ "$MODE" = "--device" ] || [ "$MODE" = "--archive" ]; then
  [ -n "${TEAM_ID:-}" ] || { echo "TEAM_ID is not set: signing needs the ten-character Apple team ID (Xcode > Settings > Accounts, or developer.apple.com > Membership)"; exit 1; }
fi
SIM="${SIM:-iPhone 17}"
DERIVED="${DERIVED:-build/ios}"
APP_ID="dev.vetr.pocketlanguageguide"
# The same commit always builds the same numbers: the version from package.json, the
# build number from the commit count -- which TestFlight needs to rise with every upload.
VERSION=$(node -p 'require("./package.json").version')
BUILD=$(git rev-list --count HEAD)

npm run mobile -- --quiet
# Capacitor 8's template is what makes this launch at all: it adopts the UIScene life
# cycle, which an app built with the iOS 27 SDK must, and targets iOS 15. Swift
# Package Manager rather than CocoaPods, named rather than defaulted, so the project
# is the same whichever tools the Mac happens to have.
[ -d ios ] || npx cap add ios --packagemanager SPM
# The beacon reaches the phone's lamp through the camera, as it does in Safari, and a
# WebView may ask for the camera only if the app says why. Nothing is recorded or shown.
plutil -replace NSCameraUsageDescription -string "Phraselet uses the camera's flash only to flash an SOS or a Morse message. Nothing is recorded or shown." ios/App/App/Info.plist
npx cap sync ios
if [ "$MODE" = "--sync" ]; then exit 0; fi

PROJECT=(-project ios/App/App.xcodeproj -scheme App)
NUMBERS=(MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD")

if [ "$MODE" = "--device" ] || [ "$MODE" = "--archive" ]; then
  # Over SSH the login keychain is locked to codesign even while the owner is logged
  # in at the Mac, which surfaces as errSecInternalComponent halfway through a build.
  if [ -n "${KEYCHAIN_PASSWORD:-}" ]; then
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$HOME/Library/Keychains/login.keychain-db"
  fi
  # App Store Connect API key, if given: lets xcodebuild create profiles and upload
  # without an Xcode account signed in, which is the only way that works headless.
  # (`AUTH` is never empty, because macOS's own bash 3.2 calls an empty array unbound.)
  AUTH=(-allowProvisioningUpdates)
  if [ -n "${ASC_KEY_PATH:-}" ]; then
    AUTH+=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
  fi
  SIGNING=(DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic "${AUTH[@]}")
fi

if [ "$MODE" = "--device" ]; then
  xcodebuild "${PROJECT[@]}" -configuration Debug -destination "generic/platform=iOS" \
    -derivedDataPath "$DERIVED" "${NUMBERS[@]}" "${SIGNING[@]}" -quiet build
  APP="$DERIVED/Build/Products/Debug-iphoneos/App.app"
  xcrun devicectl list devices --json-output "$DERIVED/devices.json" >/dev/null
  DEVICE=$(node -e '
    const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result.devices
      .find((d) => d.hardwareProperties?.platform === "iOS" && d.connectionProperties?.pairingState === "paired"
        && d.connectionProperties?.tunnelState !== "unavailable");
    console.log(d?.identifier ?? "");' "$DERIVED/devices.json")
  [ -n "$DEVICE" ] || { echo "built $APP, but no iPhone is paired and reachable (cable or same Wi-Fi, Developer Mode on)"; exit 1; }
  xcrun devicectl device install app --device "$DEVICE" "$APP"
  xcrun devicectl device process launch --device "$DEVICE" "$APP_ID"
  echo "launched $APP_ID $VERSION ($BUILD) on $DEVICE"
  exit 0
fi

if [ "$MODE" = "--archive" ]; then
  ARCHIVE="$DERIVED/Phraselet-$VERSION-$BUILD.xcarchive"
  xcodebuild "${PROJECT[@]}" -configuration Release -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE" "${NUMBERS[@]}" "${SIGNING[@]}" -quiet archive
  # Uploaded straight to App Store Connect when an API key is given; otherwise the
  # signed .ipa is exported for the owner to upload with Transporter.
  DESTINATION=$([ -n "${ASC_KEY_PATH:-}" ] && echo upload || echo export)
  cat > "$DERIVED/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$DESTINATION</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST
  xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$DERIVED/export" \
    -exportOptionsPlist "$DERIVED/ExportOptions.plist" "${AUTH[@]}"
  echo "archived $VERSION ($BUILD): $([ "$DESTINATION" = upload ] && echo 'uploaded to App Store Connect' || echo "$DERIVED/export")"
  exit 0
fi

xcodebuild "${PROJECT[@]}" -configuration Debug \
  -sdk iphonesimulator -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$DERIVED" "${NUMBERS[@]}" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  -quiet build
APP=$(find "$DERIVED/Build/Products" -maxdepth 2 -name 'App.app' -path '*iphonesimulator*' | head -1)
[ -n "$APP" ] || { echo "no App.app under $DERIVED"; exit 1; }
du -sh "$APP"

if [ "$MODE" = "--run" ]; then
  UDID=$(xcrun simctl list devices available -j | node -e '
    const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const all = Object.values(j.devices).flat();
    const d = all.find((d) => d.name === process.argv[1]) ?? all.find((d) => d.name.startsWith("iPhone"));
    if (!d) process.exit(1); console.log(d.udid);' "$SIM")
  xcrun simctl boot "$UDID" 2>/dev/null || true
  xcrun simctl bootstatus "$UDID" -b
  xcrun simctl install "$UDID" "$APP"
  xcrun simctl launch "$UDID" "$APP_ID"
  echo "launched $APP_ID $VERSION ($BUILD) on $SIM ($UDID)"
fi
