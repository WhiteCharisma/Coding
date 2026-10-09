import type { z } from 'zod';
import { badRequest } from './errors';

export interface FieldIssue {
  path: string;
  message: string;
}

/** Parses untrusted input with a Zod schema; throws a 400 with field-level issues on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const issues: FieldIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    const first = issues[0];
    throw badRequest(first ? first.message : 'Invalid request', { issues }, 'validation_failed');
  }
  return result.data;
}
