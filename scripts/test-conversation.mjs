/**
 * Real conversation smoke test.
 *
 * Boots the server with whatever AI_PROVIDER is configured, then holds a short
 * multi-turn German conversation containing deliberate, well-known learner
 * mistakes and prints what came back: the reply, the correction, and the token
 * cost. This is the check that the tutor actually behaves like a tutor -
 * something no unit test can assert, because it depends on the model.
 *
 *   node scripts/test-conversation.mjs
 *   node scripts/test-conversation.mjs --level B2
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Find a port nothing is listening on, so a stray server can never be mistaken for ours. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const levelArg = process.argv.indexOf('--level');
const LEVEL = levelArg !== -1 ? process.argv[levelArg + 1] : 'A2';

/**
 * Turns chosen to exercise the correction engine at each level. Each one is a
 * mistake a real learner makes, with the correction we expect to see.
 */
const SCRIPTS = {
  A1: [
    { say: 'Hallo. Ich heiße Raihan. Ich wohne in Dhaka.', expect: null },
    { say: 'Ich möchte ein Kaffee.', expect: 'einen Kaffee' },
    { say: 'Ich bin 29 Jahre alt und ich komme aus Bangladesch.', expect: null },
  ],
  A2: [
    { say: 'Hallo! Mir geht es gut, danke.', expect: null },
    { say: 'Gestern ich habe zum Markt gegangen.', expect: 'bin ich zum Markt gegangen' },
    { say: 'Ich habe Gemüse und Fisch gekauft.', expect: null },
    { say: 'Ich möchte ein Kaffee trinken.', expect: 'einen Kaffee' },
  ],
  B1: [
    { say: 'Ich arbeite als Ingenieur und ich mag meine Arbeit.', expect: null },
    { say: 'Ich denke, dass Homeoffice ist besser für die Konzentration.', expect: 'besser ist' },
    { say: 'Aber manchmal vermisse ich der Kontakt zu den Kollegen.', expect: 'den Kontakt' },
  ],
  B2: [
    {
      say: 'Meiner Meinung nach wird künstliche Intelligenz mehr Arbeitsplätze schaffen als vernichten.',
      expect: null,
    },
    { say: 'Ich finde, dass die Diskussion ist oft zu emotional.', expect: 'zu emotional ist' },
    {
      say: 'Wenn man die historischen Daten anschaut, sieht man dass jede Technologie hat neue Berufe geschaffen.',
      expect: 'geschaffen hat',
    },
  ],
};

