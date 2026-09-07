# Android build

Three ways to get this onto your phone, from least to most setup.

> **Your machine right now has no JDK and no Android SDK.** Options 1 and 2 work
> as-is. Option 3 needs Android Studio installed first.

---

## Option 1 — Expo Go (daily development)

Nothing to build. Best for everyday use and iteration.

```bash
npm run dev:server          # terminal 1
npm run dev:mobile          # terminal 2
```

Scan the QR with the Expo Go app.

**Works:** everything except on-device speech recognition. Recording, server
transcription, device text-to-speech, SQLite, all screens.

**Limitation:** on-device STT (`expo-speech-recognition`) is a native module and
cannot exist in Expo Go. The app detects this and shows that option as
unavailable in Settings rather than offering a dead toggle. Server transcription
is the default and is more accurate on German anyway.

---

## Option 2 — EAS cloud build (installable APK, no Android Studio)

Expo builds it on their servers and hands you an APK. **This is the recommended
path for you** — no JDK, no SDK, no Gradle.

### One-time setup

One command per line — Windows PowerShell 5.1 does not accept `&&`.

```bash
npm install -g eas-cli
```
```bash
eas login
```
```bash
cd apps/mobile
```
```bash
eas init
```

`eas login` needs a free Expo account and can only be done by the account
holder; nothing else in the build is interactive.

`eas.json` is already in the repo with three profiles:

| Profile | Output | Use |
|---|---|---|
| `development` | dev-client APK | debugging with native modules |
| `preview` | **standalone APK** | installing on your own phone |
| `production` | AAB | Play Store (you do not need this) |

### Build the APK

```bash
cd apps/mobile
eas build --platform android --profile preview
```

Takes roughly 10–20 minutes. It prints a download URL and a QR code; open either
on your phone and install. Android will ask you to allow installation from that
source — that is expected for a sideloaded app.

### Important: bake in the server address

An APK is standalone; it will not read your local `.env` at runtime. Set the
values as EAS secrets **before** building:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value "http://192.168.1.23:4000"
eas secret:create --scope project --name EXPO_PUBLIC_API_TOKEN --value "<your token>"
```

If your computer's LAN IP changes (most home routers use DHCP), the APK stops
finding the server. Two fixes:

- **Static IP / DHCP reservation** for your computer in the router — simplest.
- **Deploy the server** somewhere with a stable address and point
  `EXPO_PUBLIC_API_URL` at it (see below).

### Build a dev client (for on-device speech recognition)

```bash
cd apps/mobile
npx expo install expo-speech-recognition
eas build --platform android --profile development
```

Install it, then run `npm run dev:mobile` and open the app — it connects to
Metro like Expo Go, but with your native modules included. On-device recognition
then appears as a selectable option in Settings.

---

## Option 3 — Local build

Only if you want to build without the cloud.

### Prerequisites

1. **JDK 17** — `winget install EclipseAdoptium.Temurin.17.JDK`
2. **Android Studio** — install, then in SDK Manager add:
   - Android SDK Platform 35
   - Android SDK Build-Tools 35
   - Android SDK Platform-Tools
3. Environment variables:

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Eclipse Adoptium\jdk-17...", "User")
```

Open a new terminal and verify:

```bash
java -version
adb --version
```

### Generate native projects and build

```bash
cd apps/mobile
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
```

The APK lands at:

```
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Install over USB (enable USB debugging on the phone first):

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

For a debug build with Metro attached:

```bash
cd apps/mobile
npx expo run:android
```

> `android/` is gitignored. It is generated output — `prebuild` recreates it from
> `app.json`, and editing it by hand means losing those edits on the next
> `prebuild --clean`.

### Signing

`assembleRelease` uses the debug keystore unless you configure one. That is fine
for a personal sideloaded app. For a real signing key:

```bash
keytool -genkeypair -v -keystore deutschlearnen.keystore \
  -alias deutschlearnen -keyalg RSA -keysize 2048 -validity 10000
```

Reference it from `android/gradle.properties`. **Never commit the keystore.**

---

## Keeping the server reachable

The APK needs to reach your server. In order of effort:

| Approach | Address stability | Notes |
|---|---|---|
| Laptop on the same Wi-Fi | breaks when the IP changes | fine at home; set a DHCP reservation |
| Tunnel (`ngrok http 4000`) | new URL per restart on the free tier | good for testing away from home |
| Small VPS / Fly.io / Railway | permanent | best long term; put your keys in the host's secret store, **not** in the repo |

If you deploy the server publicly, **set `API_TOKEN`**. Without it, anyone who
finds the URL can spend your AI budget.

---

## Release checklist

Before building an APK you intend to keep:

- [ ] `npm run typecheck` clean
- [ ] `npm test` green
- [ ] `npx expo export --platform android` bundles without errors
- [ ] Server `.env` has a real `AI_PROVIDER` and key (not `mock`)
- [ ] `API_TOKEN` set on both sides
- [ ] `EXPO_PUBLIC_API_URL` points at an address the phone can actually reach
- [ ] `expo.android.versionCode` bumped in `app.json` (Android refuses to install
      over a build with an equal or higher code)
- [ ] German TTS voice installed on the phone

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `SDK location not found` | `ANDROID_HOME` not set, or terminal opened before setting it |
| `Unsupported class file major version` | wrong JDK; must be 17 |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | a different signing key — uninstall the old app first |
| `INSTALL_FAILED_VERSION_DOWNGRADE` | bump `versionCode` in `app.json` |
| APK installs but cannot reach the server | `EXPO_PUBLIC_API_URL` was not set as an EAS secret at build time |
| Gradle out of memory | add `org.gradle.jvmargs=-Xmx4g` to `android/gradle.properties` |
| Metro cannot resolve a workspace package | `npx expo start --clear` |
| Build fails after adding a native module | `npx expo prebuild --clean`, then rebuild |
