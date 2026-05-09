/** Safe JSON helpers used by translators. */

export function safeJsonParse<T = unknown>(text: string): T | undefined {
  // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
  try {
    const parsed: T = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

export function jsonStringifySafe(value: unknown): string {
  // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}
