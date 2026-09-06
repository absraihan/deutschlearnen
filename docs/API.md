# API

Base URL: `http://<your-lan-ip>:4000`

**Auth:** when `API_TOKEN` is set, every route except `/` and `/health` requires
`x-api-token: <token>` (or `Authorization: Bearer <token>`). Comparison is
constant-time.

**Errors:** every failure returns the same shape. `userMessage` is German and
safe to render directly.

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded",
    "userMessage": "Zu viele Anfragen. Warte einen Moment und sprich dann weiter.",
    "retryable": true
  }
}
```

| code | HTTP | Meaning |
|---|---|---|
| `invalid_request` | 400 | Payload failed Zod validation |
| `unauthorized` | 401 | Missing/invalid `x-api-token` |
| `not_found` | 404 | No such route |
| `context_too_large` | 413 | Prompt would exceed `MAX_PROMPT_TOKENS` |
| `rate_limited` | 429 | Too many requests |
| `invalid_ai_json` | 502 | Model returned unusable JSON twice |
| `auth_error` | 500 | The AI provider rejected the API key |
| `provider_unavailable` | 503 | Upstream 5xx |
| `network_error` | 503 | Could not reach the provider |
| `stt_not_configured` | 501 | `STT_PROVIDER=none` |
| `tts_not_configured` | 501 | `TTS_PROVIDER=none` |
| `no_audio` / `audio_too_short` | 400 | Bad recording upload |

Rate limit: `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW` (default 120/min).
`/health` is exempt.

---

## `GET /health`

Open even when auth is on, so the app can test reachability before it has a
token.

```json
{
  "status": "ok",
  "appName": "DeutschCoach AI",
  "ai":  { "provider": "openai", "model": "gpt-4o-mini" },
  "stt": { "provider": "openai-whisper" },
  "tts": { "provider": "none" },
  "authRequired": true,
  "time": "2026-09-06T09:12:00.000Z"
}
```

---

## `POST /api/conversation/respond`

The hot path. One turn of conversation.

```json
{
  "sessionId": "ses_abc123",
  "kind": "conversation",
  "modeId": "restaurant",
  "roleplayId": null,
  "topic": "im Restaurant bestellen",
  "history": [
    { "speaker": "ai",   "text": "Guten Abend! Was möchten Sie trinken?" },
    { "speaker": "user", "text": "Ich möchte ein Wasser." }
  ],
  "runningSummary": null,
  "userText": "Gestern ich habe zum Markt gegangen.",
  "sttConfidence": 0.88,
  "learner": {
    "level": "A2",
    "targetLevel": "B2",
    "correctionMode": "NORMAL",
    "explanationLanguages": ["de", "bn"],
    "frequentMistakes": [
      { "category": "auxiliary-verb", "wrongText": "Ich habe gegangen.",
        "correctText": "Ich bin gegangen.", "count": 7 }
    ],
    "knownVocabulary": ["Bahnhof", "einkaufen"],
    "weakAreas": ["Hilfsverb (sein/haben)"],
    "longTermSummary": "Der Lernende hat über seine Familie in Dhaka gesprochen.",
    "recentAccuracy": 0.72,
    "difficultyProgress": 0.5
  }
}
```

`history` is capped at 40 entries by the schema, and the server trims further:
the last 10 turns go verbatim, older ones are folded into `runningSummary`.

**Response**

```json
{
  "turn": {
    "reply": "Fast! Besser: Gestern bin ich zum Markt gegangen. Was hast du dort gekauft?",
    "correction": {
      "hasError": true,
      "original": "Gestern ich habe zum Markt gegangen.",
      "corrected": "Gestern bin ich zum Markt gegangen.",
      "explanation": "Bei \"gehen\" benutzen wir im Perfekt \"sein\".",
      "explanationBn": "\"gehen\" এর Perfekt-এ \"sein\" বসে।",
      "explanationEn": null,
      "category": "auxiliary-verb",
      "severity": "important",
      "naturalAlternative": null
    },
    "vocabulary": [],
    "difficulty": "A2",
    "followUpQuestion": "Was hast du dort gekauft?",
    "turnAccuracy": 0.55,
    "needsRetry": false
  },
  "runningSummary": null,
  "usage": { "promptTokens": 812, "completionTokens": 96, "cached": false }
}
```

- `correction` is `null` when nothing worth correcting was said. It is **always**
  `null` in `OFF` mode.
- `needsRetry: true` means the input was unusable; `reply` is then exactly
  `"Ich habe dich nicht ganz verstanden. Kannst du das bitte noch einmal sagen?"`
- `turnAccuracy` (0–1) drives adaptive difficulty on the device.
- `sttConfidence` below 0.55 makes the server warn the model that the transcript
  may be wrong, so it asks for a repeat instead of correcting noise.

**Correction categories:** `article`, `case`, `gender`, `verb-conjugation`,
`tense`, `auxiliary-verb`, `word-order`, `preposition`, `adjective-ending`,
`plural`, `negation`, `separable-verb`, `reflexive`, `subordinate-clause`,
`connector`, `vocabulary`, `spelling`, `pronunciation`, `unnatural-phrasing`,
`missing-word`, `other`.

---

## `GET /api/conversation/opening`

`?modeId=restaurant&level=A1` or `?roleplayId=cafe-order&level=A1`

Deterministic and local to the server's copy of the mode catalogue — no model
call, so starting a session is free.

```json
{ "opening": "Guten Tag! Was möchten Sie trinken?", "source": "mode" }
```

---

## `POST /api/conversation/analyze`

Deep analysis of one sentence, for the correction detail view.

```json
{ "text": "Ich finde, dass Homeoffice ist besser.", "level": "B2",
  "explanationLanguages": ["de"], "context": null }
