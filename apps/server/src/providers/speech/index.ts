import { request } from 'undici';
import type { TranscribeResponse } from '@deutschlearnen/shared';
import type { Env } from '../../env';
import { AIProviderError } from '../ai/types';

/**
 * Speech providers.
 *
 * Kept behind the same style of abstraction as the AI provider: the routes only
 * know `SpeechToTextProvider` and `TextToSpeechProvider`, so swapping Whisper
 * for a different STT, or adding a provider with real pronunciation scoring,
 * touches one file.
 */

export interface TranscribeInput {
  audio: Buffer;
  filename: string;
  mimeType: string;
  /** BCP-47 language hint, always de-DE for this app. */
  language: string;
  /** Optional German prompt to bias the recogniser towards expected words. */
  prompt?: string;
}

export interface SpeechToTextProvider {
  readonly name: string;
  /** True when the provider can return real per-word confidence. */
  readonly supportsConfidence: boolean;
  /** True when the provider can score pronunciation from the audio itself. */
  readonly supportsPronunciationScoring: boolean;
  transcribe(input: TranscribeInput): Promise<TranscribeResponse>;
}

export interface SynthesizeInput {
  text: string;
  voice: string | null;
  speed: number;
}

export interface TextToSpeechProvider {
  readonly name: string;
  synthesize(input: SynthesizeInput): Promise<{ audio: Buffer; contentType: string }>;
}

/* ------------------------------------------------------------------ *
 * OpenAI Whisper
 * ------------------------------------------------------------------ */

