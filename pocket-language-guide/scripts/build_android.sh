#!/usr/bin/env bash
# Build the Android debug APK from a clean checkout, reproducibly.
#
#   npm run android            # bundle, add/sync the project, assemble
#   npm run android -- --sync  # bundle and sync only (no Gradle)
#
# The Android project itself (`android/`) is generated and gitignored: this site is
# published by `git push` to GitHub Pages, so a native project at the repository root
# would be served to the public web (docs/native.md). What is committed is this
# script and `capacitor.config.json`, which together regenerate it. The toolchain is
# expected under ~/android-tools (a JDK 21 and an SDK with platform 35 and
# build-tools), or wherever JAVA_HOME / ANDROID_HOME already point.
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-$HOME/android-tools/jdk21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-tools/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
[ -x "$JAVA_HOME/bin/java" ] || { echo "no JDK at $JAVA_HOME"; exit 1; }
[ -d "$ANDROID_HOME/platforms" ] || { echo "no Android SDK at $ANDROID_HOME"; exit 1; }

npm run mobile -- --quiet
[ -d android ] || npx cap add android
# The beacon reaches the lamp through the camera, as it does in a browser, and a WebView
# may ask for the camera only if the app declares it. Optional hardware, so a device
# without a camera can still install the app.
node -e '
  const fs = require("fs"); const p = "android/app/src/main/AndroidManifest.xml";
  let m = fs.readFileSync(p, "utf8");
  if (!m.includes("android.permission.CAMERA")) {
    m = m.replace("</manifest>", "    <uses-permission android:name=\"android.permission.CAMERA\" />\n    <uses-feature android:name=\"android.hardware.camera\" android:required=\"false\" />\n</manifest>");
    fs.writeFileSync(p, m);
  }
'
npx cap sync android
# The devtools socket, for the emulator probe in docs/native.md. Debug builds only;
# it lives in the generated project, never in the committed config.
node -e '
  const fs = require("fs"); const p = "android/app/src/main/assets/capacitor.config.json";
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  c.android = { ...(c.android ?? {}), webContentsDebuggingEnabled: true };
  fs.writeFileSync(p, JSON.stringify(c, null, 2));
'
if [ "${1:-}" = "--sync" ]; then exit 0; fi
( cd android && ./gradlew --quiet assembleDebug )
ls -la android/app/build/outputs/apk/debug/app-debug.apk