const learner = {
  level: LEVEL,
  targetLevel: 'B2',
  correctionMode: 'NORMAL',
  explanationLanguages: ['de', 'bn'],
  frequentMistakes: [
    {
      category: 'auxiliary-verb',
      wrongText: 'Ich habe gegangen.',
      correctText: 'Ich bin gegangen.',
      count: 7,
    },
  ],
  knownVocabulary: ['der Markt', 'einkaufen'],
  weakAreas: ['Hilfsverb (sein/haben)'],
  longTermSummary: 'Der Lernende wohnt in Dhaka und spricht oft über Alltag und Arbeit.',
  recentAccuracy: 0.7,
  difficultyProgress: 0.5,
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

async function waitForServer(base, alive, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive()) return null; // the process died; stop waiting and show why
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return res.json();
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function main() {
  const script = SCRIPTS[LEVEL];
  if (!script) {
    console.error(`Unknown level "${LEVEL}". Use A1, A2, B1 or B2.`);
    process.exit(1);
  }

  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;

  // Spawn tsx directly rather than through `npx` with a shell. On Windows a
  // shell spawn puts cmd.exe between us and node, so kill() reaps the wrapper
  // and orphans the server - which then answers the *next* run's health check
  // and silently tests a stale build.
  const server = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'apps/server/src/index.ts'],
    {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), LOG_LEVEL: 'error' },
    },
  );

  let exited = false;
  server.on('exit', () => (exited = true));

  let serverOutput = '';
  server.stdout.on('data', (d) => (serverOutput += d));
  server.stderr.on('data', (d) => (serverOutput += d));

  /**
   * Stop the server and exit. Killing the child and calling process.exit in the
   * same tick makes libuv assert on Windows, so give the handle a moment to
   * close before leaving.
   */
  const stop = (code = 0) => {
    try {
      server.kill('SIGTERM');
    } catch {
      // already gone
    }
    setTimeout(() => process.exit(code), 250);
  };

  const health = await waitForServer(BASE, () => !exited);
  if (!health) {
    console.error(c.red('\nThe server did not start.\n'));

    // Surface the reason, not the stack trace: the env validator throws a
    // message that says exactly what is missing, and burying it under ten
    // frames of Node internals helps nobody.
    const lines = serverOutput.trim().split('\n');
    const reason = lines.filter((l) => /Error|required|Invalid|EADDRINUSE/i.test(l) && !/^\s+at /.test(l));

    if (reason.length) {
      console.error(reason.slice(0, 6).join('\n'));
      if (/OPENAI_API_KEY/.test(serverOutput)) {
        console.error(
          c.yellow(
            '\nAdd your key to .env and run this again:\n' +
              '  OPENAI_API_KEY=sk-...\n\n' +
              'Or set AI_PROVIDER=mock to test the offline rule engine instead.',
          ),
        );
      }
    } else {
      console.error(lines.slice(0, 15).join('\n'));
    }
    return stop(1);
  }

  console.log(
    `\n${c.bold('Provider')}  ${health.ai.provider} · ${health.ai.model}` +
      `\n${c.bold('Level')}     ${LEVEL}` +
      `\n${c.bold('Mode')}      Alltag, correction mode NORMAL, Bangla explanations on\n`,
  );

  if (health.ai.provider === 'mock') {
    console.log(
      c.yellow(
        'AI_PROVIDER is still "mock". This will exercise the offline rule engine,\n' +
          'not a real model. Set AI_PROVIDER=openai and OPENAI_API_KEY in .env.\n',
      ),
    );
  }

  const history = [];
  let runningSummary = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let matched = 0;
  let expected = 0;

  for (const [i, turn] of script.entries()) {
    console.log(c.dim('─'.repeat(72)));
    console.log(`${c.bold('Du')}     ${turn.say}`);

    const started = Date.now();
    let payload;
    try {
      const res = await fetch(`${BASE}/api/conversation/respond`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.API_TOKEN ? { 'x-api-token': process.env.API_TOKEN } : {}),
        },
        body: JSON.stringify({
          sessionId: 'smoke-test',
          kind: 'conversation',
          modeId: 'daily-life',
          topic: 'Alltag',
          history,
          runningSummary,
          userText: turn.say,
          sttConfidence: 0.92,
          learner,
        }),
      });
      payload = await res.json();
      if (!res.ok) {
        console.log(c.red(`\n  HTTP ${res.status}  ${payload?.error?.code}`));
        console.log(c.red(`  ${payload?.error?.message}`));
        console.log(`  ${c.dim('shown to the learner:')} ${payload?.error?.userMessage}\n`);
        return stop(1);
      }
    } catch (error) {
      console.log(c.red(`  request failed: ${error.message}`));
      return stop(1);
    }

    const ms = Date.now() - started;
    const { turn: t, usage } = payload;
    promptTokens += usage?.promptTokens ?? 0;
    completionTokens += usage?.completionTokens ?? 0;
    if (payload.runningSummary) runningSummary = payload.runningSummary;

    console.log(`${c.bold('Tutor')}  ${c.cyan(t.reply)}`);

    if (t.correction?.hasError) {
      console.log(`\n  ${c.yellow('Korrektur')}  ${t.correction.corrected}`);
      if (t.correction.explanation) console.log(`  ${c.dim(t.correction.explanation)}`);
      if (t.correction.explanationBn) console.log(`  ${c.dim(t.correction.explanationBn)}`);
      console.log(c.dim(`  [${t.correction.category} · ${t.correction.severity}]`));
    } else {
      console.log(c.dim('\n  (keine Korrektur)'));
    }

    // Did the tutor catch what it was supposed to catch?
    if (turn.expect) {
      expected += 1;
      const got = t.correction?.corrected ?? '';
      const hit = got.toLowerCase().includes(turn.expect.toLowerCase());
      if (hit) matched += 1;
      console.log(
        hit
          ? c.green(`  ✓ caught "${turn.expect}"`)
          : c.red(`  ✗ expected "${turn.expect}" — got "${got || 'no correction'}"`),
      );
    } else if (t.correction?.hasError) {
      console.log(c.yellow('  ! corrected a sentence that was fine'));
    } else {
      console.log(c.green('  ✓ correctly left alone'));
    }

    console.log(
      c.dim(
        `  ${ms} ms · ${usage?.promptTokens ?? '?'} in / ${usage?.completionTokens ?? '?'} out` +
          ` · accuracy ${t.turnAccuracy ?? '?'} · level ${t.difficulty}`,
      ),
    );

    history.push({ speaker: 'user', text: turn.say });
    history.push({ speaker: 'ai', text: t.reply });
    if (i < script.length - 1) console.log();
  }

  console.log(c.dim('─'.repeat(72)));

  // gpt-4o-mini list price at time of writing; adjust if you change model.
  const cost = (promptTokens / 1e6) * 0.15 + (completionTokens / 1e6) * 0.6;

  console.log(
    `\n${c.bold('Corrections caught')}  ${matched}/${expected}` +
      `\n${c.bold('Tokens')}             ${promptTokens} in / ${completionTokens} out` +
      `\n${c.bold('Cost this run')}      ~$${cost.toFixed(5)}` +
      `\n${c.bold('Per 20-min session')} ~$${(cost * (20 / script.length)).toFixed(4)} at this rate\n`,
  );

  if (runningSummary) console.log(`${c.bold('Running summary')}  ${c.dim(runningSummary)}\n`);

  stop(matched === expected ? 0 : 1);
}

main();
