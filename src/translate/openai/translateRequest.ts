// ==============================================================================
// Main Translation
// ==============================================================================

import type {
  ResponsesRequest,
  ResponsesInputItem,
  ResponsesTool,
  ResponsesToolChoice,
  ResponsesContentPart,
} from '../../types/responses.js';
import type {
  OpenAiChatMessage,
  OpenAiChatRequest,
  OpenAiChatTool,
  OpenAiChatToolChoice,
} from '../../types/openai_chat.js';
import { makeId } from '../../utils/id.js';
import { jsonStringifySafe } from '../../utils/json.js';

export interface TranslateRequestOptions {
  /** Default max tokens when not provided. */
  defaultMaxTokens?: number;
  /** If true, backfill reasoning_content on assistant tool-call messages. */
  backfillReasoning?: boolean;
  /** Placeholder string for backfilled reasoning_content. Defaults to '.'. */
  reasoningPlaceholder?: string;
  /** If true, strip `strict` from function tools (some upstreams reject it). */
  /** If true, drop image/file parts from user messages (e.g. DeepSeek text-only models). */
  dropImages?: boolean;
}

export interface TranslateRequestResult {
  request: OpenAiChatRequest;
}

/** Convert a Responses API request into an OpenAI Chat API request. */
export function translateRequest(
  data: ResponsesRequest,
  options: TranslateRequestOptions = {},
): TranslateRequestResult {
  const messages: OpenAiChatMessage[] = [];

  const systemContent = buildSystemContent(data.instructions);
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }

  const inputItems: ResponsesInputItem[] =
    typeof data.input === 'string' ? [data.input] : Array.isArray(data.input) ? data.input : [];

  for (const raw of inputItems) {
    if (typeof raw === 'string') {
      messages.push({ role: 'user', content: raw });
      continue;
    }
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const rawItem: Record<string, unknown> = raw;
    processInputItem(rawItem, messages, options.dropImages);
  }

  const request: OpenAiChatRequest = {
    model: data.model,
    messages,
  };

  if (typeof data.temperature === 'number') {
    request.temperature = data.temperature;
  }
  if (typeof data.top_p === 'number') {
    request.top_p = data.top_p;
  }
  const effort = typeof data.reasoning?.effort === 'string' ? data.reasoning.effort : undefined;
  if (effort) {
    const req: Record<string, unknown> = request;
    req.reasoning_effort = effort;
  }

  const maxTokens =
    (typeof data.max_output_tokens === 'number' && data.max_output_tokens) ||
    (typeof data.max_tokens === 'number' && data.max_tokens) ||
    options.defaultMaxTokens;
  if (typeof maxTokens === 'number') {
    request.max_tokens = maxTokens;
  }

  const tools = mapTools(data.tools ?? []);
  if (tools.length) {
    request.tools = tools;
    const toolChoice = mapToolChoice(data.tool_choice);
    if (toolChoice !== undefined) {
      request.tool_choice = toolChoice;
    }
  }

  // Some upstreams (e.g. GLM thinking mode) require reasoning_content on every
  // assistant turn when thinking is enabled — not just ones that make tool calls.
  const placeholder = options.reasoningPlaceholder ?? '.';
  if (options.backfillReasoning !== false && placeholder) {
    for (const m of messages) {
      if (m.role === 'assistant' && m.reasoning_content == null) {
        m.reasoning_content = placeholder;
      }
    }
  }

  // Reorder messages to ensure tool outputs immediately follow their tool calls.
  // Some upstreams (e.g. GLM) require tool messages to come right after the assistant
  // message that emitted the tool_calls, with no other message in between.
  repairToolMessageOrder(messages);

  return { request };
}

function buildSystemContent(instructions: ResponsesRequest['instructions']): string {
  if (!instructions) {
    return '';
  }
  if (typeof instructions === 'string') {
    return instructions;
  }
  if (!Array.isArray(instructions)) {
    return '';
  }
  let out = '';
  for (const block of instructions) {
    if (typeof block === 'string') {
      out += block;
    } else if (block && typeof block === 'object') {
      // eslint-disable-next-line no-restricted-syntax -- Record extraction from unknown union
      out += String((block as { text?: string }).text ?? '');
    }
  }
  return out;
}