```

```json
{
  "analysis": {
    "original": "Ich finde, dass Homeoffice ist besser.",
    "corrected": "Ich finde, dass Homeoffice besser ist.",
    "isCorrect": false,
    "issues": [{
      "category": "subordinate-clause",
      "excerpt": "dass Homeoffice ist besser",
      "explanation": "Im Nebensatz mit \"dass\" steht das konjugierte Verb am Ende.",
      "severity": "important"
    }],
    "naturalAlternatives": ["Meiner Meinung nach ist Homeoffice die bessere Lösung."],
    "score": 75
  }
}
```

The analysis is judged **against the learner's level** — it will not flag
structures they are not expected to know yet.

---

## `POST /api/speaking/evaluate`

Pronunciation feedback.

```json
{ "transcript": "Ich möchte über Bücher sprechen.", "targetText": null,
  "level": "A2", "sttConfidence": 0.8, "hasAudioScoring": false }
```

```json
{
  "pronunciation": {
    "method": "estimated-from-transcript",
    "score": 80,
    "confidenceNote": "Geschätztes Feedback auf Basis der Spracherkennung, keine gemessene Aussprachebewertung.",
    "difficultSounds": [
      { "sound": "ü", "word": "Bücher", "advice": "Sag \"i\" und runde dabei die Lippen wie bei \"u\"." }
    ],
    "rhythmAdvice": "Betone das wichtigste Wort im Satz etwas stärker.",
    "wordStressAdvice": null
  }
}
```

`method` is forced to `estimated-from-transcript` unless the configured STT
provider actually reports `supportsPronunciationScoring`. The server will not let
a model claim measured accuracy it cannot have.

---

## `POST /api/session/summary`

End-of-session evaluation.

```json
{ "sessionId": "ses_abc123", "level": "A1", "kind": "conversation",
  "topic": "Familie", "durationSec": 600,
  "messages": [{ "speaker": "ai", "text": "..." }],
  "corrections": [{ "category": "auxiliary-verb", "original": "...", "corrected": "..." }],
  "explanationLanguages": ["de"], "hasPronunciationData": false }
```

```json
{
  "evaluation": {
    "overallScore": 78, "grammarScore": 72, "vocabularyScore": 65,
    "fluencyScore": 80, "pronunciationScore": null,
    "summary": "Gut gemacht! Du hast flüssig über deine Familie gesprochen.",
    "strengths": ["Du hast durchgehend Deutsch gesprochen."],
    "focusAreas": ["Hilfsverb im Perfekt"],
    "longTermNote": "Thema: Familie. Niveau A1. Schwerpunkt: Perfekt mit sein.",
    "recommendedLevel": null
  }
}
```

Scores are judged relative to the level and **bounded against a deterministic
local heuristic**: if the model and the heuristic disagree by more than 20
points, the result is blended, so a hallucinated 98 on a session full of critical
errors cannot reach the learner. `pronunciationScore` is forced to `null` when
no pronunciation data was supplied.

---

## `POST /api/speech/transcribe`

`multipart/form-data`, field `file` (audio, ≤ 8 MB), optional field `prompt`
(German context that biases the recogniser towards German words).

```json
{ "text": "Gestern bin ich zum Markt gegangen.", "language": "de",
  "confidence": 0.91, "durationSec": 4.2 }
