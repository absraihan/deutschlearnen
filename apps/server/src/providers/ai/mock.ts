import {
  computeHeuristicScores,
  getLevelProfile,
  getMode,
  getRoleplay,
  turnWordStats,
  type AnalyzeRequest,
  type EvaluateSpeakingRequest,
  type ExerciseSet,
  type GenerateExerciseRequest,
  type GenerateVocabularyRequest,
  type GrammarAnalysis,
  type ListeningItem,
  type ListeningRequest,
  type PronunciationAnalysis,
  type RespondRequest,
  type SessionEvaluation,
  type SessionSummaryRequest,
  type ShadowingRequest,
  type ShadowingSet,
  type TutorTurn,
  type VocabularySuggestion,
} from '@deutschlearnen/shared';
import { checkGerman } from './rules';
import { EMPTY_USAGE, type AIProvider, type AIResult } from './types';

/**
 * Offline provider.
 *
 * Deterministic, free and network-free. It powers the test suite and lets the
 * whole app be run end to end before any API key exists - so "does the mic
 * work, does the transcript render, does the correction card appear" can be
 * answered without spending a cent.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';
  readonly model = 'rule-based-offline';

  private wrap<T>(value: T): AIResult<T> {
    return { value, usage: EMPTY_USAGE };
  }

  async generateConversationResponse(request: RespondRequest): Promise<AIResult<TutorTurn>> {
    const level = request.learner.level;
    const text = request.userText.trim();

    if (text.length < 2) {
      return this.wrap({
        reply: 'Ich habe dich nicht ganz verstanden. Kannst du das bitte noch einmal sagen?',
        correction: null,
        vocabulary: [],
        difficulty: level,
        followUpQuestion: null,
        turnAccuracy: null,
        needsRetry: true,
      });
    }

    const hit = request.learner.correctionMode === 'OFF' ? null : checkGerman(text);
    const wantsBn = request.learner.explanationLanguages.includes('bn');
    const wantsEn = request.learner.explanationLanguages.includes('en');

    const roleplay = request.roleplayId ? getRoleplay(request.roleplayId) : undefined;
    const mode = getMode(request.modeId);
    const question = this.followUp(level, request.history.length, roleplay?.title ?? mode?.titleDe);

    const acknowledgement = hit
      ? request.learner.correctionMode === 'MINIMAL'
        ? ''
        : `Fast! Besser: ${hit.corrected} `
      : '';

    return this.wrap({
      reply: `${acknowledgement}${question}`.trim(),
      correction: hit
        ? {
            hasError: true,
            original: text,
            corrected: hit.corrected,
            explanation: request.learner.correctionMode === 'MINIMAL' ? '' : hit.explanation,
            explanationBn: wantsBn ? hit.explanationBn : null,
            explanationEn: wantsEn ? hit.explanationEn : null,
            category: hit.category,
            severity: hit.severity,
            naturalAlternative:
              request.learner.correctionMode === 'DETAILED' ? hit.naturalAlternative : null,
          }
        : null,
      vocabulary: [],
      difficulty: level,
      followUpQuestion: question,
      turnAccuracy: hit ? 0.55 : 0.9,
      needsRetry: false,
    });
  }

  private followUp(level: string, turnCount: number, topic?: string): string {
    const banks: Record<string, string[]> = {
      A1: [
        'Und was machst du gern am Wochenende?',
        'Wo wohnst du?',
        'Wie alt bist du?',
        'Was isst du gern?',
      ],
      A2: [
        'Und was hast du danach gemacht?',
        'Wie war das für dich?',
        'Machst du das oft?',
        'Was planst du für nächste Woche?',
      ],
      B1: [
        'Und warum ist das für dich wichtig?',
        'Wie würdest du das anders machen?',
        'Welche Erfahrung hast du damit gemacht?',
        'Was würdest du jemandem raten, der das auch versuchen will?',
      ],
      B2: [
        'Woran liegt das deiner Meinung nach?',
        'Welche Gegenargumente würdest du gelten lassen?',
        'Wie schätzt du die langfristigen Folgen ein?',
        'Inwiefern hat sich deine Sicht darauf verändert?',
      ],
    };
    const bank = banks[level] ?? banks.A1!;
    const base = bank[turnCount % bank.length]!;
    return topic && turnCount === 0 ? `${base}` : base;
  }

  async analyzeGrammar(request: AnalyzeRequest): Promise<AIResult<GrammarAnalysis>> {
    const hit = checkGerman(request.text);
    const wantsBn = request.explanationLanguages.includes('bn');
    const wantsEn = request.explanationLanguages.includes('en');

    if (!hit) {
      return this.wrap({
        original: request.text,
        corrected: request.text,
        isCorrect: true,
        issues: [],
        naturalAlternatives: [],
        score: 100,
      });
    }

    return this.wrap({
      original: request.text,
      corrected: hit.corrected,
      isCorrect: false,
      issues: [
        {
          category: hit.category,
          excerpt: request.text,
          explanation: hit.explanation,
          explanationBn: wantsBn ? hit.explanationBn : null,
          explanationEn: wantsEn ? hit.explanationEn : null,
          severity: hit.severity,
        },
      ],
      naturalAlternatives: hit.naturalAlternative ? [hit.naturalAlternative] : [],
      score: hit.severity === 'critical' ? 55 : 75,
    });
  }

  async analyzePronunciation(
    request: EvaluateSpeakingRequest,
  ): Promise<AIResult<PronunciationAnalysis>> {
    const sounds: PronunciationAnalysis['difficultSounds'] = [];
    const text = request.transcript.toLowerCase();

    if (/ü/.test(text)) {
      sounds.push({
        sound: 'ü',
        word: firstWordWith(request.transcript, 'ü'),
        advice: 'Sag "i" und runde dabei die Lippen wie bei "u".',
      });
    }
    if (/ö/.test(text)) {
      sounds.push({
        sound: 'ö',
        word: firstWordWith(request.transcript, 'ö'),
        advice: 'Sag "e" und runde dabei die Lippen.',
      });
    }
    if (/ch/.test(text)) {
      sounds.push({
        sound: 'ch',
        word: firstWordWith(request.transcript, 'ch'),
        advice: 'Nach i, e, ä, ö, ü ist "ch" weich wie in "ich", nach a, o, u hart wie in "ach".',
      });
    }
    if (/\br/.test(text)) {
      sounds.push({
        sound: 'r',
        word: firstWordWith(request.transcript, 'r'),
        advice: 'Das deutsche "r" am Wortanfang kommt hinten im Rachen, nicht mit der Zungenspitze.',
      });
    }

    return this.wrap({
      method: 'estimated-from-transcript',
      score:
        request.sttConfidence !== null ? Math.round(request.sttConfidence * 100) : null,
      confidenceNote:
        'Geschätztes Feedback auf Basis der Spracherkennung, keine gemessene Aussprachebewertung.',
      difficultSounds: sounds.slice(0, 3),
      rhythmAdvice: 'Betone das wichtigste Wort im Satz etwas stärker.',
      wordStressAdvice: null,
    });
  }

  async generateExercise(request: GenerateExerciseRequest): Promise<AIResult<ExerciseSet>> {
    const source = request.mistakes.length
      ? request.mistakes
      : [
          {
            category: 'auxiliary-verb' as const,
            wrongText: 'Ich habe gegangen.',
            correctText: 'Ich bin gegangen.',
            explanation: 'Perfekt mit sein.',
          },
        ];

    const exercises: ExerciseSet['exercises'] = [];
    for (let i = 0; i < request.count; i += 1) {
      const m = source[i % source.length]!;
      exercises.push({
        type: i % 2 === 0 ? 'transform' : 'speak',
        prompt:
          i % 2 === 0
            ? `Korrigiere den Satz: "${m.wrongText}"`
            : `Sag laut: "${m.correctText}"`,
        answer: m.correctText,
        hint: m.explanation || null,
        explanation: m.explanation || null,
        level: request.level,
      });
    }

    return this.wrap({
      intro: 'Lass uns kurz deine häufigsten Fehler üben.',
      exercises,
    });
  }

  async generateVocabulary(
    request: GenerateVocabularyRequest,
  ): Promise<AIResult<VocabularySuggestion[]>> {
    const seed: Array<Omit<VocabularySuggestion, 'level' | 'category'>> = [
      {
        german: 'Bahnhof',
        english: 'train station',
        bangla: 'রেলস্টেশন',
        article: 'der',
        wordType: 'Nomen',
        example: 'Der Bahnhof ist nicht weit von hier.',
        exampleTranslation: 'The train station is not far from here.',
      },
      {
        german: 'einkaufen',
        english: 'to shop',
        bangla: 'কেনাকাটা করা',
        article: null,
        wordType: 'Verb',
        example: 'Ich gehe am Samstag einkaufen.',
        exampleTranslation: 'I go shopping on Saturday.',
      },
      {
        german: 'Termin',
        english: 'appointment',
        bangla: 'সাক্ষাৎকারের সময়',
        article: 'der',
        wordType: 'Nomen',
        example: 'Ich habe morgen einen Termin beim Arzt.',
        exampleTranslation: 'I have a doctor appointment tomorrow.',
      },
      {
        german: 'gemütlich',
        english: 'cosy',
        bangla: 'আরামদায়ক',
        article: null,
        wordType: 'Adjektiv',
        example: 'Das Café ist sehr gemütlich.',
        exampleTranslation: 'The café is very cosy.',
      },
    ];

    const excluded = new Set(request.exclude.map((w) => w.toLowerCase()));
    const items: VocabularySuggestion[] = [];
    for (let i = 0; items.length < request.count && i < request.count * 4; i += 1) {
      const base = seed[i % seed.length]!;
      const german = i < seed.length ? base.german : `${base.german} (${i})`;
      if (excluded.has(german.toLowerCase())) continue;
      items.push({
        ...base,
        german,
        bangla: request.includeBangla ? base.bangla : null,
        level: request.level,
        category: request.topic,
      });
    }
    return this.wrap(items);
  }

  async evaluateSpeakingSession(
    request: SessionSummaryRequest,
  ): Promise<AIResult<SessionEvaluation>> {
    const userTurns = request.messages.filter((m) => m.speaker === 'user');
    const stats = userTurns.map((t) => {
      const s = turnWordStats(t.text);
      return {
        words: s.words,
        uniqueWords: s.uniqueWords,
        hadCorrection: false,
        severity: null,
        accuracy: null,
        sttConfidence: null,
      };
    });
    const scores = computeHeuristicScores(stats, request.level);
    const profile = getLevelProfile(request.level);

    return this.wrap({
      overallScore: scores.overallScore,
      grammarScore: scores.grammarScore,
      vocabularyScore: scores.vocabularyScore,
      fluencyScore: scores.fluencyScore,
      pronunciationScore: request.hasPronunciationData ? scores.pronunciationScore : null,
      summary: `Gut gemacht! Du hast ${userTurns.length} Mal gesprochen. Mach weiter so.`,
      summaryEn: `Well done. You spoke ${userTurns.length} times in this session.`,
      strengths: ['Du hast durchgehend Deutsch gesprochen.'],
      focusAreas: request.corrections.slice(0, 2).map((c) => c.category),
      longTermNote: `Thema: ${request.topic ?? 'frei'}. Niveau ${request.level}. Schwerpunkt: ${profile.grammar[0]}.`,
      recommendedLevel: null,
    });
  }

  async generateListening(request: ListeningRequest): Promise<AIResult<ListeningItem[]>> {
    const passages: Record<string, string> = {
      A1: 'Ich heiße Anna. Ich wohne in Köln. Ich arbeite in einem Café.',
      A2: 'Gestern bin ich mit dem Zug nach Hamburg gefahren. Der Zug hatte zwanzig Minuten Verspätung, aber ich habe meinen Termin trotzdem geschafft.',
      B1: 'Immer mehr Menschen arbeiten von zu Hause. Für viele ist das bequemer, weil sie den Weg zur Arbeit sparen. Andere vermissen aber den Kontakt zu den Kollegen.',
      B2: 'Die Debatte über künstliche Intelligenz am Arbeitsplatz wird zunehmend kontrovers geführt. Während Befürworter auf Effizienzgewinne verweisen, warnen Kritiker davor, dass ganze Berufsbilder verschwinden könnten.',
    };
    const text = passages[request.level] ?? passages.A1!;
    const items: ListeningItem[] = Array.from({ length: request.count }, (_, i) => ({
      text,
      question:
        i === 0
          ? 'Worum geht es in diesem Text?'
          : 'Was ist das wichtigste Detail, das du gehört hast?',
      expectedAnswer: 'Eine kurze Zusammenfassung des Textes in eigenen Worten.',
      translationEn: null,
    }));
    return this.wrap(items);
  }

  async generateShadowing(request: ShadowingRequest): Promise<AIResult<ShadowingSet>> {
    const bank: Record<string, Array<{ text: string; focus: string }>> = {
      A1: [
        { text: 'Ich möchte einen Kaffee, bitte.', focus: 'Vokal ö in möchte' },
        { text: 'Wie geht es dir heute?', focus: 'Satzmelodie in Fragen' },
        { text: 'Mein Bruder wohnt in München.', focus: 'ü in München' },
      ],
      A2: [
        { text: 'Gestern bin ich früh aufgestanden.', focus: 'ü in früh' },
        { text: 'Ich fahre jeden Tag mit dem Fahrrad zur Arbeit.', focus: 'r am Wortanfang' },
        { text: 'Können Sie mir bitte helfen?', focus: 'ö in können' },
      ],
      B1: [
        {
          text: 'Ich möchte morgen mit meiner Familie nach Berlin fahren.',
          focus: 'Rhythmus in längeren Sätzen',
        },
        {
          text: 'Obwohl es geregnet hat, sind wir spazieren gegangen.',
          focus: 'ch in obwohl und Betonung im Nebensatz',
        },
      ],
      B2: [
        {
          text: 'Meiner Ansicht nach überwiegen die Vorteile deutlich.',
          focus: 'Wortbetonung in überwiegen',
        },
        {
          text: 'Die gesellschaftlichen Auswirkungen lassen sich kaum abschätzen.',
          focus: 'sch und lange Komposita',
        },
      ],
    };
    const source = bank[request.level] ?? bank.A1!;
    const sentences = Array.from({ length: request.count }, (_, i) => {
      const s = source[i % source.length]!;
      return { text: s.text, focus: s.focus, translationEn: null };
    });
    return this.wrap({ sentences });
  }

  async summarizeContext(transcript: string): Promise<AIResult<string>> {
    const firstUserLine =
      transcript
        .split('\n')
        .find((l) => l.startsWith('Lernender:'))
        ?.replace('Lernender:', '')
        .trim() ?? '';
    return this.wrap(
      `Der Lernende hat über Folgendes gesprochen: ${firstUserLine.slice(0, 120)}`.trim(),
    );
  }
}

function firstWordWith(text: string, fragment: string): string {
  return (
    text.split(/\s+/).find((w) => w.toLowerCase().includes(fragment.toLowerCase())) ?? ''
  );
}
