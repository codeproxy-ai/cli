import { describe, expect, it } from 'vitest';
import { translateResponse } from '../src/translate/openai/translateResponse.js';

// ==============================================================================
// translateResponse (Zai -> Responses)
// ==============================================================================

describe('translateResponse (Zai -> Responses)', () => {
  it('maps text + tool_calls into output items', () => {
    const res = translateResponse({
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1677652288,
      model: 'zai-gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '{"q": "foo"}',
                },
              },
            ],
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 3,
        total_tokens: 13,
      },
    });

    expect(res.status).toBe('completed');
    expect(res.usage).toMatchObject({ input_tokens: 10, output_tokens: 3, total_tokens: 13 });

    const toolCall = res.output.find(
      (item: Record<string, unknown>) => item.type === 'function_call',
    );
    expect(toolCall).toBeDefined();
    // eslint-disable-next-line no-restricted-syntax -- test needs wider type for tool call
    const tc = toolCall as Record<string, unknown>;
    expect(tc.name).toBe('search');
    expect(tc.arguments).toBe('{"q": "foo"}');

    const message = res.output.find((item: Record<string, unknown>) => item.type === 'message');
    expect(message).toBeDefined();
  });

  it('promotes shell tool_calls to local_shell_call', () => {
    const res = translateResponse({
      id: 'chatcmpl-456',
      object: 'chat.completion',
      created: 1677652288,
      model: 'zai-gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call_shell',
                type: 'function',
                function: {
                  name: 'shell',
                  arguments: '{"command": ["ls", "-la"]}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 10,
        total_tokens: 15,
      },
    });

    // eslint-disable-next-line no-restricted-syntax -- test needs wider type for output item
    const item = res.output[0] as { type: string; action?: { command: string[] } };
    expect(item.type).toBe('local_shell_call');
    expect(item.action?.command).toEqual(['ls', '-la']);
  });

  it('handles container.exec as shell tool', () => {
    const res = translateResponse({
      id: 'chatcmpl-789',
      object: 'chat.completion',
      created: 1677652288,
      model: 'zai-gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call_container',
                type: 'function',
                function: {
                  name: 'container.exec',
                  arguments: '{"command": ["pwd"]}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 5,
        total_tokens: 8,
      },
    });

    // eslint-disable-next-line no-restricted-syntax -- test needs wider type for output item
    const item = res.output[0] as { type: string };
    expect(item.type).toBe('local_shell_call');
  });

  it('handles text-only response', () => {
    const res = translateResponse({
      id: 'chatcmpl-000',
      object: 'chat.completion',
      created: 1677652288,
      model: 'zai-gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello, how can I help you?',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 7,
        total_tokens: 15,
      },
    });

    expect(res.output.length).toBe(1);
    // eslint-disable-next-line no-restricted-syntax -- test needs wider type for message
    const message = res.output[0] as {
      type: string;
      role: string;
      content: Array<{ type: string; text: string }>;
    };
    expect(message.type).toBe('message');
    expect(message.role).toBe('assistant');
    expect(message.content[0].text).toBe('Hello, how can I help you?');
  });

  it('uses custom responseId, createdAt, and model when provided', () => {
    const res = translateResponse(
      {
        id: 'chatcmpl-custom',
        object: 'chat.completion',
        created: 1677652288,
        model: 'zai-gpt-3.5',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'test',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      },
      {
        responseId: 'custom_id',
        createdAt: 1234567890,
        model: 'custom_model',
      },
    );

    expect(res.id).toBe('custom_id');
    expect(res.created_at).toBe(1234567890);
    expect(res.model).toBe('custom_model');
  });

  it('handles missing usage gracefully', () => {
    const res = translateResponse({
      id: 'chatcmpl-nousage',
      object: 'chat.completion',
      created: 1677652288,
      model: 'zai-gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'test',
          },
          finish_reason: 'stop',
        },
      ],
    });

    if (res.usage) {
      expect(res.usage.input_tokens).toBe(0);
      expect(res.usage.output_tokens).toBe(0);
      expect(res.usage.total_tokens).toBe(0);
    }
  });
});