export class WhisperSTTProvider implements SpeechToTextProvider {
  readonly name = 'openai-whisper';
  /**
   * Whisper returns avg_logprob and no_speech_prob per segment, which we map to
   * a confidence estimate. It is a genuine signal but not a calibrated score,
   * and it is never presented as verified pronunciation accuracy.
   */
  readonly supportsConfidence = true;
  readonly supportsPronunciationScoring = false;

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      baseUrl?: string;
      timeoutMs?: number;
    },
  ) {}

  async transcribe(input: TranscribeInput): Promise<TranscribeResponse> {
    const baseUrl = (this.options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
      input.filename,
    );
    form.append('model', this.options.model);
    form.append('language', input.language.split('-')[0] ?? 'de');
    form.append('response_format', 'verbose_json');
    if (input.prompt) form.append('prompt', input.prompt);

    let response;
    try {
      response = await request(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.options.apiKey}` },
        body: form,
        headersTimeout: this.options.timeoutMs ?? 60_000,
        bodyTimeout: this.options.timeoutMs ?? 60_000,
      });
    } catch (error) {
      throw new AIProviderError({
        code: 'stt_network_error',
        message: `Whisper request failed: ${(error as Error).message}`,
        userMessage: 'Die Spracherkennung ist nicht erreichbar. Prüfe dein Internet.',
        retryable: true,
        status: 503,
      });
    }

    const payload = (await response.body.json()) as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }>;
      error?: { message?: string };
    };

    if (response.statusCode >= 400) {
      throw new AIProviderError({
        code: 'stt_error',
        message: payload.error?.message ?? `Whisper responded with ${response.statusCode}`,
        userMessage: 'Ich konnte deine Aufnahme nicht verarbeiten. Bitte versuche es noch einmal.',
        retryable: response.statusCode >= 500 || response.statusCode === 429,
        status: response.statusCode >= 500 ? 503 : 502,
      });
    }

    return {
      text: (payload.text ?? '').trim(),
      language: payload.language ?? 'de',
      confidence: estimateWhisperConfidence(payload.segments),
      durationSec: payload.duration ?? null,
    };
  }
}

/**
 * Map Whisper segment statistics onto a 0-1 confidence.
 * avg_logprob is roughly -1 (poor) to 0 (excellent); no_speech_prob near 1
 * means the model thinks there was no speech at all.
 */
export function estimateWhisperConfidence(
  segments: Array<{ avg_logprob?: number; no_speech_prob?: number }> | undefined,
): number | null {
  if (!segments?.length) return null;

  const usable = segments.filter((s) => typeof s.avg_logprob === 'number');
  if (!usable.length) return null;

  const avgLogprob =
    usable.reduce((sum, s) => sum + (s.avg_logprob ?? 0), 0) / usable.length;
  const noSpeech =
    segments.reduce((sum, s) => sum + (s.no_speech_prob ?? 0), 0) / segments.length;

  // exp(avg_logprob) is the geometric mean token probability.
  const fromLogprob = Math.exp(avgLogprob);
  const confidence = fromLogprob * (1 - Math.min(noSpeech, 1));
  return Math.max(0, Math.min(1, Number(confidence.toFixed(3))));
}

/** Used when STT_PROVIDER=none: the app must fall back to device recognition. */
export class NullSTTProvider implements SpeechToTextProvider {
  readonly name = 'none';
  readonly supportsConfidence = false;
  readonly supportsPronunciationScoring = false;

  async transcribe(): Promise<TranscribeResponse> {
    throw new AIProviderError({
      code: 'stt_not_configured',
      message: 'No server-side speech-to-text provider is configured (STT_PROVIDER=none)',
      userMessage:
        'Die Spracherkennung auf dem Server ist nicht aktiv. Nutze die Erkennung auf dem Gerät.',
      retryable: false,
      status: 501,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Text to speech
 * ------------------------------------------------------------------ */

export class OpenAITTSProvider implements TextToSpeechProvider {
  readonly name = 'openai';

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      defaultVoice: string;
      baseUrl?: string;
      timeoutMs?: number;
    },
  ) {}

  async synthesize(input: SynthesizeInput): Promise<{ audio: Buffer; contentType: string }> {
    const baseUrl = (this.options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');

    let response;
    try {
      response = await request(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          voice: input.voice || this.options.defaultVoice,
          input: input.text,
          speed: input.speed,
          response_format: 'mp3',
        }),
        headersTimeout: this.options.timeoutMs ?? 45_000,
        bodyTimeout: this.options.timeoutMs ?? 45_000,
      });
    } catch (error) {
      throw new AIProviderError({
        code: 'tts_network_error',
        message: `TTS request failed: ${(error as Error).message}`,
        userMessage: 'Die Sprachausgabe ist nicht erreichbar.',
        retryable: true,
        status: 503,
      });
    }

    if (response.statusCode >= 400) {
      const detail = await response.body.text().catch(() => '');
      throw new AIProviderError({
        code: 'tts_error',
        message: `TTS responded with ${response.statusCode}: ${detail.slice(0, 200)}`,
        userMessage: 'Die Sprachausgabe hat nicht funktioniert. Der Text wird trotzdem angezeigt.',
        retryable: response.statusCode >= 500,
        status: response.statusCode >= 500 ? 503 : 502,
      });
    }

    const buffer = Buffer.from(await response.body.arrayBuffer());
    return { audio: buffer, contentType: 'audio/mpeg' };
  }
}

export class NullTTSProvider implements TextToSpeechProvider {
  readonly name = 'none';

  async synthesize(): Promise<{ audio: Buffer; contentType: string }> {
    throw new AIProviderError({
      code: 'tts_not_configured',
      message: 'No server-side text-to-speech provider is configured (TTS_PROVIDER=none)',
      userMessage: 'Serverseitige Sprachausgabe ist nicht aktiv. Das Gerät spricht den Text.',
      retryable: false,
      status: 501,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Factories
 * ------------------------------------------------------------------ */

export function createSTTProvider(env: Env): SpeechToTextProvider {
  if (env.STT_PROVIDER === 'openai-whisper') {
    return new WhisperSTTProvider({
      apiKey: env.OPENAI_API_KEY ?? '',
      model: env.STT_MODEL,
      baseUrl: env.OPENAI_BASE_URL,
      timeoutMs: env.REQUEST_TIMEOUT_MS,
    });
  }
  return new NullSTTProvider();
}

export function createTTSProvider(env: Env): TextToSpeechProvider {
  if (env.TTS_PROVIDER === 'openai') {
    return new OpenAITTSProvider({
      apiKey: env.OPENAI_API_KEY ?? '',
      model: env.TTS_MODEL,
      defaultVoice: env.TTS_VOICE,
      baseUrl: env.OPENAI_BASE_URL,
      timeoutMs: env.REQUEST_TIMEOUT_MS,
    });
  }
  return new NullTTSProvider();
}
