/** Safe JSON helpers used by translators. */

export function safeJsonParse<T = unknown>(text: string): T | undefined {
  try {
    const parsed: T = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

export function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}
