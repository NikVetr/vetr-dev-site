// Install the small tracked native plugin into Capacitor's generated projects.
import { readFile, writeFile, mkdir, copyFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {'android'|'ios'} platform @param {string} root */
export async function wireRecitation(platform, root) {
const config = JSON.parse(await readFile(join(root, 'capacitor.config.json'), 'utf8'));
if (config.appId !== 'dev.vetr.pocketlanguageguide') throw new Error('Update the recitation native package when changing appId');
if (platform === 'android') {
  const dir = join(root, 'android/app/src/main/java/dev/vetr/pocketlanguageguide');
  await mkdir(dir, { recursive: true });
  for (const name of ['RecitationPlan.java', 'RecitationService.java', 'BackgroundRecitationPlugin.java']) {
    await copyFile(join(root, 'native/recitation/android', name), join(dir, name));
  }
  const activity = join(dir, 'MainActivity.java');
  let text = await readFile(activity, 'utf8');
  if (!text.includes('registerPlugin(BackgroundRecitationPlugin.class)')) {
    if (!text.includes('public class MainActivity extends BridgeActivity {}')) throw new Error('MainActivity changed; register the background recitation plugin explicitly');
    text = text.replace('public class MainActivity extends BridgeActivity {}',
      'public class MainActivity extends BridgeActivity {\n    @Override public void onCreate(android.os.Bundle savedInstanceState) {\n'
      + '        registerPlugin(BackgroundRecitationPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}');
    await writeFile(activity, text);
  }
  const manifest = join(root, 'android/app/src/main/AndroidManifest.xml');
  let xml = await readFile(manifest, 'utf8');
  if (!xml.includes('android:name=".RecitationService"')) {
    xml = xml.replace('</application>', '    <service android:name=".RecitationService" android:exported="false" android:foregroundServiceType="mediaPlayback" android:stopWithTask="false" />\n    </application>');
  }
  for (const permission of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'WAKE_LOCK']) {
    if (!xml.includes(`android.permission.${permission}"`)) xml = xml.replace('</manifest>', `    <uses-permission android:name="android.permission.${permission}" />\n</manifest>`);
  }
  if (!xml.includes('android.intent.action.TTS_SERVICE')) {
    if (!xml.includes('<queries>')) xml = xml.replace('</manifest>', '    <queries></queries>\n</manifest>');
    xml = xml.replace('</queries>', '    <intent><action android:name="android.intent.action.TTS_SERVICE" /></intent>\n    </queries>');
  }
  await writeFile(manifest, xml);
} else if (platform === 'ios') {
  const dir = join(root, 'ios/App/App');
  for (const name of ['BackgroundRecitationPlugin.swift', 'RecitationViewController.swift']) {
    await copyFile(join(root, 'native/recitation/ios', name), join(dir, name));
  }
  const require = createRequire(import.meta.url);
  // xcode is the CLI's untyped build-time dependency, never application code.
  const xcodeModule = 'xcode';
  const project = require(xcodeModule).project(join(root, 'ios/App/App.xcodeproj/project.pbxproj'));
  project.parseSync();
  const group = project.findPBXGroupKey({ path: 'App' }) ?? project.findPBXGroupKey({ name: 'App' });
  if (!group) throw new Error('Xcode App source group was not found');
  const target = project.getFirstTarget().uuid;
  for (const name of ['BackgroundRecitationPlugin.swift', 'RecitationViewController.swift']) {
    if (!project.hasFile(name)) project.addSourceFile(name, { target }, group);
  }
  // node-xcode otherwise serializes an absent explicit type as the literal
  // `undefined`, overriding its correctly detected Swift file type in Xcode.
  for (const reference of Object.values(project.pbxFileReferenceSection())) {
    const file = /** @type {any} */ (reference);
    if (typeof file === 'object' && ['BackgroundRecitationPlugin.swift', 'RecitationViewController.swift'].includes(String(file.path).replaceAll('"', ''))
      && (file.explicitFileType === undefined || file.explicitFileType === 'undefined')) delete file.explicitFileType;
  }
  await writeFile(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), project.writeSync());
  const storyboard = join(dir, 'Base.lproj/Main.storyboard');
  let xml = await readFile(storyboard, 'utf8');
  if (!xml.includes('customClass="RecitationViewController"')) {
    if (!xml.includes('customClass="CAPBridgeViewController"')) throw new Error('Main storyboard changed; set its recitation bridge controller explicitly');
    xml = xml.replace('customClass="CAPBridgeViewController" customModule="Capacitor"',
      'customClass="RecitationViewController" customModule="App" customModuleProvider="target"');
    if (!xml.includes('customClass="RecitationViewController"')) throw new Error('Could not register the iOS recitation bridge controller');
    await writeFile(storyboard, xml);
  }
} else throw new Error('Choose android or ios');
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  await wireRecitation(/** @type {'android'|'ios'} */ (process.argv[2]), fileURLToPath(new URL('..', import.meta.url)));
}
