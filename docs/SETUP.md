# Setup

From nothing to speaking German on your Android phone.

> **Windows PowerShell users:** every command below is one command per line on
> purpose. Windows PowerShell 5.1 does **not** support `&&` as a separator and
> will fail with *"The token '&&' is not a valid statement separator"*. Run the
> lines one at a time, or use `;` to chain them. `sed`, `grep` and `cat` are
> also absent from PowerShell — use Git Bash for those, or the PowerShell
> equivalents noted where they appear.

---

## 1. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 20+ (24 tested) | everything |
| npm | 10+ (11 tested) | everything |
| Git | any | version control |
| **Expo Go** app | latest | running on your phone without a build |
| Java JDK 17 + Android Studio | — | **only** for local APK builds. Not needed for daily use or for EAS cloud builds |

Check:

```bash
node -v
npm -v
git --version
```

---

## 2. Install

```bash
git clone <your-repo> deutschlearnen
cd deutschlearnen
npm install
npm run build:shared
```

`npm run build:shared` compiles `packages/shared` to `dist/`. **The server and
the app import the compiled output, so run this after every change to
`packages/shared`.** During active work on it, use:

```bash
npm run build:watch -w @deutschlearnen/shared
```

---

## 3. Configure the server

```bash
cp .env.example .env
```

Open `.env`. The minimum that works:

```dotenv
AI_PROVIDER=mock
PORT=4000
HOST=0.0.0.0
```

`mock` is a rule-based offline provider. It costs nothing, needs no key, and
genuinely corrects German — it will fix `Ich möchte ein Kaffee.` →
`Ich möchte einen Kaffee.` Use it to verify the microphone, the transcript and
the correction card before spending anything.

### Real conversation (OpenAI)

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

`gpt-4o-mini` is the right default here: fast enough for turn-taking and cheap
enough for a daily 20-minute habit. Use `gpt-4o` if you want stronger B2
argumentation.

### Real conversation (Anthropic)

```dotenv
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5
```

### Start it

```bash
npm run dev:server
```

It prints the addresses your phone can reach, for example:

```
Reachable from your phone at http://192.168.1.23:4000
AI provider: openai, STT: none, TTS: none
```

**Write down that IP address.** Verify from your phone's browser — opening
`http://192.168.1.23:4000/health` should return JSON.

If it does not:
- Phone and computer must be on the same Wi-Fi (not guest Wi-Fi, which usually
  blocks device-to-device traffic).
- Windows Firewall will likely prompt on first run — allow Node on **private**
  networks. To add the rule manually:
  ```powershell
  New-NetFirewallRule -DisplayName "DeutschLearnen dev server" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow -Profile Private
  ```

---

## 4. Configure the app

```bash
cd apps/mobile
cp .env.example .env
```

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.23:4000
EXPO_PUBLIC_API_TOKEN=
EXPO_PUBLIC_APP_NAME=DeutschLearnen
```

Use the IP the server printed. `localhost` will **not** work from a phone — that
is the phone's own localhost.

> `EXPO_PUBLIC_*` values are bundled into the app and are readable by anyone with
> the APK. Never put an AI API key here. The only thing that belongs in
> `EXPO_PUBLIC_API_TOKEN` is the shared secret for your own server.

Start Expo:

```bash
npm run dev:mobile
```

Scan the QR code with **Expo Go**. Changing `.env` requires a restart with
`npm run start:clear -w @deutschlearnen/mobile` — Expo inlines these at build time.

---

## 5. Speech setup

The app ships with a working default: **record → server transcribes → device
speaks**. Both halves work in Expo Go.

### Speech to text

| Engine | Setting | Works in Expo Go | Cost | Notes |
|---|---|---|---|---|
| **Server (Whisper)** | `STT_PROVIDER=openai-whisper` | ✅ | ~$0.006/min | Most accurate on German. Returns a confidence signal. **Recommended.** |
| **On-device** | `STT_PROVIDER=none` + `expo-speech-recognition` | ❌ needs a dev build | free | Instant and offline, but a native module. |
| Neither | `STT_PROVIDER=none` | — | free | Voice is unavailable; use Text-Chat. |

To enable server transcription:

```dotenv
STT_PROVIDER=openai-whisper
OPENAI_API_KEY=sk-...
```

Then in the app: Einstellungen → Spracherkennung → **Server (genauer)**.

To enable on-device recognition you need a development build:

```bash
cd apps/mobile
npx expo install expo-speech-recognition
npx expo run:android          # requires Android Studio + JDK 17
```

The app detects the module at runtime. Until it is present, Einstellungen shows
that option as "nicht verfügbar" rather than letting you pick a broken setting.

### Text to speech

| Engine | Setting | Works in Expo Go | Cost |
|---|---|---|---|
| **Device voice** | `ttsEngine: device` (default) | ✅ | free |
| Server voice | `TTS_PROVIDER=openai` + Einstellungen → Server | ✅ | ~$0.015/1k chars |

The device voice is genuinely good on modern Android. Check you have a German
voice installed: **Android Settings → System → Languages → Text-to-speech
output → Install voice data → Deutsch**. Test it in the app under
Einstellungen → "Stimme testen".

Server TTS falls back to the device voice automatically on any failure — the
tutor is never silent.

---

## 6. Secure the connection

Once the server is reachable on your Wi-Fi, anyone on that network can spend your
API budget. Set a shared token:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Put the value in **both** files:

```dotenv
# .env (server)
API_TOKEN=<the value>
```
```dotenv
# apps/mobile/.env
EXPO_PUBLIC_API_TOKEN=<the same value>
```

Restart both. `/health` stays open so the app can still test reachability.

---

## 7. First session

1. Open the app → **Einstellungen** → set your level (A1 if you are starting).
2. Check the Server card shows "Verbunden".
3. **Start** tab → "Sprechen starten".
4. Pick a level, a length and a topic.
5. Press the microphone, speak a German sentence, press it again.
6. You should see your transcript, a reply, and a correction if you made a
   mistake that matters.

Try `Gestern ich habe zum Markt gegangen.` — you should get back
`Gestern bin ich zum Markt gegangen.` with an explanation.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Nicht erreichbar" in Einstellungen | wrong IP, firewall, or different Wi-Fi | open `http://<ip>:4000/health` in the phone browser |
| "Die App ist nicht mit dem Server verbunden" | token mismatch | `API_TOKEN` and `EXPO_PUBLIC_API_TOKEN` must be identical |
| Mic does nothing | permission denied | Android Settings → Apps → Expo Go → Permissions → Microphone |
| "Die Spracherkennung auf dem Server ist nicht aktiv" | `STT_PROVIDER=none` | set `STT_PROVIDER=openai-whisper`, or use Text-Chat |
| Tutor is silent | no German TTS voice | install German voice data (see above) |
| `Cannot find module '@deutschlearnen/shared'` | shared not built | `npm run build:shared` |
| Changes to `.env` ignored | Expo inlines env at build | `npm run start:clear -w @deutschlearnen/mobile` |
| Metro cannot resolve a workspace package | stale cache | `npx expo start --clear` |

---

## Renaming the app

1. `APP_NAME` in `.env`
2. `EXPO_PUBLIC_APP_NAME` in `apps/mobile/.env`
3. `expo.name` and `expo.slug` in `apps/mobile/app.json`
4. `DEFAULT_APP_NAME` in `packages/shared/src/config.ts` (the fallback)

Changing `android.package` in `app.json` makes it a different app to Android and
will install alongside the old one rather than upgrading it.
