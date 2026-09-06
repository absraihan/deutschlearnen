import type {
  Exercise,
  ExerciseSet,
  GrammarAnalysis,
  ListeningItem,
  PronunciationAnalysis,
  RespondRequest,
  RespondResponse,
  SessionEvaluation,
  ShadowingSet,
  TranscribeResponse,
  VocabularySuggestion,
} from '@deutschlearnen/shared';

/**
 * The only way the app talks to the outside world.
 *
 * Every failure becomes an `ApiClientError` carrying a German message that is
 * safe to render, so no screen has to guess what to tell the learner when the
 * Wi-Fi drops mid-sentence.
 */

export class ApiClientError extends Error {
  readonly code: string;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(options: {
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
    status: number;
  }) {
    super(options.message);
    this.name = 'ApiClientError';
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

const OFFLINE_ERROR = () =>
  new ApiClientError({
    code: 'offline',
    message: 'Network request failed',
    userMessage:
      'Keine Verbindung zum Tutor. Prüfe dein Internet oder die Server-Adresse in den Einstellungen.',
    retryable: true,
    status: 0,
  });

function baseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
  return raw.replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  const token = process.env.EXPO_PUBLIC_API_TOKEN;
  return token ? { 'x-api-token': token } : {};
}

/** Default per-request timeout. Speech endpoints override it. */
const DEFAULT_TIMEOUT_MS = 45_000;

async function requestJson<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...authHeaders(),
        ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    if ((error as Error).name === 'AbortError') {
      throw new ApiClientError({
        code: 'timeout',
        message: 'Request timed out',
        userMessage: 'Der Tutor braucht zu lange. Bitte versuche es noch einmal.',
        retryable: true,
        status: 0,
      });
    }
    throw OFFLINE_ERROR();
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string; userMessage?: string; retryable?: boolean } } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // A non-JSON error body (proxy page, HTML error) is still an error.
    }
    throw new ApiClientError({
      code: payload.error?.code ?? `http_${response.status}`,
      message: payload.error?.message ?? `Server responded with ${response.status}`,
      userMessage:
        payload.error?.userMessage ?? 'Etwas ist schiefgelaufen. Bitte versuche es noch einmal.',
      retryable: payload.error?.retryable ?? response.status >= 500,
      status: response.status,
    });
  }

  return (await response.json()) as T;
}

export interface HealthResponse {
  status: string;
  appName: string;
  ai: { provider: string; model: string };
  stt: { provider: string };
  tts: { provider: string };
  authRequired: boolean;
}

export interface SpeechCapabilities {
  stt: {
    provider: string;
    available: boolean;
    supportsConfidence: boolean;
    supportsPronunciationScoring: boolean;
    locale: string;
    maxUtteranceMs: number;
  };
  tts: { provider: string; available: boolean };
}

export const api = {
  get baseUrl() {
    return baseUrl();
  },

  async health(): Promise<HealthResponse> {
    return requestJson<HealthResponse>('/health', { method: 'GET', timeoutMs: 8000 });
  },

  async capabilities(): Promise<SpeechCapabilities> {
    return requestJson<SpeechCapabilities>('/api/speech/capabilities', {
      method: 'GET',
      timeoutMs: 8000,
    });
  },

  async respond(body: RespondRequest): Promise<RespondResponse> {
    return requestJson<RespondResponse>('/api/conversation/respond', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async opening(params: {
    modeId: string;
    level: string;
    roleplayId?: string | null;
  }): Promise<{ opening: string; source: string }> {
    const query = new URLSearchParams({ modeId: params.modeId, level: params.level });
    if (params.roleplayId) query.set('roleplayId', params.roleplayId);
    return requestJson(`/api/conversation/opening?${query.toString()}`, {
      method: 'GET',
      timeoutMs: 8000,
    });
  },

  async analyze(body: {
    text: string;
    level: string;
    explanationLanguages: string[];
    context?: string | null;
  }): Promise<{ analysis: GrammarAnalysis }> {
    return requestJson('/api/conversation/analyze', { method: 'POST', body: JSON.stringify(body) });
  },

  async evaluatePronunciation(body: {
    transcript: string;
    targetText?: string | null;
    level: string;
    sttConfidence?: number | null;
    hasAudioScoring?: boolean;
  }): Promise<{ pronunciation: PronunciationAnalysis }> {
    return requestJson('/api/speaking/evaluate', { method: 'POST', body: JSON.stringify(body) });
  },

  async sessionSummary(body: unknown): Promise<{ evaluation: SessionEvaluation }> {
    return requestJson('/api/session/summary', { method: 'POST', body: JSON.stringify(body) });
  },

  async generateVocabulary(body: {
    level: string;
    topic: string;
    count: number;
    includeBangla: boolean;
    exclude: string[];
  }): Promise<{ items: VocabularySuggestion[] }> {
    return requestJson('/api/vocabulary/generate', { method: 'POST', body: JSON.stringify(body) });
  },

  async generateExercises(body: {
    level: string;
    count: number;
    mistakes: Array<{
      category: string;
      wrongText: string;
      correctText: string;
      explanation: string;
    }>;
    focusArea?: string | null;
    includeBangla?: boolean;
  }): Promise<ExerciseSet> {
    return requestJson('/api/exercises/generate', { method: 'POST', body: JSON.stringify(body) });
  },

  async generateListening(body: {
    level: string;
    topic: string;
    count: number;
  }): Promise<{ items: ListeningItem[] }> {
    return requestJson('/api/listening/generate', { method: 'POST', body: JSON.stringify(body) });
  },

  async generateShadowing(body: {
    level: string;
    topic: string;
    count: number;
    focusSounds?: string[];
  }): Promise<ShadowingSet> {
    return requestJson('/api/shadowing/generate', { method: 'POST', body: JSON.stringify(body) });
  },

  async analyzeMistakes(body: {
    level: string;
    mistakes: Array<{
      category: string;
      wrongText: string;
      correctText: string;
      explanation: string;
      count: number;
    }>;
    generateDrills?: boolean;
    drillCount?: number;
    includeBangla?: boolean;
  }): Promise<{
    ranked: Array<{ category: string; wrongText: string; correctText: string; count: number }>;
    weakAreas: string[];
    drills: ExerciseSet | null;
  }> {
    return requestJson('/api/mistakes', { method: 'POST', body: JSON.stringify(body) });
  },

  /** Upload a recording for server-side German transcription. */
  async transcribe(input: {
    uri: string;
    mimeType?: string;
    prompt?: string;
  }): Promise<TranscribeResponse> {
    const form = new FormData();
    // React Native accepts this shape for file uploads.
    form.append('file', {
      uri: input.uri,
      name: 'speech.m4a',
      type: input.mimeType ?? 'audio/m4a',
    } as unknown as Blob);
    if (input.prompt) form.append('prompt', input.prompt);

    return requestJson<TranscribeResponse>('/api/speech/transcribe', {
      method: 'POST',
      body: form,
      timeoutMs: 60_000,
    });
  },

  /** Server-side TTS. Returns the audio URL to play, or throws if not configured. */
  speakUrl(): string {
    return `${baseUrl()}/api/speech/speak`;
  },

  speakHeaders(): Record<string, string> {
    return { 'content-type': 'application/json', ...authHeaders() };
  },
};

export type { Exercise };
