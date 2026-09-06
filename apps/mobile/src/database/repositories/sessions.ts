import type {
  CefrLevel,
  ConversationMessage,
  ConversationSession,
  CorrectionRecord,
  SessionKind,
  Speaker,
} from '@deutschlearnen/shared';
import { getDatabase } from '../index';
import { createId, nowIso, toBool } from '@/lib/util';

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  level: string;
  topic_id: string;
  mode_id: string;
  kind: string;
  duration_sec: number;
  message_count: number;
  overall_score: number | null;
  grammar_score: number | null;
  fluency_score: number | null;
  vocabulary_score: number | null;
  pronunciation_score: number | null;
  summary: string | null;
  completed: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  speaker: string;
  text: string;
  created_at: string;
  audio_uri: string | null;
  corrected_text: string | null;
  confidence: number | null;
}

interface CorrectionRow {
  id: string;
  session_id: string;
  message_id: string;
  original: string;
  corrected: string;
  explanation: string;
  explanation_bn: string | null;
  explanation_en: string | null;
  category: string;
  severity: string;
  natural_alternative: string | null;
  created_at: string;
}

function toSession(row: SessionRow): ConversationSession {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    level: row.level as CefrLevel,
    topicId: row.topic_id,
    modeId: row.mode_id,
    kind: row.kind as SessionKind,
    durationSec: row.duration_sec,
    messageCount: row.message_count,
    overallScore: row.overall_score,
    grammarScore: row.grammar_score,
    fluencyScore: row.fluency_score,
    vocabularyScore: row.vocabulary_score,
    pronunciationScore: row.pronunciation_score,
    summary: row.summary,
    completed: toBool(row.completed),
  };
}

function toMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    speaker: row.speaker as Speaker,
    text: row.text,
    createdAt: row.created_at,
    audioUri: row.audio_uri,
    correctedText: row.corrected_text,
    confidence: row.confidence,
  };
}

function toCorrection(row: CorrectionRow): CorrectionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id,
    original: row.original,
    corrected: row.corrected,
    explanation: row.explanation,
    explanationBn: row.explanation_bn,
    explanationEn: row.explanation_en,
    category: row.category as CorrectionRecord['category'],
    severity: row.severity as CorrectionRecord['severity'],
    naturalAlternative: row.natural_alternative,
    createdAt: row.created_at,
  };
}

export interface CreateSessionInput {
  level: CefrLevel;
  topicId: string;
  modeId: string;
  kind: SessionKind;
}

export const sessionRepository = {
  async create(input: CreateSessionInput): Promise<ConversationSession> {
    const db = await getDatabase();
    const session: ConversationSession = {
      id: createId('ses'),
      startedAt: nowIso(),
      endedAt: null,
      level: input.level,
      topicId: input.topicId,
      modeId: input.modeId,
      kind: input.kind,
      durationSec: 0,
      messageCount: 0,
      overallScore: null,
      grammarScore: null,
      fluencyScore: null,
      vocabularyScore: null,
      pronunciationScore: null,
      summary: null,
      completed: false,
    };

    await db.runAsync(
      `INSERT INTO conversation_session
        (id, started_at, ended_at, level, topic_id, mode_id, kind, duration_sec, message_count, completed)
       VALUES (?, ?, NULL, ?, ?, ?, ?, 0, 0, 0);`,
      session.id,
      session.startedAt,
      session.level,
      session.topicId,
      session.modeId,
      session.kind,
    );
    return session;
  },

  async get(id: string): Promise<ConversationSession | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<SessionRow>(
      'SELECT * FROM conversation_session WHERE id = ?;',
      id,
    );
    return row ? toSession(row) : null;
  },

  async list(limit = 30): Promise<ConversationSession[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SessionRow>(
      'SELECT * FROM conversation_session ORDER BY started_at DESC LIMIT ?;',
      limit,
    );
    return rows.map(toSession);
  },

  async finish(
    id: string,
    input: {
      durationSec: number;
      overallScore: number | null;
      grammarScore: number | null;
      fluencyScore: number | null;
      vocabularyScore: number | null;
      pronunciationScore: number | null;
      summary: string | null;
    },
  ): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE conversation_session
         SET ended_at = ?, duration_sec = ?, overall_score = ?, grammar_score = ?,
             fluency_score = ?, vocabulary_score = ?, pronunciation_score = ?,
             summary = ?, completed = 1
       WHERE id = ?;`,
      nowIso(),
      Math.round(input.durationSec),
      input.overallScore,
      input.grammarScore,
      input.fluencyScore,
      input.vocabularyScore,
      input.pronunciationScore,
      input.summary,
      id,
    );
  },

  /** Delete a session that produced no learner speech, so history stays meaningful. */
  async discardIfEmpty(id: string): Promise<void> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM conversation_message WHERE session_id = ? AND speaker = 'user';",
      id,
    );
    if ((row?.n ?? 0) === 0) {
      await db.runAsync('DELETE FROM conversation_session WHERE id = ?;', id);
    }
  },

  async addMessage(input: {
    sessionId: string;
    speaker: Speaker;
    text: string;
    audioUri?: string | null;
    correctedText?: string | null;
    confidence?: number | null;
  }): Promise<ConversationMessage> {
    const db = await getDatabase();
    const message: ConversationMessage = {
      id: createId('msg'),
      sessionId: input.sessionId,
      speaker: input.speaker,
      text: input.text,
      createdAt: nowIso(),
      audioUri: input.audioUri ?? null,
      correctedText: input.correctedText ?? null,
      confidence: input.confidence ?? null,
    };

    await db.runAsync(
      `INSERT INTO conversation_message
        (id, session_id, speaker, text, created_at, audio_uri, corrected_text, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      message.id,
      message.sessionId,
      message.speaker,
      message.text,
      message.createdAt,
      message.audioUri,
      message.correctedText,
      message.confidence,
    );
    await db.runAsync(
      'UPDATE conversation_session SET message_count = message_count + 1 WHERE id = ?;',
      input.sessionId,
    );
    return message;
  },

  async listMessages(sessionId: string): Promise<ConversationMessage[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<MessageRow>(
      'SELECT * FROM conversation_message WHERE session_id = ? ORDER BY created_at ASC;',
      sessionId,
    );
    return rows.map(toMessage);
  },

  async addCorrection(input: {
    sessionId: string;
    messageId: string;
    original: string;
    corrected: string;
    explanation: string;
    explanationBn: string | null;
    explanationEn: string | null;
    category: CorrectionRecord['category'];
    severity: CorrectionRecord['severity'];
    naturalAlternative: string | null;
  }): Promise<CorrectionRecord> {
    const db = await getDatabase();
    const record: CorrectionRecord = {
      id: createId('cor'),
      createdAt: nowIso(),
      ...input,
    };
    await db.runAsync(
      `INSERT INTO correction
        (id, session_id, message_id, original, corrected, explanation, explanation_bn,
         explanation_en, category, severity, natural_alternative, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      record.id,
      record.sessionId,
      record.messageId,
      record.original,
      record.corrected,
      record.explanation,
      record.explanationBn,
      record.explanationEn,
      record.category,
      record.severity,
      record.naturalAlternative,
      record.createdAt,
    );
    return record;
  },

  async listCorrections(sessionId: string): Promise<CorrectionRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<CorrectionRow>(
      'SELECT * FROM correction WHERE session_id = ? ORDER BY created_at ASC;',
      sessionId,
    );
    return rows.map(toCorrection);
  },
};
