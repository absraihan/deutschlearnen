# Architecture

## The shape of the system

```
┌──────────────────────────────────────────┐
│  Android phone                           │
│  ┌────────────────────────────────────┐  │
│  │  apps/mobile  (Expo Router, TS)    │  │
│  │  screens → hooks → services        │  │
│  │                ↓                   │  │
│  │  SQLite: sessions, messages,       │  │
│  │  corrections, mistakes, vocabulary,│  │
│  │  progress, settings, learner memory│  │
│  └────────────────────────────────────┘  │
└───────────────────┬──────────────────────┘
                    │ HTTPS/HTTP + x-api-token
                    │ (small, bounded payloads)
┌───────────────────▼──────────────────────┐
│  apps/server  (Fastify, TS)              │
│  routes → services → providers           │
│  ┌────────────────┐  ┌────────────────┐  │
│  │  AIProvider    │  │ Speech provider│  │
│  │  OpenAI        │  │ Whisper STT    │  │
│  │  Anthropic     │  │ OpenAI TTS     │  │
│  │  Mock (offline)│  │ Null           │  │
│  └────────────────┘  └────────────────┘  │
│  Holds all API keys. Stores nothing.     │
└───────────────────┬──────────────────────┘
                    ▼
              AI provider API

        packages/shared is imported by BOTH sides
        (CEFR engine, modes, prompts, Zod schemas, scoring)
```

## Three principles

**1. The phone owns the data.** Every conversation, correction, word and score
lives in SQLite on the device. The server keeps nothing between requests. This
is what makes "Delete all data" a complete promise, and it means losing the
server loses no learning history.

**2. The server owns the secrets.** The mobile bundle is readable by anyone
holding the APK, so it never contains an AI key. It talks only to your server,
which is the sole holder.

**3. `packages/shared` owns the learning model.** The definition of what A1
means, which modes exist, how the tutor is prompted, how a session is scored —
all of it is in one package imported by both sides. The server cannot drift from
the app's idea of "B1", because there is only one.

---

## Package boundaries

### `packages/shared`

| Module | Responsibility |
|---|---|
| `types.ts` | Domain entities. No logic. |
| `cefr.ts` | Level profiles (topics, grammar, reply length, speech rate, correction threshold) and the adaptive-difficulty algorithm. |
| `modes.ts` | 20 conversation modes and 10 roleplay scenarios, with per-level openings and target vocabulary. |
| `prompts.ts` | The tutor system prompt, assembled from level + mode + correction mode + learner memory. |
| `schemas.ts` | Zod schemas for every AI output and every HTTP payload. |
| `scoring.ts` | Deterministic scoring, streaks, weak-area derivation. |
| `sessions.ts` | Timed session phase plans, the 7-day curriculum, exam tasks. |
| `context.ts` | History trimming and summarisation policy — the main cost lever. |
| `json.ts` | Tolerant model-output parsing plus schema validation. |
| `config.ts` | Branding, defaults, thresholds. |

It has exactly one dependency: `zod`. It is compiled to CommonJS `dist/`, which
both Metro and Node consume without any bundler configuration.

### `apps/server`

Stateless. Every route is: validate with a shared Zod schema → call a provider →
return. The only stateful-looking thing, `ConversationService`, is stateless
too — it receives the history and decides how much of it to forward.

### `apps/mobile`

```
app/                 Expo Router routes (screens only)
src/components/      UI kit, charts, conversation widgets
src/features/        useConversation — the conversation state machine
src/hooks/           useRecorder
src/services/        api client, tutor orchestration, speech (STT/TTS)
src/store/           Zustand settings mirror
src/database/        SQLite open/migrate + repositories
src/theme/           design tokens + provider
src/lib/             small helpers
```

Screens render and dispatch. All orchestration lives in `useConversation` and
`services/tutor.ts`, which is why the same tutor powers voice, text, daily
practice, roleplay and exam mode without duplicated logic.

---

## The AI abstraction

```
AIProvider
├── generateConversationResponse()
├── analyzeGrammar()
├── analyzePronunciation()
├── generateExercise()
├── generateVocabulary()
├── evaluateSpeakingSession()
├── generateListening()
├── generateShadowing()
└── summarizeContext()
```

Concrete providers implement `ChatBasedProvider`, which needs **one** method:

```ts
chat(messages: ChatMessage[], options?: ChatOptions): Promise<{ text, usage }>
```

