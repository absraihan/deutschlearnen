# Environment variables

Two `.env` files. They are **not** interchangeable.

| File | Read by | Secrets allowed |
|---|---|---|
| `.env` (repo root, or `apps/server/.env`) | the server, at runtime | ✅ yes — this is the only place API keys belong |
| `apps/mobile/.env` | the app, **inlined at build time** | ❌ never — anyone with the APK can read these |

Both are gitignored. `.env.example` files are committed.

---

## Server (`.env`)

Validated by Zod on boot (`apps/server/src/env.ts`). A bad value stops the server
with a readable message instead of failing on the learner's first sentence.

### Server

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `4000` | |
| `HOST` | `0.0.0.0` | Must be `0.0.0.0`, not `127.0.0.1`, for the phone to reach it |
| `LOG_LEVEL` | `info` | `fatal`…`trace` |
| `APP_NAME` | `DeutschLearnen` | Returned by `/health` |

### AI provider

| Variable | Default | Notes |
|---|---|---|
| `AI_PROVIDER` | `mock` | `openai` \| `anthropic` \| `gemini` \| `mock` |
| `GEMINI_API_KEY` | — | Required if `AI_PROVIDER=gemini`. **Free, no credit card:** https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-2.0-flash` | On the free tier. `gemini-2.5-flash` is stronger where the key has access |
| `GEMINI_BASE_URL` | — | For a proxy or a pinned API version |
| `OPENAI_API_KEY` | — | **required** if `AI_PROVIDER=openai`, `STT_PROVIDER=openai-whisper`, or `TTS_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4o-mini` | `gpt-4o` for stronger B2 argumentation |
| `OPENAI_BASE_URL` | — | For a compatible gateway |
| `ANTHROPIC_API_KEY` | — | Required if `AI_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | |
| `ANTHROPIC_BASE_URL` | — | |

`mock` is a rule-based offline provider — free, no key, deterministic, and it
genuinely corrects German. Start there.

Boot fails immediately if a provider is selected without its key.

### Speech

| Variable | Default | Notes |
|---|---|---|
| `STT_PROVIDER` | `none` | `openai-whisper` \| `none` |
| `STT_MODEL` | `whisper-1` | |
| `TTS_PROVIDER` | `none` | `openai` \| `none` |
| `TTS_MODEL` | `gpt-4o-mini-tts` | |
| `TTS_VOICE` | `alloy` | Default when the app does not pick one |

`none` is not a broken state: the app falls back to on-device recognition /
device voice and says so in Settings.

### Security

| Variable | Default | Notes |
|---|---|---|
| `API_TOKEN` | — | Shared secret. Empty = **open server**, logged as a warning at boot. Set it before the server is reachable on Wi-Fi. |
| `CORS_ORIGIN` | `*` | The app is not a browser; tighten only if you add a web client |

Generate a token:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### Limits and cost

| Variable | Default | Notes |
|---|---|---|
| `REQUEST_TIMEOUT_MS` | `45000` | Upstream timeout |
| `RATE_LIMIT_MAX` | `120` | Requests per window; `/health` exempt |
| `RATE_LIMIT_WINDOW` | `1 minute` | |
| `MAX_PROMPT_TOKENS` | `6000` | Cost guard. Exceeding it returns 413 with a German message telling the learner to start a new session. |

---

## Mobile (`apps/mobile/.env`)

Only `EXPO_PUBLIC_*` variables reach the app, and they are **compiled into the
bundle**. Treat every one as public.

| Variable | Example | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.23:4000` | Your computer's LAN IP. `localhost` is the *phone's* localhost and will not work. |
| `EXPO_PUBLIC_API_TOKEN` | `a1b2c3...` | Must equal the server's `API_TOKEN`. A shared secret for your own server, not a user credential. |
| `EXPO_PUBLIC_APP_NAME` | `DeutschLearnen` | Shown in the app |

Changes require a restart with cache cleared:

```bash
npm run start:clear -w @deutschlearnen/mobile
```

For an APK, set these as EAS secrets before building — see
[ANDROID_BUILD.md](ANDROID_BUILD.md).

---

## Two working configurations

**Free, with a real tutor** — Gemini's free tier, no card required:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=...            # https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-2.0-flash
STT_PROVIDER=none             # the phone does recognition on-device
TTS_PROVIDER=none             # the phone speaks, also free
```

This is the recommended starting point: real conversation, real corrections,
no bill. The free tier has per-minute and per-day request caps; hitting one
returns a German "wait a moment" message rather than an error screen.

**Free and offline** — verify the whole app without spending anything and
without any key at all:

```dotenv
AI_PROVIDER=mock
STT_PROVIDER=none
TTS_PROVIDER=none
```

Voice input is unavailable; use Text-Chat. Corrections still work — the rule
engine handles the A1–B2 examples from the spec.

**Full voice conversation** — the intended daily setup:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
STT_PROVIDER=openai-whisper
TTS_PROVIDER=none          # device voice is free and good
API_TOKEN=<generated>
```

Rough cost for a 20-minute daily session with `gpt-4o-mini` + Whisper: a few
cents a day. Device TTS keeps the output side free. Turning on `TTS_PROVIDER`
adds roughly $0.015 per 1000 characters spoken.

---

## Security rules

1. **Never** put an AI API key in `apps/mobile/.env`. `EXPO_PUBLIC_*` is public.
2. **Never** commit `.env`. Both are gitignored; `.env.example` is the template.
3. Set `API_TOKEN` before the server is reachable beyond localhost.
4. If you deploy the server, use the host's secret store rather than a `.env`
   file in the image.
5. Rotate a key by editing the server `.env` and restarting — the app never
   needs to change, because it never had the key.
