import {
  CATEGORY_LABELS_DE,
  CATEGORY_LABELS_EN,
  CEFR_LEVELS,
  GenerateExerciseRequestSchema,
  GenerateVocabularyRequestSchema,
  LEVEL_PROFILES,
  ListeningRequestSchema,
  MISTAKE_CATEGORIES,
  ShadowingRequestSchema,
  deriveWeakAreas,
  normalizeForComparison,
  MistakeCategorySchema,
  CefrLevelSchema,
} from '@deutschlearnen/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';

export async function learningRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /** Vocabulary for a topic and level. */
  app.post('/api/vocabulary/generate', async (request, reply) => {
    const body = GenerateVocabularyRequestSchema.parse(request.body);
    const result = await ctx.ai.generateVocabulary(body);
    return reply.send({ items: result.value, usage: result.usage });
  });

  /** Targeted drills built from the learner's recurring mistakes. */
  app.post('/api/exercises/generate', async (request, reply) => {
    const body = GenerateExerciseRequestSchema.parse(request.body);
    const result = await ctx.ai.generateExercise(body);
    return reply.send({ ...result.value, usage: result.usage });
  });

  /** Listening comprehension passages. */
  app.post('/api/listening/generate', async (request, reply) => {
    const body = ListeningRequestSchema.parse(request.body);
    const result = await ctx.ai.generateListening(body);
    return reply.send({ items: result.value, usage: result.usage });
  });

  /** Shadowing sentences. */
  app.post('/api/shadowing/generate', async (request, reply) => {
    const body = ShadowingRequestSchema.parse(request.body);
    const result = await ctx.ai.generateShadowing(body);
    return reply.send({ ...result.value, usage: result.usage });
  });

  /**
   * Mistake analysis.
   *
   * Note the deliberate design: the server is stateless and stores nothing.
   * Learner data lives only on the phone (see §45 Privacy), so this endpoint
   * takes the mistakes the app already holds, deduplicates and ranks them, and
   * returns what to drill next. Nothing is persisted server-side.
   */
  app.post('/api/mistakes', async (request, reply) => {
    const body = z
      .object({
        level: CefrLevelSchema,
        mistakes: z
          .array(
            z.object({
              category: MistakeCategorySchema,
              wrongText: z.string(),
              correctText: z.string(),
              explanation: z.string().default(''),
              count: z.number().int().nonnegative().default(1),
            }),
          )
          .max(200),
        generateDrills: z.boolean().default(false),
        drillCount: z.number().int().min(1).max(10).default(5),
        includeBangla: z.boolean().default(false),
      })
      .parse(request.body);

    // Collapse near-duplicates so "Ich habe gegangen" and "ich habe gegangen."
    // are one mistake with a higher count, not two.
    const merged = new Map<
      string,
      { category: string; wrongText: string; correctText: string; explanation: string; count: number }
    >();
    for (const m of body.mistakes) {
      const key = `${m.category}::${normalizeForComparison(m.correctText)}`;
      const existing = merged.get(key);
      if (existing) {
        existing.count += m.count;
      } else {
        merged.set(key, { ...m });
      }
    }

    const ranked = [...merged.values()].sort((a, b) => b.count - a.count);
    const weakAreas = deriveWeakAreas(
      body.mistakes.map((m) => ({ category: m.category, count: m.count })),
    );

    let drills = null;
    if (body.generateDrills && ranked.length > 0) {
      const result = await ctx.ai.generateExercise({
        level: body.level,
        count: body.drillCount,
        mistakes: ranked.slice(0, 5).map((m) => ({
          category: m.category as (typeof MISTAKE_CATEGORIES)[number],
          wrongText: m.wrongText,
          correctText: m.correctText,
          explanation: m.explanation,
        })),
        focusArea: weakAreas[0] ?? null,
        includeBangla: body.includeBangla,
      });
      drills = result.value;
    }

    return reply.send({ ranked, weakAreas, drills });
  });

  /**
   * Reference data for mistakes: the taxonomy and its German/English labels.
   * The app uses this to render category names without hard-coding them twice.
   */
  app.get('/api/mistakes', async (_request, reply) =>
    reply.send({
      storage: 'device-local',
      note: 'Learner mistake history is stored only on the device. This endpoint returns the shared taxonomy.',
      categories: MISTAKE_CATEGORIES.map((id) => ({
        id,
        labelDe: CATEGORY_LABELS_DE[id],
        labelEn: CATEGORY_LABELS_EN[id],
      })),
    }),
  );

  /**
   * Progress reference data: the level benchmarks the dashboard renders targets
   * against. The learner's own numbers are computed on the device from the
   * local database, which is why this returns configuration rather than records.
   */
  app.get('/api/progress', async (_request, reply) =>
    reply.send({
      storage: 'device-local',
      note: 'Progress records are stored only on the device. This endpoint returns level benchmarks.',
      levels: CEFR_LEVELS.map((level) => ({
        level,
        label: LEVEL_PROFILES[level].label,
        labelDe: LEVEL_PROFILES[level].labelDe,
        expectedUserWords: LEVEL_PROFILES[level].expectedUserWords,
        topics: LEVEL_PROFILES[level].topics,
        grammar: LEVEL_PROFILES[level].grammar,
      })),
    }),
  );
}
