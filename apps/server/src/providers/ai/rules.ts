import type { MistakeCategory } from '@deutschcoach/shared';

/**
 * A small rule-based German checker.
 *
 * This is NOT a replacement for the model. It exists so the MockProvider is
 * genuinely useful - the app can be developed, demoed and tested end to end
 * with no API key and no network - and so the test suite has deterministic
 * German corrections to assert against.
 *
 * The rules cover the mistakes a Bangla/English speaker actually makes most
 * often in A1-B2 German.
 */

export interface RuleHit {
  corrected: string;
  explanation: string;
  explanationEn: string;
  explanationBn: string;
  category: MistakeCategory;
  severity: 'minor' | 'important' | 'critical';
  naturalAlternative: string | null;
}

/** Verbs of motion and change of state that form the Perfekt with sein. */
const SEIN_PERFEKT_PARTICIPLES = [
  'gegangen',
  'gefahren',
  'gekommen',
  'geflogen',
  'gelaufen',
  'gereist',
  'geblieben',
  'gewesen',
  'geworden',
  'aufgestanden',
  'eingeschlafen',
  'gestorben',
  'passiert',
  'umgezogen',
  'gewachsen',
];

const HABEN_FORMS: Record<string, string> = {
  habe: 'bin',
  hast: 'bist',
  hat: 'ist',
  haben: 'sind',
  habt: 'seid',
};

/** Masculine nouns whose accusative article learners routinely drop. */
const MASCULINE_NOUNS = [
  'Kaffee',
  'Tee',
  'Apfel',
  'Salat',
  'Kuchen',
  'Saft',
  'Wein',
  'Tisch',
  'Stuhl',
  'Termin',
  'Brief',
  'Hund',
  'Computer',
  'Film',
  'Bruder',
  'Vater',
  'Mann',
];

const TIME_ADVERBS = [
  'gestern',
  'heute',
  'morgen',
  'jetzt',
  'dann',
  'danach',
  'später',
  'vorgestern',
  'übermorgen',
  'manchmal',
  'oft',
  'immer',
];

const SUBJECT_PRONOUNS = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr'];

/** Finite verb forms that must move to the end of a dass/weil clause. */
const FINITE_VERBS = [
  'ist',
  'sind',
  'bin',
  'bist',
  'seid',
  'hat',
  'habe',
  'hast',
  'haben',
  'habt',
  'kann',
  'kannst',
  'können',
  'will',
  'willst',
  'wollen',
  'muss',
  'musst',
  'müssen',
  'macht',
  'mache',
  'machst',
  'geht',
  'gehe',
  'gehst',
  'findet',
  'finde',
  'wohnt',
  'wohne',
  'wohnst',
  'arbeitet',
  'arbeite',
  'arbeitest',
];

function preserveCase(original: string, replacement: string): string {
  if (original.length === 0) return replacement;
  const startsUpper = original[0] === original[0]?.toUpperCase();
  return startsUpper
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement.charAt(0).toLowerCase() + replacement.slice(1);
}

type Rule = (text: string) => RuleHit | null;

/** Ordered so that a fix never invalidates a later rule's assumptions. */
const RULES: Rule[] = [
  checkPerfektAuxiliary,
  checkVerbSecondAfterAdverb,
  checkDassVerbFinal,
  checkAccusativeArticle,
];

/**
 * Run every rule over one learner sentence, chaining the fixes.
 *
 * Chaining matters: "Gestern ich habe zum Markt gegangen." has two errors, and
 * fixing only the auxiliary would hand the learner "Gestern ich bin zum Markt
 * gegangen." - still wrong. Each rule sees the output of the previous one, so
 * the learner always gets a fully correct sentence back.
 */
export function checkGermanAll(input: string): RuleHit[] {
  const text = input.trim();
  if (!text) return [];

  const hits: RuleHit[] = [];
  let current = text;

  for (const rule of RULES) {
    const hit = rule(current);
    if (!hit || hit.corrected === current) continue;
    hits.push(hit);
    current = hit.corrected;
  }

  // Every hit reports the fully corrected sentence, not its own partial fix.
  return hits.map((hit) => ({ ...hit, corrected: current }));
}

/**
 * The single correction to show the learner: the first rule that fired, but
 * carrying the fully corrected sentence and every explanation that applies.
 */
export function checkGerman(input: string): RuleHit | null {
  const hits = checkGermanAll(input);
  if (hits.length === 0) return null;

  const primary = hits[0]!;
  if (hits.length === 1) return primary;

  return {
    ...primary,
    explanation: hits
      .slice(0, 2)
      .map((h) => h.explanation)
      .join(' '),
    explanationEn: hits
      .slice(0, 2)
      .map((h) => h.explanationEn)
      .join(' '),
    explanationBn: hits
      .slice(0, 2)
      .map((h) => h.explanationBn)
      .join(' '),
    severity: hits.some((h) => h.severity === 'critical') ? 'critical' : primary.severity,
  };
}

/** "Ich habe gegangen" -> "Ich bin gegangen". */
function checkPerfektAuxiliary(text: string): RuleHit | null {
  const participle = SEIN_PERFEKT_PARTICIPLES.find((p) =>
    new RegExp(`\\b${p}\\b`, 'i').test(text),
  );
  if (!participle) return null;

  const auxMatch = text.match(/\b(habe|hast|hat|haben|habt)\b/i);
  if (!auxMatch) return null;

  const aux = auxMatch[1]!;
  const replacement = HABEN_FORMS[aux.toLowerCase()];
  if (!replacement) return null;

  const corrected = text.replace(
    new RegExp(`\\b${aux}\\b`),
    preserveCase(aux, replacement),
  );

  return {
    corrected,
    explanation: `Verben der Bewegung wie "${participleToInfinitive(participle)}" bilden das Perfekt mit "sein", nicht mit "haben".`,
    explanationEn: `Verbs of motion like "${participleToInfinitive(participle)}" form the Perfekt with "sein", not "haben".`,
    explanationBn: `"${participleToInfinitive(participle)}" এর মতো গতিবাচক ক্রিয়ার Perfekt-এ "haben" নয়, "sein" বসে।`,
    category: 'auxiliary-verb',
    severity: 'important',
    naturalAlternative: null,
  };
}

