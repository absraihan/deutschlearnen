import {
  EvaluateSpeakingRequestSchema,
  SessionSummaryRequestSchema,
  SpeakRequestSchema,
  MAX_UTTERANCE_MS,
} from '@deutschlearnen/shared';
import type { FastifyInstance } from 'fastify';
import { userAiKeyFrom, type AppContext } from '../context';
import { AIProviderError } from '../providers/ai/types';

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function speakingRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /** Pronunciation feedback from a transcript. Always labelled as an estimate. */
  app.post('/api/speaking/evaluate', async (request, reply) => {
    const body = EvaluateSpeakingRequestSchema.parse(request.body);
    const hasAudioScoring = ctx.stt.supportsPronunciationScoring && body.hasAudioScoring;
    const result = await ctx
      .aiFor(userAiKeyFrom(request.headers))
      .analyzePronunciation({ ...body, hasAudioScoring });
    return reply.send({ pronunciation: result.value, usage: result.usage });
  });

  /** End-of-session scores and feedback. */
  app.post('/api/session/summary', async (request, reply) => {
    const body = SessionSummaryRequestSchema.parse(request.body);
    const result = await ctx.aiFor(userAiKeyFrom(request.headers)).evaluateSpeakingSession(body);
    request.log.info(
      { sessionId: body.sessionId, overall: result.value.overallScore },
      'session evaluated',
    );
    return reply.send({ evaluation: result.value, usage: result.usage });
  });

  /**
   * Server-side speech-to-text. Multipart because audio is binary; the mobile
   * app posts the recording it made with expo-audio.
   */
  app.post('/api/speech/transcribe', async (request, reply) => {
    const file = await request.file({ limits: { fileSize: MAX_AUDIO_BYTES } });
    if (!file) {
      throw new AIProviderError({
        code: 'no_audio',
        message: 'No audio file in the multipart request',
        userMessage: 'Ich habe keine Aufnahme bekommen. Bitte versuche es noch einmal.',
        retryable: false,
        status: 400,
      });
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength < 1024) {
      throw new AIProviderError({
        code: 'audio_too_short',
        message: `Audio payload was only ${buffer.byteLength} bytes`,
        userMessage: 'Das war zu kurz. Halte den Knopf gedrückt und sprich einen ganzen Satz.',
        retryable: false,
        status: 400,
      });
    }

    const promptField = (file.fields as Record<string, unknown>)?.prompt;
    const prompt =
      promptField && typeof promptField === 'object' && 'value' in promptField
        ? String((promptField as { value: unknown }).value)
        : undefined;

    const result = await ctx.stt.transcribe({
      audio: buffer,
      filename: file.filename || 'speech.m4a',
      mimeType: file.mimetype || 'audio/m4a',
      language: 'de-DE',
      prompt,
    });

    request.log.info(
      { chars: result.text.length, confidence: result.confidence },
      'audio transcribed',
    );

    return reply.send(result);
  });

  /** Server-side text-to-speech. Optional: the app falls back to device TTS. */
  app.post('/api/speech/speak', async (request, reply) => {
    const body = SpeakRequestSchema.parse(request.body);
    const result = await ctx.tts.synthesize({
      text: body.text,
      voice: body.voice,
      speed: body.speed,
    });
    return reply
      .header('content-type', result.contentType)
      .header('cache-control', 'no-store')
      .send(result.audio);
  });

  /** What the speech pipeline can actually do, so the app never over-promises. */
  app.get('/api/speech/capabilities', async (_request, reply) =>
    reply.send({
      stt: {
        provider: ctx.stt.name,
        available: ctx.stt.name !== 'none',
        supportsConfidence: ctx.stt.supportsConfidence,
        supportsPronunciationScoring: ctx.stt.supportsPronunciationScoring,
        locale: 'de-DE',
        maxUtteranceMs: MAX_UTTERANCE_MS,
      },
      tts: {
        provider: ctx.tts.name,
        available: ctx.tts.name !== 'none',
      },
    }),
  );
}