function processInputItem(
  item: Record<string, unknown>,
  messages: OpenAiChatMessage[],
  dropImages?: boolean,
): void {
  const itemType: string = String(item.type) || 'message';

  const getLastAssistant = (): OpenAiChatMessage => {
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant') {
      return last;
    }
    const msg: OpenAiChatMessage = { role: 'assistant', content: null };
    messages.push(msg);
    return msg;
  };

  if (itemType === 'message' || itemType === 'agentMessage') {
    // ==============================================================================
    // Helpers
    // ==============================================================================

    let role: string = String(item.role) || 'user';
    if (role === 'developer') {
      role = 'system';
    }

    let reasoningContent: string = String(item.reasoning_content ?? '');
    const rawContent = item.content;

    if (role === 'assistant' || role === 'model') {
      let content = '';
      if (typeof rawContent === 'string') {
        content = rawContent;
      } else if (Array.isArray(rawContent)) {
        for (const part of rawContent) {
          if (typeof part === 'string') {
            content += part;
          } else if (part && typeof part === 'object') {
            const contentPart: ResponsesContentPart = part;
            if (
              contentPart.type === 'input_text' ||
              contentPart.type === 'text' ||
              contentPart.type === 'output_text'
            ) {
              content += String(contentPart.text ?? '');
            } else if (contentPart.type === 'reasoning_text') {
              reasoningContent += String(contentPart.text ?? '');
            }
          }
        }
      }
      const amsg = getLastAssistant();
      if (content) {
        amsg.content = (amsg.content ?? '') + content;
      }
      if (reasoningContent) {
        amsg.reasoning_content = (amsg.reasoning_content ?? '') + reasoningContent;
      }
      const sig = item.thought_signature;
      if (typeof sig === 'string' && sig) {
        amsg.thought_signature = sig;
      }
    } else {
      if (typeof rawContent === 'string') {
        messages.push({ role, content: rawContent });
      } else if (Array.isArray(rawContent)) {
        const contentBlocks: Array<{ type: string; [k: string]: unknown }> = [];
        for (const part of rawContent) {
          if (typeof part === 'string') {
            contentBlocks.push({ type: 'text', text: part });
          } else if (part && typeof part === 'object') {
            const contentPart: ResponsesContentPart = part;
            if (
              contentPart.type === 'input_text' ||
              contentPart.type === 'text' ||
              contentPart.type === 'output_text'
            ) {
              contentBlocks.push({ type: 'text', text: String(contentPart.text ?? '') });
            } else if (contentPart.type === 'reasoning_text') {
              reasoningContent += String(contentPart.text ?? '');
            } else if (
              contentPart.type === 'input_image' ||
              contentPart.type === 'image' ||
              contentPart.type === 'image_url'
            ) {
              if (dropImages) {
                continue;
              }
              let url = '';
              const partWithImage: { image_url?: string | { url: string } } = part;
              const imgUrl = partWithImage.image_url;
              if (typeof imgUrl === 'string') {
                url = imgUrl;
              } else if (imgUrl && typeof imgUrl === 'object' && imgUrl.url) {
                url = imgUrl.url;
              } else {
                const partWithData: { data?: string; base64?: string } = part;
                const imgData = String(partWithData.data ?? partWithData.base64 ?? '');
                if (imgData) {
                  const partWithMime: { mime_type?: string; media_type?: string } = part;
                  const mimeType = String(
                    partWithMime.mime_type ?? partWithMime.media_type ?? 'image/png',
                  );
                  url = imgData.startsWith('data:')
                    ? imgData
                    : `data:${mimeType};base64,${imgData}`;
                }
              }
              if (url) {
                contentBlocks.push({ type: 'image_url', image_url: { url } });
              }
            } else if (part.type === 'input_file' || part.type === 'file') {
              const partFile: {
                file_data?: string;
                data?: string;
                mime_type?: string;
                media_type?: string;
              } = part;
              const fileData = String(partFile.file_data ?? partFile.data ?? '');
              const mimeType = String(
                partFile.mime_type ?? partFile.media_type ?? 'application/pdf',
              );
              if (fileData) {
                const url = fileData.startsWith('data:')
                  ? fileData
                  : `data:${mimeType};base64,${fileData}`;
                contentBlocks.push({ type: 'image_url', image_url: { url } });
              }
            }
          }
        }
        const msg: OpenAiChatMessage = { role, content: contentBlocks };
        if (reasoningContent) {
          msg.reasoning_content = reasoningContent;
        }
        const sig = item.thought_signature;
        if (typeof sig === 'string' && sig) {
          msg.thought_signature = sig;
        }
        messages.push(msg);
      } else {
        messages.push({ role, content: '' });
      }
    }
    return;
  }

  if (itemType === 'reasoning') {
    const rawList = item.content;
    let content = '';
    if (Array.isArray(rawList)) {
      for (const cp of rawList) {
        if (typeof cp === 'string') {
          content += cp;
        } else if (cp && typeof cp === 'object') {
          // eslint-disable-next-line no-restricted-syntax -- Record extraction from unknown union
          content += String((cp as { text?: string }).text ?? '');
        }
      }
    } else if (typeof rawList === 'string') {
      content += rawList;
    }
    const amsg = getLastAssistant();
    amsg.reasoning_content = (amsg.reasoning_content ?? '') + content;
    const sig = item.thought_signature;
    if (typeof sig === 'string' && sig) {
      amsg.thought_signature = sig;
    }
    return;
  }

  if (
    itemType === 'function_call' ||
    itemType === 'commandExecution' ||
    itemType === 'local_shell_call' ||
    itemType === 'fileChange' ||
    itemType === 'custom_tool_call' ||
    itemType === 'web_search_call'
  ) {
    processToolCall(item, messages, getLastAssistant);
    return;
  }

  if (
    itemType === 'function_call_output' ||
    itemType === 'commandExecutionOutput' ||
    itemType === 'fileChangeOutput' ||
    itemType === 'custom_tool_call_output'
  ) {
    processToolOutput(item, messages);
    return;
  }
}