```

`confidence` is derived from Whisper's `avg_logprob` and `no_speech_prob`. It is
a genuine signal, not a calibrated score, and is only used to decide whether to
ask for a repeat.

---

## `POST /api/speech/speak`

```json
{ "text": "Guten Tag!", "voice": null, "speed": 0.9, "format": "mp3" }
```

Returns `audio/mpeg` bytes, or `501 tts_not_configured`. The app falls back to
the device voice on any failure.

---

## `GET /api/speech/capabilities`

What the pipeline can actually do, so the UI never promises more.

```json
{
  "stt": { "provider": "openai-whisper", "available": true,
           "supportsConfidence": true, "supportsPronunciationScoring": false,
           "locale": "de-DE", "maxUtteranceMs": 60000 },
  "tts": { "provider": "none", "available": false }
}
```

---

## `POST /api/vocabulary/generate`

```json
{ "level": "A2", "topic": "Reisen", "count": 8,
  "includeBangla": true, "exclude": ["Bahnhof"] }
```

```json
{ "items": [{ "german": "Verspätung", "english": "delay", "bangla": "বিলম্ব",
  "article": "die", "wordType": "Nomen",
  "example": "Der Zug hat zwanzig Minuten Verspätung.",
  "exampleTranslation": "The train is twenty minutes late.",
  "level": "A2", "category": "Reisen" }] }
```

---

## `POST /api/exercises/generate`

```json
{ "level": "A2", "count": 5,
  "mistakes": [{ "category": "auxiliary-verb", "wrongText": "Ich habe gegangen.",
    "correctText": "Ich bin gegangen.", "explanation": "Perfekt mit sein." }],
  "focusArea": "Hilfsverb (sein/haben)", "includeBangla": false }
```

```json
{ "intro": "Lass uns kurz deine häufigsten Fehler üben.",
  "exercises": [{ "type": "transform", "prompt": "Korrigiere den Satz: \"Ich habe gegangen.\"",
    "answer": "Ich bin gegangen.", "hint": "Bewegungsverb", "explanation": "...", "level": "A2" }] }
```

Types: `fill-blank` (prompt contains `___`), `reorder` (words separated by ` / `),
`transform`, `speak`.

---

## `POST /api/listening/generate` · `POST /api/shadowing/generate`

```json
{ "level": "B1", "topic": "Alltag", "count": 3 }
```
```json
{ "items": [{ "text": "...", "question": "...", "expectedAnswer": "...", "translationEn": null }] }
```

```json
{ "level": "A2", "topic": "Alltag", "count": 5, "focusSounds": ["ü", "ch"] }
```
```json
{ "sentences": [{ "text": "Gestern bin ich früh aufgestanden.",
  "focus": "ü in früh", "translationEn": null }] }
```

---

## Mistakes and progress — read this before integrating

The server is **stateless and stores no learner data** (see
[ARCHITECTURE.md](ARCHITECTURE.md)). These three endpoints therefore are not CRUD
over a server-side store:

### `POST /api/mistakes` — analysis, not storage

Send the mistakes the device already holds; get them deduplicated, ranked, and
optionally turned into drills. Nothing is persisted server-side.

```json
{ "level": "A2",
  "mistakes": [{ "category": "auxiliary-verb", "wrongText": "Ich habe gegangen.",
    "correctText": "Ich bin gegangen.", "explanation": "", "count": 3 }],
  "generateDrills": true, "drillCount": 5, "includeBangla": false }
```

```json
{ "ranked": [{ "category": "auxiliary-verb", "wrongText": "...", "correctText": "...", "count": 7 }],
  "weakAreas": ["Hilfsverb (sein/haben)"],
  "drills": { "intro": "...", "exercises": [] } }
```

Near-duplicates are merged on `(category, normalised correction)`, so
`"Ich habe gegangen."` and `"ich habe gegangen"` become one entry with a summed
count.

### `GET /api/mistakes` — the taxonomy

```json
{ "storage": "device-local",
  "note": "Learner mistake history is stored only on the device...",
  "categories": [{ "id": "word-order", "labelDe": "Satzstellung", "labelEn": "Word order" }] }
```

### `GET /api/progress` — level benchmarks

```json
{ "storage": "device-local",
  "levels": [{ "level": "A1", "label": "A1 - Beginner", "labelDe": "A1 - Anfänger",
    "expectedUserWords": { "min": 3, "max": 12 }, "topics": [], "grammar": [] }] }
```

The learner's own mistake and progress records are read and written by the device
repositories in `apps/mobile/src/database/repositories/`.
