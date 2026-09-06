# Testing

```bash
npm test                 # everything
npm run test:shared      # vitest  — learning model
npm run test:server      # vitest  — API + providers
npm run test:mobile      # jest    — utils, API client, components
npm run typecheck        # tsc across all three packages

npm run test:conversation            # real multi-turn German conversation
npm run test:conversation -- --level B2
```

Current state: **158 tests, all passing**, TypeScript clean, and the Android
bundle builds (`npx expo export --platform android`).

| Suite | Tests | Runner |
|---|---|---|
| `packages/shared` | 70 | Vitest |
| `apps/server` | 53 | Vitest |
| `apps/mobile` | 35 | Jest + jest-expo |

Nothing in the suite makes a network call or needs an API key: the server tests
run against `MockProvider` or a scripted provider, and the mobile tests mock
`fetch`.

---

## What is covered

### `packages/shared` — the learning model

**`cefr.test.ts`** — level ordering, that steps never leave A1–B2, cumulative
grammar, and the adaptive-difficulty algorithm: no movement on fewer than 3
turns, movement inside a band before promotion, promotion resetting low in the
new band, demotion being faster than promotion, and floors/caps at A1/B2.

The important one:

```ts
it('never jumps from A1 to B2 in one step even with a perfect run', ...)
```

**`json.test.ts`** — markdown fences, prose around the object, trailing commas,
smart quotes, schema violations, missing optional fields, and the German-specific
case: umlauts and ß surviving the whole parse pipeline intact.

**`prompts.test.ts`** — that the prompt always contains the conversation-first
rule and the JSON contract; that it forbids "your sentence is grammatically
correct"; that A1 and B2 get different behaviour blocks; that OFF/MINIMAL/
NORMAL/DETAILED differ; that Bangla and English are requested only when enabled;
that roleplay injects the character and keeps corrections out of the spoken
reply; that exam mode refuses to claim an official exam; that recurring mistakes
reach the tutor.

**`scoring.test.ts`** — umlaut-aware word counting, clean vs mistake-heavy
sessions, level-relative judging (short answers score well at A1 and poorly at
B2), pronunciation scored only when confidence exists, all scores bounded 0–100,
streaks (including "today is not over yet"), gap-filled weekly windows, weak-area
ranking, and conversation trimming.

**`sessions.test.ts`** — phase schedules with no gaps or overlap, the 10-minute
structure from the spec, the 7-day curriculum cycling, all 20 modes present with
an opening for every level they claim, debate hidden from beginners, and at least
one roleplay per level.

### `apps/server`

**`rules.test.ts`** — the correction examples from the specification, level by
level:

| Level | Input | Expected |
|---|---|---|
| A1 | `Ich möchte ein Kaffee.` | `Ich möchte einen Kaffee.` |
| A2 | `Ich habe gegangen.` | `Ich bin gegangen.` |
| A2 | `Gestern ich habe zum Markt gegangen.` | `Gestern bin ich zum Markt gegangen.` |
| B1 | `Gestern ich gehe zum Supermarkt.` | `Gestern gehe ich zum Supermarkt.` |
| B2 | `Ich finde, dass Homeoffice ist besser.` | `Ich finde, dass Homeoffice besser ist.` |

Plus: correct German is left alone, umlauts and ß survive correction, and every
rule ships a Bangla and an English explanation.

> The third row found a real bug. That sentence has **two** errors, and the rules
> originally returned `Gestern ich bin zum Markt gegangen.` — auxiliary fixed,
> word order still wrong. The rules now chain, so each one sees the previous
> one's output and the learner always gets a fully correct sentence back.

**`api.test.ts`** — the full request/response surface: schema-valid turns, no
lecture when there is no mistake, correction modes honoured, Bangla only when
requested, empty speech rejected with 400 before any model call, unknown CEFR
level rejected, the cost guard returning 413, deterministic openings, mistake
deduplication and ranking, pronunciation always labelled as an estimate,
`pronunciationScore` null without data, speech endpoints explaining themselves
when unconfigured, and auth (401 without the token, 200 with it, `/health` always
open).

**`provider.test.ts`** — everything that goes wrong:

- model wraps JSON in a fence → parsed, no retry
- model returns prose → one retry with the Zod issues, then success
- model fails twice → 502 with a German message
- JSON parses but breaks the schema → rejected
- network failure → 503, retryable, German message
- rate limit → 429 with wait-and-retry wording
- **an error containing an API key never reaches the response body**
- long conversations get summarised, and the turn call carries far fewer
  messages than the raw history
- summarisation itself failing still answers the learner
- low STT confidence warns the model; good confidence does not
- Whisper confidence estimation: null without segments, high for clear speech,
  low for unclear, always within 0–1

### `apps/mobile`

**`util.test.ts`** — id uniqueness, and `todayKey` using the **local** date, not
UTC (23:30 on the 6th must still be the 6th, or streaks break for anyone not on
UTC), German weekday labels, Heute/Gestern, duration formatting.

**`api.test.ts`** — every failure branch of the API client produces a German
`userMessage`: dropped connection, non-JSON error body, 4xx vs 5xx retryability,
server-supplied messages passed through untouched, and the shared token being
sent as `x-api-token`.