function processToolCall(
  item: Record<string, unknown>,
  messages: OpenAiChatMessage[],
  getLastAssistant: () => OpenAiChatMessage,
): void {
  const callId: string = String(item.call_id ?? '') || String(item.id ?? '') || makeId('call');
  let name: string | undefined = item.name === undefined ? undefined : String(item.name);
  const itemType: string | undefined = item.type === undefined ? undefined : String(item.type);

  if (!name) {
    if (itemType === 'commandExecution') {
      name = 'run_shell_command';
    } else if (itemType === 'local_shell_call') {
      name = 'local_shell_command';
    } else if (itemType === 'fileChange') {
      name = 'write_file';
    } else if (itemType === 'web_search_call') {
      name = 'web_search';
    }
  }

  let args: unknown =
    item.arguments ?? item.input ?? (isEmpty(item.arguments) && isEmpty(item.input) ? {} : {});
  if (isEmpty(args) && itemType === 'web_search_call') {
    args = item.action ?? {};
  }
  if (isEmpty(args)) {
    if (itemType === 'commandExecution') {
      args = {
        command: item.command ?? '',
        dir_path: item.cwd ?? '.',
      };
    } else if (itemType === 'local_shell_call') {
      // eslint-disable-next-line no-restricted-syntax -- Narrow unknown to Record
      const action = (item.action === undefined ? {} : item.action) as Record<string, unknown>;
      // eslint-disable-next-line no-restricted-syntax -- Narrow unknown to Record
      const execChild = (action.exec === undefined ? {} : action.exec) as Record<string, unknown>;
      args = {
        command: execChild.command ?? [],
        working_directory: execChild.working_directory,
      };
    } else if (itemType === 'fileChange') {
      const changes: Array<Record<string, unknown>> = Array.isArray(item.changes)
        ? item.changes
        : [];
      const path = changes[0]?.path ?? 'unknown';
      args = { file_path: path };
    }
  }

  const argsStr = typeof args === 'string' ? args : jsonStringifySafe(args ?? {});

  if (!name) {
    return;
  }

  const amsg = getLastAssistant();
  if (!amsg.tool_calls) {
    amsg.tool_calls = [];
  }
  amsg.tool_calls.push({
    id: callId,
    type: 'function',
    function: { name, arguments: argsStr },
  });

  const sig = item.thought_signature;
  const thought = item.thought;
  if (typeof sig === 'string' && sig) {
    amsg.thought_signature = sig;
  }
  if (typeof thought === 'string' && thought) {
    amsg.reasoning_content = (amsg.reasoning_content ?? '') + thought;
  }
  void messages;
}

