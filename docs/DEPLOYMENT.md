# Deployment

Getting the app off your laptop, and what publishing to Play Store actually
requires.

These are two separate jobs of very different size. Do them in this order.

---

# Part 1 — Make the app independent of your laptop

Today the phone talks to `http://192.168.68.107:4000`, which only exists while
your laptop is on and on the same Wi-Fi. Deploying the server fixes that: a
permanent HTTPS address that works from anywhere, on mobile data too.

Nothing in the app changes except one URL.

## What you get for free

| Host | Free tier | Cold start | Notes |
|---|---|---|---|
| **Render** | 750 h/month | **~50 s after 15 min idle** | Simplest. `render.yaml` is in the repo. The cold start is felt on the first sentence. |
| **Fly.io** | small allowance | ~2–5 s | Keeps a machine warm-ish; better for a speaking app |
| **Google Cloud Run** | generous | ~1–3 s | Best latency of the three, but needs billing enabled even on free tier |
| **Railway** | $5 credit/month | ~2 s | Easy, but the credit runs out |

**Recommendation:** start on **Render** because it is the least setup and the
blueprint is already written. If the cold start annoys you, move to Fly.io or
Cloud Run — the Dockerfile works unchanged on all of them.

> The cold start only hits the *first* request after idle. Opening the app and
> letting the greeting load warms it before you speak.

## Deploy to Render

1. Push this repository to GitHub.
2. **render.com** → New → **Blueprint** → pick the repo. It reads `render.yaml`.
3. Render will ask for the two secrets marked `sync: false`:
   - `GEMINI_API_KEY` — your key
   - `API_TOKEN` — generate one:
     ```bash
     node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
     ```
4. Deploy. You get an address like `https://deutschlearnen-server.onrender.com`.
5. Check it:
   ```bash
   curl https://deutschlearnen-server.onrender.com/health
   ```

## Point the app at it

In `apps/mobile/eas.json`, set both values in each build profile's `env`:

```json
"env": {
  "EXPO_PUBLIC_API_URL": "https://deutschlearnen-server.onrender.com",
  "EXPO_PUBLIC_API_TOKEN": "<the same API_TOKEN>",
  "EXPO_PUBLIC_APP_NAME": "DeutschLearnen"
}
```

Then rebuild the APK once. After that the laptop is irrelevant.

## Turn cleartext HTTP back off

`android.usesCleartextTraffic` was enabled only because the local server was
plain HTTP. A deployed server is HTTPS, so remove it from
`apps/mobile/app.json` — it is an unnecessary weakening of the app:

```json
["expo-build-properties", { "android": {} }]
```

## Security once it is public

The server refuses to start with `NODE_ENV=production` and no `API_TOKEN`.
That is deliberate: an open server on the internet is somebody else spending
your Gemini quota.

`API_TOKEN` is a single shared secret compiled into the APK. That is right for
a personal app — it stops casual abuse. It is **not** enough for a public
release; see Part 2.

---

# Part 2 — Publishing to Play Store

Honest summary: the app is ready as software. Publishing is mostly paperwork
plus one real architectural decision.

## The architectural problem to solve first

Right now **every user's conversation would run on your Gemini key**. With a
public app that means:

- your free quota is consumed by strangers within hours
- one shared `API_TOKEN` inside the APK can be extracted by anyone
- you carry the cost of every user

You have to pick one before publishing:

| Approach | What it means |
|---|---|
| **Users bring their own key** ✅ **built** | Settings has a key field and a guided help screen. The key stays on the device and is sent per request. Turn it on with `ALLOW_SERVER_KEY_FALLBACK=false`. Free for you; costs the learner one visit to Google AI Studio. |
| **You pay, with accounts and limits** | Add sign-in and per-user rate limits. Real work: auth, a user store, quota tracking, and a bill that grows with installs. |
| **Paid app or subscription** | Covers the cost, but adds billing, refunds and store review scrutiny. |
| **Keep it private** | Do not publish. Install by APK on your own devices. Zero cost, zero obligations. |

For a personal learning tool, the last option is genuinely reasonable. If the
goal is to share it, "users bring their own key" is the cheapest honest path.

## Play Store checklist

**Account**
- Google Play Developer account, **one-time $25**
- Identity verification (takes a few days)

**Build**
- **AAB, not APK** — `eas build --platform android --profile production`, or
  `./gradlew bundleRelease`
- **A real upload keystore**, not the debug key the current APK uses:
  ```bash
  keytool -genkeypair -v -keystore upload.keystore -alias upload \
    -keyalg RSA -keysize 2048 -validity 10000
  ```
  **Back this file up.** Lose it and you can never update the app under the same
  listing. Never commit it.
- `versionCode` must increase with every upload
- Target SDK must meet Play's current minimum (the build already targets 36)

**Listing**
- App name, short and full description
- Icon 512×512, feature graphic 1024×500
- At least two phone screenshots
- Content rating questionnaire
- **Privacy policy at a public URL** — required, because the app requests the
  microphone

**Data safety form.** Answer it from what the app actually does:
- Microphone audio: used for speech recognition, **not stored** unless the
  learner enables "Sprachaufnahmen behalten"
- Conversations, vocabulary, mistakes, progress: **stored on the device only**
- Text sent to Google Gemini for processing — this must be disclosed
- No accounts, no advertising, no analytics, no tracking

That is an unusually clean data-safety answer, because the local-first design
means there is very little to declare.

**Likely review friction**
- "Exam practice" wording: the app already says it is not an official Goethe,
  telc or ÖSD exam. Keep that visible — implying an official exam invites
  rejection.
- Microphone permission must be justified in the listing; the app already
  explains it at the point of use, which helps.

## Suggested order

1. Deploy the server (Part 1) — useful immediately, needed for everything else
2. Use it yourself daily for a few weeks; let real use find the rough edges
3. Decide the cost model above — this is the real gate
4. Only then: keystore, AAB, listing, privacy policy, review

Steps 1 and 2 are worth doing regardless. Step 3 is a decision, not a task, and
it is the one that determines whether step 4 is worth it at all.
