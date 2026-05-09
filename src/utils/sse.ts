/**
 * SSE helpers.
 *
 * - `parseSseStream`: Consume a ReadableStream of bytes and yield parsed
 *   `{ event, data }` pairs.  Works in both browser (fetch body) and Node 18+.
 * - `encodeSseEvent`: Serialize a `{ event, data }` pair to the SSE wire format.
 */

export interface SseMessage {
  event?: string;
  data: string;
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseMessage, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      // Events are separated by blank lines.
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + (buffer[idx] === '\r' ? 4 : 2));
        const msg = parseSseBlock(raw);
        if (msg) {
          yield msg;
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const msg = parseSseBlock(buffer);
      if (msg) {
        yield msg;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseBlock(block: string): SseMessage | undefined {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) {
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }
  if (dataLines.length === 0) {
    return undefined;
  }
  return { event, data: dataLines.join('\n') };
}

export function encodeSseEvent(event: string, data: unknown): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}