**`components.test.tsx`** — the correction card shows the corrected sentence and
category in German, hides Bangla/English when disabled, flags repeat mistakes,
renders nothing (not an empty card) when there is no error, and preserves
umlauts exactly. The mic button gives each of its five states a distinct
accessibility label and reports itself disabled while the tutor is thinking. The
message bubble warns on low recognition confidence and offers replay only for
tutor messages.

---

## Notable environment gotchas, already handled

**`instanceof` across module realms.** `packages/shared` ships CommonJS while the
server source is ESM under Vite, so a `ZodError` thrown by a shared schema is a
*different class object* from `import { ZodError } from 'zod'`. `instanceof`
silently returned false and every validation error became a 500. The error
handler now identifies errors by shape (`name` + `issues`), which is correct
regardless of bundling. Two tests cover it.

**Two copies of React under Jest.** npm hoists a second React to the workspace
root (Expo internals declare a `react: *` peer), so react-test-renderer loaded one
copy while components loaded another and every hook returned null. `overrides` in
the root `package.json` does not fix this on npm 11; `moduleNameMapper` in
`apps/mobile/jest.config.js` pins `react` to the single copy Expo installed.

**`render` is async in @testing-library/react-native v14.** Component tests must
`await render(...)` and use the queries it resolves to, not the global `screen`.

---

## The conversation test (`npm run test:conversation`)

Unit tests cannot tell you whether the tutor *behaves like a tutor* — that
depends on the model. This script boots the server with whatever `AI_PROVIDER`
is configured and holds a real multi-turn German conversation containing
deliberate learner mistakes, then reports what came back.

```
Provider  openai · gpt-4o-mini
Level     A2

────────────────────────────────────────────────────────────────────
Du     Gestern ich habe zum Markt gegangen.
Tutor  Fast! Besser: Gestern bin ich zum Markt gegangen. Was hast du gekauft?

  Korrektur  Gestern bin ich zum Markt gegangen.
  Bei "gehen" benutzen wir im Perfekt "sein".
  [auxiliary-verb · important]
  ✓ caught "bin ich zum Markt gegangen"
  1180 ms · 940 in / 88 out · accuracy 0.55 · level A2

Corrections caught  2/2
Tokens             3120 in / 290 out
Cost this run      ~$0.00064
```

Each scripted turn declares what the tutor **should** catch, so the run exits
non-zero if a known mistake slips through. Turns marked `expect: null` are
correct German — if the tutor "corrects" one of those, it is flagged as
`! corrected a sentence that was fine`, which is the failure mode that makes a
tutor exhausting to use.

`--level A1|A2|B1|B2` picks the script. Each level's turns target the grammar
that level is actually working on: accusative articles at A1, `sein`/`haben` in
the Perfekt at A2, `dass`-clause verb position at B1, and reported-speech word
order at B2.

Two implementation details worth knowing, both learned the hard way:

- **It binds a random free port**, not a fixed one. A fixed port meant a stray
  server from a previous run answered the health check and the script silently
  tested a stale build while reporting success.
- **It spawns `tsx` directly, not through `npx` with a shell.** On Windows a
  shell spawn puts `cmd.exe` between the script and node, so `kill()` reaps the
  wrapper and orphans the server.

---

## Manual test script

Automated tests cannot press a microphone. Run this on the phone after any change
to the speech pipeline:

| # | Step | Expected |
|---|---|---|
| 1 | Settings → Server card | "Verbunden", correct provider |
| 2 | Practice → A1 → Freies Gespräch | Tutor greets you in German and speaks it aloud |
| 3 | Press mic, say `Hallo, ich heiße Raihan.` | Transcript appears; reply continues the conversation; **no correction card** |
| 4 | Say `Gestern ich habe zum Markt gegangen.` | Correction card: `Gestern bin ich zum Markt gegangen.` |
| 5 | Say the same mistake again next session | Card shows "schon wieder" |
| 6 | Press mic and immediately stop | "Das war zu kurz..." — no API call |
| 7 | Turn off Wi-Fi, speak | "Keine Verbindung zum Tutor..." with a retry button; the app does not crash |
| 8 | End session | Score screen with four rings and a German summary |
| 9 | Offline, end a session | Score screen still appears, labelled as an estimate |
| 10 | Mistakes → "Fehler üben" | Drills built from your own mistakes |
| 11 | Answer a drill correctly 4× | Mistake moves to "Gemeistert" |
| 12 | Deny the microphone permission | Clear German message, no crash, Text-Chat still works |
| 13 | Settings → Delete all data | Confirmation, then dashboard shows empty states |
| 14 | Switch to dark/light mode | Every screen legible in both |

---

## Adding tests

Shared and server use Vitest (`tests/*.test.ts`); mobile uses Jest
(`__tests__/*.test.ts(x)`).

For a new server route, add a case to `api.test.ts` using the `makeApp()` helper,
which builds a real Fastify instance with `MockProvider` — no network, no keys.
To test a specific model response, use the `ScriptedProvider` pattern in
`provider.test.ts`.
