export {
  createResponsesFetch,
  type CreateResponsesFetchOptions,
  type UpstreamFormat,
  type CacheStats,
} from '@codeproxy/core';

export type {
  ResponsesRequest,
  ResponsesResponse,
  ResponsesOutputItem,
  ResponsesOutputMessage,
  ResponsesOutputFunctionCall,
  ResponsesOutputReasoning,
  ResponsesStreamEvent,
  ResponsesUsage,
  ResponsesTool,
  ResponsesToolChoice,
  ResponsesInputItem,
  ResponsesContentPart,
} from '@codeproxy/core';

export type {
  AnthropicRequest,
  AnthropicResponse,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicStreamEvent,
  AnthropicTool,
  AnthropicToolChoice,
  AnthropicUsage,
} from '@codeproxy/core';

export type {
  OpenAiChatRequest,
  OpenAiChatResponse,
  OpenAiChatMessage,
  OpenAiChatTool,
  OpenAiChatToolCall,
  OpenAiChatStreamChunk,
} from '@codeproxy/core';

export { parseSseStream, encodeSseEvent, type SseMessage } from '@codeproxy/core';

export { startProxy, type StartProxyOptions, type RunningProxy } from './server/proxy.js';
