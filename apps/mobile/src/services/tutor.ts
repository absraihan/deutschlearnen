import {
  adjustDifficulty,
  deriveWeakAreas,
  explanationLanguagesFor,
  type CefrLevel,
  type ConversationSession,
  type LearnerContext,
  type SessionKind,
  type TurnMessage,
  type TutorTurn,
  type UserSettings,
} from '@deutschlearnen/shared';
import {
  memoryRepository,
  mistakeRepository,
  sessionRepository,
  vocabularyRepository,
} from '@/database/repositories';
import { api } from './api';

/**
 * The conversation engine, device side.
 *
 * One function does the whole turn: assemble a small learner context, call the
 * server, then persist the message, correction, mistake and vocabulary it
 * produced, and move the adaptive-difficulty state. Screens stay declarative -
 * they render state and call `submitTurn`.
 */

/**
 * Build the learner profile sent with every turn.
 *
 * Deliberately small (§44): the top few recurring mistakes, a slice of known
 * vocabulary and one summary line. Sending the whole database would cost money
 * on every turn and make the model worse, not better.
 */
export async function buildLearnerContext(
  settings: UserSettings,
): Promise<LearnerContext & { difficultyProgress: number }> {
  const [memory, mistakes, categoryTotals, knownWords] = await Promise.all([
    memoryRepository.get(settings.currentLevel),
    mistakeRepository.listActive(5),
    mistakeRepository.categoryTotals(),
    vocabularyRepository.knownWords(40),
  ]);

  const level = settings.adaptiveDifficulty ? memory.difficultyLevel : settings.currentLevel;

  return {
    level,
    targetLevel: settings.targetLevel,
    correctionMode: settings.correctionMode,
    explanationLanguages: explanationLanguagesFor(settings),
    frequentMistakes: mistakes.map((m) => ({
      category: m.category,
      wrongText: m.wrongText,
      correctText: m.correctText,
      count: m.count,
    })),
    knownVocabulary: knownWords,
    weakAreas: deriveWeakAreas(categoryTotals),
    longTermSummary: memory.longTermSummary,
    recentAccuracy: null,
    difficultyProgress: memory.difficultyProgress,
  };
}

export interface SubmitTurnInput {
  session: ConversationSession;
  settings: UserSettings;
  userText: string;
  /** Speech recogniser confidence, null for typed input. */
  confidence: number | null;
  /** Local audio file, kept only when the learner opted in. */
  audioUri?: string | null;
  history: TurnMessage[];
  runningSummary: string | null;
  roleplayId?: string | null;
  topic?: string | null;
  /** Extra instruction for the current session phase, e.g. warm-up. */
  phaseInstruction?: string | null;
}

export interface SubmitTurnResult {
  turn: TutorTurn;
  runningSummary: string | null;
  userMessageId: string;
  aiMessageId: string;
  /** True when this correction has been seen before. */
  isRepeatMistake: boolean;
  newLevel: CefrLevel | null;
}

export async function submitTurn(input: SubmitTurnInput): Promise<SubmitTurnResult> {
  const { session, settings } = input;
  const learner = await buildLearnerContext(settings);

  const userMessage = await sessionRepository.addMessage({
    sessionId: session.id,
    speaker: 'user',
    text: input.userText,
    audioUri: settings.saveAudioRecordings ? (input.audioUri ?? null) : null,
    confidence: input.confidence,
  });

  const response = await api.respond({
    sessionId: session.id,
    kind: session.kind,
    modeId: input.roleplayId ? 'roleplay' : session.modeId,
    roleplayId: input.roleplayId ?? null,
    topic: joinTopic(input.topic ?? session.topicId, input.phaseInstruction),
    history: input.history,
    runningSummary: input.runningSummary,
    userText: input.userText,
    sttConfidence: input.confidence,
    learner,
  });

  const turn = response.turn;

  const aiMessage = await sessionRepository.addMessage({
    sessionId: session.id,
    speaker: 'ai',
    text: turn.reply,
  });

  let isRepeatMistake = false;

  if (turn.correction?.hasError && turn.correction.corrected) {
    await sessionRepository.addCorrection({
      sessionId: session.id,
      messageId: userMessage.id,
      original: turn.correction.original || input.userText,
      corrected: turn.correction.corrected,
      explanation: turn.correction.explanation,
      explanationBn: turn.correction.explanationBn,
      explanationEn: turn.correction.explanationEn,
      category: turn.correction.category,
      severity: turn.correction.severity,
      naturalAlternative: turn.correction.naturalAlternative,
    });

    const mistake = await mistakeRepository.record({
      category: turn.correction.category,
      wrongText: turn.correction.original || input.userText,
      correctText: turn.correction.corrected,
      explanation: turn.correction.explanation,
      level: learner.level,
    });
    isRepeatMistake = mistake.count > 1;
  }

  for (const word of turn.vocabulary) {
    if (!word.german.trim()) continue;
    await vocabularyRepository.upsert({
      german: word.german,
      english: word.english,
      bangla: word.bangla,
      article: word.article,
      wordType: word.wordType,
      exampleSentence: word.example || turn.reply,
      exampleTranslation: word.exampleTranslation,
      level: word.level,
      category: word.category,
    });
  }

  let newLevel: CefrLevel | null = null;
  if (settings.adaptiveDifficulty && turn.turnAccuracy !== null) {
    const memory = await memoryRepository.get(learner.level);
    const next = adjustDifficulty(
      { level: memory.difficultyLevel, progress: memory.difficultyProgress },
      { accuracy: turn.turnAccuracy, turns: input.history.length + 1 },
    );
    await memoryRepository.setDifficulty(next.level, next.progress);
    if (next.level !== memory.difficultyLevel) newLevel = next.level;
  }

  return {
    turn,
    runningSummary: response.runningSummary,
    userMessageId: userMessage.id,
    aiMessageId: aiMessage.id,
    isRepeatMistake,
    newLevel,
  };
}

function joinTopic(topic: string | null, phaseInstruction?: string | null): string | null {
  if (!phaseInstruction) return topic;
  return topic ? `${topic}. ${phaseInstruction}` : phaseInstruction;
}

/** The opening line for a session. Local catalogue first, so it works offline. */
export async function fetchOpening(input: {
  modeId: string;
  level: CefrLevel;
  roleplayId?: string | null;
}): Promise<string> {
  const { getMode, getRoleplay } = await import('@deutschlearnen/shared');

  if (input.roleplayId) {
    const scenario = getRoleplay(input.roleplayId);
    if (scenario) return scenario.opening;
  }
  const mode = getMode(input.modeId);
  return mode?.openings[input.level] ?? 'Hallo! Schön, dass du da bist. Wie geht es dir heute?';
}

export interface SessionScorePayload {
  sessionId: string;
  level: CefrLevel;
  kind: SessionKind;
  topic: string | null;
  durationSec: number;
  messages: TurnMessage[];
  corrections: Array<{ category: string; original: string; corrected: string }>;
  explanationLanguages: string[];
  hasPronunciationData: boolean;
}