Everything else — prompt assembly, JSON validation, retry-on-bad-JSON, degraded
fallbacks — is implemented once in `base.ts`. Adding a provider is one class plus
one `case` in `createAIProvider`.

`MockProvider` is the exception: it implements `AIProvider` directly with a
rule-based German checker (`providers/ai/rules.ts`), so the whole app runs
offline, free and deterministically. That is what the test suite runs against.

### Why the JSON contract matters

The tutor never returns prose to be parsed. It returns one object:

```json
{ "reply", "correction", "vocabulary", "difficulty",
  "followUpQuestion", "turnAccuracy", "needsRetry" }
```

validated by `TutorTurnSchema`. If it does not validate, `base.ts` retries once
with the Zod issues fed back to the model, and on a second failure returns a
typed error with a German message the UI shows directly. No screen ever tries to
find a correction inside free text.

---

## Cost control

A conversation grows without bound; the request must not.

1. **History trimming** (`context.ts`): the last 10 turns go verbatim, capped at
   3000 characters. Older turns collapse into one German summary line, and that
   summary is only regenerated when there are at least 4 turns worth folding —
   so a short conversation never pays for a summarisation call.
2. **Bounded learner memory**: at most 5 recurring mistakes, 40 known words, one
   summary line. Never the database.
3. **Local openings**: starting a session costs nothing — openings come from the
   mode catalogue on the device.
4. **A hard cost guard**: `MAX_PROMPT_TOKENS` rejects an oversized request with a
   413 and a German message telling the learner to start a fresh session.
5. **Deterministic scoring**: `computeHeuristicScores` runs locally, so a session
   summary is available even offline and the model's scores are sanity-bounded
   against it.

Net effect: request size is roughly constant no matter how long you talk.

---

## Adaptive difficulty

State is `{ level: CefrLevel, progress: 0..1 }` — a position *inside* a band.

- accuracy ≥ 0.85 → `progress += 0.12`
- accuracy ≤ 0.50 → `progress -= 0.18` (falling is faster than rising, so a
  struggling learner gets relief quickly)
- `progress ≥ 1` → promote one level, reset to 0.25
- `progress < 0` → demote one level, reset to 0.7
- fewer than 3 turns → do not move at all

One level per adjustment, always. A1 → B2 in a single session is structurally
impossible, and there is a test asserting exactly that.

`progress` also feeds `difficultyGuidance()`, so the tutor sits at the easy or
hard end of a band without the band changing — the learner feels a gradient, not
a staircase.

---

## Deliberate deviations from the brief

**NativeWind → typed design tokens.** A `theme/tokens.ts` with `useTheme()`
gives full dark mode, one place to change a colour, no Babel plugin, and no
Tailwind version drift. For a solo maintainer this is less to keep working.

**`packages/config` folded into `packages/shared`.** Two packages for a solo
project is overhead; separate modules inside one package give the same
separation with none of the wiring.

**`GET /api/progress` and `GET/POST /api/mistakes` are not CRUD.** The server is
stateless by design, so it cannot own learner records. `GET` endpoints return
reference data (level benchmarks, the mistake taxonomy) and `POST /api/mistakes`
analyses the payload the app sends and returns ranked mistakes plus drills.
Learner records are read and written by the device repositories. This is called
out in [API.md](API.md).

**Speech is two engines behind one interface.** Cloud STT (accurate, works in
Expo Go, gives confidence) is the default; on-device STT is optional and its
absence is reported honestly in Settings rather than shipping a dead toggle.

---

## Extension points

Built to be added later, deliberately not built now:

| Extension | Where it plugs in |
|---|---|
| Another AI provider | one class implementing `ChatBasedProvider` + a `case` in `createAIProvider` |
| Verified pronunciation scoring | `SpeechToTextProvider.supportsPronunciationScoring` already gates the UI wording |
| Postgres / Supabase sync | repositories in `src/database/repositories/` are the seam; each exports an object with a typed surface |
| Full spaced repetition | `vocabulary.review()` and the `dueAt` column already exist; replace `REVIEW_INTERVALS` |
| Live streaming voice | `useConversation` owns all state transitions; the mic states already model it |
| Image-based practice | `ConversationMode` already supports a `picture` mode framing |
| iOS | `app.json` carries the iOS keys; nothing in the code is Android-specific |
| Teacher dashboard / accounts | needs the sync seam above first |
