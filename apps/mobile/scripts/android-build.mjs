import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const unsigned = process.argv.includes('--unsigned');
const check = process.argv.includes('--check');
const verbose = process.argv.includes('--verbose');
// `--dev` starts `expo run:android` (debug build, install, Metro) instead of
// the release bundle. It shares the toolchain discovery below, so a laptop that
// builds the bundle also runs the development app. All other arguments, such as
// `--device`, are forwarded to Expo unchanged.
const dev = process.argv.includes('--dev');

// The Android Gradle Plugin (8.12) needs JDK 17 or newer. The upper bound is
// empirical: JDK 26 fails in Gradle's jlink step for android-36
// (JdkImageTransform), while the JDK 21 bundled with Android Studio works.
// Raise the limit after trying a newer JDK, not before.
const supportedJava = { min: 17, max: 21 };

const env = { ...process.env };
env.PREMIUMPASS_UNSIGNED_ANDROID = unsigned ? 'true' : 'false';
env.ANDROID_HOME ??= env.ANDROID_SDK_ROOT ?? defaultAndroidSdk();

// Android Studio's default SDK locations. Windows is not handled: this script
// already assumes a POSIX shell (`./gradlew`).
function defaultAndroidSdk() {
  const home = process.env.HOME ?? '';

  if (process.platform === 'darwin') {
    return resolve(home, 'Library/Android/sdk');
  }

  if (process.platform === 'linux') {
    return resolve(home, 'Android/Sdk');
  }

  return undefined;
}

// Every JDK ships a `release` file, so the version can be read without
// starting a JVM.
function javaMajorVersion(javaHome) {
  try {
    const release = readFileSync(`${javaHome}/release`, 'utf8');
    const version = /^JAVA_VERSION="(\d+)/m.exec(release);

    return version ? Number(version[1]) : undefined;
  } catch {
    return undefined;
  }
}

function isSupportedJava(javaHome) {
  const major = javaMajorVersion(javaHome);

  return (
    existsSync(`${javaHome}/bin/java`) &&
    major !== undefined &&
    major >= supportedJava.min &&
    major <= supportedJava.max
  );
}

// Ordered by preference. The first supported entry wins, so an explicit
// JAVA_HOME is respected, but a too-new one (for example Homebrew's current
// openjdk) no longer wins over the JDK that Android Studio bundles.
function javaHomeCandidates() {
  const home = process.env.HOME ?? '';
  const candidates = [
    process.env.JAVA_HOME,
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    `${home}/Applications/Android Studio.app/Contents/jbr/Contents/Home`,
    '/opt/android-studio/jbr',
    '/snap/android-studio/current/android-studio/jbr',
    `${home}/android-studio/jbr`,
  ];

  if (process.platform === 'darwin') {
    // System-wide JDKs (Temurin, Zulu, ...) register with java_home. The version
    // check above still decides whether the answer is usable.
    for (const version of [supportedJava.max, supportedJava.min]) {
      const result = spawnSync(
        '/usr/libexec/java_home',
        ['-v', String(version)],
        { encoding: 'utf8' },
      );

      if (result.status === 0) {
        candidates.push(result.stdout.trim());
      }
    }
  }

  return candidates.filter(Boolean);
}

const javaHome = javaHomeCandidates().find(isSupportedJava);
if (javaHome) {
  env.JAVA_HOME = javaHome;
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

if (!javaHome) {
  const configured = process.env.JAVA_HOME;
  const detail = configured
    ? ` JAVA_HOME (${configured}) is JDK ${javaMajorVersion(configured) ?? 'unknown'}.`
    : '';

  fail(
    `No supported JDK found: Gradle needs JDK ${supportedJava.min}-${supportedJava.max}.${detail} Install Android Studio, which bundles one, or set JAVA_HOME to such a JDK.`,
  );
}

console.info(`Using JDK ${javaMajorVersion(javaHome)} from ${javaHome}`);

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

if (dev) {
  const expoArguments = process.argv
    .slice(2)
    .filter((argument) => argument !== '--dev');
  const result = spawnSync(
    'pnpm',
    ['exec', 'expo', 'run:android', ...expoArguments],
    {
      env,
      stdio: 'inherit',
    },
  );

  // Metro keeps running after the install, so this call blocks until the
  // developer stops it. Ctrl+C is a normal way to end it, not a build failure.
  if (result.error) {
    fail(`Could not start Expo: ${result.error.message}`);
  }

  process.exit(result.status ?? 1);
}

if (!unsigned) {
  if (
    !env.ANDROID_PACKAGE_NAME ||
    env.ANDROID_PACKAGE_NAME.startsWith('com.example.') ||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(env.ANDROID_PACKAGE_NAME)
  ) {
    fail(
      'Set the final GOOGLE_PLAY_PACKAGE_NAME in config/.env (the app receives it as ANDROID_PACKAGE_NAME) before creating an upload bundle.',
    );
  }

  for (const name of [
    'ANDROID_UPLOAD_KEYSTORE_FILE',
    'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
    'ANDROID_UPLOAD_KEY_ALIAS',
    'ANDROID_UPLOAD_KEY_PASSWORD',
  ]) {
    if (!env[name]) {
      fail(`Set ${name} in config/.env before creating an upload bundle.`);
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