function processToolOutput(item: Record<string, unknown>, messages: OpenAiChatMessage[]): void {
  const callId: string | undefined = item.call_id === undefined ? undefined : String(item.call_id);
  const outputRaw = item.output ?? item.content ?? item.stdout ?? '';

  let content = '';
  if (typeof outputRaw === 'string') {
    content = outputRaw;
  } else if (Array.isArray(outputRaw)) {
    for (const part of outputRaw) {
      if (typeof part === 'string') {
        content += part;
      } else if (part && typeof part === 'object') {
        const partItem: { type?: string; text?: string } = part;
        if (partItem.type === 'input_text' || partItem.type === 'text') {
          content += String(partItem.text ?? '');
        }
      }
    }
  } else if (outputRaw && typeof outputRaw === 'object') {
    // eslint-disable-next-line no-restricted-syntax -- Narrow object to Record
    const obj = outputRaw as Record<string, unknown>;
    content = String(obj.content ?? '');
    if (!content && obj.success === false) {
      content = 'Error: Tool execution failed';
    }
  }

  if (!content && typeof item.stderr === 'string' && item.stderr) {
    content = `Error: ${item.stderr}`;
  }

  messages.push({
    role: 'tool',
    tool_call_id: callId,
    content,
  });
}

// ==============================================================================
// Tool Mapping
// ==============================================================================
function mapTools(tools: ResponsesTool[]): OpenAiChatTool[] {
  /** If true, drop image/file parts from user messages (e.g. DeepSeek text-only models). */
  const out: OpenAiChatTool[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') {
      continue;
    }
    const tt = tool.type;
    if (tt === 'function') {
      const fn = tool.function;
      const name = fn?.name ?? tool.name;
      if (!name) {
        continue;
      }
      const params = fn?.parameters ?? tool.parameters ?? { type: 'object' };
      out.push({
        type: 'function',
        function: {
          name,
          description: fn?.description ?? tool.description ?? '',
          parameters: params,
        },
      });
      continue;
    }
  }
  return out;
}

function mapToolChoice(choice: ResponsesToolChoice): OpenAiChatToolChoice | undefined {
  if (choice == null) {
    return undefined;
  }
  if (choice === 'auto' || choice === 'required' || choice === 'none') {
    return choice;
  }
  if (typeof choice === 'object') {
    if (choice.type === 'function' && 'function' in choice && choice.function?.name) {
      return { type: 'function', function: { name: choice.function.name } };
    }
    return choice;
  }
  return undefined;
}

function isEmpty(value: unknown): boolean {
  if (value == null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length === 0;
  }
  return false;
}

/**
 * Reorder messages so that every `role: 'tool'` message immediately follows
 * the `role: 'assistant'` message that contains its matching `tool_call_id`.
 *
 * Codex Desktop sometimes injects a user message (e.g. a warning) between a
 * `function_call` and the corresponding `function_call_output`.  OpenAI Chat
 * format requires strict alternating: assistant (with tool_calls) → tool →
 * assistant → tool → …  This function repairs that ordering.
 */
function repairToolMessageOrder(messages: OpenAiChatMessage[]): void {
  if (messages.length === 0) {
    return;
  }

  // Phase 1: group messages by assistant "block".  A block starts at an
  // assistant message (possibly with tool_calls) and contains any subsequent
  // non-assistant messages until the next assistant message.
  interface Block {
    assistant: OpenAiChatMessage;
    trailing: OpenAiChatMessage[]; // user / tool / system messages after assistant
  }

  const blocks: Block[] = [];
  let currentBlock: Block | null = null;

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      currentBlock = { assistant: msg, trailing: [] };
      blocks.push(currentBlock);
    } else if (currentBlock) {
      currentBlock.trailing.push(msg);
    } else {
      // Message before any assistant (e.g. system) – keep as a standalone pseudo-block
      blocks.push({ assistant: { role: 'assistant', content: null }, trailing: [msg] });
    }
  }

  // Phase 2: for each block, sort trailing messages so that tool messages
  // whose tool_call_id matches one of the assistant's tool_calls come first.
  for (const block of blocks) {
    const toolCallIds = new Set(
      (block.assistant.tool_calls ?? []).map((tc) => tc.id).filter(Boolean),
    );
    if (toolCallIds.size === 0) {
      continue;
    }

    const tools: OpenAiChatMessage[] = [];
    const others: OpenAiChatMessage[] = [];
    for (const m of block.trailing) {
      if (
        m.role === 'tool' &&
        m.tool_call_id !== undefined &&
        toolCallIds.has(String(m.tool_call_id))
      ) {
        tools.push(m);
      } else {
        others.push(m);
      }
    }
    block.trailing = [...tools, ...others];
  }

  // Phase 3: flatten back into messages array
  messages.length = 0;
  for (const block of blocks) {
    if (block.assistant.tool_calls || block.assistant.content != null) {
      messages.push(block.assistant);
    }
    messages.push(...block.trailing);
  }
}
