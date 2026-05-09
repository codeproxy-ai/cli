import { describe, expect, it } from 'vitest';
import { translateRequest } from '../src/translate/anthropic/translateRequest.js';

describe('translateRequest (Responses -> Anthropic)', () => {
  it('maps simple string input + instructions', () => {
    const { request } = translateRequest({
      model: 'claude-sonnet-4-5',
      instructions: 'You are helpful.',
      input: 'Hello',
    });
    expect(request.model).toBe('claude-sonnet-4-5');
    expect(request.system).toEqual([{ type: 'text', text: 'You are helpful.' }]);
    expect(request.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]);
    expect(request.max_tokens).toBeGreaterThan(0);
  });

  it('handles structured input items with tool calls and outputs', () => {
    const { request } = translateRequest({
      model: 'claude-sonnet-4-5',
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
    });

    expect(request.messages.length).toBeGreaterThanOrEqual(3);
    expect(request.messages[0]).toMatchObject({ role: 'user' });
    const assistantMsg = request.messages.find(
      (msg) =>
        msg.role === 'assistant' &&
        Array.isArray(msg.content) &&
        msg.content.some((block: { type: string }) => block.type === 'tool_use'),
    );
    expect(assistantMsg).toBeDefined();
    const userToolResult = request.messages.find(
      (msg) =>
        Array.isArray(msg.content) &&
        msg.content.some((block: { type: string }) => block.type === 'tool_result'),
    );
    expect(userToolResult).toBeDefined();
    expect(request.tools).toEqual([
      { name: 'shell', description: 'run', input_schema: { type: 'object' } },
    ]);
  });

  it('maps data-url image inputs to anthropic base64 blocks', () => {
    const { request } = translateRequest({
      model: 'claude-sonnet-4-5',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_image', mime_type: 'image/jpeg', data: 'AAA' }],
        },
      ],
    });
    const firstMessage = request.messages[0];
    if (!Array.isArray(firstMessage.content)) {
      throw new Error('unexpected');
    }
    const firstBlock: {
      type: string;
      source?: { type: string; media_type?: string; data?: string };
    } = firstMessage.content[0];
    expect(firstBlock.type).toBe('image');
    expect(firstBlock.source?.type).toBe('base64');
    expect(firstBlock.source?.media_type).toBe('image/jpeg');
    expect(firstBlock.source?.data).toBe('AAA');
  });

  // ==============================================================================
  // 工具调用修复
  // ==============================================================================
  it('repairs dangling tool_use when no matching tool_result exists', () => {
    const { request } = translateRequest({
      model: 'claude-sonnet-4-5',
      input: [
        { type: 'function_call', call_id: 'call_x', name: 'shell', arguments: '{}' },
        { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'next' }] },
      ],
    });
    const toolResultMsg = request.messages.find(
      (msg) =>
        Array.isArray(msg.content) &&
        msg.content.some((block: { type: string }) => block.type === 'tool_result'),
    );
    expect(toolResultMsg).toBeDefined();
  });

  it('emits thinking config when reasoning.effort provided', () => {
    const { request } = translateRequest({
      model: 'claude-sonnet-4-5',
      input: 'hello',
      max_output_tokens: 16384,
      reasoning: { effort: 'medium' },
    });
    expect(request.thinking).toBeDefined();
    expect(request.thinking?.type).toBe('enabled');
  });

  it('maps tool_choice required -> any', () => {
    const { request } = translateRequest({
      model: 'claude-sonnet-4-5',
      input: 'hi',
      tools: [{ type: 'function', function: { name: 't', parameters: { type: 'object' } } }],
      tool_choice: 'required',
    });
    expect(request.tool_choice).toEqual({ type: 'any' });
  });

  it('translates input_image with data URL image_url to base64 image block', () => {
    const { request } = translateRequest({
      model: 'claude-sonnet-4-5',
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
    });
    expect(request.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      ],
    });
  });

  it('translates input_image with raw data+mime_type', () => {
    const { request } = translateRequest({
      model: 'claude-sonnet-4-5',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_image', data: 'BBB', mime_type: 'image/jpeg' }],
        },
      ],
    });
    expect(request.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBB' } },
    ]);
  });
});
