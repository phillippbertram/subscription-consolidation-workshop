import { existsSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const unsigned = process.argv.includes('--unsigned');
const check = process.argv.includes('--check');
const verbose = process.argv.includes('--verbose');
const env = { ...process.env };
env.PREMIUMPASS_UNSIGNED_ANDROID = unsigned ? 'true' : 'false';
env.ANDROID_HOME ??=
  env.ANDROID_SDK_ROOT ??
  (process.platform === 'darwin'
    ? resolve(process.env.HOME ?? '', 'Library/Android/sdk')
    : undefined);
if (!env.JAVA_HOME && process.platform === 'darwin') {
  const studioJava =
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  if (existsSync(`${studioJava}/bin/java`)) {
    env.JAVA_HOME = studioJava;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (
  !env.ANDROID_HOME ||
  !existsSync(`${env.ANDROID_HOME}/platform-tools/adb`)
) {
  fail('Install the Android SDK/platform-tools and set ANDROID_HOME.');
}

if (!env.JAVA_HOME || !existsSync(`${env.JAVA_HOME}/bin/java`)) {
  fail('Set JAVA_HOME to the compatible JDK bundled with Android Studio.');
}

// These match the native defaults of the pinned Expo SDK. Check before Gradle
// starts downloading tools into an SDK directory the caller may not own.
for (const component of [
  'platforms/android-36/android.jar',
  'build-tools/36.0.0/source.properties',
  'ndk/27.1.12297006/source.properties',
  'cmake/3.22.1/source.properties',
]) {
  if (!existsSync(`${env.ANDROID_HOME}/${component}`)) {
    fail(
      `Install the Android SDK component ${component} with Android Studio SDK Manager.`,
    );
  }
}

if (check) {
  console.info(
    'Java and the required Android SDK/NDK/CMake components are available. Native compilation and signing are separate checks.',
  );
  process.exit(0);
}

if (!unsigned) {
  if (
    !env.ANDROID_PACKAGE_NAME ||
    env.ANDROID_PACKAGE_NAME.startsWith('com.example.') ||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(env.ANDROID_PACKAGE_NAME)
  ) {
    fail(
      'Set the final ANDROID_PACKAGE_NAME before creating an upload bundle.',
    );
  }

  for (const name of [
    'ANDROID_UPLOAD_KEYSTORE_FILE',
    'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
    'ANDROID_UPLOAD_KEY_ALIAS',
    'ANDROID_UPLOAD_KEY_PASSWORD',
  ]) {
    if (!env[name]) {
      fail(
        `Set ${name} in the ignored mobile environment before creating an upload bundle.`,
      );
    }
  }

  env.ANDROID_UPLOAD_KEYSTORE_FILE = resolve(env.ANDROID_UPLOAD_KEYSTORE_FILE);
  if (!existsSync(env.ANDROID_UPLOAD_KEYSTORE_FILE)) {
    fail('The configured Android upload keystore does not exist.');
  }
} else {
  env.PREMIUMPASS_UNSIGNED_ANDROID = 'true';
}

function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    fail('Android build failed. Inspect the native build diagnostics above.');
  }
}

run('pnpm', [
  'exec',
  'expo',
  'prebuild',
  '--platform',
  'android',
  '--no-install',
  '--no-clean',
]);
run(
  './gradlew',
  [
    'app:bundleRelease',
    '--console=plain',
    '--no-daemon',
    '--no-watch-fs',
    '--max-workers=2',
    '-Pkotlin.compiler.execution.strategy=in-process',
    ...(verbose ? ['--info'] : []),
  ],
  resolve('android'),
);
console.info(
  unsigned
    ? 'Unsigned local verification bundle created; it cannot be uploaded to Google Play.'
    : 'Signed internal-test upload bundle created; upload it manually to Play Console.',
);
console.info(
  'Output: apps/mobile/android/app/build/outputs/bundle/release/app-release.aab',
);
