import type { z } from 'zod';

/**
 * Tolerant JSON extraction for model output.
 *
 * Models mostly obey "return JSON only", but not always: they wrap it in a
 * markdown fence, prepend a sentence, or emit a trailing comma. Rather than
 * crashing a conversation turn over punctuation, we repair the common cases and
 * only then validate with Zod - so anything that survives is genuinely typed.
 */

export class InvalidAIResponseError extends Error {
  readonly raw: string;
  readonly issues: string[];

  constructor(message: string, raw: string, issues: string[] = []) {
    super(message);
    this.name = 'InvalidAIResponseError';
    this.raw = raw;
    this.issues = issues;
  }
}

/** Strip markdown fences and any prose around the outermost JSON object. */
export function extractJsonBlock(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  return text.trim();
}

/** Repair the small syntax slips models actually make. */
export function repairJson(text: string): string {
  return text
    // trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1')
    // smart quotes around keys/values
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // literal newlines inside strings would be illegal; models sometimes emit them
    .replace(/([^\\])\\n/g, '$1\\n');
}

/** Parse without validating. Throws InvalidAIResponseError on failure. */
export function parseLooseJson(raw: string): unknown {
  const block = extractJsonBlock(raw);
  try {
    return JSON.parse(block);
  } catch {
    try {
      return JSON.parse(repairJson(block));
    } catch (error) {
      throw new InvalidAIResponseError(
        `Model did not return parseable JSON: ${(error as Error).message}`,
        raw,
      );
    }
  }
}

/**
 * Parse and validate model output against a schema.
 * Returns a typed value or throws InvalidAIResponseError with the Zod issues,
 * which the caller turns into a friendly German message.
 */
export function parseAIJson<T extends z.ZodTypeAny>(raw: string, schema: T): z.infer<T> {
  const value = parseLooseJson(raw);
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new InvalidAIResponseError(
      'Model JSON did not match the expected shape',
      raw,
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}

/** Validate, but fall back to a default instead of throwing. */
export function parseAIJsonSafe<T extends z.ZodTypeAny>(
  raw: string,
  schema: T,
  fallback: z.infer<T>,
): { value: z.infer<T>; ok: boolean; error?: InvalidAIResponseError } {
  try {
    return { value: parseAIJson(raw, schema), ok: true };
  } catch (error) {
    if (error instanceof InvalidAIResponseError) {
      return { value: fallback, ok: false, error };
    }
    throw error;
  }
}