function participleToInfinitive(participle: string): string {
  const map: Record<string, string> = {
    gegangen: 'gehen',
    gefahren: 'fahren',
    gekommen: 'kommen',
    geflogen: 'fliegen',
    gelaufen: 'laufen',
    gereist: 'reisen',
    geblieben: 'bleiben',
    gewesen: 'sein',
    geworden: 'werden',
    aufgestanden: 'aufstehen',
    eingeschlafen: 'einschlafen',
    gestorben: 'sterben',
    passiert: 'passieren',
    umgezogen: 'umziehen',
    gewachsen: 'wachsen',
  };
  return map[participle] ?? participle;
}

/** "Gestern ich gehe..." -> "Gestern gehe ich..." (verb second). */
function checkVerbSecondAfterAdverb(text: string): RuleHit | null {
  const match = text.match(/^(\s*)(\w+)\s+(\w+)\s+(\w+)/);
  if (!match) return null;

  const [, lead = '', first = '', second = '', third = ''] = match;
  if (!TIME_ADVERBS.includes(first.toLowerCase())) return null;
  if (!SUBJECT_PRONOUNS.includes(second.toLowerCase())) return null;

  // Third word must look like a finite verb for this to be a V2 violation.
  const looksFinite =
    FINITE_VERBS.includes(third.toLowerCase()) || /(?:e|st|t|en)$/i.test(third);
  if (!looksFinite) return null;

  const rest = text.slice(match[0].length);
  const corrected = `${lead}${first} ${third.toLowerCase()} ${second.toLowerCase()}${rest}`;

  return {
    corrected: capitalise(corrected),
    explanation:
      'Im deutschen Hauptsatz steht das Verb an Position 2. Nach einer Zeitangabe kommt zuerst das Verb, dann das Subjekt.',
    explanationEn:
      'In a German main clause the verb comes second. After a time expression, the verb comes before the subject.',
    explanationBn:
      'জার্মান মূল বাক্যে ক্রিয়া দ্বিতীয় স্থানে বসে। সময়সূচক শব্দের পরে আগে ক্রিয়া, তারপর কর্তা।',
    category: 'word-order',
    severity: 'important',
    naturalAlternative: null,
  };
}

/** "..., dass Homeoffice ist besser" -> "..., dass Homeoffice besser ist". */
function checkDassVerbFinal(text: string): RuleHit | null {
  const match = text.match(/\b(dass|weil|obwohl|wenn)\b\s+(.+)$/i);
  if (!match) return null;

  const conjunction = match[1]!;
  const clause = match[2]!.replace(/[.!?]+$/, '');
  const words = clause.split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;

  const verbIndex = words.findIndex((w) => FINITE_VERBS.includes(w.toLowerCase()));
  // Already final, or no finite verb found.
  if (verbIndex === -1 || verbIndex === words.length - 1) return null;

  const verb = words[verbIndex]!;
  const reordered = [...words.slice(0, verbIndex), ...words.slice(verbIndex + 1), verb];
  const punctuation = /[.!?]$/.test(text) ? text.slice(-1) : '';
  const corrected = `${text.slice(0, match.index)}${conjunction} ${reordered.join(' ')}${punctuation}`;

  return {
    corrected,
    explanation: `Im Nebensatz mit "${conjunction.toLowerCase()}" steht das konjugierte Verb am Ende.`,
    explanationEn: `In a subordinate clause with "${conjunction.toLowerCase()}" the conjugated verb goes to the end.`,
    explanationBn: `"${conjunction.toLowerCase()}" দিয়ে গঠিত অধীন বাক্যে ক্রিয়াটি বাক্যের শেষে বসে।`,
    category: 'subordinate-clause',
    severity: 'important',
    naturalAlternative: null,
  };
}

/** "Ich möchte ein Kaffee" -> "Ich möchte einen Kaffee". */
function checkAccusativeArticle(text: string): RuleHit | null {
  const pattern = new RegExp(
    `\\b(möchte|möchtest|nehme|nehmen|kaufe|kaufen|habe|haben|brauche|brauchen|bestelle|bestellen|trinke|trinken|esse|essen)\\b\\s+(ein)\\s+(${MASCULINE_NOUNS.join('|')})\\b`,
    'i',
  );
  const match = text.match(pattern);
  if (!match) return null;

  const corrected = text.replace(pattern, (_full, verb: string, _article: string, noun: string) =>
    `${verb} einen ${noun}`,
  );

  return {
    corrected,
    explanation: `"${match[3]}" ist maskulin. Im Akkusativ heißt es "einen ${match[3]}".`,
    explanationEn: `"${match[3]}" is masculine, so in the accusative it becomes "einen ${match[3]}".`,
    explanationBn: `"${match[3]}" পুংলিঙ্গ, তাই Akkusativ-এ এটি "einen ${match[3]}" হয়।`,
    category: 'case',
    severity: 'important',
    naturalAlternative: null,
  };
}

function capitalise(text: string): string {
  const trimmed = text.trimStart();
  const lead = text.slice(0, text.length - trimmed.length);
  return lead + trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
