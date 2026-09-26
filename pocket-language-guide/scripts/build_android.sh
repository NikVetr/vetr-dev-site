#!/usr/bin/env bash
# Build the Android app from a clean checkout, reproducibly.
#
#   npm run android               # bundle, add/sync the project, assemble the debug APK
#   npm run android -- --sync     # bundle and sync only (no Gradle)
#   npm run android -- --release  # a signed app bundle for Play, from the upload key in
#                                 # ANDROID_KEYSTORE, ANDROID_KEYSTORE_PASSWORD,
#                                 # ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD
#
# The Android project itself (`android/`) is generated and gitignored: this site is
# published by `git push` to GitHub Pages, so a native project at the repository root
# would be served to the public web (docs/native.md). What is committed is this
# script and `capacitor.config.json`, which together regenerate it. The toolchain is
# expected under ~/android-tools (a JDK 21 and an SDK with platform 35 and
# build-tools), or wherever JAVA_HOME / ANDROID_HOME already point.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--release" ]; then
  for v in ANDROID_KEYSTORE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
    [ -n "${!v:-}" ] || { echo "$v is not set: a Play release is signed with the owner's upload key (docs/native.md, \"An Android release\")"; exit 1; }
  done
fi

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
# The mark over the template's placeholders (scripts/build_app_icons.mjs draws them),
# and a launch screen that centres it rather than eleven stretched bitmaps: one
# drawable over the paper colour, dark when the phone is.
RES=android/app/src/main/res
cp -R assets/native/android/. "$RES/"
rm -f "$RES"/drawable*/splash.png
cat > "$RES/drawable/splash.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/launch_background" />
    <item android:gravity="center" android:width="144dp" android:height="144dp" android:drawable="@mipmap/ic_launcher_foreground" />
</layer-list>
XML
mkdir -p "$RES/values-night"
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="launch_background">#FFFFFF</color></resources>\n' > "$RES/values/launch_background.xml"
printf '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="launch_background">#14191E</color></resources>\n' > "$RES/values-night/launch_background.xml"
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
if [ "${1:-}" = "--release" ]; then
  # Gradle's injected signing, which is what Android Studio passes: nothing about the
  # key is written into the project, so nothing about it can be committed.
  VERSION=$(node -p 'require("./package.json").version')
  ( cd android && ./gradlew --quiet bundleRelease \
      -Pandroid.injected.signing.store.file="$ANDROID_KEYSTORE" \
      -Pandroid.injected.signing.store.password="$ANDROID_KEYSTORE_PASSWORD" \
      -Pandroid.injected.signing.key.alias="$ANDROID_KEY_ALIAS" \
      -Pandroid.injected.signing.key.password="$ANDROID_KEY_PASSWORD" \
      -Pandroid.injected.version.name="$VERSION" \
      -Pandroid.injected.version.code="$(git rev-list --count HEAD)" )
  ls -la android/app/build/outputs/bundle/release/app-release.aab
  exit 0
fi
( cd android && ./gradlew --quiet assembleDebug )
ls -la android/app/build/outputs/apk/debug/app-debug.apk
