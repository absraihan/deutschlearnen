# DeutschLearnen

A personal German speaking coach for Android. Open the app, press the microphone,
speak German, and have a real conversation with an AI tutor that corrects what
matters, remembers your mistakes, and gets harder as you get better — A1 to B2.

Built for one learner (you). Everything you say is stored on your phone; the
server is a stateless gateway that holds the API keys and nothing else.

> The product name is configurable: change `APP_NAME` in the server `.env`,
> `EXPO_PUBLIC_APP_NAME` in the mobile `.env`, and `expo.name` in
> `apps/mobile/app.json`.

---

## What it does

| | |
|---|---|
| 🎤 **Voice conversation** | Speak German, see your transcript, hear a spoken reply. Five clear mic states: idle, listening, processing, speaking, error. |
| ✅ **Correction engine** | Only the mistakes that matter, with a short reason in German (and Bangla/English if you want). Four correction levels: OFF / MINIMAL / NORMAL / DETAILED. |
| 📈 **Adaptive difficulty** | Tracks accuracy per turn and moves you inside and between CEFR bands — never more than one level at a time. |
| 🧠 **Mistake memory** | Every correction is stored, counted and fed back to the tutor. Repeat a mistake and it says so. Get it right four times and it retires. |
| 🎭 **20 modes + 10 roleplays** | Free talk, restaurant, doctor, job interview, debate, exam-style practice, and more — all level-aware. |
| 📚 **Vocabulary** | Words are collected from your own conversations, with German / English / বাংলা and a flashcard review schedule. |
| 🎧 **Listening & shadowing** | Comprehension at 0.75x / 1.0x / 1.25x, and repeat-after-me with a word-level comparison. |
| 📊 **Progress** | Speaking minutes, streak, four scores, weekly chart, recurring mistakes. |
| ⌨️ **Text mode** | The same tutor without the microphone. |

---

## Repository layout

```
deutschlearnen/
├── packages/shared/     CEFR engine, 20 modes, roleplays, prompts, Zod schemas,
│                        scoring, session plans, context trimming
├── apps/server/         Fastify + TypeScript. Holds every API key.
│                        AIProvider abstraction: OpenAI | Anthropic | Mock
├── apps/mobile/         Expo Router + TypeScript. SQLite, Zustand, TanStack Query
└── docs/                ARCHITECTURE, SETUP, API, DATABASE, AI_PROMPTS,
                         TESTING, ANDROID_BUILD, ENVIRONMENT, DEPLOYMENT
```

---

## Quick start (5 minutes, no API key)

The app runs end to end with a **rule-based offline provider**, so you can check
the microphone, the transcript and the correction card before spending a cent.

```bash
npm install
npm run build:shared
cp .env.example .env
npm run dev:server
```

In a second terminal:

```bash
cd apps/mobile
cp .env.example .env
```

Edit `apps/mobile/.env` and set `EXPO_PUBLIC_API_URL` to your computer's LAN IP
(the server prints it on boot, e.g. `http://192.168.1.23:4000`). Then:

```bash
npm run dev:mobile
```

Scan the QR code with **Expo Go** on your Android phone.

With `AI_PROVIDER=mock` the tutor uses a rule-based German checker — it will
correctly fix `Gestern ich habe zum Markt gegangen.` → `Gestern bin ich zum Markt
gegangen.` To get real conversation, set `AI_PROVIDER=openai` and an
`OPENAI_API_KEY` in the server `.env`.

Full instructions, including voice setup: **[docs/SETUP.md](docs/SETUP.md)**
Android APK: **[docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md)**
Running without your laptop, and Play Store: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

---

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install every workspace |
| `npm run build:shared` | Compile `packages/shared` (required before the server or app can import it) |
| `npm run dev:server` | Start the API on port 4000 and print your LAN address |
| `npm run dev:mobile` | Start Expo |
| `npm run typecheck` | TypeScript across all three packages |
| `npm test` | All test suites |

---

## Speech: what actually works where

| | Expo Go | Development build |
|---|---|---|
| Record audio → server transcription (Whisper) | ✅ | ✅ |
| On-device German recognition | ❌ (native module) | ✅ with `expo-speech-recognition` |
| Device text-to-speech (German voice) | ✅ | ✅ |
| Server text-to-speech | ✅ | ✅ |

The default is **cloud STT + device TTS**: works in Expo Go, accurate on German,
and free on the speaking side. See [docs/SETUP.md](docs/SETUP.md#speech-setup).

**On pronunciation scoring:** no speech API used here measures phonemes. All
pronunciation feedback is labelled `estimated-from-transcript` in the API and
shown in the UI as an estimate. The architecture has a
`supportsPronunciationScoring` flag ready for a provider that can do better.

---

## Privacy

- Conversations, mistakes, vocabulary and progress live **only in the SQLite
  database on your phone**.
- The server stores nothing — it forwards one request at a time to the model.
- Audio recordings are deleted after transcription unless you turn on
  "Sprachaufnahmen behalten" in Settings.
- Settings → Datenschutz can delete conversation history, vocabulary, mistakes,
  or everything, each behind a confirmation.

---

## Status

Working today: everything in the MVP definition — level and topic selection,
voice conversation with German STT/TTS, corrections, session scores, mistake
tracking and drills, vocabulary with flashcards, progress over time, daily
practice, roleplay, listening, shadowing, exam-style practice, text mode.

Deliberately left as extension points (not built): cloud sync, user accounts,
iOS release, verified pronunciation scoring, image-based practice, PDF import,
a full SRS algorithm, teacher dashboard. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#extension-points).
