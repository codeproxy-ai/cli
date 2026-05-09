import { describe, expect, it } from 'vitest';
import { translateRequest } from '../src/translate/openai/translateRequest.js';

describe('translateRequest (Responses -> Zai)', () => {
  it('maps simple string input + instructions', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        instructions: 'You are helpful.',
        input: 'Hello',
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.model).toBe('zai-gpt-4');
    expect(request.messages[0]).toMatchObject({ role: 'system', content: 'You are helpful.' });
    expect(request.messages[1]).toMatchObject({ role: 'user', content: 'Hello' });
    expect(request.max_tokens).toBe(4096);
  });

  it('handles structured input items with tool calls and outputs', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: [
          { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'list' }] },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'sure' }],
          },
          {
            type: 'function_call',
            call_id: 'call_1',
            name: 'shell',
            arguments: '{"command":["ls"]}',
          },
          {
            type: 'function_call_output',
            call_id: 'call_1',
            output: 'file.txt',
          },
        ],
        tools: [
          {
            type: 'function',
            function: { name: 'shell', description: 'run', parameters: { type: 'object' } },
          },
        ],
      },
      { defaultMaxTokens: 4096 },
    );

    expect(request.messages.length).toBeGreaterThanOrEqual(3);
    expect(request.messages[0]).toMatchObject({ role: 'user' });
    expect(request.messages[1]).toMatchObject({ role: 'assistant', content: 'sure' });
    expect(request.messages[2]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
      content: 'file.txt',
    });
  });

  it('backfills empty reasoning_content on assistant tool-call messages without prior reasoning', () => {
    const { request } = translateRequest({
      model: 'glm-4.6',
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'go' }] },
        { type: 'function_call', call_id: 'call_1', name: 'shell', arguments: '{}' },
        { type: 'function_call_output', call_id: 'call_1', output: 'ok' },
      ],
    });
    const assistant = request.messages.find(
      (msg) => msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length,
    );
    expect(assistant).toBeDefined();
    expect(assistant!.reasoning_content).toBe('.');
  });

  it('backfills reasoning_content on plain assistant text messages (GLM thinking mode)', () => {
    const { request } = translateRequest({
      model: 'glm-4.6',
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] },
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'again' }] },
      ],
    });
    const assistant = request.messages.find((msg) => msg.role === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant!.tool_calls).toBeUndefined();
    expect(assistant!.reasoning_content).toBe('.');
  });

  it('preserves existing reasoning_content on assistant tool-call messages', () => {
    const { request } = translateRequest({
      model: 'glm-4.6',
      input: [
        { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'thinking...' }] },
        { type: 'function_call', call_id: 'call_1', name: 'shell', arguments: '{}' },
      ],
    });
    const assistant = request.messages.find(
      (msg) => msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length,
    );
    expect(assistant!.reasoning_content).toBe('thinking...');
  });

  it('maps temperature and top_p', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: 'test',
        temperature: 0.7,
        top_p: 0.9,
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.temperature).toBe(0.7);
    expect(request.top_p).toBe(0.9);
  });

  it('maps max_output_tokens and max_tokens', () => {
    const { request } = translateRequest({
      model: 'zai-gpt-4',
      input: 'test',
      max_output_tokens: 1000,
    });
    expect(request.max_tokens).toBe(1000);
  });

  // ==============================================================================
  // basic parameter mapping
  // ==============================================================================

  it('handles tool_choice auto', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: 'test',
        tools: [
          {
            type: 'function',
            function: { name: 'shell', description: 'run', parameters: { type: 'object' } },
          },
        ],
        tool_choice: 'auto',
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.tools).toBeDefined();
    expect(request.tool_choice).toBe('auto');
  });

  it('handles tool_choice required', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: 'test',
        tools: [
          {
            type: 'function',
            function: { name: 'shell', description: 'run', parameters: { type: 'object' } },
          },
        ],
        tool_choice: 'required',
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.tool_choice).toBe('required');
  });

  it('handles tool_choice none', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: 'test',
        tools: [
          {
            type: 'function',
            function: { name: 'shell', description: 'run', parameters: { type: 'object' } },
          },
        ],
        tool_choice: 'none',
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.tool_choice).toBe('none');
  });

  it('handles tool_choice with specific function', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: 'test',
        tools: [
          {
            type: 'function',
            function: { name: 'shell', description: 'run', parameters: { type: 'object' } },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'shell' } },
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.tool_choice).toEqual({ type: 'function', function: { name: 'shell' } });
  });

  it('uses default max_tokens when not provided', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: 'test',
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.max_tokens).toBe(4096);
  });

  it('handles array of strings as input', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: ['hello', 'world'],
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.messages.length).toBe(2);
    expect(request.messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(request.messages[1]).toMatchObject({ role: 'user', content: 'world' });
  });

  it('translates input_image with image_url string (Responses API format)', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: 'what is this?' },
              { type: 'input_image', image_url: 'data:image/png;base64,AAA' },
            ],
          },
        ],
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
        ],
      },
    ]);
  });

  // ==============================================================================
  // image & file type translation
  // ==============================================================================

  it('translates input_image with image_url object {url}', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_image', image_url: { url: 'https://example.com/a.png' } }],
          },
        ],
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.messages[0].content).toEqual([
      { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
    ]);
  });

  it('translates input_image with data+mime_type fallback', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_image', data: 'BBB', mime_type: 'image/jpeg' }],
          },
        ],
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.messages[0].content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BBB' } },
    ]);
  });

  it('translates input_file to image_url data URL', () => {
    const { request } = translateRequest(
      {
        model: 'zai-gpt-4',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_file', file_data: 'CCC', mime_type: 'application/pdf' }],
          },
        ],
      },
      { defaultMaxTokens: 4096 },
    );
    expect(request.messages[0].content).toEqual([
      { type: 'image_url', image_url: { url: 'data:application/pdf;base64,CCC' } },
    ]);
  });

  it('reorders tool messages when user message is injected between function_call and function_call_output', () => {
    const { request } = translateRequest({
      model: 'glm-4.6',
      input: [
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'go' }] },
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'exec_command',
          arguments: '{"cmd":"ls"}',
        },
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Warning: something' }],
        },
        { type: 'function_call_output', call_id: 'call_1', output: 'file.txt' },
      ],
    });

    // The assistant message with tool_calls must be immediately followed by the tool response
    const assistantIdx = request.messages.findIndex(
      (msg) => msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length,
    );
    expect(assistantIdx).toBeGreaterThanOrEqual(0);
    const nextMsg = request.messages[assistantIdx + 1];
    expect(nextMsg.role).toBe('tool');
    expect(nextMsg.tool_call_id).toBe('call_1');
    expect(nextMsg.content).toBe('file.txt');
  });

  it('does not inject response_format (incompatible with most upstreams)', () => {
    const { request } = translateRequest({
      model: 'gpt-5',
      input: 'go',
      text: {
        format: { type: 'json_schema', name: 'test', strict: true, schema: { type: 'object' } },
      },
    });
    expect(request.response_format).toBeUndefined();
  });
});

<<<<<<< HEAD
  it('ignores reasoning.effort from client request body', () => {
    const { request } = translateRequest({
      model: 'deepseek-v4-pro',
      input: 'hello',
      reasoning: { effort: 'high' },
    } as never);
    expect((request as any).reasoning_effort).toBeUndefined();
=======
it('maps reasoning.effort to reasoning_effort in request body', () => {
  const { request } = translateRequest({
    model: 'deepseek-v4-pro',
    input: 'hello',
    reasoning: { effort: 'high' },
>>>>>>> fix: apply ESLint rules - add consistent-type-assertions (no as), fix no-one-letter-vars rule bug
  });
  const reqRecord: Record<string, unknown> = request;
  expect(reqRecord.reasoning_effort).toBe('high');
});

it('omits reasoning_effort when reasoning.effort is not provided', () => {
  const { request } = translateRequest({
    model: 'deepseek-v4-pro',
    input: 'hello',
  });
  const reqRecord: Record<string, unknown> = request;
  expect(reqRecord.reasoning_effort).toBeUndefined();
});
