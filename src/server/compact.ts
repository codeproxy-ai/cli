export function handleCompactRequest(
  method: string,
  requestBodyText: string | undefined,
): Response {
  if (method !== 'POST') {
    return jsonResponse({ error: { message: 'Method not allowed' } }, 405);
  }

  const requestBody = parseJson(requestBodyText);
  if (!isCompactRequestBody(requestBody)) {
    return jsonResponse({ error: { message: 'Invalid compact request body' } }, 400);
  }

  const output = normalizeCompactOutput(requestBody.input);
  const now = Math.floor(Date.now() / 1000);
  return jsonResponse({
    id: `resp_compact_${now}`,
    object: 'response.compaction',
    created_at: now,
    output,
    usage: {
      input_tokens: 0,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 0,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 0,
    },
  });
}

function parseJson(str: string | undefined | null): unknown {
  if (!str) {
    return str ?? null;
  }
  // eslint-disable-next-line no-restricted-syntax -- compact requests need HTTP-safe JSON parsing
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function isCompactRequestBody(value: unknown): value is { input?: unknown } {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function normalizeCompactOutput(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }
  if (input == null) {
    return [];
  }
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  return [
    {
      id: 'msg_compact_0',
      type: 'message',
      status: 'completed',
      role: 'user',
      content: [{ type: 'input_text', text }],
    },
  ];
}
